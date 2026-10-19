import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../packages/storage/src/index";
import { createApp } from "../apps/api/src/app";
import { compile, demoProject } from "../packages/domain/src/index";
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
