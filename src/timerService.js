const EventEmitter = require('events');

class TimerService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.kickBot = options.kickBot || null;
    this.db = options.db || null;
    this.timers = [];
    this.checkInterval = null;
  }

  setBot(kickBot) {
    this.kickBot = kickBot;
  }

  setDb(db) {
    this.db = db;
  }

  init(savedTimers = []) {
    this.timers = Array.isArray(savedTimers) ? savedTimers : [];
    console.log(`[TimerService] ${this.timers.length} adet zamanlanmış mesaj yüklendi.`);
    this.start();
  }

  start() {
    this.stop();
    // Check every 10 seconds if any timer is due
    this.checkInterval = setInterval(() => this.tick(), 10000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async tick() {
    const now = Date.now();
    for (const t of this.timers) {
      if (!t.enabled) continue;
      const intervalMinutes = Math.max(1, parseInt(t.intervalMinutes, 10) || 5);
      const intervalMs = intervalMinutes * 60 * 1000;
      const lastSent = t.lastSentAt || 0;

      if (now - lastSent >= intervalMs) {
        t.lastSentAt = now;
        this.save();
        console.log(`[TimerService] ⏱️ Zamanlanmış mesaj gönderiliyor (${intervalMinutes} dk aralık): "${t.text}"`);
        if (this.kickBot) {
          this.kickBot.sendMessage(t.text);
        }
        this.emit('message_sent', t);
      }
    }
  }

  getTimers() {
    return this.timers.map(t => ({
      id: t.id,
      text: t.text,
      intervalMinutes: t.intervalMinutes,
      enabled: t.enabled,
      lastSentAt: t.lastSentAt || null,
      nextInSeconds: t.enabled ? Math.max(0, Math.round(((t.lastSentAt || 0) + (t.intervalMinutes * 60000) - Date.now()) / 1000)) : null
    }));
  }

  addTimer({ text, intervalMinutes, enabled = true }) {
    if (!text || !text.trim()) return null;
    const item = {
      id: 'timer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      text: text.trim(),
      intervalMinutes: Math.max(1, parseInt(intervalMinutes, 10) || 5),
      enabled: enabled !== false,
      lastSentAt: Date.now() // Start timer from now
    };
    this.timers.push(item);
    this.save();
    return item;
  }

  updateTimer(id, updates = {}) {
    const t = this.timers.find(x => x.id === id);
    if (!t) return null;
    if (updates.text !== undefined) t.text = String(updates.text).trim();
    if (updates.intervalMinutes !== undefined) {
      t.intervalMinutes = Math.max(1, parseInt(updates.intervalMinutes, 10) || 5);
    }
    if (updates.enabled !== undefined) {
      t.enabled = Boolean(updates.enabled);
      if (t.enabled && !t.lastSentAt) {
        t.lastSentAt = Date.now();
      }
    }
    this.save();
    return t;
  }

  deleteTimer(id) {
    const before = this.timers.length;
    this.timers = this.timers.filter(x => x.id !== id);
    if (this.timers.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  triggerTimer(id) {
    const t = this.timers.find(x => x.id === id);
    if (!t) return false;
    t.lastSentAt = Date.now();
    this.save();
    if (this.kickBot) {
      this.kickBot.sendMessage(t.text);
    }
    return true;
  }

  async save() {
    if (this.db) {
      try {
        await this.db.setSetting('timed_messages', this.timers);
      } catch (e) {
        console.warn('[TimerService] Kayıt hatası:', e.message);
      }
    }
  }
}

module.exports = { TimerService };
