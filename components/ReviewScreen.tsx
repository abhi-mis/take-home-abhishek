"use client";

/**
 * The output screen. Three jobs:
 *
 * 1. Show the filled form back as STRUCTURED DATA, grouped by schema section, with
 *    every gated null explained rather than hidden. This is the thing being graded,
 *    so it is on screen and inspectable, not buried in a download.
 * 2. Gate the download on validate() - shape + all-16 coverage. If anything is
 *    unresolved, the failing questions become links that open that question.
 * 3. Handle the decline path: consent === false produces no JSON at all.
 *
 * CORRECTIONS HAPPEN HERE, NOT BACK IN THE FORM. Tapping a row opens that one question in
 * a dialog over this screen. The first version navigated back into the wizard, which is
 * the obvious implementation and the wrong behaviour: a patient reviewing sixteen answers
 * wants to fix one, and being dropped back into the form loses their place and makes the
 * way out either Next through everything after it or a Back button that reads like
 * undoing. The only exception is the declined-consent path, which really is a different
 * screen.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { INTAKE_SCHEMA, QUESTIONS } from "@/lib/schema";
import { optionLabel, questionCopy, sectionLabel, t, ui, type Lang } from "@/lib/i18n";
import { buildOutput, validate } from "@/lib/validate";
import type { Answers, Meta } from "@/lib/types";
import { Button, CheckIcon } from "./ui/Button";
import { cn, downloadJson } from "@/lib/utils";
import { AppBar, APP_BAR_PAD } from "./AppBar";
import { JsonDialog } from "./JsonDialog";
import { useIntake } from "@/lib/store";
import { doneTitle, personalSummary } from "@/lib/patient";
import { EditQuestionDialog } from "./EditQuestionDialog";
import { ALL_STEPS, isStepVisible, validateStep } from "@/lib/steps";

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
  /** Takes a SECTION id. Only the declined-consent path uses it; rows open a dialog. */
  onJump: (sectionId: string) => void;
  onRestart: () => void;
}) {
  const [showJson, setShowJson] = useState(false);
  /** Which question is open for correction, by step id. */
  const [editing, setEditing] = useState<string | null>(null);
  // One field per selector: a selector that builds a value re-renders forever.
  const comfort = useIntake((st) => st.comfort);
  const setComfort = useIntake((st) => st.setComfort);
  const comfortAsked = useIntake((st) => st.comfortAsked);
  const lang = useIntake((st) => st.lang);
  const setLang = useIntake((st) => st.setLang);
  const patch = useIntake((st) => st.patch);
  const setSex = useIntake((st) => st.setSex);
  const setAge = useIntake((st) => st.setAge);
  const setFirstName = useIntake((st) => st.setFirstName);
  const chooseNone = useIntake((st) => st.chooseNone);
  const UI = ui(lang);
  const COPY_L = questionCopy(lang);

  /**
   * What is still outstanding, per question, in language a patient can act on.
   *
   * `validate()` also reports this, and its `issues` were being printed straight onto this
   * screen: "products.Oral Minoxidil.helped: required when used is true",
   * "procedures.PRP/GFC/iPRF.done: Expected boolean, received null". Those are Zod paths and
   * schema invariants - they exist so the DOWNLOAD can refuse a malformed object, and they
   * are the right words for that job and the wrong ones for a person. A patient reading
   * "Expected boolean, received null" has been handed a stack trace.
   *
   * `validateStep` answers the same question in the form's own vocabulary, because it builds
   * its list from the `lib/followups.ts` descriptors - which are translated, and which name
   * the row rather than its path ("Oral Minoxidil: did it help?"). It is also the exact list
   * the section screens show, so the review screen and the section a patient jumps back to
   * cannot disagree about what is missing.
   *
   * One entry per question rather than per field, so the count at the top is a number of
   * questions - which is what the links underneath it are.
   */
  const outstanding = useMemo(
    () =>
      ALL_STEPS.filter((step) => step.key !== null && isStepVisible(step, meta))
        .map((step) => ({ step, check: validateStep(step, answers, meta, explicitNone, lang) }))
        .filter(({ check }) => !check.complete),
    [answers, meta, explicitNone, lang],
  );

  const result = useMemo(
    () => validate(answers, meta, explicitNone),
    [answers, meta, explicitNone],
  );
  const output = useMemo(() => buildOutput(answers, meta), [answers, meta]);

  /*
    The step being corrected, looked up from ALL_STEPS rather than the visible list: a
    question can be reviewed even in a state where gating would hide it, and the dialog
    should show what the row shows.
  */
  const editStep = editing === null ? null : (ALL_STEPS.find((s) => s.id === editing) ?? null);

  if (answers.consent === false) return <Declined lang={lang} onJump={onJump} />;

  return (
    /*
      Wider on desktop, and only here.

      The question screens keep a 560px column because a question is prose and prose wants a
      measure. This screen is a LIST of seventeen short rows, which is the one place the
      extra width genuinely helps: at 448px it scrolled for about three screens on a 900px
      display with a thousand pixels going spare beside it.
    */
    <div className="min-h-dvh bg-paper">
      <AppBar lang={lang} comfort={comfort} onComfort={setComfort} onLang={setLang} />
      {/*
        Two elements, because they were fighting over one.

        The bar padding and the content padding were both `pt-*` on the same div, and
        tailwind-merge resolves that conflict by keeping the last one - so `APP_BAR_PAD` won
        and the `pt-6` intended as breathing room was silently dropped. The heading ended up
        one pixel ABOVE the bar's bottom edge, which is what a patient reported. Clearing the
        chrome and spacing the content are two different jobs and now sit on two elements, the
        way the section screens already did it.
      */}
      <div className={APP_BAR_PAD}>
        <div className="mx-auto w-full max-w-md px-5 pb-16 pt-6 desk:max-w-4xl desk:px-8 desk:pt-10">
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
            <h1 className="font-display text-[23px] font-bold leading-tight text-ink">
              {/* "All done, Anjali" - the last of the three places the name appears. */}
              {doneTitle(meta, result.valid ? UI.reviewTitle : UI.reviewIncomplete, lang)}
            </h1>
            <p className="text-[13.5px] text-muted">
              {result.valid
                ? UI.reviewBody
                : outstanding.length === 1
                  ? t("reviewNeedAttention", lang)
                  : t("reviewNeedAttentionN", lang, { n: outstanding.length })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Anything unresolved becomes a direct jump back to that question. */}
      {!result.valid ? (
        <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 p-4">
          <ul className="flex flex-col gap-3">
            {outstanding.map(({ step, check }) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setEditing(step.key as string)}
                  className="min-h-[44px] text-left text-[14px] font-semibold text-warn underline decoration-warn/40 underline-offset-2 transition-colors hover:decoration-warn"
                >
                  {COPY_L[step.key as keyof typeof COPY_L]?.title ?? step.key} →
                </button>
                {/*
                  What is missing INSIDE that question, which is the part the links alone
                  could not say: "Hair products you use" does not tell a patient which of
                  five rows is half answered.
                */}
                {check.outstanding.length > 0 ? (
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {check.outstanding.slice(0, 6).map((o) => (
                      <li key={o} className="flex gap-2 text-[13px] leading-snug text-warn/85">
                        <span aria-hidden>·</span>
                        <span>{o}</span>
                      </li>
                    ))}
                    {check.outstanding.length > 6 ? (
                      <li className="text-[12.5px] italic text-warn/70">
                        {t("andMore", lang, { n: check.outstanding.length - 6 })}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        Two columns from lg up. `items-start` because the sections have different heights and
        stretching them to match would put a lot of empty card under the short ones.
      */}
      <div className="mt-6 flex flex-col gap-5 desk:grid desk:grid-cols-2 desk:items-start desk:gap-x-6">
        {/*
          About You, first, because that is where it was answered - and because
          `patient_sex` and `patient_age` are in the downloaded JSON, so leaving them off
          this screen would mean showing the patient less than the doctor gets.
        */}
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            0 · {sectionLabel(lang)["0"] ?? ""}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            <button
              type="button"
              onClick={() => setEditing(ALL_STEPS[0]!.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-soft/40 active:bg-paper"
            >
              <span aria-hidden className="w-5 shrink-0 pt-0.5 text-[12px] font-bold text-brand/50">
                ·
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium leading-snug text-muted">
                  {t("aboutRowLabel", lang)}
                </span>
                <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-ink">
                  {personalSummary(meta, lang) === "" ? (
                    <Missing lang={lang} />
                  ) : (
                    personalSummary(meta, lang)
                  )}
                </span>
              </span>
              <span aria-hidden className="pt-1 text-muted">
                ›
              </span>
            </button>
          </div>
        </section>

        {INTAKE_SCHEMA.sections.map((section) => (
          <section key={section.id}>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {section.id} · {sectionLabel(lang)[section.id] ?? section.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              {section.questions.map((q, i) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => setEditing(q.key)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-soft/40 active:bg-paper",
                    i > 0 && "border-t border-line",
                  )}
                >
                  <span className="w-5 shrink-0 pt-0.5 text-[12px] font-bold tabular-nums text-brand/50">
                    {q.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/*
                      The patient's own question, not the schema key. This row used to
                      read "AGE_HAIR_LOSS_BEGAN" over the answer, which is the field name
                      a developer needs and the last thing a patient should be shown on
                      the final screen - it made the summary look machine-generated. The
                      key is still exactly what goes into the JSON below.
                    */}
                    <span className="block text-[12.5px] font-medium leading-snug text-muted">
                      {COPY_L[q.key as keyof typeof COPY_L]?.title ?? q.key}
                    </span>
                    <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-ink">
                      {renderAnswer(q.key, answers, meta, lang)}
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

      <div className="mt-7 flex flex-col gap-3 desk:mx-auto desk:max-w-md">
        <Button
          size="lg"
          disabled={!result.valid}
          onClick={() => downloadJson("genoroot-intake.json", output)}
        >
          {result.valid ? UI.download : UI.downloadBlocked}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setShowJson((s) => !s)}>
          {showJson ? UI.hideJson : UI.showJson}
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          {UI.restart}
        </Button>
      </div>

      {editStep !== null ? (
        <EditQuestionDialog
          step={editStep}
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
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/*
        In a dialog, so the JSON scrolls and the page does not. Ninety lines of it appended to
        the review screen turned a two-screen page into a six-screen one, with the button that
        closed it again somewhere off the bottom.
      */}
      {showJson ? (
        <JsonDialog
          json={JSON.stringify(output, null, 2)}
          lang={lang}
          onClose={() => setShowJson(false)}
        />
      ) : null}

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-muted">
        {t("reviewNote", lang, { n: QUESTIONS.length })}
      </p>
        </div>
      </div>
    </div>
  );
}

/** Human-readable rendering of one answer, including WHY a null is a valid null. */
/**
 * The answer, as the patient should read it back.
 *
 * Note what is translated and what is not: the option NAMES go through `optionLabel`,
 * and the connecting words come from the dictionary, but the patient's own free text
 * (the salon treatment, the side-effect description) is never touched. Translating what
 * someone typed would be putting words in their mouth. The raw JSON below this list is
 * always the English schema strings either way.
 */
function renderAnswer(key: string, a: Answers, meta: Meta, lang: Lang): React.ReactNode {
  const opt = (v: string) => optionLabel(v, lang);
  const gatedOut =
    (key === "menstrual_cycle" || key === "pregnancy_related") && meta.patient_sex !== "female";
  if (gatedOut)
    return <span className="font-normal italic text-muted">{t("rvSkipped", lang)}</span>;

  switch (key) {
    case "habits": {
      const h = a.habits;
      // `null` is rendered as "?" rather than folded into the "no" branch - an
      // unanswered row must never read as a confident No on the doctor's summary.
      const yn = (v: boolean | null, yes: string, no: string) =>
        v === null ? "? " + yes : v ? yes : no;
      const bits = [
        h.smoking === true
          ? `${t("rvSmoking", lang)}: ${h.smoking_severity === null ? "?" : opt(h.smoking_severity)}`
          : yn(h.smoking, t("rvSmoking", lang), t("rvNoSmoking", lang)),
        yn(h.alcohol, t("rvAlcohol", lang), t("rvNoAlcohol", lang)),
        yn(h.hard_water, t("rvHardWater", lang), t("rvNoHardWater", lang)),
        `${t("rvWash", lang)}: ${h.hair_wash_frequency === null ? " - " : opt(h.hair_wash_frequency)}`,
        yn(h.heating_tools_styling_chemicals, t("rvHeat", lang), t("rvNoHeat", lang)),
        h.salon_treatments === true
          ? `${t("rvSalon", lang)}: ${h.salon_treatment_detail ?? "?"}`
          : yn(h.salon_treatments, t("rvSalon", lang), t("rvNoSalon", lang)),
      ];
      return <span className="font-normal">{bits.join(" · ")}</span>;
    }
    case "products": {
      const used = Object.entries(a.products).filter(([, v]) => v.used === true);
      const unanswered = Object.values(a.products).some((v) => v.used === null);
      if (unanswered) return <Missing lang={lang} />;
      if (used.length === 0) return <Empty label={t("rvNoProducts", lang)} />;
      return (
        <span className="font-normal">
          {used
            .map(
              ([row, v]) =>
                `${opt(row)} (${v.duration === null ? "?" : opt(v.duration)}, ${
                  v.helped ? t("rvHelped", lang) : t("rvNoHelp", lang)
                })`,
            )
            .join(" · ")}
        </span>
      );
    }
    case "procedures": {
      const done = Object.entries(a.procedures).filter(([, v]) => v.done === true);
      const pending = Object.values(a.procedures).some((v) => v.done === null);
      if (pending) return <Missing lang={lang} />;
      if (done.length === 0) return <Empty label={t("rvNoProcedures", lang)} />;
      return (
        <span className="font-normal">
          {done
            .map(([row, v]) => `${opt(row)} (${v.sessions === null ? "?" : opt(v.sessions)})`)
            .join(" · ")}
        </span>
      );
    }
    case "past_treatment_side_effects":
      if (a.past_treatment_side_effects === null) return <Missing lang={lang} />;
      return (
        <span className="font-normal">
          {a.past_treatment_side_effects
            ? `${ui(lang).yes} - ${a.past_treatment_describe ?? "?"}`
            : ui(lang).no}
        </span>
      );
    default: {
      const v = a[key as "duration"];
      if (Array.isArray(v))
        return v.length === 0 ? (
          <Empty label={t("rvNoneSelected", lang)} />
        ) : (
          <span className="font-normal">{v.map(opt).join(" · ")}</span>
        );
      if (v === null) return <Missing lang={lang} />;
      if (typeof v === "boolean")
        return <span className="font-normal">{v ? ui(lang).yes : ui(lang).no}</span>;
      // A number (the onset age) needs no translation; a string is a schema option.
      return <span className="font-normal">{typeof v === "string" ? opt(v) : String(v)}</span>;
    }
  }
}

function Empty({ label }: { label: string }) {
  return <span className="font-normal italic text-muted">[] - {label}</span>;
}
function Missing({ lang }: { lang: Lang }) {
  return <span className="font-normal italic text-warn">{t("rvNotAnswered", lang)}</span>;
}

function Declined({ lang, onJump }: { lang: Lang; onJump: (id: string) => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-16">
      <h1 className="font-display text-[23px] font-bold leading-tight text-ink">
        {t("declinedTitle", lang)}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("declinedBody", lang)}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">{t("declinedNote", lang)}</p>
      <Button className="mt-7 w-full" size="lg" variant="secondary" // Section E, not the question: onJump addresses sections now.
        onClick={() => onJump("E")}>
        {t("declinedBack", lang)}
      </Button>
    </div>
  );
}
