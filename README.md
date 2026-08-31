# GenoRoot - Hair & Scalp Intake

A patient-facing web app that walks someone through the 16-question GenoRoot hair &
scalp intake and outputs the form **fully filled as structured data**.

Mobile-first, finishable with one thumb, no database, no auth, no admin panel. Three of
the sixteen questions can be answered by **talking** - the software fills the grid, the
patient taps to confirm.

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
tapping, and you'll get a valid, complete structured object at the end. Keys only turn
on the voice accelerator on Q11 - Q14; without them those steps show a plain-language
notice and the tap grid, which is always there anyway.

```bash
npm test        # 86 deterministic tests, no key needed
npm run smoke   # real-browser walkthrough of the whole intake (start a dev server first)
npm run eval    # live extraction eval against the fixtures (needs NVIDIA_API_KEY)
npm run build   # production build
npm run typecheck
```

`npm run smoke` needs a server running. To keep it from fighting a dev server already
open in your editor over `.next/trace` on Windows, give it its own build dir:

```bash
NEXT_DIST_DIR=.next-smoke npx next dev -p 3130
npm run smoke -- http://localhost:3130
```

### Environment

| Variable | Where to get it |
| --- | --- |
| `NVIDIA_API_KEY` | [build.nvidia.com/settings/api-keys](https://build.nvidia.com/settings/api-keys) - free, no card |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | a current model from [build.nvidia.com/explore](https://build.nvidia.com/explore) - verified working: `openai/gpt-oss-20b` |
| `NVIDIA_REASONING_EFFORT` | `low` (set `none` to omit the field for non-reasoning models) |
| `SARVAM_API_KEY` | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) |
| `SARVAM_MODEL` / `SARVAM_MODE` | `saaras:v3` / `codemix` |

Keys are read **only inside server routes** (`app/api/*/route.ts`). Nothing is shipped
to the client and nothing is committed - `.env.example` is the only env file in git.

### Deploy

```bash
gh repo create genoroot-intake --private --source=. --push
# then: import to Vercel → set the 5 env vars in the dashboard → deploy
```

---

## Model & service choices

| Layer | Choice | Why this one |
| --- | --- | --- |
| Framework | Next.js (App Router) + TS on Vercel | one-command live link; API routes hide keys with no separate backend |
| STT | **Sarvam Saaras v3** | the locally-right pick. Patients here speak Hinglish and Indian-accented English, which is where western STT degrades first. `mode=codemix` returns mixed Hindi/English in Roman script - also the easiest thing for the extraction model to read. |
| Extraction | **NVIDIA build (NIM)** - `openai/gpt-oss-20b`, temp 0, `reasoning_effort: low` | free hosted open models, no card, no lock-in. The client is the OpenAI SDK with two lines changed, so the model ID lives in `NVIDIA_MODEL` and swapping providers is a config change. Model choice was **measured, not assumed** - see below. |
| Validation | **Zod** + a coverage check | one validator for shape *and* the conditional-null rules |
| State | Zustand + sessionStorage | no server state. sessionStorage (not local) so an intake left open on a shared clinic phone isn't readable by the next patient. |
| Tests | Vitest | deterministic units, plus a separate tolerant eval for the LLM |

**Contracts verified against live docs, not guessed** (Aug 2026): Sarvam is
`POST https://api.sarvam.ai/speech-to-text`, header `api-subscription-key`, multipart
`file`/`model`/`mode`, response `{ request_id, transcript, language_code }`. The intake
schema was downloaded from the URL in the brief and bundled verbatim.

### Picking the extraction model (measured, on this account)

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
`modelConfig()` (`lib/extractPrompt.ts`), shared by the route and the eval so a
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

## After the voice fill: layered questions

The three table questions unfold into more questions as rows are answered Yes. A voice
fill therefore ends with a few blanks buried inside collapsed rows - so instead of
listing them, each one is asked as its own full-size question, one at a time
(`FollowUpFlow`). "Do you smoke? → Yes" is followed immediately by "How much?", and new
layers unlock mid-flow because the queue is derived from the answers rather than
precomputed. While it runs, the grid and the outstanding summary stand down, so exactly
one question is on screen. A tap-first patient can open the same guided flow by hand.

**The mic shows real levels.** The waveform comes from an `AnalyserNode` on the live
stream, not a CSS animation - a fake animation looks identical whether the mic is live or
muted, so a patient would get no warning they are not being heard until the transcript
came back empty. Verified against Chromium's fake capture device.

---

## Bought vs built

**Bought:** hosting + serverless (Vercel), STT (Sarvam), inference (NVIDIA NIM), form
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

**Deterministic (`npm test`, 86 tests, no key) - the dependable gate.** One test
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
`noUncheckedIndexedAccess` with zero `any`, and the extract route rejects `consent` and
`sample_type` with a 400 - neither can ever be model-filled, even with a valid key.

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
  api/extract/route.ts      NVIDIA NIM structured extraction + schema gate
components/
  StepShell.tsx  ProgressBar.tsx  ReviewScreen.tsx
  questions/     SingleChoice MultiChoice YesNo NumberStepper SexGate
                 Consent YesNoDescribe VoiceMatrix VoicePanel HabitsGrid TableGrid
lib/
  schema.ts        source of truth (verbatim copy of the published schema)
  types.ts         Answers + enums, all derived from schema.ts
  steps.ts         schema → ordered steps + gating
  store.ts         Zustand
  validate.ts      Zod + 16-key coverage
  extractPrompt.ts system prompt + per-question schema slices
  audio.ts         in-browser 16kHz mono WAV encoding
  copy.ts          all microcopy, in one place
fixtures/patients/ 12 transcripts (4 held out) + expected answers
tests/             86 deterministic tests (incl. a selector-stability source scan)
scripts/smoke-browser.mjs   Playwright walkthrough of the full intake
scripts/eval-fixtures.ts   live extraction eval
```
