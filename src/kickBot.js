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
}

module.exports = { KickBotService };
