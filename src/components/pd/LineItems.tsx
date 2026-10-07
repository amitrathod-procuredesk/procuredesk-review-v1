import { ChevronDown, ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
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
                  <tr className={cn("group transition-colors", editable && "cursor-pointer", isOpen && "bg-subtle/60", edit === l.id && "bg-accent/60")} onClick={(e) => { if (!editable || (e.target as HTMLElement).closest("input,select,button,a,textarea")) return; setEdit(l.id); }}>
                    {editable && <td className="pd-stick-l left-0"><input type="checkbox" aria-label={`Select line ${i + 1}`} checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} /></td>}
                    <td><button aria-label={isOpen ? "Hide details" : "Show details"} title="Show details" onClick={() => setOpen(isOpen ? null : l.id)} className="rounded p-0.5 text-muted-foreground transition-transform hover:bg-subtle">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                    <td className="num text-xs text-muted-foreground">{i + 1}</td>
                    <td>
                      <span className={cn("block px-1.5 font-medium", editable && "group-hover:text-primary transition-colors", !l.description && "text-muted-foreground")}>{l.description || "Untitled item"}</span>
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
                            <DropdownMenuItem onClick={() => setEdit(l.id)}><Pencil /> Edit details</DropdownMenuItem>
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
                        <div className="animate-in fade-in slide-in-from-top-1"><LineDetail l={l} editable={false} onPatch={() => {}} /></div>
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
            {open === l.id && <div className="mt-3"><LineDetail l={l} editable={false} onPatch={() => {}} />{editable && <Button size="sm" variant="outline" className="mt-3" onClick={() => setEdit(l.id)}><Pencil /> Edit item</Button>}</div>}
          </li>
        ))}
      </ul>

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
