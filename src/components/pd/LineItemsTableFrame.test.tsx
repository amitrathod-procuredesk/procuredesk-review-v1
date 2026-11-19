import { describe, expect, it } from "vitest";
import { needsVerticalLineScroll } from "./LineItemsTableFrame";
import { LineItemsTableFrame } from "./LineItemsTableFrame";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";

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

  it("tracks outer scrolling for a ten-item page and uses native headings when bounded", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (next: FrameRequestCallback) => { callback = next; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const content = <table><thead><tr><th>Quantity</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>;
    const view = render(<div style={{ overflowY: "auto" }}><LineItemsTableFrame rowCount={10}>{content}</LineItemsTableFrame></div>);
    const frame = view.container.querySelector<HTMLDivElement>(".pd-line-table");
    const table = frame?.querySelector("table");
    const header = table?.querySelector("thead");
    if (!frame || !table || !header) throw new Error("Missing table");
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({ top: -120, height: 800, left: 0, right: 980 } as DOMRect);
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ height: 36 } as DOMRect);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ top: -120, bottom: 900 } as DOMRect);
    const panel = frame.parentElement;
    if (!panel) throw new Error("Missing scroll panel");
    Object.defineProperty(panel, "clientHeight", { value: 600 });
    act(() => { window.dispatchEvent(new Event("scroll")); callback?.(0); });
    expect(frame.style.getPropertyValue("--pd-line-header-offset")).toBe("120px");
    expect(frame.style.getPropertyValue("--pd-line-scrollbar-offset")).toBe("-300px");
    view.rerender(<div style={{ overflowY: "auto" }}><LineItemsTableFrame rowCount={11}>{content}</LineItemsTableFrame></div>);
    act(() => { callback?.(0); });
    expect(frame.style.getPropertyValue("--pd-line-header-offset")).toBe("0px");
    view.unmount();
    vi.unstubAllGlobals();
  });
});