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
    → POST /api/extract      (NVIDIA NIM + ONE schema slice, temp 0)
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
live in `modelConfig()`, shared by the route and the eval - a benchmark that runs
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

**`npm test` - 86 deterministic tests, no API key needed.** These are the dependable
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

**Also verified by hand:** production build clean, `tsc --noEmit` clean (strict, plus
`noUncheckedIndexedAccess`, zero `any`), both pages server-render the right copy, and
the extract route rejects `consent` and `sample_type` with a 400 - those two can never
be model-filled, even with a valid key.

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
