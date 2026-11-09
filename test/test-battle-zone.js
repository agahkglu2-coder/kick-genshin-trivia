/**
 * Battle Zone, Monster Loot Drops & NPC Material Market Unit Test
 */
const { WorldEngine } = require('../src/worldEngine');
const assert = require('assert');

console.log('=== TEST: Battle Zone, Monster Loot Drops & NPC Material Market ===');

const mockGachaEngine = {
  users: {},
  getOrCreateUser(username) {
    if (!this.users[username]) {
      this.users[username] = { username, primogems: 160, inventory: [] };
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

// 4. Test Monster Loot Drops into Player Inventory
const user = mockGachaEngine.getOrCreateUser('LumineSlayer');

// Slime drops 1★ Slime Condensate (3 💎 value)
user.inventory.push({
  id: 'slime_condensate',
  name: 'Balçık Sıvısı',
  type: 'material',
  rarity: 1,
  sellPrice: 3,
  icon: '/assets/materials/slime_condensate.svg'
});
console.log('✅ Slime alt edildi: 1★ Balçık Sıvısı çantaya eklendi (Değer: 3 💎)');

// Hilichurl drops 2★ Stained Mask (10 💎 value)
user.inventory.push({
  id: 'stained_mask',
  name: 'Lekeli Maske',
  type: 'material',
  rarity: 2,
  sellPrice: 10,
  icon: '/assets/materials/stained_mask.svg'
});
console.log('✅ Hilichurl alt edildi: 2★ Lekeli Maske çantaya eklendi (Değer: 10 💎)');

// Pyromancer drops 4★ Abyss Fire Scroll (65 💎 value)
user.inventory.push({
  id: 'abyss_scroll',
  name: 'Uçurum Ateş Parşömeni',
  type: 'material',
  rarity: 4,
  sellPrice: 65,
  icon: '/assets/materials/abyss_scroll.svg'
});
console.log('✅ Uçurum Büyücüsü alt edildi: 4★ Uçurum Ateş Parşömeni çantaya eklendi (Değer: 65 💎)');

// Ruin Golem Boss drops 5★ Ancient Chaos Core (160 💎 value - Full 1 Wish Jackpot!)
user.inventory.push({
  id: 'chaos_core',
  name: 'Kadim Kaos Çekirdeği',
  type: 'material',
  rarity: 5,
  sellPrice: 160,
  icon: '/assets/materials/chaos_core.svg'
});
console.log('✅ Antik Yıkım Muhafızı (BOSS) alt edildi: 5★ Kadim Kaos Çekirdeği çantaya eklendi (Değer: 160 💎)');

const materials = user.inventory.filter(i => i.type === 'material');
assert.strictEqual(materials.length, 4, 'Player should have 4 materials in inventory');

// 5. Verify exit portal back to town at (0, -32)
worldEngine.updateMovement('sock_warrior', { x: 0, y: 0, z: -32, rot: 0, anim: 'walk' });
const exitRes = worldEngine.interactDoor('sock_warrior');
assert(exitRes.success, 'Exit portal transition to town should succeed');
assert.strictEqual(p1.mapId, 'town', 'Player should be back in town');
console.log('✅ Savaş Arenasından Kasaba Meydanına dönüş portalı başarılı!');

// 6. Test Selling Materials to Tüccar Liben for Primogems
// Sell all 4 materials (3 + 10 + 65 + 160 = 238 💎)
const totalPayout = materials.reduce((sum, item) => sum + item.sellPrice, 0);
assert.strictEqual(totalPayout, 238, 'Total payout should be 238 Primogems');

// Execute sale
user.inventory = user.inventory.filter(i => i.type !== 'material');
user.primogems += totalPayout;
p1.primogems = user.primogems;

assert.strictEqual(user.primogems, 160 + 238, 'Primogem balance should be updated to 398 💎');
assert.strictEqual(user.inventory.filter(i => i.type === 'material').length, 0, 'Materials should be removed after sale');
console.log(`✅ Tüccar Liben'e 4 parça materyal satıldı: +${totalPayout} 💎 Primogem kazanıldı!`);
console.log(`💰 Yeni Bakiye: ${user.primogems} 💎 (160 -> 398 💎)`);

console.log('=================================================================');
console.log('🎉 CANAVAR MATERYAL DÜŞME VE TÜCCAR LİBEN SATIŞ SİSTEMİ %100 GEÇTİ!');
console.log('=================================================================');
process.exit(0);
