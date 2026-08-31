"use client";

/**
 * Q16 — its own screen, never pre-ticked.
 *
 * GenoRoot is a genetic test, so consent here covers a DNA sample and genetic
 * analysis. That deserves plain English about what is collected, what is analysed
 * and what happens to the sample, in plain language — not a checkbox labelled
 * "I agree to the terms".
 *
 * The decline path is a first-class outcome: choosing "No" is recorded as
 * consent: false and the Review screen then refuses to produce the JSON.
 */
import { YesNo } from "./YesNo";

/**
 * Four points, each with a short plain-English restatement underneath.
 *
 * The top line is the accurate sentence; the line below is the same thing said the way
 * you would say it out loud. Consent that is technically complete but unreadable is not
 * informed consent, and this is a DNA sample, not a newsletter signup.
 */
const POINTS: { title: string; plain: string }[] = [
  {
    title: "You give a saliva or blood sample at the clinic.",
    plain: "One sample, taken once, at your appointment.",
  },
  {
    title:
      "Your DNA is analysed for genes linked to hair loss, and for how you may respond to hair-loss treatment.",
    plain: "We look only at hair-related genes — not ancestry, not disease risk.",
  },
  {
    title:
      "Your doctor uses the result to choose your treatment. It is not a diagnosis on its own.",
    plain: "A doctor still makes the decision, with you.",
  },
  {
    title: "You can withdraw consent and ask for your sample to be destroyed at any time.",
    plain: "Change your mind whenever you like, and the sample is destroyed.",
  },
];

export function Consent({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3 rounded-2xl border border-line bg-card p-3.5">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium leading-snug text-ink">
                {p.title}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-muted">{p.plain}</span>
            </span>
          </li>
        ))}
      </ul>

      <div>
        <p className="mb-3 text-[15px] font-semibold leading-snug text-ink">
          Do you give permission for this genetic test?
        </p>
        {/* No onAdvance: consent is the one answer that must not auto-advance. */}
        <YesNo
          value={value}
          onChange={onChange}
          yesLabel="Yes, I agree"
          noLabel="No"
        />
      </div>

      <p className="text-[12px] leading-relaxed text-muted">
        Nothing is pre-selected on this screen. Choosing &ldquo;No&rdquo; is recorded and stops
        the test — you can still speak to your doctor.
      </p>
    </div>
  );
}
