/**
 * Proves the claim the rest of the app rests on: lib/schema.ts is a VERBATIM copy of
 * the published intake schema.
 *
 * fixtures/intake-schema.published.json is the file as downloaded from
 * haikustudio.ai/hiring/intake-schema.json. If someone "tidies up" an option string
 * in lib/schema.ts, this test fails — which matters because that string is what ends
 * up in the doctor's output and in the model's allowed vocabulary.
 */
import { describe, expect, it } from "vitest";
import published from "@/fixtures/intake-schema.published.json";
import { FEMALE_ONLY_KEYS, INTAKE_SCHEMA, QUESTIONS, getQuestion } from "@/lib/schema";
import {
  CONDITIONS,
  DURATION,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SAMPLE,
  WASH,
} from "@/lib/types";

describe("bundled schema matches the published one", () => {
  it("is byte-for-byte equivalent as data", () => {
    // Round-tripping both through JSON strips the `as const` typing and compares
    // structure, keys, order and every string.
    expect(JSON.parse(JSON.stringify(INTAKE_SCHEMA))).toEqual(published);
  });

  it("has 5 sections and 16 questions", () => {
    expect(INTAKE_SCHEMA.sections).toHaveLength(5);
    expect(QUESTIONS).toHaveLength(16);
    expect(INTAKE_SCHEMA.sections.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("numbers the questions 1..16 with no gaps", () => {
    expect(QUESTIONS.map((q) => q.n)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("marks exactly Q6 and Q7 as femaleOnly, from the schema itself", () => {
    expect(FEMALE_ONLY_KEYS).toEqual(["menstrual_cycle", "pregnancy_related"]);
  });
});

/** Not every question type has `options` (number, yesno, table), so narrow first. */
function optionsOf(key: Parameters<typeof getQuestion>[0]): readonly string[] | undefined {
  const q = getQuestion(key);
  return "options" in q ? q.options : undefined;
}

describe("enums are derived from the schema, not retyped", () => {
  it("reads option lists straight off the schema objects", () => {
    // toBe, not toEqual: these must be the SAME array reference, which is only true
    // if types.ts pulled them out of the schema instead of restating them.
    expect(DURATION).toBe(optionsOf("duration"));
    expect(CONDITIONS).toBe(optionsOf("diagnosed_conditions"));
    expect(SAMPLE).toBe(optionsOf("sample_type"));
    expect(optionsOf("age_hair_loss_began")).toBeUndefined();
  });

  it("keeps the exact published strings", () => {
    expect([...DURATION]).toEqual(["Less than 6 months", "6-12 months", "Over a year"]);
    expect([...WASH]).toEqual(["Daily", "Alternate Days", "Weekly"]);
    expect([...PRODUCT_ROWS]).toEqual([
      "OTC/Medicated Shampoos",
      "Hair Oils/Serums",
      "Topical Minoxidil",
      "Oral Minoxidil",
      "Supplements",
    ]);
    expect([...PROCEDURE_ROWS]).toEqual([
      "PRP/GFC/iPRF",
      "Stem Cells/Exosomes",
      "Hair Transplant",
      "Other",
    ]);
  });
});

describe("getQuestion", () => {
  it("finds every key", () => {
    for (const q of QUESTIONS) expect(getQuestion(q.key).n).toBe(q.n);
  });

  it("throws loudly on an unknown key rather than returning undefined", () => {
    expect(() => getQuestion("hair_colour" as never)).toThrow(/Unknown question key/);
  });
});
