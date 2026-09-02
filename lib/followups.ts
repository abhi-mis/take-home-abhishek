/**
 * "Layered" questions, made answerable.
 *
 * Q11/12/13 are tables whose rows unfold into more questions the moment a row is
 * answered Yes. That is fine when a patient taps their way down the grid, but after a
 * voice fill it is the worst part of the form: the model has answered eight fields and
 * left three blank, and those three are scattered inside collapsed rows the patient now
 * has to hunt for.
 *
 * So instead of printing "3 things missing" and abandoning them, every outstanding field
 * is described here as a self-contained question - its own wording, its own control, its
 * own options - which FollowUpFlow then asks one at a time. The patient answers three
 * big taps in a row and is done.
 *
 * These descriptors are also what validateStep() builds its messages from, so the
 * "still needed" list and the follow-up questions can never disagree about what is
 * missing.
 */
import { optionLabel, t, ui, type Lang } from "./i18n";
import type { TextKey } from "./copy.hi";
import {
  HABIT_YESNO_KEYS,
  PRODUCT_DUR,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SESSIONS,
  SMOKING_SEV,
  WASH,
  type Answers,
} from "./types";

export interface OutstandingField {
  /** Unique, stable key: "habits.hard_water" or "Supplements.duration". */
  path: string;
  /** Table row name, or null for the habits question (whose rows ARE the fields). */
  row: string | null;
  field: string;
  /** Short context for the compact "still needed" list. */
  label: string;
  /** The full question, asked the way a nurse would ask it. */
  question: string;
  kind: "yesno" | "options" | "text";
  options?: readonly string[];
  placeholder?: string;
}

/**
 * Keys rather than sentences, because these questions are read by the patient.
 *
 * They used to be English literals here, which is exactly the shape that cannot be
 * translated: the follow-up flow is the most conversational surface in the app, so an
 * English question inside it is the most jarring place for one to appear.
 */
const HABIT_QUESTIONS: Record<
  string,
  { label: TextKey; question: TextKey; kind: OutstandingField["kind"]; options?: readonly string[] }
> = {
  // Merged with its severity scale into one option row, so not a yes/no any more.
  smoking: { label: "habitSmoking", question: "habitSmokingHelp", kind: "options" },
  alcohol: { label: "habitAlcohol", question: "fuAlcoholQ", kind: "yesno" },
  hard_water: { label: "habitWater", question: "habitWaterHelp", kind: "yesno" },
  heating_tools_styling_chemicals: {
    label: "habitHeat",
    question: "fuHeatQ",
    kind: "yesno",
  },
  salon_treatments: { label: "habitSalon", question: "fuSalonQ", kind: "yesno" },
  hair_wash_frequency: {
    label: "habitWash",
    question: "habitWashHelp",
    kind: "options",
    options: WASH,
  },
  smoking_severity: {
    label: "fuSmokingAmountLabel",
    question: "fuSmokingAmountQ",
    kind: "options",
    options: SMOKING_SEV,
  },
};

/** Everything still unanswered on Q11, in the order the patient should be asked. */
function habitsOutstanding(a: Answers, lang: Lang): OutstandingField[] {
  const out: OutstandingField[] = [];
  const add = (field: string, extra?: Partial<OutstandingField>) => {
    const q = HABIT_QUESTIONS[field];
    if (!q) return;
    out.push({
      path: `habits.${field}`,
      row: null,
      field,
      label: t(q.label, lang),
      question: t(q.question, lang),
      kind: q.kind,
      options: q.options,
      ...extra,
    });
  };

  /**
   * Order matters here. A layered follow-up is emitted immediately after its own
   * trigger, not appended at the end - so "Do you smoke? Yes" is followed by "How much
   * do you smoke?" while the patient is still thinking about smoking, instead of
   * circling back to it four questions later. That is the difference between a
   * conversation and a queue.
   */
  for (const field of HABIT_YESNO_KEYS) {
    if (a.habits[field] === null) {
      add(field);
      // The trigger is unanswered, so its layer cannot be asked yet; it will appear on
      // the next render if the answer turns out to be Yes.
      continue;
    }
    if (field === "smoking" && a.habits.smoking === true && a.habits.smoking_severity === null) {
      add("smoking_severity");
    }
    if (
      field === "salon_treatments" &&
      a.habits.salon_treatments === true &&
      !(a.habits.salon_treatment_detail ?? "").trim()
    ) {
      out.push({
        path: "habits.salon_treatment_detail",
        row: null,
        field: "salon_treatment_detail",
        label: t("fuSalonDetailLabel", lang),
        question: t("fuSalonDetailQ", lang),
        kind: "text",
        placeholder: t("habitSalonPlaceholder", lang),
      });
    }
  }
  if (a.habits.hair_wash_frequency === null) add("hair_wash_frequency");
  return out;
}

/** Q12/Q13 share a shape: a flag column, then detail columns that depend on it. */
function tableOutstanding(
  rows: readonly string[],
  entries: Record<string, Record<string, unknown>>,
  lang: Lang,
  spec: {
    flag: string;
    flagQuestion: (row: string) => string;
    details: {
      field: string;
      label: string;
      question: (row: string) => string;
      kind: OutstandingField["kind"];
      options?: readonly string[];
    }[];
  },
): OutstandingField[] {
  const out: OutstandingField[] = [];
  for (const row of rows) {
    const e = entries[row] ?? {};
    if (e[spec.flag] === null || e[spec.flag] === undefined) {
      out.push({
        path: `${row}.${spec.flag}`,
        row,
        field: spec.flag,
        label: optionLabel(row, lang),
        question: spec.flagQuestion(row),
        /*
          "options", not "yesno", since the flag was merged into the row's option list.

          The control a patient sees is [Never][<3mo][3-6mo][>6mo] - there is no Yes/No on
          the row any more - so "choose Yes or No" described a button that does not exist.
          It went unnoticed while these strings only appeared in a section's own note; it
          became visible the moment the review screen started rendering them instead of the
          validator's schema paths.
        */
        kind: "options",
      });
      continue;
    }
    if (e[spec.flag] !== true) continue; // a "No" row has no layers to unfold
    for (const d of spec.details) {
      if (e[d.field] === null || e[d.field] === undefined) {
        out.push({
          path: `${row}.${d.field}`,
          row,
          field: d.field,
          label: `${optionLabel(row, lang)} - ${d.label}`,
          question: d.question(row),
          kind: d.kind,
          options: d.options,
        });
      }
    }
  }
  return out;
}

export function productsOutstanding(a: Answers, lang: Lang): OutstandingField[] {
  // `row` is a schema string, so it is translated for display exactly where it is read
  // out - the stored answer keeps the English row name.
  const name = (row: string) => optionLabel(row, lang);
  return tableOutstanding(
    PRODUCT_ROWS,
    a.products as unknown as Record<string, Record<string, unknown>>,
    lang,
    {
      flag: "used",
      flagQuestion: (row) => t("fuUseRow", lang, { row: name(row) }),
      details: [
        {
          field: "duration",
          label: t("dlHowLong", lang),
          question: (row) => t("fuHowLongRow", lang, { row: name(row) }),
          kind: "options",
          options: PRODUCT_DUR,
        },
        {
          field: "helped",
          label: t("dlHelped", lang),
          question: (row) => t("fuHelpedRow", lang, { row: name(row) }),
          kind: "yesno",
        },
        {
          field: "side_effects",
          label: t("dlSideEffects", lang),
          question: (row) => t("fuSideEffectsRow", lang, { row: name(row) }),
          kind: "yesno",
        },
      ],
    },
  );
}

export function proceduresOutstanding(a: Answers, lang: Lang): OutstandingField[] {
  const name = (row: string) => optionLabel(row, lang);
  return tableOutstanding(
    PROCEDURE_ROWS,
    a.procedures as unknown as Record<string, Record<string, unknown>>,
    lang,
    {
      flag: "done",
      flagQuestion: (row) => t("fuHadRow", lang, { row: name(row) }),
      details: [
        {
          field: "sessions",
          label: t("dlSessions", lang),
          question: (row) => t("fuSessionsRow", lang, { row: name(row) }),
          kind: "options",
          options: SESSIONS,
        },
        {
          field: "helped",
          label: t("dlHelped", lang),
          question: (row) => t("fuHelpedRow", lang, { row: name(row) }),
          kind: "yesno",
        },
      ],
    },
  );
}

/** All outstanding fields for one table question. */
export function outstandingFieldsFor(
  questionKey: string | null,
  answers: Answers,
  lang: Lang,
): OutstandingField[] {
  if (questionKey === "habits") return habitsOutstanding(answers, lang);
  if (questionKey === "products") return productsOutstanding(answers, lang);
  if (questionKey === "procedures") return proceduresOutstanding(answers, lang);
  return [];
}

/** One answered field, formatted for the post-voice confirmation summary. */
export interface AnsweredField {
  label: string;
  value: string;
}

const yn = (v: unknown, lang: Lang) =>
  v === true ? ui(lang).yes : v === false ? ui(lang).no : "-";

/**
 * What IS answered, in display form.
 *
 * The mirror of outstandingFieldsFor(). After a voice fill the patient has to be able
 * to check the model's work without reading a grid, so this produces a flat
 * label/value list: "Smoking - Yes (Moderate 5-10/day)". Rows the patient said nothing
 * about are simply absent, which is the honest rendering - they are not "No".
 */
export function answeredFieldsFor(
  questionKey: string | null,
  a: Answers,
  lang: Lang,
): AnsweredField[] {
  const out: AnsweredField[] = [];
  const UI = ui(lang);
  const opt = (v: string) => optionLabel(v, lang);

  if (questionKey === "habits") {
    const h = a.habits;
    if (h.smoking !== null)
      out.push({
        label: t("habitSmoking", lang),
        value: h.smoking
          ? `${UI.yes}${h.smoking_severity ? ` (${opt(h.smoking_severity)})` : ""}`
          : UI.no,
      });
    if (h.alcohol !== null)
      out.push({ label: t("habitAlcohol", lang), value: yn(h.alcohol, lang) });
    if (h.hard_water !== null)
      out.push({ label: t("habitWater", lang), value: yn(h.hard_water, lang) });
    if (h.hair_wash_frequency !== null)
      out.push({ label: t("habitWash", lang), value: opt(h.hair_wash_frequency) });
    if (h.heating_tools_styling_chemicals !== null)
      out.push({
        label: t("habitHeat", lang),
        value: yn(h.heating_tools_styling_chemicals, lang),
      });
    if (h.salon_treatments !== null)
      out.push({
        label: t("habitSalon", lang),
        // The free-text detail is the patient's own words, so it is never translated.
        value: h.salon_treatments
          ? `${UI.yes}${h.salon_treatment_detail ? ` (${h.salon_treatment_detail})` : ""}`
          : UI.no,
      });
    return out;
  }

  if (questionKey === "products") {
    for (const row of PRODUCT_ROWS) {
      const e = a.products[row];
      if (e.used === null) continue;
      if (!e.used) {
        out.push({ label: opt(row), value: t("svNotUsed", lang) });
        continue;
      }
      const bits = [
        e.duration === null ? "?" : opt(e.duration),
        e.helped === null
          ? t("svHelpUnknown", lang)
          : e.helped
            ? t("svHelped", lang)
            : t("svNotHelped", lang),
        e.side_effects === null
          ? t("svSideUnknown", lang)
          : e.side_effects
            ? t("svSideEffects", lang)
            : t("svNoSideEffects", lang),
      ];
      out.push({ label: opt(row), value: `${t("svUsed", lang)} - ${bits.join(", ")}` });
    }
    return out;
  }

  if (questionKey === "procedures") {
    for (const row of PROCEDURE_ROWS) {
      const e = a.procedures[row];
      if (e.done === null) continue;
      if (!e.done) {
        out.push({ label: opt(row), value: t("svNotDone", lang) });
        continue;
      }
      const bits = [
        e.sessions === null
          ? t("svSessionsUnknown", lang)
          : t("svSessions", lang, { n: opt(e.sessions) }),
        e.helped === null
          ? t("svHelpUnknown", lang)
          : e.helped
            ? t("svHelped", lang)
            : t("svNotHelped", lang),
      ];
      out.push({ label: opt(row), value: `${t("svDone", lang)} - ${bits.join(", ")}` });
    }
    return out;
  }

  return out;
}
