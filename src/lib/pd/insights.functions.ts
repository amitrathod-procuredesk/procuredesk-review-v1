import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { readWorkspaceSnapshot } from "./workspace.functions";
import type { DB } from "./types";
import { insightQuerySchema, buildInsight, type InsightMessage } from "./insights";

const client = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(x => x.toString(16).padStart(2,"0")).join("");
export async function insightsContext() {
  const token = getCookie("pd-insights-session");
  if (!token) throw new Error("Sign in to Ask Insights.");
  const c = await client();
  const { data, error } = await c.from("insights_sessions").select("user_id, expires_at").eq("token_hash", await hash(token)).maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() < Date.now()) throw new Error("Your Insights session expired. Sign in again.");
  const snapshot = await readWorkspaceSnapshot();
  if (!snapshot) throw new Error("Workspace is unavailable.");
  const db = snapshot.data as unknown as DB;
  if (!db.users.some(u => u.id === data.user_id && u.active)) throw new Error("Account is inactive.");
  return { c, userId: data.user_id, db, version: snapshot.version };
}

export const signInInsights = createServerFn({ method: "POST" }).inputValidator((v: unknown) => z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(v)).handler(async ({ data }) => {
  const snapshot = await readWorkspaceSnapshot();
  const db = snapshot?.data as unknown as DB | undefined;
  const user = db?.users.find(u => u.active && u.email.toLowerCase() === data.email.toLowerCase() && u.password === data.password);
  if (!user) throw new Error("Email and password do not match an active ProcureDesk account.");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const c = await client();
  const { error } = await c.from("insights_sessions").insert({ token_hash: await hash(token), user_id: user.id, expires_at: new Date(Date.now()+86400000).toISOString() });
  if (error) throw new Error("Could not start your Insights session.");
  setCookie("pd-insights-session", token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 86400 });
  return { ok: true };
});

export const loadInsights = createServerFn({ method: "GET" }).handler(async () => {
  const { c, userId } = await insightsContext();
  const { data, error } = await c.from("insights_history").select("messages, version").eq("user_id",userId).maybeSingle();
  if (error) throw new Error("Could not load your saved conversation.");
  return { messages: (data?.messages ?? []) as unknown as InsightMessage[], version: data?.version ?? 0 };
});
export const refreshInsight = createServerFn({ method: "POST" }).inputValidator((v: unknown) => insightQuerySchema.parse(v)).handler(async ({data}) => {
  const ctx = await insightsContext();
  return buildInsight(ctx.db, data, ctx.version);
});