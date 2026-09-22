# 🌟 Kick Milka Trivia & Genshin Gacha Economy System (Paimon Edition)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/agahkglu2-coder/kick-genshin-trivia)

Kick canlı yayınlarınızda izleyicilerinizle etkileşimi zirveye çıkarmak için hazırlanmış; **Paimon maskotlu soru-cevap**, **canlı Primogem ekonomisi** ve **tam özellikli Genshin Impact Gacha (Dilek) sistemi**.

---

## 🚀 Yeni Özellikler: Genshin Gacha & Primogem Ekonomisi

### 💎 Primogem Kazanma Yolları
- **Hoş Geldin Hediyesi:** Chate ilk kez yazan her yeni izleyiciye **160 Primogem (1 Ücretsiz Dilek)** hediye edilir.
- **Chat Aktivitesi:** Chate her mesaj yazıldığında **+10 Primogem** kazanılır (60 saniye spam korumalı).
- **Yayın İzleme:** Yayını aktif izleyen tüm izleyicilere her 5 dakikada bir otomatik **+20 Primogem** dağıtılır.
- **Trivia Soruları:** Ekrana gelen Milka Trivia sorularını doğru bilen Gezgine **+60 Primogem** ödülü verilir.
- **Primogem Yağmuru:** Yayıncı admin panelinden **"🌧️ Primogem Yağmuru"** butonuna bastığında chate altın primogemler yağar ve herkese **+160 Primogem** dağıtılır.

### ✨ Dilek (Gacha) ve Şans Mekaniği
- **88 Karakter & 32 Silah Havuzu:** Genshin Impact evrenindeki tüm 5★ Archonlar, efsanevi karakterler ve 4★ kahramanlar.
- **Gerçek Pity (Garanti) Sistemi:**
  - **5★ Hard Pity:** 40 çekişte kesin 5★ karakter/silah garantisi. 5★ çıktığında sayaç sıfırlanır.
  - **4★ Hard Pity:** 8 çekişte kesin 4★ karakter/silah garantisi.
  - **3★ Şanslı İade:** 3★ silah çıktığında %15 şansla 40-80 Primogem teselli iadesi.
- **Kayan Yıldız (Meteor) Animasyonu & Web Audio Efektleri:**
  - 5★ Altın kayan yıldız ve kraliyet zafer fanfarı.
  - 4★ Mor kayan yıldız ve sihirli tını.
  - 3★ Mavi kayan yıldız ve kristal çan.
- **Paimon Tepkileri:** Çıkan karaktere göre Paimon maskotu sevinç veya teselli replikleriyle ekranda belirir.

---

## 💬 İzleyici Chat Komutları

| Komut | Açıklama |
|---|---|
| `!wish` / `!dilek` | 160 Primogem harcayarak 1 dilek çeker ve OBS ekranında animasyonla gösterir. |
| `!wish10` / `!dilek10` | 1600 Primogem harcayarak 10'lu dilek çeker. |
| `!bakiye` / `!primo` | Güncel Primogem bakiyenizi, 5★ Pity durumunuzu ve toplam çekişinizi chate yazar. |
| `!envanter` / `!karakterler` | Çıkardığınız tüm 5★ karakterlerin listesini chate yazar. |
| `!sıralama` | Günün en bilge Gezginleri liderlik tablosunu OBS ekranına yansıtır (60s bekleme süreli). |

---

## ⚡ Hızlı Başlangıç

1. **Sistemi Başlatma:**
   - [**`KickGenshinTrivia.exe`**](file:///c:/Users/pc/Documents/antigravity/nifty-rutherford/KickGenshinTrivia.exe) uygulamasına çift tıklayın.
   - Program dahili taşınabilir Node.js (`bin/node.exe`) ile çalışır, herhangi bir kuruluma ihtiyaç duymaz.

2. **Kick Kanalınızı Bağlama:**
   - Açılan **Yayıncı Kontrol Paneli** (`http://localhost:3000/admin.html`) üzerinde Kick kullanıcı adınızı veya kanal linkinizi girip **"Bağlan"** butonuna basın.

3. **OBS Studio Entegrasyonu:**
   - OBS Studio'da **Kaynaklar (+)** > **Tarayıcı (Browser)** kaynağı ekleyin.
   - URL: `http://localhost:3000/obs.html`
   - Genişlik: `860`, Yükseklik: `600` (veya `1920x1080`).

