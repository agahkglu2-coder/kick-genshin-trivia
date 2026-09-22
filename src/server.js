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
      channel: 'zerkacy',
      intervalMinutes: 10,
      questionDurationSeconds: 45,
      winnerDisplaySeconds: 12,
      leaderboardCooldownSeconds: 60,
      gameMode: 'first_correct',
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

const config = loadConfig();
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
  botUsername: config.botUsername || null,
  enabled: config.botEnabled !== false,
  cooldownSeconds: 8
});

// Pre-fill KickBot channel & broadcaster ID if known
try {
  const KNOWN_CHANNELS_PATH = path.join(__dirname, '..', 'data', 'known_channels.json');
  if (fs.existsSync(KNOWN_CHANNELS_PATH)) {
    const kc = JSON.parse(fs.readFileSync(KNOWN_CHANNELS_PATH, 'utf-8'));
    const curChan = (config.channel || 'zerkacy').toLowerCase();
    if (kc[curChan]) {
      if (kc[curChan].chatroomId) kickBot.setChatroomId(kc[curChan].chatroomId);
      if (kc[curChan].broadcasterUserId) kickBot.setBroadcasterUserId(kc[curChan].broadcasterUserId);
      console.log(`[KickBot] Başlangıç kanalı '${curChan}' kimlikleri yüklendi: Chatroom #${kc[curChan].chatroomId}, User #${kc[curChan].broadcasterUserId}`);
    }
  }
} catch (e) {
  console.warn('[Server] known_channels.json okunamadı:', e.message);
}

const gameEngine = new GameEngine(config);
const gachaEngine = new GachaEngine();

// Initialize persistent database (PostgreSQL or local fallback)
db.init(process.env.DATABASE_URL || config.databaseUrl).then(async () => {
  const savedToken = db.getSetting('botToken');
  const savedBotUser = db.getSetting('botUsername');
  const savedClientId = db.getSetting('botClientId');
  const savedClientSecret = db.getSetting('botClientSecret');
  const savedTargetChan = db.getSetting('botTargetChannel');

  if (savedToken && !config.botToken) {
    config.botToken = savedToken;
    kickBot.setToken(savedToken);
  }
  if (savedBotUser && !config.botUsername) {
    config.botUsername = savedBotUser;
    kickBot.setUsername(savedBotUser);
  }
  if (savedClientId && !config.botClientId) config.botClientId = savedClientId;
  if (savedClientSecret && !config.botClientSecret) config.botClientSecret = savedClientSecret;
  if (savedTargetChan && !config.botTargetChannel) config.botTargetChannel = savedTargetChan;

  if (gachaEngine) {
    gachaEngine.loadData();
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

kickClient.on('message', (chatMsg) => {
  // Feed to GameEngine for answer checking
  gameEngine.handleChatMessage(chatMsg);

  // Feed to GachaEngine for Primogem rewards & commands (!wish, !bakiye, !envanter, etc.)
  gachaEngine.handleChatMessage(chatMsg);

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
    gachaEngine.awardTriviaWinner(winData.winner.username, 60);
    // Announce winner in Kick chat
    kickBot.sendMessage(`🎉 Tebrikler @${winData.winner.username}! Doğru cevap vererek +60 Primogem kazandın!`);
  }
  broadcast({ type: 'WINNER_DECLARED', ...winData });
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
});

gachaEngine.on('primo_rain', (rainData) => {
  broadcast({ type: 'PRIMO_RAIN', ...rainData });
});

gachaEngine.on('primo_awarded', (awardData) => {
  broadcast({ type: 'PRIMO_AWARDED', ...awardData });
});

gachaEngine.on('chat_response', (resp) => {
  // Feed to KickBot with anti-spam cooldown check
  if (resp.username === 'Paimon' || kickBot.checkCooldown(resp.username)) {
    kickBot.sendMessage(resp.message);
  }
  broadcast({ type: 'GACHA_CHAT_RESPONSE', ...resp });
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

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  // Send initial full state immediately upon connect
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    gameState: gameEngine.getFullState(),
    kickStatus: kickStatus,
    botStatus: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || ''
    },
    config: gameEngine.config
  }));
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
app.post('/api/connect-channel', (req, res) => {
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
  }

  kickClient.connect(cleaned, chatroomId);
  res.json({ success: true, channel: cleaned || `chatroom_${chatroomId}`, chatroomId });
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: 'Geçersiz veri.' });

  const oldChannel = gameEngine.config.channel;
  if (newConfig.channel) {
    newConfig.channel = cleanChannelSlug(newConfig.channel);
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

app.get('/api/questions', (req, res) => {
  res.json(gameEngine.questions);
});

app.post('/api/questions', (req, res) => {
  try {
    const created = gameEngine.addQuestion(req.body);
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
  const { rarity } = req.body || {};
  const result = gachaEngine.triggerTestWish(parseInt(rarity, 10) || 5);
  res.json({ success: true, wish: result });
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
    targetChannel: config.botTargetChannel || config.channel || ''
  });
});

app.post('/api/bot/config', async (req, res) => {
  const { token, enabled, clientId, clientSecret, redirectUri, targetChannel, botUsername } = req.body || {};
  if (token !== undefined) {
    config.botToken = token;
    kickBot.setToken(token);
    await db.setSetting('botToken', token);
  }
  if (botUsername !== undefined) {
    config.botUsername = botUsername;
    kickBot.setUsername(botUsername);
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
  if (targetChannel !== undefined) {
    config.botTargetChannel = targetChannel.trim();
    await db.setSetting('botTargetChannel', config.botTargetChannel);
    const activeTarget = config.botTargetChannel || config.channel || 'zerkacy';
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
      targetChannel: config.botTargetChannel || config.channel || ''
    }
  });
  res.json({
    success: true,
    status: {
      ...kickBot.getStatus(),
      clientId: config.botClientId || '',
      redirectUri: config.botRedirectUri || '',
      targetChannel: config.botTargetChannel || config.channel || ''
    }
  });
});

app.post('/api/bot/target-channel', async (req, res) => {
  const { targetChannel } = req.body || {};
  const cleaned = cleanChannelSlug(targetChannel);
  const target = cleaned || (targetChannel ? String(targetChannel).trim() : '');

  config.botTargetChannel = target;
  saveConfig(config);

  const activeChannel = target || config.channel || 'zerkacy';
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

  const authUrl = `https://id.kick.com/oauth/authorize?client_id=${encodeURIComponent(cId)}&redirect_uri=${encodeURIComponent(effectiveRedirect)}&response_type=code&scope=user:read+chat:write+channel:read&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

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
    config.botToken = tokenData.access_token;
    kickBot.setToken(tokenData.access_token);
    await db.setSetting('botToken', tokenData.access_token);

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
        targetChannel: config.botTargetChannel || config.channel || ''
      }
    });

    const safeUsername = botUsername ? encodeURIComponent(botUsername) : '';
    const safeToken = encodeURIComponent(tokenData.access_token);

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
              ${botUsername ? `localStorage.setItem('kick_bot_username', '${botUsername}');` : ''}
            } catch(e) {}
            if (window.opener) {
              try {
                window.opener.postMessage({
                  type: 'KICK_AUTH_SUCCESS',
                  token: '${tokenData.access_token}',
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
    config.databaseUrl = databaseUrl.trim();
    saveConfig(config);
    try {
      await db.init(config.databaseUrl);
      if (gachaEngine) {
        gachaEngine.loadData();
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
      if (gachaEngine) {
        gachaEngine.loadData();
      }
    }
    if (importData.settings && typeof importData.settings === 'object') {
      for (const [k, v] of Object.entries(importData.settings)) {
        await db.setSetting(k, v);
      }
    }
    res.json({
      success: true,
      message: `${restoredUsers} Gezgin ve sistem ayarları başarıyla geri yüklendi!`,
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
