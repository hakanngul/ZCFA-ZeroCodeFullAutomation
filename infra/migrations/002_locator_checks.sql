CREATE TABLE IF NOT EXISTS locator_checks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  model_revision INTEGER NOT NULL,
  page TEXT NOT NULL,
  locator TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS locator_checks_project ON locator_checks(org_id,project_id,created_at DESC);
INSERT OR IGNORE INTO schema_migrations VALUES (2);
