import { getInitData } from './telegram';

const BASE = '/api';

async function request(path, options = {}) {
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
    throw new Error(body.error || `Ошибка запроса: ${res.status}`);
  }
  return res.json();
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
