import { useMemo, useState } from 'react';
import { useAgentNavigation as useNavigate } from '@/components/pd/agents/AgentBreadcrumb';
import { ArrowLeft, ArrowRight, Ban, Calendar, Check, Eye, Hand, ListChecks, ShieldCheck, Zap } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { PageBreadcrumb } from '@/components/pd/agents/AgentBreadcrumb';
import { Button } from '@/components/ui/button';
import { Select, Radio, TextInput as Input } from '@/components/pd/form';
import { TextArea as Textarea } from '@/components/pd/form';
import { cn } from '@/lib/utils';
import {
  POLICY_SECTIONS,
  agentCategory,
  canCreatePolicyAgent,
  validateNewAgent,
  type AgentCategory,
  type AgentArea,
  type NewAgentDraft,
  type TriggerKind,
} from '@/lib/pd/agents/domain';
import { createAgent, useAgents } from '@/lib/pd/agents/store';
import { AgentIconTile } from '@/components/pd/agents/agentBits';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const POLICY_PRESET = {
  name: 'Policy agent',
  area: 'Requisitions' as AgentArea,
  trigger: 'Sent for approval',
  triggerKind: 'event' as TriggerKind,
  instructions:
    'Check each requisition against our purchasing policy when it is sent for approval, and tell the requester exactly what to fix before it moves on.',
  dos: ['Check every section of the purchasing policy', 'Explain each issue in plain words with the fix'],
  donts: ['Never approve or reject a requisition on its own', 'Never change amounts, suppliers or approvers'],
};

const AREAS: AgentArea[] = ['Requisitions', 'Requests', 'Orders', 'Invoices', 'Contracts', 'Suppliers', 'Payments'];

const TRIGGERS: { id: TriggerKind; name: string; desc: string; icon: typeof Zap }[] = [
  { id: 'event', name: 'Document event', desc: 'Sent for approval, status change, new invoice', icon: Zap },
  { id: 'schedule', name: 'Schedule', desc: 'Hourly, daily, or weekly', icon: Calendar },
  { id: 'manual', name: 'Manual only', desc: 'A person clicks Run', icon: Hand },
];

const STEPS = [
  { id: 'start', label: 'Agent type' },
  { id: 'setup', label: 'Set up' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export default function NewAgentPage() {
  const navigate = useNavigate();
  const { agents } = useAgents();
  const [step, setStep] = useState<StepId>('start');
  const [category, setCategory] = useState<AgentCategory | null>(null);
  const isPolicy = category === 'policy';

  // Setup state
  const [draft, setDraft] = useState<NewAgentDraft>({ name: '', area: '', triggerKind: '', instructions: '', mode: 'shadow', dos: [''], donts: [''] });
  const [triggerLabel, setTriggerLabel] = useState('');
  const [sectionOn, setSectionOn] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const existingNames = useMemo(() => new Set(agents.map((a) => a.name)), [agents]);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const policyAgent = agents.find((a) => agentCategory(a) === 'policy');
  const policyAllowed = canCreatePolicyAgent(agents);

  const pickPolicy = () => {
    if (!policyAllowed) return;
    setStep('setup');
    setCategory('policy');
    setDraft({
      name: POLICY_PRESET.name,
      area: POLICY_PRESET.area,
      triggerKind: POLICY_PRESET.triggerKind,
      instructions: POLICY_PRESET.instructions,
      mode: draft.mode,
      category: 'policy',
      dos: [...POLICY_PRESET.dos],
      donts: [...POLICY_PRESET.donts],
    });
    setTriggerLabel(POLICY_PRESET.trigger);
    setSectionOn(Object.fromEntries(POLICY_SECTIONS.map((s) => [s.key, s.on])));
    setErrors({});
  };

  const pickCustom = () => {
    setStep('setup');
    setCategory('custom');
    setDraft({ name: '', area: '', triggerKind: '', instructions: '', mode: draft.mode, category: 'custom', dos: [''], donts: [''] });
    setTriggerLabel('');
    setErrors({});
  };

  const continueToMode = () => {
    const errs = validateNewAgent(draft);
    if (existingNames.has(draft.name.trim())) errs.name = 'An agent with this name already exists.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    create();
  };

  const create = () => {
    const agent = createAgent({
      ...draft,
      triggerLabel: triggerLabel || TRIGGERS.find((t) => t.id === draft.triggerKind)?.name || 'Manual only',
      icon: isPolicy ? 'shield' : 'bot',
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
            { label: 'New agent' },
          ]}
          backTo={step === 'start' ? '/agents' : undefined}
        />

        {/* Stepper */}
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <div key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className={cn('h-px w-8', done || current ? 'bg-primary/40' : 'bg-border')} />}
                <span
                  className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-colors',
                    done
                      ? 'bg-primary text-primary-foreground'
                      : current
                        ? 'ring-2 ring-primary text-primary'
                        : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn('text-sm', current ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {step === 'start' && (
          <>
            <h1 className="pd-h1 mt-5">New agent</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
              Choose an agent type.
            </p>

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <Button variant="ghost"
                onClick={() => { if (!policyAllowed && policyAgent) navigate(`/agents/${policyAgent.id}`); else pickPolicy(); }}
                className={cn(
                  'block h-auto whitespace-normal text-left p-3.5 rounded-lg bg-surface border border-border transition-all group',
                  'hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <div className="flex items-center gap-3">
                  <AgentIconTile icon="shield" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Policy agent</p>
                    <p className="text-xs text-muted-foreground">Purchasing policy</p>
                  </div>
                  {policyAllowed && (
                    <Check className={cn('h-4 w-4 ml-auto shrink-0 text-primary transition-opacity', (isPolicy ? 'opacity-100' : 'opacity-0'))} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                  Check purchasing policy and guide requesters through required changes.
                </p>
                <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
                  {!policyAllowed && policyAgent ? `Open ${policyAgent.name}` : 'Set up policy agent'}
                  <ArrowRight className="size-3.5" />
                </span>
              </Button>

              <Button variant="ghost"
                onClick={pickCustom}
                className={cn(
                  'block h-auto whitespace-normal text-left p-3.5 rounded-lg bg-surface border border-border transition-all group',
                  category === 'custom' ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:border-primary/50 hover:shadow-sm'
                )}
              >
                <div className="flex items-center gap-3">
                  <AgentIconTile icon="bot" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Custom agent</p>
                    <p className="text-xs text-muted-foreground">Your own workflow</p>
                  </div>

                </div>
                <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                  Define its job, the documents it checks and when it runs.
                </p>
                <span className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">Create custom agent<ArrowRight className="size-3.5" /></span>
              </Button>
            </div>


          </>
        )}

        {step === 'setup' && (
          <>
            <h1 className="pd-h1 mt-5">
              {isPolicy ? 'Set up the policy agent' : 'Set up your agent'}
            </h1>
            <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); continueToMode(); }}>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Starting mode</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['shadow', 'live'] as const).map(mode => <Radio key={mode} name="agent-mode" value={mode} checked={draft.mode === mode} onChange={() => setDraft({ ...draft, mode })} aria-label={mode === 'shadow' ? 'Shadow mode' : 'Live mode'} className={cn('items-start gap-3 rounded-lg border bg-surface p-3.5 transition-colors', draft.mode === mode ? 'border-primary bg-accent/20' : 'border-border hover:border-primary/50')} label={
                    <span className="min-w-0"><span className="flex items-center gap-1.5 text-sm font-medium text-foreground">{mode === 'shadow' ? <Eye className="size-4 text-primary" /> : <Zap className="size-4 text-primary" />}{mode === 'shadow' ? 'Shadow mode' : 'Live mode'}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{mode === 'shadow' ? 'Watch and review results without taking action.' : 'Use the agent’s live configuration from the start.'}</span>
                    </span>
                  } />)}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Runs in this workspace are samples. Mode selection does not start automation.</p>
              </fieldset>

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

              {/* Policy sections preview */}
              {isPolicy && (
                <div>
                  <label className="text-sm font-medium text-foreground">Policy sections</label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    On = must be resolved before the requisition moves on. Off = best practice.
                  </p>
                  <div className="mt-2 divide-y divide-border border-t border-b border-border">
                    {POLICY_SECTIONS.map((s) => (
                      <div key={s.key} className="flex items-center gap-3 py-2.5">
                        <span className="flex-1 text-sm text-foreground">{s.name}</span>
                        <span className="text-[11px] text-muted-foreground">v{s.version}</span>
                        <Switch aria-label={`${s.name} enforcement`} checked={sectionOn[s.key] ?? s.on} onCheckedChange={() => setSectionOn((p) => ({ ...p, [s.key]: !(p[s.key] ?? s.on) }))} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => setStep('start')}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
                <Button type="submit" className="ml-auto">
                  Create agent
                </Button>
              </div>
            </form>
          </>
        )}

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

export const Route = createFileRoute("/app/agents/new")({
  head: () => ({ meta: [{ title: "New AI agent · ProcureDesk" }, { name: "description", content: "Set up agent instructions, triggers and guardrails." }, { property: "og:title", content: "New AI agent · ProcureDesk" }, { property: "og:description", content: "Set up agent instructions, triggers and guardrails." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewAgentPage,
});
