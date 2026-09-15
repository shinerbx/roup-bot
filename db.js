const { Pool } = require('pg');
const catalogItems = require('./catalog');

const connectionString = 'postgresql://postgres.qozrohmqnmbghemlgohb:roupgrade1509!@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      balance INTEGER DEFAULT 0,
      upgrades_count INTEGER DEFAULT 0,
      is_vip INTEGER DEFAULT 0,
      subscribed_reward_claimed INTEGER DEFAULT 0,
      invited_by BIGINT DEFAULT NULL,
      referrals_count INTEGER DEFAULT 0,
      accepted_tos INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      price_stars INTEGER NOT NULL,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(telegram_id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const item of catalogItems) {
    await pool.query(`
      INSERT INTO items (name, category, price_stars, image_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET
        category = EXCLUDED.category,
        price_stars = EXCLUDED.price_stars,
        image_url = EXCLUDED.image_url
    `, [item.name, item.category, item.price_stars, item.image_url]);
  }
  console.log('✅ База данных Supabase подключена и готова к работе!');
}

initDb().catch(err => console.error('Ошибка инициализации Supabase:', err));

async function registerUser(tgUser, referrerId = null) {
  let res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  let user = res.rows[0];
  let successfulReferrer = null;

  if (!user) {
    if (referrerId && Number(referrerId) !== tgUser.id) {
      const refCheck = await pool.query('SELECT telegram_id FROM users WHERE telegram_id = $1', [referrerId]);
      if (refCheck.rows.length > 0) successfulReferrer = referrerId;
    }

    await pool.query(`
      INSERT INTO users (telegram_id, username, first_name, invited_by, accepted_tos)
      VALUES ($1, $2, $3, $4, 1)
    `, [tgUser.id, tgUser.username || null, tgUser.first_name, successfulReferrer]);

    if (successfulReferrer) {
      await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', [successfulReferrer]);
      await giveRandomStarterItem(successfulReferrer);
    }

    res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    user = res.rows[0];
  }

  return { user, rewardedReferrerId: successfulReferrer };
}

// Используется API веб-приложения: если пользователь открыл Mini App,
// минуя /start (например, по прямой ссылке), всё равно создаём запись.
async function ensureUserExists(tgUser) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  if (res.rows[0]) return res.rows[0];

  await pool.query(`
    INSERT INTO users (telegram_id, username, first_name, accepted_tos)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (telegram_id) DO NOTHING
  `, [tgUser.id, tgUser.username || null, tgUser.first_name || null]);

  const res2 = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  return res2.rows[0];
}

async function giveRandomStarterItem(userId) {
  const itemRes = await pool.query(`
    SELECT * FROM items 
    WHERE price_stars BETWEEN 5 AND 10 
    ORDER BY RANDOM() 
    LIMIT 1
  `);
  const item = itemRes.rows[0];

  if (item) {
    await pool.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, item.id]);
  }
  return item;
}

async function claimSubscriptionItem(userId) {
  const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user || user.subscribed_reward_claimed) return null;

  const item = await giveRandomStarterItem(userId);
  await pool.query('UPDATE users SET subscribed_reward_claimed = 1 WHERE telegram_id = $1', [userId]);
  return item;
}

async function getUserInventoryCount(userId) {
  const res = await pool.query('SELECT count(*) as count FROM user_inventory WHERE user_id = $1', [userId]);
  return parseInt(res.rows[0]?.count || 0, 10);
}

async function getUser(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return res.rows[0];
}

function calculateTier(user) {
  if (user.is_vip) return '👑 VIP';
  if (user.upgrades_count >= 10000) return '🔥 Pro';
  return '🥉 Базовый';
}

// ---------- Функции для API веб-приложения ----------

async function getCatalogItems() {
  const res = await pool.query(
    'SELECT id, name, category, price_stars, image_url FROM items ORDER BY category, price_stars'
  );
  return res.rows;
}

async function getItemById(itemId) {
  const res = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
  return res.rows[0];
}

async function getUserInventory(userId) {
  const res = await pool.query(`
    SELECT ui.id AS inventory_id, ui.created_at,
           i.id, i.name, i.category, i.price_stars, i.image_url
    FROM user_inventory ui
    JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = $1
    ORDER BY ui.created_at DESC
  `, [userId]);
  return res.rows;
}

async function addInventoryItem(userId, itemId) {
  await pool.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, itemId]);
}

// Апгрейд: сейчас без формулы шанса — всегда успешен.
// В одной транзакции убираем предмет-донор из инвентаря пользователя
// (с проверкой, что он и правда ему принадлежит) и добавляем целевой предмет.
async function upgradeItem(userId, inventoryItemId, targetItemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ownedRes = await client.query(
      'SELECT id FROM user_inventory WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [inventoryItemId, userId]
    );
    if (ownedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'item_not_owned' };
    }

    const targetRes = await client.query('SELECT * FROM items WHERE id = $1', [targetItemId]);
    const targetItem = targetRes.rows[0];
    if (!targetItem) {
      await client.query('ROLLBACK');
      return { error: 'target_not_found' };
    }

    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);
    await client.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, targetItemId]);
    await client.query('UPDATE users SET upgrades_count = upgrades_count + 1 WHERE telegram_id = $1', [userId]);

    await client.query('COMMIT');
    return { item: targetItem };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  registerUser,
  getUser,
  calculateTier,
  claimSubscriptionItem,
  getUserInventoryCount,
  ensureUserExists,
  getCatalogItems,
  getItemById,
  getUserInventory,
  addInventoryItem,
  upgradeItem
};
