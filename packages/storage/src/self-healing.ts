import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, type Actor } from "../../domain/src/index";
import {
  activeElement,
  aiElementView,
  alternativesOf,
  libraryLocatorKey,
  primaryOf,
  snapshot,
  suggestionsOf,
  type ElementRow,
  type LibraryLocator,
} from "./ai-elements";

/** Project settings (migration 012); self-healing is opt-in (ADR 016). */
export function projectSettings(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
) {
  const row = db
    .prepare(
      "SELECT self_healing,updated_at FROM project_settings WHERE org_id=? AND project_id=?",
    )
    .get(orgId, projectId) as
    { self_healing: number; updated_at: string } | undefined;
  return {
    selfHealing: row?.self_healing === 1,
    updatedAt: row?.updated_at ?? null,
  };
}
export const projectSettingsSchema = z
  .object({ selfHealing: z.boolean() })
  .strict();
export function saveProjectSettings(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  input: z.infer<typeof projectSettingsSchema>,
) {
  db.prepare(
    `INSERT INTO project_settings (org_id,project_id,self_healing,updated_by,updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(org_id,project_id) DO UPDATE SET self_healing=excluded.self_healing,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
  ).run(
    actor.orgId,
    projectId,
    input.selfHealing ? 1 : 0,
    actor.userId,
    new Date().toISOString(),
  );
  return projectSettings(db, actor.orgId, projectId);
}

type Loc = { kind: string; value: string; role?: string };
type HealedResult = {
  results?: {
    steps?: {
      status?: string;
      element?: string;
      elementRevision?: number;
      healed?: { locator: Loc; primary: Loc };
    }[];
  }[];
};
/**
 * One pending suggestion per healed element + locator of a run (the steps
 * column counts the healed steps). Called inside the run's finish
 * transaction; `elements` maps keys to the pinned element ids.
 */
export function recordHealSuggestions(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  runKind: "ai_suite" | "ai_test_run",
  runId: string,
  result: HealedResult,
  elements: Record<string, { elementId?: string } | { unavailable: string }>,
  now = new Date().toISOString(),
) {
  const groups = new Map<
    string,
    {
      elementId: string;
      elementKey: string;
      revision: number;
      primary: Loc;
      locator: Loc;
      steps: number;
    }
  >();
  for (const scenario of result.results ?? [])
    for (const step of scenario.steps ?? []) {
      // Only a step that then passed is evidence that the alternative works.
      if (
        !step.healed ||
        step.status !== "passed" ||
        !step.element ||
        !step.elementRevision
      )
        continue;
      const bound = elements[step.element];
      const elementId =
        bound && "elementId" in bound ? bound.elementId : undefined;
      if (!elementId) continue;
      const key = JSON.stringify([
        elementId,
        step.elementRevision,
        libraryLocatorKey(step.healed.locator),
      ]);
      const group = groups.get(key);
      if (group) group.steps++;
      else
        groups.set(key, {
          elementId,
          elementKey: step.element,
          revision: step.elementRevision,
          primary: step.healed.primary,
          locator: step.healed.locator,
          steps: 1,
        });
    }
  const insert = db.prepare(
    "INSERT OR IGNORE INTO ai_heal_suggestions (id,org_id,project_id,element_id,element_key,revision,primary_locator,locator,run_kind,run_id,steps,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?)",
  );
  for (const group of groups.values())
    insert.run(
      randomUUID(),
      orgId,
      projectId,
      group.elementId,
      group.elementKey,
      group.revision,
      JSON.stringify(group.primary),
      JSON.stringify(group.locator),
      runKind,
      runId,
      group.steps,
      now,
    );
  return groups.size;
}

type SuggestionRow = {
  id: string;
  org_id: string;
  project_id: string;
  element_id: string;
  element_key: string;
  revision: number;
  primary_locator: string;
  locator: string;
  run_kind: string;
  run_id: string;
  steps: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
};
function suggestionView(row: SuggestionRow, element?: ElementRow) {
  return {
    id: row.id,
    elementId: row.element_id,
    elementKey: row.element_key,
    revision: row.revision,
    primary: JSON.parse(row.primary_locator) as LibraryLocator,
    locator: JSON.parse(row.locator) as LibraryLocator,
    runKind: row.run_kind,
    runId: row.run_id,
    steps: row.steps,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    element: element
      ? {
          name: element.name,
          revision: element.revision,
          approved: element.approved === 1,
          merged: !!element.merged_into,
          locator: primaryOf(element),
        }
      : null,
  };
}
export function healSuggestions(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  status: "pending" | "promoted" | "ignored" = "pending",
) {
  const element = db.prepare(
    "SELECT * FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
  );
  return (
    db
      .prepare(
        "SELECT * FROM ai_heal_suggestions WHERE org_id=? AND project_id=? AND status=? ORDER BY created_at DESC,id LIMIT 200",
      )
      .all(orgId, projectId, status) as unknown as SuggestionRow[]
  ).map((row) =>
    suggestionView(
      row,
      element.get(row.element_id, orgId, projectId) as ElementRow | undefined,
    ),
  );
}
function suggestion(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  const row = db
    .prepare(
      "SELECT * FROM ai_heal_suggestions WHERE id=? AND org_id=? AND project_id=?",
    )
    .get(id, orgId, projectId) as SuggestionRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Öneri bulunamadı.", 404);
  if (row.status !== "pending")
    throw new DomainError(
      "SUGGESTION_RESOLVED",
      "Bu öneri zaten sonuçlandırıldı.",
      409,
    );
  return row;
}
/** Every pending suggestion of the same element + locator is resolved together. */
function resolveSame(
  db: DatabaseSync,
  actor: Actor,
  row: SuggestionRow,
  status: "promoted" | "ignored",
) {
  return db
    .prepare(
      "UPDATE ai_heal_suggestions SET status=?,resolved_by=?,resolved_at=? WHERE org_id=? AND project_id=? AND element_id=? AND locator=? AND status='pending'",
    )
    .run(
      status,
      actor.userId,
      new Date().toISOString(),
      row.org_id,
      row.project_id,
      row.element_id,
      row.locator,
    ).changes;
}
export const promoteHealSchema = z
  .object({ expectedRevision: z.number().int().min(1) })
  .strict();
/**
 * "Birincil yap" (caller wraps it in a transaction): the healed locator — an
 * approved alternative of the element — becomes primary and the old primary
 * moves to the end of the alternatives. The locator set is unchanged, so
 * approval is kept; the swap is a new revision (ADR 015 impact flow).
 */
export function promoteHealSuggestion(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  input: z.infer<typeof promoteHealSchema>,
) {
  const row = suggestion(db, actor.orgId, projectId, id);
  const element = activeElement(db, actor.orgId, projectId, row.element_id);
  if (element.revision !== input.expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Element değişti. Güncel sürümü açıp değişikliği tekrar uygula.",
      409,
    );
  const healed = JSON.parse(row.locator) as LibraryLocator;
  const key = libraryLocatorKey(healed);
  const primary = primaryOf(element);
  const alternatives = alternativesOf(element);
  if (!alternatives.some((locator) => libraryLocatorKey(locator) === key))
    throw new DomainError(
      "SUGGESTION_STALE",
      libraryLocatorKey(primary) === key
        ? "Bu locator zaten birincil."
        : "Bu locator artık elementin alternatifleri arasında değil.",
      409,
    );
  if (
    db
      .prepare(
        "SELECT id FROM ai_page_elements WHERE org_id=? AND project_id=? AND page_url=? AND locator_kind=? AND locator_value=? AND id<>? AND merged_into IS NULL",
      )
      .get(
        actor.orgId,
        projectId,
        element.page_url,
        healed.kind,
        healed.value,
        element.id,
      )
  )
    throw new DomainError(
      "LOCATOR_IN_USE",
      "Bu birincil locator aynı sayfada başka bir elemente ait; önce o kopyayı birleştirin.",
      409,
    );
  const now = new Date().toISOString();
  snapshot(db, element, "observed", "system", now);
  const next: ElementRow = {
    ...element,
    locator_kind: healed.kind,
    locator_value: healed.value,
    locator_role: healed.kind === "role" ? healed.role : "",
    alternatives: JSON.stringify([
      ...alternatives.filter((locator) => libraryLocatorKey(locator) !== key),
      primary,
    ]),
    suggested_alternatives: JSON.stringify(
      suggestionsOf(element).filter((l) => libraryLocatorKey(l) !== key),
    ),
    revision: element.revision + 1,
  };
  db.prepare(
    "UPDATE ai_page_elements SET locator_kind=?,locator_value=?,locator_role=?,alternatives=?,suggested_alternatives=?,revision=? WHERE id=? AND revision=?",
  ).run(
    next.locator_kind,
    next.locator_value,
    next.locator_role,
    next.alternatives,
    next.suggested_alternatives!,
    next.revision,
    element.id,
    element.revision,
  );
  snapshot(db, next, "heal_promoted", actor.userId, now);
  const resolved = resolveSame(db, actor, row, "promoted");
  return { element: aiElementView(next), resolved };
}
export function ignoreHealSuggestion(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
) {
  const row = suggestion(db, actor.orgId, projectId, id);
  return { resolved: resolveSame(db, actor, row, "ignored") };
}
