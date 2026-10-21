# Sayfa analizi — Uygulama modeli (`section === "model"`)

> Statik analiz: tarayıcı kullanılmadı. Değerler `apps/web/app/page.tsx` (satır 135–335 durum/handler, 913–1056 bölüm JSX), `apps/api/src/app.ts` (discovery-scans, mappings/review), `apps/worker/src/main.ts` (discovery işi), `packages/runner/src/index.ts` (`discover`) ve `tests/fixtures/server.ts` (Demo Bank öğeleri) kaynaklarından okunmuştur.
>
> Önemli not: API, mutasyon isteklerinde `Origin` başlığını yalnız 3000, 5000 ve `ZC_WEB_PORT` portları için kabul eder (`uiOrigins`). Web arayüzü `http://127.0.0.1:5173` üzerinden açılıyorsa API `ZC_WEB_PORT=5173` ile başlatılmalıdır; aksi halde tüm POST istekleri 403 "İstek kaynağı doğrulanamadı." döner.

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "model",
  "sourceFile": "apps/web/app/page.tsx",
  "relatedSources": [
    "apps/api/src/app.ts",
    "apps/worker/src/main.ts",
    "packages/runner/src/index.ts",
    "tests/fixtures/server.ts"
  ],
  "title": "Uygulama modeli",
  "subtitle": "Keşif önerilerini incele. Onayladığın öğeler sürümlü modelin parçası olsun.",
  "breadcrumb": "PROJE / WEB · CHROMIUM",
  "requiresAuth": true,
  "authMechanism": "Yerel demo oturumu: karşılama ekranında 'Yerel çalışma alanını aç' -> POST /v1/session/local (zc_session çerezi, 8 saat). Kimlik bilgisi yok.",
  "rolesAllowed": ["admin"],
  "rolesNotes": "Yerel oturum her zaman role=admin üretir. 'viewer' rolü yalnız API'de uygulanır (actor(request, true) -> 403 'Düzenleme yetkisi gerekli.'); model bölümünde canEdit ile buton gizleme/disable YOK. UI üzerinden viewer oturumu açmanın yolu yok.",
  "analyzedAsRole": "admin",
  "elements": {
    "forms": [
      {
        "id": "mapping-review",
        "description": "Keşif adaylarını onaylama formu (checkbox listesi + onay butonu). Yalnız latestScan.status === 'awaiting_review' iken etkileşimli.",
        "fields": [
          { "name": "login.username", "type": "checkbox", "label": "E-posta", "secondary": "Giriş sayfası · login.username", "locator": "login-email", "required": true },
          { "name": "login.password", "type": "checkbox", "label": "Parola", "secondary": "Giriş sayfası · login.password", "locator": "login-password", "required": true },
          { "name": "login.submit", "type": "checkbox", "label": "Giriş yap", "secondary": "Giriş sayfası · login.submit", "locator": "login-submit", "required": true },
          { "name": "dashboard.heading", "type": "checkbox", "label": "Dashboard", "secondary": "Dashboard · dashboard.heading", "locator": "dashboard-heading", "required": true },
          { "name": "dashboard.balance", "type": "checkbox", "label": "Bakiye", "secondary": "Dashboard · dashboard.balance", "locator": "dashboard-balance", "required": false }
        ],
        "submit": "Seçilen eşlemeleri onayla",
        "clientValidation": "Buton, busy veya 4 zorunlu id'den biri seçili değilse disabled. Footer metni: 'Giriş alanları ve Dashboard zorunludur.'",
        "serverValidation": {
          "endpoint": "POST /v1/projects/:projectId/mappings/review",
          "body": "{ scanId: uuid, approvedIds: string[1..5] } (strict)",
          "errors": [
            { "code": "INVALID_INPUT", "status": 400, "message": "Alanları kontrol edin." },
            { "code": "NOT_FOUND", "status": 404, "message": "Keşif bulunamadı." },
            { "code": "SCAN_NOT_REVIEWABLE", "status": 409, "message": "Keşif onay beklemiyor." },
            { "code": "UNKNOWN_ELEMENT", "status": 400, "message": "Bilinmeyen öğe." },
            { "code": "REQUIRED_MAPPING", "status": 400, "message": "Giriş öğeleri ve Dashboard onaylanmalı." },
            { "code": "FORBIDDEN", "status": 403, "message": "Düzenleme yetkisi gerekli." }
          ]
        },
        "onSuccess": "Model revision = önceki + 1 olarak kaydedilir, scan status 'approved', audit 'mapping.approved'; UI section='tests'e geçer ve published=null olur."
      }
    ],
    "buttons": [
      { "label": "Keşfi başlat", "alt": "Yeniden keşfet", "condition": "latestScan yoksa 'Keşfi başlat', varsa 'Yeniden keşfet'", "disabled": "busy veya latestScan.status in [queued, running]", "action": "POST /v1/projects/:id/discovery-scans (202) -> approved[] sıfırlanır, section='model'", "errors": [{ "code": "SCAN_IN_PROGRESS", "status": 409, "message": "Keşif zaten sürüyor." }] },
      { "label": "Seçilen eşlemeleri onayla", "condition": "status === 'awaiting_review'", "action": "mapping-review submit" },
      { "label": "Test tasarla", "condition": "status === 'approved'", "action": "section='tests'" },
      { "label": "Hatayı kapat", "type": "aria-label, metin '×'", "condition": "error state dolu", "action": "error banner kapanır" },
      { "label": "Uygulama modeli", "type": "sidebar nav", "badge": "model.elements.filter(approved).length (model yoksa sayı yok)" },
      { "label": "Yeni test", "note": "model bölümünde GİZLİ" }
    ],
    "links": [
      { "label": "ZeroCode ana sayfa", "href": "/", "type": "aria-label (sidebar brand)" }
    ],
    "modals": [],
    "tabs": [],
    "tables": [
      { "id": "mapping-rows", "rowSelector": "label.mapping-row", "columns": ["checkbox", "label (strong)", "Giriş sayfası|Dashboard · <id>", "code: locator.value", "small-tag: Aday|İncelendi"], "expectedRowCount": 5 }
    ]
  },
  "states": [
    { "id": "no-scan", "visible": "'Uygulama bilgisiyle başla' + 'Önerilen öğeler önce senin incelemene sunulur.'" },
    { "id": "scan-pending", "visible": "Badge 'Sırada' veya 'Çalışıyor' + role=status 'Worker demo sayfalarını inceliyor…' + '0 aday öğe · Etiketler demo öğretim verisinden alınır'; keşif butonu disabled" },
    { "id": "scan-failed", "visible": "Badge 'Başarısız' + 'Keşif tamamlanamadı. Fixture ve worker süreçlerini kontrol et.'" },
    { "id": "awaiting-review", "visible": "Badge 'Onay bekliyor' + '5 aday öğe · ...' + 5 satır 'Aday' + footer 'Giriş alanları ve Dashboard zorunludur.'" },
    { "id": "approved", "visible": "Badge 'Onaylandı' + satır etiketi 'İncelendi', checkbox'lar disabled ve modeldeki approved değerini yansıtır + 'Model v<N> kayıtlı. Önceki sürümler korunur.' + 'Test tasarla'" }
  ],
  "flows": [
    { "name": "Keşfi başlat ve zorunlu eşlemeleri onayla (model v1 yayınla)", "steps": ["Keşfi başlat", "awaiting_review bekle", "5 checkbox seç", "Seçilen eşlemeleri onayla", "Test çalışma alanı: Onaylı model v1"] },
    { "name": "Eşleme onay formu doğrulaması", "steps": ["Her zorunlu öğe eksikken buton disabled", "Yalnız Bakiye eksikken onay mümkün; tests bölümünde 'Bakiyeyi de doğrula' disabled"] },
    { "name": "Yeniden keşif ve model sürümleme", "steps": ["Yeniden keşfet", "Yeni scan awaiting_review", "Seçimler sıfırlanmış", "Onayla -> Model v<N+1>", "Önceki onay korunur"] },
    { "name": "Onaylı modelden test tasarımına geçiş", "steps": ["Test tasarla", "section tests"] }
  ],
  "ambiguousElementHandling": "Model bölümünde belirsizlik çözümü YOK. Keşif yalnız /login (variant'sız, sağlam) ve /dashboard-preview okur; tam 5 öğe bulunmazsa DISCOVERY_INCOMPLETE ile scan 'failed'. Belirsizlik yalnız çalıştırma anında (variant 'Belirsiz giriş butonu', ikinci data-testid=login-submit) AMBIGUOUS_ELEMENT -> 'Engellendi' olarak ortaya çıkar.",
  "assertions": [
    "h1 'Uygulama modeli' ve alt metin görünür",
    "Kart başlığı 'Keşif ve eşleme incelemesi', eyebrow 'DEMO BANK · WEB UYGULAMASI'",
    "Bilgi satırı 'Pasif keşif yalnız demo giriş ve öğretim sayfalarını okur. Tıklama veya form gönderimi yapmaz.'",
    "Prototype banner 'Geliştirme sürümü' görünür, 'Yeni test' butonu görünmez",
    "awaiting_review durumunda 5 aday satırı ve doğru locator değerleri",
    "Onay sonrası Model v<N> kayıtlı mesajı ve sidebar sayacı"
  ]
}
```
