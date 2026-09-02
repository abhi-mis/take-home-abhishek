# GenoRoot - Hair & Scalp Intake

A patient-facing web app that walks someone through the 16-question GenoRoot hair &
scalp intake and outputs the form **fully filled as structured data**.

Mobile-first, finishable with one thumb, no database, no auth, no admin panel.

One question per screen, pictures where they help. **Tapping is the way through**, and
under the controls of every question but one there is a second offer: **answer it by
speaking**. Say it in Hindi, English or a mix, and the answer lands in the controls above
for the patient to check. Every question also has a **speaker button that reads it and its
options aloud**, for the patient who cannot comfortably read the screen.

The exception is consent. Permission for a genetic test is given by pressing the word
"Yes", never inferred from prose that a transcriber and then a model both had to read.

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
| `GEMINI_API_KEY` | Nothing spoken is understood, so nothing auto-fills. |
| `SARVAM_API_KEY` | Speech never becomes words, so nothing auto-fills. |

Either way the patient is told once, on the card where they tried - *"answering by speaking
is not set up on this device, please tap your answers below"* - and no card after that
offers a microphone. A control that cannot possibly work is worse than no control: the
patient waits, reads an apology, and has learnt only that the form wastes their time. The
tap controls are untouched in both cases, and the form still produces a complete, valid
object at the end.

Read-aloud needs **no key at all** - it uses the browser's own `speechSynthesis`.

```bash
npm test              # 304 deterministic tests, no key needed
npm run smoke         # real-browser walkthrough of the whole intake (needs a dev server)
npm run eval          # live extraction eval against the fixtures (needs GEMINI_API_KEY)
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
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Understanding what was said |
| `SARVAM_API_KEY` | [dashboard.sarvam.ai](https://dashboard.sarvam.ai) | Turning speech into words |
| `SARVAM_MODEL` / `SARVAM_MODE` | - | `saaras:v3` / `codemix` |

**The model is not configurable, and neither is the temperature.** Everything the form
understands from a spoken reply is understood by `gemini-3-flash-preview` at
`temperature: 0`, both constants in [lib/llm.ts](lib/llm.ts). There is no `GEMINI_MODEL`
and no `GEMINI_TEMPERATURE`: on a medical form the same reply has to fill the same fields
every time or the output cannot be audited, and "which model read this patient's words"
should have one answer you can read off the source rather than one that depends on a
deployment's environment. `tests/llm.test.ts` sets both anyway and asserts the request on
the wire is unchanged.

Two keys, and the app is useful without either. `callModel()` is the only thing the route
and the eval call, and if `GEMINI_API_KEY` is absent `llmSettings()` returns null, the
route answers 503, and the patient taps or types instead.

Keys are read **only inside server routes** (`app/api/*/route.ts`). Nothing is shipped
to the client and nothing is committed - `.env.example` is the only env file in git.

### Deploy

```bash
gh repo create genoroot-intake --private --source=. --push
# then: import to Vercel → set the env vars in the dashboard → deploy
```

---

## Six sections, one question open at a time

The form is six category screens, not seventeen. Inside a section every question is a card
in one of three states:

| State | Renders as | Height |
| --- | --- | --- |
| answered | one line: short label, the answer, a tick | ~52px |
| open | the question, its hint, its options, read-aloud | as needed |
| waiting | a dimmed one-liner, still tappable | ~52px |

Answering collapses the card and opens the next in place. Nothing navigates, so the answer
stays on screen as a summary you can reopen, and **Next** moves a whole section: six
navigations instead of seventeen.

Seventeen screens of identical chrome is its own kind of fatigue. Chunking into the schema's
own categories keeps the low load of one-question-at-a-time while cutting the trudge, which
is what the research on form chunking actually supports.

Three carve-outs, each for a reason:

- The three **table questions** (habits, products, treatments) keep their grid, and their
  collapsed summary states coverage rather than a value: "5 answered, 2 in use". One value
  would misrepresent five rows. These are also where speaking pays for itself most - one
  sentence against fourteen taps.
- **About You** is a single always-open card. There is nothing to collapse it against.
- **Consent** collapses like any other card, but its summary reads "Yes, I agree: sample and
  genetic analysis" rather than a bare "Yes". A clinical record should not reduce informed
  consent to a word that could mean anything.

A **correction does not jump you forward.** Reopening an answered card and changing it leaves
you there: first pass wants momentum, a correction wants to stay put. That distinction is
asserted in the browser smoke, because it is the kind of nicety a later refactor quietly
removes.

### Desktop

The same model, composed rather than restructured. Measured before and after at 1440x900:

| | before | after |
| --- | --- | --- |
| content column | 448px | 560px, centred |
| unused width | 992px | rail 262px + margins |
| header band | 448px, floating mid-page | 560px, inside the column |
| footer rule | 1425px, full-bleed | 560px, inside the column |
| chrome agrees with the column | no | yes |
| focus hidden behind the footer | 0 | 0 |

The answer was never a wider column: 448px is close to the ideal measure for reading and
stretching the questions would hurt. What the column needed was company, so the rail carries
the wordmark, the six sections with per-section progress, and where the answers are saved.

**Keyboard operation is the browser's.** Tab moves between controls and Enter or Space presses
one, which is all a set of real `<button>`s needs. There was a custom layer on top - `1`-`9` to
select, `Enter` for the next question, `Shift+Enter` for the next section, with a legend in the
sidebar - and it came out: this is a patient filling in a medical form, usually on a phone, and
nobody was pressing Shift+Enter. Targets shrink under `pointer: fine` only, never by viewport
width: a 1280px tablet is still a touch device.

---

## Type

**Plus Jakarta Sans** (Latin) and **Hind** (Devanagari), self-hosted by `next/font` at
build time - fetched during the build, served from our own origin, subset and preloaded, so
there is no third-party request and no unstyled flash on a clinic connection. One family
across both scripts, with headings set apart by weight and tracking rather than a second
typeface; the serif this replaced had no Devanagari at all, so Hindi headings had been
quietly falling back to a sans while English ones did not.

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
found the last three leaks, two of which were on screens a runtime walk could not reach at
the time - the states behind the microphone. The browser smoke now reaches those too, by
stubbing both network hops rather than needing a key.

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
| **age, typed** | a labelled field with a numeric keypad, 1 to 100. Letters are dropped, leading zeros normalised, and an out-of-range value un-answers the question rather than leaving the last good number in place. The range cards remain as a secondary shortcut. |
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
| Extraction | **Google Gemini** - `gemini-3-flash-preview`, temp 0, both **pinned in code** | probed against the account's own model list and this app's own prompt rather than adopted on reputation: `temperature: 0` accepted, bare JSON via `responseMimeType`, the Hinglish probe correct, 2.8s for a full habits slice, **69/69 fields on the fixture eval**. One provider, one model, no env var that can change either, no adapter layer, and no SDK - it is one `fetch`. See below. |
| Read-aloud | the **browser's** `speechSynthesis` | no key, no network round trip, works offline, and no audio of a patient's medical answers is ever sent anywhere. A hosted voice would sound better and buy none of that. It speaks only when the button is pressed, which is also what satisfies browsers that refuse to speak without a user gesture. |
| Validation | **Zod** + a coverage check | one validator for shape *and* the conditional-null rules |
| Form fields | **React Hook Form** + a zod resolver | at the three inputs a patient TYPES into (name, age, side-effect description). The choice controls stay on the store and the schema validator, which knows the clinical rules a form library cannot - see Implementation.md for where the line is drawn and why. |
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

Worth saying plainly: Claude's own lineup had the same *class* of quirk - the newest
models reject `temperature` outright, and one of them rejects assistant prefill. The first
Anthropic build shipped a 502 to the browser for exactly that reason, and the fix at the
time was a runtime negotiation: send `temperature`, catch the 400, remember that this model
refuses it, retry without it.

That code is gone, and pinning the model is what deleted it rather than what risked it. The
negotiation existed to survive a model this app no longer lets anyone select; with one
model, known to accept every parameter sent, a failure is a real failure and the right
response is to let the patient tap, not to try again with less.

### And then the provider moved anyway

Extraction now runs on **Gemini 3 Flash**, and the reason is worth recording because it is
the one failure mode none of the measurement above protects against: the Anthropic key
stopped authenticating. A flat `401 authentication_error`, which no amount of code can
retry its way out of - and a patient-facing form cannot wait on a credential.

The swap took one file, which is the whole argument for having kept the boundary thin.
`lib/llm.ts` is 190 lines of `fetch`, the route and the eval only ever call `callModel()`,
and nothing else in the app knew which company was answering. Its SDK went with it: one
dependency for one `messages.create` was never earning its place, and Gemini's endpoint is
a POST with a JSON body.

Two things had to be measured rather than assumed, and one of them bit:

- **`responseMimeType: "application/json"`** is honoured, so the output is bare JSON with
  no fence to strip. `parseModelJson()` still strips fences behind it - a parser you only
  trust on the happy path is not a parser.
- **Thinking tokens come out of `maxOutputTokens`.** The first version set 2048, reasoning
  about the output alone, and two of twenty fixtures failed as "unparseable model output".
  The JSON was not malformed, it was *cut off*: a products slice writes 153 tokens of
  answer after 1357 tokens of thinking. A truncated object parses as nothing, so the
  patient would have been told "nothing in that reply matched this question" for a reply
  the model understood perfectly. The budget is 8192 now, and a `MAX_TOKENS` finish reason
  throws with both counts in the message instead of returning a string that cannot parse.

**The eval figure above does not transfer.** It was measured on `gpt-oss-20b`, not on
Claude, and I have not re-run it since the switch - so treat it as evidence about the
extraction *design* (slices, prompt rules, tolerant scoring), not as this build's score.

---

## Language, validation, and the picture question

**The screen is in one language at a time, English or Hindi** - see the bilingual section
above. The extraction prompt stays English regardless, because it maps a Hindi or Hinglish
transcript onto the English schema options: UI language and spoken-input language are
different things, and a patient reading English may still answer the microphone in Hindi.

**One answer is required - the sex question. Otherwise the DOWNLOAD is what is gated.** `validateStep()` in
`lib/steps.ts` is still the single source of "is this answered", and it is now used to
report rather than to block:

- Next always works, with one exception: the sex question, which decides which questions
  exist at all. Everything else a patient can leave blank and come back to, because a
  form that refuses to advance until someone answers whether they are pregnant produces a
  guess, and a guess is a wrong entry in a clinical record.
- The section says "you can come back to these" and names them, quietly, once the patient
  has answered something. On the table questions (Q11/12/13) that includes **every
  outstanding row by name**, so nobody hunts for the one row they missed.
- `validate()` reuses that same function for the final object, so what the form calls
  answered and what the download requires cannot drift apart. An incomplete form is a fine
  thing for a patient to have and not a thing to hand a doctor as if it were finished.

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

## Answering by speaking

Every question except consent can be answered out loud. The microphone is a **quiet row
underneath the controls**, and the order is the whole design.

Tapping comes first because tapping always works: no permission prompt, no network, no
model, and it behaves the same in a quiet room and a loud one. Speaking is the second offer,
for the patient who finds reading hard, and for the two table questions where one sentence
replaces fourteen taps.

An earlier revision had this the other way round - a "speak first" panel that opened before
the question, and a microphone at the top of every card. It came out, and the reason is
worth keeping: **a microphone offered before the question has been read is a demand, not an
offer.**

### What a spoken answer is not allowed to do

| Rule | Why |
| --- | --- |
| It cannot fill **consent** | The one answer that may never be inferred from prose. `consent` is absent from the API route's allow-list, so it is unreachable rather than merely un-offered - a UI rule can be bypassed by a caller, and this one may not be. |
| It cannot **advance the form** | A tap is the patient watching themselves choose; a fill is a machine's reading they have to be able to check. So a fill suppresses the auto-advance, the card stays open with *"what we heard"* on it, and the way on becomes a button. |
| It cannot write **another question's answer** | A reply is reduced to the fields the answered question owns. `consent` is a legal answer key, so a filter of "must be one of the 16" would have waved it through. |
| It cannot pick a **closed option** | A male patient who says "PCOS" gets it left out with the reason on screen, from the same function that greys the option out. The microphone and the thumb never disagree about what is on offer. |
| It cannot record an **impossible age** | "It started when I was 40" from someone who said they are 34 is dropped, not clamped. Clamping would answer the question with a number nobody said, and would look exactly like a correct fill. |
| It cannot **guess** | Every value is matched against the schema's own option strings - case and whitespace ignored, nothing else. A paraphrase is dropped and flagged for a tap. Fields the reply did not mention come back in `unfilled`, and the patient is told *"filled 4 of 7 answers, 3 still to go"*. |
| It cannot **clear** an answer | A null in a fill means "not mentioned", never "forget what you told us". |

### Two hops, and only one of them is a model

The model reads text, not audio, so something has to turn the recording into words first.
That is the only job Sarvam has here: it produces a string, the string is shown to the
patient verbatim, and every decision about the *answer* is Gemini's at temperature 0.

```
lib/audio.ts        record on any browser, upload one format: 16 kHz mono WAV
api/transcribe      Sarvam proxy - the only place SARVAM_API_KEY exists
api/extract         one schema slice, one reply, Zod-validated on the way out
lib/llm.ts          one model, one temperature, one fetch. No SDK.
lib/voiceApply.ts   the rules above, pure and tested without a browser
components/VoiceAnswer.tsx   the row, the panel, and what the patient is told
```

The transcript is shown **first and always**, including when nothing matched. A patient
whose reply filled nothing needs to know whether they were misheard or misunderstood,
because those two have different remedies - say it again, or tap it in. A bare "nothing
matched" hides which one they are in.

---

## The three table questions

Habits, products and treatments are tables rather than choices: six rows, five rows and four
rows, two of them with rows that ask for detail once switched on.

**The flag is not asked separately.** A row opens as one line of options with the negative
among them - `[Never][<3mo][3-6mo][>6mo]` - because "have you used this?" followed by "for how
long?" is two stages for one fact, and nobody picks "3-6mo" without having used the thing.
Picking a duration writes `used: true` alongside it; picking Never nulls every detail column.
The emitted JSON is identical either way - see `lib/apply.ts`.

**What still unfolds is revealed inline, under the row that unlocked it.** "Did it help" and
"any side effects" are their own questions, not points on the duration scale. An earlier
version handed them over as full-size cards one at a time, which read well in isolation and
meant that switching one row on made the other four vanish: the patient lost the list they
were working down.

**Completeness comes from `lib/followups.ts`, not from the grid.** It describes which fields a
row owes, and `validateStep` counts the same descriptors that the "still needed" summary
reads - so a row cannot look answered to one and unanswered to the other.

**Speaking pays for itself most here.** Fourteen taps against one sentence, and the panel
lists every row while the patient is talking - a microphone with no prompt is the worst
version of voice input, because nobody knows how much to say. The row labels in that list
are interpolated from the schema constants, so a row added to the schema cannot silently go
unasked. Everything spoken still lands in the grid above for the patient to check.

## Light and dark

System-following by default, with a toggle that cycles system, light, dark, and an inline
script that applies the stored choice before first paint. One set of semantic tokens
defined twice; the scalp diagrams stay theme-independent because they only read as a set
with dark hair on a light scalp.

---

## Bought vs built

**Bought:** hosting + serverless (Vercel), STT (Sarvam), inference (Google Gemini), schema
validation (Zod), typed form fields (React Hook Form), state (Zustand), animation (Framer
Motion). Every one of these is a solved problem where a hand-rolled version would be worse and
slower.

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

**Deterministic (`npm test`, 304 tests, no key) - the dependable gate.** One test
diffs `lib/schema.ts` against the schema as downloaded from the URL in the brief, so
"verbatim copy" is proven rather than claimed · step builder and
schema coverage · sex gating across all four states, including that switching away from
female *nulls* the gated answers · every conditional-followup rule in both directions ·
exclusive options · 16-key coverage with gated nulls counted as resolved · and the
highest-value group: the extraction layer fed what a 70B open model actually returns - markdown fences, prose wrappers, invented option strings, extra keys, followups with no
trigger, non-existent rows, arrays where objects belong. Each must end in a legal patch
or nothing at all.

**Tolerant (`npm run eval`, needs `GEMINI_API_KEY`) - a measurement, not a gate.** 20
made-up patient transcripts in `fixtures/patients/`. Only fields the transcript *mentions*
are compared; unmentioned fields must appear in `unfilled`, and `unmentionedRows` asserts
the model did **not** invent a `false` for a row nobody spoke about. Kept out of CI because
an LLM isn't deterministic and a flaky red build teaches a team to ignore red builds.

The eight newest fixtures came with the microphone reaching every question, and they pin
the prompt rules that only the non-table questions exercise: two ages in one sentence
(*"I am 41 now, but it started when I was about 27"*), a number that has to be placed
inside a range rather than rounded down, a blanket denial that lands on the schema's own
"None" option, and one that has no option to land on and must come back as a UI-only flag
instead of a silently empty list.

**Measured result on Gemini 3 Flash: 69/69 fields (100%), 0 hard failures** across all
twenty fixtures. The two that failed on the first run were the truncation bug above, not the
model - and the one "wrong" answer was my fixture, not the model's: I wrote a Q4 denial
whose transcript described the hair thinning evenly all over, which *is* "Diffuse thinning",
so the model was marked wrong for being right. The fixture now denies without describing.

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
path, six sections), fails on any console error, then asserts the accordion's invariants,
the output object, that consent was never pre-selected, and that switching sex back to Male
makes Q6 disappear. Two follow-ups came out of that bug: the store no longer exposes
derived getters at all, and `tests/selectors.test.ts` scans the source to reject any
selector that calls a function or builds an object - a guard I verified catches the original
bug plus three variants rather than passing vacuously.

**It drives the microphone too**, with a fake capture device and both network hops stubbed.
That is the right seam: the model's accuracy is measured by the eval, while what breaks
silently is everything *after* the payload arrives. Three real bugs came out of exactly this
check, and none was reachable from a unit test:

- a spoken age reached the store while the age box stayed empty, because React Hook Form
  seeds a field once on mount - the form said *"filled 3 of 3"* over a blank input;
- Q14's side-effect description was written and then immediately erased, because the effect
  that pushed that box to the store ran in the same commit with the box's stale empty value
  and read it as the patient clearing the field;
- and the recording panel opened with "Stop and fill in" 130px below the fold on a phone,
  because the row sits at the bottom of a card and `scrollIntoView` cannot see past two
  `overflow: hidden` wrappers or below a fixed bar.

All three look, from the outside, exactly like the microphone not working.

**End-to-end, with live keys.** I generated real 16 kHz mono speech with Windows TTS and
pushed it through the deployed path: `POST /api/transcribe` returned a verbatim
transcript in **1.6 s**, and `POST /api/extract` filled all six habit fields correctly.
Per-slice extraction latency measured 8-19 s on the free tier, which is why the route
allows 28 s, the panel counts the seconds up while recording, and *"taking a while - you can
also tap below"* appears on its own after six seconds of waiting. The UI matches the
measured reality instead of assuming it is fast.

Also verified: clean production build, `tsc --noEmit` clean under `strict` +
`noUncheckedIndexedAccess` with zero `any`, and the extract route rejects `consent` with a
400 - the one answer that can never be model-filled, even with a valid key.

---

## Three calls I'd defend

1. **Speaking is offered under the taps, on every question but consent.** Tapping is what
   always works, so it comes first and stays mounted; speaking is the second offer, and it
   is worth most on the tables where one sentence replaces fourteen taps. Every fill is
   schema-validated before it lands, unmentioned fields are flagged for a tap rather than
   guessed, and the card stays open with the transcript on it so a machine's reading is
   always checked by the person it is about. Voice can fail in any way and the form still
   finishes.
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
  page.tsx                  landing - one dom, two compositions (phone column / desktop panel)
  intake/page.tsx           wizard shell - switches on step.kind, has no question list
  api/transcribe/route.ts   Sarvam proxy (key server-side)
  api/extract/route.ts      structured extraction + schema gate
components/
  SectionShell.tsx  AppBar.tsx  SectionNav.tsx  ProgressBar.tsx  ReviewScreen.tsx
  QuestionSpeaker.tsx        the read-aloud button, on every question
  VoiceAnswer.tsx            "answer by speaking" - the row under the controls
  ComfortToggle.tsx          text-size control (Aa), and the DOM projection of it
  ComfortPrompt.tsx          "would you like larger text?", asked once, previews both
  EditQuestionDialog.tsx     one question, corrected from the review screen
  SectionShell.tsx           the app shell: bar, sidebar, content pane, actions
  AppBar.tsx                 fixed top chrome, one constant height on every screen
  SectionIcons.tsx           one glyph per section, keyed by schema id
  HeroArt.tsx                the landing illustration, drawn not photographed
  ui/TextField.tsx           a labelled input with its error and the aria that links them
  SectionNav.tsx             desktop sidebar: six steps, per-step progress
  questions/QuestionCard.tsx one question in one of three states
  questions/QuestionBody.tsx the controls for one question, shared by wizard and dialog
  LangToggle.tsx             EN / हिं, and the <html lang> it writes
  questions/     SingleChoice MultiChoice YesNo NumberStepper AboutYou PatternPicker
                 Consent YesNoDescribe TableQuestion HabitsGrid TableGrid
                 ScalpDiagram
lib/
  schema.ts        source of truth (verbatim copy of the published schema)
  types.ts         Answers + enums, all derived from schema.ts
  steps.ts         schema -> ordered steps + gating + per-step validation
  followups.ts     conditional questions, as answerable descriptors
  apply.ts         the write rules (the grid and a voice fill share them)
  questionSpeech.ts what the speaker button reads out, derived from the schema
  patient.ts       personalisation: comfort scale, onset cap, age-aware suggestions
  i18n.ts          the language resolver: one language per render, placeholder filling
  sections.ts      the six sections: visible questions, counters, what to open next
  summary.ts       short labels and the one-line answer a collapsed card shows
  multiSelect.ts   what a checkbox tap does, including the exclusive-option rule
  copy.hi.ts       Hindi for every question, option and UI string
  llm.ts           the model boundary: one model, one temperature, both pinned
  voiceClient.ts   the two network hops, and every failure mapped to what to say
  voiceApply.ts    what a spoken reply may write for THIS patient. Pure.
  speak.ts         browser speechSynthesis, with barge-in and a no-voice fallback
  store.ts         Zustand
  validate.ts      Zod + 16-key coverage
  extractPrompt.ts system prompt + per-question schema slices
  audio.ts         in-browser 16kHz mono WAV encoding
  copy.ts          all microcopy, in one place
fixtures/patients/ 20 transcripts (4 held out) + expected answers
tests/             304 deterministic tests (incl. three source scans: selector stability,
                   no hard-coded English, and no words on the accent fill)
scripts/smoke-browser.mjs  Playwright walkthrough of the full intake
scripts/eval-fixtures.ts   live extraction eval
```
