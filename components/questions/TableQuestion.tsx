"use client";

/**
 * Q11 / Q12 / Q13 - the three questions that are a table rather than a choice.
 *
 * Habits is six rows, products five, treatments four, and two of them have rows that ask
 * for detail once switched on. That is all this component does now: render the grid and
 * write what the patient taps.
 *
 * It used to be a three-stage machine wrapped around the same grid - a full-screen speak
 * surface, a result popup, then the grid - plus a guided flow that took the card over to ask
 * the outstanding fields one at a time. All of that is gone, on the instruction that voice
 * come out and that a nested question not replace the question it belongs to.
 *
 * The second half of that is the part worth recording, because the removed version was the
 * more clever one. Answering "yes" to a product creates three more questions (how long, did
 * it help, side effects), and the flow used to hand them over as their own full-size cards.
 * It read well in isolation and it meant that switching one row on made the other four
 * disappear - the patient lost the list they were working down. Revealing the detail inline,
 * underneath the row that unlocked it, keeps the whole table on screen and the context with
 * it. `HabitsGrid` and `TableGrid` were already doing exactly that; the flow was a second
 * answer to a question that already had one.
 *
 * What did NOT get removed: `lib/followups.ts`. It describes which fields a row owes and is
 * what `validateStep` counts to decide whether the question is complete, so the grid and the
 * "still needed" summary cannot disagree about what is missing.
 */
import { PRODUCT_DUR, PRODUCT_ROWS, PROCEDURE_ROWS, SESSIONS } from "@/lib/types";
import type { Answers } from "@/lib/types";
import { t, type Lang } from "@/lib/i18n";
import { HabitsGrid } from "./HabitsGrid";
import { TableGrid, type ColumnSpec } from "./TableGrid";

/*
  Column labels and row glosses as translation keys rather than sentences. Built per
  render from `lang` because they are read by the patient, unlike the row keys beside
  them, which are schema strings and never change.
*/
const productColumns = (lang: Lang): ColumnSpec[] => [
  { key: "duration", label: t("colHowLong", lang), kind: "options", options: PRODUCT_DUR },
  { key: "helped", label: t("colHelped", lang), kind: "yesno" },
  { key: "side_effects", label: t("colSideEffects", lang), kind: "yesno" },
];

const procedureColumns = (lang: Lang): ColumnSpec[] => [
  { key: "sessions", label: t("colSessions", lang), kind: "options", options: SESSIONS },
  { key: "helped", label: t("colHelped", lang), kind: "yesno" },
];

const productGloss = (lang: Lang): Record<string, string> => ({
  "OTC/Medicated Shampoos": t("rowShampooHelp", lang),
  "Hair Oils/Serums": t("rowOilsHelp", lang),
  "Topical Minoxidil": t("rowTopicalHelp", lang),
  "Oral Minoxidil": t("rowOralHelp", lang),
  Supplements: t("rowSupplementsHelp", lang),
});

const procedureGloss = (lang: Lang): Record<string, string> => ({
  "PRP/GFC/iPRF": t("rowPrpHelp", lang),
  "Stem Cells/Exosomes": t("rowStemHelp", lang),
  "Hair Transplant": t("rowTransplantHelp", lang),
  Other: t("rowOtherHelp", lang),
});

export function TableQuestion({
  questionKey,
  answers,
  patch,
  lang,
}: {
  questionKey: "habits" | "products" | "procedures";
  answers: Answers;
  patch: (p: Partial<Answers>) => void;
  lang: Lang;
}) {
  if (questionKey === "habits") {
    return (
      <HabitsGrid
        lang={lang}
        value={answers.habits}
        onChange={(p) => patch({ habits: { ...answers.habits, ...p } })}
      />
    );
  }

  if (questionKey === "products") {
    return (
      <TableGrid
        rows={PRODUCT_ROWS}
        lang={lang}
        flagKey="used"
        detailColumns={productColumns(lang)}
        rowGloss={productGloss(lang)}
        value={answers.products as unknown as Record<string, Record<string, unknown>>}
        onChangeRow={(row, p) =>
          patch({
            products: {
              ...answers.products,
              [row]: { ...answers.products[row as keyof Answers["products"]], ...p },
            } as Answers["products"],
          })
        }
      />
    );
  }

  return (
    <TableGrid
      rows={PROCEDURE_ROWS}
      lang={lang}
      flagKey="done"
      detailColumns={procedureColumns(lang)}
      rowGloss={procedureGloss(lang)}
      value={answers.procedures as unknown as Record<string, Record<string, unknown>>}
      onChangeRow={(row, p) =>
        patch({
          procedures: {
            ...answers.procedures,
            [row]: { ...answers.procedures[row as keyof Answers["procedures"]], ...p },
          } as Answers["procedures"],
        })
      }
    />
  );
}
