# ADR 015 — Locator değişikliği etkisi ve insan onaylı yeni test sürümü (21 Ekim 2026)

## Bağlam

ADR 014 ile kalıcı AI testleri kütüphane elementlerini `elementKey` +
`revision` ile sabitliyor. Element düzeltilince (yeni revizyon) testler eski
pinli locator'la çalışmaya devam ediyordu ve hangi testlerin etkilendiği
görünmüyordu. Otomatik taşıma istenmiyor: test sürümü değişmez kalmalı,
yeni sürüm bir insan kararıyla oluşmalı.

## Karar

- **Etki yalnız son sürüme bakar.** Bir testin son sürümü bir elementin
  güncel revizyonundan eski bir revizyonu pinliyorsa o test etkilenir
  (`GET …/ai/elements/:id/impact`). Eski sürümler tarihtir, listelenmez.
  Satır test adı, sürüm, pinli/güncel revizyon ve pinli revizyon anlık
  görüntüsüne göre fark (birincil locator, eklenen/kaldırılan alternatifler,
  ad) taşır; o testin şu an yeni sürümü engelleyen elementleri de listelenir.
- **Rozet:** `GET …/ai/tests` her satıra `latest` ve yalnız son sürüm için
  `stale_elements` ekler (yeni revizyonu olan, onayı kaldırılmış ya da
  silinmiş element). Testler ekranı "güncel olmayan element" rozetini gösterir.
- **Yeni sürüm (`POST …/ai/tests/:id/versions`, `expectedRevision`):** son
  sürümün tüm kütüphane referansları elementlerin güncel revizyonuna yeniden
  pinlenir; senaryolar, gözlenen elementler ve kaynak aynen kopyalanır,
  `derivedFrom: {revision, reason: "element_update"}` eklenir; checksum yalnız
  yeni sürüm için hesaplanır. Referanslardan biri onaysız/silinmişse 409
  `ELEMENT_UNAVAILABLE` (mesajda ve `details.unavailable`'da liste), hiçbiri
  değişmemişse 409 `TEST_UP_TO_DATE`, eski `expectedRevision` 409
  `REVISION_CONFLICT`. Senaryoların başvurduğu anahtar korunur (onaylı
  elementin anahtarı zaten kilitli). Otomatik taşıma yoktur.
- **Migration 011:** yeni sürüm türediği sürümün suite'ini paylaşır; bu yüzden
  `ai_tests` `UNIQUE(org_id,suite_id)` olmadan yeniden kurulur (satırlar,
  checksum'lar ve UPDATE/DELETE trigger'ları korunur; foreign key'ler yalnız
  bu adım için kapatılır, `ai_test_runs` referansları doğrulanır). "Bir suite
  bir kez terfi eder" kuralı uç noktada kalır: tekrar terfi ilk sürümü döner.
- **Taslaklar kapsam dışı:** onaylanmamış taslak henüz pin taşımaz; onayda
  `pinApprovedElements` o anki onaylı revizyonu pinler. Onaylı ama terfi
  etmemiş suite eski pinle terfi ederse test hemen "güncel olmayan" görünür ve
  aynı akışla yeni sürüm alınır.

## Sonuçlar

Element düzeltmesi testleri sessizce değiştirmez; etki görünür ve tek tıkla,
denetim kaydıyla (`ai_test.element_update`) yeni sürüm üretilir. Yeni sürüm
mevcut kalıcı test çalıştırma hattıyla çalışır. Org/proje dışı istekler 404.
Self-healing (alternatiflerin çalıştırmada denenmesi) Faz 4'tür.
