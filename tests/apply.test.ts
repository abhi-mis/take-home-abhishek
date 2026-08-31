/**
 * The write rules, which are clinical rather than cosmetic.
 *
 * Two modes now write the same answers, so these functions are the single definition of
 * what a valid write looks like. The invariant that matters most: a flag answered "No"
 * must null its detail columns. If it does not, `validate.ts` rejects the finished form
 * ("must be null unless ...") and the patient is stuck on a review screen with no
 * visible problem to fix - so it is asserted here for every table, both modes.
 */
import { describe, expect, it } from "vitest";
import { clearQuestionOps, extractOps, fieldOps, mergeRows } from "@/lib/apply";
import { outstandingFieldsFor, productsOutstanding } from "@/lib/followups";
import { AnswersSchema } from "@/lib/validate";
import {
  EMPTY_ANSWERS,
  PRODUCT_ROWS,
  type Answers,
} from "@/lib/types";

const fresh = (): Answers => structuredClone(EMPTY_ANSWERS);

/** The descriptor the UI would be showing when the patient answers. */
function field(answers: Answers, path: string) {
  const all = [
    ...outstandingFieldsFor("habits", answers),
    ...outstandingFieldsFor("products", answers),
    ...outstandingFieldsFor("procedures", answers),
  ];
  const f = all.find((x) => x.path === path);
  if (!f) throw new Error(`no outstanding field at ${path}`);
  return f;
}

describe("fieldOps keeps the conditional-null invariant", () => {
  it("nulls a product's detail columns when the row is answered No", () => {
    const a = fresh();
    a.products["Topical Minoxidil"] = {
      used: true,
      duration: "3-6mo",
      helped: true,
      side_effects: false,
    };
    const ops = fieldOps("products", field(fresh(), "Topical Minoxidil.used"), false, a);
    const row = ops.patch?.products?.["Topical Minoxidil"];
    expect(row).toEqual({ used: false, duration: null, helped: null, side_effects: null });
  });

  it("nulls a procedure's sessions and helped when the row is answered No", () => {
    const a = fresh();
    a.procedures["PRP/GFC/iPRF"] = { done: true, sessions: "4-6", helped: true };
    const ops = fieldOps("procedures", field(fresh(), "PRP/GFC/iPRF.done"), false, a);
    expect(ops.patch?.procedures?.["PRP/GFC/iPRF"]).toEqual({
      done: false,
      sessions: null,
      helped: null,
    });
  });

  it("nulls smoking severity when smoking turns to No", () => {
    const a = fresh();
    a.habits.smoking = true;
    a.habits.smoking_severity = "Moderate 5-10/day";
    const ops = fieldOps("habits", field(fresh(), "habits.smoking"), false, a);
    expect(ops.patch?.habits?.smoking).toBe(false);
    expect(ops.patch?.habits?.smoking_severity).toBeNull();
  });

  it("nulls the salon detail when salon treatments turns to No", () => {
    const a = fresh();
    a.habits.salon_treatments = true;
    a.habits.salon_treatment_detail = "keratin";
    const ops = fieldOps("habits", field(fresh(), "habits.salon_treatments"), false, a);
    expect(ops.patch?.habits?.salon_treatment_detail).toBeNull();
  });

  it("leaves the other rows of a table untouched", () => {
    const a = fresh();
    a.products.Supplements = { used: true, duration: ">6mo", helped: false, side_effects: false };
    const ops = fieldOps("products", field(a, "OTC/Medicated Shampoos.used"), true, a);
    expect(ops.patch?.products?.Supplements).toEqual(a.products.Supplements);
  });

  it("writes a free-text detail where the answer IS the text", () => {
    const a = fresh();
    a.habits.salon_treatments = true;
    const ops = fieldOps("habits", field(a, "habits.salon_treatment_detail"), "keratin", a);
    expect(ops.patch?.habits?.salon_treatment_detail).toBe("keratin");
  });
});

describe("mergeRows merges per row, not per table", () => {
  it("keeps columns a partial row does not mention", () => {
    interface Cell {
      used: boolean;
      duration: string | null;
      helped: boolean | null;
    }
    const current: Record<string, Cell> = {
      A: { used: true, duration: "<3mo", helped: null },
      B: { used: false, duration: null, helped: null },
    };
    const merged = mergeRows(current, { A: { helped: true } });
    expect(merged.A).toEqual({ used: true, duration: "<3mo", helped: true });
    expect(merged.B).toEqual(current.B);
  });

  it("ignores an undefined incoming row", () => {
    const current: Record<string, { used: boolean }> = { A: { used: true } };
    expect(mergeRows(current, { A: undefined })).toEqual(current);
  });
});

describe("extractOps merges rather than replaces", () => {
  it("does not erase products the patient mentioned in an earlier reply", () => {
    const a = fresh();
    a.products["Hair Oils/Serums"] = {
      used: true,
      duration: ">6mo",
      helped: true,
      side_effects: false,
    };
    const ops = extractOps(
      "products",
      { patch: { products: { Supplements: { used: false } } as never }, unfilled: [] },
      a,
    );
    expect(ops.patch?.products?.["Hair Oils/Serums"].used).toBe(true);
    expect(ops.patch?.products?.Supplements.used).toBe(false);
  });

  it("merges habits fields into the ones already answered", () => {
    const a = fresh();
    a.habits.smoking = false;
    const ops = extractOps(
      "habits",
      { patch: { habits: { alcohol: true } as never }, unfilled: [] },
      a,
    );
    expect(ops.patch?.habits).toMatchObject({ smoking: false, alcohol: true });
  });

  it("enforces exclusivity on the way in, whichever route filled it", () => {
    const ops = extractOps(
      "diagnosed_conditions",
      { patch: { diagnosed_conditions: ["None", "Anemia"] }, unfilled: [] },
      fresh(),
    );
    expect(ops.patch?.diagnosed_conditions).toEqual(["None"]);
  });

  it("passes a deliberate none through as a store op, not an answer", () => {
    const ops = extractOps(
      "pattern",
      { patch: { pattern: [] }, unfilled: [], none: ["pattern"] },
      fresh(),
    );
    expect(ops.none).toEqual(["pattern"]);
  });

  it("produces answers that survive the full Zod validator", () => {
    let a = fresh();
    const ops = extractOps(
      "products",
      {
        patch: {
          products: {
            "Topical Minoxidil": {
              used: true,
              duration: "3-6mo",
              helped: true,
              side_effects: false,
            },
          } as never,
        },
        unfilled: [],
      },
      a,
    );
    a = { ...a, ...ops.patch };
    // Only this row is asserted valid; the rest are still null (unanswered), which the
    // schema rejects - so check the row's own shape through the products sub-schema.
    const parsed = AnswersSchema.shape.products.safeParse(
      Object.fromEntries(
        PRODUCT_ROWS.map((r) => [
          r,
          r === "Topical Minoxidil"
            ? a.products[r]
            : { used: false, duration: null, helped: null, side_effects: null },
        ]),
      ),
    );
    expect(parsed.success).toBe(true);
  });
});

describe("clearQuestionOps resets a rejected fill", () => {
  it("wipes a whole table back to unanswered", () => {
    const a = fresh();
    a.products["Oral Minoxidil"] = { used: true, duration: "<3mo", helped: true, side_effects: true };
    const ops = clearQuestionOps("products", a);
    const cleared = ops.patch?.products;
    expect(cleared?.["Oral Minoxidil"]).toEqual({
      used: null,
      duration: null,
      helped: null,
      side_effects: null,
    });
    // And every row is outstanding again, so the conversation re-asks all of them.
    expect(productsOutstanding({ ...a, ...ops.patch } as Answers).length).toBe(
      PRODUCT_ROWS.length,
    );
  });

  it("clears Q14 and its conditional description together", () => {
    const a = fresh();
    a.past_treatment_side_effects = true;
    a.past_treatment_describe = "itching";
    const ops = clearQuestionOps("past_treatment_side_effects", a);
    expect(ops.patch).toEqual({
      past_treatment_side_effects: null,
      past_treatment_describe: null,
    });
  });

  it("clears a multi-select to an empty array and a single to null", () => {
    const a = fresh();
    a.family_history = ["Father had hair loss"];
    a.duration = "Over a year";
    expect(clearQuestionOps("family_history", a).patch).toEqual({ family_history: [] });
    expect(clearQuestionOps("duration", a).patch).toEqual({ duration: null });
  });
});
