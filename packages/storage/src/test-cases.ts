import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, type Actor } from "../../domain/src/index";
import {
  activeElement,
  alternativesOf,
  libraryLocatorKey,
  libraryLocatorSchema,
  maxAlternatives,
  primaryOf,
  snapshot,
  suggestElementKey,
  suggestionsOf,
  suggestPageKey,
  type ElementRow,
  type LibraryLocator,
} from "./ai-elements";

/**
 * Editable test suites and cases (ADR 017). An AI exploration creates a draft
 * suite whose element steps bind library elements by id; approval pins the
 * element revisions a run resolves its locators from.
 */
type Loc = { kind: string; value: string; role?: string };

export const caseStepKinds = [
  "navigate",
  "click",
  "fill",
  "select",
  "assertVisible",
  "assertText",
  "assertUrl",
  "assertNoConsoleErrors",
  "assertNoBrokenLinks",
  "assertAccessible",
] as const;
export type CaseStepKind = (typeof caseStepKinds)[number];
/** Step kinds that act on one page element (bound by library id). */
export const elementStepKinds: ReadonlySet<string> = new Set([
  "click",
  "fill",
  "select",
  "assertVisible",
  "assertText",
]);
export const unresolvedReasons = [
  "unverified",
  "unobserved",
  "missing",
  "merged",
] as const;
const unresolvedSchema = z
  .object({
    reason: z.enum(unresolvedReasons),
    message: z.string().max(300),
    label: z.string().max(120).optional(),
    locator: libraryLocatorSchema.optional(),
  })
  .strict();
export const caseStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(caseStepKinds),
    elementId: z.uuid().optional(),
    value: z.string().max(200).optional(),
    expected: z.string().max(500).optional(),
    url: z.url().max(1000).optional(),
    ignore: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
    impact: z.enum(["critical", "serious"]).optional(),
    unresolved: unresolvedSchema.optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", message, path: [step.kind] });
    const needsElement = elementStepKinds.has(step.kind);
    if (!needsElement && (step.elementId || step.unresolved))
      fail("element_not_allowed");
    if (step.elementId && step.unresolved) fail("element_or_unresolved");
    if ((step.kind === "fill" || step.kind === "select") && step.value == null)
      fail("value_required");
    if (step.kind === "select" && !step.value) fail("value_required");
    if (step.kind === "assertText" && !step.expected?.trim())
      fail("expected_required");
    if (step.kind === "assertUrl" && !z.url().safeParse(step.expected).success)
      fail("expected_url_required");
    if (step.kind === "navigate" && !step.url) fail("url_required");
  });
export type CaseStep = z.infer<typeof caseStepSchema>;
export const caseDefinitionSchema = z
  .object({
    description: z.string().trim().max(500).default(""),
    preconditions: z
      .array(z.string().trim().min(1).max(200))
      .max(10)
      .default([]),
    testData: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(60),
            value: z.string().max(200),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    expectedResults: z
      .array(z.string().trim().min(1).max(300))
      .max(10)
      .default([]),
    steps: z.array(caseStepSchema).min(1).max(20),
  })
  .strict()
  .superRefine((definition, ctx) => {
    const ids = new Set<string>();
    definition.steps.forEach((step, index) => {
      if (ids.has(step.id))
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "id"],
          message: "duplicate_step_id",
        });
      ids.add(step.id);
    });
  });
export type CaseDefinition = z.infer<typeof caseDefinitionSchema>;
export const caseCategories = ["positive", "negative", "edge"] as const;
export const caseUpdateSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    title: z.string().trim().min(3).max(160),
    category: z.enum(caseCategories),
    definition: caseDefinitionSchema,
  })
  .strict();
export const caseCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    category: z.enum(caseCategories).default("positive"),
    definition: caseDefinitionSchema.optional(),
  })
  .strict();

/**
 * Guarded part of migration 013: the library records the last verification
 * of an element's primary locator (`verified` | `failed` | `unverified`).
 */
export function migrateElementVerification(db: DatabaseSync) {
  const columns = () =>
    new Set(
      (
        db.prepare("PRAGMA table_info(ai_page_elements)").all() as {
          name: string;
        }[]
      ).map((row) => row.name),
    );
  const missing = (
    [
      ["verification", "TEXT NOT NULL DEFAULT 'unverified'"],
      ["verified_at", "TEXT"],
    ] as const
  ).filter(([name]) => !columns().has(name));
  if (!missing.length) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    // API and worker may race; the loser sees the columns and skips.
    const now = columns();
    for (const [name, definition] of missing)
      if (!now.has(name))
        db.exec(
          `ALTER TABLE ai_page_elements ADD COLUMN ${name} ${definition}`,
        );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Registration of the elements a generated suite needs.

export type NeededObservation = {
  tag: string;
  text: string;
  role: string;
  type: string;
  locator: Loc;
  alternatives?: Loc[];
  /** The primary locator matched exactly one node when it was observed. */
  unique?: boolean;
};
export type ObservedPageForCases = {
  url: string;
  elements: NeededObservation[];
};
export type SuiteForCases = {
  title: string;
  targetUrl: string;
  scenarios: {
    title: string;
    category: string;
    description?: string;
    preconditions?: string[];
    testData?: { name: string; value: string }[];
    expectedResults?: string[];
    actions: ({ kind: string } & Record<string, unknown>)[];
  }[];
};
export type RegistrationStats = {
  created: number;
  reused: number;
  suggested: number;
  unresolved: number;
};
const pageUrlOf = (raw: string) => {
  const url = new URL(raw);
  url.search = "";
  url.hash = "";
  return url.href;
};
const locatorText = (l: Loc) =>
  l.kind === "role" ? `role(${l.role})=${l.value}` : `${l.kind}=${l.value}`;

/**
 * Finds the library element for one observed node (same page, any shared
 * primary/alternative/suggested locator) or creates it. Called only for nodes
 * a suite step needs, and only when the observation was verified unique.
 * Approved elements never change: other verified candidates become
 * suggestions. Unapproved elements may adopt a verified primary; every
 * locator change of an existing element is a new revision.
 */
function matchOrCreate(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  pageUrl: string,
  node: NeededObservation,
  now: string,
  stats: RegistrationStats,
): { id: string; warning?: string } {
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const candidates = [node.locator, ...(node.alternatives ?? [])]
    .filter((l) => l.value.length > 0)
    .filter((l) => {
      const key = libraryLocatorKey(l);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 1 + maxAlternatives) as LibraryLocator[];
  const keys = candidates.map(libraryLocatorKey);
  const rows = db
    .prepare(
      "SELECT * FROM ai_page_elements WHERE org_id=? AND project_id=? AND page_url=? AND merged_into IS NULL ORDER BY first_seen_at,id",
    )
    .all(orgId, projectId, pageUrl) as unknown as ElementRow[];
  const matches = rows
    .map((row) => ({
      row,
      primary: libraryLocatorKey(primaryOf(row)),
      known: [
        primaryOf(row),
        ...alternativesOf(row),
        ...suggestionsOf(row),
      ].map(libraryLocatorKey),
    }))
    .filter((entry) => entry.known.some((key) => keys.includes(key)))
    .sort(
      (a, b) =>
        b.row.approved - a.row.approved ||
        Number(b.primary === keys[0]) - Number(a.primary === keys[0]),
    );
  const verify = db.prepare(
    "UPDATE ai_page_elements SET verification=?,verified_at=?,last_seen_at=? WHERE id=?",
  );
  const match = matches[0];
  if (match) {
    const row = match.row;
    stats.reused++;
    const primaryVerified = keys.includes(match.primary);
    const known = new Set(match.known);
    const added = candidates.filter((l) => !known.has(libraryLocatorKey(l)));
    if (row.approved === 1) {
      // The approved primary is kept even when exploration saw it differently.
      if (added.length) {
        const suggestions = [...suggestionsOf(row), ...added].slice(
          0,
          maxAlternatives,
        );
        db.prepare(
          "UPDATE ai_page_elements SET suggested_alternatives=? WHERE id=?",
        ).run(JSON.stringify(suggestions), row.id);
        stats.suggested++;
      }
      verify.run(primaryVerified ? "verified" : "failed", now, now, row.id);
      return primaryVerified
        ? { id: row.id }
        : {
            id: row.id,
            warning: `Onaylı "${row.name}" elementinin birincil locator'ı (${locatorText(primaryOf(row))}) keşifte tekil doğrulanamadı; gözlenen locator öneri olarak eklendi, onaylı kayıt değişmedi.`,
          };
    }
    // Unapproved: adopt the verified candidate as primary when needed and
    // append new candidates; the old state stays in the history.
    const nextPrimary = primaryVerified ? primaryOf(row) : candidates[0]!;
    const rest = [
      ...(primaryVerified ? [] : [primaryOf(row)]),
      ...alternativesOf(row),
      ...added,
    ].filter(
      (l, i, all) =>
        libraryLocatorKey(l) !== libraryLocatorKey(nextPrimary) &&
        all.findIndex((x) => libraryLocatorKey(x) === libraryLocatorKey(l)) ===
          i,
    );
    const alternatives = rest.slice(0, maxAlternatives);
    const changed =
      !primaryVerified ||
      JSON.stringify(alternatives.map(libraryLocatorKey)) !==
        JSON.stringify(alternativesOf(row).map(libraryLocatorKey));
    if (changed) {
      if (
        !primaryVerified &&
        db
          .prepare(
            "SELECT id FROM ai_page_elements WHERE org_id=? AND project_id=? AND page_url=? AND locator_kind=? AND locator_value=? AND id<>? AND merged_into IS NULL",
          )
          .get(
            orgId,
            projectId,
            pageUrl,
            nextPrimary.kind,
            nextPrimary.value,
            row.id,
          )
      ) {
        verify.run("failed", now, now, row.id);
        return {
          id: row.id,
          warning: `"${row.name}" elementinin locator'ı doğrulanamadı ve gözlenen locator aynı sayfada başka bir elemente ait.`,
        };
      }
      snapshot(db, row, "observed", "system", now);
      const next: ElementRow = {
        ...row,
        locator_kind: nextPrimary.kind,
        locator_value: nextPrimary.value,
        locator_role: nextPrimary.kind === "role" ? nextPrimary.role : "",
        alternatives: JSON.stringify(alternatives),
        revision: row.revision + 1,
      };
      db.prepare(
        "UPDATE ai_page_elements SET tag=?,label=?,role=?,input_type=?,locator_kind=?,locator_value=?,locator_role=?,alternatives=?,revision=? WHERE id=? AND revision=?",
      ).run(
        node.tag,
        node.text,
        node.role,
        node.type,
        next.locator_kind,
        next.locator_value,
        next.locator_role,
        next.alternatives,
        next.revision,
        row.id,
        row.revision,
      );
      snapshot(db, next, "reobserved", "system", now);
    }
    verify.run("verified", now, now, row.id);
    return { id: row.id };
  }
  const [primary, ...alternatives] = candidates;
  if (!primary) throw new DomainError("ELEMENT_UNRESOLVED", "Locator yok.");
  // Same primary on the page under a retired/other id: the unique index decides.
  const conflict = db
    .prepare(
      "SELECT id,merged_into FROM ai_page_elements WHERE org_id=? AND project_id=? AND page_url=? AND locator_kind=? AND locator_value=?",
    )
    .get(orgId, projectId, pageUrl, primary.kind, primary.value) as
    { id: string; merged_into: string | null } | undefined;
  if (conflict) {
    stats.reused++;
    const id = conflict.merged_into ?? conflict.id;
    verify.run("verified", now, now, id);
    return { id };
  }
  const id = randomUUID();
  const pageKey = suggestPageKey(pageUrl);
  db.prepare(
    `INSERT INTO ai_page_elements (id,org_id,project_id,page_url,tag,label,role,input_type,locator_kind,locator_value,first_seen_at,last_seen_at,origin,element_key,name,page_key,approved,alternatives,revision,locator_role,verification,verified_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,1,?,'verified',?)`,
  ).run(
    id,
    orgId,
    projectId,
    pageUrl,
    node.tag,
    node.text,
    node.role,
    node.type,
    primary.kind,
    primary.value,
    now,
    now,
    origin,
    suggestElementKey(
      db,
      orgId,
      projectId,
      origin,
      pageKey,
      node.text,
      node.tag,
    ),
    node.text.trim().slice(0, 120) || node.tag,
    pageKey,
    JSON.stringify(alternatives),
    primary.kind === "role" ? primary.role : "",
    now,
  );
  stats.created++;
  return { id };
}

type Binding =
  { elementId: string } | { unresolved: NonNullable<CaseStep["unresolved"]> };
/**
 * Turns a generated suite into case definitions whose element steps carry a
 * library element id (caller wraps it in a transaction). Only the nodes the
 * steps use are registered; an approved library key resolves to its record;
 * a node whose locator was not verified unique gets no record and the step
 * stays unresolved (the case is incomplete until a person picks an element).
 */
export function bindSuiteElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  pages: ObservedPageForCases[],
  suite: SuiteForCases,
  now = new Date().toISOString(),
) {
  const stats: RegistrationStats = {
    created: 0,
    reused: 0,
    suggested: 0,
    unresolved: 0,
  };
  const origin = new URL(suite.targetUrl).origin;
  const cache = new Map<string, Binding & { warning?: string }>();
  const findKey = db.prepare(
    "SELECT id,merged_into FROM ai_page_elements WHERE org_id=? AND project_id=? AND origin=? AND element_key=?",
  );
  const bind = (
    action: Record<string, unknown>,
  ): (Binding & { warning?: string }) | undefined => {
    if (typeof action.element === "string") {
      const cacheKey = `key:${action.element}`;
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      const row = findKey.get(orgId, projectId, origin, action.element) as
        { id: string; merged_into: string | null } | undefined;
      const binding: Binding = row
        ? { elementId: row.merged_into ?? row.id }
        : {
            unresolved: {
              reason: "missing",
              message: `Kütüphanede "${action.element}" anahtarlı element yok.`,
            },
          };
      cache.set(cacheKey, binding);
      return binding;
    }
    const locator = action.locator as Loc | undefined;
    if (!locator) return undefined;
    const lKey = libraryLocatorKey(locator);
    const hit = cache.get(lKey);
    if (hit) return hit;
    let found: { pageUrl: string; node: NeededObservation } | undefined;
    for (const page of pages) {
      const node = page.elements.find(
        (e) => libraryLocatorKey(e.locator) === lKey,
      );
      if (node) {
        try {
          found = { pageUrl: pageUrlOf(page.url), node };
        } catch {
          continue;
        }
        break;
      }
    }
    let binding: Binding & { warning?: string };
    if (!found)
      binding = {
        unresolved: {
          reason: "unobserved",
          message: `Locator keşfedilen sayfalarda gözlenmedi: ${locatorText(locator)}`,
          locator: locator as LibraryLocator,
        },
      };
    else if (found.node.unique !== true)
      binding = {
        unresolved: {
          reason: "unverified",
          message: `"${found.node.text || found.node.tag}" elementinin locator'ı sayfada tekil doğrulanamadı (${locatorText(locator)}); kütüphaneye kaydedilmedi.`,
          label: (found.node.text || found.node.tag).slice(0, 120),
          locator: locator as LibraryLocator,
        },
      };
    else {
      const result = matchOrCreate(
        db,
        orgId,
        projectId,
        found.pageUrl,
        found.node,
        now,
        stats,
      );
      binding = {
        elementId: result.id,
        ...(result.warning ? { warning: result.warning } : {}),
      };
    }
    cache.set(lKey, binding);
    return binding;
  };
  const warnings: string[] = [];
  const cases = suite.scenarios.map((scenario) => {
    const steps: CaseStep[] = scenario.actions.map((action) => {
      const { kind } = action;
      const step: CaseStep = { id: randomUUID(), kind: kind as CaseStepKind };
      if (kind === "fill" || kind === "select")
        step.value = String(action.value ?? "");
      if (kind === "assertText") step.expected = String(action.expected);
      if (kind === "assertUrl") step.expected = String(action.expected);
      if (kind === "navigate") step.url = String(action.url);
      if (kind === "assertNoConsoleErrors" && Array.isArray(action.ignore))
        step.ignore = action.ignore as string[];
      if (kind === "assertAccessible" && typeof action.impact === "string")
        step.impact = action.impact as "critical" | "serious";
      if (elementStepKinds.has(kind)) {
        const binding = bind(action);
        if (binding && "elementId" in binding) {
          step.elementId = binding.elementId;
          if (binding.warning && !warnings.includes(binding.warning))
            warnings.push(binding.warning);
        } else if (binding) {
          step.unresolved = binding.unresolved;
          stats.unresolved++;
        }
      }
      return step;
    });
    const definition: CaseDefinition = caseDefinitionSchema.parse({
      description: (scenario.description ?? "").slice(0, 500),
      preconditions: (scenario.preconditions ?? []).slice(0, 10),
      testData: (scenario.testData ?? []).slice(0, 20),
      expectedResults: (scenario.expectedResults ?? []).slice(0, 10),
      steps,
    });
    return {
      title: scenario.title.slice(0, 160),
      category: (caseCategories as readonly string[]).includes(
        scenario.category,
      )
        ? scenario.category
        : "positive",
      definition,
    };
  });
  return { cases, stats, warnings };
}

// ---------------------------------------------------------------------------
// Suites and cases.

export type SuiteRow = {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  target_url: string;
  origin: string;
  source: string;
  draft_id: string | null;
  prompt: string | null;
  model: string | null;
  notes: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type CaseRow = {
  id: string;
  org_id: string;
  project_id: string;
  suite_id: string;
  position: number;
  title: string;
  category: string;
  definition: string;
  revision: number;
  approval: string;
  approved_revision: number | null;
  approved_by: string | null;
  approved_at: string | null;
  pins: string;
  ai_generated: number;
  status: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
};
export type CasePin = { elementId: string; revision: number };

function writeCaseElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  caseId: string,
  definition: CaseDefinition,
) {
  db.prepare("DELETE FROM test_case_elements WHERE case_id=? AND org_id=?").run(
    caseId,
    orgId,
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO test_case_elements VALUES (?,?,?,?)",
  );
  for (const step of definition.steps)
    if (step.elementId) insert.run(caseId, orgId, projectId, step.elementId);
}

/** Creates a suite with its cases (caller wraps it in a transaction). */
export function createSuite(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  input: {
    title: string;
    targetUrl: string;
    source: "ai" | "manual";
    draftId?: string;
    prompt?: string;
    model?: string;
    notes?: string[];
    cases: { title: string; category: string; definition: CaseDefinition }[];
  },
  now = new Date().toISOString(),
) {
  const id = randomUUID();
  const origin = new URL(input.targetUrl).origin;
  db.prepare(
    "INSERT INTO test_suites (id,org_id,project_id,title,target_url,origin,source,draft_id,prompt,model,notes,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)",
  ).run(
    id,
    actor.orgId,
    projectId,
    input.title.slice(0, 160),
    input.targetUrl,
    origin,
    input.source,
    input.draftId ?? null,
    input.prompt?.slice(0, 2000) ?? null,
    input.model ?? null,
    JSON.stringify((input.notes ?? []).slice(0, 20)),
    actor.userId,
    now,
    now,
  );
  const caseIds = input.cases.map((c, position) =>
    insertCase(
      db,
      actor,
      projectId,
      id,
      position,
      c,
      input.source === "ai",
      now,
    ),
  );
  return { id, caseIds };
}
function insertCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  suiteId: string,
  position: number,
  input: { title: string; category: string; definition: CaseDefinition },
  aiGenerated: boolean,
  now: string,
) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO test_cases (id,org_id,project_id,suite_id,position,title,category,definition,revision,approval,pins,ai_generated,status,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,1,'draft','[]',?,'active',?,?,?)",
  ).run(
    id,
    actor.orgId,
    projectId,
    suiteId,
    position,
    input.title,
    input.category,
    JSON.stringify(input.definition),
    aiGenerated ? 1 : 0,
    now,
    now,
    actor.userId,
  );
  writeCaseElements(db, actor.orgId, projectId, id, input.definition);
  return id;
}

export function suiteRow(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  const row = db
    .prepare(
      "SELECT * FROM test_suites WHERE id=? AND org_id=? AND project_id=? AND status='active'",
    )
    .get(id, orgId, projectId) as SuiteRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Suite bulunamadı.", 404);
  return row;
}
export function caseRow(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  const row = db
    .prepare(
      "SELECT * FROM test_cases WHERE id=? AND org_id=? AND project_id=? AND status='active'",
    )
    .get(id, orgId, projectId) as CaseRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Test case bulunamadı.", 404);
  return row;
}

type ElementInfo = {
  id: string;
  elementKey: string;
  name: string;
  pageUrl: string;
  origin: string;
  approved: boolean;
  revision: number;
  verification: string;
  verifiedAt: string | null;
  mergedInto: string | null;
  locator: LibraryLocator;
};
function elementInfo(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  ids: string[],
) {
  const find = db.prepare(
    "SELECT * FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
  );
  const map = new Map<string, ElementInfo>();
  for (const id of new Set(ids)) {
    const row = find.get(id, orgId, projectId) as
      | (ElementRow & { verification?: string; verified_at?: string | null })
      | undefined;
    if (!row) continue;
    map.set(id, {
      id: row.id,
      elementKey: row.element_key,
      name: row.name,
      pageUrl: row.page_url,
      origin: row.origin,
      approved: row.approved === 1,
      revision: row.revision,
      verification: row.verification ?? "unverified",
      verifiedAt: row.verified_at ?? null,
      mergedInto: row.merged_into ?? null,
      locator: primaryOf(row),
    });
  }
  return map;
}

/** Reasons a case cannot be approved or run yet; empty when complete. */
export function caseIssues(
  definition: CaseDefinition,
  elements: Map<string, ElementInfo>,
  origin: string,
) {
  const issues: { step: number | null; code: string; message: string }[] = [];
  definition.steps.forEach((step, index) => {
    const n = index + 1;
    if (!elementStepKinds.has(step.kind)) {
      if (step.kind === "navigate" && step.url) {
        try {
          if (new URL(step.url).origin !== origin)
            issues.push({
              step: n,
              code: "TARGET_BLOCKED",
              message: `Adım ${n}: gezinme hedef site dışında.`,
            });
        } catch {
          /* schema validated */
        }
      }
      return;
    }
    if (!step.elementId) {
      issues.push({
        step: n,
        code: "ELEMENT_UNRESOLVED",
        message: `Adım ${n}: element bağlı değil${step.unresolved ? ` — ${step.unresolved.message}` : "."}`,
      });
      return;
    }
    const element = elements.get(step.elementId);
    if (!element)
      issues.push({
        step: n,
        code: "ELEMENT_MISSING",
        message: `Adım ${n}: bağlı element kütüphanede yok.`,
      });
    else if (element.mergedInto)
      issues.push({
        step: n,
        code: "ELEMENT_MERGED",
        message: `Adım ${n}: "${element.name}" başka bir elemente birleştirildi; yeni elementi seçin.`,
      });
    else if (element.origin !== origin)
      issues.push({
        step: n,
        code: "ELEMENT_ORIGIN_MISMATCH",
        message: `Adım ${n}: "${element.name}" bu suite'in sitesine ait değil.`,
      });
  });
  if (!definition.steps.some((s) => s.kind.startsWith("assert")))
    issues.push({
      step: null,
      code: "ASSERTION_REQUIRED",
      message: "Case en az bir doğrulama adımı içermeli.",
    });
  return issues;
}

const parsePins = (raw: string) => {
  try {
    return JSON.parse(raw) as CasePin[];
  } catch {
    return [];
  }
};
const lastRunOf = (db: DatabaseSync, orgId: string, caseId: string) =>
  (db
    .prepare(
      "SELECT id,status,case_revision,created_at,finished_at FROM test_case_runs WHERE org_id=? AND case_id=? ORDER BY created_at DESC,id LIMIT 1",
    )
    .get(orgId, caseId) as
    | {
        id: string;
        status: string;
        case_revision: number;
        created_at: string;
        finished_at: string | null;
      }
    | undefined) ?? null;

export function caseView(db: DatabaseSync, suite: SuiteRow, row: CaseRow) {
  const definition = caseDefinitionSchema.parse(JSON.parse(row.definition));
  const pins = parsePins(row.pins);
  const elements = elementInfo(db, row.org_id, row.project_id, [
    ...definition.steps.flatMap((s) => (s.elementId ? [s.elementId] : [])),
    ...pins.map((p) => p.elementId),
  ]);
  const issues = caseIssues(definition, elements, suite.origin);
  const pinOf = new Map(pins.map((p) => [p.elementId, p.revision]));
  const approved = row.approval === "approved";
  const lastRun = lastRunOf(db, row.org_id, row.id);
  return {
    id: row.id,
    suiteId: row.suite_id,
    position: row.position,
    title: row.title,
    category: row.category,
    revision: row.revision,
    approval: row.approval as "draft" | "approved",
    approvedRevision: row.approved_revision,
    approvedAt: row.approved_at,
    aiGenerated: row.ai_generated === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    definition,
    steps: definition.steps.map((step) => {
      const element = step.elementId ? elements.get(step.elementId) : undefined;
      const pinned = step.elementId ? pinOf.get(step.elementId) : undefined;
      return {
        ...step,
        element: element
          ? {
              ...element,
              pinnedRevision: approved ? (pinned ?? null) : null,
            }
          : null,
      };
    }),
    issues,
    complete: issues.length === 0,
    // Approved with an element that has a newer revision than its pin.
    stale:
      approved &&
      pins.some((p) => {
        const e = elements.get(p.elementId);
        return !!e && e.revision > p.revision;
      }),
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          revision: lastRun.case_revision,
          createdAt: lastRun.created_at,
          finishedAt: lastRun.finished_at,
        }
      : null,
  };
}
export type CaseView = ReturnType<typeof caseView>;

export function suiteView(db: DatabaseSync, suite: SuiteRow) {
  const cases = (
    db
      .prepare(
        "SELECT * FROM test_cases WHERE org_id=? AND suite_id=? AND status='active' ORDER BY position,created_at",
      )
      .all(suite.org_id, suite.id) as unknown as CaseRow[]
  ).map((row) => caseView(db, suite, row));
  let notes: string[] = [];
  try {
    notes = JSON.parse(suite.notes) as string[];
  } catch {
    notes = [];
  }
  return {
    id: suite.id,
    title: suite.title,
    targetUrl: suite.target_url,
    origin: suite.origin,
    source: suite.source,
    aiGenerated: suite.source === "ai",
    draftId: suite.draft_id,
    model: suite.model,
    prompt: suite.prompt,
    notes,
    createdAt: suite.created_at,
    updatedAt: suite.updated_at,
    cases,
    counts: {
      cases: cases.length,
      approved: cases.filter((c) => c.approval === "approved").length,
      incomplete: cases.filter((c) => !c.complete).length,
    },
  };
}
export type SuiteView = ReturnType<typeof suiteView>;

export function listSuites(db: DatabaseSync, orgId: string, projectId: string) {
  return (
    db
      .prepare(
        "SELECT * FROM test_suites WHERE org_id=? AND project_id=? AND status='active' ORDER BY updated_at DESC,created_at DESC LIMIT 200",
      )
      .all(orgId, projectId) as unknown as SuiteRow[]
  ).map((suite) => suiteView(db, suite));
}

function touchSuite(db: DatabaseSync, suiteId: string, now: string) {
  db.prepare("UPDATE test_suites SET updated_at=? WHERE id=?").run(
    now,
    suiteId,
  );
}
function assertElementsUsable(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  suite: SuiteRow,
  definition: CaseDefinition,
) {
  const ids = definition.steps.flatMap((s) =>
    s.elementId ? [s.elementId] : [],
  );
  const elements = elementInfo(db, orgId, projectId, ids);
  for (const id of ids) {
    const element = elements.get(id);
    if (!element)
      throw new DomainError("ELEMENT_MISSING", "Seçilen element yok.", 409);
    if (element.mergedInto)
      throw new DomainError(
        "ELEMENT_MERGED",
        `"${element.name}" başka bir elemente birleştirildi; birleştirilen elementi seçin.`,
        409,
      );
    if (element.origin !== suite.origin)
      throw new DomainError(
        "ELEMENT_ORIGIN_MISMATCH",
        "Element bu suite'in sitesine ait değil.",
        409,
      );
  }
}

/**
 * Human edit of a case (caller wraps it in a transaction). Stale revision →
 * 409; any edit is a new revision and clears approval, so a changed case
 * cannot run before it is approved again. Past runs keep their snapshot.
 */
export function updateCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  input: z.infer<typeof caseUpdateSchema>,
) {
  const row = caseRow(db, actor.orgId, projectId, id);
  if (row.revision !== input.expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Test case değişti. Güncel sürümü açıp değişikliği tekrar uygula.",
      409,
    );
  const suite = suiteRow(db, actor.orgId, projectId, row.suite_id);
  assertElementsUsable(db, actor.orgId, projectId, suite, input.definition);
  // An element picked for an unresolved step resolves it.
  const definition: CaseDefinition = {
    ...input.definition,
    steps: input.definition.steps.map((step) =>
      step.elementId ? { ...step, unresolved: undefined } : step,
    ),
  };
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE test_cases SET title=?,category=?,definition=?,revision=?,approval='draft',approved_revision=NULL,approved_by=NULL,approved_at=NULL,pins='[]',updated_at=?,updated_by=? WHERE id=? AND revision=?",
  ).run(
    input.title,
    input.category,
    JSON.stringify(definition),
    row.revision + 1,
    now,
    actor.userId,
    id,
    row.revision,
  );
  writeCaseElements(db, actor.orgId, projectId, id, definition);
  touchSuite(db, suite.id, now);
  return caseView(db, suite, caseRow(db, actor.orgId, projectId, id));
}

export function addCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  suiteId: string,
  input: z.infer<typeof caseCreateSchema>,
) {
  const suite = suiteRow(db, actor.orgId, projectId, suiteId);
  const definition =
    input.definition ??
    caseDefinitionSchema.parse({
      steps: [
        { id: randomUUID(), kind: "assertUrl", expected: suite.target_url },
      ],
    });
  assertElementsUsable(db, actor.orgId, projectId, suite, definition);
  const position = Number(
    (
      db
        .prepare(
          "SELECT coalesce(max(position),-1)+1 AS n FROM test_cases WHERE suite_id=? AND org_id=?",
        )
        .get(suite.id, actor.orgId) as { n: number }
    ).n,
  );
  const now = new Date().toISOString();
  const id = insertCase(
    db,
    actor,
    projectId,
    suite.id,
    position,
    { title: input.title, category: input.category, definition },
    false,
    now,
  );
  touchSuite(db, suite.id, now);
  return caseView(db, suite, caseRow(db, actor.orgId, projectId, id));
}

export function duplicateCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
) {
  const row = caseRow(db, actor.orgId, projectId, id);
  const suite = suiteRow(db, actor.orgId, projectId, row.suite_id);
  const definition = caseDefinitionSchema.parse(JSON.parse(row.definition));
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE test_cases SET position=position+1 WHERE suite_id=? AND org_id=? AND position>?",
  ).run(suite.id, actor.orgId, row.position);
  const copy = insertCase(
    db,
    actor,
    projectId,
    suite.id,
    row.position + 1,
    {
      title: `${row.title} (kopya)`.slice(0, 160),
      category: row.category,
      definition: {
        ...definition,
        steps: definition.steps.map((s) => ({ ...s, id: randomUUID() })),
      },
    },
    false,
    now,
  );
  touchSuite(db, suite.id, now);
  return caseView(db, suite, caseRow(db, actor.orgId, projectId, copy));
}

/** Soft delete: run history keeps referring to the case. */
export function deleteCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
) {
  const row = caseRow(db, actor.orgId, projectId, id);
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE test_cases SET status='deleted',updated_at=?,updated_by=? WHERE id=?",
  ).run(now, actor.userId, id);
  db.prepare("DELETE FROM test_case_elements WHERE case_id=? AND org_id=?").run(
    id,
    actor.orgId,
  );
  touchSuite(db, row.suite_id, now);
}
export function deleteSuite(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
) {
  const suite = suiteRow(db, actor.orgId, projectId, id);
  const now = new Date().toISOString();
  for (const row of db
    .prepare(
      "SELECT id FROM test_cases WHERE suite_id=? AND org_id=? AND status='active'",
    )
    .all(suite.id, actor.orgId) as { id: string }[])
    deleteCase(db, actor, projectId, row.id);
  db.prepare(
    "UPDATE test_suites SET status='deleted',updated_at=? WHERE id=?",
  ).run(now, suite.id);
}

export const suiteUpdateSchema = z
  .object({ title: z.string().trim().min(3).max(160) })
  .strict();
export function renameSuite(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  input: z.infer<typeof suiteUpdateSchema>,
) {
  const suite = suiteRow(db, actor.orgId, projectId, id);
  db.prepare("UPDATE test_suites SET title=?,updated_at=? WHERE id=?").run(
    input.title,
    new Date().toISOString(),
    suite.id,
  );
  return suiteView(db, suiteRow(db, actor.orgId, projectId, id));
}

/**
 * Human approval of one case revision (caller wraps it in a transaction):
 * pins the current revision of every bound element. Incomplete cases (an
 * unbound element step, a merged element, no assertion) cannot be approved.
 */
export function approveCase(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  expectedRevision: number,
) {
  const row = caseRow(db, actor.orgId, projectId, id);
  if (row.revision !== expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Test case değişti. Güncel sürümü açıp tekrar onaylayın.",
      409,
    );
  const suite = suiteRow(db, actor.orgId, projectId, row.suite_id);
  const view = caseView(db, suite, row);
  if (!view.complete)
    throw new DomainError(
      "CASE_INCOMPLETE",
      view.issues.map((i) => i.message).join(" "),
      409,
    );
  const now = new Date().toISOString();
  const pins: CasePin[] = [];
  for (const elementId of new Set(
    view.definition.steps.flatMap((s) => (s.elementId ? [s.elementId] : [])),
  )) {
    const element = activeElement(db, actor.orgId, projectId, elementId);
    // The pinned revision always has an immutable history row.
    snapshot(db, element, "pinned", "system", now);
    pins.push({ elementId, revision: element.revision });
  }
  db.prepare(
    "UPDATE test_cases SET approval='approved',approved_revision=?,approved_by=?,approved_at=?,pins=? WHERE id=? AND revision=?",
  ).run(
    row.revision,
    actor.userId,
    now,
    JSON.stringify(pins),
    id,
    row.revision,
  );
  touchSuite(db, suite.id, now);
  return caseView(db, suite, caseRow(db, actor.orgId, projectId, id));
}

/** Pinned element revisions of an approved case, for a run snapshot. */
export function pinnedCaseElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  row: CaseRow,
) {
  const revision = db.prepare(
    "SELECT * FROM ai_element_revisions WHERE element_id=? AND revision=? AND org_id=? AND project_id=?",
  );
  return parsePins(row.pins).map((pin) => {
    const snap = revision.get(pin.elementId, pin.revision, orgId, projectId) as
      Record<string, string | number> | undefined;
    if (!snap)
      throw new DomainError(
        "ELEMENT_UNAVAILABLE",
        "Pinli element sürümü bulunamadı; case'i yeniden onaylayın.",
        409,
      );
    return {
      elementId: pin.elementId,
      revision: pin.revision,
      elementKey: snap.element_key as string,
      name: snap.name as string,
      pageUrl: snap.page_url as string,
      locator: JSON.parse(snap.locator as string) as LibraryLocator,
      alternatives: JSON.parse(snap.alternatives as string) as LibraryLocator[],
      approved: snap.approved === 1,
    };
  });
}

/** Cases whose current steps use an element, with their pin state. */
export function elementCaseUsage(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  elementId: string,
) {
  const element = db
    .prepare(
      "SELECT revision FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
    )
    .get(elementId, orgId, projectId) as { revision: number } | undefined;
  if (!element) throw new DomainError("NOT_FOUND", "Element bulunamadı.", 404);
  const rows = db
    .prepare(
      `SELECT c.id,c.title,c.revision,c.approval,c.pins,c.definition,s.id AS suite_id,s.title AS suite_title
       FROM test_case_elements e JOIN test_cases c ON c.id=e.case_id AND c.org_id=e.org_id AND c.status='active'
       JOIN test_suites s ON s.id=c.suite_id AND s.status='active'
       WHERE e.org_id=? AND e.project_id=? AND e.element_id=? ORDER BY s.updated_at DESC,c.position`,
    )
    .all(orgId, projectId, elementId) as {
    id: string;
    title: string;
    revision: number;
    approval: string;
    pins: string;
    definition: string;
    suite_id: string;
    suite_title: string;
  }[];
  return rows.map((row) => {
    const pinned =
      parsePins(row.pins).find((p) => p.elementId === elementId)?.revision ??
      null;
    const steps = (
      JSON.parse(row.definition) as { steps: { elementId?: string }[] }
    ).steps.flatMap((s, i) => (s.elementId === elementId ? [i + 1] : []));
    return {
      caseId: row.id,
      caseTitle: row.title,
      caseRevision: row.revision,
      suiteId: row.suite_id,
      suiteTitle: row.suite_title,
      approval: row.approval,
      steps,
      pinnedRevision: row.approval === "approved" ? pinned : null,
      currentRevision: element.revision,
      stale:
        row.approval === "approved" &&
        pinned !== null &&
        pinned < element.revision,
    };
  });
}

/**
 * Records the outcome of a run on the library (`verification`): only for
 * elements whose pinned revision is still the current one, so a newer edit
 * is never marked by an old locator.
 */
export function recordRunVerification(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  outcomes: { elementId: string; revision: number; found: boolean }[],
  now = new Date().toISOString(),
) {
  const update = db.prepare(
    "UPDATE ai_page_elements SET verification=?,verified_at=? WHERE id=? AND org_id=? AND project_id=? AND revision=?",
  );
  for (const outcome of outcomes)
    update.run(
      outcome.found ? "verified" : "failed",
      now,
      outcome.elementId,
      orgId,
      projectId,
      outcome.revision,
    );
}
