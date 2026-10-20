# İlk prototipin ekranları ve çalıştırma verileri

Güncel **AI Test Assistant** ekranları ve doğrulama kaydı
[assistant/](assistant/README.md) klasöründedir.

Güncel **Elementler** sayfasının masaüstü/mobil ekranları ve doğrulama kaydı
[elements/](elements/README.md) klasöründedir. Aşağıdaki veritabanları ilk prototipin
arşividir; yeni ekranın çalışması bunları değiştirmez.

Kullanıcının isteğiyle kaynak koda ek olarak üretilen proje çıktıları da depoya
alındı. Bu klasörün dışında kalan `.local/` ve `test-results/` çalışma dizinleri
ignore edilmeye devam eder; yeni test koşuları bu arşivi kendiliğinden değiştirmez.

- `e2e/`: başarılı son uçtan uca koşunun altı ekran görüntüsü, servis günlüğü ve
  geçici çalışma dizini kaydı. O dizinin içeriği ayrıca aşağıda korunur.
- `manual/`: geliştirme sırasında alınan ekranlar. `welcome.png` ilk yükleme
  durumunu gösterir; tamamlanmış giriş ekranının görüntüsü değildir.
- `demo-data/manual/`: yerel demo veritabanı ve ilgili gerçek tarayıcı kanıtı.
- `demo-data/e2e/`: uçtan uca koşunun veritabanı, yedi run ve altı tarayıcı kanıtı.
- `manifest.json`: dosya boyutları, SHA-256 ve veritabanı tablo sayıları.

Veritabanları SQLite backup API ile tutarlı kopyalandı. Kaynak veriler
değiştirilmedi. Oturum tablosu kopyalarda boşaltılıp VACUUM çalıştırıldı; oturum
anahtarları Git'e dahil edilmedi. Veriler tamamen sentetik Demo Bank verileridir.
Kanıt dosyalarının checksum'ları veritabanındaki kayıtlarla karşılaştırıldı ve
her iki veritabanı `integrity_check` kontrolünden geçti.

Demo verilerini kalıcı olarak denemek için mevcut geliştirme servislerini
durdurduktan sonra arşivi yalnız **ilk seferde** ignore edilen veri dizinine
kopyala. Sonraki açılışlarda aynı dizini kullan; burada kaydettiğin provider,
konuşma ve site listesi bu SQLite dosyasında kalır:

```sh
mkdir -p .local/demo-data
if [ ! -f .local/demo-data/zerocode.sqlite ]; then
  cp -R docs/evidence/demo-data/e2e/. .local/demo-data/
fi
ZC_DATA_DIR="$PWD/.local/demo-data" pnpm dev
```

Arayüzden yeni yerel oturum aç; önceki test ve çalıştırmalar görünür. Depodaki
arşiv veritabanını doğrudan canlı veritabanı olarak kullanma. Daha önce `mktemp`
ile başlattıysan kayıtlar o `/tmp/zerocode-demo.*` dizinindedir; hem
`zerocode.sqlite` hem `assistant.key` dosyasını aynı dizinde tutarak yeniden aç.

Bağımlılıklar (`node_modules`) ve derleme önbelleği (`.next`) taşınabilir ürün
verisi değildir. Tam sürümleri `pnpm-lock.yaml` ile sabitlenir;
`pnpm install --frozen-lockfile` ve `pnpm build` ile yeniden oluşturulur.
