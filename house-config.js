// house-config.js — единая экономика RoUP.
// Внутренние значения (REAL) — то, против чего играет RNG. Игрок не видит.
// Внешние значения (DISPLAY) — то, что показывается в UI. Честная формула.

const HOUSE_CONFIG = Object.freeze({

  // ── UPGRADE ──────────────────────────────────────────────────────────
  UPGRADE: {
    // ── РЕАЛЬНЫЙ расчёт (RNG против этого). НЕ показывается игроку ──
    GAMMA: 1.12,                    // 1.0 = честно, 1.12 = нелинейный штраф
    BASE_CHANCE_MULTIPLIER: 0.90,   // -10% к шансу
    HOUSE_EDGE: 0.25,               // -25% от честного шанса

    // Джиттер на каждый бросок. Не меняет EV (шум с нулевым средним),
    // но раздувает дисперсию — игроку сложнее поймать реальный процент.
    // 0.0 = выключено. 0.12 = ±12% разброс. Больше 0.20 не ставить.
    ROLL_NOISE: 0.12,

    // ── ОТОБРАЖАЕМЫЙ расчёт (для UI). Честная математика ─────────────
    // Не трогать. Именно эти числа видит игрок.
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
    SPIN_PROFILES: [
      { duration: 3200, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
      { duration: 3800, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
      { duration: 4400, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
      { duration: 5000, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
    ],
    NEAR_MISS: {
      MILLIMETER: 0.60,
      CLOSE: 0.25,
      FAR: 0.15,
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
