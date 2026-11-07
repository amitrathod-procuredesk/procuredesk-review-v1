import { useMemo, useState } from 'react';
import { useAgentNavigation } from '@/components/pd/agents/AgentBreadcrumb';
import { ArrowRight, Clock3, Pause, Play, Plus, Search, Sparkles, Zap } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { TextInput as Input } from '@/components/pd/form';
import { cn } from '@/lib/utils';
import { agentCategory, filterAgents, statusCounts, type AgentDef, type StatusFilter } from '@/lib/pd/agents/domain';
import { togglePause, useAgents } from '@/lib/pd/agents/store';
import { AgentStatusBadge } from '@/components/pd/agents/agentBits';
import { AgentHubProfile } from '@/components/pd/agents/AgentHubProfile';
import { AgentNavIcon } from '@/components/pd/agents/AgentNavIcon';
import { toast } from 'sonner';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All agents' }, { id: 'live', label: 'Live' },
  { id: 'shadow', label: 'Shadow' }, { id: 'paused', label: 'Paused' }, { id: 'draft', label: 'Draft' },
];

export default function AgentsPage() {
  const navigate = useAgentNavigation();
  const { agents } = useAgents();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const counts = useMemo(() => statusCounts(agents), [agents]);
  const visible = useMemo(() => filterAgents(agents, filter, query), [agents, filter, query]);
  // The policy agent is created by the system and configured separately from the other agents.
  const policyAgent = useMemo(() => visible.find((a) => agentCategory(a) === 'policy'), [visible]);
  const others = useMemo(() => visible.filter((a) => agentCategory(a) !== 'policy'), [visible]);

  return <div className="pd-hub mx-auto max-w-[1440px] p-3 sm:p-5 lg:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent/60 text-primary"><AgentNavIcon className="size-6" /></span>
        <div><h1 className="text-xl font-semibold text-foreground">AI Hub</h1><p className="mt-0.5 text-sm text-muted-foreground">Your procurement agents, all in one place.</p></div>
      </div>
      <Button onClick={() => navigate('/agents/new')}><Plus className="size-4" />New agent</Button>
    </div>

    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-border">
      <div className="pd-scroll-hide flex min-w-0 max-w-full gap-1 overflow-x-auto overflow-y-hidden" role="group" aria-label="Agent status">
        {FILTERS.map((f) => <Button key={f.id} variant="ghost" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn('h-11 shrink-0 rounded-none border-b-2 px-2.5 text-xs hover:bg-transparent sm:text-sm', filter === f.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {f.label}<span className={cn('text-xs tabular-nums', filter === f.id ? 'text-primary/70' : 'text-muted-foreground/70')}>{counts[f.id]}</span>
        </Button>)}
      </div>
      <div className="relative mb-2 w-full sm:w-56">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents" className="pl-9" aria-label="Search agents" />
      </div>
    </div>

    <div className="pd-hub-grid">
      {visible.map((agent) => <AgentCard key={agent.id} agent={agent} onOpen={() => navigate(`/agents/${agent.id}`)} />)}
    </div>
    {visible.length === 0 && <div className="py-16 text-center">
      <Search className="mx-auto mb-3 size-6 text-muted-foreground" />
      <p className="text-sm font-medium">No agents match</p>
      <Button variant="link" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</Button>
    </div>}
  </div>;
}

function AgentCard({ agent, onOpen }: { agent: AgentDef; onOpen: () => void }) {
  const isPaused = agent.status === 'paused';
  const isDefault = agent.createdBy === 'ProcureDesk default';
  return <article className="pd-hub-card group" aria-label={agent.name}>
    <Button variant="ghost" onClick={onOpen} aria-label={`Open ${agent.name}`} className="pd-hub-card-open block h-auto w-full flex-1 whitespace-normal rounded-none p-4 text-left font-normal hover:bg-transparent hover:text-foreground sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <AgentHubProfile agent={agent} />
        <AgentStatusBadge status={agent.status} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{agent.area}</span><span aria-hidden="true">·</span><span>{isDefault ? 'ProcureDesk agent' : 'Custom agent'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-base font-semibold text-foreground">{agent.name}</h2>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-2 min-h-[60px] text-sm leading-5 text-muted-foreground line-clamp-3">{agent.description}</p>
      <div className="mt-4 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
        {agent.team ? <><Sparkles className="size-3.5 shrink-0 text-primary" /><span>{agent.team.length} specialists</span></> : <><Zap className="size-3.5 shrink-0" /><span className="truncate" title={agent.trigger}>{agent.trigger}</span></>}
      </div>
    </Button>
    <div className="flex items-center justify-between gap-2 border-t border-border bg-subtle/45 px-4 py-2.5 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span><strong className="font-semibold text-foreground tabular-nums">{agent.runs30d ?? '—'}</strong> runs · 30d</span>
        <span className="flex items-center gap-1"><Clock3 className="size-3" />{agent.lastRun ?? 'Not run yet'}</span>
      </div>
      <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" onClick={() => {
        togglePause(agent.id);
        toast.success(isPaused ? `${agent.name} is back on.` : `${agent.name} is paused. Its setup and history are kept.`);
      }} title={isPaused ? 'Resume agent' : 'Pause agent'} aria-label={`${isPaused ? 'Resume' : 'Pause'} ${agent.name}`}>
        {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </Button>
    </div>
  </article>;
}

export const Route = createFileRoute('/app/agents/')({
  head: () => ({ meta: [{ title: 'AI Hub · ProcureDesk' }, { name: 'description', content: 'Explore your procurement AI agents, create custom agents and review their activity in the ProcureDesk AI Hub.' }, { property: 'og:title', content: 'AI Hub · ProcureDesk' }, { property: 'og:description', content: 'Your default and custom procurement agents, together in one workspace.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: AgentsPage,
});