/**
 * Adoption & compliance figures for the Insights › Adoption dashboard.
 * ProcureDesk does not ingest AP invoices or login events yet, so this module holds a
 * fixed sample ledger (12 months ending Oct 2026) that mirrors the reference prototype.
 */

export type MetricId = "po" | "pobi" | "spend" | "logins";
export type Dim = "department" | "gl";
export type Window = "month" | "quarter" | "year";

export const MONTHS = ["Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26", "Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26"];

export interface Metric {
  id: MetricId;
  label: string;
  help: string;
  benchmark: number;
  /** Monthly rate (%) and sample size behind it. */
  series: { v: number; n: number }[];
  unit: string;
}

const s = (vals: number[], ns: number[]) => vals.map((v, i) => ({ v, n: ns[i] }));

export const METRICS: Metric[] = [
  { id: "po", label: "PO compliance", unit: "invoices", benchmark: 90, help: "Share of supplier invoices that match a purchase order raised in ProcureDesk.",
    series: s([80, 81, 83, 84, 82, 85, 83, 84, 82, 83, 81, 79], [52, 48, 61, 55, 58, 60, 57, 63, 59, 62, 58, 57]) },
  { id: "pobi", label: "PO before invoice", unit: "POs", benchmark: 95, help: "Share of POs approved before the supplier's invoice date.",
    series: s([89, 90, 92, 91, 93, 90, 92, 91, 92, 90, 92, 91], [42, 39, 51, 46, 48, 51, 47, 53, 48, 51, 47, 45]) },
  { id: "spend", label: "Spend through ProcureDesk", unit: "invoices", benchmark: 85, help: "Share of addressable supplier spend that went through a ProcureDesk request.",
    series: s([64, 66, 67, 69, 70, 71, 72, 73, 74, 73, 75, 76], [182, 175, 210, 196, 204, 215, 199, 221, 208, 217, 205, 212]) },
  { id: "logins", label: "Login adoption", unit: "people", benchmark: 75, help: "Share of people with a ProcureDesk seat who signed in during the month.",
    series: s([58, 60, 61, 63, 65, 64, 66, 68, 67, 69, 70, 72], [57, 57, 57, 57, 57, 57, 57, 57, 57, 57, 57, 57]) },
];

export const WINDOWS: { id: Window; label: string; months: number; caption: string }[] = [
  { id: "month", label: "Month", months: 1, caption: "Oct 2026 vs Sep 2026" },
  { id: "quarter", label: "Quarter", months: 3, caption: "Aug–Oct 2026 vs May–Jul 2026" },
  { id: "year", label: "12 months", months: 12, caption: "Nov 2025 – Oct 2026" },
];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Value for the selected window and its change vs the previous window of equal length (null when not available). */
export function windowValue(m: Metric, w: Window) {
  const k = WINDOWS.find((x) => x.id === w)!.months;
  const vals = m.series.map((p) => p.v);
  const cur = avg(vals.slice(-k));
  const prev = vals.length >= 2 * k ? avg(vals.slice(-2 * k, -k)) : null;
  return { value: Math.round(cur), delta: prev === null ? null : Math.round(cur) - Math.round(prev), sample: m.series.slice(-k).reduce((t, p) => t + p.n, 0) };
}

/** Breakdown rows (rate %, sample size) per metric and dimension. */
export const BREAKDOWN: Record<Dim, { name: string; values: Record<MetricId, number>; n: number }[]> = {
  department: [
    { name: "Engineering", values: { po: 86, pobi: 94, spend: 81, logins: 84 }, n: 214 },
    { name: "IT", values: { po: 91, pobi: 96, spend: 88, logins: 90 }, n: 168 },
    { name: "Finance", values: { po: 88, pobi: 93, spend: 79, logins: 92 }, n: 96 },
    { name: "Operations", values: { po: 68, pobi: 84, spend: 57, logins: 55 }, n: 191 },
    { name: "Marketing", values: { po: 64, pobi: 86, spend: 52, logins: 48 }, n: 87 },
  ],
  gl: [
    { name: "IT Equipment Expense", values: { po: 89, pobi: 95, spend: 84, logins: 82 }, n: 233 },
    { name: "Software Subscriptions", values: { po: 72, pobi: 87, spend: 61, logins: 70 }, n: 142 },
    { name: "Office Supplies Expense", values: { po: 84, pobi: 92, spend: 77, logins: 66 }, n: 118 },
    { name: "Facilities Expense", values: { po: 70, pobi: 88, spend: 63, logins: 58 }, n: 151 },
    { name: "Consulting Expense", values: { po: 61, pobi: 81, spend: 48, logins: 62 }, n: 72 },
  ],
};

export interface Invoice { id: string; number: string; supplier: string; date: string; amount: number; department: string; gl: string; requester: string }

const inv = (i: number, supplier: string, date: string, amount: number, department: string, gl: string, requester: string): Invoice =>
  ({ id: `inv_${i}`, number: `INV-${20410 + i * 7}`, supplier, date, amount, department, gl, requester });

export const INVOICES_WITHOUT_PO: Invoice[] = [
  inv(1, "Peak Office Co.", "2026-10-27", 4820, "Operations", "Facilities Expense", "Daniel Ortiz"),
  inv(2, "Nova Distributors", "2026-10-24", 3150.4, "Engineering", "IT Equipment Expense", "Jordan Lee"),
  inv(3, "Brightline Consulting", "2026-10-22", 2789.99, "Marketing", "Consulting Expense", "Sofia Ramos"),
  inv(4, "Amazon", "2026-10-21", 1245, "Operations", "Office Supplies Expense", "Sofia Ramos"),
  inv(5, "Figma", "2026-10-18", 6420.75, "Marketing", "Software Subscriptions", "Rachel Kim"),
  inv(6, "Peak Office Co.", "2026-10-15", 980.25, "Operations", "Facilities Expense", "Lena Walsh"),
  inv(7, "Brightline Consulting", "2026-10-13", 2310, "Finance", "Consulting Expense", "Mark Knue"),
  inv(8, "Nova Distributors", "2026-10-10", 1875.5, "IT", "IT Equipment Expense", "Priya Shah"),
  inv(9, "Notion Labs", "2026-10-08", 3399, "Engineering", "Software Subscriptions", "Amit Verma"),
  inv(10, "Amazon", "2026-10-06", 640, "Marketing", "Office Supplies Expense", "Sofia Ramos"),
  inv(11, "Peak Office Co.", "2026-10-03", 1560, "Operations", "Facilities Expense", "Daniel Ortiz"),
  inv(12, "Brightline Consulting", "2026-10-01", 1072, "Operations", "Consulting Expense", "Rachel Kim"),
];

export const invoicesFor = (dim?: Dim, name?: string) =>
  INVOICES_WITHOUT_PO.filter((i) => !dim || !name || (dim === "department" ? i.department === name : i.gl === name));

/** Severity tier relative to target: on target, within 10 pts, or further below. */
export const tier = (value: number, target: number): "ok" | "warn" | "bad" => (value >= target ? "ok" : value >= target - 10 ? "warn" : "bad");
