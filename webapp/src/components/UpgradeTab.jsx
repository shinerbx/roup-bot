import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PRESETS = [2, 4, 8, 10];
const MAX_MULTIPLIER = 100;
const SPIN_MS = 3600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getChance(source, target, multiplier) {
  if (!source || !target) return 0;
  const sourcePrice = Number(source.price_stars);
  const targetPrice = Number(target.price_stars);
  if (!Number.isFinite(sourcePrice) || !Number.isFinite(targetPrice) || targetPrice <= 0) return 0;
  const base = Math.min(100, Math.max(0, sourcePrice / targetPrice * 100));
  return Math.min(100, Math.max(0, base / multiplier));
}

function randomAngleForResult(success, chance) {
  const zone = clamp(chance, 0, 100) * 3.6;
  if (success) {
    return Math.random() * Math.max(zone, 1);
  }
  if (zone >= 359.5) return 359.5 + Math.random() * 0.4;
  return zone + 1 + Math.random() * (359 - zone - 1);
}

function ResultBurst({ success }) {
  const particles = useMemo(() => Array.from({ length: 22 }, (_, index) => ({
    angle: index * (360 / 22) + Math.random() * 8,
    distance: 70 + Math.random() * 100,
    delay: Math.random() * 100
  })), []);
  return (
    <div className={`result-burst ${success ? 'result-burst--success' : 'result-burst--failure'}`} aria-hidden="true">
      {particles.map((particle, index) => (
        <span key={index} style={{ '--angle': `${particle.angle}deg`, '--distance': `${particle.distance}px`, '--delay': `${particle.delay}ms` }} />
      ))}
    </div>
  );
}

function Slot({ item, placeholder, onOpen, spinning, side, title, resultStatus }) {
  const failedTarget = side === 'target' && resultStatus === 'fail';
  return (
    <button
      type="button"
      className={`upgrade-slot ${spinning ? 'upgrade-slot--locked upgrade-slot--spinning' : ''} ${resultStatus === 'success' ? 'upgrade-slot--success' : ''} ${resultStatus === 'fail' || resultStatus === 'fail-source' ? 'upgrade-slot--failed' : ''}`}
      onClick={!spinning && !resultStatus ? onOpen : undefined}
      disabled={spinning || Boolean(resultStatus)}
      aria-label={item ? `${title}: ${item.name}` : title}
    >
      <span className="upgrade-slot__title">{title}</span>
      {failedTarget ? (
        <span className="upgrade-slot__failure">НЕУДАЧА</span>
      ) : item ? (
        <span className="upgrade-slot__filled">
          <span className="upgrade-slot__image-wrap">
            <img src={item.image_url} alt="" />
          </span>
          <span className="upgrade-slot__name" title={item.name}>{item.name}</span>
          <span className="upgrade-slot__price">★ {Number(item.price_stars).toLocaleString('ru-RU')}</span>
        </span>
      ) : (
        <span className="upgrade-slot__empty">
          <span className="upgrade-slot__plus">+</span>
          <span>{placeholder}</span>
        </span>
      )}
    </button>
  );
}

function PickerSheet({ title, items, selectedId, getId, onSelect, onClose, disabledReason }) {
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
            <p className="empty-state__title">Нет доступных предметов</p>
            <p>{disabledReason || 'Здесь пока ничего нет.'}</p>
          </div>
        ) : (
          <div className="upgrade-modal-grid" role="list">
            {items.map((item) => {
              const id = getId(item);
              return (
                <button
                  type="button"
                  key={id}
                  className={`upgrade-picker-item ${selectedId === id ? 'selected' : ''}`}
                  onClick={() => onSelect(item)}
                >
                  <span className="upgrade-picker-item__image-wrap"><img src={item.image_url} alt="" /></span>
                  <span className="upgrade-picker-item__name" title={item.name}>{item.name}</span>
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
  const [spinKey, setSpinKey] = useState(0);
  const [serverChance, setServerChance] = useState(null);
  const timerRef = useRef(null);

  const owned = inventory.find((i) => i.inventory_id === ownedId) || null;
  const target = catalog.find((i) => i.id === targetId) || null;
  const selectedMultiplier = multiplier === 'custom'
    ? Number(customMultiplier)
    : Number(multiplier);
  const customValid = multiplier !== 'custom' ||
    (Number.isFinite(selectedMultiplier) && selectedMultiplier >= 1 && selectedMultiplier <= MAX_MULTIPLIER && Math.abs(selectedMultiplier * 10 - Math.round(selectedMultiplier * 10)) < 1e-9);

  const displayChance = serverChance ?? getChance(owned, target, customValid ? selectedMultiplier : 1);

  const targetItems = useMemo(() => {
    if (!owned) return catalog;
    const sourcePrice = Number(owned.price_stars);
    return catalog.filter((item) => Number(item.price_stars) > sourcePrice);
  }, [catalog, owned]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const chooseOwned = (item) => {
    setOwnedId(item.inventory_id);
    setTargetId((current) => {
      const currentTarget = catalog.find((x) => x.id === current);
      return currentTarget && Number(currentTarget.price_stars) > Number(item.price_stars) ? current : null;
    });
    setServerChance(null);
    setPicker(null);
    haptic('light');
  };

  const chooseTarget = (item) => {
    if (!owned || Number(item.price_stars) <= Number(owned.price_stars)) return;
    setTargetId(item.id);
    setServerChance(null);
    setPicker(null);
    haptic('light');
  };

  const chooseMultiplier = (value) => {
    if (spinning || result) return;
    setMultiplier(value);
    setServerChance(null);
    haptic('light');
  };

  const handleCustom = () => {
    if (spinning || result) return;
    setMultiplier('custom');
    setServerChance(null);
    haptic('light');
  };

  const handleAction = async () => {
    if (result) {
      setResult(null);
      setOwnedId(null);
      setTargetId(null);
      setNeedleAngle(0);
      setServerChance(null);
      return;
    }

    if (!owned || !target || !customValid || spinning) return;

    setSpinning(true);
    setResult(null);
    setServerChance(null);
    setNeedleAngle(0);
    haptic('medium');

    try {
      // The server decides success/failure. Animation starts only after its result arrives.
      const res = await api.upgrade(owned.inventory_id, target.id, selectedMultiplier);
      const success = Boolean(res.success);
      const chance = Number.isFinite(Number(res.chance)) ? Number(res.chance) : getChance(owned, target, selectedMultiplier);
      const finalAngle = randomAngleForResult(success, chance);

      setServerChance(chance);
      setNeedleAngle(finalAngle);
      setSpinKey((value) => value + 1);

      await new Promise((resolve) => {
        timerRef.current = setTimeout(resolve, SPIN_MS);
      });

      hapticNotify(success ? 'success' : 'error');
      setResult({ sourceItem: owned, targetItem: target, success, item: res.item });
      await onUpgraded?.();
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      const messages = {
        same_price_target: 'Предметы одинаковой стоимости нельзя улучшать.',
        item_not_owned: 'Исходный предмет уже недоступен.',
        invalid_multiplier: 'Некорректный множитель.',
        target_not_found: 'Целевой предмет больше недоступен.',
        target_not_higher: 'Для апгрейда нужен предмет дороже исходного.'
      };
      onError?.(messages[err.code] || 'Не удалось выполнить апгрейд. Попробуйте ещё раз.');
      setNeedleAngle(0);
    } finally {
      setSpinning(false);
    }
  };

  if (loading) return <div className="skeleton upgrade-skeleton" />;

  const sourceStatus = result ? (result.success ? 'success' : 'fail-source') : null;
  const targetStatus = result ? (result.success ? 'success' : 'fail') : null;

  return (
    <div className="upgrade-screen">
      {result && <ResultBurst success={result.success} />}

      <section className={`upgrade-stage-modern ${spinning ? 'upgrade-stage--spinning' : ''} ${result ? (result.success ? 'upgrade-stage--success' : 'upgrade-stage--failure') : ''}`}>
        {result && (
          <div className={`upgrade-result-neon ${result.success ? 'upgrade-result-neon--success' : 'upgrade-result-neon--failure'}`} role="status" aria-live="polite">
            {result.success ? 'УСПЕХ!' : 'НЕУДАЧА!'}
          </div>
        )}
        <Slot
          title="У тебя есть"
          item={result?.sourceItem || owned}
          placeholder="Выбрать"
          spinning={spinning}
          side="source"
          onOpen={() => setPicker('owned')}
          resultStatus={sourceStatus}
        />

        <div className="upgrade-center-block">
          <div className="upgrade-wheel-column">
            <div
              key={spinKey}
              className={`upgrade-gauge ${spinning ? 'spinning' : ''} ${result?.success ? 'success' : ''} ${result && !result.success ? 'failure' : ''}`}
              style={{ '--spin-duration': `${SPIN_MS}ms`, '--needle-angle': `${needleAngle}deg`, '--chance': `${displayChance}` }}
            >
              <svg viewBox="0 0 168 168" aria-hidden="true">
                <defs>
                  <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#e8b84a" />
                    <stop offset="100%" stopColor="#ef3b4f" />
                  </linearGradient>
                </defs>
                <circle className="upgrade-gauge__track" cx="84" cy="84" r={RADIUS} />
                <circle className="upgrade-gauge__value-arc" cx="84" cy="84" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - displayChance / 100)} />
              </svg>
              <div className="upgrade-needle" aria-hidden="true"><span /></div>
              <div className="upgrade-gauge__center">
                <strong>{result ? (result.success ? 'УСПЕХ' : 'НЕУДАЧА') : `${Number(displayChance).toFixed(displayChance % 1 ? 1 : 0)}%`}</strong>
              </div>
            </div>
            <button
              type="button"
              className="upgrade-action-button"
              disabled={result ? false : (!owned || !target || !customValid || spinning)}
              onClick={handleAction}
            >
              {spinning ? 'АПГРЕЙДИМ…' : result ? 'ПРОДОЛЖИТЬ' : 'УЛУЧШИТЬ'}
            </button>
          </div>
        </div>

        <Slot
          title="Хочешь получить"
          item={result?.targetItem || target}
          placeholder="Выбрать"
          spinning={spinning}
          side="target"
          onOpen={() => setPicker('target')}
          resultStatus={targetStatus}
        />
      </section>

      <section className="upgrade-multiplier-bar">
        <div className="upgrade-multiplier-bar__head">
          <span>Множитель</span>
          {owned && target && <span className="upgrade-multiplier-bar__chance">Шанс {Number(displayChance).toFixed(displayChance % 1 ? 1 : 0)}%</span>}
        </div>
        <div className="upgrade-multiplier-row">
          {PRESETS.map((value) => (
            <button type="button" key={value} className={`upgrade-multiplier ${multiplier === value ? 'selected' : ''}`} onClick={() => chooseMultiplier(value)} disabled={spinning || Boolean(result)}>
              ×{value}
            </button>
          ))}
          <button type="button" className={`upgrade-multiplier upgrade-multiplier--custom ${multiplier === 'custom' ? 'selected' : ''}`} onClick={handleCustom} disabled={spinning || Boolean(result)}>
            Своя
          </button>
        </div>
        {multiplier === 'custom' && (
          <div className="upgrade-custom-multiplier">
            <span>×</span>
            <input
              inputMode="decimal"
              type="number"
              min="1"
              max="100"
              step="0.1"
              value={customMultiplier}
              onChange={(event) => setCustomMultiplier(event.target.value)}
              placeholder="3.5"
              disabled={spinning || Boolean(result)}
              aria-label="Пользовательский множитель"
            />
          </div>
        )}
      </section>

      {!owned && !inventory.length && (
        <div className="empty-state upgrade-empty">
          <p className="empty-state__title">Нужен предмет</p>
          <p>Купи или получи предмет, чтобы начать апгрейд.</p>
        </div>
      )}

      {owned && !targetItems.length && !result && (
        <div className="empty-state upgrade-empty">
          <p className="empty-state__title">Нет подходящих целей</p>
          <p>Выбери предмет другой стоимости.</p>
        </div>
      )}

      {picker === 'owned' && (
        <PickerSheet title="Предмет из инвентаря" items={inventory} selectedId={ownedId} getId={(item) => item.inventory_id} onSelect={chooseOwned} onClose={() => setPicker(null)} />
      )}

      {picker === 'target' && (
        <PickerSheet
          title="Целевой предмет"
          items={targetItems}
          selectedId={targetId}
          getId={(item) => item.id}
          onSelect={chooseTarget}
          onClose={() => setPicker(null)}
          disabledReason="Предметы одинаковой стоимости нельзя выбрать."
        />
      )}
    </div>
  );
}
