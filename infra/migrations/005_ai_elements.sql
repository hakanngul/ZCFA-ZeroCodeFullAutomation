CREATE TABLE IF NOT EXISTS ai_page_elements (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  page_url TEXT NOT NULL,
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  input_type TEXT NOT NULL,
  locator_kind TEXT NOT NULL,
  locator_value TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(org_id,project_id,page_url,locator_kind,locator_value)
);
CREATE INDEX IF NOT EXISTS ai_page_elements_project ON ai_page_elements(org_id,project_id,last_seen_at DESC);
INSERT OR IGNORE INTO schema_migrations VALUES (5);
