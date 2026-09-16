/**
 * RoUP — заглушка механики апгрейда.
 *
 * ВСЯ игровая логика апгрейда должна настраиваться здесь.
 * UI/React не определяет результат и не содержит формул игры.
 *
 * Сейчас здесь намеренно стоит безопасная заглушка:
 * - отображаемый шанс = 50%;
 * - множитель принимается и возвращается без влияния на шанс;
 * - результат определяется случайно по 50%;
 * - при успехе возвращается выбранный targetItem.
 *
 * ЗАМЕНИТЕ ТОЛЬКО ФУНКЦИИ НИЖЕ, когда будете подключать свою механику.
 */

const MIN_CHANCE = 0;
const MAX_CHANCE = 100;
const MAX_MULTIPLIER = 100;
const STUB_CHANCE = 50;

function clampChance(value) {
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, Number(value) || 0));
}

/** Заглушка базового шанса. Настройте свою формулу здесь. */
function calculateBaseChance(_sourceItem, _targetItem) {
  return STUB_CHANCE;
}

/** Заглушка влияния множителя. Пока множитель не изменяет шанс. */
function applyMultiplier(baseChance, multiplier = 1) {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value < 1 || value > MAX_MULTIPLIER) {
    throw new Error('invalid_multiplier');
  }
  return clampChance(baseChance);
}

/**
 * Точка, где принимается финальное серверное решение.
 * Здесь вы можете полностью заменить алгоритм апгрейда.
 */
function resolveUpgrade(sourceItem, targetItem, multiplier = 1) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER) {
    throw new Error('invalid_multiplier');
  }

  const baseChance = clampChance(calculateBaseChance(sourceItem, targetItem));
  const chance = clampChance(applyMultiplier(baseChance, safeMultiplier));
  const roll = Math.random() * 100;
  const success = roll < chance;

  return {
    success,
    resultItemId: success ? targetItem?.id ?? null : null,
    chance: Number(chance.toFixed(2)),
    baseChance: Number(baseChance.toFixed(2)),
    roll: Number(roll.toFixed(2)),
    multiplier: safeMultiplier
  };
}

/** Шанс для отображения в Web App. Не принимает игрового решения. */
function displayPercent(sourceItem, targetItem, multiplier = 1) {
  const base = calculateBaseChance(sourceItem, targetItem);
  return Number(clampChance(applyMultiplier(base, Number(multiplier) || 1)).toFixed(2));
}

module.exports = {
  MIN_CHANCE,
  MAX_CHANCE,
  MAX_MULTIPLIER,
  calculateBaseChance,
  applyMultiplier,
  resolveUpgrade,
  displayPercent
};
