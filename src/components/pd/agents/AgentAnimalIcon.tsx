import { cn } from '@/lib/utils';
import { agentPortraitIdentities } from './portraitIdentities';
import penny from '@/assets/agents/distinct-penny.png';
import classifier from '@/assets/agents/distinct-classifier.png';
import header from '@/assets/agents/distinct-header.png';
import unit from '@/assets/agents/distinct-unit.png';
import supplier from '@/assets/agents/distinct-supplier.png';
import duplicate from '@/assets/agents/distinct-duplicate.png';
import total from '@/assets/agents/distinct-total.png';
import line from '@/assets/agents/distinct-line.png';
import period from '@/assets/agents/distinct-period.png';
import approval from '@/assets/agents/distinct-approval.png';
import po from '@/assets/agents/distinct-po.png';

// One portrait per teammate; the same face follows each agent across every invoice surface.
export const agentPortraits: Record<string, string> = {
  penny, classifier, header, unit, supplier, duplicate, total, line, period, approval, po,
};

export function AgentAnimalIcon({ name, className, working = false }: { name: string; className?: string; working?: boolean }) {
  const companion = agentPortraitIdentities[name] ?? 'penny';
  return (
    <span className={cn('agent-companion inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background p-0.5', working && 'agent-companion-working', className)} aria-hidden="true" data-agent-companion={companion} data-working={working}>
      <img src={agentPortraits[companion] ?? penny} alt="" width={256} height={256} draggable={false} className="agent-companion-portrait h-full w-full object-contain" />
    </span>
  );
}
