/**
 * Live extraction eval - `npm run eval` (needs NVIDIA_API_KEY).
 *
 * This is the honest answer to "how did you verify the fill". It is deliberately NOT
 * part of `npm test`, because an LLM is not deterministic and a flaky red build
 * teaches a team to ignore red builds.
 *
 * Scoring is TOLERANT on purpose, in two specific ways:
 *
 *  1. Only fields the transcript actually MENTIONS are compared. A fixture that says
 *     nothing about hard water does not penalise the model for leaving it null - that
 *     is the correct behaviour, and `expectUnfilled` asserts it explicitly.
 *  2. Rows listed under `unmentionedRows` must be ABSENT from the patch. This catches
 *     the most dangerous failure mode in a medical intake: the model helpfully
 *     marking "Hair Transplant: used = false" when nobody said anything about it.
 *
 * Every run also asserts the strict thing: the patch must be legal against the slice,
 * so no fixture can pass with an off-schema value.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import {
  SLICES,
  SYSTEM_PROMPT,
  buildUserMessage,
  extractFromModelText,
  isVoiceKey,
  modelConfig,
  type ExtractResult,
} from "../lib/extractPrompt";

interface Fixture {
  id: string;
  questionKey: string;
  note?: string;
  transcript: string;
  expected: Record<string, unknown>;
  expectUnfilled?: string[];
  unmentionedRows?: string[];
  describeMustMention?: string[];
}

const DIR = path.join(process.cwd(), "fixtures", "patients");
const RUNS = Number(process.env.EVAL_RUNS ?? 1);

function loadFixtures(): Fixture[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Fixture);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One call, with a single retry. The free NVIDIA tier cold-starts and throttles, so a
 * lone timeout says nothing about extraction quality - retrying once keeps the score
 * about the model's answers rather than about the queue depth.
 */
async function callModel(client: OpenAI, key: string, transcript: string): Promise<string> {
  const params = {
    ...modelConfig(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(SLICES[key as never], transcript) },
    ],
  } as Parameters<typeof client.chat.completions.create>[0];

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.chat.completions.create(params, { timeout: 60_000 });
      if ("choices" in res) return res.choices[0]?.message?.content ?? "";
      return "";
    } catch (e) {
      lastErr = e;
      if (attempt === 1) await sleep(2_000);
    }
  }
  throw lastErr;
}

interface Check {
  ok: boolean;
  label: string;
}

/** Compare only the leaf fields the fixture pins; everything else is ignored. */
function compare(expected: unknown, actual: unknown, pathStr: string, out: Check[]) {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const actualObj =
      actual !== null && typeof actual === "object" ? (actual as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
      compare(v, actualObj[k], pathStr ? `${pathStr}.${k}` : k, out);
    }
    return;
  }
  const same = JSON.stringify(expected) === JSON.stringify(actual);
  out.push({
    ok: same,
    label: `${pathStr} = ${JSON.stringify(actual)}${same ? "" : ` (want ${JSON.stringify(expected)})`}`,
  });
}

function scoreOne(fx: Fixture, result: ExtractResult): Check[] {
  const checks: Check[] = [];
  compare(fx.expected, result.patch, "", checks);

  // The dangerous failure mode: inventing a "no" for a row nobody mentioned.
  for (const row of fx.unmentionedRows ?? []) {
    const table = (result.patch as Record<string, Record<string, unknown>>)[fx.questionKey] ?? {};
    const present = Object.prototype.hasOwnProperty.call(table, row);
    checks.push({ ok: !present, label: `"${row}" left untouched${present ? " - INVENTED" : ""}` });
  }

  for (const field of fx.expectUnfilled ?? []) {
    const has = result.unfilled.includes(field);
    checks.push({ ok: has, label: `flagged unfilled: ${field}${has ? "" : " - MISSING"}` });
  }

  for (const word of fx.describeMustMention ?? []) {
    const text = String(
      (result.patch as { past_treatment_describe?: string }).past_treatment_describe ?? "",
    ).toLowerCase();
    const has = text.includes(word.toLowerCase());
    checks.push({ ok: has, label: `describe mentions "${word}"${has ? "" : " - LOST"}` });
  }

  return checks;
}

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error(
      "NVIDIA_API_KEY is not set.\n" +
        "This eval calls a live model on purpose - the deterministic checks are in\n" +
        "`npm test`, which needs no key. Set the key (see .env.example) to run it.",
    );
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  });

  const fixtures = loadFixtures();
  const cfg = modelConfig();
  console.log(
    `\nExtraction eval - ${fixtures.length} fixtures x ${RUNS} run(s)\n` +
      `model: ${cfg.model}   temp: ${cfg.temperature}` +
      `${cfg.reasoning_effort ? `   reasoning: ${cfg.reasoning_effort}` : ""}\n`,
  );

  let passedChecks = 0;
  let totalChecks = 0;
  let hardFailures = 0;

  for (const fx of fixtures) {
    if (!isVoiceKey(fx.questionKey)) {
      console.log(`SKIP ${fx.id} - ${fx.questionKey} is not a voice question`);
      continue;
    }

    for (let run = 1; run <= RUNS; run++) {
      const tag = RUNS > 1 ? `${fx.id} #${run}` : fx.id;
      await sleep(400); // be a good citizen on a free shared endpoint
      let raw = "";
      try {
        raw = await callModel(client, fx.questionKey, fx.transcript);
      } catch (e) {
        console.log(`\x1b[31mERROR\x1b[0m ${tag} - model call failed: ${String(e).slice(0, 120)}`);
        hardFailures++;
        continue;
      }

      const result = extractFromModelText(fx.questionKey, raw);
      if (result === null) {
        // Unparseable output is a hard failure: the schema gate did its job, but the
        // patient got nothing auto-filled.
        console.log(`\x1b[31mUNPARSEABLE\x1b[0m ${tag} - ${raw.slice(0, 100).replace(/\n/g, " ")}`);
        hardFailures++;
        continue;
      }

      const checks = scoreOne(fx, result);
      const ok = checks.filter((c) => c.ok).length;
      passedChecks += ok;
      totalChecks += checks.length;

      const allOk = ok === checks.length;
      console.log(
        `${allOk ? "\x1b[32mPASS\x1b[0m" : "\x1b[33mPART\x1b[0m"} ${tag}  ${ok}/${checks.length}`,
      );
      if (!allOk) {
        for (const c of checks.filter((x) => !x.ok)) console.log(`       ✗ ${c.label}`);
      }
    }
  }

  const pct = totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100);
  console.log(
    `\nfield accuracy: ${passedChecks}/${totalChecks} (${pct}%)` +
      `\nhard failures:  ${hardFailures}` +
      `\n\nNote: every patch above was validated against its schema slice before scoring,\n` +
      `so a passing field is on-schema by construction. Off-schema values are dropped\n` +
      `and surface as a missing field, never as a bad value in the output.\n`,
  );

  // Non-zero only on hard failures (no output at all), never on partial accuracy - // this is a measurement, not a gate.
  process.exit(hardFailures > 0 ? 1 : 0);
}

void main();
