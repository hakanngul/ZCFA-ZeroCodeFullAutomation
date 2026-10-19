# 02 — MVP Product Requirements Document (PRD)

## Amaç, sınır ve ilk değer anı

**Core hypothesis:** Bir manual QA / analist, koda ve locator syntax'ına dokunmadan, kendisine gösterilen uygulama modelini doğrulayarak anlamlı bir web testi oluşturur, çalıştırır ve beklenen iş koşulunun doğrulandığını kanıtlarla görür.

**İlk değer anı (aha moment):** `Geçerli hesapla giriş yap → dashboard görünsün` testi çalışır; kullanıcı doğru sayfanın/doğru koşulun doğrulandığını screenshot + step result ile inceler.

**Önemli ürün gerçekliği:** Kontrolsüz şekilde herhangi bir URL'nin iş mantığını otomatik keşfetmek, ilk MVP'de güvenilir kabul edilmez. Bu nedenle **guided teaching/element mapping**, keşfin yedek planı değil **zorunlu ürün yolu**dur. Test oluşturma dilinde kullanıcı tanımlı iş akışları/step template'leri vardır; sistem tanınmayan cümleyi otomasyona dönüştürmüş gibi yapamaz.

## MVP IN (Must)

| ID | Yetenek | Kullanıcı çıktısı | Kabul koşulu |
|---|---|---|---|
| F01 | Giriş + basit proje ve rol | Yetkili kişi proje oluşturur | Erişim organization/project bazında uygulanır |
| F02 | Staging uygulaması ekleme | Allowlisted URL kaydedilir | Engelli host/protocol/IP güvenli reddedilir |
| F03 | Sınırlı discovery | Page/element/component adayları listelenir | Yalnız izinli origin/route; eylemsiz tarama, limitler, her adayın evidence'ı |
| F04 | Guided mapping & teach flow | QA login alanlarını ve business flow'u tanımlar | Öğelerin doğruluğu insan onayıyla kalıcı sürümlenir |
| F05 | Controlled business test editor | Onaylı action/flow/assertion ile test tasarlar | Belirsiz referans için açık çözüm ister, silent guess yok |
| F06 | Canonical test model v1 | Test modele dönüştürülüp kaydedilir | Schema validation + versioning + deterministic compiler |
| F07 | Playwright Chromium execution | Test izole browser worker'da çalışır | Timeout/abort/error state ve run snapshot doğru çalışır |
| F08 | Assertions | Görünürlük, metin, URL, enabled gibi koşullar | Expected ve observed tutulur; assertion yoksa test publish edilemez |
| F09 | Run details & evidence | Test sonucu, fail step, screenshot/trace görünür | PASS yalnız assertion gerçekten doğrulanınca mümkündür |
| F10 | Reusable mappings/flow | Bir iş akışı iki testte kullanılır | Referanslar merkezi, sürümlü; bağlı testlere impact görünür |
| F11 | Basic history, logs, audit | Run/test değişimleri denetlenir | kim/ne/zaman + test/model revision saklanır |
| F12 | Tekrar çalıştırma | Aynı snapshot tekrar koşar | Sonuçlar ayrı run; eski kanıt değiştirilemez |

## MVP OUT (Won't)

Mobile, API test designer, browser cloud farm, Firefox/WebKit, Kubernetes, gerçek zamanlı çok düğümlü autoscaling, AI agentic generation, otonom healing, riske göre regresyon planlama, Jira/Slack/GitOps/SSO entegrasyonları, ileri dashboard'lar, görüntü piksel diff, karmaşık döngüler ve koşullar, secret'ı iş senaryosu içine açık metin yazma. **Sadece güvenli ve gerekli olan basit data bindings** MVP'de kalır.

## User stories & acceptance

**US-01 / uygulamayı ekle:** Manual QA olarak staging adresimi ekleyip güvenli erişim doğrulaması görmek isterim.  
**AC:** URL validasyonu, erişilemiyor hatası, tarama bütçesi; SSRF engeli; izin verilmedikçe üçüncü parti domain'e geçilmez.

**US-02 / keşfi incele:** QA olarak sayfa ve element adaylarını etiket ve screenshot ile gözden geçirmek isterim.  
**AC:** adaylar `unreviewed/approved/rejected` durumlu; kullanıcı onayı olmadan business mapping oluşturulmaz.

**US-03 / flow öğret:** QA olarak Login Flow'u bir kez tanımlayıp tekrar kullanmak isterim.  
**AC:** username/password/login submit ve success assertion açık eşlenir; hassas bilgi vault referansı olarak saklanır.

**US-04 / test tasarla:** Analist olarak `Geçerli kullanıcıyla giriş yap` + `Dashboard görünür` seçmek isterim.  
**AC:** autocomplete sadece geçerli template'leri gösterir; eksik element/credential/assertion Publish'i bloke eder.

**US-05 / yürüt:** QA olarak Run diyerek sonucu görmek isterim.  
**AC:** queued → running → passed/failed/blocked/timed_out/cancelled; polling veya event update; tekil idempotency.

**US-06 / hata incele:** QA Lead olarak niye başarısız olduğunu ve hangi sürümün koştuğunu görmek isterim.  
**AC:** failed action, observed/expected, screenshot/trace, sanitized logs, test version, application model version.

**US-07 / merkezi düzeltme:** QA olarak değişen butonun mapping'ini tek yerde düzeltmek isterim.  
**AC:** bağlı flow/test listesi görünür; önerilen revizyon onay gerektirir; önceki published testlerin sonucu korunur.

**US-08 / yetki:** Admin olarak başka projeye erişimi engellemek isterim.  
**AC:** IDOR/cross-tenant negatif testleri geçer; worker da tenant scope taşır.

## Non-functional requirements — başlangıç hedefleri; VALIDATION REQUIRED

- UI tasarım hedefi: yaygın kullanıcı aksiyonlarında P95 API yanıtı < 500 ms (execution/discovery async; bu limit onlara uygulanmaz).
- Aynı küçük örnek uygulamada tekrar koşulan deterministik regression için hedef ≥ %95 istikrarlı sonuç; flaky kaynaklar ayrıca sınıflandırılır.
- Tek test çalıştırma için bütçe/timeout ve worker kaynak limiti zorunlu; testler sonsuz çalışamaz.
- Her PASS sonucu en az bir yürütülmüş business assertion ve ilgili kanıt referansı içerir; assertion eksikse `blocked/invalid` olur.
- Erişilebilir UI, klavye navigasyonu, anlaşılır hata durumları; WCAG 2.2 AA hedef.
- Veri güvenliği: tenant isolation, secrets redaction, encrypted secrets, HTTPS, audit trail.
- Discovery `safe mode` ile hiçbir ödeme/silme/gönderme aksiyonunu kendiliğinden tetikleyemez.
- Ürün iddiasına ilişkin istatistik ve hızlar kontrollü deneylerde ölçülmedikçe pazarlama vaadi değildir.

## Roller / authorization

| Eylem | Viewer | Editor (QA/BA) | Project Admin | Org Admin |
|---|---|---|---|---|
| Test/rapor görüntüleme | ✓ | ✓ | ✓ | ✓ |
| Test/flow oluşturma | — | ✓ | ✓ | ✓ |
| Run tetikleme | — | ✓ | ✓ | ✓ |
| Mapping onaylama | — | ✓* | ✓ | ✓ |
| Uygulama/secrets ayarlama | — | — | ✓ | ✓ |
| Kullanıcı/tenant yönetme | — | — | — | ✓ |

`*` Mapping onayı audit ve model sürümü ile tutulur; riskli revizyonlar admin onayı isteyebilir (pilot politikası).

## Error & empty states

- App offline/403: `APPLICATION_UNREACHABLE`, keşif başarısız, test `blocked`.
- Element çözümlenemiyor: fail/blocked; alternatif element önerisi açık işaretli; **auto-pass yok**.
- Birden fazla element eşleşti: `AMBIGUOUS_ELEMENT`, kullanıcı mapping ister.
- Assertion bekleneni bulamıyor: test `failed`; expected vs actual ve evidence.
- Worker crash: `infrastructure_error`; gerçek ürün bug'ı olarak raporlanmaz.
- Secret eksik/yetkisiz: `configuration_error`, log'a değer sızmaz.
- Empty project: “Uygulama ekle → Keşfi başlat → Flow öğret → Test oluştur” guided onboarding.

## MVP DoD (her feature)

Kullanıcı yolculuğunda çalışır; authz ve tenant kontrolleri vardır; unit/integration/e2e uygun katmanda geçer; log ve hata kodu vardır; erişilebilir empty/error UI vardır; dokümantasyon ve ADR gerekiyorsa güncellenmiştir; sırf simüle edilmiş bir sonuç gerçek başarı olarak gösterilmez.
