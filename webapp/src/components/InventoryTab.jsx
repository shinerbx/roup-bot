import { useState } from 'react';
import ItemCard from './ItemCard.jsx';

export default function InventoryTab({ items, loading, onSell, sellingId }) {
  const [confirmItem, setConfirmItem] = useState(null);

  if (loading) {
    return (
      <div className="item-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: '0.78' }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">Инвентарь пуст</p>
        <p>Купи предмет в каталоге или получи его за подписку и рефералов.</p>
      </div>
    );
  }

  const handleConfirm = async () => {
    const item = confirmItem;
    setConfirmItem(null);
    await onSell?.(item);
  };

  return (
    <>
      <div className="item-grid">
        {items.map((item) => (
          <ItemCard
            key={item.inventory_id}
            item={item}
            owned
            onSell={setConfirmItem}
            selling={sellingId === item.inventory_id}
          />
        ))}
      </div>

      {confirmItem && (
        <>
          <div className="sheet-backdrop" onClick={() => setConfirmItem(null)} />
          <div className="sheet">
            <div className="sheet__handle" />
            <div className="sheet__item">
              <img className="sheet__item-image" src={confirmItem.image_url} alt={confirmItem.name} />
              <div>
                <p className="sheet__item-name">Продать «{confirmItem.name}»?</p>
                <span className="price-tag">+{confirmItem.price_stars} ★ на баланс</span>
              </div>
            </div>
            <p className="sheet__note">Предмет исчезнет из инвентаря без возможности вернуть.</p>
            <div className="sheet__actions">
              <button className="sheet__cancel" onClick={() => setConfirmItem(null)}>
                Отмена
              </button>
              <button className="sheet__confirm" onClick={handleConfirm}>
                Продать
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
