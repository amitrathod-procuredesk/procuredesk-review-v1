import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { login, useDB, useHydrated, useMe } from "@/lib/pd/store";
import { AiGlyph } from "@/components/pd/bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · ProcureDesk" },
      { name: "description", content: "Sign in to ProcureDesk, the AI-first procurement workspace for requestors, approvers and admins." },
      { property: "og:title", content: "Sign in · ProcureDesk" },
      { property: "og:description", content: "AI-first procurement: describe what you need, get a policy-aware purchase request." },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const db = useDB();
  const me = useMe();
  const hydrated = useHydrated();
  const [email, setEmail] = useState("admin@procuredesk.app");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (hydrated && me) nav({ to: "/app" });
  }, [hydrated, me, nav]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Enter your email and password.");
    const u = login(email, password);
    if (!u) return setError("That email and password don't match an active account.");
    nav({ to: "/app" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between p-8 lg:p-12">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] text-primary-foreground">PD</span>
          ProcureDesk
        </div>
        <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-5 py-12">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{forgot ? "Reset your password" : "Sign in"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{forgot ? "We'll email you a reset link." : `Welcome back to ${db.org.name}.`}</p>
          </div>
          <div>
            <label className="pd-label" htmlFor="email">Work email</label>
            <input id="email" className="pd-input h-9" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {!forgot && (
            <div>
              <div className="flex items-center justify-between">
                <label className="pd-label" htmlFor="pw">Password</label>
                <button type="button" onClick={() => setForgot(true)} className="mb-1 text-xs text-primary hover:underline">Forgot password?</button>
              </div>
              <input id="pw" className="pd-input h-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {forgot ? (
            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={() => { setForgot(false); setError(""); }}>Send reset link</Button>
              <button type="button" className="w-full text-xs text-muted-foreground hover:text-foreground" onClick={() => setForgot(false)}>Back to sign in</button>
            </div>
          ) : (
            <Button type="submit" className="w-full">Sign in</Button>
          )}
        </form>
        <div className="mx-auto w-full max-w-sm">
          <p className="pd-section-title mb-2">Demo accounts</p>
          <div className="flex flex-wrap gap-1.5">
            {db.users.filter((u) => ["u_admin", "u_amit", "u_mark", "u_priya", "u_rachel"].includes(u.id)).map((u) => (
              <button key={u.id} type="button" className="pd-chip" onClick={() => { setEmail(u.email); setPassword(u.password); }}>
                {u.name.split(" ")[0]} <span className="text-muted-foreground">· {u.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="hidden border-l border-border bg-subtle lg:flex lg:items-center lg:justify-center lg:p-16">
        <div className="w-full max-w-md space-y-4">
          <div className="pd-panel p-4">
            <p className="text-xs text-muted-foreground">You said</p>
            <p className="mt-1 text-sm">“I need 4 MacBook Pro laptops for our new engineering hires.”</p>
          </div>
          <div className="pd-panel overflow-hidden">
            <div className="ai-surface flex items-center gap-2 px-4 py-2.5 text-xs">
              <AiGlyph /> Structured into a purchase request
            </div>
            <dl className="divide-y divide-border text-sm">
              {[
                ["Item", "4 × MacBook Pro 14-inch", "Catalog"],
                ["Supplier", "Amazon", "Preferred"],
                ["Department", "Engineering", "Confirmed"],
                ["Budget", "IT Equipment · R&D FY26", "AI suggested"],
                ["Route", "Finance → IT Security", "Policy"],
              ].map(([k, v, t]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="flex items-center gap-3">
                    <span>{v}</span>
                    <span className="text-[11px] text-muted-foreground">{t}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-xs text-muted-foreground">AI prepares. You decide. Nothing financial changes without your confirmation.</p>
        </div>
      </div>
    </div>
  );
}
