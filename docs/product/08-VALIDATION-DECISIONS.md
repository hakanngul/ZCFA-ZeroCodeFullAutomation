# 08 — Validation Strategy, Risk Register ve Karar Günlüğü

## Validasyon önce gelir

**Temel yanlışlama sorusu:** Kullanıcı “kod yazmadan” test hazırlasa da discovery/teaching/repair toplam zamanını hesaba katınca geleneksel yöntemden daha çok uğraşıyor mu? Eğer öyleyse temel vaat geçersiz olabilir.

## Deneyler

| Deney | Test yöntemi | Ölçüm / karar eşiği (öneri, kesin veri değil) |
|---|---|---|
| EX-01 Problem interviews | 5–8 Manual QA/BA, 2–3 alıcı ile görüşme, mevcut yöntem ve harcanan zaman | Gerçek pain / satın alma gerekçesi; 2 design partner ilgisi |
| EX-02 Controlled language usability | 8 kullanıcı, önceden yazılmış 3 kritik scenario, yardım yok | ≥6/8 kullanıcı en az 1 meaningful test'i doğru oluşturabilsin |
| EX-03 End-to-end time | Discovery/teach/test/run sürelerini dahil et; mevcut manuel + varsa otomasyon ile karşılaştır | Ortanca toplam süre birden çok testte ≥%25 daha kısa **hipotezi** |
| EX-04 Maintenance study | Aynı akışın 5 testinde label/id/DOM değişikliği, iki yöntemle repair | Toplam bakım süresi ≥%25 azalıyor mu? Yanlış PASS **0 seeded case** |
| EX-05 Reliability falsification | Kasden bozulan dashboard/assertion, ambiguous element, stale secret, crashed worker | Hiçbir seeded defect false PASS olmuyor; blocked/infra ayrımı doğru |
| EX-06 Customer willingness | İki Head of QA/CTO ile gerçek maliyet/teklif görüşmesi | Ücretli pilot/LOI veya fiyat bandına açık net talep |
| EX-07 BrowserStack benchmark | Aynı 3 senaryo, aynı kullanıcı segmenti, benzer environment, aynı kanıt şartı | Hız/maintenance/öğrenme/ROI farkı **ölçülür**; rakip özel mimarisi varsayılmaz |

**Kontroller:** Kullanıcının önceki deneyimi eşleştirilmeli; ısınma ve sıralama etkisi azaltılmalı; aynı fixture/app; testin “meaningful” oluşu kör değerlendirilerek assertion kalitesine göre puanlanmalı. Kısa run sonucunu toplam sahip olma maliyeti sanma.

## KPI tanımları

- **Time-to-first-evidenced-test:** kullanıcı hesabı/proje erişiminden ilk gerçek PASS/FAIL kanıtına kadar toplam süre, keşif + öğreti + assertion dahil.
- **Assisted-completion rate:** yardım veya teknik kod olmadan meaningful test kuran kullanıcı oranı.
- **Discovery approval ratio:** insan onayı alan candidate öğe sayısı / incelenen candidate.
- **False-green:** seeded doğrulama hatası olduğu halde testin PASS vermesi; bir kritik olay için go/no-go tekrar değerlendirmesi gerekir.
- **Maintenance minutes per drift:** UI değişimi sonrası tüm bağlı testlerin doğru koştuğu ana kadar harcanan insan dakikası.
- **Model reuse:** tekrar kullanılan flow/element referans sayısı ve bunların ürettiği bakım tasarrufu.
- **Run health:** pass/fail/blocked/infrastructure_error ayrı takip edilir; top-line pass rate tek başına kalite ölçüsü değildir.
- **Cost per evidenced run:** CPU/storage/traffic/support bölü tamamlanan gerçek, kanıtlı run sayısı.

## Risk register (ilk varsayımsal sıralama)

| Risk | Etki | İlk kontrol / azaltma | Sahiplik |
|---|---|---|---|
| R01 yanlış PASS/bug gizleme | Kritik | strict assertions, ambiguous → block, seeded fault tests, approval-only healing | QA Architect |
| R02 otomasyon hazırlama süresinin uzaması | Yüksek | onboarding/prototype benchmark, total time, template reuse | Product/UX |
| R03 keşif yanlış/eksik modeller | Yüksek | read-only scan, candidate evidence, guided teach, approval | Discovery Eng |
| R04 rakip ürün parity / zayıf ödeme isteği | Yüksek | BrowserStack ile tarafsız pilot benchmark, WTP interviews | Product/Commercial |
| R05 kullanıcıların DSL'i anlayamaması | Yüksek | usability tests, controlled autocomplete, progressive disclosure | UX |
| R06 SSRF, prod sistemine zarar, secrets leak | Kritik | allowlist, URL/DNS/redirect kontrolü, sandbox, audit, redaction | Security |
| R07 flaky/infrastructure instability | Yüksek | typed states, worker lease, trace, deterministic waits | Execution Eng |
| R08 tenant data leak | Kritik | defense in depth org scoping, tests, signed artifact access | Backend/Security |
| R09 maliyet ve worker concurrency | Orta/Yüksek | minute metrics, quotas, retention, pilot cap | Platform |
| R10 model/adapter karmaşıklığı | Orta | minimal typed action set, schema evolution contract tests | Tech Lead |

## Go / pivot / stop kuralları

- **Go:** Kullanıcının yardımsız anlamlı test yazabildiği, yanlış PASS gözlenmediği ve iki uygulamada gerçek bakım faydası olduğu görülür.
- **Pivot:** Discovery maliyeti yüksekse “full auto discovery” vaadi bırakılıp guided app teaching/template-first tasarıma öncelik verilir.
- **Stop/pause:** Yerleşik rakiplere göre toplam emek/maliyet avantajı görünmüyorsa veya ürünün false PASS riski güvenilir biçimde kontrol edilemiyorsa yeni özellikleri büyütme.
- **Enterprise readiness:** SSO/on-prem eklemeden önce gerçek satış isteği ve güvenlik kontrollerinin kanıtı aranır.

## ADR / Karar günlüğü

| ADR | Karar | Alternatif | Gerekçe | Trade-off / revisit |
|---|---|---|---|---|
| 001 | Business intent + app knowledge çekirdek | Recorder-first | Planlanan bakım ve reuse farkını test etmek | Keşif UX maliyeti; EX-02/04 sonrası |
| 002 | Controlled language, typed IDs | Serbest doğal dil | Determinism/traceability | Esneklik sınırlı; usability sonucu |
| 003 | Web Chromium Playwright MVP | Web+API+Mobile birlikte | MVP riskini düşürür | İlk segment mobile ağırlıklıysa revize |
| 004 | Human-approved mappings | Auto-heal publish | Yanlış PASS riski | Seeded negative set geçmeden değişmez |
| 005 | Canonical Test Model & version pins | Script/code storage | Cross-framework evrim ve reproducibility | Schema tasarım maliyeti |
| 006 | Modular monolith + separate worker | Microservice/Kubernetes | Basit operasyon, güçlü izolasyon | Concurrency/organizasyon büyürse |
| 007 | Deterministic MVP, AI roadmap | AI-first | Güvenlik, stabilite, maliyet | Gerçek AI value ölçülürse |
| 008 | Human-defined assertions mandatory | AI-inferred expected | False-green savunması | Her zaman kritik invariant |
| 009 | PostgreSQL queue önerisi | Redis/BullMQ | MVP için tek altyapı | Load test ve worker volume sonrası |
| 010 | İlk pazar SaaS pilot varsayımı | On-prem ilk | Operasyon maliyeti | Müşteri security requirement sonrası |

## Açık sorular — geriye kalan gerçek ürün kararları

1. İlk pilot müşteri/uygulama ve 3 business flow hangileri?
2. Türkiye/Türkçe önceliği mi, İngilizce-first mi?
3. Bütçe, hosting, kullanıcı sayısı, koşum kapasitesi ve saklama politikasının ilk sınırları neler?
4. Prod/stage domain onboarding politikası ve denetleyici kim?
5. Kullanıcı mapping onayını hangi yetkiyle verir?
6. UI drift testinde hangi baseline (Playwright handwritten mı, mevcut tool mu) adil karşılaştırma sağlar?
7. BrowserStack karşısında ödeme kararı verecek alıcının kazanç eşiği nedir?

## Bir sonraki somut aksiyonlar

**A.** 2 hedef QA ekibini bul ve problem/pilot görüşmelerini yap.  
**B.** 1 staging demo uygulamasında login/dashboard/critical form flow'larını sabitle.  
**C.** Controlled intent editörünün tıklanabilir prototipini göster; 8 kullanıcı testini yap.  
**D.** 3 UI drift senaryolu güvenilirlik benchmark'ı tasarla.  
**E.** Gate A/B sonuçlarını ADR'lara işle; ardından EP-01 → EP-05 çalışan dikey dilimi geliştir.

**Belirsizlik işaretleme kuralı:** Gözlenmemiş müşteri, avantaj, fiyat, başarı yüzdesi veya performans için **ASSUMPTION / VALIDATION REQUIRED** yaz; kanıtlanmış iş sonucu gibi sunma.
