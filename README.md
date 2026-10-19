# ZeroCode — İlk çalışan ürün dilimi

Kontrollü iş adımlarını sürümlü test modeline ve gerçek Chromium sonuçlarına
dönüştüren yerel geliştirme prototipi. Temel ürün belgeleri [docs/product](docs/product/README.md)
altında, geliştirme durumu [docs/PROGRESS.md](docs/PROGRESS.md) dosyasında.

## Çalıştırma

Node **24.x**, pnpm **11.25.0** ve Chromium gerekir. Bu bulut makinesinde Chromium
`/usr/bin/chromium` konumunda hazırdır. Başka bir kurulumda `ZC_CHROMIUM_PATH`
ile executable yolu seçilebilir. Uzak bağlantı ve credential gerekmez.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Bulut ortamında home dizinine yazılamıyorsa, önce şu dizinleri seç:

```sh
export XDG_DATA_HOME=/workspace/.cache/share
export XDG_CACHE_HOME=/workspace/.cache
export PNPM_HOME=/workspace/.cache/pnpm
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store
pnpm dev
```

UI 3000, API 4000, demo hedef 4100 portunda **127.0.0.1'e bağlıdır**. Supervisor
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
# pnpm dev durmuş olmalı; 3000, 4000, 4100 portları boş olmalı.
pnpm test:e2e
```

E2E kendi API, fixture, worker ve derlenmiş Next.js sunucusunu başlatır. Ayrı
geçici veritabanı kullanır; geliştiricinin `.local` verilerini silmez. Gerçek
tarayıcı ekran görüntüleri ve servis günlükleri `test-results/` altında üretilir.
Klasör ignore edilir. Sıfır test veya yalnız açık port başarı kanıtı sayılmaz.

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
