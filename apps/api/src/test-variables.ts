import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store } from "../../../packages/storage/src/index";
import { DomainError, type Actor } from "../../../packages/domain/src/index";
import { encrypt } from "../../../packages/assistant/src/provider";
import { variableKeyPattern } from "../../../packages/assistant/src/variables";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };
type Row = {
  id: string;
  origin: string;
  key: string;
  value: string;
  secret: number;
  created_at: string;
  updated_at: string;
};
const idParam = z.object({ id: z.uuid() });
const variableInput = z
  .object({
    key: z
      .string()
      .trim()
      .regex(variableKeyPattern, "Anahtar BÜYÜK_HARF, rakam ve _ içermeli."),
    // Omitted on update keeps the stored value (secrets are never sent back).
    value: z.string().min(1).max(500).optional(),
    secret: z.boolean(),
    origin: z.string().max(1000).nullable().optional(),
  })
  .strict();
function scopeOrigin(raw: string | null | undefined) {
  if (!raw?.trim()) return "";
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new DomainError("INVALID_ORIGIN", "Geçersiz hedef adresi.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username)
    throw new DomainError("INVALID_ORIGIN", "Geçersiz hedef adresi.");
  return url.origin;
}
/** Browser-safe view: secret values never leave the server after save. */
function safe(row: Row) {
  return {
    id: row.id,
    key: row.key,
    origin: row.origin || null,
    secret: !!row.secret,
    value: row.secret ? null : row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function registerTestVariables(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
) {
  const base = "/v1/projects/:projectId/test-variables";
  const get = (orgId: string, projectId: string, id: string) => {
    const row = store.db
      .prepare(
        "SELECT * FROM test_variables WHERE id=? AND org_id=? AND project_id=?",
      )
      .get(id, orgId, projectId) as Row | undefined;
    if (!row)
      throw new DomainError("NOT_FOUND", "Test verisi bulunamadı.", 404);
    return row;
  };
  const duplicate = (
    orgId: string,
    projectId: string,
    origin: string,
    key: string,
    except = "",
  ) => {
    if (
      store.db
        .prepare(
          "SELECT id FROM test_variables WHERE org_id=? AND project_id=? AND origin=? AND key=? AND id<>?",
        )
        .get(orgId, projectId, origin, key, except)
    )
      throw new DomainError(
        "VARIABLE_EXISTS",
        "Bu kapsamda aynı anahtar zaten var.",
        409,
      );
  };
  app.get(base, async (request) => {
    const { user, projectId } = scoped(request);
    return {
      variables: (
        store.db
          .prepare(
            "SELECT * FROM test_variables WHERE org_id=? AND project_id=? ORDER BY key,origin",
          )
          .all(user.orgId, projectId) as Row[]
      ).map(safe),
    };
  });
  app.post(base, async (request, reply) => {
    const { user, projectId } = scoped(request, true);
    const input = variableInput.parse(request.body);
    if (!input.value) throw new DomainError("VALUE_REQUIRED", "Değer gerekli.");
    const origin = scopeOrigin(input.origin);
    duplicate(user.orgId, projectId, origin, input.key);
    const id = randomUUID(),
      now = new Date().toISOString();
    store.db
      .prepare("INSERT INTO test_variables VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        user.orgId,
        projectId,
        origin,
        input.key,
        input.secret ? encrypt(input.value) : input.value,
        input.secret ? 1 : 0,
        now,
        now,
      );
    store.audit(user, projectId, "test_variable.created", id);
    return reply.code(201).send(safe(get(user.orgId, projectId, id)));
  });
  app.put(`${base}/:id`, async (request) => {
    const { user, projectId } = scoped(request, true),
      { id } = idParam.parse(request.params),
      old = get(user.orgId, projectId, id),
      input = variableInput.parse(request.body);
    // Keeping a secret's stored value is fine; exposing it as plain is not.
    if (!input.value && (old.secret ? !input.secret : input.secret))
      throw new DomainError(
        "VALUE_REQUIRED",
        "Gizlilik değişince değeri yeniden girin.",
      );
    const origin = scopeOrigin(input.origin);
    duplicate(user.orgId, projectId, origin, input.key, id);
    const value = input.value
      ? input.secret
        ? encrypt(input.value)
        : input.value
      : old.value;
    store.db
      .prepare(
        "UPDATE test_variables SET origin=?,key=?,value=?,secret=?,updated_at=? WHERE id=? AND org_id=? AND project_id=?",
      )
      .run(
        origin,
        input.key,
        value,
        input.secret ? 1 : 0,
        new Date().toISOString(),
        id,
        user.orgId,
        projectId,
      );
    store.audit(user, projectId, "test_variable.updated", id);
    return safe(get(user.orgId, projectId, id));
  });
  app.delete(`${base}/:id`, async (request) => {
    const { user, projectId } = scoped(request, true),
      { id } = idParam.parse(request.params);
    get(user.orgId, projectId, id);
    store.db
      .prepare(
        "DELETE FROM test_variables WHERE id=? AND org_id=? AND project_id=?",
      )
      .run(id, user.orgId, projectId);
    store.audit(user, projectId, "test_variable.deleted", id);
    return { status: "deleted" };
  });
}
