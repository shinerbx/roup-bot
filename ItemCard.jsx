const CATEGORY_LABELS = {
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function ItemCard({ item, owned, onBuy }) {
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

  return (
    <div className="item-card">
      <div className="item-card__image-wrap">
        <img className="item-card__image" src={item.image_url} alt={item.name} loading="lazy" />
      </div>
      <p className="item-card__name">{item.name}</p>
      <p className="item-card__category">{categoryLabel}</p>
      <div className="item-card__footer">
        <span className="price-tag">★ {item.price_stars}</span>
        {owned ? (
          <span className="item-card__owned">в инвентаре</span>
        ) : (
          <button className="item-card__buy" onClick={() => onBuy(item)}>
            Купить
          </button>
        )}
      </div>
    </div>
  );
}
