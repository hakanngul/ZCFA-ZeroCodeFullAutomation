# T13-elementler-demo-bank-kayit-defteri: Demo Bank element kayıt defteri — ekle, dene, düzenle, sürüm geçmişi

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/element-registry.tsx` (bölüm: `apps/web/app/page.tsx` → `section === "elements"`) |
| Flow | Elementler bölümü → `Demo Bank WEB` kayıt defteri (`ElementRegistry`): `Element ekle` → kaydet (yeni model sürümü), `Locator’ı dene`, alternatifler, kaydedilmemiş değişiklik onayı, salt okunur eski sürüm |
| Requires auth | yes (yerel demo oturumu, kimlik bilgisi yok) |
| Required role | admin |
| Destructive | no (her kayıt yeni model sürümü yazar; önceki sürümler korunur) |
| Estimated steps | 58 |

> Statik analizden üretildi. Bu bileşen hataları `<mesaj> (<KOD>)` biçiminde (`Error:` öneki **olmadan**) `role="alert"` kutusunda gösterir.

## Preconditions
- App running at `http://127.0.0.1:5173`; API (`ZC_WEB_PORT=5173`), fixture/demo hedef (`http://127.0.0.1:4100`) ve worker ayakta (`Locator’ı dene` worker gerektirir).
- Oturum: `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**. Rol `admin` (`Yerel yönetici`).
- Seed: Demo Bank modeli onaylı — `Uygulama modeli` bölümünde keşif çalıştırılıp `Seçilen eşlemeleri onayla` yapılmış; model `v{M}` (M ≥ 1) `login.submit` elementini içerir. Model yoksa kayıt defteri `Element kütüphaneni oluştur` boş durumunu gösterir → `Keşfe git` (TC-04) dışındaki TC'ler BLOCKED-SEED.
- Paylaşılan Demo Bank elementlerini (`login.*`, `dashboard.heading`, `dashboard.balance`) **değiştirmeyin** (diğer testlerin giriş akışı bunlara bağlı); düzenlemeler yalnız bu task'ın oluşturduğu `qaKey` elementinde yapılır.
- Yakalanan değerler: `{M}` = `Model sürümü` select'indeki `Güncel · v{M}`; `{E}` = `Elementler {E}` başlığındaki sayı.

## Test data
- `qaLabel = "QA Yardım bağlantısı {runId}"`
- `qaKey = "dashboard.qa_help_{runId}"`
- `qaPage = "Dashboard"`
- `qaPrimaryKind = "Role"`, `qaPrimaryRole = "link"`, `qaPrimaryValue = "Yardım"`
- `qaAltKind = "CSS"`, `qaAltValue = "a[href=\"#help\"]"`
- `qaLabelEdited = "QA Yardım bağlantısı düzenlendi {runId}"`
- `notFoundValue = "QA-yok-{runId}"`
- `existingKey = "login.submit"` (çakışma için)
- `dupCss = "#qa-dup-{runId}"`
- `badKeyDigit = "1dashboard.help"`, `badKeySpace = "dashboard help"`, `badKeyEmpty = ""`
- `blankLabel = "   "`
- `tooLongLabel = 121 × "a"`, `tooLongKey = "k" + 120 × "a"`, `tooLongLocator = 1001 × "x"`
- `searchMiss = "zzqa-yok-{runId}"`
- `{runId}` = koşu başına 6 karakterlik küçük harf/rakam kimliği

## Steps

### TC-01: Happy path — Yeni Demo Bank elementi ekle, onayla ve kaydet
1. `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**.
2. Assert: `Demo Bank WEB` başlığı ve `Ortak element kütüphanesi · iki demo sayfası`; istatistik kartları `Merkezi element`, `Onaylı eşleme`, `Locator tanımı` (iki haneli sayılar, ör. `07`); `Elementler {E}`; `Model v{M}` etiketi; altbilgi `{E} / {E} element` ve `Alternatifler kendiliğinden devreye girmez.`
3. Assert: sağ panelde `ELEMENT AYRINTISI` ve varsayılan seçili element `login.submit` (başlık onun `Görünen ad`ı, etiket `Düzenle`).
4. **`Element ekle`** tıkla.
5. Assert: panel başlığı `Yeni element`, etiket `Yeni kayıt`, `Yeni sürüm: v{M+1}`; `Element anahtarı` boş ve düzenlenebilir (placeholder `login.submit`); **`Kaydet`** disabled.
6. Alanları bu sırayla doldur (sayfa/locator değişikliği onayı temizlediği için onay **en son** verilir):
   - `Element adı` (Görünen ad) → `qaLabel`
   - `Element anahtarı` → `qaKey`
   - `Element sayfası` → `qaPage`
   - `Birincil locator türü` → `qaPrimaryKind`; `Birincil locator ARIA role` → `qaPrimaryRole`; `Birincil locator değeri` → `qaPrimaryValue`
7. Assert: önizleme kodu `getByRole("link", { name: "Yardım", exact: true })`.
8. Alternatifler başlığındaki **`Ekle`** tıkla. `01 · CSS · Yeni alternatif` özetini aç; `Alternatif 1 türü` → `qaAltKind`, `Alternatif 1 değeri` → `qaAltValue`.
9. Assert: alternatif sayacı `1`; önizleme `locator("css=a[href=\"#help\"]")`.
10. `Bu eşlemeyi onaylıyorum` checkbox'ını işaretle. Assert: başlıkta kaydedilmemiş noktası (`title="Kaydedilmedi"`) görünür; **`Kaydet`** enabled.
11. **`Kaydet`** tıkla.
12. Assert: yeşil `role="status"` kutusu `Kaydedildi · Model v{M+1}. Önceki sürümler korundu.`; etiket `Düzenle`; `Element anahtarı` input'u readOnly; `Yeni sürüm: v{M+2}`.
13. Assert: tabloda yeni satır `qaLabel` / `qaKey` / `Dashboard`, Birincil locator sütununda `Role` etiketi + `Yardım` + `+1 alternatif`, Durum `Onaylı`; `Elementler {E+1}`; `Model v{M+1}`; sidebar `Elementler` rozeti `{E+1}`.
14. Assert: `Kullanıldığı yerler` bölümü `0 yayınlanmış test sürümü` ve `Mevcut testler sabitlenmiş model sürümünde kalır.`
15. Assert: `Model sürümü` select'inde `Güncel · v{M+1}` ve `v{M+1} · {E+1} element` seçenekleri var.
16. Sayfayı yenile → `Elementler` → `Element ara` = `qaKey`. Assert: kayıt kalıcıdır, `1 / {E+1} element`, satır `Onaylı`.
17. Satırdaki **`qaLabel ayrıntıları`** (chevron) tıkla; `Element adı` = `qaLabelEdited` → **`Kaydet`**. Assert: `Kaydedildi · Model v{M+2}. Önceki sürümler korundu.`; Durum `Onaylı` kalır (ad değişikliği onayı temizlemez).

### TC-02: Form validation — `element-registry-inspector`
Bu formda istemci doğrulaması vardır: geçersiz durumda **`Kaydet` disabled** olur ve istek gönderilmez. Her satır için **`Element ekle`** ile boş form açılır, TC-01 adım 6'daki geçerli değerler girilir, yalnız ilgili alan bozulur.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Element adı` (Görünen ad) | `blankLabel` → `Kaydet` disabled | n/a | `tooLongLabel` → input 120 karakterde kalır |
| `Element anahtarı` | `badKeyEmpty` → `Kaydet` disabled | `badKeyDigit`, `badKeySpace` → `Kaydet` disabled | `tooLongKey` → input 120 karakterde kalır |
| `Birincil locator değeri` | boş → `Kaydet` disabled **ve** `Locator’ı dene` disabled | n/a | `tooLongLocator` → input 1000 karakterde kalır |
| `Alternatif 1 değeri` | `Ekle` sonrası boş bırak → `Kaydet` disabled | n/a | n/a |
| Alternatif sayısı | n/a | n/a | 5 alternatif eklendikten sonra `Ekle` disabled (6. eklenemez) |
| Mevcut element `Kaydet` | değişiklik yokken `Kaydet` disabled | n/a | n/a |

### TC-03: Modal coverage — `window.confirm` dialogları
1. Tabloda `qaLabelEdited` satırını seç; `Element adı` alanına `QA kaydedilmemiş {runId}` yaz (kaydetme). Assert: `Kaydedilmedi` noktası görünür.
2. Tabloda başka bir satırı (ör. `login.submit`) tıkla. Assert: tarayıcı confirm dialog'u metni `Kaydedilmemiş değişiklikler var. Değişiklikleri bırakmak istiyor musun?`
3. Dialog'da **İptal** (dismiss). Assert: panel hâlâ `qaKey`'yi ve `QA kaydedilmemiş {runId}` değerini gösterir.
4. Tekrar başka satırı tıkla → dialog'da **Tamam** (accept). Assert: panel seçilen elemente geçer; `qaKey` satırının adı `qaLabelEdited` olarak kalır (değişiklik atıldı, model sürümü artmadı).
5. `qaKey`'yi seç, `Element adı`'nı yine değiştir; `Model sürümü` select'inde `v{M}` seç. Assert: dialog metni `Kaydedilmemiş değişiklikleri bırakıp sürümü değiştirmek istiyor musun?` → **İptal** → select `Güncel · v{M+2}`'de kalır.
6. Aynısını **Tamam** ile tekrarla. Assert: banner `Model v{M} inceleniyor. Bu sürüm salt okunur.`; etiket `Salt okunur`; `Model v{M} korunuyor`; tüm alanlar disabled; `Element ekle` ve `Kaydet` disabled; `qaKey` listede **yok** (v{M}'de yoktu).
7. Banner'daki **`Güncele dön`** tıkla. Assert: banner kaybolur, `qaKey` listede, select `Güncel · v{M+2}`.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Locator’ı dene` (`login.submit` seçili, mevcut locator) | click | Buton `Tarayıcıda deneniyor…` + spinner; ardından `role="status"` sonuç `1 eşleşme · Tekil öğe` ve `Öğe görünür.` + `{ms} ms · Pasif demo kontrolü` |
| `Locator’ı dene` (`qaKey`, değer `notFoundValue` — kaydetmeden) | click | `0 eşleşme · Öğe bulunamadı` + `Bu sonuçla güvenilir bir öğe seçimi yapılamaz.`; ardından `ayrıntıları` ile başka elemente geçip confirm'i kabul et (değişiklik atılır) |
| `Ekle` (alternatif) | click ×5 | Sayaç 5, `Ekle` disabled |
| Alternatif `Birincil yap` (`qaKey`) | click | Birincil ↔ alternatif yer değiştirir; `Bu eşlemeyi onaylıyorum` işareti kalkar; önceki deneme sonucu temizlenir |
| Alternatif `Kaldır` (aria-label `Alternatif 1 kaldır`) | click | Alternatif kaybolur, sayaç azalır, onay kalkar |
| `Sayfa filtresi` = `Giriş sayfası` | select | Yalnız `Giriş sayfası` satırları; altbilgi `{f} / {E+1} element` |
| `Onay filtresi` = `Onay bekliyor` | select | Yalnız `Bekliyor` satırları veya boş durum |
| `Element ara` = `searchMiss` | type | Boş durum `Eşleşen element yok` + `Arama veya filtreleri değiştirebilirsin.`; `0 / {E+1} element` |
| `Element hatasını kapat` (X) | click (TC-05 hatasından sonra) | Hata kutusu kaybolur |
| `Keşfe git` (yalnız model yoksa) | click | `Uygulama modeli` bölümüne geçer; model varsa N/A |

### TC-05: Negative & edge cases
**a) `ELEMENT_EXISTS` (409)** — `Element ekle` → geçerli değerler, ancak `Element anahtarı` = `existingKey` → **`Kaydet`**. Assert: kırmızı `role="alert"` kutusu `Bu element anahtarı zaten kullanılıyor. (ELEMENT_EXISTS)`; `Elementler` sayısı ve model sürümü değişmez.

**b) `DUPLICATE_LOCATOR` (400)** — `Element ekle` → `Element adı` = `QA Kopya locator {runId}`, `Element anahtarı` = `dashboard.qa_dup_{runId}`, `Birincil locator türü` = `CSS`, değer = `dupCss`; `Ekle` → `Alternatif 1 türü` = `CSS`, değer = `dupCss` → **`Kaydet`**. Assert: `Aynı locator bir kez tanımlanabilir. (DUPLICATE_LOCATOR)`; model sürümü değişmez.

**c) `REVISION_CONFLICT` (409, model değişti)**
1. Sekme A: `qaKey` seç, `Element adı` = `QA Sekme A {runId}` (kaydetme).
2. Sekme B: `Elementler` → `qaKey` seç → `Element adı` = `QA Sekme B {runId}` → **`Kaydet`**. Assert: `Kaydedildi · Model v{X}. Önceki sürümler korundu.`
3. Sekme A: **`Kaydet`**. Assert: `Model değişti. Güncel sürümü açıp değişikliği tekrar uygula. (REVISION_CONFLICT)`; sekme A yenilendiğinde ad `QA Sekme B {runId}`.

**d) Anahtar değiştirilemez** — mevcut `qaKey` seçiliyken `Element anahtarı` input'u readOnly'dir (yazılamaz); `ELEMENT_ID_IMMUTABLE` UI'dan tetiklenemez.

**e) Locator denemesi başarısız (koşullu)** — Worker durdurulmuşsa `Locator’ı dene` sonucu `queued`'da kalır; worker hata verirse `Locator denemesi tamamlanamadı` + kod (ör. `WORKER_ERROR`). Worker çalışıyorsa N/A.

**f) viewer rolü** — UI'dan viewer oturumu açılamaz → BLOCKED-SEED. Beklenen (kaynaktan): `canEdit=false` iken tüm alanlar, `Element ekle` ve `Kaydet` disabled.

## Assertions
- [ ] `Demo Bank WEB` kartı, istatistikler ve `Elementler {n}` sayısı model ile tutarlı; sidebar `Elementler` rozeti aynı sayıyı gösterir.
- [ ] `Kaydedildi · Model v{N}. Önceki sürümler korundu.` her kayıtta model sürümünü 1 artırır.
- [ ] Sayfa/locator/alternatif değişikliği `Bu eşlemeyi onaylıyorum` işaretini kaldırır; ad değişikliği kaldırmaz.
- [ ] Geçersiz formda `Kaydet` disabled; istek gönderilmez.
- [ ] Eski model sürümü salt okunurdur ve `Güncele dön` ile çıkılır.
- [ ] confirm dialog metinleri birebir; İptal değişikliği korur, Tamam atar.
- [ ] `ELEMENT_EXISTS`, `DUPLICATE_LOCATOR`, `REVISION_CONFLICT` hataları beklenen metinlerle ve sürüm değişmeden görünür.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05 a/b/c).

## Screenshots required
- Page initial load (Demo Bank kartı + istatistikler)
- `Yeni element` formu doldurulmuş hâli
- Each modal opened (iki `window.confirm` dialog'u)
- Each validation error state (TC-02 disabled `Kaydet` örnekleri, TC-05 a/b/c hata kutuları)
- `Locator’ı dene` sonuçları (Tekil öğe / Öğe bulunamadı)
- Salt okunur eski sürüm banner'ı
- Final state after the happy path (kayıt sonrası tablo ve başarı mesajı)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
