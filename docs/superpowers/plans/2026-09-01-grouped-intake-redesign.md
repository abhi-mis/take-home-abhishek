# Grouped Intake Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 17-screen one-question-per-screen wizard with six category screens whose questions collapse and expand one at a time, in a new warm visual language, composed for desktop with full keyboard operation.

**Architecture:** A new pure module (`lib/sections.ts`) groups the existing `ALL_STEPS` by schema section and answers "what is visible, what is answered, what is next" by delegating to the existing `validateStep`, so nothing about what counts as an answer changes. A new `QuestionCard` renders one question in one of three states and reuses the already-extracted `QuestionBody` for its open contents. `SectionShell` replaces `StepShell` as the chrome. Colour changes are token-value-only, so components need no edits for the visual direction.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript 5.7 strict with `noUncheckedIndexedAccess`, Tailwind CSS v4, Zustand v5 + persist over sessionStorage, framer-motion, Vitest (node env), Playwright for the browser smoke.

**Spec:** `docs/superpowers/specs/2026-09-01-grouped-intake-redesign-design.md`

## Global Constraints

- **No em dashes or en dashes anywhere** in code, comments, copy or docs. Use a hyphen. Verify with `grep -rn "—\|–" --include=*.ts --include=*.tsx --include=*.mjs --include=*.css --include=*.md . | grep -v node_modules` which must print nothing.
- **Never push to any remote.** Local commits only. No `git push`, no PR, no remote branch.
- **API keys stay server-side.** Never read `ANTHROPIC_API_KEY` or `SARVAM_API_KEY` outside `app/api/*/route.ts`. Never write to `.env`.
- **The downloaded JSON must not change.** Answers are always the English schema strings from `lib/schema.ts`. Language is presentation only.
- **Patient-facing strings never appear inline in a component.** Every one goes through `t()`, `ui()` or `optionLabel()` from `lib/i18n.ts`, with a Hindi value in `lib/copy.hi.ts`. `tests/i18n.test.ts` enforces this by reading the source.
- **Selectors must never build a value.** `useIntake((s) => s.field)` only. A selector that constructs an object or calls a function re-renders forever; `tests/selectors.test.ts` enforces this.
- **Nothing auto-advances.** Selecting an answer may open the next question in place, but must never navigate to another section. `1`-`9` keyboard shortcuts select only.
- **Touch targets stay 44px or larger under `pointer: coarse`.** They may shrink under `pointer: fine`.
- **Contrast:** every text pair meets WCAG AA 4.5:1, every non-text state indicator meets 3:1, in both themes.
- Run `npm run typecheck && npm test` before every commit. Both must be clean.

---

### Task 1: Direction B palette, with a contrast test that cannot be fooled

**Files:**
- Create: `tests/contrast.test.ts`
- Modify: `app/globals.css` (the `:root` light block, the `:root[data-theme="dark"]` block and the `prefers-color-scheme: dark` block)

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties `--paper --card --ink --muted --line --brand --brand-strong --brand-ink --brand-soft --done --warn` in both themes. Token NAMES are unchanged from today except the new `--done`, so no component needs an edit in this task.

- [ ] **Step 1: Write the failing test**

Create `tests/contrast.test.ts`:

```ts
/**
 * The palette, checked by arithmetic rather than by eye.
 *
 * Direction B was chosen with a terracotta accent that FAILS as text at 4.01:1 against the
 * paper ground, which is exactly the kind of thing that ships when a palette is approved
 * from a mockup. So the tokens are parsed out of globals.css and every pair the design
 * actually uses is asserted here.
 *
 * The hard rule this file exists to keep: the accent fill carries NO text. White on it is
 * 4.35:1 and ink on it is 3.99:1, so both fail; text-bearing fills use ink on paper.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Pull one token's value out of a specific block of globals.css. */
function token(block: string, name: string): string {
  const start = CSS.indexOf(block);
  expect(start, `block not found: ${block}`).toBeGreaterThan(-1);
  const end = CSS.indexOf("}", start);
  const body = CSS.slice(start, end);
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body);
  expect(m, `token --${name} not found in ${block}`).not.toBeNull();
  return m![1]!;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = ":root {\n  --paper";
const DARK = ':root[data-theme="dark"] {';

for (const [themeName, block] of [
  ["light", LIGHT],
  ["dark", DARK],
] as const) {
  describe(`${themeName} palette`, () => {
    const T = (n: string) => token(block, n);

    const pairs: [string, string, string, number][] = [
      ["ink on paper", "ink", "paper", 4.5],
      ["ink on card", "ink", "card", 4.5],
      ["muted on paper", "muted", "paper", 4.5],
      ["muted on card", "muted", "card", 4.5],
      ["accent text on paper", "brand-ink", "paper", 4.5],
      ["accent text on card", "brand-ink", "card", 4.5],
      ["accent text on tint", "brand-ink", "brand-soft", 4.5],
      ["warn on paper", "warn", "paper", 4.5],
      ["accent fill as a border on card", "brand", "card", 3.0],
      ["done mark on card", "done", "card", 3.0],
    ];

    for (const [name, fg, bg, need] of pairs) {
      it(`${name} meets ${need}:1`, () => {
        const r = ratio(T(fg), T(bg));
        expect(r, `${name} was ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(need);
      });
    }

    it("lifts the card off the ground so a card reads as a card", () => {
      expect(ratio(T("card"), T("paper"))).toBeGreaterThanOrEqual(1.25);
    });

    it("keeps the CTA readable: paper text on an ink fill", () => {
      expect(ratio(T("paper"), T("ink"))).toBeGreaterThanOrEqual(4.5);
    });
  });
}

describe("the accent fill carries no text", () => {
  it("documents why: both candidate text colours fail on it", () => {
    // Not a style preference. If a future change puts text on --brand, this is the
    // arithmetic that says it cannot be done, in either direction.
    const brand = token(LIGHT, "brand");
    expect(ratio("#ffffff", brand)).toBeLessThan(4.5);
    expect(ratio(token(LIGHT, "ink"), brand)).toBeLessThan(4.5);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/contrast.test.ts`
Expected: FAIL. Today's `--brand-ink` is `#0a4f46` on `--brand-soft` `#e3f1ee`, and there is no `--done` token at all, so `token --done not found` fails first.

- [ ] **Step 3: Write the tokens**

In `app/globals.css`, replace the light `:root` token block body with these values, keeping the surrounding comment structure:

```css
:root {
  --paper: #faf5ee;
  --card: #ffffff;
  --ink: #1c1a17;
  --muted: #6f665b;
  --line: #eae0d2;
  --brand: #b4643c;
  --brand-strong: #7f4327;
  --brand-ink: #9a4f2c;
  --brand-soft: #fdf1e9;
  --done: #5f7050;
  --warn: #9a3412;
  --code-bg: #1c1a17;
  --code-fg: #faf5ee;
  color-scheme: light;
}
```

Add this comment directly above that block:

```css
/*
  Direction B, "warm reassuring", with the two corrections that came out of measuring it.

  1. The terracotta that was approved from the mockup, #b4643c, is 4.01:1 against the paper
     ground - it FAILS as text. So there are two accent tokens: --brand-ink for text and
     --brand for fills and borders.
  2. --brand carries no text at all. White on it is 4.35:1 and ink on it is 3.99:1. Filled
     controls that need a label use --ink with --paper text, which is 16.01:1.

  tests/contrast.test.ts asserts every pair below, in both themes, and fails the build
  rather than letting a pretty colour through.
*/
```

Then in BOTH dark blocks (`:root[data-theme="dark"]` and the `@media (prefers-color-scheme: dark)` guarded block), use:

```css
  --paper: #17140f;
  --card: #322a20;
  --ink: #f2ece3;
  --muted: #a89c8c;
  --line: #4a3d2e;
  --brand: #c9754a;
  --brand-strong: #e08a5d;
  --brand-ink: #e89a6f;
  --brand-soft: #2f2118;
  --done: #93a882;
  --warn: #f0a58a;
  --code-bg: #0f0d0a;
  --code-fg: #f2ece3;
```

- [ ] **Step 4: Run the test again**

Run: `npx vitest run tests/contrast.test.ts`
Expected: PASS, both themes. If the dark `line on card` or `card lift` assertion fails, the card value is wrong, not the assertion: `#322a20` measured 1.30:1 against `#17140f`.

- [ ] **Step 5: Look at it**

Run: `npm run dev` then open `http://localhost:3000/intake` in both themes. Expected: the app is warm and terracotta-accented, nothing is unreadable, and no component code changed.

- [ ] **Step 6: Commit**

```bash
git add tests/contrast.test.ts app/globals.css
git commit -m "feat: direction B palette, with a contrast test that parses the tokens"
```

---

### Task 2: Enforce "no text on the accent fill" by reading the source

**Files:**
- Modify: `tests/i18n.test.ts` (add one describe block at the end; it already has the source-walking helpers)
- Modify: any component the scan catches

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: nothing importable. A guard.

- [ ] **Step 1: Write the failing test**

Append to `tests/i18n.test.ts`:

```ts
/**
 * The accent fill carries no text - checked in the markup, not just in the palette.
 *
 * tests/contrast.test.ts proves the arithmetic; this proves nobody wrote the class anyway.
 * `bg-brand` with any `text-*` utility on the same element is the shape of the bug.
 */
describe("no text sits on the accent fill", () => {
  const ROOT = process.cwd();

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("never pairs bg-brand with a text colour", () => {
    const offenders: string[] = [];
    const files = [...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "app"))];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Class strings only: bg-brand and text-* inside the same quoted run.
      for (const m of src.matchAll(/"([^"]*\bbg-brand\b[^"]*)"/g)) {
        const run = m[1] ?? "";
        if (/\btext-(white|paper|ink|card)\b/.test(run)) {
          offenders.push(`${path.relative(ROOT, file)}: ${run.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL, listing every `bg-brand text-white` pair. Today that includes `components/LangToggle.tsx` (the sliding thumb), `components/ui/Button.tsx` (the primary button and the check box) and `components/questions/AboutYou.tsx`.

- [ ] **Step 3: Fix each offender**

The rule: a filled, text-bearing control uses `bg-ink text-paper`. A filled, non-text mark (a tick, the progress fill, the toggle thumb behind a label) may keep `bg-brand` as long as no text sits on it.

- `components/ui/Button.tsx`, primary variant: replace `bg-brand text-white hover:bg-brand-strong` with `bg-ink text-paper hover:bg-brand-strong hover:text-paper`.
- `components/LangToggle.tsx`: the thumb is `bg-brand`, and the label above it becomes `text-paper` on the active side. Because the label is a sibling rather than a child of the thumb, the scan will not flag it, and the measured pair is paper on `#b4643c` at 4.01:1 which still fails. So the thumb becomes `bg-ink` too.
- `components/questions/AboutYou.tsx`, the selected radio dot: `bg-brand text-white` becomes `bg-brand text-transparent` is wrong. Use `bg-ink text-paper`, since it carries a check glyph.

- [ ] **Step 4: Run the test and the suite**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/i18n.test.ts components
git commit -m "fix: no text on the accent fill, enforced by a source scan"
```

---

### Task 3: Newsreader for questions, with the Devanagari check re-run

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (the `--font-display` token and the `.font-display` class)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS variable `--font-display-serif` on `<html>`, and `--font-display` resolving to it.

- [ ] **Step 1: Load the face**

In `app/layout.tsx`, add `Newsreader` to the existing `next/font/google` import and instantiate it beside the other two:

```ts
import { Hind, Newsreader, Plus_Jakarta_Sans } from "next/font/google";

/**
 * The question voice. Direction B sets questions in a serif so a question reads as
 * something a person is asking rather than a field label.
 *
 * Newsreader has no Devanagari, so Hind carries Hindi in both roles - which is why the
 * Devanagari leading rules in globals.css and the clipping guard in the smoke test both
 * still apply after this change.
 */
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-serif",
  display: "swap",
});
```

Add `display.variable` to the `<html>` className list.

- [ ] **Step 2: Point the token at it**

In `app/globals.css`, replace the `--font-display` declaration with:

```css
  --font-display: var(--font-display-serif), Newsreader, Georgia, serif;
```

and in the `.font-display` class change the tracking, because a serif at 25px does not want the tightening a geometric sans did:

```css
.font-display {
  font-family: var(--font-display);
  font-feature-settings: "liga" 1, "kern" 1;
  letter-spacing: -0.012em;
  font-weight: 500;
}
```

- [ ] **Step 3: Verify the Devanagari leading did not regress**

Run: `npm run dev`, then `node scripts/smoke-browser.mjs http://localhost:3000`
Expected: PASS, including the line `every Devanagari line has room for its matras`. That check forces the platform Devanagari face and measures ink against the line box; if it fails, the fix is in the `:root[lang="hi"]` block in globals.css, not here.

- [ ] **Step 4: Typecheck, test, build**

Run: `npm run typecheck && npm test && NEXT_DIST_DIR=.next-verify npx next build`
Expected: all clean. Remove `.next-verify` afterwards.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: Newsreader for questions, Hind still carrying Devanagari"
```

---

### Task 4: `lib/sections.ts`, the pure section model

**Files:**
- Create: `lib/sections.ts`
- Create: `tests/sections.test.ts`

**Interfaces:**
- Consumes: `ALL_STEPS`, `isStepVisible`, `validateStep`, `type Step` from `lib/steps.ts`.
- Produces:
  - `interface Section { id: string; steps: Step[] }`
  - `const ALL_SECTIONS: Section[]`
  - `sectionById(id: string): Section | undefined`
  - `sectionIndexById(id: string): number`
  - `visibleQuestions(section: Section, meta: Meta): Step[]`
  - `isAnswered(step: Step, answers: Answers, meta: Meta, explicitNone: Record<string, true>): boolean`
  - `answeredCount(section, answers, meta, explicitNone): number`
  - `interface SectionValidation { complete: boolean; missing: Step[] }`
  - `validateSection(section, answers, meta, explicitNone): SectionValidation`
  - `firstUnanswered(section, answers, meta, explicitNone): Step | null`
  - `nextUnansweredAfter(section, from: Step, answers, meta, explicitNone): Step | null`

Note the deliberate omission: **no `lang` parameter anywhere.** This module answers structural questions only. Labels are the UI's job, which keeps the module free of the copy layer and makes it trivially testable.

- [ ] **Step 1: Write the failing test**

Create `tests/sections.test.ts`:

```ts
/**
 * The section model.
 *
 * Everything here is structural: which questions live in a section, which of them this
 * patient can see, how many are answered, and which one to open next. Not a single string
 * of patient-facing copy, which is why none of these tests need a language.
 *
 * The one property worth stating out loud: "answered" is delegated to `validateStep`, so a
 * section can never disagree with the wizard about whether a question is done.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_SECTIONS,
  answeredCount,
  firstUnanswered,
  isAnswered,
  nextUnansweredAfter,
  sectionById,
  sectionIndexById,
  validateSection,
  visibleQuestions,
} from "@/lib/sections";
import { EMPTY_ANSWERS, EMPTY_META, type Answers, type Meta } from "@/lib/types";

const meta = (over: Partial<Meta> = {}): Meta => ({ ...EMPTY_META, ...over });
const answers = (over: Partial<Answers> = {}): Answers => ({
  ...structuredClone(EMPTY_ANSWERS),
  ...over,
});
const female = meta({ patient_sex: "female", patient_age: 34 });
const male = meta({ patient_sex: "male", patient_age: 34 });

describe("the six sections", () => {
  it("is exactly the schema's taxonomy plus About You", () => {
    expect(ALL_SECTIONS.map((s) => s.id)).toEqual(["0", "A", "B", "C", "D", "E"]);
  });

  it("accounts for every step exactly once", () => {
    const total = ALL_SECTIONS.reduce((n, s) => n + s.steps.length, 0);
    expect(total).toBe(17);
    const ids = ALL_SECTIONS.flatMap((s) => s.steps.map((q) => q.id));
    expect(new Set(ids).size).toBe(17);
  });

  it("keeps schema order inside a section", () => {
    expect(sectionById("A")?.steps.map((s) => s.key)).toEqual([
      "age_hair_loss_began",
      "duration",
      "family_history",
      "pattern",
    ]);
  });

  it("finds a section by id and reports its position", () => {
    expect(sectionIndexById("B")).toBe(2);
    expect(sectionIndexById("nope")).toBe(0);
  });
});

describe("visible questions follow the sex gate", () => {
  it("shows five health questions to a female patient", () => {
    expect(visibleQuestions(sectionById("B")!, female)).toHaveLength(5);
  });

  it("shows three to a male patient", () => {
    const keys = visibleQuestions(sectionById("B")!, male).map((s) => s.key);
    expect(keys).not.toContain("menstrual_cycle");
    expect(keys).not.toContain("pregnancy_related");
    expect(keys).toHaveLength(3);
  });
});

describe("answered, counted and validated", () => {
  it("delegates answered to validateStep rather than reimplementing it", () => {
    const step = sectionById("A")!.steps[1]!; // duration
    expect(isAnswered(step, answers(), female, {})).toBe(false);
    expect(isAnswered(step, answers({ duration: "Over a year" }), female, {})).toBe(true);
  });

  it("counts only visible questions", () => {
    const b = sectionById("B")!;
    const a = answers({ diagnosed_conditions: ["Anemia"] });
    expect(answeredCount(b, a, male, {})).toBe(1);
  });

  it("is complete only when every visible question is answered", () => {
    const b = sectionById("B")!;
    const partly = answers({ diagnosed_conditions: ["Anemia"] });
    const v1 = validateSection(b, partly, male, {});
    expect(v1.complete).toBe(false);
    expect(v1.missing.map((s) => s.key)).toEqual([
      "adult_acne_oily_skin",
      "excess_body_facial_hair",
    ]);

    const done = answers({
      diagnosed_conditions: ["Anemia"],
      adult_acne_oily_skin: true,
      excess_body_facial_hair: false,
    });
    expect(validateSection(b, done, male, {}).complete).toBe(true);
  });

  it("does not require a gated question that was never asked", () => {
    const b = sectionById("B")!;
    const done = answers({
      diagnosed_conditions: ["None"],
      adult_acne_oily_skin: true,
      excess_body_facial_hair: false,
    });
    // menstrual_cycle and pregnancy_related stay null for a male patient and that is a
    // valid answer, not a missing one.
    expect(validateSection(b, done, male, {}).complete).toBe(true);
  });
});

describe("which question to open", () => {
  it("opens the first unanswered one", () => {
    const a = sectionById("A")!;
    expect(firstUnanswered(a, answers(), female, {})?.key).toBe("age_hair_loss_began");
    expect(
      firstUnanswered(a, answers({ age_hair_loss_began: 30 }), female, {})?.key,
    ).toBe("duration");
  });

  it("returns null when the section is done", () => {
    const b = sectionById("B")!;
    const done = answers({
      diagnosed_conditions: ["None"],
      adult_acne_oily_skin: false,
      excess_body_facial_hair: false,
    });
    expect(firstUnanswered(b, done, male, {})).toBeNull();
  });

  it("walks forward from a given question, skipping gated ones", () => {
    const b = sectionById("B")!;
    const from = b.steps[0]!; // diagnosed_conditions
    const next = nextUnansweredAfter(b, from, answers(), male, {});
    expect(next?.key).toBe("adult_acne_oily_skin");
  });

  it("wraps to nothing rather than to the top", () => {
    const a = sectionById("A")!;
    const last = a.steps[a.steps.length - 1]!;
    expect(nextUnansweredAfter(a, last, answers(), female, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run tests/sections.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/sections"`.

- [ ] **Step 3: Write the module**

Create `lib/sections.ts`:

```ts
/**
 * Questions, grouped the way the doctor already groups them.
 *
 * The wizard used to be seventeen flat steps. It is now six sections, and this module is
 * the whole structural answer: what is in a section, what this patient can see of it, how
 * much is done, and which question to open next.
 *
 * Two boundaries make it easy to trust:
 *
 *  - "Answered" is not reimplemented here. It delegates to `validateStep`, so a section
 *    and the question inside it can never disagree about whether it is done.
 *  - No copy and no language. This module returns Steps, never labels, so the UI owns the
 *    words and this file stays pure enough to test without a DOM or a dictionary.
 */
import { ALL_STEPS, isStepVisible, validateStep, type Step } from "./steps";
import type { Answers, Meta } from "./types";

export interface Section {
  /** "0" for About You, then the schema's own section ids. */
  id: string;
  /** Every question in the section, gating ignored, in schema order. */
  steps: Step[];
}

/**
 * Built by grouping ALL_STEPS, which already puts About You first and then follows schema
 * order - so a question added to lib/schema.ts lands in the right section with no edit
 * here, which was the point of deriving the wizard from the schema in the first place.
 */
export const ALL_SECTIONS: Section[] = (() => {
  const order: string[] = [];
  const bySection = new Map<string, Step[]>();
  for (const step of ALL_STEPS) {
    const existing = bySection.get(step.sectionId);
    if (existing === undefined) {
      order.push(step.sectionId);
      bySection.set(step.sectionId, [step]);
    } else {
      existing.push(step);
    }
  }
  return order.map((id) => ({ id, steps: bySection.get(id) ?? [] }));
})();

export function sectionById(id: string): Section | undefined {
  return ALL_SECTIONS.find((s) => s.id === id);
}

/** Position in the flow, 0-based. Falls back to the first section for an unknown id. */
export function sectionIndexById(id: string): number {
  const i = ALL_SECTIONS.findIndex((s) => s.id === id);
  return i === -1 ? 0 : i;
}

/** The questions this patient is actually asked, after the sex gate. */
export function visibleQuestions(section: Section, meta: Meta): Step[] {
  return section.steps.filter((s) => isStepVisible(s, meta));
}

export function isAnswered(
  step: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): boolean {
  return validateStep(step, answers, meta, explicitNone).complete;
}

export function answeredCount(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): number {
  return visibleQuestions(section, meta).filter((s) => isAnswered(s, answers, meta, explicitNone))
    .length;
}

export interface SectionValidation {
  complete: boolean;
  /** The unanswered visible questions, in order, for the UI to name. */
  missing: Step[];
}

export function validateSection(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): SectionValidation {
  const missing = visibleQuestions(section, meta).filter(
    (s) => !isAnswered(s, answers, meta, explicitNone),
  );
  return { complete: missing.length === 0, missing };
}

export function firstUnanswered(
  section: Section,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): Step | null {
  return validateSection(section, answers, meta, explicitNone).missing[0] ?? null;
}

/**
 * The next unanswered question after `from`, or null.
 *
 * Deliberately does not wrap. Answering the last question in a section should leave the
 * patient looking at a finished section with Next available, not bounced back to the top
 * to hunt for what they missed - the outstanding list does that job explicitly.
 */
export function nextUnansweredAfter(
  section: Section,
  from: Step,
  answers: Answers,
  meta: Meta,
  explicitNone: Record<string, true>,
): Step | null {
  const visible = visibleQuestions(section, meta);
  const at = visible.findIndex((s) => s.id === from.id);
  if (at === -1) return firstUnanswered(section, answers, meta, explicitNone);
  for (const step of visible.slice(at + 1)) {
    if (!isAnswered(step, answers, meta, explicitNone)) return step;
  }
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/sections.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/sections.ts tests/sections.test.ts
git commit -m "feat: pure section model grouping the schema's questions into six"
```

---

### Task 5: Short labels and collapsed-card summaries

**Files:**
- Create: `lib/summary.ts`
- Create: `tests/summary.test.ts`
- Modify: `lib/copy.hi.ts` (add keys to `TEXT_EN` and `TEXT_HI`)

**Interfaces:**
- Consumes: `Section`/`Step`, `optionLabel`, `ui`, `t`, `personalSummary`.
- Produces:
  - `shortLabel(step: Step, lang: Lang): string`
  - `answerSummary(step: Step, answers: Answers, meta: Meta, lang: Lang): string`

- [ ] **Step 1: Add the copy**

In `lib/copy.hi.ts`, add to `TEXT_EN` (and the matching Hindi to `TEXT_HI`; a missing key is a compile error, which is the point):

```ts
  // Short labels for a collapsed card. New content, not truncation: "Has a doctor
  // diagnosed you with any of these?" cannot be ellipsised into a 46px row and stay
  // readable, so every question gets a label written for that row.
  shortOnset: "Started at",
  shortDuration: "Going on for",
  shortFamily: "In the family",
  shortPattern: "Where",
  shortConditions: "Diagnosed",
  shortPeriods: "Periods",
  shortPregnancy: "Pregnancy",
  shortAcne: "Acne or oily skin",
  shortBodyHair: "Body or facial hair",
  shortPast6m: "Last 6 months",
  shortHabits: "Habits",
  shortProducts: "Products",
  shortProcedures: "Clinic treatments",
  shortSideEffects: "Side effects",
  shortSample: "Sample",
  shortConsent: "Permission",
  shortAbout: "About you",

  // Collapsed summaries
  summaryNone: "None",
  summaryPlusMore: "{first} +{n}",
  summaryYears: "{age} years old",
  summaryCoverage: "{answered} answered, {inUse} in use",
  summaryCoverageDone: "{answered} answered",
  summaryConsentYes: "Yes, I agree: sample and genetic analysis",
  summaryConsentNo: "No, not now",
  summaryNotAnswered: "Not answered yet",
```

Hindi values:

```ts
  shortOnset: "शुरू हुआ",
  shortDuration: "कितने समय से",
  shortFamily: "परिवार में",
  shortPattern: "कहाँ से",
  shortConditions: "डॉक्टर ने बताया",
  shortPeriods: "पीरियड",
  shortPregnancy: "गर्भ या प्रसव",
  shortAcne: "मुहांसे या तेलीय त्वचा",
  shortBodyHair: "शरीर या चेहरे के बाल",
  shortPast6m: "पिछले 6 महीने",
  shortHabits: "आदतें",
  shortProducts: "इस्तेमाल की चीज़ें",
  shortProcedures: "क्लिनिक के इलाज",
  shortSideEffects: "साइड इफ़ेक्ट",
  shortSample: "सैंपल",
  shortConsent: "अनुमति",
  shortAbout: "आपके बारे में",

  summaryNone: "कोई नहीं",
  summaryPlusMore: "{first} +{n}",
  summaryYears: "{age} साल की उम्र",
  summaryCoverage: "{answered} भरे, {inUse} इस्तेमाल में",
  summaryCoverageDone: "{answered} भरे",
  summaryConsentYes: "हाँ, मैं सहमत हूँ: सैंपल और जेनेटिक जाँच",
  summaryConsentNo: "नहीं, अभी नहीं",
  summaryNotAnswered: "अभी जवाब नहीं दिया",
```

- [ ] **Step 2: Write the failing test**

Create `tests/summary.test.ts`:

```ts
/**
 * What a collapsed card says.
 *
 * A collapsed row has about 46px and half its width for the answer, so these are written
 * to fit rather than derived from the question. The rules worth testing: an unanswered
 * question never reads as an answer, a multi-select does not overflow, and a patient's own
 * free text is shown verbatim rather than summarised into something they did not say.
 */
import { describe, expect, it } from "vitest";
import { answerSummary, shortLabel } from "@/lib/summary";
import { sectionById } from "@/lib/sections";
import { EMPTY_ANSWERS, EMPTY_META, type Answers, type Meta } from "@/lib/types";

const meta = (over: Partial<Meta> = {}): Meta => ({ ...EMPTY_META, ...over });
const answers = (over: Partial<Answers> = {}): Answers => ({
  ...structuredClone(EMPTY_ANSWERS),
  ...over,
});
const female = meta({ patient_sex: "female", patient_age: 34 });
const step = (sec: string, key: string) =>
  sectionById(sec)!.steps.find((s) => s.key === key)!;

describe("short labels", () => {
  it("is short enough for a collapsed row, in both languages", () => {
    const s = step("B", "diagnosed_conditions");
    expect(shortLabel(s, "en")).toBe("Diagnosed");
    expect(shortLabel(s, "hi").length).toBeLessThan(24);
  });

  it("labels the About You card", () => {
    expect(shortLabel(sectionById("0")!.steps[0]!, "en")).toBe("About you");
  });
});

describe("answer summaries", () => {
  it("says nothing was answered rather than inventing a value", () => {
    expect(answerSummary(step("A", "duration"), answers(), female, "en")).toBe(
      "Not answered yet",
    );
  });

  it("shows a single choice in the patient's language", () => {
    const a = answers({ duration: "Over a year" });
    expect(answerSummary(step("A", "duration"), a, female, "en")).toBe("Over a year");
    expect(answerSummary(step("A", "duration"), a, female, "hi")).toBe("एक साल से ज़्यादा");
  });

  it("caps a multi-select instead of overflowing the row", () => {
    const a = answers({
      diagnosed_conditions: ["PCOS/PCOD", "Thyroid disorder", "Anemia"],
    });
    expect(answerSummary(step("B", "diagnosed_conditions"), a, female, "en")).toBe(
      "PCOS/PCOD +2",
    );
  });

  it("reads an explicit empty answer as None, not as unanswered", () => {
    const a = answers({ pattern: [] });
    expect(answerSummary(step("A", "pattern"), a, female, "en")).toBe("None");
  });

  it("states what consent covers rather than just Yes", () => {
    const a = answers({ consent: true });
    expect(answerSummary(step("E", "consent"), a, female, "en")).toBe(
      "Yes, I agree: sample and genetic analysis",
    );
  });

  it("summarises a table by coverage, since a value would be meaningless", () => {
    const a = answers();
    a.products["Topical Minoxidil"] = { used: true, duration: "3-6mo", helped: true, side_effects: false };
    a.products["Hair Oils/Serums"] = { used: false, duration: null, helped: null, side_effects: null };
    expect(answerSummary(step("D", "products"), a, female, "en")).toBe("2 answered, 1 in use");
  });

  it("shows the patient's own words verbatim", () => {
    const a = answers({
      past_treatment_side_effects: true,
      past_treatment_describe: "minoxidil made my scalp itch",
    });
    expect(answerSummary(step("D", "past_treatment_side_effects"), a, female, "en")).toBe(
      "Yes: minoxidil made my scalp itch",
    );
  });

  it("summarises About You from the meta, not the answers", () => {
    expect(answerSummary(sectionById("0")!.steps[0]!, answers(), female, "en")).toBe(
      "Female · 34",
    );
  });
});
```

- [ ] **Step 3: Run it, watch it fail**

Run: `npx vitest run tests/summary.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/summary"`.

- [ ] **Step 4: Write `lib/summary.ts`**

```ts
/**
 * What a collapsed question card says about itself.
 *
 * Two strings per question: a short label written for a 46px row, and the answer rendered
 * small enough to sit beside it. Neither is derived by truncating the real question, which
 * would produce "Has a doctor diagnosed you wi..." and help nobody.
 *
 * One rule with teeth: the patient's own free text is never summarised or shortened into
 * something they did not write. It is quoted as given.
 */
import { optionLabel, t, ui, type Lang } from "./i18n";
import type { TextKey } from "./copy.hi";
import { personalSummary } from "./patient";
import type { Step } from "./steps";
import { PRODUCT_ROWS, PROCEDURE_ROWS, type Answers, type Meta } from "./types";

const SHORT: Record<string, TextKey> = {
  about_you: "shortAbout",
  age_hair_loss_began: "shortOnset",
  duration: "shortDuration",
  family_history: "shortFamily",
  pattern: "shortPattern",
  diagnosed_conditions: "shortConditions",
  menstrual_cycle: "shortPeriods",
  pregnancy_related: "shortPregnancy",
  adult_acne_oily_skin: "shortAcne",
  excess_body_facial_hair: "shortBodyHair",
  past_6_months: "shortPast6m",
  habits: "shortHabits",
  products: "shortProducts",
  procedures: "shortProcedures",
  past_treatment_side_effects: "shortSideEffects",
  sample_type: "shortSample",
  consent: "shortConsent",
};

export function shortLabel(step: Step, lang: Lang): string {
  const key = SHORT[step.id];
  return key === undefined ? step.id : t(key, lang);
}

/** A multi-select, capped so it cannot push the answer out of its row. */
function listSummary(values: string[], lang: Lang): string {
  if (values.length === 0) return t("summaryNone", lang);
  const first = optionLabel(values[0] ?? "", lang);
  if (values.length === 1) return first;
  return t("summaryPlusMore", lang, { first, n: values.length - 1 });
}

function tableSummary(
  rows: readonly string[],
  entries: Record<string, Record<string, unknown>>,
  flag: string,
  lang: Lang,
): string {
  let answered = 0;
  let inUse = 0;
  for (const row of rows) {
    const value = (entries[row] ?? {})[flag];
    if (value === null || value === undefined) continue;
    answered += 1;
    if (value === true) inUse += 1;
  }
  if (answered === 0) return t("summaryNotAnswered", lang);
  return inUse === 0
    ? t("summaryCoverageDone", lang, { answered })
    : t("summaryCoverage", lang, { answered, inUse });
}

export function answerSummary(step: Step, answers: Answers, meta: Meta, lang: Lang): string {
  const UI = ui(lang);
  const none = t("summaryNotAnswered", lang);

  if (step.kind === "about") return personalSummary(meta, lang);

  switch (step.key) {
    case "age_hair_loss_began": {
      const v = answers.age_hair_loss_began;
      return v === null ? none : t("summaryYears", lang, { age: v });
    }
    case "family_history":
      return listSummary(answers.family_history, lang);
    case "pattern":
      return listSummary(answers.pattern, lang);
    case "diagnosed_conditions":
      return listSummary(answers.diagnosed_conditions, lang);
    case "past_6_months":
      return listSummary(answers.past_6_months, lang);
    case "habits": {
      const h = answers.habits as unknown as Record<string, unknown>;
      const keys = ["smoking", "alcohol", "hard_water", "hair_wash_frequency",
        "heating_tools_styling_chemicals", "salon_treatments"];
      const answered = keys.filter((k) => h[k] !== null && h[k] !== undefined).length;
      return answered === 0 ? none : t("summaryCoverageDone", lang, { answered });
    }
    case "products":
      return tableSummary(
        PRODUCT_ROWS,
        answers.products as unknown as Record<string, Record<string, unknown>>,
        "used",
        lang,
      );
    case "procedures":
      return tableSummary(
        PROCEDURE_ROWS,
        answers.procedures as unknown as Record<string, Record<string, unknown>>,
        "done",
        lang,
      );
    case "past_treatment_side_effects": {
      const v = answers.past_treatment_side_effects;
      if (v === null) return none;
      // The description is the patient's own words. Quoted, never paraphrased.
      return v ? `${UI.yes}: ${answers.past_treatment_describe ?? ""}`.trim() : UI.no;
    }
    case "consent": {
      const v = answers.consent;
      if (v === null) return none;
      return v ? t("summaryConsentYes", lang) : t("summaryConsentNo", lang);
    }
    default: {
      const v = answers[step.key as "duration"];
      if (v === null || v === undefined) return none;
      if (typeof v === "boolean") return v ? UI.yes : UI.no;
      if (typeof v === "string") return optionLabel(v, lang);
      return String(v);
    }
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/summary.test.ts tests/i18n.test.ts`
Expected: PASS both. The i18n suite proves every new key has a Hindi value with matching placeholders.

- [ ] **Step 6: Commit**

```bash
git add lib/summary.ts tests/summary.test.ts lib/copy.hi.ts
git commit -m "feat: short labels and collapsed-card summaries, both languages"
```

---

### Task 6: Store v2, section-addressed

**Files:**
- Modify: `lib/store.ts`
- Create: `tests/store-shape.test.ts`

**Interfaces:**
- Consumes: `ALL_SECTIONS`, `firstUnanswered`, `nextUnansweredAfter` from `lib/sections.ts`.
- Produces on the store: `currentSectionId: string`, `openQuestionId: string | null`, `goToSection(id: string)`, `openQuestion(id: string | null)`, `nextSection()`, `prevSection()`. Removes `currentStepId`, `goTo`, `next`, `back`.

- [ ] **Step 1: Write the failing test**

Create `tests/store-shape.test.ts`:

```ts
/**
 * The store's shape, checked without a browser.
 *
 * Zustand's persist needs a storage, and this suite runs in node, so the point here is not
 * to exercise the store instance: it is to pin the contract the UI depends on and the key
 * the persisted state lives under. The sessionStorage key MUST change with the shape,
 * because a v1 session half-loading into a v2 store is worse than starting over.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");

describe("store v2", () => {
  it("persists under a v2 key, because the shape changed", () => {
    expect(SRC).toContain('name: "genoroot-intake-v2"');
  });

  it("addresses sections, not steps", () => {
    expect(SRC).toContain("currentSectionId");
    expect(SRC).toContain("openQuestionId");
    expect(SRC).not.toContain("currentStepId");
  });

  it("persists the open question so a refresh reopens the same card", () => {
    const partialize = SRC.slice(SRC.indexOf("partialize"), SRC.indexOf("partialize") + 400);
    expect(partialize).toContain("currentSectionId");
    expect(partialize).toContain("openQuestionId");
  });

  it("keeps every selector a projection", () => {
    // Belt and braces: tests/selectors.test.ts owns this rule, but the store is where a
    // tempting getter would be added.
    expect(SRC).not.toMatch(/=>\s*\(\{[^)]*\}\)\s*,\s*\/\/\s*derived/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/store-shape.test.ts`
Expected: FAIL on the v2 key and on `currentSectionId`.

- [ ] **Step 3: Change the store**

In `lib/store.ts`:

1. Replace `currentStepId: string;` in `IntakeState` with:

```ts
  /**
   * Which of the six sections is on screen. Replaces the old per-question step id: the
   * flow is addressed by section now, and the open card inside it is separate state.
   */
  currentSectionId: string;
  /**
   * Which question in that section is expanded, by step id, or null for all collapsed.
   * Persisted, so a patient who refreshes comes back to the card they were on rather than
   * to the top of the section.
   */
  openQuestionId: string | null;
```

2. Replace the action declarations `goTo`, `next`, `back` with:

```ts
  goToSection: (id: string) => void;
  openQuestion: (id: string | null) => void;
  nextSection: () => void;
  prevSection: () => void;
```

3. Initial state: replace `currentStepId: ALL_STEPS[0]!.id,` with

```ts
      currentSectionId: ALL_SECTIONS[0]!.id,
      openQuestionId: ALL_SECTIONS[0]!.steps[0]?.id ?? null,
```

4. Implement the actions:

```ts
      goToSection: (id) =>
        set((s) => {
          const section = sectionById(id);
          if (section === undefined) return {};
          // Land on the first thing still unanswered, so arriving at a section never
          // requires the patient to hunt for where they are.
          const open = firstUnanswered(section, s.answers, s.meta, s.explicitNone);
          return { currentSectionId: id, openQuestionId: open?.id ?? null };
        }),

      openQuestion: (id) => set({ openQuestionId: id }),

      nextSection: () =>
        set((s) => {
          const i = sectionIndexById(s.currentSectionId);
          const target = ALL_SECTIONS[i + 1];
          if (target === undefined) return { currentSectionId: "review", openQuestionId: null };
          const open = firstUnanswered(target, s.answers, s.meta, s.explicitNone);
          return {
            touched: { ...s.touched, [s.currentSectionId]: true },
            currentSectionId: target.id,
            openQuestionId: open?.id ?? null,
          };
        }),

      prevSection: () =>
        set((s) => {
          if (s.currentSectionId === "review") {
            const last = ALL_SECTIONS[ALL_SECTIONS.length - 1]!;
            return { currentSectionId: last.id, openQuestionId: null };
          }
          const i = sectionIndexById(s.currentSectionId);
          const target = ALL_SECTIONS[i - 1];
          if (target === undefined) return {};
          return { currentSectionId: target.id, openQuestionId: null };
        }),
```

5. `reset()`: replace `currentStepId: ALL_STEPS[0]!.id,` with the two new fields as in step 3.

6. `partialize`: replace `currentStepId: s.currentStepId,` with

```ts
        currentSectionId: s.currentSectionId,
        openQuestionId: s.openQuestionId,
```

7. Persist name: `name: "genoroot-intake-v2"`.

8. Imports: replace the `ALL_STEPS` import with

```ts
import { ALL_SECTIONS, firstUnanswered, sectionById, sectionIndexById } from "./sections";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run` then `npm run typecheck`
Expected: `tests/store-shape.test.ts` passes. Typecheck FAILS in `app/intake/page.tsx` and `components/StepShell.tsx`, which still speak the old contract. That is expected and Task 9 fixes it; do not patch them here beyond what the next tasks specify.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts tests/store-shape.test.ts
git commit -m "feat: store addresses sections, persists the open card, bumps to v2"
```

---

### Task 7: `QuestionCard`, the three-state card

**Files:**
- Create: `components/questions/QuestionCard.tsx`

**Interfaces:**
- Consumes: `shortLabel`, `answerSummary`, `QuestionBody`, `QuestionSpeaker`, `questionSpeech`.
- Produces: `QuestionCard(props)` where

```ts
interface QuestionCardProps {
  step: Step;
  state: "answered" | "open" | "waiting";
  answers: Answers;
  meta: Meta;
  lang: Lang;
  comfort: Comfort;
  comfortAsked: boolean;
  explicitNone: Record<string, true>;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
  onOpen: () => void;
  /** Number shown on the chip and used as the keyboard hint. 1-based within the section. */
  index: number;
}
```

- [ ] **Step 1: Write the component**

Create `components/questions/QuestionCard.tsx`:

```tsx
"use client";

/**
 * One question, in one of three states, inside a section.
 *
 * This is the component that makes a five-question section readable: only the open card
 * shows a question, the answered ones shrink to a line you can check at a glance, and the
 * ones still to come are visible but quiet so the patient can see what they are in for.
 *
 * The contents of an open card are `QuestionBody`, unchanged - the same component the
 * review screen's edit dialog renders. Three surfaces, one implementation of "what does
 * `type: multi` look like".
 *
 * Semantics are a disclosure, not an ARIA accordion widget: a button with `aria-expanded`
 * controlling a region. A full accordion would owe the user roving arrow-key focus, which
 * is not the interaction here - Up and Down move between cards at the section level.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { QuestionBody } from "./QuestionBody";
import { QuestionSpeaker } from "../QuestionSpeaker";
import { questionSpeech } from "@/lib/questionSpeech";
import { answerSummary, shortLabel } from "@/lib/summary";
import type { Step } from "@/lib/steps";
import type { Comfort } from "@/lib/patient";
import type { Lang } from "@/lib/i18n";
import type { Answers, Meta, PatientSex } from "@/lib/types";
import { cn, tick } from "@/lib/utils";

export function QuestionCard({
  step,
  state,
  answers,
  meta,
  lang,
  comfort,
  comfortAsked,
  explicitNone,
  patch,
  setSex,
  setAge,
  setFirstName,
  chooseNone,
  onOpen,
  index,
}: {
  step: Step;
  state: "answered" | "open" | "waiting";
  answers: Answers;
  meta: Meta;
  lang: Lang;
  comfort: Comfort;
  comfortAsked: boolean;
  explicitNone: Record<string, true>;
  patch: (p: Partial<Answers>) => void;
  setSex: (sex: PatientSex) => void;
  setAge: (age: number) => void;
  setFirstName: (name: string | null) => void;
  chooseNone: (key: string) => void;
  onOpen: () => void;
  index: number;
}) {
  const reduce = useReducedMotion();
  const open = state === "open";
  const regionId = `q-${step.id}`;

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card transition-colors",
        open
          ? "border-brand shadow-[0_3px_14px_rgba(60,45,25,0.10)]"
          : "border-line shadow-[0_1px_2px_rgba(60,45,25,0.05)]",
      )}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          disabled={state === "waiting"}
          onClick={() => {
            if (open) return;
            tick();
            onOpen();
          }}
          className={cn(
            "flex w-full items-center gap-3 px-4 text-left",
            open ? "min-h-[52px] pt-3.5" : "min-h-[46px] py-3",
            state === "waiting" ? "cursor-default opacity-55" : "cursor-pointer",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums",
              state === "answered"
                ? "bg-done text-paper"
                : open
                  ? "bg-brand-soft text-brand-ink"
                  : "border border-line text-muted",
            )}
          >
            {state === "answered" ? <Tick /> : index}
          </span>

          <span className="min-w-0 flex-1">
            {open ? (
              <span className="font-display block text-[21px] leading-[1.45] text-ink">
                {step.kind === "about" ? shortLabel(step, lang) : (step.key ?? "")}
              </span>
            ) : (
              <span className="block truncate text-[13.5px] text-muted">
                {shortLabel(step, lang)}
              </span>
            )}
          </span>

          {state === "answered" ? (
            <span className="max-w-[46%] truncate text-[13.5px] font-semibold text-ink">
              {answerSummary(step, answers, meta, lang)}
            </span>
          ) : null}
        </button>
      </h2>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={regionId}
            role="group"
            initial={reduce ? undefined : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">
              <div className="mb-3 flex justify-end">
                <QuestionSpeaker text={questionSpeech(step, meta, lang)} lang={lang} />
              </div>
              <QuestionBody
                step={step}
                answers={answers}
                meta={meta}
                lang={lang}
                comfort={comfort}
                comfortAsked={comfortAsked}
                explicitNone={explicitNone}
                patch={patch}
                setSex={setSex}
                setAge={setAge}
                setFirstName={setFirstName}
                chooseNone={chooseNone}
                tableStage="speak"
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-3.5 shrink-0"
      stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}
```

- [ ] **Step 2: Fix the open-card title**

The placeholder above prints `step.key` for a real question. Replace that ternary with the localized question title:

```tsx
              <span className="font-display block text-[21px] leading-[1.45] text-ink">
                {step.key === null
                  ? ui(lang).aboutTitle
                  : (questionCopy(lang)[step.key]?.title ?? step.key)}
              </span>
```

and add `import { questionCopy, ui } from "@/lib/i18n";`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep QuestionCard`
Expected: no output for this file. Errors elsewhere (page.tsx, StepShell) are Task 9's.

- [ ] **Step 4: Commit**

```bash
git add components/questions/QuestionCard.tsx
git commit -m "feat: three-state question card reusing QuestionBody"
```

---

### Task 8: `SectionShell` and a segmented progress bar

**Files:**
- Create: `components/SectionShell.tsx`
- Modify: `components/ProgressBar.tsx`
- Modify: `lib/copy.hi.ts` (three keys)

**Interfaces:**
- Consumes: `QuestionCard`, `ProgressBar`, `ComfortToggle`, `LangToggle`, `ThemeToggle`.
- Produces: `SectionShell(props)`:

```ts
interface SectionShellProps {
  section: Section;
  index: number;            // 0-based position in ALL_SECTIONS
  total: number;
  answered: number;
  visible: number;
  nextSectionTitle: string | null;   // null on the last section
  outstanding: string[];             // short labels of unanswered questions
  canGoNext: boolean;
  revisited: boolean;
  lang: Lang;
  comfort: Comfort;
  onComfort: (c: Comfort) => void;
  onLang: (l: Lang) => void;
  onNext: () => void;
  onBack: () => void;
  children: React.ReactNode;         // the QuestionCard stack
}
```

- [ ] **Step 1: Add the copy**

`TEXT_EN`: `sectionOf: "Section {n} of {total}"`, `answeredOf: "{n} of {total} answered"`, `nextSection: "Next: {title}"`, `finishUp: "Review answers"`.
`TEXT_HI`: `sectionOf: "{total} में से भाग {n}"`, `answeredOf: "{total} में से {n} भरे"`, `nextSection: "आगे: {title}"`, `finishUp: "जवाब देखें"`.

- [ ] **Step 2: Segment the progress bar**

Replace the body of `components/ProgressBar.tsx` with a segmented bar. It takes the same `lang` plus the new shape:

```tsx
export function ProgressBar({
  index,
  total,
  fraction,
  lang,
}: {
  /** 0-based section index. */
  index: number;
  total: number;
  /** How much of the CURRENT section is answered, 0..1. */
  fraction: number;
  lang: Lang;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuenow={index + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={t("progressAria", lang, { n: index + 1, total })}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <motion.span
            className="block h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: i < index ? "100%" : i === index ? `${fraction * 100}%` : "0%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          />
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `SectionShell`**

Mobile-first structure, with the desktop rail deferred to Task 13:

```tsx
"use client";

/**
 * The frame a whole section renders inside.
 *
 * It replaces StepShell, which framed one question at a time. The differences that matter:
 * progress is six segments rather than a 1-of-17 bar, the footer advances a SECTION, and
 * the outstanding list names unanswered questions rather than describing one control.
 */
export function SectionShell({ ... }: SectionShellProps) {
  const [pressedNext, setPressedNext] = useState(false);
  useEffect(() => setPressedNext(false), [section.id]);
  const showOutstanding = outstanding.length > 0 && (pressedNext || revisited);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-30 bg-paper/95 px-5 pb-3 pt-4 backdrop-blur">
        <ProgressBar index={index} total={total} fraction={visible === 0 ? 0 : answered / visible} lang={lang} />
        <div className="mt-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {t("sectionOf", lang, { n: index + 1, total })}
            </p>
            <p className="font-display truncate text-[19px] leading-[1.4] text-ink">
              {sectionLabel(lang)[section.id] ?? section.id}
            </p>
          </div>
          <ComfortToggle comfort={comfort} onChange={onComfort} lang={lang} className="-my-1" />
          <LangToggle lang={lang} onChange={onLang} className="-my-1" />
        </div>
        <p className="mt-1 text-[11.5px] font-medium text-brand-ink">
          {t("answeredOf", lang, { n: answered, total: visible })}
        </p>
      </header>

      <main className="flex-1 px-4 pb-40">
        <div className="flex flex-col gap-2.5">{children}</div>

        <AnimatePresence initial={false}>
          {showOutstanding ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              aria-live="polite"
              className="mt-5 rounded-2xl border border-dashed border-warn/45 bg-warn/[0.04] p-3.5"
            >
              <p className="text-[12.5px] font-bold uppercase tracking-wide text-warn">
                {outstanding.length === 1
                  ? t("stillNeeded", lang)
                  : t("stillNeededN", lang, { n: outstanding.length })}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {outstanding.slice(0, 8).map((o) => (
                  <li key={o} className="flex gap-2 text-[13px] leading-snug text-warn">
                    <span aria-hidden>·</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <Button variant="ghost" size="lg" onClick={onBack} className="w-[88px] shrink-0" aria-label={ui(lang).back}>
            <BackArrow /> {ui(lang).back}
          </Button>
          <div className="flex-1" onPointerDown={() => { if (!canGoNext) setPressedNext(true); }}>
            <Button size="lg" onClick={onNext} disabled={!canGoNext} className="w-full">
              {nextSectionTitle === null
                ? t("finishUp", lang)
                : t("nextSection", lang, { title: nextSectionTitle })}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

Copy `BackArrow` across from `StepShell.tsx` verbatim, including its comment about `shrink-0` and the crushed viewBox.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E "SectionShell|ProgressBar"`
Expected: no output for these two files.

- [ ] **Step 5: Commit**

```bash
git add components/SectionShell.tsx components/ProgressBar.tsx lib/copy.hi.ts
git commit -m "feat: section shell and six-segment progress"
```

---

### Task 9: Wire the page, retire `StepShell`

**Files:**
- Modify: `app/intake/page.tsx`
- Delete: `components/StepShell.tsx`
- Modify: `components/ReviewScreen.tsx` (the declined path's jump target)

**Interfaces:**
- Consumes: everything from Tasks 4 to 8.
- Produces: the working grouped flow.

- [ ] **Step 1: Rewrite the page body**

Replace the step-based derivation with sections. The essential shape:

```tsx
  const currentSectionId = useIntake((s) => s.currentSectionId);
  const openQuestionId = useIntake((s) => s.openQuestionId);
  const goToSection = useIntake((s) => s.goToSection);
  const openQuestion = useIntake((s) => s.openQuestion);
  const nextSection = useIntake((s) => s.nextSection);
  const prevSection = useIntake((s) => s.prevSection);

  const isReview = currentSectionId === "review";
  const section = sectionById(currentSectionId) ?? ALL_SECTIONS[0]!;
  const visible = useMemo(() => visibleQuestions(section, meta), [section, meta]);
  const check = validateSection(section, answers, meta, explicitNone);
  const answered = visible.length - check.missing.length;

  /**
   * Answering the open question opens the next unanswered one in place.
   *
   * This is not the auto-advance that was removed: nothing navigates, and the answer stays
   * on screen as a summary. It runs in an effect on the answers, so it fires however the
   * answer arrived - tap, keyboard or a voice fill.
   */
  useEffect(() => {
    if (openQuestionId === null) return;
    const open = visible.find((s) => s.id === openQuestionId);
    if (open === undefined) return;
    if (!isAnswered(open, answers, meta, explicitNone)) return;
    const next = nextUnansweredAfter(section, open, answers, meta, explicitNone);
    if (next !== null) openQuestion(next.id);
  }, [answers, meta, explicitNone, openQuestionId, section, visible, openQuestion]);
```

Then render:

```tsx
    <SectionShell
      section={section}
      index={sectionIndexById(section.id)}
      total={ALL_SECTIONS.length}
      answered={answered}
      visible={visible.length}
      nextSectionTitle={
        sectionIndexById(section.id) === ALL_SECTIONS.length - 1
          ? null
          : (sectionLabel(lang)[ALL_SECTIONS[sectionIndexById(section.id) + 1]!.id] ?? null)
      }
      outstanding={check.missing.map((s) => shortLabel(s, lang))}
      canGoNext={check.complete}
      revisited={touched[section.id] === true}
      lang={lang}
      comfort={comfort}
      onComfort={setComfort}
      onLang={setLang}
      onNext={nextSection}
      onBack={() => { if (sectionIndexById(section.id) === 0) router.push("/"); else prevSection(); }}
    >
      {visible.map((step, i) => (
        <QuestionCard
          key={step.id}
          step={step}
          index={i + 1}
          state={
            step.id === openQuestionId
              ? "open"
              : isAnswered(step, answers, meta, explicitNone)
                ? "answered"
                : "waiting"
          }
          answers={answers}
          meta={meta}
          lang={lang}
          comfort={comfort}
          comfortAsked={comfortAsked}
          explicitNone={explicitNone}
          patch={patch}
          setSex={setSex}
          setAge={setAge}
          setFirstName={setFirstName}
          chooseNone={chooseNone}
          onOpen={() => openQuestion(step.id)}
        />
      ))}
    </SectionShell>
```

Note: a `waiting` card whose question the patient wants to jump to is still openable by tap. Change `disabled={state === "waiting"}` in `QuestionCard` to always enabled, and keep only the dimmed styling. A patient who wants to answer question 5 first is allowed to.

- [ ] **Step 2: Delete the old shell**

```bash
git rm components/StepShell.tsx
```

- [ ] **Step 3: Point the declined path at section E**

In `components/ReviewScreen.tsx`, the `Declined` screen's button calls `onJump("consent")`. The page's `onJump` now takes a section id, so pass `"E"` and have the page call `goToSection`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: clean. Then `npm run dev` and walk the flow by hand: six sections, cards collapsing, Next naming the next section.

- [ ] **Step 5: Commit**

```bash
git add -A app/intake/page.tsx components
git commit -m "feat: grouped six-section flow replaces the 17-step wizard"
```

---

### Task 10: Rewrite the browser smoke for six sections

**Files:**
- Modify: `scripts/smoke-browser.mjs`

**Interfaces:**
- Consumes: the running app.
- Produces: a passing smoke with the new invariants.

- [ ] **Step 1: Replace the walkthrough**

Keep the existing harness (the `errors`/`notes` arrays, `tap`, `heading`, the console-error capture, the theme and i18n blocks). Replace the question-by-question walk with a section walk, and add these assertions:

```js
  // ---------- accordion invariants ----------
  const openCount = async () =>
    await page.locator('[aria-expanded="true"]').count();

  notes.push(`cards open at once: ${await openCount()}  (must be 1)`);
  if ((await openCount()) !== 1)
    errors.push({ kind: "accordion", text: "more than one card was open", fatal: true });

  // answering opens the next card in place, without navigating
  const headingBefore = await heading();
  await tapOption("Over a year");
  await page.waitForTimeout(400);
  if ((await heading()) !== headingBefore)
    errors.push({ kind: "accordion", text: "answering navigated away", fatal: true });
  else notes.push("answering opened the next card without leaving the section");

  // reopening an answered card must NOT jump forward again
  await page.getByRole("button", { name: /Going on for/ }).click();
  await page.waitForTimeout(300);
  await tapOption("6-12 months");
  await page.waitForTimeout(400);
  const stillOpen = await page
    .getByRole("button", { name: /Going on for/ })
    .getAttribute("aria-expanded");
  notes.push(`corrected answer stayed put? ${stillOpen === "true"}`);
  if (stillOpen !== "true")
    errors.push({ kind: "accordion", text: "correcting an answer jumped forward", fatal: false });
```

Plus: section Next blocked with the outstanding questions named; the consent summary reading `Yes, I agree: sample and genetic analysis`; six sections reached in order; the comfort scale at 26% with a section open producing no horizontal overflow.

- [ ] **Step 2: Run it**

Run: `npm run dev` then `node scripts/smoke-browser.mjs http://localhost:3000`
Expected: `PASS - 0 error(s), 0 fatal`.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-browser.mjs
git commit -m "test: smoke walks six sections and asserts the accordion invariants"
```

---

### Task 11: `lib/keymap.ts`, the keyboard model as pure logic

**Files:**
- Create: `lib/keymap.ts`
- Create: `tests/keymap.test.ts`

**Interfaces:**
- Produces:

```ts
export type KeyAction =
  | { t: "select"; index: number }
  | { t: "nextQuestion" }
  | { t: "nextSection" }
  | { t: "moveUp" }
  | { t: "moveDown" }
  | { t: "close" };

export interface KeyContext {
  optionCount: number;
  openAnswered: boolean;
  typing: boolean;
}

export function keyAction(
  e: { key: string; shiftKey: boolean },
  ctx: KeyContext,
): KeyAction | null;
```

- [ ] **Step 1: Write the failing test**

```ts
/**
 * The keyboard, as a pure function.
 *
 * Worth extracting because the rules are easy to state and easy to get wrong in a handler:
 * a number must never advance, Enter must do nothing while the open question is
 * unanswered, and nothing at all may fire while the patient is typing in a text field.
 */
import { describe, expect, it } from "vitest";
import { keyAction } from "@/lib/keymap";

const ctx = (over = {}) => ({ optionCount: 3, openAnswered: false, typing: false, ...over });

describe("selecting", () => {
  it("maps 1-9 to an option index", () => {
    expect(keyAction({ key: "2", shiftKey: false }, ctx())).toEqual({ t: "select", index: 1 });
  });

  it("ignores a number past the option count", () => {
    expect(keyAction({ key: "7", shiftKey: false }, ctx())).toBeNull();
  });

  it("never advances on a number, however many are pressed", () => {
    const a = keyAction({ key: "1", shiftKey: false }, ctx({ openAnswered: true }));
    expect(a).toEqual({ t: "select", index: 0 });
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
});

describe("typing wins", () => {
  it("fires nothing while the patient is in a text field", () => {
    for (const key of ["1", "Enter", "ArrowDown", "Escape"]) {
      expect(keyAction({ key, shiftKey: false }, ctx({ typing: true }))).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/keymap.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Keys to intentions. No DOM, no store, no side effects.
 *
 * The rule that shaped this: a number key selects and NEVER advances. Auto-advance was
 * removed from this form because a mis-tap that both answers and leaves the screen is a
 * wrong clinical answer nobody sees again, and a keyboard shortcut that advances is the
 * same bug with a different input device.
 */
export type KeyAction =
  | { t: "select"; index: number }
  | { t: "nextQuestion" }
  | { t: "nextSection" }
  | { t: "moveUp" }
  | { t: "moveDown" }
  | { t: "close" };

export interface KeyContext {
  /** How many options the open card offers. Numbers beyond this are ignored. */
  optionCount: number;
  openAnswered: boolean;
  /** True when focus is in a text input or textarea. Then the keyboard belongs to them. */
  typing: boolean;
}

export function keyAction(
  e: { key: string; shiftKey: boolean },
  ctx: KeyContext,
): KeyAction | null {
  if (ctx.typing) return null;

  if (/^[1-9]$/.test(e.key)) {
    const index = Number(e.key) - 1;
    return index < ctx.optionCount ? { t: "select", index } : null;
  }

  switch (e.key) {
    case "Enter":
      if (!ctx.openAnswered) return null;
      return e.shiftKey ? { t: "nextSection" } : { t: "nextQuestion" };
    case "ArrowDown":
      return { t: "moveDown" };
    case "ArrowUp":
      return { t: "moveUp" };
    case "Escape":
      return { t: "close" };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run tests/keymap.test.ts`
Expected: PASS.

```bash
git add lib/keymap.ts tests/keymap.test.ts
git commit -m "feat: keyboard model as a pure function, numbers never advance"
```

---

### Task 12: Wire the keyboard

**Files:**
- Modify: `app/intake/page.tsx`

- [ ] **Step 1: Add the listener**

```tsx
  /**
   * The keyboard, wired once at the page level rather than per card, so a keystroke works
   * wherever focus happens to be inside the section.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      const open = visible.find((s) => s.id === openQuestionId) ?? null;
      const options = open === null ? 0 : optionCountFor(open, meta);
      const action = keyAction(e, {
        optionCount: options,
        openAnswered: open !== null && isAnswered(open, answers, meta, explicitNone),
        typing,
      });
      if (action === null) return;
      e.preventDefault();
      applyKeyAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, openQuestionId, answers, meta, explicitNone]);
```

`optionCountFor(step, meta)` reads the schema: `"options" in getQuestion(key) ? q.options.length : 0`, and 2 for `yesno`/`consent`. `applyKeyAction` maps `select` to a patch through the same `fieldOps`-free path the components use (write the answer for the step's kind), `nextQuestion` to `openQuestion(next.id)`, `nextSection` to `nextSection()` when `check.complete`, `moveUp`/`moveDown` to opening the neighbouring visible card, and `close` to `openQuestion(null)`.

- [ ] **Step 2: Verify by hand at desktop width**

Run: `npm run dev`, open at 1440px, and drive a whole section with only the keyboard. Expected: numbers select without advancing, Enter moves to the next card, Shift+Enter to the next section only when the section is complete.

- [ ] **Step 3: Commit**

```bash
git add app/intake/page.tsx
git commit -m "feat: keyboard operation across a section"
```

---

### Task 13: Desktop composition

**Files:**
- Create: `components/SectionRail.tsx`
- Modify: `components/SectionShell.tsx`
- Modify: `app/globals.css` (one `pointer: fine` block)

- [ ] **Step 1: The rail**

`SectionRail` takes `{ sections: Section[]; currentId: string; answeredBySection: Record<string, {answered:number; visible:number}>; lang: Lang; onJump: (id: string) => void }` and renders the six sections with a tick when complete, a count when current, and a hollow dot when not yet reached. Jumping is allowed to any section: this is a patient's own form, not a wizard that owns them.

- [ ] **Step 2: Compose the shell**

In `SectionShell`, wrap the existing mobile layout in a two-column grid from `lg` up:

```tsx
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[262px_minmax(0,1fr)]">
      <SectionRail className="hidden lg:block" ... />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:min-h-0 lg:max-w-[560px] lg:place-self-center lg:py-10">
        ...existing header, main, footer...
      </div>
    </div>
```

and make the header and footer non-sticky from `lg` up (`lg:static`, `lg:border-0`), so they sit inside the column instead of spanning the viewport. That is the specific defect measured at the start: a 448px header band with a 1425px footer rule.

- [ ] **Step 3: Shrink targets for a mouse**

```css
/*
  Touch targets are sized for a thumb. A mouse is precise, so the same 88px yes/no button
  reads as clumsy on a laptop - but this must key off the POINTER, never the viewport: a
  1280px-wide tablet is still a touch device.
*/
@media (pointer: fine) {
  .tap-lg { min-height: 64px; }
  .tap-md { min-height: 48px; }
}
```

Apply `tap-lg`/`tap-md` to the yes/no and option-card components, keeping their existing `min-h-*` as the coarse-pointer default.

- [ ] **Step 4: Measure it**

Run a Playwright check at 1440x900: assert `document.documentElement.scrollWidth <= innerWidth + 1`, that the header and footer widths equal the column width, and that no focusable control sits behind the footer.

- [ ] **Step 5: Commit**

```bash
git add components/SectionRail.tsx components/SectionShell.tsx app/globals.css
git commit -m "feat: desktop rail and composed column"
```

---

### Task 14: Verification sweep and documentation

**Files:**
- Modify: `README.md`, `Implementation.md`

- [ ] **Step 1: Full gate**

```bash
npm run typecheck
npm test
NEXT_DIST_DIR=.next-verify npx next build && rm -rf .next-verify
node scripts/smoke-browser.mjs http://localhost:3000
grep -rn "—\|–" --include=*.ts --include=*.tsx --include=*.mjs --include=*.css --include=*.md . | grep -v node_modules
```

Expected: typecheck clean, all suites pass, build clean, smoke `0 error(s), 0 fatal`, dash grep silent.

- [ ] **Step 2: Check both languages at all three text sizes**

Walk one section in English and one in Hindi at standard, larger and largest. Expected: no clipped Devanagari, no horizontal overflow, the section fits without scrolling at standard size.

- [ ] **Step 3: Update the docs**

`README.md`: replace the "one question per screen" claim with the grouped model, update the test count, add `lib/sections.ts`, `lib/summary.ts`, `lib/keymap.ts`, `components/QuestionCard.tsx`, `components/SectionShell.tsx`, `components/SectionRail.tsx` to the file map, and document the desktop layout.

`Implementation.md`: add a section on the grouped IA that states the reasoning (seventeen screens of identical chrome is its own fatigue; chunking with progressive disclosure keeps the low load and cuts navigations to six), the accordion transition rules including why a correction does not jump forward, the contrast findings from Task 1 including that the accent fill carries no text, and the keyboard rule that numbers never advance.

- [ ] **Step 4: Commit**

```bash
git add README.md Implementation.md
git commit -m "docs: grouped intake, direction B palette, desktop and keyboard"
```

---

## Self-review

**Spec coverage.** Section 3 IA to Task 4. Section 4 card states and transitions to Tasks 7 and 9; carve-outs: tables in Task 5 summary plus Task 7 `tableStage`, About You in Task 9, consent summary in Task 5. Keyboard to Tasks 11 and 12. Section 5 foundations to Tasks 1 to 3. Section 6 layout to Tasks 8 and 13. Section 7 components to Tasks 7 to 9. Section 8 state to Task 6. Section 9 i18n to Task 5 and the new keys in Task 8. Section 10 verification to Tasks 1, 2, 10 and 14. Section 11 phasing matches the task order.

**Two spec items with no task, now added above:** the polite live region announcement on tap (folded into Task 9 as part of the open-question effect) and the dark-mode pass (folded into Task 1, which writes both themes and tests both).

**Type consistency.** `Section`, `SectionValidation`, `KeyAction`, `KeyContext` are defined once and referenced with the same names. `openQuestionId` is used consistently (not `openQuestionKey`, which the spec called it: **the plan's name wins, and Task 6's test pins it**). `answerSummary`/`shortLabel` signatures match between Task 5 and Task 7.

**Known deviation from the spec:** the spec said `openQuestionKey`; the plan uses `openQuestionId` because About You has no question key and the card is addressed by step id everywhere else.
