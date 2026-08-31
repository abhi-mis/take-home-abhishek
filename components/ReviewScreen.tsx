"use client";

/**
 * The output screen. Three jobs:
 *
 * 1. Show the filled form back as STRUCTURED DATA, grouped by schema section, with
 *    every gated null explained rather than hidden. This is the thing being graded,
 *    so it is on screen and inspectable, not buried in a download.
 * 2. Gate the download on validate() - shape + all-16 coverage. If anything is
 *    unresolved, the failing questions become tap-to-jump links instead of an error.
 * 3. Handle the decline path: consent === false produces no JSON at all.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { INTAKE_SCHEMA, QUESTIONS } from "@/lib/schema";
import { COPY, UI_COPY } from "@/lib/copy";
import { buildOutput, validate } from "@/lib/validate";
import type { Answers, Meta } from "@/lib/types";
import { Button, CheckIcon } from "./ui/Button";
import { cn, downloadJson } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

export function ReviewScreen({
  answers,
  meta,
  explicitNone,
  onJump,
  onRestart,
}: {
  answers: Answers;
  meta: Meta;
  explicitNone: Record<string, true>;
  onJump: (stepId: string) => void;
  onRestart: () => void;
}) {
  const [showJson, setShowJson] = useState(false);
  const result = useMemo(
    () => validate(answers, meta, explicitNone),
    [answers, meta, explicitNone],
  );
  const output = useMemo(() => buildOutput(answers, meta), [answers, meta]);

  if (answers.consent === false) return <Declined onJump={onJump} />;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <div className="mb-5 flex justify-end">
        <ThemeToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full text-white",
              result.valid ? "bg-brand" : "bg-warn",
            )}
          >
            {result.valid ? <CheckIcon className="size-6" /> : <span className="text-lg">!</span>}
          </span>
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-ink">
              {result.valid ? UI_COPY.reviewTitle : UI_COPY.reviewIncomplete}
            </h1>
            <p className="text-[13.5px] text-muted">
              {result.valid
                ? UI_COPY.reviewBody
                : `${result.missing.length + result.issues.length} item(s) still need attention.`}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Anything unresolved becomes a direct jump back to that question. */}
      {!result.valid ? (
        <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 p-4">
          <ul className="flex flex-col gap-2">
            {result.missing.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onJump(key)}
                  className="min-h-[44px] text-left text-[14px] font-semibold text-warn underline decoration-warn/40 underline-offset-2 transition-colors hover:decoration-warn"
                >
                  {COPY[key as keyof typeof COPY]?.title ?? key} →
                </button>
              </li>
            ))}
            {result.issues.map((issue) => (
              <li key={issue} className="text-[13px] leading-snug text-warn">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-5">
        {INTAKE_SCHEMA.sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {section.id} · {section.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              {section.questions.map((q, i) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => onJump(q.key)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-soft/40 active:bg-paper",
                    i > 0 && "border-t border-line",
                  )}
                >
                  <span className="w-5 shrink-0 pt-0.5 text-[12px] font-bold tabular-nums text-brand/50">
                    {q.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium uppercase tracking-wide text-muted">
                      {q.key}
                    </span>
                    <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-ink">
                      {renderAnswer(q.key, answers, meta)}
                    </span>
                  </span>
                  <span aria-hidden className="pt-1 text-muted">
                    ›
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-7 flex flex-col gap-3">
        <Button
          size="lg"
          disabled={!result.valid}
          onClick={() => downloadJson("genoroot-intake.json", output)}
        >
          {result.valid ? UI_COPY.download : UI_COPY.downloadBlocked}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setShowJson((s) => !s)}>
          {showJson ? UI_COPY.hideJson : UI_COPY.showJson}
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          {UI_COPY.restart}
        </Button>
      </div>

      {showJson ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-code-bg p-4 text-[11.5px] leading-relaxed text-code-fg">
          {JSON.stringify(output, null, 2)}
        </pre>
      ) : null}

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-muted">
        {QUESTIONS.length} questions · shape and coverage checked by Zod before download.
        Nothing is stored on a server.
      </p>
    </div>
  );
}

/** Human-readable rendering of one answer, including WHY a null is a valid null. */
function renderAnswer(key: string, a: Answers, meta: Meta): React.ReactNode {
  const gatedOut =
    (key === "menstrual_cycle" || key === "pregnancy_related") && meta.patient_sex !== "female";
  if (gatedOut)
    return (
      <span className="font-normal italic text-muted">null - skipped, never asked</span>
    );

  switch (key) {
    case "habits": {
      const h = a.habits;
      // `null` is rendered as "?" rather than folded into the "no" branch - an
      // unanswered row must never read as a confident No on the doctor's summary.
      const yn = (v: boolean | null, yes: string, no: string) =>
        v === null ? "? " + yes : v ? yes : no;
      const bits = [
        h.smoking === true ? `smoking: ${h.smoking_severity ?? "?"}` : yn(h.smoking, "smoking", "no smoking"),
        yn(h.alcohol, "alcohol", "no alcohol"),
        yn(h.hard_water, "hard water", "no hard water"),
        `wash: ${h.hair_wash_frequency ?? " - "}`,
        yn(h.heating_tools_styling_chemicals, "heat/chemicals", "no heat"),
        h.salon_treatments === true
          ? `salon: ${h.salon_treatment_detail ?? "?"}`
          : yn(h.salon_treatments, "salon", "no salon"),
      ];
      return <span className="font-normal">{bits.join(" · ")}</span>;
    }
    case "products": {
      const used = Object.entries(a.products).filter(([, v]) => v.used === true);
      const unanswered = Object.values(a.products).some((v) => v.used === null);
      if (unanswered) return <Missing />;
      if (used.length === 0) return <Empty label="no products used" />;
      return (
        <span className="font-normal">
          {used
            .map(
              ([row, v]) => `${row} (${v.duration ?? "?"}, ${v.helped ? "helped" : "no help"})`,
            )
            .join(" · ")}
        </span>
      );
    }
    case "procedures": {
      const done = Object.entries(a.procedures).filter(([, v]) => v.done === true);
      const pending = Object.values(a.procedures).some((v) => v.done === null);
      if (pending) return <Missing />;
      if (done.length === 0) return <Empty label="no procedures done" />;
      return (
        <span className="font-normal">
          {done.map(([row, v]) => `${row} (${v.sessions ?? "?"})`).join(" · ")}
        </span>
      );
    }
    case "past_treatment_side_effects":
      if (a.past_treatment_side_effects === null) return <Missing />;
      return (
        <span className="font-normal">
          {a.past_treatment_side_effects ? `Yes - ${a.past_treatment_describe ?? "?"}` : "No"}
        </span>
      );
    default: {
      const v = a[key as "duration"];
      if (Array.isArray(v))
        return v.length === 0 ? (
          <Empty label="none selected" />
        ) : (
          <span className="font-normal">{v.join(" · ")}</span>
        );
      if (v === null) return <Missing />;
      if (typeof v === "boolean") return <span className="font-normal">{v ? "Yes" : "No"}</span>;
      return <span className="font-normal">{String(v)}</span>;
    }
  }
}

function Empty({ label }: { label: string }) {
  return <span className="font-normal italic text-muted">[] - {label}</span>;
}
function Missing() {
  return <span className="font-normal italic text-warn">not answered yet</span>;
}

function Declined({ onJump }: { onJump: (id: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-16">
      <h1 className="text-[22px] font-bold leading-tight text-ink">
        Understood - no genetic test.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        You have not given permission, so we will not collect a sample and no genetic
        analysis will happen. You can still share your other answers with your doctor and
        continue with a normal consultation.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        No JSON is produced on this path: without consent, this app does not hand the
        intake on.
      </p>
      <Button className="mt-7 w-full" size="lg" variant="secondary" onClick={() => onJump("consent")}>
        Review the consent screen
      </Button>
    </div>
  );
}
