/** Asset management settings: numbering, categories, lifecycle, depreciation, alerts. Pure helpers, no UI. */

export type Separator = "-" | "/" | "." | "_" | "";
export type YearFormat = "none" | "YY" | "YYYY";
export type DepMethod = "straight_line" | "declining_balance" | "sum_of_years" | "none";
export type StatusPhase = "setup" | "active" | "service" | "retired";
export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

export interface Numbering {
  prefix: string;
  separator: Separator;
  includeCategory: boolean;
  yearFormat: YearFormat;
  seqLength: number;
  startAt: number;
  /** Next number to be issued; bumps when assets are registered. */
  nextSeq: number;
  resetYearly: boolean;
  /** Allow editing an issued ID on the asset record. */
  allowManualOverride: boolean;
  /** When the sequence restarts. `resetYearly` mirrors "calendar" for older data. */
  resetMode?: ResetMode;
  /** Last ID handed out from the global sequence. */
  lastIssued?: string;
  /** Year segment follows the fiscal year instead of the calendar year. */
  fiscalYear?: boolean;
}

export interface CategoryIdFormat { prefix: string; separator: Separator; includeCategory: boolean; yearFormat: YearFormat; seqLength: number }

export type ResetMode = "never" | "calendar" | "fiscal";

/** A reserved block of numbers for one category, with its own prefix. */
export interface NumberRange {
  id: string;
  categoryId: string;
  prefix: string;
  start: number;
  end: number;
  next: number;
  lastIssued?: string;
}

export type IntegrationId = "netsuite" | "jira" | "zebra" | "fiix" | "api";
export interface IntegrationState { connected: boolean; connectedAt?: string; connectedBy?: string; account?: string; syncEvents: string[] }

export interface DepRule { method: DepMethod; usefulLifeMonths: number; salvagePct: number }

export interface AssetCategory {
  id: string;
  name: string;
  code: string;
  description: string;
  /** Lucide icon key from CATEGORY_ICONS. */
  icon?: string;
  /** Overrides the global prefix for this category's IDs. */
  prefixOverride?: string;
  /** Optional category-specific ID format; falls back to global numbering when unset. Sequence stays shared. */
  idFormat?: CategoryIdFormat;
  identifier: "serial" | "vin" | "license" | "none";
  /** Inherit org default when undefined. */
  depreciation?: DepRule;
  maintenanceEveryMonths?: number;
  checkoutAllowed: boolean;
  active: boolean;
  assetCount: number;
}

export interface AssetStatus {
  id: string;
  name: string;
  phase: StatusPhase;
  tone: Tone;
  description: string;
  system: boolean;
  enabled: boolean;
  /** Asset can be checked out while in this status. */
  checkoutable: boolean;
  /** Depreciation keeps running in this status. */
  depreciates: boolean;
  /** Statuses an asset may move to from here. */
  next: string[];
  assetCount: number;
}

export interface DepreciationSettings extends DepRule {
  enabled: boolean;
  ddbFactor: number;
  convention: "full_month" | "half_month" | "in_service_date";
  frequency: "monthly" | "quarterly" | "yearly";
  capitalizationThreshold: number;
  expenseAccount: string;
  accumulatedAccount: string;
}

export type AlertEvent =
  | "warranty_expiring" | "maintenance_due" | "insurance_expiring" | "registration_expiring"
  | "checkout_overdue" | "audit_due" | "fully_depreciated" | "license_expiring";

export interface AlertRule {
  id: string;
  event: AlertEvent;
  enabled: boolean;
  leadDays: number;
  repeat: "once" | "daily" | "weekly";
  channels: { inApp: boolean; email: boolean };
  recipients: ("custodian" | "asset_manager" | "dept_manager" | "finance")[];
}

export interface CustomField {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[];
  categoryIds: string[];
  required: boolean;
}

export interface CheckoutSettings {
  requireApproval: boolean;
  defaultDays: number;
  maxDays: number;
  allowSelfCheckout: boolean;
  requireCondition: boolean;
  requireAcknowledgement: boolean;
}

export interface AuditSettings { cycleMonths: number; requirePhoto: boolean; autoFlagMissing: boolean }

export interface AssetSettings {
  numbering: Numbering;
  categories: AssetCategory[];
  statuses: AssetStatus[];
  defaultStatusId: string;
  depreciation: DepreciationSettings;
  alerts: AlertRule[];
  digest: "off" | "daily" | "weekly";
  quietWeekends: boolean;
  fields: CustomField[];
  checkout: CheckoutSettings;
  audit: AuditSettings;
  ranges?: NumberRange[];
  /** 1–12; month the fiscal year starts. */
  fiscalYearStartMonth?: number;
  /** 1–31; day of the month the fiscal year starts. */
  fiscalYearStartDay?: number;
  integrations?: Partial<Record<IntegrationId, IntegrationState>>;
  updatedAt?: string;
  updatedBy?: string;
}

export const INTEGRATIONS: { id: IntegrationId; name: string; desc: string; accountLabel: string; placeholder: string; events: { id: string; label: string }[] }[] = [
  { id: "netsuite", name: "NetSuite", desc: "Post journal entries for purchases, depreciation and disposals.", accountLabel: "Account ID", placeholder: "e.g. 1234567", events: [{ id: "acq", label: "Acquisitions" }, { id: "dep", label: "Monthly depreciation" }, { id: "disp", label: "Disposals and write-offs" }] },
  { id: "jira", name: "Jira Service Management", desc: "Open a ticket automatically when an asset goes into repair.", accountLabel: "Site URL", placeholder: "yourcompany.atlassian.net", events: [{ id: "repair", label: "Asset moved to In repair" }, { id: "vendor", label: "Asset sent to vendor" }, { id: "missing", label: "Asset flagged missing in audit" }] },
  { id: "zebra", name: "Zebra label printers", desc: "Print asset tags on networked label printers.", accountLabel: "Printer address", placeholder: "e.g. 10.0.4.21", events: [{ id: "register", label: "Print a tag when an asset is registered" }, { id: "retag", label: "Print when an ID is changed" }] },
  { id: "fiix", name: "Fiix CMMS", desc: "Keep maintenance work orders in sync both ways.", accountLabel: "Tenant", placeholder: "yourcompany.macmms.com", events: [{ id: "wo", label: "Create work orders for maintenance due" }, { id: "close", label: "Close repairs when the work order closes" }] },
  { id: "api", name: "API & webhooks", desc: "Tokens and webhook endpoints for your own systems.", accountLabel: "Webhook URL", placeholder: "https://example.com/hooks/assets", events: [{ id: "status", label: "Status changes" }, { id: "checkout", label: "Check-out and check-in" }, { id: "create", label: "New assets" }] },
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const resetModeOf = (n: Numbering): ResetMode => n.resetMode ?? (n.resetYearly ? "calendar" : "never");

/** The year used in IDs; a fiscal reset uses the fiscal year (named after the year it ends). */
export function idYear(n: Numbering, date: Date, fiscalStartMonth = 1): Date {
  if ((!n.fiscalYear && resetModeOf(n) !== "fiscal") || fiscalStartMonth <= 1) return date;
  const y = date.getMonth() + 1 >= fiscalStartMonth ? date.getFullYear() + 1 : date.getFullYear();
  return new Date(y, 5, 1);
}

export const activeRange = (s: AssetSettings, categoryId?: string) => s.ranges?.find((r) => r.categoryId === categoryId && r.next <= r.end);

/** The ID the next asset in this category would get. */
export function previewAssetId(s: AssetSettings, cat?: AssetCategory, date = new Date()): string {
  const r = activeRange(s, cat?.id);
  const d = idYear(s.numbering, date, s.fiscalYearStartMonth);
  // A category's own format owns the prefix; legacy ranges without one keep their own prefix.
  if (r) return formatAssetId(s.numbering, { code: cat?.code ?? "", prefixOverride: cat?.idFormat ? undefined : r.prefix, idFormat: cat?.idFormat }, d, r.next);
  return formatAssetId(s.numbering, cat, d);
}

/** Issues an ID and advances the matching sequence (range first, then global). Mutates settings. */
export function issueAssetId(s: AssetSettings, cat?: AssetCategory, date = new Date()): string {
  const id = previewAssetId(s, cat, date);
  const r = activeRange(s, cat?.id);
  if (r) { r.next += 1; r.lastIssued = id; }
  else { s.numbering.nextSeq += 1; s.numbering.lastIssued = id; }
  return id;
}

export function rangeIssues(r: NumberRange, all: NumberRange[], seqLength: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.categoryId) e.categoryId = "Choose a category.";
  else if (all.some((x) => x.id !== r.id && x.categoryId === r.categoryId)) e.categoryId = "This category already has a range.";
  if (!/^[A-Z0-9]{1,6}$/.test(r.prefix)) e.prefix = "Use 1–6 capital letters or numbers.";
  if (!Number.isInteger(r.start) || r.start < 1) e.start = "Start at 1 or higher.";
  if (!Number.isInteger(r.end) || r.end <= r.start) e.end = "Must be higher than the first number.";
  else if (String(r.end).length > seqLength) e.end = `Doesn't fit in ${seqLength} digits.`;
  return e;
}

export const ALERT_META: Record<AlertEvent, { label: string; hint: string; unit: "before" | "after" }> = {
  warranty_expiring: { label: "Warranty expiring", hint: "Gives time to renew cover or plan a replacement.", unit: "before" },
  maintenance_due: { label: "Maintenance due", hint: "Based on each category's service interval.", unit: "before" },
  insurance_expiring: { label: "Insurance expiring", hint: "For vehicles, machinery and other insured assets.", unit: "before" },
  registration_expiring: { label: "Registration or permit expiring", hint: "Vehicle registration, road permits and inspections.", unit: "before" },
  license_expiring: { label: "Software license expiring", hint: "Subscriptions and seat licenses tracked as assets.", unit: "before" },
  checkout_overdue: { label: "Check-out overdue", hint: "Asset wasn't returned by its due date.", unit: "after" },
  audit_due: { label: "Physical audit due", hint: "Reminds the custodian to verify the asset in person.", unit: "before" },
  fully_depreciated: { label: "Fully depreciated", hint: "Book value reached its salvage value.", unit: "after" },
};

export const RECIPIENT_LABEL = { custodian: "Custodian", asset_manager: "Asset manager", dept_manager: "Department manager", finance: "Finance" } as const;
export const PHASE_LABEL: Record<StatusPhase, string> = { setup: "Before use", active: "In service", service: "Under service", retired: "End of life" };
export const METHOD_LABEL: Record<DepMethod, string> = { straight_line: "Straight-line", declining_balance: "Declining balance", sum_of_years: "Sum of years' digits", none: "Don't depreciate" };
export const IDENTIFIER_LABEL = { serial: "Serial number", vin: "VIN / chassis number", license: "License key", none: "No unique identifier" } as const;

const st = (id: string, name: string, phase: StatusPhase, tone: Tone, description: string, o: Partial<AssetStatus>): AssetStatus =>
  ({ id, name, phase, tone, description, system: true, enabled: true, checkoutable: false, depreciates: true, next: [], assetCount: 0, ...o });

export function defaultAssetSettings(): AssetSettings {
  return {
    numbering: { prefix: "AST", separator: "-", includeCategory: true, yearFormat: "YY", seqLength: 5, startAt: 1, nextSeq: 1248, resetYearly: false, allowManualOverride: false, resetMode: "never", lastIssued: "AST-IT-26-01247" },
    categories: [
      { id: "cat-it", name: "IT equipment", code: "IT", description: "Laptops, monitors, phones and peripherals.", identifier: "serial", depreciation: { method: "straight_line", usefulLifeMonths: 36, salvagePct: 5 }, maintenanceEveryMonths: 12, checkoutAllowed: true, active: true, assetCount: 842 },
      { id: "cat-veh", name: "Vehicles", code: "VEH", description: "Cars, trucks, buses and vans.", identifier: "vin", depreciation: { method: "declining_balance", usefulLifeMonths: 96, salvagePct: 15 }, maintenanceEveryMonths: 6, checkoutAllowed: true, active: true, assetCount: 37 },
      { id: "cat-fur", name: "Furniture", code: "FUR", description: "Desks, chairs and storage.", identifier: "none", depreciation: { method: "straight_line", usefulLifeMonths: 84, salvagePct: 0 }, checkoutAllowed: false, active: true, assetCount: 311 },
      { id: "cat-mch", name: "Machinery", code: "MCH", description: "Production, lab and workshop equipment.", identifier: "serial", maintenanceEveryMonths: 3, checkoutAllowed: false, active: true, assetCount: 54 },
      { id: "cat-sw", name: "Software licenses", code: "SW", description: "Perpetual licenses capitalised as assets.", identifier: "license", depreciation: { method: "straight_line", usefulLifeMonths: 36, salvagePct: 0 }, checkoutAllowed: true, active: true, assetCount: 4 },
    ],
    statuses: [
      st("draft", "Draft", "setup", "neutral", "Saved but not yet part of the register", { depreciates: false, next: ["available", "disposed"], assetCount: 12 }),
      st("available", "Available", "active", "green", "Ready to be checked out or assigned", { checkoutable: true, next: ["in_use", "checked_out", "in_repair", "decommissioned"], assetCount: 205 }),
      st("in_use", "In use", "active", "blue", "Currently assigned to a person or crew", { next: ["available", "in_repair", "at_vendor", "decommissioned"], assetCount: 902 }),
      st("checked_out", "Checked out", "active", "violet", "Temporarily released to a user with a return date", { next: ["available", "in_repair"], assetCount: 48 }),
      st("in_repair", "In repair", "service", "amber", "Out of service pending maintenance completion", { next: ["available", "in_use", "at_vendor", "decommissioned"], assetCount: 19 }),
      st("at_vendor", "At vendor", "service", "amber", "Sent off site to a vendor for service or repair", { next: ["available", "in_repair", "decommissioned"], assetCount: 6 }),
      st("decommissioned", "Decommissioned", "retired", "red", "Retired from service but not yet disposed", { depreciates: false, next: ["disposed", "available"], assetCount: 44 }),
      st("disposed", "Disposed", "retired", "neutral", "Removed from the books", { depreciates: false, next: [], assetCount: 12 }),
    ],
    defaultStatusId: "draft",
    depreciation: { enabled: true, method: "straight_line", usefulLifeMonths: 60, salvagePct: 10, ddbFactor: 2, convention: "full_month", frequency: "monthly", capitalizationThreshold: 2500, expenseAccount: "Depreciation Expense", accumulatedAccount: "Accumulated Depreciation" },
    alerts: [
      { id: "al-1", event: "warranty_expiring", enabled: true, leadDays: 30, repeat: "once", channels: { inApp: true, email: true }, recipients: ["asset_manager", "custodian"] },
      { id: "al-2", event: "maintenance_due", enabled: true, leadDays: 7, repeat: "daily", channels: { inApp: true, email: true }, recipients: ["custodian", "asset_manager"] },
      { id: "al-3", event: "insurance_expiring", enabled: true, leadDays: 45, repeat: "weekly", channels: { inApp: true, email: true }, recipients: ["asset_manager", "finance"] },
      { id: "al-4", event: "registration_expiring", enabled: true, leadDays: 30, repeat: "weekly", channels: { inApp: true, email: true }, recipients: ["asset_manager"] },
      { id: "al-5", event: "license_expiring", enabled: false, leadDays: 60, repeat: "once", channels: { inApp: true, email: false }, recipients: ["asset_manager"] },
      { id: "al-6", event: "checkout_overdue", enabled: true, leadDays: 1, repeat: "daily", channels: { inApp: true, email: true }, recipients: ["custodian", "dept_manager"] },
      { id: "al-7", event: "audit_due", enabled: true, leadDays: 14, repeat: "once", channels: { inApp: true, email: false }, recipients: ["custodian"] },
      { id: "al-8", event: "fully_depreciated", enabled: false, leadDays: 0, repeat: "once", channels: { inApp: true, email: false }, recipients: ["finance"] },
    ],
    digest: "weekly",
    quietWeekends: true,
    fields: [
      { id: "f-1", label: "Odometer (km)", type: "number", options: [], categoryIds: ["cat-veh"], required: true },
      { id: "f-2", label: "Fuel type", type: "select", options: ["Diesel", "Petrol", "Electric", "Hybrid", "CNG"], categoryIds: ["cat-veh"], required: false },
      { id: "f-3", label: "Seating capacity", type: "number", options: [], categoryIds: ["cat-veh"], required: false },
      { id: "f-4", label: "Operating system", type: "select", options: ["macOS", "Windows", "Linux", "ChromeOS"], categoryIds: ["cat-it"], required: false },
      { id: "f-5", label: "Purchase order", type: "text", options: [], categoryIds: [], required: false },
    ],
    checkout: { requireApproval: false, defaultDays: 14, maxDays: 90, allowSelfCheckout: true, requireCondition: true, requireAcknowledgement: true },
    audit: { cycleMonths: 12, requirePhoto: false, autoFlagMissing: true },
    ranges: [{ id: "rg-1", categoryId: "cat-veh", prefix: "FLT", start: 1, end: 500, next: 38, lastIssued: "FLT-VEH-26-00037" }],
    fiscalYearStartMonth: 1,
    integrations: {},
  };
}

const yearPart = (f: YearFormat, d: Date) => (f === "YYYY" ? String(d.getFullYear()) : f === "YY" ? String(d.getFullYear()).slice(-2) : "");

/** Builds an asset ID, e.g. AST-IT-26-01248. */
export function formatAssetId(base: Numbering, cat?: Pick<AssetCategory, "code" | "prefixOverride"> & { idFormat?: CategoryIdFormat }, date = new Date(), seq = base.nextSeq): string {
  const n = cat?.idFormat ? { ...base, ...cat.idFormat } : base;
  const prefix = (cat?.prefixOverride || n.prefix).trim();
  const parts = [prefix, n.includeCategory && cat?.code ? cat.code : "", yearPart(n.yearFormat, date), String(Math.max(0, seq)).padStart(n.seqLength, "0")];
  return parts.filter(Boolean).join(n.separator);
}

export function numberingIssues(n: Numbering): Record<string, string> {
  const e: Record<string, string> = {};
  if (n.prefix && !/^[A-Z0-9]{1,6}$/.test(n.prefix)) e.prefix = "Use 1–6 capital letters or numbers.";
  if (!n.prefix && !n.includeCategory) e.prefix = "Add a prefix or include the category code, so IDs stay recognisable.";
  if (n.seqLength < 3 || n.seqLength > 8) e.seqLength = "Choose between 3 and 8 digits.";
  if (!Number.isInteger(n.startAt) || n.startAt < 1) e.startAt = "Start at 1 or higher.";
  else if (String(n.startAt).length > n.seqLength) e.startAt = `Doesn't fit in ${n.seqLength} digits.`;
  return e;
}

/** Remaining IDs before the sequence overflows its digits. */
export const capacityLeft = (n: Numbering) => Math.max(0, 10 ** n.seqLength - n.nextSeq);

export function categoryIssues(c: AssetCategory, all: AssetCategory[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.name.trim()) e.name = "Give the category a name.";
  else if (all.some((x) => x.id !== c.id && x.name.trim().toLowerCase() === c.name.trim().toLowerCase())) e.name = "A category with this name already exists.";
  if (!/^[A-Z0-9]{2,5}$/.test(c.code)) e.code = "Use 2–5 capital letters or numbers.";
  else if (all.some((x) => x.id !== c.id && x.code === c.code)) e.code = "Another category already uses this code.";
  if (c.prefixOverride && !/^[A-Z0-9]{1,6}$/.test(c.prefixOverride)) e.prefixOverride = "Use 1–6 capital letters or numbers.";
  if (c.idFormat) {
    if (c.idFormat.prefix && !/^[A-Z0-9]{1,6}$/.test(c.idFormat.prefix)) e.fmtPrefix = "Use 1–6 capital letters or numbers.";
    if (!c.idFormat.prefix && !c.idFormat.includeCategory) e.fmtPrefix = "Add a prefix or include the category code.";
    if (c.idFormat.seqLength < 3 || c.idFormat.seqLength > 8) e.fmtSeq = "Choose between 3 and 8 digits.";
  }
  return e;
}

/** Yearly book values for a depreciation rule. Returns [{year, expense, book}]. */
export function depreciationSchedule(cost: number, rule: DepRule, ddbFactor = 2) {
  const salvage = (cost * rule.salvagePct) / 100;
  const years = Math.max(1, Math.ceil(rule.usefulLifeMonths / 12));
  const out: { year: number; expense: number; book: number }[] = [];
  if (rule.method === "none" || cost <= 0) return out;
  let book = cost;
  const soyd = (years * (years + 1)) / 2;
  for (let y = 1; y <= years; y++) {
    let exp =
      rule.method === "straight_line" ? (cost - salvage) / years
      : rule.method === "sum_of_years" ? ((cost - salvage) * (years - y + 1)) / soyd
      : y === years ? book - salvage : Math.max((book * ddbFactor) / years, 0);
    if (rule.method === "declining_balance") {
      // switch to straight-line once it gives a bigger charge, as most ledgers do
      exp = Math.max(exp, (book - salvage) / (years - y + 1));
    }
    exp = Math.min(exp, book - salvage);
    book = +(book - exp).toFixed(2);
    out.push({ year: y, expense: +exp.toFixed(2), book });
  }
  return out;
}

export const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const suggestCode = (name: string) => {
  const w = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return (w.length > 1 ? w.map((x) => x[0]).join("") : w[0]).slice(0, 4).padEnd(2, "X");
};
