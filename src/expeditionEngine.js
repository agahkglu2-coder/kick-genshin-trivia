const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXPEDITIONS_FILE = path.join(DATA_DIR, 'expeditions.json');

const REWARD_TABLES = {
  fishing: [
    { item: 'Eski Çizme', primogems: 10, weight: 15, isJackpot: false, emoji: '👞', desc: 'Denizden eski bir çizme çıktı, içinde biraz primogem unutulmuş!' },
    { item: 'Gümüş Sazan', primogems: 25, weight: 50, isJackpot: false, emoji: '🐟', desc: 'Taze ve lezzetli bir Gümüş Sazan yakalandı.' },
    { item: 'Altın Koi', primogems: 60, weight: 25, isJackpot: false, emoji: '🐠', desc: 'Nadir pulları ışıldayan bir Altın Koi tutuldu!' },
    { item: 'Paimon Balığı', primogems: 160, weight: 10, isJackpot: true, emoji: '✨🧚', desc: 'EFSANEVİ! Oltaya Acil Durum Yiyeceği Paimon takıldı! (Tam 1 Wish)' }
  ],
  mining: [
    { item: 'Kaya Parçası', primogems: 10, weight: 15, isJackpot: false, emoji: '🪨', desc: 'Basit bir kaya parçası, ama içinde ufak primogem tozu var.' },
    { item: 'Demir & Beyaz Demir', primogems: 30, weight: 50, isJackpot: false, emoji: '⛏️', desc: 'Sağlam demir cevherleri çıkarıldı.' },
    { item: 'Büyülü Kristal', primogems: 75, weight: 25, isJackpot: false, emoji: '🔮', desc: 'Parıldayan saf Element Kristali madenden çıkarıldı!' },
    { item: 'Yıldız Cevheri', primogems: 160, weight: 10, isJackpot: true, emoji: '💎⭐', desc: 'EFSANEVİ JACKPOT! Gökten düşmüş kadim bir Yıldız Cevheri! (Tam 1 Wish)' }
  ]
};

function rollReward(type) {
  const table = REWARD_TABLES[type] || REWARD_TABLES.fishing;
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of table) {
    if (random < entry.weight) {
      return { ...entry };
    }
    random -= entry.weight;
  }
  return { ...table[0] };
}

class ExpeditionEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.gachaEngine = options.gachaEngine || null;
    this.kickBot = options.kickBot || null;

    // Config: Default expedition duration is 20 minutes (in ms)
    this.config = {
      durationMs: 20 * 60 * 1000, // 20 minutes
      checkIntervalMs: 5000,      // check every 5s
      autoClaim: true,            // auto award primogems upon completion
      maxDockCapacity: 12,
      maxMineCapacity: 12,
      ...options.config
    };

    // Active Expeditions map: username.toLowerCase() -> ExpeditionObject
    this.expeditions = new Map();
    this.checkTimer = null;

    this.loadState();
    this.startCheckLoop();
  }

  setGachaEngine(engine) {
    this.gachaEngine = engine;
  }

  setKickBot(bot) {
    this.kickBot = bot;
  }

  loadState() {
    try {
      if (fs.existsSync(EXPEDITIONS_FILE)) {
        const raw = fs.readFileSync(EXPEDITIONS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [user, exp] of Object.entries(data)) {
            // Keep expeditions that are either in progress or finished less than 24h ago
            if (Date.now() - exp.startTime < 24 * 60 * 60 * 1000) {
              this.expeditions.set(user.toLowerCase(), exp);
            }
          }
        }
        console.log(`[ExpeditionEngine] ${this.expeditions.size} aktif/tamamlanmış sefer yüklendi.`);
      }
    } catch (e) {
      console.warn('[ExpeditionEngine] expeditions.json okunamadı:', e.message);
    }
  }

  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj = {};
      for (const [u, exp] of this.expeditions.entries()) {
        obj[u] = exp;
      }
      fs.writeFileSync(EXPEDITIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error('[ExpeditionEngine] expeditions.json kaydedilemedi:', e.message);
    }
  }

  /**
   * Start or check an expedition for a user
   * @param {string} username 
   * @param {'fishing'|'mining'} type 
   */
  startExpedition(username, type = 'fishing') {
    if (!username) return { success: false, message: 'Kullanıcı adı geçersiz.' };
    const key = String(username).trim().toLowerCase();
    const cleanUser = String(username).trim();
    const validTypes = ['fishing', 'mining'];
    const chosenType = validTypes.includes(type) ? type : 'fishing';

    const existing = this.expeditions.get(key);
    const now = Date.now();

    // Check if user already has an active ongoing expedition
    if (existing && !existing.claimed) {
      const remainingMs = Math.max(0, existing.endsAt - now);
      const remainingMinutes = Math.ceil(remainingMs / 60000);

      if (remainingMs > 0) {
        const typeTr = existing.type === 'fishing' ? 'balık tutuyor' : 'maden kazıyor';
        return {
          success: false,
          alreadyActive: true,
          type: existing.type,
          remainingMinutes,
          message: `@${cleanUser} kedin zaten ${typeTr}! Seferin bitmesine ~${remainingMinutes} dakika kaldı.`
        };
      } else {
        // Finished but not claimed yet
        return this.claimExpedition(cleanUser);
      }
    }

    // Start new expedition
    const duration = this.config.durationMs;
    const endsAt = now + duration;
    const reward = rollReward(chosenType);

    const expedition = {
      username: cleanUser,
      type: chosenType,
      startTime: now,
      durationMs: duration,
      endsAt,
      claimed: false,
      reward
    };

    this.expeditions.set(key, expedition);
    this.saveState();

    const typeTr = chosenType === 'fishing' ? 'balık tutmaya' : 'maden kazmaya';
    const locationName = chosenType === 'fishing' ? 'İskele' : 'Kristal Mağarası';

    console.log(`[ExpeditionEngine] 🐾 @${cleanUser} kedisini ${typeTr} gönderdi (${locationName}, ${Math.round(duration / 60000)} dk).`);

    this.emit('expedition_started', {
      user: cleanUser,
      type: chosenType,
      startTime: now,
      durationMs: duration,
      endsAt,
      location: locationName
    });

    return {
      success: true,
      user: cleanUser,
      type: chosenType,
      endsAt,
      durationMinutes: Math.round(duration / 60000),
      message: `🐾 @${cleanUser} kedini ${locationName}'ne ${typeTr} gönderdin! ${Math.round(duration / 60000)} dakika sonra ganimetle dönecek.`
    };
  }

  /**
   * Claim finished expedition reward
   */
  claimExpedition(username) {
    const key = String(username).trim().toLowerCase();
    const cleanUser = String(username).trim();
    const exp = this.expeditions.get(key);

    if (!exp) {
      return { success: false, message: `@${cleanUser} şu an aktif veya tamamlanmış bir seferin yok. Göndermek için: !balik veya !maden` };
    }

    const now = Date.now();
    if (now < exp.endsAt) {
      const remainingMinutes = Math.ceil((exp.endsAt - now) / 60000);
      return {
        success: false,
        message: `@${cleanUser} kedin henüz dönmedi! Kalan süre: ~${remainingMinutes} dk.`
      };
    }

    if (exp.claimed) {
      return {
        success: false,
        message: `@${cleanUser} son seferinin ganimetini zaten aldın! Yeni sefer için: !balik veya !maden`
      };
    }

    // Mark claimed & award primogems
    exp.claimed = true;
    exp.claimedAt = now;
    this.saveState();

    let newTotal = 0;
    if (this.gachaEngine) {
      const userObj = this.gachaEngine.getOrCreateUser(cleanUser);
      if (userObj) {
        userObj.primogems += exp.reward.primogems;
        newTotal = userObj.primogems;
        this.gachaEngine.saveUsers();
        this.gachaEngine.emit('primo_awarded', {
          username: cleanUser,
          amount: exp.reward.primogems,
          total: newTotal,
          reason: exp.type === 'fishing' ? 'FISHING_EXPEDITION' : 'MINING_EXPEDITION'
        });
      }
    }

    const typeTr = exp.type === 'fishing' ? 'balıktan' : 'madenden';
    const resultMsg = `${exp.reward.emoji} @${cleanUser} kedin ${typeTr} döndü! ${exp.reward.item} buldu ve +${exp.reward.primogems} Primogem kazandı! ${newTotal ? `(Toplam: ${newTotal})` : ''}`;

    this.emit('expedition_completed', {
      user: cleanUser,
      type: exp.type,
      reward: exp.reward,
      totalPrimogems: newTotal,
      message: resultMsg
    });

    return {
      success: true,
      user: cleanUser,
      type: exp.type,
      reward: exp.reward,
      totalPrimogems: newTotal,
      message: resultMsg
    };
  }

  /**
   * Get active status of a user's expedition
   */
  getStatus(username) {
    const key = String(username).trim().toLowerCase();
    const cleanUser = String(username).trim();
    const exp = this.expeditions.get(key);

    if (!exp) {
      return { active: false, message: `@${cleanUser} kedin kasabada dinleniyor. Sefer başlatmak için: !balik veya !maden` };
    }

    const now = Date.now();
    const isDone = now >= exp.endsAt;
    const remainingMs = Math.max(0, exp.endsAt - now);
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    const typeTr = exp.type === 'fishing' ? 'balık tutuyor' : 'maden kazıyor';

    return {
      active: !exp.claimed,
      isDone,
      type: exp.type,
      claimed: exp.claimed,
      remainingMinutes,
      message: isDone
        ? (exp.claimed ? `@${cleanUser} kedin son seferini tamamladı. Yeni sefere göndermek için: !balik veya !maden` : `@${cleanUser} kedin seferden döndü! Ganimeti toplamak için: !topla`)
        : `@${cleanUser} kedin ${typeTr}. Kalan süre: ~${remainingMinutes} dakika.`
    };
  }

  /**
   * List all current active (unclaimed) expeditions for OBS overlay rendering
   */
  getActiveList() {
    const now = Date.now();
    const list = [];
    for (const exp of this.expeditions.values()) {
      if (!exp.claimed) {
        list.push({
          user: exp.username,
          type: exp.type,
          startTime: exp.startTime,
          durationMs: exp.durationMs,
          endsAt: exp.endsAt,
          isDone: now >= exp.endsAt
        });
      }
    }
    return list;
  }

  /**
   * Background ticker to auto-complete finished expeditions
   */
  startCheckLoop() {
    if (this.checkTimer) clearInterval(this.checkTimer);

    this.checkTimer = setInterval(() => {
      if (!this.config.autoClaim) return;
      const now = Date.now();

      for (const [key, exp] of this.expeditions.entries()) {
        if (!exp.claimed && now >= exp.endsAt) {
          // Auto-claim for AFK viewers!
          console.log(`[ExpeditionEngine] ⏰ @${exp.username} seferi otomatik tamamlandı.`);
          const result = this.claimExpedition(exp.username);

          // If KickBot is available, announce reward in chat!
          if (this.kickBot && this.kickBot.enabled && result.success) {
            this.kickBot.sendMessage(result.message);
          }
        }
      }
    }, this.config.checkIntervalMs);
  }

  destroy() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }
}

module.exports = {
  ExpeditionEngine,
  REWARD_TABLES
};
