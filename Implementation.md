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
  reach the output. Section counters retotal live (Health is 5 questions for a female
  patient, 3 otherwise).

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
- **Q2 / Q8 / Q9 / Q15 - select, then confirm.** These auto-advanced once, which cost 16
  taps instead of 32 and is the trade this form no longer makes. See "Nothing
  auto-advances any more" below.
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

## Answering by speaking, under the taps

Every question except one can be answered out loud, and the microphone is a single 44px row
**underneath** the controls it is an alternative to.

**The order is the entire design.** Tapping comes first because tapping always works: no
permission prompt, no network, no model, and it behaves identically in a quiet room and a
loud one. Speaking is the second offer - for the patient who finds reading hard, and for the
table questions where one sentence replaces fourteen taps.

This is the third shape this feature has had, and the two it replaced are why the current
one looks so plain:

1. **Speak first.** The grid was hidden and the card opened on a full-screen surface: a
   numbered checklist, the mic, and "I would rather answer by tapping" as the way out. Voice
   as the default, the form as the escape hatch. That is backwards for a medical intake - the
   form is what every patient can complete.
2. **Three stacked calls to action.** Moving the mic panel above the grid left the card
   opening with a mic panel, an "answer all of these by speaking" button and an "answer the
   remaining 6 one at a time" card, two of which led to the same screen. That is not a
   choice, it is a decision the patient has to make before they can begin.
3. **One row, opened on request.** Tapping it is what brings the mic out, which is the only
   moment a mic is any use.

The rule that survived all three: **a microphone offered before the question has been read
is a demand, not an offer.**

### The one question that has no microphone

`consent`. Permission for a genetic test is given by pressing the word "Yes", never inferred
from prose that a transcriber and then a model both had to read. It is absent from
`VOICE_KEYS`, which is the API route's allow-list, so it is **unreachable** rather than
merely un-offered - a UI rule can be bypassed by a caller, and this one may not be.
`voiceKeyForStep()` returns null for that card and the row is never rendered.

About You *does* get one, and it is the reason the claim "you can answer this form by
speaking" is true at all: "mera naam Anita hai, main 34 saal ki hoon" fills the name, the
sex and the age together. Those three are `Meta`, not answers, so the route returns them in
a field of their own - `patch` becomes the downloaded object and nothing outside the 16 may
be able to reach it, even by accident.

### The prompt enumerates; it does not summarise

On the table questions the panel lists every row while the patient is talking. The first
version was a prose paragraph and it was wrong: it read smoothly but quietly dropped rows,
so patients answered three of six items and the fill looked broken. A form has to enumerate.
Each row is its own bullet, the labels are interpolated from the schema constants rather than
retyped - so a row added to the schema cannot silently go unasked - and the conditional layer
is stated up front in the same block ("for every product you do use, also say how long,
whether it helped, and any side effects"), which is what lets one reply complete a row
instead of leaving three blanks behind.

Row names appear verbatim: "OTC/Medicated Shampoos", not "oTC/Medicated Shampoos". An earlier
helper lowercased the first letter to read better mid-sentence and mangled every acronym; on
a clinical form the product name a patient sees must match the one the doctor reads.

On a single question there is no list, because the options are already on screen directly
above the mic. One line covers it: "say it in your own words, Hindi, English or a mix".

### A spoken answer does not close the card

A tap and a fill are not the same event. Someone who tapped an option watched themselves
choose it, so collapsing the card and opening the next one is exactly right. Someone who
spoke is being shown **a machine's reading of a sentence**, and has to be able to check it -
which they cannot do if the card collapses the moment it becomes answered, taking the
transcript with it.

So a fill suppresses that one auto-advance, through the same ref a correction uses, and the
way on moves into the report as a button. The suppression fires *before* the store is
written, because the auto-advance is an effect and by the time it runs the write has already
happened.

The report answers the only two questions the patient has, in this order:

- **What did it hear?** The transcript, first and always, including when nothing matched. A
  patient whose reply filled nothing needs to know whether they were misheard or
  misunderstood - those two have different remedies, say it again or tap it in, and a bare
  "nothing matched" hides which one they are in.
- **What did it write?** "Filled 4 of 7 answers - 3 still to go", counted in leaves so a
  nested table reports the facts the patient stated rather than the keys that changed. An
  invariant null is not counted: `past_treatment_describe` goes null the moment side effects
  are answered No, and calling that an answer would inflate the number.

### What a fill may not write, and where that is enforced

The route already validated the model's output against one schema slice.
`lib/voiceApply.ts` is a second gate, and it exists because two rules **cannot** be checked
on a stateless route:

| Rule | Where the knowledge lives |
| --- | --- |
| The onset age cannot exceed the age this patient gave | the session, not the request |
| `PCOS/PCOD` is closed to a male patient | the session, not the request |

Out of range is **dropped, never clamped**. "It started when I was 40" from someone who said
they are 34 is a contradiction, not a value to tidy; clamping it to 34 would answer the
question with a number nobody said and would look exactly like a correct fill. A closed
option is reported rather than swallowed - a male patient who says "PCOS" sees it named and
the reason given, from the same function that greys the option out on screen, so the
microphone and the thumb can never disagree about what is on offer.

While it is there it also does the structural check, and the strict version of it: a reply
may only write the fields **the answered question owns**. Not "any of the 16" - `consent` is
one of the 16, so that filter would have let a reply about hair-wash frequency carry
permission for a genetic test.

### Two hops, and only one of them is a model

```
mic → WAV (16 kHz mono, encoded in the browser)
    → POST /api/transcribe   (Sarvam Saaras, key server-side)
    → transcript, shown to the patient verbatim
    → POST /api/extract      (Gemini 3 Flash + ONE schema slice, temp 0)
    → Zod-validated patch → planVoiceFill → the controls above update → the patient checks
```

The model reads text, not audio, so something has to turn the recording into words before
it can read them. That is the only job the transcriber has: it produces a string, and every
decision about the *answer* is the model's.

### A microphone that cannot work stops being offered

Both routes answer 503 with a plain sentence when their key is absent. The client treats
that differently from every other failure, because it is the one that will never come right
by trying again: the patient is told once, on the card where they tried, no retry button is
offered, and a latch turns the row off for the rest of the page. A microphone that cannot
possibly work is worse than none - the patient waits, reads an apology, and has learnt only
that this form wastes their time.

The latch is deliberately not persisted. A key can be added between sessions, and a stale
"off" would hide a feature that now works.

### Three bugs that only exist in a real client

All three were found by the browser smoke, which drives the microphone with a fake capture
device and both hops stubbed. All three look, from the outside, exactly like the microphone
not working.

- **A spoken age reached the store while the box stayed empty.** React Hook Form seeds a
  field from `defaultValues` once, on mount. That was fine while typing was the only way to
  fill it. The form said "filled 3 of 3" over a blank age field. Both typed fields on that
  card now take a store value the box does not already represent - depending only on the
  store value, never on what is typed, which is what keeps the effect from fighting the
  keyboard.
- **The way to stop recording opened below the fold.** The row sits at the bottom of a
  card, so on a 390px phone the habits panel opened with "Stop and fill in" 130px past the
  bottom of the screen - a patient who has just started talking going looking for the way to
  stop. `scrollIntoView` is the obvious fix and it does nothing here: it walks up to the
  nearest scrollable ancestor, and a question card has two `overflow: hidden` wrappers that
  it treats as scroll containers, so the page never moves. It also knows nothing about a
  fixed app bar or a fixed actions row, so even against the window it tucks the target
  underneath one of them. The panel now scrolls itself, with the bounds read off those two
  elements - both change height with the comfort scale, and one is only on screen at some
  widths.

  The first attempt at that measured nothing, reproducibly, and the reason is worth keeping:
  it ran on a 150ms timer after the phase changed, and `AnimatePresence mode="wait"` unmounts
  the outgoing pane before mounting the incoming one - so at 150ms the wrapper still had the
  height of the 44px link that was leaving, and the tall panel was judged already in view.
  It now runs when the pane mounts, because mounting is the event; a delay chosen to
  approximate it is a delay that is wrong on some machine.
- **Q14's description was written and then immediately erased.** A spoken reply writes the
  yes/no and the description in the same commit, so `had` went true while the textarea still
  held the empty string it was seeded with; the effect that pushed that box to the store read
  it as the patient clearing the field and wrote null over the description that had just
  arrived. Unlike an age there is no draft to protect - every character of free text is a
  legal value - so the store now owns the text outright and RHF only mirrors it to produce
  the error message.

---

## What is still outstanding after a fill

A fill can answer eight fields and leave three blank, and those three used to be buried
inside collapsed rows the patient had to hunt for. Printing "3 things missing" and walking
away is a bad ending to an otherwise good moment.

**Completeness is described once, in `lib/followups.ts`.** Every outstanding field is a
self-contained descriptor - its own wording, control and options - and two things read the
same list: the grid, which reveals the detail inline underneath the row that unlocked it,
and `validateStep()`, which counts those descriptors to decide whether the question is
complete. A row therefore cannot look answered to one and unanswered to the other.

That list is derived from the answers rather than from the model's `unfilled`, which is what
makes it shrink identically whether the patient spoke or tapped.

There used to be a third reader: a guided flow that handed the outstanding fields over as
full-size cards, one at a time. It read well in isolation and it meant switching one row on
made the other four vanish - the patient lost the list they were working down. It came out;
the inline reveal was already the answer to the question it was answering.

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

## The review screen was showing the patient a stack trace

The last page listed what was outstanding by printing `validate()`'s `issues` array:

```
products.Oral Minoxidil.helped: required when used is true
products.Supplements.used: Expected boolean, received null
procedures.PRP/GFC/iPRF.done: Expected boolean, received null
```

Those strings are Zod paths and schema invariants. They exist so the DOWNLOAD can refuse a
malformed object, and they are exactly right for that job and exactly wrong for a person: a
patient reading "Expected boolean, received null" has been handed a stack trace.

`validateStep` answers the same question in the form's own vocabulary. It builds its list from
the `lib/followups.ts` descriptors, which are translated and which name the row rather than its
path - and it is the same list the section screens show, so the review screen and the section a
patient jumps back to cannot disagree about what is missing:

```
Hair products you use ->
  . OTC/Medicated Shampoos: choose one
  . Oral Minoxidil - did it help: choose Yes or No
  . Oral Minoxidil - side effects: choose Yes or No
```

The count above it was counting validator LINES rather than questions, which is how a form with
three unfinished questions reported "10 item(s) still need attention." - with the "(s)" doing
the work a plural should. It counts questions now, and there are two strings for the two cases.

**Making those strings patient-visible exposed one that had gone stale.** The row flags read
"choose Yes or No", describing a control that stopped existing when the flag was merged into the
row's option list: there is no Yes/No on those rows any more. It had been wrong since that
change and nobody could see it, because until now these strings only appeared in a section's own
quiet note. The descriptors say `kind: "options"` and the line reads "choose one". The genuine
yes/no follow-ups - did it help, any side effects - still say "choose Yes or No", because that
is still what they are.

---

## A checkbox list is not finished when it is answered

The accordion opens the next card as soon as the open one reports itself answered. On a single
choice that is the momentum the design is built on. On a checkbox list it was a bug: ticking
PCOS made the question answered, so the card shut and Health moved on - and picking PCOS AND
Thyroid meant answering the same question twice, reopening it in between.

`advancesOnAnswer` in `lib/sections.ts` is now the rule, and it excludes three kinds:

| kind | why it stays open |
| --- | --- |
| `multi` | answered after one tick, finished when the patient says so |
| `yesno_describe` | "Yes" plus free text becomes answered at the FIRST CHARACTER typed, so this was closing the box mid-word |
| `about` | three fields, and the only card in its section anyway |

`table` deliberately stays in the advancing set: a table is answered only when every row is, so
the tap that completes it genuinely is the last one.

Those cards get two things a self-advancing card does not need:

- **"Pick as many as apply"**, above the options, before the patient starts rather than
  discovered by trying. A checkbox list looks exactly like a radio list to someone who has not
  tapped twice, and single choices outnumber multiples in this form - so one tap and move on is
  the reasonable assumption to arrive with.
- **A "Done, next question" button**, which appears only once there is an answer to move on
  from AND a next question to move on to. An empty list with a done button beside it invites
  skipping a question nobody has read; skipping is still available through Next, which is a
  deliberate act rather than an accidental one.

  The second condition was a correction. The button was first handed to every card that does
  not advance by itself, with a fallback that focused the footer when the section had nothing
  left - so About You, the only card in its section, offered "Done, next question" with no
  next question behind it. A button that names something it cannot do is worse than no button,
  and the way on from the last card in a section is Next, which is already there and says
  where it goes.

Verified in the browser, ticking two conditions in a row with nothing reopened in between:

```
before             open, 6 boxes, 0 checked, hint shown, no Continue
ticked PCOS/PCOD   open, 1 checked, Continue appears
ticked Thyroid     open, 2 checked          <- the bug was here
after Continue     "How are your periods?"
```

---

## The row follow-ups were a third of a card apart

"Did it help" and "any side effects" inherited the 430px control column from the row above.
Inside a half-width flex child that column stretched: the label went hard left, the Yes/No went
hard right, and the question ended up a third of a card away from the buttons that answer it -
two short questions reading as four scattered pieces.

They are pairs now, packed left with a fixed gap, and the label sits 10px from its own control
at every width. Two things came out of measuring it rather than looking at it:

- **The tables get a narrower control column than the habits grid** - 290px against 430px - and
  that is not an inconsistency. What has to line up is the controls WITHIN one card, because
  that is the column a patient reads down. The habits card mixes a Yes/No, a three-option row
  and the four long smoking severities, so it needs the widest. Every row of the products table
  carries the identical four short options, so 430px there was 160px of nothing taken from the
  label - "OTC/Medicated Shampoos" was wrapping onto two lines to make room for whitespace.
- **The pair stacks by breakpoint, not by wrapping.** Letting it wrap on its own was the first
  attempt and it produced a ragged card at 390px: "did it help" fitted on one line and "any side
  effects", two words longer, did not - so two identical controls sat in two different shapes
  beside each other. Deciding it at `desk` means both pairs always agree.

Measured after: one distinct control left edge per card at 320, 390 and 1280px, no row label
wrapping, and nothing overflowing at any width.

---

## One required answer: the sex question

Almost nothing is required. The exception is sex, and it is worth setting out why it is not an
inconsistency.

Every other question can be left blank because a form that refuses to advance produces a guess,
and a guess is a wrong entry in a clinical record that nobody can distinguish from a real
answer. Sex is different in kind: it is not an answer so much as the thing that decides which
questions exist. Q6 (periods) and Q7 (pregnancy-related) are asked only of a female patient and
emitted as `null` otherwise - so without it the file a doctor opens carries two nulls that could
mean "does not apply" or "we never found out". One is a clinical fact. The other is a gap in the
record, wearing the same shape.

**It closed a real hole in the download gate.** `isResolved` treated the gated pair as answered
whenever `patient_sex !== "female"`, and `null` satisfies that test - so a patient who skipped
the sex question could answer everything else and unlock the download, emitting
`patient_sex: null` with two unexplained nulls beside it. Unknown is not the same as not
applicable, and the validator now says so.

Three surfaces enforce or report it, and only one of them blocks:

| surface | behaviour |
| --- | --- |
| About You's Next | disabled, with the reason on screen: "Please answer this one first - it decides which questions apply to you." |
| every other section's Next | unaffected, still free |
| the age beside it | never blocks, still reported as outstanding |
| the download | refuses, because the two gated questions are now genuinely unresolved |
| the review screen | lists About You as outstanding, and the row links to it |

The gate is keyed on the section CONTAINING the about step rather than on the section id, so
moving About You somewhere else cannot leave the rule pointing at the wrong screen. And the
button is never disabled silently - the sentence explaining it renders above the actions, which
is what the previous blanket gate was rightly criticised for not doing.

Measured, with nothing else answered:

```
About You, nothing answered   Next disabled, reason shown
after choosing a sex          Next enabled       <- the age is still blank
Your history                  Next enabled
Health                        Next enabled
Sample & consent              Next enabled
```

One thing the review screen needed for this: its outstanding links address steps by `step.id`,
not `step.key`. About You is the synthetic first step and has no key at all, and the two happen
to be the same string for the sixteen real questions - exactly the kind of coincidence that
works until the one row where it does not.

---

## Nothing else is required to move on

Next is never disabled. A patient can leave any question unanswered, walk through all six
sections, and reach the review screen with gaps in the form.

That is a decision about what this form is for, not a relaxation of standards. A hair-loss
intake asks about pregnancy, alcohol and smoking; some of those a patient will not want to
answer at a reception desk with somebody behind them, and a form that refuses to advance until
they do produces a guess rather than a blank. A blank is honest. A guess is a wrong entry in a
clinical record, and it is indistinguishable from a real answer by the time a doctor reads it.

What replaced the gate:

| | before | after |
| --- | --- | --- |
| Next while a section is incomplete | disabled | works |
| what the section says | "STILL NEEDED (3)" in warning colours, after a blocked press | "You can come back to these", quietly, once the patient has answered something |
| Shift+Enter to the next section | only when complete | always |
| the DOWNLOAD | gated on a complete, schema-valid form | unchanged |
| the review screen | lists every unanswered question | unchanged |

So nothing is lost except the argument at the bottom of the screen. The one thing that still
refuses is the download, which is the right place for it: an incomplete form is a fine thing
for a patient to have, and not a thing to hand a doctor as if it were finished.

Skipping About You is safe by construction rather than by luck - `isStepVisible` gates Q6 and
Q7 on `patient_sex === "female"`, so an unanswered sex hides them rather than showing two
questions that may not apply.

**The browser walk had been asserting the opposite**, in two places, and both had to be
inverted rather than deleted: it now checks that Next works with nothing answered, and that
answering the sex alone leaves About You reporting itself incomplete without blocking. Its
"section finished" signal also had to change - it used to loop until Next became enabled,
which is now true on arrival, so the walk hopped through all six sections answering nothing.
It reads `data-answered` instead, which is the fact it actually wanted.

---

## One control column

Every row of every grid puts its control in the same 430px column, left-aligned. Before, each
row sized its own: a Yes/No took its content width on the right, the hair-wash options asked
for a 190px minimum, and the merged smoking row asked for 320px. Nothing was misaligned by a
bug and nothing was aligned on purpose either - three different left edges down one card, with
the smoking options pushed far enough right that the last one wrapped underneath the first two.

Measured after: **one distinct left edge per card**, at every width, in both languages, with
nothing overflowing.

Three details that were arithmetic rather than taste:

- **430px, not 420.** The four smoking options measure 403px and three 6px gaps take them to
  421. At 420 the last one wrapped onto a line of its own - the kind of number that looks
  arbitrary and is not.
- **The 2px bleed is for the scrolling variant only.** `SegmentedRow` carried `-mx-0.5 px-0.5`
  so a focus ring on the first or last button would not be clipped by its overflow box. A
  wrapping row has no overflow to clip against, and keeping it there put those buttons 4px
  right of the Yes/No pairs in the same column.
- **The small Yes/No is a flex row, not a 2-column grid.** A grid in a 430px column stretches
  "Yes" and "No" to 206px each: two enormous buttons carrying two short words.

In Hindi the smoking row still takes two lines, because the translated severity labels are
wider than the column. It wraps, left-aligned, with no overflow - which is the correct
fallback rather than a failure.

---

## Four smaller corrections

**The word REQUIRED came off the table rows.** It read `{column} · REQUIRED` while unanswered,
so every control on the row moved sideways the moment the answer landed. Text appearing and
disappearing inside a flex row is a layout shift by construction - and with nothing required
any more, it was also no longer true.

**The raw JSON opens in a dialog** (`components/JsonDialog.tsx`) that scrolls inside itself,
capped at 82% of the viewport. As a `<pre>` appended to the review screen it turned a
two-screen page into a six-screen one, with the button that closed it somewhere off the bottom.
The smoke asserts the JSON is in a dialog, that the dialog's own box is what overflows, and
that Escape closes it - which it does, and which is how this found its own bug: the previous
inline `<pre>` let later clicks through and a modal correctly does not, so the next step in the
walk spent thirty seconds clicking a backdrop.

**The age floor is 16 again**, on the clinical point that androgenetic hair loss does not
present before puberty completes. `ONSET_MIN` moved with it, and `NumberStepper` now reads that
constant instead of declaring a local `5` - a local constant beside a shared one is a second
source of truth waiting to disagree, and it would have gone on offering an onset age of 5.

**The language toggle's thumb no longer travels across the page.** It used `layoutId`, which
implies `layout`, so framer-motion animated the element whenever its measured position changed -
and it measures against the VIEWPORT, not against the control. Anything that moved the toggle
made the thumb fly to its new home from wherever it had been. The landing screen's composition
is vertically centred, so it re-centres when its own height changes (the resume button appearing
after hydration is enough), and the toggle sits 177px lower there than in the app bar. That is
the "travelling from bottom to top" report.

It is now one element moved by a transform relative to its own layout box, which cannot depend
on where the control sits. Measured: the thumb is inside its group at both positions, and
switching language moves it exactly 40px.

The first diagnosis was wrong and worth recording. The obvious suspect was two mounts sharing
a `layoutId` - `useId()` is derived from tree position, and two pages can easily both produce
the same id. Probing it by exposing the generated id showed `_R_65btb_` on the landing and
`_R_2qclubtb_` on the intake: different, so that was not it. The 177px between them was the
real clue.

---

## Nested questions: one row, not two stages

A boolean gating an option list was asked literally - "do you smoke?", then, once you said
yes, "how much?" - and the first stage carried no information the second did not. Nobody picks
"Mild <5/day" without smoking. Every such pair is now one row with the negative among the
options:

```
before   [ Yes ][ No ]        then, revealed   [ Mild <5/day ][ Moderate 5-10/day ][ Severe >10/day ]
after    [ No ][ Mild <5/day ][ Moderate 5-10/day ][ Severe >10/day ]
```

**The JSON does not change.** This is a presentation merge and nothing else: `lib/schema.ts`,
`lib/types.ts` and the emitted output are untouched. `lib/apply.ts` maps a tap back to the
schema's own pair - "Mild <5/day" writes `{ smoking: true, smoking_severity: "Mild <5/day" }`,
No writes `{ smoking: false, smoking_severity: null }` - which are exactly the two states the
two-stage control produced. Verified three ways: unit tests that round-trip every option
through the mapping and back, a test that fills a whole form through `mergedPatch` and asserts
`validate()` reports **zero** issues, and the browser walk, whose output notes are unchanged
(`all 16 keys are satisfied`, `products rows: 5`, `answer keys: 17`).

Where it applies, and where it does not:

| question | before | after |
| --- | --- | --- |
| smoking + severity | Yes/No, then 3 options | `[No][Mild][Moderate][Severe]` |
| each product row: used + duration | Yes/No, then 3 options | `[Never][<3mo][3-6mo][>6mo]` |
| each treatment row: done + sessions | Yes/No, then 3 options | `[Never][1-3][4-6][>6]` |
| salon treatments + detail | Yes/No, then a text box | unchanged - a text box cannot be an option |
| Q14 side effects + description | Yes/No, then a text box | unchanged, same reason |

"Did it help" and "any side effects" also stay as their own rows. They are not points on a
duration scale, and folding them in would mean inventing combinations the schema has no
values for.

**Taps to fill the three merged questions**, for a patient who answers everything positively:

| | before | after |
| --- | --- | --- |
| smoking | 2 | 1 |
| 5 product rows | 20 | 15 |
| 4 treatment rows | 12 | 8 |
| **total** | **34** | **24** |

### What it cost, measured

The unanswered form got slightly TALLER, and pretending otherwise would be dishonest. A
collapsed two-stage row was a label with a Yes/No beside it; a merged row is a label with four
options, which on a phone need a line of their own.

| | before | after |
| --- | --- | --- |
| every question opened, 1280px | 6109px | 6156px |
| every question opened, 390px | 7877px | 8558px |

So: 29% fewer taps and one less stage, for 0.8% more height on a desktop and 8.6% on a phone.
That is the trade the change actually is. The height lands on the state a patient scrolls past;
the taps land on the state they work through.

Two layout details that were measured rather than guessed:

- **`basis`, not `shrink-0`.** The first version pinned the options to their content width, so
  on a 390px phone "Severe >10/day" sat off the right edge of the card and the hair-wash label
  was squeezed into a 140px column wrapping one word per line. Asking for 320px instead lets
  the options share the label's line when there is room and take a full line of their own when
  there is not - which is what allows their own wrapping to work.
- **10px of horizontal padding, not 14.** At 390px the smoking row has 280px to work in, and
  "Moderate 5-10/day" plus "Severe >10/day" came to 282px. Two pixels over, so they wrapped
  onto a line each and one row became three ragged ones. Four pixels per side brings the pair
  to 272px and the row to two even lines. The 44px minimum target height is untouched, which
  is what WCAG 2.5.8 asks for. At 320px it is still three lines, because four options that long
  cannot do better in 209px.

---

## React Hook Form, at the three fields that type

The form now uses React Hook Form, and where it does NOT is as deliberate as where it does.

The intake has exactly three inputs a patient types into: their name, their age, and the
side-effect description. Those are registered with RHF and validated by zod schemas in
`lib/formSchemas.ts`. Everything else is a choice control - a radio, a checkbox, a segmented
row - validated by `lib/steps.ts` against the published schema, which knows things a form
library cannot: that Q6 must be `null` unless the patient is female, that a table row's detail
columns must be `null` while its flag is false. Wiring those through a second validation layer
would add indirection without adding a check.

What RHF actually bought at those three fields, concretely:

| | before | after |
| --- | --- | --- |
| the age rule | re-derived inline in the component | one zod schema, one message |
| error state | three separate booleans | `formState.errors` |
| aria wiring | remembered per call site | from the field, via `TextField` |
| "not yet answered" vs "wrong" | conflated on the describe box | `touchedFields` |

**The describe box was scolding patients.** It showed "please describe the side effects" the
instant it appeared, before a character had been typed, because the condition was
`!answers.past_treatment_describe`. RHF's `touchedFields` is the distinction that was missing:
the message now waits until the patient has actually been in the box.

**Empty is valid at the field level, deliberately.** A blank age is "not answered yet", which
is a section-completeness question that `validateSection` reports and the download gate
enforces - not a field error. Colouring the box red the moment someone focuses it and types
nothing is the form telling them off for arriving. Out of range is a different matter and maps
to `null`, so the question stays unanswered rather than keeping the last good number.

`components/ui/TextField.tsx` exists because there were three hand-wired inputs and each
remembered a different subset of the job: one had `aria-invalid` and no `aria-describedby`, one
had a `<label>` and one an `aria-label`. Both fields now have real visible labels, so their
accessible name is the words on screen - which is what WCAG 2.5.3 is about, and which meant two
now-redundant `aria-label` strings came out of the dictionary.

---

## Icons, and one drawing

Added where a picture removes doubt or makes a list scannable, not as decoration:

- **six section icons** (`components/SectionIcons.tsx`), keyed by the schema's own section ids,
  in the sidebar and beside the section heading. A list of clinical categories with a glyph per
  row is how every health record a patient has seen presents itself, and on a six-item nav that
  is the whole job.
- **the six diagnosed conditions**, which is the one list a patient skims for the word that
  applies to them.
- **the three About You options**, where the icon carries the label at a glance.
- **one illustration** on the landing (`components/HeroArt.tsx`): a cross-section of skin with
  three follicles in it.

All of it is inline SVG rather than image files. That costs no network request on a clinic's
signal, stays sharp at any density, inherits the palette so it is correct in both themes without
a second asset, and has no licence to get wrong on a medical product. The illustration is also
desktop-only - on a phone the facts and the button already fill the screen, and an image above
them would push the only button below the fold at the largest text size, which is the exact
problem that screen was fixed for once already.

What it is NOT is a photograph. A model with good hair sets up the wrong expectation for an
intake form, and a stock doctor-with-clipboard says nothing the patient did not already know.
An anatomical drawing says "this is a clinical instrument", which is what this is.

---

## Making it shorter

The question count is fixed - sixteen, verbatim from the published schema - so what could
change is the space each one takes. Three changes, measured by opening every question in every
section and totalling the heights, on one build with the old layout re-imposed by an override
stylesheet so it is the same content both times:

| section | before | after | |
| --- | --- | --- | --- |
| About you | 773px | 542px | -30% |
| Your history | 1634px | 1423px | -13% |
| Health | 1793px | 1185px | -34% |
| Lifestyle | 1726px | 997px | -42% |
| Treatments | 2061px | 1096px | -47% |
| Consent | 1020px | 866px | -15% |
| **total, 1280px wide** | **9007px** | **6109px** | **-32%** |

On a 390px phone the total goes 9360px to 7877px, **-16%** - less, because two of the three
changes are desktop-only by design.

What did it:

- **Table rows put the label and the control on one line.** Stacked, the six habit rows came to
  about 660px; side by side they are around 380px. This is where the phone gain comes from too.
- **Option lists are two columns from `desk` up.** Six conditions at 70px each is 420px of
  one-item-per-row on a pane 700px wide, which is a phone layout being shown to a desktop.
- **The three About You options go three across** on a wide screen.

Nothing was removed and no tap target shrank below 44px. The largest text size still stacks
everything, through the `row-split` rule that already existed for exactly that case - at that
size there genuinely is not room for two columns.

---

## The app shell, and the breakpoint that caused all of this

A patient reported the desktop app rendering as a phone column. Five complaints came with that
screenshot, and four of them turned out to be the same architectural mistake: the layout was a
448px phone column with desktop rules bolted on at `lg`, so the chrome had nowhere to live
except inside the content.

**The breakpoint itself was the root cause.** Tailwind's `lg` is 64rem, which moves with the
user's font size, and a Windows laptop at 150% display scaling reports a viewport of roughly
1000-1100px to begin with. Between the two, an ordinary 1600px laptop can sit below `lg` and be
handed the mobile layout. The app now uses a `desk` token set to **900px in absolute pixels** -
`px` rather than `rem` on purpose, so a patient who scales their text up gets bigger text
rather than a different layout.

What replaced it:

| | before | after |
| --- | --- | --- |
| desktop layout | 448px column, centred in a void | fixed sidebar + 780px content pane |
| top chrome | inside a vertically centred column | `fixed`, one constant height |
| chrome geometry across the six sections | changed with each section | `0,81` on all six |
| section navigation | a decorative rail | fixed, full height, every step reachable |
| breakpoint | `lg`, 64rem, font-size dependent | `desk`, 900px, absolute |

`components/AppBar.tsx` is the bar, `components/SectionNav.tsx` the sidebar, and `SectionShell`
composes them. The bar carries only what is true for the whole session - identity, the three
accessibility controls, and progress - because anything that changes size with the question
puts the jump back.

### One heading, not two

The first version put the section name in the bar on a phone and in the page on a desktop,
which meant two `h1` elements with one of them `display: none`. That is valid and exposed
correctly to a screen reader, but the FIRST `h1` in document order was then the hidden one, so
anything reaching for "the heading" got an invisible element. The browser smoke found it by
hanging on `waitForSelector("h1")` for thirty seconds. There is now one heading, in the page, at
every width; the bar carries position ("section 3 of 6"), which the name does not.

### The progress bar was overstating progress

Segments used to be filled positionally - every segment before the current one drawn full. That
is fine in a wizard you can only walk forwards through, and wrong here, because the sidebar
lets a patient jump straight to Treatments. Doing so drew three full segments over three
sections containing no answers at all: a progress bar telling a patient they had finished work
they had not done, on a medical form. Each segment now reports its own section's
answered-over-visible, from the same counts the sidebar renders, and position is carried by an
outline instead of by fill.

### Two smaller things the measurements turned up

- **The viewport was changing width between sections.** The bar holds still, but the page was
  1440px wide on two sections and 1425px on the other four, because a scrollbar came and went
  with the content height - so everything centred shifted sideways as the patient moved through
  the form. `scrollbar-gutter: stable`.
- **The products and treatments tables showed English Yes/No on a fully Hindi page**, because
  the labels were passed to the control as literals (`noLabel="No"`) rather than read from the
  dictionary. The habits grid beside them was translated, so the same form disagreed with
  itself. Neither existing scan could see it: one looks for prose in JSX text, and the Hindi
  dictionary was complete. There is a scan for it now, and it earned its place by immediately
  reporting a second occurrence - which turned out to be the comment explaining the first, so it
  is comment-aware too.

---

## What came out, and what that cost

Four things were removed on instruction, and the removals are worth recording because two of
them deleted the more clever version of a feature.

**Voice.** The mic, the spoken checklist and the result popup - `SpeakFirst`, `VoicePanel`,
`ResultDialog` and the stage machine inside `VoiceMatrix` - came out, along with the dictation
button on the free-text field and the `npm run voice` harness. `/intake` lost 5.3 kB of
JavaScript with them. The server side was left untouched: `/api/transcribe` and `/api/extract`
still held the only copies of the keys, and `lib/extractPrompt.ts` and its tests still
described the schema slices.

**It came back, and not as it was.** Speaking is now offered on every question except
consent, as one row *underneath* the tap controls rather than a surface in front of them -
see "Answering by speaking, under the taps" above. The stage machine did not come back: there
is no speak-first screen, no result modal and no separate manual mode. What returned is the
part that was worth keeping, which is that the server side never left.

**The guided follow-up flow.** Answering "yes" to a product creates three more questions, and
the flow used to hand them over as their own full-size cards, one at a time. It read well in
isolation, and it meant that switching one row on made the other four vanish - the patient lost
the list they were working down. The detail is now revealed inline underneath the row that
unlocked it. `HabitsGrid` and `TableGrid` were already doing exactly that; the flow was a second
answer to a question that already had one.

**The age range picker.** Six decade cards under a field that already takes a number.

**`lib/followups.ts` did NOT come out.** It describes which fields a row owes, and it is what
`validateStep` counts to decide whether a table question is complete - so the grid and the
"still needed" summary cannot disagree about what is missing.

---

## The landing screen, in two compositions

Two measurements are the whole argument. At 1440x900 the landing was a 448px phone column
stranded in the middle of the viewport with 992px unused, and `mt-auto` on the CTA opened a
285px void between the last fact and the only button on the page - 204px of it on a 390px
phone as well.

| | before | after |
| --- | --- | --- |
| desktop composition | one 448px column, centred | promise left, facts panel and CTA right |
| unused desktop width | 992px | margins only |
| void between the facts and the CTA | 285px desktop / 204px phone | 45px / 20px |
| chrome anchored to the content box | no | yes |
| CTA in view at every size tested | yes | yes |

It is one dom in two compositions rather than two blocks toggled by breakpoint, so there is
one Start button in the page and one tab stop for it. Mobile is a flex column in reading
order; from `lg` up the root becomes a grid and the four children are placed into cells - the
promise spanning both panel rows so it centres against them.

**The CTA stays a child of the root.** `sticky bottom-0` can only travel inside its own
parent's box, so a CTA nested in the facts panel would have nowhere to stick and would
silently go static - and at the largest text size the content genuinely is taller than the
phone, which is the case the stickiness exists for.

**The void was fixed by moving the auto margin, not deleting it.** Deleting it puts the button
directly under the list and leaves 224px of dead space below it; splitting the slack evenly
leaves the button floating 130px off the bottom, out of the thumb zone. `mt-auto` on the
PROMISE sends all the slack above the title, so the facts and the button stay one contiguous
group anchored to the bottom. An auto margin is the right tool here specifically because it
resolves to zero when there is no free space: at the largest text size the layout degrades to
a plain scrolling column with nothing pushed off the top, which is what `align-content: center`
gets wrong.

Checked at nine viewports from 320x568 to 1920x1080, in both languages at all three text
sizes - 54 combinations - asserting no horizontal overflow, a CTA in view, nothing clipped
above the fold, and no void over 90px. Three of those widths are now in the smoke: 320px, and
1023/1024px either side of the breakpoint.

---

## The grouped intake: six sections, one question open

Seventeen screens of identical chrome is its own kind of fatigue, even when each screen is
easy. The form is now six category screens - the schema's own taxonomy, which is the one the
doctor reading the output already uses - and inside a section the questions are cards that
collapse as they are answered.

The design is specified in `docs/superpowers/specs/2026-09-01-grouped-intake-redesign-design.md`
and was built to `docs/superpowers/plans/2026-09-01-grouped-intake-redesign.md`.

### The pieces, and why they are separate

- **`lib/sections.ts`** answers every structural question - what is in a section, what this
  patient can see of it, how much is done, what to open next - and contains no copy and no
  language. "Answered" delegates to `validateStep`, so a section and the question inside it
  can never disagree about whether it is done.
- **`lib/summary.ts`** owns what a collapsed card says. Short labels are new content, not
  truncation: "Has a doctor diagnosed you with any of these?" cannot be ellipsised into a
  52px row and stay readable.
- **`lib/multiSelect.ts`** owns what a checkbox tap does, including the exclusive-option rule:
  two copies of "None of these clears everything" would drift, and the drift would be
  `["Anemia", "None"]` in a clinical record. It was `lib/keymap.ts`, which also turned key
  presses into intentions for a layer of custom shortcuts (`1`-`9` to select, `Enter` for the
  next question) documented by a legend in the sidebar. Both are gone: the reasoning for the
  legend was that a shortcut nobody knows about is not a feature, and the honest conclusion
  from that, for a patient filling in a form on a phone, was to remove the shortcuts rather
  than to keep advertising them. Ordinary keyboard access never depended on them.
- **`QuestionCard`** renders one question in one of three states and reuses `QuestionBody`
  for its open contents - the same component the review screen's edit dialog renders. Three
  surfaces, one implementation of "what does `type: multi` look like".

### Two rules that shaped the interaction

**Answering opens the next card; it never navigates.** This is not the auto-advance that was
removed: nothing leaves the screen, and the answer stays visible as a summary. On the
keyboard, though, selecting and moving on are deliberately two different keys. A keyboard
repeats, and "2 2 2" would answer three questions in a row with each one scrolling out from
under the patient - the same hazard, through a different input device.

**A correction stays put.** Reopening an answered card and changing it does not jump forward.
First pass wants momentum; a correction wants to stay where it is. Both halves are asserted
in the browser smoke.

### Four bugs this work surfaced, and how

Worth recording because of what caught each one.

1. **An invisible tick.** `--done` was added as a CSS variable but never registered as
   `--color-done` in Tailwind's `@theme`, so `bg-done` did not exist and a white tick sat on
   a white card. Found by looking at a screenshot; no test could have seen it.
2. **No `h1` on any section screen.** The smoke printed `(no h1)` beside every step and it
   was nearly read past. A screen with no heading leaves a screen-reader user nothing to
   orient by. The section title is the `h1` now, with cards as `h2`.
3. **`aria-pressed` versus `aria-checked`.** The first "is this answered?" probe inspected
   controls, and Q1's decade buttons use `aria-pressed` while options use `aria-checked`, so
   it read false forever. The page already knew the answer, so the card exposes
   `data-answered` for whether the question has a value and `data-state` for how it is
   displayed. Two attributes because they are two different facts.
4. **"Rendered fewer hooks than expected."** The rail's progress `useMemo` was placed below
   the review screen's early return, so it ran on five branches and not the sixth. The smoke
   caught it on the run immediately after, which is the entire reason that file exists.

### A measurement bug in the verification itself

The Devanagari clipping guard compared `getClientRects()` against
`getComputedStyle().lineHeight`. Those are not the same unit under CSS `zoom`: rects come
back in post-zoom device pixels while the computed line-height stays pre-zoom CSS px. At the
largest comfort scale the guard therefore reported nineteen clipped lines that were perfectly
fine. Dividing the ink back down by the zoom factor gives zero, and the correction is now in
the smoke with the reasoning beside it.

It also found one real fault while being fixed: the language toggle's `हिं` label used
`leading-none`, and on an ENGLISH page the Devanagari leading rules do not apply, so it sat
in a 12px line box with no room for its matras.

### Three gaps between the spec and the build, found by asking

Worth recording that the redesign was reported finished twice before it was, and what closed
the difference was going back to the spec line by line rather than trusting the sense of
being done.

1. **The landing page still promised "one per screen, in order".** The app had not worked
   that way since the first section landed. A screen that describes a version of itself that
   no longer exists is worse than one that says nothing.
2. **The live-region announcement was specified and never built.** Focus deliberately does
   not move when a tap opens the next card, and the other half of that decision - something
   has to SAY a new question appeared - was missing. A screen-reader user answered a question
   and the form went silent while the next one rendered below them.
3. **The review screen was never made two columns**, though the spec called for it. At 1440px
   it now reads in 1.5 screens instead of three.

### The age question is a field, and voice is an offer

Two changes with the same reasoning behind them: the thing every patient can do should be
the default, and the clever thing should be the shortcut.

**The age is typed.** It was decade cards plus a slider, which is a nice interaction and the
wrong default for a fact the patient knows exactly - picking a range and then nudging a
slider to reach 34 is three interactions to enter two digits. Now it is a labelled field with
a numeric keypad, and the range cards sit underneath as a quieter shortcut for anyone who
would rather not type or does not know their age precisely.

`inputMode="numeric"` on a `type="text"` input, deliberately. A number input brings spinners
nobody wants on a phone, accepts "1e5", and reports an empty string for invalid input so a
typo cannot be told from a blank. Text plus a numeric keypad gives the keypad without any of
that, and the handler strips non-digits and leading zeros so the box never shows "007".

Two numbers where there used to be one: `AGE_MIN` is 1 and `AGE_MAX` is 100, because
refusing a number for being unusual is how a form tells a 96-year-old they do not exist,
while `ONSET_MIN` is 5 for the hair-loss onset question. `maxOnsetAge` used to floor the
onset ceiling at `AGE_MIN`, which was only correct while that happened to be 16.

**An out-of-range box means NOT ANSWERED.** Committing only valid values sounds safer and is
worse: type 600 over a stored 60 and the screen shows 600 with an error while the form quietly
keeps 60, counts the question answered, and lets the patient leave. `setAge` therefore takes
`number | null`, and the section becomes incomplete until the field is fixed. The smoke
asserts it, typing "6a0" then appending a zero.

**Voice is secondary, and it is one line.** This is where that decision was taken, and the
shape it produced is the shape the feature has now that it reaches every question: one 44px
row, a mic glyph and "Answer by speaking", under the controls rather than in front of them.
The full argument and the two shapes it replaced are in "Answering by speaking, under the
taps" above.

### Verified

Six sections in both languages at all three text sizes, on a 390px phone and a 1440px
desktop: no horizontal overflow, no clipped Devanagari, chrome that agrees with its column,
and no focusable control hidden behind the footer.

**Voice was verified with a real microphone.** A standalone harness drove Chromium's fake
capture device with a synthesised WAV, so the recorder, the Sarvam request and the extraction
were all real: one spoken sentence filled **6 of 6** habit rows including the layered
follow-up, and "about ten a day" landed on "Moderate 5-10/day". That harness was removed with
the UI it drove; the checks that replaced it live in `npm run smoke`, which drives the same
fake device with both network hops stubbed and asserts what happens *after* the payload
arrives - see the two bugs it found, above.

**The numeric boundaries, probed live** against the running extract route: 3/day to
Mild, 5/day and 10/day to Moderate, 12/day to Severe. The 10/day case had been noted as
outstanding for a while; it was not.

---

## Two decisions about how an answer gets committed

### Nothing auto-advances any more

Tapping an option on a single-select or a yes/no used to write the answer AND move to the
next question after a 180ms beat. It turned a 16-question form into 16 taps instead of 32,
which is a real saving, and it was the wrong trade for a medical intake.

The costs are not symmetric. One extra tap is a mild inconvenience. A mis-tap that both
records an answer and leaves the screen is a wrong answer in a clinical record, on a screen
the patient has already left - and the thumb-sized targets that make the form easy to use
are the same targets that make a stray tap likely. So every question now shows **Next**,
the answer is selected and confirmed in two separate actions, and `hideNext` is gone.

The smoke test asserts the new rule directly on both kinds - after picking an option the
heading must be unchanged and Next must be enabled - because "does not advance" is the sort
of behaviour that a future convenience change would quietly undo.

### Corrections happen on the review screen, not back in the form

Tapping a row on the review screen used to navigate into the wizard at that question. That
is the obvious implementation and it is wrong at the end of a form: a patient checking
sixteen answers wants to change ONE, and being dropped back into the wizard loses their
place, with the only way out being Next through everything after it or a Back button that
reads like undoing.

So a row now opens that single question in a dialog over the review screen. Answer it, tap
**Done**, and the row updates underneath. Structurally that meant extracting
`components/questions/QuestionBody.tsx` - the `step.kind` switch that used to live in the
wizard page - so both callers render the same controls. Two implementations of "what does
`type: multi` look like" is exactly the kind of duplication that drifts apart.

Three details worth the words:

- **The three table questions open on the grid.** Both surfaces render the same controls,
  and the correction dialog deliberately has no microphone on it: someone who tapped one row
  to fix it should not be offered a way to describe all six items out loud again.
- **Done is never blocked.** If the question is still incomplete the dialog says so and
  still closes: the patient opened it to make a correction and must be able to get out. The
  review row then reads "not answered yet" and the download stays disabled, which is the
  same truth told where they can already see it.
- **About You needed a row of its own.** It had never been in the review list, because the
  old jump-into-the-wizard behaviour let Back reach it. With editing in place that path
  disappeared, so sex and age are now a row like any other - which is more honest anyway,
  since `patient_sex` and `patient_age` are in the JSON the doctor receives.

---

## Bilingual, without a second app

The form is English or Hindi, chosen with a header switch, and the whole screen commits to
one language. That decision came first and everything else follows from it: no bracketed
second language after each label, because a form that says everything twice is harder to
read in both languages than one that picks a side.

### Presentation, not data

The rule the whole implementation exists to keep: **no answer is ever translated.**

`lib/schema.ts` is the contract with the doctor, so a patient who taps `अनियमित हैं` stores
`"Irregular"` and the downloaded JSON is byte-identical whichever language was used.
`optionLabel(option, lang)` maps English to Hindi for display and is never applied in
reverse - the Hindi label is not a key, so nothing can round-trip Devanagari back into the
answers - and nothing in `lib/i18n.ts` imports or touches `Answers`.

The smoke test asserts both halves of that on the review screen: no Latin words left
(allowlisting PCOS, PRP, the product name), and no Devanagari in `sessionStorage`.

### How a missing translation fails

The first pass at this shipped three leaks: "You did not mention (3)" and "…and 2 more" in
the post-voice result, and an "N item(s) still need attention." template on the review
screen. None were found by walking the app in Hindi, because at the time the runtime walk
could not reach the states behind the microphone at all. They were found by reading the
source, so that is now a test - and the walk reaches those states too now, by stubbing both
network hops rather than needing a key.

The real failure mode of a bilingual form is not a clumsy sentence, it is one English
sentence surviving on an otherwise Hindi screen - which is precisely the sentence the
patient needed. Two mechanisms catch it:

- **The type system.** Every Hindi dictionary is `Record<keyof typeof ENGLISH, string>`, so
  adding a question, an option or a UI string and forgetting the Hindi is a compile error.
  This is why component strings moved out of the components: a string that stays inline is
  a string that stays English.
- **`tests/i18n.test.ts`**, for what types cannot see: a schema option with no entry, a
  Hindi value copy-pasted from the English, a dropped `{placeholder}`, a "Hindi" title with
  no Devanagari in it, and a schema walk that would silently pass if it stopped matching
  (it asserts it found more than 45 options).

That last one matters more than it looks. The first version of the walk found zero strings
because of a quoting difference in the schema file, and every "no missing translations"
assertion passed perfectly.

### The type

**Plus Jakarta Sans** for Latin, **Hind** for Devanagari, one stack, and headings that
differ from body text by weight and tracking rather than by family.

That replaced a system-font stack with a serif for the questions, and the reasoning for
that stack was real: nothing downloads faster than a font already installed, and the one
screen a patient in a clinic queue must never see unstyled is this one. What changed is the
mechanism, not the priority - `next/font` fetches both faces at BUILD time, self-hosts them
from our own origin, subsets them and preloads them. No third-party request, no runtime
dependency on Google, no flash of unstyled text.

Dropping the serif also fixed something that had been wrong since the app became
bilingual: `Georgia` and `Palatino` have no Devanagari at all, so every Hindi heading was
already falling back to a sans while its English twin was a serif. The two languages did
not look like the same product. One family across both scripts is what makes them look
designed together rather than translated.

Hind is from Indian Type Foundry and drawn for UI text at small sizes in Indian languages,
which is exactly the job: 13px option glosses on a cheap phone. Jakarta has no Devanagari
glyphs, so the browser falls back per character, and the two faces sit at compatible
weights and x-heights - which is why there is no longer any language-specific font rule.

Two numbers were measured rather than picked: body text gets `-0.006em` of tracking because
Jakarta ships wide enough to read loose in a paragraph, and headings get `-0.021em`, since
negative tracking is a function of size and a 13px gloss must keep all of it.

### Devanagari does not fit a Latin line box

The bug that made this visible: in Hindi, the tops of the matras on "हाँ" and "नहीं" were
sliced flat, and so were the ones on the question titles.

Measured rather than guessed. Against the platform Devanagari face, an 18px line paints
24px of ink where Tailwind's `text-lg` allots 28px - two pixels of clearance top and
bottom, which is inside the rounding error of a different font version, a different device
pixel ratio, or Chrome clipping painted text to the inline box. The 25px question title was
worse: 33px of ink in a 30.5px box from `leading-[1.22]`, so it did not merely risk
clipping, it overflowed.

Every line-height in the app had been chosen by eye against English, and 1.2 is a normal
English heading and a cramped Devanagari one. So `<html lang="hi">` - which LangToggle
already sets for screen readers - now also drops the Latin-tuned leadings:

```css
:root[lang="hi"]   { line-height: 1.65 }
:root[lang="hi"] * { line-height: inherit }   /* ignore every leading utility */
```

`* { line-height: inherit }` is blunt on purpose. It is the only way to say "these
utilities do not apply to this script" without listing them, and listing them is how the
next one gets missed - which is exactly what happened when I tried: a heading rule at 1.42
still clipped, 1.55 fixed the 25px title and left the 23px review heading at 94% of its
line box, because Devanagari ink does not scale as neatly with size as Latin does. Headings
now inherit the same figure as everything else, and a Hindi question is airier than its
English counterpart, which is simply what the script wants.

The guard is in the smoke test rather than a unit test, because whether a glyph fits
depends on the font the platform picked, which no unit test can see. It walks every text
node on the Hindi review screen, compares the ink of each rendered line
(`getClientRects()`) against the computed line-height, and fails above 95%. It forces the
Windows Devanagari face first, so it measures the metrics a patient's phone will use rather
than whichever fallback the test box happens to have. That check found a heading my own
by-hand audit had missed.

### The parts that are not just strings

- **Named placeholders, not positional.** `Question {n} of {total}` becomes
  `{total} में से सवाल {n}` - Hindi puts the total first, so `fill()` substitutes by name.
- **The voice follows the language.** `lib/speak.ts` asks for `hi-IN` and tries the
  language family (`hi-`) before any fallback, because reading Devanagari with an English
  voice is worse than not reading it at all. `<html lang>` is set too, which is what a
  screen reader uses to pick its own voice.
- **Two things stay English on purpose.** The patient's free text is never touched -
  translating what someone typed is putting words in their mouth - and the extraction
  prompt stays English, because the model's job is to map a Hindi transcript onto English
  schema options. That path already worked: Sarvam transcribes Hindi and codemix, and the
  model was always producing English labels.
- **Clinical words patients say in English stay in English.** मिनॉक्सिडिल, थायरॉइड, PRP.
  Replacing them with unfamiliar Sanskritised coinages would make the form harder to read,
  which is the same call the English copy makes about jargon.

### One thing found by testing rather than reading

The language switch is a `radiogroup`, so a smoke-test locator looking for the first
`role="radio"` on the page clicked **EN** instead of an answer and quietly reverted the
form to English mid-walk. The fix was in the test (scope answer lookups to `<main>`), but
it is worth recording: the header now holds controls that look exactly like answers to
anything selecting by role alone.

---

## Personalisation: the form learns who it is talking to

A form that treats a 22-year-old and a 68-year-old identically has quietly optimised for
the 22-year-old, because that is who the person building it can picture. So the first
screen - before question 1 - asks three things, and every one of them has to pay for
itself by changing something downstream. Asking for personal detail and then doing nothing
with it is worse than not asking.

```
About You  ->  name (optional)   on-screen copy only, never in the output
               sex               gates Q6/Q7, emitted so nulls are explainable
               age               text size + tap size, Q1's ceiling, Q6/Q7 suggestions
```

All of it lives in [lib/patient.ts](lib/patient.ts), which is pure - so every rule has a
test and none of them can hide inside a component.

### Why it is the FIRST screen and not the fifth

The sex question used to sit immediately before section B, because its only job was gating
Q6/Q7 and asking a stranger their sex up front felt abrupt. Adding age forced the move: the
age decides how big the type is, and a form cannot resize itself at question 6. Once it had
moved, the abruptness turned out to be solvable with copy and a name field rather than with
placement.

### The comfort scale, and why it is a question

55 offers 12% larger, 70 offers 26%, and the **Aa** button in the header sets it directly
at any time - after which nothing offers anything again, because a default that keeps
overriding a deliberate choice is a bug with good intentions.

It began as an automatic default: enter 60, the screen grows. That demoed well and was the
wrong call. Resizing the whole form under someone who did not ask for it is a thing being
done TO them, and a 60-year-old with good eyesight reads it as the app deciding they are
old. So it asks - once - and applies nothing until answered.

Three things make the prompt fair rather than an obstacle:

- **It previews both sizes.** "Larger text" is an adjective; two lines of a real question
  from the form, rendered at the two scales with the same factor the app applies, is the
  actual choice. The patient is comparing things they can see.
- **Both answers are one tap and equally weighted.** "No, keep it as it is" is a button,
  not a dismissal X in a corner, and Escape and the backdrop record that same answer -
  every exit is an answer rather than a deferral.
- **It asks once.** `comfortAsked` is tracked separately from `comfortChosen` for exactly
  one reason: declining leaves the scale at standard, which is indistinguishable from never
  having been asked unless it is recorded. Without that flag the prompt returns on the next
  render and becomes the thing patients tap past without reading.

The offer is also held back 500ms. An age can be set by dragging a slider through 55, and a
dialog that appears mid-drag has interrupted the control the patient is using; half a second
of stillness means they have arrived at an age rather than passed through one. It is
deliberately not scoped to the About You screen either - a fast patient can tap "55-64" and
**Next** inside those 500ms, and one screen late beats never.

The prompt is mounted at page level rather than inside the section shell, because a
`position: fixed` overlay inside framer-motion's animating question wrapper positions itself
against that transform instead of the viewport.

Two decisions inside that:

- **Page zoom, not a font-size scale.** Zoom reflows and scales the tap targets too.
  Larger text on 44px controls helps someone who cannot see the screen and does nothing
  for someone whose hands shake, and shaky hands are the more common reason a form gets
  abandoned halfway. Zoom is also what browser zoom does, so it is a proven interaction.
  The one cost is that `min-h-dvh` measures the viewport *before* zoom, so it is divided
  back out in one CSS rule - the alternative was retiring dynamic viewport units app-wide.
- **It is stored with the answers, in sessionStorage.** Comfort is derived from this
  patient's age, so the next person to pick up a shared clinic phone must not inherit it.
  Forgetting it is correct behaviour, not a missing feature.

### A name asked for is a name shown back

The first version collected a first name and then used it in exactly one place: the
"continue where you left off" button, which a first-time patient never sees. That is the
worst of both worlds - the patient paid the cost of typing it and got nothing back, and the
field reads as collection for its own sake.

It now appears three times and nowhere else: echoed under the input as it is typed
("Thank you, Asha"), carried into question 1 as a welcome, and closing the review ("All
done, Asha"). Question 1's read-aloud speaks the welcome as well, because the speaker
button's contract is that it reads what is on the screen - a patient who cannot see the
screen must not be getting a different form.

Two details worth the words. The echo is a single paragraph that changes its text, not two
that cross-fade: the animated version waited for the old line to exit before mounting the
new one, so the acknowledgement arrived most of a second after typing stopped and read as
lag rather than as a response. And the welcome sits on question 1 rather than on the screen
where the name was typed, so it reads as the form carrying something forward instead of a
field congratulating itself. `tests/patient.test.ts` covers both the named and the
skipped-name paths, and the smoke asserts all three appearances.

### The bound that makes the age question clinical rather than cosmetic

`maxOnsetAge()` caps Q1 at the patient's current age. Without it a 45-year-old can slide
"my hair loss started" to 60, and that reaches the doctor looking like a fact rather than a
slider mistake. Lowering the age afterwards also pulls an already-recorded onset age down
(`clampOnsetAge` in the store), because the alternative is a stale answer that is now past
its own validation bound.

### Closed options, and the one that must stay open

Some options cannot be true for the patient in front of us, and there are two of them:

- **PCOS/PCOD for a male patient.** A disorder of the ovaries. This is not untidiness,
  it is a route to a diagnosis in the output that cannot be true.
- **An onset decade later than the patient's current age.** Arithmetically impossible.
  The slider was already bounded by `maxOnsetAge`; the decade cards above it were not, and
  the comment in `NumberStepper` claimed they were. Tapping "50+" at 25 clamped silently to
  25, which is indistinguishable from the app ignoring the tap.

Both are now **shown, greyed, and unpressable, with the reason stated** - not removed.
Removing them is the tempting version and it is worse: a patient who came in believing they
have PCOS needs to see that the form considered it and why it is closed, rather than find
the option missing and wonder whether they answered something wrong earlier. On Q1 it also
means the grid does not reshuffle under a thumb as the age changes.

`aria-disabled` rather than `disabled`, because a `disabled` button is skipped by screen
readers entirely - which would hide the option *and* the explanation. The block is enforced
in three places: the rule (`optionUnavailable`, pure and tested), the card (no handler), and
`MultiChoice.toggle` (an early return, in case a future caller forgets to pass the map).

Correcting the sex afterwards also **strips a stored PCOS/PCOD answer**, the same reasoning
as `clampOnsetAge`: an answer the form now refuses to offer must not survive in the output.
The smoke test walks that whole chain - PCOS open for a female patient, recorded, then gone
from `sessionStorage` the moment the sex switches to male.

One option is deliberately left open at every age: **"Menopausal" on Q6.** Premature ovarian
insufficiency is real, and a form that refuses to record it because the patient is 29 has
decided it knows more about her body than she does. The test says so, so nobody "fixes" it
later.

### Suggestions, and the line they must not cross

Q6 offers *Menopausal* to a patient of 52+; Q7 offers *Not applicable* to 50+. Both are
rendered as a prompt the patient taps to accept, and `tests/patient.test.ts` asserts that
`suggestionFor()` does not touch `answers` at all. A suggestion someone accepts is help; an
answer nobody read is a fabricated medical record, and on a form that a doctor will act on
the distinction is the whole point.

This also replaced a genuinely bad inference. The old version guessed from
`age_hair_loss_began` - "your hair loss started after 50, so you are probably
post-menopausal" - which is a weak proxy wearing a helpful hat. With a real age it is an
honest offer.

### What made it stop looking generated

Not personalisation exactly, but the same complaint:

- **The questions are set in a serif** (a system stack - no webfont to download on a bad
  clinic connection), with the question number in a small badge pinned to the title's first
  line. That badge is the third attempt. A watermark numeral behind the title was muddy,
  because directly behind the first word of a question is precisely where you cannot afford
  noise; a numeral above a hairline rail replaced it and then failed at the largest scale,
  where a three-line title left the rail running down beside it looking like a stray tick
  mark. A badge is the same shape at every scale, which is the property that actually
  mattered.
- **Validation stopped nagging on arrival.** The outstanding list used to render the moment
  a question appeared, so a patient reaching Q1 was told in warning red that something was
  missing before they had done anything. It now waits until they press a blocked **Next**
  (the disabled button passes the tap to its wrapper) or return to a step they have already
  been through. The smoke test asserts both halves: silent on arrival, explicit once asked.
- **The review screen stopped printing field names.** Every row read `AGE_HAIR_LOSS_BEGAN`
  over the answer - the identifier a developer needs, shown to a patient on the final
  screen. It now reads the question back in the patient's own words, and the keys stay
  where they belong, in the JSON below.

### The one layout that could not survive the largest scale

Zoom shrinks the usable width in CSS pixels: a 380px phone becomes 301, and inside a
padded card a table row's label was left with about 110 of them beside its fixed 124px
Yes/No pair. "Topical Minoxidil (solution/foam)" then shredded into five lines next to two
buttons, which was the ugliest thing in the app at 26%.

At that scale only, the row stacks - label first, full-width control under it - through two
CSS rules keyed on `data-comfort` rather than a media query, because the trigger is the
patient's chosen scale and not the device. Same markup, same components, and the
two-column version is untouched at the sizes where it reads well. The landing screen got
the same treatment from the other direction: its **Start** button is now sticky rather than
merely bottom-aligned, because at 26% the intro is taller than the viewport and the only
button on the screen had fallen below the fold.

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

## Voice pipeline: every question except consent

```
mic → WAV (16kHz mono, in-browser)
    → POST /api/transcribe   (Sarvam Saaras, key server-side)
    → transcript
    → POST /api/extract      (Claude Haiku 4.5 + ONE schema slice, temp 0)
    → Zod-validated patch → planVoiceFill → the store → the controls above update
```

**Audio format.** MediaRecorder gives you `webm/opus` on Android Chrome, `mp4` on iOS
Safari, `ogg` on Firefox - so shipping the raw recording means iOS and Android fail
differently, and only in production. `lib/audio.ts` decodes whatever was captured and
re-encodes 16kHz mono WAV in the browser. One format reaches the server, speech models
want 16kHz anyway, and the upload drops to ~32KB/s, which matters on clinic 4G.

**Slices, not the whole form.** The model never sees 16 questions. Per question it gets one
slice of the schema and one reply. That small output space is why temperature 0 extraction is
reliable enough to trust here - and small enough that a human can check the prompt by eye.

There are sixteen slices now rather than four: the four tables, the four single choices, the
four multi-selects, the two yes/nos, the onset age, and About You. Six are built by three
small factories (`singleSlice`, `yesNoSlice`, `multiSlice`) which read their options **off the
schema by key**. That is not tidiness. The alternative was passing the aliases in `lib/types`,
which reach the schema *by position* - `S[0].questions[1].options` - and handing the wrong one
to a slice is a mistake nothing would catch: the model would be shown one question's options
under another question's name, answer it perfectly, and every value would be dropped as
off-schema. It would look like a broken microphone. A keyed lookup makes the mistake
unavailable, and a test walks the schema to prove each slice shows its own options.

**Multi-selects carry two fields, not one.** `selected` and `none_apply`, because "nothing
applies to me" is an answer and an empty list is not. `selected: []` with `none_apply: null`
means the reply said nothing about the question and the card stays unanswered; `none_apply:
true` means the patient denied all of it, which lands on the schema's own denial option
("None", "No known family history") or, on the two questions that have none, in the UI-only
`explicitNone` set. Collapsing those two states into one empty array is how a form ends up
recording "no diagnosed conditions" for a patient who was never asked.

**Model choice was measured, not assumed.** An earlier revision ran on NVIDIA's free NIM
build and scored 56-58/58 on the fixture eval, so quality was never the issue. What ruled
it out for a patient-facing screen: the brief's own suggested
`meta/llama-3.3-70b-instruct` returns **410 Gone**, `openai/gpt-oss-120b` took **94-120 s**
per call, and the survivors each had their own request-shape quirks that are hard 400s.

**And then it stopped being a choice at all.** The model and the temperature are constants
in `lib/llm.ts` - not defaults, constants - because on a medical form the same reply has to
fill the same fields every time or the output cannot be audited, and "which model read this
patient's words" should have one answer you can read off the source rather than one that
depends on a deployment's environment. `tests/llm.test.ts` sets `GEMINI_MODEL` and
`GEMINI_TEMPERATURE` anyway and asserts the request on the wire is unchanged.

**And then the provider moved, which is the part worth recording.** The Anthropic key
stopped authenticating mid-session: a flat `401 authentication_error`, the one failure no
amount of measurement protects against and no amount of code can retry its way out of.
Extraction runs on `gemini-3-flash-preview` now.

The new model was probed rather than trusted, against the account's own model list and this
app's own prompt: `temperature: 0` accepted, bare JSON via `responseMimeType`, the Hinglish
probe correct ("din mein 6-7 ho jaati hai" to `Moderate 5-10/day`, with the unmentioned
field left null), 2.8s for a full habits slice, and **69/69 fields on the fixture eval**.

One thing had to be learned the hard way. **Thinking tokens come out of `maxOutputTokens`.**
The first version set 2048, reasoning about the output alone, and two of twenty fixtures came
back as "unparseable model output". The JSON was not malformed - it was cut off. A products
slice writes 153 tokens of answer after 1357 tokens of thinking, and a truncated object
parses as nothing, so the patient would have read "nothing in that reply matched this
question" about a reply the model had understood perfectly. The budget is 8192 now, and a
`MAX_TOKENS` finish reason throws with both token counts in the message rather than handing
back a string that cannot parse: the failure names itself instead of arriving as a mystery.

`-preview` in a pinned id is a known cost, worth stating rather than hiding: a preview model
can be withdrawn. The pin is still right, because an id that moves under a medical form is
worse - and a withdrawn model answers 404, which `isConfigError` turns into "auto-fill is
off" rather than a retry loop.

Pinning also **deleted** code rather than risking any. There used to be a runtime
negotiation: send `temperature`, catch the `400 temperature is deprecated for this model`,
remember that this model refuses it, retry without it. It existed because the first Anthropic
build shipped that 400 to the browser as a bare 502 - and it existed to survive a model this
app no longer lets anyone select. With one model, known to accept everything sent, a failure
is a real failure and the right response is to let the patient tap, not to try again with
less. The eval calls the same `callModel()`, so it measures production by construction rather
than by two configurations being kept in step.

The id is pinned exactly rather than to an alias, for the same reason: an alias moves, and
extraction behaviour that changes under a medical form without a code change is not
auditable.

**Latency is designed for, not wished away.** Measured 8-19 s per slice on the free tier. So
the route allows 28 s (`maxDuration` 60), the panel counts the seconds upward while
recording, and "taking a while - you can also tap below" appears on its own after six seconds
of waiting. A static spinner at 19 s reads as frozen; a ticking number reads as working.

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

**Voice is never a dead end.** The tap controls are *always* mounted, above the row, before
and after recording. There is no "manual mode" to switch into - a mic denial, a missing API
key, an unparseable model reply, or a patient who just prefers tapping all land in the same
UI. Both routes return a plain-language 503 when their key is absent, which the client treats
as "not set up here" rather than "try again": said once, no retry offered, and the row turns
itself off for the rest of the page. The row also never renders at all if the browser has no
usable MediaRecorder.

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
unresolved becomes a link that opens that question in a dialog on the review screen, not an
error message.

The gating rule and the Q14 conditional are re-checked in `validate.ts` independently
of the UI, so a bad extraction patch can't bypass the interface.

---

## What's tested, and what deliberately isn't

**`npm test` - 259 deterministic tests, no API key needed.** These are the dependable
checks: the step builder, sex gating in all four states, every conditional-followup
rule in both directions, exclusive options, 16-key coverage, the personalisation rules
(comfort thresholds, the onset-age ceiling, and that a suggestion never writes an answer),
and - most of the value - the slice layer fed what a model *actually* returns: markdown fences, prose
wrappers, invented option strings, extra keys, followups with no trigger, rows that
don't exist, arrays where objects belong. Every one must end in a legal patch or
nothing.

**`npm run eval` - live fixture eval, needs a key, NOT a CI gate.** 20 made-up patient
transcripts (Hinglish, English, blanket-denial, code-mixed, sparse, plus one for each of
the question kinds the microphone reached later) scored **tolerantly**: only fields the
transcript *mentions* are compared, and `unmentionedRows` asserts the model did **not**
invent a `false`. Kept out of `npm test` on purpose - an LLM isn't deterministic, and a
flaky red build teaches a team to ignore red builds. Every patch is schema-validated
*before* scoring, so a passing field is on-schema by construction.

**Measured on Gemini 3 Flash: 69/69 fields (100%), 0 hard failures.** Two of the twenty
failed on the first run and neither was the model: one was the token-budget truncation
described above, and the other was my own fixture. I had written a Q4 denial whose
transcript described the hair thinning evenly all over - which *is* "Diffuse thinning" - so
the model was marked wrong for reading it correctly. Writing a fixture that denies without
describing is harder than it sounds, and a scoring harness that lets you blame the model
for your own transcript is a harness that will flatter you eventually.

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

**The write rules are tested without a browser.** `tests/apply.test.ts` pins the ones that
decide validity - a flag answered No must null its detail columns, or the finished form is
off-schema - `tests/voiceApply.test.ts` pins what a spoken reply may write for a given
patient, and `tests/llm.test.ts` pins the request itself: the model and temperature actually
sent on the wire, and that setting `ANTHROPIC_MODEL`, `ANTHROPIC_TEMPERATURE` or
`ANTHROPIC_BASE_URL` changes neither. That last file exists because of a real 502: see below.

**Also verified by hand:** production build clean, `tsc --noEmit` clean (strict, plus
`noUncheckedIndexedAccess`, zero `any`), both pages server-render the right copy, and the
extract route rejects `consent` with a 400 - the one answer that can never be model-filled,
even with a valid key.

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
   passing vacuously. `npm run smoke` drives a real browser through all six sections and
   fails on any console error.

The smoke test then caught two of my own bad assumptions, which is the point of running
real software: `getByText("Saliva")` was clicking the *hint* text ("Saliva mein sui nahi
lagti") that sits above the options - so it now uses roles, because the options are real
`radio`/`checkbox` elements; and Back from Q6 lands on Q5, not on About You, because the
gate is inserted before the first section-B question.

---

## Read the question aloud

Every question carries one button that reads it out. Press again to stop. That is the
whole feature, and the restraint is deliberate - an earlier revision of this app had a
full conversational agent that asked all 16 questions itself, and it was the wrong shape:
it needed muting, it needed trusting, it talked in a waiting room, and it put a model
between the patient and a medical form on every single answer. A button that speaks only
when pressed is understood instantly by everyone and can do none of those things.

**It reads the options, not just the question.** `questionSpeech()`
([lib/questionSpeech.ts](lib/questionSpeech.ts)) builds the spoken text from the schema
and lib/copy.ts, so "Where are you losing hair?" is followed by all six choices. Reading
the title alone would be useless to the person who actually needs this - someone facing
small type in a second language without their glasses. Because it is derived rather than
written, a question added to `lib/schema.ts` becomes speakable with no edit, and the
spoken wording can never drift from the printed wording: they are the same strings.

Two details worth the words:

- **A few hints are rewritten for the ear.** "Tap the pictures that look closest to you"
  is precisely the wrong thing to say to someone who asked to have the question read to
  them. Only those hints are swapped; every other one is spoken as printed.
- **The table questions reuse the microphone's own checklist.** Q11 speaks the same
  enumerated six items the recording panel prints, so the read-aloud button and the mic
  prompt cannot disagree about what a complete answer covers.

The voice is the browser's `speechSynthesis`: no key, no network, works offline, and no
audio of a patient's answers is sent anywhere. A hosted voice would sound better and buy
none of that. `speak()` also bumps a generation counter so a stale utterance cannot keep
reading over the next question, and the button renders nothing at all when the browser
has no speech support - the same rule the microphone follows, because a control that does
nothing is worse than no control.

---

## The extraction provider

Extraction runs on **Anthropic** - `claude-haiku-4-5-20251001`, temperature 0 - and on
nothing else. There is no provider abstraction, no adapter interface, no `EXTRACT_PROVIDER`
switch. That is deliberate: an abstraction whose only job is to make a future swap easy
is a cost you pay every day for a decision you make once. Keeping every model-specific
detail inside [lib/llm.ts](lib/llm.ts) already makes the swap a one-file change, and the
route and the eval only ever call `callModel()`.

**That claim then got tested for real,** which is the only reason it is worth leaving in.
The provider moved from Anthropic to Google when the Anthropic key stopped authenticating,
and it cost exactly what this paragraph predicted: one file rewritten, one test file
rewritten, one dependency removed, and not a single line changed anywhere else in the app -
because nothing else ever knew which company was answering. An adapter interface would have
made the same change cost the same and charged rent for it every day in between.

A missing key is not a crash and not a 500:

```
llmSettings()
  GEMINI_API_KEY present -> settings
  absent                 -> null, and the route answers 503 with a message telling
                            the patient to tap or type instead
```

That fallback is a complete path, not a degraded one: every question in both modes can be
answered by tapping, which is what `npm run smoke` proves by walking the whole intake
with no keys at all.

### The 502 I shipped, and what it changed

The first Anthropic build sent what I assumed was the ideal request: `temperature: 0` for
reproducibility, plus an assistant turn **prefilled with `{`** so the model would continue
a JSON object rather than start a message. Both are good ideas. Both were rejected by the
model I had chosen, and the only thing anyone saw was:

```
POST /api/extract -> 502 Bad Gateway
```

The actual cause was two lines deep in a server log: `400 temperature is deprecated for
this model`. So I probed the account's own model list instead of guessing:

| model | `temperature` | assistant prefill | plain output |
| --- | --- | --- | --- |
| `claude-sonnet-5` | rejected | rejected | bare JSON |
| `claude-opus-4-8` | rejected | rejected | bare JSON |
| `claude-sonnet-4-6` | accepted | rejected | ```json fenced |
| **`claude-haiku-4-5`** | **accepted** | accepted | ```json fenced |

Three things came out of that, and all three are in the code:

1. **The model choice.** Haiku 4.5 is the one that still accepts `temperature: 0`, and
   reproducibility is not optional on a medical form - the same reply must fill the same
   fields every time or the output cannot be audited. It was also the fastest of the four
   (1.1-1.3s versus 1.9s) and got every field of the Hinglish probe right.
2. **Prefill is not used at all**, even though Haiku accepts it. It would buy bare JSON
   instead of a fenced block, and `parseModelJson()` already strips fences - so it would
   buy nothing while quietly breaking the moment someone changes `ANTHROPIC_MODEL`. The
   JSON contract is the system prompt plus that parser, which is the most heavily tested
   thing in the app precisely because it has always been the real guarantee.
3. **An unsupported parameter is now handled, not fatal.** `callModel()` drops
   `temperature` and retries once if the API says the model does not accept it, and
   remembers that for the life of the process. One wasted round trip to learn a permanent
   fact about a model is fine; learning it on every question is not, and neither is a
   hardcoded table of model ids that goes stale the week after it is written. Setting
   `ANTHROPIC_MODEL=claude-sonnet-5` therefore just works.

The route learned something too: a **config** error (a model that will never accept the
request, a revoked key) now logs the provider's own words and returns a distinct message,
because retrying it forever only burns the patient's time. What the patient sees stays
patient-safe either way - an API error string is not a thing to show someone in a waiting
room.

`callModel()` is shared by the route and `npm run eval`, so the benchmark cannot run a
different model or temperature than production does. There is nothing to keep in step
either: both are constants in that one file.

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
5. **Extraction is Anthropic, not the NVIDIA NIM build the brief suggested.** The
   brief's specific model is retired (410 Gone) and the free catalog's quirks are listed
   above. The eval figure quoted in this document was measured on NIM and has **not**
   been re-run on Claude.
6. **Read-aloud is the browser's voice, not a hosted TTS.** No key, no network, and no
   audio of a patient's answers leaving the device. Reasoning above.
7. **Not done by me:** the Vercel deploy, any git/GitHub step (you asked me not to push,
   and I have not staged, committed or pushed anything - note the project directory does
   sit inside a git work tree), and the 2-minute recording.

---

## What I'd do with one more week

Scalp-zone tap diagram for Q4 (the one interaction still doing chips' work) · full
Hindi/Telugu end-to-end, since the copy is already isolated in `lib/copy.ts` · a
larger eval harness with multiple runs per fixture and per-field accuracy tracked over
time · doctor live-view of the form filling in · WhatsApp pre-fill link before arrival ·
offline PWA for clinic tablets · abandonment analytics per question.
