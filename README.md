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
Taslak JSON olarak düzenlenir, insan onayıyla kaydedilir; `Testler` ekranındaki
**AI suite’ler** listesinde ve chat'te görünür. Çalıştırma her senaryoyu ayrı
Chromium context'inde yürütür; durum, adım hataları, başarılı/başarısız/atlanan
sayıları ve her adımın yetki/checksum kontrollü ekran görüntüsü chat'te görünür. Başarısız
suite için modelden hata önerisi istenir; suite yeni taslak olarak düzeltilip
tekrar onaylanabilir. Kod çalıştırma, otomatik locator değiştirme ve sınırsız
agent döngüsü yoktur.

AI planlayıcı şu anda yalnız başlangıç sayfasının DOM'unu inceler. Girişten
sonra açılan sepet ve ödeme sayfalarındaki yeni locator'ları keşfetmediği için
tek promptla tam sipariş akışı henüz desteklenmez.

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
