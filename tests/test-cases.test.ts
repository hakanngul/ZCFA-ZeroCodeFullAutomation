import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import {
  approveCase,
  bindSuiteElements,
  caseRow,
  caseView,
  createSuite,
  Store,
  suiteRow,
  updateAiElement,
  type ObservedPageForCases,
} from "../packages/storage/src/index";
import { compileCaseRun, verifyCaseRun } from "../packages/assistant/src/cases";
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

const shop = "https://shop.example.test";
const loginPage = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    url: `${shop}/?from=ad#top`,
    elements: [
      {
        tag: "input",
        text: "Username",
        role: "textbox",
        type: "text",
        locator: { kind: "css", value: '[data-test="username"]' },
        alternatives: [{ kind: "id", value: "user-name" }],
        unique: true,
      },
      {
        tag: "input",
        text: "Password",
        role: "textbox",
        type: "password",
        locator: { kind: "css", value: '[data-test="password"]' },
        alternatives: [{ kind: "id", value: "password" }],
        unique: true,
      },
      {
        tag: "input",
        text: "Login",
        role: "button",
        type: "submit",
        locator: { kind: "css", value: '[data-test="login-button"]' },
        alternatives: [{ kind: "id", value: "login-button" }],
        unique: true,
      },
      // Seen but never used by a step: must not reach the library.
      {
        tag: "div",
        text: "Accepted usernames are",
        role: "",
        type: "",
        locator: { kind: "css", value: "#login_credentials" },
        unique: true,
      },
      {
        tag: "h3",
        text: "Epic sadface",
        role: "heading",
        type: "",
        locator: { kind: "css", value: "body > div > h3:nth-of-type(2)" },
        unique: false,
      },
      ...((overrides.extra as unknown[]) ?? []),
    ],
  }) as ObservedPageForCases;
const loginSuite = (withError = false) => ({
  title: "Giriş suite",
  targetUrl: `${shop}/`,
  scenarios: [
    {
      title: "Geçerli giriş",
      category: "positive",
      description: "Kayıtlı kullanıcı giriş yapar.",
      preconditions: ["Kullanıcı giriş sayfasında"],
      testData: [{ name: "Kullanıcı", value: "{{SHOP_USER}}" }],
      expectedResults: ["Ürünler sayfası açılır"],
      actions: [
        {
          kind: "fill",
          locator: { kind: "css", value: '[data-test="username"]' },
          value: "{{SHOP_USER}}",
        },
        {
          kind: "fill",
          locator: { kind: "css", value: '[data-test="password"]' },
          value: "{{SHOP_PASSWORD}}",
        },
        {
          kind: "click",
          locator: { kind: "css", value: '[data-test="login-button"]' },
        },
        { kind: "assertUrl", expected: `${shop}/inventory.html` },
      ],
    },
    ...(withError
      ? [
          {
            title: "Hatalı giriş",
            category: "negative",
            actions: [
              {
                kind: "click",
                locator: { kind: "css", value: '[data-test="login-button"]' },
              },
              {
                kind: "assertText",
                locator: {
                  kind: "css",
                  value: "body > div > h3:nth-of-type(2)",
                },
                expected: "Epic sadface: Username is required",
              },
            ],
          },
        ]
      : []),
  ],
});

test("generated suites register only needed, verified elements and reuse them", () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-cases-"));
  const store = new Store(join(dir, "test.sqlite"));
  try {
    const count = () =>
      Number(
        store.db.prepare("SELECT count(*) AS n FROM ai_page_elements").get()!.n,
      );
    const first = store.transaction(() =>
      bindSuiteElements(
        store.db,
        admin.orgId,
        demoProject,
        [loginPage()],
        loginSuite(true),
      ),
    );
    // username, password, login button; the unused #login_credentials and
    // the non-unique error heading get no record.
    assert.equal(count(), 3);
    assert.deepEqual(first.stats, {
      created: 3,
      reused: 0,
      suggested: 0,
      unresolved: 1,
    });
    const [positive, negative] = first.cases;
    assert.equal(
      positive!.definition.description,
      "Kayıtlı kullanıcı giriş yapar.",
    );
    assert.deepEqual(positive!.definition.preconditions, [
      "Kullanıcı giriş sayfasında",
    ]);
    assert.deepEqual(positive!.definition.testData, [
      { name: "Kullanıcı", value: "{{SHOP_USER}}" },
    ]);
    const ids = positive!.definition.steps.map((s) => s.elementId);
    assert.equal(ids.slice(0, 3).every(Boolean), true);
    assert.equal(ids[3], undefined); // assertUrl needs no element
    assert.equal(negative!.definition.steps[0]!.elementId, ids[2]);
    const unresolved = negative!.definition.steps[1]!;
    assert.equal(unresolved.elementId, undefined);
    assert.equal(unresolved.unresolved?.reason, "unverified");
    const rows = store.db
      .prepare(
        "SELECT id,page_url,element_key,verification,approved FROM ai_page_elements ORDER BY element_key",
      )
      .all() as {
      id: string;
      page_url: string;
      element_key: string;
      verification: string;
    }[];
    // Query and hash are not part of the page.
    assert.equal(
      rows.every((r) => r.page_url === `${shop}/`),
      true,
    );
    assert.equal(
      rows.every((r) => r.verification === "verified"),
      true,
    );
    assert.deepEqual(
      rows.map((r) => r.element_key),
      ["home.login", "home.password", "home.username"],
    );

    // A second exploration of the same page reuses every record.
    const again = store.transaction(() =>
      bindSuiteElements(
        store.db,
        admin.orgId,
        demoProject,
        [loginPage()],
        loginSuite(),
      ),
    );
    assert.equal(count(), 3);
    assert.equal(again.stats.created, 0);
    assert.deepEqual(
      again.cases[0]!.definition.steps.map((s) => s.elementId),
      ids,
    );

    // An approved element keeps its primary even when observed differently.
    const login = rows.find((r) => r.element_key === "home.login")!;
    const row = store.db
      .prepare("SELECT * FROM ai_page_elements WHERE id=?")
      .get(login.id) as Record<string, unknown>;
    store.transaction(() =>
      updateAiElement(store.db, admin, demoProject, login.id, {
        expectedRevision: row.revision as number,
        elementKey: "login.submit",
        name: "Giriş butonu",
        pageKey: "login",
        locator: { kind: "css", value: '[data-test="login-button"]' },
        alternatives: [{ kind: "id", value: "login-button" }],
        approved: true,
      }),
    );
    const approvedBefore = store.db
      .prepare("SELECT revision,locator_value FROM ai_page_elements WHERE id=?")
      .get(login.id) as { revision: number; locator_value: string };
    const changedPage = loginPage();
    changedPage.elements[2] = {
      ...changedPage.elements[2]!,
      // The data-test attribute changed; the id still matches.
      locator: { kind: "css", value: '[data-test="login-btn"]' },
      alternatives: [{ kind: "id", value: "login-button" }],
    };
    const changedSuite = loginSuite();
    changedSuite.scenarios[0]!.actions[2] = {
      kind: "click",
      locator: { kind: "css", value: '[data-test="login-btn"]' },
    };
    const third = store.transaction(() =>
      bindSuiteElements(
        store.db,
        admin.orgId,
        demoProject,
        [changedPage],
        changedSuite,
      ),
    );
    assert.equal(count(), 3);
    assert.equal(third.cases[0]!.definition.steps[2]!.elementId, login.id);
    assert.equal(third.stats.suggested, 1);
    assert.equal(third.warnings.length, 1);
    const approvedAfter = store.db
      .prepare(
        "SELECT revision,locator_value,approved,suggested_alternatives,verification FROM ai_page_elements WHERE id=?",
      )
      .get(login.id) as Record<string, unknown>;
    assert.equal(approvedAfter.revision, approvedBefore.revision);
    assert.equal(approvedAfter.locator_value, '[data-test="login-button"]');
    assert.equal(approvedAfter.approved, 1);
    assert.equal(approvedAfter.verification, "failed");
    assert.match(approvedAfter.suggested_alternatives as string, /login-btn/);

    // An approved key resolves to its record; an unknown key is unresolved.
    const keyed = store.transaction(() =>
      bindSuiteElements(store.db, admin.orgId, demoProject, [], {
        title: "Anahtar",
        targetUrl: `${shop}/`,
        scenarios: [
          {
            title: "Anahtarla",
            category: "positive",
            actions: [
              { kind: "click", element: "login.submit" },
              { kind: "assertVisible", element: "login.ghost" },
            ],
          },
        ],
      }),
    );
    assert.equal(keyed.cases[0]!.definition.steps[0]!.elementId, login.id);
    assert.equal(
      keyed.cases[0]!.definition.steps[1]!.unresolved?.reason,
      "missing",
    );

    // An incomplete case cannot be approved.
    const suite = store.transaction(() =>
      createSuite(store.db, admin, demoProject, {
        title: "Giriş suite",
        targetUrl: `${shop}/`,
        source: "ai",
        cases: first.cases,
      }),
    );
    const incomplete = caseRow(
      store.db,
      admin.orgId,
      demoProject,
      suite.caseIds[1]!,
    );
    const view = caseView(
      store.db,
      suiteRow(store.db, admin.orgId, demoProject, suite.id),
      incomplete,
    );
    assert.equal(view.complete, false);
    assert.equal(view.issues[0]!.code, "ELEMENT_UNRESOLVED");
    assert.throws(
      () => approveCase(store.db, admin, demoProject, incomplete.id, 1),
      { code: "CASE_INCOMPLETE" },
    );
    // Approval pins element revisions; the run snapshot uses them.
    const approved = store.transaction(() =>
      approveCase(store.db, admin, demoProject, suite.caseIds[0]!, 1),
    );
    assert.equal(approved.approval, "approved");
    const pinned = approved.steps
      .filter((s) => s.element)
      .map((s) => s.element!.pinnedRevision);
    assert.equal(
      pinned.every((r) => typeof r === "number"),
      true,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("case run snapshots freeze element revisions and verify their checksum", () => {
  const snapshot = compileCaseRun({
    suiteId: randomUUID(),
    caseId: randomUUID(),
    caseRevision: 3,
    title: "Geçerli giriş",
    category: "positive",
    targetUrl: `${shop}/`,
    definition: {
      description: "",
      preconditions: [],
      testData: [],
      expectedResults: [],
      steps: [
        { id: "a", kind: "navigate", url: `${shop}/` },
        {
          id: "b",
          kind: "fill",
          elementId: "11111111-1111-4111-8111-111111111111",
          value: "x",
        },
        {
          id: "c",
          kind: "click",
          elementId: "22222222-2222-4222-8222-222222222222",
        },
        {
          id: "d",
          kind: "assertVisible",
          elementId: "11111111-1111-4111-8111-111111111111",
        },
      ],
    },
    pins: [
      {
        elementId: "11111111-1111-4111-8111-111111111111",
        elementKey: "login.username",
        revision: 2,
        name: "Kullanıcı adı",
        pageUrl: `${shop}/`,
        locator: { kind: "id", value: "user-name" },
        alternatives: [],
      },
      {
        elementId: "22222222-2222-4222-8222-222222222222",
        elementKey: "login.submit",
        revision: 5,
        name: "Giriş",
        pageUrl: `${shop}/`,
        locator: { kind: "id", value: "login-button" },
        alternatives: [{ kind: "css", value: "#login-button" }],
      },
    ],
  });
  assert.deepEqual(
    snapshot.scenarios[0]!.actions.map((a) =>
      "element" in a ? a.element : a.kind,
    ),
    ["navigate", "e1", "e2", "e1"],
  );
  const { suite, elements } = verifyCaseRun(snapshot);
  assert.equal(suite.scenarios.length, 1);
  assert.deepEqual(elements.e2, {
    elementKey: "login.submit",
    elementId: "22222222-2222-4222-8222-222222222222",
    revision: 5,
    name: "Giriş",
    locator: { kind: "id", value: "login-button" },
    alternatives: [{ kind: "css", value: "#login-button" }],
  });
  const tampered = structuredClone(snapshot);
  tampered.elements[0]!.locator.value = "other";
  assert.throws(() => verifyCaseRun(tampered), {
    code: "PLAN_CHECKSUM_MISMATCH",
  });
  assert.throws(
    () =>
      compileCaseRun({
        ...snapshot,
        category: "positive",
        pins: [],
      }),
    { code: "ELEMENT_UNAVAILABLE" },
  );
});

test(
  "exploration creates a draft suite in Tests; approved cases run with library elements",
  { timeout: 240000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-cases-flow-"));
    const previousAllow = process.env.ZC_AI_ALLOW_LOCAL_PROVIDER,
      previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
    process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = "1";
    process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const processes: ChildProcess[] = [];
    const ensureFixture = async () => {
      const up = () =>
        fetch("http://127.0.0.1:4100/health").then(
          (r) => r.ok,
          () => false,
        );
      if (await up()) return;
      processes.push(
        spawn(
          process.execPath,
          ["--import", "tsx", "tests/fixtures/server.ts"],
          { detached: true, stdio: "ignore" },
        ),
      );
      await until(up, 15000);
    };
    const provider = Fastify();
    const fill = (value: string, text: string) => ({
      kind: "fill",
      locator: { kind: "testId", value },
      value: text,
    });
    const suite = {
      title: "Demo Bank giriş",
      targetUrl: "http://127.0.0.1:4100/login",
      scenarios: [
        {
          title: "Geçerli giriş bakiyeyi gösterir",
          category: "positive",
          description: "Demo hesabıyla giriş yapılır, bakiye görünür.",
          preconditions: ["Demo Bank giriş sayfası açık"],
          testData: [
            { name: "E-posta", value: "qa@example.test" },
            { name: "Parola", value: "local-fixture-only" },
          ],
          expectedResults: ["Dashboard açılır", "Bakiye 1.250,00 TL"],
          actions: [
            fill("login-email", "qa@example.test"),
            fill("login-password", "local-fixture-only"),
            {
              kind: "click",
              locator: { kind: "testId", value: "login-submit" },
            },
            {
              kind: "assertText",
              locator: { kind: "testId", value: "dashboard-balance" },
              expected: "1.250,00 TL",
            },
          ],
        },
        {
          title: "Hatalı giriş uyarı verir",
          category: "negative",
          actions: [
            fill("login-email", "qa@example.test"),
            fill("login-password", "wrong"),
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
    };
    provider.post("/v1/chat/completions", async (request) => {
      const body = request.body as { messages: { content: string }[] };
      const system = body.messages[0]?.content ?? "";
      if (system === "Reply OK")
        return { choices: [{ message: { content: "OK" } }] };
      if (system.startsWith("You analyze"))
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Giriş ve dashboard incelendi.",
                  items: [
                    {
                      title: "Geçerli giriş bakiyeyi gösterir",
                      category: "positive",
                      area: "Giriş",
                      description: "Giriş yapılır, bakiye görünür.",
                      pages: [
                        "http://127.0.0.1:4100/login",
                        "http://127.0.0.1:4100/unseen",
                      ],
                      testData: ["E-posta", "Parola"],
                      feasible: true,
                    },
                    {
                      title: "Hatalı giriş uyarı verir",
                      category: "negative",
                      area: "Giriş",
                      description: "Yanlış parola reddedilir.",
                      feasible: true,
                    },
                  ],
                }),
              },
            },
          ],
        };
      if (system.startsWith("You explore")) {
        const state = JSON.parse(body.messages[1]!.content) as {
          path: unknown[];
        };
        const steps = [
          fill("login-email", "qa@example.test"),
          fill("login-password", "local-fixture-only"),
          { kind: "click", locator: { kind: "testId", value: "login-submit" } },
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
      return { choices: [{ message: { content: JSON.stringify(suite) } }] };
    });
    await provider.listen({ host: "127.0.0.1", port: 4262 });
    const store = new Store(join(dir, "zerocode.sqlite")),
      app = await createApp(store);
    const session = randomBytes(16).toString("hex");
    store.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(session, JSON.stringify(admin), Date.now() + 600000);
    const headers = {
      host: "127.0.0.1:4000",
      origin: "http://127.0.0.1:3000",
      "x-zerocode-client": "local-ui",
      cookie: `zc_session=${session}`,
    };
    const call = async (method: string, url: string, payload?: unknown) => {
      const res = await app.inject({
        method: method as "GET",
        url,
        headers:
          payload === undefined
            ? headers
            : { ...headers, "content-type": "application/json" },
        payload: payload === undefined ? undefined : JSON.stringify(payload),
      });
      return {
        status: res.statusCode,
        body: res.headers["content-type"]?.includes("json")
          ? res.json()
          : res.body,
      };
    };
    const root = `/v1/projects/${demoProject}`;
    try {
      await ensureFixture();
      processes.push(
        spawn(
          process.execPath,
          ["--import", "tsx", "apps/worker/src/main.ts"],
          {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, ZC_DATA_DIR: dir },
          },
        ),
      );
      const saved = await call("POST", "/v1/ai/providers", {
        name: "Fake provider",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:4262/v1",
        apiKey: "fake-key",
        model: "fake-model",
        timeoutMs: 10000,
      });
      assert.equal(saved.status, 201);
      const analyze = async () => {
        const queued = await call("POST", `${root}/ai/messages`, {
          prompt:
            "Demo Bank'ta qa@example.test ve local-fixture-only ile giriş yap, bakiyeyi doğrula",
          targetUrl: "http://127.0.0.1:4100/login",
          providerId: saved.body.id,
          model: "fake-model",
        });
        assert.equal(queued.status, 202);
        return until(async () => {
          const detail = await call(
            "GET",
            `${root}/ai/conversations/${queued.body.conversationId}`,
          );
          const draft = detail.body.drafts[0];
          return draft?.status === "ready" || draft?.status === "failed"
            ? detail.body
            : null;
        }, 90000);
      };
      const first = await analyze();
      assert.equal(first.drafts[0].status, "ready");
      assert.ok(
        first.messages.some((m: { content: string }) =>
          m.content.includes("Tests ekranına taslak suite olarak kaydedildi"),
        ),
      );
      // Only the five elements the steps use are in the library.
      const elements = (await call("GET", `${root}/ai/elements`)).body;
      assert.equal(elements.total, 5);
      const keys = elements.elements
        .map((e: { locatorValue: string }) => e.locatorValue)
        .sort();
      assert.deepEqual(keys, [
        "dashboard-balance",
        "error",
        "login-email",
        "login-password",
        "login-submit",
      ]);
      const listed = (await call("GET", `${root}/test-suites`)).body.suites;
      assert.equal(listed.length, 1);
      const [draftSuite] = listed;
      assert.equal(draftSuite.aiGenerated, true);
      assert.equal(draftSuite.cases.length, 2);
      const positive = draftSuite.cases[0];
      assert.equal(positive.approval, "draft");
      assert.equal(positive.aiGenerated, true);
      assert.deepEqual(positive.definition.expectedResults, [
        "Dashboard açılır",
        "Bakiye 1.250,00 TL",
      ]);
      const ids = new Set(elements.elements.map((e: { id: string }) => e.id));
      for (const c of draftSuite.cases)
        for (const step of c.steps) {
          assert.ok(step.elementId && ids.has(step.elementId));
          assert.equal(step.element.id, step.elementId);
        }
      // Usage: element → cases; step → element detail by id.
      const submitId = positive.steps[2].elementId;
      const usage = (await call("GET", `${root}/ai/elements/${submitId}/usage`))
        .body.cases;
      assert.equal(usage.length, 2);
      assert.deepEqual(usage[0].steps, [3]);

      // No run before approval.
      const early = await call(
        "POST",
        `${root}/test-cases/${positive.id}/runs`,
      );
      assert.equal(early.status, 409);
      assert.equal(early.body.code, "CASE_NOT_APPROVED");

      // Edit: pick another library element for the assertion step.
      const heading = elements.elements.find(
        (e: { locatorValue: string }) => e.locatorValue === "error",
      );
      const steps = positive.definition.steps.map(
        (s: Record<string, unknown>) => s,
      );
      const edited = await call("PUT", `${root}/test-cases/${positive.id}`, {
        expectedRevision: 1,
        title: "Geçerli giriş bakiyeyi gösterir",
        category: "positive",
        definition: {
          ...positive.definition,
          steps: [
            ...steps,
            { id: randomUUID(), kind: "assertVisible", elementId: heading.id },
          ],
        },
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.case.revision, 2);
      assert.equal(edited.body.case.steps[4].element.id, heading.id);
      const conflict = await call("PUT", `${root}/test-cases/${positive.id}`, {
        expectedRevision: 1,
        title: "Eski",
        category: "positive",
        definition: positive.definition,
      });
      assert.equal(conflict.status, 409);
      assert.equal(conflict.body.code, "REVISION_CONFLICT");
      const foreign = await call("PUT", `${root}/test-cases/${positive.id}`, {
        expectedRevision: 2,
        title: "Geçerli giriş",
        category: "positive",
        definition: {
          ...positive.definition,
          steps: [{ id: "x", kind: "click", elementId: randomUUID() }],
        },
      });
      assert.equal(foreign.body.code, "ELEMENT_MISSING");
      // Undo the extra step (the hidden error paragraph is empty).
      const restored = await call("PUT", `${root}/test-cases/${positive.id}`, {
        expectedRevision: 2,
        title: "Geçerli giriş bakiyeyi gösterir",
        category: "positive",
        definition: positive.definition,
      });
      assert.equal(restored.body.case.revision, 3);
      const approve = await call(
        "POST",
        `${root}/test-cases/${positive.id}/approve`,
        { expectedRevision: 3 },
      );
      assert.equal(approve.status, 200);
      assert.equal(approve.body.case.approval, "approved");

      const queuedRun = await call(
        "POST",
        `${root}/test-cases/${positive.id}/runs`,
      );
      assert.equal(queuedRun.status, 202);
      const finished = await until(async () => {
        const run = (
          await call("GET", `${root}/test-case-runs/${queuedRun.body.id}`)
        ).body;
        return ["queued", "running"].includes(run.status) ? null : run;
      }, 90000);
      assert.equal(finished.status, "passed");
      assert.equal(finished.caseRevision, 3);
      assert.equal(finished.snapshot.elements.length, 4);
      assert.equal(finished.result.results[0].steps.length, 4);
      assert.ok(
        finished.result.results[0].steps.every(
          (s: { status: string; screenshot?: unknown }) =>
            s.status === "passed" && s.screenshot,
        ),
      );
      const shot = await app.inject({
        method: "GET",
        url: `${root}/test-case-runs/${queuedRun.body.id}/steps/3/screenshot`,
        headers,
      });
      assert.equal(shot.statusCode, 200);
      // The run is part of the unified history and the HTML report.
      const history = (await call("GET", `${root}/reports/runs`)).body;
      assert.equal(history.runs[0].kind, "case");
      assert.equal(history.runs[0].status, "passed");
      const report = await call(
        "GET",
        `${root}/reports/runs/case/${queuedRun.body.id}/report.html`,
      );
      assert.equal(report.status, 200);
      assert.match(report.body as string, /Test case/);
      // Run verification marks the elements verified.
      const verified = (await call("GET", `${root}/ai/elements`)).body.elements
        .filter((e: { id: string }) =>
          finished.snapshot.elements.some(
            (p: { elementId: string }) => p.elementId === e.id,
          ),
        )
        .map((e: { verification: string }) => e.verification);
      assert.deepEqual([...new Set(verified)], ["verified"]);

      // Editing an element after the run: the case shows it as stale and the
      // past run keeps its snapshot.
      const submit = (await call("GET", `${root}/ai/elements/${submitId}`)).body
        .element;
      const renamed = await call("PUT", `${root}/ai/elements/${submitId}`, {
        expectedRevision: submit.revision,
        elementKey: submit.elementKey,
        name: "Giriş butonu",
        pageKey: submit.pageKey,
        locator: submit.locator,
        alternatives: submit.alternatives,
        approved: false,
      });
      assert.equal(renamed.status, 200);
      const stale = (await call("GET", `${root}/test-cases/${positive.id}`))
        .body.case;
      assert.equal(stale.stale, true);
      const usageAfter = (
        await call("GET", `${root}/ai/elements/${submitId}/usage`)
      ).body.cases.find((c: { caseId: string }) => c.caseId === positive.id);
      assert.equal(usageAfter.stale, true);
      const pastRun = (
        await call("GET", `${root}/test-case-runs/${queuedRun.body.id}`)
      ).body;
      assert.equal(pastRun.snapshot.checksum, finished.snapshot.checksum);
      assert.notEqual(
        pastRun.snapshot.elements.find(
          (e: { elementId: string }) => e.elementId === submitId,
        ).name,
        "Giriş butonu",
      );

      // A second exploration does not duplicate library elements.
      const second = await analyze();
      assert.equal(second.drafts[0].status, "ready");
      const afterSecond = (await call("GET", `${root}/ai/elements`)).body;
      assert.equal(afterSecond.total, 5);
      const suites = (await call("GET", `${root}/test-suites`)).body.suites;
      assert.equal(suites.length, 2);
      const reusedIds = suites[0].cases.flatMap(
        (c: { steps: { elementId: string }[] }) =>
          c.steps.map((s) => s.elementId),
      );
      assert.equal(
        reusedIds.every((id: string) => ids.has(id)),
        true,
      );

      // Plan mode (ADR 018): survey + proposed plan; nothing is created until
      // the selected items are generated.
      const plannedQueued = await call("POST", `${root}/ai/messages`, {
        prompt:
          "Demo Bank'ı qa@example.test ve local-fixture-only ile incele, test öner",
        targetUrl: "http://127.0.0.1:4100/login",
        providerId: saved.body.id,
        model: "fake-model",
        mode: "plan",
      });
      assert.equal(plannedQueued.status, 202);
      const planned = await until(async () => {
        const detail = (
          await call(
            "GET",
            `${root}/ai/conversations/${plannedQueued.body.conversationId}`,
          )
        ).body;
        const draft = detail.drafts[0];
        return ["planned", "failed"].includes(draft?.status) ? detail : null;
      }, 90000);
      const plannedDraft = planned.drafts[0];
      assert.equal(plannedDraft.status, "planned");
      assert.equal(plannedDraft.definition, null);
      assert.equal(plannedDraft.plan.items.length, 2);
      // Pages that were not observed are dropped from the plan.
      assert.deepEqual(plannedDraft.plan.items[0].pages, [
        "http://127.0.0.1:4100/login",
      ]);
      assert.ok(
        planned.messages.some((m: { content: string }) =>
          m.content.includes("2 test öneriyorum"),
        ),
      );
      assert.equal((await call("GET", `${root}/ai/elements`)).body.total, 5);
      assert.equal(
        (await call("GET", `${root}/test-suites`)).body.suites.length,
        2,
      );
      const noPlan = await call(
        "POST",
        `${root}/ai/drafts/${second.drafts[0].id}/generate`,
        { items: [{ title: "Bir test", category: "positive" }] },
      );
      assert.equal(noPlan.body.code, "PLAN_MISSING");
      const generate = await call(
        "POST",
        `${root}/ai/drafts/${plannedDraft.id}/generate`,
        {
          items: [
            {
              title: "Geçerli giriş bakiyeyi gösterir",
              category: "positive",
              description: "Giriş yapılır, bakiye görünür.",
            },
          ],
        },
      );
      assert.equal(generate.status, 202);
      assert.equal(generate.body.draftId, plannedDraft.id);
      const generated = await until(async () => {
        const detail = (
          await call(
            "GET",
            `${root}/ai/conversations/${plannedQueued.body.conversationId}`,
          )
        ).body;
        const draft = detail.drafts.find(
          (d: { id: string }) => d.id === plannedDraft.id,
        );
        return ["ready", "failed"].includes(draft?.status) ? draft : null;
      }, 90000);
      assert.equal(generated.status, "ready");
      assert.equal(
        (await call("GET", `${root}/test-suites`)).body.suites.length,
        3,
      );
      assert.equal((await call("GET", `${root}/ai/elements`)).body.total, 5);
      const promptSent = store.db
        .prepare(
          "SELECT payload FROM jobs WHERE kind='ai_generate' AND json_extract(payload,'$.draftId')=?",
        )
        .get(plannedDraft.id) as { payload: string };
      assert.equal(JSON.parse(promptSent.payload).plan.items.length, 1);

      // Duplicate and delete; deletion keeps the run history.
      const copy = await call(
        "POST",
        `${root}/test-cases/${positive.id}/duplicate`,
      );
      assert.equal(copy.status, 201);
      assert.equal(copy.body.case.approval, "draft");
      assert.equal(
        (await call("DELETE", `${root}/test-cases/${positive.id}`)).status,
        200,
      );
      assert.equal(
        (await call("GET", `${root}/test-cases/${positive.id}`)).status,
        404,
      );
      assert.equal(
        (await call("GET", `${root}/test-case-runs/${queuedRun.body.id}`))
          .status,
        200,
      );
    } finally {
      for (const child of processes)
        try {
          process.kill(-child.pid!, "SIGTERM");
        } catch {
          /* already stopped */
        }
      await app.close();
      await provider.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
      if (previousAllow === undefined)
        delete process.env.ZC_AI_ALLOW_LOCAL_PROVIDER;
      else process.env.ZC_AI_ALLOW_LOCAL_PROVIDER = previousAllow;
      if (previousKey === undefined) delete process.env.ZC_AI_ENCRYPTION_KEY;
      else process.env.ZC_AI_ENCRYPTION_KEY = previousKey;
    }
  },
);
