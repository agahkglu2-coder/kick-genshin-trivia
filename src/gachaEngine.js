const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const CHARACTERS_FILE = path.join(__dirname, 'data', 'characters.json');
const WEAPONS_FILE = path.join(__dirname, 'data', 'weapons.json');

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
      ...options
    };

    this.users = {};
    this.characters = [];
    this.weapons = [];
    this.recentFiveStars = [];

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

    console.log(`[GachaEngine] ${this.characters.length} karakter, ${this.weapons.length} silah ve ${Object.keys(this.users).length} kayıtlı kullanıcı yüklendi.`);
  }

  saveUsers() {
    try {
      db.saveAllUsers(this.users);
    } catch (e) {
      console.error('[GachaEngine] Kullanıcı veritabanı kaydedilemedi:', e);
    }
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
      // Keep proper username casing
      this.users[key].username = username;
      this.users[key].lastActiveTime = Date.now();
      if (this.users[key].threeStarsCount === undefined) {
        this.users[key].threeStarsCount = (this.users[key].inventory || []).filter(i => i.rarity === 3).length;
      }
    }

    return this.users[key];
  }

  // 1. Chat Message Reward
  handleChatActivity(username) {
    const user = this.getOrCreateUser(username);
    if (!user) return;

    const now = Date.now();
    const cooldownMs = this.config.chatCooldownSeconds * 1000;

    if (now - (user.lastChatAwardTime || 0) >= cooldownMs) {
      user.primogems += this.config.primoPerChat;
      user.lastChatAwardTime = now;
      this.saveUsers();
    }
  }

  // 2. Trivia Winner Bonus
  awardTriviaWinner(username, amount = null) {
    const user = this.getOrCreateUser(username);
    if (!user) return;

    const award = amount || this.config.triviaRewardPrimo;
    user.primogems += award;
    this.saveUsers();
    console.log(`[GachaEngine] 💎 Trivia Ödülü: ${username} +${award} Primogem kazandı! (Toplam: ${user.primogems})`);

    this.emit('primo_awarded', {
      username,
      amount: award,
      total: user.primogems,
      reason: 'TRIVIA_WIN'
    });
  }

  // 3. Passive Time Ticks (every 5 mins for active viewers)
  startPassiveInterval() {
    setInterval(() => {
      const now = Date.now();
      const activeThreshold = 20 * 60 * 1000; // 20 minutes active window
      let awardedCount = 0;

      for (const key in this.users) {
        const u = this.users[key];
        if (now - (u.lastActiveTime || 0) <= activeThreshold) {
          u.primogems += this.config.passivePrimoAmount;
          awardedCount++;
        }
      }

      if (awardedCount > 0) {
        this.saveUsers();
        console.log(`[GachaEngine] ⏳ Yayını izleyen ${awardedCount} aktif izleyiciye +${this.config.passivePrimoAmount} Primogem dağıtıldı.`);
      }
    }, this.config.passiveTickMinutes * 60 * 1000);
  }

  // 4. Gacha Pull Simulation
  pull(username, count = 1) {
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

    for (let i = 0; i < count; i++) {
      const pullResult = this.executeSinglePull(user);
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
      stats: {
        primogems: user.primogems,
        pity5: user.pity5,
        pity4: user.pity4,
        totalWishes: user.totalWishes,
        fiveStarsCount: user.fiveStarsCount
      }
    };

    this.emit('wish_result', resultPayload);
    return { success: true, ...resultPayload };
  }

  executeSinglePull(user) {
    user.totalWishes = (user.totalWishes || 0) + 1;
    user.pity5 = (user.pity5 || 0) + 1;
    user.pity4 = (user.pity4 || 0) + 1;

    let rarity = 3;
    const rand = Math.random();

    // Check 5-Star (Guaranteed pity or base rate)
    if (user.pity5 >= this.config.pity5Threshold || rand < this.config.rate5) {
      rarity = 5;
    }
    // Check 4-Star (Guaranteed pity or base rate)
    else if (user.pity4 >= this.config.pity4Threshold || rand < (this.config.rate5 + this.config.rate4)) {
      rarity = 4;
    }
    else {
      rarity = 3;
    }

    let item = null;
    let itemType = 'character';
    let isRefund = false;
    let refundAmount = 0;

    if (rarity === 5) {
      // 80% character, 20% weapon
      const isChar = Math.random() < 0.8;
      const pool = isChar 
        ? this.characters.filter(c => c.rarity === 5)
        : this.weapons.filter(w => w.rarity === 5);

      item = pool[Math.floor(Math.random() * pool.length)] || this.characters[0];
      itemType = isChar ? 'character' : 'weapon';

      user.pity5 = 0;
      user.fiveStarsCount = (user.fiveStarsCount || 0) + 1;
      console.log(`[GachaEngine] 🌟🌟🌟🌟🌟 EFSANEVİ 5★ ÇIKTI! Kullanıcı: ${user.username} -> ${item.name}!`);
      this.emit('chat_response', {
        username: user.username,
        message: `🌟🌟🌟🌟🌟 İNANILMAZ! @${user.username} az önce 5★ ${item.name} çıkardı! Tebrikler Gezgin!`
      });
    } else if (rarity === 4) {
      // 70% character, 30% weapon
      const isChar = Math.random() < 0.7;
      const pool = isChar
        ? this.characters.filter(c => c.rarity === 4)
        : this.weapons.filter(w => w.rarity === 4);

      item = pool[Math.floor(Math.random() * pool.length)] || this.characters[1];
      itemType = isChar ? 'character' : 'weapon';

      user.pity4 = 0;
      user.fourStarsCount = (user.fourStarsCount || 0) + 1;
      console.log(`[GachaEngine] ⭐⭐⭐⭐ 4★ Çıktı: ${user.username} -> ${item.name}`);
    } else {
      // 3-Star Weapon
      const pool = this.weapons.filter(w => w.rarity === 3);
      item = pool[Math.floor(Math.random() * pool.length)] || { name: "Debate Club", rarity: 3, type: "Claymore" };
      itemType = 'weapon';

      user.threeStarsCount = (user.threeStarsCount || 0) + 1;

      // 15% lucky refund chance on 3-star
      if (Math.random() < 0.15) {
        isRefund = true;
        refundAmount = Math.floor(Math.random() * 41) + 40; // 40 - 80 primogems
        user.primogems += refundAmount;
      }
    }

    // Record to inventory
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
      pulledAt: new Date().toISOString()
    };

    if (!user.inventory) user.inventory = [];
    user.inventory.push(entry);

    return {
      ...entry,
      pity5AtPull: user.pity5,
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

    // Normalize Turkish characters and casing for robust command matching
    const text = (content || '').trim().toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    // Single Wish (!wish)
    if (text === '!wish' || text === '!dilek' || text === '!cek') {
      const res = this.pull(username, 1);
      if (!res.success && res.reason === 'insufficient_primogems') {
        this.emit('chat_response', {
          username,
          message: `@${username} Yetersiz Primogem! (Mevcut: ${res.current}, Gereken: ${res.needed}). Chate yazarak ve yayını izleyerek kazanabilirsin!`
        });
      }
      return res;
    }

    // 10x Wish (!wish10)
    if (text === '!wish10' || text === '!dilek10' || text === '!10cek') {
      const res = this.pull(username, 10);
      if (!res.success && res.reason === 'insufficient_primogems') {
        this.emit('chat_response', {
          username,
          message: `@${username} 10'lu dilek için 1600 Primogem gerekir! (Mevcut: ${res.current}).`
        });
      }
      return res;
    }

    // Check Balance (!bakiye, !primo, !primogem)
    if (text === '!bakiye' || text === '!primo' || text === '!primogem' || text === '!puan') {
      const user = this.getOrCreateUser(username);
      const weaponCount = user.threeStarsCount ?? (user.inventory || []).filter(i => i.rarity === 3).length;
      this.emit('chat_response', {
        username,
        message: `💎 @${username} Primogem: ${user.primogems} | 5★ Pity: ${user.pity5}/${this.config.pity5Threshold} | 3★ Mavi Silah: ${weaponCount} (Dönüştürmek için: !donustur)`
      });
      return { type: 'balance', user };
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
      this.emit('chat_response', {
        username,
        message: `🎯 @${username} 5★ Garantisi: ${user.pity5}/${this.config.pity5Threshold} (${remaining === 0 ? 'Sıradaki çekiş kesin 5★!' : remaining + ' çekiş sonra kesin 5★!'})`
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
        message: `📜 MilkaBot Komutları: !wish (1 Dilek / 160 Primo) | !wish10 (10'lu Dilek) | !bakiye (Primon, Pity & Mavi Silahların) | !donustur (5 Mavi Silah = 160 Primo) | !pity (5★ Garantin) | !envanter (5★ Karakterlerin) | !sıralama (Liderler) | 💡 Trivia sorularını ilk bilen +60 Primo kazanır!`
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
    user.primogems += gainedPrimo;

    // Clean recycled weapons from inventory array if any
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

  // 6. Admin Panel Helpers
  addPrimogems(username, amount) {
    const user = this.getOrCreateUser(username);
    if (!user) return null;
    user.primogems = Math.max(0, user.primogems + amount);
    this.saveUsers();
    return user;
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

  triggerTestWish(rarity = 5) {
    const mockUser = {
      username: "GenshinGezgini",
      pity5: rarity === 5 ? 40 : 25,
      pity4: rarity === 4 ? 8 : 3,
      totalWishes: 50,
      primogems: 3200
    };

    let item;
    if (rarity === 5) {
      item = this.characters.find(c => c.name === "Raiden Shogun") || this.characters[0];
    } else if (rarity === 4) {
      item = this.characters.find(c => c.name === "Bennett") || this.characters[1];
    } else {
      item = this.weapons.find(w => w.name === "Debate Club") || this.weapons[0];
    }

    const payload = {
      username: mockUser.username,
      pulls: [
        {
          name: item.name,
          rarity: rarity,
          type: item.weapon ? 'character' : 'weapon',
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
          pity5AtPull: mockUser.pity5,
          isRefund: false,
          refundAmount: 0
        }
      ],
      stats: mockUser
    };

    this.emit('wish_result', payload);
    return payload;
  }

  triggerTestWish10() {
    const mockUser = {
      username: "GenshinGezgini",
      pity5: 40,
      pity4: 8,
      totalWishes: 90,
      primogems: 4800
    };

    const char5 = this.characters.find(c => c.name === "Raiden Shogun") || this.characters[0];
    const char4 = this.characters.find(c => c.name === "Bennett") || this.characters[1];
    const weaponPool = this.weapons.length > 0 ? this.weapons : [{ name: "Debate Club", rarity: 3, weaponType: "Claymore" }];

    const pulls = [];
    pulls.push(this.formatPullItem(char5, 5, 'character', 40));
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
        threeStarsCount: u.threeStarsCount ?? (u.inventory || []).filter(i => i.rarity === 3).length,
        totalWishes: u.totalWishes,
        fiveStarsCount: (u.inventory || []).filter(i => i.rarity === 5).length,
        fourStarsCount: (u.inventory || []).filter(i => i.rarity === 4).length,
        lastActiveTime: u.lastActiveTime
      }))
      .sort((a, b) => b.primogems - a.primogems);
  }
}

module.exports = { GachaEngine };
