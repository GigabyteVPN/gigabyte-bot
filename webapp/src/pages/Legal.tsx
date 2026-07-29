import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, FileText, Lock, ChevronRight, ArrowUp } from 'lucide-react';
import { LegalDoc } from '../lib/legal';
import { useLockBodyScroll } from '../lib/scroll-lock';
import { cn } from '../lib/utils';
import { t } from '../lib/i18n';
import { hapticFeedback } from '../lib/telegram';

/**
 * Юридический документ в оформлении системных приложений iOS.
 *
 * Как устроено и почему именно так:
 *  • крупный заголовок вверху сжимается в компактную панель при прокрутке —
 *    привычное поведение «Настроек», всегда понятно, какой документ открыт;
 *  • содержание вынесено отдельным списком: документы длинные, искать
 *    нужный пункт перелистыванием неудобно;
 *  • разделы идут одной группой с разделителями, а не отдельными карточками —
 *    так это читается как единый текст, а не как набор плиток.
 */
export default function Legal({
  doc,
  kind,
  onClose,
}: {
  doc: LegalDoc;
  kind: 'terms' | 'privacy';
  onClose: () => void;
}) {
  const Icon = kind === 'terms' ? FileText : Lock;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [compact, setCompact] = useState(false);
  const [showUp, setShowUp] = useState(false);

  useLockBodyScroll(true); // документ открыт поверх — фон не скроллим

  // Заголовок сжимается ровно тогда, когда крупный уезжает за край.
  const onScroll = useCallback(() => {
    const y = scrollRef.current?.scrollTop ?? 0;
    setCompact(y > 44);
    setShowUp(y > 900);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const jump = (i: number) => {
    hapticFeedback.selectionChanged();
    const el = sectionRefs.current[i];
    const box = scrollRef.current;
    if (!el || !box) return;
    // Позицию считаем вручную: scrollIntoView внутри вложенного контейнера
    // в вебвью Telegram прокручивает не тот элемент.
    box.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  };

  const toTop = () => {
    hapticFeedback.selectionChanged();
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[220] flex flex-col bg-[#050507]"
    >
      {/* Компактная панель: проявляется, когда крупный заголовок ушёл вверх */}
      <div
        className={cn(
          'shrink-0 flex items-center gap-3 px-4 pb-3 relative z-10 transition-colors duration-300',
          compact && 'bg-[#0B0B0E]/80 backdrop-blur-xl border-b border-white/[0.06]',
        )}
        style={{
          paddingTop:
            'max(calc(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)) + var(--tg-content-safe-area-inset-top, 0px) + 10px), 20px)',
        }}
      >
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-10 h-10 btn-glass rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1
          className={cn(
            'text-[17px] font-semibold tracking-tight text-white truncate transition-all duration-300',
            compact ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
          )}
        >
          {doc.title}
        </h1>
      </div>

      <div ref={scrollRef} className="overflow-y-auto hidden-scrollbar flex-1 px-4 pb-16">
        {/* Крупный заголовок — как в системных приложениях */}
        <header className="pt-1 pb-6">
          <div className="w-14 h-14 app-icon bg-gradient-to-b from-[#4DA6FF]/45 to-[#0A84FF]/20 rounded-[18px] flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-[#4DA6FF]" />
          </div>
          <h2 className="text-[34px] font-bold tracking-[-0.02em] text-white leading-[1.08]">{doc.title}</h2>
          <div className="text-[13px] text-[#8E8E93] mt-1.5">{doc.updated}</div>
        </header>

        {/* Вступление */}
        <div className="ios-list p-5 mb-6">
          <p className="text-[15px] text-white/75 leading-relaxed">{doc.intro}</p>
        </div>

        {/* Содержание */}
        <div className="text-[13px] uppercase tracking-wide text-[#8E8E93] font-semibold mb-2.5 ml-4">
          {t('legal.contents')}
        </div>
        <nav className="ios-list overflow-hidden mb-7">
          {doc.sections.map((s, i) => (
            <button
              key={i}
              onClick={() => jump(i)}
              className={cn(
                'w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-white/[0.04] transition-colors',
                i < doc.sections.length - 1 && 'border-b border-white/[0.05]',
              )}
            >
              <span className="flex-1 text-[15px] text-white/85 leading-snug">{s.h}</span>
              <ChevronRight className="w-4 h-4 text-[#3C3C43]/60 shrink-0" />
            </button>
          ))}
        </nav>

        {/* Текст документа */}
        <div className="ios-list overflow-hidden">
          {doc.sections.map((s, i) => (
            <section
              key={i}
              ref={(el) => {
                sectionRefs.current[i] = el;
              }}
              className={cn('px-5 py-5', i < doc.sections.length - 1 && 'border-b border-white/[0.05]')}
            >
              <h3 className="text-[17px] font-bold text-white mb-3 leading-snug tracking-tight">{s.h}</h3>
              <div className="flex flex-col gap-3">
                {s.p.map((para, j) => (
                  <p key={j} className="text-[15px] text-white/70 leading-[1.55]">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="text-center text-[12px] text-white/30 mt-7 px-6 leading-relaxed">
          Gigabyte VPN
          <br />
          {doc.updated}
        </div>
      </div>

      {/* Наверх: документ длинный, иначе его приходится отлистывать целиком */}
      <button
        onClick={toTop}
        aria-label={t('legal.toTop')}
        className={cn(
          'absolute right-4 w-11 h-11 rounded-full btn-glass flex items-center justify-center transition-all duration-300 active:scale-90',
          showUp ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
        )}
        style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <ArrowUp className="w-5 h-5 text-white" />
      </button>
    </motion.div>
  );
}
