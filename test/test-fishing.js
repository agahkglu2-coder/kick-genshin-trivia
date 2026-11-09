/**
 * River Fishing & Primogem Economy Unit Test
 */
const { WorldEngine } = require('../src/worldEngine');
const assert = require('assert');

console.log('=== TEST: River Fishing & Primogem Economy ===');

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

const worldEngine = new WorldEngine({ gachaEngine: mockGachaEngine });

// 1. Player joins
const p1 = worldEngine.addPlayer('sock_angler', { username: 'FisherKing', isGuest: false });
p1.primogems = 160;
assert.strictEqual(p1.primogems, 160, 'Initial primogems should be 160');
console.log('✅ Oyuncu nehir kenarına ulaştı (160 💎)');

// 2. Award Primogems from fish catch
// Boot (10)
let newTotal = worldEngine.awardPrimogems('sock_angler', 10);
assert.strictEqual(newTotal, 170, '170 after boot');
console.log('✅ 1★ Eski Yosunlu Çizme yakalandı (+10 💎 -> 170 💎)');

// Carp (25)
newTotal = worldEngine.awardPrimogems('sock_angler', 25);
assert.strictEqual(newTotal, 195, '195 after carp');
console.log('✅ 2★ Gümüş Nehir Sazanı yakalandı (+25 💎 -> 195 💎)');

// Golden Bass (50)
newTotal = worldEngine.awardPrimogems('sock_angler', 50);
assert.strictEqual(newTotal, 245, '245 after bass');
console.log('✅ 3★ Altın Levrek yakalandı (+50 💎 -> 245 💎)');

// Crystal Fish (90)
newTotal = worldEngine.awardPrimogems('sock_angler', 90);
assert.strictEqual(newTotal, 335, '335 after crystal fish');
console.log('✅ 4★ Kraliyet Kristal Balığı yakalandı (+90 💎 -> 335 💎)');

// Paimon Jackpot (160)
newTotal = worldEngine.awardPrimogems('sock_angler', 160);
assert.strictEqual(newTotal, 495, '495 after Paimon jackpot');
console.log('✅ 5★ Acil Durum Yiyeceği Paimon! yakalandı (+160 💎 Jackpot -> 495 💎)');

// Verify Gacha Engine sync
const savedUser = mockGachaEngine.getOrCreateUser('FisherKing');
assert.strictEqual(savedUser.primogems, 495, 'Gacha database correctly updated');
console.log('✅ Gacha veritabanı Primogem eşitlemesi başarılı!');

// Chat bubble test
const bubble = worldEngine.addChatBubble('sock_angler', '🎣 ✨🧚 Acil Durum Yiyeceği Paimon! (+160💎)');
assert.strictEqual(bubble.text, '🎣 ✨🧚 Acil Durum Yiyeceği Paimon! (+160💎)');
assert.strictEqual(p1.speechBubble.text, '🎣 ✨🧚 Acil Durum Yiyeceği Paimon! (+160💎)');
console.log('✅ Nehir balık tutma konuşma balonu ve duyuru testi başarılı!');

console.log('==============================================');
console.log('🎉 BALIK TUTMA VE PRİMOGEM SİSTEMİ %100 GEÇTİ!');
console.log('==============================================');
process.exit(0);
