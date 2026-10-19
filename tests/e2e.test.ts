import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  demoProject,
  type CanonicalTest,
  type RunOutcome,
} from "../packages/domain/src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor<T>(
  probe: () => Promise<T | false | null | undefined>,
  timeout = 20000,
): Promise<T> {
  const until = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < until) {
    try {
      const result = await probe();
      if (result) return result;
    } catch (e) {
      last = e;
    }
    await sleep(150);
  }
  throw new Error(`Readiness timeout: ${String(last ?? "condition not met")}`);
}
test(
  "real UI → passive discovery → reviewed model → published test → separate browser worker",
  { timeout: 120000 },
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), "zerocode-e2e-"));
    const evidenceDir = resolve("test-results");
    await mkdir(evidenceDir, { recursive: true });
    const output: string[] = [];
    const processes: ChildProcess[] = [];
    // Never reuse or kill a developer's process on these ports.
    for (const port of [3000, 4000, 4100]) {
      const reachable = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(500),
      }).then(
        () => true,
        () => false,
      );
      assert.equal(
        reachable,
        false,
        `Port ${port} is occupied; stop pnpm dev before E2E.`,
      );
    }
    function start(script: string, args: string[] = []) {
      const child = spawn(
        process.execPath,
        script === "web"
          ? [
              "node_modules/next/dist/bin/next",
              "start",
              "apps/web",
              "--hostname",
              "127.0.0.1",
              "--port",
              "3000",
            ]
          : ["--import", "tsx", script, ...args],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            ZC_DATA_DIR: dataDir,
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      );
      child.stdout?.on("data", (data) => output.push(data.toString()));
      child.stderr?.on("data", (data) => output.push(data.toString()));
      processes.push(child);
      return child;
    }
    const stop = (p: ChildProcess) => {
      try {
        if (p.pid) process.kill(-p.pid, "SIGTERM");
      } catch {}
    };
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      start("apps/api/src/main.ts");
      start("tests/fixtures/server.ts");
      const worker = start("apps/worker/src/main.ts");
      start("web");
      await waitFor(
        async () => (await fetch("http://127.0.0.1:3000")).ok,
        30000,
      );
      await waitFor(
        async () => (await fetch("http://127.0.0.1:4000/health")).ok,
      );
      await waitFor(
        async () => (await fetch("http://127.0.0.1:4100/health")).ok,
      );
      browser = await chromium.launch({
        executablePath: process.env.ZC_CHROMIUM_PATH ?? "/usr/bin/chromium",
        headless: true,
      });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:3000");
      await page
        .getByRole("button", { name: "Yerel çalışma alanını aç" })
        .click();
      await page
        .getByRole("heading", { name: "Her testin arkasında bir kanıt." })
        .waitFor();
      await page.screenshot({
        path: join(evidenceDir, "01-overview.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Uygulamayı keşfet" }).click();
      await page.getByText("5 aday öğe", { exact: false }).waitFor();
      assert.equal(await page.locator(".mapping-row").count(), 5);
      assert.equal(
        await page
          .getByRole("button", { name: "Seçilen eşlemeleri onayla" })
          .isDisabled(),
        true,
      );
      for (const checkbox of await page.locator(".mapping-row input").all())
        await checkbox.check();
      await page.screenshot({
        path: join(evidenceDir, "02-discovery.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Seçilen eşlemeleri onayla" })
        .click();
      await page.getByRole("button", { name: "Doğrula ve yayınla" }).waitFor();
      await page.getByLabel("Test adı").fill("[E2E] Giriş ve bakiye");
      await page.getByLabel("Bakiyeyi de doğrula").check();
      await page.getByRole("tab", { name: "Akış", exact: true }).click();
      assert.equal(await page.locator(".flow-node").count(), 5);
      await page.getByRole("tab", { name: "Teknik", exact: true }).click();
      const canonical = JSON.parse(
        await page.locator(".technical pre").innerText(),
      ) as CanonicalTest;
      assert.equal(canonical.steps.length, 3);
      await page.getByRole("tab", { name: "İş adımları", exact: true }).click();
      await page.getByRole("button", { name: "Doğrula ve yayınla" }).click();
      await page.getByRole("button", { name: "Testi çalıştır" }).waitFor();
      await page.screenshot({
        path: join(evidenceDir, "03-designer.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Testi çalıştır" }).click();
      await page
        .locator(".result-card .badge.passed")
        .waitFor({ timeout: 20000 });
      assert.match(await page.locator(".run-meta").innerText(), /2 assertion/);
      await page.screenshot({
        path: join(evidenceDir, "04-real-pass.png"),
        fullPage: true,
      });
      const cookies = await page.context().cookies();
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const headers = {
        cookie,
        origin: "http://127.0.0.1:3000",
        "x-zerocode-client": "local-ui",
      };
      async function request(
        path: string,
        method = "GET",
        body?: unknown,
        extra?: Record<string, string>,
      ) {
        const response = await fetch(`http://127.0.0.1:4000${path}`, {
          method,
          headers: {
            ...headers,
            ...(body ? { "content-type": "application/json" } : {}),
            ...extra,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json();
        assert.ok(response.ok, JSON.stringify(json));
        return json;
      }
      const project = await request(`/v1/projects/${demoProject}`);
      const published = project.tests[0] as CanonicalTest;
      const waitRun = (id: string) =>
        waitFor<{ status: string; outcome: RunOutcome }>(async () => {
          const run = await request(`/v1/runs/${id}`);
          return !["queued", "running"].includes(run.status) && run;
        }, 25000);
      await t.test(
        "evidence is real PNG, integrity checked, authenticated, and input values are absent from results",
        async () => {
          const result = await request(`/v1/runs/${project.runs[0].id}`);
          const imageResponse = await fetch(
            `http://127.0.0.1:4000/v1/runs/${result.id}/screenshot`,
            { headers },
          );
          assert.equal(imageResponse.status, 200);
          const bytes = Buffer.from(await imageResponse.arrayBuffer());
          assert.equal(bytes.subarray(1, 4).toString(), "PNG");
          assert.equal(
            createHash("sha256").update(bytes).digest("hex"),
            result.outcome.screenshot.sha256,
          );
          assert.equal(
            (
              await fetch(
                `http://127.0.0.1:4000/v1/runs/${result.id}/screenshot`,
              )
            ).status,
            401,
          );
          assert.ok(!JSON.stringify(result).includes("local-fixture-only"));
        },
      );
      await t.test(
        "broken dashboard produces FAILED with observed false",
        async () => {
          const run = await request(
            `/v1/tests/${published.testId}/runs`,
            "POST",
            { variant: "broken" },
            { "idempotency-key": randomUUID() },
          );
          const result = await waitRun(run.id);
          assert.equal(result.status, "failed");
          assert.equal(result.outcome.code, "ASSERTION_FAILED");
          assert.equal(result.outcome.steps.at(-1)?.observed, false);
          await page
            .locator("nav")
            .getByRole("button", { name: /Çalıştırmalar/ })
            .click();
          await page
            .getByRole("button", {
              name: `${run.id.slice(0, 8)} çalıştırma ayrıntıları`,
            })
            .click();
          await page.locator(".result-card .badge.failed").waitFor();
          await page.screenshot({
            path: join(evidenceDir, "05-real-fail.png"),
            fullPage: true,
          });
        },
      );
      await t.test(
        "ambiguous button is BLOCKED before any assertion",
        async () => {
          const run = await request(
            `/v1/tests/${published.testId}/runs`,
            "POST",
            { variant: "ambiguous" },
            { "idempotency-key": randomUUID() },
          );
          const result = await waitRun(run.id);
          assert.equal(result.status, "blocked");
          assert.equal(result.outcome.code, "AMBIGUOUS_ELEMENT");
          assert.equal(result.outcome.assertionsExecuted, 0);
        },
      );
      await t.test(
        "wrong balance text fails even when dashboard is visible",
        async () => {
          const wrong: CanonicalTest = structuredClone(published);
          wrong.testId = randomUUID();
          wrong.title = "[E2E] Yanlış bakiye";
          if (wrong.steps[2]?.kind === "assert")
            wrong.steps[2].expected = "9.999,00 TL";
          await request(`/v1/projects/${demoProject}/tests`, "POST", wrong);
          const run = await request(
            `/v1/tests/${wrong.testId}/runs`,
            "POST",
            { variant: "healthy" },
            { "idempotency-key": randomUUID() },
          );
          const result = await waitRun(run.id);
          assert.equal(result.status, "failed");
          assert.equal(result.outcome.assertionsExecuted, 2);
          assert.equal(result.outcome.steps.at(-1)?.observed, "1.250,00 TL");
        },
      );
      await t.test("run budget expires as TIMED_OUT, not PASS", async () => {
        const short: CanonicalTest = {
          ...structuredClone(published),
          testId: randomUUID(),
          title: "[E2E] Kısa bütçe",
          executionPolicy: { onStepError: "stop", maxDurationMs: 1000 },
        };
        await request(`/v1/projects/${demoProject}/tests`, "POST", short);
        const run = await request(
          `/v1/tests/${short.testId}/runs`,
          "POST",
          { variant: "slow" },
          { "idempotency-key": randomUUID() },
        );
        const result = await waitRun(run.id);
        assert.equal(result.status, "timed_out");
        assert.equal(result.outcome.code, "RUN_TIMEOUT");
      });
      await t.test(
        "cancellation stays terminal after the active worker returns",
        async () => {
          const run = await request(
            `/v1/tests/${published.testId}/runs`,
            "POST",
            { variant: "slow" },
            { "idempotency-key": randomUUID() },
          );
          await waitFor(
            async () =>
              (await request(`/v1/runs/${run.id}`)).status === "running",
          );
          await request(`/v1/runs/${run.id}/cancel`, "POST");
          await sleep(1200);
          assert.equal(
            (await request(`/v1/runs/${run.id}`)).status,
            "cancelled",
          );
        },
      );
      await t.test(
        "re-running pinned test does not mutate the previous evidence",
        async () => {
          const first = await request(`/v1/runs/${project.runs[0].id}`);
          const repeat = await request(
            `/v1/tests/${published.testId}/runs`,
            "POST",
            { variant: "healthy" },
            { "idempotency-key": randomUUID() },
          );
          assert.equal((await waitRun(repeat.id)).status, "passed");
          assert.deepEqual(
            (await request(`/v1/runs/${first.id}`)).outcome,
            first.outcome,
          );
        },
      );
      await t.test(
        "mobile layout has no horizontal page overflow",
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await page
            .locator("nav")
            .getByRole("button", { name: /Genel bakış/ })
            .click();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
          );
          await page.screenshot({
            path: join(evidenceDir, "06-mobile.png"),
            fullPage: true,
          });
        },
      );
      assert.deepEqual(errors, [], "browser runtime errors");
    } finally {
      await browser?.close();
      for (const child of processes) stop(child);
      await sleep(1500);
      for (const child of processes)
        if (child.exitCode === null && child.signalCode === null) {
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch {}
        }
      await writeFile(join(evidenceDir, "services.log"), output.join(""));
      await writeFile(join(evidenceDir, "data-location.txt"), `${dataDir}\n`);
    }
  },
);
