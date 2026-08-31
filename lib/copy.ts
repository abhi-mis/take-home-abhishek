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
    title: "A few everyday habits",
    hint: "You can say it all out loud and we will fill this in, or just tap.",
  },
  products: {
    title: "Which hair products do you use?",
    hint: "Shampoos, oils, minoxidil, tablets - anything at all.",
  },
  procedures: {
    title: "Have you had any clinic treatments?",
    hint: "PRP, exosomes, a transplant - or none of them.",
  },
  past_treatment_side_effects: {
    title: "Did any past treatment cause side effects?",
    hint: "For example itching, headaches, dizziness, or more shedding.",
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
export const SPEAK_PROMPTS: Record<string, { ask: string; example: string }> = {
  habits: {
    ask: "Tell me about your daily habits - do you smoke or drink, is the water at home hard, how often do you wash your hair, do you use heat or styling chemicals, and have you had any salon treatments?",
    example:
      "I smoke about 6 a day, no alcohol. Water is hard. I wash my hair every other day, no dryer, and I had keratin last year.",
  },
  products: {
    ask: "Which hair products do you use, how long have you used them, and did they help or cause any side effects? Medicated shampoos, oils or serums, minoxidil you apply, minoxidil tablets, and supplements.",
    example:
      "I have used topical minoxidil for four months, it helped a bit and no side effects. I also take biotin. Nothing else.",
  },
  procedures: {
    ask: "Have you had any clinic treatments - PRP or GFC, stem cells or exosomes, a hair transplant, or anything else? If so, how many sessions and did they help?",
    example: "I had PRP, about five sessions, it helped a little. No transplant.",
  },
  past_treatment_side_effects: {
    ask: "Did any past hair treatment cause side effects? Tell me what happened.",
    example: "Minoxidil made my scalp itch and burn, so I stopped.",
  },
};

export const UI_COPY = {
  landingTitle: "GenoRoot",
  landingKicker: "Hair & Scalp Intake",
  landingBody:
    "Let us get started - this takes about two minutes. Sixteen short questions, and you can answer some of them just by talking.",
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
  speakTitle: "Just say it - we will fill the form",
  speakTapInstead: "I would rather answer by tapping",
  speakExampleLabel: "For example",
  resultAllTitle: "Got everything",
  resultSomeTitle: "Got most of it",
  resultNoneTitle: "Could not catch that",
  resultConfirmQuestion: "Do these details match what you said?",
  resultConfirm: "Yes, these match",
  resultEdit: "No, let me change something",
  resultAnswerRest: "Answer the rest",
  confirmedBanner: "Confirmed by you",
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
  sexGateTitle: "One quick thing",
  sexGateBody:
    "A couple of questions only apply to some patients, so we will skip the rest for you.",
  sexGateFooter: "Only two questions depend on this, and you can change it with Back.",
} as const;
