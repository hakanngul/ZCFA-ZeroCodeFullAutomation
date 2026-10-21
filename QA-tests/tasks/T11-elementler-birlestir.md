# T11-elementler-birlestir: Destructive — `Birleştir` (kopya AI elementini emekli et)

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-element-editor.tsx` (`MergeElement`), `apps/web/app/components/ai-element-list.tsx` (bölüm: `apps/web/app/page.tsx` → `section === "elements"`) |
| Flow | Elementler bölümü → AI element paneli → `Birleştir` bölümü: onaysız kopyayı aynı sayfadaki hedefe birleştir (ADR 016) |
| Requires auth | yes (yerel demo oturumu, kimlik bilgisi yok) |
| Required role | admin |
| Destructive | yes (kaynak kayıt geri alınamaz biçimde emekli edilir; UI'da geri alma yok) |
| Estimated steps | 40 |

> Statik analizden üretildi. **Bulgu:** `Birleştir` butonu onay penceresi (confirm) olmadan doğrudan işlemi yapar; "iptal" yolu yalnız hedef seçmemek / paneli kapatmaktır.

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT=5173` ile başlatılmış olmalı; aksi halde POST istekleri 403 `CSRF_BLOCKED`).
- Oturum: `http://127.0.0.1:5173` açılır → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**. Rol `admin` (`Yerel yönetici`).
- Seed: SauceDemo için gözlenmiş elementler mevcut (AI keşfi en az bir kez çalışmış). `https://www.saucedemo.com/` (veya `/inventory.html`) grubunda:
  - en az **2 harcanabilir onaysız** element (`Bekliyor`): `{dupKey}` (TC-01 kaynağı) ve `{dup2Key}` (TC-05 kaynağı); kalıcı testlere bağlı olmamalı ("Etkilenen testler (0)").
  - en az **1 onaylı** hedef element `{targetKey}` (sürümü `{tRev}`), alternatif + öneri toplamı < 5.
  - Harcanabilir kayıt yoksa: önce yeni bir AI keşfi çalıştırın; yine yoksa TC-01/TC-05 BLOCKED-SEED.
- Yakalanan değerler: `{dupPrimary}` = `{dupKey}` satırının Locator hücresindeki birincil locator metni; `{pageCount}` = grup başlığındaki `{n} element`.

## Test data
- `targetSelectOption = "{targetKey} · {targetName} · onaylı · {targetLocator}"` (Birleştirme hedefi seçeneği biçimi)
- `emptyTarget = "Seçin"`
- `staleName = "QA Hedef yeniden adlandırma {runId}"`
- `mergedEditName = "QA Emekli düzenleme {runId}"`
- `{runId}` = koşu başına 6 karakterlik küçük harf/rakam kimliği

## Steps

### TC-01: Happy path — Onaysız kopyayı onaylı hedefe birleştir
1. `http://127.0.0.1:5173` → **`Yerel çalışma alanını aç`** → sidebar **`Elementler`**.
2. Assert: H1 `Elementler`; AI kartı `Web sitelerinden kaydedilen elementler` görünür.
3. Hedef grubun başlığındaki `{pageCount}` değerini kaydet. `{targetKey}` satırındaki `v{tRev}` değerini ve öneri rozetini (`{s} öneri` ya da yok → s=0) kaydet.
4. `{dupKey}` satırında **`Düzenle`** tıkla.
5. Assert: panelde aria-label `Elementi birleştir` bölümü, `Birleştir` başlığı ve metin `Bu onaysız kayıt başka bir elementin kopyasıysa birleştirin: locator'ları hedefe taşınır (onaylı hedefte önerilen alternatif olur), bu kayıt silinmeden emekli edilir ve geçmişi korunur.` görünür.
6. Assert: `Birleştirme hedefi` select'i varsayılan `Seçin`; **`Birleştir`** butonu disabled.
7. Assert: select seçenekleri arasında `{dupKey}` **yoktur** (kendisi listelenmez) ve onaylı elementler (` · onaylı` ekli) üstte sıralanır.
8. `Birleştirme hedefi` = `targetSelectOption` seç. Assert: `Birleştir` butonu enabled.
9. **`Birleştir`** tıkla.
10. Assert: buton kısa süre `Birleştiriliyor…` gösterir; ardından panel kapanır ve liste üstünde `role="status"` bildirimi birebir: `{dupKey} kaydı {targetKey} elementine birleştirildi (sürüm {tRev+1}); kopya emekli edildi, geçmişi korunuyor.`
11. Assert: grup başlığı `{pageCount-1} element`; `{dupKey}` satırı listede yoktur; arama kutusuna `{dupKey}` yazınca `{dupKey}` anahtarlı satır gelmez.
12. Assert: `{targetKey}` satırı `v{tRev+1}`, rozet `Onaylı` (değişmedi), Locator hücresinde öneri rozeti `{s+k} öneri` (k ≥ 1; `{dupPrimary}` zaten hedefte biliniyorsa k=0 olabilir).
13. `{targetKey}` için **`Düzenle`**. Assert: `Önerilen alternatifler (…)` listesinde `{dupPrimary}` vardır (k ≥ 1 ise); `Geçmiş` açılınca en üst satır `v{tRev+1} Kopya element birleştirildi`.
14. Sayfayı yenile → `Elementler`. Assert: `{dupKey}` hâlâ listede yoktur; `{targetKey}` `v{tRev+1}`.

### TC-02: Form validation — `ai-element-merge`
| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| `Birleştirme hedefi` | `Seçin` seçiliyken `Birleştir` disabled (istek gönderilmez) | Farklı sayfadaki elementler seçeneklerde yer almaz (UI `PAGE_MISMATCH`'i engeller); kaynak kendisi seçeneklerde yoktur (`MERGE_SAME_ELEMENT` engellenir) | n/a |
| Kaynak onay durumu | Onaylı bir elementin panelinde `Elementi birleştir` bölümü **hiç render edilmez** (UI `ELEMENT_APPROVED`'ı engeller) | n/a | n/a |

API ile sunucu korumasını doğrula (DevTools Console, `{keyApproved}` = aynı sayfadaki onaylı element, `{targetKey}` = aynı sayfadaki başka element):
```js
const p='/api/v1/projects/20000000-0000-4000-8000-000000000001/ai/elements';
const all=(await (await fetch(`${p}?limit=500`)).json()).elements;
const s=all.find(x=>x.elementKey==='{keyApproved}'), t=all.find(x=>x.elementKey==='{targetKey}');
const r=await fetch(`${p}/${s.id}/merge`,{method:'POST',headers:{'Content-Type':'application/json','X-ZeroCode-Client':'local-ui'},body:JSON.stringify({expectedRevision:s.revision,targetId:t.id,targetRevision:t.revision})});
console.log(r.status, await r.json());
```
Assert: `409` ve `{code:"ELEMENT_APPROVED", message:"Onaylı element birleştirilemez; önce onayını kaldırın."}`; her iki elementin sürümü değişmez.

### TC-03: Modal coverage — onay penceresi yok
1. `{dup2Key}` için **`Düzenle`**. Hedef olarak `{targetKey}` seç.
2. Assert: hiçbir dialog/`window.confirm` açılmaz; `Birleştir` tek tıkla işlem yapacak durumdadır (bulgu olarak raporla).
3. "İptal" yolu: `Birleştirme hedefi` = `Seçin`'e geri al. Assert: `Birleştir` disabled.
4. Panelin **`Kapat`** butonunu tıkla. Assert: panel kapanır; `{dup2Key}` listede, sürümü ve `Bekliyor` rozeti değişmemiştir; ağ sekmesinde `/merge` isteği yok.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Birleştir` (hedef `Seçin`) | click denemesi | Disabled; istek yok |
| `Birleştir` (hedef seçili) → iptal (`Seçin`'e dön + `Kapat`) | click yok | Durum değişmez, `{dup2Key}` görünür |
| `Birleştir` (hedef seçili) → proceed | click | Kaynak listeden kalkar; bildirim `… kaydı … elementine birleştirildi (sürüm N); kopya emekli edildi, geçmişi korunuyor.` |
| `Birleştir` (onaysız hedef, koşullu) | click | Hedefin Locator hücresinde `+{n} alternatif` artar (öneri değil); hedef `Bekliyor` kalır |

### TC-05: Negative & edge cases
**a) `REVISION_CONFLICT` — hedef bu arada değişti**
1. Sekme A: `{dup2Key}` `Düzenle` → hedef `{targetKey}` seç (bırak).
2. Sekme B: `{targetKey}` `Düzenle` → `Element adı` = `staleName` → **`Kaydet`**. Assert: `Kaydedildi (sürüm …).`
3. Sekme A: **`Birleştir`**.
4. Assert: `Elementi birleştir` bölümü içinde `role="alert"` = `Error: Element değişti. Güncel sürümü açıp değişikliği tekrar uygula. (REVISION_CONFLICT)`; `{dup2Key}` listede kalır.

**b) `ELEMENT_MERGED` — emekli kaydı düzenleme**
1. Sekme A: sayfayı yenile → `{dup2Key}` `Düzenle` aç, `Element adı` = `mergedEditName` yaz (kaydetme).
2. Sekme B: sayfayı yenile → `{dup2Key}` `Düzenle` → hedef `{targetKey}` → **`Birleştir`**. Assert: birleştirme bildirimi görünür.
3. Sekme A: **`Kaydet`**.
4. Assert: `Error: Bu element başka bir elemente birleştirildi; birleştirilen elementi düzenleyin. (ELEMENT_MERGED)`; Sekme A yenilenince `{dup2Key}` listede yoktur.

**c) Sınır aşımı (koşullu)** — Onaylı hedefin önerileri zaten 5 ise: bildirim gelir ancak `Önerilen alternatifler` sayısı 5'te kalır (eklenmeyen locator'lar sunucu yanıtında `skipped` olarak raporlanır). Hedefte 5 öneri yoksa N/A.

## Assertions
- [ ] `Elementi birleştir` bölümü yalnız onaysız elementte görünür.
- [ ] `Birleştir` hedef seçilmeden disabled; seçenekler yalnız aynı sayfanın diğer elementleri.
- [ ] Başarı bildirimi birebir: `{src} kaydı {target} elementine birleştirildi (sürüm N); kopya emekli edildi, geçmişi korunuyor.`
- [ ] Emekli kayıt listeden ve sayfa sayacından düşer; yenilemeden sonra da görünmez.
- [ ] Hedef yeni sürüm alır; onaylı hedefte locator'lar önerilen alternatif olur, onay korunur; geçmişte `Kopya element birleştirildi`.
- [ ] `ELEMENT_APPROVED`, `REVISION_CONFLICT`, `ELEMENT_MERGED` beklenen metinlerle görünür.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected (TC-02 API 409, TC-05 a/b 409).

## Screenshots required
- Page initial load
- `Birleştir` bölümü (hedef `Seçin` + disabled buton) ve hedef seçili hâli
- Each validation error state (TC-02 API yanıtı konsolu, TC-05 a ve b hataları)
- Birleştirme bildirimi ve hedefin `{n} öneri` rozeti
- Final state after the happy path (yenileme sonrası liste)

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
