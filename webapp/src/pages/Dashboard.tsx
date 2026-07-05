import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Subscription, Payment, HashResult } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback, openInvoice } from '../lib/telegram';
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
  Star,
  Trash2,
  Send,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';

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

  if (expiryMs === 0) return <div className="text-[16px] font-semibold text-[#32D74B]">Бессрочно ∞</div>;
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

const ReceiptModal = ({ payment, onClose }: { payment: Payment; onClose: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/70 backdrop-blur-md hidden-scrollbar"
      onClick={onClose}
    >
      <div className="min-h-full w-full flex items-center justify-center px-3 sm:px-4 py-12">
        <motion.div
          initial={{ scale: 0.85, y: 20 }}
          animate={{ scale: 0.9, y: 0 }}
          exit={{ scale: 0.85, y: 20 }}
          className="w-full max-w-md z-10 flex flex-col gap-6 mt-[60px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="bg-[#faf9f0] text-[#1a1a1a] p-7 pt-8 rounded-sm shadow-2xl relative flex flex-col font-mono"
            style={{
              backgroundImage: 'radial-gradient(#d1cfc1 0.3px, transparent 0.3px)',
              backgroundSize: '16px 16px',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <header className="mb-6 text-center border-b-[3px] border-double border-[#1a1a1a]/20 pb-4">
              <h2 className="text-[28px] font-black tracking-tighter mb-1">GIGABYTE</h2>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-60">
                ЭЛЕКТРОННЫЙ ЧЕК №{String(payment.payment_uid || payment.id).slice(0, 20).toUpperCase()}
              </div>
            </header>

            <div className="space-y-3 text-[10px] flex-1">
              <div className="flex justify-between border-b border-black/5 pb-1.5">
                <span className="opacity-50 font-bold uppercase">ДАТА И ВРЕМЯ:</span>
                <span className="font-bold">
                  {payment.created_at ? new Date(payment.created_at).toLocaleString('ru-RU') : '—'}
                </span>
              </div>

              <div className="flex flex-col border-b border-black/5 pb-1.5">
                <span className="opacity-50 font-bold mb-0.5 uppercase">НАИМЕНОВАНИЕ УСЛУГИ:</span>
                <span className="font-bold text-[11px]">Premium Access (Gigabyte Server Network)</span>
              </div>

              <div className="flex justify-between border-b border-black/5 pb-1.5">
                <span className="opacity-50 font-bold uppercase">СПОСОБ ОПЛАТЫ:</span>
                <span className="font-bold uppercase">
                  {isFree(payment)
                    ? 'БЕСПЛАТНЫЙ ДОСТУП'
                    : payment.method === 'stars'
                      ? 'TELEGRAM STARS'
                      : payment.currency || 'CRYPTO'}
                </span>
              </div>

              {payment.tx_hash && (
                <div className="flex flex-col border-b border-black/5 pb-1.5">
                  <span className="opacity-50 font-bold mb-0.5 uppercase">ID ТРАНЗАКЦИИ:</span>
                  <span className="font-bold break-all opacity-80">{payment.tx_hash}</span>
                </div>
              )}

              <div className="flex justify-between pb-1.5">
                <span className="opacity-50 font-bold uppercase">СТАТУС ИСПОЛНЕНИЯ:</span>
                <span className="font-bold uppercase text-green-700">УСПЕШНО ЗАВЕРШЕНО</span>
              </div>

              <div className="pt-4 flex flex-col items-center border-t border-[#1a1a1a]/10 mt-2">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] mb-1">ИТОГО ОПЛАЧЕНО</span>
                <div className="text-3xl font-black tracking-tighter">
                  {isFree(payment) ? '₽0.00' : `₽${payment.amount_rub}.00`}
                </div>
              </div>

              <div className="pt-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                  Спасибо что выбрали нас!
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center">
              <div className="opacity-60 overflow-hidden mix-blend-multiply w-full flex justify-center mb-6">
                <Barcode
                  value={String(payment.payment_uid || payment.id).slice(0, 12).toUpperCase()}
                  width={1.2}
                  height={35}
                  fontSize={10}
                  margin={0}
                  displayValue={true}
                  background="transparent"
                  lineColor="#1a1a1a"
                />
              </div>

              <div className="relative w-[110px] h-[110px] flex items-center justify-center transform rotate-[-12deg] select-none opacity-85 mix-blend-multiply scale-[0.85]">
                <div
                  className="absolute inset-0 border-[3px] border-double border-red-800/60 rounded-full"
                  style={{
                    WebkitMaskImage: 'radial-gradient(circle, black 60%, rgba(0,0,0,0.4) 100%)',
                    maskImage: 'radial-gradient(circle, black 60%, rgba(0,0,0,0.4) 100%)',
                  }}
                />
                <div className="absolute inset-[6px] border-[1.5px] border-dashed border-red-800/50 rounded-full" />
                <div className="flex flex-col items-center text-red-800/70 z-10 w-full px-2 text-center">
                  <div className="text-[12px] font-black tracking-[0.25em] uppercase font-serif mb-1 mt-1">GIGABYTE</div>
                  <div className="w-[80%] h-px bg-red-800/30 my-0.5" />
                  <div className="text-[7.5px] font-bold tracking-[0.15em] uppercase font-serif my-0.5">APPROVED</div>
                  <div className="w-[80%] h-px bg-red-800/30 my-0.5" />
                  <div className="text-[7px] font-medium font-mono mt-1 opacity-90">
                    {new Date(payment.created_at || new Date()).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-6 w-full shrink-0">
            <button
              onClick={onClose}
              className="w-[68px] h-[68px] bg-white/10 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-all shadow-xl"
              aria-label="Закрыть чек"
            >
              <X className="w-8 h-8" />
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Модалка отправки TXID для крипто-платежа
const TxHashModal = ({
  payment,
  onClose,
  onDone,
}: {
  payment: Payment;
  onClose: () => void;
  onDone: (r: HashResult) => void;
}) => {
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^0x[0-9a-fA-F]{64}$/.test(hash.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await api.submitHash(payment.id, hash.trim());
      onDone(result);
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || 'Ошибка проверки');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 250 }}
        className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[32px] p-6 pb-10 border-t border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[20px] font-bold text-white mb-2">Хеш транзакции (TXID)</h3>
        <p className="text-[14px] text-[#8E8E93] mb-4 leading-snug">
          Скопируйте TXID из вашего криптокошелька или на arbiscan.io и вставьте сюда. Хеш начинается с 0x и содержит
          64 символа.
        </p>
        <input
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="0x742d35cc6634c0532925a3b8448bc4549…"
          className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-[14px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-4"
          autoFocus
        />
        <button
          onClick={submit}
          disabled={!valid || busy}
          className="w-full py-4 btn-primary rounded-2xl text-white font-bold text-[16px] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
              Проверяем в блокчейне…
            </>
          ) : (
            <>
              <Send className="w-5 h-5" /> Отправить на проверку
            </>
          )}
        </button>
        {busy && (
          <div className="text-[12px] text-[#8E8E93] text-center mt-3">
            Проверка занимает до 40 секунд, не закрывайте окно
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default function Dashboard() {
  const { boot } = useApp();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [pending, setPending] = useState<Payment[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<'history' | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [hashPayment, setHashPayment] = useState<Payment | null>(null);
  const [qrSub, setQrSub] = useState<Subscription | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  useEffect(() => {
    document.body.style.overflow = activeModal || qrSub || confirmDelete ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeModal, qrSub, confirmDelete]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    hapticFeedback.selectionChanged();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const payStars = async (p: Payment) => {
    try {
      hapticFeedback.impactOccurred('light');
      const { invoice_link } = await api.paymentInvoice(p.id);
      const status = await openInvoice(invoice_link);
      if (status === 'paid') {
        hapticFeedback.notificationOccurred('success');
        tg.showAlert('✅ Оплата прошла! Подписка выдана — детали придут в чат с ботом.');
        setTimeout(fetchData, 1500);
      }
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
    }
  };

  const removePayment = async (p: Payment) => {
    try {
      await api.deletePayment(p.id);
      hapticFeedback.notificationOccurred('success');
      fetchData();
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
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
      tg.showAlert('✅ Ваш аккаунт и все данные удалены. До свидания!');
      setTimeout(() => tg.close?.(), 1200);
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
    }
  };

  return (
    <div className="px-4 pt-10 flex flex-col gap-6 animate-in fade-in duration-500 pb-8">
      {/* ---- Подписки ---- */}
      <section>
        <h2 className="text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-3 ml-4 mt-2">
          Мои подписки
        </h2>
        {loading ? (
          <div className="ios-list p-6 text-center text-[#8E8E93] flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
          </div>
        ) : subs.length === 0 ? (
          <div className="ios-list p-8 text-center">
            <div className="w-14 h-14 bg-[#2C2C2E] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/[0.08]">
              <Clock className="w-7 h-7 text-[#8E8E93]" />
            </div>
            <div className="text-[19px] font-semibold text-white mb-2">Нет подписок</div>
            <div className="text-[15px] text-[#8E8E93] px-4 mb-5">
              Оформите подписку — доступ появится мгновенно.
            </div>
            <button
              onClick={() => navigate('/buy')}
              className="px-8 py-3 btn-primary rounded-full text-white font-semibold text-[16px] active:scale-95 transition-transform"
            >
              🛒 Купить подписку
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {subs.map((sub) => {
              const isActive = sub.status === 'active';
              return (
                <div
                  key={sub.id}
                  className="ios-list overflow-hidden relative group"
                >
                  <div className="p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#0A84FF]/10 blur-3xl rounded-full translate-x-10 -translate-y-10 pointer-events-none" />
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col gap-1">
                          <div className="text-[22px] font-bold text-white tracking-tight flex items-center gap-2">
                            {sub.server.flag} {sub.server.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className={cn(
                                'w-2.5 h-2.5 rounded-full',
                                isActive ? 'bg-[#32D74B] shadow-[0_0_12px_rgba(50,215,75,0.8)]' : 'bg-[#FF453A]',
                              )}
                            />
                            <div
                              className={cn(
                                'text-[15px] font-semibold tracking-wide uppercase',
                                isActive ? 'text-[#32D74B]' : 'text-[#FF453A]',
                              )}
                            >
                              {isActive ? 'Защита активна' : 'Подписка истекла'}
                            </div>
                          </div>
                        </div>
                        {isActive && sub.sub_link && (
                          <button
                            onClick={() => {
                              hapticFeedback.impactOccurred('light');
                              setQrSub(sub);
                            }}
                            className="w-10 h-10 bg-white/[0.06] rounded-full flex items-center justify-center border border-white/10 active:scale-90 transition-transform"
                          >
                            <QrCode className="w-5 h-5 text-white/70" />
                          </button>
                        )}
                      </div>

                      {isActive && (
                        <div className="flex flex-col mt-3">
                          <span className="text-[12px] text-[#8E8E93] font-medium uppercase tracking-wider mb-0.5">
                            Осталось времени
                          </span>
                          <CountdownTimer expiryMs={sub.expiry_date} />
                        </div>
                      )}
                    </div>
                  </div>

                  {isActive && sub.sub_link ? (
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] text-[#8E8E93] font-medium px-1">Ссылка-подписка</span>
                        <div
                          className="bg-black/20 border border-white/[0.05] rounded-full p-3 flex items-center gap-3 cursor-pointer group active:scale-[0.98] transition-transform pl-4 relative overflow-hidden"
                          onClick={() => handleCopy(sub.sub_link!, `sub${sub.id}`)}
                        >
                          <div
                            className={cn(
                              'flex-1 truncate font-mono text-[14px] text-[#0A84FF] opacity-90 transition-all',
                              copiedId === `sub${sub.id}` && 'opacity-0 translate-y-2',
                            )}
                          >
                            {sub.sub_link}
                          </div>
                          <div
                            className={cn(
                              'absolute inset-0 flex items-center justify-center text-[14px] text-[#32D74B] font-bold tracking-tight opacity-0 transition-all duration-300',
                              copiedId === `sub${sub.id}` && 'opacity-100 translate-y-0',
                            )}
                          >
                            СКОПИРОВАНО
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
                      <button
                        onClick={() => {
                          hapticFeedback.selectionChanged();
                          navigate(`/buy?extend=${sub.sub_id}`);
                        }}
                        className="w-full py-3 bg-white/[0.06] rounded-full text-[#0A84FF] font-semibold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" /> Продлить подписку
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
                        Подписка истекла — оформить новую
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
          <h2 className="text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-3 ml-4">
            Ожидающие платежи
          </h2>
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
                      {p.method === 'stars' ? 'Оплата Stars' : `Оплата ${p.currency || 'крипто'}`} · ₽
                      {p.amount_rub}
                    </div>
                    <div className="text-[14px] text-[#8E8E93] font-medium mt-0.5">
                      {p.status === 'awaiting_hash'
                        ? 'Ожидает отправки TXID'
                        : p.status === 'pending_stars'
                          ? 'Ожидает оплаты Stars'
                          : 'Ожидает перевода и TXID'}
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
                    <Star className="w-4 h-4" /> Оплатить Stars
                  </button>
                ) : (
                  <button
                    onClick={() => setHashPayment(p)}
                    className="w-full py-3 btn-primary rounded-full text-white font-semibold text-[15px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Отправить TXID
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- История ---- */}
      <section>
        <div className="ios-list overflow-hidden">
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
              <span className="font-semibold text-white text-[17px] tracking-tight">История платежей</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </button>
        </div>
      </section>

      {/* ---- Документы и аккаунт ---- */}
      <section>
        <h2 className="text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-3 ml-4">Аккаунт</h2>
        <div className="ios-list overflow-hidden">
          <a href={boot.offer_url} target="_blank" rel="noreferrer" className="ios-list-item w-full">
            <div className="flex items-center gap-4">
              <FileText className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[16px] text-white font-medium">Публичная оферта</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </a>
          <a href={boot.privacy_url} target="_blank" rel="noreferrer" className="ios-list-item w-full">
            <div className="flex items-center gap-4">
              <Lock className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[16px] text-white font-medium">Политика конфиденциальности</span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
          </a>
          {!boot.is_admin && (
            <button onClick={() => setConfirmDelete(true)} className="ios-list-item w-full">
              <div className="flex items-center gap-4">
                <Trash2 className="w-5 h-5 text-[#FF453A]" />
                <span className="text-[16px] text-[#FF453A] font-medium">Удалить аккаунт и данные</span>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* ---- Модалка QR подписки ---- */}
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
              className="bg-white rounded-[32px] p-6 flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <QRCodeSVG value={qrSub.sub_link} size={240} level="M" />
              <div className="text-[13px] text-black/60 font-medium text-center">
                Отсканируйте в приложении на другом устройстве
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
              className="glass-sheet rounded-[32px] p-6 w-full max-w-[360px] border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center gap-3 mb-5">
                <div className="w-14 h-14 bg-[#FF453A]/15 rounded-full flex items-center justify-center border border-[#FF453A]/30">
                  <AlertTriangle className="w-7 h-7 text-[#FF453A]" />
                </div>
                <div className="text-[19px] font-bold text-white">Удалить аккаунт?</div>
                <div className="text-[14px] text-[#8E8E93] leading-snug">
                  Безвозвратно удалятся все подписки (доступ прекратится), история платежей, тикеты и персональные
                  данные. Это действие нельзя отменить.
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={deleteAccount}
                  className="w-full py-3.5 btn-danger rounded-2xl text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
                >
                  Да, удалить навсегда
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="w-full py-3.5 btn-glass rounded-2xl text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Модалка TXID ---- */}
      <AnimatePresence>
        {hashPayment && (
          <TxHashModal payment={hashPayment} onClose={() => setHashPayment(null)} onDone={onHashDone} />
        )}
      </AnimatePresence>

      {/* ---- Модалка истории ---- */}
      <AnimatePresence>
        {activeModal === 'history' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => {
              hapticFeedback.selectionChanged();
              setActiveModal(null);
            }}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.5 }}
              transition={{ type: 'spring', damping: 30, stiffness: 250, mass: 1 }}
              className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[40px] pb-5 pt-5 px-6 shadow-[0_-8px_60px_rgba(0,0,0,0.7)] flex flex-col h-[78vh] sm:h-[70vh] border-t border-white/10 sm:border relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full sm:hidden z-30 pointer-events-none"></div>

              <div className="flex justify-between items-center mb-3 shrink-0 px-1">
                <h3 className="text-[22px] font-bold tracking-tight text-white">История транзакций</h3>
                <button
                  onClick={() => {
                    hapticFeedback.selectionChanged();
                    setActiveModal(null);
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-white/40 active:scale-90 transition-all hover:bg-white/10 active:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto hidden-scrollbar flex-1 -mx-6 px-6 relative">
                {history.length > 0 ? (
                  <div className="flex flex-col gap-5 pb-10">
                    {history.map((p) => (
                      <div
                        key={p.id}
                        className="glass border border-white/[0.05] rounded-2xl overflow-hidden mb-4 shadow-sm"
                      >
                        <div className="p-4 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.02]">
                          <div className="flex items-center gap-3.5">
                            <div
                              className={cn(
                                'w-11 h-11 rounded-full flex items-center justify-center shrink-0',
                                isFree(p)
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
                                  ? 'Пробный период'
                                  : p.method === 'stars'
                                    ? 'Telegram Stars'
                                    : p.currency || 'Крипто-платеж'}
                              </div>
                              <div className="text-[13px] text-[#8E8E93] font-medium">
                                {p.created_at
                                  ? new Date(p.created_at).toLocaleString('ru-RU', {
                                      day: 'numeric',
                                      month: 'long',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[17px] font-semibold text-white tracking-tight">
                              {isFree(p) ? '₽0' : `₽${p.amount_rub}`}
                            </div>
                            <div className="text-[13px] text-[#32D74B] font-medium mt-0.5">Выполнено</div>
                          </div>
                        </div>

                        <div className="p-4 space-y-3.5">
                          <div className="flex justify-between items-center">
                            <span className="text-[14px] text-[#8E8E93]">Способ оплаты</span>
                            <span className="text-[14px] text-white font-medium flex items-center gap-1.5">
                              {isFree(p) ? (
                                <Zap className="w-4 h-4 text-yellow-400" />
                              ) : p.method === 'stars' ? (
                                <BadgeCheck className="w-4 h-4 text-blue-400" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-[#32D74B]" />
                              )}
                              {isFree(p) ? 'Бесплатная активация' : p.method === 'stars' ? 'Telegram Stars' : 'Криптовалюта'}
                            </span>
                          </div>

                          <div className="w-full h-px bg-white/[0.05]" />

                          <div className="flex justify-between items-start gap-4">
                            <span className="text-[14px] text-[#8E8E93] shrink-0">Номер заказа</span>
                            <span className="text-[14px] text-white/60 font-mono tracking-tight text-right break-all">
                              {p.payment_uid || p.id}
                            </span>
                          </div>

                          {p.tx_hash && (
                            <>
                              <div className="w-full h-px bg-white/[0.05]" />
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[14px] text-[#8E8E93]">ID транзакции</span>
                                <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-xl border border-white/[0.05]">
                                  <span className="text-[13px] text-white/50 font-mono truncate max-w-[240px]">
                                    {String(p.tx_hash)}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(String(p.tx_hash));
                                      tg.showAlert('Скопировано');
                                    }}
                                    className="p-2 bg-white/10 hover:bg-white/15 rounded-lg active:scale-95 transition-all ml-3 shrink-0"
                                  >
                                    <Copy className="w-4 h-4 text-white/70" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}

                          <div className="pt-2">
                            <button
                              onClick={() => {
                                hapticFeedback.impactOccurred('light');
                                setSelectedReceipt(p);
                              }}
                              className="w-full h-11 bg-white/[0.08] hover:bg-white/[0.12] active:bg-white/[0.15] active:scale-[0.98] transition-all rounded-xl flex items-center justify-center gap-2 text-white font-medium text-[15px]"
                            >
                              <FileText className="w-4 h-4" />
                              Открыть кассовый чек
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-24">
                    <div className="w-20 h-20 bg-white/[0.03] rounded-[30px] flex items-center justify-center mx-auto mb-6 border border-white/5">
                      <History className="w-10 h-10 text-[#8E8E93]/20" />
                    </div>
                    <h4 className="text-[20px] font-bold text-white mb-2">История пуста</h4>
                    <p className="text-[15px] text-[#8E8E93] px-10 opacity-60">
                      Ваши завершенные транзакции будут отображаться здесь.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedReceipt && <ReceiptModal payment={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}
      </AnimatePresence>
    </div>
  );
}
