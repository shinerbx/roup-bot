const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const {
  registerUser,
  getUser,
  calculateTier,
  claimSubscriptionItem,
  getUserInventoryCount,
  getReferralProgress,
  refundWithdrawRequest,
  markWithdrawPaid
} = require('./db');
const { createWebappRouter } = require('./webapp-api');
const { registerBot } = require('./admin-notify');

// Telegram Bot API token хранится только в Render Environment Variables.
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) console.error('❌ Не задана переменная окружения BOT_TOKEN — бот не запустится.');

const BOT_USERNAME = 'roupgrade_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://roup-bot.onrender.com';
const CHANNEL_USERNAME = '@ro_upgrade';
const SHARE_BANNER_URL = 'https://i.ibb.co/Fq6L8G16/7007-D8-FC-C59-A-4-F72-B1-AB-C63-DFAA2-F87-A.png';
const PRIVACY_POLICY_URL = 'https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-programmy-loyalnosti-RoUP-09-16';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(BOT_TOKEN);
registerBot(bot);

const pendingUsers = new Map();
const userCooldowns = new Map();
const actionLocks = new Set();

const EMOJIS = [
  { name: 'пиццу 🍕', icon: '🍕' },
  { name: 'ракету 🚀', icon: '🚀' },
  { name: 'огонь 🔥', icon: '🔥' },
  { name: 'звезду ⭐', icon: '⭐' },
  { name: 'алмаз 💎', icon: '💎' }
];

const getMainMenu = () => Markup.keyboard([
  [Markup.button.webApp('🎮 Играть', WEB_APP_URL)],
  ['👤 Профиль', '👥 Друзья'],
  ['🎁 Подарок', '🆘 Помощь']
]).resize();

bot.use(async (ctx, next) => {
  // pre_checkout_query должен быть обработан максимум за 10 секунд, поэтому
  // платёжные апдейты не попадают под обычный антиспам-кулдаун.
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

bot.start(async (ctx) => {
  try {
    const existingUser = await getUser(ctx.from.id);
    if (existingUser && existingUser.accepted_tos) {
      return ctx.reply('С возвращением в <b>RoUP</b>! ⚡️', { parse_mode: 'HTML', ...getMainMenu() });
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
      parse_mode: 'HTML', ...getMainMenu()
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

    ctx.reply(profileText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть инвентарь и каталог', WEB_APP_URL)]]) }).catch(() => {});
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
    ctx.reply(giftText, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.url('📢 Подписаться на канал', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
      [Markup.button.callback('✅ Проверить подписку', 'check_subscription')]
    ]) }).catch(() => {});
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
    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.switchToChat('📲 Пригласить друга', '')],
      [Markup.button.webApp('🎮 Открыть RoUP', WEB_APP_URL)]
    ]) }).catch(() => {});
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

bot.hears('🆘 Помощь', (ctx) => ctx.reply(`❓ <b>Техническая поддержка</b>\n\nПо всем вопросам и проблемам с предметами:\n👉 @roup_support`, { parse_mode: 'HTML' }).catch(() => {}));

// ── Callback-кнопки заявок на вывод (только для админа) ──────────────
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

// ---------- Telegram Stars: ТОЛЬКО поддержка проекта ----------
bot.on('pre_checkout_query', async (ctx) => {
  const payload = String(ctx.preCheckoutQuery?.invoice_payload || '');
  console.log('💳 pre_checkout_query от', ctx.from?.id, payload);
  try {
    // Принимаем только новые support-инвойсы. Старый topup нельзя проводить.
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

  // Старые topup-инвойсы не дают права на начисление баланса.
  if (payload.startsWith('topup_')) console.warn('⚠️ Старый topup-платёж: баланс не изменён:', payload);
});

bot.command('paysupport', (ctx) => ctx.reply(
  `💳 <b>Поддержка по платежам</b>\n\nЕсли вопрос связан с оплатой Telegram Stars, напиши: @roup_support`,
  { parse_mode: 'HTML' }
).catch(() => {}));

bot.catch((err, ctx) => console.error(`Ошибка у пользователя ${ctx.from?.id}:`, err.message));
process.on('uncaughtException', (err) => console.error('Критическая ошибка (UncaughtException):', err.message));
process.on('unhandledRejection', (reason) => console.error('Необработанный промис (UnhandledRejection):', reason));

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const allowedOrigin = process.env.WEB_APP_URL || '';
  const origin = req.get('Origin');
  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '64kb' }));

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.createHash('sha256').update(BOT_TOKEN || 'missing-token').digest('hex');
const WEBHOOK_PATH = `/telegraf/${encodeURIComponent(WEBHOOK_SECRET)}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));
app.use('/api', createWebappRouter(bot, BOT_TOKEN));
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.json({ ok: true, service: 'roup' }));

const webappDist = path.join(__dirname, 'webapp', 'dist');

// ---------- Настройка кэширования для статики (включая картинки) ----------
app.use(express.static(webappDist, {
  maxAge: '30d', // Заставляем Telegram кэшировать картинки на 30 дней
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      // HTML файл не кэшируем, чтобы у игроков всегда была последняя версия кода
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/telegraf')) return res.status(404).json({ error: 'Маршрут API не найден' });
  res.sendFile(path.join(webappDist, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Render HTTP-сервер активен на порту ${PORT}`);
  if (!ADMIN_CHAT_ID) console.warn('⚠️ ADMIN_CHAT_ID не задан — заявки на вывод не будут приходить админу.');
  try {
    const fullWebhookUrl = `${WEB_APP_URL}${WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`Вебхук Telegram зарегистрирован: ${fullWebhookUrl}`);
  } catch (err) { console.error('Ошибка регистрации вебхука:', err.message); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

if (WEB_APP_URL && !WEB_APP_URL.includes('localhost')) {
  setInterval(() => { fetch(`${WEB_APP_URL}/ping`).catch(() => {}); }, 4 * 60 * 1000);
}