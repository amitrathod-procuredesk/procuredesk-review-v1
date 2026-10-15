import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Bell, Boxes, CalendarClock, Check, ChevronRight, CircleDot, Copy, Hash, Info, Lock, Pencil, Plug, Plus, RotateCcw, Search, Shapes, Trash2, TrendingDown, type LucideIcon } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FieldHint, Select, TextArea, TextInput } from "@/components/pd/form";
import {
  ALERT_META, INTEGRATIONS, MONTHS, IDENTIFIER_LABEL, previewAssetId, rangeIssues, resetModeOf, METHOD_LABEL, PHASE_LABEL, RECIPIENT_LABEL, capacityLeft, categoryIssues, defaultAssetSettings, depreciationSchedule, formatAssetId, numberingIssues, slug, suggestCode,
  type AlertRule, type IntegrationId, type IntegrationState, type NumberRange, type ResetMode, type AssetCategory, type AssetSettings, type AssetStatus, type CustomField, type DepMethod, type DepRule, type StatusPhase, type Tone,
} from "@/lib/pd/assets";
import { money } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "numbering", label: "Numbering", title: "Asset ID numbering", icon: Hash, desc: "Rules used to auto-generate new asset IDs." },
  { id: "categories", label: "Categories", title: "Categories", icon: Shapes, desc: "Used to group assets and drive default depreciation." },
  { id: "statuses", label: "Statuses", title: "Statuses & lifecycle", icon: CircleDot, desc: "The states an asset can be in and which moves are allowed between them." },
  { id: "depreciation", label: "Depreciation", title: "Depreciation defaults", icon: TrendingDown, desc: "Applied when a new asset is created — can be overridden per category." },
  { id: "fields", label: "Custom fields", title: "Custom fields", icon: Boxes, desc: "Fields specific to your organization. They appear on asset detail and forms." },
  { id: "alerts", label: "Notifications", title: "Notifications & alerts", icon: Bell, desc: "When ProcureDesk should send reminders." },
  { id: "integrations", label: "Integrations", title: "Integrations", icon: Plug, desc: "Sync asset data with your ERP, service desk and label printers." },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/app/assets/settings")({
  validateSearch: z.object({ section: z.enum(SECTIONS.map((s) => s.id) as [SectionId, ...SectionId[]]).optional() }),
  head: () => ({
    meta: [
      { title: "Asset settings · ProcureDesk" },
      { name: "description", content: "Configure asset numbering, categories, lifecycle statuses, depreciation and alerts." },
      { property: "og:title", content: "Asset settings · ProcureDesk" },
      { property: "og:description", content: "Set up how your company tracks laptops, vehicles, machinery and every other asset." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetSettingsPage,
});

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-muted-foreground",
  blue: "bg-primary/10 text-primary",
  green: "bg-success-soft text-success",
  amber: "bg-warning-soft text-warning",
  red: "bg-destructive/10 text-destructive",
  violet: "bg-ai/10 text-ai",
};
const DOT: Record<Tone, string> = { neutral: "bg-muted-foreground", blue: "bg-primary", green: "bg-success", amber: "bg-warning", red: "bg-destructive", violet: "bg-ai" };

function StatusPill({ s }: { s: Pick<AssetStatus, "name" | "tone"> }) {
  return <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium", TONES[s.tone])}><span className={cn("size-1.5 rounded-full", DOT[s.tone])} />{s.name}</span>;
}

const uidx = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const relTime = (iso?: string) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
};

function AssetSettingsPage() {
  const db = useDB();
  const me = useMe();
  const saved = db.assets ?? defaultAssetSettings();
  const canEdit = me?.role === "admin";
  const { section = "numbering" } = Route.useSearch();
  const [draft, setDraft] = useState<AssetSettings>(() => structuredClone(saved));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Pick up others' saved changes while you have nothing pending.
  useEffect(() => { if (!dirty) setDraft(structuredClone(saved)); }, [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (fn: (d: AssetSettings) => void) => setDraft((p) => { const n = structuredClone(p); fn(n); return n; });
  const numErr = numberingIssues(draft.numbering);
  const catErrCount = draft.categories.filter((c) => Object.keys(categoryIssues(c, draft.categories)).length).length;
  const rangeErrCount = (draft.ranges ?? []).filter((x) => Object.keys(rangeIssues(x, draft.ranges ?? [], draft.numbering.seqLength)).length).length;
  const numErrCount = Object.keys(numErr).length + rangeErrCount;
  const errorCount = numErrCount + catErrCount;
  const sectionDirty = (id: SectionId) => {
    const pick = (s: AssetSettings) => JSON.stringify(
      id === "numbering" ? [s.numbering, s.ranges ?? []] : id === "categories" ? s.categories : id === "statuses" ? [s.statuses, s.defaultStatusId]
      : id === "depreciation" ? [s.depreciation, s.fiscalYearStartMonth ?? 1] : id === "integrations" ? s.integrations ?? {} : id === "alerts" ? [s.alerts, s.digest, s.quietWeekends] : id === "fields" ? s.fields : [s.checkout, s.audit]);
    return pick(draft) !== pick(saved);
  };

  const save = () => {
    if (errorCount) { toast.error("Fix the highlighted fields first", { description: `${errorCount} ${errorCount === 1 ? "issue needs" : "issues need"} attention before saving.` }); return; }
    const next = { ...draft, updatedAt: new Date().toISOString(), updatedBy: me?.id };
    mutate((d) => { d.assets = next; });
    setDraft(structuredClone(next));
    toast.success("Asset settings saved", { description: "New rules apply to assets registered from now on." });
  };
  const discard = () => { setDraft(structuredClone(saved)); toast("Changes discarded"); };
  const updatedBy = db.users.find((u) => u.id === saved.updatedBy);
  const [active, setActive] = useState<SectionId>(section);
  // Deep link: scroll to ?section= on first load.
  useEffect(() => { if (section !== "numbering") document.getElementById(`as-${section}`)?.scrollIntoView({ block: "start" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Scroll-spy: highlight the section nearest the top of the screen.
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
    <TooltipProvider delayDuration={200}>
    <div className="mx-auto max-w-6xl p-4 pb-28 md:p-8 md:pb-28">
      <div className="mb-5">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/app/assets/register" className="hover:text-foreground">Assets</Link><ChevronRight className="size-3" /><span>Settings</span>
        </nav>
        <h1 className="pd-h1">Asset settings</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Configure how assets are numbered, categorized and depreciated across your organization.
          {saved.updatedAt && <span className="text-muted-foreground/80"> · Saved {relTime(saved.updatedAt)}{updatedBy ? ` by ${updatedBy.name}` : ""}</span>}
        </p>
      </div>

      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2 text-[13px] text-muted-foreground">
          <Lock className="size-3.5" /> You can view these settings. Only admins can change them.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[184px_1fr]">
        <nav aria-label="Asset settings sections" className="pd-scroll-hide -mx-4 flex gap-1 overflow-x-auto px-4 md:sticky md:rounded-lg md:border md:border-border md:bg-surface md:top-[84px] md:mx-0 md:block md:space-y-0.5 md:self-start md:p-1.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={s.id === active ? "true" : undefined}
              className={cn("flex h-8 w-full shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors", s.id === active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-subtle")}>
              <span className="flex-1 truncate">{s.label}</span>
              {(s.id === "numbering" && numErrCount) || (s.id === "categories" && catErrCount)
                ? <span className="size-1.5 rounded-full bg-destructive" title="Has errors" />
                : sectionDirty(s.id) ? <span className="size-1.5 rounded-full bg-primary" title="Unsaved changes" /> : null}
            </button>
          ))}
        </nav>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          {SECTIONS.map((m) => (
            <section key={m.id} id={`as-${m.id}`} className="pd-panel scroll-mt-24 p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{m.title}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{m.desc}</p>
              </div>
              <Nested.Provider value>
                <div className="space-y-5">
                  {m.id === "numbering" && <NumberingSection d={draft} set={set} err={numErr} />}
                  {m.id === "categories" && <CategoriesSection d={draft} set={set} canEdit={canEdit} />}
                  {m.id === "statuses" && <StatusesSection d={draft} set={set} canEdit={canEdit} />}
                  {m.id === "depreciation" && <DepreciationSection d={draft} set={set} />}
                  {m.id === "fields" && <FieldsSection d={draft} set={set} canEdit={canEdit} />}
                  {m.id === "alerts" && <AlertsSection d={draft} set={set} />}
                  {m.id === "integrations" && <IntegrationsSection d={draft} setDraft={setDraft} canEdit={canEdit} />}
                </div>
              </Nested.Provider>
            </section>
          ))}
        </fieldset>
      </div>

      {canEdit && (
        <div className={cn("fixed inset-x-0 bottom-14 z-30 flex justify-center px-4 transition-all duration-200 md:bottom-6", dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
          <div role="region" aria-label="Unsaved changes" className="flex w-full max-w-xl items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-lg">
            {errorCount ? <AlertTriangle className="size-4 text-destructive" /> : <span className="size-2 rounded-full bg-primary" />}
            <p className="flex-1 text-[13px]">{errorCount ? `${errorCount} ${errorCount === 1 ? "issue" : "issues"} to fix before saving` : "You have unsaved changes"}</p>
            <button onClick={discard} className="h-8 rounded-md px-3 text-[13px] text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground">Discard</button>
            <button onClick={save} className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90">Save changes</button>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

type SP = { d: AssetSettings; set: (fn: (d: AssetSettings) => void) => void };

const Nested = createContext(false);
/** Sub-block inside a section panel: separated by a hairline instead of its own box. */
function Card({ title, desc, children, action }: { title?: string; desc?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const nested = useContext(Nested);
  return (
    <div className={nested ? "border-t border-border pt-5 first:border-t-0 first:pt-0" : "pd-panel p-4 md:p-5"}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>{title && <h3 className="text-[13px] font-semibold">{title}</h3>}{desc && <p className="mt-0.5 text-[13px] text-muted-foreground">{desc}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </div>
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

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span><span className="block text-[13px] font-medium">{label}</span>{desc && <span className="block text-[12px] text-muted-foreground">{desc}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

const int = (v: string, fallback = 0) => { const n = parseInt(v.replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : fallback; };

/* ───────────── Numbering ───────────── */
function NumberingSection({ d, set, err }: SP & { err: Record<string, string> }) {
  const n = d.numbering;
  const up = (p: Partial<typeof n>) => set((x) => { Object.assign(x.numbering, p); });
  const sample = d.categories.find((c) => c.active) ?? d.categories[0];
  const [previewCat, setPreviewCat] = useState(sample?.id ?? "");
  const pc = d.categories.find((c) => c.id === previewCat) ?? sample;
  const id = previewAssetId(d, pc);
  const range = d.ranges?.find((r) => r.categoryId === pc?.id && r.next <= r.end);
  const reset = resetModeOf(n);
  const left = capacityLeft(n);
  const parts = [
    { k: "Prefix", v: range?.prefix || pc?.prefixOverride || n.prefix },
    { k: "Category", v: n.includeCategory ? pc?.code : "" },
    { k: "Year", v: n.yearFormat === "none" ? "" : n.yearFormat === "YY" ? String(new Date().getFullYear()).slice(-2) : String(new Date().getFullYear()) },
    { k: "Number", v: String(range ? range.next : n.nextSeq).padStart(n.seqLength, "0") },
  ].filter((p) => p.v);

  return (
    <>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Prefix" htmlFor="n-prefix" error={err.prefix} hint="Short company code, e.g. AST or ACME. Leave blank to start with the category code.">
            <TextInput id="n-prefix" value={n.prefix} maxLength={6} invalid={!!err.prefix} onChange={(e) => up({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="AST" />
          </Field>
          <Field label="Separator" htmlFor="n-sep">
            <Select id="n-sep" value={n.separator} onChange={(e) => up({ separator: e.target.value as typeof n.separator })}>
              <option value="-">Hyphen  ( - )</option><option value="/">Slash  ( / )</option><option value=".">Dot  ( . )</option><option value="_">Underscore  ( _ )</option><option value="">None</option>
            </Select>
          </Field>
          <Field label="Year segment" htmlFor="n-year" hint={reset === "fiscal" ? "Uses the fiscal year the asset is registered in." : "Uses the year the asset is registered."}>
            <Select id="n-year" value={n.yearFormat} onChange={(e) => up({ yearFormat: e.target.value as typeof n.yearFormat, ...(e.target.value === "none" ? { resetMode: "never" as ResetMode, resetYearly: false } : {}) })}>
              <option value="none">Don't include</option><option value="YY">2 digits (26)</option><option value="YYYY">4 digits (2026)</option>
            </Select>
          </Field>
          <Field label="Number length" htmlFor="n-len" error={err.seqLength} hint={`Up to ${(10 ** n.seqLength - 1).toLocaleString()} assets, padded with zeros.`}>
            <Select id="n-len" value={n.seqLength} onChange={(e) => up({ seqLength: +e.target.value })}>
              {[3, 4, 5, 6, 7, 8].map((x) => <option key={x} value={x}>{x} digits</option>)}
            </Select>
          </Field>
          <Field label="Starting number" htmlFor="n-start" error={err.startAt} hint={n.startAt < n.nextSeq ? <>Already issued up to {n.nextSeq - 1}. The next ID continues from <span className="num">{n.nextSeq}</span>.</> : "First number issued after a reset."}>
            <TextInput id="n-start" inputMode="numeric" className="num" value={n.startAt} invalid={!!err.startAt} onChange={(e) => up({ startAt: int(e.target.value), nextSeq: Math.max(n.nextSeq, int(e.target.value)) })} />
          </Field>
          <Field label="Restart numbering" htmlFor="n-reset" hint={n.yearFormat === "none" ? "Add a year segment first, otherwise restarted IDs would repeat." : reset === "fiscal" ? `On 1 ${MONTHS[(d.fiscalYearStartMonth ?? 1) - 1]} — change the month under Depreciation.` : reset === "calendar" ? "On 1 January, from the starting number." : "Numbers keep counting up forever."}>
            <Select id="n-reset" value={reset} disabled={n.yearFormat === "none"} onChange={(e) => up({ resetMode: e.target.value as ResetMode, resetYearly: e.target.value !== "never" })}>
              <option value="never">Never</option><option value="calendar">Every calendar year</option><option value="fiscal">Every fiscal year</option>
            </Select>
          </Field>
        </div>
        <div className="mt-5 divide-y divide-border border-t border-border pt-4">
          <ToggleRow label="Include category code" desc="e.g. AST-VEH-26-00012 for a truck, AST-IT-26-00013 for a laptop." checked={n.includeCategory} onChange={(v) => up({ includeCategory: v })} />
          <ToggleRow label="Allow editing an ID after it's issued" desc="Useful when migrating tagged assets. Changes are recorded in the asset's history." checked={n.allowManualOverride} onChange={(v) => up({ allowManualOverride: v })} />
        </div>
      </Card>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-primary/[0.06] p-4 ring-1 ring-primary/15">
            <div className="flex items-center justify-between gap-2">
              <p className="pd-section-title">Next asset ID</p>
              <Select aria-label="Preview for category" value={pc?.id} onChange={(e) => setPreviewCat(e.target.value)} className="h-7 w-auto text-xs" disabled={false}>
                {d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="num truncate text-xl font-semibold tracking-tight" aria-live="polite">{id}</span>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(id); toast.success("Copied example ID"); }} className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground" aria-label="Copy example ID"><Copy className="size-3.5" /></button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{range ? <>From the {pc?.name} range · {(range.end - range.next + 1).toLocaleString()} numbers left</> : "From the company-wide sequence"}</p>
          </div>
          <div className="rounded-lg bg-subtle p-4">
            <p className="pd-section-title">Last issued</p>
            <p className="num mt-2 truncate text-xl font-semibold tracking-tight text-muted-foreground">{(range ? range.lastIssued : n.lastIssued || (n.nextSeq > n.startAt ? formatAssetId(n, pc, new Date(), n.nextSeq - 1) : "")) || "None yet"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Already on labels and records — never changes</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {parts.map((p, i) => (
            <span key={p.k} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              {i > 0 && n.separator && <span className="num text-foreground/50">{n.separator}</span>}
              <span className="rounded border border-border bg-surface px-1.5 py-0.5"><span className="num text-foreground">{p.v}</span> · {p.k}</span>
            </span>
          ))}
        </div>
        {!range && left < 500 && <p className="mt-3 flex items-center gap-1.5 text-[12px] text-warning"><AlertTriangle className="size-3.5" /> Only {left.toLocaleString()} numbers left at {n.seqLength} digits. Add a digit to avoid running out.</p>}
      </Card>

      <RangesCard d={d} set={set} />
    </>
  );
}

/* ───────────── Categories ───────────── */
function CategoriesSection({ d, set, canEdit }: SP & { canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<AssetCategory | null>(null);
  const [del, setDel] = useState<AssetCategory | null>(null);
  const list = d.categories.filter((c) => !q || `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase()));
  const blank = (): AssetCategory => ({ id: uidx("cat"), name: "", code: "", description: "", identifier: "serial", checkoutAllowed: true, active: true, assetCount: 0 });
  const isNew = edit && !d.categories.some((c) => c.id === edit.id);

  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <TextInput aria-label="Search categories" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" className="pl-8" disabled={false} />
          </div>
          {canEdit && <button type="button" onClick={() => setEdit(blank())} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"><Plus className="size-4" /> Add category</button>}
        </div>
        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-sm font-medium">{q ? `No categories match "${q}"` : "No categories yet"}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">{q ? "Try a different name or code." : "Start with the kinds of assets you own most — e.g. IT equipment or Vehicles."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="pd-table min-w-[640px]">
              <thead><tr><th>Category</th><th>ID example</th><th>Depreciation</th><th className="text-right">Assets</th><th className="w-20" /></tr></thead>
              <tbody>
                {list.map((c) => {
                  const bad = Object.keys(categoryIssues(c, d.categories)).length > 0;
                  const rule = c.depreciation ?? d.depreciation;
                  return (
                    <tr key={c.id} className={cn(!c.active && "opacity-60")}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="num rounded bg-subtle px-1.5 py-0.5 text-[11px]">{c.code || "—"}</span>
                          <span className="font-medium">{c.name || "Untitled"}</span>
                          {!c.active && <span className="text-[11px] text-muted-foreground">Inactive</span>}
                          {bad && <AlertTriangle className="size-3.5 text-destructive" aria-label="Has errors" />}
                        </div>
                        <p className="max-w-[280px] truncate text-[12px] text-muted-foreground">{c.description || IDENTIFIER_LABEL[c.identifier]}</p>
                      </td>
                      <td className="num whitespace-nowrap text-[12px]">{formatAssetId(d.numbering, c)}</td>
                      <td className="text-[12px]">{rule.method === "none" ? "None" : <>{METHOD_LABEL[rule.method]} · {Math.round(rule.usefulLifeMonths / 12 * 10) / 10} yrs</>}{!c.depreciation && <span className="text-muted-foreground"> (default)</span>}</td>
                      <td className="num text-right">{c.assetCount.toLocaleString()}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <IconBtn label={canEdit ? `Edit ${c.name}` : `View ${c.name}`} onClick={() => setEdit(structuredClone(c))} icon={Pencil} />
                          {canEdit && <IconBtn label={`Delete ${c.name}`} onClick={() => setDel(c)} icon={Trash2} danger />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CategoryDialog cat={edit} isNew={!!isNew} all={d.categories} d={d} readOnly={!canEdit} onClose={() => setEdit(null)}
        onSave={(c) => { set((x) => { const i = x.categories.findIndex((y) => y.id === c.id); if (i >= 0) x.categories[i] = c; else x.categories.push(c); }); setEdit(null); toast.success(isNew ? `"${c.name}" added` : `"${c.name}" updated`, { description: "Save changes to apply." }); }} />

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del?.assetCount ? `Can't delete "${del?.name}" yet` : `Delete "${del?.name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {del?.assetCount
                ? `${del.assetCount.toLocaleString()} assets belong to this category. Move them to another category first, or mark it inactive to stop new assets being added.`
                : "This category has no assets. Custom fields linked only to it will apply to all categories instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {del?.assetCount
              ? <AlertDialogAction onClick={() => { const c = del; set((x) => { const t = x.categories.find((y) => y.id === c.id); if (t) t.active = false; }); toast.success(`"${c.name}" marked inactive`); }}>Mark inactive</AlertDialogAction>
              : <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const c = del!; set((x) => { x.categories = x.categories.filter((y) => y.id !== c.id); x.fields.forEach((f) => (f.categoryIds = f.categoryIds.filter((i) => i !== c.id))); }); toast(`"${c.name}" deleted`); }}>Delete category</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function IconBtn({ label, onClick, icon: I, danger }: { label: string; onClick: () => void; icon: LucideIcon; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-subtle", danger ? "hover:text-destructive" : "hover:text-foreground")}><I className="size-3.5" /></button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CategoryDialog({ cat, isNew, all, d, readOnly, onClose, onSave }: { cat: AssetCategory | null; isNew: boolean; all: AssetCategory[]; d: AssetSettings; readOnly: boolean; onClose: () => void; onSave: (c: AssetCategory) => void }) {
  const [c, setC] = useState<AssetCategory | null>(cat);
  const [codeTouched, setCodeTouched] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => { setC(cat); setCodeTouched(!!cat?.code); setTried(false); }, [cat]);
  if (!c) return null;
  const up = (p: Partial<AssetCategory>) => setC({ ...c, ...p });
  const err = categoryIssues(c, all);
  const show = (k: string) => (tried || (k === "code" && codeTouched) ? err[k] : undefined);
  const rule = c.depreciation;
  const setRule = (p: Partial<DepRule>) => up({ depreciation: { ...(rule ?? { method: d.depreciation.method, usefulLifeMonths: d.depreciation.usefulLifeMonths, salvagePct: d.depreciation.salvagePct }), ...p } });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add category" : readOnly ? c.name : `Edit ${c.name}`}</DialogTitle>
          <DialogDescription>Assets in this category share an ID code, depreciation and service rules.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Name" htmlFor="c-name" error={show("name")}>
              <TextInput id="c-name" autoFocus value={c.name} invalid={!!show("name")} placeholder="e.g. Heavy vehicles" onChange={(e) => up({ name: e.target.value, code: codeTouched ? c.code : suggestCode(e.target.value) })} />
            </Field>
            <Field label="Code" htmlFor="c-code" error={show("code")}>
              <TextInput id="c-code" className="num" maxLength={5} value={c.code} invalid={!!show("code")} placeholder="HVY" onChange={(e) => { setCodeTouched(true); up({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }); }} />
            </Field>
          </div>
          <Field label="Description" htmlFor="c-desc" hint="Helps people pick the right category when registering.">
            <TextArea id="c-desc" rows={2} className="min-h-0" value={c.description} placeholder="e.g. Buses, trucks and trailers over 3.5 t" onChange={(e) => up({ description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Own prefix (optional)" htmlFor="c-prefix" error={show("prefixOverride")} hint={`Replaces "${d.numbering.prefix || "—"}" for this category.`}>
              <TextInput id="c-prefix" className="num" maxLength={6} value={c.prefixOverride ?? ""} placeholder={d.numbering.prefix} onChange={(e) => up({ prefixOverride: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") || undefined })} />
            </Field>
            <Field label="Unique identifier" htmlFor="c-ident" hint="Required when registering, and checked for duplicates.">
              <Select id="c-ident" value={c.identifier} onChange={(e) => up({ identifier: e.target.value as AssetCategory["identifier"] })}>
                {Object.entries(IDENTIFIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <p className="rounded-md bg-subtle px-3 py-2 text-[12px] text-muted-foreground">IDs will look like <span className="num font-medium text-foreground">{formatAssetId(d.numbering, c)}</span></p>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Depreciation</span>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">Use company default
                <Switch checked={!rule} onCheckedChange={(v) => up({ depreciation: v ? undefined : { method: d.depreciation.method, usefulLifeMonths: d.depreciation.usefulLifeMonths, salvagePct: d.depreciation.salvagePct } })} />
              </label>
            </div>
            {rule ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Method"><Select value={rule.method} onChange={(e) => setRule({ method: e.target.value as DepMethod })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Useful life (months)"><TextInput className="num" inputMode="numeric" value={rule.usefulLifeMonths} onChange={(e) => setRule({ usefulLifeMonths: Math.max(1, int(e.target.value, 1)) })} disabled={rule.method === "none"} /></Field>
                <Field label="Salvage value %"><TextInput className="num" inputMode="numeric" value={rule.salvagePct} onChange={(e) => setRule({ salvagePct: Math.min(90, int(e.target.value)) })} disabled={rule.method === "none"} /></Field>
              </div>
            ) : <p className="text-[12px] text-muted-foreground">{METHOD_LABEL[d.depreciation.method]} over {d.depreciation.usefulLifeMonths} months, {d.depreciation.salvagePct}% salvage.</p>}
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Service every" htmlFor="c-maint" hint="Drives maintenance-due alerts.">
              <Select id="c-maint" value={c.maintenanceEveryMonths ?? 0} onChange={(e) => up({ maintenanceEveryMonths: +e.target.value || undefined })}>
                <option value={0}>No scheduled service</option>{[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m === 1 ? "Month" : m === 12 ? "Year" : m === 24 ? "2 years" : `${m} months`}</option>)}
              </Select>
            </Field>
            <div className="divide-y divide-border">
              <ToggleRow label="Can be checked out" checked={c.checkoutAllowed} onChange={(v) => up({ checkoutAllowed: v })} />
              <ToggleRow label="Active" desc="Inactive categories can't receive new assets." checked={c.active} onChange={(v) => up({ active: v })} />
            </div>
          </div>
        </fieldset>
        <DialogFooter>
          <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle">{readOnly ? "Close" : "Cancel"}</button>
          {!readOnly && <button type="button" onClick={() => { setTried(true); if (!Object.keys(err).length) onSave({ ...c, name: c.name.trim() }); }} className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90">{isNew ? "Add category" : "Done"}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Statuses ───────────── */
function StatusesSection({ d, set, canEdit }: SP & { canEdit: boolean }) {
  const [edit, setEdit] = useState<AssetStatus | null>(null);
  const [del, setDel] = useState<AssetStatus | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const phases: StatusPhase[] = ["setup", "active", "service", "retired"];
  const isNew = edit && !d.statuses.some((s) => s.id === edit.id);
  const byId = (id: string) => d.statuses.find((s) => s.id === id);

  return (
    <>
      <Card title="Lifecycle" desc="Statuses are grouped by stage. Arrows show where an asset can move next — anything else is blocked, so records stay trustworthy.">
        <div className="grid gap-3 lg:grid-cols-4">
          {phases.map((p) => {
            const items = d.statuses.filter((s) => s.phase === p);
            return (
              <div key={p} className="rounded-lg bg-subtle/70 p-2.5">
                <p className="pd-section-title mb-2 px-0.5">{PHASE_LABEL[p]}</p>
                <div className="space-y-1.5">
                  {items.map((s) => (
                    <button type="button" key={s.id} onClick={() => setEdit(structuredClone(s))} className={cn("group w-full rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-primary/40", !s.enabled && "opacity-50")}>
                      <div className="flex items-center justify-between gap-1">
                        <StatusPill s={s} />
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {d.defaultStatusId === s.id && <span className="rounded bg-primary/10 px-1 text-primary">Default</span>}
                          {s.system && <Lock className="size-3" aria-label="Built-in" />}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{s.description}</p>
                      {s.next.length > 0 && <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><ArrowRight className="size-3 shrink-0" />{s.next.map((n) => byId(n)?.name).filter(Boolean).join(", ")}</p>}
                    </button>
                  ))}
                  {!items.length && <p className="px-1 py-2 text-[11px] text-muted-foreground">No statuses</p>}
                </div>
              </div>
            );
          })}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEdit({ id: uidx("st"), name: "", phase: "active", tone: "blue", description: "", system: false, enabled: true, checkoutable: false, depreciates: true, next: ["available"], assetCount: 0 })}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
            <Plus className="size-3.5" /> Add custom status
          </button>
        )}
      </Card>

      <Card title="Defaults">
        <Field label="Status for newly registered assets" htmlFor="st-def" hint="Assets received from a purchase order also start here.">
          <Select id="st-def" value={d.defaultStatusId} onChange={(e) => set((x) => { x.defaultStatusId = e.target.value; })} className="sm:max-w-xs">
            {d.statuses.filter((s) => s.enabled && s.phase !== "retired").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </Card>

      {edit && (
        <StatusDialog s={edit} isNew={!!isNew} all={d.statuses} readOnly={!canEdit} isDefault={d.defaultStatusId === edit.id} onClose={() => setEdit(null)} onDelete={() => { setDel(edit); setMoveTo(""); setEdit(null); }}
          onSave={(s) => { set((x) => { const i = x.statuses.findIndex((y) => y.id === s.id); if (i >= 0) x.statuses[i] = s; else x.statuses.push(s); }); setEdit(null); toast.success(isNew ? `"${s.name}" status added` : `"${s.name}" updated`, { description: "Save changes to apply." }); }} />
      )}

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{del?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>{del?.assetCount ? `${del.assetCount} assets are in this status. Choose where to move them.` : "No assets use this status. It will be removed from every lifecycle path."}</AlertDialogDescription>
          </AlertDialogHeader>
          {!!del?.assetCount && (
            <Select aria-label="Move assets to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose a status…</option>
              {d.statuses.filter((s) => s.id !== del.id && s.enabled).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!del?.assetCount && !moveTo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const s = del!; set((x) => { const t = x.statuses.find((y) => y.id === moveTo); if (t) t.assetCount += s.assetCount; x.statuses = x.statuses.filter((y) => y.id !== s.id); x.statuses.forEach((y) => (y.next = y.next.filter((n) => n !== s.id))); }); toast(`"${s.name}" deleted`); }}>
              Delete status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusDialog({ s: init, isNew, all, readOnly, isDefault, onClose, onSave, onDelete }: { s: AssetStatus; isNew: boolean; all: AssetStatus[]; readOnly: boolean; isDefault: boolean; onClose: () => void; onSave: (s: AssetStatus) => void; onDelete: () => void }) {
  const [s, setS] = useState(init);
  const [tried, setTried] = useState(false);
  const up = (p: Partial<AssetStatus>) => setS({ ...s, ...p });
  const nameErr = !s.name.trim() ? "Give the status a name." : all.some((x) => x.id !== s.id && x.name.trim().toLowerCase() === s.name.trim().toLowerCase()) ? "A status with this name already exists." : undefined;
  const toggleNext = (id: string) => up({ next: s.next.includes(id) ? s.next.filter((x) => x !== id) : [...s.next, id] });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add custom status" : readOnly ? s.name : `Edit "${init.name}"`}</DialogTitle>
          <DialogDescription>{s.system ? "Built-in status — you can rename it and change its rules, but not delete it." : "Custom statuses work like built-in ones in reports and filters."}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={readOnly} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="s-name" error={tried ? nameErr : undefined}>
              <TextInput id="s-name" autoFocus value={s.name} invalid={tried && !!nameErr} placeholder="e.g. Awaiting inspection" onChange={(e) => up({ name: e.target.value })} />
            </Field>
            <Field label="Stage" htmlFor="s-phase">
              <Select id="s-phase" value={s.phase} onChange={(e) => up({ phase: e.target.value as StatusPhase })}>{Object.entries(PHASE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
          </div>
          <div>
            <span className="pd-label">Colour</span>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
              {(Object.keys(TONES) as Tone[]).map((t) => (
                <button type="button" key={t} role="radio" aria-checked={s.tone === t} aria-label={t} onClick={() => up({ tone: t })} className={cn("flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition", TONES[t], s.tone === t && "ring-2 ring-primary")}>
                  {s.tone === t && <Check className="size-3.5" />}
                </button>
              ))}
              <span className="ml-2"><StatusPill s={{ name: s.name || "Preview", tone: s.tone }} /></span>
            </div>
          </div>
          <Field label="Description" htmlFor="s-desc" hint="Shown when someone changes an asset's status.">
            <TextInput id="s-desc" value={s.description} placeholder="When should people use this status?" onChange={(e) => up({ description: e.target.value })} />
          </Field>
          <div>
            <span className="pd-label">Can move to</span>
            <div className="flex flex-wrap gap-1.5">
              {all.filter((x) => x.id !== s.id).map((x) => {
                const on = s.next.includes(x.id);
                return <button type="button" key={x.id} aria-pressed={on} onClick={() => toggleNext(x.id)} className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] transition-colors", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/20")}>{on && <Check className="size-3" />}{x.name}</button>;
              })}
            </div>
            {!s.next.length && <FieldHint>No next status — assets here can't move on. Fine for final stages like Disposed.</FieldHint>}
          </div>
          <div className="divide-y divide-border border-t border-border pt-3">
            <ToggleRow label="Available for check-out" checked={s.checkoutable} onChange={(v) => up({ checkoutable: v })} />
            <ToggleRow label="Keep depreciating" desc="Turn off for draft or retired assets." checked={s.depreciates} onChange={(v) => up({ depreciates: v })} />
            <ToggleRow label="Enabled" desc={isDefault ? "This is the default status, so it must stay on." : "Disabled statuses are hidden when changing status."} checked={s.enabled} onChange={(v) => { if (!v && isDefault) { toast.error("Choose another default status first"); return; } up({ enabled: v }); }} />
          </div>
        </fieldset>
        <DialogFooter className="sm:justify-between">
          {!readOnly && !isNew && !s.system ? <button type="button" onClick={onDelete} disabled={isDefault} title={isDefault ? "Default status can't be deleted" : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] text-destructive hover:bg-destructive/10 disabled:opacity-40"><Trash2 className="size-3.5" /> Delete</button> : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle">{readOnly ? "Close" : "Cancel"}</button>
            {!readOnly && <button type="button" onClick={() => { setTried(true); if (!nameErr) onSave({ ...s, name: s.name.trim() }); }} className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90">{isNew ? "Add status" : "Done"}</button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Depreciation ───────────── */
function DepreciationSection({ d, set }: SP) {
  const dep = d.depreciation;
  const up = (p: Partial<typeof dep>) => set((x) => { Object.assign(x.depreciation, p); });
  const [cost, setCost] = useState(30000);
  const sched = useMemo(() => depreciationSchedule(cost, dep, dep.ddbFactor), [cost, dep]);
  const overrides = d.categories.filter((c) => c.depreciation);

  return (
    <>
      <Card>
        <ToggleRow label="Track depreciation" desc="Calculates book value for every capitalised asset and posts it to your ledger accounts." checked={dep.enabled} onChange={(v) => up({ enabled: v })} />
      </Card>
      {dep.enabled && <>
        <Card title="Company default" desc={<>Used by categories without their own rule. {overrides.length > 0 && <>{overrides.map((c) => c.name).join(", ")} {overrides.length === 1 ? "has" : "have"} their own.</>}</>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Method" htmlFor="d-method" hint={dep.method === "straight_line" ? "Same amount every period. Simplest and most common." : dep.method === "declining_balance" ? "Larger charges early on — suits vehicles and tech that lose value fast." : dep.method === "sum_of_years" ? "Front-loaded, but gentler than declining balance." : "Assets keep their purchase value."}>
              <Select id="d-method" value={dep.method} onChange={(e) => up({ method: e.target.value as DepMethod })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            {dep.method === "declining_balance" && (
              <Field label="Rate" htmlFor="d-rate">
                <Select id="d-rate" value={dep.ddbFactor} onChange={(e) => up({ ddbFactor: +e.target.value })}><option value={1.5}>150% declining</option><option value={2}>Double declining (200%)</option></Select>
              </Field>
            )}
            <Field label="Useful life" htmlFor="d-life" hint={`${(dep.usefulLifeMonths / 12).toFixed(1).replace(".0", "")} years`}>
              <div className="relative"><TextInput id="d-life" className="num pr-16" inputMode="numeric" value={dep.usefulLifeMonths} onChange={(e) => up({ usefulLifeMonths: Math.max(1, Math.min(600, int(e.target.value, 1))) })} disabled={dep.method === "none"} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">months</span></div>
            </Field>
            <Field label="Salvage value" htmlFor="d-salv" hint="Expected value when the asset is retired.">
              <div className="relative"><TextInput id="d-salv" className="num pr-8" inputMode="numeric" value={dep.salvagePct} onChange={(e) => up({ salvagePct: Math.min(90, int(e.target.value)) })} disabled={dep.method === "none"} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div>
            </Field>
            <Field label="Start depreciating" htmlFor="d-conv">
              <Select id="d-conv" value={dep.convention} onChange={(e) => up({ convention: e.target.value as typeof dep.convention })}>
                <option value="full_month">From the first of the month it's in service</option><option value="half_month">Half a month in the first month</option><option value="in_service_date">From the exact in-service date</option>
              </Select>
            </Field>
            <Field label="Post entries" htmlFor="d-freq">
              <Select id="d-freq" value={dep.frequency} onChange={(e) => up({ frequency: e.target.value as typeof dep.frequency })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></Select>
            </Field>
          </div>
        </Card>

        {dep.method !== "none" && (
          <Card title="Preview" desc="See how a purchase would lose value with these settings." action={
            <div className="relative w-36"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span><TextInput aria-label="Example cost" className="num pl-6" inputMode="numeric" value={cost} onChange={(e) => setCost(Math.min(10_000_000, int(e.target.value)))} disabled={false} /></div>
          }>
            {sched.length ? (
              <div className="flex h-36 items-end gap-1.5">
                {sched.map((r) => (
                  <Tooltip key={r.year}>
                    <TooltipTrigger asChild>
                      <div className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1">
                        <div className="w-full rounded-t bg-primary/70 transition-all duration-300 hover:bg-primary" style={{ height: `${Math.max(2, (r.book / cost) * 100)}%` }} />
                        <span className="text-[10px] text-muted-foreground">Y{r.year}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent><span className="num">Year {r.year}: {money(r.expense)} charged · {money(r.book)} book value</span></TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ) : <p className="text-[13px] text-muted-foreground">Enter a cost to see the schedule.</p>}
            {sched.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">First-year charge <span className="num text-foreground">{money(sched[0].expense)}</span> · value after {sched.length} {sched.length === 1 ? "year" : "years"} <span className="num text-foreground">{money(sched.at(-1)!.book)}</span></p>}
          </Card>
        )}

        <Card title="Accounting">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fiscal year starts" htmlFor="d-fy" hint="Used for yearly totals and fiscal-year ID resets.">
              <Select id="d-fy" value={d.fiscalYearStartMonth ?? 1} onChange={(e) => set((x) => { x.fiscalYearStartMonth = +e.target.value; })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>1 {m}</option>)}</Select>
            </Field>
            <Field label="Capitalise purchases over" htmlFor="d-cap" hint="Cheaper items are expensed and not depreciated.">
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span><TextInput id="d-cap" className="num pl-6" inputMode="numeric" value={dep.capitalizationThreshold} onChange={(e) => up({ capitalizationThreshold: int(e.target.value) })} /></div>
            </Field>
            <Field label="Expense account" htmlFor="d-exp"><TextInput id="d-exp" value={dep.expenseAccount} onChange={(e) => up({ expenseAccount: e.target.value })} /></Field>
            <Field label="Accumulated depreciation account" htmlFor="d-acc"><TextInput id="d-acc" value={dep.accumulatedAccount} onChange={(e) => up({ accumulatedAccount: e.target.value })} /></Field>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> Changing the method affects future periods only. Posted entries are never recalculated.</p>
        </Card>
      </>}
    </>
  );
}

/* ───────────── Alerts ───────────── */
function AlertsSection({ d, set }: SP) {
  const up = (id: string, p: Partial<AlertRule>) => set((x) => { const a = x.alerts.find((y) => y.id === id); if (a) Object.assign(a, p); });
  const on = d.alerts.filter((a) => a.enabled).length;
  return (
    <>
      <Card title="Alerts" desc={`${on} of ${d.alerts.length} alerts are on. Nobody is notified about assets they're not responsible for.`}>
        <div className="divide-y divide-border">
          {d.alerts.map((a) => {
            const m = ALERT_META[a.event];
            return (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-[13px] font-medium">{m.label}</p><p className="text-[12px] text-muted-foreground">{m.hint}</p></div>
                  <Switch aria-label={`${m.label} alert`} checked={a.enabled} onCheckedChange={(v) => up(a.id, { enabled: v })} />
                </div>
                {a.enabled && (
                  <div className="animate-in fade-in slide-in-from-top-1 mt-3 grid gap-3 rounded-lg bg-subtle/70 p-3 sm:grid-cols-[auto_auto_1fr]">
                    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      {m.unit === "before" ? "Notify" : "After"}
                      <TextInput aria-label="Days" className="num h-8 w-16 text-center" inputMode="numeric" value={a.leadDays} onChange={(e) => up(a.id, { leadDays: Math.min(365, int(e.target.value)) })} />
                      {m.unit === "before" ? "days before" : a.leadDays === 1 ? "day" : "days"}
                    </label>
                    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">Repeat
                      <Select aria-label="Repeat" className="h-8 w-auto" value={a.repeat} onChange={(e) => up(a.id, { repeat: e.target.value as AlertRule["repeat"] })}><option value="once">Once</option><option value="daily">Daily until resolved</option><option value="weekly">Weekly until resolved</option></Select>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      {(Object.keys(RECIPIENT_LABEL) as (keyof typeof RECIPIENT_LABEL)[]).map((r) => {
                        const sel = a.recipients.includes(r);
                        return <button type="button" key={r} aria-pressed={sel} onClick={() => { const next = sel ? a.recipients.filter((x) => x !== r) : [...a.recipients, r]; if (!next.length) { toast.error("Keep at least one recipient", { description: "Or turn the alert off instead." }); return; } up(a.id, { recipients: next }); }} className={cn("h-7 rounded-full border px-2.5 text-[11px] transition-colors", sel ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground")}>{RECIPIENT_LABEL[r]}</button>;
                      })}
                      <span className="mx-1 h-4 w-px bg-border" />
                      {(["inApp", "email"] as const).map((c) => (
                        <button type="button" key={c} aria-pressed={a.channels[c]} onClick={() => { const ch = { ...a.channels, [c]: !a.channels[c] }; if (!ch.inApp && !ch.email) { toast.error("Pick at least one channel"); return; } up(a.id, { channels: ch }); }} className={cn("h-7 rounded-full border px-2.5 text-[11px] transition-colors", a.channels[c] ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground")}>{c === "inApp" ? "In-app" : "Email"}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Delivery">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Summary email" htmlFor="a-dig" hint="One email listing everything that needs attention.">
            <Select id="a-dig" value={d.digest} onChange={(e) => set((x) => { x.digest = e.target.value as AssetSettings["digest"]; })}><option value="off">Don't send</option><option value="daily">Every morning</option><option value="weekly">Monday mornings</option></Select>
          </Field>
          <div className="sm:pt-5"><ToggleRow label="Pause on weekends" desc="Weekend alerts arrive Monday morning." checked={d.quietWeekends} onChange={(v) => set((x) => { x.quietWeekends = v; })} /></div>
        </div>
      </Card>
    </>
  );
}

/* ───────────── Custom fields ───────────── */
function FieldsSection({ d, set, canEdit }: SP & { canEdit: boolean }) {
  const [edit, setEdit] = useState<CustomField | null>(null);
  const [optText, setOptText] = useState("");
  const [tried, setTried] = useState(false);
  const isNew = edit && !d.fields.some((f) => f.id === edit.id);
  const open = (f: CustomField) => { setEdit(structuredClone(f)); setOptText(f.options.join(", ")); setTried(false); };
  const nameErr = !edit ? undefined : (!edit.label.trim() ? "Give the field a name." : d.fields.some((f) => f.id !== edit.id && slug(f.label) === slug(edit.label)) ? "A field with this name already exists." : undefined);
  const optErr = edit?.type === "select" && optText.split(",").map((s) => s.trim()).filter(Boolean).length < 2 ? "Add at least two choices, separated by commas." : undefined;
  const scope = (f: CustomField) => (f.categoryIds.length ? f.categoryIds.map((i) => d.categories.find((c) => c.id === i)?.name).filter(Boolean).join(", ") : "All categories");
  const TYPE = { text: "Text", number: "Number", date: "Date", select: "Dropdown" };

  return (
    <Card desc="Capture details that matter for each kind of asset — odometer for a truck, OS for a laptop." action={canEdit && <button type="button" onClick={() => open({ id: uidx("f"), label: "", type: "text", options: [], categoryIds: [], required: false })} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90"><Plus className="size-4" /> Add field</button>}>
      {d.fields.length ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {d.fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{f.label}{f.required && <span className="ml-1 text-destructive" aria-label="required">*</span>}</p>
                <p className="truncate text-[12px] text-muted-foreground">{TYPE[f.type]}{f.type === "select" && ` · ${f.options.length} choices`} · {scope(f)}</p>
              </div>
              <IconBtn label={canEdit ? `Edit ${f.label}` : `View ${f.label}`} icon={Pencil} onClick={() => open(f)} />
              {canEdit && <IconBtn label={`Delete ${f.label}`} icon={Trash2} danger onClick={() => { const snapshot = d.fields; set((x) => { x.fields = x.fields.filter((y) => y.id !== f.id); }); toast(`"${f.label}" removed`, { action: { label: "Undo", onClick: () => set((x) => { x.fields = snapshot; }) } }); }} />}
            </div>
          ))}
        </div>
      ) : <p className="rounded-lg border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">No custom fields yet.</p>}

      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{isNew ? "Add custom field" : `Edit "${edit.label}"`}</DialogTitle><DialogDescription>Shown on the asset form for the categories you pick.</DialogDescription></DialogHeader>
            <fieldset disabled={!canEdit} className="space-y-4">
              <Field label="Field name" htmlFor="f-label" error={tried ? nameErr : undefined}><TextInput id="f-label" autoFocus value={edit.label} invalid={tried && !!nameErr} placeholder="e.g. Engine number" onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
              <Field label="Type" htmlFor="f-type"><Select id="f-type" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as CustomField["type"] })}>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              {edit.type === "select" && <Field label="Choices" htmlFor="f-opt" error={tried ? optErr : undefined} hint="Separate with commas."><TextInput id="f-opt" value={optText} invalid={tried && !!optErr} placeholder="Diesel, Petrol, Electric" onChange={(e) => setOptText(e.target.value)} /></Field>}
              <div>
                <span className="pd-label">Show for</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={!edit.categoryIds.length} onClick={() => setEdit({ ...edit, categoryIds: [] })} className={cn("h-7 rounded-full border px-2.5 text-[12px]", !edit.categoryIds.length ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>All categories</button>
                  {d.categories.map((c) => { const on = edit.categoryIds.includes(c.id); return <button type="button" key={c.id} aria-pressed={on} onClick={() => setEdit({ ...edit, categoryIds: on ? edit.categoryIds.filter((i) => i !== c.id) : [...edit.categoryIds, c.id] })} className={cn("h-7 rounded-full border px-2.5 text-[12px]", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{c.name}</button>; })}
                </div>
              </div>
              <ToggleRow label="Required" desc="Assets can't be saved without it." checked={edit.required} onChange={(v) => setEdit({ ...edit, required: v })} />
            </fieldset>
            <DialogFooter>
              <button type="button" onClick={() => setEdit(null)} className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle">{canEdit ? "Cancel" : "Close"}</button>
              {canEdit && <button type="button" onClick={() => { setTried(true); if (nameErr || optErr) return; const f = { ...edit, label: edit.label.trim(), options: edit.type === "select" ? optText.split(",").map((s) => s.trim()).filter(Boolean) : [] }; set((x) => { const i = x.fields.findIndex((y) => y.id === f.id); if (i >= 0) x.fields[i] = f; else x.fields.push(f); }); setEdit(null); }} className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90">{isNew ? "Add field" : "Done"}</button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

/* ───────────── Check-out & audits ───────────── */
function CheckoutSection({ d, set }: SP) {
  const c = d.checkout, a = d.audit;
  const upC = (p: Partial<typeof c>) => set((x) => { Object.assign(x.checkout, p); });
  const upA = (p: Partial<typeof a>) => set((x) => { Object.assign(x.audit, p); });
  const maxErr = c.maxDays < c.defaultDays ? "Must be at least the default period." : undefined;
  return (
    <>
      <Card title="Check-out" desc="For pool laptops, shared vehicles and loan equipment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default loan period" htmlFor="c-def"><div className="relative"><TextInput id="c-def" className="num pr-12" inputMode="numeric" value={c.defaultDays} onChange={(e) => upC({ defaultDays: Math.max(1, int(e.target.value, 1)) })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span></div></Field>
          <Field label="Longest allowed" htmlFor="c-max" error={maxErr}><div className="relative"><TextInput id="c-max" className="num pr-12" inputMode="numeric" invalid={!!maxErr} value={c.maxDays} onChange={(e) => upC({ maxDays: Math.max(1, int(e.target.value, 1)) })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span></div></Field>
        </div>
        <div className="mt-4 divide-y divide-border border-t border-border pt-3">
          <ToggleRow label="Let people check out assets themselves" desc="Otherwise only asset managers can hand them out." checked={c.allowSelfCheckout} onChange={(v) => upC({ allowSelfCheckout: v })} />
          <ToggleRow label="Require manager approval" desc="The department manager approves before handover." checked={c.requireApproval} onChange={(v) => upC({ requireApproval: v })} />
          <ToggleRow label="Record condition at check-out and return" desc="A short note and optional photo, so damage is easy to trace." checked={c.requireCondition} onChange={(v) => upC({ requireCondition: v })} />
          <ToggleRow label="Ask the borrower to accept responsibility" desc="They confirm they'll return the asset in the same condition." checked={c.requireAcknowledgement} onChange={(v) => upC({ requireAcknowledgement: v })} />
        </div>
      </Card>
      <Card title="Physical audits" desc="Regularly confirm assets are where the register says they are.">
        <Field label="Audit each asset every" htmlFor="au-cyc">
          <Select id="au-cyc" className="sm:max-w-xs" value={a.cycleMonths} onChange={(e) => upA({ cycleMonths: +e.target.value })}>{[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m === 12 ? "Year" : m === 24 ? "2 years" : `${m} months`}</option>)}</Select>
        </Field>
        <div className="mt-4 divide-y divide-border border-t border-border pt-3">
          <ToggleRow label="Require a photo as proof" checked={a.requirePhoto} onChange={(v) => upA({ requirePhoto: v })} />
          <ToggleRow label="Flag assets not found as missing" desc="Missing assets are reported to the asset manager and finance." checked={a.autoFlagMissing} onChange={(v) => upA({ autoFlagMissing: v })} />
        </div>
      </Card>
      <div className="flex justify-end">
        <button type="button" onClick={() => { const def = defaultAssetSettings(); set((x) => { x.checkout = def.checkout; x.audit = def.audit; }); toast("Restored recommended check-out and audit settings", { description: "Save changes to apply." }); }} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"><RotateCcw className="size-3.5" /> Restore recommended</button>
      </div>
    </>
  );
}


/* ───────────── Per-category ranges ───────────── */
function RangesCard({ d, set }: SP) {
  const ranges = d.ranges ?? [];
  const [edit, setEdit] = useState<{ r: NumberRange; isNew: boolean } | null>(null);
  const [del, setDel] = useState<NumberRange | null>(null);
  const free = d.categories.filter((c) => !ranges.some((r) => r.categoryId === c.id));
  const catOf = (id: string) => d.categories.find((c) => c.id === id);
  const fmt = (x: number) => String(x).padStart(d.numbering.seqLength, "0");
  const add = () => {
    const c = free[0];
    setEdit({ isNew: true, r: { id: uidx("rg"), categoryId: c?.id ?? "", prefix: c?.code.slice(0, 3) ?? "", start: 1, end: Math.min(999, 10 ** d.numbering.seqLength - 1), next: 1 } });
  };
  return (
    <Card title="Number ranges by category" desc="Give a category its own prefix and block of numbers — handy for fleet IDs or pre-printed tags. Other categories use the company-wide sequence."
      action={<button type="button" onClick={add} disabled={!free.length} title={free.length ? undefined : "Every category already has a range"} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-medium transition-colors hover:bg-subtle disabled:opacity-50"><Plus className="size-3.5" /> Add range</button>}>
      {ranges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No ranges yet. Every category draws from the company-wide sequence.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="pd-table min-w-[560px]">
            <thead><tr><th>Category</th><th>Range</th><th>Next ID</th><th>Used</th><th className="w-20" /></tr></thead>
            <tbody>
              {ranges.map((r) => {
                const c = catOf(r.categoryId);
                const used = r.next - r.start, total = r.end - r.start + 1, full = r.next > r.end;
                const errs = Object.keys(rangeIssues(r, ranges, d.numbering.seqLength)).length;
                return (
                  <tr key={r.id}>
                    <td><span className="flex items-center gap-2 text-[13px] font-medium">{c?.name ?? "Deleted category"}{errs > 0 && <AlertTriangle className="size-3.5 text-destructive" aria-label="Has errors" />}</span></td>
                    <td className="num text-[12px] text-muted-foreground">{fmt(r.start)} – {fmt(r.end)}</td>
                    <td className="num text-[12px]">{full ? <span className="text-warning">Full — uses company sequence</span> : previewAssetId(d, c)}</td>
                    <td>
                      <div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle"><div className={cn("h-full rounded-full", used / total > 0.9 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, (used / total) * 100)}%` }} /></div><span className="num text-[11px] text-muted-foreground">{used}/{total}</span></div>
                    </td>
                    <td><div className="flex justify-end gap-0.5"><IconBtn label="Edit range" icon={Pencil} onClick={() => setEdit({ r: structuredClone(r), isNew: false })} /><IconBtn label="Remove range" icon={Trash2} danger onClick={() => setDel(r)} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning"><Info className="mt-0.5 size-3.5 shrink-0" /> Changing the format or ranges won't renumber existing assets. New rules apply from the next asset registered.</p>
      {edit && <RangeDialog init={edit.r} isNew={edit.isNew} d={d} onClose={() => setEdit(null)} onSave={(r) => { set((x) => { x.ranges ??= []; const i = x.ranges.findIndex((y) => y.id === r.id); if (i >= 0) x.ranges[i] = r; else x.ranges.push(r); }); setEdit(null); }} />}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {catOf(del?.categoryId ?? "")?.name} range?</AlertDialogTitle>
            <AlertDialogDescription>New {catOf(del?.categoryId ?? "")?.name?.toLowerCase()} assets will use the company-wide sequence. IDs already issued from this range stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep range</AlertDialogCancel><AlertDialogAction onClick={() => { const id = del!.id; set((x) => { x.ranges = (x.ranges ?? []).filter((y) => y.id !== id); }); setDel(null); }}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RangeDialog({ init, isNew, d, onClose, onSave }: { init: NumberRange; isNew: boolean; d: AssetSettings; onClose: () => void; onSave: (r: NumberRange) => void }) {
  const [r, setR] = useState(init);
  const [tried, setTried] = useState(false);
  const all = (d.ranges ?? []).filter((x) => x.id !== r.id).concat(r);
  const e = rangeIssues(r, all, d.numbering.seqLength);
  const issued = !isNew && init.next > init.start;
  const up = (p: Partial<NumberRange>) => setR((x) => { const n = { ...x, ...p }; if (!issued) n.next = n.start; return n; });
  const cat = d.categories.find((c) => c.id === r.categoryId);
  const sample = cat ? previewAssetId({ ...d, ranges: [{ ...r, next: Math.max(r.next, r.start) }] }, cat) : "";
  const submit = () => { setTried(true); if (Object.keys(e).length) return; onSave({ ...r, next: Math.max(r.next, r.start) }); };
  const err = (k: string) => (tried ? e[k] : undefined);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isNew ? "Add number range" : "Edit number range"}</DialogTitle><DialogDescription>Assets in this category get IDs from this block until it's used up, then fall back to the company-wide sequence.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="rg-cat" error={err("categoryId")}>
            <Select id="rg-cat" value={r.categoryId} disabled={issued} invalid={!!err("categoryId")} onChange={(ev) => { const c = d.categories.find((x) => x.id === ev.target.value); up({ categoryId: ev.target.value, prefix: r.prefix || (c?.code.slice(0, 3) ?? "") }); }}>
              <option value="">Choose…</option>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Prefix" htmlFor="rg-prefix" error={err("prefix")}>
            <TextInput id="rg-prefix" value={r.prefix} maxLength={6} invalid={!!err("prefix")} onChange={(ev) => up({ prefix: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="FLT" />
          </Field>
          <Field label="First number" htmlFor="rg-start" error={err("start")} hint={issued ? "Locked — numbers were already issued." : undefined}>
            <TextInput id="rg-start" className="num" inputMode="numeric" disabled={issued} value={r.start} invalid={!!err("start")} onChange={(ev) => up({ start: int(ev.target.value) })} />
          </Field>
          <Field label="Last number" htmlFor="rg-end" error={err("end")}>
            <TextInput id="rg-end" className="num" inputMode="numeric" value={r.end} invalid={!!err("end")} onChange={(ev) => up({ end: int(ev.target.value) })} />
          </Field>
        </div>
        {sample && !Object.keys(e).length && <p className="rounded-md bg-subtle px-3 py-2 text-[12px] text-muted-foreground">Next {cat?.name.toLowerCase()} asset: <span className="num font-medium text-foreground">{sample}</span></p>}
        <DialogFooter>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground">Cancel</button>
          <button type="button" onClick={submit} className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90">{isNew ? "Add range" : "Done"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Integrations ───────────── */
function IntegrationsSection({ d, setDraft, canEdit }: { d: AssetSettings; setDraft: (fn: (p: AssetSettings) => AssetSettings) => void; canEdit: boolean }) {
  const me = useMe();
  const db = useDB();
  const [open, setOpen] = useState<IntegrationId | null>(null);
  const [disc, setDisc] = useState<IntegrationId | null>(null);
  const saved = db.assets?.integrations ?? {};
  // Connections apply right away (like signing in to a service), so they don't wait for Save.
  const apply = (id: IntegrationId, v: IntegrationState) => {
    mutate((x) => { if (!x.assets) return; x.assets.integrations = { ...(x.assets.integrations ?? {}), [id]: v }; });
    setDraft((p) => ({ ...p, integrations: { ...(p.integrations ?? {}), [id]: v } }));
  };
  const meta = INTEGRATIONS.find((i) => i.id === open);
  const cur = open ? saved[open] : undefined;
  const [account, setAccount] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const start = (id: IntegrationId) => { const m = INTEGRATIONS.find((i) => i.id === id)!; const s = saved[id]; setAccount(s?.account ?? ""); setEvents(s?.syncEvents ?? m.events.map((e) => e.id)); setTried(false); setOpen(id); };
  const accErr = !account.trim() ? `Enter the ${meta?.accountLabel.toLowerCase()}.` : open === "api" && !/^https:\/\/\S+\.\S+/.test(account.trim()) ? "Use a full https:// address." : undefined;
  const evErr = events.length ? undefined : "Choose at least one thing to sync.";
  const submit = () => {
    setTried(true);
    if (accErr || evErr || !open) return;
    apply(open, { connected: true, connectedAt: cur?.connectedAt ?? new Date().toISOString(), connectedBy: cur?.connectedBy ?? me?.id, account: account.trim(), syncEvents: events });
    toast.success(cur?.connected ? `${meta!.name} updated` : `${meta!.name} connected`, { description: "Demo connection — no data leaves ProcureDesk." });
    setOpen(null);
  };
  const connectedCount = INTEGRATIONS.filter((i) => saved[i.id]?.connected).length;
  return (
    <>
      <Card title="Connected apps" desc={`${connectedCount} of ${INTEGRATIONS.length} connected. Connections take effect straight away — no need to save.`}>
        <div className="divide-y divide-border">
          {INTEGRATIONS.map((i) => {
            const st = saved[i.id];
            const by = db.users.find((u) => u.id === st?.connectedBy);
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-[12px] font-semibold text-muted-foreground ring-1 ring-border">{i.name.slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">{i.name}{st?.connected && <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-medium text-success"><Check className="size-3" />Connected</span>}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{st?.connected ? <><span className="num">{st.account}</span> · {st.syncEvents.length} {st.syncEvents.length === 1 ? "event" : "events"} synced{by ? ` · by ${by.name}` : ""}</> : i.desc}</p>
                </div>
                {st?.connected ? (
                  <div className="flex gap-1.5">
                    <button type="button" disabled={!canEdit} onClick={() => start(i.id)} className="h-8 rounded-md border border-border bg-surface px-3 text-[13px] font-medium hover:bg-subtle disabled:opacity-50">Settings</button>
                    <button type="button" disabled={!canEdit} onClick={() => setDisc(i.id)} className="h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle hover:text-destructive disabled:opacity-50">Disconnect</button>
                  </div>
                ) : (
                  <button type="button" disabled={!canEdit} onClick={() => start(i.id)} className="h-8 rounded-md border border-border bg-surface px-3 text-[13px] font-medium hover:bg-subtle disabled:opacity-50">Connect</button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" /> These connections are a demo. Disconnecting stops future syncs; records already sent keep their external IDs.</p>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{cur?.connected ? `${meta?.name} settings` : `Connect ${meta?.name}`}</DialogTitle><DialogDescription>{meta?.desc}</DialogDescription></DialogHeader>
          <Field label={meta?.accountLabel ?? ""} htmlFor="int-acc" error={tried ? accErr : undefined}>
            <TextInput id="int-acc" autoFocus value={account} placeholder={meta?.placeholder} invalid={tried && !!accErr} onChange={(e) => setAccount(e.target.value)} />
          </Field>
          <div>
            <p className="pd-label">What to sync</p>
            <div className="space-y-2">
              {meta?.events.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" checked={events.includes(e.id)} onChange={(ev) => setEvents((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />{e.label}</label>
              ))}
            </div>
            {tried && evErr && <FieldHint error>{evErr}</FieldHint>}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setOpen(null)} className="h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground">Cancel</button>
            <button type="button" onClick={submit} className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90">{cur?.connected ? "Save" : "Connect"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!disc} onOpenChange={(o) => !o && setDisc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {INTEGRATIONS.find((i) => i.id === disc)?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Future changes stop syncing. Records already sent stay linked, and you can reconnect anytime.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Stay connected</AlertDialogCancel><AlertDialogAction onClick={() => { const id = disc!; apply(id, { connected: false, syncEvents: [] }); toast(`${INTEGRATIONS.find((i) => i.id === id)?.name} disconnected`); setDisc(null); }}>Disconnect</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
