import { describe, expect, it } from "vitest";
import { DEFAULT_BENCHMARKS, groupInvoices, INVOICES_WITHOUT_PO, resolveBenchmarks, validBenchmark } from "../adoption";

describe("adoption benchmarks", () => {
  it("uses the four reference benchmarks", () => {
    expect(resolveBenchmarks()).toEqual({ po: 90, pobi: 85, spend: 75, logins: 70 });
  });
  it("allows each of the four targets to be customized", () => {
    expect(resolveBenchmarks({ po: 92, pobi: 88, spend: 80, logins: 72 })).toEqual({ po: 92, pobi: 88, spend: 80, logins: 72 });
  });
  it("preserves zero and fills missing targets", () => {
    expect(resolveBenchmarks({ logins: 0 })).toEqual({ ...DEFAULT_BENCHMARKS, logins: 0 });
  });
  it("rejects targets outside a valid percentage", () => {
    expect([-1, 101, NaN, Infinity].map(validBenchmark)).toEqual([false, false, false, false]);
    expect([0, 85.5, 100].map(validBenchmark)).toEqual([true, true, true]);
  });
});

describe("invoice grouping", () => {
  it("groups by supplier without changing totals or losing invoices", () => {
    const groups = groupInvoices(INVOICES_WITHOUT_PO, "supplier");
    expect(groups.find((g) => g.name === "Peak Office Co.")?.rows).toHaveLength(3);
    expect(groups.reduce((s, g) => s + g.total, 0)).toBeCloseTo(30262.89, 2);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(12);
  });
  it("groups only filtered invoices by requestor", () => {
    const groups = groupInvoices(INVOICES_WITHOUT_PO.filter((i) => i.department === "Operations"), "requester");
    expect(groups.find((g) => g.name === "Daniel Ortiz")?.total).toBe(6380);
    expect(groups.flatMap((g) => g.rows).every((i) => i.department === "Operations")).toBe(true);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(5);
  });
});