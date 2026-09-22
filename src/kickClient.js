const EventEmitter = require('events');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const PUSHER_APP_KEY = '32cbd69e4b950bf97679';
const PUSHER_WS_URL = `wss://ws-us2.pusher.com/app/${PUSHER_APP_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;

function cleanChannelSlug(input) {
  if (!input) return '';
  let s = String(input).trim();
  s = s.replace(/^https?:\/\/(www\.)?kick\.com\//i, '');
  s = s.replace(/^kick\.com\//i, '');
  s = s.replace(/^[@/]+/, '');
  s = s.split('/')[0].split('?')[0].trim();
  return s.toLowerCase();
}

const KNOWN_CHATROOMS = {
  'zerkacy': { chatroomId: 40879165, slug: 'zerkacy', username: 'zerkacy' }
};

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

  async getChatroomId(channelSlug) {
    const slug = cleanChannelSlug(channelSlug);
    if (!slug) {
      throw new Error('Geçerli bir kanal adı veya bağlantısı girin.');
    }

    // 1. Kullanıcı doğrudan Chatroom ID girdiyse (sadece rakam)
    if (/^\d+$/.test(slug)) {
      return {
        chatroomId: parseInt(slug, 10),
        slug: slug,
        user: null
      };
    }

    // 2. Bilinen / önbelleğe alınmış kanal listesi kontrolü
    if (KNOWN_CHATROOMS[slug]) {
      console.log(`[KickClient] Bilinen kanal önbelleğinden yüklendi: '${slug}' (#${KNOWN_CHATROOMS[slug].chatroomId})`);
      return {
        chatroomId: KNOWN_CHATROOMS[slug].chatroomId,
        slug: KNOWN_CHATROOMS[slug].slug || slug,
        user: { username: KNOWN_CHATROOMS[slug].username || slug, profilePic: null }
      };
    }

    // 3. Çapraz platform curl (Windows: curl.exe, Linux/Render: curl)
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const endpoints = [
      `https://kick.com/api/v1/channels/${slug}`,
      `https://kick.com/api/v2/channels/${slug}`
    ];

    for (const url of endpoints) {
      try {
        const { stdout } = await execAsync(`${curlCmd} -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" "${url}"`, { timeout: 8000 });
        if (stdout && stdout.trim().startsWith('{')) {
          const data = JSON.parse(stdout);
          if (data.chatroom && data.chatroom.id) {
            console.log(`[KickClient] ${curlCmd} ile kanal '${slug}' (#${data.chatroom.id}) başarıyla çözüldü.`);
            KNOWN_CHATROOMS[slug] = {
              chatroomId: data.chatroom.id,
              slug: data.slug || slug,
              username: data.user?.username || slug
            };
            return {
              chatroomId: data.chatroom.id,
              slug: data.slug || slug,
              user: data.user ? {
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : null
            };
          }
        }
      } catch (errCurl) {
        // Sıradaki uç noktayı dene
      }
    }

    // 4. Fallback: Standart fetch denemesi
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
          if (data.chatroom && data.chatroom.id) {
            console.log(`[KickClient] fetch ile kanal '${slug}' (#${data.chatroom.id}) başarıyla çözüldü.`);
            KNOWN_CHATROOMS[slug] = {
              chatroomId: data.chatroom.id,
              slug: data.slug || slug,
              username: data.user?.username || slug
            };
            return {
              chatroomId: data.chatroom.id,
              slug: data.slug || slug,
              user: data.user ? {
                username: data.user.username,
                profilePic: data.user.profile_pic
              } : null
            };
          }
        }
      } catch (errFetch) {}
    }

    // 5. HTML sayfasından chatroom ID regex ayrıştırma
    try {
      const { stdout } = await execAsync(`${curlCmd} -s -L -A "Mozilla/5.0" "https://kick.com/${slug}"`, { timeout: 8000 });
      const match = stdout.match(/"chatroom":\s*\{\s*"id":\s*(\d+)/i) || stdout.match(/"chatroom_id":\s*(\d+)/i);
      if (match && match[1]) {
        const cId = parseInt(match[1], 10);
        console.log(`[KickClient] HTML regex ile kanal '${slug}' (#${cId}) çözüldü.`);
        KNOWN_CHATROOMS[slug] = { chatroomId: cId, slug, username: slug };
        return { chatroomId: cId, slug, user: null };
      }
    } catch (eHtml) {}

    throw new Error(`Kick kanalı bulunamadı (${slug}). Lütfen kullanıcı adında yazım hatası olmadığından emin olun veya doğrudan Chatroom ID (örn: 40879165) girin.`);
  }

  async connect(channelSlug) {
    const cleaned = cleanChannelSlug(channelSlug);
    if (!cleaned) {
      this.emit('status', { connected: false, message: 'Kanal adı belirtilmedi.' });
      return;
    }

    // Increase sequence number to cancel any stale connecting promises
    const currentSeq = ++this.connectSeq;

    this.disconnect();
    this.manualDisconnect = false;
    this.channel = cleaned;

    this.emit('status', {
      connected: false,
      channel: this.channel,
      message: `${this.channel} kanal bilgileri alınıyor...`
    });

    try {
      const info = await this.getChatroomId(this.channel);
      if (currentSeq !== this.connectSeq) {
        // A newer connect call was initiated, discard this one
        return;
      }

      this.chatroomId = info.chatroomId;
      this.channel = info.slug || this.channel;

      this.emit('status', {
        connected: false,
        channel: this.channel,
        chatroomId: this.chatroomId,
        message: `Chatroom #${this.chatroomId} bulundu, bağlanılıyor...`
      });

      this.initWebSocket(currentSeq);
    } catch (err) {
      if (currentSeq !== this.connectSeq) return;
      console.error(`[KickClient] ${this.channel} kanal hatası:`, err.message);
      this.emit('status', {
        connected: false,
        channel: this.channel,
        error: err.message,
        message: `Hata: ${err.message}`
      });
      this.scheduleReconnect();
    }
  }

  initWebSocket(seq) {
    try {
      this.ws = new WebSocket(PUSHER_WS_URL);

      this.ws.onopen = () => {
        if (seq !== this.connectSeq) return;
        console.log(`[KickClient] Pusher bağlandı. #${this.chatroomId} odasına abone olunuyor...`);
        const subscribePayload = {
          event: 'pusher:subscribe',
          data: {
            auth: '',
            channel: `chatrooms.${this.chatroomId}.v2`
          }
        };
        this.ws.send(JSON.stringify(subscribePayload));

        // Start ping keep-alive
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        if (seq !== this.connectSeq) return;
        try {
          const payload = JSON.parse(event.data);
          this.handlePusherEvent(payload);
        } catch (e) {
          console.error('[KickClient] Mesaj parse hatası:', e);
        }
      };

      this.ws.onerror = (error) => {
        if (seq !== this.connectSeq) return;
        console.error('[KickClient] WebSocket hatası:', error.message || error);
        this.emit('status', {
          connected: false,
          channel: this.channel,
          error: error.message || 'WebSocket hatası'
        });
      };

      this.ws.onclose = () => {
        if (seq !== this.connectSeq) return;
        this.isConnected = false;
        clearInterval(this.pingInterval);
        console.log(`[KickClient] ${this.channel} bağlantısı kapandı.`);
        this.emit('status', {
          connected: false,
          channel: this.channel,
          message: 'Bağlantı kesildi.'
        });

        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      if (seq !== this.connectSeq) return;
      console.error('[KickClient] WS Başlatma hatası:', err);
      this.scheduleReconnect();
    }
  }

  handlePusherEvent(payload) {
    if (payload.event === 'pusher:ping') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
      }
      return;
    }

    if (payload.event === 'pusher_internal:subscription_succeeded') {
      this.isConnected = true;
      console.log(`[KickClient] ✅ ${this.channel} (ID: ${this.chatroomId}) sohbetine başarıyla bağlanıldı!`);
      this.emit('status', {
        connected: true,
        channel: this.channel,
        chatroomId: this.chatroomId,
        message: `${this.channel} sohbeti dinleniyor.`
      });
      return;
    }

    if (payload.event === 'App\\Events\\ChatMessageEvent') {
      try {
        const msgData = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
        const chatMessage = {
          id: msgData.id,
          chatroomId: msgData.chatroom_id,
          content: (msgData.content || '').trim(),
          sender: {
            id: msgData.sender?.id,
            username: msgData.sender?.username || 'Anonim',
            slug: msgData.sender?.slug,
            profilePic: msgData.sender?.profile_pic || null,
            identity: msgData.sender?.identity || null
          },
          createdAt: msgData.created_at || new Date().toISOString()
        };

        this.emit('message', chatMessage);
      } catch (e) {
        console.error('[KickClient] ChatMessageEvent parse hatası:', e);
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.manualDisconnect || !this.channel) return;
    console.log(`[KickClient] 5 saniye sonra (${this.channel}) için yeniden bağlanmayı deneyecek...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualDisconnect && this.channel) {
        this.connect(this.channel);
      }
    }, 5000);
  }

  disconnect() {
    this.manualDisconnect = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingInterval);
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.isConnected = false;

    if (this.ws) {
      try {
        // Detach handlers so closing old WS doesn't trigger onclose
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}

module.exports = { KickClient, cleanChannelSlug };
