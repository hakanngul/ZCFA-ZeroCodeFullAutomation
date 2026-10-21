# Sayfa analizi: `/` · Çalıştırmalar bölümü (`calistirmalar`)

> Statik analiz (tarayıcı yok). Bu analiz kaynak kodundan çıkarıldı; çalışan uygulamada gözlenmedi. Kaynaklar: `apps/web/app/page.tsx` (`section === "runs"`, ~1168-1354 satırları), `apps/web/app/components/reporting.tsx` (`RunHistory`), `apps/web/app/components/promoted-tests.tsx` (`PromotedRuns`), `apps/api/src/reporting.ts` (rapor uç noktaları).

```json
{
  "analysisMode": "static",
  "route": "/",
  "section": "runs",
  "slug": "calistirmalar",
  "devUrl": "http://127.0.0.1:5173",
  "sourceFile": "apps/web/app/page.tsx",
  "sourceFiles": [
    "apps/web/app/page.tsx",
    "apps/web/app/components/reporting.tsx",
    "apps/web/app/components/promoted-tests.tsx",
    "apps/api/src/reporting.ts"
  ],
  "requiresAuth": true,
  "authNote": "Yerel demo oturumu: 'Yerel çalışma alanını aç' butonu POST /v1/session/local çağırır; kimlik bilgisi yok. Bölüm salt okunur; yazma işlemi yalnızca 'İptal et' (kuyruktaki/çalışan klasik çalıştırma) için var.",
  "rolesAllowed": [],
  "defaultRole": "admin",
  "entry": {
    "steps": ["http://127.0.0.1:5173 aç", "'Yerel çalışma alanını aç' tıkla", "Kenar çubuğunda 'Çalıştırmalar' tıkla"],
    "sidebarLabel": "Çalıştırmalar",
    "sidebarCount": "data.runs.length + data.aiTestRunCounts.total"
  },
  "components": [
    {
      "id": "run-history",
      "component": "RunHistory",
      "file": "apps/web/app/components/reporting.tsx",
      "heading": "Tüm çalıştırmalar",
      "tag": "<total> çalıştırma",
      "hint": "Klasik testler, AI suite’leri ve kalıcı AI testleri tek listede. Rapor indirme; adımları, bulguları ve SHA-256 doğrulanmış ekran görüntülerini tek HTML dosyasında verir (girdi değerleri ve gizli veriler hariç).",
      "api": "GET /v1/projects/:projectId/reports/runs?limit=10&offset=N[&test&status&from&to]",
      "pageSize": 10,
      "pollingMs": 2000,
      "pollingWhen": "listede queued/running çalıştırma varsa",
      "filters": [
        {"label": "Test", "type": "select", "default": "Tümü", "options": "<title> · <Klasik|AI suite|Kalıcı AI>", "value": "<kind>:<testId>"},
        {"label": "Durum", "type": "select", "default": "Tümü", "options": ["Kuyrukta","Çalışıyor","Başarılı","Başarısız","Engellendi","Zaman aşımı","Altyapı hatası","İptal"]},
        {"label": "Başlangıç (UTC)", "type": "date"},
        {"label": "Bitiş (UTC)", "type": "date", "note": "dahil; API bitiş gününe +1 gün ekleyip '<' kullanır"}
      ],
      "filterChangeResetsOffset": true,
      "table": {
        "columns": ["Test / sürüm", "Durum", "Süre", "Başlangıç", "Hata nedeni", "Rapor"],
        "rowSubtitle": "<Klasik|AI suite|Kalıcı AI> · v<version> · <id[0..8]>",
        "flakyBadge": {"text": "Dalgalı", "title": "Aynı sürümün son 10 tamamlanmış çalıştırmasında hem başarılı hem başarısız sonuç var (altyapı hatası/engellendi sayılmaz)."},
        "duration": "'<x.y> sn' veya '—'",
        "failure": "passed için '—'",
        "reportLink": {"ariaLabel": "<id8> HTML raporunu indir", "title": "HTML raporu indir", "href": "/api/v1/projects/:projectId/reports/runs/:kind/:id/report.html", "download": true, "hiddenWhen": "queued/running → '—'"}
      },
      "empty": "Bu filtrelerle çalıştırma yok.",
      "pager": {"prev": "Önceki", "next": "Sonraki", "label": "<offset+1>–<min(offset+10,total)> / <total> (total=0 → '0 / 0')", "prevDisabledWhen": "offset === 0", "nextDisabledWhen": "offset + 10 >= total"},
      "errorDisplay": "p[role=alert].error"
    },
    {
      "id": "promoted-runs",
      "component": "PromotedRuns",
      "file": "apps/web/app/components/promoted-tests.tsx",
      "heading": "Kalıcı AI testi çalıştırmaları",
      "tag": "Son <n> çalıştırma",
      "api": ["GET /v1/projects/:projectId/ai/test-runs", "GET /v1/projects/:projectId/ai/test-runs/:id"],
      "pollingMs": 1000,
      "empty": "Henüz kalıcı AI testi çalıştırılmadı.",
      "table": {"columns": ["Test / sürüm", "Hedef", "Durum", "Başlangıç", ""], "rowSubtitle": "v<revision> · <id8>", "detailButtonAriaLabel": "<id8> AI test çalıştırma ayrıntıları", "selectedRowClass": "selected-row"},
      "statusLabels": {"queued": "Kuyrukta", "running": "Çalışıyor", "passed": "Başarılı", "failed": "Başarısız", "blocked": "Engellendi", "infrastructure_error": "Altyapı hatası"},
      "statusLabelGap": "timed_out ve cancelled için etiket yok; ham değer görünür",
      "detail": {
        "meta": ["<title> · Test v<testRevision>", "<targetUrl>", "Plan SHA-256 <checksum[0..12]>…", "Durum rozeti"],
        "code": "Kod: <code>",
        "counts": "<p> başarılı · <f> başarısız · <s> atlandı",
        "healed": {"role": "status", "class": "ai-healed-summary", "text": "<N> adım alternatifle bulundu (self-healing). Öneriler Elementler ekranında.", "shownWhen": "healedSteps > 0"},
        "scenario": "<title>: <rozet>; 'Hata: <code>'; adım zinciri '<kind> · <elementName> (<element>): <status> (<code>) [alternatifle bulundu: <locator>] — <message>' ' → ' ile",
        "screenshot": {"alt": "<senaryo başlığı> kanıt görüntüsü", "src": "/api/v1/projects/:projectId/ai/test-runs/:id/screenshots/:index", "target": "_blank"}
      }
    },
    {
      "id": "classic-run-history",
      "file": "apps/web/app/page.tsx",
      "heading": "Çalıştırma geçmişi",
      "tag": "Son <n> çalıştırma",
      "empty": {"title": "Henüz test çalıştırılmadı", "text": "Bir test yayınla ve gerçek tarayıcıda çalıştır.", "button": "Testlere git", "buttonAction": "section = tests"},
      "table": {"columns": ["Test / sürüm", "Demo kontrolü", "Durum", "Başlangıç", ""], "rowSubtitle": "v<revision> · <id8>", "variantLabels": {"healthy": "Sağlam uygulama", "broken": "Bozuk dashboard", "ambiguous": "Belirsiz giriş butonu", "slow": "Yavaş uygulama"}, "detailButtonAriaLabel": "<id8> çalıştırma ayrıntıları"},
      "statusLabels": {"queued": "Sırada", "running": "Çalışıyor", "passed": "Başarılı", "failed": "Başarısız", "blocked": "Engellendi", "timed_out": "Zaman aşımı", "infrastructure_error": "Altyapı hatası", "cancelled": "İptal"},
      "pollingMs": 1500
    },
    {
      "id": "run-evidence",
      "file": "apps/web/app/page.tsx",
      "eyebrow": "ÇALIŞTIRMA AYRINTISI · <id8>",
      "heading": "Beklenen sonuç ve gözlenen kanıt",
      "api": "GET /v1/runs/:id (1 sn polling, runId seçiliyken)",
      "meta": ["Test v<testRevision>", "Model v<modelRevision>", "<n> assertion yürütüldü", "SHA-256 <checksum[0..12]>…"],
      "runningState": {"text": "Worker sonucu bekleniyor. Bu aşamada başarı varsayılmaz.", "button": "İptal et", "api": "POST /v1/runs/:id/cancel", "disabledWhen": "busy"},
      "resultCode": "Terminal ikonu + outcome.code",
      "steps": "label; 'Beklenen: <expected> · Gözlenen: <observed|Yok>'; code; '<ms> ms'",
      "noStepsHint": "Bu sonuçta adım yürütme kanıtı yok. Başarılı test sayılmaz.",
      "screenshot": {"alt": "Gerçek test tarayıcısının son ekran görüntüsü", "src": "/api/v1/runs/:id/screenshot", "caption": "SHA-256 doğrulamalı · Form alanları maskeli", "missingWithOutcome": "Ekran görüntüsü mevcut değil.", "missingWithoutOutcome": "Ekran görüntüsü sonuçla birlikte oluşacak."}
    }
  ],
  "reportEndpoint": {
    "path": "GET /v1/projects/:projectId/reports/runs/:kind/:id/report.html",
    "kind": ["canonical", "suite", "ai_test"],
    "idValidation": "z.uuid()",
    "notFound": {"status": 404, "message": "Çalıştırma bulunamadı."},
    "contentType": "text/html; charset=utf-8",
    "contentDisposition": "attachment; filename=\"zerocode-run-<id8>.html\"",
    "csp": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    "htmlTitle": "ZeroCode raporu · <title> · <id8>",
    "rows": ["Tür", "Test / sürüm", "Çalıştırma", "Durum", "Hedef", "Başlangıç / bitiş", "Plan SHA-256 | Suite tanımı SHA-256"],
    "kindLabels": {"canonical": "Klasik test", "suite": "AI suite", "ai_test": "Kalıcı AI testi"},
    "canonicalTarget": "Yerel Demo Bank",
    "notRunStepLabel": "Çalıştırılmadı",
    "imageStates": {"ok": "data: PNG gömülü", "corrupted": "Ekran görüntüsü bütünlük doğrulamasını geçemedi; eklenmedi.", "missing": "Ekran görüntüsü bulunamadı."},
    "footer": "Girdi değerleri ve gizli test verileri rapora eklenmez. Görüntüler kayıtlı SHA-256 ile doğrulandıktan sonra gömülür.",
    "redaction": "secret test_variables değerleri redactSecrets ile maskelenir; fill değerleri rapora yazılmaz"
  },
  "historyQueryValidation": {
    "test": "^(canonical|suite|ai_test):[0-9a-f-]{36}$",
    "status": "queued|running|passed|failed|blocked|timed_out|infrastructure_error|cancelled",
    "from/to": "^\\d{4}-\\d{2}-\\d{2}$",
    "limit": "1..100 (varsayılan 20; UI 10 gönderir)",
    "offset": "0..100000"
  },
  "flaky": "Aynı kind:test:version için son 10 terminal çalıştırmada hem passed hem failed (FLAKY_WINDOW=10)",
  "forms": [
    {"id": "run-history-filters", "fields": ["Test", "Durum", "Başlangıç (UTC)", "Bitiş (UTC)"], "submit": "yok (değişimde anında yükler)"}
  ],
  "modals": [],
  "destructiveButtons": [
    {"label": "İptal et", "scope": "run-evidence, yalnız queued/running", "confirm": false, "note": "Onay diyaloğu yok; tek tık iptal eder"}
  ],
  "outOfScope": ["TestStats ('Test istatistikleri') bu dosyada tanımlı ama runs bölümünde render edilmiyor (Testler bölümü)."],
  "findings": [
    "Durum etiketi tutarsız: klasik tablo queued için 'Sırada', RunHistory ve PromotedRuns 'Kuyrukta' gösterir.",
    "PromotedRuns statusLabels içinde timed_out/cancelled yok; ham İngilizce değer görünür.",
    "'İptal et' onay sormaz ve canEdit ile kilitlenmez; viewer için yetki yalnızca API tarafında."
  ],
  "flows": [
    {"name": "Birleşik çalıştırma geçmişini filtrele ve sayfala", "component": "run-history"},
    {"name": "HTML raporu indir", "component": "run-history / reportEndpoint"},
    {"name": "Klasik çalıştırma ayrıntısı ve kanıt paneli (iptal dahil)", "component": "classic-run-history + run-evidence"},
    {"name": "Kalıcı AI testi çalıştırması ayrıntısı ve self-healing özeti", "component": "promoted-runs"}
  ]
}
```
