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
