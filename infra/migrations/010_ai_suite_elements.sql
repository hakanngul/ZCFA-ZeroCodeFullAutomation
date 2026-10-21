-- Suite approval pins the library element revisions it uses (ADR 014).
CREATE TABLE IF NOT EXISTS ai_suite_elements (
  suite_id TEXT NOT NULL REFERENCES ai_suites(id),
  org_id TEXT NOT NULL,
  element_key TEXT NOT NULL,
  element_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY(suite_id,element_key)
);
CREATE TRIGGER IF NOT EXISTS immutable_ai_suite_elements BEFORE UPDATE ON ai_suite_elements BEGIN SELECT RAISE(ABORT,'immutable ai suite element pin'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_suite_elements_delete BEFORE DELETE ON ai_suite_elements BEGIN SELECT RAISE(ABORT,'immutable ai suite element pin'); END;
INSERT OR IGNORE INTO schema_migrations VALUES (10);
