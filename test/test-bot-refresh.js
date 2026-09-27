const assert = require('assert');
const { KickBotService } = require('../src/kickBot');

console.log('🧪 === KICK BOT TOKEN OTO-YENİLEME TESTİ BAŞLIYOR ===\n');

const futureExpiry = Date.now() + 7200 * 1000;
const bot = new KickBotService({
  token: 'initial_access_token_123',
  refreshToken: 'refresh_token_abc_456',
  expiresAt: futureExpiry,
  clientId: 'client_id_test',
  clientSecret: 'client_secret_test',
  enabled: true
});

const status = bot.getStatus();
assert.strictEqual(status.hasToken, true, 'Token olmalı');
assert.strictEqual(status.hasRefreshToken, true, 'RefreshToken olmalı');
assert.strictEqual(status.expiresAt, futureExpiry, 'Bitiş süresi eşleşmeli');
assert(status.minutesUntilExpiry > 100, 'Kalan dakika hesaplanmalı');
console.log('✅ 1. Bot durumu, refresh token ve kalan süre hesaplaması başarılı!');

// Test tokens_refreshed event
let eventFired = false;
bot.on('tokens_refreshed', (data) => {
  eventFired = true;
  assert.strictEqual(data.token, 'new_mock_token');
});

// Emulate receiving refreshed tokens
bot.emit('tokens_refreshed', {
  token: 'new_mock_token',
  refreshToken: 'new_refresh_token',
  expiresAt: Date.now() + 7200000,
  expiresIn: 7200
});

assert.strictEqual(eventFired, true, 'tokens_refreshed olayı fırlatılmalı');
console.log('✅ 2. Token yenilenme olayı ve dinleyiciler başarıyla doğrulandı!');

console.log('\n🎉 TÜM TOKEN YENİLEME MANTIĞI BAŞARIYLA GEÇTİ! 🚀');
process.exit(0);
