const Database = require('better-sqlite3');
const db = new Database('database.db');
const catalogItems = require('./catalog');

// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    balance INTEGER DEFAULT 0,
    upgrades_count INTEGER DEFAULT 0,
    is_vip INTEGER DEFAULT 0,
    subscribed_reward_claimed INTEGER DEFAULT 0,
    invited_by INTEGER DEFAULT NULL,
    referrals_count INTEGER DEFAULT 0,
    accepted_tos INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    price_stars INTEGER NOT NULL,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS user_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(telegram_id),
    FOREIGN KEY(item_id) REFERENCES items(id)
  );
`);

// Синхронизация каталога: добавляет новые или обновляет цены/категории существующих
function syncCatalog() {
  const upsertStmt = db.prepare(`
    INSERT INTO items (name, category, price_stars, image_url)
    VALUES (@name, @category, @price_stars, @image_url)
    ON CONFLICT(name) DO UPDATE SET
      category = excluded.category,
      price_stars = excluded.price_stars,
      image_url = excluded.image_url
  `);

  const syncTx = db.transaction((items) => {
    for (const item of items) {
      upsertStmt.run(item);
    }
  });

  syncTx(catalogItems);
}

// Запускаем синхронизацию при старте
syncCatalog();

// Регистрация пользователя после капчи и ToS
function registerUser(tgUser, referrerId = null) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgUser.id);
  let successfulReferrer = null;

  if (!user) {
    if (referrerId && Number(referrerId) !== tgUser.id) {
      const refCheck = db.prepare('SELECT telegram_id FROM users WHERE telegram_id = ?').get(referrerId);
      if (refCheck) successfulReferrer = referrerId;
    }

    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, invited_by, accepted_tos)
      VALUES (?, ?, ?, ?, 1)
    `).run(tgUser.id, tgUser.username || null, tgUser.first_name, successfulReferrer);

    if (successfulReferrer) {
      db.prepare('UPDATE users SET referrals_count = referrals_count + 1 WHERE telegram_id = ?').run(successfulReferrer);
      giveRandomStarterItem(successfulReferrer);
    }

    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgUser.id);
  }

  return { user, rewardedReferrerId: successfulReferrer };
}

// Выдать случайный предмет диапазона 5-10 звезд (выберет из твоих аксессуаров по 5 звёзд)
function giveRandomStarterItem(userId) {
  const item = db.prepare(`
    SELECT * FROM items 
    WHERE price_stars BETWEEN 5 AND 10 
    ORDER BY RANDOM() 
    LIMIT 1
  `).get();

  if (item) {
    db.prepare('INSERT INTO user_inventory (user_id, item_id) VALUES (?, ?)').run(userId, item.id);
  }
  return item;
}

// Получить награду за подписку
function claimSubscriptionItem(userId) {
  const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(userId);
  if (!user || user.subscribed_reward_claimed) return null;

  const item = giveRandomStarterItem(userId);
  db.prepare('UPDATE users SET subscribed_reward_claimed = 1 WHERE telegram_id = ?').run(userId);
  return item;
}

// Получить предметы по категории (пригодится для Web App)
function getItemsByCategory(category) {
  return db.prepare('SELECT * FROM items WHERE category = ? ORDER BY price_stars ASC').all(category);
}

// Получить весь каталог
function getAllItems() {
  return db.prepare('SELECT * FROM items ORDER BY price_stars ASC').all();
}

function getUserInventoryCount(userId) {
  return db.prepare('SELECT count(*) as count FROM user_inventory WHERE user_id = ?').get(userId).count;
}

function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function calculateTier(user) {
  if (user.is_vip) return '👑 VIP';
  if (user.upgrades_count >= 10000) return '🔥 Pro';
  return '🥉 Базовый';
}

module.exports = {
  registerUser,
  getUser,
  calculateTier,
  claimSubscriptionItem,
  giveRandomStarterItem,
  getUserInventoryCount,
  getItemsByCategory,
  getAllItems
};