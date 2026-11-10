const assert = require('assert');
const { RpgEngine, SLOTS, RARITIES, upgradeCost, salvageValue } = require('../src/rpgEngine');
const { WorldEngine } = require('../src/worldEngine');

console.log('=== MMORPG ITEM & GEARSCORE (GS) SYSTEM TESTLERİ ===\n');

// Mock in-memory DB
const mockStore = new Map();
const mockDb = {
  getSetting(key) { return mockStore.get(key) || null; },
  setSetting(key, val) { mockStore.set(key, val); return Promise.resolve(); }
};

const rpg = new RpgEngine({ db: mockDb });
const world = new WorldEngine({ rpgEngine: rpg });

console.log('--- TEST 1: Yeni Oyuncu Profil & Başlangıç Silahı ---');
const prof1 = rpg.getProfile('SezginHero', { persist: true });
assert(prof1, 'Profil oluşturulabilmeli');
assert.strictEqual(prof1.level, 1, 'Başlangıç seviyesi 1 olmalı');
assert(prof1.equipment.weapon, 'Yeni oyuncunun başlangıç kılıcı olmalı');
assert.strictEqual(prof1.equipment.weapon.slot, 'weapon');
console.log('✅ Profil ve başlangıç silahı başarıyla üretildi:', prof1.equipment.weapon.name);

console.log('\n--- TEST 2: GearScore (GS) ve Stat Hesaplama ---');
const state1 = rpg.getState('SezginHero');
assert(state1.stats.gearScore > 0, 'Başlangıç GearScore > 0 olmalı');
assert(state1.stats.atk >= 18, 'Saldırı gücü taban seviyeden yüksek olmalı');
assert(state1.stats.hp >= 400, 'Can taban seviyeden yüksek olmalı');
console.log(`✅ Başlangıç GearScore: [GS ${state1.stats.gearScore}] | ATK: ${state1.stats.atk} | HP: ${state1.stats.hp} | DEF: ${state1.stats.def}`);

console.log('\n--- TEST 3: Eşya Üretimi (7 Yuva & 5 Nadirlik) ---');
for (const slot of SLOTS) {
  const item = rpg.generateItem({ slot, ilvl: 10, rarity: 3 });
  assert.strictEqual(item.slot, slot);
  assert.strictEqual(item.rarity, 3);
  assert(item.affixes.length >= 2, 'Nadir eşyada en az 2 affix olmalı');
}
const legendary = rpg.generateItem({ slot: 'weapon', ilvl: 40, rarity: 5 });
assert.strictEqual(legendary.rarity, 5);
assert(legendary.name.includes('—'), 'Efsanevi silahta özel unvan olmalı');
console.log('✅ Efsanevi Eşya Başarıyla Üretildi:', legendary.name);

console.log('\n--- TEST 4: Eşya Kuşanma (Equip) & Çıkarma (Unequip) ---');
// Çantaya nadir bir miğfer verelim
const helmet = rpg.generateItem({ slot: 'helmet', ilvl: 1, rarity: 3 });
prof1.bag.push(helmet);
const equipRes = rpg.equip('SezginHero', helmet.uid);
assert(equipRes.ok, 'Miğfer kuşanılabilmeli');
assert.strictEqual(prof1.equipment.helmet.uid, helmet.uid);
const afterEquipState = rpg.getState('SezginHero');
assert(afterEquipState.stats.gearScore > state1.stats.gearScore, 'Miğfer takılınca GS artmalı');
console.log(`✅ Miğfer Kuşanıldı! Yeni GearScore: [GS ${afterEquipState.stats.gearScore}] (+${afterEquipState.stats.gearScore - state1.stats.gearScore} GS)`);

// Çıkarma testi
const unequipRes = rpg.unequip('SezginHero', 'helmet');
assert(unequipRes.ok, 'Miğfer çıkarılabilmeli');
assert(!prof1.equipment.helmet, 'Miğfer yuvası boş olmalı');
assert(prof1.bag.find(i => i.uid === helmet.uid), 'Miğfer çantaya dönmüş olmalı');
console.log('✅ Miğfer başarıyla çantaya çıkarıldı.');

console.log('\n--- TEST 5: Eşya Güçlendirme (Upgrade / Enhance +1..+10) ---');
// Oyuncuya Rün Tozu ekleyelim
prof1.dust = 500;
const swordUid = prof1.equipment.weapon.uid;
const upRes1 = rpg.upgrade('SezginHero', swordUid);
assert(upRes1.ok, 'Silah +1 yapılabilmeli');
assert.strictEqual(prof1.equipment.weapon.plus, 1);
const upRes2 = rpg.upgrade('SezginHero', swordUid);
assert(upRes2.ok, 'Silah +2 yapılabilmeli');
assert.strictEqual(prof1.equipment.weapon.plus, 2);
console.log(`✅ Silah güçlendirildi: +${prof1.equipment.weapon.plus} ${prof1.equipment.weapon.name} (Kalan Toz: ${prof1.dust})`);

console.log('\n--- TEST 6: Rün Tozuna Parçalama (Salvage) ---');
// Çantaya 3 tane eşya koyup parçalayalım
const junk1 = rpg.generateItem({ slot: 'gloves', ilvl: 2, rarity: 1 });
const junk2 = rpg.generateItem({ slot: 'boots', ilvl: 3, rarity: 2 });
prof1.bag.push(junk1, junk2);
const prevDust = prof1.dust;
const salvRes = rpg.salvage('SezginHero', { uid: junk1.uid });
assert(salvRes.ok, 'Tekil eşya parçalanabilmeli');
assert(prof1.dust > prevDust, 'Rün Tozu artmalı');

const bulkRes = rpg.salvage('SezginHero', { maxRarity: 2 });
assert(bulkRes.ok, 'Toplu parçalama çalışmalı');
assert(!prof1.bag.find(i => i.uid === junk2.uid), 'Junk2 parçalanmış olmalı');
console.log(`✅ Parçalama başarılı! Kazanılan Toz: +${salvRes.dust + bulkRes.dust}`);

console.log('\n--- TEST 7: Canavar Öldürme (Kill, XP, Level Up, Drop) ---');
// 5 Slime öldürelim
let dropsCount = 0;
for (let i = 0; i < 6; i++) {
  // Biraz zaman simülasyonu
  const b = rpg.killBuckets.get('sezginhero');
  if (b) b.tokens = 8;
  const kRes = rpg.handleKill('SezginHero', { mobType: 'slime_pyro', level: 3 });
  if (kRes.ok) {
    dropsCount += (kRes.drops || []).length;
  }
}
console.log(`✅ Canavar avı tamamlandı! Oyuncu Seviyesi: Lv.${prof1.level} (XP: ${prof1.xp}) | Düşen Ekipman: ${dropsCount}`);

// Boss öldürme
const b = rpg.killBuckets.get('sezginhero');
if (b) { b.tokens = 8; b.lastBoss = 0; }
const bossRes = rpg.handleKill('SezginHero', { mobType: 'ruin_golem', level: 10 });
assert(bossRes.ok, 'Boss kesimi onaylanmalı');
assert(bossRes.drops.length >= 1, 'Boss en az 1 ekipman düşürmeli');
console.log(`✅ 👑 BOSS Kesildi! Düşen Nadir Eşya: ${bossRes.drops.map(d => d.name).join(', ')}`);

console.log('\n--- TEST 8: WorldEngine 3D Nametag & getMapStates GS Yayını ---');
const p1 = world.addPlayer('sock_hero', { username: 'SezginHero', avatarIndex: 0, isGuest: false });
const states = world.getMapStates();
const townPlayers = states.town;
const heroInTown = townPlayers.find(p => p.username === 'SezginHero');
assert(heroInTown, 'Oyuncu harita listesinde bulunmalı');
assert(heroInTown.gearScore > 0, 'Oyuncunun harita broadcastinde gearScore bulunmalı');
assert(heroInTown.level >= 1, 'Oyuncunun harita broadcastinde level bulunmalı');
console.log(`✅ WorldEngine Senkronizasyonu: @${heroInTown.username} [GS: ${heroInTown.gearScore} | Lv.${heroInTown.level}] dünyaya başarıyla yayınlandı!`);

console.log('\n--- TEST 9: Sıralama (Leaderboard) & İnceleme (Inspect) ---');
const leaderboard = rpg.getLeaderboard(5);
assert(leaderboard.length >= 1);
assert.strictEqual(leaderboard[0].username, 'sezginhero');

const inspectSummary = rpg.getPublicSummary('SezginHero');
assert(inspectSummary.gs > 0);
console.log(`✅ Sıralama ve Profil İnceleme Özeti:`, inspectSummary);

console.log('\n🎉 TÜM MMORPG ITEM & GEARSCORE TESTLERİ BAŞARIYLA GEÇTİ!');
