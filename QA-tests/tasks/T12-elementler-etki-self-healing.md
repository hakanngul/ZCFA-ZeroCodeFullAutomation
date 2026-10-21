# T12-elementler-etki-self-healing: Etkilenen testler → yeni test sürümü ve self-healing önerileri (Birincil yap / Yoksay)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-element-editor.tsx` (`ElementImpact`), `apps/web/app/components/ai-element-list.tsx` (`HealSuggestions`) (bölüm: `apps/web/app/page.tsx` → `section === "elements"`) |
| Flow | Elementler bölümü → onaylı elementte değişiklik → `Etkilenen testler` → `Yeni sürüm oluştur` → `Yeni sürümü çalıştır`; `Self-healing önerileri` → `Birincil yap` / `Yoksay` (ADR 015, 016) |
| Requires auth | yes (yerel demo oturumu, kimlik bilgisi yok) |
| Required role | admin |
| Destructive | yes (yumuşak: `Yoksay` öneriyi kalıcı kapatır; yeni test sürümü geri alınamaz) |
| Estimated steps | 48 |

> Statik analizden üretildi. Çalıştırma durumları UI'da ham İngilizce değerlerle görünür (`queued`, `running`, `passed`, `failed` …).

## Preconditions
- App running at `http://127.0.0.1:5173`; API (`ZC_WEB_PORT=5173`), worker ve Chromium hazır; `https://www.saucedemo.com` Ayarlar → Test edilecek siteler'de izinli.
- Oturum: `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**. Rol `admin`.
- Seed (TC-01/02): SauceDemo için gözlenmiş elementler mevcut ve en az **1 kalıcı AI testi** (`{testTitle}`, son sürüm `v{T}`) onaylı kütüphane elementi `{pinnedKey}`'i (güncel sürüm `{pRev}`) **güncel sürümüyle** pinliyor (suite element onayından sonra onaylanıp Testler'de kalıcı teste terfi ettirilmiş). Başlangıçta `{pinnedKey}` panelinde `Etkilenen testler (0)` görünmeli; görünmüyorsa önce TC-01 adım 9–11 ile mevcut satır için yeni sürüm alın.
- Seed (TC-03/04): Ayarlar → Self-healing **açık** ve birincil locator'ı bulunamayıp onaylı bir alternatifle geçen en az **2 bekleyen self-healing önerisi** (farklı element veya locator). Yoksa TC-03/TC-04 BLOCKED-SEED.
- Yakalanan değerler: `{healKey}`, `{healLocator}` (öneride `… ile bulundu` kısmındaki locator), `{healRev}` (öneri satırındaki `v…` değil; elementin güncel sürümü — tablo satırından okunur).

## Test data
- `renamed = "QA Yeniden adlandırıldı {runId}"`
- `{originalName}` = `{pinnedKey}` panelindeki mevcut `Element adı` değeri (çalışma anında kaydedilir)
- `runTimeoutSec = 120` (yeni sürüm çalıştırmasının terminal duruma ulaşma süresi)
- `{runId}` = koşu başına 6 karakterlik küçük harf/rakam kimliği

## Steps

### TC-01: Happy path — Onaylı elementi yeniden adlandır, etkilenen teste yeni sürüm al ve çalıştır
1. `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**.
2. Assert: H1 `Elementler`; AI kartı görünür.
3. Aramaya `{pinnedKey}` yaz; satırda **`Düzenle`** (aria-label `{pinnedKey} düzenle`) tıkla.
4. Assert: aria-label `Etkilenen testler` bölümü `Etkilenen testler (0)` ve `Bu elementin eski sürümünü kullanan kalıcı test yok.` gösterir; `Elementi onayla` işaretli; `Elementi birleştir` bölümü **yok** (onaylı).
5. `Element adı` = `renamed` (locator'lara dokunma). **`Kaydet`** tıkla.
6. Assert: `Kaydedildi (sürüm {pRev+1}).` (onay kaldırıldı ibaresi **yok**); satır rozeti `Onaylı`, `v{pRev+1}`.
7. Assert: `Etkilenen testler (1)`; satırda `{testTitle} · test v{T} · {pinnedKey} pinli v{pRev} → güncel v{pRev+1}`; fark listesinde `Ad: {originalName} → QA Yeniden adlandırıldı {runId}`; `Yeni sürüm için önce onaylayın:` uyarısı **yok**.
8. Assert: `Yeni sürüm oluştur` butonu enabled.
9. **`Yeni sürüm oluştur`** tıkla.
10. Assert: `role="status"` = `Yeni sürüm v{T+1} oluşturuldu; önceki sürüm değişmedi.`; `Etkilenen testler (0)` (satır listeden düşer); yanında **`Yeni sürümü çalıştır`** butonu.
11. **`Yeni sürümü çalıştır`** tıkla.
12. Assert: `Çalıştırma {8 hex}: queued` (veya `running`) metni görünür ve buton terminal duruma kadar disabled.
13. En fazla `runTimeoutSec` saniye bekle (UI 1,5 sn'de bir yoklar).
14. Assert: metin `Çalıştırma {8 hex}: passed · {p} başarılı · 0 başarısız · {s} atlandı` olur (p ≥ 1); buton yeniden enabled.
15. Sidebar **`Testler`** → `{testTitle}`. Assert: son sürüm `v{T+1}`; `v{T}` hâlâ listelenir/değişmemiştir (kalıcılık).
16. **`Elementler`**'e dön, `{pinnedKey}` panelini aç. Assert: `Etkilenen testler (0)`.

### TC-02: Form validation — yeni sürüm engelleri
| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Onay (`Elementi onayla`) | `{pinnedKey}` panelinde bir alternatifin `Birincil yap`'ı → **`Kaydet`** → `Kaydedildi (sürüm {pRev+2}). Locator değiştiği için onay kaldırıldı.`; `Etkilenen testler (1)` satırında `Birincil: {eski} → {yeni}` ve uyarı `Yeni sürüm için önce onaylayın: {pinnedKey} (onaysız)`; `Yeni sürüm oluştur` **disabled** | n/a | n/a |
| Yeniden onay | `Elementi onayla` işaretle → **`Kaydet`** → `Kaydedildi (sürüm {pRev+3}).`; uyarı kaybolur, `Yeni sürüm oluştur` enabled | n/a | n/a |

Temizlik: bu adımdan sonra `Yeni sürüm oluştur` tıklayıp `Yeni sürüm v{T+2} oluşturuldu; önceki sürüm değişmedi.` doğrulanır (test en güncel pinle kalır).

### TC-03: Modal coverage — `Self-healing önerileri` bölümü (modal yok; satır içi bölüm)
1. Sayfayı yenile → `Elementler`.
2. Assert: aria-label `Self-healing önerileri` bölümü, başlık `Self-healing önerileri ({h})` (h ≥ 2) ve açıklama `Çalıştırmada birincil locator bulunamadı, onaylı bir alternatifle bulundu. Birincil yapmak elementin yeni sürümünü oluşturur; etkilenen testler için yeni sürüm ayrıca onaylanır.` görünür.
3. Assert: her öneri satırı `{ad} {healKey} · v{r} · birincil {primary} bulunamadı → {healLocator} ile bulundu · {n} adım · test|suite çalışması {8 karakter} · {tarih}` biçimindedir.
4. İlk öneride **`Birincil yap`** (aria-label `{healKey} için {healLocator} birincil yap`) tıkla.
5. Assert: `role="status"` = `{healKey}: {healLocator} birincil yapıldı (sürüm {healRev+1}); eski birincil alternatiflerin sonuna taşındı.`; altında `Etkilenen testler (…)` bölümü render edilir; başlık `Self-healing önerileri ({h-1})`.
6. Assert: tablo yeniden yüklenir; `{healKey}` satırı Locator hücresinde `{healLocator}`, rozet `Onaylı` (onay korunur), `v{healRev+1}`.
7. `{healKey}` panelini aç → `Geçmiş`. Assert: en üst satır `v{healRev+1} Self-healing önerisi birincil yapıldı`; alternatif listesinin **son** öğesi eski birincil locator.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Birincil yap` (öneri) | click | TC-03 adım 5–6 |
| `Yoksay` (kalan öneri) | click → iptal yolu yok (confirm yok; bulgu) | Öneri listeden kalkar; başlık sayısı 1 azalır; ilgili elementin satırı ve `v…` sürümü **değişmez**; sayfa yenilenince öneri geri gelmez |
| `Birincil yap` / `Yoksay` işlem sürerken | gözle | Tüm öneri butonları disabled (`busy`) |
| `Birincil yap` (elementi birleştirilmiş öneri, koşullu) | gözle | Disabled; yoksa N/A |
| `Yeni sürüm oluştur` | TC-01 adım 9 | Durum mesajı + satır düşer |
| `Yeni sürümü çalıştır` | TC-01 adım 11 | `Çalıştırma … : queued` → terminal |

### TC-05: Negative & edge cases
**a) `REVISION_CONFLICT` — öneri listesi bayat**
1. Sekme A: `Elementler` açık, bekleyen bir öneri (`{healKey2}`) görünür (yenileme yapma).
2. Sekme B: `{healKey2}` panelinde `Element adı` değiştir → **`Kaydet`** (`Kaydedildi (sürüm …).`).
3. Sekme A: o önerinin **`Birincil yap`**'ı.
4. Assert: bölümde `role="alert"` = `Error: Element değişti. Güncel sürümü açıp değişikliği tekrar uygula. (REVISION_CONFLICT)`; öneri listede kalır.
5. Sekme A'da aynı **`Birincil yap`**'ı tekrar tıkla. Assert (bilinen kusur): yine aynı 409 döner, çünkü hata sonrası liste yeniden çekilmez; sayfa yenilenince işlem başarılı olur. Bu davranışı bulgu olarak raporla.

**b) `SUGGESTION_STALE` — locator artık alternatif değil (koşullu, bekleyen öneri kaldıysa)**
1. Önerinin elementinin panelinde `{healLocator}` alternatifini **`Kaldır`** → **`Kaydet`** (onay kalkar).
2. Sayfayı yenile (öneri listesi güncel sürümü alır). **`Birincil yap`**.
3. Assert: `Error: Bu locator artık elementin alternatifleri arasında değil. (SUGGESTION_STALE)`.

**c) Diğer**
- Yeni sürüm sırasında bir referans onaysız/silinmişse (TC-02 durumu) buton disabled olduğundan `ELEMENT_UNAVAILABLE` UI'dan tetiklenmez; uyarı metni yeterli kanıttır.
- Çalıştırma 120 sn içinde terminal olmazsa (`queued`/`running` kalırsa) TC-01 FAIL (worker/lease sorunu; `infrastructure_error` görünürse ayrıca raporla).

## Assertions
- [ ] `Etkilenen testler ({n})` sayısı ve satır biçimi `… · test v{T} · {key} pinli v{a} → güncel v{b}`.
- [ ] Fark satırları: `Ad: … → …`, `Birincil: … → …`, `Alternatif eklendi: …`, `Alternatif kaldırıldı: …` veya `Locator ve ad aynı (yalnız onay/sayfa değişti).`
- [ ] Onaysız referansta `Yeni sürüm için önce onaylayın: {key} (onaysız)` + disabled buton.
- [ ] `Yeni sürüm v{N} oluşturuldu; önceki sürüm değişmedi.` ve çalıştırma terminal `passed`.
- [ ] `… birincil yapıldı (sürüm N); eski birincil alternatiflerin sonuna taşındı.`; onay korunur.
- [ ] `Yoksay` elementi değiştirmez.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-05 a/b 409).

## Screenshots required
- Page initial load (öneri bölümü görünür)
- `Etkilenen testler (1)` satırı ve fark listesi
- Each validation error state (TC-02 onaysız uyarısı, TC-05 a/b hataları)
- `Yeni sürüm v… oluşturuldu` + terminal çalıştırma satırı
- `Birincil yap` sonrası durum mesajı
- Final state after the happy path

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
