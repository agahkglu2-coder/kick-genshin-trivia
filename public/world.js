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
  let fountainParticlesData = [];
  let chimneySmokeData = [];
  let firefliesData = [];
  let shrineAuraData = [];

  // Active Trade State
  let activeTrade = null;
  let myInventory = [];
  let nearbyInteractable = null; // { type: 'door' | 'player', data }

  // Input State
  const keys = { w: false, a: false, s: false, d: false, up: false, left: false, down: false, right: false };
  let joystickVector = { x: 0, y: 0 };
  let lastMoveSent = 0;

  // Sound Synth Helper
  function playBeep(freq = 440, type = 'sine', duration = 0.12) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
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

  // --- 1. Procedural 20 Pixel Avatars Generator ---
  const AVATAR_PALETTES = [
    { name: 'Gezgin (Aether)', hair: '#f59e0b', clothes: '#3b82f6', skin: '#fed7aa', cape: '#1e293b' },
    { name: 'Kırmızı Şövalye', hair: '#ef4444', clothes: '#b91c1c', skin: '#fecaca', cape: '#ffffff' },
    { name: 'Anemo Okçu', hair: '#10b981', clothes: '#059669', skin: '#d1fae5', cape: '#34d399' },
    { name: 'Electro Büyücü', hair: '#8b5cf6', clothes: '#6d28d9', skin: '#ede9fe', cape: '#a78bfa' },
    { name: 'Cryo Kaptan', hair: '#38bdf8', clothes: '#0284c7', skin: '#e0f2fe', cape: '#0f172a' },
    { name: 'Pyro Tilki', hair: '#f97316', clothes: '#c2410c', skin: '#ffedd5', cape: '#fb923c' },
    { name: 'Geo Muhafız', hair: '#d97706', clothes: '#92400e', skin: '#fef3c7', cape: '#78350f' },
    { name: 'Hydro Rahibe', hair: '#06b6d4', clothes: '#0891b2', skin: '#cffafe', cape: '#22d3ee' },
    { name: 'Gölge Ninja', hair: '#1e293b', clothes: '#0f172a', skin: '#cbd5e1', cape: '#dc2626' },
    { name: 'Piksel Kedi (Miyav)', hair: '#fbbf24', clothes: '#f59e0b', skin: '#fffbeb', cape: '#f43f5e' },
    { name: 'Fatui Ajanı', hair: '#475569', clothes: '#334155', skin: '#f1f5f9', cape: '#991b1b' },
    { name: 'Arkon Raiden', hair: '#7c3aed', clothes: '#5b21b6', skin: '#ede9fe', cape: '#fbbf24' },
    { name: 'Deniz Kaptanı', hair: '#0369a1', clothes: '#075985', skin: '#e0f2fe', cape: '#f59e0b' },
    { name: 'Orman Korucusu', hair: '#15803d', clothes: '#166534', skin: '#dcfce7', cape: '#ca8a04' },
    { name: 'Kraliyet Muhafızı', hair: '#e2e8f0', clothes: '#cbd5e1', skin: '#f8fafc', cape: '#2563eb' },
    { name: 'Çöl Savaşçısı', hair: '#78350f', clothes: '#b45309', skin: '#fde68a', cape: '#451a03' },
    { name: 'Kar Prensesi', hair: '#bae6fd', clothes: '#7dd3fc', skin: '#f0f9ff', cape: '#38bdf8' },
    { name: 'Alev Dansçısı', hair: '#ea580c', clothes: '#dc2626', skin: '#ffedd5', cape: '#facc15' },
    { name: 'Yıldız Gözlemcisi', hair: '#4338ca', clothes: '#3730a3', skin: '#e0e7ff', cape: '#a855f7' },
    { name: 'Paimon Yoldaş', hair: '#f8fafc', clothes: '#e2e8f0', skin: '#fff1f2', cape: '#38bdf8' }
  ];

  function createAvatarTexture(paletteIndex = 0, frame = 0) {
    const p = AVATAR_PALETTES[paletteIndex % AVATAR_PALETTES.length];
    const cvs = document.createElement('canvas');
    cvs.width = 32;
    cvs.height = 48;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Bobbing walk offset
    const legOffset = frame === 1 ? -2 : frame === 2 ? 2 : 0;
    const armOffset = frame === 1 ? 2 : frame === 2 ? -2 : 0;

    // Cape / Back
    ctx.fillStyle = p.cape;
    ctx.fillRect(8, 16, 16, 18);

    // Legs
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 34 + legOffset, 5, 10);
    ctx.fillRect(17, 34 - legOffset, 5, 10);

    // Torso / Clothes
    ctx.fillStyle = p.clothes;
    ctx.fillRect(9, 18, 14, 16);

    // Arms
    ctx.fillStyle = p.clothes;
    ctx.fillRect(6, 20 + armOffset, 3, 11);
    ctx.fillRect(23, 20 - armOffset, 3, 11);

    // Hands
    ctx.fillStyle = p.skin;
    ctx.fillRect(6, 31 + armOffset, 3, 3);
    ctx.fillRect(23, 31 - armOffset, 3, 3);

    // Head / Skin
    ctx.fillStyle = p.skin;
    ctx.fillRect(9, 7, 14, 12);

    // Hair
    ctx.fillStyle = p.hair;
    ctx.fillRect(8, 4, 16, 6);
    ctx.fillRect(7, 7, 3, 7);
    ctx.fillRect(22, 7, 3, 7);

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(12, 11, 2, 3);
    ctx.fillRect(18, 11, 2, 3);

    // Sparkle / Accessory
    ctx.fillStyle = '#fde047';
    ctx.fillRect(15, 23, 2, 2);

    const texture = new THREE.CanvasTexture(cvs);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
  }

  // --- 2. 3D Overhead Billboard Helpers (Nametag & Speech Bubble) ---
  function createNametagCanvas(username, isGuest, primogems = 0) {
    const cvs = document.createElement('canvas');
    cvs.width = 256;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = true;

    // Background capsule
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 44, 14);
    ctx.fill();

    // Border
    ctx.lineWidth = 3;
    ctx.strokeStyle = isGuest ? '#64748b' : '#53fc18';
    ctx.stroke();

    // Text
    ctx.font = 'bold 22px Nunito, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tag = isGuest ? username : `⚡ ${username}`;
    ctx.fillText(tag, 128, 32);

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
    cvs.width = 64;
    cvs.height = 64;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 0, 64, 64);

    const greens = ['#15803d', '#166534', '#22c55e', '#14532d', '#4ade80'];
    for (let x = 0; x < 64; x += 2) {
      for (let y = 0; y < 64; y += 2) {
        if (Math.random() > 0.45) {
          ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    // Little 16-bit wildflowers (yellow, white, pink, sky blue)
    const flowers = [
      { x: 8, y: 12, c: '#fef08a' }, { x: 10, y: 12, c: '#ffffff' },
      { x: 24, y: 38, c: '#ffffff' }, { x: 26, y: 38, c: '#f59e0b' },
      { x: 44, y: 16, c: '#f472b6' }, { x: 52, y: 48, c: '#38bdf8' },
      { x: 18, y: 54, c: '#fef08a' }, { x: 36, y: 26, c: '#ffffff' },
      { x: 56, y: 10, c: '#a855f7' }, { x: 6, y: 42, c: '#fb7185' }
    ];
    flowers.forEach(f => {
      ctx.fillStyle = f.c;
      ctx.fillRect(f.x, f.y, 2, 2);
    });

    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
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

    // Mortar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 64, 64);

    // Stone pavers
    const colors = ['#64748b', '#475569', '#94a3b8', '#334155', '#4b5563'];
    for (let row = 0; row < 8; row++) {
      const y = row * 8;
      const xOffset = (row % 2) * 4;
      for (let col = -1; col < 8; col++) {
        const x = col * 8 + xOffset;
        ctx.fillStyle = colors[(row + col + 12) % colors.length];
        ctx.fillRect(x + 1, y + 1, 6, 6);

        // Top-left highlight
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(x + 1, y + 1, 5, 1);
        ctx.fillRect(x + 1, y + 1, 1, 5);

        // Bottom-right shadow
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x + 1, y + 6, 6, 1);
        ctx.fillRect(x + 6, y + 1, 1, 6);
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
      antialias: false,
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

  // --- 4. Procedural & Textured Voxel Building Generator ---
  function createVoxelBuilding({
    width = 8,
    height = 6,
    depth = 8,
    wallColor = 0xe2e8f0,
    roofColor = 0x3b82f6,
    roofType = 'hip', // 'hip', 'gable', 'shrine'
    signText = '',
    doorColor = 0x78350f,
    hasAwning = false,
    facadeTextureUrl = null,
    hasChimney = false,
    chimneyOffset = { x: 2.8, z: -2.2 },
    isShrine = false
  }) {
    const group = new THREE.Group();

    // 1. Main walls
    const wallGeo = new THREE.BoxGeometry(width, height, depth);
    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.position.y = height / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    // 2. Foundation Stone Base
    const baseGeo = new THREE.BoxGeometry(width + 0.6, 0.6, depth + 0.6);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.3;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 3. Timber Framing Corner Beams
    const beamGeo = new THREE.BoxGeometry(0.5, height + 0.2, 0.5);
    const beamMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
    const corners = [
      { x: -width / 2 + 0.2, z: depth / 2 - 0.2 },
      { x: width / 2 - 0.2, z: depth / 2 - 0.2 },
      { x: -width / 2 + 0.2, z: -depth / 2 + 0.2 },
      { x: width / 2 - 0.2, z: -depth / 2 + 0.2 }
    ];
    corners.forEach(pos => {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(pos.x, height / 2, pos.z);
      b.castShadow = true;
      group.add(b);
    });

    // 4. Textured Facade Front Plane
    if (facadeTextureUrl) {
      const fGeo = new THREE.PlaneGeometry(width * 0.94, height * 0.92);
      const fTex = loadPixelTexture(facadeTextureUrl);
      const fMat = new THREE.MeshLambertMaterial({
        map: fTex,
        transparent: true,
        side: THREE.FrontSide
      });
      const fMesh = new THREE.Mesh(fGeo, fMat);
      fMesh.position.set(0, height / 2 + 0.1, depth / 2 + 0.05);
      group.add(fMesh);
    }

    // 5. Roof Architecture
    if (roofType === 'shrine') {
      // 2-tier Stepped Pagoda Roof with Gold/Purple Edges
      const domeGeo1 = new THREE.ConeGeometry(width * 0.9, 3.2, 8);
      const domeMat1 = new THREE.MeshLambertMaterial({ color: roofColor });
      const domeMesh1 = new THREE.Mesh(domeGeo1, domeMat1);
      domeMesh1.position.y = height + 1.6;
      domeMesh1.castShadow = true;
      group.add(domeMesh1);

      const domeGeo2 = new THREE.ConeGeometry(width * 0.55, 2.8, 8);
      const domeMat2 = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
      const domeMesh2 = new THREE.Mesh(domeGeo2, domeMat2);
      domeMesh2.position.y = height + 3.8;
      domeMesh2.castShadow = true;
      group.add(domeMesh2);

      // Gold spire
      const spireGeo = new THREE.CylinderGeometry(0.12, 0.25, 2.2, 8);
      const spireMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.y = height + 5.6;
      group.add(spire);
    } else if (roofType === 'gable') {
      // Sloped Gable Roof with Timber Bargeboards
      const roofGeo = new THREE.ConeGeometry(width * 0.82, 3.8, 4);
      const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.y = height + 1.9;
      roofMesh.rotation.y = Math.PI / 4;
      roofMesh.castShadow = true;
      group.add(roofMesh);

      // Timber roof ridge beam
      const ridgeGeo = new THREE.BoxGeometry(0.4, 0.4, depth + 0.6);
      const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
      const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
      ridge.position.set(0, height + 3.8, 0);
      group.add(ridge);
    } else {
      // Sloped Hip Roof
      const roofGeo = new THREE.ConeGeometry(width * 0.82, 3.4, 4);
      const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.y = height + 1.7;
      roofMesh.rotation.y = Math.PI / 4;
      roofMesh.castShadow = true;
      group.add(roofMesh);
    }

    // 6. Doorway Frame & Glowing Portal
    const doorGeo = new THREE.BoxGeometry(2.4, 3.4, 0.4);
    const doorMat = new THREE.MeshLambertMaterial({ color: doorColor });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, 1.7, depth / 2 + 0.1);
    group.add(doorMesh);

    // Glowing interior portal indicator
    const portalGeo = new THREE.PlaneGeometry(1.8, 2.8);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x53fc18,
      transparent: true,
      opacity: 0.65
    });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.set(0, 1.7, depth / 2 + 0.22);
    group.add(portalMesh);

    // 7. Doorway Sconce Lanterns
    [-1.6, 1.6].forEach(lx => {
      const sconceGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
      const sconceMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const sconce = new THREE.Mesh(sconceGeo, sconceMat);
      sconce.position.set(lx, 2.2, depth / 2 + 0.35);
      group.add(sconce);

      const sconceLight = new THREE.PointLight(0xfef08a, 0.5, 6, 2);
      sconceLight.position.set(lx, 2.2, depth / 2 + 0.6);
      group.add(sconceLight);
    });

    // 8. Awning (Shop canopy)
    if (hasAwning) {
      const awnGeo = new THREE.BoxGeometry(width * 0.72, 0.3, 2.4);
      const awnMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
      const awnMesh = new THREE.Mesh(awnGeo, awnMat);
      awnMesh.position.set(0, 3.8, depth / 2 + 1.2);
      awnMesh.rotation.x = 0.22;
      group.add(awnMesh);

      // Wooden support struts
      [-width * 0.32, width * 0.32].forEach(sx => {
        const strutGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2);
        const strutMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
        const strut = new THREE.Mesh(strutGeo, strutMat);
        strut.position.set(sx, 2.8, depth / 2 + 1.1);
        strut.rotation.x = -0.6;
        group.add(strut);
      });
    }

    // 9. Stone Chimney Stack
    if (hasChimney) {
      const offset = chimneyOffset || { x: 2.8, z: -2.2 };
      const chimGeo = new THREE.BoxGeometry(1.2, 3.2, 1.2);
      const chimMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
      const chimMesh = new THREE.Mesh(chimGeo, chimMat);
      chimMesh.position.set(offset.x, height + 2.0, offset.z);
      chimMesh.castShadow = true;
      group.add(chimMesh);

      // Chimney rim
      const rimGeo = new THREE.BoxGeometry(1.4, 0.3, 1.4);
      const rim = new THREE.Mesh(rimGeo, chimMat);
      rim.position.set(offset.x, height + 3.6, offset.z);
      group.add(rim);
    }

    // 10. Floating Building Sign
    if (signText) {
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
      ctx.fillText(signText, 128, 32);

      const signTex = new THREE.CanvasTexture(cvs);
      const signMat = new THREE.SpriteMaterial({ map: signTex });
      const signSprite = new THREE.Sprite(signMat);
      signSprite.scale.set(4.5, 1.12, 1);
      signSprite.position.set(0, height + 4.2, 0);
      group.add(signSprite);
    }

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

  // --- Living Particle Systems Initialization ---
  function initParticleSystems() {
    fountainParticlesData = [];
    chimneySmokeData = [];
    firefliesData = [];
    shrineAuraData = [];

    // 1. Central Fountain Water Spray Droplets
    const fGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const fMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 35; i++) {
      const p = new THREE.Mesh(fGeo, fMat);
      p.position.set(0, 1.8, 0);
      worldObjects.add(p);
      fountainParticlesData.push({
        mesh: p,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 2.2 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 1.4,
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
      aMesh.position.set(0, 5, -15);
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

  // --- 5. Map Builders (Town vs Interior) ---
  function clearWorld() {
    animatedCats = [];
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

    // 1. Terrain Grass with 16-bit Flower Texture
    const grassGeo = new THREE.PlaneGeometry(92, 92);
    const grassMat = new THREE.MeshLambertMaterial({
      map: createProceduralGrassTexture()
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    worldObjects.add(grass);

    // 2. Cobblestone Crossroads with Curbs
    const pathTexX = createProceduralCobbleTexture(2, 24);
    const pathMatX = new THREE.MeshLambertMaterial({ map: pathTexX });
    const pathX = new THREE.Mesh(new THREE.PlaneGeometry(8, 72), pathMatX);
    pathX.rotation.x = -Math.PI / 2;
    pathX.position.y = 0.02;
    pathX.receiveShadow = true;
    worldObjects.add(pathX);

    const pathTexZ = createProceduralCobbleTexture(24, 2);
    const pathMatZ = new THREE.MeshLambertMaterial({ map: pathTexZ });
    const pathZ = new THREE.Mesh(new THREE.PlaneGeometry(72, 8), pathMatZ);
    pathZ.rotation.x = -Math.PI / 2;
    pathZ.position.y = 0.02;
    pathZ.receiveShadow = true;
    worldObjects.add(pathZ);

    // Stone Curb Lines along the roads
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    [-4.1, 4.1].forEach(offset => {
      const curbX = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 72), curbMat);
      curbX.position.set(offset, 0.08, 0);
      curbX.receiveShadow = true;
      worldObjects.add(curbX);

      const curbZ = new THREE.Mesh(new THREE.BoxGeometry(72, 0.15, 0.25), curbMat);
      curbZ.position.set(0, 0.08, offset);
      curbZ.receiveShadow = true;
      worldObjects.add(curbZ);
    });

    // 3. Central Fountain & Basin
    const fBasinGeo = new THREE.CylinderGeometry(4.6, 5.0, 1.2, 20);
    const fBasinMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const fBasin = new THREE.Mesh(fBasinGeo, fBasinMat);
    fBasin.position.set(0, 0.6, 0);
    fBasin.receiveShadow = true;
    fBasin.castShadow = true;
    worldObjects.add(fBasin);

    const fWaterGeo = new THREE.CylinderGeometry(4.3, 4.3, 0.3, 20);
    const fWaterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    const fWater = new THREE.Mesh(fWaterGeo, fWaterMat);
    fWater.position.set(0, 1.05, 0);
    worldObjects.add(fWater);

    const fPillarGeo = new THREE.CylinderGeometry(0.8, 1.1, 3.2, 8);
    const fPillar = new THREE.Mesh(fPillarGeo, fBasinMat);
    fPillar.position.set(0, 1.8, 0);
    fPillar.castShadow = true;
    worldObjects.add(fPillar);

    const fTopper = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), new THREE.MeshLambertMaterial({ color: 0xfef08a }));
    fTopper.position.set(0, 3.4, 0);
    worldObjects.add(fTopper);

    // 4. Southern River Canal & Arched Stone Bridge
    // Canal Channel at z = 24 (z: 20 to 28, spans x: -46 to 46)
    const canalBed = new THREE.Mesh(
      new THREE.PlaneGeometry(92, 8),
      new THREE.MeshLambertMaterial({ color: 0x0f172a })
    );
    canalBed.rotation.x = -Math.PI / 2;
    canalBed.position.set(0, -0.4, 24);
    canalBed.receiveShadow = true;
    worldObjects.add(canalBed);

    // River water surface with animated ripples
    const canalWaterGeo = new THREE.PlaneGeometry(92, 7.8);
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
      const wall = new THREE.Mesh(new THREE.BoxGeometry(92, 0.7, 0.4), bankMat);
      wall.position.set(0, 0.25, bz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      worldObjects.add(wall);
    });

    // Floating water lilies in canal
    [
      { x: -18, z: 22.8 }, { x: -12, z: 25.2 }, { x: -6, z: 23.4 },
      { x: 8, z: 24.8 }, { x: 16, z: 22.6 }, { x: 25, z: 25.0 }
    ].forEach(p => worldObjects.add(createWaterLily(p.x, p.z)));

    // Arched Stone Bridge at x = 0, z = 24
    const bridgeGroup = new THREE.Group();
    // Central arched walkway
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

      // 4 Bridge Corner Lantern Pedestals
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

    // 5. Four Key Buildings with High-Res 16-Bit Facade Textures
    // A) Takas Pazarı (Trade Mart) - Top-Left
    const tradeHouse = createVoxelBuilding({
      width: 9,
      height: 6.5,
      depth: 9,
      wallColor: 0x0284c7,
      roofColor: 0x0369a1,
      roofType: 'hip',
      signText: '⚖️ Pazar & Takas',
      hasAwning: true,
      facadeTextureUrl: '/assets/world/trade_shop_facade.jpg'
    });
    tradeHouse.position.set(-14, 0, -10);
    worldObjects.add(tradeHouse);

    // Market Plaza Stalls in front of Trade Mart
    worldObjects.add(createMarketStall({
      x: -9, z: -4, rotY: 0,
      awningColor1: 0xef4444, awningColor2: 0xffffff, wareType: 'fruits'
    }));
    worldObjects.add(createMarketStall({
      x: -5, z: -4, rotY: 0,
      awningColor1: 0x3b82f6, awningColor2: 0xfacc15, wareType: 'potions'
    }));

    // B) Cat's Tail Taverna - Top-Right
    chimneyPos = { x: 16.8, y: 8.8, z: -12.2 };
    const tavern = createVoxelBuilding({
      width: 9,
      height: 6.5,
      depth: 9,
      wallColor: 0x78350f,
      roofColor: 0xb91c1c,
      roofType: 'gable',
      signText: "🐱 Cat's Tail Taverna",
      hasAwning: false,
      hasChimney: true,
      chimneyOffset: { x: 2.8, z: -2.2 },
      facadeTextureUrl: '/assets/world/tavern_facade.jpg'
    });
    tavern.position.set(14, 0, -10);
    worldObjects.add(tavern);

    // Cat's Tail Outdoor Patio with Parasols and Tables
    worldObjects.add(createTavernPatio(14, -3));

    // C) Dilek Tapınağı (Gacha Shrine) - North Center
    const shrine = createVoxelBuilding({
      width: 10,
      height: 7.5,
      depth: 10,
      wallColor: 0x581c87,
      roofColor: 0x9333ea,
      roofType: 'shrine',
      signText: '✨ Dilek Tapınağı',
      facadeTextureUrl: '/assets/world/gacha_shrine_facade.jpg'
    });
    shrine.position.set(0, 0, -20);
    worldObjects.add(shrine);

    // Shrine Grand Marble Pillars & Purple Braziers
    [-3.8, 3.8].forEach(px => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.8, 12), new THREE.MeshLambertMaterial({ color: 0xf1f5f9 }));
      col.position.set(px, 3.4, -15.2);
      col.castShadow = true;
      worldObjects.add(col);

      // Gold cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.45, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
      cap.position.set(px, 6.8, -15.2);
      worldObjects.add(cap);

      // Brazier with purple fire light
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x1e1b4b }));
      brazier.position.set(px, 0.6, -13.5);
      worldObjects.add(brazier);

      const fire = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
      fire.position.set(px, 1.05, -13.5);
      worldObjects.add(fire);

      const pLight = new THREE.PointLight(0xc084fc, 0.8, 9, 2);
      pLight.position.set(px, 1.1, -13.5);
      worldObjects.add(pLight);
    });

    // Floating celestial crystal inside shrine entrance
    const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
    shrineCrystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    shrineCrystalMesh.position.set(0, 5, -15);
    worldObjects.add(shrineCrystalMesh);

    // Glowing inner core of celestial crystal
    const innerCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0xa855f7 }));
    shrineCrystalMesh.add(innerCrystal);

    // D) Maceracılar Loncası (Guild Hall) - Bottom-Left
    const guild = createVoxelBuilding({
      width: 9,
      height: 6.5,
      depth: 9,
      wallColor: 0x334155,
      roofColor: 0x166534,
      roofType: 'hip',
      signText: '⚔️ Maceracılar Loncası'
    });
    guild.position.set(-14, 0, 12);
    worldObjects.add(guild);

    // Quest Notice Board in front of Guild
    worldObjects.add(createNoticeBoard(-8, 9, 0));

    // 6. Street Lamps along crossroads & plazas
    const lampPositions = [
      { x: -5, z: -14 }, { x: 5, z: -14 },
      { x: -5, z: -3 }, { x: 5, z: -3 },
      { x: -5, z: 9 }, { x: 5, z: 9 },
      { x: -5, z: 17 }, { x: 5, z: 17 }
    ];
    lampPositions.forEach(p => worldObjects.add(createStreetLamp(p.x, p.z)));

    // 7. Stone Benches & Flower Beds around Fountain Plaza
    worldObjects.add(createBench(0, -3.2, 0));
    worldObjects.add(createBench(0, 3.2, Math.PI));
    worldObjects.add(createBench(-3.2, 0, Math.PI / 2));
    worldObjects.add(createBench(3.2, 0, -Math.PI / 2));

    worldObjects.add(createFlowerBed(-8, 3, 4, 2));
    worldObjects.add(createFlowerBed(8, 3, 4, 2));
    worldObjects.add(createFlowerBed(-8, -14, 4, 2));
    worldObjects.add(createFlowerBed(8, -14, 4, 2));

    // 8. Cute Wandering Pixel Cats
    worldObjects.add(createPixelCat(11, -1.8, 0xf97316)); // Ginger tabby near tavern
    worldObjects.add(createPixelCat(-2.8, 2.2, 0x0f172a)); // Calico near fountain

    // 9. Procedural Pine Trees around perimeter
    const treePositions = [
      { x: -28, z: -25 }, { x: -25, z: -10 }, { x: -26, z: 8 }, { x: -28, z: 32 },
      { x: 28, z: -25 }, { x: 25, z: -10 }, { x: 26, z: 8 }, { x: 28, z: 32 },
      { x: -10, z: -32 }, { x: 10, z: -32 }, { x: -18, z: 34 }, { x: 18, z: 34 }
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
      wallColor = 0x0284c7;
    } else if (mapId === 'tavern') {
      locName = "Cat's Tail Taverna";
      floorColor = 0x5c3d2e;
      wallColor = 0x78350f;
    } else if (mapId === 'shrine') {
      locName = 'Dilek Tapınağı';
      floorColor = 0x3b0764;
      wallColor = 0x581c87;
    } else if (mapId === 'guild') {
      locName = 'Maceracılar Loncası';
      floorColor = 0x334155;
      wallColor = 0x166534;
    }

    document.getElementById('ui-location').textContent = locName;

    // Room Floor
    const floorGeo = new THREE.PlaneGeometry(28, 22);
    const floorMat = new THREE.MeshLambertMaterial({ color: floorColor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    worldObjects.add(floor);

    // Walls
    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(28, 8, 1), wallMat);
    backWall.position.set(0, 4, -11);
    worldObjects.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 22), wallMat);
    leftWall.position.set(-14, 4, 0);
    worldObjects.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 22), wallMat);
    rightWall.position.set(14, 4, 0);
    worldObjects.add(rightWall);

    // Exit Door Marker at south
    const exitGeo = new THREE.BoxGeometry(4, 0.2, 2);
    const exitMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7 });
    const exitMesh = new THREE.Mesh(exitGeo, exitMat);
    exitMesh.position.set(0, 0.1, 9.5);
    worldObjects.add(exitMesh);

    // Interior Furnishings depending on type
    if (mapId === 'trade_house') {
      // 2 Big Trading Tables
      const tGeo = new THREE.BoxGeometry(6, 1.2, 3);
      const tMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
      const table1 = new THREE.Mesh(tGeo, tMat);
      table1.position.set(-5, 0.6, 0);
      worldObjects.add(table1);

      const table2 = new THREE.Mesh(tGeo, tMat);
      table2.position.set(5, 0.6, 0);
      worldObjects.add(table2);
    } else if (mapId === 'shrine') {
      // Summoning Circle in Center
      const cGeo = new THREE.CylinderGeometry(5, 5, 0.4, 32);
      const cMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true });
      const circle = new THREE.Mesh(cGeo, cMat);
      circle.position.set(0, 0.2, -1);
      worldObjects.add(circle);
    }
  }

  // --- 6. Character Billboard Mesh Creation ---
  function createPlayerMesh(avatarIndex, username, isGuest, primogems) {
    const group = new THREE.Group();

    // 1. Pixel Sprite Plane
    const tex = createAvatarTexture(avatarIndex, 0);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide
    });
    const geo = new THREE.PlaneGeometry(1.8, 2.7);
    const spriteMesh = new THREE.Mesh(geo, mat);
    spriteMesh.position.y = 1.35;
    group.add(spriteMesh);

    // 2. Circular Shadow on Ground
    const shadowGeo = new THREE.CircleGeometry(0.8, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    group.add(shadowMesh);

    // 3. Overhead Nametag Billboard
    const nameTex = createNametagCanvas(username, isGuest, primogems);
    const nameMat = new THREE.SpriteMaterial({ map: nameTex });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(3.2, 0.8, 1);
    nameSprite.position.y = 3.3;
    group.add(nameSprite);

    group.userData = {
      spriteMesh,
      nameSprite,
      avatarIndex,
      frame: 0,
      lastFrameTime: 0,
      bubbleMesh: null
    };

    return group;
  }

  // Attach speech bubble to player
  function showSpeechBubble(playerGroup, text) {
    if (!playerGroup) return;

    // Remove existing
    if (playerGroup.userData.bubbleMesh) {
      playerGroup.remove(playerGroup.userData.bubbleMesh);
      playerGroup.userData.bubbleMesh = null;
    }

    const bTex = createSpeechBubbleCanvas(text);
    const bMat = new THREE.SpriteMaterial({ map: bTex });
    const bSprite = new THREE.Sprite(bMat);
    bSprite.scale.set(4.2, 1.45, 1);
    bSprite.position.y = 4.7;
    playerGroup.add(bSprite);
    playerGroup.userData.bubbleMesh = bSprite;

    // Fade out after 6 seconds
    setTimeout(() => {
      if (playerGroup.userData.bubbleMesh === bSprite) {
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
      updateUIProfile();
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_STATE') {
      updateOtherPlayers(msg.states[currentMap] || []);
    } else if (msg.type === 'WORLD_PLAYER_AUTHED') {
      if (msg.socketId === socketId) {
        myPlayer.username = msg.player.username;
        myPlayer.isGuest = false;
        myPlayer.primogems = msg.player.primogems || myPlayer.primogems;
        updateUIProfile();
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
        const mesh = createPlayerMesh(p.avatarIndex, p.username, p.isGuest, p.primogems);
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
      } else {
        // Update existing player targets
        const entry = otherPlayers.get(p.id);
        entry.targetX = p.x;
        entry.targetZ = p.z;
        entry.targetRot = p.rot;
        entry.anim = p.anim;
        entry.data = p;
        if (p.bubble && (!entry.lastBubble || entry.lastBubble !== p.bubble)) {
          showSpeechBubble(entry.mesh, p.bubble);
          entry.lastBubble = p.bubble;
        }
      }
    }

    // Remove disconnected
    for (const [id, entry] of otherPlayers.entries()) {
      if (!currentIds.has(id)) {
        scene.remove(entry.mesh);
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
    myMesh = createPlayerMesh(myPlayer.avatarIndex, myPlayer.username, myPlayer.isGuest, myPlayer.primogems);
    myMesh.position.set(myPlayer.x, myPlayer.y, myPlayer.z);
    scene.add(myMesh);
  }

  // --- 9. Movement & Proximity Loop ---
  function updateMovement(delta) {
    if (!myMesh) return;

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

      const speed = CONFIG.moveSpeed * delta;
      myPlayer.x += normX * speed;
      myPlayer.z += normZ * speed;
      myPlayer.rot = Math.atan2(normX, normZ);
      myPlayer.anim = 'walk';
    } else {
      myPlayer.anim = 'idle';
    }

    // Map bounds clamping
    const bounds = currentMap === 'town' ? { minX: -40, maxX: 40, minZ: -40, maxZ: 40 } : { minX: -13, maxX: 13, minZ: -10, maxZ: 10 };
    myPlayer.x = Math.max(bounds.minX, Math.min(bounds.maxX, myPlayer.x));
    myPlayer.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, myPlayer.z));

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

    // Check Proximity to Doors or Players
    checkProximity();
  }

  function checkProximity() {
    const prompt = document.getElementById('action-prompt');
    const promptText = document.getElementById('prompt-text');
    nearbyInteractable = null;

    // Check Town Doors
    if (currentMap === 'town') {
      const doors = [
        { id: 'door_trade', name: 'Pazar & Takas Binası', pos: { x: -14, z: -10 } },
        { id: 'door_tavern', name: "Cat's Tail Taverna", pos: { x: 14, z: -10 } },
        { id: 'door_shrine', name: 'Dilek Tapınağı', pos: { x: 0, z: -20 } },
        { id: 'door_guild', name: 'Maceracılar Loncası', pos: { x: -14, z: 12 } }
      ];

      for (const d of doors) {
        const dist = Math.hypot(myPlayer.x - d.pos.x, myPlayer.z - d.pos.z);
        if (dist < 3.2) {
          nearbyInteractable = { type: 'door', data: d };
          promptText.textContent = `[E] ${d.name}'na Gir`;
          prompt.classList.remove('hidden');
          return;
        }
      }
    } else {
      // Check Exit Door
      const dist = Math.hypot(myPlayer.x - 0, myPlayer.z - 9.5);
      if (dist < 3.0) {
        nearbyInteractable = { type: 'door', data: { name: 'Kasaba Meydanı' } };
        promptText.textContent = `[E] Meydana Çık`;
        prompt.classList.remove('hidden');
        return;
      }
    }

    // Check Nearby Players for Trade
    for (const [id, entry] of otherPlayers.entries()) {
      const dist = Math.hypot(myPlayer.x - entry.mesh.position.x, myPlayer.z - entry.mesh.position.z);
      if (dist < 2.8) {
        nearbyInteractable = { type: 'player', data: entry.data };
        promptText.textContent = `[E] @${entry.data.username} ile Takas Yap`;
        prompt.classList.remove('hidden');
        return;
      }
    }

    prompt.classList.add('hidden');
  }

  function triggerInteract() {
    if (!nearbyInteractable) return;

    if (nearbyInteractable.type === 'door') {
      playBeep(520, 'triangle', 0.15);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'WORLD_DOOR_INTERACT' }));
      }
    } else if (nearbyInteractable.type === 'player') {
      playBeep(659, 'sine', 0.15);
      sendTradeRequest(nearbyInteractable.data.username);
    }
  }

  function triggerDoorWipe(targetMap) {
    const wipe = document.getElementById('screen-wipe');
    wipe.classList.add('active');

    setTimeout(() => {
      if (targetMap === 'town') {
        buildTownMap();
        myPlayer.x = 0;
        myPlayer.z = 4;
      } else {
        buildInteriorMap(targetMap);
        myPlayer.x = 0;
        myPlayer.z = 6;
      }
      updateMyMesh();
      setTimeout(() => wipe.classList.remove('active'), 150);
    }, 350);
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

    const scale = currentMap === 'town' ? 1.4 : 3.8;
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
      ctx.fillRect(cx + (-14 - myPlayer.x) * scale - 6, cy + (-10 - myPlayer.z) * scale - 6, 12, 12); // Trade Mart
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(cx + (14 - myPlayer.x) * scale - 6, cy + (-10 - myPlayer.z) * scale - 6, 12, 12); // Tavern
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(cx + (0 - myPlayer.x) * scale - 7, cy + (-20 - myPlayer.z) * scale - 7, 14, 14); // Shrine
      ctx.fillStyle = '#166534';
      ctx.fillRect(cx + (-14 - myPlayer.x) * scale - 6, cy + (12 - myPlayer.z) * scale - 6, 12, 12); // Guild
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
      const pCtx = previewCvs.getContext('2d');
      pCtx.clearRect(0, 0, 48, 48);
      const avTex = createAvatarTexture(myPlayer.avatarIndex, 0);
      pCtx.drawImage(avTex.image, 0, 0, 48, 48);
    }
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

    AVATAR_PALETTES.forEach((p, idx) => {
      const btn = document.createElement('button');
      btn.className = `avatar-choice-btn ${myPlayer.avatarIndex === idx ? 'selected' : ''}`;
      const avCanvas = document.createElement('canvas');
      avCanvas.width = 32;
      avCanvas.height = 48;
      avCanvas.className = 'avatar-choice-canvas';
      const aCtx = avCanvas.getContext('2d');
      const tex = createAvatarTexture(idx, 0);
      aCtx.drawImage(tex.image, 0, 0, 32, 48);

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

  // --- 13. Event Listeners ---
  function initEvents() {
    // Keyboard Input
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const k = e.key.toLowerCase();
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
    document.getElementById('btn-open-auth').onclick = () => openModal('modal-auth');
    document.getElementById('btn-change-avatar').onclick = () => openModal('modal-avatar');

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

    // Mobile Virtual Joystick Touch Handling
    setupMobileJoystick();

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

    // Interpolate other players
    for (const entry of otherPlayers.values()) {
      entry.mesh.position.x += (entry.targetX - entry.mesh.position.x) * CONFIG.posLerp;
      entry.mesh.position.z += (entry.targetZ - entry.mesh.position.z) * CONFIG.posLerp;
      entry.mesh.rotation.y += (entry.targetRot - entry.mesh.rotation.y) * CONFIG.rotLerp;
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

        if (p.mesh.position.y <= 1.05) {
          p.mesh.position.set(0, 1.8, 0);
          p.vx = (Math.random() - 0.5) * 1.4;
          p.vy = 2.0 + Math.random() * 1.6;
          p.vz = (Math.random() - 0.5) * 1.4;
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

    // Render Minimap
    renderMinimap();

    // Render 3D Scene
    renderer.render(scene, camera);
  }

  // --- Bootstrap ---
  window.addEventListener('DOMContentLoaded', () => {
    initThree();
    updateMyMesh();
    updateUIProfile();
    initWebSocket();
    initEvents();
    animate();
  });
})();
