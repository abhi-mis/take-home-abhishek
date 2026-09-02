"use client";

/**
 * One question's controls, wherever that question is being answered.
 *
 * This switch used to live inside the wizard page, which was fine while the wizard was
 * the only place a question could be answered. The review screen changed that: tapping a
 * row there now opens the question in a dialog instead of navigating the patient back
 * through the form. Two copies of "which control does `type: multi` mean?" is exactly the
 * kind of duplication that drifts, so it lives here and both callers render it.
 *
 * It is deliberately just the BODY - no title, no hint, no Back/Next. The section card wraps
 * it and the review dialog wraps it in its own frame, and neither has to agree with the
 * other about chrome.
 *
 * Adding a question to lib/schema.ts still needs no edit here as long as its `type` is
 * one of the kinds below - that is what the schema-driven wizard buys.
 */
import { getQuestion, type QuestionKey } from "@/lib/schema";
import type { Step } from "@/lib/steps";
import { maxOnsetAge, suggestionFor, unavailableOptions, type Comfort } from "@/lib/patient";
import { questionCopy, ui, type Lang } from "@/lib/i18n";
import { EXCLUSIVE_OPTIONS, hasNoneEscape, type Answers, type Meta, type PatientSex } from "@/lib/types";
import { SingleChoice } from "./SingleChoice";
import { MultiChoice } from "./MultiChoice";
import { YesNo } from "./YesNo";
import { NumberStepper } from "./NumberStepper";
import { AboutYou } from "./AboutYou";
import { Consent } from "./Consent";
import { TableQuestion } from "./TableQuestion";
import { YesNoDescribe } from "./YesNoDescribe";
import { PatternPicker } from "./PatternPicker";

export interface QuestionBodyProps {
  step: Step;
  answers: Answers;
  meta: Meta;
  lang: Lang;
  comfort: Comfort;
  comfortAsked: boolean;
  explicitNone: Record<string, true>;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number | null) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
}

export function QuestionBody({
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
}: QuestionBodyProps) {
  const COPY_L = questionCopy(lang);

  switch (step.kind) {
    case "about":
      return (
        <AboutYou
          lang={lang}
          firstName={meta.first_name}
          sex={meta.patient_sex}
          age={meta.patient_age}
          comfort={comfort}
          comfortAsked={comfortAsked}
          onFirstName={setFirstName}
          onSex={setSex}
          onAge={setAge}
        />
      );

    case "number":
      return (
        <NumberStepper
          lang={lang}
          value={answers.age_hair_loss_began}
          // Cannot have started after the age they just told us they are.
          max={maxOnsetAge(meta)}
          currentAge={meta.patient_age}
          onChange={(v) => patch({ age_hair_loss_began: v })}
        />
      );

    case "single": {
      const key = step.key as QuestionKey;
      const q = getQuestion(key);
      return (
        <SingleChoice
          lang={lang}
          options={"options" in q ? q.options : []}
          gloss={COPY_L[key]?.gloss}
          withIcons
          value={answers[key as "duration"]}
          suggestion={suggestionFor(key, answers, meta, lang)}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
        />
      );
    }

    case "multi": {
      const key = step.key as QuestionKey;

      // Q4 is the picture question - a grid of scalp diagrams rather than a text list,
      // because patients recognise the shape long before the clinical term.
      if (key === "pattern") {
        return (
          <PatternPicker
            lang={lang}
            values={answers.pattern}
            noneChosen={explicitNone.pattern === true}
            onChange={(v) => patch({ pattern: v })}
            onChooseNone={() => chooseNone("pattern")}
          />
        );
      }

      const q = getQuestion(key);
      return (
        <MultiChoice
          lang={lang}
          options={"options" in q ? q.options : []}
          gloss={COPY_L[key]?.gloss}
          // PCOS/PCOD to a male patient: shown, greyed, and unpressable. See lib/patient.
          unavailable={unavailableOptions(key, "options" in q ? q.options : [], meta, lang)}
          exclusive={EXCLUSIVE_OPTIONS[key]}
          noneLabel={hasNoneEscape(key) ? ui(lang).none : undefined}
          noneChosen={explicitNone[key] === true}
          onChooseNone={() => chooseNone(key)}
          withIcons
          values={answers[key as "family_history"]}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
        />
      );
    }

    case "yesno": {
      const key = step.key as "adult_acne_oily_skin";
      return (
        <YesNo
          lang={lang}
          value={answers[key]}
          onChange={(v) => patch({ [key]: v } as Partial<Answers>)}
        />
      );
    }

    case "yesno_describe":
      return <YesNoDescribe answers={answers} patch={patch} lang={lang} />;

    case "table":
      return (
        <TableQuestion
          lang={lang}
          questionKey={step.key as "habits" | "products" | "procedures"}
          answers={answers}
          patch={patch}
        />
      );

    case "consent":
      return (
        <Consent value={answers.consent} onChange={(v) => patch({ consent: v })} lang={lang} />
      );
  }
}
