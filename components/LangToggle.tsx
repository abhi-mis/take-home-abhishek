"use client";

/**
 * English / Hindi, as a switch you can find without reading the language you cannot read.
 *
 * Two things make this work for the patient it is for. First, each side is labelled in
 * ITS OWN script - "EN" and "हिं" - so someone who reads only Devanagari can find their
 * half without parsing an English word like "Language". Second, it is a visible segmented
 * control rather than a cycling button: a patient who has landed in the wrong language
 * needs to see where to go, not discover it by pressing something twice.
 *
 * The selected half is a THUMB THAT SLIDES rather than a colour that jumps between two
 * buttons. It is not decoration: the movement is what says "this control has two states
 * and you just moved between them", and on a switch whose labels are in two scripts, one
 * of which the patient may not read, the motion carries more of the meaning than the text
 * does. A colour swap leaves them checking which word turned dark.
 *
 * The thumb is ONE element moved by a transform, not two elements matched by `layoutId`.
 *
 * `layoutId` was the obvious way to write this and it produced a real bug: it implies
 * `layout`, so framer-motion animates the element whenever its measured position changes -
 * and it measures against the VIEWPORT, not against this control. Anything that moved the
 * toggle on the page therefore made the thumb fly to its new home from wherever it used to
 * be. The landing screen's composition is vertically centred, so it re-centres when its own
 * height changes (the resume button appearing after hydration is enough), and the toggle sits
 * 177px lower there than in the app bar. That is the "travelling from the bottom to the top"
 * report, exactly.
 *
 * A transform relative to the element's own layout box cannot do that. `x: 0` or `x: 40px`
 * is the same animation wherever the control happens to be on the page, and both slots are a
 * fixed 40px so the arithmetic is exact rather than measured. `initial={false}` keeps it from
 * animating on mount.
 *
 * It also writes `lang` on <html>, which is what a screen reader uses to pick its voice.
 * Without it, a screen reader reads Devanagari with an English voice - the accessibility
 * equivalent of not translating at all.
 */
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HTML_LANG, LANG_SHORT, LANGS, t, type Lang } from "@/lib/i18n";
import { cn, tick } from "@/lib/utils";

/** Both slots, and the thumb, are this wide. See the note above. */
const SLOT = 40;

export function LangToggle({
  lang,
  onChange,
  className,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
  className?: string;
}) {
  /**
   * A patient who has asked their phone to stop animating things has asked this too.
   * The thumb still moves - it is the state, not an embellishment - it just arrives
   * immediately instead of travelling.
   */
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  return (
    <div
      role="radiogroup"
      aria-label={lang === "hi" ? "भाषा" : "Language"}
      className={cn(
        "relative flex shrink-0 items-center rounded-full border border-line bg-card p-0.5",
        className,
      )}
    >
      {/*
        One thumb for the control, positioned by which half is selected.

        An ink fill, not the accent one. The label sits ON this thumb, and paper on the
        terracotta accent is 4.01:1 - under the 4.5:1 text needs. The source scan in
        tests/i18n.test.ts cannot catch this pairing because the fill and the label are
        sibling elements, so it is called out here instead.
      */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: LANGS.indexOf(lang) * SLOT }}
        /*
          Tuned by measuring, not by taste. The first spring (stiffness 520) put the thumb
          80% of the way across in 20ms - technically an animation and visually a jump, which
          defeats the point of having one. This covers the 40px in about 220ms: slow enough to
          see, still faster than the tap that triggered it feels. Damped just short of
          critical so it settles without a wobble - a language switch that bounces reads as a
          toy.
        */
        transition={
          reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24, mass: 0.9 }
        }
        style={{ width: SLOT }}
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-full bg-ink shadow-[0_1px_4px_rgba(28,26,23,0.35)]"
      />

      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            // The label of the OTHER language is written in that language, so the
            // instruction is legible to the person who needs it.
            aria-label={l === "hi" ? t("langSwitchToHindi", "hi") : t("langSwitchToEnglish", "en")}
            onClick={() => {
              if (active) return;
              tick();
              onChange(l);
            }}
            style={{ width: SLOT }}
            className="relative z-10 grid min-h-8 place-items-center rounded-full transition-transform active:scale-95"
          >
            {/*
              Above the thumb, and its colour crossfades on its own timing rather than
              waiting for the slide - so the label being arrived at is already legible
              while the thumb is still travelling.
            */}
            <span
              className={cn(
                /*
                  Not `leading-none`. This control always shows both scripts, and on an
                  English page the Devanagari leading rules in globals.css do not apply -
                  so "हिं" would sit in a 12px line box with no room for its matras.
                */
                "relative z-10 text-[12px] font-bold leading-[1.45] transition-colors duration-200",
                active ? "text-paper" : "text-muted",
              )}
            >
              {LANG_SHORT[l]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
