const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PUSHER_APP_KEY = '32cbd69e4b950bf97679';
const PUSHER_WS_URL = `wss://ws-us2.pusher.com/app/${PUSHER_APP_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;

const KNOWN_CHANNELS_FILE = path.join(__dirname, '..', 'data', 'known_channels.json');

function cleanChannelSlug(input) {
  if (!input) return '';
  let s = String(input).trim();
  s = s.replace(/^https?:\/\/(www\.)?kick\.com\//i, '');
  s = s.replace(/^kick\.com\//i, '');
  s = s.replace(/^[@/]+/, '');
  s = s.split('/')[0].split('?')[0].trim();
  return s.toLowerCase();
}

// In-memory cache for resolved channels
const RESOLVED_CHANNELS_CACHE = {};

// Load persistent known channels
function loadKnownChannels() {
  try {
    if (fs.existsSync(KNOWN_CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KNOWN_CHANNELS_FILE, 'utf-8'));
      for (const [slug, id] of Object.entries(data)) {
        RESOLVED_CHANNELS_CACHE[slug.toLowerCase()] = {
          chatroomId: typeof id === 'number' ? id : parseInt(id, 10),
          slug: slug.toLowerCase(),
          user: null
        };
      }
      console.log(`[KickClient] ${Object.keys(RESOLVED_CHANNELS_CACHE).length} bilinen kanal önbelleğe yüklendi.`);
    }
  } catch (e) {
    console.warn('[KickClient] known_channels.json okunamadı:', e.message);
  }
}

function saveKnownChannel(slug, chatroomId) {
  try {
    let existing = {};
    if (fs.existsSync(KNOWN_CHANNELS_FILE)) {
      existing = JSON.parse(fs.readFileSync(KNOWN_CHANNELS_FILE, 'utf-8'));
    }
    existing[slug] = chatroomId;
    fs.writeFileSync(KNOWN_CHANNELS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[KickClient] known_channels.json kaydedilemedi:', e.message);
  }
}

loadKnownChannels();

// Helper: Execute curl directly via child_process.spawn (with desktop browser headers)
function curlFetch(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    let stdout = '';
    let stderr = '';

    const args = [
      '-s', '-L',
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      url
    ];

    const proc = spawn(curlCmd, args);

    const timer = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Curl timeout'));
    }, timeoutMs);

    proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Curl exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

class KickClient extends EventEmitter {
  constructor() {
    super();
    this.channel = '';
    this.chatroomId = null;
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.manualDisconnect = false;
    this.connectSeq = 0;
  }

  // Universal channel resolver: works for ANY channel on both Windows and Linux
  async getChatroomId(channelSlug) {
    const slug = cleanChannelSlug(channelSlug);
    if (!slug) {
      throw new Error('Geçerli bir kanal adı veya bağlantısı girin.');
    }

    // 1. Direct Chatroom ID (user enters a numeric ID like 40879165 or 25712360)
    if (/^\d+$/.test(slug)) {
      return {
        chatroomId: parseInt(slug, 10),
        slug: slug,
        user: null
      };
    }

    // 2. In-memory & Persistent cache (0ms instant resolution)
    if (RESOLVED_CHANNELS_CACHE[slug]) {
      console.log(`[KickClient] Önbellekten yüklendi: '${slug}' (#${RESOLVED_CHANNELS_CACHE[slug].chatroomId})`);
      return RESOLVED_CHANNELS_CACHE[slug];
    }

    const endpoints = [
      `https://kick.com/api/v1/channels/${slug}`,
      `https://kick.com/api/v2/channels/${slug}`,
      `https://kick.com/api/v2/channels/${slug}/chatroom`
    ];

    // 3. Primary method: Spawn curl with browser headers
    for (const url of endpoints) {
      try {
        const stdout = await curlFetch(url, 7000);
        if (stdout && stdout.trim().startsWith('{')) {
          const data = JSON.parse(stdout);
          const cId = data.chatroom?.id || (data.id && typeof data.id === 'number' ? data.id : null);
          if (cId) {
            console.log(`[KickClient] ✅ curl ile kanal '${slug}' (#${cId}) çözüldü.`);
            const res = {
              chatroomId: cId,
              slug: data.slug || slug,
              user: data.user ? {
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : null
            };
            RESOLVED_CHANNELS_CACHE[slug] = res;
            saveKnownChannel(slug, cId);
            return res;
          }
        }
      } catch (errCurl) {
        // Try next endpoint
      }
    }

    // 4. Secondary method: Native fetch
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        });

        if (res.ok) {
          const data = await res.json();
          const cId = data.chatroom?.id || (data.id && typeof data.id === 'number' ? data.id : null);
          if (cId) {
            console.log(`[KickClient] ✅ fetch ile kanal '${slug}' (#${cId}) çözüldü.`);
            const result = {
              chatroomId: cId,
              slug: data.slug || slug,
              user: data.user ? {
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : null
            };
            RESOLVED_CHANNELS_CACHE[slug] = result;
            saveKnownChannel(slug, cId);
            return result;
          }
        }
      } catch (errFetch) {}
    }

    // 5. Tertiary method: Scrape webpage HTML for chatroom ID
    try {
      const html = await curlFetch(`https://kick.com/${slug}`, 7000);
      const match = html.match(/"chatroom":\s*\{\s*"id":\s*(\d+)/i) || 
                    html.match(/"chatroom_id":\s*(\d+)/i) ||
                    html.match(/"chatroomId":\s*(\d+)/i);
      if (match && match[1]) {
        const cId = parseInt(match[1], 10);
        console.log(`[KickClient] ✅ HTML parse ile kanal '${slug}' (#${cId}) çözüldü.`);
        const result = { chatroomId: cId, slug, user: null };
        RESOLVED_CHANNELS_CACHE[slug] = result;
        saveKnownChannel(slug, cId);
        return result;
      }
    } catch (eHtml) {}

    throw new Error(`Kick kanalı bulunamadı (${slug}). Lütfen kullanıcı adında yazım hatası olmadığından emin olun veya kanalın Sohbet Odası (Chatroom) ID numarasını girin.`);
  }

  async connect(channelSlug, directChatroomId = null) {
    const cleaned = cleanChannelSlug(channelSlug);
    if (!cleaned && !directChatroomId) {
      this.emit('status', { connected: false, message: 'Kanal adı belirtilmedi.' });
      return;
    }

    // Increase sequence number to cancel any stale connecting promises
    const currentSeq = ++this.connectSeq;

    this.disconnect();
    this.manualDisconnect = false;
    this.channel = cleaned || `chatroom_${directChatroomId}`;

    this.emit('status', {
      connected: false,
      channel: this.channel,
      message: `${this.channel} aranıyor...`
    });

    try {
      let cId = null;
      let cSlug = this.channel;

      if (directChatroomId && /^\d+$/.test(String(directChatroomId).trim())) {
        cId = parseInt(String(directChatroomId).trim(), 10);
        if (cleaned) {
          RESOLVED_CHANNELS_CACHE[cleaned] = { chatroomId: cId, slug: cleaned, user: null };
          saveKnownChannel(cleaned, cId);
        }
      } else {
        const info = await this.getChatroomId(this.channel);
        cId = info.chatroomId;
        cSlug = info.slug || this.channel;
      }

      if (currentSeq !== this.connectSeq) {
        // A newer connect call was initiated, discard this one
        return;
      }

      this.chatroomId = cId;
      this.channel = cSlug;

      this.emit('status', {
        connected: false,
        channel: this.channel,
        chatroomId: this.chatroomId,
        message: `Kanal (#${this.chatroomId}) bulundu, Pusher'a bağlanılıyor...`
      });

      this.initWebSocket(currentSeq);
    } catch (err) {
      if (currentSeq !== this.connectSeq) return;
      console.error(`[KickClient] Hata: ${err.message}`);
      this.emit('status', {
        connected: false,
        channel: this.channel,
        error: err.message
      });
    }
  }

  initWebSocket(seq) {
    if (this.manualDisconnect || seq !== this.connectSeq) return;

    try {
      const WebSocket = require('ws');
      this.ws = new WebSocket(PUSHER_WS_URL);

      this.ws.on('open', () => {
        if (seq !== this.connectSeq) {
          try { this.ws.close(); } catch(e) {}
          return;
        }
        console.log('[KickClient] Pusher bağlandı. Odaya abone olunuyor...');
        this.subscribeChatroom();
        this.startPing();
      });

      this.ws.on('message', (raw) => {
        if (seq !== this.connectSeq) return;
        this.handleMessage(raw);
      });

      this.ws.on('close', (code, reason) => {
        this.stopPing();
        this.isConnected = false;
        if (seq !== this.connectSeq) return;

        console.warn(`[KickClient] Pusher bağlantısı kapandı (${code}).`);
        this.emit('status', {
          connected: false,
          channel: this.channel,
          chatroomId: this.chatroomId,
          message: 'Bağlantı koptu, yeniden deneniyor...'
        });

        if (!this.manualDisconnect) {
          this.scheduleReconnect(seq);
        }
      });

      this.ws.on('error', (err) => {
        if (seq !== this.connectSeq) return;
        console.error(`[KickClient] WS Hatası: ${err.message}`);
      });

    } catch (err) {
      console.error('[KickClient] WebSocket oluşturulamadı:', err);
      this.scheduleReconnect(seq);
    }
  }

  subscribeChatroom() {
    if (!this.ws || this.ws.readyState !== 1 || !this.chatroomId) return;

    const subPayload = {
      event: 'pusher:subscribe',
      data: {
        auth: '',
        channel: `chatrooms.${this.chatroomId}.v2`
      }
    };

    this.ws.send(JSON.stringify(subPayload));
    console.log(`[KickClient] #${this.chatroomId} odasına abone olundu.`);
  }

  handleMessage(raw) {
    try {
      const msg = JSON.parse(raw.toString());

      // 1. Pusher Handshake
      if (msg.event === 'pusher:connection_established') {
        this.subscribeChatroom();
      }

      // 2. Subscription Succeeded
      if (msg.event === 'pusher_internal:subscription_succeeded') {
        this.isConnected = true;
        console.log(`[KickClient] ✅ ${this.channel} (ID: ${this.chatroomId}) sohbetine başarıyla bağlanıldı!`);
        this.emit('status', {
          connected: true,
          channel: this.channel,
          chatroomId: this.chatroomId,
          message: `${this.channel} sohbeti dinleniyor.`
        });
      }

      // 3. Chat Message Event
      if (msg.event === 'App\\Events\\ChatMessageEvent') {
        const chatData = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        if (!chatData) return;

        const parsed = {
          id: chatData.id,
          chatroomId: chatData.chatroom_id,
          content: chatData.content,
          type: chatData.type,
          createdAt: chatData.created_at,
          sender: {
            id: chatData.sender?.id,
            username: chatData.sender?.username,
            slug: chatData.sender?.slug,
            profilePic: chatData.sender?.profile_pic,
            badges: chatData.sender?.identity?.badges || []
          }
        };

        this.emit('message', parsed);
      }

      // 4. Ping response
      if (msg.event === 'pusher:pong') {
        // Healthy connection
      }

    } catch (e) {
      console.error('[KickClient] Mesaj ayrıştırma hatası:', e);
    }
  }

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
      }
    }, 30000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect(seq) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualDisconnect && seq === this.connectSeq) {
        console.log(`[KickClient] ${this.channel} kanalına yeniden bağlanılıyor...`);
        this.connect(this.channel);
      }
    }, 4000);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.chatroomId = null;
  }
}

module.exports = {
  KickClient,
  cleanChannelSlug
};
