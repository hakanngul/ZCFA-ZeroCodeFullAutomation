# ZeroCodeFullAutomation — Product Foundation v1.0

**Durum:** Tasarım temeli / kararların ve varsayımların ayrıldığı ilk sürüm  
**Tarih:** 18 Ekim 2026  
**Kaynaklar:** `Fikir.txt` (ürünün orijinal vizyonu ve 18 aşamalı çerçevesi); kullanıcıyla Phase 1 görüşmeleri ve BrowserStack karşılaştırması.  
**Not:** Bu belgeler üretim kodu değil, ürün ve mühendislik için referans çerçevesidir.

## Tek cümlelik ürün tanımı

**ZeroCode**, manuel QA ve analistlerin *kontrollü iş diliyle* test senaryosu tanımlayabildiği; uygulamanın onaylanmış sayfa/bileşen/iş akışı bilgisini tekrar kullanarak bunları framework'ten bağımsız test modellerine ve güvenilir web otomasyonuna dönüştüren test platformudur.

**Esas vaat:** Teknik otomasyon uzmanı darboğazını azaltmak, test oluşturmayı hızlandırmak, test bakımını azaltmak ve sürüm öncesi kanıtlanabilir güven oluşturmak.

## Anlaşılmış kararlar (DECIDED)

1. **Kullanıcılar:** Manual QA, QA Analyst, Business Analyst, Product Analyst. **Alıcılar:** CTO, Head of QA, şirket yönetimi.
2. **Ana etkileşim:** Kontrollü business dili; kullanıcı iş kuralını/expected result'ı tanımlar, platform nasıl çalıştırılacağını çözer.
3. **Ürün çekirdeği:** Uygulama modeli (sayfa / component / element / flow) + yeniden kullanılan iş akışları + canonical test model.
4. **MVP:** Web + Chromium/Chrome + Playwright; mobil, Kubernetes ve autonomous AI hariç.
5. **Öncelikler:** Hız **ve** düşük bakım; yalnızca recorder, yalnızca chatbot veya yalnızca Playwright wrapper'ı olmayacak.
6. **AI:** Plan dahilinde, fakat ilk çekirdeği deterministik. Teknik detaylar istenirse görünür (business, visual, technical views aynı modeli paylaşır).

## Uygulama için öneriler (PROPOSED — ürün sahibinin kesin kararı değil)

- Next.js/TypeScript UI + Fastify/TypeScript modüler API + ayrı Playwright worker.
- PostgreSQL tabanlı kalıcı job/outbox; başlangıçta ayrıca Redis/Kafka/Kubernetes yok.
- Pilot için bir kurulum, sınırlı tenant, basic RBAC ve audit; SaaS/on-prem/hybrid stratejisi sonradan.
- Keşif: önce sınırlandırılmış DOM analizi ve kullanıcı onayı; davranış gerektiren flow'lar **guided teach** ile tanımlanır. Rastgele crawl ile business flow keşfedilmiş gibi davranılmaz.

## Doğrulanmamış varsayımlar (VALIDATION REQUIRED)

- Teknik olmayan bir QA'nın anlamlı testi, mevcut yöntemlerinden belirgin şekilde daha hızlı ve yardım almadan hazırlayabilmesi.
- Uygulama modelinin ortak kullanımı sayesinde bakım süresinin gerçekten düşmesi.
- Intent → yürütülebilir plan dönüşümünün, belirsizlikte sessizce yanlış test üretmemesi.
- Alıcıların bunun için ücret ödemeye istekli olması.
- BrowserStack karşısında bu farklılaştırmanın müşterilerce değerli bulunması.

## Belgeler

| Dosya | Kapsam | Fikir.txt aşamaları |
|---|---|---|
| `01-PRODUCT-STRATEGY.md` | Konumlandırma, persona, alıcı, fırsat, rekabet, non-goals | 1–3, 17–18 |
| `02-MVP-PRD.md` | MVP sınırı, kullanım senaryosu, gereksinimler, acceptance | 3, 7–8 |
| `03-UX-IA.md` | Kullanıcı yolculuğu, ekranlar, üç görünüm, durumlar | 4–5 |
| `04-DOMAIN-TEST-MODEL.md` | Canonical model, sürümler, state machine, API sözleşmeleri | 6, 11 |
| `05-ARCHITECTURE.md` | Mimari, worker, dağıtım, güvenlik, observability | 9–12 |
| `06-AI-ENTERPRISE-EVOLUTION.md` | AI, healing, mobil/API, enterprise ve fiyatlandırma hipotezleri | 12–13 |
| `07-ENGINEERING-ROADMAP.md` | Epic → story → kabul kriteri → görev → bağımlılık | 14–15 |
| `08-VALIDATION-DECISIONS.md` | Ölçümler, deneyler, riskler, ADR ve go/no-go | 16–18 |
| `09-AGENT-HANDOFF.md` | Claude Code / Codex uygulama devri ve guardrail'ler | 15, 18 |

## Ürün deneyimi: tek örnek

1. QA, allowlist'e eklenen staging URL'si için **Keşfet** der.
2. Platform erişilebilir sayfa ve bileşenleri **aday** olarak çıkarır; kullanıcı doğrular, gerekirse öğe/flow öğretir.
3. QA `Geçerli müşteri olarak giriş yap` ve `Dashboard'da bakiye görünür olsun` iş adımlarını seçer.
4. Sistem tek bir canonical test sürümü oluşturur; gösterilen business/flow/technical görünümler bu modele bağlıdır.
5. Runner Playwright ile izolasyonda çalıştırır; sonuç assertion ve kanıtlarla raporlanır.
6. UI değişirse merkezi element eşlemesini gözden geçirir; **healing önerisi, testin niyetini veya assertion'ını sessizce değiştiremez**.

## Başlama sırası / gates

**Gate A — problem doğrulama:** 5+ niteliksel görüşme, 2 hedef şirkette kısa iş akışı gözlemi, bugünkü alternatiflerin ve maliyetlerin kaydı.  
**Gate B — concierge prototype:** gerçek kodlu platform olmadan kontrollü iş dili + manuel olarak hazırlanmış keşif modeliyle en az 3 kritik flow'un uçtan uca işleyebilirliğini sınama.  
**Gate C — vertical slice:** login → dashboard assertion, izole worker, gerçek fail/pass kanıtı, sürüm ve tenant izolasyonu.  
**Gate D — pilot:** en az 2 farklı uygulamada yeni kullanıcılarla ölçümlü deneyler.  
**Gate E — genişleme:** ölçümler geçmeden mobil/API/mikroservis/AI autonomy yok.

**İlk uygulanacak kod parçası** ancak Gate A/B sonrası `Application Model → Canonical Test → Playwright Runner → Evidence` dikey dilimi olmalıdır. Bu belgedeki kararlar ihtiyaç halinde revize edilebilir; karar günlüğünde kaydedilir.

## Rekabet referansları (18.10.2026 kontrolü)

- BrowserStack Low Code Automation: https://www.browserstack.com/docs/low-code-automation/overview/introduction
- BrowserStack agentic testing: https://www.browserstack.com/docs/low-code-automation/test-recording/browserstack-ai/agentic-testing
- BrowserStack self-healing: https://www.browserstack.com/docs/low-code-automation/test-recording/browserstack-ai/ai-self-heal

**Yorum sınırı:** Rakibin özel backend'i, veri modeli veya mimarisi bilinmiyor. “Rakipte application knowledge/canonical model yok” denilemez. Üstünlük iddiası ancak karşılaştırmalı kullanıcı ölçümleri ile yapılabilir.
