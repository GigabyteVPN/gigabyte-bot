import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, Ticket, Tariff } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { BottomNav, NavTab } from '../components/layout/BottomNav';
import {
  Users,
  Gauge,
  Server,
  ArrowUpRight,
  LifeBuoy,
  RefreshCw,
  Send,
  Wallet,
  Globe,
  Star,
  Loader2,
  Copy,
  Check,
  Trash2,
  UserPlus,
  Download,
  TrendingUp,
  CreditCard,
  Ticket as TicketIcon,
  Hourglass,
  MessageSquare,
} from 'lucide-react';

// ============================================================
//  Общие элементы дизайна
// ============================================================

const PageHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <header className="mb-1 pt-2 ml-1">
    <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
    {subtitle && <div className="text-[14px] text-[#8E8E93] mt-0.5">{subtitle}</div>}
  </header>
);

const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div>
    {title && (
      <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2.5 ml-4">{title}</div>
    )}
    {children}
  </div>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('glass rounded-[28px] overflow-hidden', className)}>{children}</div>
);

const Row = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.06] last:border-b-0">
    <div className="text-[15px] text-white/85">{label}</div>
    <div className={cn('text-[16px] font-semibold', accent || 'text-white')}>{value}</div>
  </div>
);

const Spinner = () => (
  <div className="glass rounded-[28px] p-8 flex justify-center">
    <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full"></div>
  </div>
);

// Сегментированный контрол в стиле iOS с «жидкой» подушкой
function Segmented({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="glass rounded-full p-1 flex relative">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => {
            hapticFeedback.selectionChanged();
            onChange(o.key);
          }}
          className="relative flex-1 py-2.5 rounded-full text-[13px] font-semibold transition-colors"
        >
          {value === o.key && (
            <motion.div
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.3)',
              }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            />
          )}
          <span className={cn('relative z-10', value === o.key ? 'text-white' : 'text-white/40')}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

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
      className="flex items-center gap-2 font-mono text-[13px] text-white active:opacity-60"
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

// Bottom-sheet в плотном стекле
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
        className="w-full max-w-[440px] glass-sheet rounded-t-[36px] p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 bg-white/20 rounded-full mb-4 -mt-1" />
        {children}
      </motion.div>
    </div>
  );
}

// ============================================================
//  ОБЗОР
// ============================================================

function OverviewPage() {
  const { data: stats, loading, reload } = useAsyncData(() => api.admin.stats());

  if (loading || !stats) {
    return (
      <div className="px-4 pt-10 flex flex-col gap-5 pb-8">
        <PageHeader title="Обзор" />
        <Spinner />
      </div>
    );
  }

  const tiles = [
    { label: 'Пользователи', value: stats.users.total, sub: `+${stats.users.new_today} сегодня`, icon: Users, tint: '#0A84FF' },
    { label: 'Активные подписки', value: stats.subscriptions.active, sub: `${stats.subscriptions.expiring_week} истекают за 7д`, icon: Gauge, tint: '#32D74B' },
    { label: 'Ожидают оплаты', value: stats.pending_payments, sub: 'платежей в очереди', icon: Hourglass, tint: '#FF9F0A' },
    { label: 'Открытые тикеты', value: stats.open_tickets, sub: 'ждут ответа', icon: TicketIcon, tint: '#FF453A' },
  ];

  return (
    <div className="px-4 pt-10 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Обзор"
          subtitle={new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}
        />
        <button
          onClick={() => {
            hapticFeedback.impactOccurred('light');
            reload();
          }}
          className="mt-4 w-11 h-11 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
        >
          <RefreshCw className="w-5 h-5 text-white/70" />
        </button>
      </div>

      {/* Финансовый hero-блок */}
      <div
        className="rounded-[32px] p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(150deg, rgba(10,132,255,0.32), rgba(94,92,230,0.18) 55%, rgba(255,255,255,0.05))',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 12px 48px rgba(10,132,255,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#0A84FF]/25 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold text-white/60 mb-2">
          <TrendingUp className="w-4 h-4" /> Доход сегодня
        </div>
        <div className="text-[44px] font-bold tracking-tight leading-none mb-5">
          ₽ {stats.finance.today.toLocaleString('ru-RU')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['7 дней', stats.finance.week],
            ['30 дней', stats.finance.month],
            ['Всего', stats.finance.total],
          ].map(([label, v]) => (
            <div key={label as string} className="glass-inner rounded-2xl px-3 py-2.5">
              <div className="text-[11px] text-white/50 font-medium uppercase tracking-wider">{label}</div>
              <div className="text-[16px] font-bold mt-0.5">₽{Number(v).toLocaleString('ru-RU')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Плитки-метрики */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-[28px] p-4">
            <div
              className="w-9 h-9 rounded-xl app-icon flex items-center justify-center mb-3"
              style={{ background: `linear-gradient(180deg, ${t.tint}55, ${t.tint}22)` }}
            >
              <t.icon className="w-[18px] h-[18px]" style={{ color: t.tint }} />
            </div>
            <div className="text-[26px] font-bold tracking-tight leading-none">{t.value}</div>
            <div className="text-[13px] text-white/85 font-medium mt-1.5">{t.label}</div>
            <div className="text-[12px] text-[#8E8E93] mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>

      <Section title="Конверсия">
        <Card className="p-5 space-y-5">
          {[
            ['Платят от всех юзеров', stats.finance.conversion_paid, '#0A84FF'],
            ['Продлевают подписку', stats.finance.conversion_renewed, '#32D74B'],
          ].map(([label, v, color]) => (
            <div key={label as string}>
              <div className="flex justify-between text-[14px] mb-2">
                <span className="text-white/80">{label}</span>
                <span className="font-semibold" style={{ color: color as string }}>
                  {v}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(Number(v), 100)}%`,
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                    boxShadow: `0 0 12px ${color}66`,
                  }}
                ></div>
              </div>
            </div>
          ))}
          <div className="flex justify-between text-[13px] text-[#8E8E93] pt-1">
            <span>Средний чек: ₽{stats.finance.avg_check}</span>
            <span>ARPU: ₽{stats.finance.arpu}</span>
          </div>
        </Card>
      </Section>

      <Section title="Способы оплаты">
        <Card>
          {Object.entries(stats.methods as Record<string, { count: number; sum: number }>).map(([m, v]) => (
            <Row
              key={m}
              label={m === 'crypto' ? '₿ Криптовалюта' : m === 'stars' ? '⭐ Telegram Stars' : m === 'trial' ? '🎁 Триал' : m}
              value={`${v.count} шт · ₽${Math.round(v.sum).toLocaleString('ru-RU')}`}
            />
          ))}
        </Card>
      </Section>

      <Section title="Топ серверов">
        <Card>
          {(stats.top_servers as { name: string; count: number }[]).map((s, i) => (
            <Row key={i} label={`${i + 1}. ${s.name}`} value={`${s.count}`} />
          ))}
        </Card>
      </Section>

      <Section title="Последние платежи">
        <Card>
          {stats.recent_payments.length === 0 && (
            <div className="text-center text-[#8E8E93] py-5 text-[15px]">Нет недавних платежей</div>
          )}
          {(stats.recent_payments as any[]).map((p, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] last:border-b-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center app-icon',
                    p.method === 'crypto'
                      ? 'bg-gradient-to-b from-[#BF5AF2]/50 to-[#BF5AF2]/15 text-[#BF5AF2]'
                      : 'bg-gradient-to-b from-[#0A84FF]/50 to-[#0A84FF]/15 text-[#4DA6FF]',
                  )}
                >
                  {p.method === 'crypto' ? <Wallet className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-[14px] text-white font-medium">ID {p.user_id}</div>
                  <div className="text-[12px] text-[#8E8E93]">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
              </div>
              <div className="text-[15px] font-semibold text-[#32D74B]">+₽{p.amount_rub || 0}</div>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}

// ============================================================
//  ПРОДАЖИ: тарифы / промокоды / Stars
// ============================================================

function TariffsTab() {
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
      <Section title="Тарифы">
        {tarLoading || !tariffs ? (
          <Spinner />
        ) : (
          <Card>
            {tariffs.map((t: Tariff) => (
              <Row key={t.months} label={t.label} value={`${t.rub} ₽ · ⭐${t.stars}`} accent="text-[#32D74B]" />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Управление ценами">
        <Card className="p-4">
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[10, 20, 30, 50].map((p) => (
              <button
                key={p}
                onClick={() => applyPercent(p)}
                disabled={busy}
                className="btn-glass text-[15px] font-semibold py-3 rounded-2xl active:scale-[0.96] transition-transform disabled:opacity-50"
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
              className="flex-1 bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
            />
            <button
              onClick={applyBase}
              disabled={busy || !manual}
              className="px-6 btn-primary text-white text-[15px] font-semibold rounded-2xl active:scale-[0.96] transition-transform disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ОК'}
            </button>
          </div>
          <div className="text-[12px] text-[#8E8E93] mt-3 px-1">3 мес = ×2.5 · 6 мес = ×4.5 · 1 год = ×8.5 от цены месяца</div>
        </Card>
      </Section>

      <Section title="Текущие курсы">
        {ratesLoading || !rates ? (
          <Spinner />
        ) : (
          <Card>
            <Row label="ЦБ РФ" value={<span className="font-mono text-white/60">{fmt(rates.usd_cbr)}</span>} />
            <Row label="Рыночный" value={<span className="font-mono text-white/60">{fmt(rates.usd_market)}</span>} />
            <Row label="USDT P2P" value={<span className="font-mono text-[#4DA6FF]">{fmt(rates.usdt_p2p)}</span>} />
            <Row label="Эффективный" value={<span className="font-mono text-[#FF9F0A]">{fmt(rates.usd_effective)}</span>} />
          </Card>
        )}
      </Section>
    </div>
  );
}

function PromoTab() {
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
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2">
            {options.map(([m, label]) => (
              <button
                key={String(m)}
                onClick={() => create(m, label)}
                disabled={busy}
                className="btn-glass active:scale-[0.96] text-[14px] font-semibold py-3.5 rounded-2xl transition-transform disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Последние ключи">
        {loading ? (
          <Spinner />
        ) : (
          <Card>
            {(keys || []).length === 0 && <div className="text-[#8E8E93] text-[15px] py-5 text-center">Ключей пока нет</div>}
            {(keys || []).map((k: any, i: number) => (
              <div key={i} className="flex justify-between items-center gap-2 px-5 py-4 border-b border-white/[0.06] last:border-b-0">
                <CopyCode value={k.code} />
                <div className="text-right shrink-0">
                  <div className="text-[13px] text-white/60">{k.label}</div>
                  <div className={cn('text-[12px] font-semibold', k.used ? 'text-white/35' : 'text-[#32D74B]')}>
                    {k.used ? `Использован${k.used_by ? ` (${k.used_by})` : ''}` : 'Активен'}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

function StarsTab() {
  const { data: bal, loading } = useAsyncData(() => api.admin.starsBalance());
  if (loading || !bal) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-[32px] p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(150deg, rgba(255,159,10,0.28), rgba(255,255,255,0.05))',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 12px 48px rgba(255,159,10,0.18), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <div className="text-[13px] uppercase tracking-wider font-semibold text-white/60 mb-2">Доступно к выводу</div>
        <div className="text-[44px] font-bold tracking-tight leading-none">⭐ {bal.available}</div>
        <div className="text-[13px] text-white/60 mt-3">Заморожено (до 21 дня): ⭐ {bal.frozen}</div>
      </div>
      <Section title="Telegram API">
        <Card>
          <Row label="Всего заработано" value={`${bal.total} ⭐`} />
          <Row label="Выведено / списано" value={`${bal.outgoing_total} ⭐`} />
          <Row label="Входящих транзакций" value={bal.incoming_count} />
        </Card>
      </Section>
      <Section title="По данным бота">
        <Card>
          <Row label="Оплат звёздами всего" value={bal.db_count} />
          <Row label="В рублёвом эквиваленте" value={`₽ ${Math.round(bal.db_rub_total).toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <Row label="За 30 дней" value={`${bal.db_count_30} шт · ₽${Math.round(bal.db_rub_30).toLocaleString('ru-RU')}`} />
        </Card>
      </Section>
    </div>
  );
}

function SalesPage() {
  const [tab, setTab] = useState('tariffs');
  return (
    <div className="px-4 pt-10 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
      <PageHeader title="Продажи" />
      <Segmented
        id="sales"
        options={[
          { key: 'tariffs', label: 'Тарифы' },
          { key: 'promo', label: 'Промокоды' },
          { key: 'stars', label: 'Stars' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'tariffs' && <TariffsTab />}
      {tab === 'promo' && <PromoTab />}
      {tab === 'stars' && <StarsTab />}
    </div>
  );
}

// ============================================================
//  ПОДДЕРЖКА: тикеты / запросы стран
// ============================================================

function TicketsTab() {
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
    <div className="px-5 py-4 flex flex-col gap-2 border-b border-white/[0.06] last:border-b-0">
      <div className="flex justify-between items-center">
        <div className="text-[15px] font-medium text-white">
          {t.username ? `@${t.username}` : t.full_name || `ID: ${t.user_id}`}
          <span className="text-white/35 font-mono text-[11px] ml-2">{t.ticket_id}</span>
        </div>
        <div
          className={cn(
            'px-2.5 py-1 text-[10px] rounded-full uppercase font-bold tracking-wider',
            t.status === 'open' ? 'bg-[#FF453A]/20 text-[#FF6961]' : 'bg-[#32D74B]/15 text-[#32D74B]',
          )}
        >
          {t.status === 'open' ? 'Открыт' : 'Закрыт'}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {t.messages.slice(-3).map((m, i) => (
          <div key={i} className="text-[14px] leading-snug">
            <span className={cn('font-bold', m.is_admin ? 'text-[#4DA6FF]' : 'text-white/40')}>
              {m.is_admin ? 'Вы: ' : 'Юзер: '}
            </span>
            <span className="text-white/75">{m.message_text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[12px] text-white/35">{new Date(t.created_at).toLocaleString('ru-RU')}</div>
        {t.status === 'open' && (
          <div className="flex gap-2">
            <button
              onClick={() => setReplyFor(t)}
              className="px-4 py-1.5 btn-primary rounded-full text-white text-[13px] font-semibold active:scale-95 transition-transform"
            >
              Ответить
            </button>
            <button
              onClick={() => close(t)}
              className="px-4 py-1.5 btn-glass rounded-full text-[#FF6961] text-[13px] font-semibold active:scale-95 transition-transform"
            >
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
        <Card>
          {open.length === 0 && <div className="text-[#8E8E93] text-[15px] text-center py-6">Открытых обращений нет 🎉</div>}
          {open.map((t: Ticket) => (
            <TicketCard key={t.ticket_id} t={t} />
          ))}
        </Card>
      </Section>
      {closed.length > 0 && (
        <Section title="Закрытые">
          <Card className="opacity-65">
            {closed.slice(0, 10).map((t: Ticket) => (
              <TicketCard key={t.ticket_id} t={t} />
            ))}
          </Card>
        </Section>
      )}

      {replyFor && (
        <Sheet onClose={() => setReplyFor(null)}>
          <h3 className="text-[18px] font-bold text-white mb-3">Ответ на {replyFor.ticket_id}</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Текст ответа…"
            className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
            autoFocus
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full py-3.5 btn-primary rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Отправить
          </button>
        </Sheet>
      )}
    </div>
  );
}

function CountryTab() {
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
        <Card>
          {(reqs || []).length === 0 && (
            <div className="text-[#8E8E93] text-[15px] text-center py-6">Нет открытых запросов</div>
          )}
          {(reqs || []).map((r: any) => (
            <div key={r.request_id} className="px-5 py-4 flex justify-between items-center border-b border-white/[0.06] last:border-b-0">
              <div>
                <div className="text-[16px] font-medium text-white emoji-flag">{r.country}</div>
                <div className="text-[12px] text-white/35 mt-0.5">
                  От: {r.user_id} · {new Date(r.created_at).toLocaleDateString('ru-RU')}
                </div>
              </div>
              <button
                onClick={() => setReplyFor(r)}
                className="px-4 py-1.5 btn-primary rounded-full text-white text-[13px] font-semibold active:scale-95 transition-transform"
              >
                Ответить
              </button>
            </div>
          ))}
        </Card>
      </Section>

      {replyFor && (
        <Sheet onClose={() => setReplyFor(null)}>
          <h3 className="text-[18px] font-bold text-white mb-3">
            Ответ на запрос: <span className="emoji-flag">{replyFor.country}</span>
          </h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Текст ответа пользователю…"
            className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
            autoFocus
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full py-3.5 btn-primary rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Отправить и закрыть
          </button>
        </Sheet>
      )}
    </div>
  );
}

function SupportPage() {
  const [tab, setTab] = useState('tickets');
  return (
    <div className="px-4 pt-10 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
      <PageHeader title="Поддержка" />
      <Segmented
        id="support"
        options={[
          { key: 'tickets', label: 'Тикеты' },
          { key: 'country', label: 'Запросы стран' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'tickets' && <TicketsTab />}
      {tab === 'country' && <CountryTab />}
    </div>
  );
}

// ============================================================
//  КЛИЕНТЫ: пользователи / выдача / рассылка
// ============================================================

function UsersTab() {
  const { data: users, loading, reload } = useAsyncData(() => api.admin.users(200));
  const [confirm, setConfirm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

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

  const q = query.trim().toLowerCase();
  const filtered = (users || []).filter(
    (u: any) =>
      !q ||
      String(u.user_id).includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q),
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Поиск по ID, @username, имени…"
        className="w-full glass rounded-full px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 focus:outline-none"
      />
      <Section title={`Пользователи (${filtered.length})`}>
        <Card>
          {filtered.map((u: any) => (
            <div key={u.user_id} className="px-5 py-4 flex justify-between items-center border-b border-white/[0.06] last:border-b-0">
              <div className="min-w-0">
                <div className="text-[15px] font-medium text-white truncate">
                  {u.username ? `@${u.username}` : u.full_name || u.user_id}
                  {u.is_admin && <span className="text-[10px] text-[#FF9F0A] font-bold ml-2 bg-[#FF9F0A]/15 px-2 py-0.5 rounded-full">ADMIN</span>}
                </div>
                <div className="text-[12px] text-white/35 font-mono">{u.user_id}</div>
                <div className="text-[13px] text-white/55 mt-0.5">
                  Подписок: {u.active_subs} · Оплачено: ₽{Math.round(u.total_paid)}
                </div>
              </div>
              {!u.is_admin && (
                <button
                  onClick={() => setConfirm(u)}
                  className="w-9 h-9 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0 ml-3"
                >
                  <Trash2 className="w-4 h-4 text-[#FF6961]" />
                </button>
              )}
            </div>
          ))}
        </Card>
      </Section>

      {confirm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-md px-6" onClick={() => setConfirm(null)}>
          <div className="glass-sheet rounded-[32px] p-6 w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-bold text-white mb-2">Удалить пользователя {confirm.user_id}?</div>
            <div className="text-[14px] text-white/55 mb-5">
              Удалятся все его подписки (включая клиентов в панелях), платежи и тикеты. Действие необратимо.
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={remove}
                disabled={busy}
                className="w-full py-3.5 btn-danger rounded-2xl text-white font-bold text-[16px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />} Удалить навсегда
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="w-full py-3.5 btn-glass rounded-2xl text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GiveSubTab() {
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
        <Card className="p-4">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
            placeholder="Например: 7017630225"
            inputMode="numeric"
            className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-[16px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
          />
        </Card>
      </Section>

      <Section title="Сервер">
        <Card className="p-4 grid grid-cols-2 gap-2">
          {boot.servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setServerId(s.id)}
              className={cn(
                'p-3.5 rounded-2xl text-[14px] font-semibold text-left transition-all active:scale-[0.97]',
                serverId === s.id ? 'btn-primary text-white' : 'btn-glass text-white',
              )}
            >
              {s.flag} {s.name}
            </button>
          ))}
        </Card>
      </Section>

      <Section title="Срок">
        <Card className="p-4 grid grid-cols-5 gap-2">
          {monthOptions.map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={cn(
                'py-3 rounded-2xl text-[14px] font-semibold transition-all active:scale-[0.95]',
                months === m ? 'btn-primary text-white' : 'btn-glass text-white',
              )}
            >
              {label}
            </button>
          ))}
        </Card>
      </Section>

      <button
        onClick={create}
        disabled={busy || !userId || !serverId || months === null}
        className="w-full py-4 btn-primary rounded-[24px] text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
        Создать подписку
      </button>
    </div>
  );
}

function BroadcastTab() {
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
    <Section title="Сообщение всем пользователям">
      <Card className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Текст рассылки (поддерживается HTML-разметка Telegram)…"
          className="w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-4 resize-none"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="w-full py-4 btn-primary rounded-2xl text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          Запустить рассылку
        </button>
        <div className="text-[12px] text-[#8E8E93] mt-3 px-1">
          Рассылка выполняется в фоне (~20 сообщений/сек). Итоговый отчёт бот пришлёт вам в личку.
        </div>
      </Card>
    </Section>
  );
}

function ClientsPage() {
  const [tab, setTab] = useState('users');
  return (
    <div className="px-4 pt-10 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
      <PageHeader title="Клиенты" />
      <Segmented
        id="clients"
        options={[
          { key: 'users', label: 'Пользователи' },
          { key: 'give', label: 'Выдать' },
          { key: 'broadcast', label: 'Рассылка' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'give' && <GiveSubTab />}
      {tab === 'broadcast' && <BroadcastTab />}
    </div>
  );
}

// ============================================================
//  СЕРВЕРЫ
// ============================================================

function ServersPage() {
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
    <div className="px-4 pt-10 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
      <PageHeader title="Серверы" />

      <Section title="Операции">
        <Card className="p-4 flex flex-col gap-3">
          <button
            onClick={doSync}
            disabled={syncing || importing}
            className="w-full btn-primary text-white text-[16px] font-semibold py-4 rounded-2xl transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {syncing ? 'Синхронизация… (до минуты)' : 'Синхронизировать серверы'}
          </button>
          <button
            onClick={doImport}
            disabled={syncing || importing}
            className="w-full btn-glass text-white text-[16px] font-semibold py-4 rounded-2xl transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {importing ? 'Импорт…' : 'Импорт клиентов из панели'}
          </button>
        </Card>
      </Section>

      <Section title="Наши ноды">
        {loading ? (
          <Spinner />
        ) : (
          <Card>
            {(servers || []).map((s: any) => (
              <div key={s.id} className="px-5 py-4 flex justify-between items-center border-b border-white/[0.06] last:border-b-0">
                <div>
                  <div className="text-[16px] font-medium flex items-center gap-2">
                    <span className="emoji-flag">{s.flag}</span> {s.name}
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        s.is_active ? 'bg-[#32D74B] shadow-[0_0_8px_rgba(50,215,75,0.8)]' : 'bg-[#FF453A]',
                      )}
                    />
                  </div>
                  <div className="text-[12px] text-white/35 mt-0.5 font-mono">{s.ip || '—'}</div>
                </div>
                <div className="text-[13px] text-white/45">inbound: {s.inbound_id}</div>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

// ============================================================
//  Приложение администратора (единственный интерфейс админа)
// ============================================================

const ADMIN_TABS: NavTab[] = [
  { path: '/', icon: Gauge, label: 'Обзор' },
  { path: '/sales', icon: CreditCard, label: 'Продажи' },
  { path: '/support', icon: MessageSquare, label: 'Поддержка' },
  { path: '/clients', icon: Users, label: 'Клиенты' },
  { path: '/servers', icon: Server, label: 'Серверы' },
];

export default function AdminApp() {
  return (
    <>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav tabs={ADMIN_TABS} />
    </>
  );
}
