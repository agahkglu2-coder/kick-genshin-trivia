const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const { KickClient, cleanChannelSlug } = require('./kickClient');
const { KickBotService } = require('./kickBot');
const { GameEngine } = require('./gameEngine');
const { GachaEngine } = require('./gachaEngine');

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
  enabled: config.botEnabled !== false,
  cooldownSeconds: 8
});
const gameEngine = new GameEngine(config);
const gachaEngine = new GachaEngine();

let kickStatus = {
  connected: false,
  channel: config.channel || '',
  chatroomId: null,
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
    botStatus: kickBot.getStatus(),
    config: gameEngine.config
  }));
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    gameState: gameEngine.getFullState(),
    kickStatus: kickStatus,
    botStatus: kickBot.getStatus(),
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

// Kick Bot REST Endpoints
app.get('/api/bot/status', (req, res) => {
  res.json(kickBot.getStatus());
});

app.post('/api/bot/config', (req, res) => {
  const { token, enabled } = req.body || {};
  if (token !== undefined) {
    config.botToken = token;
    kickBot.setToken(token);
  }
  if (enabled !== undefined) {
    config.botEnabled = !!enabled;
    kickBot.setEnabled(!!enabled);
  }
  saveConfig(config);
  broadcast({ type: 'BOT_STATUS', status: kickBot.getStatus() });
  res.json({ success: true, status: kickBot.getStatus() });
});

app.post('/api/bot/test-message', (req, res) => {
  const { message } = req.body || {};
  const text = message || '✨ Paimon Bot test mesajı: Sistem aktif ve çalışıyor!';
  kickBot.sendMessage(text);
  res.json({ success: true, message: text });
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
