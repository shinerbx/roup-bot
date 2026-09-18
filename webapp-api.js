// webapp-api.js
const express = require('express');
const crypto = require('crypto');
const {
  getCatalogItems,
  getUserInventory,
  getUser,
  calculateTier,
  getUserInventoryCount,
  ensureUserExists,
  upgradeItem,
  sellInventoryItem,
  buyItemsWithBalance,
  getReferralProgress,
  setTutorialCompleted,
  grantDemoCredits,
  createWithdrawRequest,
  attachAdminMessage,
} = require('./db');
const { WITHDRAWAL, USER_LIMITS } = require('./house-config');
const { notifyWithdrawRequest } = require('./admin-notify');

function verifyInitData(initData, botToken) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) {
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const expected = Buffer.from(computedHash, 'utf8');
    const received = Buffer.from(hash, 'utf8');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

    const authDate = Number(params.get('auth_date') || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!authDate || authDate > now + 300 || now - authDate > 86400) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch (err) {
    console.error('Ошибка парсинга initData:', err.message);
    return null;
  }
}

function createWebappRouter(bot, botToken) {
  const router = express.Router();

  router.use(async (req, res, next) => {
    const initData = req.header('X-Telegram-Init-Data') || req.header('x-telegram-init-data') || '';
    const tgUser = verifyInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'invalid_init_data' });

    req.tgUser = tgUser;
    try {
      req.dbUser = await ensureUserExists(tgUser);
      next();
    } catch (err) {
      console.error('Ошибка ensureUserExists:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/catalog', async (req, res) => {
    try {
      const items = await getCatalogItems();
      res.json({ items: items || [] });
    } catch (err) {
      console.error('Ошибка /api/catalog:', err.message);
      res.status(500).json({ items: [], error: 'db_error' });
    }
  });

  router.get('/profile', async (req, res) => {
    try {
      const user = await getUser(req.tgUser.id) || req.dbUser;
      const itemsCount = await getUserInventoryCount(req.tgUser.id);
      const referralProgress = await getReferralProgress(req.tgUser.id);
      res.json({
        telegram_id: String(user.telegram_id),
        first_name: user.first_name || '',
        username: user.username || '',
        tier: calculateTier(user),
        upgrades_count: user.upgrades_count || 0,
        referrals_count: user.referrals_count || 0,
        referral_progress: referralProgress,
        can_withdraw: referralProgress.canWithdraw,
        balance: user.balance || 0,
        items_count: itemsCount || 0,
        tutorial_completed: Boolean(user.tutorial_completed),
        created_at: user.created_at
      });
    } catch (err) {
      console.error('Ошибка /api/profile:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/tutorial/complete', async (req, res) => {
    try {
      const completed = await setTutorialCompleted(req.tgUser.id);
      res.json({ tutorial_completed: completed });
    } catch (err) {
      console.error('Ошибка /api/tutorial/complete:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/inventory', async (req, res) => {
    try {
      const items = await getUserInventory(req.tgUser.id);
      res.json({ items: items || [] });
    } catch (err) {
      console.error('Ошибка /api/inventory:', err.message);
      res.status(500).json({ items: [], error: 'db_error' });
    }
  });

  router.post('/buy', async (req, res) => {
    try {
      const itemId = Number(req.body?.itemId);
      const quantity = Number(req.body?.quantity ?? 1);
      const operationId = String(req.body?.operationId || '');
      if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ error: 'invalid_item' });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ error: 'invalid_quantity' });
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });

      const result = await buyItemsWithBalance(req.tgUser.id, itemId, quantity, operationId);
      if (result.error) {
        const status = result.error === 'insufficient_balance' ? 402 : 400;
        return res.status(status).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/buy:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/demo/topup', async (req, res) => {
    try {
      const amount = Math.floor(Number(req.body?.amount ?? 1000));
      const operationId = String(req.body?.operationId || '');
      if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return res.status(400).json({ error: 'invalid_amount' });
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });
      const result = await grantDemoCredits(req.tgUser.id, amount, operationId);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/demo/topup:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/support/create-invoice', async (req, res) => {
    try {
      const amount = Math.floor(Number(req.body.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return res.status(400).json({ error: 'invalid_amount' });

      const payload = `support_${req.tgUser.id}_${Date.now()}`;
      const invoiceLink = await bot.telegram.createInvoiceLink({
        title: 'Поддержка проекта RoUP',
        description: 'Добровольная поддержка проекта. Игровой баланс за эту операцию не начисляется.',
        payload,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: `${amount} Telegram Stars`, amount }]
      });
      res.json({ invoiceLink });
    } catch (err) {
      const detail = err.response?.description || err.description || err.message;
      console.error('❌ Ошибка /api/support/create-invoice:', detail);
      res.status(500).json({ error: 'server_error', detail });
    }
  });

  router.post('/upgrade', async (req, res) => {
    try {
      const inventoryItemId = Number(req.body?.inventoryItemId);
      const targetItemId = Number(req.body?.targetItemId);
      const multiplier = Number(req.body?.multiplier ?? 1);
      const operationId = String(req.body?.operationId || '');

      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0 ||
          !Number.isInteger(targetItemId) || targetItemId <= 0) {
        return res.status(400).json({ error: 'missing_fields' });
      }
      if (!Number.isFinite(multiplier) || Math.abs(multiplier * 10 - Math.round(multiplier * 10)) >= 1e-9 || multiplier < 1 || multiplier > 100) {
        return res.status(400).json({ error: 'invalid_multiplier' });
      }
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });

      const result = await upgradeItem(req.tgUser.id, inventoryItemId, targetItemId, multiplier, operationId);
      if (result.error) {
        const status = result.error === 'same_price_target' ? 409 : 400;
        return res.status(status).json({ error: result.error });
      }

      res.json({
        success: result.success,
        item: result.item,
        chance: result.chance,
        baseChance: result.baseChance,
        roll: result.roll,
        multiplier: result.multiplier
      });
    } catch (err) {
      console.error('Ошибка /api/upgrade:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/sell', async (req, res) => {
    try {
      const inventoryItemId = Number(req.body.inventoryItemId);
      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0) return res.status(400).json({ error: 'missing_fields' });
      const operationId = String(req.body?.operationId || '');
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });

      const result = await sellInventoryItem(req.tgUser.id, inventoryItemId, operationId);
      if (result.error) return res.status(400).json({ error: result.error });
      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/sell:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ── ВЫВОД ────────────────────────────────────────────────────────────

  // Список доступных методов (для UI)
  router.get('/withdraw/methods', (_req, res) => {
    const methods = Object.entries(WITHDRAWAL.METHODS)
      .filter(([, cfg]) => cfg.enabled)
      .map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, hint: cfg.hint }));
    res.json({
      methods,
      rate: WITHDRAWAL.STAR_TO_RUB,
      commission: WITHDRAWAL.COMMISSION_PERCENT,
      min: WITHDRAWAL.MIN_STARS,
      max: WITHDRAWAL.MAX_STARS,
    });
  });

  // Создание заявки
  router.post('/withdraw/request', async (req, res) => {
    try {
      const method = String(req.body?.method || '').trim();
      const amountStars = Math.floor(Number(req.body?.amountStars));
      const rawUsername = String(req.body?.contactUsername || '').trim();
      const operationId = String(req.body?.operationId || '').trim();

      if (!WITHDRAWAL.METHODS[method]?.enabled) {
        return res.status(400).json({ error: 'method_not_available' });
      }
      if (!Number.isFinite(amountStars) || amountStars < WITHDRAWAL.MIN_STARS) {
        return res.status(400).json({ error: 'amount_below_min', min: WITHDRAWAL.MIN_STARS });
      }
      if (amountStars > WITHDRAWAL.MAX_STARS) {
        return res.status(400).json({ error: 'amount_above_max', max: WITHDRAWAL.MAX_STARS });
      }

      let username = rawUsername.startsWith('@') ? rawUsername : `@${rawUsername}`;
      if (!/^@[A-Za-z0-9_]{4,32}$/.test(username)) {
        return res.status(400).json({ error: 'invalid_username' });
      }
      if (!operationId || operationId.length > 100) {
        return res.status(400).json({ error: 'missing_operation_id' });
      }

      // Реферальный гейт — перепроверяем на сервере
      if (USER_LIMITS.REQUIRE_REFERRAL_FOR_WITHDRAW) {
        const progress = await getReferralProgress(req.tgUser.id);
        if (!progress.canWithdraw) {
          return res.status(403).json({ error: 'referral_gate', progress });
        }
      }

      const result = await createWithdrawRequest(req.tgUser.id, {
        method, amountStars, contactUsername: username, operationId,
      });

      if (result.error) {
        const status = result.error === 'insufficient_balance' ? 402 : 400;
        return res.status(status).json({ error: result.error });
      }

      // Сервисное сообщение админу
      const adminMsgId = await notifyWithdrawRequest({
        requestId: result.requestId,
        userId: req.tgUser.id,
        contactUsername: username,
        amountStars: result.amountStars,
        amountRub: result.amountRub,
        commissionRub: result.commissionRub,
        payoutRub: result.payoutRub,
      });
      if (adminMsgId) await attachAdminMessage(result.requestId, adminMsgId);

      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/withdraw/request:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

module.exports = { createWebappRouter, verifyInitData };