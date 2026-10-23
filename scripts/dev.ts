import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const onWindows = process.platform === "win32";
const portValue = process.env.ZC_WEB_PORT ?? "5000";
const webPort = Number(portValue);
if (
  !/^\d+$/.test(portValue) ||
  !Number.isInteger(webPort) ||
  webPort < 1 ||
  webPort > 65535
)
  throw new Error("ZC_WEB_PORT must be a valid TCP port (1–65535).");

const services = [
  { name: "api", args: ["--import", "tsx", "apps/api/src/main.ts"] },
  { name: "fixture", args: ["--import", "tsx", "tests/fixtures/server.ts"] },
  { name: "worker", args: ["--import", "tsx", "apps/worker/src/main.ts"] },
  {
    name: "web",
    args: [
      resolve("node_modules/next/dist/bin/next"),
      "dev",
      "apps/web",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
  },
];
const selected = process.argv.includes("--web-only")
  ? services.filter((service) => service.name === "web")
  : services;
const processes: ChildProcess[] = [];
let stopping = false;

function terminate(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  if (onWindows) {
    // Kill the process tree without opening another console window.
    const killer = spawn(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    killer.on("error", () => undefined);
    return;
  }
  try {
    // Detached Unix processes have their own process group.
    process.kill(-child.pid, signal);
  } catch {
    // The process may already have exited.
  }
}

function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) terminate(child, "SIGTERM");
  setTimeout(() => {
    if (!onWindows)
      for (const child of processes) terminate(child, "SIGKILL");
    process.exit(code);
  }, 3000).unref();
}

for (const service of selected) {
  // Direct Node invocations avoid nested pnpm/cmd.exe windows on Windows.
  const child = spawn(process.execPath, service.args, {
    detached: !onWindows,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  processes.push(child);
  child.stdout?.on("data", (data) =>
    process.stdout.write(`[${service.name}] ${data}`),
  );
  child.stderr?.on("data", (data) =>
    process.stderr.write(`[${service.name}] ${data}`),
  );
  child.on("error", (error) => {
    if (!stopping) {
      console.error(`[${service.name}] Startup failed: ${error.message}`);
      stop(1);
    }
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `[${service.name}] Stopped (${code ?? signal ?? "unknown"}).`,
      );
      stop(code || 1);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => stop(0));
