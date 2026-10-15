import { describe, expect, it } from "vitest";
import { defaultAssetSettings, depreciationSchedule, formatAssetId, numberingIssues } from "../assets";

const d = new Date("2026-10-15");

describe("asset numbering", () => {
  it("joins prefix, category code, year and padded sequence", () => {
    const s = defaultAssetSettings();
    expect(formatAssetId(s.numbering, s.categories[0], d)).toBe("AST-IT-26-01248");
  });
  it("category prefix override replaces the global prefix", () => {
    const n = { ...defaultAssetSettings().numbering, separator: "/" as const, yearFormat: "YYYY" as const };
    expect(formatAssetId(n, { code: "VEH", prefixOverride: "FLT" }, d, 7)).toBe("FLT/VEH/2026/00007");
  });
  it("rejects a starting number longer than the sequence", () => {
    const n = { ...defaultAssetSettings().numbering, seqLength: 3, startAt: 1000 };
    expect(numberingIssues(n).startAt).toBeDefined();
  });
});

describe("depreciation", () => {
  it("straight-line spreads cost minus salvage evenly", () => {
    const s = depreciationSchedule(10000, { method: "straight_line", usefulLifeMonths: 60, salvagePct: 10 });
    expect(s).toHaveLength(5);
    expect(s[0].expense).toBe(1800);
    expect(s[4].book).toBe(1000);
  });
  it("declining balance never goes below salvage", () => {
    const s = depreciationSchedule(30000, { method: "declining_balance", usefulLifeMonths: 96, salvagePct: 15 });
    expect(s.at(-1)!.book).toBe(4500);
    expect(s.every((r) => r.book >= 4500)).toBe(true);
  });
});

import { issueAssetId } from "../assets";
describe("category number ranges", () => {
  it("issues from the range, then falls back to the company sequence when full", () => {
    const s = defaultAssetSettings();
    const veh = s.categories.find((c) => c.id === "cat-veh")!;
    const d = new Date(2026, 3, 1);
    s.ranges = [{ id: "r", categoryId: "cat-veh", prefix: "FLT", start: 1, end: 2, next: 2 }];
    expect(issueAssetId(s, veh, d)).toBe("FLT-VEH-26-00002");
    expect(issueAssetId(s, veh, d)).toBe("AST-VEH-26-01248");
    expect(s.numbering.nextSeq).toBe(1249);
  });
});
