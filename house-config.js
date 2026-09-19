const HOUSE_CONFIG = Object.freeze({

  UPGRADE: {
    GAMMA: 1.12,
    BASE_CHANCE_MULTIPLIER: 0.90,
    HOUSE_EDGE: 0.25,
    ROLL_NOISE: 0.12,

    DISPLAY_GAMMA: 1.0,
    DISPLAY_BASE_CHANCE_MULTIPLIER: 1.0,
    DISPLAY_HOUSE_EDGE: 0.0,

    MIN_CHANCE: 0.1,
    MAX_CHANCE: 95,
    MIN_MULTIPLIER: 1,
    MAX_MULTIPLIER: 100,
    DEFAULT_MULTIPLIER: 1,

    // Lucky — только для server-side demo-режима; клиент не задаёт эти значения.
    LUCKY_CHANCE_MULTIPLIER: 10,
    LUCKY_FLAT_BOOST: 50,
    LUCKY_MAX_CHANCE: 92,

    // Динамика дешёвых апгрейдов (price_stars <= THRESHOLD).
    // Первые HONEYMOON_COUNT успешных — почти гарантированы.
    // После — резкое срезание шанса с потолком AFTER_MAX.
    CHEAP: {
      THRESHOLD: 500,
      HONEYMOON_COUNT: 2,
      HONEYMOON_MIN: 88,
      HONEYMOON_MAX: 96,
      AFTER_MULTIPLIER: 0.35,
      AFTER_MAX: 30,
    },

    // Anti-flood
    PENDING_WINDOW_SEC: 15,
    MIN_INTERVAL_MS: 800,
  },

  ROULETTE: {
    SPIN_PROFILES: [
      { duration: 2900, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
      { duration: 3400, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
      { duration: 4100, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
      { duration: 4700, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
      { duration: 5300, turns: 7, easing: 'cubic-bezier(.1,.75,.22,1)' },
    ],
    SPIN_JITTER: {
      DURATION_MIN: 0.85,
      DURATION_MAX: 1.20,
      EXTRA_TURNS_MAX: 1,
    },
    // Визуальный near-miss: проигрыш всегда за пределами зелёного сектора.
    // BAIT_CHANCE — доля проигрышей, которые падают в байт-зону 2–9° от границы.
    // Остальные раскиданы по всей зоне проигрыша с лёгким смещением к границе.
    NEAR_MISS: {
      MIN_GAP_DEG: 2,
      BAIT_CHANCE: 0.25,
      BAIT_MAX_GAP_DEG: 9,
      BIAS_POW: 1.4,
    },
  },

  // Live-лента
  LIVE_FEED: {
    CACHE_SIZE: 50,
    FAKE_PER_REQUEST: [6, 14],
    ONLINE_WINDOW_SEC: 300,
    ONLINE_MULTIPLIER: 100, // legacy, не используется — онлайн теперь симулируется
  },

  USER_LIMITS: {
    MAX_RECEIVED_VALUE_MULTIPLIER: 1.5,
    MAX_WITHDRAW_VALUE_MULTIPLIER: 1.0,
    MAX_ITEM_VALUE: 50000,
    MIN_DEPOSIT_FOR_WITHDRAW: 0,
    MAX_DAILY_WITHDRAWALS: 10,
    REQUIRE_REFERRAL_FOR_WITHDRAW: true,
    ALLOW_FREE_ITEM_ISSUANCE: true,
    WITHDRAW_WHITELIST: [],
  },

  PAYMENTS: {
    MIN_TOPUP: 50,
    MAX_TOPUP: 500000,
    CURRENCY: 'XTR',
  },

  WITHDRAWAL: {
    STAR_TO_RUB: 0.2,
    COMMISSION_PERCENT: 20,
    MIN_STARS: 100,
    MAX_STARS: 100000,
    MAX_OPEN_REQUESTS: 3,
    METHODS: {
      crypto: { enabled: true,  label: 'Криптовалюта',     icon: '₿',  hint: 'USDT TRC20 · до 48ч' },
      card:   { enabled: false, label: 'Банковская карта', icon: '💳', hint: 'Скоро'              },
      sbp:    { enabled: false, label: 'СБП',              icon: '⚡', hint: 'Скоро'              },
    },
    ADMIN_NOTIFY: true,
  },
});

module.exports = HOUSE_CONFIG;
