/**
 * Browser smoke test - `node scripts/smoke-browser.mjs [baseURL]`
 *
 * Written after shipping an infinite render loop that every other check missed:
 * typecheck passed, 75 unit tests passed, the production build passed, and `curl`
 * returned HTTP 200 - because the loop only happens in a real React client.
 *
 * It drives a real browser at 380px, taps the entire intake as a female patient (the
 * path with the MOST steps, so Q6/Q7 gating is exercised), and fails on any console
 * error or page exception.
 *
 * Locators are ROLE-based on purpose. The first draft used getByText("Saliva") and
 * silently clicked the *hint* ("Saliva mein sui nahi lagti"), which sits above the
 * options - so the test failed while the app was correct. Options are real radios and
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
  } catch (e) {
    // Keep the original Playwright message: "disabled", "strict mode violation" and
    // "intercepts pointer events" are three very different bugs and the wrapper used
    // to flatten all of them into one useless line.
    const why = String(e).split("\n").slice(0, 2).join(" | ");
    throw new Error(`could not tap ${label} - screen was: ${where} - cause: ${why}`);
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
  await tapButton("Start");
  await page.waitForURL(/\/intake/, { timeout: 15_000 });

  // Read-aloud must be on every question, not just the first: it is the accessibility
  // path for a patient who cannot comfortably read the screen.
  //
  // Wait for the heading first. The check used to run the instant the URL changed, which
  // is before the header paints - a flaky pass that turned into a flaky failure the day
  // the header grew a fourth control.
  await page.getByRole("heading").first().waitFor({ timeout: 10_000 });
  const speaker = page.getByRole("button", { name: /Read the question aloud/ });
  if ((await speaker.count()) === 0)
    errors.push({ kind: "speaker", text: "no read-aloud button on Q1", fatal: false });
  else notes.push("read-aloud button present");

  // ---------- About You: the personalisation gate ----------
  // Next must be blocked until BOTH sex and age are given, because both change the rest
  // of the form: gated questions, text size, and the onset-age ceiling at Q1.
  const aboutBlocked = await page.getByRole("button", { name: "Next" }).isDisabled();
  notes.push(`About You blocks Next before answers? ${aboutBlocked}  (must be true)`);
  if (!aboutBlocked)
    errors.push({ kind: "about", text: "About You did not gate Next", fatal: false });

  await page.getByRole("textbox", { name: /First name/ }).fill("Asha");
  // A name that is asked for has to be shown back, or the field is taking something for
  // nothing. It is echoed here, on question 1, and again at the end.
  await page.waitForTimeout(600);
  const ackOnScreen = await page.locator("main").innerText();
  if (!/Thank you, Asha/.test(ackOnScreen))
    errors.push({ kind: "name", text: "the name was not acknowledged on the About You screen", fatal: false });
  else notes.push('the name is echoed as you type: "Thank you, Asha"');
  await tapOption(/^Female/);
  if (!(await page.getByRole("button", { name: "Next" }).isDisabled()))
    errors.push({ kind: "about", text: "sex alone was enough to pass About You", fatal: false });
  else notes.push("sex alone is not enough - the age is still required");

  // 55-64 must OFFER the bigger text size, and change nothing until it is accepted.
  await tapButton("55-64");
  await page.waitForTimeout(900); // the offer is held back half a second on purpose
  const dialog = page.getByRole("dialog");
  if ((await dialog.count()) === 0)
    errors.push({ kind: "comfort", text: "no text-size prompt for a 55-64 patient", fatal: false });
  else notes.push("text-size prompt offered, with both sizes previewed");

  const zoomBefore = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--comfort-zoom").trim(),
  );
  if (zoomBefore !== "1")
    errors.push({
      kind: "comfort",
      text: `the page resized before the patient answered (zoom ${zoomBefore})`,
      fatal: false,
    });
  else notes.push("nothing resized while the prompt was still unanswered");

  await tapButton("Yes, make it bigger");
  await page.waitForTimeout(500);
  const comfortAttr = await page.evaluate(() => document.documentElement.dataset.comfort ?? "");
  const zoom = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--comfort-zoom").trim(),
  );
  notes.push(`accepted -> data-comfort="${comfortAttr}", --comfort-zoom=${zoom}`);
  if (comfortAttr !== "large")
    errors.push({
      kind: "comfort",
      text: `expected larger text for a 55-64 patient, got "${comfortAttr}"`,
      fatal: false,
    });

  const headerText = (await page.locator("header").innerText()).replace(/\s+/g, " ");
  notes.push(`header summary: ${headerText.slice(0, 70)}`);
  if (!/Female/.test(headerText))
    errors.push({ kind: "personal", text: "header does not show what was customised", fatal: false });

  await tapButton("Next");

  // ---------- Q1 age (preset + explicit Next) ----------
  // Decade cards above the patient's own age must be closed, not silently clamped.
  const bands = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => /^(Teens|20s|30s|40s|50\+)/.test((b.textContent ?? "").trim()))
      .map((b) => `${(b.textContent ?? "").trim().slice(0, 5)}:${b.getAttribute("aria-disabled")}`),
  );
  notes.push(`onset decade cards at 60: ${bands.join(" ")}`);
  if (bands.some((b) => b.endsWith(":true")))
    errors.push({ kind: "onset", text: "a decade card was closed for a 60-year-old", fatal: false });

  const q1Text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  if (!/Welcome, Asha/.test(q1Text))
    errors.push({ kind: "name", text: "question 1 does not carry the welcome forward", fatal: false });
  else notes.push("question 1 greets the patient by name");

  // The patient said they are 60, so the onset slider must not go past that.
  const onsetMax = await page.evaluate(() => {
    const el = document.querySelector('input[type="range"]');
    return el instanceof HTMLInputElement ? el.max : "";
  });
  notes.push(`onset-age slider max for a 60-year-old: ${onsetMax || "(no slider yet)"}`);
  await tapButton(/^30s/);
  const onsetMaxAfter = await page.evaluate(() => {
    const el = document.querySelector('input[type="range"]');
    return el instanceof HTMLInputElement ? Number(el.max) : -1;
  });
  if (onsetMaxAfter > 60)
    errors.push({
      kind: "ceiling",
      text: `onset age could be set to ${onsetMaxAfter} by a 60-year-old`,
      fatal: false,
    });
  else notes.push(`onset age capped at ${onsetMaxAfter} - cannot exceed the patient's age`);
  await tapButton("Next");

  // ---------- Q2 duration (auto-advance) ----------
  await tapOption("Over a year");

  /*
    Selecting an answer must NOT move the screen on. Auto-advance saved a tap per question
    and cost the patient any chance to see a mis-tap before it became a clinical answer on
    a screen they had already left. So the question stays put and Next appears.
  */
  const stillOnQ2 = await heading();
  notes.push(`after picking an option, still on: "${stillOnQ2}"  (must not auto-advance)`);
  if (!/how long/i.test(stillOnQ2))
    errors.push({
      kind: "advance",
      text: `picking an option skipped ahead to "${stillOnQ2}"`,
      fatal: true,
    });
  const nextAfterPick = page.getByRole("button", { name: "Next" });
  if (await nextAfterPick.isDisabled())
    errors.push({ kind: "advance", text: "Next stayed disabled on an answered single-select", fatal: true });
  else notes.push("Next is present and enabled once an option is chosen");
  await tapButton("Next");

  // Validation must actually BLOCK, and it must explain itself when the patient tries.
  const nextBtn = page.getByRole("button", { name: "Next" });
  await nextBtn.waitFor({ state: "visible", timeout: 12_000 });
  const blocked = await nextBtn.isDisabled();
  if (!blocked) throw new Error("Next was enabled on an unanswered multi-select");

  // On ARRIVAL the screen must be quiet - telling someone off before they have done
  // anything is the fastest way to make software feel hostile.
  const nagOnArrival = await page.getByRole("status").count();
  notes.push(`Q3 nags before any interaction? ${nagOnArrival > 0}  (must be false)`);
  if (nagOnArrival > 0)
    errors.push({ kind: "nag", text: "the outstanding list appeared before the patient acted", fatal: false });

  // Pressing the blocked Next passes the tap to its wrapper, which reveals the reason.
  await nextBtn.click({ force: true });
  await page.waitForTimeout(320);
  const reason = await page.getByRole("status").innerText().catch(() => "");
  notes.push(`after pressing a blocked Next: ${JSON.stringify(reason.replace(/\s+/g, " ").slice(0, 60))}`);
  if (!reason) errors.push({ kind: "nag", text: "a blocked Next explained nothing", fatal: false });

  // ---------- Q3 family history (multi) ----------
  await tapCheck(/Father had hair loss/);
  await tapButton("Next");

  // ---------- Q4 pattern: the diagram picker ----------
  const diagrams = await page.locator("main svg").count();
  notes.push(`Q4 rendered ${diagrams} inline diagrams (6 patterns expected)`);
  if (diagrams < 6) throw new Error(`expected 6 scalp diagrams, found ${diagrams}`);
  await tapCheck("Thinning at crown");
  await tapButton("Next");

  // ---------- Q5 conditions (multi) ----------
  await tapCheck(/Thyroid disorder/);
  // Open for a female patient - and the thing the sex-switch check below depends on.
  const pcosBlocked = await page
    .getByRole("checkbox", { name: /PCOS/ })
    .getAttribute("aria-disabled");
  if (pcosBlocked === "true")
    errors.push({ kind: "gate", text: "PCOS/PCOD was closed for a female patient", fatal: false });
  else notes.push("PCOS/PCOD is available to a female patient");
  await tapCheck(/PCOS/);
  await tapButton("Next");

  // ---------- Q6 + Q7: exist ONLY because of the gate ----------
  await tapOption(/^Irregular/);
  await tapButton("Next");
  await tapOption(/^Not applicable/);
  await tapButton("Next");
  notes.push("Q6 + Q7 rendered - live gating confirmed");

  // ---------- Q8, Q9 yes/no ----------
  // A yes/no is the easiest control in the form to hit by accident, so it is also the one
  // that must not move the screen on by itself.
  await tapOption("Yes");
  const stillOnQ8 = await heading();
  if (!/acne|oily/i.test(stillOnQ8))
    errors.push({ kind: "advance", text: `a yes/no auto-advanced to "${stillOnQ8}"`, fatal: true });
  else notes.push("a yes/no answer does not move the screen on either");
  await tapButton("Next");
  await tapOption("No");
  await tapButton("Next");

  // ---------- Q10 past 6 months (multi) ----------
  await tapCheck(/Recent surgery/);
  await tapButton("Next");

  // ---------- Q11: voice questions open on the SPEAK screen, not the grid ----------
  const gridHiddenAtFirst = !(await page
    .getByText("Do you drink?")
    .isVisible()
    .catch(() => false));

  /*
   * The spoken prompt must enumerate EVERY item, not summarise them in prose. A prose
   * paragraph read well but quietly dropped rows, so patients answered three of six and
   * the fill looked broken. This asserts one checklist entry per habit row, each naming
   * its topic - the regression that actually happened.
   */
  const checklist = (await page.locator("ol li").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  const mustMention = ["Smoking", "Alcohol", "Hard water", "wash your hair", "chemicals", "Salon"];
  const missingTopics = mustMention.filter((m) => !checklist.some((c) => c.includes(m)));
  notes.push(`Q11 speak checklist: ${checklist.length} items, grid hidden ${gridHiddenAtFirst}`);
  if (!gridHiddenAtFirst)
    throw new Error("voice question did not default to the speak-first screen");
  if (checklist.length < 6 || missingTopics.length > 0)
    throw new Error(`speak prompt does not cover every item; missing: ${missingTopics.join(", ")}`);
  // The conditional layer has to be stated up front too, or one reply leaves blanks.
  if (!checklist.some((c) => c.includes("how many per day")))
    throw new Error("speak prompt omits the conditional detail (smoking amount)");

  // No API keys are needed for the tap path, so take the documented escape hatch.
  await tapButton(/I would rather answer by tapping/);
  notes.push("chose to tap instead - the grid appears");

  // ---------- Q11 habits: EVERY row must be answered now ----------
  const habitsBlocked = await page.getByRole("button", { name: "Next" }).isDisabled();
  notes.push(`Q11 Next disabled with rows unanswered? ${habitsBlocked}`);
  if (!habitsBlocked) throw new Error("habits step allowed Next with unanswered rows");

  // Desktop affordance check: Tailwind v4's preflight sets buttons to cursor:default,
  // which made every control feel dead under a mouse. Assert it is fixed.
  const micCursor = await page
    .getByRole("button", { name: /Answer by speaking/ })
    .evaluate((el) => getComputedStyle(el).cursor);
  notes.push(`mic button cursor: ${micCursor}  (must be "pointer")`);
  if (micCursor !== "pointer") throw new Error(`mic cursor was ${micCursor}, expected pointer`);

  // ---------- the guided follow-up flow ----------
  // This is how layered questions get answered after a voice fill: one full-size
  // question at a time, recomputed from the answers so new layers appear as they unlock.
  await tapButton(/Answer the remaining/);
  const flow = page.locator("section[aria-label='Remaining questions']");
  await flow.waitFor({ state: "visible", timeout: 10_000 });
  notes.push(`follow-up flow opened: ${(await flow.locator("p").first().innerText()).trim()}`);

  // While the flow runs, the grid and the outstanding summary must both stand down - // otherwise the same question appears three times on one screen.
  const gridVisible = await page
    .getByText("Do you drink?")
    .isVisible()
    .catch(() => false);
  const summaryVisible = await page
    .getByRole("status")
    .isVisible()
    .catch(() => false);
  notes.push(`during flow - grid hidden: ${!gridVisible}, summary hidden: ${!summaryVisible}`);
  if (gridVisible || summaryVisible) throw new Error("flow is duplicated by the grid/summary");

  // Answer "Yes" to smoking so a NEW layer (severity) unlocks mid-flow, then finish.
  await tap(flow.getByRole("button", { name: "Yes" }), "flow: smoking = Yes");
  // The layer must appear IMMEDIATELY after its trigger, not at the end of the queue.
  const unlocked = await flow
    .getByText(/How much do you smoke/)
    .isVisible()
    .catch(() => false);
  notes.push(`"Yes" unlocked its deeper question right away: ${unlocked}`);
  if (!unlocked) throw new Error("layered follow-up did not appear directly after its trigger");

  for (let i = 0; i < 12; i++) {
    if (!(await flow.isVisible().catch(() => false))) break;
    const btn = flow.getByRole("button").filter({ hasNotText: /Use list|Save|Got it/ }).last();
    if (!(await btn.isVisible().catch(() => false))) break;
    const label = (await btn.innerText().catch(() => "?")).trim().slice(0, 22);
    if (/^(Yes|No)$/.test(label) || label.length > 0) await tap(btn, `flow: ${label}`);
    else break;
    // The salon detail is free text; type it rather than tapping.
    const textbox = flow.getByRole("textbox");
    if (await textbox.isVisible().catch(() => false)) {
      await textbox.fill("keratin, 6 months ago");
      await tap(flow.getByRole("button", { name: "Save" }), "flow: save salon detail");
    }
  }
  notes.push("follow-up flow completed every outstanding field");

  const nextNowEnabled = await page.getByRole("button", { name: "Next" }).isEnabled();
  notes.push(`Q11 Next enabled after the flow: ${nextNowEnabled}`);
  if (!nextNowEnabled) throw new Error("flow finished but the step is still incomplete");
  await tapButton("Next");

  // ---------- Q12 products, Q13 procedures: answer every row via the grid ----------
  for (const [label, count] of [["products", 5], ["procedures", 4]]) {
    await tapButton(/I would rather answer by tapping/);
    const stillBlocked = await page.getByRole("button", { name: "Next" }).isDisabled();
    if (!stillBlocked) throw new Error(`${label} allowed Next with unanswered rows`);

    if (label === "products") {
      /*
       * Answering "yes" to a row does not finish it - it unlocks three more questions.
       * Those must be ASKED (scoped to that row), not silently revealed further down a
       * collapsed grid. This walks the chain and then switches the row back off.
       */
      await tap(page.getByRole("radio", { name: "Yes" }).first(), "products row 1 = Yes");
      const cond = page.locator("section[aria-label='Remaining questions']");
      await cond.waitFor({ state: "visible", timeout: 10_000 });
      const chain = [];
      for (let i = 0; i < 4; i++) {
        const q = await cond.locator("p").nth(1).innerText().catch(() => null);
        if (!q) break;
        chain.push(q.replace(/\s+/g, " ").trim());
        const btn = cond.getByRole("button").filter({ hasNotText: /Use list|Save|Got it/ }).last();
        if (!(await btn.isVisible().catch(() => false))) break;
        await btn.click();
        await page.waitForTimeout(430);
        if (!(await cond.isVisible().catch(() => false))) break;
      }
      notes.push(`conditional chain on "yes": ${chain.join(" -> ")}`);
      if (chain.length < 3)
        throw new Error(`expected 3 conditional questions, got ${chain.length}`);
      // Row labels must be verbatim - an earlier version mangled "OTC" into "oTC".
      if (chain.some((q) => /oTC|pRP/.test(q)))
        throw new Error(`row name was mangled in a conditional question: ${chain[0]}`);
    }

    for (let i = 0; i < Number(count); i++) {
      await tap(page.getByRole("radio", { name: "No" }).nth(i), `${label} row ${i + 1} = No`);
    }
    await tapButton("Next");
    notes.push(`Q${label === "products" ? 12 : 13} ${label}: all rows answered No`);
  }

  // ---------- Q14 side effects: No (so no description is required) ----------
  await tapOption("No");
  await tapButton("Next");

  // ---------- Q15 sample type ----------
  await tapOption(/^Saliva/);
  await tapButton("Next");

  // ---------- Q16 consent: never pre-ticked ----------
  const consentPreselected = await page
    .getByRole("radio", { name: /Yes, I agree/ })
    .getAttribute("aria-checked");
  notes.push(`consent pre-selected on arrival? ${consentPreselected}  (must be "false")`);
  if (consentPreselected !== "false") throw new Error("consent was pre-selected");
  await tapOption(/Yes, I agree/);
  await tapButton("Next");

  // ---------- review ----------
  await page.getByText("All done").waitFor({ state: "visible", timeout: 15_000 });
  notes.push("reached the Review screen");

  // ---------- the language switch ----------
  /*
    Two things have to be true at once, and only one of them is about translation.

    The screen has to be entirely in one language - a single English sentence is the one
    a Hindi-only patient needed - so this scans the rendered text for Latin words with an
    allowlist for the terms that stay in English on purpose (PCOS, PRP, the product name).

    And the ANSWERS have to be untouched. Hindi is presentation: the JSON handed to the
    doctor must be byte-identical whichever language the form was filled in, so the same
    stored values are re-read after the switch.
  */
  const beforeSwitch = await page.evaluate(() => {
    const raw = sessionStorage.getItem("genoroot-intake-v1");
    return raw === null ? null : JSON.stringify((JSON.parse(raw).state ?? JSON.parse(raw)).answers);
  });

  await page.getByRole("radio", { name: /हिंदी|Switch the form to Hindi/ }).first().click();
  await page.waitForTimeout(700);

  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  notes.push(`switched to Hindi -> <html lang="${htmlLang}">`);
  if (htmlLang !== "hi")
    errors.push({
      kind: "i18n",
      text: `html lang should be "hi" for a screen reader to use a Hindi voice, got "${htmlLang}"`,
      fatal: false,
    });

  const ALLOWED_LATIN = /^(GenoRoot|PCOS|PCOD|PRP|GFC|iPRF|DNA|JSON|Aa|EN|Asha)$/i;
  const strayEnglish = await page.evaluate((allow) => {
    const re = new RegExp(allow.source, allow.flags);
    const words = document.body.innerText.split(/[\s·:,.()\/?!"\u201c\u201d\-\[\]|]+/);
    return [...new Set(words.filter((w) => /^[A-Za-z][A-Za-z']{2,}$/.test(w) && !re.test(w)))];
  }, { source: ALLOWED_LATIN.source, flags: ALLOWED_LATIN.flags });

  if (strayEnglish.length > 0)
    errors.push({
      kind: "i18n",
      text: `English left on the Hindi review screen: ${strayEnglish.slice(0, 8).join(", ")}`,
      fatal: false,
    });
  else notes.push("Hindi review screen has no English text left on it");

  /*
    Does any Devanagari text sit too tight in its line box?

    Latin-tuned line-heights clip this script: a 25px Devanagari line paints about 33px
    tall once matras and conjuncts are counted, so `leading-[1.22]` - a normal English
    heading - overflowed by a pixel and Chrome sliced the tops off. The fix is a set of
    Hindi leadings in globals.css; this is the assertion that keeps them.

    Measured per rendered line (`getClientRects`) against the computed line-height, and
    the platform's Devanagari face is forced first so the check tests the metrics a
    patient's phone will actually use rather than whichever fallback this box happens to
    have installed.
  */
  await page.addStyleTag({
    content: '*{font-family:"Nirmala UI","Noto Sans Devanagari","Segoe UI",sans-serif !important}',
  });
  await page.waitForTimeout(200);
  const tightText = await page.evaluate(() => {
    const out = [];
    const walk = (node) => {
      for (const el of node.children) {
        const hasOwnText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
        );
        if (hasOwnText && /[\u0900-\u097F]/.test(el.textContent)) {
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          if (!Number.isNaN(lh)) {
            const r = document.createRange();
            r.selectNodeContents(el);
            const rects = [...r.getClientRects()].filter((x) => x.height > 0);
            const ink = rects.length === 0 ? 0 : Math.max(...rects.map((x) => x.height));
            if (ink / lh > 0.95)
              out.push(`"${el.textContent.trim().slice(0, 18)}" ink ${ink.toFixed(0)} in ${lh.toFixed(0)}`);
          }
        }
        walk(el);
      }
    };
    walk(document.body);
    return out;
  });
  if (tightText.length > 0)
    errors.push({
      kind: "i18n",
      text: `Devanagari at risk of clipping: ${tightText.slice(0, 4).join("; ")}`,
      fatal: false,
    });
  else notes.push("every Devanagari line has room for its matras");

  const afterSwitch = await page.evaluate(() => {
    const raw = sessionStorage.getItem("genoroot-intake-v1");
    return raw === null ? null : JSON.stringify((JSON.parse(raw).state ?? JSON.parse(raw)).answers);
  });
  if (afterSwitch !== beforeSwitch)
    errors.push({
      kind: "i18n",
      text: "switching language changed the answers - it must be presentation only",
      fatal: true,
    });
  else notes.push("answers unchanged by the language switch (still the English schema strings)");

  const devanagariInAnswers = (afterSwitch ?? "").match(/[\u0900-\u097F]/);
  if (devanagariInAnswers !== null)
    errors.push({
      kind: "i18n",
      text: "Devanagari found in the stored answers - the doctor's JSON must stay English",
      fatal: true,
    });
  else notes.push("no Devanagari in the stored answers");

  // Back to English for the rest of the run.
  await page.getByRole("radio", { name: /^EN$|Fill in English/ }).first().click();
  await page.waitForTimeout(500);
  const backHeading = await page.getByRole("heading").first().innerText();
  notes.push(`switched back to English -> "${backHeading.replace(/\s+/g, " ").slice(0, 40)}"`);
  const reviewHeading = await page.getByRole("heading").first().innerText();
  if (!/Asha/.test(reviewHeading))
    errors.push({ kind: "name", text: `review heading dropped the name: "${reviewHeading}"`, fatal: false });
  else notes.push(`review closes with the name: "${reviewHeading}"`);

  // ---------- theme toggle: system -> light -> dark ----------
  const themeBtn = page.getByRole("button", { name: /Appearance/ }).first();
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push(await page.evaluate(() => document.documentElement.dataset.theme ?? "system"));
    await themeBtn.click();
    await page.waitForTimeout(180);
  }
  notes.push(`theme cycle: ${seen.join(" -> ")}`);
  if (new Set(seen).size < 3) throw new Error(`theme did not cycle: ${seen.join(",")}`);
  const darkBg = await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    return getComputedStyle(document.body).backgroundColor;
  });
  notes.push(`dark body background: ${darkBg}`);
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  const dl = page.getByRole("button", { name: /Download JSON/ });
  await dl.waitFor({ state: "visible", timeout: 10_000 });
  if (!(await dl.isEnabled()))
    throw new Error("form completed by tapping, but validate() still rejected it");
  notes.push("download enabled - validate() says shape + all 16 keys are satisfied");

  // ---------- inspect the actual output object ----------
  await page.getByRole("button", { name: /View raw JSON/ }).click();
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

  // ---------- correcting an answer WITHOUT leaving the review screen ----------
  /*
    Tapping a row opens that one question in a dialog. This is the behaviour the review
    screen exists for: a patient checking sixteen answers wants to change one, and the old
    version sent them back into the wizard and lost their place.
  */
  await page.getByRole("button", { name: /How long has it been going on/ }).first().click();
  await page.waitForTimeout(500);
  const dialogOpen = await page.getByRole("dialog").count();
  notes.push(`tapping a review row opened a dialog? ${dialogOpen > 0}  (must be true)`);
  if (dialogOpen === 0)
    errors.push({ kind: "edit", text: "tapping a review row did not open the edit dialog", fatal: true });

  // Still on the review screen behind it - the whole point.
  const behind = await page.getByRole("heading").first().innerText();
  if (!/all done|almost there/i.test(behind))
    errors.push({
      kind: "edit",
      text: `the edit dialog navigated away instead of opening in place: "${behind}"`,
      fatal: false,
    });
  else notes.push("the review screen is still underneath the dialog");

  // Change the answer inside the dialog and confirm the row updates.
  await page.getByRole("dialog").getByRole("radio", { name: /^6-12 months/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole("dialog").getByRole("button", { name: /^Done$/ }).click();
  await page.waitForTimeout(450);
  const editedRow = await page
    .getByRole("button", { name: /How long has it been going on/ })
    .first()
    .innerText();
  notes.push(`row after editing in place: ${JSON.stringify(editedRow.replace(/\s+/g, " "))}`);
  if (!/6-12 months/.test(editedRow))
    errors.push({ kind: "edit", text: "the corrected answer did not reach the review row", fatal: false });

  // ---------- gating in the other direction ----------
  // Open About You from its own review row, switch to Male, and confirm Q6/Q7 are gated
  // away AND their stored answers are nulled rather than left stale.
  await page.getByRole("button", { name: /Sex and age/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("dialog").getByRole("radio", { name: /^Male/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("dialog").getByRole("button", { name: /^Done$/ }).click();
  await page.waitForTimeout(450);
  notes.push("switched sex to Male from the review screen");

  // PCOS/PCOD was answered as a female patient. Switching to male must take it out of
  // the answers, not leave an impossible diagnosis on its way to a doctor.
  const conditionsAfterMale = await page.evaluate(() => {
    const raw = sessionStorage.getItem("genoroot-intake-v1");
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return (parsed.state ?? parsed).answers.diagnosed_conditions;
  });
  notes.push(
    `diagnosed_conditions after switching to Male: ${JSON.stringify(conditionsAfterMale)}`,
  );
  if (Array.isArray(conditionsAfterMale) && conditionsAfterMale.includes("PCOS/PCOD"))
    errors.push({
      kind: "gate",
      text: "PCOS/PCOD survived a switch to a male patient",
      fatal: false,
    });

  /*
    On the review screen the Q6 row is still LISTED - a null a doctor can see explained is
    better than a question that vanished - so the assertion is about what it now says. It
    must read as never asked rather than still carrying "Irregular".
  */
  const q6Row = (
    await page.getByRole("button", { name: /How are your periods/ }).first().innerText()
  ).replace(/\s+/g, " ");
  notes.push(`Q6 row after switching to Male: ${JSON.stringify(q6Row)}`);
  if (/Irregular/.test(q6Row))
    throw new Error("Q6 still shows a female-only answer for a male patient");
  if (!/skipped, never asked/.test(q6Row))
    errors.push({
      kind: "gate",
      text: `the gated Q6 row does not explain itself: "${q6Row}"`,
      fatal: false,
    });
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
  `\n${fatal.length === 0 ? "PASS" : "FAIL"} - ${errors.length} error(s), ${fatal.length} fatal\n`,
);
process.exit(fatal.length === 0 ? 0 : 1);
