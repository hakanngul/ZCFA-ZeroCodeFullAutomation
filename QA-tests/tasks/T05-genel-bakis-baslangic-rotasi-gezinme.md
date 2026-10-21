# T05-genel-bakis-baslangic-rotasi-gezinme: Başlangıç rotan adımları ve kısayol butonlarıyla bölüm gezintisi

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Genel bakış — Başlangıç rotan ve kısayol butonlarıyla bölümler arası gezinme |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 18 |

## Preconditions
- Uygulama `http://127.0.0.1:5173` adresinde çalışıyor.
- Rol: admin. Giriş: `http://127.0.0.1:5173` aç → **`Yerel çalışma alanını aç`** butonuna tıkla → sidebar'da **`Genel bakış`** butonuna tıkla. Kimlik bilgisi kullanılmaz.
- TC-01 için veri durumu fark etmez. TC-05 (tamamlanmış adımlar) için: onaylı uygulama modeli (≥ 1 onaylı öğe), ≥ 1 yayınlanmış klasik test ve ≥ 1 çalıştırma bulunur (ör. T04 + `Uygulama modeli` bölümünde eşleme onayı + `Test çalışma alanı`'nda `Doğrula ve yayınla` + `Testi çalıştır`).

## Test data
Form yoktur. Hedef bölüm eşlemesi (kaynaktaki `target` değerleri):
- `Uygulama bilgisini oluştur` → h1 `Uygulama modeli`
- `İş beklentisini tanımla` → h1 `Test çalışma alanı`
- `Çalıştır ve kanıtı incele` → h1 `Çalıştırmalar ve kanıtlar`
- `Yeni test` → h1 `Test çalışma alanı`
- `Testini tasarla` (model varken) → h1 `Test çalışma alanı`

## Steps

### TC-01: Happy path — Başlangıç rotan adımlarıyla her bölüme git
1. Genel bakış bölümünde olduğunu doğrula. Assert: h1 `Her testin arkasında bir kanıt.`.
2. Assert: `Başlangıç rotan` kartında sırasıyla `Uygulama bilgisini oluştur` (`Demo öğelerini keşfet ve insan onayıyla eşle.`), `İş beklentisini tanımla` (`Giriş akışı ve görünürlük doğrulaması ekle.`), `Çalıştır ve kanıtı incele` (`PASS, FAIL ve engelleri ayrı ayrı gör.`) butonları görünür.
3. **`Uygulama bilgisini oluştur`** adımına tıkla. Assert: h1 `Uygulama modeli`, sidebar'da `Uygulama modeli` butonu `active`; `Yeni test` butonu görünmez (model bölümünde gizli). Ağ isteği olarak `POST` gönderilmez (yalnız bölüm değişir).
4. Sidebar'da **`Genel bakış`**'a tıkla. **`İş beklentisini tanımla`** adımına tıkla. Assert: h1 `Test çalışma alanı`, alt metin `Kontrollü iş adımlarıyla anlamlı ve tekrar kullanılabilir testler oluştur.`, sidebar'da `Testler` butonu `active`.
5. Sidebar'da **`Genel bakış`**'a tıkla. **`Çalıştır ve kanıtı incele`** adımına tıkla. Assert: h1 `Çalıştırmalar ve kanıtlar`, alt metin `Gerçek tarayıcı sonuçlarını, doğrulamaları ve kanıtları bir arada gör.`, sidebar'da `Çalıştırmalar` butonu `active`.
6. Sidebar'da **`Genel bakış`**'a tıkla. Assert: h1 `Her testin arkasında bir kanıt.` tekrar görünür ve hero/metrik/kartlar yeniden render edilir.

### TC-02: Form validation — n/a
Genel bakış bölümünde form yoktur.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| — | n/a | n/a | n/a |

### TC-03: Modal coverage — n/a
Genel bakış bölümünde modal yoktur. Assert: hiçbir adımda `role="dialog"` görünmez.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeni test` (sayfa başlığı) | click | h1 `Test çalışma alanı`; yayınlanmış test görünümü sıfırlanır, editörde `Yeni taslak` etiketi (model varsa) veya `Önce uygulamanı tanıyalım` boş durumu (model yoksa) görünür |
| `Testini tasarla` (hero, model varken) | click | h1 `Test çalışma alanı`; ağda `POST .../discovery-scans` gönderilmez |
| `Uygulama bilgisini oluştur` | click | h1 `Uygulama modeli` |
| `İş beklentisini tanımla` | click | h1 `Test çalışma alanı` |
| `Çalıştır ve kanıtı incele` | click | h1 `Çalıştırmalar ve kanıtlar` |
| `zerocode LAB` logosu (`aria-label="ZeroCode ana sayfa"`, `href="/"`) | click | Sayfa `/` olarak yeniden yüklenir, oturum korunur, varsayılan bölüm `Genel bakış`'tır |
| Sidebar: `AI Test Assistant`, `Elementler`, `Ayarlar` | click → ardından `Genel bakış` | Her biri kendi h1'ini gösterir (`AI Test Assistant`, `Elementler`, `Ayarlar`); `Genel bakış`'a dönüşte overview içeriği eksiksiz görünür |

### TC-05: Negative & edge cases
- Tamamlanmış adımlar (önkoşuldaki veri ile): Genel bakış'ı aç. Assert: `Başlangıç rotan`'daki 3 adımın rozetinde `01/02/03` yerine onay işareti (`done` sınıfı) görünür; adımlar hâlâ tıklanabilir ve aynı hedeflere gider.
- Kısmi durum: yalnız model var, test/çalıştırma yok. Assert: yalnız 1. adım `done`; 2. ve 3. adım `02`, `03` rozetini gösterir.
- `Yeni test` butonunun görünürlüğü: Assert: `Genel bakış`, `Testler`, `Çalıştırmalar` bölümlerinde görünür; `Uygulama modeli`, `Elementler`, `AI Test Assistant`, `Ayarlar` bölümlerinde görünmez.
- Bölüm değişimi URL'yi değiştirmez. Assert: tüm gezinme boyunca adres çubuğu `http://127.0.0.1:5173/` olarak kalır; sayfa yenilendiğinde bölüm `Genel bakış`'a döner.

## Assertions
- [ ] 3 `Başlangıç rotan` adımı doğru bölüme yönlendirir (model / tests / runs).
- [ ] `Yeni test` ve `Testini tasarla` butonları `Test çalışma alanı`'nı açar.
- [ ] Sidebar'da aktif buton her geçişte hedef bölümle eşleşir.
- [ ] Tamamlanan adımlar onay işaretiyle gösterilir.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Genel bakış ilk yükleme
- Her hedef bölüm (`Uygulama modeli`, `Test çalışma alanı`, `Çalıştırmalar ve kanıtlar`) açıldıktan sonra
- Üç adımı da tamamlanmış `Başlangıç rotan` kartı
- Final state after the happy path (Genel bakış'a dönüş)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
