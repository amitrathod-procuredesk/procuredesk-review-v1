CREATE TABLE public.insights_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL);
GRANT ALL ON public.insights_sessions TO service_role;
ALTER TABLE public.insights_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.insights_history (user_id text PRIMARY KEY, messages jsonb NOT NULL DEFAULT '[]'::jsonb, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.insights_history TO service_role;
ALTER TABLE public.insights_history ENABLE ROW LEVEL SECURITY;