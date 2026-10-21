import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  projectSettings,
  recordHealSuggestions,
  recordObservedElements,
  resolveElementPins,
  Store,
  suitePins,
} from "../packages/storage/src/index";
import { createApp } from "../apps/api/src/app";
import { demoProject } from "../packages/domain/src/index";
import { admin } from "./support";

const shopPage = "https://shop.example.test/index.html";
const other = { ...admin, orgId: randomUUID() };

async function apiFixture() {
  const dir = mkdtempSync(join(tmpdir(), "zc-heal-"));
  const store = new Store(join(dir, "test.sqlite"));
  const app = await createApp(store);
  const call = async (
    method: "GET" | "PUT" | "POST",
    url: string,
    payload?: unknown,
    user = admin,
  ) => {
    const id = randomUUID();
    store.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(id, JSON.stringify(user), Date.now() + 60000);
    const response = await app.inject({
      method,
      url,
      headers: {
        host: "127.0.0.1:4000",
        cookie: `zc_session=${id}`,
        origin: "http://127.0.0.1:3000",
        "x-zerocode-client": "local-ui",
      },
      ...(payload ? { payload: payload as object } : {}),
    });
    return { status: response.statusCode, body: response.json() };
  };
  const close = async () => {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { store, call, close, root: `/v1/projects/${demoProject}/ai` };
}
type View = {
  id: string;
  label: string;
  elementKey: string;
  revision: number;
  approved: boolean;
  locator: unknown;
  alternatives: unknown[];
  suggestedAlternatives: unknown[];
  status: string;
  mergedInto: string | null;
};
const loginElement = (
  locator: unknown,
  alternatives: unknown[] = [],
  text = "Login",
) => ({
  tag: "button",
  text,
  role: "button",
  type: "submit",
  locator,
  alternatives,
});

test("self-healing setting, suggestions, 'Birincil yap' and impact", async () => {
  const { store, call, close, root } = await apiFixture();
  try {
    // Default off; org-scoped.
    const settings = `/v1/projects/${demoProject}/settings`;
    assert.deepEqual((await call("GET", settings)).body.selfHealing, false);
    assert.equal(
      (await call("PUT", settings, { selfHealing: true })).body.selfHealing,
      true,
    );
    assert.equal(
      projectSettings(store.db, admin.orgId, demoProject).selfHealing,
      true,
    );
    assert.equal((await call("GET", settings, undefined, other)).status, 404);
    assert.equal(
      projectSettings(store.db, other.orgId, demoProject).selfHealing,
      false,
    );

    store.db
      .prepare("INSERT INTO ai_authorized_origins VALUES (?,?,?,?)")
      .run(
        randomUUID(),
        admin.orgId,
        "https://shop.example.test",
        new Date().toISOString(),
      );
    const page = (alternatives: unknown[]) => ({
      title: "Shop",
      url: shopPage,
      elements: [
        loginElement({ kind: "id", value: "login-button" }, alternatives),
      ],
    });
    recordObservedElements(store.db, admin.orgId, demoProject, [
      page([{ kind: "testId", value: "login-button" }]) as never,
    ]);
    let element = (await call("GET", `${root}/elements`)).body
      .elements[0] as View;
    const approved = await call("PUT", `${root}/elements/${element.id}`, {
      expectedRevision: element.revision,
      elementKey: "login.submit",
      name: "Giriş",
      pageKey: "login",
      locator: element.locator,
      alternatives: element.alternatives,
      approved: true,
    });
    assert.equal(approved.status, 200);
    element = approved.body.element;
    // Re-observation adds a suggestion; it never reaches execution.
    recordObservedElements(store.db, admin.orgId, demoProject, [
      page([{ kind: "role", role: "button", value: "Login" }]) as never,
    ]);
    const detail = (await call("GET", `${root}/elements/${element.id}`)).body
      .element as View;
    assert.equal(detail.suggestedAlternatives.length, 1);

    // Suite + permanent test pinning login.submit.
    const conversationId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_conversations VALUES (?,?,?,?,?)")
      .run(
        conversationId,
        admin.orgId,
        demoProject,
        "c",
        new Date().toISOString(),
      );
    const suite = {
      title: "Giriş",
      targetUrl: shopPage,
      scenarios: [
        {
          title: "Giriş yapar",
          category: "positive",
          actions: [
            { kind: "click", element: "login.submit" },
            { kind: "assertVisible", element: "login.submit" },
          ],
        },
      ],
    };
    const draftId = randomUUID();
    store.db
      .prepare("INSERT INTO ai_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        draftId,
        admin.orgId,
        demoProject,
        conversationId,
        randomUUID(),
        "mock",
        shopPage,
        JSON.stringify({ pages: [page([])], path: [] }),
        JSON.stringify(suite),
        "ready",
        null,
        new Date().toISOString(),
      );
    const saved = await call("POST", `${root}/drafts/${draftId}/save`, suite);
    assert.equal(saved.status, 201);
    const promoted = await call(
      "POST",
      `${root}/suites/${saved.body.id}/promote`,
    );
    assert.equal(promoted.status, 201);
    const testId = promoted.body.test.testId as string;
    const resolved = resolveElementPins(
      store.db,
      admin.orgId,
      demoProject,
      suitePins(store.db, admin.orgId, saved.body.id),
    );
    // Only the pinned revision's approved alternatives, never suggestions.
    assert.deepEqual(
      (resolved["login.submit"] as { alternatives: unknown[] }).alternatives,
      [{ kind: "testId", value: "login-button" }],
    );

    // A run healed two steps with the approved alternative.
    const healed = {
      locator: { kind: "testId", value: "login-button" },
      primary: { kind: "id", value: "login-button" },
    };
    const result = {
      results: [
        {
          steps: [
            {
              kind: "click",
              status: "passed",
              element: "login.submit",
              elementRevision: element.revision,
              healed,
            },
            {
              kind: "assertVisible",
              status: "passed",
              element: "login.submit",
              elementRevision: element.revision,
              healed,
            },
            // A healed step that then failed is no evidence.
            {
              kind: "click",
              status: "failed",
              element: "login.submit",
              elementRevision: element.revision,
              healed: {
                ...healed,
                locator: { kind: "css", value: ".other" },
              },
            },
          ],
        },
      ],
    };
    const runId = randomUUID();
    const recorded = store.transaction(() =>
      recordHealSuggestions(
        store.db,
        admin.orgId,
        demoProject,
        "ai_test_run",
        runId,
        result,
        resolved,
      ),
    );
    assert.equal(recorded, 1);
    const list = await call("GET", `${root}/heal-suggestions`);
    assert.equal(list.body.suggestions.length, 1);
    const suggestion = list.body.suggestions[0];
    assert.equal(suggestion.elementKey, "login.submit");
    assert.equal(suggestion.revision, element.revision);
    assert.equal(suggestion.runId, runId);
    assert.equal(suggestion.steps, 2);
    assert.deepEqual(suggestion.locator, healed.locator);
    assert.equal(
      (await call("GET", `${root}/heal-suggestions`, undefined, other)).status,
      404,
    );
    const promote = (body: unknown, user = admin) =>
      call(
        "POST",
        `${root}/heal-suggestions/${suggestion.id}/promote`,
        body,
        user,
      );
    assert.equal(
      (await promote({ expectedRevision: element.revision }, other)).status,
      404,
    );
    const stale = await promote({ expectedRevision: element.revision - 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "REVISION_CONFLICT");

    // "Birincil yap": new revision, approval kept, old primary → alternative.
    const done = await promote({ expectedRevision: element.revision });
    assert.equal(done.status, 200);
    assert.equal(done.body.element.revision, element.revision + 1);
    assert.equal(done.body.element.approved, true);
    assert.deepEqual(done.body.element.locator, healed.locator);
    assert.deepEqual(done.body.element.alternatives, [healed.primary]);
    assert.equal(done.body.history[0].action, "heal_promoted");
    assert.equal(
      (await call("GET", `${root}/heal-suggestions`)).body.suggestions.length,
      0,
    );
    assert.equal(
      (await call("GET", `${root}/heal-suggestions?status=promoted`)).body
        .suggestions.length,
      1,
    );
    const again = await promote({ expectedRevision: element.revision + 1 });
    assert.equal(again.body.code, "SUGGESTION_RESOLVED");
    // Feeds the ADR 015 impact flow: the test pins the older revision.
    const impact = await call("GET", `${root}/elements/${element.id}/impact`);
    assert.equal(impact.body.tests.length, 1);
    assert.equal(impact.body.tests[0].testId, testId);
    assert.deepEqual(impact.body.tests[0].diff.primary, {
      from: healed.primary,
      to: healed.locator,
    });
    const version = await call("POST", `${root}/tests/${testId}/versions`, {
      expectedRevision: 1,
    });
    assert.equal(version.status, 201);

    // "Yoksay" resolves without touching the element.
    const ignoredRun = randomUUID();
    store.transaction(() =>
      recordHealSuggestions(
        store.db,
        admin.orgId,
        demoProject,
        "ai_suite",
        ignoredRun,
        {
          results: [
            {
              steps: [
                {
                  status: "passed",
                  element: "login.submit",
                  elementRevision: element.revision + 1,
                  healed: { locator: healed.primary, primary: healed.locator },
                },
              ],
            },
          ],
        },
        resolved,
      ),
    );
    const pending = (await call("GET", `${root}/heal-suggestions`)).body
      .suggestions[0];
    const ignored = await call(
      "POST",
      `${root}/heal-suggestions/${pending.id}/ignore`,
    );
    assert.equal(ignored.status, 200);
    assert.equal(ignored.body.resolved, 1);
    const after = (await call("GET", `${root}/elements/${element.id}`)).body
      .element as View;
    assert.equal(after.revision, element.revision + 1);
  } finally {
    await close();
  }
});

test("'Birleştir' retires an unapproved duplicate into a target", async () => {
  const { store, call, close, root } = await apiFixture();
  try {
    // Legacy duplicate: a second row whose primary is the target's locator.
    recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [
          loginElement({ kind: "css", value: "#submit" }, [
            { kind: "role", role: "button", value: "Login" },
          ]),
          loginElement(
            { kind: "id", value: "login-button" },
            [{ kind: "testId", value: "legacy" }],
            "",
          ),
          loginElement({ kind: "id", value: "other" }, [], "Other"),
        ],
      } as never,
    ]);
    const list = async () =>
      (await call("GET", `${root}/elements`)).body.elements as View[];
    const views = await list();
    assert.equal(views.length, 3);
    let target = views.find((e) => e.label === "Login")!;
    const duplicate = views.find((e) => e.label === "")!;
    const spare = views.find((e) => e.label === "Other")!;
    const put = (element: View, body: Record<string, unknown> = {}) =>
      call("PUT", `${root}/elements/${element.id}`, {
        expectedRevision: element.revision,
        elementKey: element.elementKey,
        name: "Giriş",
        pageKey: "login",
        locator: element.locator,
        alternatives: element.alternatives,
        approved: true,
        ...body,
      });
    target = (await put(target)).body.element;
    assert.equal(target.approved, true);
    // The blocker: the duplicate owns id:login-button.
    const blocked = await put(target, {
      locator: { kind: "id", value: "login-button" },
      alternatives: [],
    });
    assert.equal(blocked.body.code, "LOCATOR_IN_USE");

    const merge = (source: View, into: View, user = admin) =>
      call(
        "POST",
        `${root}/elements/${source.id}/merge`,
        {
          expectedRevision: source.revision,
          targetId: into.id,
          targetRevision: into.revision,
        },
        user,
      );
    assert.equal((await merge(duplicate, target, other)).status, 404);
    // An approved source cannot be merged.
    const approvedSource = await merge(target, spare);
    assert.equal(approvedSource.body.code, "ELEMENT_APPROVED");
    const stale = await merge(duplicate, { ...target, revision: 1 });
    assert.equal(stale.body.code, "REVISION_CONFLICT");

    const merged = await merge(duplicate, target);
    assert.equal(merged.status, 200);
    assert.equal(merged.body.asSuggestions, true);
    assert.equal(merged.body.element.revision, target.revision + 1);
    assert.equal(merged.body.element.approved, true);
    // Approved target: locators become suggestions, alternatives unchanged.
    assert.deepEqual(merged.body.element.alternatives, target.alternatives);
    assert.deepEqual(merged.body.element.suggestedAlternatives, [
      { kind: "id", value: "login-button" },
      { kind: "testId", value: "legacy" },
    ]);
    assert.equal(merged.body.history[0].action, "merged");

    // The duplicate is retired, not deleted; its history keeps the locators.
    const retired = await call("GET", `${root}/elements/${duplicate.id}`);
    assert.equal(retired.status, 200);
    assert.equal(retired.body.element.status, "merged");
    assert.equal(retired.body.element.mergedInto, target.id);
    assert.equal(retired.body.history[0].action, "merged_into");
    assert.deepEqual(retired.body.history[0].locator, {
      kind: "id",
      value: "login-button",
    });
    assert.equal((await list()).length, 2);
    assert.equal(
      (await merge(retired.body.element, merged.body.element)).body.code,
      "ELEMENT_MERGED",
    );
    const editRetired = await put(retired.body.element, {
      locator: { kind: "id", value: "login-button" },
      alternatives: [],
    });
    assert.equal(editRetired.body.code, "ELEMENT_MERGED");
    // Re-observing the duplicate's locators links to the target.
    const stats = recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [loginElement({ kind: "id", value: "login-button" })],
      } as never,
    ]);
    assert.deepEqual(stats, { created: 0, matched: 1 });

    // Blocker gone: accept the suggestion, then make it primary.
    target = merged.body.element;
    const accepted = await call(
      "POST",
      `${root}/elements/${target.id}/suggestions/accept`,
      {
        expectedRevision: target.revision,
        locator: { kind: "id", value: "login-button" },
      },
    );
    assert.equal(accepted.status, 200);
    target = accepted.body.element;
    const primary = await put(target, {
      locator: { kind: "id", value: "login-button" },
      alternatives: [
        { kind: "css", value: "#submit" },
        { kind: "role", role: "button", value: "Login" },
      ],
    });
    assert.equal(primary.status, 200);
    assert.deepEqual(primary.body.element.locator, {
      kind: "id",
      value: "login-button",
    });

    // Unapproved target: the locators become alternatives.
    recordObservedElements(store.db, admin.orgId, demoProject, [
      {
        url: shopPage,
        elements: [loginElement({ kind: "id", value: "copy" }, [], "Copy")],
      } as never,
    ]);
    const copy = (await list()).find((e) => e.label === "Copy")!;
    const spareView = (await list()).find((e) => e.label === "Other")!;
    const intoUnapproved = await merge(copy, spareView);
    assert.equal(intoUnapproved.status, 200);
    assert.equal(intoUnapproved.body.asSuggestions, false);
    assert.deepEqual(intoUnapproved.body.element.alternatives, [
      { kind: "id", value: "copy" },
    ]);
  } finally {
    await close();
  }
});
