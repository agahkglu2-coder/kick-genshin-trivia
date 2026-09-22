const assert = require('assert');
const { GameEngine, normalizeText } = require('../src/gameEngine');

console.log('--- TEST 1: Metin Normalizasyonu & Cevap Eşleştirme Testleri ---');

const engine = new GameEngine();

// Test normalizations
assert.strictEqual(normalizeText('Venti!'), 'venti');
assert.strictEqual(normalizeText('Çiçeklenme'), 'ciceklenme');
assert.strictEqual(normalizeText('Iudex Neuvillette'), 'iudex neuvillette');
assert.strictEqual(normalizeText('Şafak Şaraphanesi'), 'safak saraphanesi');
assert.strictEqual(normalizeText('BARBATOS '), 'barbatos');

// Test isAnswerCorrect
assert.strictEqual(engine.isAnswerCorrect('Venti', ['Venti', 'Barbatos']), true);
assert.strictEqual(engine.isAnswerCorrect('venti!', ['Venti', 'Barbatos']), true);
assert.strictEqual(engine.isAnswerCorrect('bence venti', ['Venti', 'Barbatos']), true);
assert.strictEqual(engine.isAnswerCorrect('BARBATOS', ['Venti', 'Barbatos']), true);
assert.strictEqual(engine.isAnswerCorrect('yanlis_cevap', ['Venti', 'Barbatos']), false);
assert.strictEqual(engine.isAnswerCorrect('rex lapis', ['Zhongli', 'Rex Lapis', 'Morax']), true);
assert.strictEqual(engine.isAnswerCorrect('acil durum yemegi', ['Acil durum yemeği']), true);

console.log('✅ Metin normalizasyonu ve cevap eşleştirme testleri başarıyla geçti!');

console.log('--- TEST 2: Soru Havuzu Doğrulama ---');
assert(engine.questions.length >= 50, `Soru sayısı en az 50 olmalı, bulunan: ${engine.questions.length}`);
engine.questions.forEach((q, idx) => {
  assert(q.question && q.question.length > 5, `Soru #${idx+1} metni eksik`);
  assert(Array.isArray(q.answers) && q.answers.length > 0, `Soru #${idx+1} cevabı eksik`);
});
console.log(`✅ ${engine.questions.length} adet Genshin sorusu başarıyla doğrulandı!`);

console.log('--- TEST 3: Oyun Döngüsü ve Kazanan Mekanizması ---');
engine.triggerQuestion(1); // Mondstadt Anemo Archon -> Venti, Barbatos
assert.strictEqual(engine.state, 'ACTIVE');
assert.strictEqual(engine.currentQuestion.id, 1);

let winnerAnnounced = null;
engine.on('winner_declared', (data) => {
  winnerAnnounced = data;
});

// Simulate chat message with wrong answer
engine.handleChatMessage({
  content: 'Zhongli',
  sender: { username: 'Gezgin123' }
});
assert.strictEqual(engine.state, 'ACTIVE', 'Yanlış cevapta durum ACTIVE kalmalı');
assert.strictEqual(winnerAnnounced, null);

// Simulate chat message with correct answer
engine.handleChatMessage({
  content: 'Venti!',
  sender: { username: 'DilucFan', profilePic: 'https://example.com/pic.png' }
});

assert.strictEqual(engine.state, 'WINNER');
assert.notStrictEqual(winnerAnnounced, null);
assert.strictEqual(winnerAnnounced.winner.username, 'DilucFan');
assert.strictEqual(engine.leaderboard['DilucFan'].count, 1);

console.log('✅ Oyun motoru ve chat akışı testleri başarıyla tamamlandı!');
engine.stop();
process.exit(0);
