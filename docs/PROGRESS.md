# Devam noktası — 19 Ekim 2026

## 24 Ekim 2026 — Test Case adım kimliği bütünlüğü

- `caseDefinitionSchema` aynı Case içinde yinelenen `step.id` değerlerini reddeder. Böylece düzenleyici ve yürütme kanıtlarının adımları tekil kimlikle eşlemesi korunur.
- Yeni regresyon: yinelenen ID reddedilir, farklı ID'lerle aynı işlem türü kabul edilir.
- İlgili `tests/test-cases.test.ts` testleri 4/4 PASS; tam regresyon 51/51 PASS; format, typecheck ve production build PASS (Node 26.12.1). Desteklenen Node 24 doğrulaması ve yeni değişiklik sonrası E2E ayrı devam işidir.
- Veri modeli konsolidasyonu, görsel reusable adımlar, canlı yayın ve gerçek dış provider ile uçtan uca doğrulama sonraki artımlarda ele alınacak.

## 24 Ekim 2026 — AI plan ayrıntıları, keşif güvenliği ve Windows 11 regresyonu

- **AI Test Plan:** Ön koşullar, insan-okur test adımları ve beklenen sonuçlar
  şemaya, model promptuna ve açılır plan editörüne eklendi. Seçimde yapılan
  değişiklikler `ai_generate` payload'una taşınır; eski planlar boş liste
  varsayılanlarıyla açılır. Üst sınır tutarlı şekilde 15 öneridir.
- **Plan seçim bütünlüğü:** İstemci `sourceIndex` yollar, API kayıtlı plandaki
  index/kategori/tekillik üyeliğini doğrular. Eski istemciler yalnızca
  orijinal başlık+kategori eşleşmesiyle çalışır.
- **Güvenli keşif:** Tıklanmadan önce gerçek gözlenen kontrolün etiketi ve
  sayfa URL'iyle silme/ödeme/son checkout/ayar kaydı filtrelenir.
  `unsafe_action` ile görünür durdurma nedeni bırakılır. Henüz kapsamlı
  niyet/işlem sınıflandırıcısının yerini tutmaz.
- **Windows test altyapısı:** `tests/process-tree.ts` ile süreç grubu
  temizliği Windows `taskkill /T /F` ve Unix negatif PID olarak ayrıldı;
  E2E Chromium yolu Playwright kurulumundan bulunur. Çalışan geliştirme
  servislerinin PID'lerine dokunmayan test temizliği sağlanır.
- **Cross-platform format:** Windows CRLF checkout ile Linux LF arasında
  yanlış format uyarıları için `.prettierrc.json` `endOfLine:auto` eklendi.
- **Nihai yerel doğrulama:** Node 26.12.1 (desteklenen 24.x dışı),
  `pnpm format:check` PASS, `pnpm typecheck` PASS,
  `pnpm test` **50/50**, `pnpm build` PASS,
  `pnpm test:e2e` **13/13** (plan seçim index'i dahil).
  `pnpm audit --prod`: bilinen zafiyet yok.
- **Sabit port çakışması:** Paralel test dosyalarının ortak
  fixture/provider portu yüzünden nadiren yanlış `TARGET_NAVIGATION_FAILED`
  ürettiği doğrulandı; `pnpm test` artık dosyaları
  `--test-concurrency=1` ile izole sırada çalıştırıyor.
- **Gerçek UI:** Bir Chromium oturumunda Elementler arama/filtre alanları
  390/600/800/1050/1440 px için taşma olmadan doğrulandı. Düzen
  kanıtları: `docs/evidence/test-cases/element-filters-390.png` ve
  `element-filters-800.png` (yalnız filtre bölümleri, hassas veri yok).
  Mock provider ile plan adımlarının görüntüsü:
  `docs/evidence/test-cases/plan-review-fields.png`.
- **Analiz ve roadmap:** `docs/product/10-GAP-AND-ACCEPTANCE-2026-10-24.md`
  altı çıktıyı ve tamamlanmayan ürün gereksinimlerini ayırıyor.
- **Açık kalanlar:** Live video yayını, daha güçlü işlem izni modeli,
  DNS/SSRF pinleme, iki suite veri yolunun konsolidasyonu, reusable step
  tasarımcısı, Node 24 üstünde yeniden doğrulama ve dış AI ile SauceDemo
  senaryolarının bağımsız kanıtı.

## 24 Ekim 2026 — AI Elementler ekranı responsive düzenleme

- Açıklama kısaltıldı; ayrıntılı kayıt/onay kuralları erişilebilir
  açılır bilgi bölümüne taşındı.
- Arama, durum ve sayfa filtreleri uyarlanabilir grid ile hizalandı.
  Sayaç ayrı satırda, boş liste yönlendirmesi kart içinde gösterilir.
- AI UI E2E kontrolüne 1440, 1050, 800, 600 ve 390 px taşma
  doğrulaması, 800 ve 390 px ekran kanıtı eklendi.
- Windows tarayıcı doğrulaması Core tunnel yetkisi yüzünden yapılamıyor;
  GitHub CI sonucu takip edilmeli.

## 24 Ekim 2026 — Windows 11 geliştirme başlatıcısı

- `scripts/dev.ts` API, fixture, worker ve Next.js'i `process.execPath`
  ile doğrudan başlatır; alt `pnpm`/shell süreçleri ve Windows'ta
  `detached` kullanılmaz. `windowsHide` ile servisler tek terminalde kalır.
- `dev:web` aynı başlatıcıyı `--web-only` ile kullanır.
  `ZC_WEB_PORT` hem PowerShell hem Unix ortamında okunur ve kontrol edilir.
- `Ctrl+C` Windows'ta `taskkill /T /F` ile yalnız başlatılan
  servislerin alt süreçlerini, Unix'te süreç gruplarını kapatır.
- Windows 11 yerel doğrulaması bekliyor; Node 24.x gerekli. CI kontrolü
  bu değişiklikten sonraki workflow sonucu ile doğrulanacak.

## 22 Ekim 2026 — Keşif önce test planı önerir; testler seçimle oluşur

ADR 018. Sohbetteki "Önce siteyi analiz et ve test planı öner" kutusu
varsayılan olarak işaretli.

- **Keşif ve plan:** Keşif sitenin ana özelliklerini dolaşır (`survey`).
  Ardından `ai_plan` işi en fazla 15 öneri içeren bir test planı yazar:
  başlık, tür, alan, açıklama, sayfalar, gereken veri ve uygulanabilirlik.
  Plan `ai_draft_plans` tablosunda saklanır (migration 014).
- **Bu aşamada:** Hiçbir test ya da element oluşmaz.
- **Seçim:** Kullanıcı en fazla 10 öneri seçer; başlık, açıklama ve ek notu
  düzenleyebilir.
- **"Testleri oluştur":** `POST …/ai/drafts/:id/generate`, mevcut keşfi
  kullanarak yalnız seçilenleri yazar. Elementler ve taslak suite ADR 017'deki
  gibi oluşur.
- **API uyumu:** API'de `mode` verilmezse eski davranış (hemen suite) korunur.
- **Zaman aşımı:** Provider formunda varsayılan 90 sn. 15 sn, SauceDemo
  üretiminde `PROVIDER_TIMEOUT` veriyordu.

Doğrulama: typecheck, format:check, `pnpm test` 48/48, build, `test:e2e`
13/13.

- **API testi:** Plan modunda taslak `planned` oluyor; tanım ve element
  oluşmuyor, gözlenmeyen sayfa plandan atılıyor. Plansız taslakta
  `PLAN_MISSING` dönüyor. Seçimle üretilen suite oluşuyor ve element sayısı
  değişmiyor.
- **UI testi:** Plan kartı → "Testleri oluştur (1)" → "Testler'de aç".
- **Kanıt:** `docs/evidence/test-cases/fixture-plan.png` ve
  `fixture-plan-suite.png`.

## 21 Ekim 2026 — Keşiften kalıcı taslak suite; adımlar elementlere id ile bağlı

ADR 017. Ayrışma noktaları:

- `ai_analysis` gözlenen her öğeyi kütüphaneye yazıyordu.
- Onaysız elementler taslağa ham locator olarak giriyordu.
- Taslak yalnız sohbette duruyordu.
- Doğrulanamayan locator işaretlenmiyordu.

Değişenler:

- **Keşif:** Gözlemlere `unique` eklendi. Keşif artık kütüphaneye yazmıyor.
- **Element kaydı:** `ai_generate` sonrası `bindSuiteElements` yalnız adımların
  kullandığı ve tekil doğrulanan düğümleri kaydediyor.
  - Aynı sayfada eşleşen kayıt yeniden kullanılıyor.
  - Onaylı kayıt değişmiyor; farklı locator öneri olarak ekleniyor ve
    `verification=failed` yazılıyor.
  - Onaysız kayıtta locator değişikliği yeni revizyon (`reobserved`) oluyor.
  - Doğrulanamayan düğüm kaydedilmiyor; adım `unresolved` kalıyor ve case
    eksik sayılıyor.
- **Migration 013:** `test_suites`, `test_cases`, `test_case_elements` ve
  değişmez `test_case_runs` tabloları; `ai_page_elements` için `verification`
  ve `verified_at` sütunları.
- **AI şeması:** `select`, aynı origin'e `navigate` ve senaryo alanları
  (açıklama, ön koşul, test verisi, beklenen sonuç) eklendi.
- **Tests ekranı:** Suite ve case listesi (AI rozeti, durum, son çalışma, son
  düzenleme) ve adım düzenleyici.
  - Element kütüphaneden seçiliyor.
  - Kaydet yeni revizyon üretip onayı kaldırıyor; Onayla element
    revizyonlarını pinliyor.
  - Case çalıştırılabiliyor, çoğaltılabiliyor ve silinebiliyor.
  - Run sonucu adım bazlı gösteriliyor, ekran görüntüleri açılabiliyor.
- **Gezinme:** Adımdan Elementler'e (editör açık) gidiliyor. Element editöründe
  "Kullanan test case'leri" listesi ve "Case'i aç" var.
- **Çalıştırma:** Run, case ve pinli element revizyonlarını checksum'lı
  snapshot olarak saklıyor.
  - PASS yalnız `evidencedPass` ile veriliyor.
  - Run sonucu doğrulama durumunu güncelliyor.
  - Birleşik geçmişe ve HTML rapora `case` türü eklendi.
- **Korunanlar:** Sohbetteki "Onayla ve kaydet" ve kalıcı test akışları aynen
  çalışıyor.

Doğrulama (bulut, Node 22 + Chromium 1194): typecheck, format:check,
`pnpm test` 48/48, build, `test:e2e` 13/13. Yeni testler
`tests/test-cases.test.ts` altında:

- Yalnız gerekli elementler kaydediliyor, tekrar keşifte mükerrer kayıt yok.
- Onaylı element değişmiyor, öneri ekleniyor.
- Doğrulanamayan element için kayıt açılmıyor ve case onaylanamıyor.
- Snapshot checksum'ı korunuyor.
- Gerçek worker, fixture ve sahte provider ile uçtan uca akış: keşif → taslak
  suite → onaysız çalıştırma 409 → düzenleme, 409 ve başka element seçimi →
  onay → PASS → birleşik geçmiş ve rapor → element düzenlenince `stale` →
  geçmiş run değişmiyor → ikinci keşifte 5 element korunuyor → çoğalt/sil.

Arayüz kanıtı (sahte provider + Demo Bank fixture, headless Chromium):
`docs/evidence/test-cases/fixture-*.png`.

**Açık iş:** SauceDemo + gerçek provider kabul testi Mac'te yapılmadı. Bulut
ortamı saucedemo.com'a ve provider'a erişemiyor; kullanıcı kabul testini sonra
kendisi yapacak.

- `pnpm dev` yeniden başlatılınca migration 013 `.local/my-data` üzerinde
  çalışır; önce dev durdurulup DB yedeklenmeli.
- `.local/my-data/INVALID-partial-backup.sqlite*` dosyaları başarısız bir
  yedek denemesinden kaldı (VM'den canlı DB'ye `VACUUM INTO`); silinebilir.

Sonraki adımlar: case'ten kalıcı sürüm yayımlama, sayfayı yeniden inceleterek
element ekleme, Test Runs bölümü ve canlı izleme.

## 21 Ekim 2026 — Element kütüphanesi Faz 4: self-healing ve "Birleştir"

Plan `wiggly-plotting-teapot` Faz 4 tamamlandı (plan bitti); ADR 016.
Migration 012: `project_settings.self_healing` (varsayılan kapalı,
`GET/PUT /v1/projects/:id/settings`, Ayarlar'da kart), `ai_heal_suggestions`,
korumalı adımla `ai_page_elements.status`/`merged_into`. Açıkken
`executeSuite` (suite ve kalıcı test çalıştırmaları) pinli birincil 0 eşleşirse
pinli revizyonun onaylı alternatiflerini sırayla dener (önerilenler asla);
ilk tekil eşleşen kullanılır, çoklu eşleşen alternatif iyileştirmeyi durdurur.
Adım `healed {locator, primary}`, sonuç `healedSteps`/`selfHealing`; ekranlar
"N adım alternatifle bulundu" gösterir. Geçen iyileşmeler çalıştırma başına
öneri olur; Elementler'de "Birincil yap" (yeni revizyon, onay korunur, eski
birincil alternatiflerin sonuna; etki listesi aynı panelde) ve "Yoksay".
"Birleştir": onaysız kopya aynı sayfadaki hedefe birleşir (onaylı hedefte
önerilen alternatif, onaysızda alternatif; hedef yeni revizyon), kopya
`merged` olarak emekli edilir (silinmez, geçmişi korunur, listede yok,
düzenlenemez); keşif artık önerilen alternatiflerle de eşleştirir. Testler:
`tests/self-healing.test.ts` (ayar + org izolasyonu, öneri kaydı, Birincil
yap → revizyon + etki + yeni sürüm, Yoksay, önerilenlerin çözüme girmemesi,
birleştirme: LOCATOR_IN_USE çözümü, onaylı kaynak reddi, 409/404, emekli
satır) ve `assistant.test.ts` executor testi (KAPALI → hata, AÇIK → healed,
çoklu eşleşme/hiç eşleşme → hata, çalışan/çoklu birincil iyileştirilmez).
Doğrulama: typecheck, format:check, `pnpm test` 45/45, build, `test:e2e`
13/13. Gerçek kontrol (`.local/my-data`, önce
`/tmp/zc-my-data-backup-20261021-faz4.sqlite`): `home.input` kopyası
`login.submit`'e birleştirildi (v7; locator'ları zaten alternatifti, 0 yeni
öneri). Birincil bilerek `[data-test="login-button-broken"]` yapıldı,
alternatifler id/data-test/role, yeniden onay (v9), test v3. Self-healing
KAPALI: 0/7, tümü `ELEMENT_NOT_FOUND`. AÇIK: 7/7, 8 adım `id: login-button`
ile bulundu, 1 öneri (8 adım). "Birincil yap" → v10 (`id: login-button`
birincil, birleştirme sayesinde `LOCATOR_IN_USE` yok), etki listesi test v3'ü
gösterdi; self-healing kapatılıp test v4 oluşturuldu, 7/7 başarılı, 0
iyileşme. Ayar son durumda kapalı. Kanıt: `docs/evidence/elements/merge.png`,
`heal-off-fail.png`, `heal-on-pass.png`, `heal-suggestion.png`,
`heal-promoted.png`, `heal-restored-pass.png`. Sınır: onaylı hedefe
birleştirme de yeni revizyon ürettiği için bağlı testler fark olmadan
"güncel olmayan" görünebilir; `inventory.input` (başka sayfada aynı locator)
birleştirilmedi.

## 21 Ekim 2026 — Element kütüphanesi Faz 3: locator değişikliği etkisi

Plan `wiggly-plotting-teapot` Faz 3 tamamlandı (Faz 4 başlamadı); ADR 015.
`GET …/ai/elements/:id/impact`: son sürümü bu elementin eski revizyonunu
pinleyen kalıcı testler (eski sürümler hariç), pinli → güncel revizyon ve
pinli anlık görüntüye göre birincil/alternatif/ad farkı, yeni sürümü
engelleyen elementler. `GET …/ai/tests` satırlarına `latest` ve yalnız son
sürüm için `stale_elements`; Testler'de "güncel olmayan element" rozeti ve
"Yeni sürüm oluştur". `POST …/ai/tests/:id/versions` (`expectedRevision`):
güncel onaylı revizyonlarla yeni sürüm (`derivedFrom`), checksum yalnız yeni
sürüm için; onaysız/silinmiş referans 409 `ELEMENT_UNAVAILABLE` +
`details.unavailable` listesi, değişiklik yoksa `TEST_UP_TO_DATE`. Migration
011 `ai_tests`'i `UNIQUE(org_id,suite_id)` olmadan yeniden kurar (satır,
checksum, trigger ve run referansları korunur); tekrar terfi ilk sürümü
döner. Element panelinde "Etkilenen testler" + "Yeni sürümü çalıştır"; liste
ve panelde önerilen alternatif sayısı rozeti. Taslaklar kapsam dışı: onayda
o anki onaylı revizyon pinlenir (doğrulandı). Testler: etki listesi (son
sürüm, eski revizyon), rozet bayrağı, yeni sürüm + eski sürüm/checksum
korunması, onaysız elementte red, 409'lar, org izolasyonu (404), migration 011. Doğrulama: typecheck, format:check, `pnpm test` 42/42, build,
`test:e2e` 13/13. Gerçek kontrol (`.local/my-data`, önce
`/tmp/zc-my-data-backup-20261021-faz3.sqlite`; 276 element, 2 test korundu):
`login.submit`'te `id: login-button` önerisi eklendi ama birincil yapılamadı
(eski onaysız `home.input` kaydı aynı locator'a sahip, `LOCATOR_IN_USE`);
bunun yerine önerilen `role=button "Login"` eklenip birincil yapıldı ve
yeniden onaylandı (v6). Etki listesi SauceDemo giriş testini (v1, pinli v2)
gösterdi; yeni sürüm v2 (`login.submit@6`) oluştu, v1 checksum'ı aynı;
v2 çalıştırması 7/7 başarılı. Kanıt: `docs/evidence/elements/impact-list.png`,
`new-version-run.png`.

## 21 Ekim 2026 — Element kütüphanesi Faz 2: suite'ler elementleri anahtarla kullanır

Plan `wiggly-plotting-teapot` Faz 2 tamamlandı (Faz 3–4 başlamadı); ADR 014.
`spec.ts`: `fill`/`click`/`assertVisible`/`assertText` tam olarak birini taşır:
`element: "<anahtar>"` veya `locator`; AI locator türleri gözlenebilen 6 türe
indirildi (prompt aynı listeyi üretir, önceden şema 10 tür kabul ediyordu).
`generateSuite` önce origin'in onaylı elementlerini (`libraryElements`:
anahtar, ad, sayfa, URL, kırılgan), sonra gözlemleri gönderir; onaylı elemente
denk gelen gözlem `element` ile işaretlenir. Karar: onaylı elementin
birincil/alternatif locator'ı ham kullanılırsa **deterministik olarak
anahtara çevrilir** (ek provider çağrısı yok; iki anahtara denk gelen locator
çevrilmez); bilinmeyen anahtar düzeltme turunda bildirilir. Taslak onayı
kullanılan revizyonları `ai_suite_elements`'a (migration 010, değişmez) pinler;
onaysız anahtar 409 `ELEMENT_UNAVAILABLE`. Worker anahtarı pinli revizyondan
çözer; onayı kaldırılmış/silinmiş element adımı `ELEMENT_UNAVAILABLE` ile
düşürür. Kalıcı test anlık görüntüsü `elementKey`/`elementId`/`revision`
taşır, plan yalnız referans varsa `elements` taşır (checksum'a dahil); eski
testler aynı şekilde okunur. UI: taslak senaryoları açılır adım listesi,
çalışma adımları "Ad (anahtar)" gösterir. Faz 1 düzeltmesi: onaylı elementin
yeniden gözlemdeki yeni adayları `suggested_alternatives`'a gider (çalıştırmada
kullanılmaz); düzenleme panelinde "Alternatif olarak ekle" yeni revizyon
(`alternative_added`) üretir, birincil değişmediği için onay korunur; migration
önceden revizyonsuz eklenmiş alternatifleri öneriye taşır. Testler: element
referansı + normalizasyon + düzeltme turu, tek hedef şeması, pinleme ve
reddetme, pinli revizyondan çözüm, onay kaldırılınca `ELEMENT_UNAVAILABLE`
(executor + terfi), plan checksum'ı, eski plan şekli, öneri/kabul/409,
öneri migration'ı. Doğrulama: typecheck, format:check, `pnpm test` 40/40,
build, `test:e2e` 13/13. Gerçek kontrol (`.local/my-data`, önce
`/tmp/zc-my-data-backup-20261021-faz2.sqlite` yedeği; 276 element korundu):
Evren `deepseek-v4.1-flash`, SauceDemo 7 senaryolu login istemi → taslak
24 sn'de, 24 adımın hedefli 23'ünün hepsi `login.*` anahtarı (0 ham
locator); onay 5 elementi v2'de pinledi; suite çalıştırması 7/7 başarılı;
kalıcı teste dönüştürme (`login.*@2`) ve test çalıştırması 7/7 başarılı.
Kanıt: `docs/evidence/elements/suite-element-refs.png`,
`run-element-refs.png`. Sınırlar: keşif modelin geçersiz adımıyla 1 sayfada
durdu (login için yeterli); yeniden gözlem onaylı 5 login elementine öneri
ekledi (kabul edilmedi); element yeni revizyon alınca mevcut suite/testler
eski pinli revizyonda kalır (Faz 3).

## 21 Ekim 2026 — Element kütüphanesi Faz 1: aday locator'lar, adlandırma, onay

Plan `wiggly-plotting-teapot` Faz 1 tamamlandı (Faz 2–4 başlamadı). Keşif her
DOM düğümü için tekil en fazla 3 locator tutuyor (`ObservedElement.alternatives`,
model istemine yalnız birincil gider). Migration 009: `ai_page_elements`'a
korumalı adımla (`PRAGMA table_info`) origin, `element_key`, ad, `page_key`,
onay, alternatifler (≤5), revizyon, `locator_role`; değişmez
`ai_element_revisions` (UPDATE/DELETE trigger). ADR 013: anahtar org + proje +
origin'de tekil, öneri `<sayfa>.<etiket>` + `_2` soneki; gözlem adaylardan biri
birincil/alternatife eşitse aynı elemente bağlanır, onaylı elementin birincil
locator'ı ve onayı değişmez. Worker upsert'i `recordObservedElements`'a taşındı.
API: `GET`/`PUT /v1/projects/:projectId/ai/elements/:id` (`expectedRevision`
→ 409, locator değişimi onayı kaldırır, onaylı anahtar kilitli,
`DUPLICATE_LOCATOR`, `ELEMENT_KEY_EXISTS`, `LOCATOR_IN_USE`), listede
`approved` filtresi. UI: satır içi düzenle paneli (ad, anahtar, sayfa,
birincil/alternatifler, onay, geçmiş), "Durum" filtresi. SQLite açılışı artık
5 sn `timeout` ile bekliyor (API/worker aynı anda migration yaparken
`database is locked` yerine). Testler: aday locator'lar, yeniden gözlemde aynı
id, onaylı elementin korunması, anahtar önerisi + sonek, eski revizyonla 409,
locator değişince onay düşmesi, geçmişin değişmezliği, ≤008 şemalı DB'nin
satırları koruyarak taşınması; UI testi adlandırma/onay. Doğrulama:
typecheck, format:check, `pnpm test` 37/37, build, `test:e2e` 13/13. Gerçek
kontrol (`.local/my-data`, önce `/tmp/zc-my-data-backup-20261021.sqlite`
yedeği): 276 satır kayıpsız taşındı (276 tekil anahtar); SauceDemo giriş
elementleri UI'dan `login.username`, `login.password`, `login.submit`,
`login.error`, `login.error_close` olarak adlandırılıp onaylandı (v2). Kanıt:
`docs/evidence/elements/library-edit.png`, `library-approved.png`. Sınır:
eski veride aynı düğüm için önceki locator önceliğinden kalma ikinci kayıtlar
(ör. `id: user-name` / `data-test="username"`) ayrı element olarak kalır;
gözlemin onaylı elemente eklediği alternatifler revizyon üretmez.

## 21 Ekim 2026 — Uçtan uca satın alma testi için keşif sınırları

Sorun: Evren `deepseek-v4.1-flash` SauceDemo satın alma isteğinde (giriş →
Backpack sepete → sepet → checkout bilgileri Test/Kullanici/34000 → özet →
siparişi tamamla → "Thank you for your order!") keşif 5 sayfada
`limit_pages` ile durdu; checkout-complete kaydedilmediği için teşekkür
mesajı doğrulanamadı (yalnız URL). `explorationLimits` 8 sayfa / 20 adım /
120 sn oldu. Yeni `explorationLeaseMs(providerTimeout)` =
`max(180 sn, limits.ms + timeout + 30 sn)`; worker `ai_analysis` öncesi
`Store.extendLease` ile uygular (son adım süre sınırını aşabilir). Testler:
sınırlar ≥ 6 sayfa/12 adım ve lease hesabı; döngü testi `explorationLimits.steps`
kullanıyor. Doğrulama: typecheck, format:check, `pnpm test` 35/35, build,
`test:e2e` 13/13. Gerçek kontrol (`.local/my-data`, Evren, SauceDemo,
`{{SAUCE_USER}}`/`{{SAUCE_PASS}}`): keşif 6 sayfa · 11 adım, model `done`
dedi; 3 senaryo (uçtan uca sipariş 15 adım `complete-header` = "Thank you for
your order!", posta kodu olmadan devam 11 adım, sepete ekle/kaldır 7 adım);
onay + çalıştırma 3/3 başarılı. Kanıt:
`docs/evidence/assistant/checkout-run.png`.

## 21 Ekim 2026 — Daha büyük suite'ler ve boş yanıt tekrarı

Sorun: Evren `deepseek-v4.1-flash` "tüm login senaryoları" (7 senaryo) isteğinde
önce `PROVIDER_EMPTY`, sonra `scenarios: too_big` / `scenarios.3.title: too_big`
ile düştü. `spec.ts` artık `suiteLimits` dışa veriyor: en fazla 10 senaryo,
senaryo başına 20 / suite başına 120 adım (`too_many_actions`), suite başlığı
120, senaryo başlığı 160 karakter. Üretim istemi sınırları açıkça yazar (fazla
istek gelirse önemli olanları seç); düzeltme mesajı `too_big (max N)` ve
sınırları tekrarlar; `max_tokens` 3000 → 8000. Boş içerik (yalnız
`reasoning`/`reasoning_content` dahil) düzeltme hakkını harcamadan bir kez
yeniden istenir. Bağlantı testi `reasoning_content`'i de kabul eder. Worker
`ai_suite`/`ai_test_run` öncesi `Store.extendLease` ile lease'i
`suiteLeaseMs(n) = max(180 sn, n × 30 sn + 60 sn)` yapar (yalnız lease sahibi
token uzatabilir). Ekran görüntüsü uç noktası index 0–9 / step 0–19. Yeni
testler: sınırlar ve lease hesabı, lease uzatma kapsamı, boş yanıt tekrarı.
Doğrulama: typecheck, format:check, `pnpm test` 35/35, build, `test:e2e` 13/13.
Gerçek kontrol (`.local/my-data`, Evren, `deepseek-v4.1-flash`, SauceDemo):
taslak 87 sn'de hazır, 7 senaryo; onay + çalıştırma 7/7 başarılı (geçerli
giriş, kilitli kullanıcı, yanlış parola, boş kullanıcı adı, boş parola, ikisi
boş, hata mesajını kapatma). Kanıt:
`docs/evidence/assistant/login-scenarios-run.png`. Sınırlar: keşif modelin
geçersiz adımıyla 1 sayfada erken durdu (login sayfası yeterliydi); API ve
worker aynı anda açılınca ilk `pnpm dev` bir kez `database is locked` ile
düştü, ikinci denemede açıldı (ayrı iş).

## 21 Ekim 2026 — Modelleri karşılaştırma

AI Test Assistant'a **Modelleri karşılaştır** modu eklendi: 2–3 model (kayıtlı
herhangi bir provider; kayıtlı anahtarla yeni `GET /v1/ai/providers/:id/models`)
aynı hedef ve istekle. Keşif bir kez çalışır (ilk model yönetir, tek
`ai_analysis` işi), bitince worker aynı incelemeyi tüm karşılaştırma
taslaklarına yazıp model başına bir `ai_generate` kuyruğa alır. `generateSuite`
artık yanıt sayısını ve provider `usage` toplamını raporluyor; worker süreyle
birlikte `ai_generation_metrics`'e yazıyor (başarısız üretimde de). Migration
008 (idempotent): `ai_comparisons`, `ai_comparison_drafts`,
`ai_generation_metrics`. Tablo: şema ilk denemede/düzeltmeyle/geçersiz,
senaryo/adım/doğrulama, kırılgan locator, süre, token, hata kodu, son suite
çalıştırması. Onay insanda: her satırda ayrı **Onayla** ve **Çalıştır**.
Maliyet sınırı en fazla 3 model, aynı model iki kez seçilemez
(`DUPLICATE_MODEL`); keşif hatası bekleyen tüm karşılaştırma taslaklarını
düşürür (`Store.failDraft`). Yeni testler (`tests/assistant.test.ts`): üç
mock model (ilk denemede geçerli / bozuk sonra düzeltilmiş / hep bozuk) →
ölçüler, token toplamı, tek keşif, onay+çalıştırma sonucu; keşif hatası
kardeş taslakları düşürür. Gerçek kontrol (`.local/my-data`, Evren, SauceDemo,
`{{SAUCE_USER}}`/`{{SAUCE_PASS}}`, ortak keşif 2 sayfa · 8 adım):
`deepseek-v4.1-flash` ilk denemede geçerli, 2 senaryo/12 adım/6 doğrulama,
0 kırılgan, 9,3 sn, 5939 token → çalıştırma 2/0 başarılı;
`qwen3.8-flash-next` ilk denemede geçerli, 2/12/6, 0 kırılgan, 30,3 sn,
6702 token → 2/0 başarılı; `glm-5.3` 90 sn provider timeout'unda
`PROVIDER_TIMEOUT`. Kanıt: `docs/evidence/assistant/model-comparison.png`.
Sınırlar: keşfi yalnız ilk model yönetir (diğer modellerin keşif becerisi
ölçülmez); süre üretim işinin duvar saati (kuyruk beklemesi hariç);
token yalnız provider `usage` döndürürse.

## 21 Ekim 2026 — Raporlama: birleşik geçmiş, istatistik, dalgalı test, HTML rapor

Çalıştırmalar → **Tüm çalıştırmalar**: klasik `runs`, `ai_suite_runs` ve
`ai_test_runs` tek `UNION ALL` sorgusunda; test (`kind:id`), durum ve UTC gün
aralığı filtresi, sunucu tarafı sayfalama (`/v1/projects/:id/reports/runs`).
Satırda süre, kısa hata nedeni, dalgalı rozeti ve **HTML raporu indir** var.
Testler → **Test istatistikleri** (`/reports/tests?n=20`): son N tamamlanmış
çalıştırmada başarı oranı, ortalama süre, son hata nedeni. Dalgalı kuralı
(`packages/domain/src/reporting.ts`, saf fonksiyon): aynı test sürümünün son 10
tamamlanmış çalıştırmasında en az bir `passed` ve bir `failed` varsa dalgalı;
`infrastructure_error`/`blocked`/`timed_out`/`cancelled` gösterilir ama
dalgalanma saymaz. HTML rapor (`/reports/runs/:kind/:id/report.html`): org/proje
kapsamlı (başka org 404), test adı/sürüm, plan checksum'ı (suite için tanım
SHA-256), adımlar, bulgular, SHA-256 doğrulanan ekran görüntüleri base64; `fill`
değerleri yazılmaz, projedeki gizli test verileri son kez `{{KEY}}`'e çevrilir,
script yok (CSP). Yeni `tests/reporting.test.ts` (3 test): kural/istatistik
birim testleri, filtre/sayfalama, export yetkisi ve gizli/girdi değeri
sızmaması; bozuk checksum'lı görüntü gömülmüyor. `assistant-ui` E2E'de yeni
kartla çakışan metin seçicisi daraltıldı. Gerçek kontrol (`.local/my-data`,
`pnpm dev`): 5 çalıştırma (4 AI suite, 1 kalıcı AI test) listelendi, hepsi
başarılı, dalgalı yok. Kanıt: `docs/evidence/reporting/run-history.png`,
`test-stats.png`. Örnek HTML rapor depoya eklenmedi: metinde gizli değer yok
ama SauceDemo giriş sayfasının ekran görüntüsünde sitenin kendi gösterdiği
demo parolası görünüyor. Sınırlar: PDF yok; tarih filtresi UTC; gömülen
görüntüler hedef sayfanın kendisinin gösterdiği bilgiyi içerebilir (input'lar
maskeli).

## 21 Ekim 2026 — Sayfa kalite doğrulamaları

AI suite/kalıcı test şemasına üç locator'sız doğrulama eklendi:
`assertNoConsoleErrors` (`ignore` ≤5), `assertNoBrokenLinks` (≤30 aynı-origin
bağlantı, HEAD→GET, yönlendirme izlenmez) ve `assertAccessible` (`impact`
`critical|serious`, varsayılan `serious`). Erişilebilirlik için yeni bağımlılık
`axe-core@4.14.0` (MPL-2.0, exact; `pnpm audit --prod` temiz); sayfa içinde
yerel çalışıyor, içerik dışarı gitmiyor. Bulgular adımda `findings` özeti olarak
saklanıyor (≤10 madde, mesaj ≤300 karakter, URL query'siz, gizli değerler
redakte); UI'da adım altında listeleniyor. Kontrol çalışmazsa adım başarısız
(`CHECK_NOT_RUN`); worker'ın hata açıklaması isteği artık yalnız adım
türü/durum/kodu gönderiyor. generateSuite prompt'u bu kontrolleri yalnız istek
açıkça istediğinde ekletiyor. Kalıcı teste dönüştürme locator'sız adımları
kabul ediyor. Fixture'a `/quality/{clean,console,links,a11y}` sayfaları
eklendi (Demo Bank değişmedi); yeni unit test pozitif/negatif durumları ve
`evidencedPass`'i kapsıyor. Gerçek doğrulama (`.local/my-data`, Evren
`deepseek-v4.1-flash`, SauceDemo, `{{SAUCE_USER}}`/`{{SAUCE_PASS}}`): model
login → assertUrl/assertText/assertVisible + `assertAccessible` +
`assertNoConsoleErrors` içeren 8 adımlı senaryo üretti; onaylanıp çalıştırıldı:
1 başarılı · 0 başarısız. SauceDemo inventory'de WCAG A/AA ihlali bulunmadı
(bağımsız axe çalıştırmasıyla teyit: 27 kural geçti; yalnız WCAG dışı
`page-has-heading-one`/moderate), konsol hatası yok. Kanıt:
`docs/evidence/assistant/quality-checks-run.png`. Sınır: otomatik tarama tüm
erişilebilirlik sorunlarını yakalamaz; bağlantı kontrolü yalnız mevcut sayfa ve
aynı origin; yönlendirmeler (3xx) sağlam sayılıyor.

## 21 Ekim 2026 — Proje test verileri ({{KEY}})

Ayarlar → **Test verileri** eklendi: proje başına anahtar/değer, isteğe bağlı
hedef origin kapsamı ve "Gizli" seçeneği (`test_variables`, migration 007,
idempotent; uçlar `/v1/projects/:projectId/test-variables`). Gizli değerler
provider anahtarıyla aynı AES-256-GCM yardımcısıyla şifreleniyor, API yanıtında
`null`/UI'da `••••••`. Prompt ve suite'lerde `{{KEY}}` kullanılıyor: keşifte
model değişken adlarını (gizli olmayanların değerini) görüyor, `fill` değeri
istekteki literal ya da tanımlı `{{KEY}}` olabiliyor (yoksa durma nedeni
`unknown_variable`); provider'a giden içerikte gizli değerler `{{KEY}}`'e
çevriliyor. Suite/kalıcı test referansı saklıyor, worker çalıştırma anında
çözüyor; tanımsız referans `MISSING_VARIABLE` adım hatası. Keşifte parola
input'unun değeri artık element adına sızmıyor (yalnız buton input'ları).
Küçük düzeltme: kenar menüdeki Çalıştırmalar sayacı kalıcı AI test
çalıştırmalarını (`ai_test_runs`) da sayıyor. Gerçek doğrulama
(`.local/my-data`, Evren `deepseek-v4.1-flash`, SauceDemo): SAUCE_USER (açık)
ve SAUCE_PASS (gizli) eklendi, literal kimlik bilgisi olmadan prompt gönderildi;
keşif `{{SAUCE_USER}}`/`{{SAUCE_PASS}}` ile girişi yapıp /inventory.html'e
ulaştı (2 sayfa, 3 adım), suite referansları sakladı, onaylanıp çalıştırıldı:
1 başarılı · 0 başarısız. Kanıt: `docs/evidence/assistant/test-data-settings.png`,
`test-data-run.png`. Sınır: gerçek vault/rotasyon yok; değerler aynı yerel
anahtarla korunuyor; çok kısa gizli değerlerin redaksiyonu metni bozabilir.

## 21 Ekim 2026 — Onaylı AI suite'ini kalıcı teste dönüştürme

Testler → AI suite'ler listesinde **Kalıcı teste dönüştür** eklendi
(`POST /v1/projects/:projectId/ai/suites/:id/promote`). Karar ADR 012'de:
suite başına tek test; yeni `ai_tests`/`ai_test_runs` tabloları (migration
006, idempotent; UPDATE/DELETE trigger'la engelli). Sürüm tanımı senaryoları ve
kullanılan elementlerin gözlem anlık görüntüsünü (sayfa URL'i, etiket, rol,
locator) ve SHA-256'yı saklar; aynı suite tekrar dönüştürülünce aynı sürüm
döner, aynı konuşmada revize edilip onaylanan suite yeni sürüm (v2) olur.
Çalıştırma AI suite executor'ı ile ayrı `ai_test_run` işinde: plan snapshot +
checksum run'a yazılır ve worker'da yeniden doğrulanır; origin yetkisi API'de
ve worker'da yeniden okunur (kaldırılmışsa 403 / `blocked`). PASS her senaryoda
assertion + tüm adımlar + ekran görüntüsü ister, yoksa
`INVALID_PASS_EVIDENCE`. Çalıştırmalar'da "Kalıcı AI testi çalıştırmaları"
kartı plan checksum'ı, senaryo sonuçlarını ve kanıt görüntülerini gösteriyor.
Ayrıca worker artık `ai_generate` işi için tarayıcı açmıyor. Gerçek doğrulama
(`.local/my-data`, SauceDemo suite'i): v1 oluşturuldu (3 senaryo, 11 element),
headless çalıştırma 3 başarılı · 0 başarısız. Kanıt:
`docs/evidence/assistant/promoted-test.png`, `promoted-run.png`. Sınır: soy
takibi konuşma + origin sezgisi; kalıcı AI test run'ı için iptal/idempotency
anahtarı yok; nav'daki Çalıştırmalar sayacı yalnız klasik run'ları sayıyor.

## 21 Ekim 2026 — Keşif şeffaflığı ve iki aşamalı AI işi

`exploreTarget` artık sessizce durmuyor: `inspection.stopped = {reason,
message, step?}` (`done`, `limit_pages`, `limit_steps`, `timeout`,
`step_failed`, `invalid_step`, `unobserved_locator`, `value_not_in_prompt`) ve
Türkçe kısa mesaj kaydediliyor; eski string kodlar `normalizeInspection` ile
dönüştürülüyor. Gözlenmeyen locator ve istekte olmayan `fill` değeri artık
analizi düşürmüyor; adım uygulanmadan keşif durup görülen sayfalarla devam
ediyor. Taslak kartı keşif yolunu (sayfa → eylem → sonuç) ve erken durma
uyarısını gösteriyor; parola alanı değerleri API'de ve UI'da maskeleniyor.
Analiz ikiye bölündü: `ai_analysis` (keşif → taslak `explored`) ardından
`ai_generate` (kayıtlı keşiften suite, `generating` → `ready`). Revise doğrudan
`ai_generate` kuyruğa alıyor (202, önceki suite + `instruction`). Lease süresi
dolunca iki tür de taslağı `WORKER_LEASE_EXPIRED` ile `failed` yapıyor. jobs
tablosunda CHECK olmadığından migration gerekmedi. Gerçek doğrulama (Evren
`deepseek-v4.1-flash`, SauceDemo): keşif ~10 sn, 3 sayfa / 5 adım, durma
nedeni `done`; üretim ~25 sn, 2 senaryo; iki iş de `done`. Kanıt:
`docs/evidence/assistant/exploration-path.png`. Sınır: erken durma uyarısı
gerçek sitede görülmedi (yalnız mock testlerde); worker `ai_generate` için de
tarayıcı açıyor.

## 21 Ekim 2026 — AI element listesi gruplama ve kararlı locator

Elementler → "Web sitelerinden kaydedilen elementler" artık tek uzun tablo
değil: sayfa URL'ine göre katlanabilir gruplar (ilk grup açık, sayı ve
kırılgan sayısı başlıkta), ad/locator araması ve sayfa filtresi var. Filtreler
API'de (`q`, `pageUrl`, `limit` ≤ 500, `offset`) çalışıyor; her grup 20'şer
satır yüklüyor ("Daha fazla göster"). Uzun birleşik adlar kısaltılıyor (tam
metin `title`). Keşif locator önceliği: tekil `data-testid`/`data-test` → `id` →
role + ad → label → placeholder → id'ye bağlı CSS (nth-of-type yalnız gerekli
yerde). `nth-of-type` içeren CSS `fragile` sayılıyor; bayrak locator'dan
türetildiği için migration gerekmedi (API SQL'de hesaplıyor). Suite prompt'u
modelden kararlı alternatif varken kırılgan locator kullanmamasını istiyor;
locator karşılaştırması anahtar sırasından bağımsız (`locatorKey`). Kanıt:
`docs/evidence/assistant/ai-elements-grouped.png`, `ai-elements-fragile.png`
(gerçek `.local/my-data` SauceDemo verisi: 3 sayfa, 120 element, 25 kırılgan —
eski keşiften; yeni keşifler daha az kırılgan locator üretmeli). Sınır: yeni
locator mantığı SauceDemo'da gerçek provider ile yeniden koşulmadı.

## 21 Ekim 2026 — Evren + SauceDemo gerçek uçtan uca doğrulama

Gerçek Evren provider (`deepseek-v4.1-flash`) ve `https://www.saucedemo.com`
ile `pnpm dev` + headless Chrome (`ZC_CHROMIUM_PATH`) üzerinde tam akış
doğrulandı: keşif 3 sayfa / 5 adım (login → inventory → backpack sepete →
cart), 3 senaryoluk taslak onaylandı, çalıştırma 3 başarılı · 0 başarısız ·
0 atlandı. Bulunan ve düzeltilen hatalar: (1) bağlantı testi `max_tokens: 4`
ile reasoning modellerinde `content` boş döndüğü için `PROVIDER_FORMAT`
veriyordu; artık `reasoning` alanı da geçerli yanıt sayılıyor. (2) Gözlemde
`tag:nth-of-type(n)` CSS sayfada tekil değildi (sepet linki keşifte
`STEP_FAILED`); artık sayfada tekilse `[data-test=...]`, değilse en yakın id'li
ataya bağlı CSS yolu kullanılıyor. (3) SPA geçişinde URL değişip DOM henüz
çizilmemişken gözlem yapılıyordu; `settle` DOM öğe sayısı sabitlenene kadar
(en fazla ~2 sn) bekliyor. (4) Aynı URL yeniden gözlenince önceki locator'lar
siliniyordu (tıklanan "add to cart" düğmesi kayboluyordu); artık birleştiriliyor.
(5) Reasoning modelleriyle suite üretimi 30 sn'de zaman aşımına uğruyordu;
provider timeout üst sınırı 120 sn'ye çıkarıldı (kullanılan: 90 sn). Kanıtlar:
`docs/evidence/assistant/saucedemo-*.png`. Sınır: tek model ve tek akış
denendi; job lease 180 sn olduğundan uzun keşif + iki üretim denemesi bu süreyi
aşabilir.

## 21 Ekim 2026 — AI planlayıcıya çok sayfalı keşif

`inspect` yerine `exploreTarget` geldi: worker hedef sayfayı gözler, modelden
tek seferde bir `fill`/`click` keşif adımı ya da `{"done":true}` ister, adımı
aynı Chromium context'inde tekil locator şartıyla uygular ve yeni sayfayı
gözler. Sınırlar 5 sayfa / 12 adım / 120 saniye ve aynı origin; `fill` değeri
kullanıcının isteğinde birebir yoksa `EXPLORATION_VALUE` ile durur. Gözlem
şekli `{pages, path, stopped?}` oldu; eski tek sayfa taslaklar `pages[0]`
olarak okunur (revise kırılmaz). Gözlem seçicisine `[data-testid]` eklendi.
`generateSuite` tüm sayfaların locator birleşimini kullanıyor ve
`UNOBSERVED_LOCATOR` artık tek düzeltme çağrısına dahil. Senaryo başına adım
sınırı 8 → 20. Her sayfanın öğeleri kendi URL'iyle `ai_page_elements`'e
yazılıyor; taslak kartı incelenen sayfaları listeliyor. Mock provider testleri:
login → dashboard keşfi ve suite'in gerçek Chromium'da geçmesi, gözlenmeyen
locator için 1 düzeltme sonrası hata, uydurulmuş `fill` değerinin reddi, 12
adım sınırında durma. Sıradaki adım: Evren provider + SauceDemo ile gerçek uçtan
uca doğrulama ve `docs/evidence` görüntüleri.

## 20 Ekim 2026 — AI şema düzeltmesi ve element kaydı

`PROVIDER_FORMAT` için şema doğrulama hataları kısa alan kodlarıyla modele
iletiliyor; en fazla bir düzeltme çağrısından sonra hâlâ geçersizse açık hata
gösteriliyor. Chromium incelemesi başarıyla bittikten hemen sonra elementler
migration 005'teki org/proje/sayfa/locator anahtarlı SQLite tablosuna
kaydediliyor. Böylece model geçersiz JSON döndürse bile incelenen öğeler
Elementler ekranında kalıyor. Demo Bank'ın onaylı model revision'ları
değiştirilmiyor. Yerel HTTP provider testi ilk yanıtta bozuk, ikinci yanıtta
geçerli JSON senaryosunu doğruladı; sürekli bozuk yanıt durumunda da 4 öğenin
kayıtlı kaldığı doğrulandı. Harici Evren provider yanıtı bulut ağ engeli
nedeniyle burada doğrulanamadı.

## 20 Ekim 2026 — Provider verisini otomatik sürdürme

Kullanıcının gerçek kalıcı veri dizini `.local/my-data` olarak netleşti. Eski
belirsiz yol yönergesi yerine `ZC_DATA_DIR="$PWD/.local/my-data" pnpm dev`
çalıştırılabilir. Ek olarak `pnpm dev:resume` provider içeren SQLite dosyalarını
`.local/*` ve eski `/tmp/zerocode-demo.*` dizinlerinde tarayıp en güncel kaydı
seçer; geçici dosyayı SQLite backup ile kalıcı `.local/recovered-*` dizinine
taşırken şifreleme anahtarı ve kanıtları birlikte kopyalar. Mevcut DB üzerine
yazmaz; seçilen yolu konsola bildirir.

## 20 Ekim 2026 — AGENT_ERROR teşhisi ve harici ağ engeli

Worker'ın `/usr/bin/chromium` yolunu tüm işletim sistemlerinde varsayması
tarayıcı açılış hatasını `AGENT_ERROR` olarak saklıyordu. Şimdi belirtilen
`ZC_CHROMIUM_PATH`, Linux sistem Chromium'u veya Playwright'ın kurulu Chromium'u
seçiliyor; eksik tarayıcı `BROWSER_UNAVAILABLE`, açılış hatası
`BROWSER_START_FAILED` olarak bildiriliyor. Hedef gezinme zaman aşımı, TLS ve
ağ hataları da ayrı kodlarla görünür. Harici SauceDemo ve Evren provider
hostlarına bu bulutun proxy politikası 403 `policy_denied` verdi. İki alan adı
için bulut ortamı izin taslağı kaydedildi; yayınlanmadığı sürece gerçek provider
ve harici site akışı bu ortamda doğrulanamaz. Yerel Chromium fixture ile
çalıştırılabilir suite'in her adımı için maskeli, checksum kontrollü PNG
üretimi ve API/chat bağlantısı eklendi. Planlayıcı yalnız ilk sayfa DOM'unu
incelediğinden login sonrası sepet/ödeme locator'larını henüz keşfetmiyor;
tam sipariş akışı başarılıymış gibi sunulamaz.

## 20 Ekim 2026 — Chat'ten hedef yetkilendirme

`TARGET_BLOCKED` hatasında chat, HTTPS hedefi için **Siteyi ekle ve tekrar
gönder** eylemi sunuyor. Kullanıcı açıkça tıklayınca origin aynı Ayarlar
listesine yazılıyor ve kaybolmayan prompt tekrar gönderiliyor. Site zaten
listede görünürse eski API sürecinin yeniden başlatılması gerektiği belirtiliyor.
Browser E2E, engellenen hedefi, chat içi yetkilendirmeyi ve listeye kalıcı
kaydı doğruluyor; harici sayfa taraması ağ politikası nedeniyle doğrulanmadı.

## 20 Ekim 2026 — Yerel provider verisinin kalıcılığı

Önceki demo komutu her çalıştırmada yeni `/tmp/zerocode-demo.*` dizini
oluşturuyordu; kullanıcı provider kaydını sonraki açılışta göremedi. Provider
SQLite'da, AES anahtarı aynı `ZC_DATA_DIR` altındaki `assistant.key` dosyasında
kalır. Kanıt arşivi yönergesi `.local/demo-data` klasörüne yalnız ilk sefer
kopyalayacak şekilde düzeltildi. Eski geçici dizin varsa iki dosyayla birlikte
yeniden kullanılabilir; mevcut veriyi silme/üzerine yazma yapılmamalı.

## 20 Ekim 2026 — Ayarlar'da yetkili hedef listesi

Harici test hedefleri Ayarlar'da HTTPS site listesi olarak eklenip siliniyor.
Migration 004 ile org kapsamında saklanıyor; API ve worker her işte güncel
listeyi okuduğu için yeniden başlatma gerekmiyor. Worker harici hedefin DNS
adresini tarayıcı açmadan önce denetliyor; tarayıcı istekleri hedef origin'e
kısıtlı kalıyor. Yerel demo origin'i varsayılan olarak yetkili.

## 20 Ekim 2026 — Yerel arayüz 5000 portunda

3000 portu kullanıcının ortamında dolu olduğu için `pnpm dev` web arayüzünü
5000 portunda açıyor. API, 5000 kaynaklı yerel UI isteklerini kabul ediyor;
ayrı E2E sunucusu 3000 portundaki önceki akışla çalışmaya devam ediyor.

## 20 Ekim 2026 — AI ayarları ve chat ekran kanıtı

Provider, Base URL ve API anahtarı formu chat içindeki pencereden çıkarılıp
sidebar'daki **Ayarlar** sayfasına taşındı. Chat yalnız aktif provider/model
seçimini gösteriyor. E2E ekran yakalama, provider yüklendikten sonra boş chat'i
ve tüm konuşma, suite ve PASS sonucunu içeren chat'i kaydediyor. Güncel PNG'ler
`docs/evidence/assistant/` altında; UI testi gerçek yerel provider, API ve
Chromium ile çalışıyor.

## 20 Ekim 2026 — AI Test Assistant artımı

Kullanıcının doğal dil ile hedef inceleme, provider ayarları, düzenlenebilir
suite ve gerçek browser çalıştırma isteği üzerine AI Assistant eklendi. Sidebar
chat'i, kalıcı konuşmalar, birden çok şifreli OpenAI-compatible provider,
gerçek connection/model endpoint'leri, ayrı worker'da pasif Chromium DOM taraması,
yalnız gözlenen locator'larla sınırlı yapılandırılmış senaryo üretimi ve insan
onaylı suite çalıştırma var. Sonuçlar ve checksum kontrollü PNG chat'te görünür;
başarısız sonuç modelden açıklama alır, suite yeni taslak olarak düzenlenebilir.
AI suite'leri Testler ekranında listelenir; klasik canonical testlerden ayrı
SQLite tablosunda kalır. Migration 003 eklendi. Provider anahtarları AES-256-GCM
ile `.local/assistant.key` veya `ZC_AI_ENCRYPTION_KEY` üzerinden şifrelenir.

Hedef erişimi varsayılan olarak yalnız yerel fixture. Harici origin yalnız açık
`ZC_AUTHORIZED_TARGET_ORIGINS` listesi ile ve HTTPS olarak desteklenir; bu bulut
ortamının egress listesinde kullanıcı staging/provider hostu olmadığı için harici
site veya gerçek provider hesabı doğrulanmadı. Testlerde yerel HTTP provider
sunucusu gerçek `/models` ve `/chat/completions` isteklerini karşıladı; API
anahtarı DB/yanıtta düz metin bulunmadı. Pozitif gerçek login için geçerli
test verileri gerekir. Suite onayı form gönderme için kullanıcı iznidir.
Gerçek auth/membership, vault, DNS pinning, browser container izolasyonu ve
production egress henüz eksik; prototip loopback dışına açılmamalı.

Doğrulama: `pnpm typecheck`, `pnpm test` 22/22, `pnpm build`, `pnpm format:check`
ve `pnpm test:e2e` 13/13 geçti, skipped=0. Yeni AI arayüz E2E'si provider
ayarından suite PASS ve Testler listesine kadar gerçek tarayıcıyı kullandı.
Negatif assertion ve AI hata önerisi entegrasyon testinde doğrulandı. Ekran
kanıtları `docs/evidence/assistant/` altında. Güncel commit ve uzak dal SHA'sı
Git üzerinden kontrol edilmelidir.

Kullanıcının isteği: eklenen ürün dosyalarını analiz edip uygulamayı geliştirmeye
başlamak; bağlam/token sınırına yaklaşınca işleri güvenli noktada durdurup sonraki
oturumda devam etmek. Belgeler bağlamdır; içlerindeki rol prompt'ları bağımsız
komut değildir. Gate A/B müşteri araştırması yapılmış kabul edilmedi.

## Element kütüphanesi — tamamlanan ikinci artım

Kullanıcı, elementlerin ID/CSS/XPath ve Playwright locator özellikleriyle merkezi
yönetilmesini istedi. **Elementler** ekranı eklendi: arama/filtreler, manuel ekleme
ve düzenleme, birincil + alternatif locator, DOM bilgileri, insan onayı, gerçek
worker denemesi, kullanım listesi ve salt okunur model geçmişi. HTML ID ile
semantic element anahtarı ayrıdır. Alternatifler kendiliğinden kullanılmaz.

Desteklenen 10 tür: id, css, xpath, role, label, testId, text, placeholder, title,
altText. Yeni migration `002_locator_checks.sql`; eski veriler korunur ve eski
model/test sürümleri okunabilir. Keşif yeni aday locator'ları ve DOM metadatasını
çıkarır; yeniden keşif, elle eklenmiş diğer elementleri silmez.

Doğrulama: 21 domain/API testi, 12 uçtan uca kontrol geçti; skipped=0. Tüm 10
locator türü gerçek Chromium'da tekil öğe buldu. Eski modelde test tekrar koştu;
yeni CSS modeliyle test de PASS verdi. Eksik birincil locator + geçerli alternatif
BLOCKED kaldı. Sıfır/çoklu eşleşme, geçersiz selector, ID selector injection,
onaysız/kapsam dışı işlemler ve optimistic concurrency kontrol edildi. Build ve
tip kontrolü başarılı. Görsel incelemede aynı satıra tıklayınca kullanım panelinin
sıfırlanması düzeltildi. Son ekran görüntüleri `docs/evidence/elements/` altında.

Sınır: yine yalnız iki yerel demo sayfası. Genel uygulama/sayfa, iframe ve gerçek
staging bağlantısı yok. Kalıcı silme yok; onay kaldırılabilir. Önceki testleri yeni
model sürümüne taşıma açık bir sonraki ürün akışıdır. Auth, PostgreSQL ve egress
sertleştirme işleri aşağıdaki sırada bekler.

## İlk artımda uygulananlar

- Ürün belgelerinin orijinalleri `docs/product/` altında korundu.
- Türkçe Next.js çalışma alanı: genel bakış, uygulama modeli, test tasarımı,
  çalışma geçmişi ve gerçek screenshot/expected/observed ayrıntıları.
- Aynı canonical testin business, flow ve salt okunur technical projeksiyonları.
- Fastify API; loopback demo oturumu, org scope, viewer write engeli, CSRF kontrolü.
- İki sabit öğretim rotasında gerçek pasif DOM keşfi; 5 adayın insan onayı;
  yeni immutable mapping/flow revision. Genel web crawler değildir.
- Framework bağımsız Zod test şeması, pinned mapping/flow, deterministik compiler.
  Assertion yoksa publish yok; belirsiz locator sessizce seçilmez.
- Ayrı Playwright worker; gerçek Chromium context; fillSecret referansları yalnız
  sentetik fixture verisine çözülür. Gerçek vault desteği henüz yok.
- SQLite/WAL kalıcı kuyruk, transaction/lease, idempotency, iptal, bounded run,
  expire olmuş worker lease için infrastructure_error, terminal CAS koruması.
- Snapshot ve artifact checksum; inputları maskeli PNG; artifact auth/org kontrolü.
- İlk migration dosyası, setup/run komutları, API özeti ve GitHub Actions taslağı.

Bu artım tam MVP/enterprise sürümü değildir. Üretim deploy/publish yapılmadı.
Başlangıç deposu boş ve `work` dalı unborn idi; ilk geliştirme oturumunun sonunda
commit/push yoktu. Kullanıcı 19 Ekim 2026'da kaynakları GitHub'a göndermemizi istedi.
İlk gönderime kaynak kod, ürün belgeleri, lockfile ve CI workflow dahil edildi.
Kullanıcının ek isteğiyle ekran görüntüleri, test günlükleri ve oturum anahtarları
temizlenmiş demo veritabanı kopyaları `docs/evidence/` altında ayrıca arşivlendi.
Canlı çalışma dizinleri, oturum anahtarları, bağımlılık dizini ve derleme önbelleği
Git dışında kalır; bağımlılıklar ve build lockfile üzerinden yeniden üretilir.
Güncel commit ve uzak dal durumu Git üzerinden kontrol edilmelidir. Sonraki ajan
mevcut değişiklikleri korumalı; reset/clean yapmamalı.

## Doğrulama kaydı

- `pnpm install --frozen-lockfile`: bu makinede çalıştırıldı; paket checksum/TLS
  kontrolleri kapatılmadı. pnpm 11 için yalnız esbuild build script'i izinli.
- `pnpm typecheck`: geçti.
- `pnpm test`: 16/16 domain/API/DB/projeksiyon kontrolü geçti; skipped=0.
- `pnpm build`: optimize Next.js build geçti.
- `pnpm format:check`: geçti. `bash scripts/setup-cloud.sh` baştan sona çalıştırıldı;
  frozen install, tip kontrolü, 16 test ve derleme tekrar başarılı oldu.
- `pnpm test:e2e`: 9/9 geçti (1 ana UI akışı + 8 alt kontrol), skipped=0.
  Ayrı geçici DB ve gerçek ayrı servislerle üretim Next.js build'i kullanıldı.
  PASS + 2 assertion, bozuk dashboard FAIL, belirsiz buton BLOCKED, yanlış bakiye
  FAIL, timeout, cancellation, pinned tekrar koşum, authenticated PNG/checksum ve
  390px mobil taşma kontrolü. JS runtime error yok.
- Lease crash recovery birim testinde süre aşımı simüle edildi; gerçek worker kill
  veya process/container isolation benchmark'ı henüz yapılmadı.
- İlk E2E'de test helper boş POST'a JSON Content-Type eklediği için iptal testi
  reddedildi; test istemcisi düzeltildi ve tam E2E yeniden geçti.
- `pnpm audit --prod`: bilinen açık bulunmadı. Next.js altındaki PostCSS için
  uyumlu 8.5.23+ override ve lockfile yenilemesi sonrası tarama tekrar geçti.
- CI workflow yazıldı; GitHub üzerinde çalıştırıldığı iddia edilmiyor.
- Ortam yapılandırma taslağına tam `install_script` ve `start_skill` kaydedildi.
  Kaydetme başarılı; runtime'a otomatik uygulanma, publication veya yeni task'ta
  geri yükleme doğrulanmış değil. Kullanıcı ortam ayarlarından gözden geçirip
  kaydetmeli, sonra ortamı yayımlamalı. Yeni secret/ağ alanı eklenmedi.

Tekrar üretme: README komutları. `pnpm test:e2e` öncesi build gerekir ve dev
süreçleri kapalı olmalıdır. E2E, dolu port bulursa mevcut süreçlere dokunmadan
başarısız olur. Kanıt dosyaları `test-results/` altında ignore edilir.

## Sonraki artımın önerilen sırası

Ürün tarafındaki en yakın eksik **element kütüphanesine bağlı genel test ve iş
akışı tasarımcısıdır**. Mevcut editör hâlâ giriş akışı + dashboard/bakiye şablonuyla
sınırlıdır. Kullanıcı element ve aksiyon seçebilmeli; tıkla, doldur, doğrula
adımlarını sıralayıp taslak kaydedebilmeli, yayınlanan sürümü tekrar açabilmelidir.
Ardından genel uygulama/sayfa kataloğu, mapping değişikliğini testlere açık onayla
uygulama, suite ve çoklu test çalıştırma gelir. Aşağıdaki auth/PostgreSQL/güvenli
hedef işleri gerçek staging/pilot kullanımından önce tamamlanmalıdır.

1. **Gerçek tenant/auth temeli:** kanıtlanmış session/auth çözümü, gerçek user ve
   membership; org/project provisioning; RBAC matrisi ve çok üyeli negatif test.
   Yerel demo login'i üretim rotası olarak açma.
2. **PostgreSQL geçişi:** versiyonlu migration, scope/FK/transaction korumaları,
   SKIP LOCKED claim, çok worker yarışları, gerçek crash/restart ve backup/restore.
   SQLite prototipini pilot verisiyle kullanma.
3. **Kalıcı taslak/sürüm UX:** optimistic concurrency ile draft kaydı; yeni revision
   oluşturma, eski published version seçip tekrar koşma; pagination ve auth expiry.
4. **Gerçek staging hedefi:** hedef sahipliği/politika, DNS pinning, her redirect ve
   bağlantıda IP/egress doğrulaması; browser sandbox/container, bütçeler, rate limit.
   Bu tamamlanana kadar URL girişini ve harici hedefleri açma.
5. **Genel discovery/guided teach:** role/label/testId locator adayları, aday başına
   DOM/screenshot evidence, manuel element picker ve reusable flow tasarımı.
6. **Pilot güvenilirliği:** gerçek encrypted vault adapter, credential redaction
   testleri, auth kontrollü trace/artifact storage, retention, signed URLs, audit
   finalize olayları, metrics, tam OpenAPI ve erişilebilirlik/kontrast incelemesi.

AI Assistant'ın sınırları yukarıda belirtilmiştir; otonom healing, mobil/API
engine, Kubernetes ve browser farm hâlâ kapsam dışıdır.
Ürün avantajı, müşteri araştırması ve ticari validasyon kanıtlanmış sayılmaz.

## Çalışma kuralları

Kullanıcı 19 Ekim 2026'da her tamamlanan işin mutlaka commit ve push ile
kapatılmasını sürekli talimat olarak verdi. İlgili doğrulamaları yap, origin/main
dalına gönder, uzak commit'i kontrol et ve sonucu bildir; tekrar push onayı sorma.
Bu tercih AGENTS.md içinde de kayıtlıdır.

Mevcut `/workspace/ZCFA-ZeroCodeFullAutomation` checkout'unu kullan. Task zaten
izole; kullanıcı istemedikçe worktree açma. Gerçek secret'ları chat/log/dosyalara
yazma. Beklenen assertion'ları değiştirme; belirsiz öğeyi ilk eşleşmeyle geçirme.
Sonraki oturumda önce bu dosya, README, ADR 011 ve gerçek git status okunmalı.
