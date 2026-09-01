# Grouped intake redesign: categories, direction B, desktop

Date: 2026-09-01
Status: design approved, not yet planned or built

## 1. Why

Two problems, one measured and one reported.

**Desktop is broken, not merely unstyled.** Measured at 1440x900 on the current build: the
content column is 448px, leaving 992px unused; the sticky header paints a 448px band that
floats mid-page while the fixed footer spans 1425px, so the two disagree about how wide the
app is; and the review screen scrolls for roughly three screens on a 900px display with a
thousand pixels sitting empty beside it. Focus is not obscured by the fixed footer
(0 of 10 focusable controls), which is the one thing that was already right.

**Seventeen screens of identical chrome is its own fatigue.** One question per screen beats
a single long form for completion, but it is not the only alternative to one. Chunking into
meaningful categories with progressive disclosure inside them keeps the low cognitive load
of one-at-a-time while cutting navigations from 17 to 6.

## 2. Decisions taken

| Decision | Choice | Notes |
| --- | --- | --- |
| Who desktop is for | The same patient on a bigger screen | Not a staff or clinician tool. No density mode, no multi-patient anything. |
| Visual direction | B, "warm reassuring" | Chosen over a calm-clinical recommendation. Warmth matters on a form that asks about pregnancy and body hair. |
| Grouping | Six category screens, one question open at a time | Answered questions collapse to a summary line; the next opens in place. |
| Consent | Collapses like any other card | Decided against the recommendation to keep it permanently expanded. Mitigations in section 4. |

## 3. Information architecture

Six sections, using the schema's own taxonomy rather than an invented one, because that
taxonomy is what the doctor reading the output already uses.

```
0  About you          first name (optional), sex, age
A  Your history       onset age, duration, family history, pattern
B  Health             diagnosed conditions, periods*, pregnancy*, acne, body hair
C  Lifestyle          last 6 months, habits table
D  Treatments         products table, procedures table, side effects
E  Sample & consent   sample type, consent

* female-only, gated as they are today
```

Section membership is derived from `INTAKE_SCHEMA.sections`, so adding a question to the
schema still requires no wizard edit. Sections carry no questions of their own except
About You, whose three inputs are UI-only meta.

**Counters derive from VISIBLE questions.** Health reads "2 of 3" for a male patient and
"2 of 5" for a female one. The existing sex gate is the only input to that.

## 4. Interaction model

### Card states

Every question in a section is a card in exactly one of three states.

| State | Renders | Approx height | Interactive |
| --- | --- | --- | --- |
| Answered | short label, the answer, tick | 46px | yes, reopens |
| Open | question, hint, options, read-aloud | as today | yes |
| Waiting | dimmed short label | 46px | no |

At most one card is open at a time. This is the property that keeps a five-question section
from reading as a wall.

### Transitions

- **Answering** collapses the card and opens the next unanswered visible question in the
  section. Nothing navigates and nothing scrolls out of reach, so this is not the
  auto-advance that was deliberately removed: the answer stays on screen as a summary.
- **Reopening** an answered card collapses whatever was open. Changing that answer does NOT
  jump forward again. First pass wants momentum; a correction wants to stay put, and being
  yanked forward after fixing one answer is the exact complaint that moved corrections out
  of the wizard and onto the review screen.
- **Next** advances a whole section. Blocked until every visible question in the section is
  answered, and the block names the outstanding ones.
- Answering the last question in a section leaves it collapsed and does NOT advance. Focus
  moves to **Next** only when the answer came from the keyboard; a tap leaves focus alone
  and announces the state in a polite live region. This is the same split as section 10:
  someone pressing a key asked to move, someone tapping did not.

### Three carve-outs

1. **Table questions** (habits, products, procedures) open into today's voice-first surface
   unchanged, filling the card rather than the screen. Their collapsed summary states
   coverage rather than a value: "5 answered, 2 in use".
2. **About You** is a single always-open card. There is nothing to collapse it against, and
   its three inputs are already grouped. The text-size prompt still fires from the age
   control.
3. **Consent** collapses, per the decision above, with three mitigations that keep the
   record honest: the collapsed summary reads "Yes, I agree: sample and genetic analysis"
   rather than "Yes"; it is never pre-answered; and the four plain-language points are one
   tap away and always shown in full on the review screen.

### Keyboard (desktop and any attached keyboard)

| Key | Action |
| --- | --- |
| `1`-`9` | select the nth option in the open card. **Select only, never advance.** |
| `Enter` | confirm and open the next question. No effect while the open question is unanswered. |
| `Shift+Enter` | next section, subject to the same validation as the button |
| `Up` / `Down` | move between cards in the section |
| `Esc` | close the open card without answering. The section then shows every question collapsed, and the next `Enter` or tap opens the first unanswered one. |

`1`-`9` must not advance. Auto-advance was removed because a mis-tap that both records an
answer and leaves the screen produces a wrong clinical answer the patient never sees again;
a keyboard shortcut that advances reintroduces it through the back door.

## 5. Visual foundations

### Tokens, light

```
ground      #faf5ee     card        #ffffff     rule        #eae0d2
ink         #1c1a17     muted       #6f665b     done        #7d8f6f
terracotta  text #9a4f2c             fill/border #b4643c
selected    tint #fdf1e9 + 1.5px #b4643c border + tick
CTA         ink fill, paper text
```

### Measured contrast, light

| Pair | Ratio | Requirement | Verdict |
| --- | --- | --- | --- |
| ink on ground | 16.01:1 | 4.5 | pass |
| ink on card | 17.36:1 | 4.5 | pass |
| muted on ground | 5.19:1 | 4.5 | pass |
| muted on card | 5.63:1 | 4.5 | pass |
| terracotta text `#9a4f2c` on ground | 5.49:1 | 4.5 | pass |
| terracotta fill `#b4643c` as a border | 4.01:1 | 3.0 | pass |
| paper on ink CTA | 16.01:1 | 4.5 | pass |
| warn `#9a3412` on ground | 6.74:1 | 4.5 | pass |

Two findings that shape the palette rather than decorate it:

- **`#b4643c` fails as text at 4.01:1.** Terracotta is therefore two tokens, one for text
  and one for fills and borders. A terracotta fill takes ink, never white, because white on
  `#b4643c` is 4.35:1.
- **The selected tint is 1.11:1 against the card.** State is carried by the border and the
  tick. The tint is reinforcement, never the signal, which is the same rule the
  high-contrast direction would have enforced everywhere.

Dark mode gets its own pass with the same table. Provisional values already checked:
text `#f2ece3` on `#17140f` 15.64:1, muted `#a89c8c` 6.82:1, terracotta `#e89a6f` 8.12:1.
The card must be lifted further off the ground than the provisional `#1f1b15` (1.07:1).

### Type, space, motion

```
Newsreader        section titles, open question text        400-500 weight
Plus Jakarta Sans everything else                            400-700
Hind              Devanagari, both roles (Newsreader has none)
radius            12px controls, 16px cards, 999px CTA
depth             one soft shadow, cards only. Rules elsewhere.
motion            height + opacity on collapse/expand, 180ms, none under
                  prefers-reduced-motion
```

## 6. Layout

**Mobile.** Header (section title, controls, six-segment progress, "2 of 5 answered"),
scrolling card stack, footer with Back and "Next: Lifestyle". Verified in mockup at
390x748: a five-question section fits without scrolling.

**Desktop.** The same model composed for the viewport, not restructured.

- 262px rail: wordmark, the six sections with tick or count, keyboard legend, a note that
  answers save as you go.
- Card column capped at 560px, centred vertically.
- Header and footer live inside the column, so they stop disagreeing about width.
- Targets shrink under `pointer: fine`; they stay 44px+ under `pointer: coarse`.

## 7. Components

| Component | Change |
| --- | --- |
| `StepShell` | becomes `SectionShell`: section chrome, progress, rail on desktop, footer |
| new `QuestionCard` | the three-state card; owns collapse and expand and its own read-aloud |
| `QuestionBody` | reused unchanged as the open card's contents. This is why it was extracted. |
| `ProgressBar` | six segments with partial fill for the current section |
| `ReviewScreen` | grouped by the same six sections, two columns on desktop |
| `EditQuestionDialog` | unchanged |
| `VoiceMatrix` etc | unchanged, rendered inside a card |
| `LangToggle`, `ComfortToggle`, `QuestionSpeaker`, `ThemeToggle` | unchanged; speaker moves to the open card |

## 8. State

- `lib/steps.ts` moves from 17 flat steps to six sections plus a visible-question list per
  section. `validateStep` becomes `validateSection`, built from the same per-question rules
  so nothing about what counts as answered changes.
- Store: `currentStepId` becomes `currentSectionId`; add `openQuestionKey` so a refresh
  reopens the card the patient was on. `touched` becomes per question key.
- **The sessionStorage key bumps to `genoroot-intake-v2`.** The shape changes and the store
  is per-tab and short-lived, so a migration would be more code than it is worth. An
  in-progress v1 session starts over rather than half-loading.

## 9. Internationalisation

New strings: section titles (already in `SECTION_LABEL`), the short question labels used by
collapsed cards, "N of M answered", "Next: {section}", the keyboard legend, the coverage
summaries for table cards. All go through `TEXT_EN` / `TEXT_HI`, so a missing Hindi value
stays a compile error.

**Short labels are new content, not truncation.** "Has a doctor diagnosed you with any of
these?" cannot be ellipsised into a 46px row without becoming unreadable, so each question
gets an explicit short label in both languages.

Newsreader has no Devanagari, so Hind carries Hindi in both roles. The Devanagari leading
rules stay, and the clipping guard must be re-run against the new type: that is precisely
what sliced the matras last time.

## 10. Verification

- **Unit**: a new `sections.test.ts` for visible-question derivation, counters, section
  validation, and gating inside a section. `i18n.test.ts` extended to the new keys.
- **New contrast test**: parse the token values and assert every documented pair meets its
  requirement, so the palette cannot drift below AA silently. The numbers in section 5 came
  from a throwaway script; a test is the durable form.
- **Source scans**: both existing scans still apply unchanged (no hard-coded English,
  selector stability).
- **Smoke**: rewritten to walk six sections. New invariants: at most one card open;
  answering opens the next; reopening does not jump forward; section Next blocked with the
  outstanding questions named; the consent summary text; the keyboard path at desktop
  width; Devanagari leading; and the standing checks that answers stay English and no
  Devanagari reaches the JSON.
- **Accessibility**: disclosure semantics (`aria-expanded`, `aria-controls`) rather than a
  full ARIA accordion widget, since arrow-key roving focus is not wanted here; focus is
  moved on `Enter` because the patient asked to move, and NOT moved on tap, where a polite
  live region announces the newly opened question instead; WCAG 2.4.11 re-checked with the
  taller footer.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| The smoke test is the safety net for the whole app and must be rewritten wholesale, leaving a window with less cover | Rewrite it first against the new IA, before the visual pass, so the mechanism is guarded while the styling changes |
| The palette touches every screen, and dark mode is only provisionally checked | Contrast test lands with the tokens, before any component adopts them |
| A five-question section at 26% text zoom may scroll further than intended | Only one card is ever open; verify at 26% as an explicit smoke assertion |
| Scope. This replaces the wizard layer | Four independently shippable phases, below |

Suggested phasing: **1** tokens, type and the contrast test. **2** IA, cards, section
validation, smoke rewrite. **3** desktop rail, composition, keyboard. **4** re-verification
and docs.

## 12. Out of scope

Chat or agent mode, server persistence, EHR integration, a staff or clinician view,
analytics, and any change to the schema, the extraction prompt, the voice pipeline, or the
downloaded JSON.
