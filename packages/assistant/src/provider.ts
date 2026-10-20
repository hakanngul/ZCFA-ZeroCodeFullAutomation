import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { DomainError } from "../../domain/src/index";
import { localDir } from "../../storage/src/index";

function key() {
  const configured = process.env.ZC_AI_ENCRYPTION_KEY;
  if (configured) {
    const data = Buffer.from(configured, "base64");
    if (data.length !== 32)
      throw new Error("ZC_AI_ENCRYPTION_KEY must be 32 base64 bytes");
    return data;
  }
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const path = resolve(localDir, "assistant.key");
  try {
    const data = readFileSync(path);
    if (data.length !== 32) throw new Error("Invalid assistant encryption key");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const data = randomBytes(32);
    try {
      writeFileSync(path, data, { flag: "wx", mode: 0o600 });
    } catch (race) {
      if ((race as NodeJS.ErrnoException).code !== "EEXIST") throw race;
      return readFileSync(path);
    }
    chmodSync(path, 0o600);
    return data;
  }
}
export function encrypt(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt(value: string) {
  const raw = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export type Provider = {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  encrypted_key: string;
  model: string;
  timeout_ms: number;
  active: number;
};
export async function providerRequest(
  provider: Provider,
  path: string,
  body?: unknown,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeout_ms);
  try {
    const response = await fetch(
      `${provider.base_url.replace(/\/$/, "")}/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${decrypt(provider.encrypted_key)}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        redirect: "manual",
      },
    );
    if (response.status === 401 || response.status === 403)
      throw new DomainError(
        "PROVIDER_AUTH",
        "API anahtarı veya erişim yetkisi geçersiz.",
        400,
      );
    if (!response.ok)
      throw new DomainError(
        response.status === 404 ? "PROVIDER_UNSUPPORTED" : "PROVIDER_HTTP",
        `Provider HTTP ${response.status} döndürdü.`,
        400,
      );
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (controller.signal.aborted)
      throw new DomainError(
        "PROVIDER_TIMEOUT",
        "Provider bağlantısı zaman aşımına uğradı.",
        400,
      );
    throw new DomainError(
      "PROVIDER_NETWORK",
      "Provider bağlantısı kurulamadı.",
      400,
    );
  } finally {
    clearTimeout(timeout);
  }
}
