// admin-notify.js — сервисные сообщения админу.
// Env: ADMIN_CHAT_ID=<telegram_id админа>

const { WITHDRAWAL } = require('./house-config');

let _bot = null;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

function registerBot(bot) {
  _bot = bot;
  console.log('[admin-notify] bot registered. ADMIN_CHAT_ID =',
    ADMIN_CHAT_ID ? `${ADMIN_CHAT_ID}` : '(NOT SET)');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  const text =
    `<b>Новый запрос на вывод!</b>\n\n` +
    `ID пользователя: <code>${req.userId}</code>\n` +
    `Telegram Юзернейм: ${escapeHtml(req.contactUsername)}\n` +
    `Сумма к выводу: <b>${req.amountStars}</b> Звезд (<b>${req.amountRub}</b> руб.)\n` +
    `Комиссия ${WITHDRAWAL.COMMISSION_PERCENT}%: ${req.commissionRub} руб.\n` +
    `К выплате чистыми: <b>${req.payoutRub} руб.</b>\n` +
    `Способ: Криптовалюта\n\n` +
    `Заявка #${req.requestId}`;

  try {
    const msg = await _bot.telegram.sendMessage(ADMIN_CHAT_ID, text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Выплачено', callback_data: `wr:paid:${req.requestId}` },
          { text: '❌ Отклонить', callback_data: `wr:reject:${req.requestId}` },
        ]],
      },
    });
    console.log('[admin-notify] sent OK. messageId =', msg?.message_id);
    return msg?.message_id || null;
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
