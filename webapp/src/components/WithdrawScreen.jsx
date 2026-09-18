import { useEffect, useMemo, useRef, useState } from 'react';
import { getInitData, haptic, hapticNotify } from '../telegram.js';

const BUILD_VERSION = 'W-2025-11-02';

async function waitForInitData(maxMs = 5000) {
  const start = Date.now();
  let d = getInitData();
  while (!d && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 100));
    d = getInitData();
  }
  return d;
}

async function rawRequest(path, options = {}) {
  const initData = await waitForInitData();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData || '',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  if (!res.ok) {
    const err = new Error(body.error || `http_${res.status}`);
    err.code = body.error;
    err.status = res.status;
    err.details = body;
    throw err;
  }
  return body;
}

const FALLBACK_METHODS = [
  { key: 'crypto', label: 'Криптовалюта', icon: '₿', hint: 'USDT TRC20 · до 48ч' },
];

const normRub = (v) => `${(+v).toFixed(2)} ₽`;

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `wr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapError(code, details) {
  const map = {
    insufficient_balance: 'Недостаточно средств на балансе.',
    amount_below_min: `Минимальная сумма — ${details?.min || 100} ⭐.`,
    amount_above_max: `Максимум — ${Number(details?.max || 100000).toLocaleString('ru-RU')} ⭐.`,
    invalid_username: 'Проверьте формат — @username (4-32 символа, латиница/цифры/_).',
    too_many_open_requests: 'У вас уже есть открытые заявки. Дождитесь их обработки.',
    referral_gate: 'Вывод пока недоступен. Пригласите нужное количество друзей, чтобы разблокировать.',
    operation_in_progress: 'Заявка уже создаётся, подождите.',
    method_not_available: 'Этот способ вывода временно недоступен.',
    missing_operation_id: 'Ошибка сессии. Обновите страницу.',
    invalid_init_data: 'Сессия Telegram не определилась. Закрой и открой Mini App заново.',
    server_error: 'Ошибка на сервере. Попробуйте позже.',
  };
  return map[code] || 'Не удалось создать заявку. Попробуйте позже.';
}

export default function WithdrawScreen({ onClose, balance = 0, canWithdraw = false, referralProgress = null }) {
  const [step, setStep] = useState('method');
  const [methods, setMethods] = useState(FALLBACK_METHODS);
  const [rate, setRate] = useState(0.2);
  const [commissionPct, setCommissionPct] = useState(20);
  const [minStars, setMinStars] = useState(100);
  const [maxStars, setMaxStars] = useState(100000);

  const [amountStars, setAmountStars] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [initDataMissing, setInitDataMissing] = useState(false);

  const operationIdRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    rawRequest('/withdraw/methods')
      .then((r) => {
        if (!alive) return;
        if (Array.isArray(r?.methods) && r.methods.length) setMethods(r.methods);
        if (typeof r?.rate === 'number') setRate(r.rate);
        if (typeof r?.commission === 'number') setCommissionPct(r.commission);
        if (typeof r?.min === 'number') setMinStars(r.min);
        if (typeof r?.max === 'number') setMaxStars(r.max);
      })
      .catch((e) => {
        if (e?.code === 'invalid_init_data') setInitDataMissing(true);
      });
    return () => { alive = false; };
  }, []);

  const calc = useMemo(() => {
    const stars = Math.max(0, Math.floor(Number(amountStars) || 0));
    const rub = +(stars * rate).toFixed(2);
    const commission = +(rub * commissionPct / 100).toFixed(2);
    const payout = +(rub - commission).toFixed(2);
    return { stars, rub, commission, payout };
  }, [amountStars, rate, commissionPct]);

  const usernameOk = /^@?[A-Za-z0-9_]{4,32}$/.test(username.trim());
  const amountOk = calc.stars >= minStars && calc.stars <= maxStars && calc.stars <= balance;

  const chooseMethod = (key) => {
    haptic('light');
    if (key === 'crypto') {
      operationIdRef.current = createOperationId();
      setError(null);
      setStep('form');
    }
  };

  const applyPreset = (value) => {
    haptic('light');
    if (value === -1) setAmountStars(String(Math.min(balance, maxStars)));
    else setAmountStars(String(value));
    setError(null);
  };

  const submit = async () => {
    if (submittingRef.current) return;

    // Гейт по рефералам на клиенте — мгновенная подсказка без запроса
    if (!canWithdraw) {
      setError('Вывод пока недоступен. Пригласите нужное количество друзей, чтобы разблокировать.');
      hapticNotify('error');
      return;
    }

    if (!amountOk) {
      setError(calc.stars < minStars
        ? `Минимальная сумма — ${minStars} ⭐.`
        : calc.stars > balance
          ? `Недостаточно средств. Доступно: ${balance.toLocaleString('ru-RU')} ⭐.`
          : `Максимум за заявку — ${maxStars.toLocaleString('ru-RU')} ⭐.`);
      hapticNotify('error');
      return;
    }
    if (!usernameOk) {
      setError('Проверьте формат юзернейма — @username.');
      hapticNotify('error');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    haptic('medium');

    try {
      const normalized = username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`;
      const res = await rawRequest('/withdraw/request', {
        method: 'POST',
        body: JSON.stringify({
          method: 'crypto',
          amountStars: calc.stars,
          contactUsername: normalized,
          operationId: operationIdRef.current || createOperationId(),
        }),
      });
      setResult(res);
      setStep('success');
      hapticNotify('success');
    } catch (e) {
      const code = e?.code || e?.message;
      setError(mapError(code, e?.details));
      hapticNotify('error');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const goBack = () => {
    haptic('light');
    setStep('method');
    setError(null);
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
          <p className="withdraw-success__amount">{normRub(result?.payoutRub || 0)}</p>
          <p className="withdraw-success__text">
            Заявка <b>#{result?.requestId}</b> принята в обработку.<br />
            Списано: {Number(result?.amountStars || 0).toLocaleString('ru-RU')} ⭐ · Комиссия: {normRub(result?.commissionRub || 0)}
          </p>
          <p className="withdraw-success__note">
            Менеджер свяжется с вами в течение 48 часов
          </p>
        </div>
      </div>
    );
  }

  // ═══ ФОРМА ═════════════════════════════════════════════════════════
  if (step === 'form') {
    return (
      <div className="topup-overlay">
        <div className="topup-header">
          <button className="topup-back" onClick={goBack} aria-label="Назад">‹</button>
          <h2 className="screen-title">Вывод · Криптовалюта</h2>
          <span style={{ width: 28, fontSize: 9, opacity: .4, textAlign: 'right' }}>{BUILD_VERSION}</span>
        </div>

        <p className="topup-rate">USDT TRC20 · обработка до 48 часов</p>

        <div className="withdraw-field">
          <label className="withdraw-field__label" htmlFor="wd-amount">Сумма вывода</label>
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
            <span><b>{calc.stars.toLocaleString('ru-RU')} ⭐</b> · {normRub(calc.rub)}</span>
          </div>
          <div className="withdraw-calc__row">
            <span>Комиссия системы {commissionPct}%</span>
            <span className="withdraw-calc__fee">− {normRub(calc.commission)}</span>
          </div>
          <div className="withdraw-calc__row withdraw-calc__row--total">
            <span>К выплате чистыми</span>
            <b>{normRub(calc.payout)}</b>
          </div>
        </div>

        <div className="withdraw-legal">
          <p>
            Отправляя заявку, вы подтверждаете, что выводимые средства получены законно
            и не связаны с мошенничеством, обходом платёжных систем или нарушением правил
            Telegram. Вы принимаете условия сервиса и соглашаетесь, что транзакция может быть
            приостановлена для проверки до её завершения.
          </p>
          <p className="withdraw-legal__note">
            Менеджер свяжется с вами для осуществления вывода в течение 48 часов.
          </p>
        </div>

        {error && <div className="withdraw-error">{error}</div>}

        <button
          type="button"
          className="sheet__confirm"
          onClick={submit}
          disabled={loading}
          style={{ width: '100%', minHeight: 52 }}
        >
          {loading ? 'Создание заявки…' : 'Создать заявку'}
        </button>
      </div>
    );
  }

  // ═══ МЕТОД ═════════════════════════════════════════════════════════
  return (
    <div className="topup-overlay">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose} aria-label="Назад">‹</button>
        <h2 className="screen-title">Вывод средств</h2>
        <span style={{ width: 28, fontSize: 9, opacity: .4, textAlign: 'right' }}>{BUILD_VERSION}</span>
      </div>

      {initDataMissing && (
        <div className="withdraw-error">
          Telegram-сессия не определилась. Закрой Mini App и открой заново из бота.
        </div>
      )}

      {!canWithdraw && (
        <div className="withdraw-warning">
          <b>Вывод пока недоступен.</b>{' '}
          {referralProgress
            ? `Пригласи ещё ${referralProgress.premiumRemaining} Premium или ${referralProgress.regularRemaining} обычных — тогда кнопка разблокируется.`
            : 'Пригласи друзей по реферальной ссылке, чтобы разблокировать.'}
        </div>
      )}

      <p className="topup-rate">Выберите способ вывода</p>

      <div className="payment-methods">
        {methods.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`payment-method${!canWithdraw ? ' disabled' : ''}`}
            disabled={!canWithdraw}
            onClick={() => chooseMethod(m.key)}
          >
            <span className="payment-method__icon">{m.icon}</span>
            <span className="payment-method__label">
              {m.label}
              {m.hint && <small style={{ display: 'block', opacity: .6, fontWeight: 500, fontSize: 11 }}>{m.hint}</small>}
            </span>
            <span className="payment-method__badge">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
