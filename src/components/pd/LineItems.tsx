import { INVENTORY, fromStock} from "@/lib/pd/inventory";
import { Package, ChevronDown, LayoutList, Table2, ImageIcon, Copy, MoreHorizontal, Pencil, Plus, Trash2, Warehouse, Hash, BookText, Store, Wallet } from "lucide-react";
const MI = "size-3 shrink-0 text-muted-foreground/60";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { budgetLevelOf, budgetStatuses, lineBudgetId, lineTotal, money, smartDate, uid } from "@/lib/pd/engine";
import { log, updateRequest, useDB, useMe } from "@/lib/pd/store";
import { ACCOUNTS, CATEGORIES, UOMS, type LineItem, type PRequest } from "@/lib/pd/types";
import { Money } from "./bits";
import { SplitAccountButton, accountLabel } from "./AccountSplit";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ItemToolbar, fromCatalog } from "./ItemToolbar";
import type { CatalogItem } from "@/lib/pd/types";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const blank = (): LineItem => ({ id: uid("li"), description: "", partNumber: "", account: "", vendorId: "", uom: "EACH", qty: 1, unitPrice: 0, tax: 0, shipping: 0, category: "", source: "manual" });

export function LineItems({ r, editable, heading, canSplit, pick }: { r: PRequest; editable: boolean; heading?: ReactNode; canSplit?: boolean; pick?: { selected: string[]; toggle: (id: string) => void } }) {
  const db = useDB();
  const lineBudgets = budgetLevelOf(r, db) === "line";
  const budgetName = (l: LineItem) => db.budgets.find((b) => b.id === lineBudgetId(l, r, db))?.name;
  const me = useMe();
  const [inspect, setInspect] = useState<string | null>(null);
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
  const fresh = useRef<string | null>(null);
  const closeEdit = () => {
    const f = fresh.current && r.items.find((i) => i.id === fresh.current);
    if (f && !f.unitPrice && !f.vendorId && !f.account && !f.partNumber) updateRequest(r.id, (x) => { x.items = x.items.filter((i) => i.id !== f.id); });
    fresh.current = null;
    setEdit(null);
  };
  useEffect(() => {
    const h = (e: Event) => { const t = String((e as CustomEvent).detail ?? ""); add(t); };
    window.addEventListener("pd:additem", h);
    return () => window.removeEventListener("pd:additem", h);
  });
  const add = (text = "") => {
    const n = { ...blank(), description: text };
    fresh.current = n.id;
    updateRequest(r.id, (x) => { x.items.push(n); log(x, "Line item added", "edit", me?.id); });
    setEdit(n.id);
  };
  const dup = (ids: string[]) => updateRequest(r.id, (x) => { ids.forEach((id) => { const l = x.items.find((i) => i.id === id); if (l) x.items.push({ ...l, id: uid("li") }); }); log(x, `${ids.length} line item(s) duplicated`, "edit", me?.id); });
  const del = (ids: string[]) => { updateRequest(r.id, (x) => { x.items = x.items.filter((i) => !ids.includes(i.id)); log(x, `${ids.length} line item(s) deleted`, "edit", me?.id); }); setSel([]); };
  const vendorName = (id: string) => db.vendors.find((v) => v.id === id)?.name ?? "";
  const allSel = r.items.length > 0 && sel.length === r.items.length;
  const [view, setView] = useState<"list" | "supplier">("list");
  const [layout, setLayoutState] = useState<"cards" | "table">("cards");
  const setLayout = (v: "cards" | "table") => setLayoutState(v);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const groups = Object.values(r.items.reduce<Record<string, { id: string; name: string; items: LineItem[] }>>((acc, l) => {
    const k = l.vendorId || "_none";
    (acc[k] ??= { id: k, name: vendorName(l.vendorId), items: [] }).items.push(l);
    return acc;
  }, {}));

  const card = (l: LineItem, i: number, hideSupplier = false) => {
    const other = (l.tax || 0) + (l.shipping || 0);
    const sup = vendorName(l.vendorId);
    const v = db.vendors.find((x) => x.id === l.vendorId);
    // Card subtext order: Item # · Account · Supplier (clickable); UOM shows once, beside the unit price. Prices live in the right column.
    const meta: ReactNode[] = [
      <span key="p" className={cn("inline-flex items-center gap-1", !l.partNumber && "text-muted-foreground/60")} title="Supplier item #"><Hash className={MI} aria-label="Item #" /><span className="num">{l.partNumber || "No item #"}</span></span>,
      <span key="a" className="inline-flex items-center gap-1" title={l.accountSplits ? l.accountSplits.map((x) => `${x.account} ${x.percent}%`).join("\n") : "GL account"}><BookText className={MI} aria-label="Account" /><span className={cn(!l.account && "text-warning")}>{accountLabel(l) || "No account"}</span>{canSplit && !l.declined && !fromStock(l) && <SplitAccountButton requestId={r.id} line={l} />}</span>,
      !hideSupplier && (v ? (
        <Popover key="s">
          <PopoverTrigger asChild><button type="button" title="Supplier" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Store className="size-3 shrink-0" aria-label="Supplier" />{sup}</button></PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-3 text-xs">
            <p className="text-sm font-medium">{v.name}</p>
            <p className="mt-1 text-muted-foreground">{[v.preferred && "Preferred", v.verified && "Verified", v.contractActive ? "Active contract" : "No contract"].filter(Boolean).join(" · ")}</p>
            {v.categories.length > 0 && <p className="mt-1 text-muted-foreground">{v.categories.join(", ")}</p>}
            <p className="mt-2 border-t border-border pt-2 text-muted-foreground">{r.items.filter((x) => x.vendorId === v.id).length} line(s) from this supplier</p>
          </PopoverContent>
        </Popover>
      ) : <span key="s" className="inline-flex items-center gap-1 text-warning" title="Supplier"><Store className="size-3 shrink-0" aria-label="Supplier" />No supplier</span>),
      lineBudgets && !fromStock(l) && !l.declined && <span key="b" className="inline-flex items-center gap-1" title="Budget"><Wallet className={MI} aria-label="Budget" /><span className={cn(!budgetName(l) && "text-warning")}>{budgetName(l) ?? "No budget"}</span></span>,
    ].filter(Boolean);
    return (
      <li key={l.id} className={cn("group relative rounded-lg border border-border bg-surface transition-all", l.declined && "bg-subtle/40 [&_img]:opacity-50 [&_p.line-clamp-2]:text-muted-foreground", "hover:border-primary/30 hover:shadow-sm", sel.includes(l.id) && "border-primary/50 bg-primary/[0.03]", edit === l.id && "border-primary/60 bg-primary/[0.04]", pick && !l.declined && (pick.selected.includes(l.id) ? "border-primary/50 bg-primary/[0.03]" : "opacity-60"))}>
        <div className={cn("flex items-start gap-1.5 py-2.5 pr-3 pl-1", "cursor-pointer")} onClick={(e) => { if ((e.target as HTMLElement).closest("input,select,button,a,textarea,[role=menu]")) return; if (editable) setEdit(l.id); else if (pick && !l.declined) pick.toggle(l.id); else setInspect((x) => (x === l.id ? null : l.id)); }}>
          {pick && !l.declined && <input type="checkbox" className="ml-1.5 shrink-0 self-center" aria-label={`Approve line ${i + 1}`} checked={pick.selected.includes(l.id)} onChange={() => pick.toggle(l.id)} />}
          {editable && <input type="checkbox" className="shrink-0 self-center" aria-label={`Select line ${i + 1}`} checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!editable && <button type="button" aria-label={inspect === l.id ? "Hide item details" : "Show item details"} aria-expanded={inspect === l.id} aria-controls={`line-details-${l.id}`} onClick={() => setInspect((x) => (x === l.id ? null : l.id))} className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><ChevronDown className={cn("size-3.5 transition-transform", inspect !== l.id && "-rotate-90")} /></button>}
              <span className="ml-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-subtle text-muted-foreground/60">
                {l.imageUrl ? <img src={l.imageUrl} alt="" loading="lazy" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <ImageIcon className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start gap-1">
                  {editable ? <p className={cn("line-clamp-2 min-w-0 flex-1 break-words text-[13px] font-medium leading-[1.35] transition-colors group-hover:text-primary", !l.description && "text-muted-foreground")} title={l.description}>{l.description || "No description"}</p> : <Button variant="link" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left text-[13px] leading-snug text-foreground" title={l.description} aria-expanded={inspect === l.id} aria-controls={`line-details-${l.id}`} onClick={() => setInspect((x) => (x === l.id ? null : l.id))}><span className="line-clamp-3 break-words">{l.description || "No description"}</span></Button>}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span className="min-w-0 truncate">{meta.map((m, k) => <span key={k}>{k > 0 && <span className="mx-1.5 text-border">•</span>}{m}</span>)}</span>
                  {l.declined && <span className="shrink-0 rounded bg-danger-soft px-1.5 py-px text-[10px] font-medium text-destructive" title={`Declined by ${db.users.find((u) => u.id === l.declined!.by)?.name ?? "approver"}${l.declined.reason ? ` — ${l.declined.reason}` : ""}`}>Declined · {db.users.find((u) => u.id === l.declined!.by)?.name.split(" ")[0]}</span>}
                  {fromStock(l) && (() => { const st = INVENTORY[l.catalogId ?? ""]; const short = st && l.qty > st.onHand; return (
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10px] font-medium", short ? "bg-attention-soft text-attention" : "bg-success-soft text-success")} title={st ? `${st.onHand} on hand at ${st.location} · no purchase` : "Issued from internal stock"}>
                      <Warehouse className="size-3" />{short ? `Only ${st.onHand} in stock` : "From stock"}
                    </span>); })()}
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
              {fromStock(l) ? <span className="text-sm font-semibold text-muted-foreground sm:mt-0.5 sm:block" title="Issued from internal stock — not added to the total">No cost</span> : <Money v={lineTotal(l)} className={cn("text-sm font-semibold sm:mt-0.5 sm:block", l.declined && "text-muted-foreground line-through decoration-muted-foreground/60")} />}
              {other > 0 && <p className="num text-[10.5px] text-muted-foreground" title={`Tax ${money(l.tax || 0)} · Shipping ${money(l.shipping || 0)}`}>incl. other <Money v={other} /></p>}
            </div>
          </div>
          {editable && <div className="-mr-1 flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">{actions(l)}</div>}
        </div>
        {!editable && inspect === l.id && detail(l, "border-t border-border px-3 pb-3 pt-3")}
      </li>
    );
  };
  const detail = (l: LineItem, cls: string) => (
    <div id={`line-details-${l.id}`} className={cn("animate-in fade-in", cls)}>
      {l.description && l.description.length > 90 && <p className="mb-3 whitespace-pre-wrap break-words text-[13px] text-foreground/80">{l.description}</p>}
      <LineDetail l={l} budget={lineBudgets && !fromStock(l) ? budgetName(l) ?? "" : undefined} />
    </div>
  );
  const actions = (l: LineItem) => (
    <>
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
  const cell = "h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] outline-none transition-colors hover:border-border focus:border-primary/60 focus:bg-card";
  const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const table = (items: LineItem[], hideSupplier = false) => (
    <div className="pd-scroll overflow-x-auto rounded-xl border border-border/60 bg-surface [container-type:inline-size]">
      <table className="table-fixed border-collapse text-[12.5px]" style={{ width: "100%", minWidth: hideSupplier ? 880 : 980 }}>
        <colgroup>
          {editable && <col className="w-7" />}
          <col />
          <col className="w-[76px]" />
          <col className="w-[112px]" />
          {!hideSupplier && <col className="w-[104px]" />}
          <col className="w-[44px]" />
          <col className="w-[96px]" />
          <col className="w-[68px]" />
          <col className="w-[96px]" />
          {editable && <col className="w-12" />}
        </colgroup>
        <thead className="bg-subtle text-left text-[10.5px] tracking-[0.05em] text-muted-foreground">
          <tr className="whitespace-nowrap [&>th]:h-9 [&>th]:px-2 [&>th]:font-semibold">
            {editable && <th className="px-0!"><input type="checkbox" aria-label="Select all lines" checked={items.length > 0 && items.every((l) => sel.includes(l.id))} onChange={() => { const all = items.every((l) => sel.includes(l.id)); setSel((s) => all ? s.filter((x) => !items.some((l) => l.id === x)) : [...new Set([...s, ...items.map((l) => l.id)])]); }} /></th>}
            <th className="pl-3!">Description</th>
            <th className="pl-3.5!">Item #</th>
            <th>Account</th>
            {!hideSupplier && <th>Supplier</th>}
            <th className="text-right">Qty</th>
            <th className="text-right">Unit price</th>
            <th className="text-right" title="Tax + shipping">Other</th>
            <th className="text-right">Total</th>
            {editable && <th className="sticky right-0 bg-subtle" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {items.map((l) => {
            const ro = !editable || !!l.declined;
            const other = (l.tax || 0) + (l.shipping || 0);
            return [
              <tr key={l.id} className={cn("group border-t border-border align-middle transition-colors hover:bg-subtle/40 [&>td]:px-2 [&>td]:py-2", sel.includes(l.id) && "bg-primary/[0.03]", l.declined && "text-muted-foreground", pick && !l.declined && (pick.selected.includes(l.id) ? "bg-primary/[0.03]" : "opacity-60"))}>
                {editable && <td className="px-0!"><input type="checkbox" aria-label="Select line" checked={sel.includes(l.id)} onChange={() => setSel((s) => (s.includes(l.id) ? s.filter((x) => x !== l.id) : [...s, l.id]))} /></td>}
                <td>
                  <div className="flex min-w-0 items-center gap-1">
                    {pick && !l.declined && <input type="checkbox" className="shrink-0" aria-label="Approve line" checked={pick.selected.includes(l.id)} onChange={() => pick.toggle(l.id)} />}
                    {ro && <button type="button" aria-label={inspect === l.id ? "Hide item details" : "Show item details"} aria-expanded={inspect === l.id} aria-controls={`line-details-${l.id}`} onClick={() => setInspect((x) => (x === l.id ? null : l.id))} className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"><ChevronDown className={cn("size-3.5 transition-transform", inspect !== l.id && "-rotate-90")} /></button>}
                    <div className="min-w-0 flex-1">
                  {ro ? <Button variant="link" className={cn("h-auto w-full min-w-0 justify-start whitespace-normal px-1.5 py-0 text-left text-[12.5px] leading-snug text-foreground", l.declined && "text-muted-foreground line-through")} title={l.description} aria-expanded={inspect === l.id} aria-controls={`line-details-${l.id}`} onClick={() => setInspect((x) => (x === l.id ? null : l.id))}><span className="line-clamp-3 break-words">{l.description || "No description"}</span></Button>
                    : <textarea rows={3} aria-label="Description" title={l.description} className={cn(cell, "block h-[59px] resize-none overflow-hidden py-[3px] font-medium leading-[17px] focus:overflow-auto", !l.description && "border-destructive/60")} value={l.description} placeholder="Add a description" onChange={(e) => patch(l.id, { description: e.target.value })} />}
                  {(fromStock(l) || l.declined) && <p className="px-1.5 text-[10.5px] text-muted-foreground">{l.declined ? "Declined by approver" : "From stock · no cost"}</p>}
                    </div>
                  </div>
                </td>
                <td>{ro ? <span className="num block truncate px-1.5">{l.partNumber || "—"}</span> : <input aria-label="Item number" inputMode="numeric" placeholder="—" className={cn(cell, "num")} value={l.partNumber} onChange={(e) => patch(l.id, { partNumber: e.target.value.replace(/\D/g, "") })} />}</td>
                <td><span className="flex min-w-0 items-center gap-0.5"><span className={cn("block truncate", !l.account && "text-warning")} title={l.accountSplits ? l.accountSplits.map((x) => `${x.account} ${x.percent}%`).join("\n") : l.account}>{accountLabel(l) || "No account"}</span>{canSplit && !l.declined && !fromStock(l) && <SplitAccountButton requestId={r.id} line={l} />}</span></td>
                {!hideSupplier && <td><span className={cn("block truncate", !l.vendorId && "text-warning")} title={vendorName(l.vendorId)}>{vendorName(l.vendorId) || "No supplier"}</span></td>}
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {ro ? <span className="num pr-1.5">{l.qty}</span> : <input inputMode="numeric" aria-label="Quantity" className={cn(cell, "num w-9 px-1 text-right")} value={l.qty} onChange={(e) => patch(l.id, { qty: Math.max(1, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1)) })} />}
                  </div>
                </td>
                <td className="text-right">{ro ? <Money v={l.unitPrice} className="pr-1.5" /> : (
                  <label className={cn(cell, "num flex cursor-text items-center justify-end focus-within:border-primary/60 focus-within:bg-card")}><span className="text-muted-foreground">$</span><input key={l.unitPrice} inputMode="decimal" aria-label="Unit price" className="num min-w-[3ch] bg-transparent text-right outline-none [field-sizing:content]" defaultValue={l.unitPrice.toFixed(2)} onBlur={(e) => { const v = Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0); if (v !== l.unitPrice) patch(l.id, { unitPrice: v }); else e.target.value = v.toFixed(2); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>)}</td>
                <td className="num text-right text-muted-foreground" title={`Tax ${money(l.tax || 0)} · Shipping ${money(l.shipping || 0)}`}>{other ? money(other) : "—"}</td>
                <td className="num whitespace-nowrap text-right font-semibold">{fromStock(l) ? <span className="font-normal text-muted-foreground">No cost</span> : <span className={cn(l.declined && "line-through")}>{money(lineTotal(l))}</span>}</td>
                {editable && <td className="sticky right-0 bg-surface shadow-[-1px_0_0_var(--border)] group-hover:bg-subtle"><div className="flex justify-end gap-0.5">{actions(l)}</div></td>}
              </tr>,
              ro && inspect === l.id && <tr key={`${l.id}-d`} className="bg-subtle/30"><td colSpan={hideSupplier ? 7 : 8} className="px-3 py-3">{detail(l, "")}</td></tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
  const LIMIT = 8;
  const q = filter.trim().toLowerCase();
  const visibleItems = q ? r.items.filter((l) => [l.name ?? "", l.description, l.partNumber, vendorName(l.vendorId), l.account].join(" ").toLowerCase().includes(q)) : r.items;
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

      {(heading || r.items.length > 0) && <div className={cn("flex flex-wrap items-center gap-2", heading ? "mb-3 min-h-7" : "mb-2")}>
        {heading && <h2 className="pd-section-title mr-auto">{heading}</h2>}
        {editable && r.items.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => setSel(allSel ? [] : r.items.map((i) => i.id))} /> Select all
          </label>
        )}
        {r.items.length > 10 && (
          <input aria-label="Filter items" className="pd-input w-44 text-xs" placeholder={`Filter ${r.items.length} items…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
        {view === "supplier" && groups.length > 1 && (
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(collapsed.length === groups.length ? [] : groups.map((g) => g.id))}>{collapsed.length === groups.length ? "Expand all" : "Collapse all"}</button>
        )}
        {r.items.length > 0 && <div role="group" aria-label="Layout" className="ml-auto inline-flex rounded-md border border-border bg-subtle/60 p-0.5">
          {([["cards", "Card view", LayoutList], ["table", "Table view", Table2]] as const).map(([k, l, I]) => (
            <button key={k} aria-label={l} title={l} aria-pressed={layout === k} onClick={() => setLayout(k)} className={cn("grid size-6 place-items-center rounded transition-colors", layout === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><I className="size-3.5" /></button>
          ))}
        </div>}
        {r.items.length > 0 && <div role="tablist" aria-label="Item view" className=" inline-flex rounded-md border border-border bg-subtle/60 p-0.5 text-xs">
          {([["list", "List"], ["supplier", "By supplier"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("rounded px-2.5 py-1 font-medium transition-colors", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>}
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
          {visibleItems.length === 0 ? null : layout === "table" ? table(cap(visibleItems, "_list")) : <ul className="space-y-2">{cap(visibleItems, "_list").map((l) => card(l, r.items.indexOf(l)))}</ul>}
          {!q && more(visibleItems.length, "_list")}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const items = q ? g.items.filter((l) => visibleItems.includes(l)) : g.items;
            if (!items.length) return null;
            const isCol = collapsed.includes(g.id) && !q;
            return (
              <section key={g.id} className="rounded-lg border border-border/60 bg-subtle/30">
                <button onClick={() => setCollapsed((c) => (c.includes(g.id) ? c.filter((x) => x !== g.id) : [...c, g.id]))} aria-expanded={!isCol} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", isCol && "-rotate-90")} />
                  <span className="text-[13px] font-semibold">{g.name || "No supplier"}</span>
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                  <Money v={items.reduce((s, x) => s + (x.declined || fromStock(x) ? 0 : lineTotal(x)), 0)} className="ml-auto text-[13px] font-semibold" />
                </button>
                {!isCol && (
                  <div className="animate-in fade-in px-2 pb-2">
                    {layout === "table" ? table(cap(items, g.id), true) : <ul className="space-y-2">{cap(items, g.id).map((l) => card(l, r.items.indexOf(l), true))}</ul>}
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
          <Button size="sm" variant="ghost" onClick={() => add()}><Plus /> Add item</Button>
          <span className="text-xs text-muted-foreground">{r.items.length} line{r.items.length === 1 ? "" : "s"}</span>
        </div>
      )}
      <Sheet open={!!editing} onOpenChange={(o) => !o && closeEdit()}>
        <SheetContent className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-[440px]">
          {editing && (
            <>
              <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-border px-5 py-4 pr-12">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] text-primary font-semibold text-muted-foreground">{(editing.category || editing.description || "?").slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 text-left">
                  <p className="truncate text-[11px] text-muted-foreground">Line {r.items.indexOf(editing) + 1}{vendorName(editing.vendorId) && ` · ${vendorName(editing.vendorId)}`}{editing.catalogId && " · Catalog"}</p>
                  <SheetTitle className="truncate text-[15px] font-semibold leading-tight">{editing.name || editing.description || "Untitled item"}</SheetTitle>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 animate-in fade-in slide-in-from-right-2 duration-300">
                  <p className="pd-drawer-sec sm:col-span-2">Item</p>
                  <DField label="Item name" className="sm:col-span-2"><NameSearch l={editing} vendorName={vendorName} onText={(v) => patch(editing.id, { name: v })} onPick={(c) => { const { id: _id, ...rest } = fromCatalog(c, editing.qty || 1); patch(editing.id, rest, `“${c.name}” selected from catalog`); }} /></DField>
                  <DField label="Description" req className="sm:col-span-2"><input className={cn("pd-input text-sm", !editing.description && "border-destructive")} value={editing.description} onChange={(e) => patch(editing.id, { description: e.target.value })} /></DField>
                  <DField label="Account" req className="sm:col-span-2">
                    <select className={cn("pd-input text-sm", !editing.account && "border-destructive")} value={editing.account} onChange={(e) => patch(editing.id, { account: e.target.value })}>
                      <option value="">Select…</option>{ACCOUNTS.map((c, i) => <option key={c} value={c}>{10 + i * 5} · {c}</option>)}
                    </select>
                  </DField>
                  {lineBudgets && !fromStock(editing) && (
                    <DField label="Budget" req className="sm:col-span-2">
                      <select className={cn("pd-input text-sm", !lineBudgetId(editing, r, db) && "border-destructive")} value={lineBudgetId(editing, r, db) ?? ""} onChange={(e) => patch(editing.id, { budgetId: e.target.value || undefined }, `Budget set to ${db.budgets.find((b) => b.id === e.target.value)?.name ?? "none"}`)}>
                        <option value="">Select…</option>
                        {db.budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      {(() => { const st = budgetStatuses(r, db).find((x) => x.budget.id === lineBudgetId(editing, r, db)); if (!st) return null;
                        const T = st.budget.total, used = Math.max(0, T - st.available), req = st.request;
                        const pct = (v: number) => `${Math.max(0, Math.min(100, (v / T) * 100))}%`;
                        return (
                          <div className="mt-2" aria-label="Budget utilisation">
                            <div className="flex h-1.5 overflow-hidden rounded-full bg-subtle">
                              <span className="bg-muted-foreground/40" style={{ width: pct(used) }} />
                              <span className={st.over ? "bg-destructive" : "bg-primary"} style={{ width: pct(req) }} />
                            </div>
                            <p className="num mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                              <span>This request {money(req)}{st.lines > 1 && ` · ${st.lines} lines`}</span>
                              <span className={st.over ? "font-medium text-destructive" : "text-success"}>{st.over ? `Over by ${money(-st.remaining)}` : `${money(st.remaining)} left`}</span>
                            </p>
                          </div>
                        ); })()}
                    </DField>
                  )}
                  <p className="pd-drawer-sec sm:col-span-2">Pricing & supplier</p>
                  <DField label="Quantity" req><input type="number" min={0} className="pd-input num text-sm" value={editing.qty} onChange={(e) => patch(editing.id, { qty: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Unit price" req><input type="number" min={0} step="0.01" className="pd-input num text-sm" value={editing.unitPrice} onChange={(e) => patch(editing.id, { unitPrice: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Supplier">
                    <select className="pd-input text-sm" value={editing.vendorId} onChange={(e) => patch(editing.id, { vendorId: e.target.value })}>
                      <option value="">Select…</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </DField>
                  <DField label="Supplier item #"><input className="pd-input num text-sm" placeholder="-" value={editing.partNumber} inputMode="numeric" onChange={(e) => patch(editing.id, { partNumber: e.target.value.replace(/\D/g, "") })} /></DField>
                  <p className="pd-drawer-sec sm:col-span-2">Classification</p>
                  <DField label="Item type">
                    <select className="pd-input text-sm" value={editing.itemType ?? "Material"} onChange={(e) => patch(editing.id, { itemType: e.target.value })}>{["Material", "Service", "Software", "Asset"].map((x) => <option key={x}>{x}</option>)}</select>
                  </DField>
                  <DField label="UOM"><select className="pd-input text-sm" value={editing.uom} onChange={(e) => patch(editing.id, { uom: e.target.value })}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select></DField>
                  <DField label="Category">
                    <select className="pd-input text-sm" value={editing.category} onChange={(e) => patch(editing.id, { category: e.target.value })}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                  </DField>
                  <DField label="Class">
                    <select className="pd-input text-sm" value={editing.itemClass ?? ""} onChange={(e) => patch(editing.id, { itemClass: e.target.value })}><option value="">Select…</option>{["Office Supplies", "Hardware", "MRO", "Capital", "Operating"].map((c) => <option key={c}>{c}</option>)}</select>
                  </DField>
                  <DField label="Project code"><input className="pd-input text-sm" placeholder="-" value={editing.projectCode ?? ""} onChange={(e) => patch(editing.id, { projectCode: e.target.value })} /></DField>
                  <DField label="Image URL"><input className="pd-input text-sm" placeholder="https://…" value={editing.imageUrl ?? ""} onChange={(e) => patch(editing.id, { imageUrl: e.target.value })} /></DField>
                  <DField label="Web link"><input className="pd-input text-sm" placeholder="-" value={editing.webLink ?? ""} onChange={(e) => patch(editing.id, { webLink: e.target.value })} /></DField>
                  <p className="pd-drawer-sec sm:col-span-2">Costs & delivery</p>
                  <DField label="Tax"><input type="number" min={0} step="0.01" className="pd-input num text-sm" value={editing.tax} onChange={(e) => patch(editing.id, { tax: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Shipping"><input type="number" min={0} step="0.01" className="pd-input num text-sm" value={editing.shipping} onChange={(e) => patch(editing.id, { shipping: Math.max(0, Number(e.target.value)) })} /></DField>
                  <DField label="Delivery date" className="sm:col-span-2"><input type="date" className="pd-input text-sm" value={editing.deliveryDate ?? ""} onChange={(e) => patch(editing.id, { deliveryDate: e.target.value })} /></DField>
                  <DField label="Notes" className="sm:col-span-2"><textarea className="pd-input rounded-md bg-card py-2 text-sm" placeholder="-" value={editing.notes ?? ""} onChange={(e) => patch(editing.id, { notes: e.target.value })} /></DField>
                </div>
              </div>
              <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border bg-card px-5 py-3 sm:justify-between">
                <div className="leading-tight"><p className="text-[11px] text-muted-foreground">Line total</p><Money v={lineTotal(editing)} className="text-base font-semibold" /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { del([editing.id]); setEdit(null); }}><Trash2 /> Delete</Button>
                  <Button size="sm" className="px-5" onClick={() => { fresh.current = null; setEdit(null); }}>Done</Button>
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

function LineDetail({ l, budget }: { l: LineItem; budget?: string }) {
  const db = useDB();
  const v = db.vendors.find((x) => x.id === l.vendorId);
  const cat = db.catalog.find((c) => c.id === l.catalogId);
  const dash = (x?: string | null) => (x && String(x).trim() ? x : "—");
  const items: [string, ReactNode][] = [
    ["Supplier item #", <span className="num">{dash(l.partNumber)}</span>],
    ["Item type", dash(l.itemType ?? "Material")],
    ["Source from", cat ? "Catalog" : "Non-catalog"],
    ["Fulfilment", fromStock(l) ? `From stock${INVENTORY[l.catalogId ?? ""] ? ` · ${INVENTORY[l.catalogId ?? ""].location}` : ""}` : "Purchase from supplier"],
    ["Category", dash(l.category)],
    ["Account", l.accountSplits ? <span className="block space-y-0.5">{l.accountSplits.map((x) => <span key={x.account} className="block">{x.account} <span className="num text-muted-foreground">{x.percent}% · {money((lineTotal(l) * x.percent) / 100)}</span></span>)}</span> : dash(l.account)],
    ...(budget !== undefined ? [["Budget", dash(budget)] as [string, ReactNode]] : []),
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
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([k, val]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground [overflow-wrap:anywhere]">{val}</dd>
        </div>
      ))}
    </dl>
  );
}

function MultiEdit({ open, onOpenChange, r, ids }: { open: boolean; onOpenChange: (o: boolean) => void; r: PRequest; ids: string[] }) {
  const db = useDB();
  const me = useMe();
  const [vals, setVals] = useState<{ vendorId?: string; account?: string; budgetId?: string; category?: string; deliveryDate?: string }>({});
  const lineBudgets = budgetLevelOf(r, db) === "line";
  const changed = Object.entries(vals).filter(([, v]) => v);
  const apply = () => {
    updateRequest(r.id, (x) => {
      x.items.forEach((l) => { if (ids.includes(l.id)) changed.forEach(([k, v]) => ((l as unknown as Record<string, unknown>)[k] = v)); });
      log(x, `Multi-edit: ${changed.map(([k]) => k.replace("vendorId", "supplier").replace("budgetId", "budget")).join(", ")} on ${ids.length} lines`, "edit", me?.id);
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
          {lineBudgets && <label><span className="pd-label">Budget</span><select className="pd-input" value={vals.budgetId ?? ""} onChange={(e) => setVals({ ...vals, budgetId: e.target.value })}><option value="">Keep current</option>{db.budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
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

function NameSearch({ l, vendorName, onText, onPick }: { l: LineItem; vendorName: (id: string) => string; onText: (v: string) => void; onPick: (c: CatalogItem) => void }) {
  const db = useDB();
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const q = (l.name ?? "").trim().toLowerCase();
  const hits = q.length < 1 ? [] : db.catalog.filter((c) => c.id !== l.catalogId && c.name.toLowerCase().includes(q)).slice(0, 5);
  const show = focus && hits.length > 0;
  const pick = (c: CatalogItem) => { onPick(c); setFocus(false); };
  return (
    <div className="relative">
      <input className="pd-input text-sm" placeholder="Search catalog or type a new item name" autoComplete="off" role="combobox" aria-expanded={show} value={l.name ?? ""}
        onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
        onChange={(e) => { onText(e.target.value); setHi(0); setFocus(true); }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % hits.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + hits.length) % hits.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[hi]); }
          else if (e.key === "Escape") setFocus(false);
        }} />
      {show && (
        <div role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
          <p className="px-3 pb-1 pt-2 text-[10.5px] font-medium text-muted-foreground">Matching item names</p>
          {hits.map((c, i) => (
            <button key={c.id} type="button" role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              className={cn("flex w-full items-center px-3 py-1.5 text-left text-muted-foreground", i === hi && "bg-accent")}>
              <span className="min-w-0 flex-1 truncate text-[13px]">{(() => { const k = c.name.toLowerCase().indexOf(q); return <>{c.name.slice(0, k)}<mark className="bg-transparent font-semibold text-foreground">{c.name.slice(k, k + q.length)}</mark>{c.name.slice(k + q.length)}</>; })()}</span>
            </button>
          ))}
          <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">Not listed? Keep typing to add it as a new item.</p>
        </div>
      )}
    </div>
  );
}
