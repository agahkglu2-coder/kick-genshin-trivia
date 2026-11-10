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
  hilichurl: { xp: 18, gearChance: 0.26 },
  pyromancer: { xp: 28, gearChance: 0.34 },
  ruin_golem: { xp: 140, gearChance: 1, boss: true }
};

const RARITY_WEIGHTS = {
  normal: [60, 27, 10, 2.7, 0.3],
  elite: [18, 40, 29, 11, 2],
  boss: [0, 22, 46, 25, 7]
};

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
   * @returns {{ok:boolean, xp?:number, leveledUp?:boolean, drops?:object[], autoSalvaged?:object[], dust?:number}}
   */
  handleKill(username, { mobType, level = 1, elite = false } = {}, opts) {
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

    // Ganimet
    const drops = [];
    const autoSalvaged = [];
    const table = cfg.boss ? RARITY_WEIGHTS.boss : (isElite ? RARITY_WEIGHTS.elite : RARITY_WEIGHTS.normal);
    const count = cfg.boss ? 2 : ((isElite || rng() < cfg.gearChance) ? 1 : 0);
    let dustGain = cfg.boss ? 6 + Math.round(mobLevel * 0.6) : (isElite ? 2 : (rng() < 0.25 ? 1 : 0));

    for (let i = 0; i < count; i++) {
      const rarity = pickWeighted(table, rng) + 1;
      const ilvl = Math.max(1, mobLevel + (cfg.boss ? 1 : 0) + (rng() < 0.2 ? 1 : 0));
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
    return { ok: true, xp, leveledUp, level: profile.level, drops, autoSalvaged, dust: dustGain, mobLevel, isBoss: !!cfg.boss };
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
}

module.exports = {
  RpgEngine, SLOTS, SLOT_LABELS, RARITIES, STAT_LABELS, PERCENT_STATS, MOB_TABLE,
  MAX_LEVEL, BAG_SIZE, MAX_PLUS,
  xpForLevel, itemScore, itemStats, describeItem, upgradeCost, salvageValue
};
