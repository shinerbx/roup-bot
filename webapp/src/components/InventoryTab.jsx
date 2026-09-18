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
  onWithdraw,
}) {
  const [sellItem, setSellItem] = useState(null);
  const grouped = useMemo(() => groupInventory(items || []), [items]);

  if (loading) {
    return (
      <div className="inventory-screen">
        <div className="skeleton" style={{ height: 64, borderRadius: 16 }} />
        <div className="item-grid" style={{ marginTop: 12 }}>
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
      <div className="inventory-heading">
        <p className="section-title">Инвентарь</p>
        <button
          type="button"
          className="inventory-withdraw-btn"
          onClick={() => { haptic('light'); onWithdraw?.(); }}
        >
          💸 Вывод
        </button>
      </div>

      {canWithdraw === false && (
        <div className="withdraw-warning" style={{ marginTop: 10 }}>
          Вывод откроется после выполнения условий по приглашениям
          {referralProgress
            ? ` — нужно ещё ${referralProgress.premiumRemaining} Premium или ${referralProgress.regularRemaining} обычных.`
            : '.'}
        </div>
      )}

      {isEmpty ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="inventory-empty__icon">🎒</div>
          <p className="empty-state__title">Инвентарь пуст</p>
          <p>Купи предмет в каталоге или забери подарок за подписку.</p>
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
                <p className="item-card__category">{it.category}</p>
                <div className="item-card__footer">
                  <span className="price-tag">★ {Number(it.price_stars).toLocaleString('ru-RU')}</span>
                  <button
                    type="button"
                    className="item-card__sell"
                    disabled={busy}
                    onClick={() => { haptic('light'); setSellItem(it); }}
                  >
                    {busy ? '…' : 'Продать'}
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
