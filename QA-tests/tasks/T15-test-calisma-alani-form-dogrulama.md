# T15-test-calisma-alani-form-dogrulama: Form validation — test-designer (Test adı, Bakiyeyi de doğrula, Beklenen metin)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Test çalışma alanı (`section === "tests"`) — test tasarımcısı alan doğrulamaları ve yayın kenar durumları |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- `pnpm dev` çalışıyor (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker, web). Uygulama `http://127.0.0.1:5173`; web 5173'teyse `ZC_WEB_PORT=5173` ayarlı (aksi halde POST'lar `CSRF_BLOCKED`).
- `admin` rolüyle oturum aç: `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** (yerel demo oturumu, kimlik bilgisi yok).
- TC-01–TC-04 için onaylı model mevcut ve `dashboard.balance` onaylı (T14 Preconditions'daki keşif/onay adımları).
- TC-05 için ayrıca: `dashboard.balance` ONAYSIZ olan bir model (yeni keşifte yalnız 4 zorunlu öğe onaylanır) — veya temiz bir `ZC_DATA_DIR` (model yok durumu).
- Sidebar **`Testler`** → sayfa başlığı `Test çalışma alanı`; her TC başında başlıktaki **`Yeni test`** ile taslak görünümüne dön.

## Test data
- `validTitle` = `"QA Doğrulama Testi {runId}"`
- `tooShortTitle` = `"ab"` (2 karakter)
- `exactMinTitle` = `"abc"` (3 karakter, sınır)
- `whitespaceTitle` = `"     "` (5 boşluk)
- `paddedShortTitle` = `"  ab  "` (trim sonrası 2 karakter)
- `maxTitle` = 120 × `"a"`
- `tooLongTitle` = 121 × `"a"`
- `validExpected` = `"1.250,00 TL"`
- `emptyExpected` = `""`
- `whitespaceExpected` = `"   "`
- `maxExpected` = 200 × `"x"`
- `tooLongExpected` = 201 × `"x"`

## Steps

### TC-01: Happy path — Sınır değerli geçerli başlıkla yayınla
1. Sidebar **`Testler`** → **`Yeni test`**.
2. Assert: h2 `Bir iş akışı. Açık bir beklenti.`, etiket `Yeni taslak`.
3. **`Test adı`** = `exactMinTitle` (`abc`). Assert: **`Doğrula ve yayınla`** etkin.
4. **`Test adı`** = `validTitle`. **`Bakiyeyi de doğrula`** işaretle; **`Beklenen metin`** = `validExpected`.
5. **`Doğrula ve yayınla`** tıkla.
6. Assert: `Yayınlanan test`, `Sürüm 1 · Salt okunur`; `Klasik yayınlanan testler` listesinde `validTitle` / `Test v1 · Model v<N>`.

### TC-02: Form validation — `test-designer`
Bu uygulamada alan altı hata metni yoktur; istemci kuralı ihlalinde **`Doğrula ve yayınla`** `disabled` olur. Her satır için **`Yeni test`** ile taze taslak aç, alanı ayarla ve butonun durumunu doğrula.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Test adı | `""` → `Doğrula ve yayınla` disabled | `tooShortTitle`, `whitespaceTitle`, `paddedShortTitle` → disabled; `exactMinTitle` → etkin | `tooLongTitle` yapıştırılınca alan değeri 120 karakterde kesilir (`maxLength=120`); buton etkin |
| Beklenen metin (`Bakiyeyi de doğrula` işaretli) | `emptyExpected` → disabled | `whitespaceExpected` → disabled | `tooLongExpected` yapıştırılınca değer 200 karakterde kesilir (`maxLength=200`); buton etkin |
| Bakiyeyi de doğrula | n/a | n/a | n/a |

1. `Test adı` = `""`. Assert: `Doğrula ve yayınla` `disabled`; görünür hata bandı yok.
2. `Test adı` = `tooShortTitle`. Assert: `disabled`.
3. `Test adı` = `whitespaceTitle`. Assert: `disabled`.
4. `Test adı` = `paddedShortTitle`. Assert: `disabled`.
5. `Test adı`'na `tooLongTitle` yapıştır. Assert: alan değerinin uzunluğu tam 120; buton etkin. Assert: `Teknik` sekmesinde `"title"` 120 × `a`.
6. `Test adı` = `validTitle`; `Bakiyeyi de doğrula` işaretle; `Beklenen metin` = `emptyExpected`. Assert: `disabled`.
7. `Beklenen metin` = `whitespaceExpected`. Assert: `disabled`.
8. `Beklenen metin`'e `tooLongExpected` yapıştır. Assert: değer uzunluğu 200; buton etkin; İş adımları `03` başlığı `Bakiye metni “<200 × x>” olmalı`.
9. `Beklenen metin` = `""` iken `Bakiyeyi de doğrula` işaretini kaldır. Assert: `Beklenen metin` alanı kaybolur, adım `03` kaybolur, buton etkin (bakiye adımı yokken boş beklenen engel değildir).
10. Kutuyu yeniden işaretle. Assert: `Beklenen metin` alanı son girilen değeri (`""`) korur ve buton yine `disabled`.

### TC-03: Modal coverage — yok
Bu bölümde modal/dialog yoktur. Atlanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Doğrula ve yayınla` | `Test adı` < 3 karakter (trim) iken | `disabled`, ağ isteği yok |
| `Doğrula ve yayınla` | bakiye açık + `Beklenen metin` boş/boşluk | `disabled`, ağ isteği yok |
| `Doğrula ve yayınla` | geçerli değerler | `POST /api/v1/projects/<id>/tests` → 201, `Yayınlanan test` |
| `Bakiyeyi de doğrula` | toggle | `Beklenen metin` alanı ve adım `03` görünür/gizlenir |
| `Yeni taslak oluştur` | click | Taslak görünümüne dönülür; `Test adı` son taslak değerini gösterir |

### TC-05: Negative & edge cases
- **Model yok:** temiz veride sidebar `Testler`. Assert: editörde h3 `Önce uygulamanı tanıyalım`, metin `Demo sayfalarındaki öğeleri keşfet, eşlemeleri incele ve onayla.` ve **`Keşfi başlat`** butonu; `Test adı`, sekme listesi ve `Doğrula ve yayınla` render edilmez. **`Keşfi başlat`**'a tıkla. Assert: bölüm `Uygulama modeli`'ne geçer ve tarama rozeti `Sırada`/`Çalışıyor` görünür.
- **Bakiye onaysız:** `dashboard.balance` onaysız modelde Assert: `Bakiyeyi de doğrula` kutusu `disabled` ve işaretlenemez; `Beklenen metin` alanı görünmez.
- **Aynı taslağı yeniden yayınlama (olası kusur):** TC-01 sonrası **`Yeni taslak oluştur`**'a tıkla; `Test adı` ve bakiye seçimini DEĞİŞTİRMEDEN **`Doğrula ve yayınla`**'ya tıkla. Kaynağa göre beklenen: hata bandı `Yeni sürüm numarasını kullanın. (REVISION_CONFLICT)` görünür (`POST .../tests` → 409); `Klasik yayınlanan testler` sayısı değişmez; editör taslakta kalır. Bant **`Hatayı kapat`** (`×`) ile kapanır. Not: taslak `testId`'si yalnız başlık/bakiye/expected değişince yenilenir; bu davranış bulgu olarak raporlanır.
- **Yeniden yayın kurtarma:** Ardından `Test adı`'na tek karakter ekle (`validTitle + "2"`) ve **`Doğrula ve yayınla`**. Assert: 201, yeni öğe `Test v1 · Model v<N>` listede; önceki öğe değişmeden duruyor.
- **Sunucu tarafı şema:** DevTools konsolunda `fetch('/api/v1/projects/20000000-0000-4000-8000-000000000001/tests',{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify({schemaVersion:'1.0'})}).then(r=>r.json())` çalıştır. Assert: `{code:"INVALID_INPUT", message:"Alanları kontrol edin."}` ve HTTP 400 (beklenen hata).

## Assertions
- [ ] Trim sonrası < 3 karakterli `Test adı` ile `Doğrula ve yayınla` her zaman `disabled`.
- [ ] `Test adı` 120, `Beklenen metin` 200 karakterde kesilir.
- [ ] Bakiye açıkken boş/boşluk `Beklenen metin` yayını engeller; kapalıyken engellemez.
- [ ] `dashboard.balance` onaysızken `Bakiyeyi de doğrula` `disabled`.
- [ ] Model yokken yalnız `Önce uygulamanı tanıyalım` + `Keşfi başlat` görünür.
- [ ] Aynı taslağın ikinci yayını yeni kayıt üretmez; `REVISION_CONFLICT` bandı görünür.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (409 `REVISION_CONFLICT`, 400 `INVALID_INPUT`).

## Screenshots required
- Page initial load (taslak)
- Each validation error state: boş/kısa/boşluk `Test adı` ile disabled buton; boş `Beklenen metin` ile disabled buton
- `Önce uygulamanı tanıyalım` boş durumu
- `Bakiyeyi de doğrula` disabled durumu
- `REVISION_CONFLICT` hata bandı
- Final state after the happy path (`Sürüm 1 · Salt okunur`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
