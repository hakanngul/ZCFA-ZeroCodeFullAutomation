"use client";
import { useMemo, useState } from "react";
import { ListChecks, Sparkles } from "lucide-react";

export type PlanItem = {
  title: string;
  category: "positive" | "negative" | "edge";
  area: string;
  description: string;
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
  pages: string[];
  testData: string[];
  feasible: boolean;
  note?: string;
};
export type TestPlan = { summary: string; items: PlanItem[] };
export type PlanSelection = {
  items: {
    sourceIndex?: number;
    title: string;
    category: PlanItem["category"];
    description: string;
    preconditions?: string[];
    steps?: string[];
    expectedResults?: string[];
  }[];
  instruction?: string;
};

const categoryLabels = {
  positive: "Pozitif",
  negative: "Negatif",
  edge: "Sınır",
} as const;
/** Same bound as the generator: at most 10 scenarios per suite. */
export const maxSelected = 10;
const path = (raw: string) => {
  try {
    return new URL(raw).pathname || "/";
  } catch {
    return raw;
  }
};
const planLines = (raw: string, limit: number) =>
  raw
    .split("\n")
    .map((line) => line.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, limit);

/**
 * Proposed test plan of a survey exploration (ADR 018). Nothing is created
 * until the person picks items and asks for the tests.
 */
export function PlanCard({
  plan,
  status,
  busy,
  canEdit,
  onGenerate,
}: {
  plan: TestPlan;
  status: string;
  busy: boolean;
  canEdit: boolean;
  onGenerate: (selection: PlanSelection) => void;
}) {
  // Feasible items start selected, up to the generation limit.
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        plan.items
          .map((item, i) => (item.feasible ? i : -1))
          .filter((i) => i >= 0)
          .slice(0, maxSelected),
      ),
  );
  const [edits, setEdits] = useState<Record<number, Partial<PlanItem>>>({});
  // Keep the raw textarea including trailing newlines while the user types.
  const [reviewText, setReviewText] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const items = plan.items.map((item, i) => ({ ...item, ...edits[i] }));
  const areas = useMemo(
    () => [...new Set(plan.items.map((i) => i.area))],
    [plan.items],
  );
  const count = selected.size;
  const planned = status === "planned";
  const toggle = (i: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const submit = () =>
    onGenerate({
      items: [...selected]
        .sort((a, b) => a - b)
        .map((i) => ({
          sourceIndex: i,
          title: items[i]!.title.trim(),
          category: items[i]!.category,
          description: items[i]!.description.trim(),
          preconditions: planLines(
            reviewText[`${i}:preconditions`] ??
              (items[i]!.preconditions ?? []).join("\n"),
            10,
          ),
          steps: planLines(
            reviewText[`${i}:steps`] ?? (items[i]!.steps ?? []).join("\n"),
            20,
          ),
          expectedResults: planLines(
            reviewText[`${i}:expectedResults`] ??
              (items[i]!.expectedResults ?? []).join("\n"),
            10,
          ),
        })),
      ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
    });
  return (
    <section className="ai-plan" aria-label="Test planı">
      <div className="ai-plan-head">
        <ListChecks size={17} />
        <strong>Önerilen test planı · {plan.items.length} test</strong>
      </div>
      <p>{plan.summary}</p>
      {areas.map((area) => (
        <div key={area} className="ai-plan-area">
          <span className="ai-plan-area-name">{area}</span>
          <ul>
            {items.map((item, i) =>
              item.area !== area ? null : (
                <li
                  key={i}
                  className={`${selected.has(i) ? "selected" : ""} ${item.feasible ? "" : "infeasible"}`}
                >
                  <label className="ai-plan-check">
                    <input
                      type="checkbox"
                      aria-label={`${item.title} seç`}
                      checked={selected.has(i)}
                      disabled={
                        !canEdit || (!selected.has(i) && count >= maxSelected)
                      }
                      onChange={() => toggle(i)}
                    />
                  </label>
                  <div className="ai-plan-body">
                    <div className="ai-plan-title">
                      <input
                        aria-label={`Test ${i + 1} başlığı`}
                        value={item.title}
                        disabled={!canEdit}
                        maxLength={160}
                        onChange={(e) =>
                          setEdits({
                            ...edits,
                            [i]: { ...edits[i], title: e.target.value },
                          })
                        }
                      />
                      <span className={`badge ai-plan-${item.category}`}>
                        {categoryLabels[item.category]}
                      </span>
                    </div>
                    <textarea
                      aria-label={`Test ${i + 1} açıklaması`}
                      rows={2}
                      value={item.description}
                      disabled={!canEdit}
                      maxLength={500}
                      onChange={(e) =>
                        setEdits({
                          ...edits,
                          [i]: { ...edits[i], description: e.target.value },
                        })
                      }
                    />
                    <details className="ai-plan-details">
                      <summary>
                        Ön koşullar, test adımları ve beklenen sonuçlar
                      </summary>
                      <label>
                        Ön koşullar (satır başına bir koşul)
                        <textarea
                          aria-label={`Test ${i + 1} ön koşulları`}
                          rows={2}
                          disabled={!canEdit}
                          value={
                            reviewText[`${i}:preconditions`] ??
                            (item.preconditions ?? []).join("\n")
                          }
                          onChange={(e) =>
                            setReviewText((current) => ({
                              ...current,
                              [`${i}:preconditions`]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Test adımları (satır başına bir adım)
                        <textarea
                          aria-label={`Test ${i + 1} adımları`}
                          rows={3}
                          disabled={!canEdit}
                          value={
                            reviewText[`${i}:steps`] ??
                            (item.steps ?? []).join("\n")
                          }
                          onChange={(e) =>
                            setReviewText((current) => ({
                              ...current,
                              [`${i}:steps`]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Beklenen sonuçlar (satır başına bir sonuç)
                        <textarea
                          aria-label={`Test ${i + 1} beklenen sonuçları`}
                          rows={2}
                          disabled={!canEdit}
                          value={
                            reviewText[`${i}:expectedResults`] ??
                            (item.expectedResults ?? []).join("\n")
                          }
                          onChange={(e) =>
                            setReviewText((current) => ({
                              ...current,
                              [`${i}:expectedResults`]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </details>
                    <small>
                      {item.pages.length
                        ? `Sayfalar: ${item.pages.map(path).join(", ")}`
                        : "Sayfa belirtilmedi"}
                      {item.testData.length
                        ? ` · Veri: ${item.testData.join(", ")}`
                        : ""}
                    </small>
                    {!item.feasible && (
                      <small className="ai-plan-note">
                        Eksik bilgi:{" "}
                        {item.note ?? "gözlenmeyen sayfa ya da veri"}
                      </small>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      <label className="ai-plan-instruction">
        Ek not (isteğe bağlı)
        <input
          value={instruction}
          disabled={!canEdit}
          maxLength={1000}
          placeholder="Örn. sipariş testinde teslimat bilgisi: Ad Test, Soyad Kullanıcı, Posta kodu 34000"
          onChange={(e) => setInstruction(e.target.value)}
        />
      </label>
      <div className="ai-plan-actions">
        <small>
          {count} / {maxSelected} seçili. Seçtiğin testler yazılır; elementler
          yalnız bu testlerin adımları için kaydedilir.
        </small>
        <button
          className="primary"
          disabled={busy || !canEdit || !count}
          onClick={submit}
        >
          <Sparkles size={15} />{" "}
          {planned
            ? `Testleri oluştur (${count})`
            : `Seçilenlerle yeniden oluştur (${count})`}
        </button>
      </div>
    </section>
  );
}
