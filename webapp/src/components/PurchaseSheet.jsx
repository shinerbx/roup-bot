import { useEffect, useMemo, useState } from 'react';

const MAX_QUANTITY = 9999;
const clampQuantity = (value) => Math.min(MAX_QUANTITY, Math.max(1, Number.isSafeInteger(value) ? value : 1));

export default function PurchaseSheet({ item, initialQuantity = 1, pending, balance, onCancel, onConfirm, onTopUp }) {
  const [quantity, setQuantity] = useState(clampQuantity(initialQuantity));
  const [inputValue, setInputValue] = useState(String(clampQuantity(initialQuantity)));

  useEffect(() => {
    const next = clampQuantity(initialQuantity);
    setQuantity(next);
    setInputValue(String(next));
  }, [item, initialQuantity]);

  const unitPrice = Number(item?.price_stars) || 0;
  const total = useMemo(() => unitPrice * quantity, [unitPrice, quantity]);
  const insufficient = balance < total;

  if (!item) return null;

  const updateQuantity = (next) => {
    const value = clampQuantity(next);
    setQuantity(value);
    setInputValue(String(value));
  };

  const handleInput = (value) => {
    setInputValue(value);
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 1) setQuantity(Math.min(MAX_QUANTITY, parsed));
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet purchase-sheet" role="dialog" aria-modal="true" aria-label={`Покупка ${item.name}`}>
        <div className="sheet__handle" />
        <div className="sheet__item">
          <img className="sheet__item-image" src={item.image_url} alt={item.name} />
          <div className="sheet__item-info">
            <p className="sheet__eyebrow">Покупка</p>
            <p className="sheet__item-name" title={item.name}>{item.name}</p>
            <span className="price-tag">★ {unitPrice.toLocaleString('ru-RU')} за 1</span>
          </div>
        </div>

        <div className="purchase-sheet__quantity-head">
          <span>Количество</span>
          <span>Макс. {MAX_QUANTITY.toLocaleString('ru-RU')}</span>
        </div>
        <div className="quantity-control">
          <button type="button" onClick={() => updateQuantity(quantity - 1)} disabled={pending || quantity <= 1} aria-label="Уменьшить">−</button>
          <input inputMode="numeric" pattern="[0-9]*" value={inputValue} onChange={(e) => handleInput(e.target.value.replace(/\D/g, ''))} onBlur={() => updateQuantity(quantity)} disabled={pending} aria-label="Количество" />
          <button type="button" onClick={() => updateQuantity(quantity + 1)} disabled={pending || quantity >= MAX_QUANTITY} aria-label="Увеличить">+</button>
        </div>
        <div className="quantity-presets">
          {[1, 5, 10, 25, 100].map((value) => (
            <button type="button" key={value} className={quantity === value ? 'active' : ''} onClick={() => updateQuantity(value)} disabled={pending}>{value}</button>
          ))}
        </div>

        <div className="purchase-sheet__total">
          <div><span>Итого</span><small>{unitPrice.toLocaleString('ru-RU')} × {quantity}</small></div>
          <strong>★ {total.toLocaleString('ru-RU')}</strong>
        </div>

        {insufficient && <p className="sheet__note sheet__note--warn">Недостаточно ⭐. Не хватает {(total - balance).toLocaleString('ru-RU')} ⭐.</p>}

        <div className="sheet__actions">
          <button className="sheet__cancel" onClick={onCancel} disabled={pending}>Отмена</button>
          {insufficient ? (
            <button className="sheet__confirm" onClick={onTopUp} disabled={pending}>Пополнить ⭐</button>
          ) : (
            <button className="sheet__confirm" onClick={onConfirm} disabled={pending}>{pending ? 'Покупаем…' : `Купить ×${quantity}`}</button>
          )}
        </div>
      </div>
    </>
  );
}
