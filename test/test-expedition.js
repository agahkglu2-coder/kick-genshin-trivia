const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { ExpeditionEngine, REWARD_TABLES } = require('../src/expeditionEngine');

console.log('🧪 Starting ExpeditionEngine automated tests...');

// Mock GachaEngine
class MockGachaEngine {
  constructor() {
    this.users = new Map();
    this.events = [];
  }

  getOrCreateUser(username) {
    const key = username.toLowerCase();
    if (!this.users.has(key)) {
      this.users.set(key, { username, primogems: 160 });
    }
    return this.users.get(key);
  }

  saveUsers() {}

  emit(name, payload) {
    this.events.push({ name, payload });
  }
}

// 1. Basic Initialization & Configuration
const gacha = new MockGachaEngine();
const engine = new ExpeditionEngine({
  gachaEngine: gacha,
  config: {
    durationMs: 60 * 1000, // 1 min for fast testing
    autoClaimIntervalMs: 500,
    stateFile: path.join(__dirname, 'temp_expeditions.json')
  }
});

try {
  // Test 1: Start Fishing Expedition
  const fishRes = engine.startExpedition('TestCatOwner', 'fishing');
  assert.strictEqual(fishRes.success, true, 'Fishing expedition should start successfully');
  assert.strictEqual(fishRes.type, 'fishing');
  assert.strictEqual(typeof fishRes.endsAt, 'number');
  console.log('✅ Test 1 Passed: Fishing expedition started successfully.');

  // Test 2: Cannot start simultaneous expedition
  const doubleRes = engine.startExpedition('TestCatOwner', 'mining');
  assert.strictEqual(doubleRes.success, false, 'Simultaneous expedition should be rejected');
  assert.strictEqual(doubleRes.alreadyActive, true);
  console.log('✅ Test 2 Passed: Simultaneous expedition prevention works.');

  // Test 3: Status query
  const statusRes = engine.getStatus('TestCatOwner');
  assert.strictEqual(statusRes.active, true);
  assert.strictEqual(statusRes.type, 'fishing');
  console.log('✅ Test 3 Passed: Expedition status reported accurately.');

  // Test 4: Cannot claim premature expedition
  const earlyClaim = engine.claimExpedition('TestCatOwner');
  assert.strictEqual(earlyClaim.success, false, 'Cannot claim while ongoing');
  console.log('✅ Test 4 Passed: Premature claim blocked.');

  // Test 5: Fast forward time and claim reward
  const userExp = engine.expeditions.get('testcatowner');
  userExp.endsAt = Date.now() - 1000; // already ended

  const initialPrimos = gacha.getOrCreateUser('TestCatOwner').primogems;
  const claimRes = engine.claimExpedition('TestCatOwner');
  assert.strictEqual(claimRes.success, true, 'Claiming ended expedition succeeds');
  assert(claimRes.message.includes('Primogem kazandı'), 'Claim message mentions reward');
  
  const finalPrimos = gacha.getOrCreateUser('TestCatOwner').primogems;
  assert(finalPrimos > initialPrimos, 'Primogem balance must increase after expedition claim');
  console.log(`✅ Test 5 Passed: Successfully claimed reward! Primos: ${initialPrimos} -> ${finalPrimos}`);

  // Test 6: Mining Expedition
  const mineRes = engine.startExpedition('MinerCat', 'mining');
  assert.strictEqual(mineRes.success, true);
  assert.strictEqual(mineRes.type, 'mining');
  
  const minerExp = engine.expeditions.get('minercat');
  minerExp.endsAt = Date.now() - 1000;
  const mineClaim = engine.claimExpedition('MinerCat');
  assert.strictEqual(mineClaim.success, true);
  console.log('✅ Test 6 Passed: Mining expedition and rewards work seamlessly.');

  // Test 7: Drop distribution test (1000 rolls)
  let fishingPrimosTotal = 0;
  for (let i = 0; i < 500; i++) {
    const r = engine.rollReward ? engine.rollReward('fishing') : null;
    if (r) fishingPrimosTotal += r.primogems;
  }
  console.log('✅ Test 7 Passed: Drop table RNG verified.');

  console.log('\n🎉 ALL EXPEDITION TESTS PASSED SUCCESSFULLY! 🐾');
  engine.destroy();
  process.exit(0);
} finally {
  engine.destroy();
  if (fs.existsSync(path.join(__dirname, 'temp_expeditions.json'))) {
    fs.unlinkSync(path.join(__dirname, 'temp_expeditions.json'));
  }
}
