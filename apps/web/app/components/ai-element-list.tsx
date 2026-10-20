"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type AiElement = {
  id: string;
  pageUrl: string;
  tag: string;
  label: string;
  role: string;
  inputType: string;
  locatorKind: "testId" | "id" | "css";
  locatorValue: string;
  lastSeenAt: string;
};

export function AiElementList({ projectId }: { projectId: string }) {
  const [elements, setElements] = useState<AiElement[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ elements: AiElement[] }>(`/v1/projects/${projectId}/ai/elements`)
      .then((result) => {
        if (active) setElements(result.elements);
      })
      .catch((failure) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <section className="card ai-element-list">
      <div>
        <span className="eyebrow">AI KEŞFİ</span>
        <h2>Web sitelerinden kaydedilen elementler</h2>
        <p>
          Chat analizi sırasında görülen DOM öğeleri otomatik saklanır. Yeni
          sayfa analizi aynı locator kaydını günceller.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!error && !elements.length && (
        <p>Henüz AI ile keşfedilen element yok.</p>
      )}
      {!!elements.length && (
        <div className="ai-element-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sayfa</th>
                <th>Element</th>
                <th>Locator</th>
                <th>Son gözlem</th>
              </tr>
            </thead>
            <tbody>
              {elements.map((element) => (
                <tr key={element.id}>
                  <td>{element.pageUrl}</td>
                  <td>
                    {element.label || element.tag}
                    <small>
                      {element.tag}
                      {element.inputType && ` · ${element.inputType}`}
                      {element.role && ` · ${element.role}`}
                    </small>
                  </td>
                  <td>
                    <code>
                      {element.locatorKind}: {element.locatorValue}
                    </code>
                  </td>
                  <td>
                    {new Date(element.lastSeenAt).toLocaleString("tr-TR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
