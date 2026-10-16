import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { addMonths, cancelMaintenance, logMaintenance, maintenanceBlock, progressMaintenance, scheduleMaintenance, today } from "../assetRegister";

function fresh() {
  const d = seedDB(); const a = d.assetItems?.find((x) => x.statusId === "available");
  if (!a) throw new Error("Missing available asset");
  return { d, a };
}
const plan = { name: "Safety inspection", type: "inspection" as const, instructions: "Check housing", due: today(), cost: 25, repeats: true };
describe("maintenance flow", () => {
  it("schedules a service and keeps plan and asset due dates aligned", () => {
    const { d, a } = fresh(); scheduleMaintenance(d, a.id, plan, 3);
    expect(a.plan?.due).toBe(today()); expect(a.nextMaintenance).toBe(today()); expect(a.maintenanceEveryMonths).toBe(3);
  });
  it("completion records actual cost and advances recurring service from completion", () => {
    const { d, a } = fresh(); scheduleMaintenance(d, a.id, plan, 3); progressMaintenance(d, a.id, "in_progress", "");
    logMaintenance(d, a.id, "Passed", 42, undefined, "2026-01-15");
    expect(a.maintenanceLog[0].cost).toBe(42); expect(a.nextMaintenance).toBe(addMonths("2026-01-15", 3)); expect(a.plan?.due).toBe(a.nextMaintenance); expect(a.service).toBeUndefined();
  });
  it("one-time completion clears the due date without changing asset status", () => {
    const { d, a } = fresh(); const status = a.statusId; scheduleMaintenance(d, a.id, { ...plan, repeats: false }, undefined);
    logMaintenance(d, a.id, "Passed", 0); expect(a.nextMaintenance).toBeUndefined(); expect(a.statusId).toBe(status);
  });
  it("blocks servicing checked-out assets", () => {
    const { d, a } = fresh(); a.checkout = { to: { kind: "site", site: "Denver depot" }, at: today(), due: today(), condition: "good" };
    expect(maintenanceBlock(a)).toContain("Check"); expect(() => logMaintenance(d, a.id, "Done", 0)).toThrow("Check");
  });
  it("does not replace open repairs with maintenance", () => {
    const { d, a } = fresh(); a.statusId = "in_repair"; expect(() => progressMaintenance(d, a.id, "in_progress", "")).toThrow("repair");
  });
  it("cancellation needs a reason and removes the schedule", () => {
    const { d, a } = fresh(); scheduleMaintenance(d, a.id, plan, 3);
    expect(() => cancelMaintenance(d, a.id, "")).toThrow(); cancelMaintenance(d, a.id, "No longer needed");
    expect(a.plan).toBeUndefined(); expect(a.nextMaintenance).toBeUndefined(); expect(a.history[0].note).toBe("No longer needed");
  });
  it("rejects invalid costs, intervals and future completion", () => {
    const { d, a } = fresh(); expect(() => scheduleMaintenance(d, a.id, plan, 0)).toThrow();
    expect(() => logMaintenance(d, a.id, "Done", -1)).toThrow(); expect(() => logMaintenance(d, a.id, "Done", 0, undefined, "2099-01-01")).toThrow();
  });
});