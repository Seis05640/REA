import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import type { JobStatus } from "@rea-studio/core/types";

const cx = (...parts: (string | false | undefined | null)[]) =>
  parts.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "ghost" | "danger" | "quiet";

export const buttonClass = (variant: ButtonVariant = "primary", extra?: string) =>
  cx(
    "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-[background,color,border-color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
    variant === "primary" &&
      "bg-ink text-paper hover:bg-signal hover:text-signal-ink border border-ink hover:border-signal",
    variant === "ghost" &&
      "border border-ink/70 text-ink hover:border-signal hover:text-signal bg-transparent",
    variant === "danger" &&
      "border border-err text-err hover:bg-err hover:text-paper bg-transparent",
    variant === "quiet" && "text-ink-2 hover:text-signal underline-offset-4 hover:underline px-1",
    extra,
  );

export const Button = ({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button className={buttonClass(variant, className)} {...props} />
);

const fieldClass =
  "w-full border border-rule bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cx(fieldClass, className)} {...props} />
);

export const Textarea = ({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cx(fieldClass, "min-h-24 leading-relaxed", className)} {...props} />
);

export const Select = ({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cx(fieldClass, "appearance-none pr-8", className)} {...props}>
    {children}
  </select>
);

export const Field = ({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <label
      htmlFor={htmlFor}
      className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-2"
    >
      {label}
    </label>
    {children}
    {hint ? <p className="text-xs leading-relaxed text-ink-3">{hint}</p> : null}
  </div>
);

export const Card = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={cx("border border-rule bg-card p-5 shadow-[3px_3px_0_var(--rule)]", className)}>
    {children}
  </section>
);

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-signal">{children}</p>
);

export const PageTitle = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) => (
  <header className="rise mb-8 flex flex-col gap-2 border-b border-rule pb-6">
    <Eyebrow>{eyebrow}</Eyebrow>
    <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">{title}</h1>
    {children ? <div className="max-w-2xl text-sm leading-relaxed text-ink-2">{children}</div> : null}
  </header>
);

const STATUS_STYLE: Record<JobStatus, { label: string; className: string; live?: boolean }> = {
  queued: { label: "Queued", className: "border-ink-3 text-ink-2" },
  running: { label: "Running", className: "border-signal text-signal", live: true },
  waiting_approval: { label: "Needs you", className: "border-warn text-warn", live: true },
  succeeded: { label: "Done", className: "border-ok text-ok" },
  failed: { label: "Failed", className: "border-err text-err" },
  cancelled: { label: "Cancelled", className: "border-ink-3 text-ink-3" },
};

export const StatusPill = ({ status }: { status: JobStatus }) => {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em]",
        style.className,
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full bg-current", style.live && "pulse-dot")} />
      {style.label}
    </span>
  );
};

export const Tag = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center border border-rule bg-paper-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-2">
    {children}
  </span>
);
