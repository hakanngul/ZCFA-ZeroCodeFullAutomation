# İlk prototipin ekranları ve çalıştırma verileri

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

Demo verilerini denemek için mevcut geliştirme servislerini durdurduktan sonra
değiştirilmemiş arşivi yeni bir çalışma dizinine kopyala:

```sh
demo_copy=$(mktemp -d /tmp/zerocode-demo.XXXXXX)
cp -R docs/evidence/demo-data/e2e/. "$demo_copy/"
ZC_DATA_DIR="$demo_copy" pnpm dev
```

Arayüzden yeni yerel oturum aç; önceki test ve çalıştırmalar görünür. Depodaki
arşiv veritabanını doğrudan canlı veritabanı olarak kullanma.

Bağımlılıklar (`node_modules`) ve derleme önbelleği (`.next`) taşınabilir ürün
verisi değildir. Tam sürümleri `pnpm-lock.yaml` ile sabitlenir;
`pnpm install --frozen-lockfile` ve `pnpm build` ile yeniden oluşturulur.
