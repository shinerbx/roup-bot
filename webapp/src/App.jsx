import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from './api.js';
import { initTelegram, haptic, hapticNotify } from './telegram.js';
import SplashScreen from './components/SplashScreen.jsx';
import TabBar from './components/TabBar.jsx';
import CatalogTab from './components/CatalogTab.jsx';
import UpgradeTab from './components/UpgradeTab.jsx';
import InventoryTab from './components/InventoryTab.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import RouletteTab from './components/RouletteTab.jsx';
import PurchaseSheet from './components/PurchaseSheet.jsx';
import WithdrawScreen from './components/WithdrawScreen.jsx';
import WithdrawRequestsPanel from './components/WithdrawRequestsPanel.jsx';
import TopUpScreen from './components/TopUpScreen.jsx';
import Toast from './components/Toast.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';

const SCREEN_META = {
  catalog: { title: 'Каталог', subtitle: 'Купить предметы 👇' },
  upgrade: { title: null, subtitle: null },
  inventory: { title: null, subtitle: null },
  roulette: { title: 'Рулетка', subtitle: 'Приглашай друзей — получай прокрутки 🎁' },
  profile: { title: 'Профиль', subtitle: null }
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [tab, setTab] = useState('catalog');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdrawRequests, setShowWithdrawRequests] = useState(false);
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
  const [tutorialStep, setTutorialStep] = useState(null);

  useEffect(() => {
    initTelegram();
  }, []);

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
      // Не загружаем все изображения каталога заранее: карточки используют lazy-loading.
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

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  useEffect(() => {
    if (showSplash || !profile || tutorialStep !== null) return;
    if (!profile.tutorial_completed) {
      setTab('catalog');
      setTutorialStep(1);
    }
  }, [showSplash, profile, tutorialStep]);

  const ownedItemIds = useMemo(() => new Set(inventory.map((i) => i.id)), [inventory]);

  const handleBuy = (item, quantity = 1) => {
    haptic('light');
    setSheetQuantity(Math.min(100, Math.max(1, Number.isInteger(quantity) ? quantity : 1)));
    setSheetItem(item);
  };

  const handleConfirmPurchase = async (quantity = 1) => {
    if (!sheetItem) return;
    setBuying(true);
    try {
      const res = await api.buy(sheetItem.id, quantity);
      hapticNotify('success');
      setToast(`Куплено: ${sheetItem.name}`);
      setSheetItem(null);
      setSheetQuantity(1);
      setProfile((prev) => (prev ? { ...prev, balance: res.balance } : prev));
      await refreshInventoryAndProfile();
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      if (err.code === 'insufficient_balance') {
        setToast('Недостаточно ⭐ на балансе.');
        setSheetItem(null);
        setSheetQuantity(1);
        setShowTopUp(true);
      } else {
        setToast('Не получилось купить предмет.');
      }
    } finally {
      setBuying(false);
    }
  };

  const handleRouletteSpin = useCallback(async (result) => {
    // Прокрутка списана на сервере — сразу показываем новый остаток, затем подтягиваем инвентарь и баланс.
    setProfile((prev) => prev ? {
      ...prev,
      free_roulette_spins: Number(result?.spinsRemaining) || 0,
    } : prev);
    await refreshInventoryAndProfile();
  }, [refreshInventoryAndProfile]);

  const handleSellMany = async (itemId, quantity) => {
    if (!itemId || !quantity) return;
    setSellingId(itemId);
    haptic('light');
    try {
      const res = await api.sellMany(itemId, quantity);
      hapticNotify('success');
      setToast(`Продано: ${res.soldName} × ${res.quantity} · +${res.earned} ★`);
      await refreshInventoryAndProfile();
      return true;
    } catch (err) {
      console.error(err);
      hapticNotify('error');
      const msg = err?.code === 'not_enough_items'
        ? 'Недостаточно предметов для продажи.'
        : err?.code === 'demo_active'
          ? 'Продажа недоступна во время Demo-режима.'
          : err?.code === 'demo_item_locked'
            ? 'Demo-предмет нельзя продать.'
            : 'Не получилось продать.';
      setToast(msg);
      return false;
    } finally {
      setSellingId(null);
    }
  };

  const handleTabChange = (nextTab) => {
    if (tutorialStep === 1) {
      if (nextTab === 'catalog') { haptic('light'); setTab('catalog'); setTutorialStep(2); }
      return;
    }
    if (tutorialStep === 2) {
      if (nextTab === 'upgrade') { haptic('light'); setTab('upgrade'); setTutorialStep(3); }
      return;
    }
    if (tutorialStep === 3) {
      if (nextTab === 'inventory') { haptic('light'); setTab('inventory'); setTutorialStep(4); }
      return;
    }
    if (tutorialStep === 4) {
      if (nextTab === 'roulette') { haptic('light'); setTab('roulette'); setTutorialStep(5); }
      return;
    }
    if (tutorialStep === 5) return;
    setTab(nextTab);
  };

  const finishTutorial = async () => {
    try {
      await api.completeTutorial();
    } catch (err) {
      console.warn('Не удалось сохранить завершение туториала:', err);
    }
    setProfile((prev) => (prev ? { ...prev, tutorial_completed: true } : prev));
    setTutorialStep(null);
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

  if (showWithdrawRequests) {
    return (
      <div className="app">
        <WithdrawRequestsPanel onClose={() => setShowWithdrawRequests(false)} />
      </div>
    );
  }

  if (showTopUp) {
    return (
      <div className="app">
        <TopUpScreen onClose={() => setShowTopUp(false)} />
      </div>
    );
  }

  if (showWithdraw) {
    return (
      <div className="app">
        <WithdrawScreen
          onClose={async () => { setShowWithdraw(false); await refreshInventoryAndProfile(); }}
          balance={profile?.balance ?? 0}
          canWithdraw={profile?.can_withdraw !== false}
          demoActive={Boolean(profile?.demo_active)}
          referralProgress={profile?.referral_progress}
          isWhitelisted={Boolean(profile?.is_whitelisted)}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-nav">
        <div className="top-nav__brand">
          <img className="top-nav__logo" src="/logo.png" alt="RoUP" />
        </div>
        <button type="button" className="balance-pill" onClick={() => setShowTopUp(true)} aria-label="Пополнить баланс">
          <span className="balance-pill__icon">★</span>
          <span className="balance-pill__value">{profile?.balance ?? 0}</span>
          <span className="balance-pill__add" aria-hidden="true">+</span>
        </button>
      </header>

      {(meta.title || meta.subtitle) && (
        <div>
          {meta.title && <h2 className="screen-title">{meta.title}</h2>}
          {meta.subtitle && <p className="screen-subtitle">{meta.subtitle}</p>}
        </div>
      )}

      {tab === 'catalog' && (
        <CatalogTab items={catalog} ownedItemIds={ownedItemIds} loading={loading} onBuy={handleBuy} />
      )}
      {tab === 'upgrade' && (
        <UpgradeTab
          inventory={inventory}
          catalog={catalog}
          loading={loading}
          demoActive={Boolean(profile?.demo_active)}
          onUpgraded={refreshInventoryAndProfile}
          onError={setToast}
        />
      )}
      {tab === 'inventory' && (
        <InventoryTab
          items={inventory}
          loading={loading}
          onSell={handleSellMany}
          sellingId={sellingId}
          demoActive={Boolean(profile?.demo_active)}
          canWithdraw={Boolean(profile?.can_withdraw)}
          referralProgress={profile?.referral_progress}
          isWhitelisted={Boolean(profile?.is_whitelisted)}
          onWithdraw={() => setShowWithdraw(true)}
        />
      )}
      {tab === 'roulette' && (
        <RouletteTab
          profile={profile}
          onSpinSuccess={handleRouletteSpin}
          onSell={handleSellMany}
          sellingId={sellingId}
          onToast={setToast}
        />
      )}
      {tab === 'profile' && <ProfileTab profile={profile} loading={loading} onOpenWithdrawRequests={() => setShowWithdrawRequests(true)} />}

      <TabBar active={tab} onChange={setTab} />

      <TutorialOverlay step={tutorialStep} onFinish={finishTutorial} onTargetClick={handleTabChange} />

      <PurchaseSheet
        item={sheetItem}
        initialQuantity={sheetQuantity}
        pending={buying}
        balance={profile?.balance ?? 0}
        onCancel={() => { if (!buying) { setSheetItem(null); setSheetQuantity(1); } }}
        onConfirm={handleConfirmPurchase}
      />

      <Toast message={toast} />
    </div>
  );
}
