import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, CryptoOrder, Tariff, ServerInfo, HashResult } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback, openInvoice } from '../lib/telegram';
import { cn } from '../lib/utils';
import { t } from '../lib/i18n';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrollLock } from '../lib/scroll-lock';
import {
  ChevronLeft,
  Check,
  Copy,
  Gift,
  KeyRound,
  Send,
  Star,
  Bitcoin,
  ChevronRight,
  PartyPopper,
  Loader2,
} from 'lucide-react';

type Step = 'start' | 'server' | 'tariff' | 'method' | 'crypto_currency' | 'crypto_pay' | 'promo' | 'success';

const CopyRow = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider px-1">{label}</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          hapticFeedback.selectionChanged();
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        className="bg-black/30 border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
      >
        <span className={cn('flex-1 text-[14px] text-white/90 break-all', mono && 'font-mono')}>{value}</span>
        {copied ? (
          <Check className="w-4 h-4 text-[#32D74B] shrink-0" />
        ) : (
          <Copy className="w-4 h-4 text-[#0A84FF] shrink-0" />
        )}
      </button>
    </div>
  );
};

export default function Buy() {
  const { boot, refreshBoot } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const extendSubId = searchParams.get('extend');
  const isExtend = Boolean(extendSubId);

  const [step, setStep] = useState<Step>(isExtend ? 'tariff' : 'start');
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [order, setOrder] = useState<CryptoOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [successLink, setSuccessLink] = useState<string | null>(null);
  const [successText, setSuccessText] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [trialOpen, setTrialOpen] = useState(false);

  const activeServers = useMemo(() => boot.servers.filter((s) => s.is_active !== false), [boot.servers]);

  const fail = (e: any) => {
    hapticFeedback.notificationOccurred('error');
    tg.showAlert(e?.message || 'Ошибка');
  };

  // ---------- Оплата Stars ----------
  const payWithStars = async () => {
    if (!tariff || busy) return;
    setBusy(true);
    try {
      const res = await api.purchase({
        kind: isExtend ? 'extend' : 'buy',
        method: 'stars',
        months: tariff.months,
        server_id: server?.id,
        sub_id: extendSubId || undefined,
      });
      const status = await openInvoice(res.invoice_link);
      if (status === 'paid') {
        hapticFeedback.notificationOccurred('success');
        setSuccessText(
          isExtend
            ? '✅ Подписка продлена! Обновлённые данные — в Дашборде.'
            : '🎉 Оплата прошла! Ссылка на подписку придёт в чат с ботом и появится в Дашборде.',
        );
        setSuccessLink(null);
        setStep('success');
      } else if (status === 'cancelled' || status === 'failed') {
        tg.showAlert('Оплата не завершена. Заказ сохранён в «Ожидающих платежах» на Дашборде.');
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Крипто ----------
  const createCryptoOrder = async (currency: 'USDT' | 'USDC') => {
    if (!tariff || busy) return;
    setBusy(true);
    try {
      const res = await api.purchase({
        kind: isExtend ? 'extend' : 'buy',
        method: 'crypto',
        months: tariff.months,
        server_id: server?.id,
        sub_id: extendSubId || undefined,
        currency,
      });
      setOrder(res as CryptoOrder);
      setStep('crypto_pay');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitHash = async () => {
    if (!order || verifying) return;
    const hash = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      tg.showAlert('Неверный формат TXID: хеш начинается с 0x и содержит 64 символа.');
      return;
    }
    setVerifying(true);
    try {
      const r: HashResult = await api.submitHash(order.payment_id, hash);
      if (r.verified) {
        hapticFeedback.notificationOccurred('success');
        setSuccessLink(r.sub_link || null);
        setSuccessText(r.extended ? '✅ Оплата подтверждена — подписка продлена!' : '🎉 Оплата подтверждена!');
        setStep('success');
      } else {
        hapticFeedback.notificationOccurred('warning');
        tg.showAlert(
          `⏳ ${r.reason || 'Транзакция пока не найдена'}.\n\nЕсли вы только что отправили перевод — подождите минуту и отправьте TXID ещё раз (заказ сохранён в «Ожидающих платежах»).`,
        );
      }
    } catch (e) {
      fail(e);
    } finally {
      setVerifying(false);
    }
  };

  // ---------- Триал ----------
  const activateTrial = async (serverId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.trial(serverId);
      hapticFeedback.notificationOccurred('success');
      setSuccessLink(res.sub_link);
      setSuccessText('🎁 Бесплатная неделя активирована!');
      setTrialOpen(false);
      setStep('success');
      refreshBoot();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Промокод ----------
  const activatePromo = async () => {
    if (busy) return;
    const code = promoCode.trim().toUpperCase();
    if (!/^GIFT-[0-9A-F]{16}$/.test(code)) {
      tg.showAlert('Неверный формат. Пример: GIFT-ABCD1234EFGH5678');
      return;
    }
    setBusy(true);
    try {
      const res = await api.activatePromo(code);
      hapticFeedback.notificationOccurred('success');
      setSuccessLink(res.sub_link);
      setSuccessText(`🎉 Ключ активирован! Срок: ${res.label}.`);
      setStep('success');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    hapticFeedback.selectionChanged();
    if (step === 'server') setStep('start');
    else if (step === 'tariff') setStep(isExtend ? 'tariff' : 'server');
    else if (step === 'method') setStep('tariff');
    else if (step === 'crypto_currency') setStep('method');
    else if (step === 'crypto_pay') setStep('crypto_currency');
    else if (step === 'promo') setStep('start');
    if (isExtend && step === 'tariff') navigate('/');
  };

  const Header = ({ title }: { title: string }) => (
    <header className="flex items-center mb-4 pt-2">
      {step !== 'start' && step !== 'success' && (
        <button
          onClick={goBack}
          className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform mr-3 shrink-0"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
      )}
      <h1 className="text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold">{title}</h1>
    </header>
  );

  // ================== ЭКРАН УСПЕХА ==================
  if (step === 'success') {
    return (
      <div className="px-4 pt-2 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
        <div className="flex flex-col items-center text-center gap-4 pt-10">
          <div className="w-20 h-20 bg-[#32D74B]/15 rounded-full flex items-center justify-center border border-[#32D74B]/30 shadow-[0_8px_40px_rgba(50,215,75,0.25)]">
            <PartyPopper className="w-10 h-10 text-[#32D74B]" />
          </div>
          <div className="text-[24px] font-bold text-white px-4">{successText}</div>
          {successLink && (
            <div className="w-full mt-2">
              <CopyRow label={t('buy.successLink')} value={successLink} />
              <div className="text-[13px] text-[#8E8E93] mt-3 px-2">
                {t('buy.successHint')}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2.5 w-full mt-4">
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 btn-primary rounded-2xl text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
            >
              {t('buy.toDash')}
            </button>
            <button
              onClick={() => navigate('/instructions')}
              className="w-full py-4 btn-glass rounded-2xl text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
            >
              {t('buy.howConnect')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
      {/* ================== СТАРТ ================== */}
      {step === 'start' && (
        <>
          <Header title={t('buy.checkout')} />

          <button
            onClick={() => {
              hapticFeedback.selectionChanged();
              setStep('server');
            }}
            className="ios-list bg-gradient-to-br from-[#0A84FF]/30 via-[#5E5CE6]/15 to-transparent border border-[#0A84FF]/30 shadow-[0_12px_48px_rgba(10,132,255,0.2)] p-5 text-left relative overflow-hidden active:scale-[0.99] transition-transform"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#0A84FF]/15 blur-3xl rounded-full pointer-events-none" />
            <div className="text-[22px] font-bold text-white mb-1">{t('buy.buyCard')}</div>
            <div className="text-[14px] text-[#8E8E93]">
              {boot.tariffs.length > 0 && `${t('buy.from')} ${Math.min(...boot.tariffs.map((tf) => tf.rub))} ₽ · `}
              {t('buy.starsOrCrypto')}
            </div>
            <div className="flex items-center gap-1 text-[#0A84FF] text-[15px] font-semibold mt-3">
              {t('buy.chooseCountry')} <ChevronRight className="w-4 h-4" />
            </div>
          </button>

          {!boot.trial_used && (
            <button
              onClick={() => {
                hapticFeedback.selectionChanged();
                setTrialOpen(true);
              }}
              className="ios-list p-5 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-500/15 rounded-full flex items-center justify-center border border-yellow-500/30 shrink-0">
                  <Gift className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <div className="text-[18px] font-bold text-white">{t('buy.trial')}</div>
                  <div className="text-[14px] text-[#8E8E93]">{t('buy.trialHint')}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
              </div>
            </button>
          )}

          <button
            onClick={() => {
              hapticFeedback.selectionChanged();
              setStep('promo');
            }}
            className="ios-list p-5 text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#BF5AF2]/15 rounded-full flex items-center justify-center border border-[#BF5AF2]/30 shrink-0">
                <KeyRound className="w-6 h-6 text-[#BF5AF2]" />
              </div>
              <div className="flex-1">
                <div className="text-[18px] font-bold text-white">{t('buy.promoCard')}</div>
                <div className="text-[14px] text-[#8E8E93]">{t('buy.promoCardHint')}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
            </div>
          </button>

          <a
            href="https://t.me/PremiumBot"
            target="_blank"
            rel="noreferrer"
            className="ios-list p-5 text-left active:scale-[0.99] transition-transform block"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#0A84FF]/15 rounded-full flex items-center justify-center border border-[#0A84FF]/30 shrink-0">
                <Star className="w-6 h-6 text-[#0A84FF]" />
              </div>
              <div className="flex-1">
                <div className="text-[18px] font-bold text-white">{t('buy.buyStars')}</div>
                <div className="text-[14px] text-[#8E8E93]">{t('buy.buyStarsHint')}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
            </div>
          </a>
        </>
      )}

      {/* ================== ВЫБОР СЕРВЕРА ================== */}
      {step === 'server' && (
        <>
          <Header title={t('buy.chooseCountryTitle')} />
          <div className="ios-list overflow-hidden">
            {activeServers.length === 0 && (
              <div className="p-6 text-center text-[#8E8E93] text-[15px]">{t('buy.noServers')}</div>
            )}
            {activeServers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  setServer(s);
                  setStep('tariff');
                }}
                className="ios-list-item w-full"
              >
                <span className="text-[17px] font-semibold text-white flex items-center gap-2">
                  {s.flag} {s.name}
                </span>
                <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ================== ВЫБОР ТАРИФА ================== */}
      {step === 'tariff' && (
        <>
          <Header title={isExtend ? t('buy.extendTitle') : t('buy.termTitle')} />
          {isExtend && (
            <div className="text-[14px] text-[#8E8E93] -mt-2 ml-1">
              {t('buy.extending')} <span className="font-mono text-white/70">{extendSubId}</span>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {boot.tariffs.map((tf) => (
              <button
                key={tf.months}
                onClick={() => {
                  hapticFeedback.selectionChanged();
                  setTariff(tf);
                  setStep('method');
                }}
                className="ios-list p-5 flex items-center justify-between active:scale-[0.99] transition-transform"
              >
                <div className="text-left">
                  <div className="text-[19px] font-bold text-white">{tf.label}</div>
                  <div className="text-[13px] text-[#8E8E93] mt-0.5">
                    ⭐ {tf.stars} Stars · ≈ ${tf.usd}
                  </div>
                </div>
                <div className="text-[22px] font-bold text-[#0A84FF]">{tf.rub} ₽</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ================== СПОСОБ ОПЛАТЫ ================== */}
      {step === 'method' && tariff && (
        <>
          <Header title={t('buy.methodTitle')} />
          <div className="ios-list p-4 mb-1">
            <div className="flex justify-between items-center">
              <span className="text-[15px] text-[#8E8E93]">
                {isExtend ? t('buy.extendTitle') : server ? `${server.flag ?? ''} ${server.name}` : ''} · {tariff.label}
              </span>
              <span className="text-[17px] font-bold text-white">{tariff.rub} ₽</span>
            </div>
          </div>
          <button
            onClick={payWithStars}
            disabled={busy}
            className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            <div className="w-12 h-12 bg-[#0A84FF]/15 rounded-full flex items-center justify-center border border-[#0A84FF]/30 shrink-0">
              {busy ? <Loader2 className="w-6 h-6 text-[#0A84FF] animate-spin" /> : <Star className="w-6 h-6 text-[#0A84FF]" />}
            </div>
            <div className="flex-1 text-left">
              <div className="text-[18px] font-bold text-white">Telegram Stars</div>
              <div className="text-[14px] text-[#8E8E93]">{tariff.stars} ⭐ · {t('buy.oneClick')}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
          <button
            onClick={() => {
              hapticFeedback.selectionChanged();
              setStep('crypto_currency');
            }}
            className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
          >
            <div className="w-12 h-12 bg-[#32D74B]/15 rounded-full flex items-center justify-center border border-[#32D74B]/30 shrink-0">
              <Bitcoin className="w-6 h-6 text-[#32D74B]" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[18px] font-bold text-white">{t('buy.cryptoTitle')}</div>
              <div className="text-[14px] text-[#8E8E93]">USDT / USDC · сеть Arbitrum One</div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
        </>
      )}

      {/* ================== ВЫБОР КРИПТОВАЛЮТЫ ================== */}
      {step === 'crypto_currency' && tariff && (
        <>
          <Header title={t('buy.cryptoTitle')} />
          <div className="text-[14px] text-[#8E8E93] -mt-2 ml-1 mb-1">{t('buy.network')}</div>
          {(['USDT', 'USDC'] as const).map((c) => (
            <button
              key={c}
              onClick={() => createCryptoOrder(c)}
              disabled={busy}
              className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              <div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center border shrink-0',
                  c === 'USDT' ? 'bg-[#32D74B]/15 border-[#32D74B]/30' : 'bg-[#0A84FF]/15 border-[#0A84FF]/30',
                )}
              >
                {busy ? (
                  <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
                ) : (
                  <span className={cn('text-[15px] font-black', c === 'USDT' ? 'text-[#32D74B]' : 'text-[#0A84FF]')}>
                    {c === 'USDT' ? '₮' : '$'}
                  </span>
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-[18px] font-bold text-white">{c}</div>
                <div className="text-[14px] text-[#8E8E93]">≈ {tariff.usd} {c}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
            </button>
          ))}
        </>
      )}

      {/* ================== ОПЛАТА КРИПТОЙ ================== */}
      {step === 'crypto_pay' && order && (
        <>
          <Header title={`${t('buy.payTitle')} ${order.currency}`} />
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-[24px]">
              <QRCodeSVG value={order.wallet} size={180} level="M" />
            </div>
            <div className="text-center">
              <div className="text-[28px] font-bold text-white font-mono">
                {order.amount_usd.toFixed(2)} {order.currency}
              </div>
              <div className="text-[14px] text-[#8E8E93]">≈ {Math.round(order.amount_rub)} ₽ · {order.network}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <CopyRow label={t('buy.wallet')} value={order.wallet} />
            <CopyRow label={`${t('buy.amount')} (${order.currency})`} value={order.amount_usd.toFixed(2)} />
            <CopyRow label={t('buy.contract')} value={order.contract} />
          </div>

          <div className="bg-[#FF9500]/10 border border-[#FF9500]/25 rounded-2xl p-4 text-[13px] text-[#FF9500] leading-snug">
            {t('buy.exactWarn')}
          </div>

          <div className="flex flex-col gap-3">
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="TXID: 0x…"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-[14px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
            />
            <button
              onClick={submitHash}
              disabled={verifying || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
              className="w-full py-4 btn-primary rounded-2xl text-white font-bold text-[16px] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> {t('buy.checking')}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" /> {t('buy.paidCheck')}
                </>
              )}
            </button>
            <div className="text-[12px] text-[#8E8E93] text-center px-4">
              {t('buy.orderSaved')}
            </div>
          </div>
        </>
      )}

      {/* ================== АКТИВАЦИЯ КЛЮЧА (страница) ================== */}
      {step === 'promo' && (
        <>
          <Header title={t('buy.promoTitle')} />
          <div className="flex flex-col items-center text-center gap-4 pt-4 pb-2">
            <div className="w-20 h-20 app-icon rounded-[28px] bg-gradient-to-b from-[#D07BFF]/45 to-[#A845E8]/15 flex items-center justify-center shadow-[0_8px_40px_rgba(191,90,242,0.3)]">
              <KeyRound className="w-10 h-10 text-[#D07BFF]" />
            </div>
            <div className="text-[15px] text-[#8E8E93] max-w-[300px]">
              {t('buy.promoDesc')}
            </div>
          </div>
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="GIFT-ABCD1234EFGH5678"
            className="w-full h-[54px] glass rounded-full px-6 text-[16px] font-mono text-white placeholder:text-white/25 focus:outline-none text-center uppercase tracking-wider"
            autoFocus
          />
          <button
            onClick={activatePromo}
            disabled={busy || !/^GIFT-[0-9A-F]{16}$/.test(promoCode.trim())}
            className="w-full py-4 rounded-full text-white font-bold text-[16px] bg-gradient-to-b from-[#D07BFF] to-[#A845E8] shadow-[0_10px_24px_rgba(191,90,242,0.35)] border border-white/15 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            {t('buy.promoBtn')}
          </button>
          <div className="text-[12px] text-[#8E8E93]/70 text-center px-8">
            {t('buy.promoFormat')}
          </div>
        </>
      )}

      {/* ================== МОДАЛКА ТРИАЛА ================== */}
      <AnimatePresence>
        {trialOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => !busy && setTrialOpen(false)}
          >
            <ScrollLock />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
              className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[32px] p-6 pb-10 border-t border-white/10 max-h-[75vh] overflow-y-auto hidden-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[20px] font-bold text-white mb-1">{t('buy.trialModalTitle')}</h3>
              <p className="text-[14px] text-[#8E8E93] mb-4">{t('buy.trialModalHint')}</p>
              <div className="flex flex-col gap-2">
                {activeServers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => activateTrial(s.id)}
                    disabled={busy}
                    className="w-full p-4 bg-white/[0.05] rounded-2xl text-left text-[16px] font-semibold text-white active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-between"
                  >
                    <span>
                      {s.flag} {s.name}
                    </span>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4 text-white/30" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
