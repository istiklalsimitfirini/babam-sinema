# Vidmody IPTV Proxy & Smart TV Movie Portal

Bu proje, Vidmody üzerindeki kamufle edilmiş `.gif` ve `.jpg` video yayınlarını otomatik olarak standart `.m3u8` ve `.ts` formatlarına dönüştürerek **SS IPTV** gibi Smart TV oynatıcılarında sorunsuz çalışmasını sağlar. Ayrıca televizyon kumandası ile kolayca kontrol edilebilen, **Netflix tarzı premium bir web portalı** içerir.

---

## 🚀 Bulut Üzerinde 7/24 Ücretsiz Çalıştırma (Önerilen)

Evde herhangi bir bilgisayar açık bırakmak istemiyorsanız, bu projeyi **ücretsiz** olarak bulut platformlarında 7/24 çalıştırabilirsiniz.

### 🌟 Seçenek 1: Koyeb (Hızlı ve Kolay)
1. [Koyeb.com](https://www.koyeb.com) adresi üzerinden ücretsiz üye olun.
2. Yeni bir servis oluşturun (**Create Service**).
3. Kaynak olarak **GitHub** seçeneğini kullanın (kendi GitHub hesabınıza bu klasörü yükleyip seçebilirsiniz) veya Koyeb'in doğrudan Docker/Git entegrasyonuyla deploy edin.
4. Port olarak **3000** belirtin.
5. Koyeb size `https://[app-adi].koyeb.app` şeklinde 7/24 çalışan ücretsiz bir link verecektir.

### 🌟 Seçenek 2: Render (Ücretsiz ve Popüler)
1. [Render.com](https://render.com) adresine ücretsiz üye olun.
2. **New +** butonuna tıklayarak **Web Service** seçin.
3. GitHub deponuzu bağlayın.
4. Ayarları şu şekilde yapın:
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
5. Render size `https://[app-adi].onrender.com` şeklinde 7/24 çalışan ücretsiz bir adres sunacaktır.

---

## 🏠 Evdeki Bilgisayarda Lokal Çalıştırma

Sunucuyu evinizdeki bir bilgisayarda (Mac veya Windows) çalıştırmak isterseniz:

1. Terminal / Komut Satırını açın ve proje klasörüne gidin.
2. Bağımlılıkları yükleyin (Zaten yüklendi):
   ```bash
   npm install
   ```
3. Sunucuyu başlatın:
   ```bash
   npm start
   ```
4. Sunucu başladıktan sonra terminalde yerel IP adresiniz listelenecektir (Örn: `http://192.168.1.50:3000`).

---

## 📺 Televizyonda Kullanım Rehberi

### 🛠️ Yöntem 1: SS IPTV ile İzleme (Babanız için en kolayı)
1. SS IPTV web sitesinde (**ss-iptv.com/users/add-device**) televizyonunuzu eşleştirin.
2. **External Playlists** (Harici Oynatma Listeleri) sekmesine gidin.
3. **Add Item** diyerek listenize bir isim verin (Örn: `Babamın Sineması`).
4. **Source** kısmına proxy adresinizi girin:
   * **Bulutta çalışıyorsa:** `https://[app-adi].koyeb.app/playlist.m3u` (veya `.onrender.com/playlist.m3u`)
   * **Lokal çalışıyorsa:** `http://[bilgisayar-yerel-ip]:3000/playlist.m3u`
5. Kaydedin. Artık televizyonunuzdaki SS IPTV uygulamasında tüm filmler **oynatılamıyor hatası almadan** sorunsuz bir şekilde açılacaktır!

### 🍿 Yöntem 2: Netflix Tarzı Premium Web Portalı (Görsel Şölen)
1. Smart TV'nizin kendi **İnternet Tarayıcısını** (Web Browser) açın.
2. Adres satırına proxy adresinizi yazın:
   * **Bulutta çalışıyorsa:** `https://[app-adi].koyeb.app`
   * **Lokal çalışıyorsa:** `http://[bilgisayar-yerel-ip]:3000`
3. Tarayıcıyı **Sık Kullanılanlara (Bookmark)** ekleyin.
4. Babanız kumandanın yön tuşlarını kullanarak:
   * Kategoriler arasında gezinebilir,
   * Arama yapabilir,
   * İstediği filmi seçip tam ekran sinema kalitesinde oynatabilir.

---

## 🔄 Listeyi Güncelleme (Yenileme)
Ana M3U listesi Github CDN üzerinden beslenmektedir. Listenin en güncel halini çekmek isterseniz:
* Portal üzerindeki **"Yenile"** butonuna tıklayabilirsiniz.
* Veya tarayıcınızdan doğrudan `http://[sunucu-adresi]/playlist.m3u?refresh=true` adresini ziyaret edebilirsiniz. Sunucu listeyi otomatik olarak güncelleyip önbelleğe alacaktır.
