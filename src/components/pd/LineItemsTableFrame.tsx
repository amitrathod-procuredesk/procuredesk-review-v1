import type { ReactNode } from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

export const needsVerticalLineScroll = (rowCount: number) => rowCount > 10;

/** Only pages with more than ten items need a bounded vertical viewport. */
export function LineItemsTableFrame({ children, rowCount }: { children: ReactNode; rowCount: number }) {
  const bounded = needsVerticalLineScroll(rowCount);
  return (
    <ScrollAreaPrimitive.Root type="always" className="pd-line-table relative min-w-0 overflow-hidden rounded-lg border border-border/60 bg-surface">
      <ScrollAreaPrimitive.Viewport tabIndex={0} role="region" aria-label="Line items table" className={`pd-line-table-viewport ${bounded ? "pd-line-table-bounded" : ""} w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}>
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="horizontal" className="z-30 border-t-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />
      {bounded && <ScrollBar orientation="vertical" className="z-30 border-l-border bg-subtle [&>div]:bg-muted-foreground/40 hover:[&>div]:bg-muted-foreground/60" />}
      {bounded && <ScrollAreaPrimitive.Corner className="bg-subtle" />}
    </ScrollAreaPrimitive.Root>
  );
}