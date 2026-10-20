(() => {
  // DOM Elements
  const bossOverlay = document.getElementById('boss-overlay');
  const alarmFlash = document.getElementById('boss-alarm-flash');
  const bossStage = document.getElementById('boss-stage');

  // HUD
  const bossName = document.getElementById('boss-name');
  const bossTitle = document.getElementById('boss-title');
  const bossElementBadge = document.getElementById('boss-element-badge');
  const timerBadge = document.getElementById('boss-timer-badge');
  const timerIcon = document.getElementById('timer-icon');
  const bossTimerText = document.getElementById('boss-timer-text');

  // HP Bar
  const hpBarCurrent = document.getElementById('hp-bar-current');
  const hpBarGhost = document.getElementById('hp-bar-ghost');
  const hpExactText = document.getElementById('hp-exact-text');
  const hpPercentText = document.getElementById('hp-percent-text');

  // Shield Bar
  const shieldBarWrapper = document.getElementById('shield-bar-wrapper');
  const shieldTitle = document.getElementById('shield-title');
  const shieldMetric = document.getElementById('shield-metric');
  const shieldBarFill = document.getElementById('shield-bar-fill');

  // Arena & Boss Entity
  const bossEntity = document.getElementById('boss-entity');
  const bossAvatarImg = document.getElementById('boss-avatar-img');
  const bossAuraGlow = document.getElementById('boss-aura-glow');
  const bossDialogueBubble = document.getElementById('boss-dialogue-bubble');
  const bossDialogueText = document.getElementById('boss-dialogue-text');
  const fctContainer = document.getElementById('fct-container');
  const tacticalBanner = document.getElementById('tactical-banner');
  const tacticalSkillName = document.getElementById('tactical-skill-name');
  const tacticalSkillPrompt = document.getElementById('tactical-skill-prompt');

  // Warriors Bar
  const warriorsCount = document.getElementById('warriors-count');
  const warriorsCallHint = document.getElementById('warriors-call-hint');
  const warriorsPillsRow = document.getElementById('warriors-pills-row');

  // Modals
  const victoryScreen = document.getElementById('victory-screen');
  const mvpUsername = document.getElementById('mvp-username');
  const mvpDamage = document.getElementById('mvp-damage');
  const lasthitCard = document.getElementById('lasthit-card');
  const lasthitUsername = document.getElementById('lasthit-username');
  const defeatScreen = document.getElementById('defeat-screen');

  let currentBoss = null;
  let currentState = 'IDLE';
  let ghostTimeout = null;
  let hitFrameTimeout = null;
  const preloadedFrames = {};

  function preloadFrames(frames) {
    if (!frames) return;
    Object.entries(frames).forEach(([key, url]) => {
      if (!preloadedFrames[url]) {
        const img = new Image();
        img.src = url;
        preloadedFrames[url] = img;
      }
    });
  }

  function setBossFrame(frameType) {
    if (!currentBoss) return;
    let targetUrl = currentBoss.avatarUrl;
    if (currentBoss.frames && currentBoss.frames[frameType]) {
      targetUrl = currentBoss.frames[frameType];
    }
    if (targetUrl && bossAvatarImg.getAttribute('src') !== targetUrl) {
      bossAvatarImg.src = targetUrl;
    }
    bossEntity.classList.remove('frame-idle', 'frame-hit', 'frame-attack');
    bossEntity.classList.add(`frame-${frameType}`);
  }

  // Sound Effects Generator (Active by default, syncs with server config)
  let soundEnabled = true;
  let audioCtx = null;
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      }
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      } else if (type === 'crit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(640, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.setValueAtTime(580, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else if (type === 'victory') {
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.connect(g);
          g.connect(audioCtx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.12);
          g.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.12);
          g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.4);
          o.start(audioCtx.currentTime + i * 0.12);
          o.stop(audioCtx.currentTime + i * 0.12 + 0.4);
        });
      }
    } catch (e) {}
  }

  // WebSocket Connection
  let socket = null;
  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[BossOverlay] WebSocket Bağlandı.');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch (err) {
        console.error('[BossOverlay] Parse hatası:', err);
      }
    };

    socket.onclose = () => {
      setTimeout(connectWS, 2500);
    };
  }

  function handleWSMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
        if (msg.config && msg.config.soundEnabled !== undefined) {
          soundEnabled = !!msg.config.soundEnabled;
        }
        if (msg.bossState) {
          applyBossState(msg.bossState);
        }
        break;

      case 'CONFIG_UPDATED':
        if (msg.config && msg.config.soundEnabled !== undefined) {
          soundEnabled = !!msg.config.soundEnabled;
        }
        break;

      case 'BOSS_STATE':
        if (msg.state) {
          applyBossState(msg.state);
        }
        break;

      case 'BOSS_LOBBY':
        onBossLobby(msg.boss);
        break;

      case 'BOSS_BATTLE_STARTED':
        onBattleStarted(msg.boss);
        break;

      case 'BOSS_WARRIOR_JOINED':
        onWarriorJoined(msg.warrior, msg.participantsCount);
        break;

      case 'BOSS_ATTACK':
        onBossAttack(msg);
        break;

      case 'BOSS_TACTICAL_STARTED':
        onTacticalStarted(msg);
        break;

      case 'BOSS_TACTICAL_HIT':
        onTacticalHit(msg);
        break;

      case 'BOSS_TACTICAL_SUCCESS':
        onTacticalSuccess(msg);
        break;

      case 'BOSS_TACTICAL_FAIL':
        onTacticalFail(msg);
        break;

      case 'BOSS_VICTORY':
        onVictory(msg);
        break;

      case 'BOSS_DEFEAT':
        onDefeat(msg);
        break;

      case 'BOSS_TICK':
        onTick(msg);
        break;

      default:
        break;
    }
  }

  function applyBossState(stateObj) {
    currentState = stateObj.state || 'IDLE';
    currentBoss = stateObj.activeBoss || null;

    if (currentState === 'IDLE') {
      bossStage.classList.add('hidden');
      alarmFlash.classList.add('hidden');
      victoryScreen.classList.add('hidden');
      defeatScreen.classList.add('hidden');
      return;
    }

    if (currentBoss) {
      renderBossInfo(currentBoss);
      updateHpBar(currentBoss.currentHp, currentBoss.maxHp);
      bossStage.classList.remove('hidden');
    }

    if (currentState === 'LOBBY') {
      alarmFlash.classList.remove('hidden');
      timerIcon.textContent = '⏳';
      warriorsCallHint.innerHTML = 'Sohbete <strong>!katil</strong> veya <strong>!katıl</strong> yazarak savaşa katılın!';
    } else if (currentState === 'BATTLE') {
      alarmFlash.classList.add('hidden');
      timerIcon.textContent = '⚔️';
      warriorsCallHint.innerHTML = 'Savaşçılar otomatik saldırıyor!';
    } else if (currentState === 'TACTICAL') {
      tacticalBanner.classList.remove('hidden');
      shieldBarWrapper.classList.remove('hidden');
    } else if (currentState === 'VICTORY') {
      // Victory state is handled by onVictory
    } else if (currentState === 'DEFEAT') {
      // Defeat state
    }

    if (Array.isArray(stateObj.participants)) {
      renderWarriors(stateObj.participants);
    }
  }

  function renderBossInfo(boss) {
    if (!boss) return;
    bossName.textContent = boss.name;
    bossTitle.textContent = boss.title;
    bossElementBadge.textContent = boss.element || 'Normal';
    if (boss.elementColor) {
      bossElementBadge.style.borderColor = boss.elementColor;
      bossElementBadge.style.color = boss.elementColor;
    }
    if (boss.frames) {
      preloadFrames(boss.frames);
    }
    setBossFrame('idle');
    if (boss.elementColor) {
      bossAuraGlow.style.background = `radial-gradient(circle, ${boss.elementColor}55 0%, ${boss.elementColor}22 50%, transparent 75%)`;
    }
  }

  function updateHpBar(current, max) {
    const cur = Math.max(0, current);
    const pct = Math.min(100, Math.max(0, (cur / max) * 100));

    hpBarCurrent.style.width = `${pct}%`;
    hpExactText.textContent = `${cur.toLocaleString('tr-TR')} / ${max.toLocaleString('tr-TR')}`;
    hpPercentText.textContent = `${pct.toFixed(1)}%`;

    // Smooth ghost damage lagging effect
    clearTimeout(ghostTimeout);
    ghostTimeout = setTimeout(() => {
      hpBarGhost.style.width = `${pct}%`;
    }, 450);
  }

  function onBossLobby(boss) {
    currentBoss = boss;
    currentState = 'LOBBY';
    playSound('alarm');

    renderBossInfo(boss);
    updateHpBar(boss.currentHp, boss.maxHp);

    alarmFlash.classList.remove('hidden');
    bossStage.classList.remove('hidden');
    victoryScreen.classList.add('hidden');
    defeatScreen.classList.add('hidden');
    tacticalBanner.classList.add('hidden');
    shieldBarWrapper.classList.add('hidden');

    warriorsPillsRow.innerHTML = '';
    warriorsCount.textContent = '0 Savaşçı';
    warriorsCallHint.innerHTML = 'Sohbete <strong>!katil</strong> veya <strong>!katıl</strong> yazarak savaşa katılın!';

    // Show initial boss quote
    if (boss.quote) {
      showBossDialogue(boss.quote, 5000);
    }
  }

  function onBattleStarted(boss) {
    currentState = 'BATTLE';
    alarmFlash.classList.add('hidden');
    timerIcon.textContent = '⚔️';
    warriorsCallHint.innerHTML = 'Savaşçılar otomatik saldırıyor!';
    playSound('crit');
  }

  function onWarriorJoined(warrior, count) {
    warriorsCount.textContent = `${count} Savaşçı`;
    const pill = document.createElement('div');
    pill.className = `warrior-pill ${warrior.rarity === 5 ? 'five-star' : warrior.rarity === 4 ? 'four-star' : ''}`;
    const starTag = warrior.rarity === 5 ? '★5' : warrior.rarity === 4 ? '★4' : '';
    pill.innerHTML = `<strong>@${escapeHtml(warrior.username)}</strong> <span style="font-size:0.7rem; opacity:0.8;">(${escapeHtml(warrior.characterName)} ${starTag})</span>`;
    warriorsPillsRow.prepend(pill);
  }

  function onBossAttack(attackData) {
    // Shake boss
    bossEntity.classList.remove('hit');
    void bossEntity.offsetWidth;
    bossEntity.classList.add('hit');

    // Dynamically switch to hit reaction frame
    setBossFrame('hit');
    clearTimeout(hitFrameTimeout);
    hitFrameTimeout = setTimeout(() => {
      if (currentState === 'TACTICAL') {
        setBossFrame('attack');
      } else if (currentState === 'VICTORY' || currentState === 'DEFEAT') {
        setBossFrame('hit');
      } else {
        setBossFrame('idle');
      }
    }, 420);

    playSound(attackData.isCrit ? 'crit' : 'hit');

    // Update HP
    updateHpBar(attackData.bossRemainingHp, attackData.bossMaxHp);

    // Spawn Floating Combat Text (FCT)
    spawnFCT(attackData);
  }

  function spawnFCT(attackData) {
    const fct = document.createElement('div');
    const isCrit = attackData.isCrit;
    const reaction = attackData.reaction;

    let classes = 'fct-number ';
    if (isCrit) classes += 'fct-crit ';
    else if (reaction === 'MELT') classes += 'fct-melt ';
    else if (reaction === 'VAPORIZE') classes += 'fct-vaporize ';
    else classes += 'fct-normal ';

    fct.className = classes;

    // Random offset around boss center
    const offsetX = Math.floor(Math.random() * 220 - 110);
    const offsetY = Math.floor(Math.random() * 120 - 60);

    fct.style.left = `calc(50% + ${offsetX}px)`;
    fct.style.top = `calc(50% + ${offsetY}px)`;

    let text = `${attackData.damage.toLocaleString('tr-TR')}`;
    if (isCrit) text = `CRIT ${text}!`;
    else if (reaction) text = `${reaction} ${text}!`;

    fct.textContent = text;
    fctContainer.appendChild(fct);

    setTimeout(() => {
      if (fct.parentNode) fct.parentNode.removeChild(fct);
    }, 1100);
  }

  function onTacticalStarted(data) {
    currentState = 'TACTICAL';
    playSound('alarm');

    // Switch to enraged attack/charge frame during tactical shield phase
    setBossFrame('attack');

    tacticalSkillName.textContent = data.skillName || 'Kalkan Fazı';
    tacticalBanner.classList.remove('hidden');
    shieldBarWrapper.classList.remove('hidden');

    updateShieldBar(data.shieldHp, data.shieldHp);

    setTimeout(() => {
      tacticalBanner.classList.add('hidden');
    }, 4500);
  }

  function onTacticalHit(data) {
    updateShieldBar(data.shieldRemaining, data.shieldMax);

    // Spawn shield damage text
    const fct = document.createElement('div');
    fct.className = 'fct-number fct-vaporize';
    fct.style.left = '50%';
    fct.style.top = '40%';
    fct.textContent = `🛡️ -${data.shieldDamage.toLocaleString('tr-TR')}`;
    fctContainer.appendChild(fct);
    setTimeout(() => { if (fct.parentNode) fct.parentNode.removeChild(fct); }, 1100);
  }

  function updateShieldBar(current, max) {
    const cur = Math.max(0, current);
    const pct = Math.min(100, Math.max(0, (cur / max) * 100));
    shieldBarFill.style.width = `${pct}%`;
    shieldMetric.textContent = `${cur.toLocaleString('tr-TR')} / ${max.toLocaleString('tr-TR')}`;
  }

  function onTacticalSuccess(data) {
    playSound('crit');
    tacticalBanner.classList.add('hidden');
    shieldBarWrapper.classList.add('hidden');
    setBossFrame('hit');
    setTimeout(() => {
      if (currentState === 'BATTLE') setBossFrame('idle');
    }, 1500);
    showBossDialogue('Kalkanım... parçalandı?!', 3500);
  }

  function onTacticalFail(data) {
    tacticalBanner.classList.add('hidden');
    shieldBarWrapper.classList.add('hidden');
    setBossFrame('idle');
  }

  function onVictory(winData) {
    currentState = 'VICTORY';
    playSound('victory');
    setBossFrame('hit');

    if (winData.mvp) {
      mvpUsername.textContent = `@${winData.mvp.username}`;
      mvpDamage.textContent = `${winData.mvp.damage.toLocaleString('tr-TR')} Hasar (${winData.mvp.characterName || 'Gezgin'})`;
    }

    if (winData.lastHit) {
      lasthitCard.classList.remove('hidden');
      lasthitUsername.textContent = `@${winData.lastHit.username}`;
    } else {
      lasthitCard.classList.add('hidden');
    }

    victoryScreen.classList.remove('hidden');

    setTimeout(() => {
      victoryScreen.classList.add('hidden');
      bossStage.classList.add('hidden');
      currentState = 'IDLE';
    }, 18000);
  }

  function onDefeat(defeatData) {
    currentState = 'DEFEAT';
    defeatScreen.classList.remove('hidden');

    setTimeout(() => {
      defeatScreen.classList.add('hidden');
      bossStage.classList.add('hidden');
      currentState = 'IDLE';
    }, 12000);
  }

  function onTick(tickData) {
    if (tickData.secondsRemaining !== undefined) {
      bossTimerText.textContent = `${tickData.secondsRemaining}s`;
    }
  }

  function showBossDialogue(text, duration = 4000) {
    bossDialogueText.textContent = text;
    bossDialogueBubble.classList.remove('hidden');
    setTimeout(() => {
      bossDialogueBubble.classList.add('hidden');
    }, duration);
  }

  function renderWarriors(participants) {
    warriorsCount.textContent = `${participants.length} Savaşçı`;
    warriorsPillsRow.innerHTML = participants.slice(0, 15).map(w => {
      const starClass = w.rarity === 5 ? 'five-star' : w.rarity === 4 ? 'four-star' : '';
      const dmgStr = w.damage > 0 ? `<span class="warrior-dmg-tag">${w.damage.toLocaleString('tr-TR')}</span>` : '';
      return `<div class="warrior-pill ${starClass}">
        <strong>@${escapeHtml(w.username)}</strong>
        ${dmgStr}
      </div>`;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // Init
  connectWS();
})();
