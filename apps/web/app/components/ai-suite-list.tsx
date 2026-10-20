"use client";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { AiSuite } from "../../../../packages/assistant/src/spec";
import { api } from "../lib/api";
export function AiSuiteList({
  projectId,
  canEdit,
  onOpen,
}: {
  projectId: string;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const [suites, setSuites] = useState<{ id: string; definition: AiSuite }[]>(
      [],
    ),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{ suites: { id: string; definition: AiSuite }[] }>(
      `/v1/projects/${projectId}/ai/suites`,
    )
      .then((data) => setSuites(data.suites))
      .catch((e) => setError(String(e)));
  }, [projectId]);
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
            </span>
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
