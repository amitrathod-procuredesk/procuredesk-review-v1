import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, KeyRound, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Empty, Money, UserAvatar } from "@/components/pd/bits";
import { budgetAvailable, money, uid } from "@/lib/pd/engine";
import { mutate, useDB, useMe } from "@/lib/pd/store";
import { CATEGORIES, type Role } from "@/lib/pd/types";
import { ADMIN_SECTIONS, isAdminSection, type AdminSection } from "@/lib/pd/adminNav";
import { cn } from "@/lib/utils";
import { ConfigHub } from "@/components/pd/ConfigHub";

export const Route = createFileRoute("/app/admin")({
  validateSearch: (s: Record<string, unknown>): { section?: AdminSection; item?: string } => ({ ...(isAdminSection(s.section) ? { section: s.section } : {}), ...(typeof s.item === "string" ? { item: s.item } : {}) }),
  head: () => ({
    meta: [
      { title: "Admin portal · ProcureDesk" },
      { name: "description", content: "Configure users, roles, approvals, reference data and general settings." },
      { property: "og:title", content: "Admin portal · ProcureDesk" },
      { property: "og:description", content: "Procurement administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

const SectionTitle = createContext("");

function Admin() {
  const me = useMe()!;
  const { section = "users", item } = Route.useSearch();
  const nav = Route.useNavigate();
  const cur = ADMIN_SECTIONS.find((s) => s.id === section)!;
  if (me.role !== "admin")
    return (
      <div className="p-8">
        <Empty title="Admin access required" body="Only admins can open the admin portal. Switch to an admin user from your profile menu." />
        <div className="mt-4 text-center"><Link to="/app" className="text-sm font-medium text-primary hover:underline">Back to workspace</Link></div>
      </div>
    );
  return (
    <div key={section + (item ?? "")} className="animate-in fade-in slide-in-from-bottom-1 mx-auto max-w-6xl p-4 duration-200 md:p-8">
      <select aria-label="Admin section" className="pd-input mb-4 md:hidden" value={section} onChange={(e) => nav({ search: { section: e.target.value as AdminSection } })}>
        {ADMIN_SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.group} · {s.label}</option>)}
      </select>
      {section !== "config" && <>
        <p className="text-xs text-muted-foreground">{cur.group}</p>
        <h1 className="pd-h1">{cur.label}</h1>
        <p className="mb-5 mt-0.5 text-[13px] text-muted-foreground">{cur.desc}</p>
      </>}
      <SectionTitle.Provider value={cur.label}>
        {section === "users" && <UsersTab />}
        {section === "roles" && <RolesTab />}
        {section === "departments" && <DeptTab part="departments" />}
        {section === "budgets" && <DeptTab part="budgets" />}
        {section === "rules" && <RulesTab />}
        {section === "policies" && <PolicyTab />}
        {section === "vendors" && <VendorTab />}
        {section === "config" && <ConfigHub item={item} renderCompany={() => <OrgTab />} />}
        {section === "logs" && <LogsTab />}
        {section === "password" && <PasswordTab />}
      </SectionTitle.Provider>
    </div>
  );
}

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  const page = useContext(SectionTitle);
  // Don't repeat the page heading/description inside its own panel.
  const showHead = title !== page;
  return (
    <section className="pd-panel mb-4">
      {showHead && <header className="border-b border-border px-4 py-3"><h2 className="text-sm font-medium">{title}</h2>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</header>}
      <div className="p-4">{!showHead && desc && <p className="mb-3 text-xs text-muted-foreground">{desc}</p>}{children}</div>
    </section>
  );
}

const PERMS: { label: string; roles: Role[] }[] = [
  { label: "Create and edit own requests", roles: ["requestor", "approver", "admin"] },
  { label: "Approve, reject or reassign", roles: ["approver", "admin"] },
  { label: "Partially approve line items", roles: ["approver", "admin"] },
  { label: "Create orders from approved requests", roles: ["admin"] },
  { label: "Manage users, rules and reference data", roles: ["admin"] },
  { label: "Open the admin portal", roles: ["admin"] },
];

function RolesTab() {
  const db = useDB();
  const roles: Role[] = ["requestor", "approver", "admin"];
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="pd-table">
        <thead><tr><th>Permission</th>{roles.map((r) => <th key={r} className="text-center capitalize">{r} <span className="num ml-1 text-[11px] font-normal text-muted-foreground">{db.users.filter((u) => u.role === r && u.active).length}</span></th>)}</tr></thead>
        <tbody>
          {PERMS.map((p) => (
            <tr key={p.label}>
              <td>{p.label}</td>
              {roles.map((r) => <td key={r} className="text-center">{p.roles.includes(r) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <X className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTab() {
  const db = useDB();
  const [q, setQ] = useState("");
  const rows = useMemo(() => db.requests.flatMap((r) => r.activity.map((a) => ({ ...a, req: r }))).sort((a, b) => b.at.localeCompare(a.at)), [db.requests]);
  const shown = rows.filter((x) => !q || `${x.text} ${x.req.id} ${x.req.title}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logs by action or request" aria-label="Search logs" className="h-8 flex-1 bg-transparent text-[13px] outline-none" />
        <span className="num text-[11px] text-muted-foreground">{shown.length} of {rows.length}</span>
      </div>
      {shown.length === 0 ? <div className="p-8"><Empty title="No matching logs" body="Try a different search." /></div> : (
        <ul className="divide-y divide-border">
          {shown.map((x) => {
            const actor = db.users.find((u) => u.id === x.actorId);
            return (
              <li key={`${x.req.id}-${x.id}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                {actor ? <UserAvatar user={actor} /> : <span className="inline-flex size-6 items-center justify-center rounded-full bg-subtle"><ShieldCheck className="size-3.5 text-muted-foreground" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate"><span className="font-medium">{actor?.name ?? "System"}</span> <span className="text-muted-foreground">{x.text}</span></p>
                  <Link to="/app/requests/$id" params={{ id: x.req.id }} className="block truncate text-[11px] text-muted-foreground hover:text-primary">{x.req.id} · {x.req.title}</Link>
                </div>
                <time className="num shrink-0 text-[11px] text-muted-foreground">{new Date(x.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PasswordTab() {
  const db = useDB();
  const users = db.users.filter((u) => u.active);
  const [userId, setUserId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (!userId) return setErr("Choose a user");
    if (pw.length < 8) return setErr("Use at least 8 characters");
    const u = users.find((x) => x.id === userId)!;
    mutate((d) => (d.users.find((x) => x.id === userId)!.password = pw));
    toast.success(`Password reset for ${u.name}`, { description: "They'll use the new password next time they sign in." });
    setPw(""); setUserId(""); setErr(null);
  };
  return (
    <Panel title="Reset the password">
      <div className="grid max-w-md gap-3">
        <label><span className="pd-label">User</span>
          <select className={cn("pd-input", err && !userId && "border-destructive")} value={userId} onChange={(e) => { setUserId(e.target.value); setErr(null); }}>
            <option value="">Select a user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
          </select>
        </label>
        <label><span className="pd-label">New password</span>
          <input type="password" autoComplete="new-password" className={cn("pd-input", err && userId && "border-destructive")} value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} placeholder="At least 8 characters" />
        </label>
        {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
        <div><Button size="sm" onClick={save}><KeyRound /> Reset password</Button></div>
      </div>
    </Panel>
  );
}

function OrgTab() {
  const db = useDB();
  const [o, setO] = useState(db.org);
  return (
    <section className="pd-panel p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label><span className="pd-label">Name</span><input className="pd-input" value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></label>
        <label><span className="pd-label">Currency</span><input className="pd-input" value={o.currency} disabled /></label>
        <label><span className="pd-label">Fiscal year</span><input className="pd-input" value={o.fiscalYear} onChange={(e) => setO({ ...o, fiscalYear: e.target.value })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Business units (comma separated)</span><input className="pd-input" value={o.businessUnits.join(", ")} onChange={(e) => setO({ ...o, businessUnits: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Ship-to locations</span><input className="pd-input" value={o.shipTo.join(", ")} onChange={(e) => setO({ ...o, shipTo: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <label className="sm:col-span-3"><span className="pd-label">Projects</span><input className="pd-input" value={o.projects.join(", ")} onChange={(e) => setO({ ...o, projects: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
      </div>
      <Button className="mt-4" size="sm" onClick={() => { mutate((d) => (d.org = o)); toast.success("Organization saved"); }}>Save</Button>
    </section>
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

function DeptTab({ part }: { part: "departments" | "budgets" }) {
  const db = useDB();
  const [dn, setDn] = useState({ name: "", businessUnit: db.org.businessUnits[0], managerId: "" });
  const [b, setB] = useState({ name: "", departmentId: "", category: CATEGORIES[0], total: 0 });
  const approvers = db.users.filter((u) => u.role === "approver");
  return (
    <div>
      {part === "departments" && <Panel title="Departments" desc="The manager is the fallback approver when no rule applies.">
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
      </Panel>}
      {part === "budgets" && <Panel title="Budgets" desc="Available = total − already committed − approved requests.">
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
      </Panel>}
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
              <label className="flex items-center gap-1.5 text-xs">Min <input type="number" className="pd-input num w-24" value={r.minAmount} onChange={(e) => mutate((d) => (d.rules.find((x) => x.id === r.id)!.minAmount = Math.max(0, Number(e.target.value))))} /></label>
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
          <input className="pd-input" placeholder="Item number" inputMode="numeric" value={c.partNumber} onChange={(e) => setC({ ...c, partNumber: e.target.value.replace(/\D/g, "") })} />
          <select className="pd-input" value={c.vendorId} onChange={(e) => setC({ ...c, vendorId: e.target.value })}><option value="">Supplier</option>{db.vendors.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          <input type="number" className="pd-input num" placeholder="Price" value={c.price || ""} onChange={(e) => setC({ ...c, price: Number(e.target.value) })} />
          <select className="pd-input" value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
          <input className="pd-input" placeholder="Keywords, comma separated" value={c.keywords} onChange={(e) => setC({ ...c, keywords: e.target.value })} />
        </div>
        <Button size="sm" className="mt-3" disabled={!c.name || !c.vendorId || c.price <= 0} onClick={() => { mutate((d) => d.catalog.push({ id: uid("c"), name: c.name, description: "", partNumber: c.partNumber, vendorId: c.vendorId, price: c.price, category: c.category, account: "", keywords: c.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).concat(c.name.toLowerCase()), available: true })); setC({ ...c, name: "", partNumber: "", price: 0, keywords: "" }); toast.success("Catalog item added"); }}>Add catalog item</Button>
      </Panel>
    </div>
  );
}
