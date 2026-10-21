"use client";
import { Check, Play } from "lucide-react";

export type ComparisonEntry = {
  draftId: string;
  providerName: string | null;
  model: string;
  status: string;
  errorCode: string | null;
  schema: "first_try" | "corrected" | "invalid" | null;
  attempts: number | null;
  durationMs: number | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
  scenarios: number | null;
  actions: number | null;
  assertions: number | null;
  fragileLocators: number | null;
  suiteId: string | null;
  latestRun: {
    id: string;
    status: string;
    passed: number | null;
    failed: number | null;
    skipped: number | null;
  } | null;
};
export type Comparison = {
  id: string;
  targetUrl: string;
  exploration: {
    runs: number;
    status: string;
    pages: number;
    steps: number;
    stopped: string | null;
  };
  entries: ComparisonEntry[];
};

const schemaText = {
  first_try: "İlk denemede geçerli",
  corrected: "Düzeltmeyle geçerli",
  invalid: "Geçersiz",
};
const statusText: Record<string, string> = {
  queued: "Keşif bekleniyor",
  running: "Keşif sürüyor",
  explored: "Üretim sırada",
  generating: "Üretiliyor",
  ready: "Hazır",
  failed: "Başarısız",
};
function seconds(ms: number | null) {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} sn`;
}
function tokens(entry: ComparisonEntry) {
  if (!entry.usage) return "—";
  const { promptTokens, completionTokens, totalTokens } = entry.usage;
  return `${totalTokens ?? "?"} (${promptTokens ?? "?"} / ${completionTokens ?? "?"})`;
}
function count(value: number | null) {
  return value === null ? "—" : String(value);
}

/** Side-by-side metrics; approval and runs stay explicit per draft. */
export function ModelComparison({
  comparison,
  busy,
  canEdit,
  onApprove,
  onRun,
}: {
  comparison: Comparison;
  busy: boolean;
  canEdit: boolean;
  onApprove: (draftId: string) => void;
  onRun: (suiteId: string) => void;
}) {
  const { exploration } = comparison;
  return (
    <div className="ai-comparison" aria-label="Model karşılaştırması">
      <strong>Model karşılaştırması</strong>
      <p>
        Ortak keşif:{" "}
        {exploration.status === "done"
          ? `${exploration.runs} kez çalıştı · ${exploration.pages} sayfa · ${exploration.steps} adım${exploration.stopped && exploration.stopped !== "done" ? ` · erken durdu (${exploration.stopped})` : ""}`
          : exploration.status === "failed"
            ? "başarısız"
            : "sürüyor…"}
        . Her model aynı keşif sonucundan senaryo üretti.
      </p>
      <div className="ai-comparison-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Durum</th>
              <th>Şema</th>
              <th>Senaryo</th>
              <th>Adım</th>
              <th>Doğrulama</th>
              <th>Kırılgan locator</th>
              <th>Süre</th>
              <th>Token (girdi / çıktı)</th>
              <th>Son çalıştırma</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {comparison.entries.map((entry) => (
              <tr key={entry.draftId}>
                <td>
                  <span className="ai-comparison-model">{entry.model}</span>
                  {entry.providerName && <small>{entry.providerName}</small>}
                </td>
                <td>
                  {statusText[entry.status] ?? entry.status}
                  {entry.errorCode && <small>{entry.errorCode}</small>}
                </td>
                <td>
                  {entry.schema ? schemaText[entry.schema] : "—"}
                  {entry.attempts !== null && (
                    <small>{entry.attempts} yanıt</small>
                  )}
                </td>
                <td>{count(entry.scenarios)}</td>
                <td>{count(entry.actions)}</td>
                <td>{count(entry.assertions)}</td>
                <td className={entry.fragileLocators ? "warn" : ""}>
                  {count(entry.fragileLocators)}
                </td>
                <td>{seconds(entry.durationMs)}</td>
                <td>{tokens(entry)}</td>
                <td>
                  {entry.latestRun
                    ? entry.latestRun.passed === null
                      ? entry.latestRun.status
                      : `${entry.latestRun.status} · ${entry.latestRun.passed} ✓ / ${entry.latestRun.failed} ✗`
                    : "—"}
                </td>
                <td>
                  {entry.status === "ready" && !entry.suiteId && (
                    <button
                      className="secondary"
                      disabled={busy || !canEdit}
                      onClick={() => onApprove(entry.draftId)}
                    >
                      <Check size={14} /> Onayla
                    </button>
                  )}
                  {entry.suiteId && (
                    <button
                      className="secondary"
                      aria-label={`${entry.model} suite'ini çalıştır`}
                      disabled={busy || !canEdit}
                      onClick={() => onRun(entry.suiteId!)}
                    >
                      <Play size={14} /> Çalıştır
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
