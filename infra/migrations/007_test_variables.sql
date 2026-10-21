-- Project test data: {{KEY}} placeholders resolved by the worker at execution time.
-- origin '' = every target of the project; an origin-specific row overrides it.
-- Secret values are AES-256-GCM ciphertext (same key as provider API keys).
CREATE TABLE IF NOT EXISTS test_variables (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  origin TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  secret INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id,project_id,origin,key)
);
CREATE INDEX IF NOT EXISTS test_variables_project ON test_variables(org_id,project_id,key);
INSERT OR IGNORE INTO schema_migrations VALUES (7);
