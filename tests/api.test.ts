import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../packages/storage/src/index";
import { createApp } from "../apps/api/src/app";
import {
  compile,
  demoProject,
  type Element,
} from "../packages/domain/src/index";
import { admin, definition, model } from "./support";

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "zc-unit-"));
  const store = new Store(join(dir, "test.sqlite"));
  const app = await createApp(store);
  function headers(user = admin) {
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
  }
  function seedModel() {
    const m = model();
    store.db
      .prepare("INSERT INTO models VALUES (?,?,?,?)")
      .run(m.orgId, m.projectId, m.revision, JSON.stringify(m));
  }
  return {
    store,
    app,
    headers,
    seedModel,
    async close() {
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("session is required; bootstrap rejects cross-origin writes and foreign host", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await f.app.inject({
          url: "/v1/workspace",
          headers: { host: "127.0.0.1" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/v1/session/local",
          headers: {
            host: "127.0.0.1",
            origin: "https://evil.test",
            "x-zerocode-client": "local-ui",
          },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await f.app.inject({ url: "/health", headers: { host: "evil.test" } }))
        .statusCode,
      403,
    );
    const session = await f.app.inject({
      method: "POST",
      url: "/v1/session/local",
      headers: {
        host: "127.0.0.1",
        origin: "http://127.0.0.1:3000",
        "x-zerocode-client": "local-ui",
      },
    });
    assert.equal(session.statusCode, 200);
    assert.match(session.headers["set-cookie"] as string, /HttpOnly/);
    assert.match(session.headers["set-cookie"] as string, /SameSite=Strict/i);
  } finally {
    await f.close();
  }
});
test("other tenant cannot read project, run, artifact or schedule test", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition();
    f.store.publish(admin, t);
    const run = f.store.enqueueRun(
      admin,
      t,
      compile(t, model()),
      "healthy",
      randomUUID(),
    );
    const headers = f.headers({ ...admin, orgId: randomUUID() });
    for (const url of [
      `/v1/projects/${demoProject}`,
      `/v1/runs/${run.id}`,
      `/v1/runs/${run.id}/screenshot`,
    ])
      assert.equal((await f.app.inject({ url, headers })).statusCode, 404);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/tests/${t.testId}/runs`,
          headers: { ...headers, "idempotency-key": randomUUID() },
          payload: { variant: "healthy" },
        })
      ).statusCode,
      404,
    );
  } finally {
    await f.close();
  }
});
test("viewer cannot approve, publish or run", async () => {
  const f = await fixture();
  try {
    const headers = f.headers({ ...admin, role: "viewer" });
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/discovery-scans`,
          headers,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/tests`,
          headers,
          payload: definition(),
        })
      ).statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});
test("API rejects assertion-less publish; valid definition and model are immutable", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition(),
      bad = definition();
    bad.steps.pop();
    const headers = f.headers();
    const invalid = await f.app.inject({
      method: "POST",
      url: `/v1/projects/${demoProject}/tests`,
      headers,
      payload: bad,
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().code, "ASSERTION_REQUIRED");
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/tests`,
          headers,
          payload: t,
        })
      ).statusCode,
      201,
    );
    assert.throws(
      () =>
        f.store.db
          .prepare("UPDATE tests SET definition='{}' WHERE id=?")
          .run(t.testId),
      /immutable/,
    );
    assert.throws(
      () => f.store.db.prepare("UPDATE models SET definition='{}'").run(),
      /immutable/,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/tests`,
          headers,
          payload: t,
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});
test("idempotency returns same run and conflicts on changed payload", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition();
    f.store.publish(admin, t);
    const headers = { ...f.headers(), "idempotency-key": randomUUID() };
    const request = {
      method: "POST" as const,
      url: `/v1/tests/${t.testId}/runs`,
      headers,
      payload: { variant: "healthy" },
    };
    const a = await f.app.inject(request),
      b = await f.app.inject(request);
    assert.equal(a.statusCode, 202);
    assert.equal(a.json().id, b.json().id);
    assert.equal(
      (await f.app.inject({ ...request, payload: { variant: "broken" } }))
        .statusCode,
      409,
    );
    assert.equal(
      f.store.db.prepare("SELECT count(*) AS n FROM runs").get()!.n,
      1,
    );
  } finally {
    await f.close();
  }
});
test("claim is exclusive, expired worker is infra error; stale finalize cannot overwrite", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition();
    f.store.publish(admin, t);
    const run = f.store.enqueueRun(
      admin,
      t,
      compile(t, model()),
      "healthy",
      randomUUID(),
    );
    const job = f.store.claim()!;
    assert.ok(job);
    assert.equal(f.store.claim(), undefined);
    f.store.db
      .prepare("UPDATE jobs SET lease_until=? WHERE id=?")
      .run(Date.now() - 1, job.id);
    f.store.claim();
    assert.equal(f.store.run(admin, run.id).status, "infrastructure_error");
    assert.equal(
      f.store.finish(job, {
        status: "passed",
        steps: [],
        assertionsExecuted: 0,
      }),
      false,
    );
    assert.equal(f.store.run(admin, run.id).status, "infrastructure_error");
  } finally {
    await f.close();
  }
});
test("cancelled run cannot be finalized or mutated and queue full rejects excess work", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition();
    f.store.publish(admin, t);
    const run = f.store.enqueueRun(
      admin,
      t,
      compile(t, model()),
      "healthy",
      randomUUID(),
    );
    const job = f.store.claim()!;
    const cancelled = await f.app.inject({
      method: "POST",
      url: `/v1/runs/${run.id}/cancel`,
      headers: f.headers(),
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(
      f.store.finish(job, {
        status: "passed",
        steps: [],
        assertionsExecuted: 0,
      }),
      false,
    );
    assert.equal(f.store.run(admin, run.id).status, "cancelled");
    assert.throws(
      () =>
        f.store.db
          .prepare("UPDATE runs SET plan=? WHERE id=?")
          .run("{}", run.id),
      /immutable/,
    );
    for (let i = 0; i < 20; i++)
      f.store.enqueueRun(
        admin,
        t,
        compile(t, model()),
        "healthy",
        randomUUID(),
      );
    assert.throws(
      () =>
        f.store.enqueueRun(
          admin,
          t,
          compile(t, model()),
          "healthy",
          randomUUID(),
        ),
      /dolu/,
    );
  } finally {
    await f.close();
  }
});
test("a worker cannot finalize PASS without matching assertions and screenshot evidence", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const t = definition();
    f.store.publish(admin, t);
    const run = f.store.enqueueRun(
      admin,
      t,
      compile(t, model()),
      "healthy",
      randomUUID(),
    );
    const job = f.store.claim()!;
    assert.equal(
      f.store.finish(job, {
        status: "passed",
        steps: [],
        assertionsExecuted: 0,
      }),
      true,
    );
    assert.equal(f.store.run(admin, run.id).status, "infrastructure_error");
    assert.match(f.store.run(admin, run.id).outcome!, /INVALID_PASS_EVIDENCE/);
  } finally {
    await f.close();
  }
});

test("element edits create a new revision and preserve published plans and history", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const original = definition();
    f.store.publish(admin, original);
    const before = compile(original, model());
    const element: Element = {
      ...model().elements[2]!,
      locator: { kind: "css", value: '[data-testid="login-submit"]' },
      alternatives: [
        { kind: "xpath", value: '//*[@data-testid="login-submit"]' },
        { kind: "role", role: "button", value: "Giriş yap" },
      ],
    };
    const headers = f.headers();
    const response = await f.app.inject({
      method: "PUT",
      url: `/v1/projects/${demoProject}/elements/login.submit`,
      headers,
      payload: { expectedRevision: 1, element },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().revision, 2);
    assert.deepEqual(
      compile(original, f.store.model(admin, demoProject, 1)),
      before,
    );
    const next = {
      ...original,
      appModelRef: { ...original.appModelRef, revision: 2 },
    };
    assert.equal(
      (compile(next, response.json()).steps[3] as { target: { kind: string } })
        .target.kind,
      "css",
    );
    const history = await f.app.inject({
      url: `/v1/projects/${demoProject}/elements/history`,
      headers,
    });
    assert.deepEqual(
      history.json().revisions.map((r: { revision: number }) => r.revision),
      [2, 1],
    );
    const old = await f.app.inject({
      url: `/v1/projects/${demoProject}/elements?revision=1`,
      headers,
    });
    assert.equal(old.json().elements[2].locator.kind, "testId");
    const usage = await f.app.inject({
      url: `/v1/projects/${demoProject}/elements/login.submit/usage`,
      headers,
    });
    assert.equal(usage.json().tests[0].modelRevision, 1);
    assert.equal(usage.json().flow, true);
  } finally {
    await f.close();
  }
});
test("manual element creation works without discovery and stale revisions or duplicate IDs are rejected", async () => {
  const f = await fixture();
  try {
    const headers = f.headers();
    const element = {
      ...model().elements[0]!,
      approved: false,
      locator: { kind: "id", value: "email" },
      dom: { id: "email" },
    };
    const response = await f.app.inject({
      method: "POST",
      url: `/v1/projects/${demoProject}/elements`,
      headers,
      payload: { expectedRevision: 0, element },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().elements[0].id, "login.username");
    assert.equal(response.json().elements[0].locator.value, "email");
    const stale = await f.app.inject({
      method: "PUT",
      url: `/v1/projects/${demoProject}/elements/login.username`,
      headers,
      payload: { expectedRevision: 0, element },
    });
    assert.equal(stale.statusCode, 409);
    const duplicate = await f.app.inject({
      method: "POST",
      url: `/v1/projects/${demoProject}/elements`,
      headers,
      payload: { expectedRevision: 1, element },
    });
    assert.equal(duplicate.statusCode, 409);
    const renamed = await f.app.inject({
      method: "PUT",
      url: `/v1/projects/${demoProject}/elements/login.username`,
      headers,
      payload: {
        expectedRevision: 1,
        element: { ...element, id: "renamed.element" },
      },
    });
    assert.equal(renamed.statusCode, 400);
    assert.equal(f.store.model(admin, demoProject)!.revision, 1);
  } finally {
    await f.close();
  }
});
test("element and locator-check endpoints enforce tenant scoping and viewer permissions", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const foreign = f.headers({ ...admin, orgId: randomUUID() });
    for (const path of [
      "elements",
      "elements/history",
      "elements/login.submit/usage",
    ])
      assert.equal(
        (
          await f.app.inject({
            url: `/v1/projects/${demoProject}/${path}`,
            headers: foreign,
          })
        ).statusCode,
        404,
      );
    const payload = { expectedRevision: 1, element: model().elements[0] };
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/elements`,
          headers: foreign,
          payload,
        })
      ).statusCode,
      404,
    );
    const viewer = f.headers({ ...admin, role: "viewer" });
    for (const method of ["POST", "PUT"] as const)
      assert.equal(
        (
          await f.app.inject({
            method,
            url: `/v1/projects/${demoProject}/elements${method === "PUT" ? "/login.username" : ""}`,
            headers: viewer,
            payload,
          })
        ).statusCode,
        403,
      );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: `/v1/projects/${demoProject}/locator-checks`,
          headers: viewer,
          payload: { page: "login", locator: { kind: "css", value: "button" } },
        })
      ).statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});
test("locator checks use isolated scoped jobs, terminal results and lease expiry", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const headers = f.headers();
    const path = `/v1/projects/${demoProject}/locator-checks`;
    const response = await f.app.inject({
      method: "POST",
      url: path,
      headers,
      payload: { page: "login", locator: { kind: "xpath", value: "//button" } },
    });
    assert.equal(response.statusCode, 202);
    const id = response.json().id;
    const job = f.store.claim()!;
    assert.equal(job.kind, "locator_check");
    assert.equal(
      f.store.finishLocatorCheck(
        job,
        { count: 1, resolution: "unique", visible: true, durationMs: 10 },
        "completed",
      ),
      true,
    );
    assert.equal(
      f.store.finishLocatorCheck(job, { count: 0 }, "completed"),
      false,
    );
    const result = await f.app.inject({ url: `${path}/${id}`, headers });
    assert.equal(result.json().status, "completed");
    assert.equal(result.json().result.count, 1);
    assert.equal(
      (
        await f.app.inject({
          url: `${path}/${id}`,
          headers: f.headers({ ...admin, orgId: randomUUID() }),
        })
      ).statusCode,
      404,
    );
    const second = await f.app.inject({
      method: "POST",
      url: path,
      headers,
      payload: { page: "dashboard", locator: { kind: "css", value: "h1" } },
    });
    const expired = f.store.claim()!;
    f.store.db
      .prepare("UPDATE jobs SET lease_until=? WHERE id=?")
      .run(Date.now() - 1, expired.id);
    f.store.claim();
    const failed = await f.app.inject({
      url: `${path}/${second.json().id}`,
      headers,
    });
    assert.equal(failed.json().result.code, "WORKER_LEASE_EXPIRED");
  } finally {
    await f.close();
  }
});
test("duplicate locators, arbitrary code and unknown page routes cannot be stored or checked", async () => {
  const f = await fixture();
  try {
    f.seedModel();
    const headers = f.headers();
    const element = model().elements[0]!;
    const duplicate = await f.app.inject({
      method: "PUT",
      url: `/v1/projects/${demoProject}/elements/login.username`,
      headers,
      payload: {
        expectedRevision: 1,
        element: { ...element, alternatives: [element.locator] },
      },
    });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(duplicate.json().code, "DUPLICATE_LOCATOR");
    for (const payload of [
      {
        page: "http://169.254.169.254",
        locator: { kind: "css", value: "button" },
      },
      { page: "login", locator: { kind: "eval", value: "process.exit()" } },
      {
        page: "login",
        locator: { kind: "css", value: "button" },
        url: "http://evil.test",
      },
    ])
      assert.equal(
        (
          await f.app.inject({
            method: "POST",
            url: `/v1/projects/${demoProject}/locator-checks`,
            headers,
            payload,
          })
        ).statusCode,
        400,
      );
  } finally {
    await f.close();
  }
});
