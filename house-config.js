// house-config.js — единая экономика RoUP.
// Внутренние значения (REAL) — против чего играет RNG. Игрок не видит.
// Внешние значения (DISPLAY) — то, что показывается в UI. Честная формула.

const HOUSE_CONFIG = Object.freeze({

  // ── UPGRADE ──────────────────────────────────────────────────────────
  UPGRADE: {
    // ── РЕАЛЬНЫЙ расчёт (RNG против этого). НЕ показывается игроку ──
    GAMMA: 1.12,
    BASE_CHANCE_MULTIPLIER: 0.90,
    HOUSE_EDGE: 0.25,
    ROLL_NOISE: 0.12,

    // ── ОТОБРАЖАЕМЫЙ расчёт (для UI). Честная математика ─────────────
    DISPLAY_GAMMA: 1.0,
    DISPLAY_BASE_CHANCE_MULTIPLIER: 1.0,
    DISPLAY_HOUSE_EDGE: 0.0,

    MIN_CHANCE: 0.1,
    MAX_CHANCE: 95,
    MIN_MULTIPLIER: 1,
    MAX_MULTIPLIER: 100,
    DEFAULT_MULTIPLIER: 1,
  },

  // ── РУЛЕТКА (косметика, идёт на клиент через /api/upgrade/config) ──
  ROULETTE: {
    // Базовые профили кручения. На клиенте к каждому добавляется джиттер.
    SPIN_PROFILES: [
      { duration: 2900, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
      { duration: 3400, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
      { duration: 4100, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
      { duration: 4700, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
      { duration: 5300, turns: 7, easing: 'cubic-bezier(.1,.75,.22,1)' },
    ],

    // Разброс на каждый спин, чтобы ни один не был похож на другой.
    SPIN_JITTER: {
      DURATION_MIN: 0.85,   // 0.85 × базовая длительность
      DURATION_MAX: 1.20,   // 1.20 ×
      EXTRA_TURNS_MAX: 1,   // +0 или +1 оборот сверху
    },

    // Распределение промахов. Сумма = 1.0.
    // MILLIMETER — прямо у границы зоны (самое «палевное»).
    // FAR — в стороне, выглядит как честный промах.
    NEAR_MISS: {
      MILLIMETER: 0.20,
      CLOSE: 0.30,
      FAR: 0.50,
    },
  },

  USER_LIMITS: {
    MAX_RECEIVED_VALUE_MULTIPLIER: 1.5,
    MAX_WITHDRAW_VALUE_MULTIPLIER: 1.0,
    MAX_ITEM_VALUE: 50000,
    MIN_DEPOSIT_FOR_WITHDRAW: 0,
    MAX_DAILY_WITHDRAWALS: 10,
    REQUIRE_REFERRAL_FOR_WITHDRAW: true,
    ALLOW_FREE_ITEM_ISSUANCE: true,

    // Telegram ID, которые обходят реферальный гейт на вывод.
    // ADMIN_CHAT_ID из env добавляется автоматически в webapp-api.js.
    // Сюда добавляй свои тестовые аккаунты по одному в строке.
    WITHDRAW_WHITELIST: [
         6043384033,
      // 987654321,
    ],
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
