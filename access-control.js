// Единая точка управления доступом.
// Можно указать несколько ID через запятую в ADMIN_IDS/ADMIN_CHAT_ID.

function parseIds(raw) {
  return String(raw || '')
    .split(',')
    .map((v) => String(v).trim())
    .filter(Boolean);
}

const ADMIN_IDS = Object.freeze([
  ...new Set([
    ...parseIds(process.env.ADMIN_IDS),
    ...parseIds(process.env.ADMIN_CHAT_ID),
    // Добавляй постоянные ID админов сюда при необходимости:
    '6043384033',
  ]),
]);

const WITHDRAW_WHITELIST = Object.freeze([
  ...new Set([
    ...parseIds(process.env.WITHDRAW_WHITELIST),
    // ID пользователей, которым доступен вывод без реферального ограничения:
    '6043384033',
  ]),
]);

function hasId(list, userId) {
  const id = String(userId ?? '').trim();
  if (!id) return false;
  return list.includes(id);
}

function isAdmin(userId) {
  return hasId(ADMIN_IDS, userId);
}

function isWhitelisted(userId) {
  return hasId(WITHDRAW_WHITELIST, userId);
}

module.exports = {
  ADMIN_IDS,
  WITHDRAW_WHITELIST,
  isAdmin,
  isWhitelisted,
};
