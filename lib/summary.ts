/**
 * What a collapsed question card says about itself.
 *
 * Two strings per question: a short label written for a 46px row, and the answer rendered
 * small enough to sit beside it. Neither is derived by truncating the real question, which
 * would produce "Has a doctor diagnosed you wi..." and help nobody.
 *
 * Three rules with teeth:
 *
 *  - An unanswered question never reads as an answer. It says so.
 *  - A table is summarised by COVERAGE, not by a value. "Products: Yes" would be a lie
 *    about five rows, so it says how many are answered and how many are in use.
 *  - The patient's own free text is never paraphrased or shortened into something they did
 *    not write. It is shown as given.
 */
import type { TextKey } from "./copy.hi";
import { optionLabel, t, ui, type Lang } from "./i18n";
import { personalSummary } from "./patient";
import type { Step } from "./steps";
import { PRODUCT_ROWS, PROCEDURE_ROWS, type Answers, type Meta } from "./types";

/** Step id to the label written for a collapsed row. */
const SHORT: Record<string, TextKey> = {
  about_you: "shortAbout",
  age_hair_loss_began: "shortOnset",
  duration: "shortDuration",
  family_history: "shortFamily",
  pattern: "shortPattern",
  diagnosed_conditions: "shortConditions",
  menstrual_cycle: "shortPeriods",
  pregnancy_related: "shortPregnancy",
  adult_acne_oily_skin: "shortAcne",
  excess_body_facial_hair: "shortBodyHair",
  past_6_months: "shortPast6m",
  habits: "shortHabits",
  products: "shortProducts",
  procedures: "shortProcedures",
  past_treatment_side_effects: "shortSideEffects",
  sample_type: "shortSample",
  consent: "shortConsent",
};

export function shortLabel(step: Step, lang: Lang): string {
  const key = SHORT[step.id];
  return key === undefined ? step.id : t(key, lang);
}

/** A multi-select, capped so it cannot push the answer out of its row. */
function listSummary(values: string[], lang: Lang): string {
  if (values.length === 0) return t("summaryNone", lang);
  const first = optionLabel(values[0] ?? "", lang);
  if (values.length === 1) return first;
  return t("summaryPlusMore", lang, { first, n: values.length - 1 });
}

/**
 * A table row set, summarised by how much of it is done.
 *
 * A single value would misrepresent five rows, and listing them would not fit. Coverage is
 * the honest reduction: how many rows have an answer, and how many of those are a yes.
 */
function tableSummary(
  rows: readonly string[],
  entries: Record<string, Record<string, unknown>>,
  flag: string,
  lang: Lang,
): string {
  let answered = 0;
  let inUse = 0;
  for (const row of rows) {
    const value = (entries[row] ?? {})[flag];
    if (value === null || value === undefined) continue;
    answered += 1;
    if (value === true) inUse += 1;
  }
  if (answered === 0) return t("summaryNotAnswered", lang);
  return inUse === 0
    ? t("summaryCoverageDone", lang, { answered })
    : t("summaryCoverage", lang, { answered, inUse });
}

export function answerSummary(step: Step, answers: Answers, meta: Meta, lang: Lang): string {
  const UI = ui(lang);
  const none = t("summaryNotAnswered", lang);

  if (step.kind === "about") return personalSummary(meta, lang);

  switch (step.key) {
    case "age_hair_loss_began": {
      const v = answers.age_hair_loss_began;
      return v === null ? none : t("summaryYears", lang, { age: v });
    }
    case "family_history":
      return listSummary(answers.family_history, lang);
    case "pattern":
      return listSummary(answers.pattern, lang);
    case "diagnosed_conditions":
      return listSummary(answers.diagnosed_conditions, lang);
    case "past_6_months":
      return listSummary(answers.past_6_months, lang);

    case "habits": {
      // The habits question has no flag column, so coverage counts answered fields.
      const h = answers.habits as unknown as Record<string, unknown>;
      const fields = [
        "smoking",
        "alcohol",
        "hard_water",
        "hair_wash_frequency",
        "heating_tools_styling_chemicals",
        "salon_treatments",
      ];
      const answered = fields.filter((k) => h[k] !== null && h[k] !== undefined).length;
      return answered === 0 ? none : t("summaryCoverageDone", lang, { answered });
    }

    case "products":
      return tableSummary(
        PRODUCT_ROWS,
        answers.products as unknown as Record<string, Record<string, unknown>>,
        "used",
        lang,
      );

    case "procedures":
      return tableSummary(
        PROCEDURE_ROWS,
        answers.procedures as unknown as Record<string, Record<string, unknown>>,
        "done",
        lang,
      );

    case "past_treatment_side_effects": {
      const v = answers.past_treatment_side_effects;
      if (v === null) return none;
      // The description is the patient's own words: quoted, never paraphrased.
      return v ? `${UI.yes}: ${answers.past_treatment_describe ?? ""}`.trim() : UI.no;
    }

    case "consent": {
      const v = answers.consent;
      if (v === null) return none;
      /*
        Consent collapses like any other card, which was a deliberate decision. The summary
        therefore says what was agreed to rather than a bare "Yes": a clinical record should
        not reduce informed consent to a word that could mean anything.
      */
      return v ? t("summaryConsentYes", lang) : t("summaryConsentNo", lang);
    }

    default: {
      const v = answers[step.key as "duration"];
      if (v === null || v === undefined) return none;
      if (typeof v === "boolean") return v ? UI.yes : UI.no;
      if (typeof v === "string") return optionLabel(v, lang);
      return String(v);
    }
  }
}
