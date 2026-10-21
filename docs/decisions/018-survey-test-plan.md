# ADR 018 — Keşif önce test planı önerir; testler seçimle oluşur (22 Ekim 2026)

## Bağlam

ADR 017 ile keşif bittiğinde testler hemen yazılıp suite olarak
kaydediliyordu. Kullanıcı önce sitenin analiz edilmesini, AI'ın neleri test
edebileceğini önermesini ve testlerin ancak onun seçimiyle oluşturulmasını
istiyor.

## Karar

- **Mod:** `POST …/ai/messages` isteğe bağlı `mode` alır.
  - `plan` (arayüzün varsayılanı): keşif, istenen akış yerine sitenin ana
    özelliklerini dolaşır (`survey` talimatı).
  - `suite` (API'nin varsayılanı): eski davranış; keşiften sonra test hemen
    üretilir.
- **Test planı:**
  - Keşiften sonra `ai_plan` işi çalışır. Yalnız provider çağrısı yapar,
    tarayıcı açmaz.
  - `planTests` en fazla 15 öneri döner. Her öneri: başlık, tür, alan,
    açıklama, sayfalar, gereken veri, `feasible` ve not.
  - Gözlenmeyen sayfalar öneriden atılır. Şema hatasında bir düzeltme turu
    yapılır.
  - Plan `ai_draft_plans` tablosunda saklanır (migration 014). Taslak durumu
    `planning` → `planned` olur.
  - Bu aşamada test, case ya da kütüphane elementi oluşturulmaz.
- **Seçim:**
  - Arayüz planı alanlara göre listeler. Uygulanabilir öneriler seçili
    gelir; en fazla 10 test seçilebilir.
  - Başlık ve açıklama düzenlenebilir, isteğe bağlı bir ek not girilebilir.
- **"Testleri oluştur":**
  - Uç: `POST …/ai/drafts/:id/generate` (`items` ≤10, `instruction?`).
  - İşi, mevcut keşfi kullanan bir `ai_generate` olarak kuyruğa alır;
    keşif tekrarlanmaz.
  - Model her seçili öneri için sırayla bir senaryo yazar (`plannedScenarios`).
  - Element kaydı ve taslak suite ADR 017'deki gibidir: yalnız seçilen
    testlerin adımları için.
  - Zaten üretilmiş ya da başarısız olmuş bir taslaktan yeniden oluşturmak,
    aynı keşif ve planla yeni bir taslak açar.
- **Zaman aşımı:** Provider formunda varsayılan zaman aşımı 90 saniyeye
  çıkarıldı. 15 saniye, büyük sitelerde test üretimi için yetmiyordu.

## Sonuçlar

Kullanıcı istemeden test ya da element oluşmaz. Planlama ek bir provider
çağrısı harcar. Karşılaştırma (çoklu model) akışı plan modunu kullanmaz.
