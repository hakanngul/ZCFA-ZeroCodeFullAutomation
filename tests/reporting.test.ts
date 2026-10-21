import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Store } from "../packages/storage/src/index";
import { createApp } from "../apps/api/src/app";
import { demoProject } from "../packages/domain/src/index";
import {
  failureReason,
  flakiness,
  flakyVersions,
  testStats,
} from "../packages/domain/src/reporting";
import { encrypt } from "../packages/assistant/src/provider";
import { admin } from "./support";

const at = (minute: number, second = 0) =>
  new Date(Date.UTC(2026, 9, 20, 10, minute, second)).toISOString();

test("flakiness: passed and failed flip within the last 10 terminal runs", () => {
  assert.equal(flakiness(["passed", "failed"]).flaky, true);
  assert.equal(flakiness(["passed", "passed"]).flaky, false);
  // Infrastructure errors and blocked runs are shown but never flip.
  const infra = flakiness(["passed", "infrastructure_error", "blocked"]);
  assert.deepEqual(infra, {
    flaky: false,
    passed: 1,
    failed: 0,
    excluded: 2,
    window: 3,
  });
  // Pending runs are ignored; only the newest 10 terminal runs count.
  assert.equal(flakiness(["queued", "running", "passed"]).window, 1);
  const old = [...Array(10).fill("passed"), "failed"];
  assert.equal(flakiness(old).flaky, false);
  assert.equal(flakiness(["running", ...old.slice(1)]).flaky, true);
  // The same test with a passing v2 and a failing v1 is not flaky.
  assert.deepEqual(
    flakyVersions([
      { version: 2, status: "passed" },
      { version: 1, status: "failed" },
    ]),
    [],
  );
  assert.deepEqual(
    flakyVersions([
      { version: 2, status: "passed" },
      { version: 1, status: "failed" },
      { version: 1, status: "passed" },
    ]),
    [1],
  );
});

test("testStats: pass rate, average duration and last failure over last N", () => {
  const run = (
    i: number,
    status: string,
    seconds: number | null,
    failure?: string,
  ) => ({
    id: `r${i}`,
    version: 1,
    status,
    createdAt: at(50 - i),
    finishedAt: seconds === null ? null : at(50 - i, seconds),
    failure,
  });
  const stats = testStats(
    [
      run(0, "running", null),
      run(1, "cancelled", 1),
      run(2, "passed", 2),
      run(3, "failed", 4, "Giriş: assertUrl ASSERTION_FAILED"),
      run(4, "passed", 6),
      run(5, "failed", 8, "eski"),
    ],
    4,
  );
  assert.equal(stats.runs, 4);
  assert.equal(stats.passed, 2);
  assert.equal(stats.passRate, 50);
  assert.equal(stats.averageDurationMs, 3250);
  assert.equal(stats.lastFailure?.runId, "r3");
  assert.equal(stats.lastFailure?.reason, "Giriş: assertUrl ASSERTION_FAILED");
  assert.deepEqual(stats.flakyVersions, [1]);
  assert.equal(testStats([]).passRate, null);
  assert.equal(
    failureReason("ai_test", {
      status: "failed",
      results: [
        { title: "A", status: "passed", steps: [] },
        {
          title: "B",
          status: "failed",
          steps: [
            { kind: "click", status: "failed", code: "ELEMENT_NOT_FOUND" },
          ],
        },
      ],
    }),
    "B: click ELEMENT_NOT_FOUND",
  );
  assert.equal(
    failureReason("canonical", {
      status: "failed",
      steps: [
        { label: "Giriş", status: "passed" },
        { label: "Dashboard", status: "failed", code: "ASSERTION_FAILED" },
      ],
    }),
    "Dashboard: ASSERTION_FAILED",
  );
  assert.equal(
    failureReason("suite", { code: "TARGET_BLOCKED" }),
    "TARGET_BLOCKED",
  );
});

test("reporting API: unified history, stats, flaky flag and scoped HTML export without secrets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zc-report-"));
  const previousKey = process.env.ZC_AI_ENCRYPTION_KEY;
  process.env.ZC_AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const store = new Store(join(dir, "test.sqlite"));
  const app = await createApp(store);
  try {
    const headers = (user = admin) => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO sessions VALUES (?,?,?)")
        .run(id, JSON.stringify(user), Date.now() + 60000);
      return { host: "127.0.0.1:4000", cookie: `zc_session=${id}` };
    };
    const get = (url: string, user = admin) =>
      app.inject({ method: "GET", url, headers: headers(user) });
    const secret = "S3cr3t-Parola-42",
      literal = "literal-input-xyz";
    store.db
      .prepare("INSERT INTO test_variables VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        admin.orgId,
        demoProject,
        "",
        "SAUCE_PASS",
        encrypt(secret),
        1,
        at(0),
        at(0),
      );
    const conversation = randomUUID(),
      draft = randomUUID(),
      suite = randomUUID(),
      testId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run(conversation, admin.orgId, demoProject, "Rapor", at(0));
    store.db
      .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        draft,
        admin.orgId,
        demoProject,
        conversation,
        randomUUID(),
        "m",
        "https://example.test/",
        "{}",
        null,
        "ready",
        null,
        at(0),
      );
    const scenarios = [
      {
        title: "Giriş yapılır",
        category: "positive",
        actions: [
          {
            kind: "fill",
            locator: { kind: "id", value: "user" },
            value: literal,
          },
          {
            kind: "fill",
            locator: { kind: "id", value: "password" },
            value: "{{SAUCE_PASS}}",
          },
          { kind: "assertUrl", expected: "https://example.test/inventory" },
        ],
      },
    ];
    store.db.prepare("INSERT INTO ai_suites VALUES (?,?,?,?,?,?)").run(
      suite,
      admin.orgId,
      demoProject,
      draft,
      JSON.stringify({
        title: "Rapor suite",
        targetUrl: "https://example.test/",
        scenarios,
      }),
      at(0),
    );
    const suite2 = randomUUID();
    store.db
      .prepare("INSERT INTO ai_suites VALUES (?,?,?,?,?,?)")
      .run(suite2, admin.orgId, demoProject, draft, "{}", at(1));
    for (const revision of [1, 2])
      store.db
        .prepare("INSERT INTO ai_tests VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          testId,
          revision,
          admin.orgId,
          demoProject,
          revision === 1 ? suite : suite2,
          conversation,
          "Kalıcı rapor testi",
          "https://example.test",
          "{}",
          "x",
          at(revision),
        );
    const plan = JSON.stringify({
      schemaVersion: "ai-plan-1.0",
      testId,
      testRevision: 1,
      targetUrl: "https://example.test/",
      scenarios,
      checksum: "c".repeat(64),
    });
    const png = (seed: string) =>
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(seed),
      ]);
    const sha = (data: Buffer) =>
      createHash("sha256").update(data).digest("hex");
    const aiRun = (
      revision: number,
      status: string,
      minute: number,
      result: unknown,
    ) => {
      const id = randomUUID();
      store.db
        .prepare("INSERT INTO ai_test_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          id,
          admin.orgId,
          demoProject,
          testId,
          revision,
          plan,
          "c".repeat(64),
          status,
          JSON.stringify(result),
          at(minute),
          at(minute, 3),
        );
      return id;
    };
    const step0 = png("step-0"),
      step1 = png("step-1"),
      final = png("final");
    const failedRun = aiRun(1, "failed", 5, {
      status: "failed",
      results: [
        {
          title: "Giriş yapılır",
          status: "failed",
          code: "ASSERTION_FAILED",
          steps: [
            {
              kind: "fill",
              status: "passed",
              screenshot: { filename: "step-0.png", sha256: sha(step0) },
            },
            {
              kind: "fill",
              status: "passed",
              // Corrupted on disk below: must not be embedded.
              screenshot: { filename: "step-1.png", sha256: "0".repeat(64) },
            },
            {
              kind: "assertUrl",
              status: "failed",
              code: "ASSERTION_FAILED",
              // A leaked secret in stored text is redacted on export.
              message: `beklenmeyen ${secret}`,
            },
          ],
          screenshot: { filename: "scenario-0.png", sha256: sha(final) },
        },
      ],
    });
    const artifacts = join(dir, "artifacts", failedRun, "0");
    mkdirSync(artifacts, { recursive: true });
    writeFileSync(join(artifacts, "step-0.png"), step0);
    writeFileSync(join(artifacts, "step-1.png"), step1);
    writeFileSync(join(artifacts, "scenario-0.png"), final);
    aiRun(1, "passed", 6, { status: "passed", results: [] });
    aiRun(1, "infrastructure_error", 7, { code: "WORKER_LEASE_EXPIRED" });
    aiRun(2, "passed", 8, { status: "passed", results: [] });
    aiRun(2, "blocked", 9, { code: "TARGET_BLOCKED", results: [] });
    const suiteRun = randomUUID();
    store.db
      .prepare("INSERT INTO ai_suite_runs VALUES (?,?,?,?,?,?,?,?)")
      .run(
        suiteRun,
        admin.orgId,
        demoProject,
        suite,
        "passed",
        JSON.stringify({ status: "passed", results: [] }),
        at(10),
        at(10, 2),
      );

    const root = `/v1/projects/${demoProject}/reports`;
    const all = (await get(`${root}/runs?limit=2`)).json();
    assert.equal(all.total, 6);
    assert.equal(all.runs.length, 2);
    assert.equal(all.runs[0].kind, "suite");
    assert.equal(all.runs[1].status, "blocked");
    assert.equal(all.runs[1].flaky, false);
    const page2 = (await get(`${root}/runs?limit=2&offset=2`)).json();
    assert.equal(page2.runs[0].id === all.runs[0].id, false);
    const v1 = (
      await get(`${root}/runs?test=ai_test:${testId}&status=failed`)
    ).json();
    assert.equal(v1.total, 1);
    assert.equal(v1.runs[0].flaky, true);
    assert.equal(
      v1.runs[0].failure,
      "Giriş yapılır: assertUrl ASSERTION_FAILED",
    );
    assert.equal(v1.runs[0].durationMs, 3000);
    assert.equal(
      (await get(`${root}/runs?from=2026-10-21&to=2026-10-22`)).json().total,
      0,
    );
    assert.equal(
      (await get(`${root}/runs?from=2026-10-20&to=2026-10-20`)).json().total,
      6,
    );
    assert.equal((await get(`${root}/runs?status=nope`)).statusCode, 400);
    const stats = (await get(`${root}/tests`)).json();
    const promoted = stats.tests.find(
      (t: { key: string }) => t.key === `ai_test:${testId}`,
    );
    assert.equal(promoted.runs, 5);
    assert.equal(promoted.passRate, 40);
    assert.deepEqual(promoted.flakyVersions, [1]);
    assert.equal(promoted.lastFailure.status, "blocked");
    assert.equal(promoted.averageDurationMs, 3000);

    const exportUrl = `/v1/projects/${demoProject}/reports/runs/ai_test/${failedRun}/report.html`;
    const report = await get(exportUrl);
    assert.equal(report.statusCode, 200);
    assert.match(report.headers["content-type"] as string, /text\/html/);
    assert.match(
      report.headers["content-disposition"] as string,
      /attachment; filename="zerocode-run-/,
    );
    const html = report.body;
    assert.equal(html.includes(secret), false);
    assert.equal(html.includes(literal), false);
    assert.equal(html.includes("{{SAUCE_PASS}}"), true); // redacted reference
    assert.equal(html.includes("c".repeat(64)), true);
    assert.equal(html.includes("Kalıcı rapor testi"), true);
    assert.equal(html.includes(step0.toString("base64")), true);
    assert.equal(html.includes(final.toString("base64")), true);
    assert.equal(html.includes(step1.toString("base64")), false);
    assert.match(html, /bütünlük doğrulamasını geçemedi/);
    assert.equal(/<script/i.test(html), false);
    const suiteReport = await get(
      `/v1/projects/${demoProject}/reports/runs/suite/${suiteRun}/report.html`,
    );
    assert.equal(suiteReport.statusCode, 200);
    assert.match(suiteReport.body, /Suite tanımı SHA-256/);
    assert.equal(suiteReport.body.includes(literal), false);
    // Wrong kind for an id, another org, or another org's project: not found.
    assert.equal(
      (
        await get(
          `/v1/projects/${demoProject}/reports/runs/suite/${failedRun}/report.html`,
        )
      ).statusCode,
      404,
    );
    const other = { ...admin, orgId: randomUUID() },
      otherProject = randomUUID();
    store.db
      .prepare("INSERT INTO projects VALUES (?,?,?)")
      .run(otherProject, other.orgId, "Diğer");
    assert.equal((await get(exportUrl, other)).statusCode, 404);
    assert.equal(
      (
        await get(
          `/v1/projects/${otherProject}/reports/runs/ai_test/${failedRun}/report.html`,
          other,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (await get(`/v1/projects/${otherProject}/reports/runs`, other)).json()
        .total,
      0,
    );
    assert.equal((await get(`${root}/tests`, other)).statusCode, 404);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: exportUrl,
          headers: { host: "127.0.0.1:4000" },
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.ZC_AI_ENCRYPTION_KEY;
    else process.env.ZC_AI_ENCRYPTION_KEY = previousKey;
  }
});
