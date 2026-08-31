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

const HABIT_QUESTIONS: Record<
  string,
  { label: string; question: string; kind: OutstandingField["kind"]; options?: readonly string[] }
> = {
  smoking: { label: "Smoking", question: "Do you smoke?", kind: "yesno" },
  alcohol: { label: "Alcohol", question: "Do you drink alcohol?", kind: "yesno" },
  hard_water: {
    label: "Hard water",
    question: "Is the water at home hard?",
    kind: "yesno",
  },
  heating_tools_styling_chemicals: {
    label: "Heat or styling chemicals",
    question: "Do you use a dryer, straightener, or hair colour?",
    kind: "yesno",
  },
  salon_treatments: {
    label: "Salon treatments",
    question: "Have you had salon treatments like keratin or smoothening?",
    kind: "yesno",
  },
  hair_wash_frequency: {
    label: "Hair wash",
    question: "How often do you wash your hair?",
    kind: "options",
    options: WASH,
  },
  smoking_severity: {
    label: "Smoking amount",
    question: "How much do you smoke?",
    kind: "options",
    options: SMOKING_SEV,
  },
};

/** Everything still unanswered on Q11, in the order the patient should be asked. */
function habitsOutstanding(a: Answers): OutstandingField[] {
  const out: OutstandingField[] = [];
  const add = (field: string, extra?: Partial<OutstandingField>) => {
    const q = HABIT_QUESTIONS[field];
    if (!q) return;
    out.push({
      path: `habits.${field}`,
      row: null,
      field,
      label: q.label,
      question: q.question,
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
        label: "Salon treatment",
        question: "Which salon treatment did you have?",
        kind: "text",
        placeholder: "e.g. keratin, about 6 months ago",
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
        label: row,
        question: spec.flagQuestion(row),
        kind: "yesno",
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
          label: `${row} - ${d.label}`,
          question: d.question(row),
          kind: d.kind,
          options: d.options,
        });
      }
    }
  }
  return out;
}

export function productsOutstanding(a: Answers): OutstandingField[] {
  return tableOutstanding(
    PRODUCT_ROWS,
    a.products as unknown as Record<string, Record<string, unknown>>,
    {
      flag: "used",
      flagQuestion: (row) => `Do you use ${lower(row)}?`,
      details: [
        {
          field: "duration",
          label: "how long",
          question: (row) => `How long have you been using ${lower(row)}?`,
          kind: "options",
          options: PRODUCT_DUR,
        },
        {
          field: "helped",
          label: "did it help",
          question: (row) => `Did ${lower(row)} help?`,
          kind: "yesno",
        },
        {
          field: "side_effects",
          label: "side effects",
          question: (row) => `Any side effects from ${lower(row)}?`,
          kind: "yesno",
        },
      ],
    },
  );
}

export function proceduresOutstanding(a: Answers): OutstandingField[] {
  return tableOutstanding(
    PROCEDURE_ROWS,
    a.procedures as unknown as Record<string, Record<string, unknown>>,
    {
      flag: "done",
      flagQuestion: (row) => `Have you had ${lower(row)}?`,
      details: [
        {
          field: "sessions",
          label: "how many sessions",
          question: (row) => `How many sessions of ${lower(row)}?`,
          kind: "options",
          options: SESSIONS,
        },
        {
          field: "helped",
          label: "did it help",
          question: (row) => `Did ${lower(row)} help?`,
          kind: "yesno",
        },
      ],
    },
  );
}

/** Row names are Title Case in the schema; mid-sentence they read better lowered. */
function lower(row: string): string {
  // ...but not acronyms, which must stay as the clinic writes them.
  if (/^[A-Z0-9/+]+$/.test(row.replace(/[\s/]/g, ""))) return row;
  return row.charAt(0).toLowerCase() + row.slice(1);
}

/** All outstanding fields for one table question. */
export function outstandingFieldsFor(
  questionKey: string | null,
  answers: Answers,
): OutstandingField[] {
  if (questionKey === "habits") return habitsOutstanding(answers);
  if (questionKey === "products") return productsOutstanding(answers);
  if (questionKey === "procedures") return proceduresOutstanding(answers);
  return [];
}

/** One answered field, formatted for the post-voice confirmation summary. */
export interface AnsweredField {
  label: string;
  value: string;
}

const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : "-");

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
): AnsweredField[] {
  const out: AnsweredField[] = [];

  if (questionKey === "habits") {
    const h = a.habits;
    if (h.smoking !== null)
      out.push({
        label: "Smoking",
        value: h.smoking ? `Yes${h.smoking_severity ? ` (${h.smoking_severity})` : ""}` : "No",
      });
    if (h.alcohol !== null) out.push({ label: "Alcohol", value: yn(h.alcohol) });
    if (h.hard_water !== null) out.push({ label: "Hard water", value: yn(h.hard_water) });
    if (h.hair_wash_frequency !== null)
      out.push({ label: "Hair wash", value: h.hair_wash_frequency });
    if (h.heating_tools_styling_chemicals !== null)
      out.push({
        label: "Heat / styling chemicals",
        value: yn(h.heating_tools_styling_chemicals),
      });
    if (h.salon_treatments !== null)
      out.push({
        label: "Salon treatments",
        value: h.salon_treatments
          ? `Yes${h.salon_treatment_detail ? ` (${h.salon_treatment_detail})` : ""}`
          : "No",
      });
    return out;
  }

  if (questionKey === "products") {
    for (const row of PRODUCT_ROWS) {
      const e = a.products[row];
      if (e.used === null) continue;
      if (!e.used) {
        out.push({ label: row, value: "Not used" });
        continue;
      }
      const bits = [
        e.duration ?? "?",
        e.helped === null ? "help unknown" : e.helped ? "helped" : "did not help",
        e.side_effects === null ? "side effects unknown" : e.side_effects ? "side effects" : "no side effects",
      ];
      out.push({ label: row, value: `Used - ${bits.join(", ")}` });
    }
    return out;
  }

  if (questionKey === "procedures") {
    for (const row of PROCEDURE_ROWS) {
      const e = a.procedures[row];
      if (e.done === null) continue;
      if (!e.done) {
        out.push({ label: row, value: "Not done" });
        continue;
      }
      const bits = [
        e.sessions ? `${e.sessions} sessions` : "sessions ?",
        e.helped === null ? "help unknown" : e.helped ? "helped" : "did not help",
      ];
      out.push({ label: row, value: `Done - ${bits.join(", ")}` });
    }
    return out;
  }

  return out;
}
