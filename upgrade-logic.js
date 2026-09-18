// upgrade-logic.js — профит-модель шанса. Параметры в house-config.js.
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
  const sourcePrice = Number(sourceItem.price_stars);
  const targetPrice = Number(targetItem.price_stars);
  return Number.isFinite(sourcePrice) && Number.isFinite(targetPrice) && targetPrice > sourcePrice;
}

// База: (source/target)^GAMMA × 100 × BASE_CHANCE_MULTIPLIER
function calculateBaseChance(sourceItem, targetItem) {
  if (!canUpgradeTo(sourceItem, targetItem)) return 0;
  const sourcePrice = Number(sourceItem.price_stars);
  const targetPrice = Number(targetItem.price_stars);
  const ratio = Math.pow(sourcePrice / targetPrice, UPGRADE.GAMMA);
  return clampChance(ratio * 100 * UPGRADE.BASE_CHANCE_MULTIPLIER);
}

// Множитель делит шанс. ×10 → шанс / 10.
function applyMultiplier(baseChance, multiplier = 1) {
  const safeMultiplier = Number(multiplier) || 1;
  return clampChance(Number(baseChance) / safeMultiplier);
}

function resolveUpgrade(sourceItem, targetItem, multiplier = 1) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER || Math.abs(safeMultiplier * 10 - Math.round(safeMultiplier * 10)) >= 1e-9) {
    throw new Error('invalid_multiplier');
  }
  if (!canUpgradeTo(sourceItem, targetItem)) {
    throw new Error('target_not_higher');
  }

  const baseChance = calculateBaseChance(sourceItem, targetItem);
  const afterMultiplier = applyMultiplier(baseChance, safeMultiplier);
  const finalChance = clampChance(afterMultiplier * (1 - UPGRADE.HOUSE_EDGE));

  const roll = crypto.randomInt(0, 1_000_000) / 10_000;
  const success = roll < finalChance;

  return {
    success,
    resultItemId: success ? targetItem.id : null,
    chance: Number(finalChance.toFixed(2)),
    baseChance: Number(baseChance.toFixed(2)),
    roll: Number(roll.toFixed(2)),
    multiplier: safeMultiplier
  };
}

function displayPercent(sourceItem, targetItem, multiplier = 1) {
  const base = calculateBaseChance(sourceItem, targetItem);
  const afterMultiplier = applyMultiplier(base, Number(multiplier) || 1);
  return Number(clampChance(afterMultiplier * (1 - UPGRADE.HOUSE_EDGE)).toFixed(2));
}

module.exports = {
  MIN_CHANCE,
  MAX_CHANCE,
  MAX_MULTIPLIER,
  calculateBaseChance,
  applyMultiplier,
  canUpgradeTo,
  resolveUpgrade,
  displayPercent
};