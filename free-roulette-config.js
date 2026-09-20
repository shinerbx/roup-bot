// Бесплатная рулетка за приглашение друзей.
//
// Здесь можно менять награды и их шансы без правок фронтенда или БД.
// `item_name` должен точно совпадать с названием предмета в catalog.js.
// Сумма chance должна быть равна 100.

module.exports = Object.freeze({
  REFERRAL_SPINS_PER_FRIEND: 1,

  // Настройки визуальной прокрутки. Они не влияют на выбор приза.
  SPIN: Object.freeze({
    DURATION_MS: 4600,
    MIN_CARDS: 34,
    TARGET_INDEX: 28,
  }),

  REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 52 },
    { item_name: 'Red Shaggy',      chance: 24 },
    { item_name: 'Money Hat',       chance: 12 },
    { item_name: 'Builder Hat',     chance: 7 },
    { item_name: 'Doge Head',       chance: 4 },
    { item_name: 'Dominus Empyreus', chance: 1 },
  ]),
});
