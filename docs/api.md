# Yerel API v1

Loopback API: 4000. Web, `/api` prefix'ini aynı origin üzerinden proxy eder.
Tüm proje/test/run/artifact istekleri `zc_session` cookie ister. Yazma istekleri
`Origin: http://127.0.0.1:3000` (veya localhost:3000) ve
`X-ZeroCode-Client: local-ui` gerektirir. Kapsam istemcinin orgId header'ından alınmaz.

| Metot  | Yol                                     | Sonuç                                                          |
| ------ | --------------------------------------- | -------------------------------------------------------------- |
| GET    | /health                                 | Servis modu ve sağlık                                          |
| POST   | /v1/session/local                       | Yerel demo admin oturumu; üretim auth değil                    |
| DELETE | /v1/session                             | Oturumu iptal et                                               |
| GET    | /v1/workspace                           | Oturum aktörü ve erişilebilir projeler                         |
| GET    | /v1/projects/:projectId                 | Model, scans, tests, son 30 run, audit                         |
| POST   | /v1/projects/:projectId/discovery-scans | Sabit demo için asenkron pasif keşif                           |
| POST   | /v1/projects/:projectId/mappings/review | `{scanId, approvedIds}` → yeni immutable model                 |
| POST   | /v1/projects/:projectId/tests           | `CanonicalTest` → validate + publish; draft endpoint henüz yok |
| POST   | /v1/tests/:id/runs                      | `{variant}` + `Idempotency-Key` → 202 / aynı run               |
| GET    | /v1/runs/:id                            | Plan, expected/observed, outcome, sürüm snapshot'ı             |
| POST   | /v1/runs/:id/cancel                     | Kuyrukta/çalışan run iptali                                    |
| GET    | /v1/runs/:id/screenshot                 | Auth/org/checksum kontrollü PNG                                |

Input şemaları Zod strict runtime validation kullanır. `CanonicalTest` şeması
`packages/domain/src/index.ts` dosyasındadır. İlk sürümde `useBusinessFlow(login)`
ve dashboard `elementVisible` / `elementText` desteklenir. Arbitrary JS yoktur.
`revision` bir test için 1'den başlar ve tam bir artırılır. Aynı revision çakışırsa
409 döner. UI yeni test ve yayınlanan sürümü okuma destekler; draft server-side
kaydı ve sürüm düzenleme henüz yoktur.

Hatalar `{code, message, requestId}` biçimindedir. `401` oturum eksik/süresi dolmuş,
`403` rol/kaynak/kapsam engeli, `404` görünmeyen nesne, `409` sürüm/idempotency/durum
çakışması, `429` kuyruk limiti anlamına gelir. Özel hata stack'i veya credential
değeri response'a eklenmez. Tam OpenAPI sözleşmesi gelecek artıma bırakıldı.

## Elementler ve locator denemeleri

| Metot | Yol                                               | Sonuç                                               |
| ----- | ------------------------------------------------- | --------------------------------------------------- |
| GET   | /v1/projects/:projectId/elements                  | Güncel liste; `?revision=N` ile geçmiş              |
| POST  | /v1/projects/:projectId/elements                  | `{expectedRevision, element}` → yeni model revision |
| PUT   | /v1/projects/:projectId/elements/:elementId       | Aynı gövde; sabit element anahtarı değiştirilemez   |
| GET   | /v1/projects/:projectId/elements/history          | Son 100 model sürümü ve element sayıları            |
| GET   | /v1/projects/:projectId/elements/:elementId/usage | Kullanıldığı flow ve yayınlanmış test sürümleri     |
| POST  | /v1/projects/:projectId/locator-checks            | `{page, locator}` → 202 / ayrı worker işi           |
| GET   | /v1/projects/:projectId/locator-checks/:id        | Durum, gönderilen locator ve gerçek eşleşme sonucu  |

Element gövdesi `id`, `label`, `page`, `locator`, `approved` ve isteğe bağlı
`alternatives` (en fazla 5), `dom` alanlarını içerir. `page` yalnız `login` veya
`dashboard` olabilir. Locator `{kind, value}`; `role` türünde ek `role` alanı
zorunludur. HTML ID `kind: id`, test niteliği `kind: testId` olarak ayrılır.
Şema `packages/domain/src/locators.ts` dosyasında tanımlıdır; diğer alanlar ve
arbitrary code reddedilir. Aynı locator birincil ve alternatifte tekrarlanamaz.

`expectedRevision` 0 ile keşif yapmadan ilk manuel kayıt açılabilir. Eksik/onaysız
referanslar test yayınlamayı yine bloke eder. Her düzenleme yeni immutable
AppModel revision'ıdır; önceki published testlere uygulanmaz. `REVISION_CONFLICT`
409 döndürür. Viewer oluşturma/düzenleme/locator işi başlatamaz. Tüm okuma ve işler
org/project kapsamındadır. Sonuç `count`, `resolution` (`unique`, `not_found`,
`ambiguous`), `visible` ve `durationMs` içerir. Geçersiz söz dizimi
`INVALID_LOCATOR` ile sonuçlanır; snapshot geri yükleme bu denemenin geçmişteki
uygulamayı açtığı anlamına gelmez: deneme canlı yerel demo hedefinde yapılır.

## AI Assistant ve suite

| Metot      | Yol                                                                | Sonuç                                                                         |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| GET/POST   | /v1/ai/providers                                                   | Anahtarsız liste / şifreli provider kaydı                                     |
| PUT/DELETE | /v1/ai/providers/:id                                               | Provider düzenle / sil                                                        |
| POST       | /v1/ai/providers/:id/activate                                      | Aktif provider seç                                                            |
| POST       | /v1/ai/providers/connection                                        | Gerçek chat completion bağlantı testi                                         |
| POST       | /v1/ai/providers/models                                            | Gerçek model listesi                                                          |
| GET        | /v1/ai/providers/:id/models                                        | Kayıtlı provider'ın model listesi (anahtar sunucuda kalır)                    |
| GET/POST   | /v1/ai/authorized-origins                                          | Yetkili HTTPS hedefleri listele / ekle                                        |
| GET        | /v1/projects/:projectId/ai/elements                                | AI ile gözlenen sayfa elementleri                                             |
| GET        | /v1/projects/:projectId/ai/elements/:id                            | Kütüphane elementi ve değişmez geçmişi                                        |
| PUT        | /v1/projects/:projectId/ai/elements/:id                            | Ad/anahtar/sayfa/locator/onay (`expectedRevision`, 409)                       |
| POST       | /v1/projects/:projectId/ai/elements/:id/suggestions/accept         | Önerilen alternatifi ekle (`expectedRevision`, onay korunur)                  |
| GET        | /v1/projects/:projectId/ai/elements/:id/impact                     | Son sürümü eski revizyonu pinleyen kalıcı testler + fark (ADR 015)            |
| POST       | /v1/projects/:projectId/ai/elements/:id/merge                      | Onaysız kopyayı hedefe birleştir (`expectedRevision`, `targetId`, ADR 016)    |
| GET/PUT    | /v1/projects/:projectId/settings                                   | Proje ayarları: `selfHealing` (varsayılan kapalı, ADR 016)                    |
| GET        | /v1/projects/:projectId/ai/heal-suggestions                        | Self-healing önerileri (`status=pending\|promoted\|ignored`)                  |
| POST       | /v1/projects/:projectId/ai/heal-suggestions/:id/promote            | "Birincil yap": iyileşen locator birincil, yeni revizyon (`expectedRevision`) |
| POST       | /v1/projects/:projectId/ai/heal-suggestions/:id/ignore             | "Yoksay": öneriyi kapat, element değişmez                                     |
| DELETE     | /v1/ai/authorized-origins/:id                                      | Yetkili hedefi kaldır                                                         |
| GET        | /v1/projects/:projectId/ai/conversations                           | Konuşma geçmişi                                                               |
| GET        | /v1/projects/:projectId/ai/conversations/:id                       | Mesaj, taslak ve çalışma geçmişi                                              |
| POST       | /v1/projects/:projectId/ai/messages                                | Prompt → kuyruklu browser incelemesi ve AI taslağı                            |
| POST       | /v1/projects/:projectId/ai/comparisons                             | 2–3 model (`models: [{providerId, model}]`): tek keşif, model başına üretim   |
| GET        | /v1/projects/:projectId/ai/comparisons/:id                         | Model başına şema/sayım/kırılgan locator/süre/token ve son çalıştırma         |
| GET        | /v1/projects/:projectId/ai/suites                                  | Onaylanan suite listesi                                                       |
| POST       | /v1/projects/:projectId/ai/drafts/:id/save                         | Düzenlenen suite'i insan onayıyla kaydet                                      |
| POST       | /v1/projects/:projectId/ai/suites/:id/revise                       | Suite'i yeni taslak olarak aç                                                 |
| POST       | /v1/projects/:projectId/ai/suites/:id/runs                         | Ayrı worker'da gerçek suite çalıştırma                                        |
| GET        | /v1/projects/:projectId/ai/runs/:id                                | Durum ve senaryo sonuçları                                                    |
| GET        | /v1/projects/:projectId/ai/runs/:id/screenshots/:index             | Auth/org/checksum kontrollü PNG                                               |
| GET        | /v1/projects/:projectId/ai/runs/:id/screenshots/:index/steps/:step | Adım bazında auth/org/checksum kontrollü PNG                                  |
| POST       | /v1/projects/:projectId/ai/suites/:id/promote                      | Onaylı suite → değişmez, sürümlü kalıcı test (201 yeni / 200 mevcut)          |
| GET        | /v1/projects/:projectId/ai/tests                                   | Kalıcı AI test sürümleri (origin yetkisi dahil)                               |
| GET        | /v1/projects/:projectId/ai/tests/:id/versions/:revision            | Sürüm tanımı + checksum                                                       |
| POST       | /v1/projects/:projectId/ai/tests/:id/versions                      | Güncel onaylı element revizyonlarıyla yeni sürüm (`expectedRevision`, 409)    |
| POST       | /v1/projects/:projectId/ai/tests/:id/runs                          | Sürümü plan snapshot + checksum ile kuyruğa al                                |
| GET        | /v1/projects/:projectId/ai/test-runs                               | Kalıcı test çalıştırmaları                                                    |
| GET        | /v1/projects/:projectId/ai/test-runs/:id                           | Plan, durum, senaryo sonuçları                                                |
| GET        | /v1/projects/:projectId/ai/test-runs/:id/screenshots/:index        | Auth/org/checksum kontrollü PNG                                               |
| GET/POST   | /v1/projects/:projectId/test-variables                             | Test verileri; gizli değer yanıtta `null`                                     |
| PUT/DELETE | /v1/projects/:projectId/test-variables/:id                         | Güncelle (boş değer = koru) / sil                                             |

## Tests: suite ve test case (ADR 017)

| Metot    | Yol                                                               | Sonuç                                                                                                   |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET/POST | /v1/projects/:projectId/test-suites                               | Suite'ler ve case'leri (durum, eksikler, son çalışma) / elle suite (`title`, yetkili `targetUrl`)       |
| GET/PUT  | /v1/projects/:projectId/test-suites/:id                           | Suite ayrıntısı / yeniden adlandır (`title`)                                                            |
| DELETE   | /v1/projects/:projectId/test-suites/:id                           | Suite ve case'leri yumuşak sil; çalıştırma geçmişi korunur                                              |
| POST     | /v1/projects/:projectId/test-suites/:id/cases                     | Yeni case (`title`, `category`, `definition?`)                                                          |
| POST     | /v1/projects/:projectId/test-suites/:id/runs                      | Onaylı + eksiksiz case'leri tek `batchId` ile kuyruğa al; diğerleri `skipped` (hiçbiri yoksa 409)       |
| GET/PUT  | /v1/projects/:projectId/test-cases/:id                            | Case + son 10 çalıştırma / düzenle (`expectedRevision`, 409; yeni revizyon, onay kalkar)                |
| DELETE   | /v1/projects/:projectId/test-cases/:id                            | Case'i yumuşak sil                                                                                      |
| POST     | /v1/projects/:projectId/test-cases/:id/duplicate                  | Taslak kopya                                                                                            |
| POST     | /v1/projects/:projectId/test-cases/:id/approve                    | İnsan onayı (`expectedRevision`): bağlı element revizyonlarını pinler; eksik case 409 `CASE_INCOMPLETE` |
| POST     | /v1/projects/:projectId/test-cases/:id/runs                       | Onaylı case'i case + element revizyon snapshot'ı ve checksum ile kuyruğa al (onaysız 409)               |
| GET      | /v1/projects/:projectId/test-case-runs/:id                        | Durum, adım sonuçları, değişmez snapshot (pinli elementler)                                             |
| GET      | /v1/projects/:projectId/test-case-runs/:id/screenshot             | Senaryo sonu PNG (auth/org/SHA-256 kontrollü)                                                           |
| GET      | /v1/projects/:projectId/test-case-runs/:id/steps/:step/screenshot | Adım PNG (auth/org/SHA-256 kontrollü)                                                                   |
| GET      | /v1/projects/:projectId/ai/elements/:id/usage                     | Elementi kullanan case'ler: adım numaraları, pinli/güncel revizyon, `stale`                             |

Case adımı `{id, kind, elementId?, value?, expected?, url?}`; `kind` =
`navigate`, `click`, `fill`, `select`, `assertVisible`, `assertText`,
`assertUrl` ve sayfa kalite adımları. `click`/`fill`/`select`/`assertVisible`/
`assertText` bir kütüphane elementine **id** ile bağlanır; doğrulanamayan
element için adım `unresolved {reason, message}` taşır ve case eksiktir.
`GET …/ai/elements?origin=` yalnız o sitenin elementlerini döner (element
seçici).

## Raporlama

| Metot | Yol                                                        | Sonuç                                                                                                                                                                          |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET   | /v1/projects/:projectId/reports/runs                       | Klasik, AI suite ve kalıcı AI test çalıştırmaları tek listede; `test=kind:id`, `status`, `from`/`to` (UTC gün, dahil), `limit` ≤100, `offset`; `total` ve satır başına `flaky` |
| GET   | /v1/projects/:projectId/reports/tests                      | Test başına son `n` (varsayılan 20, ≤100) tamamlanmış çalıştırma: başarı oranı, ortalama süre, son hata nedeni, `flakyVersions`                                                |
| GET   | /v1/projects/:projectId/reports/runs/:kind/:id/report.html | Tek çalıştırmanın kendi içinde yeterli HTML raporu (indirme); `kind` = `canonical`, `suite`, `ai_test`, `case`                                                                 |

Dalgalı (flaky) kuralı: aynı test **sürümünün** son 10 tamamlanmış
çalıştırmasında en az bir `passed` ve en az bir `failed` varsa sürüm dalgalıdır.
`infrastructure_error`, `blocked`, `timed_out` ve `cancelled` pencerede kalır ama
dalgalanma saymaz. Başarı oranı = başarılı / son N tamamlanmış çalıştırma; son
hata, en yeni başarısız/engellenen/altyapı hatalı çalıştırmadır (iptal hariç).
HTML rapor yalnız oturumun org/proje kapsamındaki çalıştırmayı açar (aksi 404);
ekran görüntülerini kayıtlı SHA-256 doğrulandıktan sonra base64 gömer, `fill`
değerlerini hiç yazmaz ve projedeki gizli test verilerini son bir kez
`{{KEY}}`'e çevirir. Rapor script içermez (CSP `default-src 'none'`).

`aiSuiteSchema` yalnız `fill`, `click`, `assertVisible`, `assertText`,
`assertUrl` ve locator'sız sayfa kalite adımlarını (`assertNoConsoleErrors`
`{ignore?}`, `assertNoBrokenLinks`, `assertAccessible` `{impact?}`) kabul eder;
bunların özet bulguları adım sonucunda `findings` olarak döner. Her senaryoda açık assertion zorunludur.
Analizden dönen locator'lar incelenen DOM'da gözlenmiş olmalı; kullanıcı da
onaydan önce yalnız bu locator'ları saklayabilir. En fazla 10 senaryo, senaryo
başına 20 ve suite başına toplam 120 adım; senaryo başlığı en fazla 160 karakter.
Her senaryo 30 saniye ile sınırlıdır; suite çalıştırma lease'i senaryo sayısına
göre uzar. Otomatik retry yok. Ekran görüntüsü uç noktası `index` 0–9, `step`
0–19 kabul eder.
Provider kimlik bilgisi response, log ve artifact içinde dönmez. Harici hedef
yalnız yapılandırılmış tam HTTPS origin listesinde çalışır.
