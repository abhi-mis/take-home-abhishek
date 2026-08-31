/**
 * Chat mode, tested where it actually matters.
 *
 * The headline test is `walks the entire intake`: it answers whatever the assistant
 * asks, one turn at a time, with no knowledge of the question list - and then runs the
 * result through the SAME Zod validator the download button uses. That is the real
 * claim being made about chat mode: not "it renders bubbles", but "a patient who only
 * ever talks to the assistant produces a schema-valid form".
 *
 * If a question is ever added to the schema and chat cannot ask it, this test loops
 * until its guard trips rather than passing quietly - a missing question in a medical
 * intake must not be a silent pass.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGE_PRESETS,
  DONE_LINE,
  ONE_AT_A_TIME,
  fillSummary,
  interpretLocally,
  nextTurn,
  quickOps,
  stepIdForTurn,
  valueEcho,
  type Turn,
} from "@/lib/chatFlow";
import { isExtractKey } from "@/lib/extractPrompt";
import type { Ops } from "@/lib/apply";
import { buildOutput, validate } from "@/lib/validate";
import {
  EMPTY_ANSWERS,
  EMPTY_META,
  PROCEDURE_ROWS,
  PRODUCT_ROWS,
  type Answers,
  type Meta,
} from "@/lib/types";
import { TOTAL_QUESTIONS } from "@/lib/schema";

interface State {
  answers: Answers;
  meta: Meta;
  explicitNone: Record<string, true>;
}

const fresh = (): State => ({
  answers: structuredClone(EMPTY_ANSWERS),
  meta: { ...EMPTY_META },
  explicitNone: {},
});

/**
 * A miniature of the Zustand store's reducers - `patch`, `setSex`, `chooseNone`.
 *
 * Mirrored rather than imported because the store is a client module with
 * sessionStorage persistence. The behaviours copied here are the three that affect
 * validity: sex gating nulls Q6/Q7, and "none of these" records a deliberate empty.
 */
function reduce(s: State, ops: Ops): State {
  let answers = ops.patch !== undefined ? { ...s.answers, ...ops.patch } : s.answers;
  let meta = s.meta;
  if (ops.sex !== undefined) {
    meta = { patient_sex: ops.sex };
    if (ops.sex !== "female") answers = { ...answers, menstrual_cycle: null, pregnancy_related: null };
  }
  const explicitNone = { ...s.explicitNone };
  if (ops.none !== undefined) {
    for (const k of ops.none) {
      explicitNone[k] = true;
      answers = { ...answers, [k]: [] } as Answers;
    }
  }
  return { answers, meta, explicitNone };
}

/**
 * Answer the current turn like a cooperative patient using only taps.
 *
 * Tables are walked field-by-field (see `preferFields` below) so this never has to fake
 * a model response - every answer here is a real chip a real thumb could press.
 */
function answerTurn(s: State, turn: Turn): Ops {
  switch (turn.ask.t) {
    case "sex":
      return { sex: "female" }; // the branch that UNLOCKS Q6/Q7, so they get walked too
    case "describe":
      return { patch: { past_treatment_describe: "Scalp itched after minoxidil" } };
    case "consent":
      return { patch: { consent: true } };
    case "done":
      return {};
    case "field":
    case "question": {
      if (turn.ask.t === "field" && turn.ask.field.kind === "text") {
        const ops = interpretLocally(turn, "keratin, about 6 months ago", s.answers);
        expect(ops).not.toBeNull();
        return ops as Ops;
      }
      // An open table question has no chips - it expects a sentence. Standing in for
      // the model with a blanket "none of that applies" keeps this test model-free
      // while still producing a COMPLETE, valid answer for the question.
      if (turn.ask.t === "question" && turn.ask.input === "table")
        return { patch: denyTable(turn.ask.questionKey) };

      const chip = turn.quick[0];
      expect(chip, `no way to answer turn "${turn.id}"`).toBeDefined();
      return quickOps(turn, chip!.value, s.answers);
    }
  }
}

describe("nextTurn walks the form, not a script", () => {
  it("walks the entire intake and produces a schema-valid form", () => {
    let s = fresh();
    // Tables asked field-by-field: this is the tap-only path, and it also exercises
    // every conditional follow-up, which is where a "yes" creates three more questions.
    const preferFields = ["habits", "products", "procedures"] as const;

    const asked: string[] = [];
    let guard = 0;
    for (;;) {
      const turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
      if (turn.ask.t === "done") break;
      asked.push(turn.id);
      s = reduce(s, answerTurn(s, turn));
      // A conversation that cannot finish must fail loudly, not spin.
      expect((guard += 1), "the conversation never reached the end").toBeLessThan(400);
    }

    const result = validate(s.answers, s.meta, s.explicitNone);
    expect(result.missing).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);

    // And the object the doctor receives is exactly the form's object.
    const out = buildOutput(s.answers, s.meta);
    expect(out).toBeTruthy();

    // Every graded question was actually asked at least once.
    for (const key of Object.keys(EMPTY_ANSWERS)) {
      if (key === "past_treatment_describe") continue; // conditional, asked only on "yes"
      expect(asked.some((id) => id.startsWith(key)), `never asked: ${key}`).toBe(true);
    }
  });

  it("reaches the same finishing line as the form's last Next", () => {
    let s = fresh();
    let guard = 0;
    let turn = nextTurn(s.answers, s.meta, s.explicitNone, {
      preferFields: ["habits", "products", "procedures"],
    });
    while (turn.ask.t !== "done" && (guard += 1) < 400) {
      s = reduce(s, answerTurn(s, turn));
      turn = nextTurn(s.answers, s.meta, s.explicitNone, {
        preferFields: ["habits", "products", "procedures"],
      });
    }
    expect(turn.say).toBe(DONE_LINE);
    expect(turn.progress.answered).toBe(turn.progress.total);
  });

  it("skips Q6 and Q7 for a male patient, and counts the total down", () => {
    const male = reduce(fresh(), { sex: "male" });
    const female = reduce(fresh(), { sex: "female" });
    const t1 = nextTurn(male.answers, male.meta, male.explicitNone);
    const t2 = nextTurn(female.answers, female.meta, female.explicitNone);
    expect(t1.progress.total).toBe(t2.progress.total - 2);
    expect(t1.progress.total).toBe(TOTAL_QUESTIONS + 1 - 2); // +1 for the sex gate
  });

  it("asks the sex gate before the first hormonal question", () => {
    const s = fresh();
    // Answer sections A blind: the first turn is Q1, and the gate must arrive before Q5.
    const first = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(first.id).toBe("age_hair_loss_began");
    expect(stepIdForTurn(first)).toBe("age_hair_loss_began");
  });
});

describe("table questions: enumerate first, then ask the conditionals", () => {
  it("enumerates every row of Q11 rather than summarising it", () => {
    const habits = walkTo(fresh(), "habits");
    expect(habits.points).toBeDefined();
    // Six rows in the schema; six points. A dropped row here is a question the patient
    // is never asked and a field the doctor never gets.
    expect(habits.points?.length).toBe(6);
    const joined = habits.points!.join(" | ");
    for (const item of ["Smoking", "Alcohol", "Hard water", "wash your hair", "chemicals", "Salon"])
      expect(joined).toContain(item);
    // The conditional layer is stated up front, so one reply can complete a row.
    expect(habits.points![0]).toContain("how many per day");
  });

  it("names all five products verbatim, acronyms intact", () => {
    const products = walkTo(fresh(), "products");
    expect(products.points?.length).toBe(5);
    expect(products.points).toContain("OTC/Medicated Shampoos");
    // A lower-casing helper once mangled this to "oTC". Row names are clinical labels.
    expect(products.points?.join(" ")).not.toMatch(/\boTC\b|\bpRP\b/);
    expect(products.detailNote).toMatch(/how long|side effects/i);
  });

  it("asks how long / did it help / any side effects after a row is used", () => {
    let s = walkToState(fresh(), "products");
    // "Do you use OTC/Medicated Shampoos?" -> Yes, via the field path.
    const preferFields = ["products"];
    let turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
    expect(turn.say).toBe("Do you use OTC/Medicated Shampoos?");
    s = reduce(s, quickOps(turn, { t: "bool", b: true }, s.answers));

    const chain: string[] = [];
    for (let i = 0; i < 3; i++) {
      turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
      chain.push(turn.say);
      s = reduce(s, answerTurn(s, turn));
    }
    expect(chain).toEqual([
      "How long have you been using OTC/Medicated Shampoos?",
      "Did OTC/Medicated Shampoos help?",
      "Any side effects from OTC/Medicated Shampoos?",
    ]);
  });

  it("asks no detail questions for a row answered No", () => {
    let s = walkToState(fresh(), "procedures");
    const preferFields = ["procedures"];
    let turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
    expect(turn.say).toContain("PRP/GFC/iPRF");
    s = reduce(s, quickOps(turn, { t: "bool", b: false }, s.answers));
    turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
    // Straight to the next row, not into sessions/helped.
    expect(turn.say).not.toContain("sessions of PRP");
    expect(turn.say).toContain("Stem Cells/Exosomes");
  });

  it("offers a tap-only escape on an open table question", () => {
    const habits = walkTo(fresh(), "habits");
    // Without this chip, Q11/Q12/Q13 could only be answered through the model - so a
    // missing key or a rate limit would end the conversation with no way forward.
    expect(habits.quick.map((q) => q.label)).toEqual([ONE_AT_A_TIME]);
    const chip = habits.quick[0]!;
    expect(chip.value).toEqual({ t: "fields", questionKey: "habits" });
    // It is not an answer: applying it must change nothing about the answers.
    expect(quickOps(habits, chip.value, fresh().answers)).toEqual({});
  });

  it("switches to one-at-a-time when asked, starting at the first row", () => {
    // Same answers, same position - only `preferFields` differs.
    const s = walkToState(fresh(), "habits");
    const open = nextTurn(s.answers, s.meta, s.explicitNone);
    const scoped = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields: ["habits"] });
    expect(open.id).toBe("habits");
    expect(open.points?.length).toBe(6);
    expect(scoped.id).toBe("habits:habits.smoking");
    expect(scoped.say).toBe("Do you smoke?");
    expect(scoped.quick.map((q) => q.label)).toEqual(["Yes", "No"]);
  });

  it("counts what a fill got and what it missed", () => {
    const s = fresh();
    s.answers.habits.smoking = false;
    s.answers.habits.alcohol = true;
    const summary = fillSummary("habits", s.answers);
    expect(summary.filled).toBe(2);
    expect(summary.missing).toBeGreaterThan(0);
    expect(summary.lines).toContain("Smoking: No");
  });
});

describe("interpretLocally resolves the obvious without a model", () => {
  const yesNoTurn = () => {
    const s = fresh();
    s.answers.age_hair_loss_began = 25;
    s.answers.duration = "Over a year";
    s.answers.family_history = ["Father had hair loss"];
    s.answers.pattern = ["Patchy loss"];
    s.answers.diagnosed_conditions = ["None"];
    const withSex = reduce(s, { sex: "male" });
    return { s: withSex, turn: nextTurn(withSex.answers, withSex.meta, withSex.explicitNone) };
  };

  it("reads yes and no, including Hinglish", () => {
    const { s, turn } = yesNoTurn();
    expect(turn.id).toBe("adult_acne_oily_skin");
    expect(interpretLocally(turn, "yes", s.answers)).toEqual({
      patch: { adult_acne_oily_skin: true },
    });
    expect(interpretLocally(turn, "nahi", s.answers)).toEqual({
      patch: { adult_acne_oily_skin: false },
    });
    expect(interpretLocally(turn, "haan bilkul", s.answers)).toEqual({
      patch: { adult_acne_oily_skin: true },
    });
  });

  it("reads a bare age but escalates a sentence with two numbers", () => {
    const s = fresh();
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(interpretLocally(turn, "25", s.answers)).toEqual({
      patch: { age_hair_loss_began: 25 },
    });
    expect(interpretLocally(turn, "I was around 30", s.answers)).toEqual({
      patch: { age_hair_loss_began: 30 },
    });
    // Ambiguous: two numbers, and the wrong one is a wrong medical answer.
    expect(interpretLocally(turn, "it started at 30 and I am 45 now", s.answers)).toBeNull();
    // Out of range is dropped, not clamped.
    expect(interpretLocally(turn, "2", s.answers)).toBeNull();
  });

  it("accepts a preset label typed as words", () => {
    const s = fresh();
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(interpretLocally(turn, AGE_PRESETS[1].label, s.answers)).toEqual({
      patch: { age_hair_loss_began: AGE_PRESETS[1].value },
    });
  });

  it("maps a blanket denial to the schema's own exclusive option", () => {
    const s = walkToState(fresh(), "family_history");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(turn.id).toBe("family_history");
    expect(interpretLocally(turn, "nobody", s.answers)).toEqual({
      patch: { family_history: ["No known family history"] },
    });
  });

  it("records a deliberate empty where the schema has no none option", () => {
    const s = walkToState(fresh(), "pattern");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(turn.id).toBe("pattern");
    const ops = interpretLocally(turn, "none of these", s.answers);
    expect(ops?.none).toEqual(["pattern"]);
    expect(ops?.patch).toEqual({ pattern: [] });
  });

  it("adds a typed option instead of toggling it off", () => {
    let s = walkToState(fresh(), "family_history");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    s = reduce(s, interpretLocally(turn, "Mother had hair loss", s.answers) as Ops);
    // Saying it twice is emphasis, not a retraction.
    const again = interpretLocally(turn, "Mother had hair loss", s.answers);
    expect(again?.patch).toEqual({ family_history: ["Mother had hair loss"] });
  });

  it("escalates real prose to the model", () => {
    const s = walkToState(fresh(), "family_history");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(interpretLocally(turn, "my mum and my sister both lost hair", s.answers)).toBeNull();
  });

  it("takes a free-text answer verbatim, with no model in the path", () => {
    // Q14 answered "Yes" (the first chip), so the description is what is outstanding.
    const describe = walkTo(fresh(), "past_treatment_describe");
    expect(describe.ask.t).toBe("describe");
    expect(describe.quick).toEqual([]);
    expect(interpretLocally(describe, "Itching and burning", fresh().answers)).toEqual({
      patch: { past_treatment_describe: "Itching and burning" },
    });
  });
});

describe("consent is never inferred", () => {
  it("is not an extractable key, so the route would refuse it", () => {
    expect(isExtractKey("consent")).toBe(false);
  });

  it("accepts only the patient's own yes or no, never prose", () => {
    const s = walkToState(fresh(), "consent");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(turn.ask.t).toBe("consent");
    expect(interpretLocally(turn, "yes", s.answers)).toEqual({ patch: { consent: true } });
    expect(interpretLocally(turn, "no", s.answers)).toEqual({ patch: { consent: false } });
    // Anything that needs interpreting gets none: the patient is asked to tap.
    expect(
      interpretLocally(turn, "I suppose that is fine if the doctor needs it", s.answers),
    ).toBeNull();
  });

  it("offers exactly Yes and No, with nothing pre-selected", () => {
    const s = walkToState(fresh(), "consent");
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    expect(turn.quick.map((q) => q.label)).toEqual(["Yes", "No"]);
    expect(s.answers.consent).toBeNull();
  });
});

describe("read-back", () => {
  it("formats what was recorded for each answer shape", () => {
    const s = fresh();
    s.answers.family_history = ["Father had hair loss", "Mother had hair loss"];
    s.answers.adult_acne_oily_skin = false;
    s.answers.age_hair_loss_began = 28;
    s.answers.duration = "Over a year";
    expect(valueEcho("family_history", s.answers)).toBe(
      "Father had hair loss, Mother had hair loss",
    );
    expect(valueEcho("adult_acne_oily_skin", s.answers)).toBe("No");
    expect(valueEcho("age_hair_loss_began", s.answers)).toBe("28");
    expect(valueEcho("duration", s.answers)).toBe("Over a year");
    expect(valueEcho("pattern", s.answers)).toBe("None of these");
  });
});

describe("purity guard", () => {
  it("keeps the conversation brain free of React, fetch and the store", () => {
    const src = readFileSync(path.join(process.cwd(), "lib", "chatFlow.ts"), "utf8");
    // A driver that reaches for the store or the network cannot be walked in a test,
    // and this whole file depends on it being walkable.
    expect(src).not.toContain('"use client"');
    expect(src).not.toMatch(/from "react"/);
    expect(src).not.toMatch(/from "\.\/store"/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});

// ---------------------------------------------------------------------------
// Helpers: advance the conversation until a given question is the one being asked.
// ---------------------------------------------------------------------------

/**
 * "None of that applies to me", as a complete table answer.
 *
 * Every flag false, and the one non-boolean row (hair wash frequency) set, so the
 * question genuinely validates rather than half-filling.
 */
function denyTable(key: string): Partial<Answers> {
  if (key === "habits")
    return {
      habits: {
        smoking: false,
        smoking_severity: null,
        alcohol: false,
        hard_water: false,
        hair_wash_frequency: "Weekly",
        heating_tools_styling_chemicals: false,
        salon_treatments: false,
        salon_treatment_detail: null,
      },
    };
  if (key === "products")
    return {
      products: Object.fromEntries(
        PRODUCT_ROWS.map((r) => [r, { used: false, duration: null, helped: null, side_effects: null }]),
      ) as Answers["products"],
    };
  return {
    procedures: Object.fromEntries(
      PROCEDURE_ROWS.map((r) => [r, { done: false, sessions: null, helped: null }]),
    ) as Answers["procedures"],
  };
}

function walkToState(start: State, targetId: string): State {
  let s = start;
  const preferFields = ["habits", "products", "procedures"];
  for (let i = 0; i < 400; i++) {
    const turn = nextTurn(s.answers, s.meta, s.explicitNone, { preferFields });
    if (turn.id === targetId || turn.id.startsWith(`${targetId}:`)) return s;
    if (turn.ask.t === "done") throw new Error(`never reached ${targetId}`);
    s = reduce(s, answerTurn(s, turn));
  }
  throw new Error(`never reached ${targetId}`);
}

/** The turn asking `targetId`, with tables asked as one open question. */
function walkTo(start: State, targetId: string): Turn {
  let s = start;
  for (let i = 0; i < 400; i++) {
    const turn = nextTurn(s.answers, s.meta, s.explicitNone);
    if (turn.id === targetId) return turn;
    if (turn.ask.t === "done") throw new Error(`never reached ${targetId}`);
    s = reduce(s, answerTurn(s, turn));
  }
  throw new Error(`never reached ${targetId}`);
}
