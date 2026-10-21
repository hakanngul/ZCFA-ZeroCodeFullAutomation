import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  aiElement,
  aiElementRevision,
  aiElementView,
  currentElementBindings,
  resolveElementPins,
  Store,
  suitePins,
  type ElementPin,
  type LibraryLocator,
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
  repinPromotedTest,
  type PromotedTest,
} from "../../../packages/assistant/src/promote";

const unavailableNames = { removed: "silinmiş", unapproved: "onaysız" };
/** Library references of a test version (older tests have none). */
function testPins(test: PromotedTest): ElementPin[] {
  return test.elements.flatMap((e) =>
    e.elementKey && e.elementId && e.revision
      ? [
          {
            elementKey: e.elementKey,
            elementId: e.elementId,
            revision: e.revision,
          },
        ]
      : [],
  );
}
const locatorText = (l: LibraryLocator) => JSON.stringify(l);

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
  /** Latest version of every test in the project (older versions never change). */
  function latestTests(user: Actor, projectId: string) {
    return store.db
      .prepare(
        "SELECT t.id,t.revision,t.title,t.definition FROM ai_tests t WHERE t.org_id=? AND t.project_id=? AND t.revision=(SELECT max(x.revision) FROM ai_tests x WHERE x.id=t.id AND x.org_id=t.org_id) ORDER BY t.created_at DESC LIMIT 500",
      )
      .all(user.orgId, projectId)
      .map((row) => ({
        id: row.id as string,
        revision: row.revision as number,
        title: row.title as string,
        test: JSON.parse(row.definition as string) as PromotedTest,
      }));
  }
  /**
   * Pins of a test whose element has a newer revision or no longer exists
   * (ADR 015). Unapproved elements count too: the test cannot run them.
   */
  function staleElements(user: Actor, projectId: string, test: PromotedTest) {
    const current = store.db.prepare(
      "SELECT revision,approved FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
    );
    return testPins(test).flatMap((pin) => {
      const row = current.get(pin.elementId, user.orgId, projectId) as
        { revision: number; approved: number } | undefined;
      if (row && row.revision <= pin.revision && row.approved === 1) return [];
      return [
        {
          elementKey: pin.elementKey,
          elementId: pin.elementId,
          pinnedRevision: pin.revision,
          currentRevision: row?.revision ?? null,
          approved: row?.approved === 1,
          removed: !row,
        },
      ];
    });
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
            "SELECT id,revision FROM ai_tests WHERE org_id=? AND suite_id=? ORDER BY revision LIMIT 1",
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
    const latest = new Map(
      latestTests(user, projectId).map((t) => [
        t.id,
        { revision: t.revision, stale: staleElements(user, projectId, t.test) },
      ]),
    );
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
          const head = latest.get(row.id as string);
          const isLatest = head?.revision === row.revision;
          // Only the latest version is flagged; older ones are history.
          return {
            ...row,
            authorized,
            latest: isLatest,
            stale_elements: isLatest ? head!.stale : [],
          };
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
  // Element detail "Etkilenen testler": latest versions pinning an older revision.
  app.get("/v1/projects/:projectId/ai/elements/:id/impact", async (request) => {
    const { user, projectId } = scoped(request),
      { id } = idParam.parse(request.params);
    const element = aiElementView(
      aiElement(store.db, user.orgId, projectId, id),
    );
    const tests = latestTests(user, projectId).flatMap(
      ({ id: testId, revision, title, test }) => {
        const pins = testPins(test);
        const pin = pins.find(
          (p) => p.elementId === id && p.revision < element.revision,
        );
        if (!pin) return [];
        const pinned = aiElementRevision(
          store.db,
          user.orgId,
          projectId,
          id,
          pin.revision,
        );
        const was = pinned?.alternatives.map(locatorText) ?? [];
        const now = element.alternatives.map(locatorText);
        const blocked = currentElementBindings(
          store.db,
          user.orgId,
          projectId,
          pins,
        ).unavailable;
        return [
          {
            testId,
            title,
            testRevision: revision,
            elementKey: pin.elementKey,
            pinnedRevision: pin.revision,
            currentRevision: element.revision,
            diff: {
              primary:
                pinned &&
                locatorText(pinned.locator) !== locatorText(element.locator)
                  ? { from: pinned.locator, to: element.locator }
                  : null,
              alternatives: {
                added: element.alternatives.filter(
                  (l) => !was.includes(locatorText(l)),
                ),
                removed: (pinned?.alternatives ?? []).filter(
                  (l) => !now.includes(locatorText(l)),
                ),
              },
              name:
                pinned && pinned.name !== element.name
                  ? { from: pinned.name, to: element.name }
                  : null,
              snapshotMissing: !pinned,
            },
            // Elements of this test that block a new version right now.
            unavailable: blocked,
          },
        ];
      },
    );
    return {
      element: {
        id: element.id,
        elementKey: element.elementKey,
        revision: element.revision,
        approved: element.approved,
      },
      tests,
    };
  });
  // Human-initiated new version with current approved element revisions (ADR 015).
  app.post(
    "/v1/projects/:projectId/ai/tests/:id/versions",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params),
        input = z
          .object({ expectedRevision: z.number().int().min(1) })
          .strict()
          .parse(request.body ?? {});
      const result = store.transaction(() => {
        const { test, checksum: previous } = version(user, projectId, id);
        if (test.revision !== input.expectedRevision)
          throw new DomainError(
            "REVISION_CONFLICT",
            `Test bu arada değişti (güncel sürüm v${test.revision}).`,
            409,
          );
        const pins = testPins(test);
        const { bindings, unavailable } = currentElementBindings(
          store.db,
          user.orgId,
          projectId,
          pins,
        );
        if (unavailable.length)
          throw new DomainError(
            "ELEMENT_UNAVAILABLE",
            `Yeni sürüm oluşturulamadı; kullanılamayan elementler: ${unavailable
              .map((u) => `${u.elementKey} (${unavailableNames[u.reason]})`)
              .join(", ")}. Elementi onaylayın ya da testi yeniden üretin.`,
            409,
            { unavailable },
          );
        const changed = bindings.flatMap((b) => {
          const pin = pins.find((p) => p.elementId === b.elementId)!;
          return b.revision === pin.revision
            ? []
            : [
                {
                  elementKey: pin.elementKey,
                  from: pin.revision,
                  to: b.revision,
                },
              ];
        });
        if (!changed.length)
          throw new DomainError(
            "TEST_UP_TO_DATE",
            "Test zaten güncel element sürümlerini kullanıyor.",
            409,
          );
        const row = store.db
          .prepare(
            "SELECT suite_id,conversation_id,target_origin FROM ai_tests WHERE id=? AND revision=? AND org_id=?",
          )
          .get(id, test.revision, user.orgId)!;
        const next = repinPromotedTest(test, test.revision + 1, bindings);
        const checksum = promotedChecksum(next);
        store.db
          .prepare("INSERT INTO ai_tests VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            id,
            next.revision,
            user.orgId,
            projectId,
            row.suite_id as string,
            row.conversation_id as string,
            next.title,
            row.target_origin as string,
            JSON.stringify(next),
            checksum,
            new Date().toISOString(),
          );
        store.audit(
          user,
          projectId,
          "ai_test.element_update",
          `${id}@${next.revision}`,
        );
        return { test: next, checksum, previousChecksum: previous, changed };
      });
      return reply.code(201).send(result);
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
