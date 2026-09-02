/**
 * The checkbox toggle rule.
 *
 * The case that matters is the exclusive option: "None of these" and "No known family history"
 * cannot coexist with any other answer, and a bug here does not look like a bug - it looks like
 * `["Anemia", "None"]` in the file a doctor opens. Hence a pure function and tests that need no
 * browser.
 */
import { describe, expect, it } from "vitest";
import { toggleMulti } from "@/lib/multiSelect";
import { EXCLUSIVE_OPTIONS } from "@/lib/types";

describe("toggleMulti", () => {
  const exclusive = EXCLUSIVE_OPTIONS.family_history;

  it("adds and removes an ordinary option", () => {
    expect(toggleMulti([], "Father had hair loss", exclusive)).toEqual(["Father had hair loss"]);
    expect(toggleMulti(["Father had hair loss"], "Father had hair loss", exclusive)).toEqual([]);
  });

  it("choosing the exclusive option clears everything else", () => {
    expect(toggleMulti(["Father had hair loss"], "No known family history", exclusive)).toEqual([
      "No known family history",
    ]);
  });

  it("choosing anything else clears the exclusive option", () => {
    expect(toggleMulti(["No known family history"], "Mother had hair loss", exclusive)).toEqual([
      "Mother had hair loss",
    ]);
  });

  it("unticking the exclusive option leaves nothing selected", () => {
    expect(toggleMulti(["No known family history"], "No known family history", exclusive)).toEqual(
      [],
    );
  });

  it("works on a question with no exclusive option at all", () => {
    expect(toggleMulti(["Patchy loss"], "Diffuse thinning", undefined)).toEqual([
      "Patchy loss",
      "Diffuse thinning",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const before = ["Patchy loss"];
    toggleMulti(before, "Diffuse thinning", undefined);
    expect(before).toEqual(["Patchy loss"]);
  });
});
