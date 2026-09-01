"use client";

/**
 * Landing screen. Deliberately one screen with one obvious button - the patient is
 * usually standing in a clinic reception holding a phone in one hand.
 *
 * The "continue where you left off" button only appears if sessionStorage actually
 * has progress, so a first-time patient never sees an option that does nothing.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { UI_COPY } from "@/lib/copy";
import { TOTAL_QUESTIONS } from "@/lib/schema";
import { useIntake } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ComfortToggle } from "@/components/ComfortToggle";

export default function Home() {
  const answered = useIntake((s) => Object.keys(s.touched).length);
  const reset = useIntake((s) => s.reset);
  const firstName = useIntake((s) => s.meta.first_name);
  const comfort = useIntake((s) => s.comfort);
  const setComfort = useIntake((s) => s.setComfort);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // avoid a hydration mismatch on resume state

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 flex items-center justify-end gap-2">
          {/* Reachable before the form even starts, for anyone who needs it now. */}
          <ComfortToggle comfort={comfort} onChange={setComfort} />
          <ThemeToggle />
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5">
          <span aria-hidden className="size-2 rounded-full bg-brand" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
            {UI_COPY.landingKicker}
          </span>
        </div>

        <h1 className="mt-6 font-display text-[44px] font-bold leading-[0.98] tracking-[-0.02em] text-ink">
          {UI_COPY.landingTitle}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">{UI_COPY.landingBody}</p>

        <ul className="mt-8 flex flex-col gap-3">
          {[
            { n: TOTAL_QUESTIONS, label: "short questions", sub: "one per screen, in order" },
            { n: "~2", label: "minutes", sub: "mostly just tapping" },
            { n: "3", label: "you can just say out loud", sub: "habits, products, treatments" },
            { n: "Aa", label: "fitted to you", sub: "text size, skipped questions, sensible limits" },
          ].map((f) => (
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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        /*
          Sticky, not just bottom-aligned. At the largest text size the intro and the
          four-item list are taller than the viewport, so a bottom-aligned Start button
          sat below the fold - the one screen where a patient must not have to hunt for
          the only button. Sticking it to the bottom edge keeps it in reach while the
          rest of the page scrolls behind it, the same way the wizard's footer behaves.
        */
        className="sticky bottom-0 mt-auto -mx-6 flex flex-col gap-3 bg-paper/95 px-6 pb-1 pt-5 backdrop-blur"
      >
        {mounted && answered > 0 ? (
          <>
            <Link href="/intake" className="contents">
              <Button size="lg" className="w-full">
                {firstName === null
                  ? UI_COPY.landingResume
                  : `${UI_COPY.landingResume}, ${firstName}`}
              </Button>
            </Link>
            <Button variant="ghost" onClick={reset}>
              {UI_COPY.landingRestart}
            </Button>
          </>
        ) : (
          <Link href="/intake" className="contents">
            <Button size="lg" className="w-full">
              {UI_COPY.landingCta}
            </Button>
          </Link>
        )}
      </motion.div>
    </div>
  );
}
