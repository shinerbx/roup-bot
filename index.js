const PRIVACY_POLICY_URL = 'https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-programmy-loyalnosti-RoUP-09-16'; // Твоя ссылка

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

    await ctx.answerCbQuery('✅ Проверка пройдена!').catch(() => {});

    const tosText =
      `📜 <b>Пользовательское соглашение RoUP</b>\n\n` +
      `Добро пожаловать в <b>RoUP</b> ⚡️\n\n` +
      `Перед началом использования подтверди согласие с правилами:\n` +
      `• Сервис предоставляет доступ к интерактивным игровым симуляторам.\n` +
      `• Действует процентная бонусная система за активных друзей.\n` +
      `• Исходы мини-игр генерируются случайным математическим алгоритмом.\n` +
      `• Запрещены мультиаккаунты, багоюз и скрипты.\n\n` +
      `Нажимая «Принимаю условия», ты подтверждаешь своё совершеннолетие и согласие с регламентом платформы.`;

    ctx.editMessageText(tosText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📖 Читать правила и соглашение', PRIVACY_POLICY_URL)],
        [Markup.button.callback('✅ Принимаю условия', 'accept_tos')]
      ])
    }).catch(() => {});
  } catch (err) {
    console.error('Ошибка в captcha:', err.message);
  }
});