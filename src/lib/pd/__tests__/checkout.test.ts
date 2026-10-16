import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { addDays, checkoutBlock, checkoutIssues, today } from "../assetRegister";

describe("check-out rules", () => {
  it("blocks categories that don't allow check-out", () => {
    const d = seedDB(); const s = d.assets!;
    const a = { ...d.assetItems![0], categoryId: "cat-fur", statusId: "available", repair: undefined };
    expect(checkoutBlock(a, s)).toMatch(/can't be checked out/);
  });
  it("blocks assets already checked out", () => {
    const d = seedDB();
    expect(checkoutBlock({ ...d.assetItems![0], statusId: "checked_out" }, d.assets!)).toBe("Already checked out");
  });
  it("rejects loans longer than the max days", () => {
    const s = seedDB().assets!;
    const e = checkoutIssues({ holder: { kind: "site", site: "Denver depot" }, due: addDays(today(), s.checkout.maxDays + 2), ack: true }, s);
    expect(e.due).toBeDefined();
  });
  it("requires acknowledgement when the setting is on", () => {
    const s = seedDB().assets!;
    s.checkout.requireAcknowledgement = true;
    expect(checkoutIssues({ holder: { kind: "site", site: "Denver depot" }, due: addDays(today(), 3), ack: false }, s).ack).toBeDefined();
  });
});
