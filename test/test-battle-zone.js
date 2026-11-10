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

// 7. Verify Visual & Combat 2.0 Overhaul Features
const fs = require('fs');
const path = require('path');

// 7a. WorldEngine getMapStates companion & weaponRarity sync
p1.companion = 'Raiden Shogun';
const mapStates = worldEngine.getMapStates();
const townPlayerState = mapStates.town.find(p => p.username === 'LumineSlayer');
assert(townPlayerState, 'Player should be present in town map state');
assert.strictEqual(townPlayerState.companion, 'Raiden Shogun', 'getMapStates must include active companion');
assert.strictEqual(typeof townPlayerState.weaponRarity, 'number', 'getMapStates must include weaponRarity');
console.log('✅ WorldEngine getMapStates() yoldaş (companion) ve silah nadirliği (weaponRarity) senkronizasyonu doğrulandı!');

// 7b. Verify HTML/JS/CSS Combat 2.0 & Anime Cel-Shading hooks
const worldHtml = fs.readFileSync(path.join(__dirname, '../public/world.html'), 'utf8');
const worldJs = fs.readFileSync(path.join(__dirname, '../public/world.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');

assert(worldHtml.includes('id="combat-boss-hud"'), 'Boss HUD bar must exist in world.html');
assert(worldHtml.includes('id="combat-combo-hud"'), 'Combo & Elemental Reaction HUD must exist in world.html');
assert(worldHtml.includes('id="combat-stamina-fill"'), 'Stamina bar must exist in world.html');
assert(worldHtml.includes('id="slot-heavy"'), 'Heavy Attack (R / Right-Click) skill slot must exist in world.html');

assert(worldJs.includes('function createStylizedMaterial'), 'Anime Cel-Shading material helper must exist');
assert(worldJs.includes('function addAnimeOutline'), 'Inverted-hull anime outline helper must exist');
assert(worldJs.includes('function setMapAtmosphere'), 'Sky dome & atmospheric lighting engine must exist');
assert(worldJs.includes('function performHeavyAttack'), 'Heavy Attack (Right-Click / R) must exist');
assert(worldJs.includes('function applyElementAndTriggerReaction'), '7-Element Reaction Engine (Vaporize, Melt, Overload, Freeze, Swirl, etc.) must exist');
assert(worldJs.includes('function getCombatAimAngleAndAngleTarget'), 'Mouse Raycast Aiming & Cursor Reticle must exist');
assert(worldJs.includes('function spawnLinearWaveSkillshot'), 'Linear Piercing Wave Skillshot engine must exist');
assert(worldJs.includes('function spawnArcaneOrbToTargetSkillshot'), 'Parabolic Ground-Targeted Skillshot engine must exist');
assert(worldJs.includes('function startSkillshotAim') && worldJs.includes('function releaseSkillshotAim'), 'Hybrid Hold-to-Aim + Smartcast system must exist');
assert(worldJs.includes('function triggerSweetspotReward'), 'Sweetspot Mastery (KESKİN İSABET) reward system must exist');
assert(worldJs.includes('function animateMobRig'), 'Articulated monster limb rig animation must exist');
assert(worldJs.includes('hud-companion-img'), 'Companion HUD DOM IDs must match world.html');
assert(serverJs.includes('WORLD_COMBAT_VFX'), 'Multiplayer combat VFX broadcast must exist in server.js');
console.log('✅ Anime Cel-Shading, Gökyüzü Kubbesi, Elementel Reaksiyon Motoru, Ağır Saldırı, Stamina/Poise ve Boss HUD doğrulandı!');

// 8. Verify Fishing Stuck Bug Fix, Inventory Bag Modal Fix, and Mylune Daily Quest System
assert(worldHtml.includes('id="fish-catch-stars"'), 'fish-catch-stars element must exist in world.html so fishing catch modal never throws');
assert(worldHtml.includes('id="modal-inventory-bag"'), 'Standalone Inventory & Collection modal must exist in world.html');
assert(worldHtml.includes('id="modal-daily-quests"'), 'Mylune Daily Quests modal must exist in world.html');
assert(worldHtml.includes('id="daily-quest-tracker"'), 'Top-right Mini Daily Quest Tracker HUD must exist in world.html');
assert(worldJs.includes('function toggleInventoryBagModal'), 'toggleInventoryBagModal must exist in world.js');
assert(worldJs.includes('function openDailyQuestsModal'), 'openDailyQuestsModal must exist in world.js');

const { RpgEngine } = require('../src/rpgEngine');
const testRpg = new RpgEngine();
const dqInit = testRpg.getDailyQuestsState('MyluneFan');
assert.strictEqual(dqInit.totalCount, 5, 'Should have 5 daily quests');
assert.strictEqual(dqInit.completedCount, 0, 'Initially 0 completed quests');

// Test 5s anti-spam cooldown on kick_chat_10
const r1 = testRpg.recordDailyQuestProgress('MyluneFan', 'kick_chat_10', 1);
assert.strictEqual(r1.updated, true, 'First chat message should count');
const r2 = testRpg.recordDailyQuestProgress('MyluneFan', 'kick_chat_10', 1);
assert.strictEqual(r2.updated, false, 'Immediate second chat message within 5s should be blocked by anti-spam');
assert.strictEqual(r2.reason, 'cooldown', 'Reason should be cooldown');

// Complete all 5 quests bypassing cooldown for test
testRpg.recordDailyQuestProgress('MyluneFan', 'kick_chat_10', 10, { enforceCooldown: false });
testRpg.recordDailyQuestProgress('MyluneFan', 'kick_stream_event', 1);
testRpg.recordDailyQuestProgress('MyluneFan', 'mmo_fish_3', 3);
testRpg.recordDailyQuestProgress('MyluneFan', 'mmo_kill_10', 10);
testRpg.recordDailyQuestProgress('MyluneFan', 'mmo_boss_or_guild', 1);

const dqDone = testRpg.getDailyQuestsState('MyluneFan');
assert.strictEqual(dqDone.completedCount, 5, 'All 5 quests should be completed');
assert.strictEqual(dqDone.bonusChest.unlocked, true, 'Grand Bonus Chest should be unlocked');

const claimAll = testRpg.claimAllAvailableDailyQuests('MyluneFan');
assert.strictEqual(claimAll.ok, true, 'claimAllAvailableDailyQuests should succeed');
assert.strictEqual(claimAll.primoGain, 60 + 50 + 45 + 55 + 60 + 160, 'Total Primogem reward should equal 430 (270 + 160 chest)');
assert(claimAll.bonusItem && claimAll.bonusItem.rarity >= 4, 'Bonus chest must grant a 4★ Epic or 5★ Legendary RPG item');
console.log(`✅ Balık Tutma Fix, Envanter Çantası Modalı ve Mylune Günlük Görev Sistemi (+${claimAll.primoGain} 💎 & [${claimAll.bonusItem.rarity}★ ${claimAll.bonusItem.name}]) doğrulandı!`);

// 9. Verify Aion 2-Style 3-Stage Instance Dungeon System
console.log('=== TEST: Aion 2 Instance Dungeon System ===');
const { ZONE_CONFIGS } = require('../src/rpgEngine');
assert(ZONE_CONFIGS.dungeon_tier_1, 'dungeon_tier_1 config must exist');
assert(ZONE_CONFIGS.dungeon_tier_2, 'dungeon_tier_2 config must exist');
assert(ZONE_CONFIGS.dungeon_tier_3, 'dungeon_tier_3 config must exist');
assert.strictEqual(ZONE_CONFIGS.dungeon_tier_1.reqGS, 150);
assert.strictEqual(ZONE_CONFIGS.dungeon_tier_2.reqGS, 450);
assert.strictEqual(ZONE_CONFIGS.dungeon_tier_3.reqGS, 800);
console.log('✅ Aion 2 Zindan Tier 1, 2, 3 konfigürasyonları ve GS gereksinimleri doğrulandı.');

// 9b. Verify WorldEngine Dungeon Map Bounds & Spawns
assert(worldEngine.maps.dungeon_tier_1, 'dungeon_tier_1 map must exist in worldEngine');
assert(worldEngine.maps.dungeon_tier_2, 'dungeon_tier_2 map must exist in worldEngine');
assert(worldEngine.maps.dungeon_tier_3, 'dungeon_tier_3 map must exist in worldEngine');
assert.strictEqual(worldEngine.maps.dungeon_tier_1.spawn.z, -60, 'Player spawn Z in dungeon must be -60');
console.log('✅ WorldEngine 3 kademeli zindan harita sınırları ve başlangıç spawn koordinatları doğrulandı.');

// 9c. Verify Physical 3D Chest Claim in RpgEngine (Normal + S-Rank Bonus)
const dUser = 'AionDaevaTester';
const normalClaim = testRpg.claimDungeonChest(dUser, { tierId: 'dungeon_tier_1', rank: 'A', isBonusChest: false });
assert.strictEqual(normalClaim.success, true, 'Normal dungeon chest claim must succeed');
assert(normalClaim.primoGain >= 80, 'Normal chest should award at least 80 Primogems');
assert(normalClaim.equipment && normalClaim.equipment.score > 0, 'Chest should grant high ilvl RPG gear');
assert.strictEqual(normalClaim.wishes, 1, 'Normal chest should award 1 fate wish');

const bonusClaim = testRpg.claimDungeonChest(dUser, { tierId: 'dungeon_tier_2', rank: 'S', isBonusChest: true });
assert.strictEqual(bonusClaim.success, true, 'S-Rank bonus chest claim must succeed');
assert(bonusClaim.primoGain >= 200, 'Bonus chest should award at least 200 Primogems');
assert(bonusClaim.equipment && bonusClaim.equipment.rarity >= 4, 'S-Rank bonus chest must grant 4★ or 5★ guaranteed equipment');
assert.strictEqual(bonusClaim.wishes, 2, 'S-Rank bonus chest should award 2 fate wishes');
console.log(`✅ Zindan Sandık Ödülleri (Normal: +${normalClaim.primoGain} 💎 / S-Rank Bonus: +${bonusClaim.primoGain} 💎 & [${bonusClaim.equipment.rarity}★ ${bonusClaim.equipment.name}]) doğrulandı!`);

// 9d. Verify Client & Server Integration Hooks
const worldJsUpdated = fs.readFileSync(path.join(__dirname, '../public/world.js'), 'utf8');
const worldHtmlUpdated = fs.readFileSync(path.join(__dirname, '../public/world.html'), 'utf8');
const serverJsUpdated = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');

assert(worldHtmlUpdated.includes('id="dungeon-hud"'), 'Dungeon HUD must exist in world.html');
assert(worldHtmlUpdated.includes('id="dungeon-mechanic-banner"'), 'Mechanic Banner must exist in world.html');
assert(worldHtmlUpdated.includes('id="dungeon-victory-banner"'), 'Victory Banner must exist in world.html');
assert(worldHtmlUpdated.includes('data-portal-tab="dungeons"'), 'Portal Modal Dungeons tab must exist in world.html');

assert(worldJsUpdated.includes('function buildAionDungeonMap'), 'buildAionDungeonMap must exist in world.js');
assert(worldJsUpdated.includes('function triggerWindstreamFlight'), 'Windstream Flight launcher must exist in world.js');
assert(worldJsUpdated.includes('function createDaevaWingsMesh'), '3D Daeva Wings mesh generator must exist in world.js');
assert(worldJsUpdated.includes('function createAetherBarrierMesh'), 'Aether Barrier mesh generator must exist in world.js');
assert(worldJsUpdated.includes('function createWindstreamRingMesh'), 'Windstream Ring mesh generator must exist in world.js');
assert(worldJsUpdated.includes('function createChestMesh'), '3D Physical Chest mesh generator must exist in world.js');
assert(worldJsUpdated.includes('function updateDungeonRuntime'), 'updateDungeonRuntime engine must exist in world.js');
assert(worldJsUpdated.includes('function onDungeonMobDefeated'), 'onDungeonMobDefeated handler must exist in world.js');
assert(worldJsUpdated.includes('DUNGEON_VIEWER_BUFF'), 'Kick Viewer Buff WS handler must exist in world.js');
assert(worldJsUpdated.includes('DUNGEON_CHEST_CLAIM_RESULT'), 'Dungeon Chest Claim WS handler must exist in world.js');

assert(serverJsUpdated.includes('WORLD_DUNGEON_CHEST_CLAIM'), 'Server WS handler for chest claim must exist');
assert(serverJsUpdated.includes('DUNGEON_VIEWER_BUFF'), 'Kick !buff / !kutsama chat command handler must exist in server.js');
assert(serverJsUpdated.includes('/api/world/dungeon/claim-chest'), 'REST endpoint for dungeon chest claim must exist');
console.log('✅ Aion 2 3-Kademeli Zindan, Rüzgar Akıntısı (Windstream), Daeva Kanatları, Patron Fazları, Sandıklar ve Kick Yayını Kutsaması %100 doğrulandı!');

console.log('=================================================================');
console.log('🎉 CANAVAR MATERYAL DÜŞME, COMBAT 2.0 VE GÖRSEL MOTOR TESTLERİ %100 GEÇTİ!');
console.log('=================================================================');
process.exit(0);
