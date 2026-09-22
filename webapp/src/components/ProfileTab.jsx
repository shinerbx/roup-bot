import { useMemo, useState } from 'react';
import { getTelegramUser } from '../telegram.js';

// Аватар Telegram (initDataUnsafe.user.photo_url) не всегда доступен — приходит не на
// всех платформах/клиентах и не всегда успешно грузится. Поэтому всегда держим наготове
// «фирменный» вариант — инициал на градиенте — и переключаемся на него при любой ошибке
// загрузки, а не только когда URL отсутствует.
function ProfileAvatar({ name, photoUrl }) {
  const [failed, setFailed] = useState(false);
  const initial = useMemo(() => (name || '').trim().charAt(0).toUpperCase() || '•', [name]);

  return (
    <span className="profile-avatar">
      {photoUrl && !failed ? (
        <img
          className="profile-avatar__img"
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="profile-avatar__fallback" aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

export default function ProfileTab({ profile, loading, onOpenWithdrawRequests }) {
  if (loading || !profile) {
    return <div className="skeleton" style={{ height: 220 }} />;
  }

  const tgUser = getTelegramUser();
  const displayName = profile.first_name || tgUser?.first_name || 'Игрок';

  return (
    <>
      <div className="profile-header">
        <ProfileAvatar name={displayName} photoUrl={tgUser?.photo_url} />
        <div className="profile-header__info">
          <strong className="profile-header__name">{displayName}</strong>
          {profile.username && <span className="profile-header__username">@{profile.username}</span>}
        </div>
        <span className="profile-tier-chip">{profile.tier}</span>
      </div>

      <div className="profile-stats roulette-stats">
        <div>
          <span>Предметов</span>
          <b>{profile.items_count}</b>
        </div>
        <div>
          <span>Друзей</span>
          <b>{profile.referrals_count}</b>
        </div>
        <div>
          <span>Апгрейдов</span>
          <b>{profile.upgrades_count}</b>
        </div>
      </div>

      <button
        type="button"
        className="profile-requests-button"
        onClick={onOpenWithdrawRequests}
      >
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
          <a
            className="app-footer__link"
            href="https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-ispolzovaniya-RoUP-09-19"
            target="_blank"
            rel="noopener noreferrer"
          >
            Правила и соглашение
          </a>
          <span className="app-footer__sep">·</span>
          <a
            className="app-footer__link"
            href="https://t.me/roup_support"
            target="_blank"
            rel="noopener noreferrer"
          >
            Поддержка
          </a>
        </span>
      </footer>
    </>
  );
}
