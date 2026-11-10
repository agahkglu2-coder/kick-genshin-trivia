/**
 * RpgEngine - MMORPG karakter gelişimi: seviye/XP, ekipman (item), GearScore.
 *
 * - 7 ekipman yuvası, 5 nadirlik kademesi, item seviyesi (ilvl) ve +10'a kadar güçlendirme
 * - Ganimet sunucuda üretilir (istemci yalnızca "şu canavarı öldürdüm" der), hız sınırı vardır
 * - Profil `rpg:<kullanıcı>` anahtarıyla ayar deposunda saklanır (JSON ve PostgreSQL modunda kalıcı)
 */

const SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet'];

const SLOT_LABELS = {
  weapon: 'Silah',
  helmet: 'Miğfer',
  chest: 'Zırh',
  gloves: 'Eldiven',
  boots: 'Çizme',
  ring: 'Yüzük',
  amulet: 'Kolye'
};

const RARITIES = {
  1: { key: 'common', label: 'Sıradan', scoreMult: 1.0, powerMult: 1.0, affixes: 0, dust: 1 },
  2: { key: 'uncommon', label: 'Sıradışı', scoreMult: 1.15, powerMult: 1.12, affixes: 1, dust: 3 },
  3: { key: 'rare', label: 'Nadir', scoreMult: 1.35, powerMult: 1.28, affixes: 2, dust: 8 },
  4: { key: 'epic', label: 'Destansı', scoreMult: 1.6, powerMult: 1.48, affixes: 3, dust: 20 },
  5: { key: 'legendary', label: 'Efsanevi', scoreMult: 2.0, powerMult: 1.75, affixes: 4, dust: 50 }
};

// Item adları: [ilvl 1-7, 8-15, 16-25, 26-37, 38+]
const BASE_NAMES = {
  weapon: ['Paslı Kılıç', 'Çelik Kılıç', 'Şövalye Kılıcı', 'Rün Kılıcı', 'Ejder Dişi Kılıç'],
  helmet: ['Deri Başlık', 'Demir Miğfer', 'Şövalye Miğferi', 'Rünlü Taç Miğfer', 'Ejder Miğferi'],
  chest: ['Yamalı Yelek', 'Zincir Zırh', 'Plaka Zırh', 'Rün Zırhı', 'Ejder Pulu Zırh'],
  gloves: ['Bez Eldiven', 'Deri Eldiven', 'Çelik Eldiven', 'Rün Eldiveni', 'Ejder Pençesi'],
  boots: ['Eski Çarık', 'Deri Çizme', 'Çelik Çizme', 'Rün Çizmesi', 'Ejder Adımı'],
  ring: ['Bakır Yüzük', 'Gümüş Yüzük', 'Altın Yüzük', 'Rün Yüzüğü', 'Ejder Gözü Yüzük'],
  amulet: ['İp Kolye', 'Gümüş Kolye', 'Altın Kolye', 'Rün Tılsımı', 'Ejder Kalbi Kolye']
};

const LEGENDARY_TITLES = {
  weapon: ['Fırtınanın Hükmü', 'Şafak Yaran', 'Kaos Biçen'],
  helmet: ['Kadim Kralın Tacı', 'Gök Bekçisi'],
  chest: ['Sarsılmaz Kale', 'Yıldız Dövmesi'],
  gloves: ['Titan Kavrayışı', 'Kıvılcım Eller'],
  boots: ['Rüzgar Koşucusu', 'Gölge Adım'],
  ring: ['Kaderin Halkası', 'Sonsuzluk Mührü'],
  amulet: ['Yıkım Muhafızının Çekirdeği', 'Ay Işığı Gözyaşı']
};

const STAT_LABELS = {
  atk: 'Saldırı',
  hp: 'Can',
  def: 'Savunma',
  crit: 'Kritik Şansı',
  critDmg: 'Kritik Hasarı',
  haste: 'Bekleme Azaltma',
  lifesteal: 'Can Çalma'
};

const PERCENT_STATS = new Set(['crit', 'critDmg', 'haste', 'lifesteal']);

// Canavar şablonları: XP ve ganimet tablosu
const MOB_TABLE = {
  slime_green: { xp: 10, gearChance: 0.2 },
  slime_pyro: { xp: 13, gearChance: 0.22 },
  hilichurl_recruit: { xp: 15, gearChance: 0.24 },
  hilichurl: { xp: 18, gearChance: 0.26 },
  hilichurl_warrior: { xp: 24, gearChance: 0.30 },
  pyromancer: { xp: 32, gearChance: 0.36 },
  mitachurl_axe: { xp: 60, gearChance: 0.65, elite: true },
  abyss_sentinel: { xp: 45, gearChance: 0.42 },
  abyss_mage: { xp: 55, gearChance: 0.48 },
  ruin_golem: { xp: 180, gearChance: 1.0, boss: true },
  // Aion 2 Aether Zindanı Yaratıkları
  aether_guardian: { xp: 38, gearChance: 0.40 },
  abyss_archon_mini: { xp: 95, gearChance: 0.85, elite: true },
  tahabata_lord: { xp: 260, gearChance: 1.0, boss: true }
};

const RARITY_WEIGHTS = {
  normal: [60, 27, 10, 2.7, 0.3],
  elite: [18, 40, 29, 11, 2],
  boss: [0, 22, 46, 25, 7]
};

// Çok Kademeli MMORPG Zindan Bölgeleri Konfigürasyonu
const ZONE_CONFIGS = {
  battle_zone_1: {
    id: 'battle_zone_1',
    name: 'Kadim Sarmaşıklı Orman',
    tier: 1,
    reqGS: 100,
    minIlvl: 1,
    maxIlvl: 12,
    theme: 'emerald_glade',
    weights: [75, 23, 2, 0, 0], // Çoğunlukla Sıradan, biraz Sıradışı, %2 Nadir
    bossWeights: [30, 55, 15, 0, 0],
    primoReward: 0
  },
  battle_zone_2: {
    id: 'battle_zone_2',
    name: 'Kızıl Lav Harabeleri',
    tier: 2,
    reqGS: 350,
    minIlvl: 15,
    maxIlvl: 30,
    theme: 'crimson_ruins',
    weights: [20, 50, 26, 3.8, 0.2], // Sıradışı & Nadir, %3.8 Destansı, %0.2 Efsanevi
    bossWeights: [0, 30, 55, 13, 2],
    primoReward: 4 // Mini-boss kesiminde 3-5 Primogem
  },
  battle_zone_3: {
    id: 'battle_zone_3',
    name: 'Kadim Uçurum Boşluğu',
    tier: 3,
    reqGS: 750,
    minIlvl: 32,
    maxIlvl: 50,
    theme: 'abyssal_core',
    weights: [0, 20, 55, 22, 3], // Nadir & Destansı, %3 Efsanevi
    bossWeights: [0, 10, 48, 37, 5], // Boss: %5 Efsanevi (prestijli ve dengeli), %37 Destansı
    primoReward: 20 // Boss kesildiğinde 15-25 Primogem
  },
  // --- Aion 2 Tarzı 3 Aşamalı Aether Zindanları (Instance Dungeons) ---
  dungeon_tier_1: {
    id: 'dungeon_tier_1',
    name: 'Mühürlü Aether Tapınağı (Normal)',
    tier: 1,
    isDungeon: true,
    reqGS: 150,
    minIlvl: 10,
    maxIlvl: 20,
    theme: 'aion_sanctum',
    weights: [25, 50, 22, 3, 0],
    bossWeights: [0, 35, 48, 15, 2],
    primoReward: 10
  },
  dungeon_tier_2: {
    id: 'dungeon_tier_2',
    name: 'Kızıl Aether Kalesi (Kahraman)',
    tier: 2,
    isDungeon: true,
    reqGS: 450,
    minIlvl: 24,
    maxIlvl: 36,
    theme: 'aion_fortress',
    weights: [5, 35, 45, 13, 2],
    bossWeights: [0, 10, 50, 32, 8],
    primoReward: 18
  },
  dungeon_tier_3: {
    id: 'dungeon_tier_3',
    name: "Tahabata'nın Uçurum Kalbi (Abyss)",
    tier: 3,
    isDungeon: true,
    reqGS: 800,
    minIlvl: 38,
    maxIlvl: 50,
    theme: 'aion_abyss',
    weights: [0, 10, 50, 33, 7],
    bossWeights: [0, 0, 32, 50, 18],
    primoReward: 30
  }
};

/**
 * GearScore zorluk ve ceza çarpanı hesaplayıcı (Soft-Gate).
 * Oyuncunun GS'i önerilen GS'ten düşükse hasar cezası ve darbe sektirme devreye girer.
 */
function getGsDifficultyMultiplier(playerGS = 0, reqGS = 100) {
  if (!reqGS || reqGS <= 0) {
    return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: 1.0 };
  }
  const ratio = Math.max(0.05, playerGS / reqGS);
  if (ratio >= 1.0) {
    return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: 1.0 };
  } else if (ratio >= 0.6) {
    // Zorlu Seviye (Challenging): %40'a varan hasar cezası, hafif darbe artışı
    const damageMult = Math.max(0.45, Math.round(ratio * 100) / 100);
    const damageTakenMult = Math.min(1.8, Math.round((1 + (1 - ratio) * 1.3) * 100) / 100);
    const glanceChance = Math.round((1 - ratio) * 0.25 * 100) / 100; // %5 - %10 sektirme
    return { damageMult, damageTakenMult, glanceChance, status: 'challenging', ratio: Math.round(ratio * 100) / 100 };
  } else {
    // Ölümcül Risk (Deadly): %85'e varan hasar cezası, 2.5 kat hasar alma, %35 vuruş sektirme
    const damageMult = Math.max(0.15, Math.round(ratio * 0.7 * 100) / 100);
    const damageTakenMult = Math.min(2.5, Math.round((1.5 + (1 - ratio) * 1.5) * 100) / 100);
    const glanceChance = 0.35; // %35 sektirme
    return { damageMult, damageTakenMult, glanceChance, status: 'deadly', ratio: Math.round(ratio * 100) / 100 };
  }
}

const MAX_LEVEL = 50;
const BAG_SIZE = 40;
const MAX_PLUS = 10;

function xpForLevel(level) {
  return Math.round(60 * Math.pow(level, 1.5) + 40);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function tierIndex(ilvl) {
  if (ilvl >= 38) return 4;
  if (ilvl >= 26) return 3;
  if (ilvl >= 16) return 2;
  if (ilvl >= 8) return 1;
  return 0;
}

function pickWeighted(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function itemPower(item) {
  const r = RARITIES[item.rarity] || RARITIES[1];
  return item.ilvl * r.powerMult * (1 + 0.06 * (item.plus || 0));
}

function itemScore(item) {
  if (!item) return 0;
  const r = RARITIES[item.rarity] || RARITIES[1];
  return Math.round(item.ilvl * 10 * r.scoreMult * (1 + 0.05 * (item.plus || 0)));
}

/** Bir itemin güncel (güçlendirme dahil) stat değerlerini hesaplar. */
function itemStats(item) {
  const p = itemPower(item);
  const out = {};
  const add = (k, v) => { out[k] = round1((out[k] || 0) + v); };

  switch (item.slot) {
    case 'weapon': add('atk', 8 + p * 2.2); break;
    case 'helmet': add('hp', 30 + p * 12); add('def', 2 + p * 0.5); break;
    case 'chest': add('hp', 45 + p * 16); add('def', 3 + p * 0.7); break;
    case 'gloves': add('hp', 20 + p * 8); add('atk', 2 + p * 0.45); break;
    case 'boots': add('hp', 20 + p * 9); add('def', 2 + p * 0.4); break;
    case 'ring': add('crit', Math.min(22, 3 + item.rarity * 1.2 + item.ilvl * 0.12 + (item.plus || 0) * 0.3)); break;
    case 'amulet': add('critDmg', 10 + item.rarity * 4 + item.ilvl * 0.6 + (item.plus || 0) * 1.5); break;
    default: break;
  }

  for (const affix of item.affixes || []) {
    const q = affix.roll; // 0.7 - 1.0 kalite çarpanı
    switch (affix.stat) {
      case 'atk': add('atk', (2 + p * 0.5) * q); break;
      case 'hp': add('hp', (15 + p * 4.5) * q); break;
      case 'def': add('def', (1 + p * 0.3) * q); break;
      case 'crit': add('crit', (1.5 + item.rarity * 0.5) * q); break;
      case 'critDmg': add('critDmg', (4 + item.rarity * 1.6) * q); break;
      case 'haste': add('haste', (2 + item.rarity * 0.6) * q); break;
      case 'lifesteal': add('lifesteal', (0.6 + item.rarity * 0.3) * q); break;
      default: break;
    }
  }
  return out;
}

function upgradeCost(item) {
  const plus = item.plus || 0;
  return Math.round(Math.pow(plus + 1, 1.5) * 3 * item.rarity + item.ilvl * 0.5);
}

function salvageValue(item) {
  const r = RARITIES[item.rarity] || RARITIES[1];
  let refund = 0;
  for (let i = 0; i < (item.plus || 0); i++) {
    refund += Math.round(Math.pow(i + 1, 1.5) * 3 * item.rarity + item.ilvl * 0.5);
  }
  return Math.round(r.dust * (1 + item.ilvl / 10) + refund * 0.6);
}

/** İstemciye gönderilecek, hesaplanmış alanları eklenmiş item görünümü. */
function describeItem(item) {
  if (!item) return null;
  return {
    ...item,
    slotLabel: SLOT_LABELS[item.slot],
    rarityLabel: RARITIES[item.rarity].label,
    score: itemScore(item),
    stats: itemStats(item),
    upgradeCost: (item.plus || 0) >= MAX_PLUS ? null : upgradeCost(item),
    salvage: salvageValue(item)
  };
}

class RpgEngine {
  constructor(options = {}) {
    this.db = options.db || null;
    this.rng = options.rng || Math.random;
    this.profiles = new Map(); // key -> profile
    this.killBuckets = new Map(); // key -> { tokens, last, lastBoss }
    this.saveTimers = new Map();
    this.uidCounter = 0;
  }

  static get SLOTS() { return SLOTS; }

  _key(username) {
    return String(username || '').toLowerCase();
  }

  _newProfile() {
    return { level: 1, xp: 0, dust: 0, kills: 0, bossKills: 0, equipment: {}, bag: [] };
  }

  /**
   * @param {string} username
   * @param {{persist?: boolean}} [opts] persist=false ise (misafir) profil yalnızca bellekte tutulur
   */
  getProfile(username, opts = {}) {
    const key = this._key(username);
    if (!key) return null;
    let profile = this.profiles.get(key);
    if (!profile) {
      let stored = null;
      if (this.db && opts.persist !== false) {
        try {
          stored = this.db.getSetting(`rpg:${key}`);
          if (typeof stored === 'string') stored = JSON.parse(stored);
        } catch (e) {
          stored = null;
        }
      }
      profile = Object.assign(this._newProfile(), stored && typeof stored === 'object' ? stored : {});
      if (!profile.equipment || typeof profile.equipment !== 'object') profile.equipment = {};
      if (!Array.isArray(profile.bag)) profile.bag = [];
      profile.persist = opts.persist !== false;
      this.profiles.set(key, profile);

      // Yeni maceracıya başlangıç kılıcı
      if (!stored && !profile.equipment.weapon) {
        profile.equipment.weapon = this.generateItem({ slot: 'weapon', ilvl: 1, rarity: 1 });
      }
    } else if (opts.persist === true && !profile.persist) {
      profile.persist = true;
    }
    return profile;
  }

  /** Misafir profilini Kick hesabına taşır (hesabın kayıtlı profili yoksa). */
  adoptGuestProfile(guestName, kickName) {
    const gKey = this._key(guestName);
    const kKey = this._key(kickName);
    const guest = this.profiles.get(gKey);
    if (!guest || gKey === kKey) return;
    const hasStored = this.profiles.has(kKey) || (this.db && this.db.getSetting(`rpg:${kKey}`));
    this.profiles.delete(gKey);
    if (!hasStored) {
      guest.persist = true;
      this.profiles.set(kKey, guest);
      this._scheduleSave(kickName);
    }
  }

  _scheduleSave(username) {
    const key = this._key(username);
    const profile = this.profiles.get(key);
    if (!profile || !profile.persist || !this.db) return;
    if (this.saveTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.saveTimers.delete(key);
      this._saveNow(key);
    }, 2500);
    if (timer.unref) timer.unref();
    this.saveTimers.set(key, timer);
  }

  _saveNow(key) {
    const profile = this.profiles.get(key);
    if (!profile || !profile.persist || !this.db) return;
    const { persist, ...data } = profile;
    try {
      const res = this.db.setSetting(`rpg:${key}`, data);
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch (e) {
      console.error('[RpgEngine] Profil kaydedilemedi:', e.message);
    }
  }

  flush() {
    for (const [key, timer] of this.saveTimers.entries()) {
      clearTimeout(timer);
      this._saveNow(key);
    }
    this.saveTimers.clear();
  }

  generateItem({ slot, ilvl = 1, rarity = 1 } = {}) {
    const rng = this.rng;
    const s = SLOTS.includes(slot) ? slot : SLOTS[Math.floor(rng() * SLOTS.length)];
    const r = Math.max(1, Math.min(5, rarity | 0));
    const lvl = Math.max(1, Math.min(MAX_LEVEL + 5, ilvl | 0));

    const affixPool = ['atk', 'hp', 'def', 'crit', 'critDmg', 'haste', 'lifesteal'];
    const affixes = [];
    for (let i = 0; i < RARITIES[r].affixes && affixPool.length; i++) {
      const idx = Math.floor(rng() * affixPool.length);
      const stat = affixPool.splice(idx, 1)[0];
      affixes.push({ stat, roll: round1(0.7 + rng() * 0.3) });
    }

    let name = BASE_NAMES[s][tierIndex(lvl)];
    if (r === 5) {
      const titles = LEGENDARY_TITLES[s];
      name = `${name} — ${titles[Math.floor(rng() * titles.length)]}`;
    }

    this.uidCounter = (this.uidCounter + 1) % 100000;
    return {
      uid: `it_${Date.now().toString(36)}_${this.uidCounter.toString(36)}${Math.floor(rng() * 1296).toString(36)}`,
      slot: s,
      name,
      rarity: r,
      ilvl: lvl,
      plus: 0,
      affixes
    };
  }

  computeStats(profile) {
    const L = profile.level;
    const stats = {
      atk: 18 + L * 3,
      hp: 420 + L * 45,
      def: 4 + L * 1.2,
      crit: 5,
      critDmg: 150,
      haste: 0,
      lifesteal: 0
    };
    let gearScore = 0;
    for (const slot of SLOTS) {
      const item = profile.equipment[slot];
      if (!item) continue;
      gearScore += itemScore(item);
      const s = itemStats(item);
      for (const k of Object.keys(s)) stats[k] = (stats[k] || 0) + s[k];
    }
    stats.atk = Math.round(stats.atk);
    stats.hp = Math.round(stats.hp);
    stats.def = Math.round(stats.def);
    stats.crit = round1(Math.min(75, stats.crit));
    stats.critDmg = round1(stats.critDmg);
    stats.haste = round1(Math.min(40, stats.haste));
    stats.lifesteal = round1(Math.min(15, stats.lifesteal));
    return { ...stats, gearScore };
  }

  gearScore(username) {
    const profile = this.profiles.get(this._key(username));
    if (!profile) return 0;
    return this.computeStats(profile).gearScore;
  }

  /** Diğer oyunculara yayınlanan özet. */
  getPublicSummary(username) {
    const profile = this.profiles.get(this._key(username));
    if (!profile) return { level: 1, gs: 0, weaponRarity: 1 };
    return {
      level: profile.level,
      gs: this.computeStats(profile).gearScore,
      weaponRarity: profile.equipment.weapon ? profile.equipment.weapon.rarity : 0
    };
  }

  /** İstemciye gönderilen tam durum. */
  getState(username, opts) {
    const profile = this.getProfile(username, opts);
    if (!profile) return null;
    const equipment = {};
    for (const slot of SLOTS) equipment[slot] = describeItem(profile.equipment[slot]);
    return {
      level: profile.level,
      xp: profile.xp,
      xpNeeded: profile.level >= MAX_LEVEL ? 0 : xpForLevel(profile.level),
      maxLevel: MAX_LEVEL,
      dust: profile.dust,
      kills: profile.kills,
      bossKills: profile.bossKills,
      bagSize: BAG_SIZE,
      stats: this.computeStats(profile),
      equipment,
      bag: profile.bag.map(describeItem)
    };
  }

  _allowKill(key, isBoss) {
    const now = Date.now();
    let b = this.killBuckets.get(key);
    if (!b) {
      b = { tokens: 8, last: now, lastBoss: 0 };
      this.killBuckets.set(key, b);
    }
    b.tokens = Math.min(8, b.tokens + ((now - b.last) / 1000) * 1.6);
    b.last = now;
    if (isBoss) {
      if (now - b.lastBoss < 15000) return false;
      b.lastBoss = now;
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /**
   * Canavar öldürme: XP + ganimet üretir.
   * @param {string} username
   * @param {{mobType:string, level?:number, elite?:boolean, zoneId?:string}} [param1]
   * @returns {{ok:boolean, xp?:number, leveledUp?:boolean, drops?:object[], autoSalvaged?:object[], dust?:number, primoGain?:number}}
   */
  handleKill(username, { mobType, level = 1, elite = false, zoneId } = {}, opts) {
    const profile = this.getProfile(username, opts);
    const cfg = MOB_TABLE[mobType];
    if (!profile || !cfg) return { ok: false, error: 'Geçersiz canavar.' };

    const key = this._key(username);
    if (!this._allowKill(key, !!cfg.boss)) return { ok: false, error: 'Çok hızlı.' };

    const rng = this.rng;
    // Canavar seviyesi oyuncudan en fazla 5 seviye yüksek olabilir (istemci hilesine karşı)
    const mobLevel = Math.max(1, Math.min(profile.level + 5, level | 0));
    const isElite = !!elite && !cfg.boss;

    // XP: seviye farkı cezası (çok düşük seviyeli canavar az XP verir)
    const diff = profile.level - mobLevel;
    const diffMult = diff > 8 ? 0.15 : diff > 4 ? 0.5 : 1;
    const xp = Math.max(1, Math.round(cfg.xp * (1 + mobLevel * 0.12) * (isElite ? 2.5 : 1) * diffMult));

    profile.kills += 1;
    if (cfg.boss) profile.bossKills += 1;

    let leveledUp = false;
    if (profile.level < MAX_LEVEL) {
      profile.xp += xp;
      while (profile.level < MAX_LEVEL && profile.xp >= xpForLevel(profile.level)) {
        profile.xp -= xpForLevel(profile.level);
        profile.level += 1;
        leveledUp = true;
      }
      if (profile.level >= MAX_LEVEL) profile.xp = 0;
    }

    // Bölgeye göre ganimet ve Primogem dengesi
    const zone = (zoneId && ZONE_CONFIGS[zoneId]) || null;
    let primoGain = 0;
    if (zone && zone.primoReward > 0) {
      if (cfg.boss) {
        // Boss kesildiğinde dengeli 15-25 Primogem (abartısız MMORPG ödülü)
        primoGain = 15 + Math.floor(rng() * 11);
      } else if (cfg.elite || isElite) {
        // Mini-boss kesiminde %60 ihtimalle 3-5 Primogem
        if (rng() < 0.6) primoGain = 3 + Math.floor(rng() * 3);
      }
    }

    const drops = [];
    const autoSalvaged = [];
    const table = zone ? (cfg.boss ? zone.bossWeights : (isElite ? zone.bossWeights : zone.weights)) :
      (cfg.boss ? RARITY_WEIGHTS.boss : (isElite ? RARITY_WEIGHTS.elite : RARITY_WEIGHTS.normal));
    const count = cfg.boss ? 2 : ((isElite || rng() < (cfg.gearChance || 0.25)) ? 1 : 0);
    let dustGain = cfg.boss ? 8 + Math.round(mobLevel * 0.8) : (isElite ? 3 : (rng() < 0.3 ? 1 : 0));

    const minIlvl = zone ? zone.minIlvl : 1;
    const maxIlvl = zone ? zone.maxIlvl : 50;

    for (let i = 0; i < count; i++) {
      const rarity = pickWeighted(table, rng) + 1;
      const baseIlvl = Math.max(minIlvl, Math.min(maxIlvl, mobLevel + Math.floor(rng() * 3)));
      const ilvl = cfg.boss ? Math.min(maxIlvl, baseIlvl + 2) : baseIlvl;
      const item = this.generateItem({ ilvl, rarity });
      if (profile.bag.length >= BAG_SIZE) {
        dustGain += salvageValue(item);
        autoSalvaged.push(describeItem(item));
      } else {
        profile.bag.push(item);
        drops.push(describeItem(item));
      }
    }
    profile.dust += dustGain;

    this._scheduleSave(username);
    return {
      ok: true,
      xp,
      leveledUp,
      level: profile.level,
      drops,
      autoSalvaged,
      dust: dustGain,
      primoGain,
      mobLevel,
      isBoss: !!cfg.boss,
      zoneId: zone ? zone.id : null
    };
  }

  equip(username, uid) {
    const profile = this.getProfile(username);
    if (!profile) return { ok: false, error: 'Profil yok.' };
    const idx = profile.bag.findIndex(i => i.uid === uid);
    if (idx < 0) return { ok: false, error: 'Eşya çantada bulunamadı.' };
    const item = profile.bag[idx];
    if (item.ilvl > profile.level + 5) {
      return { ok: false, error: `Bu eşya için en az ${item.ilvl - 5}. seviye olmalısın.` };
    }
    const prev = profile.equipment[item.slot];
    profile.bag.splice(idx, 1);
    if (prev) profile.bag.push(prev);
    profile.equipment[item.slot] = item;
    this._scheduleSave(username);
    return { ok: true, item: describeItem(item) };
  }

  unequip(username, slot) {
    const profile = this.getProfile(username);
    if (!profile || !SLOTS.includes(slot)) return { ok: false, error: 'Geçersiz yuva.' };
    const item = profile.equipment[slot];
    if (!item) return { ok: false, error: 'Bu yuva zaten boş.' };
    if (profile.bag.length >= BAG_SIZE) return { ok: false, error: 'Çanta dolu.' };
    delete profile.equipment[slot];
    profile.bag.push(item);
    this._scheduleSave(username);
    return { ok: true };
  }

  /** Tek eşyayı (uid) ya da belirli nadirliğe kadar tüm çantayı (maxRarity) parçalar. */
  salvage(username, { uid, maxRarity } = {}) {
    const profile = this.getProfile(username);
    if (!profile) return { ok: false, error: 'Profil yok.' };
    let targets;
    if (uid) {
      targets = profile.bag.filter(i => i.uid === uid);
    } else {
      const cap = Math.max(1, Math.min(4, maxRarity | 0)); // toplu parçalama efsanevilere dokunmaz
      targets = profile.bag.filter(i => i.rarity <= cap && !(i.plus > 0));
    }
    if (!targets.length) return { ok: false, error: 'Parçalanacak eşya yok.' };
    const set = new Set(targets.map(i => i.uid));
    const dust = targets.reduce((a, i) => a + salvageValue(i), 0);
    profile.bag = profile.bag.filter(i => !set.has(i.uid));
    profile.dust += dust;
    this._scheduleSave(username);
    return { ok: true, dust, count: targets.length };
  }

  upgrade(username, uid) {
    const profile = this.getProfile(username);
    if (!profile) return { ok: false, error: 'Profil yok.' };
    const item = profile.bag.find(i => i.uid === uid)
      || SLOTS.map(s => profile.equipment[s]).find(i => i && i.uid === uid);
    if (!item) return { ok: false, error: 'Eşya bulunamadı.' };
    if ((item.plus || 0) >= MAX_PLUS) return { ok: false, error: 'Eşya zaten en yüksek seviyede (+10).' };
    const cost = upgradeCost(item);
    if (profile.dust < cost) return { ok: false, error: `Yeterli Rün Tozu yok (${cost} gerekli).` };
    profile.dust -= cost;
    item.plus = (item.plus || 0) + 1;
    this._scheduleSave(username);
    return { ok: true, item: describeItem(item), cost };
  }

  /** Sunucudaki en yüksek GearScore sıralaması (yalnızca kalıcı profiller). */
  getLeaderboard(limit = 5) {
    const rows = [];
    for (const [key, profile] of this.profiles.entries()) {
      if (!profile.persist) continue;
      rows.push({ username: key, level: profile.level, gs: this.computeStats(profile).gearScore });
    }
    rows.sort((a, b) => b.gs - a.gs || b.level - a.level);
    return rows.slice(0, limit);
  }

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _ensureDailyQuests(profile) {
    const today = this._todayKey();
    if (!profile.dailyQuests || typeof profile.dailyQuests !== 'object' || profile.dailyQuests.date !== today) {
      profile.dailyQuests = {
        date: today,
        progress: {},
        claimed: {},
        bonusClaimed: false,
        lastChatTs: 0
      };
    }
    if (!profile.dailyQuests.progress) profile.dailyQuests.progress = {};
    if (!profile.dailyQuests.claimed) profile.dailyQuests.claimed = {};
    return profile.dailyQuests;
  }

  /**
   * Günlük görev durumunu döndürür (5 görev + Mylune Günlük Lonca Sandığı).
   */
  getDailyQuestsState(username, opts = {}) {
    const profile = this.getProfile(username, opts);
    if (!profile) return null;
    const dq = this._ensureDailyQuests(profile);
    const quests = DAILY_QUESTS_POOL.map(q => {
      const progress = Math.min(q.target, dq.progress[q.id] || 0);
      const completed = progress >= q.target;
      const claimed = Boolean(dq.claimed[q.id]);
      return {
        ...q,
        progress,
        completed,
        claimed
      };
    });
    const completedCount = quests.filter(q => q.completed).length;
    const claimedCount = quests.filter(q => q.claimed).length;
    const allCompleted = completedCount === DAILY_QUESTS_POOL.length;
    return {
      date: dq.date,
      quests,
      completedCount,
      claimedCount,
      totalCount: DAILY_QUESTS_POOL.length,
      allCompleted,
      bonusChest: {
        ...DAILY_BONUS_CHEST,
        unlocked: allCompleted,
        claimed: Boolean(dq.bonusClaimed)
      }
    };
  }

  /**
   * Günlük görev ilerlemesi kaydeder.
   * kick_chat_10 için 5 saniyelik anti-spam soğuma süresi uygular.
   */
  recordDailyQuestProgress(username, questId, amount = 1, opts = {}) {
    const profile = this.getProfile(username, opts);
    const q = DAILY_QUESTS_POOL.find(item => item.id === questId);
    if (!profile || !q) return { updated: false, error: 'Geçersiz görev.' };

    const dq = this._ensureDailyQuests(profile);
    const now = Date.now();
    if (questId === 'kick_chat_10' && opts.enforceCooldown !== false) {
      if (now - (dq.lastChatTs || 0) < 5000) {
        return {
          updated: false,
          reason: 'cooldown',
          state: this.getDailyQuestsState(username, opts)
        };
      }
      dq.lastChatTs = now;
    }

    const prev = Math.min(q.target, dq.progress[questId] || 0);
    if (prev >= q.target) {
      return {
        updated: false,
        justCompleted: false,
        quest: q,
        progress: prev,
        target: q.target,
        state: this.getDailyQuestsState(username, opts)
      };
    }

    const next = Math.min(q.target, prev + Math.max(1, amount | 0));
    dq.progress[questId] = next;
    this._scheduleSave(username);

    return {
      updated: next > prev,
      justCompleted: prev < q.target && next >= q.target,
      quest: q,
      progress: next,
      target: q.target,
      state: this.getDailyQuestsState(username, opts)
    };
  }

  /**
   * RPG XP ve isteğe bağlı Epik/Efsanevi (4★/5★) ekipman ödülü verir.
   */
  grantQuestReward(username, { xp = 0, grantBonusItem = false } = {}, opts = {}) {
    const profile = this.getProfile(username, opts);
    if (!profile) return { ok: false };

    let leveledUp = false;
    if (xp > 0 && profile.level < MAX_LEVEL) {
      profile.xp += xp;
      while (profile.level < MAX_LEVEL && profile.xp >= xpForLevel(profile.level)) {
        profile.xp -= xpForLevel(profile.level);
        profile.level += 1;
        leveledUp = true;
      }
      if (profile.level >= MAX_LEVEL) profile.xp = 0;
    }

    let bonusItem = null;
    let autoSalvagedDust = 0;
    if (grantBonusItem) {
      const rarity = this.rng() < 0.38 ? 5 : 4; // %38 5★ Efsanevi, %62 4★ Epik
      const ilvl = Math.max(1, Math.min(MAX_LEVEL, profile.level + 1));
      const item = this.generateItem({ ilvl, rarity });
      bonusItem = describeItem(item);
      if (profile.bag.length >= BAG_SIZE) {
        autoSalvagedDust = salvageValue(item);
        profile.dust += autoSalvagedDust;
      } else {
        profile.bag.push(item);
      }
    }

    this._scheduleSave(username);
    return {
      ok: true,
      xp,
      leveledUp,
      level: profile.level,
      bonusItem,
      autoSalvagedDust
    };
  }

  /**
   * Tek bir günlük görevi veya 'bonus_chest' ödülünü talep eder.
   */
  claimDailyQuest(username, questId, opts = {}) {
    const profile = this.getProfile(username, opts);
    if (!profile) return { ok: false, error: 'Profil bulunamadı.' };
    const dq = this._ensureDailyQuests(profile);

    if (questId === 'bonus_chest') {
      const allDone = DAILY_QUESTS_POOL.every(q => (dq.progress[q.id] || 0) >= q.target);
      if (!allDone) {
        return { ok: false, error: 'Önce 5 günlük görevin tamamını bitirmelisin!' };
      }
      if (dq.bonusClaimed) {
        return { ok: false, error: 'Mylune Günlük Lonca Sandığı bugün zaten alındı.' };
      }
      dq.bonusClaimed = true;
      const rw = this.grantQuestReward(username, {
        xp: DAILY_BONUS_CHEST.rewardXp,
        grantBonusItem: true
      }, opts);
      return {
        ok: true,
        questId: 'bonus_chest',
        title: DAILY_BONUS_CHEST.title,
        primoGain: DAILY_BONUS_CHEST.rewardPrimo,
        xpGain: DAILY_BONUS_CHEST.rewardXp,
        leveledUp: rw.leveledUp,
        level: rw.level,
        bonusItem: rw.bonusItem,
        state: this.getDailyQuestsState(username, opts),
        rpgState: this.getState(username, opts)
      };
    }

    const q = DAILY_QUESTS_POOL.find(item => item.id === questId);
    if (!q) return { ok: false, error: 'Geçersiz görev.' };
    const prog = dq.progress[q.id] || 0;
    if (prog < q.target) {
      return { ok: false, error: `Görev henüz tamamlanmadı (${prog}/${q.target}).` };
    }
    if (dq.claimed[q.id]) {
      return { ok: false, error: 'Bu görevin ödülü bugün zaten alındı.' };
    }

    dq.claimed[q.id] = true;
    const rw = this.grantQuestReward(username, { xp: q.rewardXp, grantBonusItem: false }, opts);
    return {
      ok: true,
      questId: q.id,
      title: q.title,
      primoGain: q.rewardPrimo,
      xpGain: q.rewardXp,
      leveledUp: rw.leveledUp,
      level: rw.level,
      state: this.getDailyQuestsState(username, opts),
      rpgState: this.getState(username, opts)
    };
  }

  /**
   * Tamamlanmış ancak henüz alınmamış tüm günlük görev ödüllerini + açıksa Bonus Sandığı toplar.
   */
  claimAllAvailableDailyQuests(username, opts = {}) {
    const profile = this.getProfile(username, opts);
    if (!profile) return { ok: false, error: 'Profil bulunamadı.' };
    const dq = this._ensureDailyQuests(profile);

    let totalPrimo = 0;
    let totalXp = 0;
    let anyLeveledUp = false;
    let bonusItem = null;
    const claimedTitles = [];

    for (const q of DAILY_QUESTS_POOL) {
      const prog = dq.progress[q.id] || 0;
      if (prog >= q.target && !dq.claimed[q.id]) {
        dq.claimed[q.id] = true;
        totalPrimo += q.rewardPrimo;
        totalXp += q.rewardXp;
        claimedTitles.push(q.title);
      }
    }

    const allDone = DAILY_QUESTS_POOL.every(q => (dq.progress[q.id] || 0) >= q.target);
    if (allDone && !dq.bonusClaimed) {
      dq.bonusClaimed = true;
      totalPrimo += DAILY_BONUS_CHEST.rewardPrimo;
      totalXp += DAILY_BONUS_CHEST.rewardXp;
      claimedTitles.push(`🎁 ${DAILY_BONUS_CHEST.title}`);
      const rw = this.grantQuestReward(username, { xp: totalXp, grantBonusItem: true }, opts);
      anyLeveledUp = rw.leveledUp;
      bonusItem = rw.bonusItem;
    } else if (totalXp > 0) {
      const rw = this.grantQuestReward(username, { xp: totalXp, grantBonusItem: false }, opts);
      anyLeveledUp = rw.leveledUp;
    }

    return {
      ok: claimedTitles.length > 0,
      claimedTitles,
      primoGain: totalPrimo,
      xpGain: totalXp,
      leveledUp: anyLeveledUp,
      level: profile.level,
      bonusItem,
      state: this.getDailyQuestsState(username, opts),
      rpgState: this.getState(username, opts)
    };
  }

  /**
   * Aion 2 Tarzı Zindan Hazine Sandığı Ödülü (Normal Sandık & S-Rank Altın Uçurum Sandığı).
   */
  claimDungeonChest(username, { tierId = 'dungeon_tier_1', rank = 'B', isBonusChest = false } = {}, opts = {}) {
    const profile = this.getProfile(username, opts);
    if (!profile) return { ok: false, error: 'Profil bulunamadı.' };

    const zone = ZONE_CONFIGS[tierId] || ZONE_CONFIGS.dungeon_tier_1;
    const tier = zone.tier || 1;
    const rankStr = ['S', 'A', 'B', 'C'].includes(rank) ? rank : 'B';

    const rankMult = rankStr === 'S' ? 1.5 : (rankStr === 'A' ? 1.25 : (rankStr === 'B' ? 1.0 : 0.8));

    let primoGain = 0;
    let xpGain = 0;
    let dustGain = 0;
    let rarity = 3;
    let ilvl = Math.max(zone.minIlvl || 10, Math.min(zone.maxIlvl || 20, profile.level + 2));

    if (isBonusChest) {
      // S-Rank Altın Uçurum Sandığı
      if (tier === 3) {
        primoGain = 320; // 2 Tam Dilek!
        xpGain = 550;
        dustGain = 60;
        rarity = 5; // Garanti 5★ Efsanevi Ekipman!
        ilvl = Math.max(42, Math.min(MAX_LEVEL, profile.level + 4));
      } else if (tier === 2) {
        primoGain = 240;
        xpGain = 320;
        dustGain = 32;
        rarity = this.rng() < 0.45 ? 5 : 4;
        ilvl = Math.max(28, Math.min(38, profile.level + 3));
      } else {
        primoGain = 160;
        xpGain = 180;
        dustGain = 18;
        rarity = this.rng() < 0.20 ? 5 : 4;
        ilvl = Math.max(14, Math.min(22, profile.level + 2));
      }
    } else {
      // Standart Zindan Tamamlama Sandığı
      const basePrimo = tier === 3 ? 160 : (tier === 2 ? 120 : 80);
      const baseXp = tier === 3 ? 400 : (tier === 2 ? 240 : 120);
      const baseDust = tier === 3 ? 38 : (tier === 2 ? 22 : 12);
      primoGain = Math.round(basePrimo * rankMult);
      xpGain = Math.round(baseXp * rankMult);
      dustGain = Math.round(baseDust * rankMult);
      const weights = zone.bossWeights || [0, 20, 50, 25, 5];
      rarity = pickWeighted(weights, this.rng) + 1;
      if (rankStr === 'S' && rarity < 4) rarity = 4;
      if (tier >= 2 && rarity < 3) rarity = 3;
    }

    let leveledUp = false;
    if (profile.level < MAX_LEVEL) {
      profile.xp += xpGain;
      while (profile.level < MAX_LEVEL && profile.xp >= xpForLevel(profile.level)) {
        profile.xp -= xpForLevel(profile.level);
        profile.level += 1;
        leveledUp = true;
      }
      if (profile.level >= MAX_LEVEL) profile.xp = 0;
    }

    const item = this.generateItem({ ilvl, rarity });
    const descItem = describeItem(item);
    let autoSalvaged = false;
    if (profile.bag.length >= BAG_SIZE) {
      dustGain += salvageValue(item);
      autoSalvaged = true;
    } else {
      profile.bag.push(item);
    }
    profile.dust += dustGain;
    this._scheduleSave(username);

    return {
      ok: true,
      success: true,
      tierId: zone.id,
      zoneName: zone.name,
      rank: rankStr,
      isBonusChest,
      primoGain,
      xpGain,
      dustGain,
      wishes: isBonusChest ? 2 : 1,
      leveledUp,
      level: profile.level,
      item: descItem,
      equipment: descItem,
      autoSalvaged,
      rpgState: this.getState(username, opts)
    };
  }
}

const DAILY_QUESTS_POOL = [
  {
    id: 'kick_chat_10',
    title: 'Mylune Kick Sohbeti',
    desc: 'Mylune Kick canlı yayın sohbetine 10 mesaj yaz (en az 5sn arayla)',
    category: 'kick',
    badge: 'KICK YAYINI',
    icon: '💬',
    target: 10,
    rewardPrimo: 60,
    rewardXp: 80
  },
  {
    id: 'kick_stream_event',
    title: 'Yayın Etkileşimi',
    desc: 'Kick sohbetinde !wish çek, !katil ile Boss Raid\'e gir, !balik/!maden başlat veya Trivia bil',
    category: 'kick',
    badge: 'KICK YAYINI',
    icon: '📺',
    target: 1,
    rewardPrimo: 50,
    rewardXp: 70
  },
  {
    id: 'mmo_fish_3',
    title: 'Nehir Balıkçısı',
    desc: 'Kasaba nehrinde 3 balık yakala',
    category: 'mmo',
    badge: '3D DÜNYA',
    icon: '🎣',
    target: 3,
    rewardPrimo: 45,
    rewardXp: 60
  },
  {
    id: 'mmo_kill_10',
    title: 'Zindan Avcısı',
    desc: 'Vahşi Savaş Arenası zindanlarında 10 yaratık alt et',
    category: 'mmo',
    badge: '3D ZİNDAN',
    icon: '⚔️',
    target: 10,
    rewardPrimo: 55,
    rewardXp: 90
  },
  {
    id: 'mmo_boss_or_guild',
    title: 'Lonca & Boss Seferi',
    desc: 'Maceracılar Loncası\'nda Katheryne ile görüş veya Zindanda 1 Boss devir',
    category: 'mmo',
    badge: 'LONCA / BOSS',
    icon: '🏰',
    target: 1,
    rewardPrimo: 60,
    rewardXp: 100
  }
];

const DAILY_BONUS_CHEST = {
  id: 'bonus_chest',
  title: 'Mylune Günlük Lonca Sandığı',
  desc: '5 günlük görevin tamamını bitirerek +160 Primogem (1 Dilek), +150 RPG XP ve 1x Rastgele 4★/5★ Epik/Efsanevi Ekipman kazan!',
  icon: '🎁',
  rewardPrimo: 160,
  rewardXp: 150
};

module.exports = {
  RpgEngine, SLOTS, SLOT_LABELS, RARITIES, STAT_LABELS, PERCENT_STATS, MOB_TABLE,
  ZONE_CONFIGS, getGsDifficultyMultiplier,
  DAILY_QUESTS_POOL, DAILY_BONUS_CHEST,
  MAX_LEVEL, BAG_SIZE, MAX_PLUS,
  xpForLevel, itemScore, itemStats, describeItem, upgradeCost, salvageValue
};
