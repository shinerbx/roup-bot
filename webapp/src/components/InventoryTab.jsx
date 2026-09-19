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
            <small>★ {Number(item.price_stars).toLocaleString('ru-RU')} за штуку · у тебя {max}</small>
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
                key={`${v}-${i}`}
                type="button"
                className={qty === v ? 'selected' : ''}
                onClick={() => { haptic('light'); setSafe(v); }}
                disabled={pending}
              >
                {v === max ? 'Все' : v}
              </button>
            ))}
          </div>
        )}

        <div className="purchase-sheet__summary" style={{ marginTop: 14 }}>
          <span>Получишь</span>
          <strong>{total.toLocaleString('ru-RU')} ★</strong>
        </div>

        <div className="sheet__actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="sheet__cancel"
            onClick={onCancel}
            disabled={pending}
          >
            Отмена
          </button>
          <button
            type="button"
            className="sheet__confirm"
            onClick={() => onConfirm(qty)}
            disabled={pending}
          >
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
  isWhitelisted = false,
  onWithdraw,
  demoActive = false,
}) {
  const [sellItem, setSellItem] = useState(null);
  const grouped = useMemo(() => groupInventory(items || []), [items]);

  const totalCount = (items || []).length;

  if (loading) {
    return (
      <div className="inventory-screen">
        <div className="inventory-header">
          <div className="inventory-header__left">
            <div className="skeleton" style={{ width: 120, height: 22, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 80, height: 12, borderRadius: 6, marginTop: 8 }} />
          </div>
          <div className="skeleton" style={{ width: 100, height: 40, borderRadius: 999 }} />
        </div>
        <div className="item-grid" style={{ marginTop: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 220, borderRadius: 17 }} />
          ))}
        </div>
      </div>
    );
  }

  const isEmpty = !grouped.length;

  return (
    <div className="inventory-screen">
      <header className="inventory-header">
        <div className="inventory-header__left">
          <h3 className="inventory-header__title">Инвентарь</h3>
          <p className="inventory-header__meta">
            {isEmpty
              ? 'Пусто'
              : `${grouped.length} ${plural(grouped.length, 'вид', 'вида', 'видов')} · ${totalCount} ${plural(totalCount, 'шт', 'шт', 'шт')}`}
          </p>
        </div>
        <button
          type="button"
          className={`inventory-withdraw-btn${canWithdraw === false ? ' inventory-withdraw-btn--locked' : ''}`}
          onClick={() => { if (canWithdraw === false) return; haptic('medium'); onWithdraw?.(); }}
          disabled={canWithdraw === false}
          aria-disabled={canWithdraw === false}
          title={canWithdraw === false ? 'Вывод пока недоступен' : 'Вывести Robux'}
        >
          <span className="inventory-withdraw-btn__icon" aria-hidden="true">💸</span>
          <span className="inventory-withdraw-btn__label">Вывод</span>
        </button>
      </header>

      {canWithdraw === false && !isWhitelisted && (
        <div className="inventory-alert">
          <span className="inventory-alert__icon" aria-hidden="true">🔒</span>
          <div className="inventory-alert__text">
            <strong>Вывод пока не разблокирован</strong>
            {referralProgress && (
              <span>
                Пригласи ещё <b>{referralProgress.premiumRemaining}</b> Premium
                или <b>{referralProgress.regularRemaining}</b> обычных пользователей.
              </span>
            )}
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="inventory-empty">
          <div className="inventory-empty__icon" aria-hidden="true">🎒</div>
          <p className="inventory-empty__title">Инвентарь пуст</p>
          <p className="inventory-empty__text">Купи предмет в каталоге или забери подарок за подписку.</p>
        </div>
      ) : (
        <div className="item-grid">
          {grouped.map((it) => {
            const busy = sellingId === it.itemId;
            return (
              <div key={it.itemId} className="item-card">
                <div className="item-card__image-wrap">
                  <img className="item-card__image" src={it.image_url} alt="" />
                  {it.count > 1 && (
                    <span className="item-card__quantity">×{it.count}</span>
                  )}
                </div>
                <p className="item-card__name" title={it.name}>{it.name}</p>
                <p className="item-card__category">{it.is_demo ? 'Demo-предмет' : it.category}</p>
                <div className="item-card__footer">
                  <span className="price-tag">★ {Number(it.price_stars).toLocaleString('ru-RU')}</span>
                  <button
                    type="button"
                    className="item-card__sell"
                    disabled={busy || demoActive}
                    onClick={() => { haptic('light'); setSellItem(it); }}
                  >
                    {demoActive ? 'Demo' : (busy ? '…' : 'Продать')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sellItem && (
        <SellSheet
          item={sellItem}
          pending={sellingId === sellItem.itemId}
          onCancel={() => { if (sellingId !== sellItem.itemId) setSellItem(null); }}
          onConfirm={async (qty) => {
            await onSell?.(sellItem.itemId, qty);
            setSellItem(null);
          }}
        />
      )}
    </div>
  );
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
