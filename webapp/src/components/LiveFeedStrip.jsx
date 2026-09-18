import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const POLL_MS = 8000;

export default function LiveFeedStrip() {
  const [drops, setDrops] = useState([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const load = async () => {
      try {
        const r = await api.getUpgradeFeed();
        if (aliveRef.current && Array.isArray(r?.drops)) {
          // Только first_name, без @
          const clean = r.drops.slice(0, 20).map((d) => ({
            ...d,
            userName: String(d.userName || 'игрок').replace(/^@+/, ''),
          }));
          setDrops(clean);
        }
      } catch (_) { /* тихо */ }
    };

    load();
    const t = setInterval(load, POLL_MS);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, []);

  if (!drops.length) {
    return (
      <div className="live-strip live-strip--empty">
        <span className="live-strip__dot" />
        <span className="live-strip__empty-text">Смотрим, кто сейчас в игре…</span>
      </div>
    );
  }

  // Дублируем массив для бесшовного loop
  const loop = [...drops, ...drops];

  return (
    <div className="live-strip" aria-label="Live-лента дропов">
      <div className="live-strip__head">
        <span className="live-strip__dot" />
        <span className="live-strip__label">Live drops</span>
      </div>

      <div className="live-strip__viewport">
        <div className="live-strip__track">
          {loop.map((d, i) => (
            <div key={`${d.id}_${i}`} className="live-strip__card">
              {d.itemImageUrl && (
                <img className="live-strip__img" src={d.itemImageUrl} alt="" loading="lazy" />
              )}
              <div className="live-strip__body">
                <span className="live-strip__item" title={d.itemName}>{d.itemName}</span>
                <span className="live-strip__meta">
                  <b>{d.chance}%</b> · {d.userName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
