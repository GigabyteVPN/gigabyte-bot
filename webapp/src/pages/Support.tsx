import { useCallback, useEffect, useState } from 'react';
import { api, Ticket } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquarePlus,
  Globe,
  ChevronRight,
  Send,
  Lock,
  Loader2,
  LifeBuoy,
  X,
} from 'lucide-react';

const statusBadge = (status: string) =>
  status === 'open' ? (
    <span className="px-2.5 py-1 text-[11px] rounded-lg uppercase font-bold tracking-wider bg-[#32D74B]/15 text-[#32D74B]">
      Открыт
    </span>
  ) : (
    <span className="px-2.5 py-1 text-[11px] rounded-lg uppercase font-bold tracking-wider bg-white/10 text-white/50">
      Закрыт
    </span>
  );

function TicketThread({
  ticket,
  onClose,
  onChanged,
}: {
  ticket: Ticket;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = reply.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api.replyTicket(ticket.ticket_id, text);
      hapticFeedback.notificationOccurred('success');
      setReply('');
      onChanged();
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.closeTicket(ticket.ticket_id);
      hapticFeedback.notificationOccurred('success');
      onChanged();
      onClose();
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 250 }}
        className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[32px] pt-5 px-5 pb-8 border-t border-white/10 flex flex-col h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 shrink-0">
          <div>
            <div className="text-[17px] font-bold text-white font-mono">{ticket.ticket_id}</div>
            <div className="mt-1">{statusBadge(ticket.status)}</div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-white/40 active:scale-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto hidden-scrollbar flex flex-col gap-3 py-2">
          {ticket.messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3',
                m.is_admin
                  ? 'glass-inner self-start rounded-bl-md'
                  : 'btn-primary self-end rounded-br-md',
              )}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1">
                {m.is_admin ? 'Поддержка' : 'Вы'}
              </div>
              <div className="text-[15px] text-white whitespace-pre-wrap break-words">{m.message_text}</div>
              <div className="text-[11px] opacity-50 mt-1 text-right">
                {m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : ''}
              </div>
            </div>
          ))}
        </div>

        {ticket.status === 'open' ? (
          <div className="shrink-0 flex flex-col gap-2 pt-3">
            <div className="flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Ваше сообщение…"
                className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button
                onClick={send}
                disabled={busy || !reply.trim()}
                className="w-12 h-12 btn-primary rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shrink-0"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Send className="w-5 h-5 text-white" />}
              </button>
            </div>
            <button
              onClick={close}
              disabled={busy}
              className="w-full py-3 bg-white/[0.06] rounded-2xl text-[#FF453A] font-semibold text-[14px] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Закрыть тикет
            </button>
          </div>
        ) : (
          <div className="shrink-0 text-center text-[13px] text-[#8E8E93] pt-3">Тикет закрыт</div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Support() {
  const { boot } = useApp();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newText, setNewText] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [customCountry, setCustomCountry] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.tickets();
      setTickets(data);
      setOpenTicket((prev) => (prev ? data.find((t) => t.ticket_id === prev.ticket_id) || null : null));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTicket = async () => {
    const text = newText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api.createTicket(text);
      hapticFeedback.notificationOccurred('success');
      setNewOpen(false);
      setNewText('');
      tg.showAlert('✅ Тикет создан. Мы ответим в ближайшее время!');
      load();
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const sendCountry = async (country: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.requestCountry(country);
      hapticFeedback.notificationOccurred('success');
      setCountryOpen(false);
      setCustomCountry('');
      tg.showAlert('✅ Запрос отправлен администратору. Спасибо!');
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-10 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
      <header className="mb-1 pt-2 ml-1">
        <h1 className="text-[30px] font-bold tracking-tight">Помощь</h1>
      </header>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            hapticFeedback.selectionChanged();
            setNewOpen(true);
          }}
          className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-12 h-12 bg-[#0A84FF]/15 rounded-full flex items-center justify-center border border-[#0A84FF]/30 shrink-0">
            <MessageSquarePlus className="w-6 h-6 text-[#0A84FF]" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[18px] font-bold text-white">Написать в поддержку</div>
            <div className="text-[14px] text-[#8E8E93]">Ответим в ближайшее время</div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
        </button>

        <button
          onClick={() => {
            hapticFeedback.selectionChanged();
            setCountryOpen(true);
          }}
          className="ios-list p-5 flex items-center gap-4 active:scale-[0.99] transition-transform"
        >
          <div className="w-12 h-12 bg-[#32D74B]/15 rounded-full flex items-center justify-center border border-[#32D74B]/30 shrink-0">
            <Globe className="w-6 h-6 text-[#32D74B]" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-[18px] font-bold text-white">Запросить новую страну</div>
            <div className="text-[14px] text-[#8E8E93]">Предложите локацию сервера</div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#3C3C43]/60" />
        </button>
      </div>

      <section>
        <h2 className="text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-3 ml-4">Мои обращения</h2>
        {loading ? (
          <div className="ios-list p-6 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="ios-list p-8 text-center glass">
            <div className="w-14 h-14 bg-[#2C2C2E] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/[0.08]">
              <LifeBuoy className="w-7 h-7 text-[#8E8E93]" />
            </div>
            <div className="text-[17px] font-semibold text-white mb-1">Обращений пока нет</div>
            <div className="text-[14px] text-[#8E8E93]">Если возникнет вопрос — напишите нам.</div>
          </div>
        ) : (
          <div className="ios-list overflow-hidden">
            {tickets.map((t) => {
              const last = t.messages[t.messages.length - 1];
              return (
                <button
                  key={t.ticket_id}
                  onClick={() => {
                    hapticFeedback.selectionChanged();
                    setOpenTicket(t);
                  }}
                  className="ios-list-item w-full"
                >
                  <div className="flex flex-col gap-1 text-left flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold text-white font-mono">{t.ticket_id}</span>
                      {statusBadge(t.status)}
                    </div>
                    {last && (
                      <div className="text-[13px] text-[#8E8E93] truncate">
                        {last.is_admin ? 'Поддержка: ' : 'Вы: '}
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

      {/* Модалка нового тикета */}
      <AnimatePresence>
        {newOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => !busy && setNewOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
              className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[32px] p-6 pb-10 border-t border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[20px] font-bold text-white mb-1">✍️ Опишите проблему</h3>
              <p className="text-[14px] text-[#8E8E93] mb-4">Мы ответим прямо здесь и продублируем в чат с ботом.</p>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={4}
                placeholder="Например: не подключается сервер Нидерланды…"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-4 resize-none"
                autoFocus
              />
              <button
                onClick={createTicket}
                disabled={busy || !newText.trim()}
                className="w-full py-4 btn-primary rounded-2xl text-white font-bold text-[16px] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Отправить
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модалка запроса страны */}
      <AnimatePresence>
        {countryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => !busy && setCountryOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 250 }}
              className="w-full max-w-[440px] glass-sheet rounded-t-[36px] sm:rounded-[32px] p-6 pb-10 border-t border-white/10 max-h-[80vh] overflow-y-auto hidden-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[20px] font-bold text-white mb-1">🌍 Новая страна</h3>
              <p className="text-[14px] text-[#8E8E93] mb-4">Выберите из списка или напишите свою.</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {boot.countries.map((c) => (
                  <button
                    key={c}
                    onClick={() => sendCountry(c)}
                    disabled={busy}
                    className="p-3 bg-white/[0.05] rounded-xl text-[14px] font-medium text-white active:scale-[0.97] transition-transform disabled:opacity-50 text-left emoji-flag"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={customCountry}
                  onChange={(e) => setCustomCountry(e.target.value)}
                  placeholder="Своя страна…"
                  className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#32D74B]/60"
                />
                <button
                  onClick={() => customCountry.trim() && sendCountry(customCountry.trim())}
                  disabled={busy || !customCountry.trim()}
                  className="w-12 h-12 bg-[#32D74B] rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shrink-0"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin text-black" /> : <Send className="w-5 h-5 text-black" />}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openTicket && <TicketThread ticket={openTicket} onClose={() => setOpenTicket(null)} onChanged={load} />}
      </AnimatePresence>
    </div>
  );
}
