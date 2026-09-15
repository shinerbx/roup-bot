export default function PurchaseSheet({ item, pending, onCancel, onConfirm }) {
  if (!item) return null;

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
        <div className="sheet__actions">
          <button className="sheet__cancel" onClick={onCancel} disabled={pending}>
            Отмена
          </button>
          <button className="sheet__confirm" onClick={onConfirm} disabled={pending}>
            {pending ? 'Открываем счёт…' : 'Оплатить Stars'}
          </button>
        </div>
      </div>
    </>
  );
}
