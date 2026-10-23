import { z } from "zod";
import { locatorRoles } from "../../domain/src/locators";

/**
 * Locator kinds the exploration can observe (`ObservedLocator`). The prompt
 * names exactly these; xpath/text/title/altText are never observed and would
 * always be rejected as unobserved.
 */
export const aiLocatorKinds = [
  "testId",
  "id",
  "css",
  "label",
  "placeholder",
  "role",
] as const;
const locatorValue = z.string().min(1).max(1000);
export const aiLocatorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("role"),
      role: z.enum(locatorRoles),
      value: locatorValue,
    })
    .strict(),
  ...(["testId", "id", "css", "label", "placeholder"] as const).map((kind) =>
    z.object({ kind: z.literal(kind), value: locatorValue }).strict(),
  ),
]);
export type AiLocator = z.infer<typeof aiLocatorSchema>;
/** Element library key (ADR 013): `login.username`. */
export const elementRefSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);

// A targeted action names exactly one of: an approved library element
// (`element`) or an observed raw locator (`locator`).
const target = {
  locator: aiLocatorSchema.optional(),
  element: elementRefSchema.optional(),
};
const exactlyOneTarget = (action: { locator?: unknown; element?: unknown }) =>
  (action.locator === undefined) !== (action.element === undefined);
const targetIssue = { message: "exactly_one_of_element_or_locator" };
export const aiActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fill"),
      ...target,
      value: z.string().max(200),
    })
    .strict()
    .refine(exactlyOneTarget, targetIssue),
  z
    .object({ kind: z.literal("click"), ...target })
    .strict()
    .refine(exactlyOneTarget, targetIssue),
  // Chooses an <option> by its value or visible label.
  z
    .object({
      kind: z.literal("select"),
      ...target,
      value: z.string().min(1).max(200),
    })
    .strict()
    .refine(exactlyOneTarget, targetIssue),
  // Same-origin page navigation; needs no element.
  z.object({ kind: z.literal("navigate"), url: z.url().max(1000) }).strict(),
  z
    .object({ kind: z.literal("assertVisible"), ...target })
    .strict()
    .refine(exactlyOneTarget, targetIssue),
  z
    .object({
      kind: z.literal("assertText"),
      ...target,
      expected: z.string().min(1).max(200),
    })
    .strict()
    .refine(exactlyOneTarget, targetIssue),
  z
    .object({
      kind: z.literal("assertUrl"),
      expected: z.url().max(500),
    })
    .strict(),
  // Page-quality checks: run on the current page, no locator needed.
  z
    .object({
      kind: z.literal("assertNoConsoleErrors"),
      ignore: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("assertNoBrokenLinks") }).strict(),
  z
    .object({
      kind: z.literal("assertAccessible"),
      impact: z.enum(["critical", "serious"]).optional(),
    })
    .strict(),
]);
export type AiAction = z.infer<typeof aiActionSchema>;
export type ActionTarget =
  | { element: string; locator?: undefined }
  | { locator: AiLocator; element?: undefined };
/** The element/locator target of fill, click, assertVisible, assertText. */
export function actionTarget(action: AiAction): ActionTarget | undefined {
  if (!("locator" in action) && !("element" in action)) return undefined;
  const a = action as { locator?: AiLocator; element?: string };
  if (a.element !== undefined) return { element: a.element };
  if (a.locator !== undefined) return { locator: a.locator };
  return undefined;
}
/** Library keys referenced by a suite, in first-use order. */
export function suiteElementKeys(suite: Pick<AiSuite, "scenarios">) {
  return [
    ...new Set(
      suite.scenarios.flatMap((s) =>
        s.actions.flatMap((a) => {
          const t = actionTarget(a);
          return t?.element ? [t.element] : [];
        }),
      ),
    ),
  ];
}
/** Bounds a suite so a run fits the worker lease (see suiteLeaseMs). */
export const suiteLimits = {
  scenarios: 10,
  actionsPerScenario: 20,
  actionsPerSuite: 120,
  titleLength: 120,
  scenarioTitleLength: 160,
};
export const aiSuiteSchema = z
  .object({
    title: z.string().trim().min(3).max(suiteLimits.titleLength),
    targetUrl: z.url().max(1000),
    scenarios: z
      .array(
        z
          .object({
            title: z
              .string()
              .trim()
              .min(3)
              .max(suiteLimits.scenarioTitleLength),
            category: z.enum(["positive", "negative", "edge"]),
            // Test case documentation (ADR 017); optional for older suites.
            description: z.string().trim().max(500).optional(),
            preconditions: z
              .array(z.string().trim().min(1).max(200))
              .max(10)
              .optional(),
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
              .optional(),
            expectedResults: z
              .array(z.string().trim().min(1).max(300))
              .max(10)
              .optional(),
            actions: z
              .array(aiActionSchema)
              .min(1)
              .max(suiteLimits.actionsPerScenario),
          })
          .strict(),
      )
      .min(1)
      .max(suiteLimits.scenarios)
      .refine(
        (scenarios) =>
          scenarios.reduce((sum, s) => sum + s.actions.length, 0) <=
          suiteLimits.actionsPerSuite,
        { message: "too_many_actions" },
      ),
  })
  .strict();
export type AiSuite = z.infer<typeof aiSuiteSchema>;

/**
 * Test plan proposed after a survey exploration (ADR 018): what the AI
 * would test, before any case or library element is created.
 */
export const planLimits = { items: 15, selected: suiteLimits.scenarios };
export const aiTestPlanItemSchema = z
  .object({
    title: z.string().trim().min(3).max(suiteLimits.scenarioTitleLength),
    category: z.enum(["positive", "negative", "edge"]),
    area: z.string().trim().min(1).max(60),
    description: z.string().trim().max(500),
    /** Human-readable proposal only; executable actions are generated after approval. */
    preconditions: z
      .array(z.string().trim().min(1).max(250))
      .max(10)
      .default([]),
    steps: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    expectedResults: z
      .array(z.string().trim().min(1).max(300))
      .max(10)
      .default([]),
    pages: z.array(z.string().max(1000)).max(8).default([]),
    testData: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    feasible: z.boolean().default(true),
    note: z.string().trim().max(300).optional(),
  })
  .strict();
export type AiTestPlanItem = z.infer<typeof aiTestPlanItemSchema>;
export const aiTestPlanSchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    items: z.array(aiTestPlanItemSchema).min(1).max(planLimits.items),
  })
  .strict();
export type AiTestPlan = z.infer<typeof aiTestPlanSchema>;
/** Items a person selected (and possibly edited) for generation. */
export const planSelectionSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            /** Index into the original stored plan; title and text are editable. */
            sourceIndex: z
              .number()
              .int()
              .min(0)
              .max(planLimits.items - 1)
              .optional(),
            title: z
              .string()
              .trim()
              .min(3)
              .max(suiteLimits.scenarioTitleLength),
            category: z.enum(["positive", "negative", "edge"]),
            description: z.string().trim().max(500).default(""),
            preconditions: z
              .array(z.string().trim().min(1).max(250))
              .max(10)
              .optional(),
            steps: z
              .array(z.string().trim().min(1).max(300))
              .max(20)
              .optional(),
            expectedResults: z
              .array(z.string().trim().min(1).max(300))
              .max(10)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(planLimits.selected),
    instruction: z.string().trim().max(1000).optional(),
  })
  .strict();
export type PlanSelection = z.infer<typeof planSelectionSchema>;
