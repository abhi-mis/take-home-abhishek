# Implementation notes

What I built, what logic sits behind each piece, and what that logic buys the patient.
Read top to bottom - it follows the data.

---

## The one idea

**The schema is the program.** `lib/schema.ts` is a verbatim copy of
`haikustudio.ai/hiring/intake-schema.json`, typed `as const`. Four things are derived
from it, not written twice:

| Derived thing | File | What breaks if the schema changes |
| --- | --- | --- |
| The ordered wizard steps | `lib/steps.ts` | a new question just appears |
| The enums / `Answers` type | `lib/types.ts` | compile error, not a silent drift |
| What the model is allowed to fill | `lib/extractPrompt.ts` | the prompt's option list updates itself |
| What counts as a valid output | `lib/validate.ts` | the validator tightens with it |

**Why it matters:** the three places where a form usually rots - the UI, the AI
prompt, and the validator - can't disagree here, because none of them owns a list of
questions. `app/intake/page.tsx` has no list of the 16 questions in it; it has a
`switch` on `step.kind`, which came from the schema's `type`.

---

## Step engine + gating

`visibleSteps(meta)` recomputes the step list on **every render** from the current
answers. Nothing about visibility is stored.

```
patient_sex !== "female"  →  Q6, Q7 skipped, and their answers forced to null
```

Two consequences worth naming:

- **A gated null is a valid answer, not a missing one.** `validate.ts` treats it as
  resolved. Without this rule, a male patient could never complete the form.
- **Changing your mind works.** `setSex()` rewrites the answers, not just the meta - switching from female to male *nulls* `menstrual_cycle`, so a stale value can never
  reach the output. Progress retotals live (17 steps for female, 15 otherwise).

**The sex decision.** Asked once, right before section B, with the reason said out
loud: *"Kuch sawaal sirf kuch patients pe lagu hote hain, to baaki aapke liye skip kar
denge."* I did **not** infer it from Q9 (excess body/facial hair) - that's unreliable
in both directions (men answer yes constantly; PCOS patients answer yes) and it feels
like being watched. `"Prefer not to say"` gates exactly like `"male"` and never blocks
the form.

---

## Per-question interaction logic

Each question picks the cheapest modality rather than sharing one control.

- **Q1 age** - decade presets first (Teens/20s/30s/40s/50+), fine-tune revealed after.
  Onset age is a *memory*, not a fact; asking for a number opens a numeric keypad over
  the form. One tap, then an optional nudge.
- **Q2 / Q8 / Q9 / Q15 / sex gate - auto-advance.** Tapping the answer *is* the Next
  tap, after a 180ms beat so the choice visibly registers. These steps hide the Next
  button entirely: 16 questions cost ~16 taps, not 32.
- **Q4 is pictures.** Six inline-SVG scalp diagrams with the affected zone shaded, in
  a two-column grid. One head outline and one visual language across all six (five
  top-down, plus loose strands for shedding) so they are genuinely comparable - an
  earlier draft drew the receding hairline as a front-facing face with arrows, and next
  to five top-down scalps it read as a different kind of picture entirely. Q3 and Q15
  get line icons on the same reasoning.
- **Q3 / Q5 exclusive options.** `"No known family history"` and `"None"` clear every
  other selection, and any other selection clears them. Enforced in `MultiChoice` for
  feel and again in `validate.ts` for correctness, so even a voice patch can't produce
  `["Anemia", "None"]`.
- **Q4 / Q10 "none of these".** These two have no `none` option in the schema, but an
  empty answer is legitimate. Rather than invent a schema option, the UI renders a
  **UI-only** control that writes `[]` and records the deliberate choice in the store's
  `explicitNone` set. The output stays exactly on-schema; validation can still tell
  "deliberately none" from "not answered yet".
- **Q6 suggestion.** If onset age ≥ 50, Q6 offers `"Menopausal"` as a one-tap
  suggestion she must accept. It never writes to the store on its own - a suggestion
  the patient ignores must leave the answer untouched.
  *Two deliberate deviations from the brief here, flagged:* the brief said pre-select
  `"Not applicable"`; I suggest `"Menopausal"` because it's the option that actually
  tells the doctor something (`"Not applicable"` reads as "I won't say"). And it's a
  suggestion rather than a pre-fill because onset age is an imperfect proxy for
  *current* age - which is exactly the kind of guess the brief rightly rejects for sex.
- **Q11/12/13 tables.** A real table at 380px is unusable. Each row is a card that
  starts as one yes/no and expands its detail columns only when switched on. A patient
  using no products answers 5 taps and is done.
- **Q16 consent** - its own screen, nothing pre-selected, four plain-English points
  each with a Hindi gloss, covering what's collected, what's analysed, and the right to
  withdraw. **The decline path is real**: `consent: false` produces no JSON at all.

---

## The voice question, end to end

A voice question is a small stage machine, not a grid with a mic bolted on top.

**1. Speak first (the default).** The grid is not shown. The screen is a numbered
checklist of every item to cover, the conditional detail questions, one example answer,
the mic, and "I would rather answer by tapping".

Two reasons the grid starts hidden. A grid on screen invites tapping, and the voice
feature never gets used. And a mic with no prompt is the worst version of voice input:
the patient does not know how much to say, answers one thing, and one field fills.

**The prompt enumerates; it does not summarise.** The first version was a prose
paragraph, and it was wrong - it read smoothly but quietly dropped rows, so patients
answered three of six items and the fill looked broken. A form has to enumerate. Every
row is now its own numbered point, and the labels are interpolated from the schema
constants rather than retyped, so a row added to the schema cannot silently go unasked.
The conditional layer is stated up front in the same block ("for every product you do
use, also say how long, whether it helped, and any side effects"), which is what lets a
single reply complete a row instead of leaving three blanks behind.

Row names appear verbatim - "OTC/Medicated Shampoos", not "oTC/Medicated Shampoos". An
earlier helper lowercased the first letter to read better mid-sentence and mangled every
acronym; on a clinical form the product name a patient sees must match the one the doctor
reads, so the helper is gone.

**2. The result popup.** After extraction, a modal answers the only two questions the
patient actually has:

- *How much did you get?* - "Filled 6 of 6", or "Filled 2 of 6 - 4 still to go",
  itemised, with the transcript shown above it.
- *Is it right?* - an explicit **"Yes, these match"**. An LLM just filled six medical
  fields from one sentence; treating that as agreed because nobody objected is not
  consent, it is silence. When something is missing, the primary action becomes
  "Answer the rest (4)" instead, which opens the follow-up flow.

**3. The form.** The grid, for confirming, correcting, or answering by hand. A patient
who chose to tap, or whose mic or API key failed, lands here directly and never sees
stages 1 and 2 - so there is exactly one fallback path to maintain.

Verified end to end with real speech (Windows TTS piped into Chromium's
`--use-file-for-fake-audio-capture`): *"I smoke about six a day. No alcohol. The water at
home is hard. I wash my hair every other day. I do not use a dryer or any chemicals. I
had keratin at a salon last year."* filled all six fields, mapped "about six a day" to
`Moderate 5-10/day`, and pulled `keratin` out as the salon detail. A deliberately short
reply produced "Filled 2 of 6" and named the four it had not heard.

---

## Layered questions: what happens after a voice fill

Q11/12/13 are tables whose rows unfold into more questions the moment a row is answered
Yes. That is fine tapping down a grid, but it is the worst part of a voice fill: the
model answers eight fields, leaves three blank, and those three are buried inside
collapsed rows the patient now has to hunt for. Printing "3 things missing" and walking
away is a bad ending to an otherwise magic moment.

So every outstanding field is described in `lib/followups.ts` as a **self-contained
question** - its own wording, control and options - and `FollowUpFlow` asks them one at
a time at full size. Three taps and the patient is done.

Four decisions carry it:

1. **Stateless about position.** The flow always renders `fields[0]`, and `fields` is
   recomputed from the answers on every render. Answering the current question makes it
   drop out of the list and the next slides in. Nothing to keep in sync, nothing that can
   desync, and it self-closes the moment the list empties.
2. **Layers appear next to their trigger.** "Do you smoke? → Yes" is immediately followed
   by "How much do you smoke?", not four questions later. New layers unlock mid-flow for
   free, because the list is derived rather than precomputed. That is the difference
   between a conversation and a queue.
3. **Derived from the answers, not from the model's `unfilled` list.** So the flow also
   shrinks when the patient answers by tapping the grid, and it is always exactly in step
   with what `validateStep()` is blocking Next on.
4. **One question on screen at a time.** While the flow runs, the grid AND the outstanding
   summary both stand down. The first version showed all three, so "Do you smoke?"
   appeared twice on one screen - the kind of duplication that makes a form feel
   assembled rather than designed.

It is not voice-only: a tap-first patient gets the same guided treatment from an
"Answer the remaining N one at a time" button, because a five-row grid with detail
columns is worth guiding through either way.

---

## The mic: real levels, not a fake animation

The waveform is driven by an `AnalyserNode` on the live stream (`Recorder.getLevel`),
not a canned CSS animation. That is not decoration - a fake animation looks **identical**
whether the mic is live or muted, so a patient in a noisy clinic gets no signal that they
are not being heard until the transcript comes back empty. Real levels make it obvious in
the first second.

Details that matter:

- **Perceptual curve, not linear.** Speech RMS sits around 0.05-0.15, so a linear map
  leaves the meter nearly flat for a soft-spoken patient. `pow(rms * 4, 0.7)` lifts quiet
  input into visible range while keeping headroom for a loud voice.
- **A 3px floor per bar,** so silence shows a live baseline rather than an empty box that
  reads as broken.
- **Rolling window at 25fps** (28 bars, one small state update per frame) - smooth to the
  eye and far cheaper than re-rendering 28 nodes at 60fps.
- **The analyser is optional.** If the AudioContext is refused, the meter goes flat and
  recording is completely unaffected.

Verified with Chromium's fake capture device: 28 bars, heights above the floor, and 4
distinct frames out of 5 samples - the animation is provably following real audio.

---

## Light and dark

Three states, not two: **system** is the default and follows the device, because a
clinic tablet set to dark at 9pm should open dark without anyone touching a setting.
Tapping the toggle cycles system -> light -> dark, and an explicit choice always beats
the media query.

The palette is one set of semantic tokens defined twice (`:root` and
`:root[data-theme="dark"]`, plus a `prefers-color-scheme` block guarded by
`:not([data-theme="light"])`). An inline script in `layout.tsx` applies the stored
choice before first paint, so there is no white flash on a dark phone.

Two things had to change to make it honest rather than merely dark:

- **`--brand-ink` was doing two jobs.** It was text-on-soft *and* the button hover fill.
  Those pull in opposite directions in dark mode (light text, darker fill), so it is now
  split into `--brand-ink` (text) and `--brand-strong` (fill).
- **Two components animated hardcoded hex.** The "voice just filled this" flash tweened
  between `#e3f1ee` and `#ffffff` in Framer Motion, which is wrong the instant a second
  palette exists. It is now a `brand-soft` overlay whose opacity fades, so it inherits
  whatever the theme currently is.

The scalp diagrams are deliberately **theme-independent**. They only read as a set if
hair stays dark against a light scalp; wiring them to the tokens would flip hair to
near-white on light beige and destroy the picture. They sit on the card like a printed
illustration.

---

## Cursors and hover: the desktop bug

Tailwind v4's preflight sets `cursor: default` on `button` (a deliberate change from v3).
Every control in this app is a `<button>`, so on desktop the entire form pointed at
nothing - it worked perfectly under a thumb and felt dead under a mouse. Fixed once in
`globals.css` for buttons, radios, checkboxes and labels, with `not-allowed` on disabled
and `grab/grabbing` on the age slider, rather than sprinkling `cursor-pointer` through
twenty components.

The same pass added `hover:` states everywhere - the app previously had only `active:`,
which is invisible on a desktop demo. Tailwind v4 scopes `hover:` behind
`@media (hover: hover)`, so none of it sticks on touch.

---

## Conditional questions get asked, not revealed

Answering "yes" to a product does not finish that row. It creates three more questions -
how long, did it help, any side effects - and the same is true of smoking (how much) and
salon treatments (which one). Previously those just appeared, collapsed, further down the
grid, and it was on the patient to notice them.

Now switching a row on immediately asks its conditional questions, one at a time, and
**only** its questions. The follow-up flow takes an optional scope, so a patient tapping
down the list gets a short detour for the row they just answered rather than being pulled
into the whole outstanding queue:

```
Do you use OTC/Medicated Shampoos?  -> Yes
   -> How long have you been using OTC/Medicated Shampoos?
   -> Did OTC/Medicated Shampoos help?
   -> Any side effects from OTC/Medicated Shampoos?
   (flow closes, grid returns)
```

A scoped detour also **auto-closes** when it empties, instead of showing the "all done"
card. Finishing eight questions is worth acknowledging; finishing a one-question detour
is not, and an extra tap to dismiss a card is ceremony the patient did not ask for.

---

## Validation: nothing is optional

One function - `validateStep()` in `lib/steps.ts` - answers "may this patient
continue?". It returns a list of outstanding items, and that list drives three things at
once: the Next button's disabled state, the message printed under the question, and (via
`validate()`) the final download gate. One rule set, so the step gate and the output
gate cannot disagree.

| Step kind | Required before Next |
| --- | --- |
| number, single, yesno, consent | a value (consent is never pre-selected) |
| multi | at least one option, **or** an explicit "None of these" |
| table (Q11/12/13) | every row answered, plus detail columns on any row set to Yes |
| yesno_describe (Q14) | Yes/No, and a non-empty description if Yes |

**The data-model change this forced.** Every yes/no is `boolean | null` while filling.
With `false` as the default, an untouched row and a real "No" are the same value - the
form literally cannot tell them apart, so "every row must be answered" would be
unenforceable. `null` means unanswered, and `validate.ts` rejects null: that is how a
nullable UI still produces a non-nullable output without a second "final" type.

**Why the message matters as much as the block.** A disabled Next button tells a patient
that something is wrong but not what - on a five-row products grid that is genuinely
hostile. So the outstanding list names each row ("Supplements: how long", "Hair wash:
choose how often"), and a test asserts those messages never leak a snake_case field name.

---

## Voice pipeline (Q11/12/13/14)

```
mic → WAV (16kHz mono, in-browser)
    → POST /api/transcribe   (Sarvam Saaras, key server-side)
    → transcript
    → POST /api/extract      (Claude + ONE schema slice, temp 0, JSON prefill)
    → Zod-validated patch → merged into store → grid highlights what changed → tap to confirm
```

**Audio format.** MediaRecorder gives you `webm/opus` on Android Chrome, `mp4` on iOS
Safari, `ogg` on Firefox - so shipping the raw recording means iOS and Android fail
differently, and only in production. `lib/audio.ts` decodes whatever was captured and
re-encodes 16kHz mono WAV in the browser. One format reaches the server, speech models
want 16kHz anyway, and the upload drops to ~32KB/s, which matters on clinic 4G.

**Slices, not the whole form.** The model never sees 16 questions. Per voice step it
gets one slice of the schema and one transcript. That small output space is why an open
20B model at temperature 0 is reliable enough to trust here.

**Model choice was measured, not assumed.** The brief's suggested
`meta/llama-3.3-70b-instruct` returns **410 Gone** - retired from the catalog. What
survives is mostly *reasoning* models, and their default effort is fatal on a form:
`openai/gpt-oss-120b` took **94-120 s** per call. `openai/gpt-oss-20b` with
`reasoning_effort: low` answered the same transcript identically in **4.7 s**.
Extraction against a fixed 8-field schema needs no deliberation, so low effort costs
nothing and is the whole difference between a usable and unusable step. Both settings
live in `chatParams()` (`lib/llm.ts`), shared by the route and the eval - a benchmark that runs
different settings than production is worthless.

**Latency is designed for, not wished away.** Measured 8-19 s per slice on the free
tier. So the route allows 28 s (`maxDuration` 60), and the mic panel counts seconds
upward and explicitly offers tapping after 12 s. A static spinner at 19 s reads as
frozen; a ticking number reads as working.

**Three rules that make the fill safe:**

1. **Silence ≠ no.** A row is only marked `used`/`done` when the patient actually said
   so. *"I use minoxidil and biotin"* implies nothing about a hair transplant, so those
   rows are left untouched - not set to `false`. This is the most dangerous failure
   mode in a medical intake and the fixture eval scores it explicitly.
2. **Unmentioned → `unfilled`, never guessed.** Fields the transcript didn't cover come
   back in an `unfilled` list, and the UI asks for a tap in warm dashed styling.
3. **Off-schema values are dropped, not repaired.** `"a lot, maybe 8 a day"` doesn't
   become `"Moderate 5-10/day"`; it becomes a blank the patient taps. A wrong option
   string in a medical intake is worse than a blank.

Conditional invariants are enforced in the slice too: a followup whose trigger is
`false` is discarded before the patch is built, so the store can never hold
`smoking: false, smoking_severity: "Severe >10/day"`.

**Voice is never a dead end.** The tap grid is *always* mounted, before and after
recording. There is no "manual mode" to switch into - a mic denial, a missing API key,
an unparseable model reply, or a patient who just prefers tapping all land in the same
UI. Both routes return a plain-language 503 when their key is absent, and the panel
hides itself entirely if the browser has no usable MediaRecorder.

**Merge, never replace.** Patches shallow-merge over existing values, so the patient can
record twice (*"...aur main biotin bhi leta hoon"*) without losing round one.

---

## Validation - the "how I verified the fill" story

`validate(answers, meta, touched)` answers two different questions:

1. **Shape** (Zod) - is every value one of the schema's *exact* option strings? Are all
   conditional followups present exactly when their trigger is true, and `null`
   otherwise? Are all table rows present, with no extras?
2. **Coverage** - are all 16 keys resolved? Sex-gated nulls count as resolved. An
   *untouched* multi-select does not - which is why the store tracks `touched`: it lets
   a genuinely empty answer count while an unvisited question can't slip through.

The Review screen renders the download button **only when both pass**. Anything
unresolved becomes a tap-to-jump link back to that question, not an error message.

The gating rule and the Q14 conditional are re-checked in `validate.ts` independently
of the UI, so a bad extraction patch can't bypass the interface.

---

## What's tested, and what deliberately isn't

**`npm test` - 158 deterministic tests, no API key needed.** These are the dependable
checks: the step builder, sex gating in all four states, every conditional-followup
rule in both directions, exclusive options, 16-key coverage, and - most of the value - the slice layer fed what a 70B model *actually* returns: markdown fences, prose
wrappers, invented option strings, extra keys, followups with no trigger, rows that
don't exist, arrays where objects belong. Every one must end in a legal patch or
nothing.

**`npm run eval` - live fixture eval, needs a key, NOT a CI gate.** 12 made-up patient
transcripts (Hinglish, English, blanket-denial, code-mixed, sparse) scored
**tolerantly**: only fields the transcript *mentions* are compared, and
`unmentionedRows` asserts the model did **not** invent a `false`. Kept out of `npm test`
on purpose - an LLM isn't deterministic, and a flaky red build teaches a team to ignore
red builds. Every patch is schema-validated *before* scoring, so a passing field is
on-schema by construction.

**Result: 56-58/58 fields (97-100%) across runs, 0 hard failures.** One borderline fixture flips between runs even at temperature 0, which is precisely why this is a measurement and not a CI gate. The eval paid for itself immediately - its first run caught the model writing `Other: done = false` for a procedures row the
patient never named, which is precisely the "silence became a no" bug it was built to
find. One prompt rule fixed it.

Because tuning a prompt against the fixtures you score on is self-deception, I wrote
**4 held-out fixtures after tuning** (`heldout-*.json`) and re-ran; 3 of 4 passed clean.
The one miss is benign and I left it rather than tune further: on *"Minoxidil kabhi try
nahi kiya"* the model omits the row instead of writing `used: false` - and the store
default for that row is already `used: false`, so the output is right regardless. Both
error directions are safe by construction: an omission is flagged for a tap, an
over-eager `false` is visible and editable on the Review screen.

**End-to-end with live keys.** Real 16 kHz mono speech (generated with Windows TTS)
through the actual routes: transcribe **1.6 s**, verbatim; extract filled all six habit
fields correctly.

**The conversation is tested by walking it.** `tests/chatFlow.test.ts` answers whatever
the assistant asks, turn by turn, with no knowledge of the question list, and then runs
the result through the same Zod validator the download button uses - so the claim under
test is "a patient who only ever talks produces a schema-valid form", not "bubbles
render". `tests/apply.test.ts` pins the write rules both modes now share (a flag answered
No must null its detail columns, or the finished form is off-schema), and
`tests/llm.test.ts` pins the per-provider request shape.

**Two real-browser smokes, both keyless.** `npm run smoke` walks the form;
`npm run smoke:chat` walks the conversation to 17/17 with no API keys at all and the TTS
route stubbed to 503 - which is how the "open table question has no chips" dead end was
found.

**Also verified by hand:** production build clean, `tsc --noEmit` clean (strict, plus
`noUncheckedIndexedAccess`, zero `any`), and the extract route rejects `consent` with a
400. Note that `sample_type` **is** extractable now - chat mode has no grid to fall back
on, so a typed "saliva is fine" has to be understood. `consent` is the one answer that
stays off the allow-list permanently: it is a tap or the patient's own typed yes/no,
never a model's reading of prose.

---

## The bug I shipped, and what it changed

The first version rendered an infinite loop in the browser:

```ts
const steps = useIntake((s) => s.steps());   // WRONG
```

Zustand compares each selector's result with `Object.is`. `steps()` **built a fresh
array on every call**, so the result never compared equal, and React re-rendered until
it threw *"Maximum update depth exceeded"* (plus *"getServerSnapshot should be cached"*
on the SSR path).

What makes it worth writing down is that **every check I had passed**: `tsc` was clean,
69 unit tests were green, the production build succeeded, and `curl /intake` returned
200. The loop only exists in a live React client, and I had no live React client in the
loop.

The fix is three parts, in increasing order of usefulness:

1. **Derive outside the store.** `useMemo(() => visibleSteps(meta), [meta])` - same
   live-recompute behaviour, stable reference between sex changes. Selectors now read
   one field each (`s.answers`, `s.patch`, …), which are stable by construction.
2. **Delete the footgun.** The store no longer exposes `steps()` or `progress()` at
   all, with a comment saying why. A bug you can't reach beats a bug you fixed once.
3. **Two new tests.** `tests/selectors.test.ts` scans the source and rejects any
   `useIntake` selector that calls a function or builds an object or array - and I
   checked it actually catches the original bug plus three variants, rather than
   passing vacuously. `npm run smoke` drives a real browser through all 17 steps and
   fails on any console error.

The smoke test then caught two of my own bad assumptions, which is the point of running
real software: `getByText("Saliva")` was clicking the *hint* text ("Saliva mein sui nahi
lagti") that sits above the options - so it now uses roles, because the options are real
`radio`/`checkbox` elements; and Back from Q6 lands on Q5, not the sex gate, because the
gate is inserted before the first section-B question.

---

## Chat mode: the conversation is a view, not a second app

The risk with "add a chat mode" is obvious: you end up with two apps that ask the same
16 questions and disagree about what a valid answer is. Then a patient finishes the
conversation, lands on the review screen, and the download button is disabled with no
visible reason - because the chat accepted something the validator does not.

So chat mode owns exactly one thing: the conversation. Everything that decides anything
is shared.

```
lib/chatFlow.ts   nextTurn(answers, meta, explicitNone)
    |
    |-- visibleSteps(meta)        <- the SAME list the wizard renders
    |-- validateStep(step, ...)   <- the SAME gate the Next button uses
    |-- outstandingFieldsFor(...) <- the SAME conditional descriptors the grid uses
    |-- COPY[key].title           <- the SAME question wording
    v
first step that does not validate  ->  ask it
```

There is no question list in `chatFlow.ts`, no "step 7 of 16", no state machine to keep
in sync. The consequences are the point:

- **Add a question to the schema** and it appears in the conversation with no edit here.
- **The finishing line cannot lie.** The assistant says "that is everything" when every
  visible step passes `validateStep` - the same condition the form's last Next needs.
- **Switching modes works mid-question**, in both directions, because both are views
  onto one store. `stepIdForTurn()` is the bridge: it maps the current turn back to a
  wizard step id so "I would rather tap through the form" lands on the question the
  assistant just asked, not back at Q1.

`chatFlow.ts` is pure - no React, no fetch, no store import - which is what lets
`tests/chatFlow.test.ts` answer whatever the assistant asks, one turn at a time, with no
knowledge of the question list, and then run the result through the same Zod validator
the download button uses. A test that says "chat mode renders bubbles" is worthless; the
claim worth testing is "a patient who only ever talks produces a schema-valid form".
There is a source-scanning guard test that fails if that purity is ever broken.

### How much of a reply reaches the model

`interpretLocally()` first, model second. It resolves a tapped chip, yes/no (including
`haan`, `nahi`, `bilkul`), a bare age, an option repeated verbatim, and a blanket "none
of these" with no API call at all - which is most replies, and is why the conversation
feels instant rather than two seconds behind every answer.

It is deliberately conservative. `"it started at 30 and I am 45 now"` returns null and
goes to the model, because a regex picking the wrong one of two numbers is a wrong
medical answer that nobody will notice. `"20s"` maps to the same value as tapping the
"20s" chip, not to the digits inside it - otherwise the typed and the tapped answer
would quietly differ by five years.

Two categories never reach the model:

1. **Consent.** A tap, or the patient's own typed yes/no. It is absent from
   `EXTRACT_KEYS`, so `/api/extract` refuses it even if the UI asked - defence in depth,
   because "the patient probably agreed" is not consent.
2. **A conditional detail.** "Did it help?" is not sent to the model, because the slice
   for that question covers the whole table and a bare "it helped a bit" carries no clue
   which row it belongs to. A guess written into the wrong row is a silent wrong answer.
   Those turns always have chips, so "tap one of these" is a complete answer.

### The read-back, and what "no" means

When one sentence fills six fields, the assistant lists them and asks. Treating silence
as agreement is not consent, so `fillSummary()` produces the counts ("I got 4, and 2
still to go") and the label/value list, and the patient confirms.

"No, let me redo it" runs `clearQuestionOps()` and re-asks the question one field at a
time. The alternatives are worse: keeping a fill the patient just rejected, or asking
them to correct fields one by one without knowing which one is wrong.

### Never a dead end - the gap the smoke test caught

The first version of the open table question had **no chips at all**: it wanted a
sentence, and a sentence needs the model. Which means a missing API key, a rate limit, or
an accent the transcriber cannot read left the conversation with no way forward - the
exact failure the form avoids with "I would rather answer by tapping".

`scripts/smoke-chat.mjs` completes the whole intake with **no API keys**, which is how
that surfaced. The fix is the "Ask me one at a time" chip: it is not an answer, it flips
that question to the per-field path (`preferFields`), which has chips for everything.
The same flag is set automatically when an extraction returns nothing usable, so a
patient the model cannot read is never asked the same six-part question twice.

### Speech: an enhancement, never a channel

Every line is rendered as a bubble *before* `speak()` is called, so speech is never the
channel a question arrives through.

The voice is the browser's own `speechSynthesis`. Anthropic has no text-to-speech
endpoint, and I did not want to add a second vendor to get one: that would mean another
key to leak, a network round trip before every question, and - the part that actually
decided it - audio of a patient's medical answers being posted to a third party, since
some of what the assistant says is their own answers read back. The browser voice is
more robotic and needs no key, no network, and no trust.

Two details matter more than the voice quality:

- **Barge-in.** `speak()` bumps a `generation` counter, and a stale utterance cannot
  report itself as spoken. Without it a patient who answers quickly gets the previous
  question spoken over the new one - two voices at once, and the app sounds broken.
- **Noticing silence.** Chrome silently drops `speak()` when the document has had no
  user activation, with no error and no event - and the tap that got here happened on
  the *previous* page. So the promise waits ~1.2s for `onstart` and reports `blocked` if
  it never fires, which is what turns a dead mute button into a visible "tap to hear the
  question".

`en-IN` is preferred where the platform has it, because a Hindi word inside an English
sentence is at least pronounced plausibly. It is a preference, not a requirement.

---

## Swapping the extraction provider

Extraction runs on **Anthropic** - `claude-sonnet-5`, temperature 0. NVIDIA NIM is kept
as an alternative because the brief named it and it costs almost nothing to keep: NIM
speaks the OpenAI wire format, so the `openai` SDK covers it. [lib/llm.ts](lib/llm.ts) is
the entire difference between the two, and nothing else in the app knows which one
answered.

```
resolveProvider()
  EXTRACT_PROVIDER=anthropic|nvidia -> explicit always wins
  ANTHROPIC_API_KEY present         -> anthropic
  NVIDIA_API_KEY present            -> nvidia
  neither                           -> null, and the route returns 503 with a message
                                       telling the patient to tap instead
```

### The JSON prefill

The interesting part of the Anthropic path is how it is made to return bare JSON.
Instead of asking for JSON and hoping, the request ends with an **assistant turn
prefilled with an opening brace**:

```
user:      Question: ... Schema: {...} Transcript: "..."
assistant: {
```

The model is now physically continuing a JSON object rather than starting a message, so
there is no "Here is the JSON:", no code fence, no apology. The brace is added back to
the response before parsing, because the API returns only what was generated after the
prefill. The fence-stripping parser still runs behind it - it costs nothing, it covers
the NIM path, and a parser you only trust on the happy path is not a parser.

### Two NIM traps, asserted rather than discovered

Both are hard 400s in production and completely invisible without a test
(`tests/llm.test.ts`):

- **Reasoning models** (`o*`, `gpt-5*` style ids) reject `temperature` and want
  `max_completion_tokens` instead of `max_tokens`. Detecting that from the model id is
  ugly, but the id is the only signal available.
- **`reasoning_effort`** is not universally accepted, so `NVIDIA_REASONING_EFFORT=none`
  omits the field entirely rather than sending the string "none".

`callModel()` is shared by the route and `npm run eval`, so the benchmark cannot run a
different provider, model, temperature or JSON strategy than production does.

Sarvam remains the transcriber: it is trained for Hinglish and Indian-accented English,
which is where general-purpose STT degrades first for this audience. And the assistant's
voice needs no vendor at all - see above.

---

## Deviations from the brief, stated plainly

1. **All copy is English, not Hinglish.** The brief specified Hinglish microcopy; the
   project owner asked for English. Spoken input still handles Hindi/Hinglish, because
   the mic and the screen are different channels.
2. **shadcn/ui primitives are hand-written** (`components/ui/Button.tsx`) rather than
   pulled via the CLI. Same API shape (variant/size, `cn()` merge, overrides win), but
   Radix-free: nothing in this form needs a portal, popover or focus trap - every
   control is a plain `<button>`, which is what a thumb and a screen reader both handle
   best. Cost: no upstream component updates.
3. **Q6 suggests `"Menopausal"`, not `"Not applicable"`, and suggests rather than
   pre-fills.** Reasoning above.
4. **Q4 gets "Not sure" and Q10 gets "None of these"** as UI-only affordances writing
   `[]`. No schema option was invented.
5. **`NVIDIA_MODEL` is `openai/gpt-oss-20b`, not a Llama 70B.** Not a preference - the
   brief's suggestion is retired (410 Gone). Reasoning and latency notes above.
6. **Not done by me:** the Vercel deploy, any git/GitHub step (you asked me not to
   push - and this isn't a git repo, so nothing can be), and the 2-minute recording.

---

## What I'd do with one more week

Scalp-zone tap diagram for Q4 (the one interaction still doing chips' work) · full
Hindi/Telugu end-to-end, since the copy is already isolated in `lib/copy.ts` · a
larger eval harness with multiple runs per fixture and per-field accuracy tracked over
time · doctor live-view of the form filling in · WhatsApp pre-fill link before arrival ·
offline PWA for clinic tablets · abandonment analytics per question.
