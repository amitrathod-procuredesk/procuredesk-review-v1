import { Bot, Briefcase, CreditCard, FileText, History, Shield, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentAnimalIcon } from './AgentAnimalIcon';
import type { AgentStatus } from '@/lib/pd/agents/domain';

/** Framed tile for an agent: Penny and her team use their portraits, others a quiet line icon. */
export function AgentIconTile({ icon, size = 'md' }: { icon: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  if (icon === 'penny') {
    return <AgentAnimalIcon name="Penny" className={box} />;
  }
  const Icon =
    icon === 'shield' ? Shield
    : icon === 'file' ? FileText
    : icon === 'cart' ? ShoppingCart
    : icon === 'history' ? History
    : icon === 'card' ? CreditCard
    : icon === 'brief' ? Briefcase
    : Bot;
  return (
    <span className={cn(box, 'flex items-center justify-center rounded-lg border border-border bg-secondary/50 text-muted-foreground shrink-0')}>
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
}

const STATUS_STYLE: Record<AgentStatus, { badge: string; dot: string; label: string }> = {
  live: { badge: 'bg-success-soft text-success', dot: 'bg-success', label: 'Live' },
  shadow: { badge: 'bg-info-soft text-primary', dot: 'bg-primary', label: 'Shadow mode' },
  paused: { badge: 'bg-secondary text-muted-foreground', dot: 'bg-muted-foreground/50', label: 'Paused' },
  draft: { badge: 'bg-secondary text-muted-foreground', dot: 'bg-muted-foreground/30', label: 'Draft' },
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', s.badge)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot, status === 'live' && 'motion-safe:animate-pulse')} />
      {s.label}
    </span>
  );
}

/** Plain-words explanation of what a status means, used in tooltips and the mode tab. */
export const STATUS_HELP: Record<AgentStatus, string> = {
  live: 'Acts on its own when the trigger fires.',
  shadow: 'Watches and advises in the background. Changes nothing.',
  paused: 'Temporarily off. Keeps its setup and history.',
  draft: 'Being set up. Has never run.',
};
