const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const QUESTIONS_GENSHIN_FILE = path.join(__dirname, 'questions.json');
const QUESTIONS_GENERAL_FILE = path.join(__dirname, 'questions_general.json');

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[emote:\d+:[^\]]+\]/gi, ' ')
    .replace(/\[emoji:[^\]]+\]/gi, ' ')
    .replace(/\[mention:\d+:([^\]]+)\]/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/@[a-zA-Z0-9_\u00C0-\u017F]+/g, ' ')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/[âÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[ûÛ]/g, 'u')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_MAP = {
  '0': ['sifir'],
  '1': ['bir'],
  '2': ['iki'],
  '3': ['uc'],
  '4': ['dort', 'dorduncu'],
  '5': ['bes', 'besinci'],
  '6': ['alti', 'altinci'],
  '7': ['yedi', 'yedinci'],
  '8': ['sekiz', 'sekizinci'],
  '9': ['dokuz', 'dokuzuncu'],
  '10': ['on', 'onuncu'],
  '11': ['on bir', 'onbir', 'on birinci'],
  '12': ['on iki', 'oniki', 'on ikinci'],
  '24': ['yirmi dort', 'yirmidort'],
  '25': ['yirmi bes', 'yirmibes'],
  '52': ['elli iki', 'elliiki'],
  '88': ['seksen sekiz', 'seksensekiz'],
  '90': ['doksan', 'doksaninci'],
  '100': ['yuz', 'yuzuncu'],
  '160': ['yuz altmis', 'yuzaltmis'],
  '500': ['bes yuz', 'besyuz'],
  '1453': ['bin dort yuz elli uc', 'bindortyuzelliuc'],
  '1923': ['bin dokuz yuz yirmi uc', 'bindokuzyuzyirmiuc']
};

const NUMBER_MAP_REVERSE = {};
for (const [digit, words] of Object.entries(NUMBER_MAP)) {
  for (const w of words) {
    NUMBER_MAP_REVERSE[w] = digit;
    NUMBER_MAP_REVERSE[w.replace(/\s+/g, '')] = digit;
  }
}

// Turkish suffix matcher (normalized forms: dir, de, ye, nin...)
const TURKISH_SUFFIX_REGEX = /^(?:dir|dur|tir|tur|de|da|te|ta|ye|ya|e|a|nin|nun|in|un|yi|yu|i|u|den|dan|ten|tan|ler|lar|inci|nci|uncu|ncu|teydi|daydi)$/;
// Common attached units in stream trivia answers
const UNIT_SUFFIX_REGEX = /^(?:primo|primogem|p|pity|kisi|oyuncu|kat|metre|m|cm|saat|gun|yil|yili|yilinda|hafta|oda|odacik|derece)$/;

class GameEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      intervalMinutes: 10,
      questionDurationSeconds: 45,
      winnerDisplaySeconds: 12,
      leaderboardCooldownSeconds: 60,
      gameMode: 'first_correct', // 'first_correct' or 'draw_from_all'
      soundEnabled: true,
      triviaMode: 'genshin', // 'genshin', 'general', or 'mixed'
      ...config
    };

    this.state = 'IDLE'; // 'IDLE', 'WAITING', 'ACTIVE', 'WINNER', 'TIMEOUT'
    this.currentQuestion = null;
    this.questionStartTime = null;
    this.activeQuestionTimer = null;
    this.intervalTimer = null;
    this.tickInterval = null;

    this.secondsUntilNextQuestion = this.config.intervalMinutes * 60;
    this.secondsRemainingInQuestion = 0;

    this.correctParticipants = []; // for 'draw_from_all' mode
    this.leaderboard = {}; // { username: { count: N, profilePic: URL } }
    this.recentWinners = []; // [ { username, question, answer, wonAt } ]
    this.askedQuestionIds = new Set();
    this.lastLeaderboardTrigger = 0;

    this.genshinQuestions = [];
    this.generalQuestions = [];
    this.questions = [];

    this.loadQuestions();
  }

  loadQuestions() {
    // 1. Load Genshin Questions
    try {
      if (fs.existsSync(QUESTIONS_GENSHIN_FILE)) {
        const data = fs.readFileSync(QUESTIONS_GENSHIN_FILE, 'utf-8');
        this.genshinQuestions = JSON.parse(data);
      } else {
        this.genshinQuestions = [];
      }
    } catch (e) {
      console.error('[GameEngine] Genshin soru listesi yüklenemedi:', e);
      this.genshinQuestions = [];
    }

    // 2. Load General Knowledge Questions
    try {
      if (fs.existsSync(QUESTIONS_GENERAL_FILE)) {
        const data = fs.readFileSync(QUESTIONS_GENERAL_FILE, 'utf-8');
        this.generalQuestions = JSON.parse(data);
      } else {
        this.generalQuestions = [];
      }
    } catch (e) {
      console.error('[GameEngine] Genel Kültür soru listesi yüklenemedi:', e);
      this.generalQuestions = [];
    }

    this.refreshActivePool();

    console.log(`[GameEngine] Yüklendi -> Genshin: ${this.genshinQuestions.length}, Genel Kültür: ${this.generalQuestions.length}. Aktif Mod: "${this.config.triviaMode}" (${this.questions.length} soru aktif).`);
  }

  refreshActivePool() {
    const mode = this.config.triviaMode || 'genshin';
    if (mode === 'general') {
      this.questions = this.generalQuestions;
    } else if (mode === 'mixed') {
      // Mark origins for mixed mode
      const gMarked = this.genshinQuestions.map(q => ({ ...q, poolMode: 'genshin' }));
      const genMarked = this.generalQuestions.map(q => ({ ...q, poolMode: 'general' }));
      this.questions = [...gMarked, ...genMarked];
    } else {
      // default: genshin
      this.questions = this.genshinQuestions;
    }
  }

  setTriviaMode(mode) {
    if (!['genshin', 'general', 'mixed'].includes(mode)) {
      throw new Error(`Geçersiz trivia modu: ${mode}. Geçerli modlar: genshin, general, mixed.`);
    }

    const previousMode = this.config.triviaMode;
    this.config.triviaMode = mode;
    this.askedQuestionIds.clear();
    this.refreshActivePool();

    console.log(`[GameEngine] 🎯 Trivia Modu değiştirildi: ${previousMode} -> ${mode} (${this.questions.length} soru aktif)`);

    this.emit('trivia_mode_changed', {
      mode: this.config.triviaMode,
      previousMode,
      activeCount: this.questions.length,
      genshinCount: this.genshinQuestions.length,
      generalCount: this.generalQuestions.length
    });

    this.emitState();
    return {
      success: true,
      mode: this.config.triviaMode,
      activeCount: this.questions.length
    };
  }

  saveQuestions(targetMode = null) {
    try {
      const mode = targetMode || this.config.triviaMode;
      if (mode === 'general') {
        fs.writeFileSync(QUESTIONS_GENERAL_FILE, JSON.stringify(this.generalQuestions, null, 2), 'utf-8');
      } else if (mode === 'genshin') {
        fs.writeFileSync(QUESTIONS_GENSHIN_FILE, JSON.stringify(this.genshinQuestions, null, 2), 'utf-8');
      } else {
        fs.writeFileSync(QUESTIONS_GENSHIN_FILE, JSON.stringify(this.genshinQuestions, null, 2), 'utf-8');
        fs.writeFileSync(QUESTIONS_GENERAL_FILE, JSON.stringify(this.generalQuestions, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('[GameEngine] Soru listesi kaydedilemedi:', e);
    }
  }

  start() {
    console.log('[GameEngine] Oyun motoru başlatıldı.');
    this.state = 'WAITING';
    this.secondsUntilNextQuestion = this.config.intervalMinutes * 60;
    this.startTickLoop();
    this.emitState();
  }

  stop() {
    clearInterval(this.tickInterval);
    clearTimeout(this.activeQuestionTimer);
    clearTimeout(this.intervalTimer);
    this.state = 'IDLE';
    this.emitState();
  }

  startTickLoop() {
    clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => {
      if (this.state === 'WAITING') {
        this.secondsUntilNextQuestion--;
        if (this.secondsUntilNextQuestion <= 0) {
          this.triggerQuestion();
        } else {
          this.emit('tick', {
            state: this.state,
            secondsUntilNextQuestion: this.secondsUntilNextQuestion
          });
        }
      } else if (this.state === 'ACTIVE') {
        this.secondsRemainingInQuestion--;
        if (this.secondsRemainingInQuestion <= 0) {
          this.handleQuestionTimeExpired();
        } else {
          this.emit('tick', {
            state: this.state,
            secondsRemainingInQuestion: this.secondsRemainingInQuestion,
            totalDuration: this.config.questionDurationSeconds
          });
        }
      }
    }, 1000);
  }

  getRandomQuestion(forceId = null) {
    if (!this.questions || this.questions.length === 0) return null;

    if (forceId) {
      const found = this.questions.find(q => q.id === forceId);
      if (found) return found;
    }

    // Filter out recently asked questions if possible
    let available = this.questions.filter(q => !this.askedQuestionIds.has(q.id));
    if (available.length === 0) {
      this.askedQuestionIds.clear();
      available = this.questions;
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const chosen = available[randomIndex];
    this.askedQuestionIds.add(chosen.id);
    return chosen;
  }

  triggerQuestion(manualQuestionId = null) {
    clearTimeout(this.activeQuestionTimer);

    const question = this.getRandomQuestion(manualQuestionId);
    if (!question) {
      console.warn('[GameEngine] Havuzda soru bulunamadı!');
      return;
    }

    this.currentQuestion = question;
    this.state = 'ACTIVE';
    this.questionStartTime = Date.now();
    this.secondsRemainingInQuestion = this.config.questionDurationSeconds;
    this.correctParticipants = [];

    const effectiveMode = question.poolMode || this.config.triviaMode || 'genshin';
    const modeBadge = effectiveMode === 'general' ? '🌍 Genel Kültür' : '⚔️ Genshin Impact';

    console.log(`[GameEngine] 🔔 Soru soruldu (#${question.id}) [${modeBadge}]: "${question.question}"`);

    this.emit('question_started', {
      question: {
        id: question.id,
        category: question.category,
        difficulty: question.difficulty,
        question: question.question,
        hint: question.hint,
        triviaMode: effectiveMode
      },
      duration: this.config.questionDurationSeconds,
      gameMode: this.config.gameMode,
      triviaMode: effectiveMode
    });

    this.emitState();
  }

  cancelQuestion() {
    if (this.state !== 'ACTIVE') return;
    console.log('[GameEngine] Aktif soru iptal edildi.');
    clearTimeout(this.activeQuestionTimer);
    this.currentQuestion = null;
    this.state = 'WAITING';
    this.secondsUntilNextQuestion = this.config.intervalMinutes * 60;

    this.emit('question_cancelled', {});
    this.emitState();
  }

  isAnswerCorrect(userMsg, acceptableAnswers) {
    if (!userMsg || !Array.isArray(acceptableAnswers) || acceptableAnswers.length === 0) return false;
    const normMsg = normalizeText(userMsg);
    if (!normMsg) return false;
    const cleanMsgNoSpaces = normMsg.replace(/\s+/g, '');
    const wordsInMsg = normMsg.split(' ').filter(Boolean);

    // Expand acceptable answers with number equivalents
    const expandedAnswers = [];
    for (const a of acceptableAnswers) {
      if (!a) continue;
      expandedAnswers.push(a);
      const normA = normalizeText(a);
      if (NUMBER_MAP[normA]) {
        expandedAnswers.push(...NUMBER_MAP[normA]);
      }
      if (NUMBER_MAP_REVERSE[normA]) {
        expandedAnswers.push(NUMBER_MAP_REVERSE[normA]);
      }
      const cleanANoSpaces = normA.replace(/\s+/g, '');
      if (NUMBER_MAP_REVERSE[cleanANoSpaces]) {
        expandedAnswers.push(NUMBER_MAP_REVERSE[cleanANoSpaces]);
      }
    }

    for (const ans of expandedAnswers) {
      const normAns = normalizeText(ans);
      if (!normAns) continue;
      const cleanAnsNoSpaces = normAns.replace(/\s+/g, '');

      // 1. Exact match
      if (normMsg === normAns) return true;

      // 2. Space-agnostic exact match (e.g. 'hutao' === 'hu tao', 'davinci' === 'da vinci')
      if (cleanMsgNoSpaces === cleanAnsNoSpaces) return true;

      const isSingleWordAns = !normAns.includes(' ');

      if (isSingleWordAns) {
        for (const w of wordsInMsg) {
          // Direct token match (even if 1-2 chars, e.g. '4', 'ei', 'oz')
          if (w === normAns) return true;

          // Turkish suffix or attached unit check (e.g. 'ventidir', '1923te', 'diluctur', '160primo')
          if (w.startsWith(normAns)) {
            const suffix = w.slice(normAns.length);
            if (TURKISH_SUFFIX_REGEX.test(suffix) || UNIT_SUFFIX_REGEX.test(suffix)) {
              return true;
            }
          }

          // Fuzzy match: 1-character typo tolerance for words with length >= 5
          if (normAns.length >= 5 && Math.abs(w.length - normAns.length) <= 1) {
            if (levenshtein(w, normAns) <= 1) return true;
          }
        }
      } else {
        // Multi-word answer in sentence (e.g. 'bence hu tao kesin')
        const escaped = normAns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\s)${escaped}(?=$|\\s)`, 'i');
        if (regex.test(normMsg)) return true;

        // Space-stripped multi-word match in sentence (e.g. 'bence hutao bence')
        for (const w of wordsInMsg) {
          if (w === cleanAnsNoSpaces) return true;
          if (w.startsWith(cleanAnsNoSpaces)) {
            const suffix = w.slice(cleanAnsNoSpaces.length);
            if (TURKISH_SUFFIX_REGEX.test(suffix)) return true;
          }
        }

        // Fuzzy multi-word match when comparing full space-stripped strings
        if (cleanAnsNoSpaces.length >= 6 && cleanMsgNoSpaces.length >= 5) {
          if (levenshtein(cleanMsgNoSpaces, cleanAnsNoSpaces) <= 1) return true;
        }
      }
    }

    return false;
  }

  checkChatCommands(content, sender) {
    if (!content) return false;
    const trimmed = content.trim().toLowerCase();
    
    // Command matches: !sıralama, !siralama, !leaderboard, !top, !liderler, !puan, !skor
    const isLeaderboardCmd = ['!sıralama', '!siralama', '!leaderboard', '!top', '!liderler', '!puan', '!skor']
      .some(cmd => trimmed === cmd || trimmed.startsWith(cmd + ' '));

    if (isLeaderboardCmd) {
      if (this.state === 'ACTIVE') {
        console.log(`[GameEngine] !sıralama komutu atlandı: Soru şu an aktif (${sender.username}).`);
        return true;
      }

      const now = Date.now();
      const cooldownMs = (this.config.leaderboardCooldownSeconds || 60) * 1000;
      const elapsed = now - this.lastLeaderboardTrigger;
      if (elapsed < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsed) / 1000);
        console.log(`[GameEngine] !sıralama bekleme süresinde (${remainingSec}s kaldı) - Kullanıcı: ${sender.username}`);
        return true;
      }

      this.lastLeaderboardTrigger = now;
      console.log(`[GameEngine] 🏆 Sıralama komutu tetiklendi! İsteyen: ${sender.username}`);
      this.triggerLeaderboardDisplay(sender.username);
      return true;
    }

    return false;
  }

  triggerLeaderboardDisplay(requestedBy = null) {
    const list = Object.entries(this.leaderboard)
      .map(([username, data]) => ({ username, count: data.count, profilePic: data.profilePic }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    this.emit('show_leaderboard', {
      requestedBy: requestedBy || null,
      duration: 9,
      leaderboard: list
    });
  }

  handleChatMessage(chatMsg) {
    const { content, sender } = chatMsg;
    if (!content || !sender || !sender.username) return;

    // 1. Check for Chat Commands like !sıralama
    if (this.checkChatCommands(content, sender)) {
      return;
    }

    // 2. Check Answer for Active Question
    if (this.state !== 'ACTIVE' || !this.currentQuestion) return;

    const isCorrect = this.isAnswerCorrect(content, this.currentQuestion.answers);
    if (!isCorrect) return;

    console.log(`[GameEngine] 🎉 Doğru cevap tespit edildi! Kullanıcı: ${sender.username} - Cevap: "${content}"`);

    if (this.config.gameMode === 'first_correct') {
      this.declareWinner({
        winner: {
          username: sender.username,
          profilePic: sender.profilePic || null
        },
        answerGiven: content,
        correctAnswers: this.currentQuestion.answers,
        question: this.currentQuestion
      });
    } else {
      // draw_from_all mode: collect unique chatters
      const alreadyIn = this.correctParticipants.find(p => p.username.toLowerCase() === sender.username.toLowerCase());
      if (!alreadyIn) {
        this.correctParticipants.push({
          username: sender.username,
          profilePic: sender.profilePic || null,
          answerGiven: content
        });
        this.emit('correct_participant_added', {
          count: this.correctParticipants.length,
          latest: sender.username
        });
      }
    }
  }

  handleQuestionTimeExpired() {
    if (this.state !== 'ACTIVE' || !this.currentQuestion) return;

    if (this.config.gameMode === 'draw_from_all' && this.correctParticipants.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.correctParticipants.length);
      const chosen = this.correctParticipants[randomIndex];
      this.declareWinner({
        winner: {
          username: chosen.username,
          profilePic: chosen.profilePic
        },
        answerGiven: chosen.answerGiven,
        correctAnswers: this.currentQuestion.answers,
        question: this.currentQuestion,
        totalParticipants: this.correctParticipants.length
      });
      return;
    }

    // Nobody answered correctly
    console.log('[GameEngine] ⌛ Süre doldu, doğru cevap gelmedi.');
    this.state = 'TIMEOUT';

    this.emit('question_timeout', {
      question: this.currentQuestion,
      correctAnswers: this.currentQuestion.answers,
      displaySeconds: 8
    });

    this.emitState();

    setTimeout(() => {
      this.currentQuestion = null;
      this.state = 'WAITING';
      this.secondsUntilNextQuestion = this.config.intervalMinutes * 60;
      this.emitState();
    }, 8000);
  }

  declareWinner(winData) {
    this.state = 'WINNER';

    // Update leaderboard
    const user = winData.winner.username;
    if (!this.leaderboard[user]) {
      this.leaderboard[user] = { count: 0, profilePic: winData.winner.profilePic };
    }
    this.leaderboard[user].count++;
    if (winData.winner.profilePic) {
      this.leaderboard[user].profilePic = winData.winner.profilePic;
    }

    // Recent winners list
    const logItem = {
      username: user,
      profilePic: winData.winner.profilePic,
      questionText: winData.question.question,
      answerGiven: winData.answerGiven,
      triviaMode: winData.question.poolMode || this.config.triviaMode || 'genshin',
      wonAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    this.recentWinners.unshift(logItem);
    if (this.recentWinners.length > 20) this.recentWinners.pop();

    this.emit('winner_declared', {
      ...winData,
      winsCount: this.leaderboard[user].count,
      displaySeconds: this.config.winnerDisplaySeconds,
      triviaMode: winData.question.poolMode || this.config.triviaMode || 'genshin'
    });

    this.emitState();

    // After celebration duration, return to WAITING state
    setTimeout(() => {
      this.currentQuestion = null;
      this.state = 'WAITING';
      this.secondsUntilNextQuestion = this.config.intervalMinutes * 60;
      this.emitState();
    }, this.config.winnerDisplaySeconds * 1000);
  }

  // Trigger preview test for OBS configuration
  triggerTestPreview() {
    const isGeneral = this.config.triviaMode === 'general';
    this.emit('test_preview', {
      question: {
        id: 999,
        category: isGeneral ? "Coğrafya" : "Test Kategorisi",
        difficulty: "Kolay",
        question: isGeneral ? "Türkiye'nin başkenti neresidir?" : "Genshin Impact'te Paimon'un meşhur takma adı nedir?",
        hint: isGeneral ? "İç Anadolu'da yer alır." : "Acil durum yemeği!",
        triviaMode: this.config.triviaMode
      },
      duration: 10,
      mockWinner: {
        username: isGeneral ? "BilgiAvcisi" : "GenshinGezgini",
        profilePic: null,
        answerGiven: isGeneral ? "Ankara" : "Acil durum yemeği",
        winsCount: 3
      },
      triviaMode: this.config.triviaMode
    });
  }

  emitState() {
    this.emit('state_changed', this.getFullState());
  }

  getFullState() {
    return {
      state: this.state,
      secondsUntilNextQuestion: this.secondsUntilNextQuestion,
      secondsRemainingInQuestion: this.secondsRemainingInQuestion,
      currentQuestion: this.currentQuestion ? {
        id: this.currentQuestion.id,
        category: this.currentQuestion.category,
        difficulty: this.currentQuestion.difficulty,
        question: this.currentQuestion.question,
        hint: this.currentQuestion.hint,
        triviaMode: this.currentQuestion.poolMode || this.config.triviaMode || 'genshin'
      } : null,
      config: this.config,
      triviaMode: this.config.triviaMode || 'genshin',
      stats: {
        genshinCount: (this.genshinQuestions || []).length,
        generalCount: (this.generalQuestions || []).length,
        activeCount: (this.questions || []).length
      },
      recentWinners: this.recentWinners,
      leaderboard: Object.entries(this.leaderboard)
        .map(([username, data]) => ({ username, count: data.count, profilePic: data.profilePic }))
        .sort((a, b) => b.count - a.count)
    };
  }

  updateConfig(newConfig) {
    const modeChanged = newConfig.triviaMode && newConfig.triviaMode !== this.config.triviaMode;
    this.config = { ...this.config, ...newConfig };
    if (modeChanged) {
      this.setTriviaMode(this.config.triviaMode);
    }
    if (this.state === 'WAITING') {
      this.secondsUntilNextQuestion = Math.min(this.secondsUntilNextQuestion, this.config.intervalMinutes * 60);
    }
    this.emitState();
  }

  addQuestion(q, targetMode = null) {
    if (!q.question || !q.answers || q.answers.length === 0) {
      throw new Error('Soru metni ve en az bir geçerli cevap gereklidir.');
    }

    const mode = targetMode || q.mode || this.config.triviaMode || 'genshin';
    const targetPool = (mode === 'general') ? this.generalQuestions : this.genshinQuestions;

    const newId = targetPool.length > 0 ? Math.max(...targetPool.map(x => x.id || 0)) + 1 : 1;
    const newQ = {
      id: newId,
      category: q.category || (mode === 'general' ? 'Genel Kültür' : 'Genel'),
      difficulty: q.difficulty || 'Orta',
      question: q.question.trim(),
      answers: Array.isArray(q.answers) ? q.answers.map(a => a.trim()).filter(Boolean) : [q.answers.trim()],
      hint: (q.hint || '').trim()
    };

    targetPool.push(newQ);
    this.saveQuestions(mode);
    this.refreshActivePool();
    this.emitState();
    return { ...newQ, mode };
  }
}

module.exports = { GameEngine, normalizeText };
