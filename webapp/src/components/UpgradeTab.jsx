import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RADIUS = 74;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const PRESETS = [2, 4, 8, 10];

const DEFAULT_CONFIG = {
  displayGamma: 1.0,
  displayBaseChanceMultiplier: 1.0,
  displayHouseEdge: 0.0,
  minChance: 0.1,
  maxChance: 95,
  minMultiplier: 1,
  maxMultiplier: 100,
  spinProfiles: [
    { duration: 2900, turns: 3, easing: 'cubic-bezier(.08,.72,.18,1)' },
    { duration: 3400, turns: 4, easing: 'cubic-bezier(.15,.55,.35,1)' },
    { duration: 4100, turns: 5, easing: 'cubic-bezier(.2,.6,.15,1)' },
    { duration: 4700, turns: 6, easing: 'cubic-bezier(.12,.7,.2,1)' },
    { duration: 5300, turns: 7, easing: 'cubic-bezier(.1,.75,.22,1)' },
  ],
  spinJitter: { DURATION_MIN: 0.85, DURATION_MAX: 1.20, EXTRA_TURNS_MAX: 1 },
  nearMiss: { MILLIMETER: 0.20, CLOSE: 0.30, FAR: 0.50 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calcDisplayChance(source, target, multiplier, config) {
  if (!source || !target) return 0;
  const sourcePrice = Number(source.price_stars);
  const targetPrice = Number(target.price_stars);
  if (!Number.isFinite(sourcePrice) || !Number.isFinite(targetPrice) || targetPrice <= sourcePrice) return 0;

  const safeMultiplier = Math.max(1, Number(multiplier) || 1);
  const ratio = Math.pow(sourcePrice / targetPrice, config.displayGamma);
  const base = ratio * 100 * config.displayBaseChanceMultiplier;
  const withMult = base / safeMultiplier;
  const withEdge = withMult * (1 - config.displayHouseEdge);
  return clamp(withEdge, config.minChance, config.maxChance);
}

function formatChance(chance) {
  return `${Number(chance).toFixed(1)}%`;
}

function findClosestTarget(catalog, desiredPrice, sourceItem) {
  if (!sourceItem) return null;
  const sourcePrice = Number(sourceItem.price_stars);
  const candidates = catalog.filter((i) => Number(i.price_stars) > sourcePrice);
  if (!candidates.length) return null;

  let minDiff = Infinity;
  let winners = [];
  for (const item of candidates) {
    const diff = Math.abs(Number(item.price_stars) - desiredPrice);
    if (diff < minDiff - 1e-6) {
      minDiff = diff;
      winners = [item];
    } else if (Math.abs(diff - minDiff) <= 1e-6) {
      winners.push(item);
    }
  }
  return winners[Math.floor(Math.random() * winners.length)];
}

function pickSpinProfile(profiles, jitter) {
  const list = Array.isArray(profiles) && profiles.length ? profiles : DEFAULT_CONFIG.spinProfiles;
  const j = jitter || DEFAULT_CONFIG.spinJitter;
  const base = list[Math.floor(Math.random() * list.length)];
  const jitterFactor = (j.DURATION_MIN || 0.85) + Math.random() * ((j.DURATION_MAX || 1.2) - (j.DURATION_MIN || 0.85));
  const extraTurns = Math.floor(Math.random() * ((j.EXTRA_TURNS_MAX || 1) + 1));
  return {
    duration: Math.round(base.duration * jitterFactor),
    turns: base.turns + extraTurns,
    easing: base.easing,
  };
}

function computeLandingAngle(success, displayChance, nearMiss) {
  const zone = clamp(displayChance, 0, 100) * 3.6;

  if (zone < 0.5) return Math.random() * 360;

  if (success) {
    return zone * (0.08 + Math.random() * 0.84);
  }

  const missArc = 360 - zone;
  const weights = nearMiss || DEFAULT_CONFIG.nearMiss;
  const r = Math.random();
  let offset;

  if (r < (weights.MILLIMETER || 0)) {
    const before = Math.random() < 0.5;
    const gap = 0.4 + Math.random() * 1.8;
    offset = before ? (missArc - gap) : gap;
  } else if (r < ((weights.MILLIMETER || 0) + (weights.CLOSE || 0))) {
    const before = Math.random() < 0.5;
    const gap = 2 + Math.random() * 8;
    offset = before ? (missArc - gap) : gap;
  } else {
    offset = missArc * (0.15 + Math.random() * 0.7);
  }

  const safeOffset = clamp(offset, 0.2, missArc - 0.2);
  return (zone + safeOffset) % 360;
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
        <span key={index} style={{
          '--angle': `${particle.angle}deg`,
          '--distance': `${particle.distance}px`,
          '--delay': `${particle.delay}ms`
        }} />
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [multiplier, setMultiplier] = useState(2);
  const [customMultiplier, setCustomMultiplier] = useState('');
  const [needleAngle, setNeedleAngle] = useState(0);
  const [totalAngle, setTotalAngle] = useState(0);
  const [spinProfile, setSpinProfile] = useState(DEFAULT_CONFIG.spinProfiles[0]);
  const [spinKey, setSpinKey] = useState(0);
  const [serverChance, setServerChance] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.getUpgradeConfig?.()
      .then((r) => { if (alive && r) setConfig({ ...DEFAULT_CONFIG, ...r }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const owned = inventory.find((i) => i.inventory_id === ownedId) || null;
  const target = catalog.find((i) => i.id === targetId) || null;
  const selectedMultiplier = multiplier === 'custom'
    ? Number(customMultiplier)
    : Number(multiplier);

  const customValid = multiplier !== 'custom' ||
    (Number.isFinite(selectedMultiplier) && selectedMultiplier >= config.minMultiplier &&
     selectedMultiplier <= config.maxMultiplier &&
     Math.abs(selectedMultiplier * 10 - Math.round(selectedMultiplier * 10)) < 1e-9);

  const displayChance = serverChance ?? calcDisplayChance(owned, target, customValid ? selectedMultiplier : 1, config);

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

  const chooseMultiplier = useCallback((value) => {
    if (spinning || busy || result) return;
    setMultiplier(value);
    setServerChance(null);
    haptic('light');

    if (!owned || value === 'custom') return;
    const m = Number(value);
    if (!Number.isFinite(m) || m < 1) return;

    const desired = Number(owned.price_stars) * m;
    const pick = findClosestTarget(catalog, desired, owned);
    if (pick) setTargetId(pick.id);
  }, [spinning, busy, result, owned, catalog]);

  const handleCustom = () => {
    if (spinning || busy || result) return;
    setMultiplier('custom');
    setServerChance(null);
    haptic('light');
  };

  const handleCustomChange = (val) => {
    setCustomMultiplier(val);
    setServerChance(null);
    if (!owned) return;
    const m = Number(val);
    if (!Number.isFinite(m) || m < 1 || m > config.maxMultiplier) return;
    const desired = Number(owned.price_stars) * m;
    const pick = findClosestTarget(catalog, desired, owned);
    if (pick) setTargetId(pick.id);
  };

  const handleAction = async () => {
    if (result) {
      setResult(null);
      setOwnedId(null);
      setTargetId(null);
      setNeedleAngle(0);
      setTotalAngle(0);
      setServerChance(null);
      return;
    }

    if (!owned || !target || !customValid || spinning || busy) return;

    setBusy(true);
    setResult(null);
    setServerChance(null);
    haptic('medium');

    try {
      const res = await api.upgrade(owned.inventory_id, target.id, selectedMultiplier);
      const success = Boolean(res.success);
      const display = Number.isFinite(Number(res.chance))
        ? Number(res.chance)
        : calcDisplayChance(owned, target, selectedMultiplier, config);

      const landing = computeLandingAngle(success, display, config.nearMiss);
      const profile = pickSpinProfile(config.spinProfiles, config.spinJitter);

      setServerChance(display);
      setSpinProfile(profile);
      setNeedleAngle(landing);
      setTotalAngle(landing + profile.turns * 360);
      setSpinKey((v) => v + 1);
      setSpinning(true);
      setBusy(false);

      await new Promise((resolve) => {
        timerRef.current = setTimeout(resolve, profile.duration + 150);
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
        target_not_higher: 'Для апгрейда нужен предмет дороже исходного.',
        operation_in_progress: 'Апгрейд уже выполняется.',
      };
      onError?.(messages[err.code] || 'Не удалось выполнить апгрейд. Попробуйте ещё раз.');
      setNeedleAngle(0);
      setTotalAngle(0);
    } finally {
      setBusy(false);
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
              style={{
                '--spin-duration': `${spinProfile.duration}ms`,
                '--spin-easing': spinProfile.easing,
                '--needle-angle': `${needleAngle}deg`,
                '--spin-total-angle': `${totalAngle}deg`,
                '--chance': `${displayChance}`,
              }}
            >
              <svg viewBox="0 0 168 168" aria-hidden="true">
                <defs>
                  <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#e8b84a" />
                    <stop offset="100%" stopColor="#ef3b4f" />
                  </linearGradient>
                </defs>
                <circle className="upgrade-gauge__track" cx="84" cy="84" r={RADIUS} />
                <circle
                  className="upgrade-gauge__value-arc"
                  cx="84" cy="84" r={RADIUS}
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - displayChance / 100)}
                />
              </svg>
              <div className="upgrade-needle" aria-hidden="true"><span /></div>
              <div className="upgrade-gauge__center">
                <strong>{result ? (result.success ? 'УСПЕХ' : 'НЕУДАЧА') : formatChance(displayChance)}</strong>
              </div>
            </div>
            <button
              type="button"
              className="upgrade-action-button"
              disabled={result ? false : (!owned || !target || !customValid || spinning || busy)}
              onClick={handleAction}
            >
              {busy || spinning ? 'АПГРЕЙДИМ…' : result ? 'ПРОДОЛЖИТЬ' : 'УЛУЧШИТЬ'}
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
          {owned && target && <span className="upgrade-multiplier-bar__chance">Шанс {formatChance(displayChance)}</span>}
        </div>
        <div className="upgrade-multiplier-row">
          {PRESETS.map((value) => (
            <button
              type="button"
              key={value}
              className={`upgrade-multiplier ${multiplier === value ? 'selected' : ''}`}
              onClick={() => chooseMultiplier(value)}
              disabled={spinning || busy || Boolean(result)}
            >
              ×{value}
            </button>
          ))}
          <button
            type="button"
            className={`upgrade-multiplier upgrade-multiplier--custom ${multiplier === 'custom' ? 'selected' : ''}`}
            onClick={handleCustom}
            disabled={spinning || busy || Boolean(result)}
          >
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
              max={config.maxMultiplier}
              step="0.1"
              value={customMultiplier}
              onChange={(event) => handleCustomChange(event.target.value)}
              placeholder="3.5"
              disabled={spinning || busy || Boolean(result)}
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
        <PickerSheet
          title="Предмет из инвентаря"
          items={inventory}
          selectedId={ownedId}
          getId={(item) => item.inventory_id}
          onSelect={chooseOwned}
          onClose={() => setPicker(null)}
        />
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
