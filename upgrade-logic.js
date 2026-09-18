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
 * Реальный серверный шанс не используется для отрисовки и не раскрывается клиенту как
 * пользовательский шанс. При этом визуальный исход всегда совпадает с success.
 */
function pickLandingAngle(success, displayChance) {
  const zone = Math.max(0.5, clampChance(displayChance) * 3.6);

  if (success) {
    // 5%..95% от ширины зоны — стрелка точно в зелёном секторе
    return Number((zone * (0.05 + Math.random() * 0.9)).toFixed(2));
  }

  const weights = ROULETTE.NEAR_MISS;
  const r = Math.random();
  let gap;

  if (r < weights.MILLIMETER) {
    gap = 0.15 + Math.random() * 0.95;     // практически у самой границы
  } else if (r < weights.MILLIMETER + weights.CLOSE) {
    gap = 1.2 + Math.random() * 3.8;
  } else {
    gap = 5 + Math.random() * 15;
  }

  const missArc = 360 - zone;
  const before = Math.random() < 0.5;
  const offset = Math.min(gap, Math.max(0.2, missArc - 0.3));
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

  const realBase = calculateRealChance(sourceItem, targetItem, safeMultiplier);
  const realFinal = applyLucky(realBase, luckyMode);

  const roll = crypto.randomInt(0, 1_000_000) / 10_000;
  const success = roll < realFinal;

  const displayChance = calculateDisplayChance(sourceItem, targetItem, safeMultiplier);
  const expectedChance = calculateExpectedChance(safeMultiplier);
  // Visual-only landing uses the expected multiplier-based chance.
  // The actual success decision above remains based on realFinal.
  const landingAngle = pickLandingAngle(success, expectedChance);

  return {
    success,
    resultItemId: success ? targetItem.id : null,
    // Keep chance for backwards compatibility/server diagnostics, but expose
    // a separate explicit expectedChance for the client-facing UI.
    chance: Number((luckyMode ? realFinal : displayChance).toFixed(1)),
    expectedChance: Number(expectedChance.toFixed(1)),
    multiplier: safeMultiplier,
    landingAngle,
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
