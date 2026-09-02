/**
 * The merged-choice mapping.
 *
 * This is the file standing between "the patient tapped one button" and "the downloaded JSON
 * matches the published schema", so it is tested without a browser. The rule that matters most
 * is the negative branch: a flag answered No must null its detail columns, because
 * `validate.ts` rejects "detail present while the flag is false" and an off-schema download is
 * the one output nobody is allowed to get wrong.
 *
 * The tests that follow are also the guarantee behind the claim that merging the two stages
 * did not change the JSON. Every assertion here is a shape the two-stage control produced.
 */
import { describe, expect, it } from "vitest";
import {
  NEGATIVE,
  PROCEDURE_MERGED,
  PRODUCT_MERGED,
  SMOKING_MERGED,
  mergedIsPositive,
  mergedOptions,
  mergedPatch,
  mergedSelection,
} from "@/lib/apply";
import { EMPTY_ANSWERS, PRODUCT_DUR, SESSIONS, SMOKING_SEV, type Answers } from "@/lib/types";
import { validate } from "@/lib/validate";

describe("mergedOptions", () => {
  it("puts the negative first, then the schema's own options in order", () => {
    expect(mergedOptions(SMOKING_MERGED)).toEqual([NEGATIVE, ...SMOKING_SEV]);
    expect(mergedOptions(PRODUCT_MERGED)).toEqual([NEGATIVE, ...PRODUCT_DUR]);
    expect(mergedOptions(PROCEDURE_MERGED)).toEqual([NEGATIVE, ...SESSIONS]);
  });

  it("adds exactly one option to what the schema defines", () => {
    expect(mergedOptions(SMOKING_MERGED)).toHaveLength(SMOKING_SEV.length + 1);
  });
});

describe("mergedPatch writes the shape the two-stage control wrote", () => {
  it("a severity implies the flag", () => {
    expect(mergedPatch(SMOKING_MERGED, "Moderate 5-10/day")).toEqual({
      smoking: true,
      smoking_severity: "Moderate 5-10/day",
    });
  });

  it("the negative nulls the detail", () => {
    expect(mergedPatch(SMOKING_MERGED, NEGATIVE)).toEqual({
      smoking: false,
      smoking_severity: null,
    });
  });

  it("the negative nulls every other column that depends on the flag", () => {
    expect(mergedPatch(PRODUCT_MERGED, NEGATIVE)).toEqual({
      used: false,
      duration: null,
      helped: null,
      side_effects: null,
    });
    expect(mergedPatch(PROCEDURE_MERGED, NEGATIVE)).toEqual({
      done: false,
      sessions: null,
      helped: null,
    });
  });

  it("changing the duration does NOT wipe an answered 'did it help'", () => {
    // The positive branch touches the flag and the detail, and nothing else: a patient
    // correcting "<3mo" to "3-6mo" has not changed their mind about whether it worked.
    const patch = mergedPatch(PRODUCT_MERGED, "3-6mo");
    expect(patch).toEqual({ used: true, duration: "3-6mo" });
    expect(patch).not.toHaveProperty("helped");
    expect(patch).not.toHaveProperty("side_effects");
  });

  it("never writes the sentinel into an answer", () => {
    for (const spec of [SMOKING_MERGED, PRODUCT_MERGED, PROCEDURE_MERGED])
      for (const choice of mergedOptions(spec))
        expect(Object.values(mergedPatch(spec, choice))).not.toContain(NEGATIVE);
  });
});

describe("mergedSelection reads the row back", () => {
  it("shows the negative when the flag is false", () => {
    expect(mergedSelection({ smoking: false, smoking_severity: null }, SMOKING_MERGED)).toBe(
      NEGATIVE,
    );
  });

  it("shows the detail when the flag is true", () => {
    expect(
      mergedSelection({ smoking: true, smoking_severity: "Severe >10/day" }, SMOKING_MERGED),
    ).toBe("Severe >10/day");
  });

  it("shows nothing for an untouched row", () => {
    expect(mergedSelection({ smoking: null, smoking_severity: null }, SMOKING_MERGED)).toBeNull();
    expect(mergedSelection(undefined, SMOKING_MERGED)).toBeNull();
  });

  it("shows nothing for a half-answered row rather than guessing", () => {
    // Not reachable by tapping, but reachable from a session persisted before this control
    // existed. An incomplete row should look incomplete.
    expect(mergedSelection({ smoking: true, smoking_severity: null }, SMOKING_MERGED)).toBeNull();
  });

  it("round-trips every option through patch and back", () => {
    for (const spec of [SMOKING_MERGED, PRODUCT_MERGED, PROCEDURE_MERGED])
      for (const choice of mergedOptions(spec))
        expect(mergedSelection(mergedPatch(spec, choice), spec)).toBe(choice);
  });
});

describe("mergedIsPositive gates the remaining columns", () => {
  it("is true only when the flag is true", () => {
    expect(mergedIsPositive({ used: true }, PRODUCT_MERGED)).toBe(true);
    expect(mergedIsPositive({ used: false }, PRODUCT_MERGED)).toBe(false);
    expect(mergedIsPositive({ used: null }, PRODUCT_MERGED)).toBe(false);
    expect(mergedIsPositive(undefined, PRODUCT_MERGED)).toBe(false);
  });
});

describe("the emitted JSON is still schema-valid", () => {
  /**
   * The claim the whole change rests on: a form filled through the merged controls produces
   * output that passes the same validator as before. Built by applying `mergedPatch` rather
   * than by writing the expected shape out by hand, so the test cannot agree with a bug in
   * the mapping.
   */
  function filled(smoking: string, product: string, procedure: string): Answers {
    const a = EMPTY_ANSWERS;
    /*
      Every non-merged habit answered too, so the only issues this can report are shape
      violations rather than blanks. The first version of this fixture filled the merged rows
      alone and then filtered the issue list for the word "habits" - which matched
      "habits.hard_water: Expected boolean, received null", a field the test had simply never
      answered. A filter narrow enough to pass would also have hidden a real violation.
    */
    const habits = {
      ...a.habits,
      alcohol: false,
      hard_water: false,
      heating_tools_styling_chemicals: false,
      salon_treatments: false,
      salon_treatment_detail: null,
      hair_wash_frequency: "Daily" as const,
      ...mergedPatch(SMOKING_MERGED, smoking),
    };
    const products = Object.fromEntries(
      Object.entries(a.products).map(([row, cell]) => [
        row,
        { ...cell, ...mergedPatch(PRODUCT_MERGED, product) },
      ]),
    );
    const procedures = Object.fromEntries(
      Object.entries(a.procedures).map(([row, cell]) => [
        row,
        { ...cell, ...mergedPatch(PROCEDURE_MERGED, procedure) },
      ]),
    );
    return { ...a, habits, products, procedures } as Answers;
  }

  it("passes with every merged row answered negatively", () => {
    const answers = filled(NEGATIVE, NEGATIVE, NEGATIVE);
    const r = validate(answers, { patient_sex: "male", patient_age: 40, first_name: null });
    expect(r.issues).toEqual([]);
  });

  it("passes with every merged row answered positively and its follow-ups filled", () => {
    const answers = filled("Mild <5/day", "3-6mo", "1-3");
    const products = Object.fromEntries(
      Object.entries(answers.products).map(([k, v]) => [
        k,
        { ...v, helped: true, side_effects: false },
      ]),
    ) as Answers["products"];
    const procedures = Object.fromEntries(
      Object.entries(answers.procedures).map(([k, v]) => [k, { ...v, helped: true }]),
    ) as Answers["procedures"];
    const r = validate(
      { ...answers, products, procedures },
      { patient_sex: "male", patient_age: 40, first_name: null },
    );
    expect(r.issues).toEqual([]);
  });
});
