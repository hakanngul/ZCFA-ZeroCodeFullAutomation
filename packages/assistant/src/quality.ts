import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { BrowserContext, Page } from "playwright";
import { DomainError } from "../../domain/src/index";

/**
 * Page-quality assertions (console errors, broken links, accessibility).
 * Only summarized findings leave this module: message text is truncated,
 * link URLs lose their query string and nothing is sent outside the worker.
 */
export type QualityFinding = {
  text: string;
  id?: string;
  impact?: string;
  target?: string;
  status?: number;
};
export type QualityFindings = {
  summary: string;
  checked: number;
  items: QualityFinding[];
  truncated?: boolean;
};

const clip = (text: string, max = 300) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Collects console errors and uncaught page errors from scenario start. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Requests aborted by the worker's own origin restriction are not site errors.
    if (/net::ERR_BLOCKED_BY_CLIENT/.test(text)) return;
    if (errors.length < 200) errors.push(clip(text));
  });
  page.on("pageerror", (error) => {
    if (errors.length < 200)
      errors.push(clip(`Uncaught ${error.name}: ${error.message}`));
  });
  return errors;
}

export function checkConsole(
  errors: readonly string[],
  ignore: readonly string[] = [],
): QualityFindings {
  const relevant = errors.filter(
    (text) => !ignore.some((part) => text.includes(part)),
  );
  return {
    summary: relevant.length
      ? `${relevant.length} konsol hatası`
      : `Konsol hatası yok (${errors.length - relevant.length} yok sayıldı)`,
    checked: errors.length,
    items: relevant.slice(0, 10).map((text) => ({ text })),
    ...(relevant.length > 10 ? { truncated: true } : {}),
  };
}

const linkLimit = 30;
export async function checkLinks(
  page: Page,
  context: BrowserContext,
  origin: string,
): Promise<QualityFindings> {
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
  const urls: string[] = [];
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    // Same-origin only: the authorized target is the only reachable origin.
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
      continue;
    url.hash = "";
    if (!urls.includes(url.href)) urls.push(url.href);
    if (urls.length >= linkLimit) break;
  }
  const broken: QualityFinding[] = [];
  const probe = async (url: string) => {
    const options = { timeout: 3000, maxRedirects: 0, failOnStatusCode: false };
    let status: number | undefined;
    try {
      let response = await context.request.head(url, options);
      if ([405, 501].includes(response.status()))
        response = await context.request.get(url, options);
      status = response.status();
      await response.dispose();
    } catch {
      status = undefined;
    }
    if (status === undefined || status >= 400) {
      const shown = new URL(url);
      shown.search = "";
      broken.push({
        target: shown.href,
        ...(status ? { status } : {}),
        text: status ? `HTTP ${status}` : "Ağ hatası",
      });
    }
  };
  for (let i = 0; i < urls.length; i += 5)
    await Promise.all(urls.slice(i, i + 5).map(probe));
  return {
    summary: broken.length
      ? `${urls.length} bağlantıdan ${broken.length} kırık`
      : `${urls.length} bağlantı sağlam`,
    checked: urls.length,
    items: broken.slice(0, 10),
    ...(broken.length > 10 ? { truncated: true } : {}),
  };
}

let axeSource: Promise<string> | undefined;
const impactRank: Record<string, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};
/** Runs the bundled axe-core locally inside the page; nothing leaves the worker. */
export async function checkAccessibility(
  page: Page,
  impact: "critical" | "serious" = "serious",
): Promise<QualityFindings> {
  axeSource ??= readFile(
    createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
    "utf8",
  );
  type Violation = {
    id: string;
    impact: string | null;
    help: string;
    nodes: { target: unknown[] }[];
  };
  let violations: Violation[];
  try {
    await page.evaluate(await axeSource);
    violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              context: Document,
              options: object,
            ) => Promise<{ violations: Violation[] }>;
          };
        }
      ).axe;
      const result = await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
        resultTypes: ["violations"],
      });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 1).map((n) => ({ target: n.target })),
      }));
    });
  } catch {
    throw new DomainError(
      "CHECK_NOT_RUN",
      "Erişilebilirlik taraması çalışmadı.",
    );
  }
  const threshold = impactRank[impact]!;
  const relevant = violations.filter(
    (v) => (impactRank[v.impact ?? ""] ?? 0) >= threshold,
  );
  return {
    summary: relevant.length
      ? `${relevant.length} erişilebilirlik ihlali (${impact} ve üstü)`
      : `Erişilebilirlik ihlali yok (${impact} ve üstü)`,
    checked: violations.length,
    items: relevant.slice(0, 10).map((v) => ({
      id: v.id,
      impact: v.impact ?? undefined,
      target: clip(String(v.nodes[0]?.target?.[0] ?? ""), 200),
      text: clip(v.help, 200),
    })),
    ...(relevant.length > 10 ? { truncated: true } : {}),
  };
}
