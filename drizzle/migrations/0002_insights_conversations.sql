CREATE TABLE public.insights_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, title text NOT NULL DEFAULT 'New conversation', messages jsonb NOT NULL DEFAULT '[]'::jsonb, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.insights_conversations TO service_role;
ALTER TABLE public.insights_conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX insights_conversations_user_idx ON public.insights_conversations(user_id, updated_at DESC);
INSERT INTO public.insights_conversations(user_id, title, messages, version, updated_at) SELECT user_id, 'Previous insights', messages, version, updated_at FROM public.insights_history WHERE jsonb_array_length(messages)>0;
COMMENT ON TABLE public.insights_history IS 'DEPRECATED: replaced by caller-scoped insights_conversations';