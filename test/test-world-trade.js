const assert = require('assert');
const { GachaEngine } = require('../src/gachaEngine');
const { TradeEngine } = require('../src/tradeEngine');
const { WorldEngine } = require('../src/worldEngine');

console.log('--- TEST 1: WorldEngine & TradeEngine Başlatma ---');
const gacha = new GachaEngine();
const trade = new TradeEngine({ gachaEngine: gacha });
const world = new WorldEngine({ gachaEngine: gacha, tradeEngine: trade });

assert(world.maps.town, 'Town map should exist');
assert(world.maps.trade_house, 'Trade house map should exist');
console.log('✅ Haritalar ve motorlar başarıyla yüklendi!');

console.log('--- TEST 2: Oyuncu Ekleme & Hareket & Harita Sınırları ---');
const p1 = world.addPlayer('sock_1', { username: 'AshKetchum', avatarIndex: 3, isGuest: false });
const p2 = world.addPlayer('sock_2', { username: 'MistyWater', avatarIndex: 7, isGuest: false });

assert.strictEqual(world.players.size, 2);
assert.strictEqual(p1.username, 'AshKetchum');

// Move player within bounds
world.updateMovement('sock_1', { x: 10, y: 0, z: -5, rot: 1.5, anim: 'walk' });
assert.strictEqual(p1.x, 10);
assert.strictEqual(p1.anim, 'walk');

// Out of bounds movement should clamp
world.updateMovement('sock_1', { x: 100, y: 0, z: 200, rot: 0, anim: 'idle' });
assert.strictEqual(p1.x, 45); // clamped to maxX
assert.strictEqual(p1.z, 45); // clamped to maxZ
console.log('✅ Oyuncu hareketi ve sınır koruması başarılı!');

console.log('--- TEST 3: Kapı Etkileşimi & İç Mekan Geçişi ---');
// Move Ash near Trade House door (pos: -24, -10)
world.updateMovement('sock_1', { x: -24, y: 0, z: -10, rot: 0, anim: 'idle' });
const doorRes = world.interactDoor('sock_1');
assert(doorRes.success, 'Door transition should succeed');
assert.strictEqual(p1.mapId, 'trade_house');
console.log('✅ Kapıdan Takas Pazarı binasına giriş başarılı!');

// Exit back to town
world.updateMovement('sock_1', { x: 0, y: 0, z: 9, rot: 0, anim: 'idle' });
const exitRes = world.interactDoor('sock_1');
assert(exitRes.success, 'Exit transition should succeed');
assert.strictEqual(p1.mapId, 'town');
console.log('✅ Binadan Kasaba Meydanına geri çıkış başarılı!');

console.log('--- TEST 4: Kick PIN Hızlı Giriş Doğrulaması ---');
world.addPlayer('sock_guest', { username: 'Misafir_99', isGuest: true });
const pinData = world.createPinAuth('sock_guest', 'ZerkViewer');
assert(pinData.success && pinData.pin);

// Fake chat message '!giris <pin>'
const verifyRes = world.verifyPinFromChat('ZerkViewer', `!giris ${pinData.pin}`);
assert(verifyRes && verifyRes.success);
console.log('✅ Kick chat PIN doğrulama sistemi başarılı!');

console.log('--- TEST 5: P2P Güvenli Takas Simülasyonu ---');
// Give users test items in gacha
const u1 = gacha.getOrCreateUser('AshKetchum');
const u2 = gacha.getOrCreateUser('MistyWater');
u1.primogems = 1000;
u2.primogems = 500;
u1.inventory = [
  { name: 'Raiden Shogun', rarity: 5, type: 'character' },
  { name: 'Debate Club', rarity: 3, type: 'weapon' }
];
u2.inventory = [
  { name: 'Capitano', rarity: 5, type: 'character' },
  { name: 'Favonius Sword', rarity: 4, type: 'weapon' }
];

// Start trade session
const startRes = trade.startSession('AshKetchum', 'MistyWater');
assert(startRes.success);
const tradeId = startRes.session.id;

// Ash offers Raiden Shogun (index 0) and 200 Primogems
trade.updateOffer(tradeId, 'AshKetchum', { items: [0], primogems: 200 });

// Misty offers Capitano (index 0) and 100 Primogems
trade.updateOffer(tradeId, 'MistyWater', { items: [0], primogems: 100 });

// Both lock
trade.toggleLock(tradeId, 'AshKetchum', true);
trade.toggleLock(tradeId, 'MistyWater', true);
assert.strictEqual(trade.getSession(tradeId).status, 'COUNTDOWN');

// Both confirm
trade.confirmTrade(tradeId, 'AshKetchum');
const confirmRes = trade.confirmTrade(tradeId, 'MistyWater');
assert(confirmRes.success);
assert.strictEqual(trade.getSession(tradeId).status, 'COMPLETED');

// Verify inventory swap
assert(u1.inventory.some(i => i.name === 'Capitano'), 'Ash should have received Capitano');
assert(u2.inventory.some(i => i.name === 'Raiden Shogun'), 'Misty should have received Raiden Shogun');
assert.strictEqual(u1.primogems, 1000 - 200 + 100); // 900
assert.strictEqual(u2.primogems, 500 - 100 + 200);  // 600
console.log('✅ Atomik P2P Karakter & Primogem takası başarıyla doğrulandı!');

console.log('========================================================');
console.log('🎉 TÜM MMO WORLD & TRADE TESTLERİ BAŞARIYLA GEÇTİ!');
console.log('========================================================');
