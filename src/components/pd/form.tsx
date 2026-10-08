import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ProcureDesk form primitives. Every field in the product uses the shared `.pd-input`
 * styles (src/styles.css), so a change here or there updates all screens.
 */
type Invalid = { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Invalid>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} aria-invalid={invalid || undefined} className={cn("pd-input", className)} {...p} />
));
TextInput.displayName = "TextInput";

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid>(({ className, invalid, ...p }, ref) => (
  <textarea ref={ref} aria-invalid={invalid || undefined} className={cn("pd-input", className)} {...p} />
));
TextArea.displayName = "TextArea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Invalid>(({ className, invalid, ...p }, ref) => (
  <select ref={ref} aria-invalid={invalid || undefined} className={cn("pd-input", className)} {...p} />
));
Select.displayName = "Select";

export function Checkbox({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" {...p} />
      {label}
    </label>
  );
}

export function Radio({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="radio" {...p} />
      {label}
    </label>
  );
}

export function FieldHint({ children, error }: { children: ReactNode; error?: boolean }) {
  return <p className={cn("mt-1 text-xs", error ? "text-destructive" : "text-muted-foreground")}>{children}</p>;
}
