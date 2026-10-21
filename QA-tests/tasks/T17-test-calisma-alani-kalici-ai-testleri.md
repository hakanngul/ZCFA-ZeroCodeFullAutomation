# T17-test-calisma-alani-kalici-ai-testleri: Kalıcı AI testleri — sürümler, güncel olmayan element, Yeni sürüm oluştur ve çalıştırma

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/promoted-tests.tsx` |
| Flow | Test çalışma alanı (`section === "tests"`) — `Kalıcı AI testleri` (PromotedTests) |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 36 |

## Preconditions
- `pnpm dev` çalışıyor (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker, web). Uygulama `http://127.0.0.1:5173`; web 5173'teyse `ZC_WEB_PORT=5173` ayarlı.
- `admin` rolüyle oturum aç: `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** (kimlik bilgisi yok).
- Sidebar **`Testler`** (sayfa başlığı `Test çalışma alanı`).
- Seed: `AI suite’ler` kartında, izinli bir hedefe (varsayılan `http://127.0.0.1:4100`) yönelik, kütüphane elementlerine sabitlenmiş ≥ 1 onaylı AI suite (`AI Test Assistant` ile üretilip onaylanmış; AI sağlayıcı `Ayarlar`'da yapılandırılmış olmalı). Hiç onaylı suite yoksa görev `blocked` olarak raporlanır, PASS/FAIL verilmez.
- Kalıcı test henüz yoksa: `AI suite’ler` kartında suite satırındaki **`Kalıcı teste dönüştür`**'e tıkla; satırda `Kalıcı test v1` etiketi görünür.
- `suiteTitle` = seçilen suite'in başlığı; `elementKey` = bu testin sabitlediği bir kütüphane elementinin anahtarı (`Elementler` bölümünde görünür).

## Test data
- `renamedElementName` = `"QA Yeniden Adlandırılmış {runId}"` (yalnız ad değişir, locator değişmez → onay korunur)
- `expectedRevisionStale` = yeni sürümden önceki en son sürüm numarası (ör. `1`)
- API test gövdesi (TEST_UP_TO_DATE): `{ "expectedRevision": <güncel en son sürüm> }`

## Steps

### TC-01: Happy path — Güncel olmayan element için yeni sürüm oluştur ve yeni sürümü çalıştır
1. Sidebar **`Testler`**.
2. Assert: `Kalıcı AI testleri` kartı görünür; sayı etiketi ≥ 1; hint metni `Yayınlanan sürümler değişmez; suite yeniden dönüştürülünce ya da güncellenen elementler için “Yeni sürüm oluştur” ile yeni sürüm oluşur. Hedef origin her çalıştırmada yeniden yetki kontrolünden geçer.`
3. Assert: `suiteTitle` grubu altında `v1 · <n> senaryo · <m> element · http://127.0.0.1:4100 · SHA-256 <12 hex>… · <tarih>` satırı; `Origin yetkisiz` ve `güncel olmayan element` rozetleri YOK; **`Yeni sürüm oluştur`** butonu YOK; **`v1 çalıştır`** etkin.
4. Sidebar **`Elementler`** → `elementKey` elementinin düzenleyicisini aç → **`Element adı`** = `renamedElementName` → **`Kaydet`**. Assert: `Kaydedildi (sürüm <r+1>).` (onay kaldırıldı ifadesi YOK).
5. Sidebar **`Testler`**. Assert: v1 satırında `güncel olmayan element (1)` rozeti; rozetin `title`'ı `<elementKey>: v<r> → v<r+1>`; satırda **`Yeni sürüm oluştur`** butonu etkin (`title="Güncel onaylı element sürümleriyle yeni test sürümü"`).
6. v1 satırının `SHA-256` kodunun tam `title` değerini kaydet (`checksumV1`).
7. **`Yeni sürüm oluştur`**'a tıkla. Assert: istek sürerken buton `disabled`.
8. Assert: `role="status"` mesajı `<suiteTitle>: v2 oluşturuldu (<elementKey> v<r>→v<r+1>). v1 değişmedi.`
9. Assert: grup artık iki satır gösterir, üstte `v2`, altta `v1`; `v2` satırında rozet ve `Yeni sürüm oluştur` YOK; `v1` satırında da `güncel olmayan element` rozeti YOK (yalnız en son sürüm işaretlenir).
10. Assert: `v1` satırının `SHA-256` `title`'ı hâlâ `checksumV1` (değişmez); `v2` checksum'ı farklı.
11. **`v2 çalıştır`**'a tıkla.
12. Assert: bölüm `Çalıştırmalar ve kanıtlar`'a geçer; `Kalıcı AI testi çalıştırmaları` tablosunun ilk satırı `<suiteTitle>`, `v2 · <8 karakter id>`, `Hedef` = `http://127.0.0.1:4100`, `selected-row` ile seçili.
13. Assert: ayrıntı bölümünde `<suiteTitle> · Test v2`, hedef URL, `Plan SHA-256 <12 hex>…`; durum `Kuyrukta`/`Çalışıyor` → ≤ 60 sn içinde terminal duruma (`Başarılı`/`Başarısız`/`Engellendi`/`Altyapı hatası`) geçer.
14. Assert: durum `Başarılı` ise `<p> başarılı · <f> başarısız · <s> atlandı` sayaçları görünür, her senaryoda adım dökümü ve `<senaryo> kanıt görüntüsü` alt metinli ekran görüntüsü vardır (kanıt yoksa `Başarılı` olmamalı).
15. Sayfayı yenile → **`Testler`**. Assert: grup hâlâ `v2` ve `v1` satırlarını gösterir.

### TC-02: Form validation — `promoted-tests` (girdi yok; sunucu kuralları)
Bu kartta metin girişi yoktur. Doğrulama, butonun görünürlük/etkinlik kuralları ve API hata kodlarıyla yapılır.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| expectedRevision (`Yeni sürüm oluştur` gövdesi) | gövde `{}` → `Alanları kontrol edin. (INVALID_INPUT)` | eski sürüm → `Test bu arada değişti (güncel sürüm v<n>). (REVISION_CONFLICT)` | n/a |
| revision (`v<n> çalıştır` gövdesi) | gövde `{}` → en son sürüm çalışır (202) | `0` → `INVALID_INPUT` (400) | n/a |

1. DevTools konsolunda `fetch('/api/v1/projects/20000000-0000-4000-8000-000000000001/ai/tests/<testId>/versions',{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:'{}'}).then(r=>r.json())` (testId: `GET /api/v1/projects/<id>/ai/tests` yanıtından). Assert: `code: "INVALID_INPUT"`, HTTP 400.

### TC-03: Modal coverage — yok
Bu kartta modal/dialog yoktur. Atlanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeni sürüm oluştur` | stale element (yalnız ad değişti) iken click | `role="status"` `... v<n+1> oluşturuldu (...). v<n> değişmedi.`; yeni satır |
| `Yeni sürüm oluştur` | element onaysızken click | `role="alert"` `ELEMENT_UNAVAILABLE` mesajı; yeni satır yok |
| `v<n> çalıştır` | authorized=true iken click | `Çalıştırmalar ve kanıtlar` → `Kalıcı AI testi çalıştırmaları`'nda seçili yeni satır |
| `v<n> çalıştır` | `Origin yetkisiz` rozetli satır | `disabled` |
| `v1 çalıştır` (eski sürüm) | click | Çalıştırma satırı `v1 · ...`, ayrıntı `Test v1` (eski sürüm hâlâ çalıştırılabilir) |

### TC-05: Negative & edge cases
- **ELEMENT_UNAVAILABLE:** `Elementler` → `elementKey` düzenleyici → **`Elementi onayla`** işaretini kaldır → **`Kaydet`**. **`Testler`**: en son sürüm satırında `güncel olmayan element (1)` rozeti, `title` `<elementKey>: v<x> → v<x+1> (onaysız)`. **`Yeni sürüm oluştur`**. Assert: `role="alert"` `Error: Yeni sürüm oluşturulamadı; kullanılamayan elementler: <elementKey> (onaysız). Elementi onaylayın ya da testi yeniden üretin. (ELEMENT_UNAVAILABLE)` (HTTP 409); grupta yeni satır yok. Temizlik: elementi tekrar onayla ve kaydet.
- **TEST_UP_TO_DATE:** Rozetsiz (güncel) en son sürüm için DevTools'ta `fetch('/api/v1/projects/20000000-0000-4000-8000-000000000001/ai/tests/<testId>/versions',{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify({expectedRevision:<en son sürüm>})}).then(r=>r.json())`. Assert: HTTP 409, `{code:"TEST_UP_TO_DATE", message:"Test zaten güncel element sürümlerini kullanıyor."}`; **`Testler`** yenilenince yeni satır yok. (UI bu durumda butonu göstermez; doğrulama API düzeyindedir.)
- **REVISION_CONFLICT (eş zamanlı):** Elementi yeniden adlandırıp stale yap (TC-01 adım 4). İki sekmede **`Testler`**'i aç. Sekme A'da **`Yeni sürüm oluştur`** → başarı. Sekme B'yi yenilemeden **`Yeni sürüm oluştur`**. Assert: Sekme B'de `role="alert"` `Error: Test bu arada değişti (güncel sürüm v<n>). (REVISION_CONFLICT)`; tek bir yeni sürüm oluşmuş.
- **Origin yetkisiz:** `Ayarlar` → `Test edilecek siteler` listesinden testin hedef origin'i (harici HTTPS bir hedef kullanılıyorsa) kaldırılır. **`Testler`**: satırda `Origin yetkisiz` rozeti ve **`v<n> çalıştır`** `disabled`. Varsayılan `http://127.0.0.1:4100` kaldırılamıyorsa bu madde `n/a` raporlanır. Temizlik: origin'i geri ekle.
- **Boş durum:** Kalıcı AI testi olmayan temiz veride Assert: sayı etiketi `0` ve `Onaylı bir AI suite’i “Kalıcı teste dönüştür” ile burada sürümlü teste çevirin.`
- **Viewer (UI ile erişilemez):** Yerel oturum her zaman `admin` açar; `viewer` oturumu UI'dan oluşturulamadığı için bu kontrol `n/a`. Kaynağa göre `viewer`'da `Yeni sürüm oluştur` ve `v<n> çalıştır` `disabled`, API `Düzenleme yetkisi gerekli. (FORBIDDEN)` döner.

## Assertions
- [ ] Kart başlığı `Kalıcı AI testleri`, grup sayısı etiketi ve hint metni doğru.
- [ ] Sürüm satırı `v<n> · <n> senaryo · <m> element · <origin> · SHA-256 <12 hex>… · <tarih>` biçiminde.
- [ ] `güncel olmayan element (<n>)` yalnız en son sürümde ve yalnız stale iken görünür; `Yeni sürüm oluştur` yalnız o zaman görünür.
- [ ] Yeni sürüm sonrası mesaj `... v<n+1> oluşturuldu (...). v<n> değişmedi.`; eski sürümün checksum'ı değişmez.
- [ ] `ELEMENT_UNAVAILABLE`, `TEST_UP_TO_DATE`, `REVISION_CONFLICT` hataları belirtilen metinlerle döner; yeni sürüm oluşmaz.
- [ ] `v<n> çalıştır` `Çalıştırmalar ve kanıtlar`'a geçer ve yeni çalıştırmayı seçili gösterir; kanıtsız `Başarılı` yok.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (400 `INVALID_INPUT`, 409 `ELEMENT_UNAVAILABLE`/`TEST_UP_TO_DATE`/`REVISION_CONFLICT`).

## Screenshots required
- Page initial load (`Kalıcı AI testleri`, v1 satırı)
- `güncel olmayan element (1)` rozeti + `Yeni sürüm oluştur` butonu
- Yeni sürüm başarı mesajı (`role="status"`) ve v2/v1 satırları
- Each validation error state: `ELEMENT_UNAVAILABLE` ve `REVISION_CONFLICT` uyarıları
- Final state after the happy path (`Kalıcı AI testi çalıştırmaları` seçili v2 ayrıntısı)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
