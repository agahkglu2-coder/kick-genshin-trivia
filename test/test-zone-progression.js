const assert = require('assert');
const { RpgEngine, ZONE_CONFIGS, getGsDifficultyMultiplier } = require('../src/rpgEngine');
const { WorldEngine } = require('../src/worldEngine');

console.log('=== MULTI-TIER MONSTER ZONES & GEARSCORE SCALING TESTLERİ ===\n');

console.log('--- TEST 1: Bölge Tanımları & Konfigürasyonları ---');
assert(ZONE_CONFIGS.battle_zone_1, '1. Bölge (Zümrüt Çayırları) tanımlı olmalı');
assert(ZONE_CONFIGS.battle_zone_2, '2. Bölge (Kızıl Harabeler) tanımlı olmalı');
assert(ZONE_CONFIGS.battle_zone_3, '3. Bölge (Kadim Uçurum Arenası) tanımlı olmalı');

assert.strictEqual(ZONE_CONFIGS.battle_zone_1.reqGS, 100);
assert.strictEqual(ZONE_CONFIGS.battle_zone_2.reqGS, 350);
assert.strictEqual(ZONE_CONFIGS.battle_zone_3.reqGS, 750);
console.log('✅ 3 Bölgenin gereksinimleri ve seviye bantları doğru:');
console.log(`   - ${ZONE_CONFIGS.battle_zone_1.name}: Önerilen GS ${ZONE_CONFIGS.battle_zone_1.reqGS} (ilvl ${ZONE_CONFIGS.battle_zone_1.minIlvl}-${ZONE_CONFIGS.battle_zone_1.maxIlvl})`);
console.log(`   - ${ZONE_CONFIGS.battle_zone_2.name}: Önerilen GS ${ZONE_CONFIGS.battle_zone_2.reqGS} (ilvl ${ZONE_CONFIGS.battle_zone_2.minIlvl}-${ZONE_CONFIGS.battle_zone_2.maxIlvl})`);
console.log(`   - ${ZONE_CONFIGS.battle_zone_3.name}: Önerilen GS ${ZONE_CONFIGS.battle_zone_3.reqGS} (ilvl ${ZONE_CONFIGS.battle_zone_3.minIlvl}-${ZONE_CONFIGS.battle_zone_3.maxIlvl})`);

console.log('\n--- TEST 2: GearScore Zorluk & Ceza Formülü (Soft-Gate) ---');
// 1. Durum: GS 150 olan oyuncu 750 GS'lik 3. Bölgeye girerse (Ölümcül Risk)
const penaltyDeadly = getGsDifficultyMultiplier(150, 750);
assert.strictEqual(penaltyDeadly.status, 'deadly');
assert(penaltyDeadly.damageMult <= 0.25, 'Hasar cezası çok yüksek olmalı (<%25)');
assert(penaltyDeadly.damageTakenMult >= 2.0, 'Alınan hasar 2 kattan fazla olmalı');
assert.strictEqual(penaltyDeadly.glanceChance, 0.35, 'Sektirme şansı %35 olmalı');
console.log(`✅ [Ölümcül Risk] 150 GS -> 750 GS Bölgesi: Hasar: x${penaltyDeadly.damageMult} | Alınan Hasar: x${penaltyDeadly.damageTakenMult} | Sektirme: %${penaltyDeadly.glanceChance * 100}`);

// 2. Durum: GS 260 olan oyuncu 350 GS'lik 2. Bölgeye girerse (Zorlu)
const penaltyChallenge = getGsDifficultyMultiplier(260, 350);
assert.strictEqual(penaltyChallenge.status, 'challenging');
assert(penaltyChallenge.damageMult >= 0.5 && penaltyChallenge.damageMult < 1.0);
console.log(`✅ [Zorlu Seviye] 260 GS -> 350 GS Bölgesi: Hasar: x${penaltyChallenge.damageMult} | Alınan Hasar: x${penaltyChallenge.damageTakenMult} | Sektirme: %${penaltyChallenge.glanceChance * 100}`);

// 3. Durum: GS 400 olan oyuncu 100 GS'lik 1. Bölgeye girerse (Güvenli)
const safeRes = getGsDifficultyMultiplier(400, 100);
assert.strictEqual(safeRes.status, 'safe');
assert.strictEqual(safeRes.damageMult, 1.0);
assert.strictEqual(safeRes.damageTakenMult, 1.0);
assert.strictEqual(safeRes.glanceChance, 0);
console.log(`✅ [Güvenli] 400 GS -> 100 GS Bölgesi: Tam hasar (x1.0), sıfır sektirme.`);

console.log('\n--- TEST 3: Bölgelere Göre Ödül ve Ganimet Dağılımı ---');
const rpg = new RpgEngine();
const prof = rpg.getProfile('TestAdventurer');

// Bölge 1 kesimi (Slime)
const killZ1 = rpg.handleKill('TestAdventurer', { mobType: 'slime_green', level: 3, zoneId: 'battle_zone_1' });
assert(killZ1.ok);
assert.strictEqual(killZ1.primoGain, 0, '1. bölge primogem vermemeli');
if (killZ1.drops.length > 0) {
  assert(killZ1.drops[0].ilvl <= 12, '1. bölge eşyası düşük ilvl olmalı');
}
console.log(`✅ Bölge 1 Ganimet Kontrolü: Primogem: ${killZ1.primoGain} 💎`);

// Bölge 2 kesimi (Pyro Büyücüsü / Mitachurl)
const killZ2 = rpg.handleKill('TestAdventurer', { mobType: 'mitachurl_axe', level: 20, elite: true, zoneId: 'battle_zone_2' });
assert(killZ2.ok);
console.log(`✅ Bölge 2 Elit Kesimi: Kazanılan Primogem: ${killZ2.primoGain} 💎 (Dengeli 3-5 aralığı)`);

// Bölge 3 kesimi (Antik Yıkım Muhafızı Boss)
const killZ3 = rpg.handleKill('TestAdventurer', { mobType: 'ruin_golem', level: 40, zoneId: 'battle_zone_3' });
assert(killZ3.ok);
assert(killZ3.isBoss);
assert(killZ3.primoGain >= 15 && killZ3.primoGain <= 25, 'Boss primogem ödülü 15-25 arası olmalı');
assert(killZ3.drops.length >= 1, 'Boss en az 1 nadir/destansı eşya düşürmeli');
assert(killZ3.drops[0].ilvl >= 32, '3. bölge boss eşyası yüksek ilvl olmalı');
console.log(`✅ Bölge 3 Boss Kesimi: Primogem: +${killZ3.primoGain} 💎 | Düşen Eşyalar: ${killZ3.drops.map(d => `${d.name} (${d.rarityLabel} | ilvl ${d.ilvl})`).join(', ')}`);

console.log('\n--- TEST 4: WorldEngine Bölge Geçişi & Kasabaya Yeniden Doğuş ---');
const world = new WorldEngine({ rpgEngine: rpg });
const player = world.addPlayer('sock_test', { username: 'ZindanGezgini', avatarIndex: 2 });

// Kadim Portaldan 2. Bölgeye geçiş
const switchRes = world.switchZone('sock_test', 'battle_zone_2');
assert(switchRes.success);
assert.strictEqual(player.mapId, 'battle_zone_2');
console.log(`✅ Bölge Işınlanması Başarılı: @${player.username} -> ${player.mapId}`);

// Oyuncunun canı sıfırlanıp yenilince Kasabaya doğuş
const respawned = world.respawnPlayer('sock_test');
assert(respawned);
assert.strictEqual(player.mapId, 'town');
assert.strictEqual(player.z, 2, 'Kasaba çeşme başında doğmalı');
console.log(`✅ Güvenli Kasaba Doğuşu: @${player.username} yenildiğinde ${player.mapId} haritasına geri ışınlandı.`);

console.log('\n🎉 TÜM BÖLGE İLERLEMESİ VE GEARSCORE ÖLÇEKLEME TESTLERİ BAŞARIYLA GEÇTİ!');
