import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function useAgentNavigation() {
  const nav = useNavigate();
  return (path: string) => {
    if (path === '/agents') void nav({ to: '/app/agents' });
    else if (path === '/agents/new') void nav({ to: '/app/agents/new' });
    else void nav({ to: '/app/agents/$agentId', params: { agentId: path.split('/').pop() ?? '' } });
  };
}
export function PageBreadcrumb({ items, backTo }: { items: { label: string; to?: string }[]; backTo?: string }) {
  const navigate = useAgentNavigation();
  return <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
    {backTo && <Button size="icon" variant="ghost" aria-label="Back to AI agents" onClick={() => navigate(backTo)}><ArrowLeft className="size-4" /></Button>}
    {items.map((item, i) => <span key={item.label} className="flex min-w-0 items-center gap-2">
      {i > 0 && <ChevronRight className="size-3 shrink-0" />}
      {item.to ? <Link to="/app/agents" className="hover:text-primary">{item.label}</Link> : <span className="truncate text-foreground">{item.label}</span>}
    </span>)}
  </nav>;
}