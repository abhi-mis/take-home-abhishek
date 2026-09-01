/**
 * All patient-facing text, in one file.
 *
 * English throughout, written the way a good nurse actually speaks: short sentences,
 * no jargon, no instructions the UI should be conveying on its own. Where a schema
 * option is clinical shorthand, `gloss` adds a plain-English explanation underneath it
 *  - the option label itself is never rewritten, because that exact string is what ends
 * up in the doctor's output.
 *
 * Keeping every string here (rather than inline in components) means a translation is a
 * second map, not a rewrite of the UI.
 */
import type { QuestionKey } from "./schema";
import {
  PRODUCT_DUR,
  PRODUCT_ROWS,
  PROCEDURE_ROWS,
  SESSIONS,
  SMOKING_SEV,
  WASH,
} from "./types";

export interface QuestionCopy {
  title: string;
  hint?: string;
  gloss?: Record<string, string>;
}

export const COPY: Record<QuestionKey, QuestionCopy> = {
  age_hair_loss_began: {
    title: "At what age did your hair loss start?",
    hint: "A rough age is fine - pick the closest range, then fine-tune.",
  },
  duration: {
    title: "How long has it been going on?",
    hint: "Counting from when you first noticed it.",
  },
  family_history: {
    title: "Does hair loss run in your family?",
    hint: "Select everyone it applies to.",
    gloss: {
      "Father had hair loss": "Your father",
      "Mother had hair loss": "Your mother",
      "Siblings with thinning or baldness": "A brother or sister",
      "No known family history": "Nobody, as far as you know",
    },
  },
  pattern: {
    title: "Where are you losing hair?",
    hint: "Tap the pictures that look closest to you. More than one can apply.",
    gloss: {
      "Receding hairline": "Front hairline moving back",
      "Thinning at crown": "Thin patch on top or back",
      "Widening part line": "Your parting looks wider",
      "Diffuse thinning": "Thinner all over",
      "Patchy loss": "Distinct round bald spots",
      "Sudden excessive shedding": "A lot of hair falling at once",
    },
  },
  diagnosed_conditions: {
    title: "Has a doctor diagnosed you with any of these?",
    hint: "Only conditions a doctor has actually confirmed.",
    gloss: {
      "PCOS/PCOD": "Polycystic ovary syndrome",
      "Thyroid disorder": "Overactive or underactive thyroid",
      "Autoimmune disease": "Such as alopecia areata, lupus, psoriasis",
      Anemia: "Low iron or low haemoglobin",
      None: "None of these",
    },
  },
  menstrual_cycle: {
    title: "How are your periods?",
    hint: "Hormones affect hair directly, which is why we ask.",
    gloss: {
      Regular: "They come on schedule",
      Irregular: "They come early or late",
      Menopausal: "They have stopped",
      "Not applicable": "Prefer not to answer",
    },
  },
  pregnancy_related: {
    title: "Anything pregnancy-related recently?",
    gloss: {
      "Currently pregnant": "Pregnant right now",
      "Postpartum <1 year": "Gave birth within the last year",
      "Not applicable": "None of these",
    },
  },
  adult_acne_oily_skin: {
    title: "Do you get adult acne or oily skin?",
    hint: "Breakouts that started after your teenage years.",
  },
  excess_body_facial_hair: {
    title: "Do you get more body or facial hair than usual?",
    hint: "More than normal, by your own judgement.",
  },
  past_6_months: {
    title: "Has any of this happened in the last 6 months?",
    hint: "Any of these can trigger sudden hair loss.",
    gloss: {
      "Crash dieting or major weight loss": "Lost weight quickly",
      "High stress or emotional trauma": "A very stressful or upsetting period",
      "Fever with illness (COVID, Dengue, Typhoid)": "An illness with high fever",
      "Recent surgery": "Any operation",
      "Change in location/water/air quality": "Moved city, or the water changed",
    },
  },
  habits: {
    title: "Lifestyle and hair care habits",
    hint: "Each of these can affect hair loss. Please answer every item.",
  },
  products: {
    title: "Hair products you use",
    hint: "Include anything you use now or stopped recently. Answer for all five.",
  },
  procedures: {
    title: "Clinic treatments you have had",
    hint: "Include treatments done at any clinic. Answer for all four.",
  },
  past_treatment_side_effects: {
    title: "Side effects from past treatment",
    hint: "For example itching, burning, headaches, dizziness, or more shedding.",
  },
  sample_type: {
    title: "How would you prefer to give your sample?",
    hint: "Both give the same result. Saliva needs no needle.",
    gloss: {
      Saliva: "A spit sample - no needle",
      Blood: "A small blood draw",
      Either: "You decide at the clinic",
    },
  },
  consent: {
    title: "We need your permission",
  },
};

/**
 * What to say out loud, per voice question.
 *
 * A mic with no prompt is the worst version of voice input: the patient does not know
 * how much to say or which topics count, so they say one thing and the form fills one
 * field. Naming every topic in one sentence is what makes a single reply fill a whole
 * table - and it doubles as the summary of the question, so the grid does not need to
 * be on screen for the patient to know what is being asked.
 */
export interface SpeakPrompt {
  intro: string;
  /** Every row of the question, so nothing can be left uncovered. */
  points: string[];
  /** The conditional detail questions that unlock for each item answered "yes". */
  detailNote?: string;
  example: string;
}

/**
 * The spoken checklist for each voice question.
 *
 * A prose paragraph was the first attempt and it was wrong: it read smoothly but it
 * quietly dropped rows, so patients answered three of six items and the model was
 * blamed for an incomplete fill. A form has to enumerate. So each item is its own
 * bullet, and the row labels are interpolated from the schema constants rather than
 * retyped - if a row is ever added to the schema, it cannot silently go unasked here.
 *
 * `detailNote` carries the conditional layer: the "how long / did it help / any side
 * effects" questions that only exist for items answered yes. Saying them up front is
 * what lets one reply fill a row completely instead of leaving three blanks behind.
 */
export const SPEAK_PROMPTS: Record<string, SpeakPrompt> = {
  habits: {
    intro: "Please tell us about each of the following:",
    points: [
      "Smoking - yes or no" + `, and roughly how many per day (${SMOKING_SEV.join(" / ")})`,
      "Alcohol - yes or no",
      "Hard water at home - yes or no",
      `How often you wash your hair - ${WASH.join(", ")}`,
      "Heat or styling chemicals (dryer, straightener, hair colour) - yes or no",
      "Salon treatments (keratin, smoothening) - yes or no, and which treatment",
    ],
    example:
      "I smoke about 6 a day. No alcohol. The water at home is hard. I wash my hair on alternate days. I do not use a dryer or chemicals. I had keratin at a salon last year.",
  },
  products: {
    intro: "Please say yes or no for each of these five products:",
    points: [...PRODUCT_ROWS],
    detailNote: `For every product you do use, also say how long you have used it (${PRODUCT_DUR.join(", ")}), whether it helped, and whether it caused any side effects.`,
    example:
      "I use topical minoxidil, about 4 months, it helped a little and no side effects. I take biotin supplements, over 6 months, no change and no side effects. No medicated shampoo, no hair oils, and no minoxidil tablets.",
  },
  procedures: {
    intro: "Please say yes or no for each of these treatments:",
    points: [...PROCEDURE_ROWS],
    detailNote: `For every treatment you have had, also say how many sessions (${SESSIONS.join(", ")}) and whether it helped.`,
    example:
      "I had PRP, about 5 sessions, it helped a little. No stem cells or exosomes, no hair transplant, and nothing else.",
  },
  past_treatment_side_effects: {
    intro: "Please describe any side effect a past hair treatment caused:",
    points: [
      "Which treatment or product caused it",
      "What you experienced (itching, burning, headache, dizziness, more shedding)",
      "Whether you stopped the treatment",
    ],
    example: "Minoxidil made my scalp itch and burn, so I stopped using it.",
  },
};

/**
 * Section names for the header.
 *
 * The schema's own titles ("Personal & Family Hair Loss History") are the right thing in
 * the output and far too long for a 380px header beside three controls - they truncated to
 * "PERSONAL & FAMILY H...", which looks like a bug. The schema strings are untouched;
 * this is display only.
 */
export const SECTION_LABEL: Record<string, string> = {
  "0": "About you",
  A: "Your history",
  B: "Health",
  C: "Lifestyle",
  D: "Treatments",
  E: "Sample & consent",
};

export const UI_COPY = {
  landingTitle: "GenoRoot",
  landingKicker: "Hair & Scalp Intake",
  landingBody:
    "Sixteen short questions about your hair and scalp, for your doctor. It takes about two minutes, and the form adapts to you as you go.",
  landingCta: "Start",
  landingResume: "Continue where you left off",
  landingRestart: "Start over",
  landingPrivacy: "Your answers stay on this phone. No account, no login.",
  next: "Next",
  back: "Back",
  none: "None of these",
  notSure: "Not sure",
  confirmHint: "Filled in below - tap anything to correct it.",
  yes: "Yes",
  no: "No",
  multiHint: "You can select more than one",
  recordCta: "Answer by speaking",
  speakTitle: "Answer in your own words",
  speakCoverLabel: "Please cover all of these",
  speakDetailLabel: "Also, for each one",
  speakTapInstead: "I would rather answer by tapping",
  speakExampleLabel: "Example answer",
  resultAllTitle: "All answers recorded",
  resultSomeTitle: "Some answers are missing",
  resultNoneTitle: "Nothing was recorded",
  resultConfirmQuestion: "Please confirm these details are correct",
  resultConfirm: "Yes, these are correct",
  resultEdit: "No, I need to correct something",
  resultAnswerRest: "Answer the rest",
  confirmedBanner: "Confirmed by you",
  followUpConditional: "A few more details about what you just answered",
  reviewFilled: "Filled from what you said - please check each one.",
  recordStop: "Done",
  recordListening: "Listening…",
  recordThinking: "Filling it in…",
  recordFilled: "Filled in - please check below",
  recordLanguages: "English, Hindi, or a mix - however you normally speak.",
  reviewTitle: "All done",
  reviewBody: "Here is your completed form. Tap any answer to change it.",
  reviewIncomplete: "Almost there",
  download: "Download JSON",
  downloadBlocked: "Finish the items above first",
  showJson: "View raw JSON",
  hideJson: "Hide raw JSON",
  restart: "Start a new form",
  aboutTitle: "First, a little about you",
  aboutBody:
    "Three quick things, so the rest of the form fits you. Two questions only apply to some patients, and your age lets us set the text size.",
  aboutFooter:
    "You can change any of this later with the Back button, and the text size any time with the Aa button above.",
} as const;
