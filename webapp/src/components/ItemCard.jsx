import { useState } from 'react';

const CATEGORY_LABELS = {
  accessories: 'Аксессуары',
  faces: 'Лица',
  hats: 'Шляпы',
  gear: 'Снаряжение'
};

export default function ItemCard({ item, onBuy, onSell, selling, canWithdraw, onWithdraw }) {
  const [quantity, setQuantity] = useState(1);
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
  const total = Number(item.price_stars) * quantity;

  return (
    <div className="item-card">
      <div className="item-card__image-wrap">
        <img className="item-card__image" src={item.image_url} alt={item.name} loading="lazy" />
      </div>
      <p className="item-card__name" title={item.name}>{item.name}</p>
      <p className="item-card__category">{categoryLabel}</p>

      {onSell ? (
        <div className="item-card__inventory-footer">
          <span className="price-tag">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>
          <div className="item-card__actions">
            <button className="item-card__sell" disabled={selling} onClick={() => onSell(item)}>
              {selling ? '…' : 'Продать'}
            </button>
            <button className={`item-card__withdraw ${canWithdraw ? '' : 'disabled'}`} disabled={!canWithdraw} onClick={() => canWithdraw && onWithdraw?.()}>
              Вывести предмет
            </button>
          </div>
        </div>
      ) : (
        <div className="item-card__purchase">
          <div className="item-card__purchase-price">
            <span>Цена за 1</span>
            <strong>★ {Number(item.price_stars).toLocaleString('ru-RU')}</strong>
          </div>
          <div className="item-card__purchase-row">
            <div className="item-card__quick-quantity" aria-label="Количество">
              <button type="button" onClick={() => setQuantity((v) => Math.max(1, v - 1))} aria-label="Уменьшить количество">−</button>
              <span>×{quantity}</span>
              <button type="button" onClick={() => setQuantity((v) => Math.min(9999, v + 1))} aria-label="Увеличить количество">+</button>
            </div>
            <button type="button" className="item-card__buy" onClick={() => onBuy(item, quantity)}>
              Купить
            </button>
          </div>
          {quantity > 1 && <div className="item-card__purchase-total">Итого · ★ {total.toLocaleString('ru-RU')}</div>}
        </div>
      )}
    </div>
  );
}
