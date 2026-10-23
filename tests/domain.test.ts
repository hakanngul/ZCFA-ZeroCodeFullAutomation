import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  compile,
  assertFixtureUrl,
  DomainError,
  fixtureOrigin,
  testSchema,
} from "../packages/domain/src/index";
import { definition, model } from "./support";
import {
  businessProjection,
  flowProjection,
} from "../packages/domain/src/projections";
import {
  unsafeExplorationClick,
  type ObservedElement,
} from "../packages/assistant/src/agent";
import {
  aiTestPlanSchema,
  planSelectionSchema,
  planLimits,
} from "../packages/assistant/src/spec";

test("all views preserve assertion targets and expected text from the same definition", () => {
  const input = definition();
  input.steps.push({
    id: randomUUID(),
    kind: "assert",
    assertion: "elementText",
    elementRef: "dashboard.balance",
    expected: "9.999,00 TL",
  });
  assert.match(businessProjection(input)[2]!.title, /Bakiye.*9\.999,00 TL/);
  assert.match(flowProjection(input).at(-1)!.title, /9\.999,00 TL/);
  const balance = input.steps[2];
  if (balance?.kind === "assert") balance.elementRef = "dashboard.heading";
  assert.match(businessProjection(input)[2]!.title, /Dashboard.*9\.999,00 TL/);
});
test("compiler is deterministic and expands a pinned flow", () => {
  const input = definition(),
    mapping = model();
  assert.deepEqual(compile(input, mapping), compile(input, mapping));
  assert.deepEqual(
    compile(input, mapping).steps.map((s) => s.kind),
    ["navigate", "fillSecret", "fillSecret", "click", "assertVisible"],
  );
  assert.equal(compile(input, mapping).modelRevision, 1);
});
test("cannot publish without an explicit assertion", () => {
  const input = definition();
  input.steps.pop();
  assert.throws(
    () => compile(input, model()),
    (e: unknown) => e instanceof DomainError && e.code === "ASSERTION_REQUIRED",
  );
});
test("unapproved and missing mappings block compilation", () => {
  const mapping = model();
  mapping.elements[0]!.approved = false;
  assert.throws(() => compile(definition(), mapping), /onaylanmamış/);
  mapping.elements.shift();
  assert.throws(() => compile(definition(), mapping), /onaylanmamış/);
});
test("duplicate mapping IDs and steps cannot be guessed", () => {
  const mapping = model();
  mapping.elements.push(mapping.elements[0]!);
  assert.throws(() => compile(definition(), mapping), /tekil/);
  const input = definition();
  input.steps[1]!.id = input.steps[0]!.id;
  assert.throws(() => compile(input, model()), /tekil/);
});
test("tenant and revision pins must match", () => {
  const input = definition();
  input.orgId = randomUUID();
  assert.throws(() => compile(input, model()), /Başka projeye/);
  input.orgId = model().orgId;
  input.appModelRef.revision = 2;
  assert.throws(() => compile(input, model()), /sürümü/);
  input.appModelRef.revision = 1;
  const first = input.steps[0];
  if (first?.kind === "useBusinessFlow") first.flowRef.revision = 99;
  assert.throws(() => compile(input, model()), /akışı sürümü/);
});
test("runtime schema rejects arbitrary code, unknown actions and relaxed assertions", () => {
  assert.equal(
    testSchema.safeParse({ ...definition(), script: "eval()" }).success,
    false,
  );
  const input = definition();
  assert.equal(
    testSchema.safeParse({
      ...input,
      steps: [{ kind: "eval", code: "process.exit()" }],
    }).success,
    false,
  );
  assert.equal(
    testSchema.safeParse({
      ...input,
      steps: [{ ...input.steps[1], expected: false }],
    }).success,
    false,
  );
});
test("target policy accepts only exact local fixture routes", () => {
  assert.equal(
    assertFixtureUrl(`${fixtureOrigin}/login?variant=healthy`).origin,
    fixtureOrigin,
  );
  for (const url of [
    "http://169.254.169.254/login",
    "http://localhost:4100/login",
    "http://127.0.0.1:4000/login",
    `${fixtureOrigin}/../health`,
    `${fixtureOrigin}/login?url=https://evil.test`,
    "https://example.com/login",
    "file:///etc/passwd",
    "http://user:pass@127.0.0.1:4100/login",
    `${fixtureOrigin}/login?variant=unknown`,
  ])
    assert.throws(() => assertFixtureUrl(url), /hedef|demo|parametre/i);
});

test("test plans carry reviewable steps and expectations without breaking old drafts", () => {
  const item = {
    title: "Başarılı giriş",
    category: "positive" as const,
    area: "Giriş",
    description: "Giriş bilgileri girilir ve ana sayfa görünür.",
    pages: ["https://demo.example/login"],
    testData: ["{{EMAIL}}"],
    feasible: true,
  };
  const old = aiTestPlanSchema.parse({ summary: "Keşif", items: [item] });
  assert.deepEqual(old.items[0]?.steps, []);
  assert.deepEqual(old.items[0]?.expectedResults, []);
  const review = aiTestPlanSchema.parse({
    summary: "Keşif",
    items: [
      {
        ...item,
        preconditions: ["Test hesabı hazır"],
        steps: ["E-posta alanını doldur", "Giriş butonunu tıkla"],
        expectedResults: ["Dashboard görünür"],
      },
    ],
  });
  const selected = planSelectionSchema.parse({
    items: [
      {
        sourceIndex: 0,
        title: item.title,
        category: item.category,
        description: item.description,
        preconditions: review.items[0]!.preconditions,
        steps: review.items[0]!.steps,
        expectedResults: review.items[0]!.expectedResults,
      },
    ],
  });
  assert.deepEqual(selected.items[0]!.steps, review.items[0]!.steps);
  assert.equal(selected.items[0]!.sourceIndex, 0);
  assert.equal(
    aiTestPlanSchema.safeParse({
      summary: "Too many",
      items: Array.from({ length: planLimits.items + 1 }, () => item),
    }).success,
    false,
  );
});

test("exploration never auto-clicks a destructive or final checkout action", () => {
  const control = (text: string): ObservedElement => ({
    tag: "button",
    text,
    role: "button",
    type: "submit",
    locator: { kind: "testId", value: text.toLowerCase().replace(/ /g, "-") },
  });
  for (const text of ["Delete account", "Pay Now", "Siparişi tamamla"]) {
    assert.equal(
      unsafeExplorationClick(control(text), "https://demo.example/"),
      true,
    );
  }
  assert.equal(
    unsafeExplorationClick(
      control("Finish"),
      "https://demo.example/checkout/step-two",
    ),
    true,
  );
  assert.equal(
    unsafeExplorationClick(
      control("Finish"),
      "https://demo.example/checkout-step-two.html",
    ),
    true,
  );
  assert.equal(
    unsafeExplorationClick(
      control("Save"),
      "https://demo.example/account/settings",
    ),
    true,
  );
  assert.equal(
    unsafeExplorationClick(control("Login"), "https://demo.example/login"),
    false,
  );
  assert.equal(
    unsafeExplorationClick(control("Checkout"), "https://demo.example/cart"),
    false,
  );
});
