const assert = require('assert');
const { GameEngine, normalizeText } = require('../src/gameEngine');

console.log('--- Testing Turkish Spelling Trivia & Strict Matching ---');

const engine = new GameEngine();

// 1. Verify pool loading
assert.ok(engine.turkishQuestions.length >= 90, `Expected at least 90 Turkish questions, got ${engine.turkishQuestions.length}`);
console.log(`✓ Turkish questions loaded: ${engine.turkishQuestions.length}`);

// 2. Test Trivia Modes
assert.strictEqual(engine.config.triviaMode, 'genshin');
const setTurk = engine.setTriviaMode('turkish');
assert.strictEqual(setTurk.success, true);
assert.strictEqual(engine.config.triviaMode, 'turkish');
assert.strictEqual(engine.questions.length, engine.turkishQuestions.length);
console.log(`✓ Mode switched to 'turkish' (${engine.questions.length} questions)`);

const setMixed = engine.setTriviaMode('mixed');
assert.strictEqual(setMixed.success, true);
assert.strictEqual(engine.config.triviaMode, 'mixed');
assert.strictEqual(engine.questions.length, engine.genshinQuestions.length + engine.generalQuestions.length + engine.turkishQuestions.length);
console.log(`✓ Mode switched to 'mixed' (${engine.questions.length} questions)`);

// Switch back to turkish for testing
engine.setTriviaMode('turkish');

// 3. Test Strict Matching
const qHerkes = engine.turkishQuestions.find(q => q.answers.includes('herkes'));
assert.ok(qHerkes, 'qHerkes found');
assert.strictEqual(engine.isAnswerCorrect('herkes', qHerkes.answers, qHerkes), true, 'herkes should match');
assert.strictEqual(engine.isAnswerCorrect('herkez', qHerkes.answers, qHerkes), false, 'herkez must NOT match');
assert.strictEqual(engine.isAnswerCorrect('bence herkes', qHerkes.answers, qHerkes), true, 'bence herkes should match');
assert.strictEqual(engine.isAnswerCorrect('bence herkez', qHerkes.answers, qHerkes), false, 'bence herkez must NOT match');
assert.strictEqual(engine.isAnswerCorrect('HERKES', qHerkes.answers, qHerkes), true, 'Case-insensitive HERKES should match');
assert.strictEqual(engine.isAnswerCorrect('herkestir', qHerkes.answers, qHerkes), true, 'Suffix herkestir should match');
assert.strictEqual(engine.isAnswerCorrect('herkezdir', qHerkes.answers, qHerkes), false, 'Suffix herkezdir must NOT match');
console.log('✓ Strict matching: herkes / herkez verified!');

const qYalniz = engine.turkishQuestions.find(q => q.answers.includes('yalnız') || q.answers.includes('yalniz'));
assert.ok(qYalniz, 'qYalniz found');
assert.strictEqual(engine.isAnswerCorrect('yalnız', qYalniz.answers, qYalniz), true, 'yalnız should match');
assert.strictEqual(engine.isAnswerCorrect('yalniz', qYalniz.answers, qYalniz), true, 'yalniz should match');
assert.strictEqual(engine.isAnswerCorrect('yanlız', qYalniz.answers, qYalniz), false, 'yanlız must NOT match');
assert.strictEqual(engine.isAnswerCorrect('yanliz', qYalniz.answers, qYalniz), false, 'yanliz must NOT match');
console.log('✓ Strict matching: yalnız / yanlız verified!');

const qArtArda = engine.turkishQuestions.find(q => q.answers.includes('art arda'));
assert.ok(qArtArda, 'qArtArda found');
assert.strictEqual(engine.isAnswerCorrect('art arda', qArtArda.answers, qArtArda), true, 'art arda should match');
assert.strictEqual(engine.isAnswerCorrect('artarda', qArtArda.answers, qArtArda), false, 'artarda must NOT match');
assert.strictEqual(engine.isAnswerCorrect('ard arda', qArtArda.answers, qArtArda), false, 'ard arda must NOT match');
assert.strictEqual(engine.isAnswerCorrect('bence art arda kesin', qArtArda.answers, qArtArda), true, 'bence art arda kesin should match');
console.log('✓ Strict matching: art arda / artarda verified!');

const qOrijinal = engine.turkishQuestions.find(q => q.answers.includes('orijinal'));
assert.ok(qOrijinal, 'qOrijinal found');
assert.strictEqual(engine.isAnswerCorrect('orijinal', qOrijinal.answers, qOrijinal), true, 'orijinal should match');
assert.strictEqual(engine.isAnswerCorrect('orjinal', qOrijinal.answers, qOrijinal), false, 'orjinal must NOT match');
console.log('✓ Strict matching: orijinal / orjinal verified!');

const qTiras = engine.turkishQuestions.find(q => q.answers.includes('tıraş') || q.answers.includes('tiras'));
assert.ok(qTiras, 'qTiras found');
assert.strictEqual(engine.isAnswerCorrect('tıraş', qTiras.answers, qTiras), true, 'tıraş should match');
assert.strictEqual(engine.isAnswerCorrect('traş', qTiras.answers, qTiras), false, 'traş must NOT match');
console.log('✓ Strict matching: tıraş / traş verified!');

// 4. Verify existing standard questions still work with typo tolerance
assert.strictEqual(engine.isAnswerCorrect('Venti', ['Venti']), true);
assert.strictEqual(engine.isAnswerCorrect('ventidir', ['Venti']), true);
assert.strictEqual(engine.isAnswerCorrect('neuvillete', ['Neuvillette']), true); // fuzzy match still active for non-strict

// 5. Verify Burak1206 Easter Egg detection logic
function checkEasterEgg(username, question, triviaMode) {
  const isTurkish = triviaMode === 'turkish' ||
                    (question && (
                      question.category === 'Türkçe' ||
                      question.category === 'Türkçe (Yazım)' ||
                      question.strictMatch ||
                      question.poolMode === 'turkish'
                    ));
  const isBurak = username.toLowerCase() === 'burak1206';
  return isTurkish && isBurak;
}

assert.strictEqual(checkEasterEgg('Burak1206', qHerkes, 'turkish'), true, 'Burak1206 on Turkish question should trigger easter egg');
assert.strictEqual(checkEasterEgg('burak1206', qHerkes, 'turkish'), true, 'burak1206 (lowercase) on Turkish question should trigger easter egg');
assert.strictEqual(checkEasterEgg('Burak1206', { category: 'Archonlar' }, 'genshin'), false, 'Burak1206 on Genshin question should NOT trigger easter egg');
assert.strictEqual(checkEasterEgg('Ahmet', qHerkes, 'turkish'), false, 'Other user on Turkish question should NOT trigger easter egg');
console.log('✓ Burak1206 Easter Egg logic verified!');

// 6. Test gameEngine live question trigger & winner declaration
let announcedWinner = null;
engine.on('winner_declared', (data) => {
  announcedWinner = data;
});

engine.setTriviaMode('turkish');
engine.triggerQuestion(qHerkes.id);
assert.strictEqual(engine.state, 'ACTIVE');

// Answer as Burak1206
engine.handleChatMessage({
  content: 'herkes',
  sender: { username: 'Burak1206' }
});

assert.strictEqual(engine.state, 'WINNER');
assert.ok(announcedWinner);
assert.strictEqual(announcedWinner.winner.username, 'Burak1206');
console.log('✓ Full Turkish question & winner cycle verified!');

console.log('--- All Turkish Trivia Tests Passed Successfully! ---');
process.exit(0);
