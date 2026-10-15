import type { ReactNode } from "react";
import { Box, Bus, Hammer, Laptop, Package, Sofa, type LucideIcon } from "lucide-react";
import type { Asset } from "@/lib/pd/assetRegister";
import type { AssetStatus, Tone } from "@/lib/pd/assets";
import { FieldHint, Select } from "@/components/pd/form";
import { SITES } from "@/lib/pd/assetRegister";
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

export const BTN_PRIMARY = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_GHOST = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground";

export const CAT_ICON: Record<string, LucideIcon> = { "cat-it": Laptop, "cat-veh": Bus, "cat-fur": Sofa, "cat-mch": Hammer, "cat-sw": Package };

export function AssetThumb({ a, size = "sm" }: { a: Pick<Asset, "photos" | "categoryId">; size?: "sm" | "lg" }) {
  const Icon = CAT_ICON[a.categoryId] ?? Box;
  const cls = size === "sm" ? "size-9 rounded-md" : "size-16 rounded-lg";
  return a.photos[0]
    ? <img src={a.photos[0].url} alt="" className={cn(cls, "shrink-0 object-cover ring-1 ring-border")} />
    : <span className={cn(cls, "inline-flex shrink-0 items-center justify-center bg-subtle text-muted-foreground ring-1 ring-border")}><Icon className={size === "sm" ? "size-4" : "size-6"} /></span>;
}

export function HolderToggle({ v, set }: { v: "user" | "site"; set: (k: "user" | "site") => void }) {
  return (
    <div className="inline-flex rounded-md bg-subtle p-0.5 text-[12px]">
      {(["user", "site"] as const).map((k) => <button key={k} type="button" onClick={() => set(k)} aria-pressed={v === k} className={cn("h-6 rounded px-2 transition-colors", v === k ? "bg-surface font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>{k === "user" ? "Person" : "Location / job site"}</button>)}
    </div>
  );
}

export function HolderPick({ kind, value, people, onChange, error }: { kind: "user" | "site"; value?: { kind: string; userId?: string; site?: string }; people: { id: string; name: string; title: string }[]; onChange: (h: { kind: "user" | "site"; userId?: string; site?: string } | undefined) => void; error?: string }) {
  return (
    <>
      {kind === "user"
        ? <Select aria-label="Person" value={value?.userId ?? ""} invalid={!!error} onChange={(e) => onChange(e.target.value ? { kind: "user", userId: e.target.value } : undefined)}><option value="">Choose a person…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}</Select>
        : <Select aria-label="Location or job site" value={value?.site ?? ""} invalid={!!error} onChange={(e) => onChange(e.target.value ? { kind: "site", site: e.target.value } : undefined)}><option value="">Choose a location…</option>{SITES.map((x) => <option key={x}>{x}</option>)}</Select>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  );
}
