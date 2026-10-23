const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const { KickClient, cleanChannelSlug } = require('./kickClient');
const { KickBotService } = require('./kickBot');
const { GameEngine } = require('./gameEngine');
const { GachaEngine } = require('./gachaEngine');
const { db } = require('./db');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.warn('[Server] config.json okunamadı, varsayılanlar kullanılıyor.');
    return {
      channel: 'mylune',
      botTargetChannel: 'mylune',
      intervalMinutes: 10,
      questionDurationSeconds: 45,
      winnerDisplaySeconds: 12,
      leaderboardCooldownSeconds: 60,
      gameMode: 'first_correct',
      triviaMode: 'genshin',
      port: 3000,
      soundEnabled: true,
      botEnabled: true,
      botToken: ''
    };
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Server] config.json kaydedilemedi:', e);
  }
}

const DEFAULT_CHATTER_CONFIG = {
  enabled: true,
  scale: 3.2,
  groundY: 920,
  groundDepth: 60,
  moveSpeed: 1.0,
  fontSizeMultiplier: 1.35,
  despawnTimeout: 900,
  maxChatters: 45,
  chatBubbleDuration: 5.5,
  showNameplates: true,
  showShadows: true,
  enableInteractions: true,
  enableCommands: true,
  vipOverrides: {}
};

const config = loadConfig();
config.chatterConfig = { ...DEFAULT_CHATTER_CONFIG, ...(config.chatterConfig || {}) };
const app = express();
app.enable('trust proxy');
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

// Disable caching so OBS Studio CEF browser always fetches latest assets
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Route Dedicated OBS Sources
app.get(['/trivia.html', '/trivia', '/obs.html', '/obs', '/overlay.html', '/overlay'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'trivia.html'));
});

app.get(['/gacha.html', '/gacha', '/wish.html', '/wish'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'gacha.html'));
});

// Route Dedicated Pixel Chatter OBS Overlay
app.get(['/chatter.html', '/chatter', '/chatter-overlay.html', '/chatter-overlay'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'chatter.html'));
});

// Route Dedicated Community Jackpot / Pool OBS Overlay
app.get(['/jackpot.html', '/jackpot', '/pool.html', '/pool', '/kumbara.html', '/kumbara'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'jackpot.html'));
});

// Local Asset Cache Proxy for high-res Genshin Splash Art and Icons
const ASSET_CACHE_DIR = path.join(__dirname, '..', 'public', 'assets', 'genshin_cache');
if (!fs.existsSync(ASSET_CACHE_DIR)) {
  fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
}

app.get('/api/asset-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  const safeFilename = targetUrl.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cachedFilePath = path.join(ASSET_CACHE_DIR, safeFilename);

  if (fs.existsSync(cachedFilePath)) {
    return res.sendFile(cachedFilePath);
  }

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!fetchRes.ok) {
      return res.status(fetchRes.status).send('Upstream fetch failed');
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(cachedFilePath, buffer);

    const contentType = fetchRes.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(buffer);
  } catch (err) {
    console.error('[AssetProxy] Hata:', err.message);
    res.status(502).send('Proxy error');
  }
});

app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false
}));

// Initialize Services
const kickClient = new KickClient();
const kickBot = new KickBotService({
  token: config.botToken || '',
  refreshToken: config.botRefreshToken || '',
  expiresAt: config.botTokenExpiresAt || 0,
  clientId: config.botClientId || '',
  clientSecret: config.botClientSecret || '',
  redirectUri: config.botRedirectUri || '',
  botUsername: config.botUsername || null,
  enabled: config.botEnabled !== false,
  cooldownSeconds: 8
});

// Automatically persist refreshed tokens to config and database
kickBot.on('tokens_refreshed', async (data) => {
  config.botToken = data.token;
  config.botRefreshToken = data.refreshToken;
  config.botTokenExpiresAt = data.expiresAt;
  saveConfig(config);
  await db.setSetting('botToken', data.token);
  await db.setSetting('botRefreshToken', data.refreshToken);
  await db.setSetting('botTokenExpiresAt', data.expiresAt);
  broadcast({
    type: 'BOT_TOKENS_REFRESHED',
    token: data.token,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    status: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || '',
      targetChannel: config.botTargetChannel || config.channel || '',
      expiresAt: data.expiresAt
    }
  });
});

// Pre-fill KickBot channel & broadcaster ID if known
let knownChannels = {};
try {
  const KNOWN_CHANNELS_PATH = path.join(__dirname, '..', 'data', 'known_channels.json');
  if (fs.existsSync(KNOWN_CHANNELS_PATH)) {
    knownChannels = JSON.parse(fs.readFileSync(KNOWN_CHANNELS_PATH, 'utf-8'));
    const curChan = (config.channel || 'mylune').toLowerCase();
    if (knownChannels[curChan]) {
      if (knownChannels[curChan].chatroomId) kickBot.setChatroomId(knownChannels[curChan].chatroomId);
      if (knownChannels[curChan].broadcasterUserId) kickBot.setBroadcasterUserId(knownChannels[curChan].broadcasterUserId);
      console.log(`[KickBot] Başlangıç kanalı '${curChan}' kimlikleri yüklendi: Chatroom #${knownChannels[curChan].chatroomId}, User #${knownChannels[curChan].broadcasterUserId}`);
    }
  }
} catch (e) {
  console.warn('[Server] known_channels.json okunamadı:', e.message);
}

const gameEngine = new GameEngine(config);
const gachaEngine = new GachaEngine();
const { TimerService } = require('./timerService');
const timerService = new TimerService({ kickBot, db });
const { CommandService } = require('./commandService');
const commandService = new CommandService({ kickBot, db });

// Initialize commandService immediately from config.customCommands or file fallback
// (prevents empty commands or stale defaults during async db.init)
commandService.init(config.customCommands || null);
const { BossEngine } = require('./bossEngine');
const bossEngine = new BossEngine({ gachaEngine, kickBot, db });
const { ExpeditionEngine } = require('./expeditionEngine');
const expeditionEngine = new ExpeditionEngine({ gachaEngine, kickBot });

// Initialize persistent database (PostgreSQL or local fallback)
db.init(process.env.DATABASE_URL || config.databaseUrl).then(async () => {
  const savedTimers = db.getSetting('timed_messages');
  timerService.init(savedTimers || []);

  const savedCommands = db.getSetting('custom_commands');
  if (Array.isArray(savedCommands) && savedCommands.length > 0) {
    commandService.init(savedCommands);
  } else if (commandService.commands && commandService.commands.length > 0) {
    // Migrate current active commands into DB so newly connected DB preserves them
    await db.setSetting('custom_commands', commandService.commands);
  }
  bossEngine.setDb(db);

  const savedToken = db.getSetting('botToken');
  const savedRefreshToken = db.getSetting('botRefreshToken');
  const savedExpiresAt = db.getSetting('botTokenExpiresAt');
  const savedBotUser = db.getSetting('botUsername');
  const savedBotEnabled = db.getSetting('botEnabled');
  const savedClientId = db.getSetting('botClientId');
  const savedClientSecret = db.getSetting('botClientSecret');
  const savedRedirectUri = db.getSetting('botRedirectUri');
  const savedTargetChan = db.getSetting('botTargetChannel');
  const savedChan = db.getSetting('channel');

  if (savedClientId) config.botClientId = savedClientId;
  if (savedClientSecret) config.botClientSecret = savedClientSecret;
  if (savedRedirectUri) config.botRedirectUri = savedRedirectUri;
  if (savedRefreshToken) config.botRefreshToken = savedRefreshToken;
  if (savedExpiresAt) config.botTokenExpiresAt = parseInt(savedExpiresAt, 10) || 0;

  if (savedToken) {
    config.botToken = savedToken;
  } else if (config.botToken) {
    await db.setSetting('botToken', config.botToken);
  }

  if (savedBotUser) {
    config.botUsername = savedBotUser;
  }

  kickBot.setCredentials({
    token: config.botToken || '',
    refreshToken: config.botRefreshToken || '',
    expiresAt: config.botTokenExpiresAt || 0,
    clientId: config.botClientId || '',
    clientSecret: config.botClientSecret || '',
    redirectUri: config.botRedirectUri || '',
    botUsername: config.botUsername || null
  });

  if (savedBotEnabled !== undefined && savedBotEnabled !== null) {
    config.botEnabled = Boolean(savedBotEnabled);
    kickBot.setEnabled(Boolean(savedBotEnabled));
  } else if (config.botEnabled !== undefined) {
    kickBot.setEnabled(Boolean(config.botEnabled));
  }

  // If token is missing/expired but refresh_token is available, automatically refresh!
  if (config.botRefreshToken && config.botClientId && config.botClientSecret) {
    const remainingMs = (config.botTokenExpiresAt || 0) - Date.now();
    if (!config.botToken || remainingMs < 15 * 60 * 1000) {
      console.log('[Server] 🔄 Başlangıçta token süresi dolmuş veya dolmak üzere. Otomatik yenileniyor...');
      kickBot.refreshAccessToken().catch(console.error);
    }
  }


  if (savedTargetChan && savedTargetChan !== 'milka_e') {
    config.botTargetChannel = savedTargetChan;
  } else {
    config.botTargetChannel = 'mylune';
  }

  if (savedChan && savedChan !== 'milka_e') {
    config.channel = savedChan;
    gameEngine.updateConfig({ channel: savedChan });
  } else {
    config.channel = 'mylune';
    gameEngine.updateConfig({ channel: 'mylune' });
  }

  const activeChan = (config.botTargetChannel || config.channel || 'mylune').toLowerCase();
  if (knownChannels[activeChan]) {
    if (knownChannels[activeChan].chatroomId) kickBot.setChatroomId(knownChannels[activeChan].chatroomId);
    if (knownChannels[activeChan].broadcasterUserId) kickBot.setBroadcasterUserId(knownChannels[activeChan].broadcasterUserId);
    console.log(`[KickBot] Kalıcı kanal '${activeChan}' kimlikleri bağlandı: Chatroom #${knownChannels[activeChan].chatroomId}, User #${knownChannels[activeChan].broadcasterUserId}`);
  }

  if (gachaEngine) {
    gachaEngine.loadData();
    gachaEngine.emit('jackpot_updated', {
      pool: gachaEngine.jackpotPool,
      exactPool: Number(gachaEngine.jackpotPool).toFixed(2),
      totalAccumulated: gachaEngine.jackpotTotalAccumulated,
      reason: 'DB_INIT',
      timestamp: Date.now()
    });
  }
}).catch(console.error);

let kickStatus = {
  connected: false,
  channel: config.channel || '',
  chatroomId: null,
  broadcasterUserId: null,
  message: 'Bağlantı henüz başlatılmadı.'
};

// Broadcast WebSocket message to all connected clients (overlays & admin panels)
function broadcast(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Kick Client Events
kickClient.on('status', (status) => {
  kickStatus = { ...kickStatus, ...status };
  if (status.chatroomId) {
    kickBot.setChatroomId(status.chatroomId);
  }
  if (status.broadcasterUserId) {
    kickBot.setBroadcasterUserId(status.broadcasterUserId);
  }
  broadcast({ type: 'KICK_STATUS', status: kickStatus });
});

kickClient.on('message', async (chatMsg) => {
  // Feed to GameEngine for answer checking
  try {
    gameEngine.handleChatMessage(chatMsg);
  } catch (err) {
    console.error('[Server] GameEngine handleChatMessage hatası:', err);
  }

  // Feed to GachaEngine for Primogem rewards & commands (!wish, !bakiye, !envanter, etc.)
  try {
    gachaEngine.handleChatMessage(chatMsg);
  } catch (err) {
    console.error('[Server] GachaEngine handleChatMessage hatası:', err);
  }

  // Feed to BossEngine for World Boss Raid (!katil, !kalkan, !ulti, etc.)
  try {
    bossEngine.handleChatMessage(chatMsg);
  } catch (err) {
    console.error('[Server] BossEngine handleChatMessage hatası:', err);
  }

  // Broadcast to admin dashboard chat preview
  broadcast({
    type: 'CHAT_MESSAGE',
    message: {
      username: chatMsg.sender?.username,
      content: chatMsg.content,
      profilePic: chatMsg.sender?.profilePic,
      createdAt: chatMsg.createdAt
    }
  });

    // Forward to Pixel Chatter Overlay
    try {
      const rawUser = (chatMsg.sender?.username || 'Viewer').trim();
      const vipAv = (config.chatterConfig && config.chatterConfig.vipOverrides && config.chatterConfig.vipOverrides[rawUser.toLowerCase()]) || null;
      broadcast({
        type: 'CHATTER_CHAT',
        user: rawUser,
        text: chatMsg.content,
        avatarId: vipAv
      });

      // Check for Chatter Action Commands if enabled
      if (config.chatterConfig?.enableCommands !== false) {
        const textLower = (chatMsg.content || '').trim().toLowerCase();
        if (textLower === '!zipla' || textLower === '!zıpla' || textLower === '!jump') {
          broadcast({ type: 'CHATTER_ACTION', action: 'jump', user: rawUser });
        } else if (textLower === '!dans' || textLower === '!dance') {
          broadcast({ type: 'CHATTER_ACTION', action: 'dance', user: rawUser });
        } else if (textLower === '!uyu' || textLower === '!sleep') {
          broadcast({ type: 'CHATTER_ACTION', action: 'sleep', user: rawUser });
        } else if (textLower === '!uyan' || textLower === '!wake') {
          broadcast({ type: 'CHATTER_ACTION', action: 'wake', user: rawUser });
        } else if (textLower === '!sev' || textLower === '!love' || textLower === '!piko') {
          broadcast({ type: 'CHATTER_ACTION', action: 'love', user: rawUser });
        } else if (textLower.startsWith('!saril') || textLower.startsWith('!sarıl') || textLower.startsWith('!hug')) {
          const match = textLower.match(/^!(?:saril|sarıl|hug)\s+@?([a-zA-Z0-9_\u00C0-\u017F]+)/);
          if (match && match[1]) {
            broadcast({ type: 'CHATTER_ACTION', action: 'hug', fromUser: rawUser, toUser: match[1] });
          }
        } else if (textLower.startsWith('!duello') || textLower.startsWith('!düello') || textLower.startsWith('!duel') || textLower.startsWith('!fight')) {
          const match = textLower.match(/^!(?:duello|düello|duel|fight)\s+@?([a-zA-Z0-9_\u00C0-\u017F]+)/);
          if (match && match[1]) {
            broadcast({ type: 'CHATTER_ACTION', action: 'duel', fromUser: rawUser, toUser: match[1] });
          }
        } else if (textLower === '!balik' || textLower === '!balık' || textLower === '!fish' || textLower === '!balikci' || textLower === '!balıkçı') {
          const expRes = expeditionEngine.startExpedition(rawUser, 'fishing');
          if (kickBot && kickBot.enabled && expRes.message) {
            kickBot.sendMessage(expRes.message);
          }
        } else if (textLower === '!maden' || textLower === '!mine' || textLower === '!madenci') {
          const expRes = expeditionEngine.startExpedition(rawUser, 'mining');
          if (kickBot && kickBot.enabled && expRes.message) {
            kickBot.sendMessage(expRes.message);
          }
        } else if (textLower === '!sefer' || textLower === '!gorev' || textLower === '!görev' || textLower === '!expedition') {
          const st = expeditionEngine.getStatus(rawUser);
          if (kickBot && kickBot.enabled && st.message) {
            kickBot.sendMessage(st.message);
          }
        } else if (textLower === '!topla' || textLower === '!claim') {
          const cl = expeditionEngine.claimExpedition(rawUser);
          if (kickBot && kickBot.enabled && cl.message) {
            kickBot.sendMessage(cl.message);
          }
        }
      }
    } catch (e) {}

  // Handle Broadcaster/Moderator Bot Commands (!başlık & !oyun)
  try {
    const content = (chatMsg.content || '').trim();
    const senderUser = (chatMsg.sender?.username || '').trim();
    const senderSlug = (chatMsg.sender?.slug || '').trim();
    const badges = chatMsg.sender?.badges || [];

    const isBroadcaster = (
      badges.some(b => {
        const val = ((b && (b.type || b.badge_type || b.text)) || '').toLowerCase();
        return val.includes('broadcaster') || val.includes('yayinci') || val.includes('owner');
      }) ||
      senderUser.toLowerCase() === (config.channel || 'mylune').toLowerCase() ||
      senderSlug.toLowerCase() === (config.channel || 'mylune').toLowerCase() ||
      senderUser.toLowerCase() === (config.botTargetChannel || '').toLowerCase()
    );
    const isModerator = badges.some(b => {
      const val = ((b && (b.type || b.badge_type || b.text)) || '').toLowerCase();
      return val.includes('mod') || val.includes('admin') || val.includes('staff');
    });
    const isAuthorized = isBroadcaster || isModerator;

    // 1. !başlık [yeni başlık] / !baslik / !title (Turkish casing: !BAŞLIK, !Başlık, !baslik)
    const titleMatch = content.match(/^!(?:[bB][aA][şsŞS][lLiIıİ][ıiIİ][kK]|title)(?:\s+(.+))?$/u);
    if (titleMatch) {
      if (!isAuthorized) {
        kickBot.sendMessage(`⚠️ @${senderUser} Başlık değiştirme komutunu yalnızca yayıncı veya moderatörler kullanabilir.`);
      } else {
        const newTitle = (titleMatch[1] || '').trim();
        if (!newTitle) {
          kickBot.sendMessage(`ℹ️ @${senderUser} Kullanım: !başlık <YENİ BAŞLIK>`);
        } else {
          console.log(`[KickBot] Yayın başlığı güncelleme isteği (@${senderUser}): "${newTitle}"`);
          const res = await kickBot.updateChannel({ stream_title: newTitle });
          if (res.success) {
            kickBot.sendMessage(`📢 @${senderUser} Yayın başlığı güncellendi: "${newTitle}"`);
          } else {
            kickBot.sendMessage(`⚠️ @${senderUser} Başlık güncellenemedi: ${res.error}`);
          }
        }
      }
    }

    // 2. !oyun [kategori adı] / !kategori / !game / !category
    const gameMatch = content.match(/^!(?:[oO][yY][uU][nN]|[kK][aA][tT][eE][gG][oO][rR][iİıI]|[gG][aA][mM][eE]|category)(?:\s+(.+))?$/u);
    if (gameMatch) {
      if (!isAuthorized) {
        kickBot.sendMessage(`⚠️ @${senderUser} Kategori değiştirme komutunu yalnızca yayıncı veya moderatörler kullanabilir.`);
      } else {
        const query = (gameMatch[1] || '').trim();
        if (!query) {
          kickBot.sendMessage(`ℹ️ @${senderUser} Kullanım: !oyun <KATEGORİ ADI> (Örn: !oyun valorant, !oyun sohbet, !oyun genshin)`);
        } else {
          console.log(`[KickBot] Kategori arama isteği (@${senderUser}): "${query}"`);
          const cat = await kickBot.findCategory(query);
          if (!cat) {
            kickBot.sendMessage(`⚠️ @${senderUser} "${query}" adında bir Kick kategorisi bulunamadı.`);
          } else {
            console.log(`[KickBot] Kategori güncelleme isteği (@${senderUser}): #${cat.id} - ${cat.name}`);
            const res = await kickBot.updateChannel({ category_id: cat.id });
            if (res.success) {
              kickBot.sendMessage(`🎮 @${senderUser} Yayın kategorisi güncellendi: [${cat.name}]`);
            } else {
              kickBot.sendMessage(`⚠️ @${senderUser} Kategori güncellenemedi: ${res.error}`);
            }
          }
        }
      }
    }

    // 3. Handle Custom Configurable Chat Commands (!bot, !dc, !instagram, etc.)
    const cmdReply = commandService.processMessage(chatMsg, {
      channel: config.channel || 'mylune',
      isAuthorized
    });
    if (cmdReply) {
      kickBot.sendMessage(cmdReply);
      broadcast({
        type: 'CHAT_MESSAGE',
        message: {
          username: kickBot.botUsername || 'MilkaBot',
          content: cmdReply,
          profilePic: null,
          createdAt: new Date().toISOString()
        }
      });
    }
  } catch (err) {
    console.error('[Server] Komut işleme hatası:', err.message);
  }
});


// GameEngine Events
gameEngine.on('state_changed', (state) => {
  broadcast({ type: 'STATE_CHANGED', state });
});

gameEngine.on('tick', (tickData) => {
  broadcast({ type: 'TICK', ...tickData });
});

gameEngine.on('question_started', (qData) => {
  broadcast({ type: 'QUESTION_STARTED', ...qData });
});

gameEngine.on('question_cancelled', () => {
  broadcast({ type: 'QUESTION_CANCELLED' });
});

gameEngine.on('winner_declared', (winData) => {
  if (winData.winner && winData.winner.username) {
    const winnerUser = winData.winner.username;
    gachaEngine.awardTriviaWinner(winnerUser, 60);
    // Announce winner in Kick chat with mode context
    const modeName = winData.triviaMode === 'general' ? 'Genel Kültür' : 'Genshin';
    kickBot.sendMessage(`🎉 Tebrikler @${winnerUser}! ${modeName} sorusunu doğru bilerek +60 Primogem kazandın!`);

    // Award Crown of Wisdom on Pixel Chatter overlay!
    broadcast({
      type: 'CHATTER_CROWN',
      winner: winnerUser
    });
  }
  broadcast({ type: 'WINNER_DECLARED', ...winData });
});

gameEngine.on('trivia_mode_changed', (modeData) => {
  config.triviaMode = modeData.mode;
  saveConfig(config);
  broadcast({ type: 'TRIVIA_MODE_CHANGED', ...modeData, config: gameEngine.config });
});

gameEngine.on('question_timeout', (timeoutData) => {
  broadcast({ type: 'QUESTION_TIMEOUT', ...timeoutData });
});

gameEngine.on('test_preview', (testData) => {
  broadcast({ type: 'TEST_PREVIEW', ...testData });
});

gameEngine.on('show_leaderboard', (leaderboardData) => {
  broadcast({ type: 'SHOW_LEADERBOARD', ...leaderboardData });
});

// GachaEngine Events
gachaEngine.on('wish_result', (wishData) => {
  broadcast({ type: 'WISH_RESULT', ...wishData });
  // Check if 5-star pull occurred -> Award Golden Aura!
  const has5Star = (wishData.results && wishData.results.some(r => r.rarity === 5)) || wishData.item?.rarity === 5;
  if (has5Star && wishData.username) {
    broadcast({
      type: 'CHATTER_AURA',
      user: wishData.username,
      duration: 900 // 15 mins golden starlight aura!
    });
  }

  // Announce wish result in Kick Chat for real-time chatter feedback
  try {
    if (kickBot) {
      const user = wishData.username;
      const remaining = wishData.stats?.primogems !== undefined ? ` (Kalan: ${wishData.stats.primogems} 💎)` : '';

      if (wishData.is10Pull && Array.isArray(wishData.pulls)) {
        const topPull = wishData.featuredPull || wishData.pulls.find(p => p.rarity === 5) || wishData.pulls.find(p => p.rarity === 4) || wishData.pulls[0];
        const has5 = wishData.pulls.some(p => p.rarity === 5);
        if (has5) {
          kickBot.sendMessage(`🌟🌟🌟🌟🌟 @${user} 10'LU DİLEKTE 5★ ${topPull.name.toUpperCase()} ÇIKARDI! TEBRİKLER! 🎉${remaining}`);
        } else if (topPull && topPull.rarity === 4) {
          kickBot.sendMessage(`⭐ @${user} 10'lu dilek çekti! En iyi: [4★] ${topPull.name}! ✨${remaining}`);
        } else {
          kickBot.sendMessage(`🎁 @${user} 10'lu dilek çekti!${remaining} (Mavi silahları eritmek için: !donustur)`);
        }
      } else {
        const pull = wishData.pulls?.[0] || wishData.item;
        if (pull) {
          if (pull.rarity === 5) {
            kickBot.sendMessage(`🌟🌟🌟🌟🌟 TEBRİKLER @${user}! 5★ ${pull.name.toUpperCase()} ÇIKTI! 🎉${remaining}`);
          } else if (pull.rarity === 4) {
            kickBot.sendMessage(`⭐ @${user} 4★ [${pull.name}] kazandı! ✨${remaining}`);
          } else {
            kickBot.sendMessage(`🗡️ @${user} 3★ [${pull.name}] çekti.${remaining} (Demirci için: !donustur)`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[Server] Dilek chat duyurusu hatası:', e.message);
  }
});

gachaEngine.on('primo_rain', (rainData) => {
  broadcast({ type: 'PRIMO_RAIN', ...rainData });
  // Chatters jump for primogems!
  broadcast({ type: 'CHATTER_PRIMO_RAIN' });
});

gachaEngine.on('primo_awarded', (awardData) => {
  broadcast({ type: 'PRIMO_AWARDED', ...awardData });
});

gachaEngine.on('chat_response', (resp) => {
  // Feed to KickBot with anti-spam cooldown check (exempt system warnings)
  const isWarning = Boolean(resp.message && resp.message.startsWith('⚠️'));
  if (resp.username === 'Paimon' || isWarning || kickBot.checkCooldown(resp.username)) {
    kickBot.sendMessage(resp.message);
  }
  broadcast({ type: 'GACHA_CHAT_RESPONSE', ...resp });
});

gachaEngine.on('banner_changed', (bannerData) => {
  broadcast({ type: 'GACHA_BANNER_CHANGED', ...bannerData });
});

gachaEngine.on('banners_updated', (data) => {
  broadcast({ type: 'GACHA_BANNERS_UPDATED', ...data });
});

// Community Jackpot Events
gachaEngine.on('jackpot_updated', (data) => {
  broadcast({ type: 'JACKPOT_UPDATED', ...data });
});

gachaEngine.on('jackpot_won', (data) => {
  broadcast({ type: 'JACKPOT_WON', ...data });
  broadcast({ type: 'CHATTER_CROWN', winner: data.winner });
  broadcast({ type: 'CHATTER_PRIMO_RAIN', count: 40 });
});

gachaEngine.on('jackpot_distributed', (data) => {
  broadcast({ type: 'JACKPOT_DISTRIBUTED', ...data });
  broadcast({ type: 'CHATTER_PRIMO_RAIN', count: 35 });
});

// KickBot Events
kickBot.on('bot_message', (botMsg) => {
  // Add to live chat preview as a verified bot message
  broadcast({
    type: 'CHAT_MESSAGE',
    message: {
      username: '🤖 PaimonBot',
      content: botMsg.content,
      isBot: true,
      sentToKick: botMsg.sentToKick,
      createdAt: botMsg.timestamp
    }
  });
  broadcast({ type: 'BOT_MESSAGE', message: botMsg });
});

// BossEngine Events
bossEngine.on('state_changed', (state) => {
  broadcast({ type: 'BOSS_STATE', state });
});

bossEngine.on('boss_lobby', (data) => {
  broadcast({ type: 'BOSS_LOBBY', ...data });
});

bossEngine.on('battle_started', (data) => {
  broadcast({ type: 'BOSS_BATTLE_STARTED', ...data });
});

bossEngine.on('warrior_joined', (data) => {
  broadcast({ type: 'BOSS_WARRIOR_JOINED', ...data });
});

bossEngine.on('boss_attack', (attackData) => {
  broadcast({ type: 'BOSS_ATTACK', ...attackData });
});

bossEngine.on('tactical_phase_started', (data) => {
  broadcast({ type: 'BOSS_TACTICAL_STARTED', ...data });
});

bossEngine.on('tactical_hit', (data) => {
  broadcast({ type: 'BOSS_TACTICAL_HIT', ...data });
});

bossEngine.on('tactical_success', (data) => {
  broadcast({ type: 'BOSS_TACTICAL_SUCCESS', ...data });
});

bossEngine.on('tactical_fail', (data) => {
  broadcast({ type: 'BOSS_TACTICAL_FAIL', ...data });
});

bossEngine.on('boss_victory', (winData) => {
  if (winData.mvp && winData.mvp.username) {
    broadcast({ type: 'CHATTER_AURA', user: winData.mvp.username, duration: 900 });
  }
  if (winData.lastHit && winData.lastHit.username) {
    broadcast({ type: 'CHATTER_CROWN', winner: winData.lastHit.username });
  }
  broadcast({ type: 'CHATTER_PRIMO_RAIN' });
  broadcast({ type: 'BOSS_VICTORY', ...winData });
});

bossEngine.on('boss_defeat', (defeatData) => {
  broadcast({ type: 'BOSS_DEFEAT', ...defeatData });
});

bossEngine.on('tick', (tickData) => {
  broadcast({ type: 'BOSS_TICK', ...tickData });
});

// Expedition Engine Events
expeditionEngine.on('expedition_started', (data) => {
  broadcast({ ...data, type: 'EXPEDITION_STARTED', expeditionType: data.type });
});

expeditionEngine.on('expedition_completed', (data) => {
  broadcast({ ...data, type: 'EXPEDITION_COMPLETED', expeditionType: data.type });
  broadcast({ type: 'CHATTER_PRIMO_RAIN', count: data.reward?.isJackpot ? 35 : 15 });
});

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  // Send initial full state immediately upon connect
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    gameState: gameEngine.getFullState(),
    activeBanner: gachaEngine.getActiveBanner(),
    banners: gachaEngine.getBannersList(),
    kickStatus: kickStatus,
    botStatus: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || ''
    },
    config: gameEngine.config,
    chatterConfig: config.chatterConfig || {},
    commands: commandService ? commandService.getCommands() : [],
    bossState: bossEngine ? bossEngine.getState() : null,
    expeditions: expeditionEngine ? expeditionEngine.getActiveList() : [],
    jackpot: gachaEngine ? gachaEngine.getJackpotState() : null
  }));

  ws.send(JSON.stringify({
    type: 'CHATTER_CONFIG',
    config: config.chatterConfig || {}
  }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'GET_CHATTER_CONFIG') {
        ws.send(JSON.stringify({
          type: 'CHATTER_CONFIG',
          config: config.chatterConfig || {}
        }));
      } else if (data.type === 'SET_CHATTER_CONFIG' || data.type === 'CHATTER_CONFIG') {
        config.chatterConfig = { ...config.chatterConfig, ...(data.config || {}) };
        saveConfig(config);
        broadcast({ type: 'CHATTER_CONFIG', config: config.chatterConfig });
      } else if (data.type === 'TEST_CHATTER_CHAT' || data.type === 'CHATTER_CHAT') {
        broadcast({ type: 'CHATTER_CHAT', user: data.user, text: data.text, avatarId: data.avatarId });
      } else if (data.type === 'TEST_CHATTER_EVENT' || data.type === 'CHATTER_EVENT') {
        broadcast({ type: 'CHATTER_EVENT', eventType: data.eventType || data.event, user: data.user, amount: data.amount });
      } else if (data.type === 'CHATTER_ACTION') {
        broadcast(data);
      } else if (data.type === 'CHATTER_CROWN') {
        broadcast(data);
      } else if (data.type === 'CHATTER_AURA') {
        broadcast(data);
      } else if (data.type === 'CHATTER_PRIMO_RAIN') {
        broadcast(data);
      } else if (data.type === 'CHATTER_CLEAR') {
        broadcast({ type: 'CHATTER_CLEAR' });
      }
    } catch (e) {}
  });
});

// Pixel Chatter REST Endpoints
app.get('/api/chatter/config', (req, res) => {
  res.json(config.chatterConfig || {});
});

// Expedition REST Endpoints
app.get('/api/expeditions', (req, res) => {
  res.json(expeditionEngine ? expeditionEngine.getActiveList() : []);
});

app.post('/api/expeditions/start', express.json(), (req, res) => {
  const { user, type } = req.body || {};
  const result = expeditionEngine ? expeditionEngine.startExpedition(user || 'Viewer', type || 'fishing') : { success: false };
  res.json(result);
});

app.post('/api/expeditions/claim', express.json(), (req, res) => {
  const { user } = req.body || {};
  const result = expeditionEngine ? expeditionEngine.claimExpedition(user || 'Viewer') : { success: false };
  res.json(result);
});

app.post('/api/chatter/config', express.json(), (req, res) => {
  config.chatterConfig = { ...config.chatterConfig, ...req.body };
  saveConfig(config);
  broadcast({ type: 'CHATTER_CONFIG', config: config.chatterConfig });
  res.json({ success: true, config: config.chatterConfig });
});

app.post('/api/chatter/action', express.json(), (req, res) => {
  const { action, user, fromUser, toUser } = req.body || {};
  broadcast({ type: 'CHATTER_ACTION', action, user, fromUser, toUser });
  res.json({ success: true });
});

app.post('/api/chatter/crown', express.json(), (req, res) => {
  const { winner } = req.body || {};
  broadcast({ type: 'CHATTER_CROWN', winner: winner || 'Champion' });
  res.json({ success: true });
});

app.post('/api/chatter/aura', express.json(), (req, res) => {
  const { user } = req.body || {};
  broadcast({ type: 'CHATTER_AURA', user: user || 'Viewer', duration: 900 });
  res.json({ success: true });
});

app.post('/api/chatter/test-event', express.json(), (req, res) => {
  const { eventType, user, amount } = req.body || {};
  broadcast({ type: 'CHATTER_EVENT', eventType: eventType || 'sub', user: user || 'Viewer', amount });
  res.json({ success: true });
});

app.post('/api/chatter/chat', express.json(), (req, res) => {
  const { user, text, avatarId } = req.body || {};
  broadcast({ type: 'CHATTER_CHAT', user: user || 'Viewer', text: text || 'Hello!', avatarId });
  res.json({ success: true });
});

app.post('/api/chatter/dance-all', express.json(), (req, res) => {
  broadcast({ type: 'CHATTER_DANCE_ALL', duration: req.body?.duration || 8 });
  res.json({ success: true });
});

app.post('/api/chatter/primo-rain', express.json(), (req, res) => {
  broadcast({ type: 'CHATTER_PRIMO_RAIN', count: req.body?.count || 35 });
  res.json({ success: true });
});

app.post('/api/chatter/clear', (req, res) => {
  broadcast({ type: 'CHATTER_CLEAR' });
  res.json({ success: true });
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    gameState: gameEngine.getFullState(),
    kickStatus: kickStatus,
    botStatus: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || ''
    },
    config: gameEngine.config
  });
});

// Lightweight ping endpoint for 24/7 uptime services (e.g. cron-job.org / uptimerobot)
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    db: db.getStatus().type,
    botConnected: kickBot.getStatus().hasToken
  });
});


app.post('/api/trigger-question', (req, res) => {
  const { id } = req.body || {};
  gameEngine.triggerQuestion(id || null);
  res.json({ success: true, message: 'Soru tetiklendi.' });
});

app.post('/api/cancel-question', (req, res) => {
  gameEngine.cancelQuestion();
  res.json({ success: true, message: 'Soru iptal edildi.' });
});

app.post('/api/test-preview', (req, res) => {
  gameEngine.triggerTestPreview();
  res.json({ success: true, message: 'Test önizlemesi gönderildi.' });
});

app.post('/api/show-leaderboard', (req, res) => {
  gameEngine.triggerLeaderboardDisplay('Yayıncı');
  res.json({ success: true, message: 'Sıralama ekrana gönderildi.' });
});

app.get('/api/config', (req, res) => {
  res.json(gameEngine.config);
});

// Dedicated Connect Channel Endpoint
app.post('/api/connect-channel', async (req, res) => {
  const { channel, chatroomId } = req.body || {};
  if ((!channel || !channel.trim()) && !chatroomId) {
    return res.status(400).json({ error: 'Lütfen bir kanal adı veya bağlantısı girin.' });
  }

  const cleaned = cleanChannelSlug(channel);
  console.log(`[Server] Yeni kanal bağlantısı istendi: ${channel} (ID: ${chatroomId || 'auto'}) -> ${cleaned}`);

  if (cleaned) {
    gameEngine.updateConfig({ channel: cleaned });
    config.channel = cleaned;
    saveConfig(config);
    await db.setSetting('channel', cleaned);
  }

  kickClient.connect(cleaned, chatroomId);
  res.json({ success: true, channel: cleaned || `chatroom_${chatroomId}`, chatroomId });
});

app.post('/api/config', async (req, res) => {
  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: 'Geçersiz veri.' });

  const oldChannel = gameEngine.config.channel;
  if (newConfig.channel) {
    newConfig.channel = cleanChannelSlug(newConfig.channel);
    await db.setSetting('channel', newConfig.channel);
  }
  if (newConfig.botTargetChannel) {
    await db.setSetting('botTargetChannel', newConfig.botTargetChannel);
  }

  gameEngine.updateConfig(newConfig);
  saveConfig(gameEngine.config);

  // If channel was supplied, always ensure Kick client connects
  if (newConfig.channel && (newConfig.channel !== oldChannel || !kickClient.isConnected)) {
    kickClient.connect(newConfig.channel, newConfig.chatroomId);
  }

  broadcast({ type: 'CONFIG_UPDATED', config: gameEngine.config });
  res.json({ success: true, config: gameEngine.config });
});

// Trivia Mode Switch Endpoint (Genshin / General / Mixed)
app.post('/api/trivia-mode', (req, res) => {
  const { mode } = req.body || {};
  try {
    const result = gameEngine.setTriviaMode(mode);
    config.triviaMode = mode;
    saveConfig(config);
    broadcast({
      type: 'TRIVIA_MODE_CHANGED',
      mode: gameEngine.config.triviaMode,
      activeCount: result.activeCount,
      stats: gameEngine.getFullState().stats,
      config: gameEngine.config
    });
    res.json({
      success: true,
      mode: gameEngine.config.triviaMode,
      count: result.activeCount,
      stats: gameEngine.getFullState().stats
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/questions', (req, res) => {
  const mode = req.query.mode;
  if (mode === 'genshin') {
    res.json(gameEngine.genshinQuestions);
  } else if (mode === 'general') {
    res.json(gameEngine.generalQuestions);
  } else if (mode === 'all') {
    res.json({
      activeMode: gameEngine.config.triviaMode,
      activeCount: gameEngine.questions.length,
      genshinCount: gameEngine.genshinQuestions.length,
      generalCount: gameEngine.generalQuestions.length,
      genshin: gameEngine.genshinQuestions,
      general: gameEngine.generalQuestions
    });
  } else {
    res.json(gameEngine.questions);
  }
});

app.post('/api/questions', (req, res) => {
  try {
    const targetMode = req.body.mode || req.body.targetMode || gameEngine.config.triviaMode;
    const created = gameEngine.addQuestion(req.body, targetMode);
    res.json({ success: true, question: created });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/leaderboard', (req, res) => {
  res.json(gameEngine.getFullState().leaderboard);
});

app.post('/api/reset-leaderboard', (req, res) => {
  gameEngine.leaderboard = {};
  gameEngine.recentWinners = [];
  gameEngine.emitState();
  res.json({ success: true, message: 'Liderlik tablosu sıfırlandı.' });
});

// Gacha REST API Endpoints
app.get('/api/gacha/users', (req, res) => {
  res.json(gachaEngine.getAllUsersList());
});

app.get('/api/gacha/banners', (req, res) => {
  res.json({
    activeBanner: gachaEngine.getActiveBanner(),
    banners: gachaEngine.getBannersList()
  });
});

app.get(['/data/characters.json', '/api/gacha/characters', '/api/characters'], (req, res) => {
  res.json(gachaEngine.characters);
});

app.get(['/data/banners.json', '/api/gacha/banners-list'], (req, res) => {
  res.json(gachaEngine.banners);
});

app.get(['/data/weapons.json', '/api/gacha/weapons', '/api/weapons'], (req, res) => {
  res.json(gachaEngine.weapons);
});

app.post('/api/gacha/banner/set', (req, res) => {
  const { bannerId } = req.body || {};
  if (!bannerId) return res.status(400).json({ error: 'Banner ID gerekli.' });
  const result = gachaEngine.setActiveBanner(bannerId);
  if (!result.success) return res.status(400).json(result);
  broadcast({ type: 'GACHA_BANNER_CHANGED', banner: result.banner, activeBannerId: bannerId });
  res.json(result);
});

app.post('/api/gacha/banner/create', (req, res) => {
  const result = gachaEngine.createCustomBanner(req.body || {});
  if (!result.success) return res.status(400).json(result);
  broadcast({ type: 'GACHA_BANNERS_UPDATED', banners: gachaEngine.getBannersList() });
  res.json(result);
});

app.post('/api/gacha/add-primo', (req, res) => {
  const { username, amount } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Kullanıcı adı gerekli.' });
  const user = gachaEngine.addPrimogems(username, parseInt(amount, 10) || 0);
  res.json({ success: true, user });
});

app.post('/api/gacha/rain', (req, res) => {
  const { amount } = req.body || {};
  const result = gachaEngine.triggerRain(parseInt(amount, 10) || 160);
  res.json({ success: true, ...result });
});

app.post('/api/gacha/test-wish', (req, res) => {
  const { rarity, won5050, bannerType } = req.body || {};
  const result = gachaEngine.triggerTestWish(
    parseInt(rarity, 10) || 5,
    won5050 !== false,
    bannerType || 'event'
  );
  res.json({ success: true, wish: result });
});

app.post('/api/gacha/test-wish-10', (req, res) => {
  const { won5050 } = req.body || {};
  const result = gachaEngine.triggerTestWish10(won5050 !== false);
  res.json({ success: true, wish: result });
});

// Community Jackpot (Kumbara) REST Endpoints
app.get('/api/jackpot', (req, res) => {
  res.json(gachaEngine.getJackpotState());
});

app.post('/api/jackpot/sync', async (req, res) => {
  try {
    const { pool, totalAccumulated, recentWinners, force } = req.body || {};
    const clientPool = parseFloat(pool);
    const clientTotal = parseFloat(totalAccumulated);

    if (isNaN(clientPool) || clientPool < 0) {
      return res.status(400).json({ success: false, error: 'Geçersiz pool değeri.' });
    }

    const currentServerPool = gachaEngine.jackpotPool || 0;
    // Restore if client pool is greater than server pool (server wiped/reset after deploy), or force === true
    if (force || clientPool > currentServerPool || (currentServerPool === 0 && clientPool > 0)) {
      gachaEngine.jackpotPool = +clientPool.toFixed(2);
      if (!isNaN(clientTotal) && clientTotal >= gachaEngine.jackpotTotalAccumulated) {
        gachaEngine.jackpotTotalAccumulated = +clientTotal.toFixed(2);
      }
      if (Array.isArray(recentWinners) && recentWinners.length > 0 && (!gachaEngine.recentJackpotWinners || gachaEngine.recentJackpotWinners.length === 0)) {
        gachaEngine.recentJackpotWinners = recentWinners;
      }

      await db.setSetting('jackpot_pool', gachaEngine.jackpotPool);
      await db.setSetting('jackpot_total_accumulated', gachaEngine.jackpotTotalAccumulated);
      if (gachaEngine.recentJackpotWinners && gachaEngine.recentJackpotWinners.length > 0) {
        await db.setSetting('jackpot_recent_winners', gachaEngine.recentJackpotWinners);
      }

      console.log(`[Jackpot] 🛡️ Topluluk Havuzu tarayıcı yedek hafızasından geri yüklendi: ${gachaEngine.jackpotPool} 💎 (Toplam: ${gachaEngine.jackpotTotalAccumulated})`);

      gachaEngine.emit('jackpot_updated', {
        pool: gachaEngine.jackpotPool,
        exactPool: Number(gachaEngine.jackpotPool).toFixed(2),
        totalAccumulated: gachaEngine.jackpotTotalAccumulated,
        reason: 'CLIENT_SYNC',
        timestamp: Date.now()
      });

      return res.json({
        success: true,
        restored: true,
        pool: gachaEngine.jackpotPool,
        totalAccumulated: gachaEngine.jackpotTotalAccumulated,
        message: `Havuz ${gachaEngine.jackpotPool} Primogem olarak geri yüklendi!`
      });
    }

    res.json({
      success: true,
      restored: false,
      pool: gachaEngine.jackpotPool,
      totalAccumulated: gachaEngine.jackpotTotalAccumulated,
      message: 'Sunucudaki havuz zaten güncel.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/jackpot/raffle', (req, res) => {
  const { winner } = req.body || {};
  const result = gachaEngine.raffleJackpot(winner || null);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/jackpot/distribute', (req, res) => {
  const { amount } = req.body || {};
  const result = gachaEngine.distributeJackpot(parseInt(amount, 10) || null);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/jackpot/adjust', (req, res) => {
  const { amount, mode } = req.body || {};
  const result = gachaEngine.adjustJackpotPool(amount, mode || 'add');
  res.json(result);
});

app.post('/api/jackpot/test-win', (req, res) => {
  const { type, winner, amount } = req.body || {};
  const testAmount = parseInt(amount, 10) || 1200;
  if (type === 'distribute') {
    broadcast({
      type: 'JACKPOT_DISTRIBUTED',
      userCount: 8,
      perUser: 150,
      totalAmount: testAmount,
      remainingPool: gachaEngine.jackpotPool,
      displayRemaining: Math.floor(gachaEngine.jackpotPool),
      isTest: true
    });
    broadcast({ type: 'CHATTER_PRIMO_RAIN', count: 35 });
  } else {
    const testWinner = winner || 'PaimonGezgini';
    broadcast({
      type: 'JACKPOT_WON',
      winner: testWinner,
      amount: testAmount,
      remainingPool: gachaEngine.jackpotPool,
      displayRemaining: Math.floor(gachaEngine.jackpotPool),
      type: 'RAFFLE',
      isTest: true
    });
    broadcast({ type: 'CHATTER_CROWN', winner: testWinner });
    broadcast({ type: 'CHATTER_PRIMO_RAIN', count: 40 });
  }
  res.json({ success: true, message: 'Test animasyonu gönderildi!' });
});

const crypto = require('crypto');

function base64URLEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const oauthSessions = new Map();

// Kick Bot REST Endpoints
app.get('/api/bot/status', (req, res) => {
  res.json({
    ...kickBot.getStatus(),
    clientId: config.botClientId || '',
    redirectUri: config.botRedirectUri || '',
    targetChannel: config.botTargetChannel || config.channel || '',
    hasRefreshToken: Boolean(config.botRefreshToken || kickBot.refreshToken),
    expiresAt: config.botTokenExpiresAt || kickBot.expiresAt || null,
    minutesUntilExpiry: kickBot.expiresAt ? Math.max(0, Math.round((kickBot.expiresAt - Date.now()) / 60000)) : null
  });
});

app.post('/api/bot/config', async (req, res) => {
  const { token, refreshToken, expiresAt, enabled, clientId, clientSecret, redirectUri, targetChannel, botUsername } = req.body || {};
  if (token !== undefined) {
    config.botToken = token;
    await db.setSetting('botToken', token);
  }
  if (refreshToken !== undefined) {
    config.botRefreshToken = refreshToken;
    await db.setSetting('botRefreshToken', refreshToken);
  }
  if (expiresAt !== undefined) {
    config.botTokenExpiresAt = parseInt(expiresAt, 10) || 0;
    await db.setSetting('botTokenExpiresAt', config.botTokenExpiresAt);
  }
  if (botUsername !== undefined) {
    config.botUsername = botUsername;
    await db.setSetting('botUsername', botUsername);
  }
  if (enabled !== undefined) {
    config.botEnabled = !!enabled;
    kickBot.setEnabled(!!enabled);
    await db.setSetting('botEnabled', !!enabled);
  }
  if (clientId !== undefined) {
    config.botClientId = clientId.trim();
    await db.setSetting('botClientId', config.botClientId);
  }
  if (clientSecret !== undefined) {
    config.botClientSecret = clientSecret.trim();
    await db.setSetting('botClientSecret', config.botClientSecret);
  }
  if (redirectUri !== undefined) {
    config.botRedirectUri = redirectUri.trim();
    await db.setSetting('botRedirectUri', config.botRedirectUri);
  }

  kickBot.setCredentials({
    token: config.botToken || '',
    refreshToken: config.botRefreshToken || '',
    expiresAt: config.botTokenExpiresAt || 0,
    clientId: config.botClientId || '',
    clientSecret: config.botClientSecret || '',
    redirectUri: config.botRedirectUri || '',
    botUsername: config.botUsername || null
  });

  if (targetChannel !== undefined) {
    config.botTargetChannel = targetChannel.trim();
    await db.setSetting('botTargetChannel', config.botTargetChannel);
    const activeTarget = config.botTargetChannel || config.channel || 'mylune';
    try {
      const info = await kickClient.getChatroomId(activeTarget);
      if (info) {
        if (info.chatroomId) kickBot.setChatroomId(info.chatroomId);
        if (info.broadcasterUserId) kickBot.setBroadcasterUserId(info.broadcasterUserId);
      }
    } catch (e) {}
  }
  saveConfig(config);
  broadcast({
    type: 'BOT_STATUS',
    status: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || '',
      targetChannel: config.botTargetChannel || config.channel || '',
      hasRefreshToken: Boolean(config.botRefreshToken || kickBot.refreshToken),
      expiresAt: config.botTokenExpiresAt || kickBot.expiresAt || null
    }
  });
  res.json({
    success: true,
    status: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || '',
      targetChannel: config.botTargetChannel || config.channel || '',
      hasRefreshToken: Boolean(config.botRefreshToken || kickBot.refreshToken),
      expiresAt: config.botTokenExpiresAt || kickBot.expiresAt || null
    }
  });
});

app.post('/api/bot/refresh-token', async (req, res) => {
  try {
    const result = await kickBot.refreshAccessToken();
    if (result.success) {
      res.json({
        success: true,
        status: {
          ...kickBot.getStatus(),
          clientId: config.botClientId || '',
          redirectUri: config.botRedirectUri || '',
          targetChannel: config.botTargetChannel || config.channel || '',
          hasRefreshToken: Boolean(config.botRefreshToken || kickBot.refreshToken),
          expiresAt: kickBot.expiresAt
        }
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bot/target-channel', async (req, res) => {
  const { targetChannel } = req.body || {};
  const cleaned = cleanChannelSlug(targetChannel);
  const target = cleaned || (targetChannel ? String(targetChannel).trim() : '');

  config.botTargetChannel = target;
  saveConfig(config);
  await db.setSetting('botTargetChannel', target);

  const activeChannel = target || config.channel || 'mylune';
  try {
    const info = await kickClient.getChatroomId(activeChannel);
    if (info) {
      if (info.chatroomId) kickBot.setChatroomId(info.chatroomId);
      if (info.broadcasterUserId) kickBot.setBroadcasterUserId(info.broadcasterUserId);
      console.log(`[KickBot] Hedef kanal güncellendi: ${activeChannel} (Chatroom #${info.chatroomId}, Broadcaster #${info.broadcasterUserId})`);
    }
    broadcast({
      type: 'BOT_STATUS',
      status: {
        ...kickBot.getStatus(),
        clientId: config.botClientId || '',
        redirectUri: config.botRedirectUri || '',
        targetChannel: config.botTargetChannel || config.channel || ''
      }
    });
    res.json({ success: true, targetChannel: activeChannel, broadcasterUserId: kickBot.broadcasterUserId });
  } catch (err) {
    res.json({ success: true, targetChannel: activeChannel, warning: err.message });
  }
});

// OAuth 2.1 PKCE Flow: Start
app.post('/api/bot/oauth/start', async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body || {};
  const cId = (clientId || config.botClientId || '').trim();
  const cSecret = (clientSecret || config.botClientSecret || '').trim();

  if (!cId || !cSecret) {
    return res.status(400).json({ error: 'Lütfen hem Client ID hem de Client Secret alanlarını doldurun.' });
  }

  config.botClientId = cId;
  config.botClientSecret = cSecret;
  if (redirectUri) {
    config.botRedirectUri = redirectUri.trim();
  }
  saveConfig(config);

  // PKCE Authorization Code flow (Only this flow has chat:write permission on Kick!)
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash('sha256').update(verifier).digest());
  const state = base64URLEncode(crypto.randomBytes(16));

  const origin = `${req.protocol}://${req.get('host')}`;
  const effectiveRedirect = config.botRedirectUri || `${origin}/auth/kick/callback`;

  oauthSessions.set(state, {
    verifier,
    redirectUri: effectiveRedirect,
    createdAt: Date.now()
  });

  // Clean old sessions
  for (const [sKey, sVal] of oauthSessions.entries()) {
    if (Date.now() - sVal.createdAt > 600000) {
      oauthSessions.delete(sKey);
    }
  }

  const authUrl = `https://id.kick.com/oauth/authorize?client_id=${encodeURIComponent(cId)}&redirect_uri=${encodeURIComponent(effectiveRedirect)}&response_type=code&scope=user:read+chat:write+channel:read+channel:write&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  res.json({ success: true, authUrl, redirectUri: effectiveRedirect });
});

// OAuth Callback Route
app.get('/auth/kick/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Yetkilendirme Hatası</title></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh;">
        <div style="background:#1e293b; padding:30px; border-radius:12px; max-width:480px; text-align:center;">
          <h2 style="color:#ef4444;">❌ Yetkilendirme Başarısız</h2>
          <p style="color:#94a3b8;">${error_description || error}</p>
          <a href="/admin.html" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px;">Panele Geri Dön</a>
        </div>
      </body>
      </html>
    `);
  }

  const session = oauthSessions.get(state);
  const cId = config.botClientId;
  const cSecret = config.botClientSecret;

  if (!session || !cId || !cSecret) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Oturum Zaman Aşımı</title></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh;">
        <div style="background:#1e293b; padding:30px; border-radius:12px; max-width:480px; text-align:center;">
          <h2 style="color:#f59e0b;">⏳ Oturum Zaman Aşımı</h2>
          <p style="color:#94a3b8;">Yetkilendirme isteği zaman aşımına uğradı. Lütfen panelden tekrar deneyin.</p>
          <a href="/admin.html" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px;">Panele Geri Dön</a>
        </div>
      </body>
      </html>
    `);
  }

  oauthSessions.delete(state);

  try {
    const tokenRes = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cId,
        client_secret: cSecret,
        redirect_uri: session.redirectUri,
        code_verifier: session.verifier,
        code: code
      }).toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      return res.status(tokenRes.status).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Token Alınamadı</title></head>
        <body style="font-family:sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh;">
          <div style="background:#1e293b; padding:30px; border-radius:12px; max-width:480px; text-align:center;">
            <h2 style="color:#ef4444;">❌ Token Alınamadı</h2>
            <p style="color:#94a3b8;">${errBody}</p>
            <a href="/admin.html" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px;">Panele Geri Dön</a>
          </div>
        </body>
        </html>
      `);
    }

    const tokenData = await tokenRes.json();
    const expiresIn = tokenData.expires_in || 7200;
    const expiresAt = Date.now() + (expiresIn * 1000);

    config.botToken = tokenData.access_token;
    config.botRefreshToken = tokenData.refresh_token || config.botRefreshToken || '';
    config.botTokenExpiresAt = expiresAt;

    kickBot.setCredentials({
      token: tokenData.access_token,
      refreshToken: config.botRefreshToken,
      expiresAt: expiresAt,
      clientId: cId,
      clientSecret: cSecret,
      redirectUri: session.redirectUri
    });

    await db.setSetting('botToken', tokenData.access_token);
    if (tokenData.refresh_token) {
      await db.setSetting('botRefreshToken', tokenData.refresh_token);
    }
    await db.setSetting('botTokenExpiresAt', expiresAt);

    // Fetch the authenticated bot user's identity
    let botUsername = null;
    try {
      const uRes = await fetch('https://api.kick.com/public/v1/users', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json'
        }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        const u = Array.isArray(uData.data) ? uData.data[0] : (uData.data || uData);
        botUsername = u?.username || u?.name || null;
        if (botUsername) {
          config.botUsername = botUsername;
          kickBot.setUsername(botUsername);
          await db.setSetting('botUsername', botUsername);
          console.log(`[KickBot] ✅ Yetkilendirilen bot hesabı: @${botUsername}`);
        }
      }
    } catch (eU) {
      console.warn('[KickBot] Bot kullanıcı adı sorgulanamadı:', eU.message);
    }

    saveConfig(config);

    broadcast({
      type: 'BOT_STATUS',
      status: {
        ...kickBot.getStatus(),
        clientId: config.botClientId || '',
        redirectUri: config.botRedirectUri || '',
        targetChannel: config.botTargetChannel || config.channel || '',
        hasRefreshToken: Boolean(config.botRefreshToken || kickBot.refreshToken),
        expiresAt: expiresAt
      }
    });

    const safeUsername = botUsername ? encodeURIComponent(botUsername) : '';
    const safeToken = encodeURIComponent(tokenData.access_token);
    const safeRefreshToken = encodeURIComponent(tokenData.refresh_token || '');

    // Send successful auto-closing page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Yetkilendirme Başarılı</title></head>
      <body style="font-family:sans-serif; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh;">
        <div style="background:#1e293b; padding:30px; border-radius:12px; max-width:480px; text-align:center;">
          <h2 style="color:#10b981;">🎉 Yetkilendirme Başarılı!</h2>
          <p style="color:#94a3b8;">${botUsername ? `@${botUsername}` : 'Paimon Bot'} Kick kanalınıza başarıyla bağlandı. Bu pencereyi kapatabilirsiniz.</p>
          <a href="/admin.html?bot_authorized=true&bot_username=${safeUsername}" style="display:inline-block; margin-top:16px; padding:10px 20px; background:#10b981; color:#fff; text-decoration:none; border-radius:8px;">Yönetim Paneline Dön</a>
          <script>
            try {
              localStorage.setItem('kick_bot_token', '${tokenData.access_token}');
              ${tokenData.refresh_token ? `localStorage.setItem('kick_bot_refresh_token', '${tokenData.refresh_token}');` : ''}
              localStorage.setItem('kick_bot_expires_at', '${expiresAt}');
              ${botUsername ? `localStorage.setItem('kick_bot_username', '${botUsername}');` : ''}
            } catch(e) {}
            if (window.opener) {
              try {
                window.opener.postMessage({
                  type: 'KICK_AUTH_SUCCESS',
                  token: '${tokenData.access_token}',
                  refreshToken: '${tokenData.refresh_token || ''}',
                  expiresAt: ${expiresAt},
                  botUsername: '${botUsername || ''}'
                }, '*');
              } catch (e) {}
              setTimeout(() => { window.close(); }, 1200);
            }
          </script>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>Sunucu Hatası:</h2><p>${err.message}</p><a href="/admin.html">Panele Geri Dön</a>`);
  }
});

app.post('/api/bot/test-message', async (req, res) => {
  const { message } = req.body || {};
  const text = message || '✨ Paimon Bot test mesajı: Sistem aktif ve çalışıyor!';
  kickBot.sendMessage(text);
  const result = await kickBot.dispatchMessage(text);
  if (result.success) {
    res.json({ success: true, message: text });
  } else {
    res.status(400).json({ success: false, error: result.error || 'Mesaj gönderilemedi' });
  }
});

app.post('/api/bot/update-channel', async (req, res) => {
  const { stream_title, category_name, category_id } = req.body || {};
  let targetCatId = category_id;
  if (!targetCatId && category_name) {
    const found = await kickBot.findCategory(category_name);
    if (found) {
      targetCatId = found.id;
    } else {
      return res.status(400).json({ success: false, error: `"${category_name}" adında bir kategori bulunamadı.` });
    }
  }

  const result = await kickBot.updateChannel({
    stream_title: stream_title || undefined,
    category_id: targetCatId || undefined
  });

  if (result.success) {
    res.json({ success: true, payload: result.payload });
  } else {
    res.status(400).json({ success: false, error: result.error || 'Kanal güncellenemedi.' });
  }
});

// Timed Messages (Scheduled Announcements) REST Endpoints
app.get('/api/timers', (req, res) => {
  res.json({ timers: timerService.getTimers() });
});

app.post('/api/timers', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'Mesaj metni boş olamaz.' });
  }
  const timer = timerService.addTimer({ text, intervalMinutes, enabled });
  res.json({ success: true, timer, timers: timerService.getTimers() });
});

app.put('/api/timers/:id', (req, res) => {
  const { text, intervalMinutes, enabled } = req.body || {};
  const updated = timerService.updateTimer(req.params.id, { text, intervalMinutes, enabled });
  if (updated) {
    res.json({ success: true, timer: updated, timers: timerService.getTimers() });
  } else {
    res.status(404).json({ success: false, error: 'Zamanlayıcı bulunamadı.' });
  }
});

app.delete('/api/timers/:id', (req, res) => {
  const success = timerService.deleteTimer(req.params.id);
  res.json({ success, timers: timerService.getTimers() });
});

app.post('/api/timers/:id/toggle', (req, res) => {
  const { enabled } = req.body || {};
  const timer = timerService.timers.find(x => x.id === req.params.id);
  if (!timer) return res.status(404).json({ success: false, error: 'Bulunamadı.' });
  const newEnabled = enabled !== undefined ? !!enabled : !timer.enabled;
  const updated = timerService.updateTimer(req.params.id, { enabled: newEnabled });
  res.json({ success: true, timer: updated, timers: timerService.getTimers() });
});

app.post('/api/timers/:id/trigger', (req, res) => {
  const success = timerService.triggerTimer(req.params.id);
  if (success) {
    res.json({ success: true, message: 'Mesaj Kick sohbetine gönderildi.' });
  } else {
    res.status(404).json({ success: false, error: 'Zamanlayıcı bulunamadı.' });
  }
});

// Custom Chat Commands REST Endpoints
app.get('/api/commands', (req, res) => {
  res.json({ commands: commandService.getCommands() });
});

app.post('/api/commands', (req, res) => {
  try {
    const { name, response, cooldown, enabled, aliases, permission, description } = req.body || {};
    const cmd = commandService.addCommand({ name, response, cooldown, enabled, aliases, permission, description });
    broadcast({ type: 'COMMANDS_UPDATED', commands: commandService.getCommands() });
    res.json({ success: true, command: cmd, commands: commandService.getCommands() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/commands/:id', (req, res) => {
  try {
    const cmd = commandService.updateCommand(req.params.id, req.body || {});
    broadcast({ type: 'COMMANDS_UPDATED', commands: commandService.getCommands() });
    res.json({ success: true, command: cmd, commands: commandService.getCommands() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/commands/:id/toggle', (req, res) => {
  try {
    const { enabled } = req.body || {};
    const cmd = commandService.toggleCommand(req.params.id, enabled);
    broadcast({ type: 'COMMANDS_UPDATED', commands: commandService.getCommands() });
    res.json({ success: true, command: cmd, commands: commandService.getCommands() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/commands/:id', (req, res) => {
  try {
    const deleted = commandService.deleteCommand(req.params.id);
    broadcast({ type: 'COMMANDS_UPDATED', commands: commandService.getCommands() });
    res.json({ success: true, deleted, commands: commandService.getCommands() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/commands/reset', (req, res) => {
  try {
    const reset = commandService.resetToDefaults();
    broadcast({ type: 'COMMANDS_UPDATED', commands: reset });
    res.json({ success: true, commands: reset });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/commands/sync', (req, res) => {
  try {
    const { commands } = req.body || {};
    if (!Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ success: false, error: 'Geçersiz komut listesi.' });
    }
    const updated = commandService.setCommands(commands);
    broadcast({ type: 'COMMANDS_UPDATED', commands: updated });
    res.json({ success: true, commands: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/commands/:id/test', async (req, res) => {
  const cmd = commandService.getCommandById(req.params.id);
  if (!cmd) return res.status(404).json({ success: false, error: 'Komut bulunamadı.' });

  const nowObj = new Date();
  const testMsg = cmd.response
    .replace(/\{user\}/gi, 'Yayıncı')
    .replace(/\{hedef\}/gi, '@Yayıncı')
    .replace(/\{target\}/gi, '@Yayıncı')
    .replace(/\{kanal\}/gi, config.channel || 'mylune')
    .replace(/\{channel\}/gi, config.channel || 'mylune')
    .replace(/\{saat\}/gi, nowObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{tarih\}/gi, nowObj.toLocaleDateString('tr-TR'))
    .replace(/\{komutlar\}/gi, commandService.getCommands().filter(c => c.enabled).map(c => c.name).join(', '));

  kickBot.sendMessage(testMsg);
  broadcast({
    type: 'CHAT_MESSAGE',
    message: {
      username: kickBot.botUsername || 'MilkaBot',
      content: testMsg,
      profilePic: null,
      createdAt: new Date().toISOString()
    }
  });
  res.json({ success: true, message: testMsg });
});

// World Boss Raid REST Endpoints
app.get('/api/boss/state', (req, res) => {
  res.json(bossEngine.getState());
});

app.get('/api/boss/bosses', (req, res) => {
  res.json({ bosses: bossEngine.getBosses() });
});

app.post('/api/boss/start', express.json(), (req, res) => {
  const { bossId, hp, prepSeconds, battleSeconds } = req.body || {};
  const result = bossEngine.startBoss(bossId, { hp, prepSeconds, battleSeconds });
  res.json(result);
});

app.post('/api/boss/stop', express.json(), (req, res) => {
  const result = bossEngine.stopBoss('ADMIN_STOP');
  res.json(result);
});

app.post('/api/boss/config', express.json(), (req, res) => {
  const updated = bossEngine.saveConfig(req.body || {});
  res.json({ success: true, config: updated });
});

app.post('/api/boss/test', express.json(), (req, res) => {
  const { bossId } = req.body || {};
  const result = bossEngine.simulateTestFight(bossId);
  res.json(result);
});

// Database Management REST Endpoints
app.get('/api/db/status', (req, res) => {
  res.json({
    status: db.getStatus(),
    databaseUrlSet: Boolean(process.env.DATABASE_URL || config.databaseUrl)
  });
});

app.post('/api/db/config', async (req, res) => {
  const { databaseUrl } = req.body || {};
  if (databaseUrl !== undefined) {
    const trimmed = (databaseUrl || '').trim();
    if (!trimmed) {
      config.databaseUrl = '';
      saveConfig(config);
      await db.init(null);
      return res.json({ success: true, status: db.getStatus() });
    }

    try {
      await db.init(trimmed);
      if (db.type !== 'postgres') {
        return res.status(400).json({
          success: false,
          error: db.lastError || 'Veritabanına bağlanılamadı. Lütfen şifrenizi veya bağlantı adresinizi kontrol edin.',
          status: db.getStatus()
        });
      }
      config.databaseUrl = trimmed;
      saveConfig(config);
      if (gachaEngine) {
        gachaEngine.loadData();
        gachaEngine.emit('jackpot_updated', {
          pool: gachaEngine.jackpotPool,
          exactPool: Number(gachaEngine.jackpotPool).toFixed(2),
          totalAccumulated: gachaEngine.jackpotTotalAccumulated,
          reason: 'DB_CONFIG_SWITCH',
          timestamp: Date.now()
        });
      }
      res.json({ success: true, status: db.getStatus() });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message, status: db.getStatus() });
    }
  } else {
    res.status(400).json({ error: 'databaseUrl parametresi gerekli.' });
  }
});

app.get('/api/db/export', (req, res) => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    users: db.getAllUsers(),
    settings: Object.fromEntries(db.inMemorySettings.entries()),
    jackpot: gachaEngine ? gachaEngine.getJackpotState() : null,
    config: {
      channel: config.channel,
      botTargetChannel: config.botTargetChannel,
      intervalMinutes: config.intervalMinutes,
      questionDurationSeconds: config.questionDurationSeconds
    }
  };
  res.setHeader('Content-Disposition', 'attachment; filename="milkabot_database_backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData, null, 2));
});

app.post('/api/db/import', async (req, res) => {
  try {
    const importData = req.body;
    if (!importData || typeof importData !== 'object') {
      return res.status(400).json({ error: 'Geçersiz yedek verisi.' });
    }
    let restoredUsers = 0;
    if (importData.users && typeof importData.users === 'object') {
      await db.saveAllUsers(importData.users);
      restoredUsers = Object.keys(importData.users).length;
    }
    if (importData.settings && typeof importData.settings === 'object') {
      for (const [k, v] of Object.entries(importData.settings)) {
        await db.setSetting(k, v);
      }
    }
    if (importData.jackpot && typeof importData.jackpot === 'object') {
      const jp = importData.jackpot;
      if (jp.pool !== undefined) await db.setSetting('jackpot_pool', jp.pool);
      if (jp.totalAccumulated !== undefined) await db.setSetting('jackpot_total_accumulated', jp.totalAccumulated);
      if (Array.isArray(jp.recentWinners)) await db.setSetting('jackpot_recent_winners', jp.recentWinners);
    }
    if (gachaEngine) {
      gachaEngine.loadData();
      gachaEngine.emit('jackpot_updated', {
        pool: gachaEngine.jackpotPool,
        exactPool: Number(gachaEngine.jackpotPool).toFixed(2),
        totalAccumulated: gachaEngine.jackpotTotalAccumulated,
        reason: 'DB_IMPORT',
        timestamp: Date.now()
      });
    }
    res.json({
      success: true,
      message: `${restoredUsers} Gezgin, Topluluk Havuzu ve sistem ayarları başarıyla geri yüklendi!`,
      status: db.getStatus()
    });
  } catch (err) {
    res.status(500).json({ error: 'Yedek yüklenirken hata oluştu: ' + err.message });
  }
});


// Start Server
const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🌟 Kick Milka Trivia Sunucusu Çalışıyor: http://localhost:${PORT}`);
  console.log(`🎯 OBS Trivia Kaynağı URL:       http://localhost:${PORT}/trivia.html`);
  console.log(`✨ OBS Gacha Dilek Kaynağı URL:   http://localhost:${PORT}/gacha.html`);
  console.log(`🐉 OBS Boss Raid Kaynağı URL:    http://localhost:${PORT}/boss.html`);
  console.log(`⚙️  Yayıncı Kontrol Paneli:         http://localhost:${PORT}/admin.html`);
  console.log('========================================================');

  // Start Kick chat if channel is set
  const initialChannel = cleanChannelSlug(config.channel);
  if (initialChannel) {
    console.log(`[Server] ${initialChannel} kanalına bağlanılıyor...`);
    kickClient.connect(initialChannel);
  } else {
    console.log('[Server] Henüz Kick kanalı ayarlanmadı. Lütfen admin panelinden kanal adınızı girin.');
  }

  // Start game engine loop
  gameEngine.start();
});
