const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { GachaEngine } = require('../src/gachaEngine');

console.log('--- TEST 1: Gacha Veritabanı ve Başlangıç Kontrolü ---');
const engine = new GachaEngine({
  chatCooldownSeconds: 60,
  costPerWish: 160,
  pity5Threshold: 40,
  pity4Threshold: 8
});

assert(engine.characters.length >= 80, `Karakter sayısı en az 80 olmalı, bulunan: ${engine.characters.length}`);
assert(engine.weapons.length >= 30, `Silah sayısı en az 30 olmalı, bulunan: ${engine.weapons.length}`);
console.log(`✅ ${engine.characters.length} Karakter ve ${engine.weapons.length} Silah başarıyla doğrulandı!`);

console.log('--- TEST 2: Yeni Gezgin Hoş Geldin Bonusu (160 Primogem = 1 Ücretsiz Dilek) ---');
delete engine.users['testgezgin'];
const testUser = engine.getOrCreateUser('TestGezgin');
assert.strictEqual(testUser.primogems, 160, 'Yeni kullanıcıya 160 Primogem verilmeli');
assert.strictEqual(testUser.pity5, 0);
assert.strictEqual(testUser.pity4, 0);
assert.strictEqual(testUser.totalWishes, 0);
console.log('✅ Yeni kullanıcı hoş geldin bonusu başarılı!');

console.log('--- TEST 3: Chate Yazma Ödülü (10 Primo) ve 60s Cooldown ---');
const initialPrimo = testUser.primogems;
engine.handleChatActivity('TestGezgin');
assert.strictEqual(testUser.primogems, initialPrimo + 10, 'Chat aktivitesi +10 Primogem vermeli');

// Immediate second message should be throttled by 60s cooldown
engine.handleChatActivity('TestGezgin');
assert.strictEqual(testUser.primogems, initialPrimo + 10, 'Cooldown süresince tekrar ödül verilmemeli');
console.log('✅ Chat aktivite ödülü ve spam koruması başarılı!');

console.log('--- TEST 4: Trivia Galibiyet Bonusu (+60 Primo) ---');
engine.awardTriviaWinner('TestGezgin', 60);
assert.strictEqual(testUser.primogems, initialPrimo + 10 + 60, 'Trivia galibiyeti +60 Primogem eklemeli');
console.log('✅ Trivia kazanan ödülü başarılı!');

console.log('--- TEST 5: Tekli Dilek Çekme (!wish) ve Envanter Kaydı ---');
const beforePullPrimo = testUser.primogems;
const pullResult = engine.pull('TestGezgin', 1);
assert.strictEqual(pullResult.success, true);
assert.strictEqual(testUser.primogems, beforePullPrimo - 160 + (pullResult.pulls[0].refundAmount || 0));
assert.strictEqual(testUser.totalWishes, 1);
assert.strictEqual(testUser.inventory.length, 1);
assert(pullResult.pulls[0].name, 'Çekilen eşyanın adı olmalı');
assert(pullResult.pulls[0].rarity >= 3, 'Çekilen eşya en az 3★ olmalı');
console.log(`✅ Dilek çekildi: [${pullResult.pulls[0].rarity}★] ${pullResult.pulls[0].name} (${pullResult.pulls[0].type})`);

console.log('--- TEST 6: Yetersiz Bakiye Kontrolü ---');
testUser.primogems = 50; // Not enough for 160
const failPull = engine.pull('TestGezgin', 1);
assert.strictEqual(failPull.success, false);
assert.strictEqual(failPull.reason, 'insufficient_primogems');
console.log('✅ Yetersiz Primogem engellemesi başarılı!');

console.log('--- TEST 7: 75-Pity 5★ Garantisi Testi ---');
testUser.primogems = 100000;
testUser.pity5 = 74; // Next pull reaches 75 hard pity
const pityPull = engine.pull('TestGezgin', 1);
assert.strictEqual(pityPull.success, true);
assert.strictEqual(pityPull.pulls[0].rarity, 5, '75. çekişte 5★ garanti olmalı');
assert.strictEqual(testUser.pity5, 0, '5★ çıkınca 5★ pity sayacı 0 olmalı');
assert.strictEqual(testUser.fiveStarsCount, 1);
console.log(`✅ 5★ Pity garantisi başarıyla patladı! Çıkan: ${pityPull.pulls[0].name} (Pity sıfırlandı)`);

console.log('--- TEST 8: 10-Pity 4★ Garantisi Testi ---');
testUser.pity4 = 9; // Next pull reaches 10 hard pity
const pity4Pull = engine.pull('TestGezgin', 1);
assert.strictEqual(pity4Pull.success, true);
assert(pity4Pull.pulls[0].rarity >= 4, '10. çekişte en az 4★ garanti olmalı');
console.log(`✅ 4★ Pity garantisi başarılı! Çıkan: ${pity4Pull.pulls[0].name}`);

console.log('--- TEST 9: Chat Komutları Ayrıştırma (!bakiye, !envanter, !donustur) ---');
let chatResp = null;
engine.on('chat_response', (resp) => {
  chatResp = resp;
});

engine.handleChatMessage({ content: '!bakiye', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('Primogem'));

engine.handleChatMessage({ content: '!envanter', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('5★'));

testUser.threeStarsCount = 7;
const beforeForgePrimo = testUser.primogems;
engine.handleChatMessage({ content: '!donustur', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('DEMİRCİ DÖNÜŞÜMÜ'));
assert.strictEqual(testUser.primogems, beforeForgePrimo + 160);
assert.strictEqual(testUser.threeStarsCount, 2);
console.log('✅ Chat komutları (!bakiye, !envanter, !donustur) başarıyla çalıştı!');

console.log('--- TEST 10: Primogem Yağmuru ve Admin İşlemleri ---');
const rainRes = engine.triggerRain(160);
assert(rainRes.userCount >= 1);
const adminAdded = engine.addPrimogems('TestGezgin', 500);
assert(adminAdded.primogems >= 500);
console.log('✅ Primogem Yağmuru ve Admin bakiye yükleme testleri başarılı!');

console.log('========================================================');
console.log('🎉 TÜM GACHA & PRIMOGEM EKONOMİ TESTLERİ BAŞARIYLA GEÇTİ!');
console.log('========================================================');
process.exit(0);
