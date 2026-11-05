import { cn } from '@/lib/utils';
import type { AgentDef } from '@/lib/pd/agents/domain';
import { agentPortraits } from './AgentAnimalIcon';
import { Briefcase, CreditCard, FileText, History, Shield, ShoppingCart, Sparkles } from 'lucide-react';

const IDENTITIES: Record<string, string> = {
  penny: 'penny', 'policy-agent': 'header', 'contract-agent': 'classifier',
  'order-follow-up': 'po', 'approval-nudge': 'approval',
  'payment-run-prep': 'total', 'contract-renewal-watch': 'supplier',
};

/** Directory-only portraits: detail screens retain their existing agent identities. */
export function AgentHubProfile({ agent }: { agent: AgentDef }) {
  const portrait = agentPortraits[IDENTITIES[agent.id]];
  const Icon = agent.icon === 'shield' ? Shield : agent.icon === 'file' ? FileText
    : agent.icon === 'cart' ? ShoppingCart : agent.icon === 'history' ? History
    : agent.icon === 'card' ? CreditCard : agent.icon === 'brief' ? Briefcase : Sparkles;
  return <span aria-hidden="true" className={cn('pd-hub-profile', `pd-hub-profile-${agent.area.toLowerCase()}`, (agent.status === 'live' || agent.status === 'shadow') && 'pd-hub-profile-active')}>
    {portrait ? <img src={portrait} alt="" width={80} height={80} draggable={false} className="pd-hub-profile-face" />
      : <svg className="pd-hub-profile-face pd-hub-custom-face" viewBox="0 0 80 80" fill="none">
        <path d="M40 12v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="10" r="4" fill="currentColor" />
        <rect x="14" y="21" width="52" height="44" rx="18" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" />
        <rect x="21" y="29" width="38" height="24" rx="10" fill="currentColor" fillOpacity=".1" />
        <g className="pd-hub-profile-eyes"><rect x="29" y="36" width="5" height="9" rx="2.5" fill="currentColor" /><rect x="46" y="36" width="5" height="9" rx="2.5" fill="currentColor" /></g>
        <path d="M34 57q6 4 12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>}
    <span className="pd-hub-profile-purpose"><Icon className="size-3" /></span>
  </span>;
}