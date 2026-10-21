# T25-ai-test-assistant-quality-promote-element-errors: Kalite bulguları, düzeltme taslağı, kalıcı teste dönüştürme ve ELEMENT_UNAVAILABLE / AGENT_ERROR

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/quality-findings.tsx` |
| Flow | AI Test Assistant (kenar çubuğu "AI Test Assistant") — kalite kontrollü istek (konsol, kırık bağlantı, erişilebilirlik) → onay → run ve bulgular → "Yeni taslak olarak düzelt" → Testler "AI suite’ler" → "Kalıcı teste dönüştür"; kütüphane elementi onayı kaldırılınca ELEMENT_UNAVAILABLE |
| Requires auth | yes |
| Required role | admin |
| Destructive | yes |
| Estimated steps | 40 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT=5173` ile başlatılmış olmalı).
- Sign in as `admin`: `http://127.0.0.1:5173` açılır, **"Yerel çalışma alanını aç"** tıklanır, kenar çubuğunda **"AI Test Assistant"** seçilir.
- Ayarlar'da aktif bir OpenAI-compatible provider ve modeli vardır.
- Ayarlar → "Test edilecek siteler" listesinde `https://www.saucedemo.com` vardır.
- Test verileri `SAUCE_USER`, `SAUCE_PASSWORD` tanımlıdır (değerler yazılmaz).
- TC-05 için: Elementler → "Web sitelerinden kaydedilen elementler" altında `www.saucedemo.com` giriş sayfasından en az bir keşif kaydı vardır (T22 bunu üretir). Bu görev bir kütüphane elementinin onayını geçici olarak kaldırır ve sonunda geri yükler (Destructive = yes).

## Test data
- `targetUrl = "https://www.saucedemo.com/"`
- `qualityPrompt = "[QA-{runId}] saucedemo'da {{SAUCE_USER}} ve {{SAUCE_PASSWORD}} ile giriş yap; ürün listesi sayfasında konsol hatası, kırık bağlantı ve erişilebilirlik kontrolü yap ve ürün listesinin göründüğünü doğrula."`
- `elementPrompt = "[QA-{runId}] saucedemo giriş sayfasında boş kullanıcı adıyla Login butonuna tıkla ve hata mesajının göründüğünü doğrula."`
- `elementName = "Giriş butonu"`
- `elementKey = "saucedemo.login"`
- `qualityKinds = ["assertNoConsoleErrors", "assertNoBrokenLinks", "assertAccessible"]`

## Steps

### TC-01: Happy path — kalite kontrollü suite üret, onayla, çalıştır ve bulguları incele
1. Sign in as `admin`; **"AI Test Assistant"** → **"Yeni konuşma"**.
2. Assert: `h1` `AI Test Assistant`; boş durum `Bir hedef ve test isteği yaz` görünür.
3. Formu doldur: "Hedef URL" → `targetUrl`; "Test isteği" → `qualityPrompt`; "Aktif provider"/"Chat modeli" varsayılan.
4. **"Gönder"** tıklanır.
5. Assert: en geç 240 sn içinde taslak başlığı `Senaryo taslağı` olur ve thread'de `… senaryo taslağı hazır.` içeren `AI Assistant` mesajı görünür.
6. Tüm senaryo `summary` öğeleri açılır. Assert: adım listelerinde `qualityKinds` değerlerinden en az biri düz metin olarak (`assertNoConsoleErrors` / `assertNoBrokenLinks` / `assertAccessible`) görünür ve aynı senaryoda en az bir işlevsel doğrulama (`görünür`, `metni =` veya `URL =`) da vardır.
7. **"Taslağı düzenle"** → JSON değiştirilmeden **"Onayla ve kaydet"**.
8. Assert: `Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.`; "Kaydedilen suite’ler" altında `<suite başlığı> · <S> senaryo` satırı.
9. Bu satırdaki **"Çalıştır"** tıklanır.
10. Assert: `Suite çalışması · queued` → en geç 330 sn içinde `passed` veya `failed`; sayaç satırı `<p> başarılı · <f> başarısız · <s> atlandı`.
11. Assert (konsol): `assertNoConsoleErrors: <passed|failed>` adım satırı `— ` sonrası `Konsol hatası yok (<k> yok sayıldı)` veya `<n> konsol hatası` özetini gösterir; failed ise altında `ul.quality-findings` içinde ≤ 10 hata metni ve 10'dan fazlaysa `… daha fazla bulgu var` vardır.
12. Assert (bağlantı): `assertNoBrokenLinks` adımı `<n> bağlantı sağlam` veya `<n> bağlantıdan <k> kırık` özetini gösterir; kırık bağlantı öğeleri `<code>` içinde URL (sorgu dizesi olmadan) ve `HTTP <kod>` veya `Ağ hatası` metni içerir; `n ≤ 30`.
13. Assert (erişilebilirlik): `assertAccessible` adımı `Erişilebilirlik ihlali yok (<serious|critical> ve üstü)` veya `<n> erişilebilirlik ihlali (<serious|critical> ve üstü)` özetini gösterir; ihlal öğeleri `<code>` kural kimliği (ör. `color-contrast`), `<em>` etki (`serious`/`critical`), `<code>` hedef seçici ve açıklama metni içerir. Tarama çalışmadıysa adım `failed CHECK_NOT_RUN — Erişilebilirlik taraması çalışmadı.` gösterir.
14. Assert: kalite adımı `failed` ise senaryo `<başlık>: failed` ve `Hata: ASSERTION_FAILED` gösterir; sonraki adımlar yürütülmez; adımın **"Adım görüntüsü"** bağlantısı vardır.
15. Assert: bulgu metinlerinde ve özetlerde `SAUCE_PASSWORD` değeri görünmez (gizli değerler `{{SAUCE_PASSWORD}}` ile maskelenir).
16. Assert: thread'de `Suite tamamlandı: <p> başarılı, <f> başarısız, <s> atlandı.` mesajı; `f > 0` ise `Hata analizi: ` ile başlayan mesaj.

### TC-02: Form validation — `draft-json-editor` (kalite aksiyonları)
TC-01 adım 7'den önce ayrı bir taslakla (aynı `qualityPrompt` ile yeniden gönder) denenir; her satırdan sonra textarea orijinal JSON'a geri döndürülür:

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `assertAccessible.impact` | n/a (alan isteğe bağlı) | `"impact":"minor"` → `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| `assertNoConsoleErrors.ignore` | `"ignore":[""]` → `Alanları kontrol edin. (INVALID_INPUT)` | `"ignore":"x"` (dizi değil) → `Alanları kontrol edin. (INVALID_INPUT)` | 6 öğeli dizi → `Alanları kontrol edin. (INVALID_INPUT)`; 201 karakterlik öğe → aynı hata |
| `assertNoBrokenLinks` | n/a | `{"kind":"assertNoBrokenLinks","locator":{"kind":"id","value":"x"}}` → `Alanları kontrol edin. (INVALID_INPUT)` | n/a |

### TC-03: Modal coverage — n/a
Bu akışta modal yoktur. Yerinde açılan element düzenleyicisi (`<key> düzenle`) TC-05'te kapsanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeni taslak olarak düzelt` (Kaydedilen suite’ler, TC-01 suite'i) | click | `role="status"` `Kayıtlı keşif kullanılarak düzeltilmiş taslak üretiliyor; hazır olunca düzenleyebilirsin.`; yeni taslak kartı `Keşif tamamlandı, senaryolar üretiliyor…` ile başlar (yeni keşif yapılmaz, `Sayfa keşfediliyor…` görünmez) ve en geç 180 sn içinde `Senaryo taslağı` olur; keşif özetindeki sayfa/adım sayıları ilk taslakla aynıdır; thread'de `Düzeltilmiş taslak hazır: <S> senaryo. Kaydetmeden önce düzenleyip onaylayın.` |
| `AI Test Assistant’a git` (Testler → AI suite’ler) | click | "AI Test Assistant" bölümü açılır |
| `Kalıcı teste dönüştür` (Testler → AI suite’ler, TC-01 suite'i) | click | Satırda `Kalıcı test v1` etiketi görünür; düğme devre dışı olur ve `title` = `Bu suite zaten kalıcı teste dönüştürüldü.`; dönüştürmeden önce `title` = `Değişmez, sürümlü bir test oluşturur.`; aynı ekrandaki kalıcı testler listesinde suite başlığıyla v1 test görünür |
| `Kalıcı teste dönüştür` | sayfa yenilendikten sonra | Hâlâ devre dışı, `Kalıcı test v1` etiketi kalıcı |
| `Çalıştır` (Testler → AI suite’ler) | click | "AI Test Assistant" bölümüne geçilir (hata yok) |
| `Elementi onayla` + `Kaydet` (Elementler) | onay kaldır | `Kaydedildi (sürüm <n>).`; rozet `Bekliyor` |
| `Elementi onayla` + `Kaydet` (Elementler) | tekrar onayla (geri yükleme) | `Kaydedildi (sürüm <n+1>).`; rozet `Onaylı` |

### TC-05: Negative & edge cases
**ELEMENT_UNAVAILABLE (onayı kaldırılan kütüphane elementi):**
1. Kenar çubuğunda **"Elementler"** → "Web sitelerinden kaydedilen elementler" → "Kaydedilen element ara" = `login-button` → `www.saucedemo.com` `/` grubu açılır.
2. Login butonu satırında **"`<mevcut anahtar>` düzenle"** (**"Düzenle"**) tıklanır. "Element adı" → `elementName`; "Element anahtarı" → `elementKey` (alan devre dışıysa mevcut onaylı anahtar kullanılır ve bu görevde `elementKey` yerine o değer geçerlidir); **"Elementi onayla"** işaretlenir → **"Kaydet"**.
3. Assert: `role="status"` `Kaydedildi (sürüm <n>).`; satır rozeti `Onaylı`.
4. **"AI Test Assistant"** → **"Yeni konuşma"**; "Hedef URL" → `targetUrl`; "Test isteği" → `elementPrompt` → **"Gönder"**. Assert: `Senaryo taslağı`; açılan senaryo adımlarından biri `“Giriş butonu (saucedemo.login)” tıkla` metnini içerir ve `li.ai-element-ref` sınıflıdır.
5. **"Taslağı düzenle"** → **"Onayla ve kaydet"**. Assert: `Suite kaydedildi. …`.
6. **"Elementler"** → aynı element düzenlenir; **"Elementi onayla"** işareti kaldırılır → **"Kaydet"**. Assert: `Kaydedildi (sürüm <n+1>).`, rozet `Bekliyor`.
7. **"AI Test Assistant"** → ilgili konuşma → "Kaydedilen suite’ler" altında bu suite için **"Çalıştır"**.
8. Assert: run terminal durumu `failed`; ilgili adım satırı `click · saucedemo.login: failed ELEMENT_UNAVAILABLE — Element kullanılamıyor (unapproved): saucedemo.login` metnini içerir; senaryo `Hata: ELEMENT_UNAVAILABLE`; adım için **"Adım görüntüsü"** bağlantısı vardır.
9. **"Testler"** → "AI suite’ler" → bu suite'in **"Kalıcı teste dönüştür"** düğmesi tıklanır. Assert: kart içindeki `role="alert"` metni `Element kullanılamıyor (unapproved): saucedemo.login (ELEMENT_UNAVAILABLE)` içerir; satırda `Kalıcı test` etiketi **oluşmaz**.
10. Geri yükleme: **"Elementler"** → aynı element → **"Elementi onayla"** işaretlenir → **"Kaydet"**. Assert: `Kaydedildi (sürüm <n+2>).`, rozet `Onaylı`.
11. **"Testler"** → bu suite için **"Kalıcı teste dönüştür"** tekrar. Assert: `Kalıcı test v1` etiketi görünür (onay geri gelince dönüştürme başarılı).

**AGENT_ERROR ve diğer iş hataları (gözlemsel; tetiklenemezse `n/a` raporlanır):**
- Bu görevdeki herhangi bir taslak `Analiz başarısız` olursa Assert: kartta hata kodu satırı vardır; kod `AGENT_ERROR` ise thread mesajı birebir `Analiz tamamlanamadı: AGENT_ERROR` veya `Senaryo üretimi tamamlanamadı: AGENT_ERROR` olur (ek mesaj metni yok); başka bir kod ise mesaj `<faz> tamamlanamadı: <Türkçe mesaj> (<KOD>)` biçimindedir (ör. `Provider senaryo şemasına uymadı: …(PROVIDER_FORMAT)`, `AI gözlenmeyen locator önerdi. (UNOBSERVED_LOCATOR)`, `AI kütüphanede onaylı olmayan element anahtarı önerdi. (ELEMENT_UNAVAILABLE)`, `Hedef sayfa Chromium ile açılamadı. Ağ/proxy erişimini kontrol edin. (TARGET_NAVIGATION_FAILED)`).
- Başarısız taslakta **"Taslağı düzenle"** düğmesi görünmez (definition yok); suite kaydedilemez.

**Kanıt bütünlüğü:**
- "Ekran görüntüsü" bağlantısı, kanıtı olmayan bir senaryo indeksiyle elle açılırsa (`…/screenshots/9`) yanıt `404` ve `Kanıt bulunamadı.` mesajıdır.

## Assertions
- [ ] Kalite istekli taslakta kalite aksiyonları işlevsel bir doğrulamayla birlikte yer alır.
- [ ] Run'da her kalite adımı özet mesajını (`— <özet>`) gösterir; bulgular `ul.quality-findings` içinde ≤ 10 öğe olarak listelenir.
- [ ] Kalite bulgusu olan adım `ASSERTION_FAILED` ile senaryoyu durdurur ve ekran görüntüsü kanıtı üretir.
- [ ] Gizli test verisi hiçbir bulgu veya mesajda görünmez.
- [ ] "Yeni taslak olarak düzelt" yeni keşif yapmadan düzeltilmiş taslak üretir.
- [ ] "Kalıcı teste dönüştür" `Kalıcı test v1` etiketini oluşturur ve tekrar tıklanamaz.
- [ ] Onayı kaldırılan element run'da ve dönüştürmede `ELEMENT_UNAVAILABLE` verir; onay geri gelince dönüştürme başarılı olur.
- [ ] Element onayı görev sonunda geri yüklenmiştir (`Onaylı`).
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02, TC-05 adım 9, kanıt 404).

## Screenshots required
- Page initial load
- Kalite aksiyonlarını gösteren açılmış senaryo
- Run sonucu: her kalite adımı ve `ul.quality-findings` bulgu listesi
- Each validation error state (TC-02 her satır)
- `Düzeltilmiş taslak hazır…` mesajı ve yeni taslak kartı
- Testler → "AI suite’ler" satırında `Kalıcı test v1` etiketi
- `ELEMENT_UNAVAILABLE` adım satırı ve dönüştürme hata alert'i
- Final state after the happy path (geri yüklenmiş `Onaylı` element ve dönüştürülmüş suite)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
