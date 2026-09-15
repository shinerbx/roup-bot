const express = require('express');
const crypto = require('crypto');
const {
  getCatalogItems,
  getUserInventory,
  getUser,
  calculateTier,
  getUserInventoryCount,
  getItemById,
  ensureUserExists
} = require('./db');

// Проверка подписи initData от Telegram WebApp.
// Алгоритм из офиц. доков: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyInitData(initData, botToken) {
  if (!initData) return null;

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

  // Отклоняем слишком старые initData (на случай перехвата/повторного использования)
  const authDate = Number(params.get('auth_date') || 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (!authDate || ageSeconds > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function createWebappRouter(bot, botToken) {
  const router = express.Router();

  // Все роуты ниже требуют валидный initData
  router.use(async (req, res, next) => {
    const initData = req.header('X-Telegram-Init-Data') || '';
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
      res.json({ items });
    } catch (err) {
      console.error('Ошибка /api/catalog:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/profile', async (req, res) => {
    try {
      const user = await getUser(req.tgUser.id);
      const itemsCount = await getUserInventoryCount(req.tgUser.id);
      res.json({
        telegram_id: String(user.telegram_id),
        first_name: user.first_name,
        username: user.username,
        tier: calculateTier(user),
        upgrades_count: user.upgrades_count,
        referrals_count: user.referrals_count,
        balance: user.balance,
        items_count: itemsCount,
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
      res.json({ items });
    } catch (err) {
      console.error('Ошибка /api/inventory:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Создаёт ссылку на счёт для прямой покупки предмета за Telegram Stars.
  // Никакой рандомизации/шансов здесь нет — фиксированная цена, фиксированный предмет.
  router.post('/create-invoice', async (req, res) => {
    try {
      const itemId = Number(req.body.itemId);
      const item = await getItemById(itemId);
      if (!item) return res.status(404).json({ error: 'item_not_found' });

      const payload = `buy_${req.tgUser.id}_${item.id}_${Date.now()}`;

      const invoiceLink = await bot.telegram.createInvoiceLink(
        item.name,
        `Покупка предмета «${item.name}» в RoUP`,
        payload,
        '', // provider_token: пустая строка для платежей в Telegram Stars
        'XTR',
        [{ label: item.name, amount: item.price_stars }]
      );

      res.json({ invoiceLink });
    } catch (err) {
      console.error('Ошибка /api/create-invoice:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

module.exports = { createWebappRouter, verifyInitData };
