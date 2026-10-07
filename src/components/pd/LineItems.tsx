import { ChevronDown, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
  const groups = Object.values(r.items.reduce<Record<string, { id: string; name: string; items: LineItem[] }>>((acc, l) => {
    const k = l.vendorId || "_none";
    (acc[k] ??= { id: k, name: vendorName(l.vendorId), items: [] }).items.push(l);
    return acc;
  }, {}));

  const card = (l: LineItem, i: number, hideSupplier = false) => {
    const isOpen = open === l.id;
    const other = (l.tax || 0) + (l.shipping || 0);
    const fields: [string, ReactNode, string?][] = [
      ["Account", l.account || "—"],
      ...(hideSupplier ? [] : [["Supplier", vendorName(l.vendorId) || <span className="text-warning">Not set</span>] as [string, ReactNode]]),
      ["UOM", l.uom],
      ["Qty", <span className="num">{l.qty}</span>, "text-right"],
      ["Unit price", <Money v={l.unitPrice} />, "text-right"],
      ["Other", other ? <Money v={other} /> : "—", "text-right"],
    ];
    return (
      <li key={l.id} className={cn("group rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-sm", sel.includes(l.id) && "border-primary/40 bg-primary/[0.03]", edit === l.id && "border-primary/50 ring-2 ring-primary/10")}>
        <div className={cn("flex gap-3 p-3 sm:p-4", editable && "cursor-pointer")} onClick={(e) => { if ((e.target as HTMLElement).closest("input,select,button,a,textarea,[role=menu]")) return; if (editable) setEdit(l.id); else setOpen(isOpen ? null : l.id); }}>
          {editable && <input type="checkbox" className="mt-1 shrink-0" aria-label={`Select line ${i + 1}`} checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className={cn("line-clamp-2 text-sm font-medium leading-snug break-words", editable && "group-hover:text-primary transition-colors", !l.description && "text-muted-foreground")} title={l.description}>{l.description || "Untitled item"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                  <span className="num">#{i + 1}</span><span>·</span><span className="num">{l.partNumber || "No part number"}</span>
                  {l.catalogId && <span className="text-success">· Catalog</span>}
                  {l.source === "ai" && <span className="ai-mark">· AI added</span>}
                  {l.source === "quote" && <span>· From quote</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money v={lineTotal(l)} className="block text-[15px] font-semibold" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
              </div>
              <div className="-mr-1 flex shrink-0 items-start gap-0.5">
                <button aria-label={isOpen ? "Hide details" : "Show details"} onClick={() => setOpen(isOpen ? null : l.id)} className="rounded p-1 text-muted-foreground hover:bg-subtle"><ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} /></button>
                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Line actions" className="rounded p-1 text-muted-foreground hover:bg-subtle"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEdit(l.id)}><Pencil /> Edit details</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => dup([l.id])}><Copy /> Duplicate</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => del([l.id])}><Trash2 /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            <dl className={cn("mt-3 grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border/70 pt-3", hideSupplier ? "sm:grid-cols-5" : "sm:grid-cols-6")}>
              {fields.map(([k, v, align]) => (
                <div key={k} className={cn("min-w-0", align && "sm:text-right")}>
                  <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 truncate text-[13px]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {isOpen && <div className="animate-in fade-in slide-in-from-top-1 border-t border-border bg-subtle/40 px-4 py-3 sm:pl-11"><LineDetail l={l} /></div>}
      </li>
    );
  };

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

      <div className="mb-2 flex items-center gap-2">
        {editable && r.items.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : r.items.map((i) => i.id))} /> Select all
          </label>
        )}
        <div role="tablist" aria-label="Item view" className="ml-auto inline-flex rounded-md border border-border bg-subtle/60 p-0.5 text-xs">
          {([["list", "List"], ["supplier", "By supplier"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("rounded px-2.5 py-1 font-medium transition-colors", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>

      {r.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No items yet. Search the catalog above, punch out to a supplier, import a quote, or ask AI.</div>
      )}

      {view === "list" ? (
        <ul className="space-y-2">{r.items.map((l, i) => card(l, i))}</ul>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.id} className="animate-in fade-in">
              <header className="mb-2 flex items-center gap-2 px-1">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">{(g.name || "?").slice(0, 2).toUpperCase()}</span>
                <span className="text-sm font-semibold">{g.name || "No supplier"}</span>
                <span className="text-xs text-muted-foreground">· {g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
                <Money v={g.items.reduce((s, x) => s + lineTotal(x), 0)} className="ml-auto text-sm font-semibold" />
              </header>
              <ul className="space-y-2">{g.items.map((l) => card(l, r.items.indexOf(l), true))}</ul>
            </section>
          ))}
        </div>
      )}

      {editable && (
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
