const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const CHARACTERS_FILE = path.join(__dirname, 'data', 'characters.json');
const WEAPONS_FILE = path.join(__dirname, 'data', 'weapons.json');
const BANNERS_FILE = path.join(__dirname, 'data', 'banners.json');

const STANDARD_5_STARS = ['Diluc', 'Jean', 'Mona', 'Keqing', 'Qiqi', 'Tighnari', 'Dehya'];

class GachaEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      costPerWish: 160,
      rate5: 0.008, // 0.8% base rate (Challenging & Legendary!)
      rate4: 0.10,  // 10.0% base rate
      pity5Threshold: 75, // 75 pulls hard pity for 5-star
      pity4Threshold: 10,  // 10 pulls hard pity for 4-star
      primoPerChat: 10,
      chatCooldownSeconds: 60,
      passiveTickMinutes: 5,
      passivePrimoAmount: 20,
      triviaRewardPrimo: 60,
      welcomePrimo: 160, // Free 1 wish for new chatters!
      jackpotTaxRate: 0.015, // 1.5% community pool tax
      ...options
    };

    this.users = {};
    this.characters = [];
    this.weapons = [];
    this.banners = [];
    this.activeBannerId = 'raiden_shogun';
    this.recentFiveStars = [];
    this.jackpotPool = 0;
    this.jackpotTotalAccumulated = 0;
    this.recentJackpotWinners = [];

    this.loadData();
    this.startPassiveInterval();
  }

  loadData() {
    // Load Characters
    try {
      if (fs.existsSync(CHARACTERS_FILE)) {
        this.characters = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[GachaEngine] Karakterler yüklenemedi:', e);
      this.characters = [];
    }

    // Load Weapons
    try {
      if (fs.existsSync(WEAPONS_FILE)) {
        this.weapons = JSON.parse(fs.readFileSync(WEAPONS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[GachaEngine] Silahlar yüklenemedi:', e);
      this.weapons = [];
    }

    // Load Banners
    try {
      if (fs.existsSync(BANNERS_FILE)) {
        this.banners = JSON.parse(fs.readFileSync(BANNERS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[GachaEngine] Bannerlar yüklenemedi:', e);
      this.banners = [];
    }

    // Restore active banner from db or default
    try {
      const savedBanner = db.getSetting('active_banner_id');
      if (savedBanner && this.banners.some(b => b.id === savedBanner)) {
        this.activeBannerId = savedBanner;
      } else if (this.banners.length > 0) {
        this.activeBannerId = this.banners[0].id;
      }
    } catch (e) {
      this.activeBannerId = 'raiden_shogun';
    }

    // Load Users from DatabaseManager
    try {
      this.users = db.getAllUsers() || {};
      if (Object.keys(this.users).length === 0 && fs.existsSync(USERS_FILE)) {
        this.users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        db.saveAllUsers(this.users);
      }
    } catch (e) {
      console.error('[GachaEngine] Kullanıcı veritabanı okunamadı:', e);
      this.users = {};
    }

    // Load Community Jackpot Pool from DatabaseManager
    try {
      const savedPool = db.getSetting('jackpot_pool');
      this.jackpotPool = (savedPool !== undefined && savedPool !== null) ? (+savedPool || 0) : 0;
      const savedTotal = db.getSetting('jackpot_total_accumulated');
      this.jackpotTotalAccumulated = (savedTotal !== undefined && savedTotal !== null) ? (+savedTotal || 0) : 0;
      const savedWinners = db.getSetting('jackpot_recent_winners');
      this.recentJackpotWinners = Array.isArray(savedWinners) ? savedWinners : [];
    } catch (e) {
      this.jackpotPool = 0;
      this.jackpotTotalAccumulated = 0;
      this.recentJackpotWinners = [];
    }

    console.log(`[GachaEngine] ${this.characters.length} karakter, ${this.weapons.length} silah, ${this.banners.length} banner ve ${Object.keys(this.users).length} kayıtlı kullanıcı yüklendi. (Topluluk Havuzu: ${this.jackpotPool} 💎)`);
  }

  saveUsers() {
    try {
      db.saveAllUsers(this.users);
    } catch (e) {
      console.error('[GachaEngine] Kullanıcı veritabanı kaydedilemedi:', e);
    }
  }

  saveBanners() {
    try {
      fs.writeFileSync(BANNERS_FILE, JSON.stringify(this.banners, null, 2), 'utf8');
    } catch (e) {
      console.error('[GachaEngine] Bannerlar kaydedilemedi:', e);
    }
  }

  // Banner Operations
  getActiveBanner() {
    return this.banners.find(b => b.id === this.activeBannerId) || this.banners[0] || null;
  }

  getBannersList() {
    return this.banners;
  }

  setActiveBanner(id) {
    const banner = this.banners.find(b => b.id === id);
    if (!banner) return { success: false, error: 'Banner bulunamadı' };
    this.activeBannerId = id;
    db.setSetting('active_banner_id', id);
    console.log(`[GachaEngine] 🎪 Aktif Banner güncellendi: ${banner.nameTr || banner.name} (${banner.featured5 || 'Standart'})`);
    this.emit('banner_changed', { banner, activeBannerId: id });
    return { success: true, banner };
  }

  createCustomBanner({ id, name, nameTr, version, featured5, featured4, description, element }) {
    if (!id || !featured5) return { success: false, error: 'Banner ID ve 5★ karakter adı zorunludur.' };
    const char5 = this.characters.find(c => c.name.toLowerCase() === featured5.toLowerCase());
    const newBanner = {
      id: id.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      name: name || `${featured5} Event Wish`,
      nameTr: nameTr || `${featured5} Özel Dileği`,
      version: version || 'Özel',
      type: 'character_event',
      element: element || (char5 ? char5.element : 'All'),
      featured5: char5 ? char5.name : featured5,
      featured4: Array.isArray(featured4) ? featured4 : (featured4 ? featured4.split(',').map(s => s.trim()) : []),
      description: description || `${featured5} için sınırlı süreli etkinlik dileği.`
    };

    const idx = this.banners.findIndex(b => b.id === newBanner.id);
    if (idx >= 0) {
      this.banners[idx] = newBanner;
    } else {
      this.banners.push(newBanner);
    }
    this.saveBanners();
    this.emit('banners_updated', { banners: this.banners });
    return { success: true, banner: newBanner };
  }

  findCharacterByNameOrAlias(query) {
    if (!query) return null;
    const clean = query.trim().toLowerCase().replace(/['\s_-]+/g, '');

    const aliases = {
      'raiden': 'Raiden Shogun',
      'shogun': 'Raiden Shogun',
      'ei': 'Raiden Shogun',
      'hutao': 'Hu Tao',
      'hu': 'Hu Tao',
      'kazuha': 'Kaedehara Kazuha',
      'ayaka': 'Kamisato Ayaka',
      'ayato': 'Kamisato Ayato',
      'neuvi': 'Neuvillette',
      'neuv': 'Neuvillette',
      'neuvillette': 'Neuvillette',
      'furina': 'Furina',
      'nahida': 'Nahida',
      'kusanali': 'Nahida',
      'zhongli': 'Zhongli',
      'morax': 'Zhongli',
      'geodaddy': 'Zhongli',
      'venti': 'Venti',
      'barbatos': 'Venti',
      'mavuika': 'Mavuika',
      'arle': 'Arlecchino',
      'arlecchino': 'Arlecchino',
      'father': 'Arlecchino',
      'baba': 'Arlecchino',
      'scara': 'Wanderer',
      'scaramouche': 'Wanderer',
      'wanderer': 'Wanderer',
      'childe': 'Tartaglia',
      'tartaglia': 'Tartaglia',
      'ajax': 'Tartaglia',
      'kokomi': 'Sangonomiya Kokomi',
      'itto': 'Arataki Itto',
      'yae': 'Yae Miko',
      'miko': 'Yae Miko',
      'yelan': 'Yelan',
      'xiao': 'Xiao',
      'ganyu': 'Ganyu',
      'alhaitham': 'Alhaitham',
      'haitham': 'Alhaitham',
      'navia': 'Navia',
      'clorinde': 'Clorinde',
      'kinich': 'Kinich',
      'mualani': 'Mualani',
      'xilonen': 'Xilonen',
      'chasca': 'Chasca',
      'citlali': 'Citlali',
      'wrio': 'Wriothesley',
      'wriothesley': 'Wriothesley',
      'xianyun': 'Xianyun',
      'bulut': 'Xianyun',
      'cloudretainer': 'Xianyun',
      'lyney': 'Lyney',
      'baizhu': 'Baizhu',
      'cyno': 'Cyno',
      'nilou': 'Nilou',
      'eula': 'Eula',
      'klee': 'Klee',
      'albedo': 'Albedo',
      'shenhe': 'Shenhe',
      'yoimiya': 'Yoimiya',
      'diluc': 'Diluc',
      'jean': 'Jean',
      'mona': 'Mona',
      'keqing': 'Keqing',
      'qiqi': 'Qiqi',
      'tighnari': 'Tighnari',
      'dehya': 'Dehya',
      'chiori': 'Chiori',
      'emilie': 'Emilie',
      'sigewinne': 'Sigewinne',
      'capitano': 'Capitano',
      'columbina': 'Columbina',
      'dainsleif': 'Dainsleif',
      'skirk': 'Skirk',
      'aloy': 'Aloy'
    };

    if (aliases[clean]) {
      const match = this.characters.find(c => c.name.toLowerCase() === aliases[clean].toLowerCase());
      if (match) return match;
    }

    const exact = this.characters.find(c => 
      c.name.toLowerCase().replace(/['\s_-]+/g, '') === clean
    );
    if (exact) return exact;

    const fiveStarMatch = this.characters.find(c => 
      c.rarity === 5 && c.name.toLowerCase().replace(/['\s_-]+/g, '').includes(clean)
    );
    if (fiveStarMatch) return fiveStarMatch;

    return this.characters.find(c => 
      c.name.toLowerCase().replace(/['\s_-]+/g, '').includes(clean)
    ) || null;
  }

  resolveBannerForQuery(query) {
    if (!query) return null;
    const clean = query.trim().toLowerCase();

    // Direct banner ID or banner name match
    const bannerMatch = this.banners.find(b => 
      b.id.toLowerCase() === clean || 
      (b.nameTr && b.nameTr.toLowerCase() === clean) ||
      (b.name && b.name.toLowerCase() === clean)
    );
    if (bannerMatch) return bannerMatch;

    // Character match
    const char = this.findCharacterByNameOrAlias(query);
    if (!char) return null;

    // Existing preset banner with this character
    const existing = this.banners.find(b => 
      b.featured5 && b.featured5.toLowerCase() === char.name.toLowerCase()
    );
    if (existing) return existing;

    // Dynamically created event banner for this character
    return {
      id: `custom_${char.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: `${char.name} Event Wish`,
      nameTr: `${char.name} Özel Dileği`,
      version: 'Özel',
      type: 'character_event',
      element: char.element,
      featured5: char.name,
      featured4: ['Bennett', 'Xingqiu', 'Xiangling'],
      description: `${char.name} için sınırlı süreli etkinlik dileği.`
    };
  }

  getOrCreateUser(username) {
    if (!username) return null;
    const key = username.toLowerCase();

    if (!this.users[key]) {
      this.users[key] = {
        username: username,
        primogems: this.config.welcomePrimo,
        pity4: 0,
        pity5: 0,
        isGuaranteed: false,
        isGuaranteed4: false,
        standardPity5: 0,
        standardPity4: 0,
        totalWishes: 0,
        fiveStarsCount: 0,
        fourStarsCount: 0,
        threeStarsCount: 0,
        inventory: [],
        lastChatAwardTime: 0,
        lastActiveTime: Date.now(),
        createdAt: new Date().toISOString()
      };
      this.saveUsers();
      console.log(`[GachaEngine] 🎁 Yeni Gezgin kaydoldu: ${username} (Hoş geldin hediyesi: ${this.config.welcomePrimo} Primogem)`);
    } else {
      this.users[key].username = username;
      this.users[key].lastActiveTime = Date.now();
      if (this.users[key].isGuaranteed === undefined) this.users[key].isGuaranteed = false;
      if (this.users[key].isGuaranteed4 === undefined) this.users[key].isGuaranteed4 = false;
      if (this.users[key].standardPity5 === undefined) this.users[key].standardPity5 = 0;
      if (this.users[key].standardPity4 === undefined) this.users[key].standardPity4 = 0;
      if (this.users[key].threeStarsCount === undefined) {
        this.users[key].threeStarsCount = (this.users[key].inventory || []).filter(i => i.rarity === 3).length;
      }
    }

    return this.users[key];
  }

  // Centralized Primogem Award & 1.5% Community Pool Contribution
  awardEarnedPrimogems(username, grossAmount, reason = 'REWARD', meta = {}) {
    if (!username || grossAmount <= 0) return { gross: 0, net: 0, tax: 0, pool: this.jackpotPool };
    const user = this.getOrCreateUser(username);
    if (!user) return { gross: 0, net: 0, tax: 0, pool: this.jackpotPool };

    // 1.5% Community Jackpot Tax
    const taxRate = typeof this.config.jackpotTaxRate === 'number' ? this.config.jackpotTaxRate : 0.015;
    const tax = +(grossAmount * taxRate).toFixed(2);

    user.primogems += grossAmount;
    this.jackpotPool = +(this.jackpotPool + tax).toFixed(2);
    this.jackpotTotalAccumulated = +(this.jackpotTotalAccumulated + tax).toFixed(2);

    this.saveUsers();
    db.setSetting('jackpot_pool', this.jackpotPool);
    db.setSetting('jackpot_total_accumulated', this.jackpotTotalAccumulated);

    this.emit('jackpot_updated', {
      pool: this.jackpotPool,
      added: tax,
      grossAmount,
      username,
      reason,
      meta,
      timestamp: Date.now()
    });

    this.emit('primo_awarded', {
      username,
      amount: grossAmount,
      tax,
      total: user.primogems,
      reason
    });

    return {
      gross: grossAmount,
      net: grossAmount,
      tax,
      pool: this.jackpotPool,
      user
    };
  }

  // 1. Chat Message Reward
  handleChatActivity(username) {
    const user = this.getOrCreateUser(username);
    if (!user) return;

    const now = Date.now();
    const cooldownMs = this.config.chatCooldownSeconds * 1000;

    if (now - (user.lastChatAwardTime || 0) >= cooldownMs) {
      user.lastChatAwardTime = now;
      this.awardEarnedPrimogems(username, this.config.primoPerChat, 'CHAT_ACTIVITY');
    }
  }

  // 2. Trivia Winner Bonus
  awardTriviaWinner(username, amount = null) {
    const user = this.getOrCreateUser(username);
    if (!user) return;

    const award = amount || this.config.triviaRewardPrimo;
    const res = this.awardEarnedPrimogems(username, award, 'TRIVIA_WIN');
    console.log(`[GachaEngine] 💎 Trivia Ödülü: ${username} +${award} Primogem kazandı! (+${res.tax} 💎 Havuz, Toplam Havuz: ${res.pool})`);
  }

  // 3. Passive Time Ticks
  startPassiveInterval() {
    setInterval(() => {
      const now = Date.now();
      const activeThreshold = 20 * 60 * 1000;
      let awardedCount = 0;

      for (const key in this.users) {
        const u = this.users[key];
        if (now - (u.lastActiveTime || 0) <= activeThreshold) {
          this.awardEarnedPrimogems(u.username, this.config.passivePrimoAmount, 'PASSIVE_WATCH');
          awardedCount++;
        }
      }

      if (awardedCount > 0) {
        console.log(`[GachaEngine] ⏳ Yayını izleyen ${awardedCount} aktif izleyiciye +${this.config.passivePrimoAmount} Primogem dağıtıldı.`);
      }
    }, this.config.passiveTickMinutes * 60 * 1000);
  }

  // 4. Gacha Pull Simulation (Event or Standard Banner, with optional targetBanner)
  pull(username, count = 1, bannerType = 'event', targetBanner = null) {
    const user = this.getOrCreateUser(username);
    if (!user) return { success: false, reason: 'user_not_found' };

    const totalCost = this.config.costPerWish * count;
    if (user.primogems < totalCost) {
      return {
        success: false,
        reason: 'insufficient_primogems',
        current: user.primogems,
        needed: totalCost,
        missing: totalCost - user.primogems
      };
    }

    user.primogems -= totalCost;
    const pulls = [];

    const activeBanner = targetBanner || (bannerType === 'standard' 
      ? (this.banners.find(b => b.type === 'standard') || { id: 'standard', nameTr: 'Yolculuk Çağrısı', name: 'Wanderlust Invocation', type: 'standard' })
      : this.getActiveBanner());

    for (let i = 0; i < count; i++) {
      const pullResult = this.executeSinglePull(user, bannerType, activeBanner);
      pulls.push(pullResult);
    }

    this.saveUsers();

    const highestRarity = Math.max(...pulls.map(p => p.rarity || 3));
    const featuredPull = pulls.find(p => p.rarity === 5) || pulls.find(p => p.rarity === 4) || pulls[0];

    // Track 5★ for live ticker
    pulls.filter(p => p.rarity === 5).forEach(p => {
      this.recentFiveStars.unshift({
        username: user.username,
        characterName: p.name,
        rarity: 5,
        element: p.element,
        won5050: p.won5050,
        isGuaranteedPull: p.isGuaranteedPull,
        isCapturingRadiance: p.isCapturingRadiance || false,
        bannerName: activeBanner ? (activeBanner.nameTr || activeBanner.name) : 'Etkinlik Dileği',
        timestamp: Date.now()
      });
    });
    if (this.recentFiveStars.length > 15) {
      this.recentFiveStars = this.recentFiveStars.slice(0, 15);
    }

    const resultPayload = {
      username: user.username,
      pulls,
      is10Pull: count === 10,
      highestRarity,
      featuredPull,
      banner: activeBanner,
      bannerType,
      stats: {
        primogems: user.primogems,
        pity5: user.pity5,
        pity4: user.pity4,
        isGuaranteed: user.isGuaranteed,
        isGuaranteed4: user.isGuaranteed4,
        standardPity5: user.standardPity5,
        standardPity4: user.standardPity4,
        totalWishes: user.totalWishes,
        fiveStarsCount: user.fiveStarsCount
      }
    };

    this.emit('wish_result', resultPayload);
    return { success: true, ...resultPayload };
  }

  executeSinglePull(user, bannerType = 'event', activeBanner = null) {
    if (!activeBanner) {
      activeBanner = bannerType === 'standard' 
        ? (this.banners.find(b => b.type === 'standard') || { id: 'standard', nameTr: 'Yolculuk Çağrısı', type: 'standard' })
        : this.getActiveBanner();
    }

    user.totalWishes = (user.totalWishes || 0) + 1;

    const isStandard = bannerType === 'standard' || (activeBanner && activeBanner.type === 'standard');
    
    // Select pity trackers based on banner type
    let currentPity5 = isStandard ? (user.standardPity5 || 0) : (user.pity5 || 0);
    let currentPity4 = isStandard ? (user.standardPity4 || 0) : (user.pity4 || 0);

    currentPity5 += 1;
    currentPity4 += 1;

    if (isStandard) {
      user.standardPity5 = currentPity5;
      user.standardPity4 = currentPity4;
    } else {
      user.pity5 = currentPity5;
      user.pity4 = currentPity4;
    }

    let rarity = 3;
    const rand = Math.random();

    // 5-Star check
    if (currentPity5 >= this.config.pity5Threshold || rand < this.config.rate5) {
      rarity = 5;
    }
    // 4-Star check
    else if (currentPity4 >= this.config.pity4Threshold || rand < (this.config.rate5 + this.config.rate4)) {
      rarity = 4;
    }
    else {
      rarity = 3;
    }

    let item = null;
    let itemType = 'character';
    let isRefund = false;
    let refundAmount = 0;
    let won5050 = null;
    let isGuaranteedPull = false;
    let isStandardPool = false;

    // Standard 5★ character pool
    const standard5Chars = this.characters.filter(c => 
      c.rarity === 5 && STANDARD_5_STARS.map(s => s.toLowerCase()).includes(c.name.toLowerCase())
    );

    // ==========================================
    // 5-STAR LOGIC
    // ==========================================
    if (rarity === 5) {
      if (isStandard) {
        // Standard Banner: 50% Character, 50% Weapon
        const isChar = Math.random() < 0.5;
        if (isChar && standard5Chars.length > 0) {
          item = standard5Chars[Math.floor(Math.random() * standard5Chars.length)];
          itemType = 'character';
        } else {
          const weapon5s = this.weapons.filter(w => w.rarity === 5);
          item = weapon5s.length > 0 ? weapon5s[Math.floor(Math.random() * weapon5s.length)] : standard5Chars[0];
          itemType = isChar ? 'character' : 'weapon';
        }
        user.standardPity5 = 0;
        won5050 = null;
        isStandardPool = true;
      } else {
        // Character Event Banner: Authentic 50/50 & Guarantee Rule!
        const featuredChar = this.characters.find(c => 
          c.name.toLowerCase() === (activeBanner.featured5 || '').toLowerCase()
        ) || this.characters.find(c => c.rarity === 5);

        if (user.isGuaranteed) {
          // Guaranteed win!
          item = featuredChar;
          itemType = 'character';
          won5050 = true;
          isGuaranteedPull = true;
          user.isGuaranteed = false; // Guarantee consumed
        } else {
          // 50/50 Roll with Genshin 5.0 Capturing Radiance (Işıltı Yakalama)
          let winFiftyFifty = Math.random() < 0.5;
          let capturingRadiance = false;

          if (!winFiftyFifty) {
            // Capturing Radiance: 10% chance to turn 50/50 loss into an automatic win (~55% win rate)
            if (Math.random() < 0.10) {
              winFiftyFifty = true;
              capturingRadiance = true;
            }
          }

          if (winFiftyFifty) {
            item = capturingRadiance ? { ...featuredChar, isCapturingRadiance: true } : featuredChar;
            itemType = 'character';
            won5050 = true;
            isGuaranteedPull = false;
            user.isGuaranteed = false;
          } else {
            // Lost 50/50! Standard 5★ character dropped
            item = standard5Chars.length > 0
              ? standard5Chars[Math.floor(Math.random() * standard5Chars.length)]
              : (this.characters.find(c => c.rarity === 5 && c.name !== featuredChar.name) || featuredChar);
            itemType = 'character';
            won5050 = false;
            isGuaranteedPull = false;
            user.isGuaranteed = true; // Next 5★ is guaranteed!
            isStandardPool = true;
          }
        }
        user.pity5 = 0;
      }

      user.fiveStarsCount = (user.fiveStarsCount || 0) + 1;

      // Announce in chat
      if (item && item.isCapturingRadiance) {
        console.log(`[GachaEngine] ✨✨✨✨✨ IŞILTI YAKALAMA (CAPTURING RADIANCE)! ${user.username} -> ${item.name}!`);
        this.emit('chat_response', {
          username: user.username,
          message: `✨✨✨✨✨ IŞILTI YAKALAMA! @${user.username} kader çarkını çevirerek 5★ [${item.name}] kazandı! (50/50 Işıltı Zaferi!)`
        });
      } else if (won5050 === true && isGuaranteedPull) {
        console.log(`[GachaEngine] 🌟🌟🌟🌟🌟 GARANTİLİ 5★ KAZANILDI! ${user.username} -> ${item.name} (${activeBanner.nameTr})!`);
        this.emit('chat_response', {
          username: user.username,
          message: `🌟🌟🌟🌟🌟 GARANTİLİ DİLEK! @${user.username} beklenen 5★ [${item.name}] karakterini elde etti! Tebrikler Gezgin!`
        });
      } else if (won5050 === true) {
        console.log(`[GachaEngine] 🌟🌟🌟🌟🌟 50/50 KAZANILDI! ${user.username} -> ${item.name}!`);
        this.emit('chat_response', {
          username: user.username,
          message: `🎉 50/50 KAZANILDI! @${user.username} şansını konuşturdu ve 5★ [${item.name}] çıkardı!`
        });
      } else if (won5050 === false) {
        console.log(`[GachaEngine] 💀 50/50 KAYBEDİLDİ! ${user.username} -> ${item.name} (Sonraki 5★ KESİN GARANTİ!)`);
        this.emit('chat_response', {
          username: user.username,
          message: `💀 50/50 KAYBEDİLDİ... @${user.username} 5★ [${item.name}] çıkardı. Ancak üzülme Gezgin, SIRADAKİ 5★ KESİN BANNER GARANTİLİ!`
        });
      } else {
        console.log(`[GachaEngine] 🌟🌟🌟🌟🌟 STANDART 5★: ${user.username} -> ${item.name}`);
        this.emit('chat_response', {
          username: user.username,
          message: `🌌 STANDART DİLEK! @${user.username} 5★ [${item.name}] çıkardı! Tebrikler!`
        });
      }
    } 
    // ==========================================
    // 4-STAR LOGIC
    // ==========================================
    else if (rarity === 4) {
      if (isStandard) {
        const isChar = Math.random() < 0.7;
        const pool = isChar 
          ? this.characters.filter(c => c.rarity === 4)
          : this.weapons.filter(w => w.rarity === 4);
        item = pool[Math.floor(Math.random() * pool.length)] || this.characters[1];
        itemType = isChar ? 'character' : 'weapon';
        user.standardPity4 = 0;
      } else {
        // Event Banner 4★ Logic
        const featuredNames = Array.isArray(activeBanner.featured4) ? activeBanner.featured4 : [];
        const featured4List = this.characters.filter(c => 
          c.rarity === 4 && featuredNames.map(f => f.toLowerCase()).includes(c.name.toLowerCase())
        );

        if (user.isGuaranteed4 && featured4List.length > 0) {
          // Guaranteed featured 4★
          item = featured4List[Math.floor(Math.random() * featured4List.length)];
          itemType = 'character';
          user.isGuaranteed4 = false;
        } else {
          const winRateUp4 = (Math.random() < 0.5) && featured4List.length > 0;
          if (winRateUp4) {
            item = featured4List[Math.floor(Math.random() * featured4List.length)];
            itemType = 'character';
            user.isGuaranteed4 = false;
          } else {
            // General 4★ pool (characters or weapons)
            const isChar = Math.random() < 0.6;
            const nonFeaturedChars = this.characters.filter(c => 
              c.rarity === 4 && !featuredNames.map(f => f.toLowerCase()).includes(c.name.toLowerCase())
            );
            const pool = isChar && nonFeaturedChars.length > 0 
              ? nonFeaturedChars 
              : this.weapons.filter(w => w.rarity === 4);

            item = pool[Math.floor(Math.random() * pool.length)] || (featured4List[0] || this.characters[1]);
            itemType = isChar ? 'character' : 'weapon';
            user.isGuaranteed4 = true; // Next 4★ is guaranteed featured!
          }
        }
        user.pity4 = 0;
      }

      user.fourStarsCount = (user.fourStarsCount || 0) + 1;
      console.log(`[GachaEngine] ⭐⭐⭐⭐ 4★ Çıktı: ${user.username} -> ${item.name}`);
    } 
    // ==========================================
    // 3-STAR LOGIC
    // ==========================================
    else {
      const pool = this.weapons.filter(w => w.rarity === 3);
      item = pool[Math.floor(Math.random() * pool.length)] || { name: "Debate Club", rarity: 3, type: "Claymore" };
      itemType = 'weapon';

      user.threeStarsCount = (user.threeStarsCount || 0) + 1;

      // 15% lucky refund chance on 3-star
      if (Math.random() < 0.15) {
        isRefund = true;
        refundAmount = Math.floor(Math.random() * 41) + 40; // 40 - 80 primogems
        this.awardEarnedPrimogems(user.username, refundAmount, 'WISH_REFUND');
      }
    }

    // Build entry
    const entry = {
      name: item.name,
      rarity: rarity,
      type: itemType,
      element: item.element || null,
      weaponType: item.weaponType || item.type || null,
      region: item.region || null,
      title: item.title || null,
      icon: item.icon || null,
      remoteIcon: item.remoteIcon || null,
      remoteIconDev: item.remoteIconDev || null,
      splashArt: item.splashArt || null,
      splashArtDev: item.splashArtDev || null,
      portrait: item.portrait || null,
      internalName: item.internalName || null,
      slug: item.slug || null,
      isCapturingRadiance: item.isCapturingRadiance || false,
      pulledAt: new Date().toISOString()
    };

    if (!user.inventory) user.inventory = [];
    user.inventory.push(entry);

    return {
      ...entry,
      bannerId: activeBanner ? activeBanner.id : 'default',
      bannerName: activeBanner ? (activeBanner.nameTr || activeBanner.name) : 'Teyvat Dileği',
      bannerType: isStandard ? 'standard' : 'event',
      won5050,
      isGuaranteedPull,
      isCapturingRadiance: item.isCapturingRadiance || false,
      isStandardPool,
      pity5AtPull: currentPity5,
      isRefund,
      refundAmount
    };
  }

  // 5. Chat Commands Handler
  handleChatMessage(chatMsg) {
    const { content, sender } = chatMsg;
    if (!content || !sender || !sender.username) return null;

    const username = sender.username;
    this.handleChatActivity(username);

    const text = (content || '').trim().toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    // Banner Catalog (!bannerlar, !banners, !katalog, !karakterler5, !liste)
    if (text === '!bannerlar' || text === '!banners' || text === '!katalog' || text === '!karakterler5' || text === '!liste') {
      const popular = ['Raiden', 'Furina', 'Hu Tao', 'Zhongli', 'Nahida', 'Neuvillette', 'Mavuika', 'Arlecchino', 'Kazuha', 'Ayaka', 'Yelan', 'Xiao', 'Ganyu', 'Alhaitham', 'Navia', 'Clorinde', 'Citlali', 'Capitano'];
      this.emit('chat_response', {
        username,
        message: `🎪 5★ DİLEK HAVUZU: İstediğin karaktere doğrudan dilek çekebilirsin! Örn: !wish ${popular.slice(0, 8).join(', !wish ')}... ve 50+ karakter! (10'lu çekiş için: !wish10 <karakter>)`
      });
      return { type: 'banner_catalog' };
    }

    // Banner Info Check (!banner [karakter], !afis [karakter], !etkinlik)
    const bannerMatch = text.match(/^!(?:banner|afis|etkinlik)(?:\s+(.+))?$/);
    if (bannerMatch) {
      const charQuery = bannerMatch[1]?.trim();
      let targetBanner = null;

      if (charQuery) {
        targetBanner = this.resolveBannerForQuery(charQuery);
        if (!targetBanner) {
          this.emit('chat_response', {
            username,
            message: `@${username} '${charQuery}' için banner bulunamadı. Popüler 5★ listesi için: !bannerlar`
          });
          return null;
        }
      } else {
        targetBanner = this.getActiveBanner();
      }

      const user = this.getOrCreateUser(username);
      if (!targetBanner) return null;

      const feat4Str = (targetBanner.featured4 || []).join(', ');
      const guaranteeStatus = user.isGuaranteed 
        ? '🌟 KESİN GARANTİ (%100 Banner Karakteri!)' 
        : '🎲 50/50 Şansı (+%10 Işıltı Yakalama)';

      const bannerLabel = charQuery ? 'Banner' : 'Aktif Banner';
      this.emit('chat_response', {
        username,
        message: `🎪 ${bannerLabel}: [${targetBanner.nameTr || targetBanner.name}] | 5★ ${targetBanner.featured5 || 'Standart'} | 4★ ${feat4Str} | @${username} Pity: ${user.pity5}/${this.config.pity5Threshold} (${guaranteeStatus}) | İstediğin 5★ için: !wish <karakter>`
      });
      return { type: 'banner_info', banner: targetBanner, user };
    }

    // 10x Wish (!wish10 [karakter/standart], !dilek10 [karakter/standart], !10cek, !10standart)
    const wish10Match = text.match(/^!(?:wish10|dilek10|10cek|10standart)(?:\s+(.+))?$/);
    if (wish10Match) {
      let targetQuery = wish10Match[1]?.trim();
      if (text.startsWith('!10standart')) targetQuery = 'standart';
      let res;

      if (targetQuery === 'standart' || targetQuery === 'standard') {
        res = this.pull(username, 10, 'standard');
      } else if (targetQuery) {
        const resolvedBanner = this.resolveBannerForQuery(targetQuery);
        if (!resolvedBanner) {
          this.emit('chat_response', {
            username,
            message: `@${username} '${targetQuery}' adında bir karakter veya banner bulunamadı! Popüler 5★ karakterler: Raiden, Furina, Hu Tao, Ayaka, Neuvillette, Mavuika, Zhongli, Kazuha... (!bannerlar)`
          });
          return null;
        }
        res = this.pull(username, 10, 'event', resolvedBanner);
      } else {
        res = this.pull(username, 10, 'event');
      }

      if (!res.success && res.reason === 'insufficient_primogems') {
        this.emit('chat_response', {
          username,
          message: `@${username} 10'lu dilek için 1600 Primogem gerekir! (Mevcut: ${res.current}).`
        });
      }
      return res;
    }

    // Single Wish (!wish [karakter/standart], !dilek [karakter/standart], !cek [karakter/standart], !standart)
    const wishMatch = text.match(/^!(?:wish|dilek|cek|standart)(?:\s+(.+))?$/);
    if (wishMatch) {
      let targetQuery = wishMatch[1]?.trim();
      if (text.startsWith('!standart')) targetQuery = 'standart';
      let res;

      if (targetQuery === 'standart' || targetQuery === 'standard') {
        res = this.pull(username, 1, 'standard');
      } else if (targetQuery) {
        const resolvedBanner = this.resolveBannerForQuery(targetQuery);
        if (!resolvedBanner) {
          this.emit('chat_response', {
            username,
            message: `@${username} '${targetQuery}' adında bir karakter veya banner bulunamadı! Popüler 5★ karakterler: Raiden, Furina, Hu Tao, Ayaka, Neuvillette, Mavuika, Zhongli, Kazuha... (!bannerlar)`
          });
          return null;
        }
        res = this.pull(username, 1, 'event', resolvedBanner);
      } else {
        res = this.pull(username, 1, 'event');
      }

      if (!res.success && res.reason === 'insufficient_primogems') {
        this.emit('chat_response', {
          username,
          message: `@${username} Yetersiz Primogem! (Mevcut: ${res.current}, Gereken: ${res.needed}). Chate yazarak ve yayını izleyerek kazanabilirsin!`
        });
      }
      return res;
    }

    // Check Balance (!bakiye, !primo, !primogem)
    if (text === '!bakiye' || text === '!primo' || text === '!primogem' || text === '!puan') {
      const user = this.getOrCreateUser(username);
      const weaponCount = user.threeStarsCount ?? (user.inventory || []).filter(i => i.rarity === 3).length;
      const status5050 = user.isGuaranteed ? 'KESİN GARANTİ 🌟' : '50/50 🎲';
      this.emit('chat_response', {
        username,
        message: `💎 @${username} Primogem: ${user.primogems} | Etkinlik Pity: ${user.pity5}/${this.config.pity5Threshold} (${status5050}) | Standart Pity: ${user.standardPity5 || 0}/${this.config.pity5Threshold} | 3★ Silah: ${weaponCount} (!donustur)`
      });
      return { type: 'balance', user };
    }

    // Community Jackpot / Pool Check (!havuz, !kumbara, !jackpot, !kasa)
    if (text === '!havuz' || text === '!kumbara' || text === '!jackpot' || text === '!kasa') {
      const poolInt = Math.floor(this.jackpotPool);
      this.emit('chat_response', {
        username,
        message: `💎 Topluluk Primogem Havuzu (Kumbara): ${poolInt} Primogem! (Kazanılan her primonun %1.5'i bu havuza eklenir. Yayıncı isterse çekilişle verebilir veya herkese dağıtabilir!)`
      });
      return { type: 'jackpot_info', pool: this.jackpotPool, displayPool: poolInt, totalAccumulated: this.jackpotTotalAccumulated };
    }

    // Community Jackpot Raffle (!havuzcekilis, !kumbaraver, !jackpotcekilis)
    if (text === '!havuzcekilis' || text === '!kumbaraver' || text === '!jackpotcekilis') {
      return this.raffleJackpot();
    }

    // Community Jackpot Distribution (!havuzdagit, !kumbaradagit, !jackpotdagit)
    if (text === '!havuzdagit' || text === '!kumbaradagit' || text === '!jackpotdagit') {
      return this.distributeJackpot();
    }

    // Recycle 3-Star Weapons (!donustur, !erit, !hurda, !demirci, !recycle)
    if (text === '!donustur' || text === '!erit' || text === '!hurda' || text === '!demirci' || text === '!recycle' || text === '!craft') {
      const res = this.recycleThreeStars(username);
      if (!res.success && res.reason === 'not_enough_weapons') {
        this.emit('chat_response', {
          username,
          message: `🔨 @${username} Demirci: Dönüşüm için en az 5 adet 3★ mavi silah gerekir! (Mevcut: ${res.current}/5). Dilek çektikçe mavi silahlar burada birikir!`
        });
      } else if (res.success) {
        this.emit('chat_response', {
          username,
          message: `🔨 @${username} DEMİRCİ DÖNÜŞÜMÜ: ${res.recycledCount} adet 3★ mavi silah eritildi ve +${res.gainedPrimo} Primogem kazandın! 💎 (Kalan: ${res.remaining} mavi silah, Yeni Bakiye: ${res.newBalance} 💎). Hemen !wish yazabilirsin!`
        });
      }
      return res;
    }

    // Pity Check (!pity, !garanti)
    if (text === '!pity' || text === '!garanti') {
      const user = this.getOrCreateUser(username);
      const remaining = Math.max(0, this.config.pity5Threshold - user.pity5);
      const status5050 = user.isGuaranteed ? '🌟 KESİN BANNER GARANTİSİ' : '🎲 50/50 ŞANSI';
      this.emit('chat_response', {
        username,
        message: `🎯 @${username} Etkinlik Pity: ${user.pity5}/${this.config.pity5Threshold} (${remaining === 0 ? 'Sıradaki kesin 5★!' : remaining + ' çekiş sonra 5★'}) | Durum: ${status5050} | Standart Pity: ${user.standardPity5 || 0}/${this.config.pity5Threshold}`
      });
      return { type: 'pity', user };
    }

    // Inventory / Characters Check (!envanter, !karakterler)
    if (text === '!envanter' || text === '!karakterler' || text === '!kadro') {
      const user = this.getOrCreateUser(username);
      const fiveStars = (user.inventory || []).filter(i => i.rarity === 5).map(i => i.name);
      const unique5s = [...new Set(fiveStars)];

      this.emit('chat_response', {
        username,
        message: `🎒 @${username} 5★ Karakterlerin (${unique5s.length}): ${unique5s.length > 0 ? unique5s.join(', ') : 'Henüz yok (Pity: ' + user.pity5 + '/' + this.config.pity5Threshold + ')'}`
      });
      return { type: 'inventory', user };
    }

    // Leaderboard Check (!siralama, !top, !liderler)
    if (text === '!siralama' || text === '!top' || text === '!liderler' || text === '!leaderboard') {
      const topUsers = this.getAllUsersList().slice(0, 3);
      if (topUsers.length === 0) {
        this.emit('chat_response', {
          username,
          message: `🏆 Henüz sıralamada Gezgin yok. !wish yazarak ilk dileğini çekebilirsin!`
        });
      } else {
        const listStr = topUsers.map((u, i) => `${i + 1}. @${u.username} (${u.primogems} 💎, ${u.fiveStarsCount}x 5★)`).join(' | ');
        this.emit('chat_response', {
          username,
          message: `🏆 Primogem Liderleri: ${listStr}`
        });
      }
      return { type: 'leaderboard' };
    }

    // Help & Commands Guide (!yardim, !komutlar, !help, !commands, !komut)
    if (text === '!komutlar' || text === '!yardim' || text === '!help' || text === '!commands' || text === '!komut') {
      this.emit('chat_response', {
        username,
        message: `📜 MilkaBot Komutları: !wish (Dilek / 160 Primo) | !wish <karakter> (Örn: !wish ayaka, !wish furina) | !wish10 (10'lu) | !wish standart | !bannerlar (5★ Listesi) | !banner | !pity | !bakiye | !donustur | !envanter | 💡 Trivia sorularını ilk bilen +60 Primo kazanır!`
      });
      return { type: 'help' };
    }

    return null;
  }

  // 6. 3-Star Weapons Recycler (Blacksmith)
  recycleThreeStars(username) {
    const user = this.getOrCreateUser(username);
    if (!user) return { success: false, reason: 'user_not_found' };

    if (user.threeStarsCount === undefined) {
      user.threeStarsCount = (user.inventory || []).filter(i => i.rarity === 3).length;
    }

    const available = user.threeStarsCount;
    if (available < 5) {
      return {
        success: false,
        reason: 'not_enough_weapons',
        current: available,
        needed: 5,
        user
      };
    }

    const packages = Math.floor(available / 5);
    const weaponsToRecycle = packages * 5;
    const gainedPrimo = packages * 160;

    user.threeStarsCount -= weaponsToRecycle;
    this.awardEarnedPrimogems(username, gainedPrimo, 'BLACKSMITH_RECYCLE');

    if (Array.isArray(user.inventory)) {
      let removed = 0;
      user.inventory = user.inventory.filter(item => {
        if (item.rarity === 3 && removed < weaponsToRecycle) {
          removed++;
          return false;
        }
        return true;
      });
    }

    this.saveUsers();
    return {
      success: true,
      recycledCount: weaponsToRecycle,
      packages,
      gainedPrimo,
      remaining: user.threeStarsCount,
      newBalance: user.primogems,
      user
    };
  }

  // 7. Admin Panel Helpers
  addPrimogems(username, amount, reason = 'MANUAL') {
    const user = this.getOrCreateUser(username);
    if (!user) return null;
    if (amount > 0 && reason !== 'JACKPOT_CLAIM' && reason !== 'ADMIN_OVERRIDE') {
      return this.awardEarnedPrimogems(username, amount, reason).user;
    }
    user.primogems = Math.max(0, user.primogems + amount);
    this.saveUsers();
    return user;
  }

  // ==========================================
  // COMMUNITY JACKPOT (KUMBARA) METHODS
  // ==========================================
  getJackpotPool() {
    return this.jackpotPool || 0;
  }

  getJackpotState() {
    const activeChatters = this.getActiveChatters(30 * 60 * 1000);
    return {
      pool: this.jackpotPool,
      displayPool: Math.floor(this.jackpotPool),
      totalAccumulated: this.jackpotTotalAccumulated,
      taxRate: this.config.jackpotTaxRate || 0.015,
      activeChattersCount: activeChatters.length,
      recentWinners: this.recentJackpotWinners || []
    };
  }

  getActiveChatters(windowMs = 30 * 60 * 1000) {
    const now = Date.now();
    let active = Object.values(this.users).filter(u => u && u.username && (now - (u.lastActiveTime || 0)) <= windowMs);
    if (active.length === 0) {
      active = Object.values(this.users).filter(u => u && u.username && (u.lastActiveTime || 0) > 0);
    }
    if (active.length === 0) {
      active = Object.values(this.users).filter(u => u && u.username);
    }
    return active;
  }

  raffleJackpot(targetWinner = null) {
    const amount = Math.floor(this.jackpotPool);
    if (amount <= 0) {
      return { success: false, reason: 'pool_empty', message: 'Topluluk havuzunda henüz Primogem birikmedi!' };
    }

    let winnerObj = null;
    if (targetWinner) {
      winnerObj = this.getOrCreateUser(targetWinner);
    } else {
      const eligible = this.getActiveChatters(30 * 60 * 1000);
      if (eligible.length === 0) {
        return { success: false, reason: 'no_eligible_users', message: 'Çekiliş için uygun aktif izleyici bulunamadı!' };
      }
      winnerObj = eligible[Math.floor(Math.random() * eligible.length)];
    }

    if (!winnerObj) {
      return { success: false, reason: 'winner_not_found', message: 'Kazanan belirlenemedi!' };
    }

    // Award winner
    winnerObj.primogems += amount;
    this.jackpotPool = +(this.jackpotPool - amount).toFixed(2);

    const winnerRecord = {
      username: winnerObj.username,
      amount,
      type: 'RAFFLE',
      timestamp: Date.now()
    };
    this.recentJackpotWinners.unshift(winnerRecord);
    if (this.recentJackpotWinners.length > 10) {
      this.recentJackpotWinners = this.recentJackpotWinners.slice(0, 10);
    }

    this.saveUsers();
    db.setSetting('jackpot_pool', this.jackpotPool);
    db.setSetting('jackpot_recent_winners', this.recentJackpotWinners);

    console.log(`[GachaEngine] 🎁 Topluluk Havuzu Çekilişi: ${winnerObj.username} -> ${amount} 💎 kazandı! Kalan Havuz: ${this.jackpotPool}`);

    this.emit('jackpot_won', {
      winner: winnerObj.username,
      amount,
      remainingPool: this.jackpotPool,
      displayRemaining: Math.floor(this.jackpotPool),
      type: 'RAFFLE'
    });

    this.emit('chat_response', {
      username: winnerObj.username,
      message: `👑👑👑 TOPLULUK HAVUZU ÇEKİLİŞİ KAZANANI: @${winnerObj.username}! Havuzdaki tam ${amount} Primogem @${winnerObj.username} hesabına aktarıldı! Tebrikler Gezgin! 💎🎉`
    });

    return {
      success: true,
      winner: winnerObj.username,
      amount,
      remainingPool: this.jackpotPool,
      displayRemaining: Math.floor(this.jackpotPool)
    };
  }

  distributeJackpot(customAmount = null) {
    const totalToDistribute = customAmount ? Math.min(customAmount, Math.floor(this.jackpotPool)) : Math.floor(this.jackpotPool);
    if (totalToDistribute <= 0) {
      return { success: false, reason: 'pool_empty', message: 'Dağıtılacak Primogem havuzu boş!' };
    }

    const eligible = this.getActiveChatters(30 * 60 * 1000);
    if (eligible.length === 0) {
      return { success: false, reason: 'no_active_chatters', message: 'Şu an aktif izleyici bulunamadı!' };
    }

    const perUser = Math.floor(totalToDistribute / eligible.length);
    if (perUser <= 0) {
      return { success: false, reason: 'pool_too_small', message: `Havuz (${totalToDistribute} 💎) ${eligible.length} aktif izleyiciye paylaştırmak için çok küçük (Kişi başı en az 1 💎 düşmeli)!` };
    }

    const actualTotal = perUser * eligible.length;
    for (const u of eligible) {
      u.primogems += perUser;
    }
    this.jackpotPool = +(this.jackpotPool - actualTotal).toFixed(2);

    const record = {
      username: `Tüm Chat (${eligible.length} Kişi)`,
      amount: actualTotal,
      perUser,
      type: 'DISTRIBUTION',
      timestamp: Date.now()
    };
    this.recentJackpotWinners.unshift(record);
    if (this.recentJackpotWinners.length > 10) {
      this.recentJackpotWinners = this.recentJackpotWinners.slice(0, 10);
    }

    this.saveUsers();
    db.setSetting('jackpot_pool', this.jackpotPool);
    db.setSetting('jackpot_recent_winners', this.recentJackpotWinners);

    console.log(`[GachaEngine] 🌧️ Topluluk Havuzu Dağıtımı: ${eligible.length} izleyiciye kişi başı +${perUser} 💎 (Toplam: ${actualTotal} 💎) dağıtıldı! Kalan Havuz: ${this.jackpotPool}`);

    const recipientNames = eligible.map(u => u.username);
    this.emit('jackpot_distributed', {
      userCount: eligible.length,
      recipients: recipientNames,
      perUser,
      totalAmount: actualTotal,
      remainingPool: this.jackpotPool,
      displayRemaining: Math.floor(this.jackpotPool),
      type: 'DISTRIBUTION'
    });

    this.emit('chat_response', {
      username: 'Paimon',
      message: `🌧️💎 TOPLULUK HAVUZU DAĞITILDI! Havuzdaki ${actualTotal} Primogem yayındaki ${eligible.length} aktif Gezgine kişi başı +${perUser} 💎 olarak dağıtıldı! (Kalan Havuz: ${Math.floor(this.jackpotPool)} 💎)`
    });

    return {
      success: true,
      userCount: eligible.length,
      recipients: recipientNames,
      perUser,
      totalAmount: actualTotal,
      remainingPool: this.jackpotPool,
      displayRemaining: Math.floor(this.jackpotPool)
    };
  }

  adjustJackpotPool(amount, mode = 'add') {
    const val = +amount || 0;
    if (mode === 'set') {
      this.jackpotPool = Math.max(0, val);
    } else if (mode === 'reset') {
      this.jackpotPool = 0;
    } else {
      this.jackpotPool = Math.max(0, +(this.jackpotPool + val).toFixed(2));
      if (val > 0) {
        this.jackpotTotalAccumulated = +(this.jackpotTotalAccumulated + val).toFixed(2);
      }
    }

    db.setSetting('jackpot_pool', this.jackpotPool);
    db.setSetting('jackpot_total_accumulated', this.jackpotTotalAccumulated);

    this.emit('jackpot_updated', {
      pool: this.jackpotPool,
      added: mode === 'add' ? val : 0,
      reason: 'ADMIN_ADJUST',
      timestamp: Date.now()
    });

    return {
      success: true,
      pool: this.jackpotPool,
      displayPool: Math.floor(this.jackpotPool),
      totalAccumulated: this.jackpotTotalAccumulated
    };
  }

  triggerRain(amount = 160) {
    let count = 0;
    for (const key in this.users) {
      this.users[key].primogems += amount;
      count++;
    }
    this.saveUsers();
    this.emit('primo_rain', { amount, userCount: count });
    this.emit('chat_response', {
      username: 'Paimon',
      message: `🌧️ PRIMOGEM YAĞMURU! Yayındaki herkese +${amount} Primogem dağıtıldı! Hemen !wish yazarak dilek çekebilirsiniz!`
    });
    console.log(`[GachaEngine] 🌧️ Primogem Yağmuru! ${count} kullanıcıya +${amount} Primogem dağıtıldı!`);
    return { amount, userCount: count };
  }

  // Test Wish with explicit 50/50 simulation support!
  triggerTestWish(rarity = 5, won5050 = true, bannerType = 'event') {
    const activeBanner = this.getActiveBanner();
    const mockUser = {
      username: "GenshinGezgini",
      pity5: rarity === 5 ? 40 : 25,
      pity4: rarity === 4 ? 8 : 3,
      isGuaranteed: !won5050,
      standardPity5: 20,
      standardPity4: 4,
      totalWishes: 50,
      primogems: 3200
    };

    let item;
    let isGuaranteedPull = false;

    if (rarity === 5) {
      if (bannerType === 'standard') {
        const stdChar = this.characters.find(c => c.name === 'Diluc') || this.characters[0];
        item = stdChar;
        won5050 = null;
      } else {
        if (won5050) {
          item = this.characters.find(c => c.name.toLowerCase() === (activeBanner.featured5 || '').toLowerCase()) || this.characters[0];
        } else {
          // Lost 50/50: Drops Qiqi or Diluc
          item = this.characters.find(c => c.name === 'Qiqi') || this.characters.find(c => c.name === 'Diluc') || this.characters[0];
        }
      }
    } else if (rarity === 4) {
      const feat4Name = (activeBanner.featured4 && activeBanner.featured4[0]) || 'Bennett';
      item = this.characters.find(c => c.name.toLowerCase() === feat4Name.toLowerCase()) || this.characters.find(c => c.rarity === 4) || this.characters[1];
    } else {
      item = this.weapons.find(w => w.name === "Debate Club") || this.weapons[0];
    }

    const payload = {
      username: mockUser.username,
      pulls: [
        {
          name: item.name,
          rarity: rarity,
          type: item.weapon ? 'character' : (item.weaponType ? 'character' : 'weapon'),
          element: item.element || null,
          weaponType: item.weaponType || item.type || 'Sword',
          region: item.region || 'Teyvat',
          title: item.title || 'Kahraman',
          icon: item.icon || null,
          remoteIcon: item.remoteIcon || null,
          remoteIconDev: item.remoteIconDev || null,
          splashArt: item.splashArt || null,
          splashArtDev: item.splashArtDev || null,
          portrait: item.portrait || null,
          internalName: item.internalName || null,
          slug: item.slug || null,
          bannerId: activeBanner ? activeBanner.id : 'default',
          bannerName: activeBanner ? (activeBanner.nameTr || activeBanner.name) : 'Teyvat Dileği',
          bannerType: bannerType,
          won5050: rarity === 5 ? won5050 : null,
          isGuaranteedPull: false,
          pity5AtPull: mockUser.pity5,
          isRefund: false,
          refundAmount: 0
        }
      ],
      banner: activeBanner,
      bannerType: bannerType,
      is10Pull: false,
      highestRarity: rarity,
      featuredPull: null,
      stats: mockUser
    };
    payload.featuredPull = payload.pulls[0];

    this.emit('wish_result', payload);
    return payload;
  }

  triggerTestWish10(won5050 = true) {
    const activeBanner = this.getActiveBanner();
    const mockUser = {
      username: "GenshinGezgini",
      pity5: 40,
      pity4: 8,
      isGuaranteed: false,
      standardPity5: 15,
      standardPity4: 2,
      totalWishes: 90,
      primogems: 4800
    };

    let char5;
    if (won5050) {
      char5 = this.characters.find(c => c.name.toLowerCase() === (activeBanner.featured5 || '').toLowerCase()) || this.characters[0];
    } else {
      char5 = this.characters.find(c => c.name === 'Qiqi') || this.characters.find(c => c.name === 'Diluc') || this.characters[0];
    }

    const feat4Name = (activeBanner.featured4 && activeBanner.featured4[0]) || 'Bennett';
    const char4 = this.characters.find(c => c.name.toLowerCase() === feat4Name.toLowerCase()) || this.characters.find(c => c.rarity === 4) || this.characters[1];
    const weaponPool = this.weapons.length > 0 ? this.weapons : [{ name: "Debate Club", rarity: 3, weaponType: "Claymore" }];

    const pulls = [];
    const pull5 = this.formatPullItem(char5, 5, 'character', 40);
    pull5.won5050 = won5050;
    pull5.bannerName = activeBanner ? (activeBanner.nameTr || activeBanner.name) : 'Etkinlik Dileği';
    pulls.push(pull5);

    pulls.push(this.formatPullItem(char4, 4, 'character', 8));
    for (let i = 0; i < 8; i++) {
      const w = weaponPool[i % weaponPool.length];
      pulls.push(this.formatPullItem(w, 3, 'weapon', 0));
    }

    pulls.sort(() => Math.random() - 0.5);

    const payload = {
      username: mockUser.username,
      pulls,
      is10Pull: true,
      highestRarity: 5,
      featuredPull: pulls.find(p => p.rarity === 5),
      banner: activeBanner,
      bannerType: 'event',
      stats: mockUser
    };

    this.emit('wish_result', payload);
    return payload;
  }

  formatPullItem(item, rarity, type, pity5AtPull = 0) {
    return {
      name: item.name,
      rarity: rarity,
      type: type,
      element: item.element || null,
      weaponType: item.weaponType || item.type || 'Sword',
      region: item.region || 'Teyvat',
      title: item.title || 'Kahraman',
      icon: item.icon || null,
      remoteIcon: item.remoteIcon || null,
      remoteIconDev: item.remoteIconDev || null,
      splashArt: item.splashArt || null,
      splashArtDev: item.splashArtDev || null,
      portrait: item.portrait || null,
      internalName: item.internalName || null,
      slug: item.slug || null,
      pity5AtPull,
      isRefund: false,
      refundAmount: 0
    };
  }

  getAllUsersList() {
    return Object.values(this.users)
      .map(u => ({
        username: u.username,
        primogems: u.primogems,
        pity5: u.pity5,
        pity4: u.pity4,
        isGuaranteed: Boolean(u.isGuaranteed),
        isGuaranteed4: Boolean(u.isGuaranteed4),
        standardPity5: u.standardPity5 || 0,
        standardPity4: u.standardPity4 || 0,
        threeStarsCount: u.threeStarsCount ?? (u.inventory || []).filter(i => i.rarity === 3).length,
        totalWishes: u.totalWishes,
        fiveStarsCount: (u.inventory || []).filter(i => i.rarity === 5).length,
        fourStarsCount: (u.inventory || []).filter(i => i.rarity === 4).length,
        lastActiveTime: u.lastActiveTime
      }))
      .sort((a, b) => b.primogems - a.primogems);
  }
}

module.exports = { GachaEngine, STANDARD_5_STARS };
