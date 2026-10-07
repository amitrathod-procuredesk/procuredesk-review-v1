import { Building2, CalendarDays, Check, ChevronDown, CreditCard, FileText, FolderKanban, MapPin, Truck, User, Users, Zap, Clock, Repeat } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDB } from "@/lib/pd/store";
import { PAYMENT_METHODS, REQUEST_TYPES, SHIPMENT_TYPES, type PRequest } from "@/lib/pd/types";
import { cn } from "@/lib/utils";

type SetFn = (p: Partial<PRequest>, key?: string, label?: string) => void;
type Opt = { value: string; label: string };

function Chip({ icon, label, value, ai, children, wide }: { icon: ReactNode; label: string; value?: string; ai?: boolean; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const empty = !value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "group inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-full px-3 text-[13px] transition-all active:scale-[0.98]",
            empty ? "border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary" : "bg-subtle text-foreground hover:bg-accent",
            open && "bg-accent ring-2 ring-primary/15",
          )}
        >
          <span className={cn("shrink-0 [&_svg]:size-3.5", empty ? "" : "text-muted-foreground")}>{icon}</span>
          <span className="shrink-0 text-muted-foreground">{label}</span>
          {value && <span className="min-w-0 truncate font-medium">{value}</span>}
          {ai && <span className="size-1.5 shrink-0 rounded-full bg-primary" title="AI suggested" />}
          <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className={cn("p-1", wide ? "w-72" : "w-56")}>
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function Options({ opts, value, onPick, close }: { opts: Opt[]; value?: string; onPick: (v: string) => void; close: () => void }) {
  return (
    <ul className="max-h-64 overflow-y-auto">
      {opts.map((o) => (
        <li key={o.value}>
          <button onClick={() => { onPick(o.value); close(); }} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-subtle", o.value === value && "text-primary")}>
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <Check className="size-3.5 shrink-0" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Toggle({ on, icon, label, onChange }: { on: boolean; icon: ReactNode; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-all active:scale-[0.98] [&_svg]:size-3.5",
        on ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      {on ? <Check /> : icon}
      {label}
    </button>
  );
}

const list = (a: readonly string[]): Opt[] => a.map((x) => ({ value: x, label: x }));

export function EssentialsBar({ r, set }: { r: PRequest; set: SetFn }) {
  const db = useDB();
  const dept = db.departments.find((d) => d.id === r.departmentId);
  const contact = db.users.find((u) => u.id === r.requesterId);
  const ai = (k: string) => r.sources[k] === "ai";
  const fmtDate = r.requiredBy ? new Date(r.requiredBy + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon={<Building2 />} label="Business unit" value={r.businessUnit}>
          {(c) => <Options opts={list(db.org.businessUnits)} value={r.businessUnit} onPick={(v) => set({ businessUnit: v })} close={c} />}
        </Chip>
        <Chip icon={<Users />} label="Department" value={dept?.name} ai={ai("department")}>
          {(c) => <Options opts={db.departments.map((d) => ({ value: d.id, label: d.name }))} value={r.departmentId} close={c} onPick={(v) => { const d = db.departments.find((x) => x.id === v); set({ departmentId: v, businessUnit: d?.businessUnit ?? r.businessUnit }, "department", `Department set to ${d?.name}`); }} />}
        </Chip>
        <Chip icon={<FileText />} label="Type" value={r.requestType}>
          {(c) => <Options opts={list(REQUEST_TYPES)} value={r.requestType} onPick={(v) => set({ requestType: v })} close={c} />}
        </Chip>
        <Chip icon={<User />} label="Contact" value={contact ? `${contact.name} (you)` : undefined}>
          {() => <p className="px-2 pb-2 text-sm text-muted-foreground">The requester is always the contact for this request.</p>}
        </Chip>
        <Chip icon={<MapPin />} label="Ship to" value={r.shipTo} wide>
          {(c) => <Options opts={list(db.org.shipTo)} value={r.shipTo} onPick={(v) => set({ shipTo: v })} close={c} />}
        </Chip>
        <Chip icon={<CreditCard />} label="Payment" value={r.paymentMethod}>
          {(c) => <Options opts={list(PAYMENT_METHODS)} value={r.paymentMethod} onPick={(v) => set({ paymentMethod: v }, undefined, `Payment method set to ${v}`)} close={c} />}
        </Chip>
        <Chip icon={<FolderKanban />} label="Project" value={r.project || undefined} ai={ai("project")}>
          {(c) => <Options opts={[{ value: "", label: "None" }, ...list(db.org.projects)]} value={r.project} onPick={(v) => set({ project: v }, "project")} close={c} />}
        </Chip>
        <Chip icon={<Truck />} label="Shipment" value={r.shipmentType}>
          {(c) => <Options opts={list(SHIPMENT_TYPES)} value={r.shipmentType} onPick={(v) => set({ shipmentType: v })} close={c} />}
        </Chip>
        <Chip icon={<CalendarDays />} label="Needed by" value={fmtDate} ai={ai("requiredBy")}>
          {(c) => (
            <div className="space-y-2 px-2 pb-2">
              <input type="date" autoFocus className="pd-input" value={r.requiredBy ?? ""} onChange={(e) => set({ requiredBy: e.target.value || undefined }, "requiredBy")} />
              {r.requiredBy && <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { set({ requiredBy: undefined }, "requiredBy"); c(); }}>Clear date</button>}
            </div>
          )}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
        <Toggle on={r.urgent} icon={<Zap />} label="Urgent" onChange={(v) => set({ urgent: v }, undefined, `Urgent ${v ? "enabled" : "disabled"}`)} />
        <Toggle on={r.delayed} icon={<Clock />} label="Delayed release" onChange={(v) => set({ delayed: v }, undefined, `Delayed release ${v ? "enabled" : "disabled"}`)} />
        <Toggle on={r.blanket} icon={<Repeat />} label="Blanket requisition" onChange={(v) => set({ blanket: v }, undefined, `Blanket requisition ${v ? "enabled" : "disabled"}`)} />
      </div>
    </div>
  );
}
