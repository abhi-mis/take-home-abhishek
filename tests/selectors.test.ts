/**
 * Regression guard for a bug that actually shipped: an infinite render loop.
 *
 * `useIntake((s) => s.steps())` looked harmless. But Zustand compares each selector's
 * result with Object.is, and `steps()` built a fresh array on every call, so the result
 * never compared equal - React re-rendered until it threw "Maximum update depth
 * exceeded" (plus a "getServerSnapshot should be cached" warning on the SSR path).
 *
 * A type checker cannot catch this and neither can a unit test on the store, because
 * the bug lives in the *shape of the call site*. So this test reads the source.
 *
 * The rule it enforces: a `useIntake(...)` selector may only PROJECT state - read a
 * field or a stable action reference. It may never CALL anything or CONSTRUCT an object
 * or array. Derive with `useMemo` at the call site instead.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SEARCH_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = SEARCH_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

/**
 * Comments must be stripped before scanning - the doc block in store.ts quotes the
 * offending pattern on purpose to warn people off it, and a scanner that reads prose
 * would flag the warning itself.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Grab the selector body from each `useIntake((s) => <body>)` call. */
function selectorsIn(src: string): string[] {
  const out: string[] = [];
  const re = /useIntake\(\s*\((\w+)\)\s*=>\s*([^\n]*?)\s*\)\s*[;,)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(src))) !== null) out.push(m[2] ?? "");
  return out;
}

describe("Zustand selectors must be referentially stable", () => {
  const found: { file: string; body: string }[] = [];
  for (const file of files) {
    for (const body of selectorsIn(readFileSync(file, "utf8"))) {
      found.push({ file: path.relative(ROOT, file), body });
    }
  }

  it("finds the selectors it is supposed to be checking", () => {
    // If this drops to zero the regex has rotted and the test is silently vacuous.
    expect(found.length).toBeGreaterThan(0);
  });

  it("never calls a function inside a selector", () => {
    // `s.steps()` - the exact bug. A trailing `()` means a new value every render.
    const offenders = found.filter((f) => /\w\s*\([^)]*\)\s*$/.test(f.body));
    expect(offenders).toEqual([]);
  });

  it("never builds an object or array inside a selector", () => {
    // `s => ({a: s.a, b: s.b})` and `s => [s.a]` are new references every render.
    const offenders = found.filter((f) => /^[({[]/.test(f.body.trim()));
    expect(offenders).toEqual([]);
  });

  it("keeps every selector a plain property projection", () => {
    // Allow `s.answers`, `s.patch`, and primitive-returning reads like
    // `Object.keys(s.touched).length` - reject anything else.
    const allowed = /^\w+\.[\w.[\]"'-]+$/;
    const primitiveRead = /\.length$|^\w+\.\w+ [=!<>]/;
    const offenders = found.filter(
      (f) => !allowed.test(f.body.trim()) && !primitiveRead.test(f.body.trim()),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the store exposes no derived getters", () => {
  const src = readFileSync(path.join(ROOT, "lib", "store.ts"), "utf8");

  it("declares no method returning a fresh array or object", () => {
    // Removing steps()/progress() is what makes the bug unreachable rather than
    // merely fixed at one call site.
    expect(src).not.toMatch(/^\s*steps:\s*\(\)/m);
    expect(src).not.toMatch(/^\s*progress:\s*\(\)/m);
  });

  it("documents why, so nobody adds one back", () => {
    expect(src).toMatch(/Maximum update depth exceeded/);
  });
});
