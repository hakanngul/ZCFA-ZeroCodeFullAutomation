"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, FileCheck2, LoaderCircle, Play } from "lucide-react";
import { api } from "../lib/api";
import { QualityFindings, type Findings } from "./quality-findings";

type TestRow = {
  id: string;
  revision: number;
  title: string;
  target_origin: string;
  checksum: string;
  created_at: string;
  scenario_count: number;
  element_count: number;
  authorized: boolean;
  latest: boolean;
  /** Library elements of the latest version with a newer revision (ADR 015). */
  stale_elements: {
    elementKey: string;
    pinnedRevision: number;
    currentRevision: number | null;
    approved: boolean;
    removed: boolean;
  }[];
};
type RunRow = {
  id: string;
  test_id: string;
  revision: number;
  status: string;
  checksum: string;
  created_at: string;
  title: string;
  target_origin: string;
};
type RunDetail = RunRow & {
  plan: { checksum: string; targetUrl: string; testRevision: number };
  result: {
    code?: string;
    counts?: { passed: number; failed: number; skipped: number };
    results?: {
      title: string;
      status: string;
      code?: string;
      steps: {
        kind: string;
        status: string;
        code?: string;
        message?: string;
        findings?: Findings;
        element?: string;
        elementName?: string;
      }[];
      screenshot?: { sha256: string };
    }[];
  } | null;
};
const statusLabels: Record<string, string> = {
  queued: "Kuyrukta",
  running: "Çalışıyor",
  passed: "Başarılı",
  failed: "Başarısız",
  blocked: "Engellendi",
  infrastructure_error: "Altyapı hatası",
};
function Status({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {["queued", "running"].includes(status) && (
        <LoaderCircle size={12} className="spin" />
      )}
      {statusLabels[status] ?? status}
    </span>
  );
}
const when = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });

/** Testler: immutable versions promoted from approved AI suites. */
export function PromotedTests({
  projectId,
  canEdit,
  reloadKey,
  onRun,
}: {
  projectId: string;
  canEdit: boolean;
  reloadKey: number;
  onRun: (runId: string) => void;
}) {
  const [tests, setTests] = useState<TestRow[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    void api<{ tests: TestRow[] }>(`/v1/projects/${projectId}/ai/tests`)
      .then((data) => setTests(data.tests))
      .catch((e) => setError(String(e)));
  }, [projectId, reloadKey, reload]);
  const newVersion = async (v: TestRow) => {
    setBusy(v.id);
    setError("");
    setMessage("");
    try {
      const created = await createElementUpdateVersion(projectId, v);
      setMessage(
        `${v.title}: v${created.test.revision} oluşturuldu (${created.changed
          .map((c) => `${c.elementKey} v${c.from}→v${c.to}`)
          .join(", ")}). v${v.revision} değişmedi.`,
      );
      setReload((n) => n + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const groups = [...new Set(tests.map((t) => t.id))].map((id) =>
    tests.filter((t) => t.id === id).sort((a, b) => b.revision - a.revision),
  );
  return (
    <section className="card" style={{ padding: 20, marginTop: 18 }}>
      <div className="card-heading">
        <h2>Kalıcı AI testleri</h2>
        <span className="small-tag">{groups.length}</span>
      </div>
      <p className="hint">
        Yayınlanan sürümler değişmez; suite yeniden dönüştürülünce ya da
        güncellenen elementler için “Yeni sürüm oluştur” ile yeni sürüm oluşur.
        Hedef origin her çalıştırmada yeniden yetki kontrolünden geçer.
      </p>
      {!groups.length ? (
        <p className="hint">
          Onaylı bir AI suite’i “Kalıcı teste dönüştür” ile burada sürümlü teste
          çevirin.
        </p>
      ) : (
        groups.map((versions) => (
          <div
            key={versions[0]!.id}
            style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}
          >
            <strong>
              <FileCheck2 size={15} /> {versions[0]!.title}
            </strong>
            {versions.map((v) => (
              <div
                key={v.revision}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 8,
                }}
              >
                <small>
                  v{v.revision} · {v.scenario_count} senaryo · {v.element_count}{" "}
                  element · {v.target_origin} ·{" "}
                  <code title={v.checksum}>
                    SHA-256 {v.checksum.slice(0, 12)}…
                  </code>{" "}
                  · {when(v.created_at)}
                  {!v.authorized && (
                    <span className="badge blocked" style={{ marginLeft: 8 }}>
                      Origin yetkisiz
                    </span>
                  )}
                  {v.stale_elements.length > 0 && (
                    <span
                      className="badge awaiting_review"
                      style={{ marginLeft: 8 }}
                      title={v.stale_elements.map(staleText).join("\n")}
                    >
                      güncel olmayan element ({v.stale_elements.length})
                    </span>
                  )}
                </small>
                {v.stale_elements.length > 0 && (
                  <button
                    className="secondary"
                    disabled={!canEdit || busy === v.id}
                    title="Güncel onaylı element sürümleriyle yeni test sürümü"
                    onClick={() => void newVersion(v)}
                  >
                    Yeni sürüm oluştur
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={!canEdit || !v.authorized}
                  onClick={() =>
                    void api<{ id: string }>(
                      `/v1/projects/${projectId}/ai/tests/${v.id}/runs`,
                      "POST",
                      { revision: v.revision },
                    )
                      .then((r) => onRun(r.id))
                      .catch((e) => setError(String(e)))
                  }
                >
                  <Play size={14} /> v{v.revision} çalıştır
                </button>
              </div>
            ))}
          </div>
        ))
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

function staleText(s: TestRow["stale_elements"][number]) {
  if (s.removed) return `${s.elementKey}: v${s.pinnedRevision} → silinmiş`;
  return `${s.elementKey}: v${s.pinnedRevision} → v${s.currentRevision}${s.approved ? "" : " (onaysız)"}`;
}
export type CreatedVersion = {
  test: { testId: string; revision: number };
  checksum: string;
  changed: { elementKey: string; from: number; to: number }[];
};
/** Re-pins the test's elements to their current approved revisions (ADR 015). */
export function createElementUpdateVersion(
  projectId: string,
  test: { id: string; revision: number },
) {
  return api<CreatedVersion>(
    `/v1/projects/${projectId}/ai/tests/${test.id}/versions`,
    "POST",
    { expectedRevision: test.revision },
  );
}

/** Çalıştırmalar: promoted test runs with plan checksum and evidence. */
export function PromotedRuns({
  projectId,
  selected,
  onSelect,
}: {
  projectId: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [runs, setRuns] = useState<RunRow[]>([]),
    [detail, setDetail] = useState<RunDetail | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await api<{ runs: RunRow[] }>(
        `/v1/projects/${projectId}/ai/test-runs`,
      );
      setRuns(data.runs);
      if (selected)
        setDetail(
          await api<RunDetail>(
            `/v1/projects/${projectId}/ai/test-runs/${selected}`,
          ),
        );
    } catch (e) {
      setError(String(e));
    }
  }, [projectId, selected]);
  useEffect(() => {
    void load();
  }, [load]);
  const pending = runs.some((r) => ["queued", "running"].includes(r.status));
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 1000);
    return () => clearInterval(timer);
  }, [pending, load]);
  const root = `/api/v1/projects/${projectId}/ai/test-runs`;
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="card-heading">
        <h2>Kalıcı AI testi çalıştırmaları</h2>
        <span className="small-tag">Son {runs.length} çalıştırma</span>
      </div>
      {!runs.length ? (
        <p className="hint">Henüz kalıcı AI testi çalıştırılmadı.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Test / sürüm</th>
                <th>Hedef</th>
                <th>Durum</th>
                <th>Başlangıç</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr
                  key={row.id}
                  className={selected === row.id ? "selected-row" : ""}
                >
                  <td>
                    <strong>{row.title}</strong>
                    <small>
                      v{row.revision} · {row.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>{row.target_origin}</td>
                  <td>
                    <Status status={row.status} />
                  </td>
                  <td>{when(row.created_at)}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`${row.id.slice(0, 8)} AI test çalıştırma ayrıntıları`}
                      onClick={() => onSelect(row.id)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && detail.id === selected && (
        <div style={{ marginTop: 16, padding: "0 24px 20px" }}>
          <div className="run-meta">
            <span>
              {detail.title} · Test v{detail.plan.testRevision}
            </span>
            <span>{detail.plan.targetUrl}</span>
            <code title={detail.plan.checksum}>
              Plan SHA-256 {detail.plan.checksum.slice(0, 12)}…
            </code>
            <Status status={detail.status} />
          </div>
          {detail.result?.code && <p>Kod: {detail.result.code}</p>}
          {detail.result?.counts && (
            <p>
              {detail.result.counts.passed} başarılı ·{" "}
              {detail.result.counts.failed} başarısız ·{" "}
              {detail.result.counts.skipped} atlandı
            </p>
          )}
          {detail.result?.results?.map((r, i) => (
            <div
              key={i}
              style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}
            >
              <strong>
                {r.title}: <Status status={r.status} />
              </strong>
              {r.code && <p>Hata: {r.code}</p>}
              <small>
                {r.steps
                  .map(
                    (s) =>
                      `${s.kind}${s.element ? ` · ${s.elementName ? `${s.elementName} (${s.element})` : s.element}` : ""}: ${s.status}${s.code ? ` (${s.code})` : ""}${s.message ? ` — ${s.message}` : ""}`,
                  )
                  .join(" → ")}
              </small>
              {r.steps.map((s, n) => (
                <QualityFindings key={n} findings={s.findings} />
              ))}
              {r.screenshot && (
                <a
                  href={`${root}/${detail.id}/screenshots/${i}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${root}/${detail.id}/screenshots/${i}`}
                    alt={`${r.title} kanıt görüntüsü`}
                    style={{
                      display: "block",
                      maxWidth: 360,
                      marginTop: 8,
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                    }}
                  />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
