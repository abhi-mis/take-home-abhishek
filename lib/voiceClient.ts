"use client";

/**
 * The two network calls behind the microphone, and the mapping from every way they can
 * fail to something a patient can act on.
 *
 * Speech to text is Sarvam; the understanding is Claude Haiku. Those are two hops rather
 * than one because Anthropic has no speech-to-text API - Claude reads text, not audio -
 * so something has to turn the recording into words before a model can read them. Every
 * decision about the ANSWER is the model's; the transcriber only ever produces a string,
 * which the patient is then shown.
 *
 * The reason this is a module and not three lines inside the component: there are five
 * distinct failures here (no key configured, permission refused, silence, a transcriber
 * that shrugs, a model that rambles) and exactly three things a patient can usefully be
 * told - try again, tap instead, or "this is not set up here". Collapsing five into three
 * is a decision, so it is written down once rather than spread through a component's
 * catch blocks.
 */
import type { VoicePayload } from "./voiceApply";

export type VoiceFailure =
  /** Nothing was picked up: silence, a muted mic, a room too loud. Retry helps. */
  | "empty"
  /**
   * Not configured on this deployment - a route answered 503 because its key is absent.
   *
   * Worth its own case because it is the one failure that will never come right by trying
   * again, and the only one whose honest response is to stop offering the microphone. See
   * `voiceConfigured`.
   */
  | "off"
  /** Anything else. The patient is told to tap; the console gets the detail. */
  | "failed";

/** A route said 503: the key for that hop is not set on this deployment. */
class NotConfigured extends Error {}

/**
 * Latched for the life of the page once a route reports itself unconfigured.
 *
 * A microphone that cannot possibly work is worse than no microphone - the patient tries,
 * waits, reads an apology, and has learnt nothing except that this form wastes their time.
 * So the first attempt says so plainly and every card after that simply does not offer it.
 * Not persisted: a key can be added between sessions, and a stale "off" would then hide a
 * feature that works.
 */
let notConfigured = false;

export function voiceConfigured(): boolean {
  return !notConfigured;
}

export type VoiceOutcome =
  | { kind: "ok"; transcript: string; payload: VoicePayload }
  | { kind: "error"; failure: VoiceFailure };

/**
 * Recording -> transcript -> answers.
 *
 * Both hops are awaited in series because the second needs the first's output, and the
 * transcript is returned either way: a patient who is told "we heard X" can see whether
 * the microphone or the understanding is what let them down. That distinction matters
 * enough to keep - "it heard me and got it wrong" and "it never heard me" call for
 * different things from the patient.
 */
export async function fillFromSpeech(questionKey: string, audio: Blob): Promise<VoiceOutcome> {
  let transcript: string;
  try {
    transcript = await transcribe(audio);
  } catch (e) {
    return giveUp("transcribe", e);
  }

  if (transcript.trim().length < 2) return { kind: "error", failure: "empty" };

  try {
    return { kind: "ok", transcript, payload: await extract(questionKey, transcript) };
  } catch (e) {
    return giveUp("extract", e);
  }
}

/**
 * One failure, mapped once.
 *
 * The provider's own words go to the console and never to the patient: a 503 naming an
 * environment variable is a message for whoever deployed this, and a patient reading
 * "SARVAM_API_KEY is not set" has been handed someone else's problem.
 */
function giveUp(hop: string, e: unknown): VoiceOutcome {
  console.warn(`[voice] ${hop}`, e);
  if (e instanceof NotConfigured) {
    notConfigured = true;
    return { kind: "error", failure: "off" };
  }
  return { kind: "error", failure: "failed" };
}

async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "reply.wav");
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { transcript?: string; error?: string };
  if (res.status === 503) throw new NotConfigured(body.error ?? "transcription is not set up");
  if (!res.ok) throw new Error(body.error ?? `transcribe ${res.status}`);
  return body.transcript ?? "";
}

async function extract(questionKey: string, transcript: string): Promise<VoicePayload> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questionKey, transcript }),
  });
  const body = (await res.json().catch(() => ({}))) as VoicePayload & { error?: string };
  if (res.status === 503) throw new NotConfigured(body.error ?? "extraction is not set up");
  if (!res.ok) throw new Error(body.error ?? `extract ${res.status}`);
  return body;
}
