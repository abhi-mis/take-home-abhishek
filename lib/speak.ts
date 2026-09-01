"use client";

/**
 * The assistant's voice, entirely in the browser.
 *
 * Anthropic has no text-to-speech endpoint, and this app deliberately does not reach
 * for a second vendor to get one - so the voice is the platform's own
 * `speechSynthesis`. What that buys, beyond one less key to leak: it is free, it works
 * offline, it starts instantly with no network round trip, and no audio of a patient's
 * medical answers is ever sent anywhere. What it costs: a more robotic voice than a
 * hosted model would give. For reading a clinical question aloud that is a good trade.
 *
 * Speech is an ENHANCEMENT, never a channel. Every line is rendered as a chat bubble
 * BEFORE this module is called, so a patient with no audio, a browser with no voices, a
 * muted phone or an autoplay policy in the way reads exactly the same conversation.
 *
 * Cancellation is the subtle part. A `generation` counter is bumped by every new
 * request, so a stale utterance cannot report itself as spoken. Without that, a patient
 * who answers quickly gets the previous question spoken over the new one - two voices at
 * once, and the app sounds broken.
 */

import { SPEECH_LANG, type Lang } from "./i18n";

export type SpeakOutcome =
  | "spoken" // the browser voice played
  | "blocked" // the browser refused without a user gesture
  | "unavailable" // no speechSynthesis at all
  | "cancelled"; // superseded by a newer line, or stopped

let generation = 0;

/**
 * How long to wait for `onstart` before deciding the browser is not going to speak.
 *
 * Chrome silently drops `speak()` when the document has had no user activation - no
 * error, no event, nothing. This timeout is the only way to notice, and noticing is what
 * turns a dead mute button into a visible "tap to hear the question".
 */
const START_TIMEOUT_MS = 1_200;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  generation += 1;
  if (speechSupported()) window.speechSynthesis.cancel();
}

/**
 * Preferred voice for the chosen language.
 *
 * `hi-IN` when the form is in Hindi, `en-IN` when it is in English, and any voice at all
 * rather than silence: a robotic fallback still helps someone who cannot read the screen,
 * which is the entire point of this button.
 *
 * `en-IN` rather than `en-US` for English because these are Indian patients and an
 * Indian-English voice pronounces names and place names plausibly where a US voice does
 * not. For Hindi the exact-match tier matters much more: a hi-IN voice is present on
 * Android and most Windows installs, and reading Devanagari with an English voice is
 * worse than not reading it at all - so the family prefix (`hi-`) is tried before any
 * generic fallback.
 *
 * Voices load asynchronously on some browsers, so an empty list on the first call is
 * normal and simply means the default voice is used.
 */
function pickVoice(want: string): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis.getVoices();
    const family = want.split("-")[0] ?? want;
    return (
      voices.find((v) => v.lang === want) ??
      voices.find((v) => v.lang.replace("_", "-").startsWith(family + "-")) ??
      voices.find((v) => v.lang === family) ??
      undefined
    );
  } catch {
    return undefined;
  }
}

/** Speak one line. Resolves when playback finishes, or immediately when superseded. */
export function speak(text: string, lang: Lang = "en"): Promise<SpeakOutcome> {
  const line = text.trim();
  if (line.length === 0) return Promise.resolve("cancelled");
  if (!speechSupported()) return Promise.resolve("unavailable");

  stopSpeaking();
  const mine = generation;
  const current = () => generation === mine;

  return new Promise<SpeakOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: SpeakOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      resolve(current() ? outcome : "cancelled");
    };

    let utterance: SpeechSynthesisUtterance;
    try {
      utterance = new SpeechSynthesisUtterance(line);
    } catch {
      resolve("unavailable");
      return;
    }

    const want = SPEECH_LANG[lang];
    const voice = pickVoice(want);
    if (voice !== undefined) utterance.voice = voice;
    // `lang` is set even when no matching voice was found: some engines use it to pick a
    // pronunciation model, and it costs nothing when they do not.
    utterance.lang = voice?.lang ?? want;
    utterance.rate = 0.98; // a touch under default: clinical questions read better slow

    let started = false;
    utterance.onstart = () => {
      started = true;
    };
    utterance.onend = () => finish("spoken");
    // An error here is usually "interrupted" from our own cancel(), which is not a
    // failure the patient should ever hear about.
    utterance.onerror = () => finish(started ? "spoken" : "blocked");

    const startTimer = setTimeout(() => {
      if (!started) finish("blocked");
    }, START_TIMEOUT_MS);

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish("unavailable");
    }
  });
}

/**
 * Everything the assistant says for one turn, as one utterance.
 *
 * Joined into a single string rather than queued as several, because a queue cannot be
 * cancelled atomically - stopping mid-queue on some browsers still lets the next item
 * start. The example answer is deliberately excluded: an example is guidance for
 * reading, and speaking it invites the patient to repeat it back as if it were the
 * expected answer.
 */
export function spokenText(turn: {
  say: string;
  points?: string[];
  detailNote?: string;
}): string {
  const parts = [turn.say];
  if (turn.points && turn.points.length > 0) parts.push(turn.points.join(". "));
  if (turn.detailNote) parts.push(turn.detailNote);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
