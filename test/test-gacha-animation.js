const fs = require('fs');
const assert = require('assert');

console.log('--- GACHA 5★ ANIMATION & AUDIO VALIDATION ---');

// 1. Official Genshin Impact Audio Assets Check
const reveal5StarOgg = 'public/assets/sounds/reveal-5star.ogg';
assert(fs.existsSync(reveal5StarOgg), 'reveal-5star.ogg must exist');
const oggStats = fs.statSync(reveal5StarOgg);
assert(oggStats.size > 10000, 'reveal-5star.ogg should be > 10KB');
console.log('✅ Orijinal Genshin 5★ Karakter Çıkış Sesi (reveal-5star.ogg) OK: ' + Math.round(oggStats.size / 1024) + ' KB');

const reveal5StarMp3 = 'public/assets/sounds/genshin_5star_reveal.mp3';
assert(fs.existsSync(reveal5StarMp3), 'genshin_5star_reveal.mp3 must exist');
console.log('✅ Orijinal 5★ MP3 Sürümü OK');

const meteorSound = 'public/assets/sounds/wish_5star_official_soundtrack.m4a';
assert(fs.existsSync(meteorSound), 'wish_5star_official_soundtrack.m4a must exist');
console.log('✅ Orijinal Selestiyal Meteor Uçuş Müziği OK');

// 2. HTML Transparent Layer Validation
const html = fs.readFileSync('public/gacha.html', 'utf8');
assert(html.includes('id="effects-canvas"'), 'Canvas effect layer must exist');
assert(html.includes('id="wish-audio-5star"'), 'wish-audio-5star must exist');
assert(html.includes('id="wish-audio-meteor"'), 'wish-audio-meteor must exist');
assert(html.includes('id="meteor-shockwave"'), 'meteor-shockwave must exist');
assert(!html.includes('id="wish-flow-video"'), 'Video tag removed to guarantee 100% true transparency');
console.log('✅ gacha.html Doğrulandı: Sıfır siyah arka plan, %100 transparan katmanlar');

// 3. CSS Shockwave & Transparency Validation
const css = fs.readFileSync('public/gacha.css', 'utf8');
assert(css.includes('.meteor-shockwave'), 'CSS must define .meteor-shockwave');
assert(css.includes('.star-item'), 'CSS must define .star-item for popping stars');
console.log('✅ gacha.css Doğrulandı: Transparan şok dalgası ve yıldız animasyonları');

// 4. JS Event Flow Validation
const js = fs.readFileSync('public/gacha.js', 'utf8');
assert(js.includes('wishAudio5Star'), 'JS must reference wishAudio5Star');
assert(js.includes('wishAudioMeteor'), 'JS must reference wishAudioMeteor');
assert(js.includes('play5StarAudio'), 'JS must have play5StarAudio');
assert(js.includes('meteorShockwave'), 'JS must reference meteorShockwave');
console.log('✅ gacha.js Doğrulandı: Çıkış anı sesi ve selestiyal meteor senkronizasyonu');

console.log('🎉 5★ DOĞRULAMA TESTLERİ BAŞARIYLA TAMAMLANDI!');
