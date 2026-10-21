-- Element update versions (ADR 015) reuse the suite of the version they come
-- from, so ai_tests drops UNIQUE(org_id,suite_id); "a suite is promoted once"
-- stays enforced by the promote endpoint. Runs once, from
-- migrateAiTestVersions (packages/storage/src/index.ts), inside a transaction
-- with foreign keys off (ai_test_runs references ai_tests).
CREATE TABLE ai_tests_v11 (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  suite_id TEXT NOT NULL REFERENCES ai_suites(id),
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  definition TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(id,revision)
);
INSERT INTO ai_tests_v11 SELECT id,revision,org_id,project_id,suite_id,conversation_id,title,target_origin,definition,checksum,created_at FROM ai_tests;
DROP TABLE ai_tests;
ALTER TABLE ai_tests_v11 RENAME TO ai_tests;
CREATE INDEX IF NOT EXISTS ai_tests_project ON ai_tests(org_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_tests_suite ON ai_tests(org_id,suite_id,revision);
CREATE TRIGGER IF NOT EXISTS immutable_ai_tests BEFORE UPDATE ON ai_tests BEGIN SELECT RAISE(ABORT,'immutable ai test'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_tests_delete BEFORE DELETE ON ai_tests BEGIN SELECT RAISE(ABORT,'immutable ai test'); END;
INSERT OR IGNORE INTO schema_migrations VALUES (11);
