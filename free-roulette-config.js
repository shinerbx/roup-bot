// Бесплатная рулетка за приглашение друзей.
//
// REWARDS         — РЕАЛЬНЫЕ серверные шансы. На клиент НЕ уходят.
// VISUAL_REWARDS  — то, что видит игрок в таблице наград и на колесе.
// Сумма chance в каждом блоке должна быть равна 100.

module.exports = Object.freeze({
  // Сколько бесплатных прокруток получает пригласивший за каждого нового игрока.
  REFERRAL_SPINS_PER_FRIEND: 1,

  // Оставить ли прежний бонус «стартовый предмет за друга» вместе с прокруткой.
  REFERRAL_STARTER_ITEM: true,

  // Сколько новых рефералов засчитывается одному игроку за сутки (защита от накрутки).
  MAX_REFERRALS_PER_DAY: 50,

  // Однократный перенос уже накопленных приглашений в прокрутки.
  SEED_SPINS_FROM_EXISTING_REFERRALS: false,

  // Визуальные настройки прокрутки. На выбор приза не влияют.
  SPIN: Object.freeze({
    DURATION_MS: 4600,
    MIN_CARDS: 34,
    TARGET_INDEX: 28,
  }),

  // ── РЕАЛЬНЫЕ шансы (сервер) ────────────────────────────────────────
  // Эти веса НЕ обязаны суммироваться в 100 — нормализуются на сервере.
  // Дорогие предметы держим в районе 0.001–1%, чтобы они были почти
  // недостижимы: 1 на 100 000 прокруток и реже.
  // ── РЕАЛЬНЫЕ шансы (сервер) ────────────────────────────────────────
  // Именно эти вероятности используются при розыгрыше в spinFreeRoulette.
  // На клиент они не отдаются. Сумма не обязана быть 100 —
  // нормализуется на сервере в validateFreeRouletteConfig.
  REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 50 },
    { item_name: 'Red Hair',        chance: 30 },
    { item_name: 'Black Wings',     chance: 1 },
    { item_name: 'Blue Pumpkin',    chance: 0.003 },
    { item_name: 'Red Head',        chance: 0.002 },
    { item_name: 'Domino Hat',      chance: 0.001 },
  ]),

  // ── ВИЗУАЛЬНЫЕ шансы (клиент) ─────────────────────────────────────
  // Целые числа. Сумма ровно 100: 18 + 17 + 17 + 16 + 16 + 16 = 100.
  // Узкий коридор 16–18%, без провалов — дешёвка не выделяется,
  // дорогие не выглядят «выше остальных». Baseball Cap на пункт ниже
  // Red Hair. Domino Hat — самый вероятный из дорогих, тихий топ колеса.
  VISUAL_REWARDS: Object.freeze([
    { item_name: 'Domino Hat',      chance: 18 },
    { item_name: 'Red Hair',        chance: 17 },
    { item_name: 'Black Wings',     chance: 17 },
    { item_name: 'Blue Pumpkin',    chance: 16 },
    { item_name: 'Red Head',        chance: 16 },
    { item_name: 'Baseball Cap',    chance: 16 },
  ]),
});
