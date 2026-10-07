import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { ClipboardCheck, FileText, Home, LogOut, Settings2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AiGlyph, UserAvatar } from "@/components/pd/bits";
import { GlobalAssistant } from "@/components/pd/GlobalAssistant";
import { isPendingFor } from "@/lib/pd/engine";
import { logout, mutate, resetDemo, useDB, useHydrated, useMe } from "@/lib/pd/store";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace · ProcureDesk" },
      { name: "description", content: "Your ProcureDesk procurement workspace." },
      { property: "og:title", content: "Workspace · ProcureDesk" },
      { property: "og:description", content: "Requests, approvals and procurement controls in one place." },
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
  const items = [
    { to: "/app", label: me.role === "admin" ? "Dashboard" : me.role === "approver" ? "Inbox" : "Home", icon: Home, exact: true },
    { to: "/app/requests", label: "Requests", icon: FileText },
    ...(me.role !== "requestor" ? [{ to: "/app/approvals", label: "Approvals", icon: ClipboardCheck, badge: pendingCount }] : []),
    ...(me.role === "admin" ? [{ to: "/app/admin", label: "Admin", icon: Settings2 }] : []),
  ] as const;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-12 items-center gap-2 px-4 text-sm font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] text-primary-foreground">PD</span>
          <span className="truncate">{db.org.name}</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {items.map((it) => (
            <Link key={it.to} to={it.to} className="nav-item" activeOptions={{ exact: "exact" in it && it.exact }}>
              <it.icon className="size-4 text-muted-foreground" />
              {it.label}
              {"badge" in it && it.badge ? <span className="num ml-auto rounded-sm bg-primary px-1.5 text-[10px] text-primary-foreground">{it.badge}</span> : null}
            </Link>
          ))}
          <button onClick={() => setAssistant(true)} className="nav-item mt-3 w-full">
            <AiGlyph className="size-4" /> Ask ProcureDesk
            <kbd className="ml-auto text-[10px] text-muted-foreground">⌘K</kbd>
          </button>
        </nav>
        <UserMenu />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="flex h-12 items-center justify-between border-b border-border px-4 md:hidden">
          <span className="text-sm font-semibold">ProcureDesk</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setAssistant(true)} aria-label="Ask ProcureDesk"><AiGlyph /></button>
            <UserMenu compact />
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t border-border bg-surface md:hidden">
        {items.map((it) => (
          <Link key={it.to} to={it.to} activeOptions={{ exact: "exact" in it && it.exact }} className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:text-primary">
            <it.icon className="size-4" />
            {it.label}
          </Link>
        ))}
      </nav>
      <GlobalAssistant open={assistant} onOpenChange={setAssistant} ctx={ctx} />
    </div>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const me = useMe()!;
  const db = useDB();
  const nav = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={compact ? "" : "flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-left hover:bg-sidebar-accent"}>
        <UserAvatar user={me} />
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            <span className="block truncate text-[11px] capitalize text-muted-foreground">{me.role} · {me.title}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch demo user</DropdownMenuLabel>
        {db.users.filter((u) => u.active && u.id !== me.id).slice(0, 8).map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => { mutate((d) => (d.session.userId = u.id)); nav({ to: "/app" }); }}>
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
