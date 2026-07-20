import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, Ticket, Tariff, AdminSearchResult } from '../lib/api';
import { useApp } from '../lib/AppContext';
import { tg, hapticFeedback } from '../lib/telegram';
import { cn, formatBytes } from '../lib/utils';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { motion } from 'motion/react';
import { BottomNav, NavTab } from '../components/layout/BottomNav';
import {
  Users,
  Gauge,
  Server,
  RefreshCw,
  Send,
  Wallet,
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
  Activity,
  Cpu,
  Plus,
  Settings2,
  ChevronLeft,
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
  <div className={cn('glass rounded-[32px] overflow-hidden', className)}>{children}</div>
);

// Отдельная карточка-строка (как блоки в пользовательском интерфейсе)
const RowCard = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <div className="ios-list flex justify-between items-center px-5 py-4">
    <div className="text-[15px] text-white/85">{label}</div>
    <div className={cn('text-[16px] font-semibold', accent || 'text-white')}>{value}</div>
  </div>
);

const IconChip = ({ icon: Icon, tint }: { icon: React.ElementType; tint: string }) => (
  <div
    className="w-9 h-9 rounded-xl app-icon flex items-center justify-center shrink-0"
    style={{ background: `linear-gradient(180deg, ${tint}55, ${tint}22)` }}
  >
    <Icon className="w-[18px] h-[18px]" style={{ color: tint }} />
  </div>
);

const Spinner = () => (
  <div className="glass rounded-[32px] p-8 flex justify-center">
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

const CopyCode = ({ value, className }: { value: string; className?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        hapticFeedback.selectionChanged();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn('inline-flex items-center gap-1.5 font-mono active:opacity-60', className || 'text-[13px] text-white')}
    >
      {value}
      {copied ? <Check className="w-3.5 h-3.5 text-[#32D74B]" /> : <Copy className="w-3.5 h-3.5 text-white/35" />}
    </button>
  );
};

function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // silent=true — фоновое обновление: без спиннера и без алерта ошибки,
  // данные тихо подменяются на месте (пользователь ничего не замечает).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await loader());
    } catch (e: any) {
      if (!silent) tg.showAlert(e.message || 'Ошибка загрузки');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const reload = useCallback(() => load(false), [load]);
  useEffect(() => {
    load(false);
  }, [load]);
  // Тихое фоновое обновление при возврате в приложение и по интервалу.
  useAutoRefresh(() => load(true));
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
//  Графики (SVG, без внешних библиотек)
// ============================================================

type DayPoint = { date: string; revenue: number; payments: number; new_users: number };

const dayShort = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric' });
};

// Столбчатый график выручки с анимацией роста столбиков
function RevenueBars({ daily }: { daily: DayPoint[] }) {
  const W = 340;
  const H = 130;
  const pad = 4;
  const maxV = Math.max(...daily.map((d) => d.revenue), 1);
  const bw = (W - pad * 2) / daily.length;

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
      {daily.map((d, i) => {
        const h = Math.max((d.revenue / maxV) * H, d.revenue > 0 ? 6 : 2.5);
        const x = pad + i * bw;
        return (
          <g key={d.date}>
            <motion.rect
              initial={{ height: 0, y: H }}
              animate={{ height: h, y: H - h }}
              transition={{ type: 'spring', damping: 22, stiffness: 200, delay: i * 0.035 }}
              x={x + bw * 0.18}
              width={bw * 0.64}
              rx={bw * 0.3}
              fill={d.revenue > 0 ? 'url(#revGrad)' : 'rgba(255,255,255,0.08)'}
            />
            {i % 2 === 1 && (
              <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.35)">
                {dayShort(d.date)}
              </text>
            )}
          </g>
        );
      })}
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4DA6FF" />
          <stop offset="100%" stopColor="#0A84FF" stopOpacity="0.55" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Плавная area-диаграмма новых пользователей
function UsersArea({ daily }: { daily: DayPoint[] }) {
  const W = 340;
  const H = 90;
  const maxV = Math.max(...daily.map((d) => d.new_users), 1);
  const step = W / (daily.length - 1);
  const pts = daily.map((d, i) => [i * step, H - (d.new_users / maxV) * (H - 12) - 4] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#32D74B" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#32D74B" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill="url(#usersGrad)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="#32D74B"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      {pts.map(([x, y], i) =>
        daily[i].new_users > 0 ? <circle key={i} cx={x} cy={y} r="2.6" fill="#32D74B" /> : null,
      )}
    </svg>
  );
}

// Кольцевая диаграмма распределения по способам оплаты
const METHOD_META: Record<string, { label: string; color: string }> = {
  crypto: { label: 'Криптовалюта', color: '#BF5AF2' },
  stars: { label: 'Telegram Stars', color: '#0A84FF' },
  trial: { label: 'Триал', color: '#FF9F0A' },
};

function MethodDonut({ methods }: { methods: Record<string, { count: number; sum: number }> }) {
  const entries = Object.entries(methods).filter(([, v]) => v.count > 0);
  const total = entries.reduce((acc, [, v]) => acc + v.count, 0) || 1;
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          {entries.map(([m, v]) => {
            const frac = v.count / total;
            const meta = METHOD_META[m] || { label: m, color: '#8E8E93' };
            const seg = (
              <motion.circle
                key={m}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={meta.color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(frac * C - 3, 2)} ${C}`}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: -offset }}
                transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              />
            );
            offset += frac * C;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-[20px] font-bold text-white leading-none">{total}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-wider mt-0.5">оплат</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2.5">
        {entries.map(([m, v]) => {
          const meta = METHOD_META[m] || { label: m, color: '#8E8E93' };
          return (
            <div key={m} className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}88` }} />
              <div className="flex-1 text-[13px] text-white/80">{meta.label}</div>
              <div className="text-[13px] font-semibold text-white">
                {Math.round((v.count / total) * 100)}%
                <span className="text-white/40 font-normal ml-1.5">₽{Math.round(v.sum).toLocaleString('ru-RU')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
//  ОБЗОР — полноценный дашборд
// ============================================================

function OverviewPage() {
  const { data: stats, loading, reload } = useAsyncData(() => api.admin.stats());

  if (loading || !stats) {
    return (
      <div className="px-4 pt-2 flex flex-col gap-5 pb-8">
        <PageHeader title="Обзор" />
        <Spinner />
      </div>
    );
  }

  const daily: DayPoint[] = stats.daily || [];
  const week = daily.slice(-7);
  const weekUsers = week.reduce((a, d) => a + d.new_users, 0);
  const weekPayments = week.reduce((a, d) => a + d.payments, 0);

  const tiles = [
    { label: 'Пользователи', value: stats.users.total, sub: `+${stats.users.new_today} сегодня`, icon: Users, tint: '#0A84FF' },
    { label: 'Активные подписки', value: stats.subscriptions.active, sub: `${stats.subscriptions.expiring_week} истекают за 7д`, icon: Gauge, tint: '#32D74B' },
    { label: 'Ожидают оплаты', value: stats.pending_payments, sub: 'аннулируются через 24ч', icon: Hourglass, tint: '#FF9F0A' },
    { label: 'Открытые тикеты', value: stats.open_tickets, sub: 'ждут ответа', icon: TicketIcon, tint: '#FF453A' },
  ];

  const maxServer = Math.max(...(stats.top_servers as any[]).map((s: any) => s.count), 1);

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
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
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
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

      {/* График выручки за 14 дней */}
      <Section title="Выручка · 14 дней">
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[13px] text-white/50">
              {weekPayments} оплат за неделю
            </div>
            <div className="text-[13px] font-semibold text-[#4DA6FF]">
              ₽{week.reduce((a, d) => a + d.revenue, 0).toLocaleString('ru-RU')} / 7д
            </div>
          </div>
          <RevenueBars daily={daily} />
        </Card>
      </Section>

      {/* Плитки-метрики */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-[32px] p-4">
            <IconChip icon={t.icon} tint={t.tint} />
            <div className="text-[26px] font-bold tracking-tight leading-none mt-3">{t.value}</div>
            <div className="text-[13px] text-white/85 font-medium mt-1.5">{t.label}</div>
            <div className="text-[12px] text-[#8E8E93] mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Новые пользователи */}
      <Section title="Новые пользователи · 14 дней">
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[13px] text-white/50">Динамика регистраций</div>
            <div className="text-[13px] font-semibold text-[#32D74B]">+{weekUsers} за неделю</div>
          </div>
          <UsersArea daily={daily} />
        </Card>
      </Section>

      {/* Способы оплаты — кольцевая диаграмма */}
      <Section title="Способы оплаты">
        <Card className="p-5">
          <MethodDonut methods={stats.methods} />
        </Card>
      </Section>

      {/* Конверсия */}
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
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(Number(v), 100)}%` }}
                  transition={{ type: 'spring', damping: 25, stiffness: 120 }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                    boxShadow: `0 0 12px ${color}66`,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-between text-[13px] text-[#8E8E93] pt-1">
            <span>Средний чек: ₽{stats.finance.avg_check}</span>
            <span>ARPU: ₽{stats.finance.arpu}</span>
          </div>
        </Card>
      </Section>

      {/* Реферальная программа */}
      {stats.referral?.available && (
        <Section title="Реферальная программа">
          <Card className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ['Приглашено', stats.referral.referred_users],
                ['Баллов роздано', stats.referral.points_issued],
                ['Потрачено', stats.referral.points_redeemed],
              ].map(([label, v]) => (
                <div key={label as string} className="bg-white/[0.04] rounded-2xl py-3 px-2">
                  <div className="text-[20px] font-bold text-white leading-none">{v}</div>
                  <div className="text-[11px] text-[#8E8E93] uppercase tracking-wider mt-1.5">{label}</div>
                </div>
              ))}
            </div>
            {(stats.referral.top || []).length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="text-[12px] text-[#8E8E93] uppercase tracking-wider font-semibold">Топ рефереров</div>
                {(stats.referral.top as { user_id: number; points: number; username?: string; full_name?: string }[]).map(
                  (r) => (
                    <div key={r.user_id} className="flex justify-between text-[14px]">
                      <span className="text-white/85 truncate pr-3">
                        {r.username ? `@${r.username}` : r.full_name || r.user_id}
                      </span>
                      <span className="font-semibold text-[#D7A8FF] shrink-0">{r.points}</span>
                    </div>
                  ),
                )}
              </div>
            )}
          </Card>
        </Section>
      )}

      {/* Топ серверов с прогресс-барами */}
      <Section title="Нагрузка серверов">
        <Card className="p-5 flex flex-col gap-4">
          {(stats.top_servers as { name: string; count: number }[]).map((s, i) => (
            <div key={i}>
              <div className="flex justify-between text-[14px] mb-1.5">
                <span className="text-white/85 emoji-flag">{s.name}</span>
                <span className="font-semibold text-white">{s.count}</span>
              </div>
              <div className="h-2 w-full bg-white/[0.07] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.count / maxServer) * 100}%` }}
                  transition={{ type: 'spring', damping: 25, stiffness: 120, delay: i * 0.08 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#5E5CE6] to-[#4DA6FF]"
                  style={{ boxShadow: '0 0 10px rgba(94,92,230,0.5)' }}
                />
              </div>
            </div>
          ))}
        </Card>
      </Section>

      {/* Последние платежи */}
      <Section title="Последние платежи">
        {stats.recent_payments.length === 0 ? (
          <Card className="text-center text-[#8E8E93] py-5 text-[15px]">Нет недавних платежей</Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(stats.recent_payments as any[]).map((p, i) => (
              <div key={i} className="ios-list flex items-center justify-between px-5 py-3.5">
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
                    <CopyCode value={String(p.user_id)} className="text-[14px] text-white" />
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
          </div>
        )}
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
      <Section title="Тарифная сетка">
        {tarLoading || !tariffs ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-2.5">
            {tariffs.map((t: Tariff) => (
              <div key={t.months} className="ios-list flex items-center gap-3.5 px-5 py-4">
                <IconChip icon={CreditCard} tint="#32D74B" />
                <div className="flex-1">
                  <div className="text-[16px] font-semibold text-white">{t.label}</div>
                  <div className="text-[12px] text-[#8E8E93]">
                    ≈ ${t.usd} · {t.months >= 1 ? `${Math.round(t.rub / t.months)} ₽/мес` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[17px] font-bold text-[#32D74B]">{t.rub} ₽</div>
                  <div className="text-[12px] text-[#8E8E93]">⭐ {t.stars}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Управление ценами">
        <Card className="p-4">
          <div className="text-[13px] text-[#8E8E93] mb-3 px-1">Быстрая наценка на все тарифы:</div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[10, 20, 30, 50].map((p) => (
              <button
                key={p}
                onClick={() => applyPercent(p)}
                disabled={busy}
                className="btn-glass text-[15px] font-semibold py-3 rounded-full active:scale-[0.96] transition-transform disabled:opacity-50"
              >
                +{p}%
              </button>
            ))}
          </div>
          <div className="text-[13px] text-[#8E8E93] mb-2 px-1">Или задайте цену за 1 месяц — остальные пересчитаются:</div>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Цена за 1 месяц, ₽"
              inputMode="numeric"
              className="flex-1 h-[48px] bg-black/30 border border-white/10 rounded-full px-5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
            />
            <button
              onClick={applyBase}
              disabled={busy || !manual}
              className="px-6 h-[48px] btn-primary text-white text-[15px] font-semibold rounded-full active:scale-[0.96] transition-transform disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ОК'}
            </button>
          </div>
          <div className="text-[12px] text-[#8E8E93] mt-3 px-1">3 мес = ×2.5 · 6 мес = ×4.5 · 1 год = ×8.5</div>
        </Card>
      </Section>

      <Section title="Текущие курсы">
        {ratesLoading || !rates ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-2.5">
            <RowCard label="ЦБ РФ" value={<span className="font-mono text-white/60">{fmt(rates.usd_cbr)}</span>} />
            <RowCard label="Рыночный" value={<span className="font-mono text-white/60">{fmt(rates.usd_market)}</span>} />
            <RowCard label="USDT P2P" value={<span className="font-mono text-[#4DA6FF]">{fmt(rates.usdt_p2p)}</span>} />
            <RowCard label="Эффективный" value={<span className="font-mono text-[#FF9F0A]">{fmt(rates.usd_effective)}</span>} />
          </div>
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
          <div className="flex flex-wrap gap-2">
            {options.map(([m, label]) => (
              <button
                key={String(m)}
                onClick={() => create(m, label)}
                disabled={busy}
                className="btn-glass active:scale-[0.96] text-[14px] font-semibold px-5 py-3 rounded-full transition-transform disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-[#8E8E93] mt-3 px-1">Ключ сразу копируется в буфер обмена.</div>
        </Card>
      </Section>

      <Section title="Последние ключи">
        {loading ? (
          <Spinner />
        ) : (keys || []).length === 0 ? (
          <Card className="text-[#8E8E93] text-[15px] py-5 text-center">Ключей пока нет</Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(keys || []).map((k: any, i: number) => (
              <div key={i} className="ios-list flex justify-between items-center gap-2 px-5 py-4">
                <CopyCode value={k.code} />
                <div className="text-right shrink-0">
                  <div className="text-[13px] text-white/60">{k.label}</div>
                  <div className={cn('text-[12px] font-semibold', k.used ? 'text-white/35' : 'text-[#32D74B]')}>
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
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <div className="text-[13px] uppercase tracking-wider font-semibold text-white/60 mb-2">Доступно к выводу</div>
        <div className="text-[44px] font-bold tracking-tight leading-none">⭐ {bal.available}</div>
        <div className="text-[13px] text-white/60 mt-3">Заморожено (до 21 дня): ⭐ {bal.frozen}</div>
      </div>
      <Section title="Telegram API">
        <div className="flex flex-col gap-2.5">
          <RowCard label="Всего заработано" value={`${bal.total} ⭐`} />
          <RowCard label="Выведено / списано" value={`${bal.outgoing_total} ⭐`} />
          <RowCard label="Входящих транзакций" value={bal.incoming_count} />
        </div>
      </Section>
      <Section title="По данным бота">
        <div className="flex flex-col gap-2.5">
          <RowCard label="Оплат звёздами всего" value={bal.db_count} />
          <RowCard label="В рублёвом эквиваленте" value={`₽ ${Math.round(bal.db_rub_total).toLocaleString('ru-RU')}`} accent="text-[#32D74B]" />
          <RowCard label="За 30 дней" value={`${bal.db_count_30} шт · ₽${Math.round(bal.db_rub_30).toLocaleString('ru-RU')}`} />
        </div>
      </Section>
    </div>
  );
}

function SalesPage() {
  const [tab, setTab] = useState('tariffs');
  return (
    <div className="px-4 pt-2 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
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

  const initial = (t: Ticket) => (t.username || t.full_name || String(t.user_id) || '?').replace('@', '').charAt(0).toUpperCase();

  const TicketCard = ({ t }: { t: Ticket }) => (
    <div className="ios-list px-5 py-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full app-icon bg-gradient-to-b from-[#5E5CE6]/60 to-[#5E5CE6]/20 flex items-center justify-center text-[15px] font-bold text-white shrink-0">
          {initial(t)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-white truncate">
            {t.username ? `@${t.username}` : t.full_name || `ID: ${t.user_id}`}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/35 font-mono text-[11px]">{t.ticket_id}</span>
            {t.user_id != null && <CopyCode value={String(t.user_id)} className="text-[11px] text-white/45" />}
          </div>
        </div>
        <div
          className={cn(
            'px-2.5 py-1 text-[10px] rounded-full uppercase font-bold tracking-wider shrink-0',
            t.status === 'open' ? 'bg-[#FF453A]/20 text-[#FF6961]' : 'bg-[#32D74B]/15 text-[#32D74B]',
          )}
        >
          {t.status === 'open' ? 'Открыт' : 'Закрыт'}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 glass-inner rounded-2xl px-3.5 py-2.5">
        {t.messages.slice(-3).map((m, i) => (
          <div key={i} className="text-[13.5px] leading-snug">
            <span className={cn('font-bold', m.is_admin ? 'text-[#4DA6FF]' : 'text-white/40')}>
              {m.is_admin ? 'Вы: ' : 'Юзер: '}
            </span>
            <span className="text-white/75">{m.message_text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
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
        {open.length === 0 ? (
          <Card className="text-[#8E8E93] text-[15px] text-center py-6">Открытых обращений нет 🎉</Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {open.map((t: Ticket) => (
              <TicketCard key={t.ticket_id} t={t} />
            ))}
          </div>
        )}
      </Section>
      {closed.length > 0 && (
        <Section title="Закрытые">
          <div className="flex flex-col gap-2.5 opacity-65">
            {closed.slice(0, 10).map((t: Ticket) => (
              <TicketCard key={t.ticket_id} t={t} />
            ))}
          </div>
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
            className="w-full bg-black/30 border border-white/10 rounded-3xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
            autoFocus
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full py-3.5 btn-primary rounded-full text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
        {(reqs || []).length === 0 ? (
          <Card className="text-[#8E8E93] text-[15px] text-center py-6">Нет открытых запросов</Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(reqs || []).map((r: any) => (
              <div key={r.request_id} className="ios-list px-5 py-4 flex justify-between items-center">
                <div>
                  <div className="text-[16px] font-medium text-white emoji-flag">{r.country}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <CopyCode value={String(r.user_id)} className="text-[12px] text-white/45" />
                    <span className="text-[12px] text-white/35">{new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
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
          </div>
        )}
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
            className="w-full bg-black/30 border border-white/10 rounded-3xl px-4 py-3 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-3 resize-none"
            autoFocus
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full py-3.5 btn-primary rounded-full text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
    <div className="px-4 pt-2 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
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

// Детальная карточка пользователя: реальные подписки, платежи, рефералы.
// Позволяет отозвать доступ по конкретной подписке (снять с панели).
function UserDetailSheet({ userId, onClose, onChanged }: { userId: number; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useAsyncData(() => api.admin.userDetail(userId), [userId]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const revoke = async (subId: string) => {
    if (revoking) return;
    setRevoking(subId);
    try {
      await api.admin.revokeSub(subId);
      hapticFeedback.notificationOccurred('success');
      tg.showAlert('⛔️ Доступ отозван: клиент снят с панели.');
      reload();
      onChanged();
    } catch (e: any) {
      hapticFeedback.notificationOccurred('error');
      tg.showAlert(e.message || 'Ошибка');
    } finally {
      setRevoking(null);
    }
  };

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtExpiry = (ms: number) =>
    ms === 0 ? '∞' : new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Sheet onClose={onClose}>
      {loading || !data ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full" />
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-y-auto hidden-scrollbar flex flex-col gap-5">
          {/* Шапка */}
          <div>
            <div className="text-[20px] font-bold text-white">
              {data.user.username ? `@${data.user.username}` : data.user.full_name || data.user.user_id}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <CopyCode value={String(data.user.user_id)} className="text-[13px] text-white/50" />
              <span className="text-[12px] text-white/40">· с {fmtDate(data.user.created_at)}</span>
            </div>
          </div>

          {/* Быстрые метрики */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              ['Оплачено', `₽${Math.round(data.total_paid)}`],
              ['Баллы', String(data.referral.points)],
              ['Пригласил', String(data.referral.invited_total)],
            ].map(([label, value]) => (
              <div key={label} className="glass-inner rounded-2xl py-3 px-2 text-center">
                <div className="text-[17px] font-bold text-white leading-none">{value}</div>
                <div className="text-[10.5px] text-white/45 uppercase tracking-wider mt-1.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Подписки */}
          <div>
            <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2 ml-1">
              Подписки ({data.subscriptions.length})
            </div>
            {data.subscriptions.length === 0 ? (
              <div className="text-[14px] text-white/40 px-1">Нет подписок</div>
            ) : (
              <div className="flex flex-col gap-2">
                {data.subscriptions.map((s) => {
                  const active = s.status === 'active';
                  return (
                    <div key={s.sub_id} className="glass-inner rounded-2xl p-3.5 flex items-center gap-3">
                      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', active ? 'bg-[#32D74B]' : 'bg-[#8E8E93]')} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-semibold text-white truncate emoji-flag">
                          {s.server.flag} {s.server.name}
                        </div>
                        <div className="text-[12px] text-white/45">
                          {active ? `до ${fmtExpiry(s.expiry_date)}` : 'истекла / отозвана'}
                        </div>
                      </div>
                      {active && (
                        <button
                          onClick={() => revoke(s.sub_id)}
                          disabled={revoking === s.sub_id}
                          className="px-3 h-8 rounded-full bg-[#FF453A]/15 text-[#FF6961] text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50 shrink-0"
                        >
                          {revoking === s.sub_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Отозвать'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Платежи */}
          <div>
            <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2 ml-1">
              Платежи ({data.payments.length})
            </div>
            {data.payments.length === 0 ? (
              <div className="text-[14px] text-white/40 px-1">Платежей нет</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {data.payments.slice(0, 12).map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-1 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          p.status === 'completed' ? 'bg-[#32D74B]' : p.status === 'expired' ? 'bg-[#FF453A]' : 'bg-[#FF9F0A]',
                        )}
                      />
                      <span className="text-[13px] text-white/70 truncate">
                        {p.method === 'stars' ? 'Stars' : p.method === 'crypto' ? 'Крипто' : p.method === 'trial' ? 'Триал' : p.method}
                      </span>
                      <span className="text-[12px] text-white/35">{fmtDate(p.created_at)}</span>
                    </div>
                    <span className="text-[13px] font-semibold text-white shrink-0">₽{p.amount_rub || 0}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function UsersTab() {
  const { data: users, loading, reload } = useAsyncData(() => api.admin.users(200));
  const [confirm, setConfirm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<AdminSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Серверный поиск по email из панели, Telegram ID, ID подписки в БД,
  // sub_id, @username и имени. Локального списка (200) для email мало —
  // поэтому уходим на бэкенд. Дебаунс 350мс.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        setSearchResults(await api.admin.search(q));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

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

  const isSearching = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Email из панели, Telegram ID, ID в БД, @username…"
        className="w-full glass rounded-full px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 focus:outline-none"
      />

      {isSearching ? (
        <Section title={searching ? 'Поиск…' : `Найдено (${(searchResults || []).length})`}>
          {searching ? (
            <Spinner />
          ) : (searchResults || []).length === 0 ? (
            <Card className="text-center text-[#8E8E93] py-6 text-[15px]">Ничего не найдено</Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(searchResults || []).map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => { hapticFeedback.selectionChanged(); setDetailId(u.user_id); }}
                  className="ios-list px-5 py-4 flex justify-between items-center text-left active:opacity-60"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-white truncate">
                      {u.username ? `@${u.username}` : u.full_name || u.user_id}
                    </div>
                    <div className="text-[12px] text-white/45 font-mono mt-0.5">{u.user_id}</div>
                    <div className="text-[12px] text-[#4DA6FF] mt-1">
                      {u.matched_by}: <span className="text-white/60 font-mono">{u.matched_value}</span>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-white/25 rotate-180 shrink-0 ml-3" />
                </button>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <Section title={`Пользователи (${(users || []).length})`}>
          <div className="flex flex-col gap-2.5">
            {(users || []).map((u: any) => (
              <div key={u.user_id} className="ios-list px-5 py-4 flex justify-between items-center">
                <button onClick={() => { hapticFeedback.selectionChanged(); setDetailId(u.user_id); }} className="min-w-0 text-left flex-1 active:opacity-60">
                  <div className="text-[15px] font-medium text-white truncate">
                    {u.username ? `@${u.username}` : u.full_name || u.user_id}
                    {u.is_admin && <span className="text-[10px] text-[#FF9F0A] font-bold ml-2 bg-[#FF9F0A]/15 px-2 py-0.5 rounded-full">ADMIN</span>}
                  </div>
                  <div className="text-[12px] text-white/45 font-mono mt-0.5">{u.user_id}</div>
                  <div className="text-[13px] text-white/55 mt-0.5">
                    Подписок: {u.active_subs} · Оплачено: ₽{Math.round(u.total_paid)}
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  {!u.is_admin && (
                    <button
                      onClick={() => setConfirm(u)}
                      className="w-9 h-9 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Trash2 className="w-4 h-4 text-[#FF6961]" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {detailId !== null && (
        <UserDetailSheet userId={detailId} onClose={() => setDetailId(null)} onChanged={reload} />
      )}

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
                className="w-full py-3.5 btn-danger rounded-full text-white font-bold text-[16px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />} Удалить навсегда
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="w-full py-3.5 btn-glass rounded-full text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
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
            className="w-full h-[50px] bg-black/30 border border-white/10 rounded-full px-5 text-[16px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60"
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
                'p-3.5 rounded-full text-[14px] font-semibold text-center transition-all active:scale-[0.97]',
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
                'py-3 rounded-full text-[14px] font-semibold transition-all active:scale-[0.95]',
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
        className="w-full py-4 btn-primary rounded-full text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
          className="w-full bg-black/30 border border-white/10 rounded-3xl px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60 mb-4 resize-none"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="w-full py-4 btn-primary rounded-full text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
    <div className="px-4 pt-2 flex flex-col gap-5 animate-in fade-in duration-300 pb-8">
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

const emptyServer = {
  id: 0,
  name: '',
  flag: '',
  ip: '',
  panel_url: '',
  panel_login: '',
  panel_pass: '',
  inbound_id: '',
  sub_port: '',
  sub_path: '',
  is_active: true,
};

// Редактор сервера (создание / изменение) с проверкой панели
function ServerEditor({ server, onClose, onSaved }: { server: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(server ? { ...emptyServer, ...server, panel_pass: '' } : { ...emptyServer });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [inbounds, setInbounds] = useState<any[] | null>(null);
  const isNew = !server;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name || !form.panel_url) {
      tg.showAlert('Заполните название и URL панели');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        flag: form.flag,
        ip: form.ip,
        server_ip: form.ip,
        panel_url: form.panel_url,
        panel_login: form.panel_login,
        inbound_id: form.inbound_id ? Number(form.inbound_id) : null,
        sub_port: form.sub_port ? Number(form.sub_port) : null,
        sub_path: form.sub_path,
        is_active: form.is_active,
      };
      if (form.panel_pass) payload.panel_pass = form.panel_pass;
      if (isNew) await api.admin.createServer(payload);
      else await api.admin.updateServer(server.id, payload);
      hapticFeedback.notificationOccurred('success');
      onSaved();
      onClose();
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (isNew) {
      tg.showAlert('Сначала сохраните сервер, затем проверьте подключение');
      return;
    }
    setTesting(true);
    try {
      const res = await api.admin.testServer(server.id);
      if (res.ok) {
        hapticFeedback.notificationOccurred('success');
        setInbounds(res.inbounds || []);
      } else {
        hapticFeedback.notificationOccurred('error');
        tg.showAlert(`❌ ${res.error}`);
      }
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setTesting(false);
    }
  };

  const field = (label: string, key: string, opts: { placeholder?: string; mono?: boolean; type?: string } = {}) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[#8E8E93] font-medium px-2">{label}</span>
      <input
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts.placeholder}
        inputMode={opts.type === 'num' ? 'numeric' : undefined}
        className={cn(
          'w-full h-[46px] bg-black/30 border border-white/10 rounded-2xl px-4 text-[15px] text-white placeholder:text-white/25 focus:outline-none focus:border-[#0A84FF]/60',
          opts.mono && 'font-mono text-[13px]',
        )}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-[#0C0C10] overflow-y-auto hidden-scrollbar">
      <div
        className="px-4 pb-10 flex flex-col gap-4"
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 6px), 14px)',
        }}
      >
        <header className="flex items-center gap-3 mb-1">
          <button
            onClick={onClose}
            className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-[24px] font-bold tracking-tight">{isNew ? 'Новый сервер' : 'Настройки сервера'}</h1>
        </header>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          {field('Название', 'name', { placeholder: 'Россия' })}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[#8E8E93] font-medium px-2">Флаг</span>
            <input
              value={form.flag ?? ''}
              onChange={(e) => set('flag', e.target.value)}
              placeholder="🇷🇺"
              className="w-[64px] h-[46px] bg-black/30 border border-white/10 rounded-2xl px-3 text-[20px] text-center focus:outline-none focus:border-[#0A84FF]/60 emoji-flag"
            />
          </div>
        </div>
        {field('IP сервера (для ссылки-подписки)', 'ip', { placeholder: '185.93.105.47', mono: true })}
        {field('URL панели 3x-ui', 'panel_url', { placeholder: 'https://IP:PORT/path', mono: true })}
        <div className="grid grid-cols-2 gap-3">
          {field('Логин панели', 'panel_login', { placeholder: 'admin' })}
          {field('Пароль панели', 'panel_pass', { placeholder: isNew ? '••••' : 'не менять' })}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {field('Inbound ID', 'inbound_id', { placeholder: '1', type: 'num' })}
          {field('Sub-порт', 'sub_port', { placeholder: '2096', type: 'num' })}
          {field('Sub-путь', 'sub_path', { placeholder: 'sub' })}
        </div>

        <button
          onClick={() => set('is_active', !form.is_active)}
          className="glass rounded-2xl px-4 py-3.5 flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <span className="text-[15px] text-white">Сервер активен (виден пользователям)</span>
          <div className={cn('w-12 h-7 rounded-full p-0.5 transition-colors', form.is_active ? 'bg-[#32D74B]' : 'bg-white/15')}>
            <motion.div layout className="w-6 h-6 rounded-full bg-white shadow" style={{ marginLeft: form.is_active ? 20 : 0 }} />
          </div>
        </button>

        {/* Проверка панели → показывает доступные инбаунды */}
        <button
          onClick={test}
          disabled={testing}
          className="btn-glass rounded-full py-3.5 flex items-center justify-center gap-2 text-white font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5 text-[#4DA6FF]" />}
          Проверить подключение к панели
        </button>

        {inbounds && (
          <Card className="p-1">
            <div className="text-[12px] text-[#8E8E93] px-4 pt-3 pb-1">
              Найдено инбаундов: {inbounds.length}. Нажмите, чтобы выбрать Inbound ID:
            </div>
            {inbounds.map((ib) => (
              <button
                key={ib.id}
                onClick={() => {
                  set('inbound_id', String(ib.id));
                  hapticFeedback.selectionChanged();
                }}
                className={cn(
                  'w-full px-4 py-3 flex items-center justify-between active:bg-white/[0.05] transition-colors rounded-2xl',
                  String(form.inbound_id) === String(ib.id) && 'bg-[#0A84FF]/15',
                )}
              >
                <div className="text-left">
                  <div className="text-[15px] font-semibold text-white">
                    #{ib.id} · {ib.remark || ib.protocol}
                  </div>
                  <div className="text-[12px] text-white/45">
                    порт {ib.port} · {ib.clients} клиентов {ib.enable ? '' : '· выключен'}
                  </div>
                </div>
                {String(form.inbound_id) === String(ib.id) && <Check className="w-5 h-5 text-[#4DA6FF]" />}
              </button>
            ))}
          </Card>
        )}

        <button
          onClick={save}
          disabled={busy}
          className="w-full py-4 btn-primary rounded-full text-white font-bold text-[16px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-1"
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {isNew ? 'Создать сервер' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
//  Здоровье «железа» нод: CPU / RAM / диск / сеть / аптайм
//  Данные берутся из панели каждой ноды — агенты не нужны.
// ============================================================
const fmtUptime = (sec?: number) => {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}д ${h}ч` : h > 0 ? `${h}ч ${m}м` : `${m}м`;
};

const Meter = ({ label, used, total, unit = 'bytes', warn = 80 }: {
  label: string; used?: number; total?: number; unit?: 'bytes' | 'percent'; warn?: number;
}) => {
  const pct = unit === 'percent' ? (used || 0) : total ? ((used || 0) / total) * 100 : 0;
  const color = pct >= 90 ? '#FF453A' : pct >= warn ? '#FF9F0A' : '#32D74B';
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold" style={{ color }}>
          {unit === 'percent'
            ? `${Math.round(pct)}%`
            : `${formatBytes(used || 0)} / ${formatBytes(total || 0)}`}
        </span>
      </div>
      <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ type: 'spring', damping: 26, stiffness: 120 }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
        />
      </div>
    </div>
  );
};

function ServersHealth() {
  const { data, loading, reload } = useAsyncData(() => api.admin.serversHealth());
  if (loading && !data) return <Spinner />;
  const list = data || [];
  return (
    <Section title="Здоровье серверов">
      <div className="flex flex-col gap-2.5">
        {list.length === 0 && <Card className="p-5 text-center text-[#8E8E93]">Нет данных</Card>}
        {list.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn('w-2.5 h-2.5 rounded-full shrink-0', s.online ? 'bg-[#32D74B] dot-pulse' : 'bg-[#FF453A]')}
                />
                <span className="text-[16px] font-semibold text-white truncate emoji-flag">{s.name}</span>
              </div>
              <div className="text-[12px] text-white/45 shrink-0">
                {s.online ? `аптайм ${fmtUptime(s.uptime)}` : 'недоступен'}
              </div>
            </div>
            {s.online ? (
              <>
                {/* Клиенты и трафик — всегда доступны из панели */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="glass-inner rounded-2xl px-3 py-2.5">
                    <div className="text-[11px] text-white/50 uppercase tracking-wider">Онлайн</div>
                    <div className="text-[19px] font-bold text-[#32D74B] leading-none mt-1">
                      {s.clients_online ?? 0}
                      <span className="text-[13px] text-white/40 font-medium"> / {s.clients ?? 0}</span>
                    </div>
                  </div>
                  <div className="glass-inner rounded-2xl px-3 py-2.5">
                    <div className="text-[11px] text-white/50 uppercase tracking-wider">Трафик ↓</div>
                    <div className="text-[15px] font-bold leading-none mt-1.5">{formatBytes(s.traffic_down || 0)}</div>
                  </div>
                  <div className="glass-inner rounded-2xl px-3 py-2.5">
                    <div className="text-[11px] text-white/50 uppercase tracking-wider">Трафик ↑</div>
                    <div className="text-[15px] font-bold leading-none mt-1.5">{formatBytes(s.traffic_up || 0)}</div>
                  </div>
                </div>

                {/* Метрики «железа» — если панель ноды их отдаёт */}
                {s.cpu_percent != null && (
                  <>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      <Meter label={`CPU${s.cpu_cores ? ` · ${s.cpu_cores} ядер` : ''}`} used={s.cpu_percent} unit="percent" />
                      <Meter label="RAM" used={s.mem_used} total={s.mem_total} />
                      <Meter label="Диск" used={s.disk_used} total={s.disk_total} warn={85} />
                      <div>
                        <div className="text-[12px] text-white/60 mb-1">Сеть сейчас</div>
                        <div className="text-[13px] font-semibold text-white">
                          ↓ {formatBytes(s.net_down_speed || 0)}/с · ↑ {formatBytes(s.net_up_speed || 0)}/с
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-white/[0.06] text-[12px] text-white/50">
                      <span>
                        xray:{' '}
                        <b className={s.xray_state === 'running' ? 'text-[#32D74B]' : 'text-[#FF6961]'}>
                          {s.xray_state || '—'}
                        </b>
                        {s.xray_version ? ` ${s.xray_version}` : ''}
                      </span>
                      {s.load && s.load.length > 0 && <span>LA: {s.load.join(' / ')}</span>}
                      {s.tcp_count != null && <span>TCP: {s.tcp_count}</span>}
                    </div>
                  </>
                )}

                {!s.inbound_found && (
                  <div className="mt-2 text-[12px] text-[#FF9F0A] bg-[#FF9F0A]/10 rounded-2xl px-3 py-2">
                    ⚠️ Inbound не найден в панели — проверьте настройки сервера
                  </div>
                )}
              </>
            ) : (
              <div className="text-[13px] text-[#FF6961]">Панель не отвечает — проверьте сервер</div>
            )}
          </Card>
        ))}
        <button
          onClick={() => { hapticFeedback.impactOccurred('light'); reload(); }}
          className="self-start px-4 py-2 btn-glass rounded-full text-[13px] font-semibold text-white/80 active:scale-95 transition-transform"
        >
          Обновить метрики
        </button>
      </div>
    </Section>
  );
}

function ServersPage() {
  const { data: servers, loading, reload } = useAsyncData(() => api.admin.servers());
  const { data: status, loading: statusLoading, reload: reloadStatus } = useAsyncData(() => api.admin.panelStatus());
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reproving, setReproving] = useState(false);
  const [confirmRepro, setConfirmRepro] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; server: any | null } | null>(null);

  const doReprovision = async () => {
    if (reproving) return;
    setReproving(true);
    setConfirmRepro(false);
    try {
      const s = await api.admin.reprovision();
      hapticFeedback.notificationOccurred('success');
      tg.showAlert(
        `🔄 Запущено пересоздание для ${s.active} активных подписок.\n\n` +
          'Всем пользователям в панелях создаются новые клиенты и рассылаются новые ссылки в чат. ' +
          'Итоговый отчёт придёт вам в чат с ботом.',
      );
    } catch (e: any) {
      tg.showAlert(e.message);
    } finally {
      setReproving(false);
    }
  };

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
      reloadStatus();
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

  const removeServer = async (s: any) => {
    try {
      await api.admin.deleteServer(s.id);
      hapticFeedback.notificationOccurred('success');
      reload();
      reloadStatus();
    } catch (e: any) {
      tg.showAlert(e.message);
    }
  };

  if (editor?.open) {
    return (
      <ServerEditor
        server={editor.server}
        onClose={() => setEditor(null)}
        onSaved={() => {
          reload();
          reloadStatus();
        }}
      />
    );
  }

  const list = servers || [];
  const totals = status?.totals || { up: 0, down: 0, online: 0, clients: 0 };
  const statusById: Record<number, any> = {};
  (status?.servers || []).forEach((st: any) => (statusById[st.id] = st));

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in fade-in duration-300 pb-8">
      <div className="flex items-start justify-between">
        <PageHeader title="Серверы" />
        <button
          onClick={() => setEditor({ open: true, server: null })}
          className="mt-3 h-11 px-4 btn-primary rounded-full flex items-center gap-1.5 text-white text-[14px] font-semibold active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {/* Живой статус сети из панелей 3x-ui */}
      <div
        className="rounded-[32px] p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(150deg, rgba(50,215,75,0.22), rgba(255,255,255,0.05))',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[13px] uppercase tracking-wider font-semibold text-white/60">
            <Activity className="w-4 h-4" /> Живой статус сети
          </div>
          <button
            onClick={() => {
              hapticFeedback.impactOccurred('light');
              reloadStatus();
            }}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
          >
            <RefreshCw className={cn('w-4 h-4 text-white/70', statusLoading && 'animate-spin')} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-inner rounded-2xl px-4 py-3">
            <div className="text-[11px] text-white/50 uppercase tracking-wider">Онлайн сейчас</div>
            <div className="text-[26px] font-bold mt-0.5">
              {statusLoading ? '…' : totals.online}
              <span className="text-[15px] text-white/40 font-medium"> / {totals.clients}</span>
            </div>
          </div>
          <div className="glass-inner rounded-2xl px-4 py-3">
            <div className="text-[11px] text-white/50 uppercase tracking-wider">Всего трафика</div>
            <div className="text-[22px] font-bold mt-0.5">
              {statusLoading ? '…' : formatBytes(totals.up + totals.down)}
            </div>
          </div>
        </div>
      </div>

      <ServersHealth />

      <Section title="Операции">
        <Card className="p-4 flex flex-col gap-3">
          <button
            onClick={doSync}
            disabled={syncing || importing}
            className="w-full btn-primary text-white text-[16px] font-semibold py-4 rounded-full transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {syncing ? 'Синхронизация… (до минуты)' : 'Синхронизировать серверы'}
          </button>
          <button
            onClick={doImport}
            disabled={syncing || importing}
            className="w-full btn-glass text-white text-[16px] font-semibold py-4 rounded-full transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {importing ? 'Импорт…' : 'Импорт клиентов из панели'}
          </button>
        </Card>
      </Section>

      {/* Массовое пересоздание — после замены серверов */}
      <Section title="Смена серверов">
        <Card className="p-4 flex flex-col gap-3">
          <div className="text-[13px] text-white/55 leading-snug px-1">
            Заменили серверы и клиенты слетели? Добавьте новые серверы выше, затем нажмите — всем активным
            подписчикам создадутся новые клиенты в панели и придут новые ссылки в чат с ботом.
          </div>
          <button
            onClick={() => setConfirmRepro(true)}
            disabled={reproving}
            className="w-full text-white text-[16px] font-semibold py-4 rounded-full transition-transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(180deg,#BF5AF2,#9A3FD0)', boxShadow: '0 10px 24px rgba(191,90,242,0.3)' }}
          >
            {reproving ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {reproving ? 'Запуск…' : 'Пересоздать и разослать ссылки'}
          </button>
        </Card>
      </Section>

      {confirmRepro && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-md px-6" onClick={() => setConfirmRepro(false)}>
          <div className="glass-sheet rounded-[32px] p-6 w-full max-w-[360px]" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-bold text-white mb-2">Пересоздать все подписки?</div>
            <div className="text-[14px] text-white/55 mb-5">
              Всем активным подписчикам будут созданы новые клиенты в панелях и разосланы новые ссылки. Старые ссылки
              перестанут работать. Операция необратима.
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={doReprovision}
                className="w-full py-3.5 btn-primary rounded-full text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
              >
                Да, пересоздать и разослать
              </button>
              <button
                onClick={() => setConfirmRepro(false)}
                className="w-full py-3.5 btn-glass rounded-full text-white font-semibold text-[16px] active:scale-[0.98] transition-transform"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title="Наши ноды">
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-[15px] text-white/60 mb-4">Серверов пока нет</div>
            <button
              onClick={() => setEditor({ open: true, server: null })}
              className="px-6 py-3 btn-primary rounded-full text-white font-semibold text-[15px]"
            >
              Добавить первый сервер
            </button>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((s: any) => {
              const st = statusById[s.id];
              const reachable = st?.reachable;
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl app-icon bg-gradient-to-b from-white/[0.14] to-white/[0.04] flex items-center justify-center text-[20px] emoji-flag shrink-0">
                      {s.flag || <Cpu className="w-5 h-5 text-white/60" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-semibold text-white flex items-center gap-2">
                        {s.name}
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            reachable ? 'bg-[#32D74B] shadow-[0_0_8px_rgba(50,215,75,0.9)]' : st ? 'bg-[#FF453A]' : 'bg-white/25',
                          )}
                        />
                      </div>
                      {s.ip && <CopyCode value={s.ip} className="text-[12px] text-white/45" />}
                    </div>
                    <button
                      onClick={() => setEditor({ open: true, server: s })}
                      className="w-9 h-9 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
                    >
                      <Settings2 className="w-4 h-4 text-white/70" />
                    </button>
                  </div>

                  {/* Живые метрики ноды */}
                  <div className="grid grid-cols-3 gap-2 mt-3.5">
                    <div className="glass-inner rounded-2xl px-3 py-2 text-center">
                      <div className="text-[16px] font-bold text-[#32D74B]">{st ? st.online : '—'}</div>
                      <div className="text-[10px] text-white/45 uppercase tracking-wider">онлайн</div>
                    </div>
                    <div className="glass-inner rounded-2xl px-3 py-2 text-center">
                      <div className="text-[16px] font-bold text-white">{st ? st.clients : '—'}</div>
                      <div className="text-[10px] text-white/45 uppercase tracking-wider">клиентов</div>
                    </div>
                    <div className="glass-inner rounded-2xl px-3 py-2 text-center">
                      <div className="text-[14px] font-bold text-[#4DA6FF]">{st ? formatBytes(st.up + st.down) : '—'}</div>
                      <div className="text-[10px] text-white/45 uppercase tracking-wider">трафик</div>
                    </div>
                  </div>

                  {st && !st.inbound_found && reachable && (
                    <div className="mt-3 text-[12px] text-[#FF9F0A] bg-[#FF9F0A]/10 rounded-2xl px-3 py-2">
                      ⚠️ Inbound #{s.inbound_id} не найден в панели. Откройте настройки → «Проверить подключение», чтобы выбрать верный.
                    </div>
                  )}
                  {st && !reachable && (
                    <div className="mt-3 text-[12px] text-[#FF6961] bg-[#FF453A]/10 rounded-2xl px-3 py-2">
                      ❌ Панель недоступна — проверьте URL, логин и пароль в настройках.
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
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
