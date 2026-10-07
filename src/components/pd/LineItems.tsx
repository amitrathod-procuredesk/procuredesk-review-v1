import { ChevronDown, ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { lineTotal, money, smartDate, uid } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { ACCOUNTS, CATEGORIES, UOMS, type LineItem, type PRequest } from "@/lib/pd/types";
import { Money } from "./bits";
import { ItemToolbar } from "./ItemToolbar";
import { cn } from "@/lib/utils";

const blank = (): LineItem => ({ id: uid("li"), description: "", partNumber: "", account: "", vendorId: "", uom: "EACH", qty: 1, unitPrice: 0, tax: 0, shipping: 0, category: "", source: "manual" });

export function LineItems({ r, editable }: { r: PRequest; editable: boolean }) {
  const db = useDB();
  const me = useMe();
  const [open, setOpen] = useState<string | null>(null);
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
    setOpen(n.id);
  };
  const dup = (ids: string[]) => updateRequest(r.id, (x) => { ids.forEach((id) => { const l = x.items.find((i) => i.id === id); if (l) x.items.push({ ...l, id: uid("li") }); }); log(x, `${ids.length} line item(s) duplicated`, "edit", me?.id); });
  const del = (ids: string[]) => { updateRequest(r.id, (x) => { x.items = x.items.filter((i) => !ids.includes(i.id)); log(x, `${ids.length} line item(s) deleted`, "edit", me?.id); }); setSel([]); };
  const vendorName = (id: string) => db.vendors.find((v) => v.id === id)?.name ?? "";
  const allSel = r.items.length > 0 && sel.length === r.items.length;

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

      {/* Desktop table */}
      <div className="pd-scroll hidden max-h-[560px] overflow-auto rounded-lg border border-border md:block">
        <table className="pd-table pd-sticky-table min-w-[980px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {editable && <th className="pd-stick-l w-8 left-0"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : r.items.map((i) => i.id))} /></th>}
              <th className="w-8" />
              <th className="w-10">Line</th>
              <th className="min-w-64">Description</th>
              <th className="min-w-44">Supplier</th>
              <th className="min-w-40">Account</th>
              <th className="w-16">UOM</th>
              <th className="w-20 text-right">Qty</th>
              <th className="w-28 text-right">Unit price</th>
              <th className="w-28 text-right">Total</th>
              {editable && <th className="pd-stick-r w-12 right-0"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {r.items.length === 0 && (
              <tr><td colSpan={11} className="h-24 text-center text-sm text-muted-foreground">No items yet. Search the catalog above, punch out to a supplier, import a quote, or ask the copilot.</td></tr>
            )}
            {r.items.map((l, i) => {
              const isOpen = open === l.id;
              return (
                <Fragment key={l.id}>
                  <tr className={cn("group transition-colors", isOpen && "bg-subtle/60")}>
                    {editable && <td className="pd-stick-l left-0"><input type="checkbox" aria-label={`Select line ${i + 1}`} checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} /></td>}
                    <td><button aria-label="Expand line" onClick={() => setOpen(isOpen ? null : l.id)} className="rounded p-0.5 text-muted-foreground transition-transform hover:bg-subtle">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                    <td className="num text-xs text-muted-foreground">{i + 1}</td>
                    <td>
                      {editable ? (
                        <input className="pd-input-bare" value={l.description} placeholder="What is it?" onChange={(e) => patch(l.id, { description: e.target.value })} />
                      ) : (
                        <span>{l.description}</span>
                      )}
                      <p className="px-1.5 text-[11px] text-muted-foreground">
                        {l.partNumber || "No part number"}
                        {l.catalogId && <span className="ml-1.5 text-success">· Catalog</span>}
                        {l.source === "ai" && <span className="ai-mark ml-1.5">· AI added</span>}
                        {l.source === "quote" && <span className="ml-1.5">· From quote</span>}
                      </p>
                    </td>
                    <td>
                      {editable ? (
                        <select className={cn("pd-input-bare min-w-40", !l.vendorId && "text-warning")} value={l.vendorId} onChange={(e) => patch(l.id, { vendorId: e.target.value })}>
                          <option value="">Select supplier</option>
                          {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      ) : vendorName(l.vendorId)}
                    </td>
                    <td className="max-w-40 truncate text-xs text-muted-foreground">{l.account || "—"}</td>
                    <td className="text-xs">{l.uom}</td>
                    <td className="text-right">
                      {editable ? <input type="number" min={0} className="pd-input-bare num w-16 text-right" value={l.qty} onChange={(e) => patch(l.id, { qty: Math.max(0, Number(e.target.value)) })} /> : <span className="num">{l.qty}</span>}
                    </td>
                    <td className="text-right">
                      {editable ? <input type="number" min={0} step="0.01" className="pd-input-bare num w-24 text-right" value={l.unitPrice} onChange={(e) => patch(l.id, { unitPrice: Math.max(0, Number(e.target.value)) })} /> : <Money v={l.unitPrice} />}
                    </td>
                    <td className="text-right font-medium"><Money v={lineTotal(l)} /></td>
                    {editable && (
                      <td className="pd-stick-r right-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label="Line actions" className="rounded p-1 text-muted-foreground hover:bg-subtle"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setOpen(l.id)}><Pencil /> Edit details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => dup([l.id])}><Copy /> Duplicate</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => del([l.id])}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="bg-subtle/40 hover:bg-subtle/40">
                      <td colSpan={11} className="h-auto py-3">
                        <LineDetail l={l} editable={editable} onPatch={(p) => patch(l.id, p)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {r.items.map((l) => (
          <li key={l.id} className="pd-panel p-3">
            <button className="flex w-full justify-between text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
              <span><span className="text-sm font-medium">{l.description || "Untitled item"}</span><br /><span className="text-xs text-muted-foreground">{l.qty} × {money(l.unitPrice)} · {vendorName(l.vendorId) || "No supplier"}</span></span>
              <Money v={lineTotal(l)} className="text-sm" />
            </button>
            {open === l.id && <div className="mt-3"><LineDetail l={l} editable={editable} onPatch={(p) => patch(l.id, p)} /></div>}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="mt-2 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={add}><Plus /> Add item</Button>
          <span className="text-xs text-muted-foreground">{r.items.length} line{r.items.length === 1 ? "" : "s"}</span>
        </div>
      )}
      <MultiEdit open={multi} onOpenChange={setMulti} r={r} ids={sel} />
    </div>
  );
}

function LineDetail({ l, editable, onPatch }: { l: LineItem; editable: boolean; onPatch: (p: Partial<LineItem>) => void }) {
  const db = useDB();
  const v = db.vendors.find((x) => x.id === l.vendorId);
  const cat = db.catalog.find((c) => c.id === l.catalogId);
  const ro = !editable;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label><span className="pd-label">Part number</span><input disabled={ro} className="pd-input" value={l.partNumber} onChange={(e) => onPatch({ partNumber: e.target.value })} /></label>
      <label><span className="pd-label">Category</span>
        <select disabled={ro} className="pd-input" value={l.category} onChange={(e) => onPatch({ category: e.target.value })}>
          <option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label><span className="pd-label">Account</span>
        <select disabled={ro} className="pd-input" value={l.account} onChange={(e) => onPatch({ account: e.target.value })}>
          <option value="">Select…</option>{ACCOUNTS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label><span className="pd-label">UOM</span>
        <select disabled={ro} className="pd-input" value={l.uom} onChange={(e) => onPatch({ uom: e.target.value })}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select>
      </label>
      <label><span className="pd-label">Tax</span><input disabled={ro} type="number" min={0} step="0.01" className="pd-input num" value={l.tax} onChange={(e) => onPatch({ tax: Math.max(0, Number(e.target.value)) })} /></label>
      <label><span className="pd-label">Shipping</span><input disabled={ro} type="number" min={0} step="0.01" className="pd-input num" value={l.shipping} onChange={(e) => onPatch({ shipping: Math.max(0, Number(e.target.value)) })} /></label>
      <label><span className="pd-label">Delivery date</span><input disabled={ro} type="date" className="pd-input" value={l.deliveryDate ?? ""} onChange={(e) => onPatch({ deliveryDate: e.target.value })} /></label>
      <div><span className="pd-label">Contract</span><p className="h-8 text-sm leading-8">{v ? (v.contractActive ? `Active · ${v.name}` : "No contract") : "—"}</p></div>
      <label className="sm:col-span-2 lg:col-span-3"><span className="pd-label">Notes</span><input disabled={ro} className="pd-input" value={l.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value })} /></label>
      <div className="text-xs text-muted-foreground">
        {cat ? <>Catalog price <Money v={cat.price} /> · {cat.available ? "Available" : "Backordered"}</> : "Non-catalog item"}
        {l.deliveryDate && <><br />Arrives {smartDate(l.deliveryDate)}</>}
      </div>
    </div>
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
