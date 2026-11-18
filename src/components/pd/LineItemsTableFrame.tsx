import { useEffect, useRef, type ReactNode } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

export const needsVerticalLineScroll = (rowCount: number) => rowCount > 10;

/** Only pages with more than ten items need a bounded vertical viewport. */
export function LineItemsTableFrame({ children, rowCount }: { children: ReactNode; rowCount: number }) {
  const bounded = needsVerticalLineScroll(rowCount);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || bounded) return;
    let animation = 0;
    const update = () => {
      const table = frame.querySelector("table");
      const header = table?.querySelector("thead");
      if (!table || !header) return;
      const rect = table.getBoundingClientRect();
      let top = 0;
      // Horizontal overflow captures CSS sticky even when it never scrolls
      // vertically. Follow the outer page/panel instead on unbounded pages.
      for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowY;
        if (/auto|scroll|hidden|clip/.test(overflow)) {
          top = Math.max(top, parent.getBoundingClientRect().top + parent.clientTop);
        }
      }
      for (const element of document.querySelectorAll("header")) {
        const position = getComputedStyle(element).position;
        const box = element.getBoundingClientRect();
        if ((position === "sticky" || position === "fixed") && box.top <= top + 1 && box.bottom > top && box.right > rect.left && box.left < rect.right) {
          top = box.bottom;
        }
      }
      const offset = Math.max(0, Math.min(top - rect.top, rect.height - header.getBoundingClientRect().height));
      frame.style.setProperty("--pd-line-header-offset", `${offset}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      frame.style.removeProperty("--pd-line-header-offset");
    };
  }, [bounded, rowCount]);
  return (
    <ScrollAreaPrimitive.Root ref={frameRef} type="always" className="pd-line-table relative min-w-0 overflow-hidden rounded-lg border border-border/60 bg-surface">
      <ScrollAreaPrimitive.Viewport tabIndex={0} role="region" aria-label="Line items table" className={`pd-line-table-viewport ${bounded ? "pd-line-table-bounded" : ""} w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="horizontal" className="z-30 border-t-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />
      {bounded && <ScrollBar orientation="vertical" className="z-30 border-l-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />}
      {bounded && <ScrollAreaPrimitive.Corner className="bg-subtle" />}
    </ScrollAreaPrimitive.Root>
  );
}