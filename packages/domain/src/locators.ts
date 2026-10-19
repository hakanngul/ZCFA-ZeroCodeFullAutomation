import { z } from "zod";

export const locatorKinds = [
  "role",
  "label",
  "testId",
  "id",
  "css",
  "xpath",
  "text",
  "placeholder",
  "title",
  "altText",
] as const;
export const locatorNames: Record<(typeof locatorKinds)[number], string> = {
  role: "Role",
  label: "Label",
  testId: "Test ID",
  id: "HTML ID",
  css: "CSS",
  xpath: "XPath",
  text: "Text",
  placeholder: "Placeholder",
  title: "Title",
  altText: "Alt text",
};
export const locatorRoles = [
  "button",
  "heading",
  "textbox",
  "link",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "img",
  "dialog",
  "navigation",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
] as const;
const value = z.string().min(1).max(1000);
export const locatorSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("role"), role: z.enum(locatorRoles), value })
    .strict(),
  ...(
    [
      "label",
      "testId",
      "id",
      "css",
      "xpath",
      "text",
      "placeholder",
      "title",
      "altText",
    ] as const
  ).map((kind) => z.object({ kind: z.literal(kind), value }).strict()),
]);
export type LocatorSpec = z.infer<typeof locatorSchema>;
export type LocatorCheckResult = {
  count: number;
  resolution: "unique" | "not_found" | "ambiguous";
  visible: boolean | null;
  durationMs: number;
};
export type LocatorCheck = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  locator: LocatorSpec;
  page: "login" | "dashboard";
  modelRevision: number;
  result: LocatorCheckResult | { code: string } | null;
};
export function locatorDescription(spec: LocatorSpec) {
  const quoted = JSON.stringify(spec.value);
  if (spec.kind === "role")
    return `getByRole(${JSON.stringify(spec.role)}, { name: ${quoted}, exact: true })`;
  const methods = {
    label: "getByLabel",
    testId: "getByTestId",
    text: "getByText",
    placeholder: "getByPlaceholder",
    title: "getByTitle",
    altText: "getByAltText",
  };
  if (spec.kind === "css" || spec.kind === "xpath")
    return `locator(${JSON.stringify(`${spec.kind}=${spec.value}`)})`;
  if (spec.kind === "id") return `HTML id = ${quoted}`;
  return `${methods[spec.kind]}(${quoted}${spec.kind === "testId" ? "" : ", { exact: true }"})`;
}
