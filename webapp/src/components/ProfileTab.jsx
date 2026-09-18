// language: JSX, file: ProfileTab.jsx, target: React
// *Профиль. Добавлены подписи и пояснения к цифрам.*

export default function ProfileTab({ profile, loading }) {
  if (loading || !profile) {
    return <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />;
  }

  return (
    <div className="profile-card">
      <p className="profile-card__name">
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

      <div className="profile-card__footer">
        <small>
          Поддержка:{' '}
          <a href="https://t.me/roup_support" target="_blank" rel="noreferrer">
            @roup_support
          </a>
        </small>
      </div>
    </div>
  );
}
