import { resolve } from "node:path";
import { localDir, Store, type Job } from "../../../packages/storage/src/index";
import {
  discover,
  execute,
  launchBrowser,
  checkLocator,
} from "../../../packages/runner/src/index";
import { DomainError, locatorSchema } from "../../../packages/domain/src/index";

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
  let cancelPoll: ReturnType<typeof setInterval> | undefined;
  try {
    browser = await launchBrowser();
    if (job.kind === "discovery") {
      const findings = await discover(browser);
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
        browser,
        row.page as "login" | "dashboard",
        locatorSchema.parse(JSON.parse(row.locator as string)),
      );
      store.finishLocatorCheck(job, result, "completed");
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
        browser,
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
