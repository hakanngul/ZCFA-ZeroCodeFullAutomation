/**
 * Reporting rules shared by the API and tests. Pure functions only.
 *
 * Flaky ("dalgalı") rule: look at the last FLAKY_WINDOW terminal runs of the
 * SAME test version. The version is flaky when that window contains at least
 * one `passed` and at least one `failed` run. Only `passed` and `failed` count
 * as a flip; infrastructure_error, blocked, timed_out and cancelled stay in
 * the window (and are reported as `excluded`) but never make a version flaky.
 */
export const FLAKY_WINDOW = 10;
export const STATS_WINDOW = 20;
export const runKinds = ["canonical", "suite", "ai_test", "case"] as const;
export type RunKind = (typeof runKinds)[number];

const pending = new Set(["queued", "running"]);
export const isTerminal = (status: string) => !pending.has(status);

export type ReportRun = {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  failure?: string | null;
};

export function durationMs(createdAt: string, finishedAt: string | null) {
  if (!finishedAt) return null;
  const ms = Date.parse(finishedAt) - Date.parse(createdAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** statuses: newest first, any status; non-terminal runs are ignored. */
export function flakiness(statuses: string[]) {
  const window = statuses.filter(isTerminal).slice(0, FLAKY_WINDOW);
  const passed = window.filter((s) => s === "passed").length,
    failed = window.filter((s) => s === "failed").length;
  return {
    flaky: passed > 0 && failed > 0,
    passed,
    failed,
    excluded: window.length - passed - failed,
    window: window.length,
  };
}

/** Flaky versions of one test; runs newest first, mixed versions. */
export function flakyVersions(runs: Pick<ReportRun, "version" | "status">[]) {
  const byVersion = new Map<number, string[]>();
  for (const run of runs)
    byVersion.set(run.version, [
      ...(byVersion.get(run.version) ?? []),
      run.status,
    ]);
  return [...byVersion.entries()]
    .filter(([, statuses]) => flakiness(statuses).flaky)
    .map(([version]) => version)
    .sort((a, b) => b - a);
}

/**
 * Per-test stats over the last `n` terminal runs (newest first):
 * pass rate = passed / terminal runs, average duration over runs with both
 * timestamps, last failure = newest terminal run that did not pass and was not
 * cancelled.
 */
export function testStats(runs: ReportRun[], n = STATS_WINDOW) {
  const window = runs.filter((r) => isTerminal(r.status)).slice(0, n);
  const durations = window
    .map((r) => durationMs(r.createdAt, r.finishedAt))
    .filter((d): d is number => d !== null);
  const passed = window.filter((r) => r.status === "passed").length;
  const lastFailure = window.find(
    (r) => r.status !== "passed" && r.status !== "cancelled",
  );
  return {
    runs: window.length,
    passed,
    failed: window.filter((r) => r.status === "failed").length,
    passRate: window.length ? Math.round((passed / window.length) * 100) : null,
    averageDurationMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    lastFailure: lastFailure
      ? {
          runId: lastFailure.id,
          version: lastFailure.version,
          status: lastFailure.status,
          at: lastFailure.createdAt,
          reason: lastFailure.failure ?? lastFailure.status,
        }
      : null,
    flakyVersions: flakyVersions(runs),
  };
}

type Step = { status?: string; code?: string; label?: string; kind?: string };
/** Short, value-free failure reason from a stored run outcome/result. */
export function failureReason(kind: RunKind, raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as {
    code?: string;
    steps?: Step[];
    results?: {
      title?: string;
      status?: string;
      code?: string;
      steps?: Step[];
    }[];
  };
  if (kind === "canonical") {
    const step = value.steps?.find((s) => s.status && s.status !== "passed");
    if (value.code) return value.code;
    return step
      ? `${step.label ?? step.kind}: ${step.code ?? step.status}`
      : null;
  }
  if (value.code) return value.code;
  const scenario = value.results?.find((r) => r.status === "failed");
  if (!scenario) return null;
  const step = scenario.steps?.find((s) => s.status === "failed");
  return `${scenario.title ?? "Senaryo"}: ${step?.kind ? `${step.kind} ` : ""}${step?.code ?? scenario.code ?? "failed"}`.slice(
    0,
    300,
  );
}
