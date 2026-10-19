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
