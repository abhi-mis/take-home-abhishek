/**
 * The one rule a checkbox list needs: what happens when an option is tapped.
 *
 * Pure - no DOM, no store, no side effects - because the rule it encodes is clinical, not
 * cosmetic. Several questions carry an exclusive option ("None of these", "No known family
 * history") which cannot coexist with any other answer, and getting that wrong produces
 * `["Anemia", "None"]` in a file a doctor reads. That is worth a function of its own with
 * tests that need no browser.
 *
 * This was `lib/keymap.ts`, which also turned key presses into intentions for a set of
 * keyboard shortcuts the form no longer has. When those went, the file was left holding one
 * tap rule under a name describing a keyboard, so it moved here.
 */

export function toggleMulti(
  values: readonly string[],
  option: string,
  exclusive: string | undefined,
): string[] {
  if (exclusive !== undefined && option === exclusive) {
    return values.includes(option) ? [] : [option];
  }
  const withoutExclusive =
    exclusive === undefined ? [...values] : values.filter((v) => v !== exclusive);
  return withoutExclusive.includes(option)
    ? withoutExclusive.filter((v) => v !== option)
    : [...withoutExclusive, option];
}
