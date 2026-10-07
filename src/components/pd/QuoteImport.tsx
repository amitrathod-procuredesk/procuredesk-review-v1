import { FileUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money, uid } from "@/lib/pd/engine";
import { getDB, log, updateRequest, useMe } from "@/lib/pd/store";
import type { LineItem, PRequest } from "@/lib/pd/types";
import { AiGlyph } from "./bits";

interface Extracted { supplier: string; vendorId: string; quoteNo: string; date: string; validUntil: string; tax: number; shipping: number; items: { description: string; partNumber: string; qty: number; unitPrice: number; keep: boolean }[]; demo: boolean }

function parseCSV(text: string): Extracted["items"] {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const d = col("desc", "item", "name"), q = col("qty", "quantity"), p = col("price", "unit"), pn = col("part", "sku");
  if (d < 0 || q < 0 || p < 0) return [];
  return rows.slice(1).filter((r) => r[d]).map((r) => ({ description: r[d], partNumber: pn >= 0 ? r[pn] : "", qty: Number(r[q]) || 1, unitPrice: Number((r[p] || "0").replace(/[$,]/g, "")) || 0, keep: true }));
}

export function QuoteImport({ r, label }: { r: PRequest; label?: string }) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { const h = () => setOpen(true); window.addEventListener("pd:import", h); return () => window.removeEventListener("pd:import", h); }, []);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "review" | "error">("idle");
  const [file, setFile] = useState<File | null>(null);
  const [ex, setEx] = useState<Extracted | null>(null);

  const start = async (f: File) => {
    setFile(f);
    setPhase("uploading");
    const isCsv = /\.csv$/i.test(f.name);
    const text = isCsv ? await f.text() : "";
    setTimeout(() => setPhase("processing"), 500);
    setTimeout(() => {
      const db = getDB();
      let items = isCsv ? parseCSV(text) : [];
      const demo = !isCsv;
      if (demo)
        items = [
          { description: "Wireless mouse, ergonomic", partNumber: "LG M220 · Logitech Mouse", qty: 25, unitPrice: 18.5, keep: true },
          { description: "USB-C docking station", partNumber: "CALDIGIT TS4", qty: 4, unitPrice: 189, keep: true },
          { description: '27" monitor, 4K IPS panel', partNumber: "DL U270 · Dell UltraSharp", qty: 4, unitPrice: 310, keep: true },
        ];
      if (!items.length) { setPhase("error"); return; }
      const v = db.vendors.find((x) => f.name.toLowerCase().includes(x.name.split(" ")[0].toLowerCase())) ?? db.vendors.find((x) => x.id === "v_phoenix")!;
      setEx({ supplier: v.name, vendorId: v.id, quoteNo: `Q-${Math.floor(1000 + Math.random() * 8999)}`, date: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), tax: 0, shipping: demo ? 24 : 0, items, demo });
      setPhase("review");
    }, 1700);
  };

  const commit = () => {
    if (!ex) return;
    const keep = ex.items.filter((i) => i.keep);
    updateRequest(r.id, (x, d) => {
      keep.forEach((i, idx) => {
        const cat = d.catalog.find((c) => c.name === i.description);
        const li: LineItem = { id: uid("li"), description: i.description, partNumber: i.partNumber, account: cat?.account ?? "", vendorId: ex.vendorId, uom: "EACH", qty: i.qty, unitPrice: i.unitPrice, tax: 0, shipping: idx === 0 ? ex.shipping : 0, category: cat?.category ?? "", catalogId: cat?.id, source: "quote" };
        x.items.push(li);
      });
      x.quoteNo = ex.quoteNo;
      if (file) x.attachments.push({ id: uid("att"), name: file.name, size: file.size, kind: "quote", uploadedAt: new Date().toISOString() });
      log(x, `Quote ${ex.quoteNo} imported from ${ex.supplier}: ${keep.length} line items reviewed and added`, "ai", me?.id);
    });
    toast.success(`${keep.length} items added from quote`);
    setOpen(false);
    setPhase("idle");
    setEx(null);
  };

  const sub = ex ? ex.items.filter((i) => i.keep).reduce((s, i) => s + i.qty * i.unitPrice, 0) : 0;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileUp /> {label ?? "Import quote"}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPhase("idle"); setEx(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Import supplier quote</DialogTitle></DialogHeader>
          {phase === "idle" && (
            <button onClick={() => input.current?.click()} className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm hover:bg-subtle">
              <FileUp className="size-5 text-muted-foreground" />
              Choose a PDF, CSV, Excel or image
              <span className="text-xs text-muted-foreground">CSV columns: description, part, qty, unit price</span>
            </button>
          )}
          <input ref={input} type="file" accept=".pdf,.csv,.xlsx,.xls,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) start(f); e.target.value = ""; }} />
          {(phase === "uploading" || phase === "processing") && (
            <div className="space-y-2 py-8 text-sm">
              <p className="flex items-center gap-2"><span className="ai-thinking-dot size-1.5 rounded-full bg-ai" /> {phase === "uploading" ? `Uploading ${file?.name}…` : "Reading quote and extracting line items…"}</p>
              {phase === "processing" && <p className="pl-3.5 text-xs text-muted-foreground">Looking for supplier, quote number, items, tax, shipping and validity</p>}
            </div>
          )}
          {phase === "error" && (
            <div className="space-y-3 py-6 text-sm">
              <p className="text-destructive">I couldn't find line items in this file.</p>
              <p className="text-xs text-muted-foreground">Check that the CSV has description, quantity and unit price columns, or add the items manually.</p>
              <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>Try another file</Button>
            </div>
          )}
          {phase === "review" && ex && (
            <div className="space-y-4">
              <div className="ai-surface flex items-start gap-2 rounded-r-md px-3 py-2 text-sm">
                <AiGlyph />
                <div>
                  <p className="font-medium">AI found {ex.items.length} line items in this quote.</p>
                  <p className="text-xs text-muted-foreground">Review before adding — nothing is imported until you confirm.{ex.demo && " (Demo extraction for non-CSV files.)"}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="pd-label">Supplier</dt><dd>{ex.supplier}</dd></div>
                <div><dt className="pd-label">Quote #</dt><dd className="num">{ex.quoteNo}</dd></div>
                <div><dt className="pd-label">Quote date</dt><dd>{ex.date}</dd></div>
                <div><dt className="pd-label">Valid until</dt><dd>{ex.validUntil}</dd></div>
              </dl>
              <table className="pd-table rounded-md border border-border">
                <thead><tr><th>Item</th><th>Part #</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th><th /></tr></thead>
                <tbody>
                  {ex.items.map((i, idx) => (
                    <tr key={idx} className={i.keep ? "" : "opacity-40"}>
                      <td>{i.description}</td>
                      <td className="text-xs text-muted-foreground">{i.partNumber || "—"}</td>
                      <td className="num text-right">{i.qty}</td>
                      <td className="num text-right">{money(i.unitPrice)}</td>
                      <td className="num text-right">{money(i.qty * i.unitPrice)}</td>
                      <td><button aria-label="Remove item" onClick={() => setEx({ ...ex, items: ex.items.map((y, j) => (j === idx ? { ...y, keep: !y.keep } : y)) })} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">Shipping <span className="num text-foreground">{money(ex.shipping)}</span></span>
                <span className="text-muted-foreground">Tax <span className="num text-foreground">{money(ex.tax)}</span></span>
                <span className="font-medium">Total <span className="num">{money(sub + ex.shipping + ex.tax)}</span></span>
              </div>
            </div>
          )}
          {phase === "review" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase("idle")}>Choose another file</Button>
              <Button onClick={commit} disabled={!ex?.items.some((i) => i.keep)}>Add {ex?.items.filter((i) => i.keep).length} items</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
