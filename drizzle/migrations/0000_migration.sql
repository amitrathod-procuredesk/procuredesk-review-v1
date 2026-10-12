CREATE TABLE public.workspace_state (
  id text PRIMARY KEY DEFAULT 'main',
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_state TO service_role;
ALTER TABLE public.workspace_state ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: the app reads and writes only through server functions.