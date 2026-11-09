/**
 * Battle Zone & Mob Primogem Farming Unit Test
 */
const { WorldEngine } = require('../src/worldEngine');
const assert = require('assert');

console.log('=== TEST: Battle Zone Map & Mob Primogem Farming ===');

const mockGachaEngine = {
  users: {},
  getOrCreateUser(username) {
    if (!this.users[username]) {
      this.users[username] = { username, primogems: 160 };
    }
    return this.users[username];
  },
  saveUsers() {
    this.saved = true;
  }
};

const worldEngine = new WorldEngine();
worldEngine.setEngines(mockGachaEngine);

// 1. Verify Battle Zone map definition
assert(worldEngine.maps.battle_zone, 'battle_zone map must exist in worldEngine');
assert.strictEqual(worldEngine.maps.battle_zone.id, 'battle_zone');
console.log('✅ Battle Zone harita tanımı başarıyla doğrulandı.');

// 2. Add player in town
const p1 = worldEngine.addPlayer('sock_warrior', { username: 'LumineSlayer', isGuest: false });
p1.primogems = 160;
assert.strictEqual(p1.mapId, 'town');

// 3. Move player to Battle Portal at (0, 32)
worldEngine.updateMovement('sock_warrior', { x: 0, y: 0, z: 32, rot: 0, anim: 'walk' });
const doorRes = worldEngine.interactDoor('sock_warrior');
assert(doorRes.success, 'Portal transition to battle_zone should succeed');
assert.strictEqual(p1.mapId, 'battle_zone', 'Player should now be in battle_zone');
console.log('✅ Kasabadan Vahşi Savaş Arenasına portal geçişi başarılı!');

// 4. Test Mob Defeat & Primogem Rewards
// Slime kill (8 💎)
let newTotal = worldEngine.awardPrimogems('sock_warrior', 8);
assert.strictEqual(newTotal, 168);
console.log('✅ Slime kesildi: +8 💎 -> 168 💎');

// Hilichurl kill (18 💎)
newTotal = worldEngine.awardPrimogems('sock_warrior', 18);
assert.strictEqual(newTotal, 186);
console.log('✅ Hilichurl kesildi: +18 💎 -> 186 💎');

// Abyss Mage kill (45 💎)
newTotal = worldEngine.awardPrimogems('sock_warrior', 45);
assert.strictEqual(newTotal, 231);
console.log('✅ Ateş Büyücüsü kesildi: +45 💎 -> 231 💎');

// Ruin Golem Boss kill (160 💎 Jackpot)
newTotal = worldEngine.awardPrimogems('sock_warrior', 160);
assert.strictEqual(newTotal, 391);
console.log('✅ Harabe Muhafızı (Mini-Boss) kesildi: +160 💎 (1 Wish) Jackpot -> 391 💎');

// 5. Verify exit portal back to town at (0, -32)
worldEngine.updateMovement('sock_warrior', { x: 0, y: 0, z: -32, rot: 0, anim: 'walk' });
const exitRes = worldEngine.interactDoor('sock_warrior');
assert(exitRes.success, 'Exit portal transition to town should succeed');
assert.strictEqual(p1.mapId, 'town', 'Player should be back in town');
console.log('✅ Savaş Arenasından Kasaba Meydanına dönüş portalı başarılı!');

console.log('====================================================');
console.log('🎉 SAVAŞ BÖLÜMÜ VE FARM SİSTEMİ %100 BAŞARIYLA GEÇTİ!');
console.log('====================================================');
process.exit(0);
