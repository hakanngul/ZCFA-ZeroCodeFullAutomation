# T19-calistirmalar-html-rapor-indir: HTML raporu indir — klasik ve kalıcı AI çalıştırmaları

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/reporting.tsx` (`RunHistory`), `apps/api/src/reporting.ts` (`report.html`) |
| Flow | Çalıştırmalar bölümü → "Tüm çalıştırmalar" → Rapor sütunu: HTML raporu indir |
| Requires auth | yes (yerel demo oturumu) |
| Required role | admin |
| Destructive | no |
| Estimated steps | 24 |

## Preconditions
- App running at `http://127.0.0.1:5173`
- Signed in as admin: **"Yerel çalışma alanını aç"** → kenar çubuğu **"Çalıştırmalar"**.
- Seed: ≥ 1 `Başarılı` klasik çalıştırma (ekran görüntüsü kanıtlı), ≥ 1 `Başarısız` klasik çalıştırma, ≥ 1 tamamlanmış kalıcı AI testi çalıştırması.
- Tercihen: kalıcı AI testinde secret olarak işaretli bir test değişkeni (Ayarlar/değişkenler) — redaksiyon kontrolü için.

## Test data
- `passedRunId8` = Tüm çalıştırmalar tablosunda `Başarılı` ve `Klasik` olan ilk satırın 8 karakterlik id'si
- `failedRunId8` = `Başarısız` + `Klasik` ilk satırın id'si
- `aiRunId8` = `Kalıcı AI` ilk tamamlanmış satırın id'si
- `unknownUuid = "00000000-0000-4000-8000-000000000000"`
- `badId = "not-a-uuid"`, `badKind = "bogus"`
- `secretValue` = Preconditions'taki secret değişkenin değeri (yalnız raporda bulunmadığını doğrulamak için; task dosyasına yazılmaz, runner kendi seed'inden okur)

## Steps

### TC-01: Happy path — Başarılı klasik çalıştırmanın raporunu indir
1. Navigate to `http://127.0.0.1:5173` → **"Yerel çalışma alanını aç"** → **"Çalıştırmalar"**.
2. Assert: "Tüm çalıştırmalar" tablosunda `passedRunId8` satırı görünür.
3. Satırın `Rapor` hücresindeki aria-label `<passedRunId8> HTML raporunu indir` olan bağlantıya hover. Assert: title "HTML raporu indir"; href `/api/v1/projects/<projectId>/reports/runs/canonical/<uuid>/report.html`.
4. Bağlantıyı tıkla.
5. Assert: indirme olayı tetiklenir; dosya adı `zerocode-run-<passedRunId8>.html`; yanıt `200`, `Content-Type: text/html; charset=utf-8`, `Content-Disposition: attachment; filename="zerocode-run-<passedRunId8>.html"`.
6. İndirilen dosyayı tarayıcıda aç. Assert:
   - `<title>` = `ZeroCode raporu · <test başlığı> · <passedRunId8>`
   - Tablo satırları: `Tür` = `Klasik test`; `Test / sürüm` = `<testId> · v<n>`; `Çalıştırma` = tam UUID; `Durum` = `Başarılı`; `Hedef` = `Yerel Demo Bank`; `Başlangıç / bitiş` = `<ISO> → <ISO> (<ms> ms)`; `Plan SHA-256` = 64 hex karakter.
   - Senaryo bölümü test başlığıyla ve `Başarılı` rozetiyle; her adım `<etiket> (<kind>)` biçiminde; assert adımlarında `Beklenen: … · Gözlenen: … · <n> ms`.
   - Gömülü `<img>` `src` `data:image/png;base64,` ile başlar ve üstünde "Senaryo sonu ekran görüntüsü (SHA-256 doğrulandı, form alanları maskeli)" metni vardır.
   - Alt bilgi: "Girdi değerleri ve gizli test verileri rapora eklenmez. Görüntüler kayıtlı SHA-256 ile doğrulandıktan sonra gömülür."
   - `<meta http-equiv="Content-Security-Policy">` içeriği `default-src 'none'; img-src data:; style-src 'unsafe-inline'`.

### TC-02: Başarısız klasik ve kalıcı AI raporları
1. `failedRunId8` satırının rapor bağlantısını tıkla. Assert: dosya `zerocode-run-<failedRunId8>.html`; `Durum` = `Başarısız` ve hata kodu varsa `· <code>`; yürütülmemiş adımlar `Çalıştırılmadı` rozetiyle listelenir.
2. `aiRunId8` satırının rapor bağlantısını tıkla. Assert: href'te `/ai_test/`; `Tür` = `Kalıcı AI testi`; `Hedef` = plan targetUrl (ör. `http://127.0.0.1:4100/...`); checksum satır başlığı `Plan SHA-256`; her senaryo `<h2>` başlığı + durum rozeti; adım etiketleri `<kind> · element <key>` veya `<kind> · <locatorKind>=<value>` biçiminde; `fill` adımlarında girilen değer YOKTUR.
3. Bir AI suite çalıştırması varsa (`AI suite` satırı): checksum satır başlığı `Suite tanımı SHA-256`; `Tür` = `AI suite`.
4. Secret değişken seed edildiyse: indirilen HTML içinde `secretValue` metni bulunmaz.

### TC-03: Form validation — rapor uç noktası parametreleri
Formu yok; doğrulama URL parametrelerinde. Oturumlu sekmede doğrudan aç:

| Parametre | Boş değer | Desen ihlali | Bulunamayan |
|---|---|---|---|
| `:kind` | n/a (route eşleşmez → 404) | `badKind` → HTTP 4xx (Zod enum) | n/a |
| `:id` | n/a | `badId` → HTTP 4xx (`z.uuid()`) | `unknownUuid` → HTTP 404, mesaj "Çalıştırma bulunamadı." |
| kind/id uyuşmazlığı | n/a | n/a | klasik id ile `/ai_test/<id>/report.html` → HTTP 404 "Çalıştırma bulunamadı." |

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `<id8> HTML raporunu indir` (Klasik, Başarılı) | click | `zerocode-run-<id8>.html` iner, içerik TC-01 |
| `<id8> HTML raporunu indir` (Klasik, Başarısız) | click | dosya iner, `Başarısız` durumu |
| `<id8> HTML raporunu indir` (Kalıcı AI) | click | dosya iner, `Kalıcı AI testi` türü |
| Rapor hücresi (Kuyrukta/Çalışıyor) | gözlem | bağlantı yok, `—` |

### TC-05: Negative & edge cases
- Ekran görüntüsü dosyası diskten silinmiş bir çalıştırma: raporda "Ekran görüntüsü bulunamadı." uyarısı; hata yok, HTTP 200.
- Ekran görüntüsü dosyası değiştirilmiş (SHA-256 uyuşmaz): "Ekran görüntüsü bütünlük doğrulamasını geçemedi; eklenmedi." uyarısı; `<img>` yok.
- Test başlığında `<script>` benzeri karakter içeren bir test raporu: başlık `&lt;` kaçışlı görünür, script çalışmaz.
- Rapor dosyası dışarıya istek atmaz (CSP `default-src 'none'`): dosyayı açarken ağ sekmesinde ek istek yok.

## Assertions
- [ ] Her tamamlanmış satırda rapor bağlantısı var; queued/running satırlarda `—`.
- [ ] İndirilen dosya adı `zerocode-run-<id8>.html`.
- [ ] Rapor üst tablosu Tür/Test-sürüm/Çalıştırma/Durum/Hedef/Başlangıç-bitiş/SHA-256 satırlarını içerir.
- [ ] Görüntüler yalnız `data:` URI olarak ve SHA-256 doğrulandığında gömülür.
- [ ] Girdi (fill) değerleri ve secret değerler raporda yok.
- [ ] Geçersiz kind/id 4xx; bilinmeyen id 404 "Çalıştırma bulunamadı.".
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-03).

## Screenshots required
- Tüm çalıştırmalar tablosunda Rapor sütunu (hover title ile)
- Açılmış klasik Başarılı raporu (üst tablo + gömülü görüntü)
- Açılmış Kalıcı AI raporu
- 404 "Çalıştırma bulunamadı." yanıtı

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
