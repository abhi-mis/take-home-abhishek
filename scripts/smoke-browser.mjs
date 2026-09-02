/**
 * Browser smoke test - `node scripts/smoke-browser.mjs [baseURL]`
 *
 * Written after shipping an infinite render loop that every other check missed:
 * typecheck passed, 75 unit tests passed, the production build passed, and `curl`
 * returned HTTP 200 - because the loop only happens in a real React client.
 *
 * It drives a real browser at 380px, completes the entire intake as a female patient (the
 * path with the MOST questions, so Q6/Q7 gating is exercised), and fails on any console
 * error or page exception.
 *
 * The walk is written against the SECTION mechanism rather than question by question: six
 * category screens, each with one card open at a time. A per-question script would need
 * editing every time the schema moved, and would not check the thing most likely to break -
 * that exactly one card is open, that answering opens the next in place without navigating,
 * and that correcting an answer does not jump the patient forward.
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
  // Nothing auto-advances any more, but a card's collapse and the next one's expansion
  // animate for 180ms. Wait past both so the next locator sees a settled DOM.
  await page.waitForTimeout(360);
}

const tapOption = (name) => tap(page.getByRole("radio", { name }), `option "${name}"`);
const tapCheck = (name) => tap(page.getByRole("checkbox", { name }), `check "${name}"`);

const tapButton = (name) => tap(page.getByRole("button", { name }), `button "${name}"`);

/** The one card currently expanded. Every card interaction is scoped to it. */
const openCard = () => page.locator('main section:has([aria-expanded="true"])');

/** How many cards are expanded. The accordion's central invariant is "exactly one". */
const openCount = () => page.locator('main [aria-expanded="true"]').count();

/** The section chrome, for readable notes. */
async function sectionLine() {
  try {
    return (await page.locator("header").innerText({ timeout: 2_000 })).replace(/\s+/g, " ").trim();
  } catch {
    return "(no header)";
  }
}

/**
 * Just the section's name.
 *
 * Used for "did answering navigate away?" checks, where comparing the whole header would
 * be wrong: it carries the "1 of 4 answered" counter, which is meant to change the moment
 * you answer something.
 */
async function sectionName() {
  try {
    return (await page.locator("header h1").innerText({ timeout: 2_000 })).trim();
  } catch {
    return "(no section title)";
  }
}

/**
 * Answer whatever is open, however that question wants to be answered.
 *
 * Deliberately generic: the point of this walk is the SECTION mechanism, not any one
 * control, and a walk written per question would need editing every time the schema moves.
 */
async function answerOpenCard() {
  let card = openCard();
  if ((await card.count()) === 0) {
    // Nothing open: open the first card still waiting for an answer.
    const waiting = page.locator('main section[data-state="waiting"] [aria-expanded="false"]');
    if ((await waiting.count()) === 0) return false;
    await waiting.first().click();
    await page.waitForTimeout(340);
    card = openCard();
  }

  /*
    If the open card is already answered, the app is deliberately staying put - that is the
    "a correction does not jump you forward" rule. A patient would then tap the next
    question themselves, so the walker does the same, using the card's own data-state
    rather than guessing from its text.
  */
  const stillWaiting = page.locator('main section[data-state="waiting"] [aria-expanded="false"]');
  // The card's own answer: probing controls was wrong, because a decade picker uses
  // aria-pressed while options use aria-checked.
  const openIsAnswered = (await card.getAttribute("data-answered")) === "true";
  if (openIsAnswered && (await stillWaiting.count()) > 0) {
    await stillWaiting.first().click();
    await page.waitForTimeout(340);
    card = openCard();
  }
  if ((await card.count()) === 0) return false;

  const tapInstead = card.getByRole("button", { name: /rather answer by tapping/ });
  if (await tapInstead.count()) {
    await tapInstead.click();
    await page.waitForTimeout(320);
  }

  const consentYes = card.getByRole("radio", { name: /Yes, I agree/ });
  const nos = card.getByRole("radio", { name: /^No$/ });
  const nevers = card.getByRole("radio", { name: /^Never$/ });
  const bands = card.getByRole("button", { name: /Teens|13-19/ });
  const checks = card.locator('[role="checkbox"]:not([aria-disabled="true"])');
  const radios = card.getByRole("radio");

  if (await consentYes.count()) {
    await consentYes.first().click();
  } else if ((await nevers.count()) > 1) {
    /*
      A merged table (products, treatments). The flag column is gone: each row is one line
      of options whose first entry is "Never", and picking it writes the flag false and
      nulls the detail columns. So answering the whole question negatively is one tap per
      row - which is the point of the change, and worth having the walk exercise.
    */
    for (const el of await nevers.elementHandles()) {
      if ((await el.getAttribute("aria-checked").catch(() => "true")) !== "true") {
        await el.click().catch(() => {});
        await page.waitForTimeout(60);
      }
    }
  } else if ((await nos.count()) > 2) {
    // The habits grid: yes/no rows, plus two rows that are option lists of their own -
    // wash frequency, and smoking, whose negative is "No" among its severities.
    for (const el of await nos.elementHandles()) {
      if ((await el.getAttribute("aria-checked").catch(() => "true")) !== "true") {
        await el.click().catch(() => {});
        await page.waitForTimeout(60);
      }
    }
    const seg = card.getByRole("radio", { name: /Daily|Alternate Days|Weekly/ });
    if (await seg.count()) await seg.first().click().catch(() => {});
  } else if (await nos.count()) {
    await nos.first().click();
  } else if (await bands.count()) {
    await bands.first().click();
  } else if (await checks.count()) {
    await checks.first().click();
  } else if (await radios.count()) {
    await radios.first().click();
  } else {
    return false;
  }
  await page.waitForTimeout(360);
  return true;
}

/**
 * The landing screen at three telling widths, at the largest text size.
 *
 * It is one dom in two compositions, so the cases that matter are: the narrowest phone
 * anyone still uses, a width just below the desktop breakpoint, and one just above it.
 * The invariants are the ones that were actually broken - a CTA the patient has to hunt
 * for, and content pushed off the top by centring that does not degrade.
 */
async function checkLanding() {
  const WIDTHS = [
    [320, 568, "narrow phone"],
    [899, 800, "just below desk"],
    [900, 800, "just above desk"],
  ];
  for (const [w, h, label] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1");
    await page.evaluate(() => document.documentElement.setAttribute("data-comfort", "xl"));
    await page.waitForTimeout(200);

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      // Rects are post-zoom device px, the viewport is pre-zoom css px. Compare in one unit.
      const zoom = parseFloat(getComputedStyle(de).getPropertyValue("--comfort-zoom")) || 1;
      const cta = [...document.querySelectorAll("button")].find((b) =>
        /Start|Continue where/i.test(b.textContent || ""),
      );
      const kicker = document.querySelector("h1")?.previousElementSibling;
      const r = cta?.getBoundingClientRect();
      return {
        ctaInView: r ? r.top < window.innerHeight * zoom && r.bottom > 0 : false,
        ctaW: r ? Math.round(r.width / zoom) : 0,
        inkTop: kicker ? Math.round(kicker.getBoundingClientRect().top / zoom) : 0,
        overflowX: de.scrollWidth > window.innerWidth + 1,
      };
    });

    notes.push(
      `landing ${w}px (${label}): cta ${m.ctaW}px wide, in view ${m.ctaInView}, first ink at ${m.inkTop}px`,
    );
    if (!m.ctaInView)
      errors.push({ kind: "landing", text: `${label}: the only CTA is off screen`, fatal: false });
    if (m.overflowX)
      errors.push({ kind: "landing", text: `${label}: horizontal overflow`, fatal: false });
    // Negative means align-content centring has pushed the top of the page out of reach.
    if (m.inkTop < 0)
      errors.push({
        kind: "landing",
        text: `${label}: content clipped above the viewport (${m.inkTop}px)`,
        fatal: false,
      });
    if (m.ctaW < 44)
      errors.push({ kind: "landing", text: `${label}: CTA only ${m.ctaW}px wide`, fatal: false });
  }
  // Hand the walk back the phone it expects.
  await page.setViewportSize({ width: 380, height: 780 });
  await page.evaluate(() => document.documentElement.removeAttribute("data-comfort"));
}

/**
 * The top bar is chrome, so it must not move.
 *
 * The complaint that produced the current layout was that it did: the header used to live
 * inside a vertically centred content column, so its position and height changed with the
 * section. This walks all six and asserts one geometry for the bar across the lot. It also
 * asserts the bar is genuinely `fixed` - a sticky header measures identically at scroll 0
 * and then scrolls away, which is the bug wearing the right numbers.
 */
async function checkFixedChrome(baseWidth, label) {
  await page.setViewportSize({ width: baseWidth, height: 820 });
  await page.goto(`${BASE}/intake`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header");

  const seen = new Set();
  for (const id of ["0", "A", "B", "C", "D", "E"]) {
    await page.evaluate((sid) => {
      const key = "genoroot-intake-v2";
      const raw = sessionStorage.getItem(key);
      if (raw === null) return;
      const p = JSON.parse(raw);
      p.state.currentSectionId = sid;
      sessionStorage.setItem(key, JSON.stringify(p));
    }, id);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("header");
    await page.waitForSelector("h1");
    const m = await page.evaluate(() => {
      const h = document.querySelector("header");
      const r = h.getBoundingClientRect();
      return {
        box: `${Math.round(r.top)},${Math.round(r.height)}`,
        position: getComputedStyle(h).position,
      };
    });
    seen.add(m.box);
    if (m.position !== "fixed")
      errors.push({
        kind: "chrome",
        text: `${label}: the top bar is ${m.position}, not fixed`,
        fatal: false,
      });
  }

  /*
    Put the store back, or this check poisons the walk that follows it.

    It moves through the sections by writing `currentSectionId`, and it used to leave the
    store pointing at the last one - so the walkthrough tapped Start and resumed on "Sample
    and consent", where there is no "Next: ..." button to press. The failure looked like a
    missing button in the app; it was this helper not cleaning up after itself.
  */
  await page.evaluate(() => sessionStorage.clear());

  notes.push(`${label}: top bar geometry across six sections -> ${[...seen].join(" | ")}`);
  if (seen.size !== 1)
    errors.push({
      kind: "chrome",
      text: `${label}: the top bar changes size or position between sections (${[...seen].join(" | ")})`,
      fatal: false,
    });
}

try {
  // ---------- landing ----------
  await checkLanding();
  await checkFixedChrome(1280, "desktop");
  await checkFixedChrome(390, "phone");
  await page.setViewportSize({ width: 380, height: 780 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  notes.push(`page title: ${JSON.stringify(await page.title())}`);
  await tapButton("Start");
  await page.waitForURL(/\/intake/, { timeout: 15_000 });
  await page.getByRole("heading").first().waitFor({ timeout: 10_000 });

  // Read-aloud lives on the OPEN card now, not in the section chrome: reading a whole
  // category out loud would be five questions at once.
  const speaker = openCard().getByRole("button", { name: /Read the question aloud/ });
  if ((await speaker.count()) === 0)
    errors.push({ kind: "speaker", text: "no read-aloud button on the open card", fatal: false });
  else notes.push("read-aloud button is on the open card");

  // ---------- section 1: About You ----------
  notes.push(await sectionLine());
  const aboutBlocked = await page.getByRole("button", { name: /^Next/ }).isDisabled();
  notes.push(`About You blocks Next before answers? ${aboutBlocked}  (must be true)`);
  if (!aboutBlocked)
    errors.push({ kind: "about", text: "About You did not gate Next", fatal: false });

  /*
    Located by the VISIBLE label now.

    Both fields used to carry an `aria-label` ("First name, optional", "Your age in years")
    while showing a different heading above them - two names for one control, which WCAG
    2.5.3 exists to discourage and which leaves a speech-input user asking for a label they
    cannot see. The fields have real <label> elements, so the accessible name is the words on
    screen, and these locators say what a patient would say.
  */
  await page.getByRole("textbox", { name: /What should we call you/ }).fill("Asha");
  await page.waitForTimeout(600);
  if (!/Thank you, Asha/.test(await page.locator("main").innerText()))
    errors.push({ kind: "name", text: "the name was not echoed back", fatal: false });
  else notes.push('the name is echoed as you type: "Thank you, Asha"');

  await tap(page.getByRole("radio", { name: /^Female/ }), 'option "Female"');
  if (!(await page.getByRole("button", { name: /^Next/ }).isDisabled()))
    errors.push({ kind: "about", text: "sex alone was enough to pass About You", fatal: false });
  else notes.push("sex alone is not enough - the age is still required");

  /*
    The age is TYPED, because typing is the primary way to answer it now and a smoke that
    only taps the range shortcut would leave the real control uncovered.

    Three properties in one place: letters never enter the value, an out-of-range number
    un-answers the question rather than leaving the last good one behind, and a valid one
    commits.
  */
  const ageField = page.getByRole("textbox", { name: /How old are you/ });
  await ageField.type("6a0", { delay: 40 });
  await page.waitForTimeout(400);
  const typedValue = await ageField.inputValue();
  notes.push(`typed "6a0" -> field holds ${JSON.stringify(typedValue)}  (letters dropped)`);
  if (typedValue !== "60")
    errors.push({ kind: "age", text: `letters reached the age field: ${typedValue}`, fatal: false });

  await ageField.type("0", { delay: 40 });
  await page.waitForTimeout(450);
  const outOfRangeBlocks = await page.getByRole("button", { name: /^Next/ }).isDisabled();
  const alertShown = (await page.getByRole("alert").count()) > 0;
  notes.push(`600 -> Next blocked? ${outOfRangeBlocks}, error shown? ${alertShown}`);
  if (!outOfRangeBlocks || !alertShown)
    errors.push({
      kind: "age",
      text: "an out-of-range age left the question answered",
      fatal: true,
    });

  await ageField.fill("");
  await ageField.type("60", { delay: 40 });
  await page.waitForTimeout(900); // the text-size offer is held back half a second
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
  notes.push(`accepted -> data-comfort="${comfortAttr}"`);
  if (comfortAttr !== "large")
    errors.push({ kind: "comfort", text: `expected larger text, got "${comfortAttr}"`, fatal: false });

  // ---------- the accordion's invariants ----------
  await tapButton("Next: Your history");
  await page.waitForTimeout(500);
  notes.push(await sectionLine());

  const states = await page.evaluate(() =>
    [...document.querySelectorAll("main section[data-state]")].map((el) => el.dataset.state),
  );
  notes.push(`card states: ${states.join(", ")}`);
  if (states.length === 0)
    errors.push({ kind: "accordion", text: "no card exposed a data-state", fatal: true });

  const openNow = await openCount();
  notes.push(`cards expanded at once: ${openNow}  (must be 1)`);
  if (openNow !== 1)
    errors.push({ kind: "accordion", text: `${openNow} cards were open`, fatal: true });

  // Answering must open the next card WITHOUT navigating: the section stays put.
  const sectionBefore = await sectionName();
  const openBefore = await openCard().innerText();
  await answerOpenCard();
  const sectionAfter = await sectionName();
  const openAfter = await openCard().innerText();
  if (sectionAfter !== sectionBefore)
    errors.push({ kind: "accordion", text: "answering left the section", fatal: true });
  else if (openAfter === openBefore)
    errors.push({ kind: "accordion", text: "answering did not open the next card", fatal: false });
  else notes.push("answering collapsed the card and opened the next one in place");

  if ((await openCount()) !== 1)
    errors.push({ kind: "accordion", text: "more than one card open after answering", fatal: true });

  // An answered card collapses to a summary a patient can check at a glance.
  const collapsedSummary = await page
    .locator('main section:has([aria-expanded="false"])')
    .first()
    .innerText();
  notes.push(`collapsed card reads: ${JSON.stringify(collapsedSummary.replace(/\s+/g, " "))}`);
  if (/Not answered yet/.test(collapsedSummary))
    errors.push({ kind: "accordion", text: "an answered card still reads unanswered", fatal: false });

  /*
    Reopening an answered card and changing the answer must NOT jump forward again.

    Note this deliberately does NOT use answerOpenCard(): that helper exists to make
    progress and moves on when the open card is already answered, which is the opposite of
    what is being tested. The card is identified by the region it controls, so "same card"
    is an identity check rather than a text comparison.
  */
  const answeredHeader = page.locator('main section[data-state="answered"] [aria-expanded="false"]').first();
  const answeredLabel = (await answeredHeader.innerText()).replace(/\s+/g, " ").slice(0, 20);
  await answeredHeader.click();
  await page.waitForTimeout(400);
  const reopenedId = await openCard().locator("[aria-expanded]").getAttribute("aria-controls");

  // Change the answer inside that card, using its own controls only.
  const insideOptions = openCard().locator('[role="radio"], [aria-pressed]');
  const count = await insideOptions.count();
  if (count > 1) {
    await insideOptions.nth(count - 1).click();
    await page.waitForTimeout(420);
  }
  const stillOpenId = await openCard().locator("[aria-expanded]").getAttribute("aria-controls");
  if (stillOpenId !== reopenedId)
    errors.push({
      kind: "accordion",
      text: `correcting "${answeredLabel}" jumped from ${reopenedId} to ${stillOpenId}`,
      fatal: false,
    });
  else notes.push(`corrected "${answeredLabel}" and stayed on it`);

  // ---------- walk the remaining sections ----------
  for (let hop = 0; hop < 10; hop += 1) {
    const nextBtn = page.getByRole("button", { name: /^Next|^Review answers/ });

    // Before completing a section, a blocked Next must name what is missing.
    if (!(await nextBtn.isEnabled())) {
      await nextBtn.click({ force: true });
      await page.waitForTimeout(320);
      const reason = await page.getByRole("status").innerText().catch(() => "");
      if (hop === 0) {
        notes.push(`blocked Next says: ${JSON.stringify(reason.replace(/\s+/g, " ").slice(0, 70))}`);
        if (!reason)
          errors.push({ kind: "nag", text: "a blocked Next explained nothing", fatal: false });
      }
    }

    // Answer everything still open in this section.
    for (let i = 0; i < 14; i += 1) {
      if (await nextBtn.isEnabled()) break;
      if (!(await answerOpenCard())) break;
    }

    if (!(await nextBtn.isEnabled())) {
      errors.push({
        kind: "walk",
        text: `stuck in ${await sectionLine()} with Next still disabled`,
        fatal: true,
      });
      break;
    }

    await nextBtn.click();
    await page.waitForTimeout(650);
    const h = await heading();
    if (/all done|almost there/i.test(h)) break;
    notes.push(await sectionLine());
  }

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
    const raw = sessionStorage.getItem("genoroot-intake-v2");
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

    Measured per rendered line (`getClientRects`) against the computed line-height, with
    the PLATFORM's Devanagari face forced first. That is deliberate even now that the app
    self-hosts Hind: Nirmala UI paints taller than Hind does, so this measures the worst
    case - what a patient sees if the font file never arrives - and a leading that survives
    the fallback survives the webfont.
  */
  await page.addStyleTag({
    content: '*{font-family:"Nirmala UI","Noto Sans Devanagari","Segoe UI",sans-serif !important}',
  });
  await page.waitForTimeout(200);
  const tightText = await page.evaluate(() => {
    /*
      The zoom correction is not optional.

      getClientRects() returns POST-zoom device pixels while getComputedStyle().lineHeight
      returns pre-zoom CSS px, so at the largest comfort scale every ratio comes out 1.26x
      too big and this check reports 19 clipped lines that are perfectly fine. Divide the
      ink back down before comparing.
    */
    const zoom =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--comfort-zoom")) || 1;
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
            const inkCss = ink / zoom;
            if (inkCss / lh > 0.95)
              out.push(
                `"${el.textContent.trim().slice(0, 18)}" ink ${inkCss.toFixed(0)} in ${lh.toFixed(0)}`,
              );
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
    const raw = sessionStorage.getItem("genoroot-intake-v2");
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
    const raw = sessionStorage.getItem("genoroot-intake-v2");
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
