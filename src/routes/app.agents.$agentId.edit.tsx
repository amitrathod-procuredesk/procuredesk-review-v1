import { createFileRoute, Link } from '@tanstack/react-router';
import { AgentSetupForm } from '@/components/pd/agents/AgentSetupForm';
import { canEditCustomAgent } from '@/lib/pd/agents/domain';
import { useAgents } from '@/lib/pd/agents/store';

function EditAgentPage() {
  const { agentId } = Route.useParams();
  const { agents } = useAgents();
  const agent = agents.find(a => a.id === agentId);
  if (!agent || !canEditCustomAgent(agent)) return <div className="mx-auto max-w-3xl p-5">
    <h1 className="pd-h1">{agent ? 'Preconfigured agent' : 'Agent not found'}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{agent ? 'Open this agent to manage its available configuration.' : 'This agent is no longer available.'}</p>
    <Link to="/app/agents" className="mt-4 inline-block text-sm text-primary">Back to AI Hub</Link>
  </div>;
  return <AgentSetupForm key={agent.id} agent={agent} />;
}

export const Route = createFileRoute('/app/agents/$agentId/edit')({
  head: () => ({ meta: [{ title: 'Edit custom agent · ProcureDesk' }, { name: 'description', content: 'Update a custom agent’s name, document type, trigger, instructions and guardrails.' }, { property: 'og:title', content: 'Edit custom agent · ProcureDesk' }, { property: 'og:description', content: 'Refine your custom procurement agent while preserving its mode and activity.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: EditAgentPage,
});