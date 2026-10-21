# T06-genel-bakis-metrikler-son-hareketler: Metrik kartları ve Son hareketler listesinin durum yansıması, hata bandı ve oturum kapatma

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Genel bakış — Metriklerin ve Son hareketler listesinin durum yansıması; hata bandı ve oturum kapatma |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 20 |

## Preconditions
- Uygulama `http://127.0.0.1:5173` adresinde çalışıyor (worker çalışır durumda).
- Boş veri dizini ile başlanır (model, test, çalıştırma, audit yok).
- Rol: admin. Giriş: `http://127.0.0.1:5173` aç → **`Yerel çalışma alanını aç`** butonuna tıkla → sidebar'da **`Genel bakış`** butonuna tıkla. Kimlik bilgisi kullanılmaz.

## Test data
Overview'da form yoktur; durum, diğer bölümlerdeki gerçek işlemlerle üretilir:
- `testTitle = "Geçerli müşteri dashboard’a ulaşır"` (Test adı alanının varsayılan değeri; `Test çalışma alanı`'nda değiştirilmeden kullanılır)
- `variant = "healthy"` (varsayılan: `Sağlam uygulama`)
- Beklenen audit etiketleri: `Uygulama keşfi başlatıldı`, `Eşlemeler onaylandı`, `Yeni test yayınlandı`, `Test kuyruğa alındı`
- Metrik biçimi: değer `padStart(2, "0")` → 0 = `00`, 1 = `01`, 12 = `12`

## Steps

### TC-01: Happy path — Gerçek işlemlerin metriklere ve Son hareketler'e yansıması
1. Genel bakış'ta 4 metriğin değeri `00`'dır ve `Son hareketler` boş durum metni `İlk işleminle birlikte projenin geçmişi burada oluşacak.` görünür.
2. Hero'daki **`Uygulamayı keşfet`** butonuna tıkla. Assert: bölüm `Uygulama modeli` olur.
3. `Uygulama modeli` bölümünde keşif tamamlanana kadar bekle; önerilen eşlemeleri onayla (bölümdeki onay butonuyla) ve modeli kaydet.
4. Sidebar'da **`Genel bakış`**'a tıkla. Assert (≤ 3 sn): `Onaylı öğe` metriği onaylanan öğe sayısını iki haneli gösterir (≥ `01`); sidebar'daki `Uygulama modeli` sayacıyla aynı değerdir.
5. Assert: `Son hareketler`'de `Eşlemeler onaylandı` ve `Uygulama keşfi başlatıldı` olayları görünür.
6. **`Yeni test`** butonuna tıkla. `Test adı` alanında `Geçerli müşteri dashboard’a ulaşır` değerini koru. **`Doğrula ve yayınla`** butonuna tıkla. Assert: başlık `Yayınlanan test` ve etiket `Sürüm 1 · Salt okunur` görünür.
7. Sidebar'da **`Genel bakış`**'a tıkla. Assert: `Yayınlanan test` metriği `01`'dir (sidebar `Testler` sayacıyla eşit); `Son hareketler`'de `Yeni test yayınlandı` görünür; `Başlangıç rotan` 2. adımı onay işaretli.
8. Sidebar'da **`Testler`**'e tıkla, **`Testi çalıştır`** butonuna tıkla. Assert: bölüm `Çalıştırmalar ve kanıtlar` olur.
9. Hemen sidebar'da **`Genel bakış`**'a tıkla. Assert: çalıştırma `Sırada`/`Çalışıyor` iken `Bekleyen / çalışan` metriği `01`'dir; `Son hareketler`'de `Test kuyruğa alındı` görünür.
10. Çalıştırma bitene kadar bekle (≤ 20 sn; 1500 ms yoklama sayfayı otomatik günceller). Assert: `Bekleyen / çalışan` `00`'a döner; çalıştırma `Başarılı` ise `Başarılı çalıştırma` metriği `01` olur; `Başlangıç rotan` 3. adımı onay işaretlidir.
11. Assert: `Son hareketler` listesinde en fazla 4 olay satırı (`.audit-event`) vardır (bu noktada audit kaydı ≥ 4 olduğundan tam 4 satır görünür) ve her satırda `tr-TR` biçimli, `Europe/Istanbul` saat dilimine göre zaman damgası bulunur.
12. Sayfayı yenile. Assert: metrik değerleri ve `Son hareketler` içeriği yenileme öncesiyle aynıdır (kalıcı).

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
| `×` (`aria-label="Hatayı kapat"`, hata bandında) | click | Hata bandı (`role="alert"`) kaybolur; bölüm değişmez |
| `Demo QA` / `Yerel yönetici` (sidebar profil) | click | `DELETE /v1/session` 2xx; karşılama ekranı ve `Yerel çalışma alanını aç` butonu görünür; sidebar kaybolur |
| `Yerel çalışma alanını aç` (çıkıştan sonra) | click | Çalışma alanı tekrar açılır; varsayılan bölüm `Genel bakış`; proje verisi (metrikler, `Son hareketler`) çıkış öncesiyle aynıdır |

### TC-05: Negative & edge cases
- Hata bandı: Genel bakış açıkken API sürecini (`127.0.0.1:4000`) durdur. Assert: ≤ 3 sn içinde 1500 ms yoklaması başarısız olur ve `role="alert"` hata bandı bir hata mesajıyla görünür; overview içeriği (son başarılı veriyle) ekranda kalır. **`×`** (`Hatayı kapat`) butonuna tıkla. Assert: bant kapanır. API'yi tekrar başlat. Assert: bir sonraki yoklamada metrikler güncellenir.
- Çalıştırma iptali: bir çalıştırmayı `Çalıştırmalar` bölümünde iptal et. Assert: `Son hareketler`'de `Çalıştırma iptal edildi` görünür ve `Bekleyen / çalışan` azalır.
- Bilinmeyen audit eylemi: etiket haritasında olmayan bir `action` (ör. AI suite işlemi) audit'e düştüğünde, Assert: satırda ham `action` metni (ör. `ai.suite.created` biçiminde) görünür; boş satır görünmez.
- Viewer rolü: yerel oturum her zaman `Demo QA — Yerel yönetici` (admin) üretir; overview bloğunda rol kontrolü yoktur. Viewer davranışı bu bölüm için test edilemez — runner bu maddeyi `skipped (viewer oturumu üretilemiyor)` olarak raporlar.

## Assertions
- [ ] 4 metrik başlangıçta `00`'dır ve her gerçek işlemden sonra doğru artar/azalır.
- [ ] `Onaylı öğe`, `Yayınlanan test` metrikleri sidebar sayaçlarıyla eşleşir.
- [ ] `Son hareketler` eşlenmiş Türkçe etiketleri gösterir ve en fazla 4 satırdır.
- [ ] Hata bandı görünür ve `Hatayı kapat` ile kapanır.
- [ ] Profil butonu ile çıkış karşılama ekranına döner; yeniden giriş veriyi korur.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05 API kapalı senaryosu).

## Screenshots required
- Page initial load (tüm metrikler `00`)
- Eşleme onayı sonrası Genel bakış
- Test yayını sonrası Genel bakış
- Çalıştırma sırasında (`Bekleyen / çalışan = 01`) ve bitiminden sonra
- Hata bandı görünür durumda
- Çıkış sonrası karşılama ekranı
- Final state after the happy path

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
