"use client";

/**
 * "Would you like larger text?" - asked once, answered by the patient, never assumed.
 *
 * The form used to resize itself the moment an age of 55 or over was entered. It worked,
 * and it was still the wrong thing to do: the screen changing under someone who did not
 * ask for it is a thing being done TO them, and a 60-year-old with perfect eyesight reads
 * it as the form having decided they are old. Both readings are avoidable by asking.
 *
 * Three things make this a fair question rather than a modal in the way:
 *
 *  - it SHOWS both sizes. "Larger text" is an abstraction; two lines of the same sentence
 *    at the two sizes is the actual choice, and it is rendered with the real scale factor
 *    rather than an approximation of it.
 *  - both answers are one tap, equally weighted, and neither is hidden behind a dismissal
 *    X. "No, keep it as it is" is a real button, not a way out of the dialog.
 *  - it asks ONCE. Escape, the backdrop, and the No button all record the same answer, so
 *    it cannot come back and become the thing the patient taps past without reading.
 *
 * Deliberately mounted at page level, outside StepShell: a `position: fixed` overlay
 * inside framer-motion's animating question wrapper would be positioned against that
 * transform instead of the viewport.
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { COMFORT_LABEL, COMFORT_ZOOM, type Comfort } from "@/lib/patient";
import { Button } from "./ui/Button";
import { tick } from "@/lib/utils";

/** The sentence used for the preview: a real question, not lorem ipsum. */
const SAMPLE = "How long has it been going on?";

export function ComfortPrompt({
  age,
  target,
  onAccept,
  onDecline,
}: {
  /** Shown back to the patient, so the offer has a stated reason. */
  age: number;
  /** The scale being offered - "large" from 55, "xl" from 70. */
  target: Comfort;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const yesRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    yesRef.current?.focus();
    // The page behind must not scroll while a decision is pending.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /**
   * Escape declines rather than merely closing.
   *
   * A dialog that can be dismissed without answering has to ask again later, and a
   * question asked twice is a question nobody reads. Every exit is an answer.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDecline();
        return;
      }
      // Two buttons, so the focus trap is a two-line one.
      if (e.key === "Tab" && cardRef.current !== null) {
        const focusable = cardRef.current.querySelectorAll<HTMLButtonElement>("button");
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);

  const ratio = COMFORT_ZOOM[target];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <motion.button
        type="button"
        aria-label="Keep the text size as it is"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onDecline}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comfort-title"
        aria-describedby="comfort-body"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-t-3xl border-t border-line bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-[0_-8px_40px_rgba(10,79,70,0.18)] sm:rounded-3xl sm:border sm:pb-6"
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft font-bold text-brand-ink"
          >
            <span className="flex items-baseline gap-[1px] leading-none">
              <span className="text-[13px]">A</span>
              <span className="text-[17px]">a</span>
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="comfort-title"
              className="font-display text-[22px] font-bold leading-[1.2] text-ink"
            >
              Would you like larger text?
            </h2>
            <p id="comfort-body" className="mt-1.5 text-[14px] leading-snug text-muted">
              You told us you are {age}. We can make the words and the buttons bigger for the
              rest of the form. Nothing else changes.
            </p>
          </div>
        </div>

        {/*
          The choice, shown rather than described. Both lines are the same real question
          from the form, at the two sizes on offer, using the same factor the app applies.
        */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-card">
          <PreviewRow label="Now" scale={1} muted />
          <PreviewRow label={COMFORT_LABEL[target].replace(" text", "")} scale={ratio} />
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <Button
            ref={yesRef}
            size="lg"
            onClick={() => {
              tick();
              onAccept();
            }}
            className="w-full"
          >
            Yes, make it bigger
          </Button>
          <Button variant="secondary" size="lg" onClick={onDecline} className="w-full">
            No, keep it as it is
          </Button>
        </div>

        <p className="mt-3.5 text-center text-[12px] leading-snug text-muted">
          Either way, the <span className="font-semibold text-ink">Aa</span> button at the top
          changes the size any time.
        </p>
      </motion.div>
    </div>
  );
}

function PreviewRow({
  label,
  scale,
  muted = false,
}: {
  label: string;
  scale: number;
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "flex items-center gap-3 border-b border-line px-4 py-3"
          : "flex items-center gap-3 bg-brand-soft/45 px-4 py-3.5"
      }
    >
      <span
        className={
          muted
            ? "w-[52px] shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-muted"
            : "w-[52px] shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-ink"
        }
      >
        {label}
      </span>
      <span
        // The real ratio, not a guess at it: 15px is the form's body size.
        style={{ fontSize: `${(15 * scale).toFixed(2)}px` }}
        className={muted ? "leading-snug text-muted" : "font-semibold leading-snug text-ink"}
      >
        {SAMPLE}
      </span>
    </div>
  );
}
