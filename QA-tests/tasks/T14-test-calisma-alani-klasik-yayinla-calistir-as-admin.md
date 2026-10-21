# T14-test-calisma-alani-klasik-yayinla-calistir-as-admin: Klasik testi tasarla, yayınla ve Sağlam uygulamada çalıştır (admin)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Test çalışma alanı (`section === "tests"`) — klasik test tasarımı → üç görünüm → yayın → çalıştırma |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 34 |

## Preconditions
- `pnpm dev` çalışıyor: API (4000), demo hedef / Demo Bank fixture (`http://127.0.0.1:4100`), worker ve web. Uygulama `http://127.0.0.1:5173` adresinde açılıyor. Web 5173 portundaysa API'nin yazma isteklerini kabul etmesi için `ZC_WEB_PORT=5173` ayarlı olmalı (aksi halde POST'lar `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` döner).
- Oturum: `admin` rolüyle oturum aç — `http://127.0.0.1:5173` adresini aç, **`Yerel çalışma alanını aç`** butonuna tıkla (yerel demo oturumu, kimlik bilgisi yok; actor rolü `admin`, profil kartında `Demo QA` / `Yerel yönetici`).
- Onaylı uygulama modeli mevcut ve `dashboard.balance` onaylı. Yoksa: sidebar **`Uygulama modeli`** → **`Keşfi başlat`** → tarama `Onay bekliyor` olunca `login.username`, `login.password`, `login.submit`, `dashboard.heading`, `dashboard.balance` kutularını işaretle → **`Seçilen eşlemeleri onayla`**.
- Sidebar **`Testler`** butonuna tıkla (sayfa başlığı `Test çalışma alanı`) veya başlıktaki **`Yeni test`** butonunu kullan.

## Test data
- `runId` = koşu başına benzersiz kısa kimlik (ör. zaman damgası `20261021T1030`)
- `title` = `"QA Klasik Bakiye Testi {runId}"`
- `Bakiyeyi de doğrula` = işaretli
- `expected` (Beklenen metin) = `"1.250,00 TL"`
- `Demo kontrolü` = `Sağlam uygulama` (değer `healthy`)

## Steps

### TC-01: Happy path — Bakiye doğrulamalı klasik test oluştur, yayınla ve çalıştır
1. `admin` olarak oturum aç (Preconditions) ve sidebar **`Testler`** butonuna tıkla.
2. Assert: h1 `Test çalışma alanı`, breadcrumb `PROJE / WEB · CHROMIUM`, alt metin `Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur.`
3. Assert: editör kartında eyebrow `TEST TASARIMCISI`, h2 `Bir iş akışı. Açık bir beklenti.`, etiket `Yeni taslak`; `Onaylı model` yanında `v<N>` (N ≥ 1) görünür.
4. Assert: **`Test adı`** alanı varsayılan `Geçerli müşteri dashboard’a ulaşır` değerini taşır.
5. Assert: `role="tablist"` ve `aria-label="Test görünümü"` olan sekme listesi `İş adımları`, `Akış`, `Teknik` sekmelerini ve `Tek model · üç görünüm` metnini gösterir; `İş adımları` `aria-selected="true"`.
6. Assert: İş adımları görünümünde adım `01` `Geçerli demo hesabıyla giriş yap` (tip `YENİDEN KULLANILABİLİR AKIŞ`, açıklama `Giriş sayfasını aç → bilgileri gir → giriş yap`, etiket `Login v<N>`), adım `02` `Dashboard görünür olmalı` (tip `BEKLENEN SONUÇ`, etiket `Açık doğrulama`).
7. **`Test adı`** alanını temizle ve `title` değerini yaz.
8. **`Bakiyeyi de doğrula`** kutusunu işaretle.
9. Assert: **`Beklenen metin`** alanı görünür ve değeri `1.250,00 TL`; alanı temizleyip `expected` = `1.250,00 TL` yaz.
10. Assert: adım `03` `Bakiye metni “1.250,00 TL” olmalı` (açıklama `Gözlenen metin, tanımladığın beklentiyle tam eşleşmeli.`) görünür.
11. **`Akış`** sekmesine tıkla. Assert: sekme `aria-selected="true"`; düğümler sırasıyla `Giriş sayfasını aç`, `Demo bilgilerini gir`, `Giriş yap`, `Dashboard görünür olmalı`, `Bakiye metni “1.250,00 TL” olmalı`.
12. **`Teknik`** sekmesine tıkla. Assert: `CanonicalTest · schemaVersion 1.0` başlığı ve `<pre>` JSON görünür; JSON `"schemaVersion": "1.0"`, `"revision": 1`, `"title": "<title>"`, `"maxDurationMs": 15000`, `"onStepError": "stop"`, `"assertion": "elementText"` ve `"expected": "1.250,00 TL"` içerir.
13. **`İş adımları`** sekmesine geri dön.
14. Assert: `Beklenen sonuçlar otomatik değiştirilmez.` metni görünür ve **`Doğrula ve yayınla`** etkin.
15. **`Doğrula ve yayınla`** butonuna tıkla.
16. Assert: h2 `Yayınlanan test`, etiket `Sürüm 1 · Salt okunur`; `Test adı` alanı `readonly` ve değeri `title`; `Bakiyeyi de doğrula` kutusu artık görünmez; footer butonu **`Testi çalıştır`**.
17. Assert: `Klasik yayınlanan testler` kartında sayı etiketi 1 arttı; listenin en üstünde `title` başlıklı öğe ve alt satırı `Test v1 · Model v<N>`; öğe `selected-test` sınıfı ile seçili; altında **`Yeni taslak oluştur`** butonu görünür.
18. Assert: ana hata bandı (`role="alert"`, `.error-banner`) görünmüyor.
19. `Çalıştırma ortamı` kartında Assert: `Demo kontrolü` seçeneği `Sağlam uygulama`; `Tarayıcı` → `Chromium`, `Yürütme` → `Ayrı worker`, `Kanıt` → `Ekran görüntüsü`.
20. **`Testi çalıştır`** butonuna tıkla.
21. Assert: bölüm `Çalıştırmalar ve kanıtlar` başlığına geçer; `Çalıştırma geçmişi` tablosunun ilk satırı `title`, `v1 · <8 karakter id>`, `Demo kontrolü` sütunu `Sağlam uygulama`.
22. Assert: `Beklenen sonuç ve gözlenen kanıt` kartı açılır; durum `Sırada`/`Çalışıyor` iken `Worker sonucu bekleniyor. Bu aşamada başarı varsayılmaz.` metni görünür.
23. En fazla 30 sn bekle. Assert: durum rozeti `Başarılı`.
24. Assert: `run-meta` satırı `Test v1`, `Model v<N>`, `2 assertion yürütüldü`, `SHA-256 <12 hex>…` gösterir.
25. Assert: adımlar `Giriş sayfasını aç`, `Demo kullanıcısını gir`, `Demo parolasını gir`, `Giriş yap`, `Dashboard`, `Bakiye` — hepsi yeşil onay ikonlu; `Dashboard` için `Beklenen: true · Gözlenen: true`; `Bakiye` için `Beklenen: 1.250,00 TL · Gözlenen: 1.250,00 TL`.
26. Assert: kanıt alanında `alt="Gerçek test tarayıcısının son ekran görüntüsü"` görseli yüklenir (HTTP 200, `image/png`) ve `SHA-256 doğrulamalı · Form alanları maskeli` metni görünür.
27. Sayfayı yenile (F5). Gerekirse oturum çerezi ile çalışma alanı doğrudan açılır.
28. Sidebar **`Testler`**'e tıkla. Assert: `Klasik yayınlanan testler` listesinde `title` / `Test v1 · Model v<N>` hâlâ mevcut.
29. Listedeki `title` öğesine tıkla. Assert: h2 `Yayınlanan test`, `Sürüm 1 · Salt okunur`, İş adımları `03` `Bakiye metni “1.250,00 TL” olmalı` içerir.

### TC-02: Form validation — `test-designer`
Bu görevde yalnız happy-path ön koşulu doğrulanır; tam doğrulama matrisi T15'tedir.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Test adı | `Doğrula ve yayınla` disabled (görünür metin yok) | n/a | `maxLength=120` (T15) |
| Beklenen metin | `Doğrula ve yayınla` disabled (görünür metin yok) | n/a | `maxLength=200` (T15) |

1. TC-01 adım 7'den önce `Test adı` alanını boşalt. Assert: **`Doğrula ve yayınla`** `disabled`. `title` değerini geri yaz. Assert: buton etkin.

### TC-03: Modal coverage — yok
Bu bölümde modal/dialog yoktur (statik analiz: `modals: []`). Atlanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `İş adımları` / `Akış` / `Teknik` | click | İlgili görünüm render edilir, tıklanan sekme `aria-selected="true"`, diğerleri `false` |
| `Doğrula ve yayınla` | click | `Yayınlanan test`, `Sürüm 1 · Salt okunur`, listeye yeni öğe |
| `Testi çalıştır` | click | `Çalıştırmalar ve kanıtlar` bölümüne geçiş, yeni çalıştırma `Sırada` → `Başarılı` |
| Klasik test öğesi | click | Öğe `selected-test`, editör salt okunur yayın görünümüne geçer |
| `Yeni taslak oluştur` | click | h2 `Bir iş akışı. Açık bir beklenti.`, etiket `Yeni taslak`, `Doğrula ve yayınla` görünür |
| `Yeni test` (başlık) | click | Yayın seçimi temizlenir, taslak görünümü açılır |

### TC-05: Negative & edge cases
- Yayınlanmış test açıkken `Test adı` alanına yazmayı dene. Assert: değer değişmez (`readonly`).
- Yayın görünümünde `Teknik` sekmesi. Assert: JSON `"revision": 1` ve sunucunun döndürdüğü `testId` ile, listedeki öğe ile aynı.
- `Testi çalıştır`'a art arda iki kez hızlı tıkla. Assert: buton ilk tıklamada `busy` ile `disabled` olur ve bölüm `Çalıştırmalar ve kanıtlar`'a geçer; `Çalıştırma geçmişi`'nde bu tıklama için yalnız 1 yeni satır oluşur.

## Assertions
- [ ] Sidebar `Testler` → h1 `Test çalışma alanı`, breadcrumb `PROJE / WEB · CHROMIUM`.
- [ ] Taslak: `TEST TASARIMCISI`, `Bir iş akışı. Açık bir beklenti.`, `Yeni taslak`, `Onaylı model v<N>`.
- [ ] Üç sekme (`İş adımları`, `Akış`, `Teknik`) aynı modeli gösterir; bakiye adımı üç görünümde de var.
- [ ] Yayın sonrası `Yayınlanan test` + `Sürüm 1 · Salt okunur` + `Testi çalıştır`.
- [ ] `Klasik yayınlanan testler`'de `title` / `Test v1 · Model v<N>`; yenilemeden sonra da mevcut.
- [ ] Çalıştırma `Sağlam uygulama` ile `Başarılı`, `2 assertion yürütüldü`, ekran görüntüsü kanıtı mevcut.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (`Test çalışma alanı`, taslak görünümü)
- `İş adımları`, `Akış`, `Teknik` sekmelerinin her biri (bakiye adımı eklenmiş)
- `Doğrula ve yayınla` disabled durumu (boş `Test adı`)
- Yayın sonrası `Sürüm 1 · Salt okunur` görünümü
- Final state after the happy path: `Başarılı` çalıştırma ayrıntısı ve ekran görüntüsü kanıtı

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
