---
name: new-migration
description: Yeni SQLite migration dosyası oluşturur ve packages/storage/src/index.ts içine kaydeder.
disable-model-invocation: true
---

Argüman: migration adı (ör. `ai_runs`).

1. `infra/migrations/` altındaki en yüksek numarayı bul; sonraki `00N_<ad>.sql` dosyasını oluştur.
2. Migration'lar her açılışta `Storage` constructor'ında `db.exec` ile tekrar çalışır; bu yüzden **idempotent** yaz (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Mevcut tabloyu değiştirme gerekiyorsa mevcut dosyalardaki kalıbı izle.
3. `packages/storage/src/index.ts` içinde son migration'ın `this.db.exec(readFileSync(new URL("../../../infra/migrations/00N_<ad>.sql", import.meta.url), "utf8"))` bloğunun hemen altına aynı kalıpla yeni bloğu ekle.
4. Tablolar org/proje kapsamı taşımalı (mevcut tabloların `org_id` kalıbı).
5. `pnpm typecheck && pnpm test` çalıştır.
