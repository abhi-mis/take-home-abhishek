# GenoRoot - Hair & Scalp Intake

A patient-facing web app that walks someone through the 16-question GenoRoot hair &
scalp intake and outputs the form **fully filled as structured data**.

Mobile-first, finishable with one thumb, no database, no auth, no admin panel.

**Two ways to answer, and the patient picks:**

| | |
| --- | --- |
| **Talk it through** (`/chat`) | A voice assistant asks all 16 questions, reads each one aloud, and fills the form from the reply. Speak, type, or tap back. |
| **Fill the form yourself** (`/intake`) | One question per screen, pictures where they help. Three of the sixteen also accept voice. |

Both write the same answers to the same store, so a patient can switch between them at
any question and lose nothing - the link is in the header of every screen.

> Deep dive into the logic and the reasoning behind each decision:
> **[Implementation.md](Implementation.md)**

---

## How to run

```bash
npm install
cp .env.example .env.local     # optional - see below
npm run dev                    # http://localhost:3000
```

**The app is fully usable with no API keys - both modes.** Every question can be
completed by tapping or typing, in the form and in the conversation, and you get a
valid, complete structured object at the end. Keys turn on three accelerators:

| Missing key | What degrades |
| --- | --- |
| `ANTHROPIC_API_KEY` | Free prose is not interpreted. Chips and typed exact answers still work, and table questions offer **"Ask me one at a time"**. |
| `SARVAM_API_KEY` | The microphone is hidden. Typing and tapping are unaffected. |

The assistant's voice needs **no key at all** - it speaks through the browser's own
`speechSynthesis` (see below).

```bash
npm test              # 158 deterministic tests, no key needed
npm run smoke         # real-browser walkthrough of the FORM (start a dev server first)
npm run smoke:chat    # real-browser walkthrough of the CONVERSATION, no keys needed
npm run eval          # live extraction eval against the fixtures (needs an LLM key)
npm run build         # production build
npm run typecheck
```

Both smokes need a server running. To keep them from fighting a dev server already open
in your editor over `.next/trace` on Windows, give them their own build dir:

```bash
NEXT_DIST_DIR=.next-smoke npx next dev -p 3130
node scripts/smoke-browser.mjs http://localhost:3130
node scripts/smoke-chat.mjs    http://localhost:3130
```

### Environment

| Variable | Where to get it | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Extraction |
| `ANTHROPIC_MODEL` | - | `claude-sonnet-5` (default); `claude-haiku-4-5-20251001` for lower latency and cost |
| `SARVAM_API_KEY` | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) | Speech to text |
| `SARVAM_MODEL` / `SARVAM_MODE` | - | `saaras:v3` / `codemix` |
| `EXTRACT_PROVIDER` | - | `anthropic` (default when its key is set) or `nvidia` |
| `NVIDIA_API_KEY` etc. | [build.nvidia.com](https://build.nvidia.com/settings/api-keys) | Optional alternative provider - free tier, no card |

**Provider selection** lives in one file, [lib/llm.ts](lib/llm.ts): explicit
`EXTRACT_PROVIDER` wins, else Anthropic if its key is present, else NVIDIA, else a 503
with a message telling the patient to tap instead. `callModel()` is the only thing the
route and the eval call, so neither knows which provider answered.

Keys are read **only inside server routes** (`app/api/*/route.ts`). Nothing is shipped
to the client and nothing is committed - `.env.example` is the only env file in git.

### Deploy

```bash
gh repo create genoroot-intake --private --source=. --push
# then: import to Vercel → set the env vars in the dashboard → deploy
```

---

## Model & service choices

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | Next.js (App Router) + TS on Vercel | one-command live link; API routes hide keys with no separate backend |
| STT | **Sarvam Saaras v3** | the locally-right pick. Patients here speak Hinglish and Indian-accented English, which is where western STT degrades first. `mode=codemix` returns mixed Hindi/English in Roman script - also the easiest thing for the extraction model to read. |
| Extraction | **Anthropic** - `claude-sonnet-5`, temp 0, **JSON prefill** | reading loose Hinglish prose into a fixed schema is exactly where a stronger model earns its keep, and the prompts here are tiny (one schema slice plus one reply). Prefilling the assistant turn with `{` makes the model *continue* a JSON object rather than start a message, which removes preambles and code fences by construction. **NVIDIA NIM is kept as an alternative provider** - it speaks the OpenAI wire format, so the `openai` SDK covers it and switching is a config change. The NIM model choice was **measured, not assumed** - see below. |
| Assistant voice | the **browser's** `speechSynthesis` | Anthropic has no text-to-speech endpoint, and adding a second vendor for one is not worth it here. This costs a more robotic voice and buys: no key, no network round trip, works offline, and no audio of a patient's medical answers is ever sent anywhere. The text is always on screen first, so speech is never the channel a question arrives through. |
| Validation | **Zod** + a coverage check | one validator for shape *and* the conditional-null rules |
| State | Zustand + sessionStorage | no server state. sessionStorage (not local) so an intake left open on a shared clinic phone isn't readable by the next patient. |
| Conversation | schema-driven, not scripted | `nextTurn()` scans the same `visibleSteps()` the wizard renders and asks the same `validateStep()` whether each is satisfied. There is no question list in chat mode, so the two modes cannot drift. |
| Tests | Vitest | deterministic units, plus a separate tolerant eval for the LLM |

**Contracts verified against live docs, not guessed** (Aug 2026): Sarvam is
`POST https://api.sarvam.ai/speech-to-text`, header `api-subscription-key`, multipart
`file`/`model`/`mode`, response `{ request_id, transcript, language_code }`. The intake
schema was downloaded from the URL in the brief and bundled verbatim.

### Picking the NIM model (measured, on this account)

The catalog moves fast, and the brief's suggested `meta/llama-3.1/3.3-70b-instruct` is
**gone** - it now returns `410 Gone`, and the whole Llama 3.x 70B *text*-instruct line
has been retired. `GET /v1/models` also over-reports: several listed IDs return
`404 Function not found` because they aren't enabled for a free account. So I probed
the survivors on a real fixture:

| Model | Latency | Result |
| --- | --- | --- |
| `meta/llama-3.3-70b-instruct` | - | **410 Gone** (retired) |
| `nvidia/llama-3.1-nemotron-70b-instruct` | - | 404, not enabled for this account |
| `openai/gpt-oss-120b` | **94-120 s** | correct, but unusable on a patient screen |
| `nvidia/nemotron-3-nano-30b-a3b` | 6.3 s | correct but verbose - truncated at 800 tokens |
| **`openai/gpt-oss-20b`** + `reasoning_effort: low` | **4.7 s** | correct, compact, bare JSON |

Two things fell out of that. The catalog is now mostly **reasoning** models, whose
default effort is fatal for a form (`gpt-oss-120b` at 94 s+). And extraction against a
fixed 8-field schema needs no deliberation, so `reasoning_effort: low` costs nothing in
accuracy and is the difference between a usable and an unusable step. Both live in
`chatParams()` (`lib/llm.ts`), shared by the route and the eval so a
benchmark can never run different settings than production.

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

## Two ways to answer

The landing page offers a genuine choice, not a primary and a fallback. Which one is
better is not a design opinion - it depends on the patient. Someone in a noisy reception
with one hand free wants to tap; someone who reads English slowly, or is holding a
toddler, wants to talk.

```
/chat                                          /intake
assistant asks + speaks                        one question per screen
patient speaks / types / taps                  taps, pictures on Q4
        \                                     /
         \_____ one Zustand store ___________/
                 one schema, one validateStep(), one Zod validator
```

**The conversation has no script.** `nextTurn()` ([lib/chatFlow.ts](lib/chatFlow.ts))
walks the same `visibleSteps(meta)` the wizard renders, asks the same `validateStep()`
whether each one is satisfied, and stops at the first that is not. So:

- a question added to `lib/schema.ts` appears in the conversation with no edit;
- the assistant's "that is everything" means exactly what the form's last **Next**
  means: `validateStep` passed;
- switching modes mid-intake carries every answer across, in either direction;
- conditional details come from [lib/followups.ts](lib/followups.ts), the same
  descriptors the grid uses. "Do you use Topical Minoxidil? **Yes**" is followed by
  *how long / did it help / any side effects* - asked, not revealed.

**How much of a reply reaches the model.** As little as possible.
`interpretLocally()` resolves a tapped chip, "yes", "no", "haan", a bare age, an option
repeated verbatim, and "none of these" with **no API call at all**. Free prose ("my mum
and my sister both lost hair") is what the model is for. Two things never reach it:

| | |
| --- | --- |
| **Consent** | a tap, or the patient's own typed yes/no. It is absent from `EXTRACT_KEYS`, so the route would refuse it even if the UI asked. |
| **A conditional detail** | "Did it help?" is not sent, because its slice covers the whole table and a bare "it helped a bit" carries no clue which row it belongs to. Those turns always have chips. |

**When one reply fills six fields, the assistant reads them back and asks.** Silence is
not consent. "No, let me redo it" clears that question and re-asks it one field at a
time - keeping a fill the patient just rejected would be worse than asking again.

**Speech is an enhancement, never a channel.** Every line is on screen as a bubble
*before* it is spoken, and the voice is the browser's own - so there is no key, no
round trip, and no audio of a patient's answers leaving the device. A browser that
refuses to speak without a user gesture turns into a "tap to hear the question" button
rather than a mystery.

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
`--use-file-for-fake-audio-capture`, through the live Sarvam and NVIDIA routes. "I smoke
about six a day... I had keratin at a salon last year" filled all six fields, mapped
"about six a day" to `Moderate 5-10/day`, and extracted `keratin` as the salon detail.

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

**Deterministic (`npm test`, 158 tests, no key) - the dependable gate.** The
conversation is tested by walking it: `tests/chatFlow.test.ts` answers whatever the
assistant asks, turn by turn, with no knowledge of the question list, then runs the
result through the same Zod validator the download button uses. One test
diffs `lib/schema.ts` against the schema as downloaded from the URL in the brief, so
"verbatim copy" is proven rather than claimed · step builder and
schema coverage · sex gating across all four states, including that switching away from
female *nulls* the gated answers · every conditional-followup rule in both directions ·
exclusive options · 16-key coverage with gated nulls counted as resolved · and the
highest-value group: the extraction layer fed what a 70B open model actually returns - markdown fences, prose wrappers, invented option strings, extra keys, followups with no
trigger, non-existent rows, arrays where objects belong. Each must end in a legal patch
or nothing at all.

**Tolerant (`npm run eval`, needs a key) - a measurement, not a gate.** 12 made-up
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
(`sample_type` became extractable when chat mode landed: a conversation has no grid to
fall back on, so a typed "saliva is fine" has to be understood.)

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
  page.tsx                  landing - the two ways to answer
  intake/page.tsx           wizard shell - switches on step.kind, has no question list
  chat/page.tsx             conversation shell - bubbles, speech, one reply -> store
  api/transcribe/route.ts   Sarvam proxy (key server-side)
  api/extract/route.ts      structured extraction + schema gate
components/
  StepShell.tsx  ProgressBar.tsx  ReviewScreen.tsx  ThemeToggle.tsx
  questions/     SingleChoice MultiChoice YesNo NumberStepper SexGate PatternPicker
                 Consent YesNoDescribe VoiceMatrix VoicePanel SpeakFirst ResultDialog
                 FollowUpFlow HabitsGrid TableGrid ScalpDiagram
  chat/          ChatBubble QuickReplies Composer
lib/
  schema.ts        source of truth (verbatim copy of the published schema)
  types.ts         Answers + enums, all derived from schema.ts
  steps.ts         schema -> ordered steps + gating + per-step validation
  followups.ts     conditional questions, as answerable descriptors
  chatFlow.ts      the conversation driver - pure, no React, no fetch, no store
  apply.ts         the write rules (shared by both modes)
  llm.ts           provider, model, one callModel() - the whole Anthropic/NIM difference
  speak.ts         browser speechSynthesis, with barge-in and a no-voice fallback
  store.ts         Zustand
  validate.ts      Zod + 16-key coverage
  extractPrompt.ts system prompt + per-question schema slices
  audio.ts         in-browser 16kHz mono WAV encoding
  copy.ts          all microcopy, in one place
fixtures/patients/ 12 transcripts (4 held out) + expected answers
tests/             158 deterministic tests (incl. a full walk of the conversation)
scripts/smoke-browser.mjs  Playwright walkthrough of the form
scripts/smoke-chat.mjs     Playwright walkthrough of the conversation, keyless
scripts/eval-fixtures.ts   live extraction eval
```
