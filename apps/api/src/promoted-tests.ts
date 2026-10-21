import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  resolveElementPins,
  Store,
  suitePins,
} from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import { aiSuiteSchema } from "../../../packages/assistant/src/spec";
import {
  authorizedTarget,
  normalizeInspection,
} from "../../../packages/assistant/src/agent";
import {
  buildPromotedTest,
  compilePromoted,
  promotedChecksum,
  type PromotedTest,
} from "../../../packages/assistant/src/promote";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };

/** Approved AI suite → immutable, versioned test (ADR 012). */
export function registerPromotedTests(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
) {
  const idParam = z.object({ id: z.uuid() });
  function version(
    user: Actor,
    projectId: string,
    id: string,
    revision?: number,
  ) {
    const row = store.db
      .prepare(
        `SELECT definition,checksum FROM ai_tests WHERE id=? AND org_id=? AND project_id=? ${revision === undefined ? "ORDER BY revision DESC LIMIT 1" : "AND revision=?"}`,
      )
      .get(
        ...([id, user.orgId, projectId, revision].filter(
          (v) => v !== undefined,
        ) as (string | number)[]),
      );
    if (!row) throw new DomainError("NOT_FOUND", "Test bulunamadı.", 404);
    const test = JSON.parse(row.definition as string) as PromotedTest;
    if (promotedChecksum(test) !== row.checksum)
      throw new DomainError(
        "TEST_CHECKSUM_MISMATCH",
        "Test sürümü bütünlüğü doğrulanamadı.",
        409,
      );
    return { test, checksum: row.checksum as string };
  }
  app.post(
    "/v1/projects/:projectId/ai/suites/:id/promote",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params),
        input = z
          .object({ testId: z.uuid().optional() })
          .strict()
          .parse(request.body ?? {});
      const row = store.db
        .prepare(
          "SELECT s.definition,s.draft_id,d.conversation_id,d.inspection FROM ai_suites s JOIN ai_drafts d ON d.id=s.draft_id WHERE s.id=? AND s.org_id=? AND s.project_id=?",
        )
        .get(id, user.orgId, projectId);
      if (!row) throw new DomainError("NOT_FOUND", "Suite bulunamadı.", 404);
      const suite = aiSuiteSchema.parse(JSON.parse(row.definition as string));
      const origin = authorizedTarget(
        suite.targetUrl,
        store.authorizedOrigins(user.orgId),
      ).origin;
      const result = store.transaction(() => {
        // One suite is promoted once; repeating the call returns that version.
        const existing = store.db
          .prepare(
            "SELECT id,revision FROM ai_tests WHERE org_id=? AND suite_id=?",
          )
          .get(user.orgId, id);
        if (existing)
          return {
            created: false,
            ...version(
              user,
              projectId,
              existing.id as string,
              existing.revision as number,
            ),
          };
        // Revisions of a suite stay in its conversation: same lineage, new version.
        const lineage = input.testId
          ? store.db
              .prepare(
                "SELECT id,target_origin FROM ai_tests WHERE id=? AND org_id=? AND project_id=? LIMIT 1",
              )
              .get(input.testId, user.orgId, projectId)
          : store.db
              .prepare(
                "SELECT id,target_origin FROM ai_tests WHERE org_id=? AND project_id=? AND conversation_id=? AND target_origin=? ORDER BY created_at DESC LIMIT 1",
              )
              .get(user.orgId, projectId, row.conversation_id, origin);
        if (input.testId && !lineage)
          throw new DomainError("NOT_FOUND", "Test bulunamadı.", 404);
        if (lineage && lineage.target_origin !== origin)
          throw new DomainError(
            "TARGET_MISMATCH",
            "Yeni sürüm aynı hedef origin'i kullanmalı.",
            409,
          );
        const testId = (lineage?.id as string | undefined) ?? randomUUID();
        const revision =
          Number(
            store.db
              .prepare(
                "SELECT coalesce(max(revision),0) AS r FROM ai_tests WHERE id=?",
              )
              .get(testId)!.r,
          ) + 1;
        // Pinned library elements must still be approved when promoting.
        const resolved = resolveElementPins(
          store.db,
          user.orgId,
          projectId,
          suitePins(store.db, user.orgId, id),
        );
        const bindings = Object.entries(resolved).map(([key, bound]) => {
          if ("unavailable" in bound)
            throw new DomainError(
              "ELEMENT_UNAVAILABLE",
              `Element kullanılamıyor (${bound.unavailable}): ${key}`,
              409,
            );
          return bound;
        });
        const test = buildPromotedTest({
          bindings,
          testId,
          revision,
          orgId: user.orgId,
          projectId,
          suite,
          inspection: normalizeInspection(
            JSON.parse((row.inspection as string | null) ?? "{}"),
          ),
          source: {
            suiteId: id,
            draftId: row.draft_id as string,
            conversationId: row.conversation_id as string,
          },
        });
        const checksum = promotedChecksum(test);
        store.db
          .prepare("INSERT INTO ai_tests VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            testId,
            revision,
            user.orgId,
            projectId,
            id,
            row.conversation_id as string,
            test.title,
            origin,
            JSON.stringify(test),
            checksum,
            new Date().toISOString(),
          );
        store.audit(
          user,
          projectId,
          "ai_test.published",
          `${testId}@${revision}`,
        );
        return { created: true, test, checksum };
      });
      return reply
        .code(result.created ? 201 : 200)
        .send({ test: result.test, checksum: result.checksum });
    },
  );
  app.get("/v1/projects/:projectId/ai/tests", async (request) => {
    const { user, projectId } = scoped(request);
    const origins = store.authorizedOrigins(user.orgId);
    return {
      tests: store.db
        .prepare(
          "SELECT id,revision,title,target_origin,suite_id,checksum,created_at,json_array_length(definition,'$.scenarios') AS scenario_count,json_array_length(definition,'$.elements') AS element_count FROM ai_tests WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(user.orgId, projectId)
        .map((row) => {
          let authorized = true;
          try {
            authorizedTarget(row.target_origin as string, origins);
          } catch {
            authorized = false;
          }
          return { ...row, authorized };
        }),
    };
  });
  app.get(
    "/v1/projects/:projectId/ai/tests/:id/versions/:revision",
    async (request) => {
      const { user, projectId } = scoped(request),
        { id, revision } = z
          .object({ id: z.uuid(), revision: z.coerce.number().int().min(1) })
          .parse(request.params);
      return version(user, projectId, id, revision);
    },
  );
  app.post(
    "/v1/projects/:projectId/ai/tests/:id/runs",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params),
        input = z
          .object({ revision: z.number().int().min(1).optional() })
          .strict()
          .parse(request.body ?? {});
      const { test } = version(user, projectId, id, input.revision);
      // Authorization is re-read on every run; removed origins block execution.
      authorizedTarget(test.targetUrl, store.authorizedOrigins(user.orgId));
      const plan = compilePromoted(test);
      const runId = randomUUID(),
        now = new Date().toISOString();
      store.transaction(() => {
        const pending = store.db
          .prepare(
            "SELECT count(*) AS n FROM jobs WHERE org_id=? AND status IN ('queued','running')",
          )
          .get(user.orgId)!.n as number;
        if (pending >= 20)
          throw new DomainError("QUEUE_FULL", "Kuyruk dolu.", 429);
        store.db
          .prepare("INSERT INTO ai_test_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            runId,
            user.orgId,
            projectId,
            test.testId,
            test.revision,
            JSON.stringify(plan),
            plan.checksum,
            "queued",
            null,
            now,
            null,
          );
        store.db
          .prepare(
            "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            runId,
            user.orgId,
            projectId,
            "ai_test_run",
            "{}",
            "queued",
            now,
          );
        store.audit(user, projectId, "ai_test_run.queued", runId);
      });
      return reply.code(202).send({ id: runId, status: "queued" });
    },
  );
  app.get("/v1/projects/:projectId/ai/test-runs", async (request) => {
    const { user, projectId } = scoped(request);
    return {
      runs: store.db
        .prepare(
          "SELECT r.id,r.test_id,r.revision,r.status,r.checksum,r.created_at,r.finished_at,t.title,t.target_origin FROM ai_test_runs r JOIN ai_tests t ON t.id=r.test_id AND t.revision=r.revision WHERE r.org_id=? AND r.project_id=? ORDER BY r.created_at DESC LIMIT 30",
        )
        .all(user.orgId, projectId),
    };
  });
  app.get("/v1/projects/:projectId/ai/test-runs/:id", async (request) => {
    const { user, projectId } = scoped(request),
      { id } = idParam.parse(request.params);
    const row = store.db
      .prepare(
        "SELECT r.*,t.title,t.target_origin FROM ai_test_runs r JOIN ai_tests t ON t.id=r.test_id AND t.revision=r.revision WHERE r.id=? AND r.org_id=? AND r.project_id=?",
      )
      .get(id, user.orgId, projectId);
    if (!row) throw new DomainError("NOT_FOUND", "Çalıştırma bulunamadı.", 404);
    return {
      ...row,
      plan: JSON.parse(row.plan as string),
      result: row.result ? JSON.parse(row.result as string) : null,
    };
  });
}
