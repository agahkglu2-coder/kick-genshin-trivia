const assert = require('assert');
const { BossEngine } = require('../src/bossEngine');

console.log('=== TEST 1: BossEngine Başlatma & Boss Listesi ===');
const engine = new BossEngine();
const bosses = engine.getBosses();
console.log('Boss sayısı:', bosses.length);
assert(bosses.length >= 4, 'En az 4 boss bulunmalı');
assert(bosses.some(b => b.id === 'void_dragon'), 'Void Dragon bossu bulunmalı');
assert(bosses.some(b => b.id === 'king_slime'), 'King Slime bossu bulunmalı');
console.log('✅ Boss listesi doğrulandı:', bosses.map(b => b.name).join(', '));

console.log('\n=== TEST 2: Lobi Başlatma & Anti-Spam Tekil Katılım ===');
const startRes = engine.startBoss('void_dragon', { hp: 5000, prepSeconds: 5, battleSeconds: 10 });
assert(startRes.success, 'Boss başlatılabilmeli');
assert.strictEqual(engine.state, 'LOBBY');

// Test single join
engine.handleChatMessage({ content: '!katil', sender: { username: 'ZerkTester' } });
assert.strictEqual(engine.participants.size, 1);
const warrior = engine.participants.get('zerktester');
assert.strictEqual(warrior.username, 'ZerkTester');

// Test anti-spam duplicate join (must NOT add again or crash)
engine.handleChatMessage({ content: '!katil', sender: { username: 'ZerkTester' } });
engine.handleChatMessage({ content: '!boss', sender: { username: 'ZerkTester' } });
engine.handleChatMessage({ content: '!join', sender: { username: 'ZerkTester' } });
assert.strictEqual(engine.participants.size, 1, 'Aynı kullanıcı spam yapsa bile sadece 1 kez kaydedilmeli');
console.log('✅ Anti-Spam tekil katılım başarılı! Katılımcı sayısı: 1');

// Add second warrior
engine.handleChatMessage({ content: '!katil', sender: { username: 'AyakaMain' } });
assert.strictEqual(engine.participants.size, 2);
console.log('✅ İkinci katılımcı eklendi:', Array.from(engine.participants.keys()).join(', '));

console.log('\n=== TEST 3: Savaşa Geçiş & Otomatik Vuruşlar ===');
engine.beginBattle();
assert.strictEqual(engine.state, 'BATTLE');
const initialHp = engine.activeBoss.currentHp;

// Simulate an auto combat round
engine.executeAutoCombatRound();
assert(engine.activeBoss.currentHp < initialHp, 'Boss canı vuruşlarla azalmalı');
console.log(`✅ Otomatik vuruş başarılı! Kalan HP: ${engine.activeBoss.currentHp}/${engine.activeBoss.maxHp}`);

console.log('\n=== TEST 4: Taktiksel Kalkan Fazı & Kalkan Kırma ===');
engine.triggerTacticalPhase();
assert.strictEqual(engine.state, 'TACTICAL');
const initialShield = engine.activeBoss.tacticalShieldCurrent;
assert(initialShield > 0, 'Kalkan canı oluşmalı');

// Action 1
engine.handleChatMessage({ content: '!kalkan', sender: { username: 'ZerkTester' } });
assert(engine.activeBoss.tacticalShieldCurrent < initialShield, 'Kalkan hasar almalı');

// Duplicate action prevention (Anti-spam in tactical phase)
const shieldAfterFirst = engine.activeBoss.tacticalShieldCurrent;
engine.handleChatMessage({ content: '!kalkan', sender: { username: 'ZerkTester' } });
assert.strictEqual(engine.activeBoss.tacticalShieldCurrent, shieldAfterFirst, 'Aynı fazda ikinci taktiksel hamle engellenmeli');
console.log('✅ Taktiksel faz anti-spam koruması başarılı!');

console.log('\n=== TEST 5: Zafer & Ödül Dağıtım Entegrasyonu ===');
// Mock gachaEngine to verify Primogem awards
const rewardedUsers = {};
const mockGachaEngine = {
  addPrimogems: (username, amount) => {
    rewardedUsers[username] = (rewardedUsers[username] || 0) + amount;
  },
  getUser: () => ({ inventory: [] })
};
engine.setGachaEngine(mockGachaEngine);

// Force HP to 0 and trigger victory
engine.activeBoss.currentHp = 0;
engine.handleVictory();
assert.strictEqual(engine.state, 'VICTORY');

// Verify rewards
assert(rewardedUsers['ZerkTester'] > 0, 'ZerkTester Primogem almalı');
assert(rewardedUsers['AyakaMain'] > 0, 'AyakaMain Primogem almalı');
console.log('✅ Ödül dağıtımı başarılı! Dağıtılan Primogemler:', rewardedUsers);

engine.stopBoss('TEST_CLEANUP');
console.log('\n🎉 TÜM BOSS ENGINE TESTLERİ %100 BAŞARIYLA GEÇTİ!');
process.exit(0);
