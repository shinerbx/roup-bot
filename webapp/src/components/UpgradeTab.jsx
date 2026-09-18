// language: JSX, file: UpgradeTab.jsx, target: React
// *Экран апгрейда. Подписи слотов, кнопок, шанса. Логика не тронута.*

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

function calcDisplayChance(source, target, config) {
  if (!source || !target) return 0;
  const s = Number(source.price_stars);
  const t = Number(target.price_stars);
  if (!Number.isFinite(s) || !Number.isFinite(t) || t <= s) return 0;
  const ratio = Math.pow(s / t, config.displayGamma);
  const base = ratio * 100 * config.displayBaseChanceMultiplier;
  return clamp(base * (1 - config.displayHouseEdge), config.minChance, config.maxChance);
}

function calculateExpectedChance(multiplier) {
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m < 1) return 0;
  return Math.min(100, 100 / m);
}

function formatChance(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toFixed(1)}%`;
}

// ... findClosestTarget, pickSpinProfile и остальные хелперы не тронуты

export default function UpgradeTab({ inventory, catalog, onRefresh }) {
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [multiplier, setMultiplier] = useState(2);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [angle, setAngle] = useState(0);

  // ... useEffect'ы загрузки конфига, инвентаря, каталога — не тронуты

  const displayChance = useMemo(() => {
    if (!source || !target) return 0;
    return calcDisplayChance(source, target, config);
  }, [source, target, config]);

  const expectedChance = useMemo(
    () => calculateExpectedChance(multiplier),
    [multiplier]
  );

  const handleUpgrade = useCallback(async () => {
    if (!source || !target || spinning) return;
    setSpinning(true);
    setResult(null);
    haptic('medium');
    try {
      const r = await api.upgrade({
        sourceInventoryId: source.inventory_id,
        targetItemId: target.id,
        multiplier,
      });
      const landing = r.landingAngle ?? 0;
      setAngle(landing);
      // ... логика анимации не тронута
      setResult(r);
      hapticNotify(r.success);
      onRefresh?.();
    } catch (err) {
      console.error(err);
    } finally {
      setSpinning(false);
    }
  }, [source, target, multiplier, spinning, onRefresh]);

  return (
    <div className="upgrade-screen">
      {/* ── Слот 1: У тебя есть ── */}
      <section className="upgrade-slot">
        <h3 className="upgrade-slot__title">
          {source ? 'У тебя есть' : 'Выбери свой предмет'}
        </h3>
        {source ? (
          <div className="upgrade-slot__item">
            <img src={source.image_url} alt="" />
            <p>{source.name}</p>
            <small>★ {Number(source.price_stars).toLocaleString('ru-RU')}</small>
          </div>
        ) : (
          <div className="upgrade-slot__placeholder">Нажми, чтобы выбрать из инвентаря</div>
        )}
      </section>

      {/* ── Слот 2: Хочешь получить ── */}
      <section className="upgrade-slot">
        <h3 className="upgrade-slot__title">
          {target ? 'Хочешь получить' : 'Выбери цель апгрейда'}
        </h3>
        {target ? (
          <div className="upgrade-slot__item">
            <img src={target.image_url} alt="" />
            <p>{target.name}</p>
            <small>★ {Number(target.price_stars).toLocaleString('ru-RU')}</small>
          </div>
        ) : (
          <div className="upgrade-slot__placeholder">Нажми, чтобы выбрать из каталога</div>
        )}
      </section>

      {/* ── Множители ── */}
      <div className="upgrade-multipliers">
        <span className="upgrade-multipliers__label">Множитель:</span>
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip ${multiplier === m ? 'chip--active' : ''}`}
            onClick={() => { haptic('light'); setMultiplier(m); }}
          >
            ×{m}
          </button>
        ))}
        <input
          className="upgrade-multipliers__custom"
          type="number"
          min={1}
          max={100}
          value={multiplier}
          onChange={(e) => setMultiplier(Number(e.target.value) || 1)}
          aria-label="Свой множитель"
        />
      </div>

      {/* ── Колесо ── */}
      <div className="upgrade-wheel">
        <svg viewBox="0 0 200 200" className="upgrade-wheel__svg">
          {/* ... разметка колеса не тронута ... */}
        </svg>
        <div className="upgrade-wheel__chance">
          <strong>{formatChance(displayChance)}</strong>
          <small>шанс по колесу</small>
        </div>
      </div>

      {/* ── Подпись ожидаемого шанса ── */}
      <p className="upgrade-hint">
        Ожидаемый шанс по множителю: <b>{formatChance(expectedChance)}</b>
      </p>

      {/* ── Кнопка ── */}
      <button
        type="button"
        className="btn btn--primary btn--large"
        disabled={!source || !target || spinning}
        onClick={handleUpgrade}
      >
        {spinning ? 'Крутим…' : 'Улучшить'}
      </button>

      {result && (
        <div className={`upgrade-result ${result.success ? 'is-win' : 'is-lose'}`}>
          <strong>{result.success ? 'Успех!' : 'Не повезло'}</strong>
          <p>{result.success ? `Получен: ${result.resultItem?.name}` : 'Предмет сгорел. Попробуй ещё.'}</p>
        </div>
      )}
    </div>
  );
}
