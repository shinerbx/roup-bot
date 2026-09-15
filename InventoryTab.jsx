import ItemCard from './ItemCard.jsx';

export default function InventoryTab({ items, loading }) {
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

  return (
    <div className="item-grid">
      {items.map((item) => (
        <ItemCard key={item.inventory_id} item={item} owned onBuy={() => {}} />
      ))}
    </div>
  );
}
