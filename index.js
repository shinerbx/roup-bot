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
const PRIVACY_POLICY_URL = 'https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-ispolzovaniya-RoUP-09-18';
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
const adminState = new Map(); // adminId → { action, targetId? }

const EMOJIS = [
  { name: 'пиццу 🍕', icon: '🍕' },
  { name: 'ракету 🚀', icon: '🚀' },
  { name: 'огонь 🔥', icon: '🔥' },
  { name: 'звезду ⭐', icon: '⭐' },
  { name: 'алмаз 💎', icon: '💎' }
];

function getMainMenu(ctx) {
  const rows = [
    [Markup.button.webApp('🎮 Играть', WEB_APP_URL)],
    ['👤 Профиль', '👥 Друзья'],
    ['🎁 Подарок', '🆘 Помощь']
  ];
  if (isAdmin(ctx)) rows.push(['⚙️ Админ-панель']);
  return Markup.keyboard(rows).resize();
}

function getAdminPanel() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Выдать demo-баланс', 'admin_demo_grant')],
    [Markup.button.callback('🚫 Отключить demo', 'admin_demo_revoke')],
    [Markup.button.callback('📊 Статус demo игрока', 'admin_demo_status')],
  ]);
}

// ═══════════════════════════════════════════════════════════════════════
// ANTI-SPAM MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════

bot.use(async (ctx, next) => {
  const isPaymentUpdate = Boolean(ctx.preCheckoutQuery || ctx.shippingQuery || ctx.message?.successful_payment);
  if (isPaymentUpdate) return next();

  const userId = ctx.from?.id;
  if (!userId) return next();
  const now = Date.now();
  const lastRequest = userCooldowns.get(userId) || 0;
  if (now - lastRequest < 500) {
    if (ctx.callbackQuery) return ctx.answerCbQuery('⏳ Не спамь так быстро!', { show_alert: false }).catch(() => {});
    return;
  }
  userCooldowns.set(userId, now);
  if (userCooldowns.size > 2000) {
    for (const [id, time] of userCooldowns.entries()) if (now - time > 10000) userCooldowns.delete(id);
  }
  return next();
});

// ═══════════════════════════════════════════════════════════════════════
// АДМИН-ПАНЕЛЬ
// ═══════════════════════════════════════════════════════════════════════

bot.hears('⚙️ Админ-панель', async (ctx) => {
  if (!isAdmin(ctx)) return;
  adminState.delete(ctx.from.id);

  await ctx.reply(
    `⚙️ <b>Админ-панель</b>\n\n` +
    `Управление demo-режимом игроков.\n` +
    `Demo автоматически включает lucky mode.`,
    { parse_mode: 'HTML', ...getAdminPanel() }
  ).catch(() => {});
});

bot.action('admin_panel', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа', { show_alert: true }).catch(() => {});
  adminState.delete(ctx.from.id);
  await ctx.editMessageText(
    `⚙️ <b>Админ-панель</b>\n\n` +
    `Управление demo-режимом игроков.\n` +
    `Demo автоматически включает lucky mode.`,
    { parse_mode: 'HTML', ...getAdminPanel() }
  ).catch(() => {});
  ctx.answerCbQuery().catch(() => {});
});

bot.action('admin_cancel', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
  adminState.delete(ctx.from.id);
  await ctx.editMessageText(
    `⚙️ <b>Админ-панель</b>\n\nОперация отменена.`,
    { parse_mode: 'HTML', ...getAdminPanel() }
  ).catch(() => {});
  ctx.answerCbQuery('Отменено').catch(() => {});
});

bot.action('admin_demo_grant', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа', { show_alert: true }).catch(() => {});
  adminState.set(ctx.from.id, { action: 'demo_id' });

  await ctx.editMessageText(
    `🎁 <b>Выдача demo-баланса</b>\n\n` +
    `Шаг 1/2. Введи <b>ID игрока</b> (число).\n\n` +
    `Чтобы отменить, отправь <code>/cancel</code> или нажми кнопку.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Отмена', 'admin_cancel')]])
    }
  ).catch(() => {});
  ctx.answerCbQuery().catch(() => {});
});

bot.action('admin_demo_revoke', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа', { show_alert: true }).catch(() => {});
  adminState.set(ctx.from.id, { action: 'demo_off_id' });

  await ctx.editMessageText(
    `🚫 <b>Отключение demo</b>\n\n` +
    `Введи <b>ID игрока</b>, у которого нужно откатить demo-баланс и удалить demo-предметы.\n\n` +
    `Чтобы отменить, отправь <code>/cancel</code> или нажми кнопку.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Отмена', 'admin_cancel')]])
    }
  ).catch(() => {});
  ctx.answerCbQuery().catch(() => {});
});

bot.action('admin_demo_status', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Нет доступа', { show_alert: true }).catch(() => {});
  adminState.set(ctx.from.id, { action: 'demo_status_id' });

  await ctx.editMessageText(
    `📊 <b>Статус demo</b>\n\n` +
    `Введи <b>ID игрока</b> для проверки.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Отмена', 'admin_cancel')]])
    }
  ).catch(() => {});
  ctx.answerCbQuery().catch(() => {});
});

bot.hears('/cancel', async (ctx) => {
  if (!isAdmin(ctx)) return;
  if (!adminState.has(ctx.from.id)) return;
  adminState.delete(ctx.from.id);
  await ctx.reply('❌ Операция отменена.', getAdminPanel()).catch(() => {});
});

// Текстовый обработчик шагов админ-флоу
bot.on('text', async (ctx, next) => {
  const uid = ctx.from?.id;
  if (!uid || !isAdmin(ctx)) return next();
  const state = adminState.get(uid);
  if (!state) return next();

  const text = String(ctx.message?.text || '').trim();
  if (!text || text.startsWith('/')) return next();

  if (state.action === 'demo_id') {
    const targetId = Number(text);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return ctx.reply('❌ ID должен быть целым положительным числом. Попробуй снова или отправь /cancel.').catch(() => {});
    }
    adminState.set(uid, { action: 'demo_amount', targetId });

    const target = await getUser(targetId);
    const balanceInfo = target
      ? `\nТекущий баланс: <b>${target.balance || 0} ⭐</b>`
      : '\n<i>Игрок ещё не открывал бота — запись появится при выдаче.</i>';

    return ctx.reply(
      `🎁 <b>Выдача demo-баланса</b>\n\n` +
      `Шаг 2/2. Игрок: <code>${targetId}</code>${balanceInfo}\n\n` +
      `Теперь введи <b>сумму</b> demo-баланса (целое, 1 — 1 000 000).\n` +
      `Lucky mode включится автоматически.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Отмена', 'admin_cancel')]])
      }
    ).catch(() => {});
  }

  if (state.action === 'demo_amount') {
    const amount = Number(text);
    if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
      return ctx.reply('❌ Сумма должна быть целым числом от 1 до 1 000 000. Попробуй снова или /cancel.').catch(() => {});
    }

    const result = await grantDemo(state.targetId, amount);
    adminState.delete(uid);

    if (result.error) {
      return ctx.reply(
        `❌ Ошибка выдачи: <b>${result.error}</b>`,
        { parse_mode: 'HTML', ...getAdminPanel() }
      ).catch(() => {});
    }

    return ctx.reply(
      `✅ <b>Demo-баланс выдан</b>\n\n` +
      `Игрок: <code>${result.userId}</code>\n` +
      `Начислено: <b>+${result.granted} ⭐</b>\n` +
      `Баланс до выдачи: ${result.preDemoBalance} ⭐\n` +
      `Баланс сейчас: <b>${result.newBalance} ⭐</b>\n` +
      `Lucky mode: <b>ON</b>\n` +
      `Вывод: <b>заблокирован</b>\n\n` +
      `Когда нужно будет откатить — используй «Отключить demo» в админ-панели.`,
      { parse_mode: 'HTML', ...getAdminPanel() }
    ).catch(() => {});
  }

  if (state.action === 'demo_off_id') {
    const targetId = Number(text);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return ctx.reply('❌ ID должен быть целым положительным числом. Попробуй снова или /cancel.').catch(() => {});
    }

    const result = await revokeDemo(targetId);
    adminState.delete(uid);

    if (result.error) {
      return ctx.reply(
        `❌ Ошибка отключения: <b>${result.error}</b>`,
        { parse_mode: 'HTML', ...getAdminPanel() }
      ).catch(() => {});
    }

    return ctx.reply(
      `✅ <b>Demo-режим отключён</b>\n\n` +
      `Игрок: <code>${result.userId}</code>\n` +
      `Был активен: ${result.wasActive ? 'да' : 'нет'}\n` +
      `Баланс откачен к: <b>${result.restoredBalance} ⭐</b>\n` +
      `Удалено demo-предметов: <b>${result.removedItems}</b>\n` +
      `Lucky mode: <b>OFF</b>\n` +
      `Вывод: <b>разблокирован</b>`,
      { parse_mode: 'HTML', ...getAdminPanel() }
    ).catch(() => {});
  }

  if (state.action === 'demo_status_id') {
    const targetId = Number(text);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return ctx.reply('❌ ID должен быть целым положительным числом. Попробуй снова или /cancel.').catch(() => {});
    }

    const s = await getDemoStatus(targetId);
    adminState.delete(uid);

    if (s.error) {
      return ctx.reply(
        `❌ Ошибка: <b>${s.error}</b>`,
        { parse_mode: 'HTML', ...getAdminPanel() }
      ).catch(() => {});
    }

    return ctx.reply(
      `📊 <b>Demo-статус игрока</b>\n\n` +
      `ID: <code>${s.userId}</code>\n` +
      `Demo активно: <b>${s.active ? 'ДА' : 'нет'}</b>\n` +
      `Lucky mode: <b>${s.luckyMode ? 'ON' : 'OFF'}</b>\n` +
      `Баланс сейчас: <b>${s.balance} ⭐</b>\n` +
      `Снапшот до demo: ${s.preDemoBalance != null ? `${s.preDemoBalance} ⭐` : '—'}`,
      { parse_mode: 'HTML', ...getAdminPanel() }
    ).catch(() => {});
  }

  return next();
});

// ── Быстрые команды ─────────────────────────────────────────────────
bot.command('demo', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = (ctx.message.text || '').split(/\s+/).slice(1);
  let targetId = null;
  let amount = null;

  if (ctx.message.reply_to_message?.from?.id) {
    targetId = ctx.message.reply_to_message.from.id;
    amount = Number(args[0]);
  } else if (args.length === 2) {
    targetId = Number(args[0]);
    amount = Number(args[1]);
  } else if (args.length === 1) {
    targetId = ctx.from.id;
    amount = Number(args[0]);
  }

  if (!Number.isInteger(targetId) || targetId <= 0 || !Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
    return ctx.reply('❌ Формат: /demo <userId> <amount>, либо ответом: /demo <amount>').catch(() => {});
  }

  const result = await grantDemo(targetId, amount);
  if (result.error) return ctx.reply(`❌ Ошибка: ${result.error}`).catch(() => {});

  ctx.reply(
    `✅ Demo выдан игроку <code>${result.userId}</code>\n` +
    `+${result.granted} ⭐ · Итог: <b>${result.newBalance} ⭐</b> · Lucky ON`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

bot.command('demo_off', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = (ctx.message.text || '').split(/\s+/).slice(1);
  let targetId = ctx.message.reply_to_message?.from?.id || (args.length === 1 ? Number(args[0]) : ctx.from.id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return ctx.reply('❌ Формат: /demo_off <userId> или ответом на сообщение.').catch(() => {});
  }

  const r = await revokeDemo(targetId);
  if (r.error) return ctx.reply(`❌ Ошибка: ${r.error}`).catch(() => {});

  ctx.reply(
    `✅ Demo отключён у <code>${r.userId}</code>\n` +
    `Баланс откачен к <b>${r.restoredBalance} ⭐</b> · Удалено предметов: ${r.removedItems}`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

bot.command('demo_status', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const args = (ctx.message.text || '').split(/\s+/).slice(1);
  let targetId = ctx.message.reply_to_message?.from?.id || (args.length === 1 ? Number(args[0]) : ctx.from.id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return ctx.reply('❌ Формат: /demo_status <userId>').catch(() => {});
  }

  const s = await getDemoStatus(targetId);
  if (s.error) return ctx.reply(`❌ Ошибка: ${s.error}`).catch(() => {});

  ctx.reply(
    `📊 <b>Demo-статус</b>\n\n` +
    `ID: <code>${s.userId}</code>\n` +
    `Активно: <b>${s.active ? 'ДА' : 'нет'}</b>\n` +
    `Lucky mode: <b>${s.luckyMode ? 'ON' : 'OFF'}</b>\n` +
    `Баланс: <b>${s.balance} ⭐</b>\n` +
    `Снапшот до demo: ${s.preDemoBalance != null ? `${s.preDemoBalance} ⭐` : '—'}`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════
// ОБЫЧНЫЕ ХЕНДЛЕРЫ
// ═══════════════════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  try {
    const existingUser = await getUser(ctx.from.id);
    if (existingUser && existingUser.accepted_tos) {
      return ctx.reply('С возвращением в <b>RoUP</b>! ⚡️', { parse_mode: 'HTML', ...getMainMenu(ctx) });
    }

    let referrerId = null;
    if (ctx.startPayload?.startsWith('ref_')) referrerId = ctx.startPayload.replace('ref_', '');

    const target = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const shuffled = [...EMOJIS].sort(() => 0.5 - Math.random()).slice(0, 4);
    if (!shuffled.some((e) => e.icon === target.icon)) {
      shuffled[0] = target;
      shuffled.sort(() => 0.5 - Math.random());
    }
    pendingUsers.set(ctx.from.id, { targetIcon: target.icon, referrerId });

    const buttons = shuffled.map((e) => Markup.button.callback(e.icon, `captcha_${e.icon}`));
    return ctx.reply(
      `🛡 <b>Проверка безопасности</b>\n\nПожалуйста, подтверди, что ты не бот.\nНажми на: <b>${target.name}</b>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([buttons]) }
    );
  } catch (err) { console.error('Ошибка в /start:', err.message); }
});

bot.action(/captcha_(.+)/, async (ctx) => {
  try {
    const selectedIcon = ctx.match[1];
    const pending = pendingUsers.get(ctx.from.id);
    if (!pending) return ctx.answerCbQuery('Сессия устарела. Нажми /start снова.').catch(() => {});
    if (selectedIcon !== pending.targetIcon) return ctx.answerCbQuery('❌ Неверно! Попробуй снова.', { show_alert: true }).catch(() => {});
    await ctx.answerCbQuery('✅ Верно!').catch(() => {});

    const tosText =
      `📜 <b>Пользовательское соглашение</b>\n\n` +
      `Добро пожаловать в <b>RoUP</b> ⚡️\n\n` +
      `Перед началом использования ознакомься с правилами сервиса:\n` +
      `• Сервис предназначен для развлекательных целей.\n` +
      `• Запрещено использовать баги и уязвимости бота.\n\n` +
      `Нажимая «Принимаю условия», вы соглашаетесь с правилами.`;

    ctx.editMessageText(tosText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📖 Читать правила и соглашение', PRIVACY_POLICY_URL)],
        [Markup.button.callback('✅ Принимаю условия', 'accept_tos')]
      ])
    }).catch(() => {});
  } catch (err) { console.error('Ошибка в captcha:', err.message); }
});

bot.action('accept_tos', async (ctx) => {
  const lockKey = `tos_${ctx.from.id}`;
  if (actionLocks.has(lockKey)) return;
  actionLocks.add(lockKey);
  try {
    const pending = pendingUsers.get(ctx.from.id) || {};
    const { rewardedReferrerId } = await registerUser(ctx.from, pending.referrerId);
    pendingUsers.delete(ctx.from.id);
    await ctx.answerCbQuery('🎉 Условия приняты!').catch(() => {});

    if (rewardedReferrerId) {
      const progress = await getReferralProgress(rewardedReferrerId);
      bot.telegram.sendMessage(
        rewardedReferrerId,
        `🎉 Твой друг <b>${ctx.from.first_name}</b> завершил регистрацию!\n` +
        `🎁 В твой инвентарь добавлен стартовый предмет стоимостью <b>5-10 ⭐</b>.\n\n` +
        `📊 Реферальный прогресс:\n` +
        `⭐ Premium: <b>${progress.premium}/5</b>\n` +
        `👤 Без Premium: <b>${progress.regular}/10</b>\n` +
        (progress.canWithdraw ? `\n✅ <b>Вывод предметов разблокирован.</b>` : `\n🔒 Осталось: ${progress.premiumRemaining} Premium или ${progress.regularRemaining} обычных.`),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 Открыть RoUP', WEB_APP_URL)]]) }
      ).catch(() => {});
    }

    await ctx.deleteMessage().catch(() => {});
    ctx.reply('Привет 👋\nЭто <b>RoUP</b> — тот самый роблокс апгрейдер ⚡️\n\n👇 Выбери кнопку в меню 👇', {
      parse_mode: 'HTML', ...getMainMenu(ctx)
    }).catch(() => {});
  } catch (err) { console.error('Ошибка в accept_tos:', err.message); }
  finally { actionLocks.delete(lockKey); }
});

bot.hears('👤 Профиль', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');
    const tier = calculateTier(user);
    const itemsCount = await getUserInventoryCount(ctx.from.id);
    const progress = await getReferralProgress(ctx.from.id);
    const referralStatus = progress.canWithdraw
      ? '✅ Вывод предметов разблокирован.'
      : `🔒 Ещё ${progress.premiumRemaining} Premium или ${progress.regularRemaining} пользователей без Premium.`;

    const profileText =
      `📊 <b>Статистика аккаунта:</b>\n\n` +
      `🆔 <b>ID:</b> <code>${user.telegram_id}</code>\n` +
      `🏅 <b>Уровень:</b> ${tier}\n` +
      `🎒 <b>Предметов в инвентаре:</b> ${itemsCount} шт.\n` +
      `👥 <b>Всего приглашено:</b> ${progress.total}\n` +
      `⭐ <b>Premium:</b> ${progress.premium}/5\n` +
      `👤 <b>Без Premium:</b> ${progress.regular}/10\n` +
      `${referralStatus}\n` +
      `💰 <b>Игровой баланс:</b> ${user.balance} ⭐\n` +
      `📅 <b>Дата регистрации:</b> ${String(user.created_at).split(' ')[0]}`;

    ctx.reply(profileText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть инвентарь и каталог', WEB_APP_URL)]])
    }).catch(() => {});
  } catch (err) { console.error('Ошибка в Профиль:', err.message); }
});

bot.hears('🎁 Подарок', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');
    if (user.subscribed_reward_claimed) return ctx.reply('✅ Ты уже получил свой стартовый предмет за подписку!');
    const giftText =
      `🎁 <b>Бесплатный предмет за подписку!</b>\n\n` +
      `Подпишись на наш канал ${CHANNEL_USERNAME}, чтобы мгновенно получить случайный Roblox-предмет стоимостью <b>от 5 до 10 ⭐</b>!`;
    ctx.reply(giftText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📢 Подписаться на канал', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
        [Markup.button.callback('✅ Проверить подписку', 'check_subscription')]
      ])
    }).catch(() => {});
  } catch (err) { console.error('Ошибка в Подарок:', err.message); }
});

bot.action('check_subscription', async (ctx) => {
  const lockKey = `sub_${ctx.from.id}`;
  if (actionLocks.has(lockKey)) return ctx.answerCbQuery('Проверка уже идет...').catch(() => {});
  actionLocks.add(lockKey);
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    const valid = ['member', 'administrator', 'creator'].includes(member.status);
    if (!valid) return ctx.answerCbQuery('❌ Сначала подпишись на канал!', { show_alert: true }).catch(() => {});
    const rewardedItem = await claimSubscriptionItem(ctx.from.id);
    if (!rewardedItem) return ctx.answerCbQuery('Вы уже забирали этот предмет.', { show_alert: true }).catch(() => {});
    await ctx.answerCbQuery('🎉 Награда получена!', { show_alert: true }).catch(() => {});
    ctx.editMessageText(
      `🎉 <b>Поздравляем!</b>\n\nТы получил предмет: <b>${rewardedItem.name}</b>\nСтоимость: <b>${rewardedItem.price_stars} ⭐</b>\n\nОн уже добавлен в твой инвентарь.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.webApp('🎒 Открыть инвентарь', WEB_APP_URL)]]) }
    ).catch(() => {});
  } catch (err) {
    console.error('Ошибка проверки подписки:', err.message);
    ctx.answerCbQuery('Ошибка проверки. Попробуй через пару секунд.', { show_alert: true }).catch(() => {});
  } finally { actionLocks.delete(lockKey); }
});

bot.hears('👥 Друзья', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');
    const progress = await getReferralProgress(ctx.from.id);
    const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${ctx.from.id}`;
    const status = progress.canWithdraw
      ? '✅ <b>Вывод предметов разблокирован.</b>'
      : `🔒 <b>Вывод пока недоступен.</b> Пригласи ещё <b>${progress.premiumRemaining}</b> Premium или <b>${progress.regularRemaining}</b> пользователей без Premium.`;
    const text =
      `👥 <b>Реферальная программа</b>\n\n` +
      `За приглашённого друга в инвентарь начисляется стартовый предмет.\n\n` +
      `📊 Всего приглашено: <b>${progress.total}</b>\n` +
      `⭐ Premium: <b>${progress.premium}/5</b>\n` +
      `👤 Без Premium: <b>${progress.regular}/10</b>\n\n` +
      `${status}\n\n🔗 Твоя ссылка:\n<code>${refLink}</code>`;
    ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.switchToChat('📲 Пригласить друга', '')],
        [Markup.button.webApp('🎮 Открыть RoUP', WEB_APP_URL)]
      ])
    }).catch(() => {});
  } catch (err) { console.error('Ошибка в Друзья:', err.message); }
});

bot.on('inline_query', async (ctx) => {
  const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${ctx.from.id}`;
  const caption = `⚡️ <b>Заходи в RoUP и забирай бесплатный Roblox скин!</b>\n\n🎁 Переходи по ссылке и получай стартовый предмет стоимостью от 5 до 10 ⭐:`;
  return ctx.answerInlineQuery([{
    type: 'photo', id: 'invite_card', photo_url: SHARE_BANNER_URL, thumb_url: SHARE_BANNER_URL,
    caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🚀 Забрать скин', url: refLink }]] }
  }], { cache_time: 0 });
});

bot.hears('🆘 Помощь', (ctx) => ctx.reply(
  `❓ <b>Техническая поддержка</b>\n\nПо всем вопросам и проблемам с предметами:\n👉 @roup_support`,
  { parse_mode: 'HTML' }
).catch(() => {}));

// ── Callback-кнопки заявок на вывод ─────────────────────────────────
bot.action(/^wr:(paid|reject):(\d+)$/, async (ctx) => {
  const action = ctx.match[1];
  const requestId = Number(ctx.match[2]);

  if (!ADMIN_CHAT_ID || String(ctx.from.id) !== String(ADMIN_CHAT_ID)) {
    return ctx.answerCbQuery('Нет доступа', { show_alert: true }).catch(() => {});
  }

  try {
    if (action === 'paid') {
      const ok = await markWithdrawPaid(requestId);
      await ctx.answerCbQuery(ok ? '✅ Отмечено как выплачено' : 'Заявка уже обработана').catch(() => {});
    } else if (action === 'reject') {
      const r = await refundWithdrawRequest(requestId, 'rejected_by_admin');
      await ctx.answerCbQuery(r.error ? `Ошибка: ${r.error}` : '↩️ Возвращено на баланс').catch(() => {});
    }
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  } catch (err) {
    console.error('Ошибка обработки wr callback:', err.message);
    ctx.answerCbQuery('Ошибка сервера').catch(() => {});
  }
});

// ── Payments ────────────────────────────────────────────────────────
bot.on('pre_checkout_query', async (ctx) => {
  const payload = String(ctx.preCheckoutQuery?.invoice_payload || '');
  console.log('💳 pre_checkout_query от', ctx.from?.id, payload);
  try {
    if (!payload.startsWith('support_')) {
      return ctx.answerPreCheckoutQuery(false, 'Этот платёж больше не используется.').catch(() => {});
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) { console.error('Ошибка pre_checkout_query:', err.message); }
});

bot.on('message', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;
  console.log('💳 successful_payment от', ctx.from?.id, payment.invoice_payload, payment.total_amount, payment.currency);

  const payload = String(payment.invoice_payload || '');
  if (payload.startsWith('support_')) {
    await ctx.reply(
      `❤️ <b>Спасибо за поддержку RoUP!</b>\n\n` +
      `Получено: <b>${payment.total_amount} ⭐ Telegram Stars</b>.\n` +
      `Это поддержка проекта: <b>игровой баланс не изменён</b> и игровая валюта не начислена.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 Открыть RoUP', WEB_APP_URL)]]) }
    ).catch(() => {});
    return;
  }

  if (payload.startsWith('topup_')) console.warn('⚠️ Старый topup-платёж: баланс не изменён:', payload);
});

bot.command('paysupport', (ctx) => ctx.reply(
  `💳 <b>Поддержка по платежам</b>\n\nЕсли вопрос связан с оплатой Telegram Stars, напиши: @roup_support`,
  { parse_mode: 'HTML' }
).catch(() => {}));

bot.catch((err, ctx) => console.error(`Ошибка у пользователя ${ctx.from?.id}:`, err.message));
process.on('uncaughtException', (err) => console.error('Критическая ошибка (UncaughtException):', err.message));
process.on('unhandledRejection', (reason) => console.error('Необработанный промис (UnhandledRejection):', reason));

// ═══════════════════════════════════════════════════════════════════════
// HTTP-СЕРВЕР
// ═══════════════════════════════════════════════════════════════════════

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// CORS + security headers
app.use((req, res, next) => {
  const allowedOrigin = process.env.WEB_APP_URL || '';
  const origin = req.get('Origin');
  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Compression: gzip/brotli для текстовых ответов
app.use(compression({
  threshold: 512,
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// Body parser — 64kb хватает с запасом
app.use(express.json({ limit: '64kb' }));

// Логгер API-запросов (сокращённый: только в dev или долгие запросы)
app.use('/api', (req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const dt = Date.now() - t0;
    if (!IS_PROD || dt > 200 || res.statusCode >= 400) {
      const hasInit = Boolean(req.header('X-Telegram-Init-Data'));
      console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} ${dt}ms init=${hasInit}`);
    }
  });
  next();
});

// Диагностический endpoint намеренно удалён: он не должен раскрывать ADMIN_CHAT_ID/whitelist публично.

// Вебхук Telegram
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
  || crypto.createHash('sha256').update(BOT_TOKEN || 'missing-token').digest('hex');
const WEBHOOK_PATH = `/telegraf/${encodeURIComponent(WEBHOOK_SECRET)}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));

// Webapp router
app.use('/api', createWebappRouter(bot, BOT_TOKEN));

// Health
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.json({ ok: true, service: 'roup', uptime: process.uptime() }));

// Статика
const webappDist = path.join(__dirname, 'webapp', 'dist');

app.use(express.static(webappDist, {
  maxAge: '30d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/telegraf')) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.sendFile(path.join(webappDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[express] unhandled error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server_error' });
});

// ═══════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`Render HTTP-сервер активен на порту ${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
  if (!ADMIN_CHAT_ID) console.warn('⚠️ ADMIN_CHAT_ID не задан — заявки на вывод и админ-панель недоступны.');

  try {
    const fullWebhookUrl = `${WEB_APP_URL}${WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`Вебхук Telegram зарегистрирован: ${fullWebhookUrl}`);
  } catch (err) {
    console.error('Ошибка регистрации вебхука:', err.message);
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, closing...`);
  server.close(() => {
    console.log('[shutdown] http server closed');
    bot.stop(signal);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref?.();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Anti-sleep ping (Render free tier)
if (WEB_APP_URL && !WEB_APP_URL.includes('localhost')) {
  const pingInterval = setInterval(() => {
    fetch(`${WEB_APP_URL}/ping`).catch(() => {});
  }, 4 * 60 * 1000);
  pingInterval.unref?.();
}
