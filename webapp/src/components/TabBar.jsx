// Line icons (currentColor) so the active/inactive tint animates smoothly;
// replaces the platform-dependent emoji. Tab ids, labels and onChange are unchanged.
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

const TABS = [
  { id: 'catalog', label: 'Каталог', icon: <Icon><path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></Icon> },
  { id: 'upgrade', label: 'Апгрейд', icon: <Icon><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" /></Icon> },
  { id: 'inventory', label: 'Инвентарь', icon: <Icon><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="m4 7 8 4 8-4M12 11v10" /></Icon> },
  { id: 'roulette', label: 'Рулетка', icon: <Icon><rect x="4" y="9.5" width="16" height="10" rx="1.4" /><path d="M4 9.5h16M12 9.5V20" /><path d="M12 9.5c-1.6 0-3-1.1-3-2.7C9 5.4 10 4.3 11.2 4.3c1.5 0 2.8 2 2.8 5.2Zm0 0c1.6 0 3-1.1 3-2.7 0-1.4-1-2.5-2.2-2.5-1.5 0-2.8 2-2.8 5.2Z" /></Icon> },
  { id: 'profile', label: 'Профиль', icon: <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Icon> }
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tab-bar__item ${active === tab.id ? 'active' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
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
