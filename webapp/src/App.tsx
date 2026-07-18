import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { FileText, Lock, WifiOff, User, ShoppingBag, BookOpen, LifeBuoy, Zap, ShieldCheck, Wifi, EyeOff, ChevronRight } from 'lucide-react';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { initTelegramApp, tg, hapticFeedback } from './lib/telegram';
import { api, Bootstrap, ApiError } from './lib/api';
import { AppContext } from './lib/AppContext';
import { t, LANG } from './lib/i18n';
import { TERMS, PRIVACY } from './lib/legal';
import Legal from './pages/Legal';
import logoUrl from './assets/logo.png';

import Dashboard from './pages/Dashboard';
import Buy from './pages/Buy';
import Instructions from './pages/Instructions';
import Support from './pages/Support';

// Админ-панель нужна только администратору — выносим её в отдельный чанк,
// чтобы обычные пользователи не грузили лишние ~сотни КБ при старте.
const AdminApp = lazy(() => import('./pages/Admin'));

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-4">
      <div className="w-16 h-16 glass rounded-full flex items-center justify-center">
        <WifiOff className="w-8 h-8 text-[#FF453A]" />
      </div>
      <div className="text-[19px] font-semibold text-white">{t('app.connectFail')}</div>
      <div className="text-[15px] text-[#8E8E93]">{message}</div>
      <button
        onClick={onRetry}
        className="mt-2 px-8 py-3 btn-primary rounded-full text-white font-semibold text-[16px] active:scale-95 transition-transform"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

const WELCOME_FEATURES = [
  { icon: Zap, tint: '#FFD60A', t: 'feat.speed.t', d: 'feat.speed.d' },
  { icon: ShieldCheck, tint: '#32D74B', t: 'feat.secure.t', d: 'feat.secure.d' },
  { icon: Wifi, tint: '#0A84FF', t: 'feat.wifi.t', d: 'feat.wifi.d' },
  { icon: EyeOff, tint: '#BF5AF2', t: 'feat.nolog.t', d: 'feat.nolog.d' },
];

function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);

  const accept = async () => {
    setBusy(true);
    try {
      await api.acceptTerms();
      hapticFeedback.notificationOccurred('success');
      onAccepted();
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col px-5 pb-8"
      style={{
        paddingTop: 'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 12px), 24px)',
      }}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-4">
        {/* Логотип бренда */}
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-[#0A84FF]/25 rounded-full scale-90" />
          <img
            src={logoUrl}
            alt="Gigabyte"
            className="relative w-[132px] h-[132px] object-contain drop-shadow-[0_8px_40px_rgba(10,132,255,0.45)]"
          />
        </div>

        <div className="text-center">
          <h1 className="text-[30px] font-bold tracking-tight text-white leading-tight">
            {t('terms.welcome')}
          </h1>
          <div className="text-[15px] text-[#8E8E93] leading-relaxed max-w-[320px] mx-auto mt-2.5">
            {t('terms.tagline')}
          </div>
        </div>

        {/* Преимущества карточками */}
        <div className="w-full max-w-[420px] flex flex-col gap-2.5 mt-1">
          {WELCOME_FEATURES.map((f) => (
            <div key={f.t} className="glass rounded-3xl p-3.5 flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-2xl app-icon flex items-center justify-center shrink-0"
                style={{ background: `linear-gradient(180deg, ${f.tint}55, ${f.tint}1f)` }}
              >
                <f.icon className="w-[22px] h-[22px]" style={{ color: f.tint }} />
              </div>
              <div className="min-w-0">
                <div className="text-[15.5px] font-semibold text-white leading-tight">{t(f.t)}</div>
                <div className="text-[13px] text-[#8E8E93] leading-snug mt-0.5">{t(f.d)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Документы + принятие */}
      <div className="w-full max-w-[420px] mx-auto flex flex-col gap-2.5 mt-4">
        <div className="glass rounded-3xl overflow-hidden">
          <button
            onClick={() => { hapticFeedback.selectionChanged(); setLegal('terms'); }}
            className="w-full p-4 flex items-center gap-3 active:bg-white/[0.04] transition-colors"
          >
            <FileText className="w-5 h-5 text-[#0A84FF] shrink-0" />
            <span className="flex-1 text-left text-[16px] text-white font-medium">{t('terms.offer')}</span>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
          <div className="h-px bg-white/[0.07] ml-[52px]" />
          <button
            onClick={() => { hapticFeedback.selectionChanged(); setLegal('privacy'); }}
            className="w-full p-4 flex items-center gap-3 active:bg-white/[0.04] transition-colors"
          >
            <Lock className="w-5 h-5 text-[#0A84FF] shrink-0" />
            <span className="flex-1 text-left text-[16px] text-white font-medium">{t('terms.privacy')}</span>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
        </div>
        <button
          onClick={accept}
          disabled={busy}
          className="w-full py-4 btn-primary rounded-3xl text-white font-bold text-[17px] active:scale-[0.98] transition-transform disabled:opacity-60 mt-1"
        >
          {busy ? t('common.wait') : t('terms.accept')}
        </button>
        <div className="text-[12px] text-[#8E8E93]/70 text-center px-6">{t('terms.note')}</div>
      </div>

      <AnimatePresence>
        {legal && (
          <Legal
            kind={legal}
            doc={legal === 'terms' ? TERMS[LANG] : PRIVACY[LANG]}
            onClose={() => setLegal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const USER_TABS: NavTab[] = [
  { path: '/', icon: User, label: t('nav.dashboard') },
  { path: '/buy', icon: ShoppingBag, label: t('nav.buy') },
  { path: '/instructions', icon: BookOpen, label: t('nav.guides') },
  { path: '/support', icon: LifeBuoy, label: t('nav.support') },
];

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // silent=true — фоновое обновление: без спиннера и без экрана ошибки,
  // просто тихо обновляем данные (для авто-refetch при возврате в апп).
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.bootstrap();
      setBoot(data);
    } catch (e: any) {
      if (silent) return; // фоновую ошибку не показываем
      if (e instanceof ApiError && e.status === 401) {
        setError(t('app.openFromTg'));
      } else {
        setError(e.message || t('common.error'));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegramApp();
    try {
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
        if (tg.setHeaderColor) tg.setHeaderColor('#050507');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#050507');
      }
    } catch (e) {}
    load();
  }, [load]);

  if (loading) return <Spinner />;
  if (error || !boot) return <ErrorScreen message={error || 'Ошибка'} onRetry={() => load()} />;

  if (!boot.accepted_terms && !boot.is_admin) {
    return <TermsGate onAccepted={() => setBoot({ ...boot, accepted_terms: true })} />;
  }

  return (
    <AppContext.Provider value={{ boot, refreshBoot: () => load(true) }}>
      <HashRouter>
        <div
          className="min-h-screen text-white"
          style={{
            // В полноэкранном режиме (Bot API 8.0) поверх контента появляются
            // системная шторка и кнопки Telegram — учитываем оба safe-area.
            // Минимальный запас маленький, чтобы контент начинался выше.
            paddingTop:
              'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px)), 12px)',
            paddingBottom: 'max(var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom)), 128px)',
            paddingLeft: 'var(--tg-safe-area-inset-left, env(safe-area-inset-left))',
            paddingRight: 'var(--tg-safe-area-inset-right, env(safe-area-inset-right))',
          }}
        >
          {boot.is_admin ? (
            // Администратор видит ТОЛЬКО админ-приложение (ленивый чанк)
            <Suspense fallback={<Spinner />}>
              <AdminApp />
            </Suspense>
          ) : (
            // Ограничение ширины: на планшетах и десктопах контент не
            // растягивается на весь экран, на телефонах ничего не меняется.
            <div className="mx-auto w-full max-w-[560px]">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/buy" element={<Buy />} />
                <Route path="/instructions" element={<Instructions />} />
                <Route path="/support" element={<Support />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <BottomNav tabs={USER_TABS} />
            </div>
          )}
        </div>
      </HashRouter>
    </AppContext.Provider>
  );
}
