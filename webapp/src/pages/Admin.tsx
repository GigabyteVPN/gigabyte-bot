import { useCallback, useEffect, useState } from 'react';
import { api, Ticket, Tariff } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import {
  Users,
  BarChart3,
  Gift,
  Server,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  Send,
  DollarSign,
  Globe,
  ChevronRight,
  Star,
  Loader2,
  Copy,
  Check,
  Trash2,
  UserPlus,
  Download,
  TrendingUp,
} from 'lucide-react';

type View =
  | 'menu'
  | 'stats'
  | 'prices'
  | 'promo'
  | 'servers'
  | 'tickets'
  | 'broadcast'
  | 'country'
  | 'users'
  | 'give'
  | 'stars';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[13px] uppercase tracking-wide text-gray-500 font-medium mb-2 ml-4">{title}</div>
    {children}
  </div>
);

const Row = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <div className="flex justify-between items-center p-4 border-b border-white/5 last:border-b-0">
    <div className="text-[15px]">{label}</div>
    <div className={cn('text-[16px] font-semibold', accent || 'text-white')}>{value}</div>
  </div>
);

const CopyCode = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        hapticFeedback.selectionChanged();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-2 font-mono text-[14px] text-white active:opacity-60"
    >
      {value}
      {copied ? <Check className="w-3.5 h-3.5 text-[#32D74B]" /> : <Copy className="w-3.5 h-3.5 text-white/40" />}
    </button>
  );
};

function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
    } catch (e: any) {
      tg.showAlert(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, reload };
}

const Spinner = () => (
  <div className="bg-[#1C1C1E] rounded-[20px] p-8 flex justify-center">
    <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
  </div>
);

// ================== СТАТИСТИКА ==================
function StatsView() {
  const { data: stats, loading } = useAsyncData(() => api.admin.stats());
  if (loading || !stats) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <Section title="Сводка">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4 flex gap-4">
          <div className="flex-1">
            <div className="text-gray-400 text-[13px] mb-1">Всего юзеров</div>
            <div className="text-[28px] font-bold tracking-tight">{stats.users.total}</div>
          </div>
          <div className="w-[1px] bg-white/10" />
          <div className="flex-1">
            <div className="text-gray-400 text-[13px] mb-1">Новых за 24ч</div>
            <div className="text-[28px] font-bold tracking-tight">+{stats.users.new_today}</div>
          </div>
          <div className="w-[1px] bg-white/10" />
          <div className="flex-1">
            <div className="text-gray-400 text-[13px] mb-1">Подписок</div>
            <div className="text-[28px] font-bold tracking-tight text-[#32D74B]">{stats.subscriptions.active}</div>
          </div>
        </div>
      </Section>

      <Section title="Финансы">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          <Row label="Доход за сегодня" value={`₽ ${stats.finance.today.toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <Row label="Доход за 7 дней" value={`₽ ${stats.finance.week.toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <Row label="Доход за месяц" value={`₽ ${stats.finance.month.toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <Row label="Выручка всего" value={`₽ ${stats.finance.total.toLocaleString('ru-RU')}`} />
          <Row label="Средний чек" value={`₽ ${stats.finance.avg_check}`} />
          <Row label="ARPU" value={`₽ ${stats.finance.arpu}`} />
        </div>
      </Section>

      <Section title="Конверсия">
        <div className="bg-[#1C1C1E] rounded-[20px] p-5 space-y-5">
          <div>
            <div className="flex justify-between text-[15px] mb-2">
              <span className="text-gray-300">Платят от всех юзеров</span>
              <span className="font-semibold text-[#0A84FF]">{stats.finance.conversion_paid}%</span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#0A84FF] rounded-full" style={{ width: `${Math.min(stats.finance.conversion_paid, 100)}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[15px] mb-2">
              <span className="text-gray-300">Продлевают подписку</span>
              <span className="font-semibold text-[#32D74B]">{stats.finance.conversion_renewed}%</span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#32D74B] rounded-full" style={{ width: `${Math.min(stats.finance.conversion_renewed, 100)}%` }}></div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Подписки и заявки">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          <Row label="Истекают за 7 дней" value={stats.subscriptions.expiring_week} accent="text-[#FF9F0A]" />
          <Row label="Активировано триалов" value={stats.subscriptions.trials} />
          <Row label="Ожидающих платежей" value={stats.pending_payments} accent="text-[#FF9F0A]" />
          <Row label="Открытых тикетов" value={stats.open_tickets} accent={stats.open_tickets > 0 ? 'text-[#FF453A]' : undefined} />
        </div>
      </Section>

      <Section title="Способы оплаты">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {Object.entries(stats.methods as Record<string, { count: number; sum: number }>).map(([m, v]) => (
            <Row
              key={m}
              label={m === 'crypto' ? '₿ Криптовалюта' : m === 'stars' ? '⭐ Stars' : m === 'trial' ? '🎁 Триал' : m}
              value={`${v.count} шт · ₽${Math.round(v.sum).toLocaleString('ru-RU')}`}
            />
          ))}
        </div>
      </Section>

      <Section title="Топ серверов">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {(stats.top_servers as { name: string; count: number }[]).map((s, i) => (
            <Row key={i} label={`${i + 1}. ${s.name}`} value={`${s.count} подписок`} />
          ))}
        </div>
      </Section>

      <Section title="Последние платежи">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {stats.recent_payments.length === 0 && (
            <div className="text-center text-gray-500 py-4 text-[15px]">Нет недавних платежей</div>
          )}
          {(stats.recent_payments as any[]).map((p, i) => (
            <div key={i} className="flex items-center justify-between p-4 border-b border-white/5 last:border-b-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-[32px] h-[32px] rounded-full flex items-center justify-center',
                    p.method === 'crypto' ? 'bg-[#BF5AF2]/20 text-[#BF5AF2]' : 'bg-[#0A84FF]/20 text-[#0A84FF]',
                  )}
                >
                  {p.method === 'crypto' ? <DollarSign className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-[15px] text-white">ID: {p.user_id}</div>
                  <div className="text-[13px] text-gray-500">
                    {p.created_at ? new Date(p.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
              <div className="text-[16px] font-medium text-[#32D74B]">+₽{p.amount_rub || 0}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ================== КУРСЫ И ЦЕНЫ ==================
function PricesView() {
  const { data: rates, loading: ratesLoading } = useAsyncData(() => api.admin.rates());
  const { data: tariffs, loading: tarLoading, reload } = useAsyncData(() => api.admin.tariffs());
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  const applyPercent = async (percent: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.admin.updateTariffs({ mode: 'percent', value: percent });
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(`✅ Цены увеличены на ${percent}%`);
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const applyBase = async () => {
    const v = parseFloat(manual);
    if (!v || busy) return;
    setBusy(true);
    try {
      await api.admin.updateTariffs({ mode: 'base', value: v });
      hapticFeedback.notificationOccurred('success');
      tg.showAlert('✅ Цены пересчитаны от базовой');
      setManual('');
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: number | null | undefined) => (v ? `${Number(v).toFixed(2)} ₽` : '—');

  return (
    <div className="flex flex-col gap-6">
      <Section title="Текущие курсы">
        {ratesLoading || !rates ? (
          <Spinner />
        ) : (
          <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
            <Row label="ЦБ РФ" value={<span className="font-mono text-gray-400">{fmt(rates.usd_cbr)}</span>} />
            <Row label="Рыночный" value={<span className="font-mono text-gray-400">{fmt(rates.usd_market)}</span>} />
            <Row label="USDT P2P" value={<span className="font-mono text-[#0A84FF]">{fmt(rates.usdt_p2p)}</span>} />
            <Row label="Эффективный" value={<span className="font-mono text-[#FF9F0A]">{fmt(rates.usd_effective)}</span>} />
          </div>
        )}
      </Section>

      <Section title="Тарифы">
        {tarLoading || !tariffs ? (
          <Spinner />
        ) : (
          <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
            {tariffs.map((t: Tariff) => (
              <Row key={t.months} label={t.label} value={`${t.rub} ₽ · ⭐${t.stars}`} accent="text-[#32D74B]" />
            ))}
          </div>
        )}
      </Section>

      <Section title="Управление ценами">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden p-4">
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[10, 20, 30, 50].map((p) => (
              <button
                key={p}
                onClick={() => applyPercent(p)}
                disabled={busy}
                className="bg-white/5 text-[15px] font-medium py-3 rounded-xl active:bg-white/10 transition-colors disabled:opacity-50"
              >
                +{p}%
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Цена за 1 месяц, ₽"
              inputMode="numeric"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
            />
            <button
              onClick={applyBase}
              disabled={busy || !manual}
              className="px-5 bg-[#0A84FF] text-white text-[15px] font-semibold rounded-xl active:bg-[#0A84FF]/80 transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ОК'}
            </button>
          </div>
          <div className="text-[12px] text-gray-500 mt-3 px-1">
            3 мес = ×2.5 · 6 мес = ×4.5 · 1 год = ×8.5 от цены месяца
          </div>
        </div>
      </Section>
    </div>
  );
}

// ================== ПРОМОКОДЫ ==================
function PromoView() {
  const { data: keys, loading, reload } = useAsyncData(() => api.admin.promoKeys());
  const [busy, setBusy] = useState(false);

  const create = async (months: number | 'unlimited', label: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.admin.createPromo(months);
      hapticFeedback.notificationOccurred('success');
      navigator.clipboard.writeText(res.code);
      tg.showAlert(`✅ Ключ на ${label} создан и скопирован:\n${res.code}`);
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const options: [number | 'unlimited', string][] = [
    [1, '1 месяц'],
    [3, '3 месяца'],
    [6, '6 месяцев'],
    [12, '1 год'],
    ['unlimited', 'Бессрочно'],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section title="Создать ключ">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4">
          <div className="grid grid-cols-3 gap-2">
            {options.map(([m, label]) => (
              <button
                key={String(m)}
                onClick={() => create(m, label)}
                disabled={busy}
                className="bg-white/5 active:bg-white/10 text-[14px] font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Последние ключи">
        {loading ? (
          <Spinner />
        ) : (
          <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
            {(keys || []).length === 0 && (
              <div className="text-gray-500 text-[15px] py-4 text-center">Ключей пока нет</div>
            )}
            {(keys || []).map((k: any, i: number) => (
              <div key={i} className="flex justify-between items-center gap-2 p-4 border-b border-white/5 last:border-b-0">
                <CopyCode value={k.code} />
                <div className="text-right shrink-0">
                  <div className="text-[13px] text-gray-400">{k.label}</div>
                  <div className={cn('text-[12px] font-semibold', k.used ? 'text-gray-500' : 'text-[#32D74B]')}>
                    {k.used ? `Использован${k.used_by ? ` (${k.used_by})` : ''}` : 'Активен'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ================== СЕРВЕРЫ ==================
function ServersView() {
  const { data: servers, loading, reload } = useAsyncData(() => api.admin.servers());
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  const doSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const s = await api.admin.sync();
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(
        `✅ Синхронизация завершена\n\nСерверов: ${s.servers_ok}/${s.servers_total}\nИмпортировано: ${s.imported}\nОбновлено: ${s.updated}\nВосстановлено: ${s.restored}`,
      );
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const doImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const s = await api.admin.importClients();
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(`✅ Импорт завершён\n\nСерверов: ${s.servers}\nНовых: ${s.imported}\nПеренесено: ${s.moved}\nУже были: ${s.skipped}`);
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Операции">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4 flex flex-col gap-3">
          <button
            onClick={doSync}
            disabled={syncing || importing}
            className="w-full bg-[#0A84FF] text-white text-[16px] font-semibold py-3.5 rounded-xl active:bg-[#0A84FF]/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {syncing ? 'Синхронизация… (до минуты)' : 'Синхронизировать серверы'}
          </button>
          <button
            onClick={doImport}
            disabled={syncing || importing}
            className="w-full bg-white/[0.07] text-white text-[16px] font-semibold py-3.5 rounded-xl active:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {importing ? 'Импорт…' : 'Импорт клиентов из панели'}
          </button>
        </div>
      </Section>

      <Section title="Наши ноды">
        {loading ? (
          <Spinner />
        ) : (
          <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
            {(servers || []).map((s: any) => (
              <div key={s.id} className="flex justify-between items-center p-4 border-b border-white/5 last:border-b-0">
                <div>
                  <div className="text-[16px] font-medium flex items-center gap-2">
                    {s.flag} {s.name}
                    <div className={cn('w-2 h-2 rounded-full', s.is_active ? 'bg-[#32D74B]' : 'bg-[#FF453A]')} />
                  </div>
                  <div className="text-[13px] text-gray-500 mt-0.5 font-mono">{s.ip || '—'}</div>
                </div>
                <div className="text-[14px] text-gray-400">inbound: {s.inbound_id}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ================== ТИКЕТЫ ==================
function TicketsView() {
  const { data: tickets, loading, reload } = useAsyncData(() => api.admin.tickets());
  const [replyFor, setReplyFor] = useState<Ticket | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!replyFor || !text.trim() || busy) return;
    setBusy(true);
    try {
      await api.replyTicket(replyFor.ticket_id, text.trim());
      hapticFeedback.notificationOccurred('success');
      setReplyFor(null);
      setText('');
      tg.showAlert('✅ Ответ отправлен пользователю');
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = async (t: Ticket) => {
    try {
      await api.closeTicket(t.ticket_id);
      hapticFeedback.notificationOccurred('success');
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    }
  };

  if (loading) return <Spinner />;

  const open = (tickets || []).filter((t: Ticket) => t.status === 'open');
  const closed = (tickets || []).filter((t: Ticket) => t.status !== 'open');

  const TicketCard = ({ t }: { t: Ticket }) => (
    <div className="p-4 flex flex-col gap-2 border-b border-white/5 last:border-b-0">
      <div className="flex justify-between items-center">
        <div className="text-[15px] font-medium text-white">
          {t.username ? `@${t.username}` : t.full_name || `ID: ${t.user_id}`}
          <span className="text-gray-500 font-mono text-[12px] ml-2">{t.ticket_id}</span>
        </div>
        <div
          className={cn(
            'px-2.5 py-1 text-[11px] rounded uppercase font-bold tracking-wider',
            t.status === 'open' ? 'bg-[#FF453A]/20 text-[#FF453A]' : 'bg-[#32D74B]/20 text-[#32D74B]',
          )}
        >
          {t.status}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {t.messages.slice(-3).map((m, i) => (
          <div key={i} className="text-[14px] leading-snug">
            <span className={cn('font-bold', m.is_admin ? 'text-[#0A84FF]' : 'text-gray-400')}>
              {m.is_admin ? 'Админ: ' : 'Юзер: '}
            </span>
            <span className="text-gray-300">{m.message_text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[13px] text-gray-500">{new Date(t.created_at).toLocaleString('ru-RU')}</div>
        {t.status === 'open' && (
          <div className="flex gap-4">
            <button onClick={() => setReplyFor(t)} className="text-[#0A84FF] text-[15px] font-medium active:opacity-60">
              Ответить
            </button>
            <button onClick={() => close(t)} className="text-[#FF453A] text-[15px] font-medium active:opacity-60">
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Section title={`Открытые (${open.length})`}>
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {open.length === 0 && <div className="text-gray-500 text-[15px] text-center py-6">Открытых обращений нет</div>}
          {open.map((t: Ticket) => (
            <TicketCard key={t.ticket_id} t={t} />
          ))}
        </div>
      </Section>
      {closed.length > 0 && (
        <Section title="Закрытые">
          <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden opacity-70">
            {closed.slice(0, 10).map((t: Ticket) => (
              <TicketCard key={t.ticket_id} t={t} />
            ))}
          </div>
        </Section>
      )}

      {replyFor && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 backdrop-blur-md" onClick={() => setReplyFor(null)}>
          <div
            className="w-full max-w-[440px] bg-[#1C1C1E] rounded-t-[32px] p-6 pb-10 border-t border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-bold text-white mb-3">Ответ на {replyFor.ticket_id}</h3>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Текст ответа…"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
              autoFocus
            />
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="w-full py-3.5 bg-[#0A84FF] rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Отправить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================== ЗАПРОСЫ СТРАН ==================
function CountryView() {
  const { data: reqs, loading, reload } = useAsyncData(() => api.admin.countryRequests());
  const [replyFor, setReplyFor] = useState<any | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!replyFor || !text.trim() || busy) return;
    setBusy(true);
    try {
      await api.admin.replyCountry(replyFor.request_id, text.trim());
      hapticFeedback.notificationOccurred('success');
      setReplyFor(null);
      setText('');
      tg.showAlert('✅ Ответ отправлен, запрос закрыт');
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <Section title={`Открытые запросы (${(reqs || []).length})`}>
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {(reqs || []).length === 0 && (
            <div className="text-gray-500 text-[15px] text-center py-6">Нет открытых запросов</div>
          )}
          {(reqs || []).map((r: any) => (
            <div key={r.request_id} className="p-4 flex justify-between items-center border-b border-white/5 last:border-b-0">
              <div>
                <div className="text-[16px] font-medium text-white emoji-flag">{r.country}</div>
                <div className="text-[13px] text-gray-500 mt-0.5">
                  От: {r.user_id} · {new Date(r.created_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
              <button onClick={() => setReplyFor(r)} className="text-[#0A84FF] text-[15px] font-medium active:opacity-60">
                Ответить
              </button>
            </div>
          ))}
        </div>
      </Section>

      {replyFor && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 backdrop-blur-md" onClick={() => setReplyFor(null)}>
          <div
            className="w-full max-w-[440px] bg-[#1C1C1E] rounded-t-[32px] p-6 pb-10 border-t border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-bold text-white mb-3">
              Ответ на запрос: <span className="emoji-flag">{replyFor.country}</span>
            </h3>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Текст ответа пользователю…"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
              autoFocus
            />
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="w-full py-3.5 bg-[#0A84FF] rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Отправить и закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================== РАССЫЛКА ==================
function BroadcastView() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.admin.broadcast(text.trim());
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(`✅ Рассылка запущена для ${res.queued} пользователей.\nОтчёт придёт в чат с ботом.`);
      setText('');
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Сообщение всем пользователям">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Текст рассылки (поддерживается HTML-разметка Telegram)…"
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-4 resize-none"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full py-4 bg-[#0A84FF] rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Запустить рассылку
          </button>
          <div className="text-[12px] text-gray-500 mt-3 px-1">
            Рассылка выполняется в фоне (~20 сообщений/сек). Итоговый отчёт бот пришлёт вам в личку.
          </div>
        </div>
      </Section>
    </div>
  );
}

// ================== ВЫДАТЬ ПОДПИСКУ ==================
function GiveSubView() {
  const { boot } = useApp();
  const [userId, setUserId] = useState('');
  const [serverId, setServerId] = useState<number | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const monthOptions: [number, string][] = [
    [1, '1 мес'],
    [3, '3 мес'],
    [6, '6 мес'],
    [12, '1 год'],
    [-1, '∞'],
  ];

  const create = async () => {
    if (!userId || !serverId || months === null || busy) return;
    setBusy(true);
    try {
      const res = await api.admin.createSubscription(parseInt(userId, 10), serverId, months);
      hapticFeedback.notificationOccurred('success');
      navigator.clipboard.writeText(res.sub_link);
      tg.showAlert(`🎉 Подписка создана, пользователь уведомлён.\nСсылка скопирована:\n${res.sub_link}`);
      setUserId('');
      setServerId(null);
      setMonths(null);
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Telegram ID пользователя">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
            placeholder="Например: 7017630225"
            inputMode="numeric"
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-[16px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
          />
        </div>
      </Section>

      <Section title="Сервер">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4 grid grid-cols-2 gap-2">
          {boot.servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setServerId(s.id)}
              className={cn(
                'p-3 rounded-xl text-[14px] font-medium text-left transition-colors',
                serverId === s.id ? 'bg-[#0A84FF] text-white' : 'bg-white/5 text-white active:bg-white/10',
              )}
            >
              {s.flag} {s.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Срок">
        <div className="bg-[#1C1C1E] rounded-[20px] p-4 grid grid-cols-5 gap-2">
          {monthOptions.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={cn(
                'py-3 rounded-xl text-[14px] font-semibold transition-colors',
                months === m ? 'bg-[#32D74B] text-black' : 'bg-white/5 text-white active:bg-white/10',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <button
        onClick={create}
        disabled={busy || !userId || !serverId || months === null}
        className="w-full py-4 bg-[#0A84FF] rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
        Создать подписку
      </button>
    </div>
  );
}

// ================== ПОЛЬЗОВАТЕЛИ ==================
function UsersView() {
  const { data: users, loading, reload } = useAsyncData(() => api.admin.users(200));
  const [confirm, setConfirm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await api.admin.deleteUser(confirm.user_id);
      hapticFeedback.notificationOccurred('success');
      setConfirm(null);
      reload();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <Section title={`Пользователи (${(users || []).length})`}>
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          {(users || []).map((u: any) => (
            <div key={u.user_id} className="p-4 flex justify-between items-center border-b border-white/5 last:border-b-0">
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-white truncate">
                  {u.username ? `@${u.username}` : u.full_name || u.user_id}
                  {u.is_admin && <span className="text-[11px] text-[#FF9F0A] font-bold ml-2">ADMIN</span>}
                </div>
                <div className="text-[13px] text-gray-500 font-mono">{u.user_id}</div>
                <div className="text-[13px] text-gray-400 mt-0.5">
                  Подписок: {u.active_subs} · Оплачено: ₽{Math.round(u.total_paid)}
                </div>
              </div>
              {!u.is_admin && (
                <button
                  onClick={() => setConfirm(u)}
                  className="w-9 h-9 bg-white/[0.05] rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0 ml-3"
                >
                  <Trash2 className="w-4 h-4 text-[#FF453A]/80" />
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>

      {confirm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-md px-6" onClick={() => setConfirm(null)}>
          <div className="bg-[#1C1C1E] rounded-[28px] p-6 w-full max-w-[360px] border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-bold text-white mb-2">Удалить пользователя {confirm.user_id}?</div>
            <div className="text-[14px] text-gray-400 mb-5">
              Удалятся все его подписки (включая клиентов в панелях), платежи и тикеты. Действие необратимо.
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={remove}
                disabled={busy}
                className="w-full py-3.5 bg-[#FF453A] rounded-2xl text-white font-bold text-[16px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />} Удалить навсегда
              </button>
              <button onClick={() => setConfirm(null)} className="w-full py-3.5 bg-white/[0.08] rounded-2xl text-white font-semibold text-[16px]">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================== БАЛАНС ЗВЁЗД ==================
function StarsView() {
  const { data: bal, loading } = useAsyncData(() => api.admin.starsBalance());
  if (loading || !bal) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <Section title="Баланс (Telegram API)">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          <Row label="Доступно к выводу" value={`${bal.available} ⭐`} accent="text-[#32D74B]" />
          <Row label="Заморожено (до 21 дня)" value={`${bal.frozen} ⭐`} accent="text-[#FF9F0A]" />
          <Row label="Всего заработано" value={`${bal.total} ⭐`} />
          <Row label="Выведено / списано" value={`${bal.outgoing_total} ⭐`} />
          <Row label="Входящих транзакций" value={bal.incoming_count} />
        </div>
      </Section>
      <Section title="По данным бота">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden">
          <Row label="Оплат звёздами всего" value={bal.db_count} />
          <Row label="В рублёвом эквиваленте" value={`₽ ${Math.round(bal.db_rub_total).toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <Row label="За 30 дней" value={`${bal.db_count_30} шт · ₽${Math.round(bal.db_rub_30).toLocaleString('ru-RU')}`} />
        </div>
      </Section>
    </div>
  );
}

// ================== ГЛАВНОЕ МЕНЮ ==================
const VIEWS: Record<Exclude<View, 'menu'>, { title: string; component: React.ComponentType }> = {
  stats: { title: 'Статистика', component: StatsView },
  prices: { title: 'Курсы и цены', component: PricesView },
  promo: { title: 'Промокоды', component: PromoView },
  servers: { title: 'Серверы', component: ServersView },
  tickets: { title: 'Тикеты', component: TicketsView },
  country: { title: 'Запросы стран', component: CountryView },
  broadcast: { title: 'Рассылка', component: BroadcastView },
  give: { title: 'Выдать подписку', component: GiveSubView },
  users: { title: 'Пользователи', component: UsersView },
  stars: { title: 'Баланс Stars', component: StarsView },
};

const MenuItem = ({
  icon: Icon,
  color,
  label,
  onClick,
}: {
  icon: React.ElementType;
  color: string;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="flex items-center justify-between p-4 bg-transparent border-b border-white/5 last:border-b-0 active:bg-white/5 transition-colors w-full"
  >
    <div className="flex items-center gap-4">
      <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shadow-md" style={{ backgroundColor: color }}>
        <Icon className="w-[18px] h-[18px] text-white" />
      </div>
      <div className="text-[17px] font-medium">{label}</div>
    </div>
    <ChevronRight className="w-[18px] h-[18px] text-gray-500/80" />
  </button>
);

export default function Admin() {
  const [view, setView] = useState<View>('menu');

  const goTo = (v: View) => {
    hapticFeedback.selectionChanged();
    setView(v);
  };

  if (view !== 'menu') {
    const { title, component: Component } = VIEWS[view];
    return (
      <div className="p-5 flex flex-col gap-6 animate-in slide-in-from-right-8 duration-300 pb-6">
        <header className="flex items-center mb-2 pt-4">
          <button onClick={() => goTo('menu')} className="p-2 -ml-2 bg-white/5 hover:bg-white/10 rounded-full active:scale-90">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-[22px] font-bold ml-2">{title}</h2>
        </header>
        <Component />
      </div>
    );
  }

  return (
    <div className="px-4 pt-10 flex flex-col gap-6 animate-in fade-in duration-300 pb-10">
      <header className="mb-2 pt-2 ml-1">
        <h1 className="text-[34px] font-bold tracking-tight">Админ-панель</h1>
      </header>

      <Section title="Управление">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden flex flex-col">
          <MenuItem icon={BarChart3} color="#0A84FF" label="Статистика" onClick={() => goTo('stats')} />
          <MenuItem icon={DollarSign} color="#32D74B" label="Курсы и цены" onClick={() => goTo('prices')} />
          <MenuItem icon={Star} color="#FF9F0A" label="Баланс Stars" onClick={() => goTo('stars')} />
          <MenuItem icon={Gift} color="#BF5AF2" label="Промокоды" onClick={() => goTo('promo')} />
          <MenuItem icon={Server} color="#FF9F0A" label="Серверы и синхронизация" onClick={() => goTo('servers')} />
        </div>
      </Section>

      <Section title="Аудитория">
        <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden flex flex-col">
          <MenuItem icon={MessageSquare} color="#FF453A" label="Тикеты поддержки" onClick={() => goTo('tickets')} />
          <MenuItem icon={Globe} color="#32D74B" label="Запросы стран" onClick={() => goTo('country')} />
          <MenuItem icon={Send} color="#5E5CE6" label="Рассылка" onClick={() => goTo('broadcast')} />
          <MenuItem icon={UserPlus} color="#8E8E93" label="Выдать подписку" onClick={() => goTo('give')} />
          <MenuItem icon={Users} color="#0A84FF" label="Пользователи" onClick={() => goTo('users')} />
        </div>
      </Section>
    </div>
  );
}
