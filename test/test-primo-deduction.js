const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Load GachaEngine
const { GachaEngine } = require('../src/gachaEngine');
const gacha = new GachaEngine();

console.log('=== TEST: Primogem Deduction & Management ===');

// 1. Initial user setup
const testUser = 'TestPrimoDeductUser';
gacha.setPrimogems(testUser, 1000, 'TEST_SETUP');
let u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 1000, 'Başlangıç bakiyesi 1000 olmalı');
console.log('✅ 1. Başlangıç bakiyesi 1000 olarak ayarlandı');

// 2. Deduct 300 Primogems
gacha.deductPrimogems(testUser, 300);
u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 700, '300 çıkarılınca 700 kalmalı');
console.log('✅ 2. deductPrimogems(testUser, 300) -> 700 kaldı');

// 3. Negative amount in addPrimogems
gacha.addPrimogems(testUser, -200);
u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 500, '-200 eklenince (çıkarılınca) 500 kalmalı');
console.log('✅ 3. addPrimogems(testUser, -200) -> 500 kaldı');

// 4. Deduct more than current balance (no negative balance, clamp to 0)
gacha.deductPrimogems(testUser, 9999);
u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 0, 'Fazla düşüşte bakiye 0 altına inmemeli');
console.log('✅ 4. Bakiyeden fazla silinince 0 altına inmedi (0 kaldı)');

// 5. Set to exact value (e.g. 1600)
gacha.setPrimogems(testUser, 1600);
u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 1600, 'Bakiye tam 1600 olmalı');
console.log('✅ 5. setPrimogems(testUser, 1600) -> 1600 oldu');

// 6. Reset to 0
gacha.setPrimogems(testUser, 0);
u = gacha.getOrCreateUser(testUser);
assert.strictEqual(u.primogems, 0, 'Sıfırlama sonrası 0 olmalı');
console.log('✅ 6. setPrimogems(testUser, 0) -> 0 olarak sıfırlandı');

// Clean up test user
if (gacha.users && gacha.users[testUser.toLowerCase()]) {
  delete gacha.users[testUser.toLowerCase()];
  gacha.saveUsers();
}
console.log('🎉 TÜM PRİMOGEM SİLME VE YÖNETİM TESTLERİ BAŞARIYLA GEÇTİ!');
