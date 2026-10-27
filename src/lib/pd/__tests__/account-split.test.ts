import { describe, expect, it } from "vitest";
import { splitError } from "@/components/pd/AccountSplit";

describe("account split rules", () => {
  it("accepts two accounts totalling 100%", () => {
    expect(splitError([{ account: "A", percent: 60 }, { account: "B", percent: 40 }])).toBeNull();
  });
  it("rejects shares not totalling 100%", () => {
    expect(splitError([{ account: "A", percent: 60 }, { account: "B", percent: 30 }])).toMatch(/100%/);
  });
  it("requires at least two accounts", () => {
    expect(splitError([{ account: "A", percent: 100 }])).not.toBeNull();
  });
  it("rejects duplicate accounts", () => {
    expect(splitError([{ account: "A", percent: 50 }, { account: "A", percent: 50 }])).not.toBeNull();
  });
});
