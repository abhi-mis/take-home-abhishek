/**
 * The LLM boundary: which provider, which model, and one function that calls it.
 *
 * Extraction runs on **Anthropic** (Claude). NVIDIA NIM is kept as an alternative
 * because the brief named it and it costs almost nothing to keep - NIM speaks the
 * OpenAI wire format, so the `openai` SDK covers it. Everything provider-specific lives
 * in this file: `callModel()` takes a system prompt and a user message and returns raw
 * text, so the route, the eval and the tests are identical whichever provider answered.
 *
 * Provider selection, in order:
 *   1. EXTRACT_PROVIDER=anthropic|nvidia, if set (explicit wins, always)
 *   2. ANTHROPIC_API_KEY present  -> anthropic
 *   3. NVIDIA_API_KEY present     -> nvidia
 *   4. neither                    -> null, and the caller returns 503 with a message
 *      telling the patient to tap instead. A missing key is never a crash.
 *
 * Keys are read from `process.env` inside route handlers and the eval script only. This
 * module must never be imported from a component.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "anthropic" | "nvidia";

export interface LlmSettings {
  provider: Provider;
  apiKey: string;
  /** undefined for Anthropic proper - the SDK's own default is correct. */
  baseURL: string | undefined;
  model: string;
  maxTokens: number;
  /** NIM reasoning models only. Omitted entirely when not applicable. */
  reasoningEffort: string | undefined;
}

/**
 * claude-sonnet-5 for extraction. Reading loose Hinglish prose into a fixed schema is
 * exactly where a stronger model earns its keep, and at these prompt sizes (one schema
 * slice, one reply) the cost per intake is negligible. Set ANTHROPIC_MODEL to
 * claude-haiku-4-5-20251001 to trade a little accuracy for latency and price.
 */
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";
const NVIDIA_DEFAULT_MODEL = "openai/gpt-oss-20b";
const NVIDIA_DEFAULT_BASE = "https://integrate.api.nvidia.com/v1";

/** Enough that a fully-populated 5-row table is never truncated mid-JSON. */
const MAX_TOKENS = 900;

/**
 * The one trick that makes JSON reliable on the Anthropic API.
 *
 * Rather than asking for JSON and hoping, the assistant turn is PREFILLED with an
 * opening brace, so the model is physically continuing a JSON object rather than
 * starting a message. No preamble, no code fence, no "Here is the JSON:". The brace is
 * added back to the response before parsing, since the API returns only what it
 * generated after the prefill.
 */
const JSON_PREFILL = "{";

/**
 * NIM's o-series and gpt-5 style models reject `temperature`, spend tokens on hidden
 * reasoning, and take `max_completion_tokens` instead of `max_tokens`. Detecting that
 * from the model id is ugly but it is the only signal available, and getting it wrong is
 * a hard 400.
 */
function isReasoningModel(model: string): boolean {
  return /(^|\/)(o\d|gpt-5)/.test(model);
}

export function resolveProvider(): Provider | null {
  const forced = process.env.EXTRACT_PROVIDER?.trim().toLowerCase();
  if (forced === "anthropic" || forced === "nvidia") return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  return null;
}

/** Settings for the active provider, or null when its key is missing. */
export function llmSettings(): LlmSettings | null {
  const provider = resolveProvider();
  if (provider === null) return null;

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
      model: process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL,
      maxTokens: MAX_TOKENS,
      reasoningEffort: undefined,
    };
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  const effort = process.env.NVIDIA_REASONING_EFFORT?.trim() || "low";
  return {
    provider,
    apiKey,
    baseURL: process.env.NVIDIA_BASE_URL?.trim() || NVIDIA_DEFAULT_BASE,
    model: process.env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL,
    maxTokens: MAX_TOKENS,
    // "none" is the escape hatch for a NIM model that rejects the field outright.
    reasoningEffort: effort === "none" ? undefined : effort,
  };
}

/** The message shown to the patient when no provider is configured. */
export const NO_PROVIDER_MESSAGE =
  "Auto-fill is off: set ANTHROPIC_API_KEY in .env. You can still tap or type your answers.";

/**
 * One call, whichever provider is configured. Returns the model's raw text.
 *
 * Temperature 0 everywhere it is accepted: the same reply must always fill the same
 * fields, or a medical form stops being reproducible.
 */
export async function callModel(
  settings: LlmSettings,
  system: string,
  user: string,
  timeoutMs = 28_000,
): Promise<string> {
  if (settings.provider === "anthropic") {
    const client = new Anthropic({ apiKey: settings.apiKey, baseURL: settings.baseURL });
    const res = await client.messages.create(
      {
        model: settings.model,
        max_tokens: settings.maxTokens,
        temperature: 0,
        system,
        messages: [
          { role: "user", content: user },
          { role: "assistant", content: JSON_PREFILL },
        ],
      },
      { timeout: timeoutMs },
    );
    const text = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    // The prefill is not echoed back, so put it back before anyone tries to parse it.
    return JSON_PREFILL + text;
  }

  const client = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseURL });
  const res = await client.chat.completions.create(nimParams(settings, system, user), {
    timeout: timeoutMs,
  });
  return res.choices[0]?.message?.content ?? "";
}

/**
 * The NIM request body.
 *
 * Exported for the tests, which assert the two shape traps that are hard 400s in
 * production and invisible otherwise: temperature on a reasoning model, and
 * max_tokens where max_completion_tokens is wanted. The SDK's published types lag the
 * catalog's accepted fields, so the extra keys go through one narrow cast, not `any`.
 */
export function nimParams(
  settings: LlmSettings,
  system: string,
  user: string,
): OpenAI.ChatCompletionCreateParamsNonStreaming {
  const reasoning = isReasoningModel(settings.model);
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(reasoning
      ? { max_completion_tokens: settings.maxTokens }
      : { temperature: 0, max_tokens: settings.maxTokens }),
    ...(settings.reasoningEffort ? { reasoning_effort: settings.reasoningEffort } : {}),
  };
  return body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming;
}

/**
 * What actually ran, for the eval banner. A benchmark that does not say which model
 * produced its number is not a benchmark.
 */
export function describeSettings(s: LlmSettings): string {
  const bits = [s.provider, s.model, "temp 0"];
  if (s.provider === "anthropic") bits.push("JSON prefill");
  if (s.reasoningEffort) bits.push(`reasoning_effort: ${s.reasoningEffort}`);
  return bits.join(" · ");
}
