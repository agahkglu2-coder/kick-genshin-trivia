const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const QUESTIONS_GENSHIN_FILE = path.join(__dirname, 'questions.json');
const QUESTIONS_GENERAL_FILE = path.join(__dirname, 'questions_general.json');

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    const normMsg = normalizeText(userMsg);
    if (!normMsg) return false;

    for (const ans of acceptableAnswers) {
      const normAns = normalizeText(ans);
      if (!normAns) continue;

      // 1. Tam eşleşme
      if (normMsg === normAns) return true;

      // 2. Mesaj kelimeler içeriyorsa ve cevap 3 karakterden uzunsa kelime sınırında arama
      if (normAns.length >= 3) {
        const regex = new RegExp(`(^|\\s)${normAns}($|\\s)`, 'i');
        if (regex.test(normMsg)) return true;
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
