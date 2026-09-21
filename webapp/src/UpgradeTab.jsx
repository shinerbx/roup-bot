import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
};

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Честный ценовой ratio: source.price / target.price × 100 (с учётом config).
// НЕ зависит от множителя — одна пара предметов даёт один и тот же процент.
function calcDisplayChance(source, target, config) {
  if (!source || !target) return 0;
  const s = Number(source.price_stars);
  const t = Number(target.price_stars);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= s) return 0;
  const ratio = Math.pow(s / t, config.displayGamma);
  const base = ratio * 100 * config.displayBaseChanceMultiplier;
  return clamp(base * (1 - config.displayHouseEdge), config.minChance, config.maxChance);
}

function formatChance(c) {
  const n = Number(c);
  if (!Number.isFinite(n) || n <= 0) return '0.0%';
  return `${n.toFixed(1)}%`;
}

function findClosestTarget(catalog, desiredPrice, sourceItem) {
  if (!sourceItem) return null;
  const sp = Number(sourceItem.price_stars);
  let min = Infinity;
  let winners = [];
  for (const item of catalog) {
    const p = Number(item.price_stars);
    if (p <= sp) continue;
    const d = Math.abs(p - desiredPrice);
    if (d < min - 1e-6) { min = d; winners = [item]; }
    else if (Math.abs(d - min) <= 1e-6) winners.push(item);
  }
  return winners.length ? winners[Math.floor(Math.random() * winners.length)] : null;
}

// Приводит пару (source, target) к состоянию UI множителя:
// округляет ratio до 0.1, ищет пресет, при промахе ставит «Своя».
function ratioToUi(sourceItem, targetItem) {
  if (!sourceItem || !targetItem) return { kind: 'preset', value: 2 };
  const ratio = Number(targetItem.price_stars) / Number(sourceItem.price_stars);
  const rounded = Math.round(ratio * 10) / 10;
  const preset = PRESETS.find((p) => Math.abs(p - rounded) < 0.05);
  if (preset) return { kind: 'preset', value: preset };
  return { kind: 'custom', value: rounded };
}

function pickSpinProfile(profiles, jitter) {
  const list = Array.isArray(profiles) && profiles.length ? profiles : DEFAULT_CONFIG.spinProfiles;
  const j = jitter || DEFAULT_CONFIG.spinJitter;
  const base = list[Math.floor(Math.random() * list.length)];
  const jf = (j.DURATION_MIN || 0.85) + Math.random() * ((j.DURATION_MAX || 1.2) - (j.DURATION_MIN || 0.85));
  const extra = Math.floor(Math.random() * ((j.EXTRA_TURNS_MAX || 1) + 1));
  return { duration: Math.round(base.duration * jf), turns: base.turns + extra, easing: base.easing };
}

const Slot = memo(function Slot({ item, placeholder, onOpen, spinning, side, title, resultStatus }) {
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
            <img src={item.image_url} alt="" loading="lazy" decoding="async" />
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
});

const PickerSheet = memo(function PickerSheet({ title, items, selectedId, getId, onSelect, onClose, disabledReason }) {
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
                  <span className="upgrade-picker-item__image-wrap">
                    <img src={item.image_url} alt="" loading="lazy" decoding="async" />
                  </span>
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
});

export default function UpgradeTab({ inventory, catalog, loading, demoActive = false, onUpgraded, onError }) {
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
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.getUpgradeConfig?.()
      .then((r) => { if (alive && r && !r.__notModified) setConfig((prev) => ({ ...prev, ...r })); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const availableInventory = useMemo(
    () => demoActive ? inventory.filter((i) => Number(i.is_demo) === 1) : inventory.filter((i) => Number(i.is_demo) !== 1),
    [inventory, demoActive]
  );

  const owned = useMemo(
    () => availableInventory.find((i) => i.inventory_id === ownedId) || null,
    [availableInventory, ownedId]
  );
  const target = useMemo(
    () => catalog.find((i) => i.id === targetId) || null,
    [catalog, targetId]
  );
  const selectedMultiplier = multiplier === 'custom' ? Number(customMultiplier) : Number(multiplier);

  const customValid = multiplier !== 'custom' ||
    (Number.isFinite(selectedMultiplier) && selectedMultiplier >= config.minMultiplier &&
     selectedMultiplier <= config.maxMultiplier &&
     Math.abs(selectedMultiplier * 10 - Math.round(selectedMultiplier * 10)) < 1e-9);

  // Главный фикс: шанс вычисляется из ВЫБРАННОЙ ПАРЫ предметов, а не из нажатой
  // кнопки множителя. Одна пара = один процент на экране, независимо от того,
  // сколько раз игрок переключал пресеты.
  const wheelChance = useMemo(() => {
    if (!owned || !target) return 0;
    return calcDisplayChance(owned, target, config);
  }, [owned, target, config]);

  const targetItems = useMemo(() => {
    if (!owned) return catalog;
    const sp = Number(owned.price_stars);
    return catalog.filter((item) => Number(item.price_stars) > sp);
  }, [catalog, owned]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Приводит состояние множителя к фактическому ratio пары. Вызывается после
  // любого автоподбора целевого предмета, чтобы кнопка множителя не врала.
  const syncMultiplierToPair = useCallback((sourceItem, targetItem) => {
    const ui = ratioToUi(sourceItem, targetItem);
    if (ui.kind === 'preset') {
      setMultiplier(ui.value);
      setCustomMultiplier('');
    } else {
      setMultiplier('custom');
      setCustomMultiplier(String(ui.value));
    }
  }, []);

  const pickTargetFor = useCallback((sourceItem, mult) => {
    if (!sourceItem) return null;
    const mNum = Number(mult);
    if (!Number.isFinite(mNum) || mNum < 1) return null;
    const desired = Number(sourceItem.price_stars) * mNum;
    return findClosestTarget(catalog, desired, sourceItem);
  }, [catalog]);

  const chooseOwned = useCallback((item) => {
    setOwnedId(item.inventory_id);
    setPicker(null);
    haptic('light');

    // Автоподбор цели под текущий множитель, затем синхронизация UI.
    const mNum = multiplier === 'custom' ? Number(customMultiplier) : Number(multiplier);
    if (Number.isFinite(mNum) && mNum >= 1) {
      const pick = pickTargetFor(item, mNum);
      if (pick) {
        setTargetId(pick.id);
        syncMultiplierToPair(item, pick);
        return;
      }
    }
    setTargetId(null);
  }, [multiplier, customMultiplier, pickTargetFor, syncMultiplierToPair]);

  const chooseTarget = useCallback((item) => {
    if (!owned || Number(item.price_stars) <= Number(owned.price_stars)) return;
    setTargetId(item.id);
    syncMultiplierToPair(owned, item);
    setPicker(null);
    haptic('light');
  }, [owned, syncMultiplierToPair]);

  const chooseMultiplier = useCallback((value) => {
    if (spinning || busy || result || !owned) return;
    haptic('light');

    if (value === 'custom') {
      setMultiplier('custom');
      return;
    }

    const mNum = Number(value);
    if (!Number.isFinite(mNum) || mNum < 1) return;

    const pick = pickTargetFor(owned, mNum);
    if (!pick) {
      setMultiplier(value);
      setTargetId(null);
      return;
    }
    setTargetId(pick.id);
    // Кнопка подсветится фактическим ratio пары, а не тем, что нажал игрок.
    // Если под ×4 нет цели и берётся ×3 — кнопка переключится на «Своя ×3».
    syncMultiplierToPair(owned, pick);
  }, [spinning, busy, result, owned, pickTargetFor, syncMultiplierToPair]);

  const handleCustom = useCallback(() => {
    if (spinning || busy || result || !owned) return;
    setMultiplier('custom');
    haptic('light');
  }, [spinning, busy, result, owned]);

  const handleCustomChange = useCallback((val) => {
    setCustomMultiplier(val);
    if (!owned) return;
    const m = Number(val);
    if (!Number.isFinite(m) || m < 1 || m > config.maxMultiplier) {
      setTargetId(null);
      return;
    }
    const pick = pickTargetFor(owned, m);
    setTargetId(pick ? pick.id : null);
  }, [owned, pickTargetFor, config.maxMultiplier]);

  const handleAction = useCallback(async () => {
    if (result) {
      setResult(null);
      setOwnedId(null);
      setTargetId(null);
      setNeedleAngle(0);
      setTotalAngle(0);
      return;
    }

    if (!owned || !target || !customValid || spinning || busy) return;

    setBusy(true);
    setResult(null);
    haptic('medium');

    try {
      const res = await api.upgrade(owned.inventory_id, target.id, selectedMultiplier);
      const success = Boolean(res.success);
      const landing = Number.isFinite(Number(res.landingAngle)) ? Number(res.landingAngle) : 0;
      const profile = pickSpinProfile(config.spinProfiles, config.spinJitter);

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
      setResult({ sourceItem: owned, targetItem: target, success, item: res.item, expectedChance: wheelChance });
      await onUpgraded?.();
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      const messages = {
        demo_item_required: 'Во время Demo можно улучшать только Demo-предметы.',
        demo_item_locked: 'Demo-предмет больше недоступен вне Demo-режима.',
        same_price_target: 'Предметы одинаковой стоимости нельзя улучшать.',
        item_not_owned: 'Исходный предмет уже недоступен.',
        invalid_multiplier: 'Некорректный множитель.',
        target_not_found: 'Целевой предмет больше недоступен.',
        target_not_higher: 'Для апгрейда нужен предмет дороже исходного.',
        operation_in_progress: 'Апгрейд уже выполняется.',
        user_not_found: 'Профиль игрока не найден.',
        pending_upgrade: 'Подождите — предыдущий апгрейд ещё обрабатывается.',
      };
      onError?.(messages[err.code] || 'Не удалось выполнить апгрейд. Попробуйте ещё раз.');
      setNeedleAngle(0);
      setTotalAngle(0);
    } finally {
      setBusy(false);
      setSpinning(false);
    }
  }, [owned, target, customValid, spinning, busy, result, selectedMultiplier, config, onUpgraded, onError, wheelChance]);

  if (loading) return <div className="skeleton upgrade-skeleton" />;

  const sourceStatus = result ? (result.success ? 'success' : 'fail-source') : null;
  const targetStatus = result ? (result.success ? 'success' : 'fail') : null;
  const canUpgrade = owned && target && customValid && !spinning && !busy && !result;

  return (
    <div className="upgrade-screen">
      <section className={`upgrade-stage-modern ${spinning ? 'upgrade-stage--spinning' : ''} ${result ? (result.success ? 'upgrade-stage--success' : 'upgrade-stage--failure') : ''}`}>
        {result && (
          <div
            className={`upgrade-result-neon ${result.success ? 'upgrade-result-neon--success' : 'upgrade-result-neon--failure'}`}
            role="status" aria-live="polite"
          >
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
                  strokeDashoffset={CIRCUMFERENCE * (1 - wheelChance / 100)}
                />
              </svg>
              <div className="upgrade-needle" aria-hidden="true"><span /></div>
              <div className="upgrade-gauge__center">
                <strong>{result ? (result.success ? 'УСПЕХ' : 'НЕУДАЧА') : (wheelChance > 0 ? formatChance(wheelChance) : '—')}</strong>
              </div>
            </div>

            <button
              type="button"
              className="upgrade-action-button"
              disabled={result ? false : !canUpgrade}
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
          {owned && target && (
            <span className="upgrade-multiplier-bar__chance">Шанс {formatChance(wheelChance)}</span>
          )}
        </div>
        <div className="upgrade-multiplier-row">
          {PRESETS.map((value) => (
            <button
              type="button"
              key={value}
              className={`upgrade-multiplier ${multiplier === value ? 'selected' : ''}`}
              onClick={() => chooseMultiplier(value)}
              disabled={spinning || busy || Boolean(result) || !owned}
            >
              ×{value}
            </button>
          ))}
          <button
            type="button"
            className={`upgrade-multiplier upgrade-multiplier--custom ${multiplier === 'custom' ? 'selected' : ''}`}
            onClick={handleCustom}
            disabled={spinning || busy || Boolean(result) || !owned}
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
              disabled={spinning || busy || Boolean(result) || !owned}
              aria-label="Пользовательский множитель"
            />
          </div>
        )}
      </section>

      {!owned && !availableInventory.length && (
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
          items={availableInventory}
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

      <footer className="app-footer">
        <span className="app-footer__line">
          Апгрейд — игровая механика, а не ставка и не казино.
        </span>
        <span className="app-footer__line">
          Шанс успеха показан честно. При неудаче исходный предмет сгорает.
        </span>
        <span className="app-footer__line">
          Сервис <b>18+</b>.
          <span className="app-footer__sep">·</span>
          <a
            className="app-footer__link"
            href="https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-ispolzovaniya-RoUP-09-19"
            target="_blank"
            rel="noopener noreferrer"
          >
            Правила
          </a>
        </span>
      </footer>
    </div>
  );
}
