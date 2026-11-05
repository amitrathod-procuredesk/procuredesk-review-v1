import { createFileRoute, Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { AlarmClock, Box, ArrowLeftRight, ShieldCheck, Briefcase, ChevronDown, CircleDollarSign, ClipboardCheck, CreditCard, FileText, HeartHandshake, Lightbulb, LogOut, MessageSquare, MessageSquarePlus, ChevronLeft, ChevronRight, PieChart, RotateCcw, Search, Settings2, ShoppingBasket, WalletCards } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/pd/bits";
import { GlobalAssistant } from "@/components/pd/GlobalAssistant";
import { AgentNavIcon } from "@/components/pd/agents/AgentNavIcon";
import { isPendingFor } from "@/lib/pd/engine";
import { logout, mutate, resetDemo, useDB, useHydrated, useMe } from "@/lib/pd/store";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/lib/pd/adminNav";
import logo from "@/assets/procuredesk-logo.svg.asset.json";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace · ProcureDesk" },
      { name: "description", content: "Your ProcureDesk procurement workspace." },
      { property: "og:title", content: "Workspace · ProcureDesk" },
      { property: "og:description", content: "Requests, approvals and procurement controls in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppShell,
});

function AppShell() {
  const hydrated = useHydrated();
  const me = useMe();
  const db = useDB();
  const nav = useNavigate();
  const params = useParams({ strict: false }) as { id?: string };
  const [assistant, setAssistant] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const adminMode = path.startsWith("/app/admin");

  useEffect(() => {
    if (hydrated && !me) nav({ to: "/" });
  }, [hydrated, me, nav]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAssistant((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!hydrated || !me)
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-56 border-r border-border bg-sidebar p-4 md:block"><Skeleton className="h-6 w-32" /></div>
        <div className="flex-1 space-y-3 p-8"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>
      </div>
    );

  const pendingCount = db.requests.filter((r) => isPendingFor(r, me.id)).length;
  const ctx = params.id ? db.requests.find((r) => r.id === params.id) : undefined;
  const mobileItems = [
    { to: "/app/requests", label: "Requests", icon: FileText },
    { to: "/app/agents", label: "AI agents", icon: AgentNavIcon },
    ...(me.role !== "requestor" ? [{ to: "/app/approvals", label: "Approvals", icon: ClipboardCheck }] : []),
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 grid h-[60px] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Link to={adminMode ? "/app/admin" : "/app/requests"} className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
            <img src={logo.url} alt="ProcureDesk" width={208} height={32} className="h-6 w-[156px] max-w-full object-contain" />
          </Link>
          {adminMode && <span className="animate-in fade-in rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Admin</span>}
        </div>
        <div className="flex justify-center">
          {!adminMode && (
            <button onClick={() => setAssistant(true)} className="hidden h-9 w-full max-w-[304px] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 sm:flex">
              <Search className="size-4" /> <span className="flex-1 text-left">Search for anything</span>
              <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          {!adminMode && <>
            <button onClick={() => setAssistant(true)} aria-label="Search" className="sm:hidden"><Search className="size-4 text-muted-foreground" /></button>
            <Link to={me.role === "requestor" ? "/app/requests" : "/app/approvals"} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] font-medium transition-colors hover:border-primary/40">
              <AlarmClock className="size-4 text-primary" /> <span className="hidden sm:inline">My Tasks</span>
              {pendingCount > 0 && <span className="num inline-flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{pendingCount}</span>}
            </Link>
          </>}
          <UserMenu compact adminMode={adminMode} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {adminMode
          ? <AdminSideNav collapsed={collapsed} setCollapsed={setCollapsed} />
          : <SideNav collapsed={collapsed} setCollapsed={setCollapsed} pendingCount={pendingCount} role={me.role} onChat={() => setAssistant(true)} />}
        <div className={cn("flex min-w-0 flex-1 flex-col md:pb-0", !adminMode && "pb-16")}>
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className={cn("fixed inset-x-0 bottom-0 z-30 flex h-14 border-t border-border bg-surface md:hidden", adminMode && "hidden")}>
        {mobileItems.map((it) => (
          <Link key={it.to} to={it.to} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:text-primary">
            <it.icon className="size-4" />
            {it.label}
          </Link>
        ))}
      </nav>
      <GlobalAssistant open={assistant} onOpenChange={setAssistant} ctx={ctx} />
    </div>
  );
}

type NavLeaf = { label: string; to?: string; exact?: boolean; badge?: number };
type NavGroup = { label: string; icon: ComponentType<{ className?: string }>; to?: string; exact?: boolean; children?: NavLeaf[] };

function SideNav({ collapsed, setCollapsed, pendingCount, role, onChat }: { collapsed: boolean; setCollapsed: (v: boolean) => void; pendingCount: number; role: string; onChat: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const soon = (n: string) => toast(`${n} is coming soon`, { description: "This area isn't part of the demo yet." });
  const groups: NavGroup[] = [
    {
      label: "Purchase", icon: ShoppingBasket, children: [
        { label: "Request", to: "/app/requests" },
        { label: "Orders" },
        ...(role !== "requestor" ? [{ label: "Approvals", to: "/app/approvals", badge: pendingCount }] : []),
        { label: "Receipts" }, { label: "Catalogs" }, { label: "Supplier quotes" },
      ],
    },
    { label: "Pay", icon: CreditCard, children: [{ label: "Invoices" }, { label: "Payments" }] },
    { label: "Budgets", icon: PieChart, children: [{ label: "Overview" }, { label: "Forecasts" }] },
    { label: "Insights", icon: Lightbulb, children: [{ label: "Spend" }, { label: "Adoption", to: "/app/insights/adoption" }, { label: "Reports", to: "/app/reports" }] },
    { label: "AI agents", icon: AgentNavIcon, to: "/app/agents" },
    { label: "Expenses", icon: CircleDollarSign },
    { label: "Contracts", icon: FileText },
    { label: "Assets", icon: Box, children: [{ label: "Register", to: "/app/assets/register" }, { label: "Maintenance", to: "/app/assets/maintenance" }, { label: "Check in / out", to: "/app/assets/checkout" }, { label: "Reports", to: "/app/reports" }, { label: "Settings", to: "/app/assets/settings" }] },
    { label: "Inventory", icon: Briefcase },
    { label: "Sell", icon: HeartHandshake, children: [{ label: "Customers" }, { label: "Invoices" }] },
    { label: "Cards", icon: WalletCards, children: [{ label: "My cards" }, { label: "Transactions" }] },
  ];
  const groupActive = (g: NavGroup) => (g.to ? (g.exact ? path === g.to : path.startsWith(g.to)) : !!g.children?.some((c) => c.to && path.startsWith(c.to)));
  const [open, setOpen] = useState<string[]>(() => groups.filter(groupActive).map((g) => g.label).concat("Purchase"));
  const toggle = (l: string) => setOpen((o) => (o.includes(l) ? o.filter((x) => x !== l) : [...o, l]));
  const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground transition-colors hover:bg-sidebar-accent";

  return (
    <aside className={cn("sticky top-[60px] z-30 hidden h-[calc(100vh-60px)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex", collapsed ? "w-[56px]" : "w-[216px]")}>
      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand menu" : "Collapse menu"} className="absolute -right-3 top-5 z-40 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm outline-none transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30">
        {collapsed ? <ChevronRight className="size-3.5" strokeWidth={2} /> : <ChevronLeft className="size-3.5" strokeWidth={2} />}
      </button>
      <nav aria-label="Workspace" className={cn("flex-1 space-y-0.5 pd-scroll-hide overflow-y-auto pb-3 pt-4", collapsed ? "px-2" : "px-3")}>
        {groups.map((g) => {
          const act = groupActive(g);
          const isOpen = open.includes(g.label) && !collapsed;
          const icon = <g.icon className={cn("size-4 shrink-0", act || g.to === "/app/agents" ? "text-primary" : "text-foreground/80")} />;
          if (g.to)
            return (
              <Link key={g.label} to={g.to} activeOptions={{ exact: g.exact }} title={g.label} aria-label={g.label} className={cn(row, "outline-none focus-visible:ring-2 focus-visible:ring-ring", act && "bg-sidebar-accent text-primary", g.to === "/app/agents" && "font-medium", collapsed && "justify-center")}>
                {icon}{!collapsed && <span className="truncate">{g.label}</span>}
              </Link>
            );
          if (!g.children)
            return <button key={g.label} title={g.label} onClick={() => soon(g.label)} className={cn(row, collapsed && "justify-center")}>{icon}{!collapsed && <span className="truncate">{g.label}</span>}</button>;
          return (
            <div key={g.label}>
              <button title={g.label} onClick={() => (collapsed ? (setCollapsed(false), setOpen((o) => [...new Set([...o, g.label])])) : toggle(g.label))} className={cn(row, act && "text-primary", collapsed && "justify-center")}>
                {icon}
                {!collapsed && <><span className="flex-1 truncate text-left">{g.label}</span><ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} /></>}
              </button>
              {isOpen && (
                <div className="animate-in fade-in slide-in-from-top-1 mb-1 ml-[17px] mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {g.children.map((c) =>
                    c.to ? (
                      <Link key={c.label} to={c.to} className="flex h-8 items-center rounded-md px-2.5 text-[13px] text-muted-foreground data-[status=active]:text-primary text-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium">
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.badge ? <span className="num rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{c.badge}</span> : null}
                      </Link>
                    ) : (
                      <button key={c.label} onClick={() => soon(c.label)} className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent">{c.label}</button>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className={cn("space-y-0.5 border-t border-sidebar-border py-2", collapsed ? "mx-2" : "mx-3")}>
        <button onClick={onChat} title="Chat to us" className={cn(row, "text-primary", collapsed && "justify-center")}><MessageSquare className="size-4 shrink-0" />{!collapsed && "Chat to us"}</button>
        <button onClick={() => toast.success("Thanks! Feedback noted.")} title="Send feedback" className={cn(row, "text-primary", collapsed && "justify-center")}><MessageSquarePlus className="size-4 shrink-0" />{!collapsed && "Send feedback"}</button>
      </div>
    </aside>
  );
}

function AdminSideNav({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const search = useRouterState({ select: (s) => s.location.search as { section?: string } });
  const current = search.section ?? "users";
  const activeGroup = ADMIN_NAV.find((g) => g.items.some((i) => i.id === current))?.label;
  const [open, setOpen] = useState<string[]>(() => (activeGroup ? [activeGroup] : []));
  useEffect(() => { if (activeGroup) setOpen((o) => (o.includes(activeGroup) ? o : [...o, activeGroup])); }, [activeGroup]);
  const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground transition-colors hover:bg-sidebar-accent";
  return (
    <aside className={cn("sticky top-[60px] z-30 hidden h-[calc(100vh-60px)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex", collapsed ? "w-[56px]" : "w-[216px]")}>
      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand menu" : "Collapse menu"} className="absolute -right-3 top-5 z-40 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm outline-none transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30">
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
      <nav aria-label="Admin" className={cn("flex-1 space-y-0.5 pd-scroll-hide overflow-y-auto pb-3 pt-4", collapsed ? "px-2" : "px-3")}>
        {ADMIN_NAV.map((g) => {
          const act = g.label === activeGroup;
          const isOpen = open.includes(g.label) && !collapsed;
          return (
            <div key={g.label}>
              <button title={g.label} aria-expanded={isOpen} onClick={() => (collapsed ? (setCollapsed(false), setOpen((o) => [...new Set([...o, g.label])])) : setOpen((o) => (o.includes(g.label) ? o.filter((x) => x !== g.label) : [...o, g.label])))} className={cn(row, act && "text-primary", collapsed && "justify-center")}>
                <g.icon className={cn("size-4 shrink-0", act ? "text-primary" : "text-foreground/80")} />
                {!collapsed && <><span className="flex-1 truncate text-left">{g.label}</span><ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} /></>}
              </button>
              {isOpen && (
                <div className="animate-in fade-in slide-in-from-top-1 mb-1 ml-[17px] mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {g.items.map((c) => (
                    <Link key={c.id} to="/app/admin" search={{ section: c.id }} aria-current={c.id === current ? "page" : undefined} className={cn("flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors hover:bg-sidebar-accent", c.id === current ? "bg-sidebar-accent font-medium text-primary" : "text-foreground")}>
                      <span className="truncate">{c.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className={cn("space-y-0.5 border-t border-sidebar-border py-2", collapsed ? "mx-2" : "mx-3")}>
        <Link to="/app/requests" title="Back to workspace" className={cn(row, collapsed && "justify-center")}><ArrowLeftRight className="size-4 shrink-0" />{!collapsed && "Back to workspace"}</Link>
        <button onClick={() => toast.success("Thanks! Feedback noted.")} title="Send feedback" className={cn(row, "text-primary", collapsed && "justify-center")}><MessageSquarePlus className="size-4 shrink-0" />{!collapsed && "Send feedback"}</button>
      </div>
    </aside>
  );
}

function UserMenu({ compact, adminMode }: { compact?: boolean; adminMode?: boolean }) {
  const me = useMe()!;
  const db = useDB();
  const nav = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={compact ? "flex items-center gap-1.5 rounded-full bg-subtle py-1 pl-1 pr-2 transition-colors hover:bg-sidebar-accent" : "flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-left hover:bg-sidebar-accent"}>
        <UserAvatar user={me} />
        {compact && <ChevronDown className="size-3.5 text-muted-foreground" />}
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-[11px] capitalize text-muted-foreground">{me.role} · {me.title}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <UserAvatar user={me} />
          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{me.name}</span><span className="block truncate text-[11px] capitalize text-muted-foreground">{me.role}</span></span>
        </div>
        <DropdownMenuSeparator />
        {adminMode ? (
          <DropdownMenuItem onClick={() => nav({ to: "/app/requests" })}><ArrowLeftRight /> Switch to workspace</DropdownMenuItem>
        ) : me.role === "admin" ? (
          <DropdownMenuItem onClick={() => nav({ to: "/app/admin" })}><ShieldCheck /> Switch to Admin</DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled><ShieldCheck /> Switch to Admin<span className="ml-auto text-[10px]">Admins only</span></DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch demo user</DropdownMenuLabel>
        {db.users.filter((u) => u.active && u.id !== me.id).slice(0, 8).map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => { mutate((d) => (d.session.userId = u.id)); if (!(adminMode && u.role === "admin")) nav({ to: "/app/requests" }); }}>
            <UserAvatar user={u} /> <span className="truncate">{u.name}</span>
            <span className="ml-auto text-[11px] capitalize text-muted-foreground">{u.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { resetDemo(); nav({ to: "/" }); }}><RotateCcw /> Reset demo data</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { logout(); nav({ to: "/" }); }}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
