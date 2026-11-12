/**
 * Teyvat Pixel MMO - Three.js 2.5D Pokémon City Engine
 * Full multiplayer world with procedural voxel buildings, pixel billboard avatars,
 * door transitions, Kick chat bubbles, and 2-phase P2P trading.
 */

(function () {
  'use strict';

  // --- Configuration ---
  const CONFIG = {
    cameraAngle: Math.PI / 4, // 45 degrees
    cameraDistance: 22,
    cameraHeight: 18,
    moveSpeed: 8.5,
    rotLerp: 0.18,
    posLerp: 0.15,
    tickRate: 50 // ms (20Hz)
  };

  // --- Global State ---
  let scene, camera, renderer;
  let socket = null;
  let socketId = null;
  let savedAvatarIdx = 0;
  try {
    savedAvatarIdx = parseInt(localStorage.getItem('mylune_avatar_index') || '0', 10);
    if (isNaN(savedAvatarIdx)) savedAvatarIdx = 0;
  } catch (e) {
    savedAvatarIdx = 0;
  }
  let myPlayer = {
    id: null,
    username: 'Gezgin_' + Math.floor(1000 + Math.random() * 9000),
    isGuest: true,
    avatarIndex: savedAvatarIdx,
    x: 0,
    y: 0,
    z: 4,
    rot: 0,
    anim: 'idle',
    mapId: 'town',
    primogems: 160
  };

  const otherPlayers = new Map(); // id -> { mesh, data, targetX, targetZ, targetRot, bubbleMesh }
  let currentMap = 'town';
  let mapData = null;
  const worldObjects = new THREE.Group();
  let waterParticles = null;
  let smokeParticles = null;
  let canalWaterMesh = null;
  let shrineCrystalMesh = null;
  let chimneyPos = { x: 17, y: 9.2, z: -12.5 };
  let animatedCats = [];
  let animatedNPCs = [];
  let fountainParticlesData = [];
  let chimneySmokeData = [];
  let firefliesData = [];
  let shrineAuraData = [];

  // River Fishing System State
  let riverFishSpots = [];
  let isFishing = false;
  let fishingState = 'idle'; // 'idle' | 'waiting' | 'bite' | 'minigame' | 'caught'
  let fishingRodMesh = null;
  let fishingBobberMesh = null;
  let fishingTimer = null;
  let biteTimeout = null;
  let currentHookedFish = null;
  let minigameFish = null;
  let minigameBarY = 0.2;
  let minigameBarVel = 0;
  let minigameFishY = 0.35;
  let minigameFishTargetY = 0.5;
  let minigameFishMoveTimer = 0;
  let minigameProgress = 35;
  let isReeling = false;
  let minigameAudioTick = 0;

  // --- Scene Lighting & Atmosphere Refs ---
  let sceneAmbientLight = null;
  let sceneHemiLight = null;
  let sceneSunLight = null;
  let skyDomeMesh = null;

  // --- Combat & Battle Zone State ---
  let playerHP = 500;
  let playerMaxHP = 500;
  let playerStamina = 100;
  let playerMaxStamina = 100;
  let playerEnergy = 0; // 0 to 100%
  let isAttacking = false;
  let attackComboIndex = 0;
  let lastAttackTime = 0;
  let heavyAttackCooldownEndTime = 0;
  let combatComboHits = 0;
  let combatComboExpireTime = 0;
  let lastReactionText = '';
  let lastReactionExpireTime = 0;
  let mouseNdcX = 0;
  let mouseNdcY = 0;
  let hasMouseMovedInZone = false;
  let targetReticleMesh = null;
  let lockedTargetMob = null;
  let activeSkillAimState = null;
  let skillAimIndicatorGroup = null;
  let activeSkillshots = [];
  let perfectDodgeBuffUntil = 0;
  let isDashing = false;
  let dashEndTime = 0;
  let dashCooldownEndTime = 0;
  let vortexCooldownEndTime = 0;
  let hitStopEndTime = 0;
  let screenShakeTimer = 0;
  let screenShakeMagnitude = 0;
  let activeCombatMobs = [];
  let activeDropGems = [];
  let activeSlashTrails = [];
  let activeProjectiles = [];
  let mobSpawnTimer = 0;
  let combatWeaponMesh = null;
  let isVortexActive = false;
  let vortexPosition = { x: 0, z: 0 };
  let vortexEndTime = 0;
  let vortexMesh = null;
  let playerInvulnerableUntil = 0;
  let bossRespawnTimer = 0;
  let vortexTickTimer = 0;
  let isPlayerDefeated = false;

  // --- 🛡️ 4-Player Party & Dungeon Instance State ---
  let myParty = null;
  let isPartyLeader = false;
  let currentPartyInviteId = null;
  let currentReadyCheckId = null;
  let readyCheckTimerInterval = null;
  let partyInviteTimerInterval = null;
  let lastSyncedHP = -1;

  // --- 5★ Character Companion (Pet) & Ability System State ---
  let myCompanion = null; // e.g. "Raiden Shogun"
  let myCompanionData = null; // meta { name, element, weapon, icon, splashArt, title }
  let myCompanionMesh = null; // 3D floating chibi mesh
  let otherPlayerCompanions = new Map(); // socketId -> Three.Group
  let unlockedCompanionsList = []; // list of 5★ characters owned by player
  let selectedCompanionInModal = null;
  let companionBuffs = {
    active: false,
    timer: 0,
    dmgMult: 1.0,
    speedMult: 1.0,
    type: ''
  };
  let activeJadeShieldHP = 0;
  let activeJadeShieldMesh = null;
  let activeElectroEyeMesh = null;
  let electroEyeEndTime = 0;
  let activeGeoSteleMesh = null;
  let geoStelePulseTimer = 0;
  let activeFurinaMinions = [];
  let furinaMinionsEndTime = 0;
  let activeKazuhaStormMesh = null;
  let kazuhaStormEndTime = 0;
  let kazuhaStormTickTimer = 0;
  let isKazuhaLeaping = false;
  let kazuhaLeapTimer = 0;
  let companionSkillCooldownEndTime = 0;

  // MMORPG Zone Configs & GearScore Calculation
  const ZONE_CONFIGS = {
    battle_zone_1: {
      id: 'battle_zone_1',
      name: 'Kadim Sarmaşıklı Orman',
      tier: 1,
      reqGS: 100,
      minIlvl: 1,
      maxIlvl: 12,
      theme: 'emerald_glade'
    },
    battle_zone_2: {
      id: 'battle_zone_2',
      name: 'Kızıl Lav Harabeleri',
      tier: 2,
      reqGS: 350,
      minIlvl: 15,
      maxIlvl: 30,
      theme: 'crimson_ruins'
    },
    battle_zone_3: {
      id: 'battle_zone_3',
      name: 'Kadim Uçurum Boşluğu',
      tier: 3,
      reqGS: 750,
      minIlvl: 32,
      maxIlvl: 50,
      theme: 'abyssal_core'
    },
    dungeon_tier_1: {
      id: 'dungeon_tier_1',
      name: 'Ateş Tapınağı: Aether Koridoru (Normal)',
      tier: 1,
      reqGS: 150,
      minIlvl: 8,
      maxIlvl: 18,
      isDungeon: true,
      theme: 'aion_fire_temple'
    },
    dungeon_tier_2: {
      id: 'dungeon_tier_2',
      name: 'Karanlık Poeta: Zaman Yarığı (Kahraman)',
      tier: 2,
      reqGS: 450,
      minIlvl: 22,
      maxIlvl: 36,
      isDungeon: true,
      theme: 'aion_dark_poeta'
    },
    dungeon_tier_3: {
      id: 'dungeon_tier_3',
      name: 'Balaurea Uçurumu: Tahabata Sunağı (Abyss)',
      tier: 3,
      reqGS: 800,
      minIlvl: 38,
      maxIlvl: 55,
      isDungeon: true,
      theme: 'aion_abyss_core'
    },
    pvp_arena: {
      id: 'pvp_arena',
      name: '⚔️ Gladyatör Arenası (PvP)',
      tier: 1,
      reqGS: 0,
      minIlvl: 1,
      maxIlvl: 60,
      theme: 'gladiator_colosseum',
      isPvP: true
    }
  };

  function isDungeonMap(map) {
    if (!map || typeof map !== 'string') return false;
    return map.startsWith('dungeon_tier_') || map.includes('_inst_');
  }

  function getDungeonBaseTier(map) {
    if (!map || typeof map !== 'string') return 'dungeon_tier_1';
    if (map.startsWith('dungeon_tier_3')) return 'dungeon_tier_3';
    if (map.startsWith('dungeon_tier_2')) return 'dungeon_tier_2';
    if (map.startsWith('dungeon_tier_1')) return 'dungeon_tier_1';
    return 'dungeon_tier_1';
  }

  function isBattleZone(map) {
    return map === 'battle_zone' || map === 'battle_zone_1' || map === 'battle_zone_2' || map === 'battle_zone_3' || map === 'pvp_arena' || isDungeonMap(map);
  }

  // Aion 2 Instance Dungeon Runtime State
  let dungeonState = {
    active: false,
    tierId: 'dungeon_tier_1',
    stage: 1,
    startTime: 0,
    elapsedSec: 0,
    score: 0,
    rank: 'S',
    stage1Cleared: false,
    stage2Cleared: false,
    bossDefeated: false,
    phase2Triggered: false,
    phase2ShieldActive: false,
    phase3Triggered: false,
    phase3SafeZoneActive: false,
    safeZonePos: { x: 0, z: 54 },
    safeZoneRadius: 5.5,
    safeZoneMesh: null,
    bossShieldMesh: null,
    barrier1Mesh: null,
    barrier2Mesh: null,
    windstream1Mesh: null,
    windstream2Mesh: null,
    isGliding: false,
    glideStart: 0,
    glideDuration: 1550,
    glideFrom: { x: 0, y: 0, z: -25 },
    glideTo: { x: 0, y: 0, z: -5 },
    daevaWingsMesh: null,
    viewerBuffActive: false,
    viewerBuffUntil: 0,
    viewerBuffMesh: null
  };
  let activeDungeonChests = [];

  function getGsDifficultyMultiplier(playerGS = 0, reqGS = 100) {
    if (!reqGS || reqGS <= 0) {
      return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: 1.0, label: '🛡️ UYGUN SEVİYE' };
    }
    const ratio = Math.max(0.01, playerGS / reqGS);
    if (ratio >= 1.0) {
      return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: Math.round(ratio * 100) / 100, label: '🛡️ UYGUN SEVİYE' };
    } else if (ratio >= 0.6) {
      const damageMult = Math.max(0.45, Math.round(ratio * 100) / 100);
      const damageTakenMult = Math.min(1.8, Math.round((1 + (1 - ratio) * 1.3) * 100) / 100);
      const glanceChance = Math.round((1 - ratio) * 0.25 * 100) / 100;
      return { damageMult, damageTakenMult, glanceChance, status: 'challenging', ratio: Math.round(ratio * 100) / 100, label: '⚔️ ZORLU SEVİYE' };
    } else if (ratio >= 0.18) {
      const damageMult = Math.max(0.15, Math.round(ratio * 0.7 * 100) / 100);
      const damageTakenMult = 2.5;
      const glanceChance = 0.35;
      return { damageMult, damageTakenMult, glanceChance, status: 'deadly', ratio: Math.round(ratio * 100) / 100, label: '⚠️ ÇOK TEHLİKELİ' };
    } else {
      // KAFATASI / AŞIRI YETERSİZ DONANIM (Ratio < 0.18 - Örn: 5 GS vs 100 GS = 0.05, 5 GS vs 350 GS = 0.014)
      // 5 GS ile gelen oyuncu düşman zırhını delemez; %88 sektirme, %3 hasar, 4.5 kat ölümcül hasar alma!
      const damageMult = 0.03;
      const damageTakenMult = 4.5;
      const glanceChance = 0.88;
      return { damageMult, damageTakenMult, glanceChance, poiseBreakable: false, status: 'deadly', ratio: Math.round(ratio * 100) / 100, label: '💀 ÖLÜMCÜL DONANIM EKSİĞİ' };
    }
  }

  function getMyGearScore() {
    if (typeof myRpgProfile !== 'undefined' && myRpgProfile && myRpgProfile.stats && typeof myRpgProfile.stats.gearScore === 'number') {
      return myRpgProfile.stats.gearScore;
    }
    if (typeof myMesh !== 'undefined' && myMesh && myMesh.userData && typeof myMesh.userData.gearScore === 'number') {
      return myMesh.userData.gearScore;
    }
    return (myPlayer && myPlayer.gearScore) || 0;
  }

  function getPlayerEffectiveStats() {
    const base = {
      hp: 500,
      atk: 28,
      def: 5,
      crit: 12,
      critDmg: 150,
      haste: 0,
      lifesteal: 0,
      gearScore: 0
    };
    if (typeof myRpgProfile !== 'undefined' && myRpgProfile && myRpgProfile.stats) {
      return {
        hp: Math.max(300, myRpgProfile.stats.hp || 500),
        atk: Math.max(10, myRpgProfile.stats.atk || 28),
        def: Math.max(0, myRpgProfile.stats.def || 5),
        crit: myRpgProfile.stats.crit || 12,
        critDmg: myRpgProfile.stats.critDmg || 150,
        haste: myRpgProfile.stats.haste || 0,
        lifesteal: myRpgProfile.stats.lifesteal || 0,
        gearScore: myRpgProfile.stats.gearScore || 0
      };
    }
    return base;
  }

  let activeTelegraphs = [];

  function createTelegraphCircle(x, z, radius, duration, onComplete) {
    const group = new THREE.Group();

    // Outer warning ring
    const ringGeo = new THREE.RingGeometry(radius * 0.93, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.05;
    group.add(ringMesh);

    // Inner charging fill
    const fillGeo = new THREE.CircleGeometry(radius * 0.92, 32);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.38 });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.rotation.x = -Math.PI / 2;
    fillMesh.position.y = 0.045;
    fillMesh.scale.set(0.01, 0.01, 1);
    group.add(fillMesh);

    group.position.set(x, 0, z);
    worldObjects.add(group);

    const tg = {
      type: 'circle',
      group,
      fillMesh,
      x,
      z,
      radius,
      startTime: performance.now(),
      duration,
      onComplete,
      cleanup: () => { worldObjects.remove(group); }
    };
    activeTelegraphs.push(tg);
    return tg;
  }

  function createTelegraphLane(x, z, width, length, rot, duration, onComplete) {
    const group = new THREE.Group();

    // Outer boundary outline
    const boxGeo = new THREE.PlaneGeometry(width, length);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide, transparent: true, opacity: 0.55, wireframe: true });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.rotation.x = -Math.PI / 2;
    boxMesh.position.set(0, 0.05, length / 2);
    group.add(boxMesh);

    // Inner charging fill
    const fillGeo = new THREE.PlaneGeometry(width * 0.96, length);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.38 });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.rotation.x = -Math.PI / 2;
    fillMesh.position.set(0, 0.045, length / 2);
    fillMesh.scale.set(1, 0.01, 1);
    group.add(fillMesh);

    group.position.set(x, 0, z);
    group.rotation.y = rot;
    worldObjects.add(group);

    const tg = {
      type: 'lane',
      group,
      fillMesh,
      x,
      z,
      width,
      length,
      rot,
      startTime: performance.now(),
      duration,
      onComplete,
      cleanup: () => { worldObjects.remove(group); }
    };
    activeTelegraphs.push(tg);
    return tg;
  }

  function createShockwaveRing(x, z, maxRadius, color = 0xef4444) {
    const ringGeo = new THREE.RingGeometry(0.3, maxRadius || 3.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.07, z);
    worldObjects.add(ring);

    activeSlashTrails.push({
      mesh: ring,
      mat: ringMat,
      birthTime: performance.now(),
      life: 380
    });
  }

  // Active Trade State
  let activeTrade = null;
  let myInventory = [];
  let nearbyInteractable = null; // { type: 'door' | 'player', data }

  // Input State

  const keys = { w: false, a: false, s: false, d: false, up: false, left: false, down: false, right: false };
  let joystickVector = { x: 0, y: 0 };
  let lastMoveSent = 0;

  // Shared AudioContext to prevent thread stalls and GC freezes
  let sharedAudioCtx = null;
  function getAudioCtx() {
    try {
      if (!sharedAudioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume();
      }
      return sharedAudioCtx;
    } catch (e) {
      return null;
    }
  }

  // Sound Synth Helper
  function playBeep(freq = 440, type = 'sine', duration = 0.12) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  // --- 1. Procedural 3D Anime Chibi Characters System ---
  function hexToCss(hex) {
    if (typeof hex === 'string' && hex.startsWith('#')) return hex;
    return '#' + hex.toString(16).padStart(6, '0');
  }

  const AVATAR_PRESETS = [
    {
      id: 'erkek',
      name: 'Erkek',
      gender: 'male',
      portrait: '/assets/character/erkek/portrait.png',
      spriteFolder: '/assets/character/erkek',
      badgeColor: '#f59e0b',
      element: 'geo',
      hair: 0x78350f,
      skin: 0xfed7aa,
      eyes: '#f59e0b',
      clothes: 0x1e293b,
      trim: 0xf59e0b,
      pants: 0x334155,
      boots: 0x78350f,
      cape: 0xffffff,
      hairStyle: 'short_male',
      weapon: 'sword',
      weaponColor: 0xe2e8f0
    },
    {
      id: 'kari',
      name: 'Karı',
      gender: 'female',
      portrait: '/assets/character/kari/portrait.png',
      spriteFolder: '/assets/character/kari',
      badgeColor: '#ec4899',
      element: 'pyro',
      hair: 0xfde047,
      skin: 0xfef08a,
      eyes: '#ec4899',
      clothes: 0x831843,
      trim: 0xf472b6,
      pants: 0x1e293b,
      boots: 0x3b0764,
      cape: 0xbe185d,
      hairStyle: 'female_warrior',
      weapon: 'sword',
      weaponColor: 0xf472b6
    },
    {
      name: 'Gezgin (Aether)',
      hair: 0xf59e0b,
      skin: 0xfed7aa,
      eyes: '#f59e0b',
      clothes: 0x1e293b,
      trim: 0xf59e0b,
      pants: 0x334155,
      boots: 0x78350f,
      cape: 0xffffff,
      hairStyle: 'aether_braid',
      weapon: 'sword',
      weaponColor: 0xe2e8f0,
      element: 'anemo',
      badgeColor: '#f59e0b'
    },
    {
      name: 'Gezgin (Lumine)',
      hair: 0xfde047,
      skin: 0xfef08a,
      eyes: '#f59e0b',
      clothes: 0xf8fafc,
      trim: 0x38bdf8,
      pants: 0xf8fafc,
      boots: 0xe2e8f0,
      cape: 0x38bdf8,
      hairStyle: 'lumine_flowers',
      weapon: 'sword',
      weaponColor: 0x38bdf8,
      element: 'anemo',
      badgeColor: '#fde047'
    },
    {
      name: 'Amber (Favonius Okçusu)',
      hair: 0x78350f,
      skin: 0xfed7aa,
      eyes: '#b45309',
      clothes: 0xdc2626,
      trim: 0xfef08a,
      pants: 0xffffff,
      boots: 0x78350f,
      cape: 0xb91c1c,
      hairStyle: 'amber_ears',
      weapon: 'bow',
      weaponColor: 0xd97706,
      element: 'pyro',
      badgeColor: '#ef4444'
    },
    {
      name: 'Zhongli (Geo Danışman)',
      hair: 0x1e293b,
      skin: 0xfef3c7,
      eyes: '#d97706',
      clothes: 0x78350f,
      trim: 0xf59e0b,
      pants: 0x0f172a,
      boots: 0x0f172a,
      cape: 0x451a03,
      hairStyle: 'zhongli_tail',
      weapon: 'polearm',
      weaponColor: 0xf59e0b,
      element: 'geo',
      badgeColor: '#d97706'
    },
    {
      name: 'Raiden Shogun (Electro)',
      hair: 0x6b21a8,
      skin: 0xede9fe,
      eyes: '#a855f7',
      clothes: 0x581c87,
      trim: 0xfacc15,
      pants: 0x3b0764,
      boots: 0x2e1065,
      cape: 0x7c3aed,
      hairStyle: 'raiden_braid',
      weapon: 'catalyst',
      weaponColor: 0xc084fc,
      element: 'electro',
      badgeColor: '#9333ea'
    },
    {
      name: 'Furina (Hydro Diva)',
      hair: 0xbae6fd,
      skin: 0xf0f9ff,
      eyes: '#0284c7',
      clothes: 0x1e3a8a,
      trim: 0xf8fafc,
      pants: 0x0f172a,
      boots: 0x1e293b,
      cape: 0x2563eb,
      hairStyle: 'furina_hat',
      weapon: 'sword',
      weaponColor: 0x38bdf8,
      element: 'hydro',
      badgeColor: '#0284c7'
    },
    {
      name: 'Il Capitano (1. Harbiye)',
      hair: 0x0f172a,
      skin: 0x334155,
      eyes: '#06b6d4',
      clothes: 0x0f172a,
      trim: 0x64748b,
      pants: 0x0f172a,
      boots: 0x18181b,
      cape: 0x334155,
      hairStyle: 'capitano_helm',
      weapon: 'greatsword',
      weaponColor: 0x06b6d4,
      element: 'cryo',
      badgeColor: '#0891b2'
    },
    {
      name: 'Klee (Kıvılcım Şövalyesi)',
      hair: 0xfef08a,
      skin: 0xfff1f2,
      eyes: '#ea580c',
      clothes: 0xef4444,
      trim: 0xffffff,
      pants: 0xffffff,
      boots: 0x78350f,
      cape: 0xdc2626,
      hairStyle: 'klee_beret',
      weapon: 'bomb',
      weaponColor: 0xf97316,
      element: 'pyro',
      badgeColor: '#f97316'
    },
    {
      name: "Diona (Cat's Tail Barmen)",
      hair: 0xf472b6,
      skin: 0xfff1f2,
      eyes: '#10b981',
      clothes: 0xf43f5e,
      trim: 0xfacc15,
      pants: 0x831843,
      boots: 0x4c0519,
      cape: 0xfb7185,
      hairStyle: 'cat_ears',
      weapon: 'potion',
      weaponColor: 0x34d399,
      element: 'cryo',
      badgeColor: '#f43f5e'
    },
    {
      name: 'Gölge Shinobi (Ninja)',
      hair: 0x0f172a,
      skin: 0xcbd5e1,
      eyes: '#ef4444',
      clothes: 0x0f172a,
      trim: 0xdc2626,
      pants: 0x0f172a,
      boots: 0x0f172a,
      cape: 0xdc2626,
      hairStyle: 'ninja_mask',
      weapon: 'sword',
      weaponColor: 0xef4444,
      element: 'pyro',
      badgeColor: '#dc2626'
    },
    {
      name: 'Venti (Rüzgar Ozanı)',
      hair: 0x065f46,
      skin: 0xecfdf5,
      eyes: '#10b981',
      clothes: 0x059669,
      trim: 0xfacc15,
      pants: 0x78350f,
      boots: 0x451a03,
      cape: 0x10b981,
      hairStyle: 'venti_beret',
      weapon: 'bow',
      weaponColor: 0x34d399,
      element: 'anemo',
      badgeColor: '#059669'
    },
    {
      name: 'Yae Miko (Büyük Rahibe)',
      hair: 0xf472b6,
      skin: 0xfdf2f8,
      eyes: '#a855f7',
      clothes: 0xdc2626,
      trim: 0xffffff,
      pants: 0xdc2626,
      boots: 0x450a0a,
      cape: 0xffffff,
      hairStyle: 'miko_ears',
      weapon: 'catalyst',
      weaponColor: 0xf472b6,
      element: 'electro',
      badgeColor: '#ec4899'
    },
    {
      name: 'Nahida (Bilgelik Arkonu)',
      hair: 0xdcfce7,
      skin: 0xf0fdf4,
      eyes: '#22c55e',
      clothes: 0x15803d,
      trim: 0xfacc15,
      pants: 0xffffff,
      boots: 0xffffff,
      cape: 0x86efac,
      hairStyle: 'leaf_tail',
      weapon: 'catalyst',
      weaponColor: 0x4ade80,
      element: 'dendro',
      badgeColor: '#16a34a'
    },
    {
      name: 'Diluc (Gece Muhafızı)',
      hair: 0xdc2626,
      skin: 0xfed7aa,
      eyes: '#991b1b',
      clothes: 0x18181b,
      trim: 0xf59e0b,
      pants: 0x18181b,
      boots: 0x09090b,
      cape: 0x27272a,
      hairStyle: 'diluc_mane',
      weapon: 'greatsword',
      weaponColor: 0xef4444,
      element: 'pyro',
      badgeColor: '#b91c1c'
    },
    {
      name: 'Tartaglia (Childe)',
      hair: 0xea580c,
      skin: 0xfed7aa,
      eyes: '#0284c7',
      clothes: 0x71717a,
      trim: 0xdc2626,
      pants: 0x27272a,
      boots: 0x18181b,
      cape: 0xdc2626,
      hairStyle: 'childe_mask',
      weapon: 'sword',
      weaponColor: 0x38bdf8,
      element: 'hydro',
      badgeColor: '#0284c7'
    },
    {
      name: 'Paimon (Uçan Yoldaş)',
      hair: 0xf8fafc,
      skin: 0xfff1f2,
      eyes: '#38bdf8',
      clothes: 0xf1f5f9,
      trim: 0xf59e0b,
      pants: 0xffffff,
      boots: 0xffffff,
      cape: 0x38bdf8,
      hairStyle: 'paimon_halo',
      weapon: 'sparkle',
      weaponColor: 0xfde047,
      element: 'omni',
      badgeColor: '#38bdf8'
    },
    {
      name: 'Xiao (Yakşa Muhafız)',
      hair: 0x047857,
      skin: 0xecfdf5,
      eyes: '#f59e0b',
      clothes: 0x064e3b,
      trim: 0x34d399,
      pants: 0x1e293b,
      boots: 0x0f172a,
      cape: 0x059669,
      hairStyle: 'xiao_spikes',
      weapon: 'polearm',
      weaponColor: 0x10b981,
      element: 'anemo',
      badgeColor: '#059669'
    },
    {
      name: 'Ganyu (Kirin Elçisi)',
      hair: 0x7dd3fc,
      skin: 0xf0f9ff,
      eyes: '#d97706',
      clothes: 0x1e293b,
      trim: 0x38bdf8,
      pants: 0x0f172a,
      boots: 0x1e293b,
      cape: 0x0284c7,
      hairStyle: 'ganyu_horns',
      weapon: 'bow',
      weaponColor: 0x38bdf8,
      element: 'cryo',
      badgeColor: '#0284c7'
    },
    {
      name: 'Kaeya (Süvari Kaptanı)',
      hair: 0x1d4ed8,
      skin: 0xd97706,
      eyes: '#60a5fa',
      clothes: 0x1e293b,
      trim: 0xffffff,
      pants: 0xffffff,
      boots: 0x1e293b,
      cape: 0xf8fafc,
      hairStyle: 'eyepatch',
      weapon: 'sword',
      weaponColor: 0x60a5fa,
      element: 'cryo',
      badgeColor: '#2563eb'
    },
    {
      name: 'Hu Tao (Cenaze Yöneticisi)',
      hair: 0x451a03,
      skin: 0xfef2f2,
      eyes: '#dc2626',
      clothes: 0x18181b,
      trim: 0xdc2626,
      pants: 0x18181b,
      boots: 0x09090b,
      cape: 0xdc2626,
      hairStyle: 'hutao_hat',
      weapon: 'polearm',
      weaponColor: 0xef4444,
      element: 'pyro',
      badgeColor: '#b91c1c'
    }
  ];

  const AVATAR_PALETTES = AVATAR_PRESETS;

  // Generate 128x128 High-Resolution Cel-Shaded Anime Face Texture
  function createChibiFaceTexture(preset) {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // Base skin fill
    ctx.fillStyle = hexToCss(preset.skin);
    ctx.fillRect(0, 0, 128, 128);

    if (preset.hairStyle === 'capitano_helm') {
      // Dark iron faceplate
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 12, 112, 108);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(16, 20, 96, 92);

      // Glowing Cyan Visor Slit
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(20, 56, 88, 16);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(32, 60, 64, 8);
      ctx.shadowBlur = 0;

      // Rivets / bolts
      ctx.fillStyle = '#475569';
      [24, 104].forEach(rx => {
        ctx.beginPath();
        ctx.arc(rx, 30, 3, 0, Math.PI * 2);
        ctx.arc(rx, 96, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (preset.hairStyle === 'ninja_mask') {
      // Shinobi Cowl & Mask
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 128, 38);
      ctx.fillRect(0, 66, 128, 62);

      // Sharp Red Shinobi Eyes
      [36, 92].forEach(cx => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, 52, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.ellipse(cx, 52, 7, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, 52, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 2, 49, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 14, 50);
        ctx.lineTo(cx + 14, 48);
        ctx.stroke();
      });
    } else {
      // Regular Anime Chibi Eyes
      const eyeColor = preset.eyes || '#3b82f6';

      [
        { cx: 36, isRight: false },
        { cx: 92, isRight: true }
      ].forEach(({ cx, isRight }) => {
        if (preset.hairStyle === 'eyepatch' && isRight) {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(cx, 60, 16, 20, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#334155';
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, 42);
          ctx.lineTo(128, 76);
          ctx.stroke();
          return;
        }

        const cy = 60;
        // 1. Sclera (White eye background)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14, 19, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Iris (Gradient)
        const irisGrad = ctx.createLinearGradient(cx, cy - 16, cx, cy + 18);
        irisGrad.addColorStop(0, '#0f172a');
        irisGrad.addColorStop(0.45, eyeColor);
        irisGrad.addColorStop(1, '#ffffff');

        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 1, 10, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3. Pupil
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 1, 5, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // 4. Large Sparkle Highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 3.5, cy - 6, 5, 0, Math.PI * 2);
        ctx.fill();

        // 5. Secondary Small Sparkle
        ctx.beginPath();
        ctx.arc(cx + 4, cy + 6, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // 6. Upper Eyelash / Liner
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy - 5, 14, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();

        // Wing flick
        const wingDir = isRight ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + wingDir * 12, cy - 8);
        ctx.lineTo(cx + wingDir * 17, cy - 12);
        ctx.stroke();

        // 7. Eyebrow
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = hexToCss(preset.hair);
        ctx.beginPath();
        ctx.arc(cx, cy - 18, 11, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      });

      // Rosy Anime Blushes under eyes
      ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
      ctx.beginPath();
      ctx.ellipse(26, 82, 11, 6.5, -0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(102, 82, 11, 6.5, 0.1, 0, Math.PI * 2);
      ctx.fill();

      // Cute Blush Hatch marks
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.6)';
      [-3, 3].forEach(dx => {
        ctx.beginPath();
        ctx.moveTo(26 + dx - 2, 79);
        ctx.lineTo(26 + dx + 2, 85);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(102 + dx - 2, 79);
        ctx.lineTo(102 + dx + 2, 85);
        ctx.stroke();
      });

      // Cute Mouth
      if (preset.hairStyle === 'cat_ears') {
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#881337';
        ctx.beginPath();
        ctx.arc(60, 93, 4.5, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(68, 93, 4.5, 0, Math.PI);
        ctx.stroke();
      } else {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#881337';
        ctx.beginPath();
        ctx.arc(64, 91, 7.5, 0.25, Math.PI - 0.25);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.generateMipmaps = true;
    return tex;
  }

  const avatarPortraitCache = {};
  function getAvatarPortraitImg(src) {
    if (!src) return null;
    if (!avatarPortraitCache[src] && typeof Image !== 'undefined') {
      const img = new Image();
      img.src = src;
      avatarPortraitCache[src] = img;
    }
    return avatarPortraitCache[src];
  }

  // Draw 2D Avatar Portrait for HUD profile & Avatar Selection Modal
  function drawAvatarPreviewPortrait(canvas, preset) {
    if (!canvas) return;
    const w = canvas.width || 48;
    const h = canvas.height || 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const portraitSrc = (preset && preset.portrait) || 
      (preset && (preset.id === 'kari' || preset.name === 'Karı') ? '/assets/character/kari/portrait.png' : '/assets/character/erkek/portrait.png');
    const pImg = getAvatarPortraitImg(portraitSrc);

    if (pImg && pImg.complete && pImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.clip();

      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.7);
      bgGrad.addColorStop(0, '#334155');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pImg, 0, 0, pImg.naturalWidth, pImg.naturalHeight, 2, 2, w - 4, h - 4);
      ctx.restore();

      ctx.lineWidth = 2;
      ctx.strokeStyle = (preset && preset.badgeColor) || '#38bdf8';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      return;
    } else if (pImg) {
      pImg.onload = () => drawAvatarPreviewPortrait(canvas, preset);
      return;
    }

    if (!preset) return;

    // 1. Vibrant Elemental Badge Background
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.7);
    bgGrad.addColorStop(0, preset.badgeColor || '#38bdf8');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = preset.badgeColor || '#38bdf8';
    ctx.stroke();

    // 2. Chibi Face Base
    const headX = w / 2;
    const headY = h / 2 + 2;
    const headR = w * 0.28;

    ctx.fillStyle = hexToCss(preset.skin);
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // 3. Hair Bangs & Silhouette
    ctx.fillStyle = hexToCss(preset.hair);
    ctx.beginPath();
    ctx.arc(headX, headY - 3, headR + 1.5, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(headX - headR, headY - 2);
    ctx.lineTo(headX - headR * 0.4, headY + 3);
    ctx.lineTo(headX, headY - 1);
    ctx.lineTo(headX + headR * 0.4, headY + 3);
    ctx.lineTo(headX + headR, headY - 2);
    ctx.lineTo(headX + headR, headY - headR);
    ctx.lineTo(headX - headR, headY - headR);
    ctx.fill();

    // 4. Headgear / Signature Accessory
    if (preset.hairStyle === 'capitano_helm') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(headX - headR - 1, headY - headR - 2, headR * 2 + 2, headR * 2 + 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(headX - headR * 0.65, headY - 1, headR * 1.3, 4);
    } else if (preset.hairStyle === 'furina_hat') {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(headX - 6, headY - headR - 10, 14, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(headX - 8, headY - headR - 2, 18, 3);
    } else if (preset.hairStyle === 'klee_beret') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(headX, headY - headR - 2, headR * 1.1, headR * 0.55, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(headX + headR * 0.7, headY - headR - 5, 2.5, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (preset.hairStyle === 'amber_ears') {
      ctx.fillStyle = '#dc2626';
      [-6, 6].forEach(ex => {
        ctx.beginPath();
        ctx.ellipse(headX + ex, headY - headR - 5, 3.5, 8, ex > 0 ? 0.35 : -0.35, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (preset.hairStyle === 'cat_ears') {
      ctx.fillStyle = hexToCss(preset.hair);
      [-8, 8].forEach(ex => {
        ctx.beginPath();
        ctx.moveTo(headX + ex - 4, headY - headR + 2);
        ctx.lineTo(headX + ex, headY - headR - 8);
        ctx.lineTo(headX + ex + 4, headY - headR + 2);
        ctx.fill();
      });
    } else if (preset.hairStyle === 'paimon_halo') {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(headX, headY - headR - 6, 10, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5. Anime Eyes & Smile on portrait
    if (preset.hairStyle !== 'capitano_helm') {
      const eyeCol = preset.eyes || '#3b82f6';
      [-5, 5].forEach(ex => {
        const eyeX = headX + ex;
        const eyeY = headY + 3;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, 3.5, 4.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY + 0.5, 2.4, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeX - 0.8, eyeY - 1.2, 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY - 1, 3.5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      });

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#881337';
      ctx.beginPath();
      ctx.arc(headX, headY + 7.5, 2.2, 0, Math.PI);
      ctx.stroke();
    }

    // 6. Clothes Collar
    ctx.fillStyle = hexToCss(preset.clothes);
    ctx.beginPath();
    ctx.arc(headX, h + 6, w * 0.35, Math.PI * 1.15, Math.PI * 1.85);
    ctx.fill();
  }

  // --- Stylized Anime Cel-Shading (Toon Material & Outline Helpers) ---
  let cachedToonGradientMap = null;
  function getToonGradientMap() {
    if (cachedToonGradientMap) return cachedToonGradientMap;
    const cvs = document.createElement('canvas');
    cvs.width = 4;
    cvs.height = 1;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(1, 0, 1, 1);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(2, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 0, 1, 1);
    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    cachedToonGradientMap = tex;
    return tex;
  }

  function createStylizedMaterial(color, opts = {}) {
    if (typeof THREE.MeshToonMaterial === 'function') {
      return new THREE.MeshToonMaterial({
        color,
        gradientMap: getToonGradientMap(),
        ...opts
      });
    }
    return new THREE.MeshLambertMaterial({ color, ...opts });
  }

  function addAnimeOutline(mesh, scale = 1.055, color = 0x090d16) {
    if (!mesh || !mesh.geometry) return null;
    const outlineMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide
    });
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.set(scale, scale, scale);
    outline.userData.isOutline = true;
    mesh.add(outline);
    return outline;
  }

  function triggerRigCombatAction(mesh, actionType, durationMs = 280) {
    if (!mesh || !mesh.userData || !mesh.userData.rig) return;
    mesh.userData.rig.combatAction = {
      type: actionType,
      startTime: performance.now(),
      duration: durationMs
    };
  }

  // --- 3D Chibi Character Rig Creator (Stylized Anime Toon Edition) ---
  function create3DChibiCharacter(avatarIndex = 0) {
    const preset = AVATAR_PRESETS[Math.abs(avatarIndex) % AVATAR_PRESETS.length];
    const root = new THREE.Group();

    // Stylized Cel-Shaded Materials
    const matSkin = createStylizedMaterial(preset.skin);
    const matHair = createStylizedMaterial(preset.hair);
    const matClothes = createStylizedMaterial(preset.clothes);
    const matTrim = createStylizedMaterial(preset.trim || 0xfacc15);
    const matPants = createStylizedMaterial(preset.pants || 0x1e293b);
    const matBoots = createStylizedMaterial(preset.boots || 0x334155);
    const matCape = createStylizedMaterial(preset.cape || preset.clothes, { side: THREE.DoubleSide });

    // Face material
    const faceTex = createChibiFaceTexture(preset);
    const matFace = createStylizedMaterial(0xffffff, { map: faceTex });

    // 1. Head Group (Pivot at base of neck/head)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.48, 0);

    // Box face order: +X, -X, +Y, -Y, +Z (Front face), -Z (Back)
    const headMats = [matSkin, matSkin, matSkin, matSkin, matFace, matHair];
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.74, 0.72), headMats);
    headMesh.castShadow = true;
    addAnimeOutline(headMesh, 1.045, 0x0f172a);
    headGroup.add(headMesh);

    // Sculpted Anime Cheek/Chin softening plates + Cute 3D Ears
    [-0.38, 0.38].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matSkin);
      ear.position.set(ex, -0.04, 0.04);
      headGroup.add(ear);
    });

    // 3D Layered Anime Hair & Bangs
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.24, 0.24), matHair);
    bangs.position.set(0, 0.30, 0.31);
    addAnimeOutline(bangs, 1.04, 0x090d16);
    headGroup.add(bangs);

    // Center anime hair strand (Ahoge / Forehead lock)
    const centerStrand = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), matHair);
    centerStrand.rotation.x = Math.PI;
    centerStrand.position.set(0.04, 0.20, 0.42);
    headGroup.add(centerStrand);

    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.78), matHair);
    sideL.position.set(-0.40, -0.05, 0.02);
    headGroup.add(sideL);

    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.78), matHair);
    sideR.position.set(0.40, -0.05, 0.02);
    headGroup.add(sideR);

    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.18, 0.78), matHair);
    hairTop.position.set(0, 0.40, 0);
    headGroup.add(hairTop);

    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.74, 0.18), matHair);
    hairBack.position.set(0, 0.02, -0.39);
    headGroup.add(hairBack);

    let hairTail = null;
    let floatingGear = null;

    // Special headgear / accessories per style
    if (preset.hairStyle === 'capitano_helm') {
      const helmCowl = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.84, 0.84), createStylizedMaterial(0x0f172a));
      headGroup.add(helmCowl);

      const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
      visorSlit.position.set(0, 0, 0.42);
      headGroup.add(visorSlit);

      [-0.42, 0.42].forEach(hx => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.38, 4), createStylizedMaterial(0x475569));
        horn.rotation.z = hx > 0 ? -0.4 : 0.4;
        horn.position.set(hx, 0.36, -0.1);
        headGroup.add(horn);
      });
    } else if (preset.hairStyle === 'furina_hat') {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.42, 8), createStylizedMaterial(0x1e3a8a));
      hat.position.set(0.12, 0.58, 0);
      hat.rotation.z = -0.15;
      headGroup.add(hat);

      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 8), createStylizedMaterial(0x172554));
      brim.position.set(0.12, 0.40, 0);
      brim.rotation.z = -0.15;
      headGroup.add(brim);

      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 8), matTrim);
      rib.position.set(0.12, 0.44, 0);
      rib.rotation.z = -0.15;
      headGroup.add(rib);
    } else if (preset.hairStyle === 'klee_beret') {
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.58, 0.20, 10), createStylizedMaterial(0xef4444));
      beret.position.set(0, 0.48, 0);
      beret.rotation.z = -0.1;
      headGroup.add(beret);

      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), createStylizedMaterial(0xffffff));
      feather.rotation.z = -0.7;
      feather.position.set(0.42, 0.62, 0);
      headGroup.add(feather);
    } else if (preset.hairStyle === 'amber_ears') {
      [-0.18, 0.18].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.06), createStylizedMaterial(0xdc2626));
        ear.position.set(ex, 0.58, 0);
        ear.rotation.z = ex > 0 ? -0.25 : 0.25;
        headGroup.add(ear);
      });
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.12), createStylizedMaterial(0xb91c1c));
      knot.position.set(0, 0.45, 0.05);
      headGroup.add(knot);
    } else if (preset.hairStyle === 'cat_ears') {
      [-0.26, 0.26].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4), matHair);
        ear.position.set(ex, 0.52, 0);
        ear.rotation.z = ex > 0 ? -0.2 : 0.2;
        headGroup.add(ear);

        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), createStylizedMaterial(0xfda4af));
        inner.position.set(ex, 0.50, 0.06);
        inner.rotation.z = ex > 0 ? -0.2 : 0.2;
        headGroup.add(inner);
      });
    } else if (preset.hairStyle === 'paimon_halo') {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 16), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      halo.rotation.x = Math.PI / 2.3;
      halo.position.set(0, 0.64, -0.05);
      headGroup.add(halo);
      floatingGear = halo;
    } else if (['aether_braid', 'zhongli_tail', 'raiden_braid', 'diluc_mane'].includes(preset.hairStyle)) {
      const tailGeo = new THREE.CylinderGeometry(0.08, 0.04, 0.85, 6);
      tailGeo.translate(0, -0.42, 0);
      hairTail = new THREE.Mesh(tailGeo, matHair);
      hairTail.position.set(0, -0.05, -0.42);
      hairTail.rotation.x = 0.15;
      headGroup.add(hairTail);
    }

    root.add(headGroup);

    // 2. Torso Group (y = 0.94)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.94, 0);

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.36), matClothes);
    torsoMesh.castShadow = true;
    addAnimeOutline(torsoMesh, 1.05, 0x090d16);
    torsoGroup.add(torsoMesh);

    // Shoulder Pauldrons
    [-0.33, 0.33].forEach(sx => {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.28), matTrim);
      pauldron.position.set(sx, 0.22, 0);
      torsoGroup.add(pauldron);
    });

    // Collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.38), matTrim);
    collar.position.set(0, 0.26, 0);
    torsoGroup.add(collar);

    // Belt & Buckle
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.10, 0.38), createStylizedMaterial(0x1e293b));
    belt.position.set(0, -0.20, 0);
    torsoGroup.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.40), matTrim);
    buckle.position.set(0, -0.20, 0);
    torsoGroup.add(buckle);

    // Dynamic Cape (hinged at upper back shoulders)
    const capeGeo = new THREE.BoxGeometry(0.52, 0.72, 0.03);
    capeGeo.translate(0, -0.36, 0);
    const capeMesh = new THREE.Mesh(capeGeo, matCape);
    capeMesh.position.set(0, 0.24, -0.20);
    capeMesh.rotation.x = 0.12;
    torsoGroup.add(capeMesh);

    root.add(torsoGroup);

    // 3. Arms
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.37, 1.15, 0);
    const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), matClothes);
    leftSleeve.position.set(0, -0.21, 0);
    leftArmGroup.add(leftSleeve);
    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), matSkin);
    leftHand.position.set(0, -0.46, 0);
    leftArmGroup.add(leftHand);
    root.add(leftArmGroup);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.37, 1.15, 0);
    const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.18), matClothes);
    rightSleeve.position.set(0, -0.21, 0);
    rightArmGroup.add(rightSleeve);
    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), matSkin);
    rightHand.position.set(0, -0.46, 0);
    rightArmGroup.add(rightHand);

    // Unified Held Weapon in rightHand (scales & glows in combat!)
    const weaponHolder = new THREE.Group();
    weaponHolder.name = 'equippedHandWeapon';
    const weaponType = preset.weapon || 'sword';
    const wepCol = preset.weaponColor || 0x38bdf8;
    const wepMat = new THREE.MeshStandardMaterial({
      color: wepCol,
      emissive: wepCol,
      emissiveIntensity: 0.35,
      metalness: 0.8,
      roughness: 0.25
    });

    if (weaponType === 'greatsword') {
      const bigBlade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.28, 0.05), wepMat);
      bigBlade.position.set(0, 0.46, 0.24);
      bigBlade.rotation.x = Math.PI / 4;
      weaponHolder.add(bigBlade);
      const bigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.10), matTrim);
      bigGuard.position.set(0, -0.06, 0.06);
      weaponHolder.add(bigGuard);
    } else if (weaponType === 'polearm') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6), createStylizedMaterial(0x78350f));
      shaft.position.set(0, 0.24, 0.18);
      shaft.rotation.x = Math.PI / 4;
      weaponHolder.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.38, 4), wepMat);
      head.position.set(0, 0.88, 0.22);
      head.rotation.x = Math.PI / 4;
      weaponHolder.add(head);
    } else if (weaponType === 'catalyst') {
      const orb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: wepCol }));
      orb.position.set(0.16, 0.10, 0.22);
      weaponHolder.add(orb);
      floatingGear = orb;
    } else if (weaponType === 'bow') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 14, Math.PI), wepMat);
      bow.rotation.y = Math.PI / 2;
      bow.position.set(0, 0.10, 0.18);
      weaponHolder.add(bow);
    } else {
      // Stylized Anime Runeblade (Default / Sword)
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.05, 0.035), wepMat);
      blade.position.set(0, 0.36, 0.22);
      blade.rotation.x = Math.PI / 4;
      weaponHolder.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 4), wepMat);
      tip.position.set(0, 0.76, 0.62);
      tip.rotation.x = Math.PI / 4;
      tip.rotation.y = Math.PI / 4;
      weaponHolder.add(tip);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.09), matTrim);
      guard.position.set(0, -0.05, 0.06);
      weaponHolder.add(guard);
    }

    // Dynamic Elemental Blade Energy Sheath (Ignites during Skillshots & Aiming!)
    const weaponAuraMat = new THREE.MeshBasicMaterial({
      color: wepCol,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide
    });
    const weaponAuraMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.45, 6), weaponAuraMat);
    weaponAuraMesh.position.set(0, 0.48, 0.34);
    weaponAuraMesh.rotation.x = Math.PI / 4;
    weaponHolder.add(weaponAuraMesh);

    rightHand.add(weaponHolder);
    root.add(rightArmGroup);

    // 4. Legs
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.16, 0.62, 0);
    const leftPants = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.36, 0.20), matPants);
    leftPants.position.set(0, -0.18, 0);
    leftLegGroup.add(leftPants);
    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.26), matBoots);
    leftBoot.position.set(0, -0.46, 0.02);
    leftLegGroup.add(leftBoot);
    root.add(leftLegGroup);

    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.16, 0.62, 0);
    const rightPants = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.36, 0.20), matPants);
    rightPants.position.set(0, -0.18, 0);
    rightLegGroup.add(rightPants);
    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.26), matBoots);
    rightBoot.position.set(0, -0.46, 0.02);
    rightLegGroup.add(rightBoot);
    root.add(rightLegGroup);

    // 5. Contact Drop Shadow
    const shadowGeo = new THREE.CircleGeometry(0.65, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    root.add(shadowMesh);

    // Rig storage
    root.userData.rig = {
      headGroup,
      torsoGroup,
      leftArmGroup,
      rightArmGroup,
      rightHand,
      weaponHolder,
      weaponMat: wepMat,
      weaponAuraMesh,
      weaponAuraMat,
      leftLegGroup,
      rightLegGroup,
      capeMesh,
      hairTail,
      floatingGear,
      floatingGearBaseY: 0.10,
      baseTorsoY: 0.94,
      baseHeadY: 1.48,
      walkCycle: Math.random() * Math.PI * 2,
      combatAction: null,
      preset
    };

    return root;
  }

  // --- Procedural Chibi Animation & Full-Body Combat Choreography Controller ---
  const _camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _uprightQuat = new THREE.Quaternion();
  const _worldUpVec = new THREE.Vector3(0, 1, 0);

  function alignUprightBillboard(mesh) {
    if (!camera || !mesh) return;
    _camEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    _uprightQuat.setFromAxisAngle(_worldUpVec, _camEuler.y);
    if (mesh.parent) {
      mesh.quaternion.copy(mesh.parent.quaternion).invert().multiply(_uprightQuat);
    } else {
      mesh.quaternion.copy(_uprightQuat);
    }
  }

  function animateRig(rig, isMoving, delta, now) {
    if (!rig) return;

    if (rig.type === 'pixel_sprite' || rig.type === 'adventurer_sprite') {
      // 1. Determine direction from player rotation or parent mesh rotation
      const rootMesh = rig.mesh ? rig.mesh.parent : null;
      let rot = (rootMesh === myMesh) ? myPlayer.rot : (rootMesh ? rootMesh.rotation.y : 0);

      // Normalize rotation angle to [-PI, PI]
      let normRot = rot;
      while (normRot > Math.PI) normRot -= Math.PI * 2;
      while (normRot < -Math.PI) normRot += Math.PI * 2;

      let newFacing = rig.facing || 'south';
      if (isMoving || rig.combatAction || (activeSkillAimState && rootMesh === myMesh)) {
        if (normRot >= -Math.PI * 0.125 && normRot <= Math.PI * 0.125) {
          newFacing = 'south';
        } else if (normRot > Math.PI * 0.125 && normRot <= Math.PI * 0.375) {
          newFacing = 'south-east';
        } else if (normRot > Math.PI * 0.375 && normRot <= Math.PI * 0.625) {
          newFacing = 'east';
        } else if (normRot > Math.PI * 0.625 && normRot <= Math.PI * 0.875) {
          newFacing = 'north-east';
        } else if (normRot > -Math.PI * 0.375 && normRot < -Math.PI * 0.125) {
          newFacing = 'south-west';
        } else if (normRot >= -Math.PI * 0.625 && normRot <= -Math.PI * 0.375) {
          newFacing = 'west';
        } else if (normRot >= -Math.PI * 0.875 && normRot < -Math.PI * 0.625) {
          newFacing = 'north-west';
        } else {
          newFacing = 'north';
        }
      }
      rig.facing = newFacing;

      // 2. Determine Action
      let action = 'idle';
      if (rig.combatAction) {
        const elapsed = now - rig.combatAction.startTime;
        if (elapsed < rig.combatAction.duration) {
          const act = rig.combatAction.type;
          action = (act === 'combo2' || act === 'heavy' || act === 'burst') ? 'attack2' : 'attack';
        } else {
          rig.combatAction = null;
        }
      } else if (isMoving) {
        action = 'run';
      }

      // 3. Switch Texture Strip if Action or Direction Changed
      let animKey = `${action}_${rig.facing}`;
      if (!rig.animTextures[animKey]) {
        if (rig.facing === 'down' || rig.facing === 'south') animKey = `${action}_south`;
        else if (rig.facing === 'up' || rig.facing === 'north') animKey = `${action}_north`;
        else if (rig.facing === 'left' || rig.facing === 'west') animKey = `${action}_west`;
        else if (rig.facing === 'right' || rig.facing === 'east') animKey = `${action}_east`;
        else animKey = `${action}_south`;
      }

      const totalFrames = typeof getCharacterFrameCount === 'function' ? 
        getCharacterFrameCount(rig.charId || 'erkek', action, rig.facing) : 8;

      if (rig.currentKey !== animKey) {
        rig.currentKey = animKey;
        rig.frameIndex = 0;
        rig.frameTimer = 0;
        const tex = rig.animTextures[animKey];
        if (tex) {
          tex.repeat.set(1 / totalFrames, 1);
          tex.offset.x = 0;
          rig.material.map = tex;
          rig.material.needsUpdate = true;
        }
      }

      // 4. Advance Frame Animation
      const fps = (action.startsWith('attack') ? 14 : (action === 'run' ? 12 : 8));
      rig.frameTimer += delta;
      if (rig.frameTimer >= 1 / fps) {
        rig.frameTimer -= 1 / fps;
        rig.frameIndex = (rig.frameIndex + 1) % totalFrames;
        const curTex = rig.animTextures[rig.currentKey];
        if (curTex) {
          curTex.repeat.set(1 / totalFrames, 1);
          curTex.offset.x = rig.frameIndex / totalFrames;
        }
      }

      // 5. Upright Cylindrical Billboard Alignment (Y-axis only; sprite never slants/leans into ground, bridge, or walls)
      alignUprightBillboard(rig.mesh);

      return;
    }

    // 1. Base Walk / Idle Lower & Upper Body Motion
    if (isMoving) {
      rig.walkCycle += delta * 12.0;
      const s = Math.sin(rig.walkCycle);

      rig.leftLegGroup.rotation.x = s * 0.75;
      rig.rightLegGroup.rotation.x = -s * 0.75;

      rig.leftArmGroup.rotation.x = -s * 0.62;
      rig.rightArmGroup.rotation.x = s * 0.62;
      rig.rightArmGroup.rotation.z = 0;
      rig.rightArmGroup.rotation.y = 0;

      const strideBob = Math.abs(s) * 0.068;
      rig.torsoGroup.position.y = rig.baseTorsoY + strideBob;
      rig.torsoGroup.rotation.x = 0.08;
      rig.torsoGroup.rotation.y = s * 0.12;
      rig.headGroup.position.y = rig.baseHeadY + strideBob;
      rig.headGroup.rotation.z = s * 0.035;

      if (rig.capeMesh) {
        rig.capeMesh.rotation.x = 0.38 + Math.abs(s) * 0.28;
        rig.capeMesh.rotation.z = Math.sin(rig.walkCycle * 0.5) * 0.06;
      }
      if (rig.hairTail) {
        rig.hairTail.rotation.x = 0.38 + Math.abs(s) * 0.25;
        rig.hairTail.rotation.z = Math.sin(rig.walkCycle * 0.5) * 0.08;
      }
    } else {
      rig.leftLegGroup.rotation.x += (0 - rig.leftLegGroup.rotation.x) * 0.22;
      rig.rightLegGroup.rotation.x += (0 - rig.rightLegGroup.rotation.x) * 0.22;
      rig.leftArmGroup.rotation.x += (0 - rig.leftArmGroup.rotation.x) * 0.22;
      rig.rightArmGroup.rotation.x += (-0.15 - rig.rightArmGroup.rotation.x) * 0.22;
      rig.rightArmGroup.rotation.z += (-0.08 - rig.rightArmGroup.rotation.z) * 0.22;
      rig.rightArmGroup.rotation.y += (0 - rig.rightArmGroup.rotation.y) * 0.22;
      rig.torsoGroup.rotation.x += (0 - rig.torsoGroup.rotation.x) * 0.22;
      rig.torsoGroup.rotation.y += (0 - rig.torsoGroup.rotation.y) * 0.22;
      rig.headGroup.rotation.z += (0 - rig.headGroup.rotation.z) * 0.15;

      const breath = Math.sin(now * 0.0035);
      rig.torsoGroup.position.y = rig.baseTorsoY + breath * 0.018;
      rig.headGroup.position.y = rig.baseHeadY + breath * 0.022;

      if (rig.capeMesh) {
        rig.capeMesh.rotation.x = 0.12 + Math.sin(now * 0.0028) * 0.06;
        rig.capeMesh.rotation.z = Math.cos(now * 0.0022) * 0.03;
      }
      if (rig.hairTail) {
        rig.hairTail.rotation.x = 0.16 + Math.sin(now * 0.0028) * 0.04;
      }
    }

    // Default weapon aura fade out when idle
    if (rig.weaponAuraMat && !rig.combatAction && (!activeSkillAimState || myMesh?.userData?.rig !== rig)) {
      rig.weaponAuraMat.opacity += (0 - rig.weaponAuraMat.opacity) * 0.25;
      rig.weaponHolder.scale.set(1, 1, 1);
    }

    // 1.5 Skillshot Hold-to-Aim Coiled Martial Stance (Local Player holding R, E, or Q)
    if (activeSkillAimState && myMesh && myMesh.userData && myMesh.userData.rig === rig && !rig.combatAction) {
      const pulse = 0.5 + Math.sin(now * 0.014) * 0.5;
      const elemMeta = ELEMENT_META[getActivePlayerElement()] || ELEMENT_META.Pyro;
      rig.torsoGroup.position.y = rig.baseTorsoY - 0.06;
      rig.headGroup.position.y = rig.baseHeadY - 0.06;
      rig.torsoGroup.rotation.y = -0.58;
      rig.torsoGroup.rotation.x = 0.16;
      rig.leftArmGroup.rotation.x = -1.45;
      rig.leftArmGroup.rotation.z = 0.25;
      rig.rightArmGroup.rotation.x = -0.85 - pulse * 0.25;
      rig.rightArmGroup.rotation.z = -0.75;
      if (rig.capeMesh) rig.capeMesh.rotation.x = 0.55 + pulse * 0.2;
      if (rig.weaponAuraMat) {
        rig.weaponAuraMat.color.setHex(elemMeta.color);
        rig.weaponAuraMat.opacity = 0.55 + pulse * 0.35;
        const s = 1.2 + pulse * 0.25;
        rig.weaponHolder.scale.set(s, s, s);
      }
    }

    // 2. Full-Body Multi-Phase Combat Choreography Override
    if (rig.combatAction) {
      const elapsed = now - rig.combatAction.startTime;
      const p = Math.min(1.0, elapsed / rig.combatAction.duration);
      const easeOut = 1 - Math.pow(1 - p, 3);
      const act = rig.combatAction.type;
      const elemMeta = ELEMENT_META[getActivePlayerElement()] || ELEMENT_META.Pyro;

      if (act === 'combo1') {
        // Horizontal Right-to-Left Wide Slash
        rig.torsoGroup.rotation.y = -0.65 + easeOut * 1.35;
        rig.torsoGroup.rotation.x = 0.18;
        rig.rightArmGroup.rotation.x = -1.55;
        rig.rightArmGroup.rotation.z = -1.05 + easeOut * 1.95;
        rig.leftArmGroup.rotation.x = -0.5;
      } else if (act === 'combo2') {
        // Diagonal Left-to-Right Cross Cleave
        rig.torsoGroup.rotation.y = 0.72 - easeOut * 1.45;
        rig.torsoGroup.rotation.x = 0.22;
        rig.rightArmGroup.rotation.x = -2.15 + easeOut * 1.55;
        rig.rightArmGroup.rotation.z = 0.82 - easeOut * 1.55;
        rig.leftArmGroup.rotation.x = -0.7;
      } else if (act === 'combo3') {
        // 360° Whirlwind Spin Slash
        const spinAngle = easeOut * Math.PI * 2;
        rig.torsoGroup.rotation.y = spinAngle;
        rig.rightArmGroup.rotation.x = -1.55;
        rig.rightArmGroup.rotation.z = -0.85;
        rig.leftArmGroup.rotation.x = -1.35;
        rig.leftArmGroup.rotation.z = 0.75;
        if (rig.capeMesh) rig.capeMesh.rotation.x = 0.95;
      } else if (act === 'combo4') {
        // Airborne Leap + Overhead Ground Slam Finisher
        const jumpArc = Math.sin(p * Math.PI) * 0.56;
        rig.torsoGroup.position.y = rig.baseTorsoY + jumpArc;
        rig.headGroup.position.y = rig.baseHeadY + jumpArc;
        rig.torsoGroup.rotation.x = p < 0.45 ? -0.28 : 0.44;
        rig.torsoGroup.rotation.y = 0;
        rig.rightArmGroup.rotation.x = p < 0.45 ? -2.75 : (-2.75 + ((p - 0.45) / 0.55) * 2.45);
        rig.rightArmGroup.rotation.z = -0.15;
        rig.leftArmGroup.rotation.x = p < 0.45 ? -2.2 : -0.4;
      } else if (act === 'heavy') {
        // [R] Piercing Crescent Wave Choreography:
        // Phase 1 (0..0.24): Coiled Back-Windup | Phase 2 (0.24..0.74): 360° Whip-Slash | Phase 3: Follow-through
        if (rig.weaponAuraMat) {
          rig.weaponAuraMat.color.setHex(elemMeta.color);
          rig.weaponAuraMat.opacity = 0.85 * (1 - p * 0.5);
          rig.weaponHolder.scale.set(1.45, 1.65, 1.45);
        }
        if (p < 0.24) {
          const wp = p / 0.24;
          rig.torsoGroup.rotation.y = -wp * 1.15;
          rig.torsoGroup.rotation.x = -0.12 * wp;
          rig.rightArmGroup.rotation.x = -1.55;
          rig.rightArmGroup.rotation.z = -1.25 * wp;
          rig.leftArmGroup.rotation.x = -1.1 * wp;
        } else if (p < 0.74) {
          const sp = (p - 0.24) / 0.50;
          const spEase = 1 - Math.pow(1 - sp, 3);
          const hop = Math.sin(sp * Math.PI) * 0.34;
          rig.torsoGroup.position.y = rig.baseTorsoY + hop;
          rig.headGroup.position.y = rig.baseHeadY + hop;
          rig.torsoGroup.rotation.y = -1.15 + spEase * (Math.PI * 2 + 1.45);
          rig.torsoGroup.rotation.x = 0.34;
          rig.rightArmGroup.rotation.x = -1.55;
          rig.rightArmGroup.rotation.z = -1.25 + spEase * 2.35;
          rig.leftArmGroup.rotation.x = -1.35;
          rig.leftArmGroup.rotation.z = 0.85;
          if (rig.capeMesh) rig.capeMesh.rotation.x = 1.15;
        } else {
          const fp = (p - 0.74) / 0.26;
          rig.torsoGroup.rotation.y = 0.30 * (1 - fp);
          rig.torsoGroup.rotation.x = 0.34 * (1 - fp);
          rig.rightArmGroup.rotation.x = -1.55 * (1 - fp);
          rig.rightArmGroup.rotation.z = 1.10 * (1 - fp);
        }
      } else if (act === 'dash') {
        // Aerodynamic Forward Dash Lean
        rig.torsoGroup.rotation.x = 0.54;
        rig.headGroup.rotation.x = -0.25;
        rig.leftArmGroup.rotation.x = 0.88;
        rig.rightArmGroup.rotation.x = 0.88;
        if (rig.capeMesh) rig.capeMesh.rotation.x = 1.15;
      } else if (act === 'skill') {
        // [E] Acrobatic Aerial Spin-Vault & Elemental Skillshot Hurl!
        const jumpArc = Math.sin(p * Math.PI) * 0.78;
        rig.torsoGroup.position.y = rig.baseTorsoY + jumpArc;
        rig.headGroup.position.y = rig.baseHeadY + jumpArc;
        if (rig.weaponAuraMat) {
          rig.weaponAuraMat.color.setHex(elemMeta.color);
          rig.weaponAuraMat.opacity = 0.9 * (1 - p * 0.4);
          rig.weaponHolder.scale.set(1.5, 1.75, 1.5);
        }
        if (p < 0.25) {
          const wp = p / 0.25;
          rig.torsoGroup.rotation.y = -0.85 * wp;
          rig.torsoGroup.rotation.x = -0.25 * wp;
          rig.rightArmGroup.rotation.x = -2.45 * wp;
          rig.leftArmGroup.rotation.x = -1.85 * wp;
        } else if (p < 0.72) {
          const sp = (p - 0.25) / 0.47;
          const spEase = 1 - Math.pow(1 - sp, 3);
          rig.torsoGroup.rotation.y = -0.85 + spEase * (Math.PI * 2 + 1.15);
          rig.torsoGroup.rotation.x = -0.25 + spEase * 0.70;
          rig.rightArmGroup.rotation.x = -2.45 + spEase * 1.95;
          rig.rightArmGroup.rotation.z = -0.85 + spEase * 1.65;
          rig.leftArmGroup.rotation.x = -1.65;
          rig.leftArmGroup.rotation.z = 0.75;
          rig.leftLegGroup.rotation.x = -0.65;
          rig.rightLegGroup.rotation.x = 0.55;
          if (rig.capeMesh) rig.capeMesh.rotation.x = 1.25;
        } else {
          const fp = (p - 0.72) / 0.28;
          rig.torsoGroup.rotation.y = 0.30 * (1 - fp);
          rig.torsoGroup.rotation.x = 0.45 * (1 - fp);
          rig.rightArmGroup.rotation.x = -0.50 * (1 - fp);
          rig.rightArmGroup.rotation.z = 0.80 * (1 - fp);
        }
      } else if (act === 'burst') {
        // [Q] Celestial Ascension -> Overhead Charge -> Cataclysmic Cleave!
        const lift = Math.sin(p * Math.PI) * 1.18;
        rig.torsoGroup.position.y = rig.baseTorsoY + lift;
        rig.headGroup.position.y = rig.baseHeadY + lift;
        if (rig.weaponAuraMat) {
          rig.weaponAuraMat.color.setHex(elemMeta.color);
          rig.weaponAuraMat.opacity = 0.98 * (1 - p * 0.3);
          rig.weaponHolder.scale.set(1.9, 2.35, 1.9);
        }
        if (p < 0.38) {
          // Ascending Charge with Weapon Raised to the Heavens
          const cp = p / 0.38;
          rig.torsoGroup.rotation.x = -0.32 * cp;
          rig.torsoGroup.rotation.y = Math.sin(cp * Math.PI * 2) * 0.35;
          rig.headGroup.rotation.x = -0.28 * cp;
          rig.rightArmGroup.rotation.x = -2.95 * cp;
          rig.rightArmGroup.rotation.z = -0.25 * cp;
          rig.leftArmGroup.rotation.x = -2.75 * cp;
          rig.leftArmGroup.rotation.z = 0.35 * cp;
          rig.leftLegGroup.rotation.x = 0.35 * cp;
          rig.rightLegGroup.rotation.x = -0.25 * cp;
          if (rig.capeMesh) rig.capeMesh.rotation.x = 1.38;
        } else if (p < 0.76) {
          // Cataclysmic Downward Two-Handed Slash!
          const sp = (p - 0.38) / 0.38;
          const spEase = 1 - Math.pow(1 - sp, 4);
          rig.torsoGroup.rotation.x = -0.32 + spEase * 0.88;
          rig.torsoGroup.rotation.y = -0.45 + spEase * 0.95;
          rig.headGroup.rotation.x = 0.15;
          rig.rightArmGroup.rotation.x = -2.95 + spEase * 3.25;
          rig.rightArmGroup.rotation.z = -0.25 + spEase * 0.55;
          rig.leftArmGroup.rotation.x = -2.75 + spEase * 2.35;
          if (rig.capeMesh) rig.capeMesh.rotation.x = 1.45;
        } else {
          const fp = (p - 0.76) / 0.24;
          rig.torsoGroup.rotation.x = 0.56 * (1 - fp);
          rig.torsoGroup.rotation.y = 0.50 * (1 - fp);
          rig.rightArmGroup.rotation.x = 0.30 * (1 - fp);
          rig.leftArmGroup.rotation.x = -0.40 * (1 - fp);
        }
      }

      if (p >= 1.0) {
        rig.combatAction = null;
        rig.headGroup.rotation.x = 0;
        rig.leftArmGroup.rotation.z = 0;
        rig.rightArmGroup.rotation.z = 0;
        if (rig.weaponHolder) rig.weaponHolder.scale.set(1, 1, 1);
      }
    }

    // Floating gear rotation
    if (rig.floatingGear) {
      rig.floatingGear.rotation.y += 0.035;
      rig.floatingGear.position.y = rig.floatingGearBaseY + Math.sin(now * 0.004) * 0.05;
    }
  }

  // Legacy fallback texture generator
  function createAvatarTexture(paletteIndex = 0, frame = 0) {
    const p = AVATAR_PRESETS[paletteIndex % AVATAR_PRESETS.length];
    const cvs = document.createElement('canvas');
    cvs.width = 48;
    cvs.height = 48;
    drawAvatarPreviewPortrait(cvs, p);
    const texture = new THREE.CanvasTexture(cvs);
    return texture;
  }

  // --- 2. 3D Overhead Billboard Helpers (Nametag & Speech Bubble) ---
  function createNametagCanvas(username, isGuest, primogems = 0, gearScore = 0, level = 1) {
    const cvs = document.createElement('canvas');
    cvs.width = 280;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // Background capsule
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 264, 48, 14);
    ctx.fill();

    // Border: Tier colored based on GearScore
    let borderCol = isGuest ? '#64748b' : '#53fc18';
    if (gearScore >= 2000) borderCol = '#eab308'; // Legendary Gold
    else if (gearScore >= 1000) borderCol = '#a855f7'; // Epic Purple
    else if (gearScore >= 500) borderCol = '#38bdf8'; // Rare Blue
    else if (gearScore >= 200) borderCol = '#22c55e'; // Uncommon Green

    ctx.lineWidth = 3;
    ctx.strokeStyle = borderCol;
    ctx.stroke();

    // Text: [GS XXX] Name
    ctx.font = 'bold 20px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    const gsTag = gearScore > 0 ? `[GS ${gearScore}] ` : '';
    const nameStr = isGuest ? username : `⚡ ${username}`;
    ctx.fillText(`${gsTag}${nameStr}`, 140, 32);

    const texture = new THREE.CanvasTexture(cvs);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function createSpeechBubbleCanvas(text) {
    const cvs = document.createElement('canvas');
    cvs.width = 320;
    cvs.height = 110;
    const ctx = cvs.getContext('2d');

    // Bubble box
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(10, 10, 300, 72, 16);
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(150, 82);
    ctx.lineTo(160, 100);
    ctx.lineTo(170, 82);
    ctx.fill();

    // Text with wrapping
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const display = text.length > 32 ? text.slice(0, 30) + '...' : text;
    ctx.fillText(display, 160, 46);

    const texture = new THREE.CanvasTexture(cvs);
    return texture;
  }

  // --- Texture & Visual Helpers ---
  const textureLoader = new THREE.TextureLoader();

  function loadPixelTexture(url) {
    const tex = textureLoader.load(url);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  // =========================================================
  // Lush Realistic Anime Grass & Atmospheric Flora Engine
  // =========================================================

  const grassWindUniforms = {
    uGrassTime: { value: 0 }
  };

  let windAtmosphereParticles = null;
  let windAtmosphereData = [];

  function applyGrassWindShader(material) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = grassWindUniforms.uGrassTime;
      shader.vertexShader = `
        uniform float uGrassTime;
        ${shader.vertexShader}
      `;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Organic wind sway for curved grass blades: roots remain firmly pinned
        float bladeH = transformed.y;
        if (bladeH > 0.04) {
          #ifdef USE_INSTANCING
            vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #else
            vec4 worldOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          float waveA = sin(uGrassTime * 2.3 + worldOrigin.x * 0.35 + worldOrigin.z * 0.4);
          float waveB = cos(uGrassTime * 1.5 + worldOrigin.x * 0.22 - worldOrigin.z * 0.28);
          float sway = (bladeH * bladeH) * 0.45;
          transformed.x += (waveA + waveB * 0.35) * sway * 0.26;
          transformed.z += (waveB - waveA * 0.3) * sway * 0.22;
        }
        `
      );
    };
  }

  function createRealisticGrassTuftGeometry() {
    const geo = new THREE.BufferGeometry();
    const bladeCount = 5;
    const vertsPerBlade = 6;
    
    const positions = new Float32Array(bladeCount * vertsPerBlade * 3);
    const normals = new Float32Array(bladeCount * vertsPerBlade * 3);
    const colors = new Float32Array(bladeCount * vertsPerBlade * 3);
    const indices = [];

    // Root -> Mid -> Tip vertex color gradient (dark emerald root to sunlit lime tips)
    const rootCol = [0.06, 0.24, 0.11];
    const midCol = [0.17, 0.56, 0.23];
    const tipCol = [0.44, 0.86, 0.30];

    const angles = [0.12, 1.38, 2.62, 3.88, 5.14];

    for (let b = 0; b < bladeCount; b++) {
      const baseIdx = b * vertsPerBlade;
      const angle = angles[b] + (Math.random() - 0.5) * 0.25;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const perpCos = -sinA;
      const perpSin = cosA;

      const bladeHeight = 0.54 + Math.random() * 0.16;
      const midHeight = bladeHeight * 0.52;
      const curveAmount = 0.12 + Math.random() * 0.06;

      const baseWidth = 0.065;
      const midWidth = 0.045;
      const tipWidth = 0.012;

      // Root (y = 0)
      const v0x = -perpCos * baseWidth;
      const v0z = -perpSin * baseWidth;
      const v1x = perpCos * baseWidth;
      const v1z = perpSin * baseWidth;

      // Mid (y = midHeight)
      const midOutX = cosA * (curveAmount * 0.45);
      const midOutZ = sinA * (curveAmount * 0.45);
      const v2x = midOutX - perpCos * midWidth;
      const v2z = midOutZ - perpSin * midWidth;
      const v3x = midOutX + perpCos * midWidth;
      const v3z = midOutZ + perpSin * midWidth;

      // Tip (y = bladeHeight)
      const tipOutX = cosA * curveAmount;
      const tipOutZ = sinA * curveAmount;
      const v4x = tipOutX - perpCos * tipWidth;
      const v4z = tipOutZ - perpSin * tipWidth;
      const v5x = tipOutX + perpCos * tipWidth;
      const v5z = tipOutZ + perpSin * tipWidth;

      const bladePositions = [
        v0x, 0, v0z,
        v1x, 0, v1z,
        v2x, midHeight, v2z,
        v3x, midHeight, v3z,
        v4x, bladeHeight, v4z,
        v5x, bladeHeight, v5z
      ];

      for (let i = 0; i < 18; i++) {
        positions[baseIdx * 3 + i] = bladePositions[i];
      }

      // Soft upward normals for anime-style lush lighting
      for (let v = 0; v < vertsPerBlade; v++) {
        normals[(baseIdx + v) * 3] = cosA * 0.15;
        normals[(baseIdx + v) * 3 + 1] = 0.96;
        normals[(baseIdx + v) * 3 + 2] = sinA * 0.15;
      }

      // Vertex color gradient
      for (let k = 0; k < 2; k++) {
        colors[(baseIdx + k) * 3] = rootCol[0];
        colors[(baseIdx + k) * 3 + 1] = rootCol[1];
        colors[(baseIdx + k) * 3 + 2] = rootCol[2];

        colors[(baseIdx + 2 + k) * 3] = midCol[0];
        colors[(baseIdx + 2 + k) * 3 + 1] = midCol[1];
        colors[(baseIdx + 2 + k) * 3 + 2] = midCol[2];

        colors[(baseIdx + 4 + k) * 3] = tipCol[0];
        colors[(baseIdx + 4 + k) * 3 + 1] = tipCol[1];
        colors[(baseIdx + 4 + k) * 3 + 2] = tipCol[2];
      }

      // 4 triangles per blade
      indices.push(
        baseIdx + 0, baseIdx + 1, baseIdx + 2,
        baseIdx + 2, baseIdx + 1, baseIdx + 3,
        baseIdx + 2, baseIdx + 3, baseIdx + 4,
        baseIdx + 4, baseIdx + 3, baseIdx + 5
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return geo;
  }

  function createProceduralGrassTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 512;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // 1. Lush multi-layered gradient base
    const baseGrad = ctx.createLinearGradient(0, 0, 512, 512);
    baseGrad.addColorStop(0, '#1b4332');
    baseGrad.addColorStop(0.35, '#2d6a4f');
    baseGrad.addColorStop(0.7, '#236b3b');
    baseGrad.addColorStop(1, '#1e5f32');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);

    // 2. Multi-scale organic meadow patches
    const patchColors = ['#1a4329', '#245a38', '#2d6a4f', '#367c55', '#40916c', '#1b4d2c'];
    for (let i = 0; i < 450; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const rad = 14 + Math.random() * 38;
      const pGrad = ctx.createRadialGradient(px, py, 2, px, py, rad);
      const c = patchColors[Math.floor(Math.random() * patchColors.length)];
      pGrad.addColorStop(0, c);
      pGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Fine painterly grass blade strokes
    const bladeTones = ['#2d6a4f', '#347a54', '#40916c', '#489d75', '#52b788', '#235e3a', '#74c69d'];
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 16000; i++) {
      const bx = Math.random() * 512;
      const by = Math.random() * 512;
      const len = 4 + Math.random() * 8;
      const lean = (Math.random() - 0.5) * 4;
      ctx.strokeStyle = bladeTones[i % bladeTones.length];
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + lean, by - len);
      ctx.stroke();
    }

    // 4. Little clover clusters
    ctx.fillStyle = '#52b788';
    for (let i = 0; i < 160; i++) {
      const cx = Math.random() * 500 + 6;
      const cy = Math.random() * 500 + 6;
      for (let leaf = 0; leaf < 3; leaf++) {
        const la = (leaf * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(la) * 3.5, cy + Math.sin(la) * 3.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Delicate subtle pastel wildflower specks
    const flowerPalette = ['#fef08a', '#ffffff', '#f472b6', '#c084fc', '#67e8f9', '#fbbf24'];
    for (let i = 0; i < 90; i++) {
      const fx = Math.random() * 512;
      const fy = Math.random() * 512;
      ctx.fillStyle = flowerPalette[i % flowerPalette.length];
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8 + Math.random() * 1.4, 0, Math.PI * 2);
      ctx.fill();
      if (i % 3 === 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(fx, fy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  function createProceduralGrassNormalMap() {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 256;
    const ctx = cvs.getContext('2d');

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 3500; i++) {
      const nx = Math.random() * 256;
      const ny = Math.random() * 256;
      const r = Math.floor(120 + Math.random() * 20);
      const g = Math.floor(120 + Math.random() * 20);
      ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
      ctx.fillRect(nx, ny, 1 + Math.random() * 2, 3 + Math.random() * 4);
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  function createProceduralSandTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 512;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // 1. Warm Ochre Arena Sand base
    const baseGrad = ctx.createLinearGradient(0, 0, 512, 512);
    baseGrad.addColorStop(0, '#b45309');
    baseGrad.addColorStop(0.35, '#d97706');
    baseGrad.addColorStop(0.7, '#f59e0b');
    baseGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);

    // 2. Sand grain variations & wind ripples
    const patchColors = ['#92400e', '#78350f', '#b45309', '#d97706', '#f59e0b', '#fbbf24'];
    for (let i = 0; i < 400; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const rad = 10 + Math.random() * 32;
      const pGrad = ctx.createRadialGradient(px, py, 2, px, py, rad);
      const c = patchColors[Math.floor(Math.random() * patchColors.length)];
      pGrad.addColorStop(0, c);
      pGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Fine granular arena specks
    const grainTones = ['#451a03', '#78350f', '#fde68a', '#fef3c7', '#d97706'];
    for (let i = 0; i < 18000; i++) {
      const gx = Math.random() * 512;
      const gy = Math.random() * 512;
      ctx.fillStyle = grainTones[i % grainTones.length];
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  const cobbleTextureCache = {};
  function createProceduralCobbleTexture(repeatX = 2, repeatY = 11) {
    const key = `${repeatX}_${repeatY}`;
    if (!cobbleTextureCache[key]) {
      const tex = textureLoader.load('/assets/world/road_cobble.png');
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.generateMipmaps = true;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      cobbleTextureCache[key] = tex;
    }
    return cobbleTextureCache[key];
  }

  const cobbleBumpCache = {};
  function createProceduralCobbleBumpMap(repeatX = 2, repeatY = 11) {
    const key = `${repeatX}_${repeatY}`;
    if (!cobbleBumpCache[key]) {
      const tex = textureLoader.load('/assets/world/road_cobble_bump.png');
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.generateMipmaps = true;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      cobbleBumpCache[key] = tex;
    }
    return cobbleBumpCache[key];
  }

  function createProceduralWaterTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, 64, 64);

    const blues = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#0369a1'];
    for (let y = 0; y < 64; y += 4) {
      const offset = Math.floor(Math.sin(y * 0.4) * 6);
      for (let x = 0; x < 64; x += 6) {
        ctx.fillStyle = blues[(x + y) % blues.length];
        ctx.fillRect((x + offset) % 64, y, 4, 2);
      }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 2);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  // --- 3. Three.js Scene & Centralized Atmosphere Manager ---
  function createSkyGradientTexture(topHex, midHex, bottomHex) {
    const cvs = document.createElement('canvas');
    cvs.width = 16;
    cvs.height = 128;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, topHex);
    grad.addColorStop(0.55, midHex);
    grad.addColorStop(1, bottomHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 128);
    const tex = new THREE.CanvasTexture(cvs);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function setMapAtmosphere(mapKey) {
    if (!scene) return;
    const themes = {
      town: {
        bg: 0x38bdf8,
        fogColor: 0xbae6fd,
        fogNear: 110,
        fogFar: 260,
        skyTop: '#0284c7',
        skyMid: '#38bdf8',
        skyBot: '#fed7aa',
        ambColor: 0xffedd5,
        ambInt: 0.86,
        hemiSky: 0xfde68a,
        hemiGround: 0x365314,
        hemiInt: 0.38,
        sunColor: 0xfff4db,
        sunInt: 0.95
      },
      interior: {
        bg: 0x090d16,
        fogColor: null,
        fogNear: 100,
        fogFar: 250,
        skyTop: '#050811',
        skyMid: '#0f172a',
        skyBot: '#1e293b',
        ambColor: 0xfff7ed,
        ambInt: 0.82,
        hemiSky: 0xfde68a,
        hemiGround: 0x451a03,
        hemiInt: 0.30,
        sunColor: 0xfde047,
        sunInt: 0.65
      },
      battle_zone_1: {
        bg: 0x052e1f,
        fogColor: 0x064e3b,
        fogNear: 68,
        fogFar: 165,
        skyTop: '#021810',
        skyMid: '#064e3b',
        skyBot: '#10b981',
        ambColor: 0xecfdf5,
        ambInt: 0.72,
        hemiSky: 0x34d399,
        hemiGround: 0x064e3b,
        hemiInt: 0.42,
        sunColor: 0xd1fae5,
        sunInt: 0.88
      },
      battle_zone_2: {
        bg: 0x220707,
        fogColor: 0x450a0a,
        fogNear: 68,
        fogFar: 165,
        skyTop: '#110303',
        skyMid: '#450a0a',
        skyBot: '#ea580c',
        ambColor: 0xffedd5,
        ambInt: 0.70,
        hemiSky: 0xf97316,
        hemiGround: 0x450a0a,
        hemiInt: 0.42,
        sunColor: 0xfdba74,
        sunInt: 0.90
      },
      battle_zone_3: {
        bg: 0x070a24,
        fogColor: 0x1e1b4b,
        fogNear: 68,
        fogFar: 165,
        skyTop: '#030514',
        skyMid: '#1e1b4b',
        skyBot: '#4c1d95',
        ambColor: 0xe0e7ff,
        ambInt: 0.72,
        hemiSky: 0x818cf8,
        hemiGround: 0x1e1b4b,
        hemiInt: 0.45,
        sunColor: 0xd8b4fe,
        sunInt: 0.88
      },
      dungeon_tier_1: {
        bg: 0x061b2e,
        fogColor: 0x0c4a6e,
        fogNear: 85,
        fogFar: 210,
        skyTop: '#030e1c',
        skyMid: '#075985',
        skyBot: '#38bdf8',
        ambColor: 0xe0f2fe,
        ambInt: 0.78,
        hemiSky: 0x38bdf8,
        hemiGround: 0x0c4a6e,
        hemiInt: 0.45,
        sunColor: 0xbae6fd,
        sunInt: 0.90
      },
      dungeon_tier_2: {
        bg: 0x13072e,
        fogColor: 0x3b0764,
        fogNear: 85,
        fogFar: 210,
        skyTop: '#080316',
        skyMid: '#3b0764',
        skyBot: '#9333ea',
        ambColor: 0xf3e8ff,
        ambInt: 0.76,
        hemiSky: 0xc084fc,
        hemiGround: 0x2e1065,
        hemiInt: 0.46,
        sunColor: 0xe9d5ff,
        sunInt: 0.90
      },
      dungeon_tier_3: {
        bg: 0x23050a,
        fogColor: 0x450a0a,
        fogNear: 85,
        fogFar: 210,
        skyTop: '#0e0204',
        skyMid: '#450a0a',
        skyBot: '#dc2626',
        ambColor: 0xffe4e6,
        ambInt: 0.76,
        hemiSky: 0xf87171,
        hemiGround: 0x450a0a,
        hemiInt: 0.46,
        sunColor: 0xfde047,
        sunInt: 0.92
      },
      pvp_arena: {
        bg: 0x0a0710,
        fogColor: 0x140e18,
        fogNear: 85,
        fogFar: 200,
        skyTop: '#0a0614',
        skyMid: '#240d18',
        skyBot: '#632514',
        ambColor: 0xffedd5,
        ambInt: 0.38,
        hemiSky: 0xf97316,
        hemiGround: 0x181014,
        hemiInt: 0.25,
        sunColor: 0xfbbf24,
        sunInt: 0.50
      }
    };

    const cfg = themes[mapKey] || themes.town;
    scene.background = new THREE.Color(cfg.bg);
    // Push linear fog far beyond the playable area so the village/arena has ZERO hazy washout!
    scene.fog = cfg.fogColor ? new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar) : null;

    if (sceneAmbientLight) {
      sceneAmbientLight.color.setHex(cfg.ambColor);
      sceneAmbientLight.intensity = cfg.ambInt;
    }
    if (sceneHemiLight) {
      sceneHemiLight.color.setHex(cfg.hemiSky);
      sceneHemiLight.groundColor.setHex(cfg.hemiGround);
      sceneHemiLight.intensity = cfg.hemiInt;
    }
    if (sceneSunLight) {
      sceneSunLight.color.setHex(cfg.sunColor);
      sceneSunLight.intensity = cfg.sunInt;
    }
    if (skyDomeMesh && skyDomeMesh.material) {
      skyDomeMesh.material.map = createSkyGradientTexture(cfg.skyTop, cfg.skyMid, cfg.skyBot);
      skyDomeMesh.material.needsUpdate = true;
    }
  }

  function initThree() {
    const container = document.getElementById('game-container');
    const canvas = document.getElementById('world-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0ea5e9);
    scene.fog = new THREE.Fog(0x38bdf8, 95, 220);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Keep LinearEncoding & NoToneMapping in Three.js r128 so hex colors stay 100% rich and vibrant (no double-gamma washout)
    if (THREE.LinearEncoding !== undefined) {
      renderer.outputEncoding = THREE.LinearEncoding;
    }
    if (THREE.NoToneMapping !== undefined) {
      renderer.toneMapping = THREE.NoToneMapping;
    }

    // Stylized Sky Dome
    const skyGeo = new THREE.SphereGeometry(260, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createSkyGradientTexture('#0369a1', '#0ea5e9', '#7dd3fc'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    skyDomeMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyDomeMesh);

    // Centralized Atmospheric Lights (Adjusted per zone via setMapAtmosphere)
    sceneAmbientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(sceneAmbientLight);

    sceneHemiLight = new THREE.HemisphereLight(0xbae6fd, 0x16a34a, 0.35);
    scene.add(sceneHemiLight);

    sceneSunLight = new THREE.DirectionalLight(0xfffbeb, 0.85);
    sceneSunLight.position.set(25, 45, 20);
    sceneSunLight.castShadow = true;
    sceneSunLight.shadow.mapSize.width = 1024;
    sceneSunLight.shadow.mapSize.height = 1024;
    sceneSunLight.shadow.camera.near = 0.5;
    sceneSunLight.shadow.camera.far = 130;
    const d = 38;
    sceneSunLight.shadow.camera.left = -d;
    sceneSunLight.shadow.camera.right = d;
    sceneSunLight.shadow.camera.top = d;
    sceneSunLight.shadow.camera.bottom = -d;
    scene.add(sceneSunLight);

    scene.add(worldObjects);

    // Initial map build
    buildTownMap();

    // Resize event
    window.addEventListener('resize', onWindowResize);

    // Build Avatar selector in modal
    buildAvatarSelector();
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- 4. 3D Stylized Modular Architectural Generators ---

  function createBuildingSign(text, y = 10.0) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 12);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();
    ctx.font = 'bold 20px Nunito, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const signTex = new THREE.CanvasTexture(cvs);
    const signMat = new THREE.SpriteMaterial({ map: signTex });
    const signSprite = new THREE.Sprite(signMat);
    signSprite.scale.set(4.5, 1.12, 1);
    signSprite.position.set(0, y, 0);
    return signSprite;
  }

  // A) Central Landmark Fountain (Human-Scale 5.6m Stylized Landmark with Cascading Basins & Planters)
  function createCentralFountain() {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const terracottaMat = new THREE.MeshLambertMaterial({ color: 0xb45309 });

    // 1. Octagonal Limestone Step Plinth (r: 2.85m -> 2.7m, y: 0.11)
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.22, 24), darkStoneMat);
    plinth.position.y = 0.11;
    plinth.receiveShadow = true;
    group.add(plinth);

    // 2. Main Basin Outer Wall (r: 2.55m -> 2.65m, y: 0.485)
    const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.65, 0.55, 24, 1, true), stoneMat);
    outerWall.position.y = 0.485;
    outerWall.castShadow = true;
    outerWall.receiveShadow = true;
    group.add(outerWall);

    // Basin Inner Wall (BackSide interior lining)
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(2.32, 2.45, 0.55, 24, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x334155, side: THREE.BackSide })
    );
    innerWall.position.y = 0.485;
    group.add(innerWall);

    // 3. Rounded Carved Stone Coping Rim (Torus placed at y = 0.76)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.50, 0.14, 8, 32), stoneMat);
    rim.position.y = 0.76;
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);

    // 4. Basin Sunken Stone Floor (y = 0.18)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    floor.position.y = 0.18;
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // 5. Translucent Cyan Water Surface (at y = 0.54 - safely 0.22m below rim, zero clipping)
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.35, 28), waterMat);
    water.position.y = 0.54;
    water.rotation.x = -Math.PI / 2;
    group.add(water);

    // 6. Tiered Central Monument
    // Step 1: Octagonal Stone Base Pedestal
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.55, 8), darkStoneMat);
    p1.position.y = 0.485;
    p1.castShadow = true;
    group.add(p1);

    // Step 2: Fluted Column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.75, 16), stoneMat);
    col.position.y = 1.125;
    col.castShadow = true;
    group.add(col);

    // Step 3: Mid Scalloped Water Catch Bowl
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.75, 0.35, 20), stoneMat);
    bowl.position.y = 1.65;
    bowl.castShadow = true;
    group.add(bowl);

    // Mid Bowl Water disc
    const midWater = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), waterMat);
    midWater.position.y = 1.80;
    midWater.rotation.x = -Math.PI / 2;
    group.add(midWater);

    // Step 4: Upper Fluted Spire Column
    const upperCol = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.38, 0.65, 12), stoneMat);
    upperCol.position.y = 2.15;
    upperCol.castShadow = true;
    group.add(upperCol);

    // Step 5: Mythic Golden Finial & Spout Topper
    const finialSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), goldMat);
    finialSphere.position.y = 2.62;
    group.add(finialSphere);

    const finialSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.45, 8), goldMat);
    finialSpire.position.y = 2.95;
    group.add(finialSpire);

    // 4 Lion Head Spouts cascading crystal streams into the main basin
    [-0.82, 0.82].forEach(sx => {
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.26), goldMat);
      spout.position.set(sx, 1.65, 0);
      group.add(spout);

      const stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.06, 0.95, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75 })
      );
      stream.position.set(sx * 1.15, 1.18, 0);
      group.add(stream);
    });

    [-0.82, 0.82].forEach(sz => {
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.22), goldMat);
      spout.position.set(0, 1.65, sz);
      group.add(spout);

      const stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.06, 0.95, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75 })
      );
      stream.position.set(0, 1.18, sz * 1.15);
      group.add(stream);
    });

    // 7. 4 Curved Flower Planter Boxes hugging the fountain perimeter between cardinal routes
    const planterAngles = [Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75];
    planterAngles.forEach(ang => {
      const px = Math.cos(ang) * 2.85;
      const pz = Math.sin(ang) * 2.85;

      const pBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.42), terracottaMat);
      pBox.position.set(px, 0.18, pz);
      pBox.rotation.y = -ang + Math.PI / 2;
      pBox.castShadow = true;
      group.add(pBox);

      // Trailing blooming flowers in planter
      const flowerColors = [0xa855f7, 0xf59e0b, 0xf472b6];
      for (let fi = -0.3; fi <= 0.3; fi += 0.25) {
        const fl = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.12),
          new THREE.MeshBasicMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] })
        );
        fl.position.set(px + Math.cos(ang) * 0.05 + Math.sin(ang) * fi, 0.38, pz + Math.sin(ang) * 0.05 - Math.cos(ang) * fi);
        group.add(fl);
      }
    });

    return group;
  }

  // B) Takas Pazarı / Trade Mart
  function createTradeMartBuilding() {
    const group = new THREE.Group();
    const width = 9.5, height = 6.8, depth = 9.0;

    const woodPlankMat = new THREE.MeshLambertMaterial({ color: 0x92400e });
    const darkBeamMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const plasterMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const stoneBaseMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const roofRidgeMat = new THREE.MeshLambertMaterial({ color: 0x0369a1 });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 });
    const awningRedMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    const awningCreamMat = new THREE.MeshLambertMaterial({ color: 0xfef3c7 });

    // 1. Stone Foundation Plinth
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.7, depth + 0.6), stoneBaseMat);
    base.position.y = 0.35;
    base.receiveShadow = true;
    group.add(base);

    // 2. Ground Floor Timber Walls
    const gf = new THREE.Mesh(new THREE.BoxGeometry(width, 2.8, depth), woodPlankMat);
    gf.position.y = 2.1;
    gf.castShadow = true;
    gf.receiveShadow = true;
    group.add(gf);

    // 3. Timber Framing Corner Beams
    const cornerGeo = new THREE.BoxGeometry(0.5, 3.0, 0.5);
    [
      { x: -width/2 + 0.2, z: depth/2 - 0.2 },
      { x: width/2 - 0.2, z: depth/2 - 0.2 },
      { x: -width/2 + 0.2, z: -depth/2 + 0.2 },
      { x: width/2 - 0.2, z: -depth/2 + 0.2 }
    ].forEach(p => {
      const b = new THREE.Mesh(cornerGeo, darkBeamMat);
      b.position.set(p.x, 2.1, p.z);
      b.castShadow = true;
      group.add(b);
    });

    // Middle horizontal belt beam
    const belt = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.35, depth + 0.4), darkBeamMat);
    belt.position.y = 3.5;
    group.add(belt);

    // 4. Second Floor Overhang Jetty (Plaster & Tudor Timber Framing)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 3.0, depth + 0.4), plasterMat);
    upper.position.y = 5.0;
    upper.castShadow = true;
    upper.receiveShadow = true;
    group.add(upper);

    // Upper floor corner posts
    const uCornerGeo = new THREE.BoxGeometry(0.45, 3.0, 0.45);
    [
      { x: -width/2, z: depth/2 },
      { x: width/2, z: depth/2 },
      { x: -width/2, z: -depth/2 },
      { x: width/2, z: -depth/2 }
    ].forEach(p => {
      const b = new THREE.Mesh(uCornerGeo, darkBeamMat);
      b.position.set(p.x, 5.0, p.z);
      group.add(b);
    });

    // Decorative Tudor X-bracing on upper front facade
    [-2.6, 2.6].forEach(fx => {
      const diag1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.1), darkBeamMat);
      diag1.position.set(fx, 5.0, depth/2 + 0.22);
      diag1.rotation.z = 0.55;
      group.add(diag1);

      const diag2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 0.1), darkBeamMat);
      diag2.position.set(fx, 5.0, depth/2 + 0.22);
      diag2.rotation.z = -0.55;
      group.add(diag2);
    });

    // 5. Roof: Sloped Royal Blue Hip Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.88, 3.8, 4), roofMat);
    roof.position.y = 7.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Roof Ridge Beam
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, depth + 0.8), roofRidgeMat);
    ridge.position.set(0, 9.5, 0);
    group.add(ridge);

    // 6. Recessed Double Oak Front Doorway
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.4), darkBeamMat);
    doorFrame.position.set(0, 1.8, depth/2 + 0.1);
    group.add(doorFrame);

    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, 0.2), new THREE.MeshLambertMaterial({ color: 0x5c2b0b }));
    doorLeaf.position.set(0, 1.65, depth/2 + 0.15);
    group.add(doorLeaf);

    // Door Portal indicator (Green glow)
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({
      color: 0x53fc18,
      transparent: true,
      opacity: 0.65
    }));
    portal.position.set(0, 1.65, depth/2 + 0.28);
    group.add(portal);

    // Brass Door Knocker Handles
    [-0.3, 0.3].forEach(hx => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      ring.position.set(hx, 1.7, depth/2 + 0.29);
      group.add(ring);
    });

    // 7. Protruding 3D Bay Windows on Left and Right of Doorway
    [-2.9, 2.9].forEach(wx => {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 0.8), woodPlankMat);
      bay.position.set(wx, 2.1, depth/2 + 0.35);
      bay.castShadow = true;
      group.add(bay);

      const bRoof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 4), roofMat);
      bRoof.position.set(wx, 3.2, depth/2 + 0.35);
      bRoof.rotation.y = Math.PI / 4;
      group.add(bRoof);

      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), glassMat);
      pane.position.set(wx, 2.1, depth/2 + 0.76);
      group.add(pane);

      const hMullion = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.04), darkBeamMat);
      hMullion.position.set(wx, 2.1, depth/2 + 0.78);
      group.add(hMullion);
      const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.04), darkBeamMat);
      vMullion.position.set(wx, 2.1, depth/2 + 0.78);
      group.add(vMullion);

      // Interior wares in window display (potions, coin bags)
      const potColor = wx < 0 ? 0xef4444 : 0x38bdf8;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.32, 6), new THREE.MeshBasicMaterial({ color: potColor }));
      pot.position.set(wx - 0.35, 1.55, depth/2 + 0.55);
      group.add(pot);

      const coinBag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14), new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
      coinBag.position.set(wx + 0.35, 1.5, depth/2 + 0.55);
      group.add(coinBag);
    });

    // 8. Sloped Canvas Merchant Canopy Awning
    const stripeWidth = (width * 0.76) / 6;
    for (let i = 0; i < 6; i++) {
      const sx = -width * 0.38 + stripeWidth * (i + 0.5);
      const sMat = (i % 2 === 0) ? awningRedMat : awningCreamMat;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth * 0.98, 0.12, 2.2), sMat);
      stripe.position.set(sx, 3.8, depth/2 + 1.2);
      stripe.rotation.x = 0.24;
      stripe.castShadow = true;
      group.add(stripe);

      const fringe = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth * 0.98, 0.3, 0.08), sMat);
      fringe.position.set(sx, 3.5, depth/2 + 2.25);
      group.add(fringe);
    }

    // Wooden diagonal support corbels
    [-width * 0.36, width * 0.36].forEach(cx => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0), darkBeamMat);
      strut.position.set(cx, 2.9, depth/2 + 1.1);
      strut.rotation.x = -0.58;
      group.add(strut);
    });

    // 9. Second floor shuttered casement windows
    [-2.2, 0, 2.2].forEach(ux => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), glassMat);
      win.position.set(ux, 5.2, depth/2 + 0.22);
      group.add(win);

      const shutterMat = new THREE.MeshLambertMaterial({ color: 0x166534 });
      const sLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.08), shutterMat);
      sLeft.position.set(ux - 0.75, 5.2, depth/2 + 0.24);
      group.add(sLeft);

      const sRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.08), shutterMat);
      sRight.position.set(ux + 0.75, 5.2, depth/2 + 0.24);
      group.add(sRight);
    });

    // 10. Front Wall Lantern Sconces
    [-1.6, 1.6].forEach(lx => {
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25), glassMat);
      sconce.position.set(lx, 2.5, depth/2 + 0.3);
      group.add(sconce);

      const pLight = new THREE.PointLight(0xfef08a, 0.6, 7, 2);
      pLight.position.set(lx, 2.5, depth/2 + 0.6);
      group.add(pLight);
    });

    // 11. Floating Building Sign
    group.add(createBuildingSign('⚖️ Pazar & Takas', 10.2));

    return group;
  }

  // C) Cat's Tail Taverna
  function createTavernBuilding() {
    const group = new THREE.Group();
    const width = 9.5, height = 6.8, depth = 9.0;

    const fieldstoneMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const plasterMat = new THREE.MeshLambertMaterial({ color: 0xfde68a });
    const timberMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const woodDoorMat = new THREE.MeshLambertMaterial({ color: 0x3f1d0b });
    const warmGlassMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 });

    // 1. Heavy Stone Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.7, depth + 0.6), darkStoneMat);
    base.position.y = 0.35;
    base.receiveShadow = true;
    group.add(base);

    // 2. Ground Floor Fieldstone Walls
    const gf = new THREE.Mesh(new THREE.BoxGeometry(width, 2.8, depth), fieldstoneMat);
    gf.position.y = 2.1;
    gf.castShadow = true;
    gf.receiveShadow = true;
    group.add(gf);

    // Stone Corner Quoin Blocks
    [-width/2 + 0.25, width/2 - 0.25].forEach(qx => {
      [depth/2 - 0.25, -depth/2 + 0.25].forEach(qz => {
        const qMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.0, 0.65), darkStoneMat);
        qMesh.position.set(qx, 2.1, qz);
        group.add(qMesh);
      });
    });

    // 3. Second Floor Overhang (Tudor Jetty with Timber X-Bracing)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 3.0, depth + 0.5), plasterMat);
    upper.position.y = 5.0;
    upper.castShadow = true;
    upper.receiveShadow = true;
    group.add(upper);

    // Horizontal timber fascia dividing floors
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.4, depth + 0.7), timberMat);
    fascia.position.y = 3.5;
    group.add(fascia);

    // Timber posts & cross framing on upper floor
    [-width/2 - 0.05, width/2 + 0.05].forEach(px => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.0, 0.35), timberMat);
      post.position.set(px, 5.0, depth/2 + 0.26);
      group.add(post);
    });

    // Tudor diagonal X beams
    [-2.4, 2.4].forEach(bx => {
      const beamA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.08), timberMat);
      beamA.position.set(bx, 5.0, depth/2 + 0.28);
      beamA.rotation.z = 0.62;
      group.add(beamA);

      const beamB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.08), timberMat);
      beamB.position.set(bx, 5.0, depth/2 + 0.28);
      beamB.rotation.z = -0.62;
      group.add(beamB);
    });

    // 4. Steeply Pitched Wine Red Gabled Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.86, 4.4, 4), roofMat);
    roof.position.y = 8.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Heavy Timber Roof Ridge
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, depth + 0.8), timberMat);
    ridge.position.set(0, 10.3, 0);
    group.add(ridge);

    // 5. Arched Stone Tavern Entrance
    const archOuter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.5), darkStoneMat);
    archOuter.position.set(0, 1.8, depth/2 + 0.1);
    group.add(archOuter);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.2), woodDoorMat);
    door.position.set(0, 1.5, depth/2 + 0.2);
    group.add(door);

    // Iron Door Straps
    [-0.5, 0.5].forEach(dy => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.04), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
      strap.position.set(0, 1.5 + dy, depth/2 + 0.31);
      group.add(strap);
    });

    // Warm Amber Portal Glow
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.3), new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.65
    }));
    portal.position.set(0, 1.5, depth/2 + 0.33);
    group.add(portal);

    // 6. Two 3D Leaded Glass Windows with Blooming Flower Planter Boxes
    [-2.4, 2.4].forEach(wx => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), warmGlassMat);
      win.position.set(wx, 5.1, depth/2 + 0.28);
      group.add(win);

      const mull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.05), timberMat);
      mull.position.set(wx, 5.1, depth/2 + 0.3);
      group.add(mull);

      // Wooden flower planter box
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.5), timberMat);
      box.position.set(wx, 4.1, depth/2 + 0.45);
      box.castShadow = true;
      group.add(box);

      // Lush green foliage
      const foliage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.35), new THREE.MeshLambertMaterial({ color: 0x15803d }));
      foliage.position.set(wx, 4.35, depth/2 + 0.45);
      group.add(foliage);

      // Blooming red and pink flowers
      const flowerColors = [0xef4444, 0xf472b6, 0xffffff, 0xf59e0b];
      for (let fi = -0.6; fi <= 0.6; fi += 0.35) {
        const blossom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), new THREE.MeshBasicMaterial({
          color: flowerColors[Math.abs(Math.round(fi * 10)) % flowerColors.length]
        }));
        blossom.position.set(wx + fi, 4.52, depth/2 + 0.48);
        group.add(blossom);
      }
    });

    // 7. Full Rustic Fieldstone Chimney Stack on Side Wall (rising to y = 9.0)
    const chimBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.0, 1.8), fieldstoneMat);
    chimBase.position.set(2.8, 2.0, -2.2);
    chimBase.castShadow = true;
    group.add(chimBase);

    const chimShaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.5, 1.4), fieldstoneMat);
    chimShaft.position.set(2.8, 6.0, -2.2);
    chimShaft.castShadow = true;
    group.add(chimShaft);

    // Terracotta Chimney Pot
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0xb45309 }));
    pot.position.set(2.8, 9.0, -2.2);
    group.add(pot);

    // 8. Tavern Hanging Pub Sign (🐱 Cat's Tail)
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    bracket.position.set(2.6, 3.6, depth/2 + 0.7);
    group.add(bracket);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.1), timberMat);
    signBoard.position.set(2.6, 3.1, depth/2 + 1.1);
    group.add(signBoard);

    const catFace = new THREE.Mesh(new THREE.CircleGeometry(0.24, 8), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    catFace.position.set(2.6, 3.1, depth/2 + 1.16);
    group.add(catFace);

    // 9. Lantern Sconces beside entrance
    [-1.7, 1.7].forEach(lx => {
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), warmGlassMat);
      lantern.position.set(lx, 2.2, depth/2 + 0.4);
      group.add(lantern);

      const light = new THREE.PointLight(0xf59e0b, 0.7, 8, 2);
      light.position.set(lx, 2.2, depth/2 + 0.65);
      group.add(light);
    });

    // 10. Stacked Oak Wine Barrels beside tavern
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
    [-width/2 - 0.7, -width/2 - 0.7].forEach((bx, idx) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 10), barrelMat);
      b.position.set(bx, 0.55, depth/2 - 1.0 - idx * 1.3);
      b.castShadow = true;
      group.add(b);
    });

    // 11. Floating Building Sign
    group.add(createBuildingSign("🐱 Cat's Tail Taverna", 11.0));

    return group;
  }

  // D) Dilek Tapınağı / Gacha Shrine
  function createShrineBuilding() {
    const group = new THREE.Group();
    const width = 10.5, height = 7.5, depth = 10.5;

    const marbleWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const marbleGreyMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const royalPurpleMat = new THREE.MeshLambertMaterial({ color: 0x3b0764 });
    const roofPurpleMat = new THREE.MeshLambertMaterial({ color: 0x581c87 });
    const arcaneCyanMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // 1. Grand 3-Tier Stepped White Marble Plinth
    [
      { w: width + 2.4, d: depth + 2.4, h: 0.35, y: 0.175 },
      { w: width + 1.6, d: depth + 1.6, h: 0.35, y: 0.525 },
      { w: width + 0.8, d: depth + 0.8, h: 0.35, y: 0.875 }
    ].forEach(step => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(step.w, step.h, step.d), marbleWhiteMat);
      s.position.y = step.y;
      s.receiveShadow = true;
      group.add(s);
    });

    // Grand Entrance Front Stairs
    for (let st = 0; st < 4; st++) {
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 0.6), marbleGreyMat);
      stepMesh.position.set(0, 0.75 - st * 0.2, depth/2 + 0.6 + st * 0.55);
      stepMesh.receiveShadow = true;
      group.add(stepMesh);
    }

    // 2. Sanctuary Sanctum Main Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 6.2, depth), royalPurpleMat);
    body.position.y = 4.15;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Gold Cornice Trim
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.4, depth + 0.4), goldMat);
    cornice.position.y = 7.3;
    group.add(cornice);

    // 3. Colonnade: 4 Monumental Fluted Marble Columns in Front
    [-3.8, -1.3, 1.3, 3.8].forEach(cx => {
      const cBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 12), goldMat);
      cBase.position.set(cx, 1.25, depth/2 + 0.4);
      group.add(cBase);

      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 5.5, 14), marbleWhiteMat);
      col.position.set(cx, 4.1, depth/2 + 0.4);
      col.castShadow = true;
      group.add(col);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.42, 0.5, 12), goldMat);
      cap.position.set(cx, 6.95, depth/2 + 0.4);
      group.add(cap);
    });

    // Architrave lintel above columns
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.5, 1.2), marbleWhiteMat);
    lintel.position.set(0, 7.3, depth/2 + 0.4);
    group.add(lintel);

    // 4. Grand Monumental Arched Sanctuary Portal
    const archMat = new THREE.MeshLambertMaterial({ color: 0x4c1d95 });
    const arch = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.4, 0.6), archMat);
    arch.position.set(0, 3.25, depth/2 + 0.1);
    group.add(arch);

    // Stained-Glass Celestial Rose Window above portal
    const roseRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 24), goldMat);
    roseRing.position.set(0, 5.8, depth/2 + 0.2);
    group.add(roseRing);

    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16), new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85
    }));
    roseGlass.position.set(0, 5.8, depth/2 + 0.22);
    group.add(roseGlass);

    const roseStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), goldMat);
    roseStar.position.set(0, 5.8, depth/2 + 0.28);
    group.add(roseStar);

    // Mystical Deep Portal Doorway (Purple Nebula glow)
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.75
    }));
    portal.position.set(0, 2.7, depth/2 + 0.42);
    group.add(portal);

    // Arcane Rune Tablets
    [-1.5, 1.5].forEach(rx => {
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2.4), arcaneCyanMat);
      rune.position.set(rx, 2.7, depth/2 + 0.42);
      group.add(rune);
    });

    // 5. Majestic 2-Tier Imperial Pagoda Roof
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(width * 0.96, 3.2, 8), roofPurpleMat);
    roof1.position.y = 8.8;
    roof1.castShadow = true;
    group.add(roof1);

    const eaveRing1 = new THREE.Mesh(new THREE.TorusGeometry(width * 0.7, 0.22, 6, 8), goldMat);
    eaveRing1.position.y = 7.5;
    eaveRing1.rotation.x = Math.PI / 2;
    eaveRing1.rotation.z = Math.PI / 8;
    group.add(eaveRing1);

    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(width * 0.6, 2.8, 8), roofPurpleMat);
    roof2.position.y = 11.2;
    roof2.castShadow = true;
    group.add(roof2);

    const eaveRing2 = new THREE.Mesh(new THREE.TorusGeometry(width * 0.42, 0.18, 6, 8), goldMat);
    eaveRing2.position.y = 10.0;
    eaveRing2.rotation.x = Math.PI / 2;
    eaveRing2.rotation.z = Math.PI / 8;
    group.add(eaveRing2);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.35, 3.2, 8), goldMat);
    spire.position.y = 13.5;
    group.add(spire);

    const starFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), goldMat);
    starFinial.position.y = 15.2;
    group.add(starFinial);

    // 6. Floating Celestial Crystal
    const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
    shrineCrystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    shrineCrystalMesh.position.set(0, 4.8, depth/2 + 2.0);
    group.add(shrineCrystalMesh);

    const innerCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
    shrineCrystalMesh.add(innerCrystal);

    // 7. Ornate Bronze Braziers with Violet Flame
    [-3.8, 3.8].forEach(bx => {
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0x1e1b4b }));
      brazier.position.set(bx, 1.45, depth/2 + 1.8);
      group.add(brazier);

      const fire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
      fire.position.set(bx, 2.0, depth/2 + 1.8);
      group.add(fire);

      const pLight = new THREE.PointLight(0xc084fc, 0.9, 10, 2);
      pLight.position.set(bx, 2.1, depth/2 + 1.8);
      group.add(pLight);
    });

    // 8. Floating Building Sign
    group.add(createBuildingSign('✨ Dilek Tapınağı', 16.2));

    return group;
  }

  // E) Maceracılar Loncası / Guild Hall
  function createGuildBuilding() {
    const group = new THREE.Group();
    const width = 9.5, height = 6.8, depth = 9.0;

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const emeraldRoofMat = new THREE.MeshLambertMaterial({ color: 0x166534 });
    const woodDoorMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    // 1. Heavy Stone Base
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.7, depth + 0.6), darkStoneMat);
    base.position.y = 0.35;
    base.receiveShadow = true;
    group.add(base);

    // 2. Fortress Stone Walls
    const walls = new THREE.Mesh(new THREE.BoxGeometry(width, 5.5, depth), stoneMat);
    walls.position.y = 3.45;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Reinforced Iron Corner Straps
    [-width/2 + 0.25, width/2 - 0.25].forEach(cx => {
      [depth/2 - 0.25, -depth/2 + 0.25].forEach(cz => {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5.8, 0.65), darkStoneMat);
        corner.position.set(cx, 3.45, cz);
        group.add(corner);
      });
    });

    // 3. Second Floor Lookout Balcony with Stone Battlements
    const balcony = new THREE.Mesh(new THREE.BoxGeometry(width * 0.65, 0.4, 1.2), darkStoneMat);
    balcony.position.set(0, 4.2, depth/2 + 0.6);
    balcony.castShadow = true;
    group.add(balcony);

    [-1.8, -0.6, 0.6, 1.8].forEach(bx => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.2), stoneMat);
      c.position.set(bx, 4.65, depth/2 + 1.1);
      group.add(c);
    });

    const bDoor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.1), woodDoorMat);
    bDoor.position.set(0, 5.4, depth/2 + 0.05);
    group.add(bDoor);

    // 4. Emerald Green Slate Hip Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.86, 3.8, 4), emeraldRoofMat);
    roof.position.y = 7.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, depth + 0.8), new THREE.MeshLambertMaterial({ color: 0x047857 }));
    ridge.position.set(0, 9.6, 0);
    group.add(ridge);

    // 5. Heavy Studded Oak Double Entrance Door
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.4), darkStoneMat);
    doorFrame.position.set(0, 1.8, depth/2 + 0.1);
    group.add(doorFrame);

    const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, 0.2), woodDoorMat);
    door.position.set(0, 1.65, depth/2 + 0.18);
    group.add(door);

    // Iron Rivets on door
    for (let rx = -0.6; rx <= 0.6; rx += 0.4) {
      for (let ry = 0.8; ry <= 2.4; ry += 0.4) {
        const rivet = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04), steelMat);
        rivet.position.set(rx, ry, depth/2 + 0.3);
        group.add(rivet);
      }
    }

    // Portal entrance glow
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65
    }));
    portal.position.set(0, 1.65, depth/2 + 0.32);
    group.add(portal);

    // 6. Sculpted Guild Crest Shield & Crossed Swords
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.15), darkStoneMat);
    shield.position.set(0, 3.5, depth/2 + 0.25);
    group.add(shield);

    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), goldMat);
    emblem.position.set(0, 3.5, depth/2 + 0.36);
    group.add(emblem);

    [-0.55, 0.55].forEach(rotZ => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.05), steelMat);
      blade.position.set(0, 3.5, depth/2 + 0.2);
      blade.rotation.z = rotZ;
      group.add(blade);

      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.06), goldMat);
      hilt.position.set(-rotZ * 0.7, 3.5 - 0.7, depth/2 + 0.2);
      hilt.rotation.z = rotZ;
      group.add(hilt);
    });

    // 7. Wall Torches flanking entrance
    [-1.7, 1.7].forEach(tx => {
      const torchSconce = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.6, 6), darkStoneMat);
      torchSconce.position.set(tx, 2.3, depth/2 + 0.3);
      torchSconce.rotation.x = 0.35;
      group.add(torchSconce);

      const fire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), fireMat);
      fire.position.set(tx, 2.6, depth/2 + 0.45);
      group.add(fire);

      const pLight = new THREE.PointLight(0xf97316, 0.8, 8, 2);
      pLight.position.set(tx, 2.6, depth/2 + 0.65);
      group.add(pLight);
    });

    // 8. Floating Building Sign
    group.add(createBuildingSign('⚔️ Maceracılar Loncası', 10.4));

    return group;
  }

  // --- Town Props Helpers ---
  function createStreetLamp(x, z) {
    const group = new THREE.Group();

    // Dark iron post
    const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.8, 8);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1.9;
    post.castShadow = true;
    group.add(post);

    // Stone base collar
    const collarGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8);
    const collarMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.y = 0.2;
    group.add(collar);

    // Lantern fixture
    const lanternGeo = new THREE.BoxGeometry(0.65, 0.85, 0.65);
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.y = 3.9;
    group.add(lantern);

    // Lantern cap roof
    const capGeo = new THREE.ConeGeometry(0.6, 0.4, 4);
    const capMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 4.45;
    cap.rotation.y = Math.PI / 4;
    group.add(cap);

    // Warm PointLight
    const light = new THREE.PointLight(0xfef08a, 0.85, 11, 2);
    light.position.y = 3.9;
    group.add(light);

    group.position.set(x, 0, z);
    return group;
  }

  function createMarketStall({ x, z, rotY = 0, awningColor1 = 0xef4444, awningColor2 = 0xffffff, wareType = 'fruits' }) {
    const group = new THREE.Group();

    // Table counter
    const counterGeo = new THREE.BoxGeometry(3.6, 1.2, 1.6);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
    const counter = new THREE.Mesh(counterGeo, woodMat);
    counter.position.y = 0.6;
    counter.castShadow = true;
    group.add(counter);

    // 4 Corner Wooden Posts
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6);
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    [
      { x: -1.7, z: -0.7 }, { x: 1.7, z: -0.7 },
      { x: -1.7, z: 0.7 }, { x: 1.7, z: 0.7 }
    ].forEach(p => {
      const post = new THREE.Mesh(postGeo, darkWood);
      post.position.set(p.x, 1.6, p.z);
      post.castShadow = true;
      group.add(post);
    });

    // Striped Awning
    const awnGeo = new THREE.BoxGeometry(3.8, 0.15, 2.0);
    const awnMat = new THREE.MeshLambertMaterial({ color: awningColor1 });
    const awnMesh = new THREE.Mesh(awnGeo, awnMat);
    awnMesh.position.set(0, 3.0, 0);
    awnMesh.rotation.x = 0.18;
    group.add(awnMesh);

    // Front valance fringe
    const valGeo = new THREE.BoxGeometry(3.8, 0.35, 0.1);
    const valMat = new THREE.MeshLambertMaterial({ color: awningColor2 });
    const valMesh = new THREE.Mesh(valGeo, valMat);
    valMesh.position.set(0, 2.8, 1.0);
    group.add(valMesh);

    // Wares on counter
    if (wareType === 'fruits') {
      // Fruit crates
      for (let i = -1; i <= 1; i++) {
        const crateGeo = new THREE.BoxGeometry(0.9, 0.3, 0.8);
        const crate = new THREE.Mesh(crateGeo, darkWood);
        crate.position.set(i * 1.1, 1.35, 0);
        group.add(crate);

        // Apples / Melons inside
        const fruitColor = i === -1 ? 0xef4444 : i === 0 ? 0x22c55e : 0xf59e0b;
        const fruitMat = new THREE.MeshLambertMaterial({ color: fruitColor });
        for (let fx = -0.25; fx <= 0.25; fx += 0.25) {
          for (let fz = -0.2; fz <= 0.2; fz += 0.2) {
            const fruit = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), fruitMat);
            fruit.position.set(i * 1.1 + fx, 1.55, fz);
            group.add(fruit);
          }
        }
      }
    } else if (wareType === 'potions') {
      // Glowing potion bottles
      const colors = [0x38bdf8, 0xef4444, 0xa855f7, 0x10b981];
      for (let i = 0; i < 6; i++) {
        const pMat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
        const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.35, 8), pMat);
        flask.position.set(-1.2 + i * 0.48, 1.38, 0);
        group.add(flask);

        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), darkWood);
        cork.position.set(-1.2 + i * 0.48, 1.58, 0);
        group.add(cork);
      }
    }

    // Crates & Barrels next to stall
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.5, 1.1, 10);
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x854d0e });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(2.4, 0.55, 0.3);
    barrel.castShadow = true;
    group.add(barrel);

    const crateBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), darkWood);
    crateBox.position.set(-2.4, 0.4, 0.2);
    crateBox.castShadow = true;
    group.add(crateBox);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  function createBench(x, z, rotY = 0) {
    const group = new THREE.Group();

    // Wooden slats
    const seatGeo = new THREE.BoxGeometry(2.4, 0.15, 0.8);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x854d0e });
    const seat = new THREE.Mesh(seatGeo, woodMat);
    seat.position.y = 0.6;
    seat.castShadow = true;
    group.add(seat);

    // Backrest
    const backGeo = new THREE.BoxGeometry(2.4, 0.6, 0.12);
    const back = new THREE.Mesh(backGeo, woodMat);
    back.position.set(0, 1.0, -0.35);
    back.castShadow = true;
    group.add(back);

    // Stone Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.8);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    [-1.0, 1.0].forEach(lx => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.3, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  function createFlowerBed(x, z, width = 4, depth = 2) {
    const group = new THREE.Group();

    // Stone border curb
    const curbGeo = new THREE.BoxGeometry(width + 0.4, 0.3, depth + 0.4);
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.y = 0.15;
    curb.receiveShadow = true;
    group.add(curb);

    // Dark rich soil
    const soilGeo = new THREE.BoxGeometry(width, 0.32, depth);
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.position.y = 0.16;
    group.add(soil);

    // Flowers clusters
    const flowerColors = [0xef4444, 0xf59e0b, 0xa855f7, 0xec4899, 0x38bdf8, 0xffffff];
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x15803d });

    for (let i = 0; i < 18; i++) {
      const fx = (Math.random() - 0.5) * (width - 0.6);
      const fz = (Math.random() - 0.5) * (depth - 0.6);
      const fh = 0.35 + Math.random() * 0.3;

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, fh), stemMat);
      stem.position.set(fx, 0.32 + fh / 2, fz);
      group.add(stem);

      const petalMat = new THREE.MeshLambertMaterial({ color: flowerColors[i % flowerColors.length] });
      const petal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), petalMat);
      petal.position.set(fx, 0.32 + fh, fz);
      group.add(petal);
    }

    group.position.set(x, 0, z);
    return group;
  }

  function createNoticeBoard(x, z, rotY = 0) {
    const group = new THREE.Group();

    // Twin timber posts
    const postGeo = new THREE.BoxGeometry(0.2, 3.2, 0.2);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    [-1.2, 1.2].forEach(px => {
      const p = new THREE.Mesh(postGeo, woodMat);
      p.position.set(px, 1.6, 0);
      p.castShadow = true;
      group.add(p);
    });

    // Board panel
    const boardGeo = new THREE.BoxGeometry(2.6, 1.8, 0.12);
    const boardMat = new THREE.MeshLambertMaterial({ color: 0x854d0e });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 2.0, 0);
    board.castShadow = true;
    group.add(board);

    // Mini gabled roof
    const roofGeo = new THREE.BoxGeometry(2.9, 0.15, 0.8);
    const roof = new THREE.Mesh(roofGeo, woodMat);
    roof.position.set(0, 3.0, 0);
    group.add(roof);

    // Pinned parchment quest posters
    const paperColors = [0xfef08a, 0xffedd5, 0xfde68a, 0xfef9c3];
    [-0.7, 0.0, 0.7].forEach((ox, idx) => {
      const pGeo = new THREE.PlaneGeometry(0.5, 0.65);
      const pMat = new THREE.MeshBasicMaterial({ color: paperColors[idx % paperColors.length], side: THREE.DoubleSide });
      const poster = new THREE.Mesh(pGeo, pMat);
      poster.position.set(ox, 2.0 + (idx % 2 === 0 ? 0.1 : -0.1), 0.08);
      group.add(poster);

      // Red wax seal dot
      const seal = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), new THREE.MeshBasicMaterial({ color: 0xb91c1c }));
      seal.position.set(ox, 2.28 + (idx % 2 === 0 ? 0.1 : -0.1), 0.09);
      group.add(seal);
    });

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  function createTavernPatio(x, z) {
    const group = new THREE.Group();

    // 2 Wooden Cafe Tables with Striped Parasols
    [-2.2, 2.2].forEach(tx => {
      // Table pedestal & top
      const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x78350f }));
      tableTop.position.set(tx, 1.0, 0);
      tableTop.castShadow = true;
      group.add(tableTop);

      const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 8), new THREE.MeshLambertMaterial({ color: 0x451a03 }));
      tableLeg.position.set(tx, 0.5, 0);
      group.add(tableLeg);

      // Mugs on table
      [-0.3, 0.3].forEach(mx => {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
        mug.position.set(tx + mx, 1.14, 0.1);
        group.add(mug);
      });

      // Stools
      [
        { x: tx - 1.2, z: 0 }, { x: tx + 1.2, z: 0 },
        { x: tx, z: -1.1 }, { x: tx, z: 1.1 }
      ].forEach(sp => {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x854d0e }));
        stool.position.set(sp.x, 0.3, sp.z);
        stool.castShadow = true;
        group.add(stool);
      });

      // Striped parasol umbrella
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8), new THREE.MeshLambertMaterial({ color: 0x451a03 }));
      pole.position.set(tx, 1.4, 0);
      group.add(pole);

      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 8), new THREE.MeshLambertMaterial({ color: 0xb91c1c }));
      umbrella.position.set(tx, 2.8, 0);
      group.add(umbrella);
    });

    // Flower planter boxes border
    [-4.0, 4.0].forEach(bx => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 3.2), new THREE.MeshLambertMaterial({ color: 0x5c3d2e }));
      box.position.set(bx, 0.3, 0);
      box.castShadow = true;
      group.add(box);

      // Mini bushes inside planter
      for (let fz = -1.0; fz <= 1.0; fz += 0.8) {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0x16a34a }));
        b.position.set(bx, 0.65, fz);
        group.add(b);

        const flower = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
        flower.position.set(bx, 0.85, fz);
        group.add(flower);
      }
    });

    group.position.set(x, 0, z);
    return group;
  }

  // --- Handcrafted Village Square Decor Elements ---
  // 1. Village Directional Signpost with Iron Lantern
  function createVillageSignpost(x, z, rotY = 0) {
    const group = new THREE.Group();

    // Weathered Stone Footing
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.32, 0.22, 10),
      new THREE.MeshLambertMaterial({ color: 0x64748b })
    );
    base.position.y = 0.11;
    base.receiveShadow = true;
    group.add(base);

    // Carved Timber Post
    const postMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.2, 8), postMat);
    post.position.y = 1.6;
    post.castShadow = true;
    group.add(post);

    // Pointed Timber Cap
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 8), postMat);
    cap.position.y = 3.35;
    group.add(cap);

    // Directional Wooden Pointer Boards
    const signConfigs = [
      { y: 2.75, rot: 0, textCol: 0xc084fc, name: 'Dilek Tapınağı ⬆️' },
      { y: 2.40, rot: Math.PI * 0.5, textCol: 0xf59e0b, name: 'Takas Pazarı ⬅️' },
      { y: 2.05, rot: -Math.PI * 0.5, textCol: 0xef4444, name: 'Cat\'s Tail ➡️' },
      { y: 1.70, rot: Math.PI, textCol: 0x38bdf8, name: 'Nehir & Zindan ⬇️' }
    ];

    signConfigs.forEach(cfg => {
      const sGroup = new THREE.Group();
      sGroup.position.y = cfg.y;
      sGroup.rotation.y = cfg.rot;

      // Board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.22, 0.06),
        new THREE.MeshLambertMaterial({ color: 0x854d0e })
      );
      board.position.set(0.45, 0, 0);
      board.castShadow = true;
      sGroup.add(board);

      // Pointed chevron tip
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.22, 4),
        new THREE.MeshLambertMaterial({ color: 0x854d0e })
      );
      tip.rotation.z = -Math.PI / 2;
      tip.position.set(0.98, 0, 0);
      sGroup.add(tip);

      // Text accent strip
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.1),
        new THREE.MeshBasicMaterial({ color: cfg.textCol, side: THREE.DoubleSide })
      );
      strip.position.set(0.45, 0, 0.035);
      sGroup.add(strip);

      group.add(sGroup);
    });

    // Wrought Iron Lantern Bracket & Hanging Lantern
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.06), ironMat);
    bracket.position.set(-0.35, 3.0, 0);
    group.add(bracket);

    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), ironMat);
    lantern.position.set(-0.6, 2.75, 0);
    lantern.castShadow = true;
    group.add(lantern);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.26, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    glass.position.set(-0.6, 2.75, 0);
    group.add(glass);

    // Warm lantern light
    const lanternLight = new THREE.PointLight(0xffedd5, 0.75, 6.0);
    lanternLight.position.set(-0.6, 2.75, 0);
    group.add(lanternLight);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  // 2. Rustic Wooden Produce Wagon with Harvest Apples, Pumpkins, Sacks & Sleeping Cat
  function createRusticProduceWagon(x, z, rotY = 0) {
    const group = new THREE.Group();

    const woodDarkMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const woodPlankMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
    const wheelRimMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const strawMat = new THREE.MeshLambertMaterial({ color: 0xfef08a });
    const sackMat = new THREE.MeshLambertMaterial({ color: 0xd97706 });

    // Chassis Long Beams
    [-0.55, 0.55].forEach(bx => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), woodDarkMat);
      beam.position.set(bx, 0.55, 0);
      beam.castShadow = true;
      group.add(beam);
    });

    // Axles
    [-1.0, 1.0].forEach(az => {
      const axle = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), wheelRimMat);
      axle.position.set(0, 0.52, az);
      group.add(axle);
    });

    // 4 Spoked Wooden Wheels with Iron Rim
    [-0.95, 0.95].forEach(wx => {
      [-1.0, 1.0].forEach(wz => {
        const wGroup = new THREE.Group();
        wGroup.position.set(wx, 0.52, wz);

        // Iron Tire Rim
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 18), wheelRimMat);
        rim.rotation.y = Math.PI / 2;
        rim.castShadow = true;
        wGroup.add(rim);

        // Wooden Hub
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8), woodDarkMat);
        hub.rotation.z = Math.PI / 2;
        wGroup.add(hub);

        // Spokes
        for (let i = 0; i < 4; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), woodPlankMat);
          spoke.rotation.x = (i * Math.PI) / 4;
          wGroup.add(spoke);
        }

        group.add(wGroup);
      });
    });

    // Wagon Bed Planks
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 2.7), woodPlankMat);
    bed.position.set(0, 0.65, 0);
    bed.castShadow = true;
    bed.receiveShadow = true;
    group.add(bed);

    // Wagon Side Slats
    [-0.78, 0.78].forEach(sx => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 2.7), woodPlankMat);
      side.position.set(sx, 0.88, 0);
      side.castShadow = true;
      group.add(side);
    });
    // Front & Back Slats
    [-1.35, 1.35].forEach(sz => {
      const end = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.08), woodPlankMat);
      end.position.set(0, 0.88, sz);
      end.castShadow = true;
      group.add(end);
    });

    // Hitch Pole extending forward
    const hitch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.8), woodDarkMat);
    hitch.position.set(0, 0.48, -2.1);
    hitch.rotation.x = -0.12;
    group.add(hitch);

    // Straw / Hay Bedding
    const hay = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 2.4), strawMat);
    hay.position.set(0, 0.76, 0);
    group.add(hay);

    // Harvest Crate 1: Shiny Red Apples
    const crateGeo = new THREE.BoxGeometry(0.55, 0.35, 0.65);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x92400e });
    const crate1 = new THREE.Mesh(crateGeo, crateMat);
    crate1.position.set(-0.35, 0.98, -0.6);
    crate1.castShadow = true;
    group.add(crate1);

    const appleMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
    for (let ax = -0.18; ax <= 0.18; ax += 0.18) {
      for (let az = -0.22; az <= 0.22; az += 0.22) {
        const apple = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), appleMat);
        apple.position.set(-0.35 + ax, 1.20, -0.6 + az);
        group.add(apple);
      }
    }

    // Harvest Crate 2: Plump Harvest Pumpkins
    const crate2 = new THREE.Mesh(crateGeo, crateMat);
    crate2.position.set(0.35, 0.98, -0.4);
    crate2.rotation.y = 0.15;
    crate2.castShadow = true;
    group.add(crate2);

    const pumpkinMat = new THREE.MeshLambertMaterial({ color: 0xf97316 });
    [-0.12, 0.12].forEach(px => {
      const pumpkin = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), pumpkinMat);
      pumpkin.scale.set(1.15, 0.85, 1.15);
      pumpkin.position.set(0.35 + px, 1.22, -0.4);
      group.add(pumpkin);
    });

    // 2 Burlap Grain Sacks in back
    [-0.32, 0.32].forEach((sx, idx) => {
      const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.5, 8), sackMat);
      sack.position.set(sx, 0.98, 0.6 + (idx * 0.1));
      sack.rotation.z = idx === 0 ? 0.2 : -0.15;
      sack.castShadow = true;
      group.add(sack);
    });

    // Sleeping Calico Cat nestled on the back hay
    const sleepingCat = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xf97316 })
    );
    sleepingCat.scale.set(1.2, 0.7, 1.0);
    sleepingCat.position.set(0, 0.96, 0.1);
    group.add(sleepingCat);

    const sleepingHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xffedd5 })
    );
    sleepingHead.position.set(0.16, 0.98, 0.12);
    group.add(sleepingHead);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  // 3. Flared Terracotta Urn Overflowing with Lavender, Marigolds & Trailing Ivy
  function createFlowerUrnPlanter(x, z, scale = 1.0) {
    const group = new THREE.Group();
    const terraMat = new THREE.MeshLambertMaterial({ color: 0xc2410c });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x15803d });

    // Base Plinth
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.15, 12), terraMat);
    base.position.y = 0.075;
    base.receiveShadow = true;
    group.add(base);

    // Flared Urn Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 0.45, 12), terraMat);
    body.position.y = 0.36;
    body.castShadow = true;
    group.add(body);

    // Rolled Top Lip
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.06, 6, 16), terraMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.58;
    group.add(lip);

    // Soil
    const soil = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 12),
      new THREE.MeshLambertMaterial({ color: 0x3e2723 })
    );
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.56;
    group.add(soil);

    // Lush Foliage Dome
    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36), leafMat);
    foliage.position.y = 0.72;
    group.add(foliage);

    // Blooming Flower Heads
    const blooms = [
      { col: 0xa855f7, ox: -0.15, oz: 0.12, oy: 0.90 }, // Lavender
      { col: 0xa855f7, ox: 0.14, oz: -0.10, oy: 0.92 },
      { col: 0xf59e0b, ox: 0.12, oz: 0.14, oy: 0.88 },  // Marigold
      { col: 0xf59e0b, ox: -0.14, oz: -0.12, oy: 0.86 },
      { col: 0xf472b6, ox: 0.0, oz: 0.0, oy: 0.96 },    // Pink petunia
      { col: 0xffffff, ox: 0.18, oz: 0.0, oy: 0.84 }     // White blossom
    ];
    blooms.forEach(b => {
      const fl = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: b.col })
      );
      fl.position.set(b.ox, b.oy, b.oz);
      group.add(fl);
    });

    group.position.set(x, 0, z);
    group.scale.set(scale, scale, scale);
    return group;
  }

  function createPixelCat(x, z, furColor = 0xf97316) {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.45, 0.35, 0.7);
    const bodyMat = new THREE.MeshLambertMaterial({ color: furColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.25;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.45, 0.35);
    group.add(head);

    // Ears
    [-0.12, 0.12].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 3), bodyMat);
      ear.position.set(ex, 0.68, 0.35);
      group.add(ear);
    });

    // Eyes
    [-0.09, 0.09].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
      eye.position.set(ex, 0.48, 0.53);
      group.add(eye);
    });

    // Tail (animated swing)
    const tailGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.45, 4);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, 0.45, -0.42);
    tail.rotation.x = -0.6;
    group.add(tail);

    group.position.set(x, 0, z);
    group.userData = { tail, baseY: 0, timeOffset: Math.random() * 100 };
    animatedCats.push(group);
    return group;
  }

  function createWaterLily(x, z) {
    const group = new THREE.Group();
    // Green pad with notch
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10), new THREE.MeshLambertMaterial({ color: 0x15803d, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    group.add(pad);

    // Pink / White Lotus flower
    const lotus = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    lotus.position.set(0, 0.15, 0);
    group.add(lotus);

    group.position.set(x, 0, z);
    return group;
  }

  // --- River Wooden Fishing Pier & Shimmering Fish Schools ---
  function createFishingPier(x, z) {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x451a03 });

    // Deck planks
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 5.8), woodMat);
    deck.position.set(0, 0.28, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // 4 Support timber pilings sinking into riverbed
    [
      { px: -1.6, pz: -2.4 }, { px: 1.6, pz: -2.4 },
      { px: -1.6, pz: 2.4 }, { px: 1.6, pz: 2.4 }
    ].forEach(p => {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.4, 6), darkWood);
      piling.position.set(p.px, -0.3, p.pz);
      piling.castShadow = true;
      group.add(piling);
    });

    // Fishing Tackle Box
    const tackle = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.35, 0.45), new THREE.MeshLambertMaterial({ color: 0x0284c7 }));
    tackle.position.set(-1.2, 0.58, 1.8);
    group.add(tackle);

    // Fish Bucket
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 8), new THREE.MeshLambertMaterial({ color: 0x64748b }));
    bucket.position.set(1.2, 0.68, 1.8);
    group.add(bucket);

    // Bamboo fishing rods leaning in bucket
    [-0.15, 0.15].forEach(rx => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0xd97706 }));
      rod.rotation.z = rx * 1.5;
      rod.position.set(1.2 + rx, 1.3, 1.8);
      group.add(rod);
    });

    // Pier Lantern Post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), darkWood);
    post.position.set(-1.6, 1.3, -2.4);
    group.add(post);

    const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    lantern.position.set(-1.6, 2.3, -2.4);
    group.add(lantern);

    const lLight = new THREE.PointLight(0xfef08a, 0.65, 8, 2);
    lLight.position.set(-1.6, 2.3, -2.4);
    group.add(lLight);

    group.position.set(x, 0, z);
    return group;
  }

  function createRiverFishSchool(x, z) {
    const group = new THREE.Group();

    // Concentric shimmering water ripple rings
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });

    const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.48, 16), ringMat);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.06;
    group.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.82, 16), ringMat.clone());
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.06;
    ring2.material.opacity = 0.35;
    group.add(ring2);

    // Swimming fish under surface
    const fishBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.45, 4),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75 })
    );
    fishBody.rotation.x = Math.PI / 2;
    fishBody.position.set(0.4, 0.01, 0);
    group.add(fishBody);

    group.position.set(x, 0, z);

    riverFishSpots.push({
      group,
      ring1,
      ring2,
      fishBody,
      baseX: x,
      baseZ: z,
      swimAngle: Math.random() * Math.PI * 2,
      swimSpeed: 1.2 + Math.random() * 0.8,
      swimRadius: 0.5 + Math.random() * 0.4,
      jumpTimer: Math.random() * 5.0
    });

    return group;
  }

  // --- Living Particle Systems Initialization ---
  function initParticleSystems() {
    fountainParticlesData = [];
    chimneySmokeData = [];
    firefliesData = [];
    shrineAuraData = [];

    // 1. Central Fountain Water Spray Droplets
    const fGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const fMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const p = new THREE.Mesh(fGeo, fMat);
      p.position.set(0, 3.6, 0);
      worldObjects.add(p);
      fountainParticlesData.push({
        mesh: p,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2.0 + Math.random() * 1.8,
        vz: (Math.random() - 0.5) * 1.5,
        life: Math.random() * 1.5
      });
    }

    // 2. Tavern Chimney Smoke Puffs
    const sGeo = new THREE.SphereGeometry(0.4, 6, 6);
    const sMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Mesh(sGeo, sMat);
      sp.position.set(chimneyPos.x, chimneyPos.y, chimneyPos.z);
      worldObjects.add(sp);
      chimneySmokeData.push({
        mesh: sp,
        vx: 0.2 + (Math.random() - 0.5) * 0.25,
        vy: 0.9 + Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.25,
        scale: 0.4 + Math.random() * 0.4,
        life: (i / 22) * 5.0
      });
    }

    // 3. Ambient Glowing Fireflies
    const fireflyGeo = new THREE.DodecahedronGeometry(0.1);
    const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let i = 0; i < 45; i++) {
      const ff = new THREE.Mesh(fireflyGeo, fireflyMat);
      const baseX = (Math.random() - 0.5) * 60;
      const baseZ = (Math.random() - 0.5) * 60;
      const baseY = 0.8 + Math.random() * 2.6;
      ff.position.set(baseX, baseY, baseZ);
      worldObjects.add(ff);
      firefliesData.push({
        mesh: ff,
        baseX,
        baseZ,
        baseY,
        freq: 1.5 + Math.random() * 2.0,
        phase: Math.random() * Math.PI * 2
      });
    }

    // 4. Shrine Arcane Aura Sparks
    const auraGeo = new THREE.OctahedronGeometry(0.12);
    const auraColors = [0xa855f7, 0x38bdf8, 0xec4899, 0xfacc15];
    for (let i = 0; i < 24; i++) {
      const aMat = new THREE.MeshBasicMaterial({ color: auraColors[i % auraColors.length] });
      const aMesh = new THREE.Mesh(auraGeo, aMat);
      aMesh.position.set(0, 4.8, -24.8);
      worldObjects.add(aMesh);
      shrineAuraData.push({
        mesh: aMesh,
        angle: (i / 24) * Math.PI * 2,
        speed: 1.2 + Math.random() * 0.8,
        radius: 1.8 + Math.random() * 1.2,
        heightOffset: (Math.random() - 0.5) * 1.8
      });
    }
  }

  // --- Town Scenic Park Helpers ---
  function createScenicGazebo(x, z) {
    const group = new THREE.Group();
    // Circular stone base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.4, 16), new THREE.MeshLambertMaterial({ color: 0x94a3b8 }));
    base.position.y = 0.2;
    group.add(base);

    // 6 Marble Pillars
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * 3.5;
      const pz = Math.sin(angle) * 3.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0xf1f5f9 }));
      col.position.set(px, 2.0, pz);
      group.add(col);
    }

    // Domed copper roof
    const dome = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.2, 16), new THREE.MeshLambertMaterial({ color: 0x059669 }));
    dome.position.y = 4.7;
    group.add(dome);

    // Golden finial on top
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    finial.position.y = 6.0;
    group.add(finial);

    // Central stone pedestal & flower urn
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.45, 12), new THREE.MeshLambertMaterial({ color: 0x64748b }));
    seat.position.y = 0.45;
    group.add(seat);

    const urn = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
    urn.position.y = 0.95;
    group.add(urn);

    group.position.set(x, 0, z);
    return group;
  }

  // --- Interior Helpers & NPC Billboards ---
  function createNPCNametag(name, title) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 48, 12);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    ctx.font = 'bold 18px Nunito, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 28);

    ctx.font = '12px Nunito, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(title, 128, 46);

    const tex = new THREE.CanvasTexture(cvs);
    const mat = new THREE.SpriteMaterial({ map: tex });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.4, 0.85, 1);
    sprite.position.y = 2.45;
    return sprite;
  }

  function createNPCBillboard(avatarIndex, name, title, x, z) {
    const group = create3DChibiCharacter(avatarIndex);
    const tag = createNPCNametag(name, title);
    group.add(tag);
    group.position.set(x, 0, z);
    animatedNPCs.push(group);
    return group;
  }

  function createCeilingChandelier(x, y, z, lightColor = 0xfef08a) {
    const group = new THREE.Group();

    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    chain.position.y = 0.9;
    group.add(chain);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 8, 16), new THREE.MeshLambertMaterial({ color: 0x334155 }));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const lx = Math.cos(angle) * 1.4;
      const lz = Math.sin(angle) * 1.4;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35), new THREE.MeshBasicMaterial({ color: lightColor }));
      candle.position.set(lx, 0.2, lz);
      group.add(candle);
    }

    const light = new THREE.PointLight(lightColor, 0.9, 14, 2);
    light.position.y = 0.3;
    group.add(light);

    group.position.set(x, y, z);
    return group;
  }

  // --- Detailed Themed Building Interiors ---
  function buildTradeHouseInterior() {
    // 1. Ornate Red & Gold Centerpiece Persian Carpet
    const rugGeo = new THREE.PlaneGeometry(16, 10);
    const rug = new THREE.Mesh(rugGeo, new THREE.MeshLambertMaterial({ color: 0x991b1b }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.03, 1);
    worldObjects.add(rug);

    const border = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 10.6), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    border.rotation.x = -Math.PI / 2;
    border.position.set(0, 0.02, 1);
    worldObjects.add(border);

    // 2. Large Polished Mahogany Merchant Counter (L-shaped)
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(16, 1.3, 1.6), darkWood);
    counter.position.set(0, 0.65, -4);
    counter.castShadow = true;
    worldObjects.add(counter);

    const sideCounter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 5), darkWood);
    sideCounter.position.set(-7.2, 0.65, -6.5);
    worldObjects.add(sideCounter);

    // Brass Scales of Justice in center
    const scale = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    scale.position.set(0, 1.7, -4);
    worldObjects.add(scale);
    const scaleBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    scaleBar.position.set(0, 2.0, -4);
    worldObjects.add(scaleBar);

    // Open Ledger Book & Feather Quill
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.45), new THREE.MeshLambertMaterial({ color: 0xfef9c3 }));
    ledger.position.set(-2, 1.34, -4);
    worldObjects.add(ledger);

    // Coin pouches
    [-3.2, -2.8, 2.5].forEach(cx => {
      const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
      bag.position.set(cx, 1.45, -4);
      worldObjects.add(bag);
    });

    // Display of glowing potion flasks
    const potColors = [0x38bdf8, 0xef4444, 0x10b981, 0xa855f7];
    potColors.forEach((col, idx) => {
      const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 0.35, 8), new THREE.MeshBasicMaterial({ color: col }));
      flask.position.set(3.5 + idx * 0.5, 1.48, -4);
      worldObjects.add(flask);
    });

    // 3. NPC Merchant "Tüccar Liben" Behind Counter
    worldObjects.add(createNPCBillboard(0, 'Tüccar Liben', 'Büyük Gezgin Tüccar', 0, -6.2));

    // 4. Back Wall Shelving & Goods
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 0.8), darkWood);
    shelf.position.set(0, 3.5, -11.2);
    worldObjects.add(shelf);

    // Stacked Trade Crates & Barrels
    [-11, -11, 11, 11].forEach((bx, idx) => {
      const bz = idx % 2 === 0 ? -9 : -6.5;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 1.4, 10), new THREE.MeshLambertMaterial({ color: 0x854d0e }));
      barrel.position.set(bx, 0.7, bz);
      barrel.castShadow = true;
      worldObjects.add(barrel);
    });

    // Treasure Chest spilling gold
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.0), new THREE.MeshLambertMaterial({ color: 0x78350f }));
    chest.position.set(-11, 0.5, -3);
    worldObjects.add(chest);
    const goldPiles = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    goldPiles.position.set(-11, 1.1, -3);
    worldObjects.add(goldPiles);

    // 5. Private Trading Negotiation Lounges (Left & Right)
    [-9, 9].forEach(lx => {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 12), darkWood);
      table.position.set(lx, 1.0, 4);
      worldObjects.add(table);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0), darkWood);
      leg.position.set(lx, 0.5, 4);
      worldObjects.add(leg);

      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      candle.position.set(lx, 1.25, 4);
      worldObjects.add(candle);
      const candleLight = new THREE.PointLight(0xfef08a, 0.5, 6, 2);
      candleLight.position.set(lx, 1.5, 4);
      worldObjects.add(candleLight);

      [-1.4, 1.4].forEach(cz => {
        const chair = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), new THREE.MeshLambertMaterial({ color: 0x991b1b }));
        chair.position.set(lx, 0.4, 4 + cz);
        worldObjects.add(chair);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.2), new THREE.MeshLambertMaterial({ color: 0x991b1b }));
        back.position.set(lx, 0.9, 4 + cz + (cz < 0 ? -0.4 : 0.4));
        worldObjects.add(back);
      });
    });

    // 6. Hanging Grand Chandelier
    worldObjects.add(createCeilingChandelier(0, 6.2, 0, 0xfef08a));
  }

  function buildTavernInterior() {
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const medWood = new THREE.MeshLambertMaterial({ color: 0x78350f });

    // 1. Grand Rustic Fieldstone Fireplace (Back Wall Center)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(5.5, 5.0, 1.8), stoneMat);
    hearth.position.set(0, 2.5, -10.8);
    worldObjects.add(hearth);

    const recess = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.5, 1.2), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    recess.position.set(0, 1.25, -10.3);
    worldObjects.add(recess);

    const fire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
    fire.position.set(0, 0.65, -10.2);
    worldObjects.add(fire);

    const fireInner = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    fireInner.position.set(0, 0.75, -10.2);
    worldObjects.add(fireInner);

    const fireLight = new THREE.PointLight(0xf97316, 1.2, 14, 2);
    fireLight.position.set(0, 1.4, -9.5);
    worldObjects.add(fireLight);

    // Sleeping cat in front of hearth
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.2, 12), new THREE.MeshLambertMaterial({ color: 0x991b1b }));
    cushion.position.set(0, 0.1, -8.0);
    worldObjects.add(cushion);

    const sleepCat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshLambertMaterial({ color: 0xf97316 }));
    sleepCat.position.set(0, 0.35, -8.0);
    sleepCat.scale.set(1.2, 0.7, 0.9);
    worldObjects.add(sleepCat);

    // 2. Tavern Bar Counter & Backbar (Right Side)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 9.0), darkWood);
    bar.position.set(7.5, 0.65, -2.5);
    bar.castShadow = true;
    worldObjects.add(bar);

    const barReturn = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.3, 1.6), darkWood);
    barReturn.position.set(9.5, 0.65, 2.0);
    worldObjects.add(barReturn);

    // 4 High Bar Stools
    for (let i = 0; i < 4; i++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), medWood);
      stool.position.set(5.8, 0.4, -5.5 + i * 2.0);
      worldObjects.add(stool);
    }

    // Backbar Shelves with Wine Bottles & Rum Casks
    const backShelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.0, 9.0), darkWood);
    backShelf.position.set(13.5, 3.0, -2.5);
    worldObjects.add(backShelf);

    [-4, -2, 0].forEach(bz => {
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.9, 8), medWood);
      cask.rotation.z = Math.PI / 2;
      cask.position.set(12.8, 3.2, bz);
      worldObjects.add(cask);
    });

    // NPC Bartender Diona
    worldObjects.add(createNPCBillboard(8, '🐱 Diona', 'Baş Barmen & Kedi İksir Ustası', 10.5, -2.5));

    // 3. Tavern Dining Tables with Mugs & Stools (Left Side)
    [-4, 3].forEach(tz => {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 12), medWood);
      table.position.set(-8.0, 1.0, tz);
      worldObjects.add(table);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0), darkWood);
      leg.position.set(-8.0, 0.5, tz);
      worldObjects.add(leg);

      [-0.4, 0.4].forEach(mx => {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xd97706 }));
        mug.position.set(-8.0 + mx, 1.15, tz);
        worldObjects.add(mug);
        const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        foam.position.set(-8.0 + mx, 1.28, tz);
        worldObjects.add(foam);
      });

      [
        { x: -9.6, z: tz }, { x: -6.4, z: tz },
        { x: -8.0, z: tz - 1.5 }, { x: -8.0, z: tz + 1.5 }
      ].forEach(sp => {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8), medWood);
        stool.position.set(sp.x, 0.3, sp.z);
        worldObjects.add(stool);
      });
    });

    // 4. Minstrel Corner
    const stage = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 4.0), darkWood);
    stage.position.set(12.0, 0.18, 8.5);
    worldObjects.add(stage);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.7, 8), medWood);
    drum.position.set(12.5, 0.7, 8.5);
    worldObjects.add(drum);

    // 5. Hanging Wagon Wheel Chandelier
    worldObjects.add(createCeilingChandelier(0, 5.8, 0, 0xf59e0b));
  }

  function buildShrineInterior() {
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
    const marbleWhite = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    // 1. Celestial Zodiac Floor Constellation Ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 32), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, -3);
    worldObjects.add(ring);

    // 2. 3-Tier Elevated Sacred Dais
    [
      { r: 4.8, h: 0.3, y: 0.15 },
      { r: 3.8, h: 0.3, y: 0.45 },
      { r: 2.6, h: 0.3, y: 0.75 }
    ].forEach(tier => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(tier.r, tier.r + 0.2, tier.h, 24), marbleWhite);
      m.position.set(0, tier.y, -3);
      m.receiveShadow = true;
      worldObjects.add(m);
    });

    const altPed = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.8, 12), goldMat);
    altPed.position.set(0, 1.3, -3);
    worldObjects.add(altPed);

    // 3. Central Hovering, Rotating Primogem Star
    const starGeo = new THREE.OctahedronGeometry(1.2, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.position.set(0, 3.2, -3);
    worldObjects.add(starMesh);
    shrineCrystalMesh = starMesh;

    const starCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
    starMesh.add(starCore);

    const starLight = new THREE.PointLight(0xa855f7, 1.2, 16, 2);
    starLight.position.set(0, 3.2, -3);
    worldObjects.add(starLight);

    // 4. Sanctuary Colonnade: 4 Monumental Marble Pillars
    [
      { x: -5.5, z: -7.5 }, { x: 5.5, z: -7.5 },
      { x: -5.5, z: 1.5 }, { x: 5.5, z: 1.5 }
    ].forEach(p => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 7.5, 12), marbleWhite);
      col.position.set(p.x, 3.75, p.z);
      col.castShadow = true;
      worldObjects.add(col);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 0.4, 8), goldMat);
      cap.position.set(p.x, 7.5, p.z);
      worldObjects.add(cap);
    });

    // 5. Stained-Glass Cosmic Rose Window on Back Wall
    const winRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.25, 8, 32), goldMat);
    winRing.position.set(0, 4.8, -11.8);
    worldObjects.add(winRing);

    const winGlass = new THREE.Mesh(new THREE.CircleGeometry(3.0, 24), new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8
    }));
    winGlass.position.set(0, 4.8, -11.75);
    worldObjects.add(winGlass);

    const roseStar = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), goldMat);
    roseStar.position.set(0, 4.8, -11.6);
    worldObjects.add(roseStar);

    // 6. Two Ornate Tall Braziers with Violet Flames
    [-4.0, 4.0].forEach(bx => {
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0x1e1b4b }));
      brazier.position.set(bx, 0.6, -1.0);
      worldObjects.add(brazier);

      const fire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
      fire.position.set(bx, 1.4, -1.0);
      worldObjects.add(fire);

      const bLight = new THREE.PointLight(0xc084fc, 0.8, 10, 2);
      bLight.position.set(bx, 1.5, -1.0);
      worldObjects.add(bLight);
    });

    // 7. NPC Shrine Maiden "Yae Miko"
    worldObjects.add(createNPCBillboard(11, '✨ Yae Miko', 'Baş Rahibe & Kader Danışmanı', 3.0, -4.5));

    // 8. Incense Urns in corners
    [-11, 11].forEach(ux => {
      const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 1.0, 8), goldMat);
      urn.position.set(ux, 0.5, -8);
      worldObjects.add(urn);
    });
  }

  function buildGuildInterior() {
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });

    // 1. Royal Emerald-Green Runner Carpet Down Center
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(6, 20), new THREE.MeshLambertMaterial({ color: 0x14532d }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.02, 1);
    worldObjects.add(runner);

    // 2. Large Tactical War & Strategy Table (Center)
    const table = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.2, 4.5), darkWood);
    table.position.set(0, 0.6, 0);
    table.castShadow = true;
    worldObjects.add(table);

    // Miniature Topographic Terrain Map on Table
    const map = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.8), new THREE.MeshLambertMaterial({ color: 0x166534 }));
    map.rotation.x = -Math.PI / 2;
    map.position.set(0, 1.22, 0);
    worldObjects.add(map);

    // Mini mountain peaks on map
    [
      { x: -1.4, z: -0.6, h: 0.45 },
      { x: -1.0, z: -0.3, h: 0.35 },
      { x: 1.2, z: 0.5, h: 0.5 }
    ].forEach(m => {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(0.35, m.h, 4), new THREE.MeshLambertMaterial({ color: 0x64748b }));
      peak.position.set(m.x, 1.22 + m.h / 2, m.z);
      worldObjects.add(peak);
    });

    // Red Battle Pin Markers
    [-1.2, 0.8, -0.2].forEach((px, idx) => {
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      pin.position.set(px, 1.35, (idx - 1) * 0.7);
      worldObjects.add(pin);
    });

    // 3. Reception Desk (Left Side)
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 1.6), darkWood);
    desk.position.set(-8.5, 0.6, -4.5);
    worldObjects.add(desk);

    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0xfef3c7 }));
    ledger.position.set(-8.5, 1.25, -4.5);
    worldObjects.add(ledger);

    // NPC Guild Receptionist Katheryne
    worldObjects.add(createNPCBillboard(1, 'Katheryne', 'Maceracılar Loncası Katibi', -8.5, -6.8));

    // 4. Grand Bounty Quest Notice Board (Back Wall)
    const board = new THREE.Mesh(new THREE.BoxGeometry(8.0, 3.5, 0.15), new THREE.MeshLambertMaterial({ color: 0x78350f }));
    board.position.set(0, 4.0, -11.8);
    worldObjects.add(board);

    // 6 Pinned Bounty Posters on Board
    [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0].forEach((px, idx) => {
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
      poster.position.set(px, 4.0 + (idx % 2 === 0 ? 0.2 : -0.2), -11.7);
      worldObjects.add(poster);

      const seal = new THREE.Mesh(new THREE.CircleGeometry(0.08, 6), new THREE.MeshBasicMaterial({ color: 0xb91c1c }));
      seal.position.set(px, 4.45 + (idx % 2 === 0 ? 0.2 : -0.2), -11.68);
      worldObjects.add(seal);
    });

    // 5. Armory & Weapon Racks (Right Wall)
    [2, -4].forEach(rz => {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 2.8), darkWood);
      rack.position.set(14.5, 1.6, rz);
      worldObjects.add(rack);

      [-0.8, 0, 0.8].forEach(sz => {
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.04), steelMat);
        sword.position.set(14.3, 1.6, rz + sz);
        worldObjects.add(sword);
      });
    });

    // Trophy Dragon Skull above Bounty Board
    const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
    skull.position.set(0, 6.4, -11.6);
    worldObjects.add(skull);

    // 6. Practice Dummy in Corner
    const dummyPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2), darkWood);
    dummyPole.position.set(-12, 1.1, 7.5);
    worldObjects.add(dummyPole);
    const dummyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 1.0, 8), new THREE.MeshLambertMaterial({ color: 0xd97706 }));
    dummyBody.position.set(-12, 1.4, 7.5);
    worldObjects.add(dummyBody);

    // 7. Heavy Iron Ring Chandelier
    worldObjects.add(createCeilingChandelier(0, 5.8, 0, 0xf97316));
  }

  // =========================================================================
  // KayKit 3D Medieval Model Loader & Spawner System
  // =========================================================================
  const kaykitModelCache = {};
  let gltfLoaderInstance = null;
  let animatedKayKitProps = [];

  function getGLTFLoader() {
    if (!gltfLoaderInstance) {
      if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'function') {
        gltfLoaderInstance = new THREE.GLTFLoader();
      }
    }
    return gltfLoaderInstance;
  }

  function spawnKayKitModel(url, options = {}) {
    const anchor = new THREE.Group();
    anchor.position.set(options.x || 0, options.y || 0, options.z || 0);
    if (options.rotY !== undefined) anchor.rotation.y = options.rotY;
    if (options.rotX !== undefined) anchor.rotation.x = options.rotX;
    if (options.rotZ !== undefined) anchor.rotation.z = options.rotZ;

    const baseScale = options.scale || 1.0;
    anchor.scale.set(
      (options.scaleX || 1) * baseScale,
      (options.scaleY || 1) * baseScale,
      (options.scaleZ || 1) * baseScale
    );

    const targetParent = options.parent || worldObjects;
    targetParent.add(anchor);

    function setupModelInstance(sourceScene) {
      const clone = sourceScene.clone(true);
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = options.castShadow !== false;
          child.receiveShadow = options.receiveShadow !== false;
          if (child.material) {
            child.material.roughness = 0.75;
            child.material.metalness = 0.05;
            if (child.material.map) {
              child.material.map.magFilter = THREE.NearestFilter;
              child.material.map.minFilter = THREE.LinearMipmapLinearFilter;
            }
          }
        }
      });
      anchor.add(clone);

      if (options.animatedWindmill) {
        let fan = null;
        clone.traverse(child => {
          if (!fan && child.name && child.name.toLowerCase().includes('fan')) {
            fan = child;
          }
        });
        if (fan) {
          animatedKayKitProps.push((delta) => {
            fan.rotation.z += delta * 1.5;
          });
        }
      }
      if (options.animatedWatermill) {
        let wheel = null;
        clone.traverse(child => {
          if (!wheel && child.name && child.name.toLowerCase().includes('wheel')) {
            wheel = child;
          }
        });
        if (wheel) {
          animatedKayKitProps.push((delta) => {
            wheel.rotation.x += delta * 1.8;
          });
        }
      }
      if (options.animatedFlag) {
        const flagMesh = clone.getObjectByName('flag_blue') || clone.getObjectByName('flag_red') || clone.children[0];
        if (flagMesh) {
          const phase = ((options.x || 0) + (options.z || 0)) * 0.7;
          animatedKayKitProps.push((delta, now) => {
            flagMesh.rotation.y = Math.sin(now * 0.0035 + phase) * 0.12;
          });
        }
      }

      if (options.onReady) options.onReady(clone, anchor);
    }

    if (kaykitModelCache[url]) {
      setupModelInstance(kaykitModelCache[url]);
      return anchor;
    }

    const loader = getGLTFLoader();
    if (!loader) {
      const retry = setInterval(() => {
        const l = getGLTFLoader();
        if (l) {
          clearInterval(retry);
          l.load(url, gltf => {
            kaykitModelCache[url] = gltf.scene;
            setupModelInstance(gltf.scene);
          }, undefined, err => console.warn('KayKit load error:', url, err));
        }
      }, 50);
      return anchor;
    }

    loader.load(url, gltf => {
      kaykitModelCache[url] = gltf.scene;
      setupModelInstance(gltf.scene);
    }, undefined, err => console.warn('KayKit load error:', url, err));

    return anchor;
  }

  function createEntrancePortalMat(x, z, color = 0x53fc18) {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(3.0, 1.8);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    group.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.85, 24),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.045, z);
    group.add(ring);

    return group;
  }

  // --- 5. Map Builders & Lush 3D Nature / Landscaping Generators ---
  let swayingFloraList = [];

  function createCentralPlaza() {
    const group = new THREE.Group();

    // 1. Soft Warm Loam / Dirt Underlay Ring (Smooth natural transition into grass, r: 7.2m -> 8.2m)
    const dirtUnderlay = new THREE.Mesh(
      new THREE.RingGeometry(7.1, 8.2, 36),
      new THREE.MeshLambertMaterial({ color: 0x634d36, side: THREE.DoubleSide })
    );
    dirtUnderlay.rotation.x = -Math.PI / 2;
    dirtUnderlay.position.y = 0.012;
    dirtUnderlay.receiveShadow = true;
    group.add(dirtUnderlay);

    // 2. Cobblestone Plaza Floor (radius 7.5m)
    const cobbleTex = createProceduralCobbleTexture(5, 5);
    const plazaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 36),
      new THREE.MeshLambertMaterial({
        map: cobbleTex,
        bumpMap: createProceduralCobbleBumpMap(5, 5),
        bumpScale: 0.025
      })
    );
    plazaFloor.rotation.x = -Math.PI / 2;
    plazaFloor.position.y = 0.018;
    plazaFloor.receiveShadow = true;
    group.add(plazaFloor);

    // 3. Outer Carved Stone Curb Ring (r: 7.25m -> 7.65m)
    const outerRim = new THREE.Mesh(
      new THREE.RingGeometry(7.25, 7.65, 36),
      new THREE.MeshLambertMaterial({ color: 0x52483d, side: THREE.DoubleSide })
    );
    outerRim.rotation.x = -Math.PI / 2;
    outerRim.position.y = 0.025;
    group.add(outerRim);

    // 4. Concentric Decorative Accent Ring (r: 4.7m -> 5.15m)
    const midRing = new THREE.Mesh(
      new THREE.RingGeometry(4.7, 5.15, 36),
      new THREE.MeshLambertMaterial({ color: 0x786e63, side: THREE.DoubleSide })
    );
    midRing.rotation.x = -Math.PI / 2;
    midRing.position.y = 0.024;
    group.add(midRing);

    // 5. Gilded Compass Rose Ring around Landmark Fountain (r: 3.0m -> 3.25m)
    const goldInlay = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.25, 32),
      new THREE.MeshBasicMaterial({ color: 0xd97706, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    goldInlay.rotation.x = -Math.PI / 2;
    goldInlay.position.y = 0.027;
    group.add(goldInlay);

    // 6. 8 Radiating Compass Rose Rays connecting inner ring to mid ring
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xb45309, side: THREE.DoubleSide });
    for (let r = 0; r < 8; r++) {
      const ang = (r * Math.PI) / 4;
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1.6), rayMat);
      ray.rotation.x = -Math.PI / 2;
      ray.rotation.z = -ang;
      ray.position.set(Math.cos(ang) * 3.95, 0.026, Math.sin(ang) * 3.95);
      group.add(ray);
    }

    return group;
  }

  function createStylizedAnimeTree(x, z, variant = 'emerald', scale = 1.0) {
    const tree = new THREE.Group();
    const trunkColor = variant === 'sakura' ? 0x4a2511 : 0x5c3a21;
    const trunkMat = createStylizedMaterial(trunkColor);

    // Sculpted tapered trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.56 * scale, 3.2 * scale, 7), trunkMat);
    trunk.position.y = 1.6 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // 3 Exposed surface roots
    for (let r = 0; r < 3; r++) {
      const rAngle = (r / 3) * Math.PI * 2 + (x * 0.3);
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * scale, 0.24 * scale, 1.1 * scale, 5), trunkMat);
      root.rotation.z = Math.PI / 3;
      root.rotation.y = rAngle;
      root.position.set(Math.cos(rAngle) * 0.45 * scale, 0.22 * scale, Math.sin(rAngle) * 0.45 * scale);
      tree.add(root);
    }

    // Palette by variant
    let colors = [0x15803d, 0x16a34a, 0x22c55e, 0x4ade80];
    if (variant === 'sakura') {
      colors = [0xdb2777, 0xec4899, 0xf472b6, 0xfbcfe8];
    } else if (variant === 'golden') {
      colors = [0xd97706, 0xf59e0b, 0xfbbf24, 0xfde047];
    }

    const mats = colors.map(c => createStylizedMaterial(c));

    // Multi-layered lush anime foliage puffs
    const puffs = [
      { ox: 0, oy: 3.9, oz: 0, r: 2.05, m: 1 },
      { ox: -1.15, oy: 3.3, oz: 0.65, r: 1.45, m: 0 },
      { ox: 1.15, oy: 3.35, oz: 0.55, r: 1.4, m: 2 },
      { ox: 0.1, oy: 3.4, oz: -1.1, r: 1.5, m: 0 },
      { ox: -0.65, oy: 4.65, oz: -0.35, r: 1.35, m: 2 },
      { ox: 0.6, oy: 4.8, oz: 0.3, r: 1.3, m: 3 },
      { ox: 0, oy: 5.35, oz: 0, r: 1.15, m: 3 }
    ];

    const canopyGroup = new THREE.Group();
    for (const p of puffs) {
      const geo = new THREE.DodecahedronGeometry(p.r * scale, 1);
      const puffMesh = new THREE.Mesh(geo, mats[p.m]);
      puffMesh.position.set(p.ox * scale, p.oy * scale, p.oz * scale);
      puffMesh.scale.set(1.08, 0.86, 1.08);
      puffMesh.castShadow = true;
      puffMesh.receiveShadow = true;
      canopyGroup.add(puffMesh);
    }
    tree.add(canopyGroup);

    // Subtle ground contact shadow
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(2.1 * scale, 16),
      new THREE.MeshBasicMaterial({ color: 0x064e3b, transparent: true, opacity: 0.28 })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.015;
    tree.add(sh);

    tree.position.set(x, 0, z);
    swayingFloraList.push({ mesh: canopyGroup, phase: (x + z) * 0.5, amp: 0.022, speed: 0.002 });
    return tree;
  }

  function createStylizedBush(x, z, flowerColor = null, scale = 1.0) {
    const bush = new THREE.Group();
    const matDark = createStylizedMaterial(0x15803d);
    const matLight = createStylizedMaterial(0x22c55e);

    const p1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 * scale, 1), matDark);
    p1.position.set(0, 0.42 * scale, 0);
    p1.scale.set(1.2, 0.85, 1.2);
    p1.castShadow = true;
    bush.add(p1);

    const p2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48 * scale, 1), matLight);
    p2.position.set(0.38 * scale, 0.35 * scale, 0.22 * scale);
    bush.add(p2);

    const p3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 * scale, 1), matLight);
    p3.position.set(-0.35 * scale, 0.36 * scale, -0.18 * scale);
    bush.add(p3);

    if (flowerColor) {
      const fMat = new THREE.MeshBasicMaterial({ color: flowerColor });
      const budPositions = [
        [0.15, 0.72, 0.25], [-0.28, 0.62, 0.32], [0.42, 0.58, -0.15], [-0.15, 0.68, -0.32]
      ];
      for (const [bx, by, bz] of budPositions) {
        const bud = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 * scale, 0), fMat);
        bud.position.set(bx * scale, by * scale, bz * scale);
        bush.add(bud);
      }
    }

    bush.position.set(x, 0, z);
    return bush;
  }

  function createMossyBoulder(x, z, scale = 1.0) {
    const group = new THREE.Group();
    const rockMat = createStylizedMaterial(0x64748b);
    const mossMat = createStylizedMaterial(0x16a34a);

    const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 * scale, 0), rockMat);
    mainRock.position.y = 0.45 * scale;
    mainRock.scale.set(1.25, 0.82, 1.1);
    mainRock.rotation.set(0.2, x * 0.4, 0.1);
    mainRock.castShadow = true;
    mainRock.receiveShadow = true;
    group.add(mainRock);

    const mossCap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68 * scale, 0), mossMat);
    mossCap.position.set(0, 0.68 * scale, 0);
    mossCap.scale.set(1.15, 0.45, 1.0);
    group.add(mossCap);

    const subRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 * scale, 0), rockMat);
    subRock.position.set(0.65 * scale, 0.25 * scale, 0.3 * scale);
    subRock.castShadow = true;
    group.add(subRock);

    group.position.set(x, 0, z);
    return group;
  }

  function createWoodenFence(x, z, length = 6, rotY = 0) {
    const group = new THREE.Group();
    const woodMat = createStylizedMaterial(0x78350f);
    const postCount = Math.max(2, Math.round(length / 2) + 1);
    const step = length / (postCount - 1);

    for (let i = 0; i < postCount; i++) {
      const px = -length / 2 + i * step;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.18), woodMat);
      post.position.set(px, 0.52, 0);
      post.castShadow = true;
      group.add(post);
    }

    [0.35, 0.78].forEach(ry => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length + 0.1, 0.10, 0.08), woodMat);
      rail.position.set(0, ry, 0);
      rail.castShadow = true;
      group.add(rail);
    });

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    return group;
  }

  function isValidTownGrassSpot(x, z) {
    // Skip central fountain plaza (radius 7.8m)
    if (Math.hypot(x, z) < 7.8) return false;
    // Skip North Avenue (Plaza to Cathedral)
    if (Math.abs(x) < 2.7 && z >= -27.0 && z <= 0) return false;
    // Skip South Avenue (Plaza to Bridge Ramp)
    if (Math.abs(x) < 2.7 && z >= 0 && z <= 18.5) return false;
    // Skip West Avenue (Plaza to Trade Mart & Blacksmith)
    if (Math.abs(z) < 2.7 && x >= -25.0 && x <= 0) return false;
    // Skip East Avenue (Plaza to Tavern & Patio)
    if (Math.abs(z) < 2.7 && x >= 0 && x <= 25.0) return false;
    // Skip secondary branch paths
    if (Math.abs(x - (-14)) < 2.0 && z >= 0 && z <= 10) return false;
    if (Math.abs(x - 14) < 2.0 && z >= 0 && z <= 10) return false;
    // Skip river canal & embankments
    if (z > 19.5 && z < 28.5) return false;
    // Skip Trade Mart & Market Stalls (-24, -14)
    if (x > -31 && x < -16 && z > -20 && z < -6) return false;
    // Skip Tavern & Patio (24, -14)
    if (x > 16 && x < 31 && z > -20 && z < -1) return false;
    // Skip Gacha Cathedral (0, -34)
    if (Math.abs(x) < 9 && z < -25) return false;
    // Skip Guild (-24, 14)
    if (x > -31 && x < -17 && z > 9 && z < 20) return false;
    // Skip Stone Well (-14, 6)
    if (Math.hypot(x - (-14), z - 6) < 2.6) return false;
    // Skip Scenic Gazebo (24, 14)
    if (Math.hypot(x - 24, z - 14) < 4.8) return false;
    // Skip Battle Portal landing (0, 32)
    if (Math.hypot(x, z - 32) < 5.5) return false;
    return true;
  }

  function initWindAtmosphereParticles() {
    if (windAtmosphereParticles && scene) {
      scene.remove(windAtmosphereParticles);
    }
    const count = 220;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    windAtmosphereData = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 70;
      const y = 0.5 + Math.random() * 7;
      const z = (Math.random() - 0.5) * 70;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // 40% Sakura blush pink petals, 60% golden dandelion fluff / ethereal spores
      const isSakura = Math.random() < 0.4;
      if (isSakura) {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.72 + Math.random() * 0.14;
        colors[i * 3 + 2] = 0.82 + Math.random() * 0.12;
        sizes[i] = 0.22 + Math.random() * 0.12;
      } else {
        colors[i * 3] = 0.98;
        colors[i * 3 + 1] = 0.96;
        colors[i * 3 + 2] = 0.80 + Math.random() * 0.15;
        sizes[i] = 0.15 + Math.random() * 0.08;
      }

      windAtmosphereData.push({
        vx: 0.012 + Math.random() * 0.016,
        vy: -0.002 - Math.random() * 0.003,
        vz: 0.008 + Math.random() * 0.012,
        wobbleSpeed: 0.002 + Math.random() * 0.0025,
        wobbleAmp: 0.006 + Math.random() * 0.006,
        phase: Math.random() * Math.PI * 2
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Circular soft glowing particle canvas texture
    const pCvs = document.createElement('canvas');
    pCvs.width = 32;
    pCvs.height = 32;
    const pCtx = pCvs.getContext('2d');
    const grad = pCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pCtx.fillStyle = grad;
    pCtx.beginPath();
    pCtx.arc(16, 16, 15, 0, Math.PI * 2);
    pCtx.fill();

    const pTex = new THREE.CanvasTexture(pCvs);
    const pMat = new THREE.PointsMaterial({
      size: 0.32,
      map: pTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    windAtmosphereParticles = new THREE.Points(geometry, pMat);
    worldObjects.add(windAtmosphereParticles);
  }

  function populateLush3DGrassAndWildflowers(mode = 'town') {
    const dummy = new THREE.Object3D();

    // 1. Realistic 5-blade curved grass tufts with GPU vertex wind shader
    const tuftGeo = createRealisticGrassTuftGeometry();
    const grassMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    applyGrassWindShader(grassMat);

    const totalTufts = mode === 'town' ? 2400 : 1500;
    const instMesh = new THREE.InstancedMesh(tuftGeo, grassMat, totalTufts);
    instMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    let placed = 0;
    let attempts = 0;
    while (placed < totalTufts && attempts < totalTufts * 4) {
      attempts++;
      let gx, gz;
      if (mode === 'town') {
        gx = (Math.random() - 0.5) * 88;
        gz = (Math.random() - 0.5) * 86;
        if (!isValidTownGrassSpot(gx, gz)) continue;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = 4.5 + Math.random() * 32;
        gx = Math.cos(angle) * dist;
        gz = Math.sin(angle) * dist;
        if (Math.hypot(gx, gz - 14) < 9.5 || Math.hypot(gx, gz + 32) < 4.5) continue;
      }

      const s = 0.72 + Math.random() * 0.65;
      dummy.position.set(gx, 0, gz);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.15,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.15
      );
      dummy.scale.set(s, s * (0.85 + Math.random() * 0.45), s);
      dummy.updateMatrix();
      instMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    instMesh.count = placed;
    instMesh.instanceMatrix.needsUpdate = true;
    worldObjects.add(instMesh);

    // 2. 4 Batches of 3D Wildflowers (Gold Dandelions, White Daisies, Lilac Lavender, Sky Cecilias)
    const flowerGeo = new THREE.DodecahedronGeometry(0.13, 0);
    flowerGeo.translate(0, 0.38, 0);
    const flowerPalette = mode === 'battle_zone_1'
      ? [0x2dd4bf, 0xa855f7, 0xfacc15, 0x38bdf8]
      : [0xfef08a, 0xf472b6, 0x38bdf8, 0xc084fc];

    const flowersPerColor = mode === 'town' ? 95 : 65;
    for (let f = 0; f < flowerPalette.length; f++) {
      const fMat = new THREE.MeshBasicMaterial({ color: flowerPalette[f] });
      const fInst = new THREE.InstancedMesh(flowerGeo, fMat, flowersPerColor);
      let fPlaced = 0;
      let fAttempts = 0;
      while (fPlaced < flowersPerColor && fAttempts < flowersPerColor * 4) {
        fAttempts++;
        let fx, fz;
        if (mode === 'town') {
          fx = (Math.random() - 0.5) * 82;
          fz = (Math.random() - 0.5) * 80;
          if (!isValidTownGrassSpot(fx, fz)) continue;
        } else {
          const angle = Math.random() * Math.PI * 2;
          const dist = 5 + Math.random() * 30;
          fx = Math.cos(angle) * dist;
          fz = Math.sin(angle) * dist;
          if (Math.hypot(fx, fz - 14) < 9.5) continue;
        }

        const fs = 0.8 + Math.random() * 0.5;
        dummy.position.set(fx, 0, fz);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.scale.set(fs, fs, fs);
        dummy.updateMatrix();
        fInst.setMatrixAt(fPlaced, dummy.matrix);
        fPlaced++;
      }
      fInst.count = fPlaced;
      fInst.instanceMatrix.needsUpdate = true;
      worldObjects.add(fInst);
    }

    // 3. Initialize Floating Atmospheric Wind Particles (Sakura petals & Dandelion fluff)
    initWindAtmosphereParticles();
  }

  function clearWorld() {
    windAtmosphereParticles = null;
    windAtmosphereData = [];
    animatedCats = [];
    animatedNPCs = [];
    fountainParticlesData = [];
    chimneySmokeData = [];
    firefliesData = [];
    shrineAuraData = [];
    swayingFloraList = [];
    animatedKayKitProps = [];
    canalWaterMesh = null;
    shrineCrystalMesh = null;
    activeCombatMobs = [];
    activeDropGems = [];
    activeSlashTrails = [];
    activeProjectiles = [];
    targetReticleMesh = null;
    lockedTargetMob = null;

    while (worldObjects.children.length > 0) {
      worldObjects.remove(worldObjects.children[0]);
    }
  }

  function buildTownMap() {
    clearWorld();
    currentMap = 'town';
    setMapAtmosphere('town');
    detachCombatWeapon();
    document.getElementById('combat-hud')?.classList.add('hidden');
    document.getElementById('combat-boss-hud')?.classList.add('hidden');
    document.getElementById('combat-combo-hud')?.classList.add('hidden');
    document.getElementById('ui-location').textContent = 'Kasaba Meydanı';

    // 1. Terrain Grass (Expansive 120x120 Meadow)
    const grassGeo = new THREE.PlaneGeometry(120, 120, 32, 32);
    const grassMat = new THREE.MeshLambertMaterial({
      map: createProceduralGrassTexture(),
      bumpMap: createProceduralGrassNormalMap(),
      bumpScale: 0.035
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    worldObjects.add(grass);

    // 2. Human-Scaled Organic Cobblestone Avenues (4.8m Width with Warm Loam Underlays & Curbs)
    const roadDirtMat = new THREE.MeshLambertMaterial({ color: 0x634d36 });
    const roadCurbMat = new THREE.MeshLambertMaterial({ color: 0x52483d });

    // A) North Avenue (Plaza z: -7.0 to Cathedral Steps z: -25.5, length: 18.5m, center z: -16.25)
    const northDirt = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 18.5), roadDirtMat);
    northDirt.rotation.x = -Math.PI / 2;
    northDirt.position.set(0, 0.012, -16.25);
    northDirt.receiveShadow = true;
    worldObjects.add(northDirt);

    const northRoadMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(2, 6),
      bumpMap: createProceduralCobbleBumpMap(2, 6),
      bumpScale: 0.025
    });
    const northRoad = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 18.5), northRoadMat);
    northRoad.rotation.x = -Math.PI / 2;
    northRoad.position.set(0, 0.020, -16.25);
    northRoad.receiveShadow = true;
    worldObjects.add(northRoad);

    [-2.45, 2.45].forEach(cx => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 18.5), roadCurbMat);
      curb.position.set(cx, 0.032, -16.25);
      curb.receiveShadow = true;
      worldObjects.add(curb);
    });

    // B) South River Avenue (Plaza z: 7.0 to Bridge Ramp z: 18.0, length: 11.0m, center z: 12.5)
    const southDirt = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 11.0), roadDirtMat);
    southDirt.rotation.x = -Math.PI / 2;
    southDirt.position.set(0, 0.012, 12.5);
    southDirt.receiveShadow = true;
    worldObjects.add(southDirt);

    const southRoadMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(2, 4),
      bumpMap: createProceduralCobbleBumpMap(2, 4),
      bumpScale: 0.025
    });
    const southRoad = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 11.0), southRoadMat);
    southRoad.rotation.x = -Math.PI / 2;
    southRoad.position.set(0, 0.020, 12.5);
    southRoad.receiveShadow = true;
    worldObjects.add(southRoad);

    [-2.45, 2.45].forEach(cx => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 11.0), roadCurbMat);
      curb.position.set(cx, 0.032, 12.5);
      curb.receiveShadow = true;
      worldObjects.add(curb);
    });

    // C) West Avenue (Plaza x: -7.0 to Trade Mart x: -24.0, length: 17.0m, center x: -15.5)
    const westDirt = new THREE.Mesh(new THREE.PlaneGeometry(17.0, 5.4), roadDirtMat);
    westDirt.rotation.x = -Math.PI / 2;
    westDirt.position.set(-15.5, 0.012, 0);
    westDirt.receiveShadow = true;
    worldObjects.add(westDirt);

    const westRoadMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(6, 2),
      bumpMap: createProceduralCobbleBumpMap(6, 2),
      bumpScale: 0.025
    });
    const westRoad = new THREE.Mesh(new THREE.PlaneGeometry(17.0, 4.8), westRoadMat);
    westRoad.rotation.x = -Math.PI / 2;
    westRoad.position.set(-15.5, 0.020, 0);
    westRoad.receiveShadow = true;
    worldObjects.add(westRoad);

    [-2.45, 2.45].forEach(cz => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(17.0, 0.06, 0.22), roadCurbMat);
      curb.position.set(-15.5, 0.032, cz);
      curb.receiveShadow = true;
      worldObjects.add(curb);
    });

    // D) East Avenue (Plaza x: 7.0 to Tavern Patio x: 24.0, length: 17.0m, center x: 15.5)
    const eastDirt = new THREE.Mesh(new THREE.PlaneGeometry(17.0, 5.4), roadDirtMat);
    eastDirt.rotation.x = -Math.PI / 2;
    eastDirt.position.set(15.5, 0.012, 0);
    eastDirt.receiveShadow = true;
    worldObjects.add(eastDirt);

    const eastRoadMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(6, 2),
      bumpMap: createProceduralCobbleBumpMap(6, 2),
      bumpScale: 0.025
    });
    const eastRoad = new THREE.Mesh(new THREE.PlaneGeometry(17.0, 4.8), eastRoadMat);
    eastRoad.rotation.x = -Math.PI / 2;
    eastRoad.position.set(15.5, 0.020, 0);
    eastRoad.receiveShadow = true;
    worldObjects.add(eastRoad);

    [-2.45, 2.45].forEach(cz => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(17.0, 0.06, 0.22), roadCurbMat);
      curb.position.set(15.5, 0.032, cz);
      curb.receiveShadow = true;
      worldObjects.add(curb);
    });

    // E) Flagstone Stepping Stone Secondary Branch Paths
    // Branch 1: Toward Guild Hall & Relocated Well (from West Avenue x: -14, z: 2.5 -> 9.5)
    const stepStoneMat = new THREE.MeshLambertMaterial({ color: 0x78716c });
    for (let sz = 3.0; sz <= 9.0; sz += 1.5) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.05, 7), stepStoneMat);
      stone.position.set(-14.0 + (Math.sin(sz * 2) * 0.15), 0.025, sz);
      stone.rotation.y = sz * 0.8;
      stone.receiveShadow = true;
      worldObjects.add(stone);
    }
    // Branch 2: Toward River Watermill & Gazebo (from East Avenue x: 16, z: 2.5 -> 9.5)
    for (let sz = 3.0; sz <= 9.0; sz += 1.5) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.05, 7), stepStoneMat);
      stone.position.set(16.0 + (Math.cos(sz * 2) * 0.15), 0.025, sz);
      stone.rotation.y = sz * 0.8;
      stone.receiveShadow = true;
      worldObjects.add(stone);
    }

    // 3. Central Plaza & Focal Landmark Fountain
    worldObjects.add(createCentralPlaza());
    worldObjects.add(createCentralFountain());

    // Central Plaza Gathering Vignettes (Avenues 100% clear for player walking)
    // A) 4 Curved Artisan Wooden Benches in Diagonal Plaza Gathering Nooks (r: 5.2m at ±3.7, ±3.7)
    worldObjects.add(createBench(-3.7, -3.7, Math.PI * 0.25));
    worldObjects.add(createBench(3.7, -3.7, -Math.PI * 0.25));
    worldObjects.add(createBench(-3.7, 3.7, Math.PI * 0.75));
    worldObjects.add(createBench(3.7, 3.7, -Math.PI * 0.75));

    // B) 4 Terracotta Flower Urns Overflowing with Blooms beside each Bench
    worldObjects.add(createFlowerUrnPlanter(-4.8, -4.8, 1.05));
    worldObjects.add(createFlowerUrnPlanter(4.8, -4.8, 1.05));
    worldObjects.add(createFlowerUrnPlanter(-4.8, 4.8, 1.05));
    worldObjects.add(createFlowerUrnPlanter(4.8, 4.8, 1.05));

    // C) Handcrafted Village Directional Signpost with Iron Lantern (Plaza North-East nook)
    worldObjects.add(createVillageSignpost(4.2, -2.6, -0.2));

    // D) Charming Rustic Produce Wagon with Fresh Apples, Pumpkins & Sleeping Cat (Plaza South-West nook)
    worldObjects.add(createRusticProduceWagon(-4.6, 2.8, 0.35));

    // 4. Southern River Canal & Arched Stone Bridge
    // Canal Channel at z = 24 (spans x: -60 to 60)
    const canalBed = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      new THREE.MeshLambertMaterial({ color: 0x0f172a })
    );
    canalBed.rotation.x = -Math.PI / 2;
    canalBed.position.set(0, -0.4, 24);
    canalBed.receiveShadow = true;
    worldObjects.add(canalBed);

    // River water surface with animated ripples
    const canalWaterGeo = new THREE.PlaneGeometry(120, 7.8);
    const canalWaterMat = new THREE.MeshLambertMaterial({
      map: createProceduralWaterTexture(),
      transparent: true,
      opacity: 0.88
    });
    canalWaterMesh = new THREE.Mesh(canalWaterGeo, canalWaterMat);
    canalWaterMesh.rotation.x = -Math.PI / 2;
    canalWaterMesh.position.set(0, 0.04, 24);
    worldObjects.add(canalWaterMesh);

    // Embankment stone retaining walls
    const bankMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    [20.1, 27.9].forEach(bz => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(120, 0.7, 0.4), bankMat);
      wall.position.set(0, 0.25, bz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      worldObjects.add(wall);
    });

    // Floating water lilies in canal
    [
      { x: -24, z: 22.8 }, { x: -16, z: 25.2 }, { x: -8, z: 23.4 },
      { x: 8, z: 24.8 }, { x: 18, z: 22.6 }, { x: 28, z: 25.0 }
    ].forEach(p => worldObjects.add(createWaterLily(p.x, p.z)));

    // Wooden Fishing Piers on Canal Banks
    worldObjects.add(createFishingPier(-14, 24));
    worldObjects.add(createFishingPier(14, 24));

    // Shimmering Fish Schools in River Water
    [
      { x: -22, z: 24.5 }, { x: -8, z: 23.5 },
      { x: 8, z: 24.5 }, { x: 22, z: 23.5 }
    ].forEach(p => worldObjects.add(createRiverFishSchool(p.x, p.z)));

    // Arched Stone Bridge at x = 0, z = 24 with Approach Ramps & Textured Cobblestone Deck
    const bridgeGroup = new THREE.Group();
    const bridgeMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(2, 3),
      bumpMap: createProceduralCobbleBumpMap(2, 3),
      bumpScale: 0.025
    });
    const bridgeSideMat = new THREE.MeshLambertMaterial({ color: 0x334155 });

    // 1. Central Elevated Bridge Deck (z: 21.0 to 27.0, surface at y = 0.65)
    const bridgeDeckMesh = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.4, 6.0), bridgeMat);
    bridgeDeckMesh.position.set(0, 0.45, 24);
    bridgeDeckMesh.castShadow = true;
    bridgeDeckMesh.receiveShadow = true;
    bridgeGroup.add(bridgeDeckMesh);

    // Stone Arch Support Foundation underneath deck spanning the canal
    const archSupport = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.55, 7.8), bridgeSideMat);
    archSupport.position.set(0, -0.05, 24);
    bridgeGroup.add(archSupport);

    // 2. North Approach Ramp (z: 18.0 to 21.0, length 3.0, smoothly ascending from y = 0.0 to 0.65)
    const rampAngle = Math.atan2(0.65, 3.0);
    const rampLen = Math.hypot(3.0, 0.65);
    const northRamp = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.25, rampLen), bridgeMat);
    northRamp.rotation.x = -rampAngle;
    northRamp.position.set(0, 0.203, 19.5);
    northRamp.castShadow = true;
    northRamp.receiveShadow = true;
    bridgeGroup.add(northRamp);

    // 3. South Exit Ramp (z: 27.0 to 30.0, length 3.0, smoothly descending from y = 0.65 to 0.0)
    const southRamp = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.25, rampLen), bridgeMat);
    southRamp.rotation.x = rampAngle;
    southRamp.position.set(0, 0.203, 28.5);
    southRamp.castShadow = true;
    southRamp.receiveShadow = true;
    bridgeGroup.add(southRamp);

    // Stone Curb Borders and Parapet Walls flanking the Bridge and Ramps
    [-3.35, 3.35].forEach(rx => {
      // Central Curb
      const cCurb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 6.0), bridgeSideMat);
      cCurb.position.set(rx, 0.69, 24);
      bridgeGroup.add(cCurb);

      // North Ramp Curb
      const nCurb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, rampLen), bridgeSideMat);
      nCurb.rotation.x = -rampAngle;
      nCurb.position.set(rx, 0.37, 19.5);
      bridgeGroup.add(nCurb);

      // South Ramp Curb
      const sCurb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, rampLen), bridgeSideMat);
      sCurb.rotation.x = rampAngle;
      sCurb.position.set(rx, 0.37, 28.5);
      bridgeGroup.add(sCurb);

      // Timber Railings spanning the whole bridge
      const railMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
      const railMid = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 6.0), railMat);
      railMid.position.set(rx, 1.15, 24);
      railMid.castShadow = true;
      bridgeGroup.add(railMid);

      const railNorth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, rampLen), railMat);
      railNorth.rotation.x = -rampAngle;
      railNorth.position.set(rx, 0.83, 19.5);
      railNorth.castShadow = true;
      bridgeGroup.add(railNorth);

      const railSouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, rampLen), railMat);
      railSouth.rotation.x = rampAngle;
      railSouth.position.set(rx, 0.83, 28.5);
      railSouth.castShadow = true;
      bridgeGroup.add(railSouth);

      // Lantern Pedestals at North Entrance (z=18), Mid-Span (z=24), South Landing (z=30)
      [
        { z: 18.0, y: 0.55 },
        { z: 24.0, y: 0.95 },
        { z: 30.0, y: 0.55 }
      ].forEach(p => {
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 0.65), bridgeSideMat);
        ped.position.set(rx, p.y, p.z);
        ped.castShadow = true;
        bridgeGroup.add(ped);

        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        bl.position.set(rx, p.y + 0.75, p.z);
        bridgeGroup.add(bl);

        const blLight = new THREE.PointLight(0xfef08a, 0.65, 8, 2);
        blLight.position.set(rx, p.y + 0.75, p.z);
        bridgeGroup.add(blLight);
      });
    });
    worldObjects.add(bridgeGroup);

    // Portallar Meydanı (Portals Plaza) at South Bridge Landing (z = 32)
    // Symmetrically hosts Kadim Zindan Portalı (x = -6.5, z = 32) and Gladyatör Arenası (x = 6.5, z = 32)
    const plazaGeo = new THREE.BoxGeometry(22, 0.12, 10);
    const plazaMat = new THREE.MeshLambertMaterial({
      map: createProceduralCobbleTexture(3, 2),
      bumpMap: createProceduralCobbleBumpMap(3, 2),
      bumpScale: 0.025
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.set(0, 0.06, 32);
    plazaMesh.receiveShadow = true;
    worldObjects.add(plazaMesh);

    // Stone pathway connector from bridge landing (z=27) into the plaza
    const pathGeo = new THREE.BoxGeometry(7, 0.1, 4);
    const pathMesh = new THREE.Mesh(pathGeo, plazaMat);
    pathMesh.position.set(0, 0.05, 27);
    pathMesh.receiveShadow = true;
    worldObjects.add(pathMesh);

    // Plaza decorative street lanterns
    [-10, 10].forEach(lx => {
      [28, 36].forEach(lz => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x334155 }));
        post.position.set(lx, 1.1, lz);
        worldObjects.add(post);
        const lamp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        lamp.position.set(lx, 2.2, lz);
        worldObjects.add(lamp);
        const lLight = new THREE.PointLight(0xfef08a, 0.5, 6, 2);
        lLight.position.set(lx, 2.2, lz);
        worldObjects.add(lLight);
      });
    });

    // West Side (Left): Ancient Dungeon Portal Gate at (-6.5, 32)
    worldObjects.add(createBattlePortalGate(-6.5, 32));

    // East Side (Right): Gladiator PvP Arena Portal Gate at (6.5, 32)
    worldObjects.add(createPvPArenaPortalGate(6.5, 32));

    // 5. Authentic KayKit 3D Medieval Architectural Buildings & Landmarks (Varied Stylized Color Palette)
    // A) Takas Pazarı & Demirci Ocağı (Blacksmith & Trade Mart) - North-West Quarter (-24, -14)
    worldObjects.add(createEntrancePortalMat(-24, -10.0, 0x53fc18));
    spawnKayKitModel('/assets/models/kaykit/buildings/yellow/building_blacksmith_yellow.gltf', {
      x: -24, z: -14, scale: 8.2
    });
    // Medieval Market Stall tucked beside Trade Mart (Striped Red Canvas)
    spawnKayKitModel('/assets/models/kaykit/buildings/red/building_market_red.gltf', {
      x: -18.5, z: -7.5, rotY: Math.PI / 2, scale: 6.2
    });
    // Blacksmith & Trade Props against building wall
    spawnKayKitModel('/assets/models/kaykit/decoration/props/weaponrack.gltf', {
      x: -21.0, z: -9.5, rotY: Math.PI / 2, scale: 3.8
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/sack.gltf', {
      x: -17.5, z: -9.5, scale: 3.2
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/wheelbarrow.gltf', {
      x: -19.5, z: -10.5, rotY: -0.4, scale: 3.2
    });

    // B) Cat's Tail Taverna - North-East Quarter (24, -14) (Warm Terracotta Red Shingles)
    chimneyPos = { x: 26.8, y: 11.5, z: -16.2 };
    worldObjects.add(createEntrancePortalMat(24, -10.0, 0x53fc18));
    spawnKayKitModel('/assets/models/kaykit/buildings/red/building_tavern_red.gltf', {
      x: 24, z: -14, scale: 8.2
    });
    // Cat's Tail Outdoor Patio with Parasols and Tables (24, -4)
    worldObjects.add(createTavernPatio(24, -4));
    // Tavern Beer Barrels & Crates
    spawnKayKitModel('/assets/models/kaykit/decoration/props/barrel.gltf', {
      x: 19.5, z: -5.5, scale: 3.2
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/barrel.gltf', {
      x: 18.2, z: -6.8, scale: 3.0
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/crate_A_big.gltf', {
      x: 28.5, z: -6.0, scale: 3.2
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/crate_B_small.gltf', {
      x: 28.5, y: 1.25, z: -6.0, scale: 2.8
    });

    // C) Dilek Tapınağı (Gacha Cathedral) - Grand North Sanctuary (0, -34) (Celestial Blue & Gold)
    worldObjects.add(createEntrancePortalMat(0, -25.5, 0xa855f7));
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_church_blue.gltf', {
      x: 0, z: -34, scale: 10.5
    });
    // Floating Celestial Star Crystal
    const crystalGeo = new THREE.OctahedronGeometry(1.0, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, wireframe: true });
    shrineCrystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    shrineCrystalMesh.position.set(0, 7.2, -25.5);
    const innerCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65, 0),
      new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.85 })
    );
    shrineCrystalMesh.add(innerCrystal);
    worldObjects.add(shrineCrystalMesh);
    // Heraldic Royal Banners framing the Cathedral
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: -6.5, z: -26.5, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: 6.5, z: -26.5, scale: 4.5, animatedFlag: true
    });

    // D) Maceracılar Loncası (Guild Hall / Barracks) - South-West Quarter (-24, 14)
    worldObjects.add(createEntrancePortalMat(-24, 10.0, 0x53fc18));
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_barracks_blue.gltf', {
      x: -24, z: 14, scale: 8.2
    });
    worldObjects.add(createNoticeBoard(-17, 8, 0));
    // Guild Archery & Weapon Training Yard
    spawnKayKitModel('/assets/models/kaykit/decoration/props/target.gltf', {
      x: -17, z: 18.0, rotY: Math.PI / 2, scale: 3.8
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/bucket_arrows.gltf', {
      x: -17, z: 16.0, scale: 3.2
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/weaponrack.gltf', {
      x: -17, z: 11.5, rotY: Math.PI / 2, scale: 3.8
    });

    // E) Scenic Waterside Gazebo & Garden - South-East Quarter (24, 14)
    worldObjects.add(createScenicGazebo(24, 14));

    // F) Yeni Eklenen KayKit 3D Şehir Yapıları ve Anıtları (Zengin Renk Paleti)
    // 1. Taş Meydan Kuyusu (Central Stone Well) - Relocated to West Courtyard beside Guild (Yellow Roof)
    spawnKayKitModel('/assets/models/kaykit/buildings/yellow/building_well_yellow.gltf', {
      x: -14, z: 6.0, scale: 5.2
    });
    // 2. Dönen Su Değirmeni (Rotating River Watermill) - Emerald Green Roof by Canal
    spawnKayKitModel('/assets/models/kaykit/buildings/green/building_watermill_green.gltf', {
      x: 16, z: 19.8, rotY: Math.PI, scale: 7.5, animatedWatermill: true
    });
    // 3. Tepedeki Dönen Yel Değirmeni (Rotating Hill Windmill) - Golden Amber Yellow Roof
    spawnKayKitModel('/assets/models/kaykit/buildings/yellow/building_windmill_yellow.gltf', {
      x: 36, z: -26, rotY: -Math.PI * 0.25, scale: 8.5, animatedWindmill: true
    });
    // 4. Kuzeybatı Kalesi & Hisar (North-West Castle Keep)
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_castle_blue.gltf', {
      x: -36, z: -34, rotY: Math.PI * 0.25, scale: 8.5
    });
    // 5. Şirin Ahşap Kasaba Evleri (Residential Houses in Warm Colors)
    spawnKayKitModel('/assets/models/kaykit/buildings/red/building_home_A_red.gltf', {
      x: 33, z: 0, rotY: -Math.PI / 2, scale: 7.8
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/yellow/building_home_B_yellow.gltf', {
      x: -33, z: 0, rotY: Math.PI / 2, scale: 7.8
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/green/building_home_B_green.gltf', {
      x: 27, z: -26, rotY: Math.PI / 4, scale: 7.8
    });
    // 6. Şehir Sınır Gözetleme Kuleleri (Stone Watchtowers)
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_tower_A_blue.gltf', {
      x: 40, z: -38, scale: 8.2
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_tower_B_blue.gltf', {
      x: -40, z: 26, scale: 8.2
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_tower_A_blue.gltf', {
      x: 16, z: 38, scale: 8.2
    });

    // 7. Portallar Meydanı Asil Süslemeleri (z = 32):
    // Zindan Portalı Yanı (Sol Taraf: -6.5, 32):
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: -9.5, z: 32, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/weaponrack.gltf', {
      x: -11.0, z: 34.5, rotY: 0.2, scale: 3.5
    });
    // Gladyatör Arenası Girişi (Sağ Taraf: 6.5, 32):
    spawnKayKitModel('/assets/models/kaykit/buildings/neutral/wall_straight.gltf', {
      x: 6.5, z: 36.8, scale: 4.5
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: 4.2, z: 34.5, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_red.gltf', {
      x: 8.8, z: 34.5, scale: 4.5, animatedFlag: true
    });

    // 8. KayKit 3D Doğal Çevre, Orman ve Nehir Objeleri (Gerçekçi Büyük Boyut)
    // Çam ve Meşe Kümeleri
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/trees_A_large.gltf', { x: -32, z: -20, scale: 7.5 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/trees_B_large.gltf', { x: 34, z: -14, scale: 7.5 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/trees_A_large.gltf', { x: -34, z: 12, scale: 7.2 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/trees_B_large.gltf', { x: 32, z: 26, scale: 7.5 });
    // Tekil Ağaçlar (Clear of grand avenue corridors)
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/tree_single_A.gltf', { x: -10, z: -18, scale: 6.2 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/tree_single_B.gltf', { x: 10, z: -18, scale: 6.2 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/tree_single_A.gltf', { x: -9.5, z: 17, scale: 6.0 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/tree_single_B.gltf', { x: 9.5, z: 17, scale: 6.0 });
    // 3D Nehir Boyu ve Köşe Kayaları
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/rock_single_A.gltf', { x: -20, z: 20.2, scale: 6.0 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/rock_single_B.gltf', { x: 20, z: 27.8, scale: 6.0 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/rock_single_C.gltf', { x: -38, z: 36, scale: 6.5 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/rock_single_D.gltf', { x: 38, z: 36, scale: 6.5 });
    // 3D Nehir Nilüferleri ve Sazlıklar
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/waterlily_A.gltf', { x: -12, y: 0.05, z: 23.5, scale: 3.2 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/waterlily_B.gltf', { x: 12, y: 0.05, z: 24.5, scale: 3.2 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/waterplant_A.gltf', { x: -6, y: 0.05, z: 21.0, scale: 3.6 });
    spawnKayKitModel('/assets/models/kaykit/decoration/nature/waterplant_A.gltf', { x: 6, y: 0.05, z: 27.0, scale: 3.6 });

    // 9. Street Lamps neatly positioned along sidewalk curbs (Never blocking avenues)
    const lampPositions = [
      // North Avenue Curbs (x = ±2.85)
      { x: -2.85, z: -12 }, { x: 2.85, z: -12 },
      { x: -2.85, z: -22 }, { x: 2.85, z: -22 },
      // South Avenue Curbs (x = ±2.85)
      { x: -2.85, z: 11 }, { x: 2.85, z: 11 },
      // West Avenue Curbs (z = ±2.85)
      { x: -12, z: -2.85 }, { x: -12, z: 2.85 },
      { x: -21, z: -2.85 }, { x: -21, z: 2.85 },
      // East Avenue Curbs (z = ±2.85)
      { x: 12, z: -2.85 }, { x: 12, z: 2.85 },
      { x: 21, z: -2.85 }, { x: 21, z: 2.85 }
    ];
    lampPositions.forEach(p => worldObjects.add(createStreetLamp(p.x, p.z)));

    // 10. Peripheral Flower Beds beside district entrances
    worldObjects.add(createFlowerBed(-10, 6.5, 4, 2));
    worldObjects.add(createFlowerBed(10, 6.5, 4, 2));
    worldObjects.add(createFlowerBed(-10, -6.5, 4, 2));
    worldObjects.add(createFlowerBed(10, -6.5, 4, 2));

    // 11. Cute Wandering Pixel Cats
    worldObjects.add(createPixelCat(20, -2.5, 0xf97316)); // Ginger tabby near tavern patio
    worldObjects.add(createPixelCat(-2.5, 2.5, 0x0f172a)); // Calico near fountain
    worldObjects.add(createPixelCat(22, 16, 0xffffff)); // White cat near scenic gazebo

    // 9. Welcoming Town NPCs
    worldObjects.add(createNPCBillboard(2, 'Amber', 'Favonius Öncü Keşifçisi', -16, 9.5));
    worldObjects.add(createNPCBillboard(10, '🍃 Venti', 'Özgür Rüzgar Ozanı', 24, 13.8));

    // 10. Lush 3D Grass Tufts, Wildflowers, Stylized Anime Trees, Bushes, Boulders & Fences
    populateLush3DGrassAndWildflowers('town');

    const animeTrees = [
      // Sakura Blossom Trees framing the Gacha Shrine & River Canal
      { x: -9, z: -26, type: 'sakura', s: 1.05 },
      { x: 9, z: -26, type: 'sakura', s: 1.05 },
      { x: -13, z: -34, type: 'sakura', s: 1.15 },
      { x: 13, z: -34, type: 'sakura', s: 1.15 },
      { x: -19, z: 18.5, type: 'sakura', s: 0.95 },
      { x: 19, z: 18.5, type: 'sakura', s: 0.95 },
      { x: 31, z: 14, type: 'sakura', s: 1.1 },
      { x: 18, z: 31, type: 'sakura', s: 1.0 },
      // Golden Ginkgo Trees near Trade Mart & Guild
      { x: -33, z: -9, type: 'golden', s: 1.1 },
      { x: -14, z: -18, type: 'golden', s: 0.95 },
      { x: -33, z: 9, type: 'golden', s: 1.05 },
      { x: -12, z: 15, type: 'golden', s: 0.95 },
      { x: 33, z: -9, type: 'golden', s: 1.05 },
      { x: 14, z: -18, type: 'golden', s: 0.95 },
      // Lush Emerald Meadow Oaks across the village & perimeter
      { x: -9, z: -13, type: 'emerald', s: 0.9 },
      { x: 9, z: -13, type: 'emerald', s: 0.9 },
      { x: -9, z: 12, type: 'emerald', s: 0.9 },
      { x: 11, z: 11, type: 'emerald', s: 0.95 },
      { x: -36, z: -28, type: 'emerald', s: 1.25 },
      { x: -39, z: -18, type: 'emerald', s: 1.15 },
      { x: -38, z: 0, type: 'emerald', s: 1.2 },
      { x: -37, z: 18, type: 'emerald', s: 1.15 },
      { x: -34, z: 33, type: 'emerald', s: 1.2 },
      { x: 36, z: -28, type: 'emerald', s: 1.25 },
      { x: 39, z: -18, type: 'emerald', s: 1.15 },
      { x: 38, z: 0, type: 'emerald', s: 1.2 },
      { x: 37, z: 18, type: 'emerald', s: 1.15 },
      { x: 34, z: 33, type: 'emerald', s: 1.2 },
      { x: -22, z: -38, type: 'emerald', s: 1.2 },
      { x: 22, z: -38, type: 'emerald', s: 1.2 },
      { x: -12, z: 36, type: 'emerald', s: 1.1 },
      { x: 12, z: 36, type: 'emerald', s: 1.1 },
      { x: -26, z: 36, type: 'sakura', s: 1.05 },
      { x: 26, z: 36, type: 'sakura', s: 1.05 }
    ];
    for (const t of animeTrees) {
      worldObjects.add(createStylizedAnimeTree(t.x, t.z, t.type, t.s));
    }

    // Roadside & Plaza Bushes with Blooming Berries/Flowers
    const bushSpots = [
      { x: -6.2, z: -11, c: 0xf43f5e, s: 1.0 },
      { x: 6.2, z: -11, c: 0xfef08a, s: 1.0 },
      { x: -6.2, z: -19, c: 0x38bdf8, s: 0.95 },
      { x: 6.2, z: -19, c: 0xf472b6, s: 0.95 },
      { x: -6.2, z: 11, c: 0xfef08a, s: 1.0 },
      { x: 6.2, z: 11, c: 0xf43f5e, s: 1.0 },
      { x: -13, z: -4.8, c: 0xc084fc, s: 0.9 },
      { x: 13, z: -4.8, c: 0x38bdf8, s: 0.9 },
      { x: -13, z: 4.8, c: 0xf472b6, s: 0.9 },
      { x: 13, z: 4.8, c: 0xfef08a, s: 0.9 },
      { x: -20, z: 4.8, c: 0xf43f5e, s: 1.05 },
      { x: 20, z: 4.8, c: 0xc084fc, s: 1.05 },
      { x: -8, z: 19.2, c: 0x38bdf8, s: 1.0 },
      { x: 8, z: 19.2, c: 0xf472b6, s: 1.0 },
      { x: -6.5, z: 29.2, c: 0xfef08a, s: 1.1 },
      { x: 6.5, z: 29.2, c: 0xf43f5e, s: 1.1 },
      { x: 19, z: 11, c: 0xf472b6, s: 1.0 },
      { x: 29, z: 11, c: 0x38bdf8, s: 1.0 }
    ];
    for (const b of bushSpots) {
      worldObjects.add(createStylizedBush(b.x, b.z, b.c, b.s));
    }

    // Mossy Boulders adding natural relief
    const boulderSpots = [
      { x: -15, z: -26, s: 1.2 }, { x: 15, z: -26, s: 1.1 },
      { x: -32, z: -2, s: 1.3 }, { x: 32, z: -2, s: 1.2 },
      { x: -28, z: 19, s: 1.1 }, { x: 29, z: 19, s: 1.15 },
      { x: -18, z: 31, s: 1.25 }, { x: 20, z: 31, s: 1.2 }
    ];
    for (const r of boulderSpots) {
      worldObjects.add(createMossyBoulder(r.x, r.z, r.s));
    }

    // Rustic Wooden Fences bordering meadows
    worldObjects.add(createWoodenFence(-13, -8.5, 6, 0));
    worldObjects.add(createWoodenFence(13, -8.5, 6, 0));
    worldObjects.add(createWoodenFence(-13, 8.5, 6, 0));
    worldObjects.add(createWoodenFence(13, 8.5, 6, 0));

    // 11. Initialize Living Particle Systems
    initParticleSystems();
  }

  function buildInteriorMap(mapId) {
    clearWorld();
    currentMap = mapId;
    setMapAtmosphere('interior');
    detachCombatWeapon();
    document.getElementById('combat-hud')?.classList.add('hidden');
    document.getElementById('combat-boss-hud')?.classList.add('hidden');
    document.getElementById('combat-combo-hud')?.classList.add('hidden');

    let locName = 'İç Mekan';
    let floorColor = 0x78350f;
    let wallColor = 0x1e293b;

    if (mapId === 'trade_house') {
      locName = 'Büyük Takas Pazarı';
      floorColor = 0x854d0e;
      wallColor = 0x3b1803;
    } else if (mapId === 'tavern') {
      locName = "Cat's Tail Taverna";
      floorColor = 0x451a03;
      wallColor = 0x334155;
    } else if (mapId === 'shrine') {
      locName = 'Kader & Dilek Tapınağı';
      floorColor = 0x1e1b4b;
      wallColor = 0x3b0764;
    } else if (mapId === 'guild') {
      locName = 'Maceracılar Loncası';
      floorColor = 0x334155;
      wallColor = 0x1e293b;
    }

    document.getElementById('ui-location').textContent = locName;

    // Room Floor (Grand 32x24 Hall)
    const floorGeo = new THREE.PlaneGeometry(32, 24);
    const floorMat = new THREE.MeshLambertMaterial({ color: floorColor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    worldObjects.add(floor);

    // Walls (North, West, East, South wings)
    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    // Back Wall (North)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(32, 8, 1), wallMat);
    backWall.position.set(0, 4, -12);
    worldObjects.add(backWall);

    // Left Wall (West)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 24), wallMat);
    leftWall.position.set(-16, 4, 0);
    worldObjects.add(leftWall);

    // Right Wall (East)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 24), wallMat);
    rightWall.position.set(16, 4, 0);
    worldObjects.add(rightWall);

    // South Wall Wings (leaving doorway at center)
    const southWallLeft = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 1), wallMat);
    southWallLeft.position.set(-9.5, 4, 12);
    worldObjects.add(southWallLeft);

    const southWallRight = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 1), wallMat);
    southWallRight.position.set(9.5, 4, 12);
    worldObjects.add(southWallRight);

    // Timber Door Archway Header at South Exit
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1.2), new THREE.MeshLambertMaterial({ color: 0x451a03 }));
    doorHeader.position.set(0, 6.5, 12);
    worldObjects.add(doorHeader);

    // Exit Doorway Portal Mat (Green Glow)
    const exitGeo = new THREE.PlaneGeometry(4.5, 2.5);
    const exitMat = new THREE.MeshBasicMaterial({ color: 0x53fc18, transparent: true, opacity: 0.65 });
    const exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.rotation.x = -Math.PI / 2;
    exitMesh.position.set(0, 0.05, 10.0);
    worldObjects.add(exitMesh);

    // Exit Wall Torches
    [-3.2, 3.2].forEach(tx => {
      const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      sconce.position.set(tx, 3.0, 11.4);
      worldObjects.add(sconce);

      const light = new THREE.PointLight(0xfef08a, 0.6, 8, 2);
      light.position.set(tx, 3.0, 10.8);
      worldObjects.add(light);
    });

    // Populate Detailed Themed Interior
    if (mapId === 'trade_house') {
      buildTradeHouseInterior();
    } else if (mapId === 'tavern') {
      buildTavernInterior();
    } else if (mapId === 'shrine') {
      buildShrineInterior();
    } else if (mapId === 'guild') {
      buildGuildInterior();
    }
  }

  // =========================================================================
  // Pixel Character 2D Engine (Erkek & Karı 8-Directional Unified System)
  // =========================================================================
  function getCharacterAnimUrl(charId, action, facing) {
    const folder = (charId === 'kari') ? '/assets/character/kari' : '/assets/character/erkek';
    return `${folder}/${action}_${facing}.png`;
  }

  function getCharacterFrameCount(charId, action, facing) {
    if (charId === 'kari') {
      if (action === 'idle') return 8;
      if (action.startsWith('attack')) return 16;
      if (action === 'run' || action === 'walk') {
        if (facing === 'south' || facing === 'north' || facing === 'down' || facing === 'up') return 8;
        return 11;
      }
      return 8;
    }
    // erkek
    if (action === 'idle') return 17;
    if (action === 'attack2') return 13;
    if (action.startsWith('attack')) return 17;
    if (action === 'run') return 8;
    if (action === 'walk') {
      if (facing === 'north' || facing === 'south' || facing === 'up' || facing === 'down') return 7;
      return 8;
    }
    return 8;
  }

  const pixelCharTextureCache = {};
  const pixelCharTextureSubscribers = {};

  function getPixelCharBaseTexture(url) {
    if (!pixelCharTextureCache[url]) {
      pixelCharTextureSubscribers[url] = [];
      const tex = textureLoader.load(url, (loaded) => {
        loaded.magFilter = THREE.NearestFilter;
        loaded.minFilter = THREE.NearestFilter;
        loaded.needsUpdate = true;
        const subs = pixelCharTextureSubscribers[url] || [];
        for (let i = 0; i < subs.length; i++) {
          const item = subs[i];
          if (item && item.cloneTex) {
            item.cloneTex.image = loaded.image;
            item.cloneTex.needsUpdate = true;
            if (item.material) item.material.needsUpdate = true;
          }
        }
        pixelCharTextureSubscribers[url] = [];
      });
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      pixelCharTextureCache[url] = tex;
    }
    return pixelCharTextureCache[url];
  }

  function createPixelCharTextureClone(url, frames, matRef) {
    const baseTex = getPixelCharBaseTexture(url);
    const cloneTex = baseTex.clone();
    cloneTex.magFilter = THREE.NearestFilter;
    cloneTex.minFilter = THREE.NearestFilter;
    const fCount = frames || 8;
    cloneTex.repeat.set(1 / fCount, 1);
    cloneTex.offset.set(0, 0);
    if (baseTex.image) {
      cloneTex.image = baseTex.image;
      cloneTex.needsUpdate = true;
      if (matRef) matRef.needsUpdate = true;
    } else {
      if (!pixelCharTextureSubscribers[url]) pixelCharTextureSubscribers[url] = [];
      pixelCharTextureSubscribers[url].push({ cloneTex, material: matRef });
    }
    return cloneTex;
  }

  // Preload primary animation sets for both Erkek and Karı
  try {
    const PRE_ACTIONS = ['idle', 'run', 'attack'];
    const PRE_DIRS = ['south', 'north', 'west', 'east', 'south-east', 'south-west', 'north-east', 'north-west'];
    ['erkek', 'kari'].forEach(cId => {
      PRE_ACTIONS.forEach(act => {
        PRE_DIRS.forEach(dir => {
          getPixelCharBaseTexture(getCharacterAnimUrl(cId, act, dir));
        });
      });
    });
  } catch (err) {}

  function createPixelPlayerCharacter(avatarIndex = 0) {
    const root = new THREE.Group();
    // 0 = Erkek, 1 = Karı
    const charId = (Math.abs(avatarIndex) % 2 === 1) ? 'kari' : 'erkek';

    // 1. Soft Ground Contact Shadow (grounded oval directly beneath feet)
    const shadowGeo = new THREE.CircleGeometry(0.58, 16);
    shadowGeo.scale(1.0, 0.6, 1.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    root.add(shadowMesh);

    // 2. Sprite Mesh Quad (5.2m quad, character height ~2.35m hero proportions, feet anchored firmly at y = 0.0)
    // 256x256 frame with baseline feet at Y=210, center at 128:
    // Offset = (210 - 128) / 256 * 5.2 = 1.666m
    const planeGeo = new THREE.PlaneGeometry(5.2, 5.2);
    planeGeo.translate(0, 1.666, 0);

    const animTextures = {};
    const initialKey = 'idle_south';
    const initialUrl = getCharacterAnimUrl(charId, 'idle', 'south');
    const initialFrames = getCharacterFrameCount(charId, 'idle', 'south');
    const initialTex = createPixelCharTextureClone(initialUrl, initialFrames);
    animTextures[initialKey] = initialTex;

    const spriteMat = new THREE.MeshStandardMaterial({
      map: initialTex,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: true,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Link material to initial texture load
    const baseInit = getPixelCharBaseTexture(initialUrl);
    if (baseInit.image) {
      initialTex.image = baseInit.image;
      initialTex.needsUpdate = true;
      spriteMat.needsUpdate = true;
    } else {
      if (!pixelCharTextureSubscribers[initialUrl]) pixelCharTextureSubscribers[initialUrl] = [];
      pixelCharTextureSubscribers[initialUrl].push({ cloneTex: initialTex, material: spriteMat });
    }

    const spriteMesh = new THREE.Mesh(planeGeo, spriteMat);
    spriteMesh.castShadow = false;
    root.add(spriteMesh);

    // Dummy anchors for attachments / weapons
    const weaponHolder = new THREE.Group();
    weaponHolder.position.set(0.5, 1.0, 0.1);
    root.add(weaponHolder);

    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.5, 1.2, 0);
    root.add(rightArmGroup);

    // Populate all directional textures
    const allActions = ['idle', 'run', 'walk', 'attack', 'attack2'];
    const allDirs = ['south', 'north', 'west', 'east', 'south-east', 'south-west', 'north-east', 'north-west'];
    allActions.forEach(act => {
      allDirs.forEach(dir => {
        const k = `${act}_${dir}`;
        if (!animTextures[k]) {
          const u = getCharacterAnimUrl(charId, act, dir);
          const f = getCharacterFrameCount(charId, act, dir);
          animTextures[k] = createPixelCharTextureClone(u, f, spriteMat);
        }
      });
    });

    root.userData.rig = {
      type: 'pixel_sprite',
      charId,
      mesh: spriteMesh,
      material: spriteMat,
      animTextures,
      facing: 'south',
      currentKey: initialKey,
      frameIndex: 0,
      frameTimer: 0,
      combatAction: null,
      weaponHolder,
      rightArmGroup
    };

    return root;
  }

  const createAdventurerCharacter = createPixelPlayerCharacter;

  // --- 6. Character 3D Mesh Creation & Bubbles ---
  function createPlayerMesh(avatarIndex, username, isGuest, primogems, gearScore = 0, level = 1) {
    const group = createAdventurerCharacter(avatarIndex);

    // Overhead Nametag Billboard
    const nameTex = createNametagCanvas(username, isGuest, primogems, gearScore, level);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(3.4, 0.8, 1);
    nameSprite.position.y = 2.95;
    group.add(nameSprite);

    group.userData.nameSprite = nameSprite;
    group.userData.avatarIndex = avatarIndex;
    group.userData.username = username;
    group.userData.gearScore = gearScore;
    group.userData.level = level;
    group.userData.bubbleMesh = null;

    return group;
  }

  // Attach speech bubble to player
  function showSpeechBubble(playerGroup, text) {
    if (!playerGroup) return;

    // Remove existing
    if (playerGroup.userData && playerGroup.userData.bubbleMesh) {
      playerGroup.remove(playerGroup.userData.bubbleMesh);
      playerGroup.userData.bubbleMesh = null;
    }

    const bTex = createSpeechBubbleCanvas(text);
    const bMat = new THREE.SpriteMaterial({ map: bTex });
    const bSprite = new THREE.Sprite(bMat);
    bSprite.scale.set(4.2, 1.45, 1);
    bSprite.position.y = 4.3;
    playerGroup.add(bSprite);
    if (playerGroup.userData) {
      playerGroup.userData.bubbleMesh = bSprite;
    }

    // Fade out after 6 seconds
    setTimeout(() => {
      if (playerGroup.userData && playerGroup.userData.bubbleMesh === bSprite) {
        playerGroup.remove(bSprite);
        playerGroup.userData.bubbleMesh = null;
      }
    }, 6000);
  }

  // --- 7. WebSocket Multiplayer Communication ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    socket = new WebSocket(`${protocol}//${host}/ws`);

    socket.onopen = () => {
      console.log('[MMO] 🟢 WebSocket sunucusuna bağlandı!');
      // Join world
      socket.send(JSON.stringify({
        type: 'WORLD_JOIN',
        username: myPlayer.username,
        avatarIndex: myPlayer.avatarIndex,
        isGuest: myPlayer.isGuest
      }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('WS Parse Error:', e);
      }
    };

    socket.onclose = () => {
      console.warn('[MMO] 🔴 Bağlantı kesildi, 3sn içinde yeniden bağlanılıyor...');
      setTimeout(initWebSocket, 3000);
    };
  }

  function handleServerMessage(msg) {
    if (msg.type === 'WORLD_INIT') {
      socketId = msg.self.id;
      myPlayer.id = socketId;
      myPlayer.primogems = msg.self.primogems || 160;
      if (msg.unlockedCompanions || msg.companions) {
        unlockedCompanionsList = msg.unlockedCompanions || msg.companions;
      }
      if (msg.activeCompanion && msg.activeCompanion !== 'none') {
        myCompanion = msg.activeCompanion;
        const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === myCompanion.toLowerCase());
        myCompanionData = found || { name: myCompanion, element: 'Electro' };
        spawnCompanionMesh(myCompanion, myCompanionData.element);
      }
      updateUIProfile();
      updateCombatHUD();
      if (msg.dailyQuests) {
        myDailyQuestsState = msg.dailyQuests;
        renderDailyQuestsUI();
      } else {
        fetchDailyQuests();
      }
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_STATE') {
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_PLAYER_AUTHED') {
      if (msg.socketId === socketId) {
        myPlayer.username = msg.player.username;
        myPlayer.isGuest = false;
        myPlayer.primogems = msg.player.primogems || myPlayer.primogems;
        updateUIProfile();
        if (msg.unlockedCompanions || msg.companions) {
          unlockedCompanionsList = msg.unlockedCompanions || msg.companions;
        }
        const activeComp = msg.activeCompanion || msg.player.companion;
        if (activeComp && activeComp !== 'none') {
          myCompanion = activeComp;
          const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === myCompanion.toLowerCase());
          myCompanionData = found || { name: myCompanion, element: 'Electro' };
          spawnCompanionMesh(myCompanion, myCompanionData.element);
        }
        fetchUserCompanions().then(() => {
          renderCompanionModal(currentCompanionFilter);
        });
        fetchRpgProfile();
        fetchDailyQuests();
        fetchInventory();
        updateCombatHUD();
        closeModal('modal-auth');
        playBeep(880, 'triangle', 0.25);
        addChatMessage('Sistem', `🛡️ Kick hesabın (@${myPlayer.username}) başarıyla bağlandı!`);
      }
    } else if (msg.type === 'WORLD_PRIMO_UPDATE_USER') {
      if (msg.username && myPlayer.username && msg.username.toLowerCase() === myPlayer.username.toLowerCase()) {
        myPlayer.primogems = msg.primogems;
        updateUIProfile();
      }
    } else if (msg.type === 'DAILY_QUEST_STATE') {
      if (msg.state) {
        myDailyQuestsState = msg.state;
        renderDailyQuestsUI();
      }
    } else if (msg.type === 'DAILY_QUEST_UPDATE') {
      if (!msg.username || (myPlayer.username && msg.username.toLowerCase() === myPlayer.username.toLowerCase())) {
        if (msg.state) {
          myDailyQuestsState = msg.state;
          renderDailyQuestsUI();
        }
        if (msg.justCompleted && msg.questTitle) {
          playVictoryJingle();
          addChatMessage('📜 Günlük Görev', `✅ "${msg.questTitle}" görevi tamamlandı! [J] tuşuna basarak veya sağ üstteki görev panelinden ödülünü alabilirsin!`);
          if (myMesh) {
            showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `📜 Görev Tamam: ${msg.questTitle}!`, 'heal');
          }
        }
      }
    } else if (msg.type === 'DAILY_QUEST_CLAIM_RESULT') {
      handleDailyQuestClaimResponse(msg);
    } else if (msg.type === 'WORLD_SPEECH_BUBBLE') {
      const targetGroup = otherPlayers.get(msg.socketId);
      if (targetGroup) {
        showSpeechBubble(targetGroup.mesh, msg.text);
      } else if (msg.socketId === socketId && myMesh) {
        showSpeechBubble(myMesh, msg.text);
      }
      addChatMessage(msg.username, msg.text);
    } else if (msg.type === 'WORLD_DOOR_RESULT') {
      if (msg.success) {
        triggerDoorWipe(msg.newMap, msg.spawnPos);
      }
    } else if (msg.type === 'WORLD_PIN_RESULT') {
      if (msg.success) {
        document.getElementById('pin-display-box').classList.remove('hidden');
        document.getElementById('pin-code-text').textContent = msg.command;
      }
    } else if (msg.type === 'WORLD_PRIMO_UPDATE') {
      myPlayer.primogems = msg.primogems;
      updateUIProfile();
    } else if (msg.type === 'WORLD_FISH_ANNOUNCE') {
      if (msg.username !== myPlayer.username) {
        addChatMessage('🎣 Nehir', `@${msg.username} nehirde ${msg.fish.emoji || '🐟'} ${msg.fish.name} yakaladı ve +${msg.fish.primo} Primogem kazandı!`);
      }
    } else if (msg.type === 'WORLD_BOSS_ANNOUNCE') {
      addChatMessage('⚔️ BOSS YENİLDİ', `👑 @${msg.username} antik zindandaki ${msg.mobName} canavarını alt etti ve +${msg.primo} Primogem kazandı!`);
    } else if (msg.type === 'RPG_PROFILE_STATE') {
      myRpgProfile = msg.state;
      updateUIProfile();
      const sheetModal = document.getElementById('modal-character-sheet');
      if (sheetModal && !sheetModal.classList.contains('hidden')) {
        renderCharacterSheet();
      }
    } else if (msg.type === 'RPG_KILL_RESULT') {
      handleRpgKillResult(msg);
    } else if (msg.type === 'RPG_INSPECT_DATA') {
      renderInspectModal(msg);
    } else if (msg.type === 'WORLD_COMPANION_RESULT') {
      if (msg.success) {
        if (msg.companion && msg.companion !== 'none') {
          myCompanion = msg.companion;
          myCompanionData = msg.companionData || { name: myCompanion, element: 'Electro' };
          spawnCompanionMesh(myCompanion, myCompanionData.element);
          playBeep(784, 'triangle', 0.2);
          addChatMessage('🐾 Yoldaş', `✨ ${myCompanion} (${myCompanionData.element}) artık yanında süzülüyor! Yetenek setin dönüştürüldü.`);
          showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, `🐾 ${myCompanion} Kuşandı!`, 'heal');
        } else {
          addChatMessage('🐾 Yoldaş', `Yoldaş kaldırıldı. Standart yetenek setine dönüldü.`);
          myCompanion = null;
          myCompanionData = null;
          removeCompanionMesh();
        }
        updateCombatHUD();
        const compModal = document.getElementById('modal-companion-selector');
        if (compModal && !compModal.classList.contains('hidden')) {
          renderCompanionModal(currentCompanionFilter);
        }
      } else {
        alert(msg.message || 'Yoldaş seçilemedi.');
      }
    } else if (msg.type === 'WORLD_COMPANIONS_LIST') {
      if (msg.username && myPlayer.username && msg.username.toLowerCase() !== myPlayer.username.toLowerCase()) {
        return;
      }
      if (msg.unlockedCompanions || msg.companions) {
        unlockedCompanionsList = msg.unlockedCompanions || msg.companions;
      }
      if (msg.activeCompanion && msg.activeCompanion !== 'none') {
        myCompanion = msg.activeCompanion;
        const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === myCompanion.toLowerCase());
        myCompanionData = found || { name: myCompanion, element: 'Electro' };
        spawnCompanionMesh(myCompanion, myCompanionData.element);
        updateCombatHUD();
      }
      const compModal = document.getElementById('modal-companion-selector');
      if (compModal && !compModal.classList.contains('hidden')) {
        renderCompanionModal(currentCompanionFilter);
      }
    } else if (msg.type === 'WORLD_PLAYER_COMPANION_UPDATE') {
      const entry = otherPlayers.get(msg.socketId);
      if (entry) {
        entry.data.companion = msg.companion;
        if (msg.companion && msg.companion !== 'none') {
          if (otherPlayerCompanions.has(msg.socketId)) {
            scene.remove(otherPlayerCompanions.get(msg.socketId));
          }
          const otherPet = createCompanionChibiMesh(msg.companion, msg.companionData ? msg.companionData.element : 'Electro');
          otherPet.position.set(entry.mesh.position.x, entry.mesh.position.y + 2.25, entry.mesh.position.z);
          scene.add(otherPet);
          otherPlayerCompanions.set(msg.socketId, otherPet);
        } else {
          if (otherPlayerCompanions.has(msg.socketId)) {
            scene.remove(otherPlayerCompanions.get(msg.socketId));
            otherPlayerCompanions.delete(msg.socketId);
          }
        }
      }
    } else if (msg.type === 'WORLD_COMBAT_VFX') {
      if (msg.socketId !== socketId && msg.mapId === currentMap) {
        const entry = otherPlayers.get(msg.socketId);
        if (entry && entry.mesh) {
          if (typeof msg.rot === 'number') {
            entry.targetRot = msg.rot;
            entry.mesh.rotation.y = msg.rot;
          }
          const actionType = msg.action === 'heavy'
            ? 'heavy'
            : (msg.action === 'dash'
              ? 'dash'
              : (msg.action === 'skill' || msg.action === 'burst'
                ? msg.action
                : 'combo' + (msg.combo || 1)));
          triggerRigCombatAction(entry.mesh, actionType, msg.action === 'heavy' ? 380 : 250);
          if (msg.action === 'attack' || msg.action === 'heavy') {
            const stage = msg.action === 'heavy' ? 4 : (msg.combo || 1);
            const slash = createSlashArcMesh(
              typeof msg.x === 'number' ? msg.x : entry.mesh.position.x,
              typeof msg.z === 'number' ? msg.z : entry.mesh.position.z,
              typeof msg.rot === 'number' ? msg.rot : entry.mesh.rotation.y,
              stage
            );
            worldObjects.add(slash);
            activeSlashTrails.push({ mesh: slash, life: 0.24, maxLife: 0.24, stage });
          }
        }
      }
    }
    // Trade Messages
    else if (msg.type === 'TRADE_INVITE') {
      if (msg.targetSocketId === socketId || msg.target.toLowerCase() === myPlayer.username.toLowerCase()) {
        showTradeInvite(msg.initiator);
      }
    } else if (msg.type === 'TRADE_SESSION_STARTED') {
      const s = msg.session;
      if (s.p1.toLowerCase() === myPlayer.username.toLowerCase() || s.p2.toLowerCase() === myPlayer.username.toLowerCase()) {
        openTradeModal(s);
      }
    } else if (msg.type === 'TRADE_SESSION_UPDATED') {
      if (activeTrade && activeTrade.id === msg.session.id) {
        updateTradeModal(msg.session);
      }
    } else if (msg.type === 'TRADE_COMPLETED') {
      if (activeTrade && activeTrade.id === msg.session.id) {
        playBeep(587, 'triangle', 0.3);
        addChatMessage('Pazar', `✅ ${msg.message || 'Takas başarıyla tamamlandı!'}`);
        closeModal('modal-trade');
        activeTrade = null;
        fetchInventory();
      }
    } else if (msg.type === 'TRADE_CANCELLED') {
      if (activeTrade && activeTrade.id === msg.tradeId) {
        playBeep(220, 'sawtooth', 0.2);
        addChatMessage('Pazar', `❌ Takas iptal edildi: ${msg.reason || 'Kullanıcı ayrıldı.'}`);
        closeModal('modal-trade');
        activeTrade = null;
      }
    }
    // Aion 2 Instance Dungeon Multiplayer & Stream Sync
    else if (msg.type === 'DUNGEON_VIEWER_BUFF') {
      dungeonState.viewerBuffActive = true;
      dungeonState.viewerBuffUntil = performance.now() + (msg.duration || 15000);
      playerHP = Math.min(playerMaxHP, playerHP + (msg.heal || 200));
      updateCombatHUD();
      showDamageNumber({ x: myPlayer.x, y: 2.4, z: myPlayer.z }, `🪽 +${msg.heal || 200} HP & AETHER GÜCÜ!`, 'heal');
      showDungeonMechanicBanner(`🪽 @${msg.viewer} Kick yayınından Aether Kutsaması gönderdi! (+%25 Hasar, +%22 Hız, +200 HP)!`, 4500);
      addChatMessage('🪽 Kutsama', `@${msg.viewer} chatte !buff yazarak zindana Aether Kutsaması gönderdi!`);
      if (myMesh && !dungeonState.viewerBuffMesh) {
        const aura = new THREE.Mesh(
          new THREE.RingGeometry(1.2, 1.6, 24),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.08;
        myMesh.add(aura);
        dungeonState.viewerBuffMesh = aura;
      }
    } else if (msg.type === 'DUNGEON_CHEST_CLAIM_RESULT') {
      if (msg.success || msg.ok) {
        playVictoryJingle();
        if (typeof msg.newTotalPrimo === 'number') {
          myPlayer.primogems = msg.newTotalPrimo;
          updateUIProfile();
        }
        fetchRpgProfile();
        fetchInventory();
        const chest = activeDungeonChests.find(c => c.id === msg.chestId) || activeDungeonChests.find(c => !c.claimed) || activeDungeonChests[0];
        if (chest) {
          chest.claimed = true;
          if (chest.lidMesh) {
            chest.lidMesh.rotation.x = -Math.PI / 2.6;
          }
          createShockwaveRing(chest.x, chest.z, 3.5, chest.isBonusChest ? 0xfacc15 : 0x38bdf8);
        }
        showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `🎁 +${msg.primoGain} 💎 +${msg.wishes || 1} Dilek!`, 'crit');
        if (msg.equipment) {
          showRpgDropToast(msg.equipment);
        }
        addChatMessage('🎁 Zindan Sandığı', `✨ ${msg.message || 'Zindan hazinesi açıldı!'}`);
      } else {
        addChatMessage('⚠️ Zindan Sandığı', msg.message || 'Sandık açılamadı veya zaten açıldı.');
      }
    } else if (msg.type === 'PARTY_UPDATE') {
      myParty = msg.party;
      isPartyLeader = (myParty && myParty.leaderId === (myPlayer.id || socketId));
      updatePartyHUD(myParty);
      if (myParty && Array.isArray(myParty.members)) {
        addChatMessage('🛡️ Parti', `Parti güncellendi (${myParty.members.length}/4 üye).`);
      }
    } else if (msg.type === 'PARTY_INVITE_PROMPT') {
      currentPartyInviteId = msg.inviteId;
      const modal = document.getElementById('modal-party-invite');
      if (modal) {
        document.getElementById('party-invite-sender').textContent = `@${msg.leaderName}`;
        modal.classList.remove('hidden');
        const timerBar = document.getElementById('party-invite-timer-bar');
        if (timerBar) {
          timerBar.style.width = '100%';
          const startTime = Date.now();
          if (partyInviteTimerInterval) clearInterval(partyInviteTimerInterval);
          partyInviteTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const pct = Math.max(0, 100 - (elapsed / 15000) * 100);
            timerBar.style.width = pct + '%';
            if (pct <= 0) {
              clearInterval(partyInviteTimerInterval);
              modal.classList.add('hidden');
              currentPartyInviteId = null;
            }
          }, 100);
        }
      }
    } else if (msg.type === 'PARTY_INVITE_SENT') {
      addChatMessage('🛡️ Parti', `✉️ @${msg.targetName} oyuncusuna parti daveti gönderildi.`);
    } else if (msg.type === 'PARTY_LEFT') {
      myParty = null;
      isPartyLeader = false;
      updatePartyHUD(null);
      addChatMessage('🛡️ Parti', 'Partiden ayrıldın.');
    } else if (msg.type === 'PARTY_KICKED') {
      myParty = null;
      isPartyLeader = false;
      updatePartyHUD(null);
      addChatMessage('🛡️ Parti', 'Partiden çıkarıldın.');
    } else if (msg.type === 'PARTY_DECLINED') {
      addChatMessage('🛡️ Parti', `❌ @${msg.username} parti davetini reddetti.`);
    } else if (msg.type === 'PARTY_ERROR') {
      addChatMessage('⚠️ Parti', msg.error || 'İşlem gerçekleştirilemedi.');
    } else if (msg.type === 'PARTY_MEMBER_HP_UPDATE') {
      updatePartyMemberHpUI(msg.socketId, msg.hp, msg.maxHp);
    } else if (msg.type === 'PARTY_READY_CHECK_START') {
      currentReadyCheckId = msg.readyCheckId;
      const rcModal = document.getElementById('modal-dungeon-ready-check');
      if (rcModal) {
        rcModal.classList.remove('hidden');
        const nameEl = document.getElementById('ready-check-dungeon-name');
        const baseTier = getDungeonBaseTier(msg.tierId);
        if (nameEl) nameEl.textContent = (ZONE_CONFIGS[baseTier] || {}).name || 'Aion 2 Zindanı';
        const subEl = document.getElementById('ready-check-sub');
        if (subEl) subEl.textContent = `@${msg.leaderName} zindan seferini başlatıyor. Hazır mısın? (15s)`;

        const memList = document.getElementById('ready-check-members-list');
        if (memList && myParty && Array.isArray(myParty.members)) {
          memList.innerHTML = myParty.members.map(m => `
            <div class="ready-member-row" data-rc-user="${m.id}">
              <span>${m.id === socketId ? 'Sen' : '@' + m.username}</span>
              <span class="ready-member-status ${m.isLeader ? 'ready' : 'pending'}">${m.isLeader ? '✓ Hazır (Lider)' : '⏳ Bekliyor...'}</span>
            </div>
          `).join('');
        }

        const tBar = document.getElementById('ready-check-timer-bar');
        if (tBar) {
          tBar.style.width = '100%';
          const startTime = Date.now();
          if (readyCheckTimerInterval) clearInterval(readyCheckTimerInterval);
          readyCheckTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const pct = Math.max(0, 100 - (elapsed / 15000) * 100);
            tBar.style.width = pct + '%';
            if (pct <= 0) {
              clearInterval(readyCheckTimerInterval);
              rcModal.classList.add('hidden');
            }
          }, 100);
        }
      }
    } else if (msg.type === 'PARTY_READY_CHECK_UPDATE') {
      const row = document.querySelector(`.ready-member-row[data-rc-user="${msg.socketId}"]`);
      if (row) {
        const stat = row.querySelector('.ready-member-status');
        if (stat) {
          if (msg.accept) {
            stat.className = 'ready-member-status ready';
            stat.textContent = '✓ Hazır!';
          } else {
            stat.className = 'ready-member-status declined';
            stat.textContent = '✕ Reddetti';
          }
        }
      }
    } else if (msg.type === 'PARTY_READY_CHECK_CANCELLED') {
      if (readyCheckTimerInterval) clearInterval(readyCheckTimerInterval);
      const rcModal = document.getElementById('modal-dungeon-ready-check');
      if (rcModal) rcModal.classList.add('hidden');
      addChatMessage('⚠️ Zindan', msg.reason || 'Zindan hazır olma kontrolü iptal edildi.');
    } else if (msg.type === 'DUNGEON_INSTANCE_INFO') {
      dungeonState.active = true;
      dungeonState.tierId = msg.tierId || getDungeonBaseTier(currentMap);
      dungeonState.stage = msg.stage || 1;
      dungeonState.stage1Cleared = Boolean(msg.stage1Cleared);
      dungeonState.stage2Cleared = Boolean(msg.stage2Cleared);
      dungeonState.bossDefeated = Boolean(msg.bossDefeated);
      dungeonState.phase2ShieldActive = Boolean(msg.phase2ShieldActive);

      if (dungeonState.stage1Cleared && dungeonState.barrier1Mesh) {
        worldObjects.remove(dungeonState.barrier1Mesh);
        dungeonState.barrier1Mesh = null;
      }
      if (dungeonState.stage2Cleared && dungeonState.barrier2Mesh) {
        worldObjects.remove(dungeonState.barrier2Mesh);
        dungeonState.barrier2Mesh = null;
      }

      if (Array.isArray(msg.mobs)) {
        pendingDungeonMobs = msg.mobs;
        if (isDungeonMap(currentMap)) {
          for (const m of activeCombatMobs) {
            if (m.mesh) worldObjects.remove(m.mesh);
            if (m.hpBarGroup) worldObjects.remove(m.hpBarGroup);
          }
          activeCombatMobs = [];
          for (const sm of msg.mobs) {
            if (!sm.isDead) spawnServerSyncedMob(sm);
          }
        }
      }
    } else if (msg.type === 'DUNGEON_MOB_DAMAGED') {
      if (msg.attackerName !== myPlayer.username) {
        const mob = activeCombatMobs.find(m => m.id === msg.mobId);
        if (mob) {
          mob.hp = msg.newHp;
          if (mob.hpFillMesh) {
            const ratio = Math.max(0.001, mob.hp / mob.maxHP);
            mob.hpFillMesh.scale.x = ratio;
          }
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `${msg.isCrit ? '💥 CRIT! ' : ''}${msg.dmg} (${msg.attackerName})`, msg.isCrit ? 'crit' : 'normal');
          mob.flashTimer = 0.14;
          if (msg.isDead || mob.hp <= 0) {
            defeatMob(mob);
          }
        }
      }
    } else if (msg.type === 'DUNGEON_STAGE_CLEAR') {
      if (msg.stage === 1) {
        dungeonState.stage1Cleared = true;
        dungeonState.stage = 2;
        if (dungeonState.barrier1Mesh) {
          worldObjects.remove(dungeonState.barrier1Mesh);
          dungeonState.barrier1Mesh = null;
        }
        createShockwaveRing(0, -28.2, 12.0, 0x38bdf8);
        playVictoryJingle();
        showDungeonMechanicBanner('✨ AŞAMA 1 TAMAMLANDI! Rüzgar Akıntısına (Windstream) gir ve uç!', 4000);
      } else if (msg.stage === 2) {
        dungeonState.stage2Cleared = true;
        dungeonState.stage = 3;
        if (dungeonState.barrier2Mesh) {
          worldObjects.remove(dungeonState.barrier2Mesh);
          dungeonState.barrier2Mesh = null;
        }
        createShockwaveRing(0, 21.8, 12.0, 0xc084fc);
        playVictoryJingle();
        showDungeonMechanicBanner('✨ AŞAMA 2 TAMAMLANDI! 2. Rüzgar Akıntısına girerek patron sunağına uç!', 4000);
      }
    } else if (msg.type === 'DUNGEON_BOSS_PHASE') {
      if (msg.phase === 2) {
        dungeonState.phase2Triggered = true;
        dungeonState.phase2ShieldActive = true;
        if (Array.isArray(msg.newMobs)) {
          for (const m of msg.newMobs) {
            if (!activeCombatMobs.find(c => c.id === m.id)) {
              spawnServerSyncedMob(m);
            }
          }
        }
        showDungeonMechanicBanner('🔮 AETHER KALKANI ETKİNLEŞTİ! 3 Rezonans Kristalini Yok Et!', 4500);
      } else if (msg.phase === 3) {
        dungeonState.phase3Triggered = true;
        dungeonState.phase3SafeZoneActive = true;
        showDungeonMechanicBanner('⚠️ UÇURUM KIYAMETİ! Yeşil Güvenli Alana Koş! (4.5s)', 4500);
      }
    } else if (msg.type === 'DUNGEON_SHIELD_DOWN') {
      dungeonState.phase2ShieldActive = false;
      if (dungeonState.bossShieldMesh) {
        worldObjects.remove(dungeonState.bossShieldMesh);
        dungeonState.bossShieldMesh = null;
      }
      const b = activeCombatMobs.find(m => m.isBoss && !m.isDead);
      if (b) {
        b.staggeredUntil = performance.now() + 6000;
        createShockwaveRing(b.x, b.z, 6.0, 0x38bdf8);
      }
      showDungeonMechanicBanner('💥 REZONANS KALKANI PARÇALANDI! Patron 6 saniye sersemletildi (+%50 Hasar)!', 4000);
      playVictoryJingle();
    } else if (msg.type === 'DUNGEON_VICTORY') {
      dungeonState.score = msg.score || dungeonState.score;
      dungeonState.rank = msg.rank || dungeonState.rank;
      dungeonState.elapsedSec = msg.elapsed || dungeonState.elapsedSec;
      dungeonState.bossDefeated = true;
      handleDungeonVictory();
    } else if (msg.type === 'WORLD_DUNGEON_ANNOUNCE') {
      if (msg.username !== myPlayer.username) {
        const chestType = msg.isBonusChest ? '🌟 Efsanevi S-Rank Abyss Sandığını' : '🎁 Aion Zindan Hazinesini';
        addChatMessage('👑 ZİNDAN ZAFERİ', `@${msg.username} ${msg.zoneName || 'Aion'} zindanını [${msg.rank}-Rank] dereceyle tamamladı ve ${chestType} açtı!`);
      }
    } else if (msg.type === 'PVP_HIT_EFFECT') {
      handlePvPHitEffect(msg);
    } else if (msg.type === 'PVP_KILLFEED') {
      handlePvPKillfeed(msg);
    } else if (msg.type === 'PVP_LEADERBOARD_UPDATE') {
      handlePvPLeaderboardUpdate(msg.leaderboard);
    }
  }

  function handlePvPHitEffect(msg) {
    if (currentMap !== 'pvp_arena') return;
    const isMeTarget = (msg.targetSocketId === socketId);
    let targetX = 0, targetY = 1.6, targetZ = 0;

    if (isMeTarget) {
      targetX = myPlayer.x;
      targetY = myPlayer.y + 1.8;
      targetZ = myPlayer.z;
      playerHP = Math.max(0, msg.newHp);
      playerMaxHP = msg.maxHp;
      updateCombatHUD();
      playPunchyHitSound(true);
      screenShakeTimer = msg.isCrit ? 0.22 : 0.12;
      screenShakeMagnitude = msg.isCrit ? 0.35 : 0.2;
    } else {
      const entry = otherPlayers.get(msg.targetSocketId);
      if (entry && entry.mesh) {
        targetX = entry.mesh.position.x;
        targetY = entry.mesh.position.y + 1.8;
        targetZ = entry.mesh.position.z;
      }
    }

    const elemColor = ELEMENT_META[msg.element]?.color || 0xef4444;
    createSlashArcMesh(targetX, targetZ, 0, 2, elemColor);
    const prefix = msg.isCrit ? '💥 CRIT! ' : '';
    showDamageNumber({ x: targetX, y: targetY, z: targetZ }, `${prefix}-${msg.dmg}`, msg.isCrit ? 'crit' : 'normal');
  }

  function handlePvPKillfeed(msg) {
    if (currentMap !== 'pvp_arena') return;
    const kfEl = document.getElementById('pvp-killfeed');
    const kfText = document.getElementById('pvp-killfeed-text');
    if (kfEl && kfText) {
      const primoStr = msg.primoGain > 0 ? ` (+${msg.primoGain} 💎)` : '';
      kfText.textContent = `@${msg.killerName}, @${msg.victimName}'i alt etti! (+10 🏅${primoStr})`;
      kfEl.classList.remove('hidden');
      clearTimeout(window._pvpKillfeedTimer);
      window._pvpKillfeedTimer = setTimeout(() => {
        kfEl.classList.add('hidden');
      }, 4500);
    }
    playBeep(587.33, 'triangle', 0.25);

    addChatMessage('⚔️ Gladyatör Arenası', `**@${msg.killerName}**, arena kumlarında **@${msg.victimName}**'i dize getirdi! (+10 Şeref Puanı)`);

    // If local player was the victim:
    if (msg.targetSocketId === socketId) {
      playBeep(220, 'sawtooth', 0.4);
      addChatMessage('💀 Arena Mağlubiyeti', 'Kum çukurunda yenildin! Seyirci tribününde full canla yeniden doğdun.');
      if (msg.respawnPos) {
        myPlayer.x = msg.respawnPos.x;
        myPlayer.z = msg.respawnPos.z;
        myPlayer.y = 1.2;
        if (myMesh) {
          myMesh.position.set(myPlayer.x, myPlayer.y, myPlayer.z);
        }
      }
      playerHP = playerMaxHP;
      updateCombatHUD();
    }
  }

  function handlePvPLeaderboardUpdate(leaderboard) {
    const listEl = document.getElementById('pvp-leaderboard-list');
    if (!listEl) return;
    if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
      listEl.innerHTML = '<div class="pvp-leaderboard-empty">Henüz dövüş kaydı yok. Kuma in ve çarpış!</div>';
      return;
    }
    listEl.innerHTML = leaderboard.map((r, i) => {
      const isMe = r.username === myPlayer.username;
      const rankNum = r.rank || (i + 1);
      return `
        <div class="pvp-leaderboard-row ${isMe ? 'me' : ''}">
          <span class="rank-num">#${rankNum}</span>
          <span class="gladiator-name">${r.username}${isMe ? ' (Sen)' : ''}</span>
          <span class="gladiator-honor">${r.kills || 0}K/${r.deaths || 0}D (${r.honorPoints || 0}🏅)</span>
        </div>
      `;
    }).join('');
  }

  // --- 8. Multiplayer State Sync & Interpolation ---
  function updateOtherPlayers(playerList) {
    const currentIds = new Set();

    for (const p of playerList) {
      if (p.id === socketId) continue; // Skip myself
      currentIds.add(p.id);

      if (!otherPlayers.has(p.id)) {
        // New player spawned
        const mesh = createPlayerMesh(p.avatarIndex, p.username, p.isGuest, p.primogems, p.gearScore || 0, p.level || 1);
        mesh.position.set(p.x, p.y, p.z);
        if (isBattleZone(currentMap) && mesh.userData && mesh.userData.rig && mesh.userData.rig.weapon) {
          mesh.userData.rig.weapon.visible = true;
        }
        scene.add(mesh);

        otherPlayers.set(p.id, {
          mesh,
          data: p,
          targetX: p.x,
          targetZ: p.z,
          targetRot: p.rot,
          anim: p.anim
        });

        // Other player companion
        if (p.companion && p.companion !== 'none') {
          const otherPet = createCompanionChibiMesh(p.companion, 'Electro');
          otherPet.position.set(p.x, p.y + 2.25, p.z);
          scene.add(otherPet);
          otherPlayerCompanions.set(p.id, otherPet);
        }
      } else {
        // Update existing player targets
        const entry = otherPlayers.get(p.id);
        if (entry.mesh.userData && entry.mesh.userData.avatarIndex !== p.avatarIndex) {
          scene.remove(entry.mesh);
          entry.mesh = createPlayerMesh(p.avatarIndex, p.username, p.isGuest, p.primogems, p.gearScore || 0, p.level || 1);
          entry.mesh.position.set(entry.targetX, p.y || 0, entry.targetZ);
          entry.mesh.rotation.y = entry.targetRot;
          scene.add(entry.mesh);
        } else if (entry.mesh.userData && entry.mesh.userData.gearScore !== (p.gearScore || 0)) {
          // GearScore updated -> refresh overhead billboard
          entry.mesh.userData.gearScore = p.gearScore || 0;
          entry.mesh.userData.level = p.level || 1;
          if (entry.mesh.userData.nameSprite) {
            entry.mesh.userData.nameSprite.material.map = createNametagCanvas(p.username, p.isGuest, p.primogems, p.gearScore || 0, p.level || 1);
            entry.mesh.userData.nameSprite.material.needsUpdate = true;
          }
        }
        entry.targetX = p.x;
        entry.targetZ = p.z;
        entry.targetRot = p.rot;
        entry.anim = p.anim;
        entry.data = p;
        if (p.bubble && (!entry.lastBubble || entry.lastBubble !== p.bubble)) {
          showSpeechBubble(entry.mesh, p.bubble);
          entry.lastBubble = p.bubble;
        }

        // Other player companion follow sync
        if (p.companion && p.companion !== 'none') {
          if (!otherPlayerCompanions.has(p.id)) {
            const compPet = createCompanionChibiMesh(p.companion, 'Electro');
            compPet.position.set(p.x, (p.y || 0) + 2.25, p.z);
            scene.add(compPet);
            otherPlayerCompanions.set(p.id, compPet);
          }
        } else if (otherPlayerCompanions.has(p.id)) {
          scene.remove(otherPlayerCompanions.get(p.id));
          otherPlayerCompanions.delete(p.id);
        }
      }
    }

    // Remove disconnected
    for (const [id, entry] of otherPlayers.entries()) {
      if (!currentIds.has(id)) {
        scene.remove(entry.mesh);
        if (otherPlayerCompanions.has(id)) {
          scene.remove(otherPlayerCompanions.get(id));
          otherPlayerCompanions.delete(id);
        }
        otherPlayers.delete(id);
      }
    }

    // Update online counter
    document.getElementById('ui-online-count').textContent = otherPlayers.size + 1;
  }


  // Local Player Mesh
  let myMesh = null;
  function updateMyMesh() {
    if (myMesh) scene.remove(myMesh);
    const myGs = (myRpgProfile && myRpgProfile.stats && myRpgProfile.stats.gearScore) || 0;
    const myLvl = (myRpgProfile && myRpgProfile.level) || 1;
    myMesh = createPlayerMesh(myPlayer.avatarIndex, myPlayer.username, myPlayer.isGuest, myPlayer.primogems, myGs, myLvl);
    myMesh.position.set(myPlayer.x, myPlayer.y, myPlayer.z);
    scene.add(myMesh);
    if (isBattleZone(currentMap)) {
      attachCombatWeapon();
    }
  }

  function getCombatZoneBounds(map = currentMap) {
    if (map === 'pvp_arena') {
      return { minX: -34.5, maxX: 34.5, minZ: -34.5, maxZ: 34.5 };
    }
    if (isDungeonMap(map)) {
      let maxZ = 78;
      if (dungeonState.active) {
        if (!dungeonState.stage1Cleared && myPlayer.z < -26) {
          maxZ = -28.2;
        } else if (!dungeonState.stage2Cleared && myPlayer.z < 24) {
          maxZ = 21.8;
        }
      }
      return { minX: -27.5, maxX: 27.5, minZ: -69.5, maxZ };
    }
    return { minX: -37.5, maxX: 37.5, minZ: -37.5, maxZ: 37.5 };
  }

  // --- 9. Movement & Proximity Loop ---
  function updateMovement(delta) {
    if (!myMesh) return;

    if (dungeonState.active && dungeonState.isGliding) {
      checkProximity();
      return;
    }

    if (isRPGDialogueOpen || isFishing) {
      myPlayer.anim = 'idle';
      checkProximity();
      return;
    }

    let moveX = 0;
    let moveZ = 0;

    if (keys.w || keys.up) moveZ -= 1;
    if (keys.s || keys.down) moveZ += 1;
    if (keys.a || keys.left) moveX -= 1;
    if (keys.d || keys.right) moveX += 1;

    // Mobile Joystick
    if (Math.abs(joystickVector.x) > 0.1 || Math.abs(joystickVector.y) > 0.1) {
      moveX = joystickVector.x;
      moveZ = joystickVector.y;
    }

    const isMoving = moveX !== 0 || moveZ !== 0;

    if (isMoving) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      const normX = moveX / len;
      const normZ = moveZ / len;

      let currentSpeed = CONFIG.moveSpeed;
      if (isDashing) currentSpeed *= 3.2;
      if (dungeonState.viewerBuffActive && performance.now() < dungeonState.viewerBuffUntil) {
        currentSpeed *= 1.22;
      }
      const speed = currentSpeed * delta;
      myPlayer.x += normX * speed;
      myPlayer.z += normZ * speed;
      myPlayer.rot = Math.atan2(normX, normZ);
      myPlayer.anim = isDashing ? 'dash' : 'walk';
    } else {
      myPlayer.anim = 'idle';
    }

    // Map bounds clamping
    const bounds = currentMap === 'town'
      ? { minX: -44, maxX: 44, minZ: -44, maxZ: 44 }
      : (isBattleZone(currentMap)
          ? getCombatZoneBounds(currentMap)
          : { minX: -15, maxX: 15, minZ: -11, maxZ: 11 });
    myPlayer.x = Math.max(bounds.minX, Math.min(bounds.maxX, myPlayer.x));
    myPlayer.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, myPlayer.z));

    // Obstacle collisions in Town & Interiors
    if (currentMap === 'town') {
      // 1. River Canal Retaining Walls & Bridge Railings (Canal spans z in [19.5, 28.5])
      // Crossing is ONLY permitted on the Bridge (|x| <= 3.0) or Fishing Piers
      const onBridge = Math.abs(myPlayer.x) <= 3.0 && myPlayer.z >= 17.5 && myPlayer.z <= 30.5;
      const onWestPier = myPlayer.x >= -15.5 && myPlayer.x <= -12.5 && myPlayer.z >= 19.5 && myPlayer.z <= 26.5;
      const onEastPier = myPlayer.x >= 12.5 && myPlayer.x <= 15.5 && myPlayer.z >= 19.5 && myPlayer.z <= 26.5;

      if (onBridge) {
        // Confine player securely between bridge railings so they don't fall off sides
        if (myPlayer.z >= 18.5 && myPlayer.z <= 29.5) {
          if (myPlayer.x < -2.85) myPlayer.x = -2.85;
          if (myPlayer.x > 2.85) myPlayer.x = 2.85;
        }
      } else if (onWestPier) {
        // Confine player to wooden fishing deck
        if (myPlayer.x < -15.2) myPlayer.x = -15.2;
        if (myPlayer.x > -12.8) myPlayer.x = -12.8;
        if (myPlayer.z > 26.2) myPlayer.z = 26.2;
      } else if (onEastPier) {
        // Confine player to wooden fishing deck
        if (myPlayer.x < 12.8) myPlayer.x = 12.8;
        if (myPlayer.x > 15.2) myPlayer.x = 15.2;
        if (myPlayer.z > 26.2) myPlayer.z = 26.2;
      } else {
        // Solid stone retaining walls block walking into canal water
        if (myPlayer.z > 19.5 && myPlayer.z < 28.5) {
          if (myPlayer.z < 24.0) {
            myPlayer.z = 19.5; // North bank retaining wall
          } else {
            myPlayer.z = 28.5; // South bank retaining wall
          }
        }
      }

      // 2. Radial Obstacle Collisions (Fountain, Produce Wagon, Signpost, Well, Gazebo, Windmill, Watchtowers)
      const circleColliders = [
        { cx: 0, cz: 0, r: 2.85 },      // Central Landmark Fountain
        { cx: -4.6, cz: 2.8, r: 1.4 },  // Rustic Produce Wagon
        { cx: 4.2, cz: -2.6, r: 0.5 },  // Village Directional Signpost
        { cx: -14, cz: 6.0, r: 2.2 },   // Relocated Stone Well
        { cx: 24, cz: 14, r: 4.0 },     // Scenic Waterside Gazebo
        { cx: 36, cz: -26, r: 4.6 },    // Hill Windmill
        { cx: 40, cz: -38, r: 3.5 },    // Watchtower NE
        { cx: -40, cz: 26, r: 3.5 },    // Watchtower SW
        { cx: 16, cz: 38, r: 3.5 }      // Watchtower SE
      ];
      for (const c of circleColliders) {
        const cd = Math.hypot(myPlayer.x - c.cx, myPlayer.z - c.cz);
        if (cd < c.r && cd > 0.001) {
          const a = Math.atan2(myPlayer.z - c.cz, myPlayer.x - c.cx);
          myPlayer.x = c.cx + Math.cos(a) * c.r;
          myPlayer.z = c.cz + Math.sin(a) * c.r;
        }
      }

      // 3. Axis-Aligned Bounding Box (AABB) Collisions for All Town Architecture & Bridge Barriers
      const buildingColliders = [
        // Gacha Cathedral Sanctuary (0, -34)
        { x1: -7.5, x2: 7.5, z1: -44.0, z2: -26.5 },
        // Takas Pazarı & Demirci Ocağı (-24, -14)
        { x1: -31.0, x2: -17.0, z1: -20.0, z2: -9.5 },
        // Market Stall (-18.5, -7.5)
        { x1: -21.5, x2: -15.5, z1: -9.5, z2: -5.5 },
        // Cat's Tail Taverna (24, -14)
        { x1: 17.0, x2: 31.0, z1: -20.0, z2: -9.5 },
        // Tavern Outdoor Patio (24, -4)
        { x1: 19.0, x2: 29.0, z1: -7.5, z2: -0.5 },
        // Maceracılar Loncası (Guild Hall) (-24, 14)
        { x1: -31.0, x2: -17.0, z1: 9.5, z2: 20.0 },
        // Northwest Castle Keep (-36, -34)
        { x1: -43.0, x2: -29.0, z1: -41.0, z2: -27.0 },
        // River Watermill (16, 19.8)
        { x1: 12.0, x2: 20.0, z1: 16.5, z2: 22.5 },
        // Residential House East (33, 0)
        { x1: 28.5, x2: 37.5, z1: -4.5, z2: 4.5 },
        // Residential House West (-33, 0)
        { x1: -37.5, x2: -28.5, z1: -4.5, z2: 4.5 },
        // Residential House North-East (27, -26)
        { x1: 22.5, x2: 31.5, z1: -30.5, z2: -21.5 },
        // Benches around Central Plaza (diagonal corners: ±3.7, ±3.7)
        { x1: -4.6, x2: -2.8, z1: -4.6, z2: -2.8 },
        { x1: 2.8, x2: 4.6, z1: -4.6, z2: -2.8 },
        { x1: -4.6, x2: -2.8, z1: 2.8, z2: 4.6 },
        { x1: 2.8, x2: 4.6, z1: 2.8, z2: 4.6 },
        // Bridge Handrails (prevent falling off bridge deck sides)
        { x1: -3.8, x2: -3.1, z1: 18.0, z2: 30.0 },
        { x1: 3.1, x2: 3.8, z1: 18.0, z2: 30.0 },
        // River Canal Embankments (prevent walking into deep water channel outside bridge)
        { x1: -45.0, x2: -3.3, z1: 20.4, z2: 27.6 },
        { x1: 3.3, x2: 45.0, z1: 20.4, z2: 27.6 }
      ];
      for (const b of buildingColliders) {
        if (myPlayer.x > b.x1 && myPlayer.x < b.x2 && myPlayer.z > b.z1 && myPlayer.z < b.z2) {
          const dL = myPlayer.x - b.x1;
          const dR = b.x2 - myPlayer.x;
          const dT = myPlayer.z - b.z1;
          const dB = b.z2 - myPlayer.z;
          const minD = Math.min(dL, dR, dT, dB);
          if (minD === dL) myPlayer.x = b.x1;
          else if (minD === dR) myPlayer.x = b.x2;
          else if (minD === dT) myPlayer.z = b.z1;
          else myPlayer.z = b.z2;
        }
      }
    } else if (['trade_house', 'tavern', 'shrine', 'guild'].includes(currentMap)) {
      // Prevent walking through merchant shop counters in interior maps
      if (myPlayer.z < -3.2) myPlayer.z = -3.2;
    }

    // Lerp Mesh Position & Rotation
    if (activeSkillAimState && isBattleZone(currentMap)) {
      const aimNow = getCombatAimAngleAndTarget(true);
      myPlayer.rot = aimNow.angle;
    }

    // Dynamic Vertical Elevation (PvP Arena & Town Bridge Ramps)
    if (currentMap === 'pvp_arena') {
      const distCenter = Math.hypot(myPlayer.x, myPlayer.z);
      myPlayer.y = distCenter > 17.8 ? 1.2 : 0.0;
      const badge = document.getElementById('pvp-zone-badge');
      if (badge) {
        if (distCenter <= 17.8) {
          if (!badge.classList.contains('combat')) {
            badge.className = 'pvp-zone-badge combat';
            badge.textContent = '⚔️ DÖVÜŞ ÇUKURU';
          }
        } else {
          if (!badge.classList.contains('safe')) {
            badge.className = 'pvp-zone-badge safe';
            badge.textContent = '🛡️ TRİBÜN';
          }
        }
      }
    } else if (currentMap === 'town') {
      // Dynamic Bridge Elevation: Walk up approach ramp (y: 0.0 -> 0.65), across deck (0.65), and down exit ramp (0.65 -> 0.0)
      if (Math.abs(myPlayer.x) <= 3.25 && myPlayer.z >= 18.0 && myPlayer.z <= 30.0) {
        if (myPlayer.z < 21.0) {
          // North Approach Ramp (z: 18.0 -> 21.0, y: 0.0 -> 0.65)
          const t = (myPlayer.z - 18.0) / 3.0;
          myPlayer.y = t * 0.65;
        } else if (myPlayer.z > 27.0) {
          // South Exit Ramp (z: 27.0 -> 30.0, y: 0.65 -> 0.0)
          const t = (30.0 - myPlayer.z) / 3.0;
          myPlayer.y = t * 0.65;
        } else {
          // Flat Bridge Deck (z: 21.0 -> 27.0)
          myPlayer.y = 0.65;
        }
      } else {
        myPlayer.y = 0.0;
      }
    } else {
      myPlayer.y = 0;
    }

    myMesh.position.x = myPlayer.x;
    myMesh.position.y = myPlayer.y;
    myMesh.position.z = myPlayer.z;
    myMesh.rotation.y = myPlayer.rot;

    // Camera follow lerp
    const targetCamX = myPlayer.x;
    const targetCamZ = myPlayer.z + CONFIG.cameraDistance;
    camera.position.x += (targetCamX - camera.position.x) * CONFIG.posLerp;
    camera.position.z += (targetCamZ - camera.position.z) * CONFIG.posLerp;
    camera.position.y = CONFIG.cameraHeight + (myPlayer.y || 0);
    camera.lookAt(myPlayer.x, (myPlayer.y || 0) + 1.5, myPlayer.z);

    // Send movement to server (throttled to 20Hz)
    const now = Date.now();
    if (now - lastMoveSent > CONFIG.tickRate && socket && socket.readyState === WebSocket.OPEN) {
      lastMoveSent = now;
      socket.send(JSON.stringify({
        type: 'WORLD_MOVE',
        x: myPlayer.x,
        y: myPlayer.y,
        z: myPlayer.z,
        rot: myPlayer.rot,
        anim: myPlayer.anim
      }));
    }

    // Check Proximity to Doors, Players, or NPCs
    checkProximity();
  }

  function checkProximity() {
    const prompt = document.getElementById('action-prompt');
    const promptText = document.getElementById('prompt-text');
    nearbyInteractable = null;

    if (isRPGDialogueOpen) {
      prompt.classList.add('hidden');
      return;
    }

    // Check Town Doors & Town NPCs
    if (currentMap === 'town') {
      // 1. Town Doors
      const doors = [
        { id: 'door_trade', name: 'Pazar & Takas Binası', pos: { x: -24, z: -10.0 } },
        { id: 'door_tavern', name: "Cat's Tail Taverna", pos: { x: 24, z: -10.0 } },
        { id: 'door_shrine', name: 'Dilek Tapınağı', pos: { x: 0, z: -26.0 } },
        { id: 'door_guild', name: 'Maceracılar Loncası', pos: { x: -24, z: 10.0 } },
        { id: 'door_battle', name: '🌀 Kadim Zindan Portalı', pos: { x: -6.5, z: 32.0 } },
        { id: 'door_pvp', name: '⚔️ Gladyatör Arenası (PvP)', pos: { x: 6.5, z: 32.0 } }
      ];

      for (const d of doors) {
        const dist = Math.hypot(myPlayer.x - d.pos.x, myPlayer.z - d.pos.z);
        if (dist < 4.2) {
          nearbyInteractable = { type: 'door', data: d };
          if (d.id === 'door_battle') {
            promptText.textContent = `[E] ${d.name} (Bölge Seçimi)`;
          } else {
            promptText.textContent = `[E] ${d.name}'na Gir`;
          }
          prompt.classList.remove('hidden');
          return;
        }
      }

      // 2. Town NPCs
      const amberDist = Math.hypot(myPlayer.x - (-16), myPlayer.z - 9.5);
      if (amberDist < 3.4) {
        nearbyInteractable = { type: 'npc_amber', name: 'Amber' };
        promptText.textContent = `[E] Amber ile Konuş (Kasaba Rehberi)`;
        prompt.classList.remove('hidden');
        return;
      }

      const ventiDist = Math.hypot(myPlayer.x - 24, myPlayer.z - 13.8);
      if (ventiDist < 3.4) {
        nearbyInteractable = { type: 'npc_venti', name: 'Venti' };
        promptText.textContent = `[E] Venti ile Konuş (Rüzgar Ozanı)`;
        prompt.classList.remove('hidden');
        return;
      }

      // 3. River Fishing Spot (along southern canal z = 24)
      const distToRiver = Math.abs(myPlayer.z - 24);
      if (distToRiver < 4.4 && !isFishing) {
        nearbyInteractable = { type: 'river_fishing' };
        promptText.textContent = `[E] 🎣 Oltayı Nehre At (Balık Tut & Primogem Kazan)`;
        prompt.classList.remove('hidden');
        return;
      }
    } else if (isBattleZone(currentMap)) {
      // 1. Check Unclaimed 3D Dungeon Treasure Chests first
      if (isDungeonMap(currentMap) && activeDungeonChests.length > 0) {
        for (const ch of activeDungeonChests) {
          if (ch.claimed) continue;
          const cDist = Math.hypot(myPlayer.x - ch.x, myPlayer.z - ch.z);
          if (cDist < 3.8) {
            nearbyInteractable = { type: 'dungeon_chest', data: ch };
            promptText.textContent = ch.isBonusChest
              ? `[E] 🌟 Efsanevi S-Rank Abyss Sandığını Aç!`
              : `[E] 🎁 Aion Zindan Hazinesini Aç (${dungeonState.rank}-Rank)`;
            prompt.classList.remove('hidden');
            return;
          }
        }
      }

      // 2. Check Exit Portal Gate back to Town
      const exitZ = isDungeonMap(currentMap) ? -66.0 : (currentMap === 'pvp_arena' ? -28.0 : -32.0);
      const dist = Math.hypot(myPlayer.x - 0, myPlayer.z - exitZ);
      if (dist < 6.0) {
        nearbyInteractable = { type: 'door', data: { name: 'Kasaba Meydanı' } };
        promptText.textContent = `[E] Kasabaya Geri Dön`;
        prompt.classList.remove('hidden');
        return;
      }
      // Also allow quick exit near the Boss Altar after clearing the dungeon!
      if (isDungeonMap(currentMap) && dungeonState.bossDefeated) {
        const endPortalDist = Math.hypot(myPlayer.x - 0, myPlayer.z - 72.0);
        if (endPortalDist < 6.5) {
          nearbyInteractable = { type: 'door', data: { name: 'Kasaba Meydanı' } };
          promptText.textContent = `[E] 🌀 Zafer Portalından Kasabaya Dön`;
          prompt.classList.remove('hidden');
          return;
        }
      }
    } else {
      // Check Exit Door
      const dist = Math.hypot(myPlayer.x - 0, myPlayer.z - 10.0);
      if (dist < 3.2) {
        nearbyInteractable = { type: 'door', data: { name: 'Kasaba Meydanı' } };
        promptText.textContent = `[E] Meydana Çık`;
        prompt.classList.remove('hidden');
        return;
      }

      // Check Interior NPC / Object interactions
      if (currentMap === 'trade_house') {
        const dNpc = Math.hypot(myPlayer.x - 0, myPlayer.z - (-4.0));
        if (dNpc < 3.4) {
          nearbyInteractable = { type: 'npc_trade', name: 'Tüccar Liben' };
          promptText.textContent = `[E] Tüccar Liben ile Konuş`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'tavern') {
        const dNpc = Math.hypot(myPlayer.x - 7.5, myPlayer.z - (-2.5));
        if (dNpc < 3.4) {
          nearbyInteractable = { type: 'npc_tavern', name: 'Diona' };
          promptText.textContent = `[E] Diona ile Konuş`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'shrine') {
        const dNpc = Math.hypot(myPlayer.x - 0, myPlayer.z - (-3.0));
        if (dNpc < 3.8) {
          nearbyInteractable = { type: 'npc_shrine', name: 'Kader Sunağı' };
          promptText.textContent = `[E] Yae Miko ile Konuş`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'guild') {
        const dNpc = Math.hypot(myPlayer.x - (-8.5), myPlayer.z - (-4.5));
        if (dNpc < 3.4) {
          nearbyInteractable = { type: 'npc_guild', name: 'Katheryne' };
          promptText.textContent = `[E] Katheryne ile Konuş`;
          prompt.classList.remove('hidden');
          return;
        }
      }
    }

    // Check Nearby Players for Interaction (Inspect & Trade)
    for (const [id, entry] of otherPlayers.entries()) {
      const dist = Math.hypot(myPlayer.x - entry.mesh.position.x, myPlayer.z - entry.mesh.position.z);
      if (dist < 2.8) {
        nearbyInteractable = { type: 'player', data: entry.data };
        const gsStr = entry.data.gearScore ? ` [GS ${entry.data.gearScore}]` : '';
        promptText.textContent = `[E] @${entry.data.username}${gsStr} İncele / Takas`;
        prompt.classList.remove('hidden');
        return;
      }
    }

    prompt.classList.add('hidden');
  }

  function triggerInteract() {
    if (isRPGDialogueOpen) {
      advanceRPGDialogue();
      return;
    }

    if (!nearbyInteractable) return;

    if (nearbyInteractable.type === 'door') {
      if (nearbyInteractable.data && nearbyInteractable.data.id === 'door_battle') {
        openPortalZoneModal();
        return;
      }
      playBeep(520, 'triangle', 0.15);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_DOOR_INTERACT' }));
      }
    } else if (nearbyInteractable.type === 'player') {
      playBeep(659, 'sine', 0.15);
      openPlayerInteractMenu(nearbyInteractable.data);
    } else if (nearbyInteractable.type && nearbyInteractable.type.startsWith('npc_')) {
      playBeep(659, 'sine', 0.15);
      openRPGDialogue(nearbyInteractable.type);
    } else if (nearbyInteractable.type === 'river_fishing') {
      startFishing();
    } else if (nearbyInteractable.type === 'dungeon_chest') {
      claimDungeonChestFromWorld(nearbyInteractable.data);
    }
  }

  // --- 10. Classic JRPG Ornate Dialogue System (Fire Emblem Style) ---
  const NPC_DIALOGUES = {
    npc_trade: {
      name: 'Tüccar Liben',
      title: 'Büyük Gezgin Tüccar',
      presetIndex: 0,
      lines: [
        "Hoş geldin dostum! Teyvat'ın dört bir yanındaki zindanlardan ve harabelerden canavar materyalleri topluyorum.",
        "Savaş Arenasından getireceğin Slime sıvılarını, Hilichurl maskelerini, Uçurum parşömenlerini ve Kadim Kaos Çekirdeklerini yüksek fiyata Primogem karşılığı satın alırım!"
      ],
      choices: [
        { text: '💰 Canavar Materyallerini Sat (Primogem Pazarı)', action: 'open_monster_market' },
        { text: '📦 Takas Pazarı Nasıl Çalışır?', action: 'explain_trade' },
        { text: '💎 Primogem Kazanma Yolları', action: 'explain_primo' },
        { text: '👋 Teşekkürler, sonra görüşürüz', action: 'close' }
      ]
    },
    npc_tavern: {
      name: 'Diona',
      title: 'Kedi İksir Ustası',
      presetIndex: 8,
      lines: [
        "Hıh! Şarap sarhoşlarına inat sana özel ferahlatıcı kurbağaotu ve buzlu çilek kokteyli hazırlayabilirim!",
        "İçtiğin anda enerjin yerine gelecek ve kasabada rüzgar gibi adımlayabileceksin!"
      ],
      choices: [
        { text: '🍸 Özel Kedi Kokteyli Ismarla (+20 💎)', action: 'diona_drink' },
        { text: '🐱 Kedi Kulaklarını Sev', action: 'diona_pat' },
        { text: '👋 Şimdilik hoşça kal', action: 'close' }
      ]
    },
    npc_shrine: {
      name: '🌸 Yae Miko',
      title: 'Baş Rahibe & Kader Danışmanı',
      presetIndex: 11,
      lines: [
        "Ah, sevimli küçük gezgin... Kaderin gizemli iplikleri bugün senin için parıldıyor.",
        "Büyük Narukami Mabedi'nin kutsal yıldızları seni çağırıyor. Kader dileği çekmek ister misin?"
      ],
      choices: [
        { text: '✨ Kader Dileği Çek (!wish / 160 💎)', action: 'wish_single' },
        { text: '🌟 10x Büyük Yıldız Çekilişi (!wish10)', action: 'wish_ten' },
        { text: '👋 Huzurla ayrıl', action: 'close' }
      ]
    },
    npc_guild: {
      name: 'Katheryne',
      title: 'Maceracılar Loncası Katibi',
      presetIndex: 1,
      lines: [
        "Yıldızlara ve derinliklere doğru! Maceracılar Loncası Kasaba Şubesine hoş geldiniz.",
        "Mylune Kick canlı yayını ve Teyvat 3D dünyası için hazırlanan Günlük Lonca Görevlerini tamamlayarak her gün Primogem ve Efsanevi Ekipman sandığı kazanabilirsiniz!"
      ],
      choices: [
        { text: '📜 Mylune Günlük Görevleri Aç [J]', action: 'guild_bounty' },
        { text: '🗺️ Kedi Seferlerini Aç (/expeditions)', action: 'open_expeditions' },
        { text: '👋 Teşekkürler Katheryne', action: 'close' }
      ]
    },
    npc_amber: {
      name: 'Amber',
      title: 'Favonius Öncü Keşifçisi',
      presetIndex: 2,
      lines: [
        "Selam Gezgin! Ben Favonius Şövalyeleri Öncü Keşifçisi Amber!",
        "Kasabamız çok ferah! Fıskiyenin etrafındaki banklarda dinlenebilir, Cat's Tail tavernasında kedilerle vakit geçirebilirsin."
      ],
      choices: [
        { text: '🗺️ Kasaba Binaları Nerede?', action: 'amber_guide' },
        { text: '🏹 Rüzgar Planörü Tavsiyeleri', action: 'amber_glider' },
        { text: '👋 Teşekkürler Amber!', action: 'close' }
      ]
    },
    npc_venti: {
      name: '🍃 Venti',
      title: 'Özgür Rüzgar Ozanı',
      presetIndex: 10,
      lines: [
        "Ehehe~ Rüzgarın kadim şarkısını duyuyor musun dostum?",
        "Nehir kenarındaki gazebonun manzarası eşliğinde sana eski Mondstadt baladlarından çalabilirim..."
      ],
      choices: [
        { text: '🎵 Ozan Baladı Dinle', action: 'venti_song' },
        { text: '🍃 Rüzgar Kutsaması Al (%35 Hız)', action: 'venti_blessing' },
        { text: '👋 Görüşürüz Venti', action: 'close' }
      ]
    }
  };

  let isRPGDialogueOpen = false;
  let currentDialogue = null;
  let dialogueLineIndex = 0;
  let typewriterTimer = null;
  let isTyping = false;
  let currentFullText = '';

  function drawNPCDialoguePortrait(canvas, npcKey, presetIndex) {
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const preset = AVATAR_PRESETS[presetIndex % AVATAR_PRESETS.length];
    const skinCss = hexToCss(preset.skin);
    const hairCss = hexToCss(preset.hair);
    const clothesCss = hexToCss(preset.clothes);

    const cx = w / 2;
    const headY = 110;
    const headR = 52;

    // 1. Shoulders & Upper Torso
    ctx.fillStyle = clothesCss;
    ctx.beginPath();
    ctx.moveTo(cx - 75, h);
    ctx.lineTo(cx - 50, 165);
    ctx.lineTo(cx + 50, 165);
    ctx.lineTo(cx + 75, h);
    ctx.closePath();
    ctx.fill();

    // Collar & Scarf / Trims
    ctx.fillStyle = hexToCss(preset.trim || 0xfacc15);
    ctx.beginPath();
    ctx.moveTo(cx - 30, 155);
    ctx.lineTo(cx, 185);
    ctx.lineTo(cx + 30, 155);
    ctx.lineTo(cx + 15, 155);
    ctx.lineTo(cx, 172);
    ctx.lineTo(cx - 15, 155);
    ctx.closePath();
    ctx.fill();

    // Neck
    ctx.fillStyle = skinCss;
    ctx.fillRect(cx - 18, 140, 36, 26);

    // 2. Head Silhouette
    ctx.fillStyle = skinCss;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // 3. Hair (Back)
    ctx.fillStyle = hairCss;
    ctx.beginPath();
    ctx.arc(cx, headY - 4, headR + 4, Math.PI, Math.PI * 2);
    ctx.fill();

    // 4. Character Specific Accessories & Headgear
    if (npcKey === 'npc_tavern' || preset.hairStyle === 'cat_ears') {
      [-28, 28].forEach(ex => {
        ctx.fillStyle = hairCss;
        ctx.beginPath();
        ctx.moveTo(cx + ex - 16, headY - headR + 10);
        ctx.lineTo(cx + ex, headY - headR - 35);
        ctx.lineTo(cx + ex + 16, headY - headR + 10);
        ctx.fill();

        ctx.fillStyle = '#fda4af';
        ctx.beginPath();
        ctx.moveTo(cx + ex - 10, headY - headR + 10);
        ctx.lineTo(cx + ex, headY - headR - 24);
        ctx.lineTo(cx + ex + 10, headY - headR + 10);
        ctx.fill();
      });
    } else if (npcKey === 'npc_amber' || preset.hairStyle === 'amber_ears') {
      ctx.fillStyle = '#dc2626';
      [-22, 22].forEach(ex => {
        ctx.beginPath();
        ctx.ellipse(cx + ex, headY - headR - 18, 12, 32, ex > 0 ? 0.35 : -0.35, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.arc(cx, headY - headR + 2, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (npcKey === 'npc_venti' || preset.hairStyle === 'venti_beret') {
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR - 6, headR * 1.05, 24, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + 38, headY - headR - 4, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(cx + 38, headY - headR - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (npcKey === 'npc_shrine' || preset.hairStyle === 'miko_ears') {
      ctx.fillStyle = hairCss;
      [-36, 36].forEach(ex => {
        ctx.beginPath();
        ctx.moveTo(cx + ex - 14, headY - 10);
        ctx.lineTo(cx + ex * 1.4, headY - headR - 25);
        ctx.lineTo(cx + ex + 14, headY - 20);
        ctx.fill();
      });
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 38, headY - 24, 14, 28);
    } else if (npcKey === 'npc_trade') {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(cx - headR, headY - headR + 6, headR * 2, 16);
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, headY - headR + 14, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Hair Bangs & Face Framing Locks
    ctx.fillStyle = hairCss;
    ctx.beginPath();
    ctx.moveTo(cx - headR, headY - 10);
    ctx.quadraticCurveTo(cx - 24, headY + 16, cx - 10, headY - 6);
    ctx.quadraticCurveTo(cx + 12, headY + 18, cx + 22, headY - 8);
    ctx.quadraticCurveTo(cx + 42, headY + 16, cx + headR, headY - 10);
    ctx.lineTo(cx + headR + 4, headY - headR);
    ctx.lineTo(cx - headR - 4, headY - headR);
    ctx.closePath();
    ctx.fill();

    // Side locks
    ctx.beginPath();
    ctx.moveTo(cx - headR - 2, headY - 10);
    ctx.lineTo(cx - headR + 8, headY + 45);
    ctx.lineTo(cx - headR + 18, headY + 10);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + headR + 2, headY - 10);
    ctx.lineTo(cx + headR - 8, headY + 45);
    ctx.lineTo(cx + headR - 18, headY + 10);
    ctx.fill();

    // 6. Expressive Sparkling Anime Eyes
    const eyeColor = preset.eyes || '#3b82f6';
    [-22, 22].forEach(ex => {
      const eyeX = cx + ex;
      const eyeY = headY + 8;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, 11, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      const ig = ctx.createLinearGradient(eyeX, eyeY - 12, eyeX, eyeY + 14);
      ig.addColorStop(0, '#0f172a');
      ig.addColorStop(0.5, eyeColor);
      ig.addColorStop(1, '#ffffff');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY + 1, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY + 1, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX - 3, eyeY - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eyeX + 3, eyeY + 4, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY - 4, 11, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = hairCss;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY - 15, 9, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
    });

    // 7. Soft Rosy Blushes
    ctx.fillStyle = 'rgba(244, 63, 94, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cx - 30, headY + 24, 9, 5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 30, headY + 24, 9, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 8. Cute Anime Mouth
    if (preset.hairStyle === 'cat_ears') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#881337';
      ctx.beginPath();
      ctx.arc(cx - 4, headY + 31, 3.5, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 4, headY + 31, 3.5, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#881337';
      ctx.beginPath();
      ctx.arc(cx, headY + 29, 6, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  function openRPGDialogue(npcType) {
    const diag = NPC_DIALOGUES[npcType];
    if (!diag) return;

    currentDialogue = diag;
    dialogueLineIndex = 0;
    isRPGDialogueOpen = true;

    if (npcType === 'npc_guild') {
      notifyGuildVisit();
    }

    // Reset keyboard motion
    keys.w = keys.a = keys.s = keys.d = keys.up = keys.down = keys.left = keys.right = false;
    joystickVector.x = 0;
    joystickVector.y = 0;

    const modal = document.getElementById('rpg-dialogue-modal');
    const nameEl = document.getElementById('rpg-dialogue-name');
    const titleEl = document.getElementById('rpg-dialogue-title');
    const portraitCanvas = document.getElementById('rpg-npc-portrait');
    const choicesBox = document.getElementById('rpg-dialogue-choices');

    if (nameEl) nameEl.textContent = diag.name;
    if (titleEl) titleEl.textContent = diag.title || '';
    if (choicesBox) {
      choicesBox.classList.add('hidden');
      choicesBox.innerHTML = '';
    }

    drawNPCDialoguePortrait(portraitCanvas, npcType, diag.presetIndex || 0);

    if (modal) modal.classList.remove('hidden');
    displayDialogueLine(0);
  }

  function displayDialogueLine(index) {
    if (!currentDialogue) return;
    const textEl = document.getElementById('rpg-dialogue-text');
    const choicesBox = document.getElementById('rpg-dialogue-choices');

    if (typewriterTimer) clearInterval(typewriterTimer);
    if (choicesBox) {
      choicesBox.classList.add('hidden');
      choicesBox.innerHTML = '';
    }

    currentFullText = currentDialogue.lines[index] || '';
    let charIdx = 0;
    if (textEl) textEl.textContent = '';
    isTyping = true;

    typewriterTimer = setInterval(() => {
      charIdx++;
      if (textEl) textEl.textContent = currentFullText.slice(0, charIdx);

      if (charIdx % 2 === 0) {
        playBeep(440 + (charIdx % 6) * 35, 'triangle', 0.03);
      }

      if (charIdx >= currentFullText.length) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
        isTyping = false;
        onLineFinished(index);
      }
    }, 22);
  }

  function onLineFinished(index) {
    if (index >= currentDialogue.lines.length - 1 && currentDialogue.choices && currentDialogue.choices.length > 0) {
      const choicesBox = document.getElementById('rpg-dialogue-choices');
      if (!choicesBox) return;
      choicesBox.innerHTML = '';
      currentDialogue.choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'rpg-choice-btn';
        btn.innerHTML = `<span>${ch.text}</span> <span style="opacity:0.6">▶</span>`;
        btn.onclick = (e) => {
          e.stopPropagation();
          handleRPGChoice(ch.action);
        };
        choicesBox.appendChild(btn);
      });
      choicesBox.classList.remove('hidden');
    }
  }

  function advanceRPGDialogue() {
    if (!isRPGDialogueOpen || !currentDialogue) return;

    if (isTyping) {
      if (typewriterTimer) clearInterval(typewriterTimer);
      typewriterTimer = null;
      isTyping = false;
      const textEl = document.getElementById('rpg-dialogue-text');
      if (textEl) textEl.textContent = currentFullText;
      onLineFinished(dialogueLineIndex);
      return;
    }

    if (dialogueLineIndex < currentDialogue.lines.length - 1) {
      dialogueLineIndex++;
      displayDialogueLine(dialogueLineIndex);
    } else {
      const choicesBox = document.getElementById('rpg-dialogue-choices');
      if (choicesBox && !choicesBox.classList.contains('hidden') && choicesBox.children.length > 0) {
        return;
      }
      closeRPGDialogue();
    }
  }

  function closeRPGDialogue() {
    if (typewriterTimer) clearInterval(typewriterTimer);
    typewriterTimer = null;
    isTyping = false;
    isRPGDialogueOpen = false;
    currentDialogue = null;
    const modal = document.getElementById('rpg-dialogue-modal');
    if (modal) modal.classList.add('hidden');
  }

  function handleRPGChoice(action) {
    playBeep(750, 'sine', 0.12);
    closeRPGDialogue();

    if (action === 'open_monster_market') {
      openMonsterMarketModal();
    } else if (action === 'explain_trade') {
      addChatMessage('Tüccar Liben', '🤝 "Meydanda herhangi bir gezginin yanına gidip [E] tuşuna bas! Karşılıklı Primogem ve eşya teklifi yapıp kilitledikten sonra anında takas edin."');
    } else if (action === 'explain_primo') {
      addChatMessage('Tüccar Liben', '💎 "Kick yayınını izlerken veya sohbette sohbet ederek Primogem kazanırsın. Ayrıca kedi madencilerin mağara seferlerinden de Primogem cevherleri çıkar!"');
    } else if (action === 'diona_drink') {
      playBeep(880, 'sine', 0.25);
      myPlayer.primogems += 20;
      updateUIProfile();
      addChatMessage('Diona', '🍸 "Al bakalım! Özel kurbağaotu ve buzlu çilek iksiri! Kendini zinde hissedeceksin! (+20 💎 hediye)"');
    } else if (action === 'diona_pat') {
      addChatMessage('Diona', '🐱 "Miyav! Dur... saçlarımı dağıtma! Ama... sadece birazcık sevebilirsin..."');
    } else if (action === 'wish_single') {
      addChatMessage('Sistem', '✨ Sohbet kutusuna !wish yazarak 160 Primogem karşılığı hemen kader dileği çekebilirsin!');
    } else if (action === 'wish_ten') {
      addChatMessage('Sistem', '🌟 Sohbet kutusuna !wish10 yazarak 10 adet kader dileğini aynı anda çekebilirsin!');
    } else if (action === 'open_expeditions') {
      addChatMessage('Katheryne', '🗺️ "Kedi seferleri panelini açmak için /expeditions sekmesini ziyaret edin!"');
    } else if (action === 'guild_bounty') {
      notifyGuildVisit();
      openDailyQuestsModal();
    } else if (action === 'amber_guide') {
      addChatMessage('Amber', '🗺️ "Kuzeyde Dilek Tapınağı, batıda Pazar ve Lonca, doğuda Cat\'s Tail Taverna ve Gazebo Parkı var!"');
    } else if (action === 'amber_glider') {
      addChatMessage('Amber', '🏹 "Planörle uçarken rüzgar akıntılarını arkana almayı unutma! Mondstadt semaları seni bekler!"');
    } else if (action === 'venti_song') {
      playVentiArpeggio();
      addChatMessage('Venti', '🎵 "Nehirler akar, rüzgar fısıldar... Eski çağların kahramanları hâlâ aramızda..."');
    } else if (action === 'venti_blessing') {
      playBeep(659, 'sine', 0.2);
      CONFIG.moveSpeed *= 1.35;
      setTimeout(() => { CONFIG.moveSpeed /= 1.35; }, 15000);
      addChatMessage('Venti', '🍃 "Barbatos\'un rüzgarı seninle olsun! 15 saniye boyunca %35 daha hızlı koşacaksın!"');
    }
  }

  function playVentiArpeggio() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playBeep(freq, 'sine', 0.22);
      }, idx * 120);
    });
  }

  function triggerDoorWipe(targetMap, spawnPos = null) {
    const wipe = document.getElementById('screen-wipe');
    wipe.classList.add('active');

    setTimeout(() => {
      currentMap = targetMap;
      if (targetMap === 'town') {
        dungeonState.active = false;
        document.getElementById('dungeon-hud')?.classList.add('hidden');
        document.getElementById('dungeon-mechanic-banner')?.classList.add('hidden');
        document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
        document.getElementById('pvp-hud')?.classList.add('hidden');
        buildTownMap();
        myPlayer.x = spawnPos ? spawnPos.x : 0;
        myPlayer.y = 0;
        myPlayer.z = spawnPos ? spawnPos.z : 26;
        document.getElementById('combat-hud')?.classList.add('hidden');
        detachCombatWeapon();
      } else if (targetMap === 'pvp_arena') {
        dungeonState.active = false;
        document.getElementById('dungeon-hud')?.classList.add('hidden');
        document.getElementById('dungeon-mechanic-banner')?.classList.add('hidden');
        document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
        document.getElementById('pvp-hud')?.classList.remove('hidden');
        buildPvPArenaMap();
        myPlayer.x = spawnPos ? spawnPos.x : 0;
        myPlayer.y = 1.2;
        myPlayer.z = spawnPos ? spawnPos.z : -24;
      } else if (isDungeonMap(targetMap)) {
        document.getElementById('pvp-hud')?.classList.add('hidden');
        buildAionDungeonMap(targetMap);
        myPlayer.x = 0;
        myPlayer.y = 0;
        myPlayer.z = -60;
      } else if (isBattleZone(targetMap)) {
        document.getElementById('pvp-hud')?.classList.add('hidden');
        dungeonState.active = false;
        document.getElementById('dungeon-hud')?.classList.add('hidden');
        document.getElementById('dungeon-mechanic-banner')?.classList.add('hidden');
        document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
        buildBattleZoneMap(targetMap);
        myPlayer.x = 0;
        myPlayer.y = 0;
        myPlayer.z = -28;
      } else {
        document.getElementById('pvp-hud')?.classList.add('hidden');
        dungeonState.active = false;
        document.getElementById('dungeon-hud')?.classList.add('hidden');
        document.getElementById('dungeon-mechanic-banner')?.classList.add('hidden');
        document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
        buildInteriorMap(targetMap);
        myPlayer.x = 0;
        myPlayer.y = 0;
        myPlayer.z = 6;
        document.getElementById('combat-hud')?.classList.add('hidden');
        detachCombatWeapon();
      }
      updateMyMesh();
      setTimeout(() => wipe.classList.remove('active'), 150);
    }, 350);
  }

  // --- 11. Active River Fishing Minigame System ---
  const FISH_LOOT_TABLE = [
    {
      id: 'boot',
      name: 'Eski Yosunlu Çizme',
      rarity: '1★ Çöp (Ama Primolu!)',
      stars: '★☆☆☆☆',
      emoji: '👞',
      primo: 10,
      weight: 15,
      desc: "Nehrin dibinden yosunlu eski bir çizme çıktı... Ama içine baktığında unutulmuş 10 Primogem buldun!",
      difficulty: 'Çok Kolay',
      barRatio: 0.32,
      fishSpeed: 0.45,
      erratic: 0.15,
      fillRate: 38,
      decayRate: 14
    },
    {
      id: 'carp',
      name: 'Gümüş Nehir Sazanı',
      rarity: '2★ Yaygın Nehir Balığı',
      stars: '★★☆☆☆',
      emoji: '🐟',
      primo: 25,
      weight: 42,
      desc: "Taze ve lezzetli bir Gümüş Nehir Sazanı yakalandı! Kasaba şefleri buna bayılacak.",
      difficulty: 'Kolay',
      barRatio: 0.28,
      fishSpeed: 0.85,
      erratic: 0.35,
      fillRate: 32,
      decayRate: 18
    },
    {
      id: 'bass',
      name: 'Altın Levrek',
      rarity: '3★ Nadir Balık',
      stars: '★★★☆☆',
      emoji: '🐠',
      primo: 50,
      weight: 23,
      desc: "Güneş ışığında pulları altın gibi parıldayan dolgun ve çevik bir Altın Levrek!",
      difficulty: 'Orta',
      barRatio: 0.24,
      fishSpeed: 1.45,
      erratic: 0.6,
      fillRate: 28,
      decayRate: 22
    },
    {
      id: 'crystal',
      name: 'Kraliyet Kristal Balığı',
      rarity: '4★ Çok Nadir Balık',
      stars: '★★★★☆',
      emoji: '🐡',
      primo: 90,
      weight: 12,
      desc: "Derin kaynak sularında yaşayan, pulları saf kristal berraklığında efsanevi bir nehir balığı!",
      difficulty: 'Zorlu',
      barRatio: 0.20,
      fishSpeed: 2.3,
      erratic: 0.85,
      fillRate: 24,
      decayRate: 26
    },
    {
      id: 'paimon',
      name: 'Acil Durum Yiyeceği Paimon!',
      rarity: '5★ EFSANEVİ JACKPOT (1 WISH)',
      stars: '★★★★★',
      emoji: '✨🧚',
      primo: 160,
      weight: 8,
      desc: "İNANILMAZ! Oltana suda yüzen Acil Durum Yiyeceği Paimon takıldı! 'Beni boğulmaktan kurtardın!' diyerek sana tam 160 Primogem (1 Wish) hediye ediyor!",
      difficulty: 'Efsanevi (Çevik & Hızlı)',
      barRatio: 0.16,
      fishSpeed: 3.2,
      erratic: 1.25,
      fillRate: 22,
      decayRate: 28
    }
  ];

  function rollFishReward() {
    const total = FISH_LOOT_TABLE.reduce((s, f) => s + f.weight, 0);
    let r = Math.random() * total;
    for (const f of FISH_LOOT_TABLE) {
      if (r < f.weight) return f;
      r -= f.weight;
    }
    return FISH_LOOT_TABLE[0];
  }

  function startFishing() {
    if (isFishing || currentMap !== 'town' || !myMesh) return;

    if (Math.abs(myPlayer.z - 24) > 4.4) {
      addChatMessage('Sistem', '⚠️ Balık tutmak için nehir kıyısına veya ahşap iskeleye yaklaşmalısın!');
      return;
    }

    isFishing = true;
    fishingState = 'waiting';
    myPlayer.anim = 'idle';

    // Face the water
    if (myPlayer.z < 24) {
      myPlayer.rot = 0; // Face south
    } else {
      myPlayer.rot = Math.PI; // Face north
    }
    myMesh.rotation.y = myPlayer.rot;

    // Attach 3D Bamboo Fishing Rod to Player's right hand
    const rightArm = myMesh.userData?.rig?.rightArmGroup;
    if (rightArm) {
      if (fishingRodMesh) rightArm.remove(fishingRodMesh);

      fishingRodMesh = new THREE.Group();
      const poleGeo = new THREE.CylinderGeometry(0.018, 0.038, 2.4, 8);
      poleGeo.translate(0, 1.2, 0);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0xd97706 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.rotation.x = Math.PI / 3.4;
      pole.position.set(0, -0.45, 0.1);
      fishingRodMesh.add(pole);

      rightArm.add(fishingRodMesh);
    }

    // Spawn 3D Bobber in River Water
    const bobberX = myPlayer.x + (Math.random() - 0.5) * 1.5;
    const bobberZ = 24.0 + (Math.random() - 0.5) * 1.2;

    if (fishingBobberMesh) scene.remove(fishingBobberMesh);
    const bobberGroup = new THREE.Group();

    const floatTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    const floatBottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    antenna.position.y = 0.16;

    bobberGroup.add(floatTop);
    bobberGroup.add(floatBottom);
    bobberGroup.add(antenna);
    bobberGroup.position.set(bobberX, 0.06, bobberZ);
    scene.add(bobberGroup);
    fishingBobberMesh = bobberGroup;

    // Cast Sound
    playBeep(480, 'sine', 0.12);

    // Show Fishing HUD
    const hud = document.getElementById('fishing-hud');
    const hudText = document.getElementById('fishing-hud-text');
    if (hud && hudText) {
      hud.classList.remove('bite');
      hud.classList.remove('hidden');
      hudText.textContent = '🎣 Yem suda salınıyor... Balıklar yaklaşıyor...';
    }

    // Suspense delay before fish bites (2.2s - 4.5s)
    const waitTime = 2200 + Math.random() * 2300;
    fishingTimer = setTimeout(() => {
      triggerBite();
    }, waitTime);
  }

  function triggerBite() {
    if (!isFishing || fishingState !== 'waiting') return;
    fishingState = 'bite';

    if (fishingBobberMesh) {
      fishingBobberMesh.position.y = -0.15;
    }

    // Sharp tension sound
    playBeep(784, 'triangle', 0.18);
    setTimeout(() => playBeep(880, 'sine', 0.22), 80);

    // Update HUD with alert
    const hud = document.getElementById('fishing-hud');
    const hudText = document.getElementById('fishing-hud-text');
    if (hud && hudText) {
      hud.classList.add('bite');
      hudText.textContent = '❗ VURDU! OLTAYI ÇEK! [E] / [SPACE] / TIKLA! ❗';
    }

    // Reaction window (1.8 seconds)
    biteTimeout = setTimeout(() => {
      fishEscaped();
    }, 1800);
  }

  function reelIn() {
    if (!isFishing) return;

    if (fishingState === 'waiting') {
      addChatMessage('Sistem', '⚠️ Çok erken çektin! Balık henüz yemi ısırmamıştı.');
      stopFishing();
      return;
    }

    if (fishingState === 'bite') {
      if (biteTimeout) clearTimeout(biteTimeout);
      const caughtFish = rollFishReward();
      currentHookedFish = caughtFish;
      startFishingMinigame(caughtFish);
      return;
    }
  }

  // --- River Fishing Minigame (Stardew / Genshin Reel Mechanics) ---
  function startFishingMinigame(fish) {
    fishingState = 'minigame';
    minigameFish = fish;

    // Play hook tension sound
    playBeep(587.33, 'triangle', 0.15);
    setTimeout(() => playBeep(783.99, 'sine', 0.2), 70);

    // Hide waiting HUD
    const hud = document.getElementById('fishing-hud');
    if (hud) hud.classList.add('hidden');

    // Show Minigame UI
    const mg = document.getElementById('fishing-minigame');
    if (mg) mg.classList.remove('hidden');

    // Init values
    const barRatio = fish.barRatio || 0.24;
    minigameBarY = 0.2;
    minigameBarVel = 0;
    minigameFishY = 0.35;
    minigameFishTargetY = 0.5;
    minigameFishMoveTimer = 0.4;
    minigameProgress = 35; // starts at 35% buffer
    isReeling = false;
    minigameAudioTick = 0;

    // Populate UI
    const iconEl = document.getElementById('fishing-mg-icon');
    if (iconEl) iconEl.textContent = fish.emoji || '🐟';
    const fishEl = document.getElementById('fishing-mg-fish');
    if (fishEl) fishEl.textContent = fish.emoji || '🐟';

    const titleEl = document.getElementById('fishing-mg-title');
    if (titleEl) titleEl.textContent = `${fish.name} Direniyor!`;

    const badgeEl = document.getElementById('fishing-mg-badge');
    if (badgeEl) badgeEl.textContent = `${fish.stars || '★★★☆☆'} ${fish.difficulty || 'Mücadele'}`;

    const barEl = document.getElementById('fishing-mg-bar');
    if (barEl) {
      barEl.style.height = (barRatio * 100) + '%';
      barEl.style.bottom = (minigameBarY * 100) + '%';
      barEl.classList.remove('on-fish');
    }

    const progFill = document.getElementById('fishing-mg-progress-fill');
    if (progFill) progFill.style.height = minigameProgress + '%';
    const pctEl = document.getElementById('fishing-mg-pct');
    if (pctEl) pctEl.textContent = Math.round(minigameProgress) + '%';

    const tensionEl = document.getElementById('fishing-mg-tension');
    const tensionText = document.getElementById('fishing-mg-tension-text');
    if (tensionEl && tensionText) {
      tensionEl.classList.remove('warning');
      tensionText.textContent = 'MİSİNA HAZIR';
    }
  }

  function updateFishingMinigame(delta, now) {
    if (fishingState !== 'minigame' || !minigameFish) return;

    const fish = minigameFish;
    const barRatio = fish.barRatio || 0.24;
    const barMax = 1.0 - barRatio;

    // 1. Player Bar Physics
    if (isReeling) {
      minigameBarVel += 3.4 * delta; // Upward pull
    } else {
      minigameBarVel -= 2.6 * delta; // Gravity pull
    }

    // Damping / Friction
    minigameBarVel *= Math.pow(0.86, delta * 60);
    // Clamp velocity
    minigameBarVel = Math.max(-1.8, Math.min(2.0, minigameBarVel));

    minigameBarY += minigameBarVel * delta;

    // Bounce off floor
    if (minigameBarY <= 0) {
      minigameBarY = 0;
      minigameBarVel = -minigameBarVel * 0.25;
    }
    // Bounce off ceiling
    if (minigameBarY >= barMax) {
      minigameBarY = barMax;
      minigameBarVel = -minigameBarVel * 0.25;
    }

    // 2. Fish AI Movement
    minigameFishMoveTimer -= delta;
    if (minigameFishMoveTimer <= 0) {
      if (fish.id === 'boot') {
        minigameFishTargetY = 0.05 + Math.random() * 0.2;
      } else {
        minigameFishTargetY = 0.08 + Math.random() * 0.84;
      }
      minigameFishMoveTimer = (0.5 + Math.random() * 1.5) / (fish.erratic || 0.5);
    }

    const dy = minigameFishTargetY - minigameFishY;
    const speed = (fish.fishSpeed || 1.0) * delta;
    if (Math.abs(dy) <= speed) {
      minigameFishY = minigameFishTargetY;
    } else {
      minigameFishY += Math.sign(dy) * speed;
    }

    // Wobble visual position
    const visualFishY = Math.max(0.02, Math.min(0.98, minigameFishY + Math.sin(now * 0.007) * 0.025));

    // 3. Overlap / Catch Zone Check
    const inZone = (visualFishY >= minigameBarY && visualFishY <= (minigameBarY + barRatio));

    minigameAudioTick += delta;
    if (inZone) {
      minigameProgress += (fish.fillRate || 28) * delta;
      if (minigameAudioTick >= 0.16) {
        minigameAudioTick = 0;
        playBeep(680 + (minigameProgress * 4), 'sine', 0.03);
      }
    } else {
      minigameProgress -= (fish.decayRate || 20) * delta;
      if (minigameAudioTick >= 0.22) {
        minigameAudioTick = 0;
        playBeep(210, 'sawtooth', 0.05);
      }
    }

    minigameProgress = Math.max(0, Math.min(100, minigameProgress));

    // 4. Update DOM Elements
    const barEl = document.getElementById('fishing-mg-bar');
    if (barEl) {
      barEl.style.bottom = (minigameBarY * 100) + '%';
      if (inZone) {
        barEl.classList.add('on-fish');
      } else {
        barEl.classList.remove('on-fish');
      }
    }

    const fishEl = document.getElementById('fishing-mg-fish');
    if (fishEl) {
      fishEl.style.bottom = (visualFishY * 100) + '%';
    }

    const progFill = document.getElementById('fishing-mg-progress-fill');
    if (progFill) progFill.style.height = minigameProgress + '%';
    const pctEl = document.getElementById('fishing-mg-pct');
    if (pctEl) pctEl.textContent = Math.round(minigameProgress) + '%';

    const tensionEl = document.getElementById('fishing-mg-tension');
    const tensionText = document.getElementById('fishing-mg-tension-text');
    if (tensionEl && tensionText) {
      if (inZone) {
        tensionEl.classList.remove('warning');
        tensionText.textContent = 'MAKARA SARIYOR (+)';
      } else {
        tensionEl.classList.add('warning');
        tensionText.textContent = 'DİKKAT! MİSİNA GERGİN (-)';
      }
    }

    // 5. Win / Lose Evaluation
    if (minigameProgress >= 100) {
      finishMinigameSuccess();
    } else if (minigameProgress <= 0) {
      finishMinigameFail();
    }
  }

  function finishMinigameSuccess() {
    if (fishingState !== 'minigame') return;

    const caughtFish = minigameFish;
    currentHookedFish = caughtFish;

    // 1. ÖNCE balık tutma kilidini (isFishing) kaldır ki oyuncu asla sıkışmasın!
    stopFishing();

    const mg = document.getElementById('fishing-minigame');
    if (mg) mg.classList.add('hidden');

    playVictoryJingle();
    try {
      showFishCatchModal(caughtFish);
    } catch (err) {
      console.warn('[Fishing] Modal gösterim hatası:', err);
    }

    // Award Primogems
    if (caughtFish && caughtFish.primo) {
      myPlayer.primogems += caughtFish.primo;
      updateUIProfile();
    }

    // Broadcast and sync with server
    if (socket && socket.readyState === WebSocket.OPEN && caughtFish) {
      socket.send(JSON.stringify({
        type: 'WORLD_FISH_CATCH',
        fish: caughtFish
      }));
    }

    if (myMesh && caughtFish) {
      showSpeechBubble(myMesh, `🎣 ${caughtFish.emoji} ${caughtFish.name}! (+${caughtFish.primo}💎)`);
    }
    if (caughtFish) {
      addChatMessage(myPlayer.username, `🎣 Nehir mücadelesini kazandım! ${caughtFish.emoji} ${caughtFish.name} tuttum (+${caughtFish.primo} Primogem)`);
    }
  }

  function finishMinigameFail() {
    if (fishingState !== 'minigame') return;

    const lostFish = minigameFish;
    const mg = document.getElementById('fishing-minigame');
    if (mg) mg.classList.add('hidden');

    // Snap sound
    playBeep(180, 'sawtooth', 0.28);

    if (myMesh) {
      showSpeechBubble(myMesh, '💨 Misina koptu! Balık kaçtı!');
    }
    addChatMessage('Sistem', `💨 ${lostFish ? lostFish.name : 'Balık'} misinayı kopardı ve suya geri kaçtı! Yeşil çubuğu balığın üzerinde tutmaya çalış.`);

    stopFishing();
  }

  function fishEscaped() {
    if (!isFishing) return;
    playBeep(260, 'sawtooth', 0.2);
    addChatMessage('Sistem', '💨 Balık yemi kaptı ve kaçtı! Bir dahaki sefere daha hızlı davran.');
    stopFishing();
  }

  function stopFishing(silent = false) {
    if (fishingTimer) clearTimeout(fishingTimer);
    if (biteTimeout) clearTimeout(biteTimeout);
    fishingTimer = null;
    biteTimeout = null;

    isFishing = false;
    fishingState = 'idle';
    isReeling = false;

    if (fishingRodMesh && myMesh?.userData?.rig?.rightArmGroup) {
      myMesh.userData.rig.rightArmGroup.remove(fishingRodMesh);
      fishingRodMesh = null;
    }
    if (fishingBobberMesh) {
      scene.remove(fishingBobberMesh);
      fishingBobberMesh = null;
    }

    const hud = document.getElementById('fishing-hud');
    if (hud) hud.classList.add('hidden');

    const mg = document.getElementById('fishing-minigame');
    if (mg) mg.classList.add('hidden');
  }

  function showFishCatchModal(fish) {
    const modal = document.getElementById('modal-fish-catch');
    if (!modal || !fish) return;

    const iconEl = document.getElementById('fish-catch-icon');
    if (iconEl) iconEl.textContent = fish.emoji || '🐟';
    const starsEl = document.getElementById('fish-catch-stars');
    if (starsEl) starsEl.textContent = fish.stars || '★★★☆☆';
    const nameEl = document.getElementById('fish-catch-name');
    if (nameEl) nameEl.textContent = fish.name || 'Balık';
    const rarityEl = document.getElementById('fish-catch-rarity');
    if (rarityEl) rarityEl.textContent = fish.rarity || '';
    const primoEl = document.getElementById('fish-catch-primo');
    if (primoEl) primoEl.textContent = `+${fish.primo || 0} 💎 Primogem`;
    const descEl = document.getElementById('fish-catch-desc');
    if (descEl) descEl.textContent = fish.desc || '';

    modal.classList.remove('hidden');
  }

  function playVictoryJingle() {
    const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    melody.forEach((note, idx) => {
      setTimeout(() => {
        playBeep(note, 'sine', 0.18);
      }, idx * 90);
    });
  }

  // --- 10. Minimap Render ---
  function renderMinimap() {
    const cvs = document.getElementById('minimap-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const w = cvs.width;
    const h = cvs.height;

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    const scale = currentMap === 'town' ? 1.2 : 3.2;
    const cx = w / 2;
    const cy = h / 2;

    if (currentMap === 'town') {
      // Grass background
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, 0, w, h);

      // River canal across z = 24
      const riverY = cy + (24 - myPlayer.z) * scale;
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, riverY - 4 * scale, w, 8 * scale);

      // Organic Cobblestone Avenues (4.8m width)
      ctx.fillStyle = '#57534e';
      // North Avenue (z: -25.5 to -7.0)
      ctx.fillRect(
        cx + (-2.4 - myPlayer.x) * scale,
        cy + (-25.5 - myPlayer.z) * scale,
        4.8 * scale,
        18.5 * scale
      );
      // South Avenue (z: 7.0 to 18.0)
      ctx.fillRect(
        cx + (-2.4 - myPlayer.x) * scale,
        cy + (7.0 - myPlayer.z) * scale,
        4.8 * scale,
        11.0 * scale
      );
      // West Avenue (x: -24.0 to -7.0)
      ctx.fillRect(
        cx + (-24.0 - myPlayer.x) * scale,
        cy + (-2.4 - myPlayer.z) * scale,
        17.0 * scale,
        4.8 * scale
      );
      // East Avenue (x: 7.0 to 24.0)
      ctx.fillRect(
        cx + (7.0 - myPlayer.x) * scale,
        cy + (-2.4 - myPlayer.z) * scale,
        17.0 * scale,
        4.8 * scale
      );

      // Central Plaza (radius 7.5m)
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 7.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Stone Bridge (x: -3.3 to 3.3, z: 18.0 to 30.0)
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(
        cx + (-3.3 - myPlayer.x) * scale,
        cy + (18.0 - myPlayer.z) * scale,
        6.6 * scale,
        12.0 * scale
      );

      // Central Landmark Fountain (radius 2.85m)
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 2.85 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Buildings
      ctx.fillStyle = '#eab308';
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale - 6, cy + (-14 - myPlayer.z) * scale - 6, 12, 12); // Blacksmith / Trade Mart
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx + (24 - myPlayer.x) * scale - 6, cy + (-14 - myPlayer.z) * scale - 6, 12, 12); // Tavern
      ctx.fillStyle = '#818cf8';
      ctx.fillRect(cx + (0 - myPlayer.x) * scale - 7, cy + (-34 - myPlayer.z) * scale - 7, 14, 14); // Gacha Cathedral
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale - 6, cy + (14 - myPlayer.z) * scale - 6, 12, 12); // Guild
      ctx.fillStyle = '#10b981';
      ctx.fillRect(cx + (16 - myPlayer.x) * scale - 5, cy + (19.8 - myPlayer.z) * scale - 5, 10, 10); // Watermill
      ctx.fillStyle = '#059669';
      ctx.fillRect(cx + (24 - myPlayer.x) * scale - 5, cy + (14 - myPlayer.z) * scale - 5, 10, 10); // Gazebo

      // South Portals Plaza at (0, 32)
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx + (-11 - myPlayer.x) * scale, cy + (27 - myPlayer.z) * scale, 22 * scale, 10 * scale);

      // Kadim Zindan Portalı at (-6.5, 32) (Indigo / Blue-Purple)
      ctx.fillStyle = '#818cf8';
      ctx.beginPath();
      ctx.arc(cx + (-6.5 - myPlayer.x) * scale, cy + (32 - myPlayer.z) * scale, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Gladiator PvP Portal in Town at (6.5, 32) (Amber with crimson border)
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx + (6.5 - myPlayer.x) * scale, cy + (32 - myPlayer.z) * scale, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (currentMap === 'pvp_arena') {
      ctx.fillStyle = '#0a0710';
      ctx.fillRect(0, 0, w, h);

      // Colosseum Outer Spectator Ring
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 34.0 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Sand Combat Pit (Terracotta)
      ctx.fillStyle = '#854d0e';
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 17.8 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Return Portal Gate Dot at (0, -28) (Purple)
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(cx + (0 - myPlayer.x) * scale, cy + (-28 - myPlayer.z) * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (isBattleZone(currentMap)) {
      ctx.fillStyle = currentMap === 'battle_zone_1' ? '#064e3b' : (currentMap === 'battle_zone_2' ? '#2d1212' : '#05050e');
      ctx.fillRect(0, 0, w, h);

      // Arena boundary ring
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 40 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // North Boss Dais
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(cx + (0 - myPlayer.x) * scale, cy + (14 - myPlayer.z) * scale, 9.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Return Portal Gate Dot (Purple)
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(cx + (0 - myPlayer.x) * scale, cy + (-32 - myPlayer.z) * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Mobs (Red for normal, Gold for Boss)
      for (let i = 0; i < activeCombatMobs.length; i++) {
        const mob = activeCombatMobs[i];
        if (mob.isDead) continue;
        const mx = cx + (mob.x - myPlayer.x) * scale;
        const my = cy + (mob.z - myPlayer.z) * scale;
        ctx.fillStyle = mob.isBoss ? '#f59e0b' : '#ef4444';
        ctx.beginPath();
        ctx.arc(mx, my, mob.isBoss ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Radar Circles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.stroke();

    // Other Players Dots (Cyan)
    ctx.fillStyle = '#38bdf8';
    for (const entry of otherPlayers.values()) {
      const px = cx + (entry.mesh.position.x - myPlayer.x) * scale;
      const py = cy + (entry.mesh.position.z - myPlayer.z) * scale;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // My Player Dot (Green pulse)
    ctx.fillStyle = '#53fc18';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 11. P2P Trade System UI & Actions ---
  function sendTradeRequest(targetUser) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: 'TRADE_REQUEST',
      targetUser: targetUser
    }));
    addChatMessage('Pazar', `🤝 @${targetUser} kullanıcısına takas teklifi gönderildi.`);
  }

  function showTradeInvite(senderName) {
    const popup = document.getElementById('trade-invite-popup');
    document.getElementById('invite-sender-name').textContent = `@${senderName}`;
    popup.classList.remove('hidden');

    document.getElementById('btn-accept-invite').onclick = () => {
      popup.classList.add('hidden');
      socket.send(JSON.stringify({
        type: 'TRADE_RESPOND',
        initiator: senderName,
        responder: myPlayer.username,
        accepted: true
      }));
    };

    document.getElementById('btn-decline-invite').onclick = () => {
      popup.classList.add('hidden');
      socket.send(JSON.stringify({
        type: 'TRADE_RESPOND',
        initiator: senderName,
        responder: myPlayer.username,
        accepted: false
      }));
    };
  }

  function openTradeModal(session) {
    activeTrade = session;
    fetchInventory();
    document.getElementById('modal-trade').classList.remove('hidden');
    document.getElementById('trade-session-id').textContent = session.id;
    updateTradeModal(session);
  }

  function updateTradeModal(session) {
    activeTrade = session;
    const isP1 = session.p1.toLowerCase() === myPlayer.username.toLowerCase();
    const myOffer = isP1 ? session.p1Offer : session.p2Offer;
    const partnerOffer = isP1 ? session.p2Offer : session.p1Offer;
    const partnerName = isP1 ? session.p2 : session.p1;

    document.getElementById('trade-my-name').textContent = `@${myPlayer.username} (Sen)`;
    document.getElementById('trade-partner-name').textContent = `@${partnerName}`;

    // Render My Slots
    const mySlots = document.getElementById('trade-my-slots');
    mySlots.innerHTML = '';
    myOffer.items.forEach((slot, idx) => {
      const card = document.createElement('div');
      card.className = `trade-slot-card rarity-${slot.item?.rarity || 4}`;
      card.innerHTML = `
        <img src="${slot.item?.icon || '/assets/characters/capitano.png'}" class="trade-slot-img">
        <div class="trade-slot-info">
          <span class="trade-slot-name">${slot.item?.name || 'Eşya'}</span>
          <span class="trade-slot-stars">${'⭐'.repeat(slot.item?.rarity || 4)}</span>
        </div>
        ${!myOffer.locked ? `<button class="btn-remove-slot" data-idx="${slot.index}">✕</button>` : ''}
      `;
      mySlots.appendChild(card);
    });

    // Remove item listener
    mySlots.querySelectorAll('.btn-remove-slot').forEach(btn => {
      btn.onclick = () => {
        const itemIdx = parseInt(btn.getAttribute('data-idx'), 10);
        const newItems = myOffer.items.filter(i => i.index !== itemIdx).map(i => i.index);
        socket.send(JSON.stringify({
          type: 'TRADE_UPDATE',
          tradeId: session.id,
          username: myPlayer.username,
          items: newItems,
          primogems: parseInt(document.getElementById('trade-my-primo').value, 10) || 0
        }));
      };
    });

    // Render Partner Slots
    const partnerSlots = document.getElementById('trade-partner-slots');
    partnerSlots.innerHTML = '';
    partnerOffer.items.forEach(slot => {
      const card = document.createElement('div');
      card.className = `trade-slot-card rarity-${slot.item?.rarity || 4}`;
      card.innerHTML = `
        <img src="${slot.item?.icon || '/assets/characters/capitano.png'}" class="trade-slot-img">
        <div class="trade-slot-info">
          <span class="trade-slot-name">${slot.item?.name || 'Eşya'}</span>
          <span class="trade-slot-stars">${'⭐'.repeat(slot.item?.rarity || 4)}</span>
        </div>
      `;
      partnerSlots.appendChild(card);
    });

    document.getElementById('trade-partner-primo').textContent = partnerOffer.primogems || 0;

    // Lock Badges
    const myLockBadge = document.getElementById('trade-my-lock-badge');
    if (myOffer.locked) {
      myLockBadge.textContent = '🔒 Kilitlendi';
      myLockBadge.classList.add('locked');
      document.getElementById('btn-lock-my-offer').textContent = '🔓 Kilidi Aç';
      document.getElementById('btn-lock-my-offer').classList.add('locked');
    } else {
      myLockBadge.textContent = 'Seçim Yapılıyor...';
      myLockBadge.classList.remove('locked');
      document.getElementById('btn-lock-my-offer').textContent = '🔒 Teklifimi Kilitle';
      document.getElementById('btn-lock-my-offer').classList.remove('locked');
    }

    const partnerLockBadge = document.getElementById('trade-partner-lock-badge');
    if (partnerOffer.locked) {
      partnerLockBadge.textContent = '🔒 Kilitlendi';
      partnerLockBadge.classList.add('locked');
    } else {
      partnerLockBadge.textContent = 'Seçim Yapılıyor...';
      partnerLockBadge.classList.remove('locked');
    }

    // Countdown / Final Confirm
    const countdownBox = document.getElementById('trade-countdown-box');
    const confirmBtn = document.getElementById('btn-confirm-final-trade');

    if (session.status === 'COUNTDOWN') {
      countdownBox.classList.remove('hidden');
      confirmBtn.classList.remove('hidden');
    } else {
      countdownBox.classList.add('hidden');
      confirmBtn.classList.add('hidden');
    }
  }

  async function fetchInventory() {
    try {
      const res = await fetch(`/api/world/inventory?user=${encodeURIComponent(myPlayer.username)}`);
      const data = await res.json();
      myInventory = data.inventory || [];
      myPlayer.primogems = data.primogems || myPlayer.primogems;
      updateUIProfile();
      renderInventoryDrawer();
    } catch (e) {}
  }

  function renderInventoryDrawer() {
    const grid = document.getElementById('drawer-items-grid');
    grid.innerHTML = '';

    myInventory.forEach(item => {
      const card = document.createElement('div');
      card.className = `drawer-item-card rarity-${item.rarity || 4}`;
      card.innerHTML = `
        <img src="${item.icon || '/assets/characters/capitano.png'}" style="width:36px; height:36px; border-radius:6px; object-fit:cover;">
        <div>
          <div style="font-size:0.75rem; font-weight:800;">${item.name}</div>
          <div style="font-size:0.65rem; color:#f59e0b;">${'⭐'.repeat(item.rarity)}</div>
        </div>
      `;
      card.onclick = () => {
        if (!activeTrade) return;
        const isP1 = activeTrade.p1.toLowerCase() === myPlayer.username.toLowerCase();
        const myOffer = isP1 ? activeTrade.p1Offer : activeTrade.p2Offer;
        const currentIndices = myOffer.items.map(i => i.index);
        if (!currentIndices.includes(item.index)) {
          currentIndices.push(item.index);
          socket.send(JSON.stringify({
            type: 'TRADE_UPDATE',
            tradeId: activeTrade.id,
            username: myPlayer.username,
            items: currentIndices,
            primogems: parseInt(document.getElementById('trade-my-primo').value, 10) || 0
          }));
        }
        document.getElementById('inventory-drawer').classList.add('hidden');
      };
      grid.appendChild(card);
    });
  }

  // --- Monster Material Shop (Tüccar Liben) ---
  async function openMonsterMarketModal() {
    await fetchInventory();
    renderMonsterMarket();
    document.getElementById('modal-monster-market')?.classList.remove('hidden');
  }

  function renderMonsterMarket() {
    const primoEl = document.getElementById('market-player-primo');
    if (primoEl) primoEl.textContent = `💎 ${myPlayer.primogems}`;

    const materials = myInventory.filter(it => it.type === 'material');
    const emptyState = document.getElementById('market-empty-state');
    const grid = document.getElementById('market-items-grid');
    const totalValEl = document.getElementById('market-total-value');
    const sellAllBtn = document.getElementById('btn-market-sell-all');

    if (materials.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (grid) grid.innerHTML = '';
      if (totalValEl) totalValEl.textContent = '0 💎';
      if (sellAllBtn) {
        sellAllBtn.disabled = true;
        sellAllBtn.textContent = '💰 Tümünü Sat';
      }
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (sellAllBtn) sellAllBtn.disabled = false;

    // Group materials by id or name
    const grouped = {};
    let grandTotal = 0;

    materials.forEach(mat => {
      const key = mat.id || mat.name;
      if (!grouped[key]) {
        grouped[key] = {
          id: mat.id,
          name: mat.name,
          rarity: mat.rarity || 1,
          sellPrice: mat.sellPrice || 3,
          icon: mat.icon || '/assets/materials/slime_condensate.svg',
          desc: mat.desc || mat.description || 'Canavarlardan düşen değerli simya materyali.',
          count: 0
        };
      }
      grouped[key].count++;
      grandTotal += (mat.sellPrice || 0);
    });

    if (totalValEl) totalValEl.textContent = `+${grandTotal} 💎`;
    if (sellAllBtn) sellAllBtn.textContent = `💰 Tümünü Sat (+${grandTotal} 💎)`;

    if (grid) {
      grid.innerHTML = '';
      Object.values(grouped).forEach(item => {
        const card = document.createElement('div');
        card.className = `market-item-card rarity-${item.rarity}`;
        const totalItemValue = item.count * item.sellPrice;
        card.innerHTML = `
          <div class="market-card-thumb">
            <img src="${item.icon}" alt="${item.name}">
          </div>
          <div class="market-card-info">
            <div class="market-card-header">
              <span class="market-card-name">${item.name}</span>
              <span class="market-card-qty">x${item.count}</span>
            </div>
            <div class="market-card-stars">${'⭐'.repeat(item.rarity)}</div>
            <div class="market-card-desc">${item.desc}</div>
            <div class="market-card-actions">
              <div class="market-card-price">💎 ${item.sellPrice} / adet <small style="color:#71717a;">(Top: ${totalItemValue}💎)</small></div>
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn-sell-single" data-item-id="${item.id}" data-qty="1">1 Sat</button>
                ${item.count > 1 ? `<button type="button" class="btn-sell-single" data-item-id="${item.id}" data-qty="${item.count}">Hepsi</button>` : ''}
              </div>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });

      // Bind sell buttons
      grid.querySelectorAll('.btn-sell-single').forEach(btn => {
        btn.onclick = async () => {
          const itemId = btn.getAttribute('data-item-id');
          const qty = parseInt(btn.getAttribute('data-qty'), 10) || 1;
          await sellMaterialItem(itemId, qty, false);
        };
      });
    }
  }

  async function sellMaterialItem(itemId, quantity, sellAll = false) {
    try {
      const res = await fetch('/api/world/sell-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: myPlayer.username,
          itemId: itemId,
          quantity: quantity,
          sellAll: sellAll
        })
      });
      const data = await res.json();
      if (data.success) {
        playPrimoChime();
        myPlayer.primogems = data.newTotalPrimo;
        updateUIProfile();
        await fetchInventory();
        renderMonsterMarket();
        addChatMessage('Tüccar Liben', `💰 "Harika ticaret dostum! ${data.soldCount} adet materyali aldım, hesabına +${data.earnedPrimo} 💎 Primogem aktardım!"`);
        showDamageNumber({ x: myPlayer.x, y: 2.0, z: myPlayer.z }, `+${data.earnedPrimo} 💎`, 'primo');
      } else {
        addChatMessage('Tüccar Liben', `❌ ${data.message || 'Satış işlemi gerçekleştirilemedi.'}`);
      }
    } catch (e) {
      console.error('[Market] Satış hatası:', e);
    }
  }

  // --- 🛡️ Party HUD Rendering & Realtime HP Bar Sync ---
  function updatePartyHUD(party) {
    const hud = document.getElementById('party-hud');
    if (!hud) return;

    if (!party || !Array.isArray(party.members) || party.members.length === 0) {
      hud.classList.add('hidden');
      return;
    }

    hud.classList.remove('hidden');
    const countEl = document.getElementById('party-count-num');
    if (countEl) countEl.textContent = party.members.length;

    const listEl = document.getElementById('party-hud-members');
    if (!listEl) return;
    listEl.innerHTML = '';

    for (const m of party.members) {
      const isLeader = m.isLeader || m.id === party.leaderId;
      const isMe = m.id === (myPlayer.id || socketId);
      const curHp = typeof m.hp === 'number' ? m.hp : 100;
      const maxHp = typeof m.maxHp === 'number' ? m.maxHp : 100;
      const hpPct = Math.min(100, Math.max(0, Math.round((curHp / maxHp) * 100)));

      const row = document.createElement('div');
      row.className = `party-member-row ${isLeader ? 'is-leader' : ''}`;
      row.setAttribute('data-member-id', m.id);

      row.innerHTML = `
        <div class="party-member-avatar-box">
          ${isLeader ? '<span class="party-member-crown">👑</span>' : ''}
          <canvas width="28" height="28" class="party-av-canvas"></canvas>
        </div>
        <div class="party-member-info">
          <div class="party-member-name-row">
            <span class="party-member-name" title="${m.username}">${isMe ? 'Sen' : '@' + m.username}</span>
            <span class="party-member-gs">${m.gearScore ? m.gearScore + ' GS' : '0 GS'}</span>
          </div>
          <div class="party-member-hp-bar">
            <div class="party-member-hp-fill ${hpPct < 25 ? 'danger' : ''}" style="width: ${hpPct}%;"></div>
          </div>
        </div>
      `;
      listEl.appendChild(row);

      const cvs = row.querySelector('.party-av-canvas');
      if (cvs && typeof drawAvatarPreviewPortrait === 'function') {
        const avIdx = Math.abs(parseInt(m.avatarIndex, 10) || 0) % AVATAR_PRESETS.length;
        drawAvatarPreviewPortrait(cvs, AVATAR_PRESETS[avIdx]);
      }
    }
  }

  function updatePartyMemberHpUI(memberId, hp, maxHp) {
    if (!myParty || !Array.isArray(myParty.members)) return;
    const mem = myParty.members.find(m => m.id === memberId);
    if (mem) {
      mem.hp = hp;
      mem.maxHp = maxHp;
    }
    const row = document.querySelector(`.party-member-row[data-member-id="${memberId}"]`);
    if (row) {
      const fill = row.querySelector('.party-member-hp-fill');
      if (fill) {
        const pct = Math.min(100, Math.max(0, Math.round((hp / (maxHp || 100)) * 100)));
        fill.style.width = pct + '%';
        if (pct < 25) fill.classList.add('danger');
        else fill.classList.remove('danger');
      }
    }
  }

  // --- 12. UI Updates & Modal Helpers ---
  function updateUIProfile() {
    document.getElementById('ui-username').textContent = myPlayer.username;
    document.getElementById('ui-primogems').textContent = myPlayer.primogems;
    const badge = document.getElementById('ui-badge');
    if (myPlayer.isGuest) {
      badge.textContent = 'Misafir';
      badge.className = 'badge-guest';
    } else {
      badge.textContent = '⚡ Kick';
      badge.className = 'badge-kick';
    }

    // Avatar preview in ring
    const previewCvs = document.getElementById('ui-avatar-preview');
    if (previewCvs) {
      drawAvatarPreviewPortrait(previewCvs, AVATAR_PRESETS[myPlayer.avatarIndex % AVATAR_PRESETS.length]);
    }

    // MMORPG GearScore Pill in Top Bar
    const gsVal = document.getElementById('ui-gs-value');
    if (gsVal) {
      const gs = (myRpgProfile && myRpgProfile.stats && myRpgProfile.stats.gearScore) || 0;
      gsVal.textContent = gs;
    }

    // Sync effective RPG stats to Combat HUD
    const effectiveStats = getPlayerEffectiveStats();
    playerMaxHP = effectiveStats.hp;
    if (playerHP > playerMaxHP || playerHP === 500) {
      playerHP = playerMaxHP;
    }
    updateCombatHUD();
  }

  function addChatMessage(user, text) {
    const box = document.getElementById('chat-messages');
    if (!box) return;

    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `<span class="chat-user">@${user}:</span> <span class="chat-text">${escapeHtml(text)}</span>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function buildAvatarSelector() {
    const grid = document.getElementById('avatar-grid-select');
    if (!grid) return;
    grid.innerHTML = '';

    AVATAR_PRESETS.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.className = `avatar-choice-btn ${myPlayer.avatarIndex === idx ? 'selected' : ''}`;
      
      const avCanvas = document.createElement('canvas');
      avCanvas.width = 56;
      avCanvas.height = 56;
      avCanvas.className = 'avatar-choice-canvas';
      drawAvatarPreviewPortrait(avCanvas, p);

      btn.appendChild(avCanvas);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'avatar-choice-name';
      nameSpan.textContent = p.name;
      btn.appendChild(nameSpan);

      if (idx === 0 || idx === 1) {
        const tagSpan = document.createElement('span');
        tagSpan.style.cssText = 'font-size: 0.65rem; color: #38bdf8; background: rgba(56,189,248,0.18); padding: 2px 7px; border-radius: 8px; margin-top: 3px; font-weight: 700;';
        tagSpan.textContent = idx === 0 ? 'Varsayılan (Erkek)' : 'Varsayılan (Karı)';
        btn.appendChild(tagSpan);
      }

      btn.onclick = () => {
        myPlayer.avatarIndex = idx;
        try { localStorage.setItem('mylune_avatar_index', idx.toString()); } catch (e) {}
        updateMyMesh();
        updateUIProfile();
        closeModal('modal-avatar');
        buildAvatarSelector();
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'WORLD_JOIN',
            username: myPlayer.username,
            avatarIndex: myPlayer.avatarIndex,
            isGuest: myPlayer.isGuest
          }));
        }
      };
      grid.appendChild(btn);
    });
  }

  // =========================================================================
  // --- 12. Battle Zone & Punchy ARPG Combat System ---
  // =========================================================================

  function createBattlePortalGate(x, z, labelText = '⚔️ Savaş Arenası') {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, 0, z);

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const portalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });

    // Base stone platform
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.45, 16), stoneMat);
    base.position.y = 0.22;
    base.receiveShadow = true;
    gateGroup.add(base);

    // Outer arcane ring
    const runeRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 16), runeMat);
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.y = 0.46;
    gateGroup.add(runeRing);

    // Twin ancient obsidian pillars
    [-2.2, 2.2].forEach(px => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.85, 5.2, 0.85), stoneMat);
      col.position.set(px, 2.7, 0);
      col.castShadow = true;
      gateGroup.add(col);

      const runeBand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), runeMat);
      runeBand.position.set(px, 3.2, 0);
      gateGroup.add(runeBand);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), stoneMat);
      cap.position.set(px, 5.4, 0);
      gateGroup.add(cap);
    });

    // Top lintel / arch
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.85, 1.0), stoneMat);
    lintel.position.set(0, 5.4, 0);
    lintel.castShadow = true;
    gateGroup.add(lintel);

    // Arcane crest octahedron
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), runeMat);
    crest.position.set(0, 6.3, 0);
    gateGroup.add(crest);

    // Glowing portal membrane
    const membrane = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4.4), portalGlowMat);
    membrane.position.set(0, 2.8, 0);
    membrane.name = 'portalMembrane';
    gateGroup.add(membrane);

    // PointLight aura
    const pLight = new THREE.PointLight(0xa855f7, 1.3, 10, 1.8);
    pLight.position.set(0, 2.8, 0);
    gateGroup.add(pLight);

    return gateGroup;
  }

  function createPvPArenaPortalGate(x, z, labelText = '⚔️ Gladyatör Arenası') {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, 0, z);

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x292524 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.8 });
    const bannerMat = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const portalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });

    // Base stone platform (elevated 0.22)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.1, 0.45, 16), stoneMat);
    base.position.y = 0.22;
    base.receiveShadow = true;
    gateGroup.add(base);

    // Golden Roman Arena Ring
    const brassRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 16), brassMat);
    brassRing.rotation.x = -Math.PI / 2;
    brassRing.position.y = 0.46;
    gateGroup.add(brassRing);

    // Twin dark stone columns with brass caps and crimson banners
    [-2.2, 2.2].forEach(px => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.85, 5.2, 0.85), stoneMat);
      col.position.set(px, 2.7, 0);
      col.castShadow = true;
      gateGroup.add(col);

      const brassBand = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.35, 0.92), brassMat);
      brassBand.position.set(px, 3.2, 0);
      gateGroup.add(brassBand);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), brassMat);
      cap.position.set(px, 5.4, 0);
      gateGroup.add(cap);

      // Hanging Crimson Gladiator Banner
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), bannerMat);
      banner.position.set(px, 2.8, 0.45);
      gateGroup.add(banner);
    });

    // Top lintel / arch
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.85, 1.0), stoneMat);
    lintel.position.set(0, 5.4, 0);
    lintel.castShadow = true;
    gateGroup.add(lintel);

    // Golden Crossed Swords Crest at Apex
    const sword1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.1), brassMat);
    sword1.rotation.z = Math.PI / 4;
    sword1.position.set(0, 6.35, 0.1);
    gateGroup.add(sword1);

    const sword2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.1), brassMat);
    sword2.rotation.z = -Math.PI / 4;
    sword2.position.set(0, 6.35, 0.1);
    gateGroup.add(sword2);

    const shieldCrest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 8), brassMat);
    shieldCrest.rotation.x = Math.PI / 2;
    shieldCrest.position.set(0, 6.35, 0.2);
    gateGroup.add(shieldCrest);

    // Glowing amber-crimson portal membrane
    const membrane = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4.4), portalGlowMat);
    membrane.position.set(0, 2.8, 0);
    membrane.name = 'pvpPortalMembrane';
    gateGroup.add(membrane);

    // Warm Fire Aura PointLight
    const pLight = new THREE.PointLight(0xf59e0b, 1.6, 12, 1.8);
    pLight.position.set(0, 2.8, 0);
    gateGroup.add(pLight);

    return gateGroup;
  }

  function attachCombatWeapon() {
    if (!myMesh || !myMesh.userData || !myMesh.userData.rig) return;
    const rig = myMesh.userData.rig;
    if (rig.weaponHolder) {
      rig.weaponHolder.scale.set(1.25, 1.25, 1.25);
      if (rig.weaponMat) {
        const compCfg = getCompanionConfig(myCompanion);
        const elemCol = compCfg && compCfg.color ? compCfg.color : 0x38bdf8;
        rig.weaponMat.emissive.setHex(elemCol);
        rig.weaponMat.emissiveIntensity = 0.65;
      }
      combatWeaponMesh = rig.weaponHolder;
    }
  }

  function detachCombatWeapon() {
    if (myMesh && myMesh.userData && myMesh.userData.rig && myMesh.userData.rig.weaponHolder) {
      myMesh.userData.rig.weaponHolder.scale.set(1.0, 1.0, 1.0);
      if (myMesh.userData.rig.weaponMat) {
        myMesh.userData.rig.weaponMat.emissiveIntensity = 0.3;
      }
    }
    combatWeaponMesh = null;
  }

  // =========================================================================
  // Tiny RPG 2.5D Animated Pixel-Art Sprite Mob System (Orc & Soldier Pack)
  // =========================================================================
  const MOB_SPRITE_DEFS = {
    orc: {
      idle: { url: '/assets/mobs/orc/Orc_Idle.png', frames: 6, fps: 8 },
      walk: { url: '/assets/mobs/orc/Orc_Walk.png', frames: 8, fps: 11 },
      attack1: { url: '/assets/mobs/orc/Orc_Attack01.png', frames: 6, fps: 10 },
      attack2: { url: '/assets/mobs/orc/Orc_Attack02.png', frames: 6, fps: 10 },
      hurt: { url: '/assets/mobs/orc/Orc_Hurt.png', frames: 4, fps: 12 },
      death: { url: '/assets/mobs/orc/Orc_Death.png', frames: 4, fps: 8 }
    },
    soldier: {
      idle: { url: '/assets/mobs/soldier/Soldier_Idle.png', frames: 6, fps: 8 },
      walk: { url: '/assets/mobs/soldier/Soldier_Walk.png', frames: 8, fps: 11 },
      attack1: { url: '/assets/mobs/soldier/Soldier_Attack01.png', frames: 6, fps: 10 },
      attack2: { url: '/assets/mobs/soldier/Soldier_Attack02.png', frames: 6, fps: 10 },
      attack3: { url: '/assets/mobs/soldier/Soldier_Attack03.png', frames: 9, fps: 12 },
      hurt: { url: '/assets/mobs/soldier/Soldier_Hurt.png', frames: 4, fps: 12 },
      death: { url: '/assets/mobs/soldier/Soldier_Death.png', frames: 4, fps: 8 }
    }
  };

  const mobBaseTextureCache = {};
  const mobTextureSubscribers = {};

  function getMobBaseTexture(url) {
    if (!mobBaseTextureCache[url]) {
      mobTextureSubscribers[url] = [];
      const tex = textureLoader.load(url, (loaded) => {
        loaded.magFilter = THREE.NearestFilter;
        loaded.minFilter = THREE.NearestFilter;
        loaded.needsUpdate = true;
        const subs = mobTextureSubscribers[url] || [];
        for (let i = 0; i < subs.length; i++) {
          const item = subs[i];
          if (item && item.cloneTex) {
            item.cloneTex.image = loaded.image;
            item.cloneTex.needsUpdate = true;
            if (item.material) item.material.needsUpdate = true;
          }
        }
        mobTextureSubscribers[url] = [];
      });
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      mobBaseTextureCache[url] = tex;
    }
    return mobBaseTextureCache[url];
  }

  function createMobTextureClone(url, frames, matRef) {
    const baseTex = getMobBaseTexture(url);
    const cloneTex = baseTex.clone();
    cloneTex.magFilter = THREE.NearestFilter;
    cloneTex.minFilter = THREE.NearestFilter;
    cloneTex.repeat.set(1 / frames, 1);
    cloneTex.offset.set(0, 0);
    if (baseTex.image) {
      cloneTex.image = baseTex.image;
      cloneTex.needsUpdate = true;
      if (matRef) matRef.needsUpdate = true;
    } else {
      if (!mobTextureSubscribers[url]) mobTextureSubscribers[url] = [];
      mobTextureSubscribers[url].push({ cloneTex, material: matRef });
    }
    return cloneTex;
  }

  // Preload mob idle textures in background
  try {
    ['/assets/mobs/orc/Orc_Idle.png', '/assets/mobs/soldier/Soldier_Idle.png'].forEach(url => getMobBaseTexture(url));
  } catch (err) {}

  function createAnimatedSpriteMobMesh(spriteType = 'orc', options = {}) {
    const group = new THREE.Group();
    const defs = MOB_SPRITE_DEFS[spriteType] || MOB_SPRITE_DEFS.orc;

    // Ground circular shadow
    const shadowGeo = new THREE.CircleGeometry(0.55, 16);
    shadowGeo.scale(1.0, 0.65, 1.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    group.add(shadowMesh);

    // Prepare cloned textures for each animation state
    const animTextures = {};
    for (const [animKey, cfg] of Object.entries(defs)) {
      const cloneTex = createMobTextureClone(cfg.url, cfg.frames);
      animTextures[animKey] = {
        texture: cloneTex,
        frames: cfg.frames,
        fps: cfg.fps || 10
      };
    }

    // Sprite Quad Mesh (Proportioned to grounded mob dimensions)
    const isSoldier = spriteType === 'soldier';
    const planeGeo = new THREE.PlaneGeometry(7.5, 7.5);
    const translateY = isSoldier ? 0.75 : 0.52;
    planeGeo.translate(0, translateY, 0);

    const initialAnim = animTextures.idle || Object.values(animTextures)[0];
    const spriteMat = new THREE.MeshStandardMaterial({
      map: initialAnim.texture,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    if (options.tint) {
      spriteMat.color.setHex(options.tint);
    }

    // Link material to idle texture loader so it displays immediately once downloaded
    const idleDef = defs.idle || Object.values(defs)[0];
    if (idleDef) {
      const idleBase = getMobBaseTexture(idleDef.url);
      if (idleBase.image) {
        spriteMat.needsUpdate = true;
      } else {
        if (!mobTextureSubscribers[idleDef.url]) mobTextureSubscribers[idleDef.url] = [];
        mobTextureSubscribers[idleDef.url].push({ cloneTex: initialAnim.texture, material: spriteMat });
      }
    }

    const spriteMesh = new THREE.Mesh(planeGeo, spriteMat);
    spriteMesh.castShadow = false;
    group.add(spriteMesh);

    // Elite / Boss glowing ground rune ring
    if (options.aura || options.isElite || options.isBoss) {
      const auraColor = options.aura || (options.isBoss ? 0xa855f7 : 0xf59e0b);
      const auraRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.35, 32),
        new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      auraRing.rotation.x = -Math.PI / 2;
      auraRing.position.y = 0.03;
      group.add(auraRing);
    }

    const scaleMult = options.scale || 1.0;
    if (scaleMult !== 1.0) {
      group.scale.set(scaleMult, scaleMult, scaleMult);
    }

    group.userData.mobRig = {
      type: 'sprite',
      spriteType,
      mesh: spriteMesh,
      material: spriteMat,
      animTextures,
      currentAnim: 'idle',
      frameIndex: 0,
      frameTimer: 0,
      facingLeft: false,
      baseScaleX: 1.0,
      baseTorsoY: 1.2
    };

    return group;
  }

  // --- 3D Rigged & Cel-Shaded Mob Meshes ---
  function createSlimeMesh(type) {
    const group = new THREE.Group();
    const isPyro = type === 'slime_pyro';
    const isElectro = type === 'slime_electro';
    let mainColor = 0x22c55e;
    let coreColor = 0x86efac;
    if (isPyro) {
      mainColor = 0xef4444;
      coreColor = 0xf59e0b;
    } else if (isElectro) {
      mainColor = 0xa855f7;
      coreColor = 0xe9d5ff;
    }

    const bodyPivot = new THREE.Group();
    group.add(bodyPivot);

    // Translucent Jelly Dome with Toon Outline
    const bodyGeo = new THREE.SphereGeometry(0.75, 16, 14);
    bodyGeo.scale(1.15, 0.85, 1.15);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      emissive: mainColor,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.86,
      roughness: 0.18,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    addAnimeOutline(body, 1.045, 0x090d16);
    bodyPivot.add(body);

    // Inner Glowing Core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 10, 10),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );
    core.position.y = 0.65;
    bodyPivot.add(core);

    // Cute Anime Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const eyeHighlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.22, 0.22].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), eyeMat);
      eye.position.set(ex, 0.72, 0.72);
      bodyPivot.add(eye);

      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 6), eyeHighlight);
      hl.position.set(ex + 0.02, 0.75, 0.79);
      bodyPivot.add(hl);
    });

    if (isPyro) {
      [-0.26, 0.26].forEach(hx => {
        const horn = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.42, 6),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b })
        );
        horn.position.set(hx, 1.28, 0);
        horn.rotation.z = hx > 0 ? -0.25 : 0.25;
        bodyPivot.add(horn);
      });
    } else if (isElectro) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.20),
        new THREE.MeshBasicMaterial({ color: 0xf0abfc })
      );
      spark.position.set(0, 1.42, 0);
      bodyPivot.add(spark);
    }

    // Contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    group.userData.mobRig = {
      type: 'slime',
      torso: bodyPivot,
      core,
      walkCycle: Math.random() * Math.PI * 2
    };

    return group;
  }

  function createHilichurlMesh(type = 'hilichurl') {
    const group = new THREE.Group();
    const isElite = type === 'mitachurl_axe';
    const isSentinel = type === 'abyss_sentinel';
    const isWarrior = type === 'hilichurl_warrior';
    const isRecruit = type === 'hilichurl_recruit';

    const furMat = createStylizedMaterial(
      isSentinel ? 0x0f172a : (isElite ? 0x450a0a : (isWarrior ? 0x1e293b : (isRecruit ? 0x475569 : 0x334155)))
    );
    const maneMat = createStylizedMaterial(
      isSentinel ? 0x312e81 : (isElite ? 0x991b1b : 0x78350f)
    );
    const maskMat = createStylizedMaterial(
      isSentinel ? 0x1e1b4b : (isElite ? 0xb91c1c : (isWarrior ? 0xe2e8f0 : 0xf8fafc))
    );
    const hornMat = createStylizedMaterial(
      isSentinel ? 0x6366f1 : (isElite ? 0xf59e0b : 0x1e293b)
    );
    const redMat = new THREE.MeshBasicMaterial({
      color: isSentinel ? 0xc084fc : (isElite ? 0xfacc15 : 0xef4444)
    });

    // Articulated Torso Group
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.0, 0);
    group.add(torsoGroup);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.96, 0.58), furMat);
    torso.castShadow = true;
    addAnimeOutline(torso, 1.05, 0x090d16);
    torsoGroup.add(torso);

    // Fur Neck Mane
    const mane = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), maneMat);
    mane.scale.set(1.15, 0.55, 1.05);
    mane.position.set(0, 0.46, -0.04);
    torsoGroup.add(mane);

    // Articulated Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.72, 0.04);
    torsoGroup.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), furMat);
    head.castShadow = true;
    addAnimeOutline(head, 1.05, 0x090d16);
    headGroup.add(head);

    // Tribal Mask
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.66, 0.14), maskMat);
    mask.position.set(0, 0, 0.35);
    headGroup.add(mask);

    // Glowing Tribal Pattern on Mask
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.06), redMat);
    mark.position.set(0, 0.10, 0.41);
    headGroup.add(mark);

    // Curved Horns
    [-0.34, 0.34].forEach((hx, idx) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(isElite ? 0.15 : 0.1, isElite ? 0.72 : 0.46, 6), hornMat);
      horn.position.set(hx, isElite ? 0.58 : 0.45, 0.06);
      horn.rotation.z = idx === 0 ? 0.35 : -0.35;
      headGroup.add(horn);
    });

    // Articulated Left Arm (Shoulder Pivot)
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.60, 0.36, 0);
    const lArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.78, 0.28), furMat);
    lArmMesh.position.set(0, -0.34, 0);
    addAnimeOutline(lArmMesh, 1.05, 0x090d16);
    leftArm.add(lArmMesh);
    torsoGroup.add(leftArm);

    // Articulated Right Arm + Weapon (Shoulder Pivot)
    const rightArm = new THREE.Group();
    rightArm.position.set(0.60, 0.36, 0);
    const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.78, 0.28), furMat);
    rArmMesh.position.set(0, -0.34, 0);
    addAnimeOutline(rArmMesh, 1.05, 0x090d16);
    rightArm.add(rArmMesh);
    rightArm.rotation.x = -0.45;

    if (isElite) {
      // Massive Mitachurl Blazing Double Battleaxe attached to rightArm
      const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.2, 6), createStylizedMaterial(0x27272a));
      axeHandle.position.set(0.06, -0.55, 0.55);
      axeHandle.rotation.x = Math.PI / 2.4;
      rightArm.add(axeHandle);

      [-0.28, 0.28].forEach(bx => {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.48, 0.78, 0.07),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xf97316, emissiveIntensity: 0.45, metalness: 0.75 })
        );
        blade.position.set(0.06 + bx, -0.35, 1.15);
        blade.castShadow = true;
        rightArm.add(blade);
      });
    } else if (isSentinel) {
      // Abyssal Runic Halberd attached to rightArm
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), createStylizedMaterial(0x1e1b4b));
      spear.position.set(0.06, -0.45, 0.55);
      spear.rotation.x = Math.PI / 2.5;
      rightArm.add(spear);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.58, 4), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
      tip.position.set(0.06, -0.1, 1.55);
      tip.rotation.x = Math.PI / 2.5;
      rightArm.add(tip);
    } else {
      // Spiked Wooden Club attached to rightArm
      const clubWoodMat = createStylizedMaterial(0x78350f);
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 1.25, 6), clubWoodMat);
      club.position.set(0.05, -0.52, 0.45);
      club.rotation.x = Math.PI / 2.3;
      club.castShadow = true;
      rightArm.add(club);
    }

    torsoGroup.add(rightArm);

    // Articulated Legs (Hip Pivots)
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.24, 0.55, 0);
    const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.55, 0.30), furMat);
    lLegMesh.position.set(0, -0.27, 0);
    leftLeg.add(lLegMesh);
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.24, 0.55, 0);
    const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.55, 0.30), furMat);
    rLegMesh.position.set(0, -0.27, 0);
    rightLeg.add(rLegMesh);
    group.add(rightLeg);

    // Contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    if (isElite) group.scale.set(1.42, 1.42, 1.42);
    else if (isSentinel) group.scale.set(1.22, 1.22, 1.22);
    else if (isRecruit) group.scale.set(0.88, 0.88, 0.88);

    group.userData.mobRig = {
      type: 'humanoid',
      torso: torsoGroup,
      head: headGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      baseTorsoY: 1.0,
      walkCycle: Math.random() * Math.PI * 2
    };

    return group;
  }

  function createPyromancerMesh(type = 'pyromancer') {
    const group = new THREE.Group();
    const isAbyssMage = type === 'abyss_mage';
    const robeMat = createStylizedMaterial(isAbyssMage ? 0x1e1b4b : 0x881337);
    const goldMat = new THREE.MeshStandardMaterial({ color: isAbyssMage ? 0x818cf8 : 0xf59e0b, metalness: 0.8, roughness: 0.3 });
    const fireMat = new THREE.MeshBasicMaterial({ color: isAbyssMage ? 0xa855f7 : 0xf97316 });

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.15;
    group.add(bodyGroup);

    // Floating Robe Body
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.88, 1.4, 10), robeMat);
    robe.position.y = 1.0;
    robe.castShadow = true;
    addAnimeOutline(robe, 1.05, 0x090d16);
    bodyGroup.add(robe);

    // Gold hem trim
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 14), goldMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.35;
    bodyGroup.add(trim);

    // Deep Hood
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.82;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.54, 12, 10), robeMat);
    addAnimeOutline(hood, 1.05, 0x090d16);
    headGroup.add(hood);

    const eyeMat = new THREE.MeshBasicMaterial({ color: isAbyssMage ? 0xc084fc : 0xfacc15 });
    [-0.15, 0.15].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), eyeMat);
      eye.position.set(ex, 0, 0.45);
      headGroup.add(eye);
    });
    bodyGroup.add(headGroup);

    // Articulated Staff Arm
    const rightArm = new THREE.Group();
    rightArm.position.set(0.68, 1.25, 0.2);
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6),
      createStylizedMaterial(0x1e293b)
    );
    rightArm.add(staff);

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), fireMat);
    crystal.position.set(0, 0.95, 0);
    rightArm.add(crystal);

    const cLight = new THREE.PointLight(isAbyssMage ? 0x9333ea : 0xf97316, 0.9, 8, 2);
    cLight.position.set(0, 0.95, 0);
    rightArm.add(cLight);
    bodyGroup.add(rightArm);

    if (isAbyssMage) group.scale.set(1.15, 1.15, 1.15);

    group.userData.mobRig = {
      type: 'caster',
      torso: bodyGroup,
      head: headGroup,
      rightArm,
      crystal,
      baseTorsoY: 0.15,
      walkCycle: Math.random() * Math.PI * 2
    };

    return group;
  }

  function createRuinGolemMesh() {
    const group = new THREE.Group();
    const stoneMat = createStylizedMaterial(0x334155);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.78 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    group.scale.set(1.9, 1.9, 1.9);

    const torsoGroup = new THREE.Group();
    torsoGroup.position.y = 1.6;
    group.add(torsoGroup);

    // Main Torso (Heavy Stone Block)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2), stoneMat);
    torso.castShadow = true;
    addAnimeOutline(torso, 1.045, 0x090d16);
    torsoGroup.add(torso);

    // Brass armor plates
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.15), brassMat);
    chestPlate.position.set(0, 0.1, 0.62);
    torsoGroup.add(chestPlate);

    // Glowing Cyclops Eye Core
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 14), eyeMat);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(0, 0.1, 0.68);
    torsoGroup.add(eye);

    const eyeLight = new THREE.PointLight(0xf59e0b, 1.5, 9, 2);
    eyeLight.position.set(0, 0.1, 0.85);
    torsoGroup.add(eyeLight);

    // Articulated Left & Right Golem Arms
    const leftArm = new THREE.Group();
    leftArm.position.set(-1.05, 0.5, 0);
    const lShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), brassMat);
    leftArm.add(lShoulder);
    const lFist = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), stoneMat);
    lFist.position.set(0, -0.9, 0.15);
    addAnimeOutline(lFist, 1.045, 0x090d16);
    leftArm.add(lFist);
    torsoGroup.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(1.05, 0.5, 0);
    const rShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), brassMat);
    rightArm.add(rShoulder);
    const rFist = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), stoneMat);
    rFist.position.set(0, -0.9, 0.15);
    addAnimeOutline(rFist, 1.045, 0x090d16);
    rightArm.add(rFist);
    torsoGroup.add(rightArm);

    // Articulated Heavy Pillar Legs
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.5, 0.9, 0);
    const lLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.7), stoneMat);
    lLegMesh.position.set(0, -0.45, 0);
    leftLeg.add(lLegMesh);
    group.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.5, 0.9, 0);
    const rLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.7), stoneMat);
    rLegMesh.position.set(0, -0.45, 0);
    rightLeg.add(rLegMesh);
    group.add(rightLeg);

    group.userData.mobRig = {
      type: 'golem',
      torso: torsoGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      eye,
      baseTorsoY: 1.6,
      walkCycle: 0
    };

    return group;
  }

  function animateMobRig(mob, isMoving, delta, now) {
    if (!mob || !mob.mesh || !mob.mesh.userData || !mob.mesh.userData.mobRig) return;
    const rig = mob.mesh.userData.mobRig;

    if (rig.type === 'sprite') {
      let desiredAnim = 'idle';
      if (mob.isDead) {
        desiredAnim = 'death';
      } else if (mob.flashTimer > 0 || (mob.staggeredUntil && now < mob.staggeredUntil)) {
        desiredAnim = 'hurt';
      } else if (mob.isAttacking) {
        desiredAnim = (rig.spriteType === 'soldier' && Math.random() < 0.35) ? 'attack2' : 'attack1';
        if (!rig.animTextures[desiredAnim]) desiredAnim = 'attack1';
      } else if (isMoving) {
        desiredAnim = 'walk';
      }

      if (rig.currentAnim !== desiredAnim) {
        rig.currentAnim = desiredAnim;
        rig.frameIndex = 0;
        rig.frameTimer = 0;
        const animCfg = rig.animTextures[desiredAnim];
        if (animCfg) {
          rig.material.map = animCfg.texture;
          rig.material.needsUpdate = true;
        }
      }

      const curCfg = rig.animTextures[rig.currentAnim];
      if (curCfg) {
        rig.frameTimer += delta;
        const frameDuration = 1 / curCfg.fps;
        if (rig.frameTimer >= frameDuration) {
          rig.frameTimer -= frameDuration;
          if (rig.currentAnim === 'death') {
            rig.frameIndex = Math.min(curCfg.frames - 1, rig.frameIndex + 1);
          } else {
            rig.frameIndex = (rig.frameIndex + 1) % curCfg.frames;
          }
          curCfg.texture.offset.x = rig.frameIndex / curCfg.frames;
        }
      }

      // Upright Billboard Alignment for pixel mobs
      alignUprightBillboard(rig.mesh);

      const dx = myPlayer.x - mob.x;
      const shouldFaceLeft = dx < 0;
      rig.mesh.scale.x = shouldFaceLeft ? -1 : 1;

      return;
    }

    // Staggered / Frozen Override
    if (mob.staggeredUntil && now < mob.staggeredUntil) {
      if (rig.torso) {
        rig.torso.rotation.x = 0.45;
        rig.torso.position.y = (rig.baseTorsoY || 1.0) - 0.22;
      }
      if (rig.leftArm) rig.leftArm.rotation.x = 0.4;
      if (rig.rightArm) rig.rightArm.rotation.x = 0.4;
      return;
    }

    if (rig.type === 'slime') {
      const pulse = Math.sin(now * 0.008 + rig.walkCycle);
      const sq = isMoving ? 0.16 : 0.06;
      rig.torso.scale.set(1 + pulse * sq, 1 - pulse * sq, 1 + pulse * sq);
      return;
    }

    if (rig.type === 'crystal') {
      rig.torso.position.y = rig.baseTorsoY + Math.sin(now * 0.004 + rig.walkCycle) * 0.22;
      rig.torso.rotation.y += delta * 1.4;
      if (rig.crystal) rig.crystal.rotation.z += delta * 2.5;
      return;
    }

    if (rig.type === 'caster') {
      const hover = Math.sin(now * 0.004 + rig.walkCycle) * 0.18;
      rig.torso.position.y = rig.baseTorsoY + hover;
      if (rig.crystal) rig.crystal.rotation.y += delta * 3.5;
      if (mob.isAttacking && rig.rightArm) {
        rig.rightArm.rotation.x = -0.85 + Math.sin(now * 0.018) * 0.35;
      } else if (rig.rightArm) {
        rig.rightArm.rotation.x += (0 - rig.rightArm.rotation.x) * 0.15;
      }
      return;
    }

    // Humanoid / Golem Articulated Walk & Attack Windup
    if (mob.isAttacking) {
      const atkPulse = Math.sin(now * 0.014);
      if (rig.torso) rig.torso.rotation.x = atkPulse * 0.28;
      if (rig.rightArm) rig.rightArm.rotation.x = -1.75 + atkPulse * 1.1;
      if (rig.leftArm) rig.leftArm.rotation.x = -0.9 + atkPulse * 0.6;
    } else if (isMoving) {
      rig.walkCycle += delta * (rig.type === 'golem' ? 5.5 : 9.5);
      const s = Math.sin(rig.walkCycle);
      if (rig.leftLeg) rig.leftLeg.rotation.x = s * 0.65;
      if (rig.rightLeg) rig.rightLeg.rotation.x = -s * 0.65;
      if (rig.leftArm) rig.leftArm.rotation.x = -s * 0.5;
      if (rig.rightArm) rig.rightArm.rotation.x = -0.45 + s * 0.5;
      if (rig.torso) {
        rig.torso.position.y = rig.baseTorsoY + Math.abs(s) * 0.06;
        rig.torso.rotation.x = 0.08;
      }
    } else {
      const breath = Math.sin(now * 0.003 + rig.walkCycle) * 0.025;
      if (rig.torso) {
        rig.torso.position.y = rig.baseTorsoY + breath;
        rig.torso.rotation.x += (0 - rig.torso.rotation.x) * 0.2;
      }
      if (rig.leftLeg) rig.leftLeg.rotation.x += (0 - rig.leftLeg.rotation.x) * 0.2;
      if (rig.rightLeg) rig.rightLeg.rotation.x += (0 - rig.rightLeg.rotation.x) * 0.2;
      if (rig.leftArm) rig.leftArm.rotation.x += (0 - rig.leftArm.rotation.x) * 0.2;
      if (rig.rightArm) rig.rightArm.rotation.x += (-0.4 - rig.rightArm.rotation.x) * 0.2;
    }
  }

  // Monster Loot Materials & Drop System
  const MONSTER_MATERIALS = {
    slime_condensate: {
      id: 'slime_condensate',
      name: 'Balçık Sıvısı',
      rarity: 1,
      sellPrice: 3,
      type: 'material',
      icon: '/assets/materials/slime_condensate.svg',
      desc: 'Balçıklardan sızan temel yapışkan sıvı. Tüccar Liben simya için kullanıyor.'
    },
    slime_secretions: {
      id: 'slime_secretions',
      name: 'Balçık Salgısı',
      rarity: 2,
      sellPrice: 8,
      type: 'material',
      icon: '/assets/materials/slime_secretions.svg',
      desc: 'Daha yoğun ve arıtılmış balçık salgısı.'
    },
    slime_concentrate: {
      id: 'slime_concentrate',
      name: 'Balçık Konsantresi',
      rarity: 3,
      sellPrice: 20,
      type: 'material',
      icon: '/assets/materials/slime_concentrate.svg',
      desc: 'Yüksek enerjili saf elemental balçık çekirdeği.'
    },
    damaged_mask: {
      id: 'damaged_mask',
      name: 'Hasarlı Maske',
      rarity: 1,
      sellPrice: 4,
      type: 'material',
      icon: '/assets/materials/damaged_mask.svg',
      desc: 'Kabile savaşçısının taktığı tahta maske parçası.'
    },
    stained_mask: {
      id: 'stained_mask',
      name: 'Lekeli Maske',
      rarity: 2,
      sellPrice: 10,
      type: 'material',
      icon: '/assets/materials/stained_mask.svg',
      desc: 'Savaş yaralarıyla dolu kemik maske.'
    },
    ominous_mask: {
      id: 'ominous_mask',
      name: 'Uğursuz Maske',
      rarity: 3,
      sellPrice: 25,
      type: 'material',
      icon: '/assets/materials/ominous_mask.svg',
      desc: 'Karanlık bir lanetle parıldayan kadim savaşçı maskesi.'
    },
    dead_ley_branch: {
      id: 'dead_ley_branch',
      name: 'Kuru Leyline Dalı',
      rarity: 2,
      sellPrice: 12,
      type: 'material',
      icon: '/assets/materials/dead_ley_branch.svg',
      desc: 'Toprağın derinliklerindeki leylinelardan koparılmış kuru dal.'
    },
    ley_leaves: {
      id: 'ley_leaves',
      name: 'Parlayan Leyline Yaprağı',
      rarity: 3,
      sellPrice: 30,
      type: 'material',
      icon: '/assets/materials/ley_leaves.svg',
      desc: 'Elemental enerjiyle hafifçe parıldayan sihirli yaprak.'
    },
    abyss_scroll: {
      id: 'abyss_scroll',
      name: 'Uçurum Ateş Parşömeni',
      rarity: 4,
      sellPrice: 65,
      type: 'material',
      icon: '/assets/materials/abyss_scroll.svg',
      desc: 'Uçurum büyücülerinin gizli alev büyülerini içeren kadim parşömen.'
    },
    chaos_device: {
      id: 'chaos_device',
      name: 'Kaos Aygıtı',
      rarity: 3,
      sellPrice: 35,
      type: 'material',
      icon: '/assets/materials/chaos_device.svg',
      desc: 'Antik otomatın hareket etmesini sağlayan dişli mekanizma parçası.'
    },
    chaos_circuit: {
      id: 'chaos_circuit',
      name: 'Kaos Devresi',
      rarity: 4,
      sellPrice: 75,
      type: 'material',
      icon: '/assets/materials/chaos_circuit.svg',
      desc: 'Kayıp medeniyetlerin inşa ettiği karmaşık enerji devresi.'
    },
    chaos_core: {
      id: 'chaos_core',
      name: 'Kadim Kaos Çekirdeği',
      rarity: 5,
      sellPrice: 160,
      type: 'material',
      icon: '/assets/materials/chaos_core.svg',
      desc: 'Yıkım Muhafızının göğsündeki kalıcı enerji kaynağı (Tam 1 Dilek Değerinde!).'
    }
  };

  function rollMobLoot(mobType) {
    const drops = [];
    const roll = Math.random();

    if (mobType.startsWith('slime_')) {
      if (roll < 0.06) {
        drops.push(MONSTER_MATERIALS.slime_concentrate);
      } else if (roll < 0.32) {
        drops.push(MONSTER_MATERIALS.slime_secretions);
      } else {
        drops.push(MONSTER_MATERIALS.slime_condensate);
      }
    } else if (mobType.startsWith('hilichurl') || mobType === 'mitachurl_axe') {
      const isElite = mobType === 'mitachurl_axe';
      if (roll < (isElite ? 0.35 : 0.08)) {
        drops.push(MONSTER_MATERIALS.ominous_mask);
      } else if (roll < (isElite ? 0.75 : 0.35)) {
        drops.push(MONSTER_MATERIALS.stained_mask);
      } else {
        drops.push(MONSTER_MATERIALS.damaged_mask);
      }
      if (isElite) drops.push(MONSTER_MATERIALS.stained_mask); // Bonus drop for mini-boss
    } else if (mobType === 'pyromancer' || mobType === 'abyss_mage' || mobType === 'abyss_sentinel') {
      if (roll < 0.18) {
        drops.push(MONSTER_MATERIALS.abyss_scroll);
      } else if (roll < 0.5) {
        drops.push(MONSTER_MATERIALS.ley_leaves);
      } else {
        drops.push(MONSTER_MATERIALS.dead_ley_branch);
      }
    } else if (mobType === 'ruin_golem') {
      // Boss drops 2 items!
      if (Math.random() < 0.4) {
        drops.push(MONSTER_MATERIALS.chaos_circuit);
      } else {
        drops.push(MONSTER_MATERIALS.chaos_device);
      }

      if (Math.random() < 0.18) {
        drops.push(MONSTER_MATERIALS.chaos_core); // 5★ Jackpot!
      } else {
        drops.push(MONSTER_MATERIALS.chaos_device);
      }
    } else {
      drops.push(MONSTER_MATERIALS.slime_condensate);
    }

    return drops;
  }

  const RARITY_COLORS = {
    1: { main: 0x94a3b8, emissive: 0x475569 },
    2: { main: 0x22c55e, emissive: 0x15803d },
    3: { main: 0x38bdf8, emissive: 0x0284c7 },
    4: { main: 0xc084fc, emissive: 0x7e22ce },
    5: { main: 0xf59e0b, emissive: 0xb45309 }
  };

  function createLootOrbMesh(rarity = 1) {
    const orbGroup = new THREE.Group();
    const col = RARITY_COLORS[rarity] || RARITY_COLORS[1];

    // Glowing Faceted Material Core
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: col.main,
      emissive: col.emissive,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.7
    });
    const core = new THREE.Mesh(geo, mat);
    orbGroup.add(core);

    // Orbital Ring
    const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: col.main });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    orbGroup.add(ring);

    return orbGroup;
  }

  // Pre-allocated geometries and materials for 4-stage slash arcs + heavy slam (Zero GC stutter!)
  const SLASH_GEOS = {
    1: new THREE.RingGeometry(1.1, 3.0, 16, 1, -Math.PI * 0.42, Math.PI * 0.84),
    2: new THREE.RingGeometry(1.1, 3.1, 16, 1, -Math.PI * 0.42, Math.PI * 0.84),
    3: new THREE.RingGeometry(1.4, 4.3, 22, 1, -Math.PI * 0.95, Math.PI * 1.90),
    4: new THREE.RingGeometry(0.6, 4.6, 26, 1, 0, Math.PI * 2)
  };
  const SLASH_MATS = {
    1: new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
    2: new THREE.MeshBasicMaterial({ color: 0x67e8f9, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
    3: new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    4: new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide, transparent: true, opacity: 0.94 })
  };

  function createSlashArcMesh(px, pz, rot, step, customColor = null) {
    // Keep max 3 active trails at once
    while (activeSlashTrails.length >= 3) {
      const old = activeSlashTrails.shift();
      worldObjects.remove(old.mesh);
    }

    const geo = SLASH_GEOS[step] || SLASH_GEOS[1];
    const baseMat = SLASH_MATS[step] || SLASH_MATS[1];
    const mat = baseMat.clone();
    if (customColor !== null) {
      mat.color.setHex(customColor);
    }
    const arcMesh = new THREE.Mesh(geo, mat);
    arcMesh.rotation.x = -Math.PI / 2;
    if (step === 1) arcMesh.rotation.y = 0.22;
    else if (step === 2) arcMesh.rotation.y = -0.22;
    arcMesh.position.set(px, step === 4 ? 0.18 : 0.95, pz);
    arcMesh.rotation.z = -rot + Math.PI / 2;

    worldObjects.add(arcMesh);
    activeSlashTrails.push({
      mesh: arcMesh,
      mat: mat,
      birthTime: performance.now(),
      life: step >= 3 ? 190 : 140
    });
  }

  function createAfterimageGhost(x, z, rot) {
    const geo = new THREE.PlaneGeometry(5.22, 4.35);
    geo.translate(0, 0.98, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    if (myMesh && myMesh.userData && myMesh.userData.rig && myMesh.userData.rig.material && myMesh.userData.rig.material.map) {
      mat.map = myMesh.userData.rig.material.map;
    }
    const ghost = new THREE.Mesh(geo, mat);
    ghost.position.set(x, 0, z);
    if (camera) ghost.quaternion.copy(camera.quaternion);
    worldObjects.add(ghost);

    const fadeStart = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - fadeStart;
      if (elapsed > 200) {
        clearInterval(interval);
        worldObjects.remove(ghost);
      } else {
        mat.opacity = 0.6 * (1 - elapsed / 200);
      }
    }, 25);
  }

  function createVortexMesh(x, y, z, customColor = 0x10b981) {
    if (vortexMesh) worldObjects.remove(vortexMesh);

    const vGroup = new THREE.Group();
    vGroup.position.set(x, 0.08, z);

    // 1. 3D Swirling Tornado Funnel Cones (Open-ended inverted wind funnels)
    for (let f = 0; f < 3; f++) {
      const funnelGeo = new THREE.CylinderGeometry(1.1 + f * 0.85, 0.25 + f * 0.2, 2.6 + f * 0.5, 18, 1, true);
      const funnelMat = new THREE.MeshBasicMaterial({
        color: f === 0 ? 0xa7f3d0 : customColor,
        transparent: true,
        opacity: 0.42 - f * 0.1,
        side: THREE.DoubleSide,
        wireframe: f === 1
      });
      const funnel = new THREE.Mesh(funnelGeo, funnelMat);
      funnel.position.y = 1.3 + f * 0.2;
      funnel.rotation.y = f * 1.1;
      vGroup.add(funnel);
    }

    // 2. Concentric swirling ground & aerial wind rings
    for (let r = 0; r < 4; r++) {
      const ringGeo = new THREE.RingGeometry(0.9 + r * 1.35, 1.35 + r * 1.35, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: r % 2 === 0 ? customColor : 0x6ee7b7,
        transparent: true,
        opacity: 0.75 - r * 0.14,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2 + (r % 2 === 0 ? 0.12 : -0.12);
      ring.position.y = 0.12 + r * 0.45;
      vGroup.add(ring);
    }

    // 3. Orbiting 3D Wind Blades / Shards
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2;
      const rad = 1.6 + (b % 3) * 1.1;
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshBasicMaterial({ color: 0xd1fae5 })
      );
      shard.position.set(Math.cos(a) * rad, 0.5 + (b % 4) * 0.55, Math.sin(a) * rad);
      shard.scale.set(0.5, 1.8, 0.5);
      vGroup.add(shard);
    }

    const vLight = new THREE.PointLight(customColor, 1.8, 12, 2);
    vLight.position.y = 1.4;
    vGroup.add(vLight);

    worldObjects.add(vGroup);
    vortexMesh = vGroup;
  }

  function createMeteorImpact(x, z, customColor = 0xfacc15) {
    const impactGroup = new THREE.Group();
    impactGroup.position.set(x, 0.06, z);
    worldObjects.add(impactGroup);

    // 1. Primary & Secondary Expanding Shockwave Rings
    const ringGeo = new THREE.RingGeometry(0.6, 2.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: customColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const shockwave = new THREE.Mesh(ringGeo, ringMat);
    shockwave.rotation.x = -Math.PI / 2;
    impactGroup.add(shockwave);

    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const innerWave = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.1, 24), innerRingMat);
    innerWave.rotation.x = -Math.PI / 2;
    innerWave.position.y = 0.04;
    impactGroup.add(innerWave);

    // 2. Vertical Energy Pillar Flash
    const pillarMat = new THREE.MeshBasicMaterial({
      color: customColor,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 9.5, 16, 1, true), pillarMat);
    pillar.position.y = 4.75;
    impactGroup.add(pillar);

    // 3. 8 Erupting 3D Crystal/Tectonic Spires around Crater Rim
    const spires = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const dist = 2.2 + (i % 2) * 0.8;
      const spireMat = new THREE.MeshStandardMaterial({
        color: customColor,
        emissive: customColor,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.7
      });
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.2, 5), spireMat);
      spire.position.set(Math.cos(ang) * dist, 0.1, Math.sin(ang) * dist);
      spire.rotation.z = -Math.cos(ang) * 0.38;
      spire.rotation.x = Math.sin(ang) * 0.38;
      impactGroup.add(spire);
      spires.push(spire);
    }

    const startTime = performance.now();
    const anim = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed > 620) {
        worldObjects.remove(impactGroup);
      } else {
        const p = elapsed / 620;
        const scale = 1.0 + p * 7.5;
        shockwave.scale.set(scale, scale, 1);
        innerWave.scale.set(scale * 0.65, scale * 0.65, 1);
        ringMat.opacity = 0.95 * (1 - p);
        innerRingMat.opacity = 0.9 * (1 - p);
        pillar.scale.set(1 + p * 1.4, 1, 1 + p * 1.4);
        pillarMat.opacity = 0.75 * Math.max(0, 1 - p * 1.5);
        const spireH = p < 0.25 ? (p / 0.25) : Math.max(0, 1 - (p - 0.25) / 0.75);
        for (const sp of spires) {
          sp.scale.y = Math.max(0.05, spireH);
          sp.position.y = spireH * 0.9;
        }
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  function createMobHPBar(mob) {
    const barGroup = new THREE.Group();
    const width = mob.isBoss ? 2.8 : 1.5;
    const height = mob.isBoss ? 0.28 : 0.16;

    // Background
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: 0x090d16, side: THREE.DoubleSide })
    );
    barGroup.add(bg);

    // Fill
    const fillMat = new THREE.MeshBasicMaterial({
      color: mob.isBoss ? 0xf59e0b : (mob.type === 'slime_pyro' ? 0xf97316 : 0xef4444),
      side: THREE.DoubleSide
    });
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.95, height * 0.78),
      fillMat
    );
    fill.position.z = 0.01;
    barGroup.add(fill);

    // Elemental Aura Crystal Badge next to HP bar
    const auraMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const auraMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), auraMat);
    auraMesh.position.set(width * 0.58, 0, 0.02);
    auraMesh.visible = !!mob.elementalAura;
    barGroup.add(auraMesh);

    barGroup.position.y = mob.height + 0.35;
    mob.mesh.add(barGroup);
    mob.hpBarGroup = barGroup;
    mob.hpFillMesh = fill;
    mob.hpFillBaseWidth = width * 0.95;
    mob.auraMesh = auraMesh;
  }

  // Mob Templates - Scaled for True MMORPG Gear Check Progression
  const MOB_TEMPLATES = {
    // Zone 1: Zümrüt Çayırları (Slime Vadisi) [GS 100]
    slime_green: { name: 'Zümrüt Balçık', hp: 320, speed: 2.2, dmg: 24, height: 1.1, aggroRange: 16, attackRange: 1.4 },
    slime_electro: { name: 'Yıldırım Balçığı', hp: 420, speed: 2.5, dmg: 32, height: 1.2, aggroRange: 16, attackRange: 1.4 },
    hilichurl_recruit: { name: 'Çırak Hilichurl', hp: 580, speed: 2.6, dmg: 38, height: 1.7, aggroRange: 18, attackRange: 1.9 },

    // Zone 2: Kızıl Hilichurl Harabeleri [GS 350]
    slime_pyro: { name: 'Ateş Balçığı', hp: 950, speed: 2.6, dmg: 65, height: 1.2, aggroRange: 16, attackRange: 1.4 },
    hilichurl_warrior: { name: 'Zırhlı Hilichurl Savaşçısı', hp: 1650, speed: 2.7, dmg: 92, height: 1.9, aggroRange: 18, attackRange: 2.0 },
    pyromancer: { name: 'Kızıl Pyro Büyücüsü', hp: 1350, speed: 1.9, dmg: 105, height: 2.0, aggroRange: 22, attackRange: 7.5, isRanged: true },
    mitachurl_axe: { name: 'Alev Baltalı Mitachurl (ELİT)', hp: 4800, speed: 2.2, dmg: 165, height: 2.6, aggroRange: 22, attackRange: 2.6, isElite: true },

    // Zone 3: Kadim Uçurum Arenası [GS 750]
    abyss_sentinel: { name: 'Uçurum Muhafızı', hp: 3800, speed: 2.8, dmg: 180, height: 2.2, aggroRange: 22, attackRange: 2.2 },
    abyss_mage: { name: 'Kadim Hiçlik Büyücüsü', hp: 3200, speed: 2.0, dmg: 210, height: 2.1, aggroRange: 24, attackRange: 8.5, isRanged: true },
    ruin_golem: { name: 'Antik Yıkım Muhafızı (DÜNYA BOSSU)', hp: 28000, speed: 1.4, dmg: 360, height: 3.4, aggroRange: 28, attackRange: 3.4, isBoss: true },

    // Aion 2 Instance Dungeon Mobs & Bosses
    aether_crystal: { name: '🔮 Aether Mühür Kristali', hp: 1200, speed: 0, dmg: 0, height: 2.4, aggroRange: 0, attackRange: 0, isCrystal: true },
    resonance_crystal: { name: '🔮 Rezonans Kalkan Kristali', hp: 950, speed: 0, dmg: 0, height: 2.2, aggroRange: 0, attackRange: 0, isCrystal: true, isResonanceCrystal: true },
    aether_guardian: { name: 'Aether Tapınak Muhafızı', hp: 1800, speed: 2.7, dmg: 85, height: 2.1, aggroRange: 22, attackRange: 2.1 },
    abyss_archon_mini: { name: '⚔️ Kapı Muhafızı Archon (MİNİ-BOSS)', hp: 8500, speed: 2.4, dmg: 195, height: 2.8, aggroRange: 24, attackRange: 2.8, isElite: true },
    tahabata_lord: { name: '👑 Tahabata: Aether Hükümdarı (ZİNDAN BOSSU)', hp: 38000, speed: 1.7, dmg: 320, height: 3.6, aggroRange: 30, attackRange: 3.5, isBoss: true }
  };

  function createAetherCrystalMesh(isResonance = false) {
    const group = new THREE.Group();
    const mainCol = isResonance ? 0xd946ef : 0x38bdf8;
    const coreCol = isResonance ? 0xf5d0fe : 0xe0f2fe;

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.35, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.7 })
    );
    base.position.y = 0.2;
    group.add(base);

    const runeRing = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.45, 16),
      new THREE.MeshBasicMaterial({ color: mainCol, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.y = 0.05;
    group.add(runeRing);

    const crystalPivot = new THREE.Group();
    crystalPivot.position.y = 1.45;
    group.add(crystalPivot);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.75, 0),
      new THREE.MeshStandardMaterial({
        color: mainCol,
        emissive: mainCol,
        emissiveIntensity: 0.65,
        roughness: 0.15,
        metalness: 0.85
      })
    );
    crystal.scale.set(0.85, 1.65, 0.85);
    addAnimeOutline(crystal, 1.05, 0x090d16);
    crystalPivot.add(crystal);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: coreCol })
    );
    halo.rotation.x = Math.PI / 3;
    crystalPivot.add(halo);

    const cLight = new THREE.PointLight(mainCol, 1.6, 10, 2);
    crystalPivot.add(cLight);

    group.userData.mobRig = {
      type: 'crystal',
      torso: crystalPivot,
      crystal: halo,
      baseTorsoY: 1.45,
      walkCycle: Math.random() * Math.PI * 2
    };
    return group;
  }

  function spawnCombatMob(type, x, z, customScale = null) {
    const cfg = MOB_TEMPLATES[type] || MOB_TEMPLATES.slime_green;
    let mesh;
    if (type === 'aether_crystal' || type === 'resonance_crystal') {
      mesh = createAetherCrystalMesh(type === 'resonance_crystal');
    } else if (type.startsWith('slime_')) {
      mesh = createSlimeMesh(type);
    } else if (type === 'pyromancer' || type === 'abyss_mage') {
      mesh = createAnimatedSpriteMobMesh('soldier', { tint: 0xfca5a5, scale: 1.15, aura: 0xf97316 });
    } else if (type === 'ruin_golem' || type === 'tahabata_lord') {
      mesh = createRuinGolemMesh();
      if (type === 'tahabata_lord') {
        mesh.scale.set(2.15, 2.15, 2.15);
      }
    } else if (type === 'abyss_archon_mini') {
      mesh = createAnimatedSpriteMobMesh('soldier', { isBoss: true, scale: 1.6, aura: 0xa855f7 });
    } else if (type === 'aether_guardian' || type === 'abyss_sentinel') {
      mesh = createAnimatedSpriteMobMesh('soldier', { scale: 1.25 });
    } else if (type === 'mitachurl_axe') {
      mesh = createAnimatedSpriteMobMesh('orc', { isElite: true, scale: 1.55, aura: 0xef4444 });
    } else {
      mesh = createAnimatedSpriteMobMesh('orc');
    }

    mesh.position.set(x, 0, z);
    worldObjects.add(mesh);

    const hpScale = customScale && customScale.hpMult ? customScale.hpMult : 1.0;
    const dmgScale = customScale && customScale.dmgMult ? customScale.dmgMult : 1.0;
    const scaledHp = (customScale && typeof customScale.hp === 'number')
      ? customScale.hp
      : Math.max(10, Math.round(cfg.hp * hpScale));
    const scaledMaxHp = (customScale && typeof customScale.maxHP === 'number')
      ? customScale.maxHP
      : scaledHp;
    const scaledDmg = Math.round(cfg.dmg * dmgScale);

    const maxPoise = cfg.isBoss ? 120 : (cfg.isElite ? 65 : (cfg.isCrystal ? 9999 : 30));
    const innateAura = type === 'slime_pyro'
      ? { element: 'Pyro', expiresAt: Infinity }
      : (type === 'slime_electro' ? { element: 'Electro', expiresAt: Infinity } : null);

    const mob = {
      id: (customScale && customScale.customId) ? customScale.customId : ('mob_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      type: type,
      name: (customScale && customScale.customName) || cfg.name,
      hp: scaledHp,
      maxHP: scaledMaxHp,
      poise: maxPoise,
      maxPoise: maxPoise,
      staggeredUntil: 0,
      elementalAura: innateAura,
      speed: cfg.speed,
      dmg: scaledDmg,
      dropPrimo: cfg.dropPrimo,
      height: cfg.height,
      aggroRange: cfg.aggroRange,
      attackRange: cfg.attackRange,
      isRanged: !!cfg.isRanged,
      isElite: !!cfg.isElite,
      isBoss: !!cfg.isBoss,
      isCrystal: !!cfg.isCrystal,
      isResonanceCrystal: !!cfg.isResonanceCrystal,
      dungeonStage: (customScale && customScale.dungeonStage) || 0,
      x: x,
      y: 0,
      z: z,
      rot: 0,
      mesh: mesh,
      flashTimer: 0,
      knockbackVx: 0,
      knockbackVz: 0,
      attackCooldown: 1.0 + Math.random(),
      animTime: Math.random() * 10,
      isDead: false
    };

    createMobHPBar(mob);
    activeCombatMobs.push(mob);
    return mob;
  }

  let pendingDungeonMobs = null;

  function notifyDungeonMobHit(mob, dmg, isCrit = false, element = null) {
    if (!mob || mob.isDead) return;
    if (isDungeonMap(currentMap) && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'DUNGEON_MOB_HIT',
        instanceId: currentMap,
        mobId: mob.id,
        dmg: Math.max(1, Math.round(dmg)),
        isCrit: Boolean(isCrit),
        element: element || null
      }));
    }
  }

  function spawnServerSyncedMob(sm) {
    return spawnCombatMob(sm.type, sm.x, sm.z, {
      customId: sm.id,
      hp: sm.hp,
      maxHP: sm.maxHP || sm.hp,
      dungeonStage: sm.stage
    });
  }

  function spawnInitialMobs(zoneId = currentMap) {
    activeCombatMobs = [];

    if (zoneId === 'battle_zone_1') {
      // Zone 1: Slimes & Recruits (Req GS 100)
      spawnCombatMob('slime_green', -9, 4);
      spawnCombatMob('slime_green', 9, 6);
      spawnCombatMob('slime_green', -4, 12);
      spawnCombatMob('slime_electro', -12, 14);
      spawnCombatMob('slime_electro', 11, 15);

      spawnCombatMob('hilichurl_recruit', -14, -4);
      spawnCombatMob('hilichurl_recruit', 14, -2);
      spawnCombatMob('hilichurl_recruit', 0, 6);
      spawnCombatMob('hilichurl_recruit', 0, 14);

    } else if (zoneId === 'battle_zone_2') {
      // Zone 2: Warriors, Pyromancers, Mitachurl Axe Elite (Req GS 350)
      spawnCombatMob('slime_pyro', -10, 8);
      spawnCombatMob('slime_pyro', 10, 8);

      spawnCombatMob('hilichurl_warrior', -14, -4);
      spawnCombatMob('hilichurl_warrior', 14, -2);
      spawnCombatMob('hilichurl_warrior', 0, 4);

      spawnCombatMob('pyromancer', -11, 16);
      spawnCombatMob('pyromancer', 11, 16);

      // Elite Mitachurl Axe Mini-Boss
      spawnCombatMob('mitachurl_axe', 0, 14);

    } else {
      // Zone 3: Abyssal Sentinels, Void Mages & Ruin Golem Boss (Req GS 750)
      spawnCombatMob('abyss_sentinel', -14, -4);
      spawnCombatMob('abyss_sentinel', 14, -2);
      spawnCombatMob('abyss_sentinel', 0, 4);

      spawnCombatMob('abyss_mage', -12, 16);
      spawnCombatMob('abyss_mage', 12, 16);

      // World Boss
      spawnCombatMob('ruin_golem', 0, 14);
    }
  }

  // Floating Damage Numbers (Capped DOM pool to prevent layout reflow freezes)
  function showDamageNumber(worldPos, text, type = 'normal') {
    const layer = document.getElementById('damage-numbers-layer');
    if (!layer || !camera) return;

    // Keep DOM clean: max 12 elements
    if (layer.children.length > 12) {
      layer.removeChild(layer.children[0]);
    }

    const wp = new THREE.Vector3(worldPos.x, worldPos.y || 1.2, worldPos.z);
    wp.project(camera);

    if (wp.z > 1.0) return; // Behind camera

    const screenX = (wp.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(wp.y * 0.5) + 0.5) * window.innerHeight;

    const el = document.createElement('div');
    el.className = `damage-num ${type}`;
    el.textContent = text;
    el.style.left = `${screenX + (Math.random() - 0.5) * 16}px`;
    el.style.top = `${screenY + (Math.random() - 0.5) * 12}px`;

    layer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 700);
  }

  // Combat Web Audio SFX (Reuses shared audio context)
  function playSlashSound(step) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step === 3 ? 'sawtooth' : 'triangle';
      const startFreq = step === 3 ? 900 : (step === 2 ? 750 : 600);
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch (e) {}
  }

  function playPunchyHitSound(isCrit = false) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isCrit ? 150 : 120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(isCrit ? 0.18 : 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch (e) {}
  }

  function playDashSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    } catch (e) {}
  }

  function playVortexSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {}
  }

  function playBurstExplosion() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.46);
    } catch (e) {}
  }

  function playPrimoChime() {
    const notes = [659.25, 880.00, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playBeep(freq, 'sine', 0.12);
      }, idx * 60);
    });
  }

  // --- Companion Web Audio Elemental Synthesizers ---
  function playThunderSound(isHeavy = false) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(isHeavy ? 1200 : 850, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + (isHeavy ? 0.35 : 0.18));
      gain1.gain.setValueAtTime(isHeavy ? 0.28 : 0.18, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isHeavy ? 0.35 : 0.18));
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + (isHeavy ? 0.36 : 0.19));

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(isHeavy ? 75 : 95, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + (isHeavy ? 0.55 : 0.3));
      gain2.gain.setValueAtTime(isHeavy ? 0.35 : 0.2, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isHeavy ? 0.55 : 0.3));
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + (isHeavy ? 0.56 : 0.31));
    } catch (e) {}
  }

  function playMeteorImpactSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 0.65);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.66);
    } catch (e) {}
  }

  function playFlameBurstSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(640, ctx.currentTime + 0.1);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {}
  }

  function playHydroSplashSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    } catch (e) {}
  }

  function playAnemoGustSound() {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.18);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.41);
    } catch (e) {}
  }

  // --- Cinematic Elemental Screen Flash Overlay ---
  function triggerElementalFlash(flashClass) {
    const overlay = document.getElementById('elemental-flash-overlay');
    if (!overlay) return;
    overlay.className = `elemental-flash-overlay ${flashClass}`;
    setTimeout(() => {
      overlay.className = 'elemental-flash-overlay';
    }, 280);
  }

  // --- 3D Chibi Companion Mesh Creator ---
  function createCompanionChibiMesh(charName, element = 'Electro') {
    const group = new THREE.Group();
    group.name = `companion_${charName}`;

    // Color palettes by character
    let hairColor = 0x6b21a8;
    let robeColor = 0x7c3aed;
    let accentColor = 0xfacc15;
    let lightColor = 0xc084fc;

    if (charName.toLowerCase().includes('zhongli')) {
      hairColor = 0x27170e;
      robeColor = 0x3d271d;
      accentColor = 0xf59e0b;
      lightColor = 0xf59e0b;
    } else if (charName.toLowerCase().includes('hu tao')) {
      hairColor = 0x3e1d13;
      robeColor = 0x18181b;
      accentColor = 0xef4444;
      lightColor = 0xef4444;
    } else if (charName.toLowerCase().includes('furina')) {
      hairColor = 0xe0f2fe;
      robeColor = 0x1d4ed8;
      accentColor = 0x38bdf8;
      lightColor = 0x38bdf8;
    } else if (charName.toLowerCase().includes('kazuha')) {
      hairColor = 0xf1f5f9;
      robeColor = 0x0f172a;
      accentColor = 0xef4444;
      lightColor = 0x34d399;
    } else {
      // Element Fallbacks
      if (element === 'Geo') { hairColor = 0x78350f; robeColor = 0xb45309; accentColor = 0xfacc15; lightColor = 0xfacc15; }
      else if (element === 'Pyro') { hairColor = 0x7f1d1d; robeColor = 0xb91c1c; accentColor = 0xf97316; lightColor = 0xef4444; }
      else if (element === 'Hydro') { hairColor = 0x075985; robeColor = 0x0284c7; accentColor = 0x38bdf8; lightColor = 0x38bdf8; }
      else if (element === 'Anemo') { hairColor = 0x064e3b; robeColor = 0x059669; accentColor = 0x34d399; lightColor = 0x34d399; }
      else if (element === 'Cryo') { hairColor = 0xbae6fd; robeColor = 0x38bdf8; accentColor = 0xe0f2fe; lightColor = 0xa5f3fc; }
      else if (element === 'Dendro') { hairColor = 0x14532d; robeColor = 0x16a34a; accentColor = 0x86efac; lightColor = 0x4ade80; }
    }

    // 1. Chibi Head (Cute rounded head)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), headMat);
    head.position.y = 0.42;
    group.add(head);

    // 2. Chibi Hair
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.7 });
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairTop.position.y = 0.44;
    group.add(hairTop);

    // Back hair / braid / ponytails
    if (charName.toLowerCase().includes('raiden')) {
      // Raiden's long purple braid
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.55, 8), hairMat);
      braid.rotation.x = -0.35;
      braid.position.set(0, 0.22, -0.28);
      group.add(braid);
      // Gold hair ornament
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      pin.position.set(-0.25, 0.55, 0.1);
      pin.rotation.z = 0.8;
      group.add(pin);
    } else if (charName.toLowerCase().includes('hu tao')) {
      // Hu Tao's twin-tails & porkpie hat
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.45, 6), hairMat);
      t1.position.set(-0.28, 0.25, -0.15);
      t1.rotation.z = -0.3;
      group.add(t1);
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.45, 6), hairMat);
      t2.position.set(0.28, 0.25, -0.15);
      t2.rotation.z = 0.3;
      group.add(t2);
      // Plum hat
      const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x18181b }));
      hatBrim.position.y = 0.65;
      group.add(hatBrim);
      const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.18, 14), new THREE.MeshStandardMaterial({ color: 0x18181b }));
      hatTop.position.y = 0.74;
      group.add(hatTop);
      // Red flower
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      flower.position.set(-0.22, 0.69, 0.2);
      group.add(flower);
    } else if (charName.toLowerCase().includes('furina')) {
      // Mini top hat
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0x1e3a8a }));
      hat.position.set(0.12, 0.75, 0);
      hat.rotation.z = -0.22;
      group.add(hat);
      const hatRibbon = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      hatRibbon.position.set(0.12, 0.66, 0);
      hatRibbon.rotation.z = -0.22;
      group.add(hatRibbon);
    } else if (charName.toLowerCase().includes('kazuha')) {
      // Crimson streak
      const streak = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
      streak.position.set(-0.16, 0.52, 0.25);
      group.add(streak);
    }

    // 3. Cute Anime Eyes (Glowing element tone)
    const eyeMat = new THREE.MeshBasicMaterial({ color: lightColor });
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.04), eyeMat);
    eye1.position.set(-0.11, 0.42, 0.31);
    group.add(eye1);
    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.04), eyeMat);
    eye2.position.set(0.11, 0.42, 0.31);
    group.add(eye2);

    // 4. Chibi Robe Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 12), bodyMat);
    body.position.y = 0.16;
    group.add(body);

    // Cute Sash / Belt
    const beltMat = new THREE.MeshBasicMaterial({ color: accentColor });
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 16), beltMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.22;
    group.add(belt);

    // 5. Floating Glowing Elemental Halo Ring
    const haloGeo = new THREE.TorusGeometry(0.55, 0.035, 8, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: lightColor,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 3;
    halo.position.y = 0.38;
    group.add(halo);

    // 6. Character-Specific Signature Floating Companion Accessory
    if (charName.toLowerCase().includes('hu tao')) {
      // Cute floating ghost pet
      const ghost = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      ghost.position.set(0.48, 0.52, 0.1);
      group.add(ghost);
      const ghostTail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      ghostTail.position.set(0.48, 0.38, 0.1);
      ghostTail.rotation.x = Math.PI;
      group.add(ghostTail);
    } else if (charName.toLowerCase().includes('zhongli')) {
      // Mini floating rotating Geo Crystal Cube
      const geoCube = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
      geoCube.position.set(0.46, 0.52, 0.1);
      group.add(geoCube);
    } else if (charName.toLowerCase().includes('furina')) {
      // Mini floating water bubble
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }));
      bubble.position.set(0.45, 0.55, 0.1);
      group.add(bubble);
    }

    // 7. Soft PointLight attached to Companion
    const pLight = new THREE.PointLight(lightColor, 1.2, 5.0, 2);
    pLight.position.set(0, 0.45, 0);
    group.add(pLight);

    group.userData = {
      charName: charName,
      element: element,
      halo: halo,
      baseScale: 1.0
    };

    return group;
  }

  // --- Companion Spawn, Despawn & Follow Helpers ---
  function spawnCompanionMesh(charName, element = 'Electro') {
    removeCompanionMesh();
    myCompanionMesh = createCompanionChibiMesh(charName, element);
    myCompanionMesh.position.set(myPlayer.x, (myMesh ? myMesh.position.y : 0) + 2.25, myPlayer.z);
    scene.add(myCompanionMesh);
  }

  function removeCompanionMesh() {
    if (myCompanionMesh) {
      scene.remove(myCompanionMesh);
      myCompanionMesh = null;
    }
  }

  function updateCompanionFollow(delta, now) {
    if (!myCompanionMesh) return;

    // Follow target: floating over player's right shoulder
    const shoulderAngle = myPlayer.rot - 0.75;
    const shoulderDist = 1.55;
    const bobOffset = Math.sin(now * 0.0035) * 0.14;
    const targetX = myPlayer.x + Math.sin(shoulderAngle) * shoulderDist;
    const targetZ = myPlayer.z + Math.cos(shoulderAngle) * shoulderDist;
    const targetY = (myMesh ? myMesh.position.y : 0) + 2.25 + bobOffset;

    // Smooth Lerp Follow
    const lerpSpeed = Math.min(1.0, 7.5 * delta);
    myCompanionMesh.position.x += (targetX - myCompanionMesh.position.x) * lerpSpeed;
    myCompanionMesh.position.y += (targetY - myCompanionMesh.position.y) * lerpSpeed;
    myCompanionMesh.position.z += (targetZ - myCompanionMesh.position.z) * lerpSpeed;

    // Tilt dynamically into movement
    const moveDx = targetX - myCompanionMesh.position.x;
    const moveDz = targetZ - myCompanionMesh.position.z;
    myCompanionMesh.rotation.z = -moveDx * 0.22;
    myCompanionMesh.rotation.x = moveDz * 0.22;
    myCompanionMesh.rotation.y = myPlayer.rot + 0.15;

    // Spin elemental halo
    if (myCompanionMesh.userData.halo) {
      myCompanionMesh.userData.halo.rotation.z += 0.025;
      myCompanionMesh.userData.halo.rotation.x += 0.012;
    }
  }

  // --- Companion Ability VFX & Implementations ---
  function spawnElectroEye(p) {
    if (activeElectroEyeMesh) {
      if (myMesh) myMesh.remove(activeElectroEyeMesh);
      activeElectroEyeMesh = null;
    }

    const eyeGroup = new THREE.Group();
    // Glowing Baleful Omen Eye Crest
    const eyeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xc084fc, side: THREE.DoubleSide })
    );
    eyeRing.rotation.x = Math.PI / 4;
    eyeGroup.add(eyeRing);

    const eyePupil = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: 0xf0abfc })
    );
    eyeGroup.add(eyePupil);

    const eyeLight = new THREE.PointLight(0xc084fc, 1.5, 6, 2);
    eyeGroup.add(eyeLight);

    eyeGroup.position.set(0, 2.7, 0);
    if (myMesh) myMesh.add(eyeGroup);
    activeElectroEyeMesh = eyeGroup;
    electroEyeEndTime = performance.now() + 15000;
  }

  function createElectroSlashVFX(x, y, z) {
    const vfxGroup = new THREE.Group();
    vfxGroup.position.set(x, y, z);

    // Cross lightning slashes
    for (let i = 0; i < 2; i++) {
      const slash = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 1.4, 8, 1, -Math.PI * 0.4, Math.PI * 0.8),
        new THREE.MeshBasicMaterial({ color: 0xc084fc, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
      );
      slash.rotation.x = -Math.PI / 2 + (i * 0.4);
      slash.rotation.z = (i * Math.PI) / 2;
      vfxGroup.add(slash);
    }

    const flashLight = new THREE.PointLight(0xd946ef, 1.8, 8, 2);
    vfxGroup.add(flashLight);
    worldObjects.add(vfxGroup);

    const birth = performance.now();
    const anim = () => {
      const el = performance.now() - birth;
      if (el > 180) {
        worldObjects.remove(vfxGroup);
      } else {
        const s = 1.0 + (el / 180) * 1.5;
        vfxGroup.scale.set(s, s, s);
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  function performMusouSlash(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 16.0);
    const angle = aim.angle;
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    // 1. Spawn Giant Electro Chakra Halo behind Player
    const chakraGroup = new THREE.Group();
    const cRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 24),
      new THREE.MeshBasicMaterial({ color: 0xe879f9, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
    );
    chakraGroup.add(cRing);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.55, 4),
        new THREE.MeshBasicMaterial({ color: 0xf5d0fe })
      );
      spoke.position.set(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0);
      spoke.rotation.z = a - Math.PI / 2;
      chakraGroup.add(spoke);
    }
    chakraGroup.position.set(p.x - fwdX * 0.4, 1.85, p.z - fwdZ * 0.4);
    chakraGroup.rotation.y = angle;
    worldObjects.add(chakraGroup);
    setTimeout(() => worldObjects.remove(chakraGroup), 650);

    // 2. Launch Physical Traveling Colossal Dimensional Rift Wave Skillshot!
    spawnLinearWaveSkillshot({
      slot: 'q',
      x: p.x + fwdX * 1.2,
      z: p.z + fwdZ * 1.2,
      angle,
      speed: 27.0,
      maxDist: 16.0,
      width: 4.2,
      sweetspotWidth: 1.35,
      element: 'Electro',
      color: 0xa855f7,
      coreColor: 0xf5d0fe,
      baseDmg: 460,
      poiseDmg: 65,
      isUltimate: true,
      label: '⚡ MUSOU TACHI!'
    });
  }

  function spawnGeoStele(p, targetX = null, targetZ = null) {
    if (activeGeoSteleMesh) {
      worldObjects.remove(activeGeoSteleMesh);
      activeGeoSteleMesh = null;
    }

    const aim = getCombatAimAngleAndTarget(true, 13.0);
    const sx = typeof targetX === 'number' ? targetX : aim.targetPos.x;
    const sz = typeof targetZ === 'number' ? targetZ : aim.targetPos.z;

    // Seismic Tectonic Line from Player to Target before Stele Erupts!
    const dx = sx - p.x;
    const dz = sz - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const steps = Math.min(7, Math.max(2, Math.floor(dist / 1.8)));
    for (let s = 1; s <= steps; s++) {
      const ratio = s / steps;
      const rx = p.x + dx * ratio;
      const rz = p.z + dz * ratio;
      setTimeout(() => {
        createShockwaveRing(rx, rz, 1.6, 0xfacc15);
      }, s * 28);
    }

    const steleGroup = new THREE.Group();
    steleGroup.position.set(sx, 0, sz);

    // Base Rune Seal
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.65, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.06;
    steleGroup.add(baseRing);

    // Towering Geo Pillar with Runic Inlays
    const colMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.4, metalness: 0.65 });
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.95, 4.5, 0.95), colMat);
    col.position.y = 2.25;
    steleGroup.add(col);

    const runeStripMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const strip1 = new THREE.Mesh(new THREE.BoxGeometry(1.01, 3.6, 0.16), runeStripMat);
    strip1.position.y = 2.25;
    steleGroup.add(strip1);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 1.01), runeStripMat);
    strip2.position.y = 2.25;
    steleGroup.add(strip2);

    // Glowing Amber Geo Diamond Crest atop
    const crest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.52, 0),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    crest.position.y = 4.9;
    steleGroup.add(crest);

    const sLight = new THREE.PointLight(0xf59e0b, 2.2, 14, 2);
    sLight.position.y = 4.5;
    steleGroup.add(sLight);

    // Erupt upward animation!
    steleGroup.scale.set(1, 0.05, 1);
    worldObjects.add(steleGroup);
    const birth = performance.now();
    const eruptAnim = () => {
      const el = performance.now() - birth;
      if (el >= 190) {
        steleGroup.scale.set(1, 1, 1);
      } else {
        const pProg = 1 - Math.pow(1 - el / 190, 3);
        steleGroup.scale.set(1, Math.max(0.05, pProg), 1);
        requestAnimationFrame(eruptAnim);
      }
    };
    requestAnimationFrame(eruptAnim);

    createMeteorImpact(sx, sz, 0xfacc15);
    applyTargetGroundSkillshotDamage({
      slot: 'e',
      tx: sx,
      tz: sz,
      radius: 4.6,
      sweetspotRadius: 1.85,
      element: 'Geo',
      baseDmg: 240,
      poiseDmg: 38,
      label: '🪨 TAŞ SÜTUN!'
    });

    activeGeoSteleMesh = steleGroup;
    activeGeoSteleMesh.userData = {
      endTime: performance.now() + 15000,
      lastPulse: performance.now()
    };
  }

  function applyJadeShield(amount = 450) {
    activeJadeShieldHP = amount;
    if (activeJadeShieldMesh && myMesh) {
      myMesh.remove(activeJadeShieldMesh);
      activeJadeShieldMesh = null;
    }

    const shieldGeo = new THREE.CylinderGeometry(1.15, 1.15, 2.1, 8, 1, true);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 1.05;
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.18, 2.12, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true, transparent: true, opacity: 0.65 })
    );
    shield.add(wire);
    if (myMesh) myMesh.add(shield);
    activeJadeShieldMesh = shield;
  }

  function performPlanetBefall(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 16.0);
    const targetX = aim.targetPos.x;
    const targetZ = aim.targetPos.z;

    // 1. Celestial Golden Rune Lock-On Array on the Ground at Aimed Cursor Point
    const sealGroup = new THREE.Group();
    sealGroup.position.set(targetX, 0.07, targetZ);
    const outerSeal = new THREE.Mesh(
      new THREE.RingGeometry(6.2, 6.8, 36),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    outerSeal.rotation.x = -Math.PI / 2;
    sealGroup.add(outerSeal);
    const innerBullseye = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.3, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    );
    innerBullseye.rotation.x = -Math.PI / 2;
    sealGroup.add(innerBullseye);
    worldObjects.add(sealGroup);

    // 2. Giant Flaming Geo Star / Meteor plunging diagonally from sky into Cursor Target
    const meteorGroup = new THREE.Group();
    const startX = targetX - Math.sin(aim.angle) * 9.0;
    const startZ = targetZ - Math.cos(aim.angle) * 9.0;
    const startY = 28;
    const endY = 0.6;
    meteorGroup.position.set(startX, startY, startZ);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: 0xd97706,
      emissiveIntensity: 0.55,
      roughness: 0.4
    });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.35, 1), rockMat);
    meteorGroup.add(rock);

    const glowCore = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.6, 1),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true })
    );
    meteorGroup.add(glowCore);

    const tailCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 7.5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    tailCone.position.y = 3.8;
    meteorGroup.add(tailCone);

    const mLight = new THREE.PointLight(0xfacc15, 4.0, 28, 2);
    meteorGroup.add(mLight);
    worldObjects.add(meteorGroup);

    const startTime = performance.now();
    const duration = 420;

    const anim = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      const easeIn = progress * progress;
      meteorGroup.position.set(
        startX + (targetX - startX) * easeIn,
        startY - (startY - endY) * easeIn,
        startZ + (targetZ - startZ) * easeIn
      );
      meteorGroup.rotation.x += 0.12;
      meteorGroup.rotation.y += 0.12;
      sealGroup.rotation.y += 0.08;

      if (progress < 1.0) {
        requestAnimationFrame(anim);
      } else {
        worldObjects.remove(meteorGroup);
        worldObjects.remove(sealGroup);
        createMeteorImpact(targetX, targetZ, 0xfacc15);
        playMeteorImpactSound();
        screenShakeTimer = 0.85;
        screenShakeMagnitude = 0.95;

        applyTargetGroundSkillshotDamage({
          slot: 'q',
          tx: targetX,
          tz: targetZ,
          radius: 8.5,
          sweetspotRadius: 2.5,
          element: 'Geo',
          baseDmg: 520,
          poiseDmg: 75,
          petrifyMs: 3800,
          label: '☄️ PLANET BEFALL!'
        });
      }
    };
    requestAnimationFrame(anim);
  }

  function spawnHuTaoButterflies(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 13.0);
    const angle = aim.angle;
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    // 1. Forward Crimson Phantom Lance Dash toward Cursor!
    const dashDist = 3.2;
    const b = getCombatZoneBounds(currentMap);
    createAfterimageGhost(p.x, p.z, angle);
    p.x = Math.max(b.minX, Math.min(b.maxX, p.x + fwdX * dashDist));
    p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z + fwdZ * dashDist));
    if (myMesh) {
      myMesh.position.x = p.x;
      myMesh.position.z = p.z;
    }

    // 2. Launch Piercing Crimson Fire Lance Skillshot Wave along Cursor Vector!
    spawnLinearWaveSkillshot({
      slot: 'e',
      x: p.x,
      z: p.z,
      angle,
      speed: 25.0,
      maxDist: 12.5,
      width: 2.6,
      sweetspotWidth: 0.95,
      element: 'Pyro',
      color: 0xef4444,
      coreColor: 0xfef08a,
      baseDmg: 250,
      poiseDmg: 35,
      label: '🔥 KIZIL MIZRAK!'
    });

    // 3. Fluttering crimson butterflies bursting along the dash wake
    for (let i = 0; i < 8; i++) {
      const bAngle = angle + (i - 3.5) * 0.25;
      const bf = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xef4444 : 0xfde047 })
      );
      bf.position.set(p.x, 1.25, p.z);
      worldObjects.add(bf);

      const bStart = performance.now();
      const bAnim = () => {
        const el = performance.now() - bStart;
        if (el > 480) {
          worldObjects.remove(bf);
        } else {
          const dist = (el / 480) * 6.5;
          bf.position.set(p.x + Math.sin(bAngle) * dist, 1.2 + Math.sin(el * 0.025 + i) * 0.45, p.z + Math.cos(bAngle) * dist);
          bf.rotation.y += 0.25;
          requestAnimationFrame(bAnim);
        }
      };
      requestAnimationFrame(bAnim);
    }
  }

  function performSpiritSoother(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 15.0);
    const healAmount = 260;
    playerHP = Math.min(playerMaxHP, playerHP + healAmount);
    updateCombatHUD();
    showDamageNumber({ x: p.x, y: 2.3, z: p.z }, `💚 +${healAmount} HP (Şifa!)`, 'heal');

    // Launch Colossal Blazing Fire Spirit Dragon along Aimed Skillshot Corridor!
    spawnLinearWaveSkillshot({
      slot: 'q',
      x: p.x,
      z: p.z,
      angle: aim.angle,
      speed: 24.0,
      maxDist: 15.0,
      width: 3.8,
      sweetspotWidth: 1.25,
      element: 'Pyro',
      color: 0xf97316,
      coreColor: 0xfef08a,
      baseDmg: 450,
      poiseDmg: 60,
      isUltimate: true,
      label: '👻 SPIRIT SOOTHER!'
    });
  }

  function spawnFurinaMinions(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 13.0);

    // 1. Fire High-Pressure Hydro Torrent Skillshot to Cursor Target!
    spawnArcaneOrbToTargetSkillshot({
      slot: 'e',
      startX: p.x,
      startZ: p.z,
      tx: aim.targetPos.x,
      tz: aim.targetPos.z,
      radius: 4.5,
      sweetspotRadius: 1.85,
      element: 'Hydro',
      color: 0x38bdf8,
      baseDmg: 235,
      poiseDmg: 32,
      label: '💧 OKYANUS JETİ!'
    });

    // 2. Summon 3 Hydro Salon Minions
    for (const m of activeFurinaMinions) {
      worldObjects.remove(m.mesh);
    }
    activeFurinaMinions = [];

    const minionColors = [0x38bdf8, 0x0284c7, 0x67e8f9];
    for (let i = 0; i < 3; i++) {
      const mGroup = new THREE.Group();
      const col = minionColors[i];
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 12),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.2, metalness: 0.8, emissive: col, emissiveIntensity: 0.4 })
      );
      bubble.position.y = 0.35;
      mGroup.add(bubble);

      const mLight = new THREE.PointLight(col, 0.8, 4, 2);
      mGroup.add(mLight);
      worldObjects.add(mGroup);

      activeFurinaMinions.push({
        mesh: mGroup,
        orbitIndex: i,
        angleOffset: (i / 3) * Math.PI * 2,
        lastShot: performance.now()
      });
    }
    furinaMinionsEndTime = performance.now() + 20000;
  }

  function performFurinaFanfare(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 15.0);
    const tx = aim.targetPos.x;
    const tz = aim.targetPos.z;

    // Celestial Hydro Gate & Rain of 12 Giant Hydro Greatswords at Aimed Point!
    spawnHydroSwordRainSkillshot(tx, tz, 'Hydro', 440, '🎭 HYDRO CATACLYSM!');
    showDamageNumber({ x: p.x, y: 2.2, z: p.z }, '🎭 FANFARE! +%35 Hasar & +%25 Hız', 'heal');
  }

  function performKazuhaChihayaburu(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 13.5);
    const tx = aim.targetPos.x;
    const tz = aim.targetPos.z;

    // Throw Compressed Wind Vortex Orb to Aimed Cursor Point -> Pulls Mobs into Aimed Point & Detonates!
    spawnArcaneOrbToTargetSkillshot({
      slot: 'e',
      startX: p.x,
      startZ: p.z,
      tx,
      tz,
      radius: 6.2,
      sweetspotRadius: 2.0,
      element: 'Anemo',
      color: 0x34d399,
      baseDmg: 265,
      poiseDmg: 38,
      pullToCenter: true,
      spawnVortexAfter: true,
      label: '🍃 CHIHAYABURU VAKUM!'
    });
  }

  function performKazuhaAutumnStorm(p, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 15.0);
    const tx = aim.targetPos.x;
    const tz = aim.targetPos.z;

    if (activeKazuhaStormMesh) {
      worldObjects.remove(activeKazuhaStormMesh);
      activeKazuhaStormMesh = null;
    }

    createMeteorImpact(tx, tz, 0x34d399);
    applyTargetGroundSkillshotDamage({
      slot: 'q',
      tx,
      tz,
      radius: 7.2,
      sweetspotRadius: 2.4,
      element: 'Anemo',
      baseDmg: 390,
      poiseDmg: 55,
      label: '🍁 KAZUHA SLASH!'
    });

    const stormGroup = new THREE.Group();
    stormGroup.position.set(tx, 0.12, tz);

    // 14m Autumn Maple Leaf Wind Dome & Central Funnel at Aimed Location!
    const field = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 7.0, 36),
      new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    field.rotation.x = -Math.PI / 2;
    stormGroup.add(field);

    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(6.8, 7.0, 2.8, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.22, wireframe: true })
    );
    dome.position.y = 1.4;
    stormGroup.add(dome);

    const leafMat = new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide });
    for (let l = 0; l < 22; l++) {
      const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), leafMat);
      const lAngle = (l / 22) * Math.PI * 2;
      const lDist = 1.5 + (l % 5) * 1.1;
      leaf.position.set(Math.cos(lAngle) * lDist, 0.5 + (l % 4) * 0.65, Math.sin(lAngle) * lDist);
      stormGroup.add(leaf);
    }

    worldObjects.add(stormGroup);
    activeKazuhaStormMesh = stormGroup;
    kazuhaStormEndTime = performance.now() + 10000;
    kazuhaStormTickTimer = 0;
  }

  function triggerUniversalElementalSkill(p, elem, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 13.5);
    const meta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    triggerElementalFlash(`flash-${elem.toLowerCase()}`);

    if (elem === 'Cryo' || elem === 'Electro' || elem === 'Pyro') {
      playSlashSound(3);
      spawnLinearWaveSkillshot({
        slot: 'e',
        x: p.x,
        z: p.z,
        angle: aim.angle,
        speed: 25.0,
        maxDist: 13.0,
        width: 2.6,
        sweetspotWidth: 0.95,
        element: elem,
        color: meta.color,
        coreColor: 0xffffff,
        baseDmg: 245,
        poiseDmg: 36,
        label: `${meta.emoji} ${elem.toUpperCase()} DALGASI!`
      });
    } else {
      playHydroSplashSound();
      spawnArcaneOrbToTargetSkillshot({
        slot: 'e',
        startX: p.x,
        startZ: p.z,
        tx: aim.targetPos.x,
        tz: aim.targetPos.z,
        radius: 4.8,
        sweetspotRadius: 1.85,
        element: elem,
        color: meta.color,
        baseDmg: 240,
        poiseDmg: 36,
        pullToCenter: elem === 'Anemo',
        label: `${meta.emoji} ${elem.toUpperCase()} PATLAMASI!`
      });
    }
  }

  function triggerUniversalElementalBurst(p, elem, aimOverride = null) {
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 15.5);
    const meta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    triggerElementalFlash(`flash-${elem.toLowerCase()}`);
    playBurstExplosion();

    if (elem === 'Hydro') {
      spawnHydroSwordRainSkillshot(aim.targetPos.x, aim.targetPos.z, 'Hydro', 450, '🗡️ GUHUA KILIÇ YAĞMURU!');
    } else {
      // Drop a Celestial Elemental Star Comet directly onto the aimed cursor target!
      spawnArcaneOrbToTargetSkillshot({
        slot: 'q',
        startX: aim.targetPos.x - Math.sin(aim.angle) * 7.0,
        startZ: aim.targetPos.z - Math.cos(aim.angle) * 7.0,
        startY: 22.0,
        tx: aim.targetPos.x,
        tz: aim.targetPos.z,
        radius: 7.5,
        sweetspotRadius: 2.4,
        element: elem,
        color: meta.color,
        baseDmg: 460,
        poiseDmg: 65,
        isUltimate: true,
        label: `🌟 ${elem.toUpperCase()} SUPERNOVA!`
      });
    }
  }

  // --- Companion Skills Configuration Table ---
  const COMPANION_SKILLS = {
    'Raiden Shogun': {
      element: 'Electro',
      elementEmoji: '⚡',
      color: 0xa855f7,
      slashColors: [0xa855f7, 0xc084fc, 0xe879f9],
      eName: 'Transcendence: Baleful Omen',
      eDesc: 'İmleç hattına delici Yıldırım Mızrağı fırlatır (250 DMG) ve 15sn Şimşek Gözü açar.',
      eCooldown: 10000,
      qName: 'Secret Art: Musou Shinsetsu',
      qDesc: 'İmleç yönünde 16m Boyutsal Uzay Yarığı ve yıldırım koridoru yarar (460 AoE DMG)!',
      qCooldown: 18000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(false);
        screenShakeTimer = 0.25;
        screenShakeMagnitude = 0.35;
        spawnElectroEye(p);
        triggerUniversalElementalSkill(p, 'Electro', aim);
        addChatMessage('⚡ Yoldaş', 'Raiden Shogun: "Tepeden inen şimşek karanlığı dağıtacak!" (Yıldırım Mızrağı & Göz)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(true);
        screenShakeTimer = 0.75;
        screenShakeMagnitude = 0.85;
        performMusouSlash(p, aim);
        addChatMessage('⚡ Musou Shinsetsu', 'Raiden Shogun: "Torn to oblivion! (Hiçliğe gömülün!)"');
      }
    },
    'Zhongli': {
      element: 'Geo',
      elementEmoji: '🪨',
      color: 0xeab308,
      slashColors: [0xeab308, 0xfacc15, 0xfef08a],
      eName: 'Dominus Lapidis',
      eDesc: 'İmleç noktasına sismik fay hattı ve Geo Taş Sütun diker (240 DMG), 450 HP Yeşim Kalkan verir.',
      eCooldown: 12000,
      qName: 'Planet Befall',
      qDesc: 'İmleç noktasına gökten dev Geo Meteor indirir; 520 AoE DMG verir ve 3.8sn taşlaştırır!',
      qCooldown: 20000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-geo');
        playBeep(320, 'triangle', 0.25);
        screenShakeTimer = 0.3;
        screenShakeMagnitude = 0.4;
        const pos = aim ? aim.targetPos : getCombatAimAngleAndTarget(true, 13.0).targetPos;
        spawnGeoStele(p, pos.x, pos.z);
        applyJadeShield(450);
        addChatMessage('🪨 Yoldaş', 'Zhongli: "Sağlam bir kalkan huzurun temelidir." (Yeşim Kalkan & Sütun)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-geo');
        playMeteorImpactSound();
        screenShakeTimer = 0.85;
        screenShakeMagnitude = 0.95;
        performPlanetBefall(p, aim);
        addChatMessage('☄️ Planet Befall', 'Zhongli: "I will have order! (Düzeni sağlayacağım!)"');
      }
    },
    'Hu Tao': {
      element: 'Pyro',
      elementEmoji: '🔥',
      color: 0xef4444,
      slashColors: [0xef4444, 0xf97316, 0xfde047],
      eName: 'Guide to Afterlife',
      eDesc: 'İmleç yönüne Kızıl Alev Mızrağı ile atılır ve delici ateş dalgası yollar (+%50 ATK).',
      eCooldown: 12000,
      qName: 'Spirit Soother',
      qDesc: 'İmleç koridoruna devasa Alev Ruhu fırlatır (450 Pyro DMG) ve +260 HP iyileştirir!',
      qCooldown: 15000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-pyro');
        playFlameBurstSound();
        screenShakeTimer = 0.22;
        screenShakeMagnitude = 0.32;
        spawnHuTaoButterflies(p, aim);
        companionBuffs = { active: true, timer: 12.0, dmgMult: 1.5, speedMult: 1.15, type: 'hu_tao_fire' };
        addChatMessage('🔥 Yoldaş', 'Hu Tao: "Ateş dansı başlasın! Kızıl kelebekler yol göstersin!" (+%50 ATK)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-pyro');
        playFlameBurstSound();
        screenShakeTimer = 0.65;
        screenShakeMagnitude = 0.75;
        performSpiritSoother(p, aim);
        addChatMessage('👻 Spirit Soother', 'Hu Tao: "Tüm dertler kül olsun! Şifa ve ateş ruhu!" (+260 HP)');
      }
    },
    'Furina': {
      element: 'Hydro',
      elementEmoji: '💧',
      color: 0x38bdf8,
      slashColors: [0x38bdf8, 0x67e8f9, 0xa5f3fc],
      eName: 'Salon Solitaire',
      eDesc: 'İmleç noktasına basınçlı Okyanus Jeti fırlatır (235 DMG) ve 3 Su Minyonu çağırır.',
      eCooldown: 14000,
      qName: 'Let the People Rejoice',
      qDesc: 'İmleç alanına göksel su kılıçları yağdırır (440 DMG) ve +%35 Hasar/Hız verir!',
      qCooldown: 18000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.2;
        screenShakeMagnitude = 0.25;
        spawnFurinaMinions(p, aim);
        addChatMessage('💧 Yoldaş', 'Furina: "Sahneye gelin minik dostlarım! Gösteri başlasın!" (3 Su Minyonu)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.6;
        screenShakeMagnitude = 0.65;
        performFurinaFanfare(p, aim);
        companionBuffs = { active: true, timer: 15.0, dmgMult: 1.35, speedMult: 1.25, type: 'furina_fanfare' };
        addChatMessage('🎭 Fanfare', 'Furina: "Alkışlar ve kutlamalar halkım için! (+%35 Hasar & +%25 Hız)"');
      }
    },
    'Kaedehara Kazuha': {
      element: 'Anemo',
      elementEmoji: '🍃',
      color: 0x34d399,
      slashColors: [0x34d399, 0x6ee7b7, 0xfde047],
      eName: 'Chihayaburu',
      eDesc: 'İmleç noktasına vakumlu Rüzgar Küresi fırlatır; düşmanları merkeze çekip patlatır (265 DMG).',
      eCooldown: 8000,
      qName: 'Kazuha Slash',
      qDesc: 'İmleç noktasında 14m Akçaağaç Fırtına Kubbesi açar (390 DMG + sürekli Girdap).',
      qCooldown: 15000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.35;
        screenShakeMagnitude = 0.45;
        performKazuhaChihayaburu(p, aim);
        addChatMessage('🍃 Yoldaş', 'Kazuha: "Rüzgar fısıldar, yapraklar yükselir!" (Chihayaburu Vakum Skillshot)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.65;
        screenShakeMagnitude = 0.7;
        performKazuhaAutumnStorm(p, aim);
        addChatMessage('🍁 Kazuha Slash', 'Kazuha: "Bulutlar dağılsın, sonbahar rüzgarı essin!" (14m Rüzgar Alanı)');
      }
    },
    'Xingqiu': {
      element: 'Hydro',
      elementEmoji: '💧',
      color: 0x0284c7,
      slashColors: [0x0284c7, 0x38bdf8, 0xe0f2fe],
      eName: 'Fatal Rainscreen',
      eDesc: 'İmleç noktasına Hydro Girdabı fırlatır (240 DMG) ve 300 HP Yağmur Kalkanı açar.',
      eCooldown: 11000,
      qName: 'Guhua Sword: Raincutter',
      qDesc: 'İmleç alanına gökten 14 dev Su Kılıcı yağdırır (450 AoE DMG & +%30 Hız)!',
      qCooldown: 16000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.2;
        applyJadeShield(300);
        triggerUniversalElementalSkill(p, 'Hydro', aim);
        addChatMessage('💧 Yoldaş', 'Xingqiu: "Yağmur kılıçları adaleti savunsun!" (Yağmur Kalkanı & Su Vuruşu)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.55;
        triggerUniversalElementalBurst(p, 'Hydro', aim);
        companionBuffs = { active: true, timer: 15.0, dmgMult: 1.25, speedMult: 1.3, type: 'xingqiu_rain' };
        addChatMessage('🗡️ Raincutter', 'Xingqiu: "Guhua Style: Yağmur Kılıçları hücum!" (450 AoE DMG & Hız)');
      }
    },
    'Kuki Shinobu': {
      element: 'Electro',
      elementEmoji: '⚡',
      color: 0x8b5cf6,
      slashColors: [0x8b5cf6, 0xa855f7, 0xec4899],
      eName: 'Sanctifying Ring',
      eDesc: 'İmleç yönüne Yıldırım Dalgası fırlatır (245 DMG), +180 HP iyileştirir ve Şimşek Gözü açar.',
      eCooldown: 10000,
      qName: 'Gyoei Narukami Kariyama Rite',
      qDesc: 'İmleç hattında dev yıldırım yarığı patlatır (460 AoE DMG)!',
      qCooldown: 15000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(false);
        screenShakeTimer = 0.2;
        applyHeal(180);
        spawnElectroEye(p);
        triggerUniversalElementalSkill(p, 'Electro', aim);
        addChatMessage('⚡ Yoldaş', 'Kuki Shinobu: "Kutsal halka arındırsın!" (+180 HP Şifa & Yıldırım Dalgası)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(true);
        screenShakeTimer = 0.65;
        performMusouSlash(p, aim);
        addChatMessage('⚡ Kariyama Rite', 'Kuki Shinobu: "Arataki Çetesi adına! Yıldırım tuzağı!" (460 AoE DMG)');
      }
    },
    'Sucrose': {
      element: 'Anemo',
      elementEmoji: '🍃',
      color: 0x10b981,
      slashColors: [0x10b981, 0x34d399, 0xa7f3d0],
      eName: 'Astable Anemohypostasis Creation',
      eDesc: 'İmleç noktasına Rüzgar Ruhu fırlatır; düşmanları merkeze çekip patlatır (265 DMG).',
      eCooldown: 8000,
      qName: 'Forbidden Creation - Isomer 75',
      qDesc: 'İmleç noktasında dev rüzgar fırtınası açar; alandaki düşmanları savurur ve girdap yaratır!',
      qCooldown: 16000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.3;
        performKazuhaChihayaburu(p, aim);
        addChatMessage('🍃 Yoldaş', 'Sucrose: "Kararsız bileşim no:6! Vakum oluşturuldu!" (265 DMG)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.6;
        performKazuhaAutumnStorm(p, aim);
        addChatMessage('🧪 Simya Fırtınası', 'Sucrose: "Dev İzomer 75 aktive oldu! Element girdabı!"');
      }
    },
    'Freminet': {
      element: 'Cryo',
      elementEmoji: '❄️',
      color: 0x06b6d4,
      slashColors: [0x06b6d4, 0x38bdf8, 0xe0f2fe],
      eName: 'Pressurized Floe',
      eDesc: 'İmleç yönüne delici Buzul Dalgası ve buz kristalleri fırlatır (245 DMG).',
      eCooldown: 9000,
      qName: 'Shadowhunter\'s Ambush',
      qDesc: 'İmleç noktasına Buzul Kuyrukluyıldızı indirir (460 DMG) ve +%30 Hız/Hasar verir!',
      qCooldown: 16000,
      onE: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.25;
        triggerUniversalElementalSkill(p, 'Cryo', aim);
        addChatMessage('❄️ Yoldaş', 'Freminet: "Basınç yükseliyor... Buz kırılması!" (245 DMG)');
      },
      onQ: (p, aim) => {
        triggerElementalFlash('flash-hydro');
        playThunderSound(false);
        screenShakeTimer = 0.6;
        triggerUniversalElementalBurst(p, 'Cryo', aim);
        companionBuffs = { active: true, timer: 12.0, dmgMult: 1.3, speedMult: 1.3, type: 'freminet_cryo' };
        addChatMessage('🐧 Derin Deniz', 'Freminet: "Pers ve ben dalışa hazırız! (+%30 Buz & Hız Güçlendirmesi)"');
      }
    }
  };

  function applyHeal(amount) {
    playerHP = Math.min(playerMaxHP, playerHP + amount);
    showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `💚 +${amount} HP`, 'heal');
    updateCombatHUD();
  }

  function getCompanionConfig(name, forcedElement = null) {
    if (!name) return null;
    if (COMPANION_SKILLS[name]) return COMPANION_SKILLS[name];

    // Check by substring match
    for (const key of Object.keys(COMPANION_SKILLS)) {
      if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) {
        return COMPANION_SKILLS[key];
      }
    }

    // Try finding in unlocked list or active companion data
    const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === name.toLowerCase());
    const elem = forcedElement || (found && found.element) || (myCompanionData && myCompanionData.name === name ? myCompanionData.element : null) || 'Electro';
    const elemColorMap = {
      Electro: 0xa855f7,
      Geo: 0xeab308,
      Pyro: 0xef4444,
      Hydro: 0x38bdf8,
      Anemo: 0x34d399,
      Cryo: 0x93c5fd,
      Dendro: 0x84cc16
    };
    const elemEmojiMap = {
      Electro: '⚡',
      Geo: '🪨',
      Pyro: '🔥',
      Hydro: '💧',
      Anemo: '🍃',
      Cryo: '❄️',
      Dendro: '🌿'
    };
    const cColor = elemColorMap[elem] || 0x38bdf8;
    const emoji = elemEmojiMap[elem] || '✨';

    return {
      element: elem,
      elementEmoji: emoji,
      color: cColor,
      slashColors: [cColor, 0xffffff],
      eName: `${elem} Surge`,
      eDesc: `İmleç noktasına ${elem} patlaması veya mızrağı fırlatır (240 DMG).`,
      eCooldown: 10000,
      qName: `${elem} Supernova`,
      qDesc: `İmleç noktasına devasa element süpernovası indirir (460 AoE DMG)!`,
      qCooldown: 18000,
      onE: (p, aim) => triggerUniversalElementalSkill(p, elem, aim),
      onQ: (p, aim) => triggerUniversalElementalBurst(p, elem, aim)
    };
  }

  function getCompanionSkillECD() {
    const cfg = getCompanionConfig(myCompanion);
    return cfg ? cfg.eCooldown : 6000;
  }

  // --- Combat 3.0: 100% True Cursor Aiming, Hold-to-Aim + Smartcast, 3D Travelling Skillshots & Sweetspot Mastery ---

  const ELEMENT_META = {
    Pyro: { emoji: '🔥', color: 0xef4444, name: 'Ateş' },
    Hydro: { emoji: '💧', color: 0x38bdf8, name: 'Su' },
    Electro: { emoji: '⚡', color: 0xa855f7, name: 'Yıldırım' },
    Cryo: { emoji: '❄️', color: 0x67e8f9, name: 'Buz' },
    Anemo: { emoji: '🍃', color: 0x34d399, name: 'Rüzgar' },
    Geo: { emoji: '🪨', color: 0xfacc15, name: 'Toprak' },
    Dendro: { emoji: '🌿', color: 0x84cc16, name: 'Doğa' }
  };

  function getActivePlayerElement() {
    const compCfg = getCompanionConfig(myCompanion);
    if (compCfg && compCfg.element) return compCfg.element;
    const preset = AVATAR_PRESETS[Math.abs(myPlayer.avatarIndex || 0) % AVATAR_PRESETS.length];
    return (preset && preset.element) || 'Pyro';
  }

  function broadcastCombatAction(action, combo = 1, element = 'Pyro') {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_COMBAT_VFX',
        action,
        combo,
        element,
        x: Number(myPlayer.x.toFixed(2)),
        z: Number(myPlayer.z.toFixed(2)),
        rot: Number(myPlayer.rot.toFixed(2))
      }));
    }
  }

  const combatRaycaster = new THREE.Raycaster();
  const combatGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const combatIntersectPt = new THREE.Vector3();

  function getCombatAimAngleAndTarget(preferMouse = true, maxRange = 14.0) {
    let cursorAngle = myPlayer.rot;
    let cursorWorldPos = null;
    let clampedTargetPos = {
      x: myPlayer.x + Math.sin(cursorAngle) * Math.min(6.5, maxRange),
      z: myPlayer.z + Math.cos(cursorAngle) * Math.min(6.5, maxRange),
      dist: Math.min(6.5, maxRange)
    };

    if (preferMouse && hasMouseMovedInZone && camera) {
      combatRaycaster.setFromCamera({ x: mouseNdcX, y: mouseNdcY }, camera);
      const hit = combatRaycaster.ray.intersectPlane(combatGroundPlane, combatIntersectPt);
      if (hit) {
        cursorWorldPos = { x: hit.x, z: hit.z };
        const cdx = hit.x - myPlayer.x;
        const cdz = hit.z - myPlayer.z;
        const rawDist = Math.hypot(cdx, cdz);
        if (rawDist > 0.1) {
          cursorAngle = Math.atan2(cdx, cdz);
        }
        const effDist = Math.max(1.2, Math.min(maxRange, rawDist));
        const b = getCombatZoneBounds(currentMap);
        clampedTargetPos = {
          x: Math.max(b.minX, Math.min(b.maxX, myPlayer.x + Math.sin(cursorAngle) * effDist)),
          z: Math.max(b.minZ, Math.min(b.maxZ, myPlayer.z + Math.cos(cursorAngle) * effDist)),
          dist: effDist
        };
      }
    }

    // 100% True Skillshot Aiming: Never snap angle to a mob!
    lockedTargetMob = null;
    return {
      angle: cursorAngle,
      target: null,
      cursorPos: cursorWorldPos || clampedTargetPos,
      targetPos: clampedTargetPos
    };
  }

  function updateTargetReticle(now) {
    if (!isBattleZone(currentMap)) return;
    if (!targetReticleMesh) {
      const rGroup = new THREE.Group();
      const outer = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.68, 24),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
      );
      outer.rotation.x = -Math.PI / 2;
      rGroup.add(outer);

      const inner = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.24, 6),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.88 })
      );
      inner.rotation.x = -Math.PI / 2;
      rGroup.add(inner);

      rGroup.position.y = 0.05;
      rGroup.visible = false;
      worldObjects.add(rGroup);
      targetReticleMesh = rGroup;
    }

    if (hasMouseMovedInZone) {
      const aim = getCombatAimAngleAndTarget(true, 16.0);
      targetReticleMesh.visible = true;
      const pulse = 1 + Math.sin(now * 0.008) * 0.08;
      targetReticleMesh.scale.set(pulse, 1, pulse);
      targetReticleMesh.position.set(aim.targetPos.x, 0.05, aim.targetPos.z);
      targetReticleMesh.rotation.y = now * 0.003;

      // Highlight gold when cursor is directly over a live mob's sweetspot!
      let hoveringMob = false;
      for (const m of activeCombatMobs) {
        if (!m.isDead && Math.hypot(m.x - aim.targetPos.x, m.z - aim.targetPos.z) <= 1.85) {
          hoveringMob = true;
          break;
        }
      }
      if (targetReticleMesh.children[0] && targetReticleMesh.children[0].material) {
        targetReticleMesh.children[0].material.color.setHex(hoveringMob ? 0xfacc15 : 0x38bdf8);
      }
    } else {
      targetReticleMesh.visible = false;
    }

    updateSkillshotAimIndicator(now);
  }

  function triggerSweetspotReward(mob, slot, now) {
    playBeep(987.77, 'triangle', 0.14); // B5 harmonic chime
    setTimeout(() => playBeep(1318.5, 'sine', 0.18), 55); // E6 chime
    hitStopEndTime = Math.max(hitStopEndTime, now + 68);
    screenShakeTimer = Math.max(screenShakeTimer, 0.25);
    screenShakeMagnitude = Math.max(screenShakeMagnitude, 0.44);

    showDamageNumber(
      { x: mob.x, y: mob.y + mob.height + 0.72, z: mob.z },
      '🎯 KESKİN İSABET! (+%35 HASAR & CD İADESİ)',
      'crit'
    );

    if (slot === 'r') {
      const rem = Math.max(0, heavyAttackCooldownEndTime - now);
      heavyAttackCooldownEndTime = now + rem * 0.72;
      playerEnergy = Math.min(100, playerEnergy + 12);
    } else if (slot === 'e') {
      const rem = Math.max(0, vortexCooldownEndTime - now);
      vortexCooldownEndTime = now + rem * 0.75;
      playerEnergy = Math.min(100, playerEnergy + 16);
    } else if (slot === 'q') {
      playerEnergy = Math.min(100, playerEnergy + 22);
    }
    registerComboHit(2, '🎯 KESKİN İSABET!');
    updateCombatHUD();
  }

  function applyTargetGroundSkillshotDamage(opts) {
    const now = performance.now();
    const tx = opts.tx;
    const tz = opts.tz;
    const radius = opts.radius || 5.0;
    const sweetspotRadius = opts.sweetspotRadius || (radius * 0.38);
    const elem = opts.element || getActivePlayerElement();
    const elemMeta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    const color = opts.color || elemMeta.color;
    const slot = opts.slot || 'e';

    const stats = getPlayerEffectiveStats();
    const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
    const penalty = getGsDifficultyMultiplier(stats.gearScore, zoneConf.reqGS);

    createShockwaveRing(tx, tz, radius, color);
    createShockwaveRing(tx, tz, sweetspotRadius, 0xffffff);

    let hitCount = 0;
    let sweetspotTriggered = false;

    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const dx = mob.x - tx;
      const dz = mob.z - tz;
      const dist = Math.hypot(dx, dz);

      if (dist <= radius) {
        hitCount++;
        const isSweetspot = dist <= sweetspotRadius;
        const isCrit = isSweetspot || (now < perfectDodgeBuffUntil) || (Math.random() < (stats.crit / 100) + 0.15);

        let dmg = opts.baseDmg || 240;
        if (companionBuffs.active) dmg = Math.round(dmg * companionBuffs.dmgMult);
        if (dungeonState.viewerBuffActive && now < dungeonState.viewerBuffUntil) dmg = Math.round(dmg * 1.25);
        if (isCrit) dmg = Math.round(dmg * Math.max(1.35, stats.critDmg / 100));
        if (isSweetspot) dmg = Math.round(dmg * 1.35);
        if (mob.staggeredUntil && now < mob.staggeredUntil) dmg = Math.round(dmg * 1.5);

        const isGlance = penalty.glanceChance > 0 && Math.random() < penalty.glanceChance;
        if (isGlance) {
          dmg = Math.floor(Math.random() * 2);
        } else {
          const react = applyElementAndTriggerReaction(mob, elem, dmg, now);
          dmg = Math.max(1, Math.round(dmg * react.mult * penalty.damageMult));
        }
        if (mob.isBoss && dungeonState.active && dungeonState.phase2ShieldActive) {
          dmg = Math.max(1, Math.round(dmg * 0.1));
        }

        if (penalty.poiseBreakable !== false) {
          applyPoiseDamage(mob, (opts.poiseDmg || 35) * (isSweetspot ? 1.4 : 1.0), now);
        }

        mob.hp = Math.max(0, mob.hp - dmg);
        notifyDungeonMobHit(mob, dmg, isCrit || isSweetspot, elem);
        if (mob.hpFillMesh) {
          const ratio = Math.max(0.001, mob.hp / mob.maxHP);
          mob.hpFillMesh.scale.x = ratio;
          mob.hpFillMesh.position.x = -((1 - ratio) * mob.hpFillBaseWidth) / 2;
        }
        mob.flashTimer = 0.22;

        if (opts.pullToCenter && dist > 0.35) {
          mob.knockbackVx = -(dx / dist) * 7.5;
          mob.knockbackVz = -(dz / dist) * 7.5;
        } else {
          const nDist = dist || 1;
          const kbForce = (penalty.poiseBreakable === false ? 0.3 : 7.5) / (mob.isBoss ? 2.5 : 1.0);
          mob.knockbackVx = (dx / nDist) * kbForce;
          mob.knockbackVz = (dz / nDist) * kbForce;
        }

        if (opts.petrifyDuration && mob.hp > 0 && penalty.poiseBreakable !== false) {
          mob.isPetrified = true;
          mob.petrifyUntil = now + opts.petrifyDuration;
          mob.mesh.traverse(child => {
            if (child.isMesh && !child.userData.isOutline && child.material && child.material.emissive) {
              child.material.emissive.setHex(0xca8a04);
            }
          });
          showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.45, z: mob.z }, '🪨 TAŞLAŞTI!', 'crit');
        }

        if (isGlance) {
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🛡️ SEKTİ! (${dmg})`, 'glance');
          playBeep(260, 'sine', 0.08);
        } else {
          showDamageNumber(
            { x: mob.x, y: mob.y + mob.height, z: mob.z },
            `${opts.label || elemMeta.emoji} ${dmg}`,
            isCrit ? 'crit' : 'normal'
          );
        }

        if (isSweetspot && !sweetspotTriggered) {
          sweetspotTriggered = true;
          triggerSweetspotReward(mob, slot, now);
        }

        if (mob.hp <= 0) defeatMob(mob);
      }
    }

    if (hitCount > 0) {
      registerComboHit(hitCount);
      playPunchyHitSound(true);
      if (slot !== 'q') {
        playerEnergy = Math.min(100, playerEnergy + 14);
      }
      updateCombatHUD();
    }
  }

  function spawnLinearWaveSkillshot(opts) {
    const angle = opts.angle ?? myPlayer.rot;
    const elem = opts.element || getActivePlayerElement();
    const elemMeta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    const color = opts.color || elemMeta.color;
    const accentColor = opts.accentColor || 0xffffff;
    const width = opts.width || 3.4;
    const maxDist = opts.maxDist || 12.0;
    const speed = opts.speed || 22.0;

    const waveGroup = new THREE.Group();

    // 1. Primary Glowing Crescent Wave Blade
    const arcGeo = new THREE.RingGeometry(width * 0.35, width * 0.65, 24, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const arcMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94
    });
    const arcMesh = new THREE.Mesh(arcGeo, arcMat);
    arcMesh.rotation.x = -Math.PI / 2;
    arcMesh.rotation.z = -Math.PI / 2;
    arcMesh.position.y = 1.05;
    waveGroup.add(arcMesh);

    // 2. Inner White-Hot Plasma Core Arc
    const coreGeo = new THREE.RingGeometry(width * 0.42, width * 0.56, 20, 1, -Math.PI * 0.4, Math.PI * 0.8);
    const coreMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.rotation.x = -Math.PI / 2;
    coreMesh.rotation.z = -Math.PI / 2;
    coreMesh.position.y = 1.08;
    waveGroup.add(coreMesh);

    // 3. Vertical Energy Fin / Dragon Spine
    const finGeo = new THREE.ConeGeometry(width * 0.28, width * 1.15, 6);
    const finMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 });
    const finMesh = new THREE.Mesh(finGeo, finMat);
    finMesh.rotation.x = Math.PI / 2;
    finMesh.position.set(0, 1.1, 0.35);
    waveGroup.add(finMesh);

    // 4. Dynamic PointLight riding the skillshot wave
    const waveLight = new THREE.PointLight(color, 1.4, 8, 2);
    waveLight.position.set(0, 1.2, 0);
    waveGroup.add(waveLight);

    const startX = opts.x ?? (myPlayer.x + Math.sin(angle) * 1.1);
    const startZ = opts.z ?? (myPlayer.z + Math.cos(angle) * 1.1);
    waveGroup.position.set(startX, 0, startZ);
    waveGroup.rotation.y = angle;
    worldObjects.add(waveGroup);

    activeSkillshots.push({
      type: 'linear_wave',
      slot: opts.slot || 'r',
      mesh: waveGroup,
      x: startX,
      z: startZ,
      startX,
      startZ,
      angle,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      speed,
      traveled: 0,
      maxDist,
      width,
      element: elem,
      color,
      accentColor,
      baseDmg: opts.baseDmg || 220,
      poiseDmg: opts.poiseDmg || 38,
      label: opts.label || `${elemMeta.emoji}`,
      leaveLightningWake: !!opts.leaveLightningWake,
      lastWakeDist: 0,
      hitMobs: new Set(),
      sweetspotTriggered: false
    });
  }

  function spawnArcaneOrbToTargetSkillshot(opts) {
    const elem = opts.element || getActivePlayerElement();
    const elemMeta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    const color = opts.color || elemMeta.color;

    const startX = opts.startX ?? myPlayer.x;
    const startY = opts.startY ?? 1.6;
    const startZ = opts.startZ ?? myPlayer.z;
    const tx = opts.tx ?? myPlayer.x;
    const tz = opts.tz ?? myPlayer.z;

    const orbGroup = new THREE.Group();
    const coreRadius = opts.isMeteor ? 1.85 : (opts.isUltimate ? 1.25 : 0.62);

    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(coreRadius, 1),
      new THREE.MeshBasicMaterial({ color })
    );
    orbGroup.add(core);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(coreRadius * 1.38, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.78 })
    );
    orbGroup.add(shell);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(coreRadius * 1.65, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    orbGroup.add(ring);

    const oLight = new THREE.PointLight(color, 1.6, 12, 2);
    orbGroup.add(oLight);

    orbGroup.position.set(startX, startY, startZ);
    worldObjects.add(orbGroup);

    // Ground Target Rune Seal showing where the skillshot will land
    const sealGroup = new THREE.Group();
    const rad = opts.radius || 5.0;
    const sweetRad = opts.sweetspotRadius || (rad * 0.38);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(rad - 0.18, rad, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.82 })
    );
    outerRing.rotation.x = -Math.PI / 2;
    sealGroup.add(outerRing);

    const sweetRing = new THREE.Mesh(
      new THREE.RingGeometry(sweetRad - 0.12, sweetRad, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    sweetRing.rotation.x = -Math.PI / 2;
    sealGroup.add(sweetRing);

    sealGroup.position.set(tx, 0.05, tz);
    worldObjects.add(sealGroup);

    const dist = Math.hypot(tx - startX, tz - startZ);
    const flightDuration = opts.isMeteor ? 0.46 : (opts.isUltimate ? 0.42 : Math.max(0.24, Math.min(0.48, dist / 28.0)));

    activeSkillshots.push({
      type: 'target_orb',
      slot: opts.slot || 'e',
      mesh: orbGroup,
      sealMesh: sealGroup,
      shell,
      ring,
      startX,
      startY,
      startZ,
      tx,
      tz,
      elapsed: 0,
      duration: flightDuration,
      arcHeight: opts.isMeteor || opts.isUltimate ? 0 : Math.max(2.2, dist * 0.28),
      radius: rad,
      sweetspotRadius: sweetRad,
      element: elem,
      color,
      baseDmg: opts.baseDmg || 240,
      poiseDmg: opts.poiseDmg || 38,
      pullToCenter: !!opts.pullToCenter,
      spawnVortexOnHit: !!opts.spawnVortexOnHit,
      petrifyDuration: opts.petrifyDuration || 0,
      label: opts.label || `${elemMeta.emoji} PATLAMA!`
    });
  }

  function spawnHydroSwordRainSkillshot(tx, tz, elem = 'Hydro', baseDmg = 450, label = '💧 KILIÇ YAĞMURU!') {
    const color = 0x38bdf8;
    // Overhead celestial portal ring
    const skyPortal = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 4.8, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    skyPortal.rotation.x = -Math.PI / 2;
    skyPortal.position.set(tx, 10.5, tz);
    worldObjects.add(skyPortal);

    // Spawn 14 descending glowing greatswords into the target zone
    const swords = [];
    for (let i = 0; i < 14; i++) {
      const sGroup = new THREE.Group();
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 2.4, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x38bdf8 : 0xe0f2fe })
      );
      blade.rotation.x = Math.PI; // Point tip downward
      sGroup.add(blade);

      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.12, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      guard.position.y = 0.9;
      sGroup.add(guard);

      const ang = (i / 14) * Math.PI * 2 + (Math.random() * 0.3);
      const rad = i === 0 ? 0 : (0.6 + (i % 4) * 1.15);
      const sx = tx + Math.cos(ang) * rad;
      const sz = tz + Math.sin(ang) * rad;
      const startY = 10.5 + i * 0.55;
      sGroup.position.set(sx, startY, sz);
      worldObjects.add(sGroup);
      swords.push({ mesh: sGroup, x: sx, z: sz, y: startY, impacted: false });
    }

    activeSkillshots.push({
      type: 'sword_rain',
      slot: 'q',
      skyPortal,
      swords,
      tx,
      tz,
      elapsed: 0,
      duration: 0.65,
      damageDealt: false,
      radius: 6.2,
      sweetspotRadius: 2.3,
      element: elem,
      color,
      baseDmg,
      label
    });
  }

  function getSkillshotPreviewSpec(slot) {
    const compCfg = getCompanionConfig(myCompanion);
    const elem = getActivePlayerElement();
    const elemMeta = ELEMENT_META[elem] || ELEMENT_META.Pyro;
    const color = (compCfg && compCfg.color) || elemMeta.color;

    if (slot === 'r') {
      return { shape: 'line', range: 11.5, width: 3.4, color, elem };
    }
    if (slot === 'e') {
      if (myCompanion === 'Hu Tao' || elem === 'Pyro' || elem === 'Electro' || elem === 'Cryo') {
        return { shape: 'line', range: 13.0, width: 3.2, color, elem };
      }
      return { shape: 'circle', range: 13.0, radius: 5.0, sweetRadius: 1.9, color, elem };
    }
    // slot === 'q'
    if (myCompanion === 'Raiden Shogun' || myCompanion === 'Kuki Shinobu' || myCompanion === 'Hu Tao') {
      return { shape: 'line', range: 16.0, width: 4.5, color, elem };
    }
    return { shape: 'circle', range: 15.0, radius: 7.2, sweetRadius: 2.5, color, elem };
  }

  function clearSkillshotAimIndicatorMesh() {
    if (skillAimIndicatorGroup) {
      worldObjects.remove(skillAimIndicatorGroup);
      skillAimIndicatorGroup = null;
    }
  }

  function startSkillshotAim(slot) {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();

    if (slot === 'r') {
      if (now < heavyAttackCooldownEndTime) return;
      if (playerStamina < 25) {
        playBeep(200, 'sawtooth', 0.12);
        showDamageNumber({ x: myPlayer.x, y: 2.1, z: myPlayer.z }, '⚠️ STAMINA YETERSİZ!', 'glance');
        return;
      }
    } else if (slot === 'e') {
      if (now < vortexCooldownEndTime) return;
    } else if (slot === 'q') {
      if (playerEnergy < 100) {
        playBeep(220, 'sawtooth', 0.15);
        showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, '⚡ ENERJİ YETERSİZ!', 'normal');
        return;
      }
    }

    const spec = getSkillshotPreviewSpec(slot);
    activeSkillAimState = {
      slot,
      startTime: now,
      spec
    };
    updateSkillshotAimIndicator(now);
  }

  function updateSkillshotAimIndicator(now) {
    if (!activeSkillAimState || !isBattleZone(currentMap)) {
      clearSkillshotAimIndicatorMesh();
      return;
    }

    const spec = activeSkillAimState.spec;
    const aim = getCombatAimAngleAndTarget(true, spec.range);
    activeSkillAimState.lastAim = aim;

    if (!skillAimIndicatorGroup || skillAimIndicatorGroup.userData.slot !== activeSkillAimState.slot) {
      clearSkillshotAimIndicatorMesh();
      const group = new THREE.Group();
      group.userData.slot = activeSkillAimState.slot;

      if (spec.shape === 'line') {
        const len = spec.range;
        const w = spec.width;

        // Corridor floor plane
        const planeGeo = new THREE.PlaneGeometry(w, len);
        planeGeo.translate(0, len / 2, 0);
        const planeMat = new THREE.MeshBasicMaterial({
          color: spec.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.24
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        group.add(plane);

        // Center Sweetspot Spine Line
        const spineGeo = new THREE.PlaneGeometry(w * 0.28, len);
        spineGeo.translate(0, len / 2, 0);
        const spineMat = new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55
        });
        const spine = new THREE.Mesh(spineGeo, spineMat);
        spine.rotation.x = -Math.PI / 2;
        spine.position.y = 0.01;
        group.add(spine);

        // Arrowhead Tip at the end of the corridor
        const tipGeo = new THREE.RingGeometry(w * 0.32, w * 0.58, 3);
        const tipMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85
        });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.rotation.x = -Math.PI / 2;
        tip.position.set(0, 0.02, len - 0.4);
        group.add(tip);
      } else {
        // Ground Target Arcane Rune Circle + Bullseye Sweetspot
        const rad = spec.radius || 5.0;
        const sweet = spec.sweetRadius || 1.9;

        const outer = new THREE.Mesh(
          new THREE.RingGeometry(rad - 0.22, rad, 36),
          new THREE.MeshBasicMaterial({ color: spec.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        outer.rotation.x = -Math.PI / 2;
        group.add(outer);

        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(rad, 32),
          new THREE.MeshBasicMaterial({ color: spec.color, side: THREE.DoubleSide, transparent: true, opacity: 0.18 })
        );
        fill.rotation.x = -Math.PI / 2;
        group.add(fill);

        const bullseye = new THREE.Mesh(
          new THREE.RingGeometry(sweet - 0.14, sweet, 24),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
        );
        bullseye.rotation.x = -Math.PI / 2;
        bullseye.position.y = 0.01;
        group.add(bullseye);
      }

      group.position.y = 0.06;
      worldObjects.add(group);
      skillAimIndicatorGroup = group;
    }

    if (spec.shape === 'line') {
      skillAimIndicatorGroup.position.set(myPlayer.x, 0.06, myPlayer.z);
      skillAimIndicatorGroup.rotation.y = aim.angle;
    } else {
      skillAimIndicatorGroup.position.set(aim.targetPos.x, 0.06, aim.targetPos.z);
      skillAimIndicatorGroup.rotation.y = now * 0.0025;
    }
  }

  function releaseSkillshotAim(slot) {
    if (!activeSkillAimState || activeSkillAimState.slot !== slot) return;
    const aim = activeSkillAimState.lastAim || getCombatAimAngleAndTarget(true, activeSkillAimState.spec.range);
    activeSkillAimState = null;
    clearSkillshotAimIndicatorMesh();

    if (slot === 'r') {
      performHeavyAttack(aim);
    } else if (slot === 'e') {
      performVortexSkill(aim);
    } else if (slot === 'q') {
      performBurstSkill(aim);
    }
  }

  function cancelSkillshotAim() {
    if (!activeSkillAimState) return false;
    activeSkillAimState = null;
    clearSkillshotAimIndicatorMesh();
    playBeep(240, 'sine', 0.08);
    showDamageNumber({ x: myPlayer.x, y: 2.1, z: myPlayer.z }, '✖ NİŞAN İPTAL EDİLDİ', 'glance');
    return true;
  }

  function registerComboHit(hits = 1, reactionLabel = null) {
    const now = performance.now();
    if (now > combatComboExpireTime) {
      combatComboHits = 0;
    }
    combatComboHits += hits;
    combatComboExpireTime = now + 4500;
    if (reactionLabel) {
      lastReactionText = reactionLabel;
      lastReactionExpireTime = now + 2200;
    }
  }

  function updateMobAuraVisual(mob) {
    if (!mob || !mob.auraMesh) return;
    const now = performance.now();
    if (mob.elementalAura && now < mob.elementalAura.expiresAt) {
      const meta = ELEMENT_META[mob.elementalAura.element] || ELEMENT_META.Pyro;
      mob.auraMesh.visible = true;
      mob.auraMesh.material.color.setHex(meta.color);
    } else {
      mob.elementalAura = null;
      mob.auraMesh.visible = false;
    }
  }

  function applyPoiseDamage(mob, poiseDmg, now) {
    if (!mob || mob.isDead) return false;
    if (mob.staggeredUntil && now < mob.staggeredUntil) return true;

    mob.poise = Math.max(0, (mob.poise ?? mob.maxPoise ?? 30) - poiseDmg);
    if (mob.poise <= 0) {
      mob.staggeredUntil = now + (mob.isBoss ? 4200 : 2800);
      mob.isAttacking = false;
      mob.isLeaping = false;
      createShockwaveRing(mob.x, mob.z, mob.isBoss ? 5.5 : 3.2, 0xfacc15);
      showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.5, z: mob.z }, '💫 DENGE KIRILDI! (%150 HASAR)', 'crit');
      playBeep(196, 'sawtooth', 0.25);
      hitStopEndTime = now + 65;
      screenShakeTimer = 0.22;
      screenShakeMagnitude = 0.38;
      return true;
    }
    return false;
  }

  function applyElementAndTriggerReaction(mob, incomingElem, baseDmg, now) {
    if (!mob || mob.isDead || !incomingElem) return { mult: 1.0, reactionText: null };

    // Clean expired aura
    if (mob.elementalAura && now > mob.elementalAura.expiresAt) {
      mob.elementalAura = null;
    }

    if (!mob.elementalAura || mob.elementalAura.element === incomingElem) {
      if (!mob.elementalAura || mob.elementalAura.expiresAt !== Infinity) {
        mob.elementalAura = { element: incomingElem, expiresAt: now + 9000 };
      }
      updateMobAuraVisual(mob);
      return { mult: 1.0, reactionText: null };
    }

    const existing = mob.elementalAura.element;
    const pair = new Set([existing, incomingElem]);
    let mult = 1.25;
    let reactionName = '';
    let reactionColor = 0xf97316;

    if (pair.has('Pyro') && pair.has('Hydro')) {
      mult = 2.0;
      reactionName = '🔥💧 BUHARLAŞMA x2.0!';
      reactionColor = 0x38bdf8;
      createShockwaveRing(mob.x, mob.z, 3.6, reactionColor);
    } else if (pair.has('Pyro') && pair.has('Cryo')) {
      mult = 2.0;
      reactionName = '🔥❄️ ERİME x2.0!';
      reactionColor = 0xfacc15;
      createShockwaveRing(mob.x, mob.z, 3.8, reactionColor);
    } else if (pair.has('Pyro') && pair.has('Electro')) {
      mult = 1.5;
      reactionName = '🔥⚡ AŞIRI YÜK (PATLAMA)!';
      reactionColor = 0xef4444;
      createShockwaveRing(mob.x, mob.z, 5.2, reactionColor);
      applyPoiseDamage(mob, 35, now);
      // AoE Overload Splash to nearby mobs
      for (const other of activeCombatMobs) {
        if (other !== mob && !other.isDead && Math.hypot(other.x - mob.x, other.z - mob.z) <= 4.8) {
          const splash = Math.round(baseDmg * 0.65);
          other.hp = Math.max(0, other.hp - splash);
          other.knockbackVx = ((other.x - mob.x) || 0.5) * 3.5;
          other.knockbackVz = ((other.z - mob.z) || 0.5) * 3.5;
          showDamageNumber({ x: other.x, y: other.y + other.height, z: other.z }, `💥 ${splash}`, 'reaction');
          if (other.hp <= 0) defeatMob(other);
        }
      }
    } else if (pair.has('Hydro') && pair.has('Electro')) {
      mult = 1.4;
      reactionName = '💧⚡ ELEKTRO-ŞARJ!';
      reactionColor = 0xa855f7;
      createElectroSlashVFX(mob.x, mob.y + 1.0, mob.z);
      // Chain lightning to up to 2 nearby mobs
      let chained = 0;
      for (const other of activeCombatMobs) {
        if (other !== mob && !other.isDead && chained < 2 && Math.hypot(other.x - mob.x, other.z - mob.z) <= 6.5) {
          chained++;
          const arcDmg = Math.round(baseDmg * 0.55);
          other.hp = Math.max(0, other.hp - arcDmg);
          createElectroSlashVFX(other.x, other.y + 1.0, other.z);
          showDamageNumber({ x: other.x, y: other.y + other.height, z: other.z }, `⚡ ${arcDmg}`, 'reaction');
          if (other.hp <= 0) defeatMob(other);
        }
      }
    } else if (pair.has('Hydro') && pair.has('Cryo')) {
      mult = 1.3;
      reactionName = '❄️💧 DONMA (STUN)!';
      reactionColor = 0x67e8f9;
      mob.staggeredUntil = Math.max(mob.staggeredUntil || 0, now + 2600);
      mob.isAttacking = false;
      createShockwaveRing(mob.x, mob.z, 3.2, reactionColor);
    } else if (incomingElem === 'Anemo' || existing === 'Anemo') {
      const swirledElem = incomingElem === 'Anemo' ? existing : incomingElem;
      mult = 1.45;
      reactionName = `🍃 GİRDAP (${swirledElem})!`;
      reactionColor = 0x34d399;
      createShockwaveRing(mob.x, mob.z, 5.5, reactionColor);
      for (const other of activeCombatMobs) {
        if (other !== mob && !other.isDead && Math.hypot(other.x - mob.x, other.z - mob.z) <= 5.5) {
          other.elementalAura = { element: swirledElem, expiresAt: now + 8000 };
          updateMobAuraVisual(other);
          const swDmg = Math.round(baseDmg * 0.5);
          other.hp = Math.max(0, other.hp - swDmg);
          showDamageNumber({ x: other.x, y: other.y + other.height, z: other.z }, `🍃 ${swDmg}`, 'reaction');
          if (other.hp <= 0) defeatMob(other);
        }
      }
    } else if (incomingElem === 'Geo' || existing === 'Geo') {
      mult = 1.3;
      reactionName = '🪨 KRİSTALLEŞME (+KALKAN)!';
      reactionColor = 0xfacc15;
      applyJadeShield(120);
      createShockwaveRing(mob.x, mob.z, 3.4, reactionColor);
    } else {
      mult = 1.45;
      reactionName = `✨ ELEMENT REAKSİYONU!`;
      createShockwaveRing(mob.x, mob.z, 3.4, reactionColor);
    }

    // Consume aura unless it's an innate elemental slime
    if (mob.elementalAura && mob.elementalAura.expiresAt !== Infinity) {
      mob.elementalAura = null;
    }
    updateMobAuraVisual(mob);

    showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.55, z: mob.z }, reactionName, 'reaction');
    registerComboHit(0, reactionName);
    return { mult, reactionText: reactionName };
  }

  function spawnCombatProjectile(opts) {
    const color = opts.color || 0xf97316;
    const radius = opts.radius || 0.28;
    const pGroup = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    pGroup.add(core);

    const halo = new THREE.Mesh(
      new THREE.OctahedronGeometry(radius * 1.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.65 })
    );
    pGroup.add(halo);

    pGroup.position.set(opts.x, opts.y || 1.2, opts.z);
    worldObjects.add(pGroup);

    activeProjectiles.push({
      mesh: pGroup,
      halo,
      x: opts.x,
      y: opts.y || 1.2,
      z: opts.z,
      vx: opts.vx || 0,
      vz: opts.vz || 0,
      speed: opts.speed || 11.5,
      homing: !!opts.homing,
      fromPlayer: !!opts.fromPlayer,
      element: opts.element || 'Pyro',
      dmg: opts.dmg || 25,
      mobName: opts.mobName || 'Büyücü',
      birthTime: performance.now(),
      life: opts.life || 2800
    });
  }

  function triggerPvPAttackScan(actionType, hitRadius = 4.2, hitAngle = null, maxAngleDiff = Math.PI) {
    if (currentMap !== 'pvp_arena') return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    // Attacker must be inside or on the edge of the pit (r <= 18.2)
    const myDist = Math.hypot(myPlayer.x, myPlayer.z);
    if (myDist > 18.2) {
      showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, '🛡️ TRİBÜNDESİN! Kum Çukuruna İn', 'glance');
      return;
    }

    const playerElem = getActivePlayerElement();
    let hits = 0;

    for (const [id, entry] of otherPlayers.entries()) {
      if (!entry.mesh || !entry.data) continue;
      const ox = entry.mesh.position.x;
      const oz = entry.mesh.position.z;

      // Target must also be in the fighting pit (r <= 18.2)
      const targetDistFromCenter = Math.hypot(ox, oz);
      if (targetDistFromCenter > 18.2) continue;

      const dx = ox - myPlayer.x;
      const dz = oz - myPlayer.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= hitRadius) {
        if (hitAngle !== null && maxAngleDiff < Math.PI) {
          const targetAngle = Math.atan2(dx, dz);
          let diff = Math.abs(targetAngle - hitAngle);
          while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
          if (diff > maxAngleDiff) continue;
        }

        hits++;
        socket.send(JSON.stringify({
          type: 'PVP_PLAYER_HIT',
          targetSocketId: entry.data.id || id,
          action: actionType,
          element: playerElem
        }));

        createSlashArcMesh(ox, oz, myPlayer.rot, 2, 0xf59e0b);
        registerComboHit(1);
        playPunchyHitSound(true);
      }
    }
    if (hits > 0) {
      screenShakeTimer = 0.12;
      screenShakeMagnitude = 0.22;
      playerEnergy = Math.min(100, playerEnergy + 8);
      updateCombatHUD();
    }
  }

  function performAttack() {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();

    const stats = getPlayerEffectiveStats();
    const hasteFactor = 1 - Math.min(0.4, (stats.haste / 100) * 0.5);
    const attackCd = Math.round(210 * hasteFactor);

    if (now - lastAttackTime < attackCd) return;

    if (now - lastAttackTime > 1050) {
      attackComboIndex = 0;
    }
    // 4-Stage Dynamic Combo (1 -> 2 -> 3 Spin -> 4 Elemental Slam Finisher)
    attackComboIndex = (attackComboIndex % 4) + 1;
    lastAttackTime = now;
    isAttacking = true;
    setTimeout(() => { isAttacking = false; }, 220);

    const step = attackComboIndex;
    playSlashSound(step);

    // 1. Aim directly toward True Mouse Cursor
    const aim = getCombatAimAngleAndTarget(true, 10.0);
    myPlayer.rot = aim.angle;
    if (myMesh) {
      myMesh.rotation.y = myPlayer.rot;
      triggerRigCombatAction(myMesh, `combo${step}`, step === 4 ? 360 : 250);
    }

    // 2. Forward Combat Lunge (Micro step toward cursor so combat feels fluid)
    const lungeDist = step === 4 ? 0.65 : 0.34;
    const lungeBounds = getCombatZoneBounds(currentMap);
    myPlayer.x = Math.max(lungeBounds.minX, Math.min(lungeBounds.maxX, myPlayer.x + Math.sin(myPlayer.rot) * lungeDist));
    myPlayer.z = Math.max(lungeBounds.minZ, Math.min(lungeBounds.maxZ, myPlayer.z + Math.cos(myPlayer.rot) * lungeDist));
    if (myMesh) {
      myMesh.position.x = myPlayer.x;
      myMesh.position.z = myPlayer.z;
    }

    // 3. Elemental Slash Arc Visual & Multiplayer Broadcast
    const compCfg = getCompanionConfig(myCompanion);
    const playerElem = getActivePlayerElement();
    const elemMeta = ELEMENT_META[playerElem] || ELEMENT_META.Pyro;
    const customSlashColor = step === 4
      ? elemMeta.color
      : (compCfg && compCfg.slashColors ? compCfg.slashColors[(step - 1) % compCfg.slashColors.length] : null);
    createSlashArcMesh(myPlayer.x, myPlayer.z, myPlayer.rot, step, customSlashColor);
    if (step === 4) {
      createShockwaveRing(
        myPlayer.x + Math.sin(myPlayer.rot) * 1.4,
        myPlayer.z + Math.cos(myPlayer.rot) * 1.4,
        4.2,
        elemMeta.color
      );
    }
    broadcastCombatAction('attack', step, playerElem);

    // 4. Hit Detection & Damage Calculation
    const playerAtk = stats.atk;
    const hasPerfectDodge = now < perfectDodgeBuffUntil;
    const playerCritRate = hasPerfectDodge ? 1.0 : (stats.crit / 100);
    const playerCritMult = (stats.critDmg / 100) * (hasPerfectDodge ? 1.35 : 1.0);
    if (hasPerfectDodge) perfectDodgeBuffUntil = 0;

    const comboMultipliers = { 1: 1.55, 2: 2.1, 3: 2.85, 4: 4.35 };
    let baseDmg = Math.round(playerAtk * (comboMultipliers[step] || 1.6));
    if (companionBuffs.active) {
      baseDmg = Math.round(baseDmg * companionBuffs.dmgMult);
    }

    const hitRadius = step >= 3 ? 4.8 : 3.8;
    const poiseDmg = step === 4 ? 26 : (step === 3 ? 16 : 9);
    let hitCount = 0;
    let anyCrit = false;

    const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
    const penalty = getGsDifficultyMultiplier(stats.gearScore, zoneConf.reqGS);

    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const dx = mob.x - myPlayer.x;
      const dz = mob.z - myPlayer.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= hitRadius) {
        if (step < 3) {
          const mobAngle = Math.atan2(dx, dz);
          let diff = Math.abs(mobAngle - myPlayer.rot);
          while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
          if (diff > 1.35) continue;
        }

        hitCount++;
        const isCrit = Math.random() < playerCritRate;
        if (isCrit) anyCrit = true;
        let finalDmg = isCrit ? Math.round(baseDmg * playerCritMult) : baseDmg;

        if (dungeonState.viewerBuffActive && now < dungeonState.viewerBuffUntil) {
          finalDmg = Math.round(finalDmg * 1.25);
        }

        // Staggered vulnerability bonus (+50% DMG!)
        if (mob.staggeredUntil && now < mob.staggeredUntil) {
          finalDmg = Math.round(finalDmg * 1.5);
        }

        // Step 4 Finisher infuses Element & triggers Elemental Reactions!
        if (step === 4) {
          const react = applyElementAndTriggerReaction(mob, playerElem, finalDmg, now);
          finalDmg = Math.round(finalDmg * react.mult);
        }

        // Poise / Stagger Damage (Undergeared players cannot stagger enemies)
        if (penalty.poiseBreakable !== false) {
          applyPoiseDamage(mob, poiseDmg, now);
        }

        // GS Glance check
        const isGlance = penalty.glanceChance > 0 && Math.random() < penalty.glanceChance;
        if (isGlance) {
          finalDmg = Math.floor(Math.random() * 2); // 0 or 1 scratch damage
          isCrit = false;
        } else {
          finalDmg = Math.max(1, Math.round(finalDmg * penalty.damageMult));
        }

        // Aion 2 Boss Phase 2 Aether Crystal Shield (-90% DMG until 3 Crystals Destroyed!)
        if (mob.isBoss && dungeonState.active && dungeonState.phase2ShieldActive) {
          finalDmg = Math.max(1, Math.round(finalDmg * 0.1));
          showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.5, z: mob.z }, `🔮 AETHER KALKANI! (${finalDmg})`, 'glance');
        }

        mob.hp = Math.max(0, mob.hp - finalDmg);
        if (isDungeonMap(currentMap) && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'DUNGEON_MOB_HIT',
            instanceId: currentMap,
            mobId: mob.id,
            dmg: finalDmg,
            isCrit: Boolean(isCrit),
            element: step === 4 ? playerElem : null
          }));
        }
        if (mob.hpFillMesh) {
          const ratio = Math.max(0.001, mob.hp / mob.maxHP);
          mob.hpFillMesh.scale.x = ratio;
          mob.hpFillMesh.position.x = -((1 - ratio) * mob.hpFillBaseWidth) / 2;
        }

        const kbForce = (penalty.poiseBreakable === false ? 0.3 : (step >= 3 ? 7.2 : 3.8)) / (mob.isBoss ? 2.8 : 1.0);
        const normX = dx / (dist || 1);
        const normZ = dz / (dist || 1);
        mob.knockbackVx = normX * kbForce;
        mob.knockbackVz = normZ * kbForce;
        mob.flashTimer = 0.14;

        if (isGlance) {
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🛡️ SEKTİ! (${finalDmg})`, 'glance');
          playBeep(260, 'sine', 0.08);
          playBeep(180, 'square', 0.08);
        } else {
          const prefix = step === 4 ? `${elemMeta.emoji} ` : (isCrit ? '💥 CRIT! ' : '');
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `${prefix}${finalDmg}`, isCrit ? 'crit' : 'normal');
        }

        // Raiden Shogun Coordinated Electro Slash Proc
        if (activeElectroEyeMesh && now < electroEyeEndTime) {
          const electroBonus = 45;
          const react = applyElementAndTriggerReaction(mob, 'Electro', electroBonus, now);
          const eDmg = Math.round(electroBonus * react.mult);
          mob.hp = Math.max(0, mob.hp - eDmg);
          notifyDungeonMobHit(mob, eDmg, true, 'Electro');
          createElectroSlashVFX(mob.x, mob.y + 1.0, mob.z);
          showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.4, z: mob.z }, `⚡ +${eDmg} Electro`, 'crit');
        }

        // Lifesteal heal proc
        if (stats.lifesteal > 0 && finalDmg > 0 && hitCount === 1) {
          const healAmount = Math.max(1, Math.round(finalDmg * (stats.lifesteal / 100)));
          playerHP = Math.min(playerMaxHP, playerHP + healAmount);
          showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `+${healAmount} HP`, 'heal');
        }

        if (mob.hp <= 0) {
          defeatMob(mob);
        }
      }
    }

    if (hitCount > 0) {
      registerComboHit(hitCount);
      playPunchyHitSound(anyCrit || step === 4);
      screenShakeTimer = step >= 3 ? 0.14 : 0.07;
      screenShakeMagnitude = step === 4 ? 0.34 : (step === 3 ? 0.24 : 0.14);

      if (anyCrit || step === 4) {
        hitStopEndTime = now + (step === 4 ? 52 : 35);
      }

      const energyGain = step === 1 ? 7 : (step === 2 ? 10 : (step === 3 ? 14 : 20));
      playerEnergy = Math.min(100, playerEnergy + energyGain);
      playerStamina = Math.min(playerMaxStamina, playerStamina + 4);
      updateCombatHUD();
    }

    if (currentMap === 'pvp_arena') {
      const pvpRadius = step >= 3 ? 4.8 : 3.8;
      const pvpAngle = step < 3 ? myPlayer.rot : null;
      const pvpMaxDiff = step < 3 ? 1.35 : Math.PI;
      triggerPvPAttackScan(step, pvpRadius, pvpAngle, pvpMaxDiff);
    }
  }

  function getCombatAimAngleAndAngleTarget() {
    return getCombatAimAngleAndTarget(true);
  }

  function performHeavyAttack(aimOverride = null) {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (now < heavyAttackCooldownEndTime) return;

    if (playerStamina < 25) {
      playBeep(200, 'sawtooth', 0.12);
      showDamageNumber({ x: myPlayer.x, y: 2.1, z: myPlayer.z }, '⚠️ STAMINA YETERSİZ!', 'glance');
      return;
    }

    playerStamina = Math.max(0, playerStamina - 25);
    const stats = getPlayerEffectiveStats();
    const hasteFactor = 1 - Math.min(0.4, (stats.haste / 100) * 0.5);
    heavyAttackCooldownEndTime = now + Math.round(1400 * hasteFactor);
    lastAttackTime = now;

    // 100% True Skillshot Aim toward cursor
    const aim = aimOverride || getCombatAimAngleAndTarget(true, 11.5);
    myPlayer.rot = aim.angle;
    if (myMesh) {
      myMesh.rotation.y = myPlayer.rot;
      triggerRigCombatAction(myMesh, 'heavy', 480);
    }

    // Forward Heavy Martial Step
    const hBounds = getCombatZoneBounds(currentMap);
    myPlayer.x = Math.max(hBounds.minX, Math.min(hBounds.maxX, myPlayer.x + Math.sin(myPlayer.rot) * 0.85));
    myPlayer.z = Math.max(hBounds.minZ, Math.min(hBounds.maxZ, myPlayer.z + Math.cos(myPlayer.rot) * 0.85));
    if (myMesh) {
      myMesh.position.x = myPlayer.x;
      myMesh.position.z = myPlayer.z;
    }

    const playerElem = getActivePlayerElement();
    const elemMeta = ELEMENT_META[playerElem] || ELEMENT_META.Pyro;
    playSlashSound(4);
    createSlashArcMesh(myPlayer.x, myPlayer.z, myPlayer.rot, 4, elemMeta.color);
    broadcastCombatAction('heavy', 4, playerElem);

    if (currentMap === 'pvp_arena') {
      triggerPvPAttackScan('heavy', 5.5, myPlayer.rot, 1.25);
    }

    let baseDmg = Math.round(stats.atk * 3.85);
    if (companionBuffs.active) baseDmg = Math.round(baseDmg * companionBuffs.dmgMult);

    // Launch Piercing 3D Crescent Blade Wave Skillshot along cursor corridor!
    spawnLinearWaveSkillshot({
      slot: 'r',
      x: myPlayer.x + Math.sin(myPlayer.rot) * 1.1,
      z: myPlayer.z + Math.cos(myPlayer.rot) * 1.1,
      angle: myPlayer.rot,
      speed: 23.5,
      maxDist: 11.5,
      width: 3.4,
      element: playerElem,
      color: elemMeta.color,
      accentColor: 0xffffff,
      baseDmg,
      poiseDmg: 42,
      label: `🌙 ${elemMeta.emoji} HİLAL DALGASI!`
    });

    updateCombatHUD();
  }

  function performDash() {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (now < dashCooldownEndTime) return;
    if (playerStamina < 15) {
      showDamageNumber({ x: myPlayer.x, y: 2.0, z: myPlayer.z }, '⚠️ STAMINA YETERSİZ!', 'glance');
      return;
    }

    playerStamina = Math.max(0, playerStamina - 15);
    const stats = getPlayerEffectiveStats();
    const dashCd = Math.round(1100 * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
    dashCooldownEndTime = now + dashCd;
    isDashing = true;
    playerInvulnerableUntil = now + 360;
    playDashSound();

    // Check Perfect Dodge window (near active telegraph about to detonate or incoming projectile)
    let isPerfectDodge = false;
    for (const tg of activeTelegraphs) {
      const rem = tg.duration - (now - tg.startTime);
      if (rem > 0 && rem <= 380) {
        isPerfectDodge = true;
        break;
      }
    }
    if (!isPerfectDodge) {
      for (const proj of activeProjectiles) {
        if (!proj.fromPlayer && Math.hypot(proj.x - myPlayer.x, proj.z - myPlayer.z) < 3.6) {
          isPerfectDodge = true;
          break;
        }
      }
    }

    if (isPerfectDodge) {
      perfectDodgeBuffUntil = now + 4000;
      playerStamina = Math.min(playerMaxStamina, playerStamina + 25);
      playerEnergy = Math.min(100, playerEnergy + 15);
      hitStopEndTime = now + 45;
      showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, '⚡ MÜKEMMEL KAÇIŞ! (%100 CRIT)', 'crit');
      playBeep(880, 'triangle', 0.18);
    }

    if (myMesh) {
      triggerRigCombatAction(myMesh, 'dash', 240);
      createAfterimageGhost(myPlayer.x, myPlayer.z, myPlayer.rot);
    }
    broadcastCombatAction('dash', 1, getActivePlayerElement());

    setTimeout(() => {
      isDashing = false;
    }, 240);
    updateCombatHUD();
  }

  function performVortexSkill(aimOverride = null) {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (now < vortexCooldownEndTime) return;

    const aim = aimOverride || getCombatAimAngleAndTarget(true, 13.0);
    myPlayer.rot = aim.angle;
    if (myMesh) {
      myMesh.rotation.y = myPlayer.rot;
      triggerRigCombatAction(myMesh, 'skill', 560);
    }

    const stats = getPlayerEffectiveStats();
    const compCfg = getCompanionConfig(myCompanion);
    const elem = getActivePlayerElement();
    broadcastCombatAction('skill', 1, elem);

    if (currentMap === 'pvp_arena') {
      triggerPvPAttackScan('vortex', 7.5);
    }

    if (compCfg) {
      const baseCd = compCfg.eCooldown || 10000;
      const vortexCd = Math.round(baseCd * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
      vortexCooldownEndTime = now + vortexCd;
      compCfg.onE(myPlayer, aim);
      updateCombatHUD();
      return;
    }

    // Default Elemental Skillshot (No Companion): Launch Vacuum Vortex Orb to Aimed Cursor!
    const vortexCd = Math.round(6000 * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
    vortexCooldownEndTime = now + vortexCd;
    playVortexSound();

    spawnArcaneOrbToTargetSkillshot({
      slot: 'e',
      startX: myPlayer.x,
      startY: 1.8,
      startZ: myPlayer.z,
      tx: aim.targetPos.x,
      tz: aim.targetPos.z,
      radius: 5.2,
      sweetspotRadius: 1.9,
      element: 'Anemo',
      color: 0x38bdf8,
      baseDmg: 225,
      poiseDmg: 35,
      pullToCenter: true,
      spawnVortexOnHit: true,
      label: '🌪️ VAKUM GİRDABI!'
    });
    updateCombatHUD();
  }

  function performBurstSkill(aimOverride = null) {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (playerEnergy < 100) {
      playBeep(220, 'sawtooth', 0.15);
      showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, '⚡ ENERJİ YETERSİZ!', 'normal');
      return;
    }

    const aim = aimOverride || getCombatAimAngleAndTarget(true, 15.0);
    myPlayer.rot = aim.angle;
    if (myMesh) {
      myMesh.rotation.y = myPlayer.rot;
      triggerRigCombatAction(myMesh, 'burst', 740);
    }

    playerEnergy = 0;
    const elem = getActivePlayerElement();
    broadcastCombatAction('burst', 1, elem);
    updateCombatHUD();

    if (currentMap === 'pvp_arena') {
      triggerPvPAttackScan('burst', 9.5);
    }

    const compCfg = getCompanionConfig(myCompanion);
    if (compCfg) {
      compCfg.onQ(myPlayer, aim);
      return;
    }

    // Default Burst Skillshot (No Companion): Celestial Comet Cataclysm at Aimed Target!
    triggerUniversalElementalBurst(myPlayer, elem, aim);
  }

  function showLootToast(item) {
    const container = document.getElementById('loot-toast-container');
    if (!container) return;

    const pill = document.createElement('div');
    pill.className = `loot-toast-pill rarity-${item.rarity}`;
    pill.innerHTML = `
      <img src="${item.icon || '/assets/materials/slime_condensate.svg'}" alt="${item.name}">
      <div>
        <span class="loot-toast-name">${item.name}</span>
        <span class="loot-toast-rarity">${'⭐'.repeat(item.rarity)} (+${item.sellPrice} 💎)</span>
      </div>
    `;

    container.appendChild(pill);
    setTimeout(() => {
      pill.remove();
    }, 2500);
  }

  function defeatMob(mob) {
    if (mob.isDead) return;
    mob.isDead = true;
    if (lockedTargetMob === mob) lockedTargetMob = null;

    // Animated Death Topple & Dissolve Burst instead of instant vanish!
    if (mob.mesh) {
      createShockwaveRing(mob.x, mob.z, mob.isBoss ? 4.5 : 2.2, 0xfacc15);
      const dyingMesh = mob.mesh;
      if (mob.hpBarGroup) mob.hpBarGroup.visible = false;

      if (dyingMesh.userData && dyingMesh.userData.mobRig && dyingMesh.userData.mobRig.type === 'sprite') {
        const rig = dyingMesh.userData.mobRig;
        const deathCfg = rig.animTextures.death;
        if (deathCfg) {
          rig.material.map = deathCfg.texture;
          rig.material.needsUpdate = true;
        }
        const deathStart = performance.now();
        const deathDuration = 520;
        const deathAnim = () => {
          const el = performance.now() - deathStart;
          if (el >= deathDuration) {
            worldObjects.remove(dyingMesh);
          } else {
            const p = el / deathDuration;
            if (deathCfg) {
              const frame = Math.min(deathCfg.frames - 1, Math.floor(p * deathCfg.frames));
              deathCfg.texture.offset.x = frame / deathCfg.frames;
            }
            alignUprightBillboard(rig.mesh);
            if (p > 0.55) {
              rig.material.opacity = Math.max(0, 1 - (p - 0.55) / 0.45);
            }
            requestAnimationFrame(deathAnim);
          }
        };
        requestAnimationFrame(deathAnim);
      } else {
        const deathStart = performance.now();
        const deathAnim = () => {
          const el = performance.now() - deathStart;
          if (el >= 340) {
            worldObjects.remove(dyingMesh);
          } else {
            const p = el / 340;
            dyingMesh.rotation.x = p * (Math.PI / 2.2);
            dyingMesh.scale.multiplyScalar(0.94);
            requestAnimationFrame(deathAnim);
          }
        };
        requestAnimationFrame(deathAnim);
      }
    }

    const droppedItems = rollMobLoot(mob.type);

    droppedItems.forEach((item, idx) => {
      const angle = (idx / droppedItems.length) * Math.PI * 2 + Math.random() * 0.5;
      const rad = 0.8 + Math.random() * 0.8;
      const gx = mob.x + Math.cos(angle) * rad;
      const gz = mob.z + Math.sin(angle) * rad;

      const orbMesh = createLootOrbMesh(item.rarity);
      orbMesh.position.set(gx, 0.8, gz);
      worldObjects.add(orbMesh);

      activeDropGems.push({
        mesh: orbMesh,
        item: item,
        x: gx,
        y: 0.8,
        z: gz,
        spawnTime: performance.now(),
        vacuumDelay: 300 + idx * 100
      });
    });

    // Notify server of mob defeat for MMORPG XP & Equipment drops
    if (!mob.isCrystal && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_MOB_DEFEAT',
        mob: {
          name: mob.name,
          type: mob.type,
          level: mob.level || 1,
          isBoss: !!mob.isBoss,
          zoneId: currentMap,
          bossLootName: droppedItems.find(i => i.rarity === 5)?.name || droppedItems[0]?.name || 'Kadim Kaos Çekirdeği'
        }
      }));
    }

    if (isDungeonMap(currentMap) && dungeonState.active) {
      onDungeonMobDefeated(mob);
    }

    if (mob.isBoss) {
      playVictoryJingle();
      addChatMessage('⚔️ BOSS YENİLDİ', `👑 ${mob.name} yere serildi! Çantana değerli ganimetler saçıldı!`);
      if (!isDungeonMap(currentMap)) {
        bossRespawnTimer = performance.now() + 25000;
      }
    }
  }

  function updateCombatHUD() {
    const hpFill = document.getElementById('combat-hp-fill');
    const hpText = document.getElementById('combat-hp-text');
    const staminaFill = document.getElementById('combat-stamina-fill');
    const staminaText = document.getElementById('combat-stamina-text');
    const energyFill = document.getElementById('combat-energy-fill');
    const energyText = document.getElementById('combat-energy-text');
    const slotBurst = document.getElementById('slot-burst');

    if (myParty && socket && socket.readyState === WebSocket.OPEN) {
      if (typeof lastSyncedHP === 'undefined' || lastSyncedHP !== playerHP) {
        lastSyncedHP = playerHP;
        socket.send(JSON.stringify({
          type: 'PARTY_UPDATE_HP',
          hp: playerHP,
          maxHp: playerMaxHP
        }));
      }
      updatePartyMemberHpUI(myPlayer.id || socketId, playerHP, playerMaxHP);
    }

    if (hpFill) {
      const hpPct = Math.max(0, Math.min(100, (playerHP / playerMaxHP) * 100));
      hpFill.style.width = `${hpPct}%`;
      const hpGhost = document.getElementById('combat-hp-ghost');
      if (hpGhost) hpGhost.style.width = `${hpPct}%`;
    }
    if (hpText) {
      const shieldStr = activeJadeShieldHP > 0 ? ` (+${activeJadeShieldHP} 🛡️)` : '';
      hpText.textContent = `HP ${playerHP} / ${playerMaxHP}${shieldStr}`;
    }
    if (staminaFill) {
      const stPct = Math.max(0, Math.min(100, (playerStamina / playerMaxStamina) * 100));
      staminaFill.style.width = `${stPct}%`;
    }
    if (staminaText) {
      staminaText.textContent = `STAMINA: ${Math.round(playerStamina)} / ${playerMaxStamina}`;
    }
    if (energyFill) {
      energyFill.style.width = `${Math.min(100, playerEnergy)}%`;
    }
    if (energyText) {
      energyText.textContent = `ULTİ: %${Math.round(playerEnergy)}`;
    }
    if (slotBurst) {
      if (playerEnergy >= 100) {
        slotBurst.classList.add('burst-ready');
      } else {
        slotBurst.classList.remove('burst-ready');
      }
    }

    // Dynamic GearScore & Zone Difficulty Badge
    const gsTag = document.getElementById('combat-gs-tag');
    const gsStatus = document.getElementById('combat-gs-status');
    if (gsTag || gsStatus) {
      const stats = getPlayerEffectiveStats();
      const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
      const penalty = getGsDifficultyMultiplier(stats.gearScore, zoneConf.reqGS);
      if (gsTag) {
        gsTag.textContent = `GS ${stats.gearScore} / ${zoneConf.reqGS}`;
      }
      if (gsStatus) {
        gsStatus.textContent = penalty.label || '🛡️ UYGUN SEVİYE';
        gsStatus.className = `combat-gs-status ${penalty.status}`;
      }
    }

    const now = performance.now();
    const cdHeavy = document.getElementById('cd-heavy');
    if (cdHeavy) {
      if (now < heavyAttackCooldownEndTime) {
        const remaining = ((heavyAttackCooldownEndTime - now) / 1400) * 100;
        cdHeavy.style.height = `${ Math.min(100, remaining) }%`;
      } else {
        cdHeavy.style.height = '0%';
      }
    }

    const cdDash = document.getElementById('cd-dash');
    if (cdDash) {
      if (now < dashCooldownEndTime) {
        const remaining = ((dashCooldownEndTime - now) / 1100) * 100;
        cdDash.style.height = `${remaining}%`;
      } else {
        cdDash.style.height = '0%';
      }
    }

    const cdVortex = document.getElementById('cd-vortex');
    if (cdVortex) {
      const eCdMax = getCompanionSkillECD();
      if (now < vortexCooldownEndTime) {
        const remaining = ((vortexCooldownEndTime - now) / eCdMax) * 100;
        cdVortex.style.height = `${remaining}%`;
      } else {
        cdVortex.style.height = '0%';
      }
    }

    const cdBurst = document.getElementById('cd-burst');
    if (cdBurst) {
      if (playerEnergy < 100) {
        const remaining = (1 - playerEnergy / 100) * 100;
        cdBurst.style.height = `${remaining}%`;
      } else {
        cdBurst.style.height = '0%';
      }
    }

    // Companion HUD Header Badge & Skill Slots (Fixed DOM IDs matching world.html!)
    const compBadge = document.getElementById('combat-companion-badge');
    const compAvatar = document.getElementById('hud-companion-img') || document.getElementById('companion-hud-avatar');
    const compPlaceholder = document.getElementById('hud-companion-placeholder');
    const compElem = document.getElementById('hud-companion-element') || document.getElementById('companion-hud-elem');
    const compName = document.getElementById('hud-companion-name') || document.getElementById('companion-hud-name');
    const nameSlotSkill = document.getElementById('name-slot-skill');
    const iconSlotSkill = document.getElementById('icon-slot-skill');
    const nameSlotBurst = document.getElementById('name-slot-burst');
    const iconSlotBurst = document.getElementById('icon-slot-burst');

    const compCfg = getCompanionConfig(myCompanion);

    if (compBadge && myCompanion) {
      compBadge.classList.remove('hidden');
      if (compName) compName.textContent = myCompanion;
      if (compElem) compElem.textContent = (compCfg && compCfg.elementEmoji) || '✨';
      if (compAvatar && myCompanionData && myCompanionData.icon) {
        compAvatar.src = myCompanionData.icon;
        compAvatar.classList.remove('hidden');
        compAvatar.style.display = 'block';
        if (compPlaceholder) compPlaceholder.classList.add('hidden');
      }
    } else if (compBadge) {
      compBadge.classList.remove('hidden');
      if (compName) compName.textContent = 'Yoldaş Seçilmedi [P]';
      if (compElem) compElem.textContent = '🐾';
      if (compAvatar) compAvatar.classList.add('hidden');
      if (compPlaceholder) compPlaceholder.classList.remove('hidden');
    }

    if (compCfg) {
      const elemKey = compCfg.element || getActivePlayerElement();
      if (nameSlotSkill) nameSlotSkill.textContent = compCfg.eName;
      if (iconSlotSkill) iconSlotSkill.innerHTML = getCombatSkillSvgIcon('skill', elemKey);
      if (nameSlotBurst) nameSlotBurst.textContent = compCfg.qName;
      if (iconSlotBurst) iconSlotBurst.innerHTML = getCombatSkillSvgIcon('burst', elemKey);
    } else {
      const elemKey = getActivePlayerElement();
      if (nameSlotSkill) nameSlotSkill.textContent = 'Girdap';
      if (iconSlotSkill) iconSlotSkill.innerHTML = getCombatSkillSvgIcon('skill', elemKey);
      if (nameSlotBurst) nameSlotBurst.textContent = 'Kozmik Ulti';
      if (iconSlotBurst) iconSlotBurst.innerHTML = getCombatSkillSvgIcon('burst', elemKey);
    }
    const iconSlotAtk = document.getElementById('icon-slot-attack');
    if (iconSlotAtk && !iconSlotAtk.dataset.svgLoaded) {
      iconSlotAtk.innerHTML = getCombatSkillSvgIcon('attack', getActivePlayerElement());
      iconSlotAtk.dataset.svgLoaded = '1';
    }
    const iconSlotHeavy = document.getElementById('icon-slot-heavy');
    if (iconSlotHeavy && !iconSlotHeavy.dataset.svgLoaded) {
      iconSlotHeavy.innerHTML = getCombatSkillSvgIcon('heavy', getActivePlayerElement());
      iconSlotHeavy.dataset.svgLoaded = '1';
    }
    const iconSlotDash = document.querySelector('#slot-dash .skill-icon');
    if (iconSlotDash && !iconSlotDash.dataset.svgLoaded) {
      iconSlotDash.innerHTML = getCombatSkillSvgIcon('dash', getActivePlayerElement());
      iconSlotDash.dataset.svgLoaded = '1';
    }

    // Top-Center Cinematic Boss / Elite HUD Bar
    const bossHud = document.getElementById('combat-boss-hud');
    if (bossHud && isBattleZone(currentMap)) {
      const activeBoss = activeCombatMobs.find(m => !m.isDead && (m.isBoss || m.isElite));
      if (activeBoss) {
        bossHud.classList.remove('hidden');
        const bName = document.getElementById('boss-hud-name');
        const bStatus = document.getElementById('boss-hud-status');
        const bAura = document.getElementById('boss-hud-aura');
        const bHpFill = document.getElementById('boss-hud-hp-fill');
        const bHpText = document.getElementById('boss-hud-hp-text');
        const bPoiseFill = document.getElementById('boss-hud-poise-fill');
        const bPoiseText = document.getElementById('boss-hud-poise-text');

        if (bName) bName.textContent = activeBoss.name;
        const isStaggered = activeBoss.staggeredUntil && now < activeBoss.staggeredUntil;
        if (bStatus) {
          bStatus.textContent = isStaggered ? '💫 SERSEMLEDİ (%150 HASAR!)' : 'SAVAŞTA';
          bStatus.style.color = isStaggered ? '#facc15' : '#fca5a5';
        }
        if (bAura) {
          if (activeBoss.elementalAura && now < activeBoss.elementalAura.expiresAt) {
            const em = ELEMENT_META[activeBoss.elementalAura.element] || ELEMENT_META.Pyro;
            bAura.textContent = `${em.emoji} ${activeBoss.elementalAura.element}`;
            bAura.classList.remove('hidden');
          } else {
            bAura.classList.add('hidden');
          }
        }
        if (bHpFill) {
          const pct = Math.max(0, Math.min(100, (activeBoss.hp / activeBoss.maxHP) * 100));
          bHpFill.style.width = `${pct}%`;
        }
        if (bHpText) {
          bHpText.textContent = `${activeBoss.hp} / ${activeBoss.maxHP}`;
        }
        if (bPoiseFill) {
          const pPct = isStaggered ? 0 : Math.max(0, Math.min(100, ((activeBoss.poise || 0) / (activeBoss.maxPoise || 100)) * 100));
          bPoiseFill.style.width = `${pPct}%`;
        }
        if (bPoiseText) {
          bPoiseText.textContent = isStaggered
            ? '💥 ZIRH KIRILDI!'
            : `🛡️ DENGE: %${Math.round(((activeBoss.poise || 0) / (activeBoss.maxPoise || 100)) * 100)}`;
        }
      } else {
        bossHud.classList.add('hidden');
      }
    }

    // Right-Side Dynamic Combo Hit Counter & Reaction Banner
    const comboHud = document.getElementById('combat-combo-hud');
    if (comboHud) {
      if (isBattleZone(currentMap) && combatComboHits > 0 && now < combatComboExpireTime) {
        comboHud.classList.remove('hidden');
        const cCount = document.getElementById('combo-hud-count');
        const cRank = document.getElementById('combo-hud-rank');
        const cReact = document.getElementById('combo-hud-reaction');
        if (cCount) cCount.textContent = String(combatComboHits);
        if (cRank) {
          const rank = combatComboHits >= 35 ? 'SSS' : (combatComboHits >= 22 ? 'SS' : (combatComboHits >= 14 ? 'S' : (combatComboHits >= 8 ? 'A' : (combatComboHits >= 4 ? 'B' : 'C'))));
          cRank.textContent = rank;
        }
        if (cReact) {
          if (lastReactionText && now < lastReactionExpireTime) {
            cReact.textContent = lastReactionText;
            cReact.classList.remove('hidden');
          } else {
            cReact.classList.add('hidden');
          }
        }
      } else {
        comboHud.classList.add('hidden');
      }
    }
  }

  function applyMobDamageToPlayer(baseDmg, mobName = 'Düşman') {
    const now = performance.now();
    if (now <= playerInvulnerableUntil) {
      showDamageNumber({ x: myPlayer.x, y: 2.0, z: myPlayer.z }, '⚡ DODGE!', 'normal');
      return;
    }

    const stats = getPlayerEffectiveStats();
    const playerGs = getMyGearScore();
    const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
    const penalty = getGsDifficultyMultiplier(playerGs, zoneConf.reqGS);

    // RPG DEF Mitigation Formula: 100 / (100 + DEF)
    const defReduction = 100 / (100 + Math.max(0, stats.def));
    let incomingDmg = Math.max(1, Math.round(baseDmg * penalty.damageTakenMult * defReduction));

    // Zhongli / Geo Crystallize Shield Absorption
    if (activeJadeShieldHP > 0) {
      if (activeJadeShieldHP >= incomingDmg) {
        activeJadeShieldHP -= incomingDmg;
        showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, `🛡️ SOĞURULDU! (-${incomingDmg})`, 'shield');
        playBeep(440, 'triangle', 0.12);
        updateCombatHUD();
        return;
      } else {
        incomingDmg -= activeJadeShieldHP;
        showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, `🛡️ KALKAN KIRILDI! (-${activeJadeShieldHP})`, 'shield');
        activeJadeShieldHP = 0;
        if (activeJadeShieldMesh && myMesh) {
          myMesh.remove(activeJadeShieldMesh);
          activeJadeShieldMesh = null;
        }
        playBeep(220, 'sawtooth', 0.2);
      }
    }

    playerHP = Math.max(0, playerHP - incomingDmg);
    showDamageNumber({ x: myPlayer.x, y: 1.8, z: myPlayer.z }, `-${incomingDmg}`, 'player-hit');
    screenShakeTimer = 0.16;
    screenShakeMagnitude = 0.28;
    playPunchyHitSound(false);
    updateCombatHUD();

    if (playerHP <= 0) {
      triggerPlayerDefeat();
    }
  }


  function updateCombatEngine(delta, now) {
    if (!isBattleZone(currentMap)) return;

    // Regenerate Stamina smoothly (18/sec)
    if (playerStamina < playerMaxStamina) {
      playerStamina = Math.min(playerMaxStamina, playerStamina + delta * 18.0);
    }

    // Update Soft Lock-On Reticle
    updateTargetReticle(now);

    // 0. Update AoE Danger Telegraphs (Red Warning Zones)
    for (let i = activeTelegraphs.length - 1; i >= 0; i--) {
      const tg = activeTelegraphs[i];
      const elapsed = now - tg.startTime;
      const progress = Math.min(1.0, elapsed / tg.duration);
      if (tg.type === 'circle') {
        tg.fillMesh.scale.set(Math.max(0.01, progress), Math.max(0.01, progress), 1);
      } else if (tg.type === 'lane') {
        tg.fillMesh.scale.set(1, Math.max(0.01, progress), 1);
      }
      if (progress >= 1.0) {
        if (tg.onComplete) {
          tg.onComplete();
        }
        if (tg.cleanup) tg.cleanup();
        else worldObjects.remove(tg.group);
        activeTelegraphs.splice(i, 1);
      }
    }

    // 0.5 Update Active 3D Projectiles (Fireballs, Homing Void Orbs & Elemental Bolts)
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
      const proj = activeProjectiles[i];
      const elapsed = now - proj.birthTime;
      if (elapsed >= proj.life) {
        worldObjects.remove(proj.mesh);
        activeProjectiles.splice(i, 1);
        continue;
      }

      if (proj.homing && !proj.fromPlayer) {
        const pdx = myPlayer.x - proj.x;
        const pdz = myPlayer.z - proj.z;
        const pdist = Math.hypot(pdx, pdz) || 1;
        proj.vx += ((pdx / pdist) * proj.speed - proj.vx) * Math.min(1, delta * 3.2);
        proj.vz += ((pdz / pdist) * proj.speed - proj.vz) * Math.min(1, delta * 3.2);
      }

      proj.x += proj.vx * delta;
      proj.z += proj.vz * delta;
      proj.mesh.position.set(proj.x, proj.y, proj.z);
      if (proj.halo) {
        proj.halo.rotation.x += delta * 6;
        proj.halo.rotation.y += delta * 6;
      }

      if (!proj.fromPlayer) {
        const hitDist = Math.hypot(myPlayer.x - proj.x, myPlayer.z - proj.z);
        if (hitDist <= 0.95) {
          createShockwaveRing(proj.x, proj.z, 1.8, 0xf97316);
          applyMobDamageToPlayer(proj.dmg, proj.mobName);
          worldObjects.remove(proj.mesh);
          activeProjectiles.splice(i, 1);
        }
      } else {
        for (const mob of activeCombatMobs) {
          if (mob.isDead) continue;
          if (Math.hypot(mob.x - proj.x, mob.z - proj.z) <= 1.25) {
            const react = applyElementAndTriggerReaction(mob, proj.element, proj.dmg, now);
            const fDmg = Math.round(proj.dmg * react.mult);
            mob.hp = Math.max(0, mob.hp - fDmg);
            notifyDungeonMobHit(mob, fDmg, true, proj.element);
            if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
            showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `✨ ${fDmg}`, 'crit');
            if (mob.hp <= 0) defeatMob(mob);
            worldObjects.remove(proj.mesh);
            activeProjectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    // 0.8 Update Active 3D Player Skillshots (Linear Waves, Parabolic Arcane Orbs, Celestial Sword Rain)
    const stats = getPlayerEffectiveStats();
    const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
    const gsPenalty = getGsDifficultyMultiplier(stats.gearScore, zoneConf.reqGS);

    for (let i = activeSkillshots.length - 1; i >= 0; i--) {
      const ss = activeSkillshots[i];

      if (ss.type === 'linear_wave') {
        const stepDist = ss.speed * delta;
        ss.x += ss.vx * delta;
        ss.z += ss.vz * delta;
        ss.traveled += stepDist;
        ss.mesh.position.set(ss.x, 0, ss.z);
        const waveScale = 1 + Math.sin(ss.traveled * 0.9) * 0.08;
        ss.mesh.scale.set(waveScale, 1, waveScale);

        if (ss.traveled - ss.lastWakeDist >= 2.1) {
          ss.lastWakeDist = ss.traveled;
          createShockwaveRing(ss.x, ss.z, ss.width * 0.65, ss.color);
          if (ss.leaveLightningWake) {
            createElectroSlashVFX(ss.x, 1.0, ss.z);
          }
        }

        // Physical Collision Check with Mobs along the travelling wave front
        for (let m = 0; m < activeCombatMobs.length; m++) {
          const mob = activeCombatMobs[m];
          if (mob.isDead || ss.hitMobs.has(mob)) continue;

          const hitRadius = ss.width * 0.62 + (mob.isBoss ? 1.35 : 0.65);
          const distToWave = Math.hypot(mob.x - ss.x, mob.z - ss.z);
          if (distToWave <= hitRadius) {
            ss.hitMobs.add(mob);

            // Check Lateral Spine Distance or Max-Range Tip for Sweetspot Mastery!
            const relX = mob.x - ss.startX;
            const relZ = mob.z - ss.startZ;
            const lateralOffset = Math.abs(relX * Math.cos(ss.angle) - relZ * Math.sin(ss.angle));
            const isSweetspot = (lateralOffset <= ss.width * 0.25) || (ss.traveled >= ss.maxDist * 0.72);

            const isCrit = isSweetspot || (now < perfectDodgeBuffUntil) || (Math.random() < (stats.crit / 100) + 0.15);
            let dmg = ss.baseDmg;
            if (companionBuffs.active) dmg = Math.round(dmg * companionBuffs.dmgMult);
            if (dungeonState.viewerBuffActive && now < dungeonState.viewerBuffUntil) dmg = Math.round(dmg * 1.25);
            if (isCrit) dmg = Math.round(dmg * Math.max(1.35, stats.critDmg / 100));
            if (isSweetspot) dmg = Math.round(dmg * 1.32);
            if (mob.staggeredUntil && now < mob.staggeredUntil) dmg = Math.round(dmg * 1.5);

            const isGlance = gsPenalty.glanceChance > 0 && Math.random() < gsPenalty.glanceChance;
            if (isGlance) {
              dmg = Math.floor(Math.random() * 2);
            } else {
              const react = applyElementAndTriggerReaction(mob, ss.element, dmg, now);
              dmg = Math.max(1, Math.round(dmg * react.mult * gsPenalty.damageMult));
            }
            if (mob.isBoss && dungeonState.active && dungeonState.phase2ShieldActive) {
              dmg = Math.max(1, Math.round(dmg * 0.1));
            }

            if (gsPenalty.poiseBreakable !== false) {
              applyPoiseDamage(mob, ss.poiseDmg * (isSweetspot ? 1.35 : 1.0), now);
            }

            mob.hp = Math.max(0, mob.hp - dmg);
            notifyDungeonMobHit(mob, dmg, isCrit || isSweetspot, ss.element);
            if (mob.hpFillMesh) {
              const ratio = Math.max(0.001, mob.hp / mob.maxHP);
              mob.hpFillMesh.scale.x = ratio;
              mob.hpFillMesh.position.x = -((1 - ratio) * mob.hpFillBaseWidth) / 2;
            }
            mob.flashTimer = 0.2;
            const kb = (gsPenalty.poiseBreakable === false ? 0.3 : 8.5) / (mob.isBoss ? 2.5 : 1.0);
            mob.knockbackVx = Math.sin(ss.angle) * kb;
            mob.knockbackVz = Math.cos(ss.angle) * kb;

            if (isGlance) {
              showDamageNumber(
                { x: mob.x, y: mob.y + mob.height, z: mob.z },
                `🛡️ SEKTİ! (${dmg})`,
                'glance'
              );
              playBeep(260, 'sine', 0.08);
            } else {
              showDamageNumber(
                { x: mob.x, y: mob.y + mob.height, z: mob.z },
                `${ss.label} ${isCrit ? 'CRIT! ' : ''}${dmg}`,
                isCrit ? 'crit' : 'normal'
              );
            }

            if (isSweetspot && !ss.sweetspotTriggered) {
              ss.sweetspotTriggered = true;
              triggerSweetspotReward(mob, ss.slot, now);
            } else {
              playPunchyHitSound(isCrit);
              registerComboHit(1);
            }

            if (ss.slot !== 'q') {
              playerEnergy = Math.min(100, playerEnergy + 10);
            }
            updateCombatHUD();

            if (mob.hp <= 0) defeatMob(mob);
          }
        }

        if (ss.traveled >= ss.maxDist) {
          createShockwaveRing(ss.x, ss.z, ss.width * 0.9, ss.color);
          worldObjects.remove(ss.mesh);
          activeSkillshots.splice(i, 1);
        }

      } else if (ss.type === 'target_orb') {
        ss.elapsed += delta;
        const t = Math.min(1.0, ss.elapsed / ss.duration);
        const cx = ss.startX + (ss.tx - ss.startX) * t;
        const cz = ss.startZ + (ss.tz - ss.startZ) * t;
        const cy = ss.startY * (1 - t) + 0.5 * t + Math.sin(t * Math.PI) * ss.arcHeight;

        ss.mesh.position.set(cx, cy, cz);
        if (ss.shell) {
          ss.shell.rotation.x += delta * 8.0;
          ss.shell.rotation.y += delta * 8.0;
        }
        if (ss.ring) {
          ss.ring.rotation.z += delta * 10.0;
        }
        if (ss.sealMesh) {
          ss.sealMesh.rotation.y += delta * 3.5;
        }

        if (t >= 1.0) {
          worldObjects.remove(ss.mesh);
          if (ss.sealMesh) worldObjects.remove(ss.sealMesh);

          createMeteorImpact(ss.tx, ss.tz);
          applyTargetGroundSkillshotDamage(ss);

          if (ss.spawnVortexOnHit) {
            isVortexActive = true;
            vortexEndTime = now + 3800;
            vortexPosition = { x: ss.tx, z: ss.tz };
            createVortexMesh(ss.tx, 0, ss.tz);
          }

          activeSkillshots.splice(i, 1);
        }

      } else if (ss.type === 'sword_rain') {
        ss.elapsed += delta;
        if (ss.skyPortal) {
          ss.skyPortal.rotation.z += delta * 4.5;
        }
        for (const sw of ss.swords) {
          if (sw.y > 0.7) {
            sw.y = Math.max(0.7, sw.y - delta * 28.0);
            sw.mesh.position.y = sw.y;
            if (sw.y <= 0.75 && !sw.impacted) {
              sw.impacted = true;
              createShockwaveRing(sw.x, sw.z, 1.8, ss.color);
            }
          }
        }
        if (ss.elapsed >= 0.24 && !ss.damageDealt) {
          ss.damageDealt = true;
          applyTargetGroundSkillshotDamage(ss);
        }
        if (ss.elapsed >= ss.duration) {
          if (ss.skyPortal) worldObjects.remove(ss.skyPortal);
          for (const sw of ss.swords) worldObjects.remove(sw.mesh);
          activeSkillshots.splice(i, 1);
        }
      }
    }

    // 1. Update Slash Trails & Shockwaves
    for (let i = activeSlashTrails.length - 1; i >= 0; i--) {
      const t = activeSlashTrails[i];
      const elapsed = now - t.birthTime;
      if (elapsed >= t.life) {
        worldObjects.remove(t.mesh);
        activeSlashTrails.splice(i, 1);
      } else {
        if (t.mat) t.mat.opacity = 0.85 * (1 - elapsed / t.life);
      }
    }

    // 2. Update Vortex Suction & Damage
    if (isVortexActive) {
      if (vortexMesh) {
        vortexMesh.rotation.y += 0.12;
      }
      if (now > vortexEndTime) {
        isVortexActive = false;
        if (vortexMesh) {
          worldObjects.remove(vortexMesh);
          vortexMesh = null;
        }
      } else {
        vortexTickTimer += delta;
        const doTick = vortexTickTimer >= 0.45;
        if (doTick) vortexTickTimer = 0;

        for (let i = 0; i < activeCombatMobs.length; i++) {
          const mob = activeCombatMobs[i];
          if (mob.isDead) continue;
          const vdx = vortexPosition.x - mob.x;
          const vdz = vortexPosition.z - mob.z;
          const vdist = Math.hypot(vdx, vdz);
          if (vdist < 8.0 && vdist > 0.1) {
            const pullSpeed = 4.5 * delta;
            mob.x += (vdx / vdist) * pullSpeed;
            mob.z += (vdz / vdist) * pullSpeed;
            mob.mesh.position.x = mob.x;
            mob.mesh.position.z = mob.z;

            if (doTick) {
              const tickDmg = 18;
              const react = applyElementAndTriggerReaction(mob, 'Anemo', tickDmg, now);
              const fDmg = Math.round(tickDmg * react.mult);
              mob.hp = Math.max(0, mob.hp - fDmg);
              notifyDungeonMobHit(mob, fDmg, false, 'Anemo');
              if (mob.hpFillMesh) {
                mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
              }
              mob.flashTimer = 0.08;
              showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🍃 ${fDmg}`, 'normal');
              playerEnergy = Math.min(100, playerEnergy + 2);
              if (mob.hp <= 0) defeatMob(mob);
            }
          }
        }
      }
    }

    // 3. Update Mobs AI, Articulated Rig Animations & Telegraphed Attacks
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;

      updateMobAuraVisual(mob);

      // Recover Poise when Stagger ends
      if (mob.staggeredUntil && now >= mob.staggeredUntil) {
        mob.staggeredUntil = 0;
        mob.poise = mob.maxPoise || 30;
      }

      // Zhongli Petrification or Poise Stagger / Freeze Check
      if (mob.isPetrified) {
        if (now > mob.petrifyUntil) {
          mob.isPetrified = false;
        } else {
          continue;
        }
      }
      if (mob.staggeredUntil && now < mob.staggeredUntil) {
        animateMobRig(mob, false, delta, now);
        if (mob.hpBarGroup && camera) {
          if (mob.hpBarGroup.parent) {
            mob.hpBarGroup.quaternion.copy(mob.hpBarGroup.parent.quaternion).invert().multiply(camera.quaternion);
          } else {
            mob.hpBarGroup.quaternion.copy(camera.quaternion);
          }
        }
        continue;
      }

      // Knockback decay
      if (!mob.isCrystal && (Math.abs(mob.knockbackVx) > 0.01 || Math.abs(mob.knockbackVz) > 0.01)) {
        mob.x += mob.knockbackVx * delta;
        mob.z += mob.knockbackVz * delta;
        mob.knockbackVx *= 0.88;
        mob.knockbackVz *= 0.88;
      }

      // Hit flash decay
      if (mob.flashTimer > 0) {
        mob.flashTimer -= delta;
        mob.mesh.traverse(child => {
          if (child.isMesh && !child.userData.isOutline && child.material && child.material.emissive) {
            child.material.emissive.setHex(mob.flashTimer > 0 ? 0xffffff : 0x000000);
          }
        });
      }

      // Billboard Mob HP Bar to Camera
      if (mob.hpBarGroup && camera) {
        if (mob.hpBarGroup.parent) {
          mob.hpBarGroup.quaternion.copy(mob.hpBarGroup.parent.quaternion).invert().multiply(camera.quaternion);
        } else {
          mob.hpBarGroup.quaternion.copy(camera.quaternion);
        }
      }

      if (mob.isCrystal) {
        animateMobRig(mob, false, delta, now);
        continue;
      }

      // Active Leap Animation Progress
      if (mob.isLeaping) {
        const lElapsed = now - mob.leapStart;
        const lProg = Math.min(1.0, lElapsed / mob.leapDuration);
        mob.x = mob.leapStartX + (mob.leapTargetX - mob.leapStartX) * lProg;
        mob.z = mob.leapStartZ + (mob.leapTargetZ - mob.leapStartZ) * lProg;
        mob.mesh.position.set(mob.x, Math.sin(lProg * Math.PI) * 3.2, mob.z);
        animateMobRig(mob, true, delta, now);
        if (lProg >= 1.0) {
          mob.isLeaping = false;
          mob.isAttacking = false;
          mob.mesh.position.y = 0;
        }
        continue;
      }

      // If mob is attacking / channeling, hold ground position & animate attack pose
      if (mob.isAttacking) {
        mob.mesh.position.set(mob.x, 0, mob.z);
        animateMobRig(mob, false, delta, now);
        continue;
      }

      // AI State Machine
      const dx = myPlayer.x - mob.x;
      const dz = myPlayer.z - mob.z;
      const dist = Math.hypot(dx, dz);
      let mobMovedThisFrame = false;

      if (dist < mob.aggroRange) {
        mob.rot = Math.atan2(dx, dz);
        mob.mesh.rotation.y = mob.rot;

        if (mob.attackCooldown > 0) {
          mob.attackCooldown -= delta;
        }

        // --- Attack & Movement Branching by Mob Type ---
        if (mob.type.startsWith('slime_')) {
          if (dist <= 5.5 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.isLeaping = true;
            mob.attackCooldown = 2.4 + Math.random() * 0.8;
            const tx = myPlayer.x;
            const tz = myPlayer.z;
            mob.leapStartX = mob.x;
            mob.leapStartZ = mob.z;
            mob.leapTargetX = tx;
            mob.leapTargetZ = tz;
            mob.leapStart = now;
            mob.leapDuration = 920;

            const sColor = mob.type === 'slime_pyro' ? 0xef4444 : (mob.type === 'slime_electro' ? 0xa855f7 : 0x22c55e);
            createTelegraphCircle(tx, tz, 3.2, 920, () => {
              if (mob.isDead) return;
              createShockwaveRing(tx, tz, 3.8, sColor);
              const pDist = Math.hypot(myPlayer.x - tx, myPlayer.z - tz);
              if (pDist < 3.2) {
                applyMobDamageToPlayer(mob.dmg, mob.name);
              }
            });
          } else if (dist > 1.2) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
            mob.mesh.position.y = Math.abs(Math.sin(now * 0.007 + mob.animTime)) * 0.55;
            mobMovedThisFrame = true;
          }

        } else if (mob.type === 'pyromancer' || mob.type === 'abyss_mage') {
          // RANGED CASTERS: Fire Dodgeable 3D Elemental Projectile + Ground Rune!
          if (dist <= 15.0 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 2.8 + Math.random() * 0.8;
            const spellColor = mob.type === 'pyromancer' ? 0xf97316 : 0x8b5cf6;
            const dirX = dx / (dist || 1);
            const dirZ = dz / (dist || 1);

            // Launch 3D Elemental Orb Projectile toward player
            spawnCombatProjectile({
              x: mob.x + dirX * 0.8,
              y: 1.35,
              z: mob.z + dirZ * 0.8,
              vx: dirX * 10.5,
              vz: dirZ * 10.5,
              speed: 10.5,
              homing: mob.type === 'abyss_mage',
              fromPlayer: false,
              color: spellColor,
              dmg: mob.dmg,
              mobName: mob.name,
              life: 2600
            });

            setTimeout(() => {
              mob.isAttacking = false;
            }, 650);
          } else if (dist < 4.5) {
            const backSpeed = 1.6 * delta;
            mob.x -= (dx / dist) * backSpeed;
            mob.z -= (dz / dist) * backSpeed;
            mobMovedThisFrame = true;
          } else if (dist > 10.0) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
            mobMovedThisFrame = true;
          }

        } else if (mob.type === 'mitachurl_axe' || mob.type === 'abyss_archon_mini') {
          if (dist >= 6.0 && dist <= 18.0 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 3.6;
            const chargeAngle = Math.atan2(dx, dz);
            mob.rot = chargeAngle;
            mob.mesh.rotation.y = chargeAngle;
            const laneLen = 15;

            createTelegraphLane(mob.x, mob.z, 3.8, laneLen, chargeAngle, 1150, () => {
              if (mob.isDead || (mob.staggeredUntil && performance.now() < mob.staggeredUntil)) return;
              const endX = mob.x + Math.sin(chargeAngle) * (laneLen - 2);
              const endZ = mob.z + Math.cos(chargeAngle) * (laneLen - 2);
              createShockwaveRing(endX, endZ, 4.2, 0xf97316);
              mob.x = endX;
              mob.z = endZ;
              mob.mesh.position.set(mob.x, 0, mob.z);
              mob.isAttacking = false;
              const pDist = Math.hypot(myPlayer.x - endX, myPlayer.z - endZ);
              if (pDist < 4.2) {
                applyMobDamageToPlayer(Math.round(mob.dmg * 1.3), mob.name);
              }
            });
          } else if (dist < 4.2 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 2.8;
            createTelegraphCircle(mob.x, mob.z, 5.2, 950, () => {
              if (mob.isDead || (mob.staggeredUntil && performance.now() < mob.staggeredUntil)) return;
              mob.isAttacking = false;
              createShockwaveRing(mob.x, mob.z, 5.5, 0xef4444);
              const pDist = Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z);
              if (pDist < 5.2) {
                applyMobDamageToPlayer(Math.round(mob.dmg * 1.2), mob.name);
              }
            });
          } else if (dist > 3.0) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
            mobMovedThisFrame = true;
          }

        } else if (mob.type === 'ruin_golem' || mob.type === 'tahabata_lord') {
          if (mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 4.2;
            const useBombardment = Math.random() < 0.5;

            if (useBombardment) {
              const targets = [
                { x: myPlayer.x, z: myPlayer.z },
                { x: myPlayer.x + (Math.random() - 0.5) * 6, z: myPlayer.z + (Math.random() - 0.5) * 6 },
                { x: myPlayer.x + (Math.random() - 0.5) * 6, z: myPlayer.z + (Math.random() - 0.5) * 6 }
              ];
              let completed = 0;
              targets.forEach(tgt => {
                createTelegraphCircle(tgt.x, tgt.z, 3.2, 1050, () => {
                  if (mob.isDead) return;
                  createShockwaveRing(tgt.x, tgt.z, 3.6, 0xa855f7);
                  if (Math.hypot(myPlayer.x - tgt.x, myPlayer.z - tgt.z) < 3.2) {
                    applyMobDamageToPlayer(mob.dmg, mob.name);
                  }
                  completed++;
                  if (completed >= targets.length) {
                    mob.isAttacking = false;
                  }
                });
              });
            } else {
              createTelegraphCircle(mob.x, mob.z, 6.0, 750, () => {
                if (mob.isDead || (mob.staggeredUntil && performance.now() < mob.staggeredUntil)) return;
                createShockwaveRing(mob.x, mob.z, 6.2, 0xa855f7);
                screenShakeTimer = 0.2; screenShakeMagnitude = 0.35;
                if (Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z) < 6.0) {
                  applyMobDamageToPlayer(mob.dmg, mob.name);
                }
                createTelegraphCircle(mob.x, mob.z, 12.0, 550, () => {
                  if (mob.isDead) return;
                  createShockwaveRing(mob.x, mob.z, 12.2, 0x6366f1);
                  screenShakeTimer = 0.25; screenShakeMagnitude = 0.4;
                  if (Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z) < 12.0) {
                    applyMobDamageToPlayer(mob.dmg, mob.name);
                  }
                  createTelegraphCircle(mob.x, mob.z, 18.0, 550, () => {
                    if (mob.isDead) return;
                    mob.isAttacking = false;
                    createShockwaveRing(mob.x, mob.z, 18.2, 0x3b82f6);
                    screenShakeTimer = 0.3; screenShakeMagnitude = 0.5;
                    if (Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z) < 18.0) {
                      applyMobDamageToPlayer(mob.dmg, mob.name);
                    }
                  });
                });
              });
            }
          } else if (dist > 3.0) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
            mobMovedThisFrame = true;
          }

        } else {
          if (dist <= 2.2 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 1.9 + Math.random() * 0.5;
            const fx = mob.x + Math.sin(mob.rot) * 1.4;
            const fz = mob.z + Math.cos(mob.rot) * 1.4;

            createTelegraphCircle(fx, fz, 2.7, 850, () => {
              if (mob.isDead || (mob.staggeredUntil && performance.now() < mob.staggeredUntil)) return;
              mob.isAttacking = false;
              createShockwaveRing(fx, fz, 2.9, 0xef4444);
              const pDist = Math.hypot(myPlayer.x - fx, myPlayer.z - fz);
              if (pDist < 2.7) {
                applyMobDamageToPlayer(mob.dmg, mob.name);
              }
            });
          } else if (dist > 1.8) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
            mobMovedThisFrame = true;
          }
        }
      }

      mob.mesh.position.x = mob.x;
      mob.mesh.position.z = mob.z;
      animateMobRig(mob, mobMovedThisFrame, delta, now);
    }

    // 4. Update Drop Primogem Crystals Vacuum Flight
    for (let i = activeDropGems.length - 1; i >= 0; i--) {
      const gem = activeDropGems[i];
      gem.mesh.rotation.y += 0.06;
      gem.mesh.rotation.x += 0.03;

      const elapsed = now - gem.spawnTime;
      if (elapsed > gem.vacuumDelay) {
        const pdx = myPlayer.x - gem.x;
        const pdz = myPlayer.z - gem.z;
        const pdy = 0.9 - gem.y;
        const pdist = Math.hypot(pdx, pdz);

        if (pdist < 0.65) {
          worldObjects.remove(gem.mesh);
          activeDropGems.splice(i, 1);

          const item = gem.item;
          if (item) {
            myInventory.push(item);
            playBeep(659, 'sine', 0.1);
            showDamageNumber({ x: myPlayer.x, y: 1.8, z: myPlayer.z }, `📦 +1 ${item.name}`, `rarity-${item.rarity}`);
            showLootToast(item);

            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'WORLD_ITEM_LOOT',
                item: item
              }));
            }
          }
        } else {
          const vacSpeed = Math.min(18.0, 7.0 + (elapsed - gem.vacuumDelay) * 0.012) * delta;
          gem.x += (pdx / (pdist || 1)) * vacSpeed;
          gem.z += (pdz / (pdist || 1)) * vacSpeed;
          gem.y += (pdy / (pdist || 1)) * vacSpeed;
          gem.mesh.position.set(gem.x, gem.y, gem.z);
        }
      }
    }

    // 5. Respawn Check (Open Grinding Zones ONLY) or Aion 2 Dungeon Runtime Update
    if (isDungeonMap(currentMap)) {
      updateDungeonRuntime(delta, now);
    } else {
      const aliveCount = activeCombatMobs.filter(m => !m.isDead).length;
      if (aliveCount < 4) {
        mobSpawnTimer += delta;
        if (mobSpawnTimer >= 5.0) {
          mobSpawnTimer = 0;
          let types = ['slime_green', 'slime_electro', 'hilichurl_recruit'];
          if (currentMap === 'battle_zone_2') {
            types = ['slime_pyro', 'hilichurl_warrior', 'pyromancer'];
          } else if (currentMap === 'battle_zone_3') {
            types = ['abyss_sentinel', 'abyss_mage'];
          }
          const chosen = types[Math.floor(Math.random() * types.length)];
          const angle = Math.random() * Math.PI * 2;
          const rx = Math.cos(angle) * 22;
          const rz = Math.sin(angle) * 22;
          spawnCombatMob(chosen, rx, rz);
        }
      }

      // Boss Respawn Check
      if (bossRespawnTimer > 0 && now >= bossRespawnTimer) {
        bossRespawnTimer = 0;
        let bossType = 'hilichurl_recruit';
        let bossTitle = 'Kuzey Lideri';
        if (currentMap === 'battle_zone_2') {
          bossType = 'mitachurl_axe';
          bossTitle = 'Alev Baltalı Mitachurl';
        } else if (currentMap === 'battle_zone_3') {
          bossType = 'ruin_golem';
          bossTitle = 'Antik Yıkım Muhafızı (DÜNYA BOSSU)';
        }
        spawnCombatMob(bossType, 0, 14);
        addChatMessage('⚔️ BOSS DOĞDU', `⚠️ ${bossTitle} kuzey sunağında yeniden belirdi!`);
        screenShakeTimer = 0.35;
        screenShakeMagnitude = 0.45;
      }
    }

    // 6. Companion Active Systems Runtime Updates
    if (activeGeoSteleMesh) {
      if (now > activeGeoSteleMesh.userData.endTime) {
        worldObjects.remove(activeGeoSteleMesh);
        activeGeoSteleMesh = null;
      } else if (now - activeGeoSteleMesh.userData.lastPulse >= 1500) {
        activeGeoSteleMesh.userData.lastPulse = now;
        const spx = activeGeoSteleMesh.position.x;
        const spz = activeGeoSteleMesh.position.z;
        createMeteorImpact(spx, spz);
        playPunchyHitSound(false);
        for (let i = 0; i < activeCombatMobs.length; i++) {
          const mob = activeCombatMobs[i];
          if (mob.isDead) continue;
          const dist = Math.hypot(mob.x - spx, mob.z - spz);
          if (dist <= 6.5) {
            const isGlance = gsPenalty.glanceChance > 0 && Math.random() < gsPenalty.glanceChance;
            if (isGlance) {
              showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, '🛡️ SEKTİ! (0)', 'glance');
            } else {
              const react = applyElementAndTriggerReaction(mob, 'Geo', 45, now);
              const gDmg = Math.max(1, Math.round(45 * react.mult * gsPenalty.damageMult));
              mob.hp = Math.max(0, mob.hp - gDmg);
              notifyDungeonMobHit(mob, gDmg, false, 'Geo');
              if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
              mob.flashTimer = 0.12;
              showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🪨 Rezonans! ${gDmg}`, 'normal');
              if (mob.hp <= 0) defeatMob(mob);
            }
          }
        }
      }
    }

    if (activeFurinaMinions.length > 0) {
      if (now > furinaMinionsEndTime) {
        for (const m of activeFurinaMinions) worldObjects.remove(m.mesh);
        activeFurinaMinions = [];
      } else {
        for (let i = 0; i < activeFurinaMinions.length; i++) {
          const minion = activeFurinaMinions[i];
          const orbitAngle = now * 0.002 + minion.angleOffset;
          const ox = myPlayer.x + Math.sin(orbitAngle) * 2.2;
          const oz = myPlayer.z + Math.cos(orbitAngle) * 2.2;
          minion.mesh.position.set(ox, 1.4 + Math.sin(now * 0.005 + i) * 0.2, oz);

          if (now - minion.lastShot >= 1800) {
            minion.lastShot = now;
            let nearestMob = null;
            let nearestDist = 999;
            for (const mob of activeCombatMobs) {
              if (mob.isDead) continue;
              const d = Math.hypot(mob.x - ox, mob.z - oz);
              if (d < nearestDist && d < 12.0) {
                nearestDist = d;
                nearestMob = mob;
              }
            }
            if (nearestMob) {
              const isGlance = gsPenalty.glanceChance > 0 && Math.random() < gsPenalty.glanceChance;
              if (isGlance) {
                showDamageNumber({ x: nearestMob.x, y: nearestMob.y + nearestMob.height, z: nearestMob.z }, '🛡️ SEKTİ! (0)', 'glance');
              } else {
                const react = applyElementAndTriggerReaction(nearestMob, 'Hydro', 35, now);
                const hDmg = Math.max(1, Math.round(35 * react.mult * gsPenalty.damageMult));
                nearestMob.hp = Math.max(0, nearestMob.hp - hDmg);
                notifyDungeonMobHit(nearestMob, hDmg, false, 'Hydro');
                if (nearestMob.hpFillMesh) nearestMob.hpFillMesh.scale.x = Math.max(0.001, nearestMob.hp / nearestMob.maxHP);
                nearestMob.flashTimer = 0.1;
                showDamageNumber({ x: nearestMob.x, y: nearestMob.y + nearestMob.height, z: nearestMob.z }, `💧 ${hDmg}`, 'normal');
                playHydroSplashSound();
                if (nearestMob.hp <= 0) defeatMob(nearestMob);
              }
            }
          }
        }
      }
    }

    if (activeKazuhaStormMesh) {
      activeKazuhaStormMesh.rotation.y += 0.02;
      if (now > kazuhaStormEndTime) {
        worldObjects.remove(activeKazuhaStormMesh);
        activeKazuhaStormMesh = null;
      } else {
        kazuhaStormTickTimer += delta;
        if (kazuhaStormTickTimer >= 0.6) {
          kazuhaStormTickTimer = 0;
          const kx = activeKazuhaStormMesh.position.x;
          const kz = activeKazuhaStormMesh.position.z;
          for (let i = 0; i < activeCombatMobs.length; i++) {
            const mob = activeCombatMobs[i];
            if (mob.isDead) continue;
            const dist = Math.hypot(mob.x - kx, mob.z - kz);
            if (dist <= 7.0) {
              const isGlance = gsPenalty.glanceChance > 0 && Math.random() < gsPenalty.glanceChance;
              if (isGlance) {
                showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, '🛡️ SEKTİ! (0)', 'glance');
              } else {
                const react = applyElementAndTriggerReaction(mob, 'Anemo', 40, now);
                const aDmg = Math.max(1, Math.round(40 * react.mult * gsPenalty.damageMult));
                mob.hp = Math.max(0, mob.hp - aDmg);
                notifyDungeonMobHit(mob, aDmg, false, 'Anemo');
                if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
                mob.flashTimer = 0.08;
                showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🍃 ${aDmg}`, 'normal');
                if (mob.hp <= 0) defeatMob(mob);
              }
            }
          }
        }
      }
    }

    if (activeJadeShieldMesh) {
      activeJadeShieldMesh.rotation.y += 0.015;
      activeJadeShieldMesh.rotation.x += 0.008;
    }

    if (activeElectroEyeMesh) {
      if (now > electroEyeEndTime) {
        if (myMesh) myMesh.remove(activeElectroEyeMesh);
        activeElectroEyeMesh = null;
      } else {
        activeElectroEyeMesh.rotation.y += 0.04;
      }
    }

    if (companionBuffs.active) {
      companionBuffs.timer -= delta;
      if (companionBuffs.timer <= 0) {
        companionBuffs.active = false;
        companionBuffs.dmgMult = 1.0;
        companionBuffs.speedMult = 1.0;
        companionBuffs.type = '';
      }
    }

    updateCombatHUD();
  }

  function triggerPlayerDefeat() {
    if (isPlayerDefeated) return;
    isPlayerDefeated = true;
    playBeep(130, 'sawtooth', 0.45);

    const defeatOverlay = document.getElementById('player-defeat-overlay');
    const defeatTitle = document.getElementById('defeat-title');
    const defeatText = document.getElementById('defeat-text');

    if (isDungeonMap(currentMap)) {
      if (defeatTitle) defeatTitle.textContent = '💀 CANIN TÜKENDİ!';
      if (defeatText) defeatText.textContent = '5 saniye içinde aşama kapısında doğacaksın... (-200 Puan)';
      if (defeatOverlay) defeatOverlay.classList.remove('hidden');

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_PLAYER_DEFEAT' }));
      }

      setTimeout(() => {
        if (defeatOverlay) defeatOverlay.classList.add('hidden');
        isPlayerDefeated = false;
        const stats = getPlayerEffectiveStats();
        playerMaxHP = stats.hp;
        playerHP = Math.round(playerMaxHP * 0.5);
        playerStamina = playerMaxStamina;
        updateCombatHUD();

        let cpZ = -60;
        if (dungeonState.stage === 2) cpZ = -6;
        else if (dungeonState.stage === 3) cpZ = 42;
        myPlayer.x = 0;
        myPlayer.z = cpZ;
        if (myMesh) myMesh.position.set(0, 0, cpZ);

        addChatMessage('💀 Zindan', 'Aşama kapısında %50 can ile yeniden doğdun! Savaş devam ediyor.');
      }, 5000);
      return;
    }

    if (defeatTitle) defeatTitle.textContent = 'YENİLDİN!';
    if (defeatText) defeatText.textContent = 'Yaratıklar seni alt etti. Kasaba meydanına geri taşınıyorsun...';
    if (defeatOverlay) defeatOverlay.classList.remove('hidden');

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'WORLD_PLAYER_DEFEAT' }));
    }

    setTimeout(() => {
      if (defeatOverlay) {
        defeatOverlay.classList.add('hidden');
      }
      isPlayerDefeated = false;
      const stats = getPlayerEffectiveStats();
      playerMaxHP = stats.hp;
      playerHP = playerMaxHP;
      updateCombatHUD();
      triggerDoorWipe('town');
      addChatMessage('Sistem', '💀 Savaş alanında yenildin! Kasaba çeşmesinde yeniden canlandın.');
    }, 2200);
  }

  let currentPortalTab = 'dungeons';

  function switchPortalTab(tabName) {
    currentPortalTab = tabName || 'dungeons';
    document.querySelectorAll('.btn-portal-tab').forEach(btn => {
      if (btn.getAttribute('data-portal-tab') === currentPortalTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    const panelDungeons = document.getElementById('portal-panel-dungeons');
    const panelOpen = document.getElementById('portal-panel-open-zones');
    if (panelDungeons) {
      if (currentPortalTab === 'dungeons') panelDungeons.classList.remove('hidden');
      else panelDungeons.classList.add('hidden');
    }
    if (panelOpen) {
      if (currentPortalTab === 'open_zones') panelOpen.classList.remove('hidden');
      else panelOpen.classList.add('hidden');
    }
  }

  function openPortalZoneModal() {
    const currentGS = getMyGearScore();
    const gsEl = document.getElementById('portal-player-gs');
    if (gsEl) gsEl.textContent = `${currentGS} GS`;

    // --- Aion 2 Dungeons Difficulty Badges ---
    // Dungeon 1: Mühürlü Aether Tapınağı (Req 150 GS)
    const pd1 = getGsDifficultyMultiplier(currentGS, 150);
    const badgeD1 = document.getElementById('badge-dungeon-1');
    const hintD1 = document.getElementById('hint-dungeon-1');
    if (badgeD1) {
      badgeD1.className = `zone-card-badge status-${pd1.status}`;
      badgeD1.textContent = pd1.status === 'safe' ? '🟢 Güvenli' : (pd1.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül');
    }
    if (hintD1) {
      hintD1.textContent = pd1.status === 'safe' ? 'Ceza Yok (Tam Hasar) - S-Rank için hazır!' : `Hasar Çarpanı: x${pd1.damageMult}`;
    }

    // Dungeon 2: Kızıl Aether Kalesi (Req 450 GS)
    const pd2 = getGsDifficultyMultiplier(currentGS, 450);
    const badgeD2 = document.getElementById('badge-dungeon-2');
    const hintD2 = document.getElementById('hint-dungeon-2');
    if (badgeD2) {
      badgeD2.className = `zone-card-badge status-${pd2.status}`;
      badgeD2.textContent = pd2.status === 'safe' ? '🟢 Güvenli' : (pd2.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül Risk');
    }
    if (hintD2) {
      if (pd2.status === 'safe') hintD2.textContent = 'Ceza Yok (Tam Hasar & Efsanevi Şansı)';
      else if (pd2.status === 'challenging') hintD2.textContent = `Zorlu: Hasar x${pd2.damageMult} | Alınan Hasar x${pd2.damageTakenMult}`;
      else hintD2.textContent = `Ölümcül Risk: Hasar x${pd2.damageMult}, Sektirme: %${Math.round(pd2.glanceChance * 100)}`;
    }

    // Dungeon 3: Balaurea Uçurumu - Tahabata Sunağı (Req 800 GS)
    const pd3 = getGsDifficultyMultiplier(currentGS, 800);
    const badgeD3 = document.getElementById('badge-dungeon-3');
    const hintD3 = document.getElementById('hint-dungeon-3');
    if (badgeD3) {
      badgeD3.className = `zone-card-badge status-${pd3.status}`;
      badgeD3.textContent = pd3.status === 'safe' ? '🟢 Güvenli' : (pd3.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül Risk');
    }
    if (hintD3) {
      if (pd3.status === 'safe') hintD3.textContent = 'Hazırsın! Ceza Yok (Garantili 4★/5★ & 1 Dilek!)';
      else if (pd3.status === 'challenging') hintD3.textContent = `Hasar: x${pd3.damageMult} | Alınan: x${pd3.damageTakenMult} | Sektirme: %${Math.round(pd3.glanceChance * 100)}`;
      else hintD3.textContent = `Ölümcül Risk: Hasar x${pd3.damageMult}, Alınan x${pd3.damageTakenMult}, %35 Vuruş Seker!`;
    }

    // --- Open Grinding Zones Difficulty Badges ---
    // Zone 1 (Slime Vadisi - Req 100 GS)
    const p1 = getGsDifficultyMultiplier(currentGS, 100);
    const badge1 = document.getElementById('badge-zone-1');
    const hint1 = document.getElementById('hint-zone-1');
    if (badge1) {
      badge1.className = `zone-card-badge status-${p1.status}`;
      badge1.textContent = p1.status === 'safe' ? '🟢 Güvenli' : (p1.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül');
    }
    if (hint1) {
      hint1.textContent = p1.status === 'safe' ? 'Ceza Yok (Tam Hasar) - Güvenli Bölge' : `Hasar Çarpanı: x${p1.damageMult}`;
    }

    // Zone 2 (Kızıl Hilichurl Harabeleri - Req 350 GS)
    const p2 = getGsDifficultyMultiplier(currentGS, 350);
    const badge2 = document.getElementById('badge-zone-2');
    const hint2 = document.getElementById('hint-zone-2');
    if (badge2) {
      badge2.className = `zone-card-badge status-${p2.status}`;
      badge2.textContent = p2.status === 'safe' ? '🟢 Güvenli' : (p2.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül Risk');
    }
    if (hint2) {
      if (p2.status === 'safe') hint2.textContent = 'Ceza Yok (Tam Hasar & Normal Ganimet)';
      else if (p2.status === 'challenging') hint2.textContent = `Zorlu: Hasar x${p2.damageMult} | Alınan Hasar x${p2.damageTakenMult}`;
      else hint2.textContent = `Ölümcül Risk: Hasar x${p2.damageMult}, Sektirme: %${Math.round(p2.glanceChance * 100)}`;
    }

    // Zone 3 (Kadim Uçurum Arenası - Req 750 GS)
    const p3 = getGsDifficultyMultiplier(currentGS, 750);
    const badge3 = document.getElementById('badge-zone-3');
    const hint3 = document.getElementById('hint-zone-3');
    if (badge3) {
      badge3.className = `zone-card-badge status-${p3.status}`;
      badge3.textContent = p3.status === 'safe' ? '🟢 Güvenli' : (p3.status === 'challenging' ? '🟡 Zorlu' : '🔴 Ölümcül Risk');
    }
    if (hint3) {
      if (p3.status === 'safe') hint3.textContent = 'Hazırsın! Ceza Yok (Tam Hasar & Efsanevi Ganimet)';
      else if (p3.status === 'challenging') hint3.textContent = `Hasar: x${p3.damageMult} | Alınan: x${p3.damageTakenMult} | Sektirme: %${Math.round(p3.glanceChance * 100)}`;
      else hint3.textContent = `Ölümcül Risk: Hasar x${p3.damageMult}, Alınan x${p3.damageTakenMult}, %35 Vuruş Seker!`;
    }

    switchPortalTab(currentPortalTab);
    openModal('modal-portal-zones');
  }

  function buildBattleZoneMap(zoneId = 'battle_zone_1') {
    currentMap = zoneId;
    const zone = ZONE_CONFIGS[zoneId] || ZONE_CONFIGS.battle_zone_1;

    while (worldObjects.children.length > 0) {
      worldObjects.remove(worldObjects.children[0]);
    }

    activeCombatMobs = [];
    activeDropGems = [];
    activeSlashTrails = [];
    activeProjectiles = [];
    activeSkillshots = [];
    activeSkillAimState = null;
    skillAimIndicatorGroup = null;
    vortexMesh = null;
    isVortexActive = false;
    targetReticleMesh = null;
    lockedTargetMob = null;
    combatComboHits = 0;

    setMapAtmosphere(zoneId);

    // Clear any pending danger telegraphs
    for (let tg of activeTelegraphs) {
      if (tg.cleanup) tg.cleanup();
      else worldObjects.remove(tg.group);
    }
    activeTelegraphs = [];

    // Location name HUD
    const locEl = document.getElementById('ui-location');
    if (locEl) locEl.textContent = `${zone.name} [GS ${zone.reqGS}]`;

    if (zoneId === 'battle_zone_1') {
      // 🌿 Zone 1: Kadim Sarmaşıklı Orman (Ancient Enchanted Forest)
      // Lush Organic Moss Floor with procedural grass texture & normal bump
      const floorGeo = new THREE.CircleGeometry(42, 48);
      const floorMat = new THREE.MeshLambertMaterial({
        map: createProceduralGrassTexture(),
        bumpMap: createProceduralGrassNormalMap(),
        bumpScale: 0.04,
        color: 0x4ade80
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      worldObjects.add(floor);

      // Populate 1,100+ 3D Forest Grass Blades & Bioluminescent Flowers
      populateLush3DGrassAndWildflowers('battle_zone_1');

      // Outer organic forest moss rim
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(39, 45, 48),
        new THREE.MeshLambertMaterial({ color: 0x052e16 })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.02;
      worldObjects.add(rim);

      // Ancient Druid Runic Circles on Floor
      const runeCircle = new THREE.Mesh(
        new THREE.RingGeometry(9.5, 10.4, 32),
        new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, opacity: 0.45, transparent: true })
      );
      runeCircle.rotation.x = -Math.PI / 2;
      runeCircle.position.y = 0.03;
      worldObjects.add(runeCircle);

      // 22 Giant Ancient Twisted Trees with sprawling roots and multi-tier canopies
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x271911 });
      const foliageMat1 = new THREE.MeshLambertMaterial({ color: 0x064e3b });
      const foliageMat2 = new THREE.MeshLambertMaterial({ color: 0x047857 });
      const foliageMat3 = new THREE.MeshLambertMaterial({ color: 0x15803d });

      for (let i = 0; i < 22; i++) {
        const angle = (i / 22) * Math.PI * 2;
        const dist = 36 + (i % 3) * 2.5;
        const px = Math.cos(angle) * dist;
        const pz = Math.sin(angle) * dist;

        const tree = new THREE.Group();
        // Gnarled thick trunk
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 5.0, 7), trunkMat);
        tr.position.y = 2.5;
        tr.castShadow = true;
        tree.add(tr);

        // 3 Surface roots protruding onto ground
        for (let r = 0; r < 3; r++) {
          const rAngle = (r / 3) * Math.PI * 2 + angle;
          const rootMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.45, 2.4, 5), trunkMat);
          rootMesh.rotation.z = Math.PI / 2.8;
          rootMesh.rotation.y = rAngle;
          rootMesh.position.set(Math.cos(rAngle) * 1.1, 0.25, Math.sin(rAngle) * 1.1);
          tree.add(rootMesh);
        }

        // Multi-tiered dense canopies
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4.5, 7), foliageMat1);
        c1.position.y = 5.6;
        c1.castShadow = true;
        tree.add(c1);

        const c2 = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.0, 7), foliageMat2);
        c2.position.y = 7.6;
        c2.castShadow = true;
        tree.add(c2);

        const c3 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 6), foliageMat3);
        c3.position.y = 9.4;
        c3.castShadow = true;
        tree.add(c3);

        tree.position.set(px, 0, pz);
        worldObjects.add(tree);
      }

      // 8 Giant Bioluminescent Glowing Mushrooms
      const mushColors = [0x06b6d4, 0xa855f7, 0xf59e0b, 0x10b981];
      const mushPositions = [
        { x: -16, z: -10, scale: 1.4, cIdx: 0 },
        { x: 18, z: -12, scale: 1.2, cIdx: 1 },
        { x: -22, z: 8, scale: 1.5, cIdx: 2 },
        { x: 20, z: 12, scale: 1.3, cIdx: 0 },
        { x: -8, z: 22, scale: 1.6, cIdx: 1 },
        { x: 12, z: 24, scale: 1.4, cIdx: 3 },
        { x: -25, z: -20, scale: 1.7, cIdx: 2 },
        { x: 24, z: -22, scale: 1.5, cIdx: 0 }
      ];

      for (let m of mushPositions) {
        const mGroup = new THREE.Group();
        const mColor = mushColors[m.cIdx];

        // Stem
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25 * m.scale, 0.45 * m.scale, 2.2 * m.scale, 8),
          new THREE.MeshLambertMaterial({ color: 0xd1fae5 })
        );
        stem.position.y = 1.1 * m.scale;
        mGroup.add(stem);

        // Cap (Hemisphere with emissive glow)
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(1.3 * m.scale, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({
            color: mColor,
            emissive: mColor,
            emissiveIntensity: 0.6,
            roughness: 0.3
          })
        );
        cap.position.y = 2.1 * m.scale;
        mGroup.add(cap);

        // Soft Point Light
        const pLight = new THREE.PointLight(mColor, 0.85, 12, 2);
        pLight.position.set(0, 2.3 * m.scale, 0);
        mGroup.add(pLight);

        mGroup.position.set(m.x, 0, m.z);
        worldObjects.add(mGroup);
      }

      // 6 Ancient Druid Menhirs (Standing runestones)
      for (let s = 0; s < 6; s++) {
        const sAngle = (s / 6) * Math.PI * 2 + 0.3;
        const sx = Math.cos(sAngle) * 20;
        const sz = Math.sin(sAngle) * 20;

        const menhir = new THREE.Group();
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 4.2, 0.9),
          new THREE.MeshLambertMaterial({ color: 0x334155 })
        );
        stone.position.y = 2.1;
        stone.rotation.y = sAngle;
        stone.rotation.z = 0.06;
        stone.castShadow = true;
        menhir.add(stone);

        // Glowing cyan rune band
        const runeBand = new THREE.Mesh(
          new THREE.BoxGeometry(1.46, 0.35, 0.96),
          new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.85 })
        );
        runeBand.position.y = 2.4;
        runeBand.rotation.y = sAngle;
        menhir.add(runeBand);

        menhir.position.set(sx, 0, sz);
        worldObjects.add(menhir);
      }

      // Mossy Stone Dais at z = 14
      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(9.5, 11.0, 0.7, 24),
        new THREE.MeshLambertMaterial({ color: 0x166534 })
      );
      dais.position.set(0, 0.35, 14);
      dais.receiveShadow = true;
      worldObjects.add(dais);

      const daisRune = new THREE.Mesh(
        new THREE.RingGeometry(6.5, 7.4, 24),
        new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, opacity: 0.65, transparent: true })
      );
      daisRune.rotation.x = -Math.PI / 2;
      daisRune.position.set(0, 0.72, 14);
      worldObjects.add(daisRune);

    } else if (zoneId === 'battle_zone_2') {
      // 🌋 Zone 2: Kızıl Lav Harabeleri (Scorched Volcanic Ruins)
      // Scorched Cracked Basalt Floor
      const floorGeo = new THREE.CircleGeometry(42, 48);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.85,
        metalness: 0.35
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      worldObjects.add(floor);

      // Outer blackened rim
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(39, 45, 48),
        new THREE.MeshLambertMaterial({ color: 0x0c0a09 })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.02;
      worldObjects.add(rim);

      // 4 Glowing Molten Lava Fissures / Channels Cutting Through Floor
      const lavaMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xf97316,
        emissiveIntensity: 0.95,
        roughness: 0.2
      });

      // Channel 1: Left Fissure
      const f1 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 32), lavaMat);
      f1.rotation.x = -Math.PI / 2;
      f1.rotation.z = 0.28;
      f1.position.set(-16, 0.04, 2);
      worldObjects.add(f1);

      // Channel 2: Right Fissure
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 28), lavaMat);
      f2.rotation.x = -Math.PI / 2;
      f2.rotation.z = -0.35;
      f2.position.set(15, 0.04, -4);
      worldObjects.add(f2);

      // Channel 3: Cross Fissure
      const f3 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 22), lavaMat);
      f3.rotation.x = -Math.PI / 2;
      f3.rotation.z = Math.PI / 2.3;
      f3.position.set(0, 0.04, -14);
      worldObjects.add(f3);

      // Glowing Point Lights illuminating the lava fissures
      const lavaLights = [
        { x: -16, y: 1.2, z: 2 },
        { x: 15, y: 1.2, z: -4 },
        { x: 0, y: 1.2, z: -14 },
        { x: 0, y: 1.2, z: 14 }
      ];
      for (let ll of lavaLights) {
        const pl = new THREE.PointLight(0xf97316, 1.1, 16, 2);
        pl.position.set(ll.x, ll.y, ll.z);
        worldObjects.add(pl);
      }

      // Crumbling Fortress Walls & Battlements around perimeter (14 bastions)
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x292524 });
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const px = Math.cos(angle) * 38;
        const pz = Math.sin(angle) * 38;

        const wallGroup = new THREE.Group();
        // Main ruined battlement
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4.8, 5.0, 1.8), wallMat);
        wall.position.y = 2.5;
        wall.castShadow = true;
        wallGroup.add(wall);

        // Crenelation teeth
        const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.85), wallMat);
        tooth1.position.set(-1.4, 5.5, 0);
        wallGroup.add(tooth1);
        const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.85), wallMat);
        tooth2.position.set(1.4, 5.5, 0);
        wallGroup.add(tooth2);

        wallGroup.position.set(px, 0, pz);
        wallGroup.rotation.y = angle + Math.PI / 2;
        worldObjects.add(wallGroup);
      }

      // 10 Flaming Iron Braziers with roaring fires
      for (let b = 0; b < 10; b++) {
        const bAngle = (b / 10) * Math.PI * 2;
        const bx = Math.cos(bAngle) * 26;
        const bz = Math.sin(bAngle) * 26;

        const brazier = new THREE.Group();
        // Iron tripod pedestal
        const ped = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.5, 1.8, 6),
          new THREE.MeshLambertMaterial({ color: 0x1c1917 })
        );
        ped.position.y = 0.9;
        ped.castShadow = true;
        brazier.add(ped);

        // Roaring fire crystal
        const flame = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.65),
          new THREE.MeshBasicMaterial({ color: 0xf97316 })
        );
        flame.position.y = 2.1;
        brazier.add(flame);

        const bLight = new THREE.PointLight(0xf97316, 0.85, 14, 2);
        bLight.position.y = 2.3;
        brazier.add(bLight);

        brazier.position.set(bx, 0, bz);
        worldObjects.add(brazier);
      }

      // Volcanic Ember Particles (Rising orange sparks)
      for (let ep = 0; ep < 18; ep++) {
        const ember = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.16, 0.16),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
        );
        ember.position.set((Math.random() - 0.5) * 50, 0.5 + Math.random() * 6, (Math.random() - 0.5) * 50);
        worldObjects.add(ember);
      }

      // Burning Ruin Altar Dais at z = 14
      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(9.8, 11.2, 0.8, 24),
        new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.8, metalness: 0.3 })
      );
      dais.position.set(0, 0.4, 14);
      dais.receiveShadow = true;
      worldObjects.add(dais);

      const daisRune = new THREE.Mesh(
        new THREE.RingGeometry(6.5, 7.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, opacity: 0.75, transparent: true })
      );
      daisRune.rotation.x = -Math.PI / 2;
      daisRune.position.set(0, 0.82, 14);
      worldObjects.add(daisRune);

    } else {
      // 🌌 Zone 3: Kadim Uçurum Boşluğu (Floating Shattered Island over Cosmic Void)
      // FLOATING SHATTERED ISLAND PLATE
      const floorGeo = new THREE.CircleGeometry(39, 48);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.5,
        metalness: 0.5
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      worldObjects.add(floor);

      // Cosmic Arcane Void Rim
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(37, 40, 48),
        new THREE.MeshBasicMaterial({ color: 0x8b5cf6, side: THREE.DoubleSide, opacity: 0.65, transparent: true })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.03;
      worldObjects.add(rim);

      // INVERTED STALACTITES HANGING UNDERNEATH INTO INFINITE VOID (y < 0)
      const stalactiteMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.8,
        metalness: 0.3
      });
      for (let s = 0; s < 16; s++) {
        const sAngle = (s / 16) * Math.PI * 2;
        const sDist = 12 + (s % 4) * 6;
        const sx = Math.cos(sAngle) * sDist;
        const sz = Math.sin(sAngle) * sDist;
        const sHeight = 12 + (s % 3) * 6;

        const stal = new THREE.Mesh(
          new THREE.ConeGeometry(2.2 + (s % 3) * 0.8, sHeight, 6),
          stalactiteMat
        );
        stal.rotation.x = Math.PI; // Invert downwards
        stal.position.set(sx, -sHeight / 2, sz);
        worldObjects.add(stal);
      }

      // 14 ZERO-GRAVITY FLOATING ASTEROIDS / SHATTERED CHUNKS
      const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.4 });
      for (let a = 0; a < 14; a++) {
        const aAngle = (a / 14) * Math.PI * 2 + 0.2;
        const aDist = 44 + (a % 3) * 6;
        const ax = Math.cos(aAngle) * aDist;
        const az = Math.sin(aAngle) * aDist;
        const ay = -4 + (a % 5) * 3.5;

        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + (a % 3) * 0.8), asteroidMat);
        rock.position.set(ax, ay, az);
        rock.rotation.set(a * 0.4, a * 0.7, a * 0.2);
        worldObjects.add(rock);

        // Hovering Pulsing Crystal atop some asteroids
        if (a % 2 === 0) {
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.65, 0),
            new THREE.MeshBasicMaterial({ color: a % 4 === 0 ? 0x38bdf8 : 0xc084fc })
          );
          crystal.position.set(ax, ay + 2.0, az);
          worldObjects.add(crystal);
        }
      }

      // COLOSSAL COSMIC VOID STARGATE ARCH behind Boss Dais (at z = 25)
      const gateGroup = new THREE.Group();
      const archMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.4, metalness: 0.7 });

      // Left Pillar
      const leftCol = new THREE.Mesh(new THREE.BoxGeometry(2.4, 16.0, 2.4), archMat);
      leftCol.position.set(-7.5, 8.0, 0);
      gateGroup.add(leftCol);

      // Right Pillar
      const rightCol = new THREE.Mesh(new THREE.BoxGeometry(2.4, 16.0, 2.4), archMat);
      rightCol.position.set(7.5, 8.0, 0);
      gateGroup.add(rightCol);

      // Top Crossbeam Lintel
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(17.4, 2.6, 2.6), archMat);
      lintel.position.set(0, 16.0, 0);
      gateGroup.add(lintel);

      // Celestial Ring Arch
      const ringArch = new THREE.Mesh(
        new THREE.TorusGeometry(6.8, 0.75, 16, 32),
        new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x6366f1, emissiveIntensity: 0.6 })
      );
      ringArch.position.set(0, 8.5, 0);
      gateGroup.add(ringArch);

      // Swirling Cosmic Event Horizon Portal Disk
      const eventHorizon = new THREE.Mesh(
        new THREE.CircleGeometry(6.2, 32),
        new THREE.MeshBasicMaterial({ color: 0x312e81, side: THREE.DoubleSide, opacity: 0.88, transparent: true })
      );
      eventHorizon.position.set(0, 8.5, 0.05);
      gateGroup.add(eventHorizon);

      const gateLight = new THREE.PointLight(0x818cf8, 1.8, 30, 2);
      gateLight.position.set(0, 8.5, 1.5);
      gateGroup.add(gateLight);

      gateGroup.position.set(0, 0, 25);
      worldObjects.add(gateGroup);

      // World Boss Dais at z = 14
      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(10.0, 11.5, 0.9, 32),
        new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.5, metalness: 0.5 })
      );
      dais.position.set(0, 0.45, 14);
      dais.receiveShadow = true;
      worldObjects.add(dais);

      const daisRune1 = new THREE.Mesh(
        new THREE.RingGeometry(6.5, 7.4, 32),
        new THREE.MeshBasicMaterial({ color: 0x818cf8, side: THREE.DoubleSide, opacity: 0.85, transparent: true })
      );
      daisRune1.rotation.x = -Math.PI / 2;
      daisRune1.position.set(0, 0.92, 14);
      worldObjects.add(daisRune1);

      const daisRune2 = new THREE.Mesh(
        new THREE.RingGeometry(3.2, 3.8, 24),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, opacity: 0.85, transparent: true })
      );
      daisRune2.rotation.x = -Math.PI / 2;
      daisRune2.position.set(0, 0.93, 14);
      worldObjects.add(daisRune2);
    }

    // Return Portal Gate back to Town at (0, -32) (Present in all zones)
    const returnPortal = createBattlePortalGate(0, -32, 'Kasabaya Dön');
    returnPortal.rotation.y = Math.PI;
    worldObjects.add(returnPortal);

    // Equip player weapon and show combat HUD
    attachCombatWeapon();
    document.getElementById('combat-hud')?.classList.remove('hidden');

    // Use RPG Effective Stats for real Max HP
    const stats = getPlayerEffectiveStats();
    playerMaxHP = stats.hp;
    playerHP = playerMaxHP;
    playerStamina = playerMaxStamina;
    playerEnergy = 35;
    updateCombatHUD();

    // Spawn Initial Mob Wave according to zone
    spawnInitialMobs(zoneId);

    // Check Player GS vs Zone reqGS for warning notification
    const playerGS = getMyGearScore();
    const penalty = getGsDifficultyMultiplier(playerGS, zone.reqGS);
    if (penalty.status === 'deadly') {
      addChatMessage('⚠️ Tehlike', `🔴 ${zone.name} bölgesindesin! GearScore'un yetersiz (${playerGS}/${zone.reqGS} GS). Vuruşların sekebilir ve yaratıklar ölümcül hasar verir!`);
    } else if (penalty.status === 'challenging') {
      addChatMessage('⚠️ Dikkat', `🟡 ${zone.name} zorlu bir bölge (${playerGS}/${zone.reqGS} GS). Hasarında hafif düşüş olacak.`);
    } else {
      addChatMessage('⚔️ Zindan', `🟢 ${zone.name} haritasına hoş geldin! [GS ${playerGS}/${zone.reqGS} - Tam Hasar]`);
    }
  }

  // =========================================================================
  // --- 12.5. Aion 2 Instance Dungeon Engine (3-Stage Corridor, Windstream, Daeva Wings, Boss Phases, Chests) ---
  // =========================================================================

  function createAetherBarrierMesh(x, z, width, height = 7.0, color = 0x38bdf8) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Semitransparent shimmering energy curtain
    const curtainGeo = new THREE.PlaneGeometry(width, height);
    const curtainMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    });
    const curtain = new THREE.Mesh(curtainGeo, curtainMat);
    curtain.position.y = height / 2;
    group.add(curtain);

    // Honeycomb grid wireframe overlay
    const wireGeo = new THREE.PlaneGeometry(width, height, Math.floor(width / 2), 6);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.y = height / 2;
    group.add(wire);

    // Twin glowing boundary pillars
    [-width / 2, width / 2].forEach(px => {
      const pGeo = new THREE.CylinderGeometry(0.5, 0.65, height + 1.0, 8);
      const pMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
      const col = new THREE.Mesh(pGeo, pMat);
      col.position.set(px, (height + 1.0) / 2, 0);
      group.add(col);

      const runeRing = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.85, 12),
        new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide })
      );
      runeRing.position.set(px, (height + 1.0) / 2, 0.05);
      group.add(runeRing);
    });

    const pLight = new THREE.PointLight(color, 1.8, 16, 2);
    pLight.position.set(0, height / 2, 0);
    group.add(pLight);

    worldObjects.add(group);
    return group;
  }

  function createWindstreamRingMesh(x, y, z, color = 0x38bdf8) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Main Torus Ring
    const ringGeo = new THREE.TorusGeometry(2.2, 0.16, 12, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.7
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Rotating inner swirling aether vortex
    const innerGeo = new THREE.RingGeometry(0.2, 2.05, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });
    const innerVortex = new THREE.Mesh(innerGeo, innerMat);
    group.add(innerVortex);

    // 4 Concentric orbiting rune crystals around the ring
    const orbs = [];
    for (let i = 0; i < 4; i++) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      group.add(orb);
      orbs.push(orb);
    }

    // Floating [WINDSTREAM] Aether Billboard
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.stroke();
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#f0f9ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪽 RÜZGAR AKINTISI', 128, 32);
    const spriteTex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex }));
    sprite.position.set(0, 3.2, 0);
    sprite.scale.set(3.6, 0.9, 1);
    group.add(sprite);

    const light = new THREE.PointLight(color, 2.0, 12, 2);
    group.add(light);

    group.userData = { ring, innerVortex, orbs, active: false };
    worldObjects.add(group);
    return group;
  }

  function createDaevaWingsMesh() {
    const group = new THREE.Group();
    group.position.set(0, 1.45, -0.35); // Behind back

    // Left & Right Wings
    [-1, 1].forEach(side => {
      const wingGroup = new THREE.Group();
      // 5 Feather Strands radiating outwards
      for (let f = 0; f < 5; f++) {
        const fGeo = new THREE.ConeGeometry(0.18 - f * 0.02, 1.8 + f * 0.35, 6);
        fGeo.translate(0, (1.8 + f * 0.35) / 2, 0);
        const fMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x67e8f9,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.88,
          roughness: 0.2
        });
        const feather = new THREE.Mesh(fGeo, fMat);
        feather.rotation.z = side * (0.6 + f * 0.24);
        feather.rotation.x = 0.15;
        wingGroup.add(feather);
      }
      wingGroup.scale.x = side;
      wingGroup.name = side === 1 ? 'rightWing' : 'leftWing';
      group.add(wingGroup);
    });

    const auraLight = new THREE.PointLight(0x38bdf8, 1.8, 6, 2);
    group.add(auraLight);
    return group;
  }

  function createChestMesh(x, z, tierId, rank, isBonus = false) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const mainColor = isBonus ? 0xca8a04 : 0x475569;
    const trimColor = isBonus ? 0xfef08a : 0x38bdf8;

    // Chest Base Box
    const baseGeo = new THREE.BoxGeometry(1.6, 0.9, 1.1);
    const baseMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.35,
      metalness: 0.75
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.45;
    base.castShadow = true;
    group.add(base);

    // Metal Corner Bands
    [-0.72, 0.72].forEach(bx => {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.92, 1.12),
        new THREE.MeshStandardMaterial({ color: trimColor, metalness: 0.9, roughness: 0.2 })
      );
      band.position.set(bx, 0.45, 0);
      group.add(band);
    });

    // Chest Lid Pivot & Lid
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.9, -0.55);

    const lidGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.6, 12, 1, false, 0, Math.PI);
    const lidMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      roughness: 0.35,
      metalness: 0.75
    });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = -Math.PI / 2;
    lid.position.set(0, 0, 0.55);
    lid.castShadow = true;
    lidPivot.add(lid);

    // Glowing Keyhole Gem
    const lock = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: isBonus ? 0xfacc15 : 0x38bdf8 })
    );
    lock.position.set(0, 0.2, 1.12);
    lidPivot.add(lock);
    group.add(lidPivot);

    // Floating Nametag Sprite
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 70;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isBonus ? 'rgba(113, 63, 18, 0.92)' : 'rgba(15, 23, 42, 0.92)';
    ctx.roundRect(4, 4, 292, 62, 12);
    ctx.fill();
    ctx.strokeStyle = isBonus ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 292, 62, 12);
    ctx.stroke();
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = isBonus ? '#fef08a' : '#f0f9ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = isBonus ? '🌟 [E] S-Rank Abyss Sandığı' : `🎁 [E] ${rank}-Rank Sandık`;
    ctx.fillText(label, 150, 35);

    const sTex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sTex }));
    sprite.position.set(0, 1.85, 0);
    sprite.scale.set(3.2, 0.75, 1);
    group.add(sprite);

    const chestLight = new THREE.PointLight(isBonus ? 0xfacc15 : 0x38bdf8, 1.6, 8, 2);
    chestLight.position.set(0, 1.2, 0);
    group.add(chestLight);

    worldObjects.add(group);
    return {
      id: 'chest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      x,
      z,
      tierId,
      rank,
      isBonusChest: isBonus,
      claimed: false,
      mesh: group,
      lidMesh: lidPivot,
      sprite: sprite
    };
  }

  function showDungeonMechanicBanner(text, duration = 4000) {
    const el = document.getElementById('dungeon-mechanic-banner');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    playBeep(659, 'triangle', 0.22);
    if (dungeonState.mechanicBannerTimeout) clearTimeout(dungeonState.mechanicBannerTimeout);
    dungeonState.mechanicBannerTimeout = setTimeout(() => {
      el.classList.add('hidden');
    }, duration);
  }

  function triggerWindstreamFlight(stageIdx) {
    if (dungeonState.isGliding) return;
    dungeonState.isGliding = true;
    dungeonState.glideStart = performance.now();
    dungeonState.glideDuration = 1600;

    if (stageIdx === 1) {
      dungeonState.glideFrom = { x: 0, y: 0, z: -25 };
      dungeonState.glideTo = { x: 0, y: 0, z: -5 };
      dungeonState.stage = 2;
    } else {
      dungeonState.glideFrom = { x: 0, y: 0, z: 25 };
      dungeonState.glideTo = { x: 0, y: 0, z: 43 };
      dungeonState.stage = 3;
    }

    // Play wind woosh arpeggio
    [440, 554, 659, 880].forEach((freq, idx) => {
      setTimeout(() => playBeep(freq, 'sine', 0.16), idx * 80);
    });

    // Attach Daeva Aether Wings
    if (myMesh) {
      if (dungeonState.daevaWingsMesh) myMesh.remove(dungeonState.daevaWingsMesh);
      dungeonState.daevaWingsMesh = createDaevaWingsMesh();
      myMesh.add(dungeonState.daevaWingsMesh);
    }
  }

  function updateDungeonRuntime(delta, now) {
    if (!dungeonState.active) return;

    // 1. Update Timer & Elapsed Seconds
    if (!dungeonState.bossDefeated) {
      dungeonState.elapsedSec = Math.max(0, (now - dungeonState.startTime) / 1000);
    }
    const mins = Math.floor(dungeonState.elapsedSec / 60);
    const secs = Math.floor(dungeonState.elapsedSec % 60);
    const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // 2. Real-Time Rank Calculation (Dark Poeta Time-Attack)
    let currentRank = 'C';
    if (dungeonState.score >= 2400 && dungeonState.elapsedSec <= 160) {
      currentRank = 'S';
    } else if (dungeonState.score >= 1800 && dungeonState.elapsedSec <= 240) {
      currentRank = 'A';
    } else if (dungeonState.score >= 1200 && dungeonState.elapsedSec <= 320) {
      currentRank = 'B';
    }
    dungeonState.rank = currentRank;

    // Update HUD Elements
    const hudTimer = document.getElementById('dungeon-timer');
    if (hudTimer) hudTimer.textContent = timerStr;
    const hudScore = document.getElementById('dungeon-score');
    if (hudScore) hudScore.textContent = dungeonState.score;
    const hudRank = document.getElementById('dungeon-rank');
    if (hudRank) {
      hudRank.textContent = currentRank;
      hudRank.className = `dungeon-hud-val rank-${currentRank}`;
    }
    const hudStage = document.getElementById('dungeon-stage-text');
    if (hudStage) hudStage.textContent = `Aşama ${dungeonState.stage} / 3`;

    // 3. Windstream Rings Animation & Proximity Trigger
    [
      { mesh: dungeonState.windstream1Mesh, stage: 1, active: dungeonState.stage1Cleared, triggerPos: { x: 0, z: -25 } },
      { mesh: dungeonState.windstream2Mesh, stage: 2, active: dungeonState.stage2Cleared, triggerPos: { x: 0, z: 25 } }
    ].forEach(ws => {
      if (ws.mesh) {
        if (ws.mesh.userData.innerVortex) {
          ws.mesh.userData.innerVortex.rotation.z += 0.04;
        }
        if (ws.mesh.userData.orbs) {
          ws.mesh.userData.orbs.forEach((orb, idx) => {
            const a = now * 0.003 + (idx * Math.PI) / 2;
            orb.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
          });
        }
        // Check player stepped into active ring
        if (ws.active && !dungeonState.isGliding) {
          const d = Math.hypot(myPlayer.x - ws.triggerPos.x, myPlayer.z - ws.triggerPos.z);
          if (d <= 3.2 && dungeonState.stage === ws.stage) {
            triggerWindstreamFlight(ws.stage);
          }
        }
      }
    });

    // 4. Parabolic Flight Curve Animation
    if (dungeonState.isGliding) {
      const elapsed = now - dungeonState.glideStart;
      const p = Math.min(1.0, elapsed / dungeonState.glideDuration);

      // Parabolic arc: peak altitude 5.8m at p = 0.5
      const arcY = Math.sin(p * Math.PI) * 5.8;
      const curX = dungeonState.glideFrom.x + (dungeonState.glideTo.x - dungeonState.glideFrom.x) * p;
      const curZ = dungeonState.glideFrom.z + (dungeonState.glideTo.z - dungeonState.glideFrom.z) * p;

      myPlayer.x = curX;
      myPlayer.z = curZ;
      myPlayer.y = arcY;
      if (myMesh) {
        myMesh.position.set(curX, arcY, curZ);
        myMesh.rotation.y = Math.atan2(dungeonState.glideTo.x - dungeonState.glideFrom.x, dungeonState.glideTo.z - dungeonState.glideFrom.z);
        // Flap wings
        if (dungeonState.daevaWingsMesh) {
          const flap = Math.sin(now * 0.02) * 0.45;
          const lw = dungeonState.daevaWingsMesh.getObjectByName('leftWing');
          const rw = dungeonState.daevaWingsMesh.getObjectByName('rightWing');
          if (lw) lw.rotation.y = flap;
          if (rw) rw.rotation.y = -flap;
        }
      }

      if (p >= 1.0) {
        // Landing
        dungeonState.isGliding = false;
        myPlayer.y = 0;
        if (myMesh) {
          myMesh.position.y = 0;
          if (dungeonState.daevaWingsMesh) {
            myMesh.remove(dungeonState.daevaWingsMesh);
            dungeonState.daevaWingsMesh = null;
          }
        }
        createShockwaveRing(myPlayer.x, myPlayer.z, 3.8, 0x38bdf8);
        playBeep(523, 'triangle', 0.2);

        if (dungeonState.stage === 2) {
          showDungeonMechanicBanner('⚡ AŞAMA 2: Kapı Muhafızı Archon\'u alt et!', 3500);
        } else if (dungeonState.stage === 3) {
          showDungeonMechanicBanner('👑 SON AŞAMA: Tahabata Aether Hükümdarı ile yüzleş!', 4000);
        }
      }
      return;
    }

    // 5. Boss Phase 2 & 3 Mechanics Monitoring
    const boss = activeCombatMobs.find(m => m.isBoss && !m.isDead);
    if (boss) {
      const bossHpPct = boss.hp / boss.maxHP;
      const bossHud = document.getElementById('combat-boss-hud');
      if (bossHud && bossHud.classList.contains('hidden')) {
        bossHud.classList.remove('hidden');
      }

      // Keep Boss Shield attached if active
      if (dungeonState.phase2ShieldActive && dungeonState.bossShieldMesh) {
        dungeonState.bossShieldMesh.position.set(boss.x, boss.y + 1.8, boss.z);
        dungeonState.bossShieldMesh.rotation.y += 0.02;
      }

      // Phase 2: HP <= 60%
      if (bossHpPct <= 0.60 && !dungeonState.phase2Triggered) {
        dungeonState.phase2Triggered = true;
        dungeonState.phase2ShieldActive = true;

        // Spawn Boss Shield Dome
        const shieldGeo = new THREE.SphereGeometry(3.6, 24, 24);
        const shieldMat = new THREE.MeshBasicMaterial({
          color: 0xd946ef,
          transparent: true,
          opacity: 0.45,
          wireframe: true
        });
        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(boss.x, boss.y + 1.8, boss.z);
        worldObjects.add(shieldMesh);
        dungeonState.bossShieldMesh = shieldMesh;

        // Spawn 3 Resonance Crystals
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          const cx = boss.x + Math.cos(ang) * 7.5;
          const cz = boss.z + Math.sin(ang) * 7.5;
          spawnCombatMob('resonance_crystal', cx, cz, { dungeonStage: 3 });
        }

        showDungeonMechanicBanner('🔮 PATRON AETHER KALKANI AÇTI! %90 HASAR AZALTMA! 3 Rezonans Kristalini yok et!', 5000);
        playBeep(260, 'sawtooth', 0.4);
      }

      // Phase 3: HP <= 25% (Abyssal Cataclysm 4.5s Channel + Safe Zone Dome)
      if (bossHpPct <= 0.25 && !dungeonState.phase3Triggered) {
        dungeonState.phase3Triggered = true;
        dungeonState.phase3SafeZoneActive = true;

        // Spawn Safe Zone Dome at (0, 0, 54)
        const domeGeo = new THREE.SphereGeometry(6.0, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide
        });
        const domeMesh = new THREE.Mesh(domeGeo, domeMat);
        domeMesh.position.set(dungeonState.safeZonePos.x, 0, dungeonState.safeZonePos.z);
        worldObjects.add(domeMesh);
        dungeonState.safeZoneMesh = domeMesh;

        showDungeonMechanicBanner('⚠️ ABYSSAL CATACLYSM GELİYOR (4.5s)! GÜVENLİ AETHER KUBBESİNE GİR!', 4500);
        playBeep(440, 'square', 0.3);

        setTimeout(() => {
          // Cataclysm Wipe Blast Execution
          if (!dungeonState.active) return;
          createShockwaveRing(boss.x, boss.z, 22.0, 0xef4444);
          playBeep(130, 'sawtooth', 0.5);

          const distToSafe = Math.hypot(myPlayer.x - dungeonState.safeZonePos.x, myPlayer.z - dungeonState.safeZonePos.z);
          if (distToSafe <= dungeonState.safeZoneRadius) {
            // Safe inside dome
            dungeonState.score += 500;
            showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, '🛡️ KUBBE KORUMASI! +500 PUAN', 'heal');
            playVictoryJingle();
          } else {
            // Out of safe zone -> take catastrophic wipe damage!
            const cataclysmDmg = Math.round(playerMaxHP * 0.85);
            playerHP = Math.max(1, playerHP - cataclysmDmg);
            updateCombatHUD();
            screenShakeTimer = 0.45;
            screenShakeMagnitude = 0.65;
            showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `💥 ABYSSAL CATACLYSM! -${cataclysmDmg}`, 'crit');
          }

          if (dungeonState.safeZoneMesh) {
            worldObjects.remove(dungeonState.safeZoneMesh);
            dungeonState.safeZoneMesh = null;
          }
          dungeonState.phase3SafeZoneActive = false;
        }, 4500);
      }
    }

    // Check viewer buff expiration
    if (dungeonState.viewerBuffActive && now >= dungeonState.viewerBuffUntil) {
      dungeonState.viewerBuffActive = false;
      if (dungeonState.viewerBuffMesh && myMesh) {
        myMesh.remove(dungeonState.viewerBuffMesh);
        dungeonState.viewerBuffMesh = null;
      }
    }
  }

  function onDungeonMobDefeated(mob) {
    // Score awards
    if (mob.isCrystal) {
      dungeonState.score += 150;
    } else if (mob.isResonanceCrystal) {
      dungeonState.score += 200;
    } else if (mob.isElite) {
      dungeonState.score += 400;
    } else if (mob.isBoss) {
      dungeonState.score += 1000;
    } else {
      dungeonState.score += 80;
    }

    // Resonance Crystal Shatter Check
    if (mob.isResonanceCrystal) {
      const remainingRes = activeCombatMobs.filter(m => m.isResonanceCrystal && !m.isDead && m !== mob);
      if (remainingRes.length === 0) {
        dungeonState.phase2ShieldActive = false;
        if (dungeonState.bossShieldMesh) {
          worldObjects.remove(dungeonState.bossShieldMesh);
          dungeonState.bossShieldMesh = null;
        }
        const b = activeCombatMobs.find(m => m.isBoss && !m.isDead);
        if (b) {
          b.staggeredUntil = performance.now() + 6000;
          createShockwaveRing(b.x, b.z, 6.0, 0x38bdf8);
        }
        dungeonState.score += 600;
        showDungeonMechanicBanner('💥 REZONANS KALKANI PARÇALANDI! Patron 6 saniye sersemletildi (+%50 Hasar)!', 4000);
        playVictoryJingle();
      }
    }

    // Stage 1 Clear Check (2 Crystals + 4 Guardians)
    if (dungeonState.stage === 1 && !dungeonState.stage1Cleared) {
      const stage1Remaining = activeCombatMobs.filter(m => !m.isDead && (m.type === 'aether_crystal' || m.type === 'aether_guardian'));
      if (stage1Remaining.length === 0) {
        dungeonState.stage1Cleared = true;
        if (dungeonState.barrier1Mesh) {
          worldObjects.remove(dungeonState.barrier1Mesh);
          dungeonState.barrier1Mesh = null;
        }
        createShockwaveRing(0, -28.2, 12.0, 0x38bdf8);
        playVictoryJingle();
        showDungeonMechanicBanner('✨ AŞAMA 1 TAMAMLANDI! Rüzgar Akıntısına (Windstream) gir ve uç!', 4000);
      }
    }

    // Stage 2 Clear Check (Archon Mini-Boss)
    if (dungeonState.stage === 2 && !dungeonState.stage2Cleared) {
      const archonRemaining = activeCombatMobs.filter(m => !m.isDead && m.type === 'abyss_archon_mini');
      if (archonRemaining.length === 0) {
        dungeonState.stage2Cleared = true;
        if (dungeonState.barrier2Mesh) {
          worldObjects.remove(dungeonState.barrier2Mesh);
          dungeonState.barrier2Mesh = null;
        }
        createShockwaveRing(0, 21.8, 12.0, 0xc084fc);
        playVictoryJingle();
        showDungeonMechanicBanner('✨ AŞAMA 2 TAMAMLANDI! 2. Rüzgar Akıntısına girerek patron sunağına uç!', 4000);
      }
    }

    // Stage 3 Clear Check (Tahabata Boss)
    if (mob.isBoss) {
      dungeonState.bossDefeated = true;
      handleDungeonVictory();
    }
  }

  function handleDungeonVictory() {
    playVictoryJingle();

    // Stop Timer & calculate rank
    const finalScore = dungeonState.score;
    const elapsed = dungeonState.elapsedSec;
    let finalRank = 'C';
    if (finalScore >= 2400 && elapsed <= 160) finalRank = 'S';
    else if (finalScore >= 1800 && elapsed <= 240) finalRank = 'A';
    else if (finalScore >= 1200 && elapsed <= 320) finalRank = 'B';
    dungeonState.rank = finalRank;

    // Show Victory Banner
    const vBanner = document.getElementById('dungeon-victory-banner');
    if (vBanner) {
      vBanner.classList.remove('hidden');
      const rankBadge = document.getElementById('dv-rank-circle') || document.getElementById('vic-rank-badge');
      if (rankBadge) {
        rankBadge.textContent = finalRank;
        rankBadge.className = `dv-rank-circle rank-${finalRank}`;
      }
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const titleEl = document.getElementById('dv-title');
      const zName = (ZONE_CONFIGS[getDungeonBaseTier(dungeonState.tierId)] || ZONE_CONFIGS.dungeon_tier_1).name;
      if (titleEl) titleEl.textContent = `${zName} Fethedildi!`;
      const summaryEl = document.getElementById('dv-summary');
      if (summaryEl) summaryEl.textContent = `Süre: ${timeStr} • Toplam Puan: ${finalScore} • Sunaktaki Hazine Sandıklarını [E] ile Aç!`;
    }

    // Spawn Physical 3D Chests
    spawnDungeonTreasureChests();

    // Spawn Exit Portal Gate back to Town at (0, 72)
    const exitPortal = createBattlePortalGate(0, 72, 'Kasabaya Dön');
    exitPortal.rotation.y = Math.PI;
    worldObjects.add(exitPortal);

    addChatMessage('👑 ZİNDAN TAMAMLANDI', `🎉 ${(ZONE_CONFIGS[getDungeonBaseTier(dungeonState.tierId)] || ZONE_CONFIGS.dungeon_tier_1).name} zindanı [${finalRank}-Rank] ile tamamlandı! Meydandaki sandıkları açabilirsin!`);
  }

  function spawnDungeonTreasureChests() {
    activeDungeonChests = [];

    // Normal Dungeon Chest at (-2.8, 56)
    const normalChest = createChestMesh(-2.8, 56, dungeonState.tierId, dungeonState.rank, false);
    activeDungeonChests.push(normalChest);

    // If S-Rank, spawn Golden S-Rank Abyssal Chest at (2.8, 56)
    if (dungeonState.rank === 'S') {
      const sChest = createChestMesh(2.8, 56, dungeonState.tierId, dungeonState.rank, true);
      activeDungeonChests.push(sChest);
    }
  }

  function claimDungeonChestFromWorld(chest) {
    if (!chest || chest.claimed) return;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_DUNGEON_CHEST_CLAIM',
        instanceId: currentMap,
        tierId: getDungeonBaseTier(dungeonState.tierId),
        rank: dungeonState.rank,
        isBonusChest: Boolean(chest.isBonusChest),
        chestId: chest.id
      }));
    } else {
      // REST API fallback
      fetch('/api/world/dungeon/claim-chest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: myPlayer.username,
          tierId: getDungeonBaseTier(dungeonState.tierId),
          rank: dungeonState.rank,
          isBonusChest: Boolean(chest.isBonusChest)
        })
      }).then(r => r.json()).then(data => {
        if (data && (data.success || data.ok)) {
          chest.claimed = true;
          playVictoryJingle();
          if (typeof data.newTotalPrimo === 'number') {
            myPlayer.primogems = data.newTotalPrimo;
            updateUIProfile();
          }
          fetchRpgProfile();
          fetchInventory();
          if (chest.lidMesh) chest.lidMesh.rotation.x = -Math.PI / 2.6;
          createShockwaveRing(chest.x, chest.z, 3.5, chest.isBonusChest ? 0xfacc15 : 0x38bdf8);
          showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `🎁 +${data.primoGain} 💎 +${data.wishes || 1} Dilek!`, 'crit');
          if (data.equipment) showRpgDropToast(data.equipment);
          addChatMessage('🎁 Zindan Sandığı', `✨ ${data.message || 'Zindan hazinesi açıldı!'}`);
        } else {
          alert(data.message || 'Sandık açılamadı.');
        }
      }).catch(e => console.error('Chest claim error:', e));
    }
  }

  function buildAionDungeonMap(tierId = 'dungeon_tier_1') {
    currentMap = tierId;
    const baseTier = getDungeonBaseTier(tierId);
    const zone = ZONE_CONFIGS[baseTier] || ZONE_CONFIGS.dungeon_tier_1;

    while (worldObjects.children.length > 0) {
      worldObjects.remove(worldObjects.children[0]);
    }

    activeCombatMobs = [];
    activeDropGems = [];
    activeSlashTrails = [];
    activeProjectiles = [];
    activeSkillshots = [];
    activeSkillAimState = null;
    skillAimIndicatorGroup = null;
    vortexMesh = null;
    isVortexActive = false;
    targetReticleMesh = null;
    lockedTargetMob = null;
    combatComboHits = 0;
    activeDungeonChests = [];

    setMapAtmosphere(tierId);

    // Clear any pending danger telegraphs
    for (let tg of activeTelegraphs) {
      if (tg.cleanup) tg.cleanup();
      else worldObjects.remove(tg.group);
    }
    activeTelegraphs = [];

    // Reset Dungeon State
    dungeonState.active = true;
    dungeonState.tierId = tierId;
    dungeonState.stage = 1;
    dungeonState.startTime = performance.now();
    dungeonState.elapsedSec = 0;
    dungeonState.score = 0;
    dungeonState.rank = 'S';
    dungeonState.stage1Cleared = false;
    dungeonState.stage2Cleared = false;
    dungeonState.bossDefeated = false;
    dungeonState.phase2Triggered = false;
    dungeonState.phase2ShieldActive = false;
    dungeonState.phase3Triggered = false;
    dungeonState.phase3SafeZoneActive = false;
    dungeonState.isGliding = false;
    dungeonState.safeZoneMesh = null;
    dungeonState.bossShieldMesh = null;

    // Location name HUD
    const locEl = document.getElementById('ui-location');
    if (locEl) locEl.textContent = `⚔️ ${zone.name} [GS ${zone.reqGS}]`;

    // Equip player weapon and show combat + dungeon HUD
    attachCombatWeapon();
    document.getElementById('combat-hud')?.classList.remove('hidden');
    document.getElementById('combat-boss-hud')?.classList.add('hidden');
    document.getElementById('dungeon-hud')?.classList.remove('hidden');
    document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
    document.getElementById('dungeon-mechanic-banner')?.classList.add('hidden');

    const stats = getPlayerEffectiveStats();
    playerMaxHP = stats.hp;
    playerHP = playerMaxHP;
    playerStamina = playerMaxStamina;
    playerEnergy = 40;
    updateCombatHUD();

    // ---------------------------------------------------------
    // ARCHITECTURE: 3 Floating Platforms Separated by Abyssal Void
    // ---------------------------------------------------------

    // Theme Colors
    const isDarkPoeta = tierId === 'dungeon_tier_2';
    const isAbyssCore = tierId === 'dungeon_tier_3';
    const stoneCol = isAbyssCore ? 0x090d16 : (isDarkPoeta ? 0x18181b : 0x1e1b4b);
    const runeCol = isAbyssCore ? 0xd946ef : (isDarkPoeta ? 0xef4444 : 0x38bdf8);
    const platformMat = new THREE.MeshStandardMaterial({ color: stoneCol, roughness: 0.65, metalness: 0.5 });
    const runeMat = new THREE.MeshBasicMaterial({ color: runeCol, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });

    // --- PLATFORM 1 (Stage 1: Aether Corridor Entrance) ---
    // Z: -64 to -28 (Center Z: -46, Length: 36, Width: 44)
    const plat1 = new THREE.Mesh(new THREE.BoxGeometry(44, 4.0, 36), platformMat);
    plat1.position.set(0, -2.0, -46);
    plat1.receiveShadow = true;
    worldObjects.add(plat1);

    // Decorative Rune Border
    const runeBorder1 = new THREE.Mesh(new THREE.RingGeometry(16, 17.5, 32), runeMat);
    runeBorder1.rotation.x = -Math.PI / 2;
    runeBorder1.position.set(0, 0.03, -46);
    worldObjects.add(runeBorder1);

    // Return Portal to Town at (0, 0, -66)
    const returnPortal = createBattlePortalGate(0, -66, 'Kasabaya Dön');
    returnPortal.rotation.y = Math.PI;
    worldObjects.add(returnPortal);

    // 8 Ancient Aether Obelisks framing Platform 1
    [-18, 18].forEach(px => {
      [-60, -50, -40, -32].forEach(pz => {
        const obelisk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7.5, 1.6), platformMat);
        obelisk.position.set(px, 3.75, pz);
        obelisk.castShadow = true;
        worldObjects.add(obelisk);

        const obRune = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.45, 1.65), runeMat);
        obRune.position.set(px, 4.5, pz);
        worldObjects.add(obRune);
      });
    });

    // Stage 1 Barrier at Z = -28.2
    dungeonState.barrier1Mesh = createAetherBarrierMesh(0, -28.2, 44, 7.0, runeCol);

    // Windstream Ring 1 at (0, 2.2, -25)
    dungeonState.windstream1Mesh = createWindstreamRingMesh(0, 2.2, -25, runeCol);

    // --- PLATFORM 2 (Stage 2: Astral Crossroads) ---
    // Z: -8 to 22 (Center Z: 7, Length: 30, Width: 40)
    const plat2 = new THREE.Mesh(new THREE.BoxGeometry(40, 4.0, 30), platformMat);
    plat2.position.set(0, -2.0, 7);
    plat2.receiveShadow = true;
    worldObjects.add(plat2);

    const runeBorder2 = new THREE.Mesh(new THREE.RingGeometry(12, 13.5, 28), runeMat);
    runeBorder2.rotation.x = -Math.PI / 2;
    runeBorder2.position.set(0, 0.03, 7);
    worldObjects.add(runeBorder2);

    // Stage 2 Barrier at Z = 21.8
    dungeonState.barrier2Mesh = createAetherBarrierMesh(0, 21.8, 40, 7.0, isAbyssCore ? 0xef4444 : 0xc084fc);

    // Windstream Ring 2 at (0, 2.2, 25)
    dungeonState.windstream2Mesh = createWindstreamRingMesh(0, 2.2, 25, isAbyssCore ? 0xef4444 : 0xc084fc);

    // --- PLATFORM 3 (Stage 3: Tahabata Altar Dais) ---
    // Z: 40 to 75 (Center Z: 57.5, Length: 35, Width: 52)
    const plat3 = new THREE.Mesh(new THREE.CylinderGeometry(25, 26, 4.0, 36), platformMat);
    plat3.position.set(0, -2.0, 57.5);
    plat3.receiveShadow = true;
    worldObjects.add(plat3);

    // Elevated Boss Dais Center at (0, 0, 58)
    const bossDais = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 12.8, 0.6, 32), platformMat);
    bossDais.position.set(0, 0.3, 58);
    worldObjects.add(bossDais);

    const bossRuneCircle = new THREE.Mesh(new THREE.RingGeometry(7.5, 8.8, 32), runeMat);
    bossRuneCircle.rotation.x = -Math.PI / 2;
    bossRuneCircle.position.set(0, 0.62, 58);
    worldObjects.add(bossRuneCircle);

    // Inverted Underneath Stalactites in Abyssal Void
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x05070e, roughness: 0.9 });
    for (let s = 0; s < 18; s++) {
      const sx = (Math.random() - 0.5) * 50;
      const sz = -55 + Math.random() * 115;
      const h = 10 + Math.random() * 12;
      const stal = new THREE.Mesh(new THREE.ConeGeometry(2.0, h, 6), voidMat);
      stal.rotation.x = Math.PI;
      stal.position.set(sx, -h / 2 - 2.0, sz);
      worldObjects.add(stal);
    }

    // Orbiting Stardust Asteroids in Void Gaps
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    for (let a = 0; a < 14; a++) {
      const ax = -30 + (a % 2 === 0 ? 0 : 60) + (Math.random() - 0.5) * 12;
      const az = -60 + a * 9.5;
      const ay = -2.0 + Math.sin(a) * 4.0;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + Math.random() * 0.8), rockMat);
      rock.position.set(ax, ay, az);
      worldObjects.add(rock);
    }

    // KayKit Ancient Ruined Structures & Mine Shafts in the Abyssal Cavern (Grand Scale)
    spawnKayKitModel('/assets/models/kaykit/buildings/neutral/building_destroyed.gltf', {
      x: -18, y: 0.2, z: -16, rotY: 0.4, scale: 7.5
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/neutral/building_destroyed.gltf', {
      x: 18, y: 0.2, z: -16, rotY: -0.4, scale: 7.5
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_mine_blue.gltf', {
      x: 0, y: 0.2, z: -58, rotY: 0, scale: 8.5
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/crate_open.gltf', {
      x: -12, y: 0.6, z: 48, scale: 3.5
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/crate_long_A.gltf', {
      x: 12, y: 0.6, z: 48, scale: 3.5
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/sack.gltf', {
      x: 13.5, y: 0.6, z: 47, scale: 3.2
    });

    // ---------------------------------------------------------
    // SPAWN DUNGEON MOBS (Synchronized via Server Instance)
    // ---------------------------------------------------------
    if (Array.isArray(pendingDungeonMobs) && pendingDungeonMobs.length > 0) {
      for (const sm of pendingDungeonMobs) {
        if (!sm.isDead) spawnServerSyncedMob(sm);
      }
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'DUNGEON_REQUEST_MOBS', instanceId: tierId }));
    } else if (!pendingDungeonMobs || pendingDungeonMobs.length === 0) {
      const diff = zone.tier || 1;
      const hpMult = diff === 3 ? 1.45 : (diff === 2 ? 1.2 : 1.0);
      const dmgMult = diff === 3 ? 1.35 : (diff === 2 ? 1.15 : 1.0);

      // STAGE 1: 2 Aether Crystals + 4 Guardians
      spawnCombatMob('aether_crystal', -8, -44, { hpMult, dmgMult, dungeonStage: 1 });
      spawnCombatMob('aether_crystal', 8, -44, { hpMult, dmgMult, dungeonStage: 1 });
      spawnCombatMob('aether_guardian', -12, -50, { hpMult, dmgMult, dungeonStage: 1 });
      spawnCombatMob('aether_guardian', 12, -50, { hpMult, dmgMult, dungeonStage: 1 });
      spawnCombatMob('aether_guardian', -6, -36, { hpMult, dmgMult, dungeonStage: 1 });
      spawnCombatMob('aether_guardian', 6, -36, { hpMult, dmgMult, dungeonStage: 1 });

      // STAGE 2: 1 Archon Mini-Boss + 2 Void Mages
      spawnCombatMob('abyss_archon_mini', 0, 8, { hpMult, dmgMult, dungeonStage: 2 });
      spawnCombatMob('abyss_mage', -10, 10, { hpMult, dmgMult, dungeonStage: 2 });
      spawnCombatMob('abyss_mage', 10, 10, { hpMult, dmgMult, dungeonStage: 2 });

      // STAGE 3: Final Boss Tahabata Lord
      spawnCombatMob('tahabata_lord', 0, 58, { hpMult, dmgMult, dungeonStage: 3 });
    }

    // Check Player GS
    const playerGS = getMyGearScore();
    const penalty = getGsDifficultyMultiplier(playerGS, zone.reqGS);
    if (penalty.status === 'deadly') {
      addChatMessage('⚠️ Tehlike', `🔴 ${zone.name} zindanındasın! GearScore'un yetersiz (${playerGS}/${zone.reqGS} GS). Vuruşların sekebilir ve yaratıklar ölümcül hasar verir!`);
    } else if (penalty.status === 'challenging') {
      addChatMessage('⚠️ Dikkat', `🟡 ${zone.name} zorlu bir zindan (${playerGS}/${zone.reqGS} GS). Hasarında hafif düşüş olacak.`);
    } else {
      addChatMessage('⚔️ Zindan', `🟢 ${zone.name} zindanına hoş geldin! [GS ${playerGS}/${zone.reqGS} - Tam Hasar]`);
    }

    showDungeonMechanicBanner('⚔️ AETHER KORİDORU BAŞLADI! Mühür Kristallerini yok et!', 4000);
  }

  function buildPvPArenaMap() {
    clearWorld();
    currentMap = 'pvp_arena';
    setMapAtmosphere('pvp_arena');

    activeCombatMobs = [];
    activeDropGems = [];
    activeSlashTrails = [];
    activeProjectiles = [];
    activeSkillshots = [];
    activeSkillAimState = null;
    skillAimIndicatorGroup = null;
    vortexMesh = null;
    isVortexActive = false;
    targetReticleMesh = null;
    lockedTargetMob = null;
    combatComboHits = 0;

    for (let tg of activeTelegraphs) {
      if (tg.cleanup) tg.cleanup();
      else worldObjects.remove(tg.group);
    }
    activeTelegraphs = [];

    const locEl = document.getElementById('ui-location');
    if (locEl) locEl.textContent = '⚔️ Gladyatör Arenası (PvP)';

    // 1. Central Sand Combat Pit (r <= 17.8m, y = 0.0)
    const sandGeo = new THREE.CircleGeometry(17.8, 64);
    const sandMat = new THREE.MeshLambertMaterial({
      map: createProceduralSandTexture(),
      bumpMap: createProceduralGrassNormalMap(),
      bumpScale: 0.025,
      color: 0x854d0e
    });
    const sandMesh = new THREE.Mesh(sandGeo, sandMat);
    sandMesh.rotation.x = -Math.PI / 2;
    sandMesh.position.y = 0.01;
    sandMesh.receiveShadow = true;
    worldObjects.add(sandMesh);

    // Center Arena Insignia (Bronze & Gold Octagram)
    const insBronze = new THREE.Mesh(
      new THREE.RingGeometry(11.0, 11.8, 48),
      new THREE.MeshStandardMaterial({ color: 0x5c2b09, roughness: 0.7 })
    );
    insBronze.rotation.x = -Math.PI / 2;
    insBronze.position.y = 0.02;
    worldObjects.add(insBronze);

    const insGold = new THREE.Mesh(
      new THREE.RingGeometry(4.8, 5.4, 32),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.8 })
    );
    insGold.rotation.x = -Math.PI / 2;
    insGold.position.y = 0.03;
    worldObjects.add(insGold);

    // Center Octagram Golden Star
    const starMat = new THREE.MeshBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.65 });
    for (let s = 0; s < 4; s++) {
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 8.5), starMat);
      rib.rotation.x = -Math.PI / 2;
      rib.rotation.z = (s * Math.PI) / 4;
      rib.position.y = 0.035;
      worldObjects.add(rib);
    }

    // 2. Inner Pit Retaining Barrier Wall (r = 18.0, height = 1.4m)
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });
    const barrierTopMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.7 });

    // Build curved stone barrier segments, leaving 4 archways at N, S, E, W
    const numSegments = 32;
    for (let i = 0; i < numSegments; i++) {
      if (i % 8 === 0 || i % 8 === 7) continue; // Gap for ramps

      const angle = (i / numSegments) * Math.PI * 2;
      const nextAngle = ((i + 1) / numSegments) * Math.PI * 2;
      const midAngle = (angle + nextAngle) / 2;
      const segWidth = (Math.PI * 2 * 18.0) / numSegments;

      const seg = new THREE.Mesh(new THREE.BoxGeometry(segWidth * 1.05, 1.4, 0.8), barrierMat);
      seg.position.set(Math.sin(midAngle) * 18.0, 0.7, Math.cos(midAngle) * 18.0);
      seg.rotation.y = midAngle;
      seg.castShadow = true;
      seg.receiveShadow = true;
      worldObjects.add(seg);

      // Travertine coping stone on top
      const topCoping = new THREE.Mesh(new THREE.BoxGeometry(segWidth * 1.08, 0.2, 1.0), barrierTopMat);
      topCoping.position.set(Math.sin(midAngle) * 18.0, 1.4, Math.cos(midAngle) * 18.0);
      topCoping.rotation.y = midAngle;
      worldObjects.add(topCoping);
    }

    // Four Cardinal Stair Ramps leading down into the pit
    [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach(cardAngle => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 3.2), barrierTopMat);
      ramp.position.set(Math.sin(cardAngle) * 18.0, 0.6, Math.cos(cardAngle) * 18.0);
      ramp.rotation.y = cardAngle;
      ramp.rotation.x = cardAngle === 0 || cardAngle === Math.PI ? 0.35 : 0;
      ramp.rotation.z = cardAngle === Math.PI / 2 || cardAngle === (Math.PI * 3) / 2 ? 0.35 : 0;
      worldObjects.add(ramp);
    });

    // 3. Elevated Spectator Terrace (Tribün) (r = 18.2 to 34.5, y = 1.2m)
    const terraceGeo = new THREE.RingGeometry(18.2, 34.5, 64);
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.7 });
    const terrace = new THREE.Mesh(terraceGeo, marbleMat);
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.y = 1.2;
    terrace.receiveShadow = true;
    worldObjects.add(terrace);

    // Three Stepped Tier Seating Rings
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.75 });
    [
      { r1: 22.0, r2: 25.5, y: 1.6, h: 0.4 },
      { r1: 26.0, r2: 29.5, y: 2.0, h: 0.8 },
      { r1: 30.0, r2: 33.5, y: 2.4, h: 1.2 }
    ].forEach(t => {
      const tierMesh = new THREE.Mesh(new THREE.CylinderGeometry(t.r2, t.r2, t.h, 48, 1, true), tierMat);
      tierMesh.position.y = 1.2 + t.h / 2;
      worldObjects.add(tierMesh);

      const seatFloor = new THREE.Mesh(new THREE.RingGeometry(t.r1, t.r2, 48), tierMat);
      seatFloor.rotation.x = -Math.PI / 2;
      seatFloor.position.y = t.y;
      worldObjects.add(seatFloor);
    });

    // 4. Grand Roman Colonnade & Torches (16 Pillars at r = 33.0)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.65 });
    const capitalMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.45, metalness: 0.7 });

    for (let p = 0; p < 16; p++) {
      const pAngle = (p / 16) * Math.PI * 2;
      const px = Math.sin(pAngle) * 33.0;
      const pz = Math.cos(pAngle) * 33.0;

      // Pillar Column
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 6.5, 14), pillarMat);
      col.position.set(px, 1.2 + 3.25, pz);
      col.castShadow = true;
      worldObjects.add(col);

      // Ornate Corinthian Weathered Bronze Capital
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.6), capitalMat);
      cap.position.set(px, 1.2 + 6.6, pz);
      worldObjects.add(cap);

      // Iron Torch / Brazier on every 2nd pillar
      if (p % 2 === 0) {
        const torchBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x292524 }));
        torchBase.position.set(px * 0.96, 4.2, pz * 0.96);
        worldObjects.add(torchBase);

        const flame = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
        flame.position.set(px * 0.96, 4.6, pz * 0.96);
        worldObjects.add(flame);

        const torchLight = new THREE.PointLight(0xf59e0b, 1.4, 14, 1.6);
        torchLight.position.set(px * 0.96, 4.7, pz * 0.96);
        worldObjects.add(torchLight);
      }
    }

    // Outer Monumental Enclosing Wall (r = 35.5, height = 10m)
    const outerWallMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(35.5, 35.5, 10.0, 64, 1, true), outerWallMat);
    outerWall.position.y = 5.0;
    worldObjects.add(outerWall);

    // KayKit Gladiator Arena Decor & Catapult Towers (Imposing Scale)
    spawnKayKitModel('/assets/models/kaykit/buildings/red/building_tower_catapult_red.gltf', {
      x: 0, y: 1.2, z: -32, rotY: Math.PI, scale: 7.5
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/blue/building_tower_catapult_blue.gltf', {
      x: 0, y: 1.2, z: 32, rotY: 0, scale: 7.5
    });

    // Heraldic Arena Banners along the Colonnade
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_red.gltf', {
      x: -6, y: 1.2, z: -27, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_red.gltf', {
      x: 6, y: 1.2, z: -27, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: -6, y: 1.2, z: 27, scale: 4.5, animatedFlag: true
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/flag_blue.gltf', {
      x: 6, y: 1.2, z: 27, scale: 4.5, animatedFlag: true
    });

    // Terrace Weapon Racks & Catapult Stone Piles
    spawnKayKitModel('/assets/models/kaykit/decoration/props/weaponrack.gltf', {
      x: -22, y: 1.2, z: 0, rotY: Math.PI / 2, scale: 3.8
    });
    spawnKayKitModel('/assets/models/kaykit/decoration/props/weaponrack.gltf', {
      x: 22, y: 1.2, z: 0, rotY: -Math.PI / 2, scale: 3.8
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/neutral/projectile_catapult.gltf', {
      x: -20, y: 1.2, z: 3.5, scale: 3.6
    });
    spawnKayKitModel('/assets/models/kaykit/buildings/neutral/projectile_catapult.gltf', {
      x: 20, y: 1.2, z: 3.5, scale: 3.6
    });

    // 5. Exit Portal Gate back to Town at (0, 1.2, -28)
    const returnPortal = createBattlePortalGate(0, -28, 'Kasabaya Dön');
    returnPortal.rotation.y = Math.PI;
    returnPortal.position.y = 1.2;
    worldObjects.add(returnPortal);

    // Initial setup
    attachCombatWeapon();
    document.getElementById('combat-hud')?.classList.remove('hidden');
    document.getElementById('pvp-hud')?.classList.remove('hidden');

    const stats = getPlayerEffectiveStats();
    playerMaxHP = Math.round(stats.hp * 2.5);
    playerHP = playerMaxHP;
    playerStamina = playerMaxStamina;
    playerEnergy = 50;
    updateCombatHUD();

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'PVP_REQUEST_LEADERBOARD' }));
    }

    addChatMessage('⚔️ Gladyatör Arenası', '🏛️ Gladyatör Kolombiyumu\'na hoş geldin! Kum havuzuna inerek serbest PvP savaşına katılabilir, seyirci terasında güvenle izleyebilirsin.');
  }

  // --- 13. Event Listeners ---
  function initEvents() {
    // Keyboard Input
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const k = e.key.toLowerCase();

      // RPG Dialogue Interception
      if (isRPGDialogueOpen) {
        if (k === 'e' || k === ' ' || k === 'enter') {
          e.preventDefault();
          advanceRPGDialogue();
          return;
        }
        if (k === 'escape') {
          e.preventDefault();
          closeRPGDialogue();
          return;
        }
        return; // Pause movement while talking
      }

      // Fish Catch Modal Quick Dismiss (Space / E / Enter / Escape)
      const fishCatchModal = document.getElementById('modal-fish-catch');
      if (fishCatchModal && !fishCatchModal.classList.contains('hidden')) {
        if (k === 'escape' || k === ' ' || k === 'enter' || k === 'e') {
          e.preventDefault();
          closeModal('modal-fish-catch');
          return;
        }
      }

      // River Fishing Interception
      if (isFishing) {
        if (fishingState === 'minigame') {
          if (k === ' ' || k === 'e' || k === 'arrowup' || k === 'w') {
            e.preventDefault();
            isReeling = true;
            return;
          }
          if (k === 'escape') {
            e.preventDefault();
            finishMinigameFail();
            return;
          }
          return;
        }
        if (fishingState === 'bite' && (k === 'e' || k === ' ' || k === 'enter')) {
          e.preventDefault();
          reelIn();
          return;
        }
        if (fishingState === 'waiting') {
          if (k === 'escape') {
            e.preventDefault();
            stopFishing();
            return;
          }
          if (k === 'e' || k === ' ' || k === 'enter') {
            e.preventDefault();
            reelIn();
            return;
          }
        }
        return; // Pause movement while fishing
      }

      // Combat Interception (Battle Zone: Hybrid Smartcast + Hold-to-Aim Skillshots)
      if (isBattleZone(currentMap)) {
        if (k === 'escape' && activeSkillAimState) {
          e.preventDefault();
          cancelSkillshotAim();
          return;
        }
        if (k === 'f') {
          if (e.repeat) return;
          e.preventDefault();
          performAttack();
          return;
        }
        if (k === 'r') {
          if (e.repeat) return;
          e.preventDefault();
          startSkillshotAim('r');
          return;
        }
        if (e.key === 'Shift') {
          if (e.repeat) return;
          e.preventDefault();
          performDash();
          return;
        }
        if (k === 'e') {
          if (nearbyInteractable && (nearbyInteractable.type === 'door' || nearbyInteractable.type === 'dungeon_chest')) {
            triggerInteract();
            return;
          }
          if (e.repeat) return;
          e.preventDefault();
          startSkillshotAim('e');
          return;
        }
        if (k === 'q') {
          if (e.repeat) return;
          e.preventDefault();
          startSkillshotAim('q');
          return;
        }
      }

      if (k === 'c') {
        e.preventDefault();
        toggleCharacterSheet();
        return;
      }
      if (k === 'i' || k === 'b') {
        e.preventDefault();
        toggleInventoryBagModal();
        return;
      }
      if (k === 'j') {
        e.preventDefault();
        toggleDailyQuestsModal();
        return;
      }
      if (k === 'p') {
        e.preventDefault();
        toggleCompanionModal();
        return;
      }
      if (k === 'escape') {
        closeItemPopover();
        closePlayerInteractMenu();
        closeModal('modal-character-sheet');
        closeModal('modal-inspect-player');
        closeModal('modal-portal-zones');
        closeModal('modal-companion-selector');
        closeModal('modal-inventory-bag');
        closeModal('modal-daily-quests');
        closeModal('modal-fish-catch');
      }

      if (k === 'w' || k === 'arrowup') keys.w = true;
      if (k === 's' || k === 'arrowdown') keys.s = true;
      if (k === 'a' || k === 'arrowleft') keys.a = true;
      if (k === 'd' || k === 'arrowright') keys.d = true;

      if (k === 'e' || k === ' ') {
        e.preventDefault();
        triggerInteract();
      }
    });

    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (isFishing && fishingState === 'minigame') {
        if (k === ' ' || k === 'e' || k === 'arrowup' || k === 'w') {
          isReeling = false;
        }
      }
      if (isBattleZone(currentMap)) {
        if (k === 'r' || k === 'e' || k === 'q') {
          releaseSkillshotAim(k);
        }
      }
      if (k === 'w' || k === 'arrowup') keys.w = false;
      if (k === 's' || k === 'arrowdown') keys.s = false;
      if (k === 'a' || k === 'arrowleft') keys.a = false;
      if (k === 'd' || k === 'arrowright') keys.d = false;
    });

    // Chat submit
    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';

      // Intercept Party Chat Commands
      if (text.startsWith('/p ') || text.startsWith('/party ')) {
        const parts = text.split(/\s+/);
        const cmd = parts[1] ? parts[1].toLowerCase() : '';
        const target = parts[2] ? parts[2].replace(/^@/, '') : '';

        if (cmd === 'davet' || cmd === 'invite') {
          if (!target) {
            addChatMessage('🛡️ Parti', 'Kullanım: /p davet @kullanici');
          } else if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PARTY_INVITE', targetUsername: target }));
          }
          return;
        } else if (cmd === 'cik' || cmd === 'leave' || cmd === 'ayril') {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PARTY_LEAVE' }));
          }
          return;
        } else if (cmd === 'at' || cmd === 'kick') {
          if (!target) {
            addChatMessage('🛡️ Parti', 'Kullanım: /p at @kullanici');
          } else {
            const mem = myParty && Array.isArray(myParty.members)
              ? myParty.members.find(m => m.username.toLowerCase() === target.toLowerCase())
              : null;
            if (mem && socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'PARTY_KICK', targetSocketId: mem.id }));
            } else {
              addChatMessage('🛡️ Parti', `@${target} partinde bulunamadı.`);
            }
          }
          return;
        }
      }

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_CHAT', text }));
      }
      if (myMesh) showSpeechBubble(myMesh, text);
      addChatMessage(myPlayer.username, text);
    });

    // Quick emote buttons
    document.getElementById('btn-quick-dance').onclick = () => {
      const dances = ['💃 Dans ediyor!', '🕺 Ritmi yakaladı!'];
      const text = dances[Math.floor(Math.random() * dances.length)];
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_CHAT', text }));
      }
    };
    document.getElementById('btn-quick-wave').onclick = () => {
      const text = '👋 Herkese selamlar!';
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_CHAT', text }));
      }
    };

    // Nav Bar Buttons
    const btnOpenInv = document.getElementById('btn-open-inventory');
    if (btnOpenInv) {
      btnOpenInv.onclick = () => toggleInventoryBagModal();
    }
    const btnOpenDaily = document.getElementById('btn-open-daily-quests');
    if (btnOpenDaily) {
      btnOpenDaily.onclick = () => toggleDailyQuestsModal();
    }
    const btnDqOpenModal = document.getElementById('btn-dq-open-modal');
    if (btnDqOpenModal) {
      btnDqOpenModal.onclick = (e) => {
        e.stopPropagation();
        openDailyQuestsModal();
      };
    }
    const dqTrackerHeader = document.getElementById('dq-tracker-header');
    if (dqTrackerHeader) {
      dqTrackerHeader.onclick = () => {
        const tracker = document.getElementById('daily-quest-tracker');
        if (tracker) tracker.classList.toggle('collapsed');
      };
    }
    const btnDqClaimAll = document.getElementById('btn-dq-claim-all');
    if (btnDqClaimAll) {
      btnDqClaimAll.onclick = () => claimDailyQuestReward('all');
    }
    const btnDqClaimChest = document.getElementById('btn-dq-claim-chest');
    if (btnDqClaimChest) {
      btnDqClaimChest.onclick = () => claimDailyQuestReward('bonus_chest');
    }
    document.querySelectorAll('.btn-inv-tab').forEach(tabBtn => {
      tabBtn.onclick = () => {
        const tabName = tabBtn.getAttribute('data-inv-tab') || 'rpg';
        switchInventoryBagTab(tabName);
      };
    });
    const btnInvGotoChar = document.getElementById('btn-inv-goto-character');
    if (btnInvGotoChar) {
      btnInvGotoChar.onclick = () => {
        closeModal('modal-inventory-bag');
        openCharacterSheet();
      };
    }
    const btnInvSellAllMat = document.getElementById('btn-inv-sell-all-mat');
    if (btnInvSellAllMat) {
      btnInvSellAllMat.onclick = async () => {
        await sellAllMaterialsFromInventoryModal();
      };
    }
    document.getElementById('btn-open-character').onclick = () => openCharacterSheet();
    document.getElementById('btn-open-auth').onclick = () => openModal('modal-auth');
    document.getElementById('btn-change-avatar').onclick = () => openModal('modal-avatar');

    // Profile Card & GS Badge Open Character Sheet
    const profileCard = document.getElementById('profile-card');
    if (profileCard) profileCard.onclick = () => openCharacterSheet();
    const gsBadge = document.getElementById('ui-gs-badge');
    if (gsBadge) gsBadge.onclick = (e) => { e.stopPropagation(); openCharacterSheet(); };

    // RPG Bag & Popover Action Buttons
    const btnSalvageJunk = document.getElementById('btn-salvage-junk');
    if (btnSalvageJunk) btnSalvageJunk.onclick = () => salvageJunk();
    const btnAutoEquip = document.getElementById('btn-auto-equip');
    if (btnAutoEquip) btnAutoEquip.onclick = () => autoEquipBestItems();

    const popoverBackdrop = document.getElementById('popover-backdrop');
    if (popoverBackdrop) popoverBackdrop.onclick = () => closeItemPopover();

    const btnPopoverEquip = document.getElementById('btn-popover-equip');
    if (btnPopoverEquip) btnPopoverEquip.onclick = () => {
      if (!selectedPopoverItem) return;
      if (selectedPopoverIsEquipped) {
        unequipItem(selectedPopoverItem.slot);
      } else {
        equipItem(selectedPopoverItem.uid);
      }
      closeItemPopover();
    };

    const btnPopoverUpgrade = document.getElementById('btn-popover-upgrade');
    if (btnPopoverUpgrade) btnPopoverUpgrade.onclick = () => {
      if (!selectedPopoverItem) return;
      upgradeItem(selectedPopoverItem.uid);
    };

    const btnPopoverSalvage = document.getElementById('btn-popover-salvage');
    if (btnPopoverSalvage) btnPopoverSalvage.onclick = () => {
      if (!selectedPopoverItem) return;
      salvageItem(selectedPopoverItem.uid);
      closeItemPopover();
    };

    // Player Proximity Menu Buttons
    const btnMenuInspect = document.getElementById('btn-menu-inspect');
    if (btnMenuInspect) btnMenuInspect.onclick = () => {
      const targetUser = activeInteractPlayer ? activeInteractPlayer.username : null;
      closePlayerInteractMenu();
      if (targetUser) openInspectModal(targetUser);
    };

    const btnMenuTrade = document.getElementById('btn-menu-trade');
    if (btnMenuTrade) btnMenuTrade.onclick = () => {
      const targetUser = activeInteractPlayer ? activeInteractPlayer.username : null;
      closePlayerInteractMenu();
      if (targetUser) sendTradeRequest(targetUser);
    };

    const btnMenuParty = document.getElementById('btn-menu-party-invite');
    if (btnMenuParty) btnMenuParty.onclick = () => {
      const targetUser = activeInteractPlayer ? activeInteractPlayer.username : null;
      closePlayerInteractMenu();
      if (targetUser && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_INVITE', targetUsername: targetUser }));
      }
    };

    const btnPartyLeave = document.getElementById('btn-party-leave');
    if (btnPartyLeave) btnPartyLeave.onclick = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_LEAVE' }));
      }
    };

    // Party Invite Modal Controls
    const btnPartyAccept = document.getElementById('btn-party-accept');
    if (btnPartyAccept) btnPartyAccept.onclick = () => {
      if (partyInviteTimerInterval) clearInterval(partyInviteTimerInterval);
      const modal = document.getElementById('modal-party-invite');
      if (modal) modal.classList.add('hidden');
      if (currentPartyInviteId && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_ACCEPT', inviteId: currentPartyInviteId }));
      }
      currentPartyInviteId = null;
    };

    const btnPartyDecline = document.getElementById('btn-party-decline');
    if (btnPartyDecline) btnPartyDecline.onclick = () => {
      if (partyInviteTimerInterval) clearInterval(partyInviteTimerInterval);
      const modal = document.getElementById('modal-party-invite');
      if (modal) modal.classList.add('hidden');
      if (currentPartyInviteId && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_DECLINE', inviteId: currentPartyInviteId }));
      }
      currentPartyInviteId = null;
    };

    // Dungeon Ready Check Controls
    const btnReadyAccept = document.getElementById('btn-ready-accept');
    if (btnReadyAccept) btnReadyAccept.onclick = () => {
      if (currentReadyCheckId && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_READY_CHECK_VOTE', readyCheckId: currentReadyCheckId, accept: true }));
      }
      btnReadyAccept.disabled = true;
      btnReadyAccept.textContent = '✓ Kabul Edildi';
    };

    const btnReadyDecline = document.getElementById('btn-ready-decline');
    if (btnReadyDecline) btnReadyDecline.onclick = () => {
      if (readyCheckTimerInterval) clearInterval(readyCheckTimerInterval);
      const rcModal = document.getElementById('modal-dungeon-ready-check');
      if (rcModal) rcModal.classList.add('hidden');
      if (currentReadyCheckId && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PARTY_READY_CHECK_VOTE', readyCheckId: currentReadyCheckId, accept: false }));
      }
      currentReadyCheckId = null;
    };

    const btnMenuCancel = document.getElementById('btn-menu-cancel');
    if (btnMenuCancel) btnMenuCancel.onclick = () => closePlayerInteractMenu();

    const btnInspectTrade = document.getElementById('btn-inspect-send-trade');
    if (btnInspectTrade) btnInspectTrade.onclick = () => {
      closeModal('modal-inspect-player');
      if (activeInspectProfile && activeInspectProfile.target) {
        sendTradeRequest(activeInspectProfile.target);
      }
    };

    // Close Modals
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.onclick = () => closeModal(btn.getAttribute('data-close'));
    });

    // Auth Modal Actions
    document.getElementById('btn-generate-pin').onclick = () => {
      const user = document.getElementById('input-kick-user').value.trim();
      if (!user) return alert('Lütfen Kick kullanıcı adınızı girin.');
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_REQ_PIN', username: user }));
      }
    };

    const btnCopyPin = document.getElementById('btn-copy-pin');
    if (btnCopyPin) {
      btnCopyPin.onclick = () => {
        const pinText = document.getElementById('pin-code-text')?.textContent?.trim() || '';
        if (!pinText) return;
        const doCopy = (txt) => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(txt);
          }
          const ta = document.createElement('textarea');
          ta.value = txt;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          return Promise.resolve();
        };

        doCopy(pinText).then(() => {
          playBeep(680, 'sine', 0.12);
          btnCopyPin.classList.add('copied');
          const iconSpan = document.getElementById('copy-pin-icon');
          const textSpan = document.getElementById('copy-pin-text');
          if (iconSpan) iconSpan.textContent = '✓';
          if (textSpan) textSpan.textContent = 'Kopyalandı!';
          setTimeout(() => {
            btnCopyPin.classList.remove('copied');
            if (iconSpan) iconSpan.textContent = '📋';
            if (textSpan) textSpan.textContent = 'Kopyala';
          }, 2500);
        }).catch(err => console.error('PIN kopyalama hatası:', err));
      };
    }

    // Dungeon Victory Banner Close Button
    const btnDvClose = document.getElementById('btn-dv-close');
    if (btnDvClose) {
      btnDvClose.onclick = () => {
        playBeep(440, 'sine', 0.1);
        document.getElementById('dungeon-victory-banner')?.classList.add('hidden');
      };
    }

    document.getElementById('btn-play-guest').onclick = () => closeModal('modal-auth');

    // Trade Modal Controls
    document.getElementById('btn-toggle-inventory-drawer').onclick = () => {
      document.getElementById('inventory-drawer').classList.remove('hidden');
    };
    document.getElementById('btn-close-drawer').onclick = () => {
      document.getElementById('inventory-drawer').classList.add('hidden');
    };

    document.getElementById('btn-cancel-trade').onclick = () => {
      if (activeTrade && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'TRADE_CANCEL',
          tradeId: activeTrade.id,
          reason: 'Kullanıcı takası kapattı.'
        }));
      }
      closeModal('modal-trade');
      activeTrade = null;
    };

    document.getElementById('btn-lock-my-offer').onclick = () => {
      if (!activeTrade || !socket) return;
      const isP1 = activeTrade.p1.toLowerCase() === myPlayer.username.toLowerCase();
      const myOffer = isP1 ? activeTrade.p1Offer : activeTrade.p2Offer;
      const newLocked = !myOffer.locked;

      socket.send(JSON.stringify({
        type: 'TRADE_TOGGLE_LOCK',
        tradeId: activeTrade.id,
        username: myPlayer.username,
        locked: newLocked
      }));
    };

    document.getElementById('btn-confirm-final-trade').onclick = () => {
      if (!activeTrade || !socket) return;
      socket.send(JSON.stringify({
        type: 'TRADE_CONFIRM',
        tradeId: activeTrade.id,
        username: myPlayer.username
      }));
    };

    // Primogem Quick Add
    document.querySelectorAll('.btn-quick-primo').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById('trade-my-primo');
        input.value = Math.min(myPlayer.primogems, (parseInt(input.value, 10) || 0) + 160);
        if (activeTrade && socket) {
          const isP1 = activeTrade.p1.toLowerCase() === myPlayer.username.toLowerCase();
          const myOffer = isP1 ? activeTrade.p1Offer : activeTrade.p2Offer;
          socket.send(JSON.stringify({
            type: 'TRADE_UPDATE',
            tradeId: activeTrade.id,
            username: myPlayer.username,
            items: myOffer.items.map(i => i.index),
            primogems: parseInt(input.value, 10)
          }));
        }
      };
    });

    // Touch Action Buttons
    document.getElementById('btn-touch-action').onclick = () => triggerInteract();
    document.getElementById('btn-touch-trade').onclick = () => {
      if (nearbyInteractable && nearbyInteractable.type === 'player') {
        sendTradeRequest(nearbyInteractable.data.username);
      } else {
        openModal('modal-auth');
      }
    };

    // River Fishing Claim Button & Click Interaction
    const btnFishClaim = document.getElementById('btn-fish-claim');
    if (btnFishClaim) {
      btnFishClaim.onclick = () => closeModal('modal-fish-catch');
    }

    window.addEventListener('click', () => {
      if (isFishing && fishingState === 'bite') {
        const modal = document.getElementById('modal-fish-catch');
        if (modal && !modal.classList.contains('hidden')) return;
        reelIn();
      }
    });

    // Fishing Minigame Mouse & Touch Reel Input
    window.addEventListener('mousedown', (e) => {
      if (isFishing && fishingState === 'minigame') {
        isReeling = true;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isFishing && fishingState === 'minigame') {
        isReeling = false;
      }
    });

    const btnReelMobile = document.getElementById('btn-reel-mobile');
    if (btnReelMobile) {
      btnReelMobile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (isFishing && fishingState === 'minigame') isReeling = true;
      });
      btnReelMobile.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (isFishing && fishingState === 'minigame') isReeling = false;
      });
      btnReelMobile.addEventListener('pointercancel', () => {
        isReeling = false;
      });
    }

    // RPG Dialogue Click Triggers
    const diagBox = document.getElementById('rpg-dialogue-box');
    if (diagBox) diagBox.onclick = () => advanceRPGDialogue();
    const diagBackdrop = document.getElementById('rpg-dialogue-backdrop');
    if (diagBackdrop) diagBackdrop.onclick = () => closeRPGDialogue();

    // Mobile Virtual Joystick Touch Handling
    setupMobileJoystick();

    // Battle Zone Mouse Cursor Tracking, Left-Click Light Attack & Right-Click Heavy Attack
    window.addEventListener('mousemove', (e) => {
      mouseNdcX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      mouseNdcY = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      if (isBattleZone(currentMap)) {
        hasMouseMovedInZone = true;
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (isBattleZone(currentMap)) {
        e.preventDefault();
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (isBattleZone(currentMap)) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'textarea' || e.target.closest('#chat-container') || e.target.closest('#nav-controls') || e.target.closest('#combat-hud')) return;
        if (e.button === 0) {
          if (activeSkillAimState) {
            releaseSkillshotAim(activeSkillAimState.slot);
          } else {
            performAttack();
          }
        } else if (e.button === 2) {
          e.preventDefault();
          if (activeSkillAimState) {
            cancelSkillshotAim();
          } else {
            performHeavyAttack();
          }
        }
      }
    });

    // Combat HUD Skill Bar Click Triggers & Mobile Combat Action Buttons
    document.getElementById('slot-attack')?.addEventListener('click', () => performAttack());
    document.getElementById('slot-heavy')?.addEventListener('click', () => performHeavyAttack());
    document.getElementById('slot-dash')?.addEventListener('click', () => performDash());
    document.getElementById('slot-vortex')?.addEventListener('click', () => performVortexSkill());
    document.getElementById('slot-burst')?.addEventListener('click', () => performBurstSkill());

    document.getElementById('btn-combat-atk')?.addEventListener('click', () => performAttack());
    document.getElementById('btn-combat-heavy')?.addEventListener('click', () => performHeavyAttack());
    document.getElementById('btn-combat-dash')?.addEventListener('click', () => performDash());
    document.getElementById('btn-combat-skill')?.addEventListener('click', () => performVortexSkill());
    document.getElementById('btn-combat-burst')?.addEventListener('click', () => performBurstSkill());

    // Monster Material Market Actions
    document.getElementById('btn-market-sell-all')?.addEventListener('click', async () => {
      await sellMaterialItem(null, null, true);
    });

    // Portal Zone Selection Modal Enter & Tab Buttons
    document.querySelectorAll('.btn-portal-tab').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-portal-tab') || 'dungeons';
        switchPortalTab(tab);
      };
    });

    document.querySelectorAll('.btn-zone-enter').forEach(btn => {
      btn.onclick = () => {
        const zoneId = btn.getAttribute('data-zone-id');
        if (!zoneId) return;

        const isDungeon = zoneId.startsWith('dungeon_tier_');
        if (isDungeon && myParty && myParty.leaderId !== (myPlayer.id || socketId)) {
          addChatMessage('⚠️ Zindan', 'Yalnızca parti lideri zindan seferini başlatabilir!');
          return;
        }

        closeModal('modal-portal-zones');
        playBeep(520, 'triangle', 0.15);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'WORLD_SELECT_ZONE', zoneId }));
        }
      };
    });

    // Companion Selector Modal Trigger Buttons
    document.getElementById('btn-open-companion')?.addEventListener('click', () => openCompanionModal());
    document.getElementById('btn-hud-companion-open')?.addEventListener('click', () => toggleCompanionModal());
    document.getElementById('btn-equip-companion')?.addEventListener('click', () => equipSelectedCompanion());
    document.getElementById('btn-unequip-companion')?.addEventListener('click', () => unequipCompanion());

    document.querySelectorAll('.btn-filter-elem').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.btn-filter-elem').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const elem = btn.getAttribute('data-elem') || 'all';
        renderCompanionModal(elem);
      };
    });

    // Spectator Mode Check
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'spectator' || params.get('mode') === 'streamer') {
      document.getElementById('spectator-banner').classList.remove('hidden');
      document.getElementById('bottom-bar').style.display = 'none';
    }
  }

  function setupMobileJoystick() {
    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    if (!zone || !knob) return;

    let touchId = null;
    let startX = 0;
    let startY = 0;

    zone.addEventListener('touchstart', (e) => {
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      const rect = zone.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
    });

    zone.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          const t = e.changedTouches[i];
          const dx = t.clientX - startX;
          const dy = t.clientY - startY;
          const dist = Math.hypot(dx, dy);
          const maxDist = 36;
          const angle = Math.atan2(dy, dx);
          const clampedDist = Math.min(dist, maxDist);

          const knobX = Math.cos(angle) * clampedDist;
          const knobY = Math.sin(angle) * clampedDist;

          knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
          joystickVector.x = knobX / maxDist;
          joystickVector.y = knobY / maxDist;
          break;
        }
      }
    });

    const resetJoystick = () => {
      touchId = null;
      knob.style.transform = 'translate(0, 0)';
      joystickVector.x = 0;
      joystickVector.y = 0;
    };

    zone.addEventListener('touchend', resetJoystick);
    zone.addEventListener('touchcancel', resetJoystick);
  }

  // --- 14. Main Animation Render Loop ---
  let lastTime = performance.now();
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const rawDelta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    // Micro Hit-Stop (Time dilation on heavy / critical / stagger hits)
    const delta = now < hitStopEndTime ? rawDelta * 0.12 : rawDelta;

    // Keep Sky Dome centered on player so horizon never clips
    if (skyDomeMesh) {
      skyDomeMesh.position.set(myPlayer.x, -12, myPlayer.z);
    }

    // Update local movement & proximity
    updateMovement(delta);

    // 1. Animate local player rig
    if (myMesh && myMesh.userData && myMesh.userData.rig) {
      animateRig(myMesh.userData.rig, myPlayer.anim === 'walk', delta, now);
    }

    // 1.5 Animate 5★ Companion Pet Follow (Local & Multiplayer)
    updateCompanionFollow(delta, now);

    for (const [id, pet] of otherPlayerCompanions.entries()) {
      const otherEntry = otherPlayers.get(id);
      if (otherEntry) {
        const ox = otherEntry.mesh.position.x + Math.sin(otherEntry.mesh.rotation.y - 0.75) * 1.55;
        const oz = otherEntry.mesh.position.z + Math.cos(otherEntry.mesh.rotation.y - 0.75) * 1.55;
        const oy = otherEntry.mesh.position.y + 2.25 + Math.sin(now * 0.0035 + (id.charCodeAt(0) || 0)) * 0.14;
        pet.position.x += (ox - pet.position.x) * Math.min(1.0, 7.5 * delta);
        pet.position.y += (oy - pet.position.y) * Math.min(1.0, 7.5 * delta);
        pet.position.z += (oz - pet.position.z) * Math.min(1.0, 7.5 * delta);
        pet.rotation.y = otherEntry.mesh.rotation.y + 0.15;
      }
    }

    // 2. Interpolate and animate other players
    for (const entry of otherPlayers.values()) {
      entry.mesh.position.x += (entry.targetX - entry.mesh.position.x) * CONFIG.posLerp;
      entry.mesh.position.z += (entry.targetZ - entry.mesh.position.z) * CONFIG.posLerp;
      if (currentMap === 'pvp_arena') {
        const oDist = Math.hypot(entry.mesh.position.x, entry.mesh.position.z);
        const targetY = oDist > 17.8 ? 1.2 : 0.0;
        entry.mesh.position.y += (targetY - entry.mesh.position.y) * CONFIG.posLerp;
      } else if (currentMap === 'town') {
        let targetY = 0.0;
        if (Math.abs(entry.mesh.position.x) <= 3.25 && entry.mesh.position.z >= 18.0 && entry.mesh.position.z <= 30.0) {
          if (entry.mesh.position.z < 21.0) {
            targetY = ((entry.mesh.position.z - 18.0) / 3.0) * 0.65;
          } else if (entry.mesh.position.z > 27.0) {
            targetY = ((30.0 - entry.mesh.position.z) / 3.0) * 0.65;
          } else {
            targetY = 0.65;
          }
        }
        entry.mesh.position.y += (targetY - entry.mesh.position.y) * CONFIG.posLerp;
      }
      entry.mesh.rotation.y += (entry.targetRot - entry.mesh.rotation.y) * CONFIG.rotLerp;
      if (entry.mesh.userData && entry.mesh.userData.rig) {
        animateRig(entry.mesh.userData.rig, entry.anim === 'walk', delta, now);
      }
    }

    // 3. Animate NPCs (gentle breathing & idle)
    for (let i = 0; i < animatedNPCs.length; i++) {
      const npc = animatedNPCs[i];
      if (npc.userData && npc.userData.rig) {
        animateRig(npc.userData.rig, false, delta, now);
      }
    }

    // 1. Animate River Water Ripples & Flora Wind Sway
    if (canalWaterMesh && canalWaterMesh.material.map) {
      canalWaterMesh.material.map.offset.x = (now * 0.0001) % 1;
    }
    // Update GPU Grass Wind Sway Uniform
    grassWindUniforms.uGrassTime.value = now * 0.0015;

    // Update Floating Wind Atmosphere Particles (Sakura petals & Dandelion fluff)
    if (windAtmosphereParticles && windAtmosphereData.length > 0) {
      const pos = windAtmosphereParticles.geometry.attributes.position.array;
      const px = myPlayer ? myPlayer.x : 0;
      const pz = myPlayer ? myPlayer.z : 0;
      for (let i = 0; i < windAtmosphereData.length; i++) {
        const d = windAtmosphereData[i];
        pos[i * 3] += d.vx;
        pos[i * 3 + 1] += d.vy + Math.sin(now * d.wobbleSpeed + d.phase) * d.wobbleAmp;
        pos[i * 3 + 2] += d.vz;
        if (pos[i * 3 + 1] < 0.2 || Math.hypot(pos[i * 3] - px, pos[i * 3 + 2] - pz) > 45) {
          pos[i * 3] = px + (Math.random() - 0.5) * 65;
          pos[i * 3 + 1] = 4 + Math.random() * 5;
          pos[i * 3 + 2] = pz + (Math.random() - 0.5) * 65;
        }
      }
      windAtmosphereParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (swayingFloraList.length > 0) {
      for (let i = 0; i < swayingFloraList.length; i++) {
        const fl = swayingFloraList[i];
        if (fl.mesh) {
          fl.mesh.rotation.z = Math.sin(now * fl.speed + fl.phase) * fl.amp;
          fl.mesh.rotation.x = Math.cos(now * (fl.speed * 0.8) + fl.phase) * (fl.amp * 0.7);
        }
      }
    }

    // Animate KayKit Interactive World Props (Windmill fan, Watermill wheel, flags, etc.)
    if (animatedKayKitProps.length > 0) {
      for (let i = 0; i < animatedKayKitProps.length; i++) {
        animatedKayKitProps[i](delta, now);
      }
    }

    // 2. Animate Shrine Celestial Crystal
    if (shrineCrystalMesh) {
      shrineCrystalMesh.rotation.y += 0.02;
      shrineCrystalMesh.rotation.x = Math.sin(now * 0.002) * 0.15;
      shrineCrystalMesh.position.y = 5.0 + Math.sin(now * 0.003) * 0.35;
    }

    // 3. Update Central Fountain Water Particles
    if (fountainParticlesData.length > 0) {
      for (let i = 0; i < fountainParticlesData.length; i++) {
        const p = fountainParticlesData[i];
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 4.5 * delta; // Gravity

        if (p.mesh.position.y <= 0.65) {
          p.mesh.position.set(0, 3.6, 0);
          p.vx = (Math.random() - 0.5) * 1.5;
          p.vy = 2.0 + Math.random() * 1.8;
          p.vz = (Math.random() - 0.5) * 1.5;
        }
      }
    }

    // 4. Update Tavern Chimney Smoke Particles
    if (chimneySmokeData.length > 0) {
      for (let i = 0; i < chimneySmokeData.length; i++) {
        const s = chimneySmokeData[i];
        s.life += delta;
        s.mesh.position.x += s.vx * delta;
        s.mesh.position.y += s.vy * delta;
        s.mesh.position.z += s.vz * delta;

        const progress = (s.life % 4.0) / 4.0;
        const currentScale = s.scale * (1.0 + progress * 2.5);
        s.mesh.scale.set(currentScale, currentScale, currentScale);
        s.mesh.material.opacity = Math.max(0.02, 0.45 * (1.0 - progress));

        if (progress > 0.95 || s.mesh.position.y > 15) {
          s.life = 0;
          s.mesh.position.set(chimneyPos.x, chimneyPos.y, chimneyPos.z);
          s.mesh.scale.set(s.scale, s.scale, s.scale);
          s.mesh.material.opacity = 0.45;
        }
      }
    }

    // 5. Update Ambient Fireflies
    if (firefliesData.length > 0) {
      for (let i = 0; i < firefliesData.length; i++) {
        const f = firefliesData[i];
        const t = now * 0.001 * f.freq + f.phase;
        f.mesh.position.x = f.baseX + Math.sin(t) * 1.2;
        f.mesh.position.z = f.baseZ + Math.cos(t * 0.8) * 1.2;
        f.mesh.position.y = f.baseY + Math.sin(t * 1.4) * 0.4;
      }
    }

    // 6. Update Shrine Arcane Aura Sparks
    if (shrineAuraData.length > 0) {
      for (let i = 0; i < shrineAuraData.length; i++) {
        const a = shrineAuraData[i];
        a.angle += a.speed * delta;
        a.mesh.position.x = Math.cos(a.angle) * a.radius;
        a.mesh.position.z = -15 + Math.sin(a.angle) * a.radius;
        a.mesh.position.y = 5.0 + a.heightOffset + Math.sin(now * 0.003 + a.angle) * 0.3;
        a.mesh.rotation.y += 0.05;
      }
    }

    // 7. Update Cute Pixel Cats (Tail sway)
    for (let i = 0; i < animatedCats.length; i++) {
      const cat = animatedCats[i];
      if (cat.userData && cat.userData.tail) {
        cat.userData.tail.rotation.z = Math.sin(now * 0.004 + cat.userData.timeOffset) * 0.35;
      }
    }

    // 8. Update River Fish Schools (Swimming & ripples)
    if (riverFishSpots && riverFishSpots.length > 0) {
      for (let i = 0; i < riverFishSpots.length; i++) {
        const spot = riverFishSpots[i];
        spot.swimAngle += spot.swimSpeed * delta;
        const fx = Math.cos(spot.swimAngle) * spot.swimRadius;
        const fz = Math.sin(spot.swimAngle) * spot.swimRadius;
        spot.fishBody.position.x = fx;
        spot.fishBody.position.z = fz;
        spot.fishBody.rotation.y = -spot.swimAngle + Math.PI / 2;

        // Ripple pulse
        const s1 = 1.0 + Math.sin(now * 0.003 + i) * 0.25;
        spot.ring1.scale.set(s1, s1, 1);
        const s2 = 1.0 + Math.cos(now * 0.0025 + i) * 0.25;
        spot.ring2.scale.set(s2, s2, 1);
      }
    }

    // 9. Update Fishing Bobber Animation (Bobbing on ripples / pulling underwater)
    if (isFishing && fishingBobberMesh) {
      if (fishingState === 'waiting') {
        fishingBobberMesh.position.y = 0.06 + Math.sin(now * 0.005) * 0.04;
      } else if (fishingState === 'bite' || fishingState === 'minigame') {
        fishingBobberMesh.position.y = -0.12 + Math.sin(now * 0.035) * 0.08;
      }
    }

    // 10. Update Fishing Reel Minigame (Physics, AI, Progress)
    if (fishingState === 'minigame') {
      updateFishingMinigame(delta, now);
    }

    // 11. Update Combat & Battle Zone Engine
    if (isBattleZone(currentMap)) {
      updateCombatEngine(delta, now);
    }

    // 12. Update Aion 2 Instance Dungeon Runtime (Timer, Scoring, Boss Mechanics, Flight, Windstream)
    if (dungeonState.active && isDungeonMap(currentMap)) {
      updateDungeonRuntime(delta, now);
    }

    // Screen Shake Camera Jitter
    if (screenShakeTimer > 0) {
      screenShakeTimer -= delta;
      const shakeX = (Math.random() - 0.5) * screenShakeMagnitude;
      const shakeY = (Math.random() - 0.5) * screenShakeMagnitude;
      camera.position.x += shakeX;
      camera.position.y += shakeY;
    }

    // Render Minimap
    renderMinimap();

    // Render 3D Scene
    renderer.render(scene, camera);
  }

  // --- 13. MMORPG Item & GearScore (GS) Client Engine ---
  let myRpgProfile = null;
  let activeInspectProfile = null;
  let activeInteractPlayer = null;
  let selectedPopoverItem = null;
  let selectedPopoverIsEquipped = false;

  const RPG_SLOTS = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet'];
  const RPG_SLOT_ICONS = {
    weapon: '🗡️',
    helmet: '👑',
    chest: '🛡️',
    gloves: '🧤',
    boots: '👢',
    ring: '💍',
    amulet: '📿'
  };

  const RARITY_PALETTES = {
    0: { primary: '#64748b', secondary: '#334155', glow: '#94a3b8', gem: '#cbd5e1', rim: '#475569' },
    1: { primary: '#cbd5e1', secondary: '#64748b', glow: '#e2e8f0', gem: '#38bdf8', rim: '#94a3b8' },
    2: { primary: '#4ade80', secondary: '#15803d', glow: '#86efac', gem: '#fef08a', rim: '#22c55e' },
    3: { primary: '#38bdf8', secondary: '#0369a1', glow: '#bae6fd', gem: '#f472b6', rim: '#0ea5e9' },
    4: { primary: '#c084fc', secondary: '#6b21a8', glow: '#e9d5ff', gem: '#facc15', rim: '#a855f7' },
    5: { primary: '#facc15', secondary: '#b45309', glow: '#fef08a', gem: '#ef4444', rim: '#f59e0b' }
  };

  function getSpriteCellHtml(col, row, extraClass = '') {
    const posX = ((col / 5) * 100).toFixed(2);
    const posY = ((row / 3) * 100).toFixed(2);
    return `<span class="rpg-sprite-icon ${extraClass}" style="background-position: ${posX}% ${posY}%;"></span>`;
  }

  function getRpgItemSvgIcon(slot, rarity = 1, ilvl = 1) {
    let col = 0;
    let row = 0;
    if (slot === 'weapon') {
      if (rarity >= 4 || ilvl >= 26) { col = 0; row = 2; } // Flaming Legendary Broadsword
      else { col = 0; row = 0; } // Frost-Rune Broadsword
    } else if (slot === 'helmet') {
      col = 1; row = 0;
    } else if (slot === 'chest') {
      col = 2; row = 0;
    } else if (slot === 'gloves') {
      col = 3; row = 0;
    } else if (slot === 'boots') {
      if (rarity >= 3) { col = 4; row = 0; } // Winged Greaves
      else { col = 2; row = 3; } // Swift Leather Winged Boot
    } else if (slot === 'ring') {
      col = 5; row = 0;
    } else if (slot === 'amulet') {
      col = 0; row = 1;
    }
    const emptyClass = rarity === 0 ? 'sprite-empty-slot' : `sprite-rarity-${rarity}`;
    return getSpriteCellHtml(col, row, emptyClass);
  }

  function getCombatSkillSvgIcon(type, elem = 'Pyro') {
    let col = 1;
    let row = 1;
    if (type === 'attack') {
      col = 1; row = 1; // Crimson Sword Slash Wave
    } else if (type === 'heavy') {
      col = 2; row = 1; // Heavy Ground Slam
    } else if (type === 'dash') {
      col = 3; row = 1; // Cyan Wind Dash
    } else if (type === 'skill') {
      if (elem === 'Pyro') { col = 5; row = 2; } // Fireball Meteor
      else if (elem === 'Cryo' || elem === 'Hydro') { col = 0; row = 3; } // Glacial Spikes
      else if (elem === 'Dendro') { col = 2; row = 2; } // Nature Emerald Cross
      else if (elem === 'Geo') { col = 3; row = 2; } // Royal Lion Shield
      else { col = 4; row = 1; } // Elemental Vortex Cyclone
    } else {
      // Burst Ultimate
      if (elem === 'Electro') { col = 1; row = 3; } // Void / Electro Supernova
      else if (elem === 'Anemo') { col = 4; row = 2; } // Arcane Tempest Bow
      else { col = 5; row = 1; } // Radiant Ultimate Burst
    }
    return getSpriteCellHtml(col, row, 'sprite-skill');
  }
  const RPG_SLOT_LABELS = {
    weapon: 'Silah',
    helmet: 'Miğfer',
    chest: 'Zırh',
    gloves: 'Eldiven',
    boots: 'Çizme',
    ring: 'Yüzük',
    amulet: 'Kolye'
  };
  const RPG_RARITY_LABELS = {
    1: 'Sıradan',
    2: 'Sıradışı',
    3: 'Nadir',
    4: 'Destansı',
    5: 'Efsanevi'
  };
  const RPG_STAT_LABELS = {
    atk: 'Saldırı',
    hp: 'Can',
    def: 'Savunma',
    crit: 'Kritik Şansı',
    critDmg: 'Kritik Hasarı',
    haste: 'Hız / CDR',
    lifesteal: 'Can Çalma'
  };
  const RPG_PERCENT_STATS = new Set(['crit', 'critDmg', 'haste', 'lifesteal']);

  function getGearScoreTier(gs) {
    if (gs >= 2000) return { name: 'Kadim Efsane', color: '#f59e0b', tag: 'Efsane' };
    if (gs >= 1000) return { name: 'Kahraman', color: '#a855f7', tag: 'Destansı' };
    if (gs >= 500) return { name: 'Usta Savaşçı', color: '#38bdf8', tag: 'Nadir' };
    if (gs >= 200) return { name: 'Maceracı', color: '#22c55e', tag: 'Sıradışı' };
    return { name: 'Çaylak Gezgin', color: '#94a3b8', tag: 'Sıradan' };
  }

  async function fetchRpgProfile() {
    if (!myPlayer || !myPlayer.username) return;
    try {
      const res = await fetch(`/api/rpg/profile?username=${encodeURIComponent(myPlayer.username)}`);
      const data = await res.json();
      if (data && data.ok && data.state) {
        myRpgProfile = data.state;
        updateUIProfile();
        // Update local mesh nametag
        if (myMesh && myMesh.userData && myMesh.userData.nameSprite) {
          myMesh.userData.gearScore = (myRpgProfile.stats && myRpgProfile.stats.gearScore) || 0;
          myMesh.userData.level = myRpgProfile.level || 1;
          myMesh.userData.nameSprite.material.map = createNametagCanvas(
            myPlayer.username,
            myPlayer.isGuest,
            myPlayer.primogems,
            myMesh.userData.gearScore,
            myMesh.userData.level
          );
          myMesh.userData.nameSprite.material.needsUpdate = true;
        }
        const sheet = document.getElementById('modal-character-sheet');
        if (sheet && !sheet.classList.contains('hidden')) {
          renderCharacterSheet();
        }
      }
    } catch (e) {
      console.error('[RPG] Profil getirme hatası:', e);
    }
  }

  function toggleCharacterSheet() {
    const sheet = document.getElementById('modal-character-sheet');
    if (!sheet) return;
    if (sheet.classList.contains('hidden')) {
      openCharacterSheet();
    } else {
      closeModal('modal-character-sheet');
      closeItemPopover();
    }
  }

  function openCharacterSheet() {
    openModal('modal-character-sheet');
    const cvs = document.getElementById('sheet-avatar-canvas');
    if (cvs) {
      drawAvatarPreviewPortrait(cvs, AVATAR_PRESETS[myPlayer.avatarIndex % AVATAR_PRESETS.length]);
    }
    fetchRpgProfile().then(() => {
      renderCharacterSheet();
    });
  }

  function renderCharacterSheet() {
    if (!myRpgProfile) return;
    const p = myRpgProfile;
    const stats = p.stats || {};
    const gs = stats.gearScore || 0;
    const tier = getGearScoreTier(gs);

    document.getElementById('sheet-player-name').textContent = myPlayer.username;
    document.getElementById('sheet-player-title').textContent = tier.name;
    document.getElementById('sheet-dust-val').textContent = p.dust || 0;
    document.getElementById('sheet-level-badge').textContent = `Lv.${p.level}`;
    document.getElementById('sheet-gs-number').textContent = gs;
    const tierTag = document.getElementById('sheet-gs-tier');
    if (tierTag) {
      tierTag.textContent = tier.tag;
      tierTag.style.color = tier.color;
      tierTag.style.borderColor = tier.color;
    }

    // XP Bar
    const xpFill = document.getElementById('sheet-xp-fill');
    const xpText = document.getElementById('sheet-xp-text');
    if (p.level >= p.maxLevel) {
      if (xpFill) xpFill.style.width = '100%';
      if (xpText) xpText.textContent = 'MAKSİMUM SEVİYE (Lv.50)';
    } else {
      const pct = Math.max(0, Math.min(100, (p.xp / (p.xpNeeded || 1)) * 100));
      if (xpFill) xpFill.style.width = `${pct}%`;
      if (xpText) xpText.textContent = `${p.xp} / ${p.xpNeeded} XP (%${Math.round(pct)})`;
    }

    // Stats Grid
    document.getElementById('stat-val-atk').textContent = stats.atk || 18;
    document.getElementById('stat-val-def').textContent = stats.def || 4;
    document.getElementById('stat-val-hp').textContent = stats.hp || 420;
    document.getElementById('stat-val-crit').textContent = `%${stats.crit || 5}`;
    document.getElementById('stat-val-critDmg').textContent = `%${stats.critDmg || 150}`;
    document.getElementById('stat-val-haste').textContent = `%${stats.haste || 0}`;

    // Summary counts
    const killsEl = document.getElementById('sheet-kills-count');
    if (killsEl) killsEl.textContent = p.kills || 0;
    const bossEl = document.getElementById('sheet-boss-count');
    if (bossEl) bossEl.textContent = p.bossKills || 0;

    // 7 Equipped Slots
    const eq = p.equipment || {};
    for (const slot of RPG_SLOTS) {
      const item = eq[slot];
      const card = document.getElementById(`slot-card-${slot}`);
      const nameEl = document.getElementById(`slot-name-${slot}`);
      const scoreEl = document.getElementById(`slot-score-${slot}`);
      if (!card || !nameEl) continue;

      card.className = 'equip-slot-card';
      const iconBox = card.querySelector('.slot-icon-box');
      if (item) {
        card.classList.add(`rarity-${item.rarity}`);
        const plusStr = (item.plus > 0) ? `+${item.plus} ` : '';
        nameEl.textContent = `${plusStr}${item.name}`;
        if (scoreEl) scoreEl.textContent = `GS +${item.score || 0}`;
        if (iconBox) iconBox.innerHTML = getRpgItemSvgIcon(slot, item.rarity, item.ilvl);
        card.onclick = () => showItemPopover(item, true);
      } else {
        nameEl.textContent = 'Boş Yuva';
        if (scoreEl) scoreEl.textContent = '';
        if (iconBox) iconBox.innerHTML = getRpgItemSvgIcon(slot, 0, 1);
        card.onclick = null;
      }
    }

    // 40 Bag Slots
    const bagGrid = document.getElementById('sheet-bag-grid');
    const bagCount = document.getElementById('sheet-bag-count');
    if (bagCount) bagCount.textContent = p.bag.length;
    if (bagGrid) {
      bagGrid.innerHTML = '';
      const totalSlots = p.bagSize || 40;
      for (let i = 0; i < totalSlots; i++) {
        const item = p.bag[i] || null;
        const cell = document.createElement('div');
        if (item) {
          cell.className = `bag-slot-cell rarity-${item.rarity}`;
          cell.innerHTML = `
            <span class="bag-item-icon">${getRpgItemSvgIcon(item.slot, item.rarity, item.ilvl)}</span>
            ${item.plus > 0 ? `<span class="bag-item-plus">+${item.plus}</span>` : ''}
            <span class="bag-item-ilvl">i${item.ilvl}</span>
          `;
          cell.onclick = () => showItemPopover(item, false);
          cell.title = `${item.plus > 0 ? '+' + item.plus + ' ' : ''}${item.name} (${RPG_RARITY_LABELS[item.rarity]} | GS ${item.score})`;
        } else {
          cell.className = 'bag-slot-cell empty';
        }
        bagGrid.appendChild(cell);
      }
    }
  }

  function showItemPopover(item, isEquipped, isInspect = false) {
    selectedPopoverItem = item;
    selectedPopoverIsEquipped = isEquipped;

    const popover = document.getElementById('rpg-item-popover');
    if (!popover) return;

    const nameEl = document.getElementById('popover-item-name');
    const plusEl = document.getElementById('popover-plus-badge');
    const rarityEl = document.getElementById('popover-rarity');
    const slotEl = document.getElementById('popover-slot');
    const ilvlEl = document.getElementById('popover-ilvl');
    const gsVal = document.getElementById('popover-gs-val');
    const statsBox = document.getElementById('popover-stats');
    const affixesBox = document.getElementById('popover-affixes');
    const actionsBox = document.getElementById('popover-actions');

    const header = document.getElementById('popover-header');
    if (header) {
      header.className = `popover-header rarity-${item.rarity}`;
    }
    const popIconFrame = document.getElementById('popover-icon-frame');
    if (popIconFrame) {
      popIconFrame.innerHTML = getRpgItemSvgIcon(item.slot, item.rarity, item.ilvl);
    }

    nameEl.textContent = item.name;
    plusEl.textContent = item.plus > 0 ? `+${item.plus}` : '';
    rarityEl.textContent = item.rarityLabel || RPG_RARITY_LABELS[item.rarity];
    slotEl.textContent = item.slotLabel || RPG_SLOT_LABELS[item.slot];
    ilvlEl.textContent = `ilvl ${item.ilvl}`;
    gsVal.textContent = `+${item.score} GS`;

    // Stats
    statsBox.innerHTML = '';
    if (item.stats) {
      for (const [k, v] of Object.entries(item.stats)) {
        const isPct = RPG_PERCENT_STATS.has(k);
        const line = document.createElement('div');
        line.className = 'popover-stat-line';
        line.innerHTML = `<span>${RPG_STAT_LABELS[k] || k}:</span> <strong>+${v}${isPct ? '%' : ''}</strong>`;
        statsBox.appendChild(line);
      }
    }

    // Affixes
    affixesBox.innerHTML = '';
    if (item.affixes && item.affixes.length > 0) {
      item.affixes.forEach(aff => {
        const isPct = RPG_PERCENT_STATS.has(aff.stat);
        const line = document.createElement('div');
        line.className = 'popover-affix-line';
        line.innerHTML = `✦ ${RPG_STAT_LABELS[aff.stat] || aff.stat} (Kalite: %${Math.round(aff.roll * 100)})`;
        affixesBox.appendChild(line);
      });
    }

    // Actions
    if (isInspect) {
      actionsBox.style.display = 'none';
    } else {
      actionsBox.style.display = 'flex';
      const btnEquip = document.getElementById('btn-popover-equip');
      const btnUpgrade = document.getElementById('btn-popover-upgrade');
      const btnSalvage = document.getElementById('btn-popover-salvage');

      if (btnEquip) {
        btnEquip.textContent = isEquipped ? 'Çıkar' : 'Kuşan';
      }
      if (btnUpgrade) {
        if (item.plus >= 10) {
          btnUpgrade.textContent = 'Maks (+10)';
          btnUpgrade.disabled = true;
          btnUpgrade.title = 'Eşya maksimum güçlendirme seviyesindedir (+10).';
        } else {
          const chanceStr = typeof item.upgradeChance === 'number' ? ` (%${item.upgradeChance})` : '';
          const riskTag = item.isRiskyUpgrade ? ' ⚠️' : '';
          btnUpgrade.textContent = `✨ Güçlendir (+${item.plus + 1})${chanceStr}${riskTag} [${item.upgradeCost || 0} Toz]`;
          btnUpgrade.title = item.isRiskyUpgrade
            ? `Riskli Güçlendirme: Başarı şansı %${item.upgradeChance}. Başarısız olursa eşya kırılmaz ancak -1 seviye düşer!`
            : `Güvenli Güçlendirme: Başarı şansı %100.`;
          btnUpgrade.disabled = Boolean(myRpgProfile && myRpgProfile.dust < (item.upgradeCost || 0));
        }
      }
      if (btnSalvage) {
        if (isEquipped) {
          btnSalvage.style.display = 'none';
        } else {
          btnSalvage.style.display = 'block';
          btnSalvage.textContent = `♻️ Parçala (+${item.salvage || 1} Toz)`;
        }
      }
    }

    popover.classList.remove('hidden');
  }

  function closeItemPopover() {
    const popover = document.getElementById('rpg-item-popover');
    if (popover) popover.classList.add('hidden');
    selectedPopoverItem = null;
  }

  async function equipItem(uid) {
    try {
      const res = await fetch('/api/rpg/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, uid })
      });
      const data = await res.json();
      if (data && data.ok) {
        playBeep(784, 'triangle', 0.12);
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        if (isBattleZone(currentMap)) {
          attachCombatWeapon();
          updateCombatHUD();
        }
        addChatMessage('Ekipman', `⚔️ "${data.result.item.name}" başarıyla kuşandı! (+${data.result.item.score} GS)`);
      } else {
        alert(data.error || 'Eşya kuşanılamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function unequipItem(slot) {
    try {
      const res = await fetch('/api/rpg/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, slot })
      });
      const data = await res.json();
      if (data && data.ok) {
        playBeep(523, 'sine', 0.12);
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        if (isBattleZone(currentMap)) {
          attachCombatWeapon();
          updateCombatHUD();
        }
      } else {
        alert(data.error || 'Eşya çıkarılamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function upgradeItem(uid) {
    try {
      const res = await fetch('/api/rpg/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, uid })
      });
      const data = await res.json();
      if (data && data.ok) {
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        showItemPopover(data.result.item, selectedPopoverIsEquipped);

        if (data.result.success) {
          playBeep(1046, 'triangle', 0.25);
          addChatMessage('Demirci', `✨ Güçlendirme Başarılı! (%${data.result.chance}) "${data.result.item.name}" seviyesi +${data.result.item.plus} oldu! [GS ${data.result.item.score}]`);
        } else {
          playBeep(220, 'sawtooth', 0.35);
          if (data.result.dropped) {
            addChatMessage('Demirci', `💥 Güçlendirme Başarısız! (%${data.result.chance} şans vardı) "${data.result.item.name}" -1 seviye düştü (+${data.result.prevPlus} -> +${data.result.newPlus})! [GS ${data.result.item.score}]`);
          } else {
            addChatMessage('Demirci', `⚠️ Güçlendirme Başarısız Oldu! (%${data.result.chance} şans vardı) Seviye korundu (+${data.result.newPlus}). [GS ${data.result.item.score}]`);
          }
        }
      } else {
        alert(data.error || 'Güçlendirme yapılamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function salvageItem(uid) {
    try {
      const res = await fetch('/api/rpg/salvage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, uid })
      });
      const data = await res.json();
      if (data && data.ok) {
        playBeep(440, 'sawtooth', 0.15);
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        addChatMessage('Rün Tozu', `♻️ Eşya parçalandı, +${data.result.dust} Rün Tozu elde edildi.`);
      } else {
        alert(data.error || 'Parçalama yapılamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function salvageJunk() {
    if (!confirm('Çantandaki tüm Sıradan ve Sıradışı eşyaları Rün Tozu için parçalamak istediğine emin misin?')) return;
    try {
      const res = await fetch('/api/rpg/salvage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, maxRarity: 2 })
      });
      const data = await res.json();
      if (data && data.ok) {
        playBeep(587, 'triangle', 0.2);
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        addChatMessage('Rün Tozu', `♻️ Toplu Parçalama: ${data.result.count} adet eşya parçalandı, +${data.result.dust} Rün Tozu kazanıldı!`);
      } else {
        alert(data.error || 'Parçalanacak eşya bulunamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function autoEquipBestItems() {
    try {
      const res = await fetch('/api/rpg/auto-equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username })
      });
      const data = await res.json();
      if (data && data.ok) {
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        if (isBattleZone(currentMap)) {
          attachCombatWeapon();
          updateCombatHUD();
        }
        if (data.result && data.result.equippedCount > 0) {
          playBeep(880, 'sine', 0.2);
          addChatMessage('Ekipman', `⚡ En İyisini Kuşan: ${data.result.equippedCount} parça daha güçlü eşya otomatik kuşandı! [GS ${data.state.stats.gearScore}]`);
        } else {
          addChatMessage('Ekipman', 'ℹ️ Zaten çantandaki giyilebilir en güçlü eşyaları kuşanmış durumdasın.');
        }
      } else {
        alert(data.error || 'Otomatik kuşanma yapılamadı.');
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- Inspect Other Players Engine ---
  async function openInspectModal(targetUsername) {
    try {
      const res = await fetch(`/api/rpg/inspect?target=${encodeURIComponent(targetUsername)}`);
      const data = await res.json();
      if (data && data.ok && data.profile) {
        renderInspectModal(data);
      } else {
        alert(data.error || 'Oyuncu profili bulunamadı.');
      }
    } catch (e) {
      console.error('[Inspect] Hata:', e);
    }
  }

  function renderInspectModal(data) {
    activeInspectProfile = data;
    const p = data.profile;
    const stats = p.stats || {};
    const gs = stats.gearScore || 0;
    const tier = getGearScoreTier(gs);

    document.getElementById('inspect-player-name').textContent = `@${data.target}`;
    document.getElementById('inspect-player-badge').textContent = data.isGuest ? 'Misafir Maceracı' : '⚡ Kick Savaşçısı';
    document.getElementById('inspect-level-badge').textContent = `Lv.${p.level}`;
    document.getElementById('inspect-gs-number').textContent = gs;

    const tierEl = document.getElementById('inspect-gs-tier');
    if (tierEl) {
      tierEl.textContent = tier.tag;
      tierEl.style.color = tier.color;
      tierEl.style.borderColor = tier.color;
    }

    const cvs = document.getElementById('inspect-avatar-canvas');
    if (cvs) {
      const avIdx = Math.abs(parseInt(data.avatarIndex, 10) || 0) % AVATAR_PRESETS.length;
      drawAvatarPreviewPortrait(cvs, AVATAR_PRESETS[avIdx]);
    }

    // Target Stats
    document.getElementById('ins-stat-atk').textContent = stats.atk || 0;
    document.getElementById('ins-stat-def').textContent = stats.def || 0;
    document.getElementById('ins-stat-hp').textContent = stats.hp || 0;
    document.getElementById('ins-stat-crit').textContent = `%${stats.crit || 0}`;
    document.getElementById('ins-stat-critDmg').textContent = `%${stats.critDmg || 0}`;
    document.getElementById('ins-stat-haste').textContent = `%${stats.haste || 0}`;

    // Target 7 Slots
    const eq = p.equipment || {};
    for (const slot of RPG_SLOTS) {
      const item = eq[slot];
      const slotCard = document.getElementById(`inspect-slot-${slot}`);
      const nameEl = document.getElementById(`ins-name-${slot}`);
      const scoreEl = document.getElementById(`ins-score-${slot}`);
      if (!slotCard || !nameEl) continue;

      slotCard.className = 'equip-slot-card inspect-slot';
      const iconBox = slotCard.querySelector('.slot-icon-box');
      if (item) {
        slotCard.classList.add(`rarity-${item.rarity}`);
        const plusStr = item.plus > 0 ? `+${item.plus} ` : '';
        nameEl.textContent = `${plusStr}${item.name}`;
        if (scoreEl) scoreEl.textContent = `GS +${item.score || 0}`;
        if (iconBox) iconBox.innerHTML = getRpgItemSvgIcon(slot, item.rarity, item.ilvl);
        slotCard.onclick = () => showItemPopover(item, true, true);
      } else {
        nameEl.textContent = 'Boş';
        if (scoreEl) scoreEl.textContent = '';
        if (iconBox) iconBox.innerHTML = getRpgItemSvgIcon(slot, 0, 1);
        slotCard.onclick = null;
      }
    }

    openModal('modal-inspect-player');
  }

  // --- Player Proximity Menu (Inspect / Trade) ---
  function openPlayerInteractMenu(playerData) {
    activeInteractPlayer = playerData;
    const modal = document.getElementById('player-interact-modal');
    if (!modal) return;
    document.getElementById('interact-target-name').textContent = `@${playerData.username}`;
    document.getElementById('interact-target-gs').textContent = playerData.gearScore ? `[GS ${playerData.gearScore}]` : '[GS 0]';
    modal.classList.remove('hidden');
  }

  function closePlayerInteractMenu() {
    const modal = document.getElementById('player-interact-modal');
    if (modal) modal.classList.add('hidden');
    activeInteractPlayer = null;
  }

  // --- RPG Kill Result Toast & Level Up FX ---
  function handleRpgKillResult(msg) {
    const res = msg.result;
    if (!res) return;

    // Show floating XP
    if (res.xp) {
      showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, `+${res.xp} XP`, 'primo');
    }

    // Leveled up?
    if (res.leveledUp) {
      playVictoryJingle();
      showLevelUpBanner(res.level);
    }

    // Equipment drops
    if (res.drops && res.drops.length > 0) {
      res.drops.forEach(item => {
        showRpgDropToast(item);
      });
    }

    // Refresh profile state
    fetchRpgProfile();
  }

  function showLevelUpBanner(level) {
    addChatMessage('🌟 TEBRİKLER', `LEVEL UP! Tebrikler, Seviye ${level} oldun!`);
    showDamageNumber({ x: myPlayer.x, y: 2.6, z: myPlayer.z }, `⭐ LEVEL UP! Lv.${level}`, 'crit');
  }

  function showRpgDropToast(item) {
    const container = document.getElementById('loot-toast-container');
    if (!container) return;

    playBeep(880, 'sine', 0.2);
    const pill = document.createElement('div');
    pill.className = `loot-toast-pill rarity-${item.rarity}`;
    pill.innerHTML = `
      <span style="font-size: 1.4rem;">${RPG_SLOT_ICONS[item.slot] || '⚔️'}</span>
      <div>
        <span class="loot-toast-name">${item.plus > 0 ? '+' + item.plus + ' ' : ''}${item.name}</span>
        <span class="loot-toast-rarity">${item.rarityLabel || 'Nadir'} (ilvl ${item.ilvl} | +${item.score} GS)</span>
      </div>
    `;

    container.appendChild(pill);
    setTimeout(() => {
      pill.remove();
    }, 3200);
  }

  // --- Character Companion (Pet) Management & UI ---
  async function fetchUserCompanions() {
    try {
      const res = await fetch(`/api/companions/${encodeURIComponent(myPlayer.username || 'Misafir')}`);
      const data = await res.json();
      if (data && (data.ok || data.companions || data.success)) {
        unlockedCompanionsList = data.companions || [];
        if (data.activeCompanion && (!myCompanion || myCompanion !== data.activeCompanion)) {
          myCompanion = data.activeCompanion;
          const found = unlockedCompanionsList.find(c => c.name.toLowerCase() === myCompanion.toLowerCase());
          myCompanionData = found || { name: myCompanion, element: 'Electro' };
          spawnCompanionMesh(myCompanion, myCompanionData.element);
          updateCombatHUD();
        }
      }
    } catch (e) {
      console.error('[Companion] Yoldaş listesi getirme hatası:', e);
    }
  }

  function toggleCompanionModal() {
    const modal = document.getElementById('modal-companion-selector');
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
      openCompanionModal();
    } else {
      closeCompanionModal();
    }
  }

  function openCompanionModal() {
    openModal('modal-companion-selector');
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'WORLD_GET_COMPANIONS' }));
    }
    fetchUserCompanions().then(() => {
      renderCompanionModal(currentCompanionFilter);
    });
  }

  function closeCompanionModal() {
    closeModal('modal-companion-selector');
  }

  let currentCompanionFilter = 'all';

  function renderCompanionModal(filterElem = 'all') {
    currentCompanionFilter = filterElem;
    const grid = document.getElementById('companion-cards-grid');
    const countBadge = document.getElementById('companion-unlocked-count');
    if (!grid) return;

    grid.innerHTML = '';
    const filtered = (unlockedCompanionsList || []).filter(c => {
      if (filterElem === 'all') return true;
      return (c.element || '').toLowerCase() === filterElem.toLowerCase();
    });

    if (countBadge) {
      countBadge.textContent = `${unlockedCompanionsList.length} Adet 5★ Yoldaş`;
    }

    if (unlockedCompanionsList.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: #cbd5e1; padding: 50px 20px; line-height: 1.6;">
          <div style="font-size: 2.6rem; margin-bottom: 12px;">🔒</div>
          <strong style="color: #f8fafc; font-size: 1.1rem; display: block; margin-bottom: 6px;">Henüz 5★ bir karaktere sahip değilsin.</strong>
          <span style="color: #94a3b8; font-size: 0.88rem;">Yoldaşlar yalnızca Kick yayınında (<code>!wish</code> / <code>!wish10</code>) veya oyun içinde çıkardığın 5★ efsanevi karakterlerden seçilebilir!</span>
        </div>
      `;
      clearCompanionPreview();
      return;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 30px;">Bu elementte sahip olduğun bir 5★ karakter bulunmuyor.</div>';
    } else {
      filtered.forEach(c => {
        const card = document.createElement('div');
        const isEquipped = myCompanion && myCompanion.toLowerCase() === c.name.toLowerCase();
        const isSelected = selectedCompanionInModal && selectedCompanionInModal.toLowerCase() === c.name.toLowerCase();

        const elemIcon = c.element === 'Electro' ? '⚡' : (c.element === 'Geo' ? '🪨' : (c.element === 'Pyro' ? '🔥' : (c.element === 'Hydro' ? '💧' : (c.element === 'Anemo' ? '🍃' : (c.element === 'Cryo' ? '❄️' : (c.element === 'Dendro' ? '🌿' : '✨'))))));

        card.className = `companion-card rarity-5 ${isEquipped ? 'equipped' : ''} ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          ${isEquipped ? '<span class="companion-card-equipped-badge">KUŞANILDI</span>' : ''}
          <div class="companion-card-img-wrap">
            <img src="${c.icon || c.splashArt || '/assets/characters/placeholder.png'}" alt="${c.name}" onerror="this.src='/assets/avatars/avatar_1.svg'">
            <span class="companion-card-elem-badge">${elemIcon}</span>
          </div>
          <div class="companion-card-info">
            <span class="companion-card-name">${c.name}</span>
            <span class="companion-card-stars">★★★★★</span>
          </div>
        `;

        card.addEventListener('click', () => {
          selectCompanionInModal(c.name);
        });

        grid.appendChild(card);
      });
    }

    // Default select first or active companion
    const toSelect = selectedCompanionInModal || myCompanion || (filtered[0] && filtered[0].name);
    if (toSelect) {
      selectCompanionInModal(toSelect);
    }
  }

  function clearCompanionPreview() {
    selectedCompanionInModal = null;
    const previewImg = document.getElementById('companion-preview-img');
    const previewName = document.getElementById('companion-preview-name');
    const previewTitle = document.getElementById('companion-preview-title');
    const previewElem = document.getElementById('companion-preview-element');
    const skillEName = document.getElementById('companion-skill-e-name');
    const skillEDesc = document.getElementById('companion-skill-e-desc');
    const skillQName = document.getElementById('companion-skill-q-name');
    const skillQDesc = document.getElementById('companion-skill-q-desc');
    const btnEquip = document.getElementById('btn-equip-companion');

    if (previewImg) previewImg.src = '/assets/characters/placeholder.png';
    if (previewName) previewName.textContent = '5★ Yoldaş Yok';
    if (previewTitle) previewTitle.textContent = 'Dilek çekerek 5★ karakter açabilirsin';
    if (previewElem) previewElem.textContent = '✨ Bilinmeyen';
    if (skillEName) skillEName.textContent = 'Yetenek Yok';
    if (skillEDesc) skillEDesc.textContent = '5★ karakter kuşanıldığında yetenek seti burada listelenir.';
    if (skillQName) skillQName.textContent = 'Burst Yok';
    if (skillQDesc) skillQDesc.textContent = '5★ karakter kuşanıldığında element patlaması burada listelenir.';
    if (btnEquip) {
      btnEquip.textContent = '🔒 5★ Karakter Gerekli';
      btnEquip.style.opacity = '0.5';
      btnEquip.disabled = true;
    }
  }

  function selectCompanionInModal(charName) {
    selectedCompanionInModal = charName;
    const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === charName.toLowerCase());
    if (!found) {
      clearCompanionPreview();
      return;
    }

    const previewImg = document.getElementById('companion-preview-img');
    const previewName = document.getElementById('companion-preview-name');
    const previewTitle = document.getElementById('companion-preview-title');
    const previewElem = document.getElementById('companion-preview-element');
    const skillEName = document.getElementById('companion-skill-e-name');
    const skillEDesc = document.getElementById('companion-skill-e-desc');
    const skillQName = document.getElementById('companion-skill-q-name');
    const skillQDesc = document.getElementById('companion-skill-q-desc');
    const btnEquip = document.getElementById('btn-equip-companion');

    const cfg = getCompanionConfig(charName, found.element);
    const element = found.element || (cfg && cfg.element) || 'Electro';

    if (previewImg) {
      previewImg.src = found.splashArt || found.icon || '/assets/characters/placeholder.png';
      previewImg.onerror = () => { previewImg.src = '/assets/avatars/avatar_1.svg'; };
    }
    if (previewName) previewName.textContent = charName;
    if (previewTitle) {
      previewTitle.textContent = `${found.title || '5★ Efsanevi Karakter'} • Envanterinde Mevcut`;
    }
    if (previewElem) previewElem.textContent = `${(cfg && cfg.elementEmoji) || '✨'} ${element}`;

    if (cfg) {
      if (skillEName) skillEName.textContent = cfg.eName;
      if (skillEDesc) skillEDesc.textContent = cfg.eDesc;
      if (skillQName) skillQName.textContent = cfg.qName;
      if (skillQDesc) skillQDesc.textContent = cfg.qDesc;
    }

    if (btnEquip) {
      btnEquip.disabled = false;
      const isEquipped = myCompanion && myCompanion.toLowerCase() === charName.toLowerCase();
      if (isEquipped) {
        btnEquip.textContent = '✅ Zaten Kuşanıldı';
        btnEquip.style.opacity = '0.65';
      } else {
        btnEquip.textContent = '🐾 Yoldaş Olarak Kuşan';
        btnEquip.style.opacity = '1.0';
      }
    }

    // Update active highlight in grid
    document.querySelectorAll('.companion-card').forEach(card => {
      const nameEl = card.querySelector('.companion-card-name');
      if (nameEl && nameEl.textContent.trim().toLowerCase() === charName.toLowerCase()) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function equipSelectedCompanion() {
    if (!selectedCompanionInModal) return;
    if (myCompanion && myCompanion.toLowerCase() === selectedCompanionInModal.toLowerCase()) {
      addChatMessage('🐾 Yoldaş', `@${myPlayer.username}, ${myCompanion} zaten senin yoldaşın olarak yanında süzülüyor!`);
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_SELECT_COMPANION',
        companion: selectedCompanionInModal
      }));
    }
  }

  function unequipCompanion() {
    if (!myCompanion) return;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_SELECT_COMPANION',
        companion: 'none'
      }));
    }
  }

  // --- 15. Standalone Inventory & Collection Bag Modal (#modal-inventory-bag) ---
  let currentInventoryBagTab = 'rpg';

  function toggleInventoryBagModal() {
    const modal = document.getElementById('modal-inventory-bag');
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
      openInventoryBagModal();
    } else {
      closeModal('modal-inventory-bag');
    }
  }

  async function openInventoryBagModal(tab = null) {
    if (tab) currentInventoryBagTab = tab;
    openModal('modal-inventory-bag');
    await Promise.all([
      fetchInventory(),
      fetchRpgProfile()
    ]);
    renderInventoryBagModal();
  }

  function switchInventoryBagTab(tabName) {
    currentInventoryBagTab = tabName || 'rpg';
    document.querySelectorAll('.btn-inv-tab').forEach(btn => {
      if (btn.getAttribute('data-inv-tab') === currentInventoryBagTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    ['rpg', 'materials', 'gacha'].forEach(t => {
      const panel = document.getElementById(`inv-panel-${t}`);
      if (panel) {
        if (t === currentInventoryBagTab) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
    });
    renderInventoryBagModal();
  }

  function renderInventoryBagModal() {
    const primoEl = document.getElementById('inv-primo-val');
    if (primoEl) primoEl.textContent = myPlayer.primogems || 0;
    const dustEl = document.getElementById('inv-dust-val');
    if (dustEl) dustEl.textContent = (myRpgProfile && myRpgProfile.dust) || 0;
    const gsEl = document.getElementById('inv-gs-val');
    if (gsEl) gsEl.textContent = getMyGearScore();

    // 1. RPG Equipment Bag Tab
    const rpgBag = (myRpgProfile && Array.isArray(myRpgProfile.bag)) ? myRpgProfile.bag : [];
    const rpgEquipped = (myRpgProfile && myRpgProfile.equipment) ? Object.values(myRpgProfile.equipment).filter(Boolean) : [];
    const countRpgEl = document.getElementById('inv-tab-count-rpg');
    if (countRpgEl) countRpgEl.textContent = rpgBag.length + rpgEquipped.length;

    const rpgGrid = document.getElementById('inv-rpg-grid');
    if (rpgGrid) {
      rpgGrid.innerHTML = '';
      const allRpg = [
        ...rpgEquipped.map(it => ({ ...it, _isEquipped: true })),
        ...rpgBag.map(it => ({ ...it, _isEquipped: false }))
      ];
      if (allRpg.length === 0) {
        rpgGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#94a3b8; padding:24px;">Henüz RPG ekipmanın yok. Zindanlarda yaratık avlayarak veya Günlük Lonca Sandığını açarak ekipman kazanabilirsin!</div>';
      } else {
        allRpg.forEach(item => {
          const card = document.createElement('div');
          card.className = `inv-item-card rarity-${item.rarity || 1}`;
          const plusTxt = item.plus > 0 ? `+${item.plus} ` : '';
          const eqBadge = item._isEquipped ? '<span style="color:#34d399;font-weight:900;">[KUŞANILDI]</span> ' : '';
          card.innerHTML = `
            <div class="inv-item-top">
              <div class="inv-item-icon">${getRpgItemSvgIcon(item.slot, item.rarity, item.ilvl)}</div>
              <div class="inv-item-meta">
                <div class="inv-item-name" title="${plusTxt}${item.name}">${plusTxt}${item.name}</div>
                <div class="inv-item-sub">${eqBadge}${RPG_SLOT_LABELS[item.slot] || item.slot} • GS +${item.score || 0} • iLvl ${item.ilvl || 1}</div>
              </div>
            </div>
          `;
          card.style.cursor = 'pointer';
          card.onclick = () => {
            closeModal('modal-inventory-bag');
            openCharacterSheet();
            setTimeout(() => showItemPopover(item, Boolean(item._isEquipped)), 120);
          };
          rpgGrid.appendChild(card);
        });
      }
    }

    // 2. Monster Materials Tab
    const materials = (myInventory || []).filter(i => i.type === 'material');
    const countMatEl = document.getElementById('inv-tab-count-mat');
    if (countMatEl) countMatEl.textContent = materials.length;

    const matGrid = document.getElementById('inv-mat-grid');
    if (matGrid) {
      matGrid.innerHTML = '';
      if (materials.length === 0) {
        matGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#94a3b8; padding:24px;">Çantanda hiç canavar materyali yok. Kadim Zindan Portalı\'ndan savaş alanlarına girerek materyal toplayabilirsin!</div>';
      } else {
        const grouped = new Map();
        materials.forEach(m => {
          const key = m.id || m.name;
          if (!grouped.has(key)) {
            grouped.set(key, { ...m, count: 0, totalPrimo: 0 });
          }
          const g = grouped.get(key);
          g.count += 1;
          g.totalPrimo += (parseInt(m.sellPrice, 10) || 3);
        });
        grouped.forEach(mat => {
          const card = document.createElement('div');
          card.className = `inv-item-card rarity-${mat.rarity || 1}`;
          card.innerHTML = `
            <div class="inv-item-top">
              <div class="inv-item-icon">${mat.icon || '🧪'}</div>
              <div class="inv-item-meta">
                <div class="inv-item-name">${mat.name} (x${mat.count})</div>
                <div class="inv-item-sub">Satış Değeri: 💎 +${mat.totalPrimo} Primogem</div>
              </div>
            </div>
          `;
          matGrid.appendChild(card);
        });
      }
    }

    // 3. Gacha Collection (4★ & 5★) Tab
    const gachaItems = (myInventory || []).filter(i => i.type !== 'material' && i.rarity >= 4);
    const countGachaEl = document.getElementById('inv-tab-count-gacha');
    if (countGachaEl) countGachaEl.textContent = gachaItems.length;

    const gachaGrid = document.getElementById('inv-gacha-grid');
    if (gachaGrid) {
      gachaGrid.innerHTML = '';
      if (gachaItems.length === 0) {
        gachaGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#94a3b8; padding:24px;">Henüz 4★ veya 5★ Gacha eşyan yok. Kick sohbetinde <b>!wish</b> veya <b>!wish10</b> yazarak dilek çekebilirsin!</div>';
      } else {
        gachaItems.forEach(item => {
          const card = document.createElement('div');
          card.className = `inv-item-card rarity-${item.rarity || 4}`;
          const stars = '★'.repeat(item.rarity || 4);
          const iconHtml = item.icon && (item.icon.startsWith('/') || item.icon.startsWith('http'))
            ? `<img src="${item.icon}" alt="${item.name}" onerror="this.style.display='none'">`
            : (item.type === 'character' ? '🌟' : '🗡️');
          card.innerHTML = `
            <div class="inv-item-top">
              <div class="inv-item-icon">${iconHtml}</div>
              <div class="inv-item-meta">
                <div class="inv-item-name" title="${item.name}">${item.name}</div>
                <div class="inv-item-sub" style="color:${item.rarity === 5 ? '#fde047' : '#d8b4fe'}">${stars} • ${item.type === 'character' ? 'Karakter' : 'Silah'}</div>
              </div>
            </div>
          `;
          gachaGrid.appendChild(card);
        });
      }
    }
  }

  async function sellAllMaterialsFromInventoryModal() {
    try {
      const res = await fetch('/api/world/sell-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, sellAll: true })
      });
      const data = await res.json();
      if (data && data.success) {
        playVictoryJingle();
        myPlayer.primogems = data.newTotalPrimo;
        updateUIProfile();
        await fetchInventory();
        renderInventoryBagModal();
        addChatMessage('Tüccar Liben', `💰 ${data.soldCount} adet canavar materyali sattın ve +${data.earnedPrimo} 💎 Primogem kazandın!`);
      } else {
        alert((data && data.message) || 'Satılacak materyal bulunamadı.');
      }
    } catch (e) {
      console.error('Materyal satış hatası:', e);
    }
  }

  // --- 16. Mylune Daily Quests System (Kick Stream + MMO Hybrid) ---
  let myDailyQuestsState = null;

  async function fetchDailyQuests() {
    if (!myPlayer || !myPlayer.username) return;
    try {
      const res = await fetch(`/api/world/daily-quests?username=${encodeURIComponent(myPlayer.username)}`);
      const data = await res.json();
      if (data && data.ok && data.state) {
        myDailyQuestsState = data.state;
        renderDailyQuestsUI();
      }
    } catch (e) {
      console.warn('[DailyQuests] Görev durumu alınamadı:', e);
    }
  }

  function notifyGuildVisit() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'WORLD_VISIT_GUILD' }));
    } else if (myPlayer && myPlayer.username) {
      fetch('/api/world/daily-quests/visit-guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username })
      }).then(r => r.json()).then(d => {
        if (d && d.state) {
          myDailyQuestsState = d.state;
          renderDailyQuestsUI();
        }
      }).catch(() => {});
    }
  }

  function toggleDailyQuestsModal() {
    const modal = document.getElementById('modal-daily-quests');
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
      openDailyQuestsModal();
    } else {
      closeModal('modal-daily-quests');
    }
  }

  function openDailyQuestsModal() {
    openModal('modal-daily-quests');
    fetchDailyQuests();
    renderDailyQuestsUI();
  }

  async function claimDailyQuestReward(questId) {
    if (!questId) return;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_CLAIM_DAILY_QUEST',
        questId
      }));
      return;
    }
    try {
      const res = await fetch('/api/world/daily-quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myPlayer.username, questId })
      });
      const data = await res.json();
      handleDailyQuestClaimResponse(data);
    } catch (e) {
      console.error('[DailyQuests] Ödül alma hatası:', e);
    }
  }

  function handleDailyQuestClaimResponse(data) {
    if (!data) return;
    if (data.state) {
      myDailyQuestsState = data.state;
      renderDailyQuestsUI();
    }
    if (data.rpgState) {
      myRpgProfile = data.rpgState;
      updateUIProfile();
    }
    if (typeof data.newTotalPrimo === 'number') {
      myPlayer.primogems = data.newTotalPrimo;
      updateUIProfile();
    }
    if (data.ok) {
      playVictoryJingle();
      const bonusTxt = data.bonusItem
        ? ` + 🗡️ [${data.bonusItem.rarity}★ ${data.bonusItem.name} (+${data.bonusItem.score} GS)]`
        : '';
      const label = data.title || (Array.isArray(data.claimedTitles) ? data.claimedTitles.join(', ') : 'Günlük Görev');
      addChatMessage('📜 Lonca Ödülü', `🎁 "${label}" ödülü alındı: +${data.primoGain || 0} 💎 Primogem, +${data.xpGain || 0} RPG XP${bonusTxt}!`);
      if (myMesh) {
        showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `+${data.primoGain || 0} 💎 +${data.xpGain || 0} XP`, 'crit');
      }
    } else if (data.error) {
      alert(data.error);
    }
  }

  function renderDailyQuestsUI() {
    if (!myDailyQuestsState || !Array.isArray(myDailyQuestsState.quests)) return;
    const st = myDailyQuestsState;
    const quests = st.quests;
    const bonus = st.bonusChest || {};

    const anyClaimableQuest = quests.some(q => q.completed && !q.claimed);
    const chestClaimable = Boolean(bonus.unlocked && !bonus.claimed);
    const hasAnyClaimable = anyClaimableQuest || chestClaimable;

    // 1. Update Alert Dots on Nav Button & Mini Tracker
    const navDot = document.getElementById('nav-daily-badge');
    if (navDot) navDot.classList.toggle('hidden', !hasAnyClaimable);
    const trackerDot = document.getElementById('dq-tracker-badge');
    if (trackerDot) trackerDot.classList.toggle('hidden', !hasAnyClaimable);

    // 2. Render Top-Right Mini Tracker HUD (#daily-quest-tracker)
    const countSmall = document.getElementById('dq-tracker-count');
    if (countSmall) countSmall.textContent = `(${st.completedCount}/${st.totalCount})`;

    const miniList = document.getElementById('dq-tracker-list');
    if (miniList) {
      miniList.innerHTML = '';
      quests.forEach(q => {
        const row = document.createElement('div');
        row.className = `dq-mini-row ${q.completed ? 'done' : ''} ${q.claimed ? 'claimed' : ''}`;
        const rightAction = (q.completed && !q.claimed)
          ? `<button type="button" class="btn-dq-mini-claim" data-claim-id="${q.id}">🎁 Al</button>`
          : `<span class="dq-mini-prog">${q.claimed ? '☑️' : `${q.progress}/${q.target}`}</span>`;
        row.innerHTML = `
          <div class="dq-mini-left">
            <span>${q.icon || '📜'}</span>
            <span class="dq-mini-name" title="${q.desc}">${q.title}</span>
          </div>
          <div class="dq-mini-right">${rightAction}</div>
        `;
        const claimBtn = row.querySelector('[data-claim-id]');
        if (claimBtn) {
          claimBtn.onclick = (e) => {
            e.stopPropagation();
            claimDailyQuestReward(q.id);
          };
        } else {
          row.onclick = () => openDailyQuestsModal();
        }
        miniList.appendChild(row);
      });
    }

    // 3. Render Full Daily Quests Modal (#modal-daily-quests)
    const dateLabel = document.getElementById('dq-date-label');
    if (dateLabel) dateLabel.textContent = st.date || 'Bugün';

    const compSummary = document.getElementById('dq-completed-summary');
    if (compSummary) compSummary.textContent = `${st.completedCount} / ${st.totalCount} Görev Tamamlandı`;

    const masterFill = document.getElementById('dq-master-fill');
    if (masterFill) {
      const pct = Math.min(100, Math.round((st.completedCount / (st.totalCount || 5)) * 100));
      masterFill.style.width = `${pct}%`;
    }

    const btnClaimAll = document.getElementById('btn-dq-claim-all');
    if (btnClaimAll) {
      btnClaimAll.disabled = !hasAnyClaimable;
      btnClaimAll.textContent = hasAnyClaimable ? '🎁 Hazır Ödülleri Topla!' : '🎁 Hazır Ödül Yok';
    }

    const listEl = document.getElementById('daily-quests-list');
    if (listEl) {
      listEl.innerHTML = '';
      quests.forEach(q => {
        const pct = Math.min(100, Math.round((q.progress / (q.target || 1)) * 100));
        const card = document.createElement('div');
        card.className = `dq-quest-card cat-${q.category || 'mmo'} ${q.completed ? 'completed' : ''} ${q.claimed ? 'claimed' : ''}`;

        let btnText = `${q.progress}/${q.target} Devam Ediyor`;
        let btnDisabled = true;
        if (q.claimed) {
          btnText = '☑️ Ödül Alındı';
          btnDisabled = true;
        } else if (q.completed) {
          btnText = '🎁 Ödülü Al!';
          btnDisabled = false;
        }

        card.innerHTML = `
          <div class="dq-card-top">
            <div class="dq-card-icon">${q.icon || '📜'}</div>
            <div class="dq-card-head">
              <span class="dq-card-badge">${q.badge || 'GÜNLÜK GÖREV'}</span>
              <h4 class="dq-card-title">${q.title}</h4>
              <p class="dq-card-desc">${q.desc}</p>
            </div>
          </div>
          <div class="dq-card-prog-wrap">
            <div class="dq-card-prog-row">
              <span>İlerleme</span>
              <span>${q.progress} / ${q.target} (%${pct})</span>
            </div>
            <div class="dq-card-prog-bar">
              <div class="dq-card-prog-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
          <div class="dq-card-footer">
            <div class="dq-card-rewards">
              <span class="dq-reward-pill primo">💎 +${q.rewardPrimo}</span>
              <span class="dq-reward-pill xp">✨ +${q.rewardXp} XP</span>
            </div>
            <button type="button" class="btn-dq-claim" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
          </div>
        `;

        const btn = card.querySelector('.btn-dq-claim');
        if (btn && !btnDisabled) {
          btn.onclick = () => claimDailyQuestReward(q.id);
        }
        listEl.appendChild(card);
      });
    }

    // 4. Grand Bonus Chest Card
    const chestStatus = document.getElementById('dq-chest-status');
    if (chestStatus) {
      chestStatus.textContent = bonus.claimed
        ? '☑️ Bugün Alındı'
        : (bonus.unlocked ? '✨ Sandık Hazır!' : `${st.completedCount} / ${st.totalCount} Görev`);
    }
    const btnChest = document.getElementById('btn-dq-claim-chest');
    if (btnChest) {
      if (bonus.claimed) {
        btnChest.disabled = true;
        btnChest.textContent = '☑️ Lonca Sandığı Alındı';
      } else if (bonus.unlocked) {
        btnChest.disabled = false;
        btnChest.textContent = '🎁 Lonca Sandığını Aç!';
      } else {
        btnChest.disabled = true;
        btnChest.textContent = `🔒 ${st.completedCount}/${st.totalCount} Görev Tamamla`;
      }
    }
  }

  // --- Bootstrap ---
  window.openRPGDialogue = openRPGDialogue;
  window.closeRPGDialogue = closeRPGDialogue;
  window.openCharacterSheet = openCharacterSheet;
  window.openInspectModal = openInspectModal;
  window.toggleCompanionModal = toggleCompanionModal;
  window.openCompanionModal = openCompanionModal;
  window.openInventoryBagModal = openInventoryBagModal;
  window.toggleInventoryBagModal = toggleInventoryBagModal;
  window.openDailyQuestsModal = openDailyQuestsModal;
  window.toggleDailyQuestsModal = toggleDailyQuestsModal;

  window.addEventListener('DOMContentLoaded', () => {
    initThree();
    updateMyMesh();
    updateUIProfile();
    initWebSocket();
    initEvents();
    fetchRpgProfile();
    fetchDailyQuests();
    animate();
  });
})();
