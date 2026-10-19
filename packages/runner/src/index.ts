import { chromium } from "playwright";
import type { Browser, Page, Locator } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertFixtureUrl,
  DomainError,
  fixtureOrigin,
  type Element,
  type ExecutionPlan,
  type LocatorSpec,
  type RunOutcome,
  type StepResult,
  type Variant,
} from "../../domain/src/index";

// Only public fixture values. This is deliberately not a production vault adapter.
const fixtureInputs = {
  "demo.username": "qa@example.test",
  "demo.password": "local-fixture-only",
};
export function locate(page: Page, spec: LocatorSpec): Locator {
  if (spec.kind === "label")
    return page.getByLabel(spec.value, { exact: true });
  if (spec.kind === "testId") return page.getByTestId(spec.value);
  return page.getByRole(spec.role, { name: spec.value, exact: true });
}
async function guardedContext(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  // All resources and redirected requests are checked. No arbitrary user origin.
  await context.route("**/*", async (route) => {
    try {
      assertFixtureUrl(route.request().url());
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  return context;
}
export async function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.ZC_CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    timeout: 10000,
  });
}
async function unique(page: Page, spec: LocatorSpec) {
  const locator = locate(page, spec);
  await locator
    .first()
    .waitFor({ state: "attached", timeout: 1500 })
    .catch(() => undefined);
  const count = await locator.count();
  if (count !== 1)
    throw new DomainError(
      count > 1 ? "AMBIGUOUS_ELEMENT" : "ELEMENT_NOT_FOUND",
      "Öğe tekil çözümlenemedi.",
    );
  return locator;
}
export async function discover(
  browser: Browser,
): Promise<{ elements: Element[] }> {
  const context = await guardedContext(browser);
  try {
    const page = await context.newPage();
    const elements: Element[] = [];
    // These are fixture teaching routes, not an unrestricted crawler.
    for (const [path, pageName] of [
      ["/login", "login"],
      ["/dashboard-preview", "dashboard"],
    ] as const) {
      await page.goto(`${fixtureOrigin}${path}`, {
        timeout: 5000,
        waitUntil: "domcontentloaded",
      });
      const candidates = await page
        .locator("[data-testid][data-semantic]")
        .evaluateAll((nodes) =>
          nodes.slice(0, 30).map((node) => ({
            id: node.getAttribute("data-semantic")!,
            label:
              node.getAttribute("aria-label") ??
              node.textContent?.trim().slice(0, 120) ??
              "",
            testId: node.getAttribute("data-testid")!,
          })),
        );
      for (const candidate of candidates) {
        if (!candidate.id || !candidate.testId || !candidate.label) continue;
        elements.push({
          id: candidate.id,
          label: candidate.label,
          locator: { kind: "testId", value: candidate.testId },
          approved: false,
          page: pageName,
        });
      }
    }
    if (elements.length !== 5)
      throw new DomainError(
        "DISCOVERY_INCOMPLETE",
        "Demo öğelerinin tamamı bulunamadı.",
      );
    return { elements };
  } finally {
    await context.close();
  }
}
export async function execute(
  browser: Browser,
  plan: ExecutionPlan,
  variant: Variant,
  artifactDirectory: string,
  signal?: AbortSignal,
): Promise<RunOutcome> {
  const { checksum, ...body } = plan;
  if (
    createHash("sha256").update(JSON.stringify(body)).digest("hex") !== checksum
  )
    return {
      status: "blocked",
      code: "PLAN_CHECKSUM_MISMATCH",
      steps: [],
      assertionsExecuted: 0,
    };
  const context = await guardedContext(browser);
  const page = await context.newPage();
  let deadline = false,
    assertionsExecuted = 0;
  const steps: StepResult[] = [];
  const timer = setTimeout(() => {
    deadline = true;
    void context.close();
  }, plan.maxDurationMs);
  const abort = () => {
    void context.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  let status: RunOutcome["status"] = "passed",
    code: string | undefined;
  try {
    if (signal?.aborted) throw new DomainError("CANCELLED", "İptal edildi.");
    for (const step of plan.steps) {
      const started = Date.now();
      const result: StepResult = {
        id: step.id,
        kind: step.kind,
        label: step.label,
        status: "passed",
        durationMs: 0,
      };
      try {
        if (step.kind === "navigate") {
          const url = assertFixtureUrl(
            `${fixtureOrigin}${step.path}?variant=${variant}`,
          );
          await page.goto(url.href, {
            timeout: 5000,
            waitUntil: "domcontentloaded",
          });
        } else {
          const locator = await unique(page, step.target);
          if (step.kind === "fillSecret")
            await locator.fill(fixtureInputs[step.secretRef], {
              timeout: 1500,
            });
          if (step.kind === "click") await locator.click({ timeout: 1500 });
          if (step.kind === "assertVisible") {
            result.expected = true;
            await locator
              .waitFor({ state: "visible", timeout: 1500 })
              .catch(() => undefined);
            result.observed = await locator.isVisible();
            assertionsExecuted++;
            if (!result.observed)
              throw new DomainError("ASSERTION_FAILED", "Öğe görünür değil.");
          }
          if (step.kind === "assertText") {
            result.expected = step.expected;
            const until = Date.now() + 1500;
            do {
              result.observed = (
                await locator.innerText({ timeout: 1000 })
              ).trim();
              if (result.observed === step.expected) break;
              await new Promise((resolve) => setTimeout(resolve, 50));
            } while (Date.now() < until);
            assertionsExecuted++;
            if (result.observed !== step.expected)
              throw new DomainError(
                "ASSERTION_FAILED",
                "Metin beklenen değerle eşleşmedi.",
              );
          }
        }
      } catch (error) {
        code = error instanceof DomainError ? error.code : "ACTION_FAILED";
        result.status = ["AMBIGUOUS_ELEMENT", "ELEMENT_NOT_FOUND"].includes(
          code,
        )
          ? "blocked"
          : "failed";
        result.code = code;
        throw error;
      } finally {
        result.durationMs = Date.now() - started;
        steps.push(result);
      }
    }
    if (!assertionsExecuted) {
      status = "blocked";
      code = "ASSERTION_REQUIRED";
    }
  } catch {
    if (signal?.aborted) {
      status = "cancelled";
      code = "CANCELLED";
    } else if (deadline) {
      status = "timed_out";
      code = "RUN_TIMEOUT";
    } else if (code === "AMBIGUOUS_ELEMENT" || code === "ELEMENT_NOT_FOUND")
      status = "blocked";
    else status = "failed";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
  let screenshot: RunOutcome["screenshot"];
  try {
    if (!page.isClosed()) {
      await mkdir(artifactDirectory, { recursive: true });
      const filename = "result.png",
        path = resolve(artifactDirectory, filename);
      await page.screenshot({
        path,
        mask: [page.locator("input")],
        fullPage: true,
        timeout: 3000,
      });
      screenshot = {
        filename,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      };
    }
  } catch {
    if (status === "passed") {
      status = "infrastructure_error";
      code = "EVIDENCE_WRITE_FAILED";
    }
  }
  await context.close();
  if (status === "passed" && !screenshot) {
    status = "infrastructure_error";
    code = "EVIDENCE_REQUIRED";
  }
  return { status, code, steps, assertionsExecuted, screenshot };
}
