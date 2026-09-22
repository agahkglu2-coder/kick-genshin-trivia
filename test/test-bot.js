const assert = require('assert');
const { KickBotService } = require('../src/kickBot');
const { GachaEngine } = require('../src/gachaEngine');

console.log('--- TEST 1: KickBotService Temel Başlatma ve Durum ---');
const bot = new KickBotService({
  token: 'test_token_12345678',
  enabled: true,
  chatroomId: 40879165,
  cooldownSeconds: 5
});

const status = bot.getStatus();
assert.strictEqual(status.enabled, true, 'Bot açık olmalı');
assert.strictEqual(status.hasToken, true, 'Token mevcut olmalı');
assert.strictEqual(status.chatroomId, 40879165, 'ChatroomId eşleşmeli');
console.log('✅ Temel bot durumu ve token doğrulaması başarılı!');

console.log('--- TEST 2: Anti-Spam ve Kullanıcı Cooldown Kontrolü ---');
const allowed1 = bot.checkCooldown('DilucGamer');
assert.strictEqual(allowed1, true, 'İlk mesaj gönderimine izin verilmeli');

const allowed2 = bot.checkCooldown('DilucGamer');
assert.strictEqual(allowed2, false, 'Hemen ardından gelen mesaj cooldowna takılmalı');

const allowedOther = bot.checkCooldown('VentiFan');
assert.strictEqual(allowedOther, true, 'Farklı bir kullanıcının mesajına izin verilmeli');
console.log('✅ Cooldown ve anti-spam mekanizması başarılı!');

console.log('--- TEST 3: GachaEngine Bot Komut Yanıtları (!yardim, !pity, !bakiye) ---');
const gacha = new GachaEngine();
let capturedResponses = [];

gacha.on('chat_response', (resp) => {
  capturedResponses.push(resp);
});

// Test !yardim
gacha.handleChatMessage({
  content: '!yardim',
  sender: { username: 'ZerkTester' }
});

assert(capturedResponses.length > 0, '!yardim yanıtı gelmeli');
assert(capturedResponses[0].message.includes('Paimon Bot'), 'Yanıt Paimon Bot rehberini içermeli');
console.log('✅ !yardim komut yanıtı:', capturedResponses[0].message);

// Test !pity
capturedResponses = [];
gacha.handleChatMessage({
  content: '!pity',
  sender: { username: 'ZerkTester' }
});

assert(capturedResponses.length > 0, '!pity yanıtı gelmeli');
assert(capturedResponses[0].message.includes('5★ Garantisi'), 'Yanıt 5★ pity garantisini içermeli');
console.log('✅ !pity komut yanıtı:', capturedResponses[0].message);

// Test !bakiye
capturedResponses = [];
gacha.handleChatMessage({
  content: '!bakiye',
  sender: { username: 'ZerkTester' }
});

assert(capturedResponses.length > 0, '!bakiye yanıtı gelmeli');
assert(capturedResponses[0].message.includes('Primogem:'), 'Yanıt Primogem bakiyesini içermeli');
console.log('✅ !bakiye komut yanıtı:', capturedResponses[0].message);

console.log('--- TEST 4: Bot Mesaj Olayı (Event Emission) ---');
let capturedBotEvent = null;
bot.on('bot_message', (evt) => {
  capturedBotEvent = evt;
});

bot.sendMessage('✨ Paimon Bot test yayını!');
assert(capturedBotEvent !== null, 'bot_message olayı fırlatılmalı');
assert.strictEqual(capturedBotEvent.content, '✨ Paimon Bot test yayını!');
console.log('✅ Bot mesaj olayı başarıyla yakalandı!');

console.log('========================================================');
console.log('🎉 TÜM KICK BOT ENTEGRASYON TESTLERİ BAŞARIYLA GEÇTİ!');
console.log('========================================================');
