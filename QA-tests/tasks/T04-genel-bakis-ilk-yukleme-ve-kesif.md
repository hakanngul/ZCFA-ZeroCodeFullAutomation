# T04-genel-bakis-ilk-yukleme-ve-kesif: Genel bakış ilk yükleme ve hero ile uygulama keşfini başlatma

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Genel bakış — Boş projede genel bakışı görüntüle ve hero ile keşfi başlat |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 16 |

## Preconditions
- Uygulama `http://127.0.0.1:5173` adresinde çalışıyor (api, worker, fixture/demo hedef dahil).
- Boş veri dizini: proje için henüz keşif/model, test, çalıştırma ve audit kaydı yok (ör. yeni bir `ZC_DATA_DIR` ile başlatılmış ortam).
- Tarayıcıda aktif oturum yok (karşılama ekranı görünür).
- Rol: admin. Giriş: `http://127.0.0.1:5173` aç → **`Yerel çalışma alanını aç`** butonuna tıkla → sidebar'da **`Genel bakış`** butonuna tıkla. Kimlik bilgisi kullanılmaz.

## Test data
Bu bölümde form yoktur; doldurulacak alan bulunmaz. Beklenen sabit metinler:
- `heroTitle = "İlk anlamlı testine üç adım uzaktasın."`
- `pageTitle = "Her testin arkasında bir kanıt."`
- `pageSubtitle = "İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele."`
- `emptyAudit = "İlk işleminle birlikte projenin geçmişi burada oluşacak."`
- `auditDiscovery = "Uygulama keşfi başlatıldı"`

## Steps

### TC-01: Happy path — Boş projede genel bakışı görüntüle ve keşfi başlat
1. `http://127.0.0.1:5173` adresini aç. Assert: karşılama ekranında `Testi sen tanımla.` başlığı ve **`Yerel çalışma alanını aç`** butonu görünür.
2. **`Yerel çalışma alanını aç`** butonuna tıkla. Assert: `POST /v1/session/local` 2xx döner; sidebar ve profil butonu `Demo QA` / `Yerel yönetici` görünür.
3. Sidebar'da **`Genel bakış`** butonuna tıkla. Assert: buton `active` sınıfına sahiptir.
4. Assert: breadcrumb `PROJE / WEB · CHROMIUM`, h1 `Her testin arkasında bir kanıt.`, alt metin `İş niyetini tanımla, uygulama bilgisini paylaş ve sonucu güvenle incele.` görünür.
5. Assert: üst çubukta `Çalışma alanı` ve proje adı (veri yoksa `ZeroCode Demo`) görünür; sağ üstte `Yerel geliştirme` ve `v0.1` görünür.
6. Assert: prototip bandında `Geliştirme sürümü` ve `Klasik testler yerel Demo Bank üzerinde çalışır; AI suite’ler yalnız yapılandırılmış izinli hedeflere gider.` metni görünür.
7. Assert: hero bölümünde eyebrow `DAHA AZ TEKNİK YÜK. DAHA NET SONUÇ.`, başlık `İlk anlamlı testine üç adım uzaktasın.` ve paragraf `Önce uygulamanı tanı. Sonra neyi doğrulayacağını seç.` / `Gerisini izole tarayıcı worker’ı çalıştırsın.` görünür.
8. Assert: hero diyagramında 3 düğüm sırayla görünür: `01 Uygulama modeli — Keşfet ve onayla`, `02 İş niyeti — Giriş yap → Dashboard görünsün`, `03 Kanıtlı sonuç — Gerçek assertion + ekran görüntüsü`.
9. Assert: 4 metrik kartı görünür ve her değer `00`'dır: `Onaylı öğe` (`Ortak uygulama bilgisi`), `Yayınlanan test` (`Açık doğrulama içeren`), `Başarılı çalıştırma` (`Gerçek tarayıcıda doğrulandı`), `Bekleyen / çalışan` (`Tek worker · izole context`).
10. Assert: `Başlangıç rotan` kartında `Web MVP` etiketi ve 3 adım butonu görünür; adım rozetleri `01`, `02`, `03`'tür (hiçbirinde onay işareti yok).
11. Assert: `Son hareketler` kartında boş durum metni `İlk işleminle birlikte projenin geçmişi burada oluşacak.` ve dipnot `Süreç, sürüm ve sonuçlar kayıt altında.` görünür.
12. Assert: hero butonunun etiketi **`Uygulamayı keşfet`**'tir ve etkindir.
13. **`Uygulamayı keşfet`** butonuna tıkla. Assert: `POST /v1/projects/{projectId}/discovery-scans` 2xx döner; buton istek süresince `disabled` olur.
14. Assert: aktif bölüm `Uygulama modeli` olur; h1 `Uygulama modeli`, kart başlığı `Keşif ve eşleme incelemesi` görünür; sidebar'da `Uygulama modeli` butonu `active`'dir.
15. Sidebar'da **`Genel bakış`** butonuna tıkla. Assert (en fazla 3 sn içinde, 1500 ms yoklama): `Son hareketler` listesinde `Uygulama keşfi başlatıldı` olayı ve `tr-TR` biçimli zaman damgası (ör. `21 Eki 14:05`) görünür; boş durum metni kaybolur.
16. Sayfayı yenile (F5). Assert: oturum korunur (karşılama ekranı görünmez), `Genel bakış` bölümü açılır ve `Uygulama keşfi başlatıldı` olayı hâlâ listededir.

### TC-02: Form validation — n/a
Genel bakış bölümünde form ve giriş alanı yoktur. Doğrulama matrisi uygulanmaz.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| — | n/a | n/a | n/a |

### TC-03: Modal coverage — n/a
Genel bakış bölümünde modal/dialog yoktur. Assert: TC-01 boyunca hiçbir `role="dialog"` öğesi DOM'da görünmez.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yerel çalışma alanını aç` | click | Çalışma alanı kabuğu açılır, `Genel bakış` varsayılan bölümdür |
| `Uygulamayı keşfet` (model yok) | click | Keşif kuyruğa alınır, bölüm `Uygulama modeli` olur |
| `Genel bakış` (sidebar) | click | Bölüm overview'a döner, buton `active` |

### TC-05: Negative & edge cases
- Keşif sonrası worker keşfi tamamladığında (model oluştuğunda) `Genel bakış`'a dön. Assert: hero butonu etiketi `Testini tasarla` olur; diyagram düğümü 01 alt metni `v{revision} · Onaylı` biçimindedir; `Başlangıç rotan` 1. adım rozeti onay işaretine döner.
- **`Uygulamayı keşfet`** butonuna hızla iki kez tıkla. Assert: ikinci tıklama `disabled` durumda yutulur; yalnız 1 adet `POST .../discovery-scans` isteği gönderilir.
- API (`127.0.0.1:4000`) durdurulmuşken **`Uygulamayı keşfet`**'e tıkla. Assert: `role="alert"` hata bandı (`error-banner`) bir hata mesajıyla görünür; bölüm `Genel bakış`'ta kalır.

## Assertions
- [ ] h1 `Her testin arkasında bir kanıt.` ve breadcrumb `PROJE / WEB · CHROMIUM` görünür.
- [ ] Hero başlığı, 3 diyagram düğümü ve `Uygulamayı keşfet` butonu görünür.
- [ ] 4 metrik kartı `00` değeriyle görünür.
- [ ] `Başlangıç rotan` 3 adımı `01/02/03` rozetleriyle görünür.
- [ ] `Son hareketler` boş durum metni görünür; keşif sonrası `Uygulama keşfi başlatıldı` olayı görünür.
- [ ] Keşif sonrası aktif bölüm `Uygulama modeli`'dir.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05 API kapalı senaryosu).

## Screenshots required
- Karşılama ekranı (oturum öncesi)
- Genel bakış ilk yükleme (boş proje)
- `Uygulamayı keşfet` sonrası `Uygulama modeli` bölümü
- `Son hareketler` içinde `Uygulama keşfi başlatıldı` olayı
- TC-05 hata bandı durumu

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
