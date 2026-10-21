"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  AiElementEditor,
  ElementImpact,
  locatorLabel,
  type AiElement,
  type LibraryLocator,
} from "./ai-element-editor";

type PageSummary = {
  pageUrl: string;
  count: number;
  fragile: number;
  approved: number;
};
type Group = { items: AiElement[]; total: number; loading: boolean };
type ElementResponse = {
  elements: AiElement[];
  total: number;
  pages: PageSummary[];
};

const pageSize = 20;

/** Long concatenated DOM text becomes a short readable label. */
export function shortLabel(text: string, max = 48) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
function locatorText(element: AiElement) {
  return locatorLabel(element.locator);
}
function pageTitle(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    return { path: url.pathname || "/", host: url.host };
  } catch {
    return { path: pageUrl, host: "" };
  }
}
function elementsPath(
  projectId: string,
  params: Record<string, string | number>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== "") search.set(key, String(value));
  return `/v1/projects/${projectId}/ai/elements?${search}`;
}

export function AiElementList({
  projectId,
  focusId,
  onFocusHandled,
  onOpenCase,
}: {
  projectId: string;
  /** Opened from a test step: search by its key and open the editor. */
  focusId?: string;
  onFocusHandled?: () => void;
  onOpenCase?: (caseId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const pageFilterRef = useRef("");
  pageFilterRef.current = pageFilter;
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState("");
  const [notice, setNotice] = useState("");
  // Bumped after a merge or "Birincil yap": page counts and rows reload.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!focusId) return;
    void api<{ element: AiElement }>(
      `/v1/projects/${projectId}/ai/elements/${focusId}`,
    )
      .then(({ element }) => {
        setStatus("");
        setPageFilter("");
        setInput(element.elementKey);
        setEditing(element.id);
      })
      .catch((failure) => setError(String(failure)))
      .finally(() => onFocusHandled?.());
  }, [projectId, focusId, onFocusHandled]);

  useEffect(() => {
    let active = true;
    void api<ElementResponse>(
      elementsPath(projectId, { q: query, approved: status, limit: 1 }),
    )
      .then((result) => {
        if (!active) return;
        setError("");
        setGroups({});
        setPages(result.pages);
        const first = pageFilterRef.current || result.pages[0]?.pageUrl;
        setOpen(new Set(first ? [first] : []));
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
    };
  }, [projectId, query, status, reload]);

  const load = async (pageUrl: string, offset: number) => {
    setGroups((current) => ({
      ...current,
      [pageUrl]: {
        items: current[pageUrl]?.items ?? [],
        total: current[pageUrl]?.total ?? 0,
        loading: true,
      },
    }));
    try {
      const result = await api<ElementResponse>(
        elementsPath(projectId, {
          q: query,
          approved: status,
          pageUrl,
          limit: pageSize,
          offset,
        }),
      );
      setGroups((current) => ({
        ...current,
        [pageUrl]: {
          items: [
            ...(offset ? (current[pageUrl]?.items ?? []) : []),
            ...result.elements,
          ],
          total: result.total,
          loading: false,
        },
      }));
    } catch (failure) {
      setError(String(failure));
    }
  };

  const visiblePages = (pages ?? []).filter(
    (page) => !pageFilter || page.pageUrl === pageFilter,
  );

  useEffect(() => {
    for (const page of visiblePages)
      if (open.has(page.pageUrl) && !groups[page.pageUrl])
        void load(page.pageUrl, 0);
  }, [open, pages, pageFilter]);

  const toggle = (pageUrl: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(pageUrl)) next.delete(pageUrl);
      else next.add(pageUrl);
      return next;
    });

  const total = (pages ?? []).reduce((sum, page) => sum + page.count, 0);
  const fragileTotal = (pages ?? []).reduce(
    (sum, page) => sum + page.fragile,
    0,
  );

  return (
    <section className="card ai-element-list">
      <div>
        <span className="eyebrow">AI KEŞFİ</span>
        <h2>Web sitelerinden kaydedilen elementler</h2>
        <p>
          AI keşfinden yalnız üretilen testlerin adımlarında kullanılan ve
          sayfada tekil doğrulanan öğeler kaydedilir; her öğe için en fazla 3
          tekil locator (birincil + alternatifler) tutulur. Yeni keşif,
          locator'larından biri eşleşen kaydı yeniden kullanır; onaylı kaydı
          değiştirmez, farklı locator'ı öneri olarak ekler. Elementi adlandırıp
          anahtar verin ve onaylayın; locator değişikliği onayı kaldırır. Sıra
          numarasına (nth-of-type) dayanan CSS yolları <b>kırılgan</b> olarak
          işaretlenir.
        </p>
      </div>
      <div className="ai-element-filters">
        <label>
          Ara
          <input
            type="search"
            aria-label="Kaydedilen element ara"
            value={input}
            placeholder="Ad, anahtar veya locator ile ara"
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <label>
          Durum
          <select
            aria-label="Kaydedilen element durumu"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tümü</option>
            <option value="true">Onaylı</option>
            <option value="false">Onay bekliyor</option>
          </select>
        </label>
        <label>
          Sayfa
          <select
            aria-label="Kaydedilen element sayfası"
            value={pageFilter}
            onChange={(event) => {
              const value = event.target.value;
              setPageFilter(value);
              if (value) setOpen((current) => new Set([...current, value]));
            }}
          >
            <option value="">Tüm sayfalar</option>
            {(pages ?? []).map((page) => (
              <option key={page.pageUrl} value={page.pageUrl}>
                {page.pageUrl} ({page.count})
              </option>
            ))}
          </select>
        </label>
        {pages && (
          <small className="ai-element-total">
            {pages.length} sayfa · {total} element
            {fragileTotal ? ` · ${fragileTotal} kırılgan` : ""}
          </small>
        )}
      </div>
      <HealSuggestions
        projectId={projectId}
        onPromoted={() => setReload((n) => n + 1)}
      />
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {!error && pages && !pages.length && (
        <p>
          {query
            ? "Aramayla eşleşen element yok."
            : "Henüz AI ile keşfedilen element yok."}
        </p>
      )}
      {visiblePages.map((page) => {
        const isOpen = open.has(page.pageUrl);
        const group = groups[page.pageUrl];
        const title = pageTitle(page.pageUrl);
        return (
          <div className="ai-element-group" key={page.pageUrl}>
            <button
              type="button"
              className="ai-element-group-head"
              aria-expanded={isOpen}
              title={page.pageUrl}
              onClick={() => toggle(page.pageUrl)}
            >
              <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              <strong>{title.path}</strong>
              <small>{title.host}</small>
              <span className="ai-element-count">
                {page.count} element
                {page.approved ? ` · ${page.approved} onaylı` : ""}
                {page.fragile ? ` · ${page.fragile} kırılgan` : ""}
              </span>
            </button>
            {isOpen && (
              <div className="ai-element-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Element</th>
                      <th>Locator</th>
                      <th>Durum</th>
                      <th>Son gözlem</th>
                      <th>
                        <span className="sr-only">İşlem</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group?.items ?? []).map((element) => {
                      const name = element.name || element.label || element.tag;
                      const replace = (updated: AiElement) =>
                        setGroups((current) => ({
                          ...current,
                          [page.pageUrl]: {
                            ...current[page.pageUrl]!,
                            items: current[page.pageUrl]!.items.map((item) =>
                              item.id === updated.id ? updated : item,
                            ),
                          },
                        }));
                      return (
                        <Fragment key={element.id}>
                          <tr>
                            <td title={name}>
                              {shortLabel(name)}
                              <small>
                                <code className="ai-element-key">
                                  {element.elementKey}
                                </code>
                              </small>
                              <small>
                                {element.tag}
                                {element.inputType && ` · ${element.inputType}`}
                                {element.role && ` · ${element.role}`}
                              </small>
                            </td>
                            <td>
                              <code title={locatorText(element)}>
                                {locatorText(element)}
                              </code>
                              {element.alternatives.length > 0 && (
                                <small>
                                  +{element.alternatives.length} alternatif
                                </small>
                              )}
                              {(element.suggestedAlternatives?.length ?? 0) >
                                0 && (
                                <span
                                  className="badge awaiting_review"
                                  title="Yeniden gözlemde bulunan, henüz eklenmemiş alternatifler"
                                >
                                  {element.suggestedAlternatives!.length} öneri
                                </span>
                              )}
                              {element.fragile && (
                                <span
                                  className="badge fragile"
                                  title="Sıra numarasına bağlı CSS; sayfa düzeni değişince kırılabilir."
                                >
                                  kırılgan
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`badge ${element.approved ? "approved" : "awaiting_review"}`}
                              >
                                {element.approved ? "Onaylı" : "Bekliyor"}
                              </span>
                              <small>
                                v{element.revision}
                                {element.verification === "verified"
                                  ? " · doğrulandı"
                                  : element.verification === "failed"
                                    ? " · doğrulanamadı"
                                    : ""}
                              </small>
                            </td>
                            <td>
                              {new Date(element.lastSeenAt).toLocaleString(
                                "tr-TR",
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                aria-expanded={editing === element.id}
                                aria-label={`${element.elementKey} düzenle`}
                                onClick={() =>
                                  setEditing(
                                    editing === element.id ? "" : element.id,
                                  )
                                }
                              >
                                {editing === element.id ? "Kapat" : "Düzenle"}
                              </button>
                            </td>
                          </tr>
                          {editing === element.id && (
                            <tr className="ai-element-edit-row">
                              <td colSpan={5}>
                                <AiElementEditor
                                  projectId={projectId}
                                  element={element}
                                  onOpenCase={onOpenCase}
                                  onSaved={replace}
                                  onClose={() => setEditing("")}
                                  onMerged={(target) => {
                                    setEditing("");
                                    setNotice(
                                      `${element.elementKey} kaydı ${target.elementKey} elementine birleştirildi (sürüm ${target.revision}); kopya emekli edildi, geçmişi korunuyor.`,
                                    );
                                    setReload((n) => n + 1);
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {group?.loading && <small>Yükleniyor…</small>}
                {group &&
                  !group.loading &&
                  group.items.length < group.total && (
                    <button
                      type="button"
                      className="ai-element-more"
                      onClick={() =>
                        void load(page.pageUrl, group.items.length)
                      }
                    >
                      Daha fazla göster ({group.total - group.items.length}{" "}
                      kaldı)
                    </button>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

type HealSuggestion = {
  id: string;
  elementId: string;
  elementKey: string;
  revision: number;
  primary: LibraryLocator;
  locator: LibraryLocator;
  runKind: string;
  runId: string;
  steps: number;
  createdAt: string;
  element: {
    name: string;
    revision: number;
    approved: boolean;
    merged: boolean;
    locator: LibraryLocator;
  } | null;
};
/**
 * Self-healing suggestions (ADR 016): a run found the element with an
 * approved alternative. "Birincil yap" makes it primary (new revision →
 * affected tests); "Yoksay" closes the suggestion.
 */
function HealSuggestions({
  projectId,
  onPromoted,
}: {
  projectId: string;
  onPromoted: () => void;
}) {
  const [items, setItems] = useState<HealSuggestion[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    elementId: string;
    revision: number;
    message: string;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const root = `/v1/projects/${projectId}/ai/heal-suggestions`;
  useEffect(() => {
    void api<{ suggestions: HealSuggestion[] }>(root)
      .then((data) => setItems(data.suggestions))
      .catch((failure) => setError(String(failure)));
  }, [root, tick]);
  const act = async (item: HealSuggestion, action: "promote" | "ignore") => {
    setBusy(item.id);
    setError("");
    try {
      if (action === "promote") {
        const result = await api<{ element: AiElement }>(
          `${root}/${item.id}/promote`,
          "POST",
          { expectedRevision: item.element?.revision ?? item.revision },
        );
        setDone({
          elementId: result.element.id,
          revision: result.element.revision,
          message: `${item.elementKey}: ${locatorLabel(item.locator)} birincil yapıldı (sürüm ${result.element.revision}); eski birincil alternatiflerin sonuna taşındı.`,
        });
        onPromoted();
      } else {
        await api(`${root}/${item.id}/ignore`, "POST", {});
        setDone(null);
      }
      setTick((n) => n + 1);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy("");
    }
  };
  if (!items.length && !done && !error) return null;
  return (
    <section
      className="ai-heal-suggestions"
      aria-label="Self-healing önerileri"
    >
      <strong>Self-healing önerileri ({items.length})</strong>
      <small>
        Çalıştırmada birincil locator bulunamadı, onaylı bir alternatifle
        bulundu. Birincil yapmak elementin yeni sürümünü oluşturur; etkilenen
        testler için yeni sürüm ayrıca onaylanır.
      </small>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <b>{item.element?.name || item.elementKey}</b>{" "}
              <code>{item.elementKey}</code> · v{item.revision} · birincil{" "}
              <code>{locatorLabel(item.primary)}</code> bulunamadı →{" "}
              <code>{locatorLabel(item.locator)}</code> ile bulundu ·{" "}
              {item.steps} adım ·{" "}
              {item.runKind === "ai_test_run" ? "test" : "suite"} çalışması{" "}
              {item.runId.slice(0, 8)} ·{" "}
              {new Date(item.createdAt).toLocaleString("tr-TR")}
            </div>
            <button
              type="button"
              className="primary"
              disabled={!!busy || !item.element || item.element.merged}
              aria-label={`${item.elementKey} için ${locatorLabel(item.locator)} birincil yap`}
              onClick={() => void act(item, "promote")}
            >
              Birincil yap
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!!busy}
              onClick={() => void act(item, "ignore")}
            >
              Yoksay
            </button>
          </li>
        ))}
      </ul>
      {done && (
        <div>
          <p role="status">{done.message}</p>
          <ElementImpact
            projectId={projectId}
            elementId={done.elementId}
            revision={done.revision}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
