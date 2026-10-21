# T27-ayarlar-test-verileri: Ayarlar — Test verileri ({{KEY}} ekle, gizli değer maskeleme, düzenle, sil)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/test-variables.tsx` |
| Flow | Ayarlar bölümü → "Test verileri" kartı: düz ve gizli test verisi ekleme, maskeleme, düzenleme, anahtar doğrulama, silme |
| Requires auth | yes |
| Required role | admin |
| Destructive | yes |
| Estimated steps | 40 |

## Preconditions
- App running at `http://127.0.0.1:5173`.
- `ZC_DATA_DIR` atılabilir bir kopyayı göstermeli; bu test proje test verilerini kalıcı olarak ekler/siler.
- Sign in as admin: `http://127.0.0.1:5173` aç → **"Yerel çalışma alanını aç"** → sol menüde **"Ayarlar"**.
- `QA_USER`, `QA_PASSWORD`, `QA_USER_1` anahtarlı test verisi bulunmamalı; varsa satırdaki `<KEY> sil` butonu ile sil.
- Gizli değer için `QA_TEST_SECRET_VALUE` ortam değişkeni tanımlı olmalı (tanımsızsa runner sentetik `qa-dummy-secret-{runId}` üretir). Gerçek bir parola kullanma.

## Test data
- `plainKey = "QA_USER"`, `plainValue = "qa-user-{runId}"`, `plainScope = "Tüm hedefler"`, `Gizli` = işaretsiz
- `plainValueUpdated = "qa-user-updated-{runId}"`
- `secretKey = "QA_PASSWORD"`, `secretValue = ${QA_TEST_SECRET_VALUE}`, `secretScope = "Tüm hedefler"`, `Gizli` = işaretli
- `scopedKey = "QA_USER"`, `scopedValue = "qa-user-demo-{runId}"`, `scopedScope = "http://127.0.0.1:4100"`
- `transformInput = "qa user-1"` → alan değeri `QA_USER_1` olur
- `emptyRequired = ""`
- `leadingDigit = "1ABC"`
- `leadingUnderscore = "_ABC"`
- `tooLongKey = "A" + 64 × "B"` (65 karakter)
- `tooLongValue = 501 × "x"`

## Steps

### TC-01: Happy path — Düz ve gizli test verisi ekle, maskelemeyi doğrula
1. Sign in as admin ve **"Ayarlar"** bölümünü aç.
2. Assert: eyebrow `TEST VERİLERİ`, başlık `Test verileri` görünür; boş listede `Henüz test verisi yok.` metni vardır (önceden veri yoksa).
3. Assert: **`Ekle`** butonu disabled; `Test verisi anahtarı` placeholder `SAUCE_USER`, `Test verisi değeri` placeholder `Değer`; `Test verisi kapsamı` varsayılanı `Tüm hedefler` ve seçeneklerde `http://127.0.0.1:4100` vardır.
4. Doldur: `Test verisi anahtarı` = `plainKey`, `Test verisi değeri` = `plainValue`, `Test verisi kapsamı` = `Tüm hedefler`, `Gizli` işaretsiz.
5. **`Ekle`** butonuna tıkla.
6. Assert: `role=status` = `{{QA_USER}} kaydedildi. Yayınlanmış testler referansı saklar; yeni değer sonraki çalıştırmada kullanılır.`; form sıfırlandı (anahtar ve değer boş, Gizli işaretsiz).
7. Assert: tablo başlıkları `Referans`, `Değer`, `Kapsam`; satırda `{{QA_USER}}`, `plainValue`, `Tüm hedefler` görünür.
8. Doldur: `Test verisi anahtarı` = `secretKey`; `Gizli` kutusunu işaretle.
9. Assert: `Test verisi değeri` input'unun `type` niteliği `password` oldu.
10. `Test verisi değeri` = `secretValue` yaz. **`Ekle`**'ye tıkla.
11. Assert: `role=status` = `{{QA_PASSWORD}} kaydedildi. Yayınlanmış testler referansı saklar; yeni değer sonraki çalıştırmada kullanılır.`
12. Assert: `{{QA_PASSWORD}}` satırının Değer hücresi anahtar ikonu ile `••••••` gösterir; `secretValue` sayfa metninde hiçbir yerde geçmez.
13. Assert: Ağ: `GET /api/v1/projects/<projectId>/test-variables` yanıtında `QA_PASSWORD` kaydı `secret: true, value: null`; yanıt gövdesi `secretValue` dizesini içermez. `POST` yanıtı (201) da `value: null` döner.
14. Tablo `key,origin` sırasına göre: `{{QA_PASSWORD}}` satırı `{{QA_USER}}` satırının üstündedir.
15. Sayfayı yenile, **"Ayarlar"**'a dön. Assert: iki satır da duruyor, gizli değer hâlâ `••••••`.

### TC-02: Form validation — `test-variable-form`
Her satırda formu temizle, yalnız ilgili alanı test değeriyle doldur (diğer zorunlu alan geçerli: değer = `"v"`), **`Ekle`**'ye tıkla (enabled ise) ve sonucu doğrula.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Anahtar (`Test verisi anahtarı`) = `emptyRequired` | **`Ekle`** disabled | n/a | n/a |
| Anahtar = `leadingDigit` (`1ABC`) | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| Anahtar = `leadingUnderscore` (`_ABC`) | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| Anahtar = `tooLongKey` (65 karakter) | n/a | n/a | `Alanları kontrol edin. (INVALID_INPUT)` |
| Değer (`Test verisi değeri`) = `emptyRequired`, anahtar `QA_EMPTY` | **`Ekle`** disabled | n/a | n/a |
| Değer = `tooLongValue` (501 karakter), anahtar `QA_LONG` | n/a | n/a | `Alanları kontrol edin. (INVALID_INPUT)` |
| Anahtar = `plainKey`, kapsam `Tüm hedefler` (zaten var) | n/a | `Bu kapsamda aynı anahtar zaten var. (VARIABLE_EXISTS)` | n/a |

Ek istemci dönüşümü kontrolü:
- `Test verisi anahtarı` alanına `transformInput` (`qa user-1`) yaz. Assert: alan değeri anında `QA_USER_1` olur. Değer `"v"` ile **`Ekle`** → `{{QA_USER_1}} kaydedildi. …` bildirimi; satır `{{QA_USER_1}}`.

Her hatalı gönderimden sonra: hata `role=alert` (`p.error`) "Test verileri" kartında görünür, form değerleri korunur, tablo değişmez (beklenen 400/409).

Not: Sunucunun anahtar regex mesajı `Anahtar BÜYÜK_HARF, rakam ve _ içermeli.` arayüzde görünmez; genel Zod işleyicisi `Alanları kontrol edin. (INVALID_INPUT)` döndürür. Beklenen metin budur.

### TC-03: Modal coverage — Düzenleme modu (satır içi, modal yok)
Bu kartta modal yoktur; "Düzenle" formu aynı kartta düzenleme moduna geçirir.
1. `{{QA_USER}}` (kapsam `Tüm hedefler`) satırında **`Düzenle`**'ye tıkla.
2. Assert: `Test verisi anahtarı` = `QA_USER`, `Test verisi değeri` boş ve placeholder `Değiştirmiyorsan boş bırak`; buton etiketi **`Güncelle`**; **`Vazgeç`** butonu görünür; **`Güncelle`** değer boşken de enabled.
3. **`Vazgeç`**'e tıkla. Assert: form boşaldı, buton tekrar **`Ekle`**, `Vazgeç` kayboldu, tablo değişmedi.
4. Tekrar **`Düzenle`**. `Gizli` kutusunu işaretle, değeri boş bırak, **`Güncelle`**'ye tıkla. Assert: `role=alert` = `Gizlilik değişince değeri yeniden girin. (VALUE_REQUIRED)`; satır hâlâ düz değeri gösterir.
5. `Gizli` işaretini kaldır, `Test verisi değeri` = `plainValueUpdated`, **`Güncelle`**. Assert: `{{QA_USER}} kaydedildi. …` bildirimi; satır Değer = `plainValueUpdated`; form **`Ekle`** moduna döndü.
6. `{{QA_PASSWORD}}` satırında **`Düzenle`**. Assert: `Gizli` işaretli, değer alanı boş (gizli değer tarayıcıya geri gelmez), `type=password`.
7. Değeri boş bırak, **`Güncelle`**. Assert: `{{QA_PASSWORD}} kaydedildi. …`; satır hâlâ `••••••` (saklı değer korundu; `PUT` gövdesinde `value` alanı yoktur).
8. Kapsam ile aynı anahtar: Doldur `Test verisi anahtarı` = `scopedKey`, değer = `scopedValue`, `Test verisi kapsamı` = `http://127.0.0.1:4100`, **`Ekle`**. Assert: başarı bildirimi; tabloda iki `{{QA_USER}}` satırı, biri Kapsam `Tüm hedefler`, diğeri `http://127.0.0.1:4100`.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **`Ekle`** | boş anahtar veya boş değer | disabled |
| **`Ekle`** | geçerli veri | satır eklenir, kaydedildi bildirimi |
| **`Düzenle`** | click | form düzenleme moduna geçer (TC-03) |
| **`Vazgeç`** | click | düzenleme iptal, form sıfır |
| `QA_USER_1 sil` | click → cancel confirm | Onay diyaloğu yoktur; iptal yolu mevcut değildir. Bulgu olarak raporla: tek tık kalıcı siler. |
| `QA_USER_1 sil` | click → confirm proceed | `role=status` = `{{QA_USER_1}} silindi.`; satır kalkar; `DELETE …/test-variables/<id>` 200 `{status:"deleted"}` |
| `QA_PASSWORD sil` | click | `{{QA_PASSWORD}} silindi.`; satır kalkar |
| `QA_USER sil` (her iki satır, sırayla) | click | her biri için `{{QA_USER}} silindi.`; tüm veriler silinince `Henüz test verisi yok.` görünür |

Sayfayı yenile. Assert: silinen satırlar geri gelmez.

### TC-05: Negative & edge cases
- İstek sürerken (DevTools → Slow 3G) **`Ekle`/`Güncelle`**, tüm **`Düzenle`** ve `<KEY> sil` butonları disabled olur.
- Ağ kesikken **`Ekle`** → `role=alert` = `Failed to fetch`; tablo değişmez.
- İki sekme: A'da `{{QA_USER_1}}` sil, B'de aynı satırda **`Düzenle`** → değer gir → **`Güncelle`** → B'de `Test verisi bulunamadı. (NOT_FOUND)` (beklenen 404).
- Yetkili hedef kaldırılınca (T26) o origin'e kapsamlı test verisi satırı silinmez; Kapsam hücresi origin metnini göstermeye devam eder (bilgi amaçlı gözlem; yalnız kaydet).
- DOM/Network denetimi: TC-01 sonrası tüm sayfa HTML'i ve tüm XHR yanıtları `secretValue` dizesini içermez.

## Assertions
- [ ] Kart `TEST VERİLERİ` / `Test verileri` başlığıyla ve `{{ANAHTAR}}` açıklamasıyla görünür.
- [ ] Anahtar alanı yazarken büyük harfe ve `[A-Z0-9_]` dışını `_`'ye çevirir.
- [ ] Düz veri tabloda açık değeriyle, gizli veri `••••••` ile görünür; gizli değer hiçbir API yanıtında dönmez (`value: null`).
- [ ] Gizli değer input'u `type=password` olur.
- [ ] TC-02 hata metinleri birebir eşleşir.
- [ ] Düzenlemede boş değer saklı değeri korur; gizlilik değişince değer zorunludur.
- [ ] Aynı anahtar farklı kapsamda kaydedilebilir, aynı kapsamda reddedilir.
- [ ] Silme `{{KEY}} silindi.` gösterir ve kalıcıdır.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02 400/409, TC-03 adım 4 400, TC-05 404).

## Screenshots required
- Page initial load ("Test verileri" kartı)
- Each modal opened (modal yok — düzenleme modu: TC-03 adım 2)
- Each validation error state (`INVALID_INPUT`, `VARIABLE_EXISTS`, `VALUE_REQUIRED`, disabled **`Ekle`**)
- Final state after the happy path (düz + maskeli gizli satır, TC-01 adım 15)
- Silme sonrası boş liste (`Henüz test verisi yok.`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
