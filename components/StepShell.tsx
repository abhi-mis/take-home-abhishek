"use client";

/**
 * The frame every question renders inside: section label, progress, title, the
 * question body, and a fixed footer with Back / Next.
 *
 * Two deliberate feel decisions:
 *  - the slide direction follows travel direction (forward slides in from the right,
 *    Back from the left), which is the only cue a patient needs to know they went back;
 *  - `autoAdvance` questions have no Next button at all. Tapping the answer IS the
 *    Next tap, so a 16-question form costs 16 taps instead of 32.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar } from "./ProgressBar";
import { Button } from "./ui/Button";
import { UI_COPY } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

export function StepShell({
  stepId,
  sectionTitle,
  questionNumber,
  title,
  hint,
  index,
  total,
  direction,
  canGoNext,
  outstanding = [],
  onNext,
  onBack,
  hideNext = false,
  children,
  footerNote,
}: {
  stepId: string;
  sectionTitle: string;
  questionNumber: number | null;
  title: string;
  hint?: string;
  index: number;
  total: number;
  direction: 1 | -1;
  canGoNext: boolean;
  /** What is still required on this step. Rendered inline; blocks Next while non-empty. */
  outstanding?: string[];
  onNext: () => void;
  onBack: () => void;
  hideNext?: boolean;
  children: React.ReactNode;
  footerNote?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-30 bg-paper/95 px-5 pb-3 pt-4 backdrop-blur">
        <ProgressBar index={index} total={total} />
        <div className="mt-2.5 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {sectionTitle}
          </p>
          <ThemeToggle className="-my-1" />
        </div>
      </header>

      <main className="flex-1 px-5 pb-40">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepId}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -18 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-[22px] font-bold leading-[1.25] tracking-[-0.01em] text-ink">
              {questionNumber !== null ? (
                <span className="mr-1.5 text-brand/60 tabular-nums">{questionNumber}.</span>
              ) : null}
              {title}
            </h1>
            {hint ? <p className="mt-2 text-[14px] leading-snug text-muted">{hint}</p> : null}
            <div className="mt-6">{children}</div>

            {/*
              Validation is shown HERE, attached to the question, rather than only as a
              disabled Next button. A greyed-out button tells a patient that something is
              wrong but not what - this names each outstanding item, and on the table
              questions that is also the list of rows still to answer.
            */}
            <AnimatePresence initial={false}>
              {outstanding.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-5 rounded-2xl border border-dashed border-warn/45 bg-warn/[0.04] p-3.5"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-[12.5px] font-bold uppercase tracking-wide text-warn">
                    {outstanding.length === 1 ? "Still needed" : `Still needed (${outstanding.length})`}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {outstanding.slice(0, 8).map((o) => (
                      <li key={o} className="flex gap-2 text-[13px] leading-snug text-warn">
                        <span aria-hidden>·</span>
                        <span>{o}</span>
                      </li>
                    ))}
                    {outstanding.length > 8 ? (
                      <li className="text-[12.5px] italic text-warn/80">
                        …and {outstanding.length - 8} more below
                      </li>
                    ) : null}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur",
          "px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
        )}
      >
        <div className="mx-auto w-full max-w-md">
          {footerNote ? (
            <p className="mb-2 text-center text-[12px] leading-snug text-muted">{footerNote}</p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="lg"
              onClick={onBack}
              className="group w-[88px] shrink-0"
              aria-label={UI_COPY.back}
            >
              <BackArrow /> {UI_COPY.back}
            </Button>
            {hideNext ? (
              <div className="flex-1" />
            ) : (
              <Button size="lg" onClick={onNext} disabled={!canGoNext} className="flex-1">
                {UI_COPY.next}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function BackArrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-4" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 5 6.5 10l5 5" />
    </svg>
  );
}
