# ADR 017 — Keşiften kalıcı taslak suite; adımlar elementlere id ile bağlı (21 Ekim 2026)

## Bağlam

Keşif testi akışında keşif, element kütüphanesi ve test arasındaki ilişki dört
yerde kopuyordu:

1. `ai_analysis` keşif biter bitmez gözlenen her DOM öğesini (sayfa başına 60'a
   kadar) `recordObservedElements` ile kütüphaneye yazıyordu. Testin hangi
   elemente ihtiyaç duyduğuna bakılmıyordu.
2. Taslakta yalnız onaylı kütüphane elementleri anahtarla (`element`)
   geçiyordu. Diğer her adım keşfin geçici locator'ını ham kopyalıyordu
   (ADR 014).
3. Üretilen taslak yalnız sohbetteki `ai_drafts` satırında duruyordu. Tests
   ekranında görünmüyordu; ön koşul, test verisi ve beklenen sonuç alanı yoktu.
4. Tekil locator bulunamayınca keşif konumsal CSS'e düşüyordu. Elementin
   doğrulanmadığı hiçbir yerde görünmüyordu.

## Karar

- **Doğrulama işareti:** Keşif her gözlem için `unique` bayrağı tutar. Bayrak,
  birincil locator'ın canlı sayfada tam bir düğümle eşleştiğini gösterir;
  konumsal CSS de sayılarak doğrulanır.
- **Yalnız gerekli elementler:** `ai_analysis` artık kütüphaneye yazmaz;
  inspection tüm gözlemleri saklamaya devam eder. `ai_generate` başarıyla
  bitince (karşılaştırma taslakları hariç) `bindSuiteElements` çalışır ve yalnız
  suite adımlarının kullandığı düğümleri kaydeder:
  - **Eşleştirme:** Aynı sayfada birincil, alternatif veya önerilen
    locator'lardan biri eşleşen kayıt yeniden kullanılır; tekrarlı kayıt
    açılmaz.
  - **Onaylı kayıt:** Asla değişmez. Keşifteki farklı locator öneri
    (`suggested_alternatives`) olur. Birincil locator doğrulanamadıysa
    `verification='failed'` yazılır ve suite notuna uyarı düşer.
  - **Onaysız kayıt:** Gerekirse doğrulanan locator'ı birincil alır. Her locator
    değişikliği yeni revizyondur (`reobserved`), önceki hali geçmişte kalır.
  - **`unique` olmayan düğüm:** Kayıt açılmaz. Adım `unresolved` olarak kalır ve
    case eksik sayılır. Sahte kayıt üretilmez.
- **Kalıcı model (migration 013):**
  - `test_suites` ve `test_cases` düzenlenebilir tablolardır. Case alanları:
    açıklama, ön koşullar, test verileri, beklenen sonuçlar ve sıralı adımlar.
  - `test_case_elements` hangi case'in hangi elementi kullandığını tutar.
  - `test_case_runs` değişmezdir (trigger korumalı).
  - `ai_page_elements` tablosuna `verification` ve `verified_at` eklenir
    (korumalı adım).
- **Adımlar id ile bağlanır:** Element gerektiren adımlar (`click`, `fill`,
  `select`, `assertVisible`, `assertText`) kütüphane kaydına `elementId` ile
  bağlıdır. `navigate`, `assertUrl` ve sayfa kalite adımları element istemez.
  AI şemasına `select` ve aynı origin'e `navigate` eklendi.
- **İnsan onayı:** Taslağı kaydetmek için ilk çalıştırma gerekmez, ama
  çalıştırmadan önce onay şarttır.
  - **Kaydetme:** Her düzenleme yeni revizyon üretir ve onayı kaldırır.
  - **Onay:** Eksiksiz case'i onaylamak, bağlı elementlerin o anki
    revizyonlarını pinler. Element onaysız olsa bile case onayı o locator'ın
    insan tarafından kabul edildiği anlamına gelir.
  - **Eskime:** Element sonradan değişirse case `stale` görünür. Yeniden onay
    güncel revizyonları pinler.
- **Çalıştırma:**
  - Run, case revizyonunu ve pinli element revizyonlarını (locator ve onaylı
    alternatifler) checksum'lı bir snapshot olarak saklar.
  - Worker locator'ı yalnız bu snapshot'tan çözer, sonradan yapılan
    düzenlemeler geçmiş run'ı değiştirmez.
  - PASS için ekran görüntüsünün varlığı yetmez: `evidencedPass` kuralıyla her
    adım ve assertion geçmiş olmalı.
  - Run sonucu, pinli revizyonu hâlâ güncel olan elementlerin doğrulama
    durumunu günceller.
  - Run'lar birleşik geçmişte `case` türüyle görünür ve HTML rapora girer.
- **Gezinme:** Adımdan element detayına (Elementler, editör açık), elementten
  onu kullanan case'lere (`…/ai/elements/:id/usage`, "Case'i aç") geçiş vardır.

## Sonuçlar

- **Korunan sohbet akışı:** Sohbetteki "Onayla ve kaydet" → `ai_suites` →
  kalıcı test (ADR 012–016) aynen çalışır.
- **Etkilenen eski davranış:** Bu akışın taslağında onaysız elementler hâlâ ham
  locator taşır. Ancak keşif artık gözlenen her öğeyi kütüphaneye yazmadığı için
  bu locator'lar kütüphanede kayıt olarak görünmez.
- **Henüz yapılmayanlar:** Case'ten kalıcı sürüm yayımlama, sayfayı yeniden
  inceleterek element ekleme ve canlı izleme (Test Runs) sonraki artımlardır.
