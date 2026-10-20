# AI Test Assistant ekran kanıtları

20 Ekim 2026'da üretim Next.js build'i, gerçek Fastify API, ayrı Playwright
worker, Chromium demo fixture ve yerel OpenAI-compatible HTTP test provider'ı
ile çekildi. Provider gerçek HTTP `/models` ve `/chat/completions` endpoint'lerini
sunuyor; ekranlar sahte chat mesajı ile çizilmedi. Gerçek dış provider hesabı veya
harici site erişimi bu koşuda kullanılmadı.

- `settings.png`: maskeli provider formu ve kaydedilen aktif model.
- `suite.png`: DOM incelemesi, onaylanan suite, PASS sonucu ve chat geçmişi.
- `tests-list.png`: AI suite'in Testler ekranında görünmesi.
- `mobile.png`: 390px responsive chat ve suite kontrolü.

Doğrulama: 22/22 domain/API/worker entegrasyon, 13/13 browser E2E, typecheck,
format ve üretim build geçti. Gerçek suite sonucu bir negatif giriş senaryosunda
Chromium ile PASS; kasıtlı yanlış assertion ayrı entegrasyon testinde FAIL verdi.
Ekran görüntüleri `test-results/assistant/` kaynaklarından kopyalandı.

| Dosya          | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| mobile.png     | `a54b8312ec7373ecb253e6a1e23b2a0e9adacb3db82a025a5fdf58bb7f622718` |
| settings.png   | `9a7a2302e1616e131809fcb92ec4fe6d30033e7e3cf1843db48b3b5d314c9609` |
| suite.png      | `fed5483bd9c5a99be1a6c003ef8804d0cc06dc7ffc7320f39190ff56f4519cae` |
| tests-list.png | `d45c908b20fad48ed2758964042cad39059c9ac7983fb6cccc2a448e020e64ee` |
