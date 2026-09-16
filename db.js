const { Pool } = require('pg');
const catalogItems = require('./catalog');
const { resolveUpgrade } = require('./upgrade-logic');

// ВАЖНО: строка подключения берётся только из переменной окружения.
// На Render добавьте переменную DATABASE_URL со значением вида:
// postgresql://postgres.<project>:<ПАРОЛЬ>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
// Спецсимволы в пароле нужно URL-кодировать (@ -> %40, # -> %23, $ -> %24, ! -> %21).
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Не задана переменная окружения DATABASE_URL — база не подключится.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on('error', (err) => {
  console.error('Непредвиденный сброс сокета PostgreSQL pooler:', err.message);
});

async function initDb() {
  try {
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

    // Загружаем предметы одним запросом, чтобы не спамить в пул базы
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
    console.log('✅ База данных Supabase подключена и синхронизирована!');
  } catch (err) {
    console.error('Ошибка инициализации таблиц Supabase:', err.message);
  }
}

initDb();

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
      ON CONFLICT (telegram_id) DO NOTHING
    `, [tgUser.id, tgUser.username || null, tgUser.first_name || '', successfulReferrer]);

    if (successfulReferrer) {
      await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', [successfulReferrer]);
      await giveRandomStarterItem(successfulReferrer);
    }

    res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    user = res.rows[0];
  }

  return { user, rewardedReferrerId: successfulReferrer };
}

async function ensureUserExists(tgUser) {
  let res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  if (res.rows[0]) return res.rows[0];

  await pool.query(`
    INSERT INTO users (telegram_id, username, first_name, accepted_tos)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name
  `, [tgUser.id, tgUser.username || null, tgUser.first_name || null]);

  res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  return res.rows[0];
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
  if (!user) return '🥉 Базовый';
  if (user.is_vip) return '👑 VIP';
  if (user.upgrades_count >= 10000) return '🔥 Pro';
  return '🥉 Базовый';
}

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

// Покупка предмета из каталога за внутренний баланс (не за живые Stars).
// Баланс списывается и предмет начисляется в одной транзакции;
// строка пользователя блокируется, чтобы нельзя было купить дважды
// на грани баланса параллельными запросами.
async function buyItemWithBalance(userId, itemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query('SELECT balance FROM users WHERE telegram_id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { error: 'user_not_found' };
    }

    const itemRes = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const item = itemRes.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return { error: 'item_not_found' };
    }

    if (user.balance < item.price_stars) {
      await client.query('ROLLBACK');
      return { error: 'insufficient_balance' };
    }

    const balRes = await client.query(
      'UPDATE users SET balance = balance - $1 WHERE telegram_id = $2 RETURNING balance',
      [item.price_stars, userId]
    );
    await client.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, item.id]);

    await client.query('COMMIT');
    return { item, balance: balRes.rows[0].balance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Начисление баланса после успешной оплаты Telegram Stars (пополнение).
async function addBalance(userId, amount) {
  const res = await pool.query(
    'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance',
    [amount, userId]
  );
  return res.rows[0]?.balance ?? null;
}

async function upgradeItem(userId, inventoryItemId, targetItemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Блокируем строку инвентаря, чтобы два параллельных запроса
    // не смогли использовать один и тот же предмет дважды.
    const ownedRes = await client.query(`
      SELECT ui.id, i.id AS item_id, i.name, i.price_stars
      FROM user_inventory ui
      JOIN items i ON i.id = ui.item_id
      WHERE ui.id = $1 AND ui.user_id = $2
      FOR UPDATE OF ui
    `, [inventoryItemId, userId]);

    const sourceItem = ownedRes.rows[0];
    if (!sourceItem) {
      await client.query('ROLLBACK');
      return { error: 'item_not_owned' };
    }

    const targetRes = await client.query('SELECT * FROM items WHERE id = $1', [targetItemId]);
    const targetItem = targetRes.rows[0];
    if (!targetItem) {
      await client.query('ROLLBACK');
      return { error: 'target_not_found' };
    }

    // Решение принимает отдельный модуль upgrade-logic.js
    const decision = resolveUpgrade(
      { id: sourceItem.item_id, name: sourceItem.name, price_stars: sourceItem.price_stars },
      targetItem
    );

    // Предмет-донор в любом случае уходит из инвентаря
    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);
    await client.query('UPDATE users SET upgrades_count = upgrades_count + 1 WHERE telegram_id = $1', [userId]);

    if (!decision.success) {
      await client.query('COMMIT');
      return { success: false, item: null };
    }

    const resultRes = await client.query('SELECT * FROM items WHERE id = $1', [decision.resultItemId]);
    const resultItem = resultRes.rows[0];
    if (!resultItem) {
      await client.query('ROLLBACK');
      return { error: 'result_not_found' };
    }

    await client.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, resultItem.id]);

    await client.query('COMMIT');
    return { success: true, item: resultItem };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Продажа предмета: удаляет его из инвентаря и начисляет его цену
// на внутренний баланс пользователя. Всё в одной транзакции,
// строка инвентаря блокируется, чтобы предмет нельзя было продать дважды.
async function sellInventoryItem(userId, inventoryItemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ownedRes = await client.query(`
      SELECT ui.id, i.name, i.price_stars
      FROM user_inventory ui
      JOIN items i ON i.id = ui.item_id
      WHERE ui.id = $1 AND ui.user_id = $2
      FOR UPDATE OF ui
    `, [inventoryItemId, userId]);

    const row = ownedRes.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { error: 'item_not_owned' };
    }

    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);

    const balRes = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance',
      [row.price_stars, userId]
    );

    await client.query('COMMIT');
    return {
      soldName: row.name,
      earned: row.price_stars,
      balance: balRes.rows[0]?.balance ?? 0
    };
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
  buyItemWithBalance,
  addBalance,
  upgradeItem,
  sellInventoryItem
};