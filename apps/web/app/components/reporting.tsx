"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  History,
  LoaderCircle,
  Waves,
} from "lucide-react";
import { api } from "../lib/api";

type Kind = "canonical" | "suite" | "ai_test" | "case";
type HistoryRun = {
  kind: Kind;
  id: string;
  testId: string;
  version: number;
  title: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  failure: string | null;
  flaky: boolean;
};
type History = {
  total: number;
  limit: number;
  offset: number;
  tests: { key: string; kind: Kind; title: string }[];
  runs: HistoryRun[];
};
type TestStat = {
  key: string;
  kind: Kind;
  title: string;
  latestVersion: number;
  lastRunAt: string;
  runs: number;
  passed: number;
  failed: number;
  passRate: number | null;
  averageDurationMs: number | null;
  lastFailure: {
    runId: string;
    version: number;
    status: string;
    at: string;
    reason: string;
  } | null;
  flakyVersions: number[];
};

const kindLabels: Record<Kind, string> = {
  canonical: "Klasik",
  suite: "AI suite",
  ai_test: "Kalıcı AI",
  case: "Test case",
};
const statusLabels: Record<string, string> = {
  queued: "Kuyrukta",
  running: "Çalışıyor",
  passed: "Başarılı",
  failed: "Başarısız",
  blocked: "Engellendi",
  timed_out: "Zaman aşımı",
  infrastructure_error: "Altyapı hatası",
  cancelled: "İptal",
};
const when = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
const seconds = (ms: number | null) =>
  ms === null ? "—" : `${(ms / 1000).toFixed(1)} sn`;

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
export function FlakyBadge({ versions }: { versions?: number[] }) {
  return (
    <span
      className="badge flaky"
      title="Aynı sürümün son 10 tamamlanmış çalıştırmasında hem başarılı hem başarısız sonuç var (altyapı hatası/engellendi sayılmaz)."
    >
      <Waves size={12} /> Dalgalı
      {versions?.length ? ` · v${versions.join(", v")}` : ""}
    </span>
  );
}

/** Çalıştırmalar: every run kind in one paginated, filterable history. */
export function RunHistory({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState({
      test: "",
      status: "",
      from: "",
      to: "",
    }),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<History | null>(null),
    [error, setError] = useState("");
  const limit = 10;
  const load = useCallback(async () => {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    for (const [key, value] of Object.entries(filters))
      if (value) query.set(key, value);
    try {
      setData(
        await api<History>(
          `/v1/projects/${projectId}/reports/runs?${query.toString()}`,
        ),
      );
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [projectId, filters, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const pending = data?.runs.some((r) =>
    ["queued", "running"].includes(r.status),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [pending, load]);
  const change = (key: keyof typeof filters, value: string) => {
    setOffset(0);
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const total = data?.total ?? 0;
  return (
    <section className="card report-card">
      <div className="card-heading">
        <h2>
          <History size={16} /> Tüm çalıştırmalar
        </h2>
        <span className="small-tag">{total} çalıştırma</span>
      </div>
      <p className="hint">
        Klasik testler, AI suite’leri ve kalıcı AI testleri tek listede. Rapor
        indirme; adımları, bulguları ve SHA-256 doğrulanmış ekran görüntülerini
        tek HTML dosyasında verir (girdi değerleri ve gizli veriler hariç).
      </p>
      <div className="report-filters">
        <label className="field">
          Test
          <select
            value={filters.test}
            onChange={(e) => change("test", e.target.value)}
          >
            <option value="">Tümü</option>
            {data?.tests.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title} · {kindLabels[t.kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Durum
          <select
            value={filters.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">Tümü</option>
            {Object.entries(statusLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Başlangıç (UTC)
          <input
            type="date"
            value={filters.from}
            onChange={(e) => change("from", e.target.value)}
          />
        </label>
        <label className="field">
          Bitiş (UTC)
          <input
            type="date"
            value={filters.to}
            onChange={(e) => change("to", e.target.value)}
          />
        </label>
      </div>
      {!data?.runs.length ? (
        <p className="hint">Bu filtrelerle çalıştırma yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Test / sürüm</th>
                <th>Durum</th>
                <th>Süre</th>
                <th>Başlangıç</th>
                <th>Hata nedeni</th>
                <th>Rapor</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={`${run.kind}:${run.id}`}>
                  <td>
                    <strong>{run.title}</strong>
                    <small>
                      {kindLabels[run.kind]} · v{run.version} ·{" "}
                      {run.id.slice(0, 8)}
                    </small>
                    {run.flaky && <FlakyBadge />}
                  </td>
                  <td>
                    <Status status={run.status} />
                  </td>
                  <td>{seconds(run.durationMs)}</td>
                  <td>{when(run.createdAt)}</td>
                  <td className="report-reason">{run.failure ?? "—"}</td>
                  <td>
                    {["queued", "running"].includes(run.status) ? (
                      "—"
                    ) : (
                      <a
                        className="icon-button"
                        aria-label={`${run.id.slice(0, 8)} HTML raporunu indir`}
                        title="HTML raporu indir"
                        href={`/api/v1/projects/${projectId}/reports/runs/${run.kind}/${run.id}/report.html`}
                        download
                      >
                        <Download size={16} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="report-pager">
        <button
          className="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Önceki
        </button>
        <span>
          {total ? `${offset + 1}–${Math.min(offset + limit, total)}` : "0"} /{" "}
          {total}
        </span>
        <button
          className="secondary"
          disabled={offset + limit >= total}
          onClick={() => setOffset(offset + limit)}
        >
          Sonraki
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

/** Testler: last-N stats and flaky versions for every test that ran. */
export function TestStats({
  projectId,
  reloadKey,
}: {
  projectId: string;
  reloadKey?: number;
}) {
  const [tests, setTests] = useState<TestStat[] | null>(null),
    [size, setSize] = useState(20),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{ tests: TestStat[] }>(
      `/v1/projects/${projectId}/reports/tests?n=${size}`,
    )
      .then((data) => setTests(data.tests))
      .catch((e) => setError(String(e)));
  }, [projectId, size, reloadKey]);
  return (
    <section className="card report-card">
      <div className="card-heading">
        <h2>
          <BarChart3 size={16} /> Test istatistikleri
        </h2>
        <label className="report-window">
          Son
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          çalıştırma
        </label>
      </div>
      <p className="hint">
        Başarı oranı ve ortalama süre son {size} tamamlanmış çalıştırmadan
        hesaplanır. “Dalgalı”: aynı sürümün son 10 tamamlanmış çalıştırmasında
        hem başarılı hem başarısız sonuç var; altyapı hatası ve engellenen
        çalıştırmalar sayılmaz.
      </p>
      {!tests?.length ? (
        <p className="hint">Henüz tamamlanmış çalıştırma yok.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th>Çalıştırma</th>
                <th>Başarı oranı</th>
                <th>Ort. süre</th>
                <th>Son hata</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.key}>
                  <td>
                    <strong>{t.title}</strong>
                    <small>
                      {kindLabels[t.kind]} · son v{t.latestVersion} · son
                      çalıştırma {when(t.lastRunAt)}
                    </small>
                    {t.flakyVersions.length > 0 && (
                      <FlakyBadge versions={t.flakyVersions} />
                    )}
                  </td>
                  <td>
                    {t.runs} ({t.passed} başarılı · {t.failed} başarısız)
                  </td>
                  <td>
                    <strong>
                      {t.passRate === null ? "—" : `%${t.passRate}`}
                    </strong>
                  </td>
                  <td>{seconds(t.averageDurationMs)}</td>
                  <td className="report-reason">
                    {t.lastFailure ? (
                      <>
                        <Status status={t.lastFailure.status} />{" "}
                        {t.lastFailure.reason}
                        <small>
                          v{t.lastFailure.version} · {when(t.lastFailure.at)}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
