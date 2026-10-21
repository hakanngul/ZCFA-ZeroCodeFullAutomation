# T01-giris-ve-kabuk-yerel-calisma-alani-ac-as-admin: Karşılama ekranından yerel çalışma alanını açma (admin)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Bölüm: Karşılama ekranı → Genel bakış — Yerel çalışma alanını açma ve oturumun korunması |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 24 |

## Preconditions
- App running at `http://127.0.0.1:5173` (web), API `127.0.0.1:4000`, worker ve demo hedef `127.0.0.1:4100` çalışıyor (`pnpm dev`).
- Web portu API'nin kabul ettiği origin listesinde olmalı: devUrl 5173 ise API `ZC_WEB_PORT=5173` ile başlatılmış olmalıdır (aksi halde TC-05/b'deki CSRF hatası beklenir).
- Başlangıçta oturum yok: tarayıcı context'inde `zc_session` çerezi bulunmuyor (yeni, izole Chromium context; headless).
- Çalışma alanına giriş kimlik bilgisi olmadan yapılır: karşılama ekranındaki **"Yerel çalışma alanını aç"** butonu yerel demo oturumu açar (`POST /api/v1/session/local`). Bu oturum her zaman `admin` rolündedir.
- Seed verisi gerekmez; demo proje API tarafından sağlanır.

## Test data
Bu akışta form alanı yoktur; tek girdi butona tıklamaktır. Beklenen değerler:
- `pageTitle = "ZeroCode · Test çalışma alanı"`
- `htmlLang = "tr"`
- `bootText = "Çalışma alanı hazırlanıyor…"`
- `welcomeButton = "Yerel çalışma alanını aç"`
- `sessionCookie = "zc_session"` (httpOnly, SameSite=Strict, path `/`, maxAge 28800 s)
- `expectedRole = "admin"`, `expectedMode = "local-demo-session"`
- `overviewH1 = "Her testin arkasında bir kanıt."`
- `unauthMessage = "Önce yerel çalışma alanını açın. (UNAUTHENTICATED)"`
- `csrfMessage = "İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)"`

## Steps

### TC-01: Happy path — Karşılama ekranından yerel çalışma alanını aç
1. Yeni (çerezsiz) tarayıcı context'i ile `http://127.0.0.1:5173/` adresine git.
2. Assert: ilk render'da `main.boot` içinde `Çalışma alanı hazırlanıyor…` metni ve dönen yükleme ikonu görünür (kısa sürebilir; `GET /api/v1/workspace` yanıtından önce yakala).
3. Assert: `GET /api/v1/workspace` 401 döner (gövde `code: "UNAUTHENTICATED"`). Bu 401 beklenen bir hatadır.
4. Assert: `document.title` = `ZeroCode · Test çalışma alanı`, `<html lang="tr">`.
5. Assert: `main.welcome` görünür ve şu metinleri birebir içerir:
   - Marka: `zero` + `code` + `LAB`
   - Üst başlık: `İŞ NİYETİNDEN GERÇEK KANITA`
   - h1: `Testi sen tanımla.` ve alt satırda `Kanıtı ZeroCode üretsin.`
   - Paragraf: `Uygulamanı modelle. İş akışını oluştur. Gerçek tarayıcıda doğrula.`
   - Kart: `Yerel geliştirme prototipi` ve `Örnek uygulama ve demo oturumu kullanılır. Gerçek müşteri verisi içermez.`
   - Alt not: `Chromium · Deterministik yürütme · İnsan onaylı eşleme`
6. Assert: **`Yerel çalışma alanını aç`** butonu görünür ve etkin; `role="alert"` hata paragrafı yok. Kenar çubuğu (`aside.sidebar`) yok.
7. Click **`Yerel çalışma alanını aç`**.
8. Assert: istek sürerken buton `disabled` olur (busy).
9. Assert: `POST /api/v1/session/local` 200 döner; yanıt `actor.role = "admin"`, `mode = "local-demo-session"`, `projectId` UUID; yanıt `Set-Cookie: zc_session=...; HttpOnly; SameSite=Strict; Path=/` içerir.
10. Assert: istek başlıklarında `X-ZeroCode-Client: local-ui` vardır.
11. Assert: karşılama ekranı kaybolur, `div.shell` görünür; kenar çubuğunda `ÇALIŞMA ALANI` etiketi ve 7 bölüm butonu vardır.
12. Assert: `Genel bakış` butonu `active` class'ına sahiptir; h1 = `Her testin arkasında bir kanıt.`; breadcrumb = `PROJE / WEB · CHROMIUM`.
13. Assert: `GET /api/v1/projects/<projectId>` 200 döner; topbar `Çalışma alanı > <project.name>` gösterir (`project.name` API yanıtındaki değerle birebir aynı; veri gelmeden önce geçici olarak `ZeroCode Demo` görünebilir).
14. Assert: topbar sağında `Yerel geliştirme` ve `v0.1` görünür.
15. Assert: profil butonu `QA` avatarı, `Demo QA` ve `Yerel yönetici` metinlerini gösterir.

### TC-02: Oturumun sayfa yenilemede korunması
1. TC-01 bittikten sonra sayfayı yenile (F5 / `page.reload()`).
2. Assert: `GET /api/v1/workspace` 200 döner, yanıt `actor.role = "admin"` ve `projects` dizisi ≥ 1 eleman içerir.
3. Assert: karşılama ekranı **görünmez**; doğrudan kabuk açılır ve `Genel bakış` aktif olur.
4. Kenar çubuğunda **`Çalıştırmalar`** butonuna tıkla, sonra marka linkine (`aria-label="ZeroCode ana sayfa"`, `href="/"`) tıkla.
5. Assert: tam sayfa yüklemesi olur, oturum korunur ve aktif bölüm `Genel bakış`'a döner (h1 = `Her testin arkasında bir kanıt.`).

### TC-03: Modal coverage
Bu akışta modal yoktur. n/a.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yerel çalışma alanını aç` | click (çerez yok) | `POST /api/v1/session/local` 200, kabuk açılır, `Genel bakış` aktif |
| `Yerel çalışma alanını aç` | istek sürerken | buton `disabled` |
| `Yerel çalışma alanını aç` | hızlı çift tıklama | en fazla 2 `POST /api/v1/session/local` isteği gider, ikisi de 200 döner; kabuk açılır, hata bandı/hata paragrafı görünmez (gönderilen istek sayısını rapora yaz) |
| Marka linki `ZeroCode ana sayfa` | click | sayfa `/` yeniden yüklenir, oturum korunur |

### TC-05: Negative & edge cases
- a) Oturum süresi/çerez yok: yeni context'te `GET /api/v1/workspace` 401 döner ve UI **hata göstermez** (hata `catch(() => {})` ile yutulur); yalnız karşılama ekranı görünür. Assert: `p.error[role=alert]` yok.
- b) Origin reddi (yalnız ortam bu durumu üretirse): web, API'nin `uiOrigins` listesinde olmayan bir porttan sunuluyorsa (`ZC_WEB_PORT` ayarsız + 5173) **`Yerel çalışma alanını aç`** tıklanınca `POST` 403 döner ve karşılama ekranında `p.error[role=alert]` içinde birebir `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` görünür; buton yeniden etkin olur; kabuk açılmaz. Ortam doğru yapılandırılmışsa bu adımı "n/a — ortam CSRF'yi tetiklemiyor" olarak işaretle.
- c) API kapalıyken (yalnız `apps/api` süreci durdurulabiliyorsa) butona tıkla: Assert karşılama ekranında `role="alert"` hata paragrafı görünür ve kabuk açılmaz (metin proxy yanıtına bağlıdır; birebir metin doğrulanmaz, boş olmadığı doğrulanır).
- d) Klavye: karşılama ekranında `Tab` ile **`Yerel çalışma alanını aç`** butonuna odaklan, `Enter` bas. Assert: TC-01 adım 9-12 ile aynı sonuç.

## Assertions
- [ ] `document.title` = `ZeroCode · Test çalışma alanı`, `<html lang="tr">`.
- [ ] Çerezsiz ilk yüklemede boot metni `Çalışma alanı hazırlanıyor…` görünür, ardından karşılama ekranı açılır.
- [ ] Karşılama ekranı metinleri TC-01 adım 5'teki değerlerle birebir eşleşir.
- [ ] `POST /api/v1/session/local` 200, `actor.role = "admin"`, `zc_session` httpOnly çerezi set edilir.
- [ ] Giriş sonrası kabuk açılır, `Genel bakış` aktif, h1 = `Her testin arkasında bir kanıt.`.
- [ ] Topbar proje adı API `project.name` ile eşleşir; `Yerel geliştirme v0.1` görünür.
- [ ] Profil butonu `Demo QA` / `Yerel yönetici` gösterir.
- [ ] Sayfa yenileme ve marka linki oturumu korur.
- [ ] No console errors in DevTools at any step (çerezsiz ilk yüklemedeki `GET /api/v1/workspace` 401 kaynaklı ağ uyarısı hariç).
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (`GET /api/v1/workspace` 401 oturumsuz durumda; TC-05/b'de 403).

## Screenshots required
- Boot ekranı (`Çalışma alanı hazırlanıyor…`) — yakalanabildiyse
- Karşılama ekranı ilk yükleme
- Giriş sonrası `Genel bakış` kabuğu
- Sayfa yenileme sonrası kabuk
- TC-05/b CSRF hata durumu (tetiklendiyse)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
