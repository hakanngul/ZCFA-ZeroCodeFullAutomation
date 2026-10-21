# T24-ai-test-assistant-model-comparison: Çoklu model karşılaştırması — tek keşif, model başına üretim, ayrı onay ve çalıştırma

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/model-comparison.tsx` |
| Flow | AI Test Assistant (kenar çubuğu "AI Test Assistant") — "Modelleri karşılaştır (2–3 model, tek keşif)" → "Karşılaştır" → "Model karşılaştırması" tablosu → satır bazında "Onayla" → "<model> suite'ini çalıştır" |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT=5173` ile başlatılmış olmalı).
- Sign in as `admin`: `http://127.0.0.1:5173` açılır, **"Yerel çalışma alanını aç"** tıklanır, kenar çubuğunda **"AI Test Assistant"** seçilir.
- Ayarlar'da aktif bir OpenAI-compatible provider vardır ve bu provider'ın `/models` listesi en az 2 farklı model ID'si döndürür (ör. kayıtlı model + ikinci bir sohbet modeli).
- Ayarlar → "Test edilecek siteler" listesinde `https://www.saucedemo.com` vardır.
- Test verileri `SAUCE_USER`, `SAUCE_PASSWORD` tanımlıdır (değerler yazılmaz).

## Test data
- `targetUrl = "https://www.saucedemo.com/"`
- `prompt = "[QA-{runId}] saucedemo'da {{SAUCE_USER}} ve {{SAUCE_PASSWORD}} ile giriş yap ve ürün listesinin göründüğünü doğrula; bir de hatalı parola senaryosu hazırla."`
- `modelA = <provider'ın kayıtlı modeli; "Karşılaştırma modeli 1" alanına otomatik gelir>`
- `modelB = <"Modelleri getir" sonrası datalist'ten modelA'dan farklı ilk model ID>`
- `modelC = <datalist'ten modelA ve modelB'den farklı bir model ID; yoksa TC-04 "Model ekle" satırı yalnız ekle/kaldır olarak koşulur>`
- `conversationTitle = ("Karşılaştırma: " + prompt)` ifadesinin ilk 80 karakteri
- `blankModel = "   "`
- `mismatchPrompt = "[QA-{runId}] https://example.com/ sayfasını incele ve başlığı doğrula."`

## Steps

### TC-01: Happy path — iki modeli aynı keşifle karşılaştır, birini onayla ve çalıştır
1. Sign in as `admin`; **"AI Test Assistant"** → **"Yeni konuşma"**.
2. Assert: `h1` `AI Test Assistant`; **"Gönder"** düğmesi görünür, **"Karşılaştır"** görünmez.
3. "Hedef URL" → `targetUrl`.
4. **"Modelleri karşılaştır (2–3 model, tek keşif)"** onay kutusu işaretlenir.
5. Assert: iki satır görünür: "Karşılaştırma provider 1" = aktif provider, "Karşılaştırma modeli 1" = `modelA`; "Karşılaştırma provider 2" = aktif provider, "Karşılaştırma modeli 2" boş (`Model ID` placeholder). `Keşfi ilk model yönetir; her model için ayrı üretim çağrısı yapılır.` metni görünür; **"Gönder"** yerine **"Karşılaştır"** görünür ve devre dışıdır.
6. 2. satırdaki **"Modelleri getir"** tıklanır. Assert: `role="status"` notu `<n> model yüklendi.` (n ≥ 2).
7. Formu doldur:
   - "Karşılaştırma modeli 2" → `modelB` (datalist'ten)
   - "Test isteği" → `prompt`
8. Assert: **"Karşılaştır"** etkin.
9. **"Karşılaştır"** tıklanır.
10. Assert: `role="status"` notu `Keşif bir kez çalışacak; ardından her model aynı keşiften senaryo üretecek.`; "Test isteği" boşalır; "KONUŞMALAR" listesinde `conversationTitle` başlıklı seçili konuşma görünür; thread'de `Sen` mesajı `prompt` metnini gösterir.
11. Assert: `aria-label="Model karşılaştırması"` bölgesi `Model karşılaştırması` başlığıyla görünür; tablo başlıkları sırayla `Model`, `Durum`, `Şema`, `Senaryo`, `Adım`, `Doğrulama`, `Kırılgan locator`, `Süre`, `Token (girdi / çıktı)`, `Son çalıştırma`; 2 satır vardır: 1. satır `modelA`, 2. satır `modelB` (her ikisinde provider adı `small` olarak).
12. Assert: keşif sürerken `Ortak keşif: sürüyor…. Her model aynı keşif sonucundan senaryo üretti.` görünür ve Durum sütunu `Keşif bekleniyor` / `Keşif sürüyor` / `Üretim sırada` / `Üretiliyor` değerlerinden birini gösterir.
13. Assert: en geç 300 sn içinde her iki satırın Durum'u `Hazır` veya `Başarısız` olur; en az biri `Hazır`'dır. Ortak keşif satırı `Ortak keşif: 1 kez çalıştı · <N> sayfa · <M> adım` ile başlar (`1 kez` — keşif yalnız bir kez çalışır; `N ≤ 8`, `M ≤ 20`); erken durduysa ` · erken durdu (<reason>)` eki vardır.
14. Assert (Hazır satır): Şema `İlk denemede geçerli` veya `Düzeltmeyle geçerli` ve altında `<1|2> yanıt`; Senaryo, Adım, Doğrulama sütunları tam sayıdır ve `Doğrulama ≥ Senaryo`; Kırılgan locator tam sayıdır (> 0 ise hücre `warn` sınıflıdır); Süre `<x.x> sn`; Token `<toplam> (<girdi> / <çıktı>)` veya `—`; Son çalıştırma `—`; son hücrede **"Onayla"** düğmesi vardır.
15. Assert (Başarısız satır varsa): Durum `Başarısız` ve altında hata kodu (ör. `PROVIDER_FORMAT`, `UNOBSERVED_LOCATOR`, `ELEMENT_UNAVAILABLE`, `AGENT_ERROR`); Şema `Geçersiz` veya `—`; "Onayla" düğmesi yoktur; thread'de `Senaryo üretimi tamamlanamadı: ` ile başlayan mesaj vardır.
16. Assert: tablonun altında her model için ayrı taslak kartı vardır; başlıklar `<model> · Senaryo taslağı` (veya `<model> · Analiz başarısız`) biçimindedir; keşif özeti (`<N> sayfa · <M> keşif adımı · <K> DOM öğesi`, `İncelenen sayfalar`, `Keşif yolu`) yalnız **1. modelin** kartında görünür.
17. Assert: her Hazır model için thread'de `<model>: <S> senaryo taslağı hazır (karşılaştırma). Kaydetmeden önce inceleyip onaylayın.` mesajı vardır.
18. Assert (AI kendiliğinden kaydetmez/çalıştırmaz): hiçbir satırda "<model> suite'ini çalıştır" yoktur; `Suite çalışması` kutusu yoktur.
19. İlk Hazır satırdaki **"Onayla"** tıklanır (`modelX` = o satırın modeli).
20. Assert: `role="status"` notu `Taslak onaylandı ve suite olarak kaydedildi.`; o satırda "Onayla" kaybolur ve `aria-label="<modelX> suite'ini çalıştır"` olan **"Çalıştır"** düğmesi görünür; diğer Hazır satırda "Onayla" hâlâ görünür (onaylar bağımsızdır).
21. Assert: "Kaydedilen suite’ler" listesine `<suite başlığı> · <S> senaryo` satırı eklenir.
22. **"<modelX> suite'ini çalıştır"** tıklanır.
23. Assert: `Suite çalışması · queued` görünür; en geç 330 sn içinde `passed` veya `failed` olur; `<p> başarılı · <f> başarısız · <s> atlandı` satırı görünür.
24. Assert: tablodaki `modelX` satırının Son çalıştırma hücresi `<status> · <p> ✓ / <f> ✗` biçimine güncellenir (1,5 sn yoklama).
25. Sayfa yenilenir; "AI Test Assistant" → "KONUŞMALAR" altında `conversationTitle` tıklanır.
26. Assert: "Model karşılaştırması" tablosu aynı satırlar, metrikler ve Son çalıştırma değeriyle geri yüklenir; `modelX` satırında "Çalıştır", diğer Hazır satırda "Onayla" vardır.

### TC-02: Form validation — `compare-composer`
"Hedef URL" = `targetUrl`, "Test isteği" = `prompt` iken her satır ayrı denenir:

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Karşılaştırma modeli 2 | `""` → "Karşılaştır" devre dışı | `blankModel` → "Karşılaştır" devre dışı; `modelA` (1. satırla aynı) → `Aynı model bir karşılaştırmada bir kez seçilebilir. (DUPLICATE_MODEL)` | 121 × `m` → `Alanları kontrol edin. (INVALID_INPUT)` |
| Test isteği | `""` → "Karşılaştır" devre dışı | `giriş yap` (9 karakter) → devre dışı | 2001 × `a` → `Alanları kontrol edin. (INVALID_INPUT)` |
| Hedef URL | n/a | `mismatchPrompt` ile ("Hedef URL" = `targetUrl`) → `Prompt ve hedef URL farklı. (TARGET_MISMATCH)`; "Hedef URL" = `https://example.com/` ve URL'siz `prompt` → `Hedef, yetkili origin listesinde değil. (TARGET_BLOCKED)` ve yetkilendirme kutusu **görünmez** | n/a |

Her hata sonrası Assert: yeni konuşma veya "Model karşılaştırması" tablosu oluşmaz.

### TC-03: Modal coverage — n/a
Bu akışta modal yoktur; karşılaştırma alanları kompozitör içinde yerinde açılır (TC-01 adım 4–8).

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Modelleri karşılaştır (2–3 model, tek keşif)` | işaretle | 2 karşılaştırma satırı, "Karşılaştır" düğmesi |
| `Modelleri karşılaştır (2–3 model, tek keşif)` | işareti kaldır | Karşılaştırma alanları gizlenir, "Gönder" geri gelir; tekrar işaretlenince önceki satırlar korunur |
| `Modelleri getir` | click | `<n> model yüklendi.`; "Karşılaştırma modeli N" datalist'i dolar |
| `Model ekle` | click (2 satır varken) | 3. satır eklenir ("Karşılaştırma modeli 3" boş); "Model ekle" düğmesi kaybolur (en fazla 3) |
| `Model 3 kaldır` | click | 3. satır kaldırılır; 2 satırda kaldır düğmeleri görünmez; "Model ekle" geri gelir |
| `Karşılaştır` | 3 farklı model (`modelA`, `modelB`, `modelC`) ile click | Tabloda 3 satır; `Ortak keşif: 1 kez çalıştı …` (keşif yine bir kez) |
| `Onayla` | click | `Taslak onaylandı ve suite olarak kaydedildi.` |
| `<model> suite'ini çalıştır` | click | `Suite çalışması · queued` |

### TC-05: Negative & edge cases
- Karşılaştırma sırasında "Yeni konuşma" tıklanır → tablo ve taslaklar ekrandan temizlenir; "KONUŞMALAR" altında karşılaştırma konuşmasına geri dönülünce tablo ve işlerin durumu kaldığı yerden görünür (işler arka planda iptal edilmez).
- Bir model üretimde başarısız olursa diğer modelin satırı etkilenmez: Başarısız satır "Onayla" göstermez, Hazır satır onaylanabilir (TC-01 adım 15/20).
- Karşılaştırma modunda yetkisiz HTTPS hedefte **"Siteyi ekle ve tekrar gönder"** kutusu çıkmaz (yalnız normal "Gönder" akışında çıkar) — TC-02 Hedef URL satırı.

## Assertions
- [ ] Karşılaştırma modu 2–3 model ile sınırlıdır; "Model ekle" 3'te kaybolur.
- [ ] Model alanlarından biri boşken "Karşılaştır" devre dışıdır; aynı model `DUPLICATE_MODEL` verir.
- [ ] Keşif bir kez çalışır (`Ortak keşif: 1 kez çalıştı`), her model için ayrı taslak üretilir.
- [ ] Tablo metrik sütunları (Şema, Senaryo, Adım, Doğrulama, Kırılgan locator, Süre, Token) doldurulur.
- [ ] Onay ve çalıştırma satır bazında ve açıkça kullanıcı eylemiyle yapılır.
- [ ] Son çalıştırma sütunu run sonucunu yansıtır; yenilemeden sonra tablo geri yüklenir.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02).

## Screenshots required
- Page initial load
- Karşılaştırma modu açık, iki satır doldurulmuş
- `Ortak keşif: sürüyor…` durumundaki tablo
- Her iki satırın `Hazır`/`Başarısız` olduğu tablo
- Each validation error state (TC-02 her satır)
- "Onayla" sonrası satırda "Çalıştır" düğmesi
- Final state after the happy path (Son çalıştırma sütunu dolu tablo)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
