import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { insightsContext } from "./insights.functions";
import {
  agentProposalSchema,
  applyAgentConfirmation,
  previewAgentProposal,
} from "./procurementAgent";

export const procurementAgentContext = createServerFn({ method: "POST" }).handler(async () => {
  const { db, userId } = await insightsContext();
  if (!db.users.some((u) => u.id === userId && u.role !== "approver"))
    throw new Error("This account cannot create requests.");
  return { userId };
});

export const refreshProcurementProposal = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => agentProposalSchema.parse(v))
  .handler(async ({ data }) => {
    const { db, userId } = await insightsContext();
    return previewAgentProposal(db, data, userId);
  });

/** Confirmation owns a scoped, optimistic workspace mutation; inference never calls it. */
export const confirmProcurementProposal = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        proposal: agentProposalSchema,
        key: z.string().uuid(),
        action: z.enum(["draft", "approval"]),
        fingerprint: z.string().max(150000),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { c, db, userId, version } = await insightsContext();
    const saved = applyAgentConfirmation(
      db,
      data.proposal,
      userId,
      data.key,
      data.action,
      data.fingerprint,
    );
    const { data: rows, error } = await c
      .from("workspace_state")
      .update({
        data: {
          ...db,
          session: { userId: null },
        } as unknown as import("@/integrations/supabase/types").Json,
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "main")
      .eq("version", version)
      .select("version");
    if (error)
      throw new Error(
        "Cloud could not confirm saving. Retry the same action; a second request will not be created.",
      );
    if (!rows?.length)
      throw new Error("The workspace changed. Refresh the summary before confirming again.");
    return {
      id: saved.id,
      status: saved.status,
      approvers: saved.route.flatMap((s) =>
        s.approvals.map((a) => db.users.find((u) => u.id === a.userId)?.name ?? ""),
      ),
    };
  });
