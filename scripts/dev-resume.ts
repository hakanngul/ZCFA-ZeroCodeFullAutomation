import { backup, DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const project = process.cwd();
const persistent = resolve(project, ".local");

function providerInfo(dir: string) {
  const file = join(dir, "zerocode.sqlite");
  if (!existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db
      .prepare(
        "SELECT count(*) AS count, max(created_at) AS newest FROM ai_providers",
      )
      .get() as { count: number; newest: string | null };
    return { dir, count: row.count, newest: row.newest ?? "" };
  } catch {
    return { dir, count: 0, newest: "" };
  } finally {
    db.close();
  }
}

function candidates() {
  const dirs = new Set([persistent, join(persistent, "demo-data")]);
  for (const root of new Set(["/tmp", tmpdir(), persistent])) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (
        root === persistent ||
        (root !== persistent && name.startsWith("zerocode-demo."))
      )
        dirs.add(join(root, name));
    }
  }
  return [...dirs]
    .map(providerInfo)
    .filter((value): value is NonNullable<typeof value> => !!value);
}

async function chooseDataDir() {
  if (process.env.ZC_DATA_DIR) return resolve(process.env.ZC_DATA_DIR);
  const saved = candidates()
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const time = b.newest.localeCompare(a.newest);
      if (time) return time;
      const aPersistent = a.dir.startsWith(persistent) ? 1 : 0;
      const bPersistent = b.dir.startsWith(persistent) ? 1 : 0;
      return bPersistent - aPersistent;
    })[0];
  if (!saved) {
    const fallback = existsSync(
      join(persistent, "demo-data", "zerocode.sqlite"),
    )
      ? join(persistent, "demo-data")
      : persistent;
    console.log(`Kayıtlı provider bulunamadı. Veri dizini: ${fallback}`);
    return fallback;
  }
  if (saved.dir.startsWith(persistent)) return saved.dir;
  const key = join(saved.dir, "assistant.key");
  if (!existsSync(key) && !process.env.ZC_AI_ENCRYPTION_KEY)
    throw new Error(
      `Provider veritabanı bulundu fakat şifreleme anahtarı yok: ${saved.dir}`,
    );
  const destination = join(
    persistent,
    `recovered-${basename(saved.dir)}-${Date.now()}`,
  );
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(join(saved.dir, "zerocode.sqlite"), {
    readOnly: true,
  });
  try {
    await backup(source, join(destination, "zerocode.sqlite"));
  } finally {
    source.close();
  }
  if (existsSync(key)) {
    cpSync(key, join(destination, "assistant.key"));
    chmodSync(join(destination, "assistant.key"), 0o600);
  }
  const artifacts = join(saved.dir, "artifacts");
  if (existsSync(artifacts) && statSync(artifacts).isDirectory())
    cpSync(artifacts, join(destination, "artifacts"), { recursive: true });
  console.log(`Önceki provider verileri kalıcı dizine taşındı: ${destination}`);
  return destination;
}

process.env.ZC_DATA_DIR = await chooseDataDir();
console.log(`Kullanılan veri dizini: ${process.env.ZC_DATA_DIR}`);
if (!process.argv.includes("--print-only")) await import("./dev");
