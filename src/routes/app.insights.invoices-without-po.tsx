import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Download, Flag, FilePlus2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/pd/form";
import { money } from "@/lib/pd/engine";
import { BREAKDOWN, INVOICES_WITHOUT_PO, type Invoice } from "@/lib/pd/adoption";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/insights/invoices-without-po")({
  validateSearch: (s: Record<string, unknown>): { dept?: string; gl?: string } => ({
    dept: typeof s.dept === "string" ? s.dept : undefined,
    gl: typeof s.gl === "string" ? s.gl : undefined,
  }),
  head: () => ({ meta: [
    { title: "Invoices without a PO · ProcureDesk" },
    { name: "description", content: "Supplier invoices received without a purchase order, with actions to request a retroactive PO, flag suppliers or export for AP." },
    { property: "og:title", content: "Invoices without a PO · ProcureDesk" },
    { property: "og:description", content: "Review and resolve maverick spend: invoices that arrived without a ProcureDesk PO." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: InvoicesWithoutPO,
});

type Status = "open" | "po_requested" | "flagged";
const STATUS: Record<Status, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-subtle text-muted-foreground" },
  po_requested: { label: "PO requested", cls: "bg-primary/10 text-primary" },
  flagged: { label: "Supplier flagged", cls: "bg-warning/10 text-warning" },
};
const date = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function InvoicesWithoutPO() {
  const { dept, gl } = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [sel, setSel] = useState<string[]>([]);
  const list = INVOICES_WITHOUT_PO.filter((i) => (!dept || i.department === dept) && (!gl || i.gl === gl));
  const total = list.reduce((t, i) => t + i.amount, 0);
  const picked = list.filter((i) => sel.includes(i.id));
  const st = (i: Invoice) => status[i.id] ?? "open";
  const apply = (s: Status, items: Invoice[]) => {
    setStatus((o) => ({ ...o, ...Object.fromEntries(items.map((i) => [i.id, s])) }));
    setSel([]);
    toast.success(s === "po_requested" ? `Retroactive PO requested from ${[...new Set(items.map((i) => i.requester))].join(", ")}` : `${[...new Set(items.map((i) => i.supplier))].join(", ")} flagged — future invoices need a PO first`);
  };
  const exportCsv = () => {
    const rows = [["Invoice", "Supplier", "Date", "Amount", "Department", "GL account", "Requester", "Status"], ...list.map((i) => [i.number, i.supplier, i.date, i.amount.toFixed(2), i.department, i.gl, i.requester, STATUS[st(i)].label])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "invoices-without-po.csv" }).click();
    URL.revokeObjectURL(url);
  };
  const all = list.length > 0 && picked.length === list.length;

  return <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground"><Link to="/app/insights/adoption" className="hover:text-foreground">Adoption</Link><ChevronRight className="size-3" /><span className="text-foreground">Invoices without a PO</span></nav>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="pd-h1">Invoices without a PO</h1>
        <p className="mt-1 text-[13px] text-muted-foreground"><span className="num text-foreground">{list.length}</span> invoices · <span className="num text-foreground">{money(total)}</span> received in Oct 2026 with no matching ProcureDesk PO</p></div>
      <Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export for AP review</Button>
    </header>

    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-52"><Select aria-label="Department" value={dept ?? ""} onChange={(e) => nav({ search: (s) => ({ ...s, dept: e.target.value || undefined }) })}><option value="">All departments</option>{BREAKDOWN.department.map((d) => <option key={d.name}>{d.name}</option>)}</Select></div>
      <div className="w-full sm:w-60"><Select aria-label="GL account" value={gl ?? ""} onChange={(e) => nav({ search: (s) => ({ ...s, gl: e.target.value || undefined }) })}><option value="">All GL accounts</option>{BREAKDOWN.gl.map((d) => <option key={d.name}>{d.name}</option>)}</Select></div>
      {(dept || gl) && <button onClick={() => nav({ search: {} })} className="flex items-center gap-1 text-[12px] text-primary hover:underline"><X className="size-3" />Clear filters</button>}
    </div>

    {picked.length > 0 && <div className="pd-panel animate-in fade-in flex flex-wrap items-center gap-2 px-3.5 py-2">
      <span className="text-[13px]"><span className="num font-medium">{picked.length}</span> selected · <span className="num">{money(picked.reduce((t, i) => t + i.amount, 0))}</span></span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
        <Button size="sm" variant="outline" onClick={() => apply("flagged", picked)}><Flag /> Flag supplier</Button>
        <Button size="sm" onClick={() => apply("po_requested", picked)}><FilePlus2 /> Request retroactive PO</Button>
      </div>
    </div>}

    <section className="pd-panel min-w-0 overflow-x-auto">
      {list.length ? <table className="w-full min-w-[760px] text-[13px]">
        <thead><tr className="text-left text-[12px] text-muted-foreground">
          <th className="w-9 py-2 pl-3.5"><Checkbox aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : list.map((i) => i.id))} /></th>
          <th className="px-2 py-2 font-medium">Invoice</th><th className="px-2 py-2 font-medium">Supplier</th><th className="px-2 py-2 font-medium">Department · GL account</th><th className="px-2 py-2 font-medium">Requester</th><th className="px-2 py-2 font-medium">Status</th><th className="px-2 py-2 text-right font-medium">Amount</th><th className="w-10 pr-3.5" />
        </tr></thead>
        <tbody>{list.map((i) => <tr key={i.id} className={cn("border-t border-border", sel.includes(i.id) && "bg-primary/5")}>
          <td className="py-2 pl-3.5"><Checkbox aria-label={`Select ${i.number}`} checked={sel.includes(i.id)} onChange={() => setSel((o) => (o.includes(i.id) ? o.filter((x) => x !== i.id) : [...o, i.id]))} /></td>
          <td className="px-2 py-2"><span className="num font-medium">{i.number}</span><span className="block text-[11px] text-muted-foreground">{date(i.date)}</span></td>
          <td className="px-2 py-2">{i.supplier}</td>
          <td className="px-2 py-2">{i.department}<span className="block text-[11px] text-muted-foreground">{i.gl}</span></td>
          <td className="px-2 py-2">{i.requester}</td>
          <td className="px-2 py-2"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS[st(i)].cls)}>{STATUS[st(i)].label}</span></td>
          <td className="num px-2 py-2 text-right">{money(i.amount)}</td>
          <td className="pr-3.5 text-right">{st(i) === "open" && <Button size="sm" variant="ghost" title="Request retroactive PO" aria-label={`Request retroactive PO for ${i.number}`} onClick={() => apply("po_requested", [i])}><FilePlus2 /></Button>}</td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t border-border text-[12px]"><td colSpan={6} className="px-3.5 py-2 text-muted-foreground">Total</td><td className="num px-2 py-2 text-right font-medium">{money(total)}</td><td /></tr></tfoot>
      </table> : <p className="py-14 text-center text-sm text-muted-foreground">No invoices without a PO for this filter.</p>}
    </section>
  </div>;
}
