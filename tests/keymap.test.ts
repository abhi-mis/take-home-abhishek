/**
 * The keyboard, as a pure function.
 *
 * Worth extracting because the rules are easy to state and easy to get wrong inside a
 * handler: a number must never advance, Enter must do nothing while the open question is
 * unanswered, and nothing at all may fire while the patient is typing in a text field.
 *
 * `toggleMulti` is here too, because it is the rule the keyboard and the tap path now
 * share. Two copies of "None of these clears everything" would eventually drift, and the
 * drift would be ["Anemia", "None"] in a clinical record.
 */
import { describe, expect, it } from "vitest";
import { keyAction, optionCountForStep, optionsForStep, toggleMulti } from "@/lib/keymap";
import { sectionById } from "@/lib/sections";
import { EXCLUSIVE_OPTIONS } from "@/lib/types";

const ctx = (over: Partial<Parameters<typeof keyAction>[1]> = {}) => ({
  optionCount: 3,
  openAnswered: false,
  typing: false,
  ...over,
});
const step = (sec: string, key: string) => sectionById(sec)!.steps.find((s) => s.key === key)!;

describe("selecting", () => {
  it("maps 1-9 to an option index", () => {
    expect(keyAction({ key: "2", shiftKey: false }, ctx())).toEqual({ t: "select", index: 1 });
  });

  it("ignores a number past the option count", () => {
    expect(keyAction({ key: "7", shiftKey: false }, ctx())).toBeNull();
  });

  it("never advances on a number, even once the question is answered", () => {
    // This is the whole reason the module exists. Auto-advance was removed deliberately;
    // a shortcut that advanced would put it back through the keyboard.
    expect(keyAction({ key: "1", shiftKey: false }, ctx({ openAnswered: true }))).toEqual({
      t: "select",
      index: 0,
    });
  });

  it("ignores 0, which is not an option number", () => {
    expect(keyAction({ key: "0", shiftKey: false }, ctx())).toBeNull();
  });
});

describe("moving", () => {
  it("Enter opens the next question once the open one is answered", () => {
    expect(keyAction({ key: "Enter", shiftKey: false }, ctx({ openAnswered: true }))).toEqual({
      t: "nextQuestion",
    });
  });

  it("Enter does nothing while the open question is unanswered", () => {
    expect(keyAction({ key: "Enter", shiftKey: false }, ctx())).toBeNull();
  });

  it("Shift+Enter asks for the next section", () => {
    expect(keyAction({ key: "Enter", shiftKey: true }, ctx({ openAnswered: true }))).toEqual({
      t: "nextSection",
    });
  });

  it("arrows move between cards", () => {
    expect(keyAction({ key: "ArrowDown", shiftKey: false }, ctx())).toEqual({ t: "moveDown" });
    expect(keyAction({ key: "ArrowUp", shiftKey: false }, ctx())).toEqual({ t: "moveUp" });
  });

  it("Escape closes the open card", () => {
    expect(keyAction({ key: "Escape", shiftKey: false }, ctx())).toEqual({ t: "close" });
  });

  it("passes ordinary typing keys through untouched", () => {
    for (const key of ["a", "Tab", "F5", " "]) {
      expect(keyAction({ key, shiftKey: false }, ctx())).toBeNull();
    }
  });
});

describe("typing wins", () => {
  it("fires nothing while focus is in a text field", () => {
    // A patient typing "keratin, 6 months ago" must be able to type digits.
    for (const key of ["1", "Enter", "ArrowDown", "Escape"]) {
      expect(keyAction({ key, shiftKey: false }, ctx({ typing: true }))).toBeNull();
    }
  });
});

describe("what a number can reach", () => {
  it("counts the schema options for a single or multi select", () => {
    expect(optionCountForStep(step("A", "duration"))).toBe(3);
    expect(optionCountForStep(step("B", "diagnosed_conditions"))).toBe(6);
  });

  it("gives a yes/no exactly two", () => {
    expect(optionsForStep(step("B", "adult_acne_oily_skin"))).toEqual(["yes", "no"]);
    expect(optionCountForStep(step("E", "consent"))).toBe(2);
  });

  it("gives nothing to the questions a single keystroke cannot answer", () => {
    // A table is five rows deep and About You is a name field plus two pickers: there is
    // no honest mapping from "3" to an answer.
    expect(optionCountForStep(step("C", "habits"))).toBe(0);
    expect(optionCountForStep(step("D", "products"))).toBe(0);
    expect(optionCountForStep(step("A", "age_hair_loss_began"))).toBe(0);
    expect(optionCountForStep(sectionById("0")!.steps[0]!)).toBe(0);
  });
});

describe("toggleMulti, shared by tap and keyboard", () => {
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
    expect(
      toggleMulti(["No known family history"], "No known family history", exclusive),
    ).toEqual([]);
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
