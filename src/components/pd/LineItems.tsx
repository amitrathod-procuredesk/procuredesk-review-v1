import { Package, ChevronDown, ImageIcon, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { lineTotal, money, smartDate, uid } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { ACCOUNTS, CATEGORIES, UOMS, type LineItem, type PRequest } from "@/lib/pd/types";
import { Money } from "./bits";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ItemToolbar } from "./ItemToolbar";
import { cn } from "@/lib/utils";

const blank = (): LineItem => ({ id: uid("li"), description: "", partNumber: "", account: "", vendorId: "", uom: "EACH", qty: 1, unitPrice: 0, tax: 0, shipping: 0, category: "", source: "manual" });

export function LineItems({ r, editable }: { r: PRequest; editable: boolean }) {
  const db = useDB();
  const me = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const editing = r.items.find((i) => i.id === edit);
  const [sel, setSel] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);

  const patch = (id: string, p: Partial<LineItem>, label?: string) =>
    updateRequest(r.id, (x, d) => {
      const l = x.items.find((i) => i.id === id);
      if (!l) return;
      if (p.vendorId !== undefined && p.vendorId !== l.vendorId)
        log(x, `Supplier on “${l.description || "line"}” changed to ${d.vendors.find((v) => v.id === p.vendorId)?.name ?? "none"}`, "edit", me?.id);
      else if (label) log(x, label, "edit", me?.id);
      Object.assign(l, p);
    });
  const add = () => {
    const n = blank();
    updateRequest(r.id, (x) => { x.items.push(n); log(x, "Line item added", "edit", me?.id); });
    setEdit(n.id);
  };
  const dup = (ids: string[]) => updateRequest(r.id, (x) => { ids.forEach((id) => { const l = x.items.find((i) => i.id === id); if (l) x.items.push({ ...l, id: uid("li") }); }); log(x, `${ids.length} line item(s) duplicated`, "edit", me?.id); });
  const del = (ids: string[]) => { updateRequest(r.id, (x) => { x.items = x.items.filter((i) => !ids.includes(i.id)); log(x, `${ids.length} line item(s) deleted`, "edit", me?.id); }); setSel([]); };
  const vendorName = (id: string) => db.vendors.find((v) => v.id === id)?.name ?? "";
  const allSel = r.items.length > 0 && sel.length === r.items.length;
  const [view, setView] = useState<"list" | "supplier">("list");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const groups = Object.values(r.items.reduce<Record<string, { id: string; name: string; items: LineItem[] }>>((acc, l) => {
    const k = l.vendorId || "_none";
    (acc[k] ??= { id: k, name: vendorName(l.vendorId), items: [] }).items.push(l);
    return acc;
  }, {}));

  const card = (l: LineItem, i: number, hideSupplier = false) => {
    const isOpen = open === l.id;
    const other = (l.tax || 0) + (l.shipping || 0);
    const sup = vendorName(l.vendorId);
    const meta: ReactNode[] = [
      !hideSupplier && (sup ? <span key="s" className="font-medium text-foreground/80">{sup}</span> : <span key="s" className="text-warning">No supplier</span>),
      <span key="a" className={cn(!l.account && "text-warning")}>{l.account || "No account"}</span>,
      l.partNumber && <span key="p" className="num">{l.partNumber}</span>,
    ].filter(Boolean);
    return (
      <li key={l.id} className={cn("group relative rounded-lg border border-transparent transition-colors hover:bg-subtle/60", sel.includes(l.id) && "bg-primary/[0.04]", edit === l.id && "bg-primary/[0.05]")}>
        <div className={cn("flex items-start gap-3 px-3 py-2.5", editable && "cursor-pointer")} onClick={(e) => { if ((e.target as HTMLElement).closest("input,select,button,a,textarea,[role=menu]")) return; if (editable) setEdit(l.id); else setOpen(isOpen ? null : l.id); }}>
          {editable && <input type="checkbox" className="mt-0.5 shrink-0" aria-label={`Select line ${i + 1}`} checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="num w-4 shrink-0 self-start pt-0.5 text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-subtle text-muted-foreground/60">
                {l.imageUrl ? <img src={l.imageUrl} alt="" loading="lazy" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <ImageIcon className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("line-clamp-2 min-w-0 break-words text-[13px] font-medium leading-[1.35]", editable && "transition-colors group-hover:text-primary", !l.description && "text-muted-foreground")} title={l.description}>{l.description || "Untitled item"}</p>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className="min-w-0 truncate">{meta.map((m, k) => <span key={k}>{k > 0 && <span className="mx-1.5 text-border">•</span>}{m}</span>)}</span>
                  {l.source === "ai" && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">AI</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-end justify-between gap-4 pl-6 sm:block sm:pl-0 sm:text-right">
              {editable ? (
                <div className="num flex items-center gap-1.5 text-[11.5px] text-muted-foreground sm:justify-end">
                  <div className="inline-flex h-6 items-center rounded-md border border-border bg-card transition-colors focus-within:border-primary/60 hover:border-primary/40">
                    <button type="button" aria-label="Decrease quantity" disabled={l.qty <= 1} className="flex h-full w-5 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground disabled:opacity-40" onClick={() => patch(l.id, { qty: Math.max(1, l.qty - 1) })}>−</button>
                    <input type="number" min={1} aria-label={`Quantity for line ${i + 1}`} className="h-full w-9 border-x border-border bg-transparent text-center text-[12px] font-medium text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={l.qty} onChange={(e) => patch(l.id, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                    <button type="button" aria-label="Increase quantity" className="flex h-full w-5 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground" onClick={() => patch(l.id, { qty: l.qty + 1 })}>+</button>
                  </div>
                  <span>× <Money v={l.unitPrice} /><span className="text-muted-foreground/70"> /{l.uom.toLowerCase()}</span></span>
                </div>
              ) : (
                <p className="num text-[11.5px] text-muted-foreground">{l.qty} × <Money v={l.unitPrice} /><span className="text-muted-foreground/70"> /{l.uom.toLowerCase()}</span></p>
              )}
              <Money v={lineTotal(l)} className="text-sm font-semibold sm:mt-0.5 sm:block" />
              {other > 0 && <p className="num text-[10.5px] text-muted-foreground" title={`Tax ${l.tax || 0} · Shipping ${l.shipping || 0}`}>incl. {[l.tax ? <>tax <Money key="t" v={l.tax} /></> : null, l.shipping ? <>shipping <Money key="s" v={l.shipping} /></> : null].filter(Boolean).map((x, k) => <span key={k}>{k > 0 && " · "}{x}</span>)}</p>}
            </div>
          </div>
          <div className="-mr-1 flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">{actions(l, isOpen)}</div>
        </div>
        {isOpen && <div className="animate-in fade-in slide-in-from-top-1 border-t border-border bg-subtle/40 px-4 py-3 sm:pl-12">{l.description.length > 80 && <p className="mb-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{l.description}</p>}<LineDetail l={l} /></div>}
      </li>
    );
  };
  const actions = (l: LineItem, isOpen: boolean) => (
    <>
      <button aria-label={isOpen ? "Hide details" : "Show details"} onClick={() => setOpen(isOpen ? null : l.id)} className="rounded p-1 text-muted-foreground hover:bg-subtle"><ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} /></button>
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Line actions" className="rounded p-1 text-muted-foreground hover:bg-subtle"><MoreHorizontal className="size-3.5" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEdit(l.id)}><Pencil /> Edit details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => dup([l.id])}><Copy /> Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => del([l.id])}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
  const LIMIT = 8;
  const q = filter.trim().toLowerCase();
  const visibleItems = q ? r.items.filter((l) => [l.description, l.partNumber, vendorName(l.vendorId), l.account].join(" ").toLowerCase().includes(q)) : r.items;
  const more = (n: number, k: string) => n > LIMIT && (
    <button onClick={() => setExpanded((s) => ({ ...s, [k]: !s[k] }))} className="mt-1.5 w-full rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
      {expanded[k] ? "Show less" : `Show ${n - LIMIT} more item${n - LIMIT === 1 ? "" : "s"}`}
    </button>
  );
  const cap = (arr: LineItem[], k: string) => (expanded[k] || q ? arr : arr.slice(0, LIMIT));

  return (
    <div id="line-items">
      {editable && <ItemToolbar r={r} />}
      {editable && sel.length > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-accent animate-in fade-in slide-in-from-top-1 px-3 py-1.5 text-sm text-accent-foreground">
          <span className="font-medium">{sel.length} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setMulti(true)}><Pencil /> Multi-edit</Button>
          <Button size="sm" variant="ghost" onClick={() => dup(sel)}><Copy /> Duplicate</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(sel)}><Trash2 /> Delete</Button>
          <button className="ml-auto text-xs" onClick={() => setSel([])}>Clear</button>
        </div>
      )}

      {r.items.length > 0 && <div className="mb-2 flex items-center gap-2">
        {editable && r.items.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : r.items.map((i) => i.id))} /> Select all
          </label>
        )}
        {r.items.length > 10 && (
          <input aria-label="Filter items" className="pd-input h-7 w-44 text-xs" placeholder={`Filter ${r.items.length} items…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
        {view === "supplier" && groups.length > 1 && (
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(collapsed.length === groups.length ? [] : groups.map((g) => g.id))}>{collapsed.length === groups.length ? "Expand all" : "Collapse all"}</button>
        )}
        <div role="tablist" aria-label="Item view" className="ml-auto inline-flex rounded-md border border-border bg-subtle/60 p-0.5 text-xs">
          {([["list", "List"], ["supplier", "By supplier"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("rounded px-2.5 py-1 font-medium transition-colors", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>}

      {r.items.length === 0 && (
        <div className="animate-in fade-in flex flex-col items-center px-4 py-8 text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent text-primary"><Package className="size-5" strokeWidth={1.75} /></div>
          <p className="text-sm font-semibold text-foreground">Start by adding line items</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Search above{editable && <>, <button className="text-primary hover:underline" onClick={() => window.dispatchEvent(new Event("pd:punchout"))}>select a punch-out supplier</button>, or <button className="text-primary hover:underline" onClick={() => window.dispatchEvent(new Event("pd:import"))}>import a file</button></>}
          </p>
        </div>
      )}

      {view === "list" ? (
        <div>
          <ul className="divide-y divide-border/60">{cap(visibleItems, "_list").map((l) => card(l, r.items.indexOf(l)))}</ul>
          {!q && more(visibleItems.length, "_list")}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const items = q ? g.items.filter((l) => visibleItems.includes(l)) : g.items;
            if (!items.length) return null;
            const isCol = collapsed.includes(g.id) && !q;
            return (
              <section key={g.id} className="rounded-lg bg-subtle/40">
                <button onClick={() => setCollapsed((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : [...c, g.id]))} aria-expanded={!isCol} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isCol && "-rotate-90")} />
                  <span className="text-[13px] font-semibold">{g.name || "No supplier"}</span>
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                  <Money v={items.reduce((s, x) => s + lineTotal(x), 0)} className="ml-auto text-[13px] font-semibold" />
                </button>
                {!isCol && (
                  <div className="animate-in fade-in px-2 pb-2">
                    <ul className="divide-y divide-border/60">{cap(items, g.id).map((l) => card(l, r.items.indexOf(l), true))}</ul>
                    {!q && more(items.length, g.id)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {q && visibleItems.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No items match “{filter}”.</p>}

      {editable && r.items.length > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={add}><Plus /> Add item</Button>
          <span className="text-xs text-muted-foreground">{r.items.length} line{r.items.length === 1 ? "" : "s"}</span>
        </div>
      )}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-[440px]">
          {editing && (
            <>
              <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-5 py-4 pr-12">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] text-primary font-semibold text-muted-foreground">{(editing.category || editing.description || "?").slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 text-left">
                  <p className="truncate text-[11px] text-muted-foreground">Line {r.items.indexOf(editing) + 1}{vendorName(editing.vendorId) && ` · ${vendorName(editing.vendorId)}`}{editing.catalogId && " · Catalog"}</p>
                  <SheetTitle className="truncate text-[15px] font-semibold leading-tight">{editing.description || "Untitled item"}</SheetTitle>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 animate-in fade-in slide-in-from-right-2 duration-300">
                  <p className="pd-drawer-sec sm:col-span-2">Item</p>
                  <DField label="Description" req className="sm:col-span-2"><input className={cn("pd-input h-9 rounded-md bg-card text-sm", !editing.description && "border-destructive")} value={editing.description} onChange={(e) => patch(editing.id, { description: e.target.value })} /></DField>
                  <DField label="Account" req className="sm:col-span-2">
                    <select className={cn("pd-input h-9 rounded-md bg-card text-sm", !editing.account && "border-destructive")} value={editing.account} onChange={(e) => patch(editing.id, { account: e.target.value })}>
                      <option value="">Select…</option>{ACCOUNTS.map((c, i) => <option key={c} value={c}>{10 + i * 5} · {c}</option>)}
                    </select>
                  </DField>
                  <p className="pd-drawer-sec sm:col-span-2">Pricing & supplier</p>
                  <DField label="Quantity" req><input type="number" min={0} className="pd-input num h-9 rounded-md bg-card text-sm" value={editing.qty} onChange={(e) => patch(editing.id, { qty: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Unit price" req><input type="number" min={0} step="0.01" className="pd-input num h-9 rounded-md bg-card text-sm" value={editing.unitPrice} onChange={(e) => patch(editing.id, { unitPrice: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Supplier">
                    <select className="pd-input h-9 rounded-md bg-card text-sm" value={editing.vendorId} onChange={(e) => patch(editing.id, { vendorId: e.target.value })}>
                      <option value="">Select…</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </DField>
                  <DField label="Supplier item #"><input className="pd-input num h-9 rounded-md bg-card text-sm" placeholder="-" value={editing.partNumber} onChange={(e) => patch(editing.id, { partNumber: e.target.value })} /></DField>
                  <p className="pd-drawer-sec sm:col-span-2">Classification</p>
                  <DField label="Item type">
                    <select className="pd-input h-9 rounded-md bg-card text-sm" value={editing.itemType ?? "Material"} onChange={(e) => patch(editing.id, { itemType: e.target.value })}>{["Material", "Service", "Software", "Asset"].map((x) => <option key={x}>{x}</option>)}</select>
                  </DField>
                  <DField label="UOM"><select className="pd-input h-9 rounded-md bg-card text-sm" value={editing.uom} onChange={(e) => patch(editing.id, { uom: e.target.value })}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select></DField>
                  <DField label="Category">
                    <select className="pd-input h-9 rounded-md bg-card text-sm" value={editing.category} onChange={(e) => patch(editing.id, { category: e.target.value })}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                  </DField>
                  <DField label="Class">
                    <select className="pd-input h-9 rounded-md bg-card text-sm" value={editing.itemClass ?? ""} onChange={(e) => patch(editing.id, { itemClass: e.target.value })}><option value="">Select…</option>{["Office Supplies", "Hardware", "MRO", "Capital", "Operating"].map((c) => <option key={c}>{c}</option>)}</select>
                  </DField>
                  <DField label="Project code"><input className="pd-input h-9 rounded-md bg-card text-sm" placeholder="-" value={editing.projectCode ?? ""} onChange={(e) => patch(editing.id, { projectCode: e.target.value })} /></DField>
                  <DField label="Image URL"><input className="pd-input h-9 rounded-md bg-card text-sm" placeholder="https://…" value={editing.imageUrl ?? ""} onChange={(e) => patch(editing.id, { imageUrl: e.target.value })} /></DField>
                  <DField label="Web link"><input className="pd-input h-9 rounded-md bg-card text-sm" placeholder="-" value={editing.webLink ?? ""} onChange={(e) => patch(editing.id, { webLink: e.target.value })} /></DField>
                  <p className="pd-drawer-sec sm:col-span-2">Costs & delivery</p>
                  <DField label="Tax"><input type="number" min={0} step="0.01" className="pd-input num h-9 rounded-md bg-card text-sm" value={editing.tax} onChange={(e) => patch(editing.id, { tax: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Shipping"><input type="number" min={0} step="0.01" className="pd-input num h-9 rounded-md bg-card text-sm" value={editing.shipping} onChange={(e) => patch(editing.id, { shipping: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Delivery date" className="sm:col-span-2"><input type="date" className="pd-input h-9 rounded-md bg-card text-sm" value={editing.deliveryDate ?? ""} onChange={(e) => patch(editing.id, { deliveryDate: e.target.value })} /></DField>
                  <DField label="Notes" className="sm:col-span-2"><textarea className="pd-input h-16 resize-none rounded-md bg-card py-2 text-sm" placeholder="-" value={editing.notes ?? ""} onChange={(e) => patch(editing.id, { notes: e.target.value })} /></DField>
                </div>
              </div>
              <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border bg-card px-5 py-3 sm:justify-between">
                <div className="leading-tight"><p className="text-[11px] text-muted-foreground">Line total</p><Money v={lineTotal(editing)} className="text-base font-semibold" /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { del([editing.id]); setEdit(null); }}><Trash2 /> Delete</Button>
                  <Button size="sm" className="px-5" onClick={() => setEdit(null)}>Done</Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <MultiEdit open={multi} onOpenChange={setMulti} r={r} ids={sel} />
    </div>
  );
}

function DField({ label, req, className, children }: { label: string; req?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}{req && <span className="text-destructive">*</span>}</span>
      {children}
    </label>
  );
}

function LineDetail({ l }: { l: LineItem; editable?: boolean; onPatch?: (p: Partial<LineItem>) => void }) {
  const db = useDB();
  const v = db.vendors.find((x) => x.id === l.vendorId);
  const cat = db.catalog.find((c) => c.id === l.catalogId);
  const dash = (x?: string | null) => (x && String(x).trim() ? x : "—");
  const items: [string, ReactNode][] = [
    ["Supplier item #", <span className="num">{dash(l.partNumber)}</span>],
    ["Item type", dash(l.itemType ?? "Material")],
    ["Source from", cat ? "Catalog" : "Non-catalog"],
    ["Category", dash(l.category)],
    ["Account", dash(l.account)],
    ["UOM", dash(l.uom)],
    ["Class", dash(l.itemClass)],
    ["Project code", dash(l.projectCode)],
    ["Tax", <Money v={l.tax || 0} />],
    ["Shipping", <Money v={l.shipping || 0} />],
    ["Delivery date", l.deliveryDate ? smartDate(l.deliveryDate) : "—"],
    ["Contract", v ? (v.contractActive ? `Active · ${v.name}` : "No contract") : "—"],
    ["Web link", l.webLink ? <a href={l.webLink} target="_blank" rel="noreferrer" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>Open link</a> : "—"],
    ["Notes", dash(l.notes)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([k, val]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
          <dd className="mt-1 truncate text-sm text-foreground">{val}</dd>
        </div>
      ))}
    </dl>
  );
}

function MultiEdit({ open, onOpenChange, r, ids }: { open: boolean; onOpenChange: (o: boolean) => void; r: PRequest; ids: string[] }) {
  const db = useDB();
  const me = useMe();
  const [vals, setVals] = useState<{ vendorId?: string; account?: string; category?: string; deliveryDate?: string }>({});
  const changed = Object.entries(vals).filter(([, v]) => v);
  const apply = () => {
    updateRequest(r.id, (x) => {
      x.items.forEach((l) => { if (ids.includes(l.id)) changed.forEach(([k, v]) => ((l as unknown as Record<string, unknown>)[k] = v)); });
      log(x, `Multi-edit: ${changed.map(([k]) => k.replace("vendorId", "supplier")).join(", ")} on ${ids.length} lines`, "edit", me?.id);
    });
    setVals({});
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {ids.length} line items</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Only fields you set will change. Leave a field empty to keep each item's current value.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="pd-label">Supplier</span><select className="pd-input" value={vals.vendorId ?? ""} onChange={(e) => setVals({ ...vals, vendorId: e.target.value })}><option value="">Keep current</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <label><span className="pd-label">Account</span><select className="pd-input" value={vals.account ?? ""} onChange={(e) => setVals({ ...vals, account: e.target.value })}><option value="">Keep current</option>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label><span className="pd-label">Category</span><select className="pd-input" value={vals.category ?? ""} onChange={(e) => setVals({ ...vals, category: e.target.value })}><option value="">Keep current</option>{CATEGORIES.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label><span className="pd-label">Delivery date</span><input type="date" className="pd-input" value={vals.deliveryDate ?? ""} onChange={(e) => setVals({ ...vals, deliveryDate: e.target.value })} /></label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!changed.length} onClick={apply}>Apply to {ids.length} items</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
