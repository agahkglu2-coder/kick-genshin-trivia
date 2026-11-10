const assert = require('assert');
const { GachaEngine } = require('../src/gachaEngine');
const { WorldEngine } = require('../src/worldEngine');

console.log('=== TEST: Strict 5-Star Only Character Companion System (No Trial/Demo) ===');

const gachaEngine = new GachaEngine();
const worldEngine = new WorldEngine({ gachaEngine });

// 1. Yeni Kullanıcı / Misafir / 5 Yıldızı Olmayan Kick Hesabı
console.log('\n--- 1. 5★ Karakteri Olmayan Kullanıcı İçin Liste Boş Olmalı (Deneme Petleri Yasak) ---');
const emptyList = worldEngine.getUser5Stars('YeniGezgin99');
assert(Array.isArray(emptyList), 'Dizi dönmeli');
assert.strictEqual(emptyList.length, 0, '5 yıldızı olmayan kullanıcının yoldaş listesi kesinlikle 0 olmalı (demo pet yok)');
console.log('✅ 5★ karakteri olmayan oyuncuya sıfır yoldaş verildi (Deneme modu tamamen kaldırıldı)');

// 2. Sahip Olunmayan 5★ Karakteri Kuşanma Engeli
console.log('\n--- 2. Sahip Olunmayan Karakteri Kuşanma Denemesi Engellenmeli ---');
const guestSock = 'sock_guest_test';
const guestPlayer = worldEngine.addPlayer(guestSock, { username: 'Misafir_123', isGuest: true });
const failRes = worldEngine.selectCompanion(guestSock, 'Raiden Shogun');
assert.strictEqual(failRes.success, false, 'Sahip olunmayan karakter seçilememeli');
assert.strictEqual(guestPlayer.companion, null, 'Aktif yoldaş atanmamalı');
console.log(`✅ İzinsiz kuşanma engellendi: "${failRes.message}"`);

// 3. Gerçek 5★ Karaktere Sahip Kullanıcı (@mistywater - Raiden Shogun)
console.log('\n--- 3. Gerçek 5★ Karaktere Sahip Kullanıcı (@mistywater) Testi ---');
const mistyList = worldEngine.getUser5Stars('mistywater');
assert(Array.isArray(mistyList) && mistyList.length > 0, 'mistywater 5★ karaktere sahip olmalı');
const mistyRaiden = mistyList.find(c => c.name.toLowerCase() === 'raiden shogun');
assert(mistyRaiden, 'Raiden Shogun bulunmalı');
assert.strictEqual(mistyRaiden.rarity, 5, 'Rarity 5 olmalı');
assert.strictEqual(mistyRaiden.isOwned, true, 'isOwned true olmalı');
console.log(`✅ @mistywater 5★ Yoldaşı: ${mistyRaiden.name} (${mistyRaiden.element}, ${mistyRaiden.rarity}★)`);

// 4. Yetkili 5★ Karakter Kuşanma ve Kaldırma Testi
console.log('\n--- 4. Sahip Olunan 5★ Karakteri Kuşanma ve Kaldırma ---');
const mistySock = 'sock_misty_1';
const mistyPlayer = worldEngine.addPlayer(mistySock, { username: 'mistywater', isGuest: false });
const equipRes = worldEngine.selectCompanion(mistySock, 'Raiden Shogun');
assert(equipRes.success, 'Sahip olduğu için kuşanabilmeli');
assert.strictEqual(mistyPlayer.companion, 'Raiden Shogun');
console.log(`✅ @${mistyPlayer.username} başarıyla 5★ ${mistyPlayer.companion} yoldaşını kuşandı!`);

// Kaldırma
const unequipRes = worldEngine.selectCompanion(mistySock, 'none');
assert(unequipRes.success, 'Kaldırma başarılı olmalı');
assert.strictEqual(mistyPlayer.companion, null);
console.log('✅ Yoldaş başarıyla kaldırıldı (Pet kapandı)');

console.log('\n🎉 TÜM KATİ 5★ YOLDAŞ SİSTEMİ TESTLERİ BAŞARIYLA GEÇTİ!');
process.exit(0);
