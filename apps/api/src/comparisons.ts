import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import {
  isFragileLocator,
  normalizeInspection,
} from "../../../packages/assistant/src/agent";
import type { Provider } from "../../../packages/assistant/src/provider";
import type { AiSuite } from "../../../packages/assistant/src/spec";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };

/** Cost guard: one comparison never generates with more than this many models. */
export const maxComparedModels = 3;

const comparisonInput = z
  .object({
    prompt: z.string().trim().min(10).max(2000),
    targetUrl: z.url().max(1000).optional(),
    models: z
      .array(
        z
          .object({
            providerId: z.uuid(),
            model: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .min(2)
      .max(maxComparedModels),
  })
  .strict();

type DraftRow = {
  id: string;
  provider_id: string;
  model: string;
  status: string;
  error_code: string | null;
  inspection: string | null;
  definition: string | null;
  position: number;
  attempts: number | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

/** Metrics of one generated suite; counts are derived, never model-reported. */
export function suiteMetrics(suite: AiSuite) {
  const actions = suite.scenarios.flatMap((s) => s.actions);
  return {
    scenarios: suite.scenarios.length,
    actions: actions.length,
    assertions: actions.filter((a) => a.kind.startsWith("assert")).length,
    fragileLocators: actions.filter(
      (a) => "locator" in a && isFragileLocator(a.locator),
    ).length,
  };
}

export function comparisonView(
  store: Store,
  user: Actor,
  projectId: string,
  id: string,
) {
  const comparison = store.db
    .prepare(
      "SELECT id,conversation_id,target_url,created_at FROM ai_comparisons WHERE id=? AND org_id=? AND project_id=?",
    )
    .get(id, user.orgId, projectId) as
    | {
        id: string;
        conversation_id: string;
        target_url: string;
        created_at: string;
      }
    | undefined;
  if (!comparison)
    throw new DomainError("NOT_FOUND", "Karşılaştırma bulunamadı.", 404);
  const rows = store.db
    .prepare(
      "SELECT d.id,d.provider_id,d.model,d.status,d.error_code,d.inspection,d.definition,c.position,m.attempts,m.duration_ms,m.prompt_tokens,m.completion_tokens,m.total_tokens FROM ai_comparison_drafts c JOIN ai_drafts d ON d.id=c.draft_id LEFT JOIN ai_generation_metrics m ON m.draft_id=d.id WHERE c.comparison_id=? AND c.org_id=? AND d.project_id=? ORDER BY c.position",
    )
    .all(id, user.orgId, projectId) as unknown as DraftRow[];
  const providerName = store.db.prepare(
    "SELECT name FROM ai_providers WHERE id=? AND org_id=?",
  );
  const latestSuite = store.db.prepare(
    "SELECT id FROM ai_suites WHERE draft_id=? AND org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 1",
  );
  const latestRun = store.db.prepare(
    "SELECT r.id,r.status,r.result FROM ai_suite_runs r JOIN ai_suites s ON s.id=r.suite_id WHERE s.draft_id=? AND r.org_id=? AND r.project_id=? ORDER BY r.created_at DESC LIMIT 1",
  );
  const explored = rows.find((row) => row.inspection);
  const inspection = explored
    ? normalizeInspection(JSON.parse(explored.inspection!))
    : null;
  // The shared exploration is the analysis job of the first compared draft.
  const analysisJobs = store.db
    .prepare(
      "SELECT count(*) AS n FROM jobs WHERE kind='ai_analysis' AND org_id=? AND id IN (SELECT draft_id FROM ai_comparison_drafts WHERE comparison_id=?)",
    )
    .get(user.orgId, id) as { n: number };
  return {
    id: comparison.id,
    conversationId: comparison.conversation_id,
    targetUrl: comparison.target_url,
    createdAt: comparison.created_at,
    exploration: {
      runs: analysisJobs.n,
      status: inspection
        ? "done"
        : rows.some((r) => r.status === "failed")
          ? "failed"
          : "pending",
      pages: inspection?.pages.length ?? 0,
      steps: inspection?.path.length ?? 0,
      stopped: inspection?.stopped?.reason ?? null,
    },
    entries: rows.map((row) => {
      const suite = row.definition
        ? (JSON.parse(row.definition) as AiSuite)
        : null;
      const run = latestRun.get(row.id, user.orgId, projectId) as
        { id: string; status: string; result: string | null } | undefined;
      const counts = run?.result
        ? (
            JSON.parse(run.result) as {
              counts?: { passed: number; failed: number; skipped: number };
            }
          ).counts
        : undefined;
      return {
        draftId: row.id,
        providerId: row.provider_id,
        providerName:
          (
            providerName.get(row.provider_id, user.orgId) as
              { name: string } | undefined
          )?.name ?? null,
        model: row.model,
        status: row.status,
        errorCode: row.error_code,
        // 1 call = schema-valid on first try; 2 = needed the correction call.
        schema:
          row.status === "ready"
            ? row.attempts === 1
              ? "first_try"
              : "corrected"
            : row.status === "failed" && row.attempts
              ? "invalid"
              : null,
        attempts: row.attempts,
        durationMs: row.duration_ms,
        usage:
          row.total_tokens === null &&
          row.prompt_tokens === null &&
          row.completion_tokens === null
            ? null
            : {
                promptTokens: row.prompt_tokens,
                completionTokens: row.completion_tokens,
                totalTokens: row.total_tokens,
              },
        ...(suite
          ? suiteMetrics(suite)
          : {
              scenarios: null,
              actions: null,
              assertions: null,
              fragileLocators: null,
            }),
        suiteId:
          (
            latestSuite.get(row.id, user.orgId, projectId) as
              { id: string } | undefined
          )?.id ?? null,
        latestRun: run
          ? {
              id: run.id,
              status: run.status,
              passed: counts?.passed ?? null,
              failed: counts?.failed ?? null,
              skipped: counts?.skipped ?? null,
            }
          : null,
      };
    }),
  };
}

export function registerComparisons(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
  deps: {
    getProvider: (user: Actor, id: string) => Provider;
    resolveTarget: (
      prompt: string,
      targetUrl: string | undefined,
      orgId: string,
    ) => URL;
  },
) {
  const idParam = z.object({ id: z.uuid() });
  app.post("/v1/projects/:projectId/ai/comparisons", async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const input = comparisonInput.parse(request.body);
    const keys = input.models.map((m) => `${m.providerId}\n${m.model}`);
    if (new Set(keys).size !== keys.length)
      throw new DomainError(
        "DUPLICATE_MODEL",
        "Aynı model bir karşılaştırmada bir kez seçilebilir.",
      );
    const target = deps.resolveTarget(
      input.prompt,
      input.targetUrl,
      user.orgId,
    );
    // Every provider must belong to this org; the first one also explores.
    for (const entry of input.models) deps.getProvider(user, entry.providerId);
    const comparisonId = randomUUID(),
      conversationId = randomUUID(),
      draftIds = input.models.map(() => randomUUID()),
      now = new Date().toISOString();
    store.transaction(() => {
      const pending = store.db
        .prepare(
          "SELECT count(*) AS n FROM jobs WHERE org_id=? AND status IN ('queued','running')",
        )
        .get(user.orgId)!.n as number;
      // One exploration + one generation per model must fit in the queue.
      if (pending + 1 + input.models.length > 20)
        throw new DomainError("QUEUE_FULL", "Kuyruk dolu.", 429);
      store.db
        .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
        .run(
          conversationId,
          user.orgId,
          projectId,
          `Karşılaştırma: ${input.prompt}`.slice(0, 80),
          now,
        );
      store.db
        .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
        .run(randomUUID(), conversationId, "user", input.prompt, now);
      store.db
        .prepare("INSERT INTO ai_comparisons VALUES (?,?,?,?,?,?)")
        .run(
          comparisonId,
          user.orgId,
          projectId,
          conversationId,
          target.href,
          now,
        );
      input.models.forEach((entry, position) => {
        store.db
          .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            draftIds[position]!,
            user.orgId,
            projectId,
            conversationId,
            entry.providerId,
            entry.model,
            target.href,
            null,
            null,
            "queued",
            null,
            now,
          );
        store.db
          .prepare("INSERT INTO ai_comparison_drafts VALUES (?,?,?,?)")
          .run(draftIds[position]!, comparisonId, user.orgId, position);
      });
      // Exploration runs once, guided by the first model; the worker then
      // queues one ai_generate per compared draft from that inspection.
      store.db
        .prepare(
          "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          draftIds[0]!,
          user.orgId,
          projectId,
          "ai_analysis",
          JSON.stringify({ prompt: input.prompt, comparisonId }),
          "queued",
          now,
        );
      store.audit(user, projectId, "ai_comparison.created", comparisonId);
    });
    return reply.code(202).send({
      id: comparisonId,
      conversationId,
      draftIds,
      status: "queued",
    });
  });
  app.get("/v1/projects/:projectId/ai/comparisons/:id", async (request) => {
    const { user, projectId } = scoped(request),
      { id } = idParam.parse(request.params);
    return comparisonView(store, user, projectId, id);
  });
}
