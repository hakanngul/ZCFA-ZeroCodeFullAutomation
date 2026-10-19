# 09 — Engineering Standards & Claude Code / Codex Devir Notu

## Standart repository önerisi

```text
zerocode/
├── apps/
│   ├── web/                 # Next.js, user-facing UI
│   ├── api/                 # Fastify modular monolith
│   └── worker/              # Playwright execution / safe discovery
├── packages/
│   ├── domain/              # canonical model + invariants
│   ├── schemas/             # JSON Schema / API DTOs
│   ├── compiler/            # model → execution plan
│   ├── adapters-playwright/ # typed step executor
│   └── ui/                  # shared accessible UI primitives
├── infra/
│   ├── compose/
│   └── migrations/
├── docs/
│   ├── decisions/
│   ├── runbooks/
│   ├── api/
│   └── product/
├── tests/
│   ├── fixtures/demo-aut/
│   ├── contracts/
│   ├── e2e/
│   ├── security/
│   └── negative-controls/
├── AGENTS.md
└── README.md
```

## Korunacak invariants

1. Kaynak tek: `CanonicalTest` versiyonu; business/flow/technical view aynı modelden üretilir.
2. Testler doğrudan JavaScript/Playwright kodu olarak depolanmaz.
3. Testin business expected assertion'ını platform değiştiremez.
4. No assertion → no published/valid PASS.
5. Ambiguous/unknown elements → blocked veya insan çözümü; sessiz seçme yok.
6. Published revision, run snapshot ve artifact immutable.
7. Secrets hiçbir zaman plain log/screenshot metadata ya da response içinde dolaşmaz; referans şeklinde.
8. User URL'sine güvenilmez; SSRF ve prod mutation sınırları zorunlu.
9. Tenant scope API, DB query, queue, worker, artifact access'te enforce edilir.
10. Mocks/simulations testte açıkça etiketlenir; production response'ta gerçek sonuç gibi sunulmaz.

## Coding conventions

- TypeScript strict; public API types and runtime validation; package boundaries enforced.
- Canonical model schema versioned; additions backwards-compatible migration/reader testleriyle gelir.
- UTC timestamps, user UI'da localized; IDs UUID/ULID standardı (tekini ADR ile seç).
- `ApiError {code,message,details?,requestId}` sözleşmesi; log correlation; non-sensitive messages.
- DB migrations ordered; rollback/restore planı; production migration öncesi backup.
- `run` idempotency, `lease` heartbeat ve atomic finalize; yarış koşulları negatif testle kontrol edilir.
- Unit: schema/locators/permissions/compiler; Integration: DB tenant scoping/job transitions; E2E: actual Playwright demo app; Security: SSRF/IDOR/secrets leakage; Regression: seeded UI drift ve false-green.
- CI: typecheck, lint, format, unit, integration, E2E smoke, dependency scan, container build; pipeline false green üretmez.
- PR: küçük dikey değişiklik, user outcome, test evidence, changed schema/ADR, risk & rollback. `docs` ile davranış senkron kalmalı.
- Config/secrets/env schema centrally validated; sample env without credentials.

## Komut verilince kod ajanına gönderilecek görev (hazır brief)

> **Role:** Senior Product Engineer + QA Architect. Read `README.md` and all `01–09` foundation docs first. Do not improvise new product scope; distinguish DECIDED from PROPOSED and VALIDATION REQUIRED. The task is to implement only the smallest end-to-end verified vertical slice after Gate A/B authorization.
>
> **Initial slice:** Org/project access → connect staging web app → safe DOM discovery candidates → manual review/mapping → controlled `Login` business flow + explicit dashboard-visible assertion → versioned CanonicalTest → Playwright isolated worker → real PASS/FAIL/infra results and screenshot/trace details.
>
> **Engineering:** Strict TS, modular API, separate worker, PostgreSQL migrations, bounded run queue and isolation, secure allowlist, tenant-scoped artifacts, honest outputs. No Kubernetes, Mobile, API engine, autonomous AI, distributed browser farm, real-payment interactions or unrelated features. Do not alter business assertions in healing. Provide a clean local setup and demo fixture; avoid irrelevant abstractions.
>
> **Definition of Done:** Run clean install, typecheck, tests and real E2E in local compose; show successful and intentionally failing assertions, a blocked ambiguous selector, another tenant's 403/404, crash/timeout behavior, screenshots/logs (with redacted secrets), and deterministic published revisions. Summarize files changed, verified commands, limitations, and any deferred security/work items. Do not claim a mock or simulated service is real.

## Ajanlar için ilk uygulama paketleme önerisi

1. `EP-01` yalnız identity/project/data schema ve skeleton UI/API/worker, uçtan uca authz negative test.
2. `EP-02 + EP-03` bir staging login page'i keşfet ve mapping'i onayla; pasif tarama ile yan etki yok.
3. `EP-04 + EP-05` canonical test execute + evidence. Bu üç dilim **tek gerçek demo** olunca UX polishing.
4. `EP-06` üç görünüm, sonra `EP-07` maintenance experiment.

**Önemli:** Ürün hipotezi doğrulanmadan mimaride güzel görünen dev sistemler kurma. Başarının kanıtı çalışan ama yanlış PASS vermeyen anlamlı kullanıcı akışıdır.
