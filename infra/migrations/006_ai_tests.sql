-- Promoted AI tests: each approved suite becomes one immutable, versioned test revision.
CREATE TABLE IF NOT EXISTS ai_tests (
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
  PRIMARY KEY(id,revision),
  UNIQUE(org_id,suite_id)
);
CREATE INDEX IF NOT EXISTS ai_tests_project ON ai_tests(org_id,project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_test_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  test_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  plan TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY(test_id,revision) REFERENCES ai_tests(id,revision)
);
CREATE INDEX IF NOT EXISTS ai_test_runs_project ON ai_test_runs(org_id,project_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS immutable_ai_tests BEFORE UPDATE ON ai_tests BEGIN SELECT RAISE(ABORT,'immutable ai test'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_tests_delete BEFORE DELETE ON ai_tests BEGIN SELECT RAISE(ABORT,'immutable ai test'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_test_run_snapshot BEFORE UPDATE OF org_id,project_id,test_id,revision,plan,checksum ON ai_test_runs BEGIN SELECT RAISE(ABORT,'immutable ai test run'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_test_run_result BEFORE UPDATE OF result,status ON ai_test_runs WHEN OLD.status NOT IN ('queued','running') BEGIN SELECT RAISE(ABORT,'immutable ai test result'); END;
INSERT OR IGNORE INTO schema_migrations VALUES (6);
