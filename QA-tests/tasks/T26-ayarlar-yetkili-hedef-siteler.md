# T26-ayarlar-yetkili-hedef-siteler: Ayarlar — Test edilecek siteler (yetkili hedef ekle / doğrula / kaldır)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-assistant.tsx` |
| Flow | Ayarlar bölümü → "Test edilecek siteler" kartı: HTTPS hedef origin ekleme, geçersiz URL doğrulaması, silme |
| Requires auth | yes |
| Required role | admin |
| Destructive | yes |
| Estimated steps | 34 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API 4000, demo hedef 4100 ayakta).
- `ZC_DATA_DIR` atılabilir bir kopyayı göstermeli (örn. `ZC_DATA_DIR="$PWD/.local/qa-throwaway"`); bu test yetkili hedef listesini kalıcı olarak değiştirir.
- Sign in as admin: `http://127.0.0.1:5173` aç → **"Yerel çalışma alanını aç"** butonuna tıkla → sol menüde **"Ayarlar"** butonuna tıkla.
- Başlangıçta listede `https://www.saucedemo.com` ve `https://example.org` origin'leri **olmamalı**; varsa önce satırdaki çöp kutusu ile sil.
- Not: Bu kartın bildirim (`role=status`) ve hata (`role=alert`) metinleri, sayfanın en altındaki **"Sağlayıcı bağlantıları"** kartının altında görünür.

## Test data
- `validOrigin = "https://www.saucedemo.com/"` → listede `https://www.saucedemo.com` olarak görünür
- `validWithPath = "https://example.org/a/b?x=1"` → listede `https://example.org` olarak görünür
- `duplicateOrigin = "https://www.saucedemo.com/inventory.html"` (aynı origin)
- `emptyRequired = ""`
- `whitespaceOnly = "   "`
- `notAUrl = "bu bir url degil"`
- `httpOrigin = "http://example.com"`
- `localhostOrigin = "https://localhost"`
- `subLocalhost = "https://app.localhost"`
- `ipOrigin = "https://127.0.0.1"`
- `portOrigin = "https://example.com:8443"`
- `credsOrigin = "https://user:pass@example.com"`
- `tooLongUrl = "https://example.com/" + 1000 × "a"` (1020 karakter)

## Steps

### TC-01: Happy path — HTTPS hedef site ekle ve kalıcılığını doğrula
1. Sign in as admin ve **"Ayarlar"** bölümünü aç (Preconditions).
2. Assert: eyebrow `YETKİLİ HEDEFLER` ve başlık `Test edilecek siteler` görünür; altında `Yerel demo: http://127.0.0.1:4100` metni vardır.
3. Assert: `Hedef site URL` (aria-label) input'u boş ve placeholder `https://www.saucedemo.com/`; **`Site ekle`** butonu disabled.
4. `Hedef site URL` alanına `validOrigin` yaz.
5. Assert: **`Site ekle`** enabled.
6. **`Site ekle`** butonuna tıkla.
7. Assert: `role=status` metni tam olarak `Hedef site eklendi; yeniden başlatma gerekmez.`; input boşaldı; listede `https://www.saucedemo.com` satırı ve `https://www.saucedemo.com sil` aria-label'lı buton görünür.
8. Assert: Ağ: `POST /api/v1/ai/authorized-origins` yanıtı 201, gövde `origin = "https://www.saucedemo.com"`.
9. `Hedef site URL` alanına `validWithPath` yaz, **`Site ekle`**'ye tıkla.
10. Assert: listede `https://example.org` satırı görünür (path ve query atılmış); liste en yeni en üstte sıralı, yani `https://example.org` `https://www.saucedemo.com`'un üstündedir.
11. Assert: "Test verileri" kartındaki `Test verisi kapsamı` select'inde `https://www.saucedemo.com` ve `https://example.org` seçenekleri vardır.
12. Sayfayı yenile, tekrar **"Ayarlar"**'a git. Assert: her iki origin listede hâlâ görünür.

### TC-02: Form validation — `authorized-origin-form`
Her satır için: `Hedef site URL` alanını temizle, değeri yaz, **`Site ekle`**'ye tıkla (buton enabled ise), sonra hata metnini ve listenin değişmediğini doğrula.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Hedef site URL` = `emptyRequired` | **`Site ekle`** disabled (istek gönderilmez) | n/a | n/a |
| `Hedef site URL` = `whitespaceOnly` | **`Site ekle`** disabled | n/a | n/a |
| `Hedef site URL` = `notAUrl` | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| `Hedef site URL` = `httpOrigin` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `localhostOrigin` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `subLocalhost` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `ipOrigin` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `portOrigin` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `credsOrigin` | n/a | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` | n/a |
| `Hedef site URL` = `tooLongUrl` | n/a | n/a | `Alanları kontrol edin. (INVALID_INPUT)` |

Her hatalı gönderimden sonra:
- Hata `role=alert` (`p.error`) içinde, "Sağlayıcı bağlantıları" kartının altında görünür.
- Input'taki değer silinmez (yalnız başarıda temizlenir).
- Yetkili hedef listesi değişmez; ağda ilgili `POST` 400 döner (beklenen hata).

### TC-03: Modal coverage — yok
Bu kartta modal/diyalog yoktur. Silme işlemi onay diyaloğu açmaz (bkz. TC-04). Assert: **`Site ekle`** ve çöp kutusu tıklamalarında hiçbir `role=dialog` öğesi DOM'a eklenmez.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **`Site ekle`** (boş input) | hover/click | disabled, istek yok |
| **`Site ekle`** (`duplicateOrigin`) | click | `role=status` = `Hedef site eklendi; yeniden başlatma gerekmez.`; listede `https://www.saucedemo.com` **tek** satır kalır (çift kayıt yok); `POST` yanıtı 200 ve mevcut `id` döner |
| `https://www.saucedemo.com sil` | click → cancel confirm | Onay diyaloğu yoktur; iptal yolu mevcut değildir. Bulgu olarak raporla: tek tık kalıcı siler. |
| `https://www.saucedemo.com sil` | click → confirm proceed | `role=status` = `Hedef site kaldırıldı.`; satır listeden kalkar; `DELETE /api/v1/ai/authorized-origins/<id>` 200 `{status:"deleted"}`; "Test verileri" → `Test verisi kapsamı` select'inde `https://www.saucedemo.com` seçeneği artık yoktur |
| `https://example.org sil` | click | `Hedef site kaldırıldı.`; liste temizlendikten sonra yalnız `Yerel demo: http://127.0.0.1:4100` metni kalır |

Sayfayı yenile. Assert: silinen origin'ler geri gelmez.

### TC-05: Negative & edge cases
- Ağ kesik (DevTools → Offline) iken `validOrigin` ile **`Site ekle`** → `role=alert` içinde `Failed to fetch` içeren metin görünür; liste değişmez; çevrimiçine dönünce tekrar denemek başarılı olur.
- `https://WWW.SauceDemo.COM/` girilir → listede küçük harfe normalize edilmiş `https://www.saucedemo.com` görünür (önceden silinmişse yeni satır, varsa çift kayıt oluşmaz).
- İstek sürerken (busy) **`Site ekle`** ve tüm çöp kutusu butonları disabled olur (yavaş ağ: DevTools → Slow 3G ile gözle).
- Zaten silinmiş bir kaydı iki sekmede silme: Sekme A ve B'de "Ayarlar" açık; A'da sil, B'de aynı satırın çöp kutusuna tıkla → B'de `Hedef bulunamadı. (NOT_FOUND)` hatası görünür (beklenen 404).

## Assertions
- [ ] Kart başlığı `Test edilecek siteler`, eyebrow `YETKİLİ HEDEFLER`, açıklama metni ve `Yerel demo: http://127.0.0.1:4100` görünür.
- [ ] Geçerli HTTPS URL origin'e normalize edilerek eklenir ve `Hedef site eklendi; yeniden başlatma gerekmez.` görünür.
- [ ] Eklenen origin'ler yenilemeden sonra da listededir ve `Test verisi kapsamı` seçeneklerine yansır.
- [ ] TC-02 tablosundaki her geçersiz değer birebir beklenen hata metnini üretir; liste değişmez.
- [ ] Aynı origin ikinci kez eklenince çift satır oluşmaz.
- [ ] Silme `Hedef site kaldırıldı.` gösterir, satır ve kapsam seçeneği kalkar.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02 400'leri, TC-05 404).

## Screenshots required
- Page initial load ("Ayarlar" bölümü, "Test edilecek siteler" kartı)
- Each modal opened (yok — TC-03 notu)
- Each validation error state (TC-02'deki `INVALID_INPUT`, `TARGET_BLOCKED` ve disabled buton durumları)
- Final state after the happy path (iki origin listede, TC-01 adım 12 sonrası)
- Silme sonrası liste (TC-04)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
