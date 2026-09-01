/**
 * Voice, end to end, inside a section card - `node scripts/voice-e2e.mjs <baseURL> <wav>`
 *
 * The one path the tap-driven smoke cannot reach: press the mic, speak, and let Sarvam and
 * the model fill a table question sitting inside the accordion. The speech is a WAV fed to
 * Chromium's fake capture device, so this exercises the real recorder, the real
 * transcription request and the real extraction - nothing is stubbed.
 *
 * NOT a CI gate, for two honest reasons: it needs both API keys, and it needs an audio file
 * that would be a half-megabyte binary in the repo. Generate one on Windows with:
 *
 *   Add-Type -AssemblyName System.Speech
 *   $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
 *   $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,
 *     [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
 *     [System.Speech.AudioFormat.AudioChannel]::Mono)
 *   $s.SetOutputToWaveFile("habits.wav", $fmt); $s.Rate = -1
 *   $s.Speak("I smoke about ten a day. No alcohol. The water at home is hard. I wash my " +
 *            "hair on alternate days. I do not use a dryer or chemicals. I had keratin " +
 *            "at a salon last year.")
 *   $s.SetOutputToNull(); $s.Dispose()
 *
 * 16 kHz mono PCM is what the fake-capture flag expects. The recording window below is 17s
 * because a shorter one cuts the utterance mid-sentence: the app then correctly reports a
 * partial fill, which looks like a bug in the app and is a bug in the test.
 *
 * Last run: filled 6 of 6 from one sentence, including the layered follow-up
 * (salon_treatment_detail), and "about ten a day" mapped to "Moderate 5-10/day" - the
 * inclusive-bound rule surviving the whole pipeline as a spoken word rather than a digit.
 */
import { chromium } from "playwright";

const BASE = process.argv[2];
const WAV = process.argv[3];

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${WAV}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 820 },
  permissions: ["microphone"],
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/intake`, { waitUntil: "networkidle" });
await page.evaluate(() => sessionStorage.clear());
await page.reload();
await page.waitForTimeout(1200);

// Straight to Lifestyle, where the habits table lives.
await page.getByRole("radio", { name: /^Male/ }).click();
await page.getByRole("button", { name: /25-34/ }).click();
await page.waitForTimeout(400);
await page.evaluate(() => {
  const raw = sessionStorage.getItem("genoroot-intake-v2");
  const parsed = JSON.parse(raw);
  const st = parsed.state ?? parsed;
  st.currentSectionId = "C";
  st.openQuestionId = "habits";
  sessionStorage.setItem("genoroot-intake-v2", JSON.stringify(parsed));
});
await page.reload();
await page.waitForTimeout(1400);

const card = page.locator('main section[data-state="open"]');
console.log("open card:", (await card.innerText()).replace(/\s+/g, " ").slice(0, 60));

// The speak-first surface must be inside the card, not on its own screen.
const mic = card.getByRole("button", { name: /Answer by speaking|Done/ });
if ((await mic.count()) === 0) {
  console.log("FAIL: no mic button inside the open card");
  process.exit(1);
}
console.log("mic button is inside the card");

await mic.first().click();
console.log("recording...");
await page.waitForTimeout(17_000);
await card.getByRole("button", { name: /Done|Answer by speaking/ }).first().click();
console.log("stopped; waiting for transcription and extraction");

// The result dialog appears when the fill lands.
try {
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 90_000 });
} catch {
  const state = await card.innerText().catch(() => "(card gone)");
  console.log("no result dialog. card said:", state.replace(/\s+/g, " ").slice(0, 200));
  console.log("console errors:", errors.slice(0, 3));
  process.exit(1);
}
const dialog = (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ");
console.log("result dialog:", dialog.slice(0, 220));

const stored = await page.evaluate(() => {
  const raw = sessionStorage.getItem("genoroot-intake-v2");
  const st = JSON.parse(raw).state ?? JSON.parse(raw);
  return st.answers.habits;
});
console.log("habits recorded:", JSON.stringify(stored));
console.log("console errors:", errors.length === 0 ? "none" : errors.slice(0, 3));
await browser.close();
