# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

ZeroCode: iş adımlarını sürümlü bir test modeline ve gerçek Chromium (Playwright) sonuçlarına dönüştüren yerel prototip. Dil Türkçe (UI, belgeler, commit/ilerleme notları). pnpm workspace; Node 24.x, pnpm 11.25.0, tek root `package.json` + lockfile (paketler ayrı yayımlanmaz). TypeScript ESM, `tsx` ile doğrudan çalışır (derleme adımı yok, yalnız `next build`).

## Komutlar

```sh
pnpm dev            # api(4000) + fixture/demo hedef(4100) + worker + web(5000) supervisor'ı; hepsi 127.0.0.1
pnpm dev:resume     # provider kaydı olan en güncel SQLite verisini (.local/*, eski /tmp/zerocode-demo.*) bulup sürdürür
pnpm typecheck      # tsc --noEmit (apps, packages, scripts, tests)
pnpm test           # unit/API testleri: tests/{domain,api,assistant}.test.ts (node:test via tsx)
pnpm build          # next build apps/web
pnpm test:e2e       # gerçek Chromium + derlenmiş Next; pnpm dev DURMUŞ olmalı (3000/4000/4100 boş), concurrency=1
pnpm format:check   # prettier (CI'da çalışır); düzeltmek için pnpm format
```

Tek test dosyası / tek test: `pnpm exec tsx --test tests/api.test.ts` veya `pnpm exec tsx --test --test-name-pattern="<ad>" tests/api.test.ts`.

CI sırası: typecheck → format:check → test → `pnpm audit --prod` → build → test:e2e. Chromium: `ZC_CHROMIUM_PATH`, Linux `/usr/bin/chromium` veya Playwright'ın kurulu Chromium'u (`pnpm exec playwright install chromium`). E2E çıktıları `test-results/` altına düşer (git-ignore).

Ortam değişkenleri: `ZC_DATA_DIR` (SQLite + screenshot + `assistant.key`, varsayılan `.local/`; kalıcı veri için `ZC_DATA_DIR="$PWD/.local/my-data"`), `ZC_AI_ENCRYPTION_KEY` (32 bayt base64, `assistant.key` yerine), `ZC_AUTHORIZED_TARGET_ORIGINS` (eski; asıl liste Ayarlar → Test edilecek siteler), `ZC_AI_ALLOW_LOCAL_PROVIDER=1` (yalnız dev), `ZC_CHROMIUM_PATH`.

## Mimari

Üç ayrı süreç, aynı SQLite/WAL dosyası üzerinden konuşur (mesaj kuyruğu yok):

- `apps/api` (Fastify): oturum/yetki, mapping onayı, publish, run kuyruğa alma, artifact erişimi. `assistant.ts` AI Test Assistant uçlarını taşır.
- `apps/worker`: kuyruktan tek iş alır (atomik lease), her iş/senaryo için izole Chromium context açar; locator denemesi, DOM keşfi, AI suite çalıştırma buradadır. Lease süresi dolan iş sonraki worker'da `infrastructure_error` olur; otomatik retry yok.
- `apps/web` (Next.js 15, React 19): Türkçe çalışma alanı; API'yi `app/lib/api.ts` ile çağırır. Stiller düz CSS dosyaları.

Paketler (`packages/*`, workspace içi göreli import ile kullanılır):

- `domain`: Zod şemaları, `CanonicalTest`/`AppModel`, deterministik compiler (model → execution plan), business/flow/technical projeksiyonları, locator tipleri.
- `storage`: Node SQLite; şema `infra/migrations/00N_*.sql` dosyalarından `index.ts` içinde sırayla yüklenir — yeni migration eklerken oraya da kaydet. Lease ve terminal result CAS burada.
- `runner`: pasif demo discovery + allowlist'li Playwright yorumlayıcısı (kullanıcı JS'i çalıştırılmaz; yalnız typed adımlar).
- `assistant`: OpenAI-compatible provider istemcisi (`provider.ts`), suite şeması (`spec.ts`), planlayıcı/agent (`agent.ts`): hedefi model yönetimli sınırlı keşifle gözlemle → modele gönder → yapılandırılmış suite taslağı → şema hatasında en fazla 1 düzeltme çağrısı.

Önemli ayrımlar:

- İki ayrı veri modeli var: canonical Demo Bank testleri (sürümlü, onaylı model revision'ları) ve AI suite'leri/Chromium'la gözlenen "web sitelerinden kaydedilen elementler" (migration 003/005). Birbirine karıştırma.
- Published test/model sürümleri değişmez; her run plan snapshot'ı + checksum saklar. Assertion/screenshot kanıtı yoksa PASS finalize edilemez. Platform business expected assertion'ını değiştiremez.
- Hedef yetkilendirme: varsayılan yalnız `http://127.0.0.1:4100`; harici HTTPS origin'ler DB'deki listeden her işlemde okunur (yeniden başlatma gerekmez). Worker içerik/kaynak isteklerini aynı origin'e kısıtlar, diğer istek ve WebSocket'leri engeller.
- Provider API anahtarı SQLite'ta AES-256-GCM ile şifreli; tarayıcıya geri dönmez. `.sqlite` ve `assistant.key` birlikte korunmalı.
- Oturum yerel demo oturumudur (gerçek auth değil); loopback dışına açma.
- AI planlayıcı `exploreTarget` ile sınırlı çok sayfalı keşif yapar (≤5 sayfa, ≤12 adım, ≤120 s, aynı origin; `fill` değeri prompt'ta birebir geçmeli). `ai_drafts.inspection` şekli `{pages, path, stopped?}`; eski tek sayfa şekli `normalizeInspection` ile `pages[0]`'a sarılır.

Testler: `tests/support.ts` ortak fixture/model yardımcıları; `tests/fixtures/server.ts` demo hedef (Demo Bank) sunucusu. `assistant-ui` ve `e2e` testleri gerçek tarayıcı kullanır.

## Çalışma akışı (AGENTS.md'den)

- Önce `README.md` ve `docs/PROGRESS.md`, sonra gerçek Git durumunu oku. Mevcut checkout'ta çalış; istenmedikçe worktree açma.
- Her tamamlanan iş için ilgili doğrulamaları çalıştır, commit et ve `origin/main`'e push et (tekrar onay isteme); uzak commit'i doğrula, sonucu bildir. Push engellenirse yerel commit'i koru, engeli açıkla, force-push yapma.
- Her artımda `docs/PROGRESS.md` devam notunu güncelle (en yeni giriş üstte, Türkçe). Arayüz değişikliklerinde gerçek tarayıcı görüntülerini `docs/evidence/` altına koy.
- Bağlam/token sınırına yaklaşırken güvenli noktada durup devam notu bırak.
- Ürün invariants'ı: `docs/product/09-AGENT-HANDOFF.md`; kararlar: `docs/decisions/`.
