"use client";

/**
 * One labelled text input, with its error message and the aria that ties them together.
 *
 * It exists because there were three hand-wired inputs in the app and each one remembered a
 * different subset of the job: one had `aria-invalid` but no `aria-describedby`, one had a
 * label element and one an `aria-label`, and the error paragraph's id was spelled out at the
 * call site both times. That is the kind of thing that is correct on the day it is written
 * and wrong after the next edit.
 *
 * It takes a `ref` because React Hook Form registers fields by ref, and `shouldFocusError`
 * needs a real element to focus when a blocked Next reports what is missing.
 */
import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Small uppercase note beside the label, e.g. "optional". */
  badge?: string;
  /** Validation message. Its presence is what marks the field invalid. */
  error?: string;
  /** Quiet line under the field, shown only while there is no error to show instead. */
  hint?: React.ReactNode;
  /** Unit or affix pinned inside the right edge, e.g. "years". */
  suffix?: string;
  /** Bigger and bolder, for a field holding one short number. */
  emphasis?: boolean;
  /**
   * Classes for the box AROUND the input, which is what a width belongs on.
   *
   * Putting `max-w` on the input itself narrows the input while leaving this wrapper full
   * width, and the suffix is positioned against the wrapper - so "years" ended up floating
   * in the space to the right of the field it belongs to.
   */
  boxClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, badge, error, hint, suffix, emphasis = false, className, boxClassName, ...input },
  ref,
) {
  const auto = useId();
  const id = input.id ?? auto;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = error !== undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 flex items-baseline gap-2">
        <span className="text-[15px] font-bold text-ink">{label}</span>
        {badge !== undefined ? (
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
            {badge}
          </span>
        ) : null}
      </label>

      <div className={cn("relative", boxClassName)}>
        <input
          {...input}
          id={id}
          ref={ref}
          aria-invalid={invalid}
          /*
            Points at whichever line is actually on screen. Naming an element that is not
            rendered leaves a screen reader announcing a field "described by" nothing.
          */
          aria-describedby={invalid ? errorId : hint !== undefined ? hintId : undefined}
          className={cn(
            "w-full rounded-2xl border-2 bg-card px-4 text-ink transition-colors",
            "placeholder:text-muted/60 focus:outline-none",
            emphasis
              ? "min-h-[60px] text-[24px] font-bold tabular-nums placeholder:text-[17px] placeholder:font-medium"
              : "min-h-[54px] text-[17px]",
            invalid ? "border-warn" : "border-line focus:border-brand",
            suffix !== undefined && "pr-16",
            className,
          )}
        />
        {suffix !== undefined ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-muted"
          >
            {suffix}
          </span>
        ) : null}
      </div>

      {invalid ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] font-medium text-warn">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={hintId} className="mt-1.5 text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
