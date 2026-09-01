/**
 * The store's shape, pinned by reading its source.
 *
 * Zustand's persist wants a storage and this suite runs in node, so the point is not to
 * exercise a store instance: it is to pin the contract the UI depends on, and to make the
 * sessionStorage key change WITH the shape. A v1 session half-loading into a v2 store is
 * the kind of bug that only shows up on a patient's phone, mid-form.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
/** Comments discuss the old names on purpose; only code should be searched. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("store v2", () => {
  it("persists under a v2 key, because the shape changed", () => {
    expect(CODE).toContain('name: "genoroot-intake-v2"');
  });

  it("addresses sections, not steps", () => {
    expect(CODE).toContain("currentSectionId");
    expect(CODE).toContain("openQuestionId");
    expect(CODE).not.toContain("currentStepId");
  });

  it("persists the open card so a refresh reopens it", () => {
    const at = CODE.indexOf("partialize");
    expect(at).toBeGreaterThan(-1);
    const block = CODE.slice(at, at + 500);
    expect(block).toContain("currentSectionId");
    expect(block).toContain("openQuestionId");
  });

  it("keeps the actions the section flow needs", () => {
    for (const action of ["goToSection", "openQuestion", "nextSection", "prevSection"]) {
      expect(CODE, `missing action ${action}`).toContain(`${action}:`);
    }
  });

  it("drops the per-step navigation it replaced", () => {
    expect(CODE).not.toMatch(/\bgoTo:\s/);
    expect(CODE).not.toMatch(/\bnext:\s*\(\)/);
    expect(CODE).not.toMatch(/\bback:\s*\(\)/);
  });

  it("does not reset the language, which is not a per-patient answer", () => {
    // Comfort is derived from this patient's age and must reset; language is the phone's
    // owner's choice and must not. The reset block therefore names one and not the other.
    // lastIndexOf, not indexOf: the first hit is the interface declaration, and the rule
    // being checked lives in the implementation.
    const at = CODE.lastIndexOf("reset:");
    const block = CODE.slice(at, at + 400);
    expect(block).toContain('comfort: "standard"');
    expect(block).not.toContain("lang:");
  });
});
