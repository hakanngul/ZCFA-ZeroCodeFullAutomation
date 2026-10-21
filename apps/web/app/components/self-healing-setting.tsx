"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Project setting "Self-healing" (ADR 016); off by default. */
export function SelfHealingSetting({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const path = `/v1/projects/${projectId}/settings`;
  useEffect(() => {
    void api<{ selfHealing: boolean }>(path)
      .then((settings) => setEnabled(settings.selfHealing))
      .catch((failure) => setError(String(failure)));
  }, [path]);
  const save = async (next: boolean) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await api<{ selfHealing: boolean }>(path, "PUT", {
        selfHealing: next,
      });
      setEnabled(saved.selfHealing);
      setMessage(
        saved.selfHealing
          ? "Self-healing açık; sonraki çalıştırmalarda geçerli."
          : "Self-healing kapalı; alternatifler denenmez.",
      );
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-settings-card card" aria-label="Self-healing ayarı">
      <div>
        <span className="eyebrow">ÇALIŞTIRMA</span>
        <h2>Self-healing</h2>
      </div>
      <p>
        Açıksa, kütüphane elementinin sabitlenmiş birincil locator&apos;ı
        sayfada hiç bulunamadığında o sürümün <b>onaylı</b> alternatifleri
        sırayla denenir; tekil eşleşen ilk alternatif kullanılır ve adım
        &quot;alternatifle bulundu&quot; olarak işaretlenir. Önerilen
        alternatifler hiç denenmez, doğrulama beklentileri değişmez; çoklu
        eşleşme ya da hiç eşleşme normal hatadır. Her iyileşme
        Elementler&apos;de &quot;Birincil yap&quot; / &quot;Yoksay&quot; önerisi
        üretir.
      </p>
      <label className="ai-element-approval">
        <input
          type="checkbox"
          aria-label="Self-healing"
          checked={!!enabled}
          disabled={busy || !canEdit || enabled === null}
          onChange={(event) => void save(event.target.checked)}
        />
        Self-healing (varsayılan kapalı)
      </label>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
