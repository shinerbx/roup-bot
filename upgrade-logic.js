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

function calculateDisplayChance(sourceItem, targetItem) {
  if (!canUpgradeTo(sourceItem, targetItem)) return 0;
  const s = Number(sourceItem.price_stars);
  const t = Number(targetItem.price_stars);
  const ratio = Math.pow(s / t, UPGRADE.DISPLAY_GAMMA);
  const base = ratio * 100 * UPGRADE.DISPLAY_BASE_CHANCE_MULTIPLIER;
  const withEdge = base * (1 - UPGRADE.DISPLAY_HOUSE_EDGE);
  return clampChance(withEdge);
}

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

function pickLandingAngle(success, displayChance) {
  const zone = Math.max(0.5, clampChance(displayChance) * 3.6);

  if (success) {
    return Number((zone * (0.05 + Math.random() * 0.9)).toFixed(2));
  }

  const missArc = 360 - zone;
  if (missArc <= 2) {
    const fallback = Math.random() < 0.5 ? 359.5 : zone + 0.5;
    return Number((fallback % 360).toFixed(2));
  }

  const cfg = ROULETTE.NEAR_MISS || {};
  const rawMin = Number(cfg.MIN_GAP_DEG) || 2;
  const minGap = Math.max(0.5, Math.min(rawMin, missArc * 0.10));
  const maxGap = Math.max(minGap + 0.1, missArc - minGap);

  let gap;

  const baitChance = Math.max(0, Math.min(1, Number(cfg.BAIT_CHANCE) || 0));
  const baitMax = Math.max(minGap + 0.5, Number(cfg.BAIT_MAX_GAP_DEG) || 9);
  const biasPow = Number(cfg.BIAS_POW) || 1.4;

  if (baitChance > 0 && Math.random() < baitChance && baitMax > minGap) {
    gap = minGap + Math.random() * (baitMax - minGap);
    if (gap > maxGap) gap = maxGap;
  } else {
    const u = Math.random();
    const t = Math.pow(u, biasPow);
    gap = minGap + t * (maxGap - minGap);
  }

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
  const isDailyWelcome = Boolean(opts?.isDailyWelcome);

  let realBase = calculateRealChance(sourceItem, targetItem, safeMultiplier);

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

  // ── Daily-welcome override (первый апгрейд за сутки, UTC) ──────────
  const welcome = UPGRADE.DAILY_WELCOME;
  if (isDailyWelcome && welcome?.ENABLED && !luckyMode) {
    const maxPrice = Number(welcome.MAX_PRICE_STARS) || 500;
    if (Number.isFinite(sourcePrice) && sourcePrice < maxPrice) {
      const lo = Number(welcome.WELCOME_SUCCESS_MIN) || 88;
      const hi = Number(welcome.WELCOME_SUCCESS_MAX) || 98;
      realBase = lo + Math.random() * (hi - lo);
      cheapPhase = 'daily_welcome';
    }
  }

  // ── CHEAP_BOOST — лёгкий буст для апгрейдов до 300–400 звёзд ───────
  const boost = welcome?.CHEAP_BOOST;
  if (!luckyMode && !isDailyWelcome && boost && isCheap) {
    const maxPrice = Number(boost.MAX_PRICE_STARS) || 400;
    if (sourcePrice <= maxPrice) {
      const mult = Number(boost.MULTIPLIER) || 1.25;
      const cap = Number(boost.MAX_CHANCE) || 65;
      realBase = Math.min(cap, realBase * mult);
    }
  }

  const realFinal = applyLucky(realBase, luckyMode);
  const roll = crypto.randomInt(0, 1_000_000) / 10_000;
  const success = roll < realFinal;

  const displayChance = calculateDisplayChance(sourceItem, targetItem);
  const landingAngle = pickLandingAngle(success, displayChance);

  return {
    success,
    resultItemId: success ? targetItem.id : null,
    chance: Number(displayChance.toFixed(1)),
    expectedChance: Number(displayChance.toFixed(1)),
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
  return calculateDisplayChance(sourceItem, targetItem);
}
function applyMultiplier(baseChance, multiplier = 1) {
  const safe = Math.max(1, Number(multiplier) || 1);
  return clampChance(Number(baseChance) / safe);
}
function applyHouseEdge(chance) {
  return clampChance(Number(chance) * (1 - UPGRADE.DISPLAY_HOUSE_EDGE));
}
function displayPercent(sourceItem, targetItem) {
  return Number(calculateDisplayChance(sourceItem, targetItem).toFixed(1));
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
