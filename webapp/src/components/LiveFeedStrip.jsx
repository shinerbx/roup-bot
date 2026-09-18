import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const POLL_MS = 8000;

function fmtTimeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч`;
}

export default function LiveFeedStrip() {
  const [drops, setDrops] = useState([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const load = async () => {
      try {
        const r = await api.getUpgradeFeed();
        if (aliveRef.current && Array.isArray(r?.drops)) {
          setDrops(r.drops.slice(0, 20));
        }
      } catch (_) { /* тихо */ }
    };

    load();
    const t = setInterval(load, POLL_MS);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, []);

  if (!drops.length) {
    return (
      <div className="live-feed live-feed--empty">
        <span className="live-feed__dot" />
        <span className="live-feed__empty-text">Смотрим, кто сейчас в игре…</span>
      </div>
    );
  }

  return (
    <div className="live-feed">
      <div className="live-feed__head">
        <span className="live-feed__dot" />
        <span className="live-feed__label">Live drops</span>
      </div>
      <div className="live-feed__track">
        {drops.map((d) => (
          <div key={d.id} className="live-feed__card">
            {d.itemImageUrl && (
              <img className="live-feed__img" src={d.itemImageUrl} alt="" loading="lazy" />
            )}
            <div className="live-feed__body">
              <span className="live-feed__item" title={d.itemName}>{d.itemName}</span>
              <span className="live-feed__meta">
                <b>{d.chance}%</b> · {d.userName} · {fmtTimeAgo(d.ts)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
