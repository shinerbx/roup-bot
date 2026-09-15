const tg = window.Telegram?.WebApp;

export function initTelegram() {
  if (!tg) return null;
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0b0407');
  tg.setBackgroundColor('#0b0407');
  return tg;
}

export function getInitData() {
  return tg?.initData || '';
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

export function haptic(style = 'light') {
  tg?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotify(type = 'success') {
  tg?.HapticFeedback?.notificationOccurred(type);
}

// Открывает счёт на оплату Telegram Stars и вызывает callback
// с итоговым статусом: 'paid' | 'cancelled' | 'failed' | 'pending'
export function openInvoice(url, onClosed) {
  if (!tg) {
    onClosed?.('failed');
    return;
  }
  tg.openInvoice(url, (status) => onClosed?.(status));
}

export { tg };
