"use client";

/**
 * Landing screen: one screen, one obvious button, on any size of glass.
 *
 * Two measurements drove the layout it has. At 1440x900 the old version was a 448px phone
 * column stranded in the middle of the viewport with 992px of nothing beside it, and
 * `mt-auto` on the CTA opened a 285px void between the last fact and the only button on the
 * page - 204px of it on a 390px phone as well. A patient standing in a clinic reception
 * reads the promise, then the four facts, then taps Start. That sequence should not have a
 * hole in the middle of it, and on a laptop it should not look like a phone screenshot.
 *
 * So it is ONE dom in two compositions, placed by grid rather than duplicated:
 *
 *   mobile   a single column in reading order, the CTA last and sticky
 *   desktop  the promise on the left, the four facts and the CTA together on the right as a
 *            panel, the whole composition centred, the chrome aligned to the same box
 *
 * The switch is the `desk` breakpoint (900px, absolute) rather than `lg`. See the token in
 * globals.css: `lg` is 64rem and moves with the user font size, and a Windows laptop at 150%
 * scaling reports around 1000-1100px, so real desktops were landing on the phone layout.
 *
 * The CTA stays a direct child of the root on purpose. `sticky bottom-0` can only travel
 * inside its own parent's box, so a CTA nested in the facts panel would have nowhere to
 * stick and would quietly go static - and at the largest text size the content genuinely is
 * taller than the phone, which is the case the stickiness exists for.
 *
 * The void is fixed by moving the auto margin rather than deleting it. `mt-auto` now sits on
 * the PROMISE, not on the CTA: all the slack collects above the title, so the four facts and
 * the button stay one contiguous group anchored to the bottom of the phone, where a thumb
 * is. An auto margin is the right tool for this specifically because it resolves to zero
 * when there is no free space - so at the largest text size the layout degrades to a plain
 * scrolling column with nothing pushed off the top, which is what `content-center` or
 * `justify-center` would get wrong.
 *
 * The "continue where you left off" button only appears if sessionStorage actually has
 * progress, so a first-time patient never sees an option that does nothing.
 */
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { t, ui } from "@/lib/i18n";
import { TOTAL_QUESTIONS } from "@/lib/schema";
import { useIntake } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ComfortToggle } from "@/components/ComfortToggle";
import { LangToggle } from "@/components/LangToggle";
import { HeroArt } from "@/components/HeroArt";

export default function Home() {
  const answered = useIntake((s) => Object.keys(s.touched).length);
  const reset = useIntake((s) => s.reset);
  const firstName = useIntake((s) => s.meta.first_name);
  const comfort = useIntake((s) => s.comfort);
  const setComfort = useIntake((s) => s.setComfort);
  const lang = useIntake((s) => s.lang);
  const setLang = useIntake((s) => s.setLang);
  const UI = ui(lang);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // avoid a hydration mismatch on resume state

  // One entrance, four children, in reading order. The distances stay small: this is the
  // first thing a patient sees, and a landing screen that performs at them is not
  // reassuring.
  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.34, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  const facts = [
    {
      n: TOTAL_QUESTIONS,
      label: t("landingFeatQuestions", lang),
      sub: t("landingFeatQuestionsSub", lang),
    },
    { n: "~2", label: t("landingFeatMinutes", lang), sub: t("landingFeatMinutesSub", lang) },
    // Was "3 - you can just say out loud". Voice came out of the form, so the promise had
    // to come out of the landing with it: a landing page that advertises a feature the app
    // does not have is the worst kind of stale copy.
    { n: "2", label: t("landingFeatLangs", lang), sub: t("landingFeatLangsSub", lang) },
    { n: "Aa", label: t("landingFeatFitted", lang), sub: t("landingFeatFittedSub", lang) },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10 desk:grid desk:max-w-[1060px] desk:grid-cols-[minmax(0,1fr)_372px] desk:content-center desk:gap-x-16 desk:gap-y-4 desk:px-10 desk:py-12">
      {/*
        The three controls, aligned to the right edge of the composition rather than
        floating over the middle of a wide page. Reachable before the form starts, for
        anyone who needs one of them now: the language switch is FIRST and at full size
        because it is the only one here a patient cannot use the app without - the other
        two adjust a form they can already read.
      */}
      <motion.div
        {...rise(0)}
        className="mb-6 flex items-center justify-end gap-2 desk:col-span-2 desk:mb-2"
      >
        <LangToggle lang={lang} onChange={setLang} />
        <ComfortToggle comfort={comfort} onChange={setComfort} lang={lang} />
        <ThemeToggle />
      </motion.div>

      {/* The promise. Spans both panel rows on desktop so it centres against them. */}
      <motion.div {...rise(0.05)} className="mt-auto desk:col-start-1 desk:row-span-2 desk:mt-0 desk:self-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5">
          <span aria-hidden className="size-2 rounded-full bg-brand" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
            {UI.landingKicker}
          </span>
        </div>

        {/*
          Steps up with the viewport rather than sitting at one size. 44px is right on a
          phone and looks timid across a 1060px composition; the wordmark is the anchor of
          the whole screen, so it earns the extra weight where there is room for it.
        */}
        <h1 className="mt-6 font-display text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-ink sm:text-[44px] desk:mt-7 desk:text-[60px] desk:leading-[0.98]">
          {UI.landingTitle}
        </h1>
        <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-muted desk:mt-5 desk:text-[17px]">
          {UI.landingBody}
        </p>

        {/*
          The illustration, and only on a desktop.

          On a phone the four facts and the button already fill the screen, and an image
          above them would push the only button below the fold at the largest text size -
          which is the exact problem this screen was fixed for once already. A wide screen
          has the room, and the left column had space under the paragraph doing nothing.
        */}
        <HeroArt className="mt-8 hidden h-[220px] w-full max-w-[380px] desk:block" />
      </motion.div>

      {/*
        What the next two minutes hold, before committing to them - which is the point of
        the list, so on a wide screen it becomes a panel the eye lands on second rather
        than a footnote under the title. On a phone it stays a plain list: a card inside a
        342px column is a border around the whole screen.
      */}
      <motion.div
        {...rise(0.1)}
        className="mt-8 desk:col-start-2 desk:row-start-2 desk:mt-0 desk:self-end desk:rounded-3xl desk:border desk:border-line desk:bg-card desk:p-7 desk:shadow-[0_2px_14px_rgba(60,45,25,0.06)]"
      >
        <ul className="flex flex-col gap-3 desk:gap-4">
          {facts.map((f) => (
            /*
              Two lines per row, not one. The single-line version read fine with three
              short items and fell apart the moment a subtitle was long enough to wrap,
              which is the difference between a list and a mess.
            */
            <li key={f.label} className="flex items-start gap-3.5">
              <span className="mt-[3px] w-10 shrink-0 text-right font-display text-[19px] font-bold leading-none tabular-nums text-brand">
                {f.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight text-ink">
                  {f.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{f.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/*
        Sticky on a phone, part of the panel on a desktop. See the note at the top of the
        file for why this element is a child of the root and not of the panel above it.
      */}
      <motion.div
        {...rise(0.15)}
        className="sticky bottom-0 -mx-6 flex flex-col gap-3 bg-paper/95 px-6 pb-1 pt-5 backdrop-blur desk:static desk:col-start-2 desk:row-start-3 desk:mx-0 desk:bg-transparent desk:px-0 desk:pb-0 desk:pt-0 desk:backdrop-blur-none"
      >
        {mounted && answered > 0 ? (
          <>
            <Link href="/intake" className="contents">
              <Button size="lg" className="w-full">
                {firstName === null ? UI.landingResume : `${UI.landingResume}, ${firstName}`}
              </Button>
            </Link>
            <Button variant="ghost" onClick={reset}>
              {UI.landingRestart}
            </Button>
          </>
        ) : (
          <Link href="/intake" className="contents">
            <Button size="lg" className="w-full">
              {UI.landingCta}
            </Button>
          </Link>
        )}
      </motion.div>
    </div>
  );
}
