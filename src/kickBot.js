const EventEmitter = require('events');

class KickBotService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = options.token || '';
    this.botUsername = options.botUsername || null;
    this.enabled = options.enabled !== false;
    this.chatroomId = options.chatroomId || null;
    this.broadcasterUserId = options.broadcasterUserId || null;

    // Cooldown tracker: username -> timestamp
    this.userCooldowns = new Map();
    this.cooldownSeconds = options.cooldownSeconds || 10;

    // Message Queue to respect Kick chat rate limits (1 msg per 1.5s)
    this.queue = [];
    this.isProcessingQueue = false;
    this.lastSentTimestamp = 0;
    this.minSendIntervalMs = 1500;
  }

  setToken(token) {
    this.token = (token || '').trim();
    console.log(`[KickBot] Bot Token güncellendi: ${this.token ? 'Mevcut (****)' : 'Boş'}`);
    this.emit('config_updated', this.getStatus());
  }

  setUsername(name) {
    this.botUsername = (name || '').trim();
    this.emit('config_updated', this.getStatus());
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    console.log(`[KickBot] Bot durumu: ${this.enabled ? 'AÇIK' : 'KAPALI'}`);
    this.emit('config_updated', this.getStatus());
  }

  setChatroomId(chatroomId) {
    this.chatroomId = chatroomId;
    if (!this.broadcasterUserId) {
      this.broadcasterUserId = chatroomId;
    }
  }

  setBroadcasterUserId(userId) {
    this.broadcasterUserId = userId;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      hasToken: Boolean(this.token && this.token.length > 5),
      tokenPreview: this.token ? `${this.token.slice(0, 4)}...${this.token.slice(-4)}` : null,
      botUsername: this.botUsername,
      chatroomId: this.chatroomId,
      broadcasterUserId: this.broadcasterUserId,
      queueLength: this.queue.length
    };
  }

  // Check if a user is in cooldown
  checkCooldown(username) {
    if (!username) return false;
    const lower = username.toLowerCase();
    const now = Date.now();
    const lastTime = this.userCooldowns.get(lower) || 0;
    const diffSeconds = (now - lastTime) / 1000;

    if (diffSeconds < this.cooldownSeconds) {
      return false; // In cooldown, do not reply
    }

    this.userCooldowns.set(lower, now);

    // Garbage collect old cooldowns
    if (this.userCooldowns.size > 500) {
      for (const [user, time] of this.userCooldowns.entries()) {
        if ((now - time) / 1000 > this.cooldownSeconds * 2) {
          this.userCooldowns.delete(user);
        }
      }
    }

    return true;
  }

  // Queue a message to send to Kick chat
  sendMessage(content, replyToId = null) {
    if (!content || !content.trim()) return;
    const trimmed = content.trim();

    // Always emit local event for admin live feed and OBS bubbles
    this.emit('bot_message', {
      content: trimmed,
      replyToId,
      sentToKick: Boolean(this.enabled && this.token),
      timestamp: new Date().toISOString()
    });

    if (!this.enabled) {
      console.log(`[KickBot-Simülasyon] (Bot Kapalı): ${trimmed}`);
      return;
    }

    if (!this.token) {
      console.log(`[KickBot-Simülasyon] (Token Girilmedi): ${trimmed}`);
      return;
    }

    this.queue.push({
      content: trimmed,
      replyToId,
      timestamp: Date.now()
    });

    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        const now = Date.now();
        const elapsedSinceLast = now - this.lastSentTimestamp;

        if (elapsedSinceLast < this.minSendIntervalMs) {
          const waitTime = this.minSendIntervalMs - elapsedSinceLast;
          await new Promise(r => setTimeout(r, waitTime));
        }

        await this.dispatchMessage(item.content, item.replyToId);
        this.lastSentTimestamp = Date.now();
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async dispatchMessage(content, replyToId = null) {
    if (!this.token) {
      return { success: false, error: 'Token girilmedi (Simülasyon modunda). Lütfen önce "Kick ile Yetkilendir" butonuna basarak botu bağlayın.' };
    }

    let targetBroadcasterId = this.broadcasterUserId;
    if (!targetBroadcasterId && this.chatroomId) {
      try {
        const fs = require('fs');
        const path = require('path');
        const kcPath = path.join(__dirname, '..', 'data', 'known_channels.json');
        if (fs.existsSync(kcPath)) {
          const kc = JSON.parse(fs.readFileSync(kcPath, 'utf-8'));
          for (const [slug, item] of Object.entries(kc)) {
            if (item.chatroomId === this.chatroomId && item.broadcasterUserId) {
              targetBroadcasterId = item.broadcasterUserId;
              this.broadcasterUserId = targetBroadcasterId;
              break;
            }
          }
        }
      } catch (e) {}
    }

    if (!targetBroadcasterId && this.chatroomId === 40879165) {
      targetBroadcasterId = 42256338;
      this.broadcasterUserId = 42256338;
    }

    let lastError = null;

    // 1. Try Official Kick Public API: POST https://api.kick.com/public/v1/chat
    if (targetBroadcasterId) {
      for (const msgType of ['user', 'bot']) {
        try {
          const payload = {
            broadcaster_user_id: parseInt(targetBroadcasterId, 10),
            content: content,
            type: msgType
          };
          if (replyToId) {
            payload.reply_to_message_id = replyToId;
          }

          const res = await fetch('https://api.kick.com/public/v1/chat', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            console.log(`[KickBot] ✅ Mesaj Kick Public API (${msgType}) ile iletildi: "${content}"`);
            return { success: true };
          }

          const errText = await res.text();
          lastError = `Kick Public API (${res.status} [${msgType}]): ${errText}`;
          console.warn(`[KickBot] ${lastError}`);
        } catch (eOfficial) {
          lastError = `Public API hatası: ${eOfficial.message}`;
          console.warn(`[KickBot] ${lastError}`);
        }
      }
    }

    // 2. Fallback: Classic Kick Chatroom Messages API: POST https://kick.com/api/v2/messages/send/{chatroomId}
    if (this.chatroomId) {
      try {
        const fallbackRes = await fetch(`https://kick.com/api/v2/messages/send/${this.chatroomId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          body: JSON.stringify({
            content: content,
            type: 'message'
          })
        });

        if (fallbackRes.ok) {
          console.log(`[KickBot] ✅ Mesaj Kick v2 API ile iletildi: "${content}"`);
          return { success: true };
        }

        const errText2 = await fallbackRes.text();
        lastError = lastError || `Kick v2 API (${fallbackRes.status}): ${errText2}`;
      } catch (eFallback) {
        lastError = lastError || `Fallback API hatası: ${eFallback.message}`;
      }
    }

    return {
      success: false,
      error: lastError || 'Kanal broadcaster_user_id veya chatroomId belirlenemedi.'
    };
  }

  // Find Kick category ID by name, alias, or search query
  async findCategory(query) {
    if (!query || !query.trim()) return null;
    const raw = query.trim();
    const normalized = raw.toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');

    // Common game aliases dictionary
    const KNOWN_CATEGORIES = {
      'valorant': { id: 64, name: 'VALORANT' },
      'vlr': { id: 64, name: 'VALORANT' },
      'genshin': { id: 113, name: 'Genshin Impact' },
      'genshinimpact': { id: 113, name: 'Genshin Impact' },
      'gi': { id: 113, name: 'Genshin Impact' },
      'sohbet': { id: 15, name: 'Just Chatting' },
      'chat': { id: 15, name: 'Just Chatting' },
      'justchatting': { id: 15, name: 'Just Chatting' },
      'muhabbet': { id: 15, name: 'Just Chatting' },
      'konusma': { id: 15, name: 'Just Chatting' },
      'cs': { id: 1552, name: 'Counter-Strike 2' },
      'cs2': { id: 1552, name: 'Counter-Strike 2' },
      'csgo': { id: 1552, name: 'Counter-Strike 2' },
      'counterstrike': { id: 1552, name: 'Counter-Strike 2' },
      'counterstrike2': { id: 1552, name: 'Counter-Strike 2' },
      'lol': { id: 5, name: 'League of Legends' },
      'league': { id: 5, name: 'League of Legends' },
      'leagueoflegends': { id: 5, name: 'League of Legends' },
      'gta': { id: 8, name: 'Grand Theft Auto V (GTA)' },
      'gta5': { id: 8, name: 'Grand Theft Auto V (GTA)' },
      'gtav': { id: 8, name: 'Grand Theft Auto V (GTA)' },
      'grandtheftautov': { id: 8, name: 'Grand Theft Auto V (GTA)' },
      'gta6': { id: 13155, name: 'Grand Theft Auto VI (GTA)' },
      'gtavi': { id: 13155, name: 'Grand Theft Auto VI (GTA)' },
      'fortnite': { id: 9, name: 'Fortnite' },
      'fn': { id: 9, name: 'Fortnite' },
      'minecraft': { id: 7, name: 'Minecraft' },
      'mc': { id: 7, name: 'Minecraft' },
      'roblox': { id: 97, name: 'Roblox' },
      'fifa': { id: 14353, name: 'EA Sports FC 27' },
      'fc': { id: 14353, name: 'EA Sports FC 27' },
      'fc24': { id: 14353, name: 'EA Sports FC 27' },
      'fc25': { id: 14353, name: 'EA Sports FC 27' },
      'fc26': { id: 14353, name: 'EA Sports FC 27' },
      'fc27': { id: 14353, name: 'EA Sports FC 27' },
      'eafc': { id: 14353, name: 'EA Sports FC 27' },
      'pubg': { id: 14, name: 'PUBG: BATTLEGROUNDS' },
      'pubgmobile': { id: 957, name: 'PUBG Mobile' },
      'pubgm': { id: 957, name: 'PUBG Mobile' },
      'apex': { id: 6, name: 'Apex Legends' },
      'apexlegends': { id: 6, name: 'Apex Legends' },
      'dota': { id: 10, name: 'Dota 2' },
      'dota2': { id: 10, name: 'Dota 2' },
      'overwatch': { id: 11, name: 'Overwatch 2' },
      'overwatch2': { id: 11, name: 'Overwatch 2' },
      'ow': { id: 11, name: 'Overwatch 2' },
      'ow2': { id: 11, name: 'Overwatch 2' },
      'rainbowsix': { id: 12, name: 'Tom Clancy\'s Rainbow Six Siege' },
      'rainbowsixsiege': { id: 12, name: 'Tom Clancy\'s Rainbow Six Siege' },
      'r6': { id: 12, name: 'Tom Clancy\'s Rainbow Six Siege' },
      'r6s': { id: 12, name: 'Tom Clancy\'s Rainbow Six Siege' },
      'siege': { id: 12, name: 'Tom Clancy\'s Rainbow Six Siege' },
      'rust': { id: 17, name: 'Rust' },
      'rocketleague': { id: 16, name: 'Rocket League' },
      'rl': { id: 16, name: 'Rocket League' },
      'tft': { id: 32, name: 'Teamfight Tactics' },
      'teamfighttactics': { id: 32, name: 'Teamfight Tactics' },
      'honkai': { id: 12151, name: 'Honkai: Star Rail' },
      'starrail': { id: 12151, name: 'Honkai: Star Rail' },
      'hsr': { id: 12151, name: 'Honkai: Star Rail' },
      'zenless': { id: 14197, name: 'Zenless Zone Zero' },
      'zzz': { id: 14197, name: 'Zenless Zone Zero' },
      'wutheringwaves': { id: 14210, name: 'Wuthering Waves' },
      'wuwa': { id: 14210, name: 'Wuthering Waves' },
      'deadlock': { id: 14360, name: 'Deadlock' },
      'dbd': { id: 18, name: 'Dead by Daylight' },
      'deadbydaylight': { id: 18, name: 'Dead by Daylight' },
      'eldenring': { id: 83, name: 'ELDEN RING' },
      'warzone': { id: 1447, name: 'Call of Duty: Warzone' },
      'cod': { id: 1447, name: 'Call of Duty: Warzone' },
      'callofduty': { id: 1447, name: 'Call of Duty: Warzone' },
      'muzik': { id: 8550, name: 'Music' },
      'music': { id: 8550, name: 'Music' },
      'sanat': { id: 8551, name: 'Creative' },
      'cizim': { id: 8551, name: 'Creative' },
      'creative': { id: 8551, name: 'Creative' },
      'irl': { id: 8549, name: 'IRL' },
      'brawlstars': { id: 1170, name: 'Brawl Stars' },
      'clashroyale': { id: 2548, name: 'Clash Royale' }
    };

    // 1. Check known aliases
    if (KNOWN_CATEGORIES[normalized]) {
      return KNOWN_CATEGORIES[normalized];
    }

    // Partial alias match
    for (const [alias, cat] of Object.entries(KNOWN_CATEGORIES)) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return cat;
      }
    }

    // 2. Dynamic Search via Kick Search API
    try {
      const searchRes = await fetch(`https://kick.com/api/search?searched_word=${encodeURIComponent(raw)}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.categories && searchData.categories.length > 0) {
          const first = searchData.categories[0];
          return { id: first.id, name: first.name };
        }
      }
    } catch (e) {
      console.warn('[KickBot] Kategori arama hatası:', e.message);
    }

    return null;
  }

  // Update Kick Stream Title or Category via Kick Public API
  async updateChannel({ stream_title, category_id }) {
    if (!this.token) {
      return {
        success: false,
        error: 'Bot bağlı değil veya token eksik. Lütfen panelden "Kick ile Yetkilendir" butonuna tıklayın.'
      };
    }

    const payload = {};
    if (stream_title !== undefined && stream_title !== null) {
      payload.stream_title = String(stream_title).trim();
    }
    if (category_id !== undefined && category_id !== null) {
      payload.category_id = parseInt(category_id, 10);
    }

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'Güncellenecek başlık veya kategori belirtilmedi.' };
    }

    try {
      console.log(`[KickBot] updateChannel -> İstek gönderiliyor (PATCH https://api.kick.com/public/v1/channels):`, JSON.stringify(payload));
      const res = await fetch('https://api.kick.com/public/v1/channels', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log(`[KickBot] updateChannel -> Yanıt Kodu: ${res.status}`);

      if (res.ok || res.status === 204) {
        console.log(`[KickBot] ✅ Kanal bilgileri başarıyla güncellendi:`, payload);
        return { success: true, payload };
      }

      const errText = await res.text();
      console.warn(`[KickBot] updateChannel hata yanıtı (${res.status}):`, errText);
      let parsedErr = errText;
      try {
        const json = JSON.parse(errText);
        parsedErr = json.message || json.error || errText;
      } catch (e) {}

      if (res.status === 401) {
        return {
          success: false,
          error: 'Yetkilendirme süresi dolmuş (401). Lütfen yönetim panelinden "Kick ile Yetkilendir" butonuna tıklayarak botu yeniden bağlayın.'
        };
      }

      if (res.status === 403) {
        return {
          success: false,
          error: 'Yetki yetersiz (403). Kick API\'si kanal düzenleme için "channel:write" yetkisi ister. Lütfen panelden "Kick ile Yetkilendir" butonuna tıklayarak kanal düzenleme iznini onaylayın.'
        };
      }

      console.warn(`[KickBot] Kanal güncelleme hatası (${res.status}): ${parsedErr}`);
      return {
        success: false,
        error: `Kick API hatası (${res.status}): ${parsedErr}`
      };
    } catch (err) {
      console.error('[KickBot] updateChannel ağ hatası:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = { KickBotService };

