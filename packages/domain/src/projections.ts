import type { CanonicalTest } from "./index";

const elementNames: Record<string, string> = {
  "dashboard.heading": "Dashboard",
  "dashboard.balance": "Bakiye",
};
export function businessProjection(test: CanonicalTest) {
  return test.steps.map((step) => {
    if (step.kind === "useBusinessFlow")
      return {
        id: step.id,
        kind: "flow" as const,
        title: "Geçerli demo hesabıyla giriş yap",
        description: "Giriş sayfasını aç → bilgileri gir → giriş yap",
        revision: step.flowRef.revision,
      };
    const target = elementNames[step.elementRef] ?? step.elementRef;
    return {
      id: step.id,
      kind: "assertion" as const,
      title:
        step.assertion === "elementVisible"
          ? `${target} görünür olmalı`
          : `${target} metni “${step.expected}” olmalı`,
      description:
        step.assertion === "elementVisible"
          ? "Görünürlük gerçek tarayıcıda doğrulanır."
          : "Gözlenen metin, tanımladığın beklentiyle tam eşleşmeli.",
      revision: undefined,
    };
  });
}
export function flowProjection(test: CanonicalTest) {
  return businessProjection(test).flatMap((step) =>
    step.kind === "flow"
      ? ["Giriş sayfasını aç", "Demo bilgilerini gir", "Giriş yap"].map(
          (title, i) => ({ id: `${step.id}:${i}`, title, assertion: false }),
        )
      : [{ id: step.id, title: step.title, assertion: true }],
  );
}
