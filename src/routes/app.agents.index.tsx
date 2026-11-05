import { useMemo, useState } from 'react';
import { useAgentNavigation as useNavigate } from '@/components/pd/agents/AgentBreadcrumb';
import { ArrowRight, Pause, Play, Plus, Search } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { TextInput as Input } from '@/components/pd/form';
import { cn } from '@/lib/utils';
import { filterAgents, statusCounts, type AgentDef, type StatusFilter } from '@/lib/pd/agents/domain';
import { togglePause, useAgents } from '@/lib/pd/agents/store';
import { AgentIconTile, AgentStatusBadge } from '@/components/pd/agents/agentBits';
import { AgentAnimalIcon } from '@/components/pd/agents/AgentAnimalIcon';
import { toast } from 'sonner';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'paused', label: 'Paused' },
  { id: 'draft', label: 'Draft' },
];

export default function AgentsPage() {
  const navigate = useNavigate();
  const { agents } = useAgents();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const counts = useMemo(() => statusCounts(agents), [agents]);
  const visible = useMemo(() => filterAgents(agents, filter, query), [agents, filter, query]);

  const penny = agents.find((a) => a.id === 'penny');
  const rest = visible.filter((a) => a.id !== 'penny');
  const pennyVisible = penny && visible.some((a) => a.id === 'penny');

  const summary = [
    counts.live > 0 && `${counts.live} live`,
    counts.shadow > 0 && `${counts.shadow} in shadow`,
    counts.paused > 0 && `${counts.paused} paused`,
    counts.draft > 0 && `${counts.draft} in setup`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className="mx-auto max-w-[1440px] p-3 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold  text-foreground">Your AI team</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
              Agents check and act on your requests, orders, invoices and contracts.
              {summary && <span className="text-foreground/70 font-medium"> {summary}.</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents"
                className="pl-9 w-56"
              />
            </div>
            <Button onClick={() => navigate('/agents/new')}>
              <Plus className="h-4 w-4 mr-1.5" />
              New agent
            </Button>
          </div>
        </div>

        {/* Penny spotlight — the manager of the invoice team */}
        {pennyVisible && penny && (
          <Button variant="ghost"
            onClick={() => navigate('/agents/penny')}
            className="mt-4 h-auto w-full whitespace-normal text-left rounded-lg border border-border bg-surface p-5 hover:border-primary/40 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-5">
              <AgentAnimalIcon name="Penny" className="h-16 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-base font-semibold  text-foreground">{penny.name}</span>
                  <AgentStatusBadge status={penny.status} />
                  <span className="text-xs text-muted-foreground">Invoice manager</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl line-clamp-2">{penny.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex -space-x-1.5">
                    {penny.team?.slice(0, 6).map((m) => (
                      <AgentAnimalIcon
                        key={m.name}
                        name={m.name}
                        className="h-7 w-7 ring-2 ring-background rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Leads a team of {penny.team?.length} specialists
                  </span>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-8 shrink-0 pr-2">
                <div>
                  <p className="text-[10px] font-medium  text-muted-foreground/70">Runs 30d</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 tabular-nums">{penny.runs30d ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium  text-muted-foreground/70">Last run</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{penny.lastRun ?? '—'}</p>
                </div>
                <span className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </Button>
        )}

        {/* Status filter */}
        <div className="flex items-center gap-1 mt-4 max-w-full overflow-x-auto rounded-md bg-secondary/70 p-1">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <Button variant="ghost"
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                  on
                    ? 'bg-background text-foreground font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
                <span className={cn('text-[11px] tabular-nums', on ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                  {counts[f.id]}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Agent cards */}
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {rest.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onOpen={() => navigate(`/agents/${agent.id}`)} />
          ))}
        </div>
        {visible.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-foreground">No agents match</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different search or filter.</p>
          </div>
        )}
      </div>
    </>
  );
}

function AgentCard({ agent, onOpen }: { agent: AgentDef; onOpen: () => void }) {
  const isPaused = agent.status === 'paused';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="pd-panel group relative text-left p-3.5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <AgentIconTile icon={agent.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap pr-8">
            <span className="text-sm font-semibold text-foreground">{agent.name}</span>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{agent.area} · Runs when: {agent.trigger}</p>
        </div>
        <Button variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            togglePause(agent.id);
            toast.success(isPaused ? `${agent.name} is back on.` : `${agent.name} is paused. Its setup and history are kept.`);
          }}
          title={isPaused ? 'Resume' : 'Pause'}
          className="absolute top-4 right-4 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground transition-all"
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed line-clamp-2">{agent.description}</p>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground tabular-nums">{agent.runs30d ?? '—'}</span> runs · 30d
        </span>
        <span>Last run {agent.lastRun ?? '—'}</span>
        <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/agents/")({
  head: () => ({ meta: [{ title: "AI agents · ProcureDesk" }, { name: "description", content: "Manage your AI team, agent modes and review activity." }, { property: "og:title", content: "AI agents · ProcureDesk" }, { property: "og:description", content: "Manage your AI team, agent modes and review activity." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentsPage,
});
