/**
 * The LLM boundary: one provider, one model, one temperature, one call.
 *
 * Everything the form understands from a spoken reply is understood by Gemini 3 Flash at
 * temperature 0. Both are CONSTANTS in this file, not settings - there is no env var that
 * swaps the model and none that moves the temperature, so "which model saw this patient's
 * words" has one answer that can be read off the source.
 *
 * `GEMINI_API_KEY` missing is not a crash and not a 500. `llmSettings()` returns null, the
 * route answers 503 with a message, and the patient taps or types instead - which is a
 * complete path through every question in the form.
 *
 * WHY GEMINI, AND WHY THIS MODEL
 * ------------------------------
 * Extraction ran on Claude Haiku 4.5 before this, chosen by measurement and pinned for the
 * same reasons. It was replaced because the Anthropic key stopped authenticating - a hard
 * `401 authentication_error`, which no amount of code can retry its way out of - and a
 * patient-facing form cannot wait on a credential.
 *
 * `gemini-3-flash-preview` was then probed the same way rather than adopted on faith,
 * against the account's own model list and this app's own prompt:
 *
 *   temperature: 0        accepted
 *   responseMimeType      honoured - returns bare JSON, no ```json fence to strip
 *   Hinglish probe        "din mein 6-7 ho jaati hai" -> "Moderate 5-10/day", correct
 *   unmentioned field     left null rather than guessed, which is the whole safety rule
 *   latency               2.8s for a full habits slice
 *
 * `-preview` in a pinned model id is worth naming as a known cost: a preview model can be
 * withdrawn. The pin is still right - an id that moves under a medical form is worse - and
 * the failure is loud rather than silent, because a withdrawn model answers 404, which
 * `isConfigError` turns into "auto-fill is off" instead of a retry loop.
 *
 * THE REQUEST SHAPE
 * -----------------
 * Plain `fetch` against the REST endpoint rather than the `@google/genai` SDK. This file
 * makes exactly one kind of call, with one model, and the SDK's value is the surface this
 * app does not use: streaming, tool calling, file uploads, chat sessions. The previous
 * provider's SDK was a dependency for one `messages.create`, and removing it took the
 * bundle nothing and cost nothing.
 *
 * `responseMimeType: "application/json"` is set because the API guarantees it, but
 * `parseModelJson()` still strips fences behind it - a parser you only trust on the happy
 * path is not a parser, and it is the most heavily tested thing in the app
 * (tests/extract.test.ts) precisely because it has always been the real guarantee.
 */

/**
 * The model. Pinned to the exact id rather than an alias, because an alias moves and a
 * medical form whose extraction behaviour changes under it without a code change is not
 * auditable.
 */
export const MODEL = "gemini-3-flash-preview";

/** Reproducible, always: the same reply must fill the same fields every time. */
export const TEMPERATURE = 0;

/**
 * Generous, because this model THINKS before it answers and both halves come out of the
 * same budget - and the thinking is the big half by a wide margin.
 *
 * Measured, which is the only reason this number is what it is:
 *
 *   slice                      output tokens   thinking tokens
 *   habits                     56              289
 *   products (5 rows x 4 cols) 153             1357
 *
 * The first version set 2048, reasoning about the output alone, and the fixture eval failed
 * two of twenty with "unparseable model output". The JSON was not malformed - it was cut
 * off mid-object, because thinking had eaten the budget before the answer was written. A
 * truncated object parses as nothing, so the patient would have seen "nothing in that reply
 * matched this question" for a reply the model understood perfectly.
 *
 * 8192 is headroom rather than a target: nothing is charged for a budget that is not used,
 * and the JSON shape caps the real output at a few hundred tokens regardless.
 */
export const MAX_TOKENS = 8192;

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface LlmSettings {
  apiKey: string;
}

/** Settings, or null when the key is missing. */
export function llmSettings(): LlmSettings | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return { apiKey };
}

/** The message shown to the patient when extraction is not configured. */
export const NO_PROVIDER_MESSAGE =
  "Auto-fill is off: set GEMINI_API_KEY in .env. You can still tap or type your answers.";

/** An HTTP failure from the provider, with the status kept so the route can classify it. */
export class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${status} ${detail}`.slice(0, 300));
    this.name = "LlmHttpError";
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/**
 * One extraction call. Returns the model's raw text.
 *
 * No retry and no parameter negotiation: the model is fixed and is known to accept every
 * parameter sent here, so a failure is a real failure - a revoked key, a network problem,
 * a timeout - and the caller's job is to fall back to tapping rather than to try again
 * with less.
 */
export async function callModel(
  settings: LlmSettings,
  system: string,
  user: string,
  timeoutMs = 28_000,
): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The header, not `?key=` in the URL: a query string ends up in access logs and
      // proxy caches, and this one is a credential.
      "x-goog-api-key": settings.apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      // One user turn and nothing after it.
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_TOKENS,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new LlmHttpError(res.status, (await res.text().catch(() => "")).slice(0, 300));
  }

  const body = (await res.json()) as GeminiResponse;
  const candidate = body.candidates?.[0];

  /*
    A cut-off answer is a FAILURE, not a string to hand onward.

    Truncated JSON parses as nothing, so passing it on surfaced as "unparseable model
    output" in the log and "nothing in that reply matched this question" on screen - which
    is a lie twice over: the model understood the reply, and the fault was our token
    budget. Named here, it costs one log line to diagnose instead of an afternoon.
  */
  if (candidate?.finishReason === "MAX_TOKENS") {
    const used = body.usageMetadata;
    throw new Error(
      `answer truncated at ${MAX_TOKENS} tokens ` +
        `(output ${used?.candidatesTokenCount ?? "?"}, thinking ${used?.thoughtsTokenCount ?? "?"})`,
    );
  }

  /*
    Parts joined rather than `parts[0].text` taken. A thinking model can return several
    parts, and taking the first one silently truncates a JSON object at whatever boundary
    the model happened to use.
  */
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * True when the failure is a configuration problem rather than a hiccup - a revoked key, a
 * key without access to this model, a model id that no longer exists.
 *
 * Worth separating because the two need opposite responses: a hiccup deserves "try again",
 * a config error deserves a log line loud enough that someone fixes the env var. Retrying
 * it just burns the patient's time. This is the distinction that turned an expired key from
 * "something went wrong, try again" into "auto-fill is off" - see the extract route.
 */
export function isConfigError(e: unknown): boolean {
  if (!(e instanceof LlmHttpError)) return false;
  return e.status === 400 || e.status === 401 || e.status === 403 || e.status === 404;
}

/** The provider's own words, for the server log only. Never shown to a patient. */
export function providerDetail(e: unknown): string {
  if (e instanceof LlmHttpError) return e.message;
  return e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
}

/**
 * What actually ran, for the eval banner. A benchmark that does not say which model
 * produced its number is not a benchmark - and here it also states the two facts the
 * feature promises: this model, this temperature, no others.
 */
export function describeSettings(_s: LlmSettings): string {
  return ["google", MODEL, `temp ${TEMPERATURE}`].join(" · ");
}
