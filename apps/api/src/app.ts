import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import { z, ZodError } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Store, localDir } from "../../../packages/storage/src/index";
import {
  compile,
  demoApplication,
  demoOrg,
  demoProject,
  demoUser,
  DomainError,
  testSchema,
  variants,
  type Actor,
  type AppModel,
  type Element,
  type RunOutcome,
} from "../../../packages/domain/src/index";

const uiOrigins = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);
const projectParams = z.object({ projectId: z.uuid() });
export async function createApp(store = new Store()) {
  const app = Fastify({
    bodyLimit: 32768,
    logger: false,
    requestTimeout: 10000,
  });
  await app.register(cookie);
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    const host = request.headers.host?.split(":")[0];
    if (host !== "127.0.0.1" && host !== "localhost")
      throw new DomainError("HOST_BLOCKED", "Yalnız yerel erişim.", 403);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (
        !uiOrigins.has(request.headers.origin ?? "") ||
        request.headers["x-zerocode-client"] !== "local-ui"
      )
        throw new DomainError(
          "CSRF_BLOCKED",
          "İstek kaynağı doğrulanamadı.",
          403,
        );
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: "INVALID_INPUT",
        message: "Alanları kontrol edin.",
        requestId: request.id,
      });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500)
      return reply.code(statusCode).send({
        code: "INVALID_REQUEST",
        message: "İstek işlenemedi.",
        requestId: request.id,
      });
    console.error(
      JSON.stringify({ requestId: request.id, code: "INTERNAL_ERROR" }),
    );
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "İşlem tamamlanamadı.",
      requestId: request.id,
    });
  });
  const actor = (request: FastifyRequest, write = false): Actor => {
    const row = store.db
      .prepare("SELECT actor FROM sessions WHERE id=? AND expires>?")
      .get(request.cookies.zc_session ?? "", Date.now());
    if (!row)
      throw new DomainError(
        "UNAUTHENTICATED",
        "Önce yerel çalışma alanını açın.",
        401,
      );
    const user = JSON.parse(row.actor as string) as Actor;
    if (write && user.role === "viewer")
      throw new DomainError("FORBIDDEN", "Düzenleme yetkisi gerekli.", 403);
    return user;
  };
  app.get("/health", async () => ({
    status: "ok",
    service: "zerocode-api",
    mode: "local-prototype",
  }));
  app.post("/v1/session/local", async (_, reply) => {
    const id = randomUUID(),
      user: Actor = { userId: demoUser, orgId: demoOrg, role: "admin" };
    store.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    store.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(id, JSON.stringify(user), Date.now() + 8 * 3600_000);
    reply.setCookie("zc_session", id, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    });
    return { actor: user, projectId: demoProject, mode: "local-demo-session" };
  });
  app.delete("/v1/session", async (request, reply) => {
    store.db
      .prepare("DELETE FROM sessions WHERE id=?")
      .run(request.cookies.zc_session ?? "");
    reply.clearCookie("zc_session", { path: "/" });
    return { status: "signed_out" };
  });
  app.get("/v1/workspace", async (request) => {
    const user = actor(request);
    return {
      actor: user,
      projects: store.db
        .prepare("SELECT id,name FROM projects WHERE org_id=?")
        .all(user.orgId),
      mode: "local-prototype",
    };
  });
  app.get("/v1/projects/:projectId", async (request) => {
    const user = actor(request),
      { projectId } = projectParams.parse(request.params);
    const project = store.project(user, projectId);
    const scans = store.db
      .prepare(
        "SELECT * FROM scans WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 10",
      )
      .all(user.orgId, projectId)
      .map((row) => ({
        ...row,
        findings: row.findings ? JSON.parse(row.findings as string) : null,
      }));
    const tests = store.db
      .prepare(
        "SELECT definition FROM tests WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 30",
      )
      .all(user.orgId, projectId)
      .map((row) => JSON.parse(row.definition as string));
    const runs = store.db
      .prepare(
        "SELECT id,test_id,revision,variant,status,created_at,finished_at FROM runs WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 30",
      )
      .all(user.orgId, projectId);
    const audit = store.db
      .prepare(
        "SELECT action,object_id,created_at FROM audit WHERE org_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20",
      )
      .all(user.orgId, projectId);
    return {
      project,
      application: {
        id: demoApplication,
        name: "Demo Bank",
        origin: "Yerel demo uygulaması",
      },
      model: store.model(user, projectId),
      scans,
      tests,
      runs,
      audit,
    };
  });
  app.post(
    "/v1/projects/:projectId/discovery-scans",
    async (request, reply) => {
      const user = actor(request, true),
        { projectId } = projectParams.parse(request.params);
      store.project(user, projectId);
      const id = randomUUID(),
        now = new Date().toISOString();
      store.transaction(() => {
        const running = store.db
          .prepare(
            "SELECT id FROM scans WHERE org_id=? AND project_id=? AND status IN ('queued','running')",
          )
          .get(user.orgId, projectId);
        if (running)
          throw new DomainError(
            "SCAN_IN_PROGRESS",
            "Keşif zaten sürüyor.",
            409,
          );
        store.db
          .prepare("INSERT INTO scans VALUES (?,?,?,?,?,?)")
          .run(id, user.orgId, projectId, "queued", null, now);
        store.db
          .prepare(
            "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .run(id, user.orgId, projectId, "discovery", "{}", "queued", now);
        store.audit(user, projectId, "discovery.queued", id);
      });
      return reply.code(202).send({ id, status: "queued" });
    },
  );
  app.post("/v1/projects/:projectId/mappings/review", async (request) => {
    const user = actor(request, true),
      { projectId } = projectParams.parse(request.params);
    store.project(user, projectId);
    const body = z
      .object({
        scanId: z.uuid(),
        approvedIds: z.array(z.string()).min(1).max(5),
      })
      .strict()
      .parse(request.body);
    return store.transaction(() => {
      const scan = store.db
        .prepare("SELECT * FROM scans WHERE id=? AND org_id=? AND project_id=?")
        .get(body.scanId, user.orgId, projectId);
      if (!scan) throw new DomainError("NOT_FOUND", "Keşif bulunamadı.", 404);
      if (scan.status !== "awaiting_review")
        throw new DomainError(
          "SCAN_NOT_REVIEWABLE",
          "Keşif onay beklemiyor.",
          409,
        );
      const elements = (
        JSON.parse(scan.findings as string).elements as Element[]
      ).map((e) => ({ ...e, approved: body.approvedIds.includes(e.id) }));
      if (body.approvedIds.some((id) => !elements.some((e) => e.id === id)))
        throw new DomainError("UNKNOWN_ELEMENT", "Bilinmeyen öğe.");
      if (
        [
          "login.username",
          "login.password",
          "login.submit",
          "dashboard.heading",
        ].some((id) => !elements.find((e) => e.id === id)?.approved)
      )
        throw new DomainError(
          "REQUIRED_MAPPING",
          "Giriş öğeleri ve Dashboard onaylanmalı.",
        );
      const revision = (store.model(user, projectId)?.revision ?? 0) + 1;
      const model: AppModel = {
        orgId: user.orgId,
        projectId,
        applicationId: demoApplication,
        revision,
        elements,
        flow: {
          id: "login",
          revision,
          name: "Geçerli demo hesabıyla giriş yap",
          targets: ["login.username", "login.password", "login.submit"],
        },
      };
      store.db
        .prepare("INSERT INTO models VALUES (?,?,?,?)")
        .run(user.orgId, projectId, revision, JSON.stringify(model));
      store.db
        .prepare("UPDATE scans SET status='approved' WHERE id=? AND org_id=?")
        .run(body.scanId, user.orgId);
      store.audit(user, projectId, "mapping.approved", body.scanId);
      return model;
    });
  });
  app.post("/v1/projects/:projectId/tests", async (request, reply) => {
    const user = actor(request, true),
      { projectId } = projectParams.parse(request.params);
    const test = testSchema.parse(request.body);
    store.project(user, projectId);
    if (test.projectId !== projectId || test.orgId !== user.orgId)
      throw new DomainError("SCOPE_MISMATCH", "Proje kapsamı uyuşmuyor.", 403);
    const model = store.model(user, projectId, test.appModelRef.revision);
    if (!model)
      throw new DomainError("MODEL_REQUIRED", "Önce eşlemeleri onaylayın.");
    const prior = store.db
      .prepare(
        "SELECT org_id,project_id,MAX(revision) AS revision FROM tests WHERE id=?",
      )
      .get(test.testId);
    if (
      prior?.revision &&
      (prior.org_id !== user.orgId || prior.project_id !== projectId)
    )
      throw new DomainError("NOT_FOUND", "Test bulunamadı.", 404);
    if (test.revision !== Number(prior?.revision ?? 0) + 1)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Yeni sürüm numarasını kullanın.",
        409,
      );
    const plan = compile(test, model);
    try {
      store.publish(user, test);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint"))
        throw new DomainError("REVISION_CONFLICT", "Sürüm zaten mevcut.", 409);
      throw error;
    }
    return reply.code(201).send({ test, plan });
  });
  app.post("/v1/tests/:id/runs", async (request, reply) => {
    const user = actor(request, true),
      { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { variant } = z
      .object({ variant: z.enum(variants).default("healthy") })
      .strict()
      .parse(request.body ?? {});
    const key = z
      .string()
      .min(8)
      .max(100)
      .parse(request.headers["idempotency-key"]);
    const test = store.test(user, id),
      model = store.model(user, test.projectId, test.appModelRef.revision);
    if (!model)
      throw new DomainError("MODEL_REQUIRED", "Sabitlenmiş model bulunamadı.");
    const run = store.enqueueRun(
      user,
      test,
      compile(test, model),
      variant,
      key,
    );
    return reply.code(202).send({ id: run.id, status: run.status });
  });
  app.get("/v1/runs/:id", async (request) => {
    const user = actor(request),
      { id } = z.object({ id: z.uuid() }).parse(request.params);
    const run = store.run(user, id);
    return {
      ...run,
      plan: JSON.parse(run.plan),
      outcome: run.outcome ? JSON.parse(run.outcome) : null,
    };
  });
  app.post("/v1/runs/:id/cancel", async (request) => {
    const user = actor(request, true),
      { id } = z.object({ id: z.uuid() }).parse(request.params);
    return store.transaction(() => {
      const run = store.run(user, id);
      if (!["queued", "running"].includes(run.status))
        throw new DomainError(
          "RUN_TERMINAL",
          "Çalıştırma zaten tamamlandı.",
          409,
        );
      store.db
        .prepare(
          "UPDATE runs SET status='cancelled',outcome=?,finished_at=? WHERE id=? AND org_id=?",
        )
        .run(
          JSON.stringify({
            status: "cancelled",
            code: "CANCELLED",
            steps: [],
            assertionsExecuted: 0,
          }),
          new Date().toISOString(),
          id,
          user.orgId,
        );
      store.db
        .prepare("UPDATE jobs SET status='done' WHERE id=? AND org_id=?")
        .run(id, user.orgId);
      store.audit(user, run.project_id, "run.cancelled", id);
      return { status: "cancelled" };
    });
  });
  app.get("/v1/runs/:id/screenshot", async (request, reply) => {
    const user = actor(request),
      { id } = z.object({ id: z.uuid() }).parse(request.params);
    const run = store.run(user, id),
      outcome: RunOutcome | null = run.outcome ? JSON.parse(run.outcome) : null;
    if (!outcome?.screenshot)
      throw new DomainError(
        "EVIDENCE_UNAVAILABLE",
        "Bu sonuç için görüntü yok.",
        404,
      );
    const data = await readFile(
      resolve(localDir, "artifacts", id, "result.png"),
    );
    if (
      createHash("sha256").update(data).digest("hex") !==
      outcome.screenshot.sha256
    )
      throw new DomainError(
        "EVIDENCE_CORRUPTED",
        "Kanıt bütünlüğü doğrulanamadı.",
        409,
      );
    return reply.type("image/png").send(data);
  });
  return app;
}
