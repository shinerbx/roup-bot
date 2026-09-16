import { useState } from 'react';
import { api } from '../api.js';
import { openInvoice, haptic, hapticNotify } from '../telegram.js';

const PRESETS = [25, 50, 100, 250, 500, 1000];

export default function TopUpScreen({ onClose, onSuccess, onError }) {
  const [amount, setAmount] = useState(100);
  const [customValue, setCustomValue] = useState('');
  const [paying, setPaying] = useState(false);

  const handlePreset = (value) => {
    haptic('light');
    setAmount(value);
    setCustomValue('');
  };

  const handleCustomChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 6);
    setCustomValue(raw);
    if (raw) setAmount(Number(raw));
  };

  const handlePay = async () => {
    if (!amount || amount < 1 || paying) return;
    setPaying(true);
    haptic('medium');

    try {
      const { invoiceLink } = await api.createTopupInvoice(amount);
      openInvoice(invoiceLink, async (status) => {
        setPaying(false);
        if (status === 'paid') {
          hapticNotify('success');
          onSuccess?.(amount);
        } else if (status !== 'cancelled') {
          hapticNotify('error');
          onError?.('Оплата не прошла. Попробуй ещё раз.');
        }
      });
    } catch (err) {
      console.error(err);
      setPaying(false);
      hapticNotify('error');
      onError?.('Не получилось создать счёт на оплату.');
    }
  };

  return (
    <div className="topup-overlay">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose}>
          ‹
        </button>
        <h2 className="screen-title">Пополнить баланс</h2>
        <span style={{ width: 28 }} />
      </div>

      <p className="topup-rate">1 ⭐ Telegram Stars = 1 ⭐ баланса</p>

      <div className="topup-presets">
        {PRESETS.map((value) => (
          <button
            key={value}
            className={`topup-chip ${amount === value && !customValue ? 'selected' : ''}`}
            onClick={() => handlePreset(value)}
          >
            ★ {value}
          </button>
        ))}
      </div>

      <div className="topup-custom">
        <span className="topup-custom__icon">★</span>
        <input
          className="topup-custom__input"
          inputMode="numeric"
          placeholder="Своя сумма"
          value={customValue}
          onChange={handleCustomChange}
        />
      </div>

      <button className="upgrade-button" disabled={!amount || paying} onClick={handlePay}>
        {paying ? 'Открываем счёт…' : `Оплатить ★ ${amount || 0}`}
      </button>

      <p className="topup-disclaimer">
        Оплата проходит через Telegram Stars. Начисленный баланс — внутренняя валюта приложения,
        обратно в Stars не конвертируется.
      </p>
    </div>
  );
}
