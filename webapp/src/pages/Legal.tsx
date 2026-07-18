import { motion } from 'motion/react';
import { ChevronLeft, FileText, Lock } from 'lucide-react';
import { LegalDoc } from '../lib/legal';

/** Полноэкранный просмотр юридического документа в стиле приложения. */
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
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[220] flex flex-col bg-[#050507]"
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
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold tracking-tight text-white leading-tight truncate">{doc.title}</h1>
          <div className="text-[12px] text-[#8E8E93]">{doc.updated}</div>
        </div>
      </div>

      <div className="overflow-y-auto hidden-scrollbar flex-1 px-4 pt-2 pb-16">
        {/* Шапка документа */}
        <div className="ios-list p-5 flex items-start gap-4 mb-4">
          <div className="w-12 h-12 app-icon bg-gradient-to-b from-[#4DA6FF]/45 to-[#0A84FF]/20 rounded-2xl flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6 text-[#4DA6FF]" />
          </div>
          <p className="text-[14px] text-white/75 leading-relaxed">{doc.intro}</p>
        </div>

        {/* Разделы отдельными карточками */}
        <div className="flex flex-col gap-3">
          {doc.sections.map((s, i) => (
            <section key={i} className="ios-list p-5">
              <h2 className="text-[16px] font-bold text-white mb-2.5 leading-snug">{s.h}</h2>
              <div className="flex flex-col gap-2">
                {s.p.map((para, j) => (
                  <p key={j} className="text-[14px] text-white/70 leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="text-center text-[12px] text-white/30 mt-6 px-6">Gigabyte VPN · {doc.updated}</div>
      </div>
    </motion.div>
  );
}
