import { getInitData } from './telegram';

const BASE = '/api';

const createOperationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForInitData(maxWaitMs = 3000) {
  const started = Date.now();
  let data = getInitData();
  while (!data && Date.now() - started < maxWaitMs) {
    await sleep(100);
    data = getInitData();
  }
  return data;
}

async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExtAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExtAbort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExtAbort);
  }
}

// ── Дедупликация in-flight GET-запросов ────────────────────────────
const inflight = new Map();

function dedupeKey(method, path) {
  return `${method}:${path}`;
}

// ── Request ─────────────────────────────────────────────────────────

async function request(path, options = {}, {
  retries = 5,
  baseDelayMs = 1200,
  timeoutMs = 20000,
  signal,
  dedupe = false,
} = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const key = dedupe ? dedupeKey(method, path) : null;

  if (key && inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = (async () => {
    const initData = await waitForInitData();
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `${BASE}${path}`,
          {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'X-Telegram-Init-Data': initData,
              ...(options.headers || {}),
            },
          },
          timeoutMs,
          signal
        );

        // 304 — не тело, а признак «у клиента актуальная версия»
        if (res.status === 304) return { __notModified: true };

        if (res.status >= 400 && res.status < 500) {
          const body = await res.json().catch(() => ({}));
          const err = new Error(body.error || `http_${res.status}`);
          err.status = res.status;
          err.code = body.error;
          err.details = body;
          err.fatal = true;
          throw err;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `http_${res.status}`);
        }

        return await res.json();
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') throw err;
        if (err.fatal) throw err;
        if (attempt < retries) await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  })();

  if (key) {
    inflight.set(key, promise);
    promise.finally(() => inflight.delete(key));
  }

  return promise;
}

export const api = {
  getCatalog: () => request('/catalog', {}, { dedupe: true }),
  getProfile: () => request('/profile', {}, { dedupe: true }),
  getInventory: () => request('/inventory', {}, { dedupe: true }),

  completeTutorial: () => request('/tutorial/complete', { method: 'POST', body: JSON.stringify({}) }, { retries: 2 }),

  buy: (itemId, quantity = 1) => request('/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity, operationId: createOperationId() }),
  }, { retries: 2 }),

  createSupportInvoice: (amount) =>
    request('/support/create-invoice', { method: 'POST', body: JSON.stringify({ amount }) }, { retries: 2 }),

  getUpgradeConfig: () => request('/upgrade/config', {}, { dedupe: true }),

  upgrade: (inventoryItemId, targetItemId, multiplier = 1) =>
    request('/upgrade', {
      method: 'POST',
      body: JSON.stringify({ inventoryItemId, targetItemId, multiplier, operationId: createOperationId() }),
    }, { retries: 0 }),

  getUpgradeFeed: () => request('/upgrade/feed', {}, { retries: 1, dedupe: true }),
  getOnline: () => request('/online', {}, { retries: 1, dedupe: true }),

  sell: (inventoryItemId) =>
    request('/sell', {
      method: 'POST',
      body: JSON.stringify({ inventoryItemId, operationId: createOperationId() }),
    }, { retries: 2 }),

  sellMany: (itemId, quantity) =>
    request('/sell-many', {
      method: 'POST',
      body: JSON.stringify({ itemId, quantity, operationId: createOperationId() }),
    }, { retries: 2 }),

  getWithdrawMethods: () => request('/withdraw/methods', {}, { dedupe: true }),
  createWithdrawRequest: (payload) => request('/withdraw/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { retries: 0 }),
};
