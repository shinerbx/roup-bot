export default function WithdrawScreen({ onClose }) {
  return (
    <div className="topup-overlay">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose}>‹</button>
        <h2 className="screen-title">Вывести предмет</h2>
        <span style={{ width: 28 }} />
      </div>
      <div className="withdraw-placeholder">
        <div className="withdraw-placeholder__icon">⌛</div>
        <p className="empty-state__title">Скоро</p>
        <p>Функция вывода предметов скоро будет доступна.</p>
      </div>
    </div>
  );
}
