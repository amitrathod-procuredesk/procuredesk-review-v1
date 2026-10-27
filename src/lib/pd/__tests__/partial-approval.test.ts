import { describe, expect, it } from "vitest";
import { viewStatus } from "@/lib/pd/engine";

const li = (p: object = {}) => ({ id: Math.random().toString(), ...p }) as never;

describe("partial line approval", () => {
  it("pending request with some lines approved reads Partially approved", () => {
    expect(viewStatus({ status: "pending", items: [li({ approved: { by: "u", at: "" } }), li()] })).toBe("part_approved");
  });
  it("unapproved lines are not declined — request stays pending until decided", () => {
    expect(viewStatus({ status: "pending", items: [li(), li()] })).toBe("pending");
  });
  it("all lines approved and request approved reads Approved", () => {
    expect(viewStatus({ status: "approved", items: [li({ approved: { by: "u", at: "" } })] })).toBe("approved");
  });
});
