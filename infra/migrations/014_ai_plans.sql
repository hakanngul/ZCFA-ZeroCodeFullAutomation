-- Survey exploration test plans (ADR 018): one plan per draft, proposals
-- only. The plan is replaced only by a new planning job for that draft.
CREATE TABLE IF NOT EXISTS ai_draft_plans (
  draft_id TEXT PRIMARY KEY REFERENCES ai_drafts(id),
  org_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations VALUES (14);
