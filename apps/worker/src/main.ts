import { resolve } from "node:path";
import {
  draftIdOf,
  localDir,
  Store,
  type Job,
} from "../../../packages/storage/src/index";
import {
  discover,
  execute,
  launchBrowser,
  checkLocator,
} from "../../../packages/runner/src/index";
import { DomainError, locatorSchema } from "../../../packages/domain/src/index";
import {
  authorizedTarget,
  checkTargetNetwork,
  exploreTarget,
  generateSuite,
  newGenerationMetrics,
  normalizeInspection,
  type GenerationMetrics,
  executeSuite,
  suiteLeaseMs,
} from "../../../packages/assistant/src/agent";
import type { Provider } from "../../../packages/assistant/src/provider";
import { providerRequest } from "../../../packages/assistant/src/provider";
import { aiSuiteSchema } from "../../../packages/assistant/src/spec";
import {
  evidencedPass,
  verifyPlan,
  type PromotedPlan,
} from "../../../packages/assistant/src/promote";
import { loadVariables } from "../../../packages/assistant/src/variables";
import { randomUUID } from "node:crypto";

const store = new Store();
let stopping = false;
let current: AbortController | undefined;
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    stopping = true;
    current?.abort();
  });
console.log(
  JSON.stringify({ service: "worker", event: "ready", concurrency: 1 }),
);
while (!stopping) {
  const job = store.claim();
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    continue;
  }
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  // Generation metrics survive a failed ai_generate so the comparison shows them.
  let generation:
    | { draftId: string; metrics: GenerationMetrics; started: number }
    | undefined;
  let cancelPoll: ReturnType<typeof setInterval> | undefined;
  try {
    // Suite generation only talks to the provider; it needs no browser.
    if (job.kind !== "ai_generate") browser = await launchBrowser();
    if (job.kind === "discovery") {
      const findings = await discover(browser!);
      store.transaction(() => {
        const valid = store.db
          .prepare(
            "SELECT id FROM jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>=?",
          )
          .get(job.id, job.lease_token, Date.now());
        if (!valid) return;
        store.db
          .prepare(
            "UPDATE scans SET status='awaiting_review',findings=? WHERE id=? AND org_id=?",
          )
          .run(JSON.stringify(findings), job.id, job.org_id);
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=?")
          .run(job.id);
      });
    } else if (job.kind === "locator_check") {
      const row = store.db
        .prepare(
          "SELECT page,locator FROM locator_checks WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(job.id, job.org_id, job.project_id);
      if (!row)
        throw new DomainError("NOT_FOUND", "Locator denemesi bulunamadı.");
      const result = await checkLocator(
        browser!,
        row.page as "login" | "dashboard",
        locatorSchema.parse(JSON.parse(row.locator as string)),
      );
      store.finishLocatorCheck(job, result, "completed");
    } else if (job.kind === "ai_analysis") {
      const draft = store.db
        .prepare(
          "SELECT * FROM ai_drafts WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(job.id, job.org_id, job.project_id);
      if (!draft) throw new DomainError("NOT_FOUND", "AI taslağı bulunamadı.");
      const provider = store.db
        .prepare("SELECT * FROM ai_providers WHERE id=? AND org_id=?")
        .get(draft.provider_id as string, job.org_id) as Provider | undefined;
      if (!provider)
        throw new DomainError("PROVIDER_MISSING", "Provider silinmiş.");
      const target = authorizedTarget(
        draft.target_url as string,
        store.authorizedOrigins(job.org_id),
      );
      await checkTargetNetwork(target);
      const prompt = JSON.parse(job.payload).prompt as string;
      const inspection = await exploreTarget(
        browser!,
        target,
        provider,
        draft.model as string,
        prompt,
        undefined,
        loadVariables(store.db, job.org_id, job.project_id, target.origin),
      );
      store.transaction(() => {
        const valid = store.db
          .prepare(
            "SELECT id FROM jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>=?",
          )
          .get(job.id, job.lease_token, Date.now());
        if (!valid) return;
        const now = new Date().toISOString();
        const save = store.db.prepare(
          `INSERT INTO ai_page_elements VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(org_id,project_id,page_url,locator_kind,locator_value)
           DO UPDATE SET tag=excluded.tag,label=excluded.label,role=excluded.role,input_type=excluded.input_type,last_seen_at=excluded.last_seen_at`,
        );
        for (const page of inspection.pages) {
          const pageUrl = new URL(page.url);
          pageUrl.search = "";
          pageUrl.hash = "";
          for (const element of page.elements)
            save.run(
              randomUUID(),
              job.org_id,
              job.project_id,
              pageUrl.href,
              element.tag,
              element.text,
              element.role,
              element.type,
              element.locator.kind,
              element.locator.value,
              now,
              now,
            );
        }
        store.db
          .prepare(
            "UPDATE ai_drafts SET status='explored',inspection=? WHERE id=? AND org_id=? AND status='running'",
          )
          .run(JSON.stringify(inspection), job.id, job.org_id);
        // A model comparison shares this one exploration: every compared
        // draft receives the same inspection and its own generation job.
        const siblings = (
          store.db
            .prepare(
              "SELECT c.draft_id FROM ai_comparison_drafts c JOIN ai_drafts d ON d.id=c.draft_id WHERE c.org_id=? AND c.draft_id<>? AND d.status='queued' AND c.comparison_id=(SELECT comparison_id FROM ai_comparison_drafts WHERE draft_id=? AND org_id=?) ORDER BY c.position",
            )
            .all(job.org_id, job.id, job.id, job.org_id) as {
            draft_id: string;
          }[]
        ).map((row) => row.draft_id);
        for (const sibling of siblings)
          store.db
            .prepare(
              "UPDATE ai_drafts SET status='explored',inspection=? WHERE id=? AND org_id=? AND status='queued'",
            )
            .run(JSON.stringify(inspection), sibling, job.org_id);
        // Suite generation runs as its own job so each stays within the lease.
        const enqueue = store.db.prepare(
          "INSERT INTO jobs (id,org_id,project_id,kind,payload,status,created_at) VALUES (?,?,?,?,?,?,?)",
        );
        [job.id, ...siblings].forEach((draftId, index) =>
          enqueue.run(
            randomUUID(),
            job.org_id,
            job.project_id,
            "ai_generate",
            JSON.stringify({ draftId, prompt }),
            "queued",
            // Distinct timestamps keep the queue in comparison order.
            new Date(Date.parse(now) + index).toISOString(),
          ),
        );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    } else if (job.kind === "ai_generate") {
      const payload = JSON.parse(job.payload) as {
        draftId: string;
        prompt: string;
        revision?: { previous: unknown; instruction: string };
      };
      const draft = store.db
        .prepare(
          "SELECT * FROM ai_drafts WHERE id=? AND org_id=? AND project_id=? AND status='generating'",
        )
        .get(payload.draftId, job.org_id, job.project_id);
      if (!draft) throw new DomainError("NOT_FOUND", "AI taslağı bulunamadı.");
      const provider = store.db
        .prepare("SELECT * FROM ai_providers WHERE id=? AND org_id=?")
        .get(draft.provider_id as string, job.org_id) as Provider | undefined;
      if (!provider)
        throw new DomainError("PROVIDER_MISSING", "Provider silinmiş.");
      const target = authorizedTarget(
        draft.target_url as string,
        store.authorizedOrigins(job.org_id),
      );
      const inspection = normalizeInspection(
        JSON.parse((draft.inspection as string | null) ?? "{}"),
      );
      generation = {
        draftId: payload.draftId,
        metrics: newGenerationMetrics(),
        started: Date.now(),
      };
      const suite = await generateSuite(
        provider,
        draft.model as string,
        payload.prompt,
        target,
        inspection,
        payload.revision,
        loadVariables(store.db, job.org_id, job.project_id, target.origin),
        generation.metrics,
      );
      store.transaction(() => {
        const valid = store.db
          .prepare(
            "SELECT id FROM jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>=?",
          )
          .get(job.id, job.lease_token, Date.now());
        if (!valid) return;
        store.db
          .prepare(
            "UPDATE ai_drafts SET status='ready',definition=? WHERE id=? AND org_id=? AND status='generating'",
          )
          .run(JSON.stringify(suite), payload.draftId, job.org_id);
        saveGeneration(job.org_id, generation!);
        const compared = !!store.db
          .prepare("SELECT 1 FROM ai_comparison_drafts WHERE draft_id=?")
          .get(payload.draftId);
        const early =
          inspection.stopped && inspection.stopped.reason !== "done"
            ? ` Keşif erken durdu: ${inspection.stopped.message}`
            : "";
        store.db
          .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
          .run(
            randomUUID(),
            draft.conversation_id,
            "assistant",
            compared
              ? `${draft.model}: ${suite.scenarios.length} senaryo taslağı hazır (karşılaştırma). Kaydetmeden önce inceleyip onaylayın.`
              : payload.revision
                ? `Düzeltilmiş taslak hazır: ${suite.scenarios.length} senaryo. Kaydetmeden önce düzenleyip onaylayın.`
                : `${inspection.pages.length} sayfa incelendi (${inspection.path.length} keşif adımı, ${inspection.elements.length} element). ${suite.scenarios.length} senaryo taslağı hazır.${early} Kaydetmeden önce düzenleyip onaylayın.`,
            new Date().toISOString(),
          );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    } else if (job.kind === "ai_suite") {
      const row = store.db
        .prepare(
          "SELECT s.definition,s.draft_id,d.conversation_id FROM ai_suite_runs r JOIN ai_suites s ON s.id=r.suite_id JOIN ai_drafts d ON d.id=s.draft_id WHERE r.id=? AND r.org_id=? AND r.project_id=?",
        )
        .get(job.id, job.org_id, job.project_id);
      if (!row)
        throw new DomainError("NOT_FOUND", "Suite çalışması bulunamadı.");
      const suite = aiSuiteSchema.parse(JSON.parse(row.definition as string));
      store.extendLease(job, suiteLeaseMs(suite.scenarios.length));
      const result = await executeSuite(
        browser!,
        suite,
        resolve(localDir, "artifacts", job.id),
        store.authorizedOrigins(job.org_id),
        // Values are read at execution time; the suite keeps {{KEY}} only.
        loadVariables(
          store.db,
          job.org_id,
          job.project_id,
          new URL(suite.targetUrl).origin,
        ),
      );
      let advice: string | undefined;
      if (result.status === "failed") {
        const original = store.db
          .prepare(
            "SELECT d.provider_id,d.model,d.inspection FROM ai_drafts d WHERE d.id=? AND d.org_id=?",
          )
          .get(row.draft_id as string, job.org_id);
        const provider = original
          ? (store.db
              .prepare("SELECT * FROM ai_providers WHERE id=? AND org_id=?")
              .get(original.provider_id as string, job.org_id) as
              Provider | undefined)
          : undefined;
        if (provider)
          try {
            const response = (await providerRequest(
              provider,
              "chat/completions",
              {
                model: original!.model,
                max_tokens: 220,
                messages: [
                  {
                    role: "system",
                    content:
                      "Explain browser test failure using only the supplied step kinds and error codes. Suggest one safe locator or wait improvement. Do not invent test PASS or ask for secrets. No actions are performed.",
                  },
                  {
                    role: "user",
                    content: JSON.stringify({
                      failures: result.results
                        .filter((r) => r.status === "failed")
                        .map((r) => ({
                          title: r.title,
                          code: r.code,
                          // Only step kinds and codes: findings stay local.
                          steps: r.steps.map((s) => ({
                            kind: s.kind,
                            status: s.status,
                            code: s.code,
                          })),
                        })),
                      observedElements: normalizeInspection(
                        JSON.parse(original!.inspection as string),
                      ).elements.map((e) => e.locator),
                    }),
                  },
                ],
              },
            )) as { choices?: { message?: { content?: string } }[] };
            advice = response.choices?.[0]?.message?.content?.slice(0, 1000);
          } catch {
            advice =
              "AI hata analizi alınamadı; adım hata kodlarını inceleyin.";
          }
      }
      store.transaction(() => {
        const valid = store.db
          .prepare(
            "SELECT id FROM jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>=?",
          )
          .get(job.id, job.lease_token, Date.now());
        if (!valid) return;
        store.db
          .prepare(
            "UPDATE ai_suite_runs SET status=?,result=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
          )
          .run(
            result.status,
            JSON.stringify(result),
            new Date().toISOString(),
            job.id,
            job.org_id,
          );
        store.db
          .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
          .run(
            randomUUID(),
            row.conversation_id,
            "assistant",
            `Suite tamamlandı: ${result.counts.passed} başarılı, ${result.counts.failed} başarısız, ${result.counts.skipped} atlandı.`,
            new Date().toISOString(),
          );
        if (advice)
          store.db
            .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
            .run(
              randomUUID(),
              row.conversation_id,
              "assistant",
              `Hata analizi: ${advice}`,
              new Date().toISOString(),
            );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    } else if (job.kind === "ai_test_run") {
      const row = store.db
        .prepare(
          "SELECT plan,checksum FROM ai_test_runs WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(job.id, job.org_id, job.project_id);
      if (!row)
        throw new DomainError("NOT_FOUND", "Test çalışması bulunamadı.");
      const plan = JSON.parse(row.plan as string) as PromotedPlan;
      let status: string, result: unknown;
      try {
        if (plan.checksum !== row.checksum)
          throw new DomainError(
            "PLAN_CHECKSUM_MISMATCH",
            "Çalıştırma planı bütünlüğü doğrulanamadı.",
          );
        // executeSuite re-reads target authorization and test data at run time.
        const suite = verifyPlan(plan);
        store.extendLease(job, suiteLeaseMs(suite.scenarios.length));
        const outcome = await executeSuite(
          browser!,
          suite,
          resolve(localDir, "artifacts", job.id),
          store.authorizedOrigins(job.org_id),
          loadVariables(
            store.db,
            job.org_id,
            job.project_id,
            new URL(suite.targetUrl).origin,
          ),
        );
        status =
          outcome.status === "passed" && !evidencedPass(plan, outcome)
            ? "infrastructure_error"
            : outcome.status;
        result =
          status === "infrastructure_error"
            ? { ...outcome, code: "INVALID_PASS_EVIDENCE" }
            : outcome;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        status =
          error.code === "TARGET_BLOCKED" ? "blocked" : "infrastructure_error";
        result = { code: error.code, message: error.message, results: [] };
      }
      store.transaction(() => {
        const valid = store.db
          .prepare(
            "SELECT id FROM jobs WHERE id=? AND status='running' AND lease_token=? AND lease_until>=?",
          )
          .get(job.id, job.lease_token, Date.now());
        if (!valid) return;
        store.db
          .prepare(
            "UPDATE ai_test_runs SET status=?,result=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
          )
          .run(
            status,
            JSON.stringify(result),
            new Date().toISOString(),
            job.id,
            job.org_id,
          );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    } else {
      const run = store.db
        .prepare(
          "SELECT plan,variant FROM runs WHERE id=? AND org_id=? AND project_id=?",
        )
        .get(job.id, job.org_id, job.project_id);
      if (!run) throw new Error("RUN_SCOPE_MISMATCH");
      current = new AbortController();
      cancelPoll = setInterval(() => {
        const row = store.db
          .prepare("SELECT status FROM runs WHERE id=? AND org_id=?")
          .get(job.id, job.org_id);
        if (row?.status !== "running") current?.abort();
      }, 100);
      const outcome = await execute(
        browser!,
        JSON.parse(run.plan as string),
        run.variant as "healthy",
        resolve(localDir, "artifacts", job.id),
        current.signal,
      );
      store.finish(job, outcome);
    }
    console.log(
      JSON.stringify({
        service: "worker",
        event: "job.completed",
        jobId: job.id,
        orgId: job.org_id,
      }),
    );
  } catch (error) {
    if (job.kind === "run")
      store.finish(job, {
        status: "infrastructure_error",
        code: "WORKER_ERROR",
        steps: [],
        assertionsExecuted: 0,
      });
    else if (job.kind === "ai_analysis" || job.kind === "ai_generate")
      store.transaction(() => {
        const draftId = draftIdOf(job);
        const draft = store.db
          .prepare(
            "SELECT conversation_id FROM ai_drafts WHERE id=? AND org_id=?",
          )
          .get(draftId, job.org_id);
        const code = error instanceof DomainError ? error.code : "AGENT_ERROR";
        store.failDraft(draftId, job.org_id, code);
        if (generation) saveGeneration(job.org_id, generation);
        if (draft)
          store.db
            .prepare("INSERT INTO ai_messages VALUES (?,?,?,?,?)")
            .run(
              randomUUID(),
              draft.conversation_id,
              "assistant",
              `${job.kind === "ai_generate" ? "Senaryo üretimi" : "Analiz"} tamamlanamadı: ${error instanceof DomainError ? `${error.message} (${code})` : code}`,
              new Date().toISOString(),
            );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    else if (job.kind === "ai_suite")
      store.transaction(() => {
        store.db
          .prepare(
            "UPDATE ai_suite_runs SET status='infrastructure_error',result=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
          )
          .run(
            JSON.stringify({ code: "WORKER_ERROR" }),
            new Date().toISOString(),
            job.id,
            job.org_id,
          );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    else if (job.kind === "ai_test_run")
      store.transaction(() => {
        store.db
          .prepare(
            "UPDATE ai_test_runs SET status='infrastructure_error',result=?,finished_at=? WHERE id=? AND org_id=? AND status='running'",
          )
          .run(
            JSON.stringify({ code: "WORKER_ERROR", results: [] }),
            new Date().toISOString(),
            job.id,
            job.org_id,
          );
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    else if (job.kind === "locator_check")
      store.finishLocatorCheck(
        job,
        { code: error instanceof DomainError ? error.code : "WORKER_ERROR" },
        "failed",
      );
    else
      store.transaction(() => {
        store.db
          .prepare(
            "UPDATE scans SET status='failed' WHERE id=? AND org_id=? AND status='running'",
          )
          .run(job.id, job.org_id);
        store.db
          .prepare("UPDATE jobs SET status='done' WHERE id=? AND lease_token=?")
          .run(job.id, job.lease_token);
      });
    console.error(
      JSON.stringify({
        service: "worker",
        event: "job.error",
        jobId: job.id,
        code: "WORKER_ERROR",
      }),
    );
  } finally {
    if (cancelPoll) clearInterval(cancelPoll);
    current = undefined;
    await browser?.close();
  }
}
store.close();

function saveGeneration(
  orgId: string,
  run: { draftId: string; metrics: GenerationMetrics; started: number },
) {
  store.db
    .prepare(
      "INSERT OR REPLACE INTO ai_generation_metrics VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      run.draftId,
      orgId,
      run.metrics.attempts,
      Date.now() - run.started,
      run.metrics.promptTokens,
      run.metrics.completionTokens,
      run.metrics.totalTokens,
      new Date().toISOString(),
    );
}
