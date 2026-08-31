/**
 * The LLM boundary: one provider, one model, one call.
 *
 * Extraction runs on Anthropic (Claude). There is no second provider and no adapter
 * layer, on purpose - an abstraction whose only job is to make a swap easy is a cost you
 * pay every day for a decision you make once. Everything model-specific is in this file,
 * so the swap stays cheap without pretending to be pluggable: the route, the eval and
 * the tests only ever call `callModel()`.
 *
 * `ANTHROPIC_API_KEY` missing is not a crash and not a 500. `llmSettings()` returns null,
 * the route answers 503 with a message, and the patient taps or types instead - which is
 * a complete path through every question in both modes.
 *
 * THE REQUEST SHAPE, MEASURED RATHER THAN ASSUMED
 * ----------------------------------------------
 * Probed against this account's own model list:
 *
 *   model                      temperature   assistant prefill   plain output
 *   claude-sonnet-5            rejected      rejected            bare JSON
 *   claude-opus-4-8            rejected      rejected            bare JSON
 *   claude-sonnet-4-6          accepted      rejected            ```json fenced
 *   claude-haiku-4-5-*         accepted      accepted            ```json fenced
 *
 * That table is why the default model is haiku-4-5: it is the one that accepts
 * `temperature: 0`, and reproducibility is not a nice-to-have on a medical form - the
 * same reply must fill the same fields every time or the output cannot be audited. It
 * also measured fastest of the four (1.1-1.3s versus 1.9s), which matters on a screen
 * where a patient is watching a spinner.
 *
 * Assistant prefill is NOT used even though haiku-4-5 accepts it. It would buy bare JSON
 * instead of a ```json fence, and `parseModelJson()` already strips fences - so it would
 * buy nothing while quietly breaking the moment someone sets ANTHROPIC_MODEL to a newer
 * model. JSON is guaranteed by the system prompt plus that parser, which is the most
 * heavily tested thing in the app (tests/extract.test.ts) precisely because it has
 * always been the real guarantee.
 *
 * And because model APIs keep moving, an unsupported parameter is handled rather than
 * fatal: switching ANTHROPIC_MODEL to claude-sonnet-5 works, because `temperature` is
 * dropped and remembered on the first 400. See `callModel()`.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface LlmSettings {
  apiKey: string;
  /** undefined for api.anthropic.com - the SDK's own default is correct. */
  baseURL: string | undefined;
  model: string;
  maxTokens: number;
  /** Dropped automatically if the configured model rejects it. */
  temperature: number | undefined;
}

/**
 * Haiku 4.5: fastest of the models measured (1.1-1.3s for a full habits slice), the
 * cheapest, and the one that still accepts `temperature: 0`. It got every field of the
 * Hinglish probe right - "main roz 6 cigarette peeta hoon" to `Moderate 5-10/day` - which
 * is the whole job here. Extraction against one schema slice is a narrow task; a larger
 * model would cost more and wait longer for the same answer.
 */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Reproducible by default: the same reply must always fill the same fields. */
const DEFAULT_TEMPERATURE = 0;

/** Enough that a fully-populated 5-row table is never truncated mid-JSON. */
const MAX_TOKENS = 900;

/** Settings, or null when the key is missing. */
export function llmSettings(): LlmSettings | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const rawTemp = process.env.ANTHROPIC_TEMPERATURE?.trim();
  const temp = rawTemp === undefined || rawTemp === "" ? DEFAULT_TEMPERATURE : Number(rawTemp);

  return {
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: MAX_TOKENS,
    // A non-numeric value is ignored rather than sent: NaN would be a 400, and a typo in
    // an env var should not take extraction down.
    temperature: temp !== undefined && Number.isFinite(temp) ? temp : undefined,
  };
}

/** The message shown to the patient when extraction is not configured. */
export const NO_PROVIDER_MESSAGE =
  "Auto-fill is off: set ANTHROPIC_API_KEY in .env. You can still tap or type your answers.";

/**
 * Errors that mean "this model does not accept that parameter", as opposed to "your
 * request is wrong". The distinction matters because the first kind is recoverable by
 * sending less, and the second is not recoverable at all.
 */
const UNSUPPORTED_PARAM = /is deprecated for this model|does not support|unsupported/i;

/**
 * Models known to have rejected `temperature`, learned at runtime and remembered for the
 * life of the process.
 *
 * This exists because of a bug that reached the browser as a bare 502: the request
 * carried `temperature: 0`, the current models answer `400 temperature is deprecated for
 * this model`, and the route turned that into "Auto-fill failed". One wasted round trip
 * to discover a permanent fact about a model is acceptable; making that discovery on
 * every single question is not, and neither is a hardcoded table of model ids that goes
 * stale the week after it is written.
 */
const rejectsTemperature = new Set<string>();

/**
 * One extraction call. Returns the model's raw text.
 *
 * If the model refuses an optional parameter, the parameter is dropped, remembered, and
 * the call retried once - so a model change becomes a 400 in a log line rather than a
 * broken feature in front of a patient.
 */
export async function callModel(
  settings: LlmSettings,
  system: string,
  user: string,
  timeoutMs = 28_000,
): Promise<string> {
  const client = new Anthropic({ apiKey: settings.apiKey, baseURL: settings.baseURL });

  const send = async (withTemperature: boolean): Promise<string> => {
    const res = await client.messages.create(
      {
        model: settings.model,
        max_tokens: settings.maxTokens,
        ...(withTemperature && settings.temperature !== undefined
          ? { temperature: settings.temperature }
          : {}),
        system,
        // One user turn, and nothing after it. See the note on prefill above: the JSON
        // contract is carried by the system prompt and enforced by parseModelJson().
        messages: [{ role: "user", content: user }],
      },
      { timeout: timeoutMs },
    );
    return res.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  };

  const wantsTemperature =
    settings.temperature !== undefined && !rejectsTemperature.has(settings.model);

  try {
    return await send(wantsTemperature);
  } catch (e) {
    if (!wantsTemperature || !isUnsupportedParam(e)) throw e;
    console.warn(
      `[llm] ${settings.model} rejected temperature; retrying without it and remembering.`,
    );
    rejectsTemperature.add(settings.model);
    return await send(false);
  }
}

function isUnsupportedParam(e: unknown): boolean {
  if (e instanceof Anthropic.APIError) {
    return e.status === 400 && UNSUPPORTED_PARAM.test(e.message);
  }
  return false;
}

/**
 * True when the failure is a configuration problem rather than a hiccup - a model id
 * that does not exist, a revoked key, a parameter this model will never accept.
 *
 * Worth separating because the two need opposite responses: a hiccup deserves "try
 * again", a config error deserves a log line loud enough that someone fixes the env var.
 * Retrying it just burns the patient's time.
 */
export function isConfigError(e: unknown): boolean {
  if (!(e instanceof Anthropic.APIError)) return false;
  return e.status === 400 || e.status === 401 || e.status === 403 || e.status === 404;
}

/** The provider's own words, for the server log only. Never shown to a patient. */
export function providerDetail(e: unknown): string {
  if (e instanceof Anthropic.APIError) return `${e.status} ${e.message}`.slice(0, 300);
  return e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
}

/**
 * What actually ran, for the eval banner. A benchmark that does not say which model
 * produced its number is not a benchmark.
 */
export function describeSettings(s: LlmSettings): string {
  const sampling =
    s.temperature === undefined || rejectsTemperature.has(s.model)
      ? "model default sampling"
      : `temp ${s.temperature}`;
  return ["anthropic", s.model, sampling].join(" · ");
}
