import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, type Actor } from "../../domain/src/index";
import { locatorRoles } from "../../domain/src/locators";

/**
 * Site element library (ADR 013): elements observed by AI exploration on
 * authorized origins, named and approved by people. Separate from the
 * Demo Bank canonical model.
 */
const value = z.string().min(1).max(1000);
export const libraryLocatorSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("role"), role: z.enum(locatorRoles), value })
    .strict(),
  ...(["testId", "id", "css", "label", "placeholder"] as const).map((kind) =>
    z.object({ kind: z.literal(kind), value }).strict(),
  ),
]);
export type LibraryLocator = z.infer<typeof libraryLocatorSchema>;
export const elementKeyPattern = /^[A-Za-z][A-Za-z0-9_.-]*$/;
export const pageKeyPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
export const maxAlternatives = 5;
export const aiElementUpdateSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    elementKey: z.string().min(1).max(120).regex(elementKeyPattern),
    name: z.string().trim().min(1).max(120),
    pageKey: z.string().min(1).max(60).regex(pageKeyPattern),
    locator: libraryLocatorSchema,
    alternatives: z.array(libraryLocatorSchema).max(maxAlternatives),
    approved: z.boolean(),
  })
  .strict();
export type AiElementUpdate = z.infer<typeof aiElementUpdateSchema>;

type Loc = { kind: string; value: string; role?: string };
/** Order-independent identity of a locator (same as the assistant's). */
export function libraryLocatorKey(locator: Loc) {
  return JSON.stringify([
    locator.kind,
    locator.kind === "role" ? (locator.role ?? "") : "",
    locator.value,
  ]);
}
export function isFragileLibraryLocator(locator: Loc) {
  return (
    locator.kind === "css" && /:nth-(?:of-type|child)\(/.test(locator.value)
  );
}

/** Lowercase ASCII slug usable inside an element key. */
export function slugPart(text: string, max = 40) {
  const slug = text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/, "");
  return !slug || /^[a-z]/.test(slug) ? slug : `e_${slug}`;
}
/** `inventory.html` → `inventory`, `/` → `home`. */
export function suggestPageKey(pageUrl: string) {
  try {
    const segments = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const last = (segments.at(-1) ?? "").replace(
      /\.(?:html?|php|aspx?|jsp)$/i,
      "",
    );
    return slugPart(last, 40) || "home";
  } catch {
    return "page";
  }
}
function originOf(pageUrl: string) {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return "";
  }
}
/**
 * `<page>.<label>` slug, unique per org + project + origin; a taken key gets
 * the first free `_2`, `_3`… suffix.
 */
export function suggestElementKey(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  origin: string,
  pageKey: string,
  label: string,
  tag: string,
) {
  const base = `${pageKey}.${slugPart(label) || slugPart(tag) || "element"}`;
  const taken = new Set(
    (
      db
        .prepare(
          "SELECT element_key AS k FROM ai_page_elements WHERE org_id=? AND project_id=? AND origin=? AND substr(element_key,1,?)=?",
        )
        .all(orgId, projectId, origin, base.length, base) as { k: string }[]
    ).map((row) => row.k),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

const libraryColumns: [string, string][] = [
  ["origin", "TEXT NOT NULL DEFAULT ''"],
  ["element_key", "TEXT"],
  ["name", "TEXT NOT NULL DEFAULT ''"],
  ["page_key", "TEXT NOT NULL DEFAULT ''"],
  ["approved", "INTEGER NOT NULL DEFAULT 0"],
  ["alternatives", "TEXT NOT NULL DEFAULT '[]'"],
  ["revision", "INTEGER NOT NULL DEFAULT 1"],
  ["locator_role", "TEXT NOT NULL DEFAULT ''"],
];
/**
 * Guarded part of migration 009: SQLite has no ADD COLUMN IF NOT EXISTS, so
 * missing columns are detected with table_info and existing rows receive an
 * origin, page key and unique element key. Safe to run on every start.
 */
export function migrateAiElementLibrary(db: DatabaseSync) {
  const missing = () => {
    const have = new Set(
      (
        db.prepare("PRAGMA table_info(ai_page_elements)").all() as {
          name: string;
        }[]
      ).map((row) => row.name),
    );
    return libraryColumns.filter(([name]) => !have.has(name));
  };
  const unkeyed = () =>
    !!db
      .prepare(
        "SELECT 1 FROM ai_page_elements WHERE element_key IS NULL LIMIT 1",
      )
      .get();
  if (!missing().length && !unkeyed()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [name, definition] of missing())
      db.exec(`ALTER TABLE ai_page_elements ADD COLUMN ${name} ${definition}`);
    const rows = db
      .prepare(
        "SELECT id,org_id,project_id,page_url,tag,label,role,locator_kind FROM ai_page_elements WHERE element_key IS NULL ORDER BY first_seen_at,id",
      )
      .all() as Record<string, string>[];
    const update = db.prepare(
      "UPDATE ai_page_elements SET origin=?,page_key=?,element_key=?,name=?,locator_role=? WHERE id=?",
    );
    for (const row of rows) {
      const origin = originOf(row.page_url!);
      const pageKey = suggestPageKey(row.page_url!);
      update.run(
        origin,
        pageKey,
        suggestElementKey(
          db,
          row.org_id!,
          row.project_id!,
          origin,
          pageKey,
          row.label!,
          row.tag!,
        ),
        row.label!.trim().slice(0, 120),
        row.locator_kind === "role" ? row.role! : "",
        row.id!,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type ElementRow = {
  id: string;
  org_id: string;
  project_id: string;
  page_url: string;
  origin: string;
  tag: string;
  label: string;
  role: string;
  input_type: string;
  locator_kind: string;
  locator_value: string;
  locator_role: string;
  element_key: string;
  name: string;
  page_key: string;
  approved: number;
  alternatives: string;
  revision: number;
  first_seen_at: string;
  last_seen_at: string;
  suggested_alternatives?: string;
  /** Migration 012: `merged` rows are retired duplicates (never deleted). */
  status?: string;
  merged_into?: string | null;
};
export function primaryOf(row: ElementRow): LibraryLocator {
  return (
    row.locator_kind === "role"
      ? {
          kind: "role",
          role: row.locator_role || row.role,
          value: row.locator_value,
        }
      : { kind: row.locator_kind, value: row.locator_value }
  ) as LibraryLocator;
}
function parseLocators(raw: string | undefined): LibraryLocator[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as LibraryLocator[]) : [];
  } catch {
    return [];
  }
}
export function alternativesOf(row: ElementRow): LibraryLocator[] {
  return parseLocators(row.alternatives);
}
/** Candidates seen on an approved element; never used for execution. */
export function suggestionsOf(row: ElementRow): LibraryLocator[] {
  return parseLocators(row.suggested_alternatives);
}
export function aiElementView(row: ElementRow) {
  const locator = primaryOf(row);
  return {
    id: row.id,
    elementKey: row.element_key,
    name: row.name,
    pageKey: row.page_key,
    origin: row.origin,
    pageUrl: row.page_url,
    tag: row.tag,
    label: row.label,
    role: row.role,
    inputType: row.input_type,
    locatorKind: row.locator_kind,
    locatorValue: row.locator_value,
    locatorRole: locator.kind === "role" ? locator.role : "",
    locator,
    alternatives: alternativesOf(row),
    suggestedAlternatives: suggestionsOf(row),
    approved: row.approved === 1,
    revision: row.revision,
    fragile: isFragileLibraryLocator(locator),
    status: row.status ?? "active",
    mergedInto: row.merged_into ?? null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}
export type AiElementView = ReturnType<typeof aiElementView>;

export type ObservedForLibrary = {
  url: string;
  elements: {
    tag: string;
    text: string;
    role: string;
    type: string;
    locator: Loc;
    alternatives?: Loc[];
  }[];
};
/**
 * Saves exploration observations. An observed node is the same element when
 * any of its candidate locators equals a stored primary or alternative on
 * the same page; it keeps its id, gets last_seen and new candidates as
 * alternatives (≤5). Approved elements keep primary, alternatives, approval
 * and metadata; their new candidates go to `suggested_alternatives`.
 */
export function recordObservedElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  pages: ObservedForLibrary[],
  now = new Date().toISOString(),
) {
  const stats = { created: 0, matched: 0 };
  const load = db.prepare(
    "SELECT * FROM ai_page_elements WHERE org_id=? AND project_id=? AND page_url=? AND merged_into IS NULL ORDER BY first_seen_at,id",
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ai_page_elements (id,org_id,project_id,page_url,tag,label,role,input_type,locator_kind,locator_value,first_seen_at,last_seen_at,origin,element_key,name,page_key,approved,alternatives,revision,locator_role)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,1,?)`,
  );
  // Approved elements never change silently: new candidates become
  // suggestions a person can accept as an alternative (new revision).
  const touchApproved = db.prepare(
    "UPDATE ai_page_elements SET last_seen_at=?,suggested_alternatives=? WHERE id=?",
  );
  const touch = db.prepare(
    "UPDATE ai_page_elements SET tag=?,label=?,role=?,input_type=?,last_seen_at=?,alternatives=? WHERE id=?",
  );
  const touchConflict = db.prepare(
    "UPDATE ai_page_elements SET last_seen_at=? WHERE org_id=? AND project_id=? AND page_url=? AND locator_kind=? AND locator_value=?",
  );
  for (const page of pages) {
    let url: URL;
    try {
      url = new URL(page.url);
    } catch {
      continue;
    }
    url.search = "";
    url.hash = "";
    const pageUrl = url.href,
      origin = url.origin,
      pageKey = suggestPageKey(pageUrl);
    const rows = (
      load.all(orgId, projectId, pageUrl) as unknown as ElementRow[]
    ).map((row) => ({
      row,
      primary: libraryLocatorKey(primaryOf(row)),
      alternatives: alternativesOf(row),
      suggestions: suggestionsOf(row),
    }));
    for (const element of page.elements) {
      const seen = new Set<string>();
      const candidates = [element.locator, ...(element.alternatives ?? [])]
        .filter((locator) => locator.value.length > 0)
        .filter((locator) => {
          const key = libraryLocatorKey(locator);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 1 + maxAlternatives);
      if (!candidates.length) continue;
      const keys = candidates.map(libraryLocatorKey);
      // Suggestions count too: a merged duplicate's locators live there.
      const matches = rows.filter((entry) =>
        [
          entry.primary,
          ...entry.alternatives.map(libraryLocatorKey),
          ...entry.suggestions.map(libraryLocatorKey),
        ].some((key) => keys.includes(key)),
      );
      // Prefer an approved element, then the one whose primary is the best candidate.
      const match = matches.sort(
        (a, b) =>
          b.row.approved - a.row.approved ||
          Number(b.primary === keys[0]) - Number(a.primary === keys[0]),
      )[0];
      if (match) {
        const known = new Set([
          match.primary,
          ...match.alternatives.map(libraryLocatorKey),
          ...match.suggestions.map(libraryLocatorKey),
        ]);
        const added = candidates.filter(
          (locator) => !known.has(libraryLocatorKey(locator)),
        ) as LibraryLocator[];
        if (match.row.approved) {
          match.suggestions = [...match.suggestions, ...added].slice(
            0,
            maxAlternatives,
          );
          touchApproved.run(
            now,
            JSON.stringify(match.suggestions),
            match.row.id,
          );
          stats.matched++;
          continue;
        }
        const alternatives = [...match.alternatives, ...added].slice(
          0,
          maxAlternatives,
        );
        match.alternatives = alternatives;
        touch.run(
          element.tag,
          element.text,
          element.role,
          element.type,
          now,
          JSON.stringify(alternatives),
          match.row.id,
        );
        stats.matched++;
        continue;
      }
      const [primary, ...alternatives] = candidates as LibraryLocator[];
      const id = randomUUID();
      const elementKey = suggestElementKey(
        db,
        orgId,
        projectId,
        origin,
        pageKey,
        element.text,
        element.tag,
      );
      const locatorRole = primary!.kind === "role" ? primary!.role : "";
      const inserted = insert.run(
        id,
        orgId,
        projectId,
        pageUrl,
        element.tag,
        element.text,
        element.role,
        element.type,
        primary!.kind,
        primary!.value,
        now,
        now,
        origin,
        elementKey,
        element.text.trim().slice(0, 120),
        pageKey,
        JSON.stringify(alternatives),
        locatorRole,
      );
      if (!inserted.changes) {
        touchConflict.run(
          now,
          orgId,
          projectId,
          pageUrl,
          primary!.kind,
          primary!.value,
        );
        stats.matched++;
        continue;
      }
      stats.created++;
      rows.push({
        row: { id, approved: 0 } as ElementRow,
        primary: keys[0]!,
        alternatives,
        suggestions: [],
      });
    }
  }
  return stats;
}

export function aiElement(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  const row = db
    .prepare(
      "SELECT * FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
    )
    .get(id, orgId, projectId) as ElementRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Element bulunamadı.", 404);
  return row;
}
/** A library element that was not retired by a merge (migration 012). */
export function activeElement(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  const row = aiElement(db, orgId, projectId, id);
  if (row.merged_into)
    throw new DomainError(
      "ELEMENT_MERGED",
      "Bu element başka bir elemente birleştirildi; birleştirilen elementi düzenleyin.",
      409,
    );
  return row;
}
export function aiElementHistory(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  id: string,
) {
  return (
    db
      .prepare(
        "SELECT * FROM ai_element_revisions WHERE element_id=? AND org_id=? AND project_id=? ORDER BY revision DESC",
      )
      .all(id, orgId, projectId) as Record<string, unknown>[]
  ).map((row) => ({
    revision: row.revision as number,
    action: row.action as string,
    actorId: row.actor_id as string,
    createdAt: row.created_at as string,
    elementKey: row.element_key as string,
    name: row.name as string,
    pageKey: row.page_key as string,
    approved: row.approved === 1,
    locator: JSON.parse(row.locator as string) as LibraryLocator,
    alternatives: JSON.parse(row.alternatives as string) as LibraryLocator[],
  }));
}
export function snapshot(
  db: DatabaseSync,
  row: ElementRow,
  action: string,
  actorId: string,
  now: string,
) {
  db.prepare(
    "INSERT OR IGNORE INTO ai_element_revisions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    row.id,
    row.revision,
    row.org_id,
    row.project_id,
    row.origin,
    row.page_url,
    row.element_key,
    row.name,
    row.page_key,
    row.approved,
    JSON.stringify(primaryOf(row)),
    JSON.stringify(alternativesOf(row)),
    action,
    actorId,
    now,
  );
}
/**
 * Human edit of a library element (caller wraps it in a transaction).
 * Stale expectedRevision → 409; any locator change clears approval; the key
 * of an approved element is locked; every change appends a history row.
 */
export function updateAiElement(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  input: AiElementUpdate,
) {
  const row = activeElement(db, actor.orgId, projectId, id);
  if (row.revision !== input.expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Element değişti. Güncel sürümü açıp değişikliği tekrar uygula.",
      409,
    );
  const keys = [input.locator, ...input.alternatives].map(libraryLocatorKey);
  if (new Set(keys).size !== keys.length)
    throw new DomainError(
      "DUPLICATE_LOCATOR",
      "Aynı locator bir kez tanımlanabilir.",
    );
  const before = [primaryOf(row), ...alternativesOf(row)].map(
    libraryLocatorKey,
  );
  const locatorsChanged = JSON.stringify(before) !== JSON.stringify(keys);
  const keyChanged = input.elementKey !== row.element_key;
  if (keyChanged && row.approved)
    throw new DomainError(
      "ELEMENT_KEY_LOCKED",
      "Onaylı elementin anahtarı değiştirilemez; önce onayı kaldırın.",
      409,
    );
  if (
    keyChanged &&
    db
      .prepare(
        "SELECT id FROM ai_page_elements WHERE org_id=? AND project_id=? AND origin=? AND element_key=? AND id<>?",
      )
      .get(actor.orgId, projectId, row.origin, input.elementKey, id)
  )
    throw new DomainError(
      "ELEMENT_KEY_EXISTS",
      "Bu element anahtarı bu sitede zaten kullanılıyor.",
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
        row.page_url,
        input.locator.kind,
        input.locator.value,
        id,
      )
  )
    throw new DomainError(
      "LOCATOR_IN_USE",
      "Bu birincil locator aynı sayfada başka bir elemente ait.",
      409,
    );
  const approved = locatorsChanged ? false : input.approved;
  const approvalCleared =
    locatorsChanged && (row.approved === 1 || input.approved);
  if (
    !locatorsChanged &&
    !keyChanged &&
    input.name === row.name &&
    input.pageKey === row.page_key &&
    approved === (row.approved === 1)
  )
    return { element: aiElementView(row), changed: false, approvalCleared };
  const now = new Date().toISOString();
  // The observed starting state becomes revision 1 of the history.
  snapshot(db, row, "observed", "system", now);
  const next: ElementRow = {
    ...row,
    element_key: input.elementKey,
    name: input.name,
    page_key: input.pageKey,
    approved: approved ? 1 : 0,
    locator_kind: input.locator.kind,
    locator_value: input.locator.value,
    locator_role: input.locator.kind === "role" ? input.locator.role : "",
    alternatives: JSON.stringify(input.alternatives),
    // A suggestion that became primary/alternative is no longer pending.
    suggested_alternatives: JSON.stringify(
      suggestionsOf(row).filter(
        (locator) => !keys.includes(libraryLocatorKey(locator)),
      ),
    ),
    revision: row.revision + 1,
  };
  db.prepare(
    "UPDATE ai_page_elements SET element_key=?,name=?,page_key=?,approved=?,locator_kind=?,locator_value=?,locator_role=?,alternatives=?,suggested_alternatives=?,revision=? WHERE id=? AND revision=?",
  ).run(
    next.element_key,
    next.name,
    next.page_key,
    next.approved,
    next.locator_kind,
    next.locator_value,
    next.locator_role,
    next.alternatives,
    next.suggested_alternatives!,
    next.revision,
    id,
    row.revision,
  );
  const action = locatorsChanged
    ? "locator_changed"
    : approved !== (row.approved === 1)
      ? approved
        ? "approved"
        : "unapproved"
      : "updated";
  snapshot(db, next, action, actor.userId, now);
  return { element: aiElementView(next), changed: true, approvalCleared };
}

export const acceptSuggestionSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    locator: libraryLocatorSchema,
  })
  .strict();
/**
 * Moves a suggested candidate into the alternatives (caller wraps it in a
 * transaction). The primary locator is unchanged, so approval is kept; the
 * change is a new revision with its own history row.
 */
export function acceptSuggestedAlternative(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  id: string,
  input: z.infer<typeof acceptSuggestionSchema>,
) {
  const row = activeElement(db, actor.orgId, projectId, id);
  if (row.revision !== input.expectedRevision)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Element değişti. Güncel sürümü açıp değişikliği tekrar uygula.",
      409,
    );
  const key = libraryLocatorKey(input.locator);
  const suggestions = suggestionsOf(row);
  const suggestion = suggestions.find((l) => libraryLocatorKey(l) === key);
  if (!suggestion)
    throw new DomainError(
      "SUGGESTION_NOT_FOUND",
      "Bu locator önerilen alternatifler arasında yok.",
      404,
    );
  const alternatives = alternativesOf(row);
  if (alternatives.length >= maxAlternatives)
    throw new DomainError(
      "TOO_MANY_ALTERNATIVES",
      `En fazla ${maxAlternatives} alternatif tanımlanabilir.`,
      409,
    );
  const now = new Date().toISOString();
  snapshot(db, row, "observed", "system", now);
  const next: ElementRow = {
    ...row,
    alternatives: JSON.stringify([...alternatives, suggestion]),
    suggested_alternatives: JSON.stringify(
      suggestions.filter((l) => libraryLocatorKey(l) !== key),
    ),
    revision: row.revision + 1,
  };
  db.prepare(
    "UPDATE ai_page_elements SET alternatives=?,suggested_alternatives=?,revision=? WHERE id=? AND revision=?",
  ).run(
    next.alternatives,
    next.suggested_alternatives!,
    next.revision,
    id,
    row.revision,
  );
  snapshot(db, next, "alternative_added", actor.userId, now);
  return { element: aiElementView(next) };
}

/**
 * Guarded step after migration 009: adds `suggested_alternatives` and moves
 * alternatives that observation appended to an approved element after its
 * last revision (pre-fix behaviour) into the suggestions.
 */
export function migrateSuggestedAlternatives(db: DatabaseSync) {
  const have = (
    db.prepare("PRAGMA table_info(ai_page_elements)").all() as {
      name: string;
    }[]
  ).some((row) => row.name === "suggested_alternatives");
  if (have) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "ALTER TABLE ai_page_elements ADD COLUMN suggested_alternatives TEXT NOT NULL DEFAULT '[]'",
    );
    const rows = db
      .prepare(
        `SELECT e.id,e.alternatives,r.alternatives AS pinned FROM ai_page_elements e
         JOIN ai_element_revisions r ON r.element_id=e.id AND r.revision=e.revision
         WHERE e.approved=1`,
      )
      .all() as { id: string; alternatives: string; pinned: string }[];
    const update = db.prepare(
      "UPDATE ai_page_elements SET alternatives=?,suggested_alternatives=? WHERE id=?",
    );
    for (const row of rows) {
      const pinned = parseLocators(row.pinned);
      const keep = new Set(pinned.map(libraryLocatorKey));
      const extra = parseLocators(row.alternatives).filter(
        (l) => !keep.has(libraryLocatorKey(l)),
      );
      if (extra.length)
        update.run(JSON.stringify(pinned), JSON.stringify(extra), row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Approved elements of one site, as offered to the suite generator. */
export function approvedLibraryElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  origin: string,
) {
  return (
    db
      .prepare(
        "SELECT * FROM ai_page_elements WHERE org_id=? AND project_id=? AND origin=? AND approved=1 ORDER BY page_key,element_key LIMIT 200",
      )
      .all(orgId, projectId, origin) as unknown as ElementRow[]
  ).map(aiElementView);
}

/** A suite/test reference to one immutable element revision. */
export type ElementPin = {
  elementKey: string;
  elementId: string;
  revision: number;
};
export type ElementBinding = ElementPin & {
  name: string;
  pageUrl: string;
  locator: LibraryLocator;
};
/**
 * Pins the current revision of approved elements for a suite approval.
 * Unknown or unapproved keys → ELEMENT_UNAVAILABLE.
 */
export function pinApprovedElements(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  origin: string,
  keys: string[],
): ElementBinding[] {
  const find = db.prepare(
    "SELECT * FROM ai_page_elements WHERE org_id=? AND project_id=? AND origin=? AND element_key=?",
  );
  return keys.map((elementKey) => {
    const row = find.get(orgId, projectId, origin, elementKey) as
      ElementRow | undefined;
    if (!row || row.approved !== 1)
      throw new DomainError(
        "ELEMENT_UNAVAILABLE",
        `Element onaylı değil ya da yok: ${elementKey}`,
        409,
      );
    // Approval always writes a revision row; this is a safety net.
    snapshot(db, row, "pinned", "system", new Date().toISOString());
    return {
      elementKey,
      elementId: row.id,
      revision: row.revision,
      name: row.name,
      pageUrl: row.page_url,
      locator: primaryOf(row),
    };
  });
}
export function saveSuitePins(
  db: DatabaseSync,
  orgId: string,
  suiteId: string,
  pins: ElementPin[],
) {
  const insert = db.prepare(
    "INSERT INTO ai_suite_elements (suite_id,org_id,element_key,element_id,revision) VALUES (?,?,?,?,?)",
  );
  for (const pin of pins)
    insert.run(suiteId, orgId, pin.elementKey, pin.elementId, pin.revision);
}
export function suitePins(
  db: DatabaseSync,
  orgId: string,
  suiteId: string,
): ElementPin[] {
  return (
    db
      .prepare(
        "SELECT element_key,element_id,revision FROM ai_suite_elements WHERE suite_id=? AND org_id=? ORDER BY rowid",
      )
      .all(suiteId, orgId) as {
      element_key: string;
      element_id: string;
      revision: number;
    }[]
  ).map((row) => ({
    elementKey: row.element_key,
    elementId: row.element_id,
    revision: row.revision,
  }));
}
export type ElementResolution = Record<
  string,
  | (ElementBinding & {
      /** Approved alternatives of the pinned revision (self-healing, ADR 016). */
      alternatives: LibraryLocator[];
    })
  | { unavailable: string }
>;
/**
 * Resolves pins to the locator of their immutable revision. An element that
 * was removed or is no longer approved resolves to `unavailable`; the
 * executor fails that step with ELEMENT_UNAVAILABLE (never PASS).
 */
export function resolveElementPins(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  pins: ElementPin[],
): ElementResolution {
  const current = db.prepare(
    "SELECT approved FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
  );
  const pinned = db.prepare(
    "SELECT * FROM ai_element_revisions WHERE element_id=? AND revision=? AND org_id=? AND project_id=?",
  );
  const result: ElementResolution = {};
  for (const pin of pins) {
    const row = current.get(pin.elementId, orgId, projectId) as
      { approved: number } | undefined;
    const revision = pinned.get(
      pin.elementId,
      pin.revision,
      orgId,
      projectId,
    ) as Record<string, string | number> | undefined;
    if (!row) result[pin.elementKey] = { unavailable: "removed" };
    else if (row.approved !== 1)
      result[pin.elementKey] = { unavailable: "unapproved" };
    else if (!revision)
      result[pin.elementKey] = { unavailable: "revision_missing" };
    else
      result[pin.elementKey] = {
        ...pin,
        name: revision.name as string,
        pageUrl: revision.page_url as string,
        locator: JSON.parse(revision.locator as string) as LibraryLocator,
        // Only the revision's alternatives: suggestions are never stored here.
        alternatives: parseLocators(revision.alternatives as string),
      };
  }
  return result;
}

/** One immutable element revision (pinned snapshot), scoped to org + project. */
export function aiElementRevision(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  elementId: string,
  revision: number,
) {
  const row = db
    .prepare(
      "SELECT * FROM ai_element_revisions WHERE element_id=? AND revision=? AND org_id=? AND project_id=?",
    )
    .get(elementId, revision, orgId, projectId) as
    Record<string, string | number> | undefined;
  return row
    ? {
        elementKey: row.element_key as string,
        name: row.name as string,
        approved: row.approved === 1,
        locator: JSON.parse(row.locator as string) as LibraryLocator,
        alternatives: JSON.parse(
          row.alternatives as string,
        ) as LibraryLocator[],
      }
    : undefined;
}
/**
 * Re-pins references to the current revision of their element (ADR 015).
 * Removed or unapproved elements are reported, never silently skipped.
 * The pin's own key is kept: it is what the test's scenarios refer to.
 */
export function currentElementBindings(
  db: DatabaseSync,
  orgId: string,
  projectId: string,
  pins: ElementPin[],
) {
  const find = db.prepare(
    "SELECT * FROM ai_page_elements WHERE id=? AND org_id=? AND project_id=?",
  );
  const bindings: ElementBinding[] = [];
  const unavailable: {
    elementKey: string;
    reason: "removed" | "unapproved";
  }[] = [];
  for (const pin of pins) {
    const row = find.get(pin.elementId, orgId, projectId) as
      ElementRow | undefined;
    if (!row)
      unavailable.push({ elementKey: pin.elementKey, reason: "removed" });
    else if (row.approved !== 1)
      unavailable.push({ elementKey: pin.elementKey, reason: "unapproved" });
    else {
      // Approval always writes a revision row; this is a safety net.
      snapshot(db, row, "pinned", "system", new Date().toISOString());
      bindings.push({
        elementKey: pin.elementKey,
        elementId: row.id,
        revision: row.revision,
        name: row.name,
        pageUrl: row.page_url,
        locator: primaryOf(row),
      });
    }
  }
  return { bindings, unavailable };
}

/**
 * Guarded part of migration 012: `status` and `merged_into` mark a retired
 * duplicate (SQLite has no ADD COLUMN IF NOT EXISTS). Safe on every start.
 */
export function migrateElementMerge(db: DatabaseSync) {
  const have = new Set(
    (
      db.prepare("PRAGMA table_info(ai_page_elements)").all() as {
        name: string;
      }[]
    ).map((row) => row.name),
  );
  const missing = (
    [
      ["status", "TEXT NOT NULL DEFAULT 'active'"],
      ["merged_into", "TEXT"],
    ] as const
  ).filter(([name]) => !have.has(name));
  if (!missing.length) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    // API and worker may race; the loser sees the columns and skips.
    const now = new Set(
      (
        db.prepare("PRAGMA table_info(ai_page_elements)").all() as {
          name: string;
        }[]
      ).map((row) => row.name),
    );
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

export const mergeElementSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    targetId: z.uuid(),
    targetRevision: z.number().int().min(1),
  })
  .strict();
/**
 * "Birleştir" (ADR 016): an unapproved duplicate is merged into a target on
 * the same page (caller wraps it in a transaction). Its locators become
 * suggested alternatives of an approved target (never used until accepted)
 * or alternatives of an unapproved one; the target gets a new revision. The
 * duplicate is retired, not deleted: `status='merged'`, `merged_into`, a
 * final history row with its original locators, and a placeholder primary so
 * the page-level locator uniqueness no longer blocks the target.
 */
export function mergeAiElements(
  db: DatabaseSync,
  actor: Actor,
  projectId: string,
  sourceId: string,
  input: z.infer<typeof mergeElementSchema>,
) {
  if (sourceId === input.targetId)
    throw new DomainError(
      "MERGE_SAME_ELEMENT",
      "Element kendisiyle birleştirilemez.",
    );
  const source = activeElement(db, actor.orgId, projectId, sourceId);
  const target = activeElement(db, actor.orgId, projectId, input.targetId);
  if (
    source.revision !== input.expectedRevision ||
    target.revision !== input.targetRevision
  )
    throw new DomainError(
      "REVISION_CONFLICT",
      "Element değişti. Güncel sürümü açıp değişikliği tekrar uygula.",
      409,
    );
  if (source.approved === 1)
    throw new DomainError(
      "ELEMENT_APPROVED",
      "Onaylı element birleştirilemez; önce onayını kaldırın.",
      409,
    );
  if (source.page_url !== target.page_url)
    throw new DomainError(
      "PAGE_MISMATCH",
      "Yalnız aynı sayfadaki elementler birleştirilebilir.",
      409,
    );
  const known = new Set(
    [
      primaryOf(target),
      ...alternativesOf(target),
      ...suggestionsOf(target),
    ].map(libraryLocatorKey),
  );
  const incoming = [primaryOf(source), ...alternativesOf(source)].filter(
    (locator) => {
      const key = libraryLocatorKey(locator);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    },
  );
  const approvedTarget = target.approved === 1;
  const existing = approvedTarget
    ? suggestionsOf(target)
    : alternativesOf(target);
  const room = Math.max(0, maxAlternatives - existing.length);
  const added = incoming.slice(0, room);
  const now = new Date().toISOString();
  snapshot(db, target, "observed", "system", now);
  const next: ElementRow = {
    ...target,
    alternatives: approvedTarget
      ? target.alternatives
      : JSON.stringify([...existing, ...added]),
    suggested_alternatives: approvedTarget
      ? JSON.stringify([...existing, ...added])
      : (target.suggested_alternatives ?? "[]"),
    revision: target.revision + 1,
  };
  db.prepare(
    "UPDATE ai_page_elements SET alternatives=?,suggested_alternatives=?,revision=? WHERE id=? AND revision=?",
  ).run(
    next.alternatives,
    next.suggested_alternatives!,
    next.revision,
    target.id,
    target.revision,
  );
  snapshot(db, next, "merged", actor.userId, now);
  // History keeps the duplicate's real locators; the live row is retired.
  snapshot(db, source, "observed", "system", now);
  snapshot(
    db,
    { ...source, revision: source.revision + 1 },
    "merged_into",
    actor.userId,
    now,
  );
  db.prepare(
    "UPDATE ai_page_elements SET status='merged',merged_into=?,locator_kind='merged',locator_value=?,locator_role='',alternatives='[]',suggested_alternatives='[]',revision=? WHERE id=? AND revision=?",
  ).run(target.id, source.id, source.revision + 1, source.id, source.revision);
  return {
    element: aiElementView(next),
    merged: {
      id: source.id,
      elementKey: source.element_key,
      revision: source.revision + 1,
    },
    added,
    skipped: incoming.length - added.length,
    asSuggestions: approvedTarget,
  };
}
