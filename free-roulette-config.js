// Бесплатная рулетка за приглашение друзей.
//
// REWARDS  — РЕАЛЬНЫЕ серверные шансы. На клиент НЕ уходят.
// VISUAL_REWARDS — то, что видит игрок в таблице наград и на колесе.
//   Сумма chance по каждому из блоков должна быть равна 100.

module.exports = Object.freeze({
  REFERRAL_SPINS_PER_FRIEND: 1,
  REFERRAL_STARTER_ITEM: true,
  MAX_REFERRALS_PER_DAY: 50,
  SEED_SPINS_FROM_EXISTING_REFERRALS: false,

  SPIN: Object.freeze({
    DURATION_MS: 4600,
    MIN_CARDS: 34,
    TARGET_INDEX: 28,
  }),

  // Реальные шансы — используются только на сервере при розыгрыше.
  REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 52 },
    { item_name: 'Red Hair',        chance: 24 },
    { item_name: 'Money Hat',       chance: 12 },
    { item_name: 'Blue Coil',       chance: 7  },
    { item_name: 'Doge Head',       chance: 4  },
    { item_name: 'Blue Pumpkin',    chance: 1  },
  ]),

  // Визуальные шансы — то, что видит игрок в UI.
  // Сумма = 100. Все сектора равные — создаётся иллюзия высокого шанса на дорогие призы.
  VISUAL_REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 16.67 },
    { item_name: 'Red Hair',        chance: 16.67 },
    { item_name: 'Money Hat',       chance: 16.67 },
    { item_name: 'Blue Coil',       chance: 16.67 },
    { item_name: 'Doge Head',       chance: 16.67 },
    { item_name: 'Blue Pumpkin',    chance: 16.65 },
  ]),
});
