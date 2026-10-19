const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const BOSSES_FILE = path.join(__dirname, '..', 'data', 'bosses.json');

function normalizeBossCommand(str) {
  if (!str) return '';
  let s = String(str).trim();
  // Extract the first word in case chatter types '!katıl beni de al'
  s = s.split(/\s+/)[0];
  // Strip trailing punctuation like !, ?, ., ,
  s = s.replace(/[!?.,#]+$/, '');
  // Normalize Turkish characters so both 'i' and 'ı' match, as well as 'ş'->'s', 'ç'->'c', etc.
  s = s.replace(/İ/g, 'i')
       .replace(/I/g, 'i')
       .replace(/ı/g, 'i')
       .replace(/Ş/g, 's')
       .replace(/ş/g, 's')
       .replace(/Ğ/g, 'g')
       .replace(/ğ/g, 'g')
       .replace(/Ü/g, 'u')
       .replace(/ü/g, 'u')
       .replace(/Ö/g, 'o')
       .replace(/ö/g, 'o')
       .replace(/Ç/g, 'c')
       .replace(/ç/g, 'c')
       .toLowerCase();
  if (!s.startsWith('!')) s = '!' + s;
  return s;
}

class BossEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.gachaEngine = options.gachaEngine || null;
    this.kickBot = options.kickBot || null;
    this.db = options.db || null;

    this.bosses = this.loadBosses();
    this.state = 'IDLE'; // IDLE, LOBBY, BATTLE, TACTICAL, VICTORY, DEFEAT
    this.activeBoss = null;
    this.participants = new Map(); // username -> participantData
    this.tacticalActions = new Set(); // usernames who acted during current tactical phase
    this.tacticalPhaseTriggered = false;
    this.lastAttacker = null;

    this.timer = null;
    this.autoIntervalTimer = null;
    this.autoIntervalMinutes = 0; // 0 = disabled

    this.config = {
      autoIntervalMinutes: 0,
      rewardParticipationMultiplier: 1.0,
      soundEnabled: false
    };
  }

  setGachaEngine(gachaEngine) {
    this.gachaEngine = gachaEngine;
  }

  setKickBot(kickBot) {
    this.kickBot = kickBot;
  }

  setDb(db) {
    this.db = db;
    if (this.db) {
      const savedConfig = this.db.getSetting('boss_config');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
        if (this.config.autoIntervalMinutes > 0) {
          this.setAutoInterval(this.config.autoIntervalMinutes);
        }
      }
    }
  }

  loadBosses() {
    try {
      if (fs.existsSync(BOSSES_FILE)) {
        const data = JSON.parse(fs.readFileSync(BOSSES_FILE, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {
      console.warn('[BossEngine] bosses.json okunamadı:', e.message);
    }
    return [];
  }

  getBosses() {
    return this.bosses;
  }

  getState() {
    const participantsList = Array.from(this.participants.values()).sort((a, b) => b.damage - a.damage);
    return {
      state: this.state,
      activeBoss: this.activeBoss,
      participantsCount: this.participants.size,
      participants: participantsList,
      topDamagers: participantsList.slice(0, 5),
      lastAttacker: this.lastAttacker,
      tacticalActionsCount: this.tacticalActions.size,
      config: this.config
    };
  }

  startBoss(bossId = null, customOptions = {}) {
    if (this.state !== 'IDLE' && this.state !== 'VICTORY' && this.state !== 'DEFEAT') {
      return { success: false, error: 'Şu anda zaten aktif bir Boss savaşı devam ediyor!' };
    }

    clearInterval(this.timer);

    let template = null;
    if (bossId) {
      template = this.bosses.find(b => b.id === bossId);
    }
    if (!template) {
      template = this.bosses[Math.floor(Math.random() * this.bosses.length)] || this.bosses[0];
    }

    if (!template) {
      return { success: false, error: 'Kayıtlı boss bulunamadı!' };
    }

    const hp = Math.max(5000, parseInt(customOptions.hp, 10) || template.hp);
    const prepSeconds = Math.max(10, parseInt(customOptions.prepSeconds, 10) || template.prepSeconds || 45);
    const battleSeconds = Math.max(20, parseInt(customOptions.battleSeconds, 10) || template.battleSeconds || 75);

    this.activeBoss = {
      ...template,
      maxHp: hp,
      currentHp: hp,
      prepSeconds: prepSeconds,
      remainingPrepSeconds: prepSeconds,
      battleSeconds: battleSeconds,
      remainingBattleSeconds: battleSeconds,
      tacticalShieldMax: Math.round(hp * 0.15),
      tacticalShieldCurrent: 0,
      tacticalSeconds: 15,
      remainingTacticalSeconds: 15,
      startedAt: Date.now()
    };

    this.participants.clear();
    this.tacticalActions.clear();
    this.tacticalPhaseTriggered = false;
    this.lastAttacker = null;

    this.state = 'LOBBY';
    console.log(`[BossEngine] ⚠️ Boss Savaşı Başladı: ${this.activeBoss.name} (${this.activeBoss.maxHp} HP, ${prepSeconds} sn hazırlık)`);

    // Announce via Kick bot
    if (this.kickBot && this.kickBot.sendMessage) {
      this.kickBot.sendMessage(`🐲 DÜNYA BOSSU BELİRDİ: [${this.activeBoss.name} - ${this.activeBoss.title}]! ⚔️ Katılmak için sohbete !katil veya !katıl yazın! (Hazırlık: ${prepSeconds} sn)`);
    }

    this.emit('state_changed', this.getState());
    this.emit('boss_lobby', { boss: this.activeBoss });

    // Lobby Countdown Timer
    this.timer = setInterval(() => {
      if (this.state !== 'LOBBY') return;
      this.activeBoss.remainingPrepSeconds--;

      this.emit('tick', { state: 'LOBBY', secondsRemaining: this.activeBoss.remainingPrepSeconds, boss: this.activeBoss });

      if (this.activeBoss.remainingPrepSeconds <= 0) {
        clearInterval(this.timer);
        this.beginBattle();
      }
    }, 1000);

    return { success: true, boss: this.activeBoss };
  }

  stopBoss(reason = 'MANUAL_STOP') {
    if (this.state === 'IDLE') return { success: false, error: 'Aktif bir savaş yok.' };

    clearInterval(this.timer);
    clearTimeout(this.resetTimer);
    this.state = 'IDLE';
    this.activeBoss = null;
    this.participants.clear();
    this.tacticalActions.clear();

    console.log(`[BossEngine] ⏹️ Boss savaşı durduruldu (${reason}).`);
    this.emit('state_changed', this.getState());
    return { success: true };
  }

  handleChatMessage(chatMsg) {
    if (!chatMsg || this.state === 'IDLE') return;

    const rawContent = (chatMsg.content || '').trim();
    const username = (chatMsg.sender?.username || '').trim();
    if (!rawContent || !username) return;

    const cmd = normalizeBossCommand(rawContent);

    // 1. LOBBY / PREPARATION OR BATTLE PHASE JOIN: !katil, !katıl, !boss, !join, !raid, !savas, !saldır, !gir
    if (this.state === 'LOBBY' || this.state === 'BATTLE') {
      const JOIN_COMMANDS = new Set([
        '!katil', // matches !katil, !katıl, !KATIL, !Katıl, !katıl!, !katil!
        '!boss',
        '!join',
        '!raid',
        '!savas', // matches !savas, !savaş
        '!saldir', // matches !saldir, !saldır
        '!gir',
        '!vur'
      ]);
      if (JOIN_COMMANDS.has(cmd)) {
        this.joinWarrior(username);
        return;
      }
    }

    // 2. TACTICAL PHASE ACTION: !kalkan, !ulti, !vur, !patlat, !sondur, !shield, !kir, !saldir
    if (this.state === 'TACTICAL') {
      const TACTICAL_COMMANDS = new Set([
        '!kalkan',
        '!ulti',
        '!vur',
        '!patlat',
        '!sondur',
        '!shield',
        '!kir', // matches !kir, !kır
        '!saldir',
        '!attack'
      ]);
      if (TACTICAL_COMMANDS.has(cmd)) {
        this.handleTacticalAction(username);
        return;
      }
    }
  }

  joinWarrior(username) {
    const key = username.toLowerCase();
    // Anti-spam: Each user can only join once!
    if (this.participants.has(key)) {
      return; // Silently ignore duplicate joins
    }

    let bestChar = null;
    let highestRarity = 3;

    // Check Gacha inventory if available
    if (this.gachaEngine) {
      try {
        const user = this.gachaEngine.getUser(username);
        if (user && Array.isArray(user.inventory) && user.inventory.length > 0) {
          const fiveStars = user.inventory.filter(i => i.rarity === 5);
          const fourStars = user.inventory.filter(i => i.rarity === 4);
          if (fiveStars.length > 0) {
            bestChar = fiveStars[Math.floor(Math.random() * fiveStars.length)];
            highestRarity = 5;
          } else if (fourStars.length > 0) {
            bestChar = fourStars[Math.floor(Math.random() * fourStars.length)];
            highestRarity = 4;
          }
        }
      } catch (e) {}
    }

    const warrior = {
      username: username,
      damage: 0,
      hitsCount: 0,
      characterName: bestChar ? bestChar.name : 'Gezgin',
      rarity: highestRarity,
      element: bestChar ? bestChar.element : 'Anemo',
      joinedAt: Date.now()
    };

    this.participants.set(key, warrior);
    console.log(`[BossEngine] ⚔️ ${username} savaşa katıldı! (Karakter: ${warrior.characterName} [${warrior.rarity}★])`);

    this.emit('warrior_joined', { warrior, participantsCount: this.participants.size });
    this.emit('state_changed', this.getState());
  }

  beginBattle() {
    if (!this.activeBoss) return;

    // If nobody joined, spawn 3 helpful NPC travelers so the battle can proceed nicely
    if (this.participants.size === 0) {
      this.joinWarrior('Paimon_NPC');
      this.joinWarrior('Aether_NPC');
      this.joinWarrior('Lumine_NPC');
    }

    this.state = 'BATTLE';
    console.log(`[BossEngine] ⚔️ Savaş Başladı! Katılımcı: ${this.participants.size}`);

    if (this.kickBot && this.kickBot.sendMessage) {
      this.kickBot.sendMessage(`🔥 SAVAŞ BAŞLADI: [${this.activeBoss.name}] saldırıya geçti! ${this.participants.size} savaşçı savaşıyor!`);
    }

    this.emit('state_changed', this.getState());
    this.emit('battle_started', { boss: this.activeBoss });

    let attackCycle = 0;

    // Main Battle Loop (1.2 second tick for active combat feel)
    this.timer = setInterval(() => {
      if (this.state === 'VICTORY' || this.state === 'DEFEAT' || this.state === 'IDLE') {
        clearInterval(this.timer);
        return;
      }

      // Decrement battle timer every second
      this.activeBoss.remainingBattleSeconds = Math.max(0, this.activeBoss.remainingBattleSeconds - 1);
      attackCycle++;

      // Auto-combat strike from all participants
      this.executeAutoCombatRound();

      this.emit('tick', {
        state: this.state,
        secondsRemaining: this.activeBoss.remainingBattleSeconds,
        boss: this.activeBoss
      });

      // Check for Tactical Phase trigger around 50% HP
      if (!this.tacticalPhaseTriggered && this.activeBoss.currentHp <= (this.activeBoss.maxHp * 0.52)) {
        this.triggerTacticalPhase();
      }

      // Check Victory
      if (this.activeBoss.currentHp <= 0) {
        clearInterval(this.timer);
        this.handleVictory();
        return;
      }

      // Check Timeout / Defeat
      if (this.activeBoss.remainingBattleSeconds <= 0 && this.state !== 'VICTORY') {
        clearInterval(this.timer);
        this.handleDefeat();
        return;
      }
    }, 1200);
  }

  executeAutoCombatRound() {
    if (this.state !== 'BATTLE' && this.state !== 'TACTICAL') return;
    if (this.participants.size === 0) return;

    const participantsArray = Array.from(this.participants.values());
    // Pick 2-4 attackers per tick so screen isn't overwhelmed but stays very lively
    const attackersCount = Math.min(participantsArray.length, Math.max(1, Math.floor(participantsArray.length * 0.6) + 1));
    const shuffled = [...participantsArray].sort(() => 0.5 - Math.random()).slice(0, attackersCount);

    shuffled.forEach(warrior => {
      if (this.activeBoss.currentHp <= 0) return;

      // Base damage: 140 - 280
      let baseDmg = Math.floor(Math.random() * 140 + 140);

      // Bonuses
      if (warrior.rarity === 5) baseDmg = Math.round(baseDmg * 1.5);
      else if (warrior.rarity === 4) baseDmg = Math.round(baseDmg * 1.25);

      // Critical Hit Check
      const critChance = warrior.rarity === 5 ? 0.35 : 0.20;
      const isCrit = Math.random() < critChance;
      if (isCrit) {
        baseDmg = Math.round(baseDmg * (Math.random() * 0.4 + 1.8)); // 1.8x - 2.2x
      }

      // Elemental Reaction (Vaporize, Melt, Overload)
      const reactions = ['MELT', 'VAPORIZE', 'OVERLOAD', 'SWIRL', null, null];
      const reaction = reactions[Math.floor(Math.random() * reactions.length)];
      if (reaction) {
        baseDmg = Math.round(baseDmg * 1.4);
      }

      // Deal damage to Boss
      this.activeBoss.currentHp = Math.max(0, this.activeBoss.currentHp - baseDmg);
      warrior.damage += baseDmg;
      warrior.hitsCount++;
      this.lastAttacker = warrior.username;

      // Emit attack event for Floating Combat Text on OBS overlay
      this.emit('boss_attack', {
        attacker: warrior.username,
        damage: baseDmg,
        isCrit,
        reaction,
        element: warrior.element || 'Physical',
        bossRemainingHp: this.activeBoss.currentHp,
        bossMaxHp: this.activeBoss.maxHp
      });
    });
  }

  triggerTacticalPhase() {
    this.tacticalPhaseTriggered = true;
    this.state = 'TACTICAL';
    this.tacticalActions.clear();

    const shieldAmount = this.activeBoss.tacticalShieldMax || Math.round(this.activeBoss.maxHp * 0.15);
    this.activeBoss.tacticalShieldCurrent = shieldAmount;
    this.activeBoss.remainingTacticalSeconds = 15;

    console.log(`[BossEngine] ⚡ Taktiksel Kalkan Fazı Başladı! Kalkan: ${shieldAmount}`);

    if (this.kickBot && this.kickBot.sendMessage) {
      this.kickBot.sendMessage(`⚡ DİKKAT: ${this.activeBoss.name} [${this.activeBoss.tacticalSkill || 'Kalkan'}] açtı! Kırmak için sohbete !kalkan veya !ulti yazın! (15 sn)`);
    }

    this.emit('tactical_phase_started', {
      boss: this.activeBoss,
      skillName: this.activeBoss.tacticalSkill,
      shieldHp: shieldAmount
    });
    this.emit('state_changed', this.getState());

    // Tactical Phase Countdown
    const tacticalInterval = setInterval(() => {
      if (this.state !== 'TACTICAL') {
        clearInterval(tacticalInterval);
        return;
      }

      this.activeBoss.remainingTacticalSeconds--;

      this.emit('tick', {
        state: 'TACTICAL',
        secondsRemaining: this.activeBoss.remainingTacticalSeconds,
        boss: this.activeBoss
      });

      // Shield broken check
      if (this.activeBoss.tacticalShieldCurrent <= 0) {
        clearInterval(tacticalInterval);
        this.tacticalSuccess();
        return;
      }

      // Timeout check
      if (this.activeBoss.remainingTacticalSeconds <= 0) {
        clearInterval(tacticalInterval);
        this.tacticalFail();
        return;
      }
    }, 1000);
  }

  handleTacticalAction(username) {
    const key = username.toLowerCase();
    if (this.tacticalActions.has(key)) return; // 1 attempt per chatter!

    this.tacticalActions.add(key);

    // Each chatter's tactical action deals a chunk of shield damage
    const shieldDmg = Math.round(this.activeBoss.tacticalShieldMax / Math.max(3, Math.min(8, this.participants.size)));
    this.activeBoss.tacticalShieldCurrent = Math.max(0, this.activeBoss.tacticalShieldCurrent - shieldDmg);

    // Award bonus damage to the warrior
    const warrior = this.participants.get(key);
    if (warrior) {
      warrior.damage += Math.round(shieldDmg * 1.5);
    }

    this.emit('tactical_hit', {
      username,
      shieldDamage: shieldDmg,
      shieldRemaining: this.activeBoss.tacticalShieldCurrent,
      shieldMax: this.activeBoss.tacticalShieldMax
    });

    if (this.activeBoss.tacticalShieldCurrent <= 0) {
      this.tacticalSuccess();
    }
  }

  tacticalSuccess() {
    this.state = 'BATTLE';
    console.log('[BossEngine] 💥 Kalkan Kırıldı! Boss Sersemledi (STUNNED)!');

    // Massive stun hit
    const stunBonusDmg = Math.round(this.activeBoss.maxHp * 0.08);
    this.activeBoss.currentHp = Math.max(0, this.activeBoss.currentHp - stunBonusDmg);

    if (this.kickBot && this.kickBot.sendMessage) {
      this.kickBot.sendMessage(`💥 KALKAN KIRILDI! ${this.activeBoss.name} sersemledi ve ağır hasar aldı! Vurmaya devam!`);
    }

    this.emit('tactical_success', {
      boss: this.activeBoss,
      bonusDamage: stunBonusDmg
    });
    this.emit('state_changed', this.getState());
  }

  tacticalFail() {
    this.state = 'BATTLE';
    console.log('[BossEngine] ⚠️ Kalkan kırılamadı! Boss şok dalgası saldı.');

    this.emit('tactical_fail', { boss: this.activeBoss });
    this.emit('state_changed', this.getState());
  }

  handleVictory() {
    this.state = 'VICTORY';
    clearInterval(this.timer);

    const sortedWarriors = Array.from(this.participants.values()).sort((a, b) => b.damage - a.damage);
    const mvp = sortedWarriors[0] || null;
    const lastHit = this.lastAttacker ? sortedWarriors.find(w => w.username.toLowerCase() === this.lastAttacker.toLowerCase()) || null : null;

    const baseReward = Math.round((this.activeBoss.rewardParticipation || 60) * (this.config.rewardParticipationMultiplier || 1.0));
    const mvpReward = Math.round((this.activeBoss.rewardMvp || 160) * (this.config.rewardParticipationMultiplier || 1.0));
    const lastHitReward = Math.round((this.activeBoss.rewardLastHit || 100) * (this.config.rewardParticipationMultiplier || 1.0));

    // Award Primogems to all participants
    if (this.gachaEngine) {
      sortedWarriors.forEach(w => {
        let reward = baseReward;
        if (mvp && w.username === mvp.username) reward += mvpReward;
        if (lastHit && w.username === lastHit.username) reward += lastHitReward;
        try {
          this.gachaEngine.addPrimogems(w.username, reward);
        } catch (e) {}
      });
    }

    console.log(`[BossEngine] 🎉 ZAFER! ${this.activeBoss.name} devrildi! MVP: ${mvp?.username} (${mvp?.damage} Hasar)`);

    // Announce to Kick chat
    if (this.kickBot && this.kickBot.sendMessage) {
      const mvpText = mvp ? `🌟 MVP: @${mvp.username} (${mvp.damage.toLocaleString()} hasar / +${baseReward + mvpReward} Primo)` : '';
      const lastHitText = lastHit ? `👑 Son Vuruş: @${lastHit.username}` : '';
      this.kickBot.sendMessage(`🎉 ZAFER! ${this.activeBoss.name} hezimete uğradı! ${mvpText} | ${lastHitText} | Katılan herkese +${baseReward} Primogem dağıtıldı!`);
    }

    const victoryData = {
      boss: this.activeBoss,
      mvp,
      lastHit,
      top3: sortedWarriors.slice(0, 3),
      participantsCount: sortedWarriors.length,
      rewards: {
        participation: baseReward,
        mvp: mvpReward,
        lastHit: lastHitReward
      }
    };

    this.emit('boss_victory', victoryData);
    this.emit('state_changed', this.getState());

    // Auto return to IDLE after 20 seconds
    this.resetTimer = setTimeout(() => {
      if (this.state === 'VICTORY') {
        this.state = 'IDLE';
        this.activeBoss = null;
        this.participants.clear();
        this.emit('state_changed', this.getState());
      }
    }, 20000);
  }

  handleDefeat() {
    this.state = 'DEFEAT';
    clearInterval(this.timer);

    console.log(`[BossEngine] 💀 SÜRE DOLDU! ${this.activeBoss.name} kaçtı.`);

    // Give small consolation reward
    if (this.gachaEngine) {
      this.participants.forEach(w => {
        try {
          this.gachaEngine.addPrimogems(w.username, 25);
        } catch (e) {}
      });
    }

    if (this.kickBot && this.kickBot.sendMessage) {
      this.kickBot.sendMessage(`💀 SÜRE DOLDU! ${this.activeBoss.name} güçlü darbelerle kaçmayı başardı. Cesur savaşçılara +25 Primogem teselli ödülü verildi.`);
    }

    this.emit('boss_defeat', { boss: this.activeBoss });
    this.emit('state_changed', this.getState());

    this.resetTimer = setTimeout(() => {
      if (this.state === 'DEFEAT') {
        this.state = 'IDLE';
        this.activeBoss = null;
        this.participants.clear();
        this.emit('state_changed', this.getState());
      }
    }, 15000);
  }

  simulateTestFight(bossId = null) {
    // Starts an accelerated 15-second simulation with 6 bot warriors for testing
    this.stopBoss('SIMULATION_START');

    const result = this.startBoss(bossId, { hp: 12000, prepSeconds: 5, battleSeconds: 15 });
    if (!result.success) return result;

    const testUsers = ['Lumine_Pro', 'Aether_Gamer', 'Zhongli_Shield', 'Raiden_Shogun', 'HuTao_Crit', 'Klee_Boom'];
    testUsers.forEach(u => this.joinWarrior(u));

    console.log('[BossEngine] 🧪 Test Simülasyonu başlatıldı (6 Test Savaşçısı, 12,000 HP).');
    return { success: true, message: 'Test savaşı simülasyonu başlatıldı!' };
  }

  setAutoInterval(minutes) {
    clearInterval(this.autoIntervalTimer);
    this.autoIntervalMinutes = parseInt(minutes, 10) || 0;
    this.config.autoIntervalMinutes = this.autoIntervalMinutes;

    if (this.db) {
      try {
        this.db.setSetting('boss_config', this.config);
      } catch (e) {}
    }

    if (this.autoIntervalMinutes > 0) {
      console.log(`[BossEngine] ⏱️ Otomatik Boss döngüsü kuruldu: Her ${this.autoIntervalMinutes} dakikada bir.`);
      this.autoIntervalTimer = setInterval(() => {
        if (this.state === 'IDLE') {
          console.log('[BossEngine] ⏰ Otomatik zamanlayıcı Boss savaşını tetikliyor...');
          this.startBoss();
        }
      }, this.autoIntervalMinutes * 60 * 1000);
    } else {
      console.log('[BossEngine] ⏱️ Otomatik Boss döngüsü kapatıldı.');
    }
  }

  saveConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.autoIntervalMinutes !== undefined) {
      this.setAutoInterval(newConfig.autoIntervalMinutes);
    }
    if (this.db) {
      try {
        this.db.setSetting('boss_config', this.config);
      } catch (e) {}
    }
    this.emit('config_updated', this.config);
    return this.config;
  }
}

module.exports = { BossEngine };
