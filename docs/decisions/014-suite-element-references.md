# ADR 014 — Suite'ler kütüphane elementlerini anahtarla kullanır (21 Ekim 2026)

## Bağlam

ADR 013 ile web sitesi elementleri adlandırılıp onaylanabiliyor, ama AI
suite'leri ve kalıcı testler hâlâ ham locator gömüyordu. Onaylı bir elementi
düzeltmek testleri etkilemiyordu. Ayrıca Faz 1'de yeniden gözlem onaylı bir
elementin alternatif listesine revizyonsuz aday ekliyordu (onaylı element
sessizce değişiyordu).

## Karar

- **Action hedefi:** `fill`, `click`, `assertVisible`, `assertText` tam olarak
  birini taşır: `element: "<element_key>"` (onaylı kütüphane elementi) veya
  `locator` (onaysız gözlem). Şemadaki AI locator türleri gözlenebilen 6 türle
  (`testId`, `id`, `css`, `label`, `placeholder`, `role`) sınırlandı; prompt da
  aynı listeyi üretir (önceden şema 10 tür kabul ediyordu).
- **Prompt:** önce hedef origin'in onaylı elementleri (`libraryElements`:
  anahtar, ad, sayfa, sayfa URL'i, kırılgan), sonra yeni gözlemler; onaylı bir
  elemente denk gelen gözlem `element` anahtarıyla işaretlenir.
- **Ham locator normalizasyonu (deterministik):** model onaylı bir elementin
  birincil veya alternatif locator'ını ham kullanırsa üretimde otomatik olarak
  `{"element": key}`'e çevrilir; ek provider çağrısı harcanmaz. İki farklı
  anahtara denk gelen locator belirsizdir, çevrilmez. Kütüphanede olmayan
  anahtar düzeltme turunda bildirilir; düzeltilmezse `ELEMENT_UNAVAILABLE`.
  Kullanıcının elle düzenleyip kaydettiği taslak normalleştirilmez.
- **Pinleme:** taslak onayında kullanılan her anahtarın o anki revizyonu
  `ai_suite_elements`'a (migration 010, değişmez) yazılır; onaysız/olmayan
  anahtar onayı 409 `ELEMENT_UNAVAILABLE` ile reddeder. Worker anahtarı pinli
  revizyonun (`ai_element_revisions`) locator'ından çözer; element silinmiş ya
  da onayı kaldırılmışsa adım `ELEMENT_UNAVAILABLE` ile düşer (PASS yok).
- **Kalıcı test:** element anlık görüntüsü `elementKey`, `elementId`,
  `revision`, `name` taşır (test checksum'ına dahil); plan (`ai-plan-1.0`)
  yalnız referans varsa `elements` listesi taşır ve checksum'a dahildir. Eski
  testler ve planlar aynı şekliyle okunur/doğrulanır. Terfide pinli element
  onaysızsa 409 `ELEMENT_UNAVAILABLE`.
- **Önerilen alternatifler (Faz 1 düzeltmesi):** onaylı elementin yeniden
  gözlemde bulunan yeni adayları `suggested_alternatives`'a gider; çalıştırmada
  kullanılmaz. "Alternatif olarak ekle"
  (`POST …/ai/elements/:id/suggestions/accept`, `expectedRevision`) yeni
  revizyon (`alternative_added`) üretir; birincil locator değişmediği için onay
  korunur. Elle `PUT` ile alternatif değişikliği ADR 013 kuralıyla onayı
  kaldırmaya devam eder. Migration, onaylı elementlere önceden revizyonsuz
  eklenmiş alternatifleri öneriye taşır.

## Sonuçlar

Element düzeltmesi yeni revizyondur; mevcut suite/testler pinli revizyonu
kullanmaya devam eder (yeni sürüm akışı Faz 3). Onayı kaldırılan element ona
bağlı tüm suite/testleri açıkça başarısız yapar. Alternatifler hâlâ otomatik
denenmez (Faz 4).
