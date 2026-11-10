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
  let myPlayer = {
    id: null,
    username: 'Gezgin_' + Math.floor(1000 + Math.random() * 9000),
    isGuest: true,
    avatarIndex: 0,
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

  // --- Combat & Battle Zone State ---
  let playerHP = 500;
  let playerMaxHP = 500;
  let playerEnergy = 0; // 0 to 100%
  let isAttacking = false;
  let attackComboIndex = 0;
  let lastAttackTime = 0;
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
    }
  };

  function isBattleZone(map) {
    return map === 'battle_zone' || map === 'battle_zone_1' || map === 'battle_zone_2' || map === 'battle_zone_3';
  }

  function getGsDifficultyMultiplier(playerGS = 0, reqGS = 100) {
    if (!reqGS || reqGS <= 0) {
      return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: 1.0 };
    }
    const ratio = Math.max(0.05, playerGS / reqGS);
    if (ratio >= 1.0) {
      return { damageMult: 1.0, damageTakenMult: 1.0, glanceChance: 0, status: 'safe', ratio: 1.0 };
    } else if (ratio >= 0.6) {
      const damageMult = Math.max(0.45, Math.round(ratio * 100) / 100);
      const damageTakenMult = Math.min(1.8, Math.round((1 + (1 - ratio) * 1.3) * 100) / 100);
      const glanceChance = Math.round((1 - ratio) * 0.25 * 100) / 100;
      return { damageMult, damageTakenMult, glanceChance, status: 'challenging', ratio: Math.round(ratio * 100) / 100 };
    } else {
      const damageMult = Math.max(0.15, Math.round(ratio * 0.7 * 100) / 100);
      const damageTakenMult = Math.min(2.5, Math.round((1.5 + (1 - ratio) * 1.5) * 100) / 100);
      const glanceChance = 0.35;
      return { damageMult, damageTakenMult, glanceChance, status: 'deadly', ratio: Math.round(ratio * 100) / 100 };
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

  // Draw 2D Avatar Portrait for HUD profile & Avatar Selection Modal
  function drawAvatarPreviewPortrait(canvas, preset) {
    if (!canvas || !preset) return;
    const w = canvas.width || 48;
    const h = canvas.height || 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

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

  // --- 3D Chibi Character Rig Creator ---
  function create3DChibiCharacter(avatarIndex = 0) {
    const preset = AVATAR_PRESETS[Math.abs(avatarIndex) % AVATAR_PRESETS.length];
    const root = new THREE.Group();

    // Standard materials
    const matSkin = new THREE.MeshLambertMaterial({ color: preset.skin });
    const matHair = new THREE.MeshLambertMaterial({ color: preset.hair });
    const matClothes = new THREE.MeshLambertMaterial({ color: preset.clothes });
    const matTrim = new THREE.MeshLambertMaterial({ color: preset.trim || 0xfacc15 });
    const matPants = new THREE.MeshLambertMaterial({ color: preset.pants || 0x1e293b });
    const matBoots = new THREE.MeshLambertMaterial({ color: preset.boots || 0x334155 });
    const matCape = new THREE.MeshLambertMaterial({ color: preset.cape || preset.clothes, side: THREE.DoubleSide });

    // Face material
    const faceTex = createChibiFaceTexture(preset);
    const matFace = new THREE.MeshLambertMaterial({ map: faceTex });

    // 1. Head Group (Pivot at base of neck/head)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.48, 0);

    // Box face order: +X, -X, +Y, -Y, +Z (Front face), -Z (Back)
    const headMats = [matSkin, matSkin, matSkin, matSkin, matFace, matHair];
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, 0.76), headMats);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // 3D Hair & Accessories
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.22, 0.22), matHair);
    bangs.position.set(0, 0.30, 0.31);
    headGroup.add(bangs);

    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.78), matHair);
    sideL.position.set(-0.40, -0.05, 0.02);
    headGroup.add(sideL);

    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.78), matHair);
    sideR.position.set(0.40, -0.05, 0.02);
    headGroup.add(sideR);

    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.16, 0.78), matHair);
    hairTop.position.set(0, 0.40, 0);
    headGroup.add(hairTop);

    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.72, 0.16), matHair);
    hairBack.position.set(0, 0.02, -0.40);
    headGroup.add(hairBack);

    let hairTail = null;
    let floatingGear = null;

    // Special headgear / accessories per style
    if (preset.hairStyle === 'capitano_helm') {
      const helmCowl = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.84, 0.84), new THREE.MeshLambertMaterial({ color: 0x0f172a }));
      headGroup.add(helmCowl);

      const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0x06b6d4 }));
      visorSlit.position.set(0, 0, 0.42);
      headGroup.add(visorSlit);

      [-0.42, 0.42].forEach(hx => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.38, 4), new THREE.MeshLambertMaterial({ color: 0x475569 }));
        horn.rotation.z = hx > 0 ? -0.4 : 0.4;
        horn.position.set(hx, 0.36, -0.1);
        headGroup.add(horn);
      });
    } else if (preset.hairStyle === 'furina_hat') {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.42, 8), new THREE.MeshLambertMaterial({ color: 0x1e3a8a }));
      hat.position.set(0.12, 0.58, 0);
      hat.rotation.z = -0.15;
      headGroup.add(hat);

      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0x172554 }));
      brim.position.set(0.12, 0.40, 0);
      brim.rotation.z = -0.15;
      headGroup.add(brim);

      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 8), matTrim);
      rib.position.set(0.12, 0.44, 0);
      rib.rotation.z = -0.15;
      headGroup.add(rib);
    } else if (preset.hairStyle === 'klee_beret') {
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.58, 0.20, 10), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
      beret.position.set(0, 0.48, 0);
      beret.rotation.z = -0.1;
      headGroup.add(beret);

      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      feather.rotation.z = -0.7;
      feather.position.set(0.42, 0.62, 0);
      headGroup.add(feather);
    } else if (preset.hairStyle === 'amber_ears') {
      [-0.18, 0.18].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.06), new THREE.MeshLambertMaterial({ color: 0xdc2626 }));
        ear.position.set(ex, 0.58, 0);
        ear.rotation.z = ex > 0 ? -0.25 : 0.25;
        headGroup.add(ear);
      });
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: 0xb91c1c }));
      knot.position.set(0, 0.45, 0.05);
      headGroup.add(knot);
    } else if (preset.hairStyle === 'cat_ears') {
      [-0.26, 0.26].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4), matHair);
        ear.position.set(ex, 0.52, 0);
        ear.rotation.z = ex > 0 ? -0.2 : 0.2;
        headGroup.add(ear);

        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0xfda4af }));
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
    torsoGroup.add(torsoMesh);

    // Collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.38), matTrim);
    collar.position.set(0, 0.26, 0);
    torsoGroup.add(collar);

    // Belt & Buckle
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.10, 0.38), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
    belt.position.set(0, -0.20, 0);
    torsoGroup.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.40), matTrim);
    buckle.position.set(0, -0.20, 0);
    torsoGroup.add(buckle);

    // Dynamic Cape (hinged at upper back shoulders)
    const capeGeo = new THREE.BoxGeometry(0.50, 0.68, 0.03);
    capeGeo.translate(0, -0.34, 0);
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

    // Held Weapon / Gear in right hand
    const weaponType = preset.weapon || 'sword';
    const wepCol = preset.weaponColor || 0xe2e8f0;

    if (weaponType === 'sword') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.70, 0.02), new THREE.MeshLambertMaterial({ color: wepCol }));
      blade.position.set(0, 0.20, 0.15);
      blade.rotation.x = Math.PI / 4;
      rightHand.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), matTrim);
      guard.position.set(0, -0.06, 0.04);
      rightHand.add(guard);
    } else if (weaponType === 'greatsword') {
      const bigBlade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.10, 0.04), new THREE.MeshLambertMaterial({ color: wepCol }));
      bigBlade.position.set(0, 0.35, 0.22);
      bigBlade.rotation.x = Math.PI / 4;
      rightHand.add(bigBlade);
      const bigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.08), matTrim);
      bigGuard.position.set(0, -0.08, 0.05);
      rightHand.add(bigGuard);
    } else if (weaponType === 'polearm') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 6), new THREE.MeshLambertMaterial({ color: 0x78350f }));
      shaft.position.set(0, 0.20, 0.18);
      shaft.rotation.x = Math.PI / 4;
      rightHand.add(shaft);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), new THREE.MeshLambertMaterial({ color: wepCol }));
      head.position.set(0, 0.82, 0.18);
      head.rotation.x = Math.PI / 4;
      rightHand.add(head);
    } else if (weaponType === 'catalyst') {
      const orb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: wepCol }));
      orb.position.set(0.16, 0.10, 0.20);
      rightHand.add(orb);
      floatingGear = orb;
    } else if (weaponType === 'bow') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 12, Math.PI), new THREE.MeshLambertMaterial({ color: wepCol }));
      bow.rotation.y = Math.PI / 2;
      bow.position.set(0, 0.10, 0.15);
      rightHand.add(bow);
    } else if (weaponType === 'bomb') {
      const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
      bomb.position.set(0, -0.05, 0.15);
      rightHand.add(bomb);
    } else if (weaponType === 'potion') {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 8), new THREE.MeshLambertMaterial({ color: wepCol }));
      pot.position.set(0, -0.05, 0.15);
      rightHand.add(pot);
    }

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
      leftLegGroup,
      rightLegGroup,
      capeMesh,
      hairTail,
      floatingGear,
      floatingGearBaseY: 0.10,
      baseTorsoY: 0.94,
      baseHeadY: 1.48,
      walkCycle: Math.random() * Math.PI * 2,
      preset
    };

    return root;
  }

  // --- Procedural Chibi Animation Controller ---
  function animateRig(rig, isMoving, delta, now) {
    if (!rig) return;

    if (isMoving) {
      rig.walkCycle += delta * 11.5;
      const s = Math.sin(rig.walkCycle);

      // Alternate leg swings at hip
      rig.leftLegGroup.rotation.x = s * 0.72;
      rig.rightLegGroup.rotation.x = -s * 0.72;

      // Arms swing in opposition at shoulder
      rig.leftArmGroup.rotation.x = -s * 0.62;
      rig.rightArmGroup.rotation.x = s * 0.62;

      // Vertical stride bob
      const strideBob = Math.abs(s) * 0.065;
      rig.torsoGroup.position.y = rig.baseTorsoY + strideBob;
      rig.headGroup.position.y = rig.baseHeadY + strideBob;
      rig.headGroup.rotation.z = s * 0.035;

      // Dynamic Cape fluttering
      if (rig.capeMesh) {
        rig.capeMesh.rotation.x = 0.34 + Math.abs(s) * 0.28;
        rig.capeMesh.rotation.z = Math.sin(rig.walkCycle * 0.5) * 0.05;
      }

      // Hair swing
      if (rig.hairTail) {
        rig.hairTail.rotation.x = 0.38 + Math.abs(s) * 0.25;
        rig.hairTail.rotation.z = Math.sin(rig.walkCycle * 0.5) * 0.08;
      }
    } else {
      // Idle: smooth decay of rotations back to zero
      rig.leftLegGroup.rotation.x += (0 - rig.leftLegGroup.rotation.x) * 0.22;
      rig.rightLegGroup.rotation.x += (0 - rig.rightLegGroup.rotation.x) * 0.22;
      rig.leftArmGroup.rotation.x += (0 - rig.leftArmGroup.rotation.x) * 0.22;
      rig.rightArmGroup.rotation.x += (0 - rig.rightArmGroup.rotation.x) * 0.22;
      rig.headGroup.rotation.z += (0 - rig.headGroup.rotation.z) * 0.15;

      // Gentle rhythmic breathing
      const breath = Math.sin(now * 0.0035);
      rig.torsoGroup.position.y = rig.baseTorsoY + breath * 0.018;
      rig.headGroup.position.y = rig.baseHeadY + breath * 0.022;

      // Subtle breeze on cape & hair
      if (rig.capeMesh) {
        rig.capeMesh.rotation.x = 0.12 + Math.sin(now * 0.0028) * 0.06;
        rig.capeMesh.rotation.z = Math.cos(now * 0.0022) * 0.03;
      }
      if (rig.hairTail) {
        rig.hairTail.rotation.x = 0.16 + Math.sin(now * 0.0028) * 0.04;
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

  function createProceduralGrassTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Rich meadow green base
    ctx.fillStyle = '#1e7b34';
    ctx.fillRect(0, 0, 128, 128);

    // Soft organic grass tone variation (larger clusters, gentle blending)
    const tones = ['#22863a', '#1e7b34', '#196c2e', '#2ea043', '#1b7332'];
    for (let i = 0; i < 280; i++) {
      const x = Math.floor(Math.random() * 60) * 2;
      const y = Math.floor(Math.random() * 60) * 2;
      const w = 2 + Math.floor(Math.random() * 3) * 2;
      const h = 2 + Math.floor(Math.random() * 2) * 2;
      ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
      ctx.fillRect(x, y, w, h);
    }

    // Little clover leaves / gentle blades
    ctx.fillStyle = '#34d058';
    for (let i = 0; i < 80; i++) {
      const cx = Math.floor(Math.random() * 62) * 2;
      const cy = Math.floor(Math.random() * 62) * 2;
      ctx.fillRect(cx, cy, 2, 4);
      ctx.fillRect(cx - 2, cy + 2, 2, 2);
      ctx.fillRect(cx + 2, cy + 2, 2, 2);
    }

    // Gentle wildflowers (subtle pastel specks: buttercup, daisy, lavender, rose)
    const flowerColors = ['#fef08a', '#ffffff', '#f472b6', '#a78bfa', '#fb923c'];
    for (let i = 0; i < 35; i++) {
      const fx = Math.floor(Math.random() * 62) * 2;
      const fy = Math.floor(Math.random() * 62) * 2;
      ctx.fillStyle = flowerColors[i % flowerColors.length];
      ctx.fillRect(fx, fy, 2, 2);
      if (i % 2 === 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(fx + 2, fy, 2, 2);
      }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function createProceduralCobbleTexture(repeatX = 2, repeatY = 24) {
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Mortar (soft dark slate grey)
    ctx.fillStyle = '#293548';
    ctx.fillRect(0, 0, 64, 64);

    // Stone pavers with natural rounded corners & gentle edge shading
    const stoneBases = ['#5b697d', '#64748b', '#526071', '#6f7f95', '#4d5b6d'];
    const stoneHighlights = ['#7c8c9f', '#8595a8', '#718195'];
    const stoneShadows = ['#1e293b', '#243042', '#1b2434'];

    for (let row = 0; row < 8; row++) {
      const y = row * 8;
      const xOffset = (row % 2) * 4;
      for (let col = -1; col < 8; col++) {
        const x = col * 8 + xOffset;
        const colorIdx = (row * 3 + col * 5 + 20) % stoneBases.length;

        // Base stone body (6x6)
        ctx.fillStyle = stoneBases[colorIdx];
        ctx.fillRect(x + 1, y + 1, 6, 6);

        // Top & Left soft highlight
        ctx.fillStyle = stoneHighlights[colorIdx % stoneHighlights.length];
        ctx.fillRect(x + 2, y + 1, 4, 1);
        ctx.fillRect(x + 1, y + 2, 1, 4);

        // Bottom & Right soft shadow
        ctx.fillStyle = stoneShadows[colorIdx % stoneShadows.length];
        ctx.fillRect(x + 2, y + 6, 4, 1);
        ctx.fillRect(x + 6, y + 2, 1, 4);

        // Rounded corners: soften the 4 corner pixels with mortar color
        ctx.fillStyle = '#293548';
        ctx.fillRect(x + 1, y + 1, 1, 1);
        ctx.fillRect(x + 6, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 6, 1, 1);
        ctx.fillRect(x + 6, y + 6, 1, 1);
      }
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
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

  // --- 3. Three.js Scene Setup ---
  function initThree() {
    const container = document.getElementById('game-container');
    const canvas = document.getElementById('world-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.012);

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

    // Atmospheric Lights
    const ambientLight = new THREE.AmbientLight(0xfff7ed, 0.82);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x15803d, 0.4);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfef08a, 0.95);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 130;
    const d = 38;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

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

  // A) Central Fountain (Hollow-Rim Carved Basin - Zero Z-Fighting)
  function createCentralFountain() {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });

    // 1. Foundation Base Plinth
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 0.25, 28), darkStoneMat);
    plinth.position.y = 0.125;
    plinth.receiveShadow = true;
    group.add(plinth);

    // 2. Basin Outer Wall (open-ended cylinder)
    const outerWall = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.9, 0.75, 28, 1, true), stoneMat);
    outerWall.position.y = 0.50;
    outerWall.castShadow = true;
    outerWall.receiveShadow = true;
    group.add(outerWall);

    // Basin Inner Wall (BackSide for interior stone lining)
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(4.35, 4.5, 0.75, 28, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x64748b, side: THREE.BackSide })
    );
    innerWall.position.y = 0.50;
    group.add(innerWall);

    // 3. Rounded Stone Basin Rim (Torus placed at y = 0.875)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.52, 0.22, 10, 32), stoneMat);
    rim.position.y = 0.875;
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);

    // 4. Basin Sunken Stone Floor (y = 0.15)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.4, 28), new THREE.MeshLambertMaterial({ color: 0x475569 }));
    floor.position.y = 0.15;
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    // 5. Basin Water Surface (at y = 0.65 - safely 0.225 units below rim at 0.875, ZERO Z-fighting!)
    const waterMat = new THREE.MeshLambertMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.3, 32), waterMat);
    water.position.y = 0.65;
    water.rotation.x = -Math.PI / 2;
    group.add(water);

    // 6. Tiered Center Monument
    // Step 1: Base pedestal
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.6, 16), darkStoneMat);
    p1.position.y = 0.45;
    p1.castShadow = true;
    group.add(p1);

    // Step 2: Mid column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 0.9, 16), stoneMat);
    col.position.y = 1.05;
    col.castShadow = true;
    group.add(col);

    // Step 3: Mid Water Scallop Catch Basin / Bowl
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.1, 0.45, 20), stoneMat);
    bowl.position.y = 1.65;
    bowl.castShadow = true;
    group.add(bowl);

    // Mid Bowl Water disc
    const midWater = new THREE.Mesh(new THREE.CircleGeometry(1.75, 20), waterMat);
    midWater.position.y = 1.85;
    midWater.rotation.x = -Math.PI / 2;
    group.add(midWater);

    // Step 4: Upper Fluted Pedestal
    const upperCol = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 12), stoneMat);
    upperCol.position.y = 2.25;
    upperCol.castShadow = true;
    group.add(upperCol);

    // Step 5: Golden Urn Fountain Topper with Spout
    const urnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.4, 12), goldMat);
    urnBase.position.y = 2.85;
    group.add(urnBase);

    const urnBody = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), goldMat);
    urnBody.position.y = 3.2;
    group.add(urnBody);

    const urnSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.35, 10), goldMat);
    urnSpout.position.y = 3.55;
    group.add(urnSpout);

    // 4 Lion Head / Gargoyle Spouts trickling water into the main basin
    [-1.2, 1.2].forEach(sx => {
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), goldMat);
      spout.position.set(sx, 1.65, 0);
      group.add(spout);

      const stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 1.0, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 })
      );
      stream.position.set(sx * 1.1, 1.15, 0);
      group.add(stream);
    });

    [-1.2, 1.2].forEach(sz => {
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), goldMat);
      spout.position.set(0, 1.65, sz);
      group.add(spout);

      const stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 1.0, 6),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 })
      );
      stream.position.set(0, 1.15, sz * 1.1);
      group.add(stream);
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

  // --- 5. Map Builders (Town vs Interior) ---
  function clearWorld() {
    animatedCats = [];
    animatedNPCs = [];
    fountainParticlesData = [];
    chimneySmokeData = [];
    firefliesData = [];
    shrineAuraData = [];
    canalWaterMesh = null;
    shrineCrystalMesh = null;

    while (worldObjects.children.length > 0) {
      worldObjects.remove(worldObjects.children[0]);
    }
  }

  function buildTownMap() {
    clearWorld();
    currentMap = 'town';
    document.getElementById('ui-location').textContent = 'Kasaba Meydanı';

    // 1. Terrain Grass (Expansive 120x120 Meadow)
    const grassGeo = new THREE.PlaneGeometry(120, 120);
    const grassMat = new THREE.MeshLambertMaterial({
      map: createProceduralGrassTexture()
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    worldObjects.add(grass);

    // 2. Wide Cobblestone Crossroads (Clean '+' Shaped Grand Avenues)
    const pathTexX = createProceduralCobbleTexture(2, 28);
    const pathMatX = new THREE.MeshLambertMaterial({ map: pathTexX });
    const pathX = new THREE.Mesh(new THREE.PlaneGeometry(8, 88), pathMatX);
    pathX.rotation.x = -Math.PI / 2;
    pathX.position.y = 0.02;
    pathX.receiveShadow = true;
    worldObjects.add(pathX);

    const pathTexZ = createProceduralCobbleTexture(28, 2);
    const pathMatZ = new THREE.MeshLambertMaterial({ map: pathTexZ });
    const pathZ = new THREE.Mesh(new THREE.PlaneGeometry(88, 8), pathMatZ);
    pathZ.rotation.x = -Math.PI / 2;
    pathZ.position.y = 0.02;
    pathZ.receiveShadow = true;
    worldObjects.add(pathZ);

    // 3. Central Fountain (Zero Z-Fighting Carved Stone Basin)
    worldObjects.add(createCentralFountain());

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

    // Arched Stone Bridge at x = 0, z = 24
    const bridgeGroup = new THREE.Group();
    const bridgeGeo = new THREE.BoxGeometry(6.6, 0.4, 8.4);
    const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridgeMesh.position.set(0, 0.45, 24);
    bridgeMesh.castShadow = true;
    bridgeMesh.receiveShadow = true;
    bridgeGroup.add(bridgeMesh);

    // Bridge Stone & Timber Railings
    [-3.3, 3.3].forEach(rx => {
      const railGeo = new THREE.BoxGeometry(0.3, 0.8, 8.4);
      const railMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(rx, 0.9, 24);
      rail.castShadow = true;
      bridgeGroup.add(rail);

      [19.8, 28.2].forEach(pz => {
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), bankMat);
        ped.position.set(rx, 0.6, pz);
        ped.castShadow = true;
        bridgeGroup.add(ped);

        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        bl.position.set(rx, 1.4, pz);
        bridgeGroup.add(bl);

        const blLight = new THREE.PointLight(0xfef08a, 0.6, 8, 2);
        blLight.position.set(rx, 1.4, pz);
        bridgeGroup.add(blLight);
      });
    });
    worldObjects.add(bridgeGroup);

    // Battle Zone Ancient Portal Gate at South Bridge Landing (0, 32)
    worldObjects.add(createBattlePortalGate(0, 32));

    // 5. Four Key 3D Stylized Architectural Buildings (Spaced Generously Apart!)
    // A) Takas Pazarı (Trade Mart) - North-West Quarter (-24, -14)
    const tradeHouse = createTradeMartBuilding();
    tradeHouse.position.set(-24, 0, -14);
    worldObjects.add(tradeHouse);

    // Market Plaza Stalls in front of Trade Mart
    worldObjects.add(createMarketStall({
      x: -17, z: -5, rotY: 0,
      awningColor1: 0xef4444, awningColor2: 0xffffff, wareType: 'fruits'
    }));
    worldObjects.add(createMarketStall({
      x: -12, z: -5, rotY: 0,
      awningColor1: 0x3b82f6, awningColor2: 0xfacc15, wareType: 'potions'
    }));

    // B) Cat's Tail Taverna - North-East Quarter (24, -14)
    chimneyPos = { x: 26.8, y: 9.0, z: -16.2 };
    const tavern = createTavernBuilding();
    tavern.position.set(24, 0, -14);
    worldObjects.add(tavern);

    // Cat's Tail Outdoor Patio with Parasols and Tables (24, -4)
    worldObjects.add(createTavernPatio(24, -4));

    // C) Dilek Tapınağı (Gacha Shrine) - Grand North Sanctuary (0, -32)
    const shrine = createShrineBuilding();
    shrine.position.set(0, 0, -32);
    worldObjects.add(shrine);

    // D) Maceracılar Loncası (Guild Hall) - South-West Quarter (-24, 14)
    const guild = createGuildBuilding();
    guild.position.set(-24, 0, 14);
    worldObjects.add(guild);

    // Quest Notice Board in front of Guild
    worldObjects.add(createNoticeBoard(-17, 8, 0));

    // E) Scenic Waterside Gazebo & Garden - South-East Quarter (24, 14)
    worldObjects.add(createScenicGazebo(24, 14));

    // 6. Street Lamps along crossroads & plazas
    const lampPositions = [
      { x: -12, z: 0 }, { x: -24, z: 0 }, { x: 12, z: 0 }, { x: 24, z: 0 },
      { x: 0, z: -14 }, { x: 0, z: -24 }, { x: 0, z: 12 },
      { x: -16, z: -7 }, { x: 16, z: -7 }, { x: -16, z: 7 }, { x: 16, z: 7 }
    ];
    lampPositions.forEach(p => worldObjects.add(createStreetLamp(p.x, p.z)));

    // 7. Stone Benches & Flower Beds around Fountain Plaza (Framing the fountain)
    worldObjects.add(createBench(0, -7.2, 0));
    worldObjects.add(createBench(0, 7.2, Math.PI));
    worldObjects.add(createBench(-7.2, 0, Math.PI / 2));
    worldObjects.add(createBench(7.2, 0, -Math.PI / 2));

    worldObjects.add(createFlowerBed(-10, 5, 4, 2));
    worldObjects.add(createFlowerBed(10, 5, 4, 2));
    worldObjects.add(createFlowerBed(-10, -10, 4, 2));
    worldObjects.add(createFlowerBed(10, -10, 4, 2));

    // 8. Cute Wandering Pixel Cats
    worldObjects.add(createPixelCat(20, -2.5, 0xf97316)); // Ginger tabby near tavern patio
    worldObjects.add(createPixelCat(-3.5, 2.5, 0x0f172a)); // Calico near fountain
    worldObjects.add(createPixelCat(22, 16, 0xffffff)); // White cat near scenic gazebo

    // 9. Welcoming Town NPCs
    worldObjects.add(createNPCBillboard(2, 'Amber', 'Favonius Öncü Keşifçisi', -16, 9.5));
    worldObjects.add(createNPCBillboard(10, '🍃 Venti', 'Özgür Rüzgar Ozanı', 24, 13.8));

    // 10. Procedural Pine Trees around perimeter
    const treePositions = [
      { x: -42, z: -35 }, { x: -38, z: -20 }, { x: -40, z: 5 }, { x: -42, z: 32 },
      { x: 42, z: -35 }, { x: 38, z: -20 }, { x: 40, z: 5 }, { x: 42, z: 32 },
      { x: -16, z: -42 }, { x: 16, z: -42 }, { x: -28, z: 38 }, { x: 28, z: 38 }
    ];

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2.2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3d2e });
    const leavesGeo = new THREE.ConeGeometry(2.4, 5, 6);
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x166534 });

    for (const pos of treePositions) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 4;
      leaves.castShadow = true;
      tree.add(leaves);

      tree.position.set(pos.x, 0, pos.z);
      worldObjects.add(tree);
    }

    // 10. Initialize Living Particle Systems
    initParticleSystems();
  }

  function buildInteriorMap(mapId) {
    clearWorld();
    currentMap = mapId;

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

  // --- 6. Character 3D Mesh Creation & Bubbles ---
  function createPlayerMesh(avatarIndex, username, isGuest, primogems, gearScore = 0, level = 1) {
    const group = create3DChibiCharacter(avatarIndex);

    // Overhead Nametag Billboard
    const nameTex = createNametagCanvas(username, isGuest, primogems, gearScore, level);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(3.4, 0.8, 1);
    nameSprite.position.y = 2.45;
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
    bSprite.position.y = 3.65;
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
      if (msg.unlockedCompanions) {
        unlockedCompanionsList = msg.unlockedCompanions;
      }
      if (msg.activeCompanion && msg.activeCompanion !== 'none') {
        myCompanion = msg.activeCompanion;
        const found = (unlockedCompanionsList || []).find(c => c.name === myCompanion);
        myCompanionData = found || { name: myCompanion, element: 'Electro' };
        spawnCompanionMesh(myCompanion, myCompanionData.element);
      }
      updateUIProfile();
      updateCombatHUD();
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_STATE') {
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_PLAYER_AUTHED') {
      if (msg.socketId === socketId) {
        myPlayer.username = msg.player.username;
        myPlayer.isGuest = false;
        myPlayer.primogems = msg.player.primogems || myPlayer.primogems;
        updateUIProfile();
        fetchUserCompanions();
        closeModal('modal-auth');
        playBeep(880, 'triangle', 0.25);
        addChatMessage('Sistem', `🛡️ Kick hesabın (@${myPlayer.username}) başarıyla bağlandı!`);
      }
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
        triggerDoorWipe(msg.newMap);
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
          addChatMessage('🐾 5★ Yoldaş', `✨ ${myCompanion} (${myCompanionData.element}) artık yanında süzülüyor! Yetenek setin dönüştürüldü.`);
          showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, `🐾 ${myCompanion} Kuşandı!`, 'heal');
        } else {
          addChatMessage('🐾 5★ Yoldaş', `Yoldaş kaldırıldı. Standart yetenek setine dönüldü.`);
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
      if (msg.unlockedCompanions) {
        unlockedCompanionsList = msg.unlockedCompanions;
      }
      if (msg.activeCompanion && msg.activeCompanion !== 'none' && !myCompanion) {
        myCompanion = msg.activeCompanion;
        const found = (unlockedCompanionsList || []).find(c => c.name === myCompanion);
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
          otherPet.position.set(entry.mesh.position.x, entry.mesh.position.y + 1.85, entry.mesh.position.z);
          scene.add(otherPet);
          otherPlayerCompanions.set(msg.socketId, otherPet);
        } else {
          if (otherPlayerCompanions.has(msg.socketId)) {
            scene.remove(otherPlayerCompanions.get(msg.socketId));
            otherPlayerCompanions.delete(msg.socketId);
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
          otherPet.position.set(p.x, p.y + 1.85, p.z);
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
            compPet.position.set(p.x, (p.y || 0) + 1.85, p.z);
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
  }

  // --- 9. Movement & Proximity Loop ---
  function updateMovement(delta) {
    if (!myMesh) return;

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
          ? { minX: -38, maxX: 38, minZ: -38, maxZ: 38 }
          : { minX: -15, maxX: 15, minZ: -11, maxZ: 11 });
    myPlayer.x = Math.max(bounds.minX, Math.min(bounds.maxX, myPlayer.x));
    myPlayer.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, myPlayer.z));

    // Soft obstacle collision in Town
    if (currentMap === 'town') {
      const fDist = Math.hypot(myPlayer.x, myPlayer.z);
      if (fDist < 4.9 && fDist > 0.01) {
        const angle = Math.atan2(myPlayer.z, myPlayer.x);
        myPlayer.x = Math.cos(angle) * 4.9;
        myPlayer.z = Math.sin(angle) * 4.9;
      }
      const buildingColliders = [
        { x1: -29.2, x2: -18.8, z1: -19.0, z2: -9.6 }, // Trade Mart (-24, -14)
        { x1: 18.8, x2: 29.2, z1: -19.0, z2: -9.6 },   // Cat's Tail Taverna (24, -14)
        { x1: -6.5, x2: 6.5, z1: -37.8, z2: -26.2 },  // Dilek Tapınağı (0, -32)
        { x1: -29.2, x2: -18.8, z1: 9.4, z2: 18.8 },   // Maceracılar Loncası (-24, 14)
        { x1: 20.0, x2: 28.0, z1: 10.0, z2: 18.0 }     // Gazebo (24, 14)
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
    }

    // Lerp Mesh Position & Rotation
    myMesh.position.x = myPlayer.x;
    myMesh.position.z = myPlayer.z;
    myMesh.rotation.y = myPlayer.rot;

    // Camera follow lerp
    const targetCamX = myPlayer.x;
    const targetCamZ = myPlayer.z + CONFIG.cameraDistance;
    camera.position.x += (targetCamX - camera.position.x) * CONFIG.posLerp;
    camera.position.z += (targetCamZ - camera.position.z) * CONFIG.posLerp;
    camera.position.y = CONFIG.cameraHeight;
    camera.lookAt(myPlayer.x, 1.5, myPlayer.z);

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
        { id: 'door_battle', name: '🌀 Kadim Zindan Portalı', pos: { x: 0, z: 32.0 } }
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
      // Check Exit Portal Gate back to Town at (0, -32)
      const dist = Math.hypot(myPlayer.x - 0, myPlayer.z - (-32.0));
      if (dist < 4.2) {
        nearbyInteractable = { type: 'door', data: { name: 'Kasaba Meydanı' } };
        promptText.textContent = `[E] Kasabaya Geri Dön`;
        prompt.classList.remove('hidden');
        return;
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
        "Sadık kedi madenci ve balıkçı dostlarımız uzak seferlerden eşsiz ganimetlerle dönüyor!"
      ],
      choices: [
        { text: '🗺️ Kedi Seferlerini Aç (/expeditions)', action: 'open_expeditions' },
        { text: '📜 Günlük Lonca Emirleri', action: 'guild_bounty' },
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
      addChatMessage('Katheryne', '📜 "Bugünkü lonca emri: Kasaba sakinleriyle tanış ve 1 kez eşya takası yap!"');
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

  function triggerDoorWipe(targetMap) {
    const wipe = document.getElementById('screen-wipe');
    wipe.classList.add('active');

    setTimeout(() => {
      currentMap = targetMap;
      if (targetMap === 'town') {
        buildTownMap();
        myPlayer.x = 0;
        myPlayer.z = 26;
        document.getElementById('combat-hud')?.classList.add('hidden');
        detachCombatWeapon();
      } else if (isBattleZone(targetMap)) {
        buildBattleZoneMap(targetMap);
        myPlayer.x = 0;
        myPlayer.z = -28;
      } else {
        buildInteriorMap(targetMap);
        myPlayer.x = 0;
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
    fishingState = 'caught';

    const caughtFish = minigameFish;
    currentHookedFish = caughtFish;

    const mg = document.getElementById('fishing-minigame');
    if (mg) mg.classList.add('hidden');

    playVictoryJingle();
    showFishCatchModal(caughtFish);

    // Award Primogems
    myPlayer.primogems += caughtFish.primo;
    updateUIProfile();

    // Broadcast and sync with server
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'WORLD_FISH_CATCH',
        fish: caughtFish
      }));
    }

    if (myMesh) {
      showSpeechBubble(myMesh, `🎣 ${caughtFish.emoji} ${caughtFish.name}! (+${caughtFish.primo}💎)`);
    }
    addChatMessage(myPlayer.username, `🎣 Nehir mücadelesini kazandım! ${caughtFish.emoji} ${caughtFish.name} tuttum (+${caughtFish.primo} Primogem)`);

    stopFishing();
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
    if (!modal) return;

    document.getElementById('fish-catch-icon').textContent = fish.emoji || '🐟';
    document.getElementById('fish-catch-stars').textContent = fish.stars || '★★★☆☆';
    document.getElementById('fish-catch-name').textContent = fish.name;
    document.getElementById('fish-catch-rarity').textContent = fish.rarity;
    document.getElementById('fish-catch-primo').textContent = `+${fish.primo} 💎 Primogem`;
    document.getElementById('fish-catch-desc').textContent = fish.desc;

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

      // Crossroads Paths
      ctx.fillStyle = '#475569';
      // Path X
      const pathXLeft = cx + (0 - myPlayer.x) * scale - 4 * scale;
      ctx.fillRect(pathXLeft, 0, 8 * scale, h);
      // Path Z
      const pathZTop = cy + (0 - myPlayer.z) * scale - 4 * scale;
      ctx.fillRect(0, pathZTop, w, 8 * scale);

      // Secondary Branches
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale, cy + (-10 - myPlayer.z) * scale - 3 * scale, 18 * scale, 6 * scale);
      ctx.fillRect(cx + (6 - myPlayer.x) * scale, cy + (-10 - myPlayer.z) * scale - 3 * scale, 18 * scale, 6 * scale);
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale, cy + (10 - myPlayer.z) * scale - 3 * scale, 18 * scale, 6 * scale);
      ctx.fillRect(cx + (6 - myPlayer.x) * scale, cy + (10 - myPlayer.z) * scale - 3 * scale, 18 * scale, 6 * scale);

      // Stone Bridge
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(pathXLeft - 0.5 * scale, riverY - 4.2 * scale, 9 * scale, 8.4 * scale);

      // Central Fountain
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - myPlayer.x * scale, cy - myPlayer.z * scale, 4.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Buildings
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale - 6, cy + (-14 - myPlayer.z) * scale - 6, 12, 12); // Trade Mart
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(cx + (24 - myPlayer.x) * scale - 6, cy + (-14 - myPlayer.z) * scale - 6, 12, 12); // Tavern
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(cx + (0 - myPlayer.x) * scale - 7, cy + (-32 - myPlayer.z) * scale - 7, 14, 14); // Shrine
      ctx.fillStyle = '#166534';
      ctx.fillRect(cx + (-24 - myPlayer.x) * scale - 6, cy + (14 - myPlayer.z) * scale - 6, 12, 12); // Guild
      ctx.fillStyle = '#059669';
      ctx.fillRect(cx + (24 - myPlayer.x) * scale - 5, cy + (14 - myPlayer.z) * scale - 5, 10, 10); // Gazebo
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
    grid.innerHTML = '';

    AVATAR_PRESETS.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.className = `avatar-choice-btn ${myPlayer.avatarIndex === idx ? 'selected' : ''}`;
      const avCanvas = document.createElement('canvas');
      avCanvas.width = 48;
      avCanvas.height = 48;
      avCanvas.className = 'avatar-choice-canvas';
      drawAvatarPreviewPortrait(avCanvas, p);

      btn.appendChild(avCanvas);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'avatar-choice-name';
      nameSpan.textContent = p.name;
      btn.appendChild(nameSpan);

      btn.onclick = () => {
        myPlayer.avatarIndex = idx;
        updateMyMesh();
        updateUIProfile();
        closeModal('modal-avatar');
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

  function attachCombatWeapon() {
    if (combatWeaponMesh || !myMesh) return;
    const swordGroup = new THREE.Group();
    swordGroup.name = 'combatSword';

    // Blade
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      metalness: 0.85,
      roughness: 0.2
    });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 0.05), bladeMat);
    blade.position.y = 0.65;
    blade.castShadow = true;
    swordGroup.add(blade);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), bladeMat);
    tip.position.y = 1.35;
    tip.rotation.y = Math.PI / 4;
    swordGroup.add(tip);

    // Crossguard
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.3 });
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.12), goldMat);
    guard.position.y = 0.03;
    swordGroup.add(guard);

    // Handle
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6), new THREE.MeshLambertMaterial({ color: 0x78350f }));
    hilt.position.y = -0.16;
    swordGroup.add(hilt);

    // Pommel
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), goldMat);
    pommel.position.y = -0.34;
    swordGroup.add(pommel);

    // Position at right hand area
    swordGroup.position.set(0.65, 0.7, 0.25);
    swordGroup.rotation.set(-0.35, 0, -0.45);

    myMesh.add(swordGroup);
    combatWeaponMesh = swordGroup;
  }

  function detachCombatWeapon() {
    if (combatWeaponMesh && myMesh) {
      myMesh.remove(combatWeaponMesh);
      combatWeaponMesh = null;
    }
  }

  // --- 3D Mob Meshes ---
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

    // Translucent Jelly Dome
    const bodyGeo = new THREE.SphereGeometry(0.75, 14, 12);
    bodyGeo.scale(1.15, 0.85, 1.15);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: mainColor,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    // Inner Glowing Core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({ color: coreColor })
    );
    core.position.y = 0.65;
    group.add(core);

    // Cute Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const eyeHighlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.22, 0.22].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      eye.position.set(ex, 0.72, 0.72);
      group.add(eye);

      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), eyeHighlight);
      hl.position.set(ex + 0.02, 0.75, 0.79);
      group.add(hl);
    });

    if (isPyro) {
      // Little flame horns on top
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.45, 6),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      flame.position.set(0, 1.35, 0);
      group.add(flame);
    } else if (isElectro) {
      // Spark antenna
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18),
        new THREE.MeshBasicMaterial({ color: 0xf0abfc })
      );
      spark.position.set(0, 1.38, 0);
      group.add(spark);
    }

    return group;
  }

  function createHilichurlMesh(type = 'hilichurl') {
    const group = new THREE.Group();
    const isElite = type === 'mitachurl_axe';
    const isSentinel = type === 'abyss_sentinel';
    const isWarrior = type === 'hilichurl_warrior';
    const isRecruit = type === 'hilichurl_recruit';

    const furMat = new THREE.MeshLambertMaterial({
      color: isSentinel ? 0x0f172a : (isElite ? 0x450a0a : (isWarrior ? 0x1e293b : (isRecruit ? 0x475569 : 0x334155)))
    });
    const maskMat = new THREE.MeshLambertMaterial({
      color: isSentinel ? 0x1e1b4b : (isElite ? 0x991b1b : (isWarrior ? 0xe2e8f0 : 0xf8fafc))
    });
    const hornMat = new THREE.MeshLambertMaterial({
      color: isSentinel ? 0x6366f1 : (isElite ? 0x18181b : 0x1e293b)
    });
    const redMat = new THREE.MeshBasicMaterial({
      color: isSentinel ? 0xc084fc : (isElite ? 0xf97316 : 0xef4444)
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.6), furMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), furMat);
    head.position.y = 1.7;
    head.castShadow = true;
    group.add(head);

    // Tribal Mask
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.65, 0.12), maskMat);
    mask.position.set(0, 1.7, 0.36);
    group.add(mask);

    // Red markings on mask
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), redMat);
    mark.position.set(0, 1.82, 0.43);
    group.add(mark);

    // Curved Horns
    [-0.35, 0.35].forEach((hx, idx) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(isElite ? 0.15 : 0.1, isElite ? 0.7 : 0.45, 5), hornMat);
      horn.position.set(hx, isElite ? 2.3 : 2.15, 0.1);
      horn.rotation.z = idx === 0 ? 0.35 : -0.35;
      group.add(horn);
    });

    // Arms
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.28), furMat);
    lArm.position.set(-0.62, 0.95, 0);
    group.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.28), furMat);
    rArm.position.set(0.62, 0.95, 0.15);
    rArm.rotation.x = -0.4;
    group.add(rArm);

    // Weapons
    if (isElite) {
      // Massive Mitachurl Double Battleaxe
      const axeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.3, 6), new THREE.MeshLambertMaterial({ color: 0x27272a }));
      axeHandle.position.set(0.78, 1.25, 0.45);
      axeHandle.rotation.x = 0.45;
      group.add(axeHandle);

      [-0.28, 0.28].forEach(bx => {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.75, 0.06), new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.8 }));
        blade.position.set(0.78 + bx, 2.05, 0.85);
        blade.castShadow = true;
        group.add(blade);
      });
    } else if (isSentinel) {
      // Abyssal Runic Spear
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), new THREE.MeshLambertMaterial({ color: 0x1e1b4b }));
      spear.position.set(0.72, 1.3, 0.45);
      spear.rotation.x = 0.35;
      group.add(spear);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 4), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
      tip.position.set(0.72, 2.5, 0.85);
      group.add(tip);
    } else {
      // Spiked Wooden Club in Right Hand
      const clubWoodMat = new THREE.MeshLambertMaterial({ color: 0x78350f });
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 1.3, 6), clubWoodMat);
      club.position.set(0.72, 1.1, 0.45);
      club.rotation.x = 0.5;
      club.castShadow = true;
      group.add(club);

      // Metal studs on club
      const studMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
      for (let s = 0; s < 4; s++) {
        const stud = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 4), studMat);
        stud.position.set(0.72, 1.25 + s * 0.12, 0.55);
        stud.rotation.x = Math.PI / 2;
        group.add(stud);
      }
    }

    // Legs
    [-0.24, 0.24].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), furMat);
      leg.position.set(lx, 0.28, 0);
      group.add(leg);
    });

    if (isElite) group.scale.set(1.42, 1.42, 1.42);
    else if (isSentinel) group.scale.set(1.22, 1.22, 1.22);
    else if (isRecruit) group.scale.set(0.88, 0.88, 0.88);

    return group;
  }

  function createPyromancerMesh(type = 'pyromancer') {
    const group = new THREE.Group();
    const isAbyssMage = type === 'abyss_mage';
    const robeMat = new THREE.MeshLambertMaterial({ color: isAbyssMage ? 0x1e1b4b : 0x881337 });
    const goldMat = new THREE.MeshStandardMaterial({ color: isAbyssMage ? 0x818cf8 : 0xf59e0b, metalness: 0.8, roughness: 0.3 });
    const fireMat = new THREE.MeshBasicMaterial({ color: isAbyssMage ? 0x9333ea : 0xf97316 });

    // Floating Robe Body
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 1.4, 8), robeMat);
    robe.position.y = 1.1;
    robe.castShadow = true;
    group.add(robe);

    // Gold hem trim
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 12), goldMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.42;
    group.add(trim);

    // Deep Hood
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), robeMat);
    hood.position.y = 1.9;
    group.add(hood);

    // Glowing Eyes in shadowy hood
    const eyeMat = new THREE.MeshBasicMaterial({ color: isAbyssMage ? 0xc084fc : 0xfacc15 });
    [-0.15, 0.15].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), eyeMat);
      eye.position.set(ex, 1.9, 0.45);
      group.add(eye);
    });

    // Floating Staff
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    staff.position.set(0.7, 1.3, 0.2);
    group.add(staff);

    // Fiery / Void Crystal on top of staff
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), fireMat);
    crystal.position.set(0.7, 2.25, 0.2);
    group.add(crystal);

    const cLight = new THREE.PointLight(isAbyssMage ? 0x9333ea : 0xf97316, 0.9, 8, 2);
    cLight.position.set(0.7, 2.25, 0.2);
    group.add(cLight);

    if (isAbyssMage) group.scale.set(1.15, 1.15, 1.15);

    return group;
  }

  function createRuinGolemMesh() {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, metalness: 0.3 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4, metalness: 0.8 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    // Mini-Boss Scale
    group.scale.set(1.9, 1.9, 1.9);

    // Main Torso (Heavy Stone Block)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2), stoneMat);
    torso.position.y = 1.6;
    torso.castShadow = true;
    group.add(torso);

    // Brass armor plates
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.15), brassMat);
    chestPlate.position.set(0, 1.7, 0.62);
    group.add(chestPlate);

    // Glowing Cyclops Eye Core
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), eyeMat);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(0, 1.7, 0.68);
    group.add(eye);

    const eyeLight = new THREE.PointLight(0xf59e0b, 1.5, 9, 2);
    eyeLight.position.set(0, 1.7, 0.8);
    group.add(eyeLight);

    // Massive Stone Shoulders
    [-1.05, 1.05].forEach(sx => {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), brassMat);
      shoulder.position.set(sx, 2.1, 0);
      group.add(shoulder);

      // Heavy Forearms & Fists
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.3, 0.55), stoneMat);
      arm.position.set(sx, 1.2, 0.15);
      arm.castShadow = true;
      group.add(arm);
    });

    // Heavy Pillar Legs
    [-0.5, 0.5].forEach(lx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.7), stoneMat);
      leg.position.set(lx, 0.45, 0);
      group.add(leg);
    });

    return group;
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

  // Pre-allocated geometries and materials for slash arcs (Zero GC stutter!)
  const SLASH_GEOS = {
    1: new THREE.RingGeometry(1.2, 2.8, 14, 1, -Math.PI * 0.38, Math.PI * 0.76),
    2: new THREE.RingGeometry(1.2, 2.8, 14, 1, -Math.PI * 0.38, Math.PI * 0.76),
    3: new THREE.RingGeometry(1.5, 4.2, 20, 1, -Math.PI * 0.92, Math.PI * 1.84)
  };
  const SLASH_MATS = {
    1: new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    2: new THREE.MeshBasicMaterial({ color: 0x67e8f9, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    3: new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  };

  function createSlashArcMesh(px, pz, rot, step, customColor = null) {
    // Keep max 2 active trails at once
    while (activeSlashTrails.length >= 2) {
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
    arcMesh.position.set(px, 0.95, pz);
    arcMesh.rotation.z = -rot + Math.PI / 2;

    worldObjects.add(arcMesh);
    activeSlashTrails.push({
      mesh: arcMesh,
      mat: mat,
      birthTime: performance.now(),
      life: 130
    });
  }

  function createAfterimageGhost(x, z, rot) {
    const geo = new THREE.BoxGeometry(0.8, 1.4, 0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55
    });
    const ghost = new THREE.Mesh(geo, mat);
    ghost.position.set(x, 0.8, z);
    ghost.rotation.y = rot;
    worldObjects.add(ghost);

    const fadeStart = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - fadeStart;
      if (elapsed > 200) {
        clearInterval(interval);
        worldObjects.remove(ghost);
      } else {
        mat.opacity = 0.55 * (1 - elapsed / 200);
      }
    }, 25);
  }

  function createVortexMesh(x, y, z) {
    if (vortexMesh) worldObjects.remove(vortexMesh);

    const vGroup = new THREE.Group();
    vGroup.position.set(x, 0.1, z);

    // Concentric swirling emerald rings
    for (let r = 0; r < 3; r++) {
      const ringGeo = new THREE.RingGeometry(1.2 + r * 1.5, 1.6 + r * 1.5, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.65 - r * 0.15,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1 + r * 0.3;
      vGroup.add(ring);
    }

    const vLight = new THREE.PointLight(0x10b981, 1.2, 10, 2);
    vLight.position.y = 1.0;
    vGroup.add(vLight);

    worldObjects.add(vGroup);
    vortexMesh = vGroup;
  }

  function createMeteorImpact(x, z) {
    // Expanding Golden Shockwave Ring
    const ringGeo = new THREE.RingGeometry(0.5, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const shockwave = new THREE.Mesh(ringGeo, ringMat);
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.set(x, 0.08, z);
    worldObjects.add(shockwave);

    const startTime = performance.now();
    const anim = () => {
      const elapsed = performance.now() - startTime;
      if (elapsed > 450) {
        worldObjects.remove(shockwave);
      } else {
        const p = elapsed / 450;
        const scale = 1.0 + p * 10.0;
        shockwave.scale.set(scale, scale, 1);
        ringMat.opacity = 0.95 * (1 - p);
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

    barGroup.position.y = mob.height + 0.35;
    mob.mesh.add(barGroup);
    mob.hpBarGroup = barGroup;
    mob.hpFillMesh = fill;
    mob.hpFillBaseWidth = width * 0.95;
  }

  // Mob Templates
  const MOB_TEMPLATES = {
    // Zone 1: Zümrüt Çayırları (Slime Vadisi) [GS 100]
    slime_green: { name: 'Zümrüt Balçık', hp: 70, speed: 2.2, dmg: 7, height: 1.1, aggroRange: 16, attackRange: 1.4 },
    slime_electro: { name: 'Yıldırım Balçığı', hp: 90, speed: 2.5, dmg: 10, height: 1.2, aggroRange: 16, attackRange: 1.4 },
    hilichurl_recruit: { name: 'Çırak Hilichurl', hp: 120, speed: 2.6, dmg: 12, height: 1.7, aggroRange: 18, attackRange: 1.9 },

    // Zone 2: Kızıl Hilichurl Harabeleri [GS 350]
    slime_pyro: { name: 'Ateş Balçığı', hp: 140, speed: 2.6, dmg: 18, height: 1.2, aggroRange: 16, attackRange: 1.4 },
    hilichurl_warrior: { name: 'Zırhlı Hilichurl Savaşçısı', hp: 260, speed: 2.7, dmg: 24, height: 1.9, aggroRange: 18, attackRange: 2.0 },
    pyromancer: { name: 'Kızıl Pyro Büyücüsü', hp: 210, speed: 1.9, dmg: 28, height: 2.0, aggroRange: 22, attackRange: 7.5, isRanged: true },
    mitachurl_axe: { name: 'Alev Baltalı Mitachurl (ELİT)', hp: 750, speed: 2.2, dmg: 44, height: 2.6, aggroRange: 22, attackRange: 2.6, isElite: true },

    // Zone 3: Kadim Uçurum Arenası [GS 750]
    abyss_sentinel: { name: 'Uçurum Muhafızı', hp: 550, speed: 2.8, dmg: 55, height: 2.2, aggroRange: 22, attackRange: 2.2 },
    abyss_mage: { name: 'Kadim Hiçlik Büyücüsü', hp: 480, speed: 2.0, dmg: 62, height: 2.1, aggroRange: 24, attackRange: 8.5, isRanged: true },
    ruin_golem: { name: 'Antik Yıkım Muhafızı (DÜNYA BOSSU)', hp: 2800, speed: 1.4, dmg: 85, height: 3.4, aggroRange: 28, attackRange: 3.4, isBoss: true }
  };

  function spawnCombatMob(type, x, z) {
    const cfg = MOB_TEMPLATES[type] || MOB_TEMPLATES.slime_green;
    let mesh;
    if (type.startsWith('slime_')) {
      mesh = createSlimeMesh(type);
    } else if (type === 'pyromancer' || type === 'abyss_mage') {
      mesh = createPyromancerMesh(type);
    } else if (type === 'ruin_golem') {
      mesh = createRuinGolemMesh();
    } else {
      mesh = createHilichurlMesh(type);
    }

    mesh.position.set(x, 0, z);
    worldObjects.add(mesh);

    const mob = {
      id: 'mob_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: type,
      name: cfg.name,
      hp: cfg.hp,
      maxHP: cfg.hp,
      speed: cfg.speed,
      dmg: cfg.dmg,
      dropPrimo: cfg.dropPrimo,
      height: cfg.height,
      aggroRange: cfg.aggroRange,
      attackRange: cfg.attackRange,
      isRanged: !!cfg.isRanged,
      isElite: !!cfg.isElite,
      isBoss: !!cfg.isBoss,
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
    myCompanionMesh.position.set(myPlayer.x, (myMesh ? myMesh.position.y : 0) + 1.85, myPlayer.z);
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
    const shoulderDist = 1.35;
    const bobOffset = Math.sin(now * 0.0035) * 0.14;
    const targetX = myPlayer.x + Math.sin(shoulderAngle) * shoulderDist;
    const targetZ = myPlayer.z + Math.cos(shoulderAngle) * shoulderDist;
    const targetY = (myMesh ? myMesh.position.y : 0) + 1.85 + bobOffset;

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

  function performMusouSlash(p) {
    // Colossal Dimensional Rift Cut across forward vector
    const bladeGroup = new THREE.Group();
    const fwdX = Math.sin(p.rot);
    const fwdZ = Math.cos(p.rot);
    const cx = p.x + fwdX * 5.5;
    const cz = p.z + fwdZ * 5.5;
    bladeGroup.position.set(cx, 1.2, cz);
    bladeGroup.rotation.y = p.rot;

    // Giant Tachi Slash Beam
    const bladeGeo = new THREE.BoxGeometry(0.2, 0.4, 13.0);
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xf5d0fe });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    bladeGroup.add(blade);

    // Outer Void Purple Aura
    const auraGeo = new THREE.BoxGeometry(0.6, 0.9, 13.5);
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.85 });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    bladeGroup.add(aura);

    const bLight = new THREE.PointLight(0xa855f7, 3.5, 18, 2);
    bladeGroup.add(bLight);
    worldObjects.add(bladeGroup);

    // Hit detection for 420 AoE Electro DMG in forward cone
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const mdx = mob.x - p.x;
      const mdz = mob.z - p.z;
      const dist = Math.hypot(mdx, mdz);
      if (dist <= 13.0) {
        const angle = Math.atan2(mdx, mdz);
        let diff = Math.abs(angle - p.rot);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
        if (diff < 1.2) {
          const dmg = 420 + Math.floor(Math.random() * 80);
          mob.hp = Math.max(0, mob.hp - dmg);
          if (mob.hpFillMesh) {
            mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
          }
          mob.flashTimer = 0.3;
          mob.knockbackVx = fwdX * 9.5;
          mob.knockbackVz = fwdZ * 9.5;
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `⚡ MUSOU TACHI! ${dmg}`, 'crit');
          createElectroSlashVFX(mob.x, mob.y + 1.0, mob.z);
          if (mob.hp <= 0) defeatMob(mob);
        }
      }
    }

    const birth = performance.now();
    const anim = () => {
      const el = performance.now() - birth;
      if (el > 420) {
        worldObjects.remove(bladeGroup);
      } else {
        const pProg = el / 420;
        bladeGroup.scale.x = 1.0 + pProg * 6.0;
        auraMat.opacity = 0.85 * (1 - pProg);
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  function spawnGeoStele(p) {
    if (activeGeoSteleMesh) {
      worldObjects.remove(activeGeoSteleMesh);
      activeGeoSteleMesh = null;
    }

    const sx = p.x + Math.sin(p.rot) * 2.5;
    const sz = p.z + Math.cos(p.rot) * 2.5;
    const steleGroup = new THREE.Group();
    steleGroup.position.set(sx, 0, sz);

    // Towering Geo Pillar with Runes
    const colMat = new THREE.MeshStandardMaterial({ color: 0x3d271d, roughness: 0.5, metalness: 0.6 });
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.4, 0.9), colMat);
    col.position.y = 2.2;
    steleGroup.add(col);

    // Glowing Amber Geo Diamond Crest atop
    const crest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    crest.position.y = 4.8;
    steleGroup.add(crest);

    const sLight = new THREE.PointLight(0xf59e0b, 1.8, 12, 2);
    sLight.position.y = 4.5;
    steleGroup.add(sLight);

    worldObjects.add(steleGroup);
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

    const shieldGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.35,
      wireframe: true
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 1.0;
    if (myMesh) myMesh.add(shield);
    activeJadeShieldMesh = shield;
  }

  function performPlanetBefall(p) {
    const targetX = p.x + Math.sin(p.rot) * 4.0;
    const targetZ = p.z + Math.cos(p.rot) * 4.0;

    // Giant Flaming Geo Star / Meteor plunging from sky
    const meteorGroup = new THREE.Group();
    meteorGroup.position.set(targetX, 28, targetZ);

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x27170e, roughness: 0.6 });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), rockMat);
    meteorGroup.add(rock);

    const glowCore = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.35, 1),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true })
    );
    meteorGroup.add(glowCore);

    const mLight = new THREE.PointLight(0xfacc15, 3.5, 25, 2);
    meteorGroup.add(mLight);
    worldObjects.add(meteorGroup);

    const startY = 28;
    const endY = 0.5;
    const startTime = performance.now();
    const duration = 440;

    const anim = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      meteorGroup.position.y = startY - (startY - endY) * (progress * progress);
      meteorGroup.rotation.x += 0.08;
      meteorGroup.rotation.y += 0.08;

      if (progress < 1.0) {
        requestAnimationFrame(anim);
      } else {
        // IMPACT!
        worldObjects.remove(meteorGroup);
        createMeteorImpact(targetX, targetZ);
        playMeteorImpactSound();
        screenShakeTimer = 0.85;
        screenShakeMagnitude = 0.95;

        // AoE Damage & 3.5s Petrification (Stone Freeze)
        for (let i = 0; i < activeCombatMobs.length; i++) {
          const mob = activeCombatMobs[i];
          if (mob.isDead) continue;
          const dist = Math.hypot(mob.x - targetX, mob.z - targetZ);
          if (dist <= 13.5) {
            const dmg = 480 + Math.floor(Math.random() * 90);
            mob.hp = Math.max(0, mob.hp - dmg);
            if (mob.hpFillMesh) {
              mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
            }
            mob.flashTimer = 0.4;
            // Petrify!
            mob.isPetrified = true;
            mob.petrifyUntil = performance.now() + 3500;
            showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🪨 TAŞLAŞTI! ${dmg}`, 'crit');
            if (mob.hp <= 0) defeatMob(mob);
          }
        }
      }
    };
    requestAnimationFrame(anim);
  }

  function spawnHuTaoButterflies(p) {
    // 8 fluttering crimson butterflies bursting outwards
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bf = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.35, 6),
        new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
      );
      bf.position.set(p.x, 1.2, p.z);
      worldObjects.add(bf);

      const bStart = performance.now();
      const bAnim = () => {
        const el = performance.now() - bStart;
        if (el > 450) {
          worldObjects.remove(bf);
        } else {
          const dist = (el / 450) * 4.2;
          bf.position.set(p.x + Math.cos(angle) * dist, 1.2 + Math.sin(el * 0.02) * 0.4, p.z + Math.sin(angle) * dist);
          bf.rotation.y += 0.2;
          requestAnimationFrame(bAnim);
        }
      };
      requestAnimationFrame(bAnim);
    }
  }

  function performSpiritSoother(p) {
    // Giant blazing fiery ghost swoops in 360 circle
    const ghostGroup = new THREE.Group();
    const gBody = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9 })
    );
    ghostGroup.add(gBody);

    const gEyes = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.35, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x18181b })
    );
    gEyes.position.set(-0.35, 0.2, 1.15);
    ghostGroup.add(gEyes);
    const gEyes2 = gEyes.clone();
    gEyes2.position.set(0.35, 0.2, 1.15);
    ghostGroup.add(gEyes2);

    const gLight = new THREE.PointLight(0xef4444, 3.0, 16, 2);
    ghostGroup.add(gLight);
    worldObjects.add(ghostGroup);

    const healAmount = 260;
    playerHP = Math.min(playerMaxHP, playerHP + healAmount);
    updateCombatHUD();
    showDamageNumber({ x: p.x, y: 2.3, z: p.z }, `💚 +${healAmount} HP (Şifa!)`, 'heal');

    const gStart = performance.now();
    const radius = 5.5;
    const hitMobsSet = new Set();

    const anim = () => {
      const el = performance.now() - gStart;
      const progress = el / 500;
      if (progress >= 1.0) {
        worldObjects.remove(ghostGroup);
      } else {
        const curAngle = p.rot + progress * Math.PI * 2;
        const gx = p.x + Math.sin(curAngle) * radius;
        const gz = p.z + Math.cos(curAngle) * radius;
        ghostGroup.position.set(gx, 1.4, gz);
        ghostGroup.rotation.y = curAngle + Math.PI / 2;

        // Hit check
        for (let i = 0; i < activeCombatMobs.length; i++) {
          const mob = activeCombatMobs[i];
          if (mob.isDead || hitMobsSet.has(mob.id)) continue;
          const dist = Math.hypot(mob.x - gx, mob.z - gz);
          if (dist <= 3.2) {
            hitMobsSet.add(mob.id);
            const dmg = 420 + Math.floor(Math.random() * 70);
            mob.hp = Math.max(0, mob.hp - dmg);
            if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
            mob.flashTimer = 0.3;
            showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🔥 SPIRIT! ${dmg}`, 'crit');
            if (mob.hp <= 0) defeatMob(mob);
          }
        }
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  function spawnFurinaMinions(p) {
    // Clear old minions
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

  function performFurinaFanfare(p) {
    // Ocean stage fanfare circles
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.0 + i * 2.5, 2.5 + i * 2.5, 32),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.12 + i * 0.05, p.z);
      worldObjects.add(ring);

      const rStart = performance.now();
      const rAnim = () => {
        const el = performance.now() - rStart;
        if (el > 600) {
          worldObjects.remove(ring);
        } else {
          const prog = el / 600;
          ring.scale.set(1 + prog * 1.8, 1 + prog * 1.8, 1);
          ring.material.opacity = 0.8 * (1 - prog);
          requestAnimationFrame(rAnim);
        }
      };
      requestAnimationFrame(rAnim);
    }
    showDamageNumber({ x: p.x, y: 2.2, z: p.z }, '🎭 FANFARE! +%35 Hasar & +%25 Hız', 'heal');
  }

  function performKazuhaChihayaburu(p) {
    isKazuhaLeaping = true;
    kazuhaLeapTimer = performance.now();

    // Whirlwind sucking ring at base
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 6.0, 24),
      new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.15, p.z);
    worldObjects.add(ring);

    // Pull nearby mobs to player center
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const mdx = p.x - mob.x;
      const mdz = p.z - mob.z;
      const dist = Math.hypot(mdx, mdz);
      if (dist <= 10.5 && dist > 0.5) {
        mob.knockbackVx = (mdx / dist) * 7.5;
        mob.knockbackVz = (mdz / dist) * 7.5;
      }
    }

    // Player jump upwards
    if (myMesh) myMesh.position.y += 3.8;

    setTimeout(() => {
      // Plunge attack down!
      if (myMesh) myMesh.position.y = 0;
      isKazuhaLeaping = false;
      worldObjects.remove(ring);
      createMeteorImpact(p.x, p.z);
      playPunchyHitSound(true);

      for (let i = 0; i < activeCombatMobs.length; i++) {
        const mob = activeCombatMobs[i];
        if (mob.isDead) continue;
        const dist = Math.hypot(mob.x - p.x, mob.z - p.z);
        if (dist <= 7.0) {
          const dmg = 260 + Math.floor(Math.random() * 50);
          mob.hp = Math.max(0, mob.hp - dmg);
          if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
          mob.flashTimer = 0.25;
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🍃 MIDARE RANZAN! ${dmg}`, 'crit');
          if (mob.hp <= 0) defeatMob(mob);
        }
      }
    }, 320);
  }

  function performKazuhaAutumnStorm(p) {
    if (activeKazuhaStormMesh) {
      worldObjects.remove(activeKazuhaStormMesh);
      activeKazuhaStormMesh = null;
    }

    const stormGroup = new THREE.Group();
    stormGroup.position.set(p.x, 0.15, p.z);

    // 14m Autumn Maple Leaf Wind Circle
    const field = new THREE.Mesh(
      new THREE.CircleGeometry(7.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
    );
    field.rotation.x = -Math.PI / 2;
    stormGroup.add(field);

    // Autumn Maple Leaf planes
    const leafMat = new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide });
    for (let l = 0; l < 16; l++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), leafMat);
      const lAngle = (l / 16) * Math.PI * 2;
      const lDist = 2.0 + Math.random() * 4.5;
      leaf.position.set(Math.cos(lAngle) * lDist, 0.6 + Math.random() * 1.5, Math.sin(lAngle) * lDist);
      leaf.rotation.x = Math.random() * Math.PI;
      leaf.rotation.y = Math.random() * Math.PI;
      stormGroup.add(leaf);
    }

    worldObjects.add(stormGroup);
    activeKazuhaStormMesh = stormGroup;
    kazuhaStormEndTime = performance.now() + 10000;
    kazuhaStormTickTimer = 0;
  }

  function triggerUniversalElementalSkill(p, elem) {
    triggerElementalFlash(`flash-${elem.toLowerCase()}`);
    playPunchyHitSound(true);
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const dist = Math.hypot(mob.x - p.x, mob.z - p.z);
      if (dist <= 6.5) {
        const dmg = 180 + Math.floor(Math.random() * 40);
        mob.hp = Math.max(0, mob.hp - dmg);
        if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
        showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `✨ ${elem} Blast! ${dmg}`, 'normal');
        if (mob.hp <= 0) defeatMob(mob);
      }
    }
  }

  function triggerUniversalElementalBurst(p, elem) {
    triggerElementalFlash(`flash-${elem.toLowerCase()}`);
    playBurstExplosion();
    screenShakeTimer = 0.55;
    screenShakeMagnitude = 0.65;
    createMeteorImpact(p.x, p.z);
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const dist = Math.hypot(mob.x - p.x, mob.z - p.z);
      if (dist <= 12.0) {
        const dmg = 390 + Math.floor(Math.random() * 80);
        mob.hp = Math.max(0, mob.hp - dmg);
        if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
        showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🌟 ${elem} SUPERNOVA! ${dmg}`, 'crit');
        if (mob.hp <= 0) defeatMob(mob);
      }
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
      eDesc: 'Tepede Şimşek Gözü açar; 15sn boyunca her vuruşta koordineli Electro kesik patlatır (+45 DMG).',
      eCooldown: 10000,
      qName: 'Secret Art: Musou Shinsetsu',
      qDesc: 'Ekran solar, boyutsal uzay yarığı açılarak ileriye devasa mor şimşek tachi kesiği fırlar (420 AoE DMG)!',
      qCooldown: 18000,
      onE: (p) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(false);
        screenShakeTimer = 0.25;
        screenShakeMagnitude = 0.35;
        spawnElectroEye(p);
        addChatMessage('⚡ Yoldaş', 'Raiden Shogun: "Tepeden inen şimşek karanlığı dağıtacak!" (Şimşek Gözü Aktif)');
      },
      onQ: (p) => {
        triggerElementalFlash('flash-electro');
        playThunderSound(true);
        screenShakeTimer = 0.75;
        screenShakeMagnitude = 0.85;
        performMusouSlash(p);
        addChatMessage('⚡ Musou Shinsetsu', 'Raiden Shogun: "Torn to oblivion! (Hiçliğe gömülün!)"');
      }
    },
    'Zhongli': {
      element: 'Geo',
      elementEmoji: '🪨',
      color: 0xeab308,
      slashColors: [0xeab308, 0xfacc15, 0xfef08a],
      eName: 'Dominus Lapidis',
      eDesc: 'Yere dikilen Geo Taş Sütun rezonans hasarı saçar (1.5sn 45 DMG), oyuncuya 450 HP Yeşim Kalkan verir.',
      eCooldown: 12000,
      qName: 'Planet Befall',
      qDesc: 'Gökten alevli altın Geo Meteor düşer; 480 AoE DMG verir ve canavarları 3.5sn taşlaştırıp dondurur!',
      qCooldown: 20000,
      onE: (p) => {
        triggerElementalFlash('flash-geo');
        playBeep(320, 'triangle', 0.25);
        screenShakeTimer = 0.3;
        screenShakeMagnitude = 0.4;
        spawnGeoStele(p);
        applyJadeShield(450);
        addChatMessage('🪨 Yoldaş', 'Zhongli: "Sağlam bir kalkan huzurun temelidir." (Yeşim Kalkan Kuşanıldı)');
      },
      onQ: (p) => {
        triggerElementalFlash('flash-geo');
        playMeteorImpactSound();
        screenShakeTimer = 0.85;
        screenShakeMagnitude = 0.95;
        performPlanetBefall(p);
        addChatMessage('☄️ Planet Befall', 'Zhongli: "I will have order! (Düzeni sağlayacağım!)"');
      }
    },
    'Hu Tao': {
      element: 'Pyro',
      elementEmoji: '🔥',
      color: 0xef4444,
      slashColors: [0xef4444, 0xf97316, 0xfde047],
      eName: 'Guide to Afterlife',
      eDesc: 'Kızıl kelebekler uçar, silah akkor alev kaplanır; 12sn boyunca +%50 ATK ve yakıcı Yanma DoT sağlar.',
      eCooldown: 12000,
      qName: 'Spirit Soother',
      qDesc: 'Devasa alevli hayalet etrafında 360° döner; 420 AoE Pyro DMG verir ve oyuncuyu +260 HP iyileştirir!',
      qCooldown: 15000,
      onE: (p) => {
        triggerElementalFlash('flash-pyro');
        playFlameBurstSound();
        screenShakeTimer = 0.22;
        screenShakeMagnitude = 0.32;
        spawnHuTaoButterflies(p);
        companionBuffs = { active: true, timer: 12.0, dmgMult: 1.5, speedMult: 1.15, type: 'hu_tao_fire' };
        addChatMessage('🔥 Yoldaş', 'Hu Tao: "Ateş dansı başlasın! Kızıl kelebekler yol göstersin!" (+%50 ATK)');
      },
      onQ: (p) => {
        triggerElementalFlash('flash-pyro');
        playFlameBurstSound();
        screenShakeTimer = 0.65;
        screenShakeMagnitude = 0.75;
        performSpiritSoother(p);
        addChatMessage('👻 Spirit Soother', 'Hu Tao: "Tüm dertler kül olsun! Şifa ve ateş ruhu!" (+260 HP)');
      }
    },
    'Furina': {
      element: 'Hydro',
      elementEmoji: '💧',
      color: 0x38bdf8,
      slashColors: [0x38bdf8, 0x67e8f9, 0xa5f3fc],
      eName: 'Salon Solitaire',
      eDesc: '3 sevimli su minyonu çağırır; 20sn boyunca en yakın canavarlara periyodik su damlaları fırlatır (35 DMG).',
      eCooldown: 14000,
      qName: 'Let the People Rejoice',
      qDesc: 'Işıltılı okyanus sahne ışıkları ve fanfare dalgaları açar; tüm takıma +%35 Hasar ve Hız güçlendirmesi verir!',
      qCooldown: 18000,
      onE: (p) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.2;
        screenShakeMagnitude = 0.25;
        spawnFurinaMinions(p);
        addChatMessage('💧 Yoldaş', 'Furina: "Sahneye gelin minik dostlarım! Gösteri başlasın!" (3 Su Minyonu)');
      },
      onQ: (p) => {
        triggerElementalFlash('flash-hydro');
        playHydroSplashSound();
        screenShakeTimer = 0.6;
        screenShakeMagnitude = 0.65;
        performFurinaFanfare(p);
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
      eDesc: 'Havaya zıplayarak tüm canavarları ve eşyaları merkeze çeken hortum oluşturur, yere inerken rüzgar darbesi (260 DMG).',
      eCooldown: 8000,
      qName: 'Kazuha Slash',
      qDesc: '14m Akçaağaç Fırtına Alanı açar; 10sn boyunca dönen sonbahar yaprakları ve sürekli Anemo hasarı (40 DMG/0.6sn).',
      qCooldown: 15000,
      onE: (p) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.35;
        screenShakeMagnitude = 0.45;
        performKazuhaChihayaburu(p);
        addChatMessage('🍃 Yoldaş', 'Kazuha: "Rüzgar fısıldar, yapraklar yükselir!" (Chihayaburu Çekimi)');
      },
      onQ: (p) => {
        triggerElementalFlash('flash-anemo');
        playAnemoGustSound();
        screenShakeTimer = 0.65;
        screenShakeMagnitude = 0.7;
        performKazuhaAutumnStorm(p);
        addChatMessage('🍁 Kazuha Slash', 'Kazuha: "Bulutlar dağılsın, sonbahar rüzgarı essin!" (14m Rüzgar Alanı)');
      }
    }
  };

  function getCompanionConfig(name) {
    if (!name) return null;
    if (COMPANION_SKILLS[name]) return COMPANION_SKILLS[name];

    // Check by substring match
    for (const key of Object.keys(COMPANION_SKILLS)) {
      if (name.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(name.toLowerCase())) {
        return COMPANION_SKILLS[key];
      }
    }

    // Universal Fallback for any other 5★ character
    const elem = (myCompanionData && myCompanionData.element) || 'Electro';
    return {
      element: elem,
      elementEmoji: elem === 'Pyro' ? '🔥' : (elem === 'Hydro' ? '💧' : (elem === 'Geo' ? '🪨' : (elem === 'Anemo' ? '🍃' : '⚡'))),
      color: 0x38bdf8,
      slashColors: [0x38bdf8, 0x60a5fa, 0x93c5fd],
      eName: `${elem} Surge`,
      eDesc: `Bölgesel ${elem} patlaması yaratır (180 DMG).`,
      eCooldown: 10000,
      qName: `${elem} Supernova`,
      qDesc: `Devasa element süpernovası tetikler (400 AoE DMG)!`,
      qCooldown: 18000,
      onE: (p) => triggerUniversalElementalSkill(p, elem),
      onQ: (p) => triggerUniversalElementalBurst(p, elem)
    };
  }

  function getCompanionSkillECD() {
    const cfg = getCompanionConfig(myCompanion);
    return cfg ? cfg.eCooldown : 6000;
  }

  // --- Combat Actions ---

  function performAttack() {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();

    const stats = getPlayerEffectiveStats();
    const hasteFactor = 1 - Math.min(0.4, (stats.haste / 100) * 0.5);
    const attackCd = Math.round(220 * hasteFactor);

    // Prevent attack spamming / key-repeat lockups
    if (now - lastAttackTime < attackCd) return;

    if (now - lastAttackTime > 900) {
      attackComboIndex = 0;
    }
    attackComboIndex = (attackComboIndex % 3) + 1;
    lastAttackTime = now;
    isAttacking = true;
    setTimeout(() => { isAttacking = false; }, 200);

    const step = attackComboIndex;
    playSlashSound(step);

    // Sword animation swing
    if (combatWeaponMesh) {
      const swingRot = step === 1 ? -1.2 : (step === 2 ? 1.2 : -2.8);
      combatWeaponMesh.rotation.x = swingRot;
      setTimeout(() => {
        if (combatWeaponMesh) combatWeaponMesh.rotation.set(-0.35, 0, -0.45);
      }, 160);
    }

    // Elemental Slash Arc Visual with Companion Tint
    const compCfg = getCompanionConfig(myCompanion);
    const customSlashColor = compCfg && compCfg.slashColors ? compCfg.slashColors[step - 1] : null;
    createSlashArcMesh(myPlayer.x, myPlayer.z, myPlayer.rot, step, customSlashColor);

    // Hit Detection scaled with MMORPG Stats & GearScore penalties
    const playerAtk = stats.atk;
    const playerCritRate = stats.crit / 100;
    const playerCritMult = stats.critDmg / 100;
    let baseDmg = Math.round(playerAtk * (step === 1 ? 1.6 : (step === 2 ? 2.3 : 4.0)));

    // Companion Attack Buffs
    if (companionBuffs.active) {
      baseDmg = Math.round(baseDmg * companionBuffs.dmgMult);
    }

    const hitRadius = step === 3 ? 4.8 : 3.6;
    let hitCount = 0;

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
          if (diff > 1.5) continue;
        }

        hitCount++;
        const isCrit = Math.random() < playerCritRate;
        let finalDmg = isCrit ? Math.round(baseDmg * playerCritMult) : baseDmg;

        // GS Glance check (deflected blow)
        const isGlance = penalty.glanceChance > 0 && Math.random() < penalty.glanceChance;
        if (isGlance) {
          finalDmg = Math.floor(Math.random() * 2) + 1;
        } else {
          finalDmg = Math.max(1, Math.round(finalDmg * penalty.damageMult));
        }

        mob.hp = Math.max(0, mob.hp - finalDmg);

        if (mob.hpFillMesh) {
          const ratio = Math.max(0.001, mob.hp / mob.maxHP);
          mob.hpFillMesh.scale.x = ratio;
          mob.hpFillMesh.position.x = -((1 - ratio) * mob.hpFillBaseWidth) / 2;
        }

        const kbForce = (step === 3 ? 7.5 : 4.0) / (mob.isBoss ? 2.5 : 1.0);
        const normX = dx / (dist || 1);
        const normZ = dz / (dist || 1);
        mob.knockbackVx = normX * kbForce;
        mob.knockbackVz = normZ * kbForce;
        mob.flashTimer = 0.14;

        if (isGlance) {
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🛡️ SEKTİ! ${finalDmg}`, 'glance');
          playBeep(180, 'square', 0.08);
        } else {
          showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, (isCrit ? '💥 CRIT! ' : '') + finalDmg, isCrit ? 'crit' : 'normal');
        }

        // Raiden Shogun Coordinated Electro Slash Proc
        if (activeElectroEyeMesh && now < electroEyeEndTime) {
          const electroBonus = 45;
          mob.hp = Math.max(0, mob.hp - electroBonus);
          createElectroSlashVFX(mob.x, mob.y + 1.0, mob.z);
          showDamageNumber({ x: mob.x, y: mob.y + mob.height + 0.4, z: mob.z }, `⚡ +${electroBonus} Electro`, 'crit');
        }

        // Lifesteal heal proc
        if (stats.lifesteal > 0 && finalDmg > 0 && hitCount === 1) {
          const healAmount = Math.max(1, Math.round(finalDmg * (stats.lifesteal / 100)));
          playerHP = Math.min(playerMaxHP, playerHP + healAmount);
          updateCombatHUD();
          showDamageNumber({ x: myPlayer.x, y: 2.3, z: myPlayer.z }, `+${healAmount} HP`, 'heal');
        }

        if (mob.hp <= 0) {
          defeatMob(mob);
        }
      }
    }

    if (hitCount > 0) {
      const isAnyCrit = Math.random() < 0.25;
      playPunchyHitSound(isAnyCrit);
      screenShakeTimer = step === 3 ? 0.14 : 0.07;
      screenShakeMagnitude = step === 3 ? 0.28 : 0.14;

      const energyGain = step === 1 ? 8 : (step === 2 ? 12 : 20);
      playerEnergy = Math.min(100, playerEnergy + energyGain);
      updateCombatHUD();
    }
  }

  function performDash() {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (now < dashCooldownEndTime) return;

    const stats = getPlayerEffectiveStats();
    const dashCd = Math.round(1200 * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
    dashCooldownEndTime = now + dashCd;
    isDashing = true;
    playerInvulnerableUntil = now + 320;
    playDashSound();

    if (myMesh) {
      createAfterimageGhost(myPlayer.x, myPlayer.z, myPlayer.rot);
    }

    setTimeout(() => {
      isDashing = false;
    }, 240);
  }

  function performVortexSkill() {
    if (!isBattleZone(currentMap)) return;
    const now = performance.now();
    if (now < vortexCooldownEndTime) return;

    const stats = getPlayerEffectiveStats();
    const compCfg = getCompanionConfig(myCompanion);

    if (compCfg) {
      const baseCd = compCfg.eCooldown || 10000;
      const vortexCd = Math.round(baseCd * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
      vortexCooldownEndTime = now + vortexCd;
      compCfg.onE(myPlayer);
      updateCombatHUD();
      return;
    }

    // Default Vortex Skill (No Companion)
    const vortexCd = Math.round(6000 * (1 - Math.min(0.35, (stats.haste / 100) * 0.4)));
    vortexCooldownEndTime = now + vortexCd;
    isVortexActive = true;
    vortexEndTime = now + 3600;

    vortexPosition = {
      x: myPlayer.x + Math.sin(myPlayer.rot) * 4.0,
      z: myPlayer.z + Math.cos(myPlayer.rot) * 4.0
    };

    createVortexMesh(vortexPosition.x, 0, vortexPosition.z);
    playVortexSound();
    updateCombatHUD();
  }

  function performBurstSkill() {
    if (!isBattleZone(currentMap)) return;
    if (playerEnergy < 100) {
      playBeep(220, 'sawtooth', 0.15);
      showDamageNumber({ x: myPlayer.x, y: 2.2, z: myPlayer.z }, '⚡ ENERJİ YETERSİZ!', 'normal');
      return;
    }

    playerEnergy = 0;
    updateCombatHUD();

    const compCfg = getCompanionConfig(myCompanion);
    if (compCfg) {
      compCfg.onQ(myPlayer);
      return;
    }

    // Default Burst Skill (No Companion)
    playBurstExplosion();
    screenShakeTimer = 0.55;
    screenShakeMagnitude = 0.65;
    createMeteorImpact(myPlayer.x, myPlayer.z);

    const playerGs = getMyGearScore();
    const zoneConf = ZONE_CONFIGS[currentMap] || ZONE_CONFIGS.battle_zone_1;
    const penalty = getGsDifficultyMultiplier(playerGs, zoneConf.reqGS);

    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;
      const dist = Math.hypot(mob.x - myPlayer.x, mob.z - myPlayer.z);
      if (dist <= 12.0) {
        let burstDmg = Math.round((380 + Math.random() * 120) * penalty.damageMult);
        mob.hp = Math.max(0, mob.hp - burstDmg);
        if (mob.hpFillMesh) {
          const ratio = Math.max(0.001, mob.hp / mob.maxHP);
          mob.hpFillMesh.scale.x = ratio;
        }
        mob.flashTimer = 0.25;
        mob.knockbackVx = ((mob.x - myPlayer.x) / (dist || 1)) * 9.0;
        mob.knockbackVz = ((mob.z - myPlayer.z) / (dist || 1)) * 9.0;
        showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `☄️ BURST! ${burstDmg}`, 'crit');
        if (mob.hp <= 0) defeatMob(mob);
      }
    }
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
    mob.isDead = true;
    if (mob.mesh) {
      worldObjects.remove(mob.mesh);
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
    if (socket && socket.readyState === WebSocket.OPEN) {
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

    if (mob.isBoss) {
      playVictoryJingle();
      addChatMessage('⚔️ BOSS YENİLDİ', `👑 ${mob.name} yere serildi! Çantana değerli ganimetler saçıldı!`);
      bossRespawnTimer = performance.now() + 25000;
    }
  }

  function updateCombatHUD() {
    const hpFill = document.getElementById('combat-hp-fill');
    const hpText = document.getElementById('combat-hp-text');
    const energyFill = document.getElementById('combat-energy-fill');
    const energyText = document.getElementById('combat-energy-text');
    const slotBurst = document.getElementById('slot-burst');

    if (hpFill) {
      const hpPct = Math.max(0, Math.min(100, (playerHP / playerMaxHP) * 100));
      hpFill.style.width = `${hpPct}%`;
    }
    if (hpText) {
      const shieldStr = activeJadeShieldHP > 0 ? ` (+${activeJadeShieldHP} 🛡️)` : '';
      hpText.textContent = `HP ${playerHP} / ${playerMaxHP}${shieldStr}`;
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

    const now = performance.now();
    const cdDash = document.getElementById('cd-dash');
    if (cdDash) {
      if (now < dashCooldownEndTime) {
        const remaining = ((dashCooldownEndTime - now) / 1200) * 100;
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

    // Companion HUD Header Badge & Skill Slots
    const compBadge = document.getElementById('combat-companion-badge');
    const compAvatar = document.getElementById('companion-hud-avatar');
    const compElem = document.getElementById('companion-hud-elem');
    const compName = document.getElementById('companion-hud-name');
    const nameSlotSkill = document.getElementById('name-slot-skill');
    const iconSlotSkill = document.getElementById('icon-slot-skill');
    const nameSlotBurst = document.getElementById('name-slot-burst');
    const iconSlotBurst = document.getElementById('icon-slot-burst');

    const compCfg = getCompanionConfig(myCompanion);

    if (compBadge && myCompanion) {
      compBadge.classList.remove('hidden');
      if (compName) compName.textContent = myCompanion;
      if (compElem) compElem.textContent = (compCfg && compCfg.elementEmoji) || '✨';
      if (compAvatar) {
        if (myCompanionData && myCompanionData.icon) {
          compAvatar.src = myCompanionData.icon;
          compAvatar.style.display = 'block';
        }
      }
    } else if (compBadge) {
      compBadge.classList.remove('hidden');
      if (compName) compName.textContent = 'Yoldaş Yok [P]';
      if (compElem) compElem.textContent = '🐾';
    }

    if (compCfg) {
      if (nameSlotSkill) nameSlotSkill.textContent = compCfg.eName;
      if (iconSlotSkill) iconSlotSkill.textContent = compCfg.elementEmoji || '🌀';
      if (nameSlotBurst) nameSlotBurst.textContent = compCfg.qName;
      if (iconSlotBurst) iconSlotBurst.textContent = compCfg.elementEmoji === '⚡' ? '⚡' : (compCfg.elementEmoji === '🪨' ? '☄️' : (compCfg.elementEmoji === '🔥' ? '👻' : (compCfg.elementEmoji === '💧' ? '🌊' : '🍁')));
    } else {
      if (nameSlotSkill) nameSlotSkill.textContent = 'Girdap';
      if (iconSlotSkill) iconSlotSkill.textContent = '🌀';
      if (nameSlotBurst) nameSlotBurst.textContent = 'Kozmik Ulti';
      if (iconSlotBurst) iconSlotBurst.textContent = '☄️';
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

    // Zhongli Jade Shield Absorption
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
              const tickDmg = 16;
              mob.hp = Math.max(0, mob.hp - tickDmg);
              if (mob.hpFillMesh) {
                mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
              }
              mob.flashTimer = 0.08;
              showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `${tickDmg}`, 'normal');
              playerEnergy = Math.min(100, playerEnergy + 2);
              if (mob.hp <= 0) defeatMob(mob);
            }
          }
        }
      }
    }

    // 3. Update Mobs AI & Behavior with Telegraphed Attacks
    for (let i = 0; i < activeCombatMobs.length; i++) {
      const mob = activeCombatMobs[i];
      if (mob.isDead) continue;

      // Zhongli Petrification Check (Frozen in stone!)
      if (mob.isPetrified) {
        if (now > mob.petrifyUntil) {
          mob.isPetrified = false;
        } else {
          continue;
        }
      }

      // Knockback decay
      if (Math.abs(mob.knockbackVx) > 0.01 || Math.abs(mob.knockbackVz) > 0.01) {
        mob.x += mob.knockbackVx * delta;
        mob.z += mob.knockbackVz * delta;
        mob.knockbackVx *= 0.88;
        mob.knockbackVz *= 0.88;
      }

      // Hit flash decay
      if (mob.flashTimer > 0) {
        mob.flashTimer -= delta;
        mob.mesh.traverse(child => {
          if (child.isMesh && child.material && child.material.emissive) {
            child.material.emissive.setHex(mob.flashTimer > 0 ? 0xffffff : 0x000000);
          }
        });
      }

      // Billboard Mob HP Bar to Camera
      if (mob.hpBarGroup && camera) {
        mob.hpBarGroup.quaternion.copy(camera.quaternion);
      }

      // Active Leap Animation Progress
      if (mob.isLeaping) {
        const lElapsed = now - mob.leapStart;
        const lProg = Math.min(1.0, lElapsed / mob.leapDuration);
        mob.x = mob.leapStartX + (mob.leapTargetX - mob.leapStartX) * lProg;
        mob.z = mob.leapStartZ + (mob.leapTargetZ - mob.leapStartZ) * lProg;
        mob.mesh.position.set(mob.x, Math.sin(lProg * Math.PI) * 3.2, mob.z);
        if (lProg >= 1.0) {
          mob.isLeaping = false;
          mob.isAttacking = false;
          mob.mesh.position.y = 0;
        }
        continue;
      }

      // If mob is attacking / channeling, hold ground position
      if (mob.isAttacking) {
        mob.mesh.position.set(mob.x, 0, mob.z);
        continue;
      }

      // AI State Machine
      const dx = myPlayer.x - mob.x;
      const dz = myPlayer.z - mob.z;
      const dist = Math.hypot(dx, dz);

      if (dist < mob.aggroRange) {
        mob.rot = Math.atan2(dx, dz);
        mob.mesh.rotation.y = mob.rot;

        if (mob.attackCooldown > 0) {
          mob.attackCooldown -= delta;
        }

        // --- Attack & Movement Branching by Mob Type ---
        if (mob.type.startsWith('slime_')) {
          // SLIMES: Leap slam attack with circle warning
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
          }

        } else if (mob.type === 'pyromancer' || mob.type === 'abyss_mage') {
          // RANGED CASTERS: Ground Trap Rune telegraph under player
          if (dist <= 15.0 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 2.8 + Math.random() * 0.8;
            const trapX = myPlayer.x;
            const trapZ = myPlayer.z;
            const spellColor = mob.type === 'pyromancer' ? 0xf97316 : 0x8b5cf6;

            createTelegraphCircle(trapX, trapZ, 3.4, 1100, () => {
              mob.isAttacking = false;
              createShockwaveRing(trapX, trapZ, 3.8, spellColor);
              const pDist = Math.hypot(myPlayer.x - trapX, myPlayer.z - trapZ);
              if (pDist < 3.4) {
                applyMobDamageToPlayer(mob.dmg, mob.name);
              }
            });
          } else if (dist < 4.5) {
            // Kite backward
            const backSpeed = 1.6 * delta;
            mob.x -= (dx / dist) * backSpeed;
            mob.z -= (dz / dist) * backSpeed;
          } else if (dist > 10.0) {
            const speed = mob.speed * delta;
            mob.x += (dx / dist) * speed;
            mob.z += (dz / dist) * speed;
          }

        } else if (mob.type === 'mitachurl_axe') {
          // MITACHURL AXE ELITE: Charge lane attack or 360 cleave
          if (dist >= 6.0 && dist <= 18.0 && mob.attackCooldown <= 0) {
            // Move 1: Blazing Charge Lane
            mob.isAttacking = true;
            mob.attackCooldown = 3.6;
            const chargeAngle = Math.atan2(dx, dz);
            mob.rot = chargeAngle;
            mob.mesh.rotation.y = chargeAngle;
            const laneLen = 15;

            createTelegraphLane(mob.x, mob.z, 3.8, laneLen, chargeAngle, 1150, () => {
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
            // Move 2: 360 Cleave Circle
            mob.isAttacking = true;
            mob.attackCooldown = 2.8;
            createTelegraphCircle(mob.x, mob.z, 5.2, 950, () => {
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
          }

        } else if (mob.type === 'ruin_golem') {
          // RUIN GOLEM WORLD BOSS: Triple Ground Slam or Orbital Void Bombardment
          if (mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 4.2;
            const useBombardment = Math.random() < 0.5;

            if (useBombardment) {
              // Orbital Void Bombardment (3 circles)
              const targets = [
                { x: myPlayer.x, z: myPlayer.z },
                { x: myPlayer.x + (Math.random() - 0.5) * 6, z: myPlayer.z + (Math.random() - 0.5) * 6 },
                { x: myPlayer.x + (Math.random() - 0.5) * 6, z: myPlayer.z + (Math.random() - 0.5) * 6 }
              ];
              let completed = 0;
              targets.forEach(tgt => {
                createTelegraphCircle(tgt.x, tgt.z, 3.2, 1050, () => {
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
              // Triple Expanding Seismic Ground Stomp
              createTelegraphCircle(mob.x, mob.z, 6.0, 750, () => {
                createShockwaveRing(mob.x, mob.z, 6.2, 0xa855f7);
                screenShakeTimer = 0.2; screenShakeMagnitude = 0.35;
                if (Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z) < 6.0) {
                  applyMobDamageToPlayer(mob.dmg, mob.name);
                }
                createTelegraphCircle(mob.x, mob.z, 12.0, 550, () => {
                  createShockwaveRing(mob.x, mob.z, 12.2, 0x6366f1);
                  screenShakeTimer = 0.25; screenShakeMagnitude = 0.4;
                  if (Math.hypot(myPlayer.x - mob.x, myPlayer.z - mob.z) < 12.0) {
                    applyMobDamageToPlayer(mob.dmg, mob.name);
                  }
                  createTelegraphCircle(mob.x, mob.z, 18.0, 550, () => {
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
          }

        } else {
          // Hilichurls & Sentinels: Frontal Cleave Circle
          if (dist <= 2.2 && mob.attackCooldown <= 0) {
            mob.isAttacking = true;
            mob.attackCooldown = 1.9 + Math.random() * 0.5;
            const fx = mob.x + Math.sin(mob.rot) * 1.4;
            const fz = mob.z + Math.cos(mob.rot) * 1.4;

            createTelegraphCircle(fx, fz, 2.7, 850, () => {
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
          }
        }
      }

      mob.mesh.position.x = mob.x;
      mob.mesh.position.z = mob.z;
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
          // Reached player!
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
          // Vacuum flight towards player
          const vacSpeed = Math.min(18.0, 7.0 + (elapsed - gem.vacuumDelay) * 0.012) * delta;
          gem.x += (pdx / (pdist || 1)) * vacSpeed;
          gem.z += (pdz / (pdist || 1)) * vacSpeed;
          gem.y += (pdy / (pdist || 1)) * vacSpeed;
          gem.mesh.position.set(gem.x, gem.y, gem.z);
        }
      }
    }

    // 5. Respawn Check (Keep Arena Populated)
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

    // 6. Companion Active Systems Runtime Updates
    // Geo Stele Resonating Shockwaves
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
            mob.hp = Math.max(0, mob.hp - 45);
            if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
            mob.flashTimer = 0.12;
            showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🪨 Rezonans! 45`, 'normal');
            if (mob.hp <= 0) defeatMob(mob);
          }
        }
      }
    }

    // Furina Salon Solitaire Water Minions
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
              nearestMob.hp = Math.max(0, nearestMob.hp - 35);
              if (nearestMob.hpFillMesh) nearestMob.hpFillMesh.scale.x = Math.max(0.001, nearestMob.hp / nearestMob.maxHP);
              nearestMob.flashTimer = 0.1;
              showDamageNumber({ x: nearestMob.x, y: nearestMob.y + nearestMob.height, z: nearestMob.z }, `💧 35`, 'normal');
              playHydroSplashSound();
              if (nearestMob.hp <= 0) defeatMob(nearestMob);
            }
          }
        }
      }
    }

    // Kazuha Autumn Storm Ticks
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
              mob.hp = Math.max(0, mob.hp - 40);
              if (mob.hpFillMesh) mob.hpFillMesh.scale.x = Math.max(0.001, mob.hp / mob.maxHP);
              mob.flashTimer = 0.08;
              showDamageNumber({ x: mob.x, y: mob.y + mob.height, z: mob.z }, `🍃 40`, 'normal');
              if (mob.hp <= 0) defeatMob(mob);
            }
          }
        }
      }
    }

    // Jade Shield Spin
    if (activeJadeShieldMesh) {
      activeJadeShieldMesh.rotation.y += 0.015;
      activeJadeShieldMesh.rotation.x += 0.008;
    }

    // Electro Eye Lifetime
    if (activeElectroEyeMesh) {
      if (now > electroEyeEndTime) {
        if (myMesh) myMesh.remove(activeElectroEyeMesh);
        activeElectroEyeMesh = null;
      } else {
        activeElectroEyeMesh.rotation.y += 0.04;
      }
    }

    // Companion Buffs Expiration
    if (companionBuffs.active) {
      companionBuffs.timer -= delta;
      if (companionBuffs.timer <= 0) {
        companionBuffs.active = false;
        companionBuffs.dmgMult = 1.0;
        companionBuffs.speedMult = 1.0;
        companionBuffs.type = '';
      }
    }

    // Update HUD cooldowns
    updateCombatHUD();
  }

  function triggerPlayerDefeat() {
    if (isPlayerDefeated) return;
    isPlayerDefeated = true;
    playBeep(130, 'sawtooth', 0.45);

    const defeatOverlay = document.getElementById('player-defeat-overlay');
    if (defeatOverlay) {
      defeatOverlay.classList.remove('hidden');
    }

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

  function openPortalZoneModal() {
    const currentGS = getMyGearScore();
    const gsEl = document.getElementById('portal-player-gs');
    if (gsEl) gsEl.textContent = `${currentGS} GS`;

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
    vortexMesh = null;
    isVortexActive = false;

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
      scene.background = new THREE.Color(0x041b12);
      scene.fog = new THREE.FogExp2(0x041b12, 0.016);

      // Lush Organic Moss Floor
      const floorGeo = new THREE.CircleGeometry(42, 48);
      const floorMat = new THREE.MeshLambertMaterial({
        color: 0x14532d,
        roughness: 0.95
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      worldObjects.add(floor);

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

      // Warm Meadow & Canopy Lighting
      const dirLight = new THREE.DirectionalLight(0xfef08a, 0.95);
      dirLight.position.set(20, 35, 15);
      dirLight.castShadow = true;
      worldObjects.add(dirLight);

      const ambLight = new THREE.AmbientLight(0x064e3b, 0.85);
      worldObjects.add(ambLight);

    } else if (zoneId === 'battle_zone_2') {
      // 🌋 Zone 2: Kızıl Lav Harabeleri (Scorched Volcanic Ruins)
      scene.background = new THREE.Color(0x180505);
      scene.fog = new THREE.FogExp2(0x180505, 0.02);

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

      // Crimson Lighting
      const dirLight = new THREE.DirectionalLight(0xf97316, 0.95);
      dirLight.position.set(15, 35, 15);
      dirLight.castShadow = true;
      worldObjects.add(dirLight);

      const ambLight = new THREE.AmbientLight(0x450a0a, 0.8);
      worldObjects.add(ambLight);

    } else {
      // 🌌 Zone 3: Kadim Uçurum Boşluğu (Floating Shattered Island over Cosmic Void)
      scene.background = new THREE.Color(0x020617);
      scene.fog = new THREE.FogExp2(0x020617, 0.015);

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

      // Deep Cosmic Indigo Light
      const dirLight = new THREE.DirectionalLight(0x818cf8, 0.85);
      dirLight.position.set(15, 35, 15);
      dirLight.castShadow = true;
      worldObjects.add(dirLight);

      const ambLight = new THREE.AmbientLight(0x0f172a, 0.85);
      worldObjects.add(ambLight);
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

      // Combat Interception (Battle Zone)
      if (isBattleZone(currentMap)) {
        if (k === 'f') {
          if (e.repeat) return;
          e.preventDefault();
          performAttack();
          return;
        }
        if (e.key === 'Shift') {
          if (e.repeat) return;
          e.preventDefault();
          performDash();
          return;
        }
        if (k === 'e') {
          if (nearbyInteractable && nearbyInteractable.type === 'door') {
            triggerInteract();
            return;
          }
          if (e.repeat) return;
          e.preventDefault();
          performVortexSkill();
          return;
        }
        if (k === 'q') {
          if (e.repeat) return;
          e.preventDefault();
          performBurstSkill();
          return;
        }
      }

      if (k === 'c') {
        e.preventDefault();
        toggleCharacterSheet();
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
    document.getElementById('btn-open-inventory').onclick = () => {
      fetchInventory();
      document.getElementById('inventory-drawer').classList.toggle('hidden');
    };
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

    // Battle Zone Canvas Left-Click Attack
    window.addEventListener('mousedown', (e) => {
      if (isBattleZone(currentMap) && e.button === 0) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'textarea' || e.target.closest('#chat-container') || e.target.closest('#nav-controls') || e.target.closest('#combat-hud')) return;
        performAttack();
      }
    });

    // Mobile Combat Action Buttons
    document.getElementById('btn-combat-atk')?.addEventListener('click', () => performAttack());
    document.getElementById('btn-combat-dash')?.addEventListener('click', () => performDash());
    document.getElementById('btn-combat-skill')?.addEventListener('click', () => performVortexSkill());
    document.getElementById('btn-combat-burst')?.addEventListener('click', () => performBurstSkill());

    // Monster Material Market Actions
    document.getElementById('btn-market-sell-all')?.addEventListener('click', async () => {
      await sellMaterialItem(null, null, true);
    });

    // Portal Zone Selection Modal Enter Buttons
    document.querySelectorAll('.btn-zone-enter').forEach(btn => {
      btn.onclick = () => {
        const zoneId = btn.getAttribute('data-zone-id');
        if (!zoneId) return;
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
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

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
        const ox = otherEntry.mesh.position.x + Math.sin(otherEntry.mesh.rotation.y - 0.75) * 1.35;
        const oz = otherEntry.mesh.position.z + Math.cos(otherEntry.mesh.rotation.y - 0.75) * 1.35;
        const oy = otherEntry.mesh.position.y + 1.85 + Math.sin(now * 0.0035 + (id.charCodeAt(0) || 0)) * 0.14;
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

    // 1. Animate River Water Surface Ripples
    if (canalWaterMesh && canalWaterMesh.material.map) {
      canalWaterMesh.material.map.offset.x = (now * 0.0001) % 1;
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
      if (item) {
        card.classList.add(`rarity-${item.rarity}`);
        const plusStr = (item.plus > 0) ? `+${item.plus} ` : '';
        nameEl.textContent = `${plusStr}${item.name}`;
        if (scoreEl) scoreEl.textContent = `GS +${item.score || 0}`;
        card.onclick = () => showItemPopover(item, true);
      } else {
        nameEl.textContent = 'Boş Yuva';
        if (scoreEl) scoreEl.textContent = '';
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
            <span class="bag-item-icon">${RPG_SLOT_ICONS[item.slot] || '📦'}</span>
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
        } else {
          btnUpgrade.textContent = `✨ Güçlendir (+${item.plus + 1}) [${item.upgradeCost || 0} Toz]`;
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
        playBeep(1046, 'triangle', 0.2);
        myRpgProfile = data.state;
        updateUIProfile();
        renderCharacterSheet();
        showItemPopover(data.result.item, selectedPopoverIsEquipped);
        addChatMessage('Demirci', `✨ Güçlendirme Başarılı! "${data.result.item.name}" seviyesi +${data.result.item.plus} oldu! (${data.result.item.score} GS)`);
      } else {
        alert(data.error || 'Güçlendirme başarısız.');
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
      if (item) {
        slotCard.classList.add(`rarity-${item.rarity}`);
        const plusStr = item.plus > 0 ? `+${item.plus} ` : '';
        nameEl.textContent = `${plusStr}${item.name}`;
        if (scoreEl) scoreEl.textContent = `GS +${item.score || 0}`;
        slotCard.onclick = () => showItemPopover(item, true, true);
      } else {
        nameEl.textContent = 'Boş';
        if (scoreEl) scoreEl.textContent = '';
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

  // --- 5★ Character Companion (Pet) Management & UI ---
  async function fetchUserCompanions() {
    try {
      const res = await fetch(`/api/companions/${encodeURIComponent(myPlayer.username || 'Misafir')}`);
      const data = await res.json();
      if (data && data.ok) {
        unlockedCompanionsList = data.companions || [];
        if (data.activeCompanion && !myCompanion) {
          myCompanion = data.activeCompanion;
          const found = unlockedCompanionsList.find(c => c.name === myCompanion);
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
      countBadge.textContent = `${unlockedCompanionsList.length} Yoldaş Mevcut`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 30px;">Bu elementte henüz bir 5★ karakter yoldaşın yok. Dilek çekerek yeni karakterler kazanabilirsin!</div>';
    } else {
      filtered.forEach(c => {
        const card = document.createElement('div');
        const isEquipped = myCompanion && myCompanion.toLowerCase() === c.name.toLowerCase();
        const isSelected = selectedCompanionInModal && selectedCompanionInModal.toLowerCase() === c.name.toLowerCase();

        card.className = `companion-card ${isEquipped ? 'equipped' : ''} ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          ${isEquipped ? '<span class="companion-card-equipped-badge">KUŞANILDI</span>' : ''}
          <div class="companion-card-img-wrap">
            <img src="${c.icon || c.splashArt || '/assets/characters/placeholder.png'}" alt="${c.name}" onerror="this.src='/assets/avatars/avatar_1.svg'">
            <span class="companion-card-elem-badge">${c.element === 'Electro' ? '⚡' : (c.element === 'Geo' ? '🪨' : (c.element === 'Pyro' ? '🔥' : (c.element === 'Hydro' ? '💧' : (c.element === 'Anemo' ? '🍃' : '✨'))))}</span>
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
    const toSelect = selectedCompanionInModal || myCompanion || (filtered[0] && filtered[0].name) || 'Raiden Shogun';
    selectCompanionInModal(toSelect);
  }

  function selectCompanionInModal(charName) {
    selectedCompanionInModal = charName;
    const found = (unlockedCompanionsList || []).find(c => c.name.toLowerCase() === charName.toLowerCase());

    const previewImg = document.getElementById('companion-preview-img');
    const previewName = document.getElementById('companion-preview-name');
    const previewTitle = document.getElementById('companion-preview-title');
    const previewElem = document.getElementById('companion-preview-element');
    const skillEName = document.getElementById('companion-skill-e-name');
    const skillEDesc = document.getElementById('companion-skill-e-desc');
    const skillQName = document.getElementById('companion-skill-q-name');
    const skillQDesc = document.getElementById('companion-skill-q-desc');
    const btnEquip = document.getElementById('btn-equip-companion');

    const cfg = getCompanionConfig(charName);
    const element = (found && found.element) || (cfg && cfg.element) || 'Electro';

    if (previewImg) {
      previewImg.src = (found && (found.splashArt || found.icon)) || '/assets/characters/placeholder.png';
      previewImg.onerror = () => { previewImg.src = '/assets/avatars/avatar_1.svg'; };
    }
    if (previewName) previewName.textContent = charName;
    if (previewTitle) previewTitle.textContent = (found && found.title) || '5★ Yıldızlı Genshin Karakteri';
    if (previewElem) previewElem.textContent = `${(cfg && cfg.elementEmoji) || '✨'} ${element}`;

    if (cfg) {
      if (skillEName) skillEName.textContent = cfg.eName;
      if (skillEDesc) skillEDesc.textContent = cfg.eDesc;
      if (skillQName) skillQName.textContent = cfg.qName;
      if (skillQDesc) skillQDesc.textContent = cfg.qDesc;
    }

    if (btnEquip) {
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

  // --- Bootstrap ---
  window.openRPGDialogue = openRPGDialogue;
  window.closeRPGDialogue = closeRPGDialogue;
  window.openCharacterSheet = openCharacterSheet;
  window.openInspectModal = openInspectModal;
  window.toggleCompanionModal = toggleCompanionModal;
  window.openCompanionModal = openCompanionModal;

  window.addEventListener('DOMContentLoaded', () => {
    initThree();
    updateMyMesh();
    updateUIProfile();
    initWebSocket();
    initEvents();
    fetchRpgProfile();
    animate();
  });
})();
