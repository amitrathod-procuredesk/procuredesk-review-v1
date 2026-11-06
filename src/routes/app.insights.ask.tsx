import { createFileRoute } from "@tanstack/react-router";
import { AskInsights } from "@/components/pd/AskInsights";
export const Route = createFileRoute("/app/insights/ask")({
  head: () => ({
    meta: [
      { title: "Ask Insights · ProcureDesk" },
      {
        name: "description",
        content:
          "Ask financial questions and inspect visual reports grounded in current ProcureDesk records.",
      },
      { property: "og:title", content: "Ask Insights · ProcureDesk" },
      {
        property: "og:description",
        content: "Conversational spend, purchase and budget insights with traceable records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StartInsights,
});

function StartInsights() {
  return <AskInsights />;
}
