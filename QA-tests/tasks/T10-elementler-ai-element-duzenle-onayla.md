# T10-elementler-ai-element-duzenle-onayla: AI kütüphane elementini adlandır, anahtar ver, onayla ve çakışma kodlarını doğrula

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-element-list.tsx`, `apps/web/app/components/ai-element-editor.tsx` (bölüm: `apps/web/app/page.tsx` → `section === "elements"`) |
| Flow | Elementler bölümü → "Web sitelerinden kaydedilen elementler": listele/filtrele, satır içi düzenle (Ad, Anahtar, Sayfa anahtarı, locator'lar), onayla, geçmiş; 409/400 çakışma kodları |
| Requires auth | yes (yerel demo oturumu, kimlik bilgisi yok) |
| Required role | admin |
| Destructive | no (element revizyonu artar; silme yok) |
| Estimated steps | 62 |

> Statik analizden üretildi (tarayıcı kullanılmadı). Tüm metinler kaynak koddan birebir alınmıştır.
> AI kütüphanesi hataları `Error: <mesaj> (<KOD>)` biçiminde `role="alert"` paragrafında gösterilir.

## Preconditions
- App running at `http://127.0.0.1:5173` (api 4000, worker ve web süreçleri ayakta). Web 5173'te çalışıyorsa API `ZC_WEB_PORT=5173` ile başlatılmış olmalı; aksi halde her POST/PUT `İstek kaynağı doğrulanamadı.` (403 `CSRF_BLOCKED`) döner ve test BLOCKED-ENV sayılır.
- Oturum: `http://127.0.0.1:5173` açılır → **`Yerel çalışma alanını aç`** tıklanır → sidebar'da **`Elementler`** tıklanır. Profil kartında `Demo QA` / `Yerel yönetici` görünür (rol `admin`).
- Seed: SauceDemo için gözlenmiş elementler mevcut (Ayarlar → Test edilecek siteler'de `https://www.saucedemo.com` izinli ve AI keşfi en az bir kez çalışmış). `https://www.saucedemo.com/` sayfa grubunda en az **3** element var; bunlardan en az biri **`Bekliyor`** durumda ve **`+N alternatif`** etiketli, en az biri **`Onaylı`**.
- Koşu kimliği: runner her koşu için `{runId}` üretir (6 karakter, küçük harf/rakam, harfle başlar; ör. `q7k2m9`).
- Çalışma sırasında yakalanan değerler (runner kaydeder): `{keyA}`/`{revA}` = hedef onaysız elementin anahtarı/sürümü; `{keyB}`/`{primaryB}` = aynı sayfadaki başka bir elementin anahtarı ve birincil locator'ı (tür + rol + değer); `{keyApproved}` = aynı sayfadaki onaylı bir elementin anahtarı.
- Tercihen "Etkilenen testler (0)" gösteren elementler seçilir (kalıcı testlere bağlı elementleri bu task'ta değiştirmeyin; o akış T12'dedir).

## Test data
- `qaName = "QA Kullanıcı adı alanı {runId}"`
- `qaKey = "home.qa_username_{runId}"`
- `qaPageKey = "login_qa"`
- `searchHit = "QA Kullanıcı adı alanı {runId}"`
- `searchMiss = "zzqa-yok-{runId}"`
- `blankName = "   "` (3 boşluk)
- `emptyValue = ""`
- `badKeyDigit = "1home.username"` (rakamla başlıyor)
- `badKeySpace = "home username"` (boşluk)
- `badKeySlash = "home/username"`
- `badPageKeyDot = "home.page"` (sayfa anahtarında nokta yasak)
- `badPageKeyDigit = "9home"`
- `tooLongName = 121 × "a"` (input `maxLength=120`)
- `tooLongKey = "k" + 120 × "a"` (121 karakter; input 120'de keser)
- `tooLongPageKey = 61 × "p"` (input `maxLength=60`)
- `tooLongLocator = 1001 × "x"` (input sınırı yok; sunucu en fazla 1000)
- `conflictName = "QA Çakışma B {runId}"`

## Steps

### TC-01: Happy path — Onaysız bir AI elementini adlandır, anahtar ver ve onayla
1. `http://127.0.0.1:5173` adresine git, **`Yerel çalışma alanını aç`** tıkla, sidebar'da **`Elementler`** tıkla.
2. Assert: H1 `Elementler`; alt metin `Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.`; breadcrumb `PROJE / WEB · CHROMIUM`; `Geliştirme sürümü` banner'ı görünür; sağ üstte `Yeni test` butonu **yok**.
3. Assert: `AI KEŞFİ` eyebrow'u ve H2 `Web sitelerinden kaydedilen elementler` görünür; filtre satırında `{p} sayfa · {n} element` (varsa ` · {f} kırılgan`) metni vardır ve `{p} ≥ 1`.
4. Assert: listedeki ilk sayfa grubu başlık butonu `aria-expanded="true"` ve tablo başlıkları `Element`, `Locator`, `Durum`, `Son gözlem` görünür.
5. `Durum` (aria-label `Kaydedilen element durumu`) seçimini **`Onay bekliyor`** yap.
6. `Sayfa` (aria-label `Kaydedilen element sayfası`) seçiminde `https://www.saucedemo.com/ (N)` seçeneğini seç.
7. Assert: görünen tüm satırlarda Durum rozeti `Bekliyor`.
8. `+N alternatif` etiketi olan ilk satırı seç; anahtarını (`code.ai-element-key`) `{keyA}`, `v{…}` değerini `{revA}` olarak kaydet. Aynı sayfadaki başka bir satırın anahtarını `{keyB}` ve Locator hücresindeki birincil locator'ını `{primaryB}` olarak kaydet.
9. **`Düzenle`** (aria-label `{keyA} düzenle`) tıkla.
10. Assert: buton metni `Kapat` olur, `aria-expanded="true"`; altında aria-label `{keyA} düzenle` olan panel açılır; panelde `Sürüm {revA}`, `Birincil locator` legend'ı, `Alternatifler ({k}/5)` (k ≥ 1) ve aria-label `Elementi birleştir` bölümü (`Birleştir` başlığı) görünür; `Etkilenen testler (0)` ve `Bu elementin eski sürümünü kullanan kalıcı test yok.` görünür.
11. Alanları doldur:
    - `Element adı` → `qaName`
    - `Element anahtarı` → `qaKey`
    - `Sayfa anahtarı` → `qaPageKey`
    - `Elementi onayla` checkbox → işaretli
12. Assert: `Locator değişti: kaydedince onay kaldırılır, sonra tekrar onaylayın.` uyarısı **görünmez** (locator değişmedi).
13. **`Kaydet`** tıkla.
14. Assert: buton kısa süre `Kaydediliyor…` metniyle disabled olur; ardından `role="status"` paragrafında `Kaydedildi (sürüm {revA+1}).` görünür; panelde `Sürüm {revA+1}`.
15. Assert: tablodaki satırda anahtar `qaKey`, ad `qaName`, Durum rozeti `Onaylı`, altında `v{revA+1}`.
16. Assert: `Element anahtarı` input'u **disabled** ve `title="Onaylı elementin anahtarı değiştirilemez."`.
17. `Geçmiş (…)` özetini tıklayıp aç. Assert: en üst satır `v{revA+1} Onaylandı · <tarih> · home.qa_username_{runId} · QA Kullanıcı adı alanı {runId} · <locator> · onaylı`; altında `v{revA} Keşifte gözlendi` satırı vardır.
18. Sayfayı yenile (F5). `Elementler` bölümüne dön. `Durum` = `Onaylı`, arama kutusuna (aria-label `Kaydedilen element ara`) `searchHit` yaz, 1 sn bekle.
19. Assert: kayıt kalıcıdır — tek eşleşen satır `qaName`, anahtar `qaKey`, rozet `Onaylı`, `v{revA+1}`.

### TC-02: Form validation — `ai-element-editor`
Hazırlık: TC-01'den bağımsız, **onaysız** başka bir element seç (Durum = `Onay bekliyor`), anahtarını `{keyV}`, sürümünü `{revV}` kaydet, `Düzenle` ile aç. Her satır için: yalnız ilgili alanı değiştir → **`Kaydet`** → assert → **`Kapat`** ile paneli kapatıp yeniden `Düzenle` ile aç (form orijinal değerlere döner). Her hatadan sonra Assert: panel `Sürüm {revV}` göstermeye devam eder ve tablodaki satır değişmez.

Bu editörde istemci tarafı doğrulama yoktur; tüm ihlaller sunucudan `Error: Alanları kontrol edin. (INVALID_INPUT)` (HTTP 400) olarak `role="alert"` paragrafında görünür.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Element adı` | `blankName` → `Error: Alanları kontrol edin. (INVALID_INPUT)` | n/a | `tooLongName` yazılır → input değeri tam **120** karakterde kalır (121. karakter girilmez); hata yok |
| `Element anahtarı` | `emptyValue` → `Error: Alanları kontrol edin. (INVALID_INPUT)` | `badKeyDigit`, `badKeySpace`, `badKeySlash` → her biri `Error: Alanları kontrol edin. (INVALID_INPUT)` | `tooLongKey` → input değeri **120** karakterde kalır |
| `Sayfa anahtarı` | `emptyValue` → `Error: Alanları kontrol edin. (INVALID_INPUT)` | `badPageKeyDot`, `badPageKeyDigit` → her biri `Error: Alanları kontrol edin. (INVALID_INPUT)` | `tooLongPageKey` → input değeri **60** karakterde kalır |
| `Birincil locator değeri` | `emptyValue` → uyarı `Locator değişti: kaydedince onay kaldırılır, sonra tekrar onaylayın.` görünür, sonra Kaydet → `Error: Alanları kontrol edin. (INVALID_INPUT)` | n/a | `tooLongLocator` (1001) → `Error: Alanları kontrol edin. (INVALID_INPUT)` (input kesmez) |
| `Birincil locator türü` = `role` | `Rol` select'i görünür ve varsayılan seçili değer elementin rolü ya da `button` olur | n/a | n/a |

### TC-03: Modal coverage — satır içi düzenleme paneli (`ai-element-editor`)
Bu bölümde modal/dialog yoktur; eşdeğer etkileşim satır içi paneldir.
1. `{keyA}` satırında **`Kapat`** (satır butonu) tıkla. Assert: panel kaybolur, buton metni `Düzenle`, `aria-expanded="false"`.
2. **`Düzenle`** ile yeniden aç. `Element adı` alanına `QA İptal {runId}` yaz; **kaydetmeden** panelin altındaki **`Kapat`** butonunu tıkla.
3. Assert: panel kapanır; satırdaki ad hâlâ `qaName`, `v{revA+1}` değişmemiştir (ağ sekmesinde PUT isteği yok).
4. Yeniden **`Düzenle`**. Assert: `Element adı` = `qaName` (iptal edilen metin yok).
5. Geçersiz giriş: `Sayfa anahtarı` = `badPageKeyDot` → **`Kaydet`**. Assert: hata panelin içinde `Error: Alanları kontrol edin. (INVALID_INPUT)` olarak görünür.
6. Geçerli giriş: `Sayfa anahtarı` = `qaPageKey` → **`Kaydet`**. Assert: değer değişmediyse sürüm artmaz ve `Kaydedildi (sürüm {revA+1}).` görünür (sunucu `changed:false` döner); hata paragrafı kaybolur.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| Sayfa grubu başlığı (`▾ /` `www.saucedemo.com` `{n} element · {a} onaylı`) | click | Grup kapanır (`▸`, `aria-expanded="false"`, tablo gizlenir); ikinci click yeniden açar |
| `Daha fazla göster ({x} kaldı)` (yalnız gruptaki element sayısı > 20 ise) | click | `Yükleniyor…` görünür, ardından satır sayısı en fazla 20 artar; sayaç azalır veya buton kaybolur. Grup ≤ 20 ise buton yoktur (N/A) |
| `Düzenle` / `Kapat` (satır) | click | Panel açılır / kapanır; aynı anda yalnız bir panel açıktır (başka satırın `Düzenle`'si öncekini kapatır) |
| Alternatif satırındaki `Birincil yap` | click (kaydetmeden) | Seçilen alternatif `Değer` alanına geçer, eski birincil alternatif listesine girer; `Elementi onayla` işareti kalkar; locator uyarısı görünür |
| Alternatif satırındaki `Kaldır` | click (kaydetmeden) | Alternatif listeden çıkar, sayaç `Alternatifler ({k-1}/5)`; onay işareti kalkar; uyarı görünür. Ardından panel `Kapat` → değişiklik atılır |
| `Kaydet` | click | Kayıt sürerken `Kaydediliyor…` ve disabled; bitince `Kaydet` |
| `Alternatif olarak ekle` | TC-06'da | — |

### TC-05: Negative & edge cases — API çakışma kodları
**a) `REVISION_CONFLICT` (409, eski `expectedRevision`)**
1. Sekme A: `{keyV}` (onaysız) için `Düzenle` aç; `Element adı` = `QA Çakışma A {runId}` yaz, **kaydetme**.
2. Sekme B (yeni sekme, aynı URL, aynı oturum): `Elementler` → `{keyV}` `Düzenle` → `Element adı` = `conflictName` → **`Kaydet`**. Assert: `Kaydedildi (sürüm {revV+1}).`
3. Sekme A: **`Kaydet`**.
4. Assert: `role="alert"` = `Element bu arada değişti. Güncel sürüm yüklendi; değişikliği tekrar uygula.`; `Element adı` alanı `conflictName` değerine yenilenir; panel `Sürüm {revV+1}`; satır adı `conflictName`.

**b) `DUPLICATE_LOCATOR` (400)**
1. `{keyV}` panelinde (en az bir alternatifi olmalı) `Birincil locator türü` ve (rol ise) `Birincil locator rolü` ile `Birincil locator değeri` alanlarını **1. alternatifin** türü/rolü/değeriyle birebir aynı yap (alternatif listesi değişmeden kalır).
2. **`Kaydet`**. Assert: `Error: Aynı locator bir kez tanımlanabilir. (DUPLICATE_LOCATOR)`; sürüm değişmez. `Kapat` ile at.

**c) `ELEMENT_KEY_EXISTS` (409)**
1. `{keyV}` panelinde `Element anahtarı` = `{keyB}` (aynı sitedeki başka elementin anahtarı) → **`Kaydet`**.
2. Assert: `Error: Bu element anahtarı bu sitede zaten kullanılıyor. (ELEMENT_KEY_EXISTS)`; sürüm değişmez. `Kapat`.

**d) `LOCATOR_IN_USE` (409)**
1. `{keyV}` panelinde birincil locator türü/rolü/değerini `{primaryB}` ile aynı yap (`{primaryB}`, `{keyV}`'nin alternatiflerinde olmamalı; aksi halde (b) tetiklenir — başka bir `{keyB}` seç).
2. **`Kaydet`**. Assert: `Error: Bu birincil locator aynı sayfada başka bir elemente ait. (LOCATOR_IN_USE)`; sürüm değişmez. `Kapat`.

**e) `ELEMENT_KEY_LOCKED` (409, onaylı anahtar kilidi)**
1. UI: `{keyApproved}` (veya TC-01 sonrası `qaKey`) panelini aç. Assert: `Element anahtarı` input'u disabled, `title="Onaylı elementin anahtarı değiştirilemez."` — UI bu kodu tetiklemeye izin vermez.
2. API: aynı sekmede DevTools Console'da çalıştır (`{keyApproved}` yerine gerçek anahtarı yaz):
   ```js
   const p='/api/v1/projects/20000000-0000-4000-8000-000000000001/ai/elements';
   const e=(await (await fetch(`${p}?limit=500`)).json()).elements.find(x=>x.elementKey==='{keyApproved}');
   const r=await fetch(`${p}/${e.id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify({expectedRevision:e.revision,elementKey:e.elementKey+'_locked',name:e.name,pageKey:e.pageKey,locator:e.locator,alternatives:e.alternatives,approved:true})});
   console.log(r.status, await r.json());
   ```
3. Assert: konsolda `409` ve `{code:"ELEMENT_KEY_LOCKED", message:"Onaylı elementin anahtarı değiştirilemez; önce onayı kaldırın."}`; sayfayı yenileyince anahtar ve sürüm değişmemiştir.

**f) Diğer kenar durumlar**
- Arama kutusuna `searchMiss` yaz. Assert: 250 ms sonra `Aramayla eşleşen element yok.`; sayfa grubu kalmaz. Kutuyu temizle → gruplar geri gelir.
- `Durum` = `Onaylı`: tüm rozetler `Onaylı`; `Durum` = `Tümü`: toplam `{n}` eski değerine döner.
- Kırılgan locator (varsa `kırılgan` rozeti): rozetin `title` değeri `Sıra numarasına bağlı CSS; sayfa düzeni değişince kırılabilir.`; bu satırlar grubun en altında listelenir (sunucu `ORDER BY` kırılgan bayrağı artan, sonra `last_seen_at` azalan). Yoksa N/A.
- `viewer` rolü: UI'dan viewer oturumu açılamaz (yerel oturum her zaman `admin`) → BLOCKED-SEED. Bilinen risk: editör `canEdit` almadığından viewer için `Kaydet` aktif kalır; sunucu `Error: Düzenleme yetkisi gerekli. (FORBIDDEN)` döner.

### TC-06: Locator değişikliği onayı kaldırır; önerilen alternatifi ekle
1. `qaKey` panelini aç (onaylı). Bir alternatifin **`Birincil yap`** butonunu tıkla.
2. Assert: `Elementi onayla` işareti kalkar; `Locator değişti: kaydedince onay kaldırılır, sonra tekrar onaylayın.` görünür; `Önerilen alternatifler` listesi varsa `Alternatif olarak ekle` butonları disabled.
3. **`Kaydet`**. Assert: `Kaydedildi (sürüm {revA+2}). Locator değiştiği için onay kaldırıldı.`; satır rozeti `Bekliyor`; `Element anahtarı` input'u yeniden düzenlenebilir; Geçmiş en üstte `v{revA+2} Locator değişti (onay kaldırıldı)`.
4. `Elementi onayla` işaretle → **`Kaydet`**. Assert: `Kaydedildi (sürüm {revA+3}).`; rozet `Onaylı`.
5. Önerilen alternatif (koşullu — Locator hücresinde `{s} öneri` rozeti olan onaylı bir element varsa; yoksa N/A): o elementin panelini aç. Assert: panelin üstünde `{s} önerilen alternatif` rozeti ve `Önerilen alternatifler ({s})` + `Onaylı element yeniden gözlenirken bulundu; eklenene kadar kullanılmaz.` görünür.
6. İlk önerinin **`Alternatif olarak ekle`** butonunu tıkla. Assert: `Alternatif eklendi (sürüm {r+1}). Birincil locator değişmediği için onay korundu.`; `Alternatifler ({k+1}/5)` listesinde eklenen locator var; öneri sayısı 1 azalır; rozet `Onaylı` kalır; Geçmiş en üstte `Önerilen alternatif eklendi`.
7. Alternatifler zaten `5/5` iken ekleme (koşullu): Assert `Error: En fazla 5 alternatif tanımlanabilir. (TOO_MANY_ALTERNATIVES)`.

## Assertions
- [ ] H1 `Elementler`, alt başlık `Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.` ve sidebar `Elementler` butonu `active`.
- [ ] Sidebar `Elementler` rozet sayısı Demo Bank model element sayısına eşittir (AI kütüphanesi sayısı değil).
- [ ] `{p} sayfa · {n} element` toplam satırı filtrelere göre güncellenir.
- [ ] Onaylı kayıt: rozet `Onaylı`, `v{N}` artar, anahtar input'u disabled + title.
- [ ] `Kaydedildi (sürüm N).` / `Kaydedildi (sürüm N). Locator değiştiği için onay kaldırıldı.` mesajları birebir.
- [ ] Geçmiş satırları `Keşifte gözlendi`, `Onaylandı`, `Locator değişti (onay kaldırıldı)`, `Önerilen alternatif eklendi` eylem adlarını kullanır.
- [ ] Çakışma kodları: `REVISION_CONFLICT`, `DUPLICATE_LOCATOR`, `ELEMENT_KEY_EXISTS`, `LOCATOR_IN_USE`, `ELEMENT_KEY_LOCKED`, `INVALID_INPUT` beklenen metinlerle görünür ve sürümü değiştirmez.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02 400, TC-05 400/409, TC-06 adım 7 409).

## Screenshots required
- Page initial load (Elementler bölümü, AI kartı ve ilk grup açık)
- Satır içi panel açık (`{keyA} düzenle`)
- Each validation error state (TC-02 her satır; TC-05 a–e)
- `Kaydedildi (sürüm …)` mesajı ve `Onaylı` rozetli satır
- Açık `Geçmiş` listesi
- Final state after the happy path (yenileme sonrası arama sonucu)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
