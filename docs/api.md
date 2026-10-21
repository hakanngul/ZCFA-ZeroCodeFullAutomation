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

| Metot      | Yol                                                                | Sonuç                                                                |
| ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| GET/POST   | /v1/ai/providers                                                   | Anahtarsız liste / şifreli provider kaydı                            |
| PUT/DELETE | /v1/ai/providers/:id                                               | Provider düzenle / sil                                               |
| POST       | /v1/ai/providers/:id/activate                                      | Aktif provider seç                                                   |
| POST       | /v1/ai/providers/connection                                        | Gerçek chat completion bağlantı testi                                |
| POST       | /v1/ai/providers/models                                            | Gerçek model listesi                                                 |
| GET/POST   | /v1/ai/authorized-origins                                          | Yetkili HTTPS hedefleri listele / ekle                               |
| GET        | /v1/projects/:projectId/ai/elements                                | AI ile gözlenen sayfa elementleri                                    |
| DELETE     | /v1/ai/authorized-origins/:id                                      | Yetkili hedefi kaldır                                                |
| GET        | /v1/projects/:projectId/ai/conversations                           | Konuşma geçmişi                                                      |
| GET        | /v1/projects/:projectId/ai/conversations/:id                       | Mesaj, taslak ve çalışma geçmişi                                     |
| POST       | /v1/projects/:projectId/ai/messages                                | Prompt → kuyruklu browser incelemesi ve AI taslağı                   |
| GET        | /v1/projects/:projectId/ai/suites                                  | Onaylanan suite listesi                                              |
| POST       | /v1/projects/:projectId/ai/drafts/:id/save                         | Düzenlenen suite'i insan onayıyla kaydet                             |
| POST       | /v1/projects/:projectId/ai/suites/:id/revise                       | Suite'i yeni taslak olarak aç                                        |
| POST       | /v1/projects/:projectId/ai/suites/:id/runs                         | Ayrı worker'da gerçek suite çalıştırma                               |
| GET        | /v1/projects/:projectId/ai/runs/:id                                | Durum ve senaryo sonuçları                                           |
| GET        | /v1/projects/:projectId/ai/runs/:id/screenshots/:index             | Auth/org/checksum kontrollü PNG                                      |
| GET        | /v1/projects/:projectId/ai/runs/:id/screenshots/:index/steps/:step | Adım bazında auth/org/checksum kontrollü PNG                         |
| POST       | /v1/projects/:projectId/ai/suites/:id/promote                      | Onaylı suite → değişmez, sürümlü kalıcı test (201 yeni / 200 mevcut) |
| GET        | /v1/projects/:projectId/ai/tests                                   | Kalıcı AI test sürümleri (origin yetkisi dahil)                      |
| GET        | /v1/projects/:projectId/ai/tests/:id/versions/:revision            | Sürüm tanımı + checksum                                              |
| POST       | /v1/projects/:projectId/ai/tests/:id/runs                          | Sürümü plan snapshot + checksum ile kuyruğa al                       |
| GET        | /v1/projects/:projectId/ai/test-runs                               | Kalıcı test çalıştırmaları                                           |
| GET        | /v1/projects/:projectId/ai/test-runs/:id                           | Plan, durum, senaryo sonuçları                                       |
| GET        | /v1/projects/:projectId/ai/test-runs/:id/screenshots/:index        | Auth/org/checksum kontrollü PNG                                      |
| GET/POST   | /v1/projects/:projectId/test-variables                             | Test verileri; gizli değer yanıtta `null`                            |
| PUT/DELETE | /v1/projects/:projectId/test-variables/:id                         | Güncelle (boş değer = koru) / sil                                    |

`aiSuiteSchema` yalnız `fill`, `click`, `assertVisible`, `assertText`,
`assertUrl` ve locator'sız sayfa kalite adımlarını (`assertNoConsoleErrors`
`{ignore?}`, `assertNoBrokenLinks`, `assertAccessible` `{impact?}`) kabul eder;
bunların özet bulguları adım sonucunda `findings` olarak döner. Her senaryoda açık assertion zorunludur.
Analizden dönen locator'lar incelenen DOM'da gözlenmiş olmalı; kullanıcı da
onaydan önce yalnız bu locator'ları saklayabilir. En fazla 4 senaryo ve her
senaryoda 8 adım vardır. Her senaryo 30 saniye ile sınırlıdır; otomatik retry yok.
Provider kimlik bilgisi response, log ve artifact içinde dönmez. Harici hedef
yalnız yapılandırılmış tam HTTPS origin listesinde çalışır.
