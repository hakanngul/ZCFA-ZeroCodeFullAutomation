"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

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
}: {
  projectId: string;
  element: AiElement;
  onSaved: (element: AiElement) => void;
  onClose: () => void;
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
        <small>Alternatifler çalıştırmada otomatik denenmez.</small>
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
