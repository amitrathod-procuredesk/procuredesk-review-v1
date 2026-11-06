import { z } from "zod";
import { budgetAvailable, lineTotal } from "./engine";
import type { DB } from "./types";

export const insightQuerySchema = z.object({
  topic: z.enum(["invoices", "orders", "items", "budgets", "requests"]),
  group: z.enum(["month", "supplier", "user", "department", "category", "account", "item", "budget"]),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  supplier: z.string().max(120).nullable(), user: z.string().max(120).nullable(),
  department: z.string().max(120).nullable(), category: z.string().max(120).nullable(),
  account: z.string().max(120).nullable(),
});
export type InsightQuery = z.infer<typeof insightQuerySchema>;
export type InsightRow = { id: string; label: string; date: string; supplier: string; user: string; department: string; category: string; account: string; item: string; budget: string; amount: number; quantity: number; allocated?: number; remaining?: number; requestId?: string };
export type InsightReport = { query: InsightQuery; title: string; currency: string; rows: InsightRow[]; groups: { label: string; amount: number }[]; total: number; count: number; notes: string[]; available: boolean; generatedAt: string; version: number };
export type InsightPart = { type: "text"; text: string } | { type: "report"; report: InsightReport };
export type InsightMessage = { id: string; role: "user" | "assistant"; parts: InsightPart[] };
export const TOPICS = { invoices: "Invoiced spend", orders: "Committed purchase orders", items: "Purchased items", budgets: "Budget consumption", requests: "Submitted request value" };
export const emptyQuery = (topic: InsightQuery["topic"]): InsightQuery => ({ topic, group: topic === "budgets" ? "budget" : "month", start: null, end: null, supplier: null, user: null, department: null, category: null, account: null });

export function buildInsight(db: DB, query: InsightQuery, version = 0, at = new Date().toISOString()): InsightReport {
  const notes: string[] = [];
  const unavailable = ["invoices", "orders", "items"].includes(query.topic);
  const name = (id: string | undefined, list: { id: string; name: string }[]) => list.find(x => x.id === id)?.name ?? "Unassigned";
  let rows: InsightRow[] = [];
  if (unavailable) notes.push(`${TOPICS[query.topic]} is unavailable: this workspace has no ${query.topic === "invoices" ? "invoice ledger" : query.topic === "orders" ? "purchase order ledger with open balances" : "purchase or receipt ledger"}. Request values are not a substitute for these records.`);
  else if (query.topic === "budgets") {
    rows = db.budgets.map(b => ({ id: b.id, label: b.name, budget: b.name, date: "", supplier: "Unassigned", user: "Unassigned", department: name(b.departmentId, db.departments), category: b.category, account: "Unassigned", item: "", amount: b.total - budgetAvailable(b.id, db), allocated: b.total, remaining: budgetAvailable(b.id, db), quantity: 0 }));
    notes.push("Current budget commitments, not paid spend. Includes opening commitments and qualifying requests, using the same calculation as Budget utilization.");
    if (query.start || query.end) notes.push("Budgets are a current snapshot; a historical consumption ledger is not available. Date filters do not change this snapshot.");
    if (query.supplier || query.user || query.account || ["supplier", "user", "account", "month", "item"].includes(query.group)) notes.push("Budget commitments have no supplier, user, GL account or monthly attribution. Choose budget, department or category.");
  } else {
    rows = db.requests.filter(r => ["pending", "approved", "ordered", "part_ordered", "partial", "received", "closed"].includes(r.status)).flatMap(r => r.items.filter(l => !l.declined && l.fulfillment !== "inventory").map(l => ({ id: `${r.id}:${l.id}`, label: l.name || l.description, date: (r.submittedAt ?? r.createdAt).slice(0,10), supplier: name(l.vendorId, db.vendors), user: name(r.requesterId, db.users), department: name(r.departmentId, db.departments), category: l.category, account: l.account, item: l.name || l.description, budget: name(l.budgetId ?? r.budgetId, db.budgets), amount: lineTotal(l), quantity: l.qty, requestId: r.id })));
    notes.push("Submitted request line values including tax and shipping, not invoiced or paid spend. Declined and internal-stock lines excluded. Dates use submission, falling back to creation.");
  }
  const unsupported = query.topic === "budgets" && (!!query.supplier || !!query.user || !!query.account || ["supplier", "user", "account", "month", "item"].includes(query.group));
  rows = rows.filter(r => (query.topic === "budgets" || ((!query.start || r.date >= query.start) && (!query.end || r.date <= query.end))) && (["supplier", "user", "department", "category", "account"] as const).every(k => !query[k] || r[k].toLowerCase() === query[k]?.toLowerCase()));
  const groups = new Map<string, number>();
  rows.forEach(r => { const key = query.group === "month" ? r.date.slice(0,7) : r[query.group]; groups.set(key, (groups.get(key) ?? 0) + r.amount); });
  return { query, title: TOPICS[query.topic], currency: db.org.currency || "USD", rows: unsupported ? [] : rows, groups: unsupported ? [] : [...groups].map(([label, amount]) => ({ label, amount })).sort((a,b) => query.group === "month" ? a.label.localeCompare(b.label) : b.amount-a.amount), total: unsupported ? 0 : rows.reduce((s,r) => s+r.amount,0), count: unsupported ? 0 : rows.length, available: !unavailable && !unsupported, notes, generatedAt: at, version };
}