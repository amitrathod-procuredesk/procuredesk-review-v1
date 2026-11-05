import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  FileText,
  Pause,
  Pencil,
  Play,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';
import { PageBreadcrumb } from '@/components/pd/agents/AgentBreadcrumb';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TextArea as Textarea } from '@/components/pd/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  reviewProgress,
  runSummary,
  type AgentRun,
  type PolicySection,
  type RunVerdict,
} from '@/lib/pd/agents/domain';
import {
  markVerdict,
  saveSectionText,
  setAgentMode,
  togglePause,
  toggleSection,
  useAgents,
} from '@/lib/pd/agents/store';
import { AgentIconTile, AgentStatusBadge, STATUS_HELP } from '@/components/pd/agents/agentBits';
import { AgentAnimalIcon } from '@/components/pd/agents/AgentAnimalIcon';
import { AgentSyncStatus } from '@/components/pd/agents/AgentSyncStatus';
import { toast } from 'sonner';

type Tab = 'instructions' | 'team' | 'runs';

export default function AgentDetailPage() {
  const { agentId: id } = Route.useParams();
  const { agents, runs, modeHistory } = useAgents();
  const agent = agents.find((a) => a.id === id);

  const [tab, setTab] = useState<Tab>('instructions');
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);

  const agentRuns = useMemo(() => (agent ? runs[agent.id] ?? [] : []), [agent, runs]);
  const openRun = agentRuns.find((r) => r.id === openRunId) ?? null;

  if (!agent) {
    return (
      <>
        <div className="mx-auto max-w-[1440px] p-3 sm:p-5">
          <PageBreadcrumb items={[{ label: 'AI agents', to: '/agents' }, { label: 'Not found' }]} />
          <p className="text-sm text-muted-foreground mt-6">This agent does not exist.</p>
        </div>
      </>
    );
  }

  const isPaused = agent.status === 'paused';
  const history = modeHistory[agent.id] ?? [];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    ...(agent.team ? [{ id: 'team' as Tab, label: 'Team', count: agent.team.length }] : []),
    { id: 'instructions', label: agent.sections ? 'Policy sections' : 'Instructions', count: agent.sections?.length },
    { id: 'runs', label: agent.status === 'shadow' ? 'Shadow runs' : 'Runs', count: agentRuns.length },
  ];

  return (
    <>
      <div className="mx-auto max-w-[1440px] p-3 sm:p-5">
        <div className="flex items-center justify-between gap-2"><PageBreadcrumb items={[{ label: 'AI agents', to: '/agents' }, { label: agent.name }]} /><AgentSyncStatus /></div>

        <div className="grid min-[900px]:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] gap-3 mt-4">
          {/* Left rail — identity, mode and controls */}
          <aside className="pd-panel p-3.5 lg:sticky lg:top-[76px] self-start">
            <div className="flex items-center gap-3.5">
              <AgentIconTile icon={agent.icon} size="lg" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold  text-foreground">{agent.name}</h1>
                <div className="mt-1">
                  <AgentStatusBadge status={agent.status} />
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{agent.description}</p>

            <dl className="mt-5 pt-5 border-t border-border space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Works on</dt>
                <dd className="font-medium text-foreground">{agent.area}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Runs when</dt>
                <dd className="font-medium text-foreground text-right">{agent.trigger}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Runs · 30d</dt>
                <dd className="font-medium text-foreground tabular-nums">{agent.runs30d ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Last run</dt>
                <dd className="font-medium text-foreground">{agent.lastRun ?? '—'}</dd>
              </div>
              {agent.createdBy && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="text-muted-foreground text-right text-xs">{agent.createdBy}</dd>
                </div>
              )}
            </dl>

            {/* Mode control */}
            <div className="mt-5 pt-5 border-t border-border">
              <p className="text-sm font-medium text-foreground">Mode</p>
              <div className="mt-2 grid grid-cols-2 rounded-lg bg-secondary/70 p-1">
                {(['shadow', 'live'] as const).map((mode) => {
                  const on = agent.status === mode;
                  return (
                    <Button variant="ghost"
                      key={mode}
                      onClick={() => {
                        if (on) return;
                        if (mode === 'live') setConfirmLive(true);
                        else {
                          setAgentMode(agent.id, 'shadow');
                          toast.success(`${agent.name} is watching in shadow mode.`);
                        }
                      }}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm transition-colors capitalize',
                        on ? 'bg-background text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {mode}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {STATUS_HELP[isPaused ? 'paused' : agent.status]}
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3"
                onClick={() => {
                  togglePause(agent.id);
                  toast.success(isPaused ? `${agent.name} is back on.` : `${agent.name} is paused. Its setup and history are kept.`);
                }}
              >
                {isPaused ? <Play className="h-3.5 w-3.5 mr-1.5" /> : <Pause className="h-3.5 w-3.5 mr-1.5" />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
            </div>

            {history.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-sm font-medium text-foreground">Mode history</p>
                <div className="mt-2 space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="text-xs">
                      <p className="text-foreground">
                        <span className="font-medium">{h.who}</span>
                        <span className="text-muted-foreground"> switched to {h.to}</span>
                      </p>
                      <p className="text-muted-foreground/70 mt-0.5">
                        {h.when}
                        {h.note ? ` · ${h.note}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Right — working area */}
          <div className="min-w-0">
            {/* Tabs */}
            <div className="flex items-center gap-4 overflow-x-auto border-b border-border">
              {tabs.map((t) => (
                <Button variant="ghost"
                  key={t.id}
                  onClick={() => { setTab(t.id); setOpenRunId(null); }}
                  className={cn(
                    'shrink-0 pb-3 -mb-px text-sm border-b-2 transition-colors flex items-center gap-1.5',
                    tab === t.id
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span className="text-[11px] font-semibold rounded-full bg-secondary text-muted-foreground px-1.5 py-px">{t.count}</span>
                  )}
                </Button>
              ))}
            </div>

            {/* Team tab (Penny) */}
            {tab === 'team' && agent.team && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="col-span-full text-sm text-muted-foreground py-2">
                  Penny leads this team. Each teammate owns one check, reports back to her, and she decides
                  what happens next. You talk to Penny; she coordinates the rest.
                </p>
                {agent.team.map((member) => (
                  <div key={member.name} className="pd-panel flex items-center gap-3 p-3">
                    <AgentAnimalIcon name={member.name} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground/70">Reports to Penny</span>
                  </div>
                ))}
              </div>
            )}

            {/* Instructions tab */}
            {tab === 'instructions' && (
              agent.sections ? (
                <SectionsTab agentId={agent.id} sections={agent.sections} />
              ) : (
                <div className="pd-panel mt-3 p-3.5">
                  <p className="text-sm text-foreground leading-relaxed">{agent.description}</p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {agent.createdBy === 'ProcureDesk default'
                      ? "This agent's instructions are managed by ProcureDesk. Pause it or switch its mode from the panel on the left."
                      : 'These are the instructions you gave the agent. Pause it or switch its mode from the panel on the left.'}
                  </p>
                </div>
              )
            )}

            {/* Runs tab */}
            {tab === 'runs' && (
              openRun ? (
                <RunDetail agentId={agent.id} run={openRun} onBack={() => setOpenRunId(null)} />
              ) : (
                <div className="divide-y divide-border border-b border-border">
                  {agentRuns.length === 0 && (
                    <div className="py-16 text-center">
                      <p className="text-sm font-medium text-foreground">No runs yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {agent.status === 'draft'
                          ? 'Finish setting up this agent and it will start running.'
                          : agent.status === 'paused'
                            ? 'Resume the agent and it will start running again.'
                            : `This agent runs when: ${agent.trigger}.`}
                      </p>
                    </div>
                  )}
                  {agentRuns.map((run) => {
                    const summary = runSummary(run);
                    const clean = summary === 'No conflicts';
                    const progress = reviewProgress(run);
                    return (
                      <Button variant="ghost"
                        key={run.id}
                        onClick={() => setOpenRunId(run.id)}
                        className="h-auto w-full flex flex-wrap items-center gap-3 py-3 px-2 whitespace-normal text-left hover:bg-secondary/40 transition-colors rounded-sm"
                      >
                        <div className="w-24 shrink-0">
                          <p className="text-sm font-medium text-foreground tabular-nums">{run.id}</p>
                          <p className="text-xs text-muted-foreground">{run.date}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{run.subject}</p>
                          <p className="text-xs text-muted-foreground">{run.who}{run.amount !== '—' ? ` · ${run.amount}` : ''}</p>
                        </div>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                            clean ? 'bg-success-soft text-success' : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {summary}
                        </span>
                        <span className="text-xs text-muted-foreground w-24 text-right shrink-0">
                          {progress.reviewed > 0 ? `${progress.reviewed} of ${progress.total} reviewed` : 'Not reviewed'}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Confirm going live */}
      <Dialog open={confirmLive} onOpenChange={setConfirmLive}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch {agent.name} to live?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Once live, {agent.name} will act on real documents without waiting for you:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>It runs every time: {agent.trigger}.</li>
                  <li>People will see its guidance and be asked to act on it.</li>
                  <li>You can switch back to shadow mode at any time — history is kept.</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLive(false)}>Stay in shadow</Button>
            <Button onClick={() => { setAgentMode(agent.id, 'live'); setConfirmLive(false); toast.success(`${agent.name} is live.`); }}>
              Switch to live
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Policy sections tab
// ---------------------------------------------------------------------------

function SectionsTab({ agentId, sections }: { agentId: string; sections: PolicySection[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const mustCount = sections.filter((s) => s.on).length;

  return (
    <div className="py-3 space-y-2">
      <p className="text-sm text-muted-foreground pb-3">
        {mustCount} of {sections.length} sections must be resolved before a requisition can move on.
        The rest are best practice — the agent warns and the requester can proceed with a reason.
      </p>
      {sections.map((section) => {
        const isEditing = editing === section.key;
        const long = section.text.length > 220;
        return (
          <div
            key={section.key}
            className={cn(
              'pd-panel p-3.5',
              isEditing && 'ring-1 ring-primary'
            )}
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={section.on}
                onCheckedChange={() => toggleSection(agentId, section.key)}
                aria-label={`${section.name} enforcement`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{section.name}</span>
                  <span className="text-[11px] text-muted-foreground">v{section.version}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/80">{section.editedBy}</p>
              </div>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditing(section.key); setDraft(section.text); }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-2 ml-0 sm:ml-11">
              {section.on
                ? 'On. The requester can’t send the requisition until this is resolved.'
                : 'Off. Best practice: the agent warns and the requester can proceed with a reason.'}
            </p>

            {isEditing ? (
              <div className="mt-3 ml-0 sm:ml-11 space-y-2">
                <Textarea aria-label="Policy section text" value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} className="h-auto py-2 text-sm" />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      saveSectionText(agentId, section.key, draft);
                      setEditing(null);
                      toast.success(`${section.name} updated. The agent uses the new wording from its next run.`);
                    }}
                  >
                    Save section
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 ml-0 sm:ml-11">
                <p
                  className={cn(
                    'text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap',
                    long && !expanded && 'line-clamp-3'
                  )}
                >
                  {section.text}
                </p>
                {long && (
                  <Button variant="ghost"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-xs font-medium text-primary hover:underline underline-offset-4 mt-1"
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </Button>
                )}
              </div>
            )}

            {section.docs.length > 0 && (
              <div className="mt-3 ml-0 sm:ml-11 flex flex-wrap gap-2">
                {section.docs.map((doc) => (
                  <span
                    key={doc.file}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs text-foreground"
                    title={`${doc.instruction} ${doc.when}`}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {doc.name}
                    <span className="text-muted-foreground">· {doc.type}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run detail with review
// ---------------------------------------------------------------------------

function RunDetail({ agentId, run, onBack }: { agentId: string; run: AgentRun; onBack: () => void }) {
  const summary = runSummary(run);
  const clean = summary === 'No conflicts';
  const progress = reviewProgress(run);

  return (
    <div className="py-4 max-w-3xl">
      <Button variant="ghost"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All runs
      </Button>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <h2 className="text-base font-semibold  text-foreground tabular-nums">Run {run.id}</h2>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            clean ? 'bg-success-soft text-success' : 'bg-destructive/10 text-destructive'
          )}
        >
          {summary}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {progress.reviewed} of {progress.total} reviewed
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {run.subject} · {run.who} · {run.date}{run.amount !== '—' ? ` · ${run.amount}` : ''} · Outcome: {run.outcome}
      </p>

      <div className="mt-4 space-y-2">
        {run.verdicts.map((v) => (
          <VerdictCard key={v.key} agentId={agentId} runId={run.id} verdict={v} review={run.reviews[v.key]} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Your review is saved with this check.
      </p>
    </div>
  );
}

function VerdictCard({
  agentId,
  runId,
  verdict,
  review,
}: {
  agentId: string;
  runId: string;
  verdict: RunVerdict;
  review?: { mark: 'right' | 'wrong'; by: string; note?: string };
}) {
  const badge =
    verdict.verdict === 'met'
      ? { label: 'Met', cls: 'bg-success-soft text-success' }
      : verdict.verdict === 'not'
        ? { label: 'Not met', cls: 'bg-destructive/10 text-destructive' }
        : { label: 'Not applicable', cls: 'bg-secondary text-muted-foreground' };

  return (
    <div className="pd-panel p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', badge.cls)}>
          {verdict.verdict === 'met' && <Check className="h-3 w-3" />}
          {verdict.verdict === 'not' && <X className="h-3 w-3" />}
          {badge.label}
        </span>
        <span className="text-sm font-semibold text-foreground">{verdict.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost"
            onClick={() => markVerdict(agentId, runId, verdict.key, 'right')}
            aria-pressed={review?.mark === 'right'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              review?.mark === 'right'
                ? 'bg-success-soft text-success'
                : 'text-muted-foreground hover:bg-secondary'
            )}
          >
            <ThumbsUp className="h-3 w-3" /> Right
          </Button>
          <Button variant="ghost"
            onClick={() => markVerdict(agentId, runId, verdict.key, 'wrong')}
            aria-pressed={review?.mark === 'wrong'}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              review?.mark === 'wrong'
                ? 'bg-destructive/10 text-destructive'
                : 'text-muted-foreground hover:bg-secondary'
            )}
          >
            <ThumbsDown className="h-3 w-3" /> Wrong
          </Button>
        </span>
      </div>

      <p className="text-sm text-foreground/90 mt-2">{verdict.summary}</p>

      {verdict.breached && (
        <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">The instruction</p>
          <p className="text-xs text-foreground/90 mt-0.5">{verdict.breached}</p>
        </div>
      )}
      {verdict.reasoning && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          <span className="font-medium text-foreground/70">Why the agent decided this: </span>
          {verdict.reasoning}
        </p>
      )}
      {verdict.evidence && verdict.evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {verdict.evidence.map((e) => (
            <p key={e.src} className="text-xs">
              <span className="text-muted-foreground">{e.src}: </span>
              <span className="text-foreground/90 font-medium">{e.val}</span>
            </p>
          ))}
        </div>
      )}
      {review && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Marked {review.mark} by {review.by}.{review.note ? ` ${review.note}` : ''}
        </p>
      )}
    </div>
  );
}

export const Route = createFileRoute("/app/agents/$agentId")({
  head: () => ({ meta: [{ title: "AI agent details · ProcureDesk" }, { name: "description", content: "Review agent policy sections, team, run evidence and mode history." }, { property: "og:title", content: "AI agent details · ProcureDesk" }, { property: "og:description", content: "Review agent policy sections, team, run evidence and mode history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentDetailPage,
});
