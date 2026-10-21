# ADR 012 — Onaylı AI suite'ini kalıcı teste dönüştürme (21 Ekim 2026)

## Bağlam

AI suite'leri (`ai_suites`) onaylanıp çalıştırılabiliyor ama sürümlü, değişmez
bir test değil. Canonical `CanonicalTest`/`AppModel` derleyicisi Demo Bank'a
bağlı (`/login` navigasyonu, `demo.*` secret ref'leri, `login`/`dashboard`
sayfaları); harici, yetkili origin'lerdeki AI suite adımlarını ifade edemez.

## Karar

- **Suite başına tek test.** Onay birimi suite'tir; senaryolar aynı hedef
  origin'i ve aynı gözlemi paylaşır, tek çalıştırma senaryo başına sonuç verir.
  Senaryo başına test, aynı onayı N bağımsız sürüme bölüp soy (lineage)
  takibini zorlaştırırdı.
- Yeni tablolar (`infra/migrations/006_ai_tests.sql`): `ai_tests (id, revision)`
  ve `ai_test_runs`. Canonical `tests`/`runs` tablolarına karıştırılmaz.
  `ai_tests` için UPDATE/DELETE trigger'la engellenir; `ai_test_runs` plan
  snapshot'ı + checksum değişmez, terminal sonuç yeniden yazılamaz.
- Sürüm tanımı (`schemaVersion: ai-test-1.0`): başlık, hedef URL/origin,
  kaynak (suite/draft/konuşma), senaryolar ve kullanılan elementlerin
  gözlemden alınmış anlık görüntüsü (sayfa URL'i, etiket, rol, locator).
  Tanımın SHA-256'sı ayrı sütunda saklanır, okumada doğrulanır.
- Aynı suite tekrar dönüştürülürse mevcut sürüm döner (200). Aynı konuşmada
  ve aynı origin'de revize edilip onaylanan yeni suite aynı testin yeni
  sürümünü üretir; `testId` ile açıkça da hedeflenebilir. Mevcut sürüm asla
  değişmez.
- Çalıştırma AI suite executor'ı (`executeSuite`) ile, ayrı `ai_test_run` işi
  olarak yapılır: plan (`ai-plan-1.0`) snapshot + checksum run'a yazılır,
  worker checksum'ı yeniden doğrular. Hedef origin yetkisi kuyruğa alırken ve
  worker'da yeniden okunur; yetkisi kaldırılmış origin `TARGET_BLOCKED`
  (API 403 / run `blocked`) olur. Aynı origin ağ kısıtı executor'dan gelir.
- PASS yalnız her senaryo ve adım geçtiyse, her senaryoda assertion varsa ve
  senaryo ekran görüntüsü (SHA-256) varsa kabul edilir; aksi halde
  `infrastructure_error / INVALID_PASS_EVIDENCE`.

## Sonuçlar

Canonical derleyici ve Demo Bank invariants'ı değişmedi. Kalıcı AI testleri
Testler'de, çalıştırmaları Çalıştırmalar'da ayrı kartta görünür. Sınır: soy
takibi konuşma + origin sezgisine dayanır; kalıcı testler için iptal ve
idempotency anahtarı henüz yok.
