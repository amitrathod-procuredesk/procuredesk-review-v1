import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { insightsContext } from "./insights.functions";
import { writeWorkspaceVersion } from "./workspace.functions";
import { applyAdHocChange } from "./adHocApprovals";
import type { Json } from "@/integrations/supabase/types";

export const approvalRouteContext = createServerFn({ method: "POST" }).handler(async () => {
  const { userId } = await insightsContext();
  return { userId };
});

const base = { requestId: z.string().min(1), key: z.string().uuid(), stepId: z.string().min(1), version: z.number().int().nonnegative() };
export const changeAdHocApprover = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.discriminatedUnion("action", [
    z.object({ ...base, action: z.literal("add"), approverId: z.string().min(1), placement: z.enum(["before", "after"]) }),
    z.object({ ...base, action: z.literal("remove") }),
  ]).parse(v))
  .handler(async ({ data }) => {
    const { db, userId, version } = await insightsContext();
    if (data.version !== version) throw new Error("The approval route changed. Close this dialog and try again.");
    applyAdHocChange(db, userId, data);
    db.session = { userId: null };
    if (!await writeWorkspaceVersion(db as unknown as Json, version))
      throw new Error("The approval route changed. Close this dialog and try again.");
    return { data: db, version: version + 1 };
  });