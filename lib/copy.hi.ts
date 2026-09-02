/**
 * Hindi. The whole form, not a veneer on top of an English one.
 *
 * THE RULE THIS FILE EXISTS TO KEEP
 * --------------------------------
 * Hindi is a DISPLAY language. Every answer stored, validated and downloaded stays the
 * exact English schema string, because lib/schema.ts is what the doctor receives and a
 * JSON full of Devanagari would fail the brief. So the option a patient taps may read
 * "अनियमित" while the stored value is "Irregular". `OPTION_HI` below is that mapping and
 * nothing more - it is never applied in reverse, and no answer is ever translated.
 *
 * The type annotations are load-bearing. Each dictionary is typed against its English
 * counterpart, so adding a question, an option or a UI string and forgetting the Hindi
 * fails `tsc` rather than shipping a half-translated screen to a patient who reads no
 * English. tests/i18n.test.ts covers what the type system cannot: that every schema
 * option has a label, and that no value was left sitting in English.
 *
 * On register: plain spoken Hindi, the way a clinic nurse actually speaks - "बाल झड़ना",
 * not "केश-पतन". Clinical words patients themselves say in English (मिनॉक्सिडिल,
 * थायरॉइड, PRP) are transliterated or left as they are, because replacing them with
 * unfamiliar Sanskritised coinages would make the form harder to read, not easier. That
 * is the same judgement the English copy makes about jargon.
 */
import type { QuestionKey } from "./schema";
import type { QuestionCopy, SpeakPrompt } from "./copy";
import { SECTION_LABEL, SPEAK_PROMPTS, UI_COPY } from "./copy";

// ---------------------------------------------------------------------------
// Schema options: display only, never stored
// ---------------------------------------------------------------------------

/**
 * English schema string -> Hindi label.
 *
 * Covers every option, table row and follow-up choice in the schema. A missing entry
 * falls back to the English string (see `optionLabel` in i18n.ts), which is a visible
 * gap rather than a crash - and the i18n test walks the schema so there are none.
 */
export const OPTION_HI: Record<string, string> = {
  // Q2 duration
  "Less than 6 months": "6 महीने से कम",
  "6-12 months": "6 से 12 महीने",
  "Over a year": "एक साल से ज़्यादा",

  // Q3 family history
  "Father had hair loss": "पिता के बाल झड़े थे",
  "Mother had hair loss": "माता के बाल झड़े थे",
  "Siblings with thinning or baldness": "भाई या बहन के बाल पतले या गंजापन",
  "No known family history": "परिवार में किसी को नहीं",

  // Q4 pattern
  "Receding hairline": "आगे के बाल पीछे हटना",
  "Thinning at crown": "सिर के ऊपर बाल पतले",
  "Widening part line": "मांग चौड़ी होना",
  "Diffuse thinning": "पूरे सिर पर पतले बाल",
  "Patchy loss": "गोल चकत्तों में बाल जाना",
  "Sudden excessive shedding": "अचानक बहुत बाल गिरना",

  // Q5 diagnosed conditions
  "PCOS/PCOD": "PCOS / PCOD",
  "Thyroid disorder": "थायरॉइड की समस्या",
  Diabetes: "डायबिटीज़ (शुगर)",
  "Autoimmune disease": "ऑटोइम्यून बीमारी",
  Anemia: "खून की कमी (एनीमिया)",
  None: "इनमें से कोई नहीं",

  // Q6 menstrual cycle
  Regular: "समय पर आते हैं",
  Irregular: "अनियमित हैं",
  Menopausal: "बंद हो चुके हैं",
  "Not applicable": "लागू नहीं",

  // Q7 pregnancy
  "Currently pregnant": "अभी गर्भवती हूँ",
  "Postpartum <1 year": "पिछले एक साल में प्रसव हुआ",

  // Q10 past 6 months
  "Crash dieting or major weight loss": "तेज़ी से वज़न घटना या डाइटिंग",
  "High stress or emotional trauma": "बहुत तनाव या मानसिक आघात",
  "Fever with illness (COVID, Dengue, Typhoid)":
    "तेज़ बुखार वाली बीमारी (कोविड, डेंगू, टाइफ़ॉइड)",
  "Recent surgery": "हाल में कोई ऑपरेशन",
  "Change in location/water/air quality": "शहर, पानी या हवा बदलना",

  // Q11 habits: smoking severity and wash frequency
  "Mild <5/day": "हल्का - दिन में 5 से कम",
  "Moderate 5-10/day": "मध्यम - दिन में 5 से 10",
  "Severe >10/day": "ज़्यादा - दिन में 10 से अधिक",
  Daily: "रोज़",
  "Alternate Days": "एक दिन छोड़कर",
  Weekly: "हफ़्ते में एक बार",

  // Q12 products
  "OTC/Medicated Shampoos": "दवा वाला शैम्पू",
  "Hair Oils/Serums": "तेल या सीरम",
  "Topical Minoxidil": "लगाने वाला मिनॉक्सिडिल",
  "Oral Minoxidil": "खाने वाला मिनॉक्सिडिल",
  Supplements: "सप्लीमेंट",
  "<3mo": "3 महीने से कम",
  "3-6mo": "3 से 6 महीने",
  ">6mo": "6 महीने से ज़्यादा",

  // Q13 procedures
  "PRP/GFC/iPRF": "PRP / GFC / iPRF",
  "Stem Cells/Exosomes": "स्टेम सेल या एक्सोसोम",
  "Hair Transplant": "हेयर ट्रांसप्लांट",
  Other: "कोई और इलाज",
  "1-3": "1 से 3",
  "4-6": "4 से 6",
  ">6": "6 से ज़्यादा",

  // Q15 sample
  Saliva: "थूक (सलाइवा)",
  Blood: "खून",
  Either: "दोनों में से कोई भी",
};

// ---------------------------------------------------------------------------
// The sixteen questions
// ---------------------------------------------------------------------------

export const COPY_HI: Record<QuestionKey, QuestionCopy> = {
  age_hair_loss_began: {
    title: "आपके बाल झड़ना किस उम्र में शुरू हुआ?",
    hint: "अंदाज़ा भी ठीक है - पास वाली उम्र चुनें, फिर ठीक कर लें।",
  },
  duration: {
    title: "यह कितने समय से चल रहा है?",
    hint: "जब से आपने पहली बार महसूस किया, तब से।",
  },
  family_history: {
    title: "क्या परिवार में किसी के बाल झड़ते हैं?",
    hint: "जो भी लागू हों, सब चुनें।",
    gloss: {
      "Father had hair loss": "आपके पिता",
      "Mother had hair loss": "आपकी माता",
      "Siblings with thinning or baldness": "भाई या बहन",
      "No known family history": "जहाँ तक पता है, किसी को नहीं",
    },
  },
  pattern: {
    title: "बाल कहाँ से जा रहे हैं?",
    hint: "जो तस्वीरें आपसे मिलती हों, उन पर टैप करें। एक से ज़्यादा भी चुन सकते हैं।",
    gloss: {
      "Receding hairline": "माथे के बाल पीछे खिसक रहे हैं",
      "Thinning at crown": "ऊपर या पीछे पतला हिस्सा",
      "Widening part line": "मांग चौड़ी दिख रही है",
      "Diffuse thinning": "हर जगह पतले",
      "Patchy loss": "गोल गंजे चकत्ते",
      "Sudden excessive shedding": "एक साथ बहुत बाल गिरना",
    },
  },
  diagnosed_conditions: {
    title: "क्या डॉक्टर ने इनमें से कुछ बताया है?",
    hint: "सिर्फ़ वही, जिसकी डॉक्टर ने पुष्टि की हो।",
    gloss: {
      "PCOS/PCOD": "ओवरी से जुड़ी समस्या",
      "Thyroid disorder": "थायरॉइड तेज़ या धीमा",
      "Autoimmune disease": "जैसे एलोपेशिया एरियाटा, ल्यूपस, सोरायसिस",
      Anemia: "आयरन या हीमोग्लोबिन कम",
      None: "इनमें से कोई नहीं",
    },
  },
  menstrual_cycle: {
    title: "आपके पीरियड कैसे हैं?",
    hint: "हॉर्मोन का सीधा असर बालों पर पड़ता है, इसलिए पूछ रहे हैं।",
    gloss: {
      Regular: "समय पर आते हैं",
      Irregular: "जल्दी या देर से आते हैं",
      Menopausal: "बंद हो गए हैं",
      "Not applicable": "बताना नहीं चाहती",
    },
  },
  pregnancy_related: {
    title: "क्या हाल में गर्भ या प्रसव से जुड़ी कोई बात है?",
    gloss: {
      "Currently pregnant": "अभी गर्भवती हूँ",
      "Postpartum <1 year": "पिछले एक साल में बच्चा हुआ",
      "Not applicable": "इनमें से कुछ नहीं",
    },
  },
  adult_acne_oily_skin: {
    title: "क्या मुहांसे या तेलीय त्वचा रहती है?",
    hint: "ऐसे दाने जो किशोरावस्था के बाद शुरू हुए।",
  },
  excess_body_facial_hair: {
    title: "क्या शरीर या चेहरे पर सामान्य से ज़्यादा बाल आते हैं?",
    hint: "आपकी नज़र में जो सामान्य से ज़्यादा हो।",
  },
  past_6_months: {
    title: "पिछले 6 महीनों में इनमें से कुछ हुआ?",
    hint: "इनमें से कोई भी बात अचानक बाल झड़ने की वजह बन सकती है।",
    gloss: {
      "Crash dieting or major weight loss": "तेज़ी से वज़न घटा",
      "High stress or emotional trauma": "बहुत तनाव या दुख का समय",
      "Fever with illness (COVID, Dengue, Typhoid)": "तेज़ बुखार वाली बीमारी",
      "Recent surgery": "कोई भी ऑपरेशन",
      "Change in location/water/air quality": "शहर बदला, या पानी बदला",
    },
  },
  habits: {
    title: "रहन-सहन और बालों की देखभाल",
    hint: "इनमें से हर बात का असर पड़ता है। कृपया हर सवाल का जवाब दें।",
  },
  products: {
    title: "बालों पर जो चीज़ें इस्तेमाल करते हैं",
    hint: "जो अभी लगाते हैं या हाल में छोड़ा है, सब बताएँ। पाँचों का जवाब दें।",
  },
  procedures: {
    title: "क्लिनिक में कराए गए इलाज",
    hint: "किसी भी क्लिनिक में कराया इलाज शामिल करें। चारों का जवाब दें।",
  },
  past_treatment_side_effects: {
    title: "पिछले इलाज से कोई साइड इफ़ेक्ट",
    hint: "जैसे खुजली, जलन, सिरदर्द, चक्कर, या बाल और गिरना।",
  },
  sample_type: {
    title: "सैंपल किस तरह देना पसंद करेंगे?",
    hint: "दोनों से एक ही नतीजा मिलता है। थूक में सुई नहीं लगती।",
    gloss: {
      Saliva: "थूक का सैंपल - सुई नहीं",
      Blood: "थोड़ा सा खून",
      Either: "क्लिनिक पर तय कर लेंगे",
    },
  },
  consent: {
    title: "हमें आपकी अनुमति चाहिए",
  },
};

export const SECTION_LABEL_HI: Record<keyof typeof SECTION_LABEL, string> = {
  "0": "आपके बारे में",
  A: "आपका इतिहास",
  B: "सेहत",
  C: "रहन-सहन",
  D: "इलाज",
  E: "सैंपल और अनुमति",
};

// ---------------------------------------------------------------------------
// Spoken checklists for the four voice questions
// ---------------------------------------------------------------------------

export const SPEAK_PROMPTS_HI: Record<keyof typeof SPEAK_PROMPTS, SpeakPrompt> = {
  habits: {
    intro: "इन सब के बारे में बताइए:",
    points: [
      "सिगरेट - हाँ या नहीं, और दिन में कितनी (5 से कम / 5 से 10 / 10 से ज़्यादा)",
      "शराब - हाँ या नहीं",
      "घर का पानी भारी है - हाँ या नहीं",
      "बाल कितनी बार धोते हैं - रोज़, एक दिन छोड़कर, या हफ़्ते में एक बार",
      "ड्रायर, स्ट्रेटनर या कलर - हाँ या नहीं",
      "सैलून का इलाज (केराटिन, स्मूदनिंग) - हाँ या नहीं, और कौन सा",
    ],
    example:
      "दिन में करीब 6 सिगरेट पीता हूँ। शराब नहीं। घर का पानी भारी है। एक दिन छोड़कर बाल धोता हूँ। ड्रायर या कलर नहीं करता। पिछले साल सैलून में केराटिन कराया था।",
  },
  products: {
    intro: "इन पाँच चीज़ों के लिए हाँ या नहीं बताइए:",
    points: [
      "दवा वाला शैम्पू",
      "तेल या सीरम",
      "लगाने वाला मिनॉक्सिडिल",
      "खाने वाला मिनॉक्सिडिल",
      "सप्लीमेंट",
    ],
    detailNote:
      "जो चीज़ इस्तेमाल करते हैं, उसके लिए यह भी बताइए कि कितने समय से (3 महीने से कम, 3 से 6 महीने, 6 महीने से ज़्यादा), फ़ायदा हुआ या नहीं, और कोई साइड इफ़ेक्ट हुआ या नहीं।",
    example:
      "लगाने वाला मिनॉक्सिडिल करीब 4 महीने से लगा रहा हूँ, थोड़ा फ़ायदा हुआ, कोई साइड इफ़ेक्ट नहीं। बायोटिन 6 महीने से ज़्यादा से ले रहा हूँ, कोई फ़र्क नहीं पड़ा। दवा वाला शैम्पू, तेल और गोली वाला मिनॉक्सिडिल नहीं लेता।",
  },
  procedures: {
    intro: "इन इलाजों के लिए हाँ या नहीं बताइए:",
    points: ["PRP / GFC / iPRF", "स्टेम सेल या एक्सोसोम", "हेयर ट्रांसप्लांट", "कोई और इलाज"],
    detailNote:
      "जो इलाज कराया है, उसके लिए यह भी बताइए कि कितनी सिटिंग हुईं (1 से 3, 4 से 6, 6 से ज़्यादा) और फ़ायदा हुआ या नहीं।",
    example:
      "PRP कराया था, करीब 5 सिटिंग, थोड़ा फ़ायदा हुआ। स्टेम सेल, ट्रांसप्लांट या कुछ और नहीं कराया।",
  },
  past_treatment_side_effects: {
    intro: "पिछले किसी इलाज से हुआ साइड इफ़ेक्ट बताइए:",
    points: [
      "कौन सी दवा या इलाज से हुआ",
      "क्या हुआ (खुजली, जलन, सिरदर्द, चक्कर, बाल और गिरना)",
      "क्या आपने वह इलाज बंद कर दिया",
    ],
    example: "मिनॉक्सिडिल से सिर में खुजली और जलन हुई, इसलिए बंद कर दिया।",
  },
};

// ---------------------------------------------------------------------------
// The interface strings from UI_COPY
// ---------------------------------------------------------------------------

export const UI_COPY_HI: Record<keyof typeof UI_COPY, string> = {
  landingTitle: "GenoRoot",
  landingKicker: "बाल और स्कैल्प जाँच",
  landingBody:
    "आपके बाल और स्कैल्प के बारे में सोलह छोटे सवाल, आपके डॉक्टर के लिए। करीब दो मिनट लगते हैं, और फ़ॉर्म आपके हिसाब से बदलता रहता है।",
  landingCta: "शुरू करें",
  landingResume: "जहाँ छोड़ा था, वहीं से चलें",
  landingRestart: "फिर से शुरू करें",
  next: "आगे",
  back: "पीछे",
  none: "इनमें से कोई नहीं",
  notSure: "पक्का नहीं",
  confirmHint: "नीचे भर दिया गया है - बदलने के लिए किसी पर भी टैप करें।",
  yes: "हाँ",
  no: "नहीं",
  multiHint: "एक से ज़्यादा चुन सकते हैं",
  recordCta: "बोलकर जवाब दें",
  speakTitle: "अपने शब्दों में जवाब दें",
  speakCoverLabel: "कृपया ये सब बताएँ",
  speakDetailLabel: "और, हर एक के लिए",
  speakTapInstead: "मैं टैप करके जवाब देना चाहूँगा",
  speakExampleLabel: "जवाब का नमूना",
  resultAllTitle: "सभी जवाब दर्ज हो गए",
  resultSomeTitle: "कुछ जवाब बाकी हैं",
  resultNoneTitle: "कुछ भी दर्ज नहीं हुआ",
  resultConfirmQuestion: "कृपया देख लें कि ये जानकारी सही है",
  resultConfirm: "हाँ, ये सही हैं",
  resultEdit: "नहीं, कुछ ठीक करना है",
  resultAnswerRest: "बाकी के जवाब दें",
  confirmedBanner: "आपने पुष्टि कर दी",
  followUpConditional: "कुछ और जानकारी",
  reviewFilled: "आपने जो कहा, उससे भरा गया है - कृपया हर एक देख लें।",
  recordStop: "हो गया",
  recordListening: "सुन रहे हैं…",
  recordThinking: "भर रहे हैं…",
  recordFilled: "भर दिया - कृपया नीचे देख लें",
  recordLanguages: "हिंदी, अंग्रेज़ी, या दोनों मिलाकर - जैसे आप बोलते हैं।",
  reviewTitle: "सब हो गया",
  reviewBody: "यह आपका पूरा फ़ॉर्म है। बदलने के लिए किसी भी जवाब पर टैप करें।",
  reviewIncomplete: "थोड़ा बाकी है",
  download: "JSON डाउनलोड करें",
  downloadBlocked: "पहले ऊपर के सवाल पूरे करें",
  showJson: "मूल JSON देखें",
  hideJson: "JSON छिपाएँ",
  restart: "नया फ़ॉर्म शुरू करें",
  aboutTitle: "पहले, थोड़ा आपके बारे में",
  aboutBody:
    "तीन छोटी बातें, जिससे बाकी फ़ॉर्म आपके हिसाब से बने। दो सवाल कुछ ही मरीज़ों पर लागू होते हैं, और उम्र से हम अक्षरों का आकार तय करते हैं।",
  aboutFooter:
    "इनमें से कुछ भी बाद में पीछे बटन से बदल सकते हैं, और अक्षरों का आकार कभी भी ऊपर के Aa बटन से।",
};

// ---------------------------------------------------------------------------
// Everything that lives inside a component rather than in COPY / UI_COPY
// ---------------------------------------------------------------------------

/**
 * The English side of the component strings.
 *
 * These used to be inline literals, which is fine in a single-language app and fatal in
 * a bilingual one: a string that stays inline is a string that stays English, and a
 * half-Hindi screen is worse for the patient than an all-English one. `{name}`-style
 * placeholders are filled by `fill()` in i18n.ts.
 */
export const TEXT_EN = {
  // header controls
  langSwitchToHindi: "हिंदी में भरें",
  langSwitchToEnglish: "Fill in English",
  readAloud: "Read the question aloud",
  readStop: "Stop reading the question",
  progressAria: "Question {n} of {total}",

  // About You
  aboutNameLabel: "What should we call you?",
  aboutNameOptional: "optional",
  aboutNamePlaceholder: "First name",
  aboutNameAria: "First name, optional",
  aboutNameNote: "Optional, and it is not part of the form your doctor receives.",
  aboutNameAck: "Thank you, {name}. We will use this on screen only.",
  aboutSexLabel: "Which applies to you?",
  aboutSexAria: "Sex",
  aboutSexFemale: "Female",
  aboutSexMale: "Male",
  aboutSexPreferNot: "Prefer not to say",
  aboutSexTwoApply: "Two extra questions apply to you",
  aboutSexTwoSkipped: "Those two are skipped",
  aboutAgeLabel: "How old are you?",
  aboutAgeFieldLabel: "Your age in years",
  aboutAgePlaceholder: "Age",
  aboutAgeYears: "years",
  aboutAgeRangeError: "Enter an age between {min} and {max}",
  aboutAgeOrPick: "or pick a range",
  aboutScaleOn: "{label} is on for the rest of the form.",
  aboutScaleUnchanged: "Text size is unchanged, as you asked.",
  aboutScaleChange: "Change it any time with the Aa button at the top.",

  // the text-size prompt
  comfortTitle: "Would you like larger text?",
  comfortBody:
    "You told us you are {age}. We can make the words and the buttons bigger for the rest of the form. Nothing else changes.",
  comfortSample: "How long has it been going on?",
  comfortNow: "Now",
  comfortYes: "Yes, make it bigger",
  comfortNo: "No, keep it as it is",
  comfortDismissAria: "Keep the text size as it is",
  comfortFoot: "Either way, the Aa button at the top changes the size any time.",
  comfortStandardName: "Standard text",
  comfortLargeName: "Larger text",
  comfortXlName: "Largest text",
  comfortLargeShort: "Larger",
  comfortXlShort: "Largest",
  comfortToggleAria: "{current}. Switch to {next}.",

  // Q1
  onsetFine: "Fine-tune it",
  onsetYears: "years old",
  onsetDown: "Decrease age",
  onsetUp: "Increase age",
  onsetAria: "Age hair loss began",
  onsetTeens: "Teens",
  onset20s: "20s",
  onset30s: "30s",
  onset40s: "40s",
  onset50s: "50+",
  onsetTeensHint: "13-19",
  onset20sHint: "20-29",
  onset30sHint: "30-39",
  onset40sHint: "40-49",
  onset50sHint: "50 or later",
  onsetClosed: "after your age",
  onsetBound: "You told us you are {age}, so later ages are closed.",

  // validation
  stillNeeded: "Still needed",
  stillNeededN: "Still needed ({n})",
  andMore: "…and {n} more below",
  unavailableSuffix: "not available for your answers",

  // habits grid
  habitSmoking: "Smoking",
  habitSmokingHelp: "Do you smoke?",
  habitAlcohol: "Alcohol",
  habitAlcoholHelp: "Do you drink?",
  habitWater: "Hard water",
  habitWaterHelp: "Is the water at home hard?",
  habitWash: "Hair wash",
  habitWashHelp: "How often do you wash your hair?",
  habitHeat: "Heat / styling chemicals",
  habitHeatHelp: "Dryer, straightener, or colouring?",
  habitSalon: "Salon treatments",
  habitSalonHelp: "Keratin, smoothening, and similar?",
  habitHowMuch: "How much?",
  habitWhich: "Which treatment?",
  habitSalonPlaceholder: "e.g. keratin, about 6 months ago",

  // products and procedures
  colHowLong: "How long",
  colHelped: "Did it help?",
  colSideEffects: "Any side effects?",
  colSessions: "How many sessions",
  rowShampooHelp: "Anti-dandruff or medicated shampoo",
  rowOilsHelp: "Oils or leave-in serums",
  rowTopicalHelp: "The solution or foam you apply",
  rowOralHelp: "Minoxidil tablets",
  rowSupplementsHelp: "Biotin, vitamins, iron",
  rowPrpHelp: "Injections made from your own blood",
  rowStemHelp: "Stem cell or exosome therapy",
  rowTransplantHelp: "Transplant surgery",
  rowOtherHelp: "Any other clinic treatment",
  required: "required",
  useThis: "I use this",
  hadThis: "I had this",

  // the guided follow-up flow
  followUpAria: "Remaining questions",
  followUpUseList: "Use list",
  followUpUseListAria: "Close these questions and use the full list instead",
  followUpLast: "Answer the last one now",
  followUpRemaining: "Answer the remaining {n} one at a time",
  followUpQuicker: "Quicker than finding them in the list below",
  followUpToGo: "Just {n} to go",
  followUpAbout: "About:",
  followUpSave: "Save",
  followUpDone: "All done - {n} answered",
  followUpDismiss: "Dismiss",

  // voice
  voiceDenied: "Microphone permission was denied. You can fill this in by tapping below.",
  voiceEmpty: "Nothing was picked up. Try again, or tap the answers below.",
  voiceFailed: "Something went wrong. You can fill this in by tapping below.",
  voiceFilledCount: "Filled {got} of {total} answers",
  voiceHeard: "What we heard",
  voiceTapStop: "tap to stop",
  editDone: "Done",
  aboutRowLabel: "Sex and age",

  /*
    Short labels for a collapsed card.

    New content, not truncation. "Has a doctor diagnosed you with any of these?" cannot be
    ellipsised into a 46px row and stay readable, so every question gets a label written for
    that row - which is also what makes the collapsed stack scannable rather than a column
    of clipped sentences.
  */
  shortAbout: "About you",
  shortOnset: "Started at",
  shortDuration: "Going on for",
  shortFamily: "In the family",
  shortPattern: "Where",
  shortConditions: "Diagnosed",
  shortPeriods: "Periods",
  shortPregnancy: "Pregnancy",
  shortAcne: "Acne or oily skin",
  shortBodyHair: "Body or facial hair",
  shortPast6m: "Last 6 months",
  shortHabits: "Habits",
  shortProducts: "Products",
  shortProcedures: "Clinic treatments",
  shortSideEffects: "Side effects",
  shortSample: "Sample",
  shortConsent: "Permission",

  // What a collapsed card says on the right.
  summaryNone: "None",
  summaryPlusMore: "{first} +{n}",
  summaryYears: "{age} years old",
  summaryCoverage: "{answered} answered, {inUse} in use",
  summaryCoverageDone: "{answered} answered",
  summaryConsentYes: "Yes, I agree: sample and genetic analysis",
  summaryConsentNo: "No, not now",
  summaryNotAnswered: "Not answered yet",

  // Section chrome.
  sectionOf: "Section {n} of {total}",
  answeredOf: "{n} of {total} answered",
  nextSection: "Next: {title}",
  finishUp: "Review answers",
  landingKickerRail: "Hair & scalp intake",
  railNav: "Sections",
  announceOpened: "Next question: {title}",
  announceSectionDone: "All answered. {next} is ready.",
  keysChoose: "choose",
  keysNextQuestion: "next question",
  keysNextSection: "next section",
  keysMove: "move between questions",
  saveNote: "Answers save as you go. You can stop and come back on this phone.",
  resultNotMentioned: "You did not mention ({n})",
  resultAndMore: "…and {n} more",
  reviewNeedAttention: "{n} item(s) still need attention.",
  confirmedTail: "{banner} - you can still change anything below.",
  patternNotSure: "{label} - I cannot tell which",
  rowsFromSchema: "{n} rows from the intake schema.",
  rvSkipped: "null - skipped, never asked",
  rvNotAnswered: "not answered yet",
  rvNoneSelected: "none selected",
  rvNoProducts: "no products used",
  rvNoProcedures: "no procedures done",
  rvSmoking: "smoking",
  rvNoSmoking: "no smoking",
  rvAlcohol: "alcohol",
  rvNoAlcohol: "no alcohol",
  rvHardWater: "hard water",
  rvNoHardWater: "no hard water",
  rvWash: "wash",
  rvHeat: "heat/chemicals",
  rvNoHeat: "no heat",
  rvSalon: "salon",
  rvNoSalon: "no salon",
  rvHelped: "helped",
  rvNoHelp: "no help",
  followUpAllFilled: "All {n} filled in. Check the answers below, then continue.",
  followUpGotIt: "Got it",
  resultNothingMatched: "Nothing in that reply matched this question. Try again, or tap the answers.",
  resultFilledOf: "Filled {got} of {total} answers.",
  resultFilledOfLeft: "Filled {got} of {total} answers - {missed} still to go.",
  vChooseOne: "Choose one option",
  vSetAge: "Set your age",
  vPickRange: "Pick an age range",
  vYesNo: "Choose Yes or No",
  vConsent: "Please choose Yes or No - nothing is selected for you",
  vAtLeastOneOrNone: "Select at least one, or choose \u201cNone of these\u201d",
  vAtLeastOne: "Select at least one option",
  vDescribe: "Describe the side effect so your doctor knows what to avoid",
  vAskYesNo: "choose Yes or No",
  vAskText: "add a short detail",
  vAskOne: "choose one",
  svNotUsed: "Not used",
  svNotDone: "Not done",
  svUsed: "Used",
  svDone: "Done",
  svHelped: "helped",
  svNotHelped: "did not help",
  svHelpUnknown: "help unknown",
  svSideEffects: "side effects",
  svNoSideEffects: "no side effects",
  svSideUnknown: "side effects unknown",
  svSessions: "{n} sessions",
  svSessionsUnknown: "sessions ?",
  voiceSlow: "taking a while - you can also tap below",

  // review
  reviewNote: "{n} questions · shape and coverage checked before download.",
  declinedTitle: "Understood - no genetic test.",
  declinedBody:
    "You have not given permission, so we will not collect a sample and no genetic analysis will happen. You can still share your other answers with your doctor and continue with a normal consultation.",
  declinedNote:
    "No JSON is produced on this path: without consent, this app does not hand the intake on.",
  declinedBack: "Review the consent screen",

  // consent
  consentTitle1: "You give a saliva or blood sample at the clinic.",
  consentTitle2:
    "Your DNA is analysed for genes linked to hair loss, and for how you may respond to hair-loss treatment.",
  consentTitle3:
    "Your doctor uses the result to choose your treatment. It is not a diagnosis on its own.",
  consentTitle4: "You can withdraw consent and ask for your sample to be destroyed at any time.",
  consentPlain2: "We look only at hair-related genes - not ancestry, not disease risk.",
  consentPlain3: "A doctor still makes the decision, with you.",
  consentQuestion: "Do you give permission for this genetic test?",
  consentYes: "Yes, I agree",
  consentNo: "No",
  consentFoot:
    "Nothing is pre-selected on this screen. Choosing \u201cNo\u201d is recorded and stops the test - you can still speak to your doctor.",
  consentPoint1: "You give a saliva or blood sample at the clinic.",
  consentPoint2: "One sample, taken once, at your appointment.",
  consentPoint3: "We look only at hair-related genes - not ancestry, not disease risk.",
  consentPoint4: "Change your mind whenever you like, and the sample is destroyed.",

  // landing
  landingFeatQuestions: "short questions",
  landingFeatQuestionsSub: "in six short groups",
  landingFeatMinutes: "minutes",
  landingFeatMinutesSub: "mostly just tapping",
  landingFeatLangs: "languages",
  landingFeatLangsSub: "English or Hindi, switch any time",
  landingFeatFitted: "fitted to you",
  landingFeatFittedSub: "text size, skipped questions, sensible limits",

  // the name, shown back
  welcome: "Welcome, {name}",
  withName: "{title}, {name}",

  // theme
  themeAria: "Appearance: {theme}. Switch to {next}.",

  // personalisation copy that used to be hard-coded English in lib/patient.ts
  sexFemale: "Female",
  sexMale: "Male",
  sexNotStated: "Not stated",
  noteHirsutism:
    "Compared with what is usual for you - for example on the chin, upper lip, chest or stomach.",
  notePregnancyOlder: "If none of these apply any more, choose Not applicable.",
  noteMenopause: "If your periods have stopped, choose Menopausal.",
  noteOnsetRange: "You are {age}, so this can be anywhere from {min} to {age}.",
  suggestionReason: "You are {age} - is this the right answer?",
  suggestionAccept: "Yes, that is right",
  unavailablePcos: "A condition of the ovaries, so it does not apply to you.",
  // the guided follow-up questions (lib/followups.ts)
  // read-aloud connective tissue
  speechChoices: "The choices are:",
  speechOr: "or",

  fuAlcoholQ: "Do you drink alcohol?",
  fuHeatQ: "Do you use a dryer, straightener, or hair colour?",
  fuSalonQ: "Have you had salon treatments like keratin or smoothening?",
  fuSmokingAmountLabel: "Smoking amount",
  fuSmokingAmountQ: "How much do you smoke?",
  fuSalonDetailLabel: "Salon treatment",
  fuSalonDetailQ: "Which salon treatment did you have?",
  fuUseRow: "Do you use {row}?",
  fuHowLongRow: "How long have you been using {row}?",
  fuHelpedRow: "Did {row} help?",
  fuSideEffectsRow: "Any side effects from {row}?",
  fuHadRow: "Have you had {row}?",
  fuSessionsRow: "How many sessions of {row}?",
  dlHowLong: "how long",
  dlHelped: "did it help",
  dlSideEffects: "side effects",
  dlSessions: "how many sessions",

  // Q14 free text
  sideEffectMore: "Tell us a little more - you can speak it if you prefer.",
  sideEffectPlaceholder: "e.g. minoxidil made my scalp itch and burn",
  sideEffectRequired: "This is required - it tells your doctor what to avoid.",

  // the one-tap accept on a suggestion
  suggestionAcceptWith: "Yes - {value}",

  bandUnder25: "under 25",
  band25to39: "25 to 39",
  band40to54: "40 to 54",
  band55to69: "55 to 69",
  band70plus: "70 or older",
} as const;

export type TextKey = keyof typeof TEXT_EN;

export const TEXT_HI: Record<TextKey, string> = {
  langSwitchToHindi: "हिंदी में भरें",
  langSwitchToEnglish: "Fill in English",
  readAloud: "सवाल पढ़कर सुनाएँ",
  readStop: "पढ़ना बंद करें",
  progressAria: "{total} में से सवाल {n}",

  aboutNameLabel: "हम आपको क्या कहकर बुलाएँ?",
  aboutNameOptional: "ज़रूरी नहीं",
  aboutNamePlaceholder: "पहला नाम",
  aboutNameAria: "पहला नाम, ज़रूरी नहीं",
  aboutNameNote: "ज़रूरी नहीं, और यह उस फ़ॉर्म का हिस्सा नहीं है जो डॉक्टर को जाता है।",
  aboutNameAck: "धन्यवाद, {name}। इसका इस्तेमाल सिर्फ़ स्क्रीन पर होगा।",
  aboutSexLabel: "आप पर क्या लागू होता है?",
  aboutSexAria: "लिंग",
  aboutSexFemale: "महिला",
  aboutSexMale: "पुरुष",
  aboutSexPreferNot: "बताना नहीं चाहते",
  aboutSexTwoApply: "आप पर दो अतिरिक्त सवाल लागू होंगे",
  aboutSexTwoSkipped: "वे दो सवाल छोड़ दिए जाएँगे",
  aboutAgeLabel: "आपकी उम्र क्या है?",
  aboutAgeFieldLabel: "आपकी उम्र, सालों में",
  aboutAgePlaceholder: "उम्र",
  aboutAgeYears: "साल",
  aboutAgeRangeError: "{min} से {max} के बीच उम्र भरें",
  aboutAgeOrPick: "या कोई दायरा चुनें",
  aboutScaleOn: "बाकी फ़ॉर्म के लिए {label} चालू है।",
  aboutScaleUnchanged: "अक्षरों का आकार वैसा ही है, जैसा आपने कहा।",
  aboutScaleChange: "इसे कभी भी ऊपर के Aa बटन से बदल सकते हैं।",

  comfortTitle: "क्या अक्षर बड़े कर दें?",
  comfortBody:
    "आपने बताया कि आपकी उम्र {age} है। हम बाकी फ़ॉर्म में शब्द और बटन बड़े कर सकते हैं। इसके अलावा कुछ नहीं बदलेगा।",
  comfortSample: "यह कितने समय से चल रहा है?",
  comfortNow: "अभी",
  comfortYes: "हाँ, बड़े कर दें",
  comfortNo: "नहीं, ऐसे ही ठीक है",
  comfortDismissAria: "अक्षरों का आकार वैसा ही रखें",
  comfortFoot: "किसी भी हाल में, ऊपर का Aa बटन आकार कभी भी बदल देता है।",
  comfortStandardName: "सामान्य आकार",
  comfortLargeName: "बड़े अक्षर",
  comfortXlName: "सबसे बड़े अक्षर",
  comfortLargeShort: "बड़े",
  comfortXlShort: "सबसे बड़े",
  comfortToggleAria: "{current}। बदलकर {next} करें।",

  onsetFine: "उम्र ठीक करें",
  onsetYears: "साल की उम्र",
  onsetDown: "उम्र कम करें",
  onsetUp: "उम्र बढ़ाएँ",
  onsetAria: "बाल झड़ना शुरू होने की उम्र",
  onsetTeens: "किशोर उम्र",
  onset20s: "20 के दशक",
  onset30s: "30 के दशक",
  onset40s: "40 के दशक",
  onset50s: "50 के बाद",
  onsetTeensHint: "13-19",
  onset20sHint: "20-29",
  onset30sHint: "30-39",
  onset40sHint: "40-49",
  onset50sHint: "50 या बाद में",
  onsetClosed: "आपकी उम्र के बाद",
  onsetBound: "आपने बताया कि आपकी उम्र {age} है, इसलिए इसके बाद की उम्र बंद है।",

  stillNeeded: "अभी बाकी है",
  stillNeededN: "अभी बाकी है ({n})",
  andMore: "…और {n} नीचे",
  unavailableSuffix: "आपके जवाबों के लिए उपलब्ध नहीं",

  habitSmoking: "सिगरेट",
  habitSmokingHelp: "क्या आप सिगरेट पीते हैं?",
  habitAlcohol: "शराब",
  habitAlcoholHelp: "क्या आप शराब पीते हैं?",
  habitWater: "भारी पानी",
  habitWaterHelp: "घर का पानी भारी है?",
  habitWash: "बाल धोना",
  habitWashHelp: "कितनी बार बाल धोते हैं?",
  habitHeat: "गर्मी या केमिकल",
  habitHeatHelp: "ड्रायर, स्ट्रेटनर, या कलर?",
  habitSalon: "सैलून का इलाज",
  habitSalonHelp: "केराटिन, स्मूदनिंग, या ऐसा कुछ?",
  habitHowMuch: "कितना?",
  habitWhich: "कौन सा इलाज?",
  habitSalonPlaceholder: "जैसे केराटिन, करीब 6 महीने पहले",

  colHowLong: "कितने समय से",
  colHelped: "फ़ायदा हुआ?",
  colSideEffects: "कोई साइड इफ़ेक्ट?",
  colSessions: "कितनी सिटिंग",
  rowShampooHelp: "डैंड्रफ़ या दवा वाला शैम्पू",
  rowOilsHelp: "तेल या लगा रहने वाला सीरम",
  rowTopicalHelp: "जो घोल या फ़ोम आप लगाते हैं",
  rowOralHelp: "मिनॉक्सिडिल की गोली",
  rowSupplementsHelp: "बायोटिन, विटामिन, आयरन",
  rowPrpHelp: "आपके ही खून से बने इंजेक्शन",
  rowStemHelp: "स्टेम सेल या एक्सोसोम इलाज",
  rowTransplantHelp: "ट्रांसप्लांट सर्जरी",
  rowOtherHelp: "क्लिनिक का कोई और इलाज",
  required: "ज़रूरी",
  useThis: "इस्तेमाल करता हूँ",
  hadThis: "यह कराया है",

  followUpAria: "बाकी सवाल",
  followUpUseList: "पूरी सूची",
  followUpUseListAria: "इन सवालों को बंद करें और नीचे की पूरी सूची इस्तेमाल करें",
  followUpLast: "आखिरी सवाल का जवाब दें",
  followUpRemaining: "बाकी {n} सवाल एक-एक करके",
  followUpQuicker: "नीचे की सूची में ढूँढने से जल्दी",
  followUpToGo: "बस {n} बाकी",
  followUpAbout: "किसके बारे में:",
  followUpSave: "सेव करें",
  followUpDone: "सब हो गया - {n} जवाब दर्ज",
  followUpDismiss: "बंद करें",

  voiceDenied: "माइक की अनुमति नहीं मिली। आप नीचे टैप करके भर सकते हैं।",
  voiceEmpty: "कुछ सुनाई नहीं दिया। दोबारा कोशिश करें, या नीचे टैप करके जवाब दें।",
  voiceFailed: "कुछ गड़बड़ हो गई। आप नीचे टैप करके भर सकते हैं।",
  voiceFilledCount: "{total} में से {got} जवाब भरे गए",
  voiceHeard: "हमने यह सुना",
  voiceTapStop: "रोकने के लिए टैप करें",
  editDone: "हो गया",
  aboutRowLabel: "लिंग और उम्र",

  shortAbout: "आपके बारे में",
  shortOnset: "शुरू हुआ",
  shortDuration: "कितने समय से",
  shortFamily: "परिवार में",
  shortPattern: "कहाँ से",
  shortConditions: "डॉक्टर ने बताया",
  shortPeriods: "पीरियड",
  shortPregnancy: "गर्भ या प्रसव",
  shortAcne: "मुहांसे या तेलीय त्वचा",
  shortBodyHair: "शरीर या चेहरे के बाल",
  shortPast6m: "पिछले 6 महीने",
  shortHabits: "आदतें",
  shortProducts: "इस्तेमाल की चीज़ें",
  shortProcedures: "क्लिनिक के इलाज",
  shortSideEffects: "साइड इफ़ेक्ट",
  shortSample: "सैंपल",
  shortConsent: "अनुमति",

  summaryNone: "कोई नहीं",
  summaryPlusMore: "{first} +{n}",
  summaryYears: "{age} साल की उम्र",
  summaryCoverage: "{answered} भरे, {inUse} इस्तेमाल में",
  summaryCoverageDone: "{answered} भरे",
  summaryConsentYes: "हाँ, मैं सहमत हूँ: सैंपल और जेनेटिक जाँच",
  summaryConsentNo: "नहीं, अभी नहीं",
  summaryNotAnswered: "अभी जवाब नहीं दिया",

  sectionOf: "{total} में से भाग {n}",
  answeredOf: "{total} में से {n} भरे",
  nextSection: "आगे: {title}",
  finishUp: "जवाब देखें",
  landingKickerRail: "बाल और स्कैल्प जाँच",
  railNav: "भाग",
  announceOpened: "अगला सवाल: {title}",
  announceSectionDone: "सब भर गए। {next} तैयार है।",
  keysChoose: "चुनें",
  keysNextQuestion: "अगला सवाल",
  keysNextSection: "अगला भाग",
  keysMove: "सवालों के बीच जाएँ",
  saveNote: "जवाब अपने आप सेव होते रहते हैं। आप रुककर इसी फ़ोन पर वापस आ सकते हैं।",
  resultNotMentioned: "इनके बारे में आपने कुछ नहीं कहा ({n})",
  resultAndMore: "…और {n} बाकी",
  reviewNeedAttention: "{n} बातों पर ध्यान देना बाकी है।",
  confirmedTail: "{banner} - नीचे कुछ भी बदल सकते हैं।",
  patternNotSure: "{label} - मैं बता नहीं सकता कि कहाँ से",
  rowsFromSchema: "स्कीमा से {n} पंक्तियाँ।",
  rvSkipped: "लागू नहीं - यह सवाल पूछा ही नहीं गया",
  rvNotAnswered: "अभी जवाब नहीं दिया",
  rvNoneSelected: "कुछ नहीं चुना",
  rvNoProducts: "कोई चीज़ इस्तेमाल नहीं करते",
  rvNoProcedures: "कोई इलाज नहीं कराया",
  rvSmoking: "सिगरेट",
  rvNoSmoking: "सिगरेट नहीं",
  rvAlcohol: "शराब",
  rvNoAlcohol: "शराब नहीं",
  rvHardWater: "भारी पानी",
  rvNoHardWater: "पानी भारी नहीं",
  rvWash: "धुलाई",
  rvHeat: "गर्मी/केमिकल",
  rvNoHeat: "गर्मी/केमिकल नहीं",
  rvSalon: "सैलून",
  rvNoSalon: "सैलून नहीं",
  rvHelped: "फ़ायदा हुआ",
  rvNoHelp: "फ़ायदा नहीं",
  followUpAllFilled: "सभी {n} भर गए। नीचे जवाब देख लें, फिर आगे बढ़ें।",
  followUpGotIt: "ठीक है",
  resultNothingMatched: "उस जवाब में इस सवाल से जुड़ी कोई बात नहीं मिली। दोबारा कोशिश करें, या नीचे टैप करके जवाब दें।",
  resultFilledOf: "{total} में से {got} जवाब भर दिए।",
  resultFilledOfLeft: "{total} में से {got} जवाब भर दिए - {missed} अभी बाकी।",
  vChooseOne: "एक विकल्प चुनें",
  vSetAge: "अपनी उम्र बताएँ",
  vPickRange: "उम्र की सीमा चुनें",
  vYesNo: "हाँ या नहीं चुनें",
  vConsent: "कृपया हाँ या नहीं चुनें - कुछ भी पहले से चुना नहीं है",
  vAtLeastOneOrNone: "कम से कम एक चुनें, या \u201cइनमें से कोई नहीं\u201d चुनें",
  vAtLeastOne: "कम से कम एक विकल्प चुनें",
  vDescribe: "साइड इफ़ेक्ट बताइए, जिससे डॉक्टर को पता चले कि क्या टालना है",
  vAskYesNo: "हाँ या नहीं चुनें",
  vAskText: "थोड़ा विवरण जोड़ें",
  vAskOne: "एक चुनें",
  svNotUsed: "इस्तेमाल नहीं करते",
  svNotDone: "नहीं कराया",
  svUsed: "इस्तेमाल करते हैं",
  svDone: "कराया है",
  svHelped: "फ़ायदा हुआ",
  svNotHelped: "फ़ायदा नहीं हुआ",
  svHelpUnknown: "फ़ायदे का पता नहीं",
  svSideEffects: "साइड इफ़ेक्ट हुए",
  svNoSideEffects: "कोई साइड इफ़ेक्ट नहीं",
  svSideUnknown: "साइड इफ़ेक्ट का पता नहीं",
  svSessions: "{n} सिटिंग",
  svSessionsUnknown: "सिटिंग का पता नहीं",
  voiceSlow: "थोड़ा समय लग रहा है - आप नीचे टैप भी कर सकते हैं",

  reviewNote: "{n} सवाल · डाउनलोड से पहले पूरा और सही होना जाँचा गया।",
  declinedTitle: "समझ गए - जेनेटिक टेस्ट नहीं होगा।",
  declinedBody:
    "आपने अनुमति नहीं दी है, इसलिए हम सैंपल नहीं लेंगे और कोई जेनेटिक जाँच नहीं होगी। आप अपने बाकी जवाब डॉक्टर को दिखा सकते हैं और सामान्य सलाह ले सकते हैं।",
  declinedNote: "इस रास्ते पर कोई JSON नहीं बनता: अनुमति के बिना यह ऐप जानकारी आगे नहीं भेजता।",
  declinedBack: "अनुमति वाला सवाल फिर देखें",

  consentTitle1: "आप क्लिनिक में थूक या खून का सैंपल देते हैं।",
  consentTitle2:
    "आपके DNA की जाँच बाल झड़ने से जुड़े जीन के लिए होती है, और यह देखने के लिए कि इलाज आप पर कैसा असर करेगा।",
  consentTitle3:
    "डॉक्टर इस नतीजे से आपका इलाज तय करते हैं। यह अपने आप में कोई निदान नहीं है।",
  consentTitle4: "आप कभी भी अनुमति वापस ले सकते हैं और सैंपल नष्ट करने को कह सकते हैं।",
  consentPlain2: "हम सिर्फ़ बालों से जुड़े जीन देखते हैं - वंशावली या बीमारी का खतरा नहीं।",
  consentPlain3: "फ़ैसला डॉक्टर ही आपके साथ मिलकर करते हैं।",
  consentQuestion: "क्या आप इस जेनेटिक टेस्ट के लिए अनुमति देते हैं?",
  consentYes: "हाँ, मैं सहमत हूँ",
  consentNo: "नहीं",
  consentFoot:
    "इस स्क्रीन पर कुछ भी पहले से चुना नहीं है। \u201cनहीं\u201d चुनना भी दर्ज होता है और टेस्ट रोक देता है - आप फिर भी डॉक्टर से बात कर सकते हैं।",
  consentPoint1: "आप क्लिनिक में थूक या खून का सैंपल देते हैं।",
  consentPoint2: "एक ही सैंपल, एक ही बार, आपकी अपॉइंटमेंट पर।",
  consentPoint3: "हम सिर्फ़ बालों से जुड़े जीन देखते हैं - वंशावली या बीमारी का खतरा नहीं।",
  consentPoint4: "आप जब चाहें मना कर सकते हैं, और सैंपल नष्ट कर दिया जाता है।",

  landingFeatQuestions: "छोटे सवाल",
  landingFeatQuestionsSub: "छह छोटे हिस्सों में",
  landingFeatMinutes: "मिनट",
  landingFeatMinutesSub: "ज़्यादातर सिर्फ़ टैप करना",
  landingFeatLangs: "भाषाएँ",
  landingFeatLangsSub: "अंग्रेज़ी या हिंदी, कभी भी बदलें",
  landingFeatFitted: "आपके हिसाब से",
  landingFeatFittedSub: "अक्षरों का आकार, छोड़े गए सवाल, सही सीमाएँ",

  welcome: "स्वागत है, {name}",
  withName: "{title}, {name}",

  themeAria: "रंग-रूप: {theme}। बदलकर {next} करें।",

  sexFemale: "महिला",
  sexMale: "पुरुष",
  sexNotStated: "बताया नहीं",
  noteHirsutism: "आपके लिए जो सामान्य है, उसकी तुलना में - जैसे ठोड़ी, ऊपरी होंठ, छाती या पेट पर।",
  notePregnancyOlder: "अगर इनमें से कुछ अब लागू नहीं होता, तो “लागू नहीं” चुनें।",
  noteMenopause: "अगर आपके पीरियड बंद हो गए हैं, तो “बंद हो चुके हैं” चुनें।",
  noteOnsetRange: "आपकी उम्र {age} है, इसलिए यह {min} से {age} के बीच कुछ भी हो सकता है।",
  suggestionReason: "आपकी उम्र {age} है - क्या यही जवाब सही है?",
  suggestionAccept: "हाँ, यही सही है",
  unavailablePcos: "यह ओवरी से जुड़ी समस्या है, इसलिए आप पर लागू नहीं होती।",
  speechChoices: "विकल्प ये हैं:",
  speechOr: "या",

  fuAlcoholQ: "क्या आप शराब पीते हैं?",
  fuHeatQ: "क्या आप ड्रायर, स्ट्रेटनर या कलर इस्तेमाल करते हैं?",
  fuSalonQ: "क्या आपने सैलून में केराटिन या स्मूदनिंग जैसा इलाज कराया है?",
  fuSmokingAmountLabel: "सिगरेट की मात्रा",
  fuSmokingAmountQ: "आप दिन में कितनी सिगरेट पीते हैं?",
  fuSalonDetailLabel: "सैलून का इलाज",
  fuSalonDetailQ: "आपने कौन सा सैलून इलाज कराया था?",
  fuUseRow: "क्या आप {row} इस्तेमाल करते हैं?",
  fuHowLongRow: "{row} कितने समय से इस्तेमाल कर रहे हैं?",
  fuHelpedRow: "{row} से फ़ायदा हुआ?",
  fuSideEffectsRow: "{row} से कोई साइड इफ़ेक्ट हुआ?",
  fuHadRow: "क्या आपने {row} कराया है?",
  fuSessionsRow: "{row} की कितनी सिटिंग हुईं?",
  dlHowLong: "कितने समय से",
  dlHelped: "फ़ायदा हुआ",
  dlSideEffects: "साइड इफ़ेक्ट",
  dlSessions: "कितनी सिटिंग",

  sideEffectMore: "थोड़ा और बताइए - चाहें तो बोलकर भी बता सकते हैं।",
  sideEffectPlaceholder: "जैसे मिनॉक्सिडिल से सिर में खुजली और जलन हुई",
  sideEffectRequired: "यह ज़रूरी है - इससे डॉक्टर को पता चलता है कि क्या टालना है।",

  suggestionAcceptWith: "हाँ - {value}",

  bandUnder25: "25 से कम",
  band25to39: "25 से 39",
  band40to54: "40 से 54",
  band55to69: "55 से 69",
  band70plus: "70 या ज़्यादा",
};
