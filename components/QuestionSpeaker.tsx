"use client";

/**
 * "Read this question to me."
 *
 * One button, on every question. Press it and the question plus its options are spoken;
 * press it again to stop. That is the whole feature, and the restraint is the point: an
 * assistant that talks on its own initiative has to be muted, managed and trusted, while
 * a button that speaks only when pressed is understood by everyone instantly and can
 * never talk over a clinic waiting room.
 *
 * It renders nothing at all when the browser has no speech support, rather than a button
 * that does nothing - the same rule the microphone follows.
 *
 * Speech is triggered by a real tap, which is also what satisfies the browsers that
 * refuse to speak without user activation. That is not a happy accident; it is why this
 * shape needs none of the "tap to enable audio" scaffolding an auto-speaking assistant
 * does.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { speak, speechSupported, stopSpeaking } from "@/lib/speak";
import { t, type Lang } from "@/lib/i18n";
import { cn, tick } from "@/lib/utils";

export function QuestionSpeaker({
  text,
  lang,
  className,
}: {
  text: string;
  lang: Lang;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Capability is client-only; checking during render would break hydration.
  useEffect(() => setSupported(speechSupported()), []);

  // Stop on unmount and whenever the question changes, so moving to the next screen
  // never leaves the previous question being read out over it.
  useEffect(() => {
    setSpeaking(false);
    return () => stopSpeaking();
  }, [text]);

  if (!supported) return null;

  async function toggle() {
    tick(12);
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    // Resolves when the reading finishes, is stopped, or the browser refuses - all of
    // which mean the same thing here: the button goes back to idle.
    await speak(text, lang);
    setSpeaking(false);
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={speaking ? t("readStop", lang) : t("readAloud", lang)}
      title={speaking ? t("readStop", lang) : t("readAloud", lang)}
      className={cn(
        "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors",
        speaking
          // accent-icon-ok: a speaker glyph, no label.
          ? "border-brand bg-brand text-white"
          : "border-line bg-card text-muted hover:border-brand/50 hover:text-brand-ink",
        "active:scale-95",
        className,
      )}
    >
      {speaking ? (
        <>
          {/* One soft pulse, so "it is reading" is legible without a text label. */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-brand/30"
            animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
          <StopIcon />
        </>
      ) : (
        <SpeakerIcon />
      )}
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10v4h3l4 3.5V6.5L7 10H4Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="relative size-[15px] fill-current">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}
