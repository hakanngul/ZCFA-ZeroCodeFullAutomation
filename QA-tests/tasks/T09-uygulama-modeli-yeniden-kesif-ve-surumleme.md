# T09-uygulama-modeli-yeniden-kesif-ve-surumleme: Yeniden keşif, model sürümleme ve test tasarımına bağlantı

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/page.tsx` |
| Flow | Uygulama modeli (`section === "model"`) — Yeniden keşif ve model sürümleme + Onaylı modelden test tasarımına geçiş |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 30 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API 4000, Demo Bank fixture `http://127.0.0.1:4100`, worker çalışıyor). Web 5173'te ise API `ZC_WEB_PORT=5173` ile başlatılmış olmalı.
- Oturum: `http://127.0.0.1:5173` aç, **`Yerel çalışma alanını aç`** tıkla, sidebar'da **`Uygulama modeli`** tıkla. Rol `admin`; kimlik bilgisi girilmez.
- Veri: en az bir onaylı model mevcut (ör. T07 çalıştırıldıktan sonra). Bölüm `Onaylandı` rozeti ve `Model v<N> kayıtlı. Önceki sürümler korunur.` göstermeli; `N` değerini kaydet. Değilse önce T07 TC-01'i uygula.

## Test data
- İlk yeniden onay (TC-01): `E-posta = işaretli`, `Parola = işaretli`, `Giriş yap = işaretli`, `Dashboard = işaretli`, `Bakiye = işaretsiz`
- İkinci yeniden onay (TC-02): `E-posta = işaretli`, `Parola = işaretli`, `Giriş yap = işaretli`, `Dashboard = işaretli`, `Bakiye = işaretli`
- Test adı (TC-03): `Test adı = "QA Model Sürüm Testi {runId}"` (`{runId}` = görev çalıştırma zaman damgası, ör. `20261021T1030`)
- Çalıştırma varyantları (TC-05): `Demo kontrolü = "Sağlam uygulama"`, `Demo kontrolü = "Belirsiz giriş butonu"`

## Steps

### TC-01: Happy path — Yeniden keşfet ve yeni model sürümü (v<N+1>) yayınla
1. Sign in as admin ve **`Uygulama modeli`** bölümünü aç. Assert: rozet `Onaylandı`, footer `Model v<N> kayıtlı. Önceki sürümler korunur.`, buton etiketi **`Yeniden keşfet`**. Ekran görüntüsü al.
2. Sidebar **`Uygulama modeli`** rozet değerini kaydet (`B0`).
3. **`Yeniden keşfet`** tıkla. Assert: `POST /api/v1/projects/<projectId>/discovery-scans` 202; rozet `Sırada`/`Çalışıyor`; `Worker demo sayfalarını inceliyor…`; buton disabled; `Model v<N> kayıtlı.` footer'ı ve **`Test tasarla`** görünmez.
4. Assert: sidebar rozeti hâlâ `B0` (yeni scan onaylanana kadar mevcut model değişmez).
5. En fazla 30 sn bekle. Assert: rozet `Onay bekliyor`; 5 satır `Aday`; **5 checkbox'ın tamamı işaretsiz ve etkin** (önceki onaylar yeni scan'e taşınmaz); **`Seçilen eşlemeleri onayla`** disabled.
6. Sidebar'da **`Testler`** tıkla. Assert: test tasarımcısında `Onaylı model` `v<N>` gösterir (önceki model kullanımda kalır). Sidebar'da **`Uygulama modeli`**'ne dön.
7. İlk yeniden onay `Test data` değerlerini uygula (Bakiye işaretsiz).
8. **`Seçilen eşlemeleri onayla`** tıkla. Assert: 200; yanıtta `revision = N + 1`, `flow.revision = N + 1`, `dashboard.balance.approved = false`.
9. Assert: h1 `Test çalışma alanı`; `Onaylı model` `v<N+1>`; **`Bakiyeyi de doğrula`** disabled; sidebar **`Uygulama modeli`** rozeti `4`.
10. Sidebar'da **`Uygulama modeli`** tıkla. Assert: `Onaylandı`; `Bakiye` işaretsiz/disabled, diğer 4 işaretli/disabled; footer `Model v<N+1> kayıtlı. Önceki sürümler korunur.`. Ekran görüntüsü al.
11. Önceki sürümün korunduğunu doğrula: DevTools Console'da `await fetch('/api/v1/projects/<projectId>/elements/history').then(r=>r.json())` çalıştır. Assert: `revisions` dizisinin ilk iki öğesi `revision: N+1` ve `revision: N`; her birinin `elements` değeri `5`.
12. `await fetch('/api/v1/projects/<projectId>/elements?revision=<N>').then(r=>r.json())` çalıştır. Assert: `revision: N` döner (eski sürüm silinmemiştir).

### TC-02: Bakiye'yi geri ekleyerek v<N+2> yayınla
1. **`Yeniden keşfet`** tıkla, `Onay bekliyor` durumunu bekle (≤ 30 sn). Assert: 5 checkbox işaretsiz.
2. İkinci yeniden onay `Test data` değerlerini uygula (5'i de işaretli).
3. **`Seçilen eşlemeleri onayla`** tıkla. Assert: 200, `revision = N + 2`; h1 `Test çalışma alanı`; `Onaylı model` `v<N+2>`; **`Bakiyeyi de doğrula`** etkin; sidebar rozeti `5`.
4. **`Uygulama modeli`**'ne dön. Assert: 5 checkbox işaretli/disabled, footer `Model v<N+2> kayıtlı. Önceki sürümler korunur.`.

### TC-03: Onaylı modelden test tasarımına geçiş (`Test tasarla`)
1. **`Uygulama modeli`** bölümünde **`Test tasarla`** tıkla. Assert: h1 `Test çalışma alanı`; editör başlığı `Bir iş akışı. Açık bir beklenti.`; etiket `Yeni taslak`.
2. `Test adı` alanını temizle ve `"QA Model Sürüm Testi {runId}"` yaz.
3. **`Doğrula ve yayınla`** tıkla. Assert: `POST /api/v1/projects/<projectId>/tests` 201; başlık `Yayınlanan test`; etiket `Sürüm 1 · Salt okunur`; `Klasik yayınlanan testler` listesinde `QA Model Sürüm Testi {runId}` ve `Test v1 · Model v<N+2>`.
4. **`Uygulama modeli`**'ne git, **`Yeniden keşfet`** tıkla, `Onay bekliyor` bekle, 5'ini de işaretle ve **`Seçilen eşlemeleri onayla`** tıkla. Assert: 200, `revision = N + 3`; bölüm `Test çalışma alanı`; editör `Yeni taslak` gösterir (onay sonrası `published` sıfırlanır) ve `Onaylı model` `v<N+3>`.
5. `Klasik yayınlanan testler` listesinde Assert: `QA Model Sürüm Testi {runId}` hâlâ `Test v1 · Model v<N+2>` (yayınlanan test sürümü değişmez, eski modele bağlı kalır). Ekran görüntüsü al.

### TC-04: Modal coverage — n/a
Bölümde modal yok. Assert: hiçbir adımda `role="dialog"` açılmaz.

### TC-05: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeniden keşfet` | click (scan `approved`) | 202; yeni scan `Sırada`; seçimler sıfırlanır |
| `Yeniden keşfet` | scan `queued`/`running` iken | disabled |
| `Seçilen eşlemeleri onayla` | 4 zorunlu seçili, click | 200; model sürümü +1 |
| `Test tasarla` | click | bölüm `Test çalışma alanı`, `Yeni taslak` |
| Sidebar `Uygulama modeli` | click | bölüm `Uygulama modeli`; rozet onaylı öğe sayısı |

### TC-06: Negative & edge cases
- **Belirsiz öğe (çalıştırma anında):** Model bölümü belirsizliği çözmez; keşif yalnız sağlam `/login` ve `/dashboard-preview` sayfalarını okur. TC-03 adım 3'te yayınlanan testi `Klasik yayınlanan testler` listesinden seç, `Demo kontrolü` = `Belirsiz giriş butonu` seç, **`Testi çalıştır`** tıkla. Assert: bölüm `Çalıştırmalar ve kanıtlar`; çalıştırma en geç 30 sn içinde `Engellendi` durumuna ulaşır (giriş butonu `login-submit` iki kez bulunur, `AMBIGUOUS_ELEMENT`). **`Uygulama modeli`**'ne dön. Assert: model sürümü ve onay durumu değişmemiştir (çalıştırma modeli değiştirmez).
- **Kontrol:** Aynı test `Demo kontrolü` = `Sağlam uygulama` ile çalıştırıldığında `Başarılı` olur (aynı onaylı eşlemelerin sağlam varyantta çalıştığını kanıtlar).
- **Yeniden keşif onaysız bırakılırsa:** **`Yeniden keşfet`** tıkla, `Onay bekliyor` durumunda hiçbir şey seçmeden **`Testler`**'e geç. Assert: `Onaylı model` son onaylı sürümü (`v<N+3>`) gösterir; yeni test yayınlanabilir (bekleyen scan yayını engellemez). Model bölümünde footer `Model v... kayıtlı.` yerine `Giriş alanları ve Dashboard zorunludur.` görünür.
- **viewer rolü (yalnız API düzeyi, koşullu):** UI'da viewer oturumu açmanın yolu yoktur (`POST /v1/session/local` her zaman `admin` üretir) ve model bölümü `canEdit` kullanmaz. viewer oturumu sağlanabiliyorsa: **`Yeniden keşfet`** ve **`Seçilen eşlemeleri onayla`** banner'da `Düzenleme yetkisi gerekli. (FORBIDDEN)` göstermelidir. Sağlanamıyorsa bu maddeyi `skipped (no viewer session)` olarak raporla; bulgu olarak "model bölümünde viewer için butonlar devre dışı bırakılmıyor" notunu ekle.

## Assertions
- [ ] Yeniden keşif sırasında mevcut model ve sidebar rozeti değişmez.
- [ ] Yeni scan `Onay bekliyor` durumunda tüm checkbox'lar işaretsiz başlar.
- [ ] Her onay model sürümünü tam 1 artırır ve footer `Model v<rev> kayıtlı. Önceki sürümler korunur.` gösterir.
- [ ] `elements/history` önceki sürümleri listeler; eski sürüm `?revision=` ile okunabilir.
- [ ] Bakiye onayı kaldırılınca `Bakiyeyi de doğrula` disabled, eklenince etkin olur.
- [ ] Yayınlanan test eski model sürümüne bağlı kalır (`Model v<N+2>`).
- [ ] `Test tasarla` test tasarımcısını `Yeni taslak` ile açar.
- [ ] `Belirsiz giriş butonu` varyantında çalıştırma `Engellendi`, `Sağlam uygulama` varyantında `Başarılı`.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (`Onaylandı`, `Model v<N> kayıtlı.`)
- Yeniden keşif sürüyor durumu
- `Onay bekliyor`, seçimler sıfırlanmış
- `Model v<N+1> kayıtlı.` (Bakiye işaretsiz)
- `Klasik yayınlanan testler` listesinde `Test v1 · Model v<N+2>`
- `Belirsiz giriş butonu` çalıştırması `Engellendi`
- Final state after the happy path

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
