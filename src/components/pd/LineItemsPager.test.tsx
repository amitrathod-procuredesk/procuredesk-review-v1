import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LineItemsPager } from "./LineItemsPager";

afterEach(cleanup);
const items = Array.from({ length: 26 }, (_, index) => index + 1);
function setup() {
  let visible: number[] = [];
  const ui = (rows: number[]) => <LineItemsPager items={rows}>{(slice) => { visible = slice; return null; }}</LineItemsPager>;
  const screen = render(ui(items));
  return { ...screen, visible: () => visible, ui };
}
describe("line-item pagination", () => {
  it("moves between disjoint pages without losing items", () => {
    const screen = setup();
    expect(screen.visible()).toEqual(items.slice(0, 10));
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    expect(screen.visible()).toEqual(items.slice(10, 20));
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    expect(screen.visible()).toEqual(items.slice(20));
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    expect(screen.visible()).toEqual(items.slice(20));
    fireEvent.click(screen.getByRole("button", { name: /Previous page/ }));
    expect(screen.visible()).toEqual(items.slice(10, 20));
  });
  it("applies the selected row count and returns to the first page", () => {
    const screen = setup();
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    for (const size of [5, 25, 50, 100, 10]) {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: String(size) } });
      expect(screen.visible()).toEqual(items.slice(0, size));
    }
  });
  it("clamps the page when deleting the last page and handles empty results", () => {
    const screen = setup();
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next page/ }));
    screen.rerender(screen.ui(items.slice(0, 20)));
    expect(screen.visible()).toEqual(items.slice(10, 20));
    screen.rerender(screen.ui([]));
    expect(screen.visible()).toEqual([]);
    screen.rerender(screen.ui(items));
    expect(screen.visible()).toEqual(items.slice(0, 10));
  });
});