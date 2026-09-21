import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cinematic splash: upgrade roulette → 0.01% hit → win burst → RoUP logo → exit.
 *
 * Props
 *   onAnimationComplete  called ONCE when the splash has fully faded out
 *   onDone               legacy alias (App.jsx already passes this) — same behaviour
 *
 * All motion is CSS (transform/opacity only). React renders the markup once; state only
 * changes if the user taps to skip, so there are no re-renders or layout work while it
 * plays. Tap anywhere to skip.
 *
 * Timeline (seconds) — single source of truth, exposed to CSS as --t-* variables.
 */
const SEQ = {
  wheelIn: 0.05, // wheel scales/fades in
  chance: 0.3, // "Шанс: 0.01%" types in
  spinStart: 0.35, // needle starts
  spin: 2.6, // one continuous deceleration; visually settled ~0.3s before this ends
  win: 2.85, // burst, ring, "Апгрейд зашел!" (just after the needle settles)
  out: 3.65, // wheel fades out / scales down
  logo: 3.77, // logo rises in
  exit: 4.95, // splash starts to fade away
  exitDur: 0.45
};

// prefers-reduced-motion: skip the roulette, show a short brand moment only
const SEQ_REDUCED = { ...SEQ, logo: 0, exit: 1.1, exitDur: 0.3 };

const SKIP_FADE = 0.3;

// 14 sparks radiating from the ring; alternating gold / emerald (see CSS)
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  a: Math.round(i * (360 / 14) + (i % 2 ? 7 : -5)),
  k: [0.62, 0.9, 0.5, 0.78, 0.98, 0.55, 0.85][i % 7],
  dl: (i % 4) * 28
}));

function Chars({ text }) {
  return [...text].map((c, i) => (
    <span key={i} className="sp-ch" style={{ '--i': i }}>
      {c === ' ' ? '\u00A0' : c}
    </span>
  ));
}

export default function SplashScreen({ onAnimationComplete, onDone }) {
  // Keep the latest callback in a ref: App passes an inline arrow, and depending on it
  // would restart the timers on every App re-render (data loading triggers many).
  const callbackRef = useRef(null);
  callbackRef.current = onAnimationComplete || onDone;

  const reduced = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const seq = reduced ? SEQ_REDUCED : SEQ;

  const [exiting, setExiting] = useState(false);
  const finishedRef = useRef(false);
  const skippedRef = useRef(false);
  const timerRef = useRef(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    callbackRef.current?.();
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(finish, (seq.exit + seq.exitDur) * 1000);
    return () => clearTimeout(timerRef.current);
  }, [seq, finish]);

  const skip = useCallback(() => {
    if (finishedRef.current || skippedRef.current) return;
    skippedRef.current = true;
    clearTimeout(timerRef.current);
    setExiting(true);
    timerRef.current = setTimeout(finish, SKIP_FADE * 1000);
  }, [finish]);

  const vars = {
    '--t-wheel-in': `${seq.wheelIn}s`,
    '--t-chance': `${seq.chance}s`,
    '--t-spin-start': `${seq.spinStart}s`,
    '--t-spin': `${seq.spin}s`,
    '--t-win': `${seq.win}s`,
    '--t-out': `${seq.out}s`,
    '--t-logo': `${seq.logo}s`,
    '--t-exit': `${seq.exit}s`,
    '--t-exit-dur': `${seq.exitDur}s`
  };

  return (
    <div
      className={`sp${exiting ? ' is-exiting' : ''}`}
      style={vars}
      onClick={skip}
      role="status"
      aria-label="RoUP — загрузка"
    >
      <div className="sp-stage" aria-hidden="true">
        <div className="sp-wheel">
          <div className="sp-glow" />

          <svg className="sp-svg" viewBox="0 0 200 200">
            {/* 60 ticks from one dashed circle (cheap) */}
            <circle className="sp-ticks" cx="100" cy="100" r="93" />
            <circle className="sp-track" cx="100" cy="100" r="80" />
            {/* the 0.01% zone (drawn wider than it really is so it is visible) */}
            <circle className="sp-zone" cx="100" cy="100" r="80" transform="rotate(133.8 100 100)" />
            <circle className="sp-zone sp-zone--win" cx="100" cy="100" r="80" transform="rotate(133.8 100 100)" />
          </svg>

          <div className="sp-hitwrap"><i className="sp-hit" /></div>
          <div className="sp-needle" />

          <div className="sp-chance">
            <span className="sp-chance__label"><Chars text="Шанс:" /></span>
            <span className="sp-chance__value"><Chars text="0.01%" /></span>
          </div>

          <div className="sp-ring" />
          <div className="sp-burst">
            {SPARKS.map((p, i) => (
              <span key={i} style={{ '--a': `${p.a}deg`, '--k': p.k, '--dl': `${p.dl}ms` }} />
            ))}
          </div>

          <p className="sp-win"><Chars text="Апгрейд зашел!" /></p>
        </div>
      </div>

      <img className="sp-logo" src="/logo.png" alt="RoUP" decoding="async" draggable="false" />
    </div>
  );
}
