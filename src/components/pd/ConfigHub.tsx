import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, ChevronRight, Clock, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/pd/bits";
import { CONFIG_COUNT, CONFIG_GROUPS, CONFIG_ITEMS, findConfig, type ConfigItem } from "@/lib/pd/configCatalog";
import { cn } from "@/lib/utils";

const RECENT_KEY = "pd-config-recent";
const CONN_KEY = "pd-integrations";
const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

function Hl({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-[2px] bg-primary/15 text-foreground">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Configurations hub (?section=config) and the detail page of one setting (?section=config&item=…). */
export function ConfigHub({ item, renderCompany }: { item?: string; renderCompany: () => ReactNode }) {
  const nav = useNavigate();
  const [recent, setRecent] = useState<string[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => { setRecent(read(RECENT_KEY)); setConnected(read(CONN_KEY)); }, []);

  const open = (it: ConfigItem) => {
    const next = [it.id, ...recent.filter((x) => x !== it.id)].slice(0, 4);
    setRecent(next); write(RECENT_KEY, next);
    if (it.section) nav({ to: "/app/admin", search: { section: it.section } });
    else nav({ to: "/app/admin", search: { section: "config", item: it.id } });
  };
  const toggleConn = (id: string, name: string) => {
    const on = connected.includes(id);
    const next = on ? connected.filter((x) => x !== id) : [...connected, id];
    setConnected(next); write(CONN_KEY, next);
    toast.success(on ? `${name} disconnected` : `${name} connected`, { description: on ? undefined : "Demo connection — no data is synced." });
  };

  const cur = findConfig(item);
  if (item && cur) return <Detail it={cur} connected={connected.includes(cur.id)} onToggle={() => toggleConn(cur.id, cur.label)} renderCompany={renderCompany} />;
  return <Hub recent={recent} connected={connected} open={open} />;
}

function Hub({ recent, connected, open }: { recent: string[]; connected: string[]; open: (it: ConfigItem) => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const term = q.trim().toLowerCase();
  const results = useMemo(() => (term ? CONFIG_ITEMS.filter((x) => `${x.label} ${x.hint} ${x.group.label}`.toLowerCase().includes(term)) : []), [term]);
  const recentItems = recent.map(findConfig).filter(Boolean) as (typeof CONFIG_ITEMS)[number][];
  const groups = CONFIG_GROUPS.filter((g) => g.kind !== "integrations");
  const integrations = CONFIG_GROUPS.find((g) => g.kind === "integrations")!;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">General settings</p>
          <h1 className="pd-h1">Configurations</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground"><span className="num">{CONFIG_COUNT}</span> settings, grouped by what you want to do.</p>
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter" && results[0]) open(results[0]); }} placeholder="Search settings" aria-label="Search settings" className="pd-input pl-9 pr-9" />
          {q ? (
            <button onClick={() => { setQ(""); ref.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-subtle"><X className="size-3.5" /></button>
          ) : <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted-foreground">/</kbd>}
        </label>
      </div>

      {term ? (
        results.length === 0 ? <Empty title={`No settings match “${q.trim()}”`} body="Try a broader word like “budget”, “PO” or “email”." /> : (
          <div className="animate-in fade-in rounded-lg border border-border bg-surface">
            <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground"><span className="num">{results.length}</span> {results.length === 1 ? "result" : "results"} · Enter opens the first</p>
            <ul className="divide-y divide-border">
              {results.map((x) => (
                <li key={x.id}>
                  <button onClick={() => open(x)} className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none">
                    <x.group.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium"><Hl text={x.label} q={q.trim()} /></span>
                      <span className="block truncate text-xs text-muted-foreground">{x.group.label} · <Hl text={x.hint} q={q.trim()} /></span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <div className="animate-in fade-in space-y-6">
          {recentItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" /> Recent</span>
              {recentItems.map((x) => (
                <button key={x.id} onClick={() => open(x)} className="h-7 rounded-full border border-border bg-surface px-3 text-xs transition-colors hover:border-primary/40 hover:text-primary">{x.label}</button>
              ))}
            </div>
          )}

          <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
            {groups.map((g) => (
              <section key={g.id} className="mb-4 break-inside-avoid rounded-lg border border-border bg-surface">
                <header className="flex items-center gap-2 px-4 pb-1.5 pt-3.5">
                  <g.icon className="size-4 text-primary" />
                  <h2 className="flex-1 text-[13px] font-semibold">{g.label}</h2>
                  <span className="num text-[11px] text-muted-foreground">{g.items.length}</span>
                </header>
                <ul className="px-1.5 pb-1.5">
                  {g.items.map((x) => (
                    <li key={x.id}>
                      <button onClick={() => open(x)} title={x.hint} className="group flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none">
                        <span className="flex-1 truncate">{x.label}</span>
                        {x.section
                          ? <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-label="Opens another admin page" />
                          : <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section>
            <header className="mb-2.5 flex items-center gap-2">
              <integrations.icon className="size-4 text-primary" />
              <h2 className="text-[13px] font-semibold">Integrations</h2>
              <span className="text-[11px] text-muted-foreground"><span className="num">{connected.length}</span> of <span className="num">{integrations.items.length}</span> connected</span>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {integrations.items.map((x) => {
                const on = connected.includes(x.id);
                return (
                  <button key={x.id} onClick={() => open(x)} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-primary/40">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-[11px] font-semibold text-foreground/80">{x.label.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{x.label}</span>
                      <span className={cn("flex items-center gap-1 truncate text-[11px]", on ? "text-success" : "text-muted-foreground")}>
                        {on && <span className="size-1.5 rounded-full bg-success" />}{on ? "Connected" : x.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Detail({ it, connected, onToggle, renderCompany }: { it: (typeof CONFIG_ITEMS)[number]; connected: boolean; onToggle: () => void; renderCompany: () => ReactNode }) {
  const isInt = it.group.kind === "integrations";
  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-200">
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/app/admin" search={{ section: "config" }} className="inline-flex items-center gap-1 hover:text-primary"><ArrowLeft className="size-3.5" /> Configurations</Link>
        <ChevronRight className="size-3" /> <span>{it.group.label}</span>
      </nav>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="pd-h1">{it.label}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{isInt ? `${it.hint} integration` : it.hint}</p>
        </div>
        {isInt && <Button size="sm" variant={connected ? "outline" : "default"} onClick={onToggle}>{connected ? "Disconnect" : "Connect"}</Button>}
      </div>
      {it.id === "company" ? renderCompany() : (
        <Empty
          title={isInt ? (connected ? `${it.label} is connected` : `Connect ${it.label}`) : `${it.label} settings`}
          body={isInt ? (connected ? "Demo connection — sync settings will appear here." : "Connect to sync suppliers, accounts and transactions.") : "Options for this setting will appear here. Share the requirements and we'll build this screen next."}
        />
      )}
    </div>
  );
}
