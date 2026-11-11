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

app.get('/', (req, res) => {
  res.redirect('/world.html');
});

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
const { TradeEngine } = require('./tradeEngine');
const tradeEngine = new TradeEngine({ gachaEngine });
const { RpgEngine } = require('./rpgEngine');
const rpgEngine = new RpgEngine({ db });
const { WorldEngine } = require('./worldEngine');
const worldEngine = new WorldEngine({ gachaEngine, tradeEngine, rpgEngine });

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

function sendToSocket(socketId, payload) {
  const str = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.socketId === socketId && client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}

function broadcastToSockets(socketIds, payload) {
  if (!Array.isArray(socketIds) || socketIds.length === 0) return;
  const sSet = new Set(socketIds);
  const str = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (sSet.has(client.socketId) && client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}

function broadcastToMap(mapId, payload) {
  if (!mapId) return;
  const str = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    const p = worldEngine.getPlayer(client.socketId);
    if (p && p.mapId === mapId && client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}

function awardUserPrimogemsByName(username, amount) {
  if (!username || !amount) return 0;
  const user = gachaEngine.getOrCreateUser(username);
  user.primogems = (user.primogems || 0) + (amount | 0);
  gachaEngine.saveUsers();
  const onlineP = worldEngine.getPlayerByName(username);
  if (onlineP) {
    onlineP.primogems = user.primogems;
  }
  broadcast({
    type: 'WORLD_PRIMO_UPDATE_USER',
    username: user.username || username,
    primogems: user.primogems
  });
  return user.primogems;
}

function notifyDailyQuestProgress(username, res) {
  if (!username || !res || !res.updated) return;
  broadcast({
    type: 'DAILY_QUEST_UPDATE',
    username,
    questId: res.quest ? res.quest.id : null,
    questTitle: res.quest ? res.quest.title : null,
    justCompleted: Boolean(res.justCompleted),
    progress: res.progress,
    target: res.target,
    state: res.state
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

  // Feed to WorldEngine for MMO 3D Speech Bubbles and Kick PIN verification
  try {
    const rawUser = (chatMsg.sender?.username || 'Viewer').trim();
    const content = (chatMsg.content || '').trim();
    if (content.startsWith('!giris') || content.startsWith('!giriş')) {
      const pinResult = worldEngine.verifyPinFromChat(rawUser, content);
      if (pinResult && pinResult.success) {
        kickBot.sendMessage(`✅ @${rawUser} Teyvat Piksel Dünyasına Kick kimliğinle bağlandın! Hoş geldin!`).catch(() => {});
      }
    }
    worldEngine.bridgeKickChat(rawUser, content);
  } catch (err) {
    console.error('[Server] WorldEngine handleChatMessage hatası:', err);
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

      // --- Mylune Günlük Görev Sistemi (Kick Canlı Yayın Etkileşimi) ---
      const textLowerQuest = (chatMsg.content || '').trim().toLowerCase();
      if (rawUser && rawUser !== 'Viewer') {
        // 1) Her Kick sohbet mesajı (5sn anti-spam korumalı)
        const chatProg = rpgEngine.recordDailyQuestProgress(rawUser, 'kick_chat_10', 1, { persist: true });
        notifyDailyQuestProgress(rawUser, chatProg);

        // 2) Yayın etkileşimi (!wish, !katil, !balik, !maden, !buff)
        if (
          textLowerQuest.startsWith('!wish') ||
          textLowerQuest.startsWith('!dilek') ||
          textLowerQuest.startsWith('!katil') ||
          textLowerQuest.startsWith('!katıl') ||
          textLowerQuest === '!join' ||
          textLowerQuest === '!balik' ||
          textLowerQuest === '!balık' ||
          textLowerQuest === '!fish' ||
          textLowerQuest === '!maden' ||
          textLowerQuest === '!mine' ||
          textLowerQuest.startsWith('!buff') ||
          textLowerQuest.startsWith('!kutsama')
        ) {
          const evProg = rpgEngine.recordDailyQuestProgress(rawUser, 'kick_stream_event', 1, { persist: true });
          notifyDailyQuestProgress(rawUser, evProg);
        }

        // 2.5) !buff / !kutsama (Aion 2 Zindan Aether Kutsaması)
        if (textLowerQuest.startsWith('!buff') || textLowerQuest.startsWith('!kutsama')) {
          const buffMatch = textLowerQuest.match(/^!(?:buff|kutsama)(?:\s+@?([a-zA-Z0-9_\u00C0-\u017F]+))?/);
          const targetUser = (buffMatch && buffMatch[1]) ? buffMatch[1] : null;
          broadcast({
            type: 'DUNGEON_VIEWER_BUFF',
            viewer: rawUser,
            targetUser
          });
          if (kickBot && kickBot.enabled && kickBot.checkCooldown(rawUser)) {
            kickBot.sendMessage(`🪽 @${rawUser} Aether Tapınağı Zindanındaki savaşçılara [+25% Saldırı & Hız Aether Kutsaması] gönderdi! ✨`);
          }
        }

        // 3) !gunluk / !günlük / !gorevler komutu (İlerleme göster ve tamamlananları otomatik topla)
        if (
          textLowerQuest === '!gunluk' ||
          textLowerQuest === '!günlük' ||
          textLowerQuest === '!gorevler' ||
          textLowerQuest === '!görevler' ||
          textLowerQuest === '!daily'
        ) {
          const claimAll = rpgEngine.claimAllAvailableDailyQuests(rawUser, { persist: true });
          if (claimAll.ok && claimAll.primoGain > 0) {
            const newTotal = awardUserPrimogemsByName(rawUser, claimAll.primoGain);
            const itemTxt = claimAll.bonusItem ? ` + [${claimAll.bonusItem.rarity}★ ${claimAll.bonusItem.name}]` : '';
            const msg = `📜 @${rawUser} Günlük Görev Ödüllerin Toplandı: ${claimAll.claimedTitles.join(', ')}! ➡️ +${claimAll.primoGain} 💎, +${claimAll.xpGain} RPG XP${itemTxt} (Bakiye: ${newTotal} 💎)`;
            if (kickBot && kickBot.enabled) kickBot.sendMessage(msg);
            broadcast({
              type: 'DAILY_QUEST_UPDATE',
              username: rawUser,
              state: claimAll.state
            });
          } else {
            const st = claimAll.state || rpgEngine.getDailyQuestsState(rawUser, { persist: true });
            if (st && Array.isArray(st.quests)) {
              const parts = st.quests.map(q => `${q.icon}${q.progress}/${q.target}${q.claimed ? '☑️' : (q.completed ? '✅' : '')}`);
              const chestTxt = st.bonusChest?.claimed ? '🎁Sandık:☑️' : (st.bonusChest?.unlocked ? '🎁Sandık:HAZIR!' : `🎁Sandık:${st.completedCount}/${st.totalCount}`);
              const msg = `📜 @${rawUser} Mylune Günlük Görevler (${st.completedCount}/${st.totalCount}): ${parts.join(' | ')} | ${chestTxt}`;
              if (kickBot && kickBot.enabled) kickBot.sendMessage(msg);
            }
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

    // Record daily quest progress for Trivia win
    try {
      const evProg = rpgEngine.recordDailyQuestProgress(winnerUser, 'kick_stream_event', 1, { persist: true });
      notifyDailyQuestProgress(winnerUser, evProg);
    } catch (e) {}

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

  // Sync MMO Player stats & companion list if online
  if (wishData.username && worldEngine) {
    const p = worldEngine.getPlayerByName(wishData.username);
    if (p) {
      if (wishData.stats && wishData.stats.primogems !== undefined) {
        p.primogems = wishData.stats.primogems;
      }
      const comps = worldEngine.getUserCompanions(wishData.username);
      broadcast({
        type: 'WORLD_COMPANIONS_LIST',
        username: wishData.username,
        companions: comps,
        activeCompanion: p.companion || null
      });
    }
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

// World MMO Engine Events
worldEngine.on('player_joined', (player) => {
  broadcast({ type: 'WORLD_PLAYER_JOINED', player });
});

worldEngine.on('player_left', (info) => {
  broadcast({ type: 'WORLD_PLAYER_LEFT', ...info });
  if (info.partyRes && !info.partyRes.disbanded && info.partyRes.remainingMembers) {
    broadcastToSockets(info.partyRes.remainingMembers, {
      type: 'PARTY_UPDATE',
      party: info.partyRes.party
    });
  }
});

worldEngine.on('player_changed_map', (info) => {
  broadcast({ type: 'WORLD_PLAYER_MAP_CHANGED', ...info });
});

worldEngine.on('player_authenticated', (data) => {
  broadcast({ type: 'WORLD_PLAYER_AUTHED', ...data });
});

worldEngine.on('speech_bubble', (data) => {
  broadcast({ type: 'WORLD_SPEECH_BUBBLE', ...data });
});

// Trade Engine Events
tradeEngine.on('trade_started', (session) => {
  broadcast({ type: 'TRADE_SESSION_STARTED', session });
});

tradeEngine.on('trade_updated', (session) => {
  broadcast({ type: 'TRADE_SESSION_UPDATED', session });
});

tradeEngine.on('trade_completed', (data) => {
  broadcast({ type: 'TRADE_COMPLETED', ...data });
  kickBot.sendMessage(`🤝 [Pazar] @${data.session.p1} ve @${data.session.p2} takası başarıyla tamamladı!`).catch(() => {});
});

tradeEngine.on('trade_cancelled', (data) => {
  broadcast({ type: 'TRADE_CANCELLED', ...data });
});

// 20 FPS (50ms) MMO World State Delta Broadcast Loop
setInterval(() => {
  if (worldEngine.players.size > 0) {
    const states = worldEngine.getMapStates();
    broadcast({ type: 'WORLD_STATE', states });
  }
}, 50);

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  const socketId = 'sock_' + Math.random().toString(36).substr(2, 9);
  ws.socketId = socketId;
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
      // --- MMO World & Three.js Messages ---
      else if (data.type === 'WORLD_JOIN') {
        const player = worldEngine.addPlayer(socketId, {
          username: data.username,
          avatarIndex: data.avatarIndex,
          isGuest: data.isGuest,
          profilePic: data.profilePic
        });
        const companions5Stars = worldEngine.getUser5Stars(player.username);
        const dailyQuests = rpgEngine.getDailyQuestsState(player.username, { persist: !player.isGuest });
        ws.send(JSON.stringify({
          type: 'WORLD_INIT',
          self: player,
          maps: worldEngine.maps,
          states: worldEngine.getMapStates(),
          unlockedCompanions: companions5Stars,
          activeCompanion: player.companion || null,
          dailyQuests
        }));
      } else if (data.type === 'WORLD_SELECT_COMPANION') {
        const targetComp = data.companionName || data.companion;
        const res = worldEngine.selectCompanion(socketId, targetComp);
        ws.send(JSON.stringify({
          type: 'WORLD_COMPANION_RESULT',
          success: res.success,
          companion: res.companion,
          companionData: res.companionData,
          message: res.message
        }));
        if (res.success) {
          broadcast({
            type: 'WORLD_PLAYER_COMPANION_UPDATE',
            socketId: socketId,
            username: res.username,
            companion: res.companion,
            companionData: res.companionData
          });
        }
      } else if (data.type === 'WORLD_GET_COMPANIONS') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const comps = worldEngine.getUser5Stars(me.username);
          ws.send(JSON.stringify({
            type: 'WORLD_COMPANIONS_LIST',
            companions: comps,
            activeCompanion: me.companion || null
          }));
        }
      } else if (data.type === 'WORLD_MOVE') {
        worldEngine.updateMovement(socketId, data);
      } else if (data.type === 'WORLD_COMBAT_VFX') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          broadcast({
            type: 'WORLD_COMBAT_VFX',
            socketId: socketId,
            username: me.username,
            mapId: me.mapId,
            action: data.action || 'attack',
            combo: data.combo || 1,
            element: data.element || 'Pyro',
            x: typeof data.x === 'number' ? data.x : me.x,
            z: typeof data.z === 'number' ? data.z : me.z,
            rot: typeof data.rot === 'number' ? data.rot : me.rot
          });
        }
      } else if (data.type === 'WORLD_DOOR_INTERACT') {
        const res = worldEngine.interactDoor(socketId);
        ws.send(JSON.stringify({ type: 'WORLD_DOOR_RESULT', ...res }));
      } else if (data.type === 'WORLD_CHAT') {
        worldEngine.addChatBubble(socketId, data.text);
      } else if (data.type === 'WORLD_REQ_PIN') {
        const pinData = worldEngine.createPinAuth(socketId, data.username);
        ws.send(JSON.stringify({ type: 'WORLD_PIN_RESULT', ...pinData }));
      } else if (data.type === 'WORLD_FISH_CATCH') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.fish) {
          const rewardPrimo = data.fish.primo || data.fish.primogems || 0;
          const newTotal = worldEngine.awardPrimogems(socketId, rewardPrimo);
          ws.send(JSON.stringify({ type: 'WORLD_PRIMO_UPDATE', primogems: newTotal }));
          broadcast({
            type: 'WORLD_FISH_ANNOUNCE',
            username: me.username,
            fish: data.fish,
            mapId: me.mapId
          });
          worldEngine.addChatBubble(socketId, `🎣 ${data.fish.emoji || '🐟'} ${data.fish.name}! (+${rewardPrimo}💎)`);

          // Günlük görev: Nehir Balıkçısı (mmo_fish_3)
          const qFish = rpgEngine.recordDailyQuestProgress(me.username, 'mmo_fish_3', 1, { persist: !me.isGuest });
          notifyDailyQuestProgress(me.username, qFish);
        }
      } else if (data.type === 'WORLD_ITEM_LOOT') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.item) {
          const user = gachaEngine.getOrCreateUser(me.username);
          if (!user.inventory) user.inventory = [];
          const newItem = {
            id: data.item.id,
            name: data.item.name,
            type: 'material',
            rarity: parseInt(data.item.rarity, 10) || 1,
            sellPrice: parseInt(data.item.sellPrice, 10) || 3,
            icon: data.item.icon,
            desc: data.item.desc || '',
            obtainedAt: new Date().toISOString()
          };
          user.inventory.push(newItem);
          gachaEngine.saveUsers();
          ws.send(JSON.stringify({
            type: 'WORLD_ITEM_LOOT_ACK',
            item: newItem
          }));
        }
      } else if (data.type === 'WORLD_MOB_DEFEAT') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.mob) {
          const mobType = data.mob.type || (data.mob.isBoss ? 'ruin_golem' : 'slime_green');
          const zoneId = data.mob.zoneId || me.mapId || 'battle_zone_1';
          const killRes = rpgEngine.handleKill(me.username, {
            mobType,
            level: data.mob.level || 1,
            elite: !!data.mob.elite,
            zoneId
          }, { persist: !me.isGuest });

          if (killRes && killRes.primoGain > 0) {
            const newTotal = worldEngine.awardPrimogems(socketId, killRes.primoGain);
            ws.send(JSON.stringify({ type: 'WORLD_PRIMO_UPDATE', primogems: newTotal }));
          }

          ws.send(JSON.stringify({
            type: 'RPG_KILL_RESULT',
            result: killRes,
            gearScore: rpgEngine.gearScore(me.username)
          }));

          if (killRes && killRes.leveledUp) {
            worldEngine.addChatBubble(socketId, `✨ LEVEL UP! Seviye ${killRes.level}!`);
          }

          if (data.mob.isBoss) {
            broadcast({
              type: 'WORLD_BOSS_ANNOUNCE',
              username: me.username,
              mobName: data.mob.name,
              item: data.mob.bossLootName || 'Kadim Kaos Çekirdeği'
            });
            worldEngine.addChatBubble(socketId, `⚔️ 👑 ${data.mob.name} yenildi! Nadir ganimetler düştü!`);
          }

          // Günlük görev: Zindan Avcısı (mmo_kill_10) & Boss Seferi (mmo_boss_or_guild)
          const qKill = rpgEngine.recordDailyQuestProgress(me.username, 'mmo_kill_10', 1, { persist: !me.isGuest });
          notifyDailyQuestProgress(me.username, qKill);
          if (data.mob.isBoss) {
            const qBoss = rpgEngine.recordDailyQuestProgress(me.username, 'mmo_boss_or_guild', 1, { persist: !me.isGuest });
            notifyDailyQuestProgress(me.username, qBoss);
          }
        }
      } else if (data.type === 'WORLD_GET_DAILY_QUESTS') {
        const me = worldEngine.getPlayer(socketId);
        const target = data.username || (me ? me.username : null);
        if (target) {
          const state = rpgEngine.getDailyQuestsState(target, { persist: me ? !me.isGuest : true });
          ws.send(JSON.stringify({ type: 'DAILY_QUEST_STATE', state }));
        }
      } else if (data.type === 'WORLD_VISIT_GUILD') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const qGuild = rpgEngine.recordDailyQuestProgress(me.username, 'mmo_boss_or_guild', 1, { persist: !me.isGuest });
          notifyDailyQuestProgress(me.username, qGuild);
          ws.send(JSON.stringify({
            type: 'DAILY_QUEST_STATE',
            state: qGuild.state || rpgEngine.getDailyQuestsState(me.username, { persist: !me.isGuest })
          }));
        }
      } else if (data.type === 'WORLD_CLAIM_DAILY_QUEST') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const persistOpt = { persist: !me.isGuest };
          const res = data.questId === 'all'
            ? rpgEngine.claimAllAvailableDailyQuests(me.username, persistOpt)
            : rpgEngine.claimDailyQuest(me.username, data.questId, persistOpt);
          if (res.ok && res.primoGain > 0) {
            const newTotal = worldEngine.awardPrimogems(socketId, res.primoGain);
            ws.send(JSON.stringify({ type: 'WORLD_PRIMO_UPDATE', primogems: newTotal }));
          }
          if (res.rpgState) {
            ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state: res.rpgState }));
          }
          ws.send(JSON.stringify({
            type: 'DAILY_QUEST_CLAIM_RESULT',
            ...res
          }));
        }
      } else if (data.type === 'WORLD_DUNGEON_CHEST_CLAIM') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const instId = data.instanceId || me.mapId;
          const inst = worldEngine.getDungeonInstance(instId);
          if (inst) {
            const claimCheck = inst.claimChest(data.chestId || 'chest_normal', me.username);
            if (!claimCheck.ok) {
              ws.send(JSON.stringify({
                type: 'DUNGEON_CHEST_CLAIM_RESULT',
                success: false,
                ok: false,
                message: 'Bu sandığı zaten açtın!'
              }));
              return;
            }
          }

          const persistOpt = { persist: !me.isGuest };
          const baseTier = (me.mapId && me.mapId.startsWith('dungeon_tier_'))
            ? me.mapId.split('_inst_')[0]
            : (data.tierId || 'dungeon_tier_1');

          const chestRes = rpgEngine.claimDungeonChest(me.username, {
            tierId: baseTier,
            rank: data.rank || 'B',
            isBonusChest: Boolean(data.isBonusChest)
          }, persistOpt);

          if (chestRes.ok) {
            const newTotal = worldEngine.awardPrimogems(socketId, chestRes.primoGain);
            ws.send(JSON.stringify({ type: 'WORLD_PRIMO_UPDATE', primogems: newTotal }));
            if (chestRes.rpgState) {
              ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state: chestRes.rpgState }));
            }
            const qBoss = rpgEngine.recordDailyQuestProgress(me.username, 'mmo_boss_or_guild', 1, persistOpt);
            notifyDailyQuestProgress(me.username, qBoss);

            ws.send(JSON.stringify({
              type: 'DUNGEON_CHEST_CLAIM_RESULT',
              success: true,
              ok: true,
              chestId: data.chestId,
              ...chestRes,
              newTotalPrimo: newTotal
            }));

            if (chestRes.isBonusChest || chestRes.rank === 'S') {
              broadcast({
                type: 'WORLD_DUNGEON_ANNOUNCE',
                username: me.username,
                zoneName: chestRes.zoneName,
                rank: chestRes.rank,
                isBonusChest: chestRes.isBonusChest,
                item: chestRes.item,
                primoGain: chestRes.primoGain
              });
            }
          }
        }
      } else if (data.type === 'WORLD_SELECT_ZONE') {
        const zoneId = data.zoneId;
        const isDungeon = zoneId && zoneId.startsWith('dungeon_tier_');
        const party = worldEngine.getPartyBySocket(socketId);
        const me = worldEngine.getPlayer(socketId);

        if (isDungeon) {
          if (party) {
            if (party.leaderId !== socketId) {
              ws.send(JSON.stringify({ type: 'PARTY_ERROR', error: 'Yalnızca parti lideri zindanı başlatabilir!' }));
              return;
            }
            // Start Ready Check for all party members (15s)
            const rcId = 'rc_' + Date.now();
            const rc = {
              id: rcId,
              partyId: party.id,
              tierId: zoneId,
              votes: new Map([[socketId, true]]),
              members: [...party.members],
              timeout: setTimeout(() => {
                worldEngine.pendingReadyChecks.delete(rcId);
                const inst = worldEngine.getOrCreateDungeonInstance(party.id, zoneId);
                for (const memberSocketId of party.members) {
                  const zRes = worldEngine.switchZone(memberSocketId, inst.id);
                  if (zRes.success) {
                    sendToSocket(memberSocketId, {
                      type: 'WORLD_DOOR_RESULT',
                      success: true,
                      newMap: inst.id,
                      spawnPos: zRes.spawnPos
                    });
                    sendToSocket(memberSocketId, {
                      type: 'DUNGEON_INSTANCE_INFO',
                      instanceId: inst.id,
                      tierId: inst.tierId,
                      stage: inst.stage,
                      stage1Cleared: inst.stage1Cleared,
                      stage2Cleared: inst.stage2Cleared,
                      bossDefeated: inst.bossDefeated,
                      phase2ShieldActive: inst.phase2ShieldActive,
                      mobs: inst.getMobList()
                    });
                  }
                }
              }, 15000)
            };
            worldEngine.pendingReadyChecks.set(rcId, rc);
            broadcastToSockets(party.members, {
              type: 'PARTY_READY_CHECK_START',
              readyCheckId: rcId,
              tierId: zoneId,
              leaderName: me ? me.username : 'Lider',
              timeoutSec: 15
            });
            return;
          }

          // Public / Matchmaking Player Dungeon Entry: Share the public instance for this tier so all players fight together!
          const sharedInst = worldEngine.getOrCreateDungeonInstance(null, zoneId);
          const zoneRes = worldEngine.switchZone(socketId, sharedInst.id);
          if (zoneRes.success) {
            ws.send(JSON.stringify({
              type: 'WORLD_DOOR_RESULT',
              success: true,
              newMap: sharedInst.id,
              spawnPos: zoneRes.spawnPos
            }));
            ws.send(JSON.stringify({
              type: 'DUNGEON_INSTANCE_INFO',
              instanceId: sharedInst.id,
              tierId: sharedInst.tierId,
              stage: sharedInst.stage,
              stage1Cleared: sharedInst.stage1Cleared,
              stage2Cleared: sharedInst.stage2Cleared,
              bossDefeated: sharedInst.bossDefeated,
              phase2ShieldActive: sharedInst.phase2ShieldActive,
              mobs: sharedInst.getMobList()
            }));
          }
          return;
        }

        // Open Grinding Zones & Town
        const zoneRes = worldEngine.switchZone(socketId, data.zoneId);
        if (zoneRes.success) {
          ws.send(JSON.stringify({
            type: 'WORLD_DOOR_RESULT',
            success: true,
            newMap: data.zoneId,
            spawnPos: zoneRes.spawnPos
          }));
        }
      } else if (data.type === 'PARTY_READY_CHECK_VOTE') {
        const rc = worldEngine.pendingReadyChecks.get(data.readyCheckId);
        if (rc) {
          rc.votes.set(socketId, Boolean(data.accept));
          const me = worldEngine.getPlayer(socketId);
          broadcastToSockets(rc.members, {
            type: 'PARTY_READY_CHECK_UPDATE',
            readyCheckId: rc.id,
            socketId,
            username: me ? me.username : 'Oyuncu',
            accept: Boolean(data.accept)
          });

          if (!data.accept) {
            clearTimeout(rc.timeout);
            worldEngine.pendingReadyChecks.delete(data.readyCheckId);
            broadcastToSockets(rc.members, {
              type: 'PARTY_READY_CHECK_CANCELLED',
              reason: `@${me ? me.username : 'Bir üye'} zindan girişini reddetti.`
            });
            return;
          }

          const allAccepted = rc.members.every(sid => rc.votes.get(sid) === true);
          if (allAccepted) {
            clearTimeout(rc.timeout);
            worldEngine.pendingReadyChecks.delete(data.readyCheckId);
            const inst = worldEngine.getOrCreateDungeonInstance(rc.partyId, rc.tierId);
            for (const memberSocketId of rc.members) {
              const zRes = worldEngine.switchZone(memberSocketId, inst.id);
              if (zRes.success) {
                sendToSocket(memberSocketId, {
                  type: 'WORLD_DOOR_RESULT',
                  success: true,
                  newMap: inst.id,
                  spawnPos: zRes.spawnPos
                });
                sendToSocket(memberSocketId, {
                  type: 'DUNGEON_INSTANCE_INFO',
                  instanceId: inst.id,
                  tierId: inst.tierId,
                  stage: inst.stage,
                  stage1Cleared: inst.stage1Cleared,
                  stage2Cleared: inst.stage2Cleared,
                  bossDefeated: inst.bossDefeated,
                  phase2ShieldActive: inst.phase2ShieldActive,
                  mobs: inst.getMobList()
                });
              }
            }
          }
        }
      } else if (data.type === 'PARTY_CREATE') {
        const pRes = worldEngine.createParty(socketId);
        if (pRes.ok) {
          ws.send(JSON.stringify({ type: 'PARTY_UPDATE', party: pRes.party }));
        } else {
          ws.send(JSON.stringify({ type: 'PARTY_ERROR', error: pRes.error }));
        }
      } else if (data.type === 'PARTY_INVITE') {
        const pRes = worldEngine.inviteToParty(socketId, data.targetUsername);
        if (pRes.ok) {
          sendToSocket(pRes.targetSocketId, {
            type: 'PARTY_INVITE_PROMPT',
            inviteId: pRes.inviteId,
            leaderName: pRes.leaderName,
            partyId: pRes.partyId
          });
          ws.send(JSON.stringify({
            type: 'PARTY_INVITE_SENT',
            targetName: pRes.targetName
          }));
        } else {
          ws.send(JSON.stringify({ type: 'PARTY_ERROR', error: pRes.error }));
        }
      } else if (data.type === 'PARTY_ACCEPT') {
        const pRes = worldEngine.acceptPartyInvite(socketId, data.inviteId);
        if (pRes.ok) {
          broadcastToSockets(pRes.party.members.map(m => m.id), {
            type: 'PARTY_UPDATE',
            party: pRes.party
          });
        } else {
          ws.send(JSON.stringify({ type: 'PARTY_ERROR', error: pRes.error }));
        }
      } else if (data.type === 'PARTY_DECLINE') {
        const pRes = worldEngine.declinePartyInvite(socketId, data.inviteId);
        if (pRes.ok && pRes.leaderSocketId) {
          const me = worldEngine.getPlayer(socketId);
          sendToSocket(pRes.leaderSocketId, {
            type: 'PARTY_DECLINED',
            username: me ? me.username : 'Oyuncu'
          });
        }
      } else if (data.type === 'PARTY_LEAVE') {
        const pRes = worldEngine.leaveParty(socketId);
        ws.send(JSON.stringify({ type: 'PARTY_LEFT' }));
        if (pRes.ok && !pRes.disbanded && pRes.remainingMembers) {
          broadcastToSockets(pRes.remainingMembers, {
            type: 'PARTY_UPDATE',
            party: pRes.party
          });
        }
      } else if (data.type === 'PARTY_KICK') {
        const pRes = worldEngine.kickMember(socketId, data.targetSocketId);
        if (pRes.ok) {
          sendToSocket(pRes.kickedSocketId, { type: 'PARTY_KICKED' });
          broadcastToSockets(pRes.party.members.map(m => m.id), {
            type: 'PARTY_UPDATE',
            party: pRes.party
          });
        } else {
          ws.send(JSON.stringify({ type: 'PARTY_ERROR', error: pRes.error }));
        }
      } else if (data.type === 'PARTY_UPDATE_HP') {
        const hpRes = worldEngine.updatePlayerCombatHp(socketId, data.hp, data.maxHp);
        if (hpRes && hpRes.members) {
          broadcastToSockets(hpRes.members, {
            type: 'PARTY_MEMBER_HP_UPDATE',
            socketId,
            username: hpRes.username,
            hp: hpRes.hp,
            maxHp: hpRes.maxHp
          });
        }
      } else if (data.type === 'DUNGEON_MOB_HIT') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const inst = worldEngine.getDungeonInstance(data.instanceId) || worldEngine.getDungeonInstance(me.mapId);
          if (inst) {
            const targetMapId = inst.id;
            const hitRes = inst.applyHit(data.mobId, data.dmg, me.username, data.isCrit, data.element);
            if (hitRes) {
              broadcastToMap(targetMapId, {
                type: 'DUNGEON_MOB_DAMAGED',
                instanceId: targetMapId,
                mobId: data.mobId,
                dmg: hitRes.dmg,
                newHp: hitRes.newHp,
                maxHp: hitRes.maxHp,
                isDead: hitRes.isDead,
                isCrit: Boolean(data.isCrit),
                element: data.element,
                attackerName: me.username
              });

              for (const ev of hitRes.events) {
                if (ev.type === 'STAGE_CLEAR') {
                  broadcastToMap(targetMapId, { type: 'DUNGEON_STAGE_CLEAR', stage: ev.stage });
                } else if (ev.type === 'BOSS_PHASE_2') {
                  broadcastToMap(targetMapId, { type: 'DUNGEON_BOSS_PHASE', phase: 2, newMobs: ev.newMobs });
                } else if (ev.type === 'SHIELD_DOWN') {
                  broadcastToMap(targetMapId, { type: 'DUNGEON_SHIELD_DOWN' });
                } else if (ev.type === 'BOSS_PHASE_3') {
                  broadcastToMap(targetMapId, { type: 'DUNGEON_BOSS_PHASE', phase: 3, safeZone: ev.safeZone });
                } else if (ev.type === 'VICTORY') {
                  broadcastToMap(targetMapId, { type: 'DUNGEON_VICTORY', ...ev });
                }
              }
            }
          }
        }
      } else if (data.type === 'PVP_PLAYER_HIT') {
        const attacker = worldEngine.getPlayer(socketId);
        const target = worldEngine.getPlayer(data.targetSocketId);
        if (attacker && target && attacker.mapId === 'pvp_arena' && target.mapId === 'pvp_arena') {
          // Check that both players are inside the circular combat pit (radius <= 18.2)
          const attDist = Math.hypot(attacker.x, attacker.z);
          const tgtDist = Math.hypot(target.x, target.z);
          if (attDist <= 18.2 && tgtDist <= 18.2) {
            const attProfile = rpgEngine.getProfile(attacker.username);
            const attStats = attProfile ? rpgEngine.computeStats(attProfile) : { atk: 25, crit: 5, critDmg: 150 };

            const tgtProfile = rpgEngine.getProfile(target.username);
            const tgtStats = tgtProfile ? rpgEngine.computeStats(tgtProfile) : { def: 10, hp: 600 };

            // Balanced PvP Damage Scaling
            const comboMult = { 1: 0.9, 2: 1.1, 3: 1.35, 4: 1.8, heavy: 1.6, vortex: 2.1, burst: 3.2 };
            const mult = comboMult[data.action] || 1.0;
            let rawDmg = Math.round((attStats.atk || 25) * mult);

            // Crit roll
            const isCrit = (Math.random() * 100) < (attStats.crit || 5);
            if (isCrit) {
              rawDmg = Math.round(rawDmg * ((attStats.critDmg || 150) / 100));
            }

            // DEF mitigation: def / (def + 160)
            const def = tgtStats.def || 0;
            const defReduction = def / (def + 160);
            const finalDmg = Math.max(12, Math.round(rawDmg * (1 - defReduction) * 0.55));

            // PvP effective Max HP is 2.5x standard RPG max HP (prevents one-shots)
            const baseMaxHp = tgtStats.hp || 500;
            const pvpMaxHp = Math.round(baseMaxHp * 2.5);

            if (typeof target.pvpHp !== 'number') {
              target.pvpHp = pvpMaxHp;
            }
            target.pvpHp = Math.max(0, target.pvpHp - finalDmg);

            const isDead = target.pvpHp <= 0;

            // Broadcast hit visual & damage number to all players in pvp_arena
            broadcastToMap('pvp_arena', {
              type: 'PVP_HIT_EFFECT',
              attackerSocketId: socketId,
              attackerName: attacker.username,
              targetSocketId: data.targetSocketId,
              targetName: target.username,
              dmg: finalDmg,
              isCrit,
              element: data.element || 'Pyro',
              newHp: target.pvpHp,
              maxHp: pvpMaxHp,
              isDead
            });

            if (isDead) {
              const killResult = rpgEngine.recordPvPKill(attacker.username, target.username);

              // Reset target to full HP and respawn safely on the spectator terrace
              target.pvpHp = pvpMaxHp;
              target.x = 0;
              target.z = -24;
              worldEngine.updateMovement(data.targetSocketId, { x: 0, z: -24, rot: 0 });

              // Broadcast killfeed event
              broadcastToMap('pvp_arena', {
                type: 'PVP_KILLFEED',
                killerName: attacker.username,
                victimName: target.username,
                primoGain: killResult && killResult.killer ? killResult.killer.primoGain : 0,
                targetSocketId: data.targetSocketId,
                respawnPos: { x: 0, z: -24 }
              });

              // Broadcast updated PvP leaderboard
              const pvpBoard = rpgEngine.getPvPLeaderboard(5);
              broadcastToMap('pvp_arena', {
                type: 'PVP_LEADERBOARD_UPDATE',
                leaderboard: pvpBoard
              });
            }
          }
        }
      } else if (data.type === 'PVP_REQUEST_LEADERBOARD') {
        const pvpBoard = rpgEngine.getPvPLeaderboard(10);
        ws.send(JSON.stringify({
          type: 'PVP_LEADERBOARD_UPDATE',
          leaderboard: pvpBoard
        }));
      } else if (data.type === 'DUNGEON_REQUEST_MOBS') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const inst = worldEngine.getDungeonInstance(data.instanceId) ||
                       worldEngine.getDungeonInstance(me.mapId) ||
                       worldEngine.getOrCreateDungeonInstance(null, data.instanceId || me.mapId);
          if (inst) {
            ws.send(JSON.stringify({
              type: 'DUNGEON_INSTANCE_INFO',
              instanceId: inst.id,
              tierId: inst.tierId,
              stage: inst.stage,
              stage1Cleared: inst.stage1Cleared,
              stage2Cleared: inst.stage2Cleared,
              bossDefeated: inst.bossDefeated,
              phase2ShieldActive: inst.phase2ShieldActive,
              mobs: inst.getMobList()
            }));
          }
        }
      } else if (data.type === 'WORLD_PLAYER_DEFEAT') {
        const me = worldEngine.getPlayer(socketId);
        if (me && me.mapId && me.mapId.startsWith('dungeon_tier_')) {
          const inst = worldEngine.getDungeonInstance(me.mapId);
          let spawnPos = { x: 0, z: -60 };
          if (inst) {
            if (inst.stage === 2) spawnPos = { x: 0, z: -6 };
            else if (inst.stage === 3) spawnPos = { x: 0, z: 42 };
            inst.score = Math.max(0, inst.score - 200);
          }
          me.x = spawnPos.x;
          me.y = 0;
          me.z = spawnPos.z;
          me.anim = 'idle';
          ws.send(JSON.stringify({
            type: 'WORLD_DOOR_RESULT',
            success: true,
            newMap: me.mapId,
            spawnPos
          }));
        } else {
          const respawned = worldEngine.respawnPlayer(socketId);
          if (respawned) {
            ws.send(JSON.stringify({
              type: 'WORLD_DOOR_RESULT',
              success: true,
              newMap: 'town',
              spawnPos: { x: 0, z: 2 }
            }));
            worldEngine.addChatBubble(socketId, `💀 Kasaba meydanında dinleniyor.`);
          }
        }
      } else if (data.type === 'RPG_GET_PROFILE') {
        const me = worldEngine.getPlayer(socketId);
        const target = data.username || (me ? me.username : null);
        if (target) {
          const state = rpgEngine.getState(target, { persist: me ? !me.isGuest : false });
          ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state }));
        }
      } else if (data.type === 'RPG_EQUIP') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.uid) {
          const res = rpgEngine.equip(me.username, data.uid);
          const state = rpgEngine.getState(me.username);
          ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state, equipResult: res }));
        }
      } else if (data.type === 'RPG_UNEQUIP') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.slot) {
          const res = rpgEngine.unequip(me.username, data.slot);
          const state = rpgEngine.getState(me.username);
          ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state, unequipResult: res }));
        }
      } else if (data.type === 'RPG_UPGRADE') {
        const me = worldEngine.getPlayer(socketId);
        if (me && data.uid) {
          const res = rpgEngine.upgrade(me.username, data.uid);
          const state = rpgEngine.getState(me.username);
          ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state, upgradeResult: res }));
        }
      } else if (data.type === 'RPG_SALVAGE') {
        const me = worldEngine.getPlayer(socketId);
        if (me) {
          const res = rpgEngine.salvage(me.username, { uid: data.uid, maxRarity: data.maxRarity });
          const state = rpgEngine.getState(me.username);
          ws.send(JSON.stringify({ type: 'RPG_PROFILE_STATE', state, salvageResult: res }));
        }
      } else if (data.type === 'RPG_INSPECT_REQ') {
        const target = (data.targetUser || '').trim();
        if (target) {
          const targetPlayer = worldEngine.getPlayerByName(target);
          const profile = rpgEngine.getState(target, { persist: targetPlayer ? !targetPlayer.isGuest : true });
          if (profile) {
            ws.send(JSON.stringify({
              type: 'RPG_INSPECT_DATA',
              target: target,
              isGuest: targetPlayer ? targetPlayer.isGuest : false,
              avatarIndex: targetPlayer ? targetPlayer.avatarIndex : 0,
              profilePic: targetPlayer ? targetPlayer.profilePic : '',
              profile
            }));
          } else {
            ws.send(JSON.stringify({ type: 'RPG_INSPECT_DATA', error: 'Oyuncu bulunamadı.' }));
          }
        }
      }
      // --- MMO P2P Trade Messages ---
      else if (data.type === 'TRADE_REQUEST') {
        const targetPlayer = worldEngine.getPlayerByName(data.targetUser);
        const me = worldEngine.getPlayer(socketId);
        if (targetPlayer && me) {
          broadcast({
            type: 'TRADE_INVITE',
            initiator: me.username,
            target: targetPlayer.username,
            targetSocketId: targetPlayer.id
          });
        }
      } else if (data.type === 'TRADE_RESPOND') {
        if (data.accepted) {
          const res = tradeEngine.startSession(data.initiator, data.responder);
          if (res.success) {
            broadcast({ type: 'TRADE_SESSION_STARTED', session: res.session });
          } else {
            ws.send(JSON.stringify({ type: 'TRADE_ERROR', error: res.error }));
          }
        } else {
          broadcast({ type: 'TRADE_DECLINED', initiator: data.initiator, responder: data.responder });
        }
      } else if (data.type === 'TRADE_UPDATE') {
        const res = tradeEngine.updateOffer(data.tradeId, data.username, {
          items: data.items,
          primogems: data.primogems
        });
        if (res.success) {
          broadcast({ type: 'TRADE_SESSION_UPDATED', session: res.session });
        }
      } else if (data.type === 'TRADE_TOGGLE_LOCK') {
        const res = tradeEngine.toggleLock(data.tradeId, data.username, data.locked);
        if (res.success) {
          broadcast({ type: 'TRADE_SESSION_UPDATED', session: res.session });
        }
      } else if (data.type === 'TRADE_CONFIRM') {
        const res = tradeEngine.confirmTrade(data.tradeId, data.username);
        if (res.success) {
          if (res.session && res.session.status === 'COMPLETED') {
            broadcast({ type: 'TRADE_COMPLETED', session: res.session, message: res.message });
          } else {
            broadcast({ type: 'TRADE_SESSION_UPDATED', session: res.session });
          }
        } else {
          ws.send(JSON.stringify({ type: 'TRADE_ERROR', error: res.error }));
        }
      } else if (data.type === 'TRADE_CANCEL') {
        tradeEngine.cancelSession(data.tradeId, data.reason || 'Kullanıcı takası kapattı.');
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    worldEngine.removePlayer(socketId);
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

// MMO 3D Pixel World REST Endpoints
app.get('/world', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'world.html'));
});

app.get('/api/world/state', (req, res) => {
  res.json({
    onlineCount: worldEngine.players.size,
    maps: worldEngine.maps,
    states: worldEngine.getMapStates()
  });
});

app.get('/api/world/inventory', (req, res) => {
  const username = (req.query.user || '').trim();
  if (!username) return res.json({ inventory: [], primogems: 0 });
  const user = gachaEngine.getOrCreateUser(username);
  res.json({
    username: user.username,
    primogems: user.primogems || 0,
    inventory: (user.inventory || []).map((item, index) => ({
      index,
      id: item.id || null,
      name: item.name,
      rarity: item.rarity,
      type: item.type,
      sellPrice: item.sellPrice || 0,
      element: item.element,
      icon: item.icon || item.remoteIcon || item.splashArt,
      desc: item.desc || item.description || '',
      weaponType: item.weaponType
    }))
  });
});

app.post('/api/world/sell-materials', express.json(), (req, res) => {
  const { username, itemId, sellAll, quantity } = req.body || {};
  if (!username) return res.status(400).json({ success: false, message: 'Kullanıcı adı belirtilmedi.' });
  const user = gachaEngine.getOrCreateUser(username);
  if (!user || !user.inventory) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

  let soldItems = [];
  let remaining = [];
  let soldCountForId = 0;
  const maxToSell = quantity || Infinity;

  user.inventory.forEach(item => {
    if (item.type === 'material') {
      if (sellAll) {
        soldItems.push(item);
      } else if (itemId && item.id === itemId && soldCountForId < maxToSell) {
        soldItems.push(item);
        soldCountForId++;
      } else {
        remaining.push(item);
      }
    } else {
      remaining.push(item);
    }
  });

  if (soldItems.length === 0) {
    return res.json({ success: false, message: 'Satılacak materyal bulunamadı.' });
  }

  const earnedPrimo = soldItems.reduce((acc, it) => acc + (parseInt(it.sellPrice, 10) || 0), 0);
  user.inventory = remaining;
  user.primogems = (user.primogems || 0) + earnedPrimo;
  gachaEngine.saveUsers();

  // Sync with worldEngine if player is online
  const onlinePlayers = worldEngine.getPlayers ? worldEngine.getPlayers() : [];
  for (const p of onlinePlayers) {
    if (p.username && p.username.toLowerCase() === username.toLowerCase()) {
      p.primogems = user.primogems;
    }
  }

  res.json({
    success: true,
    earnedPrimo,
    newTotalPrimo: user.primogems,
    soldCount: soldItems.length,
    remainingMaterials: remaining.filter(i => i.type === 'material')
  });
});

// --- MMORPG Item, GearScore (GS) & PvP REST Endpoints ---
app.get('/api/rpg/pvp-leaderboard', (req, res) => {
  res.json({ ok: true, leaderboard: rpgEngine.getPvPLeaderboard(15) });
});

app.get('/api/world/daily-quests', (req, res) => {
  const username = (req.query.username || req.query.user || '').trim();
  if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı gerekli.' });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getDailyQuestsState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: true, state });
});

app.post('/api/world/daily-quests/visit-guild', express.json(), (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı gerekli.' });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const qGuild = rpgEngine.recordDailyQuestProgress(username, 'mmo_boss_or_guild', 1, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  notifyDailyQuestProgress(username, qGuild);
  res.json({ ok: true, updated: qGuild.updated, state: qGuild.state });
});

app.post('/api/world/daily-quests/claim', express.json(), (req, res) => {
  const { username, questId } = req.body || {};
  if (!username || !questId) return res.status(400).json({ ok: false, error: 'Eksik parametre.' });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const persistOpt = { persist: onlinePlayer ? !onlinePlayer.isGuest : true };
  const result = questId === 'all'
    ? rpgEngine.claimAllAvailableDailyQuests(username, persistOpt)
    : rpgEngine.claimDailyQuest(username, questId, persistOpt);
  let newTotalPrimo = null;
  if (result.ok && result.primoGain > 0) {
    newTotalPrimo = awardUserPrimogemsByName(username, result.primoGain);
  }
  res.json({
    ...result,
    newTotalPrimo
  });
});

app.post('/api/world/dungeon/claim-chest', express.json(), (req, res) => {
  const { username, tierId, rank, isBonusChest } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı gerekli.' });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const persistOpt = { persist: onlinePlayer ? !onlinePlayer.isGuest : true };
  const chestRes = rpgEngine.claimDungeonChest(username, { tierId, rank, isBonusChest: Boolean(isBonusChest) }, persistOpt);
  let newTotalPrimo = null;
  if (chestRes.ok && chestRes.primoGain > 0) {
    newTotalPrimo = awardUserPrimogemsByName(username, chestRes.primoGain);
  }
  const qBoss = rpgEngine.recordDailyQuestProgress(username, 'mmo_boss_or_guild', 1, persistOpt);
  notifyDailyQuestProgress(username, qBoss);
  res.json({
    ...chestRes,
    newTotalPrimo
  });
});

app.get('/api/rpg/profile', (req, res) => {
  const username = (req.query.username || req.query.user || '').trim();
  if (!username) return res.status(400).json({ ok: false, error: 'Kullanıcı adı gerekli.' });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: true, state });
});

app.post('/api/rpg/equip', express.json(), (req, res) => {
  const { username, uid } = req.body || {};
  if (!username || !uid) return res.status(400).json({ ok: false, error: 'Eksik parametre.' });
  const result = rpgEngine.equip(username, uid);
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: result.ok, error: result.error, result, state });
});

app.post('/api/rpg/unequip', express.json(), (req, res) => {
  const { username, slot } = req.body || {};
  if (!username || !slot) return res.status(400).json({ ok: false, error: 'Eksik parametre.' });
  const result = rpgEngine.unequip(username, slot);
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: result.ok, error: result.error, result, state });
});

app.post('/api/rpg/upgrade', express.json(), (req, res) => {
  const { username, uid } = req.body || {};
  if (!username || !uid) return res.status(400).json({ ok: false, error: 'Eksik parametre.' });
  const result = rpgEngine.upgrade(username, uid);
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: result.ok, error: result.error, result, state });
});

app.post('/api/rpg/salvage', express.json(), (req, res) => {
  const { username, uid, maxRarity } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Eksik parametre.' });
  const result = rpgEngine.salvage(username, { uid, maxRarity });
  const onlinePlayer = worldEngine.getPlayerByName(username);
  const state = rpgEngine.getState(username, { persist: onlinePlayer ? !onlinePlayer.isGuest : true });
  res.json({ ok: result.ok, error: result.error, result, state });
});

app.get('/api/rpg/inspect', (req, res) => {
  const target = (req.query.target || req.query.username || req.query.user || '').trim();
  if (!target) return res.status(400).json({ ok: false, error: 'Hedef kullanıcı adı gerekli.' });
  const targetPlayer = worldEngine.getPlayerByName(target);
  const state = rpgEngine.getState(target, { persist: targetPlayer ? !targetPlayer.isGuest : true });
  if (!state) return res.status(404).json({ ok: false, error: 'Profil bulunamadı.' });
  res.json({
    ok: true,
    target,
    isGuest: targetPlayer ? targetPlayer.isGuest : false,
    avatarIndex: targetPlayer ? targetPlayer.avatarIndex : 0,
    profilePic: targetPlayer ? targetPlayer.profilePic : '',
    profile: state
  });
});

app.get('/api/rpg/leaderboard', (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const leaderboard = rpgEngine.getLeaderboard(limit);
  res.json({ ok: true, leaderboard });
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

// 🐾 5-Star Character Companions Endpoint (Strict 5★, Owned Only)
app.get('/api/companions/:username', (req, res) => {
  const username = req.params.username || '';
  const list = worldEngine.getUser5Stars(username);
  const u = gachaEngine ? gachaEngine.getOrCreateUser(username) : null;
  const isCompanionValid = list.some(c => c.name.toLowerCase() === (u?.activeCompanion || '').toLowerCase());
  res.json({
    ok: true,
    success: true,
    username,
    companions: list,
    activeCompanion: isCompanionValid ? u.activeCompanion : null
  });
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

app.get('/api/gacha/user/:username/inventory', (req, res) => {
  const username = (req.params.username || '').trim();
  const user = gachaEngine ? gachaEngine.getOrCreateUser(username) : null;
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json({
    ok: true,
    username: user.username,
    primogems: user.primogems,
    inventory: user.inventory || [],
    fiveStars: (user.inventory || []).filter(i => i.rarity === 5),
    fourStars: (user.inventory || []).filter(i => i.rarity === 4)
  });
});

app.post('/api/gacha/user/add-character', (req, res) => {
  const { username, characterName } = req.body || {};
  if (!username || !characterName) return res.status(400).json({ error: 'Kullanıcı adı ve karakter adı gerekli.' });
  const meta = gachaEngine.characters.find(
    c => c.name.toLowerCase() === characterName.trim().toLowerCase() ||
         (c.slug && c.slug.toLowerCase() === characterName.trim().toLowerCase())
  );
  if (!meta) return res.status(404).json({ error: `'${characterName}' adlı karakter Genshin havuzunda bulunamadı.` });
  const user = gachaEngine.getOrCreateUser(username.trim());
  if (!Array.isArray(user.inventory)) user.inventory = [];
  const alreadyHas = user.inventory.some(i => i.name.toLowerCase() === meta.name.toLowerCase());
  if (!alreadyHas) {
    user.inventory.push({
      name: meta.name,
      rarity: meta.rarity,
      type: 'character',
      element: meta.element,
      weaponType: meta.weaponType,
      region: meta.region,
      title: meta.title,
      icon: meta.icon,
      remoteIcon: meta.remoteIcon,
      splashArt: meta.splashArt,
      pulledAt: new Date().toISOString()
    });
    if (meta.rarity === 5) {
      user.fiveStarsCount = (user.fiveStarsCount || 0) + 1;
    } else if (meta.rarity === 4) {
      user.fourStarsCount = (user.fourStarsCount || 0) + 1;
    }
    gachaEngine.saveUsers();
  }

  // Live Broadcast to MMO World
  if (worldEngine) {
    const p = worldEngine.getPlayerByName(username.trim());
    if (p) {
      const comps = worldEngine.getUser5Stars(username.trim());
      broadcast({
        type: 'WORLD_COMPANIONS_LIST',
        username: p.username,
        companions: comps,
        activeCompanion: p.companion || null
      });
    }
  }

  res.json({
    success: true,
    message: `✨ ${meta.name} (${meta.rarity}★ ${meta.element}) başarıyla @${user.username} envanterine eklendi!`,
    character: meta,
    user
  });
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
