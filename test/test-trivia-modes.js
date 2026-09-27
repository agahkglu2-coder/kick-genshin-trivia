const { GameEngine, normalizeText } = require('../src/gameEngine');
const path = require('path');
const fs = require('fs');

console.log('🧪 === GENEL KÜLTÜR & ÇİFT MOD TESTLERİ BAŞLIYOR ===\n');

// 1. Dual Pool Load Test
console.log('--- TEST 1: Soru Havuzlarının Yüklenmesi ---');
const engine = new GameEngine();

if (engine.genshinQuestions.length >= 250) {
  console.log(`✅ Genshin Soru Havuzu Yüklendi: ${engine.genshinQuestions.length} soru`);
} else {
  console.error(`❌ Genshin havuzu eksik: ${engine.genshinQuestions.length}`);
  process.exit(1);
}

if (engine.generalQuestions.length >= 200) {
  console.log(`✅ Genel Kültür Soru Havuzu Yüklendi: ${engine.generalQuestions.length} soru`);
} else {
  console.error(`❌ Genel Kültür havuzu eksik: ${engine.generalQuestions.length}`);
  process.exit(1);
}

// 2. Mode Switching to 'general'
console.log('\n--- TEST 2: Genel Kültür Moduna Geçiş ---');
const genRes = engine.setTriviaMode('general');
if (genRes.mode === 'general' && genRes.activeCount === engine.generalQuestions.length) {
  console.log(`✅ Genel Kültür moduna başarıyla geçildi (${genRes.activeCount} soru aktif)`);
} else {
  console.error('❌ Genel Kültür moduna geçilemedi:', genRes);
  process.exit(1);
}

// Check state
const fullStateGen = engine.getFullState();
if (fullStateGen.triviaMode === 'general' && fullStateGen.stats.activeCount === engine.generalQuestions.length) {
  console.log('✅ getFullState() Genel Kültür modunu ve istatistikleri doğru döndürüyor');
} else {
  console.error('❌ getFullState() Genel Kültür modunda hatalı:', fullStateGen);
  process.exit(1);
}

// Trigger question in general mode
engine.triggerQuestion(1);
const currQ = engine.currentQuestion;
console.log(`Soru (#${currQ.id}): "${currQ.question}" (Kategori: ${currQ.category})`);

let winnerEventFired = false;
let winnerData = null;
engine.on('winner_declared', (data) => {
  winnerEventFired = true;
  winnerData = data;
});

// Chat answer test
engine.handleChatMessage({
  sender: { username: 'BilgiKupu' },
  content: currQ.answers[0]
});

if (winnerEventFired && winnerData && winnerData.winner.username === 'BilgiKupu') {
  console.log(`✅ Genel Kültür sorusu chatten doğru cevaplandı! Kazanan: ${winnerData.winner.username}`);
} else {
  console.error('❌ Kazanan tespit edilemedi!');
  process.exit(1);
}

// 3. Mixed Mode Test
console.log('\n--- TEST 3: Karışık (Mixed) Mod Testi ---');
const mixedRes = engine.setTriviaMode('mixed');
const expectedTotal = engine.genshinQuestions.length + engine.generalQuestions.length;
if (mixedRes.mode === 'mixed' && mixedRes.activeCount === expectedTotal) {
  console.log(`✅ Karışık moda başarıyla geçildi: Toplam ${mixedRes.activeCount} soru aktif (${engine.genshinQuestions.length} Genshin + ${engine.generalQuestions.length} Genel Kültür)`);
} else {
  console.error(`❌ Karışık mod soru sayısı hatalı. Beklenen: ${expectedTotal}, Alınan: ${mixedRes.activeCount}`);
  process.exit(1);
}

// 4. Return to Genshin Mode
console.log('\n--- TEST 4: Genshin Moduna Geri Dönüş ---');
const genshinRes = engine.setTriviaMode('genshin');
if (genshinRes.mode === 'genshin' && genshinRes.activeCount === engine.genshinQuestions.length) {
  console.log(`✅ Genshin moduna başarıyla dönüldü (${genshinRes.activeCount} soru aktif)`);
} else {
  console.error('❌ Genshin moduna dönülemedi:', genshinRes);
  process.exit(1);
}

engine.stop();
console.log('\n🎉 TÜM GENEL KÜLTÜR & ÇİFT MOD TESTLERİ BAŞARIYLA GEÇTİ! 🚀');
process.exit(0);
