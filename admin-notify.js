// admin-notify.js — сервисные сообщения админу.
// Env: ADMIN_CHAT_ID=<telegram_id админа>

const { WITHDRAWAL } = require('./house-config');
const { ADMIN_IDS } = require('./access-control');

let _bot = null;
const ADMIN_CHAT_ID = ADMIN_IDS[0] || null;

function registerBot(bot) {
  _bot = bot;
  console.log('[admin-notify] bot registered. ADMIN_CHAT_ID =',
    ADMIN_CHAT_ID ? `${ADMIN_CHAT_ID}` : '(NOT SET)');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString('ru-RU');
  return date.toLocaleString('ru-RU');
}

async function notifyWithdrawRequest(req) {
  console.log('[admin-notify] called:', {
    adminNotify: WITHDRAWAL.ADMIN_NOTIFY,
    hasBot: Boolean(_bot),
    hasChatId: Boolean(ADMIN_CHAT_ID),
    adminChatId: ADMIN_CHAT_ID || null,
    requestId: req?.requestId,
    userId: req?.userId,
    amountStars: req?.amountStars,
    robloxUsername: req?.robloxUsername,
  });

  if (!WITHDRAWAL.ADMIN_NOTIFY) {
    console.warn('[admin-notify] SKIP: ADMIN_NOTIFY disabled in house-config.js');
    return null;
  }
  if (!_bot) {
    console.error('[admin-notify] SKIP: bot not registered. Проверь registerBot(bot) в index.js.');
    return null;
  }
  if (!ADMIN_CHAT_ID) {
    console.error('[admin-notify] SKIP: ADMIN_CHAT_ID не задан в переменных окружения Render.');
    return null;
  }

  const telegramUsername = req?.telegramUsername ? `@${String(req.telegramUsername).replace(/^@+/, '')}` : 'не указан';
  const text =
    `🔔 <b>Новая заявка на вывод</b>\n\n` +
    `👤 Telegram: <b>${escapeHtml(telegramUsername)}</b> / <code>${escapeHtml(req.userId)}</code>\n` +
    `🎮 Roblox: <b>${escapeHtml(req.robloxUsername)}</b>\n` +
    `⭐ Списано: <b>${escapeHtml(req.amountStars)} ⭐</b>\n` +
    `💰 Итог: <b>${escapeHtml(req.payoutRobux)} R$</b>`;

  try {
    const keyboard = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Выплачено', callback_data: `wr:paid:${req.requestId}` },
            { text: '❌ Отклонить', callback_data: `wr:reject:${req.requestId}` },
          ],
          [{ text: '💬 Комментарий', callback_data: `wr:comment:${req.requestId}` }],
        ],
      },
    };

    let firstMessageId = null;
    for (const adminId of ADMIN_IDS) {
      try {
        const msg = await _bot.telegram.sendMessage(adminId, text, keyboard);
        if (!firstMessageId) firstMessageId = msg?.message_id || null;
      } catch (err) {
        console.error('[admin-notify] SEND FAILED:', { adminId, message: err.message, code: err.code, description: err.description });
      }
    }
    console.log('[admin-notify] sent. messageId =', firstMessageId);
    return firstMessageId;
  } catch (err) {
    console.error('[admin-notify] SEND FAILED:', {
      message: err.message,
      code: err.code,
      description: err.description,
      adminChatId: ADMIN_CHAT_ID,
      hint: 'Telegram не даёт боту писать первым. Если админ ни разу не нажал /start у бота — сообщение не уйдёт.',
    });
    return null;
  }
}

module.exports = { registerBot, notifyWithdrawRequest };
