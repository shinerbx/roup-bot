import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const POLL_VISIBLE_MS = 4000;
const POLL_HIDDEN_MS = 20000;
const MAX_BUFFER = 30;
const SCROLL_SPEED = 46; // px/sec

function clip(s, max) {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

const FeedCard = memo(function FeedCard({ d }) {
  return (
    <div className="live-strip__card">
      {d.itemImageUrl ? (
        <img
          className="live-strip__img"
          src={d.itemImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="live-strip__img live-strip__img--placeholder">★</div>
      )}
      <div className="live-strip__body">
        <span className="live-strip__item" title={d.itemName}>{clip(d.itemName, 20)}</span>
        <span className="live-strip__meta">
          <b>{d.chance}%</b> · {clip(d.userName, 14)}
        </span>
      </div>
    </div>
  );
});

export default function LiveFeedStrip() {
  const [items, setItems] = useState([]);
  const trackRef = useRef(null);
  const bufferRef = useRef([]);
  const seenRef = useRef(new Set());
  const offsetRef = useRef(0);
  const aliveRef = useRef(true);
  const preloadedRef = useRef(new Set());

  useEffect(() => {
    aliveRef.current = true;

    const merge = (incoming) => {
      let appended = false;

      for (const d of incoming) {
        if (!d?.id || seenRef.current.has(d.id)) continue;

        const name = String(d.userName || 'игрок').replace(/^@+/, '');
        const last = bufferRef.current[bufferRef.current.length - 1];

        // Мягкий фильтр подряд идущих одинаковых имён — чтобы карточки
        // не выглядели дублями. Не блокирует добавление, просто сдвигает
        // конфликтный элемент в конец.
        if (last && last.userName === name && bufferRef.current.length > 1) {
          // Пропускаем дубликат только если в буфере уже есть свежий с тем же именем.
          continue;
        }

        seenRef.current.add(d.id);
        bufferRef.current.push({ ...d, userName: name });
        appended = true;

        if (d.itemImageUrl && !preloadedRef.current.has(d.itemImageUrl)) {
          preloadedRef.current.add(d.itemImageUrl);
          const img = new Image();
          img.decoding = 'async';
          img.src = d.itemImageUrl;
        }
      }

      // Кэпы: буфер и seen не растут бесконечно
      if (bufferRef.current.length > MAX_BUFFER) {
        bufferRef.current = bufferRef.current.slice(-MAX_BUFFER);
      }
      if (seenRef.current.size > 2000) {
        // чистим seen до последних 500 id из буфера — старые всё равно не вернутся
        const keep = new Set(bufferRef.current.map((x) => x.id));
        seenRef.current = keep;
      }

      if (appended) {
        setItems(bufferRef.current.slice());
      }
    };

    const load = async () => {
      try {
        const r = await api.getUpgradeFeed();
        if (!aliveRef.current) return;
        if (r && r.__notModified) return;
        const list = Array.isArray(r?.drops) ? r.drops : [];
        merge(list);
      } catch (_) {}
    };

    load();

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

  // rAF-цикл запускается один раз, никогда не перезапускается.
  // Читает свежий scrollWidth каждый кадр, поэтому подгрузка карточек
  // не сбивает анимацию и не сбрасывает offset.
  useEffect(() => {
    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const el = trackRef.current;
      if (el && document.visibilityState === 'visible') {
        const half = el.scrollWidth / 2;
        if (half > 80) {
          offsetRef.current += SCROLL_SPEED * dt;
          while (offsetRef.current >= half) offsetRef.current -= half;
          el.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Стабильные пары ключей — вторая копия ленты для бесшовности.
  // Каждая копия рендерится отдельно, чтобы React не пересобирал ноды
  // при сдвиге индексов и memo() на FeedCard работал.
  const renderedCardsA = useMemo(
    () => items.map((d) => <FeedCard key={`${d.id}_a`} d={d} />),
    [items]
  );
  const renderedCardsB = useMemo(
    () => items.map((d) => <FeedCard key={`${d.id}_b`} d={d} />),
    [items]
  );

  if (!items.length) {
    return (
      <div className="live-strip live-strip--empty">
        <span className="live-strip__dot" />
        <span className="live-strip__empty-text">Смотрим, кто сейчас в игре…</span>
      </div>
    );
  }

  return (
    <div className="live-strip" aria-label="Live-лента дропов">
      <div className="live-strip__head">
        <span className="live-strip__dot" />
        <span className="live-strip__label">Live drops</span>
      </div>
      <div className="live-strip__viewport">
        <div className="live-strip__track" ref={trackRef}>
          {renderedCardsA}
          {renderedCardsB}
        </div>
      </div>
    </div>
  );
}
