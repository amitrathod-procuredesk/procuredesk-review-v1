import { useEffect, useState } from "react";
import { Plus, Split, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { lineTotal, money } from "@/lib/pd/engine";
import { log, updateRequest, useMe } from "@/lib/pd/store";
import { ACCOUNTS, type LineItem } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

type Row = { account: string; percent: number };

/** Validates a split: 2+ rows, every row has an account, no duplicates, each >0 and the total is exactly 100%. */
export function splitError(rows: Row[]): string | null {
  if (rows.length < 2) return "Add at least two accounts to split.";
  if (rows.some((r) => !r.account)) return "Choose an account for every row.";
  if (new Set(rows.map((r) => r.account)).size !== rows.length) return "Each account can appear only once.";
  if (rows.some((r) => !(r.percent > 0))) return "Each share must be more than 0%.";
  const sum = Math.round(rows.reduce((s, r) => s + r.percent, 0) * 100) / 100;
  if (sum !== 100) return `Shares add up to ${sum}% — they must total 100%.`;
  return null;
}

/** Short label for a line's account, including split count. */
export const accountLabel = (l: LineItem) =>
  l.accountSplits?.length ? `${l.accountSplits[0].account} +${l.accountSplits.length - 1}` : l.account;

export function SplitAccountButton({ requestId, line }: { requestId: string; line: LineItem }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const initial = (): Row[] => line.accountSplits?.map((s) => ({ ...s })) ?? [{ account: line.account, percent: 50 }, { account: "", percent: 50 }];
  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => { if (open) setRows(initial()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = lineTotal(line);
  const sum = rows.reduce((s, r) => s + (r.percent || 0), 0);
  const err = splitError(rows);
  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = () => {
    updateRequest(requestId, (x) => {
      const l = x.items.find((i) => i.id === line.id);
      if (!l) return;
      l.accountSplits = rows;
      l.account = rows[0].account;
      log(x, `Account split on “${l.description || "line"}”: ${rows.map((r) => `${r.account} ${r.percent}%`).join(", ")}`, "edit", me?.id);
    });
    setOpen(false);
  };
  const clear = () => {
    updateRequest(requestId, (x) => {
      const l = x.items.find((i) => i.id === line.id);
      if (!l) return;
      l.account = l.accountSplits?.[0]?.account ?? l.account;
      delete l.accountSplits;
      log(x, `Account split removed on “${l.description || "line"}”`, "edit", me?.id);
    });
    setOpen(false);
  };
  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => setOpen(true)} aria-label="Split account" className={cn("inline-flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-subtle hover:text-primary", line.accountSplits && "text-primary")}>
              <Split className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">{line.accountSplits ? "Edit account split" : "Split account"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Split account</DialogTitle>
            <DialogDescription className="line-clamp-1">{line.description || "Line item"} · {money(total)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_76px_92px_24px] gap-2 px-0.5 text-[11px] text-muted-foreground">
              <span>Account</span><span className="text-right">Share</span><span className="text-right">Amount</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_76px_92px_24px] items-center gap-2">
                <select aria-label={`Account ${i + 1}`} className="pd-input" value={r.account} onChange={(e) => set(i, { account: e.target.value })}>
                  <option value="">Choose account…</option>
                  {ACCOUNTS.map((a) => <option key={a} disabled={a !== r.account && rows.some((x) => x.account === a)}>{a}</option>)}
                </select>
                <div className="relative">
                  <input aria-label={`Share ${i + 1}`} type="number" min={0} max={100} step="0.01" className="pd-input num pr-6 text-right" value={Number.isFinite(r.percent) ? r.percent : ""} onChange={(e) => set(i, { percent: parseFloat(e.target.value) })} />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <span className="num truncate text-right text-sm">{money((total * (r.percent || 0)) / 100)}</span>
                <button type="button" aria-label={`Remove account ${i + 1}`} disabled={rows.length <= 2} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground disabled:opacity-30">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRows((rs) => [...rs, { account: "", percent: Math.max(0, Math.round((100 - sum) * 100) / 100) }])}><Plus className="size-3.5" />Add account</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRows((rs) => { const base = Math.floor(10000 / rs.length) / 100; return rs.map((r, j) => ({ ...r, percent: j === 0 ? Math.round((100 - base * (rs.length - 1)) * 100) / 100 : base })); })}>Split evenly</Button>
              </div>
              <span className={cn("num", Math.round(sum * 100) / 100 === 100 ? "text-muted-foreground" : "text-destructive")}>{Math.round(sum * 100) / 100}% of 100%</span>
            </div>
            {err && <p className="text-xs text-destructive" role="alert">{err}</p>}
          </div>
          <DialogFooter>
            {line.accountSplits && <Button variant="ghost" className="sm:mr-auto" onClick={clear}>Remove split</Button>}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!!err} onClick={save}>Save split</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
