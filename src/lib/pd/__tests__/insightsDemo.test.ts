import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { demoInsightLedger } from "../insightsDemo";
import { buildInsight, emptyQuery } from "../insights";

describe("sample financial reports", () => {
  it("includes realistic, deterministic invoice values without changing requests", () => {
    const db = seedDB();
    const original = JSON.stringify(db);
    const ledger = demoInsightLedger(db);
    expect(ledger.invoices[0].amount).toBe(4317.84);
    expect(ledger.invoices).toHaveLength(96);
    expect(JSON.stringify(db)).toBe(original);
    expect(demoInsightLedger(db)).toEqual(ledger);
  });
  it("calculates a dated invoice report only from matching sample lines", () => {
    const db = seedDB();
    const ledger = demoInsightLedger(db);
    const q = { ...emptyQuery("invoices"), start: "2025-06-01", end: "2025-06-30" };
    const r = buildInsight(db, q, 3, "2026-11-06T00:00:00Z", ledger);
    expect(r.demo).toBe(true);
    expect(r.count).toBe(6);
    expect(r.total).toBe(ledger.invoices.slice(0, 6).reduce((s, r) => s + r.amount, 0));
    expect(r.groups).toHaveLength(1);
  });
  it("counts only open PO balances including partial invoicing", () => {
    const ledger = demoInsightLedger(seedDB());
    expect(ledger.orders[0].id).toBe("PO-DEMO-10084");
    expect(ledger.orders[1].amount).toBe(1425.6);
    expect(ledger.orders).toHaveLength(20);
  });
  it("filters suppliers case-insensitively and excludes future receipts", () => {
    const db = seedDB();
    const ledger = demoInsightLedger(db);
    const supplier = ledger.items[0].supplier;
    const r = buildInsight(
      db,
      { ...emptyQuery("items"), supplier: supplier.toLowerCase() },
      0,
      "2026-11-06T00:00:00Z",
      ledger,
    );
    expect(r.available).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.supplier === supplier && x.date <= "2026-11-06")).toBe(true);
  });
});
