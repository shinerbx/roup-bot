import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';
import robuxIcon from '../public/robux.png';

// Значение-заглушка для первого рендера. Сервер отдаёт актуальный курс после загрузки.
const STARS_TO_ROBUX_RATE = 0.2;
const COMMISSION_FALLBACK = 25;
const GAME_PASS_MARKUP_FALLBACK = 43;
const MIN_STARS_FALLBACK = 100;
const MAX_STARS_FALLBACK = 100000;
const GAME_PASS_TUTORIAL_URL = import.meta.env.VITE_GAME_PASS_TUTORIAL_URL || '';

const robuxIconStyle = { width: 17, height: 17, verticalAlign: '-3px', marginLeft: 5, objectFit: 'contain' };
const robuxIconBigStyle = { width: 31, height: 31, verticalAlign: '-8px', marginLeft: 7, objectFit: 'contain' };

const fmtRobux = (value) => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ru-RU');
const fmtStars = (value) => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('ru-RU');

function RobuxIcon({ big = false }) {
  return (
    <img
      src={robuxIcon}
      alt="R$"
      draggable={false}
      style={big ? robuxIconBigStyle : robuxIconStyle}
    />
  );
}

function RobuxAmount({ value, big = false }) {
  return (
    <>
      {fmtRobux(value)}
      <RobuxIcon big={big} />
    </>
  );
}

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `wr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidRobloxUsername(value) {
  const username = String(value || '').trim();
  if (username.length < 3 || username.length > 20) return false;
  if (!/^[A-Za-z0-9_]+$/.test(username)) return false;
  if (username.startsWith('_') || username.endsWith('_')) return false;
  if ((username.match(/_/g) || []).length > 1) return false;
  return true;
}

function mapError(code, details) {
  const map = {
    insufficient_balance: 'Недостаточно звёзд на балансе.',
    amount_below_min: `Минимальная сумма — ${details?.min || MIN_STARS_FALLBACK} ⭐.`,
    amount_above_max: `Максимум за одну заявку — ${Number(details?.max || MAX_STARS_FALLBACK).toLocaleString('ru-RU')} ⭐.`,
    invalid_username: 'Проверьте Roblox Username: от 3 до 20 символов, только латиница, цифры и максимум один знак _.',
    too_many_open_requests: 'У вас уже есть открытые заявки. Дождитесь их обработки.',
    referral_gate: 'Условия по приглашениям ещё не выполнены.',
    operation_in_progress: 'Заявка уже создаётся, подождите.',
    method_not_available: 'Вывод временно недоступен.',
    missing_operation_id: 'Ошибка сессии. Обновите страницу и попробуйте снова.',
    invalid_amount: 'Некорректная сумма.',
    daily_withdrawal_limit: 'Достигнут дневной лимит заявок на вывод.',
    user_not_found: 'Не удалось найти ваш профиль. Откройте приложение из Telegram и попробуйте снова.',
    demo_active: 'Включён Demo-Режим. Для его отключения напишите своему менеджеру.',
    server_error: details?.detail ? `Сервер не смог создать заявку: ${details.detail}` : 'Сервис временно не смог создать заявку. Попробуйте ещё раз.',
  };
  return map[code] || 'Не удалось создать заявку. Попробуйте позже.';
}

function StepHeader({ step, title }) {
  return (
    <>
      <div className="withdraw-steps" aria-label={`Шаг ${step} из 4`}>
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className={`withdraw-steps__item${item === step ? ' active' : ''}${item < step ? ' done' : ''}`}
          >
            <span>{item < step ? '✓' : item}</span>
          </div>
        ))}
      </div>
      <div className="withdraw-step-title">
        <span className="withdraw-step-title__counter">Шаг {step} из 4</span>
        <h2>{title}</h2>
      </div>
    </>
  );
}

function BackButton({ onClick, label = 'Назад' }) {
  return (
    <button className="topup-back" onClick={onClick} aria-label={label}>
      ‹
    </button>
  );
}

export default function WithdrawScreen({
  onClose,
  balance = 0,
  canWithdraw = false,
  demoActive = false,
  referralProgress = null,
}) {
  const [rate, setRate] = useState(STARS_TO_ROBUX_RATE);
  const [commissionPct, setCommissionPct] = useState(COMMISSION_FALLBACK);
  const [gamePassMarkupPct, setGamePassMarkupPct] = useState(GAME_PASS_MARKUP_FALLBACK);
  const [minStars, setMinStars] = useState(MIN_STARS_FALLBACK);
  const [maxStars, setMaxStars] = useState(MAX_STARS_FALLBACK);

  const [amountStars, setAmountStars] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(1);

  const operationIdRef = useRef(null);
  const submittingRef = useRef(false);

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
        if (typeof r?.gamePassMarkup === 'number') setGamePassMarkupPct(r.gamePassMarkup);
        if (typeof r?.min === 'number') setMinStars(r.min);
        if (typeof r?.max === 'number') setMaxStars(r.max);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const calc = useMemo(() => {
    const stars = Math.max(0, Math.floor(Number(amountStars) || 0));
    const grossRobux = Math.floor(stars * rate);
    const commissionRobux = Math.floor(grossRobux * commissionPct / 100);
    const payoutRobux = Math.max(0, grossRobux - commissionRobux);
    const gamePassPrice = Math.ceil(payoutRobux * (1 + gamePassMarkupPct / 100));
    return { stars, grossRobux, commissionRobux, payoutRobux, gamePassPrice };
  }, [amountStars, rate, commissionPct, gamePassMarkupPct]);

  const amountOk = calc.stars >= minStars && calc.stars <= maxStars && calc.stars <= Number(balance);
  const usernameOk = isValidRobloxUsername(username);
  const canContinueFromStep1 = amountOk && canWithdraw && !demoActive && !loading;
  const canContinueFromStep2 = usernameOk && !loading;

  const applyPreset = (value) => {
    haptic('light');
    if (value === -1) setAmountStars(String(Math.min(Number(balance) || 0, maxStars)));
    else setAmountStars(String(value));
    setError(null);
  };

  const nextStep = () => {
    haptic('light');
    setError(null);
    setStep((current) => Math.min(3, current + 1));
  };

  const previousStep = () => {
    haptic('light');
    setError(null);
    if (step <= 1) onClose();
    else setStep((current) => current - 1);
  };

  const submit = async () => {
    if (!canContinueFromStep2 || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    haptic('medium');

    try {
      const normalized = username.trim();
      const res = await api.createWithdrawRequest({
        method: 'robux',
        amountStars: calc.stars,
        robloxUsername: normalized,
        operationId: operationIdRef.current || createOperationId(),
      });

      if (res?.error) {
        setError(mapError(res.error, res.details));
        hapticNotify('error');
      } else {
        setResult(res);
        setStep(4);
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

  if (demoActive) {
    return (
      <div className="topup-overlay withdraw-screen">
        <div className="topup-header">
          <BackButton onClick={onClose} label="Закрыть" />
          <h2 className="screen-title">Вывод робуксов</h2>
          <span style={{ width: 28 }} />
        </div>
        <div className="withdraw-demo-lock">
          <div className="withdraw-demo-lock__icon">🔒</div>
          <p className="withdraw-demo-lock__title">Включён Demo-Режим</p>
          <p className="withdraw-demo-lock__text">Для его отключения напишите своему менеджеру.</p>
        </div>
        <WithdrawFooter />
      </div>
    );
  }

  if (step === 4) {
    const payout = Number(result?.payoutRobux ?? calc.payoutRobux ?? 0);
    return (
      <div className="topup-overlay withdraw-screen">
        <div className="topup-header">
          <span style={{ width: 28 }} />
          <h2 className="screen-title">Заявка успешно создана!</h2>
          <span style={{ width: 28 }} />
        </div>
        <div className="withdraw-success withdraw-success--compact">
          <div className="withdraw-success__icon">✓</div>
          <p className="withdraw-success__amount"><RobuxAmount value={payout} big /></p>
          <p className="withdraw-success__text">
            Отлично! Ваша заявка на вывод <b>{fmtRobux(payout)} R$</b> успешно принята в обработку.
          </p>
          <p className="withdraw-success__note">
            Срок выплаты и проверки занимает до 48 часов. Вы получите уведомление в боте, как только Робуксы поступят на ваш аккаунт.
          </p>
        </div>
        <WithdrawFooter />
      </div>
    );
  }

  const stepTitle = step === 1
    ? 'Шаг 1: Сумма'
    : step === 2
      ? 'Шаг 2: Roblox Username'
      : 'Шаг 3: Game Pass';

  return (
    <div className="topup-overlay withdraw-screen">
      <div className="topup-header">
        <BackButton onClick={previousStep} />
        <h2 className="screen-title">Вывод робуксов</h2>
        <span style={{ width: 28 }} />
      </div>

      <StepHeader step={step} title={stepTitle} />

      {step === 1 && (
        <>
          <div className="withdraw-info-card">
            <img className="withdraw-info-card__icon withdraw-info-card__icon--img" src={robuxIcon} alt="Robux" draggable={false} />
            <div>
              <b>Текущий курс</b>
              <span>1 ⭐ = {rate} <RobuxIcon /></span>
            </div>
          </div>

          {!canWithdraw && (
            <div className="withdraw-warning">
              <b>Вывод пока недоступен.</b>{' '}
              {referralProgress
                ? `Пригласи ещё ${referralProgress.premiumRemaining} Premium или ${referralProgress.regularRemaining} обычных — тогда кнопка разблокируется.`
                : 'Пригласи друзей по реферальной ссылке, чтобы разблокировать.'}
            </div>
          )}

          <div className="withdraw-field">
            <label className="withdraw-field__label" htmlFor="wd-amount">Количество звёзд ⭐</label>
            <div className="topup-custom">
              <span className="topup-custom__icon">⭐</span>
              <input
                id="wd-amount"
                className="topup-custom__input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Введите количество"
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
                className={`topup-chip${calc.stars === Math.min(Number(balance) || 0, maxStars) && Number(balance) > 0 ? ' selected' : ''}`}
                onClick={() => applyPreset(-1)}
                disabled={loading || Number(balance) <= 0}
              >
                MAX
              </button>
            </div>
            <p className="withdraw-field__hint">
              Доступно: <b>{fmtStars(balance)} ⭐</b> · минимум {fmtStars(minStars)} ⭐
            </p>
          </div>

          <div className="withdraw-payout-card withdraw-payout-card--simple">
            <span>Вы получите после комиссии {commissionPct}%</span>
            <strong><RobuxAmount value={calc.payoutRobux} /></strong>
          </div>

          {error && <div className="withdraw-error">{error}</div>}

          <button
            type="button"
            className="sheet__confirm withdraw-action"
            onClick={nextStep}
            disabled={!canContinueFromStep1}
          >
            Далее
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="withdraw-field withdraw-field--spacious">
            <label className="withdraw-field__label" htmlFor="wd-user">Roblox Username</label>
            <div className={`topup-custom${username.length > 0 && !usernameOk ? ' invalid' : ''}`}>
              <span className="topup-custom__icon">@</span>
              <input
                id="wd-user"
                className="topup-custom__input"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Ваш уникальный Username"
                value={username}
                onChange={(e) => { setUsername(e.target.value.replace(/\s/g, '').slice(0, 20)); setError(null); }}
                disabled={loading}
                maxLength={20}
                autoFocus
              />
            </div>
            {username.length > 0 && !usernameOk && (
              <p className="withdraw-field__hint withdraw-field__hint--error">
                Username: 3–20 символов, латиница/цифры и максимум один знак _.
              </p>
            )}
          </div>

          <div className="withdraw-username-alert">
            <strong>⚠️ Вводите именно ваш Username (уникальный ник), а НЕ Display Name (отображаемое имя)!</strong>
          </div>

          {error && <div className="withdraw-error">{error}</div>}

          <button
            type="button"
            className="sheet__confirm withdraw-action"
            onClick={nextStep}
            disabled={!canContinueFromStep2}
          >
            Далее
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div className="withdraw-step-intro">
            <span>1</span>
            <p>Сделайте Game Pass по инструкции ниже. Цена уже рассчитана за вас.</p>
          </div>

          <div className="withdraw-instruction">
            <div className="withdraw-instruction__step">
              <span>1</span>
              <p>Перейдите на сайт: <a href="https://create.roblox.com/dashboard/creations" target="_blank" rel="noopener noreferrer">create.roblox.com</a></p>
            </div>
            <div className="withdraw-instruction__step">
              <span>2</span>
              <p>
                Выберите плейс с названием: <b>{username}'s Place</b>.<br />
                <strong>⚠️ Убедитесь, что этот плейс находится в ПУБЛИЧНОМ доступе (Public)!</strong>
              </p>
            </div>
            <div className="withdraw-instruction__step">
              <span>3</span>
              <p>
                Создайте Game Pass и установите для него цену: <b>{fmtRobux(calc.gamePassPrice)} R$</b>.
                <br />
                <strong>🚨 ВАЖНО: В настройках цены обязательно ВЫКЛЮЧИТЕ тумблер «Managed Pricing»!</strong>
              </p>
            </div>
          </div>

          <div className="withdraw-gp-card">
            <span>🏷️ Цена Game Pass</span>
            <strong><RobuxAmount value={calc.gamePassPrice} big /></strong>
            <small>
              Сумма рассчитана как {fmtRobux(calc.payoutRobux)} R$ + {gamePassMarkupPct}%.
            </small>
          </div>

          {GAME_PASS_TUTORIAL_URL ? (
            <a
              className="withdraw-tutorial-link"
              href={GAME_PASS_TUTORIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              📖 Полный туториал
            </a>
          ) : (
            <div className="withdraw-tutorial-link withdraw-tutorial-link--disabled">
              📖 Полный туториал будет добавлен позже
            </div>
          )}

          {error && <div className="withdraw-error">{error}</div>}

          <button
            type="button"
            className="sheet__confirm withdraw-action"
            onClick={submit}
            disabled={loading}
          >
            {loading ? 'Создание заявки…' : 'Я всё сделал, создать заявку'}
          </button>
        </>
      )}

      <WithdrawFooter />
    </div>
  );
}

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
