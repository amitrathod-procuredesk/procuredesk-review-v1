import { describe, expect, it } from "vitest";
import { seedDB } from "../seed";
import { budgetAllocation, runChecks } from "../engine";

const draft = () => { const db = seedDB(); const r = db.requests.find((x) => x.id === "REQ-80000166")!; return { db, r }; };

describe("budget control", () => {
  it("header level charges every purchased line to the request budget", () => {
    const { db, r } = draft();
    const a = budgetAllocation(r, db);
    expect([...a.keys()]).toEqual([r.budgetId]);
  });
  it("line level splits spend across each line's budget", () => {
    const { db, r } = draft();
    db.org.budgetLevel = "line";
    r.items[1].budgetId = "bud_office";
    const a = budgetAllocation(r, db);
    expect(a.get("bud_office")?.lines).toBe(1);
    expect(a.size).toBe(2);
  });
  it("line level requires a budget on each purchased line", () => {
    const { db, r } = draft();
    db.org.budgetLevel = "line";
    r.budgetId = undefined;
    expect(runChecks(r, db).find((c) => c.id === "req")?.detail).toMatch(/line 1 budget/);
  });
});
