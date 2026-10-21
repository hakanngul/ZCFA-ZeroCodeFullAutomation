# T07-uygulama-modeli-kesif-ve-esleme-onayi-as-admin: Keşfi başlat ve zorunlu eşlemeleri onaylayarak model v1 oluştur (admin)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Uygulama modeli (`section === "model"`) — Keşfi başlat ve zorunlu eşlemeleri onayla (model v1 yayınla) |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 22 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker çalışıyor).
- API, web portunu kabul etmeli: web 5173'te ise API `ZC_WEB_PORT=5173` ile başlatılmış olmalı (aksi halde POST istekleri 403 "İstek kaynağı doğrulanamadı." döner).
- Boş veri dizini: yeni bir `ZC_DATA_DIR` (önceden scan/model kaydı yok). Bu sayede "Uygulama bilgisiyle başla" boş durumu ve model `v1` görünür.
- Oturum: `http://127.0.0.1:5173` adresini aç, **`Yerel çalışma alanını aç`** butonuna tıkla, ardından sidebar'da **`Uygulama modeli`** butonuna tıkla. Rol `admin` (sidebar profil: "Demo QA" / "Yerel yönetici"). Kimlik bilgisi girilmez.

## Test data
Onay formu (`mapping-review`) için işaretlenecek checkbox'lar (satır etiketi → değer):
- `E-posta` (Giriş sayfası · login.username, locator `login-email`) = işaretli
- `Parola` (Giriş sayfası · login.password, locator `login-password`) = işaretli
- `Giriş yap` (Giriş sayfası · login.submit, locator `login-submit`) = işaretli
- `Dashboard` (Dashboard · dashboard.heading, locator `dashboard-heading`) = işaretli
- `Bakiye` (Dashboard · dashboard.balance, locator `dashboard-balance`) = işaretli
- Beklenen model sürümü: `v1`
- Beklenen aday sayısı: `5`

## Steps

### TC-01: Happy path — Demo Bank'ı keşfet ve tüm 5 eşlemeyi onayla
1. Sign in as admin: `http://127.0.0.1:5173` aç, **`Yerel çalışma alanını aç`** tıkla.
2. Sidebar'da **`Uygulama modeli`** tıkla. Assert: buton `active` sınıfına sahip; yanında sayı rozeti yok (model henüz yok).
3. Assert: breadcrumb `PROJE / WEB · CHROMIUM`, h1 `Uygulama modeli`, alt metin `Keşif önerilerini incele. Onayladığın öğeler sürümlü modelin parçası olsun.`
4. Assert: üst sağda **`Yeni test`** butonu görünmez; `Geliştirme sürümü` prototip banner'ı görünür.
5. Assert: kartta eyebrow `DEMO BANK · WEB UYGULAMASI`, başlık `Keşif ve eşleme incelemesi`, bilgi satırı `Pasif keşif yalnız demo giriş ve öğretim sayfalarını okur. Tıklama veya form gönderimi yapmaz.`
6. Assert: boş durum `Uygulama bilgisiyle başla` ve `Önerilen öğeler önce senin incelemene sunulur.` görünür; buton etiketi **`Keşfi başlat`**. Ekran görüntüsü al.
7. **`Keşfi başlat`** tıkla. Assert: `POST /v1/projects/<projectId>/discovery-scans` 202 döner.
8. Assert: rozet `Sırada` veya `Çalışıyor`; `role="status"` alanında `Worker demo sayfalarını inceliyor…`; metin `0 aday öğe · Etiketler demo öğretim verisinden alınır`; buton etiketi **`Yeniden keşfet`** ve disabled.
9. En fazla 30 sn bekle (UI 1,5 sn'de bir yeniler). Assert: rozet `Onay bekliyor`, metin `5 aday öğe · Etiketler demo öğretim verisinden alınır`, yükleniyor alanı kayboldu, **`Yeniden keşfet`** etkin.
10. Assert: tam 5 `label.mapping-row` satırı şu sırayla görünür, her birinin etiketi `Aday`, checkbox'ları etkin ve işaretsiz:

    | Etiket | İkincil metin | Locator (`code`) |
    |---|---|---|
    | E-posta | Giriş sayfası · login.username | login-email |
    | Parola | Giriş sayfası · login.password | login-password |
    | Giriş yap | Giriş sayfası · login.submit | login-submit |
    | Dashboard | Dashboard · dashboard.heading | dashboard-heading |
    | Bakiye | Dashboard · dashboard.balance | dashboard-balance |
11. Assert: footer `Giriş alanları ve Dashboard zorunludur.`; **`Seçilen eşlemeleri onayla`** disabled. Ekran görüntüsü al.
12. `Test data`daki 5 checkbox'ın hepsini işaretle (satır etiketi metnine tıklamak da checkbox'ı değiştirir; her tıklamadan sonra işaretli olduğunu doğrula).
13. Assert: **`Seçilen eşlemeleri onayla`** etkin.
14. **`Seçilen eşlemeleri onayla`** tıkla.
15. Assert: `POST /v1/projects/<projectId>/mappings/review` 200 döner; gövdede `revision: 1`, `flow.name: "Geçerli demo hesabıyla giriş yap"`, 5 elementin hepsi `approved: true`.
16. Assert: bölüm `Test çalışma alanı` (h1) olarak değişir; sidebar'da **`Testler`** aktif.
17. Assert: sidebar **`Uygulama modeli`** rozeti `5`.
18. Sidebar'da **`Uygulama modeli`** tıkla. Assert: rozet `Onaylandı`; 5 satırın etiketi `İncelendi`; 5 checkbox işaretli ve disabled; footer `Model v1 kayıtlı. Önceki sürümler korunur.`; **`Seçilen eşlemeleri onayla`** görünmez, **`Test tasarla`** görünür.
19. Sayfayı yeniden yükle (F5). Assert: açılan bölüm `Genel bakış` (bölüm durumu kalıcı değildir).
20. Sidebar'da **`Uygulama modeli`** tıkla. Assert: adım 18'deki onaylı durum aynen korunur (`Model v1 kayıtlı.`, 5 işaretli/disabled checkbox).
21. **`Test tasarla`** tıkla. Assert: h1 `Test çalışma alanı`. Ekran görüntüsü al.
22. Sidebar'da **`Genel bakış`** tıkla. Assert: `Onaylı öğe` metriği `05`; `Son hareketler` içinde `Eşlemeler onaylandı` ve `Uygulama keşfi başlatıldı` görünür.

### TC-02: Form validation — `mapping-review`
Bu görevde yalnız istemci tarafı temel kontrolü doğrulanır; tam matris T08'dedir.
1. TC-01 adım 10 durumunda (awaiting_review, hiçbir şey seçili değil) **`Seçilen eşlemeleri onayla`** butonunun disabled olduğunu doğrula.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Zorunlu 4 checkbox (E-posta, Parola, Giriş yap, Dashboard) | Mesaj yok; buton disabled, footer `Giriş alanları ve Dashboard zorunludur.` | n/a | n/a |
| Bakiye (opsiyonel) | Hata yok; işaretsiz bırakılabilir | n/a | n/a |

### TC-03: Modal coverage — n/a
Bu bölümde modal yoktur (statik analizde `modals: []`). Assert: TC-01 boyunca hiçbir `role="dialog"` öğesi açılmaz.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Keşfi başlat` | click (scan yokken) | 202; rozet `Sırada`/`Çalışıyor`; etiket `Yeniden keşfet` olur ve disabled |
| `Yeniden keşfet` | scan `queued`/`running` iken | disabled; tıklanamaz |
| `Seçilen eşlemeleri onayla` | 5 öğe seçili, click | 200; bölüm `Test çalışma alanı` |
| `Test tasarla` | click (approved durumunda) | bölüm `Test çalışma alanı` |
| `Uygulama modeli` (sidebar) | click | h1 `Uygulama modeli`, buton aktif |

### TC-05: Negative & edge cases
- Keşif sürerken **`Uygulama modeli`**'nden **`Genel bakış`**'a geç, sonra geri dön. Assert: polling devam eder ve rozet en geç 30 sn içinde `Onay bekliyor` olur.
- awaiting_review durumunda 3 checkbox işaretle, sonra sidebar'dan **`Elementler`**'e geç ve **`Uygulama modeli`**'ne dön. Assert: 3 seçim korunur (React durumu). Sonra sayfayı yeniden yükleyip bölüme dön. Assert: tüm checkbox'lar işaretsiz (seçimler kalıcı değildir) ve onay butonu disabled. Ardından 5'ini işaretleyip onayla, TC-01 adım 15'ten devam et.
- Worker durdurulmuşken **`Keşfi başlat`** (ayrı ve isteğe bağlı çalıştırma): Assert: rozet `Sırada` kalır, `Worker demo sayfalarını inceliyor…` görünür, buton disabled kalır; UI hata vermez.
- Fixture (4100) kapalıyken keşif (ayrı ve isteğe bağlı çalıştırma): Assert: rozet `Başarısız` ve `Keşif tamamlanamadı. Fixture ve worker süreçlerini kontrol et.` görünür; buton **`Yeniden keşfet`** etkin.

## Assertions
- [ ] h1 `Uygulama modeli`, alt metin ve breadcrumb `PROJE / WEB · CHROMIUM` görünür.
- [ ] `Yeni test` butonu model bölümünde görünmez; `Geliştirme sürümü` banner'ı görünür.
- [ ] Boş durum `Uygulama bilgisiyle başla` scan yokken görünür.
- [ ] Keşif sırasında `Worker demo sayfalarını inceliyor…` ve disabled `Yeniden keşfet`.
- [ ] `Onay bekliyor` durumunda 5 aday satır, doğru etiket/id/locator ve `Aday` etiketi.
- [ ] 4 zorunlu öğe seçilmeden `Seçilen eşlemeleri onayla` disabled.
- [ ] Onay sonrası bölüm `Test çalışma alanı`, sidebar rozeti `5`.
- [ ] Model bölümünde `Onaylandı`, `İncelendi`, `Model v1 kayıtlı. Önceki sürümler korunur.`, `Test tasarla`.
- [ ] Yeniden yüklemeden sonra onaylı model korunur.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (model bölümü, boş durum)
- Keşif sürüyor durumu
- `Onay bekliyor` durumu, 5 aday satır
- 5 checkbox işaretli, onay butonu etkin
- Final state after the happy path (model bölümü `Model v1 kayıtlı.` ve `Test çalışma alanı`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
