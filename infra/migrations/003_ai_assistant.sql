CREATE TABLE IF NOT EXISTS ai_providers (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL, encrypted_key TEXT NOT NULL, model TEXT NOT NULL, timeout_ms INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_conversations (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES ai_conversations(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_drafts (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES ai_conversations(id), provider_id TEXT NOT NULL, model TEXT NOT NULL, target_url TEXT NOT NULL, inspection TEXT, definition TEXT, status TEXT NOT NULL, error_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_suites (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), draft_id TEXT NOT NULL REFERENCES ai_drafts(id), definition TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_suite_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), suite_id TEXT NOT NULL REFERENCES ai_suites(id), status TEXT NOT NULL, result TEXT, created_at TEXT NOT NULL, finished_at TEXT);
CREATE INDEX IF NOT EXISTS ai_conversations_project ON ai_conversations(org_id,project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_suite_runs_suite ON ai_suite_runs(org_id,suite_id,created_at DESC);
INSERT OR IGNORE INTO schema_migrations VALUES (3);
