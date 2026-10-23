import { spawnSync } from "node:child_process";

/**
 * Unix has process groups; Windows does not support negative PIDs.
 * Every test owns only the process tree rooted at its spawned child.
 */
export const detachedTestProcess = process.platform !== "win32";

export function stopTestProcess(
  pid: number | undefined,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      // Explicit PID + /T kills the Node worker and its own Chromium children.
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 5000,
      });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // A child may already have terminated; cleanup is idempotent.
  }
}
