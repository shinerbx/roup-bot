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
    try {
      const [catalogRes, inventoryRes, profileRes] = await Promise.all([
        api.getCatalog(),
        api.getInventory(),
        api.getProfile()
      ]);
      setCatalog(catalogRes.items);
      setInventory(inventoryRes.items);
      setProfile(profileRes);
    } catch (err) {
      console.error(err);
      setToast('Не удалось загрузить данные. Потяни вниз, чтобы обновить.');
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

  const ownedItemIds = useMemo(() => new Set(inventory.map((i) => i.id)), [inventory]);

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
          // Сервер уже начислил предмет в successful_payment,
          // подтягиваем актуальный инвентарь/баланс.
          const [inventoryRes, profileRes] = await Promise.all([
            api.getInventory(),
            api.getProfile()
          ]);
          setInventory(inventoryRes.items);
          setProfile(profileRes);
        } else if (status === 'cancelled') {
          // ничего не делаем
        } else {
          hapticNotify('error');
          setToast('Оплата не прошла. Попробуй ещё раз.');
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
