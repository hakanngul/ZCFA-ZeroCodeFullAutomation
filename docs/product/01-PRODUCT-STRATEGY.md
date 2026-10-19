# 01 — Ürün stratejisi ve Product Definition

## Executive Summary

**Product / working name:** ZeroCode (nihai marka değil).  
**Kategori:** Business-Intent & Application-Aware Test Automation.  
**Vizyon:** İş niyetinden güvenilir, açıklanabilir, kolay bakım yapılabilen otomatik test oluşturmayı uzman olmayan kullanıcı için erişilebilir kılmak.  
**Misyon (ilk sürüm):** Onaylanmış uygulama bilgisi ve kontrollü test aksiyonları üzerinden web testini yazmadan oluşturma/çalıştırma/inceleme.

**Problem:** Manual QA/analistlerin otomasyon yazamadığı ekiplerde kalite faaliyetleri manuel test, developer desteği ve dış kaynakla sınırlanıyor. Kod bilen uzman sayısının azlığı verimi sınırlıyor; yüksek test bakım ihtiyacı kazanımı geri alabiliyor.

**Değer:** Mevcut QA ekibiyle daha çok kritik senaryoyu tekrarlanabilir otomasyonla kapsamak; toplam sahip olma maliyeti, ilk test süresi ve maintenance eforunu düşürmek. **Release'in bug içermeyeceği garanti edilmez.**

## Segmentasyon ve alıcı

| Persona | İş / beklenti | Başarı ölçütü |
|---|---|---|
| Manual QA / QA Analyst (primary) | Akış + beklenen sonucu doğrulamak; kod ve locator bilmemek | Yardımsız ilk anlamlı test, kısa öğrenme süresi |
| Business / Product Analyst (primary) | İş kuralı ve kritik kullanıcı akışını test etmek | Business ifadelerinin anlaşılabilirliği, izlenebilirlik |
| QA Lead (champion) | Ortak flow ve suites yönetmek | Tekrar kullanım, bakım eforu ve güvenilir rapor |
| Developer / Automation Engineer (support) | Zor locator/edge case çözmek | Teknik trace, override, geriye dönük inceleme |
| CTO / Head of QA / Yönetim (buyer) | Kapsamı artırırken maliyeti ve riski yönetmek | ROI, güvenlik, vendor risk, release sinyali |
| Admin (secondary) | Tenant, erişim, secrets, politika | Ayrışma, audit, minimum operasyon |

**İlk hedef müşteri profili — ASSUMPTION:** Düzenli web release'i olan, yoğun manuel regresyon yapan, 2–20 kişilik QA ekibine sahip ürün takımları; güçlü kurumsal güvenlik süreçlerinden ziyade kısa pilot yapabilen orta ölçekli şirketler. Doğrulanmalı.

## Jobs-to-be-done

- “Test otomasyon mühendisi beklemeden kritik login/sipariş/ödeme gibi akışlarımı düzenli doğrulamak istiyorum.”
- “Tek bir UI etiketi değiştiğinde onlarca test tek tek kırılmasın.”
- “Bir test PASS verdiğinde gerçekten hangi koşulun doğrulandığını ve kanıtını göreyim.”
- “CTO olarak manuel regresyonun zamanını ve dış kaynak ihtiyacını düşüreyim.”

## Konumlandırma

**Eski vaat:** Zero-code full automation.  
**Yeni hipotez:** *Application model as a shared, reviewable asset* + typed business intents + reproducible execution.

**Asıl satın alınan şey:** “Kod yazmama” değil, **otomasyon kapasitesi ve yönetilebilir güven**.

**Rekabet gözlemi:** BrowserStack LCA recorder, AI step generation, self-healing, cloud execution, video/logs ve Agentic Testing (Alpha) sunduğunu açıkça söylüyor. Bu nedenle recorder, doğal dil, self-healing, URL exploration veya cloud execution **tek başlarına benzersiz avantaj olamaz**. Rakibin dahili modelini bilmiyoruz. Benzersizlik ancak doğrulanmış iş çıktısıyla iddia edilebilir.

## Farklılaşma hipotezleri

1. **Shared Application Knowledge:** Her test locator saklamak yerine onaylı bileşen/flow referansları kullanır. Bir mapping değişikliği ilgili testleri etki analiziyle güncellemeye aday hale getirir.
2. **Typed Business Intent:** İnsan onaylı koşullar, precondition, expected outcome; silent interpretation veya otomatik expectation değişimi yok.
3. **Safe-by-default Maintenance:** Healing varsa önce öneri, diff, güven puanı, kanıt, onay; yanlış PASS engellenir.
4. **Framework-independent Canonical Model:** Test, Playwright kodu değil; taşınabilir business aksiyon ve assertion grafiği olarak saklanır.
5. **Explainable Results:** Her assertion için observed vs expected, screenshot/trace ve test/model sürümü.

**Bu beş maddenin hiçbiri bugün kanıtlanmış rekabet avantajı değil.** Hedef sonuçlar/deneyler `08-VALIDATION-DECISIONS.md` içinde.

## Phase 1 — Top 5 fırsat ve risk

| Fırsatlar | Riskler |
|---|---|
| Mevcut manuel QA'yı otomasyona dahil etme | İlk testin manuel çalışmadan daha uzun sürmesi |
| Ortak flow'larla bakım maliyetini düşürme | Keşif/eşlemenin yanlış öğeye bağlanması |
| Sürüm için kanıtlanabilir otomasyon raporu | Hatalı/eksik assertion ile false PASS |
| Uzman bağımlılığını ve dış kaynak yükünü azaltma | Üçüncü taraf/SPA/iframe gibi karmaşık uygulamalarda düşük başarı |
| İş niyetini teknik loga izlenebilir kılma | BrowserStack'in güçlü dağıtımı/özellik paritesi + zayıf ödeme isteği |

## Top 5 kritik varsayım

A1. Kod yazmayan kullanıcı kısa eğitimle gerçek ve anlamlı test hazırlayabilir.  
A2. Tekrar kullanılabilir uygulama modeli gerçek uygulamaların değişimlerine dayanıklıdır.  
A3. İlk test oluşturma toplam süresi alternatiflerden kısa olur (keşif süresi dahil).  
A4. Healing ve yeniden eşleme gerçek bug'ları gizlemez.  
A5. Alıcı iş başına/ekip bazında pozitif ROI gördüğü için ücret ödemeye razı olur.

## Bilinçli non-goals

**MVP dışı:** mobil, API-first test tasarım modülü, Kubernetes, mikroservis ağı, unrestricted natural language agent, autonomous AI, otomatik düzeltme yayınlama, sınırsız crawler, desktop app, browser farm, cross-browser, çoklu bölge, ERP-ölçekli entegrasyon, SSO/LDAP, tam on-prem, ML tabanlı risk prediction.

**Daima non-goal:** Ürünün tüm bug'ları bulduğunu veya otomasyon mühendisinin her kullanımda gereksiz hale geldiğini iddia etmek; kullanıcının yazmadığı business assertion'ları üretip sessizce PASS göstermek.

## Ticari model — ASSUMPTION

- İlk pilot: sınırlı run/dakika ve proje ile değerlendirilen lisans; fiyat uydurulmamalı.
- Değer metriği olarak `aktif proje + eşzamanlı execution slot` ile `creator seat` alternatifleri müşterilerle test edilecek.
- Kullanıcı başına yalnız lisans, Manual QA katılımını cezalandırabilir; sınırsız cloud execution ise maliyet taşır.
- ROI hesabı: `(önlenen manuel regresyon saatleri + azaltılan bakım saatleri + azaltılan dış kaynak saatleri) × gerçek saat maliyeti − platform lisansı − çalışma altyapısı maliyeti`.
- Satış argümanı “garanti bug yakalarız” değil; **daha hızlı, daha geniş ve denetlenebilir doğrulama**.

## Karar / gerekçe / açık soru

- **Karar:** Kontrollü business intent + shared application model. **Neden:** Doğal dil zaten rakipte bulunuyor; yeniden kullanılabilir bilgi bakım hipotezini test etmeyi sağlar. **Risk:** Keşif maliyeti ve yanlış modelleme. **Açık:** En dar işe yarayan discovery nasıl yapılır?
- **Karar:** Technical view korunacak. **Neden:** QA Lead/Engineer debug ve güven için ihtiyaç duyar. **Risk:** UI karmaşıklığı. **Açık:** Bu görünüm kullanıcı tipine göre ne ölçüde gizlenmeli?
- **Karar:** Web-first. **Neden:** En hızlı doğrulanabilir dikey dilim. **Risk:** Mobil ağırlıklı ilk müşteriyi dışarıda bırakır. **Açık:** Pilot segment bunu kabul ediyor mu?
