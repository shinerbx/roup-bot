// upgrade-logic.js
// Сервер держит два независимых расчёта:
//   realChance    — против него катается RNG, с маржой + джиттером. НИКОГДА не покидает сервер.
//   displayChance — честная формула, уходит клиенту для UI.
const crypto = require('crypto');
const { UPGRADE } = require('./house-config');

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
  return _calcWithParams(
    sourceItem, targetItem, multiplier,
    UPGRADE.GAMMA,
    UPGRADE.BASE_CHANCE_MULTIPLIER,
    UPGRADE.HOUSE_EDGE
  );
}

function calculateRealChance(sourceItem, targetItem, multiplier = 1) {
  const base = calculateRealBaseChance(sourceItem, targetItem, multiplier);
  return applyRollNoise(base);
}

function applyRollNoise(baseChance) {
  const noise = Number(UPGRADE.ROLL_NOISE) || 0;
  if (noise <= 0) return baseChance;
  const factor = 1 + (Math.random() * 2 - 1) * noise;
  return clampChance(baseChance * factor);
}

function calculateDisplayChance(sourceItem, targetItem, multiplier = 1) {
  return _calcWithParams(
    sourceItem, targetItem, multiplier,
    UPGRADE.DISPLAY_GAMMA,
    UPGRADE.DISPLAY_BASE_CHANCE_MULTIPLIER,
    UPGRADE.DISPLAY_HOUSE_EDGE
  );
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

function resolveUpgrade(sourceItem, targetItem, multiplier = 1) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER
      || Math.abs(safeMultiplier * 10 - Math.round(safeMultiplier * 10)) >= 1e-9) {
    throw new Error('invalid_multiplier');
  }
  if (!canUpgradeTo(sourceItem, targetItem)) {
    throw new Error('target_not_higher');
  }

  const realChance = calculateRealChance(sourceItem, targetItem, safeMultiplier);
  const roll = crypto.randomInt(0, 1_000_000) / 10_000;
  const success = roll < realChance;

  const displayChance = calculateDisplayChance(sourceItem, targetItem, safeMultiplier);

  return {
    success,
    resultItemId: success ? targetItem.id : null,
    chance: Number(displayChance.toFixed(1)),
    baseChance: Number(displayChance.toFixed(2)),
    multiplier: safeMultiplier,
  };
}

module.exports = {
  MIN_CHANCE,
  MAX_CHANCE,
  MAX_MULTIPLIER,
  calculateRealBaseChance,
  calculateRealChance,
  calculateDisplayChance,
  applyRollNoise,
  calculateBaseChance,
  applyMultiplier,
  applyHouseEdge,
  displayPercent,
  canUpgradeTo,
  resolveUpgrade,
};
