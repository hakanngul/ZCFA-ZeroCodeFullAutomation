# ADR 016 — Self-healing (opt-in) ve kopya element birleştirme (21 Ekim 2026)

## Bağlam

ADR 013–015'e göre çalıştırma yalnız elementin sabitlenmiş (pinli) revizyonunun
birincil locator'ını kullanır; README "alternatifler otomatik denenmez" der.
Site küçük bir değişiklik yaptığında (ör. `data-test` adı) tüm testler
düşüyor, oysa aynı revizyonda insanın onayladığı alternatifler çalışıyordu.
Ayrıca eski, onaysız kopya kayıtlar onaylı bir elementin locator'larını
birincil olarak tuttuğu için o locator birincil yapılamıyordu
(`LOCATOR_IN_USE`).

## Karar

- **Proje ayarı, varsayılan kapalı.** `project_settings.self_healing`
  (migration 012; `GET/PUT /v1/projects/:projectId/settings`
  `{selfHealing}`), denetim kaydı `project.self_healing_on/off`. Worker ayarı
  her çalıştırmada okur; kapalıyken davranış öncekiyle birebir aynıdır. Bu
  ADR, README'deki "alternatifler otomatik denenmez" kuralını yalnız bu
  açık ayar için değiştirir.
- **Ne zaman, ne denenir.** Yalnız kütüphane referansı (`element`) olan
  adımda ve pinli birincil locator sayfada **0** eşleşme verdiğinde, pinli
  revizyonun (`ai_element_revisions.alternatives`) **onaylı alternatifleri**
  sırayla denenir. `suggested_alternatives` revizyonda saklanmadığı için
  yapısal olarak hiç denenmez. 0 eşleşen alternatif atlanır; ilk tekil eşleşen
  kullanılır; çoklu eşleşen bir alternatif iyileştirmeyi durdurur
  (`AMBIGUOUS_ELEMENT`). Hiçbiri yoksa `ELEMENT_NOT_FOUND`. Birincil çoklu
  eşleşirse iyileştirme yapılmaz. Ham locator'lı adımlar ve doğrulama
  beklentileri (metin, URL) hiç değişmez.
- **Kanıt.** Adım `healed: {locator, primary}` taşır; sonuç
  `selfHealing` ve `healedSteps` içerir; ekranlar "N adım alternatifle
  bulundu" gösterir. Kalıcı test PASS kuralı (ADR 012) aynen geçerlidir; plan
  ve checksum değişmez (alternatifler aynı değişmez revizyondan okunur).
- **Öneri.** Geçen her iyileşmiş adım, çalıştırma + element + revizyon +
  locator başına bir `ai_heal_suggestions` satırı üretir (adım sayısıyla).
  Elementler'de "Birincil yap": iyileşen alternatif birincil olur, eski
  birincil alternatiflerin sonuna gider; locator kümesi aynı kaldığı için
  onay korunur, yeni revizyon `heal_promoted` yazılır ve ADR 015 etki akışı
  (etkilenen testler → yeni sürüm) çalışır. `expectedRevision` eskiyse 409
  `REVISION_CONFLICT`; locator artık alternatif değilse `SUGGESTION_STALE`.
  "Yoksay" aynı element + locator'ın bekleyen önerilerini kapatır, elementi
  değiştirmez. Otomatik birincil değişikliği yoktur.
- **Birleştir.** `POST …/ai/elements/:id/merge`
  (`expectedRevision`, `targetId`, `targetRevision`): yalnız **onaysız** ve
  aynı sayfadaki bir kaynak birleştirilebilir (onaylı kaynak 409
  `ELEMENT_APPROVED`, farklı sayfa `PAGE_MISMATCH`). Kaynağın locator'ları
  onaylı hedefte `suggested_alternatives`'a, onaysız hedefte alternatiflere
  eklenir (≤5; fazlası raporlanır) ve hedef yeni revizyon (`merged`) alır.
  Kaynak silinmez: `status='merged'`, `merged_into=<hedef>`, özgün
  locator'larıyla son revizyon `merged_into`; canlı satırın birincili
  `merged:<id>` yer tutucusu olur ki sayfa düzeyi locator tekilliği hedefi
  engellemesin. Emekli satır listelerde görünmez, düzenlenemez
  (`ELEMENT_MERGED`), keşif eşleştirmesine girmez; keşif artık önerilen
  alternatiflerle de eşleştirir (kopya yeniden oluşmaz).

## Sonuçlar

Self-healing bilinçli bir proje kararıdır ve her iyileşme görünür, insan
onayına bağlı bir öneri bırakır; test sürümleri ve planlar değişmez. Hedefe
yapılan birleştirme onaylı hedefte de yeni revizyon ürettiği için ona bağlı
testler "güncel olmayan element" görünebilir (fark yok; yeni sürüm aynı
akışla alınır). Sınır: iyileştirme adım bazlıdır, aynı senaryoda her adımda
yeniden denenir.
