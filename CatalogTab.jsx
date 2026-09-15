import { useMemo, useState } from 'react';
import ItemCard from './ItemCard.jsx';

const CATEGORY_LABELS = {
  all: 'Всё',
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function CatalogTab({ items, ownedItemIds, loading, onBuy }) {
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(set)];
  }, [items]);

  const visibleItems = useMemo(() => {
    if (activeCategory === 'all') return items;
    return items.filter((i) => i.category === activeCategory);
  }, [items, activeCategory]);

  if (loading) {
    return (
      <div className="item-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: '0.78' }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">Каталог пуст</p>
        <p>Скоро здесь появятся предметы.</p>
      </div>
    );
  }

  return (
    <>
      <div className="chip-row">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`chip ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      <div className="item-grid">
        {visibleItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            owned={ownedItemIds.has(item.id)}
            onBuy={onBuy}
          />
        ))}
      </div>
    </>
  );
}
