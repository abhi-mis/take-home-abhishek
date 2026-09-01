/**
 * The palette, checked by arithmetic rather than by eye.
 *
 * The warm direction was approved from a mockup whose terracotta is 4.01:1 against the
 * paper ground - it FAILS as text, and that is exactly the kind of thing that ships when a
 * palette is signed off by looking at it. So the tokens are parsed straight out of
 * globals.css and every pair the design actually uses is asserted here, in both themes.
 *
 * The hard rule this file exists to keep: the accent fill carries NO text. White on it is
 * 4.35:1 and ink on it is 3.99:1, so both fail. Filled controls that need a label use the
 * ink token with paper text, which is 16:1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/**
 * Pull one token's value out of a specific block of globals.css.
 *
 * Reading the stylesheet rather than a TS constant is deliberate: the stylesheet is what
 * ships, and a duplicate of these values in TypeScript would be one more thing to drift.
 */
function token(block: string, name: string): string {
  const start = CSS.indexOf(block);
  expect(start, `block not found: ${block}`).toBeGreaterThan(-1);
  const end = CSS.indexOf("}", start);
  const body = CSS.slice(start, end);
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body);
  expect(m, `token --${name} not found in block ${block}`).not.toBeNull();
  return m?.[1] ?? "";
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

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Anchors unique enough to find each theme's token block. */
const LIGHT = ":root {\n  --paper";
const DARK = ':root[data-theme="dark"] {';
const DARK_MEDIA = ':root:not([data-theme="light"]) {';

const PAIRS: [string, string, string, number][] = [
  ["ink on paper", "ink", "paper", 4.5],
  ["ink on card", "ink", "card", 4.5],
  ["muted on paper", "muted", "paper", 4.5],
  ["muted on card", "muted", "card", 4.5],
  ["accent text on paper", "brand-ink", "paper", 4.5],
  ["accent text on card", "brand-ink", "card", 4.5],
  ["accent text on its own tint", "brand-ink", "brand-soft", 4.5],
  ["warn on paper", "warn", "paper", 4.5],
  ["accent fill as a border on card", "brand", "card", 3.0],
  ["done mark on card", "done", "card", 3.0],
];

for (const [themeName, block] of [
  ["light", LIGHT],
  ["dark", DARK],
  ["dark via prefers-color-scheme", DARK_MEDIA],
] as const) {
  describe(`${themeName} palette`, () => {
    const T = (n: string) => token(block, n);

    for (const [name, fg, bg, need] of PAIRS) {
      it(`${name} meets ${need}:1`, () => {
        const r = ratio(T(fg), T(bg));
        expect(r, `${name} measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(need);
      });
    }

    /**
     * A card has to read as a card, and the two themes achieve that differently.
     *
     * In light, a white card on warm paper is only 1.09:1 and that is fine: the edge is
     * carried by the rule and a soft shadow. In dark, shadows do not read at all, so the
     * card must genuinely lift off the ground or the accordion becomes one flat sheet.
     * Asserting the same number for both would have forced a grey card into the light
     * theme for no reader's benefit.
     */
    it("separates a card from the ground the way this theme does it", () => {
      const lift = ratio(T("card"), T("paper"));
      const ruleOnGround = ratio(T("line"), T("paper"));
      const ruleOnCard = ratio(T("line"), T("card"));
      if (themeName === "light") {
        expect(ruleOnGround, `rule on ground ${ruleOnGround.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.15);
        expect(ruleOnCard, `rule on card ${ruleOnCard.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.25);
      } else {
        expect(lift, `card lift ${lift.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.25);
      }
    });

    it("keeps the primary button readable: paper text on an ink fill", () => {
      expect(ratio(T("paper"), T("ink"))).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the rule visible against the card it divides", () => {
      expect(ratio(T("line"), T("card"))).toBeGreaterThanOrEqual(1.15);
    });
  });
}

describe("the accent fill carries no text", () => {
  it("documents why, in both directions", () => {
    // If a future change puts a label on --brand, this is the arithmetic that says it
    // cannot be done: neither white nor ink clears 4.5:1 on it.
    const brand = token(LIGHT, "brand");
    expect(ratio("#ffffff", brand)).toBeLessThan(4.5);
    expect(ratio(token(LIGHT, "ink"), brand)).toBeLessThan(4.5);
  });
});
