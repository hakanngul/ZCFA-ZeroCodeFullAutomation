# T03-giris-ve-kabuk-oturumu-kapat-ve-hata-bandi: Destructive — Profil butonu ile oturumu kapatma ve hata bandı ("Hatayı kapat")

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Kabuk (kenar çubuğu profil butonu + hata bandı) — Oturumu kapatma (DELETE /v1/session) ve oturum hatasının gösterilip kapatılması |
| Requires auth | yes |
| Required role | admin |
| Destructive | yes |
| Estimated steps | 26 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT` ile bu portu kabul edecek şekilde başlatılmış).
- Sign in as admin: yeni context'te `/` aç, karşılama ekranında **"Yerel çalışma alanını aç"** butonuna tıkla; kabuk açılmış ve `Genel bakış` aktif olmalı. Kimlik bilgisi kullanılmaz.
- Runner tarayıcı context'inin çerezlerini okuyup silebilmeli (Playwright `context.cookies()` / `context.clearCookies()`), çünkü `zc_session` httpOnly'dir.
- Oturum kapatma yalnız bu test context'inin oturumunu siler; başka veri silinmez.

## Test data
Form alanı yoktur. Beklenen değerler:
- `profileAvatar = "QA"`, `profileName = "Demo QA"`, `profileRole = "Yerel yönetici"`
- `logoutRequest = DELETE /api/v1/session` → `200 {"status":"signed_out"}`
- `welcomeButton = "Yerel çalışma alanını aç"`
- `unauthBannerText = "Önce yerel çalışma alanını açın. (UNAUTHENTICATED)"`
- `closeButtonAriaLabel = "Hatayı kapat"`, `closeButtonText = "×"`
- `pollingIntervalMs = 1500`

## Steps

### TC-01: Happy path — Profil butonuyla oturumu kapat
1. Navigate to `http://127.0.0.1:5173/` (Preconditions'taki girişle kabuk açık).
2. Assert: `button.profile` görünür ve `QA`, `Demo QA`, `Yerel yönetici` metinleriyle çıkış ikonu içerir.
3. Assert: context çerezlerinde `zc_session` vardır; değerini `sessionId` olarak kaydet.
4. Click **`Demo QA` / `Yerel yönetici`** profil butonu (`button.profile`).
5. Assert: **onay diyalogu açılmaz** (kaynakta confirm yok); `DELETE /api/v1/session` hemen gönderilir, istek başlığında `X-ZeroCode-Client: local-ui` vardır ve yanıt 200 `{"status":"signed_out"}`'tır.
6. Assert: yanıt `zc_session` çerezini temizler; context çerezlerinde `zc_session` artık yoktur.
7. Assert: kabuk (`div.shell`) kaybolur, `main.welcome` görünür ve **`Yerel çalışma alanını aç`** butonu etkindir; `role="alert"` hata paragrafı yok.
8. Assert: çıkıştan sonra 3 saniye boyunca yeni `GET /api/v1/projects/...` isteği gönderilmez (polling durur, çünkü `projectId` boşaltıldı).
9. Sayfayı yenile. Assert: `GET /api/v1/workspace` 401 döner ve karşılama ekranı görünür (oturum sunucuda silinmiş).
10. Eski oturumun sunucuda geçersiz olduğunu doğrula: context'e `zc_session=<sessionId>` çerezini (`127.0.0.1`, path `/`) elle geri ekle ve sayfayı yenile. Assert: `GET /api/v1/workspace` yine 401 döner ve karşılama ekranı görünür.
11. Çerezi temizle, **`Yerel çalışma alanını aç`**'a tıkla. Assert: kabuk yeniden açılır, yeni `zc_session` değeri `sessionId`'den farklıdır.

### TC-02: Hata bandı — gösterme ve "Hatayı kapat"
1. Kabuk açık ve `Genel bakış` aktifken context çerezlerini temizle (`context.clearCookies()`); sayfayı yenileme.
2. En fazla 3 saniye bekle (polling 1500 ms).
3. Assert: `GET /api/v1/projects/<projectId>` 401 döner ve `.page-heading` altında `.error-banner[role="alert"]` görünür; metni birebir `Önce yerel çalışma alanını açın. (UNAUTHENTICATED)`.
4. Assert: bant içinde `aria-label="Hatayı kapat"` olan `×` butonu vardır; kabuk açık kalır (UI otomatik çıkış yapmaz).
5. Click **`×`** (`Hatayı kapat`).
6. Assert: `.error-banner` hemen DOM'dan kalkar.
7. Assert: polling sürdüğü için en geç ~1,5 s sonra bant aynı metinle **yeniden görünür** (beklenen davranış: hata kaynağı devam ediyor). Gözlenen süreyi rapora yaz.
8. Kurtarma: profil butonuna tıkla. Assert: `DELETE /api/v1/session` 200 döner (çerez olmadan da), karşılama ekranı açılır ve hata bandı görünmez.
9. **`Yerel çalışma alanını aç`**'a tıkla. Assert: kabuk açılır, `.error-banner` yoktur (`action()` hatayı temizler), 3 saniye boyunca bant tekrar görünmez.

### TC-03: Modal coverage
Bu akışta modal yoktur; çıkışta onay diyalogu da yoktur (bkz. TC-04). n/a.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Demo QA` / `Yerel yönetici` (profil) | click → cancel confirm | n/a — onay diyalogu yok; tek tıklama doğrudan çıkış yapar (UX bulgusu olarak raporla) |
| `Demo QA` / `Yerel yönetici` (profil) | click → proceed | `DELETE /api/v1/session` 200, `zc_session` silinir, karşılama ekranı |
| `Demo QA` / `Yerel yönetici` (profil) | `Çalıştırmalar` aktifken click, ardından `Yerel çalışma alanını aç` (sayfayı yenilemeden) | Gözlenen bölüm rapora yazılır. Kaynak `section` durumunu sıfırlamadığı için yeniden girişte `Çalıştırmalar` aktif açılır (h1 `Çalıştırmalar ve kanıtlar`) — beklenen değer budur; `Genel bakış` açılırsa davranış değişmiş demektir, rapora yaz |
| `×` (`Hatayı kapat`) | click | `.error-banner` kaybolur |

### TC-05: Negative & edge cases
- a) API kapalıyken çıkış (yalnız `apps/api` süreci durdurulabiliyorsa): profil butonuna tıkla. Assert: `.error-banner[role="alert"]` boş olmayan bir metinle görünür ve kabuk **açık kalır** (actor sıfırlanmaz, çünkü hata `setActor(null)`'dan önce atılır). API'yi yeniden başlat, `×` ile bandı kapat, profil butonuna tekrar tıkla → karşılama ekranı.
- b) Çift tıklama: profil butonuna hızlıca 2 kez tıkla. Assert: karşılama ekranı açılır, hata paragrafı yoktur; gönderilen `DELETE /api/v1/session` sayısı (1 veya 2) rapora yazılır, her biri 200'dür.
- c) İki sekme: aynı context'te 2. sekmede `/` aç (kabuk açılır). 1. sekmede çıkış yap. 2. sekmede en fazla 3 s bekle. Assert: 2. sekmede `.error-banner` metni `Önce yerel çalışma alanını açın. (UNAUTHENTICATED)` görünür; 2. sekmeyi yenileyince karşılama ekranı açılır.
- d) Hata bandı rol/erişilebilirlik: bant görünürken `role="alert"` olduğunu ve `Hatayı kapat` butonunun `Tab` ile odaklanıp `Enter` ile kapatılabildiğini doğrula.

## Assertions
- [ ] Profil butonu `QA`, `Demo QA`, `Yerel yönetici` gösterir.
- [ ] Profil butonu onaysız `DELETE /api/v1/session` gönderir; yanıt 200 `{"status":"signed_out"}`.
- [ ] Çıkış sonrası `zc_session` çerezi yoktur, karşılama ekranı görünür, polling durur.
- [ ] Eski oturum kimliği sunucuda geçersizdir (yeniden eklenince 401).
- [ ] Oturum çerezi kaybolunca hata bandı `Önce yerel çalışma alanını açın. (UNAUTHENTICATED)` metniyle görünür.
- [ ] `Hatayı kapat` bandı kapatır; hata kaynağı sürdükçe bant polling ile yeniden görünür.
- [ ] Yeniden giriş sonrası hata bandı temizlenir.
- [ ] No console errors in DevTools at any step (TC-02 ve TC-05/c'deki beklenen 401 kaynaklı ağ uyarıları hariç).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (çıkış sonrası `GET /api/v1/workspace` 401; çerez silindikten sonra `GET /api/v1/projects/...` 401).

## Screenshots required
- Çıkış öncesi kabuk (profil butonu görünür)
- Çıkış sonrası karşılama ekranı
- Hata bandı (`Önce yerel çalışma alanını açın. (UNAUTHENTICATED)`) görünür
- `Hatayı kapat` sonrası bandın kaybolduğu an
- Yeniden giriş sonrası temiz kabuk

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
