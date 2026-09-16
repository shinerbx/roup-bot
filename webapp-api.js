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
  buyItemWithBalance
} = require('./db');

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

    if (computedHash !== hash) return null;

    // Отклоняем слишком старые initData
    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

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

    if (!tgUser) {
      return res.status(401).json({ error: 'invalid_init_data' });
    }

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
      res.json({
        telegram_id: String(user.telegram_id),
        first_name: user.first_name || '',
        username: user.username || '',
        tier: calculateTier(user),
        upgrades_count: user.upgrades_count || 0,
        referrals_count: user.referrals_count || 0,
        balance: user.balance || 0,
        items_count: itemsCount || 0,
        created_at: user.created_at
      });
    } catch (err) {
      console.error('Ошибка /api/profile:', err.message);
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

  // Покупка предмета из каталога за внутренний баланс (⭐, а не за живые Stars)
  router.post('/buy', async (req, res) => {
    try {
      const itemId = Number(req.body.itemId);
      if (!itemId) return res.status(400).json({ error: 'missing_fields' });

      const result = await buyItemWithBalance(req.tgUser.id, itemId);
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

  // Пополнение баланса настоящими Telegram Stars: 1 ⭐ Stars = 1 ⭐ баланса.
  // Создаёт ссылку на счёт; сами звёзды начисляются в successful_payment (index.js).
  router.post('/topup/create-invoice', async (req, res) => {
    try {
      const amount = Math.floor(Number(req.body.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
        return res.status(400).json({ error: 'invalid_amount' });
      }

      const payload = `topup_${req.tgUser.id}_${amount}_${Date.now()}`;

      console.log('🧾 Создаю инвойс:', { userId: req.tgUser.id, amount, payload });

      const invoiceLink = await bot.telegram.createInvoiceLink({
        title: `Пополнение на ${amount} ⭐`,
        description: `Пополнение баланса RoUP на ${amount} звёзд`,
        payload,
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: `${amount} ⭐`, amount }]
      });

      console.log('🧾 Инвойс создан:', invoiceLink);
      res.json({ invoiceLink });
    } catch (err) {
      // err.response.description — здесь лежит настоящая причина от Bot API
      // (например "Bad Request: currency_total_amount_invalid").
      const detail = err.response?.description || err.description || err.message;
      console.error('❌ Ошибка /api/topup/create-invoice:', detail, err);
      res.status(500).json({ error: 'server_error', detail });
    }
  });

  router.post('/upgrade', async (req, res) => {
    try {
      const inventoryItemId = Number(req.body.inventoryItemId);
      const targetItemId = Number(req.body.targetItemId);

      if (!inventoryItemId || !targetItemId) {
        return res.status(400).json({ error: 'missing_fields' });
      }

      const result = await upgradeItem(req.tgUser.id, inventoryItemId, targetItemId);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: result.success, item: result.item });
    } catch (err) {
      console.error('Ошибка /api/upgrade:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Продажа предмета из инвентаря — начисляет его цену на внутренний баланс
  router.post('/sell', async (req, res) => {
    try {
      const inventoryItemId = Number(req.body.inventoryItemId);
      if (!inventoryItemId) {
        return res.status(400).json({ error: 'missing_fields' });
      }

      const result = await sellInventoryItem(req.tgUser.id, inventoryItemId);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/sell:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

module.exports = { createWebappRouter, verifyInitData };
