/**
 * ЛОГИКА АПГРЕЙДА (ЗАГЛУШКА)
 * В этом файле высчитывается шанс и определяется успех/неудача.
 */

const MIN_CHANCE = 0;
const MAX_CHANCE = 100;
const MAX_MULTIPLIER = 100;

function clampChance(value) {
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, Number(value) || 0));
}

// 1. Формула базового шанса 
// TODO: Напиши здесь свою логику расчета между двумя предметами.
// Пример: шанс зависит от разницы в цене (sourceItem.price_stars / targetItem.price_stars) * 100
function canUpgradeTo(sourceItem, targetItem) {
  if (!sourceItem || !targetItem) return false;
  const sourcePrice = Number(sourceItem.price_stars);
  const targetPrice = Number(targetItem.price_stars);
  return Number.isFinite(sourcePrice) && Number.isFinite(targetPrice) && targetPrice > sourcePrice;
}

function calculateBaseChance(sourceItem, targetItem) {
  if (!canUpgradeTo(sourceItem, targetItem)) return 0;
  const sourcePrice = Number(sourceItem.price_stars);
  const targetPrice = Number(targetItem.price_stars);
  return (sourcePrice / targetPrice) * 100;
}

// 2. Влияние множителя 
// TODO: Напиши логику того, как кнопка "Множитель" меняет шанс.
function applyMultiplier(baseChance, multiplier = 1) {
  const safeMultiplier = Number(multiplier) || 1;
  return clampChance(baseChance / safeMultiplier);
}

// 3. Главная функция принятия решения (срабатывает на сервере)
function resolveUpgrade(sourceItem, targetItem, multiplier = 1) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier < 1 || safeMultiplier > MAX_MULTIPLIER || Math.abs(safeMultiplier * 10 - Math.round(safeMultiplier * 10)) >= 1e-9) {
    throw new Error('invalid_multiplier');
  }

  if (!canUpgradeTo(sourceItem, targetItem)) {
    throw new Error('target_not_higher');
  }
  
  const baseChance = clampChance(calculateBaseChance(sourceItem, targetItem));
  const finalChance = clampChance(applyMultiplier(baseChance, safeMultiplier));
  
  // Бросаем кубик (случайное число от 0 до 100)
  const roll = Math.random() * 100;
  
  // Успех, если выпавшее число меньше шанса
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

// 4. Для отображения шанса в React (до нажатия кнопки)
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
  canUpgradeTo,
  resolveUpgrade,
  displayPercent
};
