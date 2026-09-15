import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from './api.js';
import { initTelegram, openInvoice, haptic, hapticNotify } from './telegram.js';
import TabBar from './components/TabBar.jsx';
import CatalogTab from './components/CatalogTab.jsx';
import UpgradeTab from './components/UpgradeTab.jsx';
import InventoryTab from './components/InventoryTab.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import PurchaseSheet from './components/PurchaseSheet.jsx';
import Toast from './components/Toast.jsx';

const SCREEN_META = {
  catalog: { title: 'Каталог', subtitle: 'Предметы за Telegram Stars' },
  upgrade: { title: 'Апгрейд', subtitle: 'Улучшай предметы из инвентаря' },
  inventory: { title: 'Инвентарь', subtitle: 'Твои предметы' },
  profile: { title: 'Профиль', subtitle: null }
};

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

  const refreshInventoryAndProfile = useCallback(async () => {
    const [inventoryRes, profileRes] = await Promise.all([api.getInventory(), api.getProfile()]);
    setInventory(inventoryRes.items);
    setProfile(profileRes);
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
          await refreshInventoryAndProfile();
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

  const meta = SCREEN_META[tab];

  return (
    <div className="app">
      <header className="top-nav">
        <div className="top-nav__brand">
          <img className="top-nav__logo" src="/logo.png" alt="RoUP" />
        </div>
        <div className="balance-pill">
          <span className="balance-pill__icon">★</span>
          <span className="balance-pill__value">{profile?.balance ?? 0}</span>
          {profile?.tier && <span className="balance-pill__tier">{profile.tier}</span>}
        </div>
      </header>

      <div>
        <h2 className="screen-title">{meta.title}</h2>
        {meta.subtitle && <p className="screen-subtitle">{meta.subtitle}</p>}
      </div>

      {tab === 'catalog' && (
        <CatalogTab
          items={catalog}
          ownedItemIds={ownedItemIds}
          loading={loading}
          onBuy={handleBuy}
        />
      )}
      {tab === 'upgrade' && (
        <UpgradeTab
          inventory={inventory}
          catalog={catalog}
          loading={loading}
          onUpgraded={refreshInventoryAndProfile}
          onError={setToast}
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
