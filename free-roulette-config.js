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
  // Именно эти вероятности используются при розыгрыше в spinFreeRoulette.
  // На клиент они не отдаются.
  REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 52 },
    { item_name: 'Red Hair',        chance: 24 },
    { item_name: 'Money Hat',       chance: 12 },
    { item_name: 'Blue Coil',       chance: 7  },
    { item_name: 'Doge Head',       chance: 4  },
    { item_name: 'Blue Pumpkin',    chance: 1  },
  ]),

  // ── ВИЗУАЛЬНЫЕ шансы (клиент) ─────────────────────────────────────
  // Уходят в /free-roulette/config и показываются игроку в таблице наград.
  // Все сектора равные — создаётся видимость ~16.7% на каждый приз.
  VISUAL_REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 16.67 },
    { item_name: 'Red Hair',        chance: 16.67 },
    { item_name: 'Money Hat',       chance: 16.67 },
    { item_name: 'Blue Coil',       chance: 16.67 },
    { item_name: 'Doge Head',       chance: 16.67 },
    { item_name: 'Blue Pumpkin',    chance: 16.65 },
  ]),
});
