import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldCheck, FileText, Lock, WifiOff, User, ShoppingBag, BookOpen, LifeBuoy } from 'lucide-react';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { initTelegramApp, tg, hapticFeedback } from './lib/telegram';
import { api, Bootstrap, ApiError } from './lib/api';
import { AppContext } from './lib/AppContext';

import Dashboard from './pages/Dashboard';
import Buy from './pages/Buy';
import Instructions from './pages/Instructions';
import Support from './pages/Support';
import AdminApp from './pages/Admin';

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
      <div className="text-[19px] font-semibold text-white">Не удалось подключиться</div>
      <div className="text-[15px] text-[#8E8E93]">{message}</div>
      <button
        onClick={onRetry}
        className="mt-2 px-8 py-3 btn-primary rounded-full text-white font-semibold text-[16px] active:scale-95 transition-transform"
      >
        Повторить
      </button>
    </div>
  );
}

function TermsGate({ boot, onAccepted }: { boot: Bootstrap; onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await api.acceptTerms();
      hapticFeedback.notificationOccurred('success');
      onAccepted();
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-end px-5 pb-10 pt-16">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
        <div className="w-20 h-20 app-icon rounded-[28px] flex items-center justify-center bg-gradient-to-b from-[#2E9BFF]/40 to-[#0A84FF]/20 shadow-[0_8px_40px_rgba(10,132,255,0.35)]">
          <ShieldCheck className="w-10 h-10 text-[#4DA6FF]" />
        </div>
        <h1 className="text-[30px] font-bold tracking-tight text-white">
          Добро пожаловать <br /> в Gigabyte
        </h1>
        <div className="text-[15px] text-[#8E8E93] leading-relaxed max-w-[300px]">
          ⚡ Высокая скорость соединения
          <br />
          🔐 Защищённое шифрованное подключение
          <br />
          📶 Безопасность в публичных сетях Wi-Fi
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-10">
        <a
          href={boot.offer_url}
          target="_blank"
          rel="noreferrer"
          className="glass rounded-3xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <FileText className="w-5 h-5 text-[#0A84FF] shrink-0" />
          <span className="text-[16px] text-white font-medium">Публичная оферта</span>
        </a>
        <a
          href={boot.privacy_url}
          target="_blank"
          rel="noreferrer"
          className="glass rounded-3xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <Lock className="w-5 h-5 text-[#0A84FF] shrink-0" />
          <span className="text-[16px] text-white font-medium">Политика конфиденциальности</span>
        </a>
        <button
          onClick={accept}
          disabled={busy}
          className="w-full py-4 btn-primary rounded-3xl text-white font-bold text-[17px] active:scale-[0.98] transition-transform disabled:opacity-60 mt-2"
        >
          {busy ? 'Секунду…' : '✅ Принять и продолжить'}
        </button>
        <div className="text-[12px] text-[#8E8E93]/70 text-center px-6">
          Нажимая «Принять», вы соглашаетесь с условиями публичной оферты и политикой конфиденциальности.
        </div>
      </div>
    </div>
  );
}

const USER_TABS: NavTab[] = [
  { path: '/', icon: User, label: 'Дашборд' },
  { path: '/buy', icon: ShoppingBag, label: 'Купить' },
  { path: '/instructions', icon: BookOpen, label: 'Гайды' },
  { path: '/support', icon: LifeBuoy, label: 'Помощь' },
];

export default function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.bootstrap();
      setBoot(data);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Откройте приложение из Telegram — авторизация выполняется автоматически.');
      } else {
        setError(e.message || 'Неизвестная ошибка');
      }
    } finally {
      setLoading(false);
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
  if (error || !boot) return <ErrorScreen message={error || 'Ошибка'} onRetry={load} />;

  if (!boot.accepted_terms && !boot.is_admin) {
    return <TermsGate boot={boot} onAccepted={() => setBoot({ ...boot, accepted_terms: true })} />;
  }

  return (
    <AppContext.Provider value={{ boot, refreshBoot: load }}>
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
            // Администратор видит ТОЛЬКО админ-приложение
            <AdminApp />
          ) : (
            <>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/buy" element={<Buy />} />
                <Route path="/instructions" element={<Instructions />} />
                <Route path="/support" element={<Support />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <BottomNav tabs={USER_TABS} />
            </>
          )}
        </div>
      </HashRouter>
    </AppContext.Provider>
  );
}
