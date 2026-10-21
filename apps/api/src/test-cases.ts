import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  addCase,
  approveCase,
  caseCreateSchema,
  caseRow,
  caseUpdateSchema,
  caseView,
  createSuite,
  deleteCase,
  deleteSuite,
  duplicateCase,
  elementCaseUsage,
  listSuites,
  pinnedCaseElements,
  renameSuite,
  suiteRow,
  suiteUpdateSchema,
  suiteView,
  updateCase,
  type Store,
} from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import { authorizedTarget } from "../../../packages/assistant/src/agent";
import {
  compileCaseRun,
  type CaseRunSnapshot,
} from "../../../packages/assistant/src/cases";
import { suiteLimits } from "../../../packages/assistant/src/spec";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };

const params = z.object({ projectId: z.uuid(), id: z.uuid() });
const revisionInput = z
  .object({ expectedRevision: z.number().int().min(1) })
  .strict();
const suiteCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    targetUrl: z.url().max(1000),
  })
  .strict();
const runView = (row: Record<string, unknown>) => ({
  id: row.id as string,
  suiteId: row.suite_id as string,
  caseId: row.case_id as string,
  caseRevision: row.case_revision as number,
  batchId: row.batch_id as string,
  status: row.status as string,
  createdAt: row.created_at as string,
  finishedAt: (row.finished_at as string | null) ?? null,
  result: row.result ? (JSON.parse(row.result as string) as unknown) : null,
});

/**
 * Tests screen (ADR 017): editable suites and cases, human approval that
 * pins element revisions, and runs that freeze case + element versions.
 */
export function registerTestCases(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
) {
  const root = "/v1/projects/:projectId";
  const id = (request: FastifyRequest) => params.parse(request.params).id;

  app.get(`${root}/test-suites`, async (request) => {
    const { user, projectId } = scoped(request);
    return { suites: listSuites(store.db, user.orgId, projectId) };
  });
  // A manual suite: the target must be an authorized origin, like AI suites.
  app.post(`${root}/test-suites`, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const input = suiteCreateSchema.parse(request.body);
    const target = authorizedTarget(
      input.targetUrl,
      store.authorizedOrigins(user.orgId),
    );
    const created = store.transaction(() => {
      const suite = createSuite(store.db, user, projectId, {
        title: input.title,
        targetUrl: target.href,
        source: "manual",
        cases: [],
      });
      store.audit(user, projectId, "test_suite.created", suite.id);
      return suite;
    });
    return reply.code(201).send({
      suite: suiteView(
        store.db,
        suiteRow(store.db, user.orgId, projectId, created.id),
      ),
    });
  });
  app.get(`${root}/test-suites/:id`, async (request) => {
    const { user, projectId } = scoped(request);
    return {
      suite: suiteView(
        store.db,
        suiteRow(store.db, user.orgId, projectId, id(request)),
      ),
    };
  });
  app.put(`${root}/test-suites/:id`, async (request) => {
    const { user, projectId } = scoped(request, true);
    const input = suiteUpdateSchema.parse(request.body);
    return {
      suite: store.transaction(() =>
        renameSuite(store.db, user, projectId, id(request), input),
      ),
    };
  });
  app.delete(`${root}/test-suites/:id`, async (request) => {
    const { user, projectId } = scoped(request, true);
    const suiteId = id(request);
    store.transaction(() => {
      deleteSuite(store.db, user, projectId, suiteId);
      store.audit(user, projectId, "test_suite.deleted", suiteId);
    });
    return { status: "deleted" };
  });
  app.post(`${root}/test-suites/:id/cases`, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const input = caseCreateSchema.parse(request.body);
    const created = store.transaction(() =>
      addCase(store.db, user, projectId, id(request), input),
    );
    return reply.code(201).send({ case: created });
  });

  app.get(`${root}/test-cases/:id`, async (request) => {
    const { user, projectId } = scoped(request);
    const row = caseRow(store.db, user.orgId, projectId, id(request));
    const suite = suiteRow(store.db, user.orgId, projectId, row.suite_id);
    return {
      case: caseView(store.db, suite, row),
      suite: {
        id: suite.id,
        title: suite.title,
        targetUrl: suite.target_url,
        origin: suite.origin,
      },
      runs: store.db
        .prepare(
          "SELECT * FROM test_case_runs WHERE org_id=? AND project_id=? AND case_id=? ORDER BY created_at DESC,id LIMIT 10",
        )
        .all(user.orgId, projectId, row.id)
        .map((r) => {
          const { result: _, ...rest } = runView(r);
          return rest;
        }),
    };
  });
  app.put(`${root}/test-cases/:id`, async (request) => {
    const { user, projectId } = scoped(request, true);
    const input = caseUpdateSchema.parse(request.body);
    const caseId = id(request);
    return {
      case: store.transaction(() => {
        const updated = updateCase(store.db, user, projectId, caseId, input);
        store.audit(user, projectId, "test_case.updated", caseId);
        return updated;
      }),
    };
  });
  app.post(`${root}/test-cases/:id/duplicate`, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const copy = store.transaction(() =>
      duplicateCase(store.db, user, projectId, id(request)),
    );
    return reply.code(201).send({ case: copy });
  });
  app.delete(`${root}/test-cases/:id`, async (request) => {
    const { user, projectId } = scoped(request, true);
    const caseId = id(request);
    store.transaction(() => {
      deleteCase(store.db, user, projectId, caseId);
      store.audit(user, projectId, "test_case.deleted", caseId);
    });
    return { status: "deleted" };
  });
  app.post(`${root}/test-cases/:id/approve`, async (request) => {
    const { user, projectId } = scoped(request, true);
    const { expectedRevision } = revisionInput.parse(request.body);
    const caseId = id(request);
    return {
      case: store.transaction(() => {
        const approved = approveCase(
          store.db,
          user,
          projectId,
          caseId,
          expectedRevision,
        );
        store.audit(user, projectId, "test_case.approved", caseId);
        return approved;
      }),
    };
  });

  /** Freezes one approved, complete case into a queued run (in a transaction). */
  function enqueue(
    user: Actor,
    projectId: string,
    caseId: string,
    batchId: string,
  ) {
    const row = caseRow(store.db, user.orgId, projectId, caseId);
    const suite = suiteRow(store.db, user.orgId, projectId, row.suite_id);
    const view = caseView(store.db, suite, row);
    if (view.approval !== "approved" || row.approved_revision !== row.revision)
      throw new DomainError(
        "CASE_NOT_APPROVED",
        "Çalıştırmadan önce test case'i onaylayın.",
        409,
      );
    if (!view.complete)
      throw new DomainError(
        "CASE_INCOMPLETE",
        view.issues.map((i) => i.message).join(" "),
        409,
      );
    authorizedTarget(suite.target_url, store.authorizedOrigins(user.orgId));
    const snapshot = compileCaseRun({
      suiteId: suite.id,
      caseId: row.id,
      caseRevision: row.revision,
      title: row.title,
      category: row.category,
      targetUrl: suite.target_url,
      definition: view.definition,
      pins: pinnedCaseElements(store.db, user.orgId, projectId, row).map(
        ({ approved: _, ...pin }) => pin,
      ),
    });
    const runId = randomUUID(),
      now = new Date().toISOString();
    store.db
      .prepare(
        "INSERT INTO test_case_runs (id,org_id,project_id,suite_id,case_id,case_revision,batch_id,snapshot,checksum,status,result,created_by,created_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?,'queued',NULL,?,?,NULL)",
      )
      .run(
        runId,
        user.orgId,
        projectId,
        suite.id,
        row.id,
        row.revision,
        batchId,
        JSON.stringify(snapshot),
        snapshot.checksum,
        user.userId,
        now,
      );
    store.db
      .prepare(
        "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(runId, user.orgId, projectId, "case_run", "{}", "queued", now);
    return { id: runId, caseId: row.id, status: "queued" };
  }
  const pendingJobs = (orgId: string) =>
    store.db
      .prepare(
        "SELECT count(*) AS n FROM jobs WHERE org_id=? AND status IN ('queued','running')",
      )
      .get(orgId)!.n as number;

  app.post(`${root}/test-cases/:id/runs`, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const caseId = id(request);
    const run = store.transaction(() => {
      if (pendingJobs(user.orgId) >= 20)
        throw new DomainError("QUEUE_FULL", "Kuyruk dolu.", 429);
      return enqueue(user, projectId, caseId, randomUUID());
    });
    return reply.code(202).send(run);
  });
  // Runs every approved, complete case; others are listed, never run.
  app.post(`${root}/test-suites/:id/runs`, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const suite = suiteView(
      store.db,
      suiteRow(store.db, user.orgId, projectId, id(request)),
    );
    const runnable = suite.cases.filter(
      (c) => c.approval === "approved" && c.complete,
    );
    const skipped = suite.cases
      .filter((c) => !runnable.includes(c))
      .map((c) => ({
        caseId: c.id,
        title: c.title,
        reason: !c.complete ? "incomplete" : "not_approved",
      }));
    if (!runnable.length)
      throw new DomainError(
        "NO_RUNNABLE_CASE",
        "Çalıştırılabilir (onaylı ve eksiksiz) test case yok.",
        409,
      );
    const batchId = randomUUID();
    const runs = store.transaction(() => {
      if (pendingJobs(user.orgId) + runnable.length > 20)
        throw new DomainError("QUEUE_FULL", "Kuyruk dolu.", 429);
      return runnable.map((c) => enqueue(user, projectId, c.id, batchId));
    });
    return reply.code(202).send({ batchId, runs, skipped });
  });
  app.get(`${root}/test-case-runs/:id`, async (request) => {
    const { user, projectId } = scoped(request);
    const row = store.db
      .prepare(
        "SELECT * FROM test_case_runs WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(id(request), user.orgId, projectId);
    if (!row) throw new DomainError("NOT_FOUND", "Çalıştırma bulunamadı.", 404);
    const snapshot = JSON.parse(row.snapshot as string) as CaseRunSnapshot;
    return {
      ...runView(row),
      snapshot: {
        title: snapshot.title,
        targetUrl: snapshot.targetUrl,
        caseRevision: snapshot.caseRevision,
        checksum: snapshot.checksum,
        definition: snapshot.definition,
        elements: snapshot.elements.map((e) => ({
          ref: e.ref,
          elementId: e.elementId,
          elementKey: e.elementKey,
          name: e.name,
          revision: e.revision,
          locator: e.locator,
        })),
      },
    };
  });
  async function evidence(
    reply: FastifyReply,
    user: Actor,
    projectId: string,
    runId: string,
    step?: number,
  ) {
    const row = store.db
      .prepare(
        "SELECT result FROM test_case_runs WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(runId, user.orgId, projectId);
    const scenario = row?.result
      ? JSON.parse(row.result as string).results?.[0]
      : undefined;
    const expected =
      step === undefined
        ? scenario?.screenshot
        : scenario?.steps?.[step]?.screenshot;
    if (!expected) throw new DomainError("NOT_FOUND", "Kanıt bulunamadı.", 404);
    const data = await readFile(
      resolve(
        store.dataDir,
        "artifacts",
        runId,
        "0",
        step === undefined ? "scenario-0.png" : `step-${step}.png`,
      ),
    );
    if (createHash("sha256").update(data).digest("hex") !== expected.sha256)
      throw new DomainError(
        "EVIDENCE_CORRUPTED",
        "Kanıt bütünlüğü bozuldu.",
        409,
      );
    return reply.type("image/png").send(data);
  }
  app.get(`${root}/test-case-runs/:id/screenshot`, async (request, reply) => {
    const { user, projectId } = scoped(request);
    return evidence(reply, user, projectId, id(request));
  });
  app.get(
    `${root}/test-case-runs/:id/steps/:step/screenshot`,
    async (request, reply) => {
      const { user, projectId } = scoped(request);
      const { step } = z
        .object({
          step: z.coerce
            .number()
            .int()
            .min(0)
            .max(suiteLimits.actionsPerScenario - 1),
        })
        .parse(request.params);
      return evidence(reply, user, projectId, id(request), step);
    },
  );
  app.get(`${root}/ai/elements/:id/usage`, async (request) => {
    const { user, projectId } = scoped(request);
    return {
      cases: elementCaseUsage(store.db, user.orgId, projectId, id(request)),
    };
  });
}
