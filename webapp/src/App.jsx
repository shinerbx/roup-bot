import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { initTelegram, haptic, hapticNotify } from './telegram.js';
import SplashScreen from './components/SplashScreen.jsx';
import TabBar from './components/TabBar.jsx';
import CatalogTab from './components/CatalogTab.jsx';
import UpgradeTab from './components/UpgradeTab.jsx';
import InventoryTab from './components/InventoryTab.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import PurchaseSheet from './components/PurchaseSheet.jsx';
import TopUpScreen from './components/TopUpScreen.jsx';
import WithdrawScreen from './components/WithdrawScreen.jsx';
import Toast from './components/Toast.jsx';

const SCREEN_META = {
  catalog: { title: 'Каталог', subtitle: 'Купить предметы 👇' },
  upgrade: { title: null, subtitle: null },
  inventory: { title: 'Инвентарь', subtitle: 'Твои предметы' },
  profile: { title: 'Профиль', subtitle: null }
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [tab, setTab] = useState('catalog');
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheetItem, setSheetItem] = useState(null);
  const [sheetQuantity, setSheetQuantity] = useState(1);
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

    if (catalogRes.status === 'fulfilled') {
      const fetchedItems = catalogRes.value.items || [];
      setCatalog(fetchedItems);
      
      // МГНОВЕННАЯ ПРЕДЗАГРУЗКА КАРТИНОК В КЭШ
      fetchedItems.forEach(item => {
        if (item.image_url) {
          const img = new window.Image();
          img.src = item.image_url;
        }
      });
    }

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

  // Данные начинают грузиться сразу, параллельно со сплэш-анимацией —
  // к моменту, когда заставка закрывается, обычно уже всё готово.
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

  const handleBuy = (item, quantity = 1) => {
    haptic('light');
    const safeQuantity = Number.isSafeInteger(quantity) ? Math.min(9999, Math.max(1, quantity)) : 1;
    setSheetQuantity(safeQuantity);
    setSheetItem(item);
  };

  const handleConfirmPurchase = async () => {
    if (!sheetItem) return;
    setBuying(true);
    try {
      const res = await api.buy(sheetItem.id, sheetQuantity);
      hapticNotify('success');
      setToast(`Куплено: ${sheetItem.name} ×${sheetQuantity}`);
      setSheetItem(null);
      setSheetQuantity(1);
      setProfile((prev) => (prev ? { ...prev, balance: res.balance } : prev));
      await refreshInventoryAndProfile();
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      if (err.code === 'insufficient_balance') {
        setToast('Недостаточно ⭐ на балансе.');
      } else {
        setToast('Не получилось купить предмет.');
      }
    } finally {
      setBuying(false);
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

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

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

  if (showWithdraw) {
    return (
      <div className="app">
        <WithdrawScreen onClose={() => setShowWithdraw(false)} />
      </div>
    );
  }

  if (showTopUp) {
    return (
      <div className="app">
        <TopUpScreen onClose={() => setShowTopUp(false)} onError={setToast} />
        <Toast message={toast} />
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
          <button className="balance-pill__add" onClick={() => setShowTopUp(true)} aria-label="Пополнить баланс">
            +
          </button>
        </div>
      </header>

      {(meta.title || meta.subtitle) && (
        <div>
          {meta.title && <h2 className="screen-title">{meta.title}</h2>}
          {meta.subtitle && <p className="screen-subtitle">{meta.subtitle}</p>}
        </div>
      )}

      {tab === 'catalog' && (
        <CatalogTab items={catalog} loading={loading} onBuy={handleBuy} />
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
        <InventoryTab
          items={inventory}
          loading={loading}
          onSell={handleSell}
          sellingId={sellingId}
          canWithdraw={Boolean(profile?.can_withdraw)}
          referralProgress={profile?.referral_progress}
          onWithdraw={() => setShowWithdraw(true)}
        />
      )}
      {tab === 'profile' && <ProfileTab profile={profile} loading={loading} />}

      <TabBar active={tab} onChange={setTab} />

      <PurchaseSheet
        item={sheetItem}
        initialQuantity={sheetQuantity}
        pending={buying}
        balance={profile?.balance ?? 0}
        onCancel={() => { if (!buying) { setSheetItem(null); setSheetQuantity(1); } }}
        onConfirm={handleConfirmPurchase}
        onTopUp={() => {
          setSheetItem(null);
          setShowTopUp(true);
        }}
      />

      <Toast message={toast} />
    </div>
  );
}
