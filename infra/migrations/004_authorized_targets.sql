CREATE TABLE IF NOT EXISTS ai_authorized_origins (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(org_id,origin));
CREATE INDEX IF NOT EXISTS ai_authorized_origins_org ON ai_authorized_origins(org_id,created_at DESC);
INSERT OR IGNORE INTO schema_migrations VALUES (4);
