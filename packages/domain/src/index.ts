import { createHash } from "node:crypto";
import { z } from "zod";
import { locatorSchema, type LocatorSpec } from "./locators";
export { locatorSchema, type LocatorSpec } from "./locators";

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fixtureOrigin = "http://127.0.0.1:4100";
export const demoOrg = "10000000-0000-4000-8000-000000000001";
export const demoProject = "20000000-0000-4000-8000-000000000001";
export const demoApplication = "30000000-0000-4000-8000-000000000001";
export const demoUser = "40000000-0000-4000-8000-000000000001";
export type Actor = {
  userId: string;
  orgId: string;
  role: "admin" | "editor" | "viewer";
};

export const elementSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
    label: z.string().trim().min(1).max(120),
    locator: locatorSchema,
    alternatives: z.array(locatorSchema).max(5).optional(),
    dom: z
      .object({
        id: z.string().max(200).optional(),
        name: z.string().max(200).optional(),
        testId: z.string().max(200).optional(),
        role: z.string().max(100).optional(),
        accessibleName: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    approved: z.boolean(),
    page: z.enum(["login", "dashboard"]),
  })
  .strict();
export type Element = z.infer<typeof elementSchema>;
export const modelSchema = z
  .object({
    orgId: z.uuid(),
    projectId: z.uuid(),
    applicationId: z.uuid(),
    revision: z.number().int().positive(),
    elements: z.array(elementSchema).min(1),
    flow: z
      .object({
        id: z.literal("login"),
        revision: z.number().int().positive(),
        name: z.string(),
        targets: z.tuple([z.string(), z.string(), z.string()]),
      })
      .strict(),
  })
  .strict();
export type AppModel = z.infer<typeof modelSchema>;
const assertionSchema = z.discriminatedUnion("assertion", [
  z
    .object({
      id: z.uuid(),
      kind: z.literal("assert"),
      assertion: z.literal("elementVisible"),
      elementRef: z.string(),
      expected: z.literal(true),
    })
    .strict(),
  z
    .object({
      id: z.uuid(),
      kind: z.literal("assert"),
      assertion: z.literal("elementText"),
      elementRef: z.string(),
      expected: z.string().min(1).max(200),
    })
    .strict(),
]);
export const testSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    testId: z.uuid(),
    revision: z.number().int().positive(),
    orgId: z.uuid(),
    projectId: z.uuid(),
    title: z.string().trim().min(3).max(120),
    appModelRef: z
      .object({
        applicationId: z.uuid(),
        revision: z.number().int().positive(),
      })
      .strict(),
    steps: z
      .array(
        z.union([
          z
            .object({
              id: z.uuid(),
              kind: z.literal("useBusinessFlow"),
              flowRef: z
                .object({
                  id: z.literal("login"),
                  revision: z.number().int().positive(),
                })
                .strict(),
            })
            .strict(),
          assertionSchema,
        ]),
      )
      .min(1)
      .max(20),
    executionPolicy: z
      .object({
        onStepError: z.literal("stop"),
        maxDurationMs: z.number().int().min(1000).max(30000),
      })
      .strict(),
  })
  .strict();
export type CanonicalTest = z.infer<typeof testSchema>;
export type PlanStep =
  | { id: string; kind: "navigate"; path: "/login"; label: string }
  | {
      id: string;
      kind: "fillSecret";
      target: LocatorSpec;
      secretRef: "demo.username" | "demo.password";
      label: string;
    }
  | { id: string; kind: "click"; target: LocatorSpec; label: string }
  | {
      id: string;
      kind: "assertVisible";
      target: LocatorSpec;
      expected: true;
      label: string;
    }
  | {
      id: string;
      kind: "assertText";
      target: LocatorSpec;
      expected: string;
      label: string;
    };
export type ExecutionPlan = {
  schemaVersion: "1.0";
  testId: string;
  testRevision: number;
  modelRevision: number;
  maxDurationMs: number;
  steps: PlanStep[];
  checksum: string;
};

export function compile(input: unknown, mapping: unknown): ExecutionPlan {
  const test = testSchema.parse(input),
    model = modelSchema.parse(mapping);
  if (test.orgId !== model.orgId || test.projectId !== model.projectId)
    throw new DomainError(
      "SCOPE_MISMATCH",
      "Başka projeye ait referans kullanılamaz.",
      403,
    );
  if (
    test.appModelRef.applicationId !== model.applicationId ||
    test.appModelRef.revision !== model.revision
  )
    throw new DomainError("REVISION_MISMATCH", "Uygulama sürümü eşleşmiyor.");
  if (new Set(test.steps.map((s) => s.id)).size !== test.steps.length)
    throw new DomainError("DUPLICATE_STEP", "Adım kimlikleri tekil olmalı.");
  if (!test.steps.some((s) => s.kind === "assert"))
    throw new DomainError(
      "ASSERTION_REQUIRED",
      "En az bir açık doğrulama gerekli.",
    );
  if (
    test.steps[0]?.kind !== "useBusinessFlow" ||
    test.steps.filter((s) => s.kind === "useBusinessFlow").length !== 1
  )
    throw new DomainError("FLOW_REQUIRED", "Önce bir giriş akışı seçin.");
  if (new Set(model.elements.map((e) => e.id)).size !== model.elements.length)
    throw new DomainError("AMBIGUOUS_MAPPING", "Öğe kimlikleri tekil olmalı.");
  const resolve = (ref: string) => {
    const item = model.elements.find((e) => e.id === ref);
    if (!item?.approved)
      throw new DomainError("MAPPING_REQUIRED", "Öğe eşlemesi onaylanmamış.");
    return item;
  };
  const steps: PlanStep[] = [];
  for (const step of test.steps) {
    if (step.kind === "useBusinessFlow") {
      if (
        step.flowRef.id !== model.flow.id ||
        step.flowRef.revision !== model.flow.revision
      )
        throw new DomainError(
          "FLOW_REVISION_MISMATCH",
          "İş akışı sürümü eşleşmiyor.",
        );
      const [username, password, submit] = model.flow.targets.map(resolve);
      steps.push(
        {
          id: `${step.id}:open`,
          kind: "navigate",
          path: "/login",
          label: "Giriş sayfasını aç",
        },
        {
          id: `${step.id}:user`,
          kind: "fillSecret",
          target: username!.locator,
          secretRef: "demo.username",
          label: "Demo kullanıcısını gir",
        },
        {
          id: `${step.id}:password`,
          kind: "fillSecret",
          target: password!.locator,
          secretRef: "demo.password",
          label: "Demo parolasını gir",
        },
        {
          id: `${step.id}:submit`,
          kind: "click",
          target: submit!.locator,
          label: "Giriş yap",
        },
      );
    } else {
      const element = resolve(step.elementRef);
      if (element.page !== "dashboard")
        throw new DomainError(
          "INVALID_ASSERTION_TARGET",
          "Bu dilimde dashboard öğesi seçin.",
        );
      steps.push({
        id: step.id,
        kind:
          step.assertion === "elementVisible" ? "assertVisible" : "assertText",
        target: element.locator,
        expected: step.expected,
        label: element.label,
      } as PlanStep);
    }
  }
  const plan = {
    schemaVersion: "1.0" as const,
    testId: test.testId,
    testRevision: test.revision,
    modelRevision: model.revision,
    maxDurationMs: test.executionPolicy.maxDurationMs,
    steps,
  };
  return {
    ...plan,
    checksum: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  };
}

export const variants = ["healthy", "broken", "ambiguous", "slow"] as const;
export type Variant = (typeof variants)[number];
export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "timed_out"
  | "infrastructure_error"
  | "cancelled";
export type StepResult = {
  id: string;
  label: string;
  kind: PlanStep["kind"];
  status: "passed" | "failed" | "blocked";
  expected?: string | boolean;
  observed?: string | boolean;
  code?: string;
  durationMs: number;
};
export type RunOutcome = {
  status: Exclude<RunStatus, "queued" | "running">;
  code?: string;
  steps: StepResult[];
  assertionsExecuted: number;
  screenshot?: { filename: string; sha256: string };
};

export function assertFixtureUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainError("TARGET_BLOCKED", "Geçersiz hedef.");
  }
  if (
    url.origin !== fixtureOrigin ||
    url.username ||
    url.password ||
    !["/login", "/dashboard", "/dashboard-preview"].includes(url.pathname)
  )
    throw new DomainError(
      "TARGET_BLOCKED",
      "Yalnız yerel demo uygulaması destekleniyor.",
    );
  for (const [key, value] of url.searchParams)
    if (key !== "variant" || !variants.includes(value as Variant))
      throw new DomainError("TARGET_BLOCKED", "Hedef parametresi engellendi.");
  return url;
}
