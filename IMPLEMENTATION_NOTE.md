# RoUP — изменения

## Апгрейд

Вся изменяемая механика находится в `upgrade-logic.js`.

- `calculateBaseChance()` — базовый шанс.
- `applyMultiplier()` — влияние множителя.
- `resolveUpgrade()` — серверный roll и итоговый success.
- `displayPercent()` — предварительное значение для UI.
- `MAX_MULTIPLIER` — верхняя граница пользовательского множителя.

Web App не принимает решение об исходе. `db.js` вызывает `resolveUpgrade()` внутри транзакции.

## Telegram Stars

Старый flow `topup_* -> addBalance()` удалён.

Stars используются только через `/api/support/create-invoice` с payload `support_<userId>_<timestamp>`.
`successful_payment` с `support_` не меняет `users.balance`.
Старые `topup_` платежи также намеренно не меняют баланс.

## Рефералы и вывод

Добавлено поле `users.is_premium` с безопасной миграцией `ADD COLUMN IF NOT EXISTS`.
Прогресс считается по реальным строкам `users.invited_by`:

- 5 Premium ИЛИ
- 10 пользователей без Premium.

Условие проверяется сервером. Web App получает `can_withdraw` и прогресс из `/api/profile`.

Telegram-бот показывает тот же прогресс в `Профиль` и `Друзья`, а после успешной регистрации реферала отправляет обновление пригласившему.

Страница вывода пока заглушка `Скоро`.
