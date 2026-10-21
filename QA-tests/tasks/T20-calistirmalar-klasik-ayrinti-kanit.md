# T20-calistirmalar-klasik-ayrinti-kanit: Çalıştırma geçmişi — ayrıntı, beklenen/gözlenen kanıt ve İptal et

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` (`section === "runs"`, "Çalıştırma geçmişi" + "Beklenen sonuç ve gözlenen kanıt") |
| Flow | Çalıştırmalar bölümü → "Çalıştırma geçmişi" satır ayrıntısı ve kanıt paneli |
| Requires auth | yes (yerel demo oturumu) |
| Required role | admin |
| Destructive | yes (`İptal et` kuyruktaki/çalışan çalıştırmayı iptal eder) |
| Estimated steps | 32 |

## Preconditions
- App running at `http://127.0.0.1:5173`
- Signed in as admin: **"Yerel çalışma alanını aç"** → kenar çubuğu **"Çalıştırmalar"**.
- Seed: ≥ 1 `Başarılı` klasik çalıştırma ("Sağlam uygulama" varyantı, ekran görüntülü) ve ≥ 1 `Başarısız` klasik çalıştırma ("Bozuk dashboard" varyantı).
- TC-03 için: Testler bölümünde yayınlanmış bir klasik test; "Yavaş uygulama" varyantıyla yeni çalıştırma başlatılabilir.

## Test data
- `passedRow` = "Çalıştırma geçmişi" tablosunda Durum `Başarılı`, Demo kontrolü `Sağlam uygulama` olan satır; `passedId8` = alt satırdaki 8 karakter
- `failedRow` = Durum `Başarısız`, Demo kontrolü `Bozuk dashboard` olan satır; `failedId8`
- `slowVariant = "Yavaş uygulama"` (iptal senaryosu için çalıştırma varyantı)
- `unknownRunUuid = "00000000-0000-4000-8000-000000000000"`

## Steps

### TC-01: Happy path — Başarılı klasik çalıştırmanın kanıtını incele
1. Navigate to `http://127.0.0.1:5173` → **"Yerel çalışma alanını aç"** → **"Çalıştırmalar"**.
2. Assert: `h2` "Çalıştırma geçmişi" görünür; etiket `Son <n> çalıştırma`, `n ≥ 2`.
3. Assert: tablo başlıkları `Test / sürüm`, `Demo kontrolü`, `Durum`, `Başlangıç` ve başlıksız işlem sütunu.
4. Assert: `passedRow` alt satırı `v<revision> · <passedId8>`; Demo kontrolü `Sağlam uygulama`; Durum rozeti `Başarılı` (onay ikonlu).
5. aria-label `<passedId8> çalıştırma ayrıntıları` olan butonu tıkla.
6. Assert: satır `selected-row` sınıfı alır (vurgulanır).
7. Assert: tablonun altında kart açılır; eyebrow `ÇALIŞTIRMA AYRINTISI · <passedId8>`; `h2` "Beklenen sonuç ve gözlenen kanıt"; sağda `Başarılı` rozeti.
8. Assert: meta satırı `Test v<n>`, `Model v<n>`, `<k> assertion yürütüldü` (k ≥ 1) ve `SHA-256 <12 hex>…` içerir; `code` elementinin title'ı 64 karakterlik checksum'dır.
9. Assert: adım listesinde her adımın yeşil onay ikonu, etiket ve `<ms> ms` süresi vardır; assert adımında `Beklenen: <değer> · Gözlenen: <değer>` görünür ve iki değer eşittir.
10. Assert: "Worker sonucu bekleniyor." metni ve **İptal et** butonu GÖRÜNMEZ.
11. Assert: kanıt alanında alt metni "Gerçek test tarayıcısının son ekran görüntüsü" olan `<img>` yüklenir (`/api/v1/runs/<uuid>/screenshot`, HTTP 200, `naturalWidth > 0`); altında "SHA-256 doğrulamalı · Form alanları maskeli".
12. Görüntüye tıkla. Assert: yeni sekmede aynı screenshot URL'i açılır.
13. Sayfayı yenile, tekrar **"Yerel çalışma alanını aç"** gerekiyorsa tıkla, **"Çalıştırmalar"**'a dön. Assert: `passedRow` hâlâ `Başarılı` olarak listede.

### TC-02: Başarısız çalıştırmanın kanıtı
1. aria-label `<failedId8> çalıştırma ayrıntıları` tıkla.
2. Assert: eyebrow `ÇALIŞTIRMA AYRINTISI · <failedId8>`; rozet `Başarısız`; önceki seçili satırın vurgusu kalkar, `failedRow` vurgulanır.
3. Assert: Terminal ikonlu `result-code` kutusu hata kodunu gösterir (boş değil).
4. Assert: başarısız adım kırmızı X ikonludur; `Beklenen: <x> · Gözlenen: <y|Yok>` satırında değerler farklıdır veya Gözlenen `Yok`; adım altında hata kodu (`small`) görünür.
5. Assert: ekran görüntüsü varsa yüklenir; yoksa "Ekran görüntüsü mevcut değil." metni görünür.

### TC-03: Destructive — `İptal et`
Onay diyaloğu YOKTUR; tek tık iptal eder. "Vazgeç" yolu, butonu tıklamadan beklemektir.
1. Testler bölümünde yayınlı testi `slowVariant` ile çalıştır (uygulama otomatik Çalıştırmalar'a geçer ve yeni run'ı seçer).
2. Assert: kanıt kartında rozet `Sırada` veya `Çalışıyor` (dönen ikon); "Worker sonucu bekleniyor. Bu aşamada başarı varsayılmaz." metni ve **İptal et** butonu görünür; kanıt alanı "Ekran görüntüsü sonuçla birlikte oluşacak." der.
3. İptal yolu (tıklama yok): 1 sn bekle. Assert: durum değişmedi veya doğal olarak ilerledi; iptal isteği (`POST /v1/runs/<id>/cancel`) gönderilmedi.
4. Onay yolu: **İptal et** tıkla. Assert: `POST /v1/runs/<id>/cancel` 2xx; buton istek süresince devre dışı; birkaç saniye içinde rozet `İptal` olur; "Worker sonucu bekleniyor." metni kaybolur.
5. Assert: "Çalıştırma geçmişi" tablosunda aynı satırın Durum'u `İptal`; "Tüm çalıştırmalar" kartında aynı id `İptal` gösterir.
6. Sayfayı yenile ve geri dön. Assert: durum hâlâ `İptal`.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `<id8> çalıştırma ayrıntıları` | click | kanıt kartı o id ile açılır, satır vurgulanır |
| Ekran görüntüsü bağlantısı | click | yeni sekmede `/api/v1/runs/<id>/screenshot` |
| `İptal et` | tıklamadan bekle (cancel yolu) | durum değişmez, cancel isteği yok |
| `İptal et` | click (proceed) | durum `İptal`, buton kaybolur |
| `Testlere git` | boş geçmişte click | Testler bölümüne geçer |

### TC-05: Negative & edge cases
- Boş durum: yeni (çalıştırması olmayan) veri dizininde Çalıştırmalar açılır → "Henüz test çalıştırılmadı", "Bir test yayınla ve gerçek tarayıcıda çalıştır." ve **Testlere git** butonu; etiket `Son 0 çalıştırma`; kanıt kartı yok.
- Adımsız sonuç (ör. `Altyapı hatası` veya `Engellendi` çalıştırması varsa): "Bu sonuçta adım yürütme kanıtı yok. Başarılı test sayılmaz." ipucu görünür.
- Terminal durumdaki çalıştırmada (`Başarılı`/`Başarısız`/`İptal`) **İptal et** butonu yoktur.
- Zaten bitmiş bir çalıştırma için doğrudan `POST /v1/runs/<id>/cancel` → hata yanıtı (4xx), durum değişmez.
- `GET /v1/runs/<unknownRunUuid>` → 404.
- Viewer rolü (rol değiştirme mekanizması varsa): kanıt kartı okunur; **İptal et** UI'da kilitli değildir — tıklanırsa API'nin 4xx döndüğü ve durumun değişmediği doğrulanır (bulgu olarak kaydet).
- Durum etiketi: bu tabloda queued `Sırada`; "Tüm çalıştırmalar" kartında aynı durum `Kuyrukta` — tutarsızlık olarak raporla.

## Assertions
- [ ] Satır ayrıntı butonu doğru id ile kanıt kartını açar ve satırı vurgular.
- [ ] Meta: `Test v`, `Model v`, `assertion yürütüldü`, `SHA-256 <12>…`.
- [ ] Başarılı adımlar yeşil, başarısız adımlar kırmızı; Beklenen/Gözlenen değerleri görünür.
- [ ] Ekran görüntüsü yüklenir ve "SHA-256 doğrulamalı · Form alanları maskeli" etiketi görünür.
- [ ] İptal et yalnız Sırada/Çalışıyor iken görünür; tıklayınca durum `İptal`.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- "Çalıştırma geçmişi" tablosu ilk yükleme
- Başarılı çalıştırma kanıt kartı (ekran görüntüsüyle)
- Başarısız çalıştırma kanıt kartı (hata kodu ve Beklenen/Gözlenen)
- Çalışıyor durumu + İptal et butonu
- İptal sonrası durum
- Boş durum (varsa)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
