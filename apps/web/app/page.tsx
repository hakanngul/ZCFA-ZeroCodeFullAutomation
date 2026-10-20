"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  FileCheck2,
  FlaskConical,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Play,
  Plus,
  Radar,
  ShieldCheck,
  Settings2,
  Sparkles,
  Square,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  Actor,
  AppModel,
  CanonicalTest,
  Element,
  ExecutionPlan,
  RunOutcome,
  Variant,
} from "../../../packages/domain/src/index";

import {
  businessProjection,
  flowProjection,
} from "../../../packages/domain/src/projections";

import { api } from "./lib/api";
import { ElementRegistry } from "./components/element-registry";
import { AiAssistant } from "./components/ai-assistant";
import { AiSuiteList } from "./components/ai-suite-list";

type Scan = {
  id: string;
  status: string;
  findings: { elements: Element[] } | null;
};
type RunSummary = {
  id: string;
  test_id: string;
  status: string;
  variant: Variant;
  revision: number;
  created_at: string;
  finished_at: string | null;
};
type RunDetail = RunSummary & {
  plan: ExecutionPlan;
  outcome: RunOutcome | null;
};
type ProjectData = {
  project: { id: string; name: string };
  model: AppModel | null;
  scans: Scan[];
  tests: CanonicalTest[];
  aiSuiteCount: number;
  aiRunCounts: { total: number; passed: number; pending: number };
  runs: RunSummary[];
  audit: { action: string; object_id: string; created_at: string }[];
};
type Section =
  | "overview"
  | "model"
  | "elements"
  | "tests"
  | "runs"
  | "assistant"
  | "settings";
const labels: Record<string, string> = {
  queued: "Sırada",
  running: "Çalışıyor",
  passed: "Başarılı",
  failed: "Başarısız",
  blocked: "Engellendi",
  timed_out: "Zaman aşımı",
  infrastructure_error: "Altyapı hatası",
  cancelled: "İptal",
  awaiting_review: "Onay bekliyor",
  approved: "Onaylandı",
};
const variantLabels: Record<Variant, string> = {
  healthy: "Sağlam uygulama",
  broken: "Bozuk dashboard",
  ambiguous: "Belirsiz giriş butonu",
  slow: "Yavaş uygulama",
};
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {["running", "queued"].includes(status) ? (
        <LoaderCircle size={12} className="spin" />
      ) : status === "passed" || status === "approved" ? (
        <CheckCircle2 size={12} />
      ) : (
        <Circle size={9} />
      )}
      {labels[status] ?? status}
    </span>
  );
}
function time(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

export default function Workspace() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ProjectData | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"business" | "flow" | "technical">(
    "business",
  );
  const [approved, setApproved] = useState<string[]>([]);
  const [title, setTitle] = useState("Geçerli müşteri dashboard’a ulaşır");
  const [checkBalance, setCheckBalance] = useState(false);
  const [expected, setExpected] = useState("1.250,00 TL");
  const [variant, setVariant] = useState<Variant>("healthy");
  const [published, setPublished] = useState<CanonicalTest | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    if (projectId) setData(await api<ProjectData>(`/v1/projects/${projectId}`));
  }, [projectId]);
  useEffect(() => {
    api<{ actor: Actor; projects: { id: string }[] }>("/v1/workspace")
      .then((result) => {
        setActor(result.actor);
        setProjectId(result.projects[0]?.id ?? "");
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!projectId) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 1500);
    return () => clearInterval(timer);
  }, [projectId, refresh]);
  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const detail = await api<RunDetail>(`/v1/runs/${runId}`);
        if (!cancelled) setRun(detail);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);
  const draft = useMemo<CanonicalTest | null>(() => {
    if (!data?.model || !actor) return null;
    return {
      schemaVersion: "1.0",
      testId: crypto.randomUUID(),
      revision: 1,
      orgId: actor.orgId,
      projectId,
      title,
      appModelRef: {
        applicationId: data.model.applicationId,
        revision: data.model.revision,
      },
      steps: [
        {
          id: crypto.randomUUID(),
          kind: "useBusinessFlow",
          flowRef: { id: "login", revision: data.model.flow.revision },
        },
        {
          id: crypto.randomUUID(),
          kind: "assert",
          assertion: "elementVisible",
          elementRef: "dashboard.heading",
          expected: true,
        },
        ...(checkBalance
          ? [
              {
                id: crypto.randomUUID(),
                kind: "assert" as const,
                assertion: "elementText" as const,
                elementRef: "dashboard.balance",
                expected,
              },
            ]
          : []),
      ],
      executionPolicy: { onStepError: "stop", maxDurationMs: 15000 },
    };
  }, [data?.model?.revision, actor, projectId, title, checkBalance, expected]);
  const shownTest = published ?? draft;
  const businessSteps = shownTest ? businessProjection(shownTest) : [];
  const flowSteps = shownTest ? flowProjection(shownTest) : [];
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const login = () =>
    action(async () => {
      const result = await api<{ actor: Actor; projectId: string }>(
        "/v1/session/local",
        "POST",
      );
      setActor(result.actor);
      setProjectId(result.projectId);
    });
  const scan = () =>
    action(async () => {
      await api(`/v1/projects/${projectId}/discovery-scans`, "POST");
      setApproved([]);
      setSection("model");
    });
  const publish = () =>
    action(async () => {
      if (!draft) return;
      const result = await api<{ test: CanonicalTest }>(
        `/v1/projects/${projectId}/tests`,
        "POST",
        draft,
      );
      setPublished(result.test);
    });
  const startRun = (test: CanonicalTest) =>
    action(async () => {
      const result = await api<{ id: string }>(
        `/v1/tests/${test.testId}/runs`,
        "POST",
        { variant },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      setRunId(result.id);
      setSection("runs");
    });
  const latestScan = data?.scans[0];
  const successful =
    (data?.runs.filter((r) => r.status === "passed").length ?? 0) +
    (data?.aiRunCounts.passed ?? 0);
  const pending =
    (data?.runs.filter((r) => ["queued", "running"].includes(r.status))
      .length ?? 0) + (data?.aiRunCounts.pending ?? 0);
  const navigation: {
    id: Section;
    title: string;
    icon: typeof Boxes;
    count?: number;
  }[] = [
    { id: "overview", title: "Genel bakış", icon: LayoutDashboard },
    { id: "assistant", title: "AI Test Assistant", icon: Sparkles },
    {
      id: "model",
      title: "Uygulama modeli",
      icon: Boxes,
      count: data?.model?.elements.filter((e) => e.approved).length,
    },
    {
      id: "elements",
      title: "Elementler",
      icon: Code2,
      count: data?.model?.elements.length,
    },
    {
      id: "tests",
      title: "Testler",
      icon: FlaskConical,
      count: data ? data.tests.length + data.aiSuiteCount : undefined,
    },
    {
      id: "runs",
      title: "Çalıştırmalar",
      icon: Play,
      count: data?.runs.length,
    },
    { id: "settings", title: "Ayarlar", icon: Settings2 },
  ];
  const editor = (
    <>
      <div className="card-heading">
        <div>
          <span className="eyebrow">TEST TASARIMCISI</span>
          <h2>
            {published ? "Yayınlanan test" : "Bir iş akışı. Açık bir beklenti."}
          </h2>
        </div>
        <span className="small-tag">
          {published
            ? `Sürüm ${published.revision} · Salt okunur`
            : "Yeni taslak"}
        </span>
      </div>
      {!data?.model ? (
        <div className="empty">
          <Layers3 size={32} />
          <h3>Önce uygulamanı tanıyalım</h3>
          <p>
            Demo sayfalarındaki öğeleri keşfet, eşlemeleri incele ve onayla.
          </p>
          <button className="primary" onClick={scan} disabled={busy}>
            <Radar size={16} /> Keşfi başlat
          </button>
        </div>
      ) : (
        <>
          <div className="editor-top">
            <label className="field">
              Test adı
              <input
                value={published?.title ?? title}
                readOnly={!!published}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </label>
            <div className="model-ref">
              <ShieldCheck size={17} />
              <span>
                Onaylı model<strong>v{shownTest?.appModelRef.revision}</strong>
              </span>
            </div>
          </div>
          <div className="view-tabs" role="tablist" aria-label="Test görünümü">
            {(
              [
                ["business", "İş adımları", FileCheck2],
                ["flow", "Akış", GitBranch],
                ["technical", "Teknik", Code2],
              ] as const
            ).map(([id, name, Icon]) => (
              <button
                role="tab"
                aria-selected={view === id}
                key={id}
                onClick={() => setView(id)}
                className={view === id ? "selected" : ""}
              >
                <Icon size={15} />
                {name}
              </button>
            ))}
            <span>Tek model · üç görünüm</span>
          </div>
          {view === "business" && (
            <div className="steps">
              {businessSteps.map((step, index) => (
                <div className="step" key={step.id}>
                  <span className="step-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div
                    className={`step-icon ${step.kind === "assertion" ? "assertion" : ""}`}
                  >
                    {step.kind === "flow" ? (
                      <GitBranch size={18} />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                  </div>
                  <div>
                    <span className="step-type">
                      {step.kind === "flow"
                        ? "YENİDEN KULLANILABİLİR AKIŞ"
                        : "BEKLENEN SONUÇ"}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  {step.kind === "flow" ? (
                    <span className="small-tag">Login v{step.revision}</span>
                  ) : (
                    <span className="required">Açık doğrulama</span>
                  )}
                </div>
              ))}
              {!published && (
                <>
                  <div
                    className={`balance-step ${checkBalance ? "enabled" : ""}`}
                  >
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={checkBalance}
                        disabled={
                          !data.model.elements.find(
                            (e) => e.id === "dashboard.balance",
                          )?.approved
                        }
                        onChange={(e) => setCheckBalance(e.target.checked)}
                      />{" "}
                      Bakiyeyi de doğrula
                    </label>
                    {checkBalance && (
                      <label className="field">
                        Beklenen metin
                        <input
                          value={expected}
                          onChange={(e) => setExpected(e.target.value)}
                          maxLength={200}
                        />
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {view === "flow" && (
            <div className="flow-view">
              {flowSteps.map((step, i) => (
                <div key={step.id}>
                  <div
                    className={`flow-node ${step.assertion ? "assert-node" : ""}`}
                  >
                    {step.assertion ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Square size={16} />
                    )}
                    {step.title}
                  </div>
                  {i < flowSteps.length - 1 && <ArrowDown size={16} />}
                </div>
              ))}
            </div>
          )}
          {view === "technical" && (
            <div className="technical">
              <div>
                <Terminal size={15} /> CanonicalTest · schemaVersion 1.0
              </div>
              <pre>{JSON.stringify(shownTest, null, 2)}</pre>
            </div>
          )}
          <div className="editor-footer">
            <span>
              <ShieldCheck size={15} /> Beklenen sonuçlar otomatik
              değiştirilmez.
            </span>
            {published ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() => startRun(published)}
              >
                <Play size={15} /> Testi çalıştır
              </button>
            ) : (
              <button
                className="primary"
                disabled={
                  busy ||
                  title.trim().length < 3 ||
                  (checkBalance && !expected.trim())
                }
                onClick={publish}
              >
                <Check size={16} /> Doğrula ve yayınla
              </button>
            )}
          </div>
        </>
      )}
    </>
  );

  if (!ready)
    return (
      <main className="boot">
        <LoaderCircle className="spin" />
        Çalışma alanı hazırlanıyor…
      </main>
    );
  if (!actor)
    return (
      <main className="welcome">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={24} />
          </div>
          zero<span>code</span>
          <i>LAB</i>
        </div>
        <span className="eyebrow">İŞ NİYETİNDEN GERÇEK KANITA</span>
        <h1>
          Testi sen tanımla.
          <br />
          <em>Kanıtı ZeroCode üretsin.</em>
        </h1>
        <p>
          Uygulamanı modelle. İş akışını oluştur. Gerçek tarayıcıda doğrula.
        </p>
        <div className="welcome-card">
          <ShieldCheck size={24} />
          <div>
            <strong>Yerel geliştirme prototipi</strong>
            <p>
              Örnek uygulama ve demo oturumu kullanılır. Gerçek müşteri verisi
              içermez.
            </p>
          </div>
        </div>
        <button className="primary large" disabled={busy} onClick={login}>
          Yerel çalışma alanını aç <ArrowRight size={18} />
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <small>Chromium · Deterministik yürütme · İnsan onaylı eşleme</small>
      </main>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ZeroCode ana sayfa">
          <div className="brand-mark">
            <Layers3 size={21} />
          </div>
          zero<span>code</span>
          <i>LAB</i>
        </a>
        <div className="workspace-picker">
          <div className="workspace-icon">Z</div>
          <div>
            <strong>Geliştirme alanı</strong>
            <span>Yerel prototip</span>
          </div>
          <ChevronRight size={15} />
        </div>
        <span className="nav-label">ÇALIŞMA ALANI</span>
        <nav>
          {navigation.map(({ id, title: name, icon: Icon, count }) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => setSection(id)}
            >
              <Icon size={18} />
              {name}
              {count !== undefined && <span>{count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={19} />
          <strong>Kontrol sende.</strong>
          <p>
            Eşlemeler sen onaylamadan kullanılmaz. Testin beklentisi korunur.
          </p>
          <span>
            Güvenli demo modu <span className="dot" />
          </span>
        </div>
        <button
          className="profile"
          onClick={() =>
            action(async () => {
              await api("/v1/session", "DELETE");
              setActor(null);
              setProjectId("");
              setData(null);
              setRunId(null);
              setPublished(null);
            })
          }
        >
          <span className="avatar">QA</span>
          <span>
            <strong>Demo QA</strong>
            <small>Yerel yönetici</small>
          </span>
          <LogOut size={15} />
        </button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            Çalışma alanı <ChevronRight size={14} />
            <strong>{data?.project.name ?? "ZeroCode Demo"}</strong>
          </div>
          <span>
            <span className="dot" /> Yerel geliştirme{" "}
            <span className="version">v0.1</span>
          </span>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                PROJE <span>/</span> WEB · CHROMIUM
              </div>
              <h1>
                {
                  {
                    overview: "Her testin arkasında bir kanıt.",
                    assistant: "AI Test Assistant",
                    settings: "Ayarlar",
                    model: "Uygulama modeli",
                    elements: "Elementler",
                    tests: "Test çalışma alanı",
                    runs: "Çalıştırmalar ve kanıtlar",
                  }[section]
                }
              </h1>
              <p>
                {
                  {
                    overview:
                      "İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele.",
                    assistant:
                      "İzinli hedefi incele, senaryoları gözden geçir ve suite çalıştır.",
                    settings:
                      "Test hedeflerini, AI sağlayıcılarını ve modelleri yönet.",
                    model:
                      "Keşif önerilerini incele. Onayladığın öğeler sürümlü modelin parçası olsun.",
                    tests:
                      "Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur.",
                    elements:
                      "Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.",
                    runs: "Gerçek tarayıcı sonuçlarını, doğrulamaları ve kanıtları bir arada gör.",
                  }[section]
                }
              </p>
            </div>
            {section !== "model" &&
              section !== "elements" &&
              section !== "assistant" &&
              section !== "settings" && (
                <button
                  className="primary"
                  onClick={() => {
                    setPublished(null);
                    setSection("tests");
                  }}
                >
                  <Plus size={16} /> Yeni test
                </button>
              )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <XCircle size={18} />
              {error}
              <button aria-label="Hatayı kapat" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {section !== "assistant" && section !== "settings" && (
            <div className="prototype-banner">
              <FlaskConical size={16} />
              <span>Geliştirme sürümü</span> Klasik testler yerel Demo Bank
              üzerinde çalışır; AI suite’ler yalnız yapılandırılmış izinli
              hedeflere gider.
            </div>
          )}
          {section === "assistant" && (
            <AiAssistant
              projectId={projectId}
              canEdit={actor.role !== "viewer"}
              mode="chat"
            />
          )}
          {section === "settings" && (
            <AiAssistant
              projectId={projectId}
              canEdit={actor.role !== "viewer"}
              mode="settings"
            />
          )}
          {section === "overview" && (
            <>
              <div className="hero">
                <div>
                  <span className="eyebrow">
                    <Zap size={13} /> DAHA AZ TEKNİK YÜK. DAHA NET SONUÇ.
                  </span>
                  <h2>
                    İlk anlamlı testine
                    <br />
                    üç adım uzaktasın.
                  </h2>
                  <p>
                    Önce uygulamanı tanı. Sonra neyi doğrulayacağını seç.
                    <br />
                    Gerisini izole tarayıcı worker’ı çalıştırsın.
                  </p>
                  <button
                    onClick={data?.model ? () => setSection("tests") : scan}
                    className="hero-button"
                    disabled={busy}
                  >
                    {data?.model ? "Testini tasarla" : "Uygulamayı keşfet"}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="hero-diagram">
                  <div className="diagram-node">
                    <Boxes size={20} />
                    <span>
                      Uygulama modeli
                      <small>
                        {data?.model
                          ? `v${data.model.revision} · Onaylı`
                          : "Keşfet ve onayla"}
                      </small>
                    </span>
                    <span className="node-mark">01</span>
                  </div>
                  <div className="diagram-line" />
                  <div className="diagram-node">
                    <GitBranch size={20} />
                    <span>
                      İş niyeti<small>Giriş yap → Dashboard görünsün</small>
                    </span>
                    <span className="node-mark">02</span>
                  </div>
                  <div className="diagram-line" />
                  <div className="diagram-node evidence-node">
                    <CheckCircle2 size={20} />
                    <span>
                      Kanıtlı sonuç
                      <small>Gerçek assertion + ekran görüntüsü</small>
                    </span>
                    <span className="node-mark">03</span>
                  </div>
                </div>
              </div>
              <div className="metrics">
                {[
                  {
                    label: "Onaylı öğe",
                    value:
                      data?.model?.elements.filter((e) => e.approved).length ??
                      0,
                    icon: Boxes,
                    note: "Ortak uygulama bilgisi",
                  },
                  {
                    label: "Yayınlanan test",
                    value: data ? data.tests.length + data.aiSuiteCount : 0,
                    icon: FileCheck2,
                    note: "Açık doğrulama içeren",
                  },
                  {
                    label: "Başarılı çalıştırma",
                    value: successful,
                    icon: CheckCircle2,
                    note: "Gerçek tarayıcıda doğrulandı",
                  },
                  {
                    label: "Bekleyen / çalışan",
                    value: pending,
                    icon: Clock3,
                    note: "Tek worker · izole context",
                  },
                ].map(({ label, value, icon: Icon, note }) => (
                  <div className="metric" key={label}>
                    <div>
                      {label}
                      <Icon size={17} />
                    </div>
                    <strong>{value.toString().padStart(2, "0")}</strong>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="card">
                  <div className="card-heading">
                    <h2>Başlangıç rotan</h2>
                    <span className="small-tag">Web MVP</span>
                  </div>
                  {[
                    {
                      name: "Uygulama bilgisini oluştur",
                      desc: "Demo öğelerini keşfet ve insan onayıyla eşle.",
                      done: !!data?.model,
                      target: "model" as Section,
                    },
                    {
                      name: "İş beklentisini tanımla",
                      desc: "Giriş akışı ve görünürlük doğrulaması ekle.",
                      done: !!data?.tests.length,
                      target: "tests" as Section,
                    },
                    {
                      name: "Çalıştır ve kanıtı incele",
                      desc: "PASS, FAIL ve engelleri ayrı ayrı gör.",
                      done: !!data?.runs.length,
                      target: "runs" as Section,
                    },
                  ].map((step, i) => (
                    <button
                      className="journey-step"
                      key={step.name}
                      onClick={() => setSection(step.target)}
                    >
                      <span className={step.done ? "done" : ""}>
                        {step.done ? <Check size={17} /> : `0${i + 1}`}
                      </span>
                      <div>
                        <strong>{step.name}</strong>
                        <p>{step.desc}</p>
                      </div>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </section>
                <section className="card recent-card">
                  <div className="card-heading">
                    <h2>Son hareketler</h2>
                    <Clock3 size={17} />
                  </div>
                  {data?.audit.length ? (
                    data.audit.slice(0, 4).map((event, i) => (
                      <div className="audit-event" key={i}>
                        <span className="audit-dot" />
                        <div>
                          <strong>
                            {{
                              "discovery.queued": "Uygulama keşfi başlatıldı",
                              "mapping.approved": "Eşlemeler onaylandı",
                              "test.published": "Yeni test yayınlandı",
                              "run.queued": "Test kuyruğa alındı",
                              "run.cancelled": "Çalıştırma iptal edildi",
                            }[event.action] ?? event.action}
                          </strong>
                          <small>{time(event.created_at)}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty compact">
                      <Clock3 size={25} />
                      <p>
                        İlk işleminle birlikte
                        <br />
                        projenin geçmişi burada oluşacak.
                      </p>
                    </div>
                  )}
                  <div className="footnote">
                    Süreç, sürüm ve sonuçlar kayıt altında.
                  </div>
                </section>
              </div>
            </>
          )}
          {section === "model" && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">DEMO BANK · WEB UYGULAMASI</span>
                  <h2>Keşif ve eşleme incelemesi</h2>
                </div>
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    ["queued", "running"].includes(latestScan?.status ?? "")
                  }
                  onClick={scan}
                >
                  <Radar size={16} />
                  {latestScan ? "Yeniden keşfet" : "Keşfi başlat"}
                </button>
              </div>
              <div className="info-line">
                <ShieldCheck size={18} />
                Pasif keşif yalnız demo giriş ve öğretim sayfalarını okur.
                Tıklama veya form gönderimi yapmaz.
              </div>
              {!latestScan && (
                <div className="empty">
                  <Radar size={34} />
                  <h3>Uygulama bilgisiyle başla</h3>
                  <p>Önerilen öğeler önce senin incelemene sunulur.</p>
                </div>
              )}
              {latestScan && (
                <>
                  <div className="scan-heading">
                    <Badge status={latestScan.status} />
                    <span>
                      {latestScan.findings?.elements.length ?? 0} aday öğe ·
                      Etiketler demo öğretim verisinden alınır
                    </span>
                  </div>
                  {["queued", "running"].includes(latestScan.status) && (
                    <div className="empty" role="status">
                      <LoaderCircle size={30} className="spin" />
                      <p>Worker demo sayfalarını inceliyor…</p>
                    </div>
                  )}
                  {latestScan.status === "failed" && (
                    <div className="empty">
                      <XCircle />
                      <p>
                        Keşif tamamlanamadı. Fixture ve worker süreçlerini
                        kontrol et.
                      </p>
                    </div>
                  )}
                  {latestScan.findings?.elements.map((element) => (
                    <label className="mapping-row" key={element.id}>
                      <input
                        type="checkbox"
                        disabled={latestScan.status !== "awaiting_review"}
                        checked={
                          latestScan.status === "approved"
                            ? !!data?.model?.elements.find(
                                (e) => e.id === element.id,
                              )?.approved
                            : approved.includes(element.id)
                        }
                        onChange={(e) =>
                          setApproved((old) =>
                            e.target.checked
                              ? [...old, element.id]
                              : old.filter((id) => id !== element.id),
                          )
                        }
                      />
                      <div className="mapping-icon">
                        <Boxes size={18} />
                      </div>
                      <div>
                        <strong>{element.label}</strong>
                        <span>
                          {element.page === "login"
                            ? "Giriş sayfası"
                            : "Dashboard"}{" "}
                          · {element.id}
                        </span>
                      </div>
                      <code>{element.locator.value}</code>
                      <span className="small-tag">
                        {latestScan.status === "approved"
                          ? "İncelendi"
                          : "Aday"}
                      </span>
                    </label>
                  ))}
                  {latestScan.status === "awaiting_review" && (
                    <div className="editor-footer">
                      <span>Giriş alanları ve Dashboard zorunludur.</span>
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          ![
                            "login.username",
                            "login.password",
                            "login.submit",
                            "dashboard.heading",
                          ].every((id) => approved.includes(id))
                        }
                        onClick={() =>
                          action(async () => {
                            await api(
                              `/v1/projects/${projectId}/mappings/review`,
                              "POST",
                              { scanId: latestScan.id, approvedIds: approved },
                            );
                            setSection("tests");
                            setPublished(null);
                          })
                        }
                      >
                        <Check size={16} /> Seçilen eşlemeleri onayla
                      </button>
                    </div>
                  )}
                  {latestScan.status === "approved" && (
                    <div className="editor-footer">
                      <span>
                        <CheckCircle2 size={16} /> Model v
                        {data?.model?.revision} kayıtlı. Önceki sürümler
                        korunur.
                      </span>
                      <button
                        className="primary"
                        onClick={() => setSection("tests")}
                      >
                        Test tasarla <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {section === "elements" && (
            <ElementRegistry
              projectId={projectId}
              model={data?.model ?? null}
              canEdit={actor.role !== "viewer"}
              onSaved={refresh}
              onDiscover={() => setSection("model")}
            />
          )}
          {section === "tests" && (
            <>
              <AiSuiteList
                projectId={projectId}
                canEdit={actor.role !== "viewer"}
                onOpen={() => setSection("assistant")}
              />
              <div className="designer-grid">
                <section className="card editor-card">{editor}</section>
                <aside className="test-side">
                  <section className="card">
                    <div className="card-heading">
                      <h2>Çalıştırma ortamı</h2>
                      <Play size={16} />
                    </div>
                    <label className="field">
                      Demo kontrolü
                      <select
                        value={variant}
                        onChange={(e) => setVariant(e.target.value as Variant)}
                      >
                        {Object.entries(variantLabels).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="hint">
                      Olumsuz kontroller, gerçek uygulama hatalarının PASS
                      olarak görünmediğini sınar.
                    </p>
                    <div className="runtime-detail">
                      <span>Tarayıcı</span>
                      <strong>Chromium</strong>
                    </div>
                    <div className="runtime-detail">
                      <span>Yürütme</span>
                      <strong>Ayrı worker</strong>
                    </div>
                    <div className="runtime-detail">
                      <span>Kanıt</span>
                      <strong>Ekran görüntüsü</strong>
                    </div>
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <h2>Klasik yayınlanan testler</h2>
                      <span className="small-tag">
                        {data?.tests.length ?? 0}
                      </span>
                    </div>
                    {data?.tests.length ? (
                      data.tests.map((test) => (
                        <button
                          className={`test-item ${published?.testId === test.testId ? "selected-test" : ""}`}
                          key={`${test.testId}:${test.revision}`}
                          onClick={() => setPublished(test)}
                        >
                          <FileCheck2 size={18} />
                          <span>
                            <strong>{test.title}</strong>
                            <small>
                              Test v{test.revision} · Model v
                              {test.appModelRef.revision}
                            </small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p className="hint">
                        İlk testini yayınladığında burada görünecek.
                      </p>
                    )}
                    {published && (
                      <button
                        className="text-button"
                        onClick={() => setPublished(null)}
                      >
                        <Plus size={14} /> Yeni taslak oluştur
                      </button>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
          {section === "runs" && (
            <>
              <section className="card">
                <div className="card-heading">
                  <h2>Çalıştırma geçmişi</h2>
                  <span className="small-tag">
                    Son {data?.runs.length ?? 0} çalıştırma
                  </span>
                </div>
                {!data?.runs.length ? (
                  <div className="empty">
                    <Play size={30} />
                    <h3>Henüz test çalıştırılmadı</h3>
                    <p>Bir test yayınla ve gerçek tarayıcıda çalıştır.</p>
                    <button
                      className="secondary"
                      onClick={() => setSection("tests")}
                    >
                      Testlere git <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Test / sürüm</th>
                          <th>Demo kontrolü</th>
                          <th>Durum</th>
                          <th>Başlangıç</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.runs.map((row) => (
                          <tr
                            key={row.id}
                            className={runId === row.id ? "selected-row" : ""}
                          >
                            <td>
                              <strong>
                                {data.tests.find(
                                  (t) => t.testId === row.test_id,
                                )?.title ?? "Test"}
                              </strong>
                              <small>
                                v{row.revision} · {row.id.slice(0, 8)}
                              </small>
                            </td>
                            <td>{variantLabels[row.variant]}</td>
                            <td>
                              <Badge status={row.status} />
                            </td>
                            <td>{time(row.created_at)}</td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`${row.id.slice(0, 8)} çalıştırma ayrıntıları`}
                                onClick={() => setRunId(row.id)}
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
              </section>
              {run && (
                <section className="card result-card">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">
                        ÇALIŞTIRMA AYRINTISI · {run.id.slice(0, 8)}
                      </span>
                      <h2>Beklenen sonuç ve gözlenen kanıt</h2>
                    </div>
                    <Badge status={run.status} />
                  </div>
                  <div className="run-meta">
                    <span>Test v{run.plan.testRevision}</span>
                    <span>Model v{run.plan.modelRevision}</span>
                    <span>
                      {run.outcome?.assertionsExecuted ?? 0} assertion yürütüldü
                    </span>
                    <code title={run.plan.checksum}>
                      SHA-256 {run.plan.checksum.slice(0, 12)}…
                    </code>
                  </div>
                  {["queued", "running"].includes(run.status) && (
                    <div className="running-state">
                      <LoaderCircle className="spin" size={20} />
                      <p>
                        Worker sonucu bekleniyor. Bu aşamada başarı varsayılmaz.
                      </p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            await api(`/v1/runs/${run.id}/cancel`, "POST");
                          })
                        }
                      >
                        İptal et
                      </button>
                    </div>
                  )}
                  {run.outcome?.code && (
                    <div className="result-code">
                      <Terminal size={16} />
                      {run.outcome.code}
                    </div>
                  )}
                  <div className="result-grid">
                    <div className="result-steps">
                      {run.outcome?.steps.map((step) => (
                        <div className="result-step" key={step.id}>
                          {step.status === "passed" ? (
                            <CheckCircle2 size={18} className="green" />
                          ) : (
                            <XCircle size={18} className="red" />
                          )}
                          <div>
                            <strong>{step.label}</strong>
                            {step.expected !== undefined && (
                              <p>
                                Beklenen: <b>{String(step.expected)}</b> ·
                                Gözlenen:{" "}
                                <b>{String(step.observed ?? "Yok")}</b>
                              </p>
                            )}
                            {step.code && <small>{step.code}</small>}
                          </div>
                          <span>{step.durationMs} ms</span>
                        </div>
                      ))}
                      {run.outcome && !run.outcome.steps.length && (
                        <p className="hint">
                          Bu sonuçta adım yürütme kanıtı yok. Başarılı test
                          sayılmaz.
                        </p>
                      )}
                    </div>
                    <div className="evidence">
                      {run.outcome?.screenshot ? (
                        <>
                          <a
                            href={`/api/v1/runs/${run.id}/screenshot`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              alt="Gerçek test tarayıcısının son ekran görüntüsü"
                              src={`/api/v1/runs/${run.id}/screenshot`}
                            />
                          </a>
                          <span>
                            <ShieldCheck size={13} /> SHA-256 doğrulamalı · Form
                            alanları maskeli
                          </span>
                        </>
                      ) : (
                        <div className="empty compact">
                          <Layers3 size={25} />
                          <p>
                            Ekran görüntüsü{" "}
                            {run.outcome
                              ? "mevcut değil."
                              : "sonuçla birlikte oluşacak."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              zero<span>code</span> <span className="footer-separator">/</span>{" "}
              İnsan niyeti. Açık doğrulama. Gerçek kanıt.
            </span>
            <span>Yerel prototip · Üretim kullanımı için hazır değil</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
