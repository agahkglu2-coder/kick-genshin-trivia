// Genshin Milka Trivia OBS Overlay Client - Paimon Edition
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

  // Particle & Confetti System
  let particles = [];
  function createConfettiBurst(x, y, count = 80) {
    const colors = ['#ffd700', '#f5d77f', '#53fc18', '#60a5fa', '#f43f5e', '#a855f7', '#ffffff'];
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

  function renderParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    "Doğru bilene primogem var! 💎"
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
    if (leaderboardHideTimer) {
      clearTimeout(leaderboardHideTimer);
      leaderboardHideTimer = null;
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

  // WebSocket Connection
  function connectWS() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Trivia Overlay] Sunucuya bağlandı.');
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
      console.error('[Trivia Overlay] WS Hatası:', err);
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

      default:
        break;
    }
  }

  connectWS();
})();
