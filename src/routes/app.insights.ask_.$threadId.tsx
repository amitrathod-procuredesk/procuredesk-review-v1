import { createFileRoute } from "@tanstack/react-router";
import { AskInsights } from "@/components/pd/AskInsights";
export const Route = createFileRoute("/app/insights/ask_/$threadId")({
  head: () => ({
    meta: [
      { title: "Insight conversation · ProcureDesk" },
      { name: "description", content: "Explore saved financial questions and visual reports." },
      { property: "og:title", content: "Insight conversation · ProcureDesk" },
      { property: "og:description", content: "Saved spend, purchase and budget conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightConversation,
});
function InsightConversation() {
  const { threadId } = Route.useParams();
  return <AskInsights key={threadId} threadId={threadId} />;
}
