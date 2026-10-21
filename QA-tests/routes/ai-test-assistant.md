# Sayfa analizi — AI Test Assistant (`/` → kenar çubuğu "AI Test Assistant")

> **Statik analiz.** Tarayıcı kullanılmadı; aşağıdaki JSON yalnız kaynak koddan çıkarıldı
> (`apps/web/app/components/ai-assistant.tsx` chat modu, `model-comparison.tsx`, `quality-findings.tsx`,
> `ai-suite-list.tsx`; doğrulama/hata metinleri `apps/api/src/assistant.ts`, `apps/api/src/comparisons.ts`,
> `apps/api/src/promoted-tests.ts`, `apps/api/src/app.ts`, `packages/assistant/src/{spec,agent,quality,variables}.ts`,
> `apps/worker/src/main.ts`). Arayüz hataları her zaman `<mesaj> (<KOD>)` biçiminde `p[role=alert].error` içinde gösterilir.
>
> **Ortam riski:** API'nin CSRF kontrolü yalnız `127.0.0.1/localhost` + port 3000, 5000 ve `ZC_WEB_PORT` origin'lerini kabul eder.
> Web `http://127.0.0.1:5173` üzerinde çalışıyorsa `ZC_WEB_PORT=5173` ayarlı olmalıdır; aksi hâlde her POST
> `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` ile reddedilir.

```json
{
  "analysisMode": "static",
  "slug": "ai-test-assistant",
  "route": "/",
  "section": "assistant",
  "navigation": "Kenar çubuğu düğmesi \"AI Test Assistant\"",
  "sourceFile": "apps/web/app/components/ai-assistant.tsx",
  "supportingFiles": [
    "apps/web/app/components/model-comparison.tsx",
    "apps/web/app/components/quality-findings.tsx",
    "apps/web/app/components/ai-suite-list.tsx",
    "apps/web/app/page.tsx",
    "apps/web/app/lib/api.ts",
    "apps/api/src/app.ts",
    "apps/api/src/assistant.ts",
    "apps/api/src/comparisons.ts",
    "apps/api/src/promoted-tests.ts",
    "apps/worker/src/main.ts",
    "packages/assistant/src/spec.ts",
    "packages/assistant/src/agent.ts",
    "packages/assistant/src/quality.ts",
    "packages/assistant/src/variables.ts"
  ],
  "title": "AI Test Assistant",
  "pageHeading": {
    "h1": "AI Test Assistant",
    "subtitle": "İzinli hedefi incele, senaryoları gözden geçir ve suite çalıştır.",
    "breadcrumb": "PROJE / WEB · CHROMIUM",
    "chatEyebrow": "AI TEST ASSISTANT",
    "chatH2": "Testleri birlikte oluştur"
  },
  "requiresAuth": true,
  "authNote": "Kimlik bilgisi yok; karşılama ekranındaki \"Yerel çalışma alanını aç\" düğmesi rolü admin olan yerel demo oturumu açar. viewer rolünde canEdit=false: Gönder, Karşılaştır, Onayla ve kaydet, Çalıştır, Yeni taslak olarak düzelt devre dışı ve yetkilendirme kutusu gizli. UI'dan viewer oturumu açılamaz.",
  "rolesAllowed": ["admin"],
  "preconditionsData": [
    "Ayarlar'da aktif bir OpenAI-compatible provider ve model",
    "Ayarlar → Test edilecek siteler listesinde https://www.saucedemo.com",
    "Ayarlar'da test verisi SAUCE_USER ve SAUCE_PASSWORD (gizli) tanımlı"
  ],
  "forms": [
    {
      "id": "chat-composer",
      "submit": "Gönder",
      "submitEndpoint": "POST /v1/projects/:projectId/ai/messages (202)",
      "clientDisabledWhen": "busy || !canEdit || !providerId || !model || prompt.trim().length < 10",
      "fields": [
        {
          "name": "Aktif provider",
          "selector": "select[aria-label='Aktif provider']",
          "type": "select",
          "required": true,
          "rules": "Yalnız active provider'lar listelenir; boşsa ipucu 'Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı ekle.' görünür",
          "sampleValid": "<aktif provider adı>",
          "sampleInvalid": "(liste boş)"
        },
        {
          "name": "Chat modeli",
          "selector": "input[aria-label='Chat modeli']",
          "type": "text",
          "required": true,
          "rules": "trim 1..120 (sunucu); provider seçilince provider.model ile dolar",
          "sampleValid": "<provider'ın kayıtlı model ID'si>",
          "sampleInvalid": ["", "121 × 'm'"]
        },
        {
          "name": "Hedef URL",
          "label": "Yetkili hedef URL",
          "selector": "input[aria-label='Hedef URL']",
          "type": "text",
          "default": "http://127.0.0.1:4100/login",
          "rules": "z.url().max(1000); protokol http/https; kullanıcı adı/parola/hash yok; origin yetkili listede; harici origin HTTPS. Prompt içindeki ilk http(s) URL bu alanı geçersiz kılar.",
          "sampleValid": "https://www.saucedemo.com/",
          "sampleInvalid": {
            "notUrl": "saucedemo",
            "unauthorizedHttps": "https://example.com/",
            "httpExternal": "http://example.com/",
            "withHash": "https://www.saucedemo.com/#qa"
          }
        },
        {
          "name": "Test isteği",
          "selector": "textarea[aria-label='Test isteği']",
          "type": "textarea",
          "required": true,
          "rules": "trim min 10 (istemci düğmeyi kilitler) / max 2000 (sunucu INVALID_INPUT); {{KEY}} test verisi referansları (KEY: ^[A-Z][A-Z0-9_]{0,63}$); fill değerleri istekte birebir geçmeli",
          "placeholder": "Örnek: Login sayfasını analiz et; pozitif, negatif ve sınır senaryolarını hazırla.",
          "sampleValid": "[QA-{runId}] saucedemo'da {{SAUCE_USER}} ve {{SAUCE_PASSWORD}} ile giriş yap, ürünü sepete ekle, ödeme bilgilerine ad 'QA', soyad 'Test', posta kodu '34000' yaz ve siparişi tamamla. Pozitif ve negatif senaryoları hazırla.",
          "sampleInvalid": {
            "tooShort": "giriş yap",
            "whitespace9": "  test    ",
            "tooLong": "2001 × 'a'"
          }
        }
      ],
      "errors": {
        "INVALID_INPUT": "Alanları kontrol edin. (INVALID_INPUT)",
        "TARGET_BLOCKED_unauthorized": "Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)",
        "TARGET_BLOCKED_unsupported": "Hedef URL desteklenmiyor. (TARGET_BLOCKED)",
        "TARGET_BLOCKED_invalid": "Geçersiz hedef URL. (TARGET_BLOCKED)",
        "TARGET_BLOCKED_http": "Harici hedef HTTPS kullanmalı. (TARGET_BLOCKED)",
        "PROVIDER_INACTIVE": "Aktif provider seçin. (PROVIDER_INACTIVE)",
        "QUEUE_FULL": "Kuyruk dolu. (QUEUE_FULL)",
        "FORBIDDEN": "Düzenleme yetkisi gerekli. (FORBIDDEN)",
        "CSRF_BLOCKED": "İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)"
      }
    },
    {
      "id": "authorize-from-chat",
      "visibleWhen": "TARGET_BLOCKED sonrası pendingTarget https:// ile başlıyor ve canEdit",
      "texts": {
        "notListed": "<origin> henüz yetkili hedeflerde yok.",
        "alreadyListed": "Site listede kayıtlı. Kodu güncelledikten sonra çalışan sunucuyu bir kez yeniden başlat."
      },
      "submit": "Siteyi ekle ve tekrar gönder",
      "submitEndpoint": "POST /v1/ai/authorized-origins + POST messages",
      "serverRule": "Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED) — IP, port, localhost, kullanıcı bilgisi reddedilir",
      "resetWhen": "Hedef URL veya Test isteği değişince kutu kaybolur"
    },
    {
      "id": "compare-composer",
      "toggle": "Modelleri karşılaştır (2–3 model, tek keşif)",
      "submit": "Karşılaştır",
      "submitEndpoint": "POST /v1/projects/:projectId/ai/comparisons",
      "clientDisabledWhen": "busy || !canEdit || entries < 2 || herhangi bir provider/model boş || prompt.trim().length < 10",
      "fields": [
        {"name": "Karşılaştırma provider N", "type": "select", "sampleValid": "<provider adı>"},
        {"name": "Karşılaştırma modeli N", "type": "text", "placeholder": "Model ID", "rules": "trim 1..120", "sampleValid": ["<model A>", "<model B>"], "sampleInvalid": ["", "   "]}
      ],
      "buttons": ["Modelleri getir", "Model ekle (yalnız < 3 iken)", "Model N kaldır (yalnız > 2 iken)"],
      "notices": {
        "fetched": "<N> model yüklendi.",
        "sent": "Keşif bir kez çalışacak; ardından her model aynı keşiften senaryo üretecek."
      },
      "hint": "Keşfi ilk model yönetir; her model için ayrı üretim çağrısı yapılır."
    },
    {
      "id": "draft-json-editor",
      "open": "Taslağı düzenle",
      "field": {"name": "Suite taslağı", "label": "Kaydetmeden önce suite JSON’unu düzenle", "type": "textarea"},
      "submit": "Onayla ve kaydet",
      "submitEndpoint": "POST /v1/projects/:projectId/ai/drafts/:id/save (201)",
      "successNotice": "Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.",
      "schema": "title trim 3..120; targetUrl taslak hedefiyle aynı; scenarios 1..10; her senaryo title 3..160, category positive|negative|edge, actions 1..20; toplam ≤120 aksiyon; her senaryoda ≥1 assert*; locator'lar gözlenen sayfalarda olmalı",
      "sampleInvalid": {
        "brokenJson": "ilk '{' karakteri silinmiş JSON",
        "shortTitle": "\"title\": \"ab\"",
        "noAssertion": "bir senaryodan tüm assert* aksiyonları silinmiş",
        "changedTarget": "\"targetUrl\": \"https://www.saucedemo.com/inventory.html\"",
        "unobservedLocator": "{\"kind\":\"id\",\"value\":\"qa-yok\"}",
        "foreignAssertUrl": "{\"kind\":\"assertUrl\",\"expected\":\"https://example.com/\"}",
        "badCategory": "\"category\": \"smoke\""
      },
      "errors": {
        "json": "JSON.parse SyntaxError metni (ör. 'Unexpected token ...')",
        "INVALID_INPUT": "Alanları kontrol edin. (INVALID_INPUT)",
        "ASSERTION_REQUIRED": "Her senaryoda doğrulama olmalı. (ASSERTION_REQUIRED)",
        "TARGET_BLOCKED_change": "Hedef değiştirilemez. (TARGET_BLOCKED)",
        "UNOBSERVED_LOCATOR": "Locator incelenen sayfalarda yok. (UNOBSERVED_LOCATOR)",
        "TARGET_BLOCKED_url": "URL hedef dışı. (TARGET_BLOCKED)",
        "DRAFT_NOT_READY": "Taslak hazır değil. (DRAFT_NOT_READY)"
      }
    }
  ],
  "buttons": [
    {"label": "Yeni konuşma", "action": "Thread, taslak, karşılaştırma, run ve bekleyen hedef temizlenir; ai-empty 'Bir hedef ve test isteği yaz' görünür"},
    {"label": "<konuşma başlığı>", "region": "KONUŞMALAR", "action": "Konuşmayı yükler; başlık = isteğin ilk 80 karakteri; seçili olan .selected"},
    {"label": "Gönder", "action": "AI işi kuyruğa alınır"},
    {"label": "Karşılaştır", "action": "Karşılaştırma işi"},
    {"label": "Taslağı düzenle", "action": "Suite taslağı textarea'sını açar"},
    {"label": "Onayla ve kaydet", "action": "Taslağı suite olarak kaydeder (AI kendiliğinden kaydetmez/çalıştırmaz)"},
    {"label": "Onayla", "region": "Model karşılaştırması", "action": "Taslak onaylandı ve suite olarak kaydedildi."},
    {"label": "<model> suite'ini çalıştır", "region": "Model karşılaştırması", "action": "Suite run"},
    {"label": "Çalıştır", "region": "Kaydedilen suite’ler", "action": "POST suites/:id/runs; 'Suite çalışması · queued'"},
    {"label": "Yeni taslak olarak düzelt", "action": "Kayıtlı keşifle yeni taslak; notice 'Kayıtlı keşif kullanılarak düzeltilmiş taslak üretiliyor; hazır olunca düzenleyebilirsin.'"},
    {"label": "Siteyi ekle ve tekrar gönder", "action": "Origin yetkilendirilir ve istek tekrar gönderilir"},
    {"label": "Adım görüntüsü / Ekran görüntüsü", "action": "Yeni sekmede PNG kanıtı (SHA-256 doğrulamalı; bozuksa EVIDENCE_CORRUPTED)"},
    {"label": "Kalıcı teste dönüştür", "region": "Testler → AI suite’ler", "action": "Değişmez, sürümlü test; 'Kalıcı test v1' etiketi; tekrar tıklanamaz (title 'Bu suite zaten kalıcı teste dönüştürüldü.')"}
  ],
  "modals": [],
  "tables": [
    {
      "id": "Model karşılaştırması",
      "columns": ["Model", "Durum", "Şema", "Senaryo", "Adım", "Doğrulama", "Kırılgan locator", "Süre", "Token (girdi / çıktı)", "Son çalıştırma", ""],
      "statusText": {"queued": "Keşif bekleniyor", "running": "Keşif sürüyor", "explored": "Üretim sırada", "generating": "Üretiliyor", "ready": "Hazır", "failed": "Başarısız"},
      "schemaText": {"first_try": "İlk denemede geçerli", "corrected": "Düzeltmeyle geçerli", "invalid": "Geçersiz"},
      "explorationLine": "Ortak keşif: <runs> kez çalıştı · <N> sayfa · <M> adım[ · erken durdu (<reason>)]. Her model aynı keşif sonucundan senaryo üretti."
    }
  ],
  "visibleStates": {
    "draftTitles": {"queued": "Sıraya alındı…", "running": "Sayfa keşfediliyor…", "explored": "Keşif tamamlandı, senaryolar üretiliyor…", "generating": "Keşif tamamlandı, senaryolar üretiliyor…", "ready": "Senaryo taslağı", "failed": "Analiz başarısız"},
    "explorationSummary": "<N> sayfa · <M> keşif adımı · <K> DOM öğesi",
    "explorationLists": ["ul[aria-label='İncelenen sayfalar'] (<başlık> · <n> öğe)", "ol[aria-label='Keşif yolu'] (ilk öğe 'Başlangıç sayfası açıldı'; adımlar '“<etiket>” tıkla' / '“<etiket>” alanına “<değer>” yaz' → '<path>' | 'aynı sayfa'; uygulanmayan adım '→ uygulanmadı'; parola değeri '••••••')"],
    "earlyStop": "Keşif erken durdu (<reason>): <mesaj> Taslak yalnız görülen sayfalara dayanıyor.",
    "stopReasons": ["done", "limit_pages", "limit_steps", "timeout", "step_failed", "invalid_step", "unobserved_locator", "value_not_in_prompt", "unknown_variable"],
    "explorationLimits": {"pages": 8, "steps": 20, "ms": 120000},
    "scenarioSummary": "<category> · <title> · <n> adım (details/summary, açılınca aksiyon listesi)",
    "assistantMessages": {
      "ready": "<N> sayfa incelendi (<M> keşif adımı, <K> element). <S> senaryo taslağı hazır.[ Keşif erken durdu: <mesaj>] Kaydetmeden önce düzenleyip onaylayın.",
      "revised": "Düzeltilmiş taslak hazır: <S> senaryo. Kaydetmeden önce düzenleyip onaylayın.",
      "compared": "<model>: <S> senaryo taslağı hazır (karşılaştırma). Kaydetmeden önce inceleyip onaylayın.",
      "runDone": "Suite tamamlandı: <p> başarılı, <f> başarısız, <s> atlandı.",
      "runAdvice": "Hata analizi: <metin>",
      "analysisFailed": "Analiz tamamlanamadı: <mesaj> (<KOD>) | Analiz tamamlanamadı: AGENT_ERROR",
      "generationFailed": "Senaryo üretimi tamamlanamadı: <mesaj> (<KOD>)"
    },
    "run": {
      "header": "Suite çalışması · <status>",
      "counts": "<p> başarılı · <f> başarısız · <s> atlandı",
      "scenario": "<title>: <status> [Hata: <KOD>]",
      "step": "<kind>[ · <hedef>]: <status> <code> [— <message>] [Adım görüntüsü]",
      "healed": "<N> adım alternatifle bulundu (self-healing). Öneriler Elementler ekranında."
    },
    "qualityFindings": {
      "list": "ul.quality-findings (yalnız bulgu varsa); 10'dan fazlaysa '… daha fazla bulgu var'",
      "summaries": ["<n> konsol hatası", "Konsol hatası yok (<k> yok sayıldı)", "<n> bağlantıdan <k> kırık", "<n> bağlantı sağlam", "<n> erişilebilirlik ihlali (<impact> ve üstü)", "Erişilebilirlik ihlali yok (<impact> ve üstü)"],
      "checkNotRun": "Erişilebilirlik taraması çalışmadı. (CHECK_NOT_RUN)"
    }
  },
  "errorCodes": {
    "ELEMENT_UNAVAILABLE": ["Üretim: 'AI kütüphanede onaylı olmayan element anahtarı önerdi.'", "Run adımı: 'Element kullanılamıyor (removed|unapproved|pinned_missing): <key>'", "Promote (409): 'Element kullanılamıyor (<neden>): <key>'"],
    "AGENT_ERROR": "Worker'da DomainError olmayan hata; taslak 'Analiz başarısız' + 'AGENT_ERROR', mesaj 'Analiz tamamlanamadı: AGENT_ERROR'",
    "UNOBSERVED_LOCATOR": "AI gözlenmeyen locator önerdi.",
    "PROVIDER_FORMAT": "Provider senaryo şemasına uymadı: <detay>",
    "PROVIDER_EMPTY": "Provider senaryo döndürmedi.",
    "PROVIDER_MISSING": "Provider silinmiş.",
    "TARGET_TIMEOUT": "Hedef sayfa 10 saniyede açılamadı.",
    "TARGET_NAVIGATION_FAILED": "Hedef sayfa Chromium ile açılamadı. Ağ/proxy erişimini kontrol edin.",
    "TARGET_TLS_ERROR": "Hedef sitenin TLS sertifikası doğrulanamadı.",
    "MISSING_VARIABLE": "Test verisi tanımlı değil: {{KEY}}",
    "runStepCodes": ["ELEMENT_NOT_FOUND", "AMBIGUOUS_ELEMENT", "ASSERTION_FAILED", "EVIDENCE_FAILED", "ACTION_FAILED", "BROWSER_ERROR", "WORKER_ERROR"]
  },
  "flows": [
    {"name": "Sohbetten suite çalıştırmaya (istek → keşif → taslak → onay → run → kanıt)", "task": "T22"},
    {"name": "Kompozitör doğrulaması, hedef yetkilendirme ve taslak JSON doğrulaması", "task": "T23"},
    {"name": "Çoklu model karşılaştırması", "task": "T24"},
    {"name": "Kalite bulguları, düzeltme taslağı, kalıcı teste dönüştürme ve ELEMENT_UNAVAILABLE", "task": "T25"}
  ],
  "observations": [
    "Chat modunda tekil taslak için doğrudan 'Onayla' düğmesi yok; onay yalnız 'Taslağı düzenle' → 'Onayla ve kaydet' ile yapılır ('Onayla' yalnız karşılaştırma tablosunda).",
    "Aynı taslak 'Onayla ve kaydet' ile tekrar kaydedilebilir; sunucuda tekillik kontrolü yok → mükerrer suite oluşabilir.",
    "Hash içeren yetkili HTTPS hedefte (https://www.saucedemo.com/#qa) hata 'Hedef URL desteklenmiyor.' iken kutu yanıltıcı biçimde 'Site listede kayıtlı. Kodu güncelledikten sonra çalışan sunucuyu bir kez yeniden başlat.' der.",
    "'Onayla ve kaydet' başarı mesajı Kaydedilen suite’ler listesini yeniler ama konuşmayı yeniden yüklemez.",
    "Web portu 5173 ise ZC_WEB_PORT=5173 olmadan tüm POST'lar CSRF_BLOCKED olur."
  ]
}
```
