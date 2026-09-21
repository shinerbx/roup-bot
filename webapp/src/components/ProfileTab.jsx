export default function ProfileTab({ profile, loading, onOpenWithdrawRequests }) {
  if (loading || !profile) {
    return <div className="skeleton" style={{ height: 220 }} />;
  }

  return (
    <>
      <div className="balance-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <p className="hero__subtitle" style={{ marginBottom: 10 }}>
          {profile.first_name} {profile.username ? `· @${profile.username}` : ''}
        </p>

        <div className="stat-row">
          <span className="stat-row__label">Уровень</span>
          <span className="stat-row__value">{profile.tier}</span>
        </div>
        <div className="stat-row">
          <span className="stat-row__label">Предметов в инвентаре</span>
          <span className="stat-row__value">{profile.items_count}</span>
        </div>
        <div className="stat-row">
          <span className="stat-row__label">Приглашено друзей</span>
          <span className="stat-row__value">{profile.referrals_count}</span>
        </div>
        <div className="stat-row">
          <span className="stat-row__label">Апгрейдов</span>
          <span className="stat-row__value">{profile.upgrades_count}</span>
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
