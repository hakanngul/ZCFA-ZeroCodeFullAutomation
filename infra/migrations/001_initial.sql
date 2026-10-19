-- Local prototype schema v1. PostgreSQL migration is tracked in docs/PROGRESS.md.
PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, actor TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scans (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), status TEXT NOT NULL, findings TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS models (org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL, definition TEXT NOT NULL, PRIMARY KEY(project_id,revision));
      CREATE TABLE IF NOT EXISTS tests (id TEXT NOT NULL, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL, definition TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), test_id TEXT NOT NULL, revision INTEGER NOT NULL, variant TEXT NOT NULL, status TEXT NOT NULL, plan TEXT NOT NULL, outcome TEXT, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT, UNIQUE(org_id,project_id,idempotency_key), FOREIGN KEY(test_id,revision) REFERENCES tests(id,revision));
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, lease_token TEXT, lease_until INTEGER, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status,created_at);
      CREATE INDEX IF NOT EXISTS runs_project ON runs(org_id,project_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_models BEFORE UPDATE ON models BEGIN SELECT RAISE(ABORT,'immutable model'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_tests BEFORE UPDATE ON tests BEGIN SELECT RAISE(ABORT,'immutable test'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_run_snapshot BEFORE UPDATE OF org_id,project_id,test_id,revision,variant,plan ON runs BEGIN SELECT RAISE(ABORT,'immutable run'); END;
      CREATE TRIGGER IF NOT EXISTS immutable_run_result BEFORE UPDATE OF outcome,status ON runs WHEN OLD.status NOT IN ('queued','running') BEGIN SELECT RAISE(ABORT,'immutable result'); END;
      INSERT OR IGNORE INTO schema_migrations VALUES (1);
