const EventEmitter = require('events');

/**
 * WorldEngine - 3D Pixel MMO Multi-Zone World Coordinator
 * Manages player positions, building transitions, chat bubbles, and Kick auth PINs.
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

    this.players.delete(socketId);
    this.userSockets.delete(player.username.toLowerCase());

    // Clean active trades if any
    if (this.tradeEngine) {
      this.tradeEngine.handlePlayerDisconnect(player.username);
    }

    console.log(`[WorldEngine] 🚪 Oyuncu ayrıldı: @${player.username}`);
    this.emit('player_left', { socketId, username: player.username, mapId: player.mapId });
    return player;
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

    const map = this.maps[player.mapId] || this.maps.town;
    const b = map.bounds;

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

    const curMap = this.maps[player.mapId];
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
          return { success: true, player, doorName: door.name, newMap: player.mapId };
        }
      }
    }

    // Check indoor exit door
    if (player.mapId !== 'town' && curMap.exitDoor) {
      const exit = curMap.exitDoor;
      const dx = player.x - exit.pos.x;
      const dz = player.z - exit.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= exit.radius) {
        const oldMap = player.mapId;
        player.mapId = exit.targetMap;
        player.x = exit.spawnPos.x;
        player.y = 0;
        player.z = exit.spawnPos.z;
        player.rot = Math.PI;
        player.anim = 'idle';

        console.log(`[WorldEngine] 🚪 @${player.username} kasaba meydanına geri çıktı.`);
        this.emit('player_changed_map', { player, oldMap, newMap: player.mapId, doorName: 'Kasaba Meydanı' });
        return { success: true, player, doorName: 'Kasaba Meydanı', newMap: player.mapId };
      }
    }

    return { success: false, error: 'Yakında girilebilecek bir kapı yok.' };
  }

  switchZone(socketId, targetMap) {
    const player = this.players.get(socketId);
    if (!player || !this.maps[targetMap]) return { success: false, error: 'Geçersiz bölge.' };
    const oldMap = player.mapId;
    const isDungeon = Boolean(this.maps[targetMap].isDungeon);
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

      const mapList = states[p.mapId] || states.town;
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
