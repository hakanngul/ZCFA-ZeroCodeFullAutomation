# T18-calistirmalar-tum-calistirmalar-filtre: Tüm çalıştırmalar — birleşik geçmiş, filtre, sayfalama, Dalgalı rozeti

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/reporting.tsx` (`RunHistory`), `apps/api/src/reporting.ts` |
| Flow | Çalıştırmalar bölümü → "Tüm çalıştırmalar" kartı: birleşik geçmişi filtrele ve sayfala |
| Requires auth | yes (yerel demo oturumu) |
| Required role | admin |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://127.0.0.1:5173`
- Signed in as admin: `http://127.0.0.1:5173` açılır, **"Yerel çalışma alanını aç"** tıklanır, kenar çubuğunda **"Çalıştırmalar"** tıklanır.
- Seed: ≥ 1 `Başarılı` (passed) ve ≥ 1 `Başarısız` (failed) klasik çalıştırma; ≥ 1 kalıcı AI testi çalıştırması.
- Sayfalama için: toplam ≥ 11 çalıştırma (gerekirse Testler bölümünden aynı klasik testi "Sağlam uygulama" ile tekrar çalıştır).
- Dalgalı için: aynı klasik testin aynı sürümünde son 10 tamamlanmış çalıştırmada hem passed hem failed (ör. aynı test v1 "Sağlam uygulama" + "Bozuk dashboard" varyantları).

## Test data
- `filterStatusPassed = "Başarılı"` (Durum select)
- `filterStatusFailed = "Başarısız"` (Durum select)
- `filterTest = ` Test select'te ilk klasik test seçeneği (`<başlık> · Klasik`)
- `fromToday = ` bugünün UTC tarihi `YYYY-MM-DD` (ör. `2026-10-21`)
- `toToday = ` aynı UTC tarihi
- `futureFrom = "2099-01-01"`
- `invertedFrom = "2026-10-21"`, `invertedTo = "2026-10-20"` (başlangıç > bitiş)
- API negatif değerleri: `badStatus = "bogus"`, `badDate = "21-10-2026"`, `badTest = "canonical:not-a-uuid"`, `limitOverflow = 101`

## Steps

### TC-01: Happy path — Birleşik geçmişte tüm türleri gör ve Başarılı/Başarısız filtrele
1. Navigate to `http://127.0.0.1:5173`, **"Yerel çalışma alanını aç"** tıkla, kenar çubuğunda **"Çalıştırmalar"** tıkla.
2. Assert: `h2` "Tüm çalıştırmalar" görünür; yanındaki etiket `<total> çalıştırma` biçimindedir ve `total ≥ 3`.
3. Assert: ipucu metni "Klasik testler, AI suite’leri ve kalıcı AI testleri tek listede." ile başlar.
4. Assert: tablo başlıkları sırasıyla `Test / sürüm`, `Durum`, `Süre`, `Başlangıç`, `Hata nedeni`, `Rapor`.
5. Assert: en az bir satırın alt satırı `Klasik · v<n> · <8 karakter id>` ve en az bir satırınki `Kalıcı AI · v<n> · <8 karakter id>` biçimindedir.
6. Assert: satırlar `Başlangıç` sütununa göre en yeni en üstte sıralıdır.
7. Assert: passed satırında `Hata nedeni` = `—`; failed satırında `Hata nedeni` boş değildir ve `—` değildir.
8. Assert: tamamlanmış satırlarda `Süre` `<x.y> sn` biçimindedir.
9. **Durum** select → `Başarılı` seç.
10. Assert: tüm satırların Durum rozeti `Başarılı`; ağ isteği `/reports/runs?...status=passed&offset=0` içerir; etiket `<n> çalıştırma` filtreli sayıyı gösterir.
11. **Durum** select → `Başarısız` seç. Assert: tüm satırlar `Başarısız`.
12. **Durum** → `Tümü`. **Test** select → `filterTest` seç. Assert: tüm satırların başlığı seçilen testin başlığıdır ve alt satırı `Klasik ·` ile başlar; istek `test=canonical%3A<uuid>` içerir.
13. **Test** → `Tümü`. **Başlangıç (UTC)** = `fromToday`, **Bitiş (UTC)** = `toToday`. Assert: yalnız bugün (UTC) başlayan çalıştırmalar listelenir; bugün oluşturulan seed çalıştırmaları görünür (bitiş günü dahil).
14. **Başlangıç (UTC)** = `futureFrom`. Assert: tablo yerine "Bu filtrelerle çalıştırma yok." görünür; etiket `0 çalıştırma`; sayfalayıcı `0 / 0`; **Önceki** ve **Sonraki** devre dışı.
15. Tarih alanlarını temizle. Assert: tam liste geri gelir.

### TC-02: Sayfalama — `Önceki` / `Sonraki`
1. Tüm filtreler `Tümü`/boş, `total ≥ 11`.
2. Assert: tabloda tam 10 satır; sayfalayıcı `1–10 / <total>`; **Önceki** devre dışı; **Sonraki** etkin.
3. **Sonraki** tıkla. Assert: `11–<min(20,total)> / <total>`; istek `offset=10`; **Önceki** etkin; ilk sayfadaki satır id'leri tekrar etmez.
4. Son sayfada Assert: **Sonraki** devre dışı.
5. **Önceki** tıkla. Assert: `1–10 / <total>`.
6. 2. sayfadayken **Durum** → `Başarılı` seç. Assert: sayfalayıcı `1–…` ile başlar (filtre değişimi offset'i 0'a sıfırlar).

### TC-03: Filtre form doğrulaması — `run-history-filters`
UI'da gönder butonu yok; select/date girişleri yalnız geçerli değer üretir. Doğrulama API tarafındadır (`historyQuery` Zod şeması). Tarayıcı oturumuyla aynı origin'den GET at:

| Alan | Boş değer | Desen ihlali | Taşma |
|---|---|---|---|
| `test` | `""` → UI parametreyi göndermez, tüm testler listelenir | `badTest` → HTTP 4xx, gövde Zod doğrulama hatası | n/a |
| `status` | `""` → gönderilmez, tümü | `badStatus` → HTTP 4xx | n/a |
| `from` | `""` → gönderilmez | `badDate` → HTTP 4xx (`^\d{4}-\d{2}-\d{2}$`) | n/a |
| `to` | `""` → gönderilmez | `badDate` → HTTP 4xx | n/a |
| `limit` | gönderilmezse varsayılan 20 | `limit=abc` → HTTP 4xx | `limitOverflow` (101) → HTTP 4xx; `limit=0` → HTTP 4xx |
| `offset` | varsayılan 0 | `offset=-1` → HTTP 4xx | `offset=100001` → HTTP 4xx |

- UI'da `invertedFrom`/`invertedTo` gir. Assert: hata yok, "Bu filtrelerle çalıştırma yok." görünür.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Önceki` | offset 0'da | devre dışı, tıklama etkisiz |
| `Sonraki` | `total > 10` iken tık | sonraki 10 kayıt, sayfalayıcı güncellenir |
| `Sonraki` | son sayfada | devre dışı |
| `<id8> HTML raporunu indir` | queued/running satırında | bağlantı yok, hücre `—` |
| `<id8> HTML raporunu indir` | tamamlanmış satırda | indirme başlar (ayrıntı T19) |

### TC-05: Negative & edge cases
- Dalgalı rozeti: Preconditions'taki aynı test+sürüm için passed+failed karışık sonuçlar olduğunda bu sürümün her satırında **"Dalgalı"** rozeti görünür; rozete hover → title "Aynı sürümün son 10 tamamlanmış çalıştırmasında hem başarılı hem başarısız sonuç var (altyapı hatası/engellendi sayılmaz)." Yalnız passed sonuçlu bir test sürümünde rozet yoktur.
- Kuyruktaki/çalışan bir çalıştırma varken (Testler'den yeni çalıştırma başlat, hemen Çalıştırmalar'a dön): satır rozeti `Kuyrukta` veya `Çalışıyor` (dönen ikonla); `Süre` `—`; liste ~2 sn aralıkla kendiliğinden yenilenir ve terminal duruma geçince `Rapor` bağlantısı belirir.
- Durum select'te 8 seçenek + `Tümü` vardır: `Kuyrukta, Çalışıyor, Başarılı, Başarısız, Engellendi, Zaman aşımı, Altyapı hatası, İptal`.
- Bilinen tutarsızlık (kayıt et): RunHistory queued için `Kuyrukta`, alttaki "Çalıştırma geçmişi" tablosu `Sırada` gösterir.
- API düşükken (worker değil, api durdurulursa) kartta `role="alert"` hata paragrafı görünür.

## Assertions
- [ ] "Tüm çalıştırmalar" kartı Klasik ve Kalıcı AI satırlarını tek listede gösterir.
- [ ] `<total> çalıştırma` etiketi filtre sonucuna eşittir.
- [ ] Durum, Test ve tarih filtreleri listeyi doğru daraltır; bitiş tarihi dahildir.
- [ ] Filtre değişimi sayfalayıcıyı `1–…`'e sıfırlar.
- [ ] Sayfalayıcı metni ve buton devre dışı durumları doğru.
- [ ] passed satırında `Hata nedeni` `—`.
- [ ] Dalgalı rozeti yalnız karışık sonuçlu sürümlerde.
- [ ] API'ye geçersiz sorgu parametreleri 4xx döner.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-03).

## Screenshots required
- Çalıştırmalar bölümü ilk yükleme (Tüm çalıştırmalar kartı)
- Durum = Başarılı filtreli liste
- "Bu filtrelerle çalıştırma yok." boş durumu
- Sayfa 2 (`11–… / <total>`)
- Dalgalı rozetli satır (hover title ile)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
