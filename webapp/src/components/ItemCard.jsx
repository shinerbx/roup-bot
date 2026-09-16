const CATEGORY_LABELS = {
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function ItemCard({
  item,
  owned,
  quantity = 1,
  onBuy,
  onSell,
  selling,
  canWithdraw,
  onWithdraw
}) {
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

  return (
    <article className={`item-card ${owned ? 'item-card--inventory' : ''}`}>
      <div className="item-card__image-wrap">
        <img className="item-card__image" src={item.image_url} alt={item.name} loading="lazy" />
        {owned && (
          <span className="item-card__quantity" aria-label={`${quantity} штук`}>
            ×{quantity.toLocaleString('ru-RU')}
          </span>
        )}
      </div>
      <p className="item-card__name">{item.name}</p>
      <p className="item-card__category">{categoryLabel}</p>
      <div className="item-card__footer">
        <span className="price-tag">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>

        {onSell ? (
          <div className="item-card__actions">
            <button className="item-card__sell" disabled={selling} onClick={() => onSell(item)}>
              {selling ? '…' : 'Продать 1'}
            </button>
            <button
              className={`item-card__withdraw ${canWithdraw ? '' : 'disabled'}`}
              disabled={!canWithdraw}
              onClick={() => canWithdraw && onWithdraw?.(item)}
              title={canWithdraw ? 'Вывести предмет' : 'Вывод пока недоступен'}
            >
              Вывести
            </button>
          </div>
        ) : owned ? (
          <span className="item-card__owned">в инвентаре</span>
        ) : (
          <button className="item-card__buy" onClick={() => onBuy(item)}>Купить</button>
        )}
      </div>
    </article>
  );
}
