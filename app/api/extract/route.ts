/**
 * POST /api/extract  { questionKey, transcript } -> { patch, meta?, noneOf?, unfilled }
 *
 * The one place the LLM key exists, and the boundary the model's output has to get past
 * before it can touch a patient's answers.
 *
 * Four defences, in order:
 *   1. `questionKey` must be one of the voice-enabled keys - every question except
 *      `consent`, which is absent from that list on purpose and must never be added. A
 *      patient agreeing to a genetic test says so by pressing the word "Yes", not by
 *      saying something a transcriber and then a model both had to guess at.
 *   2. the model is shown ONE schema slice and nothing else, at temperature 0.
 *   3. whatever comes back is JSON-parsed, Zod-validated against that slice, and reduced
 *      to allowed fields only. Off-schema values are dropped, not coerced - a wrong option
 *      string in a medical intake is worse than a blank.
 *   4. the About You slice writes to `meta`, a field of its own, because `patch` becomes
 *      the downloaded answers and nothing outside the 16 may be able to reach it.
 *
 * Fields the reply did not mention come back in `unfilled` so the UI can ask again. The
 * model is never allowed to guess to fill a gap.
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
    /*
      Two failures, two answers, and the distinction is about whether trying again could
      ever help.

      A revoked key, a key without access to this model, a model id that does not exist:
      none of those come right by retrying, which makes them the same thing as no key at
      all. So they answer 503, and the client latches the microphone off and says "not set
      up on this device" instead of inviting the patient to fail again. That case is real -
      it is what an expired key looks like, and the first version of this reported it as a
      hiccup and offered a retry button.

      Anything else - a timeout, a 500, a dropped connection - is worth another try.

      Both reach the LOG differently from each other, because a config error is somebody's
      job and a line that says only "auto-fill failed" is a whole afternoon.
    */
    if (isConfigError(e)) {
      console.error("[extract] CONFIG - auto-fill is off until this is fixed:", providerDetail(e));
      return NextResponse.json({ error: NO_PROVIDER_MESSAGE }, { status: 503 });
    }
    console.error("[extract] gemini", providerDetail(e));
    return NextResponse.json(
      { error: "Auto-fill failed. You can tap or type the answer instead." },
      { status: 502 },
    );
  }
}
