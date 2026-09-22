// Genshin Trivia OBS Overlay Client - Paimon Edition
(() => {
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${host}/ws`;
  let socket = null;
  let totalQuestionDuration = 45;
  let soundEnabled = true;

  // DOM Elements
  const questionWrapper = document.getElementById('question-wrapper');
  const paimonSpeech = document.getElementById('paimon-speech');
  const questionCard = document.getElementById('question-card');
  const questionText = document.getElementById('question-text');
  const questionHint = document.getElementById('question-hint');
  const questionCategory = document.getElementById('question-category');
  const questionDifficulty = document.getElementById('question-difficulty');
  const timerBar = document.getElementById('timer-bar');
  const timerSeconds = document.getElementById('timer-seconds');

  const winnerCard = document.getElementById('winner-card');
  const winnerUsername = document.getElementById('winner-username');
  const winnerAvatar = document.getElementById('winner-avatar');
  const winnerWinsCount = document.getElementById('winner-wins-count');
  const winnerAnswer = document.getElementById('winner-answer');

  const timeoutCard = document.getElementById('timeout-card');
  const timeoutCorrectAnswer = document.getElementById('timeout-correct-answer');

  const leaderboardCard = document.getElementById('leaderboard-card');
  const leaderboardListWrap = document.getElementById('leaderboard-list-wrap');
  const leaderboardRequestedBy = document.getElementById('leaderboard-requested-by');
  let leaderboardHideTimer = null;

  // Gacha Wish & Primo Rain DOM Elements
  const wishCard = document.getElementById('wish-card');
  const wishCardGlow = document.getElementById('wish-card-glow');
  const wishPaimonImg = document.getElementById('wish-paimon-img');
  const wishSpeech = document.getElementById('wish-speech');
  const wishBannerTag = document.getElementById('wish-banner-tag');
  const wishUsername = document.getElementById('wish-username');
  const wishAvatarFrame = document.getElementById('wish-avatar-frame');
  const wishAvatarImg = document.getElementById('wish-avatar-img');
  const wishElementBadge = document.getElementById('wish-element-badge');
  const wishStars = document.getElementById('wish-stars');
  const wishItemName = document.getElementById('wish-item-name');
  const wishItemSub = document.getElementById('wish-item-sub');
  const wishItemPity = document.getElementById('wish-item-pity');
  const wishRefundBanner = document.getElementById('wish-refund-banner');
  const wishRefundAmount = document.getElementById('wish-refund-amount');
  const primoRainBanner = document.getElementById('primo-rain-banner');
  const rainAmountText = document.getElementById('rain-amount-text');
  let wishDismissTimer = null;

  const canvas = document.getElementById('effects-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Web Audio API Synthesizer for Zero-Asset Sound Effects
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
      console.warn('Audio play error:', e);
    }
  }

  function playQuestionChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        playTone(freq, 'sine', 0.8, now + idx * 0.12, 0.25);
      });
    } catch (e) {}
  }

  function playVictoryFanfare() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [392.00, 523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        playTone(freq, 'triangle', 0.6, now + idx * 0.1, 0.3);
      });
      setTimeout(() => {
        const chordNow = ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq) => {
          playTone(freq, 'sine', 1.8, chordNow, 0.2);
        });
      }, 450);
    } catch (e) {}
  }

  function playWishWhoosh(rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      const startFreq = rarity === 5 ? 1200 : rarity === 4 ? 900 : 700;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.65);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch (e) {}
  }

  function playWishReveal(rarity) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (rarity === 5) {
        // Grand 5-Star Royal Gold Fanfare
        const chord1 = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
        chord1.forEach(f => playTone(f, 'triangle', 1.2, now, 0.25));

        setTimeout(() => {
          const t = ctx.currentTime;
          const chord2 = [880.00, 1174.66, 1479.98, 1760.00]; // Shimmer
          chord2.forEach(f => playTone(f, 'sine', 2.2, t, 0.28));
        }, 320);
      } else if (rarity === 4) {
        // Magical 4-Star Violet Chime
        const chord = [659.25, 830.61, 987.77, 1318.51];
        chord.forEach((f, idx) => playTone(f, 'sine', 1.4, now + idx * 0.05, 0.22));
      } else {
        // 3-Star Crisp Bell
        [523.25, 659.25, 783.99].forEach((f, idx) => playTone(f, 'sine', 0.8, now + idx * 0.06, 0.15));
      }
    } catch (e) {}
  }

  function playRainChimes() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523, 659, 784, 1046, 1175, 1318, 1568];
      notes.forEach((f, idx) => {
        playTone(f, 'sine', 0.9, now + idx * 0.08, 0.18);
      });
    } catch (e) {}
  }

  // Particle & Confetti System
  let particles = [];
  let activeMeteor = null;

  function createConfettiBurst(x, y, count = 80, customColors = null) {
    const colors = customColors || ['#ffd700', '#f5d77f', '#53fc18', '#60a5fa', '#f43f5e', '#a855f7', '#ffffff'];
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
        rotationSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.008,
        shape: Math.random() > 0.4 ? 'rect' : 'circle'
      });
    }
  }

  function launchMeteor(rarity, onImpact) {
    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -40 : canvas.width + 40;
    const startY = -40;
    const targetX = canvas.width / 2;
    const targetY = canvas.height * 0.35;

    activeMeteor = {
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      startX,
      startY,
      targetX,
      targetY,
      progress: 0,
      speed: 0.038,
      rarity,
      color: rarity === 5 ? '#ffd700' : rarity === 4 ? '#c084fc' : '#38bdf8',
      onImpact
    };

    playWishWhoosh(rarity);
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render Active Meteor
    if (activeMeteor) {
      activeMeteor.prevX = activeMeteor.x;
      activeMeteor.prevY = activeMeteor.y;
      activeMeteor.progress += activeMeteor.speed;

      const t = Math.min(1, activeMeteor.progress);
      activeMeteor.x = activeMeteor.startX + (activeMeteor.targetX - activeMeteor.startX) * t;
      activeMeteor.y = activeMeteor.startY + (activeMeteor.targetY - activeMeteor.startY) * t;

      // Trail sparks behind meteor
      for (let s = 0; s < 3; s++) {
        particles.push({
          x: activeMeteor.x + (Math.random() - 0.5) * 14,
          y: activeMeteor.y + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: Math.random() * 6 + 3,
          color: activeMeteor.color,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 8,
          alpha: 0.9,
          decay: 0.04,
          shape: 'circle'
        });
      }

      // Draw meteor streak
      ctx.save();
      ctx.shadowBlur = activeMeteor.rarity === 5 ? 30 : 20;
      ctx.shadowColor = activeMeteor.color;
      ctx.strokeStyle = activeMeteor.color;
      ctx.lineWidth = activeMeteor.rarity === 5 ? 10 : 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(activeMeteor.prevX, activeMeteor.prevY);
      ctx.lineTo(activeMeteor.x, activeMeteor.y);
      ctx.stroke();

      // White inner core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(activeMeteor.prevX, activeMeteor.prevY);
      ctx.lineTo(activeMeteor.x, activeMeteor.y);
      ctx.stroke();
      ctx.restore();

      if (activeMeteor.progress >= 1) {
        const impactRarity = activeMeteor.rarity;
        const cb = activeMeteor.onImpact;
        const ix = activeMeteor.targetX;
        const iy = activeMeteor.targetY;
        activeMeteor = null;

        const burstColors = impactRarity === 5
          ? ['#ffd700', '#fef08a', '#ffffff', '#fbbf24']
          : impactRarity === 4
          ? ['#c084fc', '#e9d5ff', '#ffffff', '#a855f7']
          : ['#38bdf8', '#bae6fd', '#ffffff', '#0284c7'];

        createConfettiBurst(ix, iy, impactRarity === 5 ? 120 : 70, burstColors);
        playWishReveal(impactRarity);
        if (cb) cb();
      }
    }

    // 2. Render Normal Particles
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

  // Card Controls
  const paimonQuotes = [
    "Gezgin, soru geldi! 💬",
    "Paimon soruyor, bil bakalım! ⭐",
    "Acil durum yemeği değil, soru! ✨",
    "Hadi bakalım, cevabı kim biliyor? 🎯",
    "Paimon'un favori sorusu bu! 🌟",
    "Doğru bilene primogem yok ama şan var! 💎"
  ];

  function hideAllCards() {
    if (questionWrapper) {
      questionWrapper.classList.add('hidden');
      questionWrapper.classList.remove('slide-out');
    }
    if (winnerCard) winnerCard.classList.add('hidden');
    if (timeoutCard) timeoutCard.classList.add('hidden');
    if (leaderboardCard) {
      leaderboardCard.classList.add('hidden');
      leaderboardCard.classList.remove('slide-out');
    }
    if (wishCard) {
      wishCard.classList.add('hidden');
      wishCard.classList.remove('slide-out');
    }
    if (leaderboardHideTimer) {
      clearTimeout(leaderboardHideTimer);
      leaderboardHideTimer = null;
    }
    if (wishDismissTimer) {
      clearTimeout(wishDismissTimer);
      wishDismissTimer = null;
    }
  }

  function showQuestion(q, duration) {
    hideAllCards();
    totalQuestionDuration = duration || 45;

    questionText.textContent = q.question;
    questionHint.textContent = q.hint ? `İpucu: ${q.hint}` : '';
    questionCategory.textContent = q.category || 'Genshin';
    questionDifficulty.textContent = q.difficulty || 'Normal';

    // Random Paimon quote
    if (paimonSpeech) {
      const quote = paimonQuotes[Math.floor(Math.random() * paimonQuotes.length)];
      paimonSpeech.innerHTML = `<span class="speech-text">${quote}</span>`;
    }

    timerBar.style.width = '100%';
    timerSeconds.textContent = `${totalQuestionDuration}s`;

    if (questionWrapper) {
      questionWrapper.classList.remove('hidden');
      questionWrapper.classList.remove('slide-out');
    }

    // Sparkle trail for Paimon
    setTimeout(() => {
      if (questionWrapper) {
        const rect = questionWrapper.getBoundingClientRect();
        createConfettiBurst(rect.left + 80, rect.top + 150, 40);
      }
    }, 400);

    playQuestionChime();
  }

  function updateTimer(remaining) {
    if (!questionWrapper || questionWrapper.classList.contains('hidden')) return;
    const pct = Math.max(0, Math.min(100, (remaining / totalQuestionDuration) * 100));
    timerBar.style.width = `${pct}%`;
    timerSeconds.textContent = `${remaining}s`;
  }

  function showWinner(winData) {
    hideAllCards();

    winnerUsername.textContent = winData.winner.username;
    winnerAnswer.textContent = `"${winData.answerGiven}"`;
    winnerWinsCount.textContent = `🏆 ${winData.winsCount || 1}. Galibiyeti`;

    if (winData.winner.profilePic) {
      winnerAvatar.src = winData.winner.profilePic;
    } else {
      winnerAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23223049'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%23e4c47b'/%3E%3Cpath d='M24 82 C24 64 36 58 50 58 C64 58 76 64 76 82 Z' fill='%23e4c47b'/%3E%3C/svg%3E";
    }

    winnerCard.classList.remove('hidden');

    const rect = winnerCard.getBoundingClientRect();
    createConfettiBurst(rect.left + rect.width / 2, rect.top + 80, 100);
    createConfettiBurst(rect.left + 50, rect.top + 120, 50);
    createConfettiBurst(rect.right - 50, rect.top + 120, 50);
    playVictoryFanfare();
  }

  function showTimeout(timeoutData) {
    hideAllCards();
    const answers = timeoutData.correctAnswers || (timeoutData.question && timeoutData.question.answers) || [];
    timeoutCorrectAnswer.textContent = answers.join(' / ');
    timeoutCard.classList.remove('hidden');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function showLeaderboard(data) {
    hideAllCards();

    const leaders = data.leaderboard || [];
    if (leaderboardRequestedBy) {
      leaderboardRequestedBy.textContent = data.requestedBy ? `Chate !sıralama yazan: @${data.requestedBy}` : 'Günün Sıralaması';
    }

    if (!leaders || leaders.length === 0) {
      leaderboardListWrap.innerHTML = `
        <div class="lb-empty-msg">
          ✨ Henüz soru kazananı yok! Soruları ilk cevaplayan sen ol ve zirveye yerleş!
        </div>
      `;
    } else {
      const medals = ['🥇', '🥈', '🥉', '⭐', '⭐'];
      leaderboardListWrap.innerHTML = leaders.map((item, idx) => {
        const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23223049'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%23e4c47b'/%3E%3Cpath d='M24 82 C24 64 36 58 50 58 C64 58 76 64 76 82 Z' fill='%23e4c47b'/%3E%3C/svg%3E";
        const avatarUrl = item.profilePic || defaultAvatar;

        return `
          <div class="lb-row ${rankClass}">
            <div class="lb-user-info">
              <span class="lb-rank-badge">${medals[idx] || (idx + 1)}</span>
              <img src="${avatarUrl}" class="lb-avatar" alt="">
              <span class="lb-username">${escapeHtml(item.username)}</span>
            </div>
            <div class="lb-score-pill">
              <span>🏆 ${item.count}</span>
              <span style="font-size: 11px; opacity: 0.85;">Galibiyet</span>
            </div>
          </div>
        `;
      }).join('');
    }

    leaderboardCard.classList.remove('hidden');
    leaderboardCard.classList.remove('slide-out');

    playQuestionChime();

    // Auto-dismiss after duration (default 9s)
    const duration = (data.duration || 9) * 1000;
    leaderboardHideTimer = setTimeout(() => {
      if (leaderboardCard && !leaderboardCard.classList.contains('hidden')) {
        leaderboardCard.classList.add('slide-out');
        setTimeout(() => {
          leaderboardCard.classList.add('hidden');
          leaderboardCard.classList.remove('slide-out');
        }, 800);
      }
    }, duration);
  }

  // Primogem Rain Effect
  function triggerPrimoRain(amount) {
    if (rainAmountText) rainAmountText.textContent = `+${amount || 160} Primogem`;
    if (primoRainBanner) {
      primoRainBanner.classList.remove('hidden');
    }

    playRainChimes();

    // Spawn falling sparkling particles
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

    setTimeout(() => {
      if (primoRainBanner) primoRainBanner.classList.add('hidden');
    }, 6000);
  }

  // Fallback SVG generator for Character/Weapon
  function getElementFallbackAvatar(name, element, rarity) {
    const elemColors = {
      Pyro: '#ef4444',
      Hydro: '#3b82f6',
      Anemo: '#10b981',
      Electro: '#a855f7',
      Dendro: '#22c55e',
      Cryo: '#06b6d4',
      Geo: '#f59e0b',
      Weapon: '#64748b'
    };
    const color = elemColors[element] || '#ffd700';
    const initial = (name || '?').charAt(0).toUpperCase();

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#0f172a" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="200" height="200" rx="30" fill="url(#bg)"/>
      <circle cx="100" cy="90" r="55" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="8 4"/>
      <text x="100" y="112" font-family="Cinzel, serif" font-size="52" font-weight="bold" fill="#ffffff" text-anchor="middle">${initial}</text>
      <text x="100" y="165" font-family="Montserrat, sans-serif" font-size="16" font-weight="bold" fill="${color}" text-anchor="middle">${element || 'Item'}</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
    hideAllCards();

    const rarity = pull.rarity || 3;
    const element = pull.element || (pull.type === 'weapon' ? 'Weapon' : 'Geo');
    const name = pull.name || 'Genshin Item';

    // Rarity classes
    wishCard.className = `card wish-card rarity-${rarity}`;
    wishCardGlow.className = `card-glow wish-glow-${rarity}`;

    // Username & Banner
    wishUsername.textContent = username;
    wishBannerTag.textContent = rarity === 5 ? '✨ 5★ EFSANEVİ ÇEKİLİŞ ✨' : rarity === 4 ? '⭐ 4★ DEĞERLİ ÇEKİLİŞ' : '🗡️ 3★ ÇEKİLİŞ';

    // Paimon Mascot & Speech
    if (rarity === 5) {
      wishPaimonImg.src = 'assets/paimon_cheer.png';
      wishSpeech.textContent = 'İnanılmaz! 5 Yıldız Geldi! ⭐⭐⭐⭐⭐';
    } else if (rarity === 4) {
      wishPaimonImg.src = 'assets/paimon_happy.png';
      wishSpeech.textContent = 'Harika bir 4 Yıldız! ⭐⭐⭐⭐';
    } else {
      wishPaimonImg.src = 'assets/paimon_thinking.png';
      wishSpeech.textContent = 'Bir dahakine kesin 5★ gelir! ✨';
    }

    // Avatar Image with Safe Error Fallback
    const fallbackSrc = getElementFallbackAvatar(name, element, rarity);
    wishAvatarImg.onerror = () => {
      wishAvatarImg.onerror = null;
      wishAvatarImg.src = fallbackSrc;
    };
    wishAvatarImg.src = pull.remoteIcon || pull.icon || fallbackSrc;

    // Element badge
    wishElementBadge.textContent = element;
    wishElementBadge.className = `wish-element-badge elem-${element}`;

    // Stars
    wishStars.textContent = '★'.repeat(rarity);
    wishStars.className = `wish-stars stars-${rarity}`;

    // Item Name & Subtitle
    wishItemName.textContent = name;
    const weaponType = pull.weaponType || pull.type || '';
    const region = pull.region ? ` • ${pull.region}` : '';
    const title = pull.title ? `${pull.title} • ` : '';
    wishItemSub.textContent = `${title}${weaponType}${region}`;

    // Pity text
    if (rarity === 5 && pull.pity5AtPull >= 40) {
      wishItemPity.textContent = '🌟 40/40 Pity Garantili 5★ Patlaması!';
      wishItemPity.style.display = 'inline-block';
    } else if (stats && stats.totalWishes) {
      wishItemPity.textContent = `Toplam Çekiş: ${stats.totalWishes} | 5★ Pity: ${stats.pity5 || 0}/40`;
      wishItemPity.style.display = 'inline-block';
    } else {
      wishItemPity.style.display = 'none';
    }

    // Refund banner
    if (pull.isRefund && pull.refundAmount > 0) {
      wishRefundAmount.textContent = `+${pull.refundAmount} Primogem`;
      wishRefundBanner.classList.remove('hidden');
    } else {
      wishRefundBanner.classList.add('hidden');
    }

    wishCard.classList.remove('hidden');
    wishCard.classList.remove('slide-out');

    // Display duration: faster if queue is waiting, 5s normal
    const displayDuration = wishQueue.length > 2 ? 3000 : 5000;

    wishDismissTimer = setTimeout(() => {
      wishCard.classList.add('slide-out');
      setTimeout(() => {
        wishCard.classList.add('hidden');
        wishCard.classList.remove('slide-out');
        if (onComplete) onComplete();
      }, 700);
    }, displayDuration);
  }

  // WebSocket Connection
  function connectWS() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[OBS Overlay] Sunucuya bağlandı.');
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
      console.error('[OBS Overlay] WS Hatası:', err);
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
        soundEnabled = msg.config?.soundEnabled ?? true;
        if (msg.gameState) {
          if (msg.gameState.state === 'ACTIVE' && msg.gameState.currentQuestion) {
            showQuestion(msg.gameState.currentQuestion, msg.config?.questionDurationSeconds || 45);
            updateTimer(msg.gameState.secondsRemainingInQuestion);
          } else if (msg.gameState.state === 'WINNER') {
            // Wait for next
          } else {
            hideAllCards();
          }
        }
        break;

      case 'QUESTION_STARTED':
        showQuestion(msg.question, msg.duration);
        break;

      case 'TICK':
        if (msg.state === 'ACTIVE') {
          updateTimer(msg.secondsRemainingInQuestion);
        }
        break;

      case 'WINNER_DECLARED':
        showWinner(msg);
        break;

      case 'QUESTION_TIMEOUT':
        showTimeout(msg);
        break;

      case 'QUESTION_CANCELLED':
        hideAllCards();
        break;

      case 'STATE_CHANGED':
        if (msg.state.state === 'WAITING' || msg.state.state === 'IDLE') {
          hideAllCards();
        }
        break;

      case 'CONFIG_UPDATED':
        soundEnabled = msg.config?.soundEnabled ?? true;
        break;

      case 'TEST_PREVIEW':
        showQuestion(msg.question, 15);
        setTimeout(() => {
          showWinner({
            winner: msg.mockWinner,
            answerGiven: msg.mockWinner.answerGiven,
            winsCount: msg.mockWinner.winsCount
          });
          setTimeout(() => {
            hideAllCards();
          }, 8000);
        }, 8000);
        break;

      case 'SHOW_LEADERBOARD':
        showLeaderboard(msg);
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

  connectWS();
})();
