export default function PurchaseSheet({ item, pending, balance, onCancel, onConfirm, onTopUp }) {
  if (!item) return null;

  const insufficient = balance < item.price_stars;

  return (
    <>
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet">
        <div className="sheet__handle" />
        <div className="sheet__item">
          <img className="sheet__item-image" src={item.image_url} alt={item.name} />
          <div>
            <p className="sheet__item-name">{item.name}</p>
            <span className="price-tag">★ {item.price_stars}</span>
          </div>
        </div>

        {insufficient ? (
          <>
            <p className="sheet__note sheet__note--warn">
              Недостаточно ⭐ на балансе. Не хватает {item.price_stars - balance} ⭐.
            </p>
            <div className="sheet__actions">
              <button className="sheet__cancel" onClick={onCancel}>
                Отмена
              </button>
              <button className="sheet__confirm" onClick={onTopUp}>
                Пополнить ⭐
              </button>
            </div>
          </>
        ) : (
          <div className="sheet__actions">
            <button className="sheet__cancel" onClick={onCancel} disabled={pending}>
              Отмена
            </button>
            <button className="sheet__confirm" onClick={onConfirm} disabled={pending}>
              {pending ? 'Покупаем…' : 'Купить'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
