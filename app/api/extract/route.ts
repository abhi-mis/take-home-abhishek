/**
 * POST /api/extract  { questionKey, transcript } -> { patch, unfilled }
 *
 * The one place NVIDIA_API_KEY exists, and the boundary the model's output has to get
 * past before it can touch a patient's answers.
 *
 * Three defences, in order:
 *   1. `questionKey` must be one of the four voice-enabled keys, so a caller cannot
 *      ask the model to fill consent or sample_type.
 *   2. the model is shown ONE schema slice and nothing else, at temperature 0.
 *   3. whatever comes back is fence-stripped, JSON-parsed, Zod-validated against that
 *      slice, and reduced to allowed fields only. Off-schema values are dropped, not
 *      coerced - a wrong option string in a medical intake is worse than a blank.
 *
 * Fields the transcript did not mention come back in `unfilled` so the UI can ask for
 * a tap. The model is never allowed to guess to fill a gap.
 */
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  SLICES,
  SYSTEM_PROMPT,
  buildUserMessage,
  extractFromModelText,
  isVoiceKey,
  modelConfig,
} from "@/lib/extractPrompt";

export const runtime = "nodejs";
// Measured on the free NVIDIA tier: 8-19s per call depending on slice size. 30s of
// headroom keeps the worst case (the 4-column products table) inside the budget.
export const maxDuration = 60;

export async function POST(req: Request) {
  const key = process.env.NVIDIA_API_KEY;
  const baseURL = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const model = modelConfig().model;

  if (!key) {
    return NextResponse.json(
      { error: "Auto-fill is off: NVIDIA_API_KEY is not set. Tap the answers below instead." },
      { status: 503 },
    );
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
  const client = new OpenAI({ apiKey: key, baseURL });

  try {
    const res = await client.chat.completions.create(
      {
        ...modelConfig(),
        model, // env override wins, so a retired catalog ID is a config fix not a deploy
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(slice, transcript) },
        ],
      } as OpenAI.ChatCompletionCreateParamsNonStreaming,
      { timeout: 28_000 },
    );

    const text = res.choices[0]?.message?.content ?? "";
    const result = extractFromModelText(questionKey, text);

    if (result === null) {
      // The model produced something unparseable. The patient still has the grid, so
      // this is a soft failure, not a 500.
      console.warn("[extract] unparseable output", { questionKey, sample: text.slice(0, 200) });
      return NextResponse.json({
        patch: {},
        unfilled: [],
        note: "Model output could not be parsed - tap fallback in use.",
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[extract]", e);
    return NextResponse.json(
      { error: "Auto-fill failed. Tap the answers below instead." },
      { status: 502 },
    );
  }
}
