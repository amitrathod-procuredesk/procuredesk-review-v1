import type { ReactNode } from "react";
import type { AssetStatus, Tone } from "@/lib/pd/assets";
import { FieldHint } from "@/components/pd/form";
import { cn } from "@/lib/utils";

export const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-muted-foreground",
  blue: "bg-primary/10 text-primary",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  red: "bg-destructive/10 text-destructive",
  violet: "bg-ai/10 text-ai",
};
export const DOT: Record<Tone, string> = { neutral: "bg-muted-foreground", blue: "bg-primary", green: "bg-success", amber: "bg-warning", red: "bg-destructive", violet: "bg-ai" };

export function StatusPill({ s, className }: { s?: Pick<AssetStatus, "name" | "tone">; className?: string }) {
  if (!s) return null;
  return <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium", TONES[s.tone], className)}><span className={cn("size-1.5 rounded-full", DOT[s.tone])} />{s.name}</span>;
}

export function Card({ title, desc, children, action, className, id }: { title?: ReactNode; desc?: ReactNode; children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("pd-panel scroll-mt-24 p-4 md:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>{title && <h3 className="text-sm font-semibold">{title}</h3>}{desc && <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, error, children, htmlFor, required, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; required?: boolean; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="pd-label">{label}{required && <span className="text-destructive"> *</span>}</label>
      {children}
      {error ? <FieldHint error>{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function Meta({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-[13px]">{v || <span className="text-muted-foreground/70">—</span>}</dd>
    </div>
  );
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const relDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`);
