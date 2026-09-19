// language: Node.js, file: broadcast.js, target: RoUP bot
// Рассылка-байт на возврат в Mini App. Ротация шаблонов, фильтр неактивных,
// батчи и opt-out. Дёргается из index.js одним вызовом startBroadcastScheduler.
const { BROADCAST } = require('./house-config');
const {
  fetchBroadcastTargets, markBroadcastSent,
  getRandomActiveDrop, getBroadcastOptOut, setBroadcastOptOut,
} = require('./db');

// Runtime-конфиг, заполняется из startBroadcastScheduler.
// Позволяет брать URL и username бота из констант index.js, а не из env.
let _runtime = {
  webappUrl: '',
  botUsername: '',
};

const NAME = (u) => String(u?.first_name || '').trim() || 'игрок';
const BAL = (u) => Number(u?.balance || 0);
const fmt = (n) => Number(n).toLocaleString('ru-RU');

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const TEMPLATES = [
  // ── Social proof: реальный дроп за последние 30 минут ──
  {
    key: 'live_drop',
    weight: 22,
    build: ({ drop }) => {
      if (!drop) return null;
      const winner = String(drop.first_name || '').trim() || 'Игрок';
      return {
        text:
          `🔥 <b>${winner}</b> только что забрал <b>${drop.item_name}</b> ` +
          `за <b>★ ${fmt(drop.price)}</b> при шансе <b>${Number(drop.chance).toFixed(1)}%</b>.\n\n` +
          `Ты в игре с таким же азартом — попробуй и ты.`,
        button: 'Залетаю',
      };
    },
  },

  // ── Loss aversion: у тебя простаивают звёзды ──
  {
    key: 'idle_balance',
    weight: 14,
    build: ({ user }) => {
      const bal = BAL(user);
      if (bal < 50) return null;
      return {
        text:
          `👀 У тебя <b>★ ${fmt(bal)}</b> простаивают без дела.\n\n` +
          `Каждый час — упущенный апгрейд. Залетай, пока каталог держит дропы.`,
        button: 'Забрать своё',
      };
    },
  },

  // ── FOMO на конкретную пару ──
  {
    key: 'fomo_upgrade',
    weight: 12,
    build: ({ user }) => {
      const bal = BAL(user);
      if (bal < 20) return null;
      const target = Math.max(20, bal * 2);
      return {
        text:
          `⚡ Сейчас в ленте пары с апгрейдом до <b>×10</b>.\n\n` +
          `Со <b>★ ${fmt(Math.max(5, Math.floor(bal / 4)))}</b> можно уйти с <b>★ ${fmt(target)}+</b>. ` +
          `Шансы видны сразу — без сюрпризов.`,
        button: 'Открыть апгрейд',
      };
    },
  },

  // ── Малый вход, дешёвый крючок ──
  {
    key: 'cheap_entry',
    weight: 12,
    build: () => ({
      text:
        `🎯 Всего <b>★ 5</b> — и ты в игре.\n\n` +
        `Первый апгрейд дешёвых предметов сейчас почти гарантирован. ` +
        `Дальше — как повезёт, но зайти стоит именно сегодня.`,
      button: 'Начать с 5★',
    }),
  },

  // ── Инвентарь ждёт ──
  {
    key: 'inventory_miss',
    weight: 10,
    build: ({ user }) => {
      const cnt = Number(user.items_count || 0);
      if (cnt <= 0) return null;
      return {
        text:
          `🎒 В твоём инвентаре <b>${cnt}</b> ${plural(cnt, 'предмет', 'предмета', 'предметов')} — и все ждут апгрейда.\n\n` +
          `Тихо скучают без внимания. Залетай, разбуди один.`,
        button: 'Проведать инвентарь',
      };
    },
  },

  // ── Срочность ──
  {
    key: 'urgency',
    weight: 10,
    build: () => ({
      text:
        `⏰ Только сейчас в каталоге — предметы за <b>★ 5–15</b> с дропом апгрейда до <b>×20</b>.\n\n` +
        `Вход минимальный, выход — солидный. Залетай, пока окно открыто.`,
      button: 'В игру',
    }),
  },

  // ── Прямой CTA ──
  {
    key: 'direct',
    weight: 8,
    build: ({ user }) => ({
      text:
        `<b>${NAME(user)}</b>, залетай. Один апгрейд — 30 секунд.`,
      button: 'Играть',
    }),
  },

  // ── Дружеское давление ──
  {
    key: 'peer',
    weight: 8,
    build: () => ({
      text:
        `🔥 В ленте сейчас один за другим ловят апгрейды.\n\n` +
        `Ты не заходил больше 3 часов — самое время напомнить о себе.`,
      button: 'Залетаю',
    }),
  },

  // ── Demo / lucky reminder ──
  {
    key: 'lucky_mode',
    weight: 6,
    build: ({ user }) => {
      const demo = user.pre_demo_balance != null || Number(user.lucky_mode) > 0;
      if (!demo) return null;
      return {
        text:
          `✨ У тебя активен Demo-режим с бонусными шансами.\n\n` +
          `Апгрейды в нём идут с усиленным шансом. Не упусти окно, пока оно открыто.`,
        button: 'Открыть Demo',
      };
    },
  },

  // ── Личный счёт ──
  {
    key: 'personal_stats',
    weight: 6,
    build: ({ user }) => {
      const upg = Number(user.upgrades_count || 0);
      if (upg < 1) return null;
      return {
        text:
          `📊 <b>${NAME(user)}</b>, у тебя <b>${fmt(upg)}</b> ${plural(upg, 'апгрейд', 'апгрейда', 'апгрейдов')} за всё время.\n\n` +
          `Продолжи серию — следующая победа может стать лучшей.`,
        button: 'Продолжить',
      };
    },
  },
];

function pickTemplate(ctx) {
  const pool = [];
  for (const t of TEMPLATES) {
    const probe = t.build(ctx);
    if (!probe) continue;
    const w = Math.max(1, Number(t.weight) || 1);
    for (let i = 0; i < w; i++) pool.push(t);
  }
  if (!pool.length) return null;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen.build(ctx);
}

function buildKeyboard(buttonText) {
  const style = BROADCAST.BUTTON_STYLE || 'web_app';
  const webappUrl = _runtime.webappUrl || BROADCAST.WEBAPP_URL || '';
  const botUsername = _runtime.botUsername || BROADCAST.BOT_USERNAME || '';

  // Приоритет: web_app — если есть https-URL. Иначе deeplink на бот.
  if (style === 'web_app' && /^https:\/\//i.test(webappUrl)) {
    return { inline_keyboard: [[{ text: buttonText, web_app: { url: webappUrl } }]] };
  }
  if (botUsername) {
    const url = `https://t.me/${botUsername}?startapp=play`;
    return { inline_keyboard: [[{ text: buttonText, url }]] };
  }
  // Совсем нечего дать — кнопка без действия, лучше не показывать вообще
  return undefined;
}

async function sendToUser(bot, user, ctx) {
  const optOut = await getBroadcastOptOut(user.telegram_id).catch(() => false);
  if (optOut) return false;

  const picked = pickTemplate(ctx);
  if (!picked) return false;

  const reply_markup = buildKeyboard(picked.button);
  const payload = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (reply_markup) payload.reply_markup = reply_markup;

  try {
    await bot.telegram.sendMessage(user.telegram_id, picked.text, payload);
    await markBroadcastSent(user.telegram_id);
    return true;
  } catch (err) {
    const code = err?.response?.error_code || err?.code;
    // 403 — юзер заблокировал бота. 400 — chat not found / never started.
    // Оба означают: не тратить время на него в будущих тиках.
    if (code === 403 || code === 400) {
      await setBroadcastOptOut(user.telegram_id, true).catch(() => {});
    }
    return false;
  }
}

async function runBatch(bot, users, drop) {
  let sent = 0;
  let failed = 0;
  const concurrency = Math.max(1, Number(BROADCAST.CONCURRENT) || 4);

  for (let i = 0; i < users.length; i += concurrency) {
    const slice = users.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map((u) => sendToUser(bot, u, { user: u, drop }).catch(() => false))
    );
    for (const ok of results) ok ? sent++ : failed++;

    // Пауза между мини-пачками, чтобы не превысить лимит Telegram ~30 msg/sec
    if (i + concurrency < users.length) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return { sent, failed };
}

function inWindow(now = new Date()) {
  const h = now.getHours();
  const windows = BROADCAST.WINDOWS || [];
  return windows.some((w) => h >= w.startHour && h < w.endHour);
}

async function runOnce(bot, batchSize) {
  if (!BROADCAST.ENABLED) return { skipped: 'disabled' };
  if (!inWindow()) return { skipped: 'out_of_window' };

  const users = await fetchBroadcastTargets(batchSize);
  if (!users.length) return { skipped: 'no_targets' };

  const drop = await getRandomActiveDrop().catch(() => null);

  console.log(`[broadcast] targets=${users.length}, drop=${drop ? drop.item_name : 'none'}`);
  const res = await runBatch(bot, users, drop);
  console.log(`[broadcast] sent=${res.sent}, failed=${res.failed}`);
  return res;
}

/**
 * Запуск планировщика.
 * @param {Telegraf} bot — инстанс Telegraf.
 * @param {object}  [options]
 * @param {string}  [options.webappUrl]  — URL Mini App (для web_app-кнопки).
 * @param {string}  [options.botUsername] — username бота без @ (для deeplink-фолбэка).
 */
function startBroadcastScheduler(bot, options = {}) {
  _runtime.webappUrl = String(options.webappUrl || BROADCAST.WEBAPP_URL || '');
  _runtime.botUsername = String(options.botUsername || BROADCAST.BOT_USERNAME || '').replace(/^@/, '');

  if (!BROADCAST.ENABLED) {
    console.log('[broadcast] disabled by config');
    return;
  }
  const tickMs = Math.max(1, Number(BROADCAST.TICK_MINUTES) || 15) * 60 * 1000;
  const batchSize = Math.max(1, Number(BROADCAST.BATCH_SIZE) || 25);

  // Небольшая случайная задержка первого запуска — чтобы не стартовать
  // синхронно с рестартом бота и не дёрнуть всех сразу.
  const firstDelay = 30_000 + Math.floor(Math.random() * 60_000);

  console.log(`[broadcast] scheduler armed, tick=${tickMs / 60000}min, batch=${batchSize}, webapp=${_runtime.webappUrl ? 'yes' : 'no'}`);

  setTimeout(() => {
    runOnce(bot, batchSize).catch((e) => console.error('[broadcast] tick error:', e.message));
    setInterval(() => {
      runOnce(bot, batchSize).catch((e) => console.error('[broadcast] tick error:', e.message));
    }, tickMs);
  }, firstDelay);
}

module.exports = {
  startBroadcastScheduler,
  runOnce,
  pickTemplate,
  TEMPLATES,
};
