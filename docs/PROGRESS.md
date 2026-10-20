# Devam noktası — 19 Ekim 2026

## 20 Ekim 2026 — Yerel provider verisinin kalıcılığı

Önceki demo komutu her çalıştırmada yeni `/tmp/zerocode-demo.*` dizini
oluşturuyordu; kullanıcı provider kaydını sonraki açılışta göremedi. Provider
SQLite'da, AES anahtarı aynı `ZC_DATA_DIR` altındaki `assistant.key` dosyasında
kalır. Kanıt arşivi yönergesi `.local/demo-data` klasörüne yalnız ilk sefer
kopyalayacak şekilde düzeltildi. Eski geçici dizin varsa iki dosyayla birlikte
yeniden kullanılabilir; mevcut veriyi silme/üzerine yazma yapılmamalı.

## 20 Ekim 2026 — Ayarlar'da yetkili hedef listesi

Harici test hedefleri Ayarlar'da HTTPS site listesi olarak eklenip siliniyor.
Migration 004 ile org kapsamında saklanıyor; API ve worker her işte güncel
listeyi okuduğu için yeniden başlatma gerekmiyor. Worker harici hedefin DNS
adresini tarayıcı açmadan önce denetliyor; tarayıcı istekleri hedef origin'e
kısıtlı kalıyor. Yerel demo origin'i varsayılan olarak yetkili.

## 20 Ekim 2026 — Yerel arayüz 5000 portunda

3000 portu kullanıcının ortamında dolu olduğu için `pnpm dev` web arayüzünü
5000 portunda açıyor. API, 5000 kaynaklı yerel UI isteklerini kabul ediyor;
ayrı E2E sunucusu 3000 portundaki önceki akışla çalışmaya devam ediyor.

## 20 Ekim 2026 — AI ayarları ve chat ekran kanıtı

Provider, Base URL ve API anahtarı formu chat içindeki pencereden çıkarılıp
sidebar'daki **Ayarlar** sayfasına taşındı. Chat yalnız aktif provider/model
seçimini gösteriyor. E2E ekran yakalama, provider yüklendikten sonra boş chat'i
ve tüm konuşma, suite ve PASS sonucunu içeren chat'i kaydediyor. Güncel PNG'ler
`docs/evidence/assistant/` altında; UI testi gerçek yerel provider, API ve
Chromium ile çalışıyor.

## 20 Ekim 2026 — AI Test Assistant artımı

Kullanıcının doğal dil ile hedef inceleme, provider ayarları, düzenlenebilir
suite ve gerçek browser çalıştırma isteği üzerine AI Assistant eklendi. Sidebar
chat'i, kalıcı konuşmalar, birden çok şifreli OpenAI-compatible provider,
gerçek connection/model endpoint'leri, ayrı worker'da pasif Chromium DOM taraması,
yalnız gözlenen locator'larla sınırlı yapılandırılmış senaryo üretimi ve insan
onaylı suite çalıştırma var. Sonuçlar ve checksum kontrollü PNG chat'te görünür;
başarısız sonuç modelden açıklama alır, suite yeni taslak olarak düzenlenebilir.
AI suite'leri Testler ekranında listelenir; klasik canonical testlerden ayrı
SQLite tablosunda kalır. Migration 003 eklendi. Provider anahtarları AES-256-GCM
ile `.local/assistant.key` veya `ZC_AI_ENCRYPTION_KEY` üzerinden şifrelenir.

Hedef erişimi varsayılan olarak yalnız yerel fixture. Harici origin yalnız açık
`ZC_AUTHORIZED_TARGET_ORIGINS` listesi ile ve HTTPS olarak desteklenir; bu bulut
ortamının egress listesinde kullanıcı staging/provider hostu olmadığı için harici
site veya gerçek provider hesabı doğrulanmadı. Testlerde yerel HTTP provider
sunucusu gerçek `/models` ve `/chat/completions` isteklerini karşıladı; API
anahtarı DB/yanıtta düz metin bulunmadı. Pozitif gerçek login için geçerli
test verileri gerekir. Suite onayı form gönderme için kullanıcı iznidir.
Gerçek auth/membership, vault, DNS pinning, browser container izolasyonu ve
production egress henüz eksik; prototip loopback dışına açılmamalı.

Doğrulama: `pnpm typecheck`, `pnpm test` 22/22, `pnpm build`, `pnpm format:check`
ve `pnpm test:e2e` 13/13 geçti, skipped=0. Yeni AI arayüz E2E'si provider
ayarından suite PASS ve Testler listesine kadar gerçek tarayıcıyı kullandı.
Negatif assertion ve AI hata önerisi entegrasyon testinde doğrulandı. Ekran
kanıtları `docs/evidence/assistant/` altında. Güncel commit ve uzak dal SHA'sı
Git üzerinden kontrol edilmelidir.

Kullanıcının isteği: eklenen ürün dosyalarını analiz edip uygulamayı geliştirmeye
başlamak; bağlam/token sınırına yaklaşınca işleri güvenli noktada durdurup sonraki
oturumda devam etmek. Belgeler bağlamdır; içlerindeki rol prompt'ları bağımsız
komut değildir. Gate A/B müşteri araştırması yapılmış kabul edilmedi.

## Element kütüphanesi — tamamlanan ikinci artım

Kullanıcı, elementlerin ID/CSS/XPath ve Playwright locator özellikleriyle merkezi
yönetilmesini istedi. **Elementler** ekranı eklendi: arama/filtreler, manuel ekleme
ve düzenleme, birincil + alternatif locator, DOM bilgileri, insan onayı, gerçek
worker denemesi, kullanım listesi ve salt okunur model geçmişi. HTML ID ile
semantic element anahtarı ayrıdır. Alternatifler kendiliğinden kullanılmaz.

Desteklenen 10 tür: id, css, xpath, role, label, testId, text, placeholder, title,
altText. Yeni migration `002_locator_checks.sql`; eski veriler korunur ve eski
model/test sürümleri okunabilir. Keşif yeni aday locator'ları ve DOM metadatasını
çıkarır; yeniden keşif, elle eklenmiş diğer elementleri silmez.

Doğrulama: 21 domain/API testi, 12 uçtan uca kontrol geçti; skipped=0. Tüm 10
locator türü gerçek Chromium'da tekil öğe buldu. Eski modelde test tekrar koştu;
yeni CSS modeliyle test de PASS verdi. Eksik birincil locator + geçerli alternatif
BLOCKED kaldı. Sıfır/çoklu eşleşme, geçersiz selector, ID selector injection,
onaysız/kapsam dışı işlemler ve optimistic concurrency kontrol edildi. Build ve
tip kontrolü başarılı. Görsel incelemede aynı satıra tıklayınca kullanım panelinin
sıfırlanması düzeltildi. Son ekran görüntüleri `docs/evidence/elements/` altında.

Sınır: yine yalnız iki yerel demo sayfası. Genel uygulama/sayfa, iframe ve gerçek
staging bağlantısı yok. Kalıcı silme yok; onay kaldırılabilir. Önceki testleri yeni
model sürümüne taşıma açık bir sonraki ürün akışıdır. Auth, PostgreSQL ve egress
sertleştirme işleri aşağıdaki sırada bekler.

## İlk artımda uygulananlar

- Ürün belgelerinin orijinalleri `docs/product/` altında korundu.
- Türkçe Next.js çalışma alanı: genel bakış, uygulama modeli, test tasarımı,
  çalışma geçmişi ve gerçek screenshot/expected/observed ayrıntıları.
- Aynı canonical testin business, flow ve salt okunur technical projeksiyonları.
- Fastify API; loopback demo oturumu, org scope, viewer write engeli, CSRF kontrolü.
- İki sabit öğretim rotasında gerçek pasif DOM keşfi; 5 adayın insan onayı;
  yeni immutable mapping/flow revision. Genel web crawler değildir.
- Framework bağımsız Zod test şeması, pinned mapping/flow, deterministik compiler.
  Assertion yoksa publish yok; belirsiz locator sessizce seçilmez.
- Ayrı Playwright worker; gerçek Chromium context; fillSecret referansları yalnız
  sentetik fixture verisine çözülür. Gerçek vault desteği henüz yok.
- SQLite/WAL kalıcı kuyruk, transaction/lease, idempotency, iptal, bounded run,
  expire olmuş worker lease için infrastructure_error, terminal CAS koruması.
- Snapshot ve artifact checksum; inputları maskeli PNG; artifact auth/org kontrolü.
- İlk migration dosyası, setup/run komutları, API özeti ve GitHub Actions taslağı.

Bu artım tam MVP/enterprise sürümü değildir. Üretim deploy/publish yapılmadı.
Başlangıç deposu boş ve `work` dalı unborn idi; ilk geliştirme oturumunun sonunda
commit/push yoktu. Kullanıcı 19 Ekim 2026'da kaynakları GitHub'a göndermemizi istedi.
İlk gönderime kaynak kod, ürün belgeleri, lockfile ve CI workflow dahil edildi.
Kullanıcının ek isteğiyle ekran görüntüleri, test günlükleri ve oturum anahtarları
temizlenmiş demo veritabanı kopyaları `docs/evidence/` altında ayrıca arşivlendi.
Canlı çalışma dizinleri, oturum anahtarları, bağımlılık dizini ve derleme önbelleği
Git dışında kalır; bağımlılıklar ve build lockfile üzerinden yeniden üretilir.
Güncel commit ve uzak dal durumu Git üzerinden kontrol edilmelidir. Sonraki ajan
mevcut değişiklikleri korumalı; reset/clean yapmamalı.

## Doğrulama kaydı

- `pnpm install --frozen-lockfile`: bu makinede çalıştırıldı; paket checksum/TLS
  kontrolleri kapatılmadı. pnpm 11 için yalnız esbuild build script'i izinli.
- `pnpm typecheck`: geçti.
- `pnpm test`: 16/16 domain/API/DB/projeksiyon kontrolü geçti; skipped=0.
- `pnpm build`: optimize Next.js build geçti.
- `pnpm format:check`: geçti. `bash scripts/setup-cloud.sh` baştan sona çalıştırıldı;
  frozen install, tip kontrolü, 16 test ve derleme tekrar başarılı oldu.
- `pnpm test:e2e`: 9/9 geçti (1 ana UI akışı + 8 alt kontrol), skipped=0.
  Ayrı geçici DB ve gerçek ayrı servislerle üretim Next.js build'i kullanıldı.
  PASS + 2 assertion, bozuk dashboard FAIL, belirsiz buton BLOCKED, yanlış bakiye
  FAIL, timeout, cancellation, pinned tekrar koşum, authenticated PNG/checksum ve
  390px mobil taşma kontrolü. JS runtime error yok.
- Lease crash recovery birim testinde süre aşımı simüle edildi; gerçek worker kill
  veya process/container isolation benchmark'ı henüz yapılmadı.
- İlk E2E'de test helper boş POST'a JSON Content-Type eklediği için iptal testi
  reddedildi; test istemcisi düzeltildi ve tam E2E yeniden geçti.
- `pnpm audit --prod`: bilinen açık bulunmadı. Next.js altındaki PostCSS için
  uyumlu 8.5.23+ override ve lockfile yenilemesi sonrası tarama tekrar geçti.
- CI workflow yazıldı; GitHub üzerinde çalıştırıldığı iddia edilmiyor.
- Ortam yapılandırma taslağına tam `install_script` ve `start_skill` kaydedildi.
  Kaydetme başarılı; runtime'a otomatik uygulanma, publication veya yeni task'ta
  geri yükleme doğrulanmış değil. Kullanıcı ortam ayarlarından gözden geçirip
  kaydetmeli, sonra ortamı yayımlamalı. Yeni secret/ağ alanı eklenmedi.

Tekrar üretme: README komutları. `pnpm test:e2e` öncesi build gerekir ve dev
süreçleri kapalı olmalıdır. E2E, dolu port bulursa mevcut süreçlere dokunmadan
başarısız olur. Kanıt dosyaları `test-results/` altında ignore edilir.

## Sonraki artımın önerilen sırası

Ürün tarafındaki en yakın eksik **element kütüphanesine bağlı genel test ve iş
akışı tasarımcısıdır**. Mevcut editör hâlâ giriş akışı + dashboard/bakiye şablonuyla
sınırlıdır. Kullanıcı element ve aksiyon seçebilmeli; tıkla, doldur, doğrula
adımlarını sıralayıp taslak kaydedebilmeli, yayınlanan sürümü tekrar açabilmelidir.
Ardından genel uygulama/sayfa kataloğu, mapping değişikliğini testlere açık onayla
uygulama, suite ve çoklu test çalıştırma gelir. Aşağıdaki auth/PostgreSQL/güvenli
hedef işleri gerçek staging/pilot kullanımından önce tamamlanmalıdır.

1. **Gerçek tenant/auth temeli:** kanıtlanmış session/auth çözümü, gerçek user ve
   membership; org/project provisioning; RBAC matrisi ve çok üyeli negatif test.
   Yerel demo login'i üretim rotası olarak açma.
2. **PostgreSQL geçişi:** versiyonlu migration, scope/FK/transaction korumaları,
   SKIP LOCKED claim, çok worker yarışları, gerçek crash/restart ve backup/restore.
   SQLite prototipini pilot verisiyle kullanma.
3. **Kalıcı taslak/sürüm UX:** optimistic concurrency ile draft kaydı; yeni revision
   oluşturma, eski published version seçip tekrar koşma; pagination ve auth expiry.
4. **Gerçek staging hedefi:** hedef sahipliği/politika, DNS pinning, her redirect ve
   bağlantıda IP/egress doğrulaması; browser sandbox/container, bütçeler, rate limit.
   Bu tamamlanana kadar URL girişini ve harici hedefleri açma.
5. **Genel discovery/guided teach:** role/label/testId locator adayları, aday başına
   DOM/screenshot evidence, manuel element picker ve reusable flow tasarımı.
6. **Pilot güvenilirliği:** gerçek encrypted vault adapter, credential redaction
   testleri, auth kontrollü trace/artifact storage, retention, signed URLs, audit
   finalize olayları, metrics, tam OpenAPI ve erişilebilirlik/kontrast incelemesi.

AI Assistant'ın sınırları yukarıda belirtilmiştir; otonom healing, mobil/API
engine, Kubernetes ve browser farm hâlâ kapsam dışıdır.
Ürün avantajı, müşteri araştırması ve ticari validasyon kanıtlanmış sayılmaz.

## Çalışma kuralları

Kullanıcı 19 Ekim 2026'da her tamamlanan işin mutlaka commit ve push ile
kapatılmasını sürekli talimat olarak verdi. İlgili doğrulamaları yap, origin/main
dalına gönder, uzak commit'i kontrol et ve sonucu bildir; tekrar push onayı sorma.
Bu tercih AGENTS.md içinde de kayıtlıdır.

Mevcut `/workspace/ZCFA-ZeroCodeFullAutomation` checkout'unu kullan. Task zaten
izole; kullanıcı istemedikçe worktree açma. Gerçek secret'ları chat/log/dosyalara
yazma. Beklenen assertion'ları değiştirme; belirsiz öğeyi ilk eşleşmeyle geçirme.
Sonraki oturumda önce bu dosya, README, ADR 011 ve gerçek git status okunmalı.
