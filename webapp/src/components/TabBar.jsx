const TABS = [
  { id: 'catalog', label: 'Каталог', icon: '🛒' },
  { id: 'upgrade', label: 'Апгрейд', icon: '⚡' },
  { id: 'inventory', label: 'Инвентарь', icon: '🎒' },
  { id: 'profile', label: 'Профиль', icon: '👤' }
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-bar__item ${active === tab.id ? 'active' : ''}`}
          data-tutorial-target={tab.id}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-bar__icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
