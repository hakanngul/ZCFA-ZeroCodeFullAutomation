import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { Store } from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import { aiSuiteSchema } from "../../../packages/assistant/src/spec";
import { authorizedTarget } from "../../../packages/assistant/src/agent";
import {
  encrypt,
  providerRequest,
  type Provider,
} from "../../../packages/assistant/src/provider";

const idParam = z.object({ id: z.uuid() });
const providerInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.literal("openai-compatible"),
    baseUrl: z.url().max(500),
    apiKey: z.string().max(500).optional(),
    model: z.string().trim().min(1).max(120),
    timeoutMs: z.number().int().min(1000).max(30000),
  })
  .strict();
function providerUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.ZC_AI_ALLOW_LOCAL_PROVIDER === "1" &&
        url.hostname === "127.0.0.1"
      ))
  )
    throw new DomainError(
      "PROVIDER_URL_BLOCKED",
      "Provider URL güvenli değil.",
    );
  return url.href.replace(/\/$/, "");
}
async function safeProviderNetwork(raw: string) {
  const url = new URL(raw);
  if (
    url.hostname === "127.0.0.1" &&
    process.env.ZC_AI_ALLOW_LOCAL_PROVIDER === "1"
  )
    return;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new DomainError("PROVIDER_NETWORK", "Provider adresi çözümlenemedi.");
  }
  if (
    !addresses.length ||
    addresses.some(
      (a) =>
        a.address.startsWith("10.") ||
        a.address.startsWith("127.") ||
        a.address.startsWith("192.168.") ||
        a.address.startsWith("169.254.") ||
        a.address.startsWith("172.") ||
        a.address === "::1" ||
        a.address.startsWith("fc") ||
        a.address.startsWith("fd"),
    )
  )
    throw new DomainError(
      "PROVIDER_URL_BLOCKED",
      "Özel ağ adresi kullanılamaz.",
    );
}
function safe(row: Provider) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.base_url,
    model: row.model,
    timeoutMs: row.timeout_ms,
    active: !!row.active,
    hasKey: !!row.encrypted_key,
  };
}
export function registerAssistant(
  app: FastifyInstance,
  store: Store,
  actor: (request: FastifyRequest, write?: boolean) => Actor,
) {
  function scoped(request: FastifyRequest, write = false) {
    const user = actor(request, write),
      projectId = z
        .object({ projectId: z.uuid() })
        .parse(request.params).projectId;
    store.project(user, projectId);
    return { user, projectId };
  }
  function getProvider(user: Actor, id: string) {
    const row = store.db
      .prepare("SELECT * FROM ai_providers WHERE id=? AND org_id=?")
      .get(id, user.orgId) as Provider | undefined;
    if (!row) throw new DomainError("NOT_FOUND", "Provider bulunamadı.", 404);
    return row;
  }
  function getDraft(user: Actor, projectId: string, id: string) {
    const row = store.db
      .prepare(
        "SELECT * FROM ai_drafts WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(id, user.orgId, projectId);
    if (!row) throw new DomainError("NOT_FOUND", "Taslak bulunamadı.", 404);
    return row;
  }
  app.get("/v1/ai/providers", async (request) => {
    const user = actor(request);
    return {
      providers: (
        store.db
          .prepare(
            "SELECT * FROM ai_providers WHERE org_id=? ORDER BY created_at DESC",
          )
          .all(user.orgId) as Provider[]
      ).map(safe),
    };
  });
  app.post("/v1/ai/providers/connection", async (request) => {
    actor(request, true);
    const input = providerInput
      .extend({ apiKey: z.string().min(1).max(500), name: z.string().max(80) })
      .parse(request.body);
    const baseUrl = providerUrl(input.baseUrl);
    await safeProviderNetwork(baseUrl);
    const test: Provider = {
      id: "",
      name: input.name,
      kind: input.kind,
      base_url: baseUrl,
      encrypted_key: encrypt(input.apiKey),
      model: input.model,
      timeout_ms: input.timeoutMs,
      active: 0,
    };
    const completion = (await providerRequest(test, "chat/completions", {
      model: input.model,
      max_tokens: 4,
      messages: [{ role: "user", content: "Reply OK" }],
    })) as { choices?: { message?: { content?: string } }[] };
    if (!completion.choices?.[0]?.message?.content)
      throw new DomainError(
        "PROVIDER_FORMAT",
        "Provider geçerli sohbet yanıtı döndürmedi.",
      );
    return { status: "connected" };
  });
  app.post("/v1/ai/providers/models", async (request) => {
    actor(request, true);
    const input = providerInput
      .extend({
        apiKey: z.string().min(1).max(500),
        name: z.string().max(80),
        model: z.string().max(120),
      })
      .parse(request.body);
    const baseUrl = providerUrl(input.baseUrl);
    await safeProviderNetwork(baseUrl);
    const test: Provider = {
      id: "",
      name: input.name,
      kind: input.kind,
      base_url: baseUrl,
      encrypted_key: encrypt(input.apiKey),
      model: input.model,
      timeout_ms: input.timeoutMs,
      active: 0,
    };
    const result = (await providerRequest(test, "models")) as {
      data?: { id?: string }[];
    };
    return {
      models: (result.data ?? [])
        .map((item) => item.id)
        .filter((id): id is string => !!id)
        .slice(0, 200),
    };
  });
  app.post("/v1/ai/providers", async (request, reply) => {
    const user = actor(request, true),
      input = providerInput
        .extend({ apiKey: z.string().min(1).max(500) })
        .parse(request.body);
    const baseUrl = providerUrl(input.baseUrl);
    await safeProviderNetwork(baseUrl);
    const id = randomUUID(),
      now = new Date().toISOString();
    store.transaction(() => {
      const count = store.db
        .prepare("SELECT count(*) AS n FROM ai_providers WHERE org_id=?")
        .get(user.orgId)!.n as number;
      store.db
        .prepare("INSERT INTO ai_providers VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          user.orgId,
          input.name,
          input.kind,
          baseUrl,
          encrypt(input.apiKey),
          input.model,
          input.timeoutMs,
          count ? 0 : 1,
          now,
        );
    });
    return reply.code(201).send(safe(getProvider(user, id)));
  });
  app.put("/v1/ai/providers/:id", async (request) => {
    const user = actor(request, true),
      { id } = idParam.parse(request.params),
      old = getProvider(user, id),
      input = providerInput.parse(request.body);
    const baseUrl = providerUrl(input.baseUrl);
    await safeProviderNetwork(baseUrl);
    store.db
      .prepare(
        "UPDATE ai_providers SET name=?,kind=?,base_url=?,encrypted_key=?,model=?,timeout_ms=? WHERE id=? AND org_id=?",
      )
      .run(
        input.name,
        input.kind,
        baseUrl,
        input.apiKey ? encrypt(input.apiKey) : old.encrypted_key,
        input.model,
        input.timeoutMs,
        id,
        user.orgId,
      );
    return safe(getProvider(user, id));
  });
  app.delete("/v1/ai/providers/:id", async (request) => {
    const user = actor(request, true),
      { id } = idParam.parse(request.params),
      old = getProvider(user, id);
    store.db
      .prepare("DELETE FROM ai_providers WHERE id=? AND org_id=?")
      .run(id, user.orgId);
    if (old.active)
      store.db
        .prepare(
          "UPDATE ai_providers SET active=1 WHERE id=(SELECT id FROM ai_providers WHERE org_id=? ORDER BY created_at DESC LIMIT 1)",
        )
        .run(user.orgId);
    return { status: "deleted" };
  });
  app.post("/v1/ai/providers/:id/activate", async (request) => {
    const user = actor(request, true),
      { id } = idParam.parse(request.params);
    getProvider(user, id);
    store.transaction(() => {
      store.db
        .prepare("UPDATE ai_providers SET active=0 WHERE org_id=?")
        .run(user.orgId);
      store.db
        .prepare("UPDATE ai_providers SET active=1 WHERE id=? AND org_id=?")
        .run(id, user.orgId);
    });
    return { status: "active" };
  });
  app.get("/v1/projects/:projectId/ai/conversations", async (request) => {
    const { user, projectId } = scoped(request);
    return {
      conversations: store.db
        .prepare(
          "SELECT * FROM ai_conversations WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .all(user.orgId, projectId),
    };
  });
  app.get("/v1/projects/:projectId/ai/conversations/:id", async (request) => {
    const { user, projectId } = scoped(request),
      { id } = idParam.parse(request.params);
    const conversation = store.db
      .prepare(
        "SELECT * FROM ai_conversations WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(id, user.orgId, projectId);
    if (!conversation)
      throw new DomainError("NOT_FOUND", "Konuşma bulunamadı.", 404);
    return {
      conversation,
      messages: store.db
        .prepare(
          "SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at,id",
        )
        .all(id),
      drafts: store.db
        .prepare(
          "SELECT * FROM ai_drafts WHERE conversation_id=? AND org_id=? AND project_id=? ORDER BY created_at DESC",
        )
        .all(id, user.orgId, projectId)
        .map((row) => ({
          ...row,
          inspection: row.inspection
            ? JSON.parse(row.inspection as string)
            : null,
          definition: row.definition
            ? JSON.parse(row.definition as string)
            : null,
        })),
      runs: store.db
        .prepare(
          "SELECT r.id,r.status,r.result,r.created_at FROM ai_suite_runs r JOIN ai_suites s ON s.id=r.suite_id JOIN ai_drafts d ON d.id=s.draft_id WHERE d.conversation_id=? AND r.org_id=? AND r.project_id=? ORDER BY r.created_at DESC LIMIT 20",
        )
        .all(id, user.orgId, projectId)
        .map((row) => ({
          ...row,
          result: row.result ? JSON.parse(row.result as string) : null,
        })),
    };
  });
  app.post("/v1/projects/:projectId/ai/messages", async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const input = z
      .object({
        conversationId: z.uuid().optional(),
        prompt: z.string().trim().min(10).max(2000),
        targetUrl: z.url().max(1000).optional(),
        providerId: z.uuid(),
        model: z.string().trim().min(1).max(120),
      })
      .strict()
      .parse(request.body);
    const promptUrl = input.prompt
      .match(/https?:\/\/[^\s<>"']+/i)?.[0]
      .replace(/[),.;!?]+$/g, "");
    if (
      promptUrl &&
      input.targetUrl &&
      new URL(promptUrl).href !== new URL(input.targetUrl).href
    )
      throw new DomainError("TARGET_MISMATCH", "Prompt ve hedef URL farklı.");
    const target = authorizedTarget(promptUrl ?? input.targetUrl ?? ""),
      provider = getProvider(user, input.providerId);
    if (!provider.active)
      throw new DomainError("PROVIDER_INACTIVE", "Aktif provider seçin.");
    const conversationId = input.conversationId ?? randomUUID(),
      id = randomUUID(),
      now = new Date().toISOString();
    store.transaction(() => {
      if (input.conversationId) {
        if (
          !store.db
            .prepare(
              "SELECT id FROM ai_conversations WHERE id=? AND org_id=? AND project_id=?",
            )
            .get(conversationId, user.orgId, projectId)
        )
          throw new DomainError("NOT_FOUND", "Konuşma bulunamadı.", 404);
      } else
        store.db
          .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
          .run(
            conversationId,
            user.orgId,
            projectId,
            input.prompt.slice(0, 80),
            now,
          );
      const pending = store.db
        .prepare(
          "SELECT count(*) AS n FROM jobs WHERE org_id=? AND status IN ('queued','running')",
        )
        .get(user.orgId)!.n as number;
      if (pending >= 20)
        throw new DomainError("QUEUE_FULL", "Kuyruk dolu.", 429);
      store.db
        .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
        .run(randomUUID(), conversationId, "user", input.prompt, now);
      store.db
        .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          user.orgId,
          projectId,
          conversationId,
          provider.id,
          input.model,
          target.href,
          null,
          null,
          "queued",
          null,
          now,
        );
      store.db
        .prepare(
          "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          id,
          user.orgId,
          projectId,
          "ai_analysis",
          JSON.stringify({ prompt: input.prompt }),
          "queued",
          now,
        );
    });
    return reply
      .code(202)
      .send({ conversationId, draftId: id, status: "queued" });
  });
  app.get("/v1/projects/:projectId/ai/suites", async (request) => {
    const { user, projectId } = scoped(request);
    return {
      suites: store.db
        .prepare(
          "SELECT id,definition,created_at FROM ai_suites WHERE org_id=? AND project_id=? ORDER BY created_at DESC",
        )
        .all(user.orgId, projectId)
        .map((row) => ({
          ...row,
          definition: JSON.parse(row.definition as string),
        })),
    };
  });
  app.post(
    "/v1/projects/:projectId/ai/drafts/:id/save",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params),
        draft = getDraft(user, projectId, id);
      if (draft.status !== "ready")
        throw new DomainError("DRAFT_NOT_READY", "Taslak hazır değil.", 409);
      const suite = aiSuiteSchema.parse(request.body);
      if (suite.targetUrl !== draft.target_url)
        throw new DomainError("TARGET_BLOCKED", "Hedef değiştirilemez.");
      const inspected = JSON.parse(draft.inspection as string) as {
        elements: { locator: unknown }[];
      };
      const observed = new Set(
        inspected.elements.map((e) => JSON.stringify(e.locator)),
      );
      for (const scenario of suite.scenarios) {
        if (
          !scenario.actions.some((action) => action.kind.startsWith("assert"))
        )
          throw new DomainError(
            "ASSERTION_REQUIRED",
            "Her senaryoda doğrulama olmalı.",
          );
        for (const action of scenario.actions) {
          if (
            "locator" in action &&
            !observed.has(JSON.stringify(action.locator))
          )
            throw new DomainError(
              "UNOBSERVED_LOCATOR",
              "Locator incelenen sayfada yok.",
            );
          if (
            action.kind === "assertUrl" &&
            new URL(action.expected).origin !== new URL(suite.targetUrl).origin
          )
            throw new DomainError("TARGET_BLOCKED", "URL hedef dışı.");
        }
      }
      const suiteId = randomUUID();
      store.db
        .prepare("INSERT INTO ai_suites VALUES (?,?,?,?,?,?)")
        .run(
          suiteId,
          user.orgId,
          projectId,
          id,
          JSON.stringify(suite),
          new Date().toISOString(),
        );
      store.audit(user, projectId, "ai_suite.approved", suiteId);
      return reply.code(201).send({ id: suiteId, definition: suite });
    },
  );
  app.post(
    "/v1/projects/:projectId/ai/suites/:id/runs",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params);
      const suite = store.db
        .prepare(
          "SELECT id FROM ai_suites WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(id, user.orgId, projectId);
      if (!suite) throw new DomainError("NOT_FOUND", "Suite bulunamadı.", 404);
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
          .prepare("INSERT INTO ai_suite_runs VALUES (?,?,?,?,?,?,?,?)")
          .run(runId, user.orgId, projectId, id, "queued", null, now, null);
        store.db
          .prepare(
            "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .run(runId, user.orgId, projectId, "ai_suite", "{}", "queued", now);
      });
      return reply.code(202).send({ id: runId, status: "queued" });
    },
  );
  app.post(
    "/v1/projects/:projectId/ai/suites/:id/revise",
    async (request, reply) => {
      const { user, projectId } = scoped(request, true),
        { id } = idParam.parse(request.params);
      const row = store.db
        .prepare(
          "SELECT s.definition,d.conversation_id,d.provider_id,d.model,d.target_url,d.inspection FROM ai_suites s JOIN ai_drafts d ON d.id=s.draft_id WHERE s.id=? AND s.org_id=? AND s.project_id=?",
        )
        .get(id, user.orgId, projectId);
      if (!row) throw new DomainError("NOT_FOUND", "Suite bulunamadı.", 404);
      const draftId = randomUUID(),
        now = new Date().toISOString();
      store.db
        .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          draftId,
          user.orgId,
          projectId,
          row.conversation_id,
          row.provider_id,
          row.model,
          row.target_url,
          row.inspection,
          row.definition,
          "ready",
          null,
          now,
        );
      return reply
        .code(201)
        .send({ draftId, conversationId: row.conversation_id });
    },
  );
  app.get("/v1/projects/:projectId/ai/runs/:id", async (request) => {
    const { user, projectId } = scoped(request),
      { id } = idParam.parse(request.params);
    const row = store.db
      .prepare(
        "SELECT * FROM ai_suite_runs WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(id, user.orgId, projectId);
    if (!row)
      throw new DomainError("NOT_FOUND", "Suite çalışması bulunamadı.", 404);
    return {
      ...row,
      result: row.result ? JSON.parse(row.result as string) : null,
    };
  });
  app.get(
    "/v1/projects/:projectId/ai/runs/:id/screenshots/:index",
    async (request, reply) => {
      const { user, projectId } = scoped(request),
        { id, index } = z
          .object({
            id: z.uuid(),
            index: z.coerce.number().int().min(0).max(7),
          })
          .parse(request.params);
      const row = store.db
        .prepare(
          "SELECT result FROM ai_suite_runs WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(id, user.orgId, projectId);
      if (!row?.result)
        throw new DomainError("NOT_FOUND", "Kanıt bulunamadı.", 404);
      const expected = JSON.parse(row.result as string).results[index]
        ?.screenshot;
      if (!expected)
        throw new DomainError("NOT_FOUND", "Kanıt bulunamadı.", 404);
      const data = await readFile(
        resolve(
          store.dataDir,
          "artifacts",
          id,
          String(index),
          `scenario-${index}.png`,
        ),
      );
      if (createHash("sha256").update(data).digest("hex") !== expected.sha256)
        throw new DomainError(
          "EVIDENCE_CORRUPTED",
          "Kanıt bütünlüğü bozuldu.",
          409,
        );
      return reply.type("image/png").send(data);
    },
  );
}
