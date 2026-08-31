"use client";

/**
 * The default state of a voice question: speak, or choose to tap.
 *
 * Q11/12/13 are the three questions where a grid is genuinely tedious - five rows with
 * detail columns each. Showing that grid first invites the patient to start tapping and
 * the voice feature never gets used; showing the mic alone makes speaking the obvious
 * path while keeping tapping one tap away.
 *
 * The prompt paragraph is doing real work, not decoration. A mic with no prompt is the
 * worst version of voice input: the patient does not know how much to say, answers one
 * thing, and one field fills. Naming every topic in a single sentence is what makes one
 * reply fill a whole table - and it doubles as the plain-language summary of the
 * question, so the grid does not need to be on screen for the question to be clear.
 */
import { motion } from "framer-motion";
import { SPEAK_PROMPTS, UI_COPY } from "@/lib/copy";
import type { ExtractResult } from "@/lib/extractPrompt";
import { VoicePanel } from "./VoicePanel";

export function SpeakFirst({
  questionKey,
  onResult,
  onTapInstead,
}: {
  questionKey: string;
  onResult: (r: ExtractResult, transcript: string) => void;
  onTapInstead: () => void;
}) {
  const prompt = SPEAK_PROMPTS[questionKey];

  return (
    <div className="flex flex-col gap-4">
      {prompt ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-brand/25 bg-brand-soft/50 p-4"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-ink">
            {UI_COPY.speakTitle}
          </p>
          <p className="mt-2 text-[15px] font-semibold leading-snug text-ink">{prompt.intro}</p>

          {/*
            An enumerated checklist, not a paragraph. Prose read more naturally but
            quietly dropped rows, so patients answered three of six items and the fill
            looked incomplete. A medical form has to enumerate.
          */}
          <ol className="mt-3 flex flex-col gap-2">
            {prompt.points.map((point, i) => (
              <li key={point} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-bold tabular-nums text-brand-ink"
                >
                  {i + 1}
                </span>
                <span className="text-[14px] leading-snug text-ink">{point}</span>
              </li>
            ))}
          </ol>

          {/* The conditional layer, stated up front so one reply can complete a row. */}
          {prompt.detailNote ? (
            <p className="mt-3 rounded-xl border border-brand/20 bg-card/60 px-3 py-2.5 text-[13px] leading-snug text-ink">
              <span className="font-semibold text-brand-ink">{UI_COPY.speakDetailLabel}:</span>{" "}
              {prompt.detailNote}
            </p>
          ) : null}

          <p className="mt-3 border-t border-brand/20 pt-3 text-[13px] leading-snug text-muted">
            <span className="font-semibold text-brand-ink">{UI_COPY.speakExampleLabel}:</span>{" "}
            <span className="italic">&ldquo;{prompt.example}&rdquo;</span>
          </p>
        </motion.div>
      ) : null}

      <VoicePanel questionKey={questionKey} onResult={onResult} />

      {/*
        Never a dead end. This is the same escape hatch that a denied microphone or a
        missing API key lands on, so there is exactly one fallback path to maintain.
      */}
      <button
        type="button"
        onClick={onTapInstead}
        className="min-h-[48px] rounded-2xl border border-dashed border-line px-4 text-[14px] font-semibold text-muted transition-colors hover:border-brand/50 hover:bg-brand-soft/40 hover:text-brand-ink"
      >
        {UI_COPY.speakTapInstead}
      </button>
    </div>
  );
}
