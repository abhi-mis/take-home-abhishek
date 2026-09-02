/**
 * The form layer's pure parts.
 *
 * These are the two functions standing between a keystroke and a clinical record, so they are
 * tested without a browser: `normaliseAgeInput` decides what the box may contain, and
 * `ageToStore` decides what the doctor receives. The rule worth guarding is the third block -
 * an out-of-range value maps to null, not to "keep the last good number", because the version
 * that kept it counted the question answered while showing an error.
 */
import { describe, expect, it } from "vitest";
import { ageToStore, normaliseAgeInput, aboutFormSchema, describeFormSchema } from "@/lib/formSchemas";
import { AGE_MAX, AGE_MIN } from "@/lib/patient";

describe("normaliseAgeInput", () => {
  it("keeps digits and drops everything else", () => {
    expect(normaliseAgeInput("3a4x")).toBe("34");
    expect(normaliseAgeInput("  42  ")).toBe("42");
    expect(normaliseAgeInput("4-2")).toBe("42");
  });

  it("drops leading zeros, so a seven-year-old is not '007'", () => {
    expect(normaliseAgeInput("007")).toBe("7");
    expect(normaliseAgeInput("0")).toBe("0");
  });

  it("stops at three digits, before the value gets absurd", () => {
    expect(normaliseAgeInput("123456")).toBe("123");
  });

  it("leaves an empty box empty rather than inventing a zero", () => {
    expect(normaliseAgeInput("")).toBe("");
    expect(normaliseAgeInput("abc")).toBe("");
  });
});

describe("ageToStore", () => {
  it("accepts both ends of the allowed range", () => {
    expect(ageToStore(String(AGE_MIN))).toBe(AGE_MIN);
    expect(ageToStore(String(AGE_MAX))).toBe(AGE_MAX);
  });

  it("maps an out-of-range value to null, not to the last good number", () => {
    expect(ageToStore(String(AGE_MAX + 1))).toBeNull();
    expect(ageToStore("0")).toBeNull();
    expect(ageToStore("999")).toBeNull();
  });

  it("treats an empty or non-numeric box as unanswered", () => {
    expect(ageToStore("")).toBeNull();
    expect(ageToStore("abc")).toBeNull();
  });
});

describe("the about-you schema", () => {
  const schema = aboutFormSchema("en");

  it("passes an empty age, because blank is 'not yet' rather than 'wrong'", () => {
    expect(schema.safeParse({ firstName: "", age: "" }).success).toBe(true);
  });

  it("rejects an age outside the range, with the message the field shows", () => {
    const r = schema.safeParse({ firstName: "", age: "150" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain(String(AGE_MAX));
  });

  it("accepts any name, because there is no such thing as a wrong one", () => {
    for (const name of ["", "Asha", "O'Brien", "अंजलि", "Jean-Luc"])
      expect(schema.safeParse({ firstName: name, age: "30" }).success).toBe(true);
  });

  it("builds its message in the chosen language", () => {
    const hi = aboutFormSchema("hi").safeParse({ firstName: "", age: "150" });
    const en = schema.safeParse({ firstName: "", age: "150" });
    expect(hi.success).toBe(false);
    expect(en.success).toBe(false);
    if (!hi.success && !en.success)
      expect(hi.error.issues[0]?.message).not.toBe(en.error.issues[0]?.message);
  });
});

describe("the side-effect description schema", () => {
  const schema = describeFormSchema("en");

  it("requires something once the patient has said there were side effects", () => {
    expect(schema.safeParse({ describe: "" }).success).toBe(false);
    expect(schema.safeParse({ describe: "   " }).success).toBe(false);
  });

  it("accepts a real description", () => {
    expect(schema.safeParse({ describe: "scalp itching for two weeks" }).success).toBe(true);
  });
});
