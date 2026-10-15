import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Box, ChevronRight, Download, Plus, Search, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { AssetThumb, BTN, BTN_PRIMARY, StatusPill, fmtDate, relDays } from "@/components/pd/assetUi";
import { Select, TextInput } from "@/components/pd/form";
import { UserAvatar } from "@/components/pd/bits";
import { bookValue, daysUntil, holderName, insights, REPAIR_STAGES, SITES, type Asset } from "@/lib/pd/assetRegister";
import { money } from "@/lib/pd/engine";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

const VIEWS = ["all", "attention", "overdue"] as const;

export const Route = createFileRoute("/app/assets/register/")({
  validateSearch: z.object({ status: z.string().optional(), view: z.enum(VIEWS).optional(), q: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Asset register · ProcureDesk" },
      { name: "description", content: "Every company asset in one place: where it is, who has it, its condition, value and repair status." },
      { property: "og:title", content: "Asset register · ProcureDesk" },
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
  const setSearch = (p: Partial<{ status: string; view: (typeof VIEWS)[number]; q: string }>) => nav({ search: (o) => ({ ...o, ...p }), replace: true });

  const rows = useMemo(() => all.map((a) => ({ a, book: bookValue(a, s), flags: insights(a, s) })), [all, s]);
  const live = rows.filter((r) => r.a.statusId !== "disposed");
  const kpi = {
    total: live.length,
    value: live.reduce((t, r) => t + r.book, 0),
    out: rows.filter((r) => r.a.statusId === "checked_out").length,
    overdue: rows.filter((r) => r.flags.includes("overdue")).length,
    repair: rows.filter((r) => r.a.repair).length,
    attention: rows.filter((r) => r.flags.length).length,
  };

  const needle = q.trim().toLowerCase();
  const filtered = rows.filter(({ a, flags }) =>
    (status === "all" || a.statusId === status) &&
    (view === "all" || (view === "overdue" ? flags.includes("overdue") : flags.length > 0)) &&
    (!cat || a.categoryId === cat) && (!site || a.site === site) &&
    (!needle || [a.name, a.tag, a.identifier, a.make, a.model, holderName(a.assignedTo ?? a.checkout?.to, db)].some((x) => x?.toLowerCase().includes(needle))));

  const counts = (id: string) => rows.filter((r) => r.a.statusId === id).length;
  const statuses = s.statuses.filter((x) => x.enabled || counts(x.id));
  const anyFilter = status !== "all" || view !== "all" || cat || site || q;

  const exportCsv = () => {
    const head = ["Asset ID", "Name", "Category", "Status", "Serial / identifier", "Location", "Assigned to", "Cost", "Book value", "Purchase date", "Warranty end"];
    const body = filtered.map(({ a, book }) => [a.tag, a.name, s.categories.find((c) => c.id === a.categoryId)?.name, s.statuses.find((x) => x.id === a.statusId)?.name, a.identifier, a.site, holderName(a.assignedTo ?? a.checkout?.to, db), a.cost, book, a.purchaseDate, a.warrantyEnd]);
    const csv = [head, ...body].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `asset-register-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Assets</span><ChevronRight className="size-3" /><span className="text-foreground">Register</span>
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pd-h1">Asset register</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Everything the company owns — where it is, who has it and what state it's in.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className={BTN} disabled={!filtered.length}><Download className="size-3.5" />Export</button>
          <Link to="/app/assets/register/new" className={BTN_PRIMARY}><Plus className="size-3.5" />Register asset</Link>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Assets in service" value={String(kpi.total)} sub={`${money(kpi.value)} book value`} onClick={() => setSearch({ status: "all", view: "all" })} active={status === "all" && view === "all"} />
        <Kpi label="Checked out" value={String(kpi.out)} sub={kpi.overdue ? `${kpi.overdue} overdue` : "None overdue"} tone={kpi.overdue ? "red" : undefined} onClick={() => setSearch({ status: kpi.overdue ? "all" : "checked_out", view: kpi.overdue ? "overdue" : "all" })} active={status === "checked_out" || view === "overdue"} />
        <Kpi label="Under repair" value={String(kpi.repair)} sub={`${counts("at_vendor")} at vendor`} onClick={() => setSearch({ status: "in_repair", view: "all" })} active={status === "in_repair"} />
        <Kpi label="Needs attention" value={String(kpi.attention)} sub="Warranty, service or returns due" tone={kpi.attention ? "amber" : undefined} onClick={() => setSearch({ view: "attention", status: "all" })} active={view === "attention"} />
      </div>

      <section className="pd-panel overflow-hidden">
        <div className="pd-scroll-hide flex gap-1 overflow-x-auto border-b border-border px-3 pt-2">
          {[{ id: "all", name: "All", n: rows.length }, ...statuses.map((x) => ({ id: x.id, name: x.name, n: counts(x.id) }))].map((t) => (
            <button key={t.id} onClick={() => setSearch({ status: t.id, view: "all" })} aria-pressed={status === t.id}
              className={cn("-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] transition-colors", status === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.name}<span className="num rounded bg-subtle px-1 text-[11px] text-muted-foreground">{t.n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <TextInput value={q} onChange={(e) => setSearch({ q: e.target.value || undefined })} placeholder="Search name, asset ID, serial or person" className="pl-8" aria-label="Search assets" />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto" aria-label="Category">
            <option value="">All categories</option>{s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={site} onChange={(e) => setSite(e.target.value)} className="w-auto" aria-label="Location">
            <option value="">All locations</option>{SITES.map((x) => <option key={x}>{x}</option>)}
          </Select>
          {anyFilter && <button onClick={() => { setCat(""); setSite(""); nav({ search: {}, replace: true }); }} className="inline-flex h-8 items-center gap-1 px-1.5 text-[13px] text-muted-foreground hover:text-foreground"><X className="size-3.5" />Clear</button>}
        </div>

        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="pd-table min-w-[880px]">
              <thead><tr><th>Asset</th><th>Category</th><th>Status</th><th>With / location</th><th className="text-right">Book value</th><th>Next up</th></tr></thead>
              <tbody>
                {filtered.map(({ a, book, flags }) => {
                  const st = s.statuses.find((x) => x.id === a.statusId);
                  const holder = a.checkout?.to ?? a.assignedTo;
                  const user = holder?.kind === "user" ? db.users.find((u) => u.id === holder.userId) : undefined;
                  return (
                    <tr key={a.id} className="cursor-pointer" onClick={() => nav({ to: "/app/assets/$assetId", params: { assetId: a.id } })}>
                      <td className="py-2">
                        <Link to="/app/assets/$assetId" params={{ assetId: a.id }} className="flex items-center gap-3 outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                          <AssetThumb a={a} />
                          <span className="min-w-0"><span className="block max-w-[280px] truncate font-medium">{a.name || "Untitled asset"}</span><span className="num block text-[11px] text-muted-foreground">{a.tag}{a.identifier && ` · ${a.identifier}`}</span></span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-[13px] text-muted-foreground">{s.categories.find((c) => c.id === a.categoryId)?.name}</td>
                      <td><StatusPill s={st} />{a.repair && a.repair.stage !== "at_vendor" && <span className="mt-0.5 block text-[11px] text-muted-foreground">{REPAIR_STAGES.find((x) => x.id === a.repair!.stage)?.label}</span>}</td>
                      <td className="text-[13px]">
                        {holder ? <span className="flex items-center gap-2">{user && <UserAvatar user={user} />}<span className="min-w-0"><span className="block max-w-[180px] truncate">{holderName(holder, db)}</span><span className="block max-w-[180px] truncate text-[11px] text-muted-foreground">{a.checkout ? "Checked out" : "Assigned"}</span></span></span>
                          : <span className="block max-w-[200px] truncate text-muted-foreground">{a.site}{a.room && ` · ${a.room}`}</span>}
                      </td>
                      <td className="num text-right text-[13px]">{money(book)}</td>
                      <td><NextUp a={a} flags={flags} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-subtle"><Box className="size-5 text-muted-foreground" /></span>
            <p className="text-sm font-medium">{all.length ? "No assets match these filters" : "No assets registered yet"}</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{all.length ? "Try another status or clear the search." : "Register your first laptop, vehicle or machine to start tracking it."}</p>
            {all.length ? <button onClick={() => { setCat(""); setSite(""); nav({ search: {}, replace: true }); }} className={cn(BTN, "mt-4")}>Clear filters</button> : <Link to="/app/assets/register/new" className={cn(BTN_PRIMARY, "mt-4")}><Plus className="size-3.5" />Register asset</Link>}
          </div>
        )}
        {!!filtered.length && <p className="border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">Showing {filtered.length} of {rows.length} assets</p>}
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, tone, onClick, active }: { label: string; value: string; sub: string; tone?: "red" | "amber"; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("pd-panel p-4 text-left transition-[box-shadow,border-color] hover:border-primary/30", active && "border-primary/40 ring-[3px] ring-primary/10")}>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className={cn("mt-0.5 truncate text-[12px]", tone === "red" ? "text-destructive" : tone === "amber" ? "text-warning" : "text-muted-foreground")}>{sub}</p>
    </button>
  );
}

function NextUp({ a, flags }: { a: Asset; flags: string[] }) {
  if (a.statusId === "disposed") return <span className="text-[12px] text-muted-foreground">{a.disposal ? `${a.disposal.method} ${fmtDate(a.disposal.at)}` : "—"}</span>;
  if (a.statusId === "draft") return <span className="text-[12px] text-muted-foreground">Finish details to activate</span>;
  if (flags.includes("overdue")) return <span className="inline-flex items-center gap-1 text-[12px] text-destructive"><AlertTriangle className="size-3.5" />Return overdue {relDays(daysUntil(a.checkout!.due))}</span>;
  if (a.repair?.eta) return <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Wrench className="size-3.5" />Back {relDays(daysUntil(a.repair.eta))}</span>;
  if (a.checkout) return <span className="text-[12px] text-muted-foreground">Due back {relDays(daysUntil(a.checkout.due))}</span>;
  if (flags.includes("maintenance")) return <span className="text-[12px] text-warning">Service {daysUntil(a.nextMaintenance) < 0 ? "overdue" : "due"} {relDays(daysUntil(a.nextMaintenance))}</span>;
  if (flags.includes("warranty")) return <span className="text-[12px] text-warning">Warranty ends {relDays(daysUntil(a.warrantyEnd))}</span>;
  return <span className="text-[12px] text-muted-foreground">{a.nextMaintenance ? `Service ${fmtDate(a.nextMaintenance)}` : "—"}</span>;
}
