# T08-uygulama-modeli-esleme-dogrulamasi: Form validation — `mapping-review` (zorunlu eşlemeler, opsiyonel Bakiye, sunucu hataları)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Uygulama modeli (`section === "model"`) — Eşleme onay formu doğrulaması |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 26 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker çalışıyor). Web 5173'te ise API `ZC_WEB_PORT=5173` ile başlatılmış olmalı.
- Oturum: `http://127.0.0.1:5173` aç, **`Yerel çalışma alanını aç`** tıkla, sidebar'da **`Uygulama modeli`** tıkla. Rol `admin`; kimlik bilgisi girilmez.
- Veri: herhangi bir başlangıç durumu kabul edilir. Mevcut model sürümünü kaydet: bölümde `Model v<N> kayıtlı.` görünüyorsa `N`; scan/model yoksa `N = 0`. Bu görev sonunda model sürümü `N + 1` olur.
- DevTools Console erişimi (TC-05 sayfa bağlamından `fetch` çağrıları için).

## Test data
- Zorunlu öğe kimlikleri: `login.username` (E-posta), `login.password` (Parola), `login.submit` (Giriş yap), `dashboard.heading` (Dashboard)
- Opsiyonel öğe: `dashboard.balance` (Bakiye)
- Geçerli gönderim (TC-03): `E-posta = işaretli`, `Parola = işaretli`, `Giriş yap = işaretli`, `Dashboard = işaretli`, `Bakiye = işaretsiz`
- Geçersiz API gövdeleri (TC-05):
  - `emptyApproved = { scanId: <latestScanId>, approvedIds: [] }`
  - `missingRequired = { scanId: <latestScanId>, approvedIds: ["login.username","login.password","login.submit"] }`
  - `unknownElement = { scanId: <latestScanId>, approvedIds: ["login.username","login.password","login.submit","dashboard.heading","qa.unknown"] }`
  - `tooMany = { scanId: <latestScanId>, approvedIds: ["login.username","login.password","login.submit","dashboard.heading","dashboard.balance","dashboard.balance"] }` (6 öğe)
  - `badScanId = { scanId: "not-a-uuid", approvedIds: ["login.username"] }`
  - `unknownScan = { scanId: "00000000-0000-4000-8000-000000000000", approvedIds: ["login.username","login.password","login.submit","dashboard.heading"] }`
  - `extraKey = { scanId: <latestScanId>, approvedIds: ["login.username"], note: "x" }`
- `<latestScanId>` = Network sekmesinde son `GET /api/v1/projects/<projectId>` yanıtındaki `scans[0].id`; `<projectId>` aynı istekteki yol parametresi.

## Steps

### TC-01: Happy path — Yeni keşfi onay bekler duruma getir
1. Sign in as admin ve **`Uygulama modeli`** bölümünü aç (Preconditions).
2. Buton **`Keşfi başlat`** ise ona, **`Yeniden keşfet`** ise ona tıkla.
3. En fazla 30 sn bekle. Assert: rozet `Onay bekliyor`, `5 aday öğe · Etiketler demo öğretim verisinden alınır`, 5 satırın hepsi işaretsiz ve `Aday` etiketli.
4. Assert: footer `Giriş alanları ve Dashboard zorunludur.`, **`Seçilen eşlemeleri onayla`** disabled. Ekran görüntüsü al.

### TC-02: Form validation — `mapping-review` (istemci tarafı zorunluluk matrisi)
Önce 5 checkbox'ın hepsini işaretle ve **`Seçilen eşlemeleri onayla`** butonunun etkin olduğunu doğrula. Ardından her satır için yalnız o checkbox'ı kaldır, butonu kontrol et, sonra yeniden işaretle:

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| E-posta (`login.username`) işaretsiz | Buton disabled; footer `Giriş alanları ve Dashboard zorunludur.` | n/a | n/a |
| Parola (`login.password`) işaretsiz | Buton disabled; aynı footer | n/a | n/a |
| Giriş yap (`login.submit`) işaretsiz | Buton disabled; aynı footer | n/a | n/a |
| Dashboard (`dashboard.heading`) işaretsiz | Buton disabled; aynı footer | n/a | n/a |
| Bakiye (`dashboard.balance`) işaretsiz | Hata yok; buton **etkin** | n/a | n/a |

Ek kontroller:
1. Hiçbiri işaretli değilken: buton disabled.
2. Yalnız `Bakiye` işaretliyken: buton disabled.
3. Her disabled durumda butona tıkla. Assert: `mappings/review` isteği gönderilmez, rozet `Onay bekliyor` kalır.
4. Her disabled durumun ekran görüntüsünü al (en az E-posta eksik ve Dashboard eksik).

### TC-03: Bakiye olmadan onayla ve sonucu test tasarımcısında doğrula
1. `Test data` "Geçerli gönderim" değerlerini uygula: 4 zorunlu işaretli, `Bakiye` işaretsiz.
2. **`Seçilen eşlemeleri onayla`** tıkla.
3. Assert: `POST /api/v1/projects/<projectId>/mappings/review` 200; yanıtta `revision = N + 1`, `dashboard.balance` için `approved: false`, diğer 4 öğe `approved: true`.
4. Assert: h1 `Test çalışma alanı`; sidebar **`Uygulama modeli`** rozeti `4`.
5. Test tasarımcısında Assert: `Onaylı model` yanında `v<N+1>`; **`Bakiyeyi de doğrula`** checkbox'ı disabled.
6. Sidebar'da **`Uygulama modeli`** tıkla. Assert: rozet `Onaylandı`; `Bakiye` satırı işaretsiz ve disabled, diğer 4 satır işaretli ve disabled; tüm satırlar `İncelendi`; footer `Model v<N+1> kayıtlı. Önceki sürümler korunur.`. Ekran görüntüsü al.

### TC-04: Modal coverage — n/a
Bölümde modal yok. Assert: hiçbir adımda `role="dialog"` açılmaz.

### TC-05: Negative & edge cases (sunucu doğrulaması; DevTools Console'dan sayfa bağlamında)
Her çağrı için şu şablonu kullan ve dönen `status` + `code` + `message` değerlerini kaydet:
`await fetch('/api/v1/projects/<projectId>/mappings/review',{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify(<gövde>)}).then(async r=>[r.status, await r.json()])`

1. Yeni bir keşif başlat (**`Yeniden keşfet`**) ve `Onay bekliyor` durumunu bekle; `<latestScanId>` değerini al.
2. Aşağıdaki tabloyu uygula (her çağrıdan sonra rozet `Onay bekliyor` kalmalı):

| Gövde | Beklenen status | Beklenen code | Beklenen message |
|---|---|---|---|
| `emptyApproved` | 400 | `INVALID_INPUT` | `Alanları kontrol edin.` |
| `tooMany` | 400 | `INVALID_INPUT` | `Alanları kontrol edin.` |
| `badScanId` | 400 | `INVALID_INPUT` | `Alanları kontrol edin.` |
| `extraKey` | 400 | `INVALID_INPUT` | `Alanları kontrol edin.` |
| `missingRequired` | 400 | `REQUIRED_MAPPING` | `Giriş öğeleri ve Dashboard onaylanmalı.` |
| `unknownElement` | 400 | `UNKNOWN_ELEMENT` | `Bilinmeyen öğe.` |
| `unknownScan` | 404 | `NOT_FOUND` | `Keşif bulunamadı.` |
| `X-ZeroCode-Client` başlığı olmadan geçerli gövde | 403 | `CSRF_BLOCKED` | `İstek kaynağı doğrulanamadı.` |

3. UI'da 5 checkbox'ı işaretle ve **`Seçilen eşlemeleri onayla`** tıkla. Assert: 200, model `v<N+2>`.
4. Aynı (artık `approved`) `<latestScanId>` ile 4 zorunlu öğeli geçerli gövdeyi yeniden gönder. Assert: 409, `SCAN_NOT_REVIEWABLE`, `Keşif onay beklemiyor.`; model sürümü `v<N+2>` kalır (sayfa `Model v<N+2> kayıtlı.` gösterir).
5. Keşif çift başlatma: **`Yeniden keşfet`** tıkla ve hemen ardından Console'dan `fetch('/api/v1/projects/<projectId>/discovery-scans',{method:'POST',headers:{'X-ZeroCode-Client':'local-ui'}})` çağır (scan `Sırada`/`Çalışıyor` iken). Assert: 409, `SCAN_IN_PROGRESS`, `Keşif zaten sürüyor.`; UI butonu bu sırada disabled.
6. Hata banner'ı: oturumu sonlandırmadan, scan `queued`/`running` iken **`Yeniden keşfet`** butonunun disabled olduğunu doğrula (UI çift isteği engeller). Bir UI hatası tetiklemek için ayrı sekmede `/api/v1/session` için `DELETE` çağır (`fetch('/api/v1/session',{method:'DELETE',headers:{'X-ZeroCode-Client':'local-ui'}})`), ilk sekmede scan `Onay bekliyor` iken 4 zorunlu öğeyi işaretleyip **`Seçilen eşlemeleri onayla`** tıkla. Assert: `role="alert"` banner'ında `Önce yerel çalışma alanını açın. (UNAUTHENTICATED)`; bölüm `Uygulama modeli` kalır. **`Hatayı kapat`** (×) tıkla. Assert: banner kaybolur. Ekran görüntüsü al. (Not: 1,5 sn'lik polling de aynı hatayı tekrar yazabilir; banner yeniden görünürse bu beklenen davranıştır, kaydet.)

## Assertions
- [ ] 4 zorunlu öğeden herhangi biri eksikken `Seçilen eşlemeleri onayla` disabled ve istek gönderilmez.
- [ ] Yalnız `Bakiye` eksikken onay başarılı; model `approved:false` ile `dashboard.balance` içerir.
- [ ] Bakiye onaysız modelde test tasarımcısındaki `Bakiyeyi de doğrula` disabled.
- [ ] Sidebar rozeti onaylı öğe sayısını (`4` / `5`) gösterir.
- [ ] Sunucu doğrulama tablosundaki her status/code/message birebir eşleşir.
- [ ] Onaylanmış scan yeniden onaylanamaz (`Keşif onay beklemiyor.`), model sürümü artmaz.
- [ ] Hata banner'ı `message (CODE)` biçiminde görünür ve `Hatayı kapat` ile kapanır.
- [ ] No console errors in DevTools at any step (TC-05'te bilinçli tetiklenen fetch yanıtları hariç).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05).

## Screenshots required
- Page initial load (`Onay bekliyor`, hiçbiri seçili değil)
- Each validation error state (her zorunlu öğe eksikken disabled buton)
- TC-03 sonrası `Bakiyeyi de doğrula` disabled test tasarımcısı
- TC-05 adım 6 hata banner'ı
- Final state after the happy path (`Model v<N+2> kayıtlı.`)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
