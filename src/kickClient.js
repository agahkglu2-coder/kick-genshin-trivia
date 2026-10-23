const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CENTRIFUGO_DEFAULT_WS_URL = 'wss://realtime.us-west-2.platform.kick.com/connection/websocket';
const REALTIME_AUTH_URL = 'https://web.kick.com/api/v1/realtime/auth/connection';

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
      for (const [slug, val] of Object.entries(data)) {
        const cId = typeof val === 'object' ? val.chatroomId : (typeof val === 'number' ? val : parseInt(val, 10));
        const uId = typeof val === 'object' ? val.broadcasterUserId : null;
        RESOLVED_CHANNELS_CACHE[slug.toLowerCase()] = {
          chatroomId: cId,
          broadcasterUserId: uId,
          slug: slug.toLowerCase(),
          user: uId ? { id: uId, username: slug.toLowerCase() } : null
        };
      }
      console.log(`[KickClient] ${Object.keys(RESOLVED_CHANNELS_CACHE).length} bilinen kanal önbelleğe yüklendi.`);
    }
  } catch (e) {
    console.warn('[KickClient] known_channels.json okunamadı:', e.message);
  }
}

function saveKnownChannel(slug, chatroomId, broadcasterUserId = null) {
  try {
    let existing = {};
    if (fs.existsSync(KNOWN_CHANNELS_FILE)) {
      existing = JSON.parse(fs.readFileSync(KNOWN_CHANNELS_FILE, 'utf-8'));
    }
    existing[slug] = {
      chatroomId: typeof chatroomId === 'object' ? chatroomId.chatroomId : chatroomId,
      broadcasterUserId: broadcasterUserId || (typeof chatroomId === 'object' ? chatroomId.broadcasterUserId : null)
    };
    fs.writeFileSync(KNOWN_CHANNELS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[KickClient] known_channels.json kaydedilemedi:', e.message);
  }
}

loadKnownChannels();

// Helper: Execute curl directly via child_process.spawn (with desktop browser headers)
function curlFetch(url, timeoutMs = 7000, postData = null) {
  return new Promise((resolve, reject) => {
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    let stdout = '';
    let stderr = '';

    const args = [
      '-s', '-L',
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      '-H', 'Accept: application/json, text/plain, */*',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      '-H', 'Referer: https://kick.com/',
      '-H', 'Origin: https://kick.com'
    ];

    if (postData) {
      args.push('-H', 'Content-Type: application/json');
      args.push('-H', 'x-app-platform: web');
      args.push('-d', typeof postData === 'string' ? postData : JSON.stringify(postData));
    }

    args.push(url);

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

// Helper: Get guest auth token for Kick Centrifugo Realtime WebSocket
async function fetchRealtimeAuth(clientId = null) {
  const cId = clientId || `guest_${Math.random().toString(36).substring(2, 10)}`;
  const payload = { client_id: cId };

  // 1. Try curlFetch
  try {
    const stdout = await curlFetch(REALTIME_AUTH_URL, 7000, payload);
    if (stdout && stdout.trim().startsWith('{')) {
      const data = JSON.parse(stdout);
      if (data.data?.token) return data.data.token;
    }
  } catch (errCurl) {}

  // 2. Try native fetch
  try {
    const res = await fetch(REALTIME_AUTH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-app-platform': 'web',
        'Referer': 'https://kick.com/',
        'Origin': 'https://kick.com'
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?.token) return data.data.token;
    }
  } catch (errFetch) {}

  return null;
}

class KickClient extends EventEmitter {
  constructor() {
    super();
    this.channel = '';
    this.chatroomId = null;
    this.broadcasterUserId = null;
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.manualDisconnect = false;
    this.connectSeq = 0;
    this.cmdId = 1;
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

    const altSlug = slug.includes('_') ? slug.replace(/_/g, '-') : (slug.includes('-') ? slug.replace(/-/g, '_') : null);
    const endpoints = [
      `https://kick.com/api/v2/channels/${slug}`,
      `https://kick.com/api/v1/channels/${slug}`,
      ...(altSlug ? [
        `https://kick.com/api/v2/channels/${altSlug}`,
        `https://kick.com/api/v1/channels/${altSlug}`
      ] : []),
      `https://kick.com/api/v2/channels/${slug}/chatroom`,
      `https://kick.com/api/v1/users/${slug}`
    ];

    // 3. Primary method: Spawn curl with browser headers
    for (const url of endpoints) {
      try {
        const stdout = await curlFetch(url, 7000);
        if (stdout && stdout.trim().startsWith('{')) {
          const data = JSON.parse(stdout);
          const cId = data.chatroom?.id || (data.id && typeof data.id === 'number' ? data.id : null);
          const uId = data.user_id || (data.user && data.user.id) || (data.id && typeof data.id === 'number' ? data.id : null);
          if (cId) {
            console.log(`[KickClient] ✅ curl ile kanal '${slug}' (#${cId}, User: #${uId}) çözüldü.`);
            const res = {
              chatroomId: cId,
              broadcasterUserId: uId,
              slug: data.slug || data.username || slug,
              user: data.user ? {
                id: uId,
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : (data.username ? { id: data.id, username: data.username, profilePic: data.profilepic } : null)
            };
            RESOLVED_CHANNELS_CACHE[slug] = res;
            saveKnownChannel(slug, cId, uId);
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
          const uId = data.user_id || (data.user && data.user.id) || (data.id && typeof data.id === 'number' ? data.id : null);
          if (cId) {
            console.log(`[KickClient] ✅ fetch ile kanal '${slug}' (#${cId}, User: #${uId}) çözüldü.`);
            const result = {
              chatroomId: cId,
              broadcasterUserId: uId,
              slug: data.slug || data.username || slug,
              user: data.user ? {
                id: uId,
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : (data.username ? { id: data.id, username: data.username, profilePic: data.profilepic } : null)
            };
            RESOLVED_CHANNELS_CACHE[slug] = result;
            saveKnownChannel(slug, cId, uId);
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
        const result = { chatroomId: cId, broadcasterUserId: null, slug, user: null };
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
      let bId = null;
      let cSlug = this.channel;

      if (directChatroomId && /^\d+$/.test(String(directChatroomId).trim())) {
        cId = parseInt(String(directChatroomId).trim(), 10);
        if (cleaned) {
          RESOLVED_CHANNELS_CACHE[cleaned] = { chatroomId: cId, broadcasterUserId: null, slug: cleaned, user: null };
          saveKnownChannel(cleaned, cId);
        }
      } else {
        const info = await this.getChatroomId(this.channel);
        cId = info.chatroomId;
        bId = info.broadcasterUserId || null;
        cSlug = info.slug || this.channel;
      }

      if (currentSeq !== this.connectSeq) {
        // A newer connect call was initiated, discard this one
        return;
      }

      this.chatroomId = cId;
      this.broadcasterUserId = bId;
      this.channel = cSlug;

      this.emit('status', {
        connected: false,
        channel: this.channel,
        chatroomId: this.chatroomId,
        broadcasterUserId: this.broadcasterUserId,
        message: `Kanal (#${this.chatroomId}) bulundu, Kick Realtime sunucusuna bağlanılıyor...`
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

  async initWebSocket(seq) {
    if (this.manualDisconnect || seq !== this.connectSeq) return;

    try {
      this.cmdId = 1;
      const WebSocket = require('ws');

      // Fetch guest token for Centrifugo authentication
      let token = null;
      try {
        token = await fetchRealtimeAuth();
      } catch (eToken) {
        console.warn('[KickClient] Realtime auth token alınamadı:', eToken.message);
      }

      if (seq !== this.connectSeq || this.manualDisconnect) return;

      this.ws = new WebSocket(CENTRIFUGO_DEFAULT_WS_URL);

      this.ws.on('open', () => {
        if (seq !== this.connectSeq) {
          try { this.ws.close(); } catch(e) {}
          return;
        }
        console.log('[KickClient] Realtime (Centrifugo) bağlantısı açıldı. Kimlik doğrulanıyor...');
        // Centrifugo Connect command
        const connectCmd = {
          id: this.cmdId++,
          connect: {
            token: token || ''
          }
        };
        this.ws.send(JSON.stringify(connectCmd));
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

        console.warn(`[KickClient] Realtime bağlantısı kapandı (${code}).`);
        this.emit('status', {
          connected: false,
          channel: this.channel,
          chatroomId: this.chatroomId,
          broadcasterUserId: this.broadcasterUserId,
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
      id: this.cmdId++,
      subscribe: {
        channel: `chatrooms.${this.chatroomId}.v2`
      }
    };

    this.ws.send(JSON.stringify(subPayload));
    console.log(`[KickClient] #${this.chatroomId} odasına abone olma isteği gönderildi.`);
  }

  handleMessage(raw) {
    try {
      const lines = raw.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        // Centrifugo empty JSON heartbeat
        if (line === '{}') {
          if (this.ws && this.ws.readyState === 1) {
            this.ws.send('{}');
          }
          continue;
        }

        const msg = JSON.parse(line);

        // 1. Centrifugo Connect Response
        if (msg.id === 1 && msg.connect) {
          console.log('[KickClient] Realtime oturumu açıldı. Sohbet odasına abone olunuyor...');
          this.subscribeChatroom();
        }

        // 2. Subscription Succeeded (either response to subscribe command or subscribe confirmation)
        if (msg.subscribe && (msg.id !== undefined || msg.push?.pub === undefined)) {
          this.isConnected = true;
          console.log(`[KickClient] ✅ ${this.channel} (ID: ${this.chatroomId}, User: #${this.broadcasterUserId || '?'}) sohbetine başarıyla bağlanıldı!`);
          this.emit('status', {
            connected: true,
            channel: this.channel,
            chatroomId: this.chatroomId,
            broadcasterUserId: this.broadcasterUserId,
            message: `${this.channel} sohbeti dinleniyor.`
          });
        }

        // 3. Chat Message Events (handles single publication or batched pubs array)
        const publications = [];
        if (msg.push) {
          if (Array.isArray(msg.push.pubs)) {
            publications.push(...msg.push.pubs);
          } else if (msg.push.pub) {
            publications.push(msg.push.pub);
          }
        }
        if (Array.isArray(msg.pubs)) {
          publications.push(...msg.pubs);
        } else if (msg.pub) {
          publications.push(msg.pub);
        }

        for (const pub of publications) {
          if (!pub || !pub.data) continue;
          const pubData = pub.data;

          // Check for chat event (App\Events\ChatMessageEvent, ChatMessageEvent, or raw chat payload)
          const isChatEvent = !pubData.event ||
            pubData.event.includes('ChatMessageEvent') ||
            pubData.event.includes('MessageEvent') ||
            (pubData.content !== undefined);

          if (!isChatEvent) continue;

          let chatData = null;
          if (typeof pubData.data === 'string') {
            try { chatData = JSON.parse(pubData.data); } catch (e) {}
          } else if (pubData.data && typeof pubData.data === 'object') {
            chatData = pubData.data;
          } else if (pubData.content !== undefined) {
            chatData = pubData;
          }

          if (!chatData || !chatData.content) continue;

          const senderObj = chatData.sender || chatData.user || {};
          const senderUsername = (senderObj.username || senderObj.slug || senderObj.identity?.username || chatData.username || '').trim();

          const parsed = {
            id: chatData.id,
            chatroomId: chatData.chatroom_id || this.chatroomId,
            content: chatData.content,
            type: chatData.type || 'message',
            createdAt: chatData.created_at || new Date().toISOString(),
            sender: {
              id: senderObj.id,
              username: senderUsername || 'Gezgin',
              slug: senderObj.slug || senderUsername.toLowerCase(),
              profilePic: senderObj.profile_pic || senderObj.profilePic || null,
              badges: senderObj.identity?.badges || senderObj.badges || []
            }
          };

          this.emit('message', parsed);
        }
      }
    } catch (e) {
      console.error('[KickClient] Mesaj ayrıştırma hatası:', e);
    }
  }

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send('{}');
      }
    }, 20000);
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
