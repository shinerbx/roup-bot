const { Telegraf, Markup } = require('telegraf');
const { 
  registerUser, 
  getUser, 
  calculateTier, 
  claimSubscriptionItem, 
  getUserInventoryCount 
} = require('./db');

const BOT_TOKEN = '8800513849:AAEaDLYPqGgNfKVZZTrhUUTQ7pirs3gr35c';
const BOT_USERNAME = 'roupgrade_bot';
const WEB_APP_URL = 'https://твой-домен.com'; 
const CHANNEL_USERNAME = '@ro_upgrade'; 

const bot = new Telegraf(BOT_TOKEN);

// Временное хранилище сессий для капчи и рефералов
const pendingUsers = new Map();

// Набор эмодзи для капчи
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

// 1. /start -> Проверка на бота (Капча)
bot.start((ctx) => {
  const existingUser = getUser(ctx.from.id);
  
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
});

// Обработка клика по капче
bot.action(/captcha_(.+)/, async (ctx) => {
  const selectedIcon = ctx.match[1];
  const pending = pendingUsers.get(ctx.from.id);

  if (!pending) {
    return ctx.answerCbQuery('Сессия устарела. Нажми /start снова.');
  }

  if (selectedIcon !== pending.targetIcon) {
    await ctx.answerCbQuery('❌ Неверно! Попробуй снова.', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery('✅ Верно!');

  // 2. Шаг: Пользовательское соглашение
  const tosText = 
    `📜 <b>Пользовательское соглашение</b>\n\n` +
    `Добро пожаловать в <b>RoUP</b> ⚡️\n\n` +
    `Перед началом использования ознакомься с правилами сервиса:\n` +
    `• Сервис предназначен для развлекательных целей.\n` +
    `• Апгрейды предметов основываются на математической вероятности.\n` +
    `• Запрещено использовать баги и уязвимости бота.\n\n` +
    `Нажимая «Принимаю условия», вы соглашаетесь с правилами.`;

  ctx.editMessageText(tosText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Принимаю условия', 'accept_tos')]
    ])
  });
});

// 3. Шаг: Принятие соглашения и выдача меню
bot.action('accept_tos', async (ctx) => {
  const pending = pendingUsers.get(ctx.from.id) || {};
  const { rewardedReferrerId } = registerUser(ctx.from, pending.referrerId);
  pendingUsers.delete(ctx.from.id);

  await ctx.answerCbQuery('🎉 Условия приняты!');

  if (rewardedReferrerId) {
    try {
      await bot.telegram.sendMessage(
        rewardedReferrerId,
        `🎉 Твой друг <b>${ctx.from.first_name}</b> завершил регистрацию!\n` +
        `🎁 В твой инвентарь добавлен <b>предмет за 5-10 ⭐ (Звёзд)</b>!`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.log('Ошибка отправки сообщения рефереру:', e.message);
    }
  }

  const welcomeText = 
    `Привет 👋\n` +
    `Это <b>RoUP</b> — тот самый роблокс апгрейдер ⚡️\n\n` +
    `👇 Выбери кнопку в меню 👇`;

  await ctx.deleteMessage();
  ctx.reply(welcomeText, {
    parse_mode: 'HTML',
    ...getMainMenu()
  });
});

// Раздел: Профиль
bot.hears('👤 Профиль', (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Сначала нажми /start');

  const tier = calculateTier(user);
  const itemsCount = getUserInventoryCount(ctx.from.id);

  const profileText = 
    `📊 <b>Статистика аккаунта:</b>\n\n` +
    `🆔 <b>ID:</b> <code>${user.telegram_id}</code>\n` +
    `🏅 <b>Уровень:</b> ${tier}\n` +
    `🎲 <b>Апгрейдов:</b> ${user.upgrades_count}\n` +
    `🎒 <b>Предметов в инвентаре:</b> ${itemsCount} шт.\n` +
    `👥 <b>Приглашено друзей:</b> ${user.referrals_count}\n` +
    `⭐ <b>Баланс:</b> ${user.balance} ⭐\n` +
    `📅 <b>Дата регистрации:</b> ${user.created_at.split(' ')[0]}`;

  ctx.reply(profileText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('💳 Пополнить баланс (Скоро)', 'deposit_placeholder')],
      [Markup.button.webApp('🚀 Открыть инвентарь и игру', WEB_APP_URL)]
    ])
  });
});

// Раздел: Подарок (за подписку на ТГК)
bot.hears('🎁 Подарок', (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Сначала нажми /start');

  if (user.subscribed_reward_claimed) {
    return ctx.reply('✅ Ты уже получил свой стартовый предмет за подписку!');
  }

  const giftText = 
    `🎁 <b>Бесплатный предмет за подписку!</b>\n\n` +
    `Подпишись на наш канал ${CHANNEL_USERNAME}, чтобы мгновенно получить случайный Roblox-предмет стоимостью <b>от 5 до 10 ⭐</b>!\n\n` +
    `Ты сможешь сразу использовать его для апгрейда! ⚡️`;

  ctx.reply(giftText, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.url('📢 Подписаться на канал', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
      [Markup.button.callback('✅ Проверить подписку', 'check_subscription')]
    ])
  });
});

bot.action('check_subscription', async (ctx) => {
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_USERNAME, ctx.from.id);
    const valid = ['member', 'administrator', 'creator'].includes(member.status);

    if (valid) {
      const rewardedItem = claimSubscriptionItem(ctx.from.id);
      if (rewardedItem) {
        await ctx.answerCbQuery('🎉 Награда получена!', { show_alert: true });
        ctx.editMessageText(
          `🎉 <b>Поздравляем!</b>\n\n` +
          `Ты получил предмет: <b>${rewardedItem.name}</b>\n` +
          `Стоимость: <b>${rewardedItem.price_stars} ⭐</b>\n\n` +
          `Он уже добавлен в твой инвентарь. Заходи и делай апгрейд! 🚀`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.webApp('🎮 Перейти в игру', WEB_APP_URL)]])
          }
        );
      } else {
        await ctx.answerCbQuery('Вы уже забирали этот предмет.', { show_alert: true });
      }
    } else {
      await ctx.answerCbQuery('❌ Сначала подпишись на канал!', { show_alert: true });
    }
  } catch (err) {
    console.error('Ошибка проверки подписки:', err);
    await ctx.answerCbQuery('Ошибка. Убедись, что бот назначен админом в канале.', { show_alert: true });
  }
});

// Раздел: Друзья (Рефералка)
bot.hears('👥 Друзья', (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Сначала нажми /start');

  const refLink = `https://t.me/${BOT_USERNAME}?start=ref_${ctx.from.id}`;
  const shareText = encodeURIComponent('Заходи в RoUP, забирай бесплатный Roblox скин и апгрейди его до редких вещей! ⚡️');

  const text = 
    `👥 <b>Реферальная программа</b>\n\n` +
    `Зови друзей и получай за каждого предмет стоимостью <b>5-10 ⭐ (Звёзд)</b> в инвентарь!\n\n` +
    `📊 Приглашено: <b>${user.referrals_count}</b> чел.\n\n` +
    `🔗 Твоя ссылка:\n<code>${refLink}</code>`;

  ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.url('📲 Поделиться ссылкой', `https://t.me/share/url?url=${refLink}&text=${shareText}`)]
    ])
  });
});

// Раздел: Помощь
bot.hears('🆘 Помощь', (ctx) => {
  ctx.reply(
    `❓ <b>Техническая поддержка</b>\n\n` +
    `По всем вопросам и проблемам с предметами:\n👉 @roup_support`,
    { parse_mode: 'HTML' }
  );
});

bot.action('deposit_placeholder', (ctx) => {
  ctx.answerCbQuery('Пополнение через Telegram Stars будет доступно скоро!', { show_alert: true });
});

bot.launch();
console.log('RoUP бот с капчей, ToS и предметами запущен!');