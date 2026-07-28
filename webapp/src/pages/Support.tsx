import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Ticket } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import { t, locale } from '../lib/i18n';
import { SectionTitle } from '../components/SectionTitle';
import { motion, AnimatePresence } from 'motion/react';
import Reviews from '../components/Reviews';
import { ReviewsSummary } from '../lib/api';
import {
  MessageSquarePlus,
  Globe,
  Star,
  ChevronRight,
  ChevronLeft,
  Send,
  Lock,
  Loader2,
  LifeBuoy,
  Headset,
  ArrowUp,
} from 'lucide-react';

type View = 'main' | 'chat' | 'country' | 'reviews';

const statusBadge = (status: string) =>
  status === 'open' ? (
    <span className="px-2.5 py-1 text-[11px] rounded-full uppercase font-bold tracking-wider bg-[#32D74B]/15 text-[#32D74B]">
      {t('sup.open')}
    </span>
  ) : (
    <span className="px-2.5 py-1 text-[11px] rounded-full uppercase font-bold tracking-wider bg-white/10 text-white/50">
      {t('sup.closed')}
    </span>
  );

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('sup.today');
  if (d.toDateString() === yest.toDateString()) return t('sup.yesterday');
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
};

// ============================================================
//  Чат с поддержкой — полноэкранная страница в стиле Telegram
// ============================================================
function SupportChat({
  ticket,
  onBack,
  onChanged,
}: {
  ticket: Ticket | null; // null = новый тикет, создастся первым сообщением
  onBack: () => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = ticket?.messages || [];
  const isOpen = !ticket || ticket.status === 'open';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (ticket) {
        await api.replyTicket(ticket.ticket_id, value);
      } else {
        await api.createTicket(value);
      }
      hapticFeedback.impactOccurred('light');
      setText('');
      onChanged();
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const closeTicket = async () => {
    if (!ticket || busy) return;
    setBusy(true);
    try {
      await api.closeTicket(ticket.ticket_id);
      hapticFeedback.notificationOccurred('success');
      onChanged();
      onBack();
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
      setBusy(false);
    }
  };

  // Группировка сообщений по дням для разделителей, как в Telegram
  let lastDay = '';

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#0C0C10]">
      {/* Шапка чата */}
      <div
        className="shrink-0 flex items-center gap-3 px-3 pb-3"
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 6px), 14px)',
        }}
      >
        <button
          onClick={onBack}
          className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <div className="w-10 h-10 rounded-full app-icon bg-gradient-to-b from-[#4DA6FF]/60 to-[#0A84FF]/30 flex items-center justify-center shrink-0">
          <Headset className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-white leading-tight">{t('sup.gigabyte')}</div>
          <div className="text-[12px] text-[#8E8E93]">
            {ticket ? <span className="font-mono">{ticket.ticket_id}</span> : t('sup.newTicket')}
            {ticket && !isOpen && t('sup.closedSuffix')}
          </div>
        </div>
        {ticket && isOpen && (
          <button
            onClick={closeTicket}
            className="w-9 h-9 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Закрыть тикет"
          >
            <Lock className="w-4 h-4 text-[#FF6961]" />
          </button>
        )}
      </div>

      {/* Лента сообщений */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto hidden-scrollbar px-3 py-4 flex flex-col gap-1.5">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-10">
            <div className="w-16 h-16 glass rounded-full flex items-center justify-center">
              <MessageSquarePlus className="w-8 h-8 text-[#4DA6FF]" />
            </div>
            <div className="text-[17px] font-semibold text-white">{t('sup.describe')}</div>
            <div className="text-[14px] text-[#8E8E93]">
              {t('sup.describeHint')}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const day = m.created_at ? dayLabel(m.created_at) : '';
          const showDay = day && day !== lastDay;
          lastDay = day || lastDay;
          const mine = !m.is_admin;
          return (
            <div key={i} className="flex flex-col">
              {showDay && (
                <div className="self-center my-2 px-3.5 py-1 rounded-full text-[12px] font-semibold text-white/60 glass-inner">
                  {day}
                </div>
              )}
              <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'relative max-w-[80%] px-3.5 py-2 text-[15px] leading-snug text-white',
                    mine ? 'chat-out' : 'chat-in',
                  )}
                >
                  <span className="whitespace-pre-wrap break-words">{m.message_text}</span>
                  <span
                    className={cn(
                      'inline-block align-bottom text-[10.5px] ml-2 translate-y-[3px]',
                      mine ? 'text-white/70' : 'text-white/40',
                    )}
                  >
                    {m.created_at
                      ? new Date(m.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Поле ввода как в Telegram */}
      {isOpen ? (
        <div
          className="shrink-0 px-3 pt-2.5 flex items-end gap-2"
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('sup.message')}
            className="flex-1 h-[42px] bg-white/[0.07] border border-white/10 rounded-full px-4 text-[16px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#0A84FF]/50"
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className={cn(
              'w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90',
              text.trim() ? 'btn-primary' : 'bg-white/[0.07] border border-white/10',
            )}
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <ArrowUp className={cn('w-5 h-5', text.trim() ? 'text-white' : 'text-white/30')} />
            )}
          </button>
        </div>
      ) : (
        <div
          className="shrink-0 text-center text-[13px] text-[#8E8E93] pt-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          {t('sup.ticketClosed')}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  Запрос новой страны — полноэкранная страница
// ============================================================
function CountryPage({ countries, onBack }: { countries: string[]; onBack: () => void }) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentFor, setSentFor] = useState<string | null>(null);

  const send = async (country: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.requestCountry(country);
      hapticFeedback.notificationOccurred('success');
      setSentFor(country);
      setCustom('');
    } catch (e: any) {
      tg.showAlert(e.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#050507] overflow-y-auto hidden-scrollbar">
      <div
        className="px-4 pb-10"
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 6px), 14px)',
        }}
      >
        <header className="flex items-center gap-3 mb-5">
          <button
            onClick={onBack}
            className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div>
            <h1 className="text-[26px] font-bold tracking-tight leading-tight">{t('sup.countryTitle')}</h1>
            <div className="text-[13px] text-[#8E8E93]">{t('sup.countrySub')}</div>
          </div>
        </header>

        <AnimatePresence>
          {sentFor && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="glass rounded-full px-5 py-3.5 mb-5 flex items-center gap-3"
            >
              <span className="text-[20px] emoji-flag">✅</span>
              <span className="text-[14px] text-white font-medium">{t('sup.sent', { c: sentFor })}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3 ml-4">
          {t('sup.popular')}
        </div>
        <div className="flex flex-col gap-2.5 mb-7">
          {countries.map((c) => {
            // Отделяем флаг-эмодзи (2 regional indicator символа) от названия,
            // чтобы флаг стоял ровно в своём кружке, а текст — отдельно.
            const m = c.match(/^(\p{RI}\p{RI})\s*(.*)$/u);
            const flag = m ? m[1] : '';
            const name = m ? m[2] : c;
            return (
              <button
                key={c}
                onClick={() => send(c)}
                disabled={busy}
                className="ios-list p-4 flex items-center gap-3.5 active:scale-[0.98] transition-transform disabled:opacity-50 w-full"
              >
                <div className="w-11 h-11 rounded-full glass-inner flex items-center justify-center shrink-0">
                  <span className="text-[24px] leading-none emoji-flag">{flag}</span>
                </div>
                <span className="flex-1 text-left text-[16px] font-semibold text-white">{name}</span>
                <Send className="w-4.5 h-4.5 text-[#0A84FF] shrink-0" />
              </button>
            );
          })}
        </div>

        <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3 ml-4">
          {t('sup.custom')}
        </div>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t('sup.customPh')}
            className="flex-1 h-[50px] glass rounded-full px-5 text-[16px] text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            onClick={() => custom.trim() && send(custom.trim())}
            disabled={busy || !custom.trim()}
            className="w-[50px] h-[50px] btn-primary rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shrink-0"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Send className="w-5 h-5 text-white" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Главная страница раздела «Помощь»
// ============================================================
export default function Support() {
  const { boot } = useApp();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('main');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  // сводку по отзывам держим здесь, чтобы на кнопке сразу был средний балл
  const [reviews, setReviews] = useState<ReviewsSummary | null>(null);

  const load = useCallback(async (): Promise<Ticket[]> => {
    try {
      const data = await api.tickets();
      setTickets(data);
      return data;
    } catch (e) {
      console.error(e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api.reviews().then(setReviews).catch(() => {});
  }, [load]);

  const activeTicket = activeTicketId ? tickets.find((t) => t.ticket_id === activeTicketId) || null : null;

  const openChat = (ticketId: string | null) => {
    hapticFeedback.selectionChanged();
    setActiveTicketId(ticketId);
    setView('chat');
  };

  const onChatChanged = async () => {
    const data = await load();
    // Новый тикет: после первого сообщения привязываем чат к созданному тикету
    if (!activeTicketId && data.length > 0) {
      const newest = [...data].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      setActiveTicketId(newest.ticket_id);
    }
  };

  if (view === 'chat') {
    return (
      <SupportChat
        ticket={activeTicket}
        onBack={() => {
          setView('main');
          setActiveTicketId(null);
          load();
        }}
        onChanged={onChatChanged}
      />
    );
  }

  if (view === 'country') {
    return <CountryPage countries={boot.countries} onBack={() => setView('main')} />;
  }

  if (view === 'reviews') {
    return <Reviews onBack={() => setView('main')} onChanged={setReviews} />;
  }

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
      <header className="pt-2">
        <SectionTitle className="mb-0 mt-2">{t('sup.title')}</SectionTitle>
      </header>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            const open = tickets.find((t) => t.status === 'open');
            openChat(open ? open.ticket_id : null);
          }}
          className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-12 h-12 app-icon bg-gradient-to-b from-[#4DA6FF]/50 to-[#0A84FF]/20 rounded-full flex items-center justify-center shrink-0">
            <MessageSquarePlus className="w-6 h-6 text-[#4DA6FF]" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[18px] font-bold text-white">{t('sup.chat')}</div>
            <div className="text-[14px] text-[#8E8E93]">{t('sup.chatHint')}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
        </button>

        <button
          onClick={() => {
            hapticFeedback.selectionChanged();
            setView('country');
          }}
          className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-12 h-12 app-icon bg-gradient-to-b from-[#32D74B]/50 to-[#32D74B]/15 rounded-full flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-[#32D74B]" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[18px] font-bold text-white">{t('sup.country')}</div>
            <div className="text-[14px] text-[#8E8E93]">{t('sup.countryHint')}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
        </button>

        <button
          onClick={() => {
            hapticFeedback.selectionChanged();
            setView('reviews');
          }}
          className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-12 h-12 app-icon bg-gradient-to-b from-[#FFD60A]/45 to-[#FF9F0A]/15 rounded-full flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 text-[#FFD60A]" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-[18px] font-bold text-white">{t('rev.entry')}</div>
            <div className="text-[14px] text-[#8E8E93] flex items-center gap-1.5">
              {reviews && reviews.count > 0 ? (
                <>
                  <Star className="w-3.5 h-3.5 text-[#FFD60A] fill-[#FFD60A] shrink-0" />
                  <span className="tabular-nums font-semibold text-white/80">{reviews.average.toFixed(1)}</span>
                  <span className="truncate">· {t('rev.entryHint')}</span>
                </>
              ) : (
                <span className="truncate">{t('rev.entryEmpty')}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#3C3C43]/60 shrink-0" />
        </button>
      </div>

      <section>
        <SectionTitle>{t('sup.myTickets')}</SectionTitle>
        {loading ? (
          <div className="ios-list p-6 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="ios-list p-8 text-center">
            <div className="w-14 h-14 glass-inner rounded-full flex items-center justify-center mx-auto mb-4">
              <LifeBuoy className="w-7 h-7 text-[#8E8E93]" />
            </div>
            <div className="text-[17px] font-semibold text-white mb-1">{t('sup.noTickets')}</div>
            <div className="text-[14px] text-[#8E8E93]">{t('sup.noTicketsHint')}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tickets.map((tk) => {
              const last = tk.messages[tk.messages.length - 1];
              return (
                <button key={tk.ticket_id} onClick={() => openChat(tk.ticket_id)} className="ios-list p-4 w-full flex items-center justify-between active:scale-[0.99] transition-transform">
                  <div className="flex flex-col gap-1 text-left flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-white font-mono">{tk.ticket_id}</span>
                      {statusBadge(tk.status)}
                    </div>
                    {last && (
                      <div className="text-[13px] text-[#8E8E93] truncate">
                        {last.is_admin ? t('sup.supp') : t('sup.you')}
                        {last.message_text}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#3C3C43]/60 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
