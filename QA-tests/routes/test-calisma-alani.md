# Sayfa analizi — `/` · bölüm `tests` ("Test çalışma alanı")

> **Statik analiz.** Tarayıcı kullanılmadı; aşağıdaki JSON yalnız kaynak koddan çıkarıldı
> (`apps/web/app/page.tsx` `section === "tests"` bloğu + `editor` JSX'i, `apps/web/app/components/promoted-tests.tsx`,
> doğrulama kuralları `packages/domain/src/index.ts` `testSchema`, API `apps/api/src/app.ts` ve `apps/api/src/promoted-tests.ts`,
> koşucu davranışı `packages/runner/src/index.ts`, demo hedef `tests/fixtures/server.ts`).
> Gerçek tarayıcı koşusunda etiketler/metinler yeniden doğrulanmalıdır.

Notlar:
- Sidebar butonunun etiketi **`Testler`**'dir; sayfa başlığı (h1) **`Test çalışma alanı`**'dır. `Yeni test` butonu yalnız `overview`, `tests`, `runs` bölümlerinde görünür.
- API, yazma isteklerinde `Origin` başlığını yalnız `127.0.0.1|localhost` + port `3000`, `5000` veya `ZC_WEB_PORT` için kabul eder. Web `5173`'te çalışıyorsa `ZC_WEB_PORT=5173` ayarlı olmalıdır; aksi halde her POST `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` döner.
- Ana hata bandı (`role="alert"`, `.error-banner`) mesajı `<mesaj> (<KOD>)` biçiminde gösterir. `PromotedTests` içindeki hata `String(e)` ile `Error: <mesaj> (<KOD>)` biçimindedir.
- Olası kusur: `draft` `useMemo` bağımlılıkları `published`'ı içermez; yayın sonrası `Yeni taslak oluştur` ile aynı başlık/aynı bakiye seçimiyle tekrar yayınlamak aynı `testId` + `revision: 1` gönderir → `Yeni sürüm numarasını kullanın. (REVISION_CONFLICT)`.

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "tests",
  "slug": "test-calisma-alani",
  "devUrl": "http://127.0.0.1:5173",
  "sourceFile": "apps/web/app/page.tsx",
  "sourceFiles": [
    "apps/web/app/page.tsx",
    "apps/web/app/components/promoted-tests.tsx",
    "apps/web/app/components/ai-suite-list.tsx",
    "packages/domain/src/index.ts",
    "packages/domain/src/projections.ts",
    "apps/api/src/app.ts",
    "apps/api/src/promoted-tests.ts",
    "packages/runner/src/index.ts",
    "tests/fixtures/server.ts"
  ],
  "title": "Test çalışma alanı",
  "subtitle": "Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur.",
  "breadcrumb": "PROJE / WEB · CHROMIUM",
  "requiresAuth": true,
  "authNote": "Yerel demo oturumu: karşılama ekranında 'Yerel çalışma alanını aç' (POST /v1/session/local) → actor role=admin. Kimlik bilgisi yok.",
  "rolesAllowed": ["admin"],
  "roleNotes": "UI yalnız admin oturumu açar. role=viewer olduğunda canEdit=false (PromotedTests butonları disabled) ve API yazma uçları 'Düzenleme yetkisi gerekli. (FORBIDDEN)' döner; viewer oturumu UI ile oluşturulamaz.",
  "entry": [
    "Sidebar 'Testler' butonu",
    "Sayfa başlığındaki 'Yeni test' butonu (published=null yapar)",
    "Genel bakış 'Testini tasarla' (model varsa)",
    "Uygulama modeli 'Test tasarla' / 'Seçilen eşlemeleri onayla' sonrası"
  ],
  "dataDependencies": {
    "GET /v1/projects/:projectId": "model, tests (klasik, ≤30), runs; 1500 ms'de bir yenilenir",
    "GET /v1/projects/:projectId/ai/tests": "kalıcı AI test sürümleri (≤100) + authorized + latest + stale_elements",
    "POST /v1/projects/:projectId/tests": "klasik test yayını (201)",
    "POST /v1/tests/:id/runs": "klasik çalıştırma, body {variant}, header Idempotency-Key (202)",
    "POST /v1/projects/:projectId/ai/tests/:id/versions": "body {expectedRevision} → yeni sürüm (201)",
    "POST /v1/projects/:projectId/ai/tests/:id/runs": "body {revision} → kalıcı AI test çalıştırması (202)"
  },
  "states": [
    {"id": "no-model", "condition": "data.model == null", "visible": ["h3 'Önce uygulamanı tanıyalım'", "button 'Keşfi başlat'"]},
    {"id": "draft", "condition": "model var, published == null", "visible": ["eyebrow 'TEST TASARIMCISI'", "h2 'Bir iş akışı. Açık bir beklenti.'", "tag 'Yeni taslak'", "button 'Doğrula ve yayınla'"]},
    {"id": "published", "condition": "published != null", "visible": ["h2 'Yayınlanan test'", "tag 'Sürüm <n> · Salt okunur'", "Test adı readOnly", "button 'Testi çalıştır'", "text-button 'Yeni taslak oluştur'"], "hidden": ["'Bakiyeyi de doğrula' kutusu"]}
  ],
  "forms": [
    {
      "id": "test-designer",
      "submit": "Doğrula ve yayınla",
      "submitDisabledWhen": "busy || title.trim().length < 3 || (checkBalance && !expected.trim())",
      "fields": [
        {
          "name": "Test adı",
          "type": "text",
          "default": "Geçerli müşteri dashboard’a ulaşır",
          "required": true,
          "clientRules": {"minTrimmed": 3, "maxLength": 120},
          "serverRules": "z.string().trim().min(3).max(120) → 'Alanları kontrol edin. (INVALID_INPUT)'",
          "errorUx": "Görünür alan hatası yok; yalnız submit butonu disabled olur.",
          "sampleValid": "QA Klasik Bakiye Testi {runId}",
          "sampleInvalid": {"tooShort": "ab", "whitespaceOnly": "     ", "paddedTooShort": "  ab  ", "maxLengthOverflow": "121 × 'a' (input 120'de keser)"}
        },
        {
          "name": "Bakiyeyi de doğrula",
          "type": "checkbox",
          "default": false,
          "disabledWhen": "model.elements['dashboard.balance'].approved !== true",
          "effect": "Açılınca 3. adım 'Bakiye metni “<beklenen>” olmalı' eklenir ve 'Beklenen metin' alanı görünür",
          "sampleValid": true
        },
        {
          "name": "Beklenen metin",
          "type": "text",
          "visibleWhen": "Bakiyeyi de doğrula işaretli",
          "default": "1.250,00 TL",
          "required": true,
          "clientRules": {"nonEmptyTrimmed": true, "maxLength": 200},
          "serverRules": "z.string().min(1).max(200) (trim yok)",
          "sampleValid": "1.250,00 TL",
          "sampleInvalid": {"empty": "", "whitespaceOnly": "   ", "maxLengthOverflow": "201 × 'x' (input 200'de keser)", "wrongValue": "9.999,00 TL (yayınlanır, koşuda FAIL)"}
        }
      ]
    },
    {
      "id": "runtime-environment",
      "title": "Çalıştırma ortamı",
      "fields": [
        {"name": "Demo kontrolü", "type": "select", "default": "healthy", "options": {"healthy": "Sağlam uygulama", "broken": "Bozuk dashboard", "ambiguous": "Belirsiz giriş butonu", "slow": "Yavaş uygulama"}, "sampleValid": "Sağlam uygulama"}
      ],
      "static": ["Tarayıcı: Chromium", "Yürütme: Ayrı worker", "Kanıt: Ekran görüntüsü", "hint 'Olumsuz kontroller, gerçek uygulama hatalarının PASS olarak görünmediğini sınar.'"]
    }
  ],
  "tabs": {
    "tablist": "Test görünümü",
    "tabs": [
      {"id": "business", "label": "İş adımları", "content": ["01 'Geçerli demo hesabıyla giriş yap' + tag 'Login v<flowRev>' + 'YENİDEN KULLANILABİLİR AKIŞ'", "02 'Dashboard görünür olmalı' + 'Açık doğrulama' + 'BEKLENEN SONUÇ'", "03 (opsiyonel) 'Bakiye metni “<beklenen>” olmalı'"]},
      {"id": "flow", "label": "Akış", "content": ["Giriş sayfasını aç", "Demo bilgilerini gir", "Giriş yap", "Dashboard görünür olmalı", "(opsiyonel) Bakiye metni “<beklenen>” olmalı"]},
      {"id": "technical", "label": "Teknik", "content": ["'CanonicalTest · schemaVersion 1.0'", "<pre> JSON: schemaVersion, testId, revision, title, appModelRef, steps, executionPolicy{onStepError:'stop',maxDurationMs:15000}"]}
    ],
    "aside": "Tek model · üç görünüm",
    "a11y": "role=tab + aria-selected"
  },
  "buttons": [
    {"label": "Keşfi başlat", "state": "no-model", "action": "POST discovery-scans → bölüm 'model'"},
    {"label": "Doğrula ve yayınla", "state": "draft", "action": "POST /tests → published"},
    {"label": "Testi çalıştır", "state": "published", "action": "POST /tests/:id/runs {variant} → bölüm 'runs', run detayı"},
    {"label": "Yeni taslak oluştur", "state": "published", "action": "published=null (taslağa dön)"},
    {"label": "<klasik test öğesi>", "list": "Klasik yayınlanan testler", "action": "published=test (salt okunur görünüm)"},
    {"label": "Yeni test", "location": "page heading", "action": "published=null"},
    {"label": "Yeni sürüm oluştur", "list": "Kalıcı AI testleri", "visibleWhen": "v.stale_elements.length>0 (yalnız en son sürüm)", "disabledWhen": "!canEdit || busy===v.id", "destructive": false},
    {"label": "v<n> çalıştır", "list": "Kalıcı AI testleri", "disabledWhen": "!canEdit || !v.authorized", "action": "POST ai/tests/:id/runs → bölüm 'runs' (Kalıcı AI testi çalıştırmaları, seçili)"}
  ],
  "lists": [
    {"id": "classic-published", "title": "Klasik yayınlanan testler", "countTag": "data.tests.length", "empty": "İlk testini yayınladığında burada görünecek.", "item": "<title> / 'Test v<rev> · Model v<modelRev>'"},
    {"id": "promoted-tests", "title": "Kalıcı AI testleri", "countTag": "test grup sayısı", "empty": "Onaylı bir AI suite’i “Kalıcı teste dönüştür” ile burada sürümlü teste çevirin.", "row": "v<rev> · <n> senaryo · <m> element · <origin> · SHA-256 <12 hex>… · <tarih>", "badges": ["Origin yetkisiz", "güncel olmayan element (<n>)"], "statusMessage": "<title>: v<new> oluşturuldu (<key> v<from>→v<to>, ...). v<old> değişmedi."}
  ],
  "modals": [],
  "destructive": [],
  "errors": [
    {"code": "REVISION_CONFLICT", "where": "klasik yayın", "text": "Yeni sürüm numarasını kullanın. (REVISION_CONFLICT)"},
    {"code": "MODEL_REQUIRED", "where": "klasik yayın", "text": "Önce eşlemeleri onaylayın. (MODEL_REQUIRED)"},
    {"code": "INVALID_INPUT", "where": "şema ihlali", "text": "Alanları kontrol edin. (INVALID_INPUT)"},
    {"code": "TEST_UP_TO_DATE", "where": "Yeni sürüm oluştur", "text": "Error: Test zaten güncel element sürümlerini kullanıyor. (TEST_UP_TO_DATE)"},
    {"code": "ELEMENT_UNAVAILABLE", "where": "Yeni sürüm oluştur", "text": "Error: Yeni sürüm oluşturulamadı; kullanılamayan elementler: <key> (onaysız|silinmiş). Elementi onaylayın ya da testi yeniden üretin. (ELEMENT_UNAVAILABLE)"},
    {"code": "REVISION_CONFLICT", "where": "Yeni sürüm oluştur (eş zamanlı)", "text": "Error: Test bu arada değişti (güncel sürüm v<n>). (REVISION_CONFLICT)"},
    {"code": "FORBIDDEN", "where": "viewer yazma", "text": "Düzenleme yetkisi gerekli. (FORBIDDEN)"},
    {"code": "CSRF_BLOCKED", "where": "yanlış web portu", "text": "İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)"},
    {"code": "QUEUE_FULL", "where": "≥20 bekleyen iş", "text": "Kuyruk dolu. (QUEUE_FULL)"}
  ],
  "variantOutcomes": {
    "healthy": {"status": "Başarılı", "assertions": "2 (bakiye ile) / 1", "screenshot": true},
    "broken": {"status": "Başarısız", "code": "ASSERTION_FAILED", "detail": "Dashboard adımı 'Beklenen: true · Gözlenen: false'"},
    "ambiguous": {"status": "Engellendi", "code": "AMBIGUOUS_ELEMENT", "detail": "'Giriş yap' adımı, 0 assertion"},
    "slow": {"status": "Başarılı değil; statik tahmin 'Engellendi' + ELEMENT_NOT_FOUND (dashboard 8 sn gecikir, locator 1.5 sn bekler), alternatif 'Zaman aşımı' + RUN_TIMEOUT"}
  },
  "invariants": [
    "Assertion/ekran görüntüsü kanıtı yoksa PASS yok (EVIDENCE_REQUIRED → Altyapı hatası; 0 assertion → ASSERTION_REQUIRED/Engellendi)",
    "Yayınlanan klasik ve kalıcı AI test sürümleri değişmez; yeni sürüm ayrı satırdır",
    "Beklenen sonuçlar otomatik değiştirilmez."
  ],
  "flows": [
    {"id": "classic-publish-run", "name": "Klasik testi tasarla, üç görünümde incele, yayınla ve Sağlam uygulama üzerinde çalıştır"},
    {"id": "designer-validation", "name": "Test tasarımcısı alan doğrulamaları ve yayın kenar durumları"},
    {"id": "runtime-variants", "name": "Çalıştırma ortamı olumsuz kontrolleri ve yayınlanan sürümün değişmezliği"},
    {"id": "promoted-tests", "name": "Kalıcı AI testleri: sürümler, güncel olmayan element, Yeni sürüm oluştur, çalıştırma"}
  ]
}
```
