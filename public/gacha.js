// Genshin Gacha & Primogem OBS Overlay Client - Dedicated Wish Edition (v3.5)
(() => {
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${host}/ws`;
  let socket = null;
  let soundEnabled = true;

  // DOM Elements
  const wishSunburst = document.getElementById('wish-sunburst');
  const wishCard = document.getElementById('wish-card');
  const wishCardGlow = document.getElementById('wish-card-glow');
  const wishPaimonImg = document.getElementById('wish-paimon-img');
  const wishSpeech = document.getElementById('wish-speech');
  const wishBannerTag = document.getElementById('wish-banner-tag');
  const wishUsername = document.getElementById('wish-username');
  
  const wishStageBackglow = document.getElementById('wish-stage-backglow');
  const wishElementCrest = document.getElementById('wish-element-crest');
  const wishSplashImg = document.getElementById('wish-splash-img');
  
  const wishElementPill = document.getElementById('wish-element-pill');
  const wishElementIcon = document.getElementById('wish-element-icon');
  const wishElementText = document.getElementById('wish-element-text');
  
  const wishItemName = document.getElementById('wish-item-name');
  const wishItemTitle = document.getElementById('wish-item-title');
  const wishItemSub = document.getElementById('wish-item-sub');
  const wishStars = document.getElementById('wish-stars');
  const wishItemPity = document.getElementById('wish-item-pity');
  
  const wishRefundBanner = document.getElementById('wish-refund-banner');
  const wishRefundAmount = document.getElementById('wish-refund-amount');
  const primoRainBanner = document.getElementById('primo-rain-banner');
  const rainAmountText = document.getElementById('rain-amount-text');
  
  let wishDismissTimer = null;

  // Canvas for Visual FX
  const canvas = document.getElementById('effects-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Web Audio API Synthesizer for Gacha SFX
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, startTime, gainLevel = 0.2) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(gainLevel, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      // Audio autoplay policy
    }
  }

  // Sound Effects by Rarity
  function playWishReveal(rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (rarity === 5) {
        // Legendary 5★ Majestic Fanfare Arpeggio
        playTone(392.00, 'sine', 0.5, now, 0.25);        // G4
        playTone(493.88, 'sine', 0.5, now + 0.12, 0.25); // B4
        playTone(587.33, 'triangle', 0.6, now + 0.24, 0.3); // D5
        playTone(783.99, 'triangle', 0.8, now + 0.38, 0.35); // G5
        playTone(987.77, 'sine', 1.4, now + 0.52, 0.38); // B5
        playTone(1174.66, 'sine', 2.0, now + 0.68, 0.4); // D6
      } else if (rarity === 4) {
        // 4★ Violet Celestial Chime
        playTone(440.00, 'sine', 0.4, now, 0.22);        // A4
        playTone(554.37, 'sine', 0.5, now + 0.14, 0.24); // C#5
        playTone(659.25, 'triangle', 0.8, now + 0.28, 0.26); // E5
        playTone(880.00, 'sine', 1.2, now + 0.42, 0.3); // A5
      } else {
        // 3★ Crystal Drop
        playTone(523.25, 'sine', 0.3, now, 0.18);
        playTone(659.25, 'sine', 0.4, now + 0.1, 0.18);
      }
    } catch (e) {}
  }

  function playMeteorWhoosh() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.8);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.8);
    } catch (e) {}
  }

  function playRainChimes() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
      const now = ctx.currentTime;
      for (let i = 0; i < 7; i++) {
        const note = notes[Math.floor(Math.random() * notes.length)];
        playTone(note, 'sine', 0.35, now + i * 0.12, 0.15);
      }
    } catch (e) {}
  }

  // Particle System
  const particles = [];
  let meteor = null;

  function launchMeteor(rarity, onImpact) {
    playMeteorWhoosh();
    meteor = {
      x: canvas.width * 0.2,
      y: -50,
      targetX: canvas.width * 0.5,
      targetY: 180,
      speed: 18,
      rarity: rarity,
      trail: [],
      onImpact: onImpact
    };
  }

  function createConfettiBurst(x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.01,
        shape: Math.random() > 0.4 ? 'circle' : 'rect'
      });
    }
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render Meteor
    if (meteor) {
      const dx = meteor.targetX - meteor.x;
      const dy = meteor.targetY - meteor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      meteor.trail.push({ x: meteor.x, y: meteor.y, alpha: 1 });
      if (meteor.trail.length > 20) meteor.trail.shift();

      // Render Trail
      for (let i = 0; i < meteor.trail.length; i++) {
        const t = meteor.trail[i];
        t.alpha -= 0.05;
        ctx.beginPath();
        ctx.arc(t.x, t.y, (i / meteor.trail.length) * (meteor.rarity === 5 ? 14 : 9), 0, Math.PI * 2);
        ctx.fillStyle = meteor.rarity === 5 
          ? `rgba(255, 215, 0, ${Math.max(0, t.alpha)})`
          : meteor.rarity === 4 
            ? `rgba(192, 132, 252, ${Math.max(0, t.alpha)})`
            : `rgba(56, 189, 248, ${Math.max(0, t.alpha)})`;
        ctx.fill();
      }

      // Render Head
      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, meteor.rarity === 5 ? 18 : 12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = meteor.rarity === 5 ? 35 : 20;
      ctx.shadowColor = meteor.rarity === 5 ? '#ffd700' : meteor.rarity === 4 ? '#c084fc' : '#38bdf8';
      ctx.fill();
      ctx.shadowBlur = 0;

      if (dist < meteor.speed) {
        // Impact!
        const impactRarity = meteor.rarity;
        const ix = meteor.targetX;
        const iy = meteor.targetY;
        const cb = meteor.onImpact;
        meteor = null;

        const burstColors = impactRarity === 5 
          ? ['#ffd700', '#f59e0b', '#ffffff', '#fef08a', '#fbbf24']
          : impactRarity === 4
          ? ['#c084fc', '#e9d5ff', '#ffffff', '#a855f7', '#d8b4fe']
          : ['#38bdf8', '#bae6fd', '#ffffff', '#0284c7'];

        createConfettiBurst(ix, iy, impactRarity === 5 ? 150 : 85, burstColors);
        playWishReveal(impactRarity);
        if (cb) cb();
      } else {
        meteor.x += (dx / dist) * meteor.speed;
        meteor.y += (dy / dist) * meteor.speed;
      }
    }

    // 2. Render Falling & Burst Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.rotation += p.rotationSpeed;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(renderParticles);
  }
  requestAnimationFrame(renderParticles);

  // Element Metadata (Crests, Icons, Colors)
  const elementData = {
    Pyro: { icon: '🔥', crest: '🔥', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
    Hydro: { icon: '💧', crest: '💧', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
    Anemo: { icon: '🌪️', crest: '🌪️', color: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
    Electro: { icon: '⚡', crest: '⚡', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
    Dendro: { icon: '🌿', crest: '🌿', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
    Cryo: { icon: '❄️', crest: '❄️', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
    Geo: { icon: '🔶', crest: '🔶', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
    Weapon: { icon: '⚔️', crest: '⚔️', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.4)' }
  };

  // Fallback SVG Generator for Character / Weapon
  function getElementFallbackAvatar(name, element, rarity) {
    const meta = elementData[element] || elementData.Weapon;
    const color = meta.color;
    const initial = (name || '?').charAt(0).toUpperCase();

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#0d1222" stop-opacity="0.95"/>
        </radialGradient>
      </defs>
      <circle cx="150" cy="150" r="130" fill="url(#bg)" stroke="${color}" stroke-width="4"/>
      <text x="150" y="165" font-family="Cinzel, serif" font-size="80" font-weight="900" fill="#ffffff" text-anchor="middle">${initial}</text>
      <text x="150" y="240" font-family="Montserrat, sans-serif" font-size="20" font-weight="bold" fill="${color}" text-anchor="middle">${name}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // Multi-tier Resilient Image Loader
  function loadArtwork(pull, onLoaded) {
    const candidates = [];

    // 1. Direct Enka Splash Art (full wish illustration)
    if (pull.splashArt) {
      candidates.push(pull.splashArt);
      // 2. Server local cached proxy
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArt)}`);
    }

    // 3. Genshin.dev Splash Art
    if (pull.splashArtDev) {
      candidates.push(pull.splashArtDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArtDev)}`);
    }

    // 4. Portrait cutout
    if (pull.portrait) {
      candidates.push(pull.portrait);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.portrait)}`);
    }

    // 5. Remote Avatar Icon (Enka)
    if (pull.remoteIcon) {
      candidates.push(pull.remoteIcon);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIcon)}`);
    }

    // 6. Genshin.dev Icon
    if (pull.remoteIconDev) {
      candidates.push(pull.remoteIconDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIconDev)}`);
    }

    // 7. Local assets folder
    if (pull.icon) {
      candidates.push(pull.icon);
    }

    let index = 0;
    function tryNext() {
      if (index >= candidates.length) {
        const fallback = getElementFallbackAvatar(pull.name, pull.element, pull.rarity);
        wishSplashImg.src = fallback;
        if (onLoaded) onLoaded();
        return;
      }

      const currentUrl = candidates[index++];
      const testImg = new Image();
      testImg.onload = () => {
        wishSplashImg.src = currentUrl;
        if (onLoaded) onLoaded();
      };
      testImg.onerror = () => {
        tryNext();
      };
      testImg.src = currentUrl;
    }

    tryNext();
  }

  // Wish Card Show / Hide
  function hideWishCard() {
    if (wishCard) {
      wishCard.classList.add('hidden');
      wishCard.classList.remove('slide-out');
      wishCard.style.display = 'none';
    }
    if (wishSunburst) {
      wishSunburst.classList.add('hidden');
      wishSunburst.style.display = 'none';
    }
    if (wishRefundBanner) {
      wishRefundBanner.classList.add('hidden');
      wishRefundBanner.style.display = 'none';
    }
    if (wishDismissTimer) {
      clearTimeout(wishDismissTimer);
      wishDismissTimer = null;
    }
  }

  // Primogem Rain Effect
  let primoRainTimer = null;
  function triggerPrimoRain(amount) {
    if (rainAmountText) rainAmountText.textContent = `+${amount || 160} Primogem`;
    if (primoRainBanner) {
      primoRainBanner.style.display = 'flex';
      primoRainBanner.classList.remove('hidden');
    }

    playRainChimes();

    let rainTicks = 0;
    const rainInterval = setInterval(() => {
      rainTicks++;
      for (let i = 0; i < 6; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: -20,
          vx: (Math.random() - 0.5) * 3,
          vy: Math.random() * 5 + 3,
          size: Math.random() * 10 + 6,
          color: Math.random() > 0.4 ? '#ffd700' : '#60a5fa',
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          alpha: 1,
          decay: 0.007,
          shape: 'rect'
        });
      }
      if (rainTicks > 35) {
        clearInterval(rainInterval);
      }
    }, 100);

    if (primoRainTimer) clearTimeout(primoRainTimer);
    primoRainTimer = setTimeout(() => {
      if (primoRainBanner) {
        primoRainBanner.classList.add('hidden');
        primoRainBanner.style.display = 'none';
      }
    }, 6000);
  }

  // Gacha Wish Queue & Display
  let wishQueue = [];
  let isProcessingWish = false;

  function queueWish(wishData) {
    if (wishData.pulls && Array.isArray(wishData.pulls)) {
      wishData.pulls.forEach(pull => {
        wishQueue.push({
          username: wishData.username,
          pull: pull,
          stats: wishData.stats
        });
      });
    } else {
      wishQueue.push(wishData);
    }

    if (!isProcessingWish) {
      processNextWish();
    }
  }

  function processNextWish() {
    if (wishQueue.length === 0) {
      isProcessingWish = false;
      return;
    }

    isProcessingWish = true;
    const current = wishQueue.shift();
    const pull = current.pull || current;
    const username = current.username || 'Gezgin';
    const rarity = pull.rarity || 3;

    // Launch shooting star / meteor first
    launchMeteor(rarity, () => {
      // Impact! Reveal Wish Card
      showWishCard(username, pull, current.stats, () => {
        processNextWish();
      });
    });
  }

  function showWishCard(username, pull, stats, onComplete) {
    hideWishCard();

    const rarity = pull.rarity || 3;
    const element = pull.element || (pull.type === 'weapon' ? 'Weapon' : 'Geo');
    const name = pull.name || 'Genshin Item';
    const elemMeta = elementData[element] || elementData.Weapon;

    // 1. Rarity Classes
    wishCard.className = `card wish-card rarity-${rarity}`;
    wishCardGlow.className = `card-glow wish-glow-${rarity}`;

    // 2. Celestial Sunburst for 5★ and 4★
    if (wishSunburst) {
      if (rarity >= 4) {
        wishSunburst.className = `wish-sunburst rarity-${rarity}`;
        wishSunburst.classList.remove('hidden');
        wishSunburst.style.display = 'flex';
      } else {
        wishSunburst.classList.add('hidden');
        wishSunburst.style.display = 'none';
      }
    }

    // 3. User & Banner Tag
    wishUsername.textContent = username;
    if (rarity === 5) {
      wishBannerTag.textContent = '✨ 5★ EFSANEVİ DİLEK ✨';
      wishPaimonImg.src = 'assets/paimon_cheer.png';
      wishSpeech.textContent = 'İnanılmaz! 5 Yıldız Geldi! ⭐⭐⭐⭐⭐';
    } else if (rarity === 4) {
      wishBannerTag.textContent = '⭐ 4★ DEĞERLİ DİLEK';
      wishPaimonImg.src = 'assets/paimon_happy.png';
      wishSpeech.textContent = 'Harika bir 4 Yıldız! ⭐⭐⭐⭐';
    } else {
      wishBannerTag.textContent = '🗡️ 3★ DİLEK';
      wishPaimonImg.src = 'assets/paimon_thinking.png';
      wishSpeech.textContent = 'Bir dahakine kesin 5★ gelir! ✨';
    }

    // 4. Element Crest & Backglow
    if (wishStageBackglow) {
      wishStageBackglow.style.background = `radial-gradient(circle, ${elemMeta.glow} 0%, transparent 70%)`;
    }
    if (wishElementCrest) {
      wishElementCrest.textContent = elemMeta.crest;
    }

    // 5. Element Pill
    if (wishElementPill) {
      wishElementPill.className = `wish-element-pill elem-${element}`;
      if (wishElementIcon) wishElementIcon.textContent = elemMeta.icon;
      if (wishElementText) wishElementText.textContent = element.toUpperCase();
    }

    // 6. Name, Title, Region & Subtitle
    wishItemName.textContent = name;
    if (wishItemTitle) {
      if (pull.title) {
        wishItemTitle.textContent = pull.title;
        wishItemTitle.style.display = 'block';
      } else {
        wishItemTitle.style.display = 'none';
      }
    }

    const weaponType = pull.weaponType || pull.type || '';
    const region = pull.region ? ` • ${pull.region}` : '';
    wishItemSub.textContent = `${weaponType}${region}`;

    // 7. Stars
    wishStars.textContent = '★'.repeat(rarity);
    wishStars.className = `wish-stars stars-${rarity}`;

    // 8. Pity Information
    if (rarity === 5 && pull.pity5AtPull >= 40) {
      wishItemPity.textContent = '🌟 40/40 Pity Garantili 5★ Patlaması!';
      wishItemPity.style.display = 'inline-block';
    } else if (stats && stats.totalWishes) {
      wishItemPity.textContent = `Toplam Çekiş: ${stats.totalWishes} | 5★ Pity: ${stats.pity5 || 0}/40`;
      wishItemPity.style.display = 'inline-block';
    } else {
      wishItemPity.style.display = 'none';
    }

    // 9. Lucky Refund
    if (pull.isRefund && pull.refundAmount > 0) {
      wishRefundAmount.textContent = `+${pull.refundAmount} Primogem`;
      wishRefundBanner.style.display = 'block';
      wishRefundBanner.classList.remove('hidden');
    } else {
      wishRefundBanner.classList.add('hidden');
      wishRefundBanner.style.display = 'none';
    }

    // 10. Load Character Splash Art / Weapon Icon
    loadArtwork(pull, () => {
      // Reveal Card
      wishCard.style.display = 'block';
      wishCard.classList.remove('hidden');
      wishCard.classList.remove('slide-out');
    });

    // Display Duration
    let displayDuration = 5000;
    if (rarity === 5) {
      displayDuration = wishQueue.length > 2 ? 5000 : 7000;
    } else if (rarity === 4) {
      displayDuration = wishQueue.length > 2 ? 3500 : 5000;
    } else {
      displayDuration = wishQueue.length > 2 ? 2200 : 3200;
    }

    wishDismissTimer = setTimeout(() => {
      wishCard.classList.add('slide-out');
      if (wishSunburst) {
        wishSunburst.classList.add('hidden');
        wishSunburst.style.display = 'none';
      }
      setTimeout(() => {
        hideWishCard();
        if (onComplete) onComplete();
      }, 600);
    }, displayDuration);
  }

  // WebSocket Connection
  function connectWS() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Gacha Overlay] Sunucuya bağlandı.');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error('WS Parse hatası:', e);
      }
    };

    socket.onclose = () => {
      setTimeout(connectWS, 3000);
    };

    socket.onerror = (err) => {
      console.error('[Gacha Overlay] WS Hatası:', err);
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
        soundEnabled = msg.config?.soundEnabled ?? true;
        break;

      case 'CONFIG_UPDATED':
        soundEnabled = msg.config?.soundEnabled ?? true;
        break;

      case 'WISH_RESULT':
        queueWish(msg);
        break;

      case 'PRIMO_RAIN':
        triggerPrimoRain(msg.amount);
        break;

      default:
        break;
    }
  }

  // Initial State: Guarantee all banners and cards start hidden
  hideWishCard();
  if (primoRainBanner) {
    primoRainBanner.classList.add('hidden');
    primoRainBanner.style.display = 'none';
  }

  connectWS();
})();
