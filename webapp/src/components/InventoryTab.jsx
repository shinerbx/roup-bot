import { useMemo, useState } from 'react';
import ItemCard from './ItemCard.jsx';

export default function InventoryTab({ items, loading, onSell, sellingId, canWithdraw, referralProgress, onWithdraw }) {
  const [confirmItem, setConfirmItem] = useState(null);

  const stacks = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = String(item.id);
      if (!map.has(key)) map.set(key, { ...item, quantity: 0, inventoryIds: [] });
      const stack = map.get(key);
      stack.quantity += 1;
      stack.inventoryIds.push(item.inventory_id);
    }
    return Array.from(map.values());
  }, [items]);

  const handleConfirm = async () => {
    const item = confirmItem;
    setConfirmItem(null);
    await onSell?.(item);
  };

  if (loading) {
    return <div className="item-grid">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '0.78' }} />)}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="empty-state inventory-empty">
        <div className="inventory-empty__icon">🎒</div>
        <p className="empty-state__title">Инвентарь пуст</p>
        <p>Купи предмет в каталоге или получи его за подписку и рефералов.</p>
      </div>
    );
  }

  return (
    <>
      <div className="inventory-heading">
        <div>
          <h2 className="screen-title">Инвентарь</h2>
          <p className="screen-subtitle">{items.length} {items.length === 1 ? 'предмет' : items.length < 5 ? 'предмета' : 'предметов'} · {stacks.length} вида</p>
        </div>
      </div>

      <div className="withdraw-progress-card">
        <div>
          <p className="section-title">Вывод предметов</p>
          <p>{canWithdraw ? 'Условие выполнено. Вывод доступен.' : `Ещё ${referralProgress?.premiumRemaining ?? 5} Premium или ${referralProgress?.regularRemaining ?? 10} обычных.`}</p>
        </div>
        <div className="withdraw-progress-row">
          <span>⭐ Premium: {referralProgress?.premium ?? 0}/5</span>
          <span>👤 Обычные: {referralProgress?.regular ?? 0}/10</span>
        </div>
      </div>

      <div className="item-grid">
        {stacks.map((item) => {
          const sellableItem = items.find((entry) => entry.id === item.id);
          return (
            <ItemCard
              key={item.id}
              item={item}
              owned
              quantity={item.quantity}
              onSell={() => setConfirmItem(sellableItem)}
              selling={sellingId === sellableItem?.inventory_id}
              canWithdraw={canWithdraw}
              onWithdraw={() => onWithdraw?.(sellableItem)}
            />
          );
        })}
      </div>

      {confirmItem && (
        <>
          <div className="sheet-backdrop" onClick={() => setConfirmItem(null)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Продать ${confirmItem.name}`}>
            <div className="sheet__handle" />
            <div className="sheet__item">
              <img className="sheet__item-image" src={confirmItem.image_url} alt="" />
              <div>
                <p className="sheet__item-name">Продать 1 × «{confirmItem.name}»?</p>
                <span className="price-tag">+{Number(confirmItem.price_stars).toLocaleString('ru-RU')} ★ на баланс</span>
              </div>
            </div>
            <p className="sheet__note">Будет продан один предмет из стопки. Остальные останутся в инвентаре.</p>
            <div className="sheet__actions">
              <button className="sheet__cancel" onClick={() => setConfirmItem(null)}>Отмена</button>
              <button className="sheet__confirm" onClick={handleConfirm}>Продать</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
