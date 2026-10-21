import { createHash } from "node:crypto";
import { DomainError } from "../../domain/src/index";
import type { LocatorSpec } from "../../domain/src/locators";
import { actionTarget, aiSuiteSchema, type AiSuite } from "./spec";
import { locatorKey, type Inspection } from "./agent";

/**
 * Snapshot of an element frozen into a promoted test version. Library
 * references (ADR 014) also carry key, id and the pinned revision; tests
 * promoted before that have only the observed fields.
 */
export type PromotedElement = {
  pageUrl: string;
  tag: string;
  label: string;
  role: string;
  locator: LocatorSpec;
  elementKey?: string;
  elementId?: string;
  revision?: number;
  name?: string;
};
/** A pinned library element as used by a run plan. */
export type PlanElement = {
  elementKey: string;
  elementId: string;
  revision: number;
  name: string;
  locator: LocatorSpec;
};
/** Pinned binding supplied when promoting (from the suite's pins). */
export type PromotionBinding = PlanElement & { pageUrl: string };
export type PromotedTest = {
  schemaVersion: "ai-test-1.0";
  testId: string;
  revision: number;
  orgId: string;
  projectId: string;
  title: string;
  targetUrl: string;
  targetOrigin: string;
  source: { suiteId: string; draftId: string; conversationId: string };
  elements: PromotedElement[];
  scenarios: AiSuite["scenarios"];
};
export type PromotedPlan = {
  schemaVersion: "ai-plan-1.0";
  testId: string;
  testRevision: number;
  targetUrl: string;
  scenarios: AiSuite["scenarios"];
  /** Only present when the test references library elements. */
  elements?: PlanElement[];
  checksum: string;
};

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function promotedChecksum(test: PromotedTest) {
  return sha256(test);
}

/** Builds an immutable test version from an approved suite and its observation. */
export function buildPromotedTest(input: {
  testId: string;
  revision: number;
  orgId: string;
  projectId: string;
  suite: AiSuite;
  inspection: Pick<Inspection, "pages">;
  source: PromotedTest["source"];
  bindings?: PromotionBinding[];
}): PromotedTest {
  const bindings = new Map(
    (input.bindings ?? []).map((b) => [b.elementKey, b] as const),
  );
  const suite = aiSuiteSchema.parse(input.suite);
  const target = new URL(suite.targetUrl);
  const observed = new Map<string, PromotedElement>();
  for (const page of input.inspection.pages)
    for (const element of page.elements) {
      const key = locatorKey(element.locator);
      if (!observed.has(key))
        observed.set(key, {
          pageUrl: page.url,
          tag: element.tag,
          label: element.text,
          role: element.role,
          locator: element.locator as LocatorSpec,
        });
    }
  const elements = new Map<string, PromotedElement>();
  for (const scenario of suite.scenarios) {
    if (!scenario.actions.some((a) => a.kind.startsWith("assert")))
      throw new DomainError(
        "ASSERTION_REQUIRED",
        "Her senaryoda doğrulama olmalı.",
      );
    for (const action of scenario.actions) {
      if (action.kind === "assertUrl") {
        if (new URL(action.expected).origin !== target.origin)
          throw new DomainError("TARGET_BLOCKED", "URL hedef dışı.");
        continue;
      }
      const ref = actionTarget(action);
      if (!ref) continue;
      if (ref.element) {
        const bound = bindings.get(ref.element);
        if (!bound)
          throw new DomainError(
            "ELEMENT_UNAVAILABLE",
            `Element onaylı değil ya da yok: ${ref.element}`,
            409,
          );
        const seen = observed.get(locatorKey(bound.locator));
        elements.set(`element:${bound.elementKey}`, {
          pageUrl: bound.pageUrl,
          tag: seen?.tag ?? "",
          label: seen?.label ?? bound.name,
          role: seen?.role ?? "",
          locator: bound.locator,
          elementKey: bound.elementKey,
          elementId: bound.elementId,
          revision: bound.revision,
          name: bound.name,
        });
        continue;
      }
      const key = locatorKey(ref.locator!);
      const element = observed.get(key);
      if (!element)
        throw new DomainError(
          "UNOBSERVED_LOCATOR",
          "Locator incelenen sayfalarda yok.",
        );
      elements.set(key, element);
    }
  }
  return {
    schemaVersion: "ai-test-1.0",
    testId: input.testId,
    revision: input.revision,
    orgId: input.orgId,
    projectId: input.projectId,
    title: suite.title,
    targetUrl: suite.targetUrl,
    targetOrigin: target.origin,
    source: input.source,
    elements: [...elements.values()],
    scenarios: structuredClone(suite.scenarios),
  };
}

/** Deterministic run plan; the checksum is re-verified by the worker. */
export function compilePromoted(test: PromotedTest): PromotedPlan {
  const plan = {
    schemaVersion: "ai-plan-1.0" as const,
    testId: test.testId,
    testRevision: test.revision,
    targetUrl: test.targetUrl,
    scenarios: test.scenarios,
  };
  const pinned: PlanElement[] = test.elements.flatMap((e) =>
    e.elementKey && e.elementId && e.revision
      ? [
          {
            elementKey: e.elementKey,
            elementId: e.elementId,
            revision: e.revision,
            name: e.name ?? e.label,
            locator: e.locator,
          },
        ]
      : [],
  );
  // Plans without library references keep the pre-ADR-014 shape.
  const body = pinned.length ? { ...plan, elements: pinned } : plan;
  return { ...body, checksum: sha256(body) };
}

export function verifyPlan(plan: PromotedPlan): AiSuite {
  const { checksum, ...body } = plan;
  if (sha256(body) !== checksum)
    throw new DomainError(
      "PLAN_CHECKSUM_MISMATCH",
      "Çalıştırma planı bütünlüğü doğrulanamadı.",
    );
  return aiSuiteSchema.parse({
    title: `${plan.testId}@${plan.testRevision}`.slice(0, 120),
    targetUrl: plan.targetUrl,
    scenarios: plan.scenarios,
  });
}

type SuiteResult = {
  status: string;
  results: {
    status: string;
    steps: { kind: string; status: string }[];
    screenshot?: { sha256: string };
  }[];
};
/** No PASS without every assertion executed and screenshot evidence. */
export function evidencedPass(plan: PromotedPlan, result: SuiteResult) {
  return (
    result.status === "passed" &&
    result.results.length === plan.scenarios.length &&
    plan.scenarios.every((scenario, index) => {
      const outcome = result.results[index];
      return (
        !!outcome &&
        outcome.status === "passed" &&
        !!outcome.screenshot?.sha256 &&
        outcome.steps.length === scenario.actions.length &&
        outcome.steps.every(
          (step, i) =>
            step.status === "passed" && step.kind === scenario.actions[i]?.kind,
        ) &&
        scenario.actions.some((a) => a.kind.startsWith("assert"))
      );
    })
  );
}
