import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiBase, Subscription, Payment, HashResult, ReferralSummary } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback, openInvoice, downloadFile } from '../lib/telegram';
import { t, locale } from '../lib/i18n';
import { SectionTitle } from '../components/SectionTitle';
import {
  Copy,
  RefreshCw,
  Check,
  Clock,
  CreditCard,
  ChevronRight,
  FileText,
  X,
  ShieldCheck,
  BadgeCheck,
  History,
  Zap,
  QrCode,
  BellRing,
  BellOff,
  Wallet2,
  ChevronLeft,
  Star,
  Trash2,
  Send,
  Lock,
  AlertTriangle,
  Gift,
  Users2,
  Share2,
  Download,
  Sparkles,
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { LANG } from '../lib/i18n';
import { TERMS, PRIVACY } from '../lib/legal';
import Legal from './Legal';
import logoUrl from '../assets/logo.png';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useLockBodyScroll } from '../lib/scroll-lock';
import { useCopy, linkOrigin } from '../lib/use-copy';

const CountdownTimer = ({ expiryMs }: { expiryMs: number }) => {
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const calc = () => {
      const difference = expiryMs - Date.now();
      if (difference <= 0) return null;
      return {
        d: Math.floor(difference / (1000 * 60 * 60 * 24)),
        h: Math.floor((difference / (1000 * 60 * 60)) % 24),
        m: Math.floor((difference / 1000 / 60) % 60),
        s: Math.floor((difference / 1000) % 60),
      };
    };
    setTimeLeft(calc());
    const timer = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(timer);
  }, [expiryMs]);

  if (expiryMs === 0) return <div className="text-[16px] font-semibold text-[#32D74B]">{t('dash.unlimited')}</div>;
  if (!timeLeft) return <div className="text-[15px] font-semibold text-white">0d 0h 0m 0s</div>;

  return (
    <div className="flex items-center font-mono text-[16px] font-medium text-white">
      <span>{timeLeft.d}d</span>
      <span className="mx-1 opacity-50">:</span>
      <span>{String(timeLeft.h).padStart(2, '0')}h</span>
      <span className="mx-1 opacity-50">:</span>
      <span>{String(timeLeft.m).padStart(2, '0')}m</span>
      <span className="mx-1 opacity-50">:</span>
      <span className="text-[#32D74B]">{String(timeLeft.s).padStart(2, '0')}s</span>
    </div>
  );
};

const isFree = (p: Payment) => !p.amount_rub || Number(p.amount_rub) === 0 || p.method === 'trial';

// Живой трафик и онлайн-статус подписки (тянется из панели 3x-ui)
const SubTraffic = ({ subId }: { subId: string }) => {
  const [data, setData] = useState<{ up: number; down: number; online: boolean; available: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .subStats(subId)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [subId]);

  if (!data || !data.available) return null;
  const total = (data.up || 0) + (data.down || 0);
  return (
    <div className="flex flex-col items-end">
      <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
        {/* Точка живая: расходящаяся волна показывает, что соединение
            активно прямо сейчас. Анимация та же, что у «Защита активна». */}
        {data.online && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#32D74B] dot-pulse shrink-0" />
        )}
        {data.online ? t('dash.online') : t('dash.traffic')}
      </span>
      <span className="text-[16px] font-semibold text-white font-mono">{formatBytes(total)}</span>
    </div>
  );
};

// Зубчатый край чека (как у отрывной бумажной ленты)
const ReceiptEdge = ({ flip = false }: { flip?: boolean }) => (
  <div
    className="w-full h-[12px] shrink-0"
    style={{
      background: flip
        ? 'linear-gradient(-135deg, #faf9f0 6px, transparent 0) 0 0, linear-gradient(135deg, #faf9f0 6px, transparent 0) 0 0'
        : 'linear-gradient(-45deg, transparent 6px, #faf9f0 0) 0 0, linear-gradient(45deg, transparent 6px, #faf9f0 0) 0 0',
      backgroundSize: '12px 12px',
      backgroundRepeat: 'repeat-x',
    }}
  />
);

const ReceiptRow = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-dashed border-black/10 pb-1.5">
    <span className="opacity-45 font-bold uppercase shrink-0">{k}</span>
    <span className="font-bold text-right break-all">{v}</span>
  </div>
);

const ReceiptModal = ({ payment, onClose }: { payment: Payment; onClose: () => void }) => {
  const uid = String(payment.payment_uid || payment.id);
  const methodLabel = isFree(payment)
    ? 'БЕСПЛАТНЫЙ ДОСТУП'
    : payment.method === 'stars'
      ? 'TELEGRAM STARS'
      : `${payment.currency || 'CRYPTO'} · ARBITRUM`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/70 backdrop-blur-xl hidden-scrollbar"
      onClick={onClose}
    >
      <div className="min-h-full w-full flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ scale: 0.8, y: 60, rotate: -2, opacity: 0 }}
          animate={{ scale: 0.92, y: 0, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.8, y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 220 }}
          className="w-full max-w-md z-10 flex flex-col mt-[48px]"
          onClick={(e) => e.stopPropagation()}
          style={{ filter: 'drop-shadow(0 24px 48px rgba(0,0,0,0.55))' }}
        >
          <ReceiptEdge />
          <div
            className="bg-[#faf9f0] text-[#1a1a1a] px-7 pb-7 pt-6 relative flex flex-col font-mono"
            style={{
              backgroundImage: 'radial-gradient(#d1cfc1 0.3px, transparent 0.3px)',
              backgroundSize: '16px 16px',
            }}
          >
            {/* Перфорация по бокам */}
            <div className="absolute left-1.5 top-4 bottom-4 w-[3px] opacity-[0.12]"
              style={{ backgroundImage: 'radial-gradient(circle, #1a1a1a 1.2px, transparent 1.3px)', backgroundSize: '3px 10px' }} />
            <div className="absolute right-1.5 top-4 bottom-4 w-[3px] opacity-[0.12]"
              style={{ backgroundImage: 'radial-gradient(circle, #1a1a1a 1.2px, transparent 1.3px)', backgroundSize: '3px 10px' }} />

            <header className="mb-5 text-center border-b-[3px] border-double border-[#1a1a1a]/20 pb-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.35em] opacity-40 mb-1.5">
                ★ ★ ★ ★ ★
              </div>
              <h2 className="text-[30px] font-black tracking-tighter mb-1 leading-none">GIGABYTE</h2>
              <div className="text-[8px] font-bold uppercase tracking-[0.3em] opacity-50">
                PREMIUM · NETWORK · SERVICES
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-60 mt-2.5">
                КАССОВЫЙ ЧЕК № {uid.slice(0, 22).toUpperCase()}
              </div>
            </header>

            <div className="space-y-2.5 text-[10px] flex-1">
              <ReceiptRow
                k="Дата и время"
                v={payment.created_at ? new Date(payment.created_at).toLocaleString(locale) : '—'}
              />
              <ReceiptRow k="Терминал" v="TELEGRAM MINI APP" />
              <ReceiptRow k="Кассир" v="GIGABYTE BOT · АВТООПЛАТА" />

              <div className="flex flex-col border-b border-dashed border-black/10 pb-1.5 pt-1">
                <span className="opacity-45 font-bold mb-0.5 uppercase">Наименование услуги:</span>
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-[11px]">
                    {isFree(payment) ? 'Пробный доступ · 7 дней' : 'Premium Access · Gigabyte Network'}
                  </span>
                  <span className="font-bold text-[11px] shrink-0">×1</span>
                </div>
              </div>

              <ReceiptRow k="Способ оплаты" v={methodLabel} />
              {payment.tx_hash && (
                <div className="flex flex-col border-b border-dashed border-black/10 pb-1.5">
                  <span className="opacity-45 font-bold mb-0.5 uppercase">ID транзакции:</span>
                  <span className="font-bold break-all opacity-75 text-[9px] leading-relaxed">{payment.tx_hash}</span>
                </div>
              )}
              <div className="flex justify-between pb-1">
                <span className="opacity-45 font-bold uppercase">Статус:</span>
                <span className="font-black uppercase text-green-700 tracking-wider">✓ Успешно завершено</span>
              </div>

              <div className="pt-4 pb-1 flex items-end justify-between border-t-2 border-[#1a1a1a]/15 mt-2">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] mb-1 opacity-60">Итого оплачено</span>
                  <div className="text-[36px] font-black tracking-tighter leading-none">
                    {isFree(payment) ? '₽0.00' : `₽${payment.amount_rub}.00`}
                  </div>
                </div>
                <div className="bg-white p-1.5 border border-black/10 rounded-[6px]">
                  <QRCodeSVG value={`GIGABYTE:${uid}`} size={64} level="M" fgColor="#1a1a1a" bgColor="transparent" />
                </div>
              </div>

              <div className="pt-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                  — Спасибо, что выбрали нас! —
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div className="flex-1 text-[8px] font-mono opacity-40 leading-relaxed self-center">
                {uid.toUpperCase()}
                <br />
                SIGNED · GIGABYTE NETWORK
              </div>

              {/* Печать «шлёпается» на чек с пружинной анимацией */}
              <motion.div
                initial={{ scale: 2.4, opacity: 0, rotate: -32 }}
                animate={{ scale: 0.85, opacity: 0.85, rotate: -12 }}
                transition={{ type: 'spring', damping: 14, stiffness: 300, delay: 0.4 }}
                className="relative w-[104px] h-[104px] flex items-center justify-center select-none mix-blend-multiply shrink-0"
              >
                <div
                  className="absolute inset-0 border-[3px] border-double border-red-800/60 rounded-full"
                  style={{
                    WebkitMaskImage: 'radial-gradient(circle, black 60%, rgba(0,0,0,0.4) 100%)',
                    maskImage: 'radial-gradient(circle, black 60%, rgba(0,0,0,0.4) 100%)',
                  }}
                />
                <div className="absolute inset-[6px] border-[1.5px] border-dashed border-red-800/50 rounded-full" />
                <div className="flex flex-col items-center text-red-800/70 z-10 w-full px-2 text-center">
                  <div className="text-[11px] font-black tracking-[0.25em] uppercase font-serif mb-1 mt-1">GIGABYTE</div>
                  <div className="w-[80%] h-px bg-red-800/30 my-0.5" />
                  <div className="text-[7.5px] font-bold tracking-[0.15em] uppercase font-serif my-0.5">APPROVED</div>
                  <div className="w-[80%] h-px bg-red-800/30 my-0.5" />
                  <div className="text-[7px] font-medium font-mono mt-1 opacity-90">
                    {new Date(payment.created_at || new Date()).toLocaleDateString(locale)}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
          <ReceiptEdge flip />

          <div className="flex justify-center mt-7 w-full shrink-0">
            <button
              onClick={onClose}
              className="w-[64px] h-[64px] glass rounded-full flex items-center justify-center text-white active:scale-90 transition-all"
              aria-label={t('common.close')}
            >
              <X className="w-7 h-7" />
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Копируемая строка реквизитов
const PayCopyRow = ({ label, value }: { label: string; value: string }) => {
  const { copy, isCopied } = useCopy();
  const copied = isCopied('row');
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider px-2">{label}</span>
      <button
        onClick={() => copy(value, 'row')}
        className="glass-inner rounded-full px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left relative overflow-hidden"
      >
        <span className={cn('flex-1 text-[14px] font-mono text-white/90 break-all transition-all', copied && 'opacity-0')}>
          {value}
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center text-[14px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-opacity duration-300',
            copied && 'opacity-100',
          )}
        >
          {t('dash.copiedBig')}
        </span>
        <span className="shrink-0 relative z-10">
          {copied ? <Check className="w-4 h-4 text-[#32D74B]" /> : <Copy className="w-4 h-4 text-[#0A84FF]" />}
        </span>
      </button>
    </div>
  );
};

// Полноэкранная страница оплаты для незавершённого крипто-заказа:
// все реквизиты (QR, кошелёк, сумма, контракт) + отправка TXID.
const CryptoPayPage = ({
  payment,
  wallet,
  contracts,
  onClose,
  onDone,
}: {
  payment: Payment;
  wallet: string;
  contracts: { USDT: string; USDC: string };
  onClose: () => void;
  onDone: (r: HashResult) => void;
}) => {
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^0x[0-9a-fA-F]{64}$/.test(hash.trim());
  const currency = (payment.currency as 'USDT' | 'USDC') || 'USDT';
  const contract = contracts[currency] || contracts.USDT;
  const amount = Number(payment.amount_usd || 0);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await api.submitHash(payment.id, hash.trim());
      onDone(result);
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || t('common.error'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex flex-col bg-[#050507] overflow-y-auto hidden-scrollbar">
      <div
        className="px-4 pb-10 flex flex-col gap-5"
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 6px), 14px)',
        }}
      >
        <header className="flex items-center gap-3">
          <button
            onClick={() => !busy && onClose()}
            className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div>
            <h1 className="text-[24px] font-bold tracking-tight leading-tight">
              {t('dash.payCrypto')} {currency}
            </h1>
            <div className="text-[13px] text-[#8E8E93]">
              {payment.payment_uid || payment.id} · 24h
            </div>
          </div>
        </header>

        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-4 rounded-[28px]">
            <QRCodeSVG value={wallet} size={168} level="M" />
          </div>
          <div className="text-center">
            <div className="text-[30px] font-bold text-white font-mono leading-none">
              {amount.toFixed(2)} {currency}
            </div>
            <div className="text-[13px] text-[#8E8E93] mt-1.5">
              ≈ {Math.round(Number(payment.amount_rub || 0))} ₽ · Arbitrum One
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <PayCopyRow label="Кошелёк для перевода" value={wallet} />
          <PayCopyRow label={`Сумма (${currency})`} value={amount.toFixed(2)} />
          <PayCopyRow label="Контракт токена" value={contract} />
        </div>

        <div className="glass rounded-3xl p-4 text-[13px] text-[#FF9F0A] leading-snug">
          ⚠️ Отправьте точную сумму в сети Arbitrum One. После перевода вставьте TXID (хеш транзакции) ниже —
          проверка автоматическая.
        </div>

        <div className="flex flex-col gap-3">
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="TXID: 0x…"
            className="w-full h-[52px] glass rounded-full px-5 text-[14px] font-mono text-white placeholder:text-white/25 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="w-full py-4 btn-primary rounded-full text-white font-bold text-[16px] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                Проверяем в блокчейне…
              </>
            ) : (
              <>
                <Send className="w-5 h-5" /> Я оплатил — проверить
              </>
            )}
          </button>
          {busy && (
            <div className="text-[12px] text-[#8E8E93] text-center">
              Проверка занимает до 40 секунд, не закрывайте экран
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
//  Реферальная программа — полноэкранная страница
// ============================================================
const RefStat = ({ value, label }: { value: number | string; label: string }) => (
  <div className="flex-1 glass-inner rounded-3xl py-3.5 px-3 text-center">
    <div className="text-[22px] font-bold text-white leading-none">{value}</div>
    <div className="text-[11.5px] text-[#8E8E93] font-medium uppercase tracking-wider mt-1.5">{label}</div>
  </div>
);

const reasonLabel = (reason: string) => {
  if (reason === 'referral_signup') return t('ref.txSignup');
  if (reason === 'referral_purchase') return t('ref.txPurchase');
  if (reason === 'redeem') return t('ref.txRedeem');
  return reason;
};

const ReferralPage = ({
  subs,
  onClose,
  onRedeemed,
}: {
  subs: Subscription[];
  onClose: () => void;
  onRedeemed: () => void;
}) => {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const { copy, isCopied } = useCopy();
  const copied = isCopied('ref');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.referral().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeSub = subs.find((s) => s.status === 'active' && s.expiry_date !== 0);
  const canRedeem = data ? data.points >= data.redeem_cost : false;

  const copyLink = () => {
    if (!data) return;
    copy(data.link, 'ref');
  };

  const share = () => {
    if (!data) return;
    hapticFeedback.impactOccurred('light');
    const url = `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(t('ref.shareText'))}`;
    try {
      tg.openTelegramLink(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const redeem = async () => {
    if (!data || !canRedeem || busy) return;
    setBusy(true);
    try {
      await api.referralRedeem(activeSub ? { sub_id: activeSub.sub_id } : {});
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(t('ref.redeemedOk'));
      load();
      onRedeemed();
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[150] flex flex-col bg-[#050507]"
    >
      <div
        className="shrink-0 flex items-center gap-3 px-4 pb-3"
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 10px), 20px)',
        }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <SectionTitle className="mb-0 ml-0">{t('ref.title')}</SectionTitle>
      </div>

      <div className="overflow-y-auto hidden-scrollbar flex-1 px-4 pt-3 pb-16 flex flex-col gap-5">
        {!data ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-7 h-7 border-2 border-white/20 border-t-white rounded-full" />
          </div>
        ) : (
          <>
            {/* Баланс + прогресс до бесплатного месяца.
                shrink-0 + overflow видимый: в скролл-контейнере (flex-col)
                карточки по умолчанию сжимаются по высоте, из-за чего крупное
                число раньше обрезалось. Здесь фикс: не сжимаем и не режем.
                Свечение — радиальным градиентом в фоне (не требует clip). */}
            <div
              className="shrink-0 relative rounded-[32px] p-6 border border-white/10"
              style={{
                background:
                  'radial-gradient(130% 130% at 100% 0%, rgba(191,90,242,0.22), transparent 55%), linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 app-icon bg-gradient-to-b from-[#BF5AF2]/50 to-[#BF5AF2]/15 rounded-full flex items-center justify-center shrink-0">
                    <Gift className="w-7 h-7 text-[#D7A8FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider">
                      {t('ref.balance')}
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-[38px] font-bold text-white leading-[1.15]">{data.points}</span>
                      <span className="text-[15px] text-[#8E8E93] font-medium">{t('ref.points')}</span>
                    </div>
                  </div>
                </div>

                {/* Прогресс-бар до REF_REDEEM_COST баллов */}
                {(() => {
                  const pct = Math.min(100, Math.round((data.points / data.redeem_cost) * 100));
                  const left = Math.max(0, data.redeem_cost - data.points);
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-[12.5px] font-medium">
                        <span className="text-[#8E8E93]">{t('ref.progress')}</span>
                        <span className={cn(left === 0 ? 'text-[#32D74B]' : 'text-white/70')}>
                          {left === 0 ? t('ref.readyRedeem') : t('ref.progressLeft', { n: left })}
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: 'spring', damping: 26, stiffness: 120 }}
                          className="h-full rounded-full"
                          style={{
                            background: 'linear-gradient(90deg, #BF5AF288, #BF5AF2)',
                            boxShadow: '0 0 12px rgba(191,90,242,0.5)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Мотивационный подзаголовок */}
            <div className="flex items-center gap-3 px-1">
              <Sparkles className="w-5 h-5 text-[#FFD60A] shrink-0" />
              <span className="text-[15px] text-white/85 font-medium leading-snug">{t('ref.hero')}</span>
            </div>

            {/* Как это работает */}
            <section>
              <SectionTitle>{t('ref.how')}</SectionTitle>
              <div className="ios-list p-5 flex flex-col gap-3.5">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 glass-inner rounded-full flex items-center justify-center shrink-0">
                    <Users2 className="w-4.5 h-4.5 text-[#4DA6FF]" />
                  </div>
                  <span className="flex-1 text-[14.5px] text-white/90 leading-snug">{t('ref.rule1')}</span>
                </div>
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 glass-inner rounded-full flex items-center justify-center shrink-0">
                    <CreditCard className="w-4.5 h-4.5 text-[#32D74B]" />
                  </div>
                  <span className="flex-1 text-[14.5px] text-white/90 leading-snug">{t('ref.rule2')}</span>
                  <span className="text-[15px] font-bold text-[#32D74B] shrink-0">+{data.points_purchase}</span>
                </div>
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 glass-inner rounded-full flex items-center justify-center shrink-0">
                    <Sparkles className="w-4.5 h-4.5 text-[#FFD60A]" />
                  </div>
                  <span className="flex-1 text-[14.5px] text-white/90 leading-snug">
                    {data.redeem_cost} {t('ref.points')} = {data.redeem_months} {t('ref.rule3')}
                  </span>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-white/[0.06] mt-1">
                  <span className="text-[12px] text-[#8E8E93] leading-snug">{t('ref.onlyPaid')}</span>
                </div>
              </div>
            </section>

            {/* Ссылка */}
            <section>
              <SectionTitle>{t('ref.yourLink')}</SectionTitle>
              <div className="flex flex-col gap-3">
                <button
                  onClick={copyLink}
                  className="bg-black/20 border border-white/[0.05] rounded-full p-3 pl-4 flex items-center gap-3 active:scale-[0.98] transition-transform relative overflow-hidden"
                >
                  <div
                    className={cn(
                      'flex-1 truncate font-mono text-[13.5px] text-[#0A84FF] opacity-90 text-left transition-all',
                      copied && 'opacity-0 translate-y-2',
                    )}
                  >
                    {data.link}
                  </div>
                  <div
                    className={cn(
                      'absolute inset-0 flex items-center justify-center text-[14px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-all duration-300',
                      copied && 'opacity-100',
                    )}
                  >
                    {t('dash.copiedBig')}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#0A84FF]/10 flex items-center justify-center shrink-0 relative z-10">
                    {copied ? <Check className="w-5 h-5 text-[#32D74B]" /> : <Copy className="w-4 h-4 text-[#0A84FF]" />}
                  </div>
                </button>
                <button
                  onClick={share}
                  className="w-full py-3.5 btn-primary rounded-full text-white font-bold text-[16px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  <Share2 className="w-5 h-5" /> {t('ref.share')}
                </button>
              </div>
            </section>

            {/* Статистика */}
            <div className="flex gap-3 shrink-0">
              <RefStat value={data.invited_total} label={t('ref.invited')} />
              <RefStat value={data.invited_paid} label={t('ref.paidFriends')} />
            </div>

            {/* Обмен баллов */}
            <section>
              <div className="ios-list p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-[16px] font-bold text-white">{t('ref.redeem')}</div>
                  <div className="text-[14px] font-semibold text-[#8E8E93]">
                    {data.redeem_cost} {t('ref.points')}
                  </div>
                </div>
                <div className="text-[13px] text-[#8E8E93] leading-snug">
                  {activeSub
                    ? `${t('ref.redeemExtend')}: ${activeSub.server.flag ?? ''} ${activeSub.server.name} · +${data.redeem_months} мес`
                    : t('ref.redeemNew')}
                </div>
                <button
                  onClick={redeem}
                  disabled={!canRedeem || busy}
                  className={cn(
                    'w-full py-3.5 rounded-full font-bold text-[16px] active:scale-[0.98] transition-all flex items-center justify-center gap-2',
                    canRedeem ? 'btn-primary text-white' : 'bg-white/[0.06] text-white/40',
                  )}
                >
                  {busy ? (
                    <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                  ) : canRedeem ? (
                    <>
                      <Sparkles className="w-5 h-5" /> {t('ref.redeem')}
                    </>
                  ) : (
                    `${t('ref.notEnough')} · ${data.points}/${data.redeem_cost}`
                  )}
                </button>
              </div>
            </section>

            {/* История начислений */}
            <section>
              <SectionTitle>{t('ref.historyTitle')}</SectionTitle>
              {data.history.length === 0 ? (
                <div className="ios-list p-6 text-center text-[14px] text-[#8E8E93]">{t('ref.historyEmpty')}</div>
              ) : (
                <div className="ios-list">
                  {data.history.map((h, i) => (
                    <div key={i} className="ios-list-item">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-medium text-white">{reasonLabel(h.reason)}</span>
                        <span className="text-[12.5px] text-[#8E8E93]">
                          {new Date(h.created_at).toLocaleString(locale, {
                            day: 'numeric',
                            month: 'long',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[16px] font-bold font-mono',
                          h.delta > 0 ? 'text-[#32D74B]' : 'text-[#FF9F0A]',
                        )}
                      >
                        {h.delta > 0 ? `+${h.delta}` : h.delta}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </motion.div>
  );
};

// ============================================================
//  История транзакций — статусы, фильтры, итоги
// ============================================================
type HistFilter = 'all' | 'paid' | 'free' | 'cancelled';

const statusMeta = (p: Payment): { label: string; cls: string } => {
  const s = p.status || 'completed';
  if (s === 'completed') return { label: t('hist.stDone'), cls: 'bg-[#32D74B]/15 text-[#32D74B]' };
  // Отменённый и просроченный — разные вещи: первое сделал сам человек,
  // второе случилось само через сутки без оплаты.
  if (s === 'cancelled') return { label: t('hist.stCancelled'), cls: 'bg-white/[0.08] text-white/55' };
  if (s === 'expired') return { label: t('hist.stExpired'), cls: 'bg-[#FF9F0A]/15 text-[#FF9F0A]' };
  if (s === 'failed') return { label: t('hist.stFailed'), cls: 'bg-[#FF453A]/15 text-[#FF6961]' };
  return { label: t('hist.stProcessing'), cls: 'bg-[#0A84FF]/15 text-[#4DA6FF]' };
};

export default function Dashboard() {
  const { boot, refreshBoot } = useApp();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [pending, setPending] = useState<Payment[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const { copiedId, copy } = useCopy();
  const [activeModal, setActiveModal] = useState<'history' | 'referral' | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [hashPayment, setHashPayment] = useState<Payment | null>(null);
  const [qrSub, setQrSub] = useState<Subscription | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [remindersOn, setRemindersOn] = useState(boot.reminders_enabled !== false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [qrShareBusy, setQrShareBusy] = useState(false);
  const [histFilter, setHistFilter] = useState<HistFilter>('all');

  // ВАЖНО: только после объявления всех состояний выше — иначе обращение к
  // ещё не инициализированным const'ам роняет компонент (temporal dead zone).
  useLockBodyScroll(!!(activeModal || qrSub || confirmDelete || selectedReceipt || legal));

  const fetchData = useCallback(async () => {
    try {
      const [subsData, paysData] = await Promise.all([api.subscriptions(), api.payments()]);
      setSubs(subsData);
      setPending(paysData.pending);
      setHistory(paysData.history);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Обновляем данные при возврате в приложение (Telegram не перемонтирует
  // WebView), чтобы изменения статуса подписки появлялись сразу.
  useAutoRefresh(() => {
    fetchData();
    refreshBoot();
  });

  // блокировка фона под модалками — см. useLockBodyScroll ниже

  // Колокольчик: вкл/выкл напоминаний от бота (за 24 ч и за 1 ч до отключения)
  const toggleReminders = async () => {
    if (remindersBusy) return;
    setRemindersBusy(true);
    const next = !remindersOn;
    try {
      await api.setReminders(next);
      setRemindersOn(next);
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(next ? t('dash.remindOn') : t('dash.remindOff'));
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || t('common.error'));
    } finally {
      setRemindersBusy(false);
    }
  };

  // Скачивание QR-кода подписки как PNG-картинки
  const downloadQr = (sub: Subscription) => {
    if (!sub.qr_url) return;
    hapticFeedback.impactOccurred('light');
    const url = `${apiBase || window.location.origin}${sub.qr_url}`;
    const started = downloadFile(url, 'gigabyte-vpn-qr.png');
    if (!started) {
      try {
        tg.openLink(url);
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  // Отправка QR в чат с ботом — оттуда можно переслать или сохранить
  const shareQr = async (sub: Subscription) => {
    if (qrShareBusy) return;
    setQrShareBusy(true);
    try {
      await api.shareSubQr(sub.sub_id);
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(t('dash.qrSent'));
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || t('common.error'));
    } finally {
      setQrShareBusy(false);
    }
  };

  const payStars = async (p: Payment) => {
    try {
      hapticFeedback.impactOccurred('light');
      const { invoice_link } = await api.paymentInvoice(p.id);
      const status = await openInvoice(invoice_link);
      if (status === 'paid') {
        hapticFeedback.notificationOccurred('success');
        tg.showAlert(t('dash.starsPaid'));
        setTimeout(fetchData, 1500);
      }
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
    }
  };

  const removePayment = async (p: Payment) => {
    try {
      await api.deletePayment(p.id);
      hapticFeedback.notificationOccurred('success');
      fetchData();
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
    }
  };

  const onHashDone = (r: HashResult) => {
    setHashPayment(null);
    if (r.verified) {
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(
        r.extended
          ? '✅ Оплата подтверждена, подписка продлена!'
          : '🎉 Оплата подтверждена! Подписка активирована.',
      );
      fetchData();
    } else {
      hapticFeedback.notificationOccurred('warning');
      tg.showAlert(`⏳ ${r.reason || 'Транзакция пока не найдена'}. Попробуйте ещё раз через минуту.`);
    }
  };

  const deleteAccount = async () => {
    try {
      await api.deleteAccount();
      setConfirmDelete(false);
      tg.showAlert(t('dash.deleted'));
      setTimeout(() => tg.close?.(), 1200);
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
    }
  };

  // История с учётом выбранного фильтра + итоговые суммы
  const filteredHistory = useMemo(() => {
    return history.filter((p) => {
      if (histFilter === 'paid') return !isFree(p) && p.status === 'completed';
      if (histFilter === 'free') return isFree(p) && p.status === 'completed';
      if (histFilter === 'cancelled') return p.status !== 'completed';
      return true;
    });
  }, [history, histFilter]);

  const totalPaid = useMemo(
    () =>
      history
        .filter((p) => p.status === 'completed' && !isFree(p))
        .reduce((sum, p) => sum + Number(p.amount_rub || 0), 0),
    [history],
  );

  const filters: { id: HistFilter; label: string }[] = [
    { id: 'all', label: t('hist.all') },
    { id: 'paid', label: t('hist.paid') },
    { id: 'free', label: t('hist.free') },
    { id: 'cancelled', label: t('hist.cancelled') },
  ];

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in fade-in duration-500 pb-8">
      {/* ---- Подписки ---- */}
      <section>
        <SectionTitle className="mt-2">{t('dash.mySubs')}</SectionTitle>
        {loading ? (
          <div className="ios-list p-6 text-center text-[#8E8E93] flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
          </div>
        ) : subs.length === 0 ? (
          <div className="ios-list p-8 text-center">
            <div className="w-14 h-14 bg-[#2C2C2E] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/[0.08]">
              <Clock className="w-7 h-7 text-[#8E8E93]" />
            </div>
            <div className="text-[19px] font-semibold text-white mb-2">{t('dash.noSubs')}</div>
            <div className="text-[15px] text-[#8E8E93] px-4 mb-5">{t('dash.noSubsHint')}</div>
            <button
              onClick={() => navigate('/buy')}
              className="px-8 py-3 btn-primary rounded-full text-white font-semibold text-[16px] active:scale-95 transition-transform"
            >
              {t('dash.buySub')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {subs.map((sub) => {
              const isActive = sub.status === 'active';
              // Ссылка может обслуживать несколько стран (напр. Франция+Финляндия) —
              // показываем все флаги и названия, а не одно.
              const countries = sub.countries && sub.countries.length ? sub.countries : [sub.server];
              return (
                <div key={sub.id} className="ios-list overflow-hidden relative group">
                  <div className="p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#0A84FF]/10 blur-3xl rounded-full translate-x-10 -translate-y-10 pointer-events-none" />
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col gap-1">
                          {countries.length === 1 ? (
                            <div className="text-[22px] font-bold text-white tracking-tight flex items-center gap-2">
                              {countries[0].flag} {countries[0].name}
                            </div>
                          ) : (
                            <>
                              {/* Одна ссылка обслуживает несколько стран — показываем
                                  их отдельными чипами, а не строкой через разделитель */}
                              <div className="text-[22px] font-bold text-white tracking-tight flex items-center gap-2">
                                <span className="text-[19px]">🌍</span>
                                {t('dash.multiRegion')}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {countries.map((c, i) => (
                                  <span
                                    key={c.id ?? i}
                                    className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-white/[0.07] border border-white/[0.07] text-[13px] font-semibold text-white/85"
                                  >
                                    <span className="text-[14px] leading-none">{c.flag}</span>
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className={cn(
                                'w-2.5 h-2.5 rounded-full',
                                isActive
                                  ? 'bg-[#32D74B] shadow-[0_0_12px_rgba(50,215,75,0.8)] dot-pulse'
                                  : 'bg-[#FF453A]',
                              )}
                            />
                            <div
                              className={cn(
                                'text-[15px] font-semibold tracking-wide uppercase',
                                isActive ? 'text-[#32D74B]' : 'text-[#FF453A]',
                              )}
                            >
                              {isActive ? t('dash.active') : t('dash.expired')}
                            </div>
                          </div>
                        </div>
                        {isActive && (
                          <div className="flex gap-2">
                            <button
                              onClick={toggleReminders}
                              disabled={remindersBusy}
                              className={cn(
                                'w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform',
                                remindersBusy && 'opacity-50',
                              )}
                              aria-label="Reminders"
                            >
                              {remindersOn ? (
                                <BellRing className="w-5 h-5 text-[#FF9F0A]" />
                              ) : (
                                <BellOff className="w-5 h-5 text-white/40" />
                              )}
                            </button>
                            {sub.sub_link && (
                              <button
                                onClick={() => {
                                  hapticFeedback.impactOccurred('light');
                                  setQrSub(sub);
                                }}
                                className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
                              >
                                <QrCode className="w-5 h-5 text-white/70" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {isActive && (
                        <div className="flex items-end justify-between mt-3 gap-3">
                          <div className="flex flex-col">
                            <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-0.5">
                              {t('dash.timeLeft')}
                            </span>
                            <CountdownTimer expiryMs={sub.expiry_date} />
                          </div>
                          <SubTraffic subId={sub.sub_id} />
                        </div>
                      )}
                    </div>
                  </div>

                  {isActive && sub.sub_link ? (
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] text-[#8E8E93] font-medium px-1">{t('dash.subLink')}</span>
                        <div
                          className="bg-black/20 border border-white/[0.05] rounded-full p-3 flex items-center gap-3 cursor-pointer group active:scale-[0.98] transition-transform pl-4 relative overflow-hidden"
                          onClick={() => copy(sub.sub_link!, `sub${sub.id}`)}
                        >
                          {/* В плашке показываем только схему и домен: порт и
                              путь — служебные подробности, они лишь засоряют
                              строку. Копируется при этом полная ссылка. */}
                          <div
                            className={cn(
                              'flex-1 truncate font-mono text-[14px] text-[#0A84FF] opacity-90 transition-all',
                              copiedId === `sub${sub.id}` && 'opacity-0 translate-y-2',
                            )}
                          >
                            {linkOrigin(sub.sub_link!)}
                          </div>
                          <div
                            className={cn(
                              'absolute inset-0 flex items-center justify-center text-[14px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-all duration-300',
                              copiedId === `sub${sub.id}` && 'opacity-100 translate-y-0',
                            )}
                          >
                            {t('dash.copiedBig')}
                          </div>
                          <div className="w-9 h-9 rounded-full bg-[#0A84FF]/10 flex items-center justify-center shrink-0 relative z-10">
                            {copiedId === `sub${sub.id}` ? (
                              <Check className="w-5 h-5 text-[#32D74B]" />
                            ) : (
                              <Copy className="w-4 h-4 text-[#0A84FF]" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ID клиента в панели — пользователь называет его в поддержке */}
                      {sub.email && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[13px] text-[#8E8E93] font-medium px-1">
                            {t('dash.clientId')}
                          </span>
                          <button
                            onClick={() => copy(sub.email!, `mail${sub.id}`)}
                            className="bg-black/20 border border-white/[0.05] rounded-full py-2.5 pl-4 pr-3 flex items-center gap-3 active:scale-[0.98] transition-transform relative overflow-hidden"
                          >
                            <span
                              className={cn(
                                'flex-1 text-left truncate font-mono text-[14px] text-white/80 transition-all',
                                copiedId === `mail${sub.id}` && 'opacity-0 translate-y-2',
                              )}
                            >
                              {sub.email}
                            </span>
                            <span
                              className={cn(
                                'absolute inset-0 flex items-center justify-center text-[14px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-all duration-300',
                                copiedId === `mail${sub.id}` && 'opacity-100',
                              )}
                            >
                              {t('dash.copiedBig')}
                            </span>
                            <span className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 relative z-10">
                              {copiedId === `mail${sub.id}` ? (
                                <Check className="w-4 h-4 text-[#32D74B]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-white/50" />
                              )}
                            </span>
                          </button>
                          <span className="text-[12px] text-[#8E8E93]/70 px-1 leading-snug">
                            {t('dash.clientIdHint')}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          hapticFeedback.selectionChanged();
                          navigate(`/buy?extend=${sub.sub_id}`);
                        }}
                        className="w-full py-3 bg-white/[0.06] rounded-full text-[#0A84FF] font-semibold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" /> {t('dash.extend')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        hapticFeedback.selectionChanged();
                        navigate('/buy');
                      }}
                      className="ios-list-item w-full bg-[#FF453A]/5 border-t border-white/5"
                    >
                      <span className="text-[15px] font-medium text-[#FF453A] w-full text-center">
                        {t('dash.expiredCta')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Ожидающие платежи ---- */}
      {pending.length > 0 && (
        <section>
          <SectionTitle>{t('dash.pending')}</SectionTitle>
          <div className="ios-list overflow-hidden">
            {pending.map((p, index) => (
              <div
                key={p.id}
                className={cn(
                  'p-4 flex flex-col gap-3',
                  index !== pending.length - 1 && 'border-b border-white/[0.08]',
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-[42px] h-[42px] bg-[#FF9500]/20 rounded-full flex items-center justify-center shrink-0 border border-[#FF9500]/30 shadow-[0_4px_12px_rgba(255,149,0,0.15)]">
                    <Clock className="w-5 h-5 text-[#FF9500]" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white text-[17px] tracking-tight">
                      {p.method === 'stars' ? t('dash.payStars') : `${t('dash.payCrypto')} ${p.currency || ''}`} · ₽
                      {p.amount_rub}
                    </div>
                    <div className="text-[14px] text-[#8E8E93] font-medium mt-0.5">
                      {p.status === 'awaiting_hash'
                        ? t('dash.awaitTxid')
                        : p.status === 'pending_stars'
                          ? t('dash.awaitStars')
                          : t('dash.awaitTransfer')}
                    </div>
                  </div>
                  <button
                    onClick={() => removePayment(p)}
                    className="w-9 h-9 bg-white/[0.05] rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Trash2 className="w-4 h-4 text-[#FF453A]/80" />
                  </button>
                </div>
                {p.status === 'pending_stars' ? (
                  <button
                    onClick={() => payStars(p)}
                    className="w-full py-3 btn-primary rounded-full text-white font-semibold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                  >
                    <Star className="w-4 h-4" /> {t('dash.payStarsBtn')}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      hapticFeedback.selectionChanged();
                      setHashPayment(p);
                    }}
                    className="w-full py-3 btn-primary rounded-full text-white font-semibold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                  >
                    <Wallet2 className="w-4 h-4" /> {t('dash.payDetails')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Рефералка + история ---- */}
      <section>
        <div className="ios-list overflow-hidden">
          <button
            onClick={() => {
              hapticFeedback.selectionChanged();
              setActiveModal('referral');
            }}
            className="ios-list-item w-full group hover:bg-[#2C2C2E] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-[42px] h-[42px] bg-[#BF5AF2]/20 rounded-full flex items-center justify-center border border-[#BF5AF2]/30 shadow-[0_4px_12px_rgba(191,90,242,0.15)]">
                <Gift className="w-5 h-5 text-[#D7A8FF]" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-white text-[17px] tracking-tight">{t('ref.card')}</span>
                <span className="text-[13px] text-[#8E8E93]">{t('ref.cardHint')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(boot.ref_points ?? 0) > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-[#BF5AF2]/15 text-[#D7A8FF] text-[13px] font-bold">
                  {boot.ref_points}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
            </div>
          </button>
          <button
            onClick={() => {
              hapticFeedback.selectionChanged();
              setActiveModal('history');
            }}
            className="ios-list-item w-full group hover:bg-[#2C2C2E] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-[42px] h-[42px] bg-[#32D74B]/20 rounded-full flex items-center justify-center border border-[#32D74B]/30 shadow-[0_4px_12px_rgba(50,215,75,0.15)]">
                <CreditCard className="w-5 h-5 text-[#32D74B]" />
              </div>
              <span className="font-semibold text-white text-[17px] tracking-tight">{t('dash.history')}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
        </div>
      </section>

      {/* ---- Документы и аккаунт ---- */}
      <section>
        <SectionTitle>{t('dash.account')}</SectionTitle>
        <div className="ios-list overflow-hidden">
          <button onClick={() => { hapticFeedback.selectionChanged(); setLegal('terms'); }} className="ios-list-item w-full">
            <div className="flex items-center gap-4">
              <FileText className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[16px] text-white font-medium">{t('terms.offer')}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
          <button onClick={() => { hapticFeedback.selectionChanged(); setLegal('privacy'); }} className="ios-list-item w-full">
            <div className="flex items-center gap-4">
              <Lock className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[16px] text-white font-medium">{t('terms.privacy')}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
          {!boot.is_admin && (
            <button onClick={() => setConfirmDelete(true)} className="ios-list-item w-full">
              <div className="flex items-center gap-4">
                <Trash2 className="w-5 h-5 text-[#FF453A]" />
                <span className="text-[16px] text-[#FF453A] font-medium">{t('dash.deleteAccount')}</span>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* ---- Юридические документы (в приложении) ---- */}
      <AnimatePresence>
        {legal && (
          <Legal
            kind={legal}
            doc={legal === 'terms' ? TERMS[LANG] : PRIVACY[LANG]}
            onClose={() => setLegal(null)}
          />
        )}
      </AnimatePresence>

      {/* ---- Модалка QR подписки: показать, скачать, поделиться ---- */}
      <AnimatePresence>
        {qrSub && qrSub.sub_link && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-md px-8"
            onClick={() => setQrSub(null)}
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              className="flex flex-col items-center gap-4 w-full max-w-[340px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-[32px] p-6 flex flex-col items-center gap-4 w-full">
                <QRCodeSVG
                  value={qrSub.sub_link}
                  size={228}
                  level="H"
                  imageSettings={{ src: logoUrl, height: 46, width: 46, excavate: true }}
                />
                <div className="text-[13px] text-black/60 font-medium text-center">{t('dash.qrScan')}</div>
              </div>
              <div className="flex gap-3 w-full">
                {qrSub.qr_url && (
                  <button
                    onClick={() => downloadQr(qrSub)}
                    className="flex-1 py-3.5 btn-glass rounded-full text-white font-semibold text-[15px] active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                  >
                    <Download className="w-4.5 h-4.5" /> {t('dash.qrDownload')}
                  </button>
                )}
                <button
                  onClick={() => shareQr(qrSub)}
                  disabled={qrShareBusy}
                  className="flex-1 py-3.5 btn-primary rounded-full text-white font-semibold text-[15px] active:scale-[0.97] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {qrShareBusy ? (
                    <div className="animate-spin w-4.5 h-4.5 border-2 border-white/30 border-t-white rounded-full" />
                  ) : (
                    <>
                      <Share2 className="w-4.5 h-4.5" /> {t('dash.qrShare')}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Модалка подтверждения удаления ---- */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 backdrop-blur-md px-6"
            onClick={() => setConfirmDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass-sheet rounded-[36px] p-6 w-full max-w-[360px] border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center gap-3 mb-5">
                <div className="w-14 h-14 bg-[#FF453A]/15 rounded-full flex items-center justify-center border border-[#FF453A]/30">
                  <AlertTriangle className="w-7 h-7 text-[#FF453A]" />
                </div>
                <div className="text-[19px] font-bold text-white">{t('dash.deleteTitle')}</div>
                <div className="text-[14px] text-[#8E8E93] leading-snug">{t('dash.deleteText')}</div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={deleteAccount}
                  className="w-full py-3.5 btn-danger rounded-full text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
                >
                  {t('dash.deleteConfirm')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="w-full py-3.5 btn-glass rounded-full text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Модалка TXID ---- */}
      <AnimatePresence>
        {hashPayment && (
          <CryptoPayPage
            payment={hashPayment}
            wallet={boot.wallet}
            contracts={boot.contracts}
            onClose={() => setHashPayment(null)}
            onDone={onHashDone}
          />
        )}
      </AnimatePresence>

      {/* ---- Реферальная программа ---- */}
      <AnimatePresence>
        {activeModal === 'referral' && (
          <ReferralPage
            subs={subs}
            onClose={() => setActiveModal(null)}
            onRedeemed={() => fetchData()}
          />
        )}
      </AnimatePresence>

      {/* ---- История транзакций: полноэкранная страница ---- */}
      <AnimatePresence>
        {activeModal === 'history' && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[150] flex flex-col bg-[#050507]"
          >
            <div
              className="shrink-0 flex items-center gap-3 px-4 pb-3"
              style={{
                paddingTop:
                  'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 6px), 14px)',
              }}
            >
              <button
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  setActiveModal(null);
                }}
                className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <div>
                <SectionTitle className="mb-0 ml-0">{t('hist.title')}</SectionTitle>
                <div className="text-[13px] text-[#8E8E93] mt-0.5">
                  {history.length} {t('hist.opsTotal')}
                </div>
              </div>
            </div>

            {/* Итог + фильтры */}
            <div className="shrink-0 px-4 pt-1 pb-3 flex flex-col gap-3">
              <div className="ios-list px-5 py-4 flex items-center justify-between">
                <span className="text-[13px] text-[#8E8E93] font-medium uppercase tracking-wider">
                  {t('hist.spentTotal')}
                </span>
                <span className="text-[22px] font-bold text-white font-mono">
                  ₽{totalPaid.toLocaleString(locale)}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto hidden-scrollbar -mx-4 px-4">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      hapticFeedback.selectionChanged();
                      setHistFilter(f.id);
                    }}
                    className={cn(
                      'px-4 py-2 rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-all active:scale-95',
                      histFilter === f.id ? 'btn-primary text-white' : 'glass-inner text-white/60',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto hidden-scrollbar flex-1 px-4 pt-1 relative">
              {filteredHistory.length > 0 ? (
                <div className="flex flex-col gap-4 pb-10">
                  {filteredHistory.map((p) => {
                    const meta = statusMeta(p);
                    const done = p.status === 'completed';
                    return (
                      <div
                        key={p.id}
                        className="glass border border-white/[0.05] rounded-[28px] overflow-hidden shadow-sm"
                      >
                        <div className="p-4 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.02]">
                          <div className="flex items-center gap-3.5">
                            <div
                              className={cn(
                                'w-11 h-11 rounded-full flex items-center justify-center shrink-0',
                                !done
                                  ? 'bg-white/[0.06] text-white/40'
                                  : isFree(p)
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : p.method === 'stars'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : 'bg-[#32D74B]/20 text-[#32D74B]',
                              )}
                            >
                              {isFree(p) ? (
                                <Zap className="w-5 h-5" />
                              ) : p.method === 'stars' ? (
                                <CreditCard className="w-5 h-5" />
                              ) : (
                                <RefreshCw className="w-5 h-5" />
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <div className="font-semibold text-[17px] text-white tracking-tight leading-none">
                                {isFree(p)
                                  ? t('hist.trial')
                                  : p.method === 'stars'
                                    ? 'Telegram Stars'
                                    : p.currency || t('hist.crypto')}
                              </div>
                              <div className="text-[13px] text-[#8E8E93] font-medium">
                                {p.created_at
                                  ? new Date(p.created_at).toLocaleString(locale, {
                                      day: 'numeric',
                                      month: 'long',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <div className="text-[17px] font-semibold text-white tracking-tight">
                              {isFree(p) ? '₽0' : `₽${p.amount_rub}`}
                            </div>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider',
                                meta.cls,
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 space-y-3.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[14px] text-[#8E8E93]">{t('hist.method')}</span>
                            <span className="text-[14px] text-white font-medium flex items-center gap-1.5">
                              {isFree(p) ? (
                                <Zap className="w-4 h-4 text-yellow-400" />
                              ) : p.method === 'stars' ? (
                                <BadgeCheck className="w-4 h-4 text-blue-400" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-[#32D74B]" />
                              )}
                              {isFree(p)
                                ? t('hist.freeActivation')
                                : p.method === 'stars'
                                  ? 'Telegram Stars'
                                  : t('hist.crypto')}
                            </span>
                          </div>

                          <div className="w-full h-px bg-white/[0.05]" />

                          <div className="flex justify-between items-start gap-4">
                            <span className="text-[14px] text-[#8E8E93] shrink-0">{t('hist.orderNo')}</span>
                            <span className="text-[14px] text-white/60 font-mono tracking-tight text-right break-all">
                              {p.payment_uid || p.id}
                            </span>
                          </div>

                          {p.tx_hash && (
                            <>
                              <div className="w-full h-px bg-white/[0.05]" />
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[14px] text-[#8E8E93]">{t('hist.txid')}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copy(String(p.tx_hash), `hash${p.id}`);
                                  }}
                                  className="w-full flex items-center justify-between bg-black/20 py-2.5 pl-4 pr-2.5 rounded-full border border-white/[0.05] active:scale-[0.98] transition-transform relative overflow-hidden"
                                >
                                  <span
                                    className={cn(
                                      'text-[13px] text-white/50 font-mono truncate max-w-[240px] text-left transition-opacity',
                                      copiedId === `hash${p.id}` && 'opacity-0',
                                    )}
                                  >
                                    {String(p.tx_hash)}
                                  </span>
                                  <span
                                    className={cn(
                                      'absolute inset-0 flex items-center justify-center text-[13px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-opacity duration-300',
                                      copiedId === `hash${p.id}` && 'opacity-100',
                                    )}
                                  >
                                    {t('dash.copiedBig')}
                                  </span>
                                  <span className="p-2 bg-white/10 rounded-full ml-3 shrink-0 relative z-10">
                                    {copiedId === `hash${p.id}` ? (
                                      <Check className="w-4 h-4 text-[#32D74B]" />
                                    ) : (
                                      <Copy className="w-4 h-4 text-white/70" />
                                    )}
                                  </span>
                                </button>
                              </div>
                            </>
                          )}

                          {done && (
                            <div className="pt-2">
                              <button
                                onClick={() => {
                                  hapticFeedback.impactOccurred('light');
                                  setSelectedReceipt(p);
                                }}
                                className="w-full h-11 bg-white/[0.08] hover:bg-white/[0.12] active:bg-white/[0.15] active:scale-[0.98] transition-all rounded-full flex items-center justify-center gap-2 text-white font-medium text-[15px]"
                              >
                                <FileText className="w-4 h-4" />
                                {t('hist.receipt')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-24">
                  <div className="w-20 h-20 bg-white/[0.03] rounded-[30px] flex items-center justify-center mx-auto mb-6 border border-white/5">
                    <History className="w-10 h-10 text-[#8E8E93]/20" />
                  </div>
                  <h4 className="text-[20px] font-bold text-white mb-2">{t('hist.empty')}</h4>
                  <p className="text-[15px] text-[#8E8E93] px-10 opacity-60">{t('hist.emptyHint')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedReceipt && <ReceiptModal payment={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}
      </AnimatePresence>
    </div>
  );
}
