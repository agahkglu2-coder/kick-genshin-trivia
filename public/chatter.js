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
    despawnTimeout: 900, // seconds (15 minutes)
    maxChatters: 45,
    chatBubbleDuration: 5.5,
    showNameplates: true,
    showShadows: true,
    enableInteractions: true,
    enableCommands: true,
    vipOverrides: {},
  };

  // State
  let currentCrownWinner = null;
  let avatarRegistry = [];
  const loadedSprites = {};
  const chatters = new Map();
  const particles = [];
  let lastTimestamp = 0;
  let socket = null;

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
      this.type = type; // "heart", "star", "confetti", "coin", "sleep_z", "dust"
      this.life = options.life || rand(1.0, 2.5);
      this.maxLife = this.life;
      this.color = options.color || '#ff4f81';
      this.size = options.size || rand(4, 7);
      this.gravity = options.gravity !== undefined ? options.gravity : 150;
      this.bounce = options.bounce || 0;
      this.text = options.text || 'z';
      this.rot = rand(0, Math.PI * 2);
      this.vrot = rand(-4, 4);
    }

    update(dt) {
      this.life -= dt;
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
    ctx.save();
    ctx.font = '15px sans-serif';
    const metrics = ctx.measureText(icon);
    const bw = metrics.width + 12;
    const bh = 22;
    const bx = x - bw / 2;
    const by = y - bh;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(x - 3, by + bh);
    ctx.lineTo(x, by + bh + 4);
    ctx.lineTo(x + 3, by + bh);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();

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
      if (config.enableInteractions !== false && !this.targetChatter && !this.isDancing && !this.isDizzy && !this.isDespawning && this.state !== 'jump') {
        this.socialCooldown -= dt;
        if (this.socialCooldown <= 0) {
          for (const other of allChatters) {
            if (other === this || other.targetChatter || other.isDespawning || other.state === 'jump') continue;
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
      }

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

      // Soft Avoidance
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

      const scale = config.scale * this.spawnScale;
      const w = sprite.width * scale;
      const h = sprite.height * scale;

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

      if (this.facing < 0 && (this.state === 'run' || this.state === 'jump' || this.state === 'idle')) {
        ctx.scale(-1, 1);
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

      // 5. Mini Reaction Bubble
      if (this.reactionIcon && this.reactionTimer > 0) {
        renderReactionBubble(ctx, this.reactionIcon, this.x, this.y - h - (hasCrownNow ? 26 : 8));
      }

      // 6. Nameplates with Loyalty Badges
      if (config.showNameplates) {
        this.renderNameplate(ctx, h, hasCrownNow);
      }

      // 7. Speech Bubble
      if (this.bubbleText && this.bubbleAlpha > 0) {
        this.renderSpeechBubble(ctx, h, hasCrownNow);
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

      const fontSize = Math.round(11 * (config.scale / 2.5));
      ctx.font = `bold ${fontSize}px 'Fredoka', 'Segoe UI', sans-serif`;
      const displayText = `${badge} ${this.username}`;
      const textMetrics = ctx.measureText(displayText);
      const paddingX = 8;
      const paddingY = 3;
      const pillW = textMetrics.width + paddingX * 2;
      const pillH = fontSize + paddingY * 2;
      const pillX = this.x - pillW / 2;
      const pillY = this.y - spriteHeight - pillH - (hasCrown ? 20 : 4);

      ctx.fillStyle = 'rgba(15, 18, 25, 0.78)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();

      ctx.strokeStyle = hasCrown ? '#ffd700' : this.color;
      ctx.lineWidth = hasCrown ? 2 : 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, this.x, pillY + pillH / 2);
    }

    renderSpeechBubble(ctx, spriteHeight, hasCrown) {
      ctx.save();
      ctx.globalAlpha = this.bubbleAlpha * this.despawnAlpha;

      const maxCharsPerLine = 24;
      const lines = wrapText(this.bubbleText, maxCharsPerLine);
      const fontSize = Math.round(12 * (config.scale / 2.5));
      ctx.font = `600 ${fontSize}px 'Fredoka', 'Segoe UI', sans-serif`;

      let maxLineW = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxLineW) maxLineW = w;
      }

      const padX = 12;
      const padY = 8;
      const lineH = fontSize * 1.35;
      const bubbleW = Math.max(50, maxLineW + padX * 2);
      const bubbleH = lines.length * lineH + padY * 2;

      let bubbleX = this.x - bubbleW / 2;
      bubbleX = Math.max(15, Math.min(1920 - bubbleW - 15, bubbleX));
      const bubbleY = this.y - spriteHeight - (hasCrown ? 46 : 32) - bubbleH;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#22252e';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 8);
      ctx.fill();
      ctx.stroke();

      const tailX = Math.max(bubbleX + 12, Math.min(bubbleX + bubbleW - 12, this.x));
      ctx.beginPath();
      ctx.moveTo(tailX - 6, bubbleY + bubbleH);
      ctx.lineTo(tailX, bubbleY + bubbleH + 7);
      ctx.lineTo(tailX + 6, bubbleY + bubbleH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e212b';
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

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.update(dt);
      p.render(ctx);
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    requestAnimationFrame(loop);
  }

  async function init() {
    await loadAvatars();
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
  };

  init();
})();
