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

console.log('--- TEST 11: Banner Presets ve Banner Değiştirme ---');
assert(engine.banners.length >= 10, 'En az 10 banner preseti olmalı');
const bannerRes = engine.setActiveBanner('furina');
assert.strictEqual(bannerRes.success, true);
assert.strictEqual(engine.getActiveBanner().featured5, 'Furina');
engine.setActiveBanner('raiden_shogun');
assert.strictEqual(engine.getActiveBanner().featured5, 'Raiden Shogun');
console.log('✅ Banner değiştirme ve önceden tanımlı bannerlar başarılı!');

console.log('--- TEST 12: Garantili 5★ Çekiliş Kuralı (isGuaranteed = true -> %100 Banner Karakteri) ---');
testUser.primogems = 10000;
testUser.pity5 = 39; // Reach hard pity (threshold = 40 in test config)
testUser.isGuaranteed = true;
const guaranteedPull = engine.pull('TestGezgin', 1, 'event');
assert.strictEqual(guaranteedPull.success, true);
assert.strictEqual(guaranteedPull.pulls[0].rarity, 5);
assert.strictEqual(guaranteedPull.pulls[0].name, 'Raiden Shogun', 'Garantili çekişte aktif banner 5★ karakteri çıkmalı');
assert.strictEqual(guaranteedPull.pulls[0].isGuaranteedPull, true);
assert.strictEqual(guaranteedPull.pulls[0].won5050, true);
assert.strictEqual(testUser.isGuaranteed, false, 'Garantili karakter çıkınca isGuaranteed false olmalı');
assert.strictEqual(testUser.pity5, 0, 'Pity sıfırlanmalı');
console.log('✅ Garantili 5★ kuralı başarıyla doğrulandı!');

console.log('--- TEST 13: Banner Değişiminde Pity ve Garanti Devri (Carry-over) ---');
testUser.pity5 = 25;
testUser.isGuaranteed = true;
// Banner Raiden Shogun'dan Furina'ya geçiyor:
engine.setActiveBanner('furina');
assert.strictEqual(testUser.pity5, 25, 'Banner değişince pity SIFIRLANMAZ, devreder');
assert.strictEqual(testUser.isGuaranteed, true, 'Banner değişince garanti hakkı kaybolmaz');

// Şimdi Furina banner'ında pity'ye ulaşılıyor:
testUser.pity5 = 39;
const furinaPull = engine.pull('TestGezgin', 1, 'event');
assert.strictEqual(furinaPull.pulls[0].name, 'Furina', 'Devreden garantiyle yeni banner karakteri çıkmalı');
assert.strictEqual(testUser.isGuaranteed, false);
console.log('✅ Banner değişiminde Pity ve Garanti devri (Carry-over) başarıyla doğrulandı!');

console.log('--- TEST 14: Standart Banner İzolasyonu (Ayrı Pity ve 50/50 Etkileşimsiz) ---');
testUser.pity5 = 15;
testUser.isGuaranteed = true;
testUser.standardPity5 = 0;

// Standart banner'dan çekiş yapılıyor
const stdPull = engine.pull('TestGezgin', 1, 'standard');
assert.strictEqual(stdPull.success, true);
assert.strictEqual(testUser.standardPity5, 1, 'Standart pity 1 artmalı');
assert.strictEqual(testUser.pity5, 15, 'Etkinlik bannerı pitysi DEĞİŞMEMELİ');
assert.strictEqual(testUser.isGuaranteed, true, 'Etkinlik garantisi standart çekişten ETKİLENMEMELİ');
console.log('✅ Standart Banner ayrı pity izolasyonu başarıyla doğrulandı!');

console.log('--- TEST 15: Yeni Chat Komutları (!banner, !wish standart, !pity) ---');
engine.handleChatMessage({ content: '!banner', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('Aktif Banner'));
assert(chatResp.message.includes('Furina'));

engine.handleChatMessage({ content: '!pity', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('Etkinlik Pity'));
assert(chatResp.message.includes('Standart Pity'));

testUser.primogems = 1000;
const beforeStdPity = testUser.standardPity5;
engine.handleChatMessage({ content: '!wish standart', sender: { username: 'TestGezgin' } });
assert.strictEqual(testUser.standardPity5, beforeStdPity + 1);
console.log('✅ Yeni chat komutları (!banner, !wish standart, !pity) başarıyla doğrulandı!');

console.log('--- TEST 16: Genişletilmiş 5★ Karakter ve Banner Çeşitliliği ---');
const fiveStars = engine.characters.filter(c => c.rarity === 5);
assert(fiveStars.length >= 50, `5★ karakter sayısı en az 50 olmalı, bulunan: ${fiveStars.length}`);
assert(engine.banners.length >= 40, `Banner sayısı en az 40 olmalı, bulunan: ${engine.banners.length}`);
console.log(`✅ ${fiveStars.length} adet 5★ Karakter ve ${engine.banners.length} adet Banner başarıyla doğrulandı!`);

console.log('--- TEST 17: Karakter Adıyla Doğrudan Dilek Çekme (!wish ayaka, !wish neuvi, !wish10 hutao) ---');
testUser.primogems = 10000;
testUser.isGuaranteed = true; // Kesin garanti ile test ediyoruz

// 1. Ayaka için doğrudan dilek
const ayakaRes = engine.handleChatMessage({ content: '!wish ayaka', sender: { username: 'TestGezgin' } });
assert(ayakaRes && ayakaRes.success, 'Ayaka için özel dilek başarılı olmalı');
assert.strictEqual(ayakaRes.banner.featured5, 'Kamisato Ayaka', 'Banner featured5 Ayaka olmalı');

// 2. Takma ad ile dilek (neuvi -> Neuvillette)
testUser.isGuaranteed = true;
testUser.pity5 = 74; // Garantili 5★ tetiklemesi
const neuviPull = engine.pull('TestGezgin', 1, 'event', engine.resolveBannerForQuery('neuvi'));
assert.strictEqual(neuviPull.success, true);
assert.strictEqual(neuviPull.pulls[0].name, 'Neuvillette', 'Takma ad ile Neuvillette çekilmeli');
console.log('✅ Takma ad ve doğrudan karakter dilek mekaniği başarıyla doğrulandı!');

// 3. !bannerlar komutu kontrolü
engine.handleChatMessage({ content: '!bannerlar', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('5★ DİLEK HAVUZU'));
console.log('✅ !bannerlar komutu ve rehberi başarıyla doğrulandı!');

console.log('--- TEST 18: Topluluk Primogem Havuzu (Kumbara) %1.5 Vergi Kesintisi ---');
// Reset pool for clean test
engine.adjustJackpotPool(0, 'set');
assert.strictEqual(engine.jackpotPool, 0, 'Havuz sıfırlanabilmeli');

// 1. awardEarnedPrimogems with 1000 Primogems -> %1.5 is 15.00
const earnedRes = engine.awardEarnedPrimogems('TestGezgin', 1000, 'test_earn');
assert.strictEqual(earnedRes.gross, 1000);
assert.strictEqual(earnedRes.tax, 15);
assert.strictEqual(engine.jackpotPool, 15);
assert.strictEqual(engine.jackpotTotalAccumulated >= 15, true);

// 2. Chat üzerinden !havuz komutu
engine.handleChatMessage({ content: '!havuz', sender: { username: 'TestGezgin' } });
assert(chatResp && chatResp.message.includes('Topluluk Primogem Havuzu'));
assert(chatResp.message.includes('15 Primogem'));
console.log('✅ Topluluk Havuzu %1.5 pay birikimi ve !havuz komutu başarıyla doğrulandı!');

console.log('--- TEST 19: Topluluk Havuzu Çekiliş (!havuzcekilis) ve Dağıtım (!havuzdagit) ---');
// Aktif chat kullanıcısı ekleyelim
const g1 = engine.getOrCreateUser('Gezgin1');
g1.lastActiveTime = Date.now();
const g2 = engine.getOrCreateUser('Gezgin2');
g2.lastActiveTime = Date.now();

// Havuzda şu an 15 Primogem var, 50 daha ekleyelim -> 65
engine.adjustJackpotPool(50, 'add');
assert.strictEqual(engine.jackpotPool, 65);

// 1. Çekiliş Testi (Raffle to Gezgin1)
const user1Before = engine.getOrCreateUser('Gezgin1').primogems;
const raffleRes = engine.raffleJackpot('Gezgin1');
assert.strictEqual(raffleRes.success, true);
assert.strictEqual(raffleRes.winner, 'Gezgin1');
assert.strictEqual(raffleRes.amount, 65);
assert.strictEqual(engine.getOrCreateUser('Gezgin1').primogems, user1Before + 65);
assert.strictEqual(engine.jackpotPool, 0);

// 2. Dağıtım Testi (Distribute)
engine.adjustJackpotPool(100, 'set');
const u1BeforeDist = engine.getOrCreateUser('Gezgin1').primogems;
const u2BeforeDist = engine.getOrCreateUser('Gezgin2').primogems;
const distRes = engine.distributeJackpot();
assert.strictEqual(distRes.success, true);
assert.strictEqual(distRes.recipients.length >= 2, true);
assert(distRes.perUser > 0);
console.log(`✅ Havuz Çekiliş (${raffleRes.amount} 💎) ve Eşit Dağıtım (${distRes.perUser} 💎/kişi) başarıyla doğrulandı!`);

console.log('========================================================');
console.log('🎉 TÜM GACHA, BANNER, 50/50 & TOPLULUK HAVUZU TESTLERİ GEÇTİ!');
console.log('========================================================');
process.exit(0);
