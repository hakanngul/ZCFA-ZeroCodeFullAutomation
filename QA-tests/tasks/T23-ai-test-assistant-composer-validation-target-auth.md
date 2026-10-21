# T23-ai-test-assistant-composer-validation-target-auth: Kompozitör doğrulaması, sohbetten hedef yetkilendirme ve taslak JSON doğrulaması

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-assistant.tsx` |
| Flow | AI Test Assistant (kenar çubuğu "AI Test Assistant") — Form validation — `chat-composer` + `authorize-from-chat` + `draft-json-editor`; eksik provider durumu |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 38 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT=5173` ile başlatılmış olmalı).
- Sign in as `admin`: `http://127.0.0.1:5173` açılır, **"Yerel çalışma alanını aç"** tıklanır, kenar çubuğunda **"AI Test Assistant"** seçilir.
- Ayarlar'da aktif bir OpenAI-compatible provider ve modeli vardır.
- Ayarlar → "Test edilecek siteler" listesinde `https://www.saucedemo.com` vardır; `https://example.com` ve `https://93.184.216.34` **yoktur** (varsa önce `https://example.com sil` ile kaldırılır).
- Test verileri `SAUCE_USER`, `SAUCE_PASSWORD` tanımlıdır (değerler yazılmaz).
- TC-05'in "provider yok" maddesi yalnız provider kaydı olmayan ayrı bir veri dizininde (`ZC_DATA_DIR` boş klasör) çalıştırılır; bu ortam yoksa o madde `blocked` olarak raporlanır.

## Test data
- `validTarget = "https://www.saucedemo.com/"`
- `validPrompt = "[QA-{runId}] saucedemo giriş sayfasını incele; boş kullanıcı adı ile giriş denemesinin hata mesajını doğrulayan negatif senaryo hazırla."`
- `authPrompt = "[QA-{runId}] example.com ana sayfasındaki başlığın görünür olduğunu doğrulayan tek senaryo hazırla."`
- `tooShortPrompt = "giriş yap"` (9 karakter)
- `whitespacePrompt = "  test    "` (trim sonrası 4 karakter)
- `tooLongPrompt = 2001 × "a"`
- `tooLongModel = 121 × "m"`
- `emptyModel = ""`
- `notUrlTarget = "saucedemo"`
- `unauthorizedTarget = "https://example.com/"`
- `httpExternalTarget = "http://example.com/"`
- `hashTarget = "https://www.saucedemo.com/#qa"`
- `ipTarget = "https://93.184.216.34/"`
- `originalJson` = taslak hazır olduğunda "Suite taslağı" textarea'sının ilk içeriği (runner kopyalar ve her geçersiz denemeden sonra geri yapıştırır)

## Steps

### TC-01: Happy path — yetkisiz HTTPS hedefi sohbetten yetkilendir ve isteği tekrar gönder
1. Sign in as `admin`; **"AI Test Assistant"** → **"Yeni konuşma"**.
2. Assert: `h1` `AI Test Assistant`; boş durum `Bir hedef ve test isteği yaz` görünür.
3. Formu doldur: "Hedef URL" → `unauthorizedTarget`; "Test isteği" → `authPrompt`; "Aktif provider" ve "Chat modeli" varsayılan.
4. **"Gönder"** tıklanır.
5. Assert: `role="alert"` hata metni `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)`.
6. Assert: yetkilendirme kutusu `https://example.com henüz yetkili hedeflerde yok.` metnini ve **"Siteyi ekle ve tekrar gönder"** düğmesini gösterir; "Test isteği" alanı `authPrompt` değerini korur.
7. "Test isteği" sonuna bir boşluk eklenip silinir. Assert: yetkilendirme kutusu kaybolur (bekleyen hedef sıfırlanır).
8. **"Gönder"** tekrar tıklanır. Assert: adım 5 ve 6 tekrarlanır.
9. **"Siteyi ekle ve tekrar gönder"** tıklanır.
10. Assert: hata kaybolur; "Test isteği" boşalır; thread'de `Sen` mesajı `authPrompt` metnini gösterir; taslak kartı `Sıraya alındı…` veya `Sayfa keşfediliyor…` başlığını gösterir.
11. Assert: en geç 240 sn içinde taslak başlığı `Senaryo taslağı` veya `Analiz başarısız` olur. `Senaryo taslağı` ise `İncelenen sayfalar` ilk öğesi example.com sayfasıdır. `Analiz başarısız` ise kartta hata kodu satırı ve thread'de `Analiz tamamlanamadı: ` ile başlayan mesaj görünür (ağ/proxy kaynaklı `TARGET_NAVIGATION_FAILED` kabul edilir; `TARGET_BLOCKED` kabul edilmez).
12. Kenar çubuğunda **"Ayarlar"** tıklanır. Assert: "Test edilecek siteler" altında `https://example.com` satırı görünür.
13. Sayfa yenilenir (F5), tekrar **"Ayarlar"**. Assert: `https://example.com` satırı kalıcıdır.
14. Temizlik: **`https://example.com sil`** (çöp kutusu) tıklanır. Assert: `role="status"` notu `Hedef site kaldırıldı.`; satır kaybolur.

### TC-02: Form validation — `chat-composer`
Her satırda diğer alanlar geçerli değerlerde (`validTarget`, `validPrompt`, varsayılan provider/model) tutulur ve **"Gönder"** tıklanır (düğme etkinse).

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Test isteği | `""` → "Gönder" devre dışı, hata yok | `tooShortPrompt` → "Gönder" devre dışı; `whitespacePrompt` → "Gönder" devre dışı | `tooLongPrompt` → `Alanları kontrol edin. (INVALID_INPUT)` |
| Chat modeli | `emptyModel` → "Gönder" devre dışı | n/a | `tooLongModel` → `Alanları kontrol edin. (INVALID_INPUT)` |
| Hedef URL | `""` → `Alanları kontrol edin. (INVALID_INPUT)` | `notUrlTarget` → `Alanları kontrol edin. (INVALID_INPUT)`; `httpExternalTarget` → `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` ve yetkilendirme kutusu **görünmez**; `hashTarget` → `Hedef URL desteklenmiyor. (TARGET_BLOCKED)` | 1001+ karakterlik URL (`https://www.saucedemo.com/?q=` + 980 × `a`) → `Alanları kontrol edin. (INVALID_INPUT)` |
| Aktif provider | (TC-05'te) | n/a | n/a |

Ek kontroller:
1. Her hata satırından sonra Assert: thread'e yeni kullanıcı mesajı **eklenmez**, "KONUŞMALAR" listesine yeni konuşma **eklenmez**.
2. `hashTarget` satırı sonrası Assert (mevcut kod davranışı): kutu `Site listede kayıtlı. Kodu güncelledikten sonra çalışan sunucuyu bir kez yeniden başlat.` metnini gösterir ve "Siteyi ekle ve tekrar gönder" düğmesi yoktur. Gerçek neden hash olduğu için bu metin yanıltıcıdır; bulgu olarak raporla.
3. `ipTarget` ile **"Gönder"** → Assert: `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` ve kutu `https://93.184.216.34 henüz yetkili hedeflerde yok.` → **"Siteyi ekle ve tekrar gönder"** → Assert: `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)`; Ayarlar listesinde `https://93.184.216.34` **yoktur**.
4. "Test isteği" alanındaki URL hedefi geçersiz kılar: "Hedef URL" = `validTarget`, "Test isteği" = `https://example.com/ sayfasını incele ve başlığı doğrula.` → **"Gönder"** → Assert: `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` ve kutu `https://example.com henüz yetkili hedeflerde yok.` (prompt URL'i kullanılır). "Siteyi ekle ve tekrar gönder" **tıklanmaz**.

### TC-03: Modal coverage — `draft-json-editor` (yerinde düzenleyici; ayrı dialog yok)
1. **"Yeni konuşma"**; "Hedef URL" → `validTarget`; "Test isteği" → `validPrompt`; **"Gönder"**. Assert: en geç 240 sn içinde taslak başlığı `Senaryo taslağı`.
2. **"Taslağı düzenle"** tıklanır. Assert: `Kaydetmeden önce suite JSON’unu düzenle` etiketli "Suite taslağı" textarea'sı görünür ve **"Onayla ve kaydet"** etkindir. İçerik `originalJson` olarak kopyalanır.
3. Geçersiz girişler — her biri için textarea'ya ilgili değişiklik uygulanır, **"Onayla ve kaydet"** tıklanır, belirtilen `role="alert"` metni doğrulanır, textarea açık kalır ve "Kaydedilen suite’ler" listesine satır **eklenmez**; ardından textarea içeriği `originalJson` ile değiştirilir:

| Değişiklik | Beklenen hata |
|---|---|
| İlk `{` karakteri silinir (bozuk JSON) | JSON ayrıştırma hatası metni (`SyntaxError` mesajı, ör. `Unexpected token` / `is not valid JSON` içerir); ağ isteği **gönderilmez** |
| `"title"` değeri `"ab"` yapılır | `Alanları kontrol edin. (INVALID_INPUT)` |
| İlk senaryonun `"category"` değeri `"smoke"` yapılır | `Alanları kontrol edin. (INVALID_INPUT)` |
| İlk senaryonun `"actions"` dizisi `[]` yapılır | `Alanları kontrol edin. (INVALID_INPUT)` |
| İlk senaryodan `kind` değeri `assert` ile başlayan tüm aksiyonlar silinir (en az bir aksiyon kalır) | `Her senaryoda doğrulama olmalı. (ASSERTION_REQUIRED)` |
| `"targetUrl"` değeri `"https://www.saucedemo.com/inventory.html"` yapılır | `Hedef değiştirilemez. (TARGET_BLOCKED)` |
| `"locator"` içeren ilk aksiyonun locator'ı `{"kind":"id","value":"qa-yok"}` yapılır (locator'lı aksiyon yoksa satır atlanır ve raporlanır) | `Locator incelenen sayfalarda yok. (UNOBSERVED_LOCATOR)` |
| İlk senaryonun sonuna `{"kind":"assertUrl","expected":"https://example.com/"}` eklenir | `URL hedef dışı. (TARGET_BLOCKED)` |
| İlk aksiyona `"code":"alert(1)"` alanı eklenir | `Alanları kontrol edin. (INVALID_INPUT)` |

4. Geçerli giriş: textarea `originalJson` içerir; yalnız `"title"` değeri `"QA-{runId} giriş doğrulama"` yapılır → **"Onayla ve kaydet"**.
5. Assert: `Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.`; textarea kapanır; "Kaydedilen suite’ler" listesinde `QA-{runId} giriş doğrulama · <S> senaryo` satırı görünür.
6. Sayfa yenilenir; "AI Test Assistant" açılır. Assert: `QA-{runId} giriş doğrulama · <S> senaryo` satırı kalıcıdır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Gönder` | geçersiz prompt ile | devre dışı (TC-02) |
| `Gönder` | yetkisiz HTTPS hedefle | `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` + yetkilendirme kutusu |
| `Siteyi ekle ve tekrar gönder` | click | Origin eklenir, istek gönderilir (TC-01) |
| `Siteyi ekle ve tekrar gönder` | IP hedefle click | `Yalnız herkese açık HTTPS hedefleri eklenebilir. (TARGET_BLOCKED)` |
| `Taslağı düzenle` | click | Textarea açılır, düğme gizlenir |
| `Onayla ve kaydet` | geçersiz JSON ile | `role="alert"` hata, kayıt yok |
| `Onayla ve kaydet` | geçerli JSON ile | `Suite kaydedildi. …` |
| `https://example.com sil` (Ayarlar) | click | `Hedef site kaldırıldı.` (temizlik) |

### TC-05: Negative & edge cases
- Mükerrer onay: TC-03 sonrası aynı taslakta **"Taslağı düzenle"** → **"Onayla ve kaydet"** tekrar tıklanır. Assert (mevcut kod davranışı): `Suite kaydedildi. …` yeniden görünür ve "Kaydedilen suite’ler" listesinde aynı başlıklı **ikinci** bir satır oluşur. Sunucuda tekillik kontrolü olmadığı için bulgu olarak raporla.
- Provider yok (yalnız boş `ZC_DATA_DIR` ortamında): "AI Test Assistant" açılır. Assert: `Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı ekle.` ipucu görünür; "Aktif provider" listesi boştur; geçerli `validPrompt` girilse bile **"Gönder"** devre dışıdır. Ortam yoksa `blocked`.
- Kompozitör, hata sonrası değer korur: TC-02'deki her `role="alert"` hatasından sonra "Test isteği" alanı girilen metni korur (yalnız başarılı gönderimde boşalır).
- Ağ kesintisi: DevTools'ta "Offline" açıkken **"Gönder"** → Assert: `role="alert"` görünür (fetch hatası metni, ör. `Failed to fetch`), düğme tekrar etkinleşir; "Offline" kapatılır.

## Assertions
- [ ] Prompt < 10 karakter (trim sonrası) veya model boşken "Gönder" devre dışıdır.
- [ ] Sunucu doğrulama hataları `Alanları kontrol edin. (INVALID_INPUT)` biçimindedir.
- [ ] Yetkisiz HTTPS hedef `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` verir ve `<origin> henüz yetkili hedeflerde yok.` kutusu görünür; HTTP hedefte kutu görünmez.
- [ ] "Siteyi ekle ve tekrar gönder" origin'i ekler ve isteği tekrar gönderir; IP hedefi reddedilir.
- [ ] Taslak JSON doğrulamasında her hata kodu birebir metniyle görünür ve kayıt oluşmaz.
- [ ] Geçerli düzenleme kaydedilir ve yenilemeden sonra kalıcıdır.
- [ ] Temizlik sonrası `https://example.com` listede yoktur.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02, TC-03 adım 3, TC-04 hata satırları, TC-01 adım 5/8).

## Screenshots required
- Page initial load
- Yetkilendirme kutusu (`https://example.com henüz yetkili hedeflerde yok.`)
- `hashTarget` sonrası yanıltıcı `Site listede kayıtlı…` kutusu
- Each validation error state (TC-02 tablosunun her satırı, TC-03 tablosunun her satırı)
- "Suite taslağı" düzenleyicisi açık
- Final state after the happy path (Ayarlar'da `https://example.com` satırı, temizlikten önce)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
