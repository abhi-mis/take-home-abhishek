/**
 * The bilingual form's real failure mode is not a bad translation. It is a MISSING one.
 *
 * A patient who reads no English does not care that 95% of the screen is Hindi; the one
 * English sentence is the one they needed. TypeScript catches a missing key (every
 * dictionary is typed against its English counterpart), but it cannot catch the two
 * things that actually happen in practice:
 *
 *   1. a schema option with no entry in OPTION_HI, which falls back to English;
 *   2. a Hindi value that was copied from the English one and never translated.
 *
 * So this walks the schema and both dictionaries and asserts neither has happened. It is
 * also the test that keeps the invariant honest: language is presentation, and no answer
 * is ever translated on its way into the output.
 */
import { describe, expect, it } from "vitest";
import { INTAKE_SCHEMA, QUESTIONS } from "@/lib/schema";
import { COPY, SPEAK_PROMPTS, UI_COPY } from "@/lib/copy";
import { COPY_HI, OPTION_HI, SPEAK_PROMPTS_HI, TEXT_EN, TEXT_HI, UI_COPY_HI } from "@/lib/copy.hi";
import { LANGS, fill, optionLabel, questionCopy, t, ui } from "@/lib/i18n";

/** Every option, table row and follow-up choice the patient can be shown. */
function schemaStrings(): string[] {
  const out = new Set<string>();
  type Node = { options?: readonly string[]; rows?: readonly unknown[]; columns?: readonly unknown[]; followup?: unknown };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const n = node as Node;
    if (Array.isArray(n.options)) n.options.forEach((o) => out.add(o));
    if (Array.isArray(n.rows)) {
      for (const r of n.rows) {
        if (typeof r === "string") out.add(r);
        else walk(r);
      }
    }
    if (n.columns !== undefined) walk(n.columns);
    if (n.followup !== undefined) walk(n.followup);
  };
  INTAKE_SCHEMA.sections.forEach((s) => walk(s.questions));
  return [...out];
}

/** Devanagari, roughly: enough to tell "translated" from "copied". */
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Values allowed to be identical in both languages.
 *
 * Two kinds, and both are deliberate. Proper nouns and clinical abbreviations that
 * patients themselves say in English: translating "PRP" into Devanagari letters would
 * make it harder to recognise, not easier. And pure numerals, where there is nothing to
 * translate at all.
 */
const SAME_IN_BOTH = new Set([
  "GenoRoot",
  "PCOS / PCOD",
  "PRP / GFC / iPRF",
  "13-19",
  "20-29",
  "30-39",
  "40-49",
  "Fill in English",
  "हिंदी में भरें",
]);

describe("every option the patient can tap has a Hindi label", () => {
  const strings = schemaStrings();

  it("covers the whole schema", () => {
    const missing = strings.filter((s) => OPTION_HI[s] === undefined);
    expect(missing).toEqual([]);
  });

  it("found a realistic number of options, so the walk is not silently empty", () => {
    // A regex or a walk that stops matching would otherwise make this file pass by
    // testing nothing at all.
    expect(strings.length).toBeGreaterThan(45);
  });

  it("translates rather than copies", () => {
    const untranslated = strings.filter((s) => {
      const hi = OPTION_HI[s];
      return hi !== undefined && hi === s && !SAME_IN_BOTH.has(hi);
    });
    expect(untranslated).toEqual([]);
  });
});

describe("every question is asked in both languages", () => {
  it("has a Hindi title for all sixteen", () => {
    const missing = QUESTIONS.filter((q) => {
      const hi = COPY_HI[q.key];
      return hi === undefined || hi.title.trim().length === 0;
    }).map((q) => q.key);
    expect(missing).toEqual([]);
  });

  it("keeps the hint where English has one", () => {
    // A hint that exists in English and not in Hindi is a Hindi patient being told less.
    const dropped = QUESTIONS.filter(
      (q) => COPY[q.key].hint !== undefined && COPY_HI[q.key].hint === undefined,
    ).map((q) => q.key);
    expect(dropped).toEqual([]);
  });

  it("glosses the same options in both", () => {
    for (const q of QUESTIONS) {
      const en = Object.keys(COPY[q.key].gloss ?? {}).sort();
      const hi = Object.keys(COPY_HI[q.key].gloss ?? {}).sort();
      expect(hi, `gloss keys differ for ${q.key}`).toEqual(en);
    }
  });

  it("writes titles in Devanagari, not English", () => {
    const notHindi = QUESTIONS.filter((q) => !DEVANAGARI.test(COPY_HI[q.key].title)).map(
      (q) => q.key,
    );
    expect(notHindi).toEqual([]);
  });
});

describe("the interface strings", () => {
  it("has a Hindi value for every UI_COPY key", () => {
    const missing = Object.keys(UI_COPY).filter(
      (k) => (UI_COPY_HI as Record<string, string>)[k] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("has a Hindi value for every component string", () => {
    const missing = Object.keys(TEXT_EN).filter(
      (k) => (TEXT_HI as Record<string, string>)[k] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("leaves nothing sitting in English", () => {
    // A string that is only placeholders and punctuation ("{title}, {name}") is
    // legitimately identical in both languages, so the placeholders come out before the
    // check - otherwise the words INSIDE them look like untranslated English.
    const hasWords = (s: string) => /[A-Za-z]{4}/.test(s.replace(/\{\w+\}/g, ""));
    const copied: string[] = [];
    for (const [k, en] of Object.entries(TEXT_EN)) {
      const hi = (TEXT_HI as Record<string, string>)[k];
      if (hi === en && !SAME_IN_BOTH.has(en) && hasWords(en)) copied.push(k);
    }
    for (const [k, en] of Object.entries(UI_COPY)) {
      const hi = (UI_COPY_HI as Record<string, string>)[k];
      if (hi === en && !SAME_IN_BOTH.has(en) && hasWords(en)) copied.push(k);
    }
    expect(copied).toEqual([]);
  });

  it("keeps every placeholder, so no value goes missing from a sentence", () => {
    // "{age}" dropped from a Hindi string does not throw - it silently renders a
    // sentence with a hole in it, which is exactly the bug a human would miss.
    for (const [k, en] of Object.entries(TEXT_EN)) {
      const wanted = [...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const got = [...((TEXT_HI as Record<string, string>)[k] ?? "").matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort();
      expect(got, `placeholders differ for ${k}`).toEqual(wanted);
    }
  });
});

describe("the spoken checklists", () => {
  it("covers every voice question, with the same number of points", () => {
    for (const key of Object.keys(SPEAK_PROMPTS)) {
      const en = SPEAK_PROMPTS[key];
      const hi = SPEAK_PROMPTS_HI[key];
      expect(hi, `no Hindi speak prompt for ${key}`).toBeDefined();
      // A dropped point is a row the patient is never asked about out loud.
      expect(hi?.points.length, `point count differs for ${key}`).toBe(en?.points.length);
      expect(hi?.detailNote === undefined).toBe(en?.detailNote === undefined);
    }
  });
});

describe("language is presentation, never data", () => {
  it("maps English to Hindi for display and never the other way", () => {
    expect(optionLabel("Irregular", "hi")).toBe("अनियमित हैं");
    expect(optionLabel("Irregular", "en")).toBe("Irregular");
    // The Hindi label is not itself a key: nothing can round-trip Devanagari back into
    // the answers.
    expect(optionLabel("अनियमित हैं", "hi")).toBe("अनियमित हैं");
  });

  it("falls back to the English string rather than rendering nothing", () => {
    expect(optionLabel("Some option added later", "hi")).toBe("Some option added later");
  });

  it("resolves a full copy set for both languages", () => {
    for (const lang of LANGS) {
      expect(Object.keys(questionCopy(lang))).toHaveLength(QUESTIONS.length);
      expect(ui(lang).next.length).toBeGreaterThan(0);
    }
  });
});

describe("placeholder substitution", () => {
  it("fills named placeholders", () => {
    expect(fill("Welcome, {name}", { name: "Asha" })).toBe("Welcome, Asha");
    expect(t("welcome", "hi", { name: "आशा" })).toBe("स्वागत है, आशा");
  });

  it("leaves an unknown placeholder visible instead of printing undefined", () => {
    expect(fill("Hello {nobody}", { name: "x" })).toBe("Hello {nobody}");
  });

  it("puts values where the Hindi sentence needs them, not where English put them", () => {
    // "{total} में से सवाल {n}" - the order differs, which is the whole reason the
    // placeholders are named rather than positional.
    expect(t("progressAria", "hi", { n: 3, total: 17 })).toBe("17 में से सवाल 3");
    expect(t("progressAria", "en", { n: 3, total: 17 })).toBe("Question 3 of 17");
  });
});
