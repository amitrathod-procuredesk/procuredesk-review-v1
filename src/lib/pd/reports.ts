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
}

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
  { id: "spend-supplier", group: "procurement", icon: "store", name: "Spend by supplier", desc: "Submitted line items grouped by supplier, excluding stock issues.", columns: spendCols, dateKey: "date", groupBy: "supplier", sumKey: "amount", rows: spendRows },
  { id: "spend-department", group: "procurement", icon: "building", name: "Spend by department", desc: "Where purchase money is going across departments and categories.", columns: spendCols, dateKey: "date", groupBy: "department", sumKey: "amount", rows: spendRows },
  {
    id: "requests", group: "procurement", icon: "file", name: "Request status", desc: "Every request with its status, requester and value.", dateKey: "created", groupBy: "status", sumKey: "total",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "requester", label: "Requester", filter: true }, { key: "department", label: "Department", filter: true }, { key: "status", label: "Status", filter: true }, { key: "created", label: "Created", kind: "date" }, { key: "lines", label: "Lines", kind: "num" }, { key: "total", label: "Total", kind: "money" }],
    rows: (db) => db.requests.map((r) => ({ request: r.id, title: r.title, requester: db.users.find((u) => u.id === r.requesterId)?.name ?? "—", department: db.departments.find((x) => x.id === r.departmentId)?.name ?? "—", status: STATUS_LABEL[r.status] ?? r.status, created: d(r.createdAt), lines: r.items.length, total: totals(r).total, _link: r.id, _linkKind: "request" })),
  },
  {
    id: "approval-cycle", group: "procurement", icon: "timer", name: "Approval cycle time", desc: "Days from submission to the final decision.", dateKey: "submitted", groupBy: "outcome", sumKey: "days",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "department", label: "Department", filter: true }, { key: "outcome", label: "Outcome", filter: true }, { key: "submitted", label: "Submitted", kind: "date" }, { key: "decided", label: "Decided", kind: "date" }, { key: "steps", label: "Approval steps", kind: "num" }, { key: "days", label: "Days", kind: "num" }],
    rows: (db) => db.requests.filter((r) => r.submittedAt && !["pending", "draft"].includes(r.status)).map((r) => {
      const at = r.route.flatMap((s) => s.approvals.map((a) => a.at)).filter(Boolean).sort().at(-1) as string | undefined;
      return { request: r.id, title: r.title, department: db.departments.find((x) => x.id === r.departmentId)?.name ?? "—", outcome: r.status === "rejected" ? "Rejected" : r.status === "cancelled" ? "Cancelled" : "Approved", submitted: d(r.submittedAt), decided: d(at), steps: r.route.length, days: days(r.submittedAt, at), _link: r.id, _linkKind: "request" };
    }),
  },
  {
    id: "pending-approvals", group: "procurement", icon: "inbox", name: "Pending approvals", desc: "Requests waiting on an approver, oldest first.", dateKey: "submitted", groupBy: "approver", sumKey: "amount",
    columns: [{ key: "request", label: "Request" }, { key: "title", label: "Title" }, { key: "approver", label: "Approver", filter: true }, { key: "stage", label: "Step", filter: true }, { key: "submitted", label: "Submitted", kind: "date" }, { key: "waiting", label: "Waiting (days)", kind: "num" }, { key: "amount", label: "Amount", kind: "money" }],
    rows: (db) => db.requests.filter((r) => r.status === "pending").flatMap((r) => r.route.flatMap((s) => s.approvals.filter((a) => a.status === "pending").map((a) => ({ request: r.id, title: r.title, approver: db.users.find((u) => u.id === a.userId)?.name ?? "—", stage: s.name, submitted: d(r.submittedAt), waiting: days(r.submittedAt, new Date().toISOString()), amount: totals(r).total, _link: r.id, _linkKind: "request" as const })))),
  },
  {
    id: "budget-utilization", group: "budgets", icon: "wallet", name: "Budget utilization", desc: "Total, committed and remaining budget by department.", groupBy: "department", sumKey: "used",
    columns: [{ key: "budget", label: "Budget" }, { key: "department", label: "Department", filter: true }, { key: "category", label: "Category", filter: true }, { key: "fy", label: "Fiscal year", filter: true }, { key: "total", label: "Total", kind: "money" }, { key: "used", label: "Committed", kind: "money" }, { key: "available", label: "Available", kind: "money" }, { key: "pct", label: "Used", kind: "pct" }],
    rows: (db) => db.budgets.map((b) => { const available = budgetAvailable(b.id, db); const used = b.total - available; return { budget: b.name, department: db.departments.find((x) => x.id === b.departmentId)?.name ?? "—", category: b.category, fy: b.fiscalYear, total: b.total, used, available, pct: b.total ? used / b.total : 0 }; }),
  },
  {
    id: "asset-register", group: "assets", icon: "box", name: "Asset register", desc: "All assets with status, location, holder and value.", dateKey: "purchased", groupBy: "category", sumKey: "book",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category", filter: true }, { key: "status", label: "Status", filter: true }, { key: "site", label: "Site", filter: true }, { key: "holder", label: "Assigned to" }, { key: "purchased", label: "Purchased", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "book", label: "Book value", kind: "money" }],
    rows: (db) => (db.assetItems ?? []).map((a) => ({ tag: a.tag, name: a.name, category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", status: db.assets?.statuses.find((s) => s.id === a.statusId)?.name ?? a.statusId, site: a.site || "—", holder: holderName(a.checkout?.to ?? a.assignedTo, db) || "—", purchased: a.purchaseDate, cost: a.cost, book: db.assets ? bookValue(a, db.assets) : a.cost, _link: a.id, _linkKind: "asset" })),
  },
  {
    id: "depreciation", group: "assets", icon: "trending", name: "Depreciation", desc: "Cost, accumulated depreciation and book value per asset.", dateKey: "inService", groupBy: "category", sumKey: "accumulated",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category", filter: true }, { key: "inService", label: "In service", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }, { key: "accumulated", label: "Accumulated", kind: "money" }, { key: "book", label: "Book value", kind: "money" }],
    rows: (db) => (db.assetItems ?? []).filter((a) => a.statusId !== "draft").map((a) => { const book = db.assets ? bookValue(a, db.assets) : a.cost; return { tag: a.tag, name: a.name, category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", inService: a.inServiceDate || a.purchaseDate, cost: a.cost, accumulated: a.cost - book, book, _link: a.id, _linkKind: "asset" }; }),
  },
  {
    id: "maintenance-costs", group: "assets", icon: "wrench", name: "Maintenance costs", desc: "Completed services with their actual cost.", dateKey: "completed", groupBy: "asset", sumKey: "cost",
    columns: [{ key: "asset", label: "Asset" }, { key: "work", label: "Work" }, { key: "type", label: "Type", filter: true }, { key: "category", label: "Category", filter: true }, { key: "completed", label: "Completed", kind: "date" }, { key: "by", label: "Recorded by", filter: true }, { key: "cost", label: "Cost", kind: "money" }],
    rows: (db) => (db.assetItems ?? []).flatMap((a) => a.maintenanceLog.map((m) => ({ asset: a.name, work: m.name || m.note, type: m.type ? MAINT_TYPE_LABEL[m.type] : "—", category: db.assets?.categories.find((c) => c.id === a.categoryId)?.name ?? "—", completed: d(m.at), by: db.users.find((u) => u.id === m.by)?.name ?? "System", cost: m.cost, _link: a.id, _linkKind: "asset" as const }))),
  },
  {
    id: "repairs", group: "assets", icon: "hammer", name: "Repairs", desc: "Open and closed repairs with stage, vendor and cost.", dateKey: "opened", groupBy: "stage", sumKey: "cost",
    columns: [{ key: "asset", label: "Asset" }, { key: "issue", label: "Issue" }, { key: "priority", label: "Priority", filter: true }, { key: "stage", label: "Stage", filter: true }, { key: "vendor", label: "Vendor", filter: true }, { key: "opened", label: "Opened", kind: "date" }, { key: "closed", label: "Closed", kind: "date" }, { key: "cost", label: "Cost", kind: "money" }],
    rows: (db) => (db.assetItems ?? []).flatMap((a) => [...(a.repair ? [a.repair] : []), ...a.repairs.filter((r) => r.id !== a.repair?.id)].map((r) => ({ asset: a.name, issue: r.issue, priority: PRIORITY_LABEL[r.priority], stage: REPAIR_STAGES.find((s) => s.id === r.stage)?.label ?? r.stage, vendor: db.vendors.find((v) => v.id === r.vendorId)?.name ?? "In-house", opened: d(r.openedAt), closed: d(r.closedAt), cost: repairCost(r), _link: a.id, _linkKind: "asset" as const }))),
  },
  {
    id: "checkouts", group: "assets", icon: "logout", name: "Checked-out assets", desc: "Who has which asset and when it's due back.", dateKey: "due", groupBy: "state", sumKey: "count",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "holder", label: "Checked out to", filter: true }, { key: "out", label: "Checked out", kind: "date" }, { key: "due", label: "Due", kind: "date" }, { key: "state", label: "State", filter: true }, { key: "late", label: "Days overdue", kind: "num" }],
    rows: (db) => (db.assetItems ?? []).filter((a) => a.checkout).map((a) => { const left = daysUntil(a.checkout!.due); return { tag: a.tag, name: a.name, holder: holderName(a.checkout!.to, db), out: d(a.checkout!.at), due: d(a.checkout!.due), state: left < 0 ? "Overdue" : left <= 7 ? "Due soon" : "On loan", late: Math.max(0, -left), count: 1, _link: a.id, _linkKind: "asset" }; }),
  },
  {
    id: "warranty", group: "assets", icon: "shield", name: "Warranty expiry", desc: "Warranty end dates and what's expiring soon.", dateKey: "ends", groupBy: "state", sumKey: "cost",
    columns: [{ key: "tag", label: "Asset ID" }, { key: "name", label: "Name" }, { key: "provider", label: "Provider", filter: true }, { key: "ends", label: "Ends", kind: "date" }, { key: "left", label: "Days left", kind: "num" }, { key: "state", label: "State", filter: true }, { key: "cost", label: "Asset cost", kind: "money" }],
    rows: (db) => (db.assetItems ?? []).filter((a) => a.warrantyEnd && a.statusId !== "disposed").map((a) => { const left = daysUntil(a.warrantyEnd); return { tag: a.tag, name: a.name, provider: a.warrantyProvider || "—", ends: a.warrantyEnd, left, state: left < 0 ? "Expired" : left <= 30 ? "Expiring soon" : "Active", cost: a.cost, _link: a.id, _linkKind: "asset" }; }),
  },
];

export interface ReportFilters { q?: string; from?: string; to?: string; values?: Record<string, string> }
/** Applies search, date range and column filters. */
export function applyFilters(rep: Report, rows: Row[], f: ReportFilters): Row[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
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
