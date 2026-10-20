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

  // Sound configuration (Celebrations only; Pool accumulation / tax is 100% silent)
  const urlParams = new URLSearchParams(window.location.search);
  let soundEnabled = urlParams.get('sound') !== '0';

  // ========================================================
  // WEB AUDIO API SYNTHESIZER FOR CELEBRATIONS ONLY
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
        if (data.type === 'INIT_STATE') {
          if (data.config && data.config.soundEnabled !== undefined) {
            soundEnabled = !!data.config.soundEnabled;
          }
          if (data.jackpot) {
            setCounter(data.jackpot.pool, false);
            if (data.jackpot.pool > 0) {
              try { localStorage.setItem('milka_jackpot_pool', String(data.jackpot.pool)); } catch (e) {}
            }
          }
        }

        if (data.type === 'CONFIG_UPDATED' && data.config && data.config.soundEnabled !== undefined) {
          soundEnabled = !!data.config.soundEnabled;
        }

        // 2. Real-time tax added to pool
        if (data.type === 'JACKPOT_UPDATED') {
          if (data.added && data.added > 0) {
            showFloatingTax(data.added, data.username);
          }
          setCounter(data.pool, true);
          if (data.pool > 0) {
            try { localStorage.setItem('milka_jackpot_pool', String(data.pool)); } catch (e) {}
          }
        }

        // 3. Raffle Won
        if (data.type === 'JACKPOT_WON') {
          triggerRaffleCelebration(data.winner, data.amount);
          setCounter(data.remainingPool, true);
          try { localStorage.setItem('milka_jackpot_pool', String(data.remainingPool || 0)); } catch (e) {}
        }

        // 4. Community Distribution
        if (data.type === 'JACKPOT_DISTRIBUTED') {
          triggerDistributeCelebration(data.userCount, data.perUser, data.totalAmount);
          setCounter(data.remainingPool, true);
          try { localStorage.setItem('milka_jackpot_pool', String(data.remainingPool || 0)); } catch (e) {}
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

  // Auto-connect database if saved in browser localStorage (resilient across Render reboots)
  async function checkDbRestore() {
    try {
      const savedDbUrl = localStorage.getItem('milka_database_url');
      if (savedDbUrl && (savedDbUrl.startsWith('postgres://') || savedDbUrl.startsWith('postgresql://'))) {
        const stRes = await fetch('/api/db/status');
        const stData = await stRes.json();
        if (stData && stData.status && stData.status.type !== 'postgres') {
          console.log('[Jackpot OBS] ⚡ Render uykudan uyandı: Kayıtlı veritabanı adresi otomatik bağlanıyor...');
          await fetch('/api/db/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ databaseUrl: savedDbUrl })
          });
        }
      }
    } catch (e) {}
  }

  // Initial Fetch Fallback & Deploy Auto-Recovery
  async function fetchInitialState() {
    try {
      await checkDbRestore();
      const res = await fetch('/api/jackpot');
      if (res.ok) {
        const data = await res.json();
        const serverPool = data && data.pool !== undefined ? Number(data.pool) : 0;
        const cachedPool = parseFloat(localStorage.getItem('milka_jackpot_pool') || '0');
        const cachedTotal = parseFloat(localStorage.getItem('milka_jackpot_total') || '0');

        // If server pool is 0 right after Render deploy/reboot, but client has cached pool:
        if (serverPool === 0 && cachedPool > 0) {
          console.log(`[Jackpot OBS] 🛡️ Render deploy sıfırlaması tespit edildi! Tarayıcı hafızasından ${cachedPool} 💎 geri yükleniyor...`);
          try {
            const syncRes = await fetch('/api/jackpot/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pool: cachedPool, totalAccumulated: cachedTotal })
            });
            const syncData = await syncRes.json();
            if (syncData.success) {
              setCounter(syncData.pool, false);
              return;
            }
          } catch (syncErr) {
            console.warn('[Jackpot OBS] Sync hatası:', syncErr);
          }
        }

        setCounter(serverPool, false);
        if (serverPool > 0) {
          try { localStorage.setItem('milka_jackpot_pool', String(serverPool)); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  fetchInitialState();
  connectWebSocket();
})();
