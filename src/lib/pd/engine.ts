import type { DB, LineItem, PRequest, Stage } from "./types";

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const nowISO = () => new Date().toISOString();

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (v: number) => fmt.format(Math.round(v * 100) / 100);

export const lineSubtotal = (l: LineItem) => (l.qty || 0) * (l.unitPrice || 0);
export const lineTotal = (l: LineItem) => lineSubtotal(l) + (l.tax || 0) + (l.shipping || 0);

export function totals(r: PRequest) {
  let subtotal = 0,
    tax = 0,
    shipping = 0;
  for (const l of r.items) {
    if (l.declined || l.fulfillment === "inventory") continue;
    subtotal += lineSubtotal(l);
    tax += l.tax || 0;
    shipping += l.shipping || 0;
  }
  return { subtotal, tax, shipping, total: subtotal + tax + shipping };
}

export function supplierBreakdown(r: PRequest, db: DB) {
  const map = new Map<string, { vendorId: string; name: string; amount: number; lines: number }>();
  for (const l of r.items) {
    if (l.declined || l.fulfillment === "inventory") continue;
    const v = db.vendors.find((x) => x.id === l.vendorId);
    const key = l.vendorId || "none";
    const cur = map.get(key) ?? { vendorId: key, name: v?.name ?? "No supplier", amount: 0, lines: 0 };
    cur.amount += lineTotal(l);
    cur.lines += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

const COMMITTING = new Set(["approved", "ordered", "part_ordered", "order_deleted", "partial", "received"]);

export function budgetStatus(r: PRequest, db: DB) {
  const b = db.budgets.find((x) => x.id === r.budgetId);
  if (!b) return null;
  const others = db.requests
    .filter((o) => o.id !== r.id && o.budgetId === b.id && COMMITTING.has(o.status))
    .reduce((s, o) => s + totals(o).total, 0);
  const available = b.total - b.committed - others;
  const request = totals(r).total;
  const remaining = available - request;
  return { budget: b, available, request, remaining, over: remaining < 0, utilization: (b.total - available) / b.total };
}

export function budgetAvailable(budgetId: string, db: DB) {
  const b = db.budgets.find((x) => x.id === budgetId);
  if (!b) return 0;
  const used = db.requests
    .filter((o) => o.budgetId === b.id && COMMITTING.has(o.status))
    .reduce((s, o) => s + totals(o).total, 0);
  return b.total - b.committed - used;
}

export function categories(r: PRequest) {
  return [...new Set(r.items.map((i) => i.category).filter(Boolean))];
}

/** Builds the approval route from admin-configured rules. Never hardcoded. */
export function computeRoute(r: PRequest, db: DB): Stage[] {
  const amount = totals(r).total;
  const cats = new Set(categories(r));
  const stages: Stage[] = db.rules
    .filter((rule) => rule.enabled)
    .filter((rule) => amount >= rule.minAmount && (!rule.category || cats.has(rule.category)))
    .sort((a, b) => a.order - b.order)
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      mode: rule.mode,
      reason: [
        rule.minAmount > 0 ? `Total ≥ ${money(rule.minAmount)}` : null,
        rule.category ? `Contains ${rule.category}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Always required",
      approvals: rule.approverIds
        .filter((id) => id !== r.requesterId)
        .map((userId) => ({ userId, status: "waiting" as const })),
    }))
    .filter((s) => s.approvals.length > 0);
  if (stages.length === 0) {
    const dept = db.departments.find((d) => d.id === r.departmentId);
    const mgr = dept?.managerId ?? db.users.find((u) => u.role === "approver")?.id;
    if (mgr)
      stages.push({
        id: "manager",
        name: "Manager approval",
        mode: "all",
        reason: "Default approver for the department",
        approvals: [{ userId: mgr, status: "waiting" }],
      });
  }
  return stages;
}

export const stageComplete = (s: Stage) =>
  s.mode === "all" ? s.approvals.every((a) => a.status === "approved") : s.approvals.some((a) => a.status === "approved");

export function currentStageIndex(r: PRequest) {
  if (r.status !== "pending") return -1;
  return r.route.findIndex((s) => !stageComplete(s));
}

export function isPendingFor(r: PRequest, userId: string) {
  const i = currentStageIndex(r);
  if (i < 0) return false;
  return r.route[i].approvals.some((a) => a.userId === userId && a.status === "pending");
}

export function findDuplicates(r: PRequest, db: DB) {
  const words = new Set(
    r.items
      .flatMap((i) => i.description.toLowerCase().split(/[^a-z0-9]+/))
      .filter((w) => w.length > 3 && !["with", "inch", "panel", "each"].includes(w)),
  );
  if (!words.size) return [];
  const cutoff = Date.now() - db.policies.duplicateWindowDays * 86400000;
  return db.requests.filter(
    (o) =>
      o.id !== r.id &&
      !["draft", "cancelled", "rejected", "closed"].includes(o.status) &&
      new Date(o.submittedAt ?? o.createdAt).getTime() > cutoff &&
      o.items.some((i) => i.description.toLowerCase().split(/[^a-z0-9]+/).some((w) => words.has(w))),
  );
}

export type CheckLevel = "ok" | "warn" | "error";
export interface Check {
  id: string;
  level: CheckLevel;
  title: string;
  detail?: string;
  action?: "budget" | "exception" | "attach" | "edit" | "duplicate";
}

export function runChecks(r: PRequest, db: DB): Check[] {
  const out: Check[] = [];
  const t = totals(r).total;
  const missing: string[] = [];
  if (!r.title.trim()) missing.push("title");
  if (!r.departmentId) missing.push("department");
  if (!r.requiredBy) missing.push("required date");
  if (!r.budgetId) missing.push("budget");
  if (r.items.length === 0) missing.push("at least one item");
  r.items.forEach((l, i) => {
    if (!l.description.trim()) missing.push(`line ${i + 1} description`);
    if (!l.vendorId) missing.push(`line ${i + 1} supplier`);
    if (!(l.unitPrice > 0)) missing.push(`line ${i + 1} price`);
    if (!(l.qty > 0)) missing.push(`line ${i + 1} quantity`);
  });
  out.push(
    missing.length
      ? { id: "req", level: "error", title: "Required information missing", detail: `Add ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}.`, action: "edit" }
      : { id: "req", level: "ok", title: "Required information complete" },
  );

  const vendors = [...new Set(r.items.map((l) => l.vendorId).filter(Boolean))].map((id) => db.vendors.find((v) => v.id === id)!);
  const unverified = vendors.filter((v) => v && !v.verified);
  const nonPreferred = vendors.filter((v) => v && !v.preferred);
  if (vendors.length) {
    if (unverified.length)
      out.push({ id: "vendor", level: "error", title: "Supplier not verified", detail: `${unverified.map((v) => v.name).join(", ")} must be verified by procurement.`, action: "edit" });
    else if (nonPreferred.length && db.policies.warnNonPreferredVendor)
      out.push({ id: "vendor", level: "warn", title: "Non-preferred supplier", detail: `${nonPreferred.map((v) => v.name).join(", ")} is not on the preferred list. Approvers will see this.` });
    else out.push({ id: "vendor", level: "ok", title: vendors.length > 1 ? `${vendors.length} suppliers verified` : "Supplier verified" });
  }

  if (r.items.length) {
    const cat = r.items.filter((l) => l.catalogId).length;
    out.push(
      cat === r.items.length
        ? { id: "catalog", level: "ok", title: "All items from catalog" }
        : cat > 0
          ? { id: "catalog", level: "ok", title: `${cat} of ${r.items.length} items from catalog`, detail: "Non-catalog items are reviewed by procurement." }
          : { id: "catalog", level: "warn", title: "Non-catalog purchase", detail: "No items match your company catalog. Procurement may suggest alternatives." },
    );
  }

  if (t >= db.policies.quoteThreshold && !r.attachments.some((a) => a.kind === "quote"))
    out.push({ id: "quote", level: "warn", title: `Quote required over ${money(db.policies.quoteThreshold)}`, detail: "Attach a supplier quote before approval.", action: "attach" });
  else if (t >= db.policies.quoteThreshold) out.push({ id: "quote", level: "ok", title: "Supplier quote attached" });

  const b = budgetStatus(r, db);
  if (b) {
    if (b.over && r.exceptionRequested)
      out.push({ id: "budget", level: "warn", title: `Budget exception requested`, detail: `Over ${b.budget.name} by ${money(-b.remaining)}. Approvers will decide.` });
    else if (b.over)
      out.push({ id: "budget", level: "error", title: `Over budget by ${money(-b.remaining)}`, detail: `${b.budget.name} has ${money(Math.max(0, b.available))} available. Choose another budget, request an exception, or edit the request.`, action: "exception" });
    else out.push({ id: "budget", level: "ok", title: "Within budget", detail: `${money(b.remaining)} remains in ${b.budget.name} after this request.` });
  }


  return out;
}

export const canSubmit = (checks: Check[]) => !checks.some((c) => c.level === "error");

export function smartDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function smartTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending approval",
  changes: "Sent to requestor",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  ordered: "Order created",
  part_ordered: "Partially ordered",
  order_deleted: "Order deleted",
  part_approved: "Partially approved",
  partial: "Partially received",
  received: "Received",
  closed: "Closed",
};

/** Status as shown to users: an approved request with approver-declined lines reads "Partially approved". */
export type ViewStatus = Status | "part_approved";
export const viewStatus = (r: Pick<PRequest, "status" | "items">): ViewStatus =>
  r.status === "approved" && r.items.some((i) => i.declined) ? "part_approved" : r.status;
