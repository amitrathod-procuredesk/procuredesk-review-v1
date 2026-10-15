import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Building2, Check, ChevronRight, FileText, Hash, ImagePlus, MapPin, Paperclip, Receipt, ShieldCheck, Tag, TrendingDown, Trash2, User as UserIcon, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { BTN, BTN_GHOST, BTN_PRIMARY, CAT_ICON, Card, Field, HolderPick, HolderToggle, StatusPill, fmtDate } from "@/components/pd/assetUi";
import { Select, TextArea, TextInput } from "@/components/pd/form";
import { IDENTIFIER_LABEL, METHOD_LABEL, depreciationSchedule, previewAssetId, type DepMethod } from "@/lib/pd/assets";
import { activationIssues, addDays, addMonths, blankAsset, CONDITION_LABEL, depRuleFor, DOC_KIND, registerAsset, SITES, today, type Asset, type AssetDoc, type Condition } from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/assets/register/new")({
  head: () => ({
    meta: [
      { title: "Register an asset · ProcureDesk" },
      { name: "description", content: "Add a new laptop, vehicle, machine or other asset with its ID, location, value, warranty and service plan." },
      { property: "og:title", content: "Register an asset · ProcureDesk" },
      { property: "og:description", content: "Capture everything about a new company asset in one guided form." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAssetPage,
});

const SECTIONS = [
  { id: "identification", label: "Identification", icon: Tag },
  { id: "assignment", label: "Status & location", icon: MapPin },
  { id: "financial", label: "Purchase", icon: Receipt },
  { id: "depreciation", label: "Depreciation", icon: TrendingDown },
  { id: "warranty", label: "Warranty & service", icon: ShieldCheck },
  { id: "files", label: "Photos & documents", icon: Paperclip },
] as const;
const FIELD_SECTION: Record<string, string> = { name: "identification", categoryId: "identification", identifier: "identification", site: "assignment", assignedTo: "assignment", checkoutTo: "assignment", checkoutDue: "assignment", cost: "financial", warrantyEnd: "warranty" };

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

function NewAssetPage() {
  const db = useDB();
  const me = useMe();
  const s = db.assets!;
  const navigate = useNavigate();
  const [a, setA] = useState<Asset>(() => { const b = blankAsset(s); if (b.statusId === "draft") b.statusId = "available"; return b; });
  const pristine = useRef(JSON.stringify(a));
  const [tried, setTried] = useState(false);
  const [active, setActive] = useState<string>("identification");
  const [customDep, setCustomDep] = useState(false);
  const [holderKind, setHolderKind] = useState<"user" | "site">("user");
  const [drag, setDrag] = useState(false);
  const up = (p: Partial<Asset>) => setA((x) => ({ ...x, ...p }));

  const cat = s.categories.find((c) => c.id === a.categoryId);
  const nextId = previewAssetId(s, cat);
  const fields = s.fields.filter((f) => !f.categoryIds.length || f.categoryIds.includes(a.categoryId));
  const rule = depRuleFor({ ...a, depOverride: customDep ? a.depOverride : undefined }, s);
  const belowThreshold = a.cost > 0 && a.cost < s.depreciation.capitalizationThreshold;
  const issues = activationIssues(a, s);
  const draftIssues = Object.fromEntries(Object.entries(issues).filter(([k]) => k === "name" || k === "categoryId"));
  const shown = tried ? issues : {};
  const dirty = JSON.stringify(a) !== pristine.current;
  const startOptions = s.statuses.filter((x) => x.enabled && x.id !== "draft" && (x.phase === "setup" || x.phase === "active") && (x.id !== "checked_out" || cat?.checkoutAllowed));
  const status = s.statuses.find((x) => x.id === a.statusId);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useEffect(() => {
    const els = SECTIONS.map((x) => document.getElementById(x.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((p, q) => p.boundingClientRect.top - q.boundingClientRect.top)[0]; if (v) setActive(v.target.id); }, { rootMargin: "-80px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const pickCategory = (id: string) => {
    const c = s.categories.find((x) => x.id === id);
    setA((x) => ({ ...x, categoryId: id, maintenanceEveryMonths: c?.maintenanceEveryMonths, statusId: x.statusId === "checked_out" && !c?.checkoutAllowed ? "available" : x.statusId }));
  };
  const pickStatus = (id: string) => {
    setA((x) => ({
      ...x, statusId: id,
      checkout: id === "checked_out" ? x.checkout ?? { to: { kind: "user" }, at: new Date().toISOString(), due: addDays(today(), s.checkout.defaultDays), condition: x.condition } : undefined,
      assignedTo: id === "in_use" ? x.assignedTo : undefined,
    }));
  };

  const addPhotos = async (files: FileList | File[]) => {
    const imgs = [...files].filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) { toast.error("Only images can be added as photos", { description: "Add PDFs and other files under Documents." }); return; }
    const room = 4 - a.photos.length;
    if (room <= 0) { toast.error("You can add up to 4 photos"); return; }
    try {
      const out = await Promise.all(imgs.slice(0, room).map(async (f) => ({ id: crypto.randomUUID(), name: f.name, url: await compress(f) })));
      setA((x) => ({ ...x, photos: [...x.photos, ...out] }));
      if (imgs.length > room) toast(`Added ${room} of ${imgs.length} photos`, { description: "Up to 4 photos per asset." });
    } catch { toast.error("That photo couldn't be read", { description: "Try a JPG or PNG." }); }
  };
  const addDocs = (files: FileList) => {
    const docs: AssetDoc[] = [...files].map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, at: new Date().toISOString(), kind: /invoice|receipt/i.test(f.name) ? "invoice" : /warrant/i.test(f.name) ? "warranty" : /manual|guide/i.test(f.name) ? "manual" : /insur/i.test(f.name) ? "insurance" : "other" }));
    setA((x) => ({ ...x, docs: [...x.docs, ...docs] }));
  };

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const save = (asDraft: boolean) => {
    const errs = asDraft ? draftIssues : issues;
    if (Object.keys(errs).length) {
      setTried(true);
      const first = Object.keys(errs)[0];
      go(FIELD_SECTION[first] ?? (first.startsWith("cf_") ? "identification" : "identification"));
      return;
    }
    const rec: Asset = structuredClone({ ...a, statusId: asDraft ? "draft" : a.statusId, depOverride: customDep ? a.depOverride : undefined, checkout: asDraft ? undefined : a.checkout, assignedTo: asDraft ? undefined : a.assignedTo });
    let tag = "";
    mutate((d) => { tag = registerAsset(d, rec, me?.id); });
    pristine.current = JSON.stringify(a);
    toast.success(asDraft ? `Draft ${tag} saved` : `${tag} registered`, { description: asDraft ? "Finish the details whenever you're ready." : `${rec.name} is now ${s.statuses.find((x) => x.id === rec.statusId)?.name.toLowerCase()}.` });
    navigate({ to: "/app/assets/$assetId", params: { assetId: rec.id } });
  };

  const sectionErr = (id: string) => Object.keys(shown).some((k) => (FIELD_SECTION[k] ?? "identification") === id);
  const people = db.users.filter((u) => u.active);
  const schedule = depreciationSchedule(a.cost || 0, rule, s.depreciation.ddbFactor);
  const checklist = [
    { ok: !!a.name.trim() && !!cat, label: "Name and category" },
    { ok: !issues.identifier, label: cat?.identifier === "none" ? "No identifier needed" : IDENTIFIER_LABEL[cat?.identifier ?? "serial"] },
    { ok: !issues.site && !issues.assignedTo && !issues.checkoutTo && !issues.checkoutDue, label: "Location & assignment" },
    { ok: a.cost > 0, label: "Purchase cost" },
    { ok: !Object.keys(issues).some((k) => k.startsWith("cf_")), label: "Required custom fields" },
  ];

  return (
    <div className="mx-auto max-w-7xl p-4 pb-28 md:p-8 md:pb-28">
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Assets</span><ChevronRight className="size-3" /><Link to="/app/assets/register" className="hover:text-foreground">Register</Link><ChevronRight className="size-3" /><span className="text-foreground">New asset</span>
      </nav>
      <div className="mb-6">
        <h1 className="pd-h1">Register an asset</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Only the basics are required. Everything else can be added later from the asset's page.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_280px]">
        <nav aria-label="Form sections" className="pd-scroll-hide -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-[84px] lg:mx-0 lg:block lg:space-y-0.5 lg:self-start lg:px-0">
          {SECTIONS.map((x) => (
            <button key={x.id} onClick={() => go(x.id)} aria-current={active === x.id ? "true" : undefined}
              className={cn("flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-subtle lg:w-full", active === x.id ? "bg-subtle font-medium text-primary" : "text-foreground")}>
              <x.icon className="size-4 shrink-0" /><span className="flex-1 truncate">{x.label}</span>
              {sectionErr(x.id) && <span className="size-1.5 rounded-full bg-destructive" title="Needs attention" />}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {/* Identification */}
          <Card id="identification" title="Identification" desc="What the asset is and how people will find it.">
            <p className="pd-label">Category <span className="text-destructive">*</span></p>
            <div role="radiogroup" aria-label="Category" className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
              {s.categories.filter((c) => c.active).map((c) => {
                const Icon = CAT_ICON[c.id] ?? Tag;
                const on = c.id === a.categoryId;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => pickCategory(c.id)}
                    className={cn("flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-[border-color,box-shadow]", on ? "border-primary bg-primary/5 ring-[3px] ring-primary/10" : "border-border hover:border-foreground/20")}>
                    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md", on ? "bg-primary/10 text-primary" : "bg-subtle text-muted-foreground")}><Icon className="size-4" /></span>
                    <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{c.name}</span><span className="num block text-[11px] text-muted-foreground">{c.code}</span></span>
                  </button>
                );
              })}
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground"><Hash className="size-3.5" />Asset ID</span>
              <span className="flex items-center gap-2"><span className="num text-[15px] font-semibold" aria-live="polite">{nextId}</span><span className="text-[11px] text-muted-foreground">assigned when you save</span></span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Asset name" htmlFor="a-name" required error={shown.name} hint="What people call it, e.g. “Delivery van 3” or “MacBook Pro — Design”." className="sm:col-span-2">
                <TextInput id="a-name" autoFocus value={a.name} invalid={!!shown.name} maxLength={120} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Ford Transit cargo van" />
              </Field>
              <Field label="Make / manufacturer" htmlFor="a-make"><TextInput id="a-make" value={a.make} onChange={(e) => up({ make: e.target.value })} placeholder="e.g. Ford" /></Field>
              <Field label="Model" htmlFor="a-model"><TextInput id="a-model" value={a.model} onChange={(e) => up({ model: e.target.value })} placeholder="e.g. Transit 350 HD" /></Field>
              {cat && cat.identifier !== "none" && (
                <Field label={IDENTIFIER_LABEL[cat.identifier]} htmlFor="a-ident" required error={shown.identifier} hint={cat.identifier === "vin" ? "17 characters, found on the dashboard or door frame." : "Printed on the label or in the device settings."}>
                  <TextInput id="a-ident" className="num" value={a.identifier} invalid={!!shown.identifier} onChange={(e) => up({ identifier: e.target.value.toUpperCase() })} maxLength={cat.identifier === "vin" ? 17 : 64} />
                </Field>
              )}
              <Field label="Condition" htmlFor="a-cond">
                <Select id="a-cond" value={a.condition} onChange={(e) => up({ condition: e.target.value as Condition })}>
                  {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              {fields.map((f) => (
                <Field key={f.id} label={f.label} htmlFor={`cf-${f.id}`} required={f.required} error={shown[`cf_${f.id}`]}>
                  {f.type === "select"
                    ? <Select id={`cf-${f.id}`} value={a.custom[f.id] ?? ""} invalid={!!shown[`cf_${f.id}`]} onChange={(e) => up({ custom: { ...a.custom, [f.id]: e.target.value } })}><option value="">Select…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</Select>
                    : <TextInput id={`cf-${f.id}`} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={0} value={a.custom[f.id] ?? ""} invalid={!!shown[`cf_${f.id}`]} onChange={(e) => up({ custom: { ...a.custom, [f.id]: e.target.value } })} />}
                </Field>
              ))}
              <Field label="Notes" htmlFor="a-desc" className="sm:col-span-2"><TextArea id="a-desc" rows={2} value={a.description} onChange={(e) => up({ description: e.target.value })} placeholder="Accessories, configuration, anything worth knowing" /></Field>
            </div>
          </Card>

          {/* Status & location */}
          <Card id="assignment" title="Status & location" desc="Where it lives and whether it's ready to use.">
            <p className="pd-label">Starting status <span className="font-normal">· not ready yet? Use Save as draft</span></p>
            <div role="radiogroup" aria-label="Starting status" className="mb-4 grid gap-2 sm:grid-cols-2">
              {startOptions.map((x) => {
                const on = x.id === a.statusId;
                return (
                  <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => pickStatus(x.id)}
                    className={cn("rounded-lg border p-3 text-left transition-[border-color,box-shadow]", on ? "border-primary bg-primary/5 ring-[3px] ring-primary/10" : "border-border hover:border-foreground/20")}>
                    <span className="flex items-center justify-between gap-2"><StatusPill s={x} />{on && <Check className="size-4 text-primary" />}</span>
                    <span className="mt-1.5 block text-[12px] text-muted-foreground">{x.description}</span>
                  </button>
                );
              })}
            </div>
            {cat && !cat.checkoutAllowed && <p className="-mt-2 mb-4 text-[12px] text-muted-foreground">{cat.name} can't be checked out — change this in Asset settings → Categories.</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" htmlFor="a-site" required error={shown.site}>
                <Select id="a-site" value={a.site} onChange={(e) => up({ site: e.target.value })}>{SITES.map((x) => <option key={x}>{x}</option>)}</Select>
              </Field>
              <Field label="Room, bay or desk" htmlFor="a-room"><TextInput id="a-room" value={a.room} onChange={(e) => up({ room: e.target.value })} placeholder="e.g. Floor 3 · Bay 2" /></Field>
              <Field label="Department" htmlFor="a-dept" hint="Owning cost centre for reports.">
                <Select id="a-dept" value={a.departmentId ?? ""} onChange={(e) => up({ departmentId: e.target.value || undefined })}><option value="">No department</option>{db.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
              </Field>
            </div>

            {a.statusId === "in_use" && (
              <div className="mt-4 rounded-lg border border-border p-3 animate-in fade-in slide-in-from-top-1">
                <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[13px] font-medium">Assigned to</p><HolderToggle v={holderKind} set={(k) => { setHolderKind(k); up({ assignedTo: undefined }); }} /></div>
                <HolderPick kind={holderKind} value={a.assignedTo} people={people} error={shown.assignedTo} onChange={(h) => up({ assignedTo: h })} />
              </div>
            )}
            {a.statusId === "checked_out" && a.checkout && (
              <div className="mt-4 grid gap-4 rounded-lg border border-border p-3 animate-in fade-in slide-in-from-top-1 sm:grid-cols-2">
                <div className="sm:col-span-2 flex items-center justify-between gap-2"><p className="text-[13px] font-medium">Checked out to</p><HolderToggle v={a.checkout.to.kind} set={(k) => up({ checkout: { ...a.checkout!, to: { kind: k } } })} /></div>
                <div className="sm:col-span-2"><HolderPick kind={a.checkout.to.kind} value={a.checkout.to} people={people} error={shown.checkoutTo} onChange={(h) => up({ checkout: { ...a.checkout!, to: h ?? { kind: a.checkout!.to.kind } } })} /></div>
                <Field label="Due back" htmlFor="a-due" required error={shown.checkoutDue} hint={`Default loan is ${s.checkout.defaultDays} days, up to ${s.checkout.maxDays}.`}>
                  <TextInput id="a-due" type="date" min={today()} max={addDays(today(), s.checkout.maxDays)} value={a.checkout.due} invalid={!!shown.checkoutDue} onChange={(e) => up({ checkout: { ...a.checkout!, due: e.target.value } })} />
                </Field>
                <Field label="Condition when handed over" htmlFor="a-cocond">
                  <Select id="a-cocond" value={a.checkout.condition} onChange={(e) => up({ checkout: { ...a.checkout!, condition: e.target.value as Condition } })}>{Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                </Field>
              </div>
            )}
          </Card>

          {/* Financial */}
          <Card id="financial" title="Purchase" desc="Cost and paperwork, used for book value and audits.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Purchase cost" htmlFor="a-cost" required error={shown.cost} hint={belowThreshold ? `Below the ${money(s.depreciation.capitalizationThreshold)} capitalisation limit — it'll be tracked but expensed, not depreciated.` : undefined}>
                <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <TextInput id="a-cost" inputMode="decimal" className="num pl-6" value={a.cost ? String(a.cost) : ""} invalid={!!shown.cost} placeholder="0.00" onChange={(e) => up({ cost: Math.max(0, parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0) })} /></div>
              </Field>
              <Field label="Purchase date" htmlFor="a-pdate"><TextInput id="a-pdate" type="date" max={today()} value={a.purchaseDate ?? ""} onChange={(e) => up({ purchaseDate: e.target.value || undefined })} /></Field>
              <Field label="Supplier" htmlFor="a-vendor">
                <Select id="a-vendor" value={a.vendorId ?? ""} onChange={(e) => up({ vendorId: e.target.value || undefined })}><option value="">Not specified</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
              </Field>
              <Field label="Purchase order" htmlFor="a-po"><TextInput id="a-po" value={a.poNumber} onChange={(e) => up({ poNumber: e.target.value })} placeholder="e.g. PO-40211" /></Field>
              <Field label="Invoice number" htmlFor="a-inv"><TextInput id="a-inv" value={a.invoiceNo} onChange={(e) => up({ invoiceNo: e.target.value })} /></Field>
            </div>
          </Card>

          {/* Depreciation */}
          <Card id="depreciation" title="Depreciation" desc={`Follows the ${cat?.depreciation ? `${cat.name} category` : "company default"} rule unless you set one here.`}
            action={<label className="flex shrink-0 items-center gap-2 text-[13px]"><Switch checked={customDep} onCheckedChange={(v) => { setCustomDep(v); if (v) up({ depOverride: { ...rule } }); }} />Custom rule</label>}>
            {!s.depreciation.enabled ? <p className="text-[13px] text-muted-foreground">Depreciation is switched off in Asset settings.</p> : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Method" htmlFor="d-m"><Select id="d-m" disabled={!customDep} value={rule.method} onChange={(e) => up({ depOverride: { ...rule, method: e.target.value as DepMethod } })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Field label="Useful life (months)" htmlFor="d-l"><TextInput id="d-l" type="number" min={1} max={600} disabled={!customDep} value={rule.usefulLifeMonths} onChange={(e) => up({ depOverride: { ...rule, usefulLifeMonths: Math.max(1, +e.target.value || 1) } })} /></Field>
                  <Field label="Salvage value (%)" htmlFor="d-s"><TextInput id="d-s" type="number" min={0} max={90} disabled={!customDep} value={rule.salvagePct} onChange={(e) => up({ depOverride: { ...rule, salvagePct: Math.min(90, Math.max(0, +e.target.value || 0)) } })} /></Field>
                  <Field label="In service from" htmlFor="d-i" hint="Depreciation starts here. Defaults to the purchase date."><TextInput id="d-i" type="date" value={a.inServiceDate ?? ""} onChange={(e) => up({ inServiceDate: e.target.value || undefined })} /></Field>
                </div>
                {a.cost > 0 && !belowThreshold && schedule.length > 0 && (
                  <div className="mt-4">
                    <p className="pd-section-title mb-2">Book value by year</p>
                    <div className="flex h-24 items-end gap-1.5">
                      {schedule.slice(0, 10).map((r) => (
                        <div key={r.year} className="group flex flex-1 flex-col items-center gap-1" title={`Year ${r.year}: ${money(r.book)} (−${money(r.expense)})`}>
                          <div className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(3, (r.book / a.cost) * 72)}px` }} />
                          <span className="num text-[10px] text-muted-foreground">Y{r.year}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">Ends at <span className="num text-foreground">{money(schedule.at(-1)!.book)}</span> after {Math.ceil(rule.usefulLifeMonths / 12)} years.</p>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Warranty & service */}
          <Card id="warranty" title="Warranty & service" desc="We'll remind the right people before anything expires or falls due.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Warranty provider" htmlFor="w-p"><TextInput id="w-p" value={a.warrantyProvider} onChange={(e) => up({ warrantyProvider: e.target.value })} placeholder="e.g. AppleCare+, manufacturer" /></Field>
              <Field label="Warranty ends" htmlFor="w-e" error={shown.warrantyEnd}>
                <TextInput id="w-e" type="date" value={a.warrantyEnd ?? ""} invalid={!!shown.warrantyEnd} onChange={(e) => up({ warrantyEnd: e.target.value || undefined })} />
                <div className="mt-1.5 flex gap-1">{[1, 2, 3, 5].map((y) => <button key={y} type="button" onClick={() => up({ warrantyEnd: addMonths(a.purchaseDate || today(), y * 12) })} className="pd-chip h-6 px-2 text-[11px]">{y} yr</button>)}</div>
              </Field>
              {(a.categoryId === "cat-veh" || a.categoryId === "cat-mch") && (
                <Field label="Insurance ends" htmlFor="w-i"><TextInput id="w-i" type="date" value={a.insuranceEnd ?? ""} onChange={(e) => up({ insuranceEnd: e.target.value || undefined })} /></Field>
              )}
              <Field label="Service every (months)" htmlFor="m-e" hint={cat?.maintenanceEveryMonths ? `${cat.name} default: every ${cat.maintenanceEveryMonths} months.` : "Leave empty if it doesn't need regular service."}>
                <TextInput id="m-e" type="number" min={1} max={120} value={a.maintenanceEveryMonths ?? ""} onChange={(e) => up({ maintenanceEveryMonths: +e.target.value || undefined, nextMaintenance: undefined })} />
              </Field>
              {!!a.maintenanceEveryMonths && (
                <Field label="First service due" htmlFor="m-n" hint={!a.nextMaintenance ? `Suggested: ${fmtDate(addMonths(a.inServiceDate || a.purchaseDate || today(), a.maintenanceEveryMonths))}` : undefined}>
                  <TextInput id="m-n" type="date" value={a.nextMaintenance ?? addMonths(a.inServiceDate || a.purchaseDate || today(), a.maintenanceEveryMonths)} onChange={(e) => up({ nextMaintenance: e.target.value || undefined })} />
                </Field>
              )}
            </div>
          </Card>

          {/* Files */}
          <Card id="files" title="Photos & documents" desc="Photos help with audits and damage claims. Attach invoices, manuals and certificates.">
            <p className="pd-label">Photos <span className="font-normal">({a.photos.length}/4)</span></p>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {a.photos.map((p, i) => (
                <div key={p.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-border">
                  <img src={p.url} alt={p.name} className="size-full object-cover" />
                  {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-foreground/70 px-1.5 text-[10px] text-background">Cover</span>}
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => up({ photos: a.photos.filter((x) => x.id !== p.id) })} className="absolute right-1.5 top-1.5 rounded bg-surface/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              {a.photos.length < 4 && (
                <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void addPhotos(e.dataTransfer.files); }}
                  className={cn("flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary", drag ? "border-primary bg-primary/5 text-primary" : "border-border")}>
                  <ImagePlus className="size-5" />Add photo<span className="text-[11px]">or drop here</span>
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { if (e.target.files) void addPhotos(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
            <div className="flex items-center justify-between"><p className="pd-label mb-0">Documents</p>
              <label className={cn(BTN, "h-7 cursor-pointer text-[12px]")}><Paperclip className="size-3.5" />Attach files<input type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) addDocs(e.target.files); e.target.value = ""; }} /></label>
            </div>
            {a.docs.length ? (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {a.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{d.name}</span><span className="text-[11px] text-muted-foreground">{kb(d.size)}</span></span>
                    <Select aria-label="Document type" value={d.kind} onChange={(e) => up({ docs: a.docs.map((x) => (x.id === d.id ? { ...x, kind: e.target.value as AssetDoc["kind"] } : x)) })} className="h-7 w-auto text-xs">{Object.entries(DOC_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => up({ docs: a.docs.filter((x) => x.id !== d.id) })} className="rounded p-1 text-muted-foreground hover:bg-subtle hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[12px] text-muted-foreground">No documents yet. File names are kept for reference in this demo.</p>}
          </Card>
        </div>

        {/* Summary */}
        <aside className="space-y-3 lg:sticky lg:top-[84px] lg:self-start">
          <div className="pd-panel p-4">
            <p className="pd-section-title">Summary</p>
            <p className="num mt-2 text-[15px] font-semibold">{nextId}</p>
            <p className="truncate text-[13px] text-muted-foreground">{a.name || "Untitled asset"}</p>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Status</dt><dd><StatusPill s={status} /></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Cost</dt><dd className="num">{a.cost ? money(a.cost) : "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="flex items-center gap-1 text-muted-foreground"><Building2 className="size-3" />Location</dt><dd className="truncate text-right">{a.site}</dd></div>
              {a.maintenanceEveryMonths ? <div className="flex justify-between gap-2"><dt className="flex items-center gap-1 text-muted-foreground"><Wrench className="size-3" />Service</dt><dd>Every {a.maintenanceEveryMonths} mo</dd></div> : null}
            </dl>
          </div>
          <div className="pd-panel p-4">
            <p className="pd-section-title mb-2">Ready to register</p>
            <ul className="space-y-1.5">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-[13px]">
                  <span className={cn("inline-flex size-4 items-center justify-center rounded-full", c.ok ? "bg-success-soft text-success" : "bg-subtle text-muted-foreground")}>{c.ok ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1 rounded-full bg-current" />}</span>
                  <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-30 flex justify-center px-4 md:bottom-6">
        <div role="region" aria-label="Save asset" className="flex w-full max-w-2xl items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-lg">
          <p className="hidden min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] sm:flex">
            {tried && Object.keys(issues).length ? <><AlertTriangle className="size-4 shrink-0 text-warning" /><span className="truncate">{Object.keys(issues).length} {Object.keys(issues).length === 1 ? "detail" : "details"} missing — fill {Object.keys(issues).length === 1 ? "it" : "them"} in or save as a draft</span></> : <><UserIcon className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-muted-foreground">Will be registered as <span className="num text-foreground">{nextId}</span></span></>}
          </p>
          <div className="ml-auto flex gap-2">
            <Link to="/app/assets/register" className={BTN_GHOST} onClick={(e) => { if (dirty && !confirm("Leave without saving? Your changes will be lost.")) e.preventDefault(); }}>Cancel</Link>
            <button onClick={() => save(true)} className={BTN}>Save as draft</button>
            <button onClick={() => save(false)} className={BTN_PRIMARY}>Register asset</button>
          </div>
        </div>
      </div>
    </div>
  );
}
