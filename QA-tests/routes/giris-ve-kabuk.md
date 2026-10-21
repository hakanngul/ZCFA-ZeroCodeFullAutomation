# Sayfa analizi — `/` · Bölüm: giris-ve-kabuk (karşılama ekranı + uygulama kabuğu)

> **Statik analiz.** Bu analiz tarayıcı açılmadan, yalnız kaynak kod okunarak üretildi
> (`apps/web/app/page.tsx` satır 135-720, `apps/web/app/lib/api.ts`, `apps/web/app/layout.tsx`,
> ilgili API uçları için `apps/api/src/app.ts` satır 89-141). Görsel düzen, gerçek proje adı ve
> sayaç değerleri çalışma anında doğrulanmalıdır.

Önemli statik bulgular:
- Giriş ucu `POST /api/v1/session/local` (görevde geçen `/v1/session` değil); çıkış `DELETE /api/v1/session`.
- `/v1/session/local` her zaman `role: "admin"` oturumu açar; `viewer` rolü UI üzerinden oluşturulamaz.
- Profil butonundaki "Yerel yönetici" metni sabit kodlanmıştır; aktör rolüne göre değişmez.
- API, GET dışı isteklerde `Origin` başlığını yalnız 3000, 5000 ve `ZC_WEB_PORT` portları için kabul eder. devUrl `http://127.0.0.1:5173` ise `ZC_WEB_PORT=5173` ayarlanmadıkça "Yerel çalışma alanını aç" isteği `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` hatası verir.
- Hata metni biçimi: `<message> (<code>)` (`ApiError`).
- Çıkışta `section` durumu sıfırlanmaz; yeniden girişte son açık bölüm görünür (sayfa yenilenmediyse).
- Sayaçlar API'nin `LIMIT 30` sınırlı listelerinden hesaplanır (30'dan fazla klasik test/run varsa eksik sayar).

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "giris-ve-kabuk",
  "sourceFile": "apps/web/app/page.tsx",
  "relatedSources": [
    "apps/web/app/lib/api.ts",
    "apps/web/app/layout.tsx",
    "apps/api/src/app.ts"
  ],
  "title": "ZeroCode · Test çalışma alanı",
  "devUrl": "http://127.0.0.1:5173",
  "requiresAuth": true,
  "authMechanism": "Yerel demo oturumu: 'Yerel çalışma alanını aç' butonu POST /api/v1/session/local çağırır, httpOnly 'zc_session' çerezi (8 saat) set edilir. Kimlik bilgisi yok.",
  "rolesAllowed": ["admin", "viewer"],
  "analyzedAsRole": "admin",
  "states": [
    { "id": "boot", "when": "ready=false (GET /api/v1/workspace bekleniyor)", "text": "Çalışma alanı hazırlanıyor…" },
    { "id": "welcome", "when": "actor=null (oturum yok, GET /api/v1/workspace 401)", "selector": "main.welcome" },
    { "id": "shell", "when": "actor!=null", "selector": "div.shell" }
  ],
  "elements": {
    "forms": [],
    "buttons": [
      { "id": "welcome-open", "label": "Yerel çalışma alanını aç", "selector": "main.welcome button.primary.large", "state": "welcome", "action": "POST /api/v1/session/local → actor + projectId set, kabuk açılır", "disabledWhen": "busy", "destructive": false },
      { "id": "nav-overview", "label": "Genel bakış", "selector": "aside.sidebar nav button", "count": null },
      { "id": "nav-assistant", "label": "AI Test Assistant", "selector": "aside.sidebar nav button", "count": null },
      { "id": "nav-model", "label": "Uygulama modeli", "selector": "aside.sidebar nav button", "count": "data.model.elements.filter(approved).length; model yoksa rozet yok" },
      { "id": "nav-elements", "label": "Elementler", "selector": "aside.sidebar nav button", "count": "data.model.elements.length; model yoksa rozet yok" },
      { "id": "nav-tests", "label": "Testler", "selector": "aside.sidebar nav button", "count": "data.tests.length + data.aiSuiteCount" },
      { "id": "nav-runs", "label": "Çalıştırmalar", "selector": "aside.sidebar nav button", "count": "data.runs.length + data.aiTestRunCounts.total" },
      { "id": "nav-settings", "label": "Ayarlar", "selector": "aside.sidebar nav button", "count": null },
      { "id": "new-test", "label": "Yeni test", "selector": ".page-heading button.primary", "visibleIn": ["overview", "tests", "runs"], "action": "published=null, section='tests'" },
      { "id": "error-close", "label": "×", "ariaLabel": "Hatayı kapat", "selector": ".error-banner button", "action": "error=''" },
      { "id": "profile-logout", "label": "Demo QA / Yerel yönetici", "selector": "aside.sidebar button.profile", "action": "DELETE /api/v1/session → actor/projectId/data/runId/published sıfırlanır, karşılama ekranı", "destructive": true, "confirmDialog": false }
    ],
    "links": [
      { "id": "brand", "label": "zerocode LAB", "ariaLabel": "ZeroCode ana sayfa", "href": "/", "selector": "aside.sidebar a.brand", "effect": "Tam sayfa yeniden yükleme; çerez geçerliyse kabuk 'Genel bakış' ile açılır" }
    ],
    "modals": [],
    "tabs": [
      { "id": "sidebar-sections", "kind": "button-nav (role=tab değil, aktif durum class='active')", "items": ["overview", "assistant", "model", "elements", "tests", "runs", "settings"], "order": ["Genel bakış", "AI Test Assistant", "Uygulama modeli", "Elementler", "Testler", "Çalıştırmalar", "Ayarlar"], "default": "overview" }
    ],
    "tables": [],
    "staticRegions": [
      { "id": "welcome-brand", "text": "zerocode LAB" },
      { "id": "welcome-eyebrow", "text": "İŞ NİYETİNDEN GERÇEK KANITA" },
      { "id": "welcome-h1", "text": "Testi sen tanımla. Kanıtı ZeroCode üretsin." },
      { "id": "welcome-lead", "text": "Uygulamanı modelle. İş akışını oluştur. Gerçek tarayıcıda doğrula." },
      { "id": "welcome-card", "text": "Yerel geliştirme prototipi — Örnek uygulama ve demo oturumu kullanılır. Gerçek müşteri verisi içermez." },
      { "id": "welcome-footer", "text": "Chromium · Deterministik yürütme · İnsan onaylı eşleme" },
      { "id": "welcome-error", "selector": "main.welcome p.error[role=alert]" },
      { "id": "workspace-picker", "text": "Z · Geliştirme alanı · Yerel prototip" },
      { "id": "nav-label", "text": "ÇALIŞMA ALANI" },
      { "id": "sidebar-note", "text": "Kontrol sende. Eşlemeler sen onaylamadan kullanılmaz. Testin beklentisi korunur. Güvenli demo modu" },
      { "id": "topbar-left", "text": "Çalışma alanı > {data.project.name ?? 'ZeroCode Demo'}" },
      { "id": "topbar-right", "text": "Yerel geliştirme v0.1" },
      { "id": "breadcrumb", "text": "PROJE / WEB · CHROMIUM" },
      { "id": "error-banner", "selector": ".error-banner[role=alert]", "visibleWhen": "error !== ''" },
      { "id": "prototype-banner", "selector": ".prototype-banner", "text": "Geliştirme sürümü Klasik testler yerel Demo Bank üzerinde çalışır; AI suite’ler yalnız yapılandırılmış izinli hedeflere gider.", "hiddenIn": ["assistant", "settings"] }
    ],
    "sectionHeadings": {
      "overview": { "h1": "Her testin arkasında bir kanıt.", "p": "İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele." },
      "assistant": { "h1": "AI Test Assistant", "p": "İzinli hedefi incele, senaryoları gözden geçir ve suite çalıştır." },
      "model": { "h1": "Uygulama modeli", "p": "Keşif önerilerini incele. Onayladığın öğeler sürümlü modelin parçası olsun." },
      "elements": { "h1": "Elementler", "p": "Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet." },
      "tests": { "h1": "Test çalışma alanı", "p": "Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur." },
      "runs": { "h1": "Çalıştırmalar ve kanıtlar", "p": "Gerçek tarayıcı sonuçlarını, doğrulamaları ve kanıtları bir arada gör." },
      "settings": { "h1": "Ayarlar", "p": "Test hedeflerini, AI sağlayıcılarını ve modelleri yönet." }
    }
  },
  "network": [
    { "method": "GET", "path": "/api/v1/workspace", "when": "ilk yükleme", "expected": "200 (oturum varsa) / 401 UNAUTHENTICATED 'Önce yerel çalışma alanını açın.' (oturum yoksa, beklenen)" },
    { "method": "POST", "path": "/api/v1/session/local", "when": "Yerel çalışma alanını aç", "expected": "200 {actor:{role:'admin'}, projectId, mode:'local-demo-session'}; Set-Cookie zc_session" },
    { "method": "GET", "path": "/api/v1/projects/:projectId", "when": "giriş sonrası ve her 1500 ms", "expected": "200" },
    { "method": "DELETE", "path": "/api/v1/session", "when": "profil butonu", "expected": "200 {status:'signed_out'}; çerez temizlenir" }
  ],
  "flows": [
    { "id": "open-local-workspace", "name": "Karşılama ekranından yerel çalışma alanını açma", "role": "admin" },
    { "id": "session-persistence", "name": "Sayfa yenilemede ve marka linkinde oturumun korunması", "role": "admin" },
    { "id": "sidebar-navigation", "name": "Kenar çubuğu ile 7 bölüm arasında geçiş, başlık/açıklama/sayaç doğrulama", "role": "admin" },
    { "id": "new-test-shortcut", "name": "'Yeni test' ile Test çalışma alanına geçiş", "role": "admin" },
    { "id": "error-banner-dismiss", "name": "Hata bandının gösterilmesi ve 'Hatayı kapat' ile kapatılması", "role": "admin" },
    { "id": "logout", "name": "Profil butonu ile oturumu kapatma (DELETE /v1/session)", "role": "admin", "destructive": true }
  ],
  "assertions": [
    "document.title === 'ZeroCode · Test çalışma alanı' ve <html lang='tr'>",
    "Oturum yokken karşılama ekranı ve 'Yerel çalışma alanını aç' görünür",
    "Giriş sonrası kenar çubuğunda 7 bölüm butonu belirtilen sırada görünür, 'Genel bakış' aktif (class 'active')",
    "Her bölümde h1/p metni sectionHeadings ile birebir eşleşir",
    "'Yeni test' yalnız overview, tests, runs bölümlerinde görünür",
    "Prototip bandı assistant ve settings dışındaki bölümlerde görünür",
    "Sayaç rozetleri GET /api/v1/projects/:id yanıtındaki değerlerle eşleşir",
    "Profil butonu 'Demo QA' ve 'Yerel yönetici' gösterir; tıklanınca onaysız oturum kapanır ve karşılama ekranı görünür",
    "Hata bandı role=alert; 'Hatayı kapat' tıklanınca kaybolur"
  ],
  "risks": [
    "devUrl portu 5173, API'nin uiOrigins listesinde (3000, 5000, ZC_WEB_PORT) yoksa tüm POST/DELETE istekleri CSRF_BLOCKED ile 403 döner",
    "Çıkışta onay diyalogu yok",
    "Çıkışta section/view/title durumu sıfırlanmıyor",
    "'Yerel yönetici' metni rolden bağımsız sabit",
    "viewer rolü UI'dan üretilemez",
    "Sayaçlar LIMIT 30 listelerinden hesaplanıyor"
  ]
}
```
