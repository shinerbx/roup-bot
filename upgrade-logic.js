const crypto = require('crypto');
const { UPGRADE, ROULETTE } = require('./house-config');

const MIN_CHANCE = UPGRADE.MIN_CHANCE;
const MAX_CHANCE = UPGRADE.MAX_CHANCE;
const MAX_MULTIPLIER = UPGRADE.MAX_MULTIPLIER;

function clampChance(value) {
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, Number(value) || 0));
}

function canUpgradeTo(sourceItem, targetItem) {
  if (!sourceItem || !targetItem) return false;
  const s = Number(sourceItem.price_stars);
  const t = Number(targetItem.price_stars);
  return Number.isFinite(s) && Number.isFinite(t) && t > s;
}

function _calcWithParams(sourceItem, targetItem, multiplier, gamma, baseMult, edge) {
  if (!canUpgradeTo(sourceItem, targetItem)) return 0;
  const s = Number(sourceItem.price_stars);
  const t = Number(targetItem.price_stars);
  const safeMult = Math.max(1, Number(multiplier) || 1);

  const ratio = Math.pow(s / t, gamma);
  const base = ratio * 100 * baseMult;
  const withMult = base / safeMult;
  const withEdge = withMult * (1 - edge);
  return clampChance(withEdge);
}

function calculateRealBaseChance(sourceItem, targetItem, multiplier = 1) {
  return _calcWithParams(sourceItem, targetItem, multiplier,
    UPGRADE.GAMMA, UPGRADE.BASE_CHANCE_MULTIPLIER, UPGRADE.HOUSE_EDGE);
}

function applyRollNoise(baseChance) {
  const noise = Number(UPGRADE.ROLL_NOISE) || 0;
  if (noise <= 0) return baseChance;
  const factor = 1 + (Math.random() * 2 - 1) * noise;
  return clampChance(baseChance * factor);
}

function calculateRealChance(sourceItem, targetItem, multiplier = 1) {
  const base = calculateRealBaseChance(sourceItem, targetItem, multiplier);
  return applyRollNoise(base);
}

function calculateDisplayChance(sourceItem, targetItem, multiplier = 1) {
  return _calcWithParams(sourceItem, targetItem, multiplier,
    UPGRADE.DISPLAY_GAMMA, UPGRADE.DISPLAY_BASE_CHANCE_MULTIPLIER, UPGRADE.DISPLAY_HOUSE_EDGE);
}

// User-facing expected chance is derived only from the selected multiplier.
// It intentionally does not expose the server's real/effective odds.
function calculateExpectedChance(multiplier = 1) {
  const safeMult = Math.max(1, Number(multiplier) || 1);
  return Math.min(100, Math.max(MIN_CHANCE, 100 / safeMult));
}

function applyLucky(realChance, luckyMode) {
  if (!luckyMode) return realChance;
  const mult = Number(UPGRADE.LUCKY_CHANCE_MULTIPLIER) || 10;
  const flat = Number(UPGRADE.LUCKY_FLAT_BOOST) || 50;
  const cap = Number(UPGRADE.LUCKY_MAX_CHANCE) || 92;
  return Math.min(cap, Number(realChance) * mult + flat);
}

/**
 * Угол приземления стрелки (0–360°), рисуется по часовой от верха.
 * Визуальный сектор выигрыша = expectedChance × 3.6°.
 *
 * Проигрыш: угол попадает в зону проигрыша со смещением от края.
 * Минимальный зазор MIN_GAP_DEG убирает «почти повезло»,
 * BIAS_POW < 1 раскидывает остановки по всей ширине зоны проигрыша.
 */
function pickLandingAngle(success, displayChance) {
  const zone = Math.max(0.5, clampChance(displayChance) * 3.6);

  if (success) {
    // 5%..95% от ширины зоны — стрелка точно в зелёном секторе
    return Number((zone * (0.05 + Math.random() * 0.9)).toFixed(2));
  }

  const missArc = 360 - zone;
  if (missArc <= 2) {
    // Практически не бывает: слишком узкая зона проигрыша.
    const fallback = Math.random() < 0.5 ? 359.5 : zone + 0.5;
    return Number((fallback % 360).toFixed(2));
  }

  const cfg = ROULETTE.NEAR_MISS || {};
  const minGap = Math.max(0.5, Math.min(Number(cfg.MIN_GAP_DEG) || 3, missArc * 0.10));
  const maxGap = Math.max(minGap + 0.1, missArc - minGap);
  const biasPow = Number(cfg.BIAS_POW) || 0.7;

  const u = Math.random();
  const t = Math.pow(u, biasPow);
  const gap = minGap + t * (maxGap - minGap);

  const before = Math.random() < 0.5;
  const offset = Math.min(gap, missArc - 0.2);
  const angle = before ? (360 - offset) : (zone + offset);

  return Number((angle % 360).toFixed(2));
}

function resolveUpgrade(sourceItem, targetItem, multiplier = 1, opts = {}) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier)
      || safeMultiplier < 1
      || safeMultiplier > MAX_MULTIPLIER
      || Math.abs(safeMultiplier * 10 - Math.round(safeMultiplier * 10)) >= 1e-9) {
    throw new Error('invalid_multiplier');
  }
  if (!canUpgradeTo(sourceItem, targetItem)) {
    throw new Error('target_not_higher');
  }

  const luckyMode = Boolean(opts?.luckyMode);
  const cheapCount = Number(opts?.cheapUpgradesCount) || 0;

  let realBase = calculateRealChance(sourceItem, targetItem, safeMultiplier);

  // ── Динамика дешёвых апгрейдов ────────────────────────────────────
  const cheap = UPGRADE.CHEAP || null;
  const sourcePrice = Number(sourceItem.price_stars);
  const isCheap = cheap
    && Number.isFinite(sourcePrice)
    && sourcePrice <= Number(cheap.THRESHOLD);

  let cheapPhase = null;
  if (isCheap && !luckyMode) {
    if (cheapCount < Number(cheap.HONEYMOON_COUNT)) {
      const lo = Number(cheap.HONEYMOON_MIN) || 88;
      const hi = Number(cheap.HONEYMOON_MAX) || 96;
      realBase = lo + Math.random() * (hi - lo);
      cheapPhase = 'honeymoon';
    } else {
      const mult = Number(cheap.AFTER_MULTIPLIER) || 0.35;
      const cap = Number(cheap.AFTER_MAX) || 30;
      realBase = Math.min(cap, realBase * mult);
      cheapPhase = 'shaved';
    }
  }

  const realFinal = applyLucky(realBase, luckyMode);

  const roll = crypto.randomInt(0, 1_000_000) / 10_000;
  const success = roll < realFinal;

  const displayChance = calculateDisplayChance(sourceItem, targetItem, safeMultiplier);
  const expectedChance = calculateExpectedChance(safeMultiplier);
  const landingAngle = pickLandingAngle(success, expectedChance);

  return {
    success,
    resultItemId: success ? targetItem.id : null,
    chance: Number((luckyMode ? realFinal : displayChance).toFixed(1)),
    expectedChance: Number(expectedChance.toFixed(1)),
    multiplier: safeMultiplier,
    landingAngle,
    cheapPhase,
    _realBase: Number(realBase.toFixed(2)),
    _realFinal: Number(realFinal.toFixed(2)),
    _roll: Number(roll.toFixed(2)),
    _luckyApplied: luckyMode && realFinal > realBase,
  };
}

function calculateBaseChance(sourceItem, targetItem) {
  return calculateDisplayChance(sourceItem, targetItem, 1);
}
function applyMultiplier(baseChance, multiplier = 1) {
  const safe = Math.max(1, Number(multiplier) || 1);
  return clampChance(Number(baseChance) / safe);
}
function applyHouseEdge(chance) {
  return clampChance(Number(chance) * (1 - UPGRADE.DISPLAY_HOUSE_EDGE));
}
function displayPercent(sourceItem, targetItem, multiplier = 1) {
  return Number(calculateDisplayChance(sourceItem, targetItem, multiplier).toFixed(1));
}

module.exports = {
  MIN_CHANCE,
  MAX_CHANCE,
  MAX_MULTIPLIER,
  calculateRealBaseChance,
  calculateRealChance,
  calculateDisplayChance,
  calculateExpectedChance,
  applyRollNoise,
  applyLucky,
  calculateBaseChance,
  applyMultiplier,
  applyHouseEdge,
  displayPercent,
  canUpgradeTo,
  resolveUpgrade,
  pickLandingAngle,
};
