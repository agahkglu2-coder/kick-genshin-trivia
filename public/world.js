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
    sprite.position.y = 3.3;
    return sprite;
  }

  function createNPCBillboard(avatarIndex, name, title, x, z) {
    const group = new THREE.Group();

    const tex = createAvatarTexture(avatarIndex, 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const spriteMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.7), mat);
    spriteMesh.position.y = 1.35;
    group.add(spriteMesh);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    group.add(createNPCNametag(name, title));
    group.position.set(x, 0, z);
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
    worldObjects.add(createNPCBillboard(1, '🐱 Diona', 'Baş Barmen & Kedi İksir Ustası', 10.5, -2.5));

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
    worldObjects.add(createNPCBillboard(2, '✨ Yae Miko', 'Baş Rahibe & Kader Danışmanı', 3.0, -4.5));

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
    worldObjects.add(createNPCBillboard(3, 'Katheryne', 'Maceracılar Loncası Katibi', -8.5, -6.8));

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

    // 2. Wide Cobblestone Crossroads with Curbs (88m Grand Avenues)
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

    // Secondary Paved Building Branches (Direct paved plazas to each quarter)
    const branchTex = createProceduralCobbleTexture(6, 2);
    const branchMat = new THREE.MeshLambertMaterial({ map: branchTex });

    // Trade Mart Branch (West-North)
    const bTrade = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), branchMat);
    bTrade.rotation.x = -Math.PI / 2;
    bTrade.position.set(-15, 0.022, -10);
    bTrade.receiveShadow = true;
    worldObjects.add(bTrade);

    // Taverna Branch (East-North)
    const bTavern = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), branchMat);
    bTavern.rotation.x = -Math.PI / 2;
    bTavern.position.set(15, 0.022, -10);
    bTavern.receiveShadow = true;
    worldObjects.add(bTavern);

    // Guild Branch (West-South)
    const bGuild = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), branchMat);
    bGuild.rotation.x = -Math.PI / 2;
    bGuild.position.set(-15, 0.022, 10);
    bGuild.receiveShadow = true;
    worldObjects.add(bGuild);

    // Gazebo Park Branch (East-South)
    const bGazebo = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), branchMat);
    bGazebo.rotation.x = -Math.PI / 2;
    bGazebo.position.set(15, 0.022, 10);
    bGazebo.receiveShadow = true;
    worldObjects.add(bGazebo);

    // Stone Curb Lines along the main avenues
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    [-4.1, 4.1].forEach(offset => {
      const curbX = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 88), curbMat);
      curbX.position.set(offset, 0.08, 0);
      curbX.receiveShadow = true;
      worldObjects.add(curbX);

      const curbZ = new THREE.Mesh(new THREE.BoxGeometry(88, 0.15, 0.25), curbMat);
      curbZ.position.set(0, 0.08, offset);
      curbZ.receiveShadow = true;
      worldObjects.add(curbZ);
    });

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

    // 9. Procedural Pine Trees around perimeter
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
    const bounds = currentMap === 'town' ? { minX: -44, maxX: 44, minZ: -44, maxZ: 44 } : { minX: -15, maxX: 15, minZ: -11, maxZ: 11 };
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

    // Check Town Doors
    if (currentMap === 'town') {
      const doors = [
        { id: 'door_trade', name: 'Pazar & Takas Binası', pos: { x: -24, z: -10.0 } },
        { id: 'door_tavern', name: "Cat's Tail Taverna", pos: { x: 24, z: -10.0 } },
        { id: 'door_shrine', name: 'Dilek Tapınağı', pos: { x: 0, z: -26.0 } },
        { id: 'door_guild', name: 'Maceracılar Loncası', pos: { x: -24, z: 10.0 } }
      ];

      for (const d of doors) {
        const dist = Math.hypot(myPlayer.x - d.pos.x, myPlayer.z - d.pos.z);
        if (dist < 4.2) {
          nearbyInteractable = { type: 'door', data: d };
          promptText.textContent = `[E] ${d.name}'na Gir`;
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
        if (dNpc < 3.2) {
          nearbyInteractable = { type: 'npc_trade', name: 'Tüccar Liben' };
          promptText.textContent = `[E] Tüccar Liben: Pazar & Takas`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'tavern') {
        const dNpc = Math.hypot(myPlayer.x - 7.5, myPlayer.z - (-2.5));
        if (dNpc < 3.2) {
          nearbyInteractable = { type: 'npc_tavern', name: 'Diona' };
          promptText.textContent = `[E] Diona: Özel Kedi Kokteyli İste`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'shrine') {
        const dNpc = Math.hypot(myPlayer.x - 0, myPlayer.z - (-3.0));
        if (dNpc < 3.5) {
          nearbyInteractable = { type: 'npc_shrine', name: 'Kader Sunağı' };
          promptText.textContent = `[E] Kader Sunağı: Yıldız Dileği Çek`;
          prompt.classList.remove('hidden');
          return;
        }
      } else if (currentMap === 'guild') {
        const dNpc = Math.hypot(myPlayer.x - (-8.5), myPlayer.z - (-4.5));
        if (dNpc < 3.2) {
          nearbyInteractable = { type: 'npc_guild', name: 'Katheryne' };
          promptText.textContent = `[E] Katheryne: Seferler & Görevler`;
          prompt.classList.remove('hidden');
          return;
        }
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
    } else if (nearbyInteractable.type && nearbyInteractable.type.startsWith('npc_')) {
      playBeep(659, 'sine', 0.15);
      if (nearbyInteractable.type === 'npc_trade') {
        addChatMessage('Tüccar Liben', '💰 "Hoş geldin dostum! Meydanda diğer gezginlerle [E] tuşuna basarak eşya ve Primogem takası yapabilirsin!"');
      } else if (nearbyInteractable.type === 'npc_tavern') {
        addChatMessage('Diona', '🐱 "Hıh! Şarap sarhoşlarına inat sana özel ferahlatıcı kurbağaotu kokteyli hazırlayabilirim!"');
      } else if (nearbyInteractable.type === 'npc_shrine') {
        addChatMessage('Kader Sunağı', '✨ "Yıldızlar fısıldıyor! Sohbet kutusuna !wish veya !wish10 yazarak hemen kader dileği çekebilirsin! (160 💎)"');
      } else if (nearbyInteractable.type === 'npc_guild') {
        addChatMessage('Katheryne', '⚔️ "Yıldızlara ve derinliklere doğru! Kedi madenci ve balıkçı seferleri için /expeditions panelini açabilirsin."');
      }
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
