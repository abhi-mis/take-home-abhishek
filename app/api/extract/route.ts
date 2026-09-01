/**
 * POST /api/extract  { questionKey, transcript } -> { patch, unfilled, none? }
 *
 * The one place the LLM key exists, and the boundary the model's output has to get past
 * before it can touch a patient's answers.
 *
 * Four defences, in order:
 *   1. `questionKey` must be one of the four voice-enabled keys, so a caller cannot ask
 *      the model to fill consent or sample_type.
 *   2. the model is shown ONE schema slice and nothing else, at temperature 0.
 *   3. the assistant turn is PREFILLED with an opening brace, so the model is continuing
 *      a JSON object rather than starting a message - no preamble, no code fence. The
 *      fence-stripping parser still runs behind it, because a parser you only trust on
 *      the happy path is not a parser.
 *   4. whatever comes back is JSON-parsed, Zod-validated against that slice, and
 *      reduced to allowed fields only. Off-schema values are dropped, not coerced - a
 *      wrong option string in a medical intake is worse than a blank.
 *
 * Fields the reply did not mention come back in `unfilled` so the UI can ask again.
 * The model is never allowed to guess to fill a gap.
 */
import { NextResponse } from "next/server";
import {
  SLICES,
  SYSTEM_PROMPT,
  buildUserMessage,
  extractFromModelText,
  isVoiceKey,
} from "@/lib/extractPrompt";
import {
  NO_PROVIDER_MESSAGE,
  callModel,
  isConfigError,
  llmSettings,
  providerDetail,
} from "@/lib/llm";

export const runtime = "nodejs";
// Claude answers a single slice in a couple of seconds. The generous ceiling is for the
// worst case - the 4-column products table behind a slow mobile connection - and the
// client gives up at 28s regardless (see callModel), so this is headroom, not a target.
export const maxDuration = 60;

export async function POST(req: Request) {
  const settings = llmSettings();
  if (settings === null) {
    // A missing key is a config problem, not a patient problem: say so plainly so the
    // UI can fall back to tapping instead of showing a generic failure.
    return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 503 });
  }

  let body: { questionKey?: string; transcript?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { questionKey, transcript } = body;
  if (!questionKey || !isVoiceKey(questionKey))
    return NextResponse.json({ error: "Unknown or non-voice questionKey" }, { status: 400 });
  if (!transcript || transcript.trim().length < 2)
    return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
  if (transcript.length > 4000)
    return NextResponse.json({ error: "Transcript too long" }, { status: 413 });

  const slice = SLICES[questionKey];

  try {
    const text = await callModel(settings, SYSTEM_PROMPT, buildUserMessage(slice, transcript));
    const result = extractFromModelText(questionKey, text);

    if (result === null) {
      // The model produced something unparseable. The patient can still tap or type,
      // so this is a soft failure, not a 500.
      console.warn("[extract] unparseable output", {
        provider: "anthropic",
        questionKey,
        sample: text.slice(0, 200),
      });
      return NextResponse.json({
        patch: {},
        unfilled: [],
        note: "Model output could not be parsed - tap fallback in use.",
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[extract] anthropic", e);
    return NextResponse.json(
      { error: "Auto-fill failed. You can tap or type the answer instead." },
      { status: 502 },
    );
  }
}
