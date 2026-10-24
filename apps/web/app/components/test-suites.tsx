"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import "../test-cases.css";

type Locator = { kind: string; value: string; role?: string };
type StepElement = {
  id: string;
  elementKey: string;
  name: string;
  pageUrl: string;
  approved: boolean;
  revision: number;
  verification: string;
  mergedInto: string | null;
  locator: Locator;
  pinnedRevision: number | null;
};
type StepDef = {
  id: string;
  kind: string;
  elementId?: string;
  value?: string;
  expected?: string;
  url?: string;
  ignore?: string[];
  impact?: "critical" | "serious";
  unresolved?: { reason: string; message: string; label?: string };
};
type Definition = {
  description: string;
  preconditions: string[];
  testData: { name: string; value: string }[];
  expectedResults: string[];
  steps: StepDef[];
};
type CaseRun = {
  id: string;
  status: string;
  revision: number;
  createdAt: string;
  finishedAt: string | null;
};
export type TestCase = {
  id: string;
  suiteId: string;
  title: string;
  category: string;
  revision: number;
  approval: "draft" | "approved";
  approvedRevision: number | null;
  approvedAt: string | null;
  aiGenerated: boolean;
  updatedAt: string;
  definition: Definition;
  steps: (StepDef & { element: StepElement | null })[];
  issues: { step: number | null; code: string; message: string }[];
  complete: boolean;
  stale: boolean;
  lastRun: CaseRun | null;
};
type Suite = {
  id: string;
  title: string;
  targetUrl: string;
  origin: string;
  aiGenerated: boolean;
  model: string | null;
  prompt: string | null;
  notes: string[];
  updatedAt: string;
  cases: TestCase[];
  counts: { cases: number; approved: number; incomplete: number };
};
type LibraryElement = {
  id: string;
  elementKey: string;
  name: string;
  label: string;
  pageUrl: string;
  approved: boolean;
  revision: number;
  verification?: string;
};
type RunDetail = {
  id: string;
  status: string;
  caseRevision: number;
  createdAt: string;
  finishedAt: string | null;
  result: {
    code?: string;
    message?: string;
    results?: {
      status: string;
      code?: string;
      steps: {
        kind: string;
        status: string;
        code?: string;
        message?: string;
        element?: string;
        elementName?: string;
        healed?: unknown;
        screenshot?: { sha256: string };
      }[];
      screenshot?: { sha256: string };
    }[];
  } | null;
  snapshot: {
    title: string;
    checksum: string;
    elements: {
      ref: string;
      elementId: string;
      elementKey: string;
      name: string;
      revision: number;
    }[];
  };
};

export const stepKinds: { id: string; label: string }[] = [
  { id: "navigate", label: "Sayfaya git" },
  { id: "click", label: "Tıkla" },
  { id: "fill", label: "Doldur" },
  { id: "select", label: "Seç" },
  { id: "assertVisible", label: "Görünür olmalı" },
  { id: "assertText", label: "Metin eşit olmalı" },
  { id: "assertUrl", label: "URL eşit olmalı" },
  { id: "assertNoConsoleErrors", label: "Konsol hatası yok" },
  { id: "assertNoBrokenLinks", label: "Kırık bağlantı yok" },
  { id: "assertAccessible", label: "Erişilebilirlik taraması" },
];
const kindLabel = (kind: string) =>
  stepKinds.find((k) => k.id === kind)?.label ?? kind;
const elementKinds = new Set([
  "click",
  "fill",
  "select",
  "assertVisible",
  "assertText",
]);
const categoryLabels: Record<string, string> = {
  positive: "Pozitif",
  negative: "Negatif",
  edge: "Sınır",
};
const statusLabels: Record<string, string> = {
  queued: "Kuyrukta",
  running: "Çalışıyor",
  passed: "Başarılı",
  failed: "Başarısız",
  blocked: "Engellendi",
  infrastructure_error: "Altyapı hatası",
  cancelled: "İptal",
};
const verificationLabels: Record<string, string> = {
  verified: "doğrulandı",
  failed: "doğrulanamadı",
  unverified: "doğrulanmadı",
};
const when = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
const terminal = (status: string) => !["queued", "running"].includes(status);
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function RunBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {!terminal(status) && <LoaderCircle size={12} className="spin" />}
      {statusLabels[status] ?? status}
    </span>
  );
}
function CaseState({ testCase }: { testCase: TestCase }) {
  if (!testCase.complete) return <span className="badge failed">Eksik</span>;
  if (testCase.approval === "approved")
    return (
      <span className="badge approved">
        <CheckCircle2 size={12} /> Onaylı v{testCase.approvedRevision}
      </span>
    );
  return <span className="badge awaiting_review">Taslak</span>;
}

/**
 * Tests: suites and their cases (ADR 017). AI exploration creates a draft
 * suite; element steps are bound to library records by id.
 */
export function TestSuites({
  projectId,
  canEdit,
  focusCaseId,
  onFocusHandled,
  onOpenElement,
  onOpenRuns,
}: {
  projectId: string;
  canEdit: boolean;
  focusCaseId?: string;
  onFocusHandled?: () => void;
  onOpenElement: (elementId: string) => void;
  onOpenRuns?: () => void;
}) {
  const root = `/v1/projects/${projectId}`;
  const [suites, setSuites] = useState<Suite[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSuite, setNewSuite] = useState({ title: "", targetUrl: "" });

  const reload = useCallback(async () => {
    const data = await api<{ suites: Suite[] }>(`${root}/test-suites`);
    setSuites(data.suites);
    return data.suites;
  }, [root]);
  useEffect(() => {
    void reload()
      .then((list) => {
        if (list[0]) setOpen((current) => new Set([...current, list[0]!.id]));
      })
      .catch((e) => setError(String(e)));
  }, [reload]);
  // Pending runs refresh the list until they finish.
  const pending = (suites ?? []).some((s) =>
    s.cases.some((c) => c.lastRun && !terminal(c.lastRun.status)),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload().catch(() => undefined), 2000);
    return () => clearInterval(timer);
  }, [pending, reload]);
  // Opened from an element's "Kullanan test case'leri".
  useEffect(() => {
    if (!focusCaseId || !suites) return;
    const suite = suites.find((s) => s.cases.some((c) => c.id === focusCaseId));
    if (suite) {
      setOpen((current) => new Set([...current, suite.id]));
      setSelected(focusCaseId);
      setTimeout(
        () =>
          document
            .getElementById(`case-editor-${focusCaseId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        50,
      );
    } else setError("Test case bulunamadı ya da silinmiş.");
    onFocusHandled?.();
  }, [focusCaseId, suites, onFocusHandled]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const runSuite = (suite: Suite) =>
    act(`suite-run:${suite.id}`, async () => {
      const result = await api<{
        runs: { id: string }[];
        skipped: { title: string; reason: string }[];
      }>(`${root}/test-suites/${suite.id}/runs`, "POST");
      setNotice(
        `${result.runs.length} case kuyruğa alındı.${result.skipped.length ? ` Atlanan: ${result.skipped.map((s) => `${s.title} (${s.reason === "incomplete" ? "eksik" : "onaysız"})`).join(", ")}.` : ""}`,
      );
      await reload();
    });
  const addCase = (suite: Suite) =>
    act(`suite-add:${suite.id}`, async () => {
      const created = await api<{ case: TestCase }>(
        `${root}/test-suites/${suite.id}/cases`,
        "POST",
        { title: "Yeni test case", category: "positive" },
      );
      await reload();
      setSelected(created.case.id);
    });
  const removeSuite = (suite: Suite) =>
    act(`suite-del:${suite.id}`, async () => {
      if (
        !window.confirm(
          `"${suite.title}" suite'i ve ${suite.cases.length} case silinsin mi? Çalıştırma geçmişi korunur.`,
        )
      )
        return;
      await api(`${root}/test-suites/${suite.id}`, "DELETE");
      await reload();
    });
  const createSuite = () =>
    act("suite-create", async () => {
      const created = await api<{ suite: Suite }>(
        `${root}/test-suites`,
        "POST",
        newSuite,
      );
      setCreating(false);
      setNewSuite({ title: "", targetUrl: "" });
      await reload();
      setOpen((current) => new Set([...current, created.suite.id]));
    });

  const selectedCase = useMemo(() => {
    for (const suite of suites ?? []) {
      const found = suite.cases.find((c) => c.id === selected);
      if (found) return { suite, testCase: found };
    }
    return null;
  }, [suites, selected]);

  return (
    <section className="card tc-card" aria-label="Test suite'leri">
      <div className="card-heading">
        <div>
          <span className="eyebrow">TESTS</span>
          <h2>Test suite'leri ve case'ler</h2>
        </div>
        <div className="tc-heading-actions">
          <span className="small-tag">{suites?.length ?? 0} suite</span>
          <button
            className="secondary"
            disabled={!canEdit}
            onClick={() => setCreating((v) => !v)}
          >
            <Plus size={14} /> Yeni suite
          </button>
        </div>
      </div>
      <p className="hint tc-intro">
        AI Test Assistant keşfi bittiğinde suite burada taslak olarak
        kaydedilir. Element kullanan her adım, Elementler kütüphanesindeki bir
        kayda bağlıdır. Case çalıştırmadan önce onaylanır; onay, bağlı
        elementlerin o anki sürümünü pinler ve çalıştırma bu sürümleri kullanır.
      </p>
      {creating && (
        <div className="tc-new-suite">
          <label className="field">
            Suite adı
            <input
              value={newSuite.title}
              onChange={(e) =>
                setNewSuite({ ...newSuite, title: e.target.value })
              }
              placeholder="Örn. Sepet akışları"
            />
          </label>
          <label className="field">
            Hedef URL (yetkili site)
            <input
              value={newSuite.targetUrl}
              onChange={(e) =>
                setNewSuite({ ...newSuite, targetUrl: e.target.value })
              }
              placeholder="https://www.saucedemo.com/"
            />
          </label>
          <button
            className="primary"
            disabled={
              busy === "suite-create" ||
              newSuite.title.trim().length < 3 ||
              !newSuite.targetUrl
            }
            onClick={() => void createSuite()}
          >
            Oluştur
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="tc-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error tc-error">
          {error}
        </p>
      )}
      {suites && !suites.length && (
        <p className="hint tc-intro">
          Henüz suite yok. AI Test Assistant'ta hedef siteyi ve isteğini yaz;
          keşif bitince taslak suite burada görünür.
        </p>
      )}
      {(suites ?? []).map((suite) => {
        const isOpen = open.has(suite.id);
        return (
          <div className="tc-suite" key={suite.id}>
            <div className="tc-suite-head">
              <button
                type="button"
                className="tc-suite-toggle"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(suite.id)) next.delete(suite.id);
                    else next.add(suite.id);
                    return next;
                  })
                }
              >
                <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                <strong>{suite.title}</strong>
                {suite.aiGenerated && (
                  <span className="badge tc-ai" title={suite.model ?? ""}>
                    <Sparkles size={11} /> AI
                  </span>
                )}
                <small>
                  {suite.origin} · {suite.counts.cases} case ·{" "}
                  {suite.counts.approved} onaylı
                  {suite.counts.incomplete
                    ? ` · ${suite.counts.incomplete} eksik`
                    : ""}{" "}
                  · {when(suite.updatedAt)}
                </small>
              </button>
              <div className="tc-suite-actions">
                <button
                  className="secondary"
                  disabled={
                    !canEdit ||
                    !suite.counts.approved ||
                    busy === `suite-run:${suite.id}`
                  }
                  title="Onaylı ve eksiksiz case'leri çalıştır"
                  onClick={() => void runSuite(suite)}
                >
                  <Play size={14} /> Suite'i çalıştır
                </button>
                <button
                  className="secondary"
                  disabled={!canEdit || busy === `suite-add:${suite.id}`}
                  onClick={() => void addCase(suite)}
                >
                  <Plus size={14} /> Case ekle
                </button>
                <button
                  className="secondary"
                  aria-label={`${suite.title} suite'ini sil`}
                  disabled={!canEdit}
                  onClick={() => void removeSuite(suite)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {isOpen && (
              <>
                {suite.prompt && (
                  <p className="tc-prompt">
                    <b>İstek:</b> {suite.prompt}
                  </p>
                )}
                {suite.notes.length > 0 && (
                  <ul className="tc-notes">
                    {suite.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
                <table className="tc-table">
                  <thead>
                    <tr>
                      <th>Test case</th>
                      <th>Tür</th>
                      <th>Durum</th>
                      <th>Son çalışma</th>
                      <th>Son düzenleme</th>
                      <th>
                        <span className="sr-only">İşlem</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {suite.cases.map((testCase) => (
                      <tr
                        key={testCase.id}
                        className={
                          selected === testCase.id ? "tc-row-selected" : ""
                        }
                      >
                        <td>
                          <strong>{testCase.title}</strong>
                          <small>
                            {testCase.steps.length} adım
                            {testCase.aiGenerated ? " · AI ile üretildi" : ""}
                            {testCase.stale ? " · güncel olmayan element" : ""}
                          </small>
                        </td>
                        <td>{categoryLabels[testCase.category]}</td>
                        <td>
                          <CaseState testCase={testCase} />
                        </td>
                        <td>
                          {testCase.lastRun ? (
                            <RunBadge status={testCase.lastRun.status} />
                          ) : (
                            <small>Çalıştırılmadı</small>
                          )}
                        </td>
                        <td>{when(testCase.updatedAt)}</td>
                        <td>
                          <button
                            className="secondary"
                            aria-expanded={selected === testCase.id}
                            onClick={() =>
                              setSelected(
                                selected === testCase.id ? "" : testCase.id,
                              )
                            }
                          >
                            {selected === testCase.id ? "Kapat" : "Aç"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedCase?.suite.id === suite.id && (
                  <CaseEditor
                    key={`${selectedCase.testCase.id}:${selectedCase.testCase.revision}:${selectedCase.testCase.approval}`}
                    projectId={projectId}
                    suite={suite}
                    testCase={selectedCase.testCase}
                    canEdit={canEdit}
                    onChanged={async (next) => {
                      const list = await reload();
                      if (next === null) setSelected("");
                      else if (next) setSelected(next);
                      return list;
                    }}
                    onClose={() => setSelected("")}
                    onOpenElement={onOpenElement}
                    onOpenRuns={onOpenRuns}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

function CaseEditor({
  projectId,
  suite,
  testCase,
  canEdit,
  onChanged,
  onClose,
  onOpenElement,
  onOpenRuns,
}: {
  projectId: string;
  suite: Suite;
  testCase: TestCase;
  canEdit: boolean;
  /** Reloads the list; a string selects that case, null closes the editor. */
  onChanged: (select?: string | null) => Promise<unknown>;
  onClose: () => void;
  onOpenElement: (elementId: string) => void;
  onOpenRuns?: () => void;
}) {
  const root = `/v1/projects/${projectId}`;
  const [title, setTitle] = useState(testCase.title);
  const [category, setCategory] = useState(testCase.category);
  const [description, setDescription] = useState(
    testCase.definition.description,
  );
  const [preconditions, setPreconditions] = useState(
    testCase.definition.preconditions.join("\n"),
  );
  const [expectedResults, setExpectedResults] = useState(
    testCase.definition.expectedResults.join("\n"),
  );
  const [testData, setTestData] = useState(testCase.definition.testData);
  const [steps, setSteps] = useState<StepDef[]>(testCase.definition.steps);
  const [library, setLibrary] = useState<LibraryElement[]>([]);
  const [elementSearch, setElementSearch] = useState("");
  const [elementPage, setElementPage] = useState("");
  const [runs, setRuns] = useState<CaseRun[]>([]);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void api<{ elements: LibraryElement[] }>(
      `${root}/ai/elements?origin=${encodeURIComponent(suite.origin)}&limit=500`,
    )
      .then((data) => setLibrary(data.elements))
      .catch((e) => setError(String(e)));
  }, [root, suite.origin]);
  const loadRuns = useCallback(async () => {
    const detail = await api<{
      runs: (Omit<CaseRun, "revision"> & { caseRevision: number })[];
    }>(`${root}/test-cases/${testCase.id}`);
    const list = detail.runs.map(({ caseRevision, ...r }) => ({
      ...r,
      revision: caseRevision,
    }));
    setRuns(list);
    return list;
  }, [root, testCase.id]);
  useEffect(() => {
    void loadRuns()
      .then((list) => {
        if (list[0]) void openRun(list[0].id);
      })
      .catch((e) => setError(String(e)));
    // openRun is stable enough: it only reads root.
  }, [loadRuns]);
  const openRun = async (id: string) => {
    try {
      setRun(await api<RunDetail>(`${root}/test-case-runs/${id}`));
    } catch (e) {
      setError(String(e));
    }
  };
  // Latest callbacks for the poller without restarting it on every render.
  const refresh = useRef({ loadRuns, onChanged });
  refresh.current = { loadRuns, onChanged };
  const runId = run?.id;
  const runPending = !!run && !terminal(run.status);
  useEffect(() => {
    if (!runId || !runPending) return;
    let active = true;
    const timer = setInterval(() => {
      void api<RunDetail>(`${root}/test-case-runs/${runId}`)
        .then((next) => {
          if (!active) return;
          setRun((current) => (current?.id === next.id ? next : current));
          if (terminal(next.status)) {
            void refresh.current.loadRuns();
            void refresh.current.onChanged();
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [root, runId, runPending]);

  const definition: Definition = {
    description: description.trim(),
    preconditions: lines(preconditions),
    testData: testData.filter((row) => row.name.trim()),
    expectedResults: lines(expectedResults),
    steps,
  };
  const dirty =
    title !== testCase.title ||
    category !== testCase.category ||
    JSON.stringify(definition) !== JSON.stringify(testCase.definition);
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const pages = useMemo(
    () => [...new Set(library.map((e) => e.pageUrl))],
    [library],
  );
  const filteredLibrary = useMemo(
    () =>
      library.filter((element) => {
        const query = elementSearch.trim().toLocaleLowerCase("tr");
        return (
          (!elementPage || element.pageUrl === elementPage) &&
          (!query ||
            `${element.name} ${element.label} ${element.elementKey} ${element.pageUrl}`
              .toLocaleLowerCase("tr")
              .includes(query))
        );
      }),
    [library, elementSearch, elementPage],
  );
  const currentIssues = useMemo(() => {
    const issues: string[] = [];
    if (title.trim().length < 3) issues.push("Başlık en az 3 karakter olmalı.");
    if (!steps.some((step) => step.kind.startsWith("assert")))
      issues.push("En az bir doğrulama (assertion) adımı gerekli.");
    steps.forEach((step, index) => {
      if (elementKinds.has(step.kind) && !step.elementId)
        issues.push(`Adım ${index + 1}: Element seçilmedi.`);
      if (step.kind === "navigate" && !step.url?.trim())
        issues.push(`Adım ${index + 1}: Hedef URL gerekli.`);
      if (step.kind === "assertUrl" && !step.expected?.trim())
        issues.push(`Adım ${index + 1}: Beklenen URL gerekli.`);
      if (step.kind === "assertText" && !step.expected?.trim())
        issues.push(`Adım ${index + 1}: Beklenen metin gerekli.`);
      if (step.kind === "select" && !step.value?.trim())
        issues.push(`Adım ${index + 1}: Seçilecek değer gerekli.`);
    });
    return issues;
  }, [title, steps]);
  const stepElement = (stepId: string) =>
    testCase.steps.find((s) => s.id === stepId)?.element ?? null;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };
  const save = () =>
    act("save", async () => {
      await api(`${root}/test-cases/${testCase.id}`, "PUT", {
        expectedRevision: testCase.revision,
        title: title.trim(),
        category,
        definition,
      });
      await onChanged(testCase.id);
    });
  const approve = () =>
    act("approve", async () => {
      await api(`${root}/test-cases/${testCase.id}/approve`, "POST", {
        expectedRevision: testCase.revision,
      });
      await onChanged(testCase.id);
    });
  const start = () =>
    act("run", async () => {
      const queued = await api<{ id: string }>(
        `${root}/test-cases/${testCase.id}/runs`,
        "POST",
      );
      await loadRuns();
      await openRun(queued.id);
      await onChanged();
    });
  const duplicate = () =>
    act("copy", async () => {
      const copy = await api<{ case: TestCase }>(
        `${root}/test-cases/${testCase.id}/duplicate`,
        "POST",
      );
      await onChanged(copy.case.id);
    });
  const remove = () =>
    act("delete", async () => {
      if (
        !window.confirm(
          `"${testCase.title}" silinsin mi? Çalıştırma geçmişi korunur.`,
        )
      )
        return;
      await api(`${root}/test-cases/${testCase.id}`, "DELETE");
      await onChanged(null);
    });

  const update = (index: number, patch: Partial<StepDef>) =>
    setSteps((current) =>
      current.map((step, i) => {
        if (i !== index) return step;
        const next = { ...step, ...patch };
        // Changing the kind drops fields the new kind does not use.
        if (patch.kind) {
          if (!elementKinds.has(patch.kind)) {
            delete next.elementId;
            delete next.unresolved;
          }
          if (!["fill", "select"].includes(patch.kind)) delete next.value;
          if (!["assertText", "assertUrl"].includes(patch.kind))
            delete next.expected;
          if (patch.kind !== "navigate") delete next.url;
          if (patch.kind === "assertUrl" && !next.expected)
            next.expected = suite.targetUrl;
          if (patch.kind === "navigate" && !next.url)
            next.url = suite.targetUrl;
          if (["fill", "select"].includes(patch.kind) && next.value == null)
            next.value = "";
        }
        if (patch.elementId) delete next.unresolved;
        return next;
      }),
    );
  const move = (index: number, by: number) =>
    setSteps((current) => {
      const next = [...current];
      const [step] = next.splice(index, 1);
      next.splice(index + by, 0, step!);
      return next;
    });
  const editable = canEdit && !busy;
  const runnable =
    testCase.approval === "approved" &&
    testCase.complete &&
    !dirty &&
    !currentIssues.length;

  return (
    <div className="tc-editor" id={`case-editor-${testCase.id}`}>
      <div className="tc-editor-head">
        <div>
          <span className="eyebrow">TEST CASE · v{testCase.revision}</span>
          <h3>{testCase.title}</h3>
          <small>
            {testCase.aiGenerated ? "AI ile üretildi · " : ""}Son düzenleme{" "}
            {when(testCase.updatedAt)}
            {testCase.approvedAt ? ` · onay ${when(testCase.approvedAt)}` : ""}
          </small>
        </div>
        <div className="tc-editor-badges">
          <CaseState testCase={testCase} />
          {testCase.stale && (
            <span
              className="badge awaiting_review"
              title="Onayda pinlenen bir elementin daha yeni sürümü var. Güncel sürümü kullanmak için case'i yeniden kaydedip onaylayın."
            >
              güncel olmayan element
            </span>
          )}
          <button
            className="secondary"
            aria-label="Düzenleyiciyi kapat"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Kaydedilmemiş değişiklikleri iptal edip çıkmak istiyor musunuz?",
                )
              )
                onClose();
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="tc-grid">
        <label className="field">
          Başlık
          <input
            value={title}
            maxLength={160}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Tür
          <select
            value={category}
            disabled={!editable}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(categoryLabels).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Açıklama
        <textarea
          rows={2}
          maxLength={500}
          value={description}
          disabled={!editable}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="tc-grid">
        <label className="field">
          Ön koşullar (her satır bir koşul)
          <textarea
            rows={3}
            value={preconditions}
            disabled={!editable}
            onChange={(e) => setPreconditions(e.target.value)}
          />
        </label>
        <label className="field">
          Beklenen sonuçlar (her satır bir sonuç)
          <textarea
            rows={3}
            value={expectedResults}
            disabled={!editable}
            onChange={(e) => setExpectedResults(e.target.value)}
          />
        </label>
      </div>
      <fieldset className="tc-data">
        <legend>Test verileri</legend>
        <small>
          Gizli değerleri {"{{ANAHTAR}}"} ile yazın; gerçek değer Ayarlar → Test
          verilerinde şifreli saklanır ve yalnız çalıştırmada çözülür.
        </small>
        {testData.map((row, index) => (
          <div className="tc-data-row" key={index}>
            <input
              aria-label={`Test verisi ${index + 1} adı`}
              value={row.name}
              placeholder="Ad"
              disabled={!editable}
              onChange={(e) =>
                setTestData(
                  testData.map((r, i) =>
                    i === index ? { ...r, name: e.target.value } : r,
                  ),
                )
              }
            />
            <input
              aria-label={`Test verisi ${index + 1} değeri`}
              value={row.value}
              placeholder="Değer veya {{ANAHTAR}}"
              disabled={!editable}
              onChange={(e) =>
                setTestData(
                  testData.map((r, i) =>
                    i === index ? { ...r, value: e.target.value } : r,
                  ),
                )
              }
            />
            <button
              className="secondary"
              aria-label={`Test verisi ${index + 1} sil`}
              disabled={!editable}
              onClick={() =>
                setTestData(testData.filter((_, i) => i !== index))
              }
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          className="text-button tc-inline"
          disabled={!editable || testData.length >= 20}
          onClick={() => setTestData([...testData, { name: "", value: "" }])}
        >
          <Plus size={13} /> Veri ekle
        </button>
      </fieldset>
      <div className="tc-steps" role="group" aria-label="Adımlar">
        <div className="tc-steps-head">
          <strong>Adımlar</strong>
          <small>
            Element gerektiren adımlar kütüphanedeki kayda bağlanır; gezinme ve
            URL doğrulaması element istemez.
          </small>
        </div>
        <div className="tc-element-tools">
          <input
            aria-label="Element kütüphanesinde ara"
            placeholder="Element adı, anahtar veya sayfa ara"
            value={elementSearch}
            onChange={(e) => setElementSearch(e.target.value)}
          />
          <select
            aria-label="Element sayfasına göre filtrele"
            value={elementPage}
            onChange={(e) => setElementPage(e.target.value)}
          >
            <option value="">Tüm sayfalar</option>
            {pages.map((page) => (
              <option key={page} value={page}>
                {page}
              </option>
            ))}
          </select>
          <small>
            {filteredLibrary.length} / {library.length} element
          </small>
        </div>
        <table className="tc-table tc-step-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Aksiyon</th>
              <th>Element</th>
              <th>Değer / beklenen</th>
              <th>
                <span className="sr-only">Sıra</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const element = step.elementId
                ? (byId.get(step.elementId) ?? null)
                : null;
              const saved = stepElement(step.id);
              const shown =
                element ?? (saved?.id === step.elementId ? saved : null);
              return (
                <tr key={step.id}>
                  <td>{index + 1}</td>
                  <td>
                    <select
                      aria-label={`Adım ${index + 1} aksiyonu`}
                      value={step.kind}
                      disabled={!editable}
                      onChange={(e) => update(index, { kind: e.target.value })}
                    >
                      {stepKinds.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {elementKinds.has(step.kind) ? (
                      <div className="tc-element-cell">
                        <select
                          aria-label={`Adım ${index + 1} elementi`}
                          value={step.elementId ?? ""}
                          disabled={!editable}
                          onChange={(e) =>
                            update(index, {
                              elementId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">— Element seçin —</option>
                          {step.elementId &&
                            shown &&
                            !filteredLibrary.some(
                              (e) => e.id === step.elementId,
                            ) && (
                              <option value={step.elementId}>
                                {shown.name} ({shown.elementKey})
                              </option>
                            )}
                          {pages
                            .filter(
                              (page) => !elementPage || elementPage === page,
                            )
                            .map((page) => (
                              <optgroup key={page} label={page}>
                                {filteredLibrary
                                  .filter((e) => e.pageUrl === page)
                                  .map((e) => (
                                    <option key={e.id} value={e.id}>
                                      {e.name || e.label} ({e.elementKey})
                                      {e.approved ? " ✓" : ""}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                        {shown ? (
                          <small>
                            <button
                              type="button"
                              className="tc-link"
                              onClick={() => onOpenElement(shown.id)}
                            >
                              <ExternalLink size={11} /> {shown.elementKey}
                            </button>{" "}
                            v{shown.revision}
                            {saved?.pinnedRevision
                              ? ` · pinli v${saved.pinnedRevision}`
                              : ""}
                            {" · "}
                            {shown.approved ? "onaylı" : "onay bekliyor"}
                            {shown.verification
                              ? ` · ${verificationLabels[shown.verification] ?? shown.verification}`
                              : ""}
                          </small>
                        ) : step.unresolved ? (
                          <small className="tc-warning">
                            {step.unresolved.message}
                          </small>
                        ) : (
                          <small className="tc-warning">
                            Element bağlı değil.
                          </small>
                        )}
                      </div>
                    ) : (
                      <small>—</small>
                    )}
                  </td>
                  <td>
                    {["fill", "select"].includes(step.kind) && (
                      <input
                        aria-label={`Adım ${index + 1} değeri`}
                        value={step.value ?? ""}
                        placeholder="Değer veya {{ANAHTAR}}"
                        disabled={!editable}
                        onChange={(e) =>
                          update(index, { value: e.target.value })
                        }
                      />
                    )}
                    {["assertText", "assertUrl"].includes(step.kind) && (
                      <input
                        aria-label={`Adım ${index + 1} beklenen`}
                        value={step.expected ?? ""}
                        placeholder={
                          step.kind === "assertUrl"
                            ? suite.targetUrl
                            : "Beklenen metin"
                        }
                        disabled={!editable}
                        onChange={(e) =>
                          update(index, { expected: e.target.value })
                        }
                      />
                    )}
                    {step.kind === "navigate" && (
                      <input
                        aria-label={`Adım ${index + 1} URL`}
                        value={step.url ?? ""}
                        placeholder={suite.targetUrl}
                        disabled={!editable}
                        onChange={(e) => update(index, { url: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="tc-step-actions">
                    <button
                      className="secondary"
                      aria-label={`Adım ${index + 1} yukarı`}
                      disabled={!editable || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Adım ${index + 1} aşağı`}
                      disabled={!editable || index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Adım ${index + 1} sil`}
                      disabled={!editable || steps.length <= 1}
                      onClick={() =>
                        setSteps(steps.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          className="text-button tc-inline"
          disabled={!editable || steps.length >= 20}
          onClick={() => setSteps([...steps, { id: newId(), kind: "click" }])}
        >
          <Plus size={13} /> Adım ekle
        </button>
      </div>
      <div className="tc-live-check" role="status" aria-live="polite">
        <strong>
          {currentIssues.length
            ? `Taslakta ${currentIssues.length} eksik var`
            : "Taslak alanları hazır"}
        </strong>
        {currentIssues.length > 0 && (
          <ul>
            {currentIssues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
      {testCase.issues.length > 0 && (
        <ul className="tc-issues" aria-label="Eksikler">
          {testCase.issues.map((issue) => (
            <li key={`${issue.code}:${issue.step}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      {dirty && (
        <small className="tc-warning">
          Kaydedilmemiş değişiklik var. Kaydetmek yeni sürüm oluşturur ve onayı
          kaldırır; çalıştırmak için yeniden onaylayın.
        </small>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="tc-editor-actions">
        <button
          className="primary"
          disabled={!editable || !dirty || title.trim().length < 3}
          onClick={() => void save()}
        >
          <FileCheck2 size={14} /> Kaydet
        </button>
        <button
          className="secondary"
          disabled={
            !editable ||
            dirty ||
            !testCase.complete ||
            (testCase.approval === "approved" && !testCase.stale)
          }
          title={
            !testCase.complete
              ? "Eksikler giderilmeden onaylanamaz"
              : testCase.stale
                ? "Elementlerin güncel sürümlerini pinleyerek yeniden onaylayın"
                : "Adımları ve element seçimlerini onaylayın"
          }
          onClick={() => void approve()}
        >
          <CheckCircle2 size={14} />{" "}
          {testCase.approval === "approved" ? "Yeniden onayla" : "Onayla"}
        </button>
        <button
          className="secondary"
          disabled={!editable || !runnable}
          title={runnable ? "" : "Önce kaydedip onaylayın"}
          onClick={() => void start()}
        >
          <Play size={14} /> Çalıştır
        </button>
        <button
          className="secondary"
          disabled={!editable}
          onClick={() => void duplicate()}
        >
          <Copy size={14} /> Çoğalt
        </button>
        <button
          className="secondary"
          disabled={!editable}
          onClick={() => void remove()}
        >
          <Trash2 size={14} /> Sil
        </button>
      </div>
      <div className="tc-runs">
        <strong>Çalıştırmalar</strong>
        {!runs.length && <small>Bu case henüz çalıştırılmadı.</small>}
        <div className="tc-run-list">
          {runs.map((r) => (
            <button
              key={r.id}
              className={`secondary ${run?.id === r.id ? "tc-run-active" : ""}`}
              onClick={() => void openRun(r.id)}
            >
              <RunBadge status={r.status} /> v{r.revision} · {when(r.createdAt)}
            </button>
          ))}
          {onOpenRuns && runs.length > 0 && (
            <button className="text-button tc-inline" onClick={onOpenRuns}>
              Tüm çalıştırmalar
            </button>
          )}
        </div>
        {run && <RunResult projectId={projectId} run={run} />}
      </div>
    </div>
  );
}

function RunResult({ projectId, run }: { projectId: string; run: RunDetail }) {
  const root = `/v1/projects/${projectId}`;
  const scenario = run.result?.results?.[0];
  const names = new Map(
    run.snapshot.elements.map((e) => [
      e.ref,
      `${e.name} (${e.elementKey} v${e.revision})`,
    ]),
  );
  return (
    <div className="tc-run" aria-label="Çalıştırma sonucu">
      <div className="tc-run-head">
        <RunBadge status={run.status} />
        <small>
          Case v{run.caseRevision} · {when(run.createdAt)}
          {run.finishedAt
            ? ` · ${Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.createdAt))} ms`
            : ""}{" "}
          ·{" "}
          <code title={run.snapshot.checksum}>
            SHA-256 {run.snapshot.checksum.slice(0, 12)}…
          </code>
        </small>
        {terminal(run.status) && (
          <a
            className="tc-link"
            href={`/api${root}/reports/runs/case/${run.id}/report.html`}
          >
            HTML rapor
          </a>
        )}
      </div>
      {run.result?.code && !scenario?.steps.length && (
        <p className="tc-warning">
          {run.result.message ?? ""} ({run.result.code})
        </p>
      )}
      {scenario && (
        <ol className="tc-run-steps">
          {scenario.steps.map((step, index) => (
            <Fragment key={index}>
              <li className={step.status}>
                <span className={`badge ${step.status}`}>
                  {statusLabels[step.status] ?? step.status}
                </span>{" "}
                {kindLabel(step.kind)}
                {step.element
                  ? ` · ${names.get(step.element) ?? step.element}`
                  : ""}
                {step.code ? ` · ${step.code}` : ""}
                {step.message ? ` — ${step.message}` : ""}
                {step.healed ? " · alternatifle bulundu" : ""}
                {step.screenshot && (
                  <>
                    {" · "}
                    <a
                      className="tc-link"
                      target="_blank"
                      rel="noreferrer"
                      href={`/api${root}/test-case-runs/${run.id}/steps/${index}/screenshot`}
                    >
                      ekran görüntüsü
                    </a>
                  </>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      {scenario?.screenshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="tc-shot"
          alt="Senaryo sonu ekran görüntüsü"
          src={`/api${root}/test-case-runs/${run.id}/screenshot`}
        />
      )}
    </div>
  );
}
