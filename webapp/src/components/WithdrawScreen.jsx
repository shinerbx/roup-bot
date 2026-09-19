import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

const RATE_FALLBACK = 0.2;
const COMMISSION_FALLBACK = 20;
const MIN_STARS_FALLBACK = 100;
const MAX_STARS_FALLBACK = 100000;

// Иконка после числа: левый отступ у картинки вместо правого.
const robuxIconStyle = { width: 18, height: 18, verticalAlign: '-3px', marginLeft: 5 };
const robuxIconBigStyle = { width: 34, height: 34, verticalAlign: '-8px', marginLeft: 8 };

const fmtNum = (v) => (+v).toFixed(2);

function RobuxIcon({ big = false }) {
  return (
    <img
      src="/robux.png"
      alt="R$"
      draggable={false}
      style={big ? robuxIconBigStyle : robuxIconStyle}
    />
  );
}

// Число, затем иконка. Единый способ показать робуксы в интерфейсе.
function RobuxAmount({ value, big = false }) {
  return (
    <>
      {fmtNum(value)}
      <RobuxIcon big={big} />
    </>
  );
}

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `wr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapError(code, details) {
  const map = {
    insufficient_balance: 'Недостаточно звёзд на балансе.',
    amount_below_min: `Минимальная сумма — ${details?.min || 100} ⭐.`,
    amount_above_max: `Максимум за одну заявку — ${Number(details?.max || 100000).toLocaleString('ru-RU')} ⭐.`,
    invalid_username: 'Проверьте формат юзернейма — @username.',
    too_many_open_requests: 'У вас уже есть открытые заявки. Дождитесь их обработки.',
    referral_gate: 'Условия по приглашениям ещё не выполнены.',
    operation_in_progress: 'Заявка уже создаётся, подождите.',
    method_not_available: 'Вывод временно недоступен.',
    missing_operation_id: 'Ошибка сессии. Обновите страницу и попробуйте снова.',
    invalid_amount: 'Некорректная сумма.',
    demo_active: 'Включён Demo-Режим. Для его отключения напишите своему менеджеру.',
    server_error: 'Ошибка на сервере. Попробуйте позже.',
  };
  return map[code] || 'Не удалось создать заявку. Попробуйте позже.';
}

export default function WithdrawScreen({
  onClose,
  balance = 0,
  canWithdraw = false,
  demoActive = false,
  referralProgress = null,
}) {
  const [rate, setRate] = useState(RATE_FALLBACK);
  const [commissionPct, setCommissionPct] = useState(COMMISSION_FALLBACK);
  const [minStars, setMinStars] = useState(MIN_STARS_FALLBACK);
  const [maxStars, setMaxStars] = useState(MAX_STARS_FALLBACK);

  const [amountStars, setAmountStars] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const operationIdRef = useRef(null);
  const submittingRef = useRef(false);

  const [step, setStep] = useState('form');

  useEffect(() => {
    operationIdRef.current = createOperationId();
  }, []);

  useEffect(() => {
    let alive = true;
    api.getWithdrawMethods?.()
      .then((r) => {
        if (!alive) return;
        if (typeof r?.rate === 'number') setRate(r.rate);
        if (typeof r?.commission === 'number') setCommissionPct(r.commission);
        if (typeof r?.min === 'number') setMinStars(r.min);
        if (typeof r?.max === 'number') setMaxStars(r.max);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const calc = useMemo(() => {
    const stars = Math.max(0, Math.floor(Number(amountStars) || 0));
    const robux = +(stars * rate).toFixed(2);
    const commission = +(robux * commissionPct / 100).toFixed(2);
    const payout = +(robux - commission).toFixed(2);
    return { stars, robux, commission, payout };
  }, [amountStars, rate, commissionPct]);

  const usernameOk = /^@?[A-Za-z0-9_]{4,32}$/.test(username.trim());
  const amountOk = calc.stars >= minStars && calc.stars <= maxStars && calc.stars <= balance;
  const canSubmit = amountOk && usernameOk && !loading && canWithdraw && !demoActive;

  const applyPreset = (value) => {
    haptic('light');
    if (value === -1) setAmountStars(String(Math.min(balance, maxStars)));
    else setAmountStars(String(value));
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    haptic('medium');

    try {
      const normalized = username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`;
      const res = await api.createWithdrawRequest({
        method: 'crypto',
        amountStars: calc.stars,
        contactUsername: normalized,
        operationId: operationIdRef.current || createOperationId(),
      });

      if (res?.error) {
        setError(mapError(res.error, res.details));
        hapticNotify('error');
      } else {
        setResult(res);
        setStep('success');
        hapticNotify('success');
      }
    } catch (e) {
      const code = e?.code || e?.message;
      setError(mapError(code, e?.details));
      hapticNotify('error');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // ═══ УСПЕХ ══════════════════════════════════════════════════════════
  if (step === 'success') {
    return (
      <div className="topup-overlay">
        <div className="topup-header">
          <button className="topup-back" onClick={onClose} aria-label="Закрыть">‹</button>
          <h2 className="screen-title">Заявка создана</h2>
          <span style={{ width: 28 }} />
        </div>

        <div className="withdraw-success">
          <div className="withdraw-success__icon">✓</div>
          <p className="withdraw-success__amount">
            <RobuxAmount value={result?.payoutRub || 0} big />
          </p>
          <p className="withdraw-success__text">
            Заявка <b>#{result?.requestId}</b> принята в обработку.<br />
            Списано: {Number(result?.amountStars || 0).toLocaleString('ru-RU')} ⭐ · Комиссия сервиса: <RobuxAmount value={result?.commissionRub || 0} />
          </p>
          <p className="withdraw-success__note">
            Менеджер свяжется с вами в течение 48 часов
          </p>
        </div>

        <WithdrawFooter />
      </div>
    );
  }

  // ═══ DEMO-БЛОК ══════════════════════════════════════════════════════
  if (demoActive) {
    return (
      <div className="topup-overlay">
        <div className="topup-header">
          <button className="topup-back" onClick={onClose} aria-label="Назад">‹</button>
          <h2 className="screen-title">Вывод робуксов</h2>
          <span style={{ width: 28 }} />
        </div>

        <div className="withdraw-demo-lock">
          <div className="withdraw-demo-lock__icon">🔒</div>
          <p className="withdraw-demo-lock__title">Включён Demo-Режим</p>
          <p className="withdraw-demo-lock__text">
            Для его отключения напишите своему менеджеру.
          </p>
        </div>

        <WithdrawFooter />
      </div>
    );
  }

  // ═══ ФОРМА ═════════════════════════════════════════════════════════
  return (
    <div className="topup-overlay">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose} aria-label="Назад">‹</button>
        <h2 className="screen-title">Вывод робуксов</h2>
        <span style={{ width: 28 }} />
      </div>

      <p className="topup-rate">
        Курс: <b>1 ⭐ = {rate} <RobuxIcon /></b> · комиссия сервиса <b>{commissionPct}%</b>
      </p>

      {!canWithdraw && (
        <div className="withdraw-warning">
          <b>Вывод пока недоступен.</b>{' '}
          {referralProgress
            ? `Пригласи ещё ${referralProgress.premiumRemaining} Premium или ${referralProgress.regularRemaining} обычных — тогда кнопка разблокируется.`
            : 'Пригласи друзей по реферальной ссылке, чтобы разблокировать.'}
        </div>
      )}

      <div className="withdraw-field">
        <label className="withdraw-field__label" htmlFor="wd-amount">Сумма в звёздах</label>
        <div className="topup-custom">
          <span className="topup-custom__icon">⭐</span>
          <input
            id="wd-amount"
            className="topup-custom__input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amountStars}
            onChange={(e) => {
              setAmountStars(e.target.value.replace(/\D/g, '').slice(0, 7));
              setError(null);
            }}
            disabled={loading}
          />
        </div>
        <div className="withdraw-presets">
          {[100, 500, 1000].map((v) => (
            <button
              key={v}
              type="button"
              className={`topup-chip${Number(amountStars) === v ? ' selected' : ''}`}
              onClick={() => applyPreset(v)}
              disabled={loading}
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            className={`topup-chip${calc.stars === Math.min(balance, maxStars) && balance > 0 ? ' selected' : ''}`}
            onClick={() => applyPreset(-1)}
            disabled={loading}
          >
            MAX
          </button>
        </div>
        <p className="withdraw-field__hint">
          Доступно: <b>{balance.toLocaleString('ru-RU')} ⭐</b> · минимум {minStars} ⭐
        </p>
      </div>

      <div className="withdraw-field">
        <label className="withdraw-field__label" htmlFor="wd-user">Telegram-юзернейм для связи</label>
        <div className="topup-custom">
          <span className="topup-custom__icon">@</span>
          <input
            id="wd-user"
            className="topup-custom__input"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="username"
            value={username.replace(/^@/, '')}
            onChange={(e) => { setUsername(e.target.value.trim()); setError(null); }}
            disabled={loading}
            maxLength={32}
          />
        </div>
      </div>

      <div className="withdraw-calc">
        <div className="withdraw-calc__row">
          <span>Сумма к выводу</span>
          <span><b>{calc.stars.toLocaleString('ru-RU')} ⭐</b> · <RobuxAmount value={calc.robux} /></span>
        </div>
        <div className="withdraw-calc__row">
          <span>Комиссия сервиса {commissionPct}%</span>
          <span className="withdraw-calc__fee">− <RobuxAmount value={calc.commission} /></span>
        </div>
        <div className="withdraw-calc__row withdraw-calc__row--total">
          <span>К выплате робуксами</span>
          <b><RobuxAmount value={calc.payout} /></b>
        </div>
      </div>

      <div className="withdraw-legal">
        <p className="withdraw-legal__note">
          <RobuxIcon /> Развлекательный сервис — не казино и не финансовая организация.
        </p>
        <p>
          Робуксы — внутриигровая валюта Roblox. Сервис не аффилирован с Roblox Corporation.
        </p>
        <p>
          Выдача вручную менеджером в течение 48 часов после проверки. Только для пользователей <b>18+</b>.
        </p>
      </div>

      {error && <div className="withdraw-error">{error}</div>}

      <button
        type="button"
        className="sheet__confirm"
        onClick={submit}
        disabled={!canSubmit}
        style={{ width: '100%', minHeight: 52 }}
      >
        {loading ? 'Создание заявки…' : 'Создать заявку'}
      </button>

      <WithdrawFooter />
    </div>
  );
}

// ── Футер страницы вывода ───────────────────────────────────────────
function WithdrawFooter() {
  return (
    <footer className="app-footer">
      <span className="app-footer__line">
        Развлекательный сервис · не казино и не финансовая организация.
      </span>
      <span className="app-footer__line">
        Робуксы — валюта Roblox. Сервис не аффилирован с Roblox Corporation.
      </span>
      <span className="app-footer__line">
        Только <b>18+</b>.
        <span className="app-footer__sep">·</span>
        <a
          className="app-footer__link"
          href="https://telegra.ph/Polzovatelskoe-soglashenie-i-Usloviya-ispolzovaniya-RoUP-09-18"
          target="_blank"
          rel="noopener noreferrer"
        >
          Правила
        </a>
      </span>
    </footer>
  );
}
