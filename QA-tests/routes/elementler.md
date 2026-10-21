# Sayfa analizi — Elementler bölümü (`/` → sidebar "Elementler")

> **Statik analiz.** Tarayıcı kullanılmadı; aşağıdaki JSON yalnız kaynak kod okunarak üretildi
> (`apps/web/app/page.tsx` `section === "elements"` bloğu, `ai-element-list.tsx`, `ai-element-editor.tsx`,
> `element-registry.tsx`, `apps/api/src/app.ts`, `apps/api/src/assistant.ts`,
> `packages/storage/src/{ai-elements,self-healing,index}.ts`, `packages/domain/src/{index,locators}.ts`,
> ADR 013–016). Metinler kaynaktan birebir alınmıştır.
>
> Hata gösterimi: AI kütüphanesi bileşenleri `String(failure)` kullanır → `Error: <mesaj> (<KOD>)`.
> Demo Bank kayıt defteri `e.message` kullanır → `<mesaj> (<KOD>)`. Sunucu Zod hatası her yerde
> `Alanları kontrol edin.` / `INVALID_INPUT` (400) döner.

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "elements",
  "sectionSlug": "elementler",
  "sourceFile": "apps/web/app/page.tsx",
  "componentFiles": [
    "apps/web/app/components/ai-element-list.tsx",
    "apps/web/app/components/ai-element-editor.tsx",
    "apps/web/app/components/element-registry.tsx"
  ],
  "supportingFiles": [
    "apps/api/src/assistant.ts",
    "apps/api/src/app.ts",
    "packages/storage/src/ai-elements.ts",
    "packages/storage/src/self-healing.ts",
    "packages/storage/src/index.ts",
    "packages/domain/src/index.ts",
    "packages/domain/src/locators.ts",
    "docs/decisions/013-site-element-library.md",
    "docs/decisions/014-suite-element-references.md",
    "docs/decisions/015-element-update-versions.md",
    "docs/decisions/016-self-healing.md"
  ],
  "title": "Elementler",
  "subtitle": "Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.",
  "breadcrumb": "PROJE / WEB · CHROMIUM",
  "devUrl": "http://127.0.0.1:5173",
  "requiresAuth": true,
  "authMechanism": "Yerel demo oturumu: karşılama ekranında 'Yerel çalışma alanını aç' → POST /v1/session/local (her zaman role=admin). Kimlik bilgisi yok.",
  "rolesAllowed": [],
  "analyzedAsRole": "admin",
  "roleNotes": "viewer rolünde ElementRegistry salt okunur (canEdit=false). AiElementEditor canEdit almaz; viewer Kaydet'e basarsa sunucu 403 FORBIDDEN 'Düzenleme yetkisi gerekli.' döner. UI'dan viewer oturumu oluşturulamaz.",
  "environmentNotes": [
    "API yalnız Origin http://127.0.0.1:{3000,5000,ZC_WEB_PORT} kabul eder; web 5173'te ise ZC_WEB_PORT=5173 olmalı, yoksa her POST/PUT 403 CSRF_BLOCKED 'İstek kaynağı doğrulanamadı.' döner.",
    "Sayfa verisi 1,5 sn'de bir yenilenir (GET /v1/projects/:id)."
  ],
  "apiEndpoints": [
    "GET  /v1/projects/:projectId/ai/elements?q&approved&pageUrl&limit&offset",
    "GET  /v1/projects/:projectId/ai/elements/:id",
    "PUT  /v1/projects/:projectId/ai/elements/:id",
    "POST /v1/projects/:projectId/ai/elements/:id/suggestions/accept",
    "POST /v1/projects/:projectId/ai/elements/:id/merge",
    "GET  /v1/projects/:projectId/ai/elements/:id/impact",
    "GET  /v1/projects/:projectId/ai/heal-suggestions",
    "POST /v1/projects/:projectId/ai/heal-suggestions/:id/promote",
    "POST /v1/projects/:projectId/ai/heal-suggestions/:id/ignore",
    "POST /v1/projects/:projectId/ai/tests/:id/versions",
    "POST /v1/projects/:projectId/ai/tests/:id/runs",
    "GET  /v1/projects/:projectId/ai/test-runs/:runId",
    "GET  /v1/projects/:projectId/elements[?revision]",
    "POST /v1/projects/:projectId/elements",
    "PUT  /v1/projects/:projectId/elements/:elementId",
    "GET  /v1/projects/:projectId/elements/history",
    "GET  /v1/projects/:projectId/elements/:elementId/usage",
    "POST /v1/projects/:projectId/locator-checks",
    "GET  /v1/projects/:projectId/locator-checks/:id"
  ],
  "errorCodes": {
    "INVALID_INPUT": { "status": 400, "message": "Alanları kontrol edin." },
    "REVISION_CONFLICT_ai": { "status": 409, "message": "Element değişti. Güncel sürümü açıp değişikliği tekrar uygula.", "editorUiText": "Element bu arada değişti. Güncel sürüm yüklendi; değişikliği tekrar uygula." },
    "REVISION_CONFLICT_model": { "status": 409, "message": "Model değişti. Güncel sürümü açıp değişikliği tekrar uygula." },
    "DUPLICATE_LOCATOR": { "status": 400, "message": "Aynı locator bir kez tanımlanabilir." },
    "ELEMENT_KEY_EXISTS": { "status": 409, "message": "Bu element anahtarı bu sitede zaten kullanılıyor." },
    "ELEMENT_KEY_LOCKED": { "status": 409, "message": "Onaylı elementin anahtarı değiştirilemez; önce onayı kaldırın." },
    "LOCATOR_IN_USE_edit": { "status": 409, "message": "Bu birincil locator aynı sayfada başka bir elemente ait." },
    "LOCATOR_IN_USE_heal": { "status": 409, "message": "Bu birincil locator aynı sayfada başka bir elemente ait; önce o kopyayı birleştirin." },
    "ELEMENT_MERGED": { "status": 409, "message": "Bu element başka bir elemente birleştirildi; birleştirilen elementi düzenleyin." },
    "ELEMENT_APPROVED": { "status": 409, "message": "Onaylı element birleştirilemez; önce onayını kaldırın." },
    "PAGE_MISMATCH": { "status": 409, "message": "Yalnız aynı sayfadaki elementler birleştirilebilir." },
    "MERGE_SAME_ELEMENT": { "status": 400, "message": "Element kendisiyle birleştirilemez." },
    "SUGGESTION_NOT_FOUND": { "status": 404, "message": "Bu locator önerilen alternatifler arasında yok." },
    "TOO_MANY_ALTERNATIVES": { "status": 409, "message": "En fazla 5 alternatif tanımlanabilir." },
    "SUGGESTION_STALE": { "status": 409, "message": "Bu locator artık elementin alternatifleri arasında değil. | Bu locator zaten birincil." },
    "SUGGESTION_RESOLVED": { "status": 409, "message": "Bu öneri zaten sonuçlandırıldı." },
    "ELEMENT_EXISTS": { "status": 409, "message": "Bu element anahtarı zaten kullanılıyor." },
    "ELEMENT_ID_IMMUTABLE": { "status": 400, "message": "Element anahtarı değiştirilemez." },
    "NOT_FOUND": { "status": 404, "message": "Element bulunamadı." },
    "FORBIDDEN": { "status": 403, "message": "Düzenleme yetkisi gerekli." },
    "ELEMENT_UNAVAILABLE / TEST_UP_TO_DATE": { "status": 409, "message": "ADR 015 — yeni test sürümü engelleri" }
  },
  "elements": {
    "forms": [
      {
        "id": "ai-element-filters",
        "component": "AiElementList",
        "submit": "otomatik (arama 250 ms debounce, select anında)",
        "fields": [
          { "name": "Ara", "ariaLabel": "Kaydedilen element ara", "type": "search", "placeholder": "Ad, anahtar veya locator ile ara", "required": false, "serverMax": 200, "sampleValid": "QA Kullanıcı adı", "sampleInvalid": "zzqa-yok-{runId}" },
          { "name": "Durum", "ariaLabel": "Kaydedilen element durumu", "type": "select", "options": ["Tümü", "Onaylı", "Onay bekliyor"], "sampleValid": "Onay bekliyor" },
          { "name": "Sayfa", "ariaLabel": "Kaydedilen element sayfası", "type": "select", "options": ["Tüm sayfalar", "<pageUrl> (<count>)"], "sampleValid": "https://www.saucedemo.com/ (N)" }
        ]
      },
      {
        "id": "ai-element-editor",
        "component": "AiElementEditor (satır içi panel)",
        "submit": "Kaydet",
        "clientValidation": "yok (yalnız maxLength); doğrulama sunucuda (aiElementUpdateSchema)",
        "fields": [
          { "name": "Ad", "ariaLabel": "Element adı", "required": true, "maxLength": 120, "rule": "trim().min(1).max(120)", "sampleValid": "QA Kullanıcı adı alanı", "sampleInvalid": ["   ", "121 × 'a' (input 120'de keser)"] },
          { "name": "Anahtar", "ariaLabel": "Element anahtarı", "required": true, "maxLength": 120, "pattern": "^[A-Za-z][A-Za-z0-9_.-]*$", "disabledWhen": "element onaylı (title 'Onaylı elementin anahtarı değiştirilemez.')", "uniqueScope": "org+proje+origin", "sampleValid": "home.qa_username_{runId}", "sampleInvalid": ["", "1home.username", "home username", "home/username", "<başka elementin anahtarı>"] },
          { "name": "Sayfa anahtarı", "ariaLabel": "Sayfa anahtarı", "required": true, "maxLength": 60, "pattern": "^[A-Za-z][A-Za-z0-9_-]*$", "sampleValid": "login_qa", "sampleInvalid": ["", "home.page", "9home", "61 × 'p' (input 60'ta keser)"] },
          { "name": "Tür", "ariaLabel": "Birincil locator türü", "type": "select", "options": ["testId", "id", "role", "label", "placeholder", "css"], "sampleValid": "css" },
          { "name": "Rol", "ariaLabel": "Birincil locator rolü", "type": "select", "visibleWhen": "Tür = role", "options": ["button", "heading", "textbox", "link", "checkbox", "radio", "combobox", "option", "img", "dialog", "navigation", "list", "listitem", "table", "row", "cell"] },
          { "name": "Değer", "ariaLabel": "Birincil locator değeri", "required": true, "serverMax": 1000, "sampleValid": "#user-name", "sampleInvalid": ["", "<aynı sayfadaki başka elementin birincil değeri>", "<bu elementin bir alternatifiyle aynı tür+değer>"] },
          { "name": "Elementi onayla", "ariaLabel": "Elementi onayla", "type": "checkbox", "label": "Onaylı (testlerde bu anahtarla kullanılabilir)", "autoClearedWhen": "birincil/alternatif listesi değişir" }
        ],
        "alternativesList": { "label": "Alternatifler ({n}/5)", "rowButtons": ["Birincil yap", "Kaldır"], "empty": "Keşifte başka tekil locator bulunmadı." },
        "suggestionsList": { "label": "Önerilen alternatifler ({n})", "rowButton": "Alternatif olarak ekle", "disabledWhen": "saving || locator değişikliği kaydedilmemiş" },
        "messages": {
          "saved": "Kaydedildi (sürüm {N}).",
          "savedApprovalCleared": "Kaydedildi (sürüm {N}). Locator değiştiği için onay kaldırıldı.",
          "suggestionAccepted": "Alternatif eklendi (sürüm {N}). Birincil locator değişmediği için onay korundu.",
          "locatorWarning": "Locator değişti: kaydedince onay kaldırılır, sonra tekrar onaylayın.",
          "conflict": "Element bu arada değişti. Güncel sürüm yüklendi; değişikliği tekrar uygula."
        }
      },
      {
        "id": "ai-element-merge",
        "component": "MergeElement (yalnız onaysız elementte görünür)",
        "submit": "Birleştir",
        "fields": [
          { "name": "Hedef element", "ariaLabel": "Birleştirme hedefi", "type": "select", "firstOption": "Seçin", "optionFormat": "{elementKey} · {name} · onaylı · {locator}", "sampleValid": "<aynı sayfadaki onaylı element>", "sampleInvalid": "Seçin" }
        ],
        "messages": {
          "inlineSuccess": "{src} → {target} birleştirildi (sürüm {N}). {k} locator önerilen alternatif|alternatif olarak eklendi[, {s} sınır nedeniyle eklenmedi].",
          "listNotice": "{src} kaydı {target} elementine birleştirildi (sürüm {N}); kopya emekli edildi, geçmişi korunuyor."
        }
      },
      {
        "id": "element-registry-inspector",
        "component": "ElementRegistry (Demo Bank modeli)",
        "submit": "Kaydet",
        "clientValidation": "Kaydet disabled unless: id ~ ^[A-Za-z][A-Za-z0-9_.-]*$ AND label.trim() non-empty AND every locator value non-empty; also disabled when readonly/busy/checking or (!dirty && existing)",
        "fields": [
          { "name": "Görünen ad", "ariaLabel": "Element adı", "required": true, "maxLength": 120, "sampleValid": "QA Yardım bağlantısı", "sampleInvalid": ["", "   "] },
          { "name": "Element anahtarı", "ariaLabel": "Element anahtarı", "required": true, "maxLength": 120, "pattern": "^[A-Za-z][A-Za-z0-9_.-]*$", "placeholder": "login.submit", "readOnlyWhen": "mevcut element", "sampleValid": "dashboard.qa_help_{runId}", "sampleInvalid": ["", "1dashboard.help", "dashboard help", "login.submit (mevcut → ELEMENT_EXISTS)"] },
          { "name": "Sayfa", "ariaLabel": "Element sayfası", "type": "select", "options": ["Giriş sayfası", "Dashboard"], "clearsApproval": true },
          { "name": "Birincil locator türü", "ariaLabel": "Birincil locator türü", "type": "select", "options": ["Role", "Label", "Test ID", "HTML ID", "CSS", "XPath", "Text", "Placeholder", "Title", "Alt text"] },
          { "name": "ARIA role", "ariaLabel": "Birincil locator ARIA role", "type": "select", "visibleWhen": "tür = Role" },
          { "name": "Birincil locator değeri", "required": true, "maxLength": 1000, "sampleValid": "Yardım", "sampleInvalid": [""] },
          { "name": "Alternatif {i}", "repeatable": true, "max": 5, "addButton": "Ekle", "rowButtons": ["Birincil yap", "Kaldır"], "sampleValid": "CSS a[href=\"#help\"]", "sampleInvalid": ["", "<birincil ile aynı tür+değer → DUPLICATE_LOCATOR>"] },
          { "name": "Bu eşlemeyi onaylıyorum", "type": "checkbox", "autoClearedWhen": "sayfa/birincil/alternatif değişir" }
        ],
        "messages": {
          "saved": "Kaydedildi · Model v{N}. Önceki sürümler korundu.",
          "locatorUnique": "{n} eşleşme · Tekil öğe",
          "locatorNotFound": "{n} eşleşme · Öğe bulunamadı",
          "locatorAmbiguous": "{n} eşleşme · Seçim belirsiz",
          "locatorFailed": "Locator denemesi tamamlanamadı"
        }
      }
    ],
    "buttons": [
      { "label": "▸/▾ <path> <host> <n element · a onaylı · f kırılgan>", "component": "AiElementList", "action": "sayfa grubunu aç/kapat (aria-expanded)" },
      { "label": "Düzenle / Kapat", "ariaLabel": "{elementKey} düzenle", "action": "satır içi editörü aç/kapat" },
      { "label": "Daha fazla göster ({n} kaldı)", "action": "20'lik sonraki sayfa" },
      { "label": "Kaydet / Kaydediliyor…", "component": "AiElementEditor", "action": "PUT element" },
      { "label": "Kapat", "component": "AiElementEditor", "action": "paneli kapat, kaydetmeden" },
      { "label": "Birincil yap", "component": "AiElementEditor alternatif satırı", "action": "yerel takas; onay kaldırılır" },
      { "label": "Kaldır", "component": "AiElementEditor alternatif satırı", "action": "yerel kaldırma; onay kaldırılır" },
      { "label": "Alternatif olarak ekle", "action": "POST suggestions/accept; onay korunur" },
      { "label": "Birleştir / Birleştiriliyor…", "destructive": true, "confirm": "YOK", "action": "POST merge; kaynak emekli edilir" },
      { "label": "Yeni sürüm oluştur", "component": "ElementImpact", "disabledWhen": "unavailable listesi dolu", "action": "POST ai/tests/:id/versions" },
      { "label": "Yeni sürümü çalıştır", "component": "ElementImpact", "action": "POST ai/tests/:id/runs" },
      { "label": "Birincil yap", "ariaLabel": "{elementKey} için {locator} birincil yap", "component": "HealSuggestions", "disabledWhen": "busy || element yok || element merged" },
      { "label": "Yoksay", "component": "HealSuggestions", "destructive": "yumuşak (öneriyi kapatır)", "confirm": "YOK" },
      { "label": "Element ekle", "component": "ElementRegistry", "disabledWhen": "readonly/busy/checking" },
      { "label": "Locator’ı dene / Tarayıcıda deneniyor…", "component": "ElementRegistry", "disabledWhen": "checking || değer boş" },
      { "label": "Ekle", "component": "ElementRegistry alternatifler", "disabledWhen": "≥5 alternatif" },
      { "label": "Birincil yap", "component": "ElementRegistry alternatif" },
      { "label": "Kaldır", "ariaLabel": "Alternatif {i} kaldır", "component": "ElementRegistry alternatif" },
      { "label": "Kaydet", "component": "ElementRegistry" },
      { "label": "Güncele dön", "component": "ElementRegistry geçmiş banner" },
      { "label": "Keşfe git", "component": "ElementRegistry boş durum", "action": "Uygulama modeli bölümüne geçer" },
      { "label": "(X)", "ariaLabel": "Element hatasını kapat" },
      { "label": "{label} öğesini düzenle / {label} ayrıntıları", "component": "ElementRegistry tablo" }
    ],
    "links": [
      { "label": "zerocode LAB", "ariaLabel": "ZeroCode ana sayfa", "href": "/" }
    ],
    "modals": [
      { "id": "confirm-unsaved-select", "kind": "window.confirm", "text": "Kaydedilmemiş değişiklikler var. Değişiklikleri bırakmak istiyor musun?", "trigger": "ElementRegistry: dirty iken başka element/Element ekle" },
      { "id": "confirm-unsaved-revision", "kind": "window.confirm", "text": "Kaydedilmemiş değişiklikleri bırakıp sürümü değiştirmek istiyor musun?", "trigger": "ElementRegistry: dirty iken 'Model sürümü' değiştir" }
    ],
    "tabs": [],
    "selects": [
      { "ariaLabel": "Model sürümü", "options": ["Güncel · v{N}", "v{r} · {n} element"] },
      { "ariaLabel": "Sayfa filtresi", "options": ["Tüm sayfalar", "Giriş sayfası", "Dashboard"] },
      { "ariaLabel": "Onay filtresi", "options": ["Tüm durumlar", "Onaylı", "Onay bekliyor"] }
    ],
    "tables": [
      { "id": "ai-element-group-table", "columns": ["Element", "Locator", "Durum", "Son gözlem", "İşlem"], "badges": ["Onaylı", "Bekliyor", "kırılgan", "{n} öneri", "+{n} alternatif", "v{revision}"] },
      { "id": "element-table", "columns": ["Element / sayfa", "Birincil locator", "Durum", ""], "badges": ["Onaylı", "Bekliyor", "+{n} alternatif", "Tek locator"] }
    ],
    "sections": [
      { "heading": "Web sitelerinden kaydedilen elementler", "eyebrow": "AI KEŞFİ" },
      { "ariaLabel": "Self-healing önerileri", "heading": "Self-healing önerileri ({n})", "hiddenWhen": "öneri yok" },
      { "ariaLabel": "Etkilenen testler", "heading": "Etkilenen testler ({n})", "empty": "Bu elementin eski sürümünü kullanan kalıcı test yok." },
      { "ariaLabel": "Elementi birleştir", "heading": "Birleştir" },
      { "summary": "Geçmiş ({n})", "empty": "Henüz düzenleme yok. Geçmiş salt okunurdur." },
      { "heading": "Elementler {n}", "component": "ElementRegistry", "eyebrow": "ELEMENT AYRINTISI" }
    ]
  },
  "flows": [
    { "name": "AI elementini adlandır, anahtar ver ve onayla", "task": "T10" },
    { "name": "AI element listesinde ara/filtrele/grupla", "task": "T10" },
    { "name": "Locator değişikliği onayı kaldırır; önerilen alternatifi ekle", "task": "T10" },
    { "name": "Çakışma kodları: REVISION_CONFLICT, DUPLICATE_LOCATOR, ELEMENT_KEY_EXISTS, LOCATOR_IN_USE, ELEMENT_KEY_LOCKED", "task": "T10" },
    { "name": "Kopya elementi Birleştir (emekli et)", "task": "T11" },
    { "name": "Etkilenen testler → Yeni sürüm oluştur → Yeni sürümü çalıştır", "task": "T12" },
    { "name": "Self-healing önerisi: Birincil yap / Yoksay", "task": "T12" },
    { "name": "Demo Bank element kayıt defteri: ekle, düzenle, dene, sürüm geçmişi", "task": "T13" }
  ],
  "assertions": [
    "H1 'Elementler' ve alt başlık 'Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.' görünür",
    "Sidebar 'Elementler' butonu active; rozet sayısı = Demo Bank model element sayısı (AI kütüphanesi değil)",
    "'Yeni test' butonu bu bölümde görünmez",
    "Banner 'Geliştirme sürümü' görünür",
    "AI kartı: 'AI KEŞFİ' + 'Web sitelerinden kaydedilen elementler'",
    "Toplam satırı '{p} sayfa · {n} element[ · {f} kırılgan]'",
    "İlk sayfa grubu otomatik açık (aria-expanded=true)",
    "Boş durum: 'Henüz AI ile keşfedilen element yok.' / aramada 'Aramayla eşleşen element yok.'",
    "Demo Bank kartı: 'Demo Bank WEB', istatistikler 'Merkezi element', 'Onaylı eşleme', 'Locator tanımı'",
    "Kayıt defteri altbilgisi '{f} / {n} element' ve 'Alternatifler kendiliğinden devreye girmez.'"
  ],
  "findings": [
    "Birleştir geri alınamaz şekilde kaynağı emekli eder ama onay penceresi yoktur.",
    "ELEMENT_KEY_LOCKED UI'dan erişilemez (Anahtar input'u onaylı elementte disabled); yalnız API ile doğrulanabilir.",
    "AiElementEditor canEdit almaz: viewer için Kaydet/Birleştir/Birincil yap aktiftir, sunucu 403 ile reddeder.",
    "HealSuggestions hata sonrası listeyi yeniden çekmez; REVISION_CONFLICT sonrası aynı öneri sayfa yenilenene kadar hep 409 verir.",
    "devUrl 5173, API uiOrigins listesinde varsayılan olarak yok (3000/5000); ZC_WEB_PORT=5173 gerekir."
  ]
}
```
