import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Box, ChevronLeft, ChevronRight, Columns3, Download, LayoutGrid, List, MoreHorizontal, Plus, Search, Settings, SlidersHorizontal, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AssetThumb, BTN, BTN_GHOST, BTN_PRIMARY, StatusPill } from "@/components/pd/assetUi";
import { Select, TextInput } from "@/components/pd/form";
import { UserAvatar } from "@/components/pd/bits";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bookValue, daysUntil, holderName, insights, SITES, type Asset } from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

const VIEWS = ["all", "attention", "overdue"] as const;
const TABS = [
  { id: "all", label: "All", match: () => true },
  { id: "in_use", label: "In use", match: (a: Asset) => a.statusId === "in_use" },
  { id: "available", label: "Available", match: (a: Asset) => a.statusId === "available" },
  { id: "checked_out", label: "Checked out", match: (a: Asset) => a.statusId === "checked_out" },
  { id: "in_repair", label: "In repair", match: (a: Asset) => a.statusId === "in_repair" || a.statusId === "at_vendor" },
  { id: "decommissioned", label: "Decommissioned", match: (a: Asset) => a.statusId === "decommissioned" },
] as const;
const COLS = [
  { id: "tag", label: "Tag / Serial" }, { id: "category", label: "Category" }, { id: "location", label: "Location" },
  { id: "assigned", label: "Assigned to" }, { id: "status", label: "Status" }, { id: "value", label: "Net book value" },
] as const;
type Col = (typeof COLS)[number]["id"];
const PAGE = 10;

export const Route = createFileRoute("/app/assets/register/")({
  validateSearch: z.object({ status: z.string().optional(), view: z.enum(VIEWS).optional(), q: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Asset Register · ProcureDesk" },
      { name: "description", content: "Every company asset in one place: where it is, who has it, its status and net book value." },
      { property: "og:title", content: "Asset Register · ProcureDesk" },
      { property: "og:description", content: "Track laptops, vehicles, machinery and furniture from registration to disposal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const db = useDB();
  const s = db.assets!;
  const all = db.assetItems ?? [];
  const nav = useNavigate({ from: "/app/assets/register/" });
  const { status = "all", view = "all", q = "" } = Route.useSearch();
  const [cat, setCat] = useState("");
  const [site, setSite] = useState("");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [hidden, setHidden] = useState<Col[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const setSearch = (p: Partial<{ status: string; view: (typeof VIEWS)[number]; q: string }>) => nav({ search: (o) => ({ ...o, ...p }), replace: true });

  const rows = useMemo(() => all.map((a) => ({ a, book: bookValue(a, s), flags: insights(a, s) })), [all, s]);
  const live = rows.filter((r) => r.a.statusId !== "disposed" && r.a.statusId !== "draft");
  const inUse = rows.filter((r) => r.a.statusId === "in_use" || r.a.statusId === "checked_out").length;
  const inRepair = rows.filter((r) => r.a.repair).length;
  const dueService = rows.filter((r) => r.flags.includes("maintenance")).length;
  const warrantySoon = rows.filter((r) => r.a.statusId !== "disposed" && r.a.warrantyEnd && daysUntil(r.a.warrantyEnd) >= 0 && daysUntil(r.a.warrantyEnd) <= 60).length;
  const sites = new Set(rows.filter((r) => r.a.site).map((r) => r.a.site)).size;

  const tab = TABS.find((t) => t.id === status) ?? TABS[0];
  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(({ a, flags }) =>
    tab.match(a) &&
    (view === "all" || (view === "overdue" ? flags.includes("overdue") : flags.length > 0)) &&
    (!cat || a.categoryId === cat) && (!site || a.site === site) &&
    (!needle || [a.name, a.tag, a.identifier, a.assetTag, a.barcode, a.make, a.model, holderName(a.assignedTo ?? a.checkout?.to, db)].some((x) => x?.toLowerCase().includes(needle))));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  useEffect(() => setPage(1), [status, view, q, cat, site]);

  const filterCount = (cat ? 1 : 0) + (site ? 1 : 0) + (view !== "all" ? 1 : 0);
  const clearAll = () => { setCat(""); setSite(""); nav({ search: {}, replace: true }); };
  const show = (c: Col) => !hidden.includes(c);
  const allOnPage = shown.length > 0 && shown.every((r) => sel.includes(r.a.id));

  const exportCsv = (ids?: string[]) => {
    const list = ids ? rows.filter((r) => ids.includes(r.a.id)) : filtered;
    const head = ["Asset ID", "Name", "Asset tag", "Serial number", "Category", "Status", "Location", "Assigned to", "Purchase price", "Net book value", "Purchase date", "Warranty end"];
    const body = list.map(({ a, book }) => [a.tag, a.name, a.assetTag, a.identifier, s.categories.find((c) => c.id === a.categoryId)?.name, s.statuses.find((x) => x.id === a.statusId)?.name, a.site, holderName(a.assignedTo ?? a.checkout?.to, db), a.cost, book, a.purchaseDate, a.warrantyEnd]);
    const csv = [head, ...body].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `asset-register-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  const open = (id: string) => nav({ to: "/app/assets/$assetId", params: { assetId: id } });

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Assets</span><ChevronRight className="size-3" /><span className="text-foreground">Register</span>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pd-h1">Asset Register</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{live.length} {live.length === 1 ? "asset" : "assets"} tracked across {sites} {sites === 1 ? "location" : "locations"}.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/app/assets/register/new" className={BTN_PRIMARY}><Plus className="size-3.5" />New asset</Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className={cn(BTN, "px-2")} aria-label="More actions"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => exportCsv()} disabled={!filtered.length} className="gap-2 text-[13px]"><Download className="size-3.5" />Export CSV</DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 text-[13px]"><Link to="/app/assets/register/new"><Upload className="size-3.5" />Import CSV</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 text-[13px]"><Link to="/app/assets/settings"><Settings className="size-3.5" />Asset settings</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total value" value={money(live.reduce((t, r) => t + r.book, 0))} sub="Net book value" onClick={clearAll} active={status === "all" && view === "all" && !filterCount} />
        <Kpi label="In use" value={String(inUse)} sub={`${live.length ? Math.round((inUse / live.length) * 100) : 0}% utilization`} onClick={() => setSearch({ status: "in_use", view: "all" })} active={status === "in_use"} />
        <Kpi label="Due for service" value={String(dueService + inRepair)} sub={`${inRepair} in repair`} tone={dueService + inRepair ? "amber" : undefined} onClick={() => setSearch({ status: dueService ? "all" : "in_repair", view: dueService ? "attention" : "all" })} active={status === "in_repair" || view === "attention"} />
        <Kpi label="Warranty expiring" value={String(warrantySoon)} sub="Next 60 days" tone={warrantySoon ? "red" : undefined} onClick={() => setSearch({ status: "all", view: "attention" })} active={false} />
      </div>

      <section className="pd-panel overflow-hidden">
        <div className="pd-scroll-hide flex gap-1 overflow-x-auto border-b border-border px-3 pt-2">
          {TABS.map((t) => { const n = rows.filter((r) => t.match(r.a)).length; return (
            <button key={t.id} onClick={() => setSearch({ status: t.id, view: "all" })} aria-pressed={tab.id === t.id}
              className={cn("-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] transition-colors", tab.id === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}<span className={cn("num text-[11px]", tab.id === t.id ? "text-primary" : "text-muted-foreground")}>{n}</span>
            </button>); })}
        </div>

        <div className="flex flex-wrap items-center gap-2 p-3">
          {sel.length > 0 ? (
            <div className="flex flex-1 items-center gap-2 animate-in fade-in">
              <span className="text-[13px] font-medium">{sel.length} selected</span>
              <button onClick={() => exportCsv(sel)} className={BTN}><Download className="size-3.5" />Export</button>
              <button onClick={() => setSel([])} className={BTN_GHOST}>Clear</button>
            </div>
          ) : (
            <div className="relative min-w-[220px] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput value={q} onChange={(e) => setSearch({ q: e.target.value || undefined })} placeholder="Search name, tag, serial..." className="pl-8" aria-label="Search assets" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-md bg-subtle p-0.5 text-[12px]">
              {([["list", "List", List], ["grid", "Grid", LayoutGrid]] as const).map(([id, label, Icon]) => (
                <button key={id} role="radio" aria-checked={layout === id} onClick={() => setLayout(id)} className={cn("inline-flex h-7 items-center gap-1 rounded px-2.5", layout === id ? "bg-surface font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icon className="size-3.5" />{label}</button>
              ))}
            </div>
            {layout === "list" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button className={cn(BTN, "px-2")} aria-label="Columns"><Columns3 className="size-4" /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Show columns</DropdownMenuLabel>
                  {COLS.map((c) => <DropdownMenuCheckboxItem key={c.id} checked={show(c.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== c.id) : [...h, c.id]))} className="text-[13px]">{c.label}</DropdownMenuCheckboxItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Popover>
              <PopoverTrigger asChild><button className={cn(BTN, filterCount && "border-primary/40 text-primary")}><SlidersHorizontal className="size-3.5" />Filters{filterCount > 0 && <span className="num rounded bg-primary/10 px-1 text-[11px]">{filterCount}</span>}</button></PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3 p-3">
                <div><label className="pd-label" htmlFor="f-cat">Category</label><Select id="f-cat" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
                <div><label className="pd-label" htmlFor="f-site">Location</label><Select id="f-site" value={site} onChange={(e) => setSite(e.target.value)}><option value="">All locations</option>{SITES.map((x) => <option key={x}>{x}</option>)}</Select></div>
                <div><label className="pd-label" htmlFor="f-view">Show</label><Select id="f-view" value={view} onChange={(e) => setSearch({ view: e.target.value as (typeof VIEWS)[number] })}><option value="all">All assets</option><option value="attention">Needs attention</option><option value="overdue">Overdue returns</option></Select></div>
                {filterCount > 0 && <button onClick={() => { setCat(""); setSite(""); setSearch({ view: "all" }); }} className="text-[12px] text-muted-foreground hover:text-foreground">Clear filters</button>}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center border-t border-border px-6 py-16 text-center">
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-subtle"><Box className="size-5 text-muted-foreground" /></span>
            <p className="text-sm font-medium">{all.length ? "No assets match these filters" : "No assets registered yet"}</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{all.length ? "Try another tab or clear the search." : "Add your first laptop, vehicle or machine to start tracking it."}</p>
            {all.length ? <button onClick={clearAll} className={cn(BTN, "mt-4")}><X className="size-3.5" />Clear filters</button> : <Link to="/app/assets/register/new" className={cn(BTN_PRIMARY, "mt-4")}><Plus className="size-3.5" />New asset</Link>}
          </div>
        ) : layout === "list" ? (
          <div className="overflow-x-auto">
            <table className="pd-table min-w-[860px]">
              <thead><tr>
                <th className="w-10"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSel((x) => (e.target.checked ? [...new Set([...x, ...shown.map((r) => r.a.id)])] : x.filter((id) => !shown.some((r) => r.a.id === id))))} /></th>
                <th>Asset</th>{COLS.filter((c) => show(c.id)).map((c) => <th key={c.id} className={c.id === "value" ? "text-right" : undefined}>{c.label}</th>)}
              </tr></thead>
              <tbody>
                {shown.map(({ a, book }) => {
                  const holder = a.checkout?.to ?? a.assignedTo;
                  const user = holder?.kind === "user" ? db.users.find((u) => u.id === holder.userId) : undefined;
                  const on = sel.includes(a.id);
                  return (
                    <tr key={a.id} className={cn("cursor-pointer", on && "bg-primary/5")} onClick={() => open(a.id)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${a.name}`} checked={on} onChange={(e) => setSel((x) => (e.target.checked ? [...x, a.id] : x.filter((i) => i !== a.id)))} /></td>
                      <td className="py-2">
                        <Link to="/app/assets/$assetId" params={{ assetId: a.id }} className="flex items-center gap-3 outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                          <AssetThumb a={a} />
                          <span className="min-w-0"><span className="block max-w-[240px] truncate font-medium">{a.name || "Untitled asset"}</span><span className="num block text-[11px] text-muted-foreground">{a.tag}</span></span>
                        </Link>
                      </td>
                      {show("tag") && <td className="num text-[12px]">{a.assetTag || a.identifier ? <><span className="block">{a.assetTag || "—"}</span>{a.identifier && <span className="block text-muted-foreground">{a.identifier}</span>}</> : <span className="text-muted-foreground">—</span>}</td>}
                      {show("category") && <td className="whitespace-nowrap text-[13px]">{s.categories.find((c) => c.id === a.categoryId)?.name}</td>}
                      {show("location") && <td className="text-[13px]"><span className="block max-w-[200px] truncate">{a.site || "—"}{a.room && <span className="text-muted-foreground"> / {a.room}</span>}</span></td>}
                      {show("assigned") && <td className="text-[13px]">{holder ? <span className="flex items-center gap-2">{user && <UserAvatar user={user} />}<span className="max-w-[160px] truncate">{holderName(holder, db)}</span></span> : <span className="text-muted-foreground">—</span>}</td>}
                      {show("status") && <td><StatusPill s={s.statuses.find((x) => x.id === a.statusId)} /></td>}
                      {show("value") && <td className="num text-right text-[13px]">{book ? money(book) : <span className="text-muted-foreground">—</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(({ a, book }) => {
              const holder = a.checkout?.to ?? a.assignedTo;
              return (
                <Link key={a.id} to="/app/assets/$assetId" params={{ assetId: a.id }} className="rounded-lg border border-border p-3 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-start gap-3">
                    <AssetThumb a={a} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{a.name || "Untitled asset"}</span><span className="num block text-[11px] text-muted-foreground">{a.tag}</span></span>
                    <StatusPill s={s.statuses.find((x) => x.id === a.statusId)} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                    <div><dt className="text-muted-foreground">Category</dt><dd className="truncate">{s.categories.find((c) => c.id === a.categoryId)?.name}</dd></div>
                    <div><dt className="text-muted-foreground">Location</dt><dd className="truncate">{a.site || "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Assigned to</dt><dd className="truncate">{holder ? holderName(holder, db) : "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Net book value</dt><dd className="num">{book ? money(book) : "—"}</dd></div>
                  </dl>
                </Link>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
            <span>Showing {(cur - 1) * PAGE + 1}–{Math.min(cur * PAGE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Previous page" className="rounded p-1 hover:bg-subtle disabled:opacity-40"><ChevronLeft className="size-4" /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => setPage(n)} aria-current={n === cur ? "page" : undefined} className={cn("num size-7 rounded-full text-[12px]", n === cur ? "bg-primary/10 font-medium text-primary" : "hover:bg-subtle")}>{n}</button>)}
              <button disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="Next page" className="rounded p-1 hover:bg-subtle disabled:opacity-40"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, tone, onClick, active }: { label: string; value: string; sub: string; tone?: "red" | "amber"; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("pd-panel p-4 text-left transition-[box-shadow,border-color] hover:border-primary/30", active && "border-primary/40 ring-[3px] ring-primary/10")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-xl font-semibold tracking-tight", tone === "red" ? "text-destructive" : tone === "amber" ? "text-warning" : "")}>{value}</p>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{sub}</p>
    </button>
  );
}
