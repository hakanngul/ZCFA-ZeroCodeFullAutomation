import { z } from "zod";
import { locatorSchema } from "../../domain/src/locators";

export const aiActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("fill"),
      locator: locatorSchema,
      value: z.string().max(200),
    })
    .strict(),
  z.object({ kind: z.literal("click"), locator: locatorSchema }).strict(),
  z
    .object({ kind: z.literal("assertVisible"), locator: locatorSchema })
    .strict(),
  z
    .object({
      kind: z.literal("assertText"),
      locator: locatorSchema,
      expected: z.string().min(1).max(200),
    })
    .strict(),
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
