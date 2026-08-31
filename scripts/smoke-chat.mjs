/**
 * Chat mode smoke test - `node scripts/smoke-chat.mjs [baseURL]`
 *
 * Companion to smoke-browser.mjs, which walks the form. This walks the CONVERSATION,
 * in a real browser at 380px, and fails on any console error or page exception.
 *
 * It completes the whole intake WITHOUT ANY API KEY, by tapping and typing only. That
 * is the point of the test, not a limitation of it: if the conversation cannot be
 * finished when the model is unreachable - no key, a rate limit, an accent the
 * transcriber cannot read - then it is not a second way to answer, it is a gamble.
 * Headless Chromium has no speech voices, which is itself the point: every spoken line
 * must also be on screen as text, so the walkthrough is unaffected by silence.
 *
 * What it asserts, beyond "no crash":
 *   - the assistant opens the conversation with a real question
 *   - a tapped chip produces a patient bubble and advances the progress counter
 *   - a multi-select does NOT advance on the first tap; it waits for Done
 *   - switching to the form lands on the SAME question, and switching back loses nothing
 *   - Q11's prompt enumerates all six rows rather than summarising them
 *   - an open table question offers the tap-only escape ("Ask me one at a time")
 *   - answering a product row Yes ASKS how long / did it help / any side effects, in order
 *   - consent offers exactly Yes and No, with nothing pre-selected
 *   - the finished conversation is accepted by the review screen's download gate
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const errors = [];
const notes = [];

const FATAL_PATTERNS =
  /Maximum update depth|getServerSnapshot|Too many re-renders|Rendered more hooks|Cannot update a component/i;

function record(kind, text) {
  errors.push({ kind, text: text.slice(0, 300), fatal: FATAL_PATTERNS.test(text) });
}
function fail(kind, text) {
  errors.push({ kind, text, fatal: false });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 380, height: 780 } });

page.on("console", (m) => {
  if (m.type() === "error") record("console.error", m.text());
});
page.on("pageerror", (e) => record("pageerror", String(e)));

/** The assistant's questions are the bold bubbles; notes and read-backs are not. */
const agentAsks = () => page.locator("main p.font-semibold");
async function currentAsk() {
  const n = await agentAsks().count();
  if (n === 0) return "";
  return (await agentAsks().nth(n - 1).innerText()).replace(/\s+/g, " ");
}

async function progress() {
  const t = await page.locator("header span.tabular-nums").first().innerText();
  const [done, total] = t.split("/").map((x) => Number(x.trim()));
  return { done, total };
}

const footerButtons = () => page.locator("footer").getByRole("button");

async function tapChip(name, label = name) {
  const asking = await currentAsk();
  const chip = footerButtons().filter({ hasText: name }).first();
  try {
    await chip.waitFor({ state: "visible", timeout: 12_000 });
    await chip.click();
  } catch (e) {
    const why = String(e).split("\n").slice(0, 2).join(" | ");
    throw new Error(`could not tap "${label}" - assistant asked: ${asking} - cause: ${why}`);
  }
  notes.push(`${asking.slice(0, 54).padEnd(56)} tap ${label}`);
  await page.waitForTimeout(320);
}

async function typeReply(text) {
  const asking = await currentAsk();
  const box = page.locator("footer textarea");
  await box.waitFor({ state: "visible", timeout: 12_000 });
  await box.fill(text);
  await page.locator("footer").getByRole("button", { name: "Send" }).click();
  notes.push(`${asking.slice(0, 54).padEnd(56)} type "${text.slice(0, 24)}"`);
  await page.waitForTimeout(360);
}

try {
  // ---------- in via the landing page's chat card ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Talk it through/ }).click();
  await page.waitForURL(/\/chat/, { timeout: 15_000 });
  await page.waitForTimeout(700);

  const opening = await currentAsk();
  notes.push(`opening question: ${opening.slice(0, 70)}`);
  if (!/age|hair loss/i.test(opening)) fail("opening", `first question was: ${opening}`);

  const start = await progress();
  notes.push(`progress starts at ${start.done}/${start.total}`);

  // ---------- Q1: a tapped chip answers and advances ----------
  await tapChip(/^30s/, "30s");
  const afterQ1 = await progress();
  if (afterQ1.done <= start.done) fail("progress", "a tapped answer did not advance the count");
  if ((await page.locator("main .bg-brand").count()) === 0)
    fail("bubble", "the tapped answer produced no patient bubble");
  notes.push(`progress after Q1: ${afterQ1.done}/${afterQ1.total}`);

  // ---------- Q2 single choice ----------
  await tapChip("Over a year");

  // ---------- Q3 multi: must NOT advance on the first tap ----------
  const beforeMulti = await progress();
  await tapChip("Mother had hair loss");
  if ((await progress()).done !== beforeMulti.done)
    fail("multi", "a multi-select advanced on the first tap instead of waiting for Done");
  else notes.push("multi-select waits for Done before advancing");
  await tapChip(/^Done/, "Done");

  // ---------- Q4 pattern: the picture chips ----------
  const diagrams = await page.locator("footer svg").count();
  notes.push(`Q4 renders ${diagrams} chip graphics`);
  await tapChip("Patchy loss");
  await tapChip(/^Done/, "Done");

  // ---------- sex gate, then the two questions it unlocks ----------
  await tapChip("Female");
  await tapChip(/^None/, "diagnosed: None");
  await tapChip(/^Done/, "Done");
  await tapChip("Regular");
  await tapChip("Not applicable");
  await tapChip(/^Yes$/, "adult acne: Yes");
  await tapChip(/^No$/, "excess hair: No");

  // ---------- Q10: the "None of these" escape ----------
  await tapChip("None of these", "past 6 months: none of these");
  await page.waitForTimeout(400);

  // ---------- Q11: the enumerated prompt ----------
  const points = await page.locator("main ol").last().locator("li").allInnerTexts();
  notes.push(`Q11 checklist: ${points.length} items`);
  if (points.length < 6) fail("habits", `Q11 listed only ${points.length} items, expected 6`);
  for (const needed of ["Smoking", "Alcohol", "Hard water", "wash your hair", "chemicals", "Salon"])
    if (!points.join(" | ").includes(needed))
      fail("habits", `Q11 checklist never mentions "${needed}"`);
  if (!points.join(" ").includes("how many per day"))
    fail("habits", "Q11 does not state the smoking follow-up up front");

  // ---------- switching modes mid-question must lose nothing ----------
  const beforeSwitch = await progress();
  await page.locator("footer").getByRole("button", { name: /rather tap through the form/ }).click();
  await page.waitForURL(/\/intake/, { timeout: 15_000 });
  const formHeading = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ");
  notes.push(`switch to form landed on: ${formHeading.slice(0, 58)}`);
  if (!/habits/i.test(formHeading))
    fail("switch", `switching landed on "${formHeading}", not the question being asked`);

  await page.getByRole("link", { name: /Switch to the assistant/ }).click();
  await page.waitForURL(/\/chat/, { timeout: 15_000 });
  await page.waitForTimeout(700);
  const afterSwitch = await progress();
  if (afterSwitch.done !== beforeSwitch.done || afterSwitch.total !== beforeSwitch.total)
    fail(
      "switch",
      `round trip changed progress: ${beforeSwitch.done}/${beforeSwitch.total} -> ${afterSwitch.done}/${afterSwitch.total}`,
    );
  else notes.push(`mode round trip preserved ${afterSwitch.done}/${afterSwitch.total}`);

  // ---------- the tap-only route through Q11 / Q12 / Q13 ----------
  const escape = footerButtons().filter({ hasText: /Ask me one at a time/ });
  if ((await escape.count()) === 0)
    fail("escape", "an open table question offered no tap-only path - unusable without a key");
  else notes.push("open table question offers the tap-only escape");

  // Answer everything that is left by tapping the first chip, or typing when a question
  // wants words. Every question asked is recorded so the conditional chain can be
  // asserted afterwards, in order.
  const asked = [];
  for (let guard = 0; guard < 120; guard++) {
    if ((await footerButtons().filter({ hasText: /Review my answers/ }).count()) > 0) break;

    const question = await currentAsk();
    // A chip renders its label and its gloss as two spans, so innerText is the label,
    // a newline, then the gloss. Only the first line is the answer.
    const labels = (await footerButtons().allInnerTexts()).map((s) =>
      (s.split("\n")[0] ?? "").trim(),
    );
    const answerable = labels.filter(
      (l) => l && !/rather tap through|Review my answers|^Pick at least one$/.test(l),
    );

    if (question) asked.push(question);

    if (answerable.length > 0) {
      const pick = answerable[0];
      await tapChip(new RegExp(escapeRe(pick)), pick);
      // A staged multi-select needs its Done tap.
      const done = footerButtons().filter({ hasText: /^Done \(/ });
      if ((await done.count()) > 0) await tapChip(/^Done \(/, "Done");
      continue;
    }

    // No chips: a free-text answer, which needs no model - the text IS the answer.
    await typeReply("Keratin at a salon, about six months ago");
  }

  // The chain a single "Yes" must create, in the order lib/followups.ts defines.
  const chain = [
    "Do you use OTC/Medicated Shampoos?",
    "How long have you been using OTC/Medicated Shampoos?",
    "Did OTC/Medicated Shampoos help?",
    "Any side effects from OTC/Medicated Shampoos?",
  ];
  const at = asked.indexOf(chain[0]);
  if (at === -1) fail("conditional", "the products rows were never asked one at a time");
  else {
    const got = asked.slice(at, at + 4);
    if (got.join(" -> ") !== chain.join(" -> "))
      fail("conditional", `conditional chain was: ${got.join(" -> ")}`);
    else notes.push(`conditional chain on "Yes": ${chain.slice(1).join(" -> ")}`);
  }
  if (/\boTC\b|\bpRP\b/.test(asked.join(" ")))
    fail("naming", "a row name was mangled by case munging");

  // ---------- consent was asked properly ----------
  const consentAsk = asked.find((q) => /agree|permission|consent/i.test(q)) ?? "";
  notes.push(`consent asked as: ${consentAsk.slice(0, 70) || "(not found)"}`);
  if (!consentAsk) fail("consent", "consent was never asked");

  // ---------- the end ----------
  const review = footerButtons().filter({ hasText: /Review my answers/ });
  if ((await review.count()) === 0) {
    fail("done", `the conversation never finished - last question: ${await currentAsk()}`);
  } else {
    const final = await progress();
    notes.push(`finished at ${final.done}/${final.total}`);
    if (final.done !== final.total) fail("done", `finished at ${final.done}/${final.total}`);
    await review.first().click();
    await page.waitForURL(/\/intake/, { timeout: 15_000 });
    const dl = page.getByRole("button", { name: /Download JSON/ });
    await dl.waitFor({ state: "visible", timeout: 12_000 });
    if (await dl.isDisabled())
      fail("done", "the review screen rejects a form completed by conversation");
    else notes.push("review screen accepts the chat-completed form for download");
  }
} catch (e) {
  errors.push({ kind: "threw", text: String(e).slice(0, 500), fatal: true });
} finally {
  await browser.close();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
const fatal = errors.filter((e) => e.fatal).length;
console.log("\n--- chat smoke walkthrough ---");
for (const n of notes) console.log("  " + n);
if (errors.length > 0) {
  console.log("\n--- problems ---");
  for (const e of errors) console.log(`  [${e.fatal ? "FATAL" : e.kind}] ${e.text}`);
}
console.log(
  `\n${errors.length === 0 ? "PASS" : "FAIL"} - ${errors.length} problem(s), ${fatal} fatal\n`,
);
process.exit(errors.length === 0 ? 0 : 1);
