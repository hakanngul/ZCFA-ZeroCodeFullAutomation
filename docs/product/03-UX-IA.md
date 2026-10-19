# 03 — UX, Information Architecture ve Kullanıcı Yolculuğu

## Ana ilke

**Business-first, evidence-always:** non-technical QA'ya locator/XPath/Playwright gösterme; ancak dileyen QA Lead/Engineer trace, eşleştirme ve teknik hata ayrıntılarını açabilsin. Öğrenme maliyeti düşük, tehlikeli otomasyon davranışları görünür olmalı.

## Menü ve ekranlar

```text
Workspace
 ├─ Overview / Dashboard       [pilot: minimal]
 ├─ Projects
 │   └─ {Project}
 │       ├─ Applications       [add app, allowlist, environments]
 │       │   └─ Application Model
 │       │       ├─ Pages
 │       │       ├─ Components & Elements
 │       │       └─ Reusable Business Flows
 │       ├─ Tests              [list, versions, editor]
 │       ├─ Runs               [queue, history, evidence]
 │       ├─ Data & Secrets     [test data, secret references]
 │       └─ Settings           [members, audit]
 └─ Profile
```

**İleri versiyona ertelenen ekranlar:** Enterprise tenant directory, scheduling UI, defect center, advanced release-quality analytics, integrations marketplace, real-device matrix.

## Ekran kontratları

| Ekran | Kullanıcı / ana aksiyon | Ana bilgi | Empty / error / permissions |
|---|---|---|---|
| Dashboard | QA Lead; son run ve ilk aksiyon | PASS/FAIL ve blokajlar | Empty: guided onboarding; viewer read-only |
| Project | QA Editor; kapsam seçme | uygulama, test, run, üyeler | erişim yoksa 403, silinen proje 404 |
| Applications | Admin; URL ekle / allowlist | origin, keşif durumu, model version | bağlantı hatası, SSRF red, invalid URL |
| Discovery Review | QA; adayları onayla/teach | page tree, candidate locator evidence, confidence | `unreviewed`, ambiguity, unsupported widgets |
| Application Model | QA Lead; mapping yönet | named pages, elements, flows, usage count | stale mapping, bağlı test etki listesi |
| Test Designer | QA; intent ve assertion seç | typed steps, input/data refs, validations | required unresolved / no assertion → publish disable |
| Tests | QA; run/publish/version | draft/published revisions, owner, impact | no tests → create, invalid versions visible |
| Runs | QA; başlat / yeniden çalıştır | state, app/model version, duration | queued, error, timed-out, cancelled |
| Run Detail | QA/Lead; neden incele | expected vs actual, screenshots, trace | infra error'da bug iddiası yok; evidence unavailable açık |
| Data & Secrets | Project Admin | named datasets ve masked refs | hiçbir plaintext re-display yok |
| Settings/Audit | Admin | members, roles, revizyon geçmişi | yetkisiz eylem engelli |

## İlk kullanıcı deneyimi — Happy path

1. **Sign in / Workspace:** kurulu org'a katılır; ilk pilotta org provisioning admin tarafından yapılabilir.
2. **New Project:** isim, uygulama tipi `Web`.
3. **Connect App:** staging URL, izinli hostname, gerekirse erişim secrets referansı; platform sağlık kontrolü yapar.
4. **Discover:** pasif DOM/page scan; `/login`, form label, button, accessible name, test id, URL gibi sinyallerden önerilen adaylar çıkar.
5. **Review:** kullanıcı `Login Page`, `Username`, `Password`, `Submit` öğelerini onaylar; belirsiz eşleme varsa picker ile düzeltir.
6. **Teach Flow:** kullanıcı adımları seçerek `Geçerli kullanıcı olarak giriş yap` reusable flow'unu kaydeder; inputları credential alias ve expected dashboard olarak belirtir.
7. **Create Test:** kontrollü editörden `Login as valid user` flow'unu ve `Dashboard visible` assertion'ını ekler.
8. **Visual View:** `Open /login → Enter credentials → Submit → Expect dashboard visible` akışını gösterir.
9. **Technical View (optional):** onaylı locator adayları, timeout strategy, plan preview, model versions ve teşhis yapılarını gösterir.
10. **Run:** queue/start/progress durumları, sonuç ve assertion evidence.
11. **Review/Repair:** element değişirse yeni mapping adayı kullanıcının onayıyla yeni model revision yapar; eski run'ın sonucu/kanıtı korunur.

## Üç görünüm, tek test modeli

| Business View | Flow View | Technical View |
|---|---|---|
| “Geçerli hesapla giriş yap” | useFlow(login) | flow revision, action refs, resolved locators |
| “Dashboard görünür” | assertVisible(dashboard) | expected, actual, screenshot, trace |

Her görünüm `CanonicalTest.definition` üzerinden okunur veya düzenlenir. UI'da alternatif test kaynakları tutulmaz. Business/flow'da değişiklik modelin draft revision'ını üretir. Technical view salt-okunur plan ve log gösterebilir; advanced mapping edits ayrı workflow ile yapılır.

## Controlled business dili: ürün davranışı

- Serbest metin kutusu yerine **intent catalog + parametreli cümle autocomplete**.
- Örnek: `Giriş yap {kullanıcıTipi}` / `Görünür olmalı {sayfa|öğe}` / `Metni eşit olmalı {öğe} = {beklenen}`.
- Dil gösterimi TR/EN olabilir, fakat saklanan şey **locale-independent action ID + typed parameters**.
- Bilinmeyen cümleye “bunu anlayamadım; [listeden eylem seç / yeni flow öğret]” denir.
- Validation design-time: sayfa bulunamadı, field uygun değil, expected tanımsız, secret eksik.
- Step edit kısa tut: klavye-first arama, otomatik tamamlanan placeholders, net örnek.

## Zorlayıcı UX halleri

**Öğe belirsiz:** “Üç farklı 'Giriş Yap' butonu bulundu.” Aday ekran görüntüsü, accessibility name, frame/selector context göster; karar kullanıcıya aittir.

**UI değişmiş:** “Onaylı `LoginButton@v3` bulunamadı; benzer `submit` bulundu, öneri onay bekliyor.” Yürütme durumu fail/blocked; sessizce PASS yok.

**Hatalı assertion:** “Dashboard görünürlüğü doğrulandı, fakat bakiye değeri doğrulanmadı.” Rapor test kapsamını aşan güven hissi oluşturmaz.

**Hassas form/ödeme:** Discovery hiçbir yan etkili eylemi otomatik gerçekleştirmez. Guided flow öğretme modunda bile kritik adımda açık kullanıcı onayı gerekir; prod URL yasaklanabilir.

## UX hedefleri (pilot ölçümü)

- İlk meaningful testin başlangıçtan evidence'lı sonuca kadar geçen süre (keşif/öğretme dahil).
- 1 oturumda yardım almadan tamamlayan kullanıcı oranı.
- Belirsiz eşleme nedeniyle iptal/yardım sayısı.
- Kullanıcının PASS sonucunu doğru açıklayabilme yüzdesi.
- İlk akış reuse edildiğinde ikinci test oluşturma süresinin azalması.

## Erişilebilirlik ve yerelleştirme

- Keyboard nav, focus visible, açık error descriptions, status ve progress.
- Product labels yerelleştirilebilir, ID'ler locale-independent.
- **ASSUMPTION:** İlk pilotta Türkçe UI ve örnek intent catalog; mimari EN eklemeye hazır. Pilot müşteriyle karar verilecek.
