import { useState } from 'react';
import { api } from '../api.js';
import { openInvoice, haptic, hapticNotify } from '../telegram.js';

const PRESETS = [25, 50, 100, 250, 500, 1000];

export default function TopUpScreen({ onClose, onError }) {
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

  const handleSupport = async () => {
    if (!amount || amount < 1 || paying) return;
    setPaying(true);
    haptic('medium');
    try {
      const { invoiceLink } = await api.createSupportInvoice(amount);
      openInvoice(invoiceLink, (status) => {
        setPaying(false);
        if (status === 'paid') {
          hapticNotify('success');
          onClose?.();
        } else if (status !== 'cancelled') {
          hapticNotify('error');
          onError?.('Поддержка не была завершена.');
        }
      });
    } catch (err) {
      console.error(err);
      setPaying(false);
      hapticNotify('error');
      onError?.('Не получилось создать счёт поддержки.');
    }
  };

  return (
    <div className="topup-overlay">
      <div className="topup-header">
        <button className="topup-back" onClick={onClose}>‹</button>
        <h2 className="screen-title">Баланс</h2>
        <span style={{ width: 28 }} />
      </div>

      <div className="balance-disabled-card">
        <p className="section-title">Пополнение игрового баланса</p>
        <p>Пополнение через Telegram Stars отключено. Telegram Stars не используются для покупки или начисления игровой валюты.</p>
      </div>

      <div className="support-project">
        <p className="section-title">Поддержать проект</p>
        <h3>❤️ Поддержка RoUP</h3>
        <p className="screen-subtitle">
          Поддержка проекта не является пополнением игрового баланса. После оплаты Stars не зачисляются пользователю и не превращаются в игровую валюту.
        </p>

        <div className="topup-presets">
          {PRESETS.map((value) => (
            <button key={value} className={`topup-chip ${amount === value && !customValue ? 'selected' : ''}`} onClick={() => handlePreset(value)}>
              ★ {value}
            </button>
          ))}
        </div>

        <div className="topup-custom">
          <span className="topup-custom__icon">★</span>
          <input className="topup-custom__input" inputMode="numeric" placeholder="Своя сумма поддержки" value={customValue} onChange={handleCustomChange} />
        </div>

        <button className="upgrade-button" disabled={!amount || paying} onClick={handleSupport}>
          {paying ? 'Открываем счёт…' : `Поддержать на ★ ${amount || 0}`}
        </button>

        <p className="topup-disclaimer">
          Оплата проводится через Telegram Stars (XTR). Поддержка не изменяет игровой баланс и не выдаёт игровую валюту.
        </p>
      </div>
    </div>
  );
}
