import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "./form";

/** Presentation-only paging; selection and totals still use the complete request. */
export function LineItemsPager<T>({ items, label = "Line items", children }: {
  items: T[];
  label?: string;
  children: (items: T[]) => ReactNode;
}) {
  const [size, setSize] = useState(10);
  const [requestedPage, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(requestedPage, pages);
  const start = (page - 1) * size;
  useEffect(() => { setPage((current) => Math.min(current, pages)); }, [pages]);

  return <>
    <div key={`${page}-${size}`}>{children(items.slice(start, start + size))}</div>
    {items.length > 0 && <nav aria-label={`${label} pagination`} className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select aria-label={`${label} rows per page`} className="w-auto text-xs" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>
          {[5, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <span className="num whitespace-nowrap" aria-live="polite">{start + 1}–{Math.min(start + size, items.length)} of {items.length}</span>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Previous page · ${label}`} title="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
        <span className="num whitespace-nowrap">{page} / {pages}</span>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Next page · ${label}`} title="Next page" disabled={page === pages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
      </div>
    </nav>}
  </>;
}