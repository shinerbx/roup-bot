const CATEGORY_LABELS = {
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function ItemCard({ item, owned, onBuy, onSell, selling, canWithdraw, onWithdraw }) {
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

        {onSell ? (
          <div className="item-card__actions">
          <button
            className="item-card__sell"
            disabled={selling}
            onClick={() => onSell(item)}
          >
            {selling ? '…' : 'Продать'}
          </button>
          <button
            className={`item-card__withdraw ${canWithdraw ? '' : 'disabled'}`}
            disabled={!canWithdraw}
            onClick={() => canWithdraw && onWithdraw?.()}
          >
            Вывести предмет
          </button>
          </div>
        ) : owned ? (
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
