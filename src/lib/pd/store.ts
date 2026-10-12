import { useSyncExternalStore } from "react";
import { seedDB } from "./seed";
import type { Activity, DB, PRequest, User } from "./types";
import { computeRoute, currentStageIndex, nowISO, stageComplete, uid } from "./engine";

/** Legacy per-browser copy of the whole DB; read once to seed the shared workspace, then kept as an offline cache. */
const KEY = "procuredesk-v1";
/** Who is signed in is per browser, never shared. */
const SESSION_KEY = "procuredesk-session";
let state: DB = seedDB();
let hydrated = false;
let version = 0;
let pending: ((d: DB) => void)[] = [];
let flushing = false;
let syncError = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const shared = (d: DB) => ({ ...d, session: { userId: null } });
const withSession = (d: DB, userId: string | null) => ({ ...d, session: { userId } });
const saveLocal = () => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state.session.userId));
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage full */ }
};

export function hydrate() {
  if (hydrated) return;
  let local: DB | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) local = migrate(JSON.parse(raw));
    const sess = localStorage.getItem(SESSION_KEY);
    const userId = sess ? (JSON.parse(sess) as string | null) : local?.session.userId ?? null;
    if (local) state = withSession(local, userId);
    else state = withSession(state, userId);
  } catch { /* corrupted storage: fall back to seed */ }
  void (async () => {
    try {
      const { getWorkspace } = await import("./workspace.functions");
      const remote = await getWorkspace();
      if (remote) {
        version = remote.version;
        state = withSession(migrate(remote.data as DB), state.session.userId);
      } else {
        // First browser to connect publishes its data (or the demo seed) as the shared workspace.
        pending.push(() => {});
      }
    } catch (e) {
      syncError = true;
      console.error("Workspace load failed; using this browser's copy", e);
    }
    hydrated = true;
    saveLocal();
    emit();
    if (pending.length) void flush();
    startPolling();
  })();
}

async function flush() {
  if (flushing || !pending.length) return;
  flushing = true;
  const { saveWorkspace } = await import("./workspace.functions");
  try {
    for (let attempt = 0; attempt < 5 && pending.length; attempt++) {
      const sent = pending.length;
      const res = await saveWorkspace({ data: { data: shared(state), version } });
      if (res.ok) {
        version = res.version;
        pending = pending.slice(sent);
        syncError = false;
        continue;
      }
      // Someone else saved first: rebuild on their version and replay our edits.
      if (res.current) {
        version = res.current.version;
        const base = withSession(migrate(res.current.data as DB), state.session.userId);
        const replay = structuredClone(base);
        pending.forEach((fn) => fn(replay));
        state = replay;
        saveLocal();
        emit();
      } else version = 0;
    }
  } catch (e) {
    syncError = true;
    console.error("Workspace save failed; will retry", e);
    setTimeout(() => void flush(), 5000);
  } finally {
    flushing = false;
    emit();
  }
}

let polling = false;
function startPolling() {
  if (polling || typeof window === "undefined") return;
  polling = true;
  const pull = async () => {
    if (flushing || pending.length || document.hidden) return;
    try {
      const { getWorkspace } = await import("./workspace.functions");
      const remote = await getWorkspace();
      if (remote && remote.version > version && !pending.length && !flushing) {
        version = remote.version;
        state = withSession(migrate(remote.data as DB), state.session.userId);
        saveLocal();
        emit();
      }
      syncError = false;
    } catch { syncError = true; }
  };
  setInterval(pull, 5000);
  window.addEventListener("focus", pull);
}

/** True while edits are waiting to reach the shared workspace, or the last sync failed. */
export const syncState = () => (syncError ? "error" : pending.length || flushing ? "saving" : "saved");
/** Backfills catalog descriptions and splits line items whose description just repeated the item name. */
function migrate(d: DB): DB {
  const seed = seedDB();
  d.org.budgetLevel ??= "header";
  const oldNames = new Map<string, string>();
  d.catalog.forEach((c) => {
    oldNames.set(c.id, c.name);
    const s = seed.catalog.find((x) => x.id === c.id);
    if (s && !c.description) { c.name = s.name; c.description = s.description; }
    c.description ??= "";
    if (s && !/^\d+$/.test(c.partNumber)) c.partNumber = s.partNumber; // item numbers are numeric-only
  });
  d.requests.forEach((r) => r.items.forEach((l) => {
    const c = d.catalog.find((x) => x.id === l.catalogId);
    if (c && l.partNumber && !/^\d+$/.test(l.partNumber)) l.partNumber = c.partNumber;
  }));
  const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  d.requests.forEach((r) => r.items.forEach((l) => {
    const c = d.catalog.find((x) => x.id === l.catalogId);
    if (!c) return;
    if (!l.name || same(l.name, l.description) || same(l.description, oldNames.get(c.id)) || same(l.description, c.name)) {
      l.name = c.name;
      if (c.description) l.description = c.description;
    }
  }));
  return d;
}

export const isHydrated = () => hydrated;
export const getDB = () => state;

export function mutate(fn: (d: DB) => void) {
  const draft: DB = structuredClone(state);
  fn(draft);
  const changed = JSON.stringify(shared(draft)) !== JSON.stringify(shared(state));
  state = draft;
  saveLocal();
  if (changed && hydrated) {
    pending.push(fn);
    void flush();
  }
  emit();
}

/** Resets the shared workspace to demo data for everyone, and signs this browser out. */
export function resetDemo() {
  mutate((d) => { Object.assign(d, seedDB()); d.session = { userId: null }; });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => hydrated, () => false);
}
export function useMe(): User | null {
  const db = useDB();
  return db.users.find((u) => u.id === db.session.userId) ?? null;
}

export function log(r: PRequest, text: string, kind: Activity["kind"], actorId?: string) {
  r.activity.push({ id: uid("act"), at: nowISO(), text, kind, actorId });
  r.updatedAt = nowISO();
}

export function updateRequest(id: string, fn: (r: PRequest, d: DB) => void) {
  mutate((d) => {
    const r = d.requests.find((x) => x.id === id);
    if (!r) return;
    fn(r, d);
    r.updatedAt = nowISO();
  });
}

export function login(email: string, password: string): User | null {
  const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password && x.active);
  if (!u) return null;
  mutate((d) => (d.session.userId = u.id));
  return u;
}
export const logout = () => mutate((d) => (d.session.userId = null));

export function createDraft(userId: string, manual: boolean): string {
  let id = "";
  mutate((d) => {
    d.seq += 1;
    id = `REQ-${d.seq}`;
    const me = d.users.find((u) => u.id === userId);
    const dept = d.departments.find((x) => x.id === me?.departmentId);
    const r: PRequest = {
      id,
      title: "",
      status: "draft",
      requesterId: userId,
      departmentId: manual ? me?.departmentId : undefined,
      businessUnit: dept?.businessUnit ?? d.org.businessUnits[0],
      requestType: "PO requisition",
      project: "",
      shipTo: d.org.shipTo[0],
      paymentMethod: "Corporate card",
      shipmentType: "Standard ground",
      urgent: false,
      delayed: false,
      blanket: false,
      items: [],
      noteBuyer: "",
      noteSupplier: "",
      quoteNo: "",
      website: "",
      attachments: [],
      comments: [],
      activity: [],
      route: [],
      sources: manual && me?.departmentId ? { department: "suggested" } : {},
      exceptionRequested: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      ai: { messages: [], pending: null, qty: 1, candidateIds: [], rawItem: "" },
    };
    log(r, manual ? "Request created manually" : "Request created with AI assistant", "create", userId);
    d.requests.unshift(r);
  });
  return id;
}

export function submitRequest(id: string, userId: string) {
  updateRequest(id, (r, d) => {
    const resubmit = r.status === "changes";
    r.route = computeRoute(r, d);
    r.route.forEach((s, i) => s.approvals.forEach((a) => (a.status = i === 0 ? "pending" : "waiting")));
    r.budgetLevel = d.org.budgetLevel ?? "header";
    r.status = "pending";
    r.submittedAt = nowISO();
    r.decisionReason = undefined;
    log(r, resubmit ? "Request resubmitted after changes" : "Request submitted for approval", "submit", userId);
    if (r.route[0]) log(r, `Routed to ${r.route[0].name}`, "system");
  });
}

export function decide(id: string, userId: string, decision: "approve" | "reject" | "changes", comment: string, declineIds: string[] = []) {
  updateRequest(id, (r, d) => {
    const i = currentStageIndex(r);
    if (i < 0) return;
    const stage = r.route[i];
    const a = stage.approvals.find((x) => x.userId === userId && x.status === "pending");
    if (!a) return;
    a.at = nowISO();
    a.comment = comment || undefined;
    const name = d.users.find((u) => u.id === userId)?.name ?? "Approver";
    if (decision === "approve") {
      a.status = "approved";
      const toDecline = r.items.filter((l) => !l.declined && declineIds.includes(l.id));
      if (toDecline.length && toDecline.length < r.items.filter((l) => !l.declined).length) {
        toDecline.forEach((l) => (l.declined = { by: userId, at: nowISO(), reason: comment || undefined }));
        const kept = r.items.filter((l) => !l.declined).length;
        log(r, `${name} partially approved — ${kept} of ${kept + toDecline.length} items kept; declined: ${toDecline.map((l) => l.description || "Untitled").join(", ")}`, "approve", userId);
      }
      log(r, `${name} approved${stage.approvals.length > 1 ? ` (${stage.name})` : ` — ${stage.name}`}${comment ? `: “${comment}”` : ""}`, "approve", userId);
      if (stageComplete(stage)) {
        stage.approvals.forEach((x) => x.status === "pending" && (x.status = "approved"));
        const next = r.route[i + 1];
        if (next) {
          next.approvals.forEach((x) => (x.status = "pending"));
          log(r, `${stage.name} completed · routed to ${next.name}`, "system");
        } else {
          r.status = "approved";
          log(r, "Request fully approved", "approve");
        }
      }
    } else if (decision === "reject") {
      a.status = "rejected";
      r.status = "rejected";
      r.decisionReason = comment;
      log(r, `${name} rejected the request: ${comment}`, "reject", userId);
    } else {
      a.status = "changes";
      r.status = "changes";
      r.decisionReason = comment;
      log(r, `${name} requested changes: ${comment}`, "changes", userId);
    }
  });
}

export function delegate(id: string, fromId: string, toId: string) {
  updateRequest(id, (r, d) => {
    const i = currentStageIndex(r);
    const a = r.route[i]?.approvals.find((x) => x.userId === fromId && x.status === "pending");
    if (!a) return;
    a.userId = toId;
    a.delegatedFrom = fromId;
    const n = (u: string) => d.users.find((x) => x.id === u)?.name;
    log(r, `${n(fromId)} reassigned approval to ${n(toId)}`, "system", fromId);
  });
}

/** Duplicate a request as a fresh draft for the given user (items, essentials, notes; no approvals/history). */
export function copyRequest(sourceId: string, userId: string): string {
  let id = "";
  mutate((d) => {
    const src = d.requests.find((x) => x.id === sourceId);
    if (!src) return;
    d.seq += 1;
    id = `REQ-${d.seq}`;
    const c: PRequest = JSON.parse(JSON.stringify(src));
    Object.assign(c, {
      id,
      title: src.title ? `Copy of ${src.title}` : "",
      status: "draft",
      requesterId: userId,
      items: c.items.filter((it) => !it.declined).map((it) => ({ ...it, id: uid("li") })),
      attachments: [],
      comments: [],
      activity: [],
      route: [],
      rfqs: [],
      decisionReason: undefined,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });
    log(c, `Request created as a copy of ${src.id}`, "create", userId);
    d.requests.unshift(c);
    log(src, `Copied to ${id}`, "system", userId);
  });
  return id;
}
