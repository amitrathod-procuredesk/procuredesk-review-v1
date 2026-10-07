import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Columns3, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, Money, StatusBadge } from "@/components/pd/bits";
import { budgetStatus, smartDate, STATUS_LABEL, supplierBreakdown, totals } from "@/lib/pd/engine";
import { createDraft, log, mutate, useDB, useMe } from "@/lib/pd/store";
import type { DB, PRequest, Status } from "@/lib/pd/types";

export const Route = createFileRoute("/app/requests/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s.q === "string" ? { q: s.q } : {}),
  head: () => ({
    meta: [
      { title: "Purchase requests · ProcureDesk" },
      { name: "description", content: "Search, filter and track every purchase request." },
      { property: "og:title", content: "Purchase requests · ProcureDesk" },
      { property: "og:description", content: "All purchase requests with status, supplier and amount." },
    ],
  }),
  component: Requests,
});

const COLS = ["Request", "Requestor", "Department", "Supplier", "Amount", "Status", "Required", "Created"] as const;
type Col = (typeof COLS)[number];
const STATUSES: Status[] = ["draft", "pending", "changes", "approved", "rejected", "ordered", "received", "cancelled"];

/** Natural-language filter: departments, statuses, amounts, suppliers, free text. */
function nlFilter(db: DB, q: string) {
  const l = q.toLowerCase();
  const tests: ((r: PRequest) => boolean)[] = [];
  let rest = l;
  const amt = l.match(/(above|over|more than|>)\s*\$?([\d,.]+)\s*(k)?/);
  if (amt) { const n = Number(amt[2].replace(/,/g, "")) * (amt[3] ? 1000 : 1); tests.push((r) => totals(r).total > n); rest = rest.replace(amt[0], ""); }
  const below = l.match(/(below|under|less than|<)\s*\$?([\d,.]+)\s*(k)?/);
  if (below) { const n = Number(below[2].replace(/,/g, "")) * (below[3] ? 1000 : 1); tests.push((r) => totals(r).total < n); rest = rest.replace(below[0], ""); }
  db.departments.forEach((d) => { if (l.includes(d.name.toLowerCase())) { tests.push((r) => r.departmentId === d.id); rest = rest.replace(d.name.toLowerCase(), ""); } });
  if (/awaiting|pending|waiting/.test(l)) { tests.push((r) => r.status === "pending"); rest = rest.replace(/awaiting approval|awaiting|pending|waiting/, ""); }
  if (/over budget/.test(l)) { tests.push((r) => !!budgetStatus(r, db)?.over && ["draft", "pending", "changes"].includes(r.status)); rest = rest.replace("over budget", ""); }
  rest = rest.replace(/\b(show|requests?|all|me|for|with|the|approval|and)\b/g, "").trim();
  if (rest) tests.push((r) => [r.id, r.title, r.project, ...r.items.map((i) => i.description), ...supplierBreakdown(r, db).map((s) => s.name), db.users.find((u) => u.id === r.requesterId)?.name ?? ""].join(" ").toLowerCase().includes(rest));
  return (r: PRequest) => tests.every((t) => t(r));
}

function Requests() {
  const db = useDB();
  const me = useMe()!;
  const nav = useNavigate();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [status, setStatus] = useState<Status | "all">("all");
  const [dept, setDept] = useState("all");
  const [scope, setScope] = useState<"mine" | "all">(me.role === "requestor" ? "mine" : "all");
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: "Created", dir: -1 });
  const [cols, setCols] = useState<Col[]>([...COLS]);
  const [sel, setSel] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const PER = 15;

  const rows = useMemo(() => {
    const f = nlFilter(db, q);
    const val = (r: PRequest): string | number => {
      switch (sort.col) {
        case "Amount": return totals(r).total;
        case "Request": return r.title;
        case "Status": return r.status;
        case "Required": return r.requiredBy ?? "";
        case "Department": return db.departments.find((d) => d.id === r.departmentId)?.name ?? "";
        case "Requestor": return db.users.find((u) => u.id === r.requesterId)?.name ?? "";
        case "Supplier": return supplierBreakdown(r, db)[0]?.name ?? "";
        default: return r.createdAt;
      }
    };
    return db.requests
      .filter((r) => (scope === "mine" ? r.requesterId === me.id : me.role !== "requestor" || r.requesterId === me.id))
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => dept === "all" || r.departmentId === dept)
      .filter(f)
      .sort((a, b) => (val(a) > val(b) ? sort.dir : val(a) < val(b) ? -sort.dir : 0));
  }, [db, q, status, dept, scope, sort, me]);

  const pageRows = rows.slice(page * PER, page * PER + PER);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const show = (c: Col) => cols.includes(c);
  const Th = ({ c, right }: { c: Col; right?: boolean }) => !show(c) ? null : (
    <th className={right ? "text-right" : ""}>
      <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort((s) => ({ col: c, dir: s.col === c ? ((-s.dir) as 1 | -1) : 1 }))}>
        {c}{sort.col === c && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  const cancelSelected = () => {
    let n = 0;
    mutate((d) => d.requests.forEach((r) => { if (sel.includes(r.id) && ["draft", "pending", "changes"].includes(r.status) && (r.requesterId === me.id || me.role === "admin")) { r.status = "cancelled"; log(r, "Request cancelled", "system", me.id); n++; } }));
    toast(n ? `${n} request(s) cancelled` : "None of the selected requests can be cancelled", { description: n < sel.length ? `${sel.length - n} skipped — not eligible` : undefined });
    setSel([]);
  };

  return (
    <div className="space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="pd-h1">Purchase requests</h1>
        {me.role !== "approver" && <Button size="sm" onClick={() => { const id = createDraft(me.id, false); nav({ to: "/app/requests/$id/edit", params: { id }, search: { prompt: undefined } }); }}><Plus /> New request</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <input className="pd-input h-8 pl-8" placeholder='Search or ask: "engineering requests above $5,000 awaiting approval"' value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        </div>
        {me.role !== "requestor" && (
          <div className="flex rounded-md border border-border p-0.5">
            {(["all", "mine"] as const).map((s) => <button key={s} className="rounded-sm px-2.5 py-1 text-xs data-[on=true]:bg-subtle data-[on=true]:font-medium" data-on={scope === s} onClick={() => setScope(s)}>{s === "all" ? "All" : "Mine"}</button>)}
          </div>
        )}
        <select className="pd-input h-8 w-auto" value={status} onChange={(e) => { setStatus(e.target.value as Status | "all"); setPage(0); }}>
          <option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="pd-input h-8 w-auto" value={dept} onChange={(e) => { setDept(e.target.value); setPage(0); }}>
          <option value="all">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <DropdownMenu>
          <DropdownMenuTrigger className="pd-chip h-8"><Columns3 className="size-3.5" /> Columns</DropdownMenuTrigger>
          <DropdownMenuContent>
            {COLS.map((c) => <DropdownMenuCheckboxItem key={c} checked={show(c)} disabled={c === "Request"} onCheckedChange={(v) => setCols((cs) => (v ? [...cs, c] : cs.filter((x) => x !== c)))}>{c}</DropdownMenuCheckboxItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sel.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground">
          <span className="font-medium">{sel.length} selected</span>
          <Button size="sm" variant="ghost" onClick={cancelSelected}>Cancel eligible</Button>
          <button className="ml-auto text-xs" onClick={() => setSel([])}>Clear</button>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title="No matching requests" body={q ? "Try a different search or clear filters." : "Requests you create will show up here."} action={(q || status !== "all" || dept !== "all") && <button className="pd-chip" onClick={() => { setQ(""); setStatus("all"); setDept("all"); }}>Clear filters</button>} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="pd-table">
              <thead>
                <tr>
                  <th className="w-8"><input type="checkbox" aria-label="Select page" checked={pageRows.every((r) => sel.includes(r.id))} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...pageRows.map((r) => r.id)])] : sel.filter((s) => !pageRows.some((r) => r.id === s)))} /></th>
                  <th>ID</th><Th c="Request" /><Th c="Requestor" /><Th c="Department" /><Th c="Supplier" /><Th c="Amount" right /><Th c="Status" /><Th c="Required" /><Th c="Created" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const sup = supplierBreakdown(r, db);
                  const target = ["draft", "changes"].includes(r.status) && r.requesterId === me.id;
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => (target ? nav({ to: "/app/requests/$id/edit", params: { id: r.id }, search: { prompt: undefined } }) : nav({ to: "/app/requests/$id", params: { id: r.id } }))}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.id}`} checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} /></td>
                      <td className="num text-xs text-muted-foreground">{r.id}</td>
                      <td className="max-w-72 truncate font-medium">{r.title || "Untitled request"}</td>
                      {show("Requestor") && <td>{db.users.find((u) => u.id === r.requesterId)?.name}</td>}
                      {show("Department") && <td>{db.departments.find((d) => d.id === r.departmentId)?.name ?? "—"}</td>}
                      {show("Supplier") && <td>{sup[0]?.name ?? "—"}{sup.length > 1 && <span className="text-xs text-muted-foreground"> +{sup.length - 1}</span>}</td>}
                      {show("Amount") && <td className="text-right"><Money v={totals(r).total} /></td>}
                      {show("Status") && <td><StatusBadge status={r.status} /></td>}
                      {show("Required") && <td className="text-xs">{smartDate(r.requiredBy)}</td>}
                      {show("Created") && <td className="text-xs text-muted-foreground">{smartDate(r.createdAt)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {pageRows.map((r) => (
              <li key={r.id}><Link to="/app/requests/$id" params={{ id: r.id }} className="pd-panel block p-3"><div className="flex justify-between gap-2"><p className="truncate text-sm font-medium">{r.title || "Untitled"}</p><Money v={totals(r).total} className="text-sm" /></div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span className="num">{r.id}</span><StatusBadge status={r.status} /></div></Link></li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{rows.length} request{rows.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <button className="pd-chip" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button className="pd-chip" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
