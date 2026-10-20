# AI Test Assistant ekran kanıtları

20 Ekim 2026'da üretim Next.js build'i, gerçek Fastify API, ayrı Playwright
worker, Chromium demo fixture ve yerel OpenAI-compatible HTTP test provider'ı
ile çekildi. Provider gerçek HTTP `/models` ve `/chat/completions` endpoint'lerini
sunuyor; ekranlar sahte chat mesajı ile çizilmedi. Gerçek dış provider hesabı veya
harici site erişimi bu koşuda kullanılmadı.

- `settings.png`: ayrı Ayarlar sayfasında maskeli provider formu ve aktif model.
- `chat-empty.png`: provider/model yüklendikten sonraki temiz chat ekranı.
- `chat.png`: prompt, suite taslağı ve PASS sonucunu içeren tam chat akışı.
- `suite.png`: DOM incelemesi, onaylanan suite, PASS sonucu ve chat geçmişi.
- `tests-list.png`: AI suite'in Testler ekranında görünmesi.
- `mobile.png`: 390px responsive chat ve suite kontrolü.

Doğrulama: 22/22 domain/API/worker entegrasyon, 13/13 browser E2E, typecheck,
format ve üretim build geçti. Gerçek suite sonucu bir negatif giriş senaryosunda
Chromium ile PASS; kasıtlı yanlış assertion ayrı entegrasyon testinde FAIL verdi.
Ekran görüntüleri `test-results/assistant/` kaynaklarından kopyalandı.

| Dosya          | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| chat-empty.png | `76519254cef6d215ee0047c72cdd4caa197de7accbd7597cc01d4740e2eaa74e` |
| chat.png       | `4e9592bba8034c604bd8891711841024e8d9723c8998b7099822e3807253aa1a` |
| mobile.png     | `b273f6960b3e6f217e2be3eb1d81022572ee4181e40cbf4f0275a7517b574f6e` |
| settings.png   | `b7be601f911b5159c99c9fefa75dc57e9da6f7b1bc57e0b9053a48a652314958` |
| suite.png      | `20fb01865985eb907f11d1e04f9477ce6e728c23a9831ee6da5c18f83a8056ac` |
| tests-list.png | `15d569a392a8edb00f4b0f0263d422648228fa187b48fcea0e8f7cb57a9a685e` |
