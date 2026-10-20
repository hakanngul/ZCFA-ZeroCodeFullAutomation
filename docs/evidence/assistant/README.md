# AI Test Assistant ekran kanıtları

20 Ekim 2026'da üretim Next.js build'i, gerçek Fastify API, ayrı Playwright
worker, Chromium demo fixture ve yerel OpenAI-compatible HTTP test provider'ı
ile çekildi. Provider gerçek HTTP `/models` ve `/chat/completions` endpoint'lerini
sunuyor; ekranlar sahte chat mesajı ile çizilmedi. Gerçek dış provider hesabı veya
harici site erişimi bu koşuda kullanılmadı.

- `settings.png`: Ayarlar'da SauceDemo yetkili origin kaydı, maskeli provider
  formu ve aktif model. Site listesi gerçek API ve SQLite üzerinden yüklendi;
  harici site bu koşuda taranmadı.
- `chat-empty.png`: provider/model yüklendikten sonraki temiz chat ekranı.
- `chat.png`: prompt, suite taslağı ve PASS sonucunu içeren tam chat akışı.
- `ai-elements.png`: AI taramasından sonra Elementler ekranındaki kalıcı DOM
  kayıtları; bunlar Demo Bank modelinden ayrı tutulur.
- `authorize.png`: engellenen HTTPS hedef için chat içinden açık site ekleme
  ve tekrar gönderme eylemi; E2E düğmeye basıp origin kaydını da doğruladı.
- `suite.png`: DOM incelemesi, onaylanan suite, PASS sonucu ve chat geçmişi.
- `tests-list.png`: AI suite'in Testler ekranında görünmesi.
- `mobile.png`: 390px responsive chat ve suite kontrolü.

Doğrulama: 22/22 domain/API/worker entegrasyon, 13/13 browser E2E, typecheck,
format ve üretim build geçti. Gerçek suite sonucu bir negatif giriş senaryosunda
Chromium ile PASS; kasıtlı yanlış assertion ayrı entegrasyon testinde FAIL verdi.
Ekran görüntüleri `test-results/assistant/` kaynaklarından kopyalandı.

| Dosya           | SHA-256                                                            |
| --------------- | ------------------------------------------------------------------ |
| ai-elements.png | `2cc5ace98c9ffc3d4a77697b8d7531eab78e932d344a9e41dfc164865dce75b4` |
| authorize.png   | `b031233d03d94a8e4f56b1c3ca5e77ea964f6390e817ac009fca242e56af582f` |
| chat-empty.png  | `9693d56b71f3107038454aed28affffe382118b0826cfa38c5f3d12dc19b7c42` |
| chat.png        | `4e9592bba8034c604bd8891711841024e8d9723c8998b7099822e3807253aa1a` |
| mobile.png      | `e1469b8066b46507945e83441b96b444006f5e068fa2f18e5faf1a4930a01f9e` |
| settings.png    | `3f51c3d671ad711e834342ca7ffe6f5b77af6be9efc4b6ad73c8e64602932e02` |
| suite.png       | `20fb01865985eb907f11d1e04f9477ce6e728c23a9831ee6da5c18f83a8056ac` |
| tests-list.png  | `9ccea30953281d5e6639bb0de795deccc4ea8b4d8f2cfdc09e6b4b75b33d0835` |
