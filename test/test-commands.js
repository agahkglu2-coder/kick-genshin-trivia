const assert = require('assert');
const { CommandService, DEFAULT_COMMANDS } = require('../src/commandService');

console.log('--- TEST 1: CommandService Başlatma & Varsayılan Komutlar ---');
const cmdService = new CommandService();
const list = cmdService.init([]);

assert(list.length >= 6, 'En az 6 varsayılan komut olmalı');
assert(list.some(c => c.name === '!bot'), '!bot komutu mevcut olmalı');
assert(list.some(c => c.name === '!dc'), '!dc komutu mevcut olmalı');
assert(list.some(c => c.name === '!komutlar'), '!komutlar komutu mevcut olmalı');
console.log(`✅ Varsayılan komutlar yüklendi (${list.length} adet):`, list.map(c => c.name).join(', '));

console.log('--- TEST 2: !bot ve !dc Tetikleme & Değişken Doldurma ---');
const replyBot = cmdService.processMessage({
  content: '!bot',
  sender: { username: 'ZerkTester' }
}, { channel: 'milka_e' });

assert(replyBot !== null, '!bot yanıtı dönmeli');
assert(replyBot.includes('ZerkTester'), 'Yanıt kullanıcı adını (@ZerkTester) içermeli');
assert(replyBot.includes('MilkaBot'), 'Yanıt MilkaBot adını içermeli');
console.log('✅ !bot yanıtı:', replyBot);

const replyDc = cmdService.processMessage({
  content: '!dc',
  sender: { username: 'ZerkTester' }
});

assert(replyDc !== null, '!dc yanıtı dönmeli');
assert(replyDc.includes('discord.gg/milka'), '!dc yanıtı Discord bağlantısını içermeli');
console.log('✅ !dc yanıtı:', replyDc);

// Test alias !discord
const replyDiscordAlias = cmdService.processMessage({
  content: '!discord',
  sender: { username: 'Gezgin99' }
});
// Note: cooldown may be active for !dc, let's reset cooldowns or wait
console.log('--- TEST 3: Cooldown Koruması ---');
const replyDcSpam = cmdService.processMessage({
  content: '!dc',
  sender: { username: 'Spammer' }
});
assert.strictEqual(replyDcSpam, null, 'Cooldown süresince hemen gelen ikinci istek engellenmeli');
console.log('✅ Cooldown engellemesi başarılı!');

console.log('--- TEST 4: Komut Ekleme, Güncelleme, Silme ---');
const added = cmdService.addCommand({
  name: '!rank',
  response: '🏆 @{user} Yayıncının Valorant rankı: Immortal 2',
  cooldown: 5,
  aliases: ['!derece']
});
assert.strictEqual(added.name, '!rank');

const replyRank = cmdService.processMessage({
  content: '!rank',
  sender: { username: 'TestGamer' }
});
assert(replyRank.includes('Immortal 2'), 'Yeni komut başarıyla yanıt vermeli');
console.log('✅ Yeni komut yanıtı:', replyRank);

// Alias test
const replyRankAlias = cmdService.processMessage({
  content: '!derece',
  sender: { username: 'TestGamer' }
});
// Cooldown check for rank
assert.strictEqual(replyRankAlias, null, 'Yeni komutun cooldownu çalışmalı');

// Update command
cmdService.updateCommand(added.id, { response: '🏆 @{user} Güncel rank: Radiant!' });
cmdService.cooldowns.clear(); // Clear for instant test
const replyRankUpdated = cmdService.processMessage({
  content: '!rank',
  sender: { username: 'TestGamer' }
});
assert(replyRankUpdated.includes('Radiant!'), 'Güncellenen yanıt dönmeli');
console.log('✅ Güncellenen komut yanıtı:', replyRankUpdated);

// Delete command
cmdService.deleteCommand(added.id);
const replyRankDeleted = cmdService.processMessage({
  content: '!rank',
  sender: { username: 'TestGamer' }
});
assert.strictEqual(replyRankDeleted, null, 'Silinen komut çalışmamalı');
console.log('✅ Silme işlemi başarılı!');

console.log('--- TÜM COMMAND SERVICE TESTLERİ BAŞARIYLA GEÇTİ! ---');
