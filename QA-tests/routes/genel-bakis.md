# Rota analizi: `/` — Bölüm: Genel bakış (`section === "overview"`)

> Bu analiz **statik analizdir** (tarayıcı kullanılmadı). Kaynak: `apps/web/app/page.tsx` (overview bloğu ~734-912; ilgili state/handler'lar 135-336, kabuk/sidebar 575-719). Uygulama tek URL (`/`) üzerinde bölüm değiştirir; Genel bakış varsayılan bölümdür (`useState<Section>("overview")`).
>
> Not: Yerel oturum açma ucu kaynakta `POST /v1/session/local`; oturum kapatma `DELETE /v1/session`. Proje verisi `GET /v1/projects/{id}` ile 1500 ms aralıkla yenilenir.

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "overview",
  "sourceFile": "apps/web/app/page.tsx",
  "title": "Her testin arkasında bir kanıt.",
  "subtitle": "İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele.",
  "breadcrumb": "PROJE / WEB · CHROMIUM",
  "requiresAuth": true,
  "authMechanism": "Yerel demo oturumu: karşılama ekranında 'Yerel çalışma alanını aç' butonu POST /v1/session/local çağırır; kimlik bilgisi yok.",
  "rolesAllowed": [],
  "analyzedAsRole": "admin",
  "roleNotes": "Overview bloğunda canEdit/rol kontrolü yok; viewer rolü yalnız assistant/settings bileşenlerinde canEdit=false yapar. Yerel oturum her zaman 'Demo QA — Yerel yönetici' (admin) üretir.",
  "dataSources": [
    { "method": "GET", "path": "/v1/workspace", "when": "ilk yükleme" },
    { "method": "GET", "path": "/v1/projects/{projectId}", "when": "ilk yükleme + her 1500 ms" },
    { "method": "POST", "path": "/v1/projects/{projectId}/discovery-scans", "when": "hero 'Uygulamayı keşfet' (model yokken)" },
    { "method": "DELETE", "path": "/v1/session", "when": "sidebar profil butonu 'Demo QA'" }
  ],
  "elements": {
    "forms": [],
    "buttons": [
      { "id": "hero-button", "label": "Uygulamayı keşfet", "condition": "data.model yok", "action": "scan(): POST discovery-scans, approved=[] , section='model'", "disabledWhen": "busy" },
      { "id": "hero-button", "label": "Testini tasarla", "condition": "data.model var", "action": "section='tests'", "disabledWhen": "busy" },
      { "id": "journey-step-1", "label": "Uygulama bilgisini oluştur", "desc": "Demo öğelerini keşfet ve insan onayıyla eşle.", "action": "section='model'", "doneWhen": "data.model var (✓ ikonu, aksi halde '01')" },
      { "id": "journey-step-2", "label": "İş beklentisini tanımla", "desc": "Giriş akışı ve görünürlük doğrulaması ekle.", "action": "section='tests'", "doneWhen": "data.tests.length > 0 (aksi halde '02')" },
      { "id": "journey-step-3", "label": "Çalıştır ve kanıtı incele", "desc": "PASS, FAIL ve engelleri ayrı ayrı gör.", "action": "section='runs'", "doneWhen": "data.runs.length > 0 (aksi halde '03')" },
      { "id": "new-test", "label": "Yeni test", "location": "page-heading (overview, tests, runs bölümlerinde görünür)", "action": "published=null, section='tests'" },
      { "id": "error-close", "label": "×", "ariaLabel": "Hatayı kapat", "condition": "error state dolu", "action": "error=''" },
      { "id": "profile-logout", "label": "Demo QA / Yerel yönetici", "action": "DELETE /v1/session → karşılama ekranına dönüş" },
      { "id": "sidebar-nav", "labels": ["Genel bakış", "AI Test Assistant", "Uygulama modeli", "Elementler", "Testler", "Çalıştırmalar", "Ayarlar"], "action": "setSection(id)", "activeClass": "active" }
    ],
    "links": [
      { "label": "zerocode LAB", "ariaLabel": "ZeroCode ana sayfa", "href": "/" }
    ],
    "modals": [],
    "tabs": [],
    "tables": [],
    "cards": [
      { "id": "hero", "eyebrow": "DAHA AZ TEKNİK YÜK. DAHA NET SONUÇ.", "heading": "İlk anlamlı testine üç adım uzaktasın.", "diagramNodes": [
        { "mark": "01", "title": "Uygulama modeli", "small": "model varsa 'v{revision} · Onaylı', yoksa 'Keşfet ve onayla'" },
        { "mark": "02", "title": "İş niyeti", "small": "Giriş yap → Dashboard görünsün" },
        { "mark": "03", "title": "Kanıtlı sonuç", "small": "Gerçek assertion + ekran görüntüsü" }
      ] },
      { "id": "metrics", "format": "değer padStart(2,'0')", "items": [
        { "label": "Onaylı öğe", "value": "model.elements.filter(approved).length ?? 0", "note": "Ortak uygulama bilgisi" },
        { "label": "Yayınlanan test", "value": "tests.length + aiSuiteCount", "note": "Açık doğrulama içeren" },
        { "label": "Başarılı çalıştırma", "value": "runs(passed) + aiRunCounts.passed + aiTestRunCounts.passed", "note": "Gerçek tarayıcıda doğrulandı" },
        { "label": "Bekleyen / çalışan", "value": "runs(queued|running) + aiRunCounts.pending + aiTestRunCounts.pending", "note": "Tek worker · izole context" }
      ] },
      { "id": "journey", "heading": "Başlangıç rotan", "tag": "Web MVP" },
      { "id": "recent", "heading": "Son hareketler", "maxItems": 4, "actionLabels": {
        "discovery.queued": "Uygulama keşfi başlatıldı",
        "mapping.approved": "Eşlemeler onaylandı",
        "test.published": "Yeni test yayınlandı",
        "run.queued": "Test kuyruğa alındı",
        "run.cancelled": "Çalıştırma iptal edildi"
      }, "unknownAction": "ham action string gösterilir", "timeFormat": "tr-TR, day 2-digit, month short, hour:minute, Europe/Istanbul",
        "emptyText": "İlk işleminle birlikte projenin geçmişi burada oluşacak.", "footnote": "Süreç, sürüm ve sonuçlar kayıt altında." }
    ],
    "banners": [
      { "id": "prototype-banner", "text": "Geliştirme sürümü Klasik testler yerel Demo Bank üzerinde çalışır; AI suite’ler yalnız yapılandırılmış izinli hedeflere gider." },
      { "id": "error-banner", "role": "alert", "condition": "API hatası (action/refresh)" }
    ]
  },
  "flows": [
    { "name": "Boş projede genel bakışı görüntüle ve hero ile keşfi başlat", "steps": ["oturum aç", "Genel bakış render", "Uygulamayı keşfet", "Uygulama modeli bölümüne geçiş", "Son hareketler: Uygulama keşfi başlatıldı"] },
    { "name": "Başlangıç rotanı ve kısayol butonlarıyla bölümler arası gezinme", "steps": ["journey-step-1 → model", "journey-step-2 → tests", "journey-step-3 → runs", "Yeni test → tests", "Testini tasarla → tests (model varken)"] },
    { "name": "Metriklerin ve Son hareketler listesinin durum yansıması; hata bandı ve oturum kapatma", "steps": ["sayaçlar 00", "işlem sonrası artış", "en fazla 4 olay", "hata bandı kapatma", "Demo QA ile çıkış"] }
  ],
  "assertions": [
    "h1 'Her testin arkasında bir kanıt.' görünür",
    "breadcrumb 'PROJE / WEB · CHROMIUM' görünür",
    "Sidebar 'Genel bakış' butonu active sınıfına sahip",
    "Hero başlığı 'İlk anlamlı testine üç adım uzaktasın.' görünür",
    "4 metrik kartı: Onaylı öğe, Yayınlanan test, Başarılı çalıştırma, Bekleyen / çalışan; değerler iki haneli",
    "'Başlangıç rotan' kartında 3 adım butonu ve 'Web MVP' etiketi",
    "'Son hareketler' boşken boş durum metni; doluyken en fazla 4 olay",
    "Prototip bandı 'Geliştirme sürümü' görünür",
    "'Yeni test' butonu görünür"
  ]
}
```
