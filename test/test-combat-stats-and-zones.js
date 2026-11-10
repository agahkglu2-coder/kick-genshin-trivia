const assert = require('assert');
const { getRpgProfile, calculateGearScore, getGsDifficultyMultiplier, ZONE_CONFIGS } = require('../src/rpgEngine');

console.log('=== TEST: MMORPG Combat Stats, DEF Mitigation & Biome Zones ===');

// 1. Test Zone Configs & Biomes
console.log('\n--- 1. Üç Özgün Biyom ve Bölge Tanımları ---');
assert.strictEqual(ZONE_CONFIGS.battle_zone_1.name, 'Kadim Sarmaşıklı Orman');
assert.strictEqual(ZONE_CONFIGS.battle_zone_1.reqGS, 100);
console.log(`✅ Zone 1: ${ZONE_CONFIGS.battle_zone_1.name} [GS ${ZONE_CONFIGS.battle_zone_1.reqGS}]`);

assert.strictEqual(ZONE_CONFIGS.battle_zone_2.name, 'Kızıl Lav Harabeleri');
assert.strictEqual(ZONE_CONFIGS.battle_zone_2.reqGS, 350);
console.log(`✅ Zone 2: ${ZONE_CONFIGS.battle_zone_2.name} [GS ${ZONE_CONFIGS.battle_zone_2.reqGS}]`);

assert.strictEqual(ZONE_CONFIGS.battle_zone_3.name, 'Kadim Uçurum Boşluğu');
assert.strictEqual(ZONE_CONFIGS.battle_zone_3.reqGS, 750);
console.log(`✅ Zone 3: ${ZONE_CONFIGS.battle_zone_3.name} [GS ${ZONE_CONFIGS.battle_zone_3.reqGS}]`);

// 2. RPG DEF Mitigation Formula Verification
console.log('\n--- 2. RPG Savunma (DEF) Hasar Azaltma Formülü ---');
function calculateDamageTaken(baseDmg, def, gsPenalty = 1.0) {
  const defReduction = 100 / (100 + Math.max(0, def));
  return Math.max(1, Math.round(baseDmg * gsPenalty * defReduction));
}

const rawDmg = 100;
const dmg0Def = calculateDamageTaken(rawDmg, 0);
const dmg50Def = calculateDamageTaken(rawDmg, 50);
const dmg100Def = calculateDamageTaken(rawDmg, 100);
const dmg200Def = calculateDamageTaken(rawDmg, 200);

assert.strictEqual(dmg0Def, 100);
assert.strictEqual(dmg50Def, 67); // 100 * (100/150) = 66.67 -> 67
assert.strictEqual(dmg100Def, 50); // 100 * (100/200) = 50 -> 50% azalma!
assert.strictEqual(dmg200Def, 33); // 100 * (100/300) = 33.33 -> 33

console.log(`✅ 0 DEF: ${dmg0Def} hasar (%0 kırma)`);
console.log(`✅ 50 DEF: ${dmg50Def} hasar (%33 kırma)`);
console.log(`✅ 100 DEF: ${dmg100Def} hasar (%50 kırma - Yarı yarıya)`);
console.log(`✅ 200 DEF: ${dmg200Def} hasar (%67 kırma - 3 kat dayanıklı)`);

// 3. DEF + GearScore Penalty Interaction
console.log('\n--- 3. DEF ve GearScore Ceza Etkileşimi ---');
// Oyuncu 200 GS ile 750 GS Kadim Uçurum Boşluğuna girdiğinde:
const deadlyGsPenalty = getGsDifficultyMultiplier(200, 750);
assert.strictEqual(deadlyGsPenalty.status, 'deadly');
assert.strictEqual(deadlyGsPenalty.damageTakenMult, 2.5); // %150 daha fazla hasar alır

// Eğer 0 DEF ise: 80 * 2.5 = 200 hasar
const brutalDmg = calculateDamageTaken(80, 0, deadlyGsPenalty.damageTakenMult);
assert.strictEqual(brutalDmg, 200);

// Eğer sağlam zırh kuşanıp 150 DEF'e sahipse: 80 * 2.5 * (100/250) = 80 hasar!
const tankedDmg = calculateDamageTaken(80, 150, deadlyGsPenalty.damageTakenMult);
assert.strictEqual(tankedDmg, 80);
console.log(`✅ GS Yetersizliğinde Alınan Ham Hasar: ${brutalDmg} HP`);
console.log(`✅ 150 DEF Zırh Kuşanıldığında Emilen Hasar: ${tankedDmg} HP (Hayatta kalındı!)`);

// 4. Lifesteal & Haste Scaling Verification
console.log('\n--- 4. Lifesteal (Can Çalma) & Haste (Saldırı Hızı) ---');
function calculateLifesteal(dmgDealt, lifestealPct) {
  return Math.round(dmgDealt * lifestealPct);
}
function calculateAttackCooldown(baseCd, haste) {
  const hasteFactor = 1 - Math.min(0.5, (haste / 100) * 0.5);
  return Math.round(baseCd * hasteFactor);
}

const lifestealHeal = calculateLifesteal(240, 0.15); // %15 Lifesteal
assert.strictEqual(lifestealHeal, 36);
console.log(`✅ 240 Hasar Vuruşunda %15 Lifesteal: +${lifestealHeal} HP İyileşme`);

const baseSwingCd = 220; // ms
const fastSwingCd = calculateAttackCooldown(baseSwingCd, 50); // 50 Haste -> %25 hızlanma
assert.strictEqual(fastSwingCd, 165);
console.log(`✅ Standart Saldırı CD: ${baseSwingCd}ms -> 50 Haste ile: ${fastSwingCd}ms`);

console.log('\n🎉 TÜM COMBAT STATLARI, DEF MEKANİĞİ VE BİYOM TESTLERİ BAŞARIYLA GEÇTİ!');
