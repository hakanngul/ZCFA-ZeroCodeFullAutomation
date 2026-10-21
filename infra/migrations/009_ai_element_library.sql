-- Site element library: ai_page_elements columns (origin, element_key, name,
-- page_key, approved, alternatives, revision, locator_role) are added by the
-- guarded step in packages/storage/src/ai-elements.ts before this file runs.
CREATE UNIQUE INDEX IF NOT EXISTS ai_page_elements_key ON ai_page_elements(org_id,project_id,origin,element_key);
CREATE INDEX IF NOT EXISTS ai_page_elements_page ON ai_page_elements(org_id,project_id,page_url);
-- Immutable history: one snapshot per element revision.
CREATE TABLE IF NOT EXISTS ai_element_revisions (
  element_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  origin TEXT NOT NULL,
  page_url TEXT NOT NULL,
  element_key TEXT NOT NULL,
  name TEXT NOT NULL,
  page_key TEXT NOT NULL,
  approved INTEGER NOT NULL,
  locator TEXT NOT NULL,
  alternatives TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(element_id,revision)
);
CREATE INDEX IF NOT EXISTS ai_element_revisions_project ON ai_element_revisions(org_id,project_id,element_id,revision DESC);
CREATE TRIGGER IF NOT EXISTS immutable_ai_element_revisions BEFORE UPDATE ON ai_element_revisions BEGIN SELECT RAISE(ABORT,'immutable ai element revision'); END;
CREATE TRIGGER IF NOT EXISTS immutable_ai_element_revisions_delete BEFORE DELETE ON ai_element_revisions BEGIN SELECT RAISE(ABORT,'immutable ai element revision'); END;
INSERT OR IGNORE INTO schema_migrations VALUES (9);
