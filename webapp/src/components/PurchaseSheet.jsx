import { useEffect, useMemo, useState } from 'react';

const MAX_QUANTITY = 100;

function clampQuantity(value) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(MAX_QUANTITY, Math.max(1, n)) : 1;
}

export default function PurchaseSheet({ item, initialQuantity = 1, pending, balance, onCancel, onConfirm }) {
  const [quantity, setQuantity] = useState(1);
  const [inputValue, setInputValue] = useState('1');

  useEffect(() => {
    if (item) {
      const initial = clampQuantity(initialQuantity);
      setQuantity(initial);
      setInputValue(String(initial));
    }
  }, [item, initialQuantity]);

  const total = useMemo(() => Number(item?.price_stars || 0) * quantity, [item, quantity]);
  const insufficient = balance < total;
  const setSafeQuantity = (next) => {
    const value = clampQuantity(next);
    setQuantity(value);
    setInputValue(String(value));
  };

  const handleInput = (event) => {
    const raw = event.target.value.replace(/\D/g, '').slice(0, 4);
    setInputValue(raw);
    if (raw) setQuantity(clampQuantity(raw));
  };

  if (!item) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={() => !pending && onCancel()} />
      <div className="sheet purchase-sheet" role="dialog" aria-modal="true" aria-label={`Покупка ${item.name}`}>
        <div className="sheet__handle" />
        <div className="sheet__item purchase-sheet__item">
          <img className="sheet__item-image" src={item.image_url} alt="" loading="lazy" decoding="async" draggable={false} />
          <div className="purchase-sheet__info">
            <p className="sheet__item-name" title={item.name}>{item.name}</p>
            <span className="price-tag">★ {Number(item.price_stars).toLocaleString('ru-RU')} <small>за 1</small></span>
          </div>
        </div>

        <div className="purchase-sheet__summary">
          <span>Итого</span>
          <strong>★ {total.toLocaleString('ru-RU')}</strong>
        </div>

        <div className="quantity-control" aria-label="Количество">
          <button type="button" onClick={() => setSafeQuantity(quantity - 1)} disabled={pending || quantity <= 1} aria-label="Уменьшить количество">−</button>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputValue}
            onChange={handleInput}
            onBlur={() => setSafeQuantity(quantity)}
            disabled={pending}
            aria-label="Количество предметов"
          />
          <button type="button" onClick={() => setSafeQuantity(quantity + 1)} disabled={pending || quantity >= MAX_QUANTITY} aria-label="Увеличить количество">+</button>
        </div>

        <div className="quantity-presets">
          {[1, 5, 10, 25, 100].map((value) => (
            <button type="button" key={value} className={quantity === value ? 'selected' : ''} onClick={() => setSafeQuantity(value)} disabled={pending}>
              ×{value}
            </button>
          ))}
        </div>

        {insufficient ? (
          <p className="sheet__note sheet__note--warn">
            Недостаточно ⭐. Не хватает {(total - balance).toLocaleString('ru-RU')} ⭐.
          </p>
        ) : (
          <p className="sheet__note purchase-sheet__available">
            После покупки останется {(balance - total).toLocaleString('ru-RU')} ⭐.
          </p>
        )}

        <div className="sheet__actions">
          <button className="sheet__cancel" onClick={onCancel} disabled={pending}>Отмена</button>
          <button
            className="sheet__confirm"
            onClick={() => onConfirm(quantity)}
            disabled={pending || insufficient || !Number.isInteger(quantity) || quantity < 1}
          >
            {pending ? 'Покупаем…' : insufficient ? 'Недостаточно ⭐' : `Купить ×${quantity}`}
          </button>
        </div>
      </div>
    </>
  );
}
