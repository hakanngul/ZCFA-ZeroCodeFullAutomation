import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  aiElementHistory,
  healSuggestions,
  ignoreHealSuggestion,
  mergeAiElements,
  mergeElementSchema,
  projectSettings,
  projectSettingsSchema,
  promoteHealSchema,
  promoteHealSuggestion,
  saveProjectSettings,
  Store,
} from "../../../packages/storage/src/index";
import type { Actor } from "../../../packages/domain/src/index";

type Scoped = (
  request: FastifyRequest,
  write?: boolean,
) => { user: Actor; projectId: string };

/** Project setting, heal suggestions and element merge (ADR 016). */
export function registerSelfHealing(
  app: FastifyInstance,
  store: Store,
  scoped: Scoped,
) {
  const idParam = z.object({ id: z.uuid() });
  app.get("/v1/projects/:projectId/settings", async (request) => {
    const { user, projectId } = scoped(request);
    return projectSettings(store.db, user.orgId, projectId);
  });
  app.put("/v1/projects/:projectId/settings", async (request) => {
    const { user, projectId } = scoped(request, true);
    const input = projectSettingsSchema.parse(request.body);
    return store.transaction(() => {
      const saved = saveProjectSettings(store.db, user, projectId, input);
      store.audit(
        user,
        projectId,
        input.selfHealing
          ? "project.self_healing_on"
          : "project.self_healing_off",
        projectId,
      );
      return saved;
    });
  });
  const suggestionQuery = z.object({
    status: z.enum(["pending", "promoted", "ignored"]).default("pending"),
  });
  app.get("/v1/projects/:projectId/ai/heal-suggestions", async (request) => {
    const { user, projectId } = scoped(request);
    const { status } = suggestionQuery.parse(request.query ?? {});
    return {
      suggestions: healSuggestions(store.db, user.orgId, projectId, status),
    };
  });
  // "Birincil yap": healed alternative → primary, new element revision.
  app.post(
    "/v1/projects/:projectId/ai/heal-suggestions/:id/promote",
    async (request) => {
      const { user, projectId } = scoped(request, true);
      const { id } = idParam.parse(request.params);
      const input = promoteHealSchema.parse(request.body);
      const result = store.transaction(() => {
        const promoted = promoteHealSuggestion(
          store.db,
          user,
          projectId,
          id,
          input,
        );
        store.audit(
          user,
          projectId,
          "ai_element.heal_promoted",
          promoted.element.id,
        );
        return promoted;
      });
      return {
        ...result,
        history: aiElementHistory(
          store.db,
          user.orgId,
          projectId,
          result.element.id,
        ),
      };
    },
  );
  app.post(
    "/v1/projects/:projectId/ai/heal-suggestions/:id/ignore",
    async (request) => {
      const { user, projectId } = scoped(request, true);
      const { id } = idParam.parse(request.params);
      return store.transaction(() => {
        const ignored = ignoreHealSuggestion(store.db, user, projectId, id);
        store.audit(user, projectId, "ai_element.heal_ignored", id);
        return ignored;
      });
    },
  );
  // "Birleştir": retire an unapproved duplicate into a target element.
  app.post("/v1/projects/:projectId/ai/elements/:id/merge", async (request) => {
    const { user, projectId } = scoped(request, true);
    const { id } = idParam.parse(request.params);
    const input = mergeElementSchema.parse(request.body);
    const result = store.transaction(() => {
      const merged = mergeAiElements(store.db, user, projectId, id, input);
      store.audit(user, projectId, "ai_element.merged", id);
      return merged;
    });
    return {
      ...result,
      history: aiElementHistory(
        store.db,
        user.orgId,
        projectId,
        result.element.id,
      ),
    };
  });
}
