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
  catalog: { title: 'Каталог', subtitle: 'Купить предметы 👇' },
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheetItem, setSheetItem] = useState(null);
  const [buying, setBuying] = useState(false);
  const [sellingId, setSellingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    initTelegram();
  }, []);

  // Каждый эндпоинт грузится независимо: если упал один,
  // остальные всё равно отрисуются, а не обнулится весь экран.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    const [catalogRes, inventoryRes, profileRes] = await Promise.allSettled([
      api.getCatalog(),
      api.getInventory(),
      api.getProfile()
    ]);

    if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value.items || []);
    if (inventoryRes.status === 'fulfilled') setInventory(inventoryRes.value.items || []);
    if (profileRes.status === 'fulfilled') setProfile(profileRes.value);

    const failed = [catalogRes, inventoryRes, profileRes].filter((r) => r.status === 'rejected');
    if (failed.length === 3) {
      setLoadFailed(true);
      console.error('Все запросы упали:', failed[0].reason);
    } else if (failed.length > 0) {
      setToast('Часть данных не загрузилась.');
    }

    setLoading(false);
  }, []);

  const refreshInventoryAndProfile = useCallback(async () => {
    const [inventoryRes, profileRes] = await Promise.allSettled([api.getInventory(), api.getProfile()]);
    if (inventoryRes.status === 'fulfilled') setInventory(inventoryRes.value.items || []);
    if (profileRes.status === 'fulfilled') setProfile(profileRes.value);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Telegram выгружает WebView в фоне — при возврате обновляем данные.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshInventoryAndProfile();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshInventoryAndProfile]);

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
        } else if (status !== 'cancelled') {
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

  const handleSell = async (item) => {
    if (!item) return;
    setSellingId(item.inventory_id);
    haptic('light');
    try {
      const res = await api.sell(item.inventory_id);
      hapticNotify('success');
      setToast(`Продано: ${res.soldName} · +${res.earned} ★`);
      await refreshInventoryAndProfile();
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      setToast('Не получилось продать предмет.');
    } finally {
      setSellingId(null);
    }
  };

  const meta = SCREEN_META[tab];

  if (loadFailed) {
    return (
      <div className="app">
        <header className="top-nav">
          <div className="top-nav__brand">
            <img className="top-nav__logo" src="/logo.png" alt="RoUP" />
          </div>
        </header>
        <div className="empty-state">
          <p className="empty-state__title">Не удалось загрузить данные</p>
          <p>Сервер мог заснуть — подожди пару секунд и попробуй снова.</p>
          <button className="upgrade-button" style={{ marginTop: 16 }} onClick={loadAll}>
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

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
        <CatalogTab items={catalog} ownedItemIds={ownedItemIds} loading={loading} onBuy={handleBuy} />
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
      {tab === 'inventory' && (
        <InventoryTab items={inventory} loading={loading} onSell={handleSell} sellingId={sellingId} />
      )}
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
