import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Download, FileText, ImagePlus, Info, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { BTN, BTN_GHOST, BTN_PRIMARY, Card, Field, HolderPick, HolderToggle, Seg, fmtDate } from "@/components/pd/assetUi";
import { Checkbox, Select, TextArea, TextInput } from "@/components/pd/form";
import { METHOD_LABEL, depreciationSchedule, previewAssetId, type DepMethod } from "@/lib/pd/assets";
import {
  activationIssues, addMonths, blankAsset, COVERAGE_LABEL, depRuleFor, MAINT_TYPE_LABEL, openRepair, PRIORITY_LABEL, registerAsset, SITES, today,
  type Asset, type AssetDoc, type Condition, type Lease, type MaintenancePlan, type Priority, type WarrantyCoverage,
} from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { ACCOUNTS } from "@/lib/pd/types";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/register/new")({
  head: () => ({
    meta: [
      { title: "New asset · ProcureDesk" },
      { name: "description", content: "Register a new asset with its ID, location, financial, depreciation, warranty, lease and maintenance details." },
      { property: "og:title", content: "New asset · ProcureDesk" },
      { property: "og:description", content: "Capture everything about a new company asset in one guided form." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAssetPage,
});

const SECTIONS = [
  { id: "identification", label: "Identification" },
  { id: "assignment", label: "Location & assignment" },
  { id: "financial", label: "Financial" },
  { id: "depreciation", label: "Depreciation" },
  { id: "warranty", label: "Warranty" },
  { id: "maintenance", label: "Maintenance" },
  { id: "condition", label: "Condition & lifecycle" },
  { id: "additional", label: "Additional details" },
  { id: "files", label: "Documentation" },
] as const;
const FIELD_SECTION: Record<string, string> = {
  name: "identification", categoryId: "identification", identifier: "identification",
  site: "assignment", businessUnit: "assignment", assignedTo: "assignment", repairIssue: "assignment",
  cost: "financial", leaseCompany: "financial", leaseEnd: "financial", life: "depreciation", warrantyEnd: "warranty",
};
const START_STATUSES = [{ id: "available", label: "Available" }, { id: "in_use", label: "In use" }, { id: "in_repair", label: "In repair" }, { id: "decommissioned", label: "Decommissioned" }] as const;
const STATUS_HINT: Record<string, string> = {
  available: "Ready to use and not assigned to anyone. You can assign or check it out later.",
  in_use: "Choose who or where the asset is assigned to.",
  in_repair: "A repair is opened with this asset, so you can track it through each stage.",
  decommissioned: "Kept for records only. It can't be assigned or checked out.",
};
const DEP_GL = ["Accumulated depreciation – IT equipment", "Accumulated depreciation – Vehicles", "Accumulated depreciation – Furniture", "Accumulated depreciation – Machinery"];
const MAX_FILE = 10 * 1024 * 1024;
const blankLease = (): Lease => ({ company: "", type: "", monthly: 0, buyout: 0 });
const blankPlan = (): MaintenancePlan => ({ name: "", type: "preventive", instructions: "", cost: 0, repeats: false });
const num = (v: string) => Math.max(0, parseFloat(v.replace(/[^0-9.]/g, "")) || 0);
const monthsBetween = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86400000))) : 0);

/** Shrinks a photo to ≤ 800 px JPEG so the shared workspace stays light. */
function compress(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.75));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Minimal CSV parser (quoted values supported). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const CSV_HEAD = ["Asset name", "Category", "Serial number", "Manufacturer", "Model", "Site", "Business unit", "Purchase date", "Purchase price"];

function NewAssetPage() {
  const db = useDB();
  const me = useMe();
  const s = db.assets!;
  const navigate = useNavigate();
  const [a, setA] = useState<Asset>(() => ({ ...blankAsset(s), categoryId: "", statusId: "available", site: "", maintenanceEveryMonths: undefined, purchaseDate: undefined, ownership: "owned" }));
  const pristine = useRef(JSON.stringify(a));
  const [tried, setTried] = useState(false);
  const [active, setActive] = useState<string>("identification");
  const [trackDep, setTrackDep] = useState(s.depreciation.enabled);
  const [depEdited, setDepEdited] = useState(false);
  const [holderKind, setHolderKind] = useState<"user" | "site">("user");
  const [repair, setRepair] = useState<{ issue: string; priority: Priority }>({ issue: "", priority: "normal" });
  const [plan, setPlan] = useState<MaintenancePlan>(blankPlan);
  const [leaseCache, setLeaseCache] = useState<Lease>(blankLease);
  const up = (p: Partial<Asset>) => setA((x) => ({ ...x, ...p }));

  const cat = s.categories.find((c) => c.id === a.categoryId);
  const nextId = a.categoryId ? previewAssetId(s, cat) : "";
  const fields = s.fields.filter((f) => !f.categoryIds.length || f.categoryIds.includes(a.categoryId));
  const leased = a.ownership === "leased";
  const baseRule = depRuleFor({ categoryId: a.categoryId, depOverride: undefined }, s);
  const rule = a.depOverride ?? baseRule;
  const depOn = trackDep && !leased && s.depreciation.enabled;
  const belowThreshold = !leased && a.cost > 0 && a.cost < s.depreciation.capitalizationThreshold;
  const people = db.users.filter((u) => u.active);
  const depts = db.departments.filter((d) => !a.businessUnit || d.businessUnit === a.businessUnit);
  const planUsed = !!(plan.name.trim() || plan.due);

  const issues: Record<string, string> = { ...activationIssues(a, s) };
  if (!a.businessUnit) issues.businessUnit = "Choose a business unit.";
  if (a.statusId === "in_use" && !a.assignedTo) issues.assignedTo = "Choose who or where it's assigned to.";
  if (a.statusId === "in_repair" && !repair.issue.trim()) issues.repairIssue = "Describe what needs fixing.";
  if (depOn && (!rule.usefulLifeMonths || rule.usefulLifeMonths < 1 || rule.usefulLifeMonths > 600)) issues.life = "Enter 1 to 600 months.";
  if (!a.categoryId) issues.categoryId = "Choose a category.";
  const draftIssues = Object.fromEntries(Object.entries(issues).filter(([k]) => k === "name" || k === "categoryId"));
  const shown = tried ? issues : {};
  const dirty = JSON.stringify(a) !== pristine.current || planUsed || !!repair.issue;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    const els = SECTIONS.map((x) => document.getElementById(x.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((p, q) => p.boundingClientRect.top - q.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-140px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [fields.length]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sectionErr = (id: string) => Object.keys(shown).some((k) => (FIELD_SECTION[k] ?? (k.startsWith("cf_") ? "additional" : "identification")) === id);

  const pickCategory = (id: string) => { setA((x) => ({ ...x, categoryId: id })); if (!depEdited) up({ depOverride: undefined }); };
  const pickStatus = (id: string) => setA((x) => ({ ...x, statusId: id, assignedTo: id === "in_use" ? x.assignedTo : undefined, checkout: undefined }));
  const setOwnership = (o: "owned" | "leased") => {
    if (o === "leased") up({ ownership: o, lease: a.lease ?? leaseCache });
    else { if (a.lease) setLeaseCache(a.lease); up({ ownership: o, lease: undefined }); }
  };
  const upLease = (p: Partial<Lease>) => up({ lease: { ...(a.lease ?? blankLease()), ...p } });
  const upDep = (p: Partial<typeof rule>) => { setDepEdited(true); up({ depOverride: { ...rule, ...p } }); };
  const pickDept = (id: string) => { const d = db.departments.find((x) => x.id === id); up({ departmentId: id || undefined, businessUnit: d?.businessUnit ?? a.businessUnit, costCenter: a.costCenter ?? (d ? d.name : undefined) }); };

  const addPhotos = async (files: FileList | File[]) => {
    const all = [...files];
    const imgs = all.filter((f) => /image\/(jpeg|png|gif)/.test(f.type) && f.size <= MAX_FILE);
    if (imgs.length < all.length) toast.error("Some files were skipped", { description: "Photos must be JPG, PNG or GIF, up to 10 MB." });
    const room = 4 - a.photos.length;
    if (room <= 0) { toast.error("You can add up to 4 photos"); return; }
    try {
      const out = await Promise.all(imgs.slice(0, room).map(async (f) => ({ id: crypto.randomUUID(), name: f.name, url: await compress(f) })));
      setA((x) => ({ ...x, photos: [...x.photos, ...out] }));
    } catch { toast.error("That photo couldn't be read", { description: "Try a JPG or PNG." }); }
  };
  const addDocs = (files: FileList | File[]) => {
    const all = [...files];
    const ok = all.filter((f) => /\.(pdf|doc|docx|png|jpe?g)$/i.test(f.name) && f.size <= MAX_FILE);
    if (ok.length < all.length) toast.error("Some files were skipped", { description: "Use PDF, DOC, DOCX, PNG or JPG, up to 10 MB." });
    const docs: AssetDoc[] = ok.map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, at: new Date().toISOString(), kind: /invoice|receipt/i.test(f.name) ? "invoice" : /warrant/i.test(f.name) ? "warranty" : /manual|guide/i.test(f.name) ? "manual" : /insur/i.test(f.name) ? "insurance" : "other" }));
    setA((x) => ({ ...x, docs: [...x.docs, ...docs] }));
  };

  const build = (asDraft: boolean): Asset => {
    const rec: Asset = structuredClone(a);
    rec.statusId = asDraft ? "draft" : a.statusId === "in_repair" ? "available" : a.statusId;
    if (asDraft) rec.assignedTo = undefined;
    rec.depOverride = leased ? undefined : !trackDep ? { ...rule, method: "none" } : depEdited ? a.depOverride : undefined;
    if (leased) rec.cost = 0;
    if (planUsed) {
      rec.plan = plan;
      rec.nextMaintenance = plan.due || undefined;
      rec.maintenanceEveryMonths = plan.repeats ? a.maintenanceEveryMonths || 12 : undefined;
    } else { rec.plan = undefined; rec.maintenanceEveryMonths = undefined; rec.nextMaintenance = undefined; }
    return rec;
  };

  const save = (asDraft: boolean) => {
    const errs = asDraft ? draftIssues : issues;
    if (Object.keys(errs).length) {
      setTried(true);
      const first = Object.keys(errs)[0];
      go(FIELD_SECTION[first] ?? (first.startsWith("cf_") ? "additional" : "identification"));
      toast.error(asDraft ? "Add a name and category to save a draft" : `${Object.keys(errs).length} ${Object.keys(errs).length === 1 ? "detail needs" : "details need"} attention`);
      return;
    }
    const rec = build(asDraft);
    let tag = "";
    mutate((d) => {
      tag = registerAsset(d, rec, me?.id);
      if (!asDraft && a.statusId === "in_repair") openRepair(d, rec.id, repair.issue.trim(), repair.priority, me?.id);
    });
    pristine.current = JSON.stringify(a);
    toast.success(asDraft ? `Draft ${tag} saved` : `${tag} created`, { description: asDraft ? "Finish the details whenever you're ready." : `${rec.name} is now ${START_STATUSES.find((x) => x.id === a.statusId)?.label.toLowerCase()}.` });
    navigate({ to: "/app/assets/$assetId", params: { assetId: rec.id } });
  };

  const csvRef = useRef<HTMLInputElement>(null);
  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { toast.error("No assets found in that file", { description: "Use the template — one asset per row under the header." }); return; }
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (r: string[], name: string) => (r[head.indexOf(name.toLowerCase())] ?? "").trim();
    let ready = 0, drafts = 0, skipped = 0;
    mutate((d) => {
      for (const r of rows.slice(1)) {
        const name = col(r, "Asset name"); const cn_ = col(r, "Category").toLowerCase();
        const c = d.assets!.categories.find((x) => x.name.toLowerCase() === cn_ || x.code.toLowerCase() === cn_);
        if (!name || !c) { skipped++; continue; }
        const rec: Asset = { ...blankAsset(d.assets!, c.id), name, identifier: col(r, "Serial number").toUpperCase(), make: col(r, "Manufacturer"), model: col(r, "Model"), site: SITES.find((x) => x.toLowerCase() === col(r, "Site").toLowerCase()) ?? "", businessUnit: d.org.businessUnits.find((x) => x.toLowerCase() === col(r, "Business unit").toLowerCase()), purchaseDate: col(r, "Purchase date") || undefined, cost: num(col(r, "Purchase price")), statusId: "available", ownership: "owned" };
        const ok = !Object.keys(activationIssues(rec, d.assets!)).length && !!rec.businessUnit;
        if (!ok) rec.statusId = "draft";
        registerAsset(d, rec, me?.id);
        ok ? ready++ : drafts++;
      }
    });
    if (!ready && !drafts) { toast.error("Nothing imported", { description: "Each row needs an asset name and a category that exists in Asset settings." }); return; }
    toast.success(`${ready + drafts} ${ready + drafts === 1 ? "asset" : "assets"} imported`, { description: [ready && `${ready} available`, drafts && `${drafts} saved as drafts (missing details)`, skipped && `${skipped} rows skipped`].filter(Boolean).join(" · ") });
    pristine.current = JSON.stringify(a);
    navigate({ to: "/app/assets/register" });
  };
  const downloadTemplate = () => {
    const csv = `${CSV_HEAD.join(",")}\nMacBook Pro 14,${s.categories[0]?.name ?? ""},C02FK3XYQ6L4,Apple,MacBook Pro 14,${SITES[0]},${db.org.businessUnits[0] ?? ""},${today()},2499`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "asset-import-template.csv" }).click();
    URL.revokeObjectURL(url);
  };

  const schedule = depOn && a.cost > 0 && !belowThreshold ? depreciationSchedule(a.cost, rule, s.depreciation.ddbFactor) : [];
  const leaseMonths = monthsBetween(a.lease?.start, a.lease?.end);
  const warrantyAlert = s.alerts.find((x) => x.event === "warranty_expiring");
  const suggestedRetire = a.inServiceDate || a.purchaseDate ? addMonths(a.inServiceDate || a.purchaseDate!, rule.usefulLifeMonths || 36) : undefined;
  const cancel = (e: React.MouseEvent) => { if (dirty && !confirm("Leave without saving? Your changes will be lost.")) e.preventDefault(); };
  const errCount = Object.keys(shown).length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 md:px-8">
      {/* Header */}
      <div className="sticky top-[60px] z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/app/assets/register" onClick={cancel} aria-label="Back to asset register" className="rounded-md p-1 text-muted-foreground hover:bg-subtle hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <h1 className="truncate text-[15px] font-semibold">Asset register <span className="font-normal text-muted-foreground">/ New asset</span></h1>
        </div>
        <div className="flex items-center gap-2">
          {errCount > 0 && <span className="hidden items-center gap-1 text-[12px] text-warning sm:inline-flex"><AlertTriangle className="size-3.5" />{errCount} to fix</span>}
          <Link to="/app/assets/register" onClick={cancel} className={BTN}>Cancel</Link>
          <button onClick={() => save(true)} className={BTN}>Save as draft</button>
          <button onClick={() => save(false)} className={BTN_PRIMARY}>Create asset</button>
        </div>
      </div>

      {/* Bulk import */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-2.5">
        <p className="text-[13px]"><span className="font-medium">Adding many assets at once?</span> <span className="text-muted-foreground">Upload a CSV or Excel file to import in bulk.</span></p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={downloadTemplate} className={BTN_GHOST}><Download className="size-3.5" />Template</button>
          <button type="button" onClick={() => csvRef.current?.click()} className={BTN}><Upload className="size-3.5" />Import CSV</button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Form sections" className="pd-scroll-hide -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-[136px] lg:mx-0 lg:block lg:space-y-0.5 lg:self-start lg:px-0">
          {SECTIONS.filter((x) => x.id !== "additional" || fields.length).map((x) => (
            <button key={x.id} onClick={() => go(x.id)} aria-current={active === x.id ? "true" : undefined}
              className={cn("flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-subtle lg:w-full", active === x.id ? "bg-subtle font-medium text-primary" : "text-muted-foreground")}>
              <span className="flex-1 truncate">{x.label}</span>
              {sectionErr(x.id) && <span className="size-1.5 rounded-full bg-destructive" title="Needs attention" />}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4 [&_section]:scroll-mt-[140px]">
          {/* Identification */}
          <Card id="identification" title="Identification" action={<span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">Auto-ID</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Asset name" htmlFor="a-name" required error={shown.name}>
                <TextInput id="a-name" autoFocus value={a.name} invalid={!!shown.name} maxLength={120} onChange={(e) => up({ name: e.target.value })} placeholder="Asset name" />
              </Field>
              <Field label="Category" htmlFor="a-cat" required error={shown.categoryId}>
                <Select id="a-cat" value={a.categoryId} invalid={!!shown.categoryId} onChange={(e) => pickCategory(e.target.value)}>
                  <option value="">Select category</option>{s.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Asset ID" htmlFor="a-id" hint={nextId ? `${cat?.code ?? ""} sequence · assigned on save` : "Choose a category to preview"}>
                <TextInput id="a-id" readOnly tabIndex={-1} className="num bg-subtle text-muted-foreground" value={nextId || "Auto-generated"} aria-live="polite" />
              </Field>
              <Field label="Asset tag" htmlFor="a-tag"><TextInput id="a-tag" className="num" value={a.assetTag ?? ""} onChange={(e) => up({ assetTag: e.target.value })} /></Field>
              <Field label={cat?.identifier === "vin" ? "Serial number / VIN" : "Serial number"} htmlFor="a-ident" required={!!cat && cat.identifier !== "none"} error={shown.identifier}>
                <TextInput id="a-ident" className="num" value={a.identifier} invalid={!!shown.identifier} onChange={(e) => up({ identifier: e.target.value.toUpperCase() })} maxLength={cat?.identifier === "vin" ? 17 : 64} />
              </Field>
              <Field label="Barcode / RFID" htmlFor="a-bar"><TextInput id="a-bar" className="num" value={a.barcode ?? ""} onChange={(e) => up({ barcode: e.target.value })} /></Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Manufacturer" htmlFor="a-make"><TextInput id="a-make" value={a.make} onChange={(e) => up({ make: e.target.value })} /></Field>
              <Field label="Model" htmlFor="a-model"><TextInput id="a-model" value={a.model} onChange={(e) => up({ model: e.target.value })} /></Field>
            </div>
          </Card>

          {/* Location & assignment */}
          <Card id="assignment" title="Location & assignment">
            <div className="mb-4">
              <p className="pd-label">Current status</p>
              <Seg label="Current status" value={a.statusId} options={[...START_STATUSES]} onChange={pickStatus} />
              <p className="mt-1.5 text-[12px] text-muted-foreground">{STATUS_HINT[a.statusId]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Site" htmlFor="a-site" required error={shown.site}>
                <Select id="a-site" value={a.site} invalid={!!shown.site} onChange={(e) => up({ site: e.target.value })}><option value="">Select site</option>{SITES.map((x) => <option key={x}>{x}</option>)}</Select>
              </Field>
              <Field label="Business unit" htmlFor="a-bu" required error={shown.businessUnit}>
                <Select id="a-bu" value={a.businessUnit ?? ""} invalid={!!shown.businessUnit} onChange={(e) => { const bu = e.target.value || undefined; const d = db.departments.find((x) => x.id === a.departmentId); up({ businessUnit: bu, departmentId: d && bu && d.businessUnit !== bu ? undefined : a.departmentId }); }}>
                  <option value="">Select business unit</option>{db.org.businessUnits.map((x) => <option key={x}>{x}</option>)}
                </Select>
              </Field>
              <Field label="Department" htmlFor="a-dept" hint={a.businessUnit ? undefined : "Picking one fills in the business unit."}>
                <Select id="a-dept" value={a.departmentId ?? ""} onChange={(e) => pickDept(e.target.value)}><option value="">Select department</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
              </Field>
            </div>

            {a.statusId === "in_use" && (
              <Reveal>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="pd-label mb-0">Assigned to <span className="text-destructive">*</span></p><HolderToggle v={holderKind} set={(k) => { setHolderKind(k); up({ assignedTo: undefined }); }} /></div>
                <div className="sm:max-w-sm"><HolderPick kind={holderKind} value={a.assignedTo} people={people} error={shown.assignedTo} onChange={(h) => up({ assignedTo: h })} /></div>
              </Reveal>
            )}
            {a.statusId === "in_repair" && (
              <Reveal>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <Field label="What needs fixing?" htmlFor="r-issue" required error={shown.repairIssue}>
                    <TextInput id="r-issue" value={repair.issue} invalid={!!shown.repairIssue} onChange={(e) => setRepair((r) => ({ ...r, issue: e.target.value }))} placeholder="e.g. Screen flickers when opened" />
                  </Field>
                  <Field label="Priority" htmlFor="r-pri">
                    <Select id="r-pri" value={repair.priority} onChange={(e) => setRepair((r) => ({ ...r, priority: e.target.value as Priority }))}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">You can add parts, the repair vendor and costs from the asset's page.</p>
              </Reveal>
            )}
          </Card>

          {/* Financial */}
          <Card id="financial" title="Financial" desc={leased ? "The leasing company owns this asset; you pay to use it." : "What you paid and how it's booked."}
            action={<Seg label="Ownership" value={a.ownership} options={[{ id: "owned", label: "Owned" }, { id: "leased", label: "Leased" }]} onChange={setOwnership} />}>
            {leased ? (
              <div key="lease" className="grid gap-4 animate-in fade-in sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Leasing company" htmlFor="l-co" required error={shown.leaseCompany} className="sm:col-span-2">
                  <TextInput id="l-co" value={a.lease?.company ?? ""} invalid={!!shown.leaseCompany} onChange={(e) => upLease({ company: e.target.value })} />
                </Field>
                <Field label="Lease type" htmlFor="l-type" className="sm:col-span-2" hint={a.lease?.type === "finance" ? "Usually ends with ownership; often depreciated." : a.lease?.type === "operating" ? "A rental — returned at the end, not depreciated." : undefined}>
                  <Select id="l-type" value={a.lease?.type ?? ""} onChange={(e) => upLease({ type: e.target.value as Lease["type"] })}><option value="">Select lease type</option><option value="operating">Operating lease</option><option value="finance">Finance lease</option></Select>
                </Field>
                <Field label="Monthly payment" htmlFor="l-mo"><Money id="l-mo" value={a.lease?.monthly ?? 0} onChange={(v) => upLease({ monthly: v })} /></Field>
                <Field label="Buyout price" htmlFor="l-buy"><Money id="l-buy" value={a.lease?.buyout ?? 0} onChange={(v) => upLease({ buyout: v })} /></Field>
                <Field label="Lease start" htmlFor="l-s"><TextInput id="l-s" type="date" value={a.lease?.start ?? ""} onChange={(e) => upLease({ start: e.target.value || undefined })} /></Field>
                <Field label="Lease end" htmlFor="l-e" error={shown.leaseEnd}><TextInput id="l-e" type="date" min={a.lease?.start} value={a.lease?.end ?? ""} invalid={!!shown.leaseEnd} onChange={(e) => upLease({ end: e.target.value || undefined })} /></Field>
                {leaseMonths > 0 && !!a.lease?.monthly && <p className="text-[12px] text-muted-foreground sm:col-span-2 lg:col-span-4">{leaseMonths} months · <span className="num text-foreground">{money(leaseMonths * a.lease.monthly)}</span> in total payments{a.lease.buyout ? <>, plus <span className="num text-foreground">{money(a.lease.buyout)}</span> to buy it out</> : null}.</p>}
              </div>
            ) : (
              <div key="own" className="grid gap-4 animate-in fade-in sm:grid-cols-3">
                <Field label="Purchase date" htmlFor="a-pdate"><TextInput id="a-pdate" type="date" max={today()} value={a.purchaseDate ?? ""} onChange={(e) => up({ purchaseDate: e.target.value || undefined })} /></Field>
                <Field label="Purchase price" htmlFor="a-cost" required error={shown.cost} hint={belowThreshold ? `Below the ${money(s.depreciation.capitalizationThreshold)} capitalisation limit — expensed, not depreciated.` : undefined}>
                  <Money id="a-cost" value={a.cost} invalid={!!shown.cost} onChange={(v) => up({ cost: v })} />
                </Field>
                <Field label="Supplier" htmlFor="a-vendor">
                  <Select id="a-vendor" value={a.vendorId ?? ""} onChange={(e) => up({ vendorId: e.target.value || undefined })}><option value="">Select supplier</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
                </Field>
                <Field label="Linked PO" htmlFor="a-po"><TextInput id="a-po" value={a.poNumber} onChange={(e) => up({ poNumber: e.target.value })} placeholder="Order ID" /></Field>
                <Field label="PO line" htmlFor="a-pol"><TextInput id="a-pol" value={a.poLine ?? ""} disabled={!a.poNumber} onChange={(e) => up({ poLine: e.target.value })} placeholder={a.poNumber ? "Order item ID" : "Add a PO first"} /></Field>
                <div className="hidden sm:block" />
              </div>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="GL account" htmlFor="a-gl"><Select id="a-gl" value={a.glAccount ?? ""} onChange={(e) => up({ glAccount: e.target.value || undefined })}><option value="">Select GL account</option>{ACCOUNTS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Cost center" htmlFor="a-cc"><Select id="a-cc" value={a.costCenter ?? ""} onChange={(e) => up({ costCenter: e.target.value || undefined })}><option value="">Select cost center</option>{db.departments.map((x) => <option key={x.id}>{x.name}</option>)}</Select></Field>
            </div>
          </Card>

          {/* Depreciation */}
          <Card id="depreciation" title="Depreciation" desc={leased ? undefined : !s.depreciation.enabled ? undefined : depEdited ? "Custom rule for this asset." : `Uses the ${cat?.depreciation ? `${cat.name} category` : "company default"} rule — change any value to override it.`}
            action={!leased && s.depreciation.enabled ? <Checkbox label="Track depreciation" checked={trackDep} onChange={(e) => setTrackDep(e.target.checked)} className="text-[13px]" /> : undefined}>
            {leased ? <Note>Leased assets aren't depreciated here — the leasing company owns them. Switch Financial to Owned to track depreciation.</Note>
              : !s.depreciation.enabled ? <Note>Depreciation is switched off in Asset settings.</Note>
              : !trackDep ? <p className="text-[13px] text-muted-foreground">Not tracked. The asset keeps its purchase price as its value.</p>
              : (
                <div className="animate-in fade-in">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Method" htmlFor="d-m"><Select id="d-m" value={rule.method} onChange={(e) => upDep({ method: e.target.value as DepMethod })}>{Object.entries(METHOD_LABEL).filter(([k]) => k !== "none").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                    <Field label="Useful life (months)" htmlFor="d-l" error={shown.life}><TextInput id="d-l" type="number" min={1} max={600} value={rule.usefulLifeMonths || ""} invalid={!!shown.life} onChange={(e) => upDep({ usefulLifeMonths: Math.round(+e.target.value) || 0 })} /></Field>
                    <Field label="Salvage value" htmlFor="d-s" hint={a.cost > 0 ? `≈ ${money((a.cost * rule.salvagePct) / 100)}` : undefined}>
                      <div className="relative"><TextInput id="d-s" type="number" min={0} max={90} className="pr-7" value={rule.salvagePct} onChange={(e) => upDep({ salvagePct: Math.min(90, Math.max(0, +e.target.value || 0)) })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>
                    </Field>
                    <Field label="Depreciation start" htmlFor="d-st" hint={!a.depStart ? "Defaults to placed in service." : undefined}><TextInput id="d-st" type="date" value={a.depStart ?? ""} onChange={(e) => up({ depStart: e.target.value || undefined })} /></Field>
                    <Field label="Placed in service" htmlFor="d-i" hint={!a.inServiceDate ? "Defaults to the purchase date." : undefined}><TextInput id="d-i" type="date" value={a.inServiceDate ?? ""} onChange={(e) => up({ inServiceDate: e.target.value || undefined })} /></Field>
                    <Field label="Depreciation GL" htmlFor="d-gl"><Select id="d-gl" value={a.depGl ?? ""} onChange={(e) => up({ depGl: e.target.value || undefined })}><option value="">Select depreciation GL</option>{DEP_GL.map((x) => <option key={x}>{x}</option>)}</Select></Field>
                  </div>
                  {schedule.length > 0 ? (
                    <div className="mt-4 rounded-lg bg-subtle/60 p-3">
                      <div className="flex h-16 items-end gap-1">
                        {schedule.slice(0, 12).map((r) => (
                          <div key={r.year} className="group flex flex-1 flex-col items-center gap-1" title={`Year ${r.year}: ${money(r.book)} (−${money(r.expense)})`}>
                            <div className="w-full rounded-sm bg-primary/60 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(3, (r.book / a.cost) * 48)}px` }} />
                            <span className="num text-[10px] text-muted-foreground">Y{r.year}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[12px] text-muted-foreground">Book value falls from <span className="num text-foreground">{money(a.cost)}</span> to <span className="num text-foreground">{money(schedule.at(-1)!.book)}</span> over {Math.ceil(rule.usefulLifeMonths / 12)} years.</p>
                    </div>
                  ) : <p className="mt-3 text-[12px] text-muted-foreground">{belowThreshold ? "Below the capitalisation limit, so no schedule." : "Enter a purchase price to preview the schedule."}</p>}
                </div>
              )}
          </Card>

          {/* Warranty */}
          <Card id="warranty" title="Warranty">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider" htmlFor="w-p"><TextInput id="w-p" value={a.warrantyProvider} onChange={(e) => up({ warrantyProvider: e.target.value })} /></Field>
              <div><p className="pd-label">Coverage</p><Seg label="Coverage" value={a.warrantyCoverage} options={(Object.keys(COVERAGE_LABEL) as WarrantyCoverage[]).map((k) => ({ id: k, label: COVERAGE_LABEL[k] }))} onChange={(v) => up({ warrantyCoverage: v })} /></div>
              <Field label="Start" htmlFor="w-s" hint={!a.warrantyStart && a.purchaseDate ? "Defaults to the purchase date." : undefined}><TextInput id="w-s" type="date" value={a.warrantyStart ?? ""} onChange={(e) => up({ warrantyStart: e.target.value || undefined })} /></Field>
              <Field label="End" htmlFor="w-e" error={shown.warrantyEnd}>
                <TextInput id="w-e" type="date" min={a.warrantyStart} value={a.warrantyEnd ?? ""} invalid={!!shown.warrantyEnd} onChange={(e) => up({ warrantyEnd: e.target.value || undefined })} />
                {!shown.warrantyEnd && <div className="mt-1.5 flex gap-1">{[1, 2, 3, 5].map((y) => <button key={y} type="button" onClick={() => up({ warrantyEnd: addMonths(a.warrantyStart || a.purchaseDate || today(), y * 12) })} className="pd-chip h-6 px-2 text-[11px]">+{y} yr</button>)}</div>}
              </Field>
              <Field label="Terms & notes" htmlFor="w-t" className="sm:col-span-2"><TextArea id="w-t" rows={2} value={a.warrantyTerms ?? ""} onChange={(e) => up({ warrantyTerms: e.target.value })} /></Field>
            </div>
            {a.warrantyEnd && warrantyAlert?.enabled && <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground"><Info className="size-3.5" />A renewal reminder goes out {warrantyAlert.leadDays} days before {fmtDate(a.warrantyEnd)}.</p>}
          </Card>

          {/* Maintenance */}
          <Card id="maintenance" title="Maintenance Program" desc="Plan service for this asset. Leave it blank if none is needed yet.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Maintenance name" htmlFor="m-n"><TextInput id="m-n" value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} placeholder="Oil change" /></Field>
              <Field label="Maintenance type" htmlFor="m-t"><Select id="m-t" value={plan.type} onChange={(e) => setPlan((p) => ({ ...p, type: e.target.value as MaintenancePlan["type"] }))}>{Object.entries(MAINT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Description / instructions" htmlFor="m-d" className="sm:col-span-2"><TextArea id="m-d" rows={2} value={plan.instructions} onChange={(e) => setPlan((p) => ({ ...p, instructions: e.target.value }))} placeholder="Change oil and filter" /></Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Field label="Due date" htmlFor="m-due"><TextInput id="m-due" type="date" min={today()} value={plan.due ?? ""} onChange={(e) => setPlan((p) => ({ ...p, due: e.target.value || undefined }))} /></Field>
              <Field label="Assigned to" htmlFor="m-a"><Select id="m-a" value={plan.assigneeId ?? ""} onChange={(e) => setPlan((p) => ({ ...p, assigneeId: e.target.value || undefined }))}><option value="">Unassigned</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Vendor" htmlFor="m-v"><Select id="m-v" value={plan.vendorId ?? ""} onChange={(e) => setPlan((p) => ({ ...p, vendorId: e.target.value || undefined }))}><option value="">No vendor</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
              <Field label="Estimated cost" htmlFor="m-c"><Money id="m-c" value={plan.cost} onChange={(v) => setPlan((p) => ({ ...p, cost: v }))} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px]"><Switch checked={plan.repeats} onCheckedChange={(v) => { setPlan((p) => ({ ...p, repeats: v })); if (v && !a.maintenanceEveryMonths) up({ maintenanceEveryMonths: cat?.maintenanceEveryMonths ?? 12 }); }} />This service repeats on a schedule</label>
              {plan.repeats && <span className="flex items-center gap-2 text-[13px] animate-in fade-in">every <TextInput aria-label="Repeat every (months)" type="number" min={1} max={120} className="w-20" value={a.maintenanceEveryMonths ?? ""} onChange={(e) => up({ maintenanceEveryMonths: Math.max(1, Math.round(+e.target.value) || 1) })} /> months</span>}
            </div>
            {planUsed && (
              <p className="mt-3 rounded-md bg-primary/5 px-3 py-2 text-[12px] text-primary animate-in fade-in">
                {!plan.due ? "Add a due date so the service shows up in schedules." : plan.repeats ? `Saved with the asset; first due ${fmtDate(plan.due)}, then every ${a.maintenanceEveryMonths ?? 12} months.` : `Saved with the asset as a single work order due on ${fmtDate(plan.due)}.`}
              </p>
            )}
          </Card>

          {/* Condition & lifecycle */}
          <Card id="condition" title="Condition & Lifecycle">
            <p className="pd-label">Condition</p>
            <Seg label="Condition" value={a.condition} options={(["new", "good", "fair", "poor"] as Condition[]).map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1) }))} onChange={(v) => up({ condition: v })} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Expected retirement" htmlFor="c-r">
                <TextInput id="c-r" type="date" value={a.retirementDate ?? ""} onChange={(e) => up({ retirementDate: e.target.value || undefined })} />
                {!a.retirementDate && suggestedRetire && depOn && <button type="button" onClick={() => up({ retirementDate: suggestedRetire })} className="mt-1.5 text-[12px] text-primary hover:underline">Use end of useful life · {fmtDate(suggestedRetire)}</button>}
              </Field>
              <Field label="Insurance policy #" htmlFor="c-i"><TextInput id="c-i" value={a.insurancePolicy ?? ""} onChange={(e) => up({ insurancePolicy: e.target.value })} /></Field>
              <Field label="Compliance / regulatory" htmlFor="c-c" className="sm:col-span-2"><TextArea id="c-c" rows={2} value={a.compliance ?? ""} onChange={(e) => up({ compliance: e.target.value })} /></Field>
              <Field label="Notes" htmlFor="c-n" className="sm:col-span-2"><TextArea id="c-n" rows={2} value={a.description} onChange={(e) => up({ description: e.target.value })} /></Field>
            </div>
          </Card>

          {/* Additional details */}
          {fields.length > 0 && (
            <Card id="additional" title="Additional Details" desc="Fields your company added under Assets settings.">
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <Field key={f.id} label={f.label} htmlFor={`cf-${f.id}`} required={f.required} error={shown[`cf_${f.id}`]}>
                    {f.type === "select"
                      ? <Select id={`cf-${f.id}`} value={a.custom[f.id] ?? ""} invalid={!!shown[`cf_${f.id}`]} onChange={(e) => up({ custom: { ...a.custom, [f.id]: e.target.value } })}><option value="">Select</option>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>
                      : <TextInput id={`cf-${f.id}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={0} value={a.custom[f.id] ?? ""} invalid={!!shown[`cf_${f.id}`]} onChange={(e) => up({ custom: { ...a.custom, [f.id]: e.target.value } })} />}
                  </Field>
                ))}
              </div>
            </Card>
          )}

          {/* Documentation */}
          <Card id="files" title="Photos & Documentation" desc="Up to 10 MB each. Photos show in the gallery; documents attach as PDF or Office files.">
            <p className="pd-label">Asset photo</p>
            {a.photos.length > 0 && (
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {a.photos.map((p, i) => (
                  <div key={p.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-border animate-in fade-in zoom-in-95">
                    <img src={p.url} alt={p.name} className="size-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-foreground/70 px-1.5 text-[10px] text-background">Cover</span>}
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => up({ photos: a.photos.filter((x) => x.id !== p.id) })} className="absolute right-1.5 top-1.5 rounded bg-surface/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            {a.photos.length < 4 && <Drop icon={<ImagePlus className="size-5" />} title="Drop photo here" sub="or click to browse — JPG / PNG / GIF, max 10MB" accept="image/jpeg,image/png,image/gif" onFiles={(f) => void addPhotos(f)} />}

            <p className="pd-label mt-4">Documents</p>
            {a.docs.length > 0 && (
              <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
                {a.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2 animate-in fade-in">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{d.name}</span><span className="text-[11px] text-muted-foreground">{kb(d.size)}</span></span>
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => up({ docs: a.docs.filter((x) => x.id !== d.id) })} className="rounded p-1 text-muted-foreground hover:bg-subtle hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <Drop icon={<FileText className="size-5" />} title="Drop files here" sub="or click to browse — PDF / DOC / DOCX / PNG / JPG, max 10MB" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onFiles={addDocs} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Reveal({ children }: { children: ReactNode }) {
  return <div className="mt-4 rounded-lg border border-border bg-subtle/40 p-3 animate-in fade-in slide-in-from-top-1">{children}</div>;
}
function Note({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 rounded-md bg-subtle px-3 py-2 text-[13px] text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{children}</p>;
}
function Money({ id, value, onChange, invalid }: { id: string; value: number; onChange: (v: number) => void; invalid?: boolean }) {
  return (
    <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <TextInput id={id} inputMode="decimal" className="num pl-6" value={value ? String(value) : ""} invalid={invalid} placeholder="0.00" onChange={(e) => onChange(num(e.target.value))} /></div>
  );
}
function Drop({ icon, title, sub, accept, onFiles }: { icon: ReactNode; title: string; sub: string; accept: string; onFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); };
  return (
    <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      className={cn("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50", over ? "border-primary bg-primary/5" : "border-border")}>
      <span className={cn("text-muted-foreground", over && "text-primary")}>{icon}</span>
      <span className="text-[13px] font-medium text-primary">{title}</span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
      <input type="file" accept={accept} multiple className="sr-only" onChange={(e) => { if (e.target.files) onFiles([...e.target.files]); e.target.value = ""; }} />
    </label>
  );
}
