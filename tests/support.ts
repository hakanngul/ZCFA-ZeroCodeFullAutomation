import { randomUUID } from "node:crypto";
import {
  demoApplication,
  demoOrg,
  demoProject,
  demoUser,
  type Actor,
  type AppModel,
  type CanonicalTest,
} from "../packages/domain/src/index";
export const admin: Actor = { userId: demoUser, orgId: demoOrg, role: "admin" };
export function model(): AppModel {
  return {
    orgId: demoOrg,
    projectId: demoProject,
    applicationId: demoApplication,
    revision: 1,
    elements: [
      {
        id: "login.username",
        label: "E-posta",
        locator: { kind: "testId", value: "login-email" },
        approved: true,
        page: "login",
      },
      {
        id: "login.password",
        label: "Parola",
        locator: { kind: "testId", value: "login-password" },
        approved: true,
        page: "login",
      },
      {
        id: "login.submit",
        label: "Giriş yap",
        locator: { kind: "testId", value: "login-submit" },
        approved: true,
        page: "login",
      },
      {
        id: "dashboard.heading",
        label: "Dashboard",
        locator: { kind: "testId", value: "dashboard-heading" },
        approved: true,
        page: "dashboard",
      },
      {
        id: "dashboard.balance",
        label: "Bakiye",
        locator: { kind: "testId", value: "dashboard-balance" },
        approved: true,
        page: "dashboard",
      },
    ],
    flow: {
      id: "login",
      revision: 1,
      name: "Geçerli demo hesabıyla giriş yap",
      targets: ["login.username", "login.password", "login.submit"],
    },
  };
}
export function definition(): CanonicalTest {
  return {
    schemaVersion: "1.0",
    testId: randomUUID(),
    revision: 1,
    orgId: demoOrg,
    projectId: demoProject,
    title: "Dashboard görünür",
    appModelRef: { applicationId: demoApplication, revision: 1 },
    steps: [
      {
        id: randomUUID(),
        kind: "useBusinessFlow",
        flowRef: { id: "login", revision: 1 },
      },
      {
        id: randomUUID(),
        kind: "assert",
        assertion: "elementVisible",
        elementRef: "dashboard.heading",
        expected: true,
      },
    ],
    executionPolicy: { onStepError: "stop", maxDurationMs: 15000 },
  };
}
