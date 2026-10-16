/** Report catalog: each report turns the workspace into flat, filterable rows. Pure, no UI. */
import { bookValue, daysUntil, holderName, repairCost, REPAIR_STAGES, PRIORITY_LABEL, MAINT_TYPE_LABEL } from "./assetRegister";
import { budgetAvailable, lineTotal, STATUS_LABEL, totals } from "./engine";
import type { DB } from "./types";

export type ColKind = "text" | "money" | "date" | "num" | "pct";
export interface Column { key: string; label: string; kind?: ColKind; filter?: boolean }
export type Row = Record<string, string | number | undefined> & { _link?: string; _linkKind?: "request" | "asset" };
export type ReportGroup = "procurement" | "budgets" | "assets";
export interface Report {
  id: string; group: ReportGroup; name: string; desc: string; icon: string;
  columns: Column[];
  /** Column used for the date range filter. */
  dateKey?: string;
  /** Column used for the "top" breakdown, summed over `sumKey`. */
  groupBy?: string; sumKey?: string;
  rows: (db: DB) => Row[];
  /** Report-specific primary filter, e.g. "Expiring within". */
  window?: { label: string; default: string; options: { id: string; label: string; test: (r: Row) => boolean }[] };
  /** Focused headline numbers for this report, computed from the filtered rows. */
  kpis?: (rows: Row[]) => Kpi[];
  /** Columns the table can be grouped by. */
  groups?: string[];
}
export interface Kpi { label: string; value: number; kind?: ColKind; tone?: "danger" | "warning" | "success" }
const n = (rows: Row[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
const count = (rows: Row[], key: string, v: string) => rows.filter((r) => r[key] === v).length;
const avg = (rows: Row[], key: string) => { const v = rows.map((r) => r[key]).filter((x): x is number => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0; };

export const GROUP_LABEL: Record<ReportGroup, string> = { procurement: "Procurement", budgets: "Budgets", assets: "Assets" };
/** Requests that count as spend: submitted and not rejected, cancelled or deleted. */
const SPEND_STATUSES = ["pending", "approved", "ordered", "part_ordered", "partial", "received", "closed"];
const d = (iso?: string) => iso?.slice(0, 10);
const days = (a?: string, b?: string) => (a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5)) : undefined);

function spendRows(db: DB): Row[] {
  const name = (id?: string, list: { id: string; name: string }[] = []) => list.find((x) => x.id === id)?.name ?? "—";
  return db.requests.filter((r) => SPEND_STATUSES.includes(r.status)).flatMap((r) =>
    r.items.filter((l) => !l.declined && l.fulfillment !== "inventory").map((l) => ({
      request: r.id, title: r.title, item: l.name || l.description, supplier: name(l.vendorId, db.vendors), department: name(r.departmentId, db.departments),
      category: l.category || "—", account: l.account || "—", status: STATUS_LABEL[r.status] ?? r.status, date: d(r.submittedAt ?? r.createdAt), amount: lineTotal(l), _link: r.id, _linkKind: "request" as const,
    })));
}
const spendCols: Column[] = [
  { key: "request", label: "Request" }, { key: "item", label: "Item" }, { key: "supplier", label: "Supplier", filter: true }, { key: "department", label: "Department", filter: true },
  { key: "category", label: "Category", filter: true }, { key: "account", label: "Account", filter: true }, { key: "status", label: "Status", filter: true }, { key: "date", label: "Submitted", kind: "date" }, { key: "amount", label: "Amount", kind: "money" },
];

export const REPORTS: Report[] = [
  { id: "spend-supplier", group: "procurement", icon: "store", name: "Spend by supplier", desc: "Submitted line items grouped by supplier, excluding stock issues.", columns: spendCols, dateKey: "date", groupBy: "supplier", sumKey: "amount", kpis: (r) => [{ label: "Total spend", value: n(r, "amount"), kind: "money" }, { label: "Suppliers", value: new Set(r.map((x) => x.supplier)).size }, { label: "Line items", value: r.length }, { label: "Avg line value", value: r.length ? n(r, "amount") / r.length : 0, kind: "money" }], groups: ["supplier", "category", "account"], rows: spendRows },
  { id: "spend-department", group: "procurement", icon: "building", name: "Spend by department", desc: "Where purchase money is going across departments and categories.", columns: spendCols, dateKey: "date", groupBy: "department", sumKey: "amount", kpis: (r) => [{ label: "Total spend", value: n(r, "amount"), kind: "money" }, { label: "Departments", value: new Set(r.map((x) => x.department)).size }, { label: "Requests", value: new Set(r.map((x) => x.request)).size }, { label: "Categories", value: new Set(r.map((x) => x.category)).size }], groups: ["department", "category"], rows: spendRows },
  {
    id: "requests", group: "procurement", icon: "file", name: "Request status", desc: "Every request with its status, requester and value.", dateKey: "created", groupBy: "status", sumKey: "total",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "requester", label: "Requester", filter: true }, { key: "department", label: "Department", filter: true }, { key: "status", label: "Status", filter: true }, { key: "created", label: "Created", kind: "date" }, { key: "lines", label: "Lines", kind: "num" }, { key: "total", label: "Total", kind: "money" }],
    kpis: (r) => [{ label: "Requests", value: r.length }, { label: "Pending approval", value: count(r, "status", STATUS_LABEL.pending), tone: "warning" }, { label: "Drafts", value: count(r, "status", STATUS_LABEL.draft) }, { label: "Total value", value: n(r, "total"), kind: "money" }], groups: ["status", "department", "requester"], rows: (db) => db.requests.map((r) => ({ request: r.id, title: r.title, requester: db.users.find((u) => u.id === r.requesterId)?.name ?? "—", department: db.departments.find((x) => x.id === r.departmentId)?.name ?? "—", status: STATUS_LABEL[r.status] ?? r.status, created: d(r.createdAt), lines: r.items.length, total: totals(r).total, _link: r.id, _linkKind: "request" })),
  },
  {
    id: "approval-cycle", group: "procurement", icon: "timer", name: "Approval cycle time", desc: "Days from submission to the final decision.", dateKey: "submitted", groupBy: "outcome", sumKey: "days",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "department", label: "Department", filter: true }, { key: "outcome", label: "Outcome", filter: true }, { key: "submitted", label: "Submitted", kind: "date" }, { key: "decided", label: "Decided", kind: "date" }, { key: "steps", label: "Approval steps", kind: "num" }, { key: "days", label: "Days", kind: "num" }],
    kpis: (r) => [{ label: "Decisions", value: r.length }, { label: "Avg days to decide", value: avg(r, "days") }, { label: "Approved", value: count(r, "outcome", "Approved"), tone: "success" }, { label: "Rejected", value: count(r, "outcome", "Rejected"), tone: "danger" }], groups: ["outcome", "department"], rows: (db) => db.requests.filter((r) => r.submittedAt && !["pending", "draft"].includes(r.status)).map((r) => {
      const at = r.route.flatMap((s) => s.approvals.map((a) => a.at)).filter(Boolean).sort().at(-1) as string | undefined;
      return { request: r.id, title: r.title, department: db.departments.find((x) => x.id === r.departmentId)?.name ?? "—", outcome: r.status === "rejected" ? "Rejected" : r.status === "cancelled" ? "Cancelled" : "Approved", submitted: d(r.submittedAt), decided: d(at), steps: r.route.length, days: days(r.submittedAt, at), _link: r.id, _linkKind: "request" };
    }),
  },
  {
    id: "pending-approvals", group: "procurement", icon: "inbox", name: "Pending approvals", desc: "Requests waiting on an approver, oldest first.", dateKey: "submitted", groupBy: "approver", sumKey: "amount",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "approver", label: "Approver", filter: true }, { key: "stage", label: "Step", filter: true }, { key: "submitted", label: "Submitted", kind: "date" }, { key: "waiting", label: "Waiting (days)", kind: "num" }, { key: "amount", label: "Amount", kind: "money" }],
    kpis: (r) => [{ label: "Waiting", value: r.length, tone: "warning" }, { label: "Waiting over 3 days", value: r.filter((x) => Number(x.waiting) > 3).length, tone: "danger" }, { label: "Avg wait (days)", value: avg(r, "waiting") }, { label: "Value on hold", value: n(r, "amount"), kind: "money" }], groups: ["approver", "stage"], rows: (db) => db.requests.filter((r) => r.status === "pending").flatMap((r) => r.route.flatMap((s) => s.approvals.filter((a) => a.status === "pending").map((a) => ({ request: r.id, title: r.title, approver: db.users.find((u) => u.id === a.userId)?.name ?? "—", stage: s.name, submitted: d(r.submittedAt), waiting: days(r.submittedAt, new Date().toISOString()), amount: totals(r).total, _link: r.id, _linkKind: "request" as const })))),
  },
  {
    id: "budget-utilization", group: "budgets", icon: "wallet", name: "Budget utilization", desc: "Total, committed and remaining budget by department.", groupBy: "department", sumKey: "used",
    columns: [{ key: "budget", label: "Budget" }, { key: "department", label: "Department", filter: true }, { key: "category", label: "Category", filter: true }, { key: "fy", label: "Fiscal year", filter: true }, { key: "total", label: "Total", kind: "money" }, { key: "used", label: "Committed", kind: "money" }, { key: "available", label: "Available", kind: "money" }, { key: "pct", label: "Used", kind: "pct" }],
    window: { label: "Show", default: "all", options: [{ id: "all", label: "All budgets", test: () => true }, { id: "80", label: "Over 80% used", test: (x) => Number(x.pct) >= 0.8 }, { id: "over", label: "Overspent", test: (x) => Number(x.available) < 0 }] },
    kpis: (r) => [{ label: "Total budget", value: n(r, "total"), kind: "money" }, { label: "Committed", value: n(r, "used"), kind: "money" }, { label: "Available", value: n(r, "available"), kind: "money", tone: "success" }, { label: "Over 80% used", value: r.filter((x) => Number(x.pct) >= 0.8).length, tone: "warning" }], groups: ["department", "category"], rows: (db) => db.budgets.map((b) => { const available = budgetAvailable(b.id, db); const used = b.total - available; return { budget: b.name, department: db.departments.find((x) => x.id === b.departmentId)?.name ?? "—", category: b.category, fy: b.fiscalYear, total: b.total, used, available, pct: b.total ? used / b.total : 0 }; }),
  },
  {
    id: "asset-register", group: "assets", icon: "box", name: "Asset register", desc: "All assets with status, location, holder and value.", dateKey: "purchased", groupBy: "category", sumKey: "book",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category", filter: true }, { key: "status", label: "Status", filter: true }, { key: "site", label: "Site", filter: true }, { key: "holder", label: "Assigned to" }, { key: "purchased", label: "Purchased", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "book", label: "Book value", kind: "money" }],
    kpis: (r) => [{ label: "Assets", value: r.length }, { label: "Total cost", value: n(r, "cost"), kind: "money" }, { label: "Book value", value: n(r, "book"), kind: "money" }, { label: "Unassigned", value: r.filter((x) => x.holder === "—").length }], groups: ["category", "status", "site"], rows: (db) => (db.assetItems ?? []).map((a) => ({ tag: a.tag, name: a.name, category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", status: db.assets?.statuses.find((s) => s.id === a.statusId)?.name ?? a.statusId, site: a.site || "—", holder: holderName(a.checkout?.to ?? a.assignedTo, db) || "—", purchased: a.purchaseDate, cost: a.cost, book: db.assets ? bookValue(a, db.assets) : a.cost, _link: a.id, _linkKind: "asset" })),
  },
  {
    id: "depreciation", group: "assets", icon: "trending", name: "Depreciation", desc: "Cost, accumulated depreciation and book value per asset.", dateKey: "inService", groupBy: "category", sumKey: "accumulated",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category", filter: true }, { key: "inService", label: "In service", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "accumulated", label: "Accumulated", kind: "money" }, { key: "book", label: "Book value", kind: "money" }],
    kpis: (r) => [{ label: "Original cost", value: n(r, "cost"), kind: "money" }, { label: "Accumulated", value: n(r, "accumulated"), kind: "money" }, { label: "Book value", value: n(r, "book"), kind: "money" }, { label: "Fully depreciated", value: r.filter((x) => Number(x.cost) > 0 && Number(x.book) <= Number(x.cost) * 0.2).length }], groups: ["category"], rows: (db) => (db.assetItems ?? []).filter((a) => a.statusId !== "draft").map((a) => { const book = db.assets ? bookValue(a, db.assets) : a.cost; return { tag: a.tag, name: a.name, category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", inService: a.inServiceDate || a.purchaseDate, cost: a.cost, accumulated: a.cost - book, book, _link: a.id, _linkKind: "asset" }; }),
  },
  {
    id: "maintenance-costs", group: "assets", icon: "wrench", name: "Maintenance costs", desc: "Completed services with their actual cost.", dateKey: "completed", groupBy: "asset", sumKey: "cost",
    columns: [{ key: "asset", label: "Asset" }, { key: "work", label: "Work" }, { key: "type", label: "Type", filter: true }, { key: "category", label: "Category", filter: true }, { key: "completed", label: "Completed", kind: "date" }, { key: "by", label: "Recorded by", filter: true }, { key: "cost", label: "Cost", kind: "money" }],
    kpis: (r) => [{ label: "Services done", value: r.length }, { label: "Total cost", value: n(r, "cost"), kind: "money" }, { label: "Avg cost", value: r.length ? n(r, "cost") / r.length : 0, kind: "money" }, { label: "Assets serviced", value: new Set(r.map((x) => x.asset)).size }], groups: ["type", "category", "asset"], rows: (db) => (db.assetItems ?? []).flatMap((a) => a.maintenanceLog.map((m) => ({ asset: a.name, work: m.name || m.note, type: m.type ? MAINT_TYPE_LABEL[m.type] : "—", category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", completed: d(m.at), by: db.users.find((u) => u.id === m.by)?.name ?? "System", cost: m.cost, _link: a.id, _linkKind: "asset" as const }))),
  },
  {
    id: "repairs", group: "assets", icon: "hammer", name: "Repairs", desc: "Open and closed repairs with stage, vendor and cost.", dateKey: "opened", groupBy: "stage", sumKey: "cost",
    columns: [{ key: "asset", label: "Asset" }, { key: "issue", label: "Issue" }, { key: "priority", label: "Priority", filter: true }, { key: "stage", label: "Stage", filter: true }, { key: "vendor", label: "Vendor", filter: true }, { key: "opened", label: "Opened", kind: "date" }, { key: "closed", label: "Closed", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }],
    window: { label: "Show", default: "all", options: [{ id: "all", label: "All repairs", test: () => true }, { id: "open", label: "Open only", test: (x) => !x.closed }, { id: "closed", label: "Closed only", test: (x) => !!x.closed }] },
    kpis: (r) => [{ label: "Open", value: r.filter((x) => !x.closed).length, tone: "warning" }, { label: "Critical / high", value: r.filter((x) => !x.closed && ["Critical", "High"].includes(String(x.priority))).length, tone: "danger" }, { label: "Closed", value: r.filter((x) => x.closed).length, tone: "success" }, { label: "Repair cost", value: n(r, "cost"), kind: "money" }], groups: ["stage", "vendor", "priority"], rows: (db) => (db.assetItems ?? []).flatMap((a) => [...(a.repair ? [a.repair] : []), ...a.repairs.filter((r) => r.id !== a.repair?.id)].map((r) => ({ asset: a.name, issue: r.issue, priority: PRIORITY_LABEL[r.priority], stage: REPAIR_STAGES.find((s) => s.id === r.stage)?.label ?? r.stage, vendor: db.vendors.find((v) => v.id === r.vendorId)?.name ?? "In-house", opened: d(r.openedAt), closed: d(r.closedAt), cost: repairCost(r), _link: a.id, _linkKind: "asset" as const }))),
  },
  {
    id: "checkouts", group: "assets", icon: "logout", name: "Checked-out assets", desc: "Who has which asset and when it's due back.", groupBy: "state", sumKey: "count",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "holder", label: "Checked out to", filter: true }, { key: "out", label: "Checked out", kind: "date" }, { key: "due", label: "Due", kind: "date" }, { key: "state", label: "State", filter: true }, { key: "late", label: "Days overdue", kind: "num" }],
    window: { label: "Show", default: "all", options: [{ id: "all", label: "All on loan", test: () => true }, { id: "overdue", label: "Overdue", test: (x) => x.state === "Overdue" }, { id: "soon", label: "Due in 7 days", test: (x) => x.state === "Due soon" }] },
    kpis: (r) => [{ label: "On loan", value: r.length }, { label: "Overdue", value: count(r, "state", "Overdue"), tone: "danger" }, { label: "Due in 7 days", value: count(r, "state", "Due soon"), tone: "warning" }, { label: "Borrowers", value: new Set(r.map((x) => x.holder)).size }], groups: ["holder", "state"], rows: (db) => (db.assetItems ?? []).filter((a) => a.checkout).map((a) => { const left = daysUntil(a.checkout!.due); return { tag: a.tag, name: a.name, holder: holderName(a.checkout!.to, db), out: d(a.checkout!.at), due: d(a.checkout!.due), state: left < 0 ? "Overdue" : left <= 7 ? "Due soon" : "On loan", late: Math.max(0, -left), count: 1, _link: a.id, _linkKind: "asset" }; }),
  },
  {
    id: "warranty", group: "assets", icon: "shield", name: "Warranty expiry", desc: "Warranties ending soon, so you can renew cover or plan a replacement.", groupBy: "state", sumKey: "book",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "provider", label: "Provider", filter: true }, { key: "ends", label: "Ends", kind: "date" }, { key: "left", label: "Days left", kind: "num" }, { key: "state", label: "State" }, { key: "category", label: "Category", filter: true }, { key: "unit", label: "Business unit", filter: true }, { key: "site", label: "Site", filter: true }, { key: "book", label: "Book value", kind: "money" }],
    window: { label: "Expiring within", default: "90", options: [{ id: "30", label: "30 days", test: (x) => Number(x.left) >= 0 && Number(x.left) <= 30 }, { id: "60", label: "60 days", test: (x) => Number(x.left) >= 0 && Number(x.left) <= 60 }, { id: "90", label: "90 days", test: (x) => Number(x.left) >= 0 && Number(x.left) <= 90 }, { id: "180", label: "180 days", test: (x) => Number(x.left) >= 0 && Number(x.left) <= 180 }, { id: "365", label: "12 months", test: (x) => Number(x.left) >= 0 && Number(x.left) <= 365 }, { id: "expired", label: "Already expired", test: (x) => Number(x.left) < 0 }, { id: "all", label: "Any time", test: () => true }] },
    kpis: (r) => [{ label: "Expiring", value: r.filter((x) => Number(x.left) >= 0).length }, { label: "Within 30 days", value: r.filter((x) => Number(x.left) >= 0 && Number(x.left) <= 30).length, tone: "warning" }, { label: "Book value covered", value: n(r, "book"), kind: "money" }, { label: "No provider recorded", value: count(r, "provider", "—"), tone: "danger" }], groups: ["provider", "category", "site"], rows: (db) => (db.assetItems ?? []).filter((a) => a.warrantyEnd && a.statusId !== "disposed").map((a) => { const left = daysUntil(a.warrantyEnd); return { tag: a.tag, name: a.name, provider: a.warrantyProvider || "—", ends: a.warrantyEnd, left, state: left < 0 ? "Expired" : left <= 30 ? "Expiring soon" : "Active", category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", unit: a.businessUnit || "—", site: a.site || "—", book: db.assets ? bookValue(a, db.assets) : a.cost, _link: a.id, _linkKind: "asset" }; }),
  },
];

export interface ReportFilters { q?: string; from?: string; to?: string; values?: Record<string, string>; window?: string }
/** Applies search, date range and column filters. */
export function applyFilters(rep: Report, rows: Row[], f: ReportFilters): Row[] {
  const q = f.q?.trim().toLowerCase();
  const w = rep.window?.options.find((o) => o.id === (f.window ?? rep.window?.default));
  return rows.filter((r) => {
    if (w && !w.test(r)) return false;
    if (q && !rep.columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) return false;
    if (rep.dateKey && (f.from || f.to)) { const v = String(r[rep.dateKey] ?? ""); if (!v || (f.from && v < f.from) || (f.to && v > f.to)) return false; }
    return Object.entries(f.values ?? {}).every(([k, v]) => !v || String(r[k]) === v);
  });
}
/** Sum of `sumKey` per `groupBy` value, largest first. */
export function breakdown(rep: Report, rows: Row[]) {
  if (!rep.groupBy || !rep.sumKey) return [];
  const m = new Map<string, number>();
  for (const r of rows) m.set(String(r[rep.groupBy] ?? "—"), (m.get(String(r[rep.groupBy] ?? "—")) ?? 0) + (Number(r[rep.sumKey]) || 0));
  return [...m].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
}
