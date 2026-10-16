import { describe, expect, it } from "vitest";
import { activationIssues, blankAsset } from "../assetRegister";
import { seedDB } from "../seed";

const s = seedDB().assets!;
const base = () => ({ ...blankAsset(s), name: "Van", identifier: "X1", site: "Denver depot", statusId: "available" });

describe("leased assets", () => {
  it("need a leasing company but no purchase price", () => {
    const e = activationIssues({ ...base(), ownership: "leased", lease: { company: "", type: "", monthly: 0, buyout: 0 }, cost: 0 }, s);
    expect(e.leaseCompany).toBeDefined();
    expect(e.cost).toBeUndefined();
  });
  it("owned assets still need a purchase price", () => {
    expect(activationIssues({ ...base(), ownership: "owned", cost: 0 }, s).cost).toBeDefined();
  });
});
