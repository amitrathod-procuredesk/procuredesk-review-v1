import { ArrowLeft, Check, LayoutGrid, Minus, Plus, Search, ShoppingCart, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { money, uid } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { ACCOUNTS, CATEGORIES, UOMS, type CatalogItem, type DB, type LineItem, type PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";
import { QuoteImport } from "./QuoteImport";

export const fromCatalog = (c: CatalogItem, qty = 1): LineItem => ({
  id: uid("li"), description: c.name, partNumber: c.partNumber, account: c.account, vendorId: c.vendorId,
  uom: "EACH", qty, unitPrice: c.price, tax: 0, shipping: 0, category: c.category, catalogId: c.id, source: "manual",
});

function match(db: DB, q: string) {
  const t = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  return db.catalog
    .map((c) => {
      const v = db.vendors.find((x) => x.id === c.vendorId)?.name ?? "";
      const hay = `${c.name} ${c.partNumber} ${c.keywords.join(" ")} ${c.category} ${v}`.toLowerCase();
      const score = t.filter((w) => hay.includes(w)).length;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.c);
}

function Highlight({ text, q }: { text: string; q: string }) {
  const w = q.trim().split(/\s+/)[0];
  if (!w) return <>{text}</>;
  const i = text.toLowerCase().indexOf(w.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-accent text-accent-foreground">{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
}

export function ItemToolbar({ r }: { r: PRequest }) {
  const db = useDB();
  const me = useMe();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const [manual, setManual] = useState<string | null>(null);
  const [punch, setPunch] = useState(false);
  const [browse, setBrowse] = useState(false);
  useEffect(() => { const h = () => setPunch(true); window.addEventListener("pd:punchout", h); return () => window.removeEventListener("pd:punchout", h); }, []);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => match(db, q), [db, q]);
  const showList = focus && q.trim().length > 0;
  const count = results.length + 1; // + manual option

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setFocus(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addCatalog = (c: CatalogItem) => {
    updateRequest(r.id, (x) => {
      const ex = x.items.find((i) => i.catalogId === c.id);
      if (ex) ex.qty += 1; else x.items.push(fromCatalog(c));
      log(x, `Catalog item “${c.name}” added`, "edit", me?.id);
    });
    toast.success(`${c.name} added`, { description: `${money(c.price)} · ${db.vendors.find((v) => v.id === c.vendorId)?.name}` });
    setQ("");
  };
  const pick = (i: number) => { if (i < results.length) addCatalog(results[i]); else { setManual(q.trim()); setFocus(false); } };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div ref={box} className="relative min-w-0 flex-1 basis-[260px]">
          <div className={cn("flex h-10 items-center gap-2 rounded-lg border px-3 transition-all", focus ? "border-primary bg-surface ring-4 ring-primary/10" : "border-border bg-surface hover:border-input")}>
            <Search className={cn("size-4 transition-colors", focus ? "text-primary" : "text-muted-foreground")} />
            <input
              aria-label="Search catalog"
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Add an item: search the catalogue by name, part number or supplier"
              value={q}
              onFocus={() => setFocus(true)}
              onChange={(e) => { setQ(e.target.value); setFocus(true); }}
              onKeyDown={(e) => {
                if (!showList) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % count); }
                if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + count) % count); }
                if (e.key === "Enter") { e.preventDefault(); pick(hi); }
                if (e.key === "Escape") setFocus(false);
              }}
            />
            <kbd className="hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:inline">↵</kbd>
          </div>
          {showList && (
            <div className="pd-float absolute inset-x-0 top-12 z-30 overflow-hidden rounded-lg border border-border bg-popover animate-in fade-in slide-in-from-top-1 duration-150">
              {results.length > 0 && <p className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">Catalog · {results.length} match{results.length === 1 ? "" : "es"}</p>}
              <ul role="listbox">
                {results.map((c, i) => {
                  const v = db.vendors.find((x) => x.id === c.vendorId);
                  return (
                    <li key={c.id} role="option" aria-selected={hi === i}>
                      <button onMouseEnter={() => setHi(i)} onClick={() => pick(i)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", hi === i && "bg-accent")}>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-[10px] font-semibold text-muted-foreground">{c.category.slice(0, 2).toUpperCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium"><Highlight text={c.name} q={q} /></span>
                          <span className="block truncate text-xs text-muted-foreground">{c.partNumber} · {v?.name}{v?.preferred && " · Preferred"}{!c.available && " · Backordered"}</span>
                        </span>
                        <span className="num text-sm">{money(c.price)}</span>
                        <Plus className={cn("size-4 text-primary transition-opacity", hi === i ? "opacity-100" : "opacity-0")} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {results.length === 0 && <p className="px-3 pt-3 text-sm text-muted-foreground">No catalog items match “{q}”.</p>}
              <button onMouseEnter={() => setHi(results.length)} onClick={() => pick(results.length)} className={cn("mt-1 flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-primary transition-colors", hi === results.length && "bg-accent")}>
                <Plus className="size-4" /> Add “{q.trim()}” manually as a non-catalog item
              </button>
              <button onClick={() => { setBrowse(true); setFocus(false); }} className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground">
                <LayoutGrid className="size-4" /> Browse the full catalog
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-10 border-border bg-surface px-3.5 text-sm font-medium shadow-none hover:bg-subtle" onClick={() => setBrowse(true)}><LayoutGrid /> Browse</Button>
          <Button size="sm" variant="outline" className="h-10 border-border bg-surface px-3.5 text-sm font-medium shadow-none hover:bg-subtle" onClick={() => setPunch(true)}><Store /> Punch-out</Button>
          <span className="[&_button]:h-10 [&_button]:px-3.5 [&_button]:text-sm [&_button]:font-medium [&_button]:border-border [&_button]:bg-surface [&_button]:shadow-none [&_button:hover]:bg-subtle"><QuoteImport r={r} label="Import" /></span>
        </div>
      </div>
      <ManualItemSheet r={r} initial={manual} onClose={() => { setManual(null); setQ(""); }} />
      <PunchOut r={r} open={punch} onOpenChange={setPunch} />
      <CatalogBrowser r={r} open={browse} onOpenChange={setBrowse} />
    </>
  );
}

function ManualItemSheet({ r, initial, onClose }: { r: PRequest; initial: string | null; onClose: () => void }) {
  const db = useDB();
  const me = useMe();
  const empty = { description: "", partNumber: "", vendorId: "", account: "", category: "", uom: "EACH", qty: 1, unitPrice: 0, deliveryDate: "", notes: "", link: "" };
  const [f, setF] = useState(empty);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (initial !== null) { setF({ ...empty, description: initial }); setTouched(false); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const errs = { description: !f.description.trim(), vendorId: !f.vendorId, qty: !(f.qty > 0), unitPrice: !(f.unitPrice > 0) };
  const bad = Object.values(errs).some(Boolean);
  const save = () => {
    setTouched(true);
    if (bad) return;
    updateRequest(r.id, (x) => {
      x.items.push({ id: uid("li"), description: f.description.trim(), partNumber: f.partNumber, account: f.account, vendorId: f.vendorId, uom: f.uom, qty: f.qty, unitPrice: f.unitPrice, tax: 0, shipping: 0, category: f.category, deliveryDate: f.deliveryDate || undefined, notes: [f.notes, f.link].filter(Boolean).join(" · ") || undefined, source: "manual" });
      log(x, `Non-catalog item “${f.description.trim()}” added manually`, "edit", me?.id);
    });
    toast.success("Item added", { description: `${f.description} · ${money(f.qty * f.unitPrice)}` });
    onClose();
  };
  const err = (k: keyof typeof errs) => touched && errs[k] && "border-destructive focus:border-destructive";
  return (
    <Sheet open={initial !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Add non-catalog item</SheetTitle>
          <p className="text-xs text-muted-foreground">Not in your catalog. Procurement may review the supplier and price.</p>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block"><span className="pd-label">Description *</span><input autoFocus className={cn("pd-input", err("description"))} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="pd-label">Part number</span><input className="pd-input" value={f.partNumber} onChange={(e) => setF({ ...f, partNumber: e.target.value })} /></label>
            <label className="block"><span className="pd-label">Supplier *</span>
              <select className={cn("pd-input", err("vendorId"))} value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}>
                <option value="">Select…</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.preferred ? " ★" : ""}</option>)}
              </select>
            </label>
            <label className="block"><span className="pd-label">Category</span><select className="pd-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="block"><span className="pd-label">Account</span><select className="pd-input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">Select…</option>{ACCOUNTS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="block"><span className="pd-label">Quantity *</span><input type="number" min={1} className={cn("pd-input num", err("qty"))} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></label>
            <label className="block"><span className="pd-label">UOM</span><select className="pd-input" value={f.uom} onChange={(e) => setF({ ...f, uom: e.target.value })}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label className="block"><span className="pd-label">Unit price *</span><input type="number" min={0} step="0.01" className={cn("pd-input num", err("unitPrice"))} value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: Number(e.target.value) })} /></label>
            <label className="block"><span className="pd-label">Need by</span><input type="date" className="pd-input" value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} /></label>
          </div>
          <label className="block"><span className="pd-label">Product link</span><input className="pd-input" placeholder="https://" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
          <label className="block"><span className="pd-label">Notes</span><textarea className="pd-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          {touched && bad && <p className="text-xs text-destructive animate-in fade-in">Fill in the required fields marked *.</p>}
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t border-border">
          <span className="text-sm text-muted-foreground">Line total <span className="num ml-1 font-semibold text-foreground">{money((f.qty || 0) * (f.unitPrice || 0))}</span></span>
          <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Add item</Button></div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PunchOut({ r, open, onOpenChange }: { r: PRequest; open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDB();
  const me = useMe();
  const vendors = db.vendors.filter((v) => db.catalog.some((c) => c.vendorId === v.id));
  const [vid, setVid] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open) { setVid(null); setCart({}); } }, [open]);
  const v = vendors.find((x) => x.id === vid);
  const items = db.catalog.filter((c) => c.vendorId === vid);
  const cartItems = Object.entries(cart).filter(([, n]) => n > 0);
  const cartTotal = cartItems.reduce((s, [id, n]) => s + (db.catalog.find((c) => c.id === id)?.price ?? 0) * n, 0);
  const enter = (id: string) => { setLoading(true); setVid(id); setTimeout(() => setLoading(false), 700); };
  const ret = () => {
    updateRequest(r.id, (x) => {
      cartItems.forEach(([id, n]) => { const c = db.catalog.find((k) => k.id === id); if (c) x.items.push(fromCatalog(c, n)); });
      log(x, `Punch-out cart returned from ${v?.name} (${cartItems.length} item${cartItems.length === 1 ? "" : "s"})`, "edit", me?.id);
    });
    toast.success(`Cart returned from ${v?.name}`, { description: `${cartItems.length} item(s) · ${money(cartTotal)}` });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2">
            {v && <button aria-label="Back to suppliers" onClick={() => setVid(null)} className="rounded p-1 text-muted-foreground hover:bg-subtle"><ArrowLeft className="size-4" /></button>}
            {v ? `${v.name} · punch-out store` : "Punch-out to a supplier"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{v ? "Shop with your contract pricing. Return the cart to add items to this request." : "Open a connected supplier's store. Your contract prices apply."}</p>
        </DialogHeader>
        <div className="max-h-[60vh] min-h-64 overflow-y-auto p-4">
          {!v && (
            <div className="grid gap-2 sm:grid-cols-2">
              {vendors.map((x) => (
                <button key={x.id} onClick={() => enter(x.id)} className="group flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm">
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-foreground">{x.name[0]}</span>
                  <span className="flex-1"><span className="block text-sm font-medium">{x.name}</span><span className="text-xs text-muted-foreground">{db.catalog.filter((c) => c.vendorId === x.id).length} items · {x.contractActive ? "Contract active" : "No contract"}</span></span>
                  {x.preferred && <span className="rounded-sm bg-success-soft px-1.5 text-[10px] font-medium text-success">Preferred</span>}
                </button>
              ))}
            </div>
          )}
          {v && loading && (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground animate-in fade-in">
              <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Connecting to {v.name}…
            </div>
          )}
          {v && !loading && (
            <ul className="divide-y divide-border animate-in fade-in">
              {items.map((c) => {
                const n = cart[c.id] ?? 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.partNumber}{!c.available && " · Backordered"}</p></div>
                    <span className="num w-24 text-right text-sm">{money(c.price)}</span>
                    {n === 0 ? (
                      <Button size="sm" variant="outline" onClick={() => setCart({ ...cart, [c.id]: 1 })}><ShoppingCart /> Add</Button>
                    ) : (
                      <div className="flex items-center rounded-md border border-primary/40 animate-in zoom-in-95">
                        <button aria-label="Decrease" className="p-1.5" onClick={() => setCart({ ...cart, [c.id]: n - 1 })}><Minus className="size-3.5" /></button>
                        <span className="num w-7 text-center text-sm">{n}</span>
                        <button aria-label="Increase" className="p-1.5" onClick={() => setCart({ ...cart, [c.id]: n + 1 })}><Plus className="size-3.5" /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {v && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <span className="text-sm text-muted-foreground">{cartItems.length} item(s) · <span className="num font-semibold text-foreground">{money(cartTotal)}</span></span>
            <Button disabled={!cartItems.length} onClick={ret}><Check /> Return cart to request</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
