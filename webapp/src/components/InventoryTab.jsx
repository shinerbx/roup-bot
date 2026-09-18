// language: JSX, file: InventoryTab.jsx, target: React
// *Инвентарь. Подписи кнопок, вывода, demo-статуса. Логика не тронута.*

import { useMemo, useState } from 'react';
import { haptic } from '../telegram.js';

function groupInventory(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.id;
    if (!map.has(key)) {
      map.set(key, {
        itemId: it.id,
        name: it.name,
        category: it.category,
        price_stars: it.price_stars,
        image_url: it.image_url,
        is_demo: Boolean(it.is_demo),
        count: 0,
        inventoryIds: [],
        latestCreatedAt: it.created_at,
      });
    }
    const entry = map.get(key);
    entry.count += 1;
    entry.inventoryIds.push(it.inventory_id);
    if (String(it.created_at) > String(entry.latestCreatedAt)) {
      entry.latestCreatedAt = it.created_at;
    }
  }
  return [...map.values()];
}

function SellSheet({ item, pending, onCancel, onConfirm }) {
  const max = item.count;
  const [qty, setQty] = useState(Math.min(1, max));

  const setSafe = (v) => {
    const n = Math.max(1, Math.min(max, Number(v) || 1));
    setQty(n);
  };

  const total = qty * Number(item.price_stars);

  return (
    <>
      <div className="sheet-backdrop" onClick={pending ? undefined : onCancel} />
      <div className="sheet purchase-sheet" role="dialog" aria-modal="true" aria-label="Продажа">
        <div className="sheet__handle" />

        <div className="sheet__item purchase-sheet__item">
          <img className="sheet__item-image" src={item.image_url} alt="" />
          <div className="purchase-sheet__info">
            <p className="sheet__item-name">{item.name}</p>
            <small>
              ★ {Number(item.price_stars).toLocaleString('ru-RU')} за штуку · у тебя {max}
            </small>
          </div>
        </div>

        <div className="quantity-control">
          <button
            type="button"
            onClick={() => { haptic('light'); setSafe(qty - 1); }}
            disabled={pending || qty <= 1}
            aria-label="Минус"
          >−</button>
          <input
            type="text"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setSafe(e.target.value.replace(/\D/g, '').slice(0, 4))}
            disabled={pending}
            aria-label="Количество"
          />
          <button
            type="button"
            onClick={() => { haptic('light'); setSafe(qty + 1); }}
            disabled={pending || qty >= max}
            aria-label="Плюс"
          >+</button>
        </div>

        {max > 1 && (
          <div className="quantity-presets">
            {[1, Math.min(5, max), Math.min(10, max), max].map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { haptic('light'); setSafe(v); }}
                disabled={pending}
              >
                {v === max ? 'Все' : v}
              </button>
            ))}
          </div>
        )}

        <p className="sheet__total">
          Получишь {total.toLocaleString('ru-RU')} ★
        </p>

        <div className="sheet__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onConfirm(qty)} disabled={pending}>
            {pending ? 'Продажа…' : `Продать ${qty}`}
          </button>
        </div>
      </div>
    </>
  );
}

export default function InventoryTab({
  items,
  loading,
  onSell,
  sellingId,
  canWithdraw,
  referralProgress,
  onWithdraw,
  demoActive = false,
}) {
  const [sellItem, setSellItem] = useState(null);

  const grouped = useMemo(() => groupInventory(items || []), [items]);
  const totalCount = (items || []).length;

  if (loading) {
    return (
      <div className="inventory-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 140, borderRadius: 16 }} />
        ))}
      </div>
    );
  }

  const isEmpty = !grouped.length;

  return (
    <>
      <div className="inventory-header">
        <h3>Инвентарь</h3>
        <p className="inventory-header__sub">
          {isEmpty
            ? 'Пусто'
            : `${grouped.length} ${plural(grouped.length, 'вид', 'вида', 'видов')} · ${totalCount} ${plural(totalCount, 'шт', 'шт', 'шт')}`}
        </p>
      </div>

      {demoActive && (
        <div className="demo-banner">
          🧪 Включён demo-режим. Вывод заблокирован. Отключить — напиши менеджеру.
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary btn--large"
        onClick={() => { haptic('medium'); onWithdraw?.(); }}
      >
        💸 Вывод средств
      </button>

      {canWithdraw === false && (
        <div className="withdraw-gate">
          <p>🔒 Вывод пока не разблокирован</p>
          {referralProgress && (
            <small>
              Пригласи ещё {referralProgress.premiumRemaining} Premium или{' '}
              {referralProgress.regularRemaining} обычных пользователей — или оформи заявку
              через поддержку.
            </small>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="inventory-empty">
          <p>Инвентарь пуст</p>
          <small>Купи первый предмет в каталоге или крути рулетку.</small>
        </div>
      ) : (
        <div className="inventory-grid">
          {grouped.map((entry) => (
            <div key={entry.itemId} className="inventory-card">
              <img src={entry.image_url} alt="" className="inventory-card__image" />
              <div className="inventory-card__info">
                <p className="inventory-card__name">{entry.name}</p>
                <small className="inventory-card__meta">
                  ★ {Number(entry.price_stars).toLocaleString('ru-RU')} · x{entry.count}
                  {entry.is_demo && ' · demo'}
                </small>
              </div>
              <button
                type="button"
                className="btn btn--small"
                disabled={sellingId === entry.itemId}
                onClick={() => { haptic('light'); setSellItem(entry); }}
              >
                {sellingId === entry.itemId ? '…' : 'Продать'}
              </button>
            </div>
          ))}
        </div>
      )}

      {sellItem && (
        <SellSheet
          item={sellItem}
          pending={sellingId === sellItem.itemId}
          onCancel={() => setSellItem(null)}
          onConfirm={(qty) => {
            onSell?.(sellItem.itemId, qty);
            setSellItem(null);
          }}
        />
      )}
    </>
  );
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
