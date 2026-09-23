import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const POLL_VISIBLE_MS = 15000;
const POLL_HIDDEN_MS = 60000; // фоновая вкладка: онлайн-счётчик не критичен к свежести

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

    // Тот же приём, что и в LiveFeedStrip: пока вкладка свёрнута/в фоне —
    // опрашиваем сильно реже, а не с прежней постоянной частотой. Экран всё
    // равно не виден, а на слабом сервере лишний трафик от фоновых сессий
    // складывается в заметную нагрузку.
    let timer = null;
    const schedule = () => {
      const delay = document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await load();
        schedule();
      }, delay);
    };
    schedule();

    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (online == null) return null;

  return (
    <div className="online-badge" title="Сейчас в игре">
      <span className="online-badge__dot" />
      <span className="online-badge__value">{online.toLocaleString('ru-RU')}</span>
      <span className="online-badge__label">онлайн</span>
    </div>
  );
}
