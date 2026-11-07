import { useMemo, useState } from 'react';
import { useAgentNavigation as useNavigate } from '@/components/pd/agents/AgentBreadcrumb';
import { ArrowLeft, Ban, Calendar, Check, Eye, Hand, ListChecks, ShieldCheck, Zap } from 'lucide-react';
import { PageBreadcrumb } from '@/components/pd/agents/AgentBreadcrumb';
import { Button } from '@/components/ui/button';
import { Select, Radio, TextInput as Input } from '@/components/pd/form';
import { TextArea as Textarea } from '@/components/pd/form';
import { cn } from '@/lib/utils';
import {
  validateNewAgent,
  type AgentDef,
  type AgentArea,
  type NewAgentDraft,
  type TriggerKind,
} from '@/lib/pd/agents/domain';
import { createAgent, saveCustomAgent, useAgents } from '@/lib/pd/agents/store';
import { toast } from 'sonner';

const AREAS: AgentArea[] = ['Requisitions', 'Requests', 'Orders', 'Invoices', 'Contracts', 'Suppliers', 'Payments'];

const TRIGGERS: { id: TriggerKind; name: string; desc: string; icon: typeof Zap }[] = [
  { id: 'event', name: 'Document event', desc: 'Sent for approval, status change, new invoice', icon: Zap },
  { id: 'schedule', name: 'Schedule', desc: 'Hourly, daily, or weekly', icon: Calendar },
  { id: 'manual', name: 'Manual only', desc: 'A person clicks Run', icon: Hand },
];

export function AgentSetupForm({ agent }: { agent?: AgentDef }) {
  const navigate = useNavigate();
  const { agents } = useAgents();

  // Setup state — new agents are always custom; the policy agent is created by the system.
  const [draft, setDraft] = useState<NewAgentDraft>(agent ? { name: agent.name, area: agent.area, triggerKind: agent.triggerKind, instructions: agent.description, mode: agent.status === 'live' ? 'live' : 'shadow', category: 'custom', dos: agent.dos ?? [''], donts: agent.donts ?? [''] } : { name: '', area: '', triggerKind: '', instructions: '', mode: 'shadow', category: 'custom', dos: [''], donts: [''] });
  const [triggerLabel, setTriggerLabel] = useState(agent?.trigger ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const existingNames = useMemo(() => new Set(agents.filter(a => a.id !== agent?.id).map(a => a.name.toLowerCase())), [agents, agent]);

  const continueToMode = () => {
    const errs = validateNewAgent(draft);
    if (existingNames.has(draft.name.trim().toLowerCase())) errs.name = 'An agent with this name already exists.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      if (agent) {
        saveCustomAgent(agent.id, { ...draft, triggerLabel });
        toast.success('Agent updated.');
        navigate(`/agents/${agent.id}`);
      } else create();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save agent.');
    }
  };

  const create = () => {
    const agent = createAgent({
      ...draft,
      triggerLabel: triggerLabel || TRIGGERS.find((t) => t.id === draft.triggerKind)?.name || 'Manual only',
      icon: 'bot',
    });
    toast.success(
      draft.mode === 'live'
        ? `${agent.name} is live.`
        : `${agent.name} is watching in shadow mode. Review its runs, then switch it to live when you trust it.`
    );
    navigate(`/agents/${agent.id}`);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl p-3 sm:p-5">
        <PageBreadcrumb
          items={[
            { label: 'AI agents', to: '/agents' },
            ...(agent ? [{ label: agent.name }] : []),
            { label: agent ? 'Edit agent' : 'New agent' },
          ]}
          backTo={agent ? `/agents/${agent.id}` : '/agents'}
        />

        <h1 className="pd-h1 mt-5">{agent ? 'Edit agent' : 'Set up your agent'}</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
          Define its job, the documents it checks and when it runs.
        </p>

        <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); continueToMode(); }}>
          {!agent && <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">Starting mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['shadow', 'live'] as const).map(mode => <Radio key={mode} name="agent-mode" value={mode} checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} aria-label={mode === 'shadow' ? 'Shadow mode' : 'Live mode'} className={cn('items-start gap-3 rounded-lg border bg-surface p-3.5 transition-colors', draft.mode === mode ? 'border-primary bg-accent/20' : 'border-border hover:border-primary/50')} label={
                <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-medium text-foreground">{mode === 'shadow' ? <Eye className="size-4 text-primary" /> : <Zap className="size-4 text-primary" />}{mode === 'shadow' ? 'Shadow mode' : 'Live mode'}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{mode === 'shadow' ? 'Watch and review results without taking action.' : 'Use the agent’s live configuration from the start.'}</span>
                </span>
              } />)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Runs in this workspace are samples. Mode selection does not start automation.</p>
          </fieldset>}

          <section className="pd-panel rounded-lg p-4 sm:p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="size-4 text-primary" />Agent details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="pd-label" htmlFor="agent-name">Name</label>
                <Input id="agent-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Spend watchdog" invalid={!!errors.name} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>
              <div>
                <label className="pd-label" htmlFor="agent-area">What it works on</label>
                <Select id="agent-area" value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value as AgentArea })} invalid={!!errors.area}>
                  <option value="">Choose document type</option>
                  {AREAS.map(area => <option key={area} value={area}>{area}</option>)}
                </Select>
                {errors.area && <p className="mt-1 text-xs text-destructive">{errors.area}</p>}
              </div>
            </div>
          </section>

          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Calendar className="size-4 text-primary" />When it runs</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TRIGGERS.map(({ id, name, desc, icon: Icon }) => <Radio key={id} name="agent-trigger-kind" value={id} checked={draft.triggerKind === id} onChange={() => setDraft({ ...draft, triggerKind: id })} aria-label={name} aria-invalid={!!errors.trigger || undefined} className={cn('items-start gap-3 rounded-lg border bg-surface p-3.5 transition-colors', draft.triggerKind === id ? 'border-primary bg-accent/20' : 'border-border hover:border-primary/50')} label={
                <span className="min-w-0"><Icon className="mb-2 size-5 text-primary" /><span className="block text-sm font-medium text-foreground">{name}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{desc}</span></span>
              } />)}
            </div>
            {errors.trigger && <p className="mt-1 text-xs text-destructive">{errors.trigger}</p>}
              {draft.triggerKind && <div className="mt-3 max-w-sm">
                <label className="pd-label" htmlFor="agent-trigger">{draft.triggerKind === 'schedule' ? 'Schedule' : draft.triggerKind === 'event' ? 'Document event' : 'Trigger label'}</label>
                <Input id="agent-trigger" aria-label="Trigger" value={triggerLabel} onChange={e => setTriggerLabel(e.target.value)} placeholder={draft.triggerKind === 'event' ? 'e.g. Sent for approval' : draft.triggerKind === 'schedule' ? 'e.g. Daily at 9:00' : 'Manual only'} />
              </div>}
          </fieldset>

          <section className="pd-panel rounded-lg p-4 sm:p-5 space-y-4">
             <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ListChecks className="size-4 text-primary" />Its job</h2>
          {/* Instructions */}
          <div>
            <Textarea
              id="agent-job"
              aria-label="Its job"
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              rows={5}
              placeholder="In plain words: what should the agent check, and what should it do when something is wrong?"
              invalid={!!errors.instructions}
            />
            {errors.instructions && <p className="text-xs text-destructive mt-1">{errors.instructions}</p>}
          </div>

          </section>

          {/* Guardrails */}
          <div className="grid sm:grid-cols-2 gap-3">
            <RulesEditor
              label="What it should do"
              hint="Tasks it is allowed to carry out."
              tone="do"
              placeholder={"e.g. Flag orders over budget\nTell the requester what to fix"}
              rules={draft.dos ?? ['']}
              onChange={(dos) => setDraft({ ...draft, dos })}
              error={errors.dos}
            />
            <RulesEditor
              label="What it must not do"
              hint="Lines it should never cross."
              tone="dont"
              placeholder={"e.g. Never cancel an order\nNever change the supplier"}
              rules={draft.donts ?? ['']}
              onChange={(donts) => setDraft({ ...draft, donts })}
              error={errors.donts}
            />
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => navigate(agent ? `/agents/${agent.id}` : '/agents')}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> {agent ? 'Cancel' : 'Back'}
            </Button>
            <Button type="submit" className="ml-auto">
              {agent ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}


function RulesEditor({
  label, hint, tone, placeholder, rules, onChange, error,
}: {
  label: string; hint: string; tone: 'do' | 'dont'; placeholder: string;
  rules: string[]; onChange: (rules: string[]) => void; error?: string;
}) {
  const Icon = tone === 'do' ? Check : Ban;
  return (
    <div className="pd-panel rounded-lg p-4 sm:p-5">
      <label htmlFor={`agent-rules-${tone}`} className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', tone === 'do' ? 'text-success' : 'text-destructive')} />
        {label}
      </label>
      <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      <Textarea
        id={`agent-rules-${tone}`}
        value={rules.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        placeholder={placeholder}
        aria-label={label}
        rows={7}
        invalid={!!error}
        className="mt-2"
      />
      <p className="text-[11px] text-muted-foreground mt-1">One instruction per line.</p>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

