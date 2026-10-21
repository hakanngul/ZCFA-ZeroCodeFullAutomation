# T21-calistirmalar-kalici-ai-calistirmalari: Kalıcı AI testi çalıştırmaları — seçim, ayrıntı, self-healing özeti

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/promoted-tests.tsx` (`PromotedRuns`) |
| Flow | Çalıştırmalar bölümü → "Kalıcı AI testi çalıştırmaları" kartı: satır seçimi ve ayrıntı |
| Requires auth | yes (yerel demo oturumu) |
| Required role | admin |
| Destructive | no |
| Estimated steps | 26 |

## Preconditions
- App running at `http://127.0.0.1:5173`
- Signed in as admin: **"Yerel çalışma alanını aç"** → kenar çubuğu **"Çalıştırmalar"**.
- Seed: ≥ 1 tamamlanmış kalıcı AI testi çalıştırması (hedef `http://127.0.0.1:4100`), tercihen ekran görüntülü.
- Self-healing için (TC-03): birincil locator'ı kırılmış ama alternatif locator'la bulunan en az bir adımı olan kalıcı AI testi çalıştırması (`healedSteps ≥ 1`). Yoksa TC-03 "seed yok" olarak atlanır ve raporlanır.
- TC-05 polling kontrolü için: Testler bölümünde **`v<n> çalıştır`** butonu etkin bir kalıcı AI testi.

## Test data
- `aiRow` = "Kalıcı AI testi çalıştırmaları" tablosunda en üstteki tamamlanmış satır; `aiId8` = alt satırdaki 8 karakter
- `secondAiRow` = varsa ikinci satır; `secondId8`
- `healedRow` = healedSteps ≥ 1 olan satır; `healedId8`
- `expectedTarget = "http://127.0.0.1:4100"` (Hedef sütunu origin'i)

## Steps

### TC-01: Happy path — Kalıcı AI çalıştırmasını seç ve ayrıntıyı incele
1. Navigate to `http://127.0.0.1:5173` → **"Yerel çalışma alanını aç"** → **"Çalıştırmalar"**.
2. Assert: `h2` "Kalıcı AI testi çalıştırmaları" görünür; etiket `Son <n> çalıştırma`, `n ≥ 1`.
3. Assert: tablo başlıkları `Test / sürüm`, `Hedef`, `Durum`, `Başlangıç` ve başlıksız işlem sütunu.
4. Assert: `aiRow` başlığı test adı; alt satırı `v<revision> · <aiId8>`; Hedef `expectedTarget`; Durum rozeti `Başarılı` veya `Başarısız`.
5. aria-label `<aiId8> AI test çalıştırma ayrıntıları` butonunu tıkla.
6. Assert: satır vurgulanır (`selected-row`); `GET /v1/projects/<projectId>/ai/test-runs/<uuid>` 200.
7. Assert: ayrıntı alanı meta satırında `<test adı> · Test v<n>`, plan targetUrl (`http://127.0.0.1:4100/...`), `Plan SHA-256 <12 hex>…` (title 64 hex) ve durum rozeti gösterir.
8. Assert: sayım satırı `<p> başarılı · <f> başarısız · <s> atlandı` biçimindedir ve toplamı senaryo sayısına eşittir.
9. Assert: her senaryo için `<senaryo başlığı>: <rozet>` başlığı ve adım zinciri `<kind>…: <status>` öğelerinin ` → ` ile birleşimi görünür.
10. Senaryonun ekran görüntüsü varsa Assert: alt metni `<senaryo başlığı> kanıt görüntüsü` olan `<img>` yüklenir (`/api/v1/projects/<projectId>/ai/test-runs/<uuid>/screenshots/<index>`, HTTP 200); tıklayınca yeni sekmede açılır.
11. Başarısız senaryo varsa Assert: `Hata: <code>` paragrafı görünür.

### TC-02: Seçim değiştirme
1. `secondAiRow` varsa aria-label `<secondId8> AI test çalıştırma ayrıntıları` tıkla.
2. Assert: vurgu `secondAiRow`'a geçer; ayrıntı meta ve senaryolar ikinci çalıştırmaya aittir; ilk çalıştırmanın ayrıntısı görünmez.
3. Tekrar `aiRow` seç. Assert: ayrıntı ilk çalıştırmaya döner.

### TC-03: Self-healing özeti — "N adım alternatifle bulundu"
1. aria-label `<healedId8> AI test çalıştırma ayrıntıları` tıkla.
2. Assert: `role="status"` paragrafı `<N> adım alternatifle bulundu (self-healing). Öneriler Elementler ekranında.` metnini gösterir (N ≥ 1).
3. Assert: adım zincirinde iyileşen adım(lar) `[alternatifle bulundu: <locator>]` ekini taşır; locator role tipindeyse `role=<rol> "<değer>"`, diğerlerinde `<kind>: <değer>` biçimindedir; bu eklerin sayısı N'ye eşittir.
4. healedSteps = 0 olan `aiRow`'u seç. Assert: self-healing paragrafı YOKTUR.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `<id8> AI test çalıştırma ayrıntıları` | click | ayrıntı o çalıştırma için açılır, satır vurgulanır |
| Senaryo ekran görüntüsü bağlantısı | click | yeni sekmede `/screenshots/<index>` |
| Kenar çubuğu `Çalıştırmalar` | başka bölümden dönüş | seçili AI çalıştırma ayrıntısı korunur (aiTestRunId üst bileşende tutulur) |

### TC-05: Negative & edge cases
- Boş durum: kalıcı AI çalıştırması olmayan veri dizininde "Henüz kalıcı AI testi çalıştırılmadı." ve `Son 0 çalıştırma`.
- Canlı yenileme: Testler'de kalıcı AI testi için **`v<n> çalıştır`** tıkla → Çalıştırmalar'a dön. Assert: yeni satır `Kuyrukta`/`Çalışıyor` (dönen ikon) ile en üstte; sayfa yenilenmeden ~1 sn aralıkla güncellenir ve `Başarılı`/`Başarısız`'a geçer; seçiliyse ayrıntı da güncellenir.
- Etiket boşluğu: `timed_out` veya `cancelled` durumlu bir AI çalıştırması varsa rozet ham `timed_out`/`cancelled` gösterir (Türkçe etiket yok) — bulgu olarak kaydet; beklenen Türkçe karşılıklar `Zaman aşımı`/`İptal`.
- `GET /v1/projects/<projectId>/ai/test-runs/00000000-0000-4000-8000-000000000000` → 4xx/404; UI'da bu çağrı hata olursa kartta `role="alert"` paragrafı çıkar.
- Origin yetkisi kaldırılmış hedefte (Ayarlar → Test edilecek siteler) çalıştırılan test `Engellendi` görünür ve ayrıntıda `Kod: <code>` gösterilir.

## Assertions
- [ ] Kart başlığı, etiket ve tablo sütunları kaynakla birebir.
- [ ] Satır seçimi ayrıntıyı doğru çalıştırma için açar ve satırı vurgular.
- [ ] Meta satırı Test v, targetUrl, `Plan SHA-256 <12>…` ve durum içerir.
- [ ] Sayım satırı ve senaryo/adım zinciri görünür.
- [ ] healedSteps > 0 iken "adım alternatifle bulundu (self-healing)" status mesajı; 0 iken yok.
- [ ] Ekran görüntüleri yüklenir (HTTP 200).
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- "Kalıcı AI testi çalıştırmaları" kartı ilk yükleme
- Seçili çalıştırma ayrıntısı (meta + sayım + senaryolar)
- Self-healing özeti görünür halde
- Kuyrukta/Çalışıyor satırı
- Boş durum (varsa)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
