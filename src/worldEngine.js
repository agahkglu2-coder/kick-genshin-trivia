const EventEmitter = require('events');

/**
 * DungeonInstance - Server-Authoritative Aion 2 Instance Dungeon Session
 * Manages synchronized mobs, HP, Boss phases, and stage barriers for a party or solo player.
 */
class DungeonInstance {
  constructor(instanceId, tierId, partyId = null) {
    this.id = instanceId;
    this.tierId = tierId;
    this.partyId = partyId;
    this.stage = 1;
    this.stage1Cleared = false;
    this.stage2Cleared = false;
    this.bossDefeated = false;
    this.phase2Triggered = false;
    this.phase2ShieldActive = false;
    this.phase3Triggered = false;
    this.phase3SafeZoneActive = false;
    this.score = 0;
    this.startTime = Date.now();
    this.mobs = new Map();
    this.chestsClaimed = new Map(); // chestId -> Set(username)
    this.spawnInitialMobs();
  }

  spawnInitialMobs() {
    const isTier3 = this.tierId === 'dungeon_tier_3';
    const isTier2 = this.tierId === 'dungeon_tier_2';
    const hpMult = isTier3 ? 1.45 : (isTier2 ? 1.2 : 1.0);
    const dmgMult = isTier3 ? 1.35 : (isTier2 ? 1.15 : 1.0);

    // STAGE 1: 2 Aether Crystals (210 HP) + 4 Guardians (240 HP)
    this.addMob({ id: 'm_c1', type: 'aether_crystal', x: -8, z: -44, hp: Math.round(210 * hpMult), maxHP: Math.round(210 * hpMult), stage: 1, isCrystal: true });
    this.addMob({ id: 'm_c2', type: 'aether_crystal', x: 8, z: -44, hp: Math.round(210 * hpMult), maxHP: Math.round(210 * hpMult), stage: 1, isCrystal: true });
    this.addMob({ id: 'm_g1', type: 'aether_guardian', x: -12, z: -50, hp: Math.round(240 * hpMult), maxHP: Math.round(240 * hpMult), stage: 1 });
    this.addMob({ id: 'm_g2', type: 'aether_guardian', x: 12, z: -50, hp: Math.round(240 * hpMult), maxHP: Math.round(240 * hpMult), stage: 1 });
    this.addMob({ id: 'm_g3', type: 'aether_guardian', x: -6, z: -36, hp: Math.round(240 * hpMult), maxHP: Math.round(240 * hpMult), stage: 1 });
    this.addMob({ id: 'm_g4', type: 'aether_guardian', x: 6, z: -36, hp: Math.round(240 * hpMult), maxHP: Math.round(240 * hpMult), stage: 1 });

    // STAGE 2: 1 Archon Mini-Boss (1050 HP) + 2 Void Mages (480 HP)
    this.addMob({ id: 'm_archon', type: 'abyss_archon_mini', x: 0, z: 8, hp: Math.round(1050 * hpMult), maxHP: Math.round(1050 * hpMult), stage: 2, isElite: true });
    this.addMob({ id: 'm_mage1', type: 'abyss_mage', x: -10, z: 10, hp: Math.round(480 * hpMult), maxHP: Math.round(480 * hpMult), stage: 2, isRanged: true });
    this.addMob({ id: 'm_mage2', type: 'abyss_mage', x: 10, z: 10, hp: Math.round(480 * hpMult), maxHP: Math.round(480 * hpMult), stage: 2, isRanged: true });

    // STAGE 3: Tahabata Final Boss (3100 HP)
    this.addMob({ id: 'm_boss', type: 'tahabata_lord', x: 0, z: 58, hp: Math.round(3100 * hpMult), maxHP: Math.round(3100 * hpMult), stage: 3, isBoss: true });
  }

  addMob(mobData) {
    this.mobs.set(mobData.id, {
      ...mobData,
      isDead: false,
      elementalAura: null
    });
  }

  getMobList() {
    return Array.from(this.mobs.values()).map(m => ({
      id: m.id,
      type: m.type,
      x: m.x,
      z: m.z,
      hp: m.hp,
      maxHP: m.maxHP,
      stage: m.stage,
      isCrystal: !!m.isCrystal,
      isResonanceCrystal: !!m.isResonanceCrystal,
      isElite: !!m.isElite,
      isBoss: !!m.isBoss,
      isRanged: !!m.isRanged,
      isDead: m.isDead
    }));
  }

  applyHit(mobId, dmg, attackerName, isCrit = false, element = null) {
    const mob = this.mobs.get(mobId);
    if (!mob || mob.isDead) return null;

    let finalDmg = Math.max(1, parseInt(dmg, 10) || 1);
    // Boss Phase 2 Aether Shield (-90% damage)
    if (mob.isBoss && this.phase2ShieldActive) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.1));
    }

    mob.hp = Math.max(0, mob.hp - finalDmg);
    if (mob.hp <= 0) {
      mob.isDead = true;
    }

    const events = [];

    // Boss Phase 2 Check (60% HP)
    if (mob.isBoss && !this.phase2Triggered && (mob.hp / mob.maxHP) <= 0.60) {
      this.phase2Triggered = true;
      this.phase2ShieldActive = true;
      const isTier3 = this.tierId === 'dungeon_tier_3';
      const isTier2 = this.tierId === 'dungeon_tier_2';
      const hpMult = isTier3 ? 1.45 : (isTier2 ? 1.2 : 1.0);
      const resCrystals = [
        { id: 'm_res_1', type: 'resonance_crystal', x: -10, z: 53, hp: Math.round(180 * hpMult), maxHP: Math.round(180 * hpMult), stage: 3, isResonanceCrystal: true },
        { id: 'm_res_2', type: 'resonance_crystal', x: 10, z: 53, hp: Math.round(180 * hpMult), maxHP: Math.round(180 * hpMult), stage: 3, isResonanceCrystal: true },
        { id: 'm_res_3', type: 'resonance_crystal', x: 0, z: 66, hp: Math.round(180 * hpMult), maxHP: Math.round(180 * hpMult), stage: 3, isResonanceCrystal: true }
      ];
      for (const rc of resCrystals) {
        this.addMob(rc);
      }
      events.push({ type: 'BOSS_PHASE_2', newMobs: resCrystals });
    }

    // Resonance Crystal Shatter Check
    if (mob.isResonanceCrystal && mob.isDead && this.phase2ShieldActive) {
      const remaining = Array.from(this.mobs.values()).filter(m => m.isResonanceCrystal && !m.isDead);
      if (remaining.length === 0) {
        this.phase2ShieldActive = false;
        this.score += 600;
        events.push({ type: 'SHIELD_DOWN' });
      }
    }

    // Boss Phase 3 Check (25% HP)
    if (mob.isBoss && !this.phase3Triggered && (mob.hp / mob.maxHP) <= 0.25) {
      this.phase3Triggered = true;
      this.phase3SafeZoneActive = true;
      events.push({ type: 'BOSS_PHASE_3', safeZone: { x: 0, z: 58, radius: 4.5 } });
    }

    // Score on kill
    if (mob.isDead) {
      if (mob.isCrystal) this.score += 150;
      else if (mob.isResonanceCrystal) this.score += 200;
      else if (mob.isElite) this.score += 400;
      else if (mob.isBoss) this.score += 1000;
      else this.score += 80;
    }

    // Stage 1 Clear Check (Crystals & Guardians)
    if (!this.stage1Cleared) {
      const s1Left = Array.from(this.mobs.values()).filter(m => m.stage === 1 && !m.isDead);
      if (s1Left.length === 0) {
        this.stage1Cleared = true;
        this.stage = 2;
        events.push({ type: 'STAGE_CLEAR', stage: 1 });
      }
    }

    // Stage 2 Clear Check (Archon Mini-Boss)
    if (this.stage1Cleared && !this.stage2Cleared) {
      const s2Left = Array.from(this.mobs.values()).filter(m => m.stage === 2 && m.type === 'abyss_archon_mini' && !m.isDead);
      if (s2Left.length === 0) {
        this.stage2Cleared = true;
        this.stage = 3;
        events.push({ type: 'STAGE_CLEAR', stage: 2 });
      }
    }

    // Boss Defeat Check
    if (mob.isBoss && mob.isDead && !this.bossDefeated) {
      this.bossDefeated = true;
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      let rank = 'C';
      if (this.score >= 2400 && elapsed <= 160) rank = 'S';
      else if (this.score >= 1800 && elapsed <= 240) rank = 'A';
      else if (this.score >= 1200 && elapsed <= 320) rank = 'B';
      events.push({ type: 'VICTORY', rank, elapsed, score: this.score });
    }

    return {
      mob,
      dmg: finalDmg,
      newHp: mob.hp,
      maxHp: mob.maxHP,
      isDead: mob.isDead,
      isCrit,
      element,
      attackerName,
      events
    };
  }

  claimChest(chestId, username) {
    if (!this.chestsClaimed.has(chestId)) {
      this.chestsClaimed.set(chestId, new Set());
    }
    const claimedUsers = this.chestsClaimed.get(chestId);
    if (claimedUsers.has(username.toLowerCase())) {
      return { ok: false, alreadyClaimed: true };
    }
    claimedUsers.add(username.toLowerCase());
    return { ok: true, chestId, username };
  }
}

/**
 * WorldEngine - 3D Pixel MMO Multi-Zone World Coordinator
 * Manages player positions, building transitions, chat bubbles, parties and Kick auth PINs.
 */
class WorldEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.gachaEngine = options.gachaEngine || null;
    this.tradeEngine = options.tradeEngine || null;
    this.rpgEngine = options.rpgEngine || null;

    this.players = new Map(); // socketId -> Player
    this.pendingPins = new Map(); // pinCode -> { socketId, username, expiresAt }
    this.userSockets = new Map(); // username.toLowerCase() -> socketId

    // 🛡️ Party & Instance Management
    this.parties = new Map(); // partyId -> { id, leaderId, members: [socketId], createdAt }
    this.playerParties = new Map(); // socketId -> partyId
    this.pendingPartyInvites = new Map(); // inviteId -> { id, partyId, leaderId, leaderName, targetSocketId, targetName, expiresAt }
    this.pendingReadyChecks = new Map(); // readyCheckId -> { id, partyId, tierId, votes: Map(socketId -> bool), expiresAt, timer }
    this.instances = new Map(); // instanceId -> DungeonInstance

    // Map definition & building entrance definitions
    this.maps = {
      town: {
        id: 'town',
        name: 'Teyvat Kasaba Meydanı',
        bounds: { minX: -45, maxX: 45, minZ: -45, maxZ: 45 },
        doors: [
          {
            id: 'door_trade',
            name: 'Pazar & Takas Binası',
            pos: { x: -24, z: -10 },
            radius: 3.8,
            targetMap: 'trade_house',
            spawnPos: { x: 0, z: 6 }
          },
          {
            id: 'door_tavern',
            name: "Cat's Tail Taverna",
            pos: { x: 24, z: -10 },
            radius: 3.8,
            targetMap: 'tavern',
            spawnPos: { x: 0, z: 6 }
          },
          {
            id: 'door_shrine',
            name: 'Kader & Dilek Tapınağı',
            pos: { x: 0, z: -26 },
            radius: 4.2,
            targetMap: 'shrine',
            spawnPos: { x: 0, z: 6 }
          },
          {
            id: 'door_guild',
            name: 'Maceracılar Loncası',
            pos: { x: -24, z: 10 },
            radius: 3.8,
            targetMap: 'guild',
            spawnPos: { x: 0, z: 6 }
          },
          {
            id: 'door_battle',
            name: '⚔️ Vahşi Savaş Arenası',
            pos: { x: 0, z: 32 },
            radius: 4.2,
            targetMap: 'battle_zone',
            spawnPos: { x: 0, z: -28 }
          }
        ]
      },
      trade_house: {
        id: 'trade_house',
        name: 'Büyük Takas Pazarı',
        bounds: { minX: -16, maxX: 16, minZ: -12, maxZ: 12 },
        exitDoor: { pos: { x: 0, z: 9.5 }, radius: 2.8, targetMap: 'town', spawnPos: { x: -24, z: -6.5 } }
      },
      tavern: {
        id: 'tavern',
        name: "Cat's Tail Taverna",
        bounds: { minX: -16, maxX: 16, minZ: -12, maxZ: 12 },
        exitDoor: { pos: { x: 0, z: 9.5 }, radius: 2.8, targetMap: 'town', spawnPos: { x: 24, z: -6.5 } }
      },
      shrine: {
        id: 'shrine',
        name: 'Dilek Tapınağı',
        bounds: { minX: -17, maxX: 17, minZ: -14, maxZ: 14 },
        exitDoor: { pos: { x: 0, z: 9.5 }, radius: 2.8, targetMap: 'town', spawnPos: { x: 0, z: -22 } }
      },
      guild: {
        id: 'guild',
        name: 'Maceracılar Loncası',
        bounds: { minX: -16, maxX: 16, minZ: -12, maxZ: 12 },
        exitDoor: { pos: { x: 0, z: 9.5 }, radius: 2.8, targetMap: 'town', spawnPos: { x: -24, z: 6.5 } }
      },
      battle_zone: {
        id: 'battle_zone',
        name: 'Zümrüt Çayırları (Slime Vadisi)',
        reqGS: 100,
        bounds: { minX: -42, maxX: 42, minZ: -42, maxZ: 42 },
        exitDoor: { pos: { x: 0, z: -32 }, radius: 3.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      battle_zone_1: {
        id: 'battle_zone_1',
        name: 'Kadim Sarmaşıklı Orman',
        reqGS: 100,
        bounds: { minX: -42, maxX: 42, minZ: -42, maxZ: 42 },
        exitDoor: { pos: { x: 0, z: -32 }, radius: 3.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      battle_zone_2: {
        id: 'battle_zone_2',
        name: 'Kızıl Lav Harabeleri',
        reqGS: 350,
        bounds: { minX: -42, maxX: 42, minZ: -42, maxZ: 42 },
        exitDoor: { pos: { x: 0, z: -32 }, radius: 3.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      battle_zone_3: {
        id: 'battle_zone_3',
        name: 'Kadim Uçurum Boşluğu',
        reqGS: 750,
        bounds: { minX: -42, maxX: 42, minZ: -42, maxZ: 42 },
        exitDoor: { pos: { x: 0, z: -32 }, radius: 3.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      dungeon_tier_1: {
        id: 'dungeon_tier_1',
        name: 'Mühürlü Aether Tapınağı (Normal)',
        reqGS: 150,
        isDungeon: true,
        bounds: { minX: -32, maxX: 32, minZ: -72, maxZ: 82 },
        spawn: { x: 0, z: -60 },
        exitDoor: { pos: { x: 0, z: -66 }, radius: 4.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      dungeon_tier_2: {
        id: 'dungeon_tier_2',
        name: 'Kızıl Aether Kalesi (Kahraman)',
        reqGS: 450,
        isDungeon: true,
        bounds: { minX: -32, maxX: 32, minZ: -72, maxZ: 82 },
        spawn: { x: 0, z: -60 },
        exitDoor: { pos: { x: 0, z: -66 }, radius: 4.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      },
      dungeon_tier_3: {
        id: 'dungeon_tier_3',
        name: "Tahabata'nın Uçurum Kalbi (Abyss)",
        reqGS: 800,
        isDungeon: true,
        bounds: { minX: -32, maxX: 32, minZ: -72, maxZ: 82 },
        spawn: { x: 0, z: -60 },
        exitDoor: { pos: { x: 0, z: -66 }, radius: 4.5, targetMap: 'town', spawnPos: { x: 0, z: 28 } }
      }
    };

    // Auto cleanup expired pins every minute
    setInterval(() => this.cleanupExpiredPins(), 60000);
  }

  setEngines(gachaEngine, tradeEngine, rpgEngine) {
    this.gachaEngine = gachaEngine;
    this.tradeEngine = tradeEngine;
    if (rpgEngine) this.rpgEngine = rpgEngine;
  }

  /**
   * Register a new player or guest into the world
   */
  addPlayer(socketId, { username = '', avatarIndex = 0, isGuest = true, profilePic = '' }) {
    let cleanName = (username || '').trim().replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, '');
    if (!cleanName) {
      cleanName = 'Gezgin_' + Math.floor(1000 + Math.random() * 9000);
    }

    let primogems = 160;
    let fiveStarsCount = 0;
    let activeCompanion = null;
    if (this.gachaEngine) {
      const u = this.gachaEngine.getOrCreateUser(cleanName);
      primogems = u.primogems || 0;
      fiveStarsCount = u.fiveStarsCount || 0;
      if (u.activeCompanion) {
        const owned5 = this.getUser5Stars(cleanName);
        if (owned5.some(c => c.name.toLowerCase() === u.activeCompanion.toLowerCase())) {
          activeCompanion = u.activeCompanion;
        } else {
          u.activeCompanion = null;
          this.gachaEngine.saveUsers();
        }
      }
    }

    const player = {
      id: socketId,
      username: cleanName,
      isGuest: Boolean(isGuest),
      avatarIndex: Math.abs(parseInt(avatarIndex, 10) || 0) % 20,
      profilePic: profilePic || '',
      x: (Math.random() - 0.5) * 8,
      y: 0,
      z: 2 + Math.random() * 6,
      rot: 0,
      anim: 'idle',
      mapId: 'town',
      companion: activeCompanion, // 🐾 5★ Active Flying Companion
      primogems,
      fiveStarsCount,
      speechBubble: null,
      joinedAt: Date.now(),
      lastActive: Date.now()
    };

    this.players.set(socketId, player);
    this.userSockets.set(cleanName.toLowerCase(), socketId);

    console.log(`[WorldEngine] 🌍 Yeni oyuncu şehre girdi: @${cleanName} (${isGuest ? 'Misafir' : 'Kick'}) [${socketId}]`);

    this.emit('player_joined', player);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    // Remove from party if present
    const partyRes = this.leaveParty(socketId);

    this.players.delete(socketId);
    this.userSockets.delete(player.username.toLowerCase());

    // Clean active trades if any
    if (this.tradeEngine) {
      this.tradeEngine.handlePlayerDisconnect(player.username);
    }

    console.log(`[WorldEngine] 🚪 Oyuncu ayrıldı: @${player.username}`);
    this.emit('player_left', { socketId, username: player.username, mapId: player.mapId, partyRes });
    return player;
  }

  getMapConfig(mapId) {
    if (this.maps[mapId]) return this.maps[mapId];
    if (mapId && mapId.startsWith('dungeon_tier_')) {
      const baseTier = mapId.split('_inst_')[0];
      return this.maps[baseTier] || this.maps.dungeon_tier_1;
    }
    return this.maps.town;
  }

  getPlayer(socketId) {
    return this.players.get(socketId) || null;
  }

  getPlayerByName(username) {
    if (!username) return null;
    const socketId = this.userSockets.get(username.toLowerCase());
    return socketId ? this.getPlayer(socketId) : null;
  }

  /**
   * Get all unlocked 5-star characters strictly owned by user.
   * No 4-star characters, and strictly NO demo/starter characters!
   */
  getUser5Stars(username) {
    if (!this.gachaEngine) return [];
    const clean = (username || '').trim().replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, '');
    const u = this.gachaEngine.getOrCreateUser(clean);
    const userInventory = Array.isArray(u.inventory) ? u.inventory : [];
    const fiveStarsMap = new Map();

    for (const item of userInventory) {
      if (item && item.type === 'character') {
        const rarityNum = parseInt(item.rarity, 10);
        if (rarityNum === 5) {
          const charName = item.name;
          if (!fiveStarsMap.has(charName)) {
            const meta = (this.gachaEngine.characters || []).find(
              c => c.name.toLowerCase() === charName.toLowerCase() || (c.slug && c.slug.toLowerCase() === charName.toLowerCase())
            );
            fiveStarsMap.set(charName, {
              name: charName,
              rarity: 5,
              element: meta ? meta.element : (item.element || 'Electro'),
              weaponType: meta ? meta.weaponType : (item.weaponType || 'Sword'),
              region: meta ? meta.region : (item.region || 'Teyvat'),
              title: meta ? meta.title : '',
              icon: meta ? (meta.remoteIcon || meta.icon) : (item.remoteIcon || item.icon || ''),
              splashArt: meta ? (meta.splashArt || meta.splashArtDev) : '',
              isOwned: true
            });
          }
        }
      }
    }

    const list = Array.from(fiveStarsMap.values());
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  /**
   * Alias for backward compatibility
   */
  getUserCompanions(username) {
    return this.getUser5Stars(username);
  }

  /**
   * Set player active 5-star companion. Strictly requires ownership.
   */
  selectCompanion(socketId, companionName) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, message: 'Oyuncu bulunamadı' };

    if (!companionName || companionName === 'none') {
      player.companion = null;
      if (this.gachaEngine) {
        const u = this.gachaEngine.getOrCreateUser(player.username);
        u.activeCompanion = null;
        this.gachaEngine.saveUsers();
      }
      return { success: true, companion: null, username: player.username };
    }

    const user5Stars = this.getUser5Stars(player.username);
    const matched = user5Stars.find(c => c.name.toLowerCase() === companionName.toLowerCase());

    if (!matched) {
      return { success: false, message: 'Bu 5★ karaktere sahip değilsin. Yalnızca dilek havuzundan çıkardığın 5★ karakterleri yoldaş olarak kuşanabilirsin!' };
    }

    player.companion = matched.name;
    if (this.gachaEngine) {
      const u = this.gachaEngine.getOrCreateUser(player.username);
      u.activeCompanion = matched.name;
      this.gachaEngine.saveUsers();
    }

    console.log(`[WorldEngine] 🐾 @${player.username} 5★ yoldaş seçti: ${matched.name} (${matched.element})`);
    return {
      success: true,
      companion: matched.name,
      companionData: matched,
      username: player.username
    };
  }

  /**
   * Handle position & rotation update from client
   */
  updateMovement(socketId, { x, y, z, rot, anim }) {
    const player = this.players.get(socketId);
    if (!player) return null;

    const map = this.getMapConfig(player.mapId);
    const b = map.bounds || { minX: -45, maxX: 45, minZ: -72, maxZ: 82 };

    // Boundary clamp
    player.x = Math.max(b.minX, Math.min(b.maxX, typeof x === 'number' ? x : player.x));
    player.y = typeof y === 'number' ? Math.max(0, y) : player.y;
    player.z = Math.max(b.minZ, Math.min(b.maxZ, typeof z === 'number' ? z : player.z));
    player.rot = typeof rot === 'number' ? rot : player.rot;
    player.anim = anim || 'idle';
    player.lastActive = Date.now();

    return player;
  }

  /**
   * Door interaction: Enter building or Exit back to town
   */
  interactDoor(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    const curMap = this.getMapConfig(player.mapId);
    if (!curMap) return null;

    // Check outdoor doors
    if (player.mapId === 'town' && Array.isArray(curMap.doors)) {
      for (const door of curMap.doors) {
        const dx = player.x - door.pos.x;
        const dz = player.z - door.pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= door.radius) {
          // Transition to building
          const oldMap = player.mapId;
          player.mapId = door.targetMap;
          player.x = door.spawnPos.x;
          player.y = 0;
          player.z = door.spawnPos.z;
          player.rot = 0;
          player.anim = 'idle';

          console.log(`[WorldEngine] 🚪 @${player.username} ${door.name} binasına girdi.`);
          this.emit('player_changed_map', { player, oldMap, newMap: player.mapId, doorName: door.name });
          return { success: true, player, doorName: door.name, newMap: player.mapId, spawnPos: door.spawnPos };
        }
      }
    }

    // Check Dungeon exits: Entrance portal at z: -66 OR Victory portal at z: 72
    const isDungeon = (player.mapId && player.mapId.startsWith('dungeon_')) || Boolean(curMap.isDungeon);
    if (isDungeon) {
      const distEntrance = Math.hypot(player.x - 0, player.z - (-66));
      const distBossAltar = Math.hypot(player.x - 0, player.z - 72);
      if (distEntrance <= 7.5 || distBossAltar <= 7.5 || player.z <= -55 || player.z >= 66) {
        const oldMap = player.mapId;
        player.mapId = 'town';
        player.x = 0;
        player.y = 0;
        player.z = 28;
        player.rot = Math.PI;
        player.anim = 'idle';

        console.log(`[WorldEngine] 🚪 @${player.username} zindandan kasaba meydanına geri döndü.`);
        this.emit('player_changed_map', { player, oldMap, newMap: 'town', doorName: 'Kasaba Meydanı' });
        return { success: true, player, doorName: 'Kasaba Meydanı', newMap: 'town', spawnPos: { x: 0, z: 28 } };
      }
    }

    // Check indoor / battle zone exit door
    if (player.mapId !== 'town' && curMap.exitDoor) {
      const exit = curMap.exitDoor;
      const dx = player.x - exit.pos.x;
      const dz = player.z - exit.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= (exit.radius || 4.5)) {
        const oldMap = player.mapId;
        player.mapId = exit.targetMap;
        player.x = exit.spawnPos.x;
        player.y = 0;
        player.z = exit.spawnPos.z;
        player.rot = Math.PI;
        player.anim = 'idle';

        console.log(`[WorldEngine] 🚪 @${player.username} kasaba meydanına geri çıktı.`);
        this.emit('player_changed_map', { player, oldMap, newMap: player.mapId, doorName: 'Kasaba Meydanı' });
        return { success: true, player, doorName: 'Kasaba Meydanı', newMap: player.mapId, spawnPos: exit.spawnPos };
      }
    }

    return { success: false, error: 'Yakında girilebilecek bir kapı yok.' };
  }

  switchZone(socketId, targetMap) {
    const player = this.players.get(socketId);
    if (!player) return { success: false, error: 'Geçersiz oyuncu.' };
    const mapCfg = this.getMapConfig(targetMap);
    if (!mapCfg) return { success: false, error: 'Geçersiz bölge.' };
    const oldMap = player.mapId;
    const isDungeon = Boolean(mapCfg.isDungeon || targetMap.startsWith('dungeon_tier_'));
    const spawnZ = isDungeon ? -60 : -28;
    player.mapId = targetMap;
    player.x = 0;
    player.y = 0;
    player.z = spawnZ;
    player.rot = 0;
    player.anim = 'idle';
    this.emit('player_changed_map', { player, oldMap, newMap: targetMap });
    return { success: true, player, newMap: targetMap, spawnPos: { x: 0, z: spawnZ } };
  }

  respawnPlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    const oldMap = player.mapId;
    player.mapId = 'town';
    player.x = 0;
    player.y = 0;
    player.z = 2; // Kasaba meydanı çeşme başı
    player.anim = 'idle';
    this.emit('player_changed_map', { player, oldMap, newMap: 'town' });
    return player;
  }

  /**
   * Award or deduct Primogems for a player (e.g. from river fishing or trading)
   */
  awardPrimogems(socketId, amount) {
    const player = this.players.get(socketId);
    if (!player) return 0;
    const addAmt = parseInt(amount, 10) || 0;
    player.primogems = Math.max(0, (player.primogems || 0) + addAmt);

    if (this.gachaEngine && !player.isGuest) {
      try {
        const u = this.gachaEngine.getOrCreateUser(player.username);
        u.primogems = player.primogems;
        this.gachaEngine.saveUsers();
      } catch (e) {}
    }

    return player.primogems;
  }

  /**
   * Add a chat speech bubble over player
   */
  addChatBubble(socketId, text) {
    const player = this.players.get(socketId);
    if (!player || !text) return null;

    const cleanText = String(text).trim().slice(0, 100);
    player.speechBubble = {
      text: cleanText,
      expiresAt: Date.now() + 6000 // 6 seconds visible
    };

    this.emit('speech_bubble', {
      socketId,
      username: player.username,
      mapId: player.mapId,
      text: cleanText
    });

    return player.speechBubble;
  }

  /**
   * Kick chat bridge: if chat sender is in the world, make their avatar talk!
   */
  bridgeKickChat(username, message) {
    if (!username || !message) return;
    const socketId = this.userSockets.get(username.toLowerCase());
    if (socketId) {
      this.addChatBubble(socketId, message);
    }
  }

  /**
   * Request 4-digit quick auth PIN
   */
  createPinAuth(socketId, kickUsername) {
    const cleanUser = (kickUsername || '').trim();
    if (!cleanUser) return { success: false, error: 'Kick kullanıcı adı giriniz.' };

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 180000; // 3 minutes

    this.pendingPins.set(pin, {
      socketId,
      username: cleanUser,
      expiresAt
    });

    console.log(`[WorldEngine] 🔑 Giriş PIN'i oluşturuldu: ${pin} (@${cleanUser})`);
    return { success: true, pin, command: `!giris ${pin}`, expiresAt };
  }

  /**
   * Verify PIN written in Kick stream chat: '!giris 8421'
   */
  verifyPinFromChat(senderUsername, messageText) {
    const parts = (messageText || '').trim().split(/\s+/);
    if (parts.length < 2 || parts[0].toLowerCase() !== '!giris') return null;

    const pin = parts[1].trim();
    const pending = this.pendingPins.get(pin);
    if (!pending) return null;

    if (Date.now() > pending.expiresAt) {
      this.pendingPins.delete(pin);
      return null;
    }

    if (pending.username.toLowerCase() !== senderUsername.toLowerCase()) {
      return null;
    }

    // Success! Update player
    this.pendingPins.delete(pin);
    const player = this.players.get(pending.socketId);
    if (player) {
      const oldName = player.username;
      player.username = senderUsername;
      player.isGuest = false;

      // Migrate guest RPG gear to Kick account
      if (this.rpgEngine && oldName && oldName.toLowerCase() !== senderUsername.toLowerCase()) {
        this.rpgEngine.adoptGuestProfile(oldName, senderUsername);
      }

      // Sync stats and active companion from gacha
      if (this.gachaEngine) {
        const u = this.gachaEngine.getOrCreateUser(senderUsername);
        player.primogems = u.primogems || 0;
        player.fiveStarsCount = u.fiveStarsCount || 0;
        const owned5 = this.getUser5Stars(senderUsername);
        const validComp = owned5.some(c => c.name.toLowerCase() === (u.activeCompanion || '').toLowerCase());
        player.companion = validComp ? u.activeCompanion : null;
        if (!validComp && u.activeCompanion) {
          u.activeCompanion = null;
          this.gachaEngine.saveUsers();
        }
      }

      this.userSockets.set(senderUsername.toLowerCase(), pending.socketId);
      console.log(`[WorldEngine] 🛡️ Kick Kimliği Doğrulandı: @${senderUsername} -> [${pending.socketId}]`);
      const companions = this.getUserCompanions(senderUsername);
      this.emit('player_authenticated', {
        socketId: pending.socketId,
        player,
        unlockedCompanions: companions,
        activeCompanion: player.companion || null
      });
      return { success: true, player, unlockedCompanions: companions, activeCompanion: player.companion || null };
    }

    return null;
  }

  cleanupExpiredPins() {
    const now = Date.now();
    for (const [pin, val] of this.pendingPins.entries()) {
      if (now > val.expiresAt) {
        this.pendingPins.delete(pin);
      }
    }
  }

  // ==========================================
  // 🛡️ 4-PLAYER PARTY ENGINE
  // ==========================================

  createParty(leaderSocketId) {
    const leader = this.players.get(leaderSocketId);
    if (!leader) return { ok: false, error: 'Oyuncu bulunamadı.' };

    if (this.playerParties.has(leaderSocketId)) {
      const existingId = this.playerParties.get(leaderSocketId);
      return { ok: true, party: this.getPartyState(existingId) };
    }

    const partyId = 'party_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const party = {
      id: partyId,
      leaderId: leaderSocketId,
      members: [leaderSocketId],
      createdAt: Date.now()
    };

    this.parties.set(partyId, party);
    this.playerParties.set(leaderSocketId, partyId);
    console.log(`[WorldEngine] 🛡️ Yeni parti kuruldu: ${partyId} (Lider: @${leader.username})`);

    return { ok: true, party: this.getPartyState(partyId) };
  }

  inviteToParty(leaderSocketId, targetUsername) {
    const leader = this.players.get(leaderSocketId);
    if (!leader) return { ok: false, error: 'Lider bulunamadı.' };

    let partyId = this.playerParties.get(leaderSocketId);
    if (!partyId) {
      const pRes = this.createParty(leaderSocketId);
      partyId = pRes.party.id;
    }

    const party = this.parties.get(partyId);
    if (!party) return { ok: false, error: 'Parti bulunamadı.' };

    if (party.members.length >= 4) {
      return { ok: false, error: 'Parti dolu! (Maksimum 4 kişi)' };
    }

    const cleanTarget = (targetUsername || '').trim().replace(/^@/, '');
    const target = this.getPlayerByName(cleanTarget);
    if (!target) {
      return { ok: false, error: `@${cleanTarget} bulunamadı veya çevrimdışı.` };
    }

    if (target.id === leaderSocketId) {
      return { ok: false, error: 'Kendini partiye davet edemezsin!' };
    }

    if (this.playerParties.has(target.id)) {
      return { ok: false, error: `@${target.username} zaten bir partide yer alıyor.` };
    }

    const inviteId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.pendingPartyInvites.set(inviteId, {
      id: inviteId,
      partyId: party.id,
      leaderId: leaderSocketId,
      leaderName: leader.username,
      targetSocketId: target.id,
      targetName: target.username,
      expiresAt: Date.now() + 15000
    });

    console.log(`[WorldEngine] ✉️ Parti daveti: @${leader.username} -> @${target.username} (${inviteId})`);
    return {
      ok: true,
      inviteId,
      partyId: party.id,
      leaderName: leader.username,
      targetSocketId: target.id,
      targetName: target.username
    };
  }

  acceptPartyInvite(targetSocketId, inviteId) {
    const inv = this.pendingPartyInvites.get(inviteId);
    if (!inv || inv.targetSocketId !== targetSocketId || Date.now() > inv.expiresAt) {
      return { ok: false, error: 'Parti daveti geçersiz veya süresi dolmuş.' };
    }

    const party = this.parties.get(inv.partyId);
    if (!party) {
      this.pendingPartyInvites.delete(inviteId);
      return { ok: false, error: 'Parti artık mevcut değil.' };
    }

    if (party.members.length >= 4) {
      this.pendingPartyInvites.delete(inviteId);
      return { ok: false, error: 'Parti dolu! (Maksimum 4 kişi)' };
    }

    this.pendingPartyInvites.delete(inviteId);
    if (!party.members.includes(targetSocketId)) {
      party.members.push(targetSocketId);
    }
    this.playerParties.set(targetSocketId, party.id);

    const targetPlayer = this.players.get(targetSocketId);
    console.log(`[WorldEngine] 🛡️ @${targetPlayer ? targetPlayer.username : targetSocketId} partiye katıldı: ${party.id}`);

    return {
      ok: true,
      partyId: party.id,
      party: this.getPartyState(party.id)
    };
  }

  declinePartyInvite(targetSocketId, inviteId) {
    const inv = this.pendingPartyInvites.get(inviteId);
    if (inv && inv.targetSocketId === targetSocketId) {
      this.pendingPartyInvites.delete(inviteId);
      return { ok: true, leaderSocketId: inv.leaderId, inviteId };
    }
    return { ok: false, error: 'Davet bulunamadı.' };
  }

  leaveParty(socketId) {
    const partyId = this.playerParties.get(socketId);
    if (!partyId) return { ok: false, error: 'Bir partide değilsin.' };

    const party = this.parties.get(partyId);
    this.playerParties.delete(socketId);

    if (!party) return { ok: true, disbanded: true, partyId };

    party.members = party.members.filter(id => id !== socketId);
    if (party.members.length === 0) {
      this.parties.delete(partyId);
      console.log(`[WorldEngine] 🛡️ Parti dağıldı: ${partyId}`);
      return { ok: true, disbanded: true, partyId };
    }

    let newLeaderId = party.leaderId;
    if (party.leaderId === socketId) {
      party.leaderId = party.members[0];
      newLeaderId = party.leaderId;
      console.log(`[WorldEngine] 👑 Yeni parti lideri atandı: [${newLeaderId}]`);
    }

    return {
      ok: true,
      disbanded: false,
      partyId,
      remainingMembers: [...party.members],
      newLeaderId,
      party: this.getPartyState(partyId)
    };
  }

  kickMember(leaderSocketId, targetSocketId) {
    const partyId = this.playerParties.get(leaderSocketId);
    if (!partyId) return { ok: false, error: 'Parti bulunamadı.' };

    const party = this.parties.get(partyId);
    if (!party || party.leaderId !== leaderSocketId) {
      return { ok: false, error: 'Yalnızca parti lideri üye atabilir.' };
    }

    if (leaderSocketId === targetSocketId) {
      return { ok: false, error: 'Lider kendini partiden atamaz (Ayrılmayı kullanın).' };
    }

    if (!party.members.includes(targetSocketId)) {
      return { ok: false, error: 'Oyuncu partide değil.' };
    }

    party.members = party.members.filter(id => id !== targetSocketId);
    this.playerParties.delete(targetSocketId);

    return {
      ok: true,
      partyId,
      kickedSocketId: targetSocketId,
      party: this.getPartyState(partyId)
    };
  }

  getPartyBySocket(socketId) {
    const partyId = this.playerParties.get(socketId);
    return partyId ? (this.parties.get(partyId) || null) : null;
  }

  getPartyState(partyId) {
    const party = this.parties.get(partyId);
    if (!party) return null;

    const members = [];
    for (const sid of party.members) {
      const p = this.players.get(sid);
      if (!p) continue;
      const rpgProf = this.rpgEngine ? this.rpgEngine.getProfile(p.username) : null;
      const gs = this.rpgEngine ? this.rpgEngine.gearScore(p.username) : 0;
      const effectiveMaxHp = (rpgProf && rpgProf.stats && rpgProf.stats.hp) ? rpgProf.stats.hp : 100;
      members.push({
        id: sid,
        username: p.username,
        avatarIndex: p.avatarIndex,
        isLeader: sid === party.leaderId,
        gearScore: gs,
        level: rpgProf ? rpgProf.level : 1,
        hp: typeof p.hp === 'number' ? p.hp : effectiveMaxHp,
        maxHp: typeof p.maxHp === 'number' ? p.maxHp : effectiveMaxHp,
        mapId: p.mapId
      });
    }

    return {
      id: party.id,
      leaderId: party.leaderId,
      members
    };
  }

  updatePlayerCombatHp(socketId, hp, maxHp) {
    const p = this.players.get(socketId);
    if (!p) return null;

    p.hp = Math.max(0, parseInt(hp, 10) || 0);
    p.maxHp = Math.max(1, parseInt(maxHp, 10) || 100);

    const party = this.getPartyBySocket(socketId);
    return party ? { partyId: party.id, members: party.members, hp: p.hp, maxHp: p.maxHp, socketId, username: p.username } : null;
  }

  // ==========================================
  // ⚔️ DUNGEON INSTANCE ENGINE
  // ==========================================

  getOrCreateDungeonInstance(partyId, tierId, socketId = null) {
    const isParty = Boolean(partyId && partyId !== 'public' && partyId !== 'solo');
    const instId = isParty
      ? `${tierId}_inst_${partyId}`
      : `${tierId}_inst_public`;

    let inst = this.instances.get(instId);

    // If boss was defeated and all players have left, renew the instance for fresh run
    if (inst && inst.bossDefeated) {
      const activePlayersInInst = Array.from(this.players.values()).filter(p => p.mapId === instId);
      if (activePlayersInInst.length === 0) {
        inst = null;
      }
    }

    if (!inst) {
      inst = new DungeonInstance(instId, tierId, isParty ? partyId : null);
      this.instances.set(instId, inst);
      console.log(`[WorldEngine] ⚔️ Yeni zindan örneği (Instance) hazırlandı: ${instId} (${tierId})`);
    }
    return inst;
  }

  getDungeonInstance(instanceId) {
    if (!instanceId) return null;
    if (this.instances.has(instanceId)) return this.instances.get(instanceId);

    // Fallback: Check if instanceId is a base tier (e.g. 'dungeon_tier_1') or has prefix
    for (const [id, inst] of this.instances.entries()) {
      if (id === instanceId || id.startsWith(instanceId) || inst.tierId === instanceId) {
        return inst;
      }
    }
    return null;
  }

  /**
   * Get all players grouped by mapId for state broadcasting
   */
  getMapStates() {
    const now = Date.now();
    const states = {};

    for (const mapKey of Object.keys(this.maps)) {
      states[mapKey] = [];
    }

    for (const p of this.players.values()) {
      // Clean expired speech bubbles
      if (p.speechBubble && now > p.speechBubble.expiresAt) {
        p.speechBubble = null;
      }

      if (!states[p.mapId]) {
        states[p.mapId] = [];
      }
      const mapList = states[p.mapId];
      const rpgProf = this.rpgEngine ? this.rpgEngine.getProfile(p.username) : null;
      mapList.push({
        id: p.id,
        username: p.username,
        isGuest: p.isGuest,
        avatarIndex: p.avatarIndex,
        profilePic: p.profilePic,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        rot: Number(p.rot.toFixed(2)),
        anim: p.anim,
        primogems: p.primogems,
        gearScore: this.rpgEngine ? this.rpgEngine.gearScore(p.username) : 0,
        level: rpgProf ? rpgProf.level : 1,
        companion: p.companion || null,
        weaponRarity: (rpgProf && rpgProf.equipment && rpgProf.equipment.weapon) ? rpgProf.equipment.weapon.rarity : 0,
        bubble: p.speechBubble ? p.speechBubble.text : null
      });
    }

    return states;
  }
}

module.exports = { WorldEngine };
