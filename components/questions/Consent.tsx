"use client";

/**
 * Q16 - its own screen, never pre-ticked.
 *
 * GenoRoot is a genetic test, so consent here covers a DNA sample and genetic
 * analysis. That deserves plain English about what is collected, what is analysed
 * and what happens to the sample, in plain language - not a checkbox labelled
 * "I agree to the terms".
 *
 * The decline path is a first-class outcome: choosing "No" is recorded as
 * consent: false and the Review screen then refuses to produce the JSON.
 */
import { YesNo } from "./YesNo";
import { t, type Lang } from "@/lib/i18n";
import type { TextKey } from "@/lib/copy.hi";

/**
 * Four points, each with a short plain-English restatement underneath.
 *
 * The top line is the accurate sentence; the line below is the same thing said the way
 * you would say it out loud. Consent that is technically complete but unreadable is not
 * informed consent, and this is a DNA sample, not a newsletter signup.
 */
const POINTS: { title: TextKey; plain: TextKey }[] = [
  { title: "consentTitle1", plain: "consentPoint2" },
  { title: "consentTitle2", plain: "consentPlain2" },
  { title: "consentTitle3", plain: "consentPlain3" },
  { title: "consentTitle4", plain: "consentPoint4" },
];

export function Consent({
  value,
  onChange,
  lang,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  lang: Lang;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3 rounded-2xl border border-line bg-card p-3.5">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium leading-snug text-ink">
                {t(p.title, lang)}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">
                {t(p.plain, lang)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div>
        <p className="mb-3 text-[15px] font-semibold leading-snug text-ink">
          {t("consentQuestion", lang)}
        </p>
        {/* No onAdvance: consent is the one answer that must not auto-advance. */}
        <YesNo
          value={value}
          onChange={onChange}
          lang={lang}
          yesLabel={t("consentYes", lang)}
          noLabel={t("consentNo", lang)}
        />
      </div>

      <p className="text-[12px] leading-relaxed text-muted">{t("consentFoot", lang)}</p>
    </div>
  );
}
