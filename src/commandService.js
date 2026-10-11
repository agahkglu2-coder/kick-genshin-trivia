const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');

const DEFAULT_COMMANDS = [
  {
    id: 'cmd_bot',
    name: '!bot',
    response: '🤖 Merhaba @{user}! Ben Milka\'nın yayın asistanı MilkaBot. Canlı yayın oyunları, dilekler ve sohbet için buradayım! Tüm komutlar için: !komutlar',
    cooldown: 5,
    enabled: true,
    aliases: ['!milkabot', '!asistan', '!botbilgi'],
    permission: 'everyone',
    useCount: 0,
    description: 'MilkaBot tanıtımı ve genel bilgi.'
  },
  {
    id: 'cmd_dc',
    name: '!dc',
    response: '👾 Discord topluluğumuza katılmayı unutmayın! Sohbet, etkinlikler ve duyurular burada: https://discord.gg/milka',
    cooldown: 5,
    enabled: true,
    aliases: ['!discord', '!sunucu'],
    permission: 'everyone',
    useCount: 0,
    description: 'Discord sunucu davet linki.'
  },
  {
    id: 'cmd_komutlar',
    name: '!komutlar',
    response: '📜 Kullanılabilir Komutlar: {komutlar} | Oyunlar: !wish, !bakiye, !pity, !envanter, !donustur | Karakter: !zipla, !dans, !sev',
    cooldown: 8,
    enabled: true,
    aliases: ['!commands', '!help', '!yardim', '!yardım'],
    permission: 'everyone',
    useCount: 0,
    description: 'Tüm aktif komutların listesi.'
  },
  {
    id: 'cmd_instagram',
    name: '!instagram',
    response: '📸 Instagram hesabımız: https://instagram.com/milka_e Takip etmeyi unutmayın!',
    cooldown: 5,
    enabled: true,
    aliases: ['!ig'],
    permission: 'everyone',
    useCount: 0,
    description: 'Instagram profil linki.'
  },
  {
    id: 'cmd_tiktok',
    name: '!tiktok',
    response: '🎵 TikTok hesabımız: https://tiktok.com/@milka_e Eğlenceli klipler ve kesitler burada!',
    cooldown: 5,
    enabled: true,
    aliases: ['!tt'],
    permission: 'everyone',
    useCount: 0,
    description: 'TikTok profil linki.'
  },
  {
    id: 'cmd_kurallar',
    name: '!kurallar',
    response: '📜 Chat Kuralları: Saygılı ve kibar olun, spam ve küfür yapmayın, din/siyaset tartışması yasaktır. İyi seyirler! 💜',
    cooldown: 10,
    enabled: true,
    aliases: ['!kural'],
    permission: 'everyone',
    useCount: 0,
    description: 'Yayın ve sohbet kuralları.'
  }
];

function normalizeCmd(str) {
  if (!str) return '';
  let s = String(str).trim().toLowerCase();
  s = s.replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c');
  if (!s.startsWith('!')) s = '!' + s;
  return s;
}

class CommandService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.kickBot = options.kickBot || null;
    this.db = options.db || null;
    this.commands = [];
    this.cooldowns = new Map(); // cmdId -> timestamp
  }

  setBot(kickBot) {
    this.kickBot = kickBot;
  }

  setDb(db) {
    this.db = db;
  }

  init(savedCommands = null) {
    if (Array.isArray(savedCommands) && savedCommands.length > 0) {
      this.commands = savedCommands;
      console.log(`[CommandService] ${this.commands.length} adet özel komut veritabanından yüklendi.`);
    } else {
      // Check local file fallback
      try {
        if (fs.existsSync(COMMANDS_FILE)) {
          const fileData = JSON.parse(fs.readFileSync(COMMANDS_FILE, 'utf-8'));
          if (Array.isArray(fileData) && fileData.length > 0) {
            this.commands = fileData;
            console.log(`[CommandService] ${this.commands.length} adet özel komut commands.json dosyasından yüklendi.`);
          }
        }
      } catch (e) {
        console.warn('[CommandService] commands.json okunamadı:', e.message);
      }
    }

    // If still empty, populate with default commands
    if (!this.commands || this.commands.length === 0) {
      this.commands = JSON.parse(JSON.stringify(DEFAULT_COMMANDS));
      console.log(`[CommandService] Varsayılan ${this.commands.length} komut yüklendi (!bot, !dc, !komutlar vb.).`);
      this.save();
    }

    return this.commands;
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(COMMANDS_FILE, JSON.stringify(this.commands, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CommandService] commands.json kaydedilemedi:', e.message);
    }

    if (this.db) {
      try {
        this.db.setSetting('custom_commands', this.commands);
      } catch (e) {
        console.error('[CommandService] DB kaydedilemedi:', e.message);
      }
    }
  }

  getCommands() {
    return this.commands.map(c => ({
      ...c,
      command: c.name,
      cooldownSeconds: c.cooldown
    }));
  }

  getCommandById(id) {
    const cmd = this.commands.find(c => c.id === id);
    if (!cmd) return null;
    return { ...cmd, command: cmd.name, cooldownSeconds: cmd.cooldown };
  }

  addCommand(params = {}) {
    const name = params.name || params.command;
    const cooldown = params.cooldown !== undefined ? params.cooldown : params.cooldownSeconds;
    const { response, enabled, aliases, permission, description } = params;

    if (!name || !name.trim()) throw new Error('Komut adı boş olamaz.');
    if (!response || !response.trim()) throw new Error('Yanıt mesajı boş olamaz.');

    const cleanName = normalizeCmd(name);
    // Check if duplicate name
    if (this.commands.some(c => c.name === cleanName)) {
      throw new Error(`"${cleanName}" adında bir komut zaten mevcut.`);
    }

    let cleanAliases = [];
    if (Array.isArray(aliases)) {
      cleanAliases = aliases.map(a => normalizeCmd(a)).filter(Boolean);
    } else if (typeof aliases === 'string' && aliases.trim()) {
      cleanAliases = aliases.split(',').map(a => normalizeCmd(a)).filter(Boolean);
    }

    const newCmd = {
      id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: cleanName,
      response: response.trim(),
      cooldown: Math.max(1, parseInt(cooldown, 10) || 5),
      enabled: enabled !== false,
      aliases: cleanAliases,
      permission: permission || 'everyone',
      useCount: 0,
      description: (description || '').trim(),
      createdAt: Date.now()
    };

    this.commands.push(newCmd);
    this.save();
    console.log(`[CommandService] ✅ Yeni komut eklendi: ${newCmd.name} -> "${newCmd.response}"`);
    this.emit('commands_updated', this.getCommands());
    return { ...newCmd, command: newCmd.name, cooldownSeconds: newCmd.cooldown };
  }

  updateCommand(id, fields = {}) {
    const cmd = this.commands.find(c => c.id === id);
    if (!cmd) throw new Error('Komut bulunamadı.');

    const name = fields.name || fields.command;
    if (name) {
      const cleanName = normalizeCmd(name);
      if (cleanName !== cmd.name && this.commands.some(c => c.id !== id && c.name === cleanName)) {
        throw new Error(`"${cleanName}" adında başka bir komut zaten mevcut.`);
      }
      cmd.name = cleanName;
    }

    if (fields.response !== undefined) {
      const resp = String(fields.response).trim();
      if (!resp) throw new Error('Yanıt mesajı boş olamaz.');
      cmd.response = resp;
    }

    const cooldown = fields.cooldown !== undefined ? fields.cooldown : fields.cooldownSeconds;
    if (cooldown !== undefined) {
      cmd.cooldown = Math.max(1, parseInt(cooldown, 10) || 5);
    }

    if (fields.enabled !== undefined) {
      cmd.enabled = Boolean(fields.enabled);
    }

    if (fields.aliases !== undefined) {
      if (Array.isArray(fields.aliases)) {
        cmd.aliases = fields.aliases.map(a => normalizeCmd(a)).filter(Boolean);
      } else if (typeof fields.aliases === 'string') {
        cmd.aliases = fields.aliases.split(',').map(a => normalizeCmd(a)).filter(Boolean);
      }
    }

    if (fields.permission !== undefined) {
      cmd.permission = fields.permission;
    }

    if (fields.description !== undefined) {
      cmd.description = String(fields.description).trim();
    }

    this.save();
    console.log(`[CommandService] ✏️ Komut güncellendi: ${cmd.name}`);
    this.emit('commands_updated', this.getCommands());
    return cmd;
  }

  toggleCommand(id, enabled) {
    const cmd = this.commands.find(c => c.id === id);
    if (!cmd) throw new Error('Komut bulunamadı.');
    cmd.enabled = enabled !== undefined ? Boolean(enabled) : !cmd.enabled;
    this.save();
    this.emit('commands_updated', this.getCommands());
    return cmd;
  }

  deleteCommand(id) {
    const index = this.commands.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Komut bulunamadı.');
    const deleted = this.commands.splice(index, 1)[0];
    this.save();
    console.log(`[CommandService] 🗑️ Komut silindi: ${deleted.name}`);
    this.emit('commands_updated', this.getCommands());
    return deleted;
  }

  resetToDefaults() {
    this.commands = JSON.parse(JSON.stringify(DEFAULT_COMMANDS));
    this.save();
    console.log('[CommandService] 🔄 Komutlar varsayılana sıfırlandı.');
    this.emit('commands_updated', this.getCommands());
    return this.commands;
  }

  /**
   * Process incoming chat message. Returns response string if triggered, else null.
   */
  processMessage(chatMsg, context = {}) {
    if (!chatMsg || !chatMsg.content) return null;
    const rawContent = chatMsg.content.trim();
    if (!rawContent.startsWith('!')) return null;

    const parts = rawContent.split(/\s+/);
    const trigger = normalizeCmd(parts[0]);
    const targetArg = parts[1] ? parts[1].trim() : '';

    // Find matching enabled command
    const cmd = this.commands.find(c => {
      if (!c.enabled) return false;
      if (c.name === trigger) return true;
      if (Array.isArray(c.aliases) && c.aliases.includes(trigger)) return true;
      return false;
    });

    if (!cmd) return null;

    // Check permission if restricted
    const isAuthorized = Boolean(context.isAuthorized);
    if (cmd.permission === 'mod' && !isAuthorized) {
      return null;
    }

    // Cooldown check
    const now = Date.now();
    const lastUsed = this.cooldowns.get(cmd.id) || 0;
    const cooldownMs = (cmd.cooldown || 5) * 1000;
    if (now - lastUsed < cooldownMs) {
      // Still on cooldown, silently ignore or ignore to prevent spam
      return null;
    }

    this.cooldowns.set(cmd.id, now);
    cmd.useCount = (cmd.useCount || 0) + 1;
    this.save();

    // Variable substitutions
    const username = (chatMsg.sender?.username || 'Gezgin').trim();
    const channel = (context.channel || 'milka_e').trim();
    
    // Target user (e.g. !dc @Ahmet -> @Ahmet)
    let targetUser = `@${username}`;
    if (targetArg) {
      targetUser = targetArg.startsWith('@') ? targetArg : `@${targetArg}`;
    }

    // List of active commands for {komutlar}
    const activeCmdNames = this.commands
      .filter(c => c.enabled)
      .map(c => c.name)
      .join(', ');

    // Current time
    const nowObj = new Date();
    const timeStr = nowObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = nowObj.toLocaleDateString('tr-TR');

    let reply = cmd.response;
    reply = reply.replace(/\{user\}/gi, username);
    reply = reply.replace(/\{hedef\}/gi, targetUser);
    reply = reply.replace(/\{target\}/gi, targetUser);
    reply = reply.replace(/\{kanal\}/gi, channel);
    reply = reply.replace(/\{channel\}/gi, channel);
    reply = reply.replace(/\{komutlar\}/gi, activeCmdNames);
    reply = reply.replace(/\{commands\}/gi, activeCmdNames);
    reply = reply.replace(/\{saat\}/gi, timeStr);
    reply = reply.replace(/\{time\}/gi, timeStr);
    reply = reply.replace(/\{tarih\}/gi, dateStr);
    reply = reply.replace(/\{date\}/gi, dateStr);

    console.log(`[CommandService] 💬 ${cmd.name} tetiklendi (@${username}) -> "${reply}"`);
    this.emit('command_executed', { command: cmd, user: username, reply });
    return reply;
  }
}

module.exports = { CommandService, DEFAULT_COMMANDS };
