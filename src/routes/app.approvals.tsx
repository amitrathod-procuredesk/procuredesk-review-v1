import { createFileRoute } from "@tanstack/react-router";
import { ApprovalInbox } from "@/components/pd/ApprovalInbox";

export const Route = createFileRoute("/app/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · ProcureDesk" },
      { name: "description", content: "Purchase requests waiting for your approval." },
      { property: "og:title", content: "Approvals · ProcureDesk" },
      { property: "og:description", content: "Review and decide on purchase requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <h1 className="pd-h1 mb-4">Approvals</h1>
      <ApprovalInbox />
    </div>
  ),
});
