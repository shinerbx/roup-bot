// language: JSX, file: WithdrawScreen.jsx, target: React
// *Экран вывода. Ошибки, подписи шагов, комиссия. Логика не тронута.*

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { haptic, hapticNotify } from '../telegram.js';

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
    amount_above_max: `Максимум за одну заявку — ${Number(details?.max || 100000).toLocaleString('ru-RU')} ⭐.`,
    invalid_username: 'Проверь формат юзернейма — @username.',
    too_many_open_requests: 'У тебя уже есть открытые заявки. Дождись их обработки.',
    referral_gate: 'Условия по приглашениям ещё не выполнены.',
    operation_in_progress: 'Заявка уже создаётся, подожди.',
    method_not_available: 'Этот способ вывода временно недоступен.',
    missing_operation_id: 'Ошибка сессии. Обнови страницу и попробуй снова.',
    invalid_amount: 'Некорректная сумма.',
    demo_active: 'Включён demo-режим. Для отключения напиши своему менеджеру.',
    server_error: 'Ошибка на сервере. Попробуй позже.',
  };
  return map[code] || 'Не удалось создать заявку. Попробуй позже.';
}

export default function WithdrawScreen({
  onClose,
  balance = 0,
  canWithdraw = false,
  demoActive = false,
  referralProgress = null,
}) {
  const [step, setStep] = useState('method');
  const [methods, setMethods] = useState(FALLBACK_METHODS);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [rate, setRate] = useState(0.2);
  const [commissionPct, setCommissionPct] = useState(20);
  const [minStars, setMinStars] = useState(100);
  const [maxStars, setMaxStars] = useState(100000);

  const [amountStars, setAmountStars] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const operationIdRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    api.getWithdrawMethods?.()
      .then((r) => {
        if (!alive) return;
        if (Array.isArray(r?.methods) && r.methods.length) setMethods(r.methods);
        if (typeof r?.rate === 'number') setRate(r.rate);
        if (typeof r?.commission === 'number') setCommissionPct(r.commission);
        if (typeof r?.min === 'number') setMinStars(r.min);
        if (typeof r?.max === 'number') setMaxStars(r.max);
      })
      .catch(() => {})
      .finally(() => { if (alive) setMethodsLoading(false); });
    return () => { alive = false; };
  }, []);

  const calc = useMemo(() => {
    const stars = Math.max(0, Math.floor(Number(amountStars) || 0));
    const rub = +(stars * rate).toFixed(2);
    const commission = +(rub * (commissionPct / 100)).toFixed(2);
    const payout = +(rub - commission).toFixed(2);
    return { stars, rub, commission, payout };
  }, [amountStars, rate, commissionPct]);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!operationIdRef.current) operationIdRef.current = createOperationId();
      const r = await api.withdrawRequest({
        method: 'crypto',
        amountStars: calc.stars,
        contactUsername: username.replace(/^@/, ''),
        operationId: operationIdRef.current,
      });
      setResult(r);
      hapticNotify(true);
      setStep('success');
    } catch (err) {
      setError(mapError(err?.code, err?.details));
      hapticNotify(false);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="withdraw-screen">
      <button type="button" className="back-btn" onClick={onClose} aria-label="Назад">‹</button>

      {step === 'method' && (
        <>
          <h2>💸 Вывод средств</h2>
          <p className="withdraw-screen__sub">
            Выбери способ вывода. Комиссия — {commissionPct}%. Срок — до 48 часов.
          </p>

          {methodsLoading ? (
            <div className="skeleton" style={{ height: 80, borderRadius: 16 }} />
          ) : (
            methods.map((m) => (
              <button
                key={m.key}
                type="button"
                className="method-card"
                disabled={!m.enabled}
                onClick={() => { haptic('light'); setStep('form'); }}
              >
                <span className="method-card__icon">{m.icon}</span>
                <div className="method-card__info">
                  <strong>{m.label}</strong>
                  <small>{m.hint || 'Вывод'}</small>
                </div>
              </button>
            ))
          )}

          <div className="withdraw-note">
            <small>
              Минимум: {minStars} ⭐ · Максимум: {maxStars.toLocaleString('ru-RU')} ⭐
            </small>
          </div>
        </>
      )}

      {step === 'form' && (
        <>
          <h2>Вывод — детали</h2>
          <p className="withdraw-screen__sub">
            Курс: 1 ⭐ = {rate} ₽ · Комиссия: {commissionPct}%
          </p>

          <label className="field">
            <span>Сумма в ⭐</span>
            <input
              type="text"
              inputMode="numeric"
              value={amountStars}
              onChange={(e) => setAmountStars(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={`от ${minStars} до ${maxStars}`}
            />
          </label>

          <label className="field">
            <span>Юзернейм для связи</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              autoComplete="off"
            />
          </label>

          {calc.stars > 0 && (
            <div className="withdraw-calc">
              <div><span>Сумма</span><b>{calc.stars} ⭐</b></div>
              <div><span>В рублях</span><b>{normRub(calc.rub)}</b></div>
              <div><span>Комиссия {commissionPct}%</span><b>−{normRub(calc.commission)}</b></div>
              <div className="withdraw-calc__total"><span>К выплате</span><b>{normRub(calc.payout)}</b></div>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={loading || !calc.stars || !username}
            onClick={handleSubmit}
          >
            {loading ? 'Отправка…' : 'Создать заявку'}
          </button>

          <p className="withdraw-disclaimer">
            <small>
              Заявка обрабатывается менеджером вручную. Убедись, что юзернейм верный.
            </small>
          </p>
        </>
      )}

      {step === 'success' && (
        <>
          <h2>✅ Заявка создана</h2>
          <p className="withdraw-screen__sub">
            Заявка #{result?.requestId} принята. Ожидай выплату — до 48 часов.
          </p>
          <button type="button" className="btn btn--primary btn--large" onClick={onClose}>
            Понятно
          </button>
        </>
      )}
    </div>
  );
}
