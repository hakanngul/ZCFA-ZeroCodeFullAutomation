# T16-test-calisma-alani-calistirma-ortami-varyantlar: Çalıştırma ortamı olumsuz kontrolleri ve yayınlanan sürümün değişmezliği

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Test çalışma alanı (`section === "tests"`) — `Çalıştırma ortamı` / `Demo kontrolü` varyantları + `Klasik yayınlanan testler` |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 32 |

## Preconditions
- `pnpm dev` çalışıyor (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker, web). Uygulama `http://127.0.0.1:5173`; web 5173'teyse `ZC_WEB_PORT=5173` ayarlı.
- `admin` rolüyle oturum aç: `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** (kimlik bilgisi yok).
- Onaylı model, `dashboard.balance` onaylı (T14 Preconditions).
- Sidebar **`Testler`** (sayfa başlığı `Test çalışma alanı`).
- Kuyrukta 20'den az bekleyen iş (aksi halde `Kuyruk dolu`).
- Invariant: assertion veya ekran görüntüsü kanıtı yoksa hiçbir çalıştırma `Başarılı` olamaz.

## Test data
- `titleOk` = `"QA Varyant Testi {runId}"`, bakiye işaretli, `expectedOk` = `"1.250,00 TL"`
- `titleWrong` = `"QA Yanlış Bakiye {runId}"`, bakiye işaretli, `expectedWrong` = `"9.999,00 TL"`
- Varyant seçenekleri (görünen etiket → değer): `Sağlam uygulama` → `healthy`, `Bozuk dashboard` → `broken`, `Belirsiz giriş butonu` → `ambiguous`, `Yavaş uygulama` → `slow`

## Steps

### TC-01: Happy path — `titleOk` testini yayınla ve dört varyantta çalıştır
1. Sidebar **`Testler`** → **`Yeni test`**. **`Test adı`** = `titleOk`; **`Bakiyeyi de doğrula`** işaretle; **`Beklenen metin`** = `expectedOk`.
2. **`Doğrula ve yayınla`**. Assert: `Yayınlanan test`, `Sürüm 1 · Salt okunur`.
3. `Çalıştırma ortamı` → **`Demo kontrolü`** açılır listesini aç. Assert: seçenekler sırasıyla `Sağlam uygulama`, `Bozuk dashboard`, `Belirsiz giriş butonu`, `Yavaş uygulama`; hint `Olumsuz kontroller, gerçek uygulama hatalarının PASS olarak görünmediğini sınar.`
4. **`Demo kontrolü`** = `Sağlam uygulama`. **`Testi çalıştır`**.
5. Assert: `Çalıştırmalar ve kanıtlar` bölümü; yeni satır `Demo kontrolü` sütunu `Sağlam uygulama`; ≤ 30 sn içinde rozet `Başarılı`, `2 assertion yürütüldü`, ekran görüntüsü görseli mevcut.
6. Sidebar **`Testler`** → `Klasik yayınlanan testler`'de `titleOk` öğesine tıkla. Assert: `Sürüm 1 · Salt okunur`.
7. **`Demo kontrolü`** = `Bozuk dashboard`. **`Testi çalıştır`**.
8. Assert: yeni satır `Bozuk dashboard`; ≤ 30 sn içinde rozet `Başarısız`; sonuç kodu kutusunda `ASSERTION_FAILED`; `Dashboard` adımı kırmızı X ve `Beklenen: true · Gözlenen: false`; `Bakiye` adımı listede YOK (onStepError=stop); `1 assertion yürütüldü`; ekran görüntüsü mevcut.
9. **`Testler`** → `titleOk` → **`Demo kontrolü`** = `Belirsiz giriş butonu` → **`Testi çalıştır`**.
10. Assert: yeni satır `Belirsiz giriş butonu`; rozet `Engellendi`; sonuç kodu `AMBIGUOUS_ELEMENT`; `Giriş yap` adımı kırmızı X ve altında `AMBIGUOUS_ELEMENT`; `0 assertion yürütüldü`; rozet `Başarılı` DEĞİL.
11. **`Testler`** → `titleOk` → **`Demo kontrolü`** = `Yavaş uygulama` → **`Testi çalıştır`**.
12. ≤ 40 sn bekle. Assert: rozet `Başarılı` DEĞİL. Statik analize göre beklenen rozet `Engellendi` ve kod `ELEMENT_NOT_FOUND` (dashboard yanıtı 8 sn gecikir, locator 1,5 sn bekler); `Zaman aşımı` + `RUN_TIMEOUT` gözlenirse TC yine geçer, gözlenen değer raporlanır.
13. Assert: `Çalıştırma geçmişi` tablosunda bu görev için 4 satır var ve `Demo kontrolü` sütunları sırasıyla (yeniden eskiye) `Yavaş uygulama`, `Belirsiz giriş butonu`, `Bozuk dashboard`, `Sağlam uygulama`.

### TC-02: Form validation — `runtime-environment`
`Demo kontrolü` serbest metin değildir; yalnız 4 sabit seçenek vardır.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Demo kontrolü | n/a (varsayılan `Sağlam uygulama`) | Listede dışı değer seçilemez; API'ye `variant:"evil"` → `Alanları kontrol edin. (INVALID_INPUT)` | n/a |

1. Sayfayı yenile, **`Testler`**'e git. Assert: **`Demo kontrolü`** değeri `Sağlam uygulama` (varsayılan; seçim kalıcı değildir).
2. DevTools konsolunda `fetch('/api/v1/tests/<titleOk testId>/runs',{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({variant:'evil'})}).then(r=>r.status)` çalıştır (`testId` için `Teknik` sekmesindeki JSON). Assert: `400`; `Çalıştırma geçmişi`'nde yeni satır oluşmaz.

### TC-03: Modal coverage — yok
Bu bölümde modal/dialog yoktur. Atlanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Testi çalıştır` + `Sağlam uygulama` | click | `Başarılı`, kanıt mevcut |
| `Testi çalıştır` + `Bozuk dashboard` | click | `Başarısız`, `ASSERTION_FAILED` |
| `Testi çalıştır` + `Belirsiz giriş butonu` | click | `Engellendi`, `AMBIGUOUS_ELEMENT` |
| `Testi çalıştır` + `Yavaş uygulama` | click | `Başarılı` değil (`Engellendi`/`Zaman aşımı`) |
| Klasik test öğesi | click | Seçilen sürüm salt okunur açılır |
| `Yeni taslak oluştur` | click | Taslak görünümü; listedeki yayınlanmış test değişmez |

### TC-05: Negative & edge cases
- **Yanlış beklenen bakiye:** **`Yeni test`**; `Test adı` = `titleWrong`; bakiye işaretli; `Beklenen metin` = `expectedWrong`; **`Doğrula ve yayınla`**; `Demo kontrolü` = `Sağlam uygulama`; **`Testi çalıştır`**. Assert: rozet `Başarısız`, kod `ASSERTION_FAILED`, `Dashboard` adımı yeşil, `Bakiye` adımı kırmızı ve `Beklenen: 9.999,00 TL · Gözlenen: 1.250,00 TL`, `2 assertion yürütüldü`. Platform beklenen değeri değiştirmez: **`Testler`** → `titleWrong` öğesi → İş adımları `03` hâlâ `Bakiye metni “9.999,00 TL” olmalı`.
- **Yayınlanan sürüm değişmezliği:** `titleOk` öğesini seç → `Teknik` sekmesindeki JSON'u kaydet. **`Yeni taslak oluştur`** → `Test adı`'nı `"Değişiklik denemesi {runId}"` yap (YAYINLAMA). Tekrar `titleOk` öğesine tıkla. Assert: `Teknik` JSON birebir aynı (`title`, `testId`, `revision: 1`, `steps`); `Sürüm 1 · Salt okunur`.
- **Plan checksum'ı:** TC-01'deki dört çalıştırmanın ayrıntılarında `SHA-256 <12 hex>…` değeri aynıdır (aynı plan snapshot'ı; varyant planın parçası değildir).
- **Kanıtsız PASS yok:** Hiçbir çalıştırma ayrıntısında `Başarılı` rozeti ile birlikte `Bu sonuçta adım yürütme kanıtı yok. Başarılı test sayılmaz.` veya `Ekran görüntüsü mevcut değil.` metni görünmez.

## Assertions
- [ ] `Demo kontrolü` 4 seçeneği tam etiketlerle listeler; varsayılan `Sağlam uygulama`.
- [ ] `Sağlam uygulama` → `Başarılı`; `Bozuk dashboard` → `Başarısız`/`ASSERTION_FAILED`; `Belirsiz giriş butonu` → `Engellendi`/`AMBIGUOUS_ELEMENT`; `Yavaş uygulama` → `Başarılı` değil.
- [ ] Yanlış beklenen bakiye `Başarısız` olur; beklenen metin yayın sonrası değişmez.
- [ ] Yayınlanmış klasik test JSON'u taslak düzenlemesinden etkilenmez.
- [ ] `Çalıştırma geçmişi` `Demo kontrolü` sütunu seçilen varyantı gösterir.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02 adım 2: 400).

## Screenshots required
- Page initial load (`Çalıştırma ortamı` kartı, açık `Demo kontrolü` listesi)
- Her varyant için çalıştırma ayrıntısı (`Başarılı`, `Başarısız`, `Engellendi`, yavaş sonuç)
- `Beklenen: 9.999,00 TL · Gözlenen: 1.250,00 TL` durumu
- Final state after the happy path (`Çalıştırma geçmişi` dört varyant satırı)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
