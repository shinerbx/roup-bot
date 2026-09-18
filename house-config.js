// house-config.js — единая экономика RoUP. Меняй здесь — перезапуск подхватит.

const HOUSE_CONFIG = Object.freeze({

  // ── UPGRADE — профит-модель ──────────────────────────────────────────
  UPGRADE: {
    // Нелинейный штраф за дальний апгрейд. 1.0 = линейно, 1.08 = +8% маржи,
    // 1.15 = жёстко. Профит-дефолт: 1.08
    GAMMA: 1.08,

    // Множитель поверх формулы. 0.95 = ещё -5% к шансу.
    BASE_CHANCE_MULTIPLIER: 0.95,

    // Срез шанса. 0.20 = игрок теряет 20% от честного шанса.
    // 0.15 — мягко, 0.28 — агрессивно.
    HOUSE_EDGE: 0.20,

    // Границы. Потолок 65 — чтобы даже близкий апгрейд не выглядел честным.
    MIN_CHANCE: 0.5,
    MAX_CHANCE: 65,

    MIN_MULTIPLIER: 1,
    MAX_MULTIPLIER: 100,
    DEFAULT_MULTIPLIER: 1,
  },

  // ── ЛИМИТЫ ПОЛЬЗОВАТЕЛЯ ─────────────────────────────────────────────
  USER_LIMITS: {
    MAX_RECEIVED_VALUE_MULTIPLIER: 1.5,
    MAX_WITHDRAW_VALUE_MULTIPLIER: 1.0,
    MAX_ITEM_VALUE: 50000,
    MIN_DEPOSIT_FOR_WITHDRAW: 0,
    MAX_DAILY_WITHDRAWALS: 10,
    REQUIRE_REFERRAL_FOR_WITHDRAW: true,
    ALLOW_FREE_ITEM_ISSUANCE: true,
  },

  // ── ПЛАТЕЖИ ──────────────────────────────────────────────────────────
  PAYMENTS: {
    MIN_TOPUP: 50,
    MAX_TOPUP: 500000,
    CURRENCY: 'XTR',
  },

  // ── ВЫВОД ────────────────────────────────────────────────────────────
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