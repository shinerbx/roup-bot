import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function OnlineBadge() {
  const [online, setOnline] = useState(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const load = async () => {
      try {
        const r = await api.getOnline();
        if (aliveRef.current && typeof r?.online === 'number') setOnline(r.online);
      } catch (_) { /* тихо */ }
    };

    load();
    const t = setInterval(load, 15000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, []);

  if (online == null) return null;

  return (
    <div className="online-badge" title="Сейчас в игре">
      <span className="online-badge__dot" />
      <span className="online-badge__value">{online.toLocaleString('ru-RU')}</span>
      <span className="online-badge__label">online</span>
    </div>
  );
}
