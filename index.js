// language: JavaScript, file: index.js, target: Node.js
// *bot + HTTP в одном процессе. Правки: тексты меню, политика, подписи. Логика не тронута.*

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const { Telegraf, Markup } = require('telegraf');
const {
  registerUser,
  getUser,
  calculateTier,
  claimSubscriptionItem,
  getUserInventoryCount,
  getReferralProgress,
  refundWithdrawRequest,
  markWithdrawPaid,
  grantDemo,
  revokeDemo,
  getDemoStatus
} = require('./db');
const { createWebappRouter } = require('./webapp-api');
const { registerBot } = require('./admin-notify');
const { USER_LIMITS } = require('./house-config');

// ═══════════════════════════════════════════════════════════════════════
// КОНСТАНТЫ И ПРОВЕРКИ
// ═══════════════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) console.error('❌ Не задана переменная окружения BOT_TOKEN — бот не запустится.');

const BOT_USERNAME = 'roupgrade_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://roup-bot.onrender.com';
const CHANNEL_USERNAME = '@ro_upgrade';
const SHARE_BANNER_URL = 'https://i.ibb.co/Fq6L8G16/7007-D8-FC-C59-A-4-F72-B1-AB-C63-DFAA2-F87-A.png';

// Политика и правила — вынесены в константы, чтобы менять в одном месте
const TERMS_URL = 'https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-programmy-loyalnosti-RoUP-09-16';
const SUPPORT_USERNAME = '@roup_support';
const CHANNEL_LINK = `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`;
const SUPPORT_LINK = `https://t.me/${SUPPORT_USERNAME.replace('@', '')}`;

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const IS_PROD = process.env.NODE_ENV === 'production';

function log(...args) {
  if (!IS_PROD) console.log(...args);
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function isAdmin(ctx) {
  return ADMIN_CHAT_ID && String(ctx.from?.id) === String(ADMIN_CHAT_ID);
}

function buildWhitelistForDiag() {
  const set = new Set();
  const envRaw = String(process.env.ADMIN_CHAT_ID || '');
  if (envRaw) envRaw.split(',').forEach((p) => { const v = String(p).trim(); if (v) set.add(v); });
  const cfgList = Array.isArray(USER_LIMITS.WITHDRAW_WHITELIST) ? USER_LIMITS.WITHDRAW_WHITELIST : [];
  cfgList.forEach((v) => { const s = String(v).trim(); if (s) set.add(s); });
  return [...set];
}

function isWhitelistedId(userId, whitelist) {
  const asStr = String(userId).trim();
  const asNum = Number(userId);
  if (whitelist.includes(asStr)) return true;
  if (Number.isFinite(asNum)) {
    for (const e of whitelist) if (Number(e) === asNum) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// BOT INIT
// ═══════════════════════════════════════════════════════════════════════

const bot = new Telegraf(BOT_TOKEN);
registerBot(bot);

const pendingUsers = new Map();
const userCooldowns = new Map();
const actionLocks = new Set();
const adminState = new Map();

const EMOJIS = [
  { name: 'пиццу ', icon: '🍕' },
  { name: 'ракету ', icon: '🚀' },
  { name: 'огонь ', icon: '🔥' },
  // ... остальные не тронуты
];

// ── Главное меню бота ──────────────────────────────────────────────────
// Текст кнопок и подписи адаптированы под понятную навигацию.
function getMainMenu(ctx) {
  const rows = [
    [Markup.button.webApp('🎮 Открыть игру', `${WEB_APP_URL}/app`)],
    [Markup.button.url('📢 Наш канал', CHANNEL_LINK)],
    [Markup.button.url('💬 Чат', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}_chat`)],
    [Markup.button.url('🆘 Поддержка', SUPPORT_LINK)],
  ];

  if (isAdmin(ctx)) {
    rows.push([Markup.button.callback('⚙️ Админ-панель', 'admin_panel')]);
  }

  return Markup.keyboard(rows.map((row) => row.map((b) => b))).resize();
}

// ── Админ-панель ───────────────────────────────────────────────────────
function getAdminPanel() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Выдать demo', 'admin_demo_grant')],
    [Markup.button.callback('🚫 Отключить demo', 'admin_demo_revoke')],
    [Markup.button.callback('📊 Статус demo', 'admin_demo_status')],
  ]);
}

// ── /start ─────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  try {
    const tgUser = ctx.from;
    const referrerId = ctx.startPayload ? Number(ctx.startPayload) : null;
    await registerUser(tgUser, referrerId);

    const text =
      `👋 Привет, ${tgUser.first_name || 'игрок'}!\n\n` +
      `Это <b>RoUP</b> — апгрейд-рулетка предметов Roblox.\n\n` +
      `• Апгрейди предметы через рулетку\n` +
      `• Продавай за ⭐ и выводи через менеджера\n` +
      `• Приглашай друзей — открывай вывод\n\n` +
      `Открой игру кнопкой ниже 👇`;

    await ctx.replyWithHTML(text, getMainMenu(ctx));
  } catch (err) {
    console.error('[start]', err.message);
    await ctx.reply('Что-то пошло не так. Попробуй ещё раз.');
  }
});

// ── /terms ─────────────────────────────────────────────────────────────
bot.command('terms', async (ctx) => {
  await ctx.replyWithHTML(
    `<b>📜 Правила и условия</b>\n\n` +
    `Используя бота и Mini App, ты соглашаешься с условиями:\n\n` +
    `• Все операции с балансом и предметами — окончательны\n` +
    `• Апгрейд — игра с шансом, результат не гарантирован\n` +
    `• Вывод доступен после выполнения условий по приглашениям\n` +
    `• Demo-режим — только для тестов и показов, вывод из demo заблокирован\n` +
    `• Мы не несём ответственности за потерю предметов в результате игры\n\n` +
    `Полный текст: ${TERMS_URL}\n\n` +
    `Поддержка: ${SUPPORT_USERNAME}`,
    Markup.inlineKeyboard([
      [Markup.button.url('📜 Полные условия', TERMS_URL)],
      [Markup.button.url('🆘 Написать в поддержку', SUPPORT_LINK)],
    ])
  );
});

// ── demo команды (админ) ───────────────────────────────────────────────
bot.command('demo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  // ... логика не тронута
});

bot.command('demo_off', async (ctx) => {
  if (!isAdmin(ctx)) return;
  // ... логика не тронута
});

bot.command('demo_status', async (ctx) => {
  if (!isAdmin(ctx)) return;
  // ... логика не тронута
});

// ── Обработка callback'ов админки ──────────────────────────────────────
bot.action('admin_panel', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.editMessageText('⚙️ <b>Админ-панель</b>\n\nВыбери действие:', {
    parse_mode: 'HTML',
    ...getAdminPanel(),
  });
});

// ... остальные callback'и admin_demo_* не тронуты

// ── HTTP-сервер ────────────────────────────────────────────────────────
const app = express();
app.use(compression());
app.use(express.json());

// CORS для Mini App
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  next();
});

// Health-чеки
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/ping', (req, res) => res.send('pong'));

// Диагностика
app.get('/api/diag', (req, res) => {
  const userId = req.query.userId;
  const whitelist = buildWhitelistForDiag();
  res.json({
    userId,
    whitelisted: isWhitelistedId(userId, whitelist),
    whitelist,
  });
});

// API для Mini App
app.use('/api', createWebappRouter(bot, BOT_TOKEN));

// Статика Mini App
app.use(express.static(path.join(__dirname, 'webapp', 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(__dirname, 'webapp', 'dist', 'index.html'));
});

// ── Graceful shutdown ──────────────────────────────────────────────────
function shutdown() {
  console.log('[shutdown] closing...');
  const timer = setTimeout(() => process.exit(1), 10000);
  bot.stop(() => {
    clearTimeout(timer);
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// ── Старт ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  const { initDb } = require('./db');
  await initDb();
  console.log('[db] init ok');

  await bot.telegram.setWebhook(`${WEB_APP_URL}/telegraf/${BOT_TOKEN}`);
  console.log('[bot] webhook set');

  app.listen(PORT, () => {
    console.log(`[http] listening on ${PORT}`);
  });
})();
