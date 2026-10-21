# T22-ai-test-assistant-chat-to-suite-run: Sohbetten suite çalıştırmaya — istek, keşif, taslak onayı, run ve kanıt

| Field | Value |
|---|---|
| Route | `/` |
| Source | `apps/web/app/components/ai-assistant.tsx` |
| Flow | AI Test Assistant (kenar çubuğu "AI Test Assistant") — chat isteği → iki fazlı AI işi (keşif + suite üretimi) → taslak inceleme → "Onayla ve kaydet" → "Çalıştır" → ekran görüntüsü kanıtı |
| Requires auth | yes |
| Required role | admin |
| Destructive | no |
| Estimated steps | 34 |

## Preconditions
- App running at `http://127.0.0.1:5173` (API `ZC_WEB_PORT=5173` ile başlatılmış olmalı; aksi hâlde POST istekleri `İstek kaynağı doğrulanamadı. (CSRF_BLOCKED)` döner).
- Sign in as `admin`: `http://127.0.0.1:5173` açılır, **"Yerel çalışma alanını aç"** düğmesine tıklanır (kimlik bilgisi yok, yerel demo oturumu), kenar çubuğunda **"AI Test Assistant"** seçilir.
- Ayarlar → "Sağlayıcı bağlantıları" altında aktif (`· Aktif`) bir OpenAI-compatible provider ve kayıtlı bir model ID'si vardır.
- Ayarlar → "Test edilecek siteler" listesinde `https://www.saucedemo.com` kayıtlıdır.
- Ayarlar → test verilerinde `SAUCE_USER` ve `SAUCE_PASSWORD` (gizli) tanımlıdır. Değerleri bu görevde hiçbir yere yazılmaz.
- Worker süreci çalışıyordur (`pnpm dev`).

## Test data
- `targetUrl = "https://www.saucedemo.com/"`
- `prompt = "[QA-{runId}] saucedemo'da {{SAUCE_USER}} ve {{SAUCE_PASSWORD}} ile giriş yap, ürünü sepete ekle, ödeme bilgilerine ad 'QA', soyad 'Test', posta kodu '34000' yaz ve siparişi tamamla. Pozitif ve negatif senaryoları hazırla."` (`{runId}` = runner'ın benzersiz çalıştırma kimliği)
- `provider = <aktif provider; "Aktif provider" listesinde varsayılan seçili olan>`
- `model = <"Chat modeli" alanında provider'dan otomatik gelen değer; değiştirilmez>`
- `conversationTitle = prompt'un ilk 80 karakteri` (konuşma listesinde görünen başlık)
- `secretMask = "••••••"`

## Steps

### TC-01: Happy path — saucedemo için istek gönder, keşfi izle, taslağı onayla ve suite'i çalıştır
1. Sign in as `admin` (Preconditions'taki adımlar); kenar çubuğunda **"AI Test Assistant"** tıklanır.
2. Assert: sayfa `h1` metni `AI Test Assistant`, breadcrumb `PROJE / WEB · CHROMIUM`, sohbet kartında `AI TEST ASSISTANT` eyebrow'u ve `h2` `Testleri birlikte oluştur` görünür.
3. Assert: `Başlamak için sol menüdeki Ayarlar bölümünden bir AI sağlayıcısı ekle.` ipucu **görünmez**; "Aktif provider" seçili bir provider gösterir, "Chat modeli" boş değildir.
4. **"Yeni konuşma"** tıklanır. Assert: boş durum `Bir hedef ve test isteği yaz` başlığı ve `Örnek: Giriş formunu incele; boş alan ve yanlış bilgi senaryoları hazırla.` metni görünür.
5. Assert: "Hedef URL" (`Yetkili hedef URL`) alanının varsayılan değeri `http://127.0.0.1:4100/login`'dir.
6. Formu doldur:
   - "Hedef URL" → `targetUrl` (`https://www.saucedemo.com/`)
   - "Test isteği" → `prompt`
   - "Aktif provider" → varsayılan aktif provider (değiştirme)
   - "Chat modeli" → otomatik değer (değiştirme)
7. Assert: **"Gönder"** etkin (prompt ≥ 10 karakter, provider ve model dolu).
8. **"Gönder"** tıklanır.
9. Assert: "Test isteği" alanı boşalır; thread'de `Sen` etiketli kullanıcı mesajı `prompt` metnini birebir gösterir; sol "KONUŞMALAR" listesinde `conversationTitle` başlıklı, `selected` sınıflı yeni bir düğme görünür.
10. Assert: taslak kartı sırayla şu başlıkları gösterir (her 1,5 sn'de yoklama): `Sıraya alındı…` → `Sayfa keşfediliyor…` → `Keşif tamamlandı, senaryolar üretiliyor…` → `Senaryo taslağı`. (Faz 1 = keşif ≤ 120 sn; faz 2 = suite üretimi. Toplam bekleme üst sınırı 240 sn.)
11. Assert (keşif şeffaflığı): taslak kartında `<N> sayfa · <M> keşif adımı · <K> DOM öğesi` satırı görünür; `1 ≤ N ≤ 8`, `0 ≤ M ≤ 20`.
12. Assert: `İncelenen sayfalar` listesi N öğe içerir; her öğe `<sayfa başlığı veya URL> · <n> öğe` biçimindedir; ilk öğe saucedemo giriş sayfasıdır (başlık `Swag Labs`).
13. Assert: `Keşif yolu` listesinin ilk öğesi `/` ve `Başlangıç sayfası açıldı` metnini içerir; sonraki her öğe `“<etiket>” tıkla` veya `“<etiket>” alanına <değer> yaz` biçimindedir ve `→ <path>` ya da `→ aynı sayfa` ile biter.
14. Assert (gizlilik): parola alanına yazma adımı varsa değeri `••••••` olarak gösterilir; kullanıcı adı adımı değeri `“{{SAUCE_USER}}”` referansıdır. Sayfanın hiçbir yerinde `SAUCE_PASSWORD`'ün gerçek değeri görünmez.
15. Assert: keşif `done` dışında bir nedenle durduysa (ör. model siparişi kesinleştirmeyi reddederse) `Keşif erken durdu (<reason>): <mesaj> Taslak yalnız görülen sayfalara dayanıyor.` notu (`role="note"`) görünür ve `<reason>` şu listedendir: `limit_pages`, `limit_steps`, `timeout`, `step_failed`, `invalid_step`, `unobserved_locator`, `value_not_in_prompt`, `unknown_variable`. Not görünmüyorsa neden `done`'dır.
16. Assert: thread'de `AI Assistant` etiketli mesaj `<N> sayfa incelendi (<M> keşif adımı, <K> element). <S> senaryo taslağı hazır.` ile başlar ve `Kaydetmeden önce düzenleyip onaylayın.` ile biter.
17. Assert: taslak kartında suite başlığı (`h3`) ve `1 ≤ S ≤ 10` adet senaryo `details` öğesi vardır; her `summary` `<positive|negative|edge> · <başlık> · <n> adım` biçimindedir; en az bir senaryo `positive` kategorisindedir.
18. İlk senaryonun `summary`'si tıklanır. Assert: açılan `ol` içinde n adet adım vardır; adımlar `“<hedef>” alanına “<değer>”`, `“<hedef>” tıkla`, `“<hedef>” görünür`, `“<hedef>” metni = “<beklenen>”` veya `URL = <path>` biçimindedir; en az biri doğrulama (`görünür`, `metni =`, `URL =`) adımıdır.
19. Assert (AI kendiliğinden çalıştırmaz): bu noktada `Suite çalışması` kutusu **yoktur** ve "Kaydedilen suite’ler" listesinde bu taslağa ait suite **yoktur**.
20. **"Taslağı düzenle"** tıklanır. Assert: `Kaydetmeden önce suite JSON’unu düzenle` etiketli "Suite taslağı" textarea'sı görünür; içeriği geçerli JSON'dur ve `"targetUrl": "https://www.saucedemo.com/"` içerir.
21. JSON değiştirilmeden **"Onayla ve kaydet"** tıklanır.
22. Assert: `role="status"` notu `Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.` metnini gösterir; textarea kapanır, `role="alert"` hata yoktur.
23. Assert: "Kaydedilen suite’ler" bölümünde `<suite başlığı> · <S> senaryo` satırı ve yanında **"Çalıştır"**, **"Yeni taslak olarak düzelt"** düğmeleri görünür.
24. Bu satırdaki **"Çalıştır"** tıklanır.
25. Assert: `Suite çalışması · queued` görünür; ardından (1,2 sn yoklama) `Suite çalışması · running` ve en geç 330 sn içinde terminal durum `Suite çalışması · passed` veya `Suite çalışması · failed` olur.
26. Assert: `<p> başarılı · <f> başarısız · <s> atlandı` satırı görünür ve `p + f + s = S`.
27. Assert: her senaryo için `<senaryo başlığı>: <passed|failed>` satırı vardır; başarısız senaryolarda `Hata: <KOD>` gösterilir (KOD ∈ `ELEMENT_NOT_FOUND`, `AMBIGUOUS_ELEMENT`, `ASSERTION_FAILED`, `MISSING_VARIABLE`, `ELEMENT_UNAVAILABLE`, `EVIDENCE_FAILED`, `ACTION_FAILED`, `BROWSER_ERROR`).
28. Assert: her yürütülen adım satırı `<kind>[ · <hedef>]: <status>` biçimindedir ve **"Adım görüntüsü"** bağlantısı içerir; her senaryoda **"Ekran görüntüsü"** bağlantısı vardır.
29. İlk senaryonun **"Ekran görüntüsü"** bağlantısı açılır. Assert: yeni sekme `200`, `image/png` döner; form alanları maskelidir; sayfada parola değeri okunmaz.
30. İlk adımın **"Adım görüntüsü"** bağlantısı açılır. Assert: `image/png` döner (`Kanıt bulunamadı.` veya `Kanıt bütünlüğü bozuldu.` değil).
31. Assert: thread'de `Suite tamamlandı: <p> başarılı, <f> başarısız, <s> atlandı.` mesajı görünür; `f > 0` ise ek olarak `Hata analizi: ` ile başlayan bir AI Assistant mesajı görünür.
32. Sayfa yenilenir (F5). Kenar çubuğunda "AI Test Assistant" tıklanır, "KONUŞMALAR" altında `conversationTitle` tıklanır.
33. Assert: kullanıcı mesajı, taslak kartı (`Senaryo taslağı`), keşif yolu ve son `Suite çalışması · <terminal durum>` kutusu kalıcı olarak geri yüklenir; "Kaydedilen suite’ler" listesinde suite hâlâ vardır.
34. Kenar çubuğunda **"Testler"** tıklanır. Assert: "AI suite’ler" kartında `<suite başlığı> · <S> senaryo` satırı görünür.

### TC-02: Form validation — `chat-composer` (istemci kilidi)
Kapsamlı sunucu doğrulaması T23'tedir; burada yalnız happy-path öncesi istemci kilidi doğrulanır.

| Field | Empty value error | Pattern violation | Max-length overflow |
|---|---|---|---|
| Test isteği | "Gönder" devre dışı (görünür hata yok) | `giriş yap` (9 karakter) → "Gönder" devre dışı | T23 TC-02 |
| Chat modeli | "Gönder" devre dışı | n/a | T23 TC-02 |

### TC-03: Modal coverage — n/a
Bu bölümde modal/dialog yoktur. Yerinde açılan "Suite taslağı" düzenleyicisi TC-01 adım 20–22'de ve T23 TC-03'te kapsanır.

### TC-04: Button coverage
| Button | Action taken | Expected result |
|---|---|---|
| `Yeni konuşma` | click (dolu konuşmadayken) | Thread, taslak ve run kutusu temizlenir; `Bir hedef ve test isteği yaz` görünür; "KONUŞMALAR" listesi korunur |
| `<conversationTitle>` (KONUŞMALAR) | click | Konuşma yüklenir, düğme `selected` olur |
| `Gönder` | click | İstek kuyruğa alınır (TC-01 adım 9–10) |
| `Taslağı düzenle` | click | "Suite taslağı" textarea'sı açılır |
| `Onayla ve kaydet` | click | `Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.` |
| `Çalıştır` (Kaydedilen suite’ler) | click | `Suite çalışması · queued` |
| `Adım görüntüsü` | click | Yeni sekmede PNG |
| `Ekran görüntüsü` | click | Yeni sekmede PNG |

### TC-05: Negative & edge cases
- Prompt içinde URL: "Hedef URL" `http://127.0.0.1:4100/login` bırakılır, "Test isteği" = `https://www.saucedemo.com/ adresinde {{SAUCE_USER}} ile giriş formunu incele.` → **"Gönder"**. Assert: istek kabul edilir (hata yok) ve taslak kartının `Keşif yolu` ilk öğesi `/` saucedemo kökünü gösterir; "Hedef URL" alanı `https://www.saucedemo.com/` değerine güncellenir (prompt URL'i hedefi geçersiz kılar).
- Run sürerken (`queued`/`running`) **"Çalıştır"** düğmesi meşgul (busy) sırasında devre dışıdır; ikinci tıklama ikinci bir run başlatmaz (yalnız istek tamamlanana kadar).
- Tanımsız test verisi: "Test isteği" = `[QA-{runId}] saucedemo'da {{QA_UNDEFINED_KEY}} ile giriş yap.` → **"Gönder"**. Assert: taslak ya erken durur ve not `Keşif erken durdu (unknown_variable): Model tanımlı olmayan bir test verisine ({{KEY}}) başvurdu; adım uygulanmadı. Taslak yalnız görülen sayfalara dayanıyor.` gösterir ya da `done`/diğer neden ile biter; sayfada hiçbir yerde `{{QA_UNDEFINED_KEY}}` bir değerle çözülmüş olarak görünmez.
- İstekte olmayan değer: "Test isteği" = `[QA-{runId}] saucedemo giriş formunu incele, kullanıcı adı alanını doldur.` (kullanıcı adı verilmez) → **"Gönder"**. Assert: keşif yolunda istekte birebir geçmeyen bir `alanına “…” yaz` adımı **uygulanmış olarak** görünmez; böyle bir öneri varsa `→ uygulanmadı` satırı ve `Keşif erken durdu (value_not_in_prompt): Model istekte verilmeyen bir değer yazmak istedi; adım uygulanmadı. …` notu görünür.

## Assertions
- [ ] `h1` = `AI Test Assistant`; sohbet `h2` = `Testleri birlikte oluştur`.
- [ ] Gönderimden sonra kullanıcı mesajı ve `conversationTitle` başlıklı konuşma görünür.
- [ ] Taslak durum başlıkları `Sıraya alındı…` → `Sayfa keşfediliyor…` → `Keşif tamamlandı, senaryolar üretiliyor…` → `Senaryo taslağı` sırasıyla geçer.
- [ ] Keşif özeti `≤ 8` sayfa ve `≤ 20` adım gösterir; `İncelenen sayfalar` ve `Keşif yolu` listeleri doludur.
- [ ] Parola değerleri `••••••` olarak maskelenir; gizli test verisinin değeri hiçbir yerde görünmez.
- [ ] Onaydan önce suite kaydı ve run yoktur (AI kendiliğinden çalıştırmaz).
- [ ] `Suite kaydedildi. Testler ekranındaki AI suite listesinde de görünecek.` notu görünür.
- [ ] Run terminal durumu `passed` veya `failed`; sayaçlar senaryo sayısıyla tutarlı.
- [ ] Her adım ve senaryo için PNG kanıtı açılır.
- [ ] `Suite tamamlandı: …` mesajı thread'e eklenir; yenilemeden sonra konuşma geri yüklenir.
- [ ] No console errors in DevTools at any step.
- [ ] No failed network requests (no 4xx/5xx) except where explicitly expected.

## Screenshots required
- Page initial load (AI Test Assistant boş durum)
- Doldurulmuş kompozitör ("Hedef URL" + "Test isteği")
- `Sayfa keşfediliyor…` durumu
- `Senaryo taslağı` kartı: keşif özeti, `İncelenen sayfalar`, `Keşif yolu` ve açılmış bir senaryo
- "Suite taslağı" düzenleyicisi açık
- Onay sonrası `Suite kaydedildi…` notu ve "Kaydedilen suite’ler"
- Terminal `Suite çalışması · <durum>` kutusu
- Açılan bir "Ekran görüntüsü" PNG'si
- Final state after the happy path (Testler → "AI suite’ler")

## Pass criteria
All TCs above pass AND no unexpected console/network errors.
