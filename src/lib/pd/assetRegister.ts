/** Asset register: records, lifecycle actions, repair cycle and derived values. Pure helpers + store actions. */
import { depreciationSchedule, formatAssetId, type AssetCategory, type AssetSettings, type DepRule } from "./assets";
import type { DB } from "./types";

export type Condition = "new" | "good" | "fair" | "poor" | "damaged";
export const CONDITION_LABEL: Record<Condition, string> = { new: "New", good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged" };

export type RepairStage = "reported" | "diagnosing" | "awaiting_parts" | "repairing" | "at_vendor" | "quality_check" | "completed";
export const REPAIR_STAGES: { id: RepairStage; label: string; hint: string }[] = [
  { id: "reported", label: "Reported", hint: "Issue logged; asset taken out of use." },
  { id: "diagnosing", label: "Diagnosing", hint: "Finding the cause and what's needed." },
  { id: "awaiting_parts", label: "Waiting for parts", hint: "Parts ordered; repair paused until they arrive." },
  { id: "repairing", label: "Repairing", hint: "Work in progress in-house." },
  { id: "at_vendor", label: "At vendor", hint: "Sent to the supplier or service centre." },
  { id: "quality_check", label: "Quality check", hint: "Testing before the asset goes back into service." },
  { id: "completed", label: "Completed", hint: "Repair closed; asset back in service." },
];
export const PRIORITY_LABEL = { low: "Low", normal: "Normal", high: "High", critical: "Critical" } as const;
export type Priority = keyof typeof PRIORITY_LABEL;

export interface Part { id: string; name: string; qty: number; cost: number; received: boolean }
export interface Repair {
  id: string;
  issue: string;
  priority: Priority;
  stage: RepairStage;
  openedAt: string;
  openedBy?: string;
  closedAt?: string;
  vendorId?: string;
  rmaNo?: string;
  eta?: string;
  parts: Part[];
  labourCost: number;
  resolution?: string;
  /** Status the asset had before the repair, used to suggest where it returns. */
  returnTo: string;
  stages: { stage: RepairStage; at: string; by?: string; note?: string }[];
}

export interface Holder { kind: "user" | "site"; userId?: string; site?: string }
export interface AssetEvent { id: string; at: string; by?: string; kind: "create" | "status" | "edit" | "checkout" | "checkin" | "repair" | "maintenance" | "doc"; text: string; note?: string }
export interface AssetDoc { id: string; name: string; size: number; kind: "invoice" | "warranty" | "manual" | "insurance" | "registration" | "other"; at: string }
export interface MaintenanceLog { id: string; at: string; by?: string; note: string; cost: number }

export interface Asset {
  id: string;
  tag: string;
  name: string;
  categoryId: string;
  statusId: string;
  identifier: string;
  make: string;
  model: string;
  description: string;
  condition: Condition;
  custom: Record<string, string>;
  site: string;
  room: string;
  departmentId?: string;
  assignedTo?: Holder;
  checkout?: { to: Holder; at: string; due: string; condition: Condition; note?: string };
  purchaseDate?: string;
  cost: number;
  vendorId?: string;
  poNumber: string;
  invoiceNo: string;
  inServiceDate?: string;
  /** undefined = follow category, then org default. */
  depOverride?: DepRule;
  warrantyEnd?: string;
  warrantyProvider: string;
  insuranceEnd?: string;
  maintenanceEveryMonths?: number;
  nextMaintenance?: string;
  maintenanceLog: MaintenanceLog[];
  photos: { id: string; name: string; url: string }[];
  docs: AssetDoc[];
  repair?: Repair;
  repairs: Repair[];
  disposal?: { at: string; method: string; proceeds: number; note?: string };
  history: AssetEvent[];
  createdAt: string;
  createdBy?: string;
}

export const SITES = ["US HQ · Agate, CO", "Austin office · TX", "Denver depot", "Job site · Riverside Plaza", "Job site · Harbor Bridge", "Remote employee"];
export const DOC_KIND = { invoice: "Invoice", warranty: "Warranty", manual: "Manual", insurance: "Insurance", registration: "Registration", other: "Other" } as const;
export const DISPOSAL_METHODS = ["Sold", "Recycled", "Donated", "Traded in", "Scrapped", "Lost or stolen"];

const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();
const DAY = 86400000;
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);
export const addMonths = (iso: string, n: number) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
export const daysUntil = (iso?: string, from = new Date()) => (iso ? Math.ceil((new Date(iso).getTime() - from.getTime()) / DAY) : Infinity);

export function holderName(h: Holder | undefined, db: Pick<DB, "users">) {
  if (!h) return "";
  return h.kind === "site" ? h.site ?? "" : db.users.find((u) => u.id === h.userId)?.name ?? "Unknown person";
}

/** Rule used for an asset: own override → category rule → org default. */
export function depRuleFor(a: Pick<Asset, "depOverride" | "categoryId">, s: AssetSettings): DepRule {
  const c = s.categories.find((x) => x.id === a.categoryId);
  return a.depOverride ?? c?.depreciation ?? { method: s.depreciation.method, usefulLifeMonths: s.depreciation.usefulLifeMonths, salvagePct: s.depreciation.salvagePct };
}

/** Current book value, interpolated monthly within the yearly schedule. Below the capitalisation threshold, assets are expensed and not depreciated. */
export function bookValue(a: Asset, s: AssetSettings, at = new Date()): number {
  if (!s.depreciation.enabled || a.cost < s.depreciation.capitalizationThreshold) return a.cost;
  const status = s.statuses.find((x) => x.id === a.statusId);
  if (a.statusId === "disposed") return 0;
  const start = a.inServiceDate || a.purchaseDate;
  if (!start || (status && a.statusId === "draft")) return a.cost;
  const rule = depRuleFor(a, s);
  const sched = depreciationSchedule(a.cost, rule, s.depreciation.ddbFactor);
  if (!sched.length) return a.cost;
  const months = Math.max(0, (at.getFullYear() - new Date(start).getFullYear()) * 12 + at.getMonth() - new Date(start).getMonth());
  const y = Math.floor(months / 12);
  if (y >= sched.length) return sched.at(-1)!.book;
  const prev = y === 0 ? a.cost : sched[y - 1].book;
  return +(prev - (sched[y].expense * (months % 12)) / 12).toFixed(2);
}

/** Can the asset move from its current status to `to` under the configured lifecycle? */
export function canMove(a: Pick<Asset, "statusId">, to: string, s: AssetSettings) {
  const cur = s.statuses.find((x) => x.id === a.statusId);
  const target = s.statuses.find((x) => x.id === to);
  return !!cur && !!target && target.enabled && cur.next.includes(to);
}

/** Missing details that block leaving Draft. */
export function activationIssues(a: Asset, s: AssetSettings): Record<string, string> {
  const e: Record<string, string> = {};
  const c = s.categories.find((x) => x.id === a.categoryId);
  if (!a.name.trim()) e.name = "Give the asset a name people will recognise.";
  if (!c) e.categoryId = "Choose a category.";
  if (c && c.identifier !== "none" && !a.identifier.trim()) e.identifier = "Required for this category.";
  if (!a.site) e.site = "Choose where the asset is kept.";
  if (!(a.cost > 0)) e.cost = "Enter the purchase cost.";
  s.fields.filter((f) => f.required && (!f.categoryIds.length || f.categoryIds.includes(a.categoryId))).forEach((f) => { if (!a.custom[f.id]?.trim()) e[`cf_${f.id}`] = `${f.label} is required.`; });
  if (a.statusId === "in_use" && !a.assignedTo) e.assignedTo = "Choose who or where it's assigned to.";
  if (a.statusId === "checked_out") {
    if (!a.checkout?.to.userId && !a.checkout?.to.site) e.checkoutTo = "Choose who is taking it.";
    if (!a.checkout?.due) e.checkoutDue = "Set a return date.";
    else if (daysUntil(a.checkout.due) > s.checkout.maxDays) e.checkoutDue = `Loans can't be longer than ${s.checkout.maxDays} days.`;
    else if (daysUntil(a.checkout.due) < 0) e.checkoutDue = "Return date must be in the future.";
  }
  if (a.warrantyEnd && a.purchaseDate && a.warrantyEnd < a.purchaseDate) e.warrantyEnd = "Warranty can't end before the purchase date.";
  return e;
}

export function blankAsset(s: AssetSettings, categoryId?: string): Asset {
  const c = s.categories.find((x) => x.id === categoryId) ?? s.categories.find((x) => x.active);
  return {
    id: rid("ast"), tag: "", name: "", categoryId: c?.id ?? "", statusId: s.defaultStatusId, identifier: "", make: "", model: "", description: "", condition: "new", custom: {},
    site: SITES[0], room: "", cost: 0, poNumber: "", invoiceNo: "", purchaseDate: today(), warrantyProvider: "", maintenanceEveryMonths: c?.maintenanceEveryMonths,
    maintenanceLog: [], photos: [], docs: [], repairs: [], history: [], createdAt: now(),
  };
}

export type Insight = "overdue" | "warranty" | "maintenance";
export function insights(a: Asset, s: AssetSettings, at = new Date()): Insight[] {
  if (a.statusId === "disposed" || a.statusId === "draft") return [];
  const out: Insight[] = [];
  if (a.checkout && daysUntil(a.checkout.due, at) < 0) out.push("overdue");
  const w = s.alerts.find((x) => x.event === "warranty_expiring");
  const wd = daysUntil(a.warrantyEnd, at);
  if (a.warrantyEnd && wd >= 0 && wd <= (w?.leadDays ?? 30)) out.push("warranty");
  const m = s.alerts.find((x) => x.event === "maintenance_due");
  if (a.nextMaintenance && daysUntil(a.nextMaintenance, at) <= (m?.leadDays ?? 7)) out.push("maintenance");
  return out;
}

export const repairCost = (r: Repair) => r.labourCost + r.parts.reduce((t, p) => t + p.qty * p.cost, 0);

/* ───────────── Store actions (operate on a DB draft inside mutate) ───────────── */
const ev = (a: Asset, by: string | undefined, kind: AssetEvent["kind"], text: string, note?: string) => a.history.unshift({ id: rid("ev"), at: now(), by, kind, text, note: note?.trim() || undefined });
const sname = (d: DB, id: string) => d.assets!.statuses.find((x) => x.id === id)?.name ?? id;

export function registerAsset(d: DB, a: Asset, by?: string) {
  const s = d.assets!;
  const c = s.categories.find((x) => x.id === a.categoryId) as AssetCategory | undefined;
  a.tag = formatAssetId(s.numbering, c);
  s.numbering.nextSeq += 1;
  a.createdAt = now();
  a.createdBy = by;
  if (a.statusId !== "draft" && !a.inServiceDate) a.inServiceDate = a.purchaseDate || today();
  if (a.maintenanceEveryMonths && !a.nextMaintenance) a.nextMaintenance = addMonths(a.inServiceDate || today(), a.maintenanceEveryMonths);
  if (c) c.assetCount += 1;
  ev(a, by, "create", a.statusId === "draft" ? "Saved as draft" : `Registered as ${sname(d, a.statusId)}`);
  if (a.checkout) ev(a, by, "checkout", `Checked out to ${holderName(a.checkout.to, d)} until ${a.checkout.due}`);
  if (a.assignedTo && a.statusId === "in_use") ev(a, by, "status", `Assigned to ${holderName(a.assignedTo, d)}`);
  d.assetItems = [a, ...(d.assetItems ?? [])];
  return a.tag;
}

const find = (d: DB, id: string) => d.assetItems?.find((x) => x.id === id);

export function setStatus(d: DB, id: string, to: string, by?: string, note?: string) {
  const a = find(d, id); if (!a) return;
  const from = a.statusId;
  a.statusId = to;
  if (from === "draft" && !a.inServiceDate) a.inServiceDate = today();
  if (to !== "checked_out") a.checkout = undefined;
  if (to !== "in_use") a.assignedTo = undefined;
  ev(a, by, "status", `${sname(d, from)} → ${sname(d, to)}`, note);
}

export function assign(d: DB, id: string, to: Holder, by?: string, note?: string) {
  const a = find(d, id); if (!a) return;
  setStatus(d, id, "in_use", by, note);
  a.assignedTo = to;
  if (to.kind === "site" && to.site) a.site = to.site;
  ev(a, by, "status", `Assigned to ${holderName(to, d)}`);
}

export function checkOut(d: DB, id: string, to: Holder, due: string, condition: Condition, by?: string, note?: string) {
  const a = find(d, id); if (!a) return;
  setStatus(d, id, "checked_out", by);
  a.checkout = { to, at: now(), due, condition, note };
  a.condition = condition;
  ev(a, by, "checkout", `Checked out to ${holderName(to, d)} · due ${due}`, note);
}

export function checkIn(d: DB, id: string, condition: Condition, to: string, by?: string, note?: string) {
  const a = find(d, id); if (!a) return;
  const who = holderName(a.checkout?.to, d);
  const late = a.checkout ? daysUntil(a.checkout.due) < 0 : false;
  a.condition = condition;
  a.checkout = undefined;
  a.statusId = to;
  ev(a, by, "checkin", `Returned by ${who}${late ? " (late)" : ""} · condition ${CONDITION_LABEL[condition].toLowerCase()}`, note);
}

export function openRepair(d: DB, id: string, issue: string, priority: Priority, by?: string) {
  const a = find(d, id); if (!a) return;
  const returnTo = a.statusId === "checked_out" ? "available" : a.statusId;
  a.checkout = undefined;
  a.repair = { id: rid("rep"), issue, priority, stage: "reported", openedAt: now(), openedBy: by, parts: [], labourCost: 0, returnTo, stages: [{ stage: "reported", at: now(), by }] };
  const from = a.statusId;
  a.statusId = "in_repair";
  ev(a, by, "repair", `Repair opened (${PRIORITY_LABEL[priority].toLowerCase()} priority) · ${sname(d, from)} → In repair`, issue);
}

export function moveRepair(d: DB, id: string, stage: RepairStage, by?: string, note?: string, extra?: Partial<Repair>) {
  const a = find(d, id); if (!a?.repair) return;
  Object.assign(a.repair, extra);
  a.repair.stage = stage;
  a.repair.stages.push({ stage, at: now(), by, note: note?.trim() || undefined });
  const label = REPAIR_STAGES.find((x) => x.id === stage)!.label;
  if (stage === "at_vendor") a.statusId = "at_vendor";
  else if (a.statusId === "at_vendor") a.statusId = "in_repair";
  const vendor = stage === "at_vendor" ? d.vendors.find((v) => v.id === a.repair!.vendorId)?.name : undefined;
  ev(a, by, "repair", `Repair: ${label}${vendor ? ` · ${vendor}` : ""}`, note);
}

export function completeRepair(d: DB, id: string, to: string, resolution: string, by?: string) {
  const a = find(d, id); if (!a?.repair) return;
  const r = a.repair;
  r.stage = "completed"; r.closedAt = now(); r.resolution = resolution;
  r.stages.push({ stage: "completed", at: now(), by, note: resolution });
  a.repairs.unshift(r);
  a.repair = undefined;
  a.statusId = to;
  if (to === "in_use" && !a.assignedTo) a.statusId = "available";
  ev(a, by, "repair", `Repair completed · back to ${sname(d, a.statusId)} · cost ${repairCost(r).toFixed(2)}`, resolution);
}

export function logMaintenance(d: DB, id: string, note: string, cost: number, by?: string) {
  const a = find(d, id); if (!a) return;
  a.maintenanceLog.unshift({ id: rid("mt"), at: now(), by, note, cost });
  if (a.maintenanceEveryMonths) a.nextMaintenance = addMonths(today(), a.maintenanceEveryMonths);
  ev(a, by, "maintenance", `Maintenance done${a.nextMaintenance ? ` · next due ${a.nextMaintenance}` : ""}`, note);
}

export function dispose(d: DB, id: string, method: string, proceeds: number, by?: string, note?: string) {
  const a = find(d, id); if (!a) return;
  a.disposal = { at: now(), method, proceeds, note };
  setStatus(d, id, "disposed", by, `${method}${proceeds ? ` · proceeds ${proceeds.toFixed(2)}` : ""}${note ? ` · ${note}` : ""}`);
}

export function updateAsset(d: DB, id: string, fn: (a: Asset) => void, by?: string, text = "Details updated") {
  const a = find(d, id); if (!a) return;
  fn(a);
  ev(a, by, "edit", text);
}

/* ───────────── Demo data ───────────── */
export function seedAssets(): Asset[] {
  const base = (o: Partial<Asset> & Pick<Asset, "tag" | "name" | "categoryId" | "statusId" | "cost">): Asset => ({
    id: rid("ast"), identifier: "", make: "", model: "", description: "", condition: "good", custom: {}, site: SITES[0], room: "", poNumber: "", invoiceNo: "", warrantyProvider: "",
    maintenanceLog: [], photos: [], docs: [], repairs: [], createdAt: "2026-01-12T10:00:00Z", createdBy: "u_admin",
    history: [{ id: rid("ev"), at: o.purchaseDate ? `${o.purchaseDate}T10:00:00Z` : "2026-01-12T10:00:00Z", by: "u_admin", kind: "create", text: "Registered" }], ...o,
  });
  const due = (n: number) => addDays(today(), n);
  return [
    base({ tag: "AST-IT-26-01247", name: "MacBook Pro 14\" M4 Pro", categoryId: "cat-it", statusId: "in_use", cost: 2499, make: "Apple", model: "MacBook Pro 14 (2025)", identifier: "C02FK3XYQ6L4", purchaseDate: "2026-02-03", inServiceDate: "2026-02-05", vendorId: "v_amazon", poNumber: "PO-40211", departmentId: "dep_eng", assignedTo: { kind: "user", userId: "u_amit" }, room: "Floor 3", warrantyEnd: due(21), warrantyProvider: "AppleCare+", maintenanceEveryMonths: 12, nextMaintenance: due(110), custom: { "f-4": "macOS" } }),
    base({ tag: "AST-IT-26-01246", name: "Dell UltraSharp 27\" 4K monitor", categoryId: "cat-it", statusId: "available", cost: 610, make: "Dell", model: "U2723QE", identifier: "CN-0F8K-7421", purchaseDate: "2026-03-11", inServiceDate: "2026-03-11", vendorId: "v_nova", room: "IT store room", condition: "new", warrantyEnd: "2029-03-11" }),
    base({ tag: "AST-IT-26-01245", name: "ThinkPad X1 Carbon Gen 12", categoryId: "cat-it", statusId: "checked_out", cost: 1890, make: "Lenovo", model: "X1 Carbon G12", identifier: "PF4Z8K21", purchaseDate: "2025-11-20", inServiceDate: "2025-11-21", vendorId: "v_cdw", checkout: { to: { kind: "user", userId: "u_sofia" }, at: "2026-09-20T09:00:00Z", due: due(-3), condition: "good", note: "Offsite training" }, warrantyEnd: "2028-11-20", custom: { "f-4": "Windows" } }),
    base({ tag: "AST-VEH-26-01244", name: "Ford Transit 350 cargo van", categoryId: "cat-veh", statusId: "in_repair", cost: 48500, make: "Ford", model: "Transit 350 HD", identifier: "1FTBW3XM6PKA12345", purchaseDate: "2024-06-14", inServiceDate: "2024-06-20", vendorId: "v_local", site: "Denver depot", departmentId: "dep_ops", condition: "fair", insuranceEnd: due(40), maintenanceEveryMonths: 6, nextMaintenance: due(-5), custom: { "f-1": "68420", "f-2": "Diesel", "f-3": "3" },
      repair: { id: rid("rep"), issue: "Brake warning light on; grinding noise from front left wheel.", priority: "high", stage: "awaiting_parts", openedAt: "2026-10-08T08:30:00Z", openedBy: "u_daniel", parts: [{ id: rid("p"), name: "Front brake pads (set)", qty: 1, cost: 145, received: true }, { id: rid("p"), name: "Brake rotor, front left", qty: 1, cost: 210, received: false }], labourCost: 180, eta: due(4), returnTo: "in_use",
        stages: [{ stage: "reported", at: "2026-10-08T08:30:00Z", by: "u_daniel" }, { stage: "diagnosing", at: "2026-10-08T13:10:00Z", by: "u_daniel", note: "Rotor scored; pads below 2 mm." }, { stage: "awaiting_parts", at: "2026-10-09T09:00:00Z", by: "u_daniel", note: "Rotor on back-order from supplier." }] } }),
    base({ tag: "AST-VEH-25-01190", name: "Isuzu NPR box truck", categoryId: "cat-veh", statusId: "checked_out", cost: 62000, make: "Isuzu", model: "NPR-HD", identifier: "JALC4W167N7001122", purchaseDate: "2023-04-02", inServiceDate: "2023-04-10", site: "Denver depot", checkout: { to: { kind: "site", site: "Job site · Riverside Plaza" }, at: "2026-10-01T07:00:00Z", due: due(12), condition: "good" }, insuranceEnd: due(120), custom: { "f-1": "112830", "f-2": "Diesel", "f-3": "3" } }),
    base({ tag: "AST-VEH-25-01188", name: "Blue Bird Vision school bus", categoryId: "cat-veh", statusId: "at_vendor", cost: 112000, make: "Blue Bird", model: "Vision", identifier: "1BAKBCPA5LF334455", purchaseDate: "2022-08-01", inServiceDate: "2022-08-15", site: "Denver depot", condition: "poor", custom: { "f-1": "154200", "f-2": "Diesel", "f-3": "72" },
      repair: { id: rid("rep"), issue: "Transmission slipping in 3rd gear.", priority: "critical", stage: "at_vendor", openedAt: "2026-09-29T07:45:00Z", openedBy: "u_daniel", vendorId: "v_local", rmaNo: "SR-88213", eta: due(6), parts: [], labourCost: 0, returnTo: "in_use",
        stages: [{ stage: "reported", at: "2026-09-29T07:45:00Z", by: "u_daniel" }, { stage: "diagnosing", at: "2026-09-30T10:00:00Z", by: "u_daniel", note: "Needs specialist transmission work." }, { stage: "at_vendor", at: "2026-10-02T08:00:00Z", by: "u_daniel", note: "Towed to service centre." }] } }),
    base({ tag: "AST-FUR-26-01240", name: "Herman Miller Aeron chair", categoryId: "cat-fur", statusId: "in_use", cost: 1395, make: "Herman Miller", model: "Aeron B", purchaseDate: "2026-01-09", inServiceDate: "2026-01-09", vendorId: "v_phoenix", room: "Floor 2 · Desk 14", assignedTo: { kind: "user", userId: "u_mark" } }),
    base({ tag: "AST-MCH-24-01102", name: "Hilti TE 60 rotary hammer", categoryId: "cat-mch", statusId: "available", cost: 2850, make: "Hilti", model: "TE 60-ATC/AVR", identifier: "HT60-998812", purchaseDate: "2024-03-18", inServiceDate: "2024-03-18", site: "Denver depot", maintenanceEveryMonths: 3, nextMaintenance: due(4) }),
    base({ tag: "AST-IT-26-01249", name: "iPad Air 11\" for front desk", categoryId: "cat-it", statusId: "draft", cost: 799, make: "Apple", model: "iPad Air M3", purchaseDate: "2026-10-12", vendorId: "v_amazon", condition: "new", history: [{ id: rid("ev"), at: "2026-10-12T10:00:00Z", by: "u_sofia", kind: "create", text: "Saved as draft" }] }),
    base({ tag: "AST-IT-22-00804", name: "HP LaserJet Pro M404", categoryId: "cat-it", statusId: "decommissioned", cost: 420, make: "HP", model: "M404dn", identifier: "VNB3K22311", purchaseDate: "2022-02-10", inServiceDate: "2022-02-10", condition: "damaged", room: "IT store room" }),
    base({ tag: "AST-IT-21-00611", name: "Dell Latitude 5420", categoryId: "cat-it", statusId: "disposed", cost: 1250, make: "Dell", model: "Latitude 5420", identifier: "7HZK9F3", purchaseDate: "2021-05-04", inServiceDate: "2021-05-04", disposal: { at: "2026-06-30T12:00:00Z", method: "Recycled", proceeds: 0 } }),
  ];
}
