// upgrade-logic.js
// Логика апгрейда вынесена сюда отдельно от db.js и webapp-api.js,
// чтобы её можно было менять, не трогая слой базы и HTTP-роуты.
//
// resolveUpgrade получает предмет-донор и целевой предмет и возвращает
// решение, которое затем исполняет db.applyUpgrade в транзакции.
// Текущее поведение: апгрейд всегда успешен.

/**
 * @param {{ id: number, name: string, price_stars: number }} sourceItem  предмет-донор из инвентаря
 * @param {{ id: number, name: string, price_stars: number }} targetItem  желаемый предмет
 * @returns {{ success: boolean, resultItemId: number }}
 */
function resolveUpgrade(sourceItem, targetItem) {
  return {
    success: true,
    resultItemId: targetItem.id
  };
}

/**
 * Число, которое показывается на круговом индикаторе в интерфейсе.
 * Сейчас это просто отношение цен, приведённое к диапазону 5–95,
 * и оно никак не влияет на результат resolveUpgrade.
 */
function displayPercent(sourceItem, targetItem) {
  if (!sourceItem || !targetItem || !targetItem.price_stars) return 50;
  const raw = Math.round((sourceItem.price_stars / targetItem.price_stars) * 100);
  return Math.min(95, Math.max(5, raw));
}

module.exports = { resolveUpgrade, displayPercent };
