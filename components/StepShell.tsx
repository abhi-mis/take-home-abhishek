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
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar } from "./ProgressBar";
import { Button } from "./ui/Button";
import { UI_COPY } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";
import { QuestionSpeaker } from "./QuestionSpeaker";
import { ComfortToggle } from "./ComfortToggle";
import type { Comfort } from "@/lib/patient";
import { cn } from "@/lib/utils";

export function StepShell({
  stepId,
  sectionTitle,
  questionNumber,
  title,
  hint,
  speech,
  welcome,
  personal,
  comfort,
  onComfort,
  revisited,
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
  /** The full question, options included, for the read-aloud button. */
  speech: string;
  /** "Welcome, Anjali" on the first question only. Absent when no name was given. */
  welcome?: string;
  /** "Female · 58 · larger text" - proof that the first screen changed something. */
  personal: string;
  comfort: Comfort;
  onComfort: (c: Comfort) => void;
  /** True once this step has been completed before - then the summary shows on arrival. */
  revisited: boolean;
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
  /**
   * Has the patient tried to leave this step yet?
   *
   * The outstanding list used to appear the moment a question rendered, which meant a
   * patient arriving at Q1 was immediately told, in warning red, that something was
   * missing - before they had done anything at all. Telling someone off for not having
   * answered yet is the fastest way to make software feel hostile.
   *
   * So it stays quiet until they either press Next (a disabled button passes the tap
   * through to this handler) or return to a step they have already passed through.
   */
  const [pressedNext, setPressedNext] = useState(false);
  useEffect(() => setPressedNext(false), [stepId]);
  const showOutstanding = outstanding.length > 0 && (pressedNext || revisited);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-30 bg-paper/95 px-5 pb-3 pt-4 backdrop-blur">
        <ProgressBar index={index} total={total} />
        <div className="mt-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {sectionTitle}
            </p>
            {/*
              The customisation, stated. Without this, "we made the text bigger for you"
              is something the app did TO the patient; with it, it is a setting they can
              see and change. It is also how someone notices the form is skipping two
              questions for them rather than losing them.
            */}
            {personal ? (
              <p className="truncate text-[11px] font-medium text-brand-ink/80">{personal}</p>
            ) : null}
          </div>
          {/*
            Three controls, in the sticky header so they are reachable from the long table
            questions and identical on all 17 screens: read the question aloud, resize
            everything, switch the palette.
          */}
          <QuestionSpeaker text={speech} className="-my-1" />
          <ComfortToggle comfort={comfort} onChange={onComfort} className="-my-1" />
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
{/*
              The question, typeset rather than printed.

              Third attempt at the number, and the first one that survives every text
              size. A watermark behind the title was muddy; a numeral above a hairline
              rail was worse at the largest scale, where a three-line title left the
              rail running down beside it looking like a stray tick mark. A badge pinned
              to the first line cannot do either: it is the same shape at every scale.

              `min-w-7 px-1.5` rather than a fixed circle because Q10 to Q16 are two
              digits and a clipped "16" is worse than a slightly wider pill.
            */}
            {/*
              The name, said back to the patient once. It sits on the first question
              rather than on the screen where it was typed, so it reads as the form
              carrying something forward rather than as a field confirming itself.
            */}
            {welcome ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-[12.5px] font-bold text-brand-ink"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {welcome}
              </motion.p>
            ) : null}
            <div className="flex items-start gap-3">
              {questionNumber !== null ? (
                <span
                  aria-hidden
                  className="mt-[5px] grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-brand-soft px-1.5 font-display text-[13px] font-bold leading-none tabular-nums text-brand-ink"
                >
                  {questionNumber}
                </span>
              ) : null}
              <h1 className="font-display text-[25px] font-bold leading-[1.22] text-ink">
                {title}
              </h1>
            </div>
            {hint ? <p className="mt-2.5 text-[14px] leading-snug text-muted">{hint}</p> : null}
            <div className="mt-6">{children}</div>

            {/*
              Validation is shown HERE, attached to the question, rather than only as a
              disabled Next button. A greyed-out button tells a patient that something is
              wrong but not what - this names each outstanding item, and on the table
              questions that is also the list of rows still to answer.
            */}
            <AnimatePresence initial={false}>
              {showOutstanding ? (
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
              /*
                The wrapper catches the tap that the disabled button cannot.
                `disabled:pointer-events-none` means a press on a blocked Next lands here
                instead of nowhere - which is what turns "the button is dead" into "here
                is what is missing". The button itself stays genuinely `disabled`, so
                keyboard and screen-reader users are told it is unavailable rather than
                being led into a no-op.
              */
              <div
                className="flex-1"
                onPointerDown={() => {
                  if (!canGoNext) setPressedNext(true);
                }}
              >
                <Button size="lg" onClick={onNext} disabled={!canGoNext} className="w-full">
                  {UI_COPY.next}
                </Button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/*
  Why this chevron looked like a sliver, measured rather than guessed: the button is a
  flex row, the svg had no `shrink-0`, and flex therefore squeezed an 18px-wide box down
  to 6.06px. `preserveAspectRatio` then scaled the whole glyph to fit that width, so it
  drew at about a third of its intended size with a correspondingly hairline stroke.

  `shrink-0` is the fix. The rest is proportion: the path spanned only 10 of the viewBox's
  20 units, so even at full width it drew at half the box, and it now fills 12 of 20 in an
  18px box - roughly the cap height of the 16px semibold label beside it - with the stroke
  thickened to match that label's weight.
*/
function BackArrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="size-[18px] shrink-0"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.25 4 6 10l6.25 6" />
    </svg>
  );
}
