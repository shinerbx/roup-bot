const express = require('express');
const crypto = require('crypto');
const {
  getCatalogItems, getUserInventory, getUser, calculateTier, getUserInventoryCount,
  ensureUserExists, upgradeItem, sellInventoryItem, sellInventoryItemsBatch,
  buyItemsWithBalance, getReferralProgress, setTutorialCompleted, getUserDemoItemCount,
  createWithdrawRequest, attachAdminMessage, getRecentDrops, getUserWithdrawRequests,
  getFreeRouletteStatus, getFreeRouletteRewards, spinFreeRoulette,
} = require('./db');
const { WITHDRAWAL, USER_LIMITS, UPGRADE, ROULETTE, LIVE_FEED } = require('./house-config');
const FREE_ROULETTE = require('./free-roulette-config');
const { isWhitelisted } = require('./access-control');
const { notifyWithdrawRequest } = require('./admin-notify');

// ═══════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════

function verifyInitData(initData, botToken) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
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

function isWithdrawWhitelisted(userId) {
  return isWhitelisted(userId);
}

// ═══════════════════════════════════════════════════════════════════════
// ONLINE — реальный счётчик (для логов) + симуляция по времени суток
// ═══════════════════════════════════════════════════════════════════════

const onlineMap = new Map();
const ONLINE_WINDOW_MS = (LIVE_FEED.ONLINE_WINDOW_SEC || 300) * 1000;

function touchOnline(userId) {
  onlineMap.set(String(userId), Date.now());
}

function getRealOnline() {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  let count = 0;
  for (const ts of onlineMap.values()) if (ts >= cutoff) count++;
  return count;
}

setInterval(() => {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  let removed = 0;
  for (const [id, ts] of onlineMap.entries()) {
    if (ts < cutoff) { onlineMap.delete(id); removed++; }
  }
  if (removed > 0) console.log(`[online] cleanup removed ${removed}, left ${onlineMap.size}`);
}, 60000).unref?.();

function _cosineInterp(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }

const _ONLINE_ANCHORS = [
  { h: 3,  v: 0.00 },
  { h: 13, v: 1.00 },
  { h: 19, v: 0.50 },
  { h: 23, v: 0.15 },
  { h: 27, v: 0.00 },
];

function _levelAtHour(hour) {
  let h = hour;
  if (h < _ONLINE_ANCHORS[0].h) h += 24;
  for (let i = 0; i < _ONLINE_ANCHORS.length - 1; i++) {
    const a = _ONLINE_ANCHORS[i];
    const b = _ONLINE_ANCHORS[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = (h - a.h) / (b.h - a.h);
      return a.v + (b.v - a.v) * _cosineInterp(t);
    }
  }
  return 0.15;
}

function _rangeFromLevel(level) {
  if (level <= 0.5) {
    const t = Math.max(0, Math.min(1, level / 0.5));
    return [10 + 30 * t, 25 + 35 * t];
  }
  const t = Math.max(0, Math.min(1, (level - 0.5) / 0.5));
  return [40 + 30 * t, 60 + 30 * t];
}

function getSimulatedOnline() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const level = _levelAtHour(hour);
  const [lo, hi] = _rangeFromLevel(level);
  const mid = (lo + hi) / 2;
  const halfSpan = (hi - lo) / 2;

  const tSec = now.getTime() / 1000;
  const wave =
    Math.sin(tSec / 90) * 0.55 +
    Math.sin(tSec / 300) * 0.30 +
    Math.sin(tSec / 45) * 0.15;

  let value = mid + wave * halfSpan;
  value += (Math.random() - 0.5) * 1.2;
  value = Math.round(value);

  return Math.max(1, Math.min(100, value));
}

// ═══════════════════════════════════════════════════════════════════════
// RATE LIMITER per-user (sliding window)
// ═══════════════════════════════════════════════════════════════════════

const rlBuckets = new Map();
const RL_WINDOW_MS = 10000;
const RL_MAX = 60;

function rateLimit(userId, max = RL_MAX) {
  const now = Date.now();
  let b = rlBuckets.get(String(userId));
  if (!b || now - b.start > RL_WINDOW_MS) {
    b = { start: now, count: 0 };
    rlBuckets.set(String(userId), b);
  }
  b.count++;
  return b.count <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, b] of rlBuckets.entries()) {
    if (now - b.start > RL_WINDOW_MS * 2) rlBuckets.delete(id);
  }
}, 30000).unref?.();

// ═══════════════════════════════════════════════════════════════════════
// UPGRADE LOCK — per-user, защита от дабл-тапов и параллельных запросов
// ═══════════════════════════════════════════════════════════════════════

const upgradeLocks = new Set();
const lastUpgradeAt = new Map();

function upgradeLockMiddleware(req, res, next) {
  const userId = req.tgUser?.id;
  if (!userId) return next();

  const now = Date.now();
  const minInterval = Number(UPGRADE.MIN_INTERVAL_MS) || 800;
  const last = lastUpgradeAt.get(userId) || 0;

  if (upgradeLocks.has(userId)) {
    return res.status(429).json({ error: 'upgrade_in_progress' });
  }
  if (now - last < minInterval) {
    return res.status(429).json({ error: 'too_fast' });
  }

  upgradeLocks.add(userId);
  lastUpgradeAt.set(userId, now);

  const release = () => upgradeLocks.delete(userId);
  res.on('finish', release);
  res.on('close', release);

  next();
}

setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [id, ts] of lastUpgradeAt.entries()) {
    if (ts < cutoff) lastUpgradeAt.delete(id);
  }
}, 60000).unref?.();

// ═══════════════════════════════════════════════════════════════════════
// FAKE DROPS — генератор имён + пул без повторов, перегенерация раз в минуту
// ═══════════════════════════════════════════════════════════════════════

const FAKE_FIRST_NAMES = [
  'Артём', 'Кирилл', 'Данил', 'Влад', 'София', 'Максим',
  'Никита', 'Егор', 'Тимур', 'Константин', 'Илья', 'Роман',
  'Денис', 'Вячеслав', 'Иван', 'Алексей', 'Матвей', 'Марк',
  'Арсений', 'Миша', 'Стёпа', 'Лев', 'Глеб', 'Саша',
  'Ваня', 'Гоша', 'Слава', 'Толя', 'Женя', 'Мирон',
];

const FAKE_LAST_NAMES = [
  'Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Соколов', 'Попов',
  'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Волков', 'Соловьёв',
  'Васильев', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов',
  'Богданов', 'Воробьёв', 'Фёдоров', 'Михайлов', 'Беляев', 'Тарасов',
  'Белов', 'Комаров', 'Орлов', 'Киселёв',
];

const FAKE_NICK_A = [
  'Shadow', 'Dark', 'Iron', 'Neo', 'Cyber', 'Ghost', 'Storm', 'Frost',
  'Void', 'Wolf', 'Blood', 'Swift', 'Silent', 'Mad', 'Wild', 'Night',
  'Dead', 'Red', 'Black', 'Silver', 'Golden', 'Turbo', 'Killer', 'Fatal',
  'Savage', 'Prime', 'Alpha', 'Zero', 'Nova', 'Lucky', 'Crazy', 'Epic', 'Mega',
];

const FAKE_NICK_B = [
  'Fiend', 'Wolf', 'Blade', 'King', 'Lord', 'Sniper', 'Knight', 'Hunter',
  'Reaper', 'Phantom', 'Strike', 'Fury', 'Storm', 'Soul', 'Beast', 'Dragon',
  'Tiger', 'Falcon', 'Ninja', 'Master', 'Boss', 'Chief', 'Slayer', 'Mage',
  'Rogue', 'Rider', 'Warden', 'Ghost', 'Bolt', 'Pulse',
];

const FAKE_LATIN_NAMES = [
  'Alex', 'Max', 'Mike', 'Nick', 'Dan', 'Vlad', 'Sam', 'Chris',
  'John', 'Mark', 'Paul', 'Eric', 'Adam', 'Ron', 'Tim', 'Tom',
  'Leo', 'Ray', 'Jay', 'Kai', 'Nate', 'Ryan', 'Cody', 'Josh',
];

const FAKE_POOL_SIZE = 200;
let fakePool = [];
let fakePoolBuiltAt = 0;
let fakePoolCatalogVersion = '';

function _pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function generateDisplayName() {
  const roll = Math.random();

  if (roll < 0.28) {
    return `${_pick(FAKE_FIRST_NAMES)}_${_pick(FAKE_LAST_NAMES)}`;
  }
  if (roll < 0.42) {
    const fn = _pick(FAKE_FIRST_NAMES);
    const ln = _pick(FAKE_LAST_NAMES);
    return `${fn}_${ln[0].toUpperCase()}`;
  }
  if (roll < 0.56) {
    const nick = _pick(FAKE_NICK_A) + _pick(FAKE_NICK_B);
    const c = Math.random();
    if (c < 0.12) return nick.toUpperCase();
    if (c < 0.24) return nick.toLowerCase();
    return nick;
  }
  if (roll < 0.72) {
    const fn = _pick(FAKE_FIRST_NAMES);
    const n = Math.floor(Math.random() < 0.4 ? 10 + Math.random() * 89 : 100 + Math.random() * 9899);
    return `${fn}${n}`;
  }
  if (roll < 0.86) {
    return `${_pick(FAKE_FIRST_NAMES)}_${_pick(FAKE_NICK_A)}`;
  }
  const ln = _pick(FAKE_LATIN_NAMES);
  const n = Math.floor(Math.random() * 999);
  return `${ln}${n}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rebuildFakePool(catalog) {
  if (!catalog.length) return [];
  const items = shuffle(catalog);
  const out = [];
  const now = Date.now();
  const usedNames = new Set();

  for (let i = 0; i < FAKE_POOL_SIZE; i++) {
    const item = items[i % items.length];
    let name;
    let guard = 0;
    do {
      name = generateDisplayName();
      guard++;
    } while (usedNames.has(name) && guard < 8);
    usedNames.add(name);

    out.push({
      id: `fake_${now}_${i}`,
      userId: `fake_u_${now}_${i}`,
      userName: name,
      itemName: item.name,
      itemImageUrl: item.image_url,
      priceStars: Number(item.price_stars) || 0,
      chance: Number((Math.random() * 40 + 3).toFixed(1)),
      isFake: true,
      ts: 0,
    });
  }
  return out;
}

function getFakeSamples(catalog, count) {
  const catVersion = `${catalog.length}_${catalog[0]?.id || 0}_${catalog[catalog.length - 1]?.id || 0}`;
  const now = Date.now();
  if (fakePool.length === 0 || now - fakePoolBuiltAt > 60000 || catVersion !== fakePoolCatalogVersion) {
    fakePool = rebuildFakePool(catalog);
    fakePoolBuiltAt = now;
    fakePoolCatalogVersion = catVersion;
  }

  const out = [];
  const start = Math.floor(Math.random() * fakePool.length);
  for (let i = 0; i < count; i++) {
    const src = fakePool[(start + i) % fakePool.length];
    out.push({
      ...src,
      id: `${src.id}_${Math.random().toString(36).slice(2, 6)}`,
      ts: now - Math.floor(Math.random() * 60000),
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// FEED CACHE
// ═══════════════════════════════════════════════════════════════════════

let feedCache = { data: null, etag: '', expiresAt: 0 };

function etagOf(str) {
  return '"' + crypto.createHash('sha1').update(str).digest('hex').slice(0, 16) + '"';
}

// ═══════════════════════════════════════════════════════════════════════

function createWebappRouter(bot, botToken) {
  const router = express.Router();

  router.use(async (req, res, next) => {
    const initData = req.header('X-Telegram-Init-Data') || req.header('x-telegram-init-data') || '';
    const tgUser = verifyInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'invalid_init_data' });

    req.tgUser = tgUser;
    touchOnline(tgUser.id);

    if (!rateLimit(tgUser.id)) {
      return res.status(429).json({ error: 'rate_limited' });
    }

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

      const whitelisted = isWithdrawWhitelisted(req.tgUser.id);

      const demoItemCount = await getUserDemoItemCount(req.tgUser.id);
      const demoActive = user.pre_demo_balance != null || Number(user.lucky_mode) > 0 || demoItemCount > 0;
      const canWithdraw = (whitelisted || referralProgress.canWithdraw) && !demoActive;

      res.json({
        telegram_id: String(user.telegram_id),
        first_name: user.first_name || '',
        username: user.username || '',
        tier: calculateTier(user),
        upgrades_count: user.upgrades_count || 0,
        referrals_count: user.referrals_count || 0,
        free_roulette_spins: Number(user.free_roulette_spins) || 0,
        referral_progress: referralProgress,
        can_withdraw: canWithdraw,
        is_whitelisted: whitelisted,
        demo_active: demoActive,
        demo_items_count: demoItemCount,
        balance: user.balance || 0,
        items_count: itemsCount || 0,
        tutorial_completed: Boolean(user.tutorial_completed),
        created_at: user.created_at,
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


  router.post('/support/create-invoice', async (req, res) => {
    try {
      const amount = Math.floor(Number(req.body.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return res.status(400).json({ error: 'invalid_amount' });

      const payload = `support_${req.tgUser.id}_${Date.now()}`;
      const invoiceLink = await bot.telegram.createInvoiceLink({
        title: 'Поддержка проекта RoUP',
        description: 'Добровольная поддержка проекта. Игровой баланс за эту операцию не начисляется.',
        payload, provider_token: '', currency: 'XTR',
        prices: [{ label: `${amount} Telegram Stars`, amount }],
      });
      res.json({ invoiceLink });
    } catch (err) {
      const detail = err.response?.description || err.description || err.message;
      console.error('❌ Ошибка /api/support/create-invoice:', detail);
      res.status(500).json({ error: 'server_error', detail });
    }
  });

  router.get('/upgrade/config', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      displayGamma: UPGRADE.DISPLAY_GAMMA,
      displayBaseChanceMultiplier: UPGRADE.DISPLAY_BASE_CHANCE_MULTIPLIER,
      displayHouseEdge: UPGRADE.DISPLAY_HOUSE_EDGE,
      minChance: UPGRADE.MIN_CHANCE,
      maxChance: UPGRADE.MAX_CHANCE,
      minMultiplier: UPGRADE.MIN_MULTIPLIER,
      maxMultiplier: UPGRADE.MAX_MULTIPLIER,
      spinProfiles: ROULETTE.SPIN_PROFILES,
      spinJitter: ROULETTE.SPIN_JITTER,
      nearMiss: ROULETTE.NEAR_MISS,
    });
  });

  router.get('/upgrade/feed', async (req, res) => {
    try {
      const now = Date.now();
      if (!feedCache.data || now > feedCache.expiresAt) {
        const catalog = await getCatalogItems();
        const real = getRecentDrops(30);

        const [minFake, maxFake] = LIVE_FEED.FAKE_PER_REQUEST || [4, 7];
        const fakeCount = minFake + Math.floor(Math.random() * (maxFake - minFake + 1));
        const fake = getFakeSamples(catalog, fakeCount);

        const mixed = [
          ...real.map((d) => ({ ...d, isFake: false })),
          ...fake,
        ].sort((a, b) => (b.ts || 0) - (a.ts || 0));

        const unique = [];
        let lastKey = null;
        for (const d of mixed) {
          const key = d.userId || d.id;
          if (key === lastKey) continue;
          unique.push({
            ...d,
            userName: String(d.userName || 'игрок').replace(/^@+/, ''),
          });
          lastKey = key;
          if (unique.length >= 30) break;
        }

        const body = JSON.stringify({ drops: unique });
        feedCache = { data: body, etag: etagOf(body), expiresAt: now + 1000 };
      }

      if (req.header('If-None-Match') === feedCache.etag) {
        res.status(304).end();
        return;
      }
      res.set('ETag', feedCache.etag);
      res.set('Cache-Control', 'private, max-age=2');
      res.type('application/json').send(feedCache.data);
    } catch (err) {
      console.error('Ошибка /api/upgrade/feed:', err.message);
      res.status(500).json({ drops: [], error: 'server_error' });
    }
  });

  router.get('/online', (_req, res) => {
    const online = getSimulatedOnline();
    res.set('Cache-Control', 'public, max-age=10');
    res.json({ online });
  });

  router.post('/upgrade', upgradeLockMiddleware, async (req, res) => {
    try {
      const inventoryItemId = Number(req.body?.inventoryItemId);
      const targetItemId = Number(req.body?.targetItemId);
      const multiplier = Number(req.body?.multiplier ?? 1);
      const operationId = String(req.body?.operationId || '');

      if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0 ||
          !Number.isInteger(targetItemId) || targetItemId <= 0) {
        return res.status(400).json({ error: 'missing_fields' });
      }
      if (!Number.isFinite(multiplier) || Math.abs(multiplier * 10 - Math.round(multiplier * 10)) >= 1e-9
          || multiplier < 1 || multiplier > 100) {
        return res.status(400).json({ error: 'invalid_multiplier' });
      }
      if (!operationId || operationId.length > 100) {
        return res.status(400).json({ error: 'missing_operation_id' });
      }

      const result = await upgradeItem(req.tgUser.id, inventoryItemId, targetItemId, multiplier, operationId);
      if (result.error) {
        const status = result.error === 'same_price_target' ? 409 : 400;
        return res.status(status).json({ error: result.error });
      }

      res.json({
        success: result.success,
        item: result.item,
        chance: result.chance,
        expectedChance: result.expectedChance,
        multiplier: result.multiplier,
        landingAngle: result.landingAngle,
        dailyWelcomeRemaining: result.dailyWelcomeRemaining,
        welcomeJustOpened: result.welcomeJustOpened,
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

  router.post('/sell-many', async (req, res) => {
    try {
      const itemId = Number(req.body?.itemId);
      const quantity = Number(req.body?.quantity);
      const operationId = String(req.body?.operationId || '');

      if (!Number.isInteger(itemId) || itemId <= 0) return res.status(400).json({ error: 'invalid_item' });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return res.status(400).json({ error: 'invalid_quantity' });
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });

      const result = await sellInventoryItemsBatch(req.tgUser.id, itemId, quantity, operationId);
      if (result.error) return res.status(400).json({ error: result.error, available: result.available });
      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/sell-many:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/free-roulette/config', async (req, res) => {
    try {
      const status = await getFreeRouletteStatus(req.tgUser.id);
      const rewards = await getFreeRouletteRewards();
      const botUsername = process.env.BOT_USERNAME || 'roupgrade_bot';
      const referralLink = `https://t.me/${botUsername}?start=ref_${req.tgUser.id}`;
      const shareText = '⚡️ Заходи в RoUP: каталог, апгрейды и бесплатная рулетка. Переходи по ссылке 👇';
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;

      res.set('Cache-Control', 'private, max-age=15');
      res.json({
        rewards,
        spins: status.spins,
        referralsCount: status.referralsCount,
        referralSpinsPerFriend: Number(FREE_ROULETTE.REFERRAL_SPINS_PER_FRIEND) || 1,
        spin: FREE_ROULETTE.SPIN,
        referralLink,
        shareUrl,
      });
    } catch (err) {
      console.error('Ошибка /api/free-roulette/config:', err.message);
      res.status(500).json({ error: 'roulette_unavailable' });
    }
  });

  router.post('/free-roulette/spin', async (req, res) => {
    try {
      const operationId = String(req.body?.operationId || '').trim();
      if (!operationId || operationId.length > 100) {
        return res.status(400).json({ error: 'missing_operation_id' });
      }

      const result = await spinFreeRoulette(req.tgUser.id, operationId);
      if (result.error) {
        const status = result.error === 'no_spins' ? 409 : 400;
        return res.status(status).json(result);
      }

      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/free-roulette/spin:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/withdraw/requests', async (req, res) => {
    try {
      const requests = await getUserWithdrawRequests(req.tgUser.id, 20);
      res.set('Cache-Control', 'private, max-age=10');
      res.json({ requests });
    } catch (err) {
      console.error('Ошибка /api/withdraw/requests:', err.message);
      res.status(500).json({ error: 'server_error' });
    }
  });

  router.get('/withdraw/methods', (_req, res) => {
    const methods = Object.entries(WITHDRAWAL.METHODS)
      .filter(([, cfg]) => cfg.enabled)
      .map(([key, cfg]) => ({ key, label: cfg.label, icon: cfg.icon, hint: cfg.hint }));
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      methods,
      rate: WITHDRAWAL.STARS_TO_ROBUX_RATE,
      commission: WITHDRAWAL.COMMISSION_PERCENT,
      gamePassMarkup: WITHDRAWAL.GAME_PASS_MARKUP_PERCENT,
      min: WITHDRAWAL.MIN_STARS,
      max: WITHDRAWAL.MAX_STARS,
    });
  });

  router.post('/withdraw/request', async (req, res) => {
    try {
      const method = String(req.body?.method || '').trim();
      const amountStars = Math.floor(Number(req.body?.amountStars));
      const robloxUsername = String(req.body?.robloxUsername || '').trim();
      const operationId = String(req.body?.operationId || '').trim();

      if (!WITHDRAWAL.METHODS[method]?.enabled) return res.status(400).json({ error: 'method_not_available' });
      if (!Number.isFinite(amountStars) || amountStars < WITHDRAWAL.MIN_STARS) {
        return res.status(400).json({ error: 'amount_below_min', min: WITHDRAWAL.MIN_STARS });
      }
      if (amountStars > WITHDRAWAL.MAX_STARS) {
        return res.status(400).json({ error: 'amount_above_max', max: WITHDRAWAL.MAX_STARS });
      }

      if (!/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername) || robloxUsername.startsWith('_') || robloxUsername.endsWith('_') || (robloxUsername.match(/_/g) || []).length > 1) {
        return res.status(400).json({ error: 'invalid_username' });
      }
      if (!operationId || operationId.length > 100) return res.status(400).json({ error: 'missing_operation_id' });

      const u = req.dbUser;
      if (u && (u.pre_demo_balance != null || Number(u.lucky_mode) > 0)) {
        return res.status(403).json({ error: 'demo_active' });
      }

      const whitelisted = isWithdrawWhitelisted(req.tgUser.id);

      if (!whitelisted && USER_LIMITS.REQUIRE_REFERRAL_FOR_WITHDRAW) {
        const progress = await getReferralProgress(req.tgUser.id);
        if (!progress.canWithdraw) {
          return res.status(403).json({ error: 'referral_gate', progress });
        }
      }

      const telegramUsername = req.tgUser.username || req.dbUser?.username || '';
      const contactUsername = telegramUsername ? `@${String(telegramUsername).replace(/^@+/, '')}` : 'не указан';

      const result = await createWithdrawRequest(req.tgUser.id, {
        method, amountStars, contactUsername, robloxUsername, operationId,
      });

      if (result.error) {
        const status = result.error === 'insufficient_balance' ? 402 : 400;
        return res.status(status).json({ error: result.error });
      }

      const adminMsgId = await notifyWithdrawRequest({
        requestId: result.requestId,
        userId: req.tgUser.id,
        telegramUsername: telegramUsername || null,
        robloxUsername: result.robloxUsername,
        amountStars: result.amountStars,
        payoutRobux: result.payoutRobux,
        gamePassPrice: result.gamePassPrice,
        createdAt: result.createdAt,
      });
      if (adminMsgId) {
        try {
          await attachAdminMessage(result.requestId, adminMsgId);
        } catch (attachErr) {
          console.error('Не удалось сохранить admin_message_id:', {
            requestId: result.requestId,
            message: attachErr?.message,
            code: attachErr?.code,
          });
        }
      }

      res.json(result);
    } catch (err) {
      console.error('Ошибка /api/withdraw/request:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        column: err?.column,
        stack: err?.stack,
      });
      res.status(500).json({
        error: 'server_error',
        retryable: true,
        detail: process.env.NODE_ENV === 'production' ? undefined : (err?.message || null),
      });
    }
  });

  return router;
}

module.exports = { createWebappRouter, verifyInitData };
