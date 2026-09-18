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
    invalid_username: 'Проверьте формат юзернейма — @username.',
    too_many_open_requests: 'У вас уже есть открытые заявки. Дождитесь их обработки.',
    referral_gate: 'Условия по приглашениям ещё не выполнены.',
    operation_in_progress: 'Заявка уже создаётся, подождите.',
    method_not_available: 'Этот способ вывода временно недоступен.',
    missing_operation_id: 'Ошибка сессии. Обновите страницу и попробуйте снова.',
    invalid_amount: 'Некорректная сумма.',
    server_error: 'Ошибка на сервере. Попробуйте позже.',
  };
  return map[code] || 'Не удалось создать заявку. Попробуйте позже.';
}

export default function WithdrawScreen({ onClose, balance = 0, canWithdraw = true }) {
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
        if
