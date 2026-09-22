(() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  let socket = null;
  let allQuestions = [];

  // DOM Elements
  const kickStatusBadge = document.getElementById('kick-status-badge');
  const kickStatusText = document.getElementById('kick-status-text');

  const gameStateBadge = document.getElementById('game-state-badge');
  const timerLargeText = document.getElementById('timer-large-text');
  const timerLabel = document.getElementById('timer-label');

  const activeQuestionPreview = document.getElementById('active-question-preview');
  const activeQTitle = document.getElementById('active-q-title');
  const activeQAnswers = document.getElementById('active-q-answers');

  const btnTrigger = document.getElementById('btn-trigger');
  const btnCancel = document.getElementById('btn-cancel');
  const btnShowLb = document.getElementById('btn-show-lb');
  const btnTest = document.getElementById('btn-test');

  const obsTriviaUrl = document.getElementById('obs-trivia-url');
  const btnCopyTriviaUrl = document.getElementById('btn-copy-trivia-url');
  const obsGachaUrl = document.getElementById('obs-gacha-url');
  const btnCopyGachaUrl = document.getElementById('btn-copy-gacha-url');

  const tabPreviewTrivia = document.getElementById('tab-preview-trivia');
  const tabPreviewGacha = document.getElementById('tab-preview-gacha');
  const overlayPreviewFrame = document.getElementById('overlay-preview-frame');
  const previewTipText = document.getElementById('preview-tip-text');
  const btnOpenActivePreview = document.getElementById('btn-open-active-preview');

  const settingsForm = document.getElementById('settings-form');
  const cfgChannel = document.getElementById('cfg-channel');
  const btnConnectKick = document.getElementById('btn-connect-kick');
  const cfgInterval = document.getElementById('cfg-interval');
  const cfgDuration = document.getElementById('cfg-duration');
  const cfgWinnerDuration = document.getElementById('cfg-winner-duration');
  const cfgLbCooldown = document.getElementById('cfg-lb-cooldown');
  const cfgGamemode = document.getElementById('cfg-gamemode');
  const cfgSound = document.getElementById('cfg-sound');

  const questionsCount = document.getElementById('questions-count');
  const btnToggleAddQ = document.getElementById('btn-toggle-add-q');
  const addQuestionForm = document.getElementById('add-question-form');
  const inputQText = document.getElementById('input-q-text');
  const inputQAnswers = document.getElementById('input-q-answers');
  const inputQCategory = document.getElementById('input-q-category');
  const inputQDifficulty = document.getElementById('input-q-difficulty');
  const inputQHint = document.getElementById('input-q-hint');
  const btnSaveNewQuestion = document.getElementById('btn-save-new-question');

  const searchQuestions = document.getElementById('search-questions');
  const questionsList = document.getElementById('questions-list');

  const leaderboardList = document.getElementById('leaderboard-list');
  const btnResetLeaderboard = document.getElementById('btn-reset-leaderboard');

  const chatFeed = document.getElementById('chat-feed');
  const connectFeedback = document.getElementById('connect-feedback');

  // Gacha & Primogem DOM Elements
  const btnGachaRain = document.getElementById('btn-gacha-rain');
  const btnTestWish5 = document.getElementById('btn-test-wish-5');
  const btnTestWish4 = document.getElementById('btn-test-wish-4');
  const btnTestWish3 = document.getElementById('btn-test-wish-3');
  const giftUsername = document.getElementById('gift-username');
  const giftAmount = document.getElementById('gift-amount');
  const btnGiftPrimo = document.getElementById('btn-gift-primo');
  const giftFeedback = document.getElementById('gift-feedback');
  const gachaUsersCount = document.getElementById('gacha-users-count');
  const btnRefreshGachaUsers = document.getElementById('btn-refresh-gacha-users');
  const gachaUsersTbody = document.getElementById('gacha-users-tbody');

  // Kick Bot DOM Elements
  const botStatusBadge = document.getElementById('bot-status-badge');
  const botForm = document.getElementById('bot-form');
  const cfgBotEnabled = document.getElementById('cfg-bot-enabled');
  const cfgBotClientId = document.getElementById('cfg-bot-client-id');
  const cfgBotClientSecret = document.getElementById('cfg-bot-client-secret');
  const cfgBotRedirectUri = document.getElementById('cfg-bot-redirect-uri');
  const btnToggleSecretVis = document.getElementById('btn-toggle-secret-vis');
  const cfgBotToken = document.getElementById('cfg-bot-token');
  const btnBotAuthorize = document.getElementById('btn-bot-authorize');
  const btnBotTestMsg = document.getElementById('btn-bot-test-msg');
  const botFeedback = document.getElementById('bot-feedback');
  const displayRedirectUri = document.getElementById('display-redirect-uri');
  const btnCopyRedirectUri = document.getElementById('btn-copy-redirect-uri');

  // Set OBS URLs correctly based on current origin (works seamlessly on Render HTTPS & localhost)
  const currentOrigin = window.location.origin || `http://${window.location.host || 'localhost:3000'}`;
  if (obsTriviaUrl) obsTriviaUrl.value = `${currentOrigin}/trivia.html`;
  if (obsGachaUrl) obsGachaUrl.value = `${currentOrigin}/gacha.html`;
  const defaultRedirectUri = `${currentOrigin}/auth/kick/callback`;
  if (displayRedirectUri) displayRedirectUri.value = defaultRedirectUri;
  if (cfgBotRedirectUri) cfgBotRedirectUri.value = defaultRedirectUri;

  if (btnCopyRedirectUri && displayRedirectUri) {
    btnCopyRedirectUri.addEventListener('click', () => {
      displayRedirectUri.select();
      navigator.clipboard.writeText(displayRedirectUri.value).then(() => {
        btnCopyRedirectUri.textContent = 'Kopyalandı! ✅';
        setTimeout(() => { btnCopyRedirectUri.textContent = 'Kopyala'; }, 2000);
      }).catch(() => {
        btnCopyRedirectUri.textContent = 'Ctrl+C ile alın';
      });
    });
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Update Kick Connection UI
  function updateKickStatus(status) {
    kickStatusBadge.className = 'status-badge';
    if (status.connected) {
      kickStatusBadge.classList.add('status-online');
      kickStatusText.textContent = `🟢 ${status.channel} (#${status.chatroomId || 'Bağlı'})`;
      if (connectFeedback) {
        connectFeedback.style.color = '#10b981';
        connectFeedback.textContent = `✅ ${status.channel} sohbeti dinleniyor (#${status.chatroomId})`;
      }
    } else if (status.channel && !status.error) {
      kickStatusBadge.classList.add('status-connecting');
      kickStatusText.textContent = `🟡 Bağlanıyor... (${status.channel})`;
      if (connectFeedback) {
        connectFeedback.style.color = '#f59e0b';
        connectFeedback.textContent = status.message || `🟡 ${status.channel} bağlanıyor...`;
      }
    } else {
      kickStatusBadge.classList.add('status-offline');
      kickStatusText.textContent = status.error ? `🔴 ${status.error}` : '🔴 Bağlantı Yok';
      if (connectFeedback && status.error) {
        connectFeedback.style.color = '#ef4444';
        connectFeedback.textContent = `🔴 ${status.error}`;
      }
    }
  }

  // Update Game State UI
  function updateGameState(stateData) {
    if (!stateData) return;

    const state = stateData.state;
    gameStateBadge.className = 'state-pill';

    if (state === 'ACTIVE') {
      gameStateBadge.classList.add('active');
      gameStateBadge.textContent = 'SORU EKRANDA';
      timerLabel.textContent = 'Cevap İçin Kalan Süre';
      timerLargeText.textContent = formatTime(stateData.secondsRemainingInQuestion);

      if (stateData.currentQuestion) {
        activeQuestionPreview.classList.remove('hidden');
        activeQTitle.textContent = stateData.currentQuestion.question;
        activeQAnswers.textContent = (stateData.currentQuestion.answers || []).join(' / ') || 'Gizli';
      }
    } else if (state === 'WINNER') {
      gameStateBadge.classList.add('winner');
      gameStateBadge.textContent = 'KAZANAN KUTLANIYOR';
      timerLabel.textContent = 'Sonraki Tura Geçiş';
      timerLargeText.textContent = '🎉';
    } else if (state === 'TIMEOUT') {
      gameStateBadge.textContent = 'SÜRE BİTTİ';
      timerLabel.textContent = 'Sonraki Tura Geçiş';
      timerLargeText.textContent = '⌛';
    } else {
      gameStateBadge.textContent = 'BEKLENİYOR';
      timerLabel.textContent = 'Sonraki Soruya Kalan';
      timerLargeText.textContent = formatTime(stateData.secondsUntilNextQuestion);
      activeQuestionPreview.classList.add('hidden');
    }

    if (stateData.leaderboard) {
      renderLeaderboard(stateData.leaderboard);
    }
  }

  // Render Leaderboard
  function renderLeaderboard(leaders) {
    if (!leaders || leaders.length === 0) {
      leaderboardList.innerHTML = '<p class="empty-state">Henüz soru kazananı yok.</p>';
      return;
    }
    leaderboardList.innerHTML = leaders.map((item, idx) => `
      <div class="leader-item">
        <div class="leader-user">
          <span>${idx === 0 ? '👑' : `#${idx + 1}`}</span>
          <span>${item.username}</span>
        </div>
        <div class="leader-wins">${item.count} Galibiyet</div>
      </div>
    `).join('');
  }

  // Append Live Chat Message
  function appendChatMessage(msg) {
    const empty = chatFeed.querySelector('.empty-state');
    if (empty) empty.remove();

    const isBot = msg.isBot || (msg.username && msg.username.includes('Bot'));
    const entry = document.createElement('div');
    entry.className = `chat-entry ${isBot ? 'bot-chat-entry' : ''}`;
    if (isBot) {
      entry.style.background = 'rgba(99, 102, 241, 0.12)';
      entry.style.borderLeft = '3px solid #6366f1';
      entry.style.padding = '4px 8px';
      entry.style.borderRadius = '4px';
      entry.style.marginBottom = '4px';
    }

    const badgeHtml = isBot
      ? `<span style="background:#6366f1; color:#fff; font-size:0.65rem; padding:1px 5px; border-radius:3px; margin-right:5px; font-weight:700;">PAIMON BOT</span>`
      : '';

    entry.innerHTML = `
      ${badgeHtml}<span class="chat-user" style="${isBot ? 'color:#818cf8; font-weight:700;' : ''}">${escapeHtml(msg.username)}:</span>
      <span class="chat-content" style="${isBot ? 'color:#f8fafc; font-weight:500;' : ''}">${escapeHtml(msg.content)}</span>
    `;
    chatFeed.appendChild(entry);

    if (chatFeed.children.length > 60) {
      chatFeed.removeChild(chatFeed.firstChild);
    }
    chatFeed.scrollTop = chatFeed.scrollHeight;
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

  // Load and Render Questions
  async function loadQuestions() {
    try {
      const res = await fetch('/api/questions');
      allQuestions = await res.json();
      questionsCount.textContent = allQuestions.length;
      renderQuestionsList(allQuestions);
    } catch (e) {
      console.error('Sorular yüklenemedi:', e);
    }
  }

  function renderQuestionsList(questions) {
    if (!questions || questions.length === 0) {
      questionsList.innerHTML = '<p class="empty-state">Soru bulunamadı.</p>';
      return;
    }

    questionsList.innerHTML = questions.map((q) => `
      <div class="q-item" data-id="${q.id}">
        <div class="q-item-info">
          <div class="q-item-title">#${q.id} ${escapeHtml(q.question)}</div>
          <div class="q-item-ans">Cevaplar: <strong>${escapeHtml((q.answers || []).join(', '))}</strong></div>
        </div>
        <span class="q-item-badge">${escapeHtml(q.category || 'Genshin')} - ${escapeHtml(q.difficulty || '')}</span>
      </div>
    `).join('');
  }

  // Search Filter
  searchQuestions.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
      renderQuestionsList(allQuestions);
      return;
    }
    const filtered = allQuestions.filter(q =>
      q.question.toLowerCase().includes(val) ||
      (q.answers || []).some(a => a.toLowerCase().includes(val)) ||
      (q.category || '').toLowerCase().includes(val)
    );
    renderQuestionsList(filtered);
  });

  // Toggle Add Question Form
  btnToggleAddQ.addEventListener('click', () => {
    addQuestionForm.classList.toggle('hidden');
    btnToggleAddQ.textContent = addQuestionForm.classList.contains('hidden') ? '+ Yeni Soru Ekle' : '✕ Kapat';
  });

  // Save New Question
  btnSaveNewQuestion.addEventListener('click', async () => {
    const text = inputQText.value.trim();
    const answersRaw = inputQAnswers.value.trim();
    if (!text || !answersRaw) {
      alert('Lütfen soru metnini ve en az bir cevabı girin.');
      return;
    }

    const answers = answersRaw.split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      question: text,
      answers: answers,
      category: inputQCategory.value,
      difficulty: inputQDifficulty.value,
      hint: inputQHint.value.trim()
    };

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        inputQText.value = '';
        inputQAnswers.value = '';
        inputQHint.value = '';
        addQuestionForm.classList.add('hidden');
        btnToggleAddQ.textContent = '+ Yeni Soru Ekle';
        loadQuestions();
      } else {
        alert('Hata: ' + (data.error || 'Eklenemedi'));
      }
    } catch (e) {
      alert('Soru kaydedilirken hata oluştu: ' + e.message);
    }
  });

  // Action Buttons
  btnTrigger.addEventListener('click', async () => {
    btnTrigger.disabled = true;
    try {
      await fetch('/api/trigger-question', { method: 'POST' });
    } finally {
      setTimeout(() => { btnTrigger.disabled = false; }, 1000);
    }
  });

  btnCancel.addEventListener('click', async () => {
    await fetch('/api/cancel-question', { method: 'POST' });
  });

  if (btnShowLb) {
    btnShowLb.addEventListener('click', async () => {
      await fetch('/api/show-leaderboard', { method: 'POST' });
    });
  }

  btnTest.addEventListener('click', async () => {
    await fetch('/api/test-preview', { method: 'POST' });
    alert('OBS Önizlemesi tetiklendi! OBS ekranınızı kontrol edin.');
  });

  if (btnCopyTriviaUrl) {
    btnCopyTriviaUrl.addEventListener('click', () => {
      obsTriviaUrl.select();
      navigator.clipboard.writeText(obsTriviaUrl.value);
      btnCopyTriviaUrl.textContent = 'Kopyalandı! ✅';
      setTimeout(() => { btnCopyTriviaUrl.textContent = 'Kopyala'; }, 2000);
    });
  }

  if (btnCopyGachaUrl) {
    btnCopyGachaUrl.addEventListener('click', () => {
      obsGachaUrl.select();
      navigator.clipboard.writeText(obsGachaUrl.value);
      btnCopyGachaUrl.textContent = 'Kopyalandı! ✅';
      setTimeout(() => { btnCopyGachaUrl.textContent = 'Kopyala'; }, 2000);
    });
  }

  if (tabPreviewTrivia && tabPreviewGacha && overlayPreviewFrame) {
    tabPreviewTrivia.addEventListener('click', () => {
      tabPreviewTrivia.className = 'btn btn-xs btn-primary active-tab';
      tabPreviewGacha.className = 'btn btn-xs btn-outline';
      overlayPreviewFrame.src = 'trivia.html';
      if (btnOpenActivePreview) btnOpenActivePreview.href = 'trivia.html';
      if (previewTipText) {
        previewTipText.innerHTML = `<span>💡 Şu an <strong>Trivia Ekranı</strong> önizleniyor. <strong>"⚡ Hemen Soru Sor"</strong> veya <strong>"🧪 Test Önizlemesi"</strong>ne bastığınızda soru kartı buraya gelir.</span>`;
      }
    });

    tabPreviewGacha.addEventListener('click', () => {
      tabPreviewGacha.className = 'btn btn-xs btn-primary active-tab';
      tabPreviewTrivia.className = 'btn btn-xs btn-outline';
      overlayPreviewFrame.src = 'gacha.html';
      if (btnOpenActivePreview) btnOpenActivePreview.href = 'gacha.html';
      if (previewTipText) {
        previewTipText.innerHTML = `<span>💡 Şu an <strong>Gacha Ekranı</strong> önizleniyor. <strong>"🌟 5★ Altın Dilek Testi"</strong> veya <strong>"🌧️ Primogem Yağmuru"</strong>na bastığınızda animasyon buraya gelir.</span>`;
      }
    });
  }

  btnResetLeaderboard.addEventListener('click', async () => {
    if (confirm('Günün kazananları sıfırlansın mı?')) {
      await fetch('/api/reset-leaderboard', { method: 'POST' });
    }
  });

  // Settings Save
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      channel: cfgChannel.value.trim(),
      intervalMinutes: parseInt(cfgInterval.value, 10) || 10,
      questionDurationSeconds: parseInt(cfgDuration.value, 10) || 45,
      winnerDisplaySeconds: parseInt(cfgWinnerDuration.value, 10) || 12,
      leaderboardCooldownSeconds: parseInt(cfgLbCooldown?.value, 10) || 60,
      gameMode: cfgGamemode.value,
      soundEnabled: cfgSound.checked
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Ayarlar başarıyla kaydedildi!');
      }
    } catch (err) {
      alert('Ayarlar kaydedilemedi: ' + err.message);
    }
  });

  // Client-side resolver (runs on streamer's residential IP - never blocked by Cloudflare!)
  async function resolveChatroomIdClientSide(slug) {
    if (!slug) return null;
    if (/^\d+$/.test(slug)) return parseInt(slug, 10);

    const endpoints = [
      `https://kick.com/api/v2/channels/${slug}`,
      `https://kick.com/api/v1/channels/${slug}`,
      `https://kick.com/api/v2/channels/${slug}/chatroom`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          const id = data.chatroom?.id || (typeof data.id === 'number' ? data.id : null);
          if (id) {
            console.log(`[Admin] Tarayıcı üzerinden chatroomId çözüldü: #${id} (${slug})`);
            return id;
          }
        }
      } catch (e) {
        // try next endpoint
      }
    }
    return null;
  }

  async function connectChannel() {
    const rawVal = cfgChannel.value.trim();
    if (!rawVal) {
      if (connectFeedback) {
        connectFeedback.style.color = '#ef4444';
        connectFeedback.textContent = 'Lütfen bir kanal adı veya bağlantısı girin.';
      }
      return;
    }

    btnConnectKick.disabled = true;
    btnConnectKick.textContent = 'Bağlanıyor...';
    if (connectFeedback) {
      connectFeedback.style.color = '#f59e0b';
      connectFeedback.textContent = '🔄 Kanal aranıyor ve WebSocket bağlantısı kuruluyor...';
    }

    let channelName = rawVal.replace(/^https?:\/\/(www\.)?kick\.com\//i, '').replace(/^[@/]+/, '').split('/')[0].trim();
    let chatroomId = null;

    if (/^\d+$/.test(channelName)) {
      chatroomId = parseInt(channelName, 10);
      channelName = '';
    } else {
      // Fast client-side resolution (runs in streamer's browser, bypassing Cloudflare datacenter blocks on Render)
      try {
        chatroomId = await resolveChatroomIdClientSide(channelName);
      } catch (errResolve) {
        console.warn('[Admin] İstemci taraflı çözümleme hatası:', errResolve.message);
      }
    }

    try {
      const res = await fetch('/api/connect-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName, chatroomId })
      });
      const data = await res.json();
      if (data.success) {
        cfgChannel.value = data.channel || rawVal;
      } else {
        if (connectFeedback) {
          connectFeedback.style.color = '#ef4444';
          connectFeedback.textContent = `❌ ${data.error || 'Bağlantı hatası'}`;
        }
      }
    } catch (err) {
      if (connectFeedback) {
        connectFeedback.style.color = '#ef4444';
        connectFeedback.textContent = `❌ Hata: ${err.message}`;
      }
    } finally {
      btnConnectKick.disabled = false;
      btnConnectKick.textContent = 'Bağlan';
    }
  }

  btnConnectKick.addEventListener('click', connectChannel);
  cfgChannel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      connectChannel();
    }
  });

  // Kick Bot Management UI
  function updateBotStatus(status) {
    if (!status) return;
    if (cfgBotEnabled) cfgBotEnabled.checked = status.enabled !== false;
    if (status.clientId && cfgBotClientId && !cfgBotClientId.value) {
      cfgBotClientId.value = status.clientId;
    }
    if (status.redirectUri && cfgBotRedirectUri && !cfgBotRedirectUri.value) {
      cfgBotRedirectUri.value = status.redirectUri;
    }
    if (botStatusBadge) {
      if (!status.enabled) {
        botStatusBadge.textContent = '⚪ Devre Dışı';
        botStatusBadge.style.background = 'rgba(148, 163, 184, 0.2)';
        botStatusBadge.style.color = '#94a3b8';
        botStatusBadge.style.border = '1px solid rgba(148, 163, 184, 0.3)';
      } else if (status.hasToken) {
        botStatusBadge.textContent = '🟢 Canlı Kick Modu';
        botStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        botStatusBadge.style.color = '#10b981';
        botStatusBadge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      } else {
        botStatusBadge.textContent = '🟡 Simülasyon Modu';
        botStatusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        botStatusBadge.style.color = '#f59e0b';
        botStatusBadge.style.border = '1px solid rgba(245, 158, 11, 0.4)';
      }
    }
  }

  if (btnToggleSecretVis && cfgBotClientSecret) {
    btnToggleSecretVis.addEventListener('click', () => {
      if (cfgBotClientSecret.type === 'password') {
        cfgBotClientSecret.type = 'text';
        btnToggleSecretVis.textContent = '🔒';
      } else {
        cfgBotClientSecret.type = 'password';
        btnToggleSecretVis.textContent = '👁️';
      }
    });
  }

  if (botForm) {
    botForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        enabled: cfgBotEnabled.checked,
        clientId: cfgBotClientId?.value.trim() || '',
        clientSecret: cfgBotClientSecret?.value.trim() || '',
        redirectUri: cfgBotRedirectUri?.value.trim() || '',
        token: cfgBotToken?.value.trim() || ''
      };

      try {
        const res = await fetch('/api/bot/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          updateBotStatus(data.status);
          if (botFeedback) {
            botFeedback.style.color = '#10b981';
            botFeedback.textContent = '✅ Ayarlar kaydedildi! Şimdi "🔑 Kick ile Yetkilendir" butonuna basarak botu bağlayabilirsiniz.';
          }
        }
      } catch (err) {
        if (botFeedback) {
          botFeedback.style.color = '#ef4444';
          botFeedback.textContent = `❌ Hata: ${err.message}`;
        }
      }
    });
  }

  if (btnBotAuthorize) {
    btnBotAuthorize.addEventListener('click', async () => {
      const cId = cfgBotClientId?.value.trim();
      const cSecret = cfgBotClientSecret?.value.trim();
      const rUri = displayRedirectUri?.value.trim() || cfgBotRedirectUri?.value.trim() || `${window.location.origin}/auth/kick/callback`;

      if (!cId || !cSecret) {
        if (botFeedback) {
          botFeedback.style.color = '#ef4444';
          botFeedback.textContent = '❌ Lütfen önce Client ID ve Client Secret alanlarını doldurun.';
        }
        return;
      }

      btnBotAuthorize.disabled = true;
      btnBotAuthorize.textContent = 'Bağlanılıyor...';
      if (botFeedback) {
        botFeedback.style.color = '#f59e0b';
        botFeedback.textContent = '🔄 Kick ile iletişim kuruluyor...';
      }

      try {
        const res = await fetch('/api/bot/oauth/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: cId, clientSecret: cSecret, redirectUri: rUri })
        });
        const data = await res.json();

        if (data.autoConnected) {
          updateBotStatus(data.status);
          if (botFeedback) {
            botFeedback.style.color = '#10b981';
            botFeedback.textContent = '🎉 Başarılı! Token otomatik alındı ve canlı Kick sohbeti aktifleşti (🟢 Canlı Kick Modu).';
          }
        } else if (data.authUrl) {
          if (botFeedback) {
            botFeedback.style.color = '#6366f1';
            botFeedback.textContent = '🌐 Kick yetkilendirme penceresi açıldı. Lütfen Kick ekranında "İzin Ver" butonuna basın.';
          }
          window.open(data.authUrl, 'KickAuthWindow', 'width=620,height=750,menubar=no,toolbar=no');
        } else {
          if (botFeedback) {
            botFeedback.style.color = '#ef4444';
            botFeedback.textContent = `❌ ${data.error || 'Yetkilendirme başlatılamadı.'}`;
          }
        }
      } catch (err) {
        if (botFeedback) {
          botFeedback.style.color = '#ef4444';
          botFeedback.textContent = `❌ Hata: ${err.message}`;
        }
      } finally {
        btnBotAuthorize.disabled = false;
        btnBotAuthorize.textContent = '🔑 Kick ile Yetkilendir (Bağlan)';
      }
    });
  }

  if (new URLSearchParams(window.location.search).get('bot_authorized')) {
    if (botFeedback) {
      botFeedback.style.color = '#10b981';
      botFeedback.textContent = '🎉 Tebrikler! Paimon Bot Kick kanalınıza başarıyla bağlandı (🟢 Canlı Kick Modu Aktif).';
    }
    history.replaceState(null, '', window.location.pathname);
  }

  if (btnBotTestMsg) {
    btnBotTestMsg.addEventListener('click', async () => {
      btnBotTestMsg.disabled = true;
      try {
        await fetch('/api/bot/test-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '✨ Paimon Bot test mesajı: Sistem aktif ve çalışıyor!' })
        });
        if (botFeedback) {
          botFeedback.style.color = '#10b981';
          botFeedback.textContent = '💬 Test mesajı gönderildi!';
          setTimeout(() => { botFeedback.textContent = ''; }, 3000);
        }
      } catch (e) {
        if (botFeedback) {
          botFeedback.style.color = '#ef4444';
          botFeedback.textContent = 'Hata: ' + e.message;
        }
      } finally {
        setTimeout(() => { btnBotTestMsg.disabled = false; }, 1500);
      }
    });
  }

  // WebSocket Connection
  function connectWS() {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[Admin] WS Bağlandı.');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch (e) {
        console.error('WS Parse hatası:', e);
      }
    };

    socket.onclose = () => {
      setTimeout(connectWS, 3000);
    };
  }

  function handleWSMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
        if (msg.config) {
          cfgChannel.value = msg.config.channel || '';
          cfgInterval.value = msg.config.intervalMinutes || 10;
          cfgDuration.value = msg.config.questionDurationSeconds || 45;
          cfgWinnerDuration.value = msg.config.winnerDisplaySeconds || 12;
          cfgGamemode.value = msg.config.gameMode || 'first_correct';
          if (cfgLbCooldown) cfgLbCooldown.value = msg.config.leaderboardCooldownSeconds || 60;
          cfgSound.checked = msg.config.soundEnabled ?? true;
        }
        if (msg.kickStatus) updateKickStatus(msg.kickStatus);
        if (msg.gameState) updateGameState(msg.gameState);
        if (msg.botStatus) updateBotStatus(msg.botStatus);
        break;

      case 'BOT_STATUS':
        if (msg.status) updateBotStatus(msg.status);
        break;

      case 'KICK_STATUS':
        updateKickStatus(msg.status);
        break;

      case 'STATE_CHANGED':
        updateGameState(msg.state);
        break;

      case 'TICK':
        if (msg.state === 'WAITING') {
          timerLargeText.textContent = formatTime(msg.secondsUntilNextQuestion);
        } else if (msg.state === 'ACTIVE') {
          timerLargeText.textContent = formatTime(msg.secondsRemainingInQuestion);
        }
        break;

      case 'CHAT_MESSAGE':
        appendChatMessage(msg.message);
        break;

      case 'QUESTION_STARTED':
      case 'WINNER_DECLARED':
      case 'QUESTION_TIMEOUT':
      case 'QUESTION_CANCELLED':
        // State will update via STATE_CHANGED
        break;

      case 'WISH_RESULT':
      case 'PRIMO_RAIN':
      case 'PRIMO_AWARDED':
        loadGachaUsers();
        break;

      default:
        break;
    }
  }

  // Gacha Management Logic
  async function loadGachaUsers() {
    try {
      const res = await fetch('/api/gacha/users');
      const users = await res.json();
      renderGachaUsers(users);
    } catch (e) {
      console.warn('Gacha kullanıcıları yüklenemedi:', e);
    }
  }

  function renderGachaUsers(users) {
    if (!gachaUsersTbody) return;
    if (gachaUsersCount) gachaUsersCount.textContent = (users || []).length;

    if (!users || users.length === 0) {
      gachaUsersTbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 16px; color: #94a3b8;">Henüz kayıtlı Gezgin yok. Chate yazan veya yayını izleyen izleyiciler otomatik olarak buraya eklenecektir.</td></tr>`;
      return;
    }

    gachaUsersTbody.innerHTML = users.map(u => {
      return `
        <tr>
          <td><strong>@${escapeHtml(u.username)}</strong></td>
          <td><span class="gacha-primo-badge">💎 ${u.primogems}</span></td>
          <td><span class="gacha-pity-badge">${u.pity5}/40</span></td>
          <td><span class="gacha-pity-badge">${u.pity4}/8</span></td>
          <td><strong style="color: #ffd700;">★ ${u.fiveStarsCount}</strong></td>
          <td>${u.totalWishes}</td>
          <td>
            <button class="btn btn-xs btn-outline btn-quick-add" data-user="${escapeHtml(u.username)}">+160 Primo</button>
          </td>
        </tr>
      `;
    }).join('');

    gachaUsersTbody.querySelectorAll('.btn-quick-add').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const username = e.target.getAttribute('data-user');
        await addPrimoToUser(username, 160);
      });
    });
  }

  async function addPrimoToUser(username, amount) {
    try {
      const res = await fetch('/api/gacha/add-primo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, amount })
      });
      const data = await res.json();
      if (data.success) {
        loadGachaUsers();
      }
    } catch (e) {
      alert('Primogem eklenemedi: ' + e.message);
    }
  }

  if (btnGachaRain) {
    btnGachaRain.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/gacha/rain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 160 })
        });
        const data = await res.json();
        if (data.success) {
          alert('🌧️ Primogem Yağmuru tetiklendi! Herkese +160 Primogem dağıtıldı.');
          loadGachaUsers();
        }
      } catch (e) {
        alert('Hata: ' + e.message);
      }
    });
  }

  if (btnTestWish5) {
    btnTestWish5.addEventListener('click', async () => {
      await fetch('/api/gacha/test-wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rarity: 5 })
      });
    });
  }

  if (btnTestWish4) {
    btnTestWish4.addEventListener('click', async () => {
      await fetch('/api/gacha/test-wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rarity: 4 })
      });
    });
  }

  if (btnTestWish3) {
    btnTestWish3.addEventListener('click', async () => {
      await fetch('/api/gacha/test-wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rarity: 3 })
      });
    });
  }

  if (btnGiftPrimo) {
    btnGiftPrimo.addEventListener('click', async () => {
      const username = giftUsername.value.trim();
      const amount = parseInt(giftAmount.value, 10) || 160;
      if (!username) {
        giftFeedback.style.color = '#ef4444';
        giftFeedback.textContent = 'Lütfen kullanıcı adı girin.';
        return;
      }
      try {
        const res = await fetch('/api/gacha/add-primo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, amount })
        });
        const data = await res.json();
        if (data.success) {
          giftFeedback.style.color = '#10b981';
          giftFeedback.textContent = `✅ @${username} kullanıcısına +${amount} Primogem yüklendi! (Toplam: ${data.user.primogems})`;
          giftUsername.value = '';
          loadGachaUsers();
        }
      } catch (e) {
        giftFeedback.style.color = '#ef4444';
        giftFeedback.textContent = 'Hata: ' + e.message;
      }
    });
  }

  if (btnRefreshGachaUsers) {
    btnRefreshGachaUsers.addEventListener('click', loadGachaUsers);
  }

  // Initialize
  connectWS();
  loadQuestions();
  loadGachaUsers();
})();

