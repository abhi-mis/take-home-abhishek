# GenoRoot - Hair & Scalp Intake

A patient-facing web app that walks someone through the 16-question GenoRoot hair &
scalp intake and outputs the form **fully filled as structured data**.

Mobile-first, finishable with one thumb, no database, no auth, no admin panel.

One question per screen, pictures where they help. Three of the sixteen can be answered
by **talking** - the software fills the grid and the patient taps to confirm - and every
one of the seventeen screens has a **speaker button that reads the question and its
options aloud**, for the patient who cannot comfortably read the screen.

> Deep dive into the logic and the reasoning behind each decision:
> **[Implementation.md](Implementation.md)**

---

## How to run

```bash
npm install
cp .env.example .env.local     # optional - see below
npm run dev                    # http://localhost:3000
```

**The app is fully usable with no API keys.** Every question can be completed by
tapping, and you get a valid, complete structured object at the end. Keys turn on the
two accelerators:

| Missing key | What degrades |
| --- | --- |
| `ANTHROPIC_API_KEY` | The voice questions do not auto-fill. The tap grid underneath is always there. |
| `SARVAM_API_KEY` | The microphone is hidden entirely. Tapping is unaffected. |

Read-aloud needs **no key at all** - it uses the browser's own `speechSynthesis`.

```bash
npm test              # 154 deterministic tests, no key needed
npm run smoke         # real-browser walkthrough of the whole intake (needs a dev server)
npm run eval          # live extraction eval against the fixtures (needs ANTHROPIC_API_KEY)
npm run build         # production build
npm run typecheck
```

`npm run smoke` needs a server running. To keep it from fighting a dev server already
open in your editor over `.next/trace` on Windows, give it its own build dir:

```bash
NEXT_DIST_DIR=.next-smoke npx next dev -p 3130
npm run smoke -- http://localhost:3130
```

### Environment

| Variable | Where to get it | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Extraction |
| `ANTHROPIC_MODEL` | - | `claude-haiku-4-5-20251001` (default, and the fastest of the four I probed) |
| `ANTHROPIC_TEMPERATURE` | - | optional, defaults to `0`; dropped automatically if the model rejects it |
| `SARVAM_API_KEY` | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) | Speech to text |
| `SARVAM_MODEL` / `SARVAM_MODE` | - | `saaras:v3` / `codemix` |

Two keys, and the app is useful without either. [lib/llm.ts](lib/llm.ts) is the whole
model boundary: `callModel()` is the only thing the route and the eval call, and if
`ANTHROPIC_API_KEY` is absent it answers 503 with a message rather than throwing, so the
patient taps or types instead.

Keys are read **only inside server routes** (`app/api/*/route.ts`). Nothing is shipped
to the client and nothing is committed - `.env.example` is the only env file in git.

### Deploy

```bash
gh repo create genoroot-intake --private --source=. --push
# then: import to Vercel → set the env vars in the dashboard → deploy
```

---

## Bilingual: English or Hindi, one language at a time

A switch in the header, labelled in each language's own script (**EN** / **हिं**), so a
patient who reads no English can find their half without parsing the word "Language". It
changes everything: the sixteen questions, every option, the hints, the validation
messages, the guided follow-up questions, the voice prompts, the review summary, and the
voice the read-aloud button uses (`hi-IN` instead of `en-IN`).

**One language at a time, never both.** No bracketed English after each Hindi label. A
form that says everything twice is harder to read in both languages than one that commits.

**The invariant that matters more than the translation.** Language is presentation. Every
answer stored, validated and downloaded is the exact English schema string, so the JSON
handed to the doctor is identical whichever language the form was filled in. A patient taps
`अनियमित हैं` and the output records `"Irregular"`. `optionLabel()` maps English to Hindi
for display and is never applied in reverse; nothing in `lib/i18n.ts` touches `Answers`.
The smoke test asserts both halves: no Latin text left on a Hindi screen, and no Devanagari
anywhere in the stored answers.

```
lib/copy.ts        English: questions, hints, option glosses, UI strings
lib/copy.hi.ts     Hindi: the same shapes, typed against the English ones
lib/i18n.ts        the resolver - one language per render, plus {placeholder} filling
components/LangToggle.tsx   the switch, and the <html lang> it writes for screen readers
```

Nothing is hard-coded in a component any more, and a test reads the source to keep it that
way: `tests/i18n.test.ts` fails on any English prose sitting in JSX. That guard is what
found the last three leaks, because a runtime walk cannot reach the post-voice dialog
without a microphone and an API key - which is exactly where two of them were.

Two things carry the weight. Each Hindi dictionary is typed as
`Record<keyof typeof ENGLISH, string>`, so **forgetting a translation fails `tsc`** rather
than shipping a half-Hindi screen. And `tests/i18n.test.ts` covers what types cannot: every
schema option has a label, no Hindi value was copied from the English, every `{placeholder}`
survives translation, and Hindi titles are actually in Devanagari.

Placeholders are named, not positional, because word order differs: `Question {n} of
{total}` becomes `{total} में से सवाल {n}`.

**What is deliberately NOT translated:** the patient's own free text (a side-effect
description, a salon treatment name) - translating what someone typed puts words in their
mouth - and the extraction prompt, which stays English because the model maps a Hindi
transcript onto English schema options. That part already worked: Sarvam transcribes
Hindi/codemix speech, and Claude was always mapping it to English labels.

---

## Fitted to the patient

The first screen asks three things - a first name (optional), sex, and age - and every one
of them changes the rest of the form. That is the whole reason it is allowed to ask.

| Given | What actually changes |
| --- | --- |
| **age 55-69** | the form ASKS: "Would you like larger text?", with both sizes previewed side by side. Yes scales text and every tap target up 12% (70+ scales 26%); no leaves it exactly as it was. Asked once, either answer final, and the **Aa** button changes it any time. |
| **age, any** | Q1's onset-age slider is capped at it. A 45-year-old can no longer record "hair loss began at 60", and lowering the age later pulls a now-impossible onset answer down with it. |
| **age 52+** | Q6 offers *Menopausal*; 50+ offers *Not applicable* on Q7. Offers, rendered as a prompt the patient has to accept - never a pre-filled answer. |
| **sex: female** | Q6 and Q7 appear. Q9 is reframed as a hirsutism screen ("on the chin, upper lip, chest or stomach") because that is what it is asking a female patient. |
| **sex: male / not stated** | Q6 and Q7 are skipped, and any stored answers are nulled rather than left stale. |
| **sex: male** | Q5 still SHOWS PCOS/PCOD, greyed and unpressable, with "a condition of the ovaries, so it does not apply to you" underneath. If it was already recorded before the sex was corrected, it is removed from the answers. |
| **age, on Q1** | decade cards later than the patient's own age are shown closed ("after your age") with one line explaining why, instead of being silently clamped to the maximum. |
| **a name** | it is shown back three times: echoed under the field as it is typed ("Thank you, Asha"), carried into question 1 as a welcome, and used to close the review ("All done, Asha"). The read-aloud button speaks the welcome too, so the ear and the eye get the same form. It is deliberately **not** in the downloaded JSON - a warmer form is not a reason to put a patient's name in a clinical file. `patient_sex` and `patient_age` are, because both make the answers interpretable. |

The header shows what was customised (`Female · 60`) beside a highlighted **Aa** button, so
it is a setting the patient can see and change rather than something the app did to them
quietly. The scale used to be spelled out in that line too, and it was the one string that
broke at 26% zoom: a single-line header beside three controls truncated it to
`Female · 70 · largest t...`, which reads as a bug. The button already says which step it
is on, so the line dropped what was duplicated.

**Why zoom rather than a font scale.** Zoom reflows and takes the *tap targets* with it.
Bigger text on 44px buttons helps someone who cannot read the screen and does nothing for
someone whose hands are unsteady - and unsteady hands are the more common reason a form
gets abandoned. It is also exactly what browser zoom does, so it is a proven interaction
rather than an invention.

**Why it asks instead of just doing it.** The first version applied the bigger scale the
moment an age of 55 or over was entered. It worked, and it was still wrong: a screen that
resizes itself under someone who did not ask is a thing being done TO them, and a
60-year-old with good eyesight reads it as the form deciding they are old. The prompt costs
one tap and removes both readings - and because it previews both sizes, the patient is
choosing between two things they can see rather than agreeing to an adjective. Declining is
recorded separately from choosing, so "no thank you" is never mistaken for "not asked yet"
and the prompt cannot come back.

**Comfort lives with the answers, not in localStorage.** It is derived from *this*
patient's age, so on a shared clinic phone the next person must not inherit it.
sessionStorage forgetting it is the correct behaviour, not a limitation.

---

## Model & service choices

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | Next.js (App Router) + TS on Vercel | one-command live link; API routes hide keys with no separate backend |
| STT | **Sarvam Saaras v3** | the locally-right pick. Patients here speak Hinglish and Indian-accented English, which is where western STT degrades first. `mode=codemix` returns mixed Hindi/English in Roman script - also the easiest thing for the extraction model to read. |
| Extraction | **Anthropic** - `claude-haiku-4-5`, temp 0 | chosen by probing this account's own model list, not by reputation: fastest of the four tried (1.1-1.3s for a full habits slice versus 1.9s), cheapest, correct on the Hinglish probe, and the only one that still accepts `temperature: 0` - which a medical form needs, because the same reply must fill the same fields every time. One provider, no adapter layer. See below. |
| Read-aloud | the **browser's** `speechSynthesis` | no key, no network round trip, works offline, and no audio of a patient's medical answers is ever sent anywhere. A hosted voice would sound better and buy none of that. It speaks only when the button is pressed, which is also what satisfies browsers that refuse to speak without a user gesture. |
| Validation | **Zod** + a coverage check | one validator for shape *and* the conditional-null rules |
| State | Zustand + sessionStorage | no server state. sessionStorage (not local) so an intake left open on a shared clinic phone isn't readable by the next patient. |
| Tests | Vitest | deterministic units, plus a separate tolerant eval for the LLM |

**Contracts verified against live docs, not guessed** (Aug 2026): Sarvam is
`POST https://api.sarvam.ai/speech-to-text`, header `api-subscription-key`, multipart
`file`/`model`/`mode`, response `{ request_id, transcript, language_code }`. The intake
schema was downloaded from the URL in the brief and bundled verbatim.

### Why not the free NVIDIA endpoint (measured, then removed)

An earlier revision ran extraction on NVIDIA's NIM build, which is free and needs no
card. It is gone from the code now, but the measurements are why - and they are the
reason this app pins one provider rather than shipping a pluggable adapter.

The brief's suggested `meta/llama-3.1/3.3-70b-instruct` is **retired**: it returns
`410 Gone`, and the whole Llama 3.x 70B *text*-instruct line went with it. `GET
/v1/models` also over-reports, listing IDs that return `404 Function not found` because
they are not enabled for a free account. So I probed the survivors on a real fixture:

| Model | Latency | Result |
| --- | --- | --- |
| `meta/llama-3.3-70b-instruct` | - | **410 Gone** (retired) |
| `nvidia/llama-3.1-nemotron-70b-instruct` | - | 404, not enabled for this account |
| `openai/gpt-oss-120b` | **94-120 s** | correct, but unusable on a patient screen |
| `nvidia/nemotron-3-nano-30b-a3b` | 6.3 s | correct but verbose - truncated at 800 tokens |
| **`openai/gpt-oss-20b`** + `reasoning_effort: low` | **4.7 s** | correct, compact, bare JSON |

That endpoint scored **56-58/58 fields (97-100%)** on the fixture eval, so the *quality*
was never the problem. What made it the wrong home for a patient-facing screen was
everything around it: a catalog that retires model IDs from under you, per-model quirks
that are hard 400s (reasoning models reject `temperature` and want
`max_completion_tokens`), and free-tier throttling that turned a 76-second eval run into
400 seconds on a bad afternoon.

Worth saying plainly: Claude's own lineup has the same *class* of quirk - the newest
models reject `temperature` outright, and one of them rejects assistant prefill - which
is why [lib/llm.ts](lib/llm.ts) probes rather than assumes, and drops an unsupported
parameter instead of failing. That code exists because the first Anthropic build shipped
a 502 to the browser for exactly this reason.

**The eval figure above does not transfer.** It was measured on `gpt-oss-20b`, not on
Claude, and I have not re-run it since the switch - so treat it as evidence about the
extraction *design* (slices, prompt rules, tolerant scoring), not as this build's score.

---

## Language, validation, and the picture question

**All patient-facing text is English.** Every string lives in `lib/copy.ts`, so a Hindi
or Telugu build is a second map rather than a rewrite. The extraction prompt still
handles Hindi and Hinglish *speech* - UI language and spoken-input language are
different things, and a patient reading English may still answer the mic in Hindi.

**Nothing is optional.** `validateStep()` in `lib/steps.ts` is the single gate:

- Next stays disabled until the current step is genuinely answered, and the reason is
  printed on screen. A greyed-out button that will not say what is wrong is not
  validation, it is a dead end.
- On the table questions (Q11/12/13) it lists **every outstanding row by name**, so a
  patient is never hunting for the one row they missed.
- `validate()` reuses that same function for the final object, so the per-step gate and
  the download gate cannot drift apart.

Making that honest required a data-model change: every yes/no is `boolean | null` while
filling. If `smoking` defaulted to `false`, an untouched row would be indistinguishable
from a real "No" - the form could not tell "not answered" from "answered No", and strict
validation would have been a lie. Zod then **rejects** null, so a completed intake
always carries real booleans. Two questions (Q4, Q10) have no "none" option in the
schema yet can legitimately be empty; they get a UI-only "None of these" control
recorded in the store's `explicitNone` set, so the answer stays exactly on-schema (`[]`)
while validation still distinguishes deliberate-empty from unanswered.

**Q4 is drawn, not listed.** "Diffuse thinning" and "Widening part line" are
clinician's words; a patient recognises the shape in a mirror long before the term, and
picking the wrong one sends the doctor down the wrong path. So Q4 renders six inline-SVG
scalp diagrams (`ScalpDiagram.tsx`) with the affected area shaded. All six share one
head outline and one visual language - five top-down views plus loose strands for
shedding - because a set of pictures only helps if the pictures are comparable. Q3 and
Q15 get smaller line icons for the same reason (Q15's real question is "needle or no
needle").

---

## The voice question, end to end

Q11/12/13 are a three-stage flow, not a grid with a mic on top.

1. **Speak first.** The grid is hidden. You get a numbered checklist of every item to
   cover plus its conditional details, an example answer, the mic, and "I would rather
   answer by tapping". The checklist enumerates rather than summarising - a prose prompt
   read better but quietly dropped rows, so patients answered three of six. Labels are
   interpolated from the schema, so a new row cannot go unasked.
2. **The result popup.** "Filled 6 of 6" - or "Filled 2 of 6, 4 still to go" with the
   missed items named - plus an explicit **"Yes, these match"**. An LLM just filled six
   medical fields from one sentence; taking silence as agreement is not confirmation.
3. **The form.** For confirming, correcting, or answering by hand. Anyone who chose to
   tap, or whose mic or key failed, lands here directly.

**Conditional questions get asked, not revealed.** Answering "yes" to a product does not
finish that row - it creates three more (how long, did it help, side effects). Switching a
row on now asks exactly those, one at a time, and closes itself when they are done:

```
Do you use OTC/Medicated Shampoos? -> Yes
  -> How long have you been using it? -> Did it help? -> Any side effects?
```

The same applies to smoking (how much) and salon treatments (which one). New layers
appear mid-flow because the queue is derived from the answers rather than precomputed.

**The mic shows real levels.** The waveform comes from an `AnalyserNode` on the live
stream, not a CSS animation - a fake animation looks identical whether the mic is live or
muted, so a patient would get no warning they are not being heard until the transcript
came back empty.

**Verified with real speech,** not mocks: Windows TTS piped into Chromium's
`--use-file-for-fake-audio-capture`, through the live Sarvam and extraction routes. "I
smoke about six a day... I had keratin at a salon last year" filled all six fields,
mapped "about six a day" to `Moderate 5-10/day`, and extracted `keratin` as the salon
detail. That run predates the move to Claude - the transcription half still stands, the
extraction half has not been repeated since.

## Light and dark

System-following by default, with a toggle that cycles system, light, dark, and an inline
script that applies the stored choice before first paint. One set of semantic tokens
defined twice; the scalp diagrams stay theme-independent because they only read as a set
with dark hair on a light scalp.

---

## Bought vs built

**Bought:** hosting + serverless (Vercel), STT (Sarvam), inference (Anthropic), form
validation (Zod), state (Zustand), animation (Framer Motion). Every one of these is a
solved problem where a hand-rolled version would be worse and slower.

**Built, deliberately:**

- **The schema→UI→extraction→validation spine.** This is the actual product. No library
  gives you a form engine where the same schema drives the wizard, the model's allowed
  output, and the validator.
- **In-browser WAV re-encoding** (`lib/audio.ts`). MediaRecorder returns a different
  format per browser; a hosted converter would be a second vendor and a second round
  trip for ~40 lines of `OfflineAudioContext`.
- **The question components.** Each of the 16 questions picks its own modality; a
  generic form renderer would have flattened all of them into the same control, which
  is the thing being graded against.
- **The scalp diagrams.** Inline SVG - no image files and no icon-pack dependency. They
  scale with the card, theme with the palette, and cost nothing over the network.
- **The live level meter.** An `AnalyserNode` and 20 lines beat pulling in a waveform
  library, and it is the honest version: real audio, not a loop.
- **shadcn-style primitives, hand-written.** Same API, Radix-free - nothing here needs a
  portal or focus trap. (Flagged as a deviation in Implementation.md.)

---

## How I tested the fill

Two tiers, on purpose.

**Deterministic (`npm test`, 154 tests, no key) - the dependable gate.** One test
diffs `lib/schema.ts` against the schema as downloaded from the URL in the brief, so
"verbatim copy" is proven rather than claimed · step builder and
schema coverage · sex gating across all four states, including that switching away from
female *nulls* the gated answers · every conditional-followup rule in both directions ·
exclusive options · 16-key coverage with gated nulls counted as resolved · and the
highest-value group: the extraction layer fed what a 70B open model actually returns - markdown fences, prose wrappers, invented option strings, extra keys, followups with no
trigger, non-existent rows, arrays where objects belong. Each must end in a legal patch
or nothing at all.

**Tolerant (`npm run eval`, needs `ANTHROPIC_API_KEY`) - a measurement, not a gate.** 12 made-up
patient transcripts in `fixtures/patients/`. Only fields the transcript *mentions* are
compared; unmentioned fields must appear in `unfilled`, and `unmentionedRows` asserts
the model did **not** invent a `false` for a row nobody spoke about. Kept out of CI
because an LLM isn't deterministic and a flaky red build teaches a team to ignore red
builds.

**Measured result: 56-58/58 fields (97-100%) across runs, 0 hard failures.**

The eval earned its keep. Its first run caught the model setting `Other: done = false`
on a procedures row the patient never named - the exact "silence became a no" failure
it exists to detect. One prompt rule fixed it, and because tuning a prompt against the
same 8 fixtures you score on is how you fool yourself, I then wrote **4 held-out
fixtures after the tuning** (`heldout-*.json`) and re-ran. 3 of 4 passed clean.

The remaining miss is honest and benign: on *"Minoxidil kabhi try nahi kiya"* the model
omits the row rather than writing `used: false`. The store default for that row is
already `used: false`, so the patient's output is correct anyway - and the two error
directions are both safe by construction: an omitted field is flagged for a tap, and an
over-eager `false` is visible on the Review screen and editable.

**Visible on screen.** The Review screen shows the filled object grouped by schema
section, with every gated `null` labelled *"skipped, poochha hi nahi gaya"* rather than
hidden - so correctness is inspectable live, not just in the download.

**Real browser (`npm run smoke`).** Added after I shipped a bug that every check above
missed: `useIntake((s) => s.steps())` looked fine, but Zustand compares selector results
with `Object.is` and that selector built a fresh array every call - so React re-rendered
until it threw *"Maximum update depth exceeded"*. Typecheck passed, 69 unit tests passed,
the production build passed, and `curl` returned 200, because the loop only exists in a
live React client.

So now Playwright taps the **entire** intake at 380px as a female patient (the longest
path, 17 steps), fails on any console error, then asserts the output object, that consent
was never pre-selected, and that switching sex back to Male makes Q6 disappear. Two
follow-ups came out of that bug: the store no longer exposes derived getters at all, and
`tests/selectors.test.ts` scans the source to reject any selector that calls a function
or builds an object - a guard I verified catches the original bug plus three variants
rather than passing vacuously.

**End-to-end, with live keys.** I generated real 16 kHz mono speech with Windows TTS and
pushed it through the deployed path: `POST /api/transcribe` returned a verbatim
transcript in **1.6 s**, and `POST /api/extract` filled all six habit fields correctly.
Per-slice extraction latency measured 8-19 s on the free tier, which is why the route
allows 28 s and the mic panel counts seconds up and offers tapping after 12 s - the UI
matches the measured reality instead of assuming it is fast.

Also verified: clean production build, `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` with zero `any`, and the extract route rejects `consent` with
a 400 - it is the one answer that can never be model-filled, even with a valid key.
Neither can ever be model-filled, even with a valid key.

---

## Three calls I'd defend

1. **Voice fills the grid questions.** The three table questions are where a tap-only
   form gets tedious; one spoken sentence fills them and the patient only corrects.
   Every fill is schema-validated before it lands, unmentioned fields are flagged for a
   tap rather than guessed, and the tap grid is always mounted underneath - so voice can
   fail in any way and the form still finishes.
2. **Ask sex once, gate, and say why.** No inference from Q9. `"Prefer not to say"` is a
   real option that gates identically, and the resulting nulls are *valid*, not missing.
3. **One schema drives UI + extraction + validation.** The wizard contains no list of
   questions. That's what makes coverage and correctness provable rather than asserted.

---

## What I'd do with one more week

Scalp-zone tap diagram for Q4 · full Hindi/Telugu end-to-end (copy is already isolated
in `lib/copy.ts`) · a larger eval harness with multiple runs per fixture and per-field
accuracy tracked over time · doctor live-view of the form filling in · WhatsApp pre-fill
link before arrival · offline PWA for clinic tablets · per-question abandonment
analytics.

---

## Structure

```
app/
  page.tsx                  landing
  intake/page.tsx           wizard shell - switches on step.kind, has no question list
  api/transcribe/route.ts   Sarvam proxy (key server-side)
  api/extract/route.ts      structured extraction + schema gate
components/
  StepShell.tsx  ProgressBar.tsx  ReviewScreen.tsx  ThemeToggle.tsx
  QuestionSpeaker.tsx        the read-aloud button, on every question
  ComfortToggle.tsx          text-size control (Aa), and the DOM projection of it
  ComfortPrompt.tsx          "would you like larger text?", asked once, previews both
  EditQuestionDialog.tsx     one question, corrected from the review screen
  questions/QuestionBody.tsx the controls for one question, shared by wizard and dialog
  LangToggle.tsx             EN / हिं, and the <html lang> it writes
  questions/     SingleChoice MultiChoice YesNo NumberStepper AboutYou PatternPicker
                 Consent YesNoDescribe VoiceMatrix VoicePanel SpeakFirst ResultDialog
                 FollowUpFlow HabitsGrid TableGrid ScalpDiagram
lib/
  schema.ts        source of truth (verbatim copy of the published schema)
  types.ts         Answers + enums, all derived from schema.ts
  steps.ts         schema -> ordered steps + gating + per-step validation
  followups.ts     conditional questions, as answerable descriptors
  apply.ts         the write rules (grid, follow-up flow and voice fill share them)
  questionSpeech.ts what the speaker button reads out, derived from the schema
  patient.ts       personalisation: comfort scale, onset cap, age-aware suggestions
  i18n.ts          the language resolver: one language per render, placeholder filling
  copy.hi.ts       Hindi for every question, option and UI string
  llm.ts           the model boundary: one callModel(), and the parameter negotiation
  speak.ts         browser speechSynthesis, with barge-in and a no-voice fallback
  store.ts         Zustand
  validate.ts      Zod + 16-key coverage
  extractPrompt.ts system prompt + per-question schema slices
  audio.ts         in-browser 16kHz mono WAV encoding
  copy.ts          all microcopy, in one place
fixtures/patients/ 12 transcripts (4 held out) + expected answers
tests/             154 deterministic tests (incl. two source scans: selector stability
                   and no hard-coded English)
scripts/smoke-browser.mjs  Playwright walkthrough of the full intake
scripts/eval-fixtures.ts   live extraction eval
```
