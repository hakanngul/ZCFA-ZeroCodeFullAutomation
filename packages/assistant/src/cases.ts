import { createHash } from "node:crypto";
import { DomainError } from "../../domain/src/index";
import { aiSuiteSchema, type AiAction, type AiSuite } from "./spec";
import type { ResolvedElements } from "./agent";

/**
 * Run snapshot of one approved test case (ADR 017). The case steps reference
 * library elements by id; the snapshot freezes the case revision and every
 * pinned element revision (locator + approved alternatives) so later edits
 * never change what a past run executed. Plan-local refs (`e1`, `e2` …) link
 * compiled actions to the frozen elements.
 */
type Loc = { kind: string; value: string; role?: string };
export type CaseRunElement = {
  ref: string;
  elementId: string;
  elementKey: string;
  revision: number;
  name: string;
  pageUrl: string;
  locator: Loc;
  alternatives: Loc[];
};
export type CaseRunSnapshot = {
  schemaVersion: "case-run-1.0";
  suiteId: string;
  caseId: string;
  caseRevision: number;
  title: string;
  targetUrl: string;
  definition: {
    description: string;
    preconditions: string[];
    testData: { name: string; value: string }[];
    expectedResults: string[];
    steps: CaseStepInput[];
  };
  scenarios: AiSuite["scenarios"];
  elements: CaseRunElement[];
  checksum: string;
};
export type CaseStepInput = {
  id: string;
  kind: string;
  elementId?: string;
  value?: string;
  expected?: string;
  url?: string;
  ignore?: string[];
  impact?: "critical" | "serious";
};
const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function compileCaseRun(input: {
  suiteId: string;
  caseId: string;
  caseRevision: number;
  title: string;
  category: string;
  targetUrl: string;
  definition: CaseRunSnapshot["definition"];
  pins: Omit<CaseRunElement, "ref">[];
}): CaseRunSnapshot {
  const refs = new Map<string, CaseRunElement>();
  const elements: CaseRunElement[] = [];
  const refOf = (elementId: string) => {
    const known = refs.get(elementId);
    if (known) return known.ref;
    const pin = input.pins.find((p) => p.elementId === elementId);
    if (!pin)
      throw new DomainError(
        "ELEMENT_UNAVAILABLE",
        "Adımın elementi onayda pinlenmemiş; case'i yeniden onaylayın.",
        409,
      );
    const element = { ...pin, ref: `e${elements.length + 1}` };
    refs.set(elementId, element);
    elements.push(element);
    return element.ref;
  };
  const actions = input.definition.steps.map((step): AiAction => {
    const element = step.elementId ? refOf(step.elementId) : undefined;
    switch (step.kind) {
      case "navigate":
        return { kind: "navigate", url: step.url! };
      case "click":
        return { kind: "click", element: element! };
      case "fill":
        return { kind: "fill", element: element!, value: step.value ?? "" };
      case "select":
        return { kind: "select", element: element!, value: step.value! };
      case "assertVisible":
        return { kind: "assertVisible", element: element! };
      case "assertText":
        return {
          kind: "assertText",
          element: element!,
          expected: step.expected!,
        };
      case "assertUrl":
        return { kind: "assertUrl", expected: step.expected! };
      case "assertNoConsoleErrors":
        return {
          kind: "assertNoConsoleErrors",
          ...(step.ignore?.length ? { ignore: step.ignore } : {}),
        };
      case "assertNoBrokenLinks":
        return { kind: "assertNoBrokenLinks" };
      case "assertAccessible":
        return {
          kind: "assertAccessible",
          ...(step.impact ? { impact: step.impact } : {}),
        };
      default:
        throw new DomainError("INVALID_INPUT", "Desteklenmeyen adım.");
    }
  });
  const scenarios = [
    {
      title: input.title.length >= 3 ? input.title : `${input.title} case`,
      category: (["positive", "negative", "edge"].includes(input.category)
        ? input.category
        : "positive") as "positive" | "negative" | "edge",
      actions,
    },
  ];
  // Same validation as AI suites: typed actions only, bounded sizes.
  aiSuiteSchema.parse({
    title: input.title.slice(0, 120).padEnd(3, "."),
    targetUrl: input.targetUrl,
    scenarios,
  });
  const body = {
    schemaVersion: "case-run-1.0" as const,
    suiteId: input.suiteId,
    caseId: input.caseId,
    caseRevision: input.caseRevision,
    title: input.title,
    targetUrl: input.targetUrl,
    definition: input.definition,
    scenarios,
    elements,
  };
  return { ...body, checksum: sha256(body) };
}

/** Re-checks the checksum and returns the executable suite + elements. */
export function verifyCaseRun(snapshot: CaseRunSnapshot): {
  suite: AiSuite;
  elements: ResolvedElements;
} {
  const { checksum, ...body } = snapshot;
  if (sha256(body) !== checksum)
    throw new DomainError(
      "PLAN_CHECKSUM_MISMATCH",
      "Çalıştırma planı bütünlüğü doğrulanamadı.",
    );
  const suite = aiSuiteSchema.parse({
    title: snapshot.title.slice(0, 120).padEnd(3, "."),
    targetUrl: snapshot.targetUrl,
    scenarios: snapshot.scenarios,
  });
  const elements: ResolvedElements = Object.fromEntries(
    snapshot.elements.map((e) => [
      e.ref,
      {
        elementKey: e.elementKey,
        elementId: e.elementId,
        revision: e.revision,
        name: e.name,
        locator: e.locator,
        alternatives: e.alternatives,
      },
    ]),
  );
  return { suite, elements };
}
