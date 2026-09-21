import { useState } from 'react';

const CATEGORY_LABELS = {
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function ItemCard({
  item,
  owned,
  quantity,
  onBuy,
  onSell,
  selling,
  canWithdraw,
  onWithdraw
}) {
  const [quickQuantity, setQuickQuantity] = useState(1);
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

  return (
    <article className={`item-card ${owned ? 'item-card--inventory' : ''}`}>
      <div className="item-card__image-wrap">
        <img className="item-card__image" src={item.image_url} alt={item.name} loading="lazy" />
        {owned && Number(quantity) > 0 && (
          <span className="item-card__quantity" aria-label={`${quantity} штук`}>
            ×{Number(quantity).toLocaleString('ru-RU')}
          </span>
        )}
      </div>
      <p className="item-card__name" title={item.name}>{item.name}</p>
      <p className="item-card__category">{categoryLabel}</p>

      {onSell ? (
        <div className="item-card__footer">
          <span className="price-tag">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>
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
        </div>
      ) : (
        <div className="item-card__footer item-card__footer--buy">
          <div className="item-card__price-row">
            <span className="price-tag">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>
            {owned && <span className="item-card__owned-tag">уже есть</span>}
          </div>
          <div className="item-card__buy-group">
            <div className="item-card__quick-quantity" aria-label="Количество для покупки">
              <button type="button" onClick={() => setQuickQuantity((value) => Math.max(1, value - 1))} aria-label="Уменьшить количество">−</button>
              <span>×{quickQuantity}</span>
              <button type="button" onClick={() => setQuickQuantity((value) => Math.min(100, value + 1))} aria-label="Увеличить количество">+</button>
            </div>
            <button type="button" className="item-card__buy" onClick={() => onBuy(item, quickQuantity)}>
              Купить <span>×{quickQuantity}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
