/**
 * POST /api/transcribe - multipart audio -> { transcript }
 *
 * A thin proxy whose only real job is to be the one place SARVAM_API_KEY exists.
 * The client never sees it, and it is never in the repo.
 *
 * Why Sarvam: the patients here speak Hinglish and Indian-accented English, which is
 * where the big western STT models degrade first. Sarvam's Saaras is trained for
 * exactly that, and `mode=codemix` returns mixed Hindi/English in Roman script - * which is also the easiest thing for the extraction model to read.
 *
 * Contract verified against docs.sarvam.ai (Aug 2026): POST https://api.sarvam.ai/
 * speech-to-text, header `api-subscription-key`, multipart fields file/model/mode,
 * response { request_id, transcript, language_code }.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SARVAM_URL = "https://api.sarvam.ai/speech-to-text";
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const sarvamKey = process.env.SARVAM_API_KEY;

  if (!sarvamKey) {
    // A missing key is a config problem, not a patient problem - say so clearly so
    // the UI can fall back to tapping or typing instead of a generic failure.
    return NextResponse.json(
      {
        error:
          "Voice input is off: SARVAM_API_KEY is not set. You can still tap or type your answers.",
      },
      { status: 503 },
    );
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  if (!audio) return NextResponse.json({ error: "No audio uploaded" }, { status: 400 });
  if (audio.size === 0) return NextResponse.json({ error: "Empty audio" }, { status: 400 });
  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });

  const upstream = new FormData();
  // The client always sends 16kHz mono WAV (see lib/audio.ts), so the format Sarvam
  // receives is fixed regardless of which browser recorded it.
  upstream.append("file", audio, "reply.wav");
  upstream.append("model", process.env.SARVAM_MODEL ?? "saaras:v3");
  upstream.append("mode", process.env.SARVAM_MODE ?? "codemix");

  try {
    const res = await fetch(SARVAM_URL, {
      method: "POST",
      headers: { "api-subscription-key": sarvamKey },
      body: upstream,
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[transcribe] sarvam", res.status, detail.slice(0, 300));
      return NextResponse.json(
        { error: "Could not understand the audio. You can tap or type instead." },
        { status: 502 },
      );
    }

    const json = (await res.json()) as { transcript?: string };
    return NextResponse.json({ transcript: (json.transcript ?? "").trim() });
  } catch (e) {
    console.error("[transcribe]", e);
    return NextResponse.json({ error: "Transcription timed out" }, { status: 504 });
  }
}
