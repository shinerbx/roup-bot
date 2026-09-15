import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from './api.js';
import { initTelegram, openInvoice, haptic, hapticNotify } from './telegram.js';
import TabBar from './components/TabBar.jsx';
import CatalogTab from './components/CatalogTab.jsx';
import InventoryTab from './components/InventoryTab.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import PurchaseSheet from './components/PurchaseSheet.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const [tab, setTab] = useState('catalog');
  const [catalog, setCatalog] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sheetItem, setSheetItem] = useState(null);
  const [buying, setBuying] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    initTelegram();
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Запрашиваем независимо: если один запрос задержится, остальные не упадут
      const [catRes, invRes, profRes] = await Promise.allSettled([
        api.getCatalog(),
        api.getInventory(),
        api.getProfile()
      ]);

      if (catRes.status === 'fulfilled' && catRes.value?.items) {
        setCatalog(catRes.value.items);
      }
      if (invRes.status === 'fulfilled' && invRes.value?.items) {
        setInventory(invRes.value.items);
      }
      if (profRes.status === 'fulfilled' && profRes.value) {
        setProfile(profRes.value);
      }
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setToast('Сервер просыпается... Потяни вниз через пару секунд');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const ownedItemIds = useMemo(() => new Set((inventory || []).map((i) => i.id)), [inventory]);

  const handleBuy = (item) => {
    haptic('light');
    setSheetItem(item);
  };

  const handleConfirmPurchase = async () => {
    if (!sheetItem) return;
    setBuying(true);
    try {
      const { invoiceLink } = await api.createInvoice(sheetItem.id);
      openInvoice(invoiceLink, async (status) => {
        setBuying(false);
        setSheetItem(null);

        if (status === 'paid') {
          hapticNotify('success');
          setToast(`Куплено: ${sheetItem.name}`);
          const [inv, prof] = await Promise.allSettled([
            api.getInventory(),
            api.getProfile()
          ]);
          if (inv.status === 'fulfilled') setInventory(inv.value.items);
          if (prof.status === 'fulfilled') setProfile(prof.value);
        } else if (status === 'cancelled') {
          // Отмена пользователем
        } else {
          hapticNotify('error');
          setToast('Оплата не прошла.');
        }
      });
    } catch (err) {
      console.error(err);
      setBuying(false);
      hapticNotify('error');
      setToast('Не получилось создать счёт на оплату.');
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <h1 className="hero__logo">RoUP</h1>
        <p className="hero__subtitle">Roblox-предметы за Telegram Stars</p>
      </header>

      {tab !== 'profile' && (
        <div className="balance-card">
          <div>
            <p className="balance-card__label">Баланс</p>
            <p className="balance-card__value">★ {profile?.balance ?? 0}</p>
          </div>
          <span className="balance-card__tier">{profile?.tier ?? '—'}</span>
        </div>
      )}

      {tab === 'catalog' && (
        <CatalogTab
          items={catalog}
          ownedItemIds={ownedItemIds}
          loading={loading}
          onBuy={handleBuy}
        />
      )}
      {tab === 'inventory' && <InventoryTab items={inventory} loading={loading} />}
      {tab === 'profile' && <ProfileTab profile={profile} loading={loading} />}

      <TabBar active={tab} onChange={setTab} />

      <PurchaseSheet
        item={sheetItem}
        pending={buying}
        onCancel={() => !buying && setSheetItem(null)}
        onConfirm={handleConfirmPurchase}
      />

      <Toast message={toast} />
    </div>
  );
}