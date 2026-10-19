# ADR 011 — İlk geliştirme dilimi (18 Ekim 2026)

Kullanıcı belgeleri analiz edip uygulamayı geliştirmeye başlamamızı istedi.
Belgelerdeki Gate A/B araştırması tamamlanmış kabul edilmez. Bu çalışma yerel,
ölçülebilir bir mühendislik prototipidir; pilot veya üretim teslimatı değildir.

Seçilen öneriler: TypeScript strict, Next.js, Fastify ve ayrı Playwright worker.
Türkçe arayüz, Chromium, tek yerel demo hedefi, insan onaylı mapping ve açık
assertion. Test/flow/mapping sürümleri sabitlenir; API browser başlatmaz.

Bu ilk artımda PostgreSQL yerine Node 24'ün SQLite sürücüsüyle WAL tabanlı kalıcı
yerel kuyruk kullanılır. Sebep: harici servis olmadan gerçek worker davranışını
doğrulamak. Bu bilinçli geçici sapma; tenant pilotundan önce PostgreSQL migration,
SKIP LOCKED ve çok worker yarış testleri gerekir. DB ortak depolama paketindedir.

Giriş yalnız loopback'e bağlı yerel demo oturumu; gerçek kullanıcı doğrulaması
değildir. Org kapsamı oturumdan gelir, request body/header'dan alınmaz. Sahte
PASS veya hazır run sonucu yok; demo hedef gerçek browser ile çalışır.

Harici URL bağlamak kapalıdır. Tek sabit loopback fixture origin'ine dar istisna
vardır; genel SSRF güvenliği varmış gibi sunulmaz. DNS pinning ve kontrollü egress
tamamlanana kadar başka hedef çalıştırılmaz. Gerçek credential/vault, trace,
private runner, AI ve healing bu artımda yoktur. Screenshot alanları maskelenir.

İlk kabul: aday keşfi → onay → canonical test yayınla → ayrı worker → gerçek
PASS ve bozuk fixture FAIL; belirsiz element BLOCKED; tenant IDOR, eksik
assertion, idempotency ve worker lease kaybı negatif kontrolleri.
