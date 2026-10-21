# QA kataloğu — ZeroCode

Oluşturma: 2026-10-21T19:24:51.815Z · devUrl: `http://127.0.0.1:5173` · Mod: **statik analiz** (tarayıcı geçişi yapılmadı; element envanteri kaynaktan çıkarıldı)

Uygulamada tek URL var (`/`); bölümler kenar çubuğundan açılır. Oturum yerel demo oturumudur ("Yerel çalışma alanını aç").

> Ön koşul: API, web'in portuyla başlatılmalı (`ZC_WEB_PORT=5173`), aksi halde tüm yazma istekleri `CSRF_BLOCKED` ile düşer.

| Bölüm | Yol | Auth | Roller | Görevler |
|---|---|---|---|---|
| Giriş ve kabuk (karşılama, kenar çubuğu, oturum) | `/` | demo oturumu | admin, viewer | [T01](tasks/T01-giris-ve-kabuk-yerel-calisma-alani-ac-as-admin.md) [T02](tasks/T02-giris-ve-kabuk-kenar-cubugu-navigasyon.md) [T03](tasks/T03-giris-ve-kabuk-oturumu-kapat-ve-hata-bandi.md) |
| Genel bakış | `/` | demo oturumu | herhangi | [T04](tasks/T04-genel-bakis-ilk-yukleme-ve-kesif.md) [T05](tasks/T05-genel-bakis-baslangic-rotasi-gezinme.md) [T06](tasks/T06-genel-bakis-metrikler-son-hareketler.md) |
| Uygulama modeli | `/` | demo oturumu | admin | [T07](tasks/T07-uygulama-modeli-kesif-ve-esleme-onayi-as-admin.md) [T08](tasks/T08-uygulama-modeli-esleme-dogrulamasi.md) [T09](tasks/T09-uygulama-modeli-yeniden-kesif-ve-surumleme.md) |
| Elementler | `/` | demo oturumu | herhangi | [T10](tasks/T10-elementler-ai-element-duzenle-onayla.md) [T11](tasks/T11-elementler-birlestir.md) [T12](tasks/T12-elementler-etki-self-healing.md) [T13](tasks/T13-elementler-demo-bank-kayit-defteri.md) |
| Testler (Test çalışma alanı) | `/` | demo oturumu | admin | [T14](tasks/T14-test-calisma-alani-klasik-yayinla-calistir-as-admin.md) [T15](tasks/T15-test-calisma-alani-form-dogrulama.md) [T16](tasks/T16-test-calisma-alani-calistirma-ortami-varyantlar.md) [T17](tasks/T17-test-calisma-alani-kalici-ai-testleri.md) |
| Çalıştırmalar | `/` | demo oturumu | herhangi | [T18](tasks/T18-calistirmalar-tum-calistirmalar-filtre.md) [T19](tasks/T19-calistirmalar-html-rapor-indir.md) [T20](tasks/T20-calistirmalar-klasik-ayrinti-kanit.md) [T21](tasks/T21-calistirmalar-kalici-ai-calistirmalari.md) |
| AI Test Assistant | `/` | demo oturumu | admin | [T22](tasks/T22-ai-test-assistant-chat-to-suite-run.md) [T23](tasks/T23-ai-test-assistant-composer-validation-target-auth.md) [T24](tasks/T24-ai-test-assistant-model-comparison.md) [T25](tasks/T25-ai-test-assistant-quality-promote-element-errors.md) |
| Ayarlar | `/` | demo oturumu | herhangi | [T26](tasks/T26-ayarlar-yetkili-hedef-siteler.md) [T27](tasks/T27-ayarlar-test-verileri.md) [T28](tasks/T28-ayarlar-self-healing.md) [T29](tasks/T29-ayarlar-ai-provider.md) |

Toplam: 8 bölüm, 29 görev. Element envanterleri: `routes/<slug>.md`.
