import { useMemo, useState } from 'react';
import ItemCard from './ItemCard.jsx';

const CATEGORY_LABELS = {
  all: 'Всё',
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function CatalogTab({ items, loading, onBuy }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(set)];
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const categoryOk = activeCategory === 'all' || item.category === activeCategory;
      const queryOk = !normalized || item.name.toLowerCase().includes(normalized);
      return categoryOk && queryOk;
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'priceAsc') return a.price_stars - b.price_stars;
      if (sort === 'priceDesc') return b.price_stars - a.price_stars;
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru');
      return 0;
    });
  }, [items, activeCategory, query, sort]);

  if (loading) {
    return <div className="item-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '0.78' }} />)}</div>;
  }

  if (items.length === 0) {
    return <div className="empty-state"><p className="empty-state__title">Каталог пуст</p><p>Скоро здесь появятся предметы.</p></div>;
  }

  return (
    <>
      <div className="catalog-filter">
        <input
          className="catalog-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти предмет…"
          aria-label="Поиск предмета"
        />
        <select className="catalog-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
          <option value="default">Сортировка</option>
          <option value="priceAsc">Сначала дешевле</option>
          <option value="priceDesc">Сначала дороже</option>
          <option value="name">По названию</option>
        </select>
      </div>

      <div className="chip-row">
        {categories.map((cat) => (
          <button key={cat} className={`chip ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {visibleItems.length === 0 ? (
        <div className="empty-state"><p className="empty-state__title">Ничего не найдено</p><p>Измени фильтр или поисковый запрос.</p></div>
      ) : (
        <div className="item-grid">
          {visibleItems.map((item) => <ItemCard key={item.id} item={item} onBuy={onBuy} />)}
        </div>
      )}
    </>
  );
}
