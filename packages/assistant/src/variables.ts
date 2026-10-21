import type { DatabaseSync } from "node:sqlite";
import { DomainError } from "../../domain/src/index";
import { decrypt } from "./provider";

/** Project test data referenced from prompts and suites as `{{KEY}}`. */
export type TestVariable = { key: string; value: string; secret: boolean };

export const variableKeyPattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const placeholder = /\{\{([A-Z][A-Z0-9_]{0,63})\}\}/g;
const pureReference = /^\{\{([A-Z][A-Z0-9_]{0,63})\}\}$/;

/** Variable names referenced in a text, in order of appearance. */
export function placeholders(text: string) {
  return [...text.matchAll(placeholder)].map((match) => match[1]!);
}
/** Key of a value that is exactly one `{{KEY}}` reference. */
export function referenceKey(text: string) {
  return pureReference.exec(text)?.[1];
}
/** Replaces `{{KEY}}` with its value; an unknown key is a step error, never a guess. */
export function resolvePlaceholders(text: string, variables: TestVariable[]) {
  const values = new Map(variables.map((v) => [v.key, v.value]));
  return text.replace(placeholder, (_, key: string) => {
    const value = values.get(key);
    if (value === undefined)
      throw new DomainError(
        "MISSING_VARIABLE",
        `Test verisi tanımlı değil: {{${key}}}`,
      );
    return value;
  });
}
/** What the model may see: names always, values only when not secret. */
export function variablesForModel(variables: TestVariable[]) {
  return variables.map((v) =>
    v.secret ? { key: v.key, secret: true } : { key: v.key, value: v.value },
  );
}
/** Deep copy with every secret value replaced by its `{{KEY}}` reference. */
export function redactSecrets<T>(value: T, variables: TestVariable[]): T {
  const secrets = variables
    .filter((v) => v.secret && v.value)
    .sort((a, b) => b.value.length - a.value.length);
  if (!secrets.length) return value;
  const walk = (item: unknown): unknown => {
    if (typeof item === "string")
      return secrets.reduce(
        (text, v) => text.split(v.value).join(`{{${v.key}}}`),
        item,
      );
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([k, v]) => [k, walk(v)]),
      );
    return item;
  };
  return walk(value) as T;
}
/**
 * Variables visible to a target: project-wide rows ('' origin) overridden by
 * rows scoped to the target origin. Secret values are decrypted here only.
 */
export function loadVariables(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  origin: string,
): TestVariable[] {
  const rows = db
    .prepare(
      "SELECT key,value,secret,origin FROM test_variables WHERE org_id=? AND project_id=? AND origin IN ('',?) ORDER BY origin",
    )
    .all(orgId, projectId, origin) as {
    key: string;
    value: string;
    secret: number;
    origin: string;
  }[];
  const byKey = new Map<string, TestVariable>();
  for (const row of rows)
    byKey.set(row.key, {
      key: row.key,
      value: row.secret ? decrypt(row.value) : row.value,
      secret: !!row.secret,
    });
  return [...byKey.values()];
}
