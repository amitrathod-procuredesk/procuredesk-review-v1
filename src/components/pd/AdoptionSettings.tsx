import { useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TextInput } from "@/components/pd/form";
import { METRICS, resolveBenchmarks, validBenchmark, type MetricId } from "@/lib/pd/adoption";
import { mutate, useDB } from "@/lib/pd/store";

export function AdoptionSettings() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<MetricId, string>>({ po: "", pobi: "", spend: "", logins: "" });
  const invalid = METRICS.some((m) => draft[m.id].trim() === "" || !validBenchmark(Number(draft[m.id])));
  const openSettings = () => {
    const benchmarks = resolveBenchmarks(db.org.adoptionBenchmarks);
    setDraft(Object.fromEntries(METRICS.map((m) => [m.id, String(benchmarks[m.id])])) as Record<MetricId, string>);
    setOpen(true);
  };
  const save = () => {
    if (invalid) return;
    const values = Object.fromEntries(METRICS.map((m) => [m.id, Number(draft[m.id])])) as Record<MetricId, number>;
    mutate((d) => { d.org.adoptionBenchmarks = { ...d.org.adoptionBenchmarks, ...values }; });
    setOpen(false);
    toast.success("Benchmarks updated");
  };
  return <>
    <Button variant="outline" size="sm" onClick={openSettings}><Settings2 />Settings</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adoption settings</DialogTitle><DialogDescription>Set a benchmark for each metric. Changes apply to everyone in your workspace.</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
          {METRICS.map((m) => {
            const error = draft[m.id].trim() === "" || !validBenchmark(Number(draft[m.id]));
            return <div key={m.id} className="flex items-start justify-between gap-3">
              <label htmlFor={`benchmark-${m.id}`} className="min-w-0 pt-1 text-sm font-medium">{m.label}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{m.help}</span></label>
              <div className="w-24 shrink-0"><div className="relative"><TextInput id={`benchmark-${m.id}`} aria-label={`${m.label} benchmark`} type="number" min={0} max={100} step="any" value={draft[m.id]} invalid={error} aria-describedby={error ? `error-${m.id}` : undefined} className="pr-7 num" onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span></div>{error && <p id={`error-${m.id}`} className="mt-1 text-xs text-destructive">Enter 0–100</p>}</div>
            </div>;
          })}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={invalid}>Save changes</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}