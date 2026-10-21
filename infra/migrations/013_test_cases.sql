-- Editable test suites and cases (ADR 017). AI exploration creates them as
-- drafts; steps bind library elements by id. ai_page_elements.verification /
-- verified_at are added by the guarded step migrateElementVerification.
CREATE TABLE IF NOT EXISTS test_suites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  target_url TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT NOT NULL,
  draft_id TEXT,
  prompt TEXT,
  model TEXT,
  notes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS test_suites_project ON test_suites(org_id,project_id,status,updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS test_suites_draft ON test_suites(org_id,draft_id) WHERE draft_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  suite_id TEXT NOT NULL REFERENCES test_suites(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  definition TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  approval TEXT NOT NULL DEFAULT 'draft',
  approved_revision INTEGER,
  approved_by TEXT,
  approved_at TEXT,
  pins TEXT NOT NULL DEFAULT '[]',
  ai_generated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS test_cases_suite ON test_cases(org_id,suite_id,status,position);
-- Which library elements a case's current steps use (rewritten on save).
CREATE TABLE IF NOT EXISTS test_case_elements (
  case_id TEXT NOT NULL REFERENCES test_cases(id),
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  element_id TEXT NOT NULL,
  PRIMARY KEY(case_id,element_id)
);
CREATE INDEX IF NOT EXISTS test_case_elements_element ON test_case_elements(org_id,project_id,element_id);
-- A run freezes the approved case and the element revisions it resolves.
CREATE TABLE IF NOT EXISTS test_case_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  suite_id TEXT NOT NULL REFERENCES test_suites(id),
  case_id TEXT NOT NULL REFERENCES test_cases(id),
  case_revision INTEGER NOT NULL,
  batch_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS test_case_runs_case ON test_case_runs(org_id,case_id,created_at DESC);
CREATE INDEX IF NOT EXISTS test_case_runs_project ON test_case_runs(org_id,project_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS immutable_test_case_run_snapshot BEFORE UPDATE OF org_id,project_id,suite_id,case_id,case_revision,batch_id,snapshot,checksum ON test_case_runs BEGIN SELECT RAISE(ABORT,'immutable test case run'); END;
CREATE TRIGGER IF NOT EXISTS immutable_test_case_run_result BEFORE UPDATE OF result,status ON test_case_runs WHEN OLD.status NOT IN ('queued','running') BEGIN SELECT RAISE(ABORT,'immutable test case result'); END;
CREATE TRIGGER IF NOT EXISTS immutable_test_case_run_delete BEFORE DELETE ON test_case_runs BEGIN SELECT RAISE(ABORT,'immutable test case run'); END;
INSERT OR IGNORE INTO schema_migrations VALUES (13);
