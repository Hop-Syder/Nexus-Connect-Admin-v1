BEGIN;

ALTER TABLE IF EXISTS admin.admin_profiles SET SCHEMA public;
ALTER TABLE IF EXISTS admin.audit_logs SET SCHEMA public;

ALTER SEQUENCE IF EXISTS admin.admin_profiles_id_seq SET SCHEMA public;
ALTER SEQUENCE IF EXISTS admin.audit_logs_id_seq SET SCHEMA public;

-- Grants and RLS only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'admin_profiles') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_profiles TO authenticated, service_role';
    EXECUTE 'ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'audit_logs') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated, service_role';
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

COMMIT;
