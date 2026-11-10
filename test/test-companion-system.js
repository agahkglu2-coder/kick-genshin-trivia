const assert = require('assert');
const { GachaEngine } = require('../src/gachaEngine');
const { WorldEngine } = require('../src/worldEngine');

console.log('=== TEST: 5-Star Character Companion & Skill System ===');

const gachaEngine = new GachaEngine();
const worldEngine = new WorldEngine({ gachaEngine });

// 1. Test Demo / Starter Companion Pool for new user
console.log('\n--- 1. Yeni Kullanıcı / Misafir İçin Başlangıç Yoldaş Havuzu ---');
const starterList = worldEngine.getUser5Stars('YeniGezgin99');
assert(Array.isArray(starterList), 'Starter list bir dizi olmalı');
assert(starterList.length >= 3, 'En az 3 başlangıç 5 yıldızlı yoldaş olmalı');
const raiden = starterList.find(c => c.name.toLowerCase().includes('raiden'));
assert(raiden, 'Raiden Shogun yoldaş listesinde bulunmalı');
assert.strictEqual(raiden.element, 'Electro', 'Raiden elementi Electro olmalı');
console.log(`✅ Bulunan Başlangıç Yoldaşları: ${starterList.map(c => c.name + ' (' + c.element + ')').join(', ')}`);

// 2. Test Player Selection & State
console.log('\n--- 2. Yoldaş Seçimi ve Oyuncu Durumu ---');
const socketId = 'sock_test_comp_1';
const player = worldEngine.addPlayer(socketId, {
  username: 'AshKetchum',
  isGuest: false
});

// Select Raiden Shogun
const selRes = worldEngine.selectCompanion(socketId, raiden.name);
assert(selRes.success, 'Yoldaş seçimi başarılı olmalı');
assert.strictEqual(player.companion, raiden.name, 'Oyuncunun aktif yoldaşı Raiden Shogun olmalı');
assert.strictEqual(selRes.companionData.element, 'Electro');
console.log(`✅ @${player.username} başarıyla yoldaş seçti: ${player.companion} (${selRes.companionData.element})`);

// Select Zhongli
const selZhongli = worldEngine.selectCompanion(socketId, 'Zhongli');
assert(selZhongli.success, 'Zhongli seçimi başarılı olmalı');
assert.strictEqual(player.companion, 'Zhongli');
console.log(`✅ Yoldaş Değiştirildi -> ${player.companion}`);

// Clear Companion (none)
const clearRes = worldEngine.selectCompanion(socketId, 'none');
assert(clearRes.success, 'Yoldaş kaldırma başarılı olmalı');
assert.strictEqual(player.companion, null, 'Oyuncunun yoldaşı temizlenmeli');
console.log('✅ Yoldaş başarıyla kaldırıldı (Pet kapalı)');

console.log('\n🎉 TÜM YOLDAŞ SİSTEMİ BACKEND TESTLERİ BAŞARIYLA GEÇTİ!');
