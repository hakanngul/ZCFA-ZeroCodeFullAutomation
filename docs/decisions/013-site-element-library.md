# ADR 013 — Site element kütüphanesi: anahtar kapsamı ve gözlem eşleştirme (21 Ekim 2026)

## Bağlam

AI keşfinin kaydettiği `ai_page_elements` satırları yalnız yazılıyordu; her
satır tek locator taşıyordu ve adlandırılamıyor/onaylanamıyordu. Suite'lerin
elementleri kimlikle kullanabilmesi (Faz 2) için kararlı bir iş anahtarı ve
insan onayı gerekir. Demo Bank canonical modeli (`login`/`dashboard`) bu
artımda değişmez.

## Karar

- **Anahtar kapsamı: org + proje + origin.** `element_key`
  (`^[A-Za-z][A-Za-z0-9_.-]*$`, ≤120) aynı sitede tekildir
  (`UNIQUE(org_id,project_id,origin,element_key)`); farklı origin'ler aynı
  anahtarı (`login.username`) kullanabilir. Sayfa düzeyi kapsam aynı
  anahtarın sayfalar arasında çakışmasına izin verirdi; `page_key` bu yüzden
  ayrı, düzenlenebilir bir alandır.
- **Öneri:** `<page_key>.<etiket slug>` (`inventory.html` → `inventory`, `/`
  → `home`); çakışmada ilk boş `_2`, `_3`… soneki.
- **Aday locator'lar:** keşif her düğüm için sayfada tekil en fazla 3 locator
  tutar (öncelik değişmedi); ilki birincil, diğerleri alternatif. Model
  istemlerine yalnız birincil gider.
- **Eşleştirme:** gözlenen düğümün adaylarından biri aynı sayfa URL'indeki
  (origin dahil) bir elementin birincil ya da alternatif locator'ına eşitse
  aynı elementtir: id korunur, `last_seen_at` güncellenir, yeni adaylar
  alternatif olarak eklenir (≤5). Birden çok eşleşmede onaylı, sonra birincili
  en iyi adaya eşit olan seçilir. Onaylı elementin birincil locator'ı, onayı,
  adı, anahtarı ve gözlem etiketi değişmez.
- **Düzenleme:** `PUT /v1/projects/:projectId/ai/elements/:id`
  `expectedRevision` ister (eskiyse 409 `REVISION_CONFLICT`). Birincil veya
  alternatif listesi değişirse onay sunucuda kaldırılır. Onaylı elementin
  anahtarı kilitlidir (`ELEMENT_KEY_LOCKED`). Her değişiklik
  `ai_element_revisions`'a değişmez bir anlık görüntü yazar (ilk düzenlemede
  gözlenen durum v1 olarak eklenir; UPDATE/DELETE trigger'la yasak).
- **Migration 009:** SQLite'ta `ADD COLUMN IF NOT EXISTS` olmadığından yeni
  sütunlar storage'daki korumalı adımda (`PRAGMA table_info`) eklenir ve eski
  satırlara origin, sayfa anahtarı ve tekil anahtar verilir; SQL dosyası
  yalnız idempotent index/tablo/trigger içerir.

## Sonuçlar

Eski satırlar id'leriyle korunur, hepsi onaysız v1 olarak başlar. Gözlemin
onaylı elemente bulduğu yeni adaylar ADR 014 ile önerilen alternatif olur
(revizyonsuz değişiklik yok); çalıştırmada
alternatifler otomatik denenmez (self-healing ayrı bir ADR'de ele alınacak).
