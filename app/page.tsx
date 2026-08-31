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

export default function Home() {
  const answered = useIntake((s) => Object.keys(s.touched).length);
  const reset = useIntake((s) => s.reset);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // avoid a hydration mismatch on resume state

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5">
          <span aria-hidden className="size-2 rounded-full bg-brand" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
            {UI_COPY.landingKicker}
          </span>
        </div>

        <h1 className="mt-6 text-[40px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
          {UI_COPY.landingTitle}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">{UI_COPY.landingBody}</p>

        <ul className="mt-8 flex flex-col gap-3">
          {[
            { n: TOTAL_QUESTIONS, label: "short questions", sub: "one per screen, in order" },
            { n: "~2", label: "minutes", sub: "mostly just tapping" },
            { n: "3", label: "answerable by voice", sub: "habits, products, treatments" },
          ].map((f) => (
            <li key={f.label} className="flex items-baseline gap-3">
              <span className="w-9 shrink-0 text-right text-[20px] font-bold tabular-nums text-brand">
                {f.n}
              </span>
              <span>
                <span className="text-[15px] font-semibold text-ink">{f.label}</span>
                <span className="ml-2 text-[13px] text-muted">{f.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="flex flex-col gap-3"
      >
        {mounted && answered > 0 ? (
          <>
            <Link href="/intake" className="contents">
              <Button size="lg" className="w-full">
                {UI_COPY.landingResume}
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
        <p className="text-center text-[11.5px] leading-relaxed text-muted">
          {UI_COPY.landingPrivacy}
        </p>
      </motion.div>
    </div>
  );
}
