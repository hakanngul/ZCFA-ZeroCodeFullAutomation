-- Multi-model comparison: one shared exploration, one generated draft per model.
CREATE TABLE IF NOT EXISTS ai_comparisons (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id),
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id),
  target_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_comparisons_project ON ai_comparisons(org_id,project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_comparison_drafts (
  draft_id TEXT PRIMARY KEY REFERENCES ai_drafts(id),
  comparison_id TEXT NOT NULL REFERENCES ai_comparisons(id),
  org_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(comparison_id,position)
);
-- Per-draft generation metrics (any draft, compared or not). Tokens are NULL
-- when the provider does not return `usage`.
CREATE TABLE IF NOT EXISTS ai_generation_metrics (
  draft_id TEXT PRIMARY KEY REFERENCES ai_drafts(id),
  org_id TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations VALUES (8);
