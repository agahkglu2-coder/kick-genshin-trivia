/**
 * Pixel Chatter - Render Integrated OBS Livestream Overlay Engine
 * 60 FPS HTML5 Canvas engine with 20 distinct living pixel avatars.
 */

(function () {
  'use strict';

  const canvas = document.getElementById('overlay-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Global Config with defaults
  const config = {
    scale: 3.2,
    groundY: 920,
    groundDepth: 60,
    moveSpeed: 1.0,
    fontSizeMultiplier: 1.35,
    despawnTimeout: 900, // seconds (15 minutes)
    maxChatters: 45,
    chatBubbleDuration: 5.5,
    showNameplates: true,
    showShadows: true,
    enableInteractions: true,
    enableCommands: true,
    enableBossOverlay: true,
    vipOverrides: {},
  };

  // State
  let currentCrownWinner = null;
  let avatarRegistry = [];
  const loadedSprites = {};
  const loadedExpeditionAssets = {};
  const activeExpeditions = new Map();
  const chatters = new Map();
  const particles = [];
  let lastTimestamp = 0;
  let socket = null;
  let activeBoss = null;
  let screenShake = 0;

  const DOCK_SLOTS = [
    { x: 175, y: 905 },
    { x: 215, y: 905 },
    { x: 145, y: 905 },
    { x: 255, y: 905 },
    { x: 195, y: 890 },
    { x: 160, y: 890 },
    { x: 235, y: 890 }
  ];

  const MINE_SLOTS = [
    { x: 1680, y: 905 },
    { x: 1635, y: 905 },
    { x: 1720, y: 905 },
    { x: 1595, y: 905 },
    { x: 1660, y: 890 },
    { x: 1615, y: 890 },
    { x: 1700, y: 890 }
  ];

  function getExpeditionSlot(type, index) {
    const slots = type === 'fishing' ? DOCK_SLOTS : MINE_SLOTS;
    return slots[index % slots.length];
  }

  function getUserSlotIndex(username) {
    if (!username) return 0;
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = (hash << 5) - hash + username.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  async function loadExpeditionAssets() {
    const assets = [
      { key: 'cat_fisherman', src: '/assets/expeditions/cat_fisherman.png' },
      { key: 'cat_miner', src: '/assets/expeditions/cat_miner.png' }
    ];
    await Promise.all(assets.map(item => new Promise(resolve => {
      const img = new Image();
      img.src = item.src;
      img.onload = () => { loadedExpeditionAssets[item.key] = img; resolve(); };
      img.onerror = () => { resolve(); };
    })));
    console.log(`[PixelChatter] Loaded ${Object.keys(loadedExpeditionAssets).length} expedition character assets.`);
  }

  function renderExpeditionZones(ctx) {
    const time = Date.now() / 1000;
    const gy = config.groundY;

    // ==========================================
    // 1. BALIKÇI İSKELESİ & GÖL (SOL TARAF, x: 0 - 340)
    // ==========================================
    ctx.save();

    // A) Mavi Göl Suyu (x: 0 - 110, y: gy - 20 .. gy + 75)
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, gy - 20, 110, 95);

    // Su Üst Yüzeyi (Açık Camgöbeği)
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, gy - 20, 110, 12);

    // Su Tabanı Koyu Gölge
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, gy + 55, 110, 20);

    // Dış Piksel Kenarlık
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(110, gy - 20);
    ctx.lineTo(110, gy + 75);
    ctx.lineTo(0, gy + 75);
    ctx.stroke();

    // Canlı Piksel Köpük Dalgaları (Animasyonlu)
    const wavePhase = (time * 1.5) % 1;
    ctx.fillStyle = '#ffffff';
    // Dalga 1
    const w1x = wavePhase * 50;
    ctx.fillRect(10 + w1x, gy - 16, 28, 3);
    ctx.fillRect(14 + w1x, gy - 13, 20, 2);
    // Dalga 2
    ctx.fillRect(60 - wavePhase * 30, gy - 10, 24, 3);
    // Dalga 3
    ctx.fillRect(20 + ((time * 25) % 65), gy + 12, 18, 2);

    // Dinamik Halka Dalgacıkları
    const ripRad = 8 + ((time * 20) % 25);
    const ripAlpha = Math.max(0, 1 - ripRad / 25);
    ctx.strokeStyle = `rgba(255, 255, 255, ${ripAlpha * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(55, gy - 6, ripRad, ripRad * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Yüzen Kırmızı-Beyaz Balıkçı Şamandırası (Bobber)
    const bobY = gy - 6 + Math.sin(time * 3.5) * 4;
    const bobX = 55;
    ctx.save();
    // Şamandıra gölgesi
    ctx.fillStyle = 'rgba(2, 6, 23, 0.4)';
    ctx.beginPath();
    ctx.ellipse(bobX, gy - 1, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Alt Yarım (Beyaz)
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bobX, bobY, 6, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    // Üst Yarım (Parlak Kırmızı)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(bobX, bobY, 6, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Anten Çubuğu
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bobX, bobY - 6);
    ctx.lineTo(bobX, bobY - 12);
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(bobX - 1.5, bobY - 14, 3, 3);
    ctx.restore();

    // B) İskele Destek Ayakları (Pillars)
    const pillars = [125, 195, 265];
    for (const px of pillars) {
      ctx.fillStyle = '#451a03';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(px, gy - 12, 14, 87);
      ctx.strokeRect(px, gy - 12, 14, 87);
      ctx.fillStyle = '#290e02';
      ctx.fillRect(px + 4, gy - 10, 3, 80);
    }
    // Çapraz Destek Kirişi
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(125, gy + 35);
    ctx.lineTo(275, gy + 15);
    ctx.stroke();

    // C) İskele Güvertesi Tahtaları (Deck Planks: x: 100 - 335, y: gy - 20 .. gy + 12)
    ctx.fillStyle = '#92400e';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(100, gy - 20, 235, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Tahta Üst Yüzey Işık Vurgusu
    ctx.fillStyle = '#b45309';
    ctx.fillRect(102, gy - 18, 231, 10);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(102, gy - 18, 231, 3);

    // Tahta Aralık Çizgileri ve Çiviler
    for (let px = 126; px < 330; px += 26) {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(px, gy - 19, 2.5, 28);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px - 6, gy - 14, 2, 2);
      ctx.fillRect(px - 6, gy + 4, 2, 2);
    }

    // Mini Balık Kovası
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(108, gy - 36, 16, 18);
    ctx.strokeRect(108, gy - 36, 16, 18);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(106, gy - 38, 20, 4);
    ctx.font = '12px serif';
    ctx.fillText('🐟', 106, gy - 36);

    // D) Fener Direği & Asılı Sıcak Gaz Lambası (Lantern Post)
    const poleX = 318;
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.fillRect(poleX, gy - 150, 10, 134);
    ctx.strokeRect(poleX, gy - 150, 10, 134);
    ctx.fillRect(poleX - 30, gy - 146, 35, 8);
    ctx.strokeRect(poleX - 30, gy - 146, 35, 8);
    ctx.beginPath();
    ctx.moveTo(poleX - 22, gy - 138);
    ctx.lineTo(poleX, gy - 116);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Asılı Fener
    const lanternSway = Math.sin(time * 2.2) * 2;
    const lX = poleX - 25 + lanternSway;
    const lY = gy - 132;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(poleX - 25, gy - 138);
    ctx.lineTo(lX, lY);
    ctx.stroke();

    // Fener Işığı Halesi
    const lanternGlow = ctx.createRadialGradient(lX, lY + 12, 4, lX, lY + 12, 55);
    lanternGlow.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
    lanternGlow.addColorStop(0.7, 'rgba(245, 158, 11, 0.15)');
    lanternGlow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = lanternGlow;
    ctx.beginPath();
    ctx.arc(lX, lY + 12, 55, 0, Math.PI * 2);
    ctx.fill();

    // Fener Gövdesi
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(lX - 7, lY, 14, 18);
    ctx.strokeRect(lX - 7, lY, 14, 18);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(lX - 9, lY - 4, 18, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(lX - 3, lY + 4, 6, 8);

    // E) Ahşap Oyma Alan Başlığı
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(250, gy - 175, 145, 26, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 12px "Fredoka", "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎣 BALIKÇI İSKELESİ', 322, gy - 162);

    ctx.restore();

    // ==========================================
    // 2. KRİSTAL MADENİ & MAĞARA (SAĞ TARAF, x: 1620 - 1920)
    // ==========================================
    ctx.save();
    const pulse = (Math.sin(time * 2.5) + 1) * 0.5;

    // A) Taş Mağara Girişi & Kayalık (Cliff & Cavern)
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1720, gy + 75);
    ctx.lineTo(1690, gy + 10);
    ctx.lineTo(1715, gy - 65);
    ctx.lineTo(1760, gy - 130);
    ctx.lineTo(1830, gy - 148);
    ctx.lineTo(1920, gy - 130);
    ctx.lineTo(1920, gy + 75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Kaya Gölge ve Işık Katmanları
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(1760, gy - 130);
    ctx.lineTo(1830, gy - 148);
    ctx.lineTo(1850, gy - 120);
    ctx.lineTo(1790, gy - 90);
    ctx.closePath();
    ctx.fill();

    // Karanlık Mağara Boşluğu (Cavern Depth)
    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(1770, gy + 50);
    ctx.lineTo(1750, gy - 25);
    ctx.lineTo(1785, gy - 95);
    ctx.lineTo(1860, gy - 85);
    ctx.lineTo(1885, gy + 50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ahşap Maden Destek Kirişleri (Mine Timbers)
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.fillRect(1744, gy - 100, 12, 120);
    ctx.strokeRect(1744, gy - 100, 12, 120);
    ctx.fillRect(1740, gy - 105, 130, 12);
    ctx.strokeRect(1740, gy - 105, 130, 12);
    ctx.fillRect(1860, gy - 100, 12, 120);
    ctx.strokeRect(1860, gy - 100, 12, 120);

    // B) Parıldayan Büyülü Kristal Haleleri (Ambient Glow)
    const crysGlow = ctx.createRadialGradient(1820, gy - 40, 15, 1820, gy - 40, 95);
    crysGlow.addColorStop(0, `rgba(192, 132, 252, ${0.40 + pulse * 0.20})`);
    crysGlow.addColorStop(0.5, `rgba(56, 189, 248, ${0.20 + pulse * 0.10})`);
    crysGlow.addColorStop(1, 'rgba(192, 132, 252, 0)');
    ctx.fillStyle = crysGlow;
    ctx.beginPath();
    ctx.arc(1820, gy - 40, 95, 0, Math.PI * 2);
    ctx.fill();

    // C) DEV KRİSTALLER (Towering 65px - 105px Tall!)
    // 1. Kristal: Dev Mor Ametist (Orta, Yükseklik 105px)
    ctx.save();
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 18 + pulse * 14;
    ctx.fillStyle = '#7e22ce';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1822, gy - 105);
    ctx.lineTo(1805, gy - 25);
    ctx.lineTo(1812, gy + 15);
    ctx.lineTo(1822, gy + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(1822, gy - 105);
    ctx.lineTo(1822, gy + 18);
    ctx.lineTo(1838, gy + 15);
    ctx.lineTo(1842, gy - 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(1822, gy - 105);
    ctx.lineTo(1822, gy + 18);
    ctx.stroke();
    ctx.restore();

    // 2. Kristal: Büyük Camgöbeği Mana Kristali (Sol, Yükseklik 75px)
    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12 + pulse * 10;
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1785, gy - 75);
    ctx.lineTo(1770, gy - 20);
    ctx.lineTo(1778, gy + 8);
    ctx.lineTo(1786, gy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(1785, gy - 75);
    ctx.lineTo(1786, gy + 12);
    ctx.lineTo(1800, gy + 6);
    ctx.lineTo(1802, gy - 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Kristal: Parlak Altın Kehribar Kristali (Sağ, Yükseklik 62px)
    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10 + pulse * 8;
    ctx.fillStyle = '#ca8a04';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1858, gy - 62);
    ctx.lineTo(1846, gy - 15);
    ctx.lineTo(1852, gy + 8);
    ctx.lineTo(1860, gy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(1858, gy - 62);
    ctx.lineTo(1860, gy + 10);
    ctx.lineTo(1872, gy + 6);
    ctx.lineTo(1874, gy - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Kristal Uçlarındaki Pırıltı Yıldızları (Glint Stars)
    const glintCycle = (Math.sin(time * 4.0) + 1) * 0.5;
    if (glintCycle > 0.3) {
      ctx.save();
      ctx.translate(1822, gy - 105);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
      const gs = 3.5 + glintCycle * 3.5;
      ctx.beginPath();
      ctx.moveTo(0, -gs);
      ctx.lineTo(gs * 0.3, 0);
      ctx.lineTo(0, gs);
      ctx.lineTo(-gs * 0.3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // D) Taş/Ahşap Oyma Alan Başlığı
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1710, gy - 185, 150, 26, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f3e8ff';
    ctx.font = 'bold 12px "Fredoka", "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛏️ KRİSTAL MADENİ', 1785, gy - 172);

    ctx.restore();
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randChoice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Preload all avatars and frames
  async function loadAvatars() {
    try {
      const res = await fetch('/assets/avatars/avatars.json');
      avatarRegistry = await res.json();
    } catch (e) {
      console.warn('Failed to fetch /assets/avatars/avatars.json:', e);
      avatarRegistry = [];
      for (let i = 1; i <= 20; i++) {
        const id = 'avatar_' + (i < 10 ? '0' + i : i);
        avatarRegistry.push({
          id: id,
          name: 'Avatar ' + i,
          folder: id,
          portrait: 'portrait.png',
          frames: {
            portrait: 'portrait.png',
            idle: ['idle_0.png'],
            walk_right: ['walk_right_0.png', 'walk_right_1.png'],
            walk_left: ['walk_left_0.png', 'walk_left_1.png'],
            run: ['run_0.png'],
            jump: ['jump_0.png', 'jump_1.png'],
            emote: ['emote_0.png'],
            sit_sleep: ['sit_sleep_0.png'],
          },
        });
      }
    }

    const promises = [];
    for (const av of avatarRegistry) {
      const folder = av.folder || av.id;
      const allFiles = [
        'portrait.png',
        'idle_0.png',
        'walk_right_0.png',
        'walk_right_1.png',
        'walk_left_0.png',
        'walk_left_1.png',
        'run_0.png',
        'jump_0.png',
        'jump_1.png',
        'emote_0.png',
        'sit_sleep_0.png',
      ];
      for (const fn of allFiles) {
        const key = `${folder}/${fn}`;
        const img = new Image();
        img.src = `/assets/avatars/${key}`;
        promises.push(
          new Promise((resolve) => {
            img.onload = () => {
              loadedSprites[key] = img;
              resolve();
            };
            img.onerror = () => {
              resolve();
            };
          })
        );
      }
    }
    await Promise.all(promises);
    console.log(`[PixelChatter] Loaded ${Object.keys(loadedSprites).length} sprite images.`);
  }

  // Particle Class
  class Particle {
    constructor(x, y, vx, vy, type, options = {}) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.type = type; // "heart", "star", "confetti", "coin", "sleep_z", "dust", "meteor", "slime_glob", "void_meteor", "hero_proj", "damage_text", "shockwave", "spark"
      this.life = options.life || rand(1.0, 2.5);
      this.maxLife = this.life;
      this.color = options.color || '#ff4f81';
      this.size = options.size || rand(4, 7);
      this.gravity = options.gravity !== undefined ? options.gravity : 150;
      this.bounce = options.bounce || 0;
      this.text = options.text || 'z';
      this.rot = rand(0, Math.PI * 2);
      this.vrot = rand(-4, 4);
      this.targetX = options.targetX || 0;
      this.targetY = options.targetY || 0;
      this.onImpact = options.onImpact || null;
      this.element = options.element || 'Pyro';
      this.trailTimer = 0;
    }

    update(dt) {
      this.life -= dt;
      this.trailTimer += dt;

      if (this.type === 'hero_proj') {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 40 || this.life <= 0) {
          this.life = 0;
          if (this.onImpact) this.onImpact();
          return;
        }
        const speed = 1400;
        this.x += (dx / dist) * speed * dt;
        this.y += (dy / dist) * speed * dt;
        return;
      }

      if (this.type === 'damage_text') {
        this.y += this.vy * dt;
        return;
      }

      if (this.type === 'shockwave') {
        this.size += dt * 220;
        return;
      }

      if (this.type === 'meteor' || this.type === 'slime_glob' || this.type === 'void_meteor') {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rot += this.vrot * dt;

        // Trail spark
        if (this.trailTimer > 0.04) {
          this.trailTimer = 0;
          const trailColor = this.type === 'meteor' ? '#f97316' : this.type === 'slime_glob' ? '#38bdf8' : '#a855f7';
          particles.push(new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-20, 20), rand(-20, 20), 'spark', {
            color: trailColor,
            size: rand(3, 6),
            life: 0.25
          }));
        }

        if (this.y >= config.groundY - rand(0, 35)) {
          this.life = 0;
          onCalamityImpact(this);
        }
        return;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.gravity * dt;
      this.rot += this.vrot * dt;

      if (this.bounce > 0 && this.y >= config.groundY) {
        this.y = config.groundY;
        this.vy = -this.vy * this.bounce;
        this.vx *= 0.7;
      }
    }

    render(ctx) {
      const alpha = Math.max(0, Math.min(1, this.life / (this.maxLife * 0.3)));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);

      if (this.type === 'confetti') {
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size, -this.size / 2, this.size * 2, this.size);
      } else if (this.type === 'coin') {
        ctx.rotate(this.rot);
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (this.type === 'star') {
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        const s = this.size;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.3, -s * 0.3);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.3, s * 0.3);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fill();
      } else if (this.type === 'heart') {
        ctx.fillStyle = this.color;
        const s = this.size;
        ctx.beginPath();
        ctx.arc(-s / 2, -s / 2, s / 2, Math.PI, 0, false);
        ctx.arc(s / 2, -s / 2, s / 2, Math.PI, 0, false);
        ctx.lineTo(0, s * 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (this.type === 'sleep_z') {
        ctx.fillStyle = '#a0c4ff';
        ctx.font = `bold ${Math.round(this.size * 2)}px 'Press Start 2P', monospace`;
        ctx.fillText(this.text, 0, 0);
      } else if (this.type === 'dust') {
        ctx.fillStyle = 'rgba(230, 235, 245, 0.7)';
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'note') {
        ctx.fillStyle = this.color || '#ff70a6';
        ctx.font = `bold ${Math.round(this.size * 2.2)}px sans-serif`;
        ctx.fillText(this.text || '🎵', 0, 0);
      } else if (this.type === 'primo') {
        ctx.rotate(this.rot);
        const s = this.size;
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.75, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.75, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.6);
        ctx.lineTo(s * 0.45, 0);
        ctx.lineTo(0, s * 0.6);
        ctx.lineTo(-s * 0.45, 0);
        ctx.closePath();
        ctx.fill();
      } else if (this.type === 'spark') {
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      } else if (this.type === 'meteor') {
        ctx.rotate(this.rot);
        const rad = this.size;
        const grad = ctx.createRadialGradient(0, 0, rad * 0.2, 0, 0, rad);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#facc15');
        grad.addColorStop(0.7, '#ea580c');
        grad.addColorStop(1, '#7c2d12');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#ea580c';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'slime_glob') {
        ctx.rotate(this.rot);
        const rad = this.size;
        const grad = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, rad * 0.1, 0, 0, rad);
        grad.addColorStop(0, '#bae6fd');
        grad.addColorStop(0.4, '#38bdf8');
        grad.addColorStop(1, '#0369a1');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'void_meteor') {
        ctx.rotate(this.rot);
        const rad = this.size;
        const grad = ctx.createRadialGradient(0, 0, rad * 0.2, 0, 0, rad);
        grad.addColorStop(0, '#e9d5ff');
        grad.addColorStop(0.4, '#a855f7');
        grad.addColorStop(1, '#3b0764');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'shockwave') {
        ctx.strokeStyle = this.color || '#ea580c';
        ctx.lineWidth = Math.max(1, (1 - this.life / this.maxLife) * 8);
        ctx.beginPath();
        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (this.type === 'hero_proj') {
        const s = this.size || 10;
        ctx.fillStyle = this.color || '#ffd700';
        ctx.shadowColor = this.color || '#ffd700';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === 'damage_text') {
        ctx.font = `bold ${Math.round(this.size)}px Cinzel, Nunito, sans-serif`;
        ctx.fillStyle = this.color || '#facc15';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 4;
        ctx.textAlign = 'center';
        ctx.strokeText(this.text, 0, 0);
        ctx.fillText(this.text, 0, 0);
      }

      ctx.restore();
    }
  }

  function spawnBurst(x, y, type, count = 12, options = {}) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(options.minSpeed || 60, options.maxSpeed || 240);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (options.upwardBias || 60);
      particles.push(new Particle(x, y, vx, vy, type, options));
    }
  }

  // Visual Helper: Handcrafted Pixel Crown for Trivia Champions
  function renderCrown(ctx, x, y, scale, animTimer) {
    const floatY = Math.sin(animTimer * 4.5) * 3.5;
    ctx.save();
    ctx.translate(x, y + floatY);

    const cw = 18 * (scale / 2.5);
    const ch = 11 * (scale / 2.5);

    // Golden halo glow behind crown
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;

    // Crown Body
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(-cw / 2, 0);
    ctx.lineTo(-cw / 2, -ch * 0.7);
    ctx.lineTo(-cw * 0.25, -ch * 0.35);
    ctx.lineTo(0, -ch);
    ctx.lineTo(cw * 0.25, -ch * 0.35);
    ctx.lineTo(cw / 2, -ch * 0.7);
    ctx.lineTo(cw / 2, 0);
    ctx.closePath();
    ctx.fill();

    // Crown Base Rim
    ctx.fillStyle = '#fb8500';
    ctx.fillRect(-cw / 2, -ch * 0.18, cw, ch * 0.22);

    // Center Ruby Gem
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ef233c';
    ctx.beginPath();
    ctx.arc(0, -ch * 0.45, 2.5 * (scale / 2.5), 0, Math.PI * 2);
    ctx.fill();

    // Diamond Jewels on Crown Tips
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-cw / 2 - 1, -ch * 0.8, 2, 2);
    ctx.fillRect(-1, -ch - 1, 2, 2);
    ctx.fillRect(cw / 2 - 1, -ch * 0.8, 2, 2);

    ctx.restore();
  }

  // Visual Helper: 5★ Golden Starlight Aura (Genshin Style)
  function renderGoldenAura(ctx, x, y, scale, animTimer) {
    ctx.save();
    ctx.translate(x, y - 16 * scale);

    const pulse = 1.0 + Math.sin(animTimer * 5.0) * 0.12;
    const rad = 32 * scale * pulse;
    const grad = ctx.createRadialGradient(0, 0, rad * 0.2, 0, 0, rad);
    grad.addColorStop(0, 'rgba(255, 215, 0, 0.45)');
    grad.addColorStop(0.65, 'rgba(251, 191, 36, 0.18)');
    grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();

    // 4 Orbiting Starlight Diamonds
    const starCount = 4;
    for (let i = 0; i < starCount; i++) {
      const ang = animTimer * 2.5 + (i * Math.PI * 2) / starCount;
      const sx = Math.cos(ang) * (22 * scale);
      const sy = Math.sin(ang) * (14 * scale);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(animTimer * 4.0);
      ctx.fillStyle = '#fff475';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6;
      const ss = 4.5 * (scale / 2.5);
      ctx.beginPath();
      ctx.moveTo(0, -ss);
      ctx.lineTo(ss * 0.4, 0);
      ctx.lineTo(0, ss);
      ctx.lineTo(-ss * 0.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Visual Helper: Mini Reaction Icon Bubble
  function renderReactionBubble(ctx, icon, x, y) {
    if (!icon) return;
    ctx.save();
    ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    const bw = 32;
    const bh = 30;
    const bx = x - bw / 2;
    const by = y - bh;

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(x - 4, by + bh);
    ctx.lineTo(x, by + bh + 5);
    ctx.lineTo(x + 4, by + bh);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, by + bh / 2 + 1);
    ctx.restore();
  }

  // Primogem Rain Event: 35 falling primogems and all chatters jump
  function triggerPrimoRain(count = 35) {
    for (let i = 0; i < count; i++) {
      const px = rand(80, 1840);
      const py = rand(-350, -30);
      const vx = rand(-35, 35);
      const vy = rand(140, 280);
      particles.push(
        new Particle(px, py, vx, vy, 'primo', {
          size: rand(7, 12),
          life: rand(4.0, 6.5),
          gravity: 50,
          bounce: 0.35
        })
      );
    }

    let delay = 0;
    for (const ch of chatters.values()) {
      setTimeout(() => {
        ch.triggerJump(rand(300, 400));
        ch.reactionIcon = '✨';
        ch.reactionTimer = 2.5;
        ch.triggerEmote(2.5);
      }, delay);
      delay += rand(100, 250);
    }
  }

  // Boss Calamity & Combat Effects
  function onCalamityImpact(p) {
    screenShake = Math.max(screenShake, 16);

    // Shockwave ring
    particles.push(new Particle(p.x, p.y, 0, 0, 'shockwave', {
      color: p.color || '#ea580c',
      size: 15,
      life: 0.45
    }));

    // Explosion burst of sparks and smoke
    spawnBurst(p.x, p.y, 'spark', 16, {
      color: p.color || '#f97316',
      minSpeed: 80,
      maxSpeed: 280,
      gravity: 200,
      size: rand(4, 7),
      life: 0.6
    });

    spawnBurst(p.x, p.y, 'dust', 8, {
      minSpeed: 40,
      maxSpeed: 140,
      size: rand(5, 10),
      gravity: 50,
      life: 0.8
    });

    // Knockback nearby chatters!
    for (const ch of chatters.values()) {
      const dx = ch.x - p.x;
      const dist = Math.abs(dx);
      if (dist < 140) {
        const dir = dx >= 0 ? 1 : -1;
        ch.vx += dir * rand(120, 220);
        ch.triggerJump(rand(340, 440));
        ch.reactionTimer = 2.0;
        if (p.element === 'Pyro') ch.reactionIcon = '🔥';
        else if (p.element === 'Hydro') ch.reactionIcon = '🧪';
        else if (p.element === 'Void') ch.reactionIcon = '💫';
        else if (p.element === 'Electro') ch.reactionIcon = '⚡';
        else ch.reactionIcon = '💥';
        ch.triggerEmote(1.5);
      }
    }
  }

  function spawnCalamityProjectile(boss) {
    if (!boss) return;
    const element = boss.element;
    const px = rand(150, 1770);
    const py = rand(-80, -30);
    const vx = rand(-60, 60);
    const vy = rand(460, 700);

    if (element === 'Pyro') {
      particles.push(new Particle(px, py, vx, vy, 'meteor', {
        size: rand(18, 28),
        life: 3.5,
        gravity: 0,
        element: 'Pyro',
        color: '#f97316'
      }));
    } else if (element === 'Hydro') {
      particles.push(new Particle(px, py, vx, vy, 'slime_glob', {
        size: rand(16, 25),
        life: 3.5,
        gravity: 0,
        element: 'Hydro',
        color: '#38bdf8'
      }));
    } else if (element === 'Void') {
      particles.push(new Particle(px, py, vx, vy, 'void_meteor', {
        size: rand(16, 26),
        life: 3.5,
        gravity: 0,
        element: 'Void',
        color: '#a855f7'
      }));
    } else if (element === 'Electro') {
      const strikeX = rand(180, 1740);
      particles.push(new Particle(strikeX, -40, 0, 950, 'meteor', {
        size: rand(16, 24),
        life: 2.0,
        gravity: 0,
        element: 'Electro',
        color: '#facc15'
      }));
    } else {
      particles.push(new Particle(px, py, vx, vy, 'meteor', {
        size: 18,
        life: 3.5,
        gravity: 0,
        element: 'Pyro',
        color: '#f97316'
      }));
    }
  }

  function spawnHeroProjectile(startX, startY, targetX, targetY, options = {}) {
    const isCrit = options.isCrit || false;
    const rarity = options.rarity || 3;
    const color = rarity === 5 ? '#ffd700' : rarity === 4 ? '#c084fc' : '#38bdf8';
    const size = isCrit ? 14 : 9;

    particles.push(new Particle(startX, startY, 0, 0, 'hero_proj', {
      targetX: targetX,
      targetY: targetY,
      color: color,
      size: size,
      life: 2.0,
      gravity: 0,
      onImpact: () => {
        if (options.onHit) options.onHit();
      }
    }));
  }

  function spawnDamageNumber(x, y, damage, isCrit, reaction) {
    let text = `${damage.toLocaleString('tr-TR')}`;
    let color = '#f8fafc';
    let size = 26;

    if (isCrit) {
      text = `CRIT ${text}!`;
      color = '#facc15';
      size = 36;
    } else if (reaction === 'MELT') {
      text = `MELT ${text}!`;
      color = '#f87171';
      size = 32;
    } else if (reaction === 'VAPORIZE') {
      text = `VAPORIZE ${text}!`;
      color = '#38bdf8';
      size = 32;
    }

    particles.push(new Particle(x, y, rand(-30, 30), -120, 'damage_text', {
      text: text,
      color: color,
      size: size,
      life: 1.1,
      gravity: 0
    }));
  }

  // BossVisualEntity Class
  class BossVisualEntity {
    constructor(bossData) {
      this.id = bossData.id || 'void_dragon';
      this.name = bossData.name || 'Bilinmeyen Boss';
      this.title = bossData.title || '';
      this.element = bossData.element || 'Void';
      this.elementColor = bossData.elementColor || '#a855f7';
      this.themeColor = bossData.themeColor || '#7e22ce';
      this.maxHp = bossData.maxHp || bossData.hp || 50000;
      this.currentHp = bossData.currentHp || this.maxHp;
      this.ghostHp = this.currentHp;
      this.state = 'LOBBY';
      this.secondsRemaining = bossData.prepSeconds || 45;

      this.x = 960;
      this.y = -320;
      this.targetY = 320;
      this.targetX = 960;
      this.width = 360;
      this.height = 360;

      this.animTimer = 0;
      this.currentFrame = 'idle';
      this.hitTimer = 0;
      this.shakeTimer = 0;
      this.calamityCooldown = 3.5;
      this.tacticalActive = false;
      this.tacticalSkillName = '';
      this.shieldHp = 0;
      this.shieldMax = 0;
      this.alpha = 1.0;
      this.isDefeated = false;

      this.images = {};
      const slug = this.getSlug(this.id);
      const frames = bossData.frames || {
        idle: bossData.avatarUrl || `/assets/bosses/${slug}_idle.png`,
        hit: `/assets/bosses/${slug}_hit.png`,
        attack: `/assets/bosses/${slug}_attack.png`
      };
      for (const [key, url] of Object.entries(frames)) {
        const img = new Image();
        img.src = url;
        this.images[key] = img;
      }

      this.dialogue = bossData.quote || 'Karanlık galaksi fısıldıyor...';
      this.dialogueTimer = 5.0;
    }

    getSlug(id) {
      if (id.includes('dragon')) return 'dragon';
      if (id.includes('slime')) return 'slime';
      if (id.includes('mecha')) return 'mecha';
      if (id.includes('demon')) return 'demon';
      return 'dragon';
    }

    setFrame(frameName, duration = 0.4) {
      this.currentFrame = frameName;
      if (frameName === 'hit') {
        this.hitTimer = duration;
      }
    }

    takeDamage(damage, isCrit, reaction) {
      this.setFrame('hit', 0.35);
      this.shakeTimer = 0.25;
      spawnDamageNumber(this.x + rand(-60, 60), this.y - 40 + rand(-20, 20), damage, isCrit, reaction);
    }

    updateHp(cur, max) {
      this.currentHp = Math.max(0, cur);
      this.maxHp = max || this.maxHp;
    }

    startTactical(skillName, shieldHp) {
      this.tacticalActive = true;
      this.tacticalSkillName = skillName || 'Kalkan Fazı';
      this.shieldHp = shieldHp;
      this.shieldMax = shieldHp;
      this.setFrame('attack', 4.0);
      this.dialogue = `⚠️ ${this.tacticalSkillName}! Kalkanı Kırın!`;
      this.dialogueTimer = 4.0;
      this.triggerCalamityWave(8);
    }

    updateShield(remaining, max) {
      this.shieldHp = Math.max(0, remaining);
      this.shieldMax = max || this.shieldMax;
      this.shakeTimer = 0.15;
    }

    endTactical(success) {
      this.tacticalActive = false;
      if (success) {
        this.setFrame('hit', 1.5);
        this.dialogue = 'Kalkanım... tuzla buz oldu?!';
        this.dialogueTimer = 3.5;
      } else {
        this.setFrame('idle');
      }
    }

    triggerCalamityWave(count = 4) {
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (!activeBoss) return;
          spawnCalamityProjectile(this);
        }, i * rand(120, 240));
      }
    }

    update(dt) {
      this.animTimer += dt;
      this.y += (this.targetY - this.y) * Math.min(1, dt * 2.5);

      if (this.ghostHp > this.currentHp) {
        this.ghostHp -= (this.ghostHp - this.currentHp) * Math.min(1, dt * 3.0);
      } else {
        this.ghostHp = this.currentHp;
      }

      if (this.hitTimer > 0) {
        this.hitTimer -= dt;
        if (this.hitTimer <= 0) {
          this.currentFrame = this.tacticalActive ? 'attack' : 'idle';
        }
      }
      if (this.shakeTimer > 0) {
        this.shakeTimer -= dt;
      }
      if (this.dialogueTimer > 0) {
        this.dialogueTimer -= dt;
      }

      if (this.state === 'BATTLE' || this.state === 'TACTICAL') {
        this.calamityCooldown -= dt;
        if (this.calamityCooldown <= 0) {
          const waveCount = this.tacticalActive ? rand(5, 8) : rand(3, 5);
          this.triggerCalamityWave(waveCount);
          this.calamityCooldown = this.tacticalActive ? rand(1.8, 2.8) : rand(3.5, 5.5);
        }
      }

      if (this.isDefeated) {
        this.alpha = Math.max(0, this.alpha - dt * 0.35);
        this.y -= dt * 40;
      }
    }

    render(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;

      const floatY = Math.sin(this.animTimer * 2.2) * 12;
      let renderX = this.x;
      let renderY = this.y + floatY;

      if (this.shakeTimer > 0) {
        renderX += (Math.random() - 0.5) * 16;
        renderY += (Math.random() - 0.5) * 16;
      }

      // Elemental Glow behind boss
      const pulse = 1.0 + Math.sin(this.animTimer * 3.5) * 0.12;
      const auraRad = (this.width / 2 + 50) * pulse;
      const auraGrad = ctx.createRadialGradient(renderX, renderY, auraRad * 0.2, renderX, renderY, auraRad);
      auraGrad.addColorStop(0, `${this.elementColor}66`);
      auraGrad.addColorStop(0.55, `${this.elementColor}22`);
      auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(renderX, renderY, auraRad, 0, Math.PI * 2);
      ctx.fill();

      // Boss Sprite Frame
      const frameImg = this.images[this.currentFrame] || this.images.idle;
      if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
        const sw = this.width;
        const sh = this.height;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 15;

        if (this.currentFrame === 'attack') {
          const atkScale = 1.0 + Math.sin(this.animTimer * 8.0) * 0.04;
          ctx.translate(renderX, renderY);
          ctx.scale(atkScale, atkScale);
          ctx.drawImage(frameImg, -sw / 2, -sh / 2, sw, sh);
        } else {
          ctx.drawImage(frameImg, renderX - sw / 2, renderY - sh / 2, sw, sh);
        }
        ctx.restore();

        if (this.hitTimer > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
          ctx.fillRect(renderX - sw / 2, renderY - sh / 2, sw, sh);
          ctx.restore();
        }
      }

      if (this.dialogueTimer > 0 && this.dialogue) {
        this.renderDialogue(ctx, renderX, renderY - this.height / 2 - 10);
      }

      ctx.restore();
    }

    renderDialogue(ctx, x, y) {
      ctx.save();
      ctx.font = 'bold 18px Nunito, sans-serif';
      const textWidth = ctx.measureText(this.dialogue).width;
      const bw = textWidth + 36;
      const bh = 38;
      const bx = x - bw / 2;
      const by = y - bh;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = this.elementColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 6, by + bh);
      ctx.lineTo(x, by + bh + 8);
      ctx.lineTo(x + 6, by + bh);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(this.dialogue, x, by + bh / 2);
      ctx.restore();
    }

    renderHUD(ctx) {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.alpha;

      const barW = 820;
      const barH = 22;
      const barX = 960 - barW / 2;
      const barY = 55;

      // HUD Card Backdrop
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 16;
      const cardH = this.tacticalActive ? 120 : 90;
      ctx.beginPath();
      ctx.roundRect(barX - 25, barY - 35, barW + 50, cardH, 14);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Boss Title Row
      ctx.font = 'bold 20px Cinzel, serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(this.name, barX, barY - 26);

      // Element Badge
      ctx.font = 'bold 12px Nunito, sans-serif';
      const badgeText = this.element.toUpperCase();
      const badgeW = ctx.measureText(badgeText).width + 16;
      const badgeX = barX + ctx.measureText(this.name).width + 12;
      ctx.fillStyle = `${this.elementColor}33`;
      ctx.strokeStyle = this.elementColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, barY - 26, badgeW, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.elementColor;
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, badgeX + badgeW / 2, barY - 22);

      // Timer on the right
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#fca5a5';
      ctx.textAlign = 'right';
      const timerStr = `${this.state === 'LOBBY' ? '⏳' : '⚔️'} ${this.secondsRemaining}s`;
      ctx.fillText(timerStr, barX + barW, barY - 25);

      // HP Bar Outer
      ctx.fillStyle = 'rgba(2, 6, 23, 0.95)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 11);
      ctx.fill();
      ctx.stroke();

      // Ghost Lag Bar
      const ghostPct = Math.min(1, Math.max(0, this.ghostHp / this.maxHp));
      if (ghostPct > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * ghostPct, barH, 11);
        ctx.fill();
      }

      // Current HP Gradient
      const hpPct = Math.min(1, Math.max(0, this.currentHp / this.maxHp));
      if (hpPct > 0) {
        const hpGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        hpGrad.addColorStop(0, '#ef4444');
        hpGrad.addColorStop(0.7, '#f97316');
        hpGrad.addColorStop(1, '#facc15');
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * hpPct, barH, 11);
        ctx.fill();
      }

      // HP Text
      ctx.font = 'bold 12px Nunito, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(this.currentHp).toLocaleString('tr-TR')} / ${this.maxHp.toLocaleString('tr-TR')}`, barX + 12, barY + 5);

      ctx.textAlign = 'right';
      ctx.fillText(`${(hpPct * 100).toFixed(1)}%`, barX + barW - 12, barY + 5);

      // Tactical Shield Bar (if active)
      if (this.tacticalActive) {
        const sBarY = barY + 30;
        const sBarH = 12;
        ctx.font = 'bold 11px Nunito, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(`⚡ ${this.tacticalSkillName} (!kalkan / !ulti)`, barX, sBarY - 14);

        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(this.shieldHp).toLocaleString('tr-TR')} / ${this.shieldMax.toLocaleString('tr-TR')}`, barX + barW, sBarY - 14);

        ctx.fillStyle = 'rgba(2, 6, 23, 0.95)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(barX, sBarY, barW, sBarH, 6);
        ctx.fill();
        ctx.stroke();

        const sPct = Math.min(1, Math.max(0, this.shieldHp / this.shieldMax));
        if (sPct > 0) {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.roundRect(barX, sBarY, barW * sPct, sBarH, 6);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  // Interactive Chat Commands Handler
  function handleChatAction(action, user, fromUser, toUser) {
    if (config.enableCommands === false) return;

    const actorName = user || fromUser;
    if (!actorName) return;

    let ch = chatters.get(actorName.toLowerCase());
    if (!ch) {
      ch = new Chatter(actorName);
      chatters.set(actorName.toLowerCase(), ch);
    }

    if (action === 'jump') {
      ch.triggerJump(380);
      ch.reactionIcon = '⬆️';
      ch.reactionTimer = 1.5;
    } else if (action === 'dance') {
      ch.startDancing(6.0);
    } else if (action === 'sleep') {
      ch.setState('sit_sleep', 35.0);
    } else if (action === 'wake') {
      ch.triggerJump(260);
      ch.setState('idle', 2.5);
      ch.reactionIcon = '☀️';
      ch.reactionTimer = 1.5;
    } else if (action === 'love') {
      ch.triggerEmote(3.0);
      ch.reactionIcon = '💖';
      ch.reactionTimer = 2.5;
    } else if (action === 'hug' && toUser) {
      let target = chatters.get(toUser.toLowerCase());
      if (!target) {
        target = new Chatter(toUser);
        chatters.set(toUser.toLowerCase(), target);
      }
      ch.targetChatter = target;
      ch.socialAction = 'hug';
      ch.setState('run', 6.0);
      ch.reactionIcon = '🏃';
      ch.reactionTimer = 2.0;
    } else if (action === 'duel' && toUser) {
      let target = chatters.get(toUser.toLowerCase());
      if (!target) {
        target = new Chatter(toUser);
        chatters.set(toUser.toLowerCase(), target);
      }
      ch.targetChatter = target;
      ch.socialAction = 'duel';
      ch.setState('run', 5.0);
      ch.reactionIcon = '⚔️';
      ch.reactionTimer = 2.0;

      target.targetChatter = ch;
      target.socialAction = 'duel';
      target.setState('run', 5.0);
      target.reactionIcon = '⚔️';
      target.reactionTimer = 2.0;
    }
  }

  // Chatter Class
  class Chatter {
    constructor(username, avatarId) {
      this.username = username;
      this.avatarId = avatarId || this.pickAvatar(username);
      this.color = this.pickColor(username);

      this.x = rand(150, 1750);
      this.groundY = rand(config.groundY - config.groundDepth, config.groundY);
      this.y = this.groundY;
      this.z = -180; // drops into scene
      this.vz = 0;
      this.vx = 0;
      this.targetX = this.x;
      this.targetY = this.groundY;
      this.facing = Math.random() > 0.5 ? 1 : -1;

      this.state = 'idle';
      this.stateTimer = rand(2.0, 5.0);
      this.animTimer = 0;

      this.lastActiveTime = Date.now();
      this.isSpawning = true;
      this.spawnTimer = 0.5;
      this.spawnScale = 0.1;
      this.isDespawning = false;
      this.despawnAlpha = 1.0;

      this.bubbleText = null;
      this.bubbleTimer = 0;
      this.bubbleAlpha = 0;

      // Interaction & Ecosystem State
      this.messageCount = 1;
      this.hasCrown = false;
      this.hasGoldenAura = false;
      this.auraTimer = 0;
      this.socialCooldown = rand(5.0, 15.0);
      this.targetChatter = null;
      this.socialAction = null; // 'hug', 'duel', 'chase'
      this.isDancing = false;
      this.danceTimer = 0;
      this.isDizzy = false;
      this.dizzyTimer = 0;
      this.reactionIcon = null;
      this.reactionTimer = 0;

      // Expedition State
      this.expedition = null;
      this.expeditionSlot = null;
      this.expeditionActionTimer = 0;
    }

    pickAvatar(username) {
      if (config.vipOverrides && config.vipOverrides[username.toLowerCase()]) {
        return config.vipOverrides[username.toLowerCase()];
      }
      if (avatarRegistry.length === 0) return 'avatar_01';
      let hash = 0;
      for (let i = 0; i < username.length; i++) {
        hash = (hash << 5) - hash + username.charCodeAt(i);
        hash |= 0;
      }
      const idx = Math.abs(hash) % avatarRegistry.length;
      return avatarRegistry[idx].id;
    }

    pickColor(username) {
      const palette = [
        '#ff5964', '#f15bb5', '#fee440', '#00f5d4', '#00bbf9',
        '#9b5de5', '#ff9e00', '#52b788', '#e76f51', '#70d6ff'
      ];
      let hash = 0;
      for (let i = 0; i < username.length; i++) {
        hash = (hash << 3) ^ username.charCodeAt(i);
      }
      return palette[Math.abs(hash) % palette.length];
    }

    say(text) {
      this.messageCount = (this.messageCount || 0) + 1;
      this.bubbleText = text;
      this.bubbleTimer = config.chatBubbleDuration;
      this.lastActiveTime = Date.now();
      this.isDespawning = false;
      this.despawnAlpha = 1.0;
      if (this.state === 'sit_sleep' || Math.random() < 0.4) {
        this.triggerJump(rand(240, 320));
      } else {
        this.setState('emote', 2.0);
      }
    }

    startDancing(duration = 6.0) {
      this.isDancing = true;
      this.danceTimer = duration;
      this.state = 'emote';
      this.lastActiveTime = Date.now();
      this.isDespawning = false;
      this.despawnAlpha = 1.0;
      this.reactionIcon = '🎵';
      this.reactionTimer = duration;
    }

    startGreeting(other) {
      this.facing = other.x >= this.x ? 1 : -1;
      this.setState('emote', 2.0);
      this.reactionIcon = randChoice(['❤️', '👋', '🎵', '✨']);
      this.reactionTimer = 2.0;
      spawnBurst(this.x, this.groundY - 35 * config.scale, 'heart', 3, {
        size: 4,
        life: 1.2,
        gravity: -25
      });
    }

    startChase(other) {
      this.setState('run', 3.5);
      this.targetX = Math.max(100, Math.min(1820, this.x + (this.x >= other.x ? 1 : -1) * rand(250, 400)));
      this.facing = this.targetX >= this.x ? 1 : -1;
      this.reactionIcon = '💨';
      this.reactionTimer = 1.5;

      other.targetChatter = this;
      other.socialAction = 'chase';
      other.setState('run', 3.5);
      other.reactionIcon = '👀';
      other.reactionTimer = 1.5;
    }

    startGathering(other) {
      this.setState('idle', 3.0);
      this.facing = other.x >= this.x ? 1 : -1;
      this.reactionIcon = randChoice(['💬', '💡']);
      this.reactionTimer = 2.5;

      other.setState('idle', 3.0);
      other.facing = this.x >= other.x ? 1 : -1;
      other.reactionIcon = randChoice(['❓', '🎵', '✨']);
      other.reactionTimer = 2.5;
    }

    triggerJump(force = 320) {
      this.z = 0;
      this.vz = -force;
      this.state = 'jump';
      this.stateTimer = 1.5;
      spawnBurst(this.x, this.groundY, 'dust', 6, {
        size: 3,
        life: 0.4,
        gravity: 50,
      });
    }

    triggerEmote(duration = 2.5) {
      this.setState('emote', duration);
      spawnBurst(this.x, this.groundY - 35 * config.scale, 'heart', 4, {
        size: 5,
        life: 1.5,
        gravity: -40,
        upwardBias: 80,
      });
    }

    triggerCelebration(type = 'sub') {
      this.lastActiveTime = Date.now();
      this.isDespawning = false;
      this.despawnAlpha = 1.0;
      this.triggerJump(380);
      if (type === 'follow') {
        spawnBurst(this.x, this.groundY - 50, 'star', 14, {
          color: '#ffd166',
          size: 6,
          gravity: 80,
        });
      } else if (type === 'sub') {
        spawnBurst(this.x, this.groundY - 60, 'confetti', 20, {
          color: randChoice(['#ff477e', '#70d6ff', '#ffd166', '#06d6a0']),
          size: 5,
          gravity: 120,
        });
      } else if (type === 'donation') {
        spawnBurst(this.x, this.groundY - 40, 'coin', 12, {
          bounce: 0.6,
          size: 6,
          gravity: 280,
          upwardBias: 180,
        });
      }
    }

    setState(newState, duration = null) {
      this.state = newState;
      this.animTimer = 0;
      this.stateTimer = duration !== null ? duration : rand(2.5, 6.0);

      if (newState === 'walk' || newState === 'run') {
        const wanderDist = newState === 'run' ? rand(150, 400) : rand(80, 220);
        this.targetX = Math.max(80, Math.min(1840, this.x + (Math.random() > 0.5 ? 1 : -1) * wanderDist));
        this.targetY = rand(config.groundY - config.groundDepth, config.groundY);
        this.facing = this.targetX > this.x ? 1 : -1;
      }
    }

    update(dt, allChatters) {
      if (this.isSpawning) {
        this.spawnTimer -= dt;
        this.spawnScale = Math.min(1.0, this.spawnScale + dt * 3.5);
        if (this.spawnTimer <= 0) {
          this.isSpawning = false;
          this.spawnScale = 1.0;
        }
      }

      if (this.expedition) {
        this.lastActiveTime = Date.now();
        this.isDespawning = false;
        this.despawnAlpha = 1.0;
      }

      const idleSeconds = (Date.now() - this.lastActiveTime) / 1000;
      if (config.despawnTimeout > 0 && idleSeconds > config.despawnTimeout) {
        this.isDespawning = true;
      }

      if (this.isDespawning) {
        this.despawnAlpha -= dt * 0.8;
        if (this.despawnAlpha <= 0) {
          return false;
        }
      }

      // Aura & Effect Timers
      if (this.hasGoldenAura) {
        this.auraTimer -= dt;
        if (this.auraTimer <= 0) {
          this.hasGoldenAura = false;
        }
      }

      if (this.isDancing) {
        this.danceTimer -= dt;
        if (this.danceTimer <= 0) {
          this.isDancing = false;
          this.setState('idle', rand(2.0, 4.0));
        } else {
          if (Math.floor(this.animTimer / 0.3) % 2 === 0) {
            this.facing = 1;
          } else {
            this.facing = -1;
          }
          if (this.animTimer > 0.6) {
            this.animTimer = 0;
            particles.push(
              new Particle(
                this.x + rand(-12, 12),
                this.y - 30 * config.scale,
                rand(-20, 20),
                rand(-50, -80),
                'note',
                { size: 7, life: 1.5, gravity: -20, text: randChoice(['🎵', '🎶']), color: randChoice(['#f472b6', '#a855f7', '#38bdf8', '#fbbf24']) }
              )
            );
          }
        }
      }

      if (this.isDizzy) {
        this.dizzyTimer -= dt;
        if (this.dizzyTimer <= 0) {
          this.isDizzy = false;
        }
      }

      if (this.reactionTimer > 0) {
        this.reactionTimer -= dt;
        if (this.reactionTimer <= 0) {
          this.reactionIcon = null;
        }
      }

      // Handle Directed Social Interactions (hug, duel, chase)
      if (this.targetChatter) {
        if (!allChatters.includes(this.targetChatter) || this.targetChatter.isDespawning) {
          this.targetChatter = null;
          this.socialAction = null;
        } else {
          this.targetX = this.targetChatter.x;
          this.targetY = this.targetChatter.groundY;
          const dx = this.targetChatter.x - this.x;
          const dy = this.targetChatter.groundY - this.groundY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (this.socialAction === 'hug') {
            if (dist < 32) {
              this.facing = dx >= 0 ? 1 : -1;
              this.targetChatter.facing = -this.facing;
              this.setState('emote', 2.8);
              this.targetChatter.setState('emote', 2.8);
              this.reactionIcon = '💖';
              this.reactionTimer = 2.5;
              this.targetChatter.reactionIcon = '🤗';
              this.targetChatter.reactionTimer = 2.5;
              spawnBurst((this.x + this.targetChatter.x) / 2, this.groundY - 35 * config.scale, 'heart', 16, { size: 6, life: 1.8, gravity: -30 });
              this.targetChatter = null;
              this.socialAction = null;
            }
          } else if (this.socialAction === 'duel') {
            if (dist < 35) {
              spawnBurst((this.x + this.targetChatter.x) / 2, this.groundY - 20 * config.scale, 'dust', 14, { size: 5, life: 0.6, gravity: 30 });
              const winMe = Math.random() > 0.5;
              const winCh = winMe ? this : this.targetChatter;
              const loseCh = winMe ? this.targetChatter : this;

              winCh.triggerJump(360);
              winCh.reactionIcon = '⭐';
              winCh.reactionTimer = 2.5;
              winCh.setState('emote', 2.5);

              loseCh.isDizzy = true;
              loseCh.dizzyTimer = 3.0;
              loseCh.reactionIcon = '💫';
              loseCh.reactionTimer = 3.0;
              loseCh.setState('idle', 3.0);

              this.targetChatter = null;
              this.socialAction = null;
            }
          } else if (this.socialAction === 'chase') {
            if (dist < 32) {
              this.setState('emote', 2.0);
              this.reactionIcon = '🎉';
              this.reactionTimer = 2.0;
              this.targetChatter = null;
              this.socialAction = null;
            }
          }
        }
      }

      // Autonomous Proximity Social Check
      if (config.enableInteractions !== false && !this.targetChatter && !this.isDancing && !this.isDizzy && !this.isDespawning && this.state !== 'jump' && !this.expedition) {
        this.socialCooldown -= dt;
        if (this.socialCooldown <= 0) {
          for (const other of allChatters) {
            if (other === this || other.targetChatter || other.isDespawning || other.state === 'jump' || other.expedition) continue;
            const dX = other.x - this.x;
            const dY = other.groundY - this.groundY;
            const dist = Math.sqrt(dX * dX + dY * dY);
            if (dist < 52) {
              this.socialCooldown = rand(15.0, 30.0);
              other.socialCooldown = rand(15.0, 30.0);
              const r = Math.random();
              if (r < 0.5) {
                this.startGreeting(other);
                other.startGreeting(this);
              } else if (r < 0.75) {
                this.startChase(other);
              } else {
                this.startGathering(other);
              }
              break;
            }
          }
        }
      }

      // Gravity & jump
      if (this.z < 0 || this.vz !== 0) {
        this.z += this.vz * dt;
        this.vz += 850 * dt;
        if (this.z >= 0) {
          this.z = 0;
          this.vz = 0;
          spawnBurst(this.x, this.groundY, 'dust', 6, {
            size: 3,
            life: 0.35,
            gravity: 40,
          });
          if (this.state === 'jump') {
            this.setState('idle', rand(1.5, 3.5));
          }
        }
      }

      this.stateTimer -= dt;
      this.animTimer += dt;

      if (this.stateTimer <= 0 && this.z === 0) {
        if (!this.expedition) {
          const r = Math.random();
          if (r < 0.35) {
            this.setState('idle', rand(2.0, 5.0));
          } else if (r < 0.65) {
            this.setState('walk', rand(2.5, 6.0));
          } else if (r < 0.8) {
            this.setState('run', rand(1.5, 3.5));
          } else if (r < 0.9) {
            this.triggerJump(rand(240, 360));
          } else if (r < 0.95) {
            this.triggerEmote(rand(2.0, 4.0));
          } else {
            this.setState('sit_sleep', rand(4.0, 8.0));
          }
        } else {
          this.setState('idle', rand(3.0, 6.0));
        }
      }

      if (this.expedition) {
        if (this.expeditionSlot) {
          const dx = this.expeditionSlot.x - this.x;
          const dy = this.expeditionSlot.y - this.groundY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 6) {
            const speed = 75 * config.moveSpeed;
            this.vx = (dx / dist) * speed;
            this.x += this.vx * dt;
            this.groundY += (dy / dist) * speed * dt;
            this.facing = dx >= 0 ? 1 : -1;
            this.state = 'walk';
          } else {
            this.x = this.expeditionSlot.x;
            this.groundY = this.expeditionSlot.y;
            this.vx = 0;
            this.facing = this.expedition.type === 'fishing' ? -1 : 1;
            if (this.state === 'walk' || this.state === 'run') {
              this.state = 'idle';
            }
          }
        }

        // Ambient working effects while on expedition
        this.expeditionActionTimer += dt;
        if (this.expeditionActionTimer >= 3.2) {
          this.expeditionActionTimer = 0;
          if (this.expedition.type === 'fishing') {
            spawnBurst(this.x - 22, this.groundY + 6, 'dust', 3, {
              color: '#38bdf8',
              size: 3,
              gravity: -10,
              life: 0.8
            });
            if (Math.random() < 0.35) {
              this.reactionIcon = randChoice(['🎣', '🐟', '✨', '🌊']);
              this.reactionTimer = 2.0;
            }
          } else if (this.expedition.type === 'mining') {
            spawnBurst(this.x + 20, this.groundY - 12, 'spark', 4, {
              color: randChoice(['#c084fc', '#38bdf8', '#facc15', '#e879f9']),
              size: 3,
              gravity: 50,
              life: 0.7
            });
            if (Math.random() < 0.35) {
              this.reactionIcon = randChoice(['⛏️', '💎', '✨', '🪙']);
              this.reactionTimer = 2.0;
            }
          }
        }
      } else {
        const speedMult = config.moveSpeed;
        if (this.state === 'walk') {
          const baseSpeed = 42 * speedMult;
          const dx = this.targetX - this.x;
          const dy = this.targetY - this.groundY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 5) {
            this.vx = (dx / dist) * baseSpeed;
            this.x += this.vx * dt;
            this.groundY += (dy / dist) * baseSpeed * 0.4 * dt;
            this.facing = dx >= 0 ? 1 : -1;
          } else {
            this.setState('idle', rand(1.5, 4.0));
          }
        } else if (this.state === 'run') {
          const baseSpeed = 95 * speedMult;
          const dx = this.targetX - this.x;
          const dy = this.targetY - this.groundY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 8) {
            this.vx = (dx / dist) * baseSpeed;
            this.x += this.vx * dt;
            this.groundY += (dy / dist) * baseSpeed * 0.4 * dt;
            this.facing = dx >= 0 ? 1 : -1;
          } else {
            this.setState('idle', rand(1.0, 3.0));
          }
        } else {
          this.vx = 0;
        }
      }

      // Soft Avoidance (only when not working on an expedition)
      if (!this.expedition) {
        const avoidDist = 32 * config.scale;
        for (const other of allChatters) {
          if (other === this) continue;
          const dX = this.x - other.x;
          const dY = this.groundY - other.groundY;
          const distSq = dX * dX + dY * dY;
          if (distSq < avoidDist * avoidDist && distSq > 0.1) {
            const dist = Math.sqrt(distSq);
            const push = ((avoidDist - dist) / avoidDist) * 18 * dt;
            this.x += (dX / dist) * push;
            this.groundY += (dY / dist) * push * 0.3;
          }
        }
      }

      this.x = Math.max(60, Math.min(1860, this.x));
      this.groundY = Math.max(config.groundY - config.groundDepth, Math.min(config.groundY, this.groundY));
      this.y = this.groundY + this.z;

      if (this.state === 'sit_sleep') {
        if (this.animTimer > 1.2) {
          this.animTimer = 0;
          particles.push(
            new Particle(
              this.x + rand(-6, 12),
              this.y - 18 * config.scale,
              rand(8, 22),
              rand(-25, -45),
              'sleep_z',
              { size: 5, life: 2.0, gravity: -10, text: randChoice(['z', 'Z', 'z..']) }
            )
          );
        }
      } else if (this.state === 'emote') {
        if (this.animTimer > 0.8) {
          this.animTimer = 0;
          particles.push(
            new Particle(
              this.x + rand(-15, 15),
              this.y - 25 * config.scale,
              rand(-15, 15),
              rand(-35, -70),
              randChoice(['heart', 'star']),
              { size: 5, life: 1.5, gravity: -20 }
            )
          );
        }
      }

      if (this.bubbleTimer > 0) {
        this.bubbleTimer -= dt;
        this.bubbleAlpha = Math.min(1.0, this.bubbleAlpha + dt * 4.0);
        if (this.bubbleTimer <= 0) {
          this.bubbleText = null;
        }
      } else if (this.bubbleAlpha > 0) {
        this.bubbleAlpha -= dt * 3.0;
      }

      return true;
    }

    getCurrentSprite() {
      if (this.expedition) {
        if (this.expedition.type === 'fishing' && loadedExpeditionAssets.cat_fisherman) {
          return loadedExpeditionAssets.cat_fisherman;
        }
        if (this.expedition.type === 'mining' && loadedExpeditionAssets.cat_miner) {
          return loadedExpeditionAssets.cat_miner;
        }
      }

      const folder = this.avatarId;
      let fn = 'idle_0.png';

      if (this.state === 'walk') {
        const frame = Math.floor(this.animTimer / 0.18) % 2;
        fn = this.facing >= 0 ? `walk_right_${frame}.png` : `walk_left_${frame}.png`;
      } else if (this.state === 'run') {
        fn = 'run_0.png';
      } else if (this.state === 'jump') {
        fn = this.vz < 0 ? 'jump_0.png' : 'jump_1.png';
      } else if (this.state === 'emote') {
        fn = 'emote_0.png';
      } else if (this.state === 'sit_sleep') {
        fn = 'sit_sleep_0.png';
      } else {
        fn = 'idle_0.png';
      }

      const key = `${folder}/${fn}`;
      return loadedSprites[key] || loadedSprites[`${folder}/idle_0.png`] || null;
    }

    render(ctx) {
      const sprite = this.getCurrentSprite();
      if (!sprite) return;

      const isExpeditionSprite = Boolean(this.expedition && (
        sprite === loadedExpeditionAssets.cat_fisherman ||
        sprite === loadedExpeditionAssets.cat_miner
      ));

      const scale = config.scale * this.spawnScale;
      let w, h;
      if (isExpeditionSprite) {
        h = 32 * scale;
        w = h * (sprite.width / sprite.height);
      } else {
        w = sprite.width * scale;
        h = sprite.height * scale;
      }

      ctx.save();
      ctx.globalAlpha = this.despawnAlpha;

      // 1. 5★ Golden Starlight Aura
      if (this.hasGoldenAura) {
        renderGoldenAura(ctx, this.x, this.y, scale, this.animTimer);
      }

      // 2. Soft Shadow
      if (config.showShadows) {
        ctx.save();
        ctx.fillStyle = 'rgba(12, 14, 20, 0.35)';
        const shadowScale = Math.max(0.3, 1.0 - Math.abs(this.z) / 250);
        const sw = (w * 0.65) * shadowScale;
        const sh = (7 * scale) * shadowScale;
        ctx.beginPath();
        ctx.ellipse(this.x, this.groundY, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. Avatar Sprite
      ctx.save();
      ctx.translate(this.x, this.y);

      if (this.isDizzy) {
        ctx.rotate(Math.sin(this.animTimer * 14.0) * 0.2);
      }

      if (isExpeditionSprite) {
        // Original expedition cat sprites face left; flip horizontally when facing right
        if (this.facing > 0) {
          ctx.scale(-1, 1);
        }
      } else {
        if (this.facing < 0 && (this.state === 'run' || this.state === 'jump' || this.state === 'idle')) {
          ctx.scale(-1, 1);
        }
      }

      let bounceY = 0;
      if (this.state === 'idle') {
        bounceY = Math.sin(this.animTimer * 4.0) * (0.8 * config.scale);
      } else if (this.state === 'run') {
        bounceY = Math.sin(this.animTimer * 18.0) * (1.2 * config.scale);
      }

      ctx.drawImage(sprite, -w / 2, -h + bounceY, w, h);
      ctx.restore();

      // 4. Trivia Winner Crown
      const hasCrownNow = this.hasCrown || (currentCrownWinner && currentCrownWinner === this.username.toLowerCase());
      if (hasCrownNow) {
        renderCrown(ctx, this.x, this.y - h - 4, scale, this.animTimer);
      }

      // 5. Nameplates with Loyalty Badges
      let nameplateTop = null;
      if (config.showNameplates) {
        nameplateTop = this.renderNameplate(ctx, h, hasCrownNow);
      }

      // 5b. Expedition Working Status Badge
      if (this.expedition) {
        const now = Date.now();
        const isDone = now >= this.expedition.endsAt;
        const badgeIcon = this.expedition.type === 'fishing' ? '🎣' : '⛏️';
        let badgeText = '';
        let badgeBg = '';
        let badgeBorder = '';

        if (isDone) {
          badgeText = `✨ ${badgeIcon} Hazır! (!topla)`;
          badgeBg = 'rgba(202, 138, 4, 0.94)';
          badgeBorder = '#fef08a';
        } else {
          const remMin = Math.max(1, Math.ceil((this.expedition.endsAt - now) / 60000));
          const typeLabel = this.expedition.type === 'fishing' ? 'Balıkta' : 'Madende';
          badgeText = `${badgeIcon} ${typeLabel} (~${remMin}dk)`;
          badgeBg = this.expedition.type === 'fishing' ? 'rgba(14, 116, 144, 0.92)' : 'rgba(109, 40, 217, 0.92)';
          badgeBorder = this.expedition.type === 'fishing' ? '#38bdf8' : '#c084fc';
        }

        ctx.save();
        ctx.font = 'bold 11px "Fredoka", "Nunito", sans-serif';
        const tm = ctx.measureText(badgeText);
        const bw = tm.width + 16;
        const bh = 20;
        const bx = this.x - bw / 2;
        const by = (nameplateTop !== null ? nameplateTop : (this.y - h - 10)) - bh - 4;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = badgeBg;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 10);
        ctx.fill();

        ctx.strokeStyle = badgeBorder;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 10);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(badgeText, this.x, by + bh / 2 + 0.5);
        ctx.restore();

        // Update nameplateTop so reaction icons and speech bubbles render above the badge
        nameplateTop = by;
      }

      // 6. Mini Reaction Bubble
      if (this.reactionIcon && this.reactionTimer > 0) {
        const reactY = nameplateTop !== null ? (nameplateTop - 8) : (this.y - h - (hasCrownNow ? 32 : 12));
        renderReactionBubble(ctx, this.reactionIcon, this.x, reactY);
      }

      // 7. Speech Bubble
      if (this.bubbleText && this.bubbleAlpha > 0) {
        this.renderSpeechBubble(ctx, h, hasCrownNow, nameplateTop);
      }

      ctx.restore();
    }

    renderNameplate(ctx, spriteHeight, hasCrown) {
      const isVip = Boolean(config.vipOverrides && config.vipOverrides[this.username.toLowerCase()]);
      let badge = '🥉';
      if (isVip) {
        badge = '👑';
      } else if (this.messageCount >= 25) {
        badge = '🥇';
      } else if (this.messageCount >= 10) {
        badge = '🥈';
      }

      const fontMult = config.fontSizeMultiplier || 1.35;
      const fontSize = Math.max(16, Math.round(15 * fontMult));
      ctx.font = `800 ${fontSize}px 'Fredoka', 'Nunito', 'Segoe UI', sans-serif`;
      const displayText = `${badge} ${this.username}`;
      const textMetrics = ctx.measureText(displayText);
      const paddingX = Math.round(11 * fontMult);
      const paddingY = Math.round(5 * fontMult);
      const pillW = textMetrics.width + paddingX * 2;
      const pillH = fontSize + paddingY * 2 + 2;
      const pillX = this.x - pillW / 2;
      const pillY = this.y - spriteHeight - pillH - (hasCrown ? 24 : 6);

      // 1. Drop shadow for the pill
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      // 2. High-contrast solid dark background
      ctx.fillStyle = 'rgba(10, 14, 24, 0.94)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.restore();

      // 3. Thick vibrant border
      ctx.strokeStyle = hasCrown ? '#ffd700' : this.color;
      ctx.lineWidth = hasCrown ? 2.8 : 2.2;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.stroke();

      // 4. Razor-sharp white text with text shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, this.x, pillY + pillH / 2);
      ctx.restore();

      return pillY;
    }

    renderSpeechBubble(ctx, spriteHeight, hasCrown, nameplateTop) {
      ctx.save();
      ctx.globalAlpha = this.bubbleAlpha * this.despawnAlpha;

      const fontMult = config.fontSizeMultiplier || 1.35;
      const fontSize = Math.max(18, Math.round(16 * fontMult));
      ctx.font = `700 ${fontSize}px 'Fredoka', 'Nunito', 'Segoe UI', sans-serif`;

      const maxCharsPerLine = Math.max(16, Math.round(24 / (fontMult * 0.85)));
      const lines = wrapText(this.bubbleText, maxCharsPerLine);

      let maxLineW = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxLineW) maxLineW = w;
      }

      const padX = Math.round(14 * fontMult);
      const padY = Math.round(9 * fontMult);
      const lineH = Math.round(fontSize * 1.35);
      const bubbleW = Math.max(64, maxLineW + padX * 2);
      const bubbleH = lines.length * lineH + padY * 2;

      let bubbleX = this.x - bubbleW / 2;
      bubbleX = Math.max(20, Math.min(1920 - bubbleW - 20, bubbleX));
      
      const targetAnchorY = nameplateTop !== null ? (nameplateTop - 12) : (this.y - spriteHeight - (hasCrown ? 44 : 16));
      const bubbleY = targetAnchorY - bubbleH;

      // 1. Rich drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;

      // 2. Solid pure white bubble body
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 12);
      ctx.fill();

      // Tail with shadow
      const tailX = Math.max(bubbleX + 18, Math.min(bubbleX + bubbleW - 18, this.x));
      const tailTipY = bubbleY + bubbleH + 9;
      ctx.beginPath();
      ctx.moveTo(tailX - 8, bubbleY + bubbleH - 1);
      ctx.lineTo(tailX, tailTipY);
      ctx.lineTo(tailX + 8, bubbleY + bubbleH - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 3. Crisp bold dark border
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 12);
      ctx.stroke();

      // Tail fill & border
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(tailX - 8, bubbleY + bubbleH - 2);
      ctx.lineTo(tailX, tailTipY);
      ctx.lineTo(tailX + 8, bubbleY + bubbleH - 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(tailX - 8, bubbleY + bubbleH);
      ctx.lineTo(tailX, tailTipY);
      ctx.lineTo(tailX + 8, bubbleY + bubbleH);
      ctx.stroke();

      // 4. Ultra-clear deep black text
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bubbleX + padX, bubbleY + padY + i * lineH);
      }

      ctx.restore();
    }
  }

  function wrapText(text, maxChars) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + w).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = w;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 3);
  }

  function handleChat(user, message, avatarId = null) {
    if (!user) return;
    let chatter = chatters.get(user.toLowerCase());

    if (!chatter) {
      if (chatters.size >= config.maxChatters) {
        let oldestUser = null;
        let oldestTime = Infinity;
        for (const [u, ch] of chatters) {
          if (ch.lastActiveTime < oldestTime) {
            oldestTime = ch.lastActiveTime;
            oldestUser = u;
          }
        }
        if (oldestUser) chatters.delete(oldestUser);
      }

      chatter = new Chatter(user, avatarId);
      chatters.set(user.toLowerCase(), chatter);
    }

    if (message) {
      chatter.say(message);
    }
  }

  function handleEvent(type, user, meta = {}) {
    let chatter = user ? chatters.get(user.toLowerCase()) : null;
    if (!chatter && user) {
      chatter = new Chatter(user);
      chatters.set(user.toLowerCase(), chatter);
    }

    if (chatter) {
      chatter.triggerCelebration(type);
    } else {
      spawnBurst(960, 400, type === 'sub' ? 'confetti' : 'coin', 30, {
        size: 7,
        gravity: 140,
      });
    }

    if (type === 'raid') {
      for (const ch of chatters.values()) {
        ch.triggerCelebration('sub');
      }
    }
  }

  // WebSocket Connection to Render App Server
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log(`[PixelChatter] Connecting to WebSocket: ${wsUrl}`);

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[PixelChatter] Connected to Render WebSocket server.');
        // Request chatter config
        socket.send(JSON.stringify({ type: 'GET_CHATTER_CONFIG' }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // 1. Dedicated chatter events
          if (msg.type === 'CHATTER_CHAT' || msg.type === 'chat') {
            handleChat(msg.user, msg.text, msg.avatarId);
          } else if (msg.type === 'CHATTER_ACTION') {
            handleChatAction(msg.action, msg.user, msg.fromUser, msg.toUser);
          } else if (msg.type === 'CHATTER_CROWN') {
            currentCrownWinner = msg.winner ? msg.winner.toLowerCase() : null;
            if (msg.winner) {
              let ch = chatters.get(msg.winner.toLowerCase());
              if (!ch) {
                ch = new Chatter(msg.winner);
                chatters.set(msg.winner.toLowerCase(), ch);
              }
              ch.hasCrown = true;
              ch.triggerJump(380);
              spawnBurst(ch.x, ch.groundY - 60, 'confetti', 25, {
                color: randChoice(['#ffd700', '#ffb703', '#fb8500', '#fff3b0']),
                size: 6,
                gravity: 100
              });
            }
          } else if (msg.type === 'CHATTER_AURA') {
            if (msg.user) {
              let ch = chatters.get(msg.user.toLowerCase());
              if (!ch) {
                ch = new Chatter(msg.user);
                chatters.set(msg.user.toLowerCase(), ch);
              }
              ch.hasGoldenAura = true;
              ch.auraTimer = msg.duration || 900;
              ch.triggerJump(400);
              spawnBurst(ch.x, ch.groundY - 50, 'star', 20, {
                color: '#ffd700',
                size: 7,
                gravity: 60
              });
            }
          } else if (msg.type === 'CHATTER_PRIMO_RAIN') {
            triggerPrimoRain(msg.count || 35);
          } else if (msg.type === 'CHATTER_DANCE_ALL') {
            for (const ch of chatters.values()) {
              ch.startDancing(msg.duration || 8.0);
            }
          } else if (msg.type === 'CHATTER_EVENT' || msg.type === 'event') {
            handleEvent(msg.eventType || msg.event, msg.user, msg);
          } else if (msg.type === 'CHATTER_CONFIG' || msg.type === 'config') {
            if (msg.config) {
              const oldGround = config.groundY;
              Object.assign(config, msg.config);
              if (oldGround !== config.groundY) {
                for (const ch of chatters.values()) {
                  ch.groundY = rand(config.groundY - config.groundDepth, config.groundY);
                  ch.targetY = ch.groundY;
                  ch.y = ch.groundY + ch.z;
                }
              }
            }
          } else if (msg.type === 'CHATTER_CLEAR' || msg.type === 'clear') {
            chatters.clear();
          } else if (msg.type === 'CHATTER_SPAWN' || msg.type === 'spawn') {
            handleChat(msg.user, null, msg.avatarId);
          }
          // 2. Real Kick Chat Live Bridge (from server's existing kickClient)
          else if (msg.type === 'NEW_CHAT_MESSAGE' || msg.type === 'CHAT_MESSAGE') {
            const sender = msg.sender || msg.username || (msg.data && msg.data.sender);
            const content = msg.content || msg.message || (msg.data && msg.data.content);
            if (sender && content) {
              handleChat(sender, content);
            }
          }
          // 3. World Boss Raid Live Integration
          else if (msg.type === 'INIT_STATE') {
            if (msg.bossState && msg.bossState.state && msg.bossState.state !== 'IDLE' && msg.bossState.activeBoss) {
              if (config.enableBossOverlay !== false) {
                activeBoss = new BossVisualEntity(msg.bossState.activeBoss);
                activeBoss.state = msg.bossState.state;
                if (activeBoss.state === 'TACTICAL') activeBoss.tacticalActive = true;
              }
            }
            if (Array.isArray(msg.expeditions)) {
              for (const exp of msg.expeditions) {
                if (!exp.user) continue;
                let ch = chatters.get(exp.user.toLowerCase());
                if (!ch) {
                  ch = new Chatter(exp.user);
                  chatters.set(exp.user.toLowerCase(), ch);
                }
                ch.expedition = {
                  type: exp.type || 'fishing',
                  startTime: exp.startTime || Date.now(),
                  durationMs: exp.durationMs || (20 * 60 * 1000),
                  endsAt: exp.endsAt || (Date.now() + 20 * 60 * 1000)
                };
                const slotIdx = getUserSlotIndex(exp.user);
                ch.expeditionSlot = getExpeditionSlot(ch.expedition.type, slotIdx);
                ch.x = ch.expeditionSlot.x;
                ch.groundY = ch.expeditionSlot.y;
                ch.targetX = ch.expeditionSlot.x;
                ch.targetY = ch.expeditionSlot.y;
                ch.facing = ch.expedition.type === 'fishing' ? -1 : 1;
                ch.setState('idle');
              }
            }
          } else if (msg.type === 'EXPEDITION_STARTED') {
            const username = msg.user;
            if (username) {
              let ch = chatters.get(username.toLowerCase());
              if (!ch) {
                ch = new Chatter(username);
                chatters.set(username.toLowerCase(), ch);
              }
              const expType = msg.expeditionType || msg.type || 'fishing';
              ch.expedition = {
                type: expType,
                startTime: msg.startTime || Date.now(),
                durationMs: msg.durationMs || (20 * 60 * 1000),
                endsAt: msg.endsAt || (Date.now() + 20 * 60 * 1000)
              };
              const slotIdx = getUserSlotIndex(username);
              ch.expeditionSlot = getExpeditionSlot(expType, slotIdx);
              ch.targetX = ch.expeditionSlot.x;
              ch.targetY = ch.expeditionSlot.y;
              ch.setState('walk');
              ch.say(expType === 'fishing' ? '🎣 Balık tutmaya gidiyorum!' : '⛏️ Madene iniyorum!');
              ch.reactionIcon = expType === 'fishing' ? '🎣' : '⛏️';
              ch.reactionTimer = 3.0;
            }
          } else if (msg.type === 'EXPEDITION_COMPLETED') {
            const username = msg.user;
            if (username) {
              let ch = chatters.get(username.toLowerCase());
              if (ch) {
                ch.expedition = null;
                ch.expeditionSlot = null;
                ch.triggerCelebration('donation');
                ch.say(`🐾 Ganimetim geldi! ${msg.reward?.emoji || '🎁'} ${msg.reward?.item || ''} (+${msg.reward?.primogems || 0} 💎)`);
                ch.setState('idle', 3.0);
              }
            }
          } else if (msg.type === 'BOSS_STATE') {
            if (msg.state) {
              if (msg.state.state === 'IDLE') {
                activeBoss = null;
              } else if (msg.state.activeBoss && config.enableBossOverlay !== false) {
                if (!activeBoss) activeBoss = new BossVisualEntity(msg.state.activeBoss);
                activeBoss.state = msg.state.state;
              }
            }
          } else if (msg.type === 'BOSS_LOBBY') {
            if (config.enableBossOverlay !== false && msg.boss) {
              activeBoss = new BossVisualEntity(msg.boss);
              for (const ch of chatters.values()) {
                ch.reactionIcon = '😱';
                ch.reactionTimer = 3.0;
                ch.triggerJump(rand(280, 380));
              }
            }
          } else if (msg.type === 'BOSS_BATTLE_STARTED') {
            if (activeBoss) {
              activeBoss.state = 'BATTLE';
              activeBoss.dialogue = 'Savaş başladı! Hiçliğin gücünü tadın!';
              activeBoss.dialogueTimer = 4.0;
            }
          } else if (msg.type === 'BOSS_WARRIOR_JOINED') {
            const w = msg.warrior;
            if (w && w.username) {
              let ch = chatters.get(w.username.toLowerCase());
              if (!ch) {
                ch = new Chatter(w.username);
                chatters.set(w.username.toLowerCase(), ch);
              }
              ch.reactionIcon = '⚔️';
              ch.reactionTimer = 2.5;
              ch.triggerJump(400);
              ch.say('Savaşa katıldım! ⚔️');
            }
          } else if (msg.type === 'BOSS_ATTACK') {
            if (activeBoss) {
              activeBoss.updateHp(msg.bossRemainingHp, msg.bossMaxHp);
            }
            const username = msg.warrior ? msg.warrior.username : (msg.username || null);
            if (username) {
              let ch = chatters.get(username.toLowerCase());
              if (ch && activeBoss) {
                ch.facing = ch.x < activeBoss.x ? 1 : -1;
                ch.triggerJump(rand(320, 420));
                ch.reactionIcon = msg.isCrit ? '💥' : '⚔️';
                ch.reactionTimer = 1.5;

                spawnHeroProjectile(ch.x, ch.y + ch.z - 35, activeBoss.x + rand(-50, 50), activeBoss.y + rand(-30, 30), {
                  isCrit: msg.isCrit,
                  rarity: msg.warrior ? msg.warrior.rarity : 3,
                  onHit: () => {
                    if (activeBoss) {
                      activeBoss.takeDamage(msg.damage, msg.isCrit, msg.reaction);
                    }
                  }
                });
              } else if (activeBoss) {
                activeBoss.takeDamage(msg.damage, msg.isCrit, msg.reaction);
              }
            }
          } else if (msg.type === 'BOSS_TACTICAL_STARTED') {
            if (activeBoss) {
              activeBoss.state = 'TACTICAL';
              activeBoss.startTactical(msg.skillName, msg.shieldHp);
            }
          } else if (msg.type === 'BOSS_TACTICAL_HIT') {
            if (activeBoss) {
              activeBoss.updateShield(msg.shieldRemaining, msg.shieldMax);
              spawnDamageNumber(activeBoss.x + rand(-40, 40), activeBoss.y + 40, msg.shieldDamage, true, 'VAPORIZE');
            }
            const username = msg.warrior ? msg.warrior.username : null;
            if (username && activeBoss) {
              let ch = chatters.get(username.toLowerCase());
              if (ch) {
                ch.triggerJump(380);
                ch.reactionIcon = '⚡';
                ch.reactionTimer = 1.5;
                spawnHeroProjectile(ch.x, ch.y + ch.z - 35, activeBoss.x, activeBoss.y + 40, {
                  isCrit: true,
                  rarity: 5
                });
              }
            }
          } else if (msg.type === 'BOSS_TACTICAL_SUCCESS') {
            if (activeBoss) {
              activeBoss.endTactical(true);
            }
          } else if (msg.type === 'BOSS_TACTICAL_FAIL') {
            if (activeBoss) {
              activeBoss.endTactical(false);
              activeBoss.triggerCalamityWave(10);
            }
          } else if (msg.type === 'BOSS_VICTORY') {
            if (activeBoss) {
              activeBoss.state = 'VICTORY';
              activeBoss.isDefeated = true;
              activeBoss.setFrame('hit');
              activeBoss.dialogue = 'İmkânsız... Mağlup oldum!';
              activeBoss.dialogueTimer = 5.0;
            }
            triggerPrimoRain(50);
            for (const ch of chatters.values()) {
              ch.triggerCelebration('sub');
              if (msg.lastHit && ch.username.toLowerCase() === msg.lastHit.username.toLowerCase()) {
                ch.hasCrown = true;
              }
              if (msg.mvp && ch.username.toLowerCase() === msg.mvp.username.toLowerCase()) {
                ch.hasGoldenAura = true;
                ch.auraTimer = 600;
              }
            }
            setTimeout(() => {
              activeBoss = null;
            }, 14000);
          } else if (msg.type === 'BOSS_DEFEAT') {
            if (activeBoss) {
              activeBoss.state = 'DEFEAT';
              activeBoss.isDefeated = true;
              activeBoss.dialogue = 'Karanlığa çekiliyorum...';
              activeBoss.dialogueTimer = 4.0;
            }
            setTimeout(() => {
              activeBoss = null;
            }, 8000);
          } else if (msg.type === 'BOSS_TICK') {
            if (activeBoss && msg.secondsRemaining !== undefined) {
              activeBoss.secondsRemaining = msg.secondsRemaining;
            }
          }
        } catch (e) {
          console.error('[PixelChatter] Error parsing WS message:', e);
        }
      };

      socket.onclose = () => {
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = () => {
        // Will trigger onclose
      };
    } catch (e) {
      setTimeout(connectWebSocket, 3000);
    }
  }

  // 60 FPS Canvas Game Loop
  function loop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.1, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Screen shake on calamity impact
    if (screenShake > 0) {
      const ox = (Math.random() - 0.5) * screenShake;
      const oy = (Math.random() - 0.5) * screenShake;
      ctx.translate(ox, oy);
      screenShake = Math.max(0, screenShake - dt * 32);
    }

    // 0. Render Expedition Zones (Fishing Dock & Mining Cave)
    renderExpeditionZones(ctx);

    // 1. Update and render active boss (floating above chatters)
    if (activeBoss && config.enableBossOverlay !== false) {
      activeBoss.update(dt);
      activeBoss.render(ctx);
    }

    // 2. Chatters
    const chatterList = Array.from(chatters.values());
    for (const ch of chatterList) {
      const alive = ch.update(dt, chatterList);
      if (!alive) {
        chatters.delete(ch.username.toLowerCase());
      }
    }

    chatterList.sort((a, b) => a.groundY - b.groundY);

    for (const ch of chatterList) {
      ch.render(ctx);
    }

    // 3. Particles & Projectiles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update(dt);
      p.render(ctx);
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    // 4. Boss Top HUD
    if (activeBoss && config.enableBossOverlay !== false) {
      activeBoss.renderHUD(ctx);
    }

    ctx.restore();

    requestAnimationFrame(loop);
  }

  async function init() {
    await Promise.all([loadAvatars(), loadExpeditionAssets()]);
    connectWebSocket();

    // Starter demo if empty
    setTimeout(() => {
      if (chatters.size === 0) {
        handleChat('StreamHost', 'Welcome to the stream! (=^･ω･^=)', 'avatar_01');
      }
    }, 1000);

    requestAnimationFrame(loop);
  }

  window.PixelChatter = {
    chatters,
    config,
    handleChat,
    handleEvent,
    handleChatAction,
    triggerPrimoRain,
    getActiveBoss: () => activeBoss,
    spawnCalamity: () => { if (activeBoss) spawnCalamityProjectile(activeBoss); }
  };

  init();
})();
