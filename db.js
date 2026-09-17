const { Pool } = require('pg');
const catalogItems = require('./catalog');
const { resolveUpgrade, MAX_MULTIPLIER } = require('./upgrade-logic');

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
        is_premium INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS operation_results (
        user_id BIGINT NOT NULL REFERENCES users(telegram_id),
        operation_type TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        response JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, operation_type, operation_id)
      );
    `);

    // Совместимо с уже существующей Supabase БД: добавляем только минимальное поле,
    // нужное для условия вывода. Старые данные не удаляются.
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium INTEGER DEFAULT 0');

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
  const isPremium = tgUser.is_premium ? 1 : 0;

  if (!user) {
    if (referrerId && Number(referrerId) !== tgUser.id) {
      const refCheck = await pool.query('SELECT telegram_id FROM users WHERE telegram_id = $1', [referrerId]);
      if (refCheck.rows.length > 0) successfulReferrer = referrerId;
    }

    await pool.query(`
      INSERT INTO users (telegram_id, username, first_name, invited_by, accepted_tos, is_premium)
      VALUES ($1, $2, $3, $4, 1, $5)
      ON CONFLICT (telegram_id) DO NOTHING
    `, [tgUser.id, tgUser.username || null, tgUser.first_name || '', successfulReferrer, isPremium]);

    if (successfulReferrer) {
      await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', [successfulReferrer]);
      await giveRandomStarterItem(successfulReferrer);
    }

    res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    user = res.rows[0];
  }

  // Telegram присылает актуальный флаг Premium. Обновляем его при каждом входе.
  await pool.query('UPDATE users SET is_premium = $1, username = $2, first_name = $3 WHERE telegram_id = $4', [isPremium, tgUser.username || null, tgUser.first_name || '', tgUser.id]);
  return { user: (await getUser(tgUser.id)), rewardedReferrerId: successfulReferrer };
}

async function ensureUserExists(tgUser) {
  let res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  if (res.rows[0]) {
    await pool.query(
      'UPDATE users SET is_premium = $1, username = $2, first_name = $3 WHERE telegram_id = $4',
      [tgUser.is_premium ? 1 : 0, tgUser.username || null, tgUser.first_name || '', tgUser.id]
    );
    res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    return res.rows[0];
  }

  await pool.query(`
    INSERT INTO users (telegram_id, username, first_name, accepted_tos, is_premium)
    VALUES ($1, $2, $3, 1, $4)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name
  `, [tgUser.id, tgUser.username || null, tgUser.first_name || null, tgUser.is_premium ? 1 : 0]);

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
async function buyItemsWithBalance(userId, itemId, quantity = 1, operationId = null) {
  const safeQuantity = Number(quantity);
  if (!Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 9999) {
    return { error: 'invalid_quantity' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (operationId) {
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response)
        VALUES ($1, 'purchase', $2, '{}'::jsonb)
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response
      `, [userId, String(operationId).slice(0, 100)]);

      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response FROM operation_results
          WHERE user_id = $1 AND operation_type = 'purchase' AND operation_id = $2
        `, [userId, String(operationId).slice(0, 100)]);
        await client.query('ROLLBACK');
        return existing.rows[0]?.response || { error: 'operation_in_progress' };
      }
    }

    const userRes = await client.query(
      'SELECT balance FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { error: 'user_not_found' };
    }

    const itemRes = await client.query(
      'SELECT id, name, category, price_stars, image_url FROM items WHERE id = $1',
      [itemId]
    );
    const item = itemRes.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return { error: 'item_not_found' };
    }

    const unitPrice = Number(item.price_stars);
    if (!Number.isInteger(unitPrice) || unitPrice < 0) {
      await client.query('ROLLBACK');
      return { error: 'invalid_item_price' };
    }

    const total = unitPrice * safeQuantity;
    if (!Number.isSafeInteger(total)) {
      await client.query('ROLLBACK');
      return { error: 'invalid_quantity' };
    }

    if (user.balance < total) {
      await client.query('ROLLBACK');
      return { error: 'insufficient_balance' };
    }

    const balRes = await client.query(
      'UPDATE users SET balance = balance - $1 WHERE telegram_id = $2 AND balance >= $1 RETURNING balance',
      [total, userId]
    );
    if (!balRes.rowCount) {
      await client.query('ROLLBACK');
      return { error: 'insufficient_balance' };
    }

    await client.query(`
      INSERT INTO user_inventory (user_id, item_id)
      SELECT $1, $2 FROM generate_series(1, $3)
    `, [userId, item.id, safeQuantity]);

    const response = {
      item,
      quantity: safeQuantity,
      total,
      balance: balRes.rows[0].balance
    };

    if (operationId) {
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb
        WHERE user_id = $1 AND operation_type = 'purchase' AND operation_id = $2
      `, [userId, String(operationId).slice(0, 100), JSON.stringify(response)]);
    }

    await client.query('COMMIT');
    return response;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Backwards-compatible single-item helper.
async function buyItemWithBalance(userId, itemId) {
  return buyItemsWithBalance(userId, itemId, 1, null);
}

async function getReferralProgress(userId) {
  const res = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_premium = 1)::int AS premium,
      COUNT(*) FILTER (WHERE COALESCE(is_premium, 0) = 0)::int AS regular
    FROM users
    WHERE invited_by = $1
  `, [userId]);

  const row = res.rows[0] || { total: 0, premium: 0, regular: 0 };
  const premium = Number(row.premium) || 0;
  const regular = Number(row.regular) || 0;
  return {
    total: Number(row.total) || 0,
    premium,
    regular,
    premiumRemaining: Math.max(0, 5 - premium),
    regularRemaining: Math.max(0, 10 - regular),
    canWithdraw: premium >= 5 || regular >= 10
  };
}


async function upgradeItem(userId, inventoryItemId, targetItemId, multiplier = 1, operationId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (operationId) {
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response)
        VALUES ($1, 'upgrade', $2, '{}'::jsonb)
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response
      `, [userId, String(operationId).slice(0, 100)]);

      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response FROM operation_results
          WHERE user_id = $1 AND operation_type = 'upgrade' AND operation_id = $2
        `, [userId, String(operationId).slice(0, 100)]);
        await client.query('ROLLBACK');
        return existing.rows[0]?.response || { error: 'operation_in_progress' };
      }
    }

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

    if (Number(sourceItem.price_stars) === Number(targetItem.price_stars)) {
      await client.query('ROLLBACK');
      return { error: 'same_price_target' };
    }

    const safeMultiplier = Number(multiplier);
    if (!Number.isFinite(safeMultiplier) || !Number.isInteger(safeMultiplier * 10) || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER) {
      await client.query('ROLLBACK');
      return { error: 'invalid_multiplier' };
    }

    const decision = resolveUpgrade(
      { id: sourceItem.item_id, name: sourceItem.name, price_stars: sourceItem.price_stars },
      targetItem,
      safeMultiplier
    );

    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);
    await client.query('UPDATE users SET upgrades_count = upgrades_count + 1 WHERE telegram_id = $1', [userId]);

    let resultItem = null;
    if (decision.success) {
      const resultRes = await client.query('SELECT * FROM items WHERE id = $1', [decision.resultItemId]);
      resultItem = resultRes.rows[0];
      if (!resultItem) {
        await client.query('ROLLBACK');
        return { error: 'result_not_found' };
      }
      await client.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, resultItem.id]);
    }

    const response = {
      success: Boolean(decision.success),
      item: resultItem,
      chance: decision.chance,
      baseChance: decision.baseChance,
      roll: decision.roll,
      multiplier: decision.multiplier
    };

    if (operationId) {
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb
        WHERE user_id = $1 AND operation_type = 'upgrade' AND operation_id = $2
      `, [userId, String(operationId).slice(0, 100), JSON.stringify(response)]);
    }

    await client.query('COMMIT');
    return response;
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
  getReferralProgress,
  ensureUserExists,
  getCatalogItems,
  getItemById,
  getUserInventory,
  addInventoryItem,
  buyItemWithBalance,
  buyItemsWithBalance,
  upgradeItem,
  sellInventoryItem
};