# ZeroCodeFullAutomation — Kanıta Dayalı Mevcut Durum, Gap ve Kabul

Tarih: **24 Ekim 2026** · Çalışma alanı: Windows 11, `main`

Bu belge hedef ürünün tamamlandığı anlamına **gelmez**. Mevcut kaynak kodu,
yerel doğrulama ve tanımlanmış kabul kriterlerini birbirinden ayırır. Ana ürün
hedefi: **URL → AI keşif → önerilen plan → insan seçimi → merkezi elementler →
Case/Suite → gerçek Chromium yürütmesi → kanıt**.

## 1. Doğrulanmış mevcut durum

| Bileşen                               | Durum               | Kaynak/kanıt                                                                                                       |
| ------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Web ve API                            | Mevcut              | `apps/web` (Next.js 15), `apps/api` (Fastify 5), yerel 5000/4000                                                   |
| Kalıcı kayıtlar                       | Mevcut              | `packages/storage`, SQLite, `infra/migrations/001–014`                                                             |
| Provider yapılandırması               | Mevcut              | `packages/assistant/src/provider.ts`, `apps/api/src/assistant.ts`; OpenAI-compatible, şifreli anahtar, model testi |
| Kontrollü keşif                       | Mevcut/kısıtlı      | `packages/assistant/src/agent.ts`; gözlenmiş locator, aynı-origin tarayıcı, sayfa/adım/zaman sınırı                |
| Önerilen Test Planı                   | Mevcut/geliştirildi | ADR 018; seçilen testler üretiliyor. Bu artım: ön koşul/adım/beklenen sonuç alanları, düzenlenebilir UI            |
| Element Registry                      | Mevcut              | `packages/storage/src/ai-elements.ts`; key, locator, revizyon, onay ve kullanım ilişkileri                         |
| Case/Suite/Step                       | Mevcut/kısmi        | `packages/storage/src/test-cases.ts`, `apps/web/app/components/test-suites.tsx`; ID referansları ve snapshot       |
| Gerçek test yürütmesi                 | Mevcut              | `apps/worker/src/main.ts`, `packages/assistant/src/cases.ts`; assertion + screenshot kanıtı                        |
| Canlı yürütme yayını                  | Henüz doğrulanmadı  | Kalıcı run/step durumu mevcut; canlı video/stream kapasitesi kabul edilmiş değil                                   |
| Çok kullanıcılı SaaS kimlik doğrulama | Prototip dışı       | Mevcut yerel demo oturumu; üretim erişim modeli değil                                                              |
| Windows test çalıştırıcısı            | Yerel doğrulandı    | `tests/process-tree.ts`; negatif PID temizliği ve Playwright tarayıcı yolu Windows uyumluluğu                      |

Yerel son kontrol: `pnpm format:check`, `pnpm typecheck` ve `pnpm build`
başarılı; `pnpm test` **50/50 PASS**, `pnpm test:e2e` **13/13 PASS**
(plan seçim index üyeliği dahil). `pnpm audit --prod` bilinen zafiyet
bildirmedi. Gerçek Chromium ile Elementler filtrelerinde
**390/600/800/1050/1440 px** taşma yok (iki kırpılmış ekran kanıtı
`docs/evidence/test-cases/`). Plan kartının mock AI ile gerçek tarayıcı
görüntüsü de aynı kanıt klasöründedir. Node **26.12.1**, projenin ilan ettiği Node
**24.x** aralığı dışındadır; yerel sonuçlar bu farkla birlikte yorumlanmalıdır.

## 2. Öncelikli Gap Analysis

| Öncelik | Boşluk                                                                                               | Kabul yolu                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0      | Keşif LLM yönergesine rağmen tehlikeli bir öğeye tıklayabilirdi                                      | Deterministik riskli-tıklama engeli eklendi; birim testi var. Yanlış-negatifler için daha güçlü işlem semantiği/izin modeli gerekli                    |
| P0      | Plan önerilerinde ayrı adım/expected/precondition verisi ve bunları düzenleme yoktu                  | Şema, provider promptu, kullanıcı editörü ve seçimin worker'a aktarılması geliştirildi; eski planlar varsayılan boş listelerle açılır                  |
| P0      | Windows testlerinin `detached`/negatif PID kullanması worker birikmesine yol açabiliyor              | Test süreç ağacı yardımcı modülü eklendi; 50/50 unit/integration ve 13/13 E2E başarılı                                                                 |
| P1      | Eski `ai_suites` akışı ile yeni kalıcı `test_suites/test_cases` modeli paralel                       | Veri kaybetmeden kanonik model ve kademeli uyumluluk/migration stratejisi                                                                              |
| P1      | AI plan seçimleri, özgün plan maddelerine bağlı değildi                                              | Kaydedilen özgün plandaki `sourceIndex` ve kategori sunucuda doğrulanıyor; mükerrer/sahte seçim 409 döner, eski istemciler başlık eşleşmesiyle çalışır |
| P1      | Yeni plan alanları yalnızca insan-okur yönlendirme; adımlar DOM referansı olarak ayrıca doğrulanmalı | Her üretilen aksiyonu gözlem, element ID ve assertion ile eşleştir; belirsizleri BLOCKED bırak                                                         |
| P1      | `Navigate/Fill/Click/Select/Assert` yanında görsel Wait/reusable adımlar kısmi                       | Case editörü + şema + worker + tarayıcı regresyonu üzerinden kapsama                                                                                   |
| P1      | SSRF kontrolü DNS çözümü ve bağlantı anı arasında ayrışıyor                                          | IP pinleme/ağ egress ilkesi, DNS yeniden çözümleme ve redirect testleri                                                                                |
| P2      | Worker eşzamanlılığı 1; büyük suite, uzun geçmiş ve canlı yayın darboğazı                            | Ölçümlü yük testi, kuyruk metrikleri, eşzamanlı worker ve akış/yayın altyapısı                                                                         |
| P2      | Üretim için kullanıcı/tenant kimlik doğrulama ve dağıtım tasarımı                                    | Ayrı bir güvenlik ADR'si ve izole test ortamında rol/tenant regresyonu                                                                                 |

## 3. Hedef mimari ve kayıt sözleşmesi

```text
Workspace
 └─ Project
    ├─ AI Providers → Exploration → Test Plan → Human selection
    ├─ Element Registry (elementId, pageUrl, key, revision)
    ├─ Test Suite ── 1:N ── Test Case ── 1:N ── Test Step
    │                                     └─ elementId (+ approved revision)
    └─ Test Run → pinned suite/case snapshot + element revisions
                 + step observations + assertions + screenshot hashes
```

- `Element Registry` içindeki benzersiz ID ve revizyon, test adımlarının
  tekil kaynak referansıdır. Case içinde serbest locator kopyası kalıcı
  tek doğruluk kaynağı olarak kullanılmaz.
- İnceleme aşamasında **hiçbir** Case/element yaratılmaz. Kullanıcı seçimi
  yalnızca taslak Case/Suite üretir; yayın ve yürütme açık onay gerektirir.
- Geçmiş run sonuçları/snapshot/hash değerleri sonradan element veya case
  güncellendiğinde değişmez.
- Provider/LLM yalnızca önerir; tarayıcı, şema, güvenlik, scope ve assertion
  otoriteleri uygulamanın deterministik kodunda kalır.

## 4. Önceliklendirilmiş uygulama yolu

**MVP sağlamlaştırma:** Windows test yaşam döngüsü, plan ayrıntılarının
uçtan uca taşınması, keşif güvenlik engelleri, plan seçimi kayıt bütünlüğü,
tekil/versiyonlu elementler, güvenilir PASS/FAIL/BLOCKED ve UI responsive.

**Sonraki sürüm:** Eski/yeni suite veri modeli konsolidasyonu, görsel
reusable step/Wait, case değişiklik etki analizi, merkezi run geçmişi,
gerçek görev durumu ve canlı yürütme görüntüsü için teknik tasarım.

**İleri aşama:** Ölçeklenebilir runner kuyruğu, ölçümlü paralellik, farklı
tarayıcılar ve platformlar, güvenli tenant altyapısı, raporlama/kalite kapıları.

## 5. Ölçülebilir kabul kriterleri

1. **AI plan:** Gerçek gözlenmiş sayfalarda plan maddelerinin adı/türü,
   ön koşulları, adımları, expected result ve veri gereksinimi gösterilir.
   Eski planlar veri kaybetmeden açılır. Seçilmeyen madde kayda geçmez.
2. **Element bağlama:** Her oluşturulan locator tabanlı adım ya benzersiz
   doğrulanmış `elementId` taşır ya `unresolved/BLOCKED` durumundadır.
   Aynı sayfa/locator tekrar keşfi mükerrer canlı element yaratmaz.
3. **Güvenli keşif:** Silme/ödeme/son checkout ve hesap ayarını yazma
   kontrolü otomatik tıklanmaz; neden görünür. Güvenli giriş/navigasyon
   tıklaması çalışmaya devam eder.
4. **Gerçek yürütme:** Case ve Suite gerçek Chromium'da koşar; assertion
   yapılmadan PASS yoktur. Hatalı assertion FAIL, kayıp/çift element
   BLOCKED olur. Screenshot ve step referansları run'a bağlıdır.
5. **Tarihçe:** Locator/case revizyonu eski snapshot/checksum/kanıtı
   değiştirmez. Rollere ve projeye göre API izolasyonu korunur.
6. **Responsive:** 390/600/800/1050/1440 px genişlikte filtreler taşmaz;
   klavye ile erişilebilir öğeler kullanılır.
7. **Regresyon:** Desteklenen Node 24 üzerinde typecheck, format, test,
   build ve Playwright E2E başarılıdır; aktif geliştirme portları ve test
   verileri izole tutulur.

## 6. Riskler ve doğrulama sınırları

- **Yüksek:** Keşif, genel etiketli bir işlemle beklenmeyen veri değişikliği
  yapabilir. Yeni engel savunma katmanıdır, tam işlem sınıflandırıcısı veya
  kullanıcı onay protokolü **değildir**.
- **Yüksek:** SSRF/private ağ koruması, DNS rebinding ve redirect varyantları
  için izole güvenlik testi gerektirir.
- **Orta:** AI modelinin planı gerçek DOM kapsamından fazlasını önerebilmesi;
  gözlemlenmeyenleri `feasible=false`/BLOCKED yapmak gerekir.
- **Orta:** Test yürütmeleri ve geliştirme servisi ortak sabit portları
  kullandığında çakışma ve yalancı başarısızlık üretebilir. Windows süreç
  ağacı temizliği geliştirildi; test port izolasyonu devam işi.
- **Orta:** Node 26 yerel kurulum desteklenen sürüm aralığı dışındadır.
- **Bilinmeyen:** Dış AI sağlayıcısı ve SauceDemo üzerinde gerçek ücretli
  provider kimlik bilgileriyle uçtan uca akış bu artımda doğrulanmadı.

## 7. Nihai kabul notu

Bu artımın kanıtı **mevcut + geliştirilmiş bir MVP dilimidir**, tam ürünü
tamamlanmış olarak kabul etmez. Nihai kabul için ayrı doğrulama raporunda
`pnpm test`, `pnpm test:e2e`, `pnpm build` ve gerçek sağlayıcılı
keşif/plan/approval/element/case/run akışının sonuçları birlikte yer almalıdır.
