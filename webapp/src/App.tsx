import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { FileText, Lock, WifiOff, User, ShoppingBag, BookOpen, LifeBuoy, ChevronRight } from 'lucide-react';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { initTelegramApp, tg, hapticFeedback } from './lib/telegram';
import { api, Bootstrap, ApiError, getDashToken } from './lib/api';
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
  // fixed inset-0 (а не min-h-screen): спиннер всегда центрируется по вьюпорту.
  // Иначе при первом рендере он центрируется в полном экране, а Suspense-фолбэк
  // админ-чанка — уже внутри обёртки с paddingTop/paddingBottom, из-за чего
  // спиннер «прыгал» вниз. fixed выносит его из потока и убирает скачок.
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
    </div>
  );
}

/**
 * У каждого раздела свой скролл.
 *
 * Все страницы живут в одном скролле документа, поэтому позиция «перетекала»:
 * пролистал «Профиль» вниз → открыл «Тарифы», а они уже прокручены. Переход
 * вперёд открывает раздел сверху, «назад» возвращает туда, где были.
 */
function ScrollManager() {
  const { key } = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(key);

  useEffect(() => {
    const leavingKey = currentKey.current;
    return () => {
      positions.current.set(leavingKey, window.scrollY);
    };
  }, [key]);

  useLayoutEffect(() => {
    currentKey.current = key;
    // до отрисовки кадра — чтобы не было видимого рывка
    window.scrollTo(0, navType === 'POP' ? positions.current.get(key) ?? 0 : 0);
  }, [key, navType]);

  return null;
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

/** Экран входа в веб-дашборд: открыт в браузере, токена нет.
 *  Токен выдаёт бот командой /dashboard — никаких паролей. */
function DashboardLogin() {
  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-6 text-center gap-6">
      <img src={logoUrl} alt="Gigabyte" className="w-[150px] h-[150px] object-contain drop-shadow-[0_10px_50px_rgba(10,132,255,0.5)]" />
      <div>
        <h1 className="text-[26px] font-bold text-white tracking-tight">Панель управления</h1>
        <p className="text-[15px] text-[#8E8E93] mt-3 max-w-[380px] leading-relaxed">
          Чтобы войти, откройте бота в Telegram и отправьте команду{' '}
          <code className="text-[#4DA6FF] font-mono">/dashboard</code> — он пришлёт персональную ссылку
          для входа.
        </p>
      </div>
      <div className="glass rounded-3xl px-5 py-4 max-w-[420px] text-[13px] text-white/60 leading-relaxed">
        Вход без паролей: ссылка подписана токеном бота и действует ограниченное время.
        Доступ только у администраторов.
      </div>
    </div>
  );
}

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

  // Фон — чистый чёрный (#000), в точности как у логотипа, чтобы он сливался
  // с экраном. Всё умещается на один экран без прокрутки.
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col px-6 pb-8 overflow-hidden"
      style={{
        paddingTop: 'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 12px), 24px)',
      }}
    >
      {/* Мягкое синее свечение для глубины на чёрном фоне — вместо логотипа */}
      <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] rounded-full bg-[#0A84FF]/10 blur-[110px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-0 text-center relative">
        {/* Типографический вордмарк вместо изображения логотипа */}
        <div className="text-[13px] font-semibold uppercase tracking-[0.4em] text-white/35 pl-[0.4em]">
          Gigabyte VPN
        </div>
        {/* Крупная надпись «Добро пожаловать» с фирменным градиентом */}
        <h1
          className="text-[44px] font-bold tracking-tight leading-[1.04] bg-clip-text text-transparent px-2"
          style={{
            backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #CFE2FF 55%, #4DA6FF 100%)',
            filter: 'drop-shadow(0 6px 30px rgba(10,132,255,0.35))',
          }}
        >
          {t('terms.welcome')}
        </h1>
        {/* Тематическая цитата */}
        <div className="flex flex-col items-center gap-4 mt-1">
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-[#0A84FF]/60 to-transparent" />
          <div className="text-[17px] leading-relaxed text-white/65 italic max-w-[330px]">
            «{t('terms.quote')}»
          </div>
        </div>
      </div>

      {/* Документы + принятие */}
      <div className="w-full max-w-[420px] mx-auto flex flex-col gap-2.5 shrink-0">
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

  // Веб-дашборд открыт в браузере без токена — показываем экран входа
  if (!tg.initData && !getDashToken()) return <DashboardLogin />;

  if (loading) return <Spinner />;
  if (error || !boot) return <ErrorScreen message={error || 'Ошибка'} onRetry={() => load()} />;

  if (!boot.accepted_terms && !boot.is_admin) {
    return <TermsGate onAccepted={() => setBoot({ ...boot, accepted_terms: true })} />;
  }

  return (
    <AppContext.Provider value={{ boot, refreshBoot: () => load(true) }}>
      <HashRouter>
        <ScrollManager />
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
