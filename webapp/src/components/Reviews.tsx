// ============================================================
//  Отзывы о сервисе — открытая лента и форма своей оценки.
//
//  Отзывы видят все пользователи приложения, поэтому наружу выходит
//  только имя автора: ни username, ни идентификатор Telegram сюда не
//  попадают (за этим следит и серверная часть — см. _review_author).
//  Один пользователь = один отзыв: повторный вход открывает его же
//  отзыв на редактирование, а не создаёт второй.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ReviewsSummary } from '../lib/api';
import { t, locale, LANG } from '../lib/i18n';
import { hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import { useLockBodyScroll } from '../lib/scroll-lock';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Star, Loader2, MessageSquareQuote, Pencil } from 'lucide-react';

/** Русский счётный падеж: 1 оценка, 2 оценки, 5 оценок. */
function ratingsLabel(n: number): string {
  if (LANG !== 'ru') return t(n === 1 ? 'rev.countOne' : 'rev.countMany', { n });
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return t('rev.countOne', { n });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('rev.countFew', { n });
  return t('rev.countMany', { n });
}

const STAR_WORD = ['', 'rev.stars1', 'rev.stars2', 'rev.stars3', 'rev.stars4', 'rev.stars5'];

/** Ряд звёзд. Только для показа, если не передан onPick. */
function Stars({
  value,
  size = 16,
  onPick,
}: {
  value: number;
  size?: number;
  onPick?: (n: number) => void;
}) {
  const px = { width: size, height: size };
  return (
    <div className={cn('flex items-center', onPick ? 'gap-2' : 'gap-0.5')}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star
            style={px}
            className={cn(
              'transition-colors duration-200',
              filled ? 'text-[#FFD60A] fill-[#FFD60A]' : 'text-white/20',
            )}
          />
        );
        if (!onPick) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            onClick={() => {
              hapticFeedback.selectionChanged();
              onPick(n);
            }}
            aria-label={`${n}`}
            className="p-2 -m-1 active:scale-90 transition-transform"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}

/** Шкала распределения оценок: сколько человек поставили каждый балл. */
function Distribution({ dist, total }: { dist: Record<string, number>; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((n) => {
        const value = dist[String(n)] || 0;
        const pct = total ? Math.round((value / total) * 100) : 0;
        return (
          <div key={n} className="flex items-center gap-2.5">
            <span className="text-[12px] text-[#8E8E93] w-2.5 tabular-nums">{n}</span>
            <Star className="w-3 h-3 text-[#FFD60A] fill-[#FFD60A] shrink-0" />
            <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[#FFD60A]"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
              />
            </div>
            <span className="text-[12px] text-[#8E8E93] w-6 text-right tabular-nums">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Карточка одного отзыва. */
function ReviewCard({ name, rating, text, date, mine }: {
  name: string; rating: number; text: string; date: string; mine: boolean;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const when = date ? new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) : '';
  return (
    <div className="ios-list p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full glass-inner flex items-center justify-center shrink-0">
          <span className="text-[16px] font-bold text-white/80">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-white truncate">{name}</span>
            {mine && (
              <span className="px-2 py-0.5 text-[10px] rounded-full uppercase font-bold tracking-wider bg-[#0A84FF]/20 text-[#4DA6FF] shrink-0">
                {t('rev.you')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Stars value={rating} size={12} />
            {when && <span className="text-[12px] text-[#8E8E93]">{when}</span>}
          </div>
        </div>
      </div>
      {text && <p className="text-[15px] text-white/80 leading-relaxed mt-3 whitespace-pre-line break-words">{text}</p>}
    </div>
  );
}

// ============================================================
//  Полноэкранная страница отзывов
// ============================================================
export default function Reviews({ onBack, onChanged }: { onBack: () => void; onChanged?: (s: ReviewsSummary) => void }) {
  const [data, setData] = useState<ReviewsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useLockBodyScroll(form);

  const load = useCallback(async () => {
    try {
      const s = await api.reviews();
      setData(s);
      onChanged?.(s);
      setRating(s.mine.rating || 0);
      setText(s.mine.text || '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const limit = data?.limit ?? 500;
  const hasMine = !!data?.mine.rating;
  const items = data?.items ?? [];

  // Свой отзыв всегда наверху ленты — его удобно найти и поправить.
  const ordered = useMemo(
    () => [...items].sort((a, b) => Number(b.mine) - Number(a.mine)),
    [items],
  );

  const submit = async () => {
    if (!rating || busy) return;
    setBusy(true);
    try {
      const s = await api.postReview(rating, text.trim().slice(0, limit));
      setData(s);
      onChanged?.(s);
      hapticFeedback.notificationOccurred('success');
      setForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (e) {
      console.error(e);
      hapticFeedback.notificationOccurred('error');
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
            className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-tight leading-tight">{t('rev.title')}</h1>
            <div className="text-[13px] text-[#8E8E93] truncate">{t('rev.subtitle')}</div>
          </div>
        </header>

        <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="glass rounded-full px-5 py-3.5 mb-5 flex items-center gap-3"
            >
              <span className="text-[20px] leading-none">✅</span>
              <span className="text-[14px] text-white font-medium">{t('rev.saved')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="ios-list p-10 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full" />
          </div>
        ) : data?.unavailable ? (
          <div className="ios-list p-8 text-center text-[15px] text-[#8E8E93]">{t('rev.unavailable')}</div>
        ) : (
          <>
            {/* Сводка: средний балл и распределение */}
            {data && data.count > 0 && (
              <div className="ios-list p-5 mb-4 flex items-center gap-5">
                <div className="text-center shrink-0">
                  <div className="text-[44px] font-bold leading-none tabular-nums text-white">
                    {data.average.toFixed(1)}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <Stars value={Math.round(data.average)} size={14} />
                  </div>
                  <div className="text-[12px] text-[#8E8E93] mt-1.5 whitespace-nowrap">
                    {ratingsLabel(data.count)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <Distribution dist={data.distribution} total={data.count} />
                </div>
              </div>
            )}

            {/* Своя оценка */}
            <button
              onClick={() => {
                hapticFeedback.selectionChanged();
                setForm(true);
              }}
              className="ios-list p-5 mb-6 w-full flex items-center gap-4 active:scale-[0.99] transition-transform"
            >
              <div className="w-12 h-12 app-icon bg-gradient-to-b from-[#FFD60A]/45 to-[#FF9F0A]/15 rounded-full flex items-center justify-center shrink-0">
                {hasMine ? <Pencil className="w-5 h-5 text-[#FFD60A]" /> : <Star className="w-6 h-6 text-[#FFD60A]" />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-[18px] font-bold text-white">
                  {hasMine ? t('rev.edit') : t('rev.leave')}
                </div>
                {hasMine ? (
                  <div className="mt-1">
                    <Stars value={data?.mine.rating || 0} size={13} />
                  </div>
                ) : (
                  <div className="text-[14px] text-[#8E8E93]">{t('rev.pickStars')}</div>
                )}
              </div>
            </button>

            {/* Лента */}
            {ordered.length === 0 ? (
              <div className="ios-list p-8 text-center">
                <div className="w-14 h-14 glass-inner rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquareQuote className="w-7 h-7 text-[#8E8E93]" />
                </div>
                <div className="text-[17px] font-semibold text-white mb-1">{t('rev.noneTitle')}</div>
                <div className="text-[14px] text-[#8E8E93]">{t('rev.noneHint')}</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ordered.map((r) => (
                  <ReviewCard key={r.id} {...r} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Форма отзыва — шторка снизу, как в iOS */}
      <AnimatePresence>
        {form && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !busy && setForm(false)}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-[210] glass-sheet rounded-t-[28px] px-5 pt-3"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
            >
              <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-5" />

              <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-3">
                {t('rev.rate')}
              </div>
              <div className="flex items-center justify-between mb-1">
                <Stars value={rating} size={30} onPick={setRating} />
                <span className="text-[15px] font-semibold text-white/80">
                  {rating ? t(STAR_WORD[rating]) : ''}
                </span>
              </div>

              {rating > 0 && rating <= 2 && (
                <p className="text-[13px] text-[#FF9F0A] mt-3 leading-snug">{t('rev.lowHint')}</p>
              )}

              <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mt-6 mb-3">
                {t('rev.comment')}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, limit))}
                placeholder={t('rev.commentPh')}
                rows={4}
                className="w-full glass rounded-[20px] px-4 py-3.5 text-[16px] text-white placeholder:text-white/30 focus:outline-none resize-none"
              />
              <div className="flex items-center justify-between mt-2 mb-5">
                <span className="text-[12px] text-[#8E8E93] leading-snug pr-3">{t('rev.commentHint')}</span>
                <span className="text-[12px] text-[#8E8E93] tabular-nums shrink-0">
                  {text.length}/{limit}
                </span>
              </div>

              <button
                onClick={submit}
                disabled={!rating || busy}
                className="w-full h-[52px] btn-primary rounded-full flex items-center justify-center gap-2 text-[17px] font-semibold text-white active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : t('rev.publish')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
