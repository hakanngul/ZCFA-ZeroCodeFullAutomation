"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type AiElement = {
  id: string;
  pageUrl: string;
  tag: string;
  label: string;
  role: string;
  inputType: string;
  locatorKind: string;
  locatorValue: string;
  fragile: boolean;
  lastSeenAt: string;
};
type PageSummary = { pageUrl: string; count: number; fragile: number };
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
  return element.locatorKind === "role"
    ? `role=${element.role} ${JSON.stringify(element.locatorValue)}`
    : `${element.locatorKind}: ${element.locatorValue}`;
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

export function AiElementList({ projectId }: { projectId: string }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const pageFilterRef = useRef("");
  pageFilterRef.current = pageFilter;
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    let active = true;
    void api<ElementResponse>(elementsPath(projectId, { q: query, limit: 1 }))
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
  }, [projectId, query]);

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
          Chat analizi sırasında görülen DOM öğeleri otomatik saklanır. Yeni
          sayfa analizi aynı locator kaydını günceller. Sıra numarasına
          (nth-of-type) dayanan CSS yolları <b>kırılgan</b> olarak işaretlenir.
        </p>
      </div>
      <div className="ai-element-filters">
        <label>
          Ara
          <input
            type="search"
            aria-label="Kaydedilen element ara"
            value={input}
            placeholder="Element adı veya locator"
            onChange={(event) => setInput(event.target.value)}
          />
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
                      <th>Son gözlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group?.items ?? []).map((element) => {
                      const name = element.label || element.tag;
                      return (
                        <tr key={element.id}>
                          <td title={name}>
                            {shortLabel(name)}
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
                            {new Date(element.lastSeenAt).toLocaleString(
                              "tr-TR",
                            )}
                          </td>
                        </tr>
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
