-- Self-healing (ADR 016). ai_page_elements.status / merged_into ("Birleştir")
-- are added by the guarded step migrateElementMerge before this file runs.
-- Project settings; self_healing is opt-in (default off).
CREATE TABLE IF NOT EXISTS project_settings (
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  self_healing INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(org_id,project_id)
);
-- One row per healed element + locator in one run; a person promotes the
-- locator to primary (new element revision) or ignores it.
CREATE TABLE IF NOT EXISTS ai_heal_suggestions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  element_id TEXT NOT NULL,
  element_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  primary_locator TEXT NOT NULL,
  locator TEXT NOT NULL,
  run_kind TEXT NOT NULL,
  run_id TEXT NOT NULL,
  steps INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  UNIQUE(run_id,element_id,revision,locator)
);
CREATE INDEX IF NOT EXISTS ai_heal_suggestions_project ON ai_heal_suggestions(org_id,project_id,status,created_at DESC);
INSERT OR IGNORE INTO schema_migrations VALUES (12);
