// Бесплатная рулетка за приглашение друзей.
//
// Здесь можно менять награды и их шансы без правок фронтенда или БД.
// `item_name` должен точно совпадать с названием предмета в catalog.js.
// Сумма chance должна быть равна 100. Этот же chance используется и для розыгрыша,
// и для таблицы наград в приложении — игрок видит реальные шансы.

module.exports = Object.freeze({
  // Сколько бесплатных прокруток получает пригласивший за каждого нового игрока.
  REFERRAL_SPINS_PER_FRIEND: 1,

  // Оставить ли прежний бонус «стартовый предмет за друга» вместе с прокруткой.
  // false — за друга начисляется только прокрутка.
  REFERRAL_STARTER_ITEM: true,

  // Сколько новых рефералов засчитывается одному игроку за сутки (защита от накрутки).
  MAX_REFERRALS_PER_DAY: 50,

  // true — один раз превратить уже накопленные приглашения в прокрутки при следующем запуске.
  // Оставь false, если не хочешь раздавать прокрутки задним числом.
  SEED_SPINS_FROM_EXISTING_REFERRALS: false,

  // Настройки визуальной прокрутки. Они не влияют на выбор приза.
  SPIN: Object.freeze({
    DURATION_MS: 4600,
    MIN_CARDS: 34,
    TARGET_INDEX: 28,
  }),

  REWARDS: Object.freeze([
    { item_name: 'Baseball Cap',    chance: 52 },
    { item_name: 'Red Hair',        chance: 24 },
    { item_name: 'Money Hat',       chance: 12 },
    { item_name: 'Blue Coil',       chance: 7 },
    { item_name: 'Doge Head',       chance: 4 },
    { item_name: 'Blue Pumpkin',    chance: 1 },
  ]),
});
