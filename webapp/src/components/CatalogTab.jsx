import { useEffect, useMemo, useState } from 'react';
import ItemCard from './ItemCard.jsx';
import LiveFeedStrip from './LiveFeedStrip.jsx';
import OnlineBadge from './OnlineBadge.jsx';

const SORT_OPTIONS = [
  { key: 'default', label: 'По умолчанию' },
  { key: 'price_asc', label: 'Дешевле' },
  { key: 'price_desc', label: 'Дороже' },
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

  // Если открыли новый каталог — сбрасываем ввод при потере фокуса (для мобилок)
  useEffect(() => () => {
    setSearch('');
  }, []);

  if (loading) {
    return (
      <div className="catalog-screen">
        <div className="catalog-toprow">
          <OnlineBadge />
        </div>
        <LiveFeedStrip />
        <div className="skeleton" style={{ height: 44, borderRadius: 12 }} />
        <div className="item-grid" style={{ marginTop: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 220, borderRadius: 17 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-screen">
      <div className="catalog-toprow">
        <OnlineBadge />
      </div>

      <LiveFeedStrip />

      <div className="chip-row">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c === 'all' ? 'Все' : c}
          </button>
        ))}
      </div>

      <div className="catalog-filter">
        <input
          className="catalog-search"
          type="search"
          inputMode="search"
          placeholder="Поиск по названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        <select
          className="catalog-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">Ничего не найдено</p>
          <p>Попробуй другой запрос или категорию.</p>
        </div>
      ) : (
        <div className="item-grid">
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
    </div>
  );
}
