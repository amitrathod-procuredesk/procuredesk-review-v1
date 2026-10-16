import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Car, Check, ChevronDown, Cog, Printer, Router, Server, Stethoscope, Armchair, Box, Building2, Bus, Camera, Cpu, Forklift, Laptop, Monitor, Package, Smartphone, Truck, Wrench, KeyRound, ChevronRight, Lock, Minus, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { FieldHint, Select, TextInput } from "@/components/pd/form";
import {
  MONTHS, METHOD_LABEL, categoryIssues, defaultAssetSettings, formatAssetId, numberingIssues, previewAssetId, rangeIssues, resetModeOf, suggestCode, slug,
  type AlertEvent, type AssetCategory, type AssetSettings, type AssetStatus, type CustomField, type DepMethod, type IntegrationId, type NumberRange, type Tone,
} from "@/lib/pd/assets";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "numbering", label: "Numbering" },
  { id: "categories", label: "Categories" },
  { id: "statuses", label: "Statuses" },
  { id: "depreciation", label: "Depreciation" },
  { id: "fields", label: "Custom fields" },
  { id: "alerts", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/app/assets/settings")({
  validateSearch: z.object({ section: z.enum(SECTIONS.map((s) => s.id) as [SectionId, ...SectionId[]]).optional() }),
  head: () => ({
    meta: [
      { title: "Asset settings · ProcureDesk" },
      { name: "description", content: "Configure how assets are numbered, categorized, and depreciated across your organization." },
      { property: "og:title", content: "Asset settings · ProcureDesk" },
      { property: "og:description", content: "Configure how assets are numbered, categorized, and depreciated across your organization." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetSettingsPage,
});

const DOT: Record<Tone, string> = { neutral: "bg-muted-foreground", blue: "bg-primary", green: "bg-success", amber: "bg-warning", red: "bg-destructive", violet: "bg-ai" };
const uidx = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const int = (v: string, fallback = 0) => { const n = parseInt(v.replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : fallback; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const BTN_OUTLINE = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-subtle disabled:opacity-50";
const BTN_PRIMARY = "inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
const BTN_GHOST = "h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground";

function AssetSettingsPage() {
  const db = useDB();
  const me = useMe();
  const saved = db.assets ?? defaultAssetSettings();
  // Asset settings are editable by every signed-in user (prototype); every save is stamped with who made it.
  const canEdit = !!me;
  const { section = "numbering" } = Route.useSearch();
  const [draft, setDraft] = useState<AssetSettings>(() => structuredClone(saved));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { if (!dirty) setDraft(structuredClone(saved)); }, [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (fn: (d: AssetSettings) => void) => setDraft((p) => { const n = structuredClone(p); fn(n); return n; });
  const numErr = numberingIssues(draft.numbering);
  const errorCount = Object.keys(numErr).length;
  const save = () => {
    if (errorCount) { toast.error("Fix the highlighted fields first"); return; }
    const next = { ...draft, updatedAt: new Date().toISOString(), updatedBy: me?.id };
    mutate((d) => { d.assets = next; });
    setDraft(structuredClone(next));
    toast.success("Asset settings saved");
  };
  const discard = () => setDraft(structuredClone(saved));

  // Live asset counts per category and status.
  const items = (db as { assetItems?: { categoryId: string; statusId: string }[] }).assetItems ?? [];
  const catCount = (id: string) => items.filter((a) => a.categoryId === id).length;
  const statusCount = (id: string) => items.filter((a) => a.statusId === id).length;

  const [active, setActive] = useState<SectionId>(section);
  useEffect(() => { if (section !== "numbering") document.getElementById(`as-${section}`)?.scrollIntoView({ block: "start" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`as-${s.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id.slice(3) as SectionId);
    }, { rootMargin: "-90px 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  const go = (id: SectionId) => { setActive(id); document.getElementById(`as-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="mx-auto max-w-6xl p-4 pb-28 md:p-6 md:pb-28">
      <div className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/app/assets/register" className="hover:text-foreground">Assets</Link><ChevronRight className="size-3" /><span>Settings</span>
        </nav>
        <h1 className="pd-h1">Asset Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Configure how assets are numbered, categorized, and depreciated across your organization.</p>
      </div>

      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2 text-[13px] text-muted-foreground">
          <Lock className="size-3.5" /> You can view these settings. Only admins can change them.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[176px_1fr]">
        <nav aria-label="Asset settings sections" className="pd-scroll-hide -mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:top-[84px] md:mx-0 md:block md:space-y-0.5 md:self-start md:rounded-lg md:border md:border-border md:bg-surface md:p-1.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={s.id === active ? "true" : undefined}
              className={cn("flex h-8 w-full shrink-0 items-center rounded-md px-2.5 text-left text-[13px] transition-colors", s.id === active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-subtle")}>
              {s.label}
            </button>
          ))}
        </nav>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          <NumberingSection d={draft} set={set} err={numErr} />
          <CategoriesSection d={draft} set={set} count={catCount} canEdit={canEdit} />
          <StatusesSection d={draft} set={set} count={statusCount} canEdit={canEdit} />
          <DepreciationSection d={draft} set={set} />
          <FieldsSection d={draft} set={set} canEdit={canEdit} />
          <AlertsSection d={draft} set={set} />
          <IntegrationsSection d={draft} setDraft={setDraft} />
        </fieldset>
      </div>

      {canEdit && (
        <div className={cn("fixed inset-x-0 bottom-14 z-30 flex justify-center px-4 transition-all duration-200 md:bottom-6", dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
          <div role="region" aria-label="Unsaved changes" className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-lg">
            {errorCount ? <AlertTriangle className="size-4 text-destructive" /> : null}
            <p className="flex-1 text-[13px]">{errorCount ? "Fix the highlighted fields before saving" : "You have unsaved changes"}</p>
            <button onClick={discard} className={BTN_GHOST}>Discard</button>
            <button onClick={save} className={BTN_PRIMARY}>Save changes</button>
          </div>
        </div>
      )}
    </div>
  );
}

type SP = { d: AssetSettings; set: (fn: (d: AssetSettings) => void) => void };

function Section({ id, title, desc, action, children }: { id: SectionId; title: string; desc: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={`as-${id}`} className="pd-panel scroll-mt-24 p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{desc}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="pd-label">{label}</label>
      {children}
      {error ? <FieldHint error>{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-md bg-primary/[0.06] px-3 py-2.5 text-[12px] text-primary">{children}</p>;
}

function RowMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><MoreHorizontal className="size-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((i) => <DropdownMenuItem key={i.label} onSelect={i.onSelect} className={cn(i.danger && "text-destructive focus:text-destructive")}>{i.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CATEGORY_ICONS = { box: Box, package: Package, laptop: Laptop, monitor: Monitor, phone: Smartphone, cpu: Cpu, printer: Printer, network: Router, server: Server, car: Car, truck: Truck, bus: Bus, forklift: Forklift, machinery: Cog, tool: Wrench, furniture: Armchair, building: Building2, medical: Stethoscope, camera: Camera, license: KeyRound } as const;
const CATEGORY_ICON_LABEL: Record<keyof typeof CATEGORY_ICONS, string> = { box: "General asset", package: "Package / inventory", laptop: "Laptops & computers", monitor: "Monitors & displays", phone: "Phones & tablets", cpu: "Electronics", printer: "Printers & scanners", network: "Network equipment", server: "Servers & data center", car: "Cars", truck: "Trucks", bus: "Buses", forklift: "Forklifts & heavy equipment", machinery: "Machinery", tool: "Tools", furniture: "Furniture", building: "Buildings & property", medical: "Medical equipment", camera: "Cameras & AV", license: "Software licenses" };
type CatIconKey = keyof typeof CATEGORY_ICONS;
function CatIcon({ icon }: { icon?: string }) {
  const I = CATEGORY_ICONS[(icon as CatIconKey) ?? "box"] ?? Box;
  return <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><I className="size-3.5" /></span>;
}

/* ───────────── Numbering ───────────── */
const YEAR_OPTS = [
  { v: "none", label: "No" },
  { v: "YY", label: "Yes — YY" },
  { v: "YYYY", label: "Yes — YYYY" },
  { v: "YY-f", label: "Yes — YY (fiscal)" },
  { v: "YYYY-f", label: "Yes — YYYY (fiscal)" },
];
const SEPS: { v: AssetSettings["numbering"]["separator"]; label: string }[] = [{ v: "-", label: "-" }, { v: "/", label: "/" }, { v: "_", label: "_" }, { v: "", label: "none" }];

function NumberingSection({ d, set, err }: SP & { err: Record<string, string> }) {
  const n = d.numbering;
  const up = (p: Partial<typeof n>) => set((x) => { Object.assign(x.numbering, p); });
  const yearVal = n.yearFormat === "none" ? "none" : `${n.yearFormat}${n.fiscalYear ? "-f" : ""}`;
  const reset = resetModeOf(n);
  const plain = { ...d, numbering: { ...n, includeCategory: false } };
  const next = previewAssetId(plain);
  const last = n.lastIssued || (n.nextSeq > n.startAt ? formatAssetId({ ...n, includeCategory: false }, undefined, new Date(), n.nextSeq - 1) : "—");
  const maxSample = "9".repeat(n.seqLength);

  return (
    <Section id="numbering" title="Asset ID Numbering" desc="Rules used to auto-generate new asset IDs." action={<span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">Auto</span>}>
      {/* Live preview first so every change below is immediately visible */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-primary/[0.06] p-3 ring-1 ring-primary/20">
          <p className="text-[11px] text-muted-foreground">Next ID</p>
          <p className="num mt-1 truncate text-[15px] font-semibold" aria-live="polite">{next}</p>
          <p className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {[n.prefix && "Prefix", n.yearFormat !== "none" && (n.fiscalYear ? "Fiscal year" : "Year"), "Sequence"].filter(Boolean).map((s, i, a) => (
              <span key={String(s)} className="inline-flex items-center gap-1"><span className="rounded bg-surface px-1.5 py-0.5 ring-1 ring-border">{s}</span>{i < a.length - 1 && <span className="num">{n.separator || "·"}</span>}</span>
            ))}
          </p>
        </div>
        <div className="rounded-lg bg-subtle p-3 ring-1 ring-border">
          <p className="text-[11px] text-muted-foreground">Last issued</p>
          <p className="num mt-1 truncate text-[15px] font-semibold">{last}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Existing IDs never change.</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="pd-section-title mb-3">Format</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Prefix" htmlFor="n-prefix" error={err.prefix} hint="Letters and numbers, up to 6">
            <TextInput id="n-prefix" value={n.prefix} maxLength={6} placeholder="e.g. AST" invalid={!!err.prefix} onChange={(e) => up({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </Field>
          <div>
            <span className="pd-label">Separator</span>
            <div role="radiogroup" aria-label="Separator" className="grid h-9 grid-cols-4 rounded-md bg-subtle p-0.5">
              {SEPS.map((s) => (
                <button key={s.label} type="button" role="radio" aria-checked={n.separator === s.v} onClick={() => up({ separator: s.v })}
                  className={cn("rounded text-[13px] transition-colors", n.separator === s.v ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {s.v ? <span className="num">{s.label}</span> : "None"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Placed between each part</p>
          </div>
          <Field label="Year segment" htmlFor="n-year" hint={n.yearFormat === "none" ? "IDs won't include a year" : n.fiscalYear ? "Uses your fiscal year" : "Uses the calendar year"}>
            <Select id="n-year" value={yearVal} onChange={(e) => {
              const v = e.target.value;
              if (v === "none") up({ yearFormat: "none", fiscalYear: false, resetMode: "never", resetYearly: false });
              else { const f = v.endsWith("-f"); up({ yearFormat: v.replace("-f", "") as "YY" | "YYYY", fiscalYear: f, ...(reset !== "never" ? { resetMode: f ? "fiscal" : "calendar" } : {}) }); }
            }}>
              {YEAR_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label.replace("Yes — ", "").replace("No", "Don't include")}</option>)}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-5 border-t border-border/60 pt-5">
        <p className="pd-section-title mb-3">Sequence</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Number of digits" htmlFor="n-len" error={err.seqLength} hint={`${"1".padStart(n.seqLength, "0")} to ${maxSample}`}>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Fewer digits" disabled={n.seqLength <= 3} onClick={() => up({ seqLength: n.seqLength - 1 })} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-surface text-muted-foreground hover:bg-subtle disabled:opacity-40"><Minus className="size-3.5" /></button>
              <TextInput id="n-len" className="num text-center" inputMode="numeric" value={n.seqLength} onChange={(e) => up({ seqLength: Math.min(8, Math.max(3, int(e.target.value, 4))) })} />
              <button type="button" aria-label="More digits" disabled={n.seqLength >= 8} onClick={() => up({ seqLength: n.seqLength + 1 })} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-input bg-surface text-muted-foreground hover:bg-subtle disabled:opacity-40"><Plus className="size-3.5" /></button>
            </div>
          </Field>
          <Field label="Starting number" htmlFor="n-start" error={err.startAt} hint="First number when counting begins">
            <TextInput id="n-start" inputMode="numeric" className="num" value={n.startAt} invalid={!!err.startAt} onChange={(e) => up({ startAt: int(e.target.value), nextSeq: Math.max(n.nextSeq, int(e.target.value)) })} />
          </Field>
          <Field label="Restart numbering" htmlFor="n-reset" hint={n.yearFormat === "none" ? "Add a year segment to restart yearly" : reset === "never" ? "Keeps counting up forever" : `Starts again at ${n.startAt} each ${n.fiscalYear ? "fiscal " : ""}year`}>
            <Select id="n-reset" value={reset === "never" ? "never" : "yearly"} disabled={n.yearFormat === "none"} onChange={(e) => up(e.target.value === "never" ? { resetMode: "never", resetYearly: false } : { resetMode: n.fiscalYear ? "fiscal" : "calendar", resetYearly: true })}>
              <option value="never">Never</option><option value="yearly">Every year</option>
            </Select>
          </Field>
        </div>
      </div>

      <RangesCard d={d} set={set} />

      <div className="mt-4 rounded-md bg-warning-soft px-3 py-2.5 text-[12px] text-warning">
        <p className="font-medium">Changing the format won't re-number existing assets.</p>
        <p>New IDs follow the new rule from the next asset created. Historical IDs stay as they are.</p>
      </div>
    </Section>
  );
}

function RangesCard({ d, set }: SP) {
  const ranges = d.ranges ?? [];
  const [edit, setEdit] = useState<{ r: NumberRange; isNew: boolean } | null>(null);
  const [del, setDel] = useState<NumberRange | null>(null);
  const free = d.categories.filter((c) => !ranges.some((r) => r.categoryId === c.id));
  const catOf = (id: string) => d.categories.find((c) => c.id === id);
  const n = d.numbering;
  const pad = (x: number) => String(x).padStart(n.seqLength, "0");
  const format = (r: NumberRange) => [r.prefix, n.yearFormat === "none" ? "" : `{${n.yearFormat}}`, "#".repeat(n.seqLength)].filter(Boolean).join(n.separator);
  const nextOf = (r: NumberRange) => (r.next > r.end ? "Full" : [r.prefix, n.yearFormat === "none" ? "" : n.yearFormat === "YY" ? String(new Date().getFullYear()).slice(-2) : String(new Date().getFullYear()), pad(r.next)].filter(Boolean).join(n.separator));
  const add = () => {
    const c = free[0];
    setEdit({ isNew: true, r: { id: uidx("rg"), categoryId: c?.id ?? "", prefix: c?.code.slice(0, 3) ?? "", start: 1, end: Math.min(100, 10 ** n.seqLength - 1), next: 1 } });
  };
  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">Per-Category Number Ranges</h3>
          <p className="text-[12px] text-muted-foreground">Override the global sequence for specific asset classes.</p>
        </div>
        <button type="button" onClick={add} disabled={!free.length} className={BTN_OUTLINE}><Plus className="size-3.5" /> Add range</button>
      </div>
      {ranges.length > 0 && (
        <div className="overflow-x-auto">
          <table className="pd-table min-w-[560px]">
            <thead><tr><th>Category</th><th>Format</th><th>Range</th><th>Next</th><th className="w-10" /></tr></thead>
            <tbody>
              {ranges.map((r) => (
                <tr key={r.id}>
                  <td><span className="flex items-center gap-2 text-[13px]"><CatIcon icon={catOf(r.categoryId)?.icon} />{catOf(r.categoryId)?.name ?? "Deleted category"}</span></td>
                  <td className="num text-[12px]">{format(r)}</td>
                  <td className="num text-[12px]">{pad(r.start)} – {pad(r.end)}</td>
                  <td className="num text-[12px]">{nextOf(r)}</td>
                  <td className="text-right"><RowMenu label="Range actions" items={[{ label: "Edit", onSelect: () => setEdit({ r: structuredClone(r), isNew: false }) }, { label: "Remove", danger: true, onSelect: () => setDel(r) }]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <RangeDialog init={edit.r} isNew={edit.isNew} d={d} onClose={() => setEdit(null)} onSave={(r) => { set((x) => { x.ranges ??= []; const i = x.ranges.findIndex((y) => y.id === r.id); if (i >= 0) x.ranges[i] = r; else x.ranges.push(r); }); setEdit(null); }} />}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {catOf(del?.categoryId ?? "")?.name} range?</AlertDialogTitle>
            <AlertDialogDescription>New assets in this category will use the global sequence. IDs already issued stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const id = del!.id; set((x) => { x.ranges = (x.ranges ?? []).filter((y) => y.id !== id); }); setDel(null); }}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RangeDialog({ init, isNew, d, onClose, onSave }: { init: NumberRange; isNew: boolean; d: AssetSettings; onClose: () => void; onSave: (r: NumberRange) => void }) {
  const [r, setR] = useState(init);
  const [tried, setTried] = useState(false);
  const all = (d.ranges ?? []).filter((x) => x.id !== r.id).concat(r);
  const e = rangeIssues(r, all, d.numbering.seqLength);
  const issued = !isNew && init.next > init.start;
  const up = (p: Partial<NumberRange>) => setR((x) => { const n = { ...x, ...p }; if (!issued) n.next = n.start; return n; });
  const err = (k: string) => (tried ? e[k] : undefined);
  const submit = () => { setTried(true); if (Object.keys(e).length) return; onSave({ ...r, next: Math.max(r.next, r.start) }); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Add range" : "Edit range"}</DialogTitle><DialogDescription>Override the global sequence for specific asset classes.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="rg-cat" error={err("categoryId")}>
            <Select id="rg-cat" value={r.categoryId} disabled={issued} invalid={!!err("categoryId")} onChange={(ev) => { const c = d.categories.find((x) => x.id === ev.target.value); up({ categoryId: ev.target.value, prefix: r.prefix || (c?.code.slice(0, 3) ?? "") }); }}>
              <option value="">Choose…</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Prefix" htmlFor="rg-prefix" error={err("prefix")}>
            <TextInput id="rg-prefix" value={r.prefix} maxLength={6} invalid={!!err("prefix")} onChange={(ev) => up({ prefix: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </Field>
          <Field label="First number" htmlFor="rg-start" error={err("start")}>
            <TextInput id="rg-start" className="num" inputMode="numeric" disabled={issued} value={r.start} invalid={!!err("start")} onChange={(ev) => up({ start: int(ev.target.value) })} />
          </Field>
          <Field label="Last number" htmlFor="rg-end" error={err("end")}>
            <TextInput id="rg-end" className="num" inputMode="numeric" value={r.end} invalid={!!err("end")} onChange={(ev) => up({ end: int(ev.target.value) })} />
          </Field>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button type="button" onClick={submit} className={BTN_PRIMARY}>{isNew ? "Add range" : "Save"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Categories ───────────── */
function CategoriesSection({ d, set, count, canEdit }: SP & { count: (id: string) => number; canEdit: boolean }) {
  const [edit, setEdit] = useState<AssetCategory | null>(null);
  const [del, setDel] = useState<AssetCategory | null>(null);
  const isNew = !!edit && !d.categories.some((c) => c.id === edit.id);
  const blank = (): AssetCategory => ({ id: uidx("cat"), name: "", code: "", description: "", icon: "box", identifier: "serial", checkoutAllowed: true, active: true, assetCount: 0 });
  const delCount = del ? count(del.id) : 0;

  return (
    <Section id="categories" title="Categories" desc={`${plural(d.categories.length, "category").replace("categorys", "categories")} · used to group assets and drive default depreciation.`}
      action={canEdit && <button type="button" onClick={() => setEdit(blank())} className={BTN_OUTLINE}><Plus className="size-3.5" /> New category</button>}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d.categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
            <CatIcon icon={c.icon} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{c.name}</p>
              <p className="text-[11px] text-muted-foreground">{plural(count(c.id), "asset")} · {c.depreciation ? `${c.depreciation.method === "straight_line" ? "Straight line" : METHOD_LABEL[c.depreciation.method]}${c.depreciation.method !== "none" ? `, ${c.depreciation.usefulLifeMonths} mo` : ""}` : "Org default depreciation"}</p>
            </div>
            {canEdit && <RowMenu label={`${c.name} actions`} items={[{ label: "Edit", onSelect: () => setEdit(structuredClone(c)) }, { label: "Delete", danger: true, onSelect: () => setDel(c) }]} />}
          </div>
        ))}
      </div>

      {edit && <CategoryDialog cat={edit} isNew={isNew} all={d.categories} orgDep={d.depreciation} numbering={d.numbering} onClose={() => setEdit(null)}
        onSave={(c) => { set((x) => { const i = x.categories.findIndex((y) => y.id === c.id); if (i >= 0) x.categories[i] = c; else x.categories.push(c); }); setEdit(null); }} />}

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{delCount ? `Can't delete "${del?.name}"` : `Delete "${del?.name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>{delCount ? `${plural(delCount, "asset")} use this category. Move them to another category first.` : "This category has no assets and will be removed."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{delCount ? "Close" : "Cancel"}</AlertDialogCancel>
            {!delCount && <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const c = del!; set((x) => { x.categories = x.categories.filter((y) => y.id !== c.id); x.ranges = (x.ranges ?? []).filter((r) => r.categoryId !== c.id); x.fields.forEach((f) => (f.categoryIds = f.categoryIds.filter((i) => i !== c.id))); }); }}>Delete</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

/** Saves a category together with its optional own number range (one place for both). */
function applyCategory(x: AssetSettings, c: AssetCategory, rg: NumberRange | null) {
  const i = x.categories.findIndex((y) => y.id === c.id);
  if (i >= 0) x.categories[i] = c; else x.categories.push(c);
  x.ranges = (x.ranges ?? []).filter((r) => r.categoryId !== c.id);
  if (rg && c.idFormat) x.ranges.push({ ...rg, categoryId: c.id, prefix: c.idFormat.prefix || c.code });
}

/** Opens a category for editing; a legacy range without its own format is shown as a custom format with the same result. */
function openCategory(c: AssetCategory, d: AssetSettings): AssetCategory {
  const x = structuredClone(c);
  const r = d.ranges?.find((y) => y.categoryId === c.id);
  if (r && !x.idFormat) { const n = d.numbering; x.idFormat = { prefix: r.prefix, separator: n.separator, includeCategory: n.includeCategory, yearFormat: n.yearFormat, seqLength: n.seqLength }; }
  return x;
}

function CategoryDialog({ cat, isNew, all, orgDep, numbering, range, onClose, onSave }: { cat: AssetCategory; orgDep?: AssetSettings["depreciation"]; numbering: AssetSettings["numbering"]; range?: NumberRange; isNew: boolean; all: AssetCategory[]; onClose: () => void; onSave: (c: AssetCategory, range: NumberRange | null) => void }) {
  const [c, setC] = useState(cat);
  const [rg, setRg] = useState<NumberRange | null>(range ? structuredClone(range) : null);
  const [codeTouched, setCodeTouched] = useState(!!cat.code);
  const [tried, setTried] = useState(false);
  const issued = !!range && range.next > range.start;
  const baseErr = categoryIssues(c, all);
  const life = c.depreciation?.usefulLifeMonths;
  const digits = c.idFormat?.seqLength ?? numbering.seqLength;
  const rangeErr: Record<string, string> = {};
  if (rg && c.idFormat) {
    if (!Number.isInteger(rg.start) || rg.start < 1) rangeErr.rgStart = "Start at 1 or higher.";
    if (!Number.isInteger(rg.end) || rg.end <= rg.start) rangeErr.rgEnd = "Must be higher than the first number.";
    else if (String(rg.end).length > digits) rangeErr.rgEnd = `Doesn't fit in ${digits} digits.`;
    else if (issued && rg.end < range!.next - 1) rangeErr.rgEnd = `Already issued up to ${range!.next - 1}.`;
  }
  const err: Record<string, string> = { ...baseErr, ...rangeErr, ...(c.depreciation && c.depreciation.method !== "none" && (!life || life < 1 || life > 600) ? { life: "Enter 1 to 600 months" } : {}) };
  const show = (k: string) => (tried ? err[k] : undefined);
  const nextSeq = rg && c.idFormat ? Math.max(rg.next, rg.start) : numbering.nextSeq;
  const example = formatAssetId(numbering, c, new Date(), nextSeq);
  const left = rg ? Math.max(0, rg.end - Math.max(rg.next, rg.start) + 1) : 0;
  const toggleCustom = (v: boolean) => {
    setC({ ...c, idFormat: v ? { prefix: numbering.prefix, separator: numbering.separator, includeCategory: numbering.includeCategory, yearFormat: numbering.yearFormat, seqLength: numbering.seqLength } : undefined });
    if (!v) setRg(null);
  };
  const setOwnRange = (own: boolean) => setRg(own ? (range ? structuredClone(range) : { id: uidx("rg"), categoryId: c.id, prefix: c.idFormat?.prefix || c.code, start: 1, end: Math.min(1000, 10 ** digits - 1), next: 1 }) : null);
  const upRg = (p: Partial<NumberRange>) => setRg((x) => { if (!x) return x; const n = { ...x, ...p }; if (!issued) n.next = n.start; return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "New category" : "Edit category"}</DialogTitle><DialogDescription>Used to group assets and drive default depreciation.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field label="Name" htmlFor="c-name" error={show("name")}>
            <TextInput id="c-name" autoFocus value={c.name} invalid={!!show("name")} onChange={(e) => setC({ ...c, name: e.target.value, code: codeTouched ? c.code : suggestCode(e.target.value) })} />
          </Field>
          <Field label="Code" htmlFor="c-code" error={show("code")}>
            <TextInput id="c-code" className="num" maxLength={5} value={c.code} invalid={!!show("code")} onChange={(e) => { setCodeTouched(true); setC({ ...c, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }); }} />
          </Field>
        </div>
        <Field label="Icon" htmlFor="c-icon">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button id="c-icon" type="button" className="pd-input flex items-center gap-2 text-left">
                {(() => { const k = ((c.icon as CatIconKey) in CATEGORY_ICONS ? c.icon : "box") as CatIconKey; const I = CATEGORY_ICONS[k]; return <><I className="size-4 text-primary" /><span className="flex-1 truncate">{CATEGORY_ICON_LABEL[k]}</span></>; })()}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
              {(Object.keys(CATEGORY_ICONS) as CatIconKey[]).map((k) => { const I = CATEGORY_ICONS[k]; const on = (c.icon ?? "box") === k; return (
                <DropdownMenuItem key={k} onSelect={() => setC({ ...c, icon: k })} className="gap-2 text-[13px]">
                  <I className="size-4 text-muted-foreground" /><span className="flex-1">{CATEGORY_ICON_LABEL[k]}</span>{on && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>); })}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default depreciation" htmlFor="c-dep">
            <Select id="c-dep" value={c.depreciation?.method ?? "inherit"} onChange={(e) => { const v = e.target.value; setC({ ...c, depreciation: v === "inherit" ? undefined : { method: v as DepMethod, usefulLifeMonths: c.depreciation?.usefulLifeMonths ?? orgDep?.usefulLifeMonths ?? 60, salvagePct: c.depreciation?.salvagePct ?? orgDep?.salvagePct ?? 0 } }); }}>
              <option value="inherit">Use org default{orgDep ? ` (${orgDep.method === "straight_line" ? "Straight line" : METHOD_LABEL[orgDep.method as DepMethod]})` : ""}</option>
              {(Object.keys(METHOD_LABEL) as DepMethod[]).map((k) => <option key={k} value={k}>{k === "straight_line" ? "Straight line" : METHOD_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Default useful life (months)" htmlFor="c-life" error={show("life")}>
            <TextInput id="c-life" className="num" inputMode="numeric" invalid={!!show("life")} disabled={c.depreciation?.method === "none"}
              value={c.depreciation ? (c.depreciation.method === "none" ? "" : String(life || "")) : String(orgDep?.usefulLifeMonths ?? "")}
              placeholder={c.depreciation?.method === "none" ? "Not depreciated" : undefined}
              onChange={(e) => { const base = c.depreciation ?? { method: (orgDep?.method ?? "straight_line") as DepMethod, usefulLifeMonths: orgDep?.usefulLifeMonths ?? 60, salvagePct: orgDep?.salvagePct ?? 0 }; const n = parseInt(e.target.value.replace(/\D/g, "")); setC({ ...c, depreciation: { ...base, usefulLifeMonths: Number.isFinite(n) ? n : 0 } }); }} />
          </Field>
        </div>
        <div className="rounded-lg border border-border">
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Custom asset IDs</p>
              <p className="text-xs text-muted-foreground">{c.idFormat ? "Own format and, optionally, its own number range." : <>Optional. Uses the global format: <span className="num text-foreground">{formatAssetId(numbering, c)}</span></>}</p>
            </div>
            <Switch checked={!!c.idFormat} aria-label="Use custom asset IDs" onCheckedChange={toggleCustom} />
          </label>
          {c.idFormat && (() => { const f = c.idFormat; const uf = (p: Partial<typeof f>) => setC({ ...c, idFormat: { ...f, ...p } }); return (
            <div className="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-2">
              <Field label="Prefix" htmlFor="cf-prefix" error={show("fmtPrefix")}>
                <TextInput id="cf-prefix" className="num" maxLength={6} value={f.prefix} invalid={!!show("fmtPrefix")} onChange={(e) => uf({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
              </Field>
              <Field label="Separator" htmlFor="cf-sep">
                <Select id="cf-sep" value={f.separator} onChange={(e) => uf({ separator: e.target.value as typeof f.separator })}>
                  {SEPS.map((o) => <option key={o.label} value={o.v}>{o.v ? o.label : "None"}</option>)}
                </Select>
              </Field>
              <Field label="Year segment" htmlFor="cf-year">
                <Select id="cf-year" value={f.yearFormat} onChange={(e) => uf({ yearFormat: e.target.value as typeof f.yearFormat })}>
                  <option value="none">Don't include</option><option value="YY">YY</option><option value="YYYY">YYYY</option>
                </Select>
              </Field>
              <Field label="Sequence digits" htmlFor="cf-seq" error={show("fmtSeq")}>
                <TextInput id="cf-seq" className="num" inputMode="numeric" value={String(f.seqLength || "")} invalid={!!show("fmtSeq")} onChange={(e) => uf({ seqLength: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} />
              </Field>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" checked={f.includeCategory} onChange={(e) => uf({ includeCategory: e.target.checked })} /> Include category code{c.code ? <span className="num text-muted-foreground">({c.code})</span> : null}</label>

              <div className="sm:col-span-2 border-t border-border pt-3">
                <p className="mb-2 text-[12px] font-medium">Numbering</p>
                <div className="grid gap-1.5" role="radiogroup" aria-label="Numbering">
                  {[{ own: false, t: "Share the global sequence", s: `Continues from ${numbering.nextSeq} with other categories` }, { own: true, t: "Own number range", s: "Reserve a block of numbers just for this category" }].map((o) => (
                    <label key={String(o.own)} className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2", !!rg === o.own ? "border-primary bg-primary/5" : "border-border")}>
                      <input type="radio" name="cf-numbering" className="mt-0.5" checked={!!rg === o.own} disabled={issued && !o.own} onChange={() => setOwnRange(o.own)} />
                      <span className="min-w-0"><span className="block text-[13px]">{o.t}</span><span className="block text-[11px] text-muted-foreground">{o.s}</span></span>
                    </label>
                  ))}
                </div>
                {issued && <p className="mt-1.5 text-[11px] text-muted-foreground">IDs have been issued from this range, so it can't be switched off here.</p>}
              </div>
              {rg && <>
                <Field label="First number" htmlFor="rg-start" error={show("rgStart")} hint={issued ? "Locked — IDs already issued" : undefined}>
                  <TextInput id="rg-start" className="num" inputMode="numeric" disabled={issued} value={rg.start} invalid={!!show("rgStart")} onChange={(e) => upRg({ start: int(e.target.value) })} />
                </Field>
                <Field label="Last number" htmlFor="rg-end" error={show("rgEnd")} hint={`${left.toLocaleString()} IDs left`}>
                  <TextInput id="rg-end" className="num" inputMode="numeric" value={rg.end} invalid={!!show("rgEnd")} onChange={(e) => upRg({ end: int(e.target.value) })} />
                </Field>
              </>}
              <p className="text-xs text-muted-foreground sm:col-span-2">Next ID: <span className="num font-medium text-foreground">{example}</span> · existing assets keep their IDs.</p>
            </div>); })()}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button type="button" onClick={() => { setTried(true); if (!Object.keys(err).length) onSave({ ...c, name: c.name.trim() }, c.idFormat ? rg : null); }} className={BTN_PRIMARY}>{isNew ? "Create" : "Save"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Statuses ───────────── */
const TONE_OPTS: Tone[] = ["neutral", "green", "blue", "violet", "amber", "red"];

function StatusesSection({ d, set, count, canEdit }: SP & { count: (id: string) => number; canEdit: boolean }) {
  const [edit, setEdit] = useState<AssetStatus | null>(null);
  const [del, setDel] = useState<AssetStatus | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const isNew = !!edit && !d.statuses.some((s) => s.id === edit.id);
  const delCount = del ? count(del.id) : 0;

  return (
    <Section id="statuses" title="Statuses & Lifecycle" desc="The states an asset can be in and what actions transition between them."
      action={canEdit && <button type="button" onClick={() => setEdit({ id: uidx("st"), name: "", phase: "active", tone: "blue", description: "", system: false, enabled: true, checkoutable: false, depreciates: true, next: ["available"], assetCount: 0 })} className={BTN_OUTLINE}><Plus className="size-3.5" /> Add status</button>}>
      <div className="divide-y divide-border">
        {d.statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={cn("size-1.5 shrink-0 rounded-full", DOT[s.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{s.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">{s.description}</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{plural(count(s.id), "asset")}</span>
            {s.system
              ? <span className="rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground">System</span>
              : <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">Custom</span>}
            {canEdit && <RowMenu label={`${s.name} actions`} items={[{ label: s.system ? "Edit description" : "Edit", onSelect: () => setEdit(structuredClone(s)) }, ...(s.system ? [] : [{ label: "Delete", danger: true, onSelect: () => { setDel(s); setMoveTo(""); } }])]} />}
          </div>
        ))}
      </div>
      <Note><span className="font-semibold">What happens:</span> System statuses drive the register and check in / out, so they can be re-described but not renamed or deleted. Custom statuses appear in filters and on asset detail — deleting one requires reassigning every asset that uses it.</Note>

      {edit && <StatusDialog s={edit} isNew={isNew} all={d.statuses} onClose={() => setEdit(null)}
        onSave={(s) => { set((x) => { const i = x.statuses.findIndex((y) => y.id === s.id); if (i >= 0) x.statuses[i] = s; else x.statuses.push(s); }); setEdit(null); }} />}

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{del?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>{delCount ? `${plural(delCount, "asset")} use this status. Choose a status to reassign them to.` : "No assets use this status."}</AlertDialogDescription>
          </AlertDialogHeader>
          {delCount > 0 && (
            <Select aria-label="Reassign assets to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose a status…</option>
              {d.statuses.filter((s) => s.id !== del?.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={delCount > 0 && !moveTo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const s = del!;
                set((x) => { x.statuses = x.statuses.filter((y) => y.id !== s.id); x.statuses.forEach((y) => (y.next = y.next.filter((n) => n !== s.id))); if (x.defaultStatusId === s.id) x.defaultStatusId = "draft"; });
                if (delCount && moveTo) mutate((db) => { (db as { assetItems?: { statusId: string }[] }).assetItems?.forEach((a) => { if (a.statusId === s.id) a.statusId = moveTo; }); });
              }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function StatusDialog({ s: init, isNew, all, onClose, onSave }: { s: AssetStatus; isNew: boolean; all: AssetStatus[]; onClose: () => void; onSave: (s: AssetStatus) => void }) {
  const [s, setS] = useState(init);
  const [tried, setTried] = useState(false);
  const nameErr = !s.name.trim() ? "Give the status a name." : all.some((x) => x.id !== s.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase()) ? "A status with this name already exists." : undefined;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Add status" : `Edit ${init.name}`}</DialogTitle><DialogDescription>{s.system ? "System statuses can be re-described but not renamed." : "Custom statuses appear in filters and on asset detail."}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="Name" htmlFor="s-name" error={tried ? nameErr : undefined}>
            <TextInput id="s-name" autoFocus={!s.system} disabled={s.system} value={s.name} invalid={tried && !!nameErr} onChange={(e) => setS({ ...s, name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="s-desc">
            <TextInput id="s-desc" autoFocus={s.system} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
          </Field>
          {!s.system && (
            <div>
              <span className="pd-label">Colour</span>
              <div role="radiogroup" aria-label="Colour" className="flex gap-2">
                {TONE_OPTS.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={s.tone === t} aria-label={t} onClick={() => setS({ ...s, tone: t })}
                    className={cn("flex size-7 items-center justify-center rounded-full border border-border", s.tone === t && "ring-2 ring-primary ring-offset-2 ring-offset-surface")}>
                    <span className={cn("size-2.5 rounded-full", DOT[t])} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button type="button" onClick={() => { setTried(true); if (!nameErr) onSave({ ...s, name: s.name.trim(), description: s.description.trim() }); }} className={BTN_PRIMARY}>{isNew ? "Add status" : "Save"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Depreciation ───────────── */
function DepreciationSection({ d, set }: SP) {
  const dep = d.depreciation;
  const month = d.fiscalYearStartMonth ?? 1;
  const days = new Date(2025, month, 0).getDate();
  return (
    <Section id="depreciation" title="Depreciation Defaults" desc="Applied when a new asset is created — can be overridden per asset.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Method" htmlFor="d-method">
          <Select id="d-method" value={dep.method} onChange={(e) => set((x) => { x.depreciation.method = e.target.value as DepMethod; })}>
            {(Object.keys(METHOD_LABEL) as DepMethod[]).map((k) => <option key={k} value={k}>{k === "straight_line" ? "Straight line" : METHOD_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Salvage value (% of cost)" htmlFor="d-salv">
          <div className="relative">
            <TextInput id="d-salv" className="num pr-8" inputMode="decimal" value={dep.salvagePct.toFixed(1)} onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); set((x) => { x.depreciation.salvagePct = Number.isFinite(v) ? Math.min(90, v) : 0; }); }} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </Field>
        <div>
          <span className="pd-label">Fiscal year start</span>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Fiscal year start month" value={month} onChange={(e) => set((x) => { x.fiscalYearStartMonth = +e.target.value; x.fiscalYearStartDay = Math.min(x.fiscalYearStartDay ?? 1, new Date(2025, +e.target.value, 0).getDate()); })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select aria-label="Fiscal year start day" value={d.fiscalYearStartDay ?? 1} onChange={(e) => set((x) => { x.fiscalYearStartDay = +e.target.value; })}>
              {Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </Select>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ───────────── Custom fields ───────────── */
const TYPE_LABEL: Record<CustomField["type"], string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown" };

function FieldsSection({ d, set, canEdit }: SP & { canEdit: boolean }) {
  const [edit, setEdit] = useState<CustomField | null>(null);
  const [optText, setOptText] = useState("");
  const [tried, setTried] = useState(false);
  const isNew = !!edit && !d.fields.some((f) => f.id === edit.id);
  const open = (f: CustomField) => { setEdit(structuredClone(f)); setOptText(f.options.join(", ")); setTried(false); };
  const nameErr = !edit ? undefined : !edit.label.trim() ? "Give the field a name." : d.fields.some((f) => f.id !== edit.id && slug(f.label) === slug(edit.label)) ? "A field with this name already exists." : undefined;
  const optErr = edit?.type === "select" && optText.split(",").map((s) => s.trim()).filter(Boolean).length < 2 ? "Add at least two options, separated by commas." : undefined;
  const scope = (f: CustomField) => (f.categoryIds.length ? f.categoryIds.map((i) => d.categories.find((c) => c.id === i)?.name).filter(Boolean).join(", ") : "All assets");

  return (
    <Section id="fields" title="Custom Fields" desc="Add fields specific to your organization. They appear on asset detail and forms."
      action={canEdit && <button type="button" onClick={() => open({ id: uidx("f"), label: "", type: "text", options: [], categoryIds: [], required: false })} className={BTN_OUTLINE}><Plus className="size-3.5" /> Add field</button>}>
      <div className="overflow-x-auto">
        <table className="pd-table min-w-[520px]">
          <thead><tr><th>Field</th><th>Type</th><th>Scope</th><th>Required</th><th className="w-10" /></tr></thead>
          <tbody>
            {d.fields.map((f) => (
              <tr key={f.id}>
                <td className="text-[13px]">{f.label}</td>
                <td className="text-[13px]">{TYPE_LABEL[f.type]}</td>
                <td className="text-[13px]">{scope(f)}</td>
                <td className="text-[13px]">{f.required ? "Yes" : "—"}</td>
                <td className="text-right">{canEdit && <RowMenu label={`${f.label} actions`} items={[{ label: "Edit", onSelect: () => open(f) }, { label: "Delete", danger: true, onSelect: () => set((x) => { x.fields = x.fields.filter((y) => y.id !== f.id); }) }]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{isNew ? "Add field" : "Edit field"}</DialogTitle><DialogDescription>They appear on asset detail and forms.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <Field label="Field" htmlFor="f-label" error={tried ? nameErr : undefined}><TextInput id="f-label" autoFocus value={edit.label} invalid={tried && !!nameErr} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type" htmlFor="f-type"><Select id="f-type" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as CustomField["type"] })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Scope" htmlFor="f-scope">
                  <Select id="f-scope" value={edit.categoryIds[0] ?? ""} onChange={(e) => setEdit({ ...edit, categoryIds: e.target.value ? [e.target.value] : [] })}>
                    <option value="">All assets</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              {edit.type === "select" && <Field label="Options" htmlFor="f-opt" error={tried ? optErr : undefined} hint="Separate with commas."><TextInput id="f-opt" value={optText} invalid={tried && !!optErr} onChange={(e) => setOptText(e.target.value)} /></Field>}
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-[13px] font-medium">Required</span>
                <Switch checked={edit.required} onCheckedChange={(v) => setEdit({ ...edit, required: v })} />
              </label>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setEdit(null)} className={BTN_GHOST}>Cancel</button>
              <button type="button" onClick={() => { setTried(true); if (nameErr || optErr) return; const f = { ...edit, label: edit.label.trim(), options: edit.type === "select" ? optText.split(",").map((s) => s.trim()).filter(Boolean) : [] }; set((x) => { const i = x.fields.findIndex((y) => y.id === f.id); if (i >= 0) x.fields[i] = f; else x.fields.push(f); }); setEdit(null); }} className={BTN_PRIMARY}>{isNew ? "Add field" : "Save"}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Section>
  );
}

/* ───────────── Notifications ───────────── */
const ALERT_ROWS: { event: AlertEvent; label: string; desc: string }[] = [
  { event: "warranty_expiring", label: "Warranty expiring", desc: "Alert 60, 30, 7 days before expiration" },
  { event: "maintenance_due", label: "Maintenance due", desc: "Alert 14 and 3 days before the scheduled date" },
  { event: "checkout_overdue", label: "Checkout overdue", desc: "Daily reminder to the assignee starting on the return date" },
  { event: "fully_depreciated", label: "Fully depreciated", desc: "Notify finance when book value reaches salvage" },
];

function AlertsSection({ d, set }: SP) {
  const toggle = (event: AlertEvent, v: boolean) => set((x) => {
    const a = x.alerts.find((y) => y.event === event);
    if (a) a.enabled = v;
    else x.alerts.push({ id: uidx("al"), event, enabled: v, leadDays: 0, repeat: "once", channels: { inApp: true, email: true }, recipients: ["asset_manager"] });
  });
  return (
    <Section id="alerts" title="Notifications & Alerts" desc="When ProcureDesk should send reminders.">
      <div className="divide-y divide-border">
        {ALERT_ROWS.map((r) => (
          <label key={r.event} className="flex cursor-pointer items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span><span className="block text-[13px] font-medium">{r.label}</span><span className="block text-[12px] text-muted-foreground">{r.desc}</span></span>
            <Switch aria-label={r.label} checked={!!d.alerts.find((a) => a.event === r.event)?.enabled} onCheckedChange={(v) => toggle(r.event, v)} />
          </label>
        ))}
      </div>
      <Note><span className="font-semibold">What happens:</span> Alerts go to the assignee by email and in-app, and managers get a daily digest when items run overdue. Delivery channels and quiet hours stay under personal notification settings.</Note>
    </Section>
  );
}

/* ───────────── Integrations ───────────── */
const INTEGRATION_ROWS: { id: IntegrationId; name: string; desc: string }[] = [
  { id: "netsuite", name: "NetSuite", desc: "Push GL entries for acquisition, depreciation, and disposal" },
  { id: "jira", name: "Jira Service Management", desc: "Open a ticket automatically when a repair status is set" },
  { id: "zebra", name: "Zebra label printers", desc: "Print asset tags to networked label printers" },
  { id: "fiix", name: "Fiix CMMS", desc: "Two-way work-order sync for maintenance events" },
  { id: "api", name: "API & webhooks", desc: "Tokens and webhook endpoints for asset events" },
];

function IntegrationsSection({ d, setDraft }: { d: AssetSettings; setDraft: (fn: (p: AssetSettings) => AssetSettings) => void }) {
  const me = useMe();
  const [disc, setDisc] = useState<IntegrationId | null>(null);
  const apply = (id: IntegrationId, connected: boolean) => {
    const v = connected ? { connected: true, connectedAt: new Date().toISOString(), connectedBy: me?.id, syncEvents: [] } : { connected: false, syncEvents: [] };
    mutate((x) => { if (!x.assets) return; x.assets.integrations = { ...(x.assets.integrations ?? {}), [id]: v }; });
    setDraft((p) => ({ ...p, integrations: { ...(p.integrations ?? {}), [id]: v } }));
  };
  const nameOf = (id: IntegrationId | null) => INTEGRATION_ROWS.find((i) => i.id === id)?.name;
  return (
    <Section id="integrations" title="Integrations" desc="Sync asset data with your ERP, ITSM, and label printers.">
      <div className="divide-y divide-border">
        {INTEGRATION_ROWS.map((i) => {
          const on = !!d.integrations?.[i.id]?.connected;
          return (
            <div key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{i.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{i.desc}</p>
              </div>
              <span className={cn("rounded px-1.5 py-0.5 text-[11px]", on ? "bg-success-soft text-success" : "bg-subtle text-muted-foreground")}>{on ? "Connected" : "Not connected"}</span>
              {on
                ? <button type="button" onClick={() => setDisc(i.id)} className={cn(BTN_OUTLINE, "w-[92px] justify-center")}>Disconnect</button>
                : <button type="button" onClick={() => { apply(i.id, true); toast.success(`${i.name} connected`); }} className={cn(BTN_PRIMARY, "w-[92px]")}>Connect</button>}
            </div>
          );
        })}
      </div>
      <Note><span className="font-semibold">What happens:</span> Connecting records the integration against this company and stores its non-secret options; credentials stay in the credential vault. Disconnecting stops future syncs but keeps historical records mapped to their external IDs.</Note>

      <AlertDialog open={!!disc} onOpenChange={(o) => !o && setDisc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {nameOf(disc)}?</AlertDialogTitle>
            <AlertDialogDescription>Future syncs stop. Historical records stay mapped to their external IDs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const id = disc!; apply(id, false); toast(`${nameOf(id)} disconnected`); setDisc(null); }}>Disconnect</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
