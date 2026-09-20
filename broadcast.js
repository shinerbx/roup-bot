// Автоматические адресные рассылки RoUP.
// Сейчас используются только две полезные кампании:
// 1) незабранный подарок за подписку на Telegram-канал;
// 2) бесплатная прокрутка рулетки, уже начисленная за реферала.
//
// Все ограничения и частотность задаются через house-config.js -> BROADCAST.

const { BROADCAST } = require('./house-config');
const {
  fetchRewardBroadcastTargets,
  markBroadcastCampaignSent,
  getBroadcastOptOut,
  setBroadcastOptOut,
} = require('./db');

let _runtime = { webappUrl: '', botUsername: '' };

const CHANNEL_USERNAME = '@ro_upgrade';
const NAME = (u) => String(u?.first_name || '').trim() || 'игрок';
const fmt = (n) => Number(n).toLocaleString('ru-RU');

function buildWebAppButton(text) {
  const webappUrl = _runtime.webappUrl || '';
  if (/^https:\/\//i.test(webappUrl)) {
    return { text, web_app: { url: webappUrl } };
  }
  const botUsername = _runtime.botUsername || '';
  if (botUsername) return { text, url: `https://t.me/${botUsername}?startapp=play` };
  return null;
}

function buildCampaign(user, campaign) {
  const webButton = buildWebAppButton('🎮 Открыть RoUP');

  if (campaign === 'subscription') {
    return {
      text:
        `🎁 <b>${NAME(user)}, тебя ждёт бесплатный подарок!</b>\n\n` +
        `Стартовый Roblox-предмет ещё не забран. Подпишись на наш Telegram-канал ` +
        `<b>${CHANNEL_USERNAME}</b>, затем нажми «Проверить подписку» — и подарок сразу появится в инвентаре.\n\n` +
        `Подарок можно получить <b>один раз</b>.`,
      keyboard: {
        inline_keyboard: [
          [{ text: '📢 Подписаться на канал', url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }],
          [{ text: '✅ Проверить подписку', callback_data: 'check_subscription' }],
          ...(webButton ? [[webButton]] : []),
        ],
      },
    };
  }

  if (campaign === 'roulette') {
    const spins = Math.max(0, Number(user.free_roulette_spins) || 0);
    return {
      text:
        `🎁 <b>Бесплатная прокрутка ждёт тебя!</b>\n\n` +
        `За приглашённого друга тебе начислена бесплатная прокрутка рулетки. ` +
        `Сейчас доступно: <b>${fmt(spins)}</b>.\n\n` +
        `Открой RoUP → «Рулетка» и забери свою награду.`,
      keyboard: {
        inline_keyboard: [
          ...(webButton ? [[webButton]] : []),
        ],
      },
    };
  }

  return null;
}

async function sendToUser(bot, user) {
  const optOut = await getBroadcastOptOut(user.telegram_id).catch(() => false);
  if (optOut) return false;

  const campaign = user.broadcast_campaign;
  const built = buildCampaign(user, campaign);
  if (!built) return false;

  try {
    await bot.telegram.sendMessage(user.telegram_id, built.text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: built.keyboard,
    });
    await markBroadcastCampaignSent(user.telegram_id, campaign);
    return true;
  } catch (err) {
    const code = err?.response?.error_code || err?.code;
    // Если чат недоступен или пользователь заблокировал бота — исключаем его
    // из следующих рассылок, не повторяя бесполезные запросы.
    if (code === 403 || code === 400) {
      await setBroadcastOptOut(user.telegram_id, true).catch(() => {});
    }
    return false;
  }
}

async function runBatch(bot, users) {
  let sent = 0;
  let failed = 0;
  const concurrency = Math.max(1, Number(BROADCAST.CONCURRENT) || 4);

  for (let i = 0; i < users.length; i += concurrency) {
    const slice = users.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((u) => sendToUser(bot, u).catch(() => false)));
    for (const ok of results) ok ? sent++ : failed++;

    // Telegram допускает значительно больше, чем этот темп, но намеренно
    // оставляем запас, чтобы рассылка не превращалась в flood.
    if (i + concurrency < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  return { sent, failed };
}

function inWindow(now = new Date()) {
  const windows = Array.isArray(BROADCAST.WINDOWS) ? BROADCAST.WINDOWS : [];
  const timezone = BROADCAST.TIMEZONE || 'Europe/Moscow';
  let hour;
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now));
  } catch {
    hour = now.getHours();
  }
  return windows.some((w) => hour >= Number(w.startHour) && hour < Number(w.endHour));
}

async function runOnce(bot, batchSize) {
  if (!BROADCAST.ENABLED) return { skipped: 'disabled' };
  if (!inWindow()) return { skipped: 'out_of_window' };

  const users = await fetchRewardBroadcastTargets(batchSize);
  if (!users.length) return { skipped: 'no_targets' };

  const result = await runBatch(bot, users);
  console.log(`[broadcast] targets=${users.length}, sent=${result.sent}, failed=${result.failed}`);
  return result;
}

function startBroadcastScheduler(bot, options = {}) {
  _runtime.webappUrl = String(options.webappUrl || '').trim();
  _runtime.botUsername = String(options.botUsername || '').replace(/^@/, '').trim();

  if (!BROADCAST.ENABLED) {
    console.log('[broadcast] disabled by config');
    return;
  }

  const tickMs = Math.max(1, Number(BROADCAST.TICK_MINUTES) || 15) * 60 * 1000;
  const batchSize = Math.max(1, Number(BROADCAST.BATCH_SIZE) || 25);
  const firstDelay = 30_000 + Math.floor(Math.random() * 60_000);

  console.log(`[broadcast] scheduler armed, tick=${tickMs / 60000}min, batch=${batchSize}`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce(bot, batchSize);
    } catch (err) {
      console.error('[broadcast] tick error:', err.message);
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    tick();
    setInterval(tick, tickMs).unref?.();
  }, firstDelay).unref?.();
}

module.exports = { startBroadcastScheduler, runOnce, buildCampaign };
