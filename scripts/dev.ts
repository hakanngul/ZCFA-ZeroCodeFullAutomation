import { spawn } from "node:child_process";
const commands = [
  ["api", "pnpm", ["dev:api"]],
  ["fixture", "pnpm", ["dev:fixture"]],
  ["worker", "pnpm", ["dev:worker"]],
  ["web", "pnpm", ["dev:web"]],
] as const;
const processes = commands.map(([name, cmd, args]) => {
  const child = spawn(cmd, [...args], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.stdout.on("data", (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[${name}] ${data}`));
  return child;
});
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => {
    for (const child of processes) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
    process.exit(code);
  }, 3000).unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
for (const child of processes)
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
