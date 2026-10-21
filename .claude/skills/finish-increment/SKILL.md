---
name: finish-increment
description: Tamamlanan işi doğrular, PROGRESS.md notunu yazar, commit eder ve origin/main'e push eder (AGENTS.md akışı).
disable-model-invocation: true
---

1. `git status` ile gerçek durumu oku.
2. Doğrula: `pnpm typecheck`, `pnpm format:check`, `pnpm test`. UI değiştiyse `pnpm build` ve (portlar boşsa) `pnpm test:e2e`; gerçek tarayıcı görüntülerini `docs/evidence/` altına koy.
3. `docs/PROGRESS.md` en üstüne Türkçe, tarihli kısa devam notu ekle; gerekiyorsa README'yi güncelle. `pnpm format` çalıştır.
4. Commit et (kısa İngilizce özet satırı, mevcut commit stiliyle) ve `git push origin main`. Tekrar onay isteme; force-push yapma.
5. `git ls-remote origin main` ile uzak commit'in yerelle aynı olduğunu doğrula ve kullanıcıya kısaca bildir. Push engellenirse yerel commit'i koru, gerçek engeli açıkla.
