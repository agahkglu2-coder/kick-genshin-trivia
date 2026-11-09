const EventEmitter = require('events');

/**
 * TradeEngine - Safe 2-Phase Commit P2P Trading System
 * Handles secure item & Primogem exchanges between stream viewers.
 */
class TradeEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.gachaEngine = options.gachaEngine || null;
    this.sessions = new Map(); // tradeId -> session
    this.userActiveTrades = new Map(); // username.toLowerCase() -> tradeId
  }

  setGachaEngine(gachaEngine) {
    this.gachaEngine = gachaEngine;
  }

  /**
   * Request / Start a trade session between two players
   */
  startSession(initiatorName, targetName) {
    const p1 = (initiatorName || '').trim();
    const p2 = (targetName || '').trim();

    if (!p1 || !p2 || p1.toLowerCase() === p2.toLowerCase()) {
      return { success: false, error: 'Geçersiz takas eşleşmesi.' };
    }

    if (this.userActiveTrades.has(p1.toLowerCase())) {
      return { success: false, error: `${p1} zaten aktif bir takasta bulunuyor.` };
    }
    if (this.userActiveTrades.has(p2.toLowerCase())) {
      return { success: false, error: `${p2} zaten aktif bir takasta bulunuyor.` };
    }

    const tradeId = 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);

    const session = {
      id: tradeId,
      p1: p1,
      p2: p2,
      p1Offer: {
        items: [], // Array of indices or item copies
        primogems: 0,
        locked: false,
        confirmed: false
      },
      p2Offer: {
        items: [],
        primogems: 0,
        locked: false,
        confirmed: false
      },
      status: 'ACTIVE', // 'ACTIVE', 'LOCKED', 'COUNTDOWN', 'COMPLETED', 'CANCELLED'
      countdownEndsAt: null,
      createdAt: Date.now()
    };

    this.sessions.set(tradeId, session);
    this.userActiveTrades.set(p1.toLowerCase(), tradeId);
    this.userActiveTrades.set(p2.toLowerCase(), tradeId);

    this.emit('trade_started', session);
    return { success: true, session };
  }

  getSession(tradeId) {
    return this.sessions.get(tradeId) || null;
  }

  getUserSession(username) {
    if (!username) return null;
    const tradeId = this.userActiveTrades.get(username.toLowerCase());
    return tradeId ? this.getSession(tradeId) : null;
  }

  /**
   * Update offer items and primogems.
   * If any item is modified while locked, locks are reset for safety.
   */
  updateOffer(tradeId, username, { items = null, primogems = null }) {
    const session = this.sessions.get(tradeId);
    if (!session || session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      return { success: false, error: 'Takas oturumu bulunamadı veya kapalı.' };
    }

    const isP1 = session.p1.toLowerCase() === username.toLowerCase();
    const isP2 = session.p2.toLowerCase() === username.toLowerCase();
    if (!isP1 && !isP2) {
      return { success: false, error: 'Bu takasa yetkiniz yok.' };
    }

    const myOffer = isP1 ? session.p1Offer : session.p2Offer;
    const userObj = this.gachaEngine ? this.gachaEngine.getOrCreateUser(username) : null;
    const userInventory = (userObj && Array.isArray(userObj.inventory)) ? userObj.inventory : [];
    const userPrimos = userObj ? (userObj.primogems || 0) : 0;

    // Validate Items
    if (Array.isArray(items)) {
      const validItems = [];
      const usedIndices = new Set();
      for (const itemIdx of items) {
        if (typeof itemIdx === 'number' && itemIdx >= 0 && itemIdx < userInventory.length && !usedIndices.has(itemIdx)) {
          usedIndices.add(itemIdx);
          validItems.push({
            index: itemIdx,
            item: userInventory[itemIdx]
          });
        }
      }
      myOffer.items = validItems;
    }

    // Validate Primogems
    if (typeof primogems === 'number') {
      const validPrimo = Math.max(0, Math.min(Math.floor(primogems), userPrimos));
      myOffer.primogems = validPrimo;
    }

    // Anti-scam: any offer update unlocks both sides
    myOffer.locked = false;
    myOffer.confirmed = false;
    const otherOffer = isP1 ? session.p2Offer : session.p1Offer;
    otherOffer.locked = false;
    otherOffer.confirmed = false;
    session.status = 'ACTIVE';
    session.countdownEndsAt = null;

    this.emit('trade_updated', session);
    return { success: true, session };
  }

  /**
   * Toggle lock status on player's current offer.
   */
  toggleLock(tradeId, username, lockState = true) {
    const session = this.sessions.get(tradeId);
    if (!session || session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      return { success: false, error: 'Oturum aktif değil.' };
    }

    const isP1 = session.p1.toLowerCase() === username.toLowerCase();
    const isP2 = session.p2.toLowerCase() === username.toLowerCase();
    if (!isP1 && !isP2) return { success: false, error: 'Yetkisiz işlem.' };

    const myOffer = isP1 ? session.p1Offer : session.p2Offer;
    myOffer.locked = Boolean(lockState);
    myOffer.confirmed = false;

    // If both locked, enter COUNTDOWN state (e.g. 3 seconds lock review)
    if (session.p1Offer.locked && session.p2Offer.locked) {
      session.status = 'COUNTDOWN';
      session.countdownEndsAt = Date.now() + 3000;
    } else {
      session.status = 'ACTIVE';
      session.countdownEndsAt = null;
    }

    this.emit('trade_updated', session);
    return { success: true, session };
  }

  /**
   * Final confirmation after review.
   */
  confirmTrade(tradeId, username) {
    const session = this.sessions.get(tradeId);
    if (!session || (session.status !== 'COUNTDOWN' && session.status !== 'LOCKED')) {
      return { success: false, error: 'Her iki taraf teklifleri kilitlemeden onaylanamaz.' };
    }

    const isP1 = session.p1.toLowerCase() === username.toLowerCase();
    const isP2 = session.p2.toLowerCase() === username.toLowerCase();
    if (!isP1 && !isP2) return { success: false, error: 'Yetkisiz işlem.' };

    const myOffer = isP1 ? session.p1Offer : session.p2Offer;
    myOffer.confirmed = true;

    // If both confirmed, execute atomic swap
    if (session.p1Offer.confirmed && session.p2Offer.confirmed) {
      return this.executeSwap(tradeId);
    }

    this.emit('trade_updated', session);
    return { success: true, session };
  }

  /**
   * Atomic swap of items and Primogems between p1 and p2.
   */
  executeSwap(tradeId) {
    const session = this.sessions.get(tradeId);
    if (!session || session.status === 'COMPLETED') {
      return { success: false, error: 'Oturum zaten tamamlandı.' };
    }

    if (!this.gachaEngine) {
      return { success: false, error: 'GachaEngine entegrasyonu mevcut değil.' };
    }

    const user1 = this.gachaEngine.getOrCreateUser(session.p1);
    const user2 = this.gachaEngine.getOrCreateUser(session.p2);

    // Deep check items still exist in inventories
    const p1Indices = session.p1Offer.items.map(i => i.index).sort((a, b) => b - a);
    const p2Indices = session.p2Offer.items.map(i => i.index).sort((a, b) => b - a);

    // Verify Primogems
    if (user1.primogems < session.p1Offer.primogems) {
      this.cancelSession(tradeId, `${session.p1} yeterli Primogem'e sahip değil.`);
      return { success: false, error: 'Yetersiz Primogem.' };
    }
    if (user2.primogems < session.p2Offer.primogems) {
      this.cancelSession(tradeId, `${session.p2} yeterli Primogem'e sahip değil.`);
      return { success: false, error: 'Yetersiz Primogem.' };
    }

    // Extract items
    const itemsFromP1 = [];
    for (const idx of p1Indices) {
      if (idx < user1.inventory.length) {
        itemsFromP1.push(user1.inventory[idx]);
      }
    }
    const itemsFromP2 = [];
    for (const idx of p2Indices) {
      if (idx < user2.inventory.length) {
        itemsFromP2.push(user2.inventory[idx]);
      }
    }

    // Remove from P1
    for (const idx of p1Indices) {
      user1.inventory.splice(idx, 1);
    }
    // Remove from P2
    for (const idx of p2Indices) {
      user2.inventory.splice(idx, 1);
    }

    // Give P2's items to P1
    for (const item of itemsFromP2) {
      user1.inventory.push({ ...item, tradedFrom: session.p2, tradedAt: new Date().toISOString() });
    }
    // Give P1's items to P2
    for (const item of itemsFromP1) {
      user2.inventory.push({ ...item, tradedFrom: session.p1, tradedAt: new Date().toISOString() });
    }

    // Transfer Primogems
    user1.primogems = user1.primogems - session.p1Offer.primogems + session.p2Offer.primogems;
    user2.primogems = user2.primogems - session.p2Offer.primogems + session.p1Offer.primogems;

    // Recalculate counts
    user1.fiveStarsCount = user1.inventory.filter(i => i.rarity === 5).length;
    user1.fourStarsCount = user1.inventory.filter(i => i.rarity === 4).length;
    user1.threeStarsCount = user1.inventory.filter(i => i.rarity === 3).length;

    user2.fiveStarsCount = user2.inventory.filter(i => i.rarity === 5).length;
    user2.fourStarsCount = user2.inventory.filter(i => i.rarity === 4).length;
    user2.threeStarsCount = user2.inventory.filter(i => i.rarity === 3).length;

    // Persist
    this.gachaEngine.saveUsers();

    session.status = 'COMPLETED';
    this.userActiveTrades.delete(session.p1.toLowerCase());
    this.userActiveTrades.delete(session.p2.toLowerCase());

    console.log(`[TradeEngine] ✅ Başarılı Takas [${tradeId}]: @${session.p1} (${itemsFromP1.length} eşya, ${session.p1Offer.primogems} 💎) <-> @${session.p2} (${itemsFromP2.length} eşya, ${session.p2Offer.primogems} 💎)`);

    this.emit('trade_completed', {
      session,
      p1Received: { items: itemsFromP2, primogems: session.p2Offer.primogems },
      p2Received: { items: itemsFromP1, primogems: session.p1Offer.primogems }
    });

    return {
      success: true,
      session,
      message: 'Takas başarıyla gerçekleştirildi!'
    };
  }

  /**
   * Cancel an ongoing trade session
   */
  cancelSession(tradeId, reason = 'Kullanıcı takası iptal etti.') {
    const session = this.sessions.get(tradeId);
    if (!session) return { success: false, error: 'Oturum bulunamadı.' };

    session.status = 'CANCELLED';
    session.cancelReason = reason;

    this.userActiveTrades.delete(session.p1.toLowerCase());
    this.userActiveTrades.delete(session.p2.toLowerCase());

    this.emit('trade_cancelled', { session, reason });
    return { success: true, message: reason };
  }

  /**
   * Cleanup any active trade if a player disconnects
   */
  handlePlayerDisconnect(username) {
    if (!username) return;
    const tradeId = this.userActiveTrades.get(username.toLowerCase());
    if (tradeId) {
      this.cancelSession(tradeId, `@${username} oyundan ayrıldığı için takas iptal edildi.`);
    }
  }
}

module.exports = { TradeEngine };
