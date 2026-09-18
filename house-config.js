// house-config.js — единая экономика RoUP.
// Внутренние значения (REAL) — то, против чего играет RNG. Игрок не видит.
// Внешние значения (DISPLAY) — то, что показывается в UI. Честная формула.

const HOUSE_CONFIG = Object.freeze({

  // ── UPGRADE ──────────────────────────────────────────────────────────
  UPGRADE: {
    // ── РЕАЛЬНЫЙ расчёт (RNG против этого). НЕ показывается игроку ──
    GAMMA: 1.08,                    // 1.0 = честно, 1.08 = +8% маржи
    BASE_CHANCE_MULTIPLIER: 0.95,   // 0.95 = ещё -5% к шансу
    HOUSE_EDGE: 0.20,               // 0.20 = срезать 20% от честного

    // ── ОТОБРАЖАЕМЫЙ расчёт (для UI). Честная математика ─────────────
    // По умолчанию 1.0 / 1.0 / 0.0 → показывает чистое (source/target)/mult.
    // Если хочешь отображать «мягче» или «жёстче» — правь здесь.
    DISPLAY_GAMMA: 1.0,
    DISPLAY_BASE_CHANCE_MULTIPLIER: 1.0,
    DISPLAY_HOUSE_EDGE: 0.0,

    // ── Границы (применяются к обеим формулам) ───────────────────────
    MIN_CHANCE: 0.1,
    MAX_CHANCE: 95,

    MIN_MULTIPLIER: 1,
    MAX_MULTIPLIER: 100,
    DEFAULT_MULTIPLIER: 1,
  },

  // ── РУЛЕТКА (косметика, идёт только на клиент) ───────────────────────
  ROULETTE: {
    // Разные профили кручения — клиент случайно выбирает один
    SPIN_PROFILES: [
      { duration: 3200, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
      { duration: 3800, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
      { duration: 4400, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
      { duration: 5000, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
    ],
    // Веса близости промаха (байт-эффект «почти попал»). Сумма = 1.0.
    NEAR_MISS: {
      MILLIMETER: 0.60,  // 0.5°–2.5° за границей
      CLOSE: 0.25,       // 2.5°–10°
      FAR: 0.15,         // 10°–60°
    },
  },

  // ── ЛИМИТЫ ──────────────────────────────────────────────────────────
  USER_LIMITS: {
    MAX_RECEIVED_VALUE_MULTIPLIER: 1.5,
    MAX_WITHDRAW_VALUE_MULTIPLIER: 1.0,
    MAX_ITEM_VALUE: 50000,
    MIN_DEPOSIT_FOR_WITHDRAW: 0,
    MAX_DAILY_WITHDRAWALS: 10,
    REQUIRE_REFERRAL_FOR_WITHDRAW: true,
    ALLOW_FREE_ITEM_ISSUANCE: true,
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
