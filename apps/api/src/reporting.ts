import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { Store, localDir } from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import {
  durationMs,
  failureReason,
  FLAKY_WINDOW,
  flakiness,
  runKinds,
  STATS_WINDOW,
  testStats,
  type RunKind,
} from "../../../packages/domain/src/reporting";
import { decrypt } from "../../../packages/assistant/src/provider";
import {
  redactSecrets,
  type TestVariable,
} from "../../../packages/assistant/src/variables";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };
type Row = {
  kind: RunKind;
  id: string;
  test_id: string;
  version: number;
  status: string;
  created_at: string;
  finished_at: string | null;
  title: string;
  payload: string | null;
};

/** Canonical runs, AI suite runs and promoted AI test runs as one history. */
const unified = `
SELECT 'canonical' AS kind,r.id,r.test_id,r.revision AS version,r.status,r.created_at,r.finished_at,
  coalesce((SELECT json_extract(t.definition,'$.title') FROM tests t WHERE t.id=r.test_id AND t.revision=r.revision AND t.org_id=r.org_id),'Test') AS title,
  r.outcome AS payload
FROM runs r WHERE r.org_id=:org AND r.project_id=:project
UNION ALL
SELECT 'suite',r.id,r.suite_id,1,r.status,r.created_at,r.finished_at,
  coalesce(json_extract(s.definition,'$.title'),'AI suite'),r.result
FROM ai_suite_runs r JOIN ai_suites s ON s.id=r.suite_id AND s.org_id=r.org_id
WHERE r.org_id=:org AND r.project_id=:project
UNION ALL
SELECT 'ai_test',r.id,r.test_id,r.revision,r.status,r.created_at,r.finished_at,t.title,r.result
FROM ai_test_runs r JOIN ai_tests t ON t.id=r.test_id AND t.revision=r.revision AND t.org_id=r.org_id
WHERE r.org_id=:org AND r.project_id=:project
UNION ALL
SELECT 'case',r.id,r.case_id,r.case_revision,r.status,r.created_at,r.finished_at,
  coalesce(json_extract(r.snapshot,'$.title'),'Test case'),r.result
FROM test_case_runs r WHERE r.org_id=:org AND r.project_id=:project`;

const statuses = [
  "queued",
  "running",
  "passed",
  "failed",
  "blocked",
  "timed_out",
  "infrastructure_error",
  "cancelled",
] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const historyQuery = z.object({
  test: z
    .string()
    .regex(/^(canonical|suite|ai_test|case):[0-9a-f-]{36}$/)
    .optional(),
  status: z.enum(statuses).optional(),
  from: day.optional(),
  to: day.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const parse = (payload: string | null) => {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
};
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const kindLabels: Record<RunKind, string> = {
  canonical: "Klasik test",
  suite: "AI suite",
  ai_test: "Kalıcı AI testi",
  case: "Test case",
};
const statusLabels: Record<string, string> = {
  queued: "Kuyrukta",
  running: "Çalışıyor",
  passed: "Başarılı",
  failed: "Başarısız",
  blocked: "Engellendi",
  timed_out: "Zaman aşımı",
  infrastructure_error: "Altyapı hatası",
  cancelled: "İptal",
  not_run: "Çalıştırılmadı",
};

/** Reporting: unified run history, per-test stats, flaky flags, HTML export. */
export function registerReporting(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
) {
  const scope = (user: Actor, project: string) => ({
    org: user.orgId,
    project,
  });
  /** Keys `kind:testId:version` of flaky versions (last 10 terminal runs). */
  function flakySet(user: Actor, projectId: string) {
    const rows = store.db
      .prepare(
        `SELECT kind,test_id,version,status FROM (SELECT kind,test_id,version,status,row_number() OVER (PARTITION BY kind,test_id,version ORDER BY created_at DESC) AS rn FROM (${unified}) WHERE status NOT IN ('queued','running')) WHERE rn<=${FLAKY_WINDOW} ORDER BY kind,test_id,version`,
      )
      .all(scope(user, projectId)) as Pick<
      Row,
      "kind" | "test_id" | "version" | "status"
    >[];
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${row.kind}:${row.test_id}:${row.version}`;
      groups.set(key, [...(groups.get(key) ?? []), row.status]);
    }
    return new Set(
      [...groups].filter(([, s]) => flakiness(s).flaky).map(([key]) => key),
    );
  }
  app.get("/v1/projects/:projectId/reports/runs", async (request) => {
    const { user, projectId } = scoped(request),
      query = historyQuery.parse(request.query);
    const where: string[] = [],
      params: Record<string, string | number> = scope(user, projectId);
    if (query.test) {
      const [kind, testId] = query.test.split(":");
      where.push("kind=:fkind AND test_id=:ftest");
      params.fkind = kind!;
      params.ftest = testId!;
    }
    if (query.status) {
      where.push("status=:fstatus");
      params.fstatus = query.status;
    }
    // Date range is inclusive, in UTC calendar days.
    if (query.from) {
      where.push("created_at>=:ffrom");
      params.ffrom = `${query.from}T00:00:00.000Z`;
    }
    if (query.to) {
      const end = new Date(`${query.to}T00:00:00.000Z`);
      if (Number.isNaN(end.getTime()))
        throw new DomainError("INVALID_INPUT", "Tarih geçersiz.");
      end.setUTCDate(end.getUTCDate() + 1);
      where.push("created_at<:fto");
      params.fto = end.toISOString();
    }
    const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      store.db
        .prepare(`SELECT count(*) AS n FROM (${unified}) ${filter}`)
        .get(params)!.n,
    );
    const rows = store.db
      .prepare(
        `SELECT * FROM (${unified}) ${filter} ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset`,
      )
      .all({ ...params, limit: query.limit, offset: query.offset }) as Row[];
    const flaky = flakySet(user, projectId);
    const tests = store.db
      .prepare(
        `SELECT kind,test_id,title,max(created_at) AS last FROM (${unified}) GROUP BY kind,test_id ORDER BY last DESC LIMIT 200`,
      )
      .all(scope(user, projectId))
      .map((t) => ({
        key: `${t.kind}:${t.test_id}`,
        kind: t.kind,
        title: t.title,
      }));
    return {
      total,
      limit: query.limit,
      offset: query.offset,
      tests,
      runs: rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        testId: row.test_id,
        version: row.version,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
        durationMs: durationMs(row.created_at, row.finished_at),
        failure:
          row.status === "passed"
            ? null
            : failureReason(row.kind, parse(row.payload)),
        flaky: flaky.has(`${row.kind}:${row.test_id}:${row.version}`),
      })),
    };
  });
  app.get("/v1/projects/:projectId/reports/tests", async (request) => {
    const { user, projectId } = scoped(request),
      { n } = z
        .object({
          n: z.coerce.number().int().min(1).max(100).default(STATS_WINDOW),
        })
        .parse(request.query);
    const rows = store.db
      .prepare(
        `SELECT * FROM (SELECT *,row_number() OVER (PARTITION BY kind,test_id ORDER BY created_at DESC) AS rn_t,row_number() OVER (PARTITION BY kind,test_id,version ORDER BY created_at DESC) AS rn_v FROM (${unified}) WHERE status NOT IN ('queued','running')) WHERE rn_t<=:n OR rn_v<=${FLAKY_WINDOW} ORDER BY created_at DESC,id`,
      )
      .all({ ...scope(user, projectId), n }) as Row[];
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = `${row.kind}:${row.test_id}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return {
      window: n,
      flakyWindow: FLAKY_WINDOW,
      tests: [...groups].map(([key, runs]) => ({
        key,
        kind: runs[0]!.kind,
        testId: runs[0]!.test_id,
        title: runs[0]!.title,
        latestVersion: Math.max(...runs.map((r) => r.version)),
        lastRunAt: runs[0]!.created_at,
        ...testStats(
          runs.map((r) => ({
            id: r.id,
            version: r.version,
            status: r.status,
            createdAt: r.created_at,
            finishedAt: r.finished_at,
            failure:
              r.status === "passed"
                ? null
                : failureReason(r.kind, parse(r.payload)),
          })),
          n,
        ),
      })),
    };
  });

  /** Every secret test value of the project, to redact anything that slipped through. */
  function secrets(user: Actor, projectId: string): TestVariable[] {
    return (
      store.db
        .prepare(
          "SELECT key,value FROM test_variables WHERE org_id=? AND project_id=? AND secret=1",
        )
        .all(user.orgId, projectId) as { key: string; value: string }[]
    ).map((row) => ({ key: row.key, value: decrypt(row.value), secret: true }));
  }
  /** Embeds a PNG only when its SHA-256 matches the stored evidence record. */
  async function image(path: string, sha256?: string) {
    if (!sha256) return { state: "none" as const };
    try {
      const data = await readFile(path);
      if (createHash("sha256").update(data).digest("hex") !== sha256)
        return { state: "corrupted" as const };
      return {
        state: "ok" as const,
        src: `data:image/png;base64,${data.toString("base64")}`,
      };
    } catch {
      return { state: "missing" as const };
    }
  }
  type Locator = { kind: string; value: string; role?: string };
  type Action = {
    kind: string;
    locator?: Locator;
    element?: string;
    expected?: string;
    impact?: string;
    url?: string;
  };
  /** Action description without fill values (input data never leaves the run). */
  const describe = (action?: Action) => {
    if (!action) return "";
    const target = action.element
      ? ` · element ${action.element}`
      : action.locator
        ? ` · ${action.locator.kind}${action.locator.role ? `(${action.locator.role})` : ""}=${action.locator.value}`
        : "";
    const expected =
      action.kind === "assertText" || action.kind === "assertUrl"
        ? ` · beklenen: ${action.expected ?? ""}`
        : action.kind === "assertAccessible" && action.impact
          ? ` · eşik: ${action.impact}`
          : action.kind === "navigate"
            ? ` · ${action.url ?? ""}`
            : "";
    return `${action.kind}${target}${expected}`;
  };
  app.get(
    "/v1/projects/:projectId/reports/runs/:kind/:id/report.html",
    async (request, reply) => {
      const { user, projectId } = scoped(request),
        { kind, id } = z
          .object({ kind: z.enum(runKinds), id: z.uuid() })
          .parse(request.params);
      const row = store.db
        .prepare(`SELECT * FROM (${unified}) WHERE kind=:kind AND id=:id`)
        .get({ ...scope(user, projectId), kind, id }) as Row | undefined;
      if (!row)
        throw new DomainError("NOT_FOUND", "Çalıştırma bulunamadı.", 404);
      type Step = {
        label: string;
        status: string;
        code?: string;
        message?: string;
        detail?: string;
        findings?: {
          summary?: string;
          items?: {
            text?: string;
            id?: string;
            impact?: string;
            target?: string;
          }[];
        };
        image?: Awaited<ReturnType<typeof image>>;
      };
      type Scenario = {
        title: string;
        status: string;
        code?: string;
        steps: Step[];
        image?: Awaited<ReturnType<typeof image>>;
      };
      let checksumLabel = "Plan SHA-256",
        checksum = "",
        target = "",
        code: string | undefined;
      const scenarios: Scenario[] = [];
      const payload = parse(row.payload) as Record<string, unknown> | null;
      code = typeof payload?.code === "string" ? payload.code : undefined;
      if (kind === "canonical") {
        const run = store.db
          .prepare(
            "SELECT plan FROM runs WHERE id=? AND org_id=? AND project_id=?",
          )
          .get(id, user.orgId, projectId)!;
        const plan = JSON.parse(run.plan as string) as {
          checksum: string;
          steps: { id: string; label: string; kind: string }[];
        };
        checksum = plan.checksum;
        target = "Yerel Demo Bank";
        const outcome = payload as {
          screenshot?: { sha256: string };
          steps?: {
            id: string;
            label: string;
            kind: string;
            status: string;
            code?: string;
            expected?: unknown;
            observed?: unknown;
            durationMs?: number;
          }[];
        } | null;
        scenarios.push({
          title: row.title,
          status: row.status,
          code,
          steps: plan.steps.map((planned) => {
            const step = outcome?.steps?.find((s) => s.id === planned.id);
            return {
              label: `${planned.label} (${planned.kind})`,
              status: step?.status ?? "not_run",
              code: step?.code,
              detail:
                step && planned.kind.startsWith("assert")
                  ? `Beklenen: ${String(step.expected)} · Gözlenen: ${String(step.observed ?? "Yok")} · ${step.durationMs ?? 0} ms`
                  : step?.durationMs !== undefined
                    ? `${step.durationMs} ms`
                    : undefined,
            };
          }),
          image: await image(
            resolve(localDir, "artifacts", id, "result.png"),
            outcome?.screenshot?.sha256,
          ),
        });
      } else {
        let actions: { title: string; actions: Action[] }[];
        if (kind === "case") {
          const run = store.db
            .prepare(
              "SELECT snapshot,checksum FROM test_case_runs WHERE id=? AND org_id=? AND project_id=?",
            )
            .get(id, user.orgId, projectId)!;
          const snapshot = JSON.parse(run.snapshot as string) as {
            targetUrl: string;
            scenarios: { title: string; actions: Action[] }[];
            elements: { ref: string; name: string; elementKey: string }[];
          };
          checksumLabel = "Çalıştırma anlık görüntüsü SHA-256";
          checksum = run.checksum as string;
          target = snapshot.targetUrl;
          // Plan-local refs are shown as the frozen element name and key.
          const names = new Map(
            snapshot.elements.map((e) => [
              e.ref,
              `${e.name} (${e.elementKey})`,
            ]),
          );
          actions = snapshot.scenarios.map((s) => ({
            ...s,
            actions: s.actions.map((a) =>
              a.element
                ? { ...a, element: names.get(a.element) ?? a.element }
                : a,
            ),
          }));
        } else if (kind === "ai_test") {
          const run = store.db
            .prepare(
              "SELECT plan,checksum FROM ai_test_runs WHERE id=? AND org_id=? AND project_id=?",
            )
            .get(id, user.orgId, projectId)!;
          const plan = JSON.parse(run.plan as string) as {
            targetUrl: string;
            scenarios: { title: string; actions: Action[] }[];
          };
          checksum = run.checksum as string;
          target = plan.targetUrl;
          actions = plan.scenarios;
        } else {
          const suite = store.db
            .prepare(
              "SELECT s.definition FROM ai_suite_runs r JOIN ai_suites s ON s.id=r.suite_id AND s.org_id=r.org_id WHERE r.id=? AND r.org_id=? AND r.project_id=?",
            )
            .get(id, user.orgId, projectId)!;
          const definition = suite.definition as string;
          const parsed = JSON.parse(definition) as {
            targetUrl: string;
            scenarios: { title: string; actions: Action[] }[];
          };
          checksumLabel = "Suite tanımı SHA-256";
          checksum = createHash("sha256").update(definition).digest("hex");
          target = parsed.targetUrl;
          actions = parsed.scenarios;
        }
        const results = ((payload?.results as unknown[]) ?? []) as {
          title: string;
          status: string;
          code?: string;
          screenshot?: { sha256: string };
          steps: {
            kind: string;
            status: string;
            code?: string;
            message?: string;
            findings?: Step["findings"];
            screenshot?: { sha256: string };
          }[];
        }[];
        for (const [index, planned] of actions.entries()) {
          const result = results[index];
          const dir = resolve(store.dataDir, "artifacts", id, String(index));
          const steps: Step[] = [];
          for (const [n, action] of planned.actions.entries()) {
            const step = result?.steps[n];
            steps.push({
              label: describe(action),
              status: step?.status ?? "not_run",
              code: step?.code,
              message: step?.message,
              findings: step?.findings,
              image: step
                ? await image(
                    resolve(dir, `step-${n}.png`),
                    step.screenshot?.sha256,
                  )
                : undefined,
            });
          }
          scenarios.push({
            title: planned.title,
            status: result?.status ?? "not_run",
            code: result?.code,
            steps,
            image: await image(
              resolve(dir, `scenario-${index}.png`),
              result?.screenshot?.sha256,
            ),
          });
        }
      }
      // Stored results are already value-free; redact once more as a guarantee.
      const vars = secrets(user, projectId);
      const safe = redactSecrets(
        {
          title: row.title,
          target,
          code,
          scenarios: scenarios.map((s) => ({
            ...s,
            image: undefined,
            steps: s.steps.map((step) => ({ ...step, image: undefined })),
          })),
        },
        vars,
      );
      const figure = (img?: Awaited<ReturnType<typeof image>>, alt = "") =>
        !img || img.state === "none"
          ? ""
          : img.state === "ok"
            ? `<img src="${img.src}" alt="${escape(alt)}">`
            : `<p class="warn">Ekran görüntüsü ${img.state === "corrupted" ? "bütünlük doğrulamasını geçemedi; eklenmedi" : "bulunamadı"}.</p>`;
      const duration = durationMs(row.created_at, row.finished_at);
      const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZeroCode raporu · ${escape(safe.title)} · ${escape(id.slice(0, 8))}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#222;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e3e3e3;padding:6px 8px;text-align:left;vertical-align:top}
th{width:200px;color:#555;font-weight:600}code{font-size:12px;word-break:break-all}
.s{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:#eee}
.passed{background:#ecf5e5;color:#4e7a39}.failed{background:#fbefe9;color:#ae6250}
.blocked,.timed_out{background:#fbf5e8;color:#a78448}.infrastructure_error{background:#f6effa;color:#8d709c}
ol{padding-left:20px}li{margin:6px 0}img{display:block;max-width:100%;border:1px solid #ddd;border-radius:6px;margin:6px 0}
.warn{color:#a78448}.muted{color:#777;font-size:12px}section{border-top:1px solid #ccc;margin-top:16px}
</style></head><body>
<p class="muted">ZeroCode çalıştırma raporu · ${escape(new Date().toISOString())}</p>
<h1>${escape(safe.title)}</h1>
<table>
<tr><th>Tür</th><td>${escape(kindLabels[kind])}</td></tr>
<tr><th>Test / sürüm</th><td><code>${escape(row.test_id)}</code> · v${escape(row.version)}</td></tr>
<tr><th>Çalıştırma</th><td><code>${escape(id)}</code></td></tr>
<tr><th>Durum</th><td><span class="s ${escape(row.status)}">${escape(statusLabels[row.status] ?? row.status)}</span>${safe.code ? ` · <code>${escape(safe.code)}</code>` : ""}</td></tr>
<tr><th>Hedef</th><td>${escape(safe.target)}</td></tr>
<tr><th>Başlangıç / bitiş</th><td>${escape(row.created_at)} → ${escape(row.finished_at ?? "—")}${duration !== null ? ` (${duration} ms)` : ""}</td></tr>
<tr><th>${escape(checksumLabel)}</th><td><code>${escape(checksum)}</code></td></tr>
</table>
${safe.scenarios
  .map(
    (
      s,
      i,
    ) => `<section><h2>${escape(s.title)} <span class="s ${escape(s.status)}">${escape(statusLabels[s.status] ?? s.status)}</span>${s.code ? ` <code>${escape(s.code)}</code>` : ""}</h2>
<ol>${s.steps
      .map(
        (step, n) =>
          `<li><span class="s ${escape(step.status)}">${escape(statusLabels[step.status] ?? step.status)}</span> ${escape(step.label)}${step.code ? ` · <code>${escape(step.code)}</code>` : ""}${step.detail ? `<div class="muted">${escape(step.detail)}</div>` : ""}${step.message ? `<div>${escape(step.message)}</div>` : ""}${
            step.findings?.items?.length
              ? `<ul>${step.findings.items
                  .map(
                    (f) =>
                      `<li>${f.id ? `<code>${escape(f.id)}</code> ` : ""}${f.impact ? `<em>${escape(f.impact)}</em> ` : ""}${f.target ? `<code>${escape(f.target)}</code> ` : ""}${escape(f.text)}</li>`,
                  )
                  .join("")}</ul>`
              : ""
          }${figure(scenarios[i]!.steps[n]!.image, `${s.title} adım ${n + 1}`)}</li>`,
      )
      .join("")}</ol>
${scenarios[i]!.image?.state === "ok" ? `<p class="muted">Senaryo sonu ekran görüntüsü (SHA-256 doğrulandı, form alanları maskeli)</p>` : ""}${figure(scenarios[i]!.image, `${s.title} son durum`)}
</section>`,
  )
  .join("\n")}
<p class="muted">Girdi değerleri ve gizli test verileri rapora eklenmez. Görüntüler kayıtlı SHA-256 ile doğrulandıktan sonra gömülür.</p>
</body></html>`;
      return reply
        .type("text/html; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="zerocode-run-${id.slice(0, 8)}.html"`,
        )
        .send(html);
    },
  );
}
