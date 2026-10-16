import { describe, expect, it } from "vitest";
import { seedDB as seed } from "../seed";
import { applyFilters, REPORTS } from "../reports";

const spend = REPORTS.find((r) => r.id === "spend-supplier")!;

describe("reports", () => {
  it("spend excludes stock-issued lines and draft requests", () => {
    const db = seed();
    const r = db.requests[0];
    r.status = "approved";
    r.items[0].fulfillment = "inventory";
    const rows = spend.rows(db).filter((x) => x.request === r.id);
    expect(rows.length).toBe(r.items.length - 1);
    r.status = "draft";
    expect(spend.rows(db).some((x) => x.request === r.id)).toBe(false);
  });
  it("date range keeps only rows inside it", () => {
    const rows = [{ date: "2026-01-05" }, { date: "2026-03-01" }];
    expect(applyFilters(spend, rows, { from: "2026-02-01", to: "2026-12-31" })).toEqual([{ date: "2026-03-01" }]);
  });
});

describe("warranty report", () => {
  const w = REPORTS.find((r) => r.id === "warranty")!;
  const rows = [{ left: 10 }, { left: 80 }, { left: 200 }, { left: -5 }];
  it("defaults to warranties expiring within 90 days", () => {
    expect(applyFilters(w, rows, {})).toEqual([{ left: 10 }, { left: 80 }]);
  });
  it("can show already expired warranties", () => {
    expect(applyFilters(w, rows, { window: "expired" })).toEqual([{ left: -5 }]);
  });
});
