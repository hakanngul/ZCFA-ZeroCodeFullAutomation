# ZeroCode — İlk çalışan ürün dilimi

Kontrollü iş adımlarını sürümlü test modeline ve gerçek Chromium sonuçlarına
dönüştüren yerel geliştirme prototipi. Temel ürün belgeleri [docs/product](docs/product/README.md)
altında, geliştirme durumu [docs/PROGRESS.md](docs/PROGRESS.md) dosyasında.
Ekran görüntüleri, test günlükleri ve oturum anahtarlarından temizlenmiş demo
veritabanları [kanıt arşivinde](docs/evidence/README.md) bulunur.

## Çalıştırma

Node **24.x**, pnpm **11.25.0** ve Chromium gerekir. Bu bulut makinesinde Chromium
`/usr/bin/chromium` konumunda hazırdır. Kendi bilgisayarında Playwright'ın
Chromium'unu `pnpm exec playwright install chromium` ile kurabilirsin;
`ZC_CHROMIUM_PATH` belirli bir tarayıcı yolunu seçer. Yerel demo için uzak
bağlantı ve credential gerekmez.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Daha önce provider'ı farklı bir `ZC_DATA_DIR` altında kaydettiysen
`pnpm dev:resume` mevcut `.local/*/zerocode.sqlite` ve eski
`/tmp/zerocode-demo.*/zerocode.sqlite` dosyalarını tarar; provider kaydı olan
en güncel veriyi seçer. Geçici dizindeki veriyi SQLite backup ile `.local/`
altına taşır ve `assistant.key` dosyasını birlikte korur. Hangi dizini
kullandığını başlangıçta yazar; hiçbir mevcut veritabanının üzerine yazmaz.
Belirli bir dizini seçmek için `ZC_DATA_DIR="$PWD/.local/my-data" pnpm dev`
kullanabilirsin.

Bulut ortamında home dizinine yazılamıyorsa, önce şu dizinleri seç:

```sh
export XDG_DATA_HOME=/workspace/.cache/share
export XDG_CACHE_HOME=/workspace/.cache
export PNPM_HOME=/workspace/.cache/pnpm
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
pnpm dev
```

UI 5000, API 4000, demo hedef 4100 portunda **127.0.0.1'e bağlıdır**. Supervisor
dört süreci birlikte açar; Ctrl+C yalnız başlattığı süreç gruplarını durdurur.
Bu ortamın onboarding arayüzünde localhost önizleme bağlantısı desteklenmez.
Servisler yerel HTTP istekleri ve gerçek browser testleriyle doğrulanır.

Arayüzde “Yerel çalışma alanını aç” → “Uygulamayı keşfet” → beş aday öğeyi seç
→ eşlemeleri onayla → test adı ve isteğe bağlı bakiye assertion'ı → yayınla →
çalıştır. `Sağlam uygulama`, `Bozuk dashboard`, `Belirsiz giriş butonu` ve
`Yavaş uygulama` seçenekleri gerçek demo davranışlarını değiştirir; hazır
PASS/FAIL yanıtı üretmez. Run ekranındaki ayrıntı düğmesi kanıtı açar.

## Doğrulama

```sh
pnpm typecheck
pnpm test
pnpm build
# pnpm dev durmuş olmalı; E2E için 3000, 4000, 4100 portları boş olmalı.
pnpm test:e2e
```

E2E kendi API, fixture, worker ve derlenmiş Next.js sunucusunu başlatır. Ayrı
geçici veritabanı kullanır; geliştiricinin `.local` verilerini silmez. Gerçek
tarayıcı ekran görüntüleri ve servis günlükleri `test-results/` altında üretilir.
Klasör ignore edilir. Sıfır test veya yalnız açık port başarı kanıtı sayılmaz.

## Element kütüphanesi

Sol menüdeki **Elementler** ekranı; arama, sayfa/onay filtresi, elle ekleme ve
düzenleme destekler. Her elementin sabit iş anahtarı, adı, sayfası, birincil
locator'ı ve en fazla beş alternatifi vardır. Keşifte gözlenen DOM özellikleri
ayrıca salt okunur gösterilir.

Desteklenen türler: HTML ID, CSS, XPath, Role, Label, Test ID, Text, Placeholder,
Title ve Alt text. Playwright önizlemesi gösterilir; kayıtlar typed veridir,
kullanıcının JavaScript kodu çalıştırılmaz.

**Locator'ı dene**, ayrı worker'da demo sayfasını pasif açıp eşleşme sayısını ve
görünürlüğü döndürür. Sıfır, tekil ve çoklu eşleşmeler ayrılır; bu deneme test
assertion'ı veya PASS üretmez. Dashboard öğeleri demo öğretim rotasında denenir.

Locator/sayfa değişimi arayüzde onayı kaldırır. Her kayıt yeni model revision'ı
oluşturur; eşzamanlı düzenleme çatışması 409 ile engellenir. Geçmiş salt okunur
incelenir, mevcut testler eski modelde kalır. Kullanıldığı flow ve test sürümleri
ayrıntı panelinde gösterilir. Alternatifler otomatik denenmez; birincil yapmak
açık seçim gerektirir.

Bu artım Giriş ve Dashboard sayfalarıyla sınırlıdır. Harici hedef, iframe, özel
Shadow DOM kapsamı, genel sayfa kataloğu, kalıcı silme ve otomatik test sürümü
taşıma henüz yoktur. Element onayını kaldırma desteklenir.

AI Test Assistant'ın Chromium ile incelediği harici veya yerel sayfalardaki DOM
öğeleri ayrıca **Elementler → Web sitelerinden kaydedilen elementler** listesine
otomatik kaydedilir. Kayıtlar proje/sayfa/locator bazında güncellenir;
senaryo JSON'u reddedilse bile başarılı sayfa incelemesi korunur. Bu liste
Demo Bank'ın onaylı model revision'larından ayrıdır.

Liste sayfa URL'ine göre katlanabilir gruplar halinde gelir (ilk grup açık,
her başlıkta element ve kırılgan sayısı); ad/locator araması ve sayfa filtresi
API'de (`GET /v1/projects/:id/ai/elements?q=&pageUrl=&limit=&offset=`, en
fazla 500 satır) çalışır, her grup 20'şer satır yükler ("Daha fazla göster").
Uzun birleşik element adları kısaltılır, tam metin üzerine gelince görünür.
Keşif sırasında locator önceliği: sayfada tekil `data-testid` / `data-test` >
`id` > role + erişilebilir ad > label > placeholder > en yakın id'ye bağlı CSS.
`nth-of-type` içeren CSS yolları **kırılgan** rozetiyle gösterilir ve suite
üretim prompt'unda modelden kararlı bir alternatif varken kullanmaması istenir.

Bu liste bir **site element kütüphanesidir** (ADR 013). Keşif her öğe için
sayfada tekil en fazla 3 locator saklar (birincil + alternatifler); sonraki
keşifte adaylardan biri aynı sayfadaki bir elementin birincil/alternatif
locator'ına eşitse aynı element güncellenir (yeni kayıt açılmaz, yeni adaylar
onaysız elementte ≤5 alternatife eklenir; onaylı elementin locator'ları ve
onayı değişmez). Her elemente `<sayfa>.<etiket>` biçiminde anahtar önerilir
(çakışmada `_2`); anahtar org + proje + origin içinde tekildir. Satırdaki
**Düzenle** ile ad, anahtar (ör. `login.username`), sayfa anahtarı, birincil
locator / alternatifler (birincil yap, kaldır) ve onay değiştirilir; "Durum"
filtresi onaylıları ayırır. Kayıt `PUT /v1/projects/:id/ai/elements/:elementId`
ile `expectedRevision` ister (eskiyse 409); locator değişikliği onayı kaldırır,
onaylı elementin anahtarı kilitlidir, her değişiklik salt okunur geçmişe
yazılır. Alternatifler çalıştırmada otomatik denenmez. Onaylı elementin
yeniden gözlemde bulunan yeni adayları **önerilen alternatifler** olarak
düzenleme panelinde görünür; "Alternatif olarak ekle" yeni revizyon üretir ve
birincil locator değişmediği için onayı korur.

**Suite'ler elementleri anahtarla kullanır** (ADR 014): suite üretim
prompt'u önce sitenin onaylı elementlerini (anahtar, ad, sayfa, kırılgan),
sonra yeni gözlemleri verir; action hedefi ya `element: "login.username"` ya
da (onaysız gözlem için) `locator` olur. Model onaylı bir elementin locator'ını
ham kullanırsa üretimde deterministik olarak anahtara çevrilir. Taslak
onayında kullanılan element revizyonları sabitlenir (`ai_suite_elements`);
çalıştırma anahtarı bu revizyondan çözer, element onaysız/silinmişse adım
`ELEMENT_UNAVAILABLE` ile düşer. Kalıcı testler `elementKey` + `revision`
anlık görüntüsü taşır (checksum'a dahil). Taslak ve çalışma adımlarında
element adı ve anahtarı görünür.

**Locator değişikliği etkisi** (ADR 015): element yeni revizyon alınca
düzenleme panelindeki **Etkilenen testler** bölümü, son sürümü bu elementin
eski bir revizyonunu kullanan kalıcı testleri gösterir (test sürümü, pinli →
güncel revizyon, birincil/alternatif/ad farkı). Testler ekranında bu testler
"güncel olmayan element" rozeti taşır. **Yeni sürüm oluştur** (insan
kararıyla, test başına) güncel onaylı revizyonlarla yeni bir test sürümü
yazar; eski sürüm ve checksum'ı değişmez. Referanslardan biri onaysız ya da
silinmişse istek liste halinde reddedilir. Yeni sürüm aynı panelden **Yeni
sürümü çalıştır** ile mevcut çalıştırma hattında koşar. Onaylı elementte
bekleyen önerilen alternatif sayısı listede ve panelde rozetle görünür.

## Mimari

## AI Test Assistant

Sol menüden **Ayarlar** açılarak OpenAI-compatible provider adı, Base URL
(`/v1` dahil), API anahtarı, model ve timeout girilir. **AI Test Assistant**
ayrı chat ekranından açılır.
**Test Connection** gerçek `chat/completions` isteği yapar; **Fetch Models** gerçek
`models` endpoint'ini okur. Model listeleme yoksa model ID elle yazılabilir.
Birden fazla provider saklanabilir; aktif olan chat'te seçilir. API anahtarı
tarayıcıya geri dönmez, yerel SQLite'da AES-256-GCM ile şifreli tutulur.
Şifreleme anahtarı SQLite dosyasıyla aynı veri dizinindeki `assistant.key`
dosyasında 0600 izinleriyle üretilir (varsayılan: `.local/assistant.key`).
`ZC_DATA_DIR` kullanılıyorsa veritabanı ve anahtar birlikte korunmalıdır.
Kalıcı ortamlarda 32 bayt base64
`ZC_AI_ENCRYPTION_KEY` kullanılabilir. Anahtarı kaybetmek kayıtlı provider
anahtarlarını okunamaz yapar.

Chat'te hedef URL ve test isteği gönderilir; URL doğrudan prompt'ta yazılırsa
hedef alanına da uygulanır. Hedef henüz yetkili değilse chat, düzenleme yetkisi olan kullanıcıya
**Siteyi ekle ve tekrar gönder** seçeneği sunar; HTTPS origin listeye kaydedilip
aynı istek yeniden gönderilir. Ayrı worker gerçek Chromium ile
hedef sayfanın DOM öğelerini pasif inceler, seçilen modele gözlemleri gönderir.
Model yalnız gözlenen locator'larla yapılandırılmış suite taslağı döndürebilir.
Şema hatasında modelden en fazla bir kez, hatalı alanlar belirtilerek düzeltilmiş
JSON istenir; geçersiz yanıt çalıştırılabilir suite olarak kaydedilmez.
Taslak JSON olarak düzenlenir, insan onayıyla kaydedilir; `Testler` ekranındaki
**AI suite’ler** listesinde ve chat'te görünür. Çalıştırma her senaryoyu ayrı
Chromium context'inde yürütür; durum, adım hataları, başarılı/başarısız/atlanan
sayıları ve her adımın yetki/checksum kontrollü ekran görüntüsü chat'te görünür. Başarısız
suite için modelden hata önerisi istenir; suite yeni taslak olarak yeniden
ürettirilip tekrar onaylanabilir. Kod çalıştırma, otomatik locator değiştirme ve sınırsız
agent döngüsü yoktur.

AI planlayıcı hedef sayfadan başlayıp sınırlı bir keşif döngüsü yürütür: model
her turda gözlenen öğelerden tek bir `fill`/`click` adımı ya da `{"done":true}`
döndürür, worker adımı aynı Chromium context'inde uygular ve yeni sayfayı
gözler. Sınırlar: en fazla 8 sayfa, 20 keşif adımı, 120 saniye, yalnız aynı
origin (uçtan uca checkout gibi 6 sayfalık akışlar sığar). Worker keşif işinin
lease'ini `max(180 sn, 120 sn + provider timeout + 30 sn)` yapar; son adımın
provider çağrısı süre sınırını aşsa da iş düşmez. Keşif her zaman yapılandırılmış bir durma nedeni kaydeder
(`inspection.stopped = {reason, message, step?}`): `done`, `limit_pages`,
`limit_steps`, `timeout`, `step_failed`, `invalid_step`, `unobserved_locator`,
`value_not_in_prompt` (ör. uydurulmuş kimlik bilgisi; adım uygulanmaz). Erken
durmada o ana kadar görülen sayfalarla devam edilir; taslak kartı keşif yolunu
adım adım (sayfa → eylem → sonuç) ve erken durma uyarısını gösterir. Parola
alanına yazılan değerler API yanıtında ve arayüzde `••••••` olarak maskelenir.
Analiz iki ayrı kuyruk işidir: `ai_analysis` yalnız keşfi yapar ve taslağı
`explored` durumuna alır, ardından `ai_generate` kayıtlı keşiften suite üretir
(`generating` → `ready`); böylece her iş 180 sn lease içinde kalır. Süresi dolan
lease her iki tür için taslağı `failed / WORKER_LEASE_EXPIRED` yapar. "Yeni
taslak olarak düzelt" keşfi tekrarlamaz, doğrudan `ai_generate` kuyruğa alır
(önceki suite ve isteğe bağlı `instruction` ile). Suite taslağı tüm incelenen sayfaların birleşik
locator kümesini kullanır, her senaryo yine `targetUrl`'den başlar ve keşif
yolunu tekrarlar. Suite sınırları: en fazla 10 senaryo, senaryo başına 20,
suite başına toplam 120 adım; suite başlığı 120, senaryo başlığı 160 karakter
(modele 120 söylenir). Sınırlar üretim isteminde açıkça belirtilir; istek daha
fazlasını isterse model en önemli senaryoları seçer. Her senaryo 30 sn ile
sınırlıdır; suite çalıştırması lease'i senaryo sayısına göre uzatır
(`senaryo × 30 sn + 60 sn`, en az 180 sn). Gözlenmeyen locator önerisi
bir düzeltme çağrısıyla modele geri bildirilir. Boş provider yanıtı (ör. yalnız
`reasoning_content`) düzeltme hakkını harcamadan bir kez yeniden istenir; ikinci
boş yanıt `PROVIDER_EMPTY` olur. Sayfa başına en fazla 60 öğe
gözlenir; iframe, yeni sekme ve dosya yükleme akışları keşfedilmez.

Hedef varsayılan olarak yalnız `http://127.0.0.1:4100` demo origin'idir.
Harici HTTPS siteleri **Ayarlar → Test edilecek siteler** listesine ekle; URL
origin'e indirgenir (`https://www.saucedemo.com/inventory.html` →
`https://www.saucedemo.com`) ve API ile worker listeyi her işlemde okur.
Yeniden başlatma gerekmez. Eski `ZC_AUTHORIZED_TARGET_ORIGINS` ortam değişkeni
de desteklenir. İçerik ve kaynak istekleri aynı origin'e kısıtlıdır. Harici
hedefin ağ erişimi ayrıca çalıştırma ortamının egress politikasına bağlıdır.
Provider Base URL'i harici kullanımda
HTTPS ve public adres ister. Özel geliştirme testinde yerel provider için
`ZC_AI_ALLOW_LOCAL_PROVIDER=1` kullanılabilir; üretim ayarı değildir.

Pozitif giriş testi için geçerli test hesabı/verisi gereklidir; AI bunları
uydurmaz. Kullanıcının onayladığı suite'deki `fill` ve `click` adımları gerçek
hedefte yan etki yapabilir. Henüz gerçek üyelik/auth, secret vault, DNS pinning,
izole browser container ve harici staging doğrulaması yoktur; bu prototipi
güvenilmeyen hedeflere veya üretim hesaplarına açmayın. AI suite'leri mevcut
canonical Demo Bank testlerinden ayrı veri modelinde tutulur.

**Kalıcı teste dönüştür** (Testler → AI suite'ler): onaylı suite, değişmez ve
sürümlü bir AI testine (`ai_tests`, migration 006) dönüşür; kullanılan
elementler gözlemden anlık görüntü olarak saklanır ve tanımın SHA-256'sı
tutulur. Aynı konuşmada revize edilip onaylanan suite aynı testin yeni sürümü
olur; eski sürüm değişmez. Kalıcı testler AI suite executor'ı ile ayrı
`ai_test_run` işinde çalışır, plan snapshot + checksum run'a yazılır; hedef
origin yetkisi her çalıştırmada (API ve worker) yeniden kontrol edilir.
Sonuçlar ve kanıt görüntüleri Çalıştırmalar'da görünür. Ayrıntı:
`docs/decisions/012-promoted-ai-tests.md`.

**Test verileri** (Ayarlar → Test verileri): kullanıcı adı/parola gibi değerler
proje başına bir kez kaydedilir (`test_variables`, migration 007); isteğe bağlı
olarak tek bir hedef origin'e kapsamlanır (origin'e özel kayıt, tüm hedefler
kaydını ezer). Prompt ve suite'lerde `{{SAUCE_USER}}` gibi referans yazılır.
Gizli değerler provider anahtarıyla aynı AES-256-GCM anahtarıyla şifreli
saklanır, kayıttan sonra tarayıcıya dönmez (`••••••`), AI sağlayıcısına
gönderilmez (model yalnız adları ve gizli olmayan değerleri görür; giden istekte
gizli değer `{{KEY}}`'e çevrilir) ve log/kanıt JSON'una yazılmaz; ekran
görüntülerinde input'lar zaten maskelidir. Keşifte `fill` değeri ya istekte
birebir geçen bir metin ya da tanımlı bir `{{KEY}}` referansı olmalıdır.
Suite'ler ve kalıcı test sürümleri yalnız referansı saklar; değer yalnız
worker'da çalıştırma anında çözülür. Tanımsız referans adımı
`MISSING_VARIABLE` ile başarısız yapar (asla PASS değil). Bir değeri
değiştirmek yayımlanmış test sürümlerini değiştirmez (sürüm referansı
saklar, checksum aynı kalır); yeni değer sonraki çalıştırmada kullanılır.

**Sayfa kalite kontrolleri**: AI suite'leri ve kalıcı testler bulunduğu sayfada
üç ek doğrulama kullanabilir. `assertNoConsoleErrors` senaryo başından beri
konsol hatası/yakalanmamış sayfa hatası olmadığını kontrol eder (isteğe bağlı
en fazla 5 `ignore` alt metni; worker'ın engellediği dış istekler
(`ERR_BLOCKED_BY_CLIENT`) sayılmaz). `assertNoBrokenLinks` sayfadaki en fazla
30 aynı-origin `<a href>` bağlantısını tarayıcı context'inin request API'siyle
HEAD (gerekirse GET, yönlendirme izlenmez) ile yoklar; ≥400 veya ağ hatası
kırık sayılır. `assertAccessible` paketle gelen axe-core'u (4.14.0, MPL-2.0)
sayfanın içinde yerel çalıştırır (WCAG 2.0/2.1 A/AA kuralları; `impact`
eşiği `critical|serious`, varsayılan `serious`); sayfa içeriği hiçbir yere
gönderilmez. Kanıt JSON'u yalnız özet bulguları saklar (mesaj ≤300 karakter,
URL'ler query'siz, en fazla 10 bulgu: kural, etki, hedef seçici, yardım
metni); hata açıklaması için provider'a yalnız adım türü/kodu gider. Kontrol
gerçekten çalışmazsa adım `CHECK_NOT_RUN`/`ACTION_FAILED` ile başarısız olur,
asla PASS sayılmaz. Model bu kontrolleri yalnız istek açıkça kalite,
erişilebilirlik, bağlantı veya konsol kontrolü istediğinde ekler.

**Modelleri karşılaştır**: Sohbet alanındaki "Modelleri karşılaştır" kutusu
2–3 model seçtirir (kayıtlı herhangi bir provider; "Modelleri getir" kayıtlı
anahtarla `/v1/ai/providers/:id/models` çağırır, anahtar tarayıcıya dönmez).
Aynı hedef ve istek için keşif **bir kez** çalışır (ilk model yönetir); ardından
her model aynı inceleme sonucundan kendi `ai_generate` işinde suite üretir —
karşılaştırma adil ve ucuzdur. Tablo model başına şunu gösterir: şemaya ilk
denemede mi, düzeltme çağrısından sonra mı uyduğu (yanıt sayısı), senaryo /
adım / doğrulama sayısı, kırılgan (nth-of-type/nth-child) locator kullanımı,
üretim süresi, provider `usage` döndürürse token (girdi/çıktı), başarısızsa
hata kodu. Onay insanda kalır: her taslak ayrı onaylanır ve çalıştırılır;
tablo her taslağın son suite çalıştırmasının sonucunu (başarılı/başarısız)
gösterir. Karşılaştırma `ai_comparisons` + `ai_comparison_drafts`, üretim
ölçüleri `ai_generation_metrics` tablosundadır (migration 008; ölçüler her
taslak için tutulur). Maliyet sınırı: en fazla 3 model; provider timeout'ları
aynen kullanılır; keşif başarısız olursa bekleyen tüm karşılaştırma taslakları
aynı hata koduyla başarısız olur.

## Raporlama

Çalıştırmalar ekranının üstündeki **Tüm çalıştırmalar** kartı klasik testleri,
AI suite çalıştırmalarını ve kalıcı AI testi çalıştırmalarını tek listede
gösterir; test, durum ve tarih aralığına göre (UTC gün) sunucu tarafında
filtrelenir ve sayfalanır. Her satırda süre, kısa hata nedeni ve **HTML raporu
indir** bağlantısı var. Rapor tek dosyadır: test adı/sürümü, plan checksum'ı
(AI suite için suite tanımı SHA-256), adımlar ve durumları, kalite bulguları ve
SHA-256'sı doğrulanan adım/senaryo ekran görüntüleri (base64). Girdi değerleri
rapora yazılmaz; gizli test verileri ayrıca `{{KEY}}`'e çevrilir. PDF dışa
aktarımı yok.

Testler ekranındaki **Test istatistikleri** kartı her test için son N (10/20/50,
varsayılan 20) tamamlanmış çalıştırmanın başarı oranını, ortalama süresini ve son
hata nedenini gösterir. **Dalgalı** rozeti: aynı test sürümünün son 10 tamamlanmış
çalıştırmasında hem başarılı hem başarısız sonuç varsa verilir; altyapı hatası,
engellenen, zaman aşımı ve iptal edilen çalıştırmalar gösterilir ama dalgalanma
saymaz. Kurallar `packages/domain/src/reporting.ts` içinde saf fonksiyonlardır
(`tests/reporting.test.ts`).

## Mimari

- `apps/web`: Next.js Türkçe çalışma alanı; business / flow / technical projeksiyonları.
- `apps/api`: Fastify; oturum, yetki, mapping onayı, publish, queue ve artifact erişimi.
- `apps/worker`: ayrı proses; kuyruktan tek iş alır, tarayıcı context'ini izole eder.
- `packages/domain`: Zod runtime şemaları, canonical model, deterministik compiler.
- `packages/storage`: Node SQLite/WAL, atomik lease ve terminal result CAS.
- `packages/runner`: pasif demo discovery ve allowlisted Playwright yorumlayıcısı.
- `infra/migrations`: yerel şema v1. PostgreSQL geçişi henüz uygulanmadı.

`pnpm` workspace düzeni hazırdır; bu ilk dilimde bağımlılıklar tek root manifest
ve lockfile'dadır. Paketler bağımsız yayımlanmıyor. Tüm çalışma mevcut checkout'ta
yapılır; yeni worktree gerekmez.

## Veri ve güven sınırı

SQLite dosyası ve screenshot'lar `.local/` altında kalır (`ZC_DATA_DIR` ile başka
bir dizin seçilebilir). Published test ve model sürümleri güncellenemez; her run
plan snapshot'ını ve checksum'ını saklar. Assertion veya screenshot kanıtı eksik
bir sonuç PASS olarak finalize edilemez. Crash sonrası süresi dolan lease,
bir sonraki worker tarafından `infrastructure_error` olarak kapatılır; otomatik
retry yoktur. Yeniden çalıştırma ayrı run oluşturur.

Oturum **yerel demo oturumudur**; gerçek kullanıcı kimlik doğrulaması değildir.
API org kapsamını oturumdan alır, HttpOnly/SameSite cookie ve yazma isteklerinde
origin/custom-header kontrolü kullanır. Loopback dışına açma. HTTPS, gerçek
identity/membership, rate limiting ve PostgreSQL tamamlanmadan pilotta kullanma.

Yalnız sabit Demo Bank origin'i ve belirli rotalar desteklenir; browser'ın diğer
istekleri ve WebSocket'leri engellenir. Bu dar yerel istisna genel amaçlı SSRF
koruması veya private runner desteği değildir. Playwright'ın yerel launch
varsayılanı kullanılır; OS/container sandbox sertleştirmesi henüz yoktur.

Fixture hesabı herkese açık sentetik test verisidir. Gerçek credential/vault
adaptörü bulunmaz. Screenshot'taki input alanları maskelenir; trace, console ve
network body kaydı yapılmaz. Artifact her erişimde oturum/org kapsamı ve SHA-256
ile kontrol edilir; kısa ömürlü signed URL ve retention henüz uygulanmadı.

Araştırma kapıları, üretim güvenliği, bağımsız pilot ve ürünün ticari iddiaları
doğrulanmış sayılmaz. Kararlar: [ADR 011](docs/decisions/011-first-increment.md).
