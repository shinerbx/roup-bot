import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { haptic } from '../telegram.js';

const statusMeta = {
  pending: { label: 'В обработке', className: 'pending' },
  processing: { label: 'В обработке', className: 'pending' },
  completed: { label: 'Выполнена', className: 'completed' },
  rejected: { label: 'Отклонена', className: 'rejected' },
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
};

export default function WithdrawRequestsPanel({ onClose }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getWithdrawRequests()
      .then((res) => { if (alive) setRequests(res.requests || []); })
      .catch(() => { if (alive) setError('Не удалось загрузить заявки. Попробуйте ещё раз.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="topup-overlay withdraw-requests-screen">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose} aria-label="Назад">‹</button>
        <h2 className="screen-title">Мои заявки</h2>
        <span style={{ width: 28 }} />
      </div>

      <div className="withdraw-requests-list">
        {loading && <div className="empty-state"><p>Загружаем заявки…</p></div>}
        {!loading && error && <div className="withdraw-error">{error}</div>}
        {!loading && !error && !requests.length && (
          <div className="empty-state">
            <div className="withdraw-success__icon">📋</div>
            <p className="empty-state__title">Заявок пока нет</p>
            <p>После оформления вывода здесь появится его статус.</p>
          </div>
        )}

        {!loading && !error && requests.map((request) => {
          const status = statusMeta[request.status] || { label: request.status, className: 'pending' };
          return (
            <article className="withdraw-request-card" key={request.id}>
              <div className="withdraw-request-card__top">
                <div>
                  <span className="withdraw-request-card__id">Заявка #{request.id}</span>
                  <strong>{Number(request.payoutRobux || 0).toLocaleString('ru-RU')} R$</strong>
                </div>
                <span className={`withdraw-request-status withdraw-request-status--${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="withdraw-request-card__row"><span>Roblox</span><b>{request.robloxUsername}</b></div>
              <div className="withdraw-request-card__row"><span>Списано</span><b>{Number(request.amountStars || 0).toLocaleString('ru-RU')} ⭐</b></div>
              {request.gamePassPrice > 0 && (
                <div className="withdraw-request-card__row"><span>Game Pass</span><b>{Number(request.gamePassPrice).toLocaleString('ru-RU')} R$</b></div>
              )}
              <div className="withdraw-request-card__date">{formatDate(request.createdAt)}</div>
              {request.adminNote && (
                <div className="withdraw-request-card__note">💬 {request.adminNote}</div>
              )}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="sheet__confirm withdraw-action"
        onClick={() => { haptic('light'); onClose(); }}
      >
        Вернуться назад
      </button>
    </div>
  );
}
