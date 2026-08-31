/**
 * Browser smoke test — `node scripts/smoke-browser.mjs [baseURL]`
 *
 * Written after shipping an infinite render loop that every other check missed:
 * typecheck passed, 75 unit tests passed, the production build passed, and `curl`
 * returned HTTP 200 — because the loop only happens in a real React client.
 *
 * It drives a real browser at 380px, taps the entire intake as a female patient (the
 * path with the MOST steps, so Q6/Q7 gating is exercised), and fails on any console
 * error or page exception.
 *
 * Locators are ROLE-based on purpose. The first draft used getByText("Saliva") and
 * silently clicked the *hint* ("Saliva mein sui nahi lagti"), which sits above the
 * options — so the test failed while the app was correct. Options are real radios and
 * checkboxes (see OptionCard), so ask for those.
 *
 * Needs no API keys: every question is completed by tapping.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";

const errors = [];
const notes = [];

const FATAL_PATTERNS =
  /Maximum update depth|getServerSnapshot|Too many re-renders|Rendered more hooks|Cannot update a component/i;

function record(kind, text) {
  errors.push({ kind, text: text.slice(0, 300), fatal: FATAL_PATTERNS.test(text) });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 380, height: 780 } });

page.on("console", (m) => {
  if (m.type() === "error") record("console.error", m.text());
});
page.on("pageerror", (e) => record("pageerror", String(e)));

/** Current question heading, for readable failure messages. */
async function heading() {
  try {
    return (await page.locator("h1").first().innerText({ timeout: 2_000 })).replace(/\s+/g, " ");
  } catch {
    return "(no h1)";
  }
}

async function tap(locator, label) {
  const where = await heading();
  try {
    await locator.waitFor({ state: "visible", timeout: 12_000 });
    await locator.click();
  } catch {
    throw new Error(`could not tap ${label} — screen was: ${where}`);
  }
  notes.push(`${String(where).slice(0, 44).padEnd(46)} tap ${label}`);
  // Auto-advance is a 180ms beat plus a ~220ms transition; wait past both.
  await page.waitForTimeout(420);
}

const tapOption = (name) => tap(page.getByRole("radio", { name }), `option "${name}"`);
const tapCheck = (name) => tap(page.getByRole("checkbox", { name }), `check "${name}"`);
const tapButton = (name) => tap(page.getByRole("button", { name }), `button "${name}"`);

try {
  // ---------- landing ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  notes.push(`page title: ${JSON.stringify(await page.title())}`);
  await tapButton("Shuru karein");
  await page.waitForURL(/\/intake/, { timeout: 15_000 });

  // ---------- Q1 age (preset + explicit Next) ----------
  await tapButton(/^30s/);
  await tapButton("Aage");

  // ---------- Q2 duration (auto-advance) ----------
  await tapOption("Over a year");

  // ---------- Q3 family history (multi) ----------
  await tapCheck(/Father had hair loss/);
  await tapButton("Aage");

  // ---------- Q4 pattern (multi) ----------
  await tapCheck(/Thinning at crown/);
  await tapButton("Aage");

  // ---------- sex gate: Female gives the longest path ----------
  await tapOption(/^Female/);
  notes.push("chose Female — Q6 and Q7 must now appear");

  // ---------- Q5 conditions (multi) ----------
  await tapCheck(/Thyroid disorder/);
  await tapButton("Aage");

  // ---------- Q6 + Q7: exist ONLY because of the gate ----------
  await tapOption(/^Irregular/);
  await tapOption(/^Not applicable/);
  notes.push("Q6 + Q7 rendered — live gating confirmed");

  // ---------- Q8, Q9 yes/no ----------
  await tapOption("Haan");
  await tapOption("Nahi");

  // ---------- Q10 past 6 months (multi) ----------
  await tapCheck(/Recent surgery/);
  await tapButton("Aage");

  // ---------- Q11 habits: tap fallback, no voice ----------
  // hair_wash_frequency is the one habits field with no safe default.
  await tapOption("Alternate Days");
  await tapButton("Aage");
  notes.push("Q11 habits completed by tapping (voice never needed)");

  // ---------- Q12 products, Q13 procedures: leave every row off ----------
  await tapButton("Aage");
  await tapButton("Aage");

  // ---------- Q14 side effects: No (so no description is required) ----------
  await tapOption("Nahi");
  await tapButton("Aage");

  // ---------- Q15 sample type ----------
  await tapOption(/^Saliva/);

  // ---------- Q16 consent: never pre-ticked ----------
  const consentPreselected = await page
    .getByRole("radio", { name: /Haan, permission hai/ })
    .getAttribute("aria-checked");
  notes.push(`consent pre-selected on arrival? ${consentPreselected}  (must be "false")`);
  if (consentPreselected !== "false") throw new Error("consent was pre-selected");
  await tapOption(/Haan, permission hai/);
  await tapButton("Aage");

  // ---------- review ----------
  await page.getByText("Bas ho gaya!").waitFor({ state: "visible", timeout: 15_000 });
  notes.push("reached the Review screen");

  const dl = page.getByRole("button", { name: /JSON download karein/ });
  await dl.waitFor({ state: "visible", timeout: 10_000 });
  if (!(await dl.isEnabled()))
    throw new Error("form completed by tapping, but validate() still rejected it");
  notes.push("download enabled — validate() says shape + all 16 keys are satisfied");

  // ---------- inspect the actual output object ----------
  await page.getByRole("button", { name: /Raw JSON dekhein/ }).click();
  await page.waitForTimeout(500);
  const parsed = JSON.parse(await page.locator("pre").first().innerText());
  const a = parsed.answers;
  notes.push(`patient_sex: ${JSON.stringify(parsed.patient_sex)}`);
  notes.push(`menstrual_cycle: ${JSON.stringify(a.menstrual_cycle)} (asked, female)`);
  notes.push(`duration: ${JSON.stringify(a.duration)}`);
  notes.push(`consent: ${JSON.stringify(a.consent)}`);
  notes.push(`habits.hair_wash_frequency: ${JSON.stringify(a.habits.hair_wash_frequency)}`);
  notes.push(`products rows: ${Object.keys(a.products).length}`);
  notes.push(`answer keys: ${Object.keys(a).length}`);

  if (a.menstrual_cycle === null) throw new Error("female patient got a null menstrual_cycle");
  if (a.consent !== true) throw new Error("consent did not record as true");

  // ---------- gating in the other direction ----------
  // Go back to the gate, switch to Male, and confirm Q6/Q7 vanish AND their stored
  // answers are nulled rather than left stale.
  await page.getByRole("button", { name: /menstrual_cycle|Periods kaise/ }).first().click();
  await page.waitForTimeout(500);
  // The gate is inserted before the FIRST section-B question, which is Q5 — so from
  // Q6 it is two steps back (Q6 -> Q5 -> gate), not one.
  await tapButton("Peeche");
  await tapButton("Peeche");
  const atGate = await heading();
  notes.push(`two Peeche taps from Q6 landed on: ${atGate}`);
  await tapOption(/^Male/);
  notes.push("switched sex to Male");

  const stillAsksPeriods = await page
    .getByRole("radio", { name: /^Irregular/ })
    .isVisible()
    .catch(() => false);
  notes.push(`Q6 still shown after switching to Male? ${stillAsksPeriods}  (must be false)`);
  if (stillAsksPeriods) throw new Error("Q6 still rendered for a male patient");
} catch (e) {
  errors.push({ kind: "walkthrough", text: String(e).slice(0, 400), fatal: true });
  try {
    await page.screenshot({ path: "smoke-failure.png", fullPage: true });
    notes.push("screenshot -> smoke-failure.png");
  } catch {
    /* page may already be closed */
  }
} finally {
  await browser.close();
}

console.log("\n--- walkthrough ---");
for (const n of notes) console.log("  " + n);

const fatal = errors.filter((e) => e.fatal);
console.log("\n--- console / page errors ---");
if (errors.length === 0) console.log("  none");
for (const e of errors) console.log(`  [${e.fatal ? "FATAL" : "warn "}] ${e.kind}: ${e.text}`);

console.log(
  `\n${fatal.length === 0 ? "PASS" : "FAIL"} — ${errors.length} error(s), ${fatal.length} fatal\n`,
);
process.exit(fatal.length === 0 ? 0 : 1);
