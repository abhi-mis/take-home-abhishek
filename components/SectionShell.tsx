"use client";

/**
 * The frame a whole section renders inside.
 *
 * It replaces StepShell, which framed one question at a time. Three differences carry the
 * redesign:
 *
 *  - progress is six segments rather than a 1-of-17 crawl, with the current segment filling
 *    as the section's questions are answered;
 *  - the footer advances a SECTION, and says which one is next by name, so pressing it is a
 *    decision rather than a leap;
 *  - the outstanding list names unanswered QUESTIONS instead of describing one control.
 *
 * Validation stays quiet until the patient has either tried to leave or come back to a
 * section they have already passed. Telling someone what they have not done yet, before they
 * have had a chance to do it, is the fastest way to make software feel hostile.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ProgressBar } from "./ProgressBar";
import { Button } from "./ui/Button";
import { ComfortToggle } from "./ComfortToggle";
import { LangToggle } from "./LangToggle";
import { SectionRail, type RailProgress } from "./SectionRail";
import { ThemeToggle } from "./ThemeToggle";
import { sectionLabel, t, ui, type Lang } from "@/lib/i18n";
import type { Comfort } from "@/lib/patient";
import type { Section } from "@/lib/sections";
import { cn } from "@/lib/utils";

export function SectionShell({
  section,
  index,
  total,
  answered,
  visible,
  nextTitle,
  outstanding,
  canGoNext,
  revisited,
  lang,
  comfort,
  onComfort,
  onLang,
  onNext,
  onBack,
  announcement,
  onJumpSection,
  allSections,
  railProgress,
  children,
}: {
  section: Section;
  /** 0-based position of this section in the flow. */
  index: number;
  total: number;
  answered: number;
  visible: number;
  /** Name of the next section, or null on the last one (then Next reads "Review answers"). */
  nextTitle: string | null;
  /** Short labels of the unanswered questions, for the block message. */
  outstanding: string[];
  canGoNext: boolean;
  /** True once this section has been left before, so its summary may show on arrival. */
  revisited: boolean;
  lang: Lang;
  comfort: Comfort;
  onComfort: (c: Comfort) => void;
  onLang: (l: Lang) => void;
  onNext: () => void;
  onBack: () => void;
  /**
   * Spoken to assistive tech when a card opens by itself, and rendered nowhere visibly.
   * See the note in app/intake/page.tsx for why this is an announcement rather than a
   * focus move.
   */
  announcement: string;
  /** Desktop only: the rail lets a patient go straight to any section. */
  onJumpSection: (id: string) => void;
  allSections: Section[];
  railProgress: Record<string, RailProgress>;
  children: React.ReactNode;
}) {
  const [pressedNext, setPressedNext] = useState(false);
  useEffect(() => setPressedNext(false), [section.id]);
  const showOutstanding = outstanding.length > 0 && (pressedNext || revisited);
  const title = sectionLabel(lang)[section.id] ?? section.id;

  return (
    /*
      Two columns from lg up, one below it.

      The desktop problem was never that the column was too narrow - 448px is close to the
      ideal measure, and widening the questions would hurt. It was that the column had no
      company, and that the sticky header painted a 448px band while the fixed footer ruled
      the full 1425px, so the two disagreed about how wide the app was. From lg up both sit
      INSIDE the column and stop being sticky at all, because there is nothing to stick to
      when the whole section fits on one screen.
    */
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[262px_minmax(0,1fr)]">
      <SectionRail
        className="hidden lg:block"
        sections={allSections}
        currentId={section.id}
        progress={railProgress}
        lang={lang}
        onJump={onJumpSection}
      />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:min-h-0 lg:max-w-[560px] lg:justify-center lg:py-12">
      <header className="sticky top-0 z-30 bg-paper/95 px-5 pb-3 pt-4 backdrop-blur lg:static lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <ProgressBar
          index={index}
          total={total}
          fraction={visible === 0 ? 1 : answered / visible}
          lang={lang}
        />
        <div className="mt-2.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {t("sectionOf", lang, { n: index + 1, total })}
            </p>
            {/*
              The section title is this screen's h1. Cards below use h2 for their own
              headers, which gives a screen reader the outline the design implies:
              one section, several questions inside it.
            */}
            <h1 className="font-display truncate text-[20px] leading-[1.4] text-ink">{title}</h1>
          </div>
          <ComfortToggle comfort={comfort} onChange={onComfort} lang={lang} className="mt-0.5" />
          <LangToggle lang={lang} onChange={onLang} className="mt-0.5" />
          {/* The palette toggle fits once the rail carries the wordmark and progress. */}
          <ThemeToggle className="mt-0.5 hidden lg:grid" />
        </div>
        <p className="mt-1 text-[11.5px] font-medium text-brand-ink">
          {t("answeredOf", lang, { n: answered, total: visible })}
        </p>
      </header>

      {/* Visually hidden, deliberately not `hidden`: a hidden element is not announced. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <main className="flex-1 px-4 pb-40 lg:flex-none lg:px-0 lg:pb-0 lg:pt-5">
        <div className="flex flex-col gap-2.5">{children}</div>

        <AnimatePresence initial={false}>
          {showOutstanding ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              aria-live="polite"
              className="mt-5 rounded-2xl border border-dashed border-warn/45 bg-warn/[0.04] p-3.5"
            >
              <p className="text-[12.5px] font-bold uppercase tracking-wide text-warn">
                {outstanding.length === 1
                  ? t("stillNeeded", lang)
                  : t("stillNeededN", lang, { n: outstanding.length })}
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
                    {t("andMore", lang, { n: outstanding.length - 8 })}
                  </li>
                ) : null}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <footer
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur",
          "px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
          "lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-6 lg:backdrop-blur-none",
        )}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-3 lg:max-w-none">
          <Button
            variant="ghost"
            size="lg"
            onClick={onBack}
            className="w-[88px] shrink-0"
            aria-label={ui(lang).back}
          >
            <BackArrow /> {ui(lang).back}
          </Button>
          {/*
            The wrapper catches the tap a disabled button cannot. `disabled:pointer-events-none`
            means a press on a blocked Next lands here instead of nowhere, which is what turns
            "the button is dead" into "here is what is missing" - while the button itself stays
            genuinely disabled for keyboard and screen-reader users.
          */}
          <div
            className="flex-1"
            onPointerDown={() => {
              if (!canGoNext) setPressedNext(true);
            }}
          >
            <Button size="lg" onClick={onNext} disabled={!canGoNext} className="w-full">
              {nextTitle === null ? t("finishUp", lang) : t("nextSection", lang, { title: nextTitle })}
            </Button>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}

/*
  Why this chevron looked like a sliver before `shrink-0`: the button is a flex row, so flex
  squeezed an 18px-wide box down to 6px and `preserveAspectRatio` scaled the whole glyph to
  fit. Carried over from StepShell along with the fix.
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
