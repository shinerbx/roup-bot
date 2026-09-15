export default function ProfileTab({ profile, loading }) {
  if (loading || !profile) {
    return <div className="skeleton" style={{ height: 220 }} />;
  }

  return (
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
  );
}
