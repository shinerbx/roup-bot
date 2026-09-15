const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const {
  registerUser,
  getUser,
  calculateTier,
  claimSubscriptionItem,
  getUserInventoryCount,
  addInventoryItem
} = require('./db');
const { createWebappRouter } = require('./webapp-api');

const BOT_TOKEN = '8800513849:AAEaDLYPqGgNfKVZZTrhUUTQ7pirs3gr35c';
const BOT_USERNAME = 'roupgrade_bot';
const WEB_APP_URL = 'https://roup-bot.onrender.com';
const CHANNEL_USERNAME = '@ro_upgrade';

// Прямая ссылка на баннер для отправки приглашения другу
const SHARE_BANNER_URL = 'https://i.ibb.co/Fq6L8G16/7007-D8-FC-C59-A-4-F72-B1-AB-C63-DFAA2-F87-A.png';

const bot = new Telegraf(BOT_TOKEN);

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

const getMainMenu = () => {
  return Markup.keyboard([
    [Markup.button.webApp('🎮 Играть', WEB_APP_URL)],
    ['👤 Профиль', '👥 Друзья'],
    ['🎁 Подарок', '🆘 Помощь']
  ]).resize();
};

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  const lastRequest = userCooldowns.get(userId) || 0;

  if (now - lastRequest < 500) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⏳ Не спамь так быстро!', { show_alert: false }).catch(() => {});
    }
    return;
  }

  userCooldowns.set(userId, now);

  if (userCooldowns.size > 2000) {
    for (const [id, time] of userCooldowns.entries()) {
      if (now - time > 10000) userCooldowns.delete(id);
    }
  }

  return next();
});

bot.start(async (ctx) => {
  try {
    const existingUser = await getUser(ctx.from.id);

    if (existingUser && existingUser.accepted_tos) {
      return ctx.reply(`С возвращением в <b>RoUP</b>! ⚡️`, {
        parse_mode: 'HTML',
        ...getMainMenu()
      });
    }

    let referrerId = null;
    if (ctx.startPayload && ctx.startPayload.startsWith('ref_')) {
      referrerId = ctx.startPayload.replace('ref_', '');
    }

    const target = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const shuffled = [...EMOJIS].sort(() => 0.5 - Math.random()).slice(0, 4);
    if (!shuffled.some(e => e.icon === target.icon)) {
      shuffled[0] = target;
      shuffled.sort(() => 0.5 - Math.random());
    }

    pendingUsers.set(ctx.from.id, {
      targetIcon: target.icon,
      referrerId: referrerId
    });

    const buttons = shuffled.map(e => Markup.button.callback(e.icon, `captcha_${e.icon}`));

    ctx.reply(
      `🛡 <b>Проверка безопасности</b>\n\nПожалуйста, подтверди, что ты не бот.\nНажми на: <b>${target.name}</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([buttons])
      }
    );
  } catch (err) {
    console.error('Ошибка в /start:', err.message);
  }
});

bot.action(/captcha_(.+)/, async (ctx) => {
  try {
    const selectedIcon = ctx.match[1];
    const pending = pendingUsers.get(ctx.from.id);

    if (!pending) {
      return ctx.answerCbQuery('Сессия устарела. Нажми /start снова.').catch(() => {});
    }

    if (selectedIcon !== pending.targetIcon) {
      return ctx.answerCbQuery('❌ Неверно! Попробуй снова.', { show_alert: true }).catch(() => {});
    }

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
        [Markup.button.callback('✅ Принимаю условия', 'accept_tos')]
      ])
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка в captcha:', err.message);
  }
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
      bot.telegram.sendMessage(
        rewardedReferrerId,
        `🎉 Твой друг <b>${ctx.from.first_name}</b> завершил регистрацию!\n` +
        `🎁 В твой инвентарь добавлен <b>предмет за 5-10 ⭐ (Звёзд)</b>!`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }

    const welcomeText =
      `Привет 👋\n` +
      `Это <b>RoUP</b> — тот самый роблокс апгрейдер ⚡️\n\n` +
      `👇 Выбери кнопку в меню 👇`;

    await ctx.deleteMessage().catch(() => {});
    ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      ...getMainMenu()
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка в accept_tos:', err.message);
  } finally {
    actionLocks.delete(lockKey);
  }
});

bot.hears('👤 Профиль', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');

    const tier = calculateTier(user);
    const itemsCount = await getUserInventoryCount(ctx.from.id);

    const profileText =
      `📊 <b>Статистика аккаунта:</b>\n\n` +
      `🆔 <b>ID:</b> <code>${user.telegram_id}</code>\n` +
      `🏅 <b>Уровень:</b> ${tier}\n` +
      `🎒 <b>Предметов в инвентаре:</b> ${itemsCount} шт.\n` +
      `👥 <b>Приглашено друзей:</b> ${user.referrals_count}\n` +
      `⭐ <b>Баланс:</b> ${user.balance} ⭐\n` +
      `📅 <b>Дата регистрации:</b> ${String(user.created_at).split(' ')[0]}`;

    ctx.reply(profileText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Открыть инвентарь и каталог', WEB_APP_URL)]
      ])
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка в Профиль:', err.message);
  }
});

bot.hears('🎁 Подарок', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');

    if (user.subscribed_reward_claimed) {
      return ctx.reply('✅ Ты уже получил свой стартовый предмет за подписку!');
    }

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
  } catch (err) {
    console.error('Ошибка в Подарок:', err.message);
  }
});

bot.action('check_subscription', async (ctx) => {
  const lockKey = `sub_${ctx.from.id}`;
  if (actionLocks.has(lockKey)) {
    return ctx.answerCbQuery('Проверка уже идет...').catch(() => {});
  }
  actionLocks.add(lockKey);

  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    const valid = ['member', 'administrator', 'creator'].includes(member.status);

    if (valid) {
      const rewardedItem = await claimSubscriptionItem(ctx.from.id);
      if (rewardedItem) {
        await ctx.answerCbQuery('🎉 Награда получена!', { show_alert: true }).catch(() => {});
        ctx.editMessageText(
          `🎉 <b>Поздравляем!</b>\n\n` +
          `Ты получил предмет: <b>${rewardedItem.name}</b>\n` +
          `Стоимость: <b>${rewardedItem.price_stars} ⭐</b>\n\n` +
          `Он уже добавлен в твой инвентарь. Заходи и посмотри! 🚀`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.webApp('🎒 Открыть инвентарь', WEB_APP_URL)]])
          }
        ).catch(() => {});
      } else {
        await ctx.answerCbQuery('Вы уже забирали этот предмет.', { show_alert: true }).catch(() => {});
      }
    } else {
      await ctx.answerCbQuery('❌ Сначала подпишись на канал!', { show_alert: true }).catch(() => {});
    }
  } catch (err) {
    console.error('Ошибка проверки подписки:', err.message);
    await ctx.answerCbQuery('Ошибка проверки. Попробуй через пару секунд.', { show_alert: true }).catch(() => {});
  } finally {
    actionLocks.delete(lockKey);
  }
});

// ---------- Реферальная система (с отправкой фото и инлайн-режимом) ----------

bot.hears('👥 Друзья', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) return ctx.reply('Сначала нажми /start');

    const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${ctx.from.id}`;
    const shareText = 'Заходи в RoUP, забирай бесплатный Roblox скин! ⚡️';
    const fallbackShareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

    const text =
      `👥 <b>Реферальная программа</b>\n\n` +
      `Зови друзей и получай за каждого предмет стоимостью <b>5-10 ⭐ (Звёзд)</b> в инвентарь!\n\n` +
      `📊 Приглашено: <b>${user.referrals_count}</b> чел.\n\n` +
      `🔗 Твоя ссылка:\n<code>${refLink}</code>`;

    ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        // Открывает выбор чата и вставляет полноценную фото-карточку
        [Markup.button.switchToChat('📲 Отправить приглашение с картинкой', '')],
        // Запасная кнопка обычной отправки ссылки
        [Markup.button.url('🔗 Поделиться ссылкой', fallbackShareUrl)]
      ])
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка в Друзья:', err.message);
  }
});

// Генерация карточки с картинкой при выборе друга
bot.on('inline_query', async (ctx) => {
  const userId = ctx.from.id;
  const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;

  const caption =
    `⚡️ <b>Заходи в RoUP и забирай бесплатный Roblox скин!</b>\n\n` +
    `🎁 Переходи по ссылке и получай стартовый предмет стоимостью от 5 до 10 ⭐:`;

  const results = [
    {
      type: 'photo',
      id: 'invite_card',
      photo_url: SHARE_BANNER_URL,
      thumb_url: SHARE_BANNER_URL,
      caption: caption,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Забрать скин',
              url: refLink
            }
          ]
        ]
      }
    }
  ];

  return ctx.answerInlineQuery(results, { cache_time: 0 });
});

bot.hears('🆘 Помощь', (ctx) => {
  ctx.reply(
    `❓ <b>Техническая поддержка</b>\n\n` +
    `По всем вопросам и проблемам с предметами:\n👉 @roup_support`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

// ---------- Оплата Telegram Stars ----------

bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('Ошибка pre_checkout_query:', err.message);
  }
});

bot.on('message', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  if (!payment) return;

  try {
    const parts = payment.invoice_payload.split('_');
    if (parts[0] !== 'buy') return;

    const payloadUserId = Number(parts[1]);
    const itemId = Number(parts[2]);

    if (payloadUserId !== ctx.from.id) {
      console.error('Несовпадение user_id в payload оплаты:', payment.invoice_payload, ctx.from.id);
      return;
    }

    await addInventoryItem(ctx.from.id, itemId);

    ctx.reply('✅ Оплата прошла успешно! Предмет добавлен в твой инвентарь.', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.webApp('🎒 Открыть инвентарь', WEB_APP_URL)]])
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка обработки successful_payment:', err.message);
  }
});

bot.catch((err, ctx) => {
  console.error(`Ошибка у пользователя ${ctx.from?.id}:`, err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Критическая ошибка (UncaughtException):', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Необработанный промис (UnhandledRejection):', reason);
});

// ---------- Настройка HTTP-сервера Express ----------

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data, x-telegram-init-data');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// 1. Вебхук Telegraf
const WEBHOOK_PATH = `/telegraf/${BOT_TOKEN}`;
app.use(bot.webhookCallback(WEBHOOK_PATH));

// 2. Роутер API Mini App (СТРОГО перед статикой)
app.use('/api', createWebappRouter(bot, BOT_TOKEN));

// 3. Пинг-эндпоинт для предотвращения засыпания сервера
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// 4. Раздача собранного React-билда
const webappDist = path.join(__dirname, 'webapp', 'dist');
app.use(express.static(webappDist));

// 5. Маршрутизация SPA (исключая системные префиксы)
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/telegraf')) {
    return res.status(404).json({ error: 'Маршрут API не найден' });
  }
  res.sendFile(path.join(webappDist, 'index.html'));
});

// 6. Запуск сервера и регистрация вебхука
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Render HTTP-сервер активен на порту ${PORT}`);

  try {
    const fullWebhookUrl = `${WEB_APP_URL}${WEBHOOK_PATH}`;
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`Вебхук Telegram зарегистрирован: ${fullWebhookUrl}`);
  } catch (err) {
    console.error('Ошибка регистрации вебхука:', err.message);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));