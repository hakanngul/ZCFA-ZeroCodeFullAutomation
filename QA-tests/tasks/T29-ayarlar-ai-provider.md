# T29-ayarlar-ai-provider: Ayarlar — AI sağlayıcı bağlantısı (ekle, test et, modelleri getir, aktif yap, sil)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-assistant.tsx` |
| Flow | Ayarlar bölümü → "Sağlayıcı bağlantıları" kartı: OpenAI-compatible provider kaydı, şifreli API anahtarı, model listesi, URL güvenlik kuralları, aktif provider, silme |
| Requires auth | yes |
| Required role | admin |
| Destructive | yes |
| Estimated steps | 48 |

## Preconditions
- App running at `http://127.0.0.1:5173`; API süreci `ZC_AI_ALLOW_LOCAL_PROVIDER` **tanımsız** başlatılmış olmalı (TC-02 yerel URL engelini doğrular).
- `ZC_DATA_DIR` atılabilir bir kopyayı göstermeli; bu test provider kayıtları ekler/siler ve aktif provider'ı değiştirir.
- Sign in as admin: `http://127.0.0.1:5173` aç → **"Yerel çalışma alanını aç"** → sol menüde **"Ayarlar"**.
- "Kayıtlı provider’lar" listesi boş olmalı (TC-04 aktiflik kuralı için); değilse her satırı `<name> sil` ile sil.
- Gerçek bir OpenAI-compatible uç nokta için ortam değişkenleri: `QA_AI_PROVIDER_BASE_URL` (https, query/hash yok), `QA_AI_PROVIDER_KEY`, `QA_AI_PROVIDER_MODEL`. Değerleri asla task dosyasına, ekran görüntüsü notuna veya rapora yazma. Bu değişkenler tanımsızsa TC-01 ve gerçek provider gerektiren TC-04/TC-05 adımları **BLOCKED** raporlanır; TC-02 ve TC-03'ün çevrimdışı kısımları yine çalıştırılır.
- Bildirimler (`role=status`) ve hatalar (`role=alert`, `p.error`) bu kartın en altında görünür.

## Test data
- `providerName = "QA Provider {runId}"`
- `providerName2 = "QA Provider B {runId}"`
- `kind = "OpenAI-compatible"`
- `baseUrl = ${QA_AI_PROVIDER_BASE_URL}`
- `apiKey = ${QA_AI_PROVIDER_KEY}`
- `model = ${QA_AI_PROVIDER_MODEL}`
- `timeoutMs = 15000`
- `dummyKey = "qa-dummy-key-invalid"` (bilerek geçersiz, sır değildir; yalnız doğrulama yollarını açmak için)
- `shortName = "A"`; `longName = 81 × "p"`
- `notAUrl = "bu-bir-url-degil"`
- `httpUrl = "http://api.example.com/v1"`
- `queryUrl = "https://api.example.com/v1?x=1"`
- `hashUrl = "https://api.example.com/v1#frag"`
- `credsUrl = "https://u:p@api.example.com/v1"`
- `localHttpUrl = "http://127.0.0.1:9/v1"`
- `unresolvableUrl = "https://qa-nonexistent.invalid/v1"`
- `privateHostUrl = "https://localhost/v1"`
- `emptyModel = ""`
- `timeoutLow = 999`; `timeoutHigh = 120001`

## Steps

### TC-01: Happy path — Gerçek provider'ı test et, modelleri getir, kaydet
1. Sign in as admin ve **"Ayarlar"** bölümünü aç.
2. Assert: eyebrow `AI PROVIDER`, başlık `Sağlayıcı bağlantıları`, metin `OpenAI-compatible provider · API anahtarı yalnız sunucuda şifreli saklanır.` görünür.
3. Assert: varsayılanlar — `Provider tipi` = `OpenAI-compatible`, `Timeout (ms)` = `15000`, `API Key` input `type=password` ve placeholder `API Key`, `Model` alanı placeholder `Manuel model ID` olan bir input; **`Test Connection`**, **`Fetch Models`**, **`Save Provider`** disabled.
4. Doldur: `Provider adı` = `providerName`, `Custom Base URL` = `baseUrl`, `API Key` = `apiKey`, `Model` = `model`, `Timeout (ms)` = `15000`.
5. Assert: üç buton da enabled.
6. **`Test Connection`**'a tıkla. Assert: `role=status` = `Gerçek provider bağlantısı başarılı.`; `POST /api/v1/ai/providers/connection` 200 `{status:"connected"}`.
7. **`Fetch Models`**'a tıkla. Assert: `role=status` = `<N> model yüklendi.` (N ≥ 1) veya `Model listesi boş; ID’yi elle girebilirsin.`; N ≥ 1 ise `Model` alanı ilk seçeneği `Model seç` olan bir select'e dönüşür.
8. Select göründüyse `Model` = `model` seç (listede yoksa listedeki ilk gerçek model ID'sini seç ve rapora yaz).
9. **`Save Provider`**'a tıkla.
10. Assert: `role=status` = `Provider kaydedildi.`; form sıfırlandı (tüm metin alanları boş, Timeout `15000`, Model tekrar `Manuel model ID` input'u).
11. Assert: "Kayıtlı provider’lar" altında `QA Provider {runId} · <model> · Aktif` satırı, **`Düzenle`** ve `QA Provider {runId} sil` butonları görünür; **`Aktif yap`** görünmez (ilk provider otomatik aktif).
12. Assert (anahtar sızmaz): `POST /api/v1/ai/providers` yanıtı 201 ve `GET /api/v1/ai/providers` yanıtı yalnız `id,name,kind,baseUrl,model,timeoutMs,active,hasKey` alanlarını içerir; `hasKey: true`; hiçbir yanıt gövdesi ve sayfa HTML'i `apiKey` değerini içermez.
13. Sayfayı yenile. Assert: satır hâlâ `· Aktif` ile listede.
14. "AI Test Assistant" bölümüne geç. Assert: `Aktif provider` select'inde `providerName` seçili; `Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı ekle.` uyarısı görünmez. "Ayarlar"'a dön.

### TC-02: Form validation — `ai-provider-form`
Her satırda formu geçerli değerlerle doldur (ad `providerName2`, URL `https://api.example.com/v1`, `API Key` = `dummyKey`, model `qa-model`, timeout `15000`), yalnız ilgili alanı test değeriyle değiştir ve **`Save Provider`**'a tıkla. Her hatada liste değişmez ve form değerleri korunur.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `API Key` = `""` | **`Save Provider`**, **`Test Connection`**, **`Fetch Models`** disabled | n/a | n/a |
| `Provider adı` = `shortName` | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| `Provider adı` = `longName` | n/a | n/a | `Alanları kontrol edin. (INVALID_INPUT)` |
| `Custom Base URL` = `""` | `Alanları kontrol edin. (INVALID_INPUT)` | n/a | n/a |
| `Custom Base URL` = `notAUrl` | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| `Custom Base URL` = `httpUrl` | n/a | `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` | n/a |
| `Custom Base URL` = `queryUrl` | n/a | `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` | n/a |
| `Custom Base URL` = `hashUrl` | n/a | `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` | n/a |
| `Custom Base URL` = `credsUrl` | n/a | `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` | n/a |
| `Custom Base URL` = `localHttpUrl` (`ZC_AI_ALLOW_LOCAL_PROVIDER` tanımsız) | n/a | `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` | n/a |
| `Custom Base URL` = `unresolvableUrl` | n/a | `Provider adresi çözümlenemedi. (PROVIDER_NETWORK)` | n/a |
| `Custom Base URL` = `privateHostUrl` | n/a | `Özel ağ adresi kullanılamaz. (PROVIDER_URL_BLOCKED)` | n/a |
| `Model` = `emptyModel` | `Alanları kontrol edin. (INVALID_INPUT)` | n/a | n/a |
| `Timeout (ms)` = `timeoutLow` | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |
| `Timeout (ms)` = `timeoutHigh` | n/a | `Alanları kontrol edin. (INVALID_INPUT)` | n/a |

Aynı URL kuralları **`Test Connection`** ve **`Fetch Models`** için de geçerlidir: `httpUrl` ile her iki butona ayrı ayrı tıkla → her biri `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)`.

`ZC_AI_ALLOW_LOCAL_PROVIDER` kuralı (yalnız dev; API'yi `ZC_AI_ALLOW_LOCAL_PROVIDER=1` ile yeniden başlatmak mümkünse): `localHttpUrl` ile **`Save Provider`** artık URL engeli vermez (127.0.0.1 için http izinli); `http://localhost:9/v1` ise yine `Provider URL güvenli değil. (PROVIDER_URL_BLOCKED)` verir. Ortam değiştirilemiyorsa bu alt adım SKIPPED raporlanır; test sonrası API'yi bayraksız yeniden başlat.

### TC-03: Modal coverage — Provider düzenleme modu (satır içi, modal yok)
Bu kartta modal yoktur; **`Düzenle`** aynı formu düzenleme moduna alır.
1. TC-01'de kaydedilen satırda **`Düzenle`**'ye tıkla.
2. Assert: `Provider adı` = `providerName`, `Custom Base URL` = kaydedilmiş URL (sondaki `/` atılmış), `Model` = kaydedilmiş model, `Timeout (ms)` = `15000`; `API Key` **boş** ve placeholder `Değiştirmiyorsan boş bırak` (saklı anahtar tarayıcıya dönmez).
3. Assert: **`Save Provider`** API Key boşken enabled; **`Test Connection`** ve **`Fetch Models`** disabled. Not: düzenleme modunda **Vazgeç** butonu yoktur (bulgu olarak raporla).
4. `Timeout (ms)` = `30000` yap, `API Key` boş bırak, **`Save Provider`**. Assert: `Provider kaydedildi.`; `PUT /api/v1/ai/providers/<id>` 200; satır hâlâ `· Aktif`.
5. Assert: kayıtlı anahtar korunmuştur — "AI Test Assistant" bölümünde `Modelleri karşılaştır` kutusunu işaretle, ilk satırda **`Modelleri getir`**'e tıkla → `<N> model yüklendi.` (sunucu saklı anahtarı kullanır; `GET /api/v1/ai/providers/<id>/models` 200). "Ayarlar"'a dön.
6. Tekrar **`Düzenle`**, `Provider adı` = `shortName`, **`Save Provider`** → `Alanları kontrol edin. (INVALID_INPUT)`; sayfayı yenile → ad değişmemiştir.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| **`Test Connection`** (gerçek URL + `dummyKey`) | click | `API anahtarı veya erişim yetkisi geçersiz. (PROVIDER_AUTH)` |
| **`Fetch Models`** (gerçek URL + `dummyKey`) | click | `API anahtarı veya erişim yetkisi geçersiz. (PROVIDER_AUTH)` |
| **`Save Provider`** (ikinci provider: `providerName2`, `baseUrl`, `apiKey`, `model`) | click | `Provider kaydedildi.`; listede `QA Provider B {runId} · <model>` satırı **`· Aktif` olmadan** ve **`Aktif yap`** butonuyla görünür |
| **`Aktif yap`** (`providerName2` satırı) | click | `providerName2` satırı `· Aktif` olur; `providerName` satırı aktifliği kaybeder ve **`Aktif yap`** gösterir; bildirim metni çıkmaz |
| `QA Provider B {runId} sil` (aktif olan) | click → cancel confirm | Onay diyaloğu yoktur; iptal yolu mevcut değildir. Bulgu olarak raporla: tek tık kalıcı siler. |
| `QA Provider B {runId} sil` (aktif olan) | click → confirm proceed | satır kalkar; `DELETE /api/v1/ai/providers/<id>` 200 `{status:"deleted"}`; kalan en yeni provider (`providerName`) otomatik `· Aktif` olur; bildirim metni çıkmaz |
| `QA Provider {runId} sil` | click | satır kalkar; liste boşalır; "AI Test Assistant" bölümünde `Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı ekle.` görünür |

Sayfayı yenile. Assert: silinen provider'lar geri gelmez.

### TC-05: Negative & edge cases
- Zaman aşımı: `Custom Base URL` = `baseUrl`, `API Key` = `apiKey`, `Timeout (ms)` = `1000`, DevTools ile değil sunucu tarafında yavaş bir uç nokta yoksa SKIPPED; varsa **`Test Connection`** → `Provider bağlantısı zaman aşımına uğradı. (PROVIDER_TIMEOUT)`.
- Var olmayan yol: `Custom Base URL` = `baseUrl` + `/qa-yok` (gerçek host, geçersiz path), `API Key` = `apiKey`, **`Test Connection`** → `Provider HTTP 404 döndürdü. (PROVIDER_UNSUPPORTED)`.
- Ağ kesikken (DevTools → Offline) **`Save Provider`** → `role=alert` = `Failed to fetch`; liste değişmez.
- İstek sürerken (Slow 3G) **`Test Connection`**, **`Fetch Models`**, **`Save Provider`**, **`Aktif yap`** ve `<name> sil` butonları disabled.
- Sızıntı denetimi: tüm test boyunca DevTools Network'te hiçbir yanıt gövdesi `apiKey` değerini veya `encrypted_key` alanını içermez; tarayıcı konsoluna anahtar yazılmaz.
- Rol bulgusu (statik): `Düzenle`, `Aktif yap`, `<name> sil`, `Test Connection`, `Fetch Models` butonları `canEdit` ile kilitlenmez; viewer rolünde API `Düzenleme yetkisi gerekli. (FORBIDDEN)` döner. Viewer oturumu UI'dan açılamadığı için yalnız rapora not düş.

## Assertions
- [ ] Kart `AI PROVIDER` / `Sağlayıcı bağlantıları` ve şifreli saklama açıklamasıyla görünür.
- [ ] API Key boşken yeni kayıtta üç eylem butonu disabled.
- [ ] Gerçek provider ile `Gerçek provider bağlantısı başarılı.`, model listesi ve `Provider kaydedildi.` görünür.
- [ ] İlk provider otomatik aktif; **`Aktif yap`** aktifliği taşır; aktif silinince en yeni kalan aktif olur.
- [ ] API anahtarı hiçbir yanıtta dönmez; düzenlemede alan boş gelir ve boş bırakılırsa saklı anahtar korunur.
- [ ] TC-02 tablosundaki her hata metni birebir eşleşir; https/query/hash/kimlik bilgisi/yerel/özel ağ kuralları uygulanır.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02, TC-03 adım 6, TC-04 PROVIDER_AUTH, TC-05).

## Screenshots required
- Page initial load ("Sağlayıcı bağlantıları" kartı, boş form)
- Each modal opened (modal yok — düzenleme modu: TC-03 adım 2, API Key boş)
- Each validation error state (`INVALID_INPUT`, `PROVIDER_URL_BLOCKED`, `PROVIDER_NETWORK`, `Özel ağ adresi kullanılamaz.`, `PROVIDER_AUTH`)
- Fetch Models sonrası model select'i (TC-01 adım 7)
- Final state after the happy path (aktif provider listede, TC-01 adım 13)
- İki provider, aktiflik değişimi ve silme sonrası liste (TC-04)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
