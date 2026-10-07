import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Money, UserAvatar } from "@/components/pd/bits";
import { budgetAvailable, money, uid } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { CATEGORIES, type Role } from "@/lib/pd/types";

export const Route = createFileRoute("/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin · ProcureDesk" },
      { name: "description", content: "Configure organization, users, budgets, approval rules, policies and vendors." },
      { property: "og:title", content: "Admin · ProcureDesk" },
      { property: "og:description", content: "Procurement administration." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const me = useMe()!;
  if (me.role !== "admin") return <div className="p-8"><Empty title="Permission denied" body="Only admins can configure the organization." /></div>;
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <h1 className="pd-h1 mb-4">Admin</h1>
      <Tabs defaultValue="users">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="org">Organization</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="depts">Departments & budgets</TabsTrigger>
          <TabsTrigger value="rules">Approval rules</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="vendors">Vendors & catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="org"><OrgTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="depts"><DeptTab /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="policies"><PolicyTab /></TabsContent>
        <TabsContent value="vendors"><VendorTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const Panel = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <section className="pd-panel mb-4"><header className="border-b border-border px-4 py-3"><h2 className="text-sm font-medium">{title}</h2>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</header><div className="p-4">{children}</div></section>
);

function OrgTab() {
  const db = useDB();
  const [o, setO] = useState(db.org);
  return (
    <Panel title="Organization" desc="Basic settings used across every request.">
      <div className="grid gap-4 sm:grid-cols-3">
        <label><span className="pd-label">Name</span><input className="pd-input" value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></label>
        <label><span className="pd-label">Currency</span><input className="pd-input" value={o.currency} disabled /></label>
        <label><span className="pd-label">Fiscal year</span><input className="pd-input" value={o.fiscalYear} onChange={(e) => setO({ ...o, fiscalYear: e.target.value })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Business units (comma separated)</span><input className="pd-input" value={o.businessUnits.join(", ")} onChange={(e) => setO({ ...o, businessUnits: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Ship-to locations</span><input className="pd-input" value={o.shipTo.join(", ")} onChange={(e) => setO({ ...o, shipTo: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Projects</span><input className="pd-input" value={o.projects.join(", ")} onChange={(e) => setO({ ...o, projects: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
      </div>
      <Button className="mt-4" size="sm" onClick={() => { mutate((d) => (d.org = o)); toast.success("Organization saved"); }}>Save</Button>
    </Panel>
  );
}

function UsersTab() {
  const db = useDB();
  const [f, setF] = useState({ name: "", email: "", role: "requestor" as Role, title: "", departmentId: "" });
  const add = () => {
    if (!f.name || !/^\S+@\S+$/.test(f.email)) return toast.error("Name and a valid email are required");
    if (db.users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) return toast.error("A user with that email already exists");
    mutate((d) => d.users.push({ id: uid("u"), ...f, departmentId: f.departmentId || undefined, password: "demo123", active: true }));
    toast.success(`${f.name} created`, { description: `Temporary password: demo123` });
    setF({ name: "", email: "", role: "requestor", title: "", departmentId: "" });
  };
  return (
    <>
      <Panel title="Create user" desc="Requestors create purchases; approvers can be assigned to approval rules.">
        <div className="grid gap-3 sm:grid-cols-6">
          <input className="pd-input sm:col-span-1" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="pd-input sm:col-span-2" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className="pd-input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <select className="pd-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option value="requestor">Requestor</option><option value="approver">Approver</option><option value="admin">Admin</option></select>
          <select className="pd-input" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">Department</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>
        <Button size="sm" className="mt-3" onClick={add}>Create user</Button>
      </Panel>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="pd-table">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id}>
                <td><div className="flex items-center gap-2"><UserAvatar user={u} /><div><p>{u.name}</p><p className="text-xs text-muted-foreground">{u.email} · {u.title}</p></div></div></td>
                <td><select className="pd-input-bare w-32 capitalize" value={u.role} disabled={u.id === "u_admin"} onChange={(e) => mutate((d) => (d.users.find((x) => x.id === u.id)!.role = e.target.value as Role))}><option value="requestor">requestor</option><option value="approver">approver</option><option value="admin">admin</option></select></td>
                <td>{db.departments.find((d) => d.id === u.departmentId)?.name ?? "—"}</td>
                <td><Switch checked={u.active} disabled={u.id === "u_admin"} onCheckedChange={(v) => mutate((d) => (d.users.find((x) => x.id === u.id)!.active = v))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DeptTab() {
  const db = useDB();
  const [dn, setDn] = useState({ name: "", businessUnit: db.org.businessUnits[0], managerId: "" });
  const [b, setB] = useState({ name: "", departmentId: "", category: CATEGORIES[0], total: 0 });
  const approvers = db.users.filter((u) => u.role === "approver");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Departments" desc="The manager is the fallback approver when no rule applies.">
        <ul className="mb-4 divide-y divide-border">
          {db.departments.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{d.name} <span className="text-xs text-muted-foreground">· {d.businessUnit}</span></span>
              <select className="pd-input-bare w-40 text-xs" value={d.managerId ?? ""} onChange={(e) => mutate((x) => (x.departments.find((y) => y.id === d.id)!.managerId = e.target.value || undefined))}><option value="">No manager</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="pd-input" placeholder="Department name" value={dn.name} onChange={(e) => setDn({ ...dn, name: e.target.value })} />
          <select className="pd-input" value={dn.businessUnit} onChange={(e) => setDn({ ...dn, businessUnit: e.target.value })}>{db.org.businessUnits.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="pd-input" value={dn.managerId} onChange={(e) => setDn({ ...dn, managerId: e.target.value })}><option value="">Manager</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </div>
        <Button size="sm" className="mt-3" disabled={!dn.name.trim()} onClick={() => { mutate((d) => d.departments.push({ id: uid("dep"), name: dn.name, businessUnit: dn.businessUnit, managerId: dn.managerId || undefined })); setDn({ ...dn, name: "" }); toast.success("Department added"); }}>Add department</Button>
      </Panel>
      <Panel title="Budgets" desc="Available = total − already committed − approved requests.">
        <ul className="mb-4 divide-y divide-border">
          {db.budgets.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate">{x.name}</span><span className="text-xs text-muted-foreground">{db.departments.find((d) => d.id === x.departmentId)?.name} · {x.category}</span></span>
              <span className="num text-xs text-muted-foreground">{money(budgetAvailable(x.id, db))} left</span>
              <input type="number" aria-label="Budget total" className="pd-input-bare num w-28 text-right" value={x.total} onChange={(e) => mutate((d) => (d.budgets.find((y) => y.id === x.id)!.total = Math.max(0, Number(e.target.value))))} />
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="pd-input" placeholder="Budget name" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          <select className="pd-input" value={b.departmentId} onChange={(e) => setB({ ...b, departmentId: e.target.value })}><option value="">Department</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select className="pd-input" value={b.category} onChange={(e) => setB({ ...b, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" className="pd-input num" placeholder="Total" value={b.total || ""} onChange={(e) => setB({ ...b, total: Number(e.target.value) })} />
        </div>
        <Button size="sm" className="mt-3" disabled={!b.name || !b.departmentId || b.total <= 0} onClick={() => { mutate((d) => d.budgets.push({ id: uid("bud"), ...b, committed: 0, fiscalYear: d.org.fiscalYear })); setB({ ...b, name: "", total: 0 }); toast.success("Budget added"); }}>Add budget</Button>
      </Panel>
    </div>
  );
}

function RulesTab() {
  const db = useDB();
  const approvers = db.users.filter((u) => u.role === "approver" && u.active);
  const [f, setF] = useState({ name: "", minAmount: 0, category: "", approverIds: [] as string[], mode: "all" as "all" | "any" });
  const sorted = [...db.rules].sort((a, b) => a.order - b.order);
  return (
    <>
      <Panel title="Approval rules" desc="Every matching rule becomes a stage, in order. Stages with several approvers run in parallel. If nothing matches, the department manager approves.">
        <ol className="space-y-2">
          {sorted.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm">
              <span className="num w-5 text-xs text-muted-foreground">{i + 1}</span>
              <div className="min-w-48 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">When total ≥ {money(r.minAmount)}{r.category ? ` and contains ${r.category}` : ""} → {r.approverIds.map((id) => db.users.find((u) => u.id === id)?.name).join(", ")}{r.approverIds.length > 1 ? ` (${r.mode === "all" ? "all must approve" : "any one"})` : ""}</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs">Min <input type="number" className="pd-input num h-7 w-24" value={r.minAmount} onChange={(e) => mutate((d) => (d.rules.find((x) => x.id === r.id)!.minAmount = Math.max(0, Number(e.target.value))))} /></label>
              <Switch checked={r.enabled} onCheckedChange={(v) => mutate((d) => (d.rules.find((x) => x.id === r.id)!.enabled = v))} aria-label="Enabled" />
              <button aria-label="Delete rule" className="text-muted-foreground hover:text-destructive" onClick={() => mutate((d) => (d.rules = d.rules.filter((x) => x.id !== r.id)))}><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Add rule" desc="Example: “Purchases over $20,000 require Executive approval.”">
        <div className="grid gap-3 sm:grid-cols-4">
          <input className="pd-input" placeholder="Stage name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input type="number" className="pd-input num" placeholder="Minimum amount" value={f.minAmount || ""} onChange={(e) => setF({ ...f, minAmount: Number(e.target.value) })} />
          <select className="pd-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Any category</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="pd-input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "all" | "any" })}><option value="all">All approvers must approve</option><option value="any">Any one approver</option></select>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {approvers.map((u) => <button key={u.id} className="pd-chip" data-active={f.approverIds.includes(u.id)} onClick={() => setF({ ...f, approverIds: f.approverIds.includes(u.id) ? f.approverIds.filter((x) => x !== u.id) : [...f.approverIds, u.id] })}>{u.name} <span className="text-muted-foreground">· {u.title}</span></button>)}
        </div>
        <Button size="sm" className="mt-3" disabled={!f.name || !f.approverIds.length} onClick={() => { mutate((d) => d.rules.push({ id: uid("r"), ...f, category: f.category || undefined, order: Math.max(0, ...d.rules.map((x) => x.order)) + 1, enabled: true })); setF({ name: "", minAmount: 0, category: "", approverIds: [], mode: "all" }); toast.success("Rule added"); }}>Add rule</Button>
      </Panel>
    </>
  );
}

function PolicyTab() {
  const db = useDB();
  const p = db.policies;
  return (
    <Panel title="Procurement policies" desc="Applied as checks before submission and shown to approvers.">
      <div className="grid gap-4 sm:grid-cols-3">
        <label><span className="pd-label">Quote required above</span><input type="number" className="pd-input num" value={p.quoteThreshold} onChange={(e) => mutate((d) => (d.policies.quoteThreshold = Math.max(0, Number(e.target.value))))} /></label>
        <label><span className="pd-label">Duplicate detection window (days)</span><input type="number" className="pd-input num" value={p.duplicateWindowDays} onChange={(e) => mutate((d) => (d.policies.duplicateWindowDays = Math.max(1, Number(e.target.value))))} /></label>
        <label className="flex items-center gap-2 pt-5"><Switch checked={p.warnNonPreferredVendor} onCheckedChange={(v) => mutate((d) => (d.policies.warnNonPreferredVendor = v))} /><span className="text-sm">Warn on non-preferred suppliers</span></label>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Always enforced: required fields, verified suppliers, and budget availability (with exception requests).</p>
    </Panel>
  );
}

function VendorTab() {
  const db = useDB();
  const [v, setV] = useState({ name: "", preferred: false });
  const [c, setC] = useState({ name: "", partNumber: "", vendorId: "", price: 0, category: CATEGORIES[0], keywords: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Panel title="Vendors">
        <ul className="mb-4 divide-y divide-border">
          {db.vendors.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">{x.name}</span>
              {(["preferred", "verified", "contractActive"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={x[k]} onChange={(e) => mutate((d) => (d.vendors.find((y) => y.id === x.id)![k] = e.target.checked))} />{k === "contractActive" ? "contract" : k}</label>
              ))}
            </li>
          ))}
        </ul>
        <div className="flex gap-2"><input className="pd-input" placeholder="Vendor name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /><Button size="sm" disabled={!v.name} onClick={() => { mutate((d) => d.vendors.push({ id: uid("v"), name: v.name, preferred: v.preferred, verified: true, contractActive: false, categories: [] })); setV({ name: "", preferred: false }); }}>Add</Button></div>
      </Panel>
      <Panel title="Catalog" desc="The copilot matches requests against these items by keyword.">
        <div className="mb-4 overflow-x-auto"><table className="pd-table"><thead><tr><th>Item</th><th>Supplier</th><th className="text-right">Price</th><th>Keywords</th></tr></thead><tbody>
          {db.catalog.map((x) => <tr key={x.id}><td><p>{x.name}</p><p className="text-[11px] text-muted-foreground">{x.partNumber} · {x.category}</p></td><td>{db.vendors.find((y) => y.id === x.vendorId)?.name}</td><td className="text-right"><Money v={x.price} /></td><td className="text-xs text-muted-foreground">{x.keywords.join(", ")}</td></tr>)}
        </tbody></table></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="pd-input" placeholder="Item name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <input className="pd-input" placeholder="Part number" value={c.partNumber} onChange={(e) => setC({ ...c, partNumber: e.target.value })} />
          <select className="pd-input" value={c.vendorId} onChange={(e) => setC({ ...c, vendorId: e.target.value })}><option value="">Supplier</option>{db.vendors.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          <input type="number" className="pd-input num" placeholder="Price" value={c.price || ""} onChange={(e) => setC({ ...c, price: Number(e.target.value) })} />
          <select className="pd-input" value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
          <input className="pd-input" placeholder="Keywords, comma separated" value={c.keywords} onChange={(e) => setC({ ...c, keywords: e.target.value })} />
        </div>
        <Button size="sm" className="mt-3" disabled={!c.name || !c.vendorId || c.price <= 0} onClick={() => { mutate((d) => d.catalog.push({ id: uid("c"), name: c.name, partNumber: c.partNumber, vendorId: c.vendorId, price: c.price, category: c.category, account: "", keywords: c.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).concat(c.name.toLowerCase()), available: true })); setC({ ...c, name: "", partNumber: "", price: 0, keywords: "" }); toast.success("Catalog item added"); }}>Add catalog item</Button>
      </Panel>
    </div>
  );
}
