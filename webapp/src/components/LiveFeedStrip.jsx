import { memo, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const POLL_VISIBLE_MS = 9000;
const POLL_HIDDEN_MS = 45000;
const MAX_BUFFER = 30;
const SCROLL_SPEED = 42; // px/sec

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
          <b>{d.chance}%</b> · {clip(d.userName, 11)}
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

  // ── Загрузка + merge ─────────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;

    const merge = (incoming) => {
      let appended = false;

      for (const d of incoming) {
        if (!d?.id || seenRef.current.has(d.id)) continue;

        const name = String(d.userName || 'игрок').replace(/^@+/, '');
        const last = bufferRef.current[bufferRef.current.length - 1];

        // два одинаковых имени рядом — не пропускаем
        if (last && last.userName === name) continue;

        seenRef.current.add(d.id);
        bufferRef.current.push({ ...d, userName: name });
        appended = true;

        // Прелоад картинки
        if (d.itemImageUrl && !preloadedRef.current.has(d.itemImageUrl)) {
          preloadedRef.current.add(d.itemImageUrl);
          const img = new Image();
          img.decoding = 'async';
          img.src = d.itemImageUrl;
        }
      }

      if (bufferRef.current.length > MAX_BUFFER) {
        bufferRef.current = bufferRef.current.slice(-MAX_BUFFER);
      }

      if (appended) {
        // На стыке ленты первый и последний тоже не должны совпасть по имени
        const arr = bufferRef.current;
        if (arr.length > 1 && arr[0].userName === arr[arr.length - 1].userName) {
          for (let i = 1; i < arr.length - 1; i++) {
            if (arr[i].userName !== arr[arr.length - 1].userName
                && arr[i].userName !== arr[i - 1]?.userName
                && arr[i].userName !== arr[i + 1]?.userName) {
              [arr[0], arr[i]] = [arr[i], arr[0]];
              break;
            }
          }
        }
        setItems([...arr]);
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

  // ── rAF-цикл запускается ОДИН РАЗ, никогда не перезапускается ────
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

  if (!items.length) {
    return (
      <div className="live-strip live-strip--empty">
        <span className="live-strip__dot" />
        <span className="live-strip__empty-text">Смотрим, кто сейчас в игре…</span>
      </div>
    );
  }

  // Две копии для бесшовной карусели
  const loop = [...items, ...items];

  return (
    <div className="live-strip" aria-label="Live-лента дропов">
      <div className="live-strip__head">
        <span className="live-strip__dot" />
        <span className="live-strip__label">Live drops</span>
      </div>
      <div className="live-strip__viewport">
        <div className="live-strip__track" ref={trackRef}>
          {loop.map((d, i) => <FeedCard key={`${d.id}_${i}`} d={d} />)}
        </div>
      </div>
    </div>
  );
}
