export default function TopUpScreen({ onClose }) {
  return (
    <div className="topup-overlay topup-soon-screen">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose} aria-label="Назад">‹</button>
        <h2 className="screen-title">Пополнение</h2>
        <span style={{ width: 28 }} aria-hidden="true" />
      </div>

      <div className="topup-soon-card">
        <div className="topup-soon-icon" aria-hidden="true">★</div>
        <span className="topup-soon-badge">СКОРО</span>
        <p className="topup-soon-title">Пополнение баланса</p>
        <p className="topup-soon-text">Мы уже готовим пополнение. Функция появится в следующем обновлении.</p>
      </div>
    </div>
  );
}
