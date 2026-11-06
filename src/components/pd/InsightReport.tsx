import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, Download, List, RefreshCw, Table2, SlidersHorizontal } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, TextInput } from "@/components/pd/form";
import { Tool, ToolHeader, ToolContent, ToolInput } from "@/components/ai-elements/tool";
import { type InsightReport as Report, type InsightQuery } from "@/lib/pd/insights";
import { useDB } from "@/lib/pd/store";
import { cn } from "@/lib/utils";

export function InsightReport({
  report,
  onRefresh,
  loading,
}: {
  report: Report;
  onRefresh: (q: InsightQuery) => void;
  loading: boolean;
}) {
  const db = useDB();
  const [view, setView] = useState<"chart" | "table" | "sources">("chart");
  const [page, setPage] = useState(0);
  const money = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: report.currency }).format(v);
  const update = (q: Partial<InsightQuery>) => {
    setPage(0);
    onRefresh({ ...report.query, ...q });
  };
  const exportCsv = () => {
    const cols = [
      "id",
      "label",
      "date",
      "supplier",
      "user",
      "department",
      "category",
      "account",
      "amount",
      "quantity",
    ] as const;
    const csv = [
      cols.join(","),
      ...report.rows.map((r) =>
        cols.map((k) => `"${String(r[k]).replaceAll('"', '""')}"`).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "procuredesk-insights.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const budget = report.query.topic === "budgets";
  const filterKeys: ("department" | "supplier" | "user")[] = budget
    ? ["department"]
    : ["department", "supplier", "user"];
  return (
    <section className="min-w-0 space-y-4" aria-label={report.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{report.title}</h2>
          <p className="text-xs text-muted-foreground">
            {budget
              ? "Current snapshot"
              : `${report.query.start ?? "All dates"} ${report.query.end ? `– ${report.query.end}` : ""}`}{" "}
            · {report.currency}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Refresh current records"
            aria-label="Refresh report"
            disabled={loading}
            onClick={() => onRefresh(report.query)}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" disabled={!report.available} onClick={exportCsv}>
            <Download />
            Export
          </Button>
        </div>
      </div>
      {report.demo && (
        <p className="text-xs font-medium text-primary">Demo data · Sample financial records</p>
      )}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-xs text-muted-foreground">{budget ? "Committed" : "Total value"}</p>
          <p className="mt-1 break-words text-2xl font-semibold">
            {report.available ? money(report.total) : "Not available"}
          </p>
        </div>
        <div className="border-l border-border pl-4">
          <p className="text-xs text-muted-foreground">
            {budget ? "Budgets" : report.query.topic === "items" ? "Units received" : "Line items"}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {report.available
              ? (report.query.topic === "items"
                  ? report.rows.reduce((s, r) => s + r.quantity, 0)
                  : report.count
                ).toLocaleString()
              : "—"}
          </p>
        </div>
      </div>
      {report.available && (
        <>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><SlidersHorizontal />Filters · {report.query.group === "user" ? "Requestor" : report.query.group}</Button></PopoverTrigger>
            <PopoverContent align="start" className="w-96 max-w-[calc(100vw-32px)]">
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="min-w-32 flex-1 text-xs text-muted-foreground">
              Group by
              <Select
                aria-label="Group report by"
                value={report.query.group}
                onChange={(e) => update({ group: e.target.value as InsightQuery["group"] })}
              >
                {(budget
                  ? ["budget", "department", "category"]
                  : ["month", "supplier", "user", "department", "category", "account", "item"]
                ).map((g) => (
                  <option key={g} value={g}>
                    {g === "user" ? "Requestor" : g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </Select>
            </label>
            {filterKeys.map((k) => (
              <label key={k} className="min-w-32 flex-1 text-xs text-muted-foreground">
                {k === "user" ? "Requestor" : k.charAt(0).toUpperCase() + k.slice(1)}
                <Select
                  aria-label={`Filter ${k}`}
                  value={report.query[k] ?? ""}
                  onChange={(e) => update({ [k]: e.target.value || null })}
                >
                  <option value="">All</option>
                  {(k === "department"
                    ? db.departments
                    : k === "supplier"
                      ? db.vendors
                      : db.users
                  ).map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
            {!budget && (
              <>
                <label className="text-xs text-muted-foreground">
                  From
                  <TextInput
                    aria-label="Report start date"
                    type="date"
                    value={report.query.start ?? ""}
                    onChange={(e) => update({ start: e.target.value || null })}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  To
                  <TextInput
                    aria-label="Report end date"
                    type="date"
                    value={report.query.end ?? ""}
                    onChange={(e) => update({ end: e.target.value || null })}
                  />
                </label>
              </>
            )}
          </div>
            </PopoverContent>
          </Popover>
          <div className="flex gap-1 border-b border-border pb-2">
            {(
              [
                { id: "chart", icon: BarChart3, label: "Chart" },
                { id: "table", icon: Table2, label: "Breakdown" },
                { id: "sources", icon: List, label: "Records" },
              ] as const
            ).map((v) => (
              <Button
                key={v.id}
                variant={view === v.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setView(v.id);
                  setPage(0);
                }}
              >
                <v.icon />
                {v.label}
              </Button>
            ))}
          </div>
          {!report.rows.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No records match these filters.
            </div>
          ) : view === "chart" ? (
            <div className="h-64 min-w-0 rounded-lg border border-border bg-surface p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={report.groups.slice(0, 20)}
                  margin={{ left: 4, right: 8, bottom: 8, top: 16 }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v) =>
                      String(v).length > 14 ? String(v).slice(0, 14) + "…" : String(v)
                    }
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("en", { notation: "compact" }).format(v)
                    }
                    width={50}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--subtle)" }}
                    formatter={(v) => money(Number(v))}
                    contentStyle={{
                      background: "var(--surface)",
                      borderColor: "var(--border)",
                      borderRadius: 6,
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    name="Value"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                    onClick={() => setView("sources")}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>{view === "table" ? "Group" : "Record"}</th>
                    {view === "sources" && <th>{budget ? "Allocated" : "Supplier"}</th>}
                    <th className="text-right">{budget ? "Committed" : "Value"}</th>
                    {budget && view === "sources" && <th>Remaining</th>}
                  </tr>
                </thead>
                <tbody>
                  {view === "table"
                    ? report.groups.slice(page * 15, page * 15 + 15).map((g) => (
                        <tr key={g.label}>
                          <td>{g.label}</td>
                          <td>{money(g.amount)}</td>
                        </tr>
                      ))
                    : report.rows.slice(page * 15, page * 15 + 15).map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.requestId ? (
                              <Link
                                to="/app/requests/$id"
                                params={{ id: r.requestId }}
                                className="text-primary hover:underline"
                              >
                                {r.requestId}
                              </Link>
                            ) : (
                              r.label
                            )}
                            <p className="max-w-64 truncate text-xs text-muted-foreground">
                              {r.requestId ? r.label : r.department}
                            </p>
                          </td>
                          <td>{budget ? money(r.allocated ?? 0) : r.supplier}</td>
                          <td>{money(r.amount)}</td>
                          {budget && <td>{money(r.remaining ?? 0)}</td>}
                        </tr>
                      ))}
                </tbody>
              </table>
              {(view === "table" ? report.groups : report.rows).length > 15 && (
                <div className="flex items-center justify-end gap-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs">Page {page + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      (page + 1) * 15 >= (view === "table" ? report.groups : report.rows).length
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
          {view === "chart" && report.groups.length > 20 && (
            <p className="text-xs text-muted-foreground">
              Top 20 groups shown. Breakdown and export include every group.
            </p>
          )}
        </>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        {report.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>
          Read from workspace version {report.version} ·{" "}
          {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>
      <Tool defaultOpen={false}>
        <ToolHeader type="tool-create_report" state="output-available" title="Report calculation" />
        <ToolContent>
          <ToolInput input={report.query} />
        </ToolContent>
      </Tool>
    </section>
  );
}
