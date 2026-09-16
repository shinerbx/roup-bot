import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PRESETS = [2, 4, 8, 10];

function Slot({ item, placeholder, onOpen, spinning }) {
  if (!item) {
    return (
      <button className="upgrade-slot upgrade-slot--button" onClick={onOpen} disabled={spinning}>
        <span className="upgrade-slot__placeholder">+</span>
        <span className="upgrade-slot__hint">{placeholder}</span>
      </button>
    );
  }
  return (
    <button className={`upgrade-slot filled ${spinning ? 'pulsing' : ''}`} onClick={onOpen} disabled={spinning}>
      <img className="upgrade-slot__image" src={item.image_url} alt={item.name} />
      <span className="upgrade-slot__name">{item.name}</span>
      <span className="upgrade-slot__hint">Нажми, чтобы заменить</span>
    </button>
  );
}

function PickerSheet({ title, items, selectedId, getId, onSelect, onClose, spinning }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet upgrade-picker-sheet">
        <div className="sheet__handle" />
        <div className="upgrade-picker-sheet__header">
          <div>
            <p className="section-title">Выбор предмета</p>
            <h3>{title}</h3>
          </div>
          <button className="topup-back" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        {items.length === 0 ? (
          <div className="empty-state upgrade-picker-sheet__empty">
            <p className="empty-state__title">Ничего нет</p>
            <p>Здесь пока нет доступных предметов.</p>
          </div>
        ) : (
          <div className="upgrade-modal-grid">
            {items.map((item) => {
              const id = getId(item);
              return (
                <button
                  key={id}
                  className={`upgrade-picker-item ${selectedId === id ? 'selected' : ''}`}
                  onClick={() => onSelect(item)}
                  disabled={spinning}
                >
                  <img src={item.image_url} alt={item.name} />
                  <span>{item.name}</span>
                  <small>★ {item.price_stars}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function UpgradeTab({ inventory, catalog, loading, onUpgraded, onError }) {
  const [ownedId, setOwnedId] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [picker, setPicker] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [multiplier, setMultiplier] = useState(2);
  const [customMultiplier, setCustomMultiplier] = useState('');
  const [needleAngle, setNeedleAngle] = useState(0);

  const owned = inventory.find((i) => i.inventory_id === ownedId) || null;
  const target = catalog.find((i) => i.id === targetId) || null;
  const selectedMultiplier = multiplier === 'custom'
    ? Math.max(1, Number(customMultiplier) || 1)
    : multiplier;

  // Предварительный UI-расчёт. Сервер в любом случае рассчитывает шанс заново.
  const percent = useMemo(() => {
    if (!owned || !target) return 50;
    const base = (Number(owned.price_stars) / Number(target.price_stars)) * 100;
    return Math.min(95, Math.max(5, base / selectedMultiplier));
  }, [owned, target, selectedMultiplier]);

  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const customMultiplierValid = multiplier !== 'custom' || (Number(customMultiplier) >= 1 && Number(customMultiplier) <= 100);
  const canUpgrade = owned && target && !spinning && customMultiplierValid;

  const chooseOwned = (item) => {
    setOwnedId(item.inventory_id);
    setPicker(null);
  };
  const chooseTarget = (item) => {
    setTargetId(item.id);
    setPicker(null);
  };

  const handleUpgrade = async () => {
    if (!canUpgrade) return;
    haptic('medium');
    setSpinning(true);
    setResult(null);

    const spinPromise = new Promise((resolve) => setTimeout(resolve, 1800));
    try {
      const [res] = await Promise.all([
        api.upgrade(owned.inventory_id, target.id, selectedMultiplier),
        spinPromise
      ]);

      // Roll генерируется только сервером. Он используется здесь исключительно
      // для того, чтобы стрелка остановилась на фактической позиции результата.
      const serverRoll = Number(res.roll ?? 0);
      setNeedleAngle(serverRoll * 3.6);
      hapticNotify(res.success ? 'success' : 'error');
      setResult({
        item: res.item,
        success: Boolean(res.success),
        chance: Number(res.chance ?? percent),
        roll: serverRoll,
        multiplier: Number(res.multiplier ?? selectedMultiplier)
      });
      setOwnedId(null);
      setTargetId(null);
      onUpgraded?.();
    } catch (err) {
      console.error(err);
      await spinPromise;
      hapticNotify('error');
      onError?.(err.code === 'invalid_multiplier' ? 'Некорректный множитель.' : 'Не получилось выполнить апгрейд. Попробуй снова.');
    } finally {
      setSpinning(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: 320 }} />;

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
            <circle className="upgrade-gauge__value-arc" cx="84" cy="84" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} />
          </svg>
          <div
            className={`upgrade-needle ${spinning ? 'spinning' : ''}`}
            style={{ '--needle-angle': `${needleAngle}deg`, '--final-angle': `${needleAngle}deg` }}
          >
            <span className="upgrade-needle__tip" />
          </div>
          <div className="upgrade-gauge__center">
            <span className="upgrade-gauge__percent">{percent.toFixed(0)}%</span>
            <span className="upgrade-gauge__label">шанс</span>
          </div>
        </div>
      </div>

      <div className="upgrade-slots">
        <Slot item={owned} placeholder="Твой предмет" spinning={spinning} onOpen={() => setPicker('owned')} />
        <span className={`upgrade-arrow ${spinning ? 'spinning' : ''}`}>➜</span>
        <Slot item={target} placeholder="Хочешь получить" spinning={spinning} onOpen={() => setPicker('target')} />
      </div>

      <div>
        <p className="section-title">Множитель</p>
        <div className="upgrade-multiplier-row">
          {PRESETS.map((value) => (
            <button key={value} className={`upgrade-multiplier ${multiplier === value ? 'selected' : ''}`} onClick={() => setMultiplier(value)} disabled={spinning}>x{value}</button>
          ))}
          <button className={`upgrade-multiplier ${multiplier === 'custom' ? 'selected' : ''}`} onClick={() => setMultiplier('custom')} disabled={spinning}>Настраиваемый</button>
        </div>
        {multiplier === 'custom' && (
          <div className="upgrade-custom-multiplier">
            <span>x</span>
            <input
              inputMode="decimal"
              type="number"
              min="1"
              max="100"
              step="0.1"
              value={customMultiplier}
              onChange={(e) => setCustomMultiplier(e.target.value)}
              placeholder="Например, 3.5"
              disabled={spinning}
            />
          </div>
        )}
      </div>

      <button className="upgrade-button" disabled={!canUpgrade} onClick={handleUpgrade}>
        {spinning ? 'Крутим…' : 'Улучшить'}
      </button>

      <p className="upgrade-mechanics-note">
        Шанс рассчитывается серверной механикой из <b>upgrade-logic.js</b>. Множитель x{selectedMultiplier} применяется там же.
      </p>

      {picker === 'owned' && (
        <PickerSheet title="Предмет из инвентаря" items={inventory} selectedId={ownedId} getId={(i) => i.inventory_id} onSelect={chooseOwned} onClose={() => setPicker(null)} spinning={spinning} />
      )}
      {picker === 'target' && (
        <PickerSheet title="Желаемый предмет" items={catalog} selectedId={targetId} getId={(i) => i.id} onSelect={chooseTarget} onClose={() => setPicker(null)} spinning={spinning} />
      )}

      {result && (
        <div className="upgrade-result-overlay" onClick={() => setResult(null)}>
          <div className="upgrade-result-rays" />
          <div className="upgrade-result-card" onClick={(e) => e.stopPropagation()}>
            <p className="upgrade-result-card__badge">{result.success ? 'УЛУЧШЕНО' : 'НЕ ПОВЕЗЛО'}</p>
            {result.item ? (
              <div className="upgrade-result-card__drop">
                <img className="upgrade-result-card__image" src={result.item.image_url} alt={result.item.name} />
                <span className="upgrade-result-card__shine" />
              </div>
            ) : (
              <div className="upgrade-result-card__drop upgrade-result-card__drop--miss">×</div>
            )}
            {result.item && <p className="upgrade-result-card__name">{result.item.name}</p>}
            {result.item && <span className="price-tag">★ {result.item.price_stars}</span>}
            <p className="upgrade-result-card__hint">
              Шанс {result.chance}% · x{result.multiplier}. Стрелка остановилась на {result.roll.toFixed(2)}%.
            </p>
            <button className="upgrade-result-card__close" onClick={() => setResult(null)}>Готово</button>
          </div>
        </div>
      )}
    </>
  );
}
