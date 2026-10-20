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
]);
export const aiSuiteSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    targetUrl: z.url().max(1000),
    scenarios: z
      .array(
        z
          .object({
            title: z.string().trim().min(3).max(120),
            category: z.enum(["positive", "negative", "edge"]),
            actions: z.array(aiActionSchema).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type AiSuite = z.infer<typeof aiSuiteSchema>;
