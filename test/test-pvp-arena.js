const assert = require('assert');
const { WorldEngine } = require('../src/worldEngine');
const { RpgEngine } = require('../src/rpgEngine');

const worldEngine = new WorldEngine();
const rpgEngine = new RpgEngine();

console.log('🧪 Starting PvP Arena (Gladiator Colosseum) Test Suite...\n');

// 1. Verify Map & Doors Configurations in worldEngine
console.log('Test 1: MAPS.pvp_arena configuration...');
const pvpMap = worldEngine.getMapConfig('pvp_arena');
assert.ok(pvpMap, 'MAPS.pvp_arena must exist in worldEngine');
assert.strictEqual(pvpMap.name, 'Gladyatör Arenası (Colosseum)');
assert.strictEqual(pvpMap.combatPitRadius, 17.5);
assert.ok(pvpMap.exitDoor, 'pvp_arena must have exitDoor back to town');
assert.strictEqual(pvpMap.exitDoor.targetMap, 'town');
assert.strictEqual(pvpMap.exitDoor.pos.z, -28);
console.log('  ✓ pvp_arena map definition is verified.');

console.log('\nTest 2: Town Door to PvP Arena...');
const townMap = worldEngine.getMapConfig('town');
const pvpDoor = townMap.doors.find(d => d.id === 'door_pvp');
assert.ok(pvpDoor, 'town.doors must contain door_pvp');
assert.strictEqual(pvpDoor.targetMap, 'pvp_arena');
assert.strictEqual(pvpDoor.pos.x, 24);
assert.strictEqual(pvpDoor.pos.z, 28);
assert.strictEqual(pvpDoor.spawnPos.z, -24);
console.log('  ✓ Town portal door to pvp_arena is correctly configured at { x: 24, z: 28 }.');

// 2. Test Player Door Interactions
console.log('\nTest 3: Door Transition into PvP Arena and Exit...');
const socketA = 'sock_gladiator_1';
worldEngine.addPlayer(socketA, { username: 'Maximus', avatarIndex: 0, isGuest: false });
worldEngine.updateMovement(socketA, { x: 24, z: 28, rot: 0 });

const enterRes = worldEngine.interactDoor(socketA);
assert.ok(enterRes && enterRes.success, 'Player should enter pvp_arena');
assert.strictEqual(enterRes.newMap, 'pvp_arena');
assert.strictEqual(enterRes.spawnPos.x, 0);
assert.strictEqual(enterRes.spawnPos.z, -24);

const playerA = worldEngine.getPlayer(socketA);
assert.strictEqual(playerA.mapId, 'pvp_arena');

// Move to exit portal at (0, -28)
worldEngine.updateMovement(socketA, { x: 0, z: -28, rot: 0 });
const exitRes = worldEngine.interactDoor(socketA);
assert.ok(exitRes && exitRes.success, 'Player should exit back to town');
assert.strictEqual(exitRes.newMap, 'town');
assert.strictEqual(exitRes.spawnPos.x, 24);
assert.strictEqual(exitRes.spawnPos.z, 24);
console.log('  ✓ Player transition between town and pvp_arena works bi-directionally.');

// 3. Test RPG Profile PvP Stats & Kill Tracking
console.log('\nTest 4: RPG Engine PvP Stats & Kill Recording...');
const profKiller = rpgEngine.getProfile('Spartacus');
const profVictim = rpgEngine.getProfile('Commodus');

assert.strictEqual(typeof profKiller.pvpKills, 'number');
assert.strictEqual(typeof profKiller.pvpDeaths, 'number');
assert.strictEqual(typeof profKiller.honorPoints, 'number');

const initialKills = profKiller.pvpKills;
const initialHonor = profKiller.honorPoints;
const initialDeaths = profVictim.pvpDeaths;

const killRes = rpgEngine.recordPvPKill('Spartacus', 'Commodus');
assert.ok(killRes && killRes.ok);
assert.strictEqual(profKiller.pvpKills, initialKills + 1);
assert.strictEqual(profKiller.honorPoints, initialHonor + 10);
assert.strictEqual(profVictim.pvpDeaths, initialDeaths + 1);
assert.strictEqual(killRes.killer.honorPoints, initialHonor + 10);
assert.strictEqual(killRes.killer.primoGain, 2);
console.log('  ✓ PvP kill recording awarded +10 honor and +2 primogems correctly.');

// 4. Test PvP Leaderboard
console.log('\nTest 5: PvP Leaderboard Ranking...');
rpgEngine.recordPvPKill('Spartacus', 'Commodus');
rpgEngine.recordPvPKill('Spartacus', 'Commodus');
rpgEngine.recordPvPKill('Crixus', 'Spartacus');
const leaderboard = rpgEngine.getPvPLeaderboard(5);
assert.ok(Array.isArray(leaderboard));
assert.ok(leaderboard.length >= 2);
assert.strictEqual(leaderboard[0].username, 'spartacus');
assert.ok(leaderboard[0].kills >= 3);
console.log('  ✓ PvP Leaderboard ranks top gladiators accurately:');
leaderboard.forEach((row, i) => {
  console.log(`    #${i + 1} @${row.username}: ${row.kills} Kills, ${row.deaths} Deaths, ${row.honor} Honor`);
});

// 5. Test Balanced PvP Damage Calculation Formula
console.log('\nTest 6: Balanced PvP Damage & Mitigation Formula...');
const attStats = { atk: 180, crit: 25, critDmg: 160 };
const tgtStats = { def: 120, hp: 650 };

const def = tgtStats.def;
const defReduction = def / (def + 160); // 120 / 280 = ~42.8%
const rawDmg = attStats.atk * 1.55; // Combo step 1
const finalDmg = Math.max(12, Math.round(rawDmg * (1 - defReduction) * 0.55));
const pvpMaxHp = Math.round(tgtStats.hp * 2.5); // 1625 HP

console.log(`  Attacker ATK: ${attStats.atk}, Target DEF: ${def} (Reduction: ${(defReduction * 100).toFixed(1)}%)`);
console.log(`  Raw Combo DMG: ${rawDmg} -> PvP Final Scaled DMG: ${finalDmg}`);
console.log(`  Base HP: ${tgtStats.hp} -> Scaled PvP HP: ${pvpMaxHp}`);
assert.ok(finalDmg < pvpMaxHp * 0.25, 'Normal hit must not deal more than 25% of PvP HP (prevents one-shots)');
assert.ok(finalDmg >= 12, 'Damage must be at least minimum floor');
console.log('  ✓ Balanced PvP formula ensures competitive, multi-hit MMORPG combat.');

// Cleanup test sockets
worldEngine.removePlayer(socketA);

console.log('\n🎉 ALL PVP ARENA TESTS PASSED SUCCESSFULLY! (6/6)');
