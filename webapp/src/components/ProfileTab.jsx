import { getTelegramUser } from '../telegram.js';

function getInitials(name = '') {
  const value = String(name).trim();
  if (!value) return 'R';
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function ProfileTab({ profile, loading, onOpenWithdrawRequests }) {
  if (loading || !profile) {
    return <div className="skeleton" style={{ height: 320 }} />;
  }

  const tgUser = getTelegramUser();
  const displayName = tgUser?.first_name || profile.first_name || 'Игрок';
  const username = tgUser?.username || profile.username || '';
  const avatarUrl = tgUser?.photo_url || '';
  const referralProgress = profile.referral_progress || {};
  const premium = Number(referralProgress.premium) || 0;
  const regular = Number(referralProgress.regular) || 0;
  const total = Number(profile.referrals_count) || Number(referralProgress.total) || 0;
  const spins = Number(profile.free_roulette_spins) || 0;

  return (
    <div className="profile-screen">
      <section className="profile-identity-card">
        <div className="profile-identity-card__glow" aria-hidden="true" />
        <div className="profile-identity-card__main">
          <div className="profile-avatar" aria-hidden="true">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{getInitials(displayName)}</span>
            )}
          </div>
          <div className="profile-identity-card__info">
            <span className="profile-identity-card__eyebrow">ROUP · ПРОФИЛЬ</span>
            <h3>{displayName}</h3>
            <p>{username ? `@${username}` : 'username не указан'}</p>
          </div>
        </div>
        <div className="profile-id-row">
          <span>Telegram ID</span>
          <code>{profile.telegram_id}</code>
        </div>
      </section>

      <section className="profile-stat-grid">
        <div className="profile-stat-card">
          <span>Уровень</span>
          <strong>{profile.tier}</strong>
        </div>
        <div className="profile-stat-card profile-stat-card--gold">
          <span>Баланс</span>
          <strong>{Number(profile.balance || 0).toLocaleString('ru-RU')} ⭐</strong>
        </div>
        <div className="profile-stat-card">
          <span>Приглашено</span>
          <strong>{total}</strong>
        </div>
        <div className="profile-stat-card profile-stat-card--gift">
          <span>Прокрутки</span>
          <strong>{spins} 🎁</strong>
        </div>
      </section>

      <section className="profile-referral-card">
        <div className="profile-referral-card__heading">
          <div>
            <span>РЕФЕРАЛЬНАЯ СИСТЕМА</span>
            <h4>Друзья и вывод</h4>
          </div>
          <b>{profile.can_withdraw ? 'Доступен' : 'Закрыт'}</b>
        </div>
        <div className="profile-referral-card__rows">
          <div><span>Premium</span><strong>{premium}/5</strong></div>
          <div><span>Без Premium</span><strong>{regular}/10</strong></div>
        </div>
        <p>{profile.can_withdraw ? 'Условия для вывода выполнены.' : 'Приглашай друзей, чтобы открыть вывод.'}</p>
      </section>

      <button type="button" className="profile-requests-button" onClick={onOpenWithdrawRequests}>
        <span>📋</span>
        <span>
          <b>Мои заявки</b>
          <small>Статусы и комментарии по выводу</small>
        </span>
        <span className="profile-requests-button__arrow">›</span>
      </button>

      <footer className="app-footer">
        <span className="app-footer__line">
          ⭐ — внутренняя учётная единица, не деньги и не платёжное средство.
        </span>
        <span className="app-footer__line">
          Доступ к выводу зависит от выполнения условий сервиса.
          <span className="app-footer__sep">·</span>
          Сервис <b>18+</b>.
        </span>
        <span className="app-footer__line">
          <a className="app-footer__link" href="https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-ispolzovaniya-RoUP-09-19" target="_blank" rel="noopener noreferrer">Правила и соглашение</a>
          <span className="app-footer__sep">·</span>
          <a className="app-footer__link" href="https://t.me/roup_support" target="_blank" rel="noopener noreferrer">Поддержка</a>
        </span>
      </footer>
    </div>
  );
}
