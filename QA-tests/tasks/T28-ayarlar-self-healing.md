# T28-ayarlar-self-healing: Ayarlar — Self-healing proje ayarını aç / kapat

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/self-healing-setting.tsx` |
| Flow | Ayarlar bölümü → "Self-healing" kartı: varsayılan kapalı, aç/kapat, kalıcılık (GET/PUT `/v1/projects/:id/settings`) |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 20 |

## Preconditions
- App running at `http://127.0.0.1:5173`.
- `ZC_DATA_DIR` atılabilir, **yeni oluşturulmuş** bir kopyayı göstermeli (varsayılan değer kontrolü için ayar daha önce hiç değiştirilmemiş olmalı); bu test proje ayarını kalıcı değiştirir.
- Sign in as admin: `http://127.0.0.1:5173` aç → **"Yerel çalışma alanını aç"** → sol menüde **"Ayarlar"**.

## Test data
- `selfHealingOn = true` (checkbox işaretli)
- `selfHealingOff = false` (checkbox işaretsiz)
- `badBody = { "selfHealing": "yes" }` (yalnız TC-05 API kontrolü için)

## Steps

### TC-01: Happy path — Self-healing'i aç, kalıcılığını doğrula, tekrar kapat
1. Sign in as admin ve **"Ayarlar"** bölümünü aç.
2. Assert: `aria-label="Self-healing ayarı"` kartında eyebrow `ÇALIŞTIRMA`, başlık `Self-healing` ve açıklama paragrafı ("…sabitlenmiş birincil locator'ı sayfada hiç bulunamadığında…") görünür.
3. Assert: Ağ: `GET /api/v1/projects/<projectId>/settings` 200 ve gövde `selfHealing: false`.
4. Assert: `Self-healing` (aria-label) checkbox'ı işaretsiz ve enabled; etiket metni `Self-healing (varsayılan kapalı)`.
5. Checkbox'ı işaretle (`selfHealingOn`).
6. Assert: `PUT /api/v1/projects/<projectId>/settings` gövdesi `{"selfHealing":true}`, yanıt 200 ve `selfHealing: true`.
7. Assert: kartta `role=status` = `Self-healing açık; sonraki çalıştırmalarda geçerli.`; checkbox işaretli.
8. Sayfayı yenile, **"Ayarlar"**'a dön. Assert: checkbox işaretli (kalıcı); `role=status` görünmez (bildirim yalnız kaydetme sonrası).
9. Checkbox'ın işaretini kaldır (`selfHealingOff`).
10. Assert: `PUT` gövdesi `{"selfHealing":false}`; `role=status` = `Self-healing kapalı; alternatifler denenmez.`; checkbox işaretsiz.
11. Sayfayı yenile. Assert: checkbox işaretsiz.

### TC-02: Form validation — `self-healing-toggle`
Tek alan boolean checkbox'tır; boş/pattern/uzunluk ihlali UI'dan üretilemez.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Self-healing` | n/a (checkbox) | n/a (UI yalnız true/false gönderir; API kontrolü TC-05) | n/a |

### TC-03: Modal coverage — yok
Bu kartta modal yoktur. Assert: checkbox değişiminde `role=dialog` açılmaz; değişiklik onay istemeden anında kaydedilir.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Self-healing` checkbox (kapalı → açık) | click | `Self-healing açık; sonraki çalıştırmalarda geçerli.` |
| `Self-healing` checkbox (açık → kapalı) | click | `Self-healing kapalı; alternatifler denenmez.` |
| `Self-healing` checkbox (istek sürerken) | DevTools → Slow 3G, click | istek tamamlanana kadar checkbox disabled; ikinci tıklama ek `PUT` göndermez |
| `Self-healing` checkbox (ilk yükleme) | sayfa açılırken `GET …/settings` yanıtlanmadan önce | checkbox disabled (ayar henüz yüklenmedi) |

### TC-05: Negative & edge cases
- Ağ kesikken (DevTools → Offline) checkbox'a tıkla → kartta `role=alert` = `TypeError: Failed to fetch`; checkbox önceki durumuna döner (sunucudan dönen değer gelmediği için `enabled` değişmez); çevrimiçine dönüp sayfayı yenile → ayar değişmemiştir.
- Yükleme hatası: `GET …/settings` isteğini DevTools ile engelle (Request blocking) ve sayfayı yenile → kartta `role=alert` görünür ve checkbox disabled kalır.
- API şema kontrolü (DevTools konsolundan, aynı origin): `fetch('/api/v1/projects/<projectId>/settings',{method:'PUT',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify(badBody)})` → 400, gövde `code: "INVALID_INPUT"`, `message: "Alanları kontrol edin."`; ardından sayfayı yenile → checkbox durumu değişmemiştir.
- Bağlam kontrolü: self-healing açıkken "AI Test Assistant" bölümünde bir suite çalıştırması sonuçlarında `adım alternatifle bulundu (self-healing)` metni yalnız bir iyileşme olursa görünür; bu task kapsamında yalnız ayarın kaydedildiği doğrulanır.

## Assertions
- [ ] Yeni veritabanında `selfHealing` varsayılan olarak `false` ve checkbox işaretsizdir.
- [ ] Açma `Self-healing açık; sonraki çalıştırmalarda geçerli.`, kapatma `Self-healing kapalı; alternatifler denenmez.` gösterir.
- [ ] Her iki durum sayfa yenilemesinden sonra korunur.
- [ ] İstek sürerken ve ilk yüklemede checkbox disabled'dır.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05 400 ve engellenen istekler).

## Screenshots required
- Page initial load (Self-healing kartı, checkbox işaretsiz)
- Each modal opened (modal yok)
- Each validation error state (TC-05 çevrimdışı `role=alert`)
- Final state after the happy path (açık durum + bildirim, ardından kapalı durum + bildirim)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
