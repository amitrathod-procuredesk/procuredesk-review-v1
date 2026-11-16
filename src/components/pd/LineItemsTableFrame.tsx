import type { ReactNode } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

/** One bounded scrolling surface keeps both axes and sticky cells in sync. */
export function LineItemsTableFrame({ children }: { children: ReactNode }) {
  return (
    <ScrollAreaPrimitive.Root type="always" className="pd-line-table relative min-w-0 overflow-hidden rounded-lg border border-border/60 bg-surface">
      <ScrollAreaPrimitive.Viewport tabIndex={0} role="region" aria-label="Line items table" className="pd-line-table-viewport w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="horizontal" className="z-30 border-t-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />
      <ScrollBar orientation="vertical" className="z-30 border-l-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />
      <ScrollAreaPrimitive.Corner className="bg-subtle" />
    </ScrollAreaPrimitive.Root>
  );
}