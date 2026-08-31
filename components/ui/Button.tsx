"use client";

/**
 * shadcn/ui-style primitives, hand-written rather than pulled via the CLI.
 *
 * The brief calls for shadcn/ui; these keep its API shape (variant/size props, a
 * `cn()` merge, class overrides win) but drop the Radix dependency because nothing
 * in this form needs a portal, a popover or focus trapping - every control is a
 * plain <button>, which is what a screen reader and a thumb both handle best.
 * Minimum height is 48px on every variant, above the 44px floor.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-strong hover:shadow-md active:bg-brand-strong disabled:bg-line disabled:text-muted disabled:shadow-none disabled:hover:shadow-none",
  secondary: "bg-card text-ink border border-line hover:border-brand/50 hover:bg-brand-soft/40 active:bg-paper",
  ghost: "bg-transparent text-muted hover:bg-brand-soft hover:text-brand-ink active:bg-brand-soft",
  danger: "bg-card text-warn border border-warn/30 hover:bg-warn/10 active:bg-warn/5",
};

const SIZES: Record<Size, string> = {
  md: "min-h-[48px] px-4 text-[15px]",
  lg: "min-h-[56px] px-5 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold",
        "transition-[transform,background-color] duration-100 active:scale-[0.985]",
        "disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

/**
 * The one control this form is really built out of: a big selectable card.
 * `selected` drives colour, weight and a check mark, so state is never colour-only.
 */
export function OptionCard({
  selected,
  label,
  gloss,
  icon,
  onSelect,
  multi = false,
  className,
}: {
  selected: boolean;
  label: string;
  gloss?: string;
  /** Optional line drawing (see OptionIcons.tsx) shown between the box and the label. */
  icon?: React.ReactNode;
  onSelect: () => void;
  multi?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left",
        "min-h-[56px] transition-all duration-100 active:scale-[0.99]",
        selected
          ? "border-brand bg-brand-soft"
          : "border-line bg-card hover:border-brand/45 hover:bg-brand-soft/35 active:border-brand/40",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center border-2 transition-colors",
          multi ? "rounded-md" : "rounded-full",
          selected ? "border-brand bg-brand text-white" : "border-line bg-card",
        )}
      >
        {selected ? <CheckIcon /> : null}
      </span>
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center transition-colors",
            selected ? "text-brand-ink" : "text-muted",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[15px] leading-snug",
            selected ? "font-semibold text-brand-ink" : "font-medium text-ink",
          )}
        >
          {label}
        </span>
        {gloss ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-muted">{gloss}</span>
        ) : null}
      </span>
    </button>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={cn("size-4", className)}
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 8 14.5 16 6" />
    </svg>
  );
}

/** Small pill used for the editable chips after a voice fill. */
export function Chip({
  children,
  tone = "neutral",
  onClick,
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "filled" | "gap";
  onClick?: () => void;
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-card text-ink",
    filled: "border-brand/40 bg-brand-soft text-brand-ink",
    gap: "border-dashed border-warn/50 bg-warn/5 text-warn",
  } as const;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2",
        "text-[13px] font-medium leading-none",
        tones[tone],
        onClick && "transition-transform hover:scale-[1.03] active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
