import { test } from "node:test";
import { detachedTestProcess, stopTestProcess } from "./process-tree";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  recordObservedElements,
  resolveElementPins,
  Store,
  suitePins,
} from "../packages/storage/src/index";
import { DatabaseSync } from "node:sqlite";
import {
  authorizedTarget,
  executeSuite,
  generateSuite,
  isFragileLocator,
  newGenerationMetrics,
  scenarioTimeoutMs,
  suiteLeaseMs,
  explorationLeaseMs,
  explorationLimits,
  locatorKey,
  normalizeElementRefs,
  observePage,
  pageForModel,
  type ResolvedElements,
} from "../packages/assistant/src/agent";
import { launchBrowser } from "../packages/runner/src/index";
import { createApp } from "../apps/api/src/app";
import { demoProject } from "../packages/domain/src/index";
import { admin } from "./support";
import {
  buildPromotedTest,
  compilePromoted,
  evidencedPass,
  promotedChecksum,
  verifyPlan,
} from "../packages/assistant/src/promote";
import {
  placeholders,
  redactSecrets,
  resolvePlaceholders,
  variablesForModel,
} from "../packages/assistant/src/variables";
import { aiSuiteSchema, suiteLimits } from "../packages/assistant/src/spec";
import { encrypt } from "../packages/assistant/src/provider";

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
    const suitePrompts: string[] = [];
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
      // Filling a button cannot be applied in Chromium: step_failed.
      "fail-model": [loginStep("login-submit", { value: "qa@example.test" })],
      "ghost-model": [loginStep("not-on-page")],
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
      if (body.messages[0]?.content.startsWith("You create"))
        suitePrompts.push(body.messages[0].content);
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
        detached: detachedTestProcess,
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
      // Exploration and suite generation run as two separate leased jobs.
      const draftJobs = store.db
        .prepare(
          "SELECT kind,status,payload FROM jobs WHERE id=? OR json_extract(payload,'$.draftId')=? ORDER BY created_at",
        )
        .all(queued.body.draftId, queued.body.draftId) as {
        kind: string;
        status: string;
        payload: string;
      }[];
      assert.deepEqual(
        draftJobs.map((j) => [j.kind, j.status]),
        [
          ["ai_analysis", "done"],
          ["ai_generate", "done"],
        ],
      );
      assert.equal(
        JSON.parse(draftJobs[1]!.payload).prompt,
        "Giriş sayfasında yanlış bilgi senaryosu oluştur",
      );
      assert.equal(detail.drafts[0].inspection.stopped.reason, "done");
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
      const elementsRoute = `/v1/projects/${demoProject}/ai/elements`;
      const searched = await call("GET", `${elementsRoute}?q=login-pass`);
      assert.equal(searched.body.total, 1);
      assert.equal(searched.body.elements[0].locatorValue, "login-password");
      assert.equal(searched.body.elements[0].fragile, false);
      assert.deepEqual(
        searched.body.pages.map((p: { count: number }) => p.count),
        [1],
      );
      const paged = await call(
        "GET",
        `${elementsRoute}?pageUrl=${encodeURIComponent("http://127.0.0.1:4100/login")}&limit=2&offset=2`,
      );
      assert.equal(paged.body.total, 4);
      assert.equal(paged.body.elements.length, 2);
      assert.equal((await call("GET", `${elementsRoute}?q=%25`)).body.total, 0);
      assert.equal((await call("GET", `${elementsRoute}?limit=0`)).status, 400);
      assert.equal(
        suitePrompts.every((prompt) => prompt.includes('"fragile":true')),
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
      const generatedBefore = seenModels.length;
      const revision = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/suites/${suite.body.id}/revise`,
        { instruction: "Hata mesajı doğrulamasını koru" },
      );
      assert.equal(revision.status, 202);
      assert.equal(revision.body.status, "explored");
      // Revise skips exploration and only enqueues ai_generate.
      const revisionJobs = store.db
        .prepare(
          "SELECT kind,payload FROM jobs WHERE id=? OR json_extract(payload,'$.draftId')=?",
        )
        .all(revision.body.draftId, revision.body.draftId) as {
        kind: string;
        payload: string;
      }[];
      assert.deepEqual(
        revisionJobs.map((j) => j.kind),
        ["ai_generate"],
      );
      const revisionPayload = JSON.parse(revisionJobs[0]!.payload);
      assert.equal(
        revisionPayload.prompt,
        "Giriş sayfasında yanlış bilgi senaryosu oluştur",
      );
      assert.equal(
        revisionPayload.revision.instruction,
        "Hata mesajı doğrulamasını koru",
      );
      const revisedDraft = await until(async () => {
        const response = await call("GET", route);
        const draft = response.body.drafts.find(
          (d: { id: string }) => d.id === revision.body.draftId,
        );
        return draft?.status === "ready" || draft?.status === "failed"
          ? draft
          : null;
      });
      assert.equal(revisedDraft.status, "ready");
      assert.equal(seenModels.length, generatedBefore + 1);
      assert.equal(
        revisedDraft.inspection.elements.length,
        detail.drafts[0].inspection.elements.length,
      );
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
      // Promotion: approved suite → immutable, versioned test (ADR 012).
      const promoteRoute = (suiteId: string) =>
        `/v1/projects/${demoProject}/ai/suites/${suiteId}/promote`;
      const promoted = await call("POST", promoteRoute(suite.body.id), {});
      assert.equal(promoted.status, 201);
      assert.equal(promoted.body.test.revision, 1);
      assert.equal(promoted.body.test.targetOrigin, "http://127.0.0.1:4100");
      assert.deepEqual(
        promoted.body.test.elements.map(
          (e: { locator: { value: string } }) => e.locator.value,
        ),
        ["login-email", "login-password", "login-submit", "error"],
      );
      assert.equal(
        promoted.body.test.elements[0].pageUrl,
        "http://127.0.0.1:4100/login",
      );
      const testId = promoted.body.test.testId as string;
      const again = await call("POST", promoteRoute(suite.body.id), {});
      assert.equal(again.status, 200);
      assert.equal(again.body.test.revision, 1);
      assert.equal(again.body.checksum, promoted.body.checksum);
      // Later element registry changes do not touch the snapshot.
      store.db
        .prepare("UPDATE ai_page_elements SET label='Değişti' WHERE org_id=?")
        .run(admin.orgId);
      const v2 = await call("POST", promoteRoute(revised.body.id), {});
      assert.equal(v2.status, 201);
      assert.equal(v2.body.test.testId, testId);
      assert.equal(v2.body.test.revision, 2);
      assert.notEqual(v2.body.checksum, promoted.body.checksum);
      const v1 = await call(
        "GET",
        `/v1/projects/${demoProject}/ai/tests/${testId}/versions/1`,
      );
      assert.deepEqual(v1.body.test, promoted.body.test);
      assert.equal(v1.body.checksum, promoted.body.checksum);
      assert.throws(
        () =>
          store.db
            .prepare("UPDATE ai_tests SET title='x' WHERE id=?")
            .run(testId),
        /immutable ai test/,
      );
      assert.throws(
        () => store.db.prepare("DELETE FROM ai_tests WHERE id=?").run(testId),
        /immutable ai test/,
      );
      const suitesList = await call(
        "GET",
        `/v1/projects/${demoProject}/ai/suites`,
      );
      assert.deepEqual(
        suitesList.body.suites.find(
          (x: { id: string }) => x.id === suite.body.id,
        ).promoted,
        { testId, revision: 1 },
      );
      const listed = await call("GET", `/v1/projects/${demoProject}/ai/tests`);
      assert.deepEqual(
        listed.body.tests.map((t: { revision: number }) => t.revision).sort(),
        [1, 2],
      );
      assert.equal(listed.body.tests[0].authorized, true);
      const runTest = async (revision: number) => {
        const queuedRun = await call(
          "POST",
          `/v1/projects/${demoProject}/ai/tests/${testId}/runs`,
          { revision },
        );
        assert.equal(queuedRun.status, 202);
        return until(async () => {
          const response = await call(
            "GET",
            `/v1/projects/${demoProject}/ai/test-runs/${queuedRun.body.id}`,
          );
          return ["queued", "running"].includes(response.body.status)
            ? null
            : response.body;
        });
      };
      const promotedPass = await runTest(1);
      assert.equal(promotedPass.status, "passed");
      assert.equal(promotedPass.revision, 1);
      assert.equal(promotedPass.plan.checksum, promotedPass.checksum);
      assert.equal(promotedPass.plan.testRevision, 1);
      assert.match(
        promotedPass.result.results[0].screenshot.sha256,
        /^[a-f0-9]{64}$/,
      );
      const promotedShot = await app.inject({
        method: "GET",
        url: `/v1/projects/${demoProject}/ai/test-runs/${promotedPass.id}/screenshots/0`,
        headers,
      });
      assert.equal(promotedShot.statusCode, 200);
      assert.equal(promotedShot.headers["content-type"], "image/png");
      assert.throws(
        () =>
          store.db
            .prepare("UPDATE ai_test_runs SET plan='{}' WHERE id=?")
            .run(promotedPass.id),
        /immutable ai test run/,
      );
      assert.throws(
        () =>
          store.db
            .prepare("UPDATE ai_test_runs SET status='failed' WHERE id=?")
            .run(promotedPass.id),
        /immutable ai test result/,
      );
      assert.equal((await runTest(2)).status, "failed");
      const testRuns = await call(
        "GET",
        `/v1/projects/${demoProject}/ai/test-runs`,
      );
      assert.equal(testRuns.body.runs.length, 2);
      assert.equal(
        (
          await call(
            "GET",
            `/v1/projects/11111111-1111-4111-8111-111111111111/ai/test-runs/${promotedPass.id}`,
          )
        ).status,
        404,
      );
      // Authorization is re-checked at run time: a removed origin blocks the test.
      const sauce = await call("POST", "/v1/ai/authorized-origins", {
        url: "https://www.saucedemo.com/",
      });
      assert.equal(sauce.status, 201);
      const sauceSuiteId = randomUUID();
      store.db.prepare("INSERT INTO ai_suites VALUES (?,?,?,?,?,?)").run(
        sauceSuiteId,
        admin.orgId,
        demoProject,
        queued.body.draftId,
        JSON.stringify({
          title: "Harici hedef",
          targetUrl: "https://www.saucedemo.com/",
          scenarios: [
            {
              title: "Ana sayfa açılır",
              category: "positive",
              actions: [
                { kind: "assertUrl", expected: "https://www.saucedemo.com/" },
              ],
            },
          ],
        }),
        new Date().toISOString(),
      );
      const sauceTest = await call("POST", promoteRoute(sauceSuiteId), {});
      assert.equal(sauceTest.status, 201);
      assert.notEqual(sauceTest.body.test.testId, testId);
      await call("DELETE", `/v1/ai/authorized-origins/${sauce.body.id}`);
      const blockedRun = await call(
        "POST",
        `/v1/projects/${demoProject}/ai/tests/${sauceTest.body.test.testId}/runs`,
        {},
      );
      assert.equal(blockedRun.status, 403);
      assert.equal(blockedRun.body.code, "TARGET_BLOCKED");
      assert.equal(
        (await call("POST", promoteRoute(randomUUID()), {})).status,
        404,
      );
      assert.equal(
        (
          await call("GET", `/v1/projects/${demoProject}/ai/tests`)
        ).body.tests.find(
          (t: { id: string }) => t.id === sauceTest.body.test.testId,
        ).authorized,
        false,
      );
      // A run already queued before the origin was removed is blocked by the worker.
      const lateRunId = randomUUID(),
        latePlan = compilePromoted(sauceTest.body.test);
      store.transaction(() => {
        const now = new Date().toISOString();
        store.db
          .prepare("INSERT INTO ai_test_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            lateRunId,
            admin.orgId,
            demoProject,
            sauceTest.body.test.testId,
            1,
            JSON.stringify(latePlan),
            latePlan.checksum,
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
            lateRunId,
            admin.orgId,
            demoProject,
            "ai_test_run",
            "{}",
            "queued",
            now,
          );
      });
      const lateRun = await until(async () => {
        const response = await call(
          "GET",
          `/v1/projects/${demoProject}/ai/test-runs/${lateRunId}`,
        );
        return ["queued", "running"].includes(response.body.status)
          ? null
          : response.body;
      });
      assert.equal(lateRun.status, "blocked");
      assert.equal(lateRun.result.code, "TARGET_BLOCKED");
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
      assert.equal(explored.draft.inspection.stopped.reason, "done");
      assert.equal(explored.draft.inspection.path[1].secret, true);
      assert.equal(explored.draft.inspection.path[1].value, "••••••");
      assert.equal(explored.draft.inspection.path[0].value, "qa@example.test");
      assert.equal(
        JSON.stringify(explored.draft.inspection).includes(
          "local-fixture-only",
        ),
        false,
      );
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
      assert.equal(invented.draft.status, "ready");
      assert.equal(
        invented.draft.inspection.stopped.reason,
        "value_not_in_prompt",
      );
      assert.equal(invented.draft.inspection.path.length, 0);
      assert.equal(
        invented.draft.inspection.stopped.step.value,
        "invented@example.test",
      );
      assert.equal(
        invented.messages.some((m: { content: string }) =>
          m.content.includes("Keşif erken durdu"),
        ),
        true,
      );
      const failedStep = await analyze(
        "fail-model",
        "qa@example.test ile giriş düğmesini dene",
      );
      assert.equal(failedStep.draft.status, "ready");
      assert.equal(failedStep.draft.inspection.stopped.reason, "step_failed");
      assert.equal(
        failedStep.draft.inspection.stopped.message,
        "Keşif adımı sayfada uygulanamadı.",
      );
      assert.equal(failedStep.draft.inspection.stopped.step.kind, "fill");
      assert.equal(
        failedStep.draft.inspection.stopped.step.locator.value,
        "login-submit",
      );
      const ghost = await analyze("ghost-model", "Giriş sayfasını keşfet");
      assert.equal(ghost.draft.inspection.stopped.reason, "unobserved_locator");
      const looped = await analyze(
        "loop-model",
        "Giriş sayfasındaki alanları keşfet",
      );
      assert.equal(looped.draft.status, "ready");
      assert.equal(
        looped.draft.inspection.path.length,
        explorationLimits.steps,
      );
      assert.equal(looped.draft.inspection.stopped.reason, "limit_steps");
      assert.equal(
        looped.draft.inspection.stopped.message,
        "Keşif adım sınırına ulaşıldı.",
      );
      // Expired leases fail the draft for both AI job kinds.
      for (const [kind, status] of [
        ["ai_analysis", "running"],
        ["ai_generate", "generating"],
      ] as const) {
        const draftId = randomUUID(),
          now = new Date().toISOString();
        store.db
          .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            draftId,
            admin.orgId,
            demoProject,
            queued.body.conversationId,
            saved.body.id,
            "test-model",
            "http://127.0.0.1:4100/login",
            null,
            null,
            status,
            null,
            now,
          );
        store.db
          .prepare(
            "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,lease_token,lease_until,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            kind === "ai_analysis" ? draftId : randomUUID(),
            admin.orgId,
            demoProject,
            kind,
            JSON.stringify({ draftId, prompt: "x" }),
            "running",
            randomUUID(),
            Date.now() - 1000,
            now,
          );
        store.claim();
        assert.deepEqual(
          {
            ...store.db
              .prepare("SELECT status,error_code FROM ai_drafts WHERE id=?")
              .get(draftId),
          },
          { status: "failed", error_code: "WORKER_LEASE_EXPIRED" },
        );
      }
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
          if (p.pid) stopTestProcess(p.pid, "SIGTERM");
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

test(
  "AI observation prefers stable unique locators and flags positional CSS",
  { timeout: 60000 },
  async () => {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><head><title>Locator</title></head><body>
        <main>
          <button data-testid="dup">Sepete ekle</button>
          <button data-testid="dup">Kaldır</button>
          <a data-test="cart" href="#cart">Sepet</a>
          <a data-test="item" href="#a">Ürün A</a><a data-test="item" href="#b">Ürün B</a>
          <input id="email" type="email">
          <input data-test="username" id="user-name" placeholder="Username">
          <label>Parola <input type="password"></label>
          <input type="search" placeholder="Ürün ara">
          <h2>Ürünler</h2>
          <ul><li><span role="button">Seç</span></li><li><span role="button">Seç</span></li></ul>
          <div data-test="card">Sauce   Labs
            Backpack carry.allTheThings() with the sleek, streamlined pack</div>
        </main></body></html>`);
      const observed = await observePage(page);
      const byText = (text: string) =>
        observed.elements.find((e) => e.text === text);
      assert.deepEqual(byText("Sepete ekle")?.locator, {
        kind: "role",
        role: "button",
        value: "Sepete ekle",
      });
      assert.deepEqual(byText("Sepet")?.locator, {
        kind: "css",
        value: '[data-test="cart"]',
      });
      assert.deepEqual(byText("Ürün A")?.locator, {
        kind: "role",
        role: "link",
        value: "Ürün A",
      });
      assert.equal(
        observed.elements.some(
          (e) => e.locator.kind === "id" && e.locator.value === "email",
        ),
        true,
      );
      assert.deepEqual(byText("Parola")?.locator, {
        kind: "label",
        value: "Parola",
      });
      assert.deepEqual(byText("Ürün ara")?.locator, {
        kind: "placeholder",
        value: "Ürün ara",
      });
      // Up to three unique candidates: primary + alternatives (library).
      assert.deepEqual(byText("Username")?.locator, {
        kind: "css",
        value: '[data-test="username"]',
      });
      assert.deepEqual(byText("Username")?.alternatives, [
        { kind: "id", value: "user-name" },
        { kind: "placeholder", value: "Username" },
      ]);
      assert.equal(
        pageForModel(observed).elements.some((e) => "alternatives" in e),
        false,
      );
      const positional = observed.elements.filter((e) => e.text === "Seç");
      assert.equal(positional.length, 2);
      for (const element of positional) {
        assert.equal(element.fragile, true);
        assert.match(element.locator.value, /li:nth-of-type\([12]\) > span$/);
      }
      assert.equal(
        observed.elements
          .filter((e) => !positional.includes(e))
          .every((e) => !e.fragile),
        true,
      );
      assert.equal(
        observed.elements
          .find((e) => e.text.startsWith("Sauce Labs Backpack"))
          ?.text.includes("  "),
        false,
      );
      for (const element of observed.elements)
        if (element.locator.kind === "css")
          assert.equal(await page.locator(element.locator.value).count(), 1);
      assert.equal(
        isFragileLocator({ kind: "css", value: "#a > div:nth-of-type(2)" }),
        true,
      );
      assert.equal(isFragileLocator({ kind: "css", value: "#a > div" }), false);
      assert.equal(
        locatorKey({ value: "Giriş", role: "button", kind: "role" }),
        locatorKey({ kind: "role", role: "button", value: "Giriş" }),
      );
    } finally {
      await browser.close();
    }
  },
);

test("promoted AI test plans are checksummed and PASS needs full evidence", () => {
  const plan = compilePromoted({
    schemaVersion: "ai-test-1.0",
    testId: randomUUID(),
    revision: 1,
    orgId: admin.orgId,
    projectId: demoProject,
    title: "Kanıt kontrolü",
    targetUrl: "http://127.0.0.1:4100/login",
    targetOrigin: "http://127.0.0.1:4100",
    source: {
      suiteId: randomUUID(),
      draftId: randomUUID(),
      conversationId: randomUUID(),
    },
    elements: [],
    scenarios: [
      {
        title: "Giriş sayfası",
        category: "positive",
        actions: [
          { kind: "assertUrl", expected: "http://127.0.0.1:4100/login" },
        ],
      },
    ],
  });
  assert.equal(verifyPlan(plan).scenarios.length, 1);
  assert.throws(
    () => verifyPlan({ ...plan, targetUrl: "http://127.0.0.1:4100/dashboard" }),
    { code: "PLAN_CHECKSUM_MISMATCH" },
  );
  const step = { kind: "assertUrl", status: "passed" };
  const ok = {
    status: "passed",
    results: [{ status: "passed", steps: [step], screenshot: { sha256: "a" } }],
  };
  assert.equal(evidencedPass(plan, ok), true);
  assert.equal(
    evidencedPass(plan, {
      ...ok,
      results: [{ status: "passed", steps: [step] }],
    }),
    false,
  );
  assert.equal(
    evidencedPass(plan, {
      ...ok,
      results: [{ status: "passed", steps: [], screenshot: { sha256: "a" } }],
    }),
    false,
  );
});
test("test variable placeholders resolve, redact and fail clearly", () => {
  const variables = [
    { key: "USER", value: "qa@example.test", secret: false },
    { key: "PASS", value: "s3cr3t-value", secret: true },
  ];
  assert.deepEqual(placeholders("{{USER}} / {{PASS}} / {{lower}}"), [
    "USER",
    "PASS",
  ]);
  assert.equal(
    resolvePlaceholders("{{USER}}:{{PASS}}", variables),
    "qa@example.test:s3cr3t-value",
  );
  assert.throws(() => resolvePlaceholders("{{NOPE}}", variables), {
    code: "MISSING_VARIABLE",
  });
  assert.deepEqual(variablesForModel(variables), [
    { key: "USER", value: "qa@example.test" },
    { key: "PASS", secret: true },
  ]);
  assert.deepEqual(
    redactSecrets({ a: ["x s3cr3t-value y"], b: 1 }, variables),
    { a: ["x {{PASS}} y"], b: 1 },
  );
});
test(
  "project test data: encrypted at rest, hidden from API and provider, resolved only at run time",
  { timeout: 180000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-vars-test-"));
    const previousAllow = process.env.ZC_AI_ALLOW_LOCAL_PROVIDER,
      previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
    process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = "1";
    process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const secret = "local-fixture-only";
    const providerBodies: string[] = [];
    const fill = (value: string, text: string) => ({
      kind: "fill",
      locator: { kind: "testId", value },
      value: text,
    });
    const click = {
      kind: "click",
      locator: { kind: "testId", value: "login-submit" },
    };
    const provider = Fastify();
    provider.post("/v1/chat/completions", async (request) => {
      const raw = JSON.stringify(request.body);
      providerBodies.push(raw);
      const body = request.body as { messages: { content: string }[] };
      if (body.messages[0]?.content.startsWith("You explore")) {
        const state = JSON.parse(body.messages[1]!.content) as {
          path: unknown[];
        };
        const steps = [
          fill("login-email", "{{DEMO_USER}}"),
          fill("login-password", "{{DEMO_PASS}}"),
          click,
        ];
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(
                  steps[state.path.length] ?? { done: true },
                ),
              },
            },
          ],
        };
      }
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Test verisiyle giriş",
                targetUrl: "http://127.0.0.1:4100/login",
                scenarios: [
                  {
                    title: "Kayıtlı test verisiyle giriş",
                    category: "positive",
                    actions: [
                      fill("login-email", "{{DEMO_USER}}"),
                      fill("login-password", "{{DEMO_PASS}}"),
                      click,
                      {
                        kind: "assertVisible",
                        locator: { kind: "testId", value: "dashboard-heading" },
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
    await provider.listen({ host: "127.0.0.1", port: 4252 });
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
      return { status: res.statusCode, body: res.json(), raw: res.body };
    };
    const processes: ChildProcess[] = [];
    const start = (script: string) =>
      processes.push(
        spawn(process.execPath, ["--import", "tsx", script], {
          detached: detachedTestProcess,
          stdio: "ignore",
          env: { ...process.env, ZC_DATA_DIR: dir },
        }),
      );
    const root = `/v1/projects/${demoProject}`;
    try {
      const user = await call("POST", `${root}/test-variables`, {
        key: "DEMO_USER",
        value: "qa@example.test",
        secret: false,
        origin: "http://127.0.0.1:4100/login",
      });
      assert.equal(user.status, 201);
      assert.equal(user.body.origin, "http://127.0.0.1:4100");
      assert.equal(user.body.value, "qa@example.test");
      const pass = await call("POST", `${root}/test-variables`, {
        key: "DEMO_PASS",
        value: secret,
        secret: true,
      });
      assert.equal(pass.status, 201);
      assert.equal(pass.body.value, null);
      assert.equal(pass.raw.includes(secret), false);
      assert.equal(
        (
          await call("POST", `${root}/test-variables`, {
            key: "lower",
            value: "x",
            secret: false,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await call("POST", `${root}/test-variables`, {
            key: "DEMO_PASS",
            value: "x",
            secret: true,
          })
        ).status,
        409,
      );
      // Turning a secret into plain text requires re-entering the value.
      const reveal = await call(
        "PUT",
        `${root}/test-variables/${pass.body.id}`,
        {
          key: "DEMO_PASS",
          secret: false,
        },
      );
      assert.equal(reveal.body.code, "VALUE_REQUIRED");
      const listed = await call("GET", `${root}/test-variables`);
      assert.equal(listed.body.variables.length, 2);
      assert.equal(listed.raw.includes(secret), false);
      const stored = store.db
        .prepare("SELECT value FROM test_variables WHERE id=?")
        .get(pass.body.id)!.value as string;
      assert.equal(stored.includes(secret), false);
      store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      assert.equal(
        readFileSync(join(dir, "zerocode.sqlite")).includes(
          Buffer.from(secret),
        ),
        false,
      );
      const saved = await call("POST", "/v1/ai/providers", {
        name: "Vars provider",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:4252/v1",
        apiKey: "vars-test-key",
        model: "vars-model",
        timeoutMs: 10000,
      });
      assert.equal(saved.status, 201);
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
      const queued = await call("POST", `${root}/ai/messages`, {
        prompt:
          "Demo Bank girişini {{DEMO_USER}} ve {{DEMO_PASS}} ile yap, dashboard görünsün",
        targetUrl: "http://127.0.0.1:4100/login",
        providerId: saved.body.id,
        model: "vars-model",
      });
      assert.equal(queued.status, 202);
      const detail = await until(async () => {
        const response = await call(
          "GET",
          `${root}/ai/conversations/${queued.body.conversationId}`,
        );
        if (response.body.drafts[0]?.status === "failed")
          throw new Error(response.body.drafts[0].error_code);
        return response.body.drafts[0]?.status === "ready"
          ? response.body
          : null;
      });
      const draft = detail.drafts[0];
      // Login only succeeds when the worker filled the resolved values.
      assert.equal(draft.inspection.stopped.reason, "done");
      assert.equal(draft.inspection.path.length, 3);
      assert.equal(draft.inspection.path[1].value, "{{DEMO_PASS}}");
      assert.match(draft.inspection.path[2].to, /\/dashboard$/);
      assert.equal(
        draft.definition.scenarios[0].actions[1].value,
        "{{DEMO_PASS}}",
      );
      const explore = providerBodies.find((b) => b.includes("You explore"))!;
      assert.equal(explore.includes("DEMO_USER"), true);
      assert.equal(explore.includes("qa@example.test"), true);
      assert.equal(explore.includes("DEMO_PASS"), true);
      const suite = await call(
        "POST",
        `${root}/ai/drafts/${queued.body.draftId}/save`,
        draft.definition,
      );
      assert.equal(suite.status, 201);
      const runSuite = async (id: string) => {
        const run = await call("POST", `${root}/ai/suites/${id}/runs`, {});
        assert.equal(run.status, 202);
        return until(async () => {
          const response = await call("GET", `${root}/ai/runs/${run.body.id}`);
          return ["queued", "running"].includes(response.body.status)
            ? null
            : response;
        });
      };
      const passed = await runSuite(suite.body.id);
      assert.equal(passed.body.status, "passed");
      assert.equal(passed.raw.includes(secret), false);
      const promoted = await call(
        "POST",
        `${root}/ai/suites/${suite.body.id}/promote`,
        {},
      );
      assert.equal(promoted.status, 201);
      const testId = promoted.body.test.testId as string;
      const runTest = async () => {
        const run = await call("POST", `${root}/ai/tests/${testId}/runs`, {
          revision: 1,
        });
        assert.equal(run.status, 202);
        return until(async () => {
          const response = await call(
            "GET",
            `${root}/ai/test-runs/${run.body.id}`,
          );
          return ["queued", "running"].includes(response.body.status)
            ? null
            : response;
        });
      };
      const promotedPass = await runTest();
      assert.equal(promotedPass.body.status, "passed");
      assert.equal(promotedPass.raw.includes(secret), false);
      assert.equal(promotedPass.raw.includes("{{DEMO_PASS}}"), true);
      // A new value is used by the next run; the published version is unchanged.
      const before = await call("GET", `${root}/ai/tests/${testId}/versions/1`);
      assert.equal(
        (
          await call("PUT", `${root}/test-variables/${pass.body.id}`, {
            key: "DEMO_PASS",
            value: "wrong-password",
            secret: true,
          })
        ).status,
        200,
      );
      const after = await call("GET", `${root}/ai/tests/${testId}/versions/1`);
      assert.equal(after.body.checksum, before.body.checksum);
      assert.deepEqual(after.body.test, before.body.test);
      const wrong = await runTest();
      assert.equal(wrong.body.status, "failed");
      // Missing variable: a clear step error, never a PASS.
      const missing = structuredClone(draft.definition);
      missing.scenarios[0].actions[0].value = "{{NOT_DEFINED}}";
      const missingSuite = await call(
        "POST",
        `${root}/ai/drafts/${queued.body.draftId}/save`,
        missing,
      );
      assert.equal(missingSuite.status, 201);
      const failed = await runSuite(missingSuite.body.id);
      assert.equal(failed.body.status, "failed");
      const step = failed.body.result.results[0].steps[0];
      assert.equal(step.code, "MISSING_VARIABLE");
      assert.match(step.message, /NOT_DEFINED/);
      assert.ok(providerBodies.length >= 4);
      for (const body of providerBodies)
        assert.equal(body.includes(secret), false);
      assert.equal(
        providerBodies.some((b) => b.includes("wrong-password")),
        false,
      );
    } finally {
      for (const p of processes)
        try {
          if (p.pid) stopTestProcess(p.pid, "SIGTERM");
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

test(
  "Page-quality assertions report console, link and accessibility findings",
  { timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-quality-"));
    const fixture = spawn(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/server.ts"],
      { detached: detachedTestProcess, stdio: "ignore" },
    );
    const browser = await launchBrowser();
    try {
      await until(
        async () =>
          await fetch("http://127.0.0.1:4100/health").then(
            (r) => r.ok,
            () => false,
          ),
        10000,
      );
      const scenario = (
        page: string,
        actions: unknown[],
        category = "positive",
      ) => ({
        title: `Quality ${page}`,
        category,
        actions,
      });
      const suite = (page: string, actions: unknown[]) =>
        aiSuiteSchema.parse({
          title: `Quality ${page}`,
          targetUrl: `http://127.0.0.1:4100/quality/${page}`,
          scenarios: [scenario(page, actions)],
        });
      const run = async (page: string, actions: unknown[]) =>
        (
          await executeSuite(
            browser,
            suite(page, actions),
            join(dir, page + actions.length),
          )
        ).results[0]!;
      const checks = [
        { kind: "assertNoConsoleErrors" },
        { kind: "assertNoBrokenLinks" },
        { kind: "assertAccessible" },
      ];

      const clean = await run("clean", checks);
      assert.equal(clean.status, "passed");
      assert.equal(clean.steps.length, 3);
      for (const step of clean.steps) {
        assert.equal(step.status, "passed");
        assert.ok(step.screenshot?.sha256);
        assert.equal(step.findings?.items.length, 0);
      }
      // Self link (hash stripped) and /health; external link is skipped.
      assert.equal(clean.steps[1]!.findings!.checked, 2);

      const consoleRun = await run("console", [checks[0]]);
      assert.equal(consoleRun.status, "failed");
      assert.equal(consoleRun.steps[0]!.code, "ASSERTION_FAILED");
      const texts = consoleRun.steps[0]!.findings!.items.map((i) => i.text);
      assert.ok(texts.some((t) => t.includes("fixture console failure")));
      assert.ok(texts.some((t) => t.includes("fixture uncaught")));
      assert.ok(consoleRun.steps[0]!.screenshot?.sha256);
      const ignored = await run("console", [
        { kind: "assertNoConsoleErrors", ignore: ["fixture"] },
      ]);
      assert.equal(ignored.status, "passed");
      assert.equal(ignored.steps[0]!.findings!.checked, 2);

      const links = await run("links", [checks[1]]);
      assert.equal(links.status, "failed");
      assert.deepEqual(links.steps[0]!.findings!.items, [
        {
          target: "http://127.0.0.1:4100/quality/missing",
          status: 404,
          text: "HTTP 404",
        },
      ]);

      const a11y = await run("a11y", [checks[2]]);
      assert.equal(a11y.status, "failed");
      const ids = a11y.steps[0]!.findings!.items.map((i) => i.id);
      assert.ok(ids.includes("image-alt"));
      assert.ok(ids.includes("label"));
      const item = a11y.steps[0]!.findings!.items[0]!;
      assert.ok(item.impact && item.target && item.text);
      // Library references resolve from the pinned binding only.
      const refSuite = suite("clean", [
        { kind: "fill", element: "search.query", value: "abc" },
        { kind: "assertVisible", element: "search.query" },
      ]);
      const bound = await executeSuite(
        browser,
        refSuite,
        join(dir, "ref-ok"),
        [],
        [],
        {
          "search.query": {
            elementKey: "search.query",
            revision: 2,
            name: "Arama",
            locator: { kind: "id", value: "q" },
          },
        },
      );
      assert.equal(bound.status, "passed");
      assert.equal(bound.results[0]!.steps[0]!.element, "search.query");
      assert.equal(bound.results[0]!.steps[0]!.elementName, "Arama");
      assert.equal(bound.results[0]!.steps[0]!.elementRevision, 2);
      for (const resolution of [
        {} as Record<string, { unavailable: string }>,
        { "search.query": { unavailable: "unapproved" } },
      ]) {
        const unavailable = await executeSuite(
          browser,
          refSuite,
          join(dir, `ref-${Object.keys(resolution).length}`),
          [],
          [],
          resolution,
        );
        assert.equal(unavailable.status, "failed");
        assert.equal(
          unavailable.results[0]!.steps[0]!.code,
          "ELEMENT_UNAVAILABLE",
        );
        assert.equal(unavailable.results[0]!.steps.length, 1);
      }
      // Promotion accepts locator-free checks; a failed check never PASSes.
      const promoted = buildPromotedTest({
        testId: randomUUID(),
        revision: 1,
        orgId: admin.orgId,
        projectId: demoProject,
        suite: suite("clean", checks),
        inspection: { pages: [] },
        source: {
          suiteId: randomUUID(),
          draftId: randomUUID(),
          conversationId: randomUUID(),
        },
      });
      assert.equal(promoted.elements.length, 0);
      const plan = compilePromoted(promoted);
      assert.equal(
        evidencedPass(plan, { status: "passed", results: [clean] }),
        true,
      );
      assert.equal(
        evidencedPass(plan, {
          status: "passed",
          results: [
            {
              ...clean,
              steps: clean.steps.map((s, i) =>
                i === 2 ? { ...s, status: "failed" } : s,
              ),
            },
          ],
        }),
        false,
      );
      // Schema limits: at most 5 ignore entries, no unknown impact.
      assert.equal(
        aiSuiteSchema.safeParse({
          title: "Too many",
          targetUrl: "http://127.0.0.1:4100/quality/clean",
          scenarios: [
            scenario("clean", [
              {
                kind: "assertNoConsoleErrors",
                ignore: ["a", "b", "c", "d", "e", "f"],
              },
            ]),
          ],
        }).success,
        false,
      );
      assert.equal(
        aiSuiteSchema.safeParse({
          title: "Bad impact",
          targetUrl: "http://127.0.0.1:4100/quality/clean",
          scenarios: [
            scenario("clean", [{ kind: "assertAccessible", impact: "minor" }]),
          ],
        }).success,
        false,
      );
    } finally {
      await browser.close();
      try {
        if (fixture.pid) stopTestProcess(fixture.pid, "SIGTERM");
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "model comparison explores once and reports per-model generation metrics",
  { timeout: 180000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-compare-test-"));
    const previousAllow = process.env.ZC_AI_ALLOW_LOCAL_PROVIDER,
      previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
    process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = "1";
    process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const testId = (value: string) => ({ kind: "testId", value });
    const fill = (value: string, text: string) => ({
      kind: "fill",
      locator: testId(value),
      value: text,
    });
    const click = { kind: "click", locator: testId("login-submit") };
    const login = [
      fill("login-email", "qa@example.test"),
      fill("login-password", "local-fixture-only"),
      click,
    ];
    const suite = (title: string, extra: unknown[] = []) => ({
      title,
      targetUrl: "http://127.0.0.1:4100/login",
      scenarios: [
        {
          title: "Geçerli giriş dashboard'u açar",
          category: "positive",
          actions: [
            ...login,
            { kind: "assertVisible", locator: testId("dashboard-heading") },
            { kind: "assertUrl", expected: "http://127.0.0.1:4100/dashboard" },
            ...extra,
          ],
        },
      ],
    });
    let explorations = 0;
    const generateCalls: Record<string, number> = {};
    const provider = Fastify();
    provider.get("/v1/models", async () => ({
      data: [{ id: "good-model" }, { id: "fixed-model" }, { id: "bad-model" }],
    }));
    provider.post("/v1/chat/completions", async (request) => {
      const body = request.body as {
        model: string;
        messages: { content: string }[];
      };
      const reply = (content: string, usage?: unknown) => ({
        choices: [{ message: { content } }],
        ...(usage ? { usage } : {}),
      });
      if (body.messages[0]?.content.startsWith("You explore")) {
        const state = JSON.parse(body.messages[1]!.content) as {
          path: unknown[];
        };
        if (!state.path.length) explorations++;
        return reply(
          JSON.stringify(login[state.path.length] ?? { done: true }),
        );
      }
      const call = (generateCalls[body.model] =
        (generateCalls[body.model] ?? 0) + 1);
      if (body.model === "good-model")
        return reply(JSON.stringify(suite("Good suite")), {
          prompt_tokens: 1000,
          completion_tokens: 200,
          total_tokens: 1200,
        });
      if (body.model === "fixed-model")
        return call === 1
          ? reply('{"title":"Eksik suite"}', {
              prompt_tokens: 900,
              completion_tokens: 10,
              total_tokens: 910,
            })
          : reply(
              JSON.stringify(
                suite("Fixed suite", [
                  {
                    kind: "assertText",
                    locator: testId("dashboard-balance"),
                    expected: "1.250,00 TL",
                  },
                ]),
              ),
              {
                prompt_tokens: 950,
                completion_tokens: 220,
                total_tokens: 1170,
              },
            );
      // bad-model never matches the schema and returns no usage.
      return reply('{"title":"Eksik suite"}');
    });
    await provider.listen({ host: "127.0.0.1", port: 4253 });
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
      return { status: res.statusCode, body: res.json(), raw: res.body };
    };
    const processes: ChildProcess[] = [];
    const start = (script: string) =>
      processes.push(
        spawn(process.execPath, ["--import", "tsx", script], {
          detached: detachedTestProcess,
          stdio: "ignore",
          env: { ...process.env, ZC_DATA_DIR: dir },
        }),
      );
    const root = `/v1/projects/${demoProject}/ai`;
    try {
      const saved = await call("POST", "/v1/ai/providers", {
        name: "Compare provider",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:4253/v1",
        apiKey: "compare-test-key",
        model: "good-model",
        timeoutMs: 10000,
      });
      assert.equal(saved.status, 201);
      const providerId = saved.body.id as string;
      // Saved provider's models are listed with the stored key.
      const listed = await call("GET", `/v1/ai/providers/${providerId}/models`);
      assert.deepEqual(listed.body.models, [
        "good-model",
        "fixed-model",
        "bad-model",
      ]);
      assert.equal(listed.raw.includes("compare-test-key"), false);
      const prompt =
        "Demo Bank girişini qa@example.test ve local-fixture-only ile yap, dashboard görünsün";
      const entry = (model: string) => ({ providerId, model });
      // Cost guard and input checks.
      const four = await call("POST", `${root}/comparisons`, {
        prompt,
        targetUrl: "http://127.0.0.1:4100/login",
        models: ["a", "b", "c", "d"].map(entry),
      });
      assert.equal(four.status, 400);
      const one = await call("POST", `${root}/comparisons`, {
        prompt,
        targetUrl: "http://127.0.0.1:4100/login",
        models: [entry("good-model")],
      });
      assert.equal(one.status, 400);
      const duplicate = await call("POST", `${root}/comparisons`, {
        prompt,
        targetUrl: "http://127.0.0.1:4100/login",
        models: [entry("good-model"), entry("good-model")],
      });
      assert.equal(duplicate.body.code, "DUPLICATE_MODEL");
      const blocked = await call("POST", `${root}/comparisons`, {
        prompt,
        targetUrl: "https://example.com/login",
        models: [entry("good-model"), entry("bad-model")],
      });
      assert.equal(blocked.body.code, "TARGET_BLOCKED");

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
      const queued = await call("POST", `${root}/comparisons`, {
        prompt,
        targetUrl: "http://127.0.0.1:4100/login",
        models: [entry("good-model"), entry("fixed-model"), entry("bad-model")],
      });
      assert.equal(queued.status, 202);
      assert.equal(queued.body.draftIds.length, 3);
      const comparison = await until(async () => {
        const view = await call("GET", `${root}/comparisons/${queued.body.id}`);
        return view.body.entries.every((e: { status: string }) =>
          ["ready", "failed"].includes(e.status),
        )
          ? view.body
          : null;
      });
      // One exploration (one browser session, one analysis job) for all models.
      assert.equal(explorations, 1);
      assert.equal(comparison.exploration.runs, 1);
      assert.equal(comparison.exploration.status, "done");
      assert.equal(comparison.exploration.steps, 3);
      assert.equal(
        (
          store.db
            .prepare(
              "SELECT count(*) AS n FROM jobs WHERE kind='ai_generate' AND json_extract(payload,'$.draftId') IN (?,?,?)",
            )
            .get(...(queued.body.draftIds as [string, string, string])) as {
            n: number;
          }
        ).n,
        3,
      );
      const [good, fixed, bad] = comparison.entries;
      assert.equal(good.model, "good-model");
      assert.equal(good.providerName, "Compare provider");
      assert.equal(good.status, "ready");
      assert.equal(good.schema, "first_try");
      assert.equal(good.attempts, 1);
      assert.equal(good.scenarios, 1);
      assert.equal(good.actions, 5);
      assert.equal(good.assertions, 2);
      assert.equal(good.fragileLocators, 0);
      assert.deepEqual(good.usage, {
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
      });
      assert.equal(typeof good.durationMs, "number");
      assert.equal(fixed.status, "ready");
      assert.equal(fixed.schema, "corrected");
      assert.equal(fixed.attempts, 2);
      assert.equal(fixed.actions, 6);
      assert.equal(fixed.assertions, 3);
      assert.deepEqual(fixed.usage, {
        promptTokens: 1850,
        completionTokens: 230,
        totalTokens: 2080,
      });
      assert.equal(bad.status, "failed");
      assert.equal(bad.errorCode, "PROVIDER_FORMAT");
      assert.equal(bad.schema, "invalid");
      assert.equal(bad.attempts, 2);
      assert.equal(bad.usage, null);
      assert.equal(bad.scenarios, null);
      assert.deepEqual(generateCalls, {
        "good-model": 1,
        "fixed-model": 2,
        "bad-model": 2,
      });
      // All drafts share the one inspection; the conversation carries the view.
      const detail = await call(
        "GET",
        `${root}/conversations/${queued.body.conversationId}`,
      );
      assert.equal(detail.body.comparison.id, queued.body.id);
      assert.equal(detail.body.drafts.length, 3);
      assert.equal(
        new Set(
          detail.body.drafts
            .filter((d: { inspection: unknown }) => d.inspection)
            .map((d: { inspection: unknown }) => JSON.stringify(d.inspection)),
        ).size,
        1,
      );
      // Human approval stays per draft; the table then shows the latest run.
      const draft = detail.body.drafts.find(
        (d: { id: string }) => d.id === good.draftId,
      );
      const approved = await call(
        "POST",
        `${root}/drafts/${good.draftId}/save`,
        draft.definition,
      );
      assert.equal(approved.status, 201);
      const run = await call(
        "POST",
        `${root}/suites/${approved.body.id}/runs`,
        {},
      );
      assert.equal(run.status, 202);
      const finished = await until(async () => {
        const view = await call("GET", `${root}/comparisons/${queued.body.id}`);
        const latest = view.body.entries[0].latestRun;
        return latest && !["queued", "running"].includes(latest.status)
          ? view.body
          : null;
      });
      assert.equal(finished.entries[0].suiteId, approved.body.id);
      assert.deepEqual(finished.entries[0].latestRun, {
        id: run.body.id,
        status: "passed",
        passed: 1,
        failed: 0,
        skipped: 0,
      });
      assert.equal(finished.entries[1].latestRun, null);
      // Comparisons are project scoped.
      assert.equal(
        (
          await call(
            "GET",
            `/v1/projects/${demoProject}/ai/comparisons/${queued.body.conversationId}`,
          )
        ).status,
        404,
      );
    } finally {
      for (const p of processes)
        try {
          if (p.pid) stopTestProcess(p.pid, "SIGTERM");
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

test("exploration failure fails every compared draft", () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-compare-fail-"));
  const store = new Store(join(dir, "zerocode.sqlite"));
  try {
    const now = new Date().toISOString();
    store.db
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run("c1", admin.orgId, demoProject, "t", now);
    store.db
      .prepare("INSERT INTO ai_comparisons VALUES (?,?,?,?,?,?)")
      .run("k1", admin.orgId, demoProject, "c1", "http://127.0.0.1:4100/", now);
    for (const [i, id] of ["d1", "d2", "d3"].entries()) {
      store.db
        .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          admin.orgId,
          demoProject,
          "c1",
          "p",
          `m${i}`,
          "http://127.0.0.1:4100/",
          null,
          null,
          i ? "queued" : "running",
          null,
          now,
        );
      store.db
        .prepare("INSERT INTO ai_comparison_drafts VALUES (?,?,?,?)")
        .run(id, "k1", admin.orgId, i);
    }
    store.failDraft("d1", admin.orgId, "TARGET_UNREACHABLE");
    const rows = store.db
      .prepare("SELECT status,error_code FROM ai_drafts ORDER BY id")
      .all() as { status: string; error_code: string }[];
    assert.deepEqual(
      rows.map((r) => [r.status, r.error_code]),
      Array(3).fill(["failed", "TARGET_UNREACHABLE"]),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("suite limits allow 10 scenarios, cap total actions and fit the lease", () => {
  const scenario = (title: string, actions = 1) => ({
    title,
    category: "negative",
    actions: Array.from({ length: actions }, () => ({
      kind: "assertUrl",
      expected: "https://www.saucedemo.com/",
    })),
  });
  const suite = (scenarios: unknown[]) => ({
    title: "Login senaryoları",
    targetUrl: "https://www.saucedemo.com/",
    scenarios,
  });
  const ten = Array.from({ length: 10 }, (_, i) => scenario(`Senaryo ${i}`));
  assert.equal(aiSuiteSchema.safeParse(suite(ten)).success, true);
  const eleven = aiSuiteSchema.safeParse(
    suite([...ten, scenario("Fazla senaryo")]),
  );
  assert.equal(eleven.success, false);
  assert.equal(eleven.error?.issues[0]?.code, "too_big");
  const long =
    "Kilitli kullanıcı girişinde beklenen hata mesajı görünür ".repeat(2);
  assert.equal(long.trim().length > 100, true);
  assert.equal(aiSuiteSchema.safeParse(suite([scenario(long)])).success, true);
  assert.equal(
    aiSuiteSchema.safeParse(
      suite([scenario("x".repeat(suiteLimits.scenarioTitleLength + 1))]),
    ).success,
    false,
  );
  // 7 × 20 = 140 actions exceeds the 120 per-suite budget.
  const heavy = aiSuiteSchema.safeParse(
    suite(Array.from({ length: 7 }, (_, i) => scenario(`Ağır ${i}`, 20))),
  );
  assert.equal(heavy.success, false);
  assert.equal(heavy.error?.issues[0]?.message, "too_many_actions");
  assert.equal(
    aiSuiteSchema.safeParse(
      suite(Array.from({ length: 6 }, (_, i) => scenario(`Orta ${i}`, 20))),
    ).success,
    true,
  );
  assert.equal(suiteLeaseMs(1), 180000);
  // A checkout flow needs six pages and about a dozen steps.
  assert.equal(explorationLimits.pages >= 6, true);
  assert.equal(explorationLimits.steps >= 12, true);
  assert.equal(explorationLeaseMs(90000) >= explorationLimits.ms + 90000, true);
  assert.equal(explorationLeaseMs(1000), 180000);
  assert.equal(
    suiteLeaseMs(suiteLimits.scenarios) >=
      suiteLimits.scenarios * scenarioTimeoutMs,
    true,
  );
});

test("lease extension only applies to the job holding the lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-lease-test-"));
  const store = new Store(join(dir, "db.sqlite"));
  try {
    const now = new Date().toISOString();
    store.db
      .prepare(
        "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        admin.orgId,
        demoProject,
        "discovery",
        "{}",
        "queued",
        now,
      );
    const job = store.claim()!;
    const before = job.lease_until;
    assert.equal(store.extendLease(job, suiteLeaseMs(10)), true);
    assert.equal(job.lease_until > before, true);
    assert.equal(
      store.extendLease({ ...job, lease_token: randomUUID() }, 400000),
      false,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generateSuite retries an empty reply once and states the limits", async () => {
  const previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
  process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const replies: unknown[] = [];
  const prompts: string[] = [];
  const server = Fastify();
  server.post("/v1/chat/completions", async (request) => {
    const body = request.body as { messages: { content: string }[] };
    prompts.push(body.messages[0]!.content);
    return replies.shift();
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address() as { port: number };
  const provider = {
    id: randomUUID(),
    name: "Mock",
    kind: "openai-compatible",
    base_url: `http://127.0.0.1:${address.port}/v1`,
    encrypted_key: encrypt("mock-key"),
    model: "mock",
    timeout_ms: 5000,
    active: 1,
  };
  const target = new URL("https://www.saucedemo.com/");
  const inspection = {
    pages: [
      {
        title: "Swag Labs",
        url: target.href,
        elements: [
          {
            kind: "button",
            text: "Login",
            locator: { kind: "testId", value: "login-button" },
          },
        ],
      },
    ],
    path: [],
  };
  const valid = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: "Login",
            targetUrl: target.href,
            scenarios: [
              {
                title: "Giriş butonu görünür",
                category: "positive",
                actions: [
                  {
                    kind: "assertVisible",
                    locator: { kind: "testId", value: "login-button" },
                  },
                ],
              },
            ],
          }),
        },
      },
    ],
  };
  const empty = {
    choices: [{ message: { content: "", reasoning_content: "thinking" } }],
  };
  try {
    replies.push(empty, valid);
    const metrics = newGenerationMetrics();
    const suite = await generateSuite(
      provider,
      "mock",
      "login senaryoları",
      target,
      inspection,
      undefined,
      [],
      metrics,
    );
    assert.equal(suite.scenarios.length, 1);
    assert.equal(metrics.attempts, 2);
    assert.match(prompts[0]!, /at most 10 scenarios/);
    assert.match(prompts[0]!, /at most 120 actions in the whole suite/);
    // An empty retry does not consume the schema correction attempt.
    replies.push(empty, { choices: [{ message: { content: "{}" } }] }, valid);
    const corrected = newGenerationMetrics();
    await generateSuite(
      provider,
      "mock",
      "login senaryoları",
      target,
      inspection,
      undefined,
      [],
      corrected,
    );
    assert.equal(corrected.attempts, 3);
    // A second empty reply is a real PROVIDER_EMPTY.
    replies.push(empty, empty);
    await assert.rejects(
      generateSuite(provider, "mock", "x", target, inspection),
      (error: { code?: string }) => error.code === "PROVIDER_EMPTY",
    );
  } finally {
    await server.close();
    if (previousKey === undefined) delete process.env.ZC_AI_ENCRYPTION_KEY;
    else process.env.ZC_AI_ENCRYPTION_KEY = previousKey;
  }
});

const shopPage = "https://shop.example.test/index.html";
function libraryFixture() {
  const dir = mkdtempSync(join(tmpdir(), "zc-library-"));
  const store = new Store(join(dir, "test.sqlite"));
  return { dir, store };
}
test("element library links re-observations, keeps approvals and versions edits", async () => {
  const { dir, store } = libraryFixture();
  const app = await createApp(store);
  try {
    const headers = (user = admin) => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(id, JSON.stringify(user), Date.now() + 60000);
      return {
        host: "127.0.0.1:4000",
        cookie: `zc_session=${id}`,
        origin: "http://127.0.0.1:3000",
        "x-zerocode-client": "local-ui",
      };
    };
    const call = async (
      method: "GET" | "PUT",
      url: string,
      payload?: unknown,
      user = admin,
    ) => {
      const response = await app.inject({
        method,
        url,
        headers: headers(user),
        ...(payload ? { payload: payload as object } : {}),
      });
      return { status: response.statusCode, body: response.json() };
    };
    const route = `/v1/projects/${demoProject}/ai/elements`;
    const username = {
      tag: "input",
      text: "Username",
      role: "textbox",
      type: "text",
      locator: { kind: "css", value: '[data-test="username"]' },
      alternatives: [
        { kind: "id", value: "user-name" },
        { kind: "placeholder", value: "Username" },
      ],
    };
    const first = recordObservedElements(
      store.db,
      admin.orgId,
      demoProject,
      [
        {
          url: `${shopPage}?session=1#top`,
          elements: [
            username,
            {
              tag: "button",
              text: "Login",
              role: "button",
              type: "submit",
              locator: { kind: "css", value: '[data-test="login-button"]' },
              alternatives: [{ kind: "id", value: "login-button" }],
            },
            {
              tag: "input",
              text: "Username",
              role: "textbox",
              type: "text",
              locator: { kind: "id", value: "other-user" },
            },
          ],
        },
      ],
      "2026-10-21T10:00:00.000Z",
    );
    assert.deepEqual(first, { created: 3, matched: 0 });
    const list = async (query = "") =>
      (await call("GET", `${route}${query}`)).body;
    const initial = await list();
    assert.equal(initial.total, 3);
    const byKey = (body: { elements: { elementKey: string }[] }, key: string) =>
      body.elements.find((e) => e.elementKey === key) as Record<string, any>;
    // Key suggestion: <page>.<label>, collisions get a suffix.
    const user = byKey(initial, "index.username");
    assert.ok(user);
    assert.ok(byKey(initial, "index.username_2"));
    assert.ok(byKey(initial, "index.login"));
    assert.equal(user.pageKey, "index");
    assert.equal(user.origin, "https://shop.example.test");
    assert.equal(user.pageUrl, shopPage);
    assert.deepEqual(user.alternatives, username.alternatives);
    assert.equal(user.approved, false);
    assert.equal(user.revision, 1);
    // Re-observation through an alternative links to the same element.
    const again = recordObservedElements(
      store.db,
      admin.orgId,
      demoProject,
      [
        {
          url: shopPage,
          elements: [
            {
              ...username,
              locator: { kind: "id", value: "user-name" },
              alternatives: [
                { kind: "role", role: "textbox", value: "Username" } as never,
              ],
            },
          ],
        },
      ],
      "2026-10-21T11:00:00.000Z",
    );
    assert.deepEqual(again, { created: 0, matched: 1 });
    const linked = byKey(await list(), "index.username");
    assert.equal(linked.id, user.id);
    assert.equal(linked.lastSeenAt, "2026-10-21T11:00:00.000Z");
    assert.equal(linked.alternatives.length, 3);
    assert.equal((await list()).total, 3);
    // Name, key, page and approval in one revision.
    const put = (body: Record<string, unknown>, who = admin) =>
      call("PUT", `${route}/${user.id}`, body, who);
    const edit = {
      expectedRevision: 1,
      elementKey: "login.username",
      name: "Kullanıcı adı",
      pageKey: "login",
      locator: linked.locator,
      alternatives: linked.alternatives,
      approved: true,
    };
    assert.equal((await put(edit, { ...admin, role: "viewer" })).status, 403);
    const approved = await put(edit);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.element.revision, 2);
    assert.equal(approved.body.element.approved, true);
    assert.equal(approved.body.approvalCleared, false);
    assert.deepEqual(
      approved.body.history.map((h: { revision: number; action: string }) => [
        h.revision,
        h.action,
      ]),
      [
        [2, "approved"],
        [1, "observed"],
      ],
    );
    // Stale revision is a conflict.
    const stale = await put({ ...edit, name: "Başka" });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "REVISION_CONFLICT");
    // Approved element is not altered by re-observation.
    recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [
          {
            ...username,
            text: "Kullanıcı",
            alternatives: [{ kind: "label", value: "User" }],
          },
        ],
      },
    ]);
    const kept = byKey(await list(), "login.username");
    assert.equal(kept.id, user.id);
    assert.equal(kept.approved, true);
    assert.equal(kept.revision, 2);
    assert.equal(kept.name, "Kullanıcı adı");
    assert.equal(kept.label, "Username");
    assert.deepEqual(kept.locator, linked.locator);
    // New candidates of an approved element are only suggestions.
    assert.equal(kept.alternatives.length, 3);
    assert.deepEqual(kept.suggestedAlternatives, [
      { kind: "label", value: "User" },
    ]);
    // The key of an approved element is locked; keys are unique per origin.
    const locked = await put({
      ...edit,
      expectedRevision: 2,
      elementKey: "x.y",
    });
    assert.equal(locked.body.code, "ELEMENT_KEY_LOCKED");
    const login = byKey(await list(), "index.login");
    const taken = await call("PUT", `${route}/${login.id}`, {
      expectedRevision: 1,
      elementKey: "login.username",
      name: "Giriş",
      pageKey: "login",
      locator: login.locator,
      alternatives: login.alternatives,
      approved: false,
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.code, "ELEMENT_KEY_EXISTS");
    const duplicate = await put({
      ...edit,
      expectedRevision: 2,
      alternatives: [kept.locator],
    });
    assert.equal(duplicate.body.code, "DUPLICATE_LOCATOR");
    // Making an alternative primary clears approval.
    const swapped = await put({
      ...edit,
      expectedRevision: 2,
      locator: kept.alternatives[0],
      alternatives: [kept.locator, ...kept.alternatives.slice(1)],
    });
    assert.equal(swapped.status, 200);
    assert.equal(swapped.body.element.approved, false);
    assert.equal(swapped.body.approvalCleared, true);
    assert.equal(swapped.body.element.revision, 3);
    assert.deepEqual(swapped.body.element.locator, {
      kind: "id",
      value: "user-name",
    });
    assert.equal(swapped.body.history[0].action, "locator_changed");
    assert.equal((await list("?approved=true")).total, 0);
    const reapproved = await put({
      ...edit,
      expectedRevision: 3,
      locator: swapped.body.element.locator,
      alternatives: swapped.body.element.alternatives,
    });
    assert.equal(reapproved.body.element.approved, true);
    assert.equal((await list("?approved=true")).total, 1);
    assert.equal((await list("?approved=false")).total, 2);
    assert.equal((await list("?q=login.user")).total, 1);
    const detail = await call("GET", `${route}/${user.id}`);
    assert.equal(detail.body.history.length, 4);
    assert.equal((await call("GET", `${route}/${randomUUID()}`)).status, 404);
    // History is immutable.
    assert.throws(
      () =>
        store.db
          .prepare(
            "UPDATE ai_element_revisions SET name='x' WHERE element_id=?",
          )
          .run(user.id),
      /immutable ai element revision/,
    );
    assert.throws(
      () =>
        store.db
          .prepare("DELETE FROM ai_element_revisions WHERE element_id=?")
          .run(user.id),
      /immutable ai element revision/,
    );
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("migration 009 keeps elements saved before the library", () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-migrate-"));
  const path = join(dir, "old.sqlite");
  try {
    const old = new DatabaseSync(path);
    for (const file of [
      "001_initial.sql",
      "002_locator_checks.sql",
      "003_ai_assistant.sql",
      "004_authorized_targets.sql",
      "005_ai_elements.sql",
      "006_ai_tests.sql",
      "007_test_variables.sql",
      "008_ai_comparisons.sql",
    ])
      old.exec(readFileSync(join("infra/migrations", file), "utf8"));
    old
      .prepare("INSERT OR IGNORE INTO projects VALUES (?,?,?)")
      .run(demoProject, admin.orgId, "ZeroCode Demo");
    const insert = old.prepare(
      "INSERT INTO ai_page_elements VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    const rows = [
      [
        randomUUID(),
        "https://www.saucedemo.com/",
        "input",
        "Username",
        "",
        "text",
        "id",
        "user-name",
      ],
      [
        randomUUID(),
        "https://www.saucedemo.com/",
        "input",
        "Username",
        "textbox",
        "text",
        "css",
        '[data-test="username"]',
      ],
      [
        randomUUID(),
        "https://www.saucedemo.com/inventory.html",
        "button",
        "Add to cart",
        "button",
        "",
        "role",
        "Add to cart",
      ],
    ];
    rows.forEach((row, index) =>
      insert.run(
        row[0]!,
        admin.orgId,
        demoProject,
        row[1]!,
        row[2]!,
        row[3]!,
        row[4]!,
        row[5]!,
        row[6]!,
        row[7]!,
        `2026-10-2${index}T00:00:00.000Z`,
        `2026-10-2${index}T00:00:00.000Z`,
      ),
    );
    old.close();
    for (let open = 0; open < 2; open++) {
      const store = new Store(path);
      const migrated = store.db
        .prepare("SELECT * FROM ai_page_elements ORDER BY first_seen_at")
        .all() as Record<string, unknown>[];
      assert.deepEqual(
        migrated.map((row) => row.id),
        rows.map((row) => row[0]),
      );
      assert.deepEqual(
        migrated.map((row) => row.element_key),
        ["home.username", "home.username_2", "inventory.add_to_cart"],
      );
      assert.equal(migrated[0]!.origin, "https://www.saucedemo.com");
      assert.equal(migrated[2]!.locator_role, "button");
      assert.equal(migrated[1]!.label, "Username");
      assert.equal(
        migrated.every((row) => row.approved === 0 && row.revision === 1),
        true,
      );
      assert.ok(
        store.db
          .prepare("SELECT 1 FROM schema_migrations WHERE version=9")
          .get(),
      );
      // Old rows are matched by later observations, not duplicated.
      recordObservedElements(store.db, admin.orgId, demoProject, [
        {
          url: "https://www.saucedemo.com/",
          elements: [
            {
              tag: "input",
              text: "Username",
              role: "textbox",
              type: "text",
              locator: { kind: "css", value: '[data-test="username"]' },
              alternatives: [{ kind: "id", value: "user-name" }],
            },
          ],
        },
      ]);
      assert.equal(
        (
          store.db
            .prepare("SELECT COUNT(*) AS n FROM ai_page_elements")
            .get() as { n: number }
        ).n,
        3,
      );
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("suites use approved elements by key, pinned at approval", async () => {
  const previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
  process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { dir, store } = libraryFixture();
  const app = await createApp(store);
  const replies: unknown[] = [];
  const requests: { messages: { role: string; content: string }[] }[] = [];
  const server = Fastify();
  server.post("/v1/chat/completions", async (request) => {
    requests.push(structuredClone(request.body) as (typeof requests)[number]);
    return replies.shift();
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  try {
    const headers = () => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(id, JSON.stringify(admin), Date.now() + 60000);
      return {
        host: "127.0.0.1:4000",
        cookie: `zc_session=${id}`,
        origin: "http://127.0.0.1:3000",
        "x-zerocode-client": "local-ui",
      };
    };
    const call = async (
      method: "GET" | "PUT" | "POST",
      url: string,
      payload?: unknown,
    ) => {
      const response = await app.inject({
        method,
        url,
        headers: headers(),
        ...(payload ? { payload: payload as object } : {}),
      });
      return { status: response.statusCode, body: response.json() };
    };
    const root = `/v1/projects/${demoProject}/ai`;
    const origin = "https://shop.example.test";
    store.db
      .prepare("INSERT INTO ai_authorized_origins VALUES (?,?,?,?)")
      .run(randomUUID(), admin.orgId, origin, new Date().toISOString());
    const usernameLocator = { kind: "css", value: '[data-test="username"]' };
    const loginLocator = { kind: "id", value: "login-button" };
    const observedPage = {
      title: "Shop",
      url: shopPage,
      elements: [
        {
          tag: "input",
          text: "Username",
          role: "textbox",
          type: "text",
          locator: usernameLocator,
          alternatives: [{ kind: "id", value: "user-name" }],
        },
        {
          tag: "button",
          text: "Login",
          role: "button",
          type: "submit",
          locator: loginLocator,
        },
      ],
    };
    recordObservedElements(store.db, admin.orgId, demoProject, [
      observedPage as never,
    ]);
    const elements = (await call("GET", `${root}/elements`)).body.elements;
    const user = elements.find(
      (e: { label: string }) => e.label === "Username",
    );
    const approve = (body: Record<string, unknown> = {}) =>
      call("PUT", `${root}/elements/${user.id}`, {
        expectedRevision: user.revision,
        elementKey: "login.username",
        name: "Kullanıcı adı",
        pageKey: "login",
        locator: user.locator,
        alternatives: user.alternatives,
        approved: true,
        ...body,
      });
    const approved = await approve();
    assert.equal(approved.body.element.revision, 2);
    // Fix: re-observation of an approved element only suggests.
    recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [
          {
            ...observedPage.elements[0]!,
            alternatives: [{ kind: "placeholder", value: "Username" }],
          },
        ],
      } as never,
    ]);
    const seen = (await call("GET", `${root}/elements/${user.id}`)).body;
    assert.equal(seen.element.revision, 2);
    assert.deepEqual(seen.element.alternatives, user.alternatives);
    assert.deepEqual(seen.element.suggestedAlternatives, [
      { kind: "placeholder", value: "Username" },
    ]);
    const accept = (body: Record<string, unknown>) =>
      call("POST", `${root}/elements/${user.id}/suggestions/accept`, body);
    const suggestion = { kind: "placeholder", value: "Username" };
    assert.equal(
      (await accept({ expectedRevision: 1, locator: suggestion })).body.code,
      "REVISION_CONFLICT",
    );
    assert.equal(
      (
        await accept({
          expectedRevision: 2,
          locator: { kind: "label", value: "Nope" },
        })
      ).status,
      404,
    );
    const accepted = await accept({ expectedRevision: 2, locator: suggestion });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.element.revision, 3);
    assert.equal(accepted.body.element.approved, true);
    assert.deepEqual(accepted.body.element.alternatives, [
      ...user.alternatives,
      suggestion,
    ]);
    assert.deepEqual(accepted.body.element.suggestedAlternatives, []);
    assert.equal(accepted.body.history[0].action, "alternative_added");

    // Generation: library first, raw locators of approved elements normalized.
    const provider = {
      id: randomUUID(),
      name: "Mock",
      kind: "openai-compatible",
      base_url: `http://127.0.0.1:${(server.server.address() as { port: number }).port}/v1`,
      encrypted_key: encrypt("mock-key"),
      model: "mock",
      timeout_ms: 5000,
      active: 1,
    };
    const target = new URL(shopPage);
    const reply = (actions: unknown[]) => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Giriş",
              targetUrl: target.href,
              scenarios: [
                { title: "Giriş dener", category: "positive", actions },
              ],
            }),
          },
        },
      ],
    });
    replies.push(
      reply([
        { kind: "fill", element: "login.nope", value: "x" },
        { kind: "assertVisible", locator: loginLocator },
      ]),
      reply([
        {
          kind: "fill",
          locator: { kind: "id", value: "user-name" },
          value: "x",
        },
        { kind: "click", locator: loginLocator },
        { kind: "assertVisible", element: "login.username" },
      ]),
    );
    const { approvedLibraryElements } =
      await import("../packages/storage/src/index");
    const library = approvedLibraryElements(
      store.db,
      admin.orgId,
      demoProject,
      origin,
    );
    assert.deepEqual(
      library.map((e) => e.elementKey),
      ["login.username"],
    );
    const suite = await generateSuite(
      provider,
      "mock",
      "giriş senaryosu",
      target,
      { pages: [observedPage], path: [] },
      undefined,
      [],
      newGenerationMetrics(),
      library,
    );
    assert.deepEqual(suite.scenarios[0]!.actions, [
      { kind: "fill", value: "x", element: "login.username" },
      { kind: "click", locator: loginLocator },
      { kind: "assertVisible", element: "login.username" },
    ]);
    const system = requests[0]!.messages[0]!.content;
    assert.match(system, /"element":ELEMENT_KEY/);
    // Prompt names exactly the observable locator kinds.
    assert.match(system, /"testId"\|"id"\|"css"\|"label"\|"placeholder"/);
    assert.doesNotMatch(system, /xpath|altText/);
    const user0 = requests[0]!.messages[1]!.content;
    assert.ok(
      user0.indexOf("libraryElements") < user0.indexOf("observedPages"),
    );
    const sent = JSON.parse(user0);
    assert.deepEqual(sent.libraryElements, [
      {
        element: "login.username",
        name: "Kullanıcı adı",
        page: "login",
        pageUrl: shopPage,
      },
    ]);
    assert.equal(sent.observedPages[0].elements[0].element, "login.username");
    assert.equal(sent.observedPages[0].elements[1].element, undefined);
    assert.match(
      requests[1]!.messages.at(-1)!.content,
      /not in libraryElements: login\.nope/,
    );
    // Normalization is pure and skips locators shared by two keys.
    assert.equal(
      normalizeElementRefs(suite, [
        ...library,
        { ...library[0]!, elementKey: "login.other" },
      ]).normalized,
      0,
    );
    // Exactly one target; unobservable locator kinds are rejected.
    const one = (action: unknown) =>
      aiSuiteSchema.safeParse({
        title: "Tek",
        targetUrl: target.href,
        scenarios: [
          { title: "Tek hedef", category: "positive", actions: [action] },
        ],
      }).success;
    assert.equal(
      one({ kind: "click", element: "login.username", locator: loginLocator }),
      false,
    );
    assert.equal(one({ kind: "click" }), false);
    assert.equal(
      one({ kind: "click", locator: { kind: "xpath", value: "//a" } }),
      false,
    );
    assert.equal(one({ kind: "click", element: "login.username" }), true);

    // Approval pins the current revision; unapproved keys are refused.
    const conversationId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run(
        conversationId,
        admin.orgId,
        demoProject,
        "c",
        new Date().toISOString(),
      );
    const draft = (definition: unknown) => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          admin.orgId,
          demoProject,
          conversationId,
          provider.id,
          "mock",
          target.href,
          JSON.stringify({ pages: [observedPage], path: [] }),
          JSON.stringify(definition),
          "ready",
          null,
          new Date().toISOString(),
        );
      return id;
    };
    const withAssert = {
      ...suite,
      scenarios: [
        {
          ...suite.scenarios[0]!,
          actions: [
            ...suite.scenarios[0]!.actions,
            { kind: "assertText", element: "login.username", expected: "x" },
          ],
        },
      ],
    };
    const draftId = draft(withAssert);
    const conversation = await call(
      "GET",
      `${root}/conversations/${conversationId}`,
    );
    assert.deepEqual(conversation.body.drafts[0].elementRefs, {
      "login.username": { name: "Kullanıcı adı", approved: true, revision: 3 },
    });
    const saved = await call(
      "POST",
      `${root}/drafts/${draftId}/save`,
      withAssert,
    );
    assert.equal(saved.status, 201);
    assert.deepEqual(saved.body.elements, [
      { elementKey: "login.username", elementId: user.id, revision: 3 },
    ]);
    const login = elements.find((e: { label: string }) => e.label === "Login");
    const unapprovedRef = {
      ...withAssert,
      scenarios: [
        {
          ...withAssert.scenarios[0]!,
          actions: [{ kind: "assertVisible", element: login.elementKey }],
        },
      ],
    };
    const refused = await call(
      "POST",
      `${root}/drafts/${draft(unapprovedRef)}/save`,
      unapprovedRef,
    );
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "ELEMENT_UNAVAILABLE");
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM ai_suites").get()!.n,
      1,
    );
    const pins = suitePins(store.db, admin.orgId, saved.body.id);
    assert.throws(
      () => store.db.prepare("UPDATE ai_suite_elements SET revision=1").run(),
      /immutable ai suite element pin/,
    );
    const resolved = resolveElementPins(
      store.db,
      admin.orgId,
      demoProject,
      pins,
    );
    assert.deepEqual(
      (resolved["login.username"] as { locator: unknown }).locator,
      usernameLocator,
    );

    // Promotion snapshots key + revision and puts them in the checksummed plan.
    const promoted = await call(
      "POST",
      `${root}/suites/${saved.body.id}/promote`,
    );
    assert.equal(promoted.status, 201);
    const pinned = promoted.body.test.elements.find(
      (e: { elementKey?: string }) => e.elementKey === "login.username",
    );
    assert.equal(pinned.revision, 3);
    assert.equal(pinned.elementId, user.id);
    const plan = compilePromoted(promoted.body.test);
    assert.deepEqual(plan.elements, [
      {
        elementKey: "login.username",
        elementId: user.id,
        revision: 3,
        name: "Kullanıcı adı",
        locator: usernameLocator,
      },
    ]);
    assert.equal(verifyPlan(plan).scenarios.length, 1);
    assert.throws(
      () =>
        verifyPlan({
          ...plan,
          elements: [{ ...plan.elements![0]!, revision: 2 }],
        }),
      /bütünlüğü/,
    );
    const run = await call(
      "POST",
      `${root}/tests/${promoted.body.test.testId}/runs`,
      {},
    );
    assert.equal(run.status, 202);

    // A second suite saved now, then the element loses approval.
    const second = await call(
      "POST",
      `${root}/drafts/${draft(withAssert)}/save`,
      withAssert,
    );
    assert.equal(second.status, 201);
    const unapproved = await approve({
      expectedRevision: 3,
      alternatives: accepted.body.element.alternatives,
      approved: false,
    });
    assert.equal(unapproved.body.element.approved, false);
    assert.deepEqual(
      resolveElementPins(store.db, admin.orgId, demoProject, pins),
      { "login.username": { unavailable: "unapproved" } },
    );
    const blocked = await call(
      "POST",
      `${root}/suites/${second.body.id}/promote`,
    );
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, "ELEMENT_UNAVAILABLE");
  } finally {
    await server.close();
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.ZC_AI_ENCRYPTION_KEY;
    else process.env.ZC_AI_ENCRYPTION_KEY = previousKey;
  }
});
test("old promoted tests keep their plan shape without element pins", () => {
  const test = buildPromotedTest({
    testId: randomUUID(),
    revision: 1,
    orgId: admin.orgId,
    projectId: demoProject,
    suite: aiSuiteSchema.parse({
      title: "Eski test",
      targetUrl: shopPage,
      scenarios: [
        {
          title: "Görünür",
          category: "positive",
          actions: [
            { kind: "assertVisible", locator: { kind: "id", value: "a" } },
          ],
        },
      ],
    }),
    inspection: {
      pages: [
        {
          title: "Shop",
          url: shopPage,
          elements: [
            {
              tag: "a",
              text: "A",
              role: "link",
              type: "",
              locator: { kind: "id", value: "a" },
            },
          ],
        },
      ],
    },
    source: {
      suiteId: randomUUID(),
      draftId: randomUUID(),
      conversationId: randomUUID(),
    },
  });
  assert.equal(test.elements[0]!.elementKey, undefined);
  const plan = compilePromoted(test);
  assert.equal("elements" in plan, false);
  assert.equal(verifyPlan(plan).scenarios.length, 1);
});
test("migration moves silently added alternatives of approved elements to suggestions", async () => {
  const { dir, store } = libraryFixture();
  const path = join(dir, "test.sqlite");
  const { updateAiElement } = await import("../packages/storage/src/index");
  try {
    recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [
          {
            tag: "input",
            text: "Username",
            role: "textbox",
            type: "text",
            locator: { kind: "id", value: "user-name" },
            alternatives: [{ kind: "placeholder", value: "Username" }],
          },
        ],
      },
    ]);
    const row = store.db
      .prepare("SELECT id,alternatives FROM ai_page_elements")
      .get() as { id: string; alternatives: string };
    store.transaction(() =>
      updateAiElement(store.db, admin, demoProject, row.id, {
        expectedRevision: 1,
        elementKey: "login.username",
        name: "Kullanıcı adı",
        pageKey: "login",
        locator: { kind: "id", value: "user-name" },
        alternatives: JSON.parse(row.alternatives),
        approved: true,
      }),
    );
    // Pre-fix behaviour: observation appended an alternative without a revision.
    store.db
      .prepare("UPDATE ai_page_elements SET alternatives=? WHERE id=?")
      .run(
        JSON.stringify([
          { kind: "placeholder", value: "Username" },
          { kind: "label", value: "User" },
        ]),
        row.id,
      );
    store.db.exec(
      "ALTER TABLE ai_page_elements DROP COLUMN suggested_alternatives",
    );
    store.close();
    const reopened = new Store(path);
    const after = reopened.db
      .prepare(
        "SELECT alternatives,suggested_alternatives,revision,approved FROM ai_page_elements WHERE id=?",
      )
      .get(row.id) as Record<string, string | number>;
    reopened.close();
    assert.deepEqual(JSON.parse(after.alternatives as string), [
      { kind: "placeholder", value: "Username" },
    ]);
    assert.deepEqual(JSON.parse(after.suggested_alternatives as string), [
      { kind: "label", value: "User" },
    ]);
    assert.equal(after.revision, 2);
    assert.equal(after.approved, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("element updates list affected tests; new versions are created on request", async () => {
  const { dir, store } = libraryFixture();
  const app = await createApp(store);
  try {
    const other = { ...admin, orgId: randomUUID() };
    const call = async (
      method: "GET" | "PUT" | "POST",
      url: string,
      payload?: unknown,
      user = admin,
    ) => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(id, JSON.stringify(user), Date.now() + 60000);
      const response = await app.inject({
        method,
        url,
        headers: {
          host: "127.0.0.1:4000",
          cookie: `zc_session=${id}`,
          origin: "http://127.0.0.1:3000",
          "x-zerocode-client": "local-ui",
        },
        ...(payload ? { payload: payload as object } : {}),
      });
      return { status: response.statusCode, body: response.json() };
    };
    const root = `/v1/projects/${demoProject}/ai`;
    store.db
      .prepare("INSERT INTO ai_authorized_origins VALUES (?,?,?,?)")
      .run(
        randomUUID(),
        admin.orgId,
        "https://shop.example.test",
        new Date().toISOString(),
      );
    const page = {
      title: "Shop",
      url: shopPage,
      elements: [
        {
          tag: "input",
          text: "Username",
          role: "textbox",
          type: "text",
          locator: { kind: "id", value: "user-name" },
          alternatives: [{ kind: "testId", value: "username" }],
        },
        {
          tag: "button",
          text: "Login",
          role: "button",
          type: "submit",
          locator: { kind: "id", value: "login-button" },
          alternatives: [{ kind: "testId", value: "login-button" }],
        },
      ],
    };
    recordObservedElements(store.db, admin.orgId, demoProject, [page as never]);
    const listed = (await call("GET", `${root}/elements`)).body.elements as {
      id: string;
      label: string;
      revision: number;
      locator: unknown;
      alternatives: unknown[];
    }[];
    const edit = (
      element: (typeof listed)[number],
      key: string,
      body: Record<string, unknown> = {},
    ) =>
      call("PUT", `${root}/elements/${element.id}`, {
        expectedRevision: element.revision,
        elementKey: key,
        name: key,
        pageKey: "login",
        locator: element.locator,
        alternatives: element.alternatives,
        approved: true,
        ...body,
      });
    const userEl = listed.find((e) => e.label === "Username")!;
    const loginEl = listed.find((e) => e.label === "Login")!;
    assert.equal((await edit(userEl, "login.username")).status, 200);
    assert.equal((await edit(loginEl, "login.submit")).status, 200);

    const conversationId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run(
        conversationId,
        admin.orgId,
        demoProject,
        "c",
        new Date().toISOString(),
      );
    const suite = {
      title: "Giriş",
      targetUrl: shopPage,
      scenarios: [
        {
          title: "Giriş yapar",
          category: "positive",
          actions: [
            { kind: "fill", element: "login.username", value: "x" },
            { kind: "click", element: "login.submit" },
            { kind: "assertVisible", element: "login.submit" },
          ],
        },
      ],
    };
    const draftId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        draftId,
        admin.orgId,
        demoProject,
        conversationId,
        randomUUID(),
        "mock",
        shopPage,
        JSON.stringify({ pages: [page], path: [] }),
        JSON.stringify(suite),
        "ready",
        null,
        new Date().toISOString(),
      );
    const saved = await call("POST", `${root}/drafts/${draftId}/save`, suite);
    assert.equal(saved.status, 201);
    const promoted = await call(
      "POST",
      `${root}/suites/${saved.body.id}/promote`,
    );
    assert.equal(promoted.status, 201);
    const testId = promoted.body.test.testId as string;
    const v1Checksum = promoted.body.checksum as string;
    const impact = (element: { id: string }, user = admin) =>
      call("GET", `${root}/elements/${element.id}/impact`, undefined, user);
    const tests = async () =>
      (await call("GET", `${root}/tests`)).body.tests as {
        revision: number;
        latest: boolean;
        stale_elements: { elementKey: string; pinnedRevision: number }[];
      }[];
    assert.deepEqual((await impact(userEl)).body.tests, []);
    assert.deepEqual((await tests())[0]!.stale_elements, []);

    // Primary ↔ alternative swap: new revision, approval cleared.
    const swapped = await edit({ ...userEl, revision: 2 }, "login.username", {
      locator: { kind: "testId", value: "username" },
      alternatives: [{ kind: "id", value: "user-name" }],
      approved: false,
    });
    assert.equal(swapped.body.element.revision, 3);
    const stale = await impact(userEl);
    assert.equal(stale.status, 200);
    assert.equal(stale.body.tests.length, 1);
    const row = stale.body.tests[0];
    assert.equal(row.testId, testId);
    assert.equal(row.testRevision, 1);
    assert.equal(row.pinnedRevision, 2);
    assert.equal(row.currentRevision, 3);
    assert.deepEqual(row.diff.primary, {
      from: { kind: "id", value: "user-name" },
      to: { kind: "testId", value: "username" },
    });
    assert.deepEqual(row.diff.alternatives, {
      added: [{ kind: "id", value: "user-name" }],
      removed: [{ kind: "testId", value: "username" }],
    });
    assert.equal(row.diff.name, null);
    assert.deepEqual(row.unavailable, [
      { elementKey: "login.username", reason: "unapproved" },
    ]);
    assert.deepEqual(
      (await tests())[0]!.stale_elements.map((s) => s.elementKey),
      ["login.username"],
    );

    // Unapproved element → refused with the list; nothing written.
    const refused = await call("POST", `${root}/tests/${testId}/versions`, {
      expectedRevision: 1,
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "ELEMENT_UNAVAILABLE");
    assert.deepEqual(refused.body.details.unavailable, [
      { elementKey: "login.username", reason: "unapproved" },
    ]);
    assert.match(refused.body.message, /login\.username \(onaysız\)/);
    const count = () =>
      store.db.prepare("SELECT count(*) AS n FROM ai_tests").get()!.n;
    assert.equal(count(), 1);

    // Re-approve (v4), then create the new version explicitly.
    const reapproved = await edit(
      { ...userEl, ...swapped.body.element },
      "login.username",
      { approved: true },
    );
    assert.equal(reapproved.body.element.revision, 4);
    assert.equal(
      (
        await call("POST", `${root}/tests/${testId}/versions`, {
          expectedRevision: 2,
        })
      ).body.code,
      "REVISION_CONFLICT",
    );
    // Other org: neither impact nor versions are visible.
    assert.equal((await impact(userEl, other)).status, 404);
    assert.equal(
      (
        await call(
          "POST",
          `${root}/tests/${testId}/versions`,
          { expectedRevision: 1 },
          other,
        )
      ).status,
      404,
    );
    assert.equal(
      (await call("GET", `${root}/tests`, undefined, other)).status,
      404,
    );

    const created = await call("POST", `${root}/tests/${testId}/versions`, {
      expectedRevision: 1,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.test.revision, 2);
    assert.deepEqual(created.body.test.derivedFrom, {
      revision: 1,
      reason: "element_update",
    });
    assert.deepEqual(created.body.changed, [
      { elementKey: "login.username", from: 2, to: 4 },
    ]);
    const pinnedOf = (
      t: { elements: { elementKey?: string }[] },
      key: string,
    ) =>
      t.elements.find((e) => e.elementKey === key) as {
        revision: number;
        locator: unknown;
      };
    assert.equal(pinnedOf(created.body.test, "login.username").revision, 4);
    assert.deepEqual(pinnedOf(created.body.test, "login.username").locator, {
      kind: "testId",
      value: "username",
    });
    assert.equal(pinnedOf(created.body.test, "login.submit").revision, 2);
    assert.deepEqual(created.body.test.scenarios, promoted.body.test.scenarios);
    assert.equal(created.body.previousChecksum, v1Checksum);
    assert.notEqual(created.body.checksum, v1Checksum);
    assert.equal(created.body.checksum, promotedChecksum(created.body.test));
    // The old version is unchanged and still verifies.
    const v1 = await call("GET", `${root}/tests/${testId}/versions/1`);
    assert.equal(v1.status, 200);
    assert.equal(v1.body.checksum, v1Checksum);
    assert.deepEqual(v1.body.test, promoted.body.test);
    assert.equal(pinnedOf(v1.body.test, "login.username").revision, 2);
    assert.throws(
      () => store.db.prepare("UPDATE ai_tests SET title='x'").run(),
      /immutable ai test/,
    );
    const after = await tests();
    assert.deepEqual(
      after.map((t) => [t.revision, t.latest, t.stale_elements.length]),
      [
        [2, true, 0],
        [1, false, 0],
      ],
    );
    assert.deepEqual((await impact(userEl)).body.tests, []);
    assert.equal(
      (
        await call("POST", `${root}/tests/${testId}/versions`, {
          expectedRevision: 2,
        })
      ).body.code,
      "TEST_UP_TO_DATE",
    );
    // The suite still maps to its first promotion; no duplicate suite rows.
    const again = await call("POST", `${root}/suites/${saved.body.id}/promote`);
    assert.equal(again.status, 200);
    assert.equal(again.body.test.revision, 1);
    const suites = (await call("GET", `${root}/suites`)).body.suites;
    assert.equal(suites.length, 1);
    assert.deepEqual(suites[0].promoted, { testId, revision: 1 });

    // Only the latest version counts: login.submit changes after v2.
    const loginNow = (await call("GET", `${root}/elements/${loginEl.id}`)).body
      .element;
    await edit(loginNow, "login.submit", { name: "Giriş düğmesi" });
    const loginImpact = (await impact(loginEl)).body.tests;
    assert.equal(loginImpact.length, 1);
    assert.equal(loginImpact[0].testRevision, 2);
    assert.deepEqual(loginImpact[0].diff.name, {
      from: "login.submit",
      to: "Giriş düğmesi",
    });
    assert.equal(loginImpact[0].diff.primary, null);
    assert.deepEqual(loginImpact[0].unavailable, []);

    // The new version runs through the existing pipeline with new pins.
    const run = await call("POST", `${root}/tests/${testId}/runs`, {
      revision: 2,
    });
    assert.equal(run.status, 202);
    const plan = JSON.parse(
      store.db
        .prepare("SELECT plan FROM ai_test_runs WHERE id=?")
        .get(run.body.id)!.plan as string,
    );
    assert.equal(plan.testRevision, 2);
    assert.equal(
      plan.elements.find(
        (e: { elementKey: string }) => e.elementKey === "login.username",
      ).revision,
      4,
    );
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration 011 drops the one-version-per-suite constraint and keeps rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-migrate-011-"));
  const path = join(dir, "old.sqlite");
  try {
    const old = new DatabaseSync(path);
    for (const file of [
      "001_initial.sql",
      "002_locator_checks.sql",
      "003_ai_assistant.sql",
      "004_authorized_targets.sql",
      "005_ai_elements.sql",
      "006_ai_tests.sql",
    ])
      old.exec(readFileSync(join("infra/migrations", file), "utf8"));
    const now = new Date().toISOString();
    const [conversation, draft, suite, testId, runId] = [1, 2, 3, 4, 5].map(
      () => randomUUID(),
    );
    old
      .prepare("INSERT OR IGNORE INTO projects VALUES (?,?,?)")
      .run(demoProject, admin.orgId, "ZeroCode Demo");
    old
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run(conversation!, admin.orgId, demoProject, "c", now);
    old
      .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        draft!,
        admin.orgId,
        demoProject,
        conversation!,
        "p",
        "m",
        shopPage,
        null,
        null,
        "ready",
        null,
        now,
      );
    old
      .prepare("INSERT INTO ai_suites VALUES (?,?,?,?,?,?)")
      .run(suite!, admin.orgId, demoProject, draft!, "{}", now);
    const insertTest = old.prepare(
      "INSERT INTO ai_tests VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    );
    const row = (revision: number) =>
      [
        testId!,
        revision,
        admin.orgId,
        demoProject,
        suite!,
        conversation!,
        "T",
        "https://shop.example.test",
        "{}",
        "c",
        now,
      ] as const;
    insertTest.run(...row(1));
    assert.throws(() => insertTest.run(...row(2)), /UNIQUE/);
    old
      .prepare("INSERT INTO ai_test_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        runId!,
        admin.orgId,
        demoProject,
        testId!,
        1,
        "{}",
        "c",
        "passed",
        "{}",
        now,
        now,
      );
    old.close();

    const store = new Store(path);
    try {
      store.db
        .prepare("INSERT INTO ai_tests VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(...row(2));
      assert.equal(
        store.db.prepare("SELECT count(*) AS n FROM ai_tests").get()!.n,
        2,
      );
      assert.equal(
        store.db.prepare("SELECT test_id FROM ai_test_runs").get()!.test_id,
        testId,
      );
      assert.throws(
        () => store.db.prepare("DELETE FROM ai_tests").run(),
        /immutable ai test/,
      );
      assert.equal(
        store.db.prepare("PRAGMA foreign_keys").get()!.foreign_keys,
        1,
      );
      // Runs still reference an existing version.
      assert.throws(
        () =>
          store.db
            .prepare("INSERT INTO ai_test_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .run(
              randomUUID(),
              admin.orgId,
              demoProject,
              testId!,
              9,
              "{}",
              "c",
              "queued",
              null,
              now,
              null,
            ),
        /FOREIGN KEY/,
      );
    } finally {
      store.close();
    }
    // Reopening is a no-op.
    new Store(path).close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Self-healing executor (ADR 016); API side in tests/self-healing.test.ts.
test(
  "self-healing tries approved alternatives only when enabled",
  { timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-heal-run-"));
    const fixture = spawn(
      process.execPath,
      ["--import", "tsx", "tests/fixtures/server.ts"],
      { detached: detachedTestProcess, stdio: "ignore" },
    );
    const browser = await launchBrowser();
    try {
      await until(
        async () =>
          await fetch("http://127.0.0.1:4100/health").then(
            (r) => r.ok,
            () => false,
          ),
        10000,
      );
      const suite = aiSuiteSchema.parse({
        title: "Heal",
        targetUrl: "http://127.0.0.1:4100/quality/clean",
        scenarios: [
          {
            title: "Arama",
            category: "positive",
            actions: [
              { kind: "fill", element: "search.query", value: "abc" },
              { kind: "assertVisible", element: "search.query" },
            ],
          },
        ],
      });
      const bound = (
        locator: { kind: string; value: string },
        alternatives: { kind: string; value: string }[],
      ): ResolvedElements => ({
        "search.query": {
          elementKey: "search.query",
          elementId: randomUUID(),
          revision: 3,
          name: "Arama",
          locator,
          alternatives,
        },
      });
      const broken = { kind: "id", value: "q-broken" };
      const label = { kind: "label", value: "Search" };
      let n = 0;
      const run = (elements: ResolvedElements, selfHealing: boolean) =>
        executeSuite(browser, suite, join(dir, String(n++)), [], [], elements, {
          selfHealing,
        });

      // OFF: current behaviour exactly, alternatives are not tried.
      const off = await run(bound(broken, [label]), false);
      assert.equal(off.status, "failed");
      assert.equal(off.results[0]!.steps[0]!.code, "ELEMENT_NOT_FOUND");
      assert.equal(off.results[0]!.steps[0]!.healed, undefined);
      assert.equal(off.healedSteps, 0);
      assert.equal(off.selfHealing, false);

      // ON: the first unique approved alternative is used and recorded.
      const on = await run(
        bound(broken, [{ kind: "id", value: "missing" }, label]),
        true,
      );
      assert.equal(on.status, "passed");
      assert.equal(on.healedSteps, 2);
      for (const step of on.results[0]!.steps) {
        assert.equal(step.status, "passed");
        assert.deepEqual(step.healed, { locator: label, primary: broken });
        assert.ok(step.screenshot?.sha256);
      }

      // An ambiguous alternative stops healing: normal failure.
      const ambiguous = await run(
        bound(broken, [{ kind: "css", value: "a" }, label]),
        true,
      );
      assert.equal(ambiguous.status, "failed");
      assert.equal(ambiguous.results[0]!.steps[0]!.code, "AMBIGUOUS_ELEMENT");
      assert.equal(ambiguous.healedSteps, 0);
      // No alternative matches: normal failure.
      const none = await run(
        bound(broken, [{ kind: "id", value: "missing" }]),
        true,
      );
      assert.equal(none.results[0]!.steps[0]!.code, "ELEMENT_NOT_FOUND");
      // A working primary is never replaced.
      const primary = await run(
        bound({ kind: "id", value: "q" }, [label]),
        true,
      );
      assert.equal(primary.status, "passed");
      assert.equal(primary.healedSteps, 0);
      // An ambiguous primary is not healed either.
      const ambiguousPrimary = await run(
        bound({ kind: "css", value: "a" }, [label]),
        true,
      );
      assert.equal(
        ambiguousPrimary.results[0]!.steps[0]!.code,
        "AMBIGUOUS_ELEMENT",
      );
    } finally {
      await browser.close();
      try {
        if (fixture.pid) stopTestProcess(fixture.pid, "SIGTERM");
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
