const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.type = 'file'; // 'postgres' or 'file'
    this.inMemoryUsers = new Map();
    this.inMemorySettings = new Map();
    this.isInitialized = false;
    this.lastError = null;
  }

  async init(databaseUrl = null) {
    const url = databaseUrl || process.env.DATABASE_URL;

    if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
      try {
        console.log('[DB] PostgreSQL veritabanına bağlanılıyor...');
        this.pool = new Pool({
          connectionString: url,
          ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 8000
        });

        // Test connection
        const client = await this.pool.connect();
        try {
          // Initialize Schema
          await client.query(`
            CREATE TABLE IF NOT EXISTS gacha_users (
              username VARCHAR(100) PRIMARY KEY,
              primogems INT DEFAULT 160,
              pity4 INT DEFAULT 0,
              pity5 INT DEFAULT 0,
              total_wishes INT DEFAULT 0,
              five_stars_count INT DEFAULT 0,
              four_stars_count INT DEFAULT 0,
              three_stars_count INT DEFAULT 0,
              inventory JSONB DEFAULT '[]'::jsonb,
              last_chat_award BIGINT DEFAULT 0,
              last_active BIGINT DEFAULT 0,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );

            ALTER TABLE gacha_users ADD COLUMN IF NOT EXISTS three_stars_count INT DEFAULT 0;

            CREATE TABLE IF NOT EXISTS system_settings (
              key VARCHAR(100) PRIMARY KEY,
              value TEXT,
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );
          `);

          this.type = 'postgres';
          this.lastError = null;
          console.log('[DB] ✅ PostgreSQL veritabanı başarıyla bağlandı ve tablolar hazırlandı!');
        } finally {
          client.release();
        }
      } catch (err) {
        console.warn(`[DB] PostgreSQL bağlantı hatası (${err.message}). Yerel dosya moduna geçiliyor.`);
        this.type = 'file';
        this.pool = null;
        this.lastError = err.message;
      }
    } else {
      this.type = 'file';
      this.lastError = null;
      console.log('[DB] Yerel dosya depolama modu (JSON) devrede.');
    }

    // Load initial users into memory
    await this.loadAll();
    this.isInitialized = true;
    return { type: this.type };
  }

  async loadAll() {
    if (this.type === 'postgres' && this.pool) {
      try {
        // Load settings from Postgres
        const sRes = await this.pool.query('SELECT key, value FROM system_settings');
        for (const row of sRes.rows) {
          try {
            this.inMemorySettings.set(row.key, JSON.parse(row.value));
          } catch (e) {
            this.inMemorySettings.set(row.key, row.value);
          }
        }

        // Load users from Postgres
        const uRes = await this.pool.query('SELECT * FROM gacha_users');
        for (const row of uRes.rows) {
          this.inMemoryUsers.set(row.username.toLowerCase(), {
            username: row.username,
            primogems: row.primogems,
            pity4: row.pity4,
            pity5: row.pity5,
            totalWishes: row.total_wishes,
            fiveStarsCount: row.five_stars_count,
            fourStarsCount: row.four_stars_count,
            threeStarsCount: row.three_stars_count || 0,
            inventory: typeof row.inventory === 'string' ? JSON.parse(row.inventory) : (row.inventory || []),
            lastChatAwardTime: Number(row.last_chat_award || 0),
            lastActiveTime: Number(row.last_active || 0),
            createdAt: row.created_at
          });
        }
        console.log(`[DB] PostgreSQL'den ${this.inMemoryUsers.size} kullanıcı yüklendi.`);

        // If Postgres was empty but local users.json exists, migrate it!
        if (this.inMemoryUsers.size === 0 && fs.existsSync(USERS_FILE)) {
          console.log('[DB] Yerel users.json verisi PostgreSQL veritabanına aktarılıyor...');
          this.loadLocalUsers();
          for (const u of this.inMemoryUsers.values()) {
            await this.saveUser(u);
          }
        }
        return;
      } catch (err) {
        console.warn('[DB] PostgreSQL veri okuma hatası:', err.message);
      }
    }

    // File Mode fallback
    this.loadLocalUsers();
    this.loadLocalSettings();
  }

  loadLocalUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this.inMemoryUsers.set(k.toLowerCase(), v);
        }
        console.log(`[DB] Yerel dosyadan ${this.inMemoryUsers.size} kullanıcı yüklendi.`);
      }
    } catch (e) {
      console.warn('[DB] users.json okunamadı:', e.message);
    }
  }

  loadLocalSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this.inMemorySettings.set(k, v);
        }
      }
    } catch (e) {}
  }

  saveLocalUsers() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj = {};
      for (const [k, v] of this.inMemoryUsers.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] users.json kaydedilemedi:', e.message);
    }
  }

  saveLocalSettings() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj = {};
      for (const [k, v] of this.inMemorySettings.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {}
  }

  // User Operations
  getUser(username) {
    if (!username) return null;
    return this.inMemoryUsers.get(username.toLowerCase()) || null;
  }

  getAllUsers() {
    const obj = {};
    for (const [k, v] of this.inMemoryUsers.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  async saveUser(user) {
    if (!user || !user.username) return;
    const key = user.username.toLowerCase();
    this.inMemoryUsers.set(key, user);

    // Save locally
    this.saveLocalUsers();

    // If Postgres is connected, save asynchronously
    if (this.type === 'postgres' && this.pool) {
      try {
        const query = `
          INSERT INTO gacha_users (
            username, primogems, pity4, pity5, total_wishes,
            five_stars_count, four_stars_count, three_stars_count, inventory,
            last_chat_award, last_active, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (username) DO UPDATE SET
            primogems = EXCLUDED.primogems,
            pity4 = EXCLUDED.pity4,
            pity5 = EXCLUDED.pity5,
            total_wishes = EXCLUDED.total_wishes,
            five_stars_count = EXCLUDED.five_stars_count,
            four_stars_count = EXCLUDED.four_stars_count,
            three_stars_count = EXCLUDED.three_stars_count,
            inventory = EXCLUDED.inventory,
            last_chat_award = EXCLUDED.last_chat_award,
            last_active = EXCLUDED.last_active;
        `;
        const values = [
          user.username,
          user.primogems || 0,
          user.pity4 || 0,
          user.pity5 || 0,
          user.totalWishes || 0,
          user.fiveStarsCount || 0,
          user.fourStarsCount || 0,
          user.threeStarsCount || 0,
          JSON.stringify(user.inventory || []),
          user.lastChatAwardTime || 0,
          user.lastActiveTime || Date.now(),
          user.createdAt ? new Date(user.createdAt) : new Date()
        ];
        await this.pool.query(query, values);
      } catch (err) {
        console.error('[DB] PostgreSQL saveUser hatası:', err.message);
      }
    }
  }

  async saveAllUsers(usersMap) {
    for (const [k, v] of Object.entries(usersMap)) {
      await this.saveUser(v);
    }
  }

  // System Settings Operations
  getSetting(key) {
    return this.inMemorySettings.get(key);
  }

  async setSetting(key, val) {
    this.inMemorySettings.set(key, val);
    this.saveLocalSettings();

    if (this.type === 'postgres' && this.pool) {
      try {
        const query = `
          INSERT INTO system_settings (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW();
        `;
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        await this.pool.query(query, [key, strVal]);
      } catch (err) {
        console.error('[DB] PostgreSQL setSetting hatası:', err.message);
      }
    }
  }

  getStatus() {
    return {
      type: this.type,
      connected: this.type === 'postgres' && Boolean(this.pool),
      usersCount: this.inMemoryUsers.size,
      settingsCount: this.inMemorySettings.size,
      lastError: this.lastError || null
    };
  }
}

const db = new DatabaseManager();

module.exports = { db, DatabaseManager };
