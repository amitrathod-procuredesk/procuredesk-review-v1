import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Download, Flag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/pd/form";
import { money } from "@/lib/pd/engine";
import { BREAKDOWN, groupInvoices, INVOICES_WITHOUT_PO, type Invoice } from "@/lib/pd/adoption";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/insights/invoices-without-po")({
  validateSearch: (s: Record<string, unknown>): { dept?: string; gl?: string } => ({
    dept: typeof s.dept === "string" ? s.dept : undefined,
    gl: typeof s.gl === "string" ? s.gl : undefined,
  }),
  head: () => ({ meta: [
    { title: "Invoices without a PO · ProcureDesk" },
    { name: "description", content: "Review invoices without a purchase order by supplier or requestor." },
    { property: "og:title", content: "Invoices without a PO · ProcureDesk" },
    { property: "og:description", content: "Invoices without a purchase order, grouped by supplier or requestor." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: InvoicesWithoutPO,
});

type Status = "open" | "flagged";
const STATUS: Record<Status, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-subtle text-muted-foreground" },
  flagged: { label: "Supplier flagged", cls: "bg-warning/10 text-warning" },
};
const date = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function InvoicesWithoutPO() {
  const { dept, gl } = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [sel, setSel] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<"supplier" | "requester">("supplier");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const list = INVOICES_WITHOUT_PO.filter((i) => (!dept || i.department === dept) && (!gl || i.gl === gl));
  const groups = groupInvoices(list, groupBy);
  const total = list.reduce((t, i) => t + i.amount, 0);
  const picked = list.filter((i) => sel.includes(i.id));
  const st = (i: Invoice) => status[i.id] ?? "open";
  const apply = (s: Status, items: Invoice[]) => {
    setStatus((o) => ({ ...o, ...Object.fromEntries(items.map((i) => [i.id, s])) }));
    setSel([]);
    toast.success(`${[...new Set(items.map((i) => i.supplier))].join(", ")} flagged — future invoices need a PO first`);
  };
  const exportCsv = () => {
    const rows = [["Invoice", "Supplier", "Date", "Amount", "Department", "GL account", "Requester", "Status"], ...list.map((i) => [i.number, i.supplier, i.date, i.amount.toFixed(2), i.department, i.gl, i.requester, STATUS[st(i)].label])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "invoices-without-po.csv" }).click();
    URL.revokeObjectURL(url);
  };
  const all = list.length > 0 && picked.length === list.length;

  return <div className="mx-auto max-w-6xl space-y-3 p-4 md:p-6">
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-muted-foreground"><Link to="/app/insights/adoption" className="hover:text-foreground">Adoption</Link><ChevronRight className="size-3" /><span className="text-foreground">Invoices without a PO</span></nav>
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0"><h1 className="pd-h1">Invoices without a PO</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Oct 2026</p></div>
      <Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export</Button>
    </header>

    <section aria-label="Invoices without a PO summary" className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 py-2 sm:gap-8">
      <div className="min-w-0">
        <h2 className="text-xs font-medium text-muted-foreground">Total invoices</h2>
        <p className="num mt-1 text-2xl font-semibold text-foreground" data-testid="invoice-count">{list.length}</p>
      </div>
      <div className="min-w-0 border-l border-border pl-5 sm:pl-8">
        <h2 className="text-xs font-medium text-muted-foreground">Total amount</h2>
        <p className="num mt-1 break-words text-2xl font-semibold text-foreground" data-testid="invoice-amount">{money(total)}</p>
      </div>
    </section>

    {picked.length > 0 && <div className="pd-panel animate-in fade-in flex flex-wrap items-center gap-2 px-3.5 py-2">
      <span className="text-[13px]"><span className="num font-medium">{picked.length}</span> selected · <span className="num">{money(picked.reduce((t, i) => t + i.amount, 0))}</span></span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
        <Button size="sm" variant="outline" onClick={() => apply("flagged", picked)}><Flag /> Flag supplier</Button>
      </div>
    </div>}

    <section className="pd-panel min-w-0">
      <div className="grid min-w-0 gap-2 border-b border-border px-3.5 py-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as "supplier" | "requester")} className="min-w-0">
          <TabsList aria-label="Group invoices by" className="h-8 bg-subtle p-0.5">
            <TabsTrigger value="supplier" className="text-xs">By supplier</TabsTrigger>
            <TabsTrigger value="requester" className="text-xs">By requestor</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Filter by department" className={cn("min-w-0 max-w-full", dept && "border-primary/30 bg-primary/5 text-primary")}><span className="max-w-40 truncate">{dept ?? "Department"}</span><ChevronDown className="size-3.5 shrink-0" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuLabel>Department</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={dept ?? ""} onValueChange={(value) => nav({ search: (s) => ({ ...s, dept: value || undefined }) })}>
                <DropdownMenuRadioItem value="">All departments</DropdownMenuRadioItem>
                {BREAKDOWN.department.map((d) => <DropdownMenuRadioItem key={d.name} value={d.name}>{d.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Filter by GL account" className={cn("min-w-0 max-w-full", gl && "border-primary/30 bg-primary/5 text-primary")}><span className="max-w-40 truncate">{gl ?? "GL account"}</span><ChevronDown className="size-3.5 shrink-0" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuLabel>GL account</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={gl ?? ""} onValueChange={(value) => nav({ search: (s) => ({ ...s, gl: value || undefined }) })}>
                <DropdownMenuRadioItem value="">All GL accounts</DropdownMenuRadioItem>
                {BREAKDOWN.gl.map((d) => <DropdownMenuRadioItem key={d.name} value={d.name}>{d.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {(dept || gl) && <Button size="sm" variant="ghost" onClick={() => nav({ search: {} })}><X className="size-3.5" />Clear</Button>}
        </div>
      </div>
      <div className="overflow-x-auto">
      {list.length ? <table className="w-full min-w-[760px] text-[13px]">
        <thead><tr className="text-left text-[12px] text-muted-foreground">
          <th className="w-9 py-2 pl-3.5"><Checkbox aria-label="Select all" checked={all} onChange={() => setSel(all ? [] : list.map((i) => i.id))} /></th>
          <th className="px-2 py-2 font-medium">Invoice</th><th className="px-2 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">{groupBy === "supplier" ? "Requestor" : "Supplier"}</th><th className="px-2 py-2 font-medium">Department</th><th className="px-2 py-2 font-medium">Status</th><th className="py-2 pl-2 pr-3.5 text-right font-medium">Amount</th>
        </tr></thead>
        <tbody>{groups.map((group) => {
          const key = `${groupBy}:${group.name}`;
          const expanded = !closed[key];
          return <Fragment key={key}>
            <tr className="border-t border-border bg-subtle/50"><td colSpan={7} className="px-2 py-1"><Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={`group-${group.rows[0]?.id}`} onClick={() => setClosed((c) => ({ ...c, [key]: expanded }))} className="h-auto w-full justify-start gap-2 py-1.5 text-left"><ChevronRight className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} /><span>{group.name}</span><span className="text-xs font-normal text-muted-foreground">{group.rows.length} {group.rows.length === 1 ? "invoice" : "invoices"}</span><span className="num ml-auto">{money(group.total)}</span></Button></td></tr>
            {expanded && group.rows.map((i, index) => <tr id={index === 0 ? `group-${i.id}` : undefined} key={i.id} className={cn("border-t border-border", sel.includes(i.id) && "bg-primary/5")}>
          <td className="py-2 pl-3.5"><Checkbox aria-label={`Select ${i.number}`} checked={sel.includes(i.id)} onChange={() => setSel((o) => (o.includes(i.id) ? o.filter((x) => x !== i.id) : [...o, i.id]))} /></td>
          <td className="num px-2 py-2 font-medium">{i.number}</td>
          <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{date(i.date)}</td>
          <td className="px-2 py-2">{groupBy === "supplier" ? i.requester : i.supplier}</td>
          <td className="px-2 py-2">{i.department}<span className="block text-[11px] text-muted-foreground">{i.gl}</span></td>
          <td className="px-2 py-2"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS[st(i)].cls)}>{STATUS[st(i)].label}</span></td>
          <td className="num py-2 pl-2 pr-3.5 text-right">{money(i.amount)}</td>
        </tr>)}
          </Fragment>;
        })}</tbody>
        <tfoot><tr className="border-t border-border text-[12px]"><td colSpan={6} className="px-3.5 py-2 text-muted-foreground">Total</td><td className="num py-2 pl-2 pr-3.5 text-right font-medium">{money(total)}</td></tr></tfoot>
      </table> : <p className="py-14 text-center text-sm text-muted-foreground">No invoices without a PO for this filter.</p>}
      </div>
      <p className="border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">Sample data · Highest amount first</p>
    </section>
  </div>;
}
