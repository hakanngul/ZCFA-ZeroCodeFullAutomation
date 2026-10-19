# Element kütüphanesi — gerçek tarayıcı görüntüleri

Ekranlar, ayrı API/worker/fixture ve derlenmiş Next.js UI ile çalışan son başarılı
E2E koşusunda alındı. Tasarım maketi değildir.

- `07-elements-registry.png`: element listesi, locator alternatifleri, kullanım bilgisi.
- `08-elements-verified.png`: CSS locator için gerçek tekil eşleşme ve yeniden onay.
- `09-elements-create.png`: HTML ID ile manuel element oluşturma ve deneme.
- `10-elements-history.png`: önceki sürümün salt okunur incelenmesi.
- `11-elements-mobile.png`: 390px genişlikte liste ve ayrıntı paneli.
- `services.log`: aynı koşunun servis günlükleri; beklenen hatalı selector denemesi
  bir worker error olayı üretir ve bu durum başarısız test olarak gizlenmez.
- `manifest.json`: SHA-256, dosya boyutları ve doğrulama özeti.

Doğrulama: 21 domain/API testi ve 12 E2E kontrolü geçti. ID/CSS/XPath dahil 10
locator türü gerçek Chromium'da denendi. Eski sürümdeki test ve yeni CSS modeliyle
test PASS verdi; geçerli alternatifi olsa bile eksik birincil locator BLOCKED kaldı.
Yeni bir koşu için README'deki build ve E2E komutları kullanılabilir.
