"use client";

/**
 * Correcting one answer from the review screen, without leaving the review screen.
 *
 * Tapping a row used to navigate back into the wizard at that question, which is the
 * obvious implementation and the wrong behaviour at the end of a form. The patient was
 * reviewing sixteen answers; they wanted to fix ONE. Sending them back into the wizard
 * loses their place, and the way out is either Next through everything after it or a Back
 * button that reads like undoing.
 *
 * So the question opens here instead: the same controls, in a dialog, over the review it
 * came from. Answer it, tap Done, and the row updates underneath.
 *
 * The controls are `QuestionBody` - literally the same component the wizard renders - so
 * there is no second implementation of "what does `type: multi` look like" to drift.
 *
 * Two accessibility details that make it a dialog rather than a div: focus moves in and
 * the page behind it cannot scroll, and Escape closes it. There is no destructive action
 * to guard against, so every exit is simply "done" - answers are written to the store as
 * they are tapped, exactly as they are in the wizard.
 */
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { QuestionBody } from "./questions/QuestionBody";
import { Button } from "./ui/Button";
import { QuestionSpeaker } from "./QuestionSpeaker";
import { questionCopy, sectionLabel, t, ui, type Lang } from "@/lib/i18n";
import { questionSpeech } from "@/lib/questionSpeech";
import { personalNote, type Comfort } from "@/lib/patient";
import { validateStep, type Step } from "@/lib/steps";
import type { Answers, Meta, PatientSex } from "@/lib/types";

export function EditQuestionDialog({
  step,
  answers,
  meta,
  lang,
  comfort,
  comfortAsked,
  explicitNone,
  patch,
  setSex,
  setAge,
  setFirstName,
  chooseNone,
  onClose,
}: {
  step: Step;
  answers: Answers;
  meta: Meta;
  lang: Lang;
  comfort: Comfort;
  comfortAsked: boolean;
  explicitNone: Record<string, true>;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  const UI = ui(lang);
  const copy = step.key === null ? null : questionCopy(lang)[step.key];
  const title = copy?.title ?? step.key ?? "";
  const extra = step.key === null ? undefined : personalNote(step.key, meta, lang);
  const hint = [copy?.hint, extra].filter(Boolean).join(" ");
  const check = validateStep(step, answers, meta, explicitNone, lang);

  useEffect(() => {
    doneRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.button
        type="button"
        aria-label={UI.next}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        /*
          Capped at 88% of the viewport with the body scrolling inside it, because the
          three table questions are taller than any phone. The header and the Done button
          stay put while the answers scroll - on a form where the way out must never be
          off-screen.
        */
        className="relative flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-paper shadow-[0_-8px_40px_rgba(10,79,70,0.18)] sm:rounded-3xl sm:border"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 pb-3.5 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {step.n === null
                ? (sectionLabel(lang)[step.sectionId] ?? "")
                : `${step.n} · ${sectionLabel(lang)[step.sectionId] ?? ""}`}
            </p>
            <h2
              id="edit-title"
              className="mt-1 font-display text-[19px] font-bold leading-tight text-ink"
            >
              {title}
            </h2>
          </div>
          {/* The read-aloud button belongs here too: the reason for it does not stop
              applying because the question is in a dialog. */}
          <QuestionSpeaker text={questionSpeech(step, meta, lang)} lang={lang} className="mt-0.5" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {hint.length > 0 ? (
            <p className="mb-4 text-[13.5px] leading-snug text-muted">{hint}</p>
          ) : null}

          <QuestionBody
            step={step}
            answers={answers}
            meta={meta}
            lang={lang}
            comfort={comfort}
            comfortAsked={comfortAsked}
            explicitNone={explicitNone}
            patch={patch}
            setSex={setSex}
            setAge={setAge}
            setFirstName={setFirstName}
            chooseNone={chooseNone}
            // Straight to the grid: this patient came to fix one row, not to describe
            // the whole table out loud again.
            tableStage="form"
          />

          {/*
            Still-missing items are shown but do NOT block Done. The patient opened this
            to correct something and must be able to close it again; the review row goes
            back to reading "not answered yet" and the download stays disabled, which is
            the same truth told in the place they can already see it.
          */}
          {!check.complete ? (
            <div className="mt-5 rounded-2xl border border-dashed border-warn/45 bg-warn/[0.04] p-3.5">
              <p className="text-[12.5px] font-bold uppercase tracking-wide text-warn">
                {check.outstanding.length === 1
                  ? t("stillNeeded", lang)
                  : t("stillNeededN", lang, { n: check.outstanding.length })}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {check.outstanding.slice(0, 6).map((o) => (
                  <li key={o} className="text-[13px] leading-snug text-warn">
                    · {o}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <Button ref={doneRef} size="lg" className="w-full" onClick={onClose}>
            {t("editDone", lang)}
          </Button>
        </footer>
      </motion.div>
    </div>
  );
}
