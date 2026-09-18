// admin-notify.js — сервисные сообщения админу.
// Env: ADMIN_CHAT_ID=<telegram_id админа>

const { WITHDRAWAL } = require('./house-config');

let _bot = null;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

function registerBot(bot) { _bot = bot; }

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyWithdrawRequest(req) {
  if (!WITHDRAWAL.ADMIN_NOTIFY || !_bot || !ADMIN_CHAT_ID) return null;

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
    return msg?.message_id || null;
  } catch (err) {
    console.error('admin-notify: send failed', err.message);
    return null;
  }
}

module.exports = { registerBot, notifyWithdrawRequest };
