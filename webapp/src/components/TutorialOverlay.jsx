import { useEffect, useMemo, useState } from 'react';
import { haptic } from '../telegram.js';

const STEPS = {
  1: { target: 'catalog', text: 'ТУТ ТЫ МОЖЕШЬ КУПИТЬ ПРЕДМЕТЫ' },
  2: { target: 'upgrade', text: 'ЗДЕСЬ ТЫ МОЖЕШЬ УЛУЧШИТЬ СВОИ ПРЕДМЕТЫ' },
  3: { target: 'inventory', text: 'А ТУТ НАХОДИТСЯ ТВОЙ ИНВЕНТАРЬ' }
};

function readTargetRect(target) {
  if (!target) return null;
  const element = document.querySelector(`[data-tutorial-target="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

export default function TutorialOverlay({ step, onFinish, onTargetClick }) {
  const [rect, setRect] = useState(null);
  const config = STEPS[step] || null;

  useEffect(() => {
    if (!config) return undefined;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setRect(readTargetRect(config.target)));
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [config?.target]);

  const geometry = useMemo(() => {
    if (!rect) return null;
    const pad = 0;
    return {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      right: Math.min(window.innerWidth, rect.right + pad),
      bottom: Math.min(window.innerHeight, rect.bottom + pad)
    };
  }, [rect]);

  if (!step) return null;

  if (step === 4) {
    return (
      <div className="tutorial-overlay tutorial-overlay--final" role="dialog" aria-modal="true" aria-label="Обучение завершено">
        <div className="tutorial-final-card">
          <div className="tutorial-final-card__shine" aria-hidden="true" />
          <span className="tutorial-final-card__eyebrow">ROUP · ТУТУОРИАЛ</span>
          <h2>ЖЕЛАЮ УДАЧИ!</h2>
          <button type="button" onClick={() => { haptic('medium'); onFinish?.(); }}>
            ПОЕХАЛИ!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label="Интерактивное обучение">
      {geometry && (
        <>
          <div className="tutorial-block tutorial-block--top" style={{ height: geometry.top }} />
          <div
            className="tutorial-block tutorial-block--left"
            style={{ top: geometry.top, width: geometry.left, height: Math.max(0, geometry.bottom - geometry.top) }}
          />
          <div
            className="tutorial-block tutorial-block--right"
            style={{ top: geometry.top, left: geometry.right, width: Math.max(0, window.innerWidth - geometry.right), height: Math.max(0, geometry.bottom - geometry.top) }}
          />
          <div
            className="tutorial-block tutorial-block--bottom"
            style={{ top: geometry.bottom, height: Math.max(0, window.innerHeight - geometry.bottom) }}
          />

          <button
            type="button"
            className="tutorial-click-target"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            onClick={() => onTargetClick?.(config.target)}
            aria-label={`Продолжить: ${config.text}`}
          />
          <div
            className="tutorial-target-ring"
            style={{ left: geometry.left, top: geometry.top, width: geometry.right - geometry.left, height: geometry.bottom - geometry.top }}
            aria-hidden="true"
          />
          <div
            className="tutorial-arrow"
            style={{
              left: rect.left + rect.width / 2,
              top: Math.max(16, rect.top - 65)
            }}
            aria-hidden="true"
          >
            <span className="tutorial-arrow__shaft" />
            <span className="tutorial-arrow__head" />
          </div>
          <div
            className="tutorial-tooltip"
            style={{
              left: Math.min(Math.max(16, rect.left + rect.width / 2), window.innerWidth - 16),
              top: Math.max(12, rect.top - 145)
            }}
          >
            <span className="tutorial-tooltip__step">ШАГ {step} / 3</span>
            <strong>{config.text}</strong>
            <span className="tutorial-tooltip__hint">Нажми на подсвеченную кнопку</span>
          </div>
        </>
      )}
      {!geometry && <div className="tutorial-loading" aria-hidden="true" />}
    </div>
  );
}
