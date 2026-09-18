// language: JavaScript, file: house-config.js, target: Node.js
// *Единая конфигурация экономики. Всё, что тюнится — здесь. Заморожен.*

'use strict';

const HOUSE_CONFIG = Object.freeze({
  // ═══════════════════════════════════════════════════════════════════
  // АПГРЕЙД
  // ═══════════════════════════════════════════════════════════════════
  UPGRADE: Object.freeze({
    // ── Реальный расчёт (идёт в RNG, видит только сервер) ──
    GAMMA: 1.35,
    BASE_CHANCE_MULTIPLIER: 0.95,
    HOUSE_EDGE: 0.12,
    ROLL_NOISE: 0.05,

    // ── Отображаемый расчёт (честный, видит клиент) ──
    DISPLAY_GAMMA: 1.25,
    DISPLAY_BASE_CHANCE_MULTIPLIER: 1.0,
    DISPLAY_HOUSE_EDGE: 0.0,

    MIN_CHANCE: 0.5,
    MAX_CHANCE: 95,

    MIN_MULTIPLIER: 1.5,
    MAX_MULTIPLIER: 100,

    // ── Lucky / demo ──
    LUCKY_CHANCE_MULTIPLIER: 8,
    LUCKY_FLAT_BOOST: 25,
    LUCKY_MAX_CHANCE: 85,
  }),

  // ═══════════════════════════════════════════════════════════════════
  // РУЛЕТКА
  // ═══════════════════════════════════════════════════════════════════
  ROULETTE: Object.freeze({
    SPIN_PROFILES: [
      { duration: 2900, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
      { duration: 3400, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
      { duration: 4100, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
      { duration: 4700, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
      { duration: 5300, turns: 7, easing: 'cubic-bezier(.1,.75,.22,1)' },
    ],
    SPIN_JITTER: Object.freeze({
      DURATION_MIN: 0.85,
      DURATION_MAX: 1.20,
      EXTRA_TURNS_MAX: 1,
    }),
    NEAR_MISS: Object.freeze({
      WIN_MARGIN_MIN: 0.15,
      WIN_MARGIN_MAX: 0.85,
      LOSE_MARGIN_MIN: 0.05,
      LOSE_MARGIN_MAX: 0.55,
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════
  // LIVE-ЛЕНТА И ОНЛАЙН
  // ═══════════════════════════════════════════════════════════════════
  LIVE_FEED: Object.freeze({
    CACHE_SIZE: 50,
    FAKE_PER_REQUEST: 12,
    ONLINE_WINDOW_SEC: 300,
    ONLINE_MULTIPLIER: 100,
  }),

  // ═══════════════════════════════════════════════════════════════════
  // ЛИМИТЫ ПОЛЬЗОВАТЕЛЯ
  // ═══════════════════════════════════════════════════════════════════
  USER_LIMITS: Object.freeze({
    MAX_RECEIVED_VALUE_MULTIPLIER: 3,
    MAX_WITHDRAW_VALUE_MULTIPLIER: 2,
    MAX_ITEM_VALUE: 50000,
    MIN_DEPOSIT_FOR_WITHDRAW: 100,
    MAX_DAILY_WITHDRAWALS: 3,
    REQUIRE_REFERRAL_FOR_WITHDRAW: true,
    // Кто обходит реф-гейт и demo-блок
    WITHDRAW_WHITELIST: [],
  }),

  // ═══════════════════════════════════════════════════════════════════
  // ВЫВОД
  // ═══════════════════════════════════════════════════════════════════
  WITHDRAWAL: Object.freeze({
    STAR_TO_RUB: 0.2,
    COMMISSION_PERCENT: 20,
    MIN_STARS: 100,
    MAX_STARS: 100000,
    MAX_OPEN_REQUESTS: 3,
    ADMIN_NOTIFY: true,

    METHODS: Object.freeze({
      crypto: Object.freeze({
        enabled: true,
        label: 'Криптовалюта',
        icon: '₿',
        hint: 'USDT TRC20 · до 48ч',
        description: 'Вывод в USDT (TRC20). Минимальная сумма — 100 ⭐.',
      }),
      card: Object.freeze({
        enabled: false,
        label: 'Банковская карта',
        icon: '💳',
        hint: 'Скоро',
        description: 'Вывод на карту РФ. Временно недоступен.',
      }),
      sbp: Object.freeze({
        enabled: false,
        label: 'СБП',
        icon: '⚡',
        hint: 'Скоро',
        description: 'Вывод через Систему быстрых платежей. Временно недоступен.',
      }),
    }),

    POLICY: Object.freeze({
      title: 'Условия вывода',
      lines: [
        'Курс: 1 ⭐ = 0.20 ₽',
        'Комиссия: 20% от суммы',
        'Срок обработки: до 48 часов',
        'Минимум: 100 ⭐ · Максимум: 100 000 ⭐',
        'Не более 3 открытых заявок одновременно',
        'Вывод разблокируется после приглашения друзей',
      ],
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════
  // ПЛАТЕЖИ
  // ═══════════════════════════════════════════════════════════════════
  PAYMENTS: Object.freeze({
    MIN_TOPUP: 100,
    MAX_TOPUP: 100000,
    CURRENCY: 'XTR',
  }),
});

// ── Прямые экспорты для удобства импорта ──
module.exports = {
  HOUSE_CONFIG,
  UPGRADE: HOUSE_CONFIG.UPGRADE,
  ROULETTE: HOUSE_CONFIG.ROULETTE,
  LIVE_FEED: HOUSE_CONFIG.LIVE_FEED,
  USER_LIMITS: HOUSE_CONFIG.USER_LIMITS,
  WITHDRAWAL: HOUSE_CONFIG.WITHDRAWAL,
  PAYMENTS: HOUSE_CONFIG.PAYMENTS,
};
