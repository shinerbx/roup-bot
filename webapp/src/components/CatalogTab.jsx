// language: JSX, file: CatalogTab.jsx, target: React
// *Каталог. Добавлены подписи: фильтры, поиск, сортировка. Дизайн не тронут.*

import { useEffect, useMemo, useState } from 'react';
import ItemCard from './ItemCard.jsx';
import LiveFeedStrip from './LiveFeedStrip.jsx';
import OnlineBadge from './OnlineBadge.jsx';

const SORT_OPTIONS = [
  { key: 'default', label: 'По умолчанию' },
  { key: 'price_asc', label: 'Сначала дешевле' },
  { key: 'price_desc', label: 'Сначала дороже' },
  { key: 'name', label: 'По названию' },
];

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

export default function CatalogTab({ items, ownedItemIds, loading, onBuy }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => {
    const set = new Set();
    for (const it of items || []) if (it.category) set.add(it.category);
    return ['all', ...set];
  }, [items]);

  const visible = useMemo(() => {
    let arr = Array.isArray(items) ? items.slice() : [];
    if (category !== 'all') arr = arr.filter((i) => i.category === category);
    const q = normalize(search);
    if (q) arr = arr.filter((i) => normalize(i.name).includes(q));
    if (sort === 'price_asc') arr.sort((a, b) => Number(a.price_stars) - Number(b.price_stars));
    else if (sort === 'price_desc') arr.sort((a, b) => Number(b.price_stars) - Number(a.price_stars));
    else if (sort === 'name') arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return arr;
  }, [items, category, search, sort]);

  useEffect(() => () => { setSearch(''); }, []);

  if (loading) {
    return (
      <div className="catalog-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 180, borderRadius: 16 }} />
        ))}
      </div>
    );
  }

  return (
    <>
      <OnlineBadge />
      <LiveFeedStrip />

      <div className="catalog-filters">
        <div className="catalog-categories">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? 'chip--active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c === 'all' ? 'Все категории' : c}
            </button>
          ))}
        </div>

        <div className="catalog-controls">
          <input
            className="catalog-search"
            type="text"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            aria-label="Поиск предметов"
          />
          <select
            className="catalog-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Сортировка"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="catalog-empty">
          <p>Ничего не найдено</p>
          <small>Попробуй изменить запрос или выбрать другую категорию.</small>
        </div>
      ) : (
        <div className="catalog-grid">
          {visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              owned={ownedItemIds?.has(item.id)}
              onBuy={onBuy}
            />
          ))}
        </div>
      )}
    </>
  );
}
