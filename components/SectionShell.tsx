"use client";

/**
 * The frame a whole section renders inside - an application shell, not a wide phone.
 *
 * The layout this replaces was a 448px column with desktop rules bolted onto it: the header
 * became `lg:static` and the whole column was vertically centred, so the chrome moved on
 * every section and a laptop got a phone screenshot in the middle of an empty page. Three
 * things changed, and each one answers a specific complaint:
 *
 *  - the top bar is FIXED at a constant height (components/AppBar.tsx), so it is in the same
 *    place on question one and question sixteen;
 *  - the six steps live in a fixed sidebar from `desk` up (components/SectionNav.tsx) and the
 *    content pane is inset to make room, which is what makes this read as an app;
 *  - the content pane is 780px of real estate with desktop type sizes, rather than a phone
 *    column centred in a void.
 *
 * `desk` is 900px in absolute pixels, not `lg`'s 64rem. See the note beside the token in
 * globals.css: a Windows laptop at 150% display scaling reports roughly 1000-1100px, and a
 * rem breakpoint moves with the user's font size, so the two together put ordinary desktops
 * below `lg` and handed them the mobile layout.
 *
 * Validation stays quiet until the patient has either tried to leave or come back to a
 * section they have already passed. Telling someone what they have not done yet, before they
 * have had a chance to do it, is the fastest way to make software feel hostile.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppBar, APP_BAR_PAD } from "./AppBar";
import { SectionNav, type NavProgress } from "./SectionNav";
import { SectionIcon } from "./SectionIcons";
import { Button } from "./ui/Button";
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
  onJumpSection: (id: string) => void;
  allSections: Section[];
  railProgress: Record<string, NavProgress>;
  children: React.ReactNode;
}) {
  const [pressedNext, setPressedNext] = useState(false);
  useEffect(() => setPressedNext(false), [section.id]);
  const showOutstanding = outstanding.length > 0 && (pressedNext || revisited);
  const title = sectionLabel(lang)[section.id] ?? section.id;

  return (
    <div className="min-h-dvh bg-paper">
      <AppBar
        index={index}
        total={total}
        /*
          Every section's own completion, so the bar cannot claim work the patient has not
          done. Derived from the same per-section counts the sidebar renders, which is what
          keeps the two from disagreeing.
        */
        fractions={allSections.map((s) => {
          const p = railProgress[s.id];
          if (p === undefined || p.visible === 0) return 0;
          return p.answered / p.visible;
        })}
        lang={lang}
        comfort={comfort}
        onComfort={onComfort}
        onLang={onLang}
      />

      <SectionNav
        sections={allSections}
        currentId={section.id}
        progress={railProgress}
        lang={lang}
        onJump={onJumpSection}
      />

      {/* Visually hidden, deliberately not `hidden`: a hidden element is not announced. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className={cn("desk:pl-[264px]", APP_BAR_PAD)}>
        <main className="mx-auto w-full max-w-[780px] px-4 pb-36 pt-5 desk:px-10 desk:pb-10 desk:pt-9">
          {/*
            The section heading, in the page rather than in the chrome.
            It is the h1 either way - cards below are h2 - but on a desktop it can be a
            proper page title with room to breathe, and on a phone the app bar has already
            said where we are, so this is the same fact told once at reading size.
          */}
          {/*
            The one heading in the document, at every width.

            The kicker is desktop-only because the app bar already says "section 3 of 6" on a
            phone and there is no reason to say it twice in 80px. The name is not in the bar
            at all - see the note in AppBar.tsx for why one visible heading beat two.
          */}
          <div className="mb-4 desk:mb-7">
            <p className="hidden text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand-ink desk:block">
              {t("sectionOf", lang, { n: index + 1, total })}
            </p>
            <div className="flex items-center gap-3">
              {/* The same glyph the sidebar row carries, so the two read as one place. */}
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink desk:size-11"
              >
                <SectionIcon id={section.id} className="size-[21px] desk:size-6" />
              </span>
              <h1 className="font-display text-[25px] leading-[1.25] text-ink desk:mt-0 desk:text-[33px]">
                {title}
              </h1>
            </div>
            <p className="mt-1 text-[13px] font-medium text-muted desk:mt-1.5 desk:text-[13.5px]">
              {t("answeredOf", lang, { n: answered, total: visible })}
            </p>
          </div>

          <div className="flex flex-col gap-3 desk:gap-3.5">{children}</div>

          <AnimatePresence initial={false}>
            {showOutstanding ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                aria-live="polite"
                className="mt-5 rounded-2xl border border-dashed border-warn/45 bg-warn/[0.04] p-4"
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

          {/*
            Desktop: sticky rather than simply last.

            About You is taller than a 900px viewport on its own, so actions placed at the
            end of the column are actions the patient has to go looking for. Sticky gives
            both behaviours from one element - pinned to the bottom edge while the section
            is taller than the screen, sitting quietly at the end of the reading flow when
            it is not - which is the same reasoning as the landing page's CTA.
          */}
          <div className="sticky bottom-0 -mx-10 mt-7 hidden bg-paper/95 px-10 pb-6 pt-4 backdrop-blur-md desk:block">
            <Actions
              lang={lang}
              nextTitle={nextTitle}
              canGoNext={canGoNext}
              onBack={onBack}
              onNext={onNext}
              onBlockedPress={() => setPressedNext(true)}
            />
          </div>
        </main>
      </div>

      {/*
        Phone: the actions are a fixed bar. On a small screen a section can be taller than
        the viewport, and the way forward must never be something you scroll to find.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md desk:hidden">
        <Actions
          lang={lang}
          nextTitle={nextTitle}
          canGoNext={canGoNext}
          onBack={onBack}
          onNext={onNext}
          onBlockedPress={() => setPressedNext(true)}
        />
      </div>
    </div>
  );
}

/**
 * Back and Next, rendered twice - once in the desktop column, once in the phone's fixed bar.
 *
 * Twice rather than one element moved by CSS because the two live in different stacking and
 * scrolling contexts. Only one is ever RENDERED - each side is behind a `desk:hidden` or a
 * `hidden desk:block` - so there is one Back and one Next on screen at any viewport, and no
 * duplicate tab stops, since a `display: none` element is not focusable.
 *
 * Both are in the DOM, though, and that distinction bit once: `querySelector` returns the
 * first match regardless of whether it is rendered, so the page's "focus the way forward"
 * shortcut was aiming at the hidden desktop button while on a phone. Anything looking these
 * up has to filter by what is actually rendered - see the note at the call site.
 */
function Actions({
  lang,
  nextTitle,
  canGoNext,
  onBack,
  onNext,
  onBlockedPress,
}: {
  lang: Lang;
  nextTitle: string | null;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onBlockedPress: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="lg"
        onClick={onBack}
        className="w-[92px] shrink-0"
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
          if (!canGoNext) onBlockedPress();
        }}
      >
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canGoNext}
          className="w-full"
          /*
            Queried by the page when Enter runs out of questions to open: focus should land
            on the way forward. It used to be found with `footer button:last-of-type`, which
            broke silently the moment the footer stopped being a <footer> - an attribute the
            component declares is a contract, a tag-name selector is a guess.
          */
          data-next-action
        >
          {nextTitle === null ? t("finishUp", lang) : t("nextSection", lang, { title: nextTitle })}
        </Button>
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
