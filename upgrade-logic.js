/**
 * RoUP — ЕДИНАЯ НАСТРАИВАЕМАЯ МЕХАНИКА АПГРЕЙДА
 *
 * ВАЖНО:
 * Этот файл является единственным местом, где нужно менять правила апгрейда.
 * React/Web App НЕ определяет результат. Браузер может только показать
 * предварительный шанс и анимацию. Финальный шанс, roll и success вычисляются
 * на сервере здесь, а db.js только атомарно применяет результат в Supabase.
 *
 * Что менять в будущем:
 * 1. BASE_CHANCE_* — ограничения отображаемого шанса.
 * 2. MAX_MULTIPLIER — допустимый максимум пользовательского множителя.
 * 3. calculateBaseChance() — базовая формула шанса.
 * 4. applyMultiplier() — как множитель влияет на шанс.
 * 5. resolveUpgrade() — способ определения победы/поражения.
 *
 * Текущая формула специально простая и легко заменяемая:
 *   baseChance = цена предмета игрока / цена цели * 100
 *   finalChance = baseChance / multiplier
 *
 * x1 = обычный шанс, x2 = половина базового шанса, x4 = четверть и т.д.
 * Пользовательский multiplier можно передать от 1 до MAX_MULTIPLIER.
 *
 * НЕ ДЕЛАЙТЕ Math.random() в React: результат должен создаваться на сервере.
 */

const MIN_CHANCE = 5;
const MAX_CHANCE = 95;
const MAX_MULTIPLIER = 100;

function clampChance(value) {
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, Number(value) || 0));
}

/**
 * Базовый шанс до множителя.
 * Здесь в будущем можно полностью заменить формулу, не трогая БД/API/UI.
 */
function calculateBaseChance(sourceItem, targetItem) {
  if (!sourceItem || !targetItem) return 50;
  const sourcePrice = Number(sourceItem.price_stars);
  const targetPrice = Number(targetItem.price_stars);
  if (!Number.isFinite(sourcePrice) || !Number.isFinite(targetPrice) || targetPrice <= 0) return 50;

  return (sourcePrice / targetPrice) * 100;
}

/**
 * Влияние множителя.
 * Сейчас множитель увеличивает сложность: шанс делится на multiplier.
 * Если ты захочешь другую механику, меняй только эту функцию.
 */
function applyMultiplier(baseChance, multiplier = 1) {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value < 1 || value > MAX_MULTIPLIER) {
    throw new Error('invalid_multiplier');
  }
  return baseChance / value;
}

/**
 * Финальное серверное решение.
 * roll находится в диапазоне [0, 100). Если roll < chance — успех.
 * Это значение также возвращается UI только для визуализации остановки стрелки.
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
    resultItemId: success ? targetItem.id : null,
    chance: Number(chance.toFixed(2)),
    baseChance: Number(baseChance.toFixed(2)),
    roll: Number(roll.toFixed(2)),
    multiplier: safeMultiplier
  };
}

/**
 * Предварительный расчёт для Web App. Он повторяет ту же формулу,
 * но НЕ принимает решение об успехе. Сервер всё равно пересчитает значение.
 */
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
