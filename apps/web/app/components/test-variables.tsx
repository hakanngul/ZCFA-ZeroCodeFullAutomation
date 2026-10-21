"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";

type Variable = {
  id: string;
  key: string;
  origin: string | null;
  secret: boolean;
  /** null for secrets: the server never returns them after save. */
  value: string | null;
};
const empty = { key: "", value: "", secret: false, origin: "" };

/** Ayarlar → Test verileri: {{KEY}} values resolved only by the worker. */
export function TestVariables({
  projectId,
  canEdit,
  origins,
}: {
  projectId: string;
  canEdit: boolean;
  origins: string[];
}) {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const root = `/v1/projects/${projectId}/test-variables`;
  const load = useCallback(async () => {
    const result = await api<{ variables: Variable[] }>(root);
    setVariables(result.variables);
  }, [root]);
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, [load]);
  const task = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    task(async () => {
      const body = {
        key: form.key.trim(),
        secret: form.secret,
        origin: form.origin || null,
        ...(form.value ? { value: form.value } : {}),
      };
      await api(
        editing ? `${root}/${editing}` : root,
        editing ? "PUT" : "POST",
        body,
      );
      setForm(empty);
      setEditing(null);
      await load();
      setNotice(
        `{{${body.key}}} kaydedildi. Yayınlanmış testler referansı saklar; yeni değer sonraki çalıştırmada kullanılır.`,
      );
    });
  return (
    <div className="ai-settings-card card" id="test-variables">
      <div>
        <span className="eyebrow">TEST VERİLERİ</span>
        <h2>Test verileri</h2>
      </div>
      <p>
        Kullanıcı adı, parola gibi değerleri bir kez kaydet; prompt ve
        suite’lerde <code>{"{{ANAHTAR}}"}</code> olarak kullan. Değerler yalnız
        çalıştırma anında worker’da çözülür. Gizli değerler şifreli saklanır,
        tarayıcıya ve AI sağlayıcısına gönderilmez.
      </p>
      <div className="test-variable-form">
        <label>
          Anahtar
          <input
            aria-label="Test verisi anahtarı"
            placeholder="SAUCE_USER"
            value={form.key}
            onChange={(e) =>
              setForm({
                ...form,
                key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
              })
            }
          />
        </label>
        <label>
          Değer
          <input
            aria-label="Test verisi değeri"
            type={form.secret ? "password" : "text"}
            autoComplete="off"
            placeholder={editing ? "Değiştirmiyorsan boş bırak" : "Değer"}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </label>
        <label>
          Kapsam
          <select
            aria-label="Test verisi kapsamı"
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
          >
            <option value="">Tüm hedefler</option>
            {[...new Set(["http://127.0.0.1:4100", ...origins])].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="test-variable-secret">
          <input
            type="checkbox"
            checked={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.checked })}
          />
          Gizli
        </label>
        <div className="ai-actions">
          <button
            className="primary"
            disabled={
              busy || !canEdit || !form.key.trim() || (!editing && !form.value)
            }
            onClick={() => void save()}
          >
            <Plus size={15} /> {editing ? "Güncelle" : "Ekle"}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Vazgeç
            </button>
          )}
        </div>
      </div>
      {!variables.length ? (
        <p className="small-tag">Henüz test verisi yok.</p>
      ) : (
        <table className="test-variable-table">
          <thead>
            <tr>
              <th>Referans</th>
              <th>Değer</th>
              <th>Kapsam</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variables.map((v) => (
              <tr key={v.id}>
                <td>
                  <code>{`{{${v.key}}}`}</code>
                </td>
                <td>
                  {v.secret ? (
                    <span className="test-variable-masked">
                      <KeyRound size={13} /> ••••••
                    </span>
                  ) : (
                    v.value
                  )}
                </td>
                <td>{v.origin ?? "Tüm hedefler"}</td>
                <td className="test-variable-row-actions">
                  <button
                    disabled={busy || !canEdit}
                    onClick={() => {
                      setEditing(v.id);
                      setForm({
                        key: v.key,
                        value: "",
                        secret: v.secret,
                        origin: v.origin ?? "",
                      });
                    }}
                  >
                    Düzenle
                  </button>
                  <button
                    aria-label={`${v.key} sil`}
                    disabled={busy || !canEdit}
                    onClick={() =>
                      void task(async () => {
                        await api(`${root}/${v.id}`, "DELETE");
                        await load();
                        setNotice(`{{${v.key}}} silindi.`);
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
