"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { createElementUpdateVersion } from "./promoted-tests";

export type LibraryLocator =
  | {
      kind: "testId" | "id" | "css" | "label" | "placeholder";
      value: string;
    }
  | { kind: "role"; role: string; value: string };
export type AiElement = {
  id: string;
  elementKey: string;
  name: string;
  pageKey: string;
  origin: string;
  pageUrl: string;
  tag: string;
  label: string;
  role: string;
  inputType: string;
  locator: LibraryLocator;
  alternatives: LibraryLocator[];
  /** Seen on an approved element; not used for execution until accepted. */
  suggestedAlternatives?: LibraryLocator[];
  approved: boolean;
  revision: number;
  fragile: boolean;
  /** `merged` = retired duplicate ("Birleştir", ADR 016). */
  status?: string;
  mergedInto?: string | null;
  lastSeenAt: string;
};
type HistoryRow = {
  revision: number;
  action: string;
  createdAt: string;
  elementKey: string;
  name: string;
  pageKey: string;
  approved: boolean;
  locator: LibraryLocator;
  alternatives: LibraryLocator[];
};
type Detail = { element: AiElement; history: HistoryRow[] };

const kinds = ["testId", "id", "role", "label", "placeholder", "css"] as const;
const roles = [
  "button",
  "heading",
  "textbox",
  "link",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "img",
  "dialog",
  "navigation",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
];
const actionNames: Record<string, string> = {
  observed: "Keşifte gözlendi",
  updated: "Düzenlendi",
  approved: "Onaylandı",
  unapproved: "Onay kaldırıldı",
  locator_changed: "Locator değişti (onay kaldırıldı)",
  alternative_added: "Önerilen alternatif eklendi",
  pinned: "Suite onayında sabitlendi",
  merged: "Kopya element birleştirildi",
  merged_into: "Başka elemente birleştirildi (emekli)",
  heal_promoted: "Self-healing önerisi birincil yapıldı",
};

export function locatorLabel(locator: LibraryLocator) {
  return locator.kind === "role"
    ? `role=${locator.role} ${JSON.stringify(locator.value)}`
    : `${locator.kind}: ${locator.value}`;
}
function same(a: LibraryLocator[], b: LibraryLocator[]) {
  return (
    JSON.stringify(a.map(locatorLabel)) === JSON.stringify(b.map(locatorLabel))
  );
}

/** Inline editor for one library element: name, key, page, locators, approval. */
export function AiElementEditor({
  projectId,
  element,
  onSaved,
  onClose,
  onMerged,
}: {
  projectId: string;
  element: AiElement;
  onSaved: (element: AiElement) => void;
  onClose: () => void;
  /** The element was retired into `target` ("Birleştir"). */
  onMerged?: (target: AiElement) => void;
}) {
  const [base, setBase] = useState(element);
  const [form, setForm] = useState(element);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const path = `/v1/projects/${projectId}/ai/elements/${element.id}`;

  const reload = async () => {
    const detail = await api<Detail>(path);
    setBase(detail.element);
    setForm(detail.element);
    setHistory(detail.history);
    onSaved(detail.element);
  };
  // The row is current; the detail call only adds the read-only history so
  // a slow response never overwrites what the user already typed.
  useEffect(() => {
    void api<Detail>(path)
      .then((detail) => setHistory(detail.history))
      .catch((failure) => setError(String(failure)));
  }, [path]);

  const locatorsChanged = !same(
    [form.locator, ...form.alternatives],
    [base.locator, ...base.alternatives],
  );
  const setLocators = (
    locator: LibraryLocator,
    alternatives: LibraryLocator[],
  ) =>
    // Same rule as the Demo Bank registry: a locator change clears approval.
    setForm((current) => ({
      ...current,
      locator,
      alternatives,
      approved: false,
    }));
  const editPrimary = (
    patch: Partial<{ kind: string; role: string; value: string }>,
  ) => {
    const kind = patch.kind ?? form.locator.kind;
    const value = patch.value ?? form.locator.value;
    const role =
      patch.role ??
      (form.locator.kind === "role"
        ? form.locator.role
        : form.role || "button");
    setLocators(
      (kind === "role"
        ? { kind, role, value }
        : { kind, value }) as LibraryLocator,
      form.alternatives,
    );
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        element: AiElement;
        approvalCleared: boolean;
        history: HistoryRow[];
      }>(path, "PUT", {
        expectedRevision: base.revision,
        elementKey: form.elementKey,
        name: form.name,
        pageKey: form.pageKey,
        locator: form.locator,
        alternatives: form.alternatives,
        approved: form.approved,
      });
      setBase(result.element);
      setForm(result.element);
      setHistory(result.history);
      onSaved(result.element);
      setMessage(
        result.approvalCleared
          ? `Kaydedildi (sürüm ${result.element.revision}). Locator değiştiği için onay kaldırıldı.`
          : `Kaydedildi (sürüm ${result.element.revision}).`,
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "REVISION_CONFLICT") {
        setError(
          "Element bu arada değişti. Güncel sürüm yüklendi; değişikliği tekrar uygula.",
        );
        await reload().catch(() => undefined);
      } else setError(String(failure));
    } finally {
      setSaving(false);
    }
  };

  const acceptSuggestion = async (locator: LibraryLocator) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ element: AiElement; history: HistoryRow[] }>(
        `${path}/suggestions/accept`,
        "POST",
        { expectedRevision: base.revision, locator },
      );
      setBase(result.element);
      setForm(result.element);
      setHistory(result.history);
      onSaved(result.element);
      setMessage(
        `Alternatif eklendi (sürüm ${result.element.revision}). Birincil locator değişmediği için onay korundu.`,
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "REVISION_CONFLICT") {
        setError(
          "Element bu arada değişti. Güncel sürüm yüklendi; değişikliği tekrar uygula.",
        );
        await reload().catch(() => undefined);
      } else setError(String(failure));
    } finally {
      setSaving(false);
    }
  };
  const suggestions = base.suggestedAlternatives ?? [];

  return (
    <div
      className="ai-element-editor"
      aria-label={`${element.elementKey} düzenle`}
    >
      {suggestions.length > 0 && (
        <span
          className="badge awaiting_review ai-element-suggestion-badge"
          title="Yeniden gözlemde bulunan, henüz eklenmemiş alternatifler"
        >
          {suggestions.length} önerilen alternatif
        </span>
      )}
      <div className="ai-element-editor-grid">
        <label>
          Ad
          <input
            aria-label="Element adı"
            value={form.name}
            maxLength={120}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Anahtar
          <input
            aria-label="Element anahtarı"
            value={form.elementKey}
            maxLength={120}
            disabled={base.approved}
            title={
              base.approved ? "Onaylı elementin anahtarı değiştirilemez." : ""
            }
            onChange={(e) => setForm({ ...form, elementKey: e.target.value })}
          />
        </label>
        <label>
          Sayfa anahtarı
          <input
            aria-label="Sayfa anahtarı"
            value={form.pageKey}
            maxLength={60}
            onChange={(e) => setForm({ ...form, pageKey: e.target.value })}
          />
        </label>
      </div>
      <fieldset className="ai-element-locators">
        <legend>Birincil locator</legend>
        <div className="ai-element-editor-grid">
          <label>
            Tür
            <select
              aria-label="Birincil locator türü"
              value={form.locator.kind}
              onChange={(e) => editPrimary({ kind: e.target.value })}
            >
              {kinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          {form.locator.kind === "role" && (
            <label>
              Rol
              <select
                aria-label="Birincil locator rolü"
                value={form.locator.role}
                onChange={(e) => editPrimary({ role: e.target.value })}
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
          )}
          <label className="wide">
            Değer
            <input
              aria-label="Birincil locator değeri"
              value={form.locator.value}
              onChange={(e) => editPrimary({ value: e.target.value })}
            />
          </label>
        </div>
        <strong>Alternatifler ({form.alternatives.length}/5)</strong>
        {form.alternatives.length ? (
          <ul>
            {form.alternatives.map((alternative, index) => (
              <li key={locatorLabel(alternative)}>
                <code>{locatorLabel(alternative)}</code>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setLocators(alternative, [
                      form.locator,
                      ...form.alternatives.filter((_, i) => i !== index),
                    ])
                  }
                >
                  Birincil yap
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setLocators(
                      form.locator,
                      form.alternatives.filter((_, i) => i !== index),
                    )
                  }
                >
                  Kaldır
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <small>Keşifte başka tekil locator bulunmadı.</small>
        )}
        <small>
          Alternatifler yalnız Ayarlar → Self-healing açıksa ve birincil locator
          hiç bulunamazsa sırayla denenir; önerilen alternatifler asla denenmez.
        </small>
        {suggestions.length > 0 && (
          <div className="ai-element-suggestions">
            <strong>Önerilen alternatifler ({suggestions.length})</strong>
            <small>
              Onaylı element yeniden gözlenirken bulundu; eklenene kadar
              kullanılmaz.
            </small>
            <ul>
              {suggestions.map((suggestion) => (
                <li key={locatorLabel(suggestion)}>
                  <code>{locatorLabel(suggestion)}</code>
                  <button
                    type="button"
                    className="text-button"
                    disabled={saving || locatorsChanged}
                    onClick={() => void acceptSuggestion(suggestion)}
                  >
                    Alternatif olarak ekle
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
      <label className="ai-element-approval">
        <input
          type="checkbox"
          aria-label="Elementi onayla"
          checked={form.approved}
          onChange={(e) => setForm({ ...form, approved: e.target.checked })}
        />
        Onaylı (testlerde bu anahtarla kullanılabilir)
      </label>
      {locatorsChanged && (
        <small className="ai-element-warning">
          Locator değişti: kaydedince onay kaldırılır, sonra tekrar onaylayın.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="ai-element-editor-actions">
        <button
          type="button"
          className="primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Kapat
        </button>
        <small>Sürüm {base.revision}</small>
      </div>
      {!base.approved && (
        <MergeElement
          projectId={projectId}
          element={base}
          onMerged={(target) => {
            onMerged?.(target);
          }}
        />
      )}
      <ElementImpact
        projectId={projectId}
        elementId={element.id}
        revision={base.revision}
      />
      <details className="ai-element-history">
        <summary>Geçmiş ({history.length})</summary>
        {history.length ? (
          <ol>
            {history.map((row) => (
              <li key={row.revision}>
                <b>v{row.revision}</b> {actionNames[row.action] ?? row.action} ·{" "}
                {new Date(row.createdAt).toLocaleString("tr-TR")} ·{" "}
                <code>{row.elementKey}</code> · {row.name} ·{" "}
                <code>{locatorLabel(row.locator)}</code>
                {row.approved ? " · onaylı" : ""}
              </li>
            ))}
          </ol>
        ) : (
          <small>Henüz düzenleme yok. Geçmiş salt okunurdur.</small>
        )}
      </details>
    </div>
  );
}

type ImpactRow = {
  testId: string;
  title: string;
  testRevision: number;
  elementKey: string;
  pinnedRevision: number;
  currentRevision: number;
  diff: {
    primary: { from: LibraryLocator; to: LibraryLocator } | null;
    alternatives: { added: LibraryLocator[]; removed: LibraryLocator[] };
    name: { from: string; to: string } | null;
    snapshotMissing: boolean;
  };
  unavailable: { elementKey: string; reason: "removed" | "unapproved" }[];
};
type RunState = { id: string; status: string; counts?: string };
const reasonNames = { removed: "silinmiş", unapproved: "onaysız" };
const terminal = (status: string) => !["queued", "running"].includes(status);

/**
 * "Etkilenen testler" (ADR 015): latest permanent test versions that pin an
 * older revision of this element; a new version is created only on request.
 */
export function ElementImpact({
  projectId,
  elementId,
  revision,
}: {
  projectId: string;
  elementId: string;
  revision: number;
}) {
  const [rows, setRows] = useState<ImpactRow[]>([]);
  const [created, setCreated] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const root = `/v1/projects/${projectId}/ai`;
  useEffect(() => {
    void api<{ tests: ImpactRow[] }>(`${root}/elements/${elementId}/impact`)
      .then((data) => setRows(data.tests))
      .catch((failure) => setError(String(failure)));
  }, [root, elementId, revision, reload]);
  const pending = Object.entries(runs).filter(([, r]) => !terminal(r.status));
  const pendingKey = pending.map(([, r]) => r.id).join(",");
  useEffect(() => {
    if (!pending.length) return;
    const timer = setInterval(() => {
      for (const [testId, run] of pending)
        void api<{
          status: string;
          result: {
            counts?: { passed: number; failed: number; skipped: number };
            healedSteps?: number;
          } | null;
        }>(`${root}/test-runs/${run.id}`).then((detail) =>
          setRuns((current) => ({
            ...current,
            [testId]: {
              id: run.id,
              status: detail.status,
              counts: detail.result?.counts
                ? `${detail.result.counts.passed} başarılı · ${detail.result.counts.failed} başarısız · ${detail.result.counts.skipped} atlandı${detail.result.healedSteps ? ` · ${detail.result.healedSteps} adım alternatifle bulundu` : ""}`
                : undefined,
            },
          })),
        );
    }, 1500);
    return () => clearInterval(timer);
    // pendingKey names exactly the runs in `pending`.
  }, [root, pendingKey]);

  const createVersion = async (row: ImpactRow) => {
    setBusy(row.testId);
    setError("");
    try {
      const result = await createElementUpdateVersion(projectId, {
        id: row.testId,
        revision: row.testRevision,
      });
      setCreated((current) => ({
        ...current,
        [row.testId]: result.test.revision,
      }));
      setReload((n) => n + 1);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy("");
    }
  };
  const run = async (testId: string, testRevision: number) => {
    setBusy(testId);
    setError("");
    try {
      const queued = await api<{ id: string; status: string }>(
        `${root}/tests/${testId}/runs`,
        "POST",
        { revision: testRevision },
      );
      setRuns((current) => ({ ...current, [testId]: queued }));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy("");
    }
  };
  const createdOnly = Object.entries(created).filter(
    ([testId]) => !rows.some((row) => row.testId === testId),
  );

  return (
    <section className="ai-element-impact" aria-label="Etkilenen testler">
      <strong>Etkilenen testler ({rows.length})</strong>
      <small>
        Kalıcı testlerin son sürümleri bu elementin eski bir sürümünü
        kullanıyorsa burada listelenir. Eski sürümler değişmez; yeni sürüm
        yalnızca siz oluşturunca yazılır.
      </small>
      {rows.length === 0 && createdOnly.length === 0 && (
        <small>Bu elementin eski sürümünü kullanan kalıcı test yok.</small>
      )}
      <ul>
        {rows.map((row) => (
          <li key={row.testId}>
            <div>
              <b>{row.title}</b> · test v{row.testRevision} ·{" "}
              <code>{row.elementKey}</code> pinli v{row.pinnedRevision} → güncel
              v{row.currentRevision}
            </div>
            <ul className="ai-element-diff">
              {row.diff.primary && (
                <li>
                  Birincil: <code>{locatorLabel(row.diff.primary.from)}</code> →{" "}
                  <code>{locatorLabel(row.diff.primary.to)}</code>
                </li>
              )}
              {row.diff.alternatives.added.map((l) => (
                <li key={`+${locatorLabel(l)}`}>
                  Alternatif eklendi: <code>{locatorLabel(l)}</code>
                </li>
              ))}
              {row.diff.alternatives.removed.map((l) => (
                <li key={`-${locatorLabel(l)}`}>
                  Alternatif kaldırıldı: <code>{locatorLabel(l)}</code>
                </li>
              ))}
              {row.diff.name && (
                <li>
                  Ad: {row.diff.name.from} → {row.diff.name.to}
                </li>
              )}
              {!row.diff.primary &&
                !row.diff.name &&
                !row.diff.alternatives.added.length &&
                !row.diff.alternatives.removed.length && (
                  <li>Locator ve ad aynı (yalnız onay/sayfa değişti).</li>
                )}
            </ul>
            {row.unavailable.length > 0 && (
              <small className="ai-element-warning">
                Yeni sürüm için önce onaylayın:{" "}
                {row.unavailable
                  .map((u) => `${u.elementKey} (${reasonNames[u.reason]})`)
                  .join(", ")}
              </small>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy === row.testId || row.unavailable.length > 0}
              onClick={() => void createVersion(row)}
            >
              Yeni sürüm oluştur
            </button>
          </li>
        ))}
        {createdOnly.map(([testId, testRevision]) => (
          <li key={testId}>
            <span role="status">
              Yeni sürüm v{testRevision} oluşturuldu; önceki sürüm değişmedi.
            </span>{" "}
            <button
              type="button"
              className="secondary"
              disabled={
                busy === testId ||
                (!!runs[testId] && !terminal(runs[testId]!.status))
              }
              onClick={() => void run(testId, testRevision)}
            >
              Yeni sürümü çalıştır
            </button>
            {runs[testId] && (
              <small>
                {" "}
                Çalıştırma {runs[testId]!.id.slice(0, 8)}:{" "}
                {runs[testId]!.status}
                {runs[testId]!.counts ? ` · ${runs[testId]!.counts}` : ""}
              </small>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

/**
 * "Birleştir" (ADR 016): retire this unapproved duplicate into another
 * element of the same page. An approved target receives the locators as
 * suggested alternatives, an unapproved one as alternatives.
 */
function MergeElement({
  projectId,
  element,
  onMerged,
}: {
  projectId: string;
  element: AiElement;
  onMerged: (target: AiElement) => void;
}) {
  const [candidates, setCandidates] = useState<AiElement[]>([]);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const root = `/v1/projects/${projectId}/ai/elements`;
  useEffect(() => {
    const search = new URLSearchParams({
      pageUrl: element.pageUrl,
      limit: "500",
    });
    void api<{ elements: AiElement[] }>(`${root}?${search}`)
      .then((data) =>
        setCandidates(
          data.elements
            .filter((candidate) => candidate.id !== element.id)
            // Approved, named elements first: the usual merge target.
            .sort(
              (a, b) =>
                Number(b.approved) - Number(a.approved) ||
                a.elementKey.localeCompare(b.elementKey),
            ),
        ),
      )
      .catch((failure) => setError(String(failure)));
  }, [root, element.id, element.pageUrl]);
  const target = candidates.find((candidate) => candidate.id === targetId);
  const merge = async () => {
    if (!target) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        element: AiElement;
        added: LibraryLocator[];
        skipped: number;
        asSuggestions: boolean;
      }>(`${root}/${element.id}/merge`, "POST", {
        expectedRevision: element.revision,
        targetId: target.id,
        targetRevision: target.revision,
      });
      setMessage(
        `${element.elementKey} → ${result.element.elementKey} birleştirildi (sürüm ${result.element.revision}). ${result.added.length} locator ${result.asSuggestions ? "önerilen alternatif" : "alternatif"} olarak eklendi${result.skipped ? `, ${result.skipped} sınır nedeniyle eklenmedi` : ""}.`,
      );
      onMerged(result.element);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ai-element-merge" aria-label="Elementi birleştir">
      <strong>Birleştir</strong>
      <small>
        Bu onaysız kayıt başka bir elementin kopyasıysa birleştirin:
        locator&apos;ları hedefe taşınır (onaylı hedefte önerilen alternatif
        olur), bu kayıt silinmeden emekli edilir ve geçmişi korunur.
      </small>
      <div className="ai-element-editor-grid">
        <label className="wide">
          Hedef element
          <select
            aria-label="Birleştirme hedefi"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Seçin</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.elementKey}
                {candidate.name ? ` · ${candidate.name}` : ""}
                {candidate.approved ? " · onaylı" : ""} ·{" "}
                {locatorLabel(candidate.locator)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="secondary"
        disabled={busy || !target}
        onClick={() => void merge()}
      >
        {busy ? "Birleştiriliyor…" : "Birleştir"}
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
