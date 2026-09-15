import { getInitData } from './telegram';

const BASE = '/api';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}, retries = 3, delayMs = 1500) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': getInitData(),
          ...(options.headers || {})
        }
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Ошибки авторизации (401/403) повторять нет смысла
        if (res.status === 401 || res.status === 403) {
          throw new Error(body.error || `Ошибка доступа: ${res.status}`);
        }
        throw new Error(body.error || `Ошибка запроса: ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err;

      // Если ошибка критическая (клиентская), не крутим цикл вхолостую
      if (err.message.includes('401') || err.message.includes('403')) {
        throw err;
      }

      // Если это не последняя попытка — ждем пока проснется Render / пул базы
      if (attempt < retries) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

export const api = {
  getCatalog: () => request('/catalog'),
  getProfile: () => request('/profile'),
  getInventory: () => request('/inventory'),
  createInvoice: (itemId) =>
    request('/create-invoice', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    }),
  upgrade: (inventoryItemId, targetItemId) =>
    request('/upgrade', {
      method: 'POST',
      body: JSON.stringify({ inventoryItemId, targetItemId })
    })
};