// Genshin Gacha & Primogem OBS Overlay Client - Dedicated Wish Edition (v4.0)
(() => {
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${host}/ws`;
  let socket = null;
  let soundEnabled = true;

  // DOM Elements
  const overlayContainer = document.getElementById('overlay-container');
  const wishTickerBar = document.getElementById('wish-ticker-bar');
  const tickerText = document.getElementById('ticker-text');

  const wishMeteorStage = document.getElementById('wish-meteor-stage');
  const meteorSkyGlow = document.getElementById('meteor-sky-glow');
  const meteorComet = document.getElementById('meteor-comet');
  const meteorImpactFlash = document.getElementById('meteor-impact-flash');

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

  const wishMultiGrid = document.getElementById('wish-multi-grid');
  const multiUsername = document.getElementById('multi-username');
  const multiCardsContainer = document.getElementById('multi-cards-container');
  const multiSummaryText = document.getElementById('multi-summary-text');

  const primoRainBanner = document.getElementById('primo-rain-banner');
  const rainAmountText = document.getElementById('rain-amount-text');
  
  let wishDismissTimer = null;

  // Canvas for Particle FX
  const canvas = document.getElementById('effects-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ========================================================
  // WEB AUDIO API SYNTHESIZER FOR GENSHIN SFX
  // ========================================================
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
    } catch (e) {}
  }

  function playMeteorSound(rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Descending cosmic whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(rarity === 5 ? 750 : 500, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 1.0);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.0);

      // Shimmering chimes as meteor travels
      for (let i = 0; i < 5; i++) {
        playTone(600 + i * 180, 'sine', 0.2, now + i * 0.18, 0.08);
      }
    } catch (e) {}
  }

  function playRevealFanfare(rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (rarity === 5) {
        // Deep Impact + Royal Orchestral Jingle
        playTone(85, 'sine', 0.8, now, 0.4);
        playTone(130, 'triangle', 0.6, now, 0.3);

        const notes = [261.63, 392.00, 523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
          playTone(freq, idx > 4 ? 'sine' : 'triangle', 1.8, now + 0.08 * idx, 0.28);
        });

        // Golden shimmer bells
        for (let i = 0; i < 8; i++) {
          playTone(1200 + Math.random() * 800, 'sine', 0.6, now + 0.4 + i * 0.12, 0.12);
        }
      } else if (rarity === 4) {
        // Violet Starlight Chime
        playTone(110, 'sine', 0.5, now, 0.25);
        const notes4 = [349.23, 440.00, 523.25, 698.46, 880.00, 1046.50];
        notes4.forEach((freq, idx) => {
          playTone(freq, 'sine', 1.2, now + 0.08 * idx, 0.22);
        });
      } else {
        // 3★ Crystal Drop
        playTone(523.25, 'sine', 0.3, now, 0.16);
        playTone(659.25, 'sine', 0.4, now + 0.1, 0.16);
      }
    } catch (e) {}
  }

  function playGridCardPop(idx, rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const baseFreq = rarity === 5 ? 880 : rarity === 4 ? 660 : 440;
      playTone(baseFreq + idx * 35, 'sine', 0.25, now, 0.15);
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

  // ========================================================
  // CELEBRATION & SCREEN SHAKE
  // ========================================================
  function triggerScreenShake() {
    if (overlayContainer) {
      overlayContainer.classList.remove('screen-shake');
      void overlayContainer.offsetWidth;
      overlayContainer.classList.add('screen-shake');
      setTimeout(() => {
        overlayContainer.classList.remove('screen-shake');
      }, 850);
    }
  }

  function updateTicker(username, characterName, rarity) {
    if (!wishTickerBar || !tickerText) return;
    const starStr = '★'.repeat(rarity || 5);
    tickerText.innerHTML = `<span style="color:#ffd700;">🌟 @${escapeHtml(username)}</span> az önce <strong style="color:${rarity === 5 ? '#ffd700' : '#c084fc'};">${rarity}★ ${escapeHtml(characterName)}</strong> çıkardı!`;
    wishTickerBar.classList.remove('hidden');
    wishTickerBar.style.display = 'flex';
  }

  // Particle System
  const particles = [];
  let meteor = null;

  function launchMeteor(rarity, onImpact) {
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
      const speed = Math.random() * 9 + 3;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 14,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.009,
        shape: Math.random() > 0.4 ? 'circle' : 'rect'
      });
    }
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render Canvas Meteor
    if (meteor) {
      const dx = meteor.targetX - meteor.x;
      const dy = meteor.targetY - meteor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      meteor.trail.push({ x: meteor.x, y: meteor.y, alpha: 1 });
      if (meteor.trail.length > 20) meteor.trail.shift();

      for (let i = 0; i < meteor.trail.length; i++) {
        const t = meteor.trail[i];
        t.alpha -= 0.05;
        ctx.beginPath();
        ctx.arc(t.x, t.y, (i / meteor.trail.length) * (meteor.rarity === 5 ? 15 : 10), 0, Math.PI * 2);
        ctx.fillStyle = meteor.rarity === 5 
          ? `rgba(255, 215, 0, ${Math.max(0, t.alpha)})`
          : meteor.rarity === 4 
            ? `rgba(192, 132, 252, ${Math.max(0, t.alpha)})`
            : `rgba(56, 189, 248, ${Math.max(0, t.alpha)})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, meteor.rarity === 5 ? 18 : 12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = meteor.rarity === 5 ? 35 : 20;
      ctx.shadowColor = meteor.rarity === 5 ? '#ffd700' : meteor.rarity === 4 ? '#c084fc' : '#38bdf8';
      ctx.fill();
      ctx.shadowBlur = 0;

      if (dist < meteor.speed) {
        const impactRarity = meteor.rarity;
        const ix = meteor.targetX;
        const iy = meteor.targetY;
        const cb = meteor.onImpact;
        meteor = null;

        const burstColors = impactRarity === 5 
          ? ['#ffd700', '#f59e0b', '#ffffff', '#fef08a', '#fbbf24', '#eab308']
          : impactRarity === 4
          ? ['#c084fc', '#e9d5ff', '#ffffff', '#a855f7', '#d8b4fe']
          : ['#38bdf8', '#bae6fd', '#ffffff', '#0284c7'];

        createConfettiBurst(ix, iy, impactRarity === 5 ? 180 : 90, burstColors);
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

  function loadArtwork(pull, onLoaded) {
    const candidates = [];
    if (pull.splashArt) {
      candidates.push(pull.splashArt);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArt)}`);
    }
    if (pull.splashArtDev) {
      candidates.push(pull.splashArtDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArtDev)}`);
    }
    if (pull.portrait) {
      candidates.push(pull.portrait);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.portrait)}`);
    }
    if (pull.remoteIcon) {
      candidates.push(pull.remoteIcon);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIcon)}`);
    }
    if (pull.remoteIconDev) {
      candidates.push(pull.remoteIconDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIconDev)}`);
    }
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

  function loadCardThumbnail(img, pull) {
    const candidates = [];
    if (pull.remoteIcon) {
      candidates.push(pull.remoteIcon);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIcon)}`);
    }
    if (pull.remoteIconDev) {
      candidates.push(pull.remoteIconDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.remoteIconDev)}`);
    }
    if (pull.portrait) {
      candidates.push(pull.portrait);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.portrait)}`);
    }
    if (pull.splashArt) {
      candidates.push(pull.splashArt);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArt)}`);
    }
    if (pull.splashArtDev) {
      candidates.push(pull.splashArtDev);
      candidates.push(`/api/asset-proxy?url=${encodeURIComponent(pull.splashArtDev)}`);
    }
    if (pull.icon) {
      candidates.push(pull.icon);
    }

    const fallback = getElementFallbackAvatar(pull.name, pull.element, pull.rarity);
    if (!candidates.length) {
      img.src = fallback;
      return;
    }

    let candidateIdx = 0;
    img.onerror = () => {
      if (candidateIdx < candidates.length) {
        img.src = candidates[candidateIdx++];
      } else {
        img.onerror = null;
        img.src = fallback;
      }
    };

    img.src = candidates[candidateIdx++];
  }

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

  // ========================================================
  // METEOR STAGE TRIGGER
  // ========================================================
  function triggerMeteorStage(rarity, onImpact) {
    if (!wishMeteorStage) {
      playRevealFanfare(rarity);
      if (onImpact) onImpact();
      return;
    }

    playMeteorSound(rarity);
    launchMeteor(rarity, null);

    wishMeteorStage.classList.remove('hidden');
    wishMeteorStage.style.display = 'block';

    if (meteorSkyGlow) {
      meteorSkyGlow.className = `meteor-sky-glow glow-${rarity}`;
    }

    if (meteorComet) {
      const cometHead = meteorComet.querySelector('.comet-head');
      const cometTail = meteorComet.querySelector('.comet-tail');
      if (cometHead) cometHead.className = `comet-head ${rarity === 4 ? 'head-4' : rarity === 3 ? 'head-3' : ''}`;
      if (cometTail) cometTail.className = `comet-tail ${rarity === 4 ? 'tail-4' : rarity === 3 ? 'tail-3' : ''}`;

      meteorComet.classList.remove('comet-streak');
      void meteorComet.offsetWidth;
      meteorComet.classList.add('comet-streak');
    }

    setTimeout(() => {
      if (meteorImpactFlash) {
        meteorImpactFlash.classList.add('flash-active');
      }

      if (rarity === 5) {
        triggerScreenShake();
      }

      playRevealFanfare(rarity);

      setTimeout(() => {
        wishMeteorStage.classList.add('hidden');
        wishMeteorStage.style.display = 'none';
        if (meteorImpactFlash) meteorImpactFlash.classList.remove('flash-active');
        if (onImpact) onImpact();
      }, 350);
    }, 900);
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

  // ========================================================
  // SMART PRIORITY QUEUE
  // ========================================================
  let wishQueue = [];
  let isProcessingWish = false;

  function queueWish(wishData) {
    const is10Pull = wishData.is10Pull || (Array.isArray(wishData.pulls) && wishData.pulls.length >= 10);
    const highestRarity = wishData.highestRarity || (Array.isArray(wishData.pulls) ? Math.max(...wishData.pulls.map(p => p.rarity || 3)) : 3);
    const featuredPull = wishData.featuredPull || (Array.isArray(wishData.pulls) 
      ? (wishData.pulls.find(p => p.rarity === 5) || wishData.pulls.find(p => p.rarity === 4) || wishData.pulls[0])
      : null);

    const queueItem = {
      username: wishData.username || 'Gezgin',
      pulls: wishData.pulls || [],
      is10Pull: is10Pull,
      highestRarity: highestRarity,
      featuredPull: featuredPull,
      stats: wishData.stats
    };

    if (Array.isArray(wishData.pulls)) {
      const top5 = wishData.pulls.find(p => p.rarity === 5);
      if (top5) {
        updateTicker(wishData.username, top5.name, 5);
      }
    }

    if (highestRarity === 5) {
      wishQueue.unshift(queueItem);
    } else {
      wishQueue.push(queueItem);
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
    const item = wishQueue.shift();
    const highestRarity = item.highestRarity || 3;

    // Phase 1: Launch Celestial Meteor
    triggerMeteorStage(highestRarity, () => {
      if (item.is10Pull && item.pulls.length >= 10) {
        // Tam Genshin Akışı: Önce öne çıkan karakterin büyük vitrini, ardından 10'lu ızgara!
        showWishCard(item.username, item.featuredPull, item.stats, () => {
          showMultiGrid(item.username, item.pulls, () => {
            processNextWish();
          });
        }, true); // isPart10 = true (shorter single card duration)
      } else {
        // Tekli dilek
        showWishCard(item.username, item.featuredPull || item.pulls[0], item.stats, () => {
          processNextWish();
        }, false);
      }
    });
  }

  // ========================================================
  // SINGLE / FEATURED WISH CARD SHOWCASE
  // ========================================================
  function showWishCard(username, pull, stats, onComplete, isPart10 = false) {
    hideWishCard();
    if (!pull) {
      if (onComplete) onComplete();
      return;
    }

    const rarity = pull.rarity || 3;
    const element = pull.element || (pull.type === 'weapon' ? 'Weapon' : 'Geo');
    const name = pull.name || 'Genshin Item';
    const elemMeta = elementData[element] || elementData.Weapon;

    wishCard.className = `card wish-card rarity-${rarity}`;
    wishCardGlow.className = `card-glow wish-glow-${rarity}`;

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

    if (wishStageBackglow) {
      wishStageBackglow.style.background = `radial-gradient(circle, ${elemMeta.glow} 0%, transparent 70%)`;
    }
    if (wishElementCrest) {
      wishElementCrest.textContent = elemMeta.crest;
    }

    if (wishElementPill) {
      wishElementPill.className = `wish-element-pill elem-${element}`;
      if (wishElementIcon) wishElementIcon.textContent = elemMeta.icon;
      if (wishElementText) wishElementText.textContent = element.toUpperCase();
    }

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

    wishStars.textContent = '★'.repeat(rarity);
    wishStars.className = `wish-stars stars-${rarity}`;

    if (rarity === 5 && pull.pity5AtPull >= 75) {
      wishItemPity.textContent = '🌟 75/75 Pity Garantili 5★ Patlaması!';
      wishItemPity.style.display = 'inline-block';
    } else if (stats && stats.totalWishes) {
      wishItemPity.textContent = `Toplam Çekiş: ${stats.totalWishes} | 5★ Pity: ${stats.pity5 || 0}/75`;
      wishItemPity.style.display = 'inline-block';
    } else {
      wishItemPity.style.display = 'none';
    }

    if (pull.isRefund && pull.refundAmount > 0) {
      wishRefundAmount.textContent = `+${pull.refundAmount} Primogem`;
      wishRefundBanner.style.display = 'block';
      wishRefundBanner.classList.remove('hidden');
    } else {
      wishRefundBanner.classList.add('hidden');
      wishRefundBanner.style.display = 'none';
    }

    loadArtwork(pull, () => {
      wishCard.style.display = 'block';
      wishCard.classList.remove('hidden');
      wishCard.classList.remove('slide-out');
    });

    let displayDuration = 4500;
    if (isPart10) {
      displayDuration = rarity === 5 ? 4200 : 3200;
    } else {
      if (rarity === 5) {
        displayDuration = wishQueue.length > 2 ? 4500 : 6500;
      } else if (rarity === 4) {
        displayDuration = wishQueue.length > 2 ? 3200 : 4500;
      } else {
        displayDuration = wishQueue.length > 2 ? 2000 : 3000;
      }
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
      }, 500);
    }, displayDuration);
  }

  // ========================================================
  // 10-CARD MULTI-GRID SHOWCASE
  // ========================================================
  function showMultiGrid(username, pulls, onComplete) {
    hideWishCard();
    if (!wishMultiGrid || !multiCardsContainer) {
      if (onComplete) onComplete();
      return;
    }

    multiUsername.textContent = username;
    multiCardsContainer.innerHTML = '';

    const sortedPulls = [...pulls].sort((a, b) => (b.rarity || 3) - (a.rarity || 3));
    const fiveStarsCount = sortedPulls.filter(p => p.rarity === 5).length;
    const fourStarsCount = sortedPulls.filter(p => p.rarity === 4).length;

    let summary = '🌟 10 Çekiliş Tamamlandı!';
    if (fiveStarsCount > 0) {
      summary = `🎉 İNANILMAZ ŞANS! ${fiveStarsCount}x 5★ Karakter Kazandın!`;
      triggerScreenShake();
    } else if (fourStarsCount > 0) {
      summary = `⭐ Tebrikler! ${fourStarsCount}x 4★ Öğe Kazandın!`;
    }
    if (multiSummaryText) multiSummaryText.textContent = summary;

    sortedPulls.slice(0, 10).forEach((pull, idx) => {
      const card = document.createElement('div');
      card.className = `multi-item-card card-rarity-${pull.rarity || 3}`;
      card.style.animationDelay = `${idx * 0.08}s`;

      const artWrap = document.createElement('div');
      artWrap.className = 'multi-card-art-wrap';

      const img = document.createElement('img');
      img.className = 'multi-card-art';
      img.alt = pull.name;
      loadCardThumbnail(img, pull);

      artWrap.appendChild(img);

      const nameEl = document.createElement('div');
      nameEl.className = 'multi-card-name';
      nameEl.textContent = pull.name;

      const starsEl = document.createElement('div');
      starsEl.className = `multi-card-stars stars-${pull.rarity || 3}`;
      starsEl.textContent = '★'.repeat(pull.rarity || 3);

      card.appendChild(artWrap);
      card.appendChild(nameEl);
      card.appendChild(starsEl);

      multiCardsContainer.appendChild(card);

      setTimeout(() => {
        playGridCardPop(idx, pull.rarity || 3);
      }, idx * 75);
    });

    wishMultiGrid.style.display = 'flex';
    wishMultiGrid.classList.remove('hidden');

    const duration = wishQueue.length > 1 ? 4000 : 6500;
    setTimeout(() => {
      wishMultiGrid.classList.add('hidden');
      wishMultiGrid.style.display = 'none';
      if (onComplete) onComplete();
    }, duration);
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

  hideWishCard();
  if (wishMultiGrid) {
    wishMultiGrid.classList.add('hidden');
    wishMultiGrid.style.display = 'none';
  }
  if (primoRainBanner) {
    primoRainBanner.classList.add('hidden');
    primoRainBanner.style.display = 'none';
  }

  connectWS();
})();
