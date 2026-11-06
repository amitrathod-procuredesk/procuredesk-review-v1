import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";

/**
 * Shared workspace document. The whole ProcureDesk DB (minus the per-browser session)
 * lives in one row; writes use optimistic versioning so concurrent edits never overwrite each other.
 */
type Snapshot = { data: Json; version: number } | null;

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function readWorkspaceSnapshot(): Promise<Snapshot> {
  const db = await admin();
  const { data, error } = await db.from("workspace_state").select("data, version").eq("id", "main").maybeSingle();
  if (error) throw new Error(`Could not load workspace: ${error.message}`);
  return data ? { data: data.data, version: data.version } : null;
}

export const getWorkspace = createServerFn({ method: "GET" }).handler(readWorkspaceSnapshot);

export const saveWorkspace = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const x = d as { data?: unknown; version?: unknown };
    if (!x || typeof x.data !== "object" || x.data === null || Array.isArray(x.data)) throw new Error("Invalid workspace data");
    if (typeof x.version !== "number" || !Number.isInteger(x.version) || x.version < 0) throw new Error("Invalid version");
    return { data: x.data as Json, version: x.version };
  })
  .handler(async ({ data: input }): Promise<{ ok: true; version: number } | { ok: false; current: Snapshot }> => {
    const db = await admin();
    if (input.version === 0) {
      const { error } = await db.from("workspace_state").insert({ id: "main", data: input.data, version: 1 });
      if (!error) return { ok: true, version: 1 };
    } else {
      const next = input.version + 1;
      const { data, error } = await db
        .from("workspace_state")
        .update({ data: input.data, version: next, updated_at: new Date().toISOString() })
        .eq("id", "main")
        .eq("version", input.version)
        .select("version");
      if (error) throw new Error(`Could not save workspace: ${error.message}`);
      if (data && data.length) return { ok: true, version: next };
    }
    const { data: cur } = await db.from("workspace_state").select("data, version").eq("id", "main").maybeSingle();
    return { ok: false, current: cur ? { data: cur.data, version: cur.version } : null };
  });
