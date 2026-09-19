const { Pool } = require('pg');
const catalogItems = require('./catalog');
const { resolveUpgrade, canUpgradeTo, MAX_MULTIPLIER } = require('./upgrade-logic');
const { WITHDRAWAL, UPGRADE } = require('./house-config');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Не задана DATABASE_URL — база не подключится.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: 15000,
  query_timeout: 20000,
  application_name: 'roup-bot',
});

pool.on('error', (err) => {
  console.error('[pg] pool error:', err.message);
});

// ── Slow query watchdog ─────────────────────────────────────────────
const SLOW_MS = 200;
const _origQuery = pool.query.bind(pool);
pool.query = function patchedQuery(...args) {
  const t0 = Date.now();
  const res = _origQuery(...args);
  if (res && typeof res.then === 'function') {
    res.then(
      () => {
        const dt = Date.now() - t0;
        if (dt > SLOW_MS) {
          const q = typeof args[0] === 'string' ? args[0].slice(0, 100) : '(config)';
          console.warn(`[pg] slow ${dt}ms: ${q.replace(/\s+/g, ' ')}`);
        }
      },
      () => {}
    );
  }
  return res;
};

// ── Live feed ring buffer ───────────────────────────────────────────
const LIVE_FEED_MAX = 50;
const recentDrops = [];

function pickDisplayName(user) {
  const fn = String(user?.first_name || '').trim();
  if (fn) return fn.replace(/^@+/, '');
  const id = String(user?.telegram_id || user?.id || '');
  if (id.length >= 4) return `игрок_${id.slice(-4)}`;
  return 'игрок';
}

function pushDrop(drop) {
  recentDrops.unshift(drop);
  if (recentDrops.length > LIVE_FEED_MAX) recentDrops.length = LIVE_FEED_MAX;
}

function getRecentDrops(limit = 20) {
  return limit >= recentDrops.length ? recentDrops.slice() : recentDrops.slice(0, limit);
}

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        balance INTEGER DEFAULT 0,
        upgrades_count INTEGER DEFAULT 0,
        cheap_upgrades_count INTEGER DEFAULT 0,
        is_vip INTEGER DEFAULT 0,
        subscribed_reward_claimed INTEGER DEFAULT 0,
        invited_by BIGINT DEFAULT NULL,
        referrals_count INTEGER DEFAULT 0,
        is_premium INTEGER DEFAULT 0,
        accepted_tos INTEGER DEFAULT 0,
        tutorial_completed INTEGER DEFAULT 0,
        pre_demo_balance INTEGER DEFAULT NULL,
        lucky_mode INTEGER DEFAULT 0,
        last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_broadcast_at TIMESTAMP DEFAULT NULL,
        broadcast_opt_out INTEGER DEFAULT 0,
        broadcasts_today INTEGER DEFAULT 0,
        broadcasts_day_marker DATE DEFAULT CURRENT_DATE,
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
        is_demo INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS operation_results (
        user_id BIGINT NOT NULL REFERENCES users(telegram_id),
        operation_type TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        response JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, operation_type, operation_id)
      );

      CREATE TABLE IF NOT EXISTS balance_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(telegram_id),
        operation_type TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, operation_type, operation_id)
      );

      CREATE TABLE IF NOT EXISTS withdraw_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(telegram_id),
        method TEXT NOT NULL,
        amount_stars INTEGER NOT NULL,
        amount_rub NUMERIC(12,2) NOT NULL,
        commission_rub NUMERIC(12,2) NOT NULL,
        payout_rub NUMERIC(12,2) NOT NULL,
        contact_username TEXT NOT NULL,
        roblox_username TEXT,
        robux_gross NUMERIC(12,2),
        robux_commission NUMERIC(12,2),
        robux_payout NUMERIC(12,2),
        game_pass_price INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        operation_id TEXT NOT NULL UNIQUE,
        admin_message_id BIGINT,
        admin_note TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_user_created
        ON user_inventory (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referrals_invited_by
        ON users (invited_by);
      CREATE INDEX IF NOT EXISTS idx_operations_created
        ON operation_results (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_operations_pending
        ON operation_results (user_id, operation_type, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wr_user_status
        ON withdraw_requests (user_id, status);
      CREATE INDEX IF NOT EXISTS idx_wr_status_created
        ON withdraw_requests (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_last_active
        ON users (last_active_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_broadcast
        ON users (broadcast_opt_out, last_active_at DESC);
    `);

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pre_demo_balance INTEGER DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lucky_mode INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS cheap_upgrades_count INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_broadcast_at TIMESTAMP DEFAULT NULL');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS broadcast_opt_out INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS broadcasts_today INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS broadcasts_day_marker DATE DEFAULT CURRENT_DATE');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS roblox_username TEXT');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS robux_gross NUMERIC(12,2)');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS robux_commission NUMERIC(12,2)');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS robux_payout NUMERIC(12,2)');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS game_pass_price INTEGER');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS admin_message_id BIGINT');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS admin_note TEXT');
    await pool.query('ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await pool.query("ALTER TABLE operation_results ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'");
    await pool.query("ALTER TABLE operation_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    await pool.query("ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS is_demo INTEGER DEFAULT 0");

    // Batch upsert items через unnest
    if (catalogItems.length) {
      const names = catalogItems.map((i) => i.name);
      const cats = catalogItems.map((i) => i.category);
      const prices = catalogItems.map((i) => i.price_stars);
      const urls = catalogItems.map((i) => i.image_url);
      await pool.query(
        `INSERT INTO items (name, category, price_stars, image_url)
         SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::text[])
         ON CONFLICT (name) DO UPDATE SET
           category = EXCLUDED.category,
           price_stars = EXCLUDED.price_stars,
           image_url = EXCLUDED.image_url`,
        [names, cats, prices, urls]
      );
    }

    // Прогрев live-кэша — с дедупликацией подряд идущих user_id
    try {
      const warm = await pool.query(`
        WITH ranked AS (
          SELECT
            o.user_id,
            u.first_name,
            o.response->'item'->>'name' AS item_name,
            o.response->'item'->>'image_url' AS item_image,
            (o.response->>'chance')::numeric AS chance,
            (o.response->'item'->>'price_stars')::int AS price,
            o.created_at,
            LAG(o.user_id) OVER (ORDER BY o.created_at DESC) AS prev_user
          FROM operation_results o
          JOIN users u ON u.telegram_id = o.user_id
          WHERE o.operation_type = 'upgrade'
            AND o.status = 'completed'
            AND (o.response->>'success')::boolean = true
            AND o.created_at > NOW() - INTERVAL '2 hours'
          ORDER BY o.created_at DESC
          LIMIT 200
        )
        SELECT user_id, first_name, item_name, item_image, chance, price, created_at
        FROM ranked
        WHERE prev_user IS DISTINCT FROM user_id
        ORDER BY created_at DESC
        LIMIT 30
      `);

      for (const row of warm.rows) {
        if (!row.item_name) continue;
        pushDrop({
          id: `warm_${row.user_id}_${new Date(row.created_at).getTime()}`,
          userId: String(row.user_id),
          userName: pickDisplayName({ first_name: row.first_name, telegram_id: row.user_id }),
          itemName: row.item_name,
          itemImageUrl: row.item_image,
          priceStars: Number(row.price) || 0,
          chance: Number(row.chance) || 0,
          success: true,
          ts: new Date(row.created_at).getTime(),
        });
      }
      console.log(`✅ Live-кэш прогрет: ${recentDrops.length} дропов (уникальные юзеры)`);
    } catch (e) {
      console.warn('Прогрев live-кэша пропущен:', e.message);
    }

    console.log('✅ База данных Supabase подключена и синхронизирована!');
  } catch (err) {
    console.error('Ошибка инициализации таблиц Supabase:', err.message);
  }
}

initDb();

// ═══════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════

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

    const insertRes = await pool.query(`
      INSERT INTO users (telegram_id, username, first_name, invited_by, accepted_tos, is_premium, last_active_at)
      VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (telegram_id) DO NOTHING
      RETURNING telegram_id
    `, [tgUser.id, tgUser.username || null, tgUser.first_name || '', successfulReferrer, isPremium]);

    if (insertRes.rowCount && successfulReferrer) {
      await pool.query('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = $1', [successfulReferrer]);
      await giveRandomStarterItem(successfulReferrer);
    } else if (!insertRes.rowCount) {
      successfulReferrer = null;
    }

    res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    user = res.rows[0];
  }

  await pool.query(
    'UPDATE users SET is_premium = $1, username = $2, first_name = $3, last_active_at = CURRENT_TIMESTAMP WHERE telegram_id = $4',
    [isPremium, tgUser.username || null, tgUser.first_name || '', tgUser.id]
  );
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
    INSERT INTO users (telegram_id, username, first_name, accepted_tos, is_premium, last_active_at)
    VALUES ($1, $2, $3, 1, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name
  `, [tgUser.id, tgUser.username || null, tgUser.first_name || null, tgUser.is_premium ? 1 : 0]);

  res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
  return res.rows[0];
}

async function giveRandomStarterItem(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }

    const itemRes = await client.query(`
      SELECT * FROM items WHERE price_stars BETWEEN 5 AND 10 ORDER BY RANDOM() LIMIT 1
    `);
    const item = itemRes.rows[0];
    if (item) {
      const isDemo = userRes.rows[0].pre_demo_balance != null || Number(userRes.rows[0].lucky_mode) === 1 ? 1 : 0;
      await client.query(
        'INSERT INTO user_inventory (user_id, item_id, is_demo) VALUES ($1, $2, $3)',
        [userId, item.id, isDemo]
      );
    }

    await client.query('COMMIT');
    return item;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function claimSubscriptionItem(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimRes = await client.query(`
      UPDATE users SET subscribed_reward_claimed = 1
      WHERE telegram_id = $1 AND COALESCE(subscribed_reward_claimed, 0) = 0
      RETURNING telegram_id
    `, [userId]);
    if (!claimRes.rowCount) { await client.query('ROLLBACK'); return null; }

    const itemRes = await client.query(`
      SELECT * FROM items WHERE price_stars BETWEEN 5 AND 10 ORDER BY RANDOM() LIMIT 1
    `);
    const item = itemRes.rows[0];
    if (!item) { await client.query('ROLLBACK'); return null; }

    await client.query(`
      INSERT INTO user_inventory (user_id, item_id, is_demo)
      SELECT $1, $2, CASE WHEN pre_demo_balance IS NOT NULL OR lucky_mode = 1 THEN 1 ELSE 0 END
      FROM users WHERE telegram_id = $1
    `, [userId, item.id]);
    await client.query('COMMIT');
    return item;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function getUserInventoryCount(userId) {
  const res = await pool.query('SELECT count(*)::int AS count FROM user_inventory WHERE user_id = $1', [userId]);
  return Number(res.rows[0]?.count || 0);
}

async function getUserDemoItemCount(userId) {
  const res = await pool.query(
    'SELECT count(*)::int AS count FROM user_inventory WHERE user_id = $1 AND is_demo = 1',
    [userId]
  );
  return Number(res.rows[0]?.count || 0);
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

// ═══════════════════════════════════════════════════════════════════════
// ITEMS / INVENTORY
// ═══════════════════════════════════════════════════════════════════════

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
    SELECT ui.id AS inventory_id, ui.created_at, ui.is_demo,
           i.id, i.name, i.category, i.price_stars, i.image_url
    FROM user_inventory ui
    JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = $1
    ORDER BY ui.created_at DESC
  `, [userId]);
  return res.rows;
}

async function addInventoryItem(userId, itemId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(
      'SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    const isDemo = userRes.rows[0].pre_demo_balance != null || Number(userRes.rows[0].lucky_mode) === 1 ? 1 : 0;
    await client.query(
      'INSERT INTO user_inventory (user_id, item_id, is_demo) VALUES ($1, $2, $3)',
      [userId, itemId, isDemo]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUY
// ═══════════════════════════════════════════════════════════════════════

async function buyItemsWithBalance(userId, itemId, quantity = 1, operationId = null) {
  const safeQuantity = Number(quantity);
  if (!Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 9999) {
    return { error: 'invalid_quantity' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (operationId) {
      const opKey = String(operationId).slice(0, 100);
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response, status)
        VALUES ($1, 'purchase', $2, '{}'::jsonb, 'pending')
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response, status
      `, [userId, opKey]);

      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response, status FROM operation_results
          WHERE user_id = $1 AND operation_type = 'purchase' AND operation_id = $2
          FOR UPDATE
        `, [userId, opKey]);
        const row = existing.rows[0];
        await client.query('ROLLBACK');
        if (row?.status === 'completed') return row.response;
        return { error: 'operation_in_progress' };
      }
    }

    const userRes = await client.query(
      'SELECT balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) { await client.query('ROLLBACK'); return { error: 'user_not_found' }; }

    const itemRes = await client.query(
      'SELECT id, name, category, price_stars, image_url FROM items WHERE id = $1',
      [itemId]
    );
    const item = itemRes.rows[0];
    if (!item) { await client.query('ROLLBACK'); return { error: 'item_not_found' }; }

    const unitPrice = Number(item.price_stars);
    if (!Number.isInteger(unitPrice) || unitPrice < 0) { await client.query('ROLLBACK'); return { error: 'invalid_item_price' }; }

    const total = unitPrice * safeQuantity;
    if (!Number.isSafeInteger(total)) { await client.query('ROLLBACK'); return { error: 'invalid_quantity' }; }
    if (user.balance < total) { await client.query('ROLLBACK'); return { error: 'insufficient_balance' }; }

    const balRes = await client.query(
      'UPDATE users SET balance = balance - $1 WHERE telegram_id = $2 AND balance >= $1 RETURNING balance',
      [total, userId]
    );
    if (!balRes.rowCount) { await client.query('ROLLBACK'); return { error: 'insufficient_balance' }; }

    const isDemo = user.lucky_mode ? 1 : 0;

    await client.query(`
      INSERT INTO user_inventory (user_id, item_id, is_demo)
      SELECT $1, $2, $3 FROM generate_series(1, $4)
    `, [userId, item.id, isDemo, safeQuantity]);

    const response = { item, quantity: safeQuantity, total, balance: balRes.rows[0].balance };

    if (operationId) {
      const opKey = String(operationId).slice(0, 100);
      await client.query(`
        INSERT INTO balance_ledger (user_id, operation_type, operation_id, amount, balance_after, metadata)
        VALUES ($1, 'purchase', $2, $3, $4, $5::jsonb)
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
      `, [userId, opKey, -total, balRes.rows[0].balance, JSON.stringify({ itemId: item.id, quantity: safeQuantity, isDemo })]);
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND operation_type = 'purchase' AND operation_id = $2
      `, [userId, opKey, JSON.stringify(response)]);
    }

    await client.query('COMMIT');
    return response;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function buyItemWithBalance(userId, itemId) {
  return buyItemsWithBalance(userId, itemId, 1, null);
}

// ═══════════════════════════════════════════════════════════════════════
// TUTORIAL / REFERRAL
// ═══════════════════════════════════════════════════════════════════════

async function setTutorialCompleted(userId) {
  const res = await pool.query(
    'UPDATE users SET tutorial_completed = 1 WHERE telegram_id = $1 RETURNING tutorial_completed',
    [userId]
  );
  return Boolean(res.rows[0]?.tutorial_completed);
}

async function getReferralProgress(userId) {
  const res = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_premium = 1)::int AS premium,
      COUNT(*) FILTER (WHERE COALESCE(is_premium, 0) = 0)::int AS regular
    FROM users WHERE invited_by = $1
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
    canWithdraw: premium >= 5 || regular >= 10,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// UPGRADE
// ═══════════════════════════════════════════════════════════════════════

async function upgradeItem(userId, inventoryItemId, targetItemId, multiplier = 1, operationId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Идемпотентность по operationId
    if (operationId) {
      const opKey = String(operationId).slice(0, 100);
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response, status)
        VALUES ($1, 'upgrade', $2, '{}'::jsonb, 'pending')
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response, status
      `, [userId, opKey]);

      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response, status FROM operation_results
          WHERE user_id = $1 AND operation_type = 'upgrade' AND operation_id = $2
          FOR UPDATE
        `, [userId, opKey]);
        const row = existing.rows[0];
        await client.query('ROLLBACK');
        if (row?.status === 'completed') return row.response;
        return { error: 'operation_in_progress' };
      }
    }

    const userRow = await client.query(
      'SELECT lucky_mode, pre_demo_balance, first_name, telegram_id, cheap_upgrades_count FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRow.rowCount) {
      await client.query('ROLLBACK');
      return { error: 'user_not_found' };
    }
    const luckyMode = Number(userRow.rows[0].lucky_mode) === 1;
    const demoActive = userRow.rows[0].pre_demo_balance != null || luckyMode;
    const displayName = pickDisplayName(userRow.rows[0]);
    const cheapUpgradesCount = Number(userRow.rows[0].cheap_upgrades_count) || 0;

    // FOR UPDATE OF ui — защита от дабл-тапа:
    // параллельный запрос на тот же inventoryItemId встанет в очередь
    // и после первого коммита увидит 0 строк → item_not_owned
    const ownedRes = await client.query(`
      SELECT ui.id, ui.is_demo, i.id AS item_id, i.name, i.price_stars
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

    if (demoActive && Number(sourceItem.is_demo) !== 1) {
      await client.query('ROLLBACK');
      return { error: 'demo_item_required' };
    }
    if (!demoActive && Number(sourceItem.is_demo) === 1) {
      await client.query('ROLLBACK');
      return { error: 'demo_item_locked' };
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
    if (!canUpgradeTo(sourceItem, targetItem)) {
      await client.query('ROLLBACK');
      return { error: 'target_not_higher' };
    }

    const safeMultiplier = Number(multiplier);
    if (!Number.isFinite(safeMultiplier)
        || Math.abs(safeMultiplier * 10 - Math.round(safeMultiplier * 10)) >= 1e-9
        || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER) {
      await client.query('ROLLBACK');
      return { error: 'invalid_multiplier' };
    }

    const decision = resolveUpgrade(
      { id: sourceItem.item_id, name: sourceItem.name, price_stars: sourceItem.price_stars },
      targetItem,
      safeMultiplier,
      { luckyMode, cheapUpgradesCount }
    );

    console.log('[upgrade] u=%s lucky=%s cheap=%s base=%s final=%s roll=%s ok=%s disp=%s ang=%s',
      userId, luckyMode, decision.cheapPhase || '-', decision._realBase, decision._realFinal,
      decision._roll, decision.success, decision.chance, decision.landingAngle);

    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);

    if (!demoActive) {
      await client.query('UPDATE users SET upgrades_count = upgrades_count + 1 WHERE telegram_id = $1', [userId]);
      const cheapThreshold = Number(UPGRADE?.CHEAP?.THRESHOLD) || 500;
      if (decision.success && Number(sourceItem.price_stars) <= cheapThreshold) {
        await client.query(
          'UPDATE users SET cheap_upgrades_count = cheap_upgrades_count + 1 WHERE telegram_id = $1',
          [userId]
        );
      }
    }

    let resultItem = null;
    if (decision.success) {
      const resultRes = await client.query('SELECT * FROM items WHERE id = $1', [decision.resultItemId]);
      resultItem = resultRes.rows[0];
      if (!resultItem) {
        await client.query('ROLLBACK');
        return { error: 'result_not_found' };
      }
      const isDemo = demoActive ? 1 : 0;
      await client.query(
        'INSERT INTO user_inventory (user_id, item_id, is_demo) VALUES ($1, $2, $3)',
        [userId, resultItem.id, isDemo]
      );
    }

    const response = {
      success: Boolean(decision.success),
      item: resultItem,
      chance: decision.chance,
      multiplier: decision.multiplier,
      landingAngle: decision.landingAngle,
    };

    if (operationId) {
      const opKey = String(operationId).slice(0, 100);
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND operation_type = 'upgrade' AND operation_id = $2
      `, [userId, opKey, JSON.stringify(response)]);
    }

    await client.query('COMMIT');

    // Live-feed push — вне транзакции
    if (decision.success && resultItem && !luckyMode) {
      pushDrop({
        id: `d_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: String(userId),
        userName: displayName,
        itemName: resultItem.name,
        itemImageUrl: resultItem.image_url,
        priceStars: Number(resultItem.price_stars) || 0,
        chance: decision.chance,
        success: true,
        ts: Date.now(),
      });
    }

    return response;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SELL
// ═══════════════════════════════════════════════════════════════════════

async function sellInventoryItem(userId, inventoryItemId, operationId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opKey = operationId ? String(operationId).slice(0, 100) : null;

    if (opKey) {
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response, status)
        VALUES ($1, 'sell', $2, '{}'::jsonb, 'pending')
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response, status
      `, [userId, opKey]);
      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response, status FROM operation_results
          WHERE user_id = $1 AND operation_type = 'sell' AND operation_id = $2
          FOR UPDATE
        `, [userId, opKey]);
        const existingRow = existing.rows[0];
        await client.query('ROLLBACK');
        if (existingRow?.status === 'completed') return existingRow.response;
        return { error: 'operation_in_progress' };
      }
    }

    const userRes = await client.query(
      'SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) { await client.query('ROLLBACK'); return { error: 'user_not_found' }; }
    const demoActive = userRes.rows[0].pre_demo_balance != null || Number(userRes.rows[0].lucky_mode) > 0;
    if (demoActive) { await client.query('ROLLBACK'); return { error: 'demo_active' }; }

    const ownedRes = await client.query(`
      SELECT ui.id, ui.is_demo, i.id AS item_id, i.name, i.price_stars
      FROM user_inventory ui
      JOIN items i ON i.id = ui.item_id
      WHERE ui.id = $1 AND ui.user_id = $2
      FOR UPDATE OF ui
    `, [inventoryItemId, userId]);

    const row = ownedRes.rows[0];
    if (!row) { await client.query('ROLLBACK'); return { error: 'item_not_owned' }; }
    if (Number(row.is_demo) === 1) { await client.query('ROLLBACK'); return { error: 'demo_item_locked' }; }

    await client.query('DELETE FROM user_inventory WHERE id = $1', [inventoryItemId]);
    const balRes = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance',
      [row.price_stars, userId]
    );

    const response = { soldName: row.name, earned: row.price_stars, balance: balRes.rows[0]?.balance ?? 0 };

    if (opKey) {
      await client.query(`
        INSERT INTO balance_ledger (user_id, operation_type, operation_id, amount, balance_after, metadata)
        VALUES ($1, 'sell', $2, $3, $4, $5::jsonb)
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
      `, [userId, opKey, Number(row.price_stars), balRes.rows[0]?.balance ?? 0, JSON.stringify({ inventoryItemId, itemId: row.item_id || null })]);
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND operation_type = 'sell' AND operation_id = $2
      `, [userId, opKey, JSON.stringify(response)]);
    }

    await client.query('COMMIT');
    return response;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function sellInventoryItemsBatch(userId, itemId, quantity, operationId = null) {
  const safeQuantity = Number(quantity);
  if (!Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 9999) return { error: 'invalid_quantity' };
  const safeItemId = Number(itemId);
  if (!Number.isInteger(safeItemId) || safeItemId <= 0) return { error: 'invalid_item' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opKey = operationId ? String(operationId).slice(0, 100) : null;

    if (opKey) {
      const opRes = await client.query(`
        INSERT INTO operation_results (user_id, operation_type, operation_id, response, status)
        VALUES ($1, 'sell_batch', $2, '{}'::jsonb, 'pending')
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
        RETURNING response, status
      `, [userId, opKey]);
      if (!opRes.rowCount) {
        const existing = await client.query(`
          SELECT response, status FROM operation_results
          WHERE user_id = $1 AND operation_type = 'sell_batch' AND operation_id = $2
          FOR UPDATE
        `, [userId, opKey]);
        const existingRow = existing.rows[0];
        await client.query('ROLLBACK');
        if (existingRow?.status === 'completed') return existingRow.response;
        return { error: 'operation_in_progress' };
      }
    }

    const userRes = await client.query(
      'SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) { await client.query('ROLLBACK'); return { error: 'user_not_found' }; }
    const demoActive = userRes.rows[0].pre_demo_balance != null || Number(userRes.rows[0].lucky_mode) > 0;
    if (demoActive) { await client.query('ROLLBACK'); return { error: 'demo_active' }; }

    const rows = await client.query(`
      SELECT ui.id AS inventory_id, ui.is_demo, i.name, i.price_stars
      FROM user_inventory ui
      JOIN items i ON i.id = ui.item_id
      WHERE ui.user_id = $1 AND ui.item_id = $2
      ORDER BY ui.created_at ASC LIMIT $3
      FOR UPDATE OF ui
    `, [userId, safeItemId, safeQuantity]);

    if (rows.rowCount < safeQuantity) {
      await client.query('ROLLBACK');
      return { error: 'not_enough_items', available: rows.rowCount };
    }
    if (rows.rows.some((r) => Number(r.is_demo) === 1)) {
      await client.query('ROLLBACK');
      return { error: 'demo_item_locked' };
    }

    const ids = rows.rows.map((r) => r.inventory_id);
    const unitPrice = Number(rows.rows[0].price_stars);
    const itemName = rows.rows[0].name;
    const totalEarned = unitPrice * safeQuantity;

    await client.query('DELETE FROM user_inventory WHERE id = ANY($1::int[])', [ids]);
    const balRes = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance',
      [totalEarned, userId]
    );

    const response = {
      itemId: safeItemId, soldName: itemName, quantity: safeQuantity,
      unitPrice, earned: totalEarned, balance: balRes.rows[0]?.balance ?? 0,
    };

    if (opKey) {
      await client.query(`
        INSERT INTO balance_ledger (user_id, operation_type, operation_id, amount, balance_after, metadata)
        VALUES ($1, 'sell_batch', $2, $3, $4, $5::jsonb)
        ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
      `, [userId, opKey, totalEarned, balRes.rows[0]?.balance ?? 0, JSON.stringify({ itemId: safeItemId, quantity: safeQuantity })]);
      await client.query(`
        UPDATE operation_results
        SET response = $3::jsonb, status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND operation_type = 'sell_batch' AND operation_id = $2
      `, [userId, opKey, JSON.stringify(response)]);
    }

    await client.query('COMMIT');
    return response;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

// ═══════════════════════════════════════════════════════════════════════
// DEMO / LUCKY
// ═══════════════════════════════════════════════════════════════════════

async function grantDemo(userId, amount) {
  const safeAmount = Number(amount);
  if (!Number.isInteger(safeAmount) || safeAmount < 1 || safeAmount > 1_000_000) {
    return { error: 'invalid_amount' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT balance, pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) {
      await client.query('ROLLBACK');
      return { error: 'user_not_found' };
    }

    const user = userRes.rows[0];
    const wasActive = user.pre_demo_balance != null || Number(user.lucky_mode) > 0;
    if (wasActive) {
      await client.query('ROLLBACK');
      return { error: 'demo_already_active' };
    }

    const preBalance = Number(user.balance) || 0;

    const delRes = await client.query(
      'DELETE FROM user_inventory WHERE user_id = $1 AND is_demo = 1',
      [userId]
    );

    const result = await client.query(
      `UPDATE users
       SET pre_demo_balance = $1,
           balance = balance + $2,
           lucky_mode = 1
       WHERE telegram_id = $3
       RETURNING balance, pre_demo_balance, lucky_mode`,
      [preBalance, safeAmount, userId]
    );

    await client.query('COMMIT');

    console.log('[grantDemo] u=%s +%s bal=%s lucky=%s cleaned=%s',
      userId, safeAmount, result.rows[0].balance, result.rows[0].lucky_mode, delRes.rowCount);

    return {
      success: true,
      userId: String(userId),
      granted: safeAmount,
      preDemoBalance: Number(result.rows[0].pre_demo_balance),
      newBalance: Number(result.rows[0].balance),
      luckyMode: Number(result.rows[0].lucky_mode) === 1,
      cleanedPrevDemoItems: delRes.rowCount,
    };
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function revokeDemo(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT balance, pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    if (!userRes.rowCount) { await client.query('ROLLBACK'); return { error: 'user_not_found' }; }

    const user = userRes.rows[0];
    const wasActive = user.pre_demo_balance != null || Number(user.lucky_mode) > 0;
    const rollbackTo = user.pre_demo_balance != null ? Number(user.pre_demo_balance) : Number(user.balance);

    const delRes = await client.query(
      'DELETE FROM user_inventory WHERE user_id = $1 AND is_demo = 1',
      [userId]
    );

    await client.query(
      `UPDATE users SET balance = $1, pre_demo_balance = NULL, lucky_mode = 0 WHERE telegram_id = $2`,
      [rollbackTo, userId]
    );

    await client.query('COMMIT');

    console.log('[revokeDemo] u=%s active=%s restored=%s removed=%s',
      userId, wasActive, rollbackTo, delRes.rowCount);

    return { success: true, userId: String(userId), wasActive, restoredBalance: rollbackTo, removedItems: delRes.rowCount };
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function getDemoStatus(userId) {
  const user = await getUser(userId);
  if (!user) return { error: 'user_not_found' };
  return {
    userId: String(userId),
    balance: Number(user.balance) || 0,
    preDemoBalance: user.pre_demo_balance != null ? Number(user.pre_demo_balance) : null,
    luckyMode: Number(user.lucky_mode) === 1,
    active: user.pre_demo_balance != null || Number(user.lucky_mode) > 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// WITHDRAW
// ═══════════════════════════════════════════════════════════════════════

async function createWithdrawRequest(userId, { method, amountStars, contactUsername, robloxUsername, operationId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opKey = String(operationId).slice(0, 100);

    const opRes = await client.query(
      `INSERT INTO operation_results (user_id, operation_type, operation_id, response, status)
       VALUES ($1, 'withdraw_request', $2, '{}'::jsonb, 'pending')
       ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING
       RETURNING operation_id`,
      [userId, opKey]
    );
    if (!opRes.rowCount) {
      const ex = await client.query(
        `SELECT response, status FROM operation_results
         WHERE user_id = $1 AND operation_type = 'withdraw_request' AND operation_id = $2
         FOR UPDATE`,
        [userId, opKey]
      );
      await client.query('ROLLBACK');
      return ex.rows[0]?.status === 'completed'
        ? ex.rows[0].response
        : { error: 'operation_in_progress' };
    }

    const demoCheck = await client.query(
      'SELECT pre_demo_balance, lucky_mode FROM users WHERE telegram_id = $1 FOR UPDATE',
      [userId]
    );
    const dUser = demoCheck.rows[0];
    if (!dUser) {
      await client.query('ROLLBACK');
      return { error: 'user_not_found' };
    }
    const demoItemsRes = await client.query(
      'SELECT COUNT(*)::int AS cnt FROM user_inventory WHERE user_id = $1 AND is_demo = 1',
      [userId]
    );
    if (dUser.pre_demo_balance != null || Number(dUser.lucky_mode) > 0 || Number(demoItemsRes.rows[0]?.cnt) > 0) {
      await client.query('ROLLBACK');
      return { error: 'demo_active' };
    }

    const dailyRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM withdraw_requests
       WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
      [userId]
    );
    if (Number(dailyRes.rows[0]?.cnt) >= WITHDRAWAL.MAX_DAILY_WITHDRAWALS) {
      await client.query('ROLLBACK');
      return { error: 'daily_withdrawal_limit' };
    }

    const openRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM withdraw_requests
       WHERE user_id = $1 AND status IN ('pending', 'processing')`,
      [userId]
    );
    if ((openRes.rows[0]?.cnt || 0) >= WITHDRAWAL.MAX_OPEN_REQUESTS) {
      await client.query('ROLLBACK');
      return { error: 'too_many_open_requests' };
    }

    const balRes = await client.query(
      `UPDATE users SET balance = balance - $1
       WHERE telegram_id = $2 AND balance >= $1
       RETURNING balance`,
      [amountStars, userId]
    );
    if (!balRes.rowCount) {
      await client.query('ROLLBACK');
      return { error: 'insufficient_balance' };
    }

    const grossRobux = Math.floor(amountStars * WITHDRAWAL.STARS_TO_ROBUX_RATE);
    const commissionRobux = Math.floor(grossRobux * WITHDRAWAL.COMMISSION_PERCENT / 100);
    const payoutRobux = Math.max(0, grossRobux - commissionRobux);
    const gamePassPrice = Math.ceil(payoutRobux * (1 + WITHDRAWAL.GAME_PASS_MARKUP_PERCENT / 100));

    const insRes = await client.query(
      `INSERT INTO withdraw_requests
         (user_id, method, amount_stars, amount_rub, commission_rub, payout_rub,
          contact_username, roblox_username, robux_gross, robux_commission, robux_payout, game_pass_price,
          status, operation_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14::jsonb)
       RETURNING id, created_at`,
      [userId, method, amountStars, grossRobux, commissionRobux, payoutRobux,
       contactUsername, robloxUsername, grossRobux, commissionRobux, payoutRobux, gamePassPrice,
       opKey, JSON.stringify({ balanceAfter: balRes.rows[0].balance, gamePassMarkupPercent: WITHDRAWAL.GAME_PASS_MARKUP_PERCENT })]
    );

    await client.query(
      `INSERT INTO balance_ledger (user_id, operation_type, operation_id, amount, balance_after, metadata)
       VALUES ($1, 'withdraw_hold', $2, $3, $4, $5::jsonb)
       ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING`,
      [userId, opKey, -amountStars, balRes.rows[0].balance,
       JSON.stringify({ requestId: insRes.rows[0].id, method })]
    );

    const response = {
      success: true,
      requestId: insRes.rows[0].id,
      amountStars,
      amountRub: grossRobux,
      commissionRub: commissionRobux,
      payoutRub: payoutRobux,
      robuxGross: grossRobux,
      robuxCommission: commissionRobux,
      payoutRobux,
      robloxUsername,
      gamePassPrice,
      createdAt: insRes.rows[0].created_at,
      method,
      contactUsername,
      balance: balRes.rows[0].balance,
    };

    await client.query(
      `UPDATE operation_results
       SET response = $3::jsonb, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND operation_type = 'withdraw_request' AND operation_id = $2`,
      [userId, opKey, JSON.stringify(response)]
    );

    await client.query('COMMIT');
    return response;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function refundWithdrawRequest(requestId, adminNote = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT user_id, amount_stars, status FROM withdraw_requests
       WHERE id = $1 FOR UPDATE`,
      [requestId]
    );
    if (!r.rowCount) { await client.query('ROLLBACK'); return { error: 'not_found' }; }
    if (r.rows[0].status !== 'pending' && r.rows[0].status !== 'processing') {
      await client.query('ROLLBACK');
      return { error: 'already_final' };
    }

    const bal = await client.query(
      `UPDATE users SET balance = balance + $1 WHERE telegram_id = $2 RETURNING balance`,
      [r.rows[0].amount_stars, r.rows[0].user_id]
    );

    await client.query(
      `UPDATE withdraw_requests SET status = 'rejected', admin_note = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId, adminNote]
    );

    await client.query(
      `INSERT INTO balance_ledger (user_id, operation_type, operation_id, amount, balance_after, metadata)
       VALUES ($1, 'withdraw_refund', $2, $3, $4, $5::jsonb)
       ON CONFLICT (user_id, operation_type, operation_id) DO NOTHING`,
      [r.rows[0].user_id, `refund_${requestId}`,
       r.rows[0].amount_stars, bal.rows[0].balance,
       JSON.stringify({ requestId })]
    );

    await client.query('COMMIT');
    return { refunded: true, balance: bal.rows[0].balance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function markWithdrawPaid(requestId) {
  const res = await pool.query(
    `UPDATE withdraw_requests SET status = 'completed', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('pending', 'processing') RETURNING id`,
    [requestId]
  );
  return Boolean(res.rowCount);
}

async function attachAdminMessage(requestId, adminMessageId) {
  await pool.query(
    `UPDATE withdraw_requests SET admin_message_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [requestId, adminMessageId]
  );
}

// ═══════════════════════════════════════════════════════════════════════
// BROADCAST
// ═══════════════════════════════════════════════════════════════════════

async function touchUserActive(userId) {
  await pool.query(
    'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE telegram_id = $1',
    [userId]
  );
}

async function setBroadcastOptOut(userId, optOut) {
  await pool.query(
    'UPDATE users SET broadcast_opt_out = $2 WHERE telegram_id = $1',
    [userId, optOut ? 1 : 0]
  );
}

async function getBroadcastOptOut(userId) {
  const res = await pool.query(
    'SELECT broadcast_opt_out FROM users WHERE telegram_id = $1',
    [userId]
  );
  return Boolean(Number(res.rows[0]?.broadcast_opt_out));
}

// Возвращает пачку юзеров, которым уместно отправить рассылку.
// Фильтр: неактивность в окне [MIN_HOURS, MAX_HOURS] назад, не под opt-out,
// есть хоть один апгрейд, не превышены лимиты по частоте.
// items_count — количество не-demo предметов в инвентаре (для шаблона inventory_miss).
async function fetchBroadcastTargets(limit = 200) {
  const cfg = require('./house-config').BROADCAST || {};
  const minH = Number(cfg.INACTIVE_HOURS_MIN) || 3;
  const maxH = Number(cfg.INACTIVE_HOURS_MAX) || 72;
  const minUpg = Number(cfg.MIN_UPGRADES_TO_TARGET) || 1;
  const minHrsBetween = Number(cfg.MIN_HOURS_BETWEEN) || 6;
  const maxPerDay = Number(cfg.MAX_PER_DAY) || 3;

  const res = await pool.query(`
    SELECT u.telegram_id, u.first_name, u.username, u.balance, u.upgrades_count,
           u.pre_demo_balance, u.lucky_mode, u.last_active_at, u.last_broadcast_at,
           (
             SELECT COUNT(*)::int FROM user_inventory ui
             WHERE ui.user_id = u.telegram_id AND ui.is_demo = 0
           ) AS items_count
    FROM users u
    WHERE COALESCE(u.broadcast_opt_out, 0) = 0
      AND COALESCE(u.upgrades_count, 0) >= $3
      AND u.last_active_at <= NOW() - ($1 || ' hours')::interval
      AND u.last_active_at >= NOW() - ($2 || ' hours')::interval
      AND (u.last_broadcast_at IS NULL OR u.last_broadcast_at <= NOW() - ($4 || ' hours')::interval)
      AND (
        u.broadcasts_day_marker IS DISTINCT FROM CURRENT_DATE
        OR COALESCE(u.broadcasts_today, 0) < $5
      )
    ORDER BY RANDOM()
    LIMIT $6
  `, [minH, maxH, minUpg, minHrsBetween, maxPerDay, limit]);

  return res.rows;
}

async function markBroadcastSent(userId) {
  await pool.query(`
    UPDATE users
    SET last_broadcast_at = CURRENT_TIMESTAMP,
        broadcasts_today = CASE
          WHEN broadcasts_day_marker = CURRENT_DATE THEN COALESCE(broadcasts_today, 0) + 1
          ELSE 1
        END,
        broadcasts_day_marker = CURRENT_DATE
    WHERE telegram_id = $1
  `, [userId]);
}

// Случайный успешный апгрейд за последние 30 минут — для шаблона live_drop.
// Возвращает null, если свежих побед нет.
async function getRandomActiveDrop() {
  const res = await pool.query(`
    SELECT o.user_id, u.first_name,
           o.response->'item'->>'name' AS item_name,
           (o.response->'item'->>'price_stars')::int AS price,
           (o.response->>'chance')::numeric AS chance
    FROM operation_results o
    JOIN users u ON u.telegram_id = o.user_id
    WHERE o.operation_type = 'upgrade'
      AND o.status = 'completed'
      AND (o.response->>'success')::boolean = true
      AND o.created_at > NOW() - INTERVAL '30 minutes'
    ORDER BY RANDOM()
    LIMIT 1
  `);
  return res.rows[0] || null;
}

module.exports = {
  registerUser, getUser, calculateTier, claimSubscriptionItem, getUserInventoryCount,
  getReferralProgress, setTutorialCompleted, getUserDemoItemCount, ensureUserExists,
  getCatalogItems, getItemById, getUserInventory, addInventoryItem,
  buyItemWithBalance, buyItemsWithBalance, upgradeItem,
  sellInventoryItem, sellInventoryItemsBatch,
  createWithdrawRequest, refundWithdrawRequest, markWithdrawPaid, attachAdminMessage,
  grantDemo, revokeDemo, getDemoStatus,
  getRecentDrops,
  // BROADCAST
  touchUserActive, setBroadcastOptOut, getBroadcastOptOut,
  fetchBroadcastTargets, markBroadcastSent, getRandomActiveDrop,
};
