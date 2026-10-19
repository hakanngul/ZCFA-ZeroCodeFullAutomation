import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  demoApplication,
  demoOrg,
  demoProject,
  DomainError,
  type Actor,
  type AppModel,
  type CanonicalTest,
  type ExecutionPlan,
  type RunOutcome,
  type Variant,
} from "../../domain/src/index";

export const localDir = resolve(process.env.ZC_DATA_DIR ?? ".local");
export type Job = {
  id: string;
  org_id: string;
  project_id: string;
  kind: "discovery" | "run";
  payload: string;
  lease_token: string;
  lease_until: number;
};
export type Run = {
  id: string;
  org_id: string;
  project_id: string;
  test_id: string;
  revision: number;
  variant: Variant;
  status: string;
  plan: string;
  outcome: string | null;
  created_at: string;
  finished_at: string | null;
};

export class Store {
  db: DatabaseSync;
  constructor(path = resolve(localDir, "zerocode.sqlite")) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      readFileSync(
        new URL("../../../infra/migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    this.db
      .prepare("INSERT OR IGNORE INTO projects VALUES (?,?,?)")
      .run(demoProject, demoOrg, "ZeroCode Demo");
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  project(actor: Actor, id: string) {
    const row = this.db
      .prepare("SELECT id,name FROM projects WHERE id=? AND org_id=?")
      .get(id, actor.orgId);
    if (!row) throw new DomainError("NOT_FOUND", "Proje bulunamadı.", 404);
    return row;
  }
  audit(actor: Actor, project: string, action: string, object: string) {
    this.db
      .prepare("INSERT INTO audit VALUES (?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        actor.orgId,
        project,
        actor.userId,
        action,
        object,
        new Date().toISOString(),
      );
  }
  model(actor: Actor, project: string, revision?: number): AppModel | null {
    this.project(actor, project);
    const row =
      revision === undefined
        ? this.db
            .prepare(
              "SELECT definition FROM models WHERE org_id=? AND project_id=? ORDER BY revision DESC LIMIT 1",
            )
            .get(actor.orgId, project)
        : this.db
            .prepare(
              "SELECT definition FROM models WHERE org_id=? AND project_id=? AND revision=?",
            )
            .get(actor.orgId, project, revision);
    return row ? JSON.parse(row.definition as string) : null;
  }
  publish(actor: Actor, test: CanonicalTest) {
    this.project(actor, test.projectId);
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO tests VALUES (?,?,?,?,?,?)")
        .run(
          test.testId,
          actor.orgId,
          test.projectId,
          test.revision,
          JSON.stringify(test),
          new Date().toISOString(),
        );
      this.audit(actor, test.projectId, "test.published", test.testId);
    });
  }
  test(actor: Actor, id: string): CanonicalTest {
    const row = this.db
      .prepare(
        "SELECT definition FROM tests WHERE id=? AND org_id=? ORDER BY revision DESC LIMIT 1",
      )
      .get(id, actor.orgId);
    if (!row) throw new DomainError("NOT_FOUND", "Test bulunamadı.", 404);
    return JSON.parse(row.definition as string);
  }
  run(actor: Actor, id: string): Run {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id=? AND org_id=?")
      .get(id, actor.orgId) as Run | undefined;
    if (!row) throw new DomainError("NOT_FOUND", "Çalıştırma bulunamadı.", 404);
    this.project(actor, row.project_id);
    return row;
  }
  enqueueRun(
    actor: Actor,
    test: CanonicalTest,
    plan: ExecutionPlan,
    variant: Variant,
    key: string,
  ): Run {
    return this.transaction(() => {
      const prior = this.db
        .prepare(
          "SELECT * FROM runs WHERE org_id=? AND project_id=? AND idempotency_key=?",
        )
        .get(actor.orgId, test.projectId, key) as Run | undefined;
      if (prior) {
        if (
          prior.test_id !== test.testId ||
          prior.revision !== test.revision ||
          prior.variant !== variant
        )
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "Bu istek anahtarı farklı bir çalıştırmaya ait.",
            409,
          );
        return prior;
      }
      const pending = this.db
        .prepare(
          "SELECT count(*) AS count FROM jobs WHERE org_id=? AND status IN ('queued','running')",
        )
        .get(actor.orgId)!.count as number;
      if (pending >= 20)
        throw new DomainError("QUEUE_FULL", "Yerel kuyruk dolu.", 429);
      const id = randomUUID(),
        now = new Date().toISOString();
      this.db
        .prepare("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          actor.orgId,
          test.projectId,
          test.testId,
          test.revision,
          variant,
          "queued",
          JSON.stringify(plan),
          null,
          key,
          now,
          null,
        );
      this.db
        .prepare(
          "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          id,
          actor.orgId,
          test.projectId,
          "run",
          JSON.stringify({ runId: id }),
          "queued",
          now,
        );
      this.audit(actor, test.projectId, "run.queued", id);
      return this.run(actor, id);
    });
  }
  claim(leaseMs = 45000): Job | undefined {
    return this.transaction(() => {
      const expired = this.db
        .prepare("SELECT * FROM jobs WHERE status='running' AND lease_until<?")
        .all(Date.now()) as unknown as Job[];
      for (const job of expired) {
        if (job.kind === "run")
          this.db
            .prepare(
              "UPDATE runs SET status='infrastructure_error',outcome=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
            )
            .run(
              JSON.stringify({
                status: "infrastructure_error",
                code: "WORKER_LEASE_EXPIRED",
                steps: [],
                assertionsExecuted: 0,
              }),
              new Date().toISOString(),
              job.id,
              job.org_id,
            );
        else
          this.db
            .prepare("UPDATE scans SET status='failed' WHERE id=? AND org_id=?")
            .run(job.id, job.org_id);
        this.db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(job.id);
      }
      const job = this.db
        .prepare(
          "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
        )
        .get() as Job | undefined;
      if (!job) return;
      const token = randomUUID(),
        until = Date.now() + leaseMs;
      this.db
        .prepare(
          "UPDATE jobs SET status='running',lease_token=?,lease_until=? WHERE id=?",
        )
        .run(token, until, job.id);
      const table = job.kind === "run" ? "runs" : "scans";
      this.db
        .prepare(
          `UPDATE ${table} SET status='running' WHERE id=? AND org_id=? AND status='queued'`,
        )
        .run(job.id, job.org_id);
      return { ...job, lease_token: token, lease_until: until };
    });
  }
  finish(job: Job, outcome: RunOutcome) {
    return this.transaction(() => {
      const valid = this.db
        .prepare(
          "SELECT id FROM jobs WHERE id=? AND org_id=? AND status='running' AND lease_token=? AND lease_until>=?",
        )
        .get(job.id, job.org_id, job.lease_token, Date.now());
      if (!valid) return false;
      if (outcome.status === "passed") {
        const row = this.db
          .prepare(
            "SELECT plan FROM runs WHERE id=? AND org_id=? AND project_id=?",
          )
          .get(job.id, job.org_id, job.project_id);
        const plan = row
          ? (JSON.parse(row.plan as string) as ExecutionPlan)
          : null;
        const assertions =
          plan?.steps.filter(
            (s) => s.kind === "assertVisible" || s.kind === "assertText",
          ) ?? [];
        const evidenced =
          assertions.length > 0 &&
          outcome.assertionsExecuted === assertions.length &&
          outcome.steps.length === plan?.steps.length &&
          outcome.steps.every((s) => s.status === "passed") &&
          assertions.every((a) =>
            outcome.steps.some(
              (s) =>
                s.id === a.id &&
                s.kind === a.kind &&
                s.expected === a.expected &&
                s.observed === a.expected,
            ),
          ) &&
          !!outcome.screenshot;
        if (!evidenced)
          outcome = {
            ...outcome,
            status: "infrastructure_error",
            code: "INVALID_PASS_EVIDENCE",
          };
      }
      // Terminal CAS protects cancelled jobs and stale workers from rewriting results.
      const changed = this.db
        .prepare(
          "UPDATE runs SET status=?,outcome=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
        )
        .run(
          outcome.status,
          JSON.stringify(outcome),
          new Date().toISOString(),
          job.id,
          job.org_id,
        );
      this.db
        .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
        .run(job.id, job.lease_token);
      return changed.changes === 1;
    });
  }
}
