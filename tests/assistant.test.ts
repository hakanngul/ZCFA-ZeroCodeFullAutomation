import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "../packages/storage/src/index";
import { authorizedTarget } from "../packages/assistant/src/agent";
import { createApp } from "../apps/api/src/app";
import { demoProject } from "../packages/domain/src/index";
import { admin } from "./support";

async function until<T>(
  probe: () => Promise<T | null | false | undefined>,
  ms = 30000,
): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const result = await probe();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("timed out");
}
test(
  "AI provider, browser inspection, approved suite and worker results are real and scoped",
  { timeout: 240000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-ai-test-"));
    const previousAllow = process.env.ZC_AI_ALLOW_LOCAL_PROVIDER,
      previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
    process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = "1";
    process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const provider = Fastify(),
      seenModels: string[] = [];
    let sentMalformed = false;
    const corrections: string[] = [];
    const loginStep = (value: string, extra?: Record<string, string>) => ({
      kind: extra ? "fill" : "click",
      locator: { kind: "testId", value },
      ...extra,
    });
    const explorationSteps: Record<string, unknown[]> = {
      "explore-model": [
        loginStep("login-email", { value: "qa@example.test" }),
        loginStep("login-password", { value: "local-fixture-only" }),
        loginStep("login-submit"),
      ],
      "invent-model": [
        loginStep("login-email", { value: "invented@example.test" }),
      ],
      "loop-model": Array.from({ length: 20 }, () => loginStep("login-email")),
    };
    const dashboardSuite = (locator: string) => ({
      title: "Demo giriş ve dashboard suite",
      targetUrl: "http://127.0.0.1:4100/login",
      scenarios: [
        {
          title: "Geçerli giriş bakiyeyi gösterir",
          category: "positive",
          actions: [
            loginStep("login-email", { value: "qa@example.test" }),
            loginStep("login-password", { value: "local-fixture-only" }),
            loginStep("login-submit"),
            {
              kind: "assertVisible",
              locator: { kind: "testId", value: locator },
            },
            {
              kind: "assertText",
              locator: { kind: "testId", value: "dashboard-balance" },
              expected: "1.250,00 TL",
            },
            { kind: "assertUrl", expected: "http://127.0.0.1:4100/dashboard" },
          ],
        },
      ],
    });
    provider.get("/v1/models", async (request, reply) => {
      if (request.headers.authorization !== "Bearer secret-test-key")
        return reply.code(401).send({ error: "unauthorized" });
      return { data: [{ id: "test-model" }] };
    });
    provider.post("/v1/chat/completions", async (request, reply) => {
      if (request.headers.authorization !== "Bearer secret-test-key")
        return reply.code(401).send({ error: "unauthorized" });
      const body = request.body as {
        model: string;
        messages: { content: string }[];
      };
      if (body.messages[0]?.content.startsWith("You explore")) {
        const state = JSON.parse(body.messages[1]!.content) as {
          path: unknown[];
        };
        const step = explorationSteps[body.model]?.[state.path.length] ?? {
          done: true,
        };
        return { choices: [{ message: { content: JSON.stringify(step) } }] };
      }
      if (body.messages.at(-1)?.content.includes("were not observed"))
        corrections.push(body.model);
      if (body.model === "slow-model")
        await new Promise((r) => setTimeout(r, 1500));
      seenModels.push(body.model);
      if (body.messages[0]?.content === "Reply OK")
        return { choices: [{ message: { content: "OK" } }] };
      if (body.messages[0]?.content.startsWith("Explain browser test failure"))
        return {
          choices: [
            {
              message: {
                content:
                  "Beklenen hata metnini DOM gözlemine göre düzeltin; assertion yeniden çalıştırılmalı.",
              },
            },
          ],
        };
      if (body.model === "test-model" && !sentMalformed) {
        sentMalformed = true;
        return {
          choices: [{ message: { content: '{"title":"Eksik suite"}' } }],
        };
      }
      if (body.model === "explore-model" || body.model === "unobserved-model")
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(dashboardSuite("dashboard-heading")),
              },
            },
          ],
        };
      if (body.model === "bad-model")
        return {
          choices: [{ message: { content: '{"title":"Eksik suite"}' } }],
        };
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Demo giriş suite",
                targetUrl: "http://127.0.0.1:4100/login",
                scenarios: [
                  {
                    title: "Yanlış giriş uyarısı",
                    category: "negative",
                    actions: [
                      {
                        kind: "fill",
                        locator: { kind: "testId", value: "login-email" },
                        value: "wrong@example.test",
                      },
                      {
                        kind: "fill",
                        locator: { kind: "testId", value: "login-password" },
                        value: "wrong",
                      },
                      {
                        kind: "click",
                        locator: { kind: "testId", value: "login-submit" },
                      },
                      {
                        kind: "assertText",
                        locator: { kind: "id", value: "error" },
                        expected: "Demo bilgileri hatalı",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      };
    });
    await provider.listen({ host: "127.0.0.1", port: 4250 });
    const store = new Store(join(dir, "zerocode.sqlite")),
      app = await createApp(store);
    const session = randomBytes(16).toString("hex");
    store.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(session, JSON.stringify(admin), Date.now() + 60000);
    const headers = {
      host: "127.0.0.1:4000",
      origin: "http://127.0.0.1:3000",
      "x-zerocode-client": "local-ui",
      cookie: `zc_session=${session}`,
    };
    const call = async (method: string, url: string, payload?: unknown) => {
      const res = await app.inject({
        method,
        url,
        headers:
          payload === undefined
            ? headers
            : { ...headers, "content-type": "application/json" },
        payload: payload === undefined ? undefined : JSON.stringify(payload),
      });
      return { status: res.statusCode, body: res.json() };
    };
    const processes: ChildProcess[] = [];
    function start(script: string) {
      const child = spawn(process.execPath, ["--import", "tsx", script], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, ZC_DATA_DIR: dir },
      });
      processes.push(child);
      return child;
    }
    try {
      const input = {
        name: "Test provider",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:4250/v1",
        apiKey: "secret-test-key",
        model: "test-model",
        timeoutMs: 10000,
      };
      assert.equal(
        (await call("POST", "/v1/ai/providers/connection", input)).status,
        200,
      );
      const wrongKey = await call("POST", "/v1/ai/providers/connection", {
        ...input,
        apiKey: "wrong-key",
      });
      assert.equal(wrongKey.body.code, "PROVIDER_AUTH");
      const timeout = await call("POST", "/v1/ai/providers/connection", {
        ...input,
        model: "slow-model",
        timeoutMs: 1000,
      });
      assert.equal(timeout.body.code, "PROVIDER_TIMEOUT");
      const unreachable = await call("POST", "/v1/ai/providers/connection", {
        ...input,
        baseUrl: "http://127.0.0.1:4251/v1",
      });
      assert.equal(unreachable.body.code, "PROVIDER_NETWORK");
      assert.deepEqual(
        (await call("POST", "/v1/ai/providers/models", { ...input, model: "" }))
          .body.models,
        ["test-model"],
      );
      const saved = await call("POST", "/v1/ai/providers", input);
      assert.equal(saved.status, 201);
      assert.equal(
        JSON.stringify(saved.body).includes("secret-test-key"),
        false,
      );
      const storedKey = store.db
        .prepare("SELECT encrypted_key FROM ai_providers WHERE id=?")
        .get(saved.body.id)!.encrypted_key as string;
      assert.equal(storedKey.includes("secret-test-key"), false);
      assert.equal(
        readFileSync(join(dir, "zerocode.sqlite")).includes(
          Buffer.from("secret-test-key"),
        ),
        false,
      );
      assert.equal(
        (
          await call("POST", `/v1/projects/${demoProject}/ai/messages`, {
            prompt: "Giriş sayfasında yanlış bilgi senaryosu oluştur",
            targetUrl: "https://example.com/login",
            providerId: saved.body.id,
            model: "test-model",
          })
        ).status,
        403,
      );
      const blockedPrompt = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/messages`,
        {
          prompt: "https://example.com/login adresini incele ve suite hazırla",
          providerId: saved.body.id,
          model: "test-model",
        },
      );
      assert.equal(blockedPrompt.body.code, "TARGET_BLOCKED");
      const blockedPrivate = await call("POST", "/v1/ai/authorized-origins", {
        url: "http://127.0.0.1:9999/",
      });
      assert.equal(blockedPrivate.body.code, "TARGET_BLOCKED");
      const site = await call("POST", "/v1/ai/authorized-origins", {
        url: "https://www.saucedemo.com/inventory.html",
      });
      assert.equal(site.status, 201);
      assert.equal(site.body.origin, "https://www.saucedemo.com");
      assert.equal(
        authorizedTarget(
          "https://www.saucedemo.com/",
          store.authorizedOrigins(admin.orgId),
        ).origin,
        site.body.origin,
      );
      assert.equal(
        (await call("GET", "/v1/ai/authorized-origins")).body.origins.length,
        1,
      );
      assert.equal(
        (await call("DELETE", `/v1/ai/authorized-origins/${site.body.id}`))
          .status,
        200,
      );
      assert.throws(
        () =>
          authorizedTarget(
            "https://www.saucedemo.com/",
            store.authorizedOrigins(admin.orgId),
          ),
        { code: "TARGET_BLOCKED" },
      );
      start("tests/fixtures/server.ts");
      start("apps/worker/src/main.ts");
      await until(
        async () =>
          await fetch("http://127.0.0.1:4100/health").then(
            (r) => r.ok,
            () => false,
          ),
        10000,
      );
      const queued = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/messages`,
        {
          prompt: "Giriş sayfasında yanlış bilgi senaryosu oluştur",
          targetUrl: "http://127.0.0.1:4100/login",
          providerId: saved.body.id,
          model: "test-model",
        },
      );
      assert.equal(queued.status, 202);
      const route = `/v1/projects/${demoProject}/ai/conversations/${queued.body.conversationId}`;
      const detail = await until(async () => {
        const response = await call("GET", route);
        if (response.body.drafts[0]?.status === "failed")
          throw new Error(
            `AI analysis failed: ${response.body.drafts[0]?.error_code}`,
          );
        return response.body.drafts[0]?.status === "ready"
          ? response.body
          : null;
      });
      assert.equal(
        detail.drafts[0].inspection.elements.some(
          (e: { locator: { value: string } }) =>
            e.locator.value === "login-email",
        ),
        true,
      );
      assert.equal(
        detail.drafts[0].definition.scenarios[0].category,
        "negative",
      );
      assert.equal(seenModels.filter((m) => m === "test-model").length, 3);
      const captured = await call(
        "GET",
        `/v1/projects/${demoProject}/ai/elements`,
      );
      assert.equal(captured.status, 200);
      assert.equal(captured.body.elements.length, 4);
      assert.equal(
        captured.body.elements.some(
          (element: { locatorKind: string; locatorValue: string }) =>
            element.locatorKind === "testId" &&
            element.locatorValue === "login-email",
        ),
        true,
      );
      assert.equal(seenModels.includes("slow-model"), true);
      const bad = structuredClone(detail.drafts[0].definition);
      bad.scenarios[0].actions[0].locator.value = "not-seen";
      assert.equal(
        (
          await call(
            "POST",
            `/v1/projects/${demoProject}/ai/drafts/${queued.body.draftId}/save`,
            bad,
          )
        ).status,
        400,
      );
      const suite = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/drafts/${queued.body.draftId}/save`,
        detail.drafts[0].definition,
      );
      assert.equal(suite.status, 201);
      const run = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/suites/${suite.body.id}/runs`,
        {},
      );
      assert.equal(run.status, 202);
      const result = await until(async () => {
        const response = await call(
          "GET",
          `/v1/projects/${demoProject}/ai/runs/${run.body.id}`,
        );
        return response.body.status === "passed" ||
          response.body.status === "failed"
          ? response.body
          : null;
      });
      assert.equal(result.status, "passed");
      assert.deepEqual(result.result.counts, {
        passed: 1,
        failed: 0,
        skipped: 0,
      });
      const screenshot = await app.inject({
        method: "GET",
        url: `/v1/projects/${demoProject}/ai/runs/${run.body.id}/screenshots/0`,
        headers,
      });
      assert.equal(screenshot.statusCode, 200);
      assert.equal(screenshot.headers["content-type"], "image/png");
      const stepScreenshot = await app.inject({
        method: "GET",
        url: `/v1/projects/${demoProject}/ai/runs/${run.body.id}/screenshots/0/steps/0`,
        headers,
      });
      assert.equal(stepScreenshot.statusCode, 200);
      assert.equal(stepScreenshot.headers["content-type"], "image/png");
      const revision = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/suites/${suite.body.id}/revise`,
        {},
      );
      assert.equal(revision.status, 201);
      const wrong = structuredClone(detail.drafts[0].definition);
      wrong.scenarios[0].actions[3].expected = "Yanlış beklenti";
      const revised = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/drafts/${revision.body.draftId}/save`,
        wrong,
      );
      assert.equal(revised.status, 201);
      const badRun = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/suites/${revised.body.id}/runs`,
        {},
      );
      const failed = await until(async () => {
        const response = await call(
          "GET",
          `/v1/projects/${demoProject}/ai/runs/${badRun.body.id}`,
        );
        return response.body.status === "failed" ? response.body : null;
      });
      assert.deepEqual(failed.result.counts, {
        passed: 0,
        failed: 1,
        skipped: 0,
      });
      const history = await call("GET", route);
      assert.equal(
        history.body.messages.some((m: { content: string }) =>
          m.content.includes("Hata analizi:"),
        ),
        true,
      );
      assert.equal(history.body.runs.length, 2);
      const malformed = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/messages`,
        {
          prompt: "Giriş sayfasını tekrar analiz et ve test oluştur",
          targetUrl: "http://127.0.0.1:4100/login",
          providerId: saved.body.id,
          model: "bad-model",
        },
      );
      assert.equal(malformed.status, 202);
      const malformedDetail = await until(async () => {
        const response = await call(
          "GET",
          `/v1/projects/${demoProject}/ai/conversations/${malformed.body.conversationId}`,
        );
        return response.body.drafts[0]?.status === "failed"
          ? response.body
          : null;
      });
      assert.equal(malformedDetail.drafts[0].error_code, "PROVIDER_FORMAT");
      assert.equal(malformedDetail.drafts[0].inspection.elements.length, 4);
      assert.equal(
        (await call("GET", `/v1/projects/${demoProject}/ai/elements`)).body
          .elements.length,
        4,
      );
      const analyze = async (model: string, prompt: string) => {
        const queued = await call(
          "POST",
          `/v1/projects/${demoProject}/ai/messages`,
          {
            prompt,
            targetUrl: "http://127.0.0.1:4100/login",
            providerId: saved.body.id,
            model,
          },
        );
        assert.equal(queued.status, 202);
        return until(async () => {
          const response = await call(
            "GET",
            `/v1/projects/${demoProject}/ai/conversations/${queued.body.conversationId}`,
          );
          const draft = response.body.drafts[0];
          return draft?.status === "ready" || draft?.status === "failed"
            ? { draft, messages: response.body.messages }
            : null;
        }, 60000);
      };
      const explored = await analyze(
        "explore-model",
        "qa@example.test ve local-fixture-only ile giriş yap, dashboard bakiyesini doğrula",
      );
      assert.equal(explored.draft.status, "ready");
      assert.equal(explored.draft.inspection.pages.length, 2);
      assert.equal(explored.draft.inspection.path.length, 3);
      assert.equal(
        explored.draft.inspection.pages[1].url,
        "http://127.0.0.1:4100/dashboard",
      );
      assert.equal(
        explored.messages.some((m: { content: string }) =>
          m.content.startsWith("2 sayfa incelendi"),
        ),
        true,
      );
      assert.equal(
        (
          await call("GET", `/v1/projects/${demoProject}/ai/elements`)
        ).body.elements.some(
          (e: { pageUrl: string; locatorValue: string }) =>
            e.pageUrl === "http://127.0.0.1:4100/dashboard" &&
            e.locatorValue === "dashboard-heading",
        ),
        true,
      );
      const exploredSuite = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/drafts/${explored.draft.id}/save`,
        explored.draft.definition,
      );
      assert.equal(exploredSuite.status, 201);
      const exploredRun = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/suites/${exploredSuite.body.id}/runs`,
        {},
      );
      const exploredResult = await until(async () => {
        const response = await call(
          "GET",
          `/v1/projects/${demoProject}/ai/runs/${exploredRun.body.id}`,
        );
        return ["passed", "failed"].includes(response.body.status)
          ? response.body
          : null;
      });
      assert.equal(exploredResult.status, "passed");
      const unobserved = await analyze(
        "unobserved-model",
        "Giriş sonrası dashboard başlığını doğrula",
      );
      assert.equal(unobserved.draft.error_code, "UNOBSERVED_LOCATOR");
      assert.equal(
        seenModels.filter((m) => m === "unobserved-model").length,
        2,
      );
      assert.deepEqual(corrections, ["unobserved-model"]);
      const invented = await analyze(
        "invent-model",
        "Geçerli kullanıcıyla giriş yap ve dashboard'u doğrula",
      );
      assert.equal(invented.draft.error_code, "EXPLORATION_VALUE");
      assert.equal(seenModels.includes("invent-model"), false);
      const looped = await analyze(
        "loop-model",
        "Giriş sayfasındaki alanları keşfet",
      );
      assert.equal(looped.draft.status, "ready");
      assert.equal(looped.draft.inspection.path.length, 12);
      assert.equal(looped.draft.inspection.stopped, "STEP_LIMIT");
      assert.equal(looped.draft.inspection.pages.length, 1);
      assert.equal(
        (
          await call(
            "GET",
            `/v1/projects/11111111-1111-4111-8111-111111111111/ai/runs/${run.body.id}`,
          )
        ).status,
        404,
      );
    } finally {
      for (const p of processes)
        try {
          if (p.pid) process.kill(-p.pid, "SIGTERM");
        } catch {}
      await app.close();
      store.close();
      await provider.close();
      if (previousAllow === undefined)
        delete process.env.ZC_AI_ALLOW_LOCAL_PROVIDER;
      else process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = previousAllow;
      if (previousKey === undefined) delete process.env.ZC_AI_ENCRYPTION_KEY;
      else process.env.ZC_AI_ENCRYPTION_KEY = previousKey;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
