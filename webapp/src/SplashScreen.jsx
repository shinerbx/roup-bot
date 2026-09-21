import { useEffect, useState } from 'react';

export default function SplashScreen({ onDone }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const closeTimer = setTimeout(() => setClosing(true), 1400);
    const doneTimer = setTimeout(() => onDone?.(), 1750);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`splash ${closing ? 'splash--closing' : ''}`}>
      <img className="splash__logo" src="/logo.png" alt="RoUP" />
      <div className="splash__tagline-wrap">
        <p className="splash__tagline">RoUP — апгрейдни скины</p>
      </div>
    </div>
  );
}
