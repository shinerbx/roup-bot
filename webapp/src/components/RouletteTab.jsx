import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify, tg } from '../telegram.js';

const FALLBACK_DURATION = 4600;
const CARD_GAP = 10;
const TARGET_INDEX = 28;
const MIN_CARDS = 34;

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildReel(rewards, resultName, minCards = MIN_CARDS, targetIndex = TARGET_INDEX) {
  if (!rewards.length) return { items: [], targetIndex: 0 };
  const length = Math.max(minCards, targetIndex + 5);
  const pool = [];
  while (pool.length < length) pool.push(...shuffle(rewards));
  const items = pool.slice(0, length);
  const safeTarget = Math.min(targetIndex, items.length - 1);
  const fallback = rewards.find((item) => item.name === resultName) || rewards[0];
  items[safeTarget] = fallback;
  return { items, targetIndex: safeTarget };
}

export default function RouletteTab({ profile, onSpinSuccess, onToast }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [reelItems, setReelItems] = useState([]);
  const [targetIndex, setTargetIndex] = useState(TARGET_INDEX);
  const [trackX, setTrackX] = useState(0);
  const viewportRef = useRef(null);
  const firstCardRef = useRef(null);
  const timerRef = useRef(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFreeRouletteConfig();
      if (data && !data.__notModified) setConfig(data);
    } catch (err) {
      console.error(err);
      onToast?.('Не удалось загрузить рулетку.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadConfig();
    return () => clearTimeout(timerRef.current);
  }, [loadConfig]);

  const rewards = useMemo(() => Array.isArray(config?.rewards) ? config.rewards : [], [config]);

  useEffect(() => {
    if (!rewards.length || reelItems.length) return;
    const built = buildReel(
      rewards,
      rewards[0].name,
      Number(config?.spin?.MIN_CARDS) || MIN_CARDS,
      Number(config?.spin?.TARGET_INDEX) || TARGET_INDEX
    );
    setReelItems(built.items);
    setTargetIndex(built.targetIndex);
  }, [rewards, config, reelItems.length]);
  const spins = Number.isFinite(Number(profile?.free_roulette_spins))
    ? Number(profile.free_roulette_spins)
    : Number(config?.spins) || 0;
  const referrals = Number.isFinite(Number(profile?.referrals_count))
    ? Number(profile.referrals_count)
    : Number(config?.referralsCount) || 0;
  const duration = Math.max(2800, Number(config?.spin?.DURATION_MS) || FALLBACK_DURATION);
  const targetCard = useMemo(() => reelItems[targetIndex] || null, [reelItems, targetIndex]);

  const startSpin = useCallback(async () => {
    if (spinning || loading || !rewards.length || spins <= 0) return;

    haptic('medium');
    setResult(null);
    setSpinning(true);

    try {
      const response = await api.spinFreeRoulette();
      if (!response?.ok || !response.reward) throw new Error(response?.error || 'roulette_failed');

      const built = buildReel(
        rewards,
        response.reward.name,
        Number(config?.spin?.MIN_CARDS) || MIN_CARDS,
        Number(config?.spin?.TARGET_INDEX) || TARGET_INDEX
      );
      setReelItems(built.items);
      setTargetIndex(built.targetIndex);
      setTrackX(0);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewportWidth = viewportRef.current?.clientWidth || 330;
          const cardWidth = firstCardRef.current?.getBoundingClientRect().width || 104;
          const finalX = (viewportWidth / 2) - (built.targetIndex * (cardWidth + CARD_GAP)) - (cardWidth / 2);
          setTrackX(finalX);
        });
      });

      timerRef.current = setTimeout(async () => {
        hapticNotify('success');
        setSpinning(false);
        setResult(response.reward);
        onSpinSuccess?.(response);
      }, duration + 120);
    } catch (err) {
      console.error(err);
      setSpinning(false);
      hapticNotify('error');
      if (err?.code === 'no_spins') onToast?.('У тебя пока нет бесплатных прокруток.');
      else onToast?.('Не удалось запустить рулетку.');
    }
  }, [spinning, loading, rewards, spins, config, duration, onSpinSuccess, onToast]);

  const openInvite = useCallback(() => {
    haptic('light');
    const url = config?.shareUrl || config?.referralLink;
    if (!url) return;
    try {
      if (tg?.openTelegramLink) tg.openTelegramLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [config]);

  return (
    <div className="roulette-screen">
      <section className="roulette-hero">
        <div className="roulette-hero__glow" />
        <div className="roulette-hero__topline">
          <div>
            <span className="roulette-kicker">БОНУС ЗА ДРУЗЕЙ</span>
            <h3>Бесплатная рулетка</h3>
          </div>
          <div className="roulette-spins">
            <span className="roulette-spins__icon">🎁</span>
            <span><b>{spins}</b> прокруток</span>
          </div>
        </div>

        <p className="roulette-hero__text">
          За каждого нового игрока после завершения регистрации ты получаешь бесплатную прокрутку. Выпавший предмет сразу появляется в инвентаре.
        </p>

        <div className={`roulette-reel ${spinning ? 'spinning' : ''}`} ref={viewportRef}>
          <div className="roulette-reel__shade roulette-reel__shade--left" />
          <div className="roulette-reel__shade roulette-reel__shade--right" />
          <div className="roulette-reel__marker" aria-hidden="true">
            <span className="roulette-reel__marker-top" />
            <span className="roulette-reel__marker-line" />
            <span className="roulette-reel__marker-bottom" />
          </div>

          {loading ? (
            <div className="roulette-reel__loading">
              <span /> <span /> <span />
            </div>
          ) : (
            <div
              className="roulette-reel__track"
              style={{
                transform: `translate3d(${trackX}px, 0, 0)`,
                transition: spinning ? `transform ${duration}ms cubic-bezier(.08,.72,.12,1)` : 'none',
              }}
            >
              {reelItems.length ? reelItems.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  ref={index === 0 ? firstCardRef : null}
                  className={`roulette-reel-card ${index === targetIndex ? 'roulette-reel-card--target' : ''}`}
                >
                  <div className="roulette-reel-card__image-wrap">
                    <img src={item.image_url} alt="" loading="eager" decoding="async" />
                  </div>
                  <span className="roulette-reel-card__name" title={item.name}>{item.name}</span>
                </div>
              )) : (
                <div className="roulette-empty">Награды временно недоступны</div>
              )}
            </div>
          )}
        </div>

        <div className="roulette-action-row">
          <button
            type="button"
            className="roulette-spin-button"
            onClick={startSpin}
            disabled={loading || spinning || !rewards.length || spins <= 0}
          >
            <span>{spinning ? 'Прокручиваем…' : spins > 0 ? 'Крутить бесплатно' : 'Нет бесплатных прокруток'}</span>
            <span className="roulette-spin-button__arrow">→</span>
          </button>
        </div>

        <div className="roulette-stats">
          <div>
            <span>Приглашено</span>
            <b>{referrals}</b>
          </div>
          <div>
            <span>За друга</span>
            <b>+{Number(config?.referralSpinsPerFriend) || 1} 🎁</b>
          </div>
          <div>
            <span>Наград</span>
            <b>{rewards.length}</b>
          </div>
        </div>
      </section>

      {result && (
        <section className="roulette-result-card">
          <div className="roulette-result-card__shine" />
          <span className="roulette-result-card__label">🎉 ТВОЯ НАГРАДА</span>
          <div className="roulette-result-card__body">
            <div className="roulette-result-card__image-wrap">
              <img src={result.image_url} alt="" />
            </div>
            <div className="roulette-result-card__info">
              <strong>{result.name}</strong>
              <span>★ {Number(result.price_stars).toLocaleString('ru-RU')}</span>
              <small>Шанс {Number(result.chance).toFixed(1)}%</small>
            </div>
          </div>
          <div className="roulette-result-card__hint">Предмет уже добавлен в твой инвентарь.</div>
        </section>
      )}

      <section className="roulette-rewards-section">
        <div className="roulette-section-heading">
          <div>
            <span>ТАБЛИЦА НАГРАД</span>
            <h4>Что может выпасть</h4>
          </div>
          <small>100% суммарно</small>
        </div>

        <div className="roulette-reward-grid">
          {rewards.map((item) => (
            <div className="roulette-reward-card" key={item.id}>
              <div className="roulette-reward-card__image-wrap">
                <img src={item.image_url} alt="" loading="lazy" decoding="async" />
              </div>
              <div className="roulette-reward-card__info">
                <strong title={item.name}>{item.name}</strong>
                <small>★ {Number(item.price_stars).toLocaleString('ru-RU')}</small>
              </div>
              <span className="roulette-reward-card__chance">{Number(item.chance).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="roulette-invite-card">
        <div className="roulette-invite-card__icon">👥</div>
        <div className="roulette-invite-card__content">
          <span className="roulette-invite-card__eyebrow">ХОЧЕШЬ ЕЩЁ ПРОКРУТОК?</span>
          <h4>Пригласи друга</h4>
          <p>За каждого нового игрока тебе начислится бесплатная прокрутка рулетки.</p>
        </div>
        <button type="button" onClick={openInvite}>Пригласить</button>
      </section>

      {targetCard && spinning && (
        <div className="roulette-screen-reader" aria-live="polite">Прокрутка рулетки…</div>
      )}
    </div>
  );
}
