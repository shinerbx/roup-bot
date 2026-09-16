import { useMemo, useRef, useState, useEffect } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PRESETS = [2, 4, 8, 10];
const MIN_SPIN_MS = 260;
const MAX_SPIN_MS = 460;

function randomItem(items, filter = () => true) {
  const pool = items.filter(filter);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickRandomUpgrade(inventory, catalog) {
  if (!inventory.length || !catalog.length) return { owned: null, target: null };

  const owned = randomItem(inventory);
  if (!owned) return { owned: null, target: null };

  const sourcePrice = Number(owned.price_stars) || 0;
  const distinctCatalog = catalog.filter((item) => item.id !== owned.id);
  const moreValuable = distinctCatalog.filter((item) => Number(item.price_stars) > sourcePrice);
  const target = randomItem(moreValuable.length ? moreValuable : distinctCatalog);

  return { owned, target };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function Slot({ item, placeholder, onOpen, spinning, side, title }) {
  return (
    <div className={`upgrade-slot-container ${spinning ? 'pulsing' : ''}`} onClick={!spinning ? onOpen : undefined}>
      <div className="upgrade-slot-title">{title}</div>
      {!item ? (
        <div className="upgrade-slot-empty">
          <span className="upgrade-slot__plus">+</span>
          <span className="upgrade-slot__placeholder">{placeholder}</span>
        </div>
      ) : (
        <div className="upgrade-slot-filled">
          <img className="upgrade-slot__image" src={item.image_url} alt={item.name} />
          <span className="upgrade-slot__name">{item.name}</span>
          <span className="upgrade-slot__price">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>
        </div>
      )}
    </div>
  );
}

function PickerSheet({ title, items, selectedId, getId, onSelect, onClose, spinning }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet upgrade-picker-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__handle" />
        <div className="upgrade-picker-sheet__header">
          <div>
            <p className="section-title">Выбор предмета</p>
            <h3>{title}</h3>
            <span>{items.length} доступно</span>
          </div>
          <button type="button" className="topup-back" onClick={onClose} aria-label="Закрыть">×</button>
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
                  type="button"
                  key={id}
                  className={`upgrade-picker-item ${selectedId === id ? 'selected' : ''}`}
                  onClick={() => onSelect(item)}
                  disabled={spinning}
                >
                  <span className="upgrade-picker-item__image-wrap">
                    <img src={item.image_url} alt={item.name} />
                  </span>
                  <span>{item.name}</span>
                  <small>★ {Number(item.price_stars).toLocaleString('ru-RU')}</small>
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
  const [spinDuration, setSpinDuration] = useState(340);
  const [flash, setFlash] = useState(false); // Состояние для вспышки
  const spinStartedAtRef = useRef(0);

  const owned = inventory.find((i) => i.inventory_id === ownedId) || null;
  const target = catalog.find((i) => i.id === targetId) || null;
  const selectedMultiplier = multiplier === 'custom'
    ? clampNumber(Number(customMultiplier) || 1, 1, 100)
    : multiplier;

  const percent = useMemo(() => {
    if (!owned || !target) return 0;
    const sourcePrice = Number(owned.price_stars);
    const targetPrice = Number(target.price_stars);
    if (!Number.isFinite(sourcePrice) || !Number.isFinite(targetPrice) || targetPrice <= 0) return 0;
    const base = (sourcePrice / targetPrice) * 100;
    return Math.min(95, Math.max(5, base / selectedMultiplier));
  }, [owned, target, selectedMultiplier]);

  const offset = CIRCUMFERENCE * (1 - percent / 100);
  const customMultiplierValid = multiplier !== 'custom'
    || (Number(customMultiplier) >= 1 && Number(customMultiplier) <= 100);
  const canUpgrade = Boolean(owned && target && !spinning && customMultiplierValid);

  const chooseOwned = (item) => {
    setOwnedId(item.inventory_id);
    setPicker(null);
  };

  const chooseTarget = (item) => {
    setTargetId(item.id);
    setPicker(null);
  };

  const handlePreset = (value) => {
    if (spinning) return;
    setMultiplier(value);

    const pair = pickRandomUpgrade(inventory, catalog);
    if (pair.owned && pair.target) {
      setOwnedId(pair.owned.inventory_id);
      setTargetId(pair.target.id);
      haptic('light');
    }
  };

  const handleCustom = () => {
    if (spinning) return;
    setMultiplier('custom');
    haptic('light');
  };

  const handleUpgrade = async () => {
    if (!canUpgrade) return;

    const duration = Math.round(MIN_SPIN_MS + Math.random() * (MAX_SPIN_MS - MIN_SPIN_MS));
    spinStartedAtRef.current = performance.now();
    setSpinDuration(duration);
    setSpinning(true);
    setResult(null);
    haptic('medium');

    const request = api.upgrade(owned.inventory_id, target.id, selectedMultiplier);
    const animationDone = new Promise((resolve) => setTimeout(resolve, duration));

    try {
      const [res] = await Promise.all([request, animationDone]);
      const serverRoll = Number(res.roll ?? 0);
      const finalAngle = serverRoll * 3.6;

      setSpinning(false);
      setNeedleAngle(finalAngle);

      const elapsed = performance.now() - spinStartedAtRef.current;
      const remaining = Math.max(0, duration - elapsed);
      if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));

      // Активация неоновой вспышки при успехе
      if (res.success) {
        setFlash(true);
        setTimeout(() => setFlash(false), 800);
      }

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
      await animationDone;
      hapticNotify('error');
      onError?.(err.code === 'invalid_multiplier' ? 'Некорректный множитель.' : 'Не получилось выполнить апгрейд. Попробуй снова.');
    } finally {
      setSpinning(false);
    }
  };

  if (loading) return <div className="skeleton upgrade-skeleton" />;

  return (
    <div className="upgrade-screen">
      
      {/* Эффект неоновой вспышки */}
      <div className={`neon-flash-overlay ${flash ? 'active' : ''}`}>
        <div className="neon-flash-circle" />
      </div>

      <section className="upgrade-stage-modern">
        {/* Левый блок (Отдать) */}
        <Slot 
          title="Выберите предметы для использования" 
          item={owned} 
          placeholder="Нажмите, чтобы выбрать" 
          spinning={spinning} 
          side="source" 
          onOpen={() => setPicker('owned')} 
        />

        {/* Центральный блок (Колесо) */}
        <div className="upgrade-center-block">
          <div className="upgrade-wheel-column">
            <div className={`upgrade-gauge ${spinning ? 'spinning' : ''}`} style={{ '--gauge-offset': offset, '--spin-duration': `${spinDuration}ms` }}>
              <svg viewBox="0 0 168 168" aria-hidden="true">
                <defs>
                  <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffc800" />
                    <stop offset="100%" stopColor="#ff7a45" />
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
              <div
                className={`upgrade-needle ${spinning ? 'spinning' : ''}`}
                style={{ '--needle-angle': `${needleAngle}deg` }}
              >
                <span className="upgrade-needle__tip" />
              </div>
              <div className="upgrade-gauge__center">
                <span className="upgrade-gauge__percent">{percent ? percent.toFixed(0) : '—'}%</span>
              </div>
            </div>

            <button type="button" className="upgrade-action-button" disabled={!canUpgrade} onClick={handleUpgrade}>
              {spinning ? 'АПГРЕЙД...' : 'ПРОКАЧАТЬ'}
            </button>
          </div>
        </div>

        {/* Правый блок (Получить) */}
        <Slot 
          title="Выберите предмет для апгрейда" 
          item={target} 
          placeholder="Нажмите, чтобы выбрать" 
          spinning={spinning} 
          side="target" 
          onOpen={() => setPicker('target')} 
        />
      </section>

      <section className="upgrade-multiplier-bar">
        <div className="upgrade-multiplier-bar__label">Множитель</div>
        <div className="upgrade-multiplier-row">
          {PRESETS.map((value) => (
            <button
              type="button"
              key={value}
              className={`upgrade-multiplier ${multiplier === value ? 'selected' : ''}`}
              onClick={() => handlePreset(value)}
              disabled={spinning || !inventory.length || !catalog.length}
            >
              x{value}
            </button>
          ))}
          <button
            type="button"
            className={`upgrade-multiplier upgrade-multiplier--custom ${multiplier === 'custom' ? 'selected' : ''}`}
            onClick={handleCustom}
            disabled={spinning}
          >
            Своя
          </button>
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
              placeholder="3.5"
              disabled={spinning}
              aria-label="Пользовательский множитель"
            />
          </div>
        )}
      </section>

      {picker === 'owned' && (
        <PickerSheet
          title="Предмет из инвентаря"
          items={inventory}
          selectedId={ownedId}
          getId={(i) => i.inventory_id}
          onSelect={chooseOwned}
          onClose={() => setPicker(null)}
          spinning={spinning}
        />
      )}

      {picker === 'target' && (
        <PickerSheet
          title="Желаемый предмет"
          items={catalog}
          selectedId={targetId}
          getId={(i) => i.id}
          onSelect={chooseTarget}
          onClose={() => setPicker(null)}
          spinning={spinning}
        />
      )}

      {result && (
        <div className="upgrade-result-overlay" onClick={() => setResult(null)}>
          <div className="upgrade-result-rays" />
          <div className="upgrade-result-card" onClick={(e) => e.stopPropagation()}>
            <div className={`upgrade-result-card__status ${result.success ? 'is-success' : 'is-miss'}`}>
              <span className="upgrade-result-card__status-dot" />
              {result.success ? 'АПГРЕЙД УСПЕШЕН' : 'НЕ ПОВЕЗЛО'}
            </div>
            {result.item ? (
              <div className="upgrade-result-card__drop">
                <img className="upgrade-result-card__image" src={result.item.image_url} alt={result.item.name} />
                <span className="upgrade-result-card__shine" />
              </div>
            ) : (
              <div className="upgrade-result-card__drop upgrade-result-card__drop--miss">×</div>
            )}
            {result.item && <p className="upgrade-result-card__name">{result.item.name}</p>}
            {result.item && <span className="price-tag">★ {Number(result.item.price_stars).toLocaleString('ru-RU')}</span>}
            <p className="upgrade-result-card__hint">
              Шанс {result.chance}% · x{result.multiplier} · roll {result.roll.toFixed(2)}%
            </p>
            <button type="button" className="upgrade-result-card__close" onClick={() => setResult(null)}>Продолжить</button>
          </div>
        </div>
      )}
    </div>
  );
}
