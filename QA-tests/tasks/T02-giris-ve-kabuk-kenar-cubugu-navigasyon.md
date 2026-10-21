# T02-giris-ve-kabuk-kenar-cubugu-navigasyon: Kenar çubuğu navigasyonu, bölüm başlıkları, sayaçlar ve "Yeni test"

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Kabuk (tüm bölümler) — Kenar çubuğu ile 7 bölüm arasında geçiş, başlık/açıklama/sayaç/banner doğrulama, "Yeni test" kısayolu |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT` ile bu portu kabul edecek şekilde başlatılmış).
- Sign in as admin: yeni context'te `/` aç, karşılama ekranında **"Yerel çalışma alanını aç"** butonuna tıkla; kabuk açılmış ve `Genel bakış` aktif olmalı. Kimlik bilgisi kullanılmaz.
- Seed verisi gerekmez. Sayaçlar mevcut veriye bağlıdır; beklenen değerler her koşuda `GET /api/v1/projects/<projectId>` yanıtından hesaplanır.

## Test data
Form alanı yoktur. Beklenen sabitler (kaynaktan birebir):

| Sıra | Buton etiketi | section id | h1 | Açıklama (p) | Sayaç rozeti | "Yeni test" | Prototip bandı |
|---|---|---|---|---|---|---|---|
| 1 | `Genel bakış` | overview | `Her testin arkasında bir kanıt.` | `İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele.` | yok | görünür | görünür |
| 2 | `AI Test Assistant` | assistant | `AI Test Assistant` | `İzinli hedefi incele, senaryoları gözden geçir ve suite çalıştır.` | yok | yok | yok |
| 3 | `Uygulama modeli` | model | `Uygulama modeli` | `Keşif önerilerini incele. Onayladığın öğeler sürümlü modelin parçası olsun.` | `model.elements` içinde `approved=true` sayısı; `model=null` ise rozet yok | yok | görünür |
| 4 | `Elementler` | elements | `Elementler` | `Ortak elementleri, locator’larını ve sürümlerini tek yerden yönet.` | `model.elements.length`; `model=null` ise rozet yok | yok | görünür |
| 5 | `Testler` | tests | `Test çalışma alanı` | `Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur.` | `tests.length + aiSuiteCount` | görünür | görünür |
| 6 | `Çalıştırmalar` | runs | `Çalıştırmalar ve kanıtlar` | `Gerçek tarayıcı sonuçlarını, doğrulamaları ve kanıtları bir arada gör.` | `runs.length + aiTestRunCounts.total` | görünür | görünür |
| 7 | `Ayarlar` | settings | `Ayarlar` | `Test hedeflerini, AI sağlayıcılarını ve modelleri yönet.` | yok | yok | yok |

- `breadcrumb = "PROJE / WEB · CHROMIUM"` (tüm bölümlerde aynı)
- `prototypeBannerText = "Geliştirme sürümü Klasik testler yerel Demo Bank üzerinde çalışır; AI suite’ler yalnız yapılandırılmış izinli hedeflere gider."`
- `navLabel = "ÇALIŞMA ALANI"`, `workspacePicker = "Geliştirme alanı" / "Yerel prototip"`, `sidebarNote = "Kontrol sende."`, `"Güvenli demo modu"`

## Steps

### TC-01: Happy path — Kenar çubuğuyla tüm bölümleri gez
1. Navigate to `http://127.0.0.1:5173/` (Preconditions'taki girişle kabuk açık).
2. Assert: `aside.sidebar nav` içinde tam 7 buton vardır ve etiket sırası `Genel bakış`, `AI Test Assistant`, `Uygulama modeli`, `Elementler`, `Testler`, `Çalıştırmalar`, `Ayarlar`'dır.
3. Assert: kenar çubuğunda `ÇALIŞMA ALANI` etiketi, `Geliştirme alanı` / `Yerel prototip` çalışma alanı kartı, `Kontrol sende.` notu ve `Güvenli demo modu` metni görünür.
4. Assert: `Genel bakış` butonu `active` class'ına sahip, diğer 6 buton değil.
5. Test data tablosundaki her satır için sırayla (1→7):
   1. Kenar çubuğunda o satırın **buton etiketine** tıkla.
   2. Assert: tıklanan buton `active`, diğer tüm nav butonları `active` değil.
   3. Assert: `.page-heading h1` ve `.page-heading p` metinleri tablodaki değerlerle birebir eşleşir.
   4. Assert: breadcrumb `PROJE / WEB · CHROMIUM`.
   5. Assert: **`Yeni test`** butonunun görünürlüğü tablodaki "Yeni test" sütunu ile eşleşir.
   6. Assert: `.prototype-banner` görünürlüğü tablodaki "Prototip bandı" sütunu ile eşleşir; görünürse metni `prototypeBannerText` ile eşleşir.
   7. Assert: URL `http://127.0.0.1:5173/` olarak kalır (bölüm geçişi URL değiştirmez).
6. Son olarak **`Genel bakış`**'a tıkla. Assert: h1 `Her testin arkasında bir kanıt.`.

### TC-02: Sayaç rozetleri API verisiyle eşleşir
1. `GET /api/v1/projects/<projectId>` yanıtını (TC-01 sırasında yakalanan son polling yanıtı) al.
2. Hesapla: `modelCount = model ? model.elements.filter(e => e.approved).length : yok`, `elementsCount = model ? model.elements.length : yok`, `testsCount = tests.length + aiSuiteCount`, `runsCount = runs.length + aiTestRunCounts.total`.
3. Assert: `Uygulama modeli` butonundaki `<span>` rozeti `modelCount` gösterir (model yoksa rozet `<span>` hiç yoktur).
4. Assert: `Elementler` rozeti `elementsCount` gösterir (model yoksa rozet yok).
5. Assert: `Testler` rozeti `testsCount` gösterir (değer `0` ise `0` rozeti görünür).
6. Assert: `Çalıştırmalar` rozeti `runsCount` gösterir (değer `0` ise `0` rozeti görünür).
7. Assert: `Genel bakış`, `AI Test Assistant`, `Ayarlar` butonlarında sayaç rozeti yoktur.
8. 3 saniye bekle (≥ 2 polling döngüsü, 1500 ms aralık). Assert: `GET /api/v1/projects/<projectId>` en az 2 kez daha çağrılmış ve her biri 200 dönmüştür; rozetler son yanıtla tutarlıdır.

### TC-03: Modal coverage
Bu bölümde modal yoktur. n/a.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeni test` (Genel bakış'ta) | click | aktif bölüm `Testler`, h1 `Test çalışma alanı`, `Yeni test` görünür kalır |
| `Yeni test` (Çalıştırmalar'da) | `Çalıştırmalar`'a git → click | aktif bölüm `Testler`, h1 `Test çalışma alanı` |
| `Yeni test` (Testler'de) | click | `Testler` aktif kalır, h1 `Test çalışma alanı`; sayfada `Yayınlanan test` başlıklı tasarımcı kartı görünmez (published sıfırlanır); hata bandı yok |
| `Yeni test` (Uygulama modeli / Elementler / AI Test Assistant / Ayarlar) | bölüme git | buton DOM'da yoktur |
| Marka linki `ZeroCode ana sayfa` | `Ayarlar` aktifken click | sayfa yeniden yüklenir, aktif bölüm `Genel bakış` |
| Her nav butonu | aynı butona art arda 2 kez click | bölüm değişmez, hata bandı oluşmaz, ağ isteği tetiklenmez (polling hariç) |

### TC-05: Negative & edge cases
- a) Bölüm durumu URL'de tutulmaz: `Çalıştırmalar`'a git, sayfayı yenile. Assert: aktif bölüm `Genel bakış` olur (beklenen davranış; tasarım gereği hash/query yok).
- b) Klavye erişimi: `Tab` ile nav butonları arasında gez, `Testler` odaklıyken `Enter` bas. Assert: `Testler` aktif, h1 `Test çalışma alanı`. Not: aktif buton için `aria-current` yoktur; bu bir erişilebilirlik bulgusu olarak rapora yazılır, testi düşürmez.
- c) Viewer rolü (koşullu): `QA-tests/.qa-catalog/auth.local.json` bir `viewer` oturumu sağlıyorsa onunla gir. Assert: 7 nav butonu ve başlıklar aynı; profil butonu yine `Yerel yönetici` gösterir (kaynakta sabit metin — bulgu olarak raporla). Sağlamıyorsa "n/a — viewer oturumu UI'dan üretilemez (`/v1/session/local` her zaman admin)" olarak işaretle.
- d) Dar görünüm: viewport 1024×768 ve 1440×900'de TC-01 adım 2-4'ü tekrarla. Assert: 7 nav butonunun tamamı görünür ve tıklanabilir (üst üste binme yok).

## Assertions
- [ ] 7 nav butonu belirtilen sırada ve etiketlerle görünür.
- [ ] Her bölümde h1/p metni Test data tablosuyla birebir eşleşir; breadcrumb `PROJE / WEB · CHROMIUM`.
- [ ] Tıklanan nav butonu tek `active` butondur.
- [ ] `Yeni test` yalnız `Genel bakış`, `Testler`, `Çalıştırmalar` bölümlerinde görünür ve tıklanınca `Testler` bölümünü açar.
- [ ] Prototip bandı `AI Test Assistant` ve `Ayarlar` dışında görünür, metni birebir eşleşir.
- [ ] Sayaç rozetleri API yanıtından hesaplanan değerlerle eşleşir; sayaçsız bölümlerde rozet yoktur.
- [ ] Proje verisi her 1500 ms'de yeniden çekilir ve 200 döner.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Giriş sonrası `Genel bakış` ilk yükleme (kenar çubuğu sayaçlarıyla)
- 7 bölümün her biri (başlık + banner görünürlüğü)
- `Yeni test` tıklaması sonrası `Testler` bölümü
- 1024×768 görünüm

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
