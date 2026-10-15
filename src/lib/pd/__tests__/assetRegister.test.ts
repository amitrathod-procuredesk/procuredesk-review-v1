import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { activationIssues, blankAsset, checkIn, checkOut, completeRepair, moveRepair, openRepair, registerAsset } from "../assetRegister";

const fresh = () => { const d = seedDB(); return { d, s: d.assets! }; };

describe("asset register", () => {
  it("registering issues the next ID and bumps the sequence", () => {
    const { d, s } = fresh();
    const a = { ...blankAsset(s, "cat-it"), name: "Laptop", identifier: "SN1", cost: 1500, statusId: "available" };
    const before = s.numbering.nextSeq;
    const tag = registerAsset(d, a);
    expect(tag).toMatch(/^AST-IT-\d{2}-01248$/);
    expect(s.numbering.nextSeq).toBe(before + 1);
  });
  it("a checked-out asset needs a return date within the max loan", () => {
    const { s } = fresh();
    const a = { ...blankAsset(s, "cat-it"), name: "X", identifier: "S", cost: 1, statusId: "checked_out", checkout: { to: { kind: "user" as const, userId: "u_amit" }, at: "", due: "2099-01-01", condition: "good" as const } };
    expect(activationIssues(a, s).checkoutDue).toBeDefined();
  });
  it("check-out then check-in returns the asset to available", () => {
    const { d } = fresh();
    const a = d.assetItems!.find((x) => x.statusId === "available")!;
    checkOut(d, a.id, { kind: "site", site: "Denver depot" }, "2099-01-01", "good");
    expect(a.statusId).toBe("checked_out");
    checkIn(d, a.id, "good", "available");
    expect(a.statusId).toBe("available");
    expect(a.checkout).toBeUndefined();
  });
  it("repair cycle: at vendor sets status, completing returns to service", () => {
    const { d } = fresh();
    const a = d.assetItems!.find((x) => x.statusId === "available")!;
    openRepair(d, a.id, "Broken", "high");
    expect(a.statusId).toBe("in_repair");
    moveRepair(d, a.id, "at_vendor", undefined, "", { vendorId: "v_cdw" });
    expect(a.statusId).toBe("at_vendor");
    moveRepair(d, a.id, "quality_check");
    expect(a.statusId).toBe("in_repair");
    completeRepair(d, a.id, "available", "Fixed");
    expect(a.statusId).toBe("available");
    expect(a.repair).toBeUndefined();
    expect(a.repairs).toHaveLength(1);
  });
});
