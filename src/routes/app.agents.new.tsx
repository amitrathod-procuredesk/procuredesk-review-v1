import { createFileRoute } from '@tanstack/react-router';
import { AgentSetupForm } from '@/components/pd/agents/AgentSetupForm';

export const Route = createFileRoute('/app/agents/new')({
  head: () => ({ meta: [{ title: 'New AI agent · ProcureDesk' }, { name: 'description', content: 'Set up a custom procurement agent with instructions, triggers and guardrails.' }, { property: 'og:title', content: 'New AI agent · ProcureDesk' }, { property: 'og:description', content: 'Create a custom agent for your procurement workflow.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <AgentSetupForm />,
});
