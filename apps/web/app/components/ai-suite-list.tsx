"use client";
import { useCallback, useEffect, useState } from "react";
import { FileCheck2, Play } from "lucide-react";
import type { AiSuite } from "../../../../packages/assistant/src/spec";
import { api } from "../lib/api";
type SuiteRow = {
  id: string;
  definition: AiSuite;
  promoted: { testId: string; revision: number } | null;
};
export function AiSuiteList({
  projectId,
  canEdit,
  onOpen,
  onPromoted,
}: {
  projectId: string;
  canEdit: boolean;
  onOpen: () => void;
  onPromoted?: () => void;
}) {
  const [suites, setSuites] = useState<SuiteRow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      api<{ suites: SuiteRow[] }>(`/v1/projects/${projectId}/ai/suites`)
        .then((data) => setSuites(data.suites))
        .catch((e) => setError(String(e))),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function promote(id: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/v1/projects/${projectId}/ai/suites/${id}/promote`,
        "POST",
        {},
      );
      await load();
      onPromoted?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" style={{ padding: 20, marginTop: 18 }}>
      <div className="card-heading">
        <h2>AI suite’ler</h2>
        <button className="secondary" onClick={onOpen}>
          AI Test Assistant’a git
        </button>
      </div>
      {!suites.length ? (
        <p>Henüz onaylanmış AI suite yok.</p>
      ) : (
        suites.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span>
              {s.definition.title} · {s.definition.scenarios.length} senaryo
              {s.promoted && (
                <span className="small-tag" style={{ marginLeft: 8 }}>
                  Kalıcı test v{s.promoted.revision}
                </span>
              )}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button
                className="secondary"
                disabled={!canEdit || busy || !!s.promoted}
                title={
                  s.promoted
                    ? "Bu suite zaten kalıcı teste dönüştürüldü."
                    : "Değişmez, sürümlü bir test oluşturur."
                }
                onClick={() => void promote(s.id)}
              >
                <FileCheck2 size={14} /> Kalıcı teste dönüştür
              </button>
              <button
                className="secondary"
                disabled={!canEdit}
                onClick={() =>
                  void api(
                    `/v1/projects/${projectId}/ai/suites/${s.id}/runs`,
                    "POST",
                    {},
                  )
                    .then(onOpen)
                    .catch((e) => setError(String(e)))
                }
              >
                <Play size={14} /> Çalıştır
              </button>
            </span>
          </div>
        ))
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
