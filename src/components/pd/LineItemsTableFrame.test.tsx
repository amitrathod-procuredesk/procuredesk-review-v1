import { describe, expect, it } from "vitest";
import { needsVerticalLineScroll } from "./LineItemsTableFrame";

describe("line-item vertical scrolling", () => {
  it("does not bound pages with ten or fewer visible items", () => {
    for (const count of [0, 1, 5, 9, 10]) {
      expect(needsVerticalLineScroll(count)).toBe(false);
    }
  });
  it("bounds pages only once they contain more than ten items", () => {
    for (const count of [11, 25, 50, 100]) {
      expect(needsVerticalLineScroll(count)).toBe(true);
    }
  });
});