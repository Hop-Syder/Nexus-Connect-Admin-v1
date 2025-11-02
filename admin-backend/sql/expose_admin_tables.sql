-- Expose admin-only tables to the Supabase REST API by moving them into the
-- public schema. This script is idempotent and safe to re-run.
BEGIN;

-- Move the core admin tables into the public schema so PostgREST can serve them.
ALTER TABLE IF EXISTS admin.admin_profiles SET SCHEMA public;
ALTER TABLE IF EXISTS admin.audit_logs SET SCHEMA public;

-- Move any serial/identity sequences associated with the tables.
ALTER SEQUENCE IF EXISTS admin.admin_profiles_id_seq SET SCHEMA public;
ALTER SEQUENCE IF EXISTS admin.audit_logs_id_seq SET SCHEMA public;

-- Ensure read/write access for the Supabase roles typically used by the API.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_profiles TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated, service_role;

-- Allow row-level security policies (if enabled) to continue controlling access.
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

COMMIT;
