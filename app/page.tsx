"use client";

/**
 * Landing screen: pick how you want to answer.
 *
 * Two paths, both complete, both writing the same 16 answers into the same store:
 *
 *   /chat   - a spoken conversation. The assistant reads each question aloud and the
 *             patient speaks, types, or taps back.
 *   /intake - the form. One question per screen, pictures where they help.
 *
 * They are offered as a genuine choice rather than a primary and a fallback, because
 * which one is better is not a design opinion - it depends on the patient. Someone
 * standing in a noisy reception with one hand free wants to tap; someone who reads
 * English slowly, or is holding a toddler, wants to talk. The clinic does not know
 * which is which, so it should not have to guess.
 *
 * "Continue where you left off" only appears when sessionStorage actually has progress,
 * and it returns to the mode that progress was made in.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { UI_COPY, WAYS_COPY } from "@/lib/copy";
import { TOTAL_QUESTIONS } from "@/lib/schema";
import { useIntake } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { lastMode, rememberMode, type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

export default function Home() {
  const answered = useIntake((s) => Object.keys(s.touched).length);
  const reset = useIntake((s) => s.reset);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("form");

  // Resume state and sessionStorage are client-only; reading them during render would
  // disagree with the server HTML and trip hydration.
  useEffect(() => {
    setMounted(true);
    setMode(lastMode());
  }, []);

  const resuming = mounted && answered > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-5 py-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-5 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5">
            <span aria-hidden className="size-2 rounded-full bg-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink">
              {UI_COPY.landingKicker}
            </span>
          </div>
          <ThemeToggle />
        </div>

        <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
          {UI_COPY.landingTitle}
        </h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
          {TOTAL_QUESTIONS} short questions about your hair and scalp, for your doctor. About
          two minutes.
        </p>

        <h2 className="mt-8 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
          {WAYS_COPY.heading}
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          <WayCard
            href="/chat"
            onChoose={() => rememberMode("chat")}
            badge={WAYS_COPY.chatBadge}
            title={WAYS_COPY.chatTitle}
            body={WAYS_COPY.chatBody}
            recommended={mounted && mode === "chat" && resuming}
            icon={<ChatIcon />}
          />
          <WayCard
            href="/intake"
            onChoose={() => rememberMode("form")}
            badge={WAYS_COPY.formBadge}
            title={WAYS_COPY.formTitle}
            body={WAYS_COPY.formBody}
            recommended={mounted && mode === "form" && resuming}
            icon={<FormIcon />}
          />
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">{WAYS_COPY.either}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mt-8 flex flex-col gap-3"
      >
        {resuming ? (
          <>
            <Link href={mode === "chat" ? "/chat" : "/intake"} className="contents">
              <Button size="lg" className="w-full">
                {UI_COPY.landingResume}
              </Button>
            </Link>
            <Button variant="ghost" onClick={reset}>
              {UI_COPY.landingRestart}
            </Button>
          </>
        ) : null}
        <p className="text-center text-[11.5px] leading-relaxed text-muted">
          {UI_COPY.landingPrivacy}
        </p>
      </motion.div>
    </div>
  );
}

function WayCard({
  href,
  onChoose,
  badge,
  title,
  body,
  icon,
  recommended,
}: {
  href: string;
  onChoose: () => void;
  badge: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  recommended: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onChoose}
      className={cn(
        "group flex items-start gap-3.5 rounded-3xl border-2 bg-card p-4 transition-all duration-150",
        "hover:border-brand hover:bg-brand-soft/40 active:scale-[0.99]",
        recommended ? "border-brand" : "border-line",
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[16.5px] font-bold leading-tight text-ink">{title}</span>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-ink">
            {badge}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-snug text-muted">{body}</span>
      </span>
      <span
        aria-hidden
        className="mt-3 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H8L4 22v-4.2A7.5 7.5 0 0 1 12.5 4.5A7.5 7.5 0 0 1 20 12Z" />
      <path d="M12.5 8.5v4M10 10.5v0M15 10.5v0" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}
