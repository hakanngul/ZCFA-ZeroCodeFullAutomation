# Sayfa analizi — `/` → Ayarlar bölümü

> **Statik analiz.** Bu analiz tarayıcı açılmadan, yalnız kaynak kod okunarak üretildi (`analysisMode: "static"`).
> Doğrulama mesajları ve kodları şu dosyalardan birebir alındı: `ai-assistant.tsx` (settings modu), `test-variables.tsx`,
> `self-healing-setting.tsx`, `apps/api/src/assistant.ts`, `apps/api/src/test-variables.ts`, `apps/api/src/app.ts`
> (hata işleyici), `apps/web/app/lib/api.ts` (hata metni biçimi), `packages/assistant/src/provider.ts`,
> `packages/assistant/src/variables.ts`.
>
> Önemli kural: API'den dönen her hata arayüzde `"<message> (<code>)"` biçiminde görünür. Zod doğrulama hataları
> alan bazında mesaj üretmez; hepsi `Alanları kontrol edin. (INVALID_INPUT)` olarak görünür (anahtar regex'inin
> özel mesajı `Anahtar BÜYÜK_HARF, rakam ve _ içermeli.` arayüze ulaşmaz).

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "settings",
  "sectionLabel": "Ayarlar",
  "sourceFile": "apps/web/app/components/ai-assistant.tsx",
  "relatedSourceFiles": [
    "apps/web/app/components/test-variables.tsx",
    "apps/web/app/components/self-healing-setting.tsx",
    "apps/web/app/page.tsx",
    "apps/web/app/lib/api.ts",
    "apps/api/src/assistant.ts",
    "apps/api/src/test-variables.ts",
    "apps/api/src/self-healing.ts",
    "apps/api/src/app.ts",
    "packages/assistant/src/provider.ts",
    "packages/assistant/src/variables.ts"
  ],
  "devUrl": "http://127.0.0.1:5173",
  "requiresAuth": true,
  "authMechanism": "Yerel demo oturumu: giriş ekranındaki \"Yerel çalışma alanını aç\" butonu POST /v1/session/local çağırır, httpOnly zc_session çerezi kurar. Kimlik bilgisi yoktur. Aktör her zaman role=admin.",
  "rolesAllowed": [],
  "roleNotes": "Arayüzden yalnız admin oturumu açılabilir. viewer rolünde canEdit=false olur ve API yazma isteklerini 'Düzenleme yetkisi gerekli. (FORBIDDEN)' ile reddeder; viewer oturumu UI'dan üretilemediği için yalnız not olarak belgelendi.",
  "entry": [
    "http://127.0.0.1:5173 aç",
    "\"Yerel çalışma alanını aç\" butonuna tıkla",
    "Sol menüde \"Ayarlar\" butonuna tıkla"
  ],
  "cards": [
    { "eyebrow": "YETKİLİ HEDEFLER", "heading": "Test edilecek siteler" },
    { "eyebrow": "TEST VERİLERİ", "heading": "Test verileri", "id": "test-variables" },
    { "eyebrow": "ÇALIŞTIRMA", "heading": "Self-healing", "ariaLabel": "Self-healing ayarı" },
    { "eyebrow": "AI PROVIDER", "heading": "Sağlayıcı bağlantıları" }
  ],
  "feedbackRegions": [
    { "owner": "AiAssistant (Test edilecek siteler + Sağlayıcı bağlantıları)", "location": "\"Sağlayıcı bağlantıları\" kartının en altı", "success": "p[role=status]", "error": "p[role=alert].error", "note": "Site ekle/sil bildirimleri ve hataları da bu kartın altında görünür, site kartında değil." },
    { "owner": "TestVariables", "location": "\"Test verileri\" kartının altı", "success": "p[role=status]", "error": "p[role=alert].error" },
    { "owner": "SelfHealingSetting", "location": "\"Self-healing\" kartı", "success": "p[role=status]", "error": "p[role=alert] (metin String(error) → 'Error: <mesaj> (<kod>)' veya 'TypeError: Failed to fetch')" }
  ],
  "forms": [
    {
      "id": "authorized-origin-form",
      "card": "Test edilecek siteler",
      "endpoint": "POST /v1/ai/authorized-origins { url }",
      "submit": "Site ekle",
      "submitDisabledWhen": "busy || !canEdit || originInput.trim() boş",
      "successNotice": "Hedef site eklendi; yeniden başlatma gerekmez.",
      "fields": [
        {
          "name": "url",
          "ariaLabel": "Hedef site URL",
          "placeholder": "https://www.saucedemo.com/",
          "type": "text",
          "required": true,
          "rules": "z.url().max(1000); protokol https: olmalı; kullanıcı adı/parola, port, IP host, localhost, *.localhost yasak; kayıt origin'e normalize edilir; aynı origin tekrar eklenirse mevcut kayıt döner (çift kayıt yok).",
          "sampleValid": ["https://www.saucedemo.com/", "https://example.org/a/b?x=1 (→ https://example.org)"],
          "sampleInvalid": [
            { "value": "", "expected": "Site ekle butonu disabled" },
            { "value": "   ", "expected": "Site ekle butonu disabled" },
            { "value": "bu bir url degil", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
            { "value": "http://example.com", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://localhost", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://app.localhost", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://127.0.0.1", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://example.com:8443", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://user:pass@example.com", "expected": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)" },
            { "value": "https://example.com/ + 1000 × 'a'", "expected": "Alanları kontrol edin. (INVALID_INPUT)" }
          ]
        }
      ]
    },
    {
      "id": "test-variable-form",
      "card": "Test verileri",
      "endpoint": "POST /v1/projects/:projectId/test-variables | PUT .../:id",
      "submit": "Ekle (düzenleme modunda: Güncelle)",
      "cancel": "Vazgeç (yalnız düzenleme modunda)",
      "submitDisabledWhen": "busy || !canEdit || key.trim() boş || (yeni kayıtta value boş)",
      "successNotice": "{{<KEY>}} kaydedildi. Yayınlanmış testler referansı saklar; yeni değer sonraki çalıştırmada kullanılır.",
      "fields": [
        {
          "name": "key",
          "label": "Anahtar",
          "ariaLabel": "Test verisi anahtarı",
          "placeholder": "SAUCE_USER",
          "required": true,
          "clientTransform": "Yazılan değer büyük harfe çevrilir; [A-Z0-9_] dışı her karakter '_' olur.",
          "rules": "/^[A-Z][A-Z0-9_]{0,63}$/ (harfle başlar, en fazla 64 karakter); aynı kapsam + anahtar tekil",
          "sampleValid": ["QA_USER", "qa user-1 (→ QA_USER_1)"],
          "sampleInvalid": [
            { "value": "", "expected": "Ekle disabled" },
            { "value": "1ABC", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
            { "value": "_ABC", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
            { "value": "A + 64 × 'B' (65 karakter)", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
            { "value": "aynı kapsamda mevcut anahtar", "expected": "Bu kapsamda aynı anahtar zaten var. (VARIABLE_EXISTS)" }
          ]
        },
        {
          "name": "value",
          "label": "Değer",
          "ariaLabel": "Test verisi değeri",
          "type": "text; Gizli işaretliyse password",
          "placeholder": "Değer (düzenlemede: Değiştirmiyorsan boş bırak)",
          "required": "yeni kayıtta evet; düzenlemede boş bırakılırsa saklı değer korunur",
          "rules": "z.string().min(1).max(500)",
          "sampleValid": ["qa-user-{runId}"],
          "sampleInvalid": [
            { "value": "", "expected": "Ekle disabled (yeni kayıt)" },
            { "value": "501 × 'x'", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
            { "value": "düzenlemede boş + Gizli durumunu değiştir", "expected": "Gizlilik değişince değeri yeniden girin. (VALUE_REQUIRED)" }
          ]
        },
        {
          "name": "origin",
          "label": "Kapsam",
          "ariaLabel": "Test verisi kapsamı",
          "type": "select",
          "options": "\"Tüm hedefler\" (value=''), \"http://127.0.0.1:4100\" (her zaman), + her yetkili hedef origin",
          "sampleValid": ["Tüm hedefler", "http://127.0.0.1:4100"]
        },
        {
          "name": "secret",
          "label": "Gizli",
          "type": "checkbox",
          "rules": "Gizli değer AES-256-GCM ile şifreli saklanır; GET yanıtında value=null; tabloda '••••••' maskeli görünür."
        }
      ],
      "table": {
        "columns": ["Referans", "Değer", "Kapsam", ""],
        "emptyText": "Henüz test verisi yok.",
        "rowActions": ["Düzenle", "<KEY> sil (aria-label, çöp kutusu ikonu)"],
        "deleteNotice": "{{<KEY>}} silindi."
      }
    },
    {
      "id": "self-healing-toggle",
      "card": "Self-healing",
      "endpoint": "GET/PUT /v1/projects/:projectId/settings { selfHealing }",
      "fields": [
        {
          "name": "selfHealing",
          "ariaLabel": "Self-healing",
          "label": "Self-healing (varsayılan kapalı)",
          "type": "checkbox",
          "default": false,
          "disabledWhen": "busy || !canEdit || ayar henüz yüklenmedi",
          "onNotice": "Self-healing açık; sonraki çalıştırmalarda geçerli.",
          "offNotice": "Self-healing kapalı; alternatifler denenmez."
        }
      ]
    },
    {
      "id": "ai-provider-form",
      "card": "Sağlayıcı bağlantıları",
      "endpoint": "POST /v1/ai/providers | PUT /v1/ai/providers/:id | POST /v1/ai/providers/connection | POST /v1/ai/providers/models",
      "buttons": ["Test Connection", "Fetch Models", "Save Provider"],
      "submitDisabledWhen": {
        "Test Connection": "busy || API Key boş",
        "Fetch Models": "busy || API Key boş",
        "Save Provider": "busy || !canEdit || (yeni kayıtta API Key boş)"
      },
      "notices": {
        "Test Connection": "Gerçek provider bağlantısı başarılı.",
        "Fetch Models": "<N> model yüklendi. | Model listesi boş; ID’yi elle girebilirsin.",
        "Save Provider": "Provider kaydedildi."
      },
      "fields": [
        { "name": "name", "label": "Provider adı", "rules": "trim, min 2, max 80", "sampleValid": "QA Provider {runId}", "sampleInvalid": [{ "value": "A", "expected": "Alanları kontrol edin. (INVALID_INPUT)" }, { "value": "81 × 'p'", "expected": "Alanları kontrol edin. (INVALID_INPUT)" }] },
        { "name": "kind", "label": "Provider tipi", "type": "select", "options": ["OpenAI-compatible"] },
        { "name": "baseUrl", "label": "Custom Base URL", "placeholder": "https://api.example.com/v1", "rules": "z.url().max(500); https zorunlu (istisna: ZC_AI_ALLOW_LOCAL_PROVIDER=1 iken host 127.0.0.1 için http); kullanıcı adı/parola, query, hash yasak; DNS ile çözülmeli; özel ağ adresine (10., 127., 192.168., 169.254., 172., ::1, fc/fd) çözülürse reddedilir", "sampleValid": "${QA_AI_PROVIDER_BASE_URL}", "sampleInvalid": [
          { "value": "bu-bir-url-degil", "expected": "Alanları kontrol edin. (INVALID_INPUT)" },
          { "value": "http://api.example.com/v1", "expected": "Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)" },
          { "value": "https://api.example.com/v1?x=1", "expected": "Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)" },
          { "value": "https://api.example.com/v1#frag", "expected": "Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)" },
          { "value": "https://u:p@api.example.com/v1", "expected": "Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)" },
          { "value": "http://127.0.0.1:9/v1 (ZC_AI_ALLOW_LOCAL_PROVIDER tanımsız)", "expected": "Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)" },
          { "value": "https://qa-nonexistent.invalid/v1", "expected": "Provider adresi çözümlenemedi. (PROVIDER_NETWORK)" },
          { "value": "https://localhost/v1", "expected": "Özel ağ adresi kullanılamaz. (PROVIDER_URL_BLOCKED)" }
        ] },
        { "name": "apiKey", "label": "API Key", "type": "password", "placeholder": "API Key (düzenlemede: Değiştirmiyorsan boş bırak)", "rules": "yeni kayıt/Test Connection/Fetch Models için min 1, max 500; düzenlemede boşsa saklı şifreli anahtar korunur; anahtar hiçbir GET yanıtında dönmez (yalnız hasKey)", "sampleValid": "${QA_AI_PROVIDER_KEY}", "sampleInvalid": [{ "value": "", "expected": "Save Provider / Test Connection / Fetch Models disabled" }, { "value": "qa-dummy-key-invalid (gerçek provider'a karşı)", "expected": "API anahtarı veya erişim yetkisi geçersiz. (PROVIDER_AUTH)" }] },
        { "name": "model", "label": "Model", "type": "Fetch Models sonrası select (ilk seçenek 'Model seç'), öncesinde input (placeholder 'Manuel model ID')", "rules": "trim, min 1, max 120 (kayıtta)", "sampleValid": "${QA_AI_PROVIDER_MODEL}", "sampleInvalid": [{ "value": "", "expected": "Alanları kontrol edin. (INVALID_INPUT)" }] },
        { "name": "timeoutMs", "label": "Timeout (ms)", "type": "number", "default": 15000, "rules": "int, 1000–120000", "sampleValid": 15000, "sampleInvalid": [{ "value": 999, "expected": "Alanları kontrol edin. (INVALID_INPUT)" }, { "value": 120001, "expected": "Alanları kontrol edin. (INVALID_INPUT)" }] }
      ],
      "list": {
        "heading": "Kayıtlı provider’lar",
        "rowText": "<name> · <model> [· Aktif]",
        "rowActions": ["Düzenle", "Aktif yap (yalnız pasif satırda)", "<name> sil (aria-label)"],
        "rules": "İlk kaydedilen provider otomatik aktif; aktif silinirse en yeni kalan aktif olur. Sil ve Aktif yap bildirim göstermez."
      }
    }
  ],
  "buttons": [
    { "label": "Site ekle", "destructive": false },
    { "label": "<origin> sil", "destructive": true, "confirm": false },
    { "label": "Ekle / Güncelle", "destructive": false },
    { "label": "Vazgeç", "destructive": false },
    { "label": "Düzenle (test verisi)", "destructive": false },
    { "label": "<KEY> sil", "destructive": true, "confirm": false },
    { "label": "Self-healing (checkbox)", "destructive": false },
    { "label": "Test Connection", "destructive": false },
    { "label": "Fetch Models", "destructive": false },
    { "label": "Save Provider", "destructive": false },
    { "label": "Düzenle (provider)", "destructive": false },
    { "label": "Aktif yap", "destructive": false },
    { "label": "<name> sil", "destructive": true, "confirm": false }
  ],
  "modals": [],
  "flows": [
    { "name": "Yetkili hedef site ekle/kaldır", "task": "T26" },
    { "name": "Test verisi ekle/düzenle/maskele/sil", "task": "T27" },
    { "name": "Self-healing aç/kapat", "task": "T28" },
    { "name": "AI provider ekle/test et/modelleri getir/aktif yap/sil", "task": "T29" }
  ],
  "findings": [
    "Silme işlemlerinin (site, test verisi, provider) hiçbirinde onay diyaloğu yok; tek tık kalıcı siler.",
    "Provider satırındaki 'Düzenle', 'Aktif yap' ve '<name> sil' butonları canEdit ile kilitlenmiyor (yalnız busy); viewer rolünde tıklanabilir görünür, API FORBIDDEN döner.",
    "Test Connection ve Fetch Models canEdit ile kilitlenmiyor; API ise actor(request, true) ile yazma yetkisi istiyor.",
    "Provider düzenleme modunda 'Vazgeç' butonu yok; düzenleme modundan çıkmanın tek yolu kaydetmek veya sayfayı yenilemek.",
    "Yetkili hedef site bildirim/hata metinleri site kartında değil, 'Sağlayıcı bağlantıları' kartının altında görünüyor.",
    "Aynı origin ikinci kez eklendiğinde de 'Hedef site eklendi; yeniden başlatma gerekmez.' gösteriliyor (API mevcut kaydı 200 ile döner)."
  ]
}
```
