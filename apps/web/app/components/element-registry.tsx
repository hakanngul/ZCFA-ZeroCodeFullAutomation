"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  FileCheck2,
  Fingerprint,
  GitBranch,
  History,
  Info,
  Layers3,
  LoaderCircle,
  Plus,
  Radar,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { AppModel, Element } from "../../../../packages/domain/src/index";
import {
  locatorKinds,
  locatorNames,
  locatorRoles,
  locatorDescription,
  type LocatorSpec,
  type LocatorCheck,
} from "../../../../packages/domain/src/locators";
import { api } from "../lib/api";

type Usage = {
  tests: {
    testId: string;
    title: string;
    revision: number;
    modelRevision: number;
  }[];
  flow: boolean;
};
const pageNames = { login: "Giriş sayfası", dashboard: "Dashboard" };
function makeLocator(kind: LocatorSpec["kind"], value = ""): LocatorSpec {
  return kind === "role" ? { kind, role: "button", value } : { kind, value };
}
function LocatorFields({
  value,
  onChange,
  prefix,
}: {
  value: LocatorSpec;
  onChange: (value: LocatorSpec) => void;
  prefix: string;
}) {
  const uid = useId();
  return (
    <div className="locator-fields">
      <div className="locator-field-row">
        <label htmlFor={`${uid}-kind`}>
          {prefix} türü
          <select
            id={`${uid}-kind`}
            aria-label={`${prefix} türü`}
            value={value.kind}
            onChange={(e) =>
              onChange(
                makeLocator(e.target.value as LocatorSpec["kind"], value.value),
              )
            }
          >
            {locatorKinds.map((kind) => (
              <option key={kind} value={kind}>
                {locatorNames[kind]}
              </option>
            ))}
          </select>
        </label>
        {value.kind === "role" && (
          <label htmlFor={`${uid}-role`}>
            ARIA role
            <select
              id={`${uid}-role`}
              aria-label={`${prefix} ARIA role`}
              value={value.role}
              onChange={(e) =>
                onChange({
                  ...value,
                  role: e.target.value as (typeof locatorRoles)[number],
                })
              }
            >
              {locatorRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label htmlFor={`${uid}-value`}>
        {prefix} değeri
        <input
          id={`${uid}-value`}
          value={value.value}
          maxLength={1000}
          spellCheck={false}
          placeholder={
            value.kind === "xpath"
              ? '//*[@data-testid="login-submit"]'
              : value.kind === "css"
                ? 'button[type="submit"]'
                : value.kind === "role"
                  ? "Giriş yap"
                  : "Locator değerini gir"
          }
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      </label>
      <code className="locator-preview">{locatorDescription(value)}</code>
    </div>
  );
}
export function ElementRegistry({
  projectId,
  model,
  canEdit,
  onSaved,
  onDiscover,
}: {
  projectId: string;
  model: AppModel | null;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onDiscover: () => void;
}) {
  const checkGeneration = useRef(0);
  const [search, setSearch] = useState(""),
    [pageFilter, setPageFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState<Element | null>(null),
    [existingId, setExistingId] = useState<string | null>(null),
    [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState<
      { revision: number; elements: number }[]
    >([]),
    [historical, setHistorical] = useState<{
      revision: number;
      elements: Element[];
    } | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null),
    [check, setCheck] = useState<LocatorCheck | null>(null),
    [checking, setChecking] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const elements = historical?.elements ?? model?.elements ?? [],
    revision = historical?.revision ?? model?.revision ?? 0;
  const readonly = !!historical || !canEdit;
  const open = (element: Element | null, rev = revision) => {
    checkGeneration.current++;
    setChecking(false);
    setForm(
      element
        ? structuredClone({
            ...element,
            alternatives: element.alternatives ?? [],
          })
        : {
            id: "",
            label: "",
            page: "login",
            locator: { kind: "role", role: "button", value: "" },
            alternatives: [],
            approved: false,
          },
    );
    setExistingId(element?.id ?? null);
    setBaseRevision(rev);
    setDirty(false);
    setError("");
    setMessage("");
    setCheckId(null);
    setCheck(null);
    if (element?.id !== existingId) setUsage(null);
  };
  useEffect(() => {
    if (dirty) return;
    const selected =
      elements.find((e) => e.id === existingId) ??
      elements.find((e) => e.id === "login.submit") ??
      elements[0];
    if (selected) open(selected, revision);
  }, [revision, historical]);
  useEffect(() => {
    let active = true;
    api<{ revisions: { revision: number; elements: number }[] }>(
      `/v1/projects/${projectId}/elements/history`,
    )
      .then((result) => {
        if (active) setHistory(result.revisions);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId, model?.revision]);
  useEffect(() => {
    if (!existingId) return;
    let active = true;
    api<Usage>(
      `/v1/projects/${projectId}/elements/${encodeURIComponent(existingId)}/usage`,
    )
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [existingId, model?.revision, projectId]);
  useEffect(() => {
    if (!checkId) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<LocatorCheck>(
          `/v1/projects/${projectId}/locator-checks/${checkId}`,
        );
        if (!active) return;
        setCheck(result);
        if (["queued", "running"].includes(result.status))
          timer = setTimeout(poll, 500);
        else setChecking(false);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setChecking(false);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [checkId, projectId]);
  function select(element: Element | null) {
    if (
      dirty &&
      !window.confirm(
        "Kaydedilmemiş değişiklikler var. Değişiklikleri bırakmak istiyor musun?",
      )
    )
      return;
    open(element);
  }
  function change(patch: Partial<Element>, locatorChanged = false) {
    setForm((old) =>
      old
        ? { ...old, ...patch, ...(locatorChanged ? { approved: false } : {}) }
        : old,
    );
    setDirty(true);
    setMessage("");
    if (locatorChanged) {
      checkGeneration.current++;
      setCheckId(null);
      setCheck(null);
      setChecking(false);
    }
  }
  async function save() {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AppModel>(
        `/v1/projects/${projectId}/elements${existingId ? "/" + encodeURIComponent(existingId) : ""}`,
        existingId ? "PUT" : "POST",
        { expectedRevision: baseRevision, element: form },
      );
      setHistorical(null);
      setBaseRevision(result.revision);
      setExistingId(form.id);
      setForm(result.elements.find((e) => e.id === form.id)!);
      setDirty(false);
      await onSaved();
      setMessage(
        `Kaydedildi · Model v${result.revision}. Önceki sürümler korundu.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function tryLocator() {
    if (!form) return;
    const generation = ++checkGeneration.current;
    setError("");
    setCheck(null);
    setChecking(true);
    try {
      const result = await api<{ id: string }>(
        `/v1/projects/${projectId}/locator-checks`,
        "POST",
        { page: form.page, locator: form.locator },
      );
      if (generation === checkGeneration.current) setCheckId(result.id);
    } catch (e) {
      if (generation !== checkGeneration.current) return;
      setError((e as Error).message);
      setChecking(false);
    }
  }
  async function chooseRevision(value: string) {
    if (
      dirty &&
      !window.confirm(
        "Kaydedilmemiş değişiklikleri bırakıp sürümü değiştirmek istiyor musun?",
      )
    )
      return;
    setDirty(false);
    setForm(null);
    setCheckId(null);
    setCheck(null);
    if (value === "latest") {
      setHistorical(null);
      return;
    }
    try {
      const result = await api<{ revision: number; elements: Element[] }>(
        `/v1/projects/${projectId}/elements?revision=${value}`,
      );
      setHistorical(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filtered = elements.filter(
    (e) =>
      (pageFilter === "all" || e.page === pageFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "approved") === e.approved) &&
      `${e.label} ${e.id} ${e.locator.value} ${(e.alternatives ?? []).map((l) => l.value).join(" ")}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const totalLocators = elements.reduce(
    (sum, e) => sum + 1 + (e.alternatives?.length ?? 0),
    0,
  );
  const valid =
    !!form &&
    /^[A-Za-z][A-Za-z0-9_.-]*$/.test(form.id) &&
    !!form.label.trim() &&
    [form.locator, ...(form.alternatives ?? [])].every((l) => !!l.value.trim());
  const result = check?.result && "count" in check.result ? check.result : null;
  return (
    <div className="element-workspace">
      <div className="element-toolbar">
        <div className="element-context">
          <span className="element-app-icon">
            <Boxes size={20} />
          </span>
          <div>
            <strong>
              Demo Bank <span>WEB</span>
            </strong>
            <small>Ortak element kütüphanesi · iki demo sayfası</small>
          </div>
        </div>
        <div className="element-toolbar-actions">
          <label className="revision-select">
            <History size={14} />
            <span className="sr-only">Model sürümü</span>
            <select
              aria-label="Model sürümü"
              value={historical ? String(historical.revision) : "latest"}
              onChange={(e) => void chooseRevision(e.target.value)}
            >
              <option value="latest">Güncel · v{model?.revision ?? 0}</option>
              {history.map((row) => (
                <option key={row.revision} value={row.revision}>
                  v{row.revision} · {row.elements} element
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={readonly || busy || checking}
            onClick={() => select(null)}
          >
            <Plus size={15} />
            Element ekle
          </button>
        </div>
      </div>
      {historical && (
        <div className="element-history-banner">
          <History size={16} />
          Model v{historical.revision} inceleniyor. Bu sürüm salt okunur.
          <button onClick={() => void chooseRevision("latest")}>
            Güncele dön <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="element-stats">
        <div>
          <span className="element-stat-icon">
            <Fingerprint size={20} />
          </span>
          <span>
            <strong>{elements.length.toString().padStart(2, "0")}</strong>
            <small>Merkezi element</small>
          </span>
          <p>Testlerden bağımsız, ortak kimlik</p>
        </div>
        <div>
          <span className="element-stat-icon approved">
            <ShieldCheck size={20} />
          </span>
          <span>
            <strong>
              {elements
                .filter((e) => e.approved)
                .length.toString()
                .padStart(2, "0")}
            </strong>
            <small>Onaylı eşleme</small>
          </span>
          <p>İnsan onayıyla kullanılabilir</p>
        </div>
        <div>
          <span className="element-stat-icon">
            <Code2 size={20} />
          </span>
          <span>
            <strong>{totalLocators.toString().padStart(2, "0")}</strong>
            <small>Locator tanımı</small>
          </span>
          <p>Birincil ve alternatif locator’lar</p>
        </div>
      </div>
      <div className="registry-layout">
        <section className="card registry-list">
          <div className="registry-list-heading">
            <div>
              <h2>
                Elementler <span>{elements.length}</span>
              </h2>
              <p>Bir kez tanımla, aynı öğeyi testlerinde kullan.</p>
            </div>
            <span className="small-tag">Model v{revision}</span>
          </div>
          <div className="element-filters">
            <label className="element-search">
              <Search size={15} />
              <input
                aria-label="Element ara"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad, anahtar veya locator ara…"
              />
            </label>
            <div>
              <select
                aria-label="Sayfa filtresi"
                value={pageFilter}
                onChange={(e) => setPageFilter(e.target.value)}
              >
                <option value="all">Tüm sayfalar</option>
                <option value="login">Giriş sayfası</option>
                <option value="dashboard">Dashboard</option>
              </select>
              <select
                aria-label="Onay filtresi"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tüm durumlar</option>
                <option value="approved">Onaylı</option>
                <option value="pending">Onay bekliyor</option>
              </select>
            </div>
          </div>
          {filtered.length ? (
            <div className="element-table-scroll">
              <table className="element-table">
                <thead>
                  <tr>
                    <th>Element / sayfa</th>
                    <th>Birincil locator</th>
                    <th>Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((element) => (
                    <tr
                      key={element.id}
                      className={
                        existingId === element.id ? "selected-element" : ""
                      }
                    >
                      <td>
                        <button
                          className="element-name-button"
                          onClick={() => select(element)}
                          aria-label={`${element.label} öğesini düzenle`}
                        >
                          <span className="element-row-icon">
                            {element.page === "login" ? (
                              <Fingerprint size={17} />
                            ) : (
                              <Layers3 size={17} />
                            )}
                          </span>
                          <span>
                            <strong>{element.label}</strong>
                            <code>{element.id}</code>
                            <small>{pageNames[element.page]}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="locator-kind-tag">
                          {locatorNames[element.locator.kind]}
                        </span>
                        <code
                          className="element-table-selector"
                          title={locatorDescription(element.locator)}
                        >
                          {element.locator.value}
                        </code>
                        <small>
                          {element.alternatives?.length
                            ? `+${element.alternatives.length} alternatif`
                            : "Tek locator"}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`element-status ${element.approved ? "approved" : "pending"}`}
                        >
                          {element.approved ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <History size={12} />
                          )}{" "}
                          {element.approved ? "Onaylı" : "Bekliyor"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="element-open"
                          aria-label={`${element.label} ayrıntıları`}
                          onClick={() => select(element)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <Search size={28} />
              <h3>
                {elements.length
                  ? "Eşleşen element yok"
                  : "Element kütüphaneni oluştur"}
              </h3>
              <p>
                {elements.length
                  ? "Arama veya filtreleri değiştirebilirsin."
                  : "Demo sayfalarını keşfet veya ilk elementini elle tanımla."}
              </p>
              {!elements.length && (
                <button className="secondary" onClick={onDiscover}>
                  <Radar size={15} />
                  Keşfe git
                </button>
              )}
            </div>
          )}
          <div className="registry-list-footer">
            <span>
              {filtered.length} / {elements.length} element
            </span>
            <span>
              <ShieldCheck size={13} />
              Alternatifler kendiliğinden devreye girmez.
            </span>
          </div>
          <div className="element-guide">
            <GitBranch size={20} />
            <div>
              <strong>Test, elementin ortak anahtarını kullanır.</strong>
              <p>
                HTML ID değişse bile <code>login.submit</code> kimliği korunur.
                Yeni eşleme yeni model sürümüne kaydedilir.
              </p>
            </div>
          </div>
        </section>
        <aside className="card element-inspector">
          <div className="inspector-heading">
            <div>
              <span className="eyebrow">ELEMENT AYRINTISI</span>
              <h2>
                {form?.label || "Yeni element"}
                {dirty && <span className="unsaved-dot" title="Kaydedilmedi" />}
              </h2>
            </div>
            <span className="small-tag">
              {historical
                ? "Salt okunur"
                : existingId
                  ? "Düzenle"
                  : "Yeni kayıt"}
            </span>
          </div>
          {error && (
            <div className="element-error" role="alert">
              <XCircle size={15} />
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                aria-label="Element hatasını kapat"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {message && (
            <div className="element-success" role="status">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}
          {!form ? (
            <div className="empty compact">
              <Fingerprint size={30} />
              <p>Bir element seç veya yeni bir element ekle.</p>
            </div>
          ) : (
            <>
              <fieldset
                className="inspector-fields"
                disabled={readonly || busy || checking}
              >
                <div className="inspector-section">
                  <label>
                    Görünen ad
                    <input
                      aria-label="Element adı"
                      value={form.label}
                      maxLength={120}
                      onChange={(e) => change({ label: e.target.value })}
                    />
                  </label>
                  <div className="element-two-fields">
                    <label>
                      Element anahtarı
                      <input
                        aria-label="Element anahtarı"
                        value={form.id}
                        readOnly={!!existingId}
                        maxLength={120}
                        placeholder="login.submit"
                        onChange={(e) => change({ id: e.target.value })}
                      />
                    </label>
                    <label>
                      Sayfa
                      <select
                        aria-label="Element sayfası"
                        value={form.page}
                        onChange={(e) =>
                          change(
                            { page: e.target.value as Element["page"] },
                            true,
                          )
                        }
                      >
                        <option value="login">Giriş sayfası</option>
                        <option value="dashboard">Dashboard</option>
                      </select>
                    </label>
                  </div>
                  <p className="field-explanation">
                    Ortak anahtar, HTML’deki ID’den bağımsızdır.
                  </p>
                </div>
                <div className="inspector-section">
                  <div className="inspector-section-title">
                    <strong>
                      <Code2 size={15} />
                      Birincil locator
                    </strong>
                    <span>YÜRÜTMEDE KULLANILIR</span>
                  </div>
                  <LocatorFields
                    value={form.locator}
                    prefix="Birincil locator"
                    onChange={(locator) => change({ locator }, true)}
                  />
                  <button
                    className="locator-try"
                    type="button"
                    disabled={checking || !form.locator.value.trim()}
                    onClick={() => void tryLocator()}
                  >
                    {checking ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <PlayIcon />
                    )}
                    {checking ? "Tarayıcıda deneniyor…" : "Locator’ı dene"}
                    <span>Chromium</span>
                  </button>
                  {result && (
                    <div
                      className={`locator-result ${result.resolution}`}
                      role="status"
                    >
                      <div>
                        {result.resolution === "unique" ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <Info size={18} />
                        )}
                        <strong>
                          {result.count} eşleşme{" "}
                          {result.resolution === "unique"
                            ? "· Tekil öğe"
                            : result.resolution === "not_found"
                              ? "· Öğe bulunamadı"
                              : "· Seçim belirsiz"}
                        </strong>
                      </div>
                      <p>
                        {result.resolution === "unique"
                          ? `Öğe ${result.visible ? "görünür" : "görünür değil"}.`
                          : "Bu sonuçla güvenilir bir öğe seçimi yapılamaz."}{" "}
                        {result.durationMs} ms · Pasif demo kontrolü
                      </p>
                    </div>
                  )}
                  {check?.status === "failed" && (
                    <div className="locator-result not_found" role="status">
                      <strong>Locator denemesi tamamlanamadı</strong>
                      <p>
                        {check.result && "code" in check.result
                          ? check.result.code
                          : "WORKER_ERROR"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="inspector-section alternatives-section">
                  <div className="inspector-section-title">
                    <strong>
                      <ArrowLeftRight size={15} />
                      Alternatif locator’lar{" "}
                      <span className="alternative-count">
                        {form.alternatives?.length ?? 0}
                      </span>
                    </strong>
                    <button
                      className="text-icon"
                      disabled={(form.alternatives?.length ?? 0) >= 5}
                      onClick={() =>
                        change(
                          {
                            alternatives: [
                              ...(form.alternatives ?? []),
                              { kind: "css", value: "" },
                            ],
                          },
                          true,
                        )
                      }
                      type="button"
                    >
                      <Plus size={14} />
                      Ekle
                    </button>
                  </div>
                  {form.alternatives?.map((alternative, i) => (
                    <details className="locator-alternative" key={i}>
                      <summary>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <strong>{locatorNames[alternative.kind]}</strong>
                        <code>{alternative.value || "Yeni alternatif"}</code>
                        <ChevronRight size={14} />
                      </summary>
                      <div className="alternative-body">
                        <LocatorFields
                          value={alternative}
                          prefix={`Alternatif ${i + 1}`}
                          onChange={(value) =>
                            change(
                              {
                                alternatives: form.alternatives!.map(
                                  (item, index) => (index === i ? value : item),
                                ),
                              },
                              true,
                            )
                          }
                        />
                        <div className="alternative-actions">
                          <button
                            type="button"
                            onClick={() =>
                              change(
                                {
                                  locator: alternative,
                                  alternatives: form.alternatives!.map(
                                    (item, index) =>
                                      index === i ? form.locator : item,
                                  ),
                                },
                                true,
                              )
                            }
                          >
                            <ArrowLeftRight size={13} />
                            Birincil yap
                          </button>
                          <button
                            type="button"
                            aria-label={`Alternatif ${i + 1} kaldır`}
                            onClick={() =>
                              change(
                                {
                                  alternatives: form.alternatives!.filter(
                                    (_, index) => index !== i,
                                  ),
                                },
                                true,
                              )
                            }
                          >
                            <Trash2 size={13} />
                            Kaldır
                          </button>
                        </div>
                      </div>
                    </details>
                  ))}
                  <p className="field-explanation">
                    Alternatifler öneri olarak saklanır. Kullanmak için birincil
                    olarak seçip onayla.
                  </p>
                </div>
                {form.dom && (
                  <details className="dom-details">
                    <summary>
                      <Code2 size={14} />
                      Keşifte gözlenen DOM özellikleri
                      <ChevronRight size={13} />
                    </summary>
                    <dl>
                      {Object.entries(form.dom)
                        .filter(([, value]) => value)
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                    </dl>
                    <p>
                      Keşif anındaki bilgi; elle düzenlenen locator ile otomatik
                      eşitlenmez.
                    </p>
                  </details>
                )}
                <div className="element-approval">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.approved}
                      onChange={(e) => change({ approved: e.target.checked })}
                    />
                    <span>
                      <strong>Bu eşlemeyi onaylıyorum</strong>
                      <small>Locator değiştiğinde yeniden onay gerekir.</small>
                    </span>
                  </label>
                </div>
              </fieldset>
              {usage && existingId && (
                <div className="element-usage">
                  <strong>
                    <GitBranch size={14} />
                    Kullanıldığı yerler
                  </strong>
                  <p>
                    {usage.flow ? "Giriş iş akışı · " : ""}
                    {usage.tests.length} yayınlanmış test sürümü
                  </p>
                  {usage.tests.slice(0, 3).map((test) => (
                    <div key={`${test.testId}:${test.revision}`}>
                      <FileCheck2 size={13} />
                      <span>{test.title}</span>
                      <small>
                        Test v{test.revision} · Model v{test.modelRevision}
                      </small>
                    </div>
                  ))}
                  <small>
                    Mevcut testler sabitlenmiş model sürümünde kalır.
                  </small>
                </div>
              )}
              <div className="inspector-save">
                <span>
                  <Layers3 size={14} />
                  {historical
                    ? `Model v${historical.revision} korunuyor`
                    : `Yeni sürüm: v${baseRevision + 1}`}
                </span>
                <button
                  className="primary"
                  disabled={
                    !valid ||
                    readonly ||
                    busy ||
                    checking ||
                    (!dirty && !!existingId)
                  }
                  onClick={() => void save()}
                >
                  {busy ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  Kaydet
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
function PlayIcon() {
  return <Radar size={16} />;
}
