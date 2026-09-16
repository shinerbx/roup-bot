import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Slot({ item, placeholder, spinning }) {
  if (!item) {
    return (
      <div className="upgrade-slot">
        <span className="upgrade-slot__placeholder">+</span>
        <span className="upgrade-slot__hint">{placeholder}</span>
      </div>
    );
  }
  return (
    <div className={`upgrade-slot filled ${spinning ? 'pulsing' : ''}`}>
      <img className="upgrade-slot__image" src={item.image_url} alt={item.name} />
      <span className="upgrade-slot__name">{item.name}</span>
    </div>
  );
}

export default function UpgradeTab({ inventory, catalog, loading, onUpgraded, onError }) {
  const [ownedId, setOwnedId] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const owned = inventory.find((i) => i.inventory_id === ownedId) || null;
  const target = catalog.find((i) => i.id === targetId) || null;

  const percent = useMemo(() => {
    if (!owned || !target) return 50;
    const raw = Math.round((owned.price_stars / target.price_stars) * 100);
    return Math.min(95, Math.max(5, raw));
  }, [owned, target]);

  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const canUpgrade = owned && target && !spinning;

  const handleUpgrade = async () => {
    if (!canUpgrade) return;
    haptic('medium');
    setSpinning(true);

    const spinPromise = new Promise((resolve) => setTimeout(resolve, 1800));

    try {
      // Запрос уходит сразу, но результат показываем не раньше,
      // чем закончится анимация прокрута.
      const [res] = await Promise.all([api.upgrade(owned.inventory_id, target.id), spinPromise]);
      hapticNotify('success');
      setResult(res.item);
      setOwnedId(null);
      setTargetId(null);
      onUpgraded?.();
    } catch (err) {
      console.error(err);
      await spinPromise;
      hapticNotify('error');
      onError?.('Не получилось выполнить апгрейд. Попробуй снова.');
    } finally {
      setSpinning(false);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: 320 }} />;
  }

  return (
    <>
      <div className="upgrade-gauge-wrap">
        <div className={`upgrade-gauge ${spinning ? 'spinning' : ''}`} style={{ '--gauge-offset': offset }}>
          <svg viewBox="0 0 168 168">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--crimson-bright)" />
                <stop offset="100%" stopColor="var(--gold)" />
              </linearGradient>
            </defs>
            <circle className="upgrade-gauge__track" cx="84" cy="84" r={RADIUS} />
            <circle
              className="upgrade-gauge__value-arc"
              cx="84"
              cy="84"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>

          {/* Стрелка-указатель, вращается вокруг центра во время прокрута */}
          <div
            className={`upgrade-needle ${spinning ? 'spinning' : ''}`}
            style={{ '--needle-angle': `${percent * 3.6}deg` }}
          >
            <span className="upgrade-needle__tip" />
          </div>

          <div className="upgrade-gauge__center">
            <span className="upgrade-gauge__percent">{percent}%</span>
            <span className="upgrade-gauge__label">шанс</span>
          </div>
        </div>
      </div>

      <div className="upgrade-slots">
        <Slot item={owned} placeholder="Твой предмет" spinning={spinning} />
        <span className={`upgrade-arrow ${spinning ? 'spinning' : ''}`}>➜</span>
        <Slot item={target} placeholder="Хочешь получить" spinning={spinning} />
      </div>

      <button className="upgrade-button" disabled={!canUpgrade} onClick={handleUpgrade}>
        {spinning ? 'Крутим…' : 'Улучшить'}
      </button>

      <div>
        <p className="section-title">Твои предметы</p>
        <div className="upgrade-picker-row">
          {inventory.length === 0 && <span className="screen-subtitle">Инвентарь пуст</span>}
          {inventory.map((item) => (
            <button
              key={item.inventory_id}
              className={`upgrade-picker-item ${ownedId === item.inventory_id ? 'selected' : ''}`}
              onClick={() => setOwnedId(item.inventory_id)}
              disabled={spinning}
            >
              <img src={item.image_url} alt={item.name} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="section-title">Хочешь получить</p>
        <div className="upgrade-picker-row">
          {catalog.map((item) => (
            <button
              key={item.id}
              className={`upgrade-picker-item ${targetId === item.id ? 'selected' : ''}`}
              onClick={() => setTargetId(item.id)}
              disabled={spinning}
            >
              <img src={item.image_url} alt={item.name} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="upgrade-result-overlay" onClick={() => setResult(null)}>
          <div className="upgrade-result-rays" />
          <div className="upgrade-result-card" onClick={(e) => e.stopPropagation()}>
            <p className="upgrade-result-card__badge">УЛУЧШЕНО</p>
            <div className="upgrade-result-card__drop">
              <img className="upgrade-result-card__image" src={result.image_url} alt={result.name} />
              <span className="upgrade-result-card__shine" />
            </div>
            <p className="upgrade-result-card__name">{result.name}</p>
            <span className="price-tag">★ {result.price_stars}</span>
            <button className="upgrade-result-card__close" onClick={() => setResult(null)}>
              Готово
            </button>
          </div>
        </div>
      )}
    </>
  );
}
