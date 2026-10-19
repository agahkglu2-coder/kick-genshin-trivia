// Genshin Community Jackpot & Pool OBS Client
(() => {
  const host = window.location.host || 'localhost:3000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${host}/ws`;

  // DOM Elements
  const jackpotCounter = document.getElementById('jackpot-counter');
  const jackpotTicker = document.getElementById('jackpot-ticker');
  const gemIcon = document.getElementById('gem-icon');
  const floatingContainer = document.getElementById('floating-tax-container');

  const celebrationOverlay = document.getElementById('celebration-overlay');
  const celebIcon = document.getElementById('celeb-icon');
  const celebTitle = document.getElementById('celeb-title');
  const celebWinner = document.getElementById('celeb-winner');
  const celebAmount = document.getElementById('celeb-amount');
  const celebSubtitle = document.getElementById('celeb-subtitle');

  // Canvas for FX
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  let currentPool = 0;
  let targetPool = 0;
  let countAnimationId = null;
  let celebrationTimer = null;
  let socket = null;

  // Sound configuration
  const urlParams = new URLSearchParams(window.location.search);
  const soundEnabled = urlParams.get('sound') !== '0';

  // ========================================================
  // WEB AUDIO API SYNTHESIZER
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

  function playChime(freq, duration = 0.2, gainLevel = 0.15) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(gainLevel, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  function playCelebrationFanfare() {
    if (!soundEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, idx) => {
      setTimeout(() => playChime(freq, 0.45, 0.25), idx * 110);
    });
  }

  function playTaxChime() {
    if (!soundEnabled) return;
    playChime(1174.66, 0.18, 0.08); // D6 soft crystal chime
    setTimeout(() => playChime(1760.00, 0.25, 0.06), 70); // A6
  }

  // ========================================================
  // PARTICLE SYSTEM (CONFETTI & SPARKS)
  // ========================================================
  const particles = [];
  function createBurst(x, y, count = 40, colors = ['#ffd700', '#f59e0b', '#38bdf8', '#ffffff']) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
        decay: Math.random() * 0.018 + 0.012
      });
    }
  }

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
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
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    requestAnimationFrame(renderParticles);
  }
  requestAnimationFrame(renderParticles);

  // ========================================================
  // SMOOTH COUNTER ROLLING ANIMATION
  // ========================================================
  function setCounter(newVal, animate = true) {
    targetPool = Math.max(0, Math.floor(newVal));
    if (!animate) {
      currentPool = targetPool;
      jackpotCounter.textContent = currentPool.toLocaleString('tr-TR');
      return;
    }

    if (countAnimationId) cancelAnimationFrame(countAnimationId);

    const startVal = currentPool;
    const diff = targetPool - startVal;
    if (diff === 0) return;

    const startTime = performance.now();
    const duration = Math.min(1200, Math.max(300, Math.abs(diff) * 15));

    function step(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      currentPool = Math.floor(startVal + diff * ease);
      jackpotCounter.textContent = currentPool.toLocaleString('tr-TR');

      if (progress < 1) {
        countAnimationId = requestAnimationFrame(step);
      } else {
        currentPool = targetPool;
        jackpotCounter.textContent = currentPool.toLocaleString('tr-TR');
      }
    }
    countAnimationId = requestAnimationFrame(step);
  }

  // ========================================================
  // FLOATING TAX TAG (+X 💎)
  // ========================================================
  function showFloatingTax(amount, username) {
    if (!floatingContainer) return;
    const tag = document.createElement('div');
    tag.className = 'float-tag';
    tag.textContent = `+${amount} 💎`;
    floatingContainer.appendChild(tag);

    // Bounce icon
    if (gemIcon) {
      gemIcon.classList.remove('bounce');
      void gemIcon.offsetWidth; // trigger reflow
      gemIcon.classList.add('bounce');
    }

    // Sparkle burst at gem location
    const rect = gemIcon.getBoundingClientRect();
    createBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 8, ['#fef08a', '#38bdf8', '#ffffff']);

    // Update ticker
    if (username) {
      jackpotTicker.textContent = `Son katkı: @${username} (+${amount} 💎)`;
      jackpotTicker.classList.add('highlight');
      setTimeout(() => {
        jackpotTicker.classList.remove('highlight');
      }, 4000);
    }

    playTaxChime();

    setTimeout(() => {
      if (tag.parentNode) tag.parentNode.removeChild(tag);
    }, 1800);
  }

  // ========================================================
  // CELEBRATION SHOWCASES (RAFFLE & DISTRIBUTION)
  // ========================================================
  function triggerRaffleCelebration(winner, amount) {
    if (celebrationTimer) clearTimeout(celebrationTimer);

    celebIcon.textContent = '👑';
    celebTitle.textContent = 'TOPLULUK HAVUZU ÇEKİLİŞİ!';
    celebWinner.textContent = `@${winner}`;
    celebAmount.textContent = Math.floor(amount).toLocaleString('tr-TR');
    celebSubtitle.textContent = 'Tüm kumbara birikimi şanslı Gezgine verildi!';

    celebrationOverlay.classList.remove('hidden');

    const cardRect = celebrationOverlay.getBoundingClientRect();
    createBurst(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2, 120, ['#ffd700', '#f59e0b', '#ec4899', '#38bdf8', '#ffffff']);
    playCelebrationFanfare();

    celebrationTimer = setTimeout(() => {
      celebrationOverlay.classList.add('hidden');
    }, 9000);
  }

  function triggerDistributeCelebration(userCount, perUser, totalAmount) {
    if (celebrationTimer) clearTimeout(celebrationTimer);

    celebIcon.textContent = '🌧️';
    celebTitle.textContent = 'HAVUZ CHATTEKİLERE DAĞITILDI!';
    celebWinner.textContent = `${userCount} Aktif Gezgin`;
    celebAmount.textContent = `${Math.floor(perUser).toLocaleString('tr-TR')} / Kişi`;
    celebSubtitle.textContent = `Toplam ${Math.floor(totalAmount).toLocaleString('tr-TR')} Primogem eşit paylaştırıldı!`;

    celebrationOverlay.classList.remove('hidden');

    const cardRect = celebrationOverlay.getBoundingClientRect();
    createBurst(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2, 100, ['#38bdf8', '#60a5fa', '#ffd700', '#ffffff']);
    playCelebrationFanfare();

    celebrationTimer = setTimeout(() => {
      celebrationOverlay.classList.add('hidden');
    }, 9000);
  }

  // ========================================================
  // WEBSOCKET REALTIME CONNECTION
  // ========================================================
  function connectWebSocket() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Jackpot OBS] WebSocket sunucusuna bağlandı.');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 1. Initial State
        if (data.type === 'INIT_STATE' && data.jackpot) {
          setCounter(data.jackpot.pool, false);
        }

        // 2. Real-time tax added to pool
        if (data.type === 'JACKPOT_UPDATED') {
          if (data.added && data.added > 0) {
            showFloatingTax(data.added, data.username);
          }
          setCounter(data.pool, true);
        }

        // 3. Raffle Won
        if (data.type === 'JACKPOT_WON') {
          triggerRaffleCelebration(data.winner, data.amount);
          setCounter(data.remainingPool, true);
        }

        // 4. Community Distribution
        if (data.type === 'JACKPOT_DISTRIBUTED') {
          triggerDistributeCelebration(data.userCount, data.perUser, data.totalAmount);
          setCounter(data.remainingPool, true);
        }

      } catch (err) {
        console.warn('[Jackpot OBS] Mesaj işlenirken hata:', err);
      }
    };

    socket.onclose = () => {
      console.log('[Jackpot OBS] WebSocket koptu, 3s sonra yeniden bağlanacak...');
      setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
      console.warn('[Jackpot OBS] WebSocket hatası:', err.message);
    };
  }

  // Initial Fetch Fallback
  async function fetchInitialState() {
    try {
      const res = await fetch('/api/jackpot');
      if (res.ok) {
        const data = await res.json();
        setCounter(data.pool, false);
      }
    } catch (e) {}
  }

  fetchInitialState();
  connectWebSocket();
})();
