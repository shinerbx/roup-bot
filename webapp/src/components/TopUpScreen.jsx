// language: JSX, file: TopUpScreen.jsx, target: React
// *Пополнение. Подпись «скоро» + пояснение.*

export default function TopUpScreen({ onClose }) {
  return (
    <div className="topup-screen">
      <button type="button" className="back-btn" onClick={onClose} aria-label="Назад">‹</button>
      <h2>💳 Пополнение</h2>
      <div className="topup-soon">★ СКОРО</div>
      <p className="topup-sub">Пополнение баланса</p>
      <p className="topup-desc">
        Мы уже готовим пополнение через Telegram Stars. Функция появится в следующем обновлении.
      </p>
    </div>
  );
}
