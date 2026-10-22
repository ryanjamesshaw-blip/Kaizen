-- Hard rule #1: audit_events is append-only.
-- Enforced in the database itself so no application bug or operator can
-- quietly change history. Both UPDATE and DELETE raise, for every role,
-- including the table owner. TRUNCATE is blocked too.

CREATE OR REPLACE FUNCTION audit_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_immutable();

-- Belt and braces for production, where the app connects as kaizen_app
-- (created by ops, not by this migration): INSERT and SELECT only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaizen_app') THEN
    REVOKE ALL ON audit_events FROM kaizen_app;
    GRANT INSERT, SELECT ON audit_events TO kaizen_app;
    GRANT USAGE, SELECT ON SEQUENCE audit_events_seq_seq TO kaizen_app;
  END IF;
END
$$;
