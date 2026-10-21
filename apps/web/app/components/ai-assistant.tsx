"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Send, Play, Check, Trash2, RefreshCw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { AiSuite } from "../../../../packages/assistant/src/spec";
import "../assistant.css";

type Provider = {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  active: boolean;
  hasKey: boolean;
};
type AuthorizedOrigin = { id: string; origin: string; createdAt: string };
type Conversation = { id: string; title: string; created_at: string };
type Message = { id: string; role: string; content: string };
type Draft = {
  id: string;
  status: string;
  error_code: string | null;
  target_url: string;
  inspection: {
    title: string;
    elements: unknown[];
    pages: { title: string; url: string; elements: unknown[] }[];
    path: unknown[];
  } | null;
  definition: AiSuite | null;
};
type Suite = { id: string; definition: AiSuite };
type Run = {
  id: string;
  status: string;
  result: {
    counts: { passed: number; failed: number; skipped: number };
    results: {
      title: string;
      status: string;
      code?: string;
      steps: {
        kind: string;
        status: string;
        code?: string;
        screenshot?: { filename: string; sha256: string };
      }[];
      screenshot?: { filename: string; sha256: string };
    }[];
  } | null;
};
const initial = {
  name: "",
  kind: "openai-compatible",
  baseUrl: "",
  apiKey: "",
  model: "",
  timeoutMs: 15000,
};
export function AiAssistant({
  projectId,
  canEdit,
  mode,
}: {
  projectId: string;
  canEdit: boolean;
  mode: "chat" | "settings";
}) {
  const root = `/v1/projects/${projectId}/ai`;
  const [providers, setProviders] = useState<Provider[]>([]),
    [authorizedOrigins, setAuthorizedOrigins] = useState<AuthorizedOrigin[]>(
      [],
    ),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [suites, setSuites] = useState<Suite[]>([]);
  const [conversationId, setConversationId] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]);
  const [form, setForm] = useState(initial),
    [originInput, setOriginInput] = useState(""),
    [editing, setEditing] = useState(""),
    [models, setModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(""),
    [targetUrl, setTargetUrl] = useState("http://127.0.0.1:4100/login"),
    [pendingTarget, setPendingTarget] = useState(""),
    [providerId, setProviderId] = useState(""),
    [model, setModel] = useState("");
  const [editingDraft, setEditingDraft] = useState(""),
    [suiteJson, setSuiteJson] = useState(""),
    [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const loadLists = useCallback(async () => {
    const [p, c, s, o] = await Promise.all([
      api<{ providers: Provider[] }>("/v1/ai/providers"),
      api<{ conversations: Conversation[] }>(`${root}/conversations`),
      api<{ suites: Suite[] }>(`${root}/suites`),
      api<{ origins: AuthorizedOrigin[] }>("/v1/ai/authorized-origins"),
    ]);
    setProviders(p.providers);
    setAuthorizedOrigins(o.origins);
    setConversations(c.conversations);
    setSuites(s.suites);
    setProviderId((current) =>
      current && p.providers.some((x) => x.id === current && x.active)
        ? current
        : (p.providers.find((x) => x.active)?.id ?? ""),
    );
  }, [root]);
  const loadConversation = useCallback(
    async (id: string) => {
      const data = await api<{
        messages: Message[];
        drafts: Draft[];
        runs: Run[];
      }>(`${root}/conversations/${id}`);
      setConversationId(id);
      setMessages(data.messages);
      setDrafts(data.drafts);
      setRun(data.runs[0] ?? null);
    },
    [root],
  );
  useEffect(() => {
    void loadLists().catch((e) => setError(String(e)));
  }, [loadLists]);
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      void loadConversation(conversationId).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [conversationId, loadConversation]);
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const interval = setInterval(() => {
      void api<Run>(`${root}/runs/${run.id}`)
        .then(setRun)
        .catch(() => {});
    }, 1200);
    return () => clearInterval(interval);
  }, [run, root]);
  useEffect(() => {
    const selected = providers.find((p) => p.id === providerId);
    if (selected) setModel(selected.model);
  }, [providerId, providers]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function editProvider(p: Provider) {
    setEditing(p.id);
    setForm({
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      apiKey: "",
      model: p.model,
      timeoutMs: p.timeoutMs,
    });
    setModels([]);
  }
  async function submitPrompt(selectedTarget: string) {
    const response = await api<{ conversationId: string }>(
      `${root}/messages`,
      "POST",
      {
        conversationId: conversationId || undefined,
        prompt,
        targetUrl: selectedTarget,
        providerId,
        model,
      },
    );
    setTargetUrl(selectedTarget);
    setPrompt("");
    setPendingTarget("");
    await loadLists();
    await loadConversation(response.conversationId);
  }
  async function send() {
    await task(async () => {
      const promptUrl = prompt
        .match(/https?:\/\/[^\s<>"']+/i)?.[0]
        .replace(/[),.;!?]+$/g, "");
      const selectedTarget = promptUrl ?? targetUrl;
      try {
        await submitPrompt(selectedTarget);
      } catch (error) {
        if (error instanceof ApiError && error.code === "TARGET_BLOCKED")
          setPendingTarget(selectedTarget);
        throw error;
      }
    });
  }
  async function authorizeAndSend() {
    await task(async () => {
      await api("/v1/ai/authorized-origins", "POST", {
        url: pendingTarget,
      });
      await submitPrompt(pendingTarget);
    });
  }
  async function saveDraft(id: string) {
    await task(async () => {
      const suite = JSON.parse(suiteJson) as AiSuite;
      await api(`${root}/drafts/${id}/save`, "POST", suite);
      setEditingDraft("");
      await loadLists();
      setNotice(
        "Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.",
      );
    });
  }
  async function startRun(id: string) {
    await task(async () => {
      const result = await api<{ id: string }>(
        `${root}/suites/${id}/runs`,
        "POST",
        {},
      );
      setRun({ id: result.id, status: "queued", result: null });
    });
  }
  async function revise(id: string) {
    await task(async () => {
      const response = await api<{ draftId: string; conversationId: string }>(
        `${root}/suites/${id}/revise`,
        "POST",
        {},
      );
      await loadConversation(response.conversationId);
      const updated = await api<{ drafts: Draft[] }>(
        `${root}/conversations/${response.conversationId}`,
      );
      const draft = updated.drafts.find((d) => d.id === response.draftId);
      if (draft?.definition) {
        setEditingDraft(draft.id);
        setSuiteJson(JSON.stringify(draft.definition, null, 2));
      }
    });
  }
  const selected = providers.find((p) => p.id === providerId);
  return (
    <>
      {mode === "chat" && (
        <div className="ai-layout">
          <aside className="ai-history card">
            <button
              className="primary"
              onClick={() => {
                setConversationId("");
                setMessages([]);
                setDrafts([]);
                setRun(null);
                setPendingTarget("");
              }}
            >
              <Plus size={16} /> Yeni konuşma
            </button>
            <span className="eyebrow">KONUŞMALAR</span>
            {conversations.map((c) => (
              <button
                key={c.id}
                className={conversationId === c.id ? "selected" : ""}
                onClick={() => void task(() => loadConversation(c.id))}
              >
                {c.title}
              </button>
            ))}
          </aside>
          <section className="ai-chat card">
            <div className="ai-chat-head">
              <div>
                <span className="eyebrow">AI TEST ASSISTANT</span>
                <h2>Testleri birlikte oluştur</h2>
                <p>
                  İzinli sayfayı Chromium ile incele, senaryoları gözden geçir
                  ve çalıştır.
                </p>
              </div>
            </div>
            <div className="ai-provider-row">
              <label>
                Provider
                <select
                  aria-label="Aktif provider"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  {providers
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Model
                <input
                  aria-label="Chat modeli"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
            </div>
            {!providers.some((p) => p.active) && (
              <p className="ai-config-hint">
                Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı
                ekle.
              </p>
            )}
            <div className="ai-thread" aria-live="polite">
              {!messages.length && (
                <div className="ai-empty">
                  <Bot size={32} />
                  <h3>Bir hedef ve test isteği yaz</h3>
                  <p>
                    Örnek: Giriş formunu incele; boş alan ve yanlış bilgi
                    senaryoları hazırla.
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`ai-message ${m.role}`}>
                  <strong>{m.role === "user" ? "Sen" : "AI Assistant"}</strong>
                  <p>{m.content}</p>
                </div>
              ))}
              {drafts.map((d) => (
                <div className="ai-draft" key={d.id}>
                  <strong>
                    {d.status === "ready"
                      ? "Senaryo taslağı"
                      : d.status === "failed"
                        ? "Analiz başarısız"
                        : "Sayfa inceleniyor…"}
                  </strong>
                  {d.error_code && <p>{d.error_code}</p>}
                  {d.inspection && (
                    <>
                      <p>
                        {d.inspection.pages.length} sayfa ·{" "}
                        {d.inspection.path.length} keşif adımı ·{" "}
                        {d.inspection.elements.length} DOM öğesi
                      </p>
                      <ul aria-label="İncelenen sayfalar">
                        {d.inspection.pages.map((p) => (
                          <li key={p.url}>
                            {p.title || p.url} · {p.elements.length} öğe
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {d.definition && (
                    <>
                      <h3>{d.definition.title}</h3>
                      {d.definition.scenarios.map((s, i) => (
                        <p key={i}>
                          {s.category} · {s.title} · {s.actions.length} adım
                        </p>
                      ))}
                      {editingDraft === d.id ? (
                        <>
                          <label>
                            Kaydetmeden önce suite JSON’unu düzenle
                            <textarea
                              aria-label="Suite taslağı"
                              rows={15}
                              value={suiteJson}
                              onChange={(e) => setSuiteJson(e.target.value)}
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={busy || !canEdit}
                            onClick={() => void saveDraft(d.id)}
                          >
                            <Check size={15} /> Onayla ve kaydet
                          </button>
                        </>
                      ) : (
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditingDraft(d.id);
                            setSuiteJson(JSON.stringify(d.definition, null, 2));
                          }}
                        >
                          Taslağı düzenle
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              {run && (
                <div className="ai-run">
                  <strong>Suite çalışması · {run.status}</strong>
                  {run.result?.counts && (
                    <p>
                      {run.result.counts.passed} başarılı ·{" "}
                      {run.result.counts.failed} başarısız ·{" "}
                      {run.result.counts.skipped} atlandı
                    </p>
                  )}
                  {run.result?.results?.map((r, i) => (
                    <div key={i}>
                      <strong>
                        {r.title}: {r.status}
                      </strong>
                      {r.code && <p>Hata: {r.code}</p>}
                      {r.steps.map((step, n) => (
                        <p key={n}>
                          {step.kind}: {step.status} {step.code ?? ""}{" "}
                          {step.screenshot && (
                            <a
                              target="_blank"
                              rel="noreferrer"
                              href={`/api${root}/runs/${run.id}/screenshots/${i}/steps/${n}`}
                            >
                              Adım görüntüsü
                            </a>
                          )}
                        </p>
                      ))}
                      {r.screenshot && (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`/api${root}/runs/${run.id}/screenshots/${i}`}
                        >
                          Ekran görüntüsü
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {suites.length > 0 && (
              <div className="ai-suites">
                <strong>Kaydedilen suite’ler</strong>
                {suites.map((s) => (
                  <div key={s.id}>
                    <span>
                      {s.definition.title} · {s.definition.scenarios.length}{" "}
                      senaryo
                    </span>
                    <button
                      className="secondary"
                      disabled={busy || !canEdit}
                      onClick={() => void startRun(s.id)}
                    >
                      <Play size={14} /> Çalıştır
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || !canEdit}
                      onClick={() => void revise(s.id)}
                    >
                      Yeni taslak olarak düzelt
                    </button>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {pendingTarget.startsWith("https://") && canEdit && (
              <div className="ai-authorize">
                {authorizedOrigins.some(
                  (site) => site.origin === new URL(pendingTarget).origin,
                ) ? (
                  <span>
                    Site listede kayıtlı. Kodu güncelledikten sonra çalışan
                    sunucuyu bir kez yeniden başlat.
                  </span>
                ) : (
                  <>
                    <span>
                      {new URL(pendingTarget).origin} henüz yetkili hedeflerde
                      yok.
                    </span>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void authorizeAndSend()}
                    >
                      Siteyi ekle ve tekrar gönder
                    </button>
                  </>
                )}
              </div>
            )}
            {notice && <p role="status">{notice}</p>}
            <div className="ai-composer">
              <label>
                Yetkili hedef URL
                <input
                  aria-label="Hedef URL"
                  value={targetUrl}
                  onChange={(e) => {
                    setTargetUrl(e.target.value);
                    setPendingTarget("");
                  }}
                />
              </label>
              <textarea
                aria-label="Test isteği"
                rows={3}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPendingTarget("");
                }}
                placeholder="Örnek: Login sayfasını analiz et; pozitif, negatif ve sınır senaryolarını hazırla."
              />
              <button
                className="primary"
                disabled={
                  busy ||
                  !canEdit ||
                  !providerId ||
                  !model ||
                  prompt.trim().length < 10
                }
                onClick={() => void send()}
              >
                <Send size={16} /> Gönder
              </button>
            </div>
          </section>
        </div>
      )}
      {mode === "settings" && (
        <div className="ai-settings-page">
          <div className="ai-settings-card card">
            <div>
              <span className="eyebrow">YETKİLİ HEDEFLER</span>
              <h2>Test edilecek siteler</h2>
            </div>
            <p>
              Bir sitenin HTTPS adresini ekle. Aynı origin altındaki sayfalar
              chat ve suite çalıştırmalarında hemen kullanılabilir.
            </p>
            <div className="ai-origin-entry">
              <input
                aria-label="Hedef site URL"
                placeholder="https://www.saucedemo.com/"
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
              />
              <button
                className="primary"
                disabled={busy || !canEdit || !originInput.trim()}
                onClick={() =>
                  void task(async () => {
                    await api("/v1/ai/authorized-origins", "POST", {
                      url: originInput.trim(),
                    });
                    setOriginInput("");
                    await loadLists();
                    setNotice("Hedef site eklendi; yeniden başlatma gerekmez.");
                  })
                }
              >
                <Plus size={15} /> Site ekle
              </button>
            </div>
            <p>Yerel demo: http://127.0.0.1:4100</p>
            {authorizedOrigins.map((site) => (
              <div className="ai-provider-item" key={site.id}>
                <span>{site.origin}</span>
                <button
                  aria-label={`${site.origin} sil`}
                  disabled={busy || !canEdit}
                  onClick={() =>
                    void task(async () => {
                      await api(
                        `/v1/ai/authorized-origins/${site.id}`,
                        "DELETE",
                      );
                      await loadLists();
                      setNotice("Hedef site kaldırıldı.");
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="ai-settings-card card">
            <div className="ai-chat-head">
              <div>
                <span className="eyebrow">AI PROVIDER</span>
                <h2>Sağlayıcı bağlantıları</h2>
              </div>
            </div>
            <p>
              OpenAI-compatible provider · API anahtarı yalnız sunucuda şifreli
              saklanır.
            </p>
            <div className="ai-settings-grid">
              <label>
                Provider adı
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Provider tipi
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                >
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>
              <label>
                Custom Base URL
                <input
                  placeholder="https://api.example.com/v1"
                  value={form.baseUrl}
                  onChange={(e) =>
                    setForm({ ...form, baseUrl: e.target.value })
                  }
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    editing ? "Değiştirmiyorsan boş bırak" : "API Key"
                  }
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                />
              </label>
              <label>
                Model
                {models.length ? (
                  <select
                    value={form.model}
                    onChange={(e) =>
                      setForm({ ...form, model: e.target.value })
                    }
                  >
                    <option value="">Model seç</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.model}
                    onChange={(e) =>
                      setForm({ ...form, model: e.target.value })
                    }
                    placeholder="Manuel model ID"
                  />
                )}
              </label>
              <label>
                Timeout (ms)
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  value={form.timeoutMs}
                  onChange={(e) =>
                    setForm({ ...form, timeoutMs: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="ai-actions">
              <button
                className="secondary"
                disabled={busy || !form.apiKey}
                onClick={() =>
                  void task(async () => {
                    await api("/v1/ai/providers/connection", "POST", form);
                    setNotice("Gerçek provider bağlantısı başarılı.");
                  })
                }
              >
                <RefreshCw size={15} /> Test Connection
              </button>
              <button
                className="secondary"
                disabled={busy || !form.apiKey}
                onClick={() =>
                  void task(async () => {
                    const data = await api<{ models: string[] }>(
                      "/v1/ai/providers/models",
                      "POST",
                      form,
                    );
                    setModels(data.models);
                    setNotice(
                      data.models.length
                        ? `${data.models.length} model yüklendi.`
                        : "Model listesi boş; ID’yi elle girebilirsin.",
                    );
                  })
                }
              >
                Fetch Models
              </button>
              <button
                className="primary"
                disabled={busy || !canEdit || (!editing && !form.apiKey)}
                onClick={() =>
                  void task(async () => {
                    await api(
                      `/v1/ai/providers${editing ? `/${editing}` : ""}`,
                      editing ? "PUT" : "POST",
                      form,
                    );
                    setForm(initial);
                    setEditing("");
                    await loadLists();
                    setNotice("Provider kaydedildi.");
                  })
                }
              >
                Save Provider
              </button>
            </div>
            <h3>Kayıtlı provider’lar</h3>
            {providers.map((p) => (
              <div className="ai-provider-item" key={p.id}>
                <span>
                  {p.name} · {p.model} {p.active && "· Aktif"}
                </span>
                <button onClick={() => editProvider(p)}>Düzenle</button>
                {!p.active && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        await api(
                          `/v1/ai/providers/${p.id}/activate`,
                          "POST",
                          {},
                        );
                        await loadLists();
                      })
                    }
                  >
                    Aktif yap
                  </button>
                )}
                <button
                  aria-label={`${p.name} sil`}
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await api(`/v1/ai/providers/${p.id}`, "DELETE");
                      await loadLists();
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
          </div>
        </div>
      )}
    </>
  );
}
