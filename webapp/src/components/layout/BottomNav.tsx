import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { hapticFeedback } from '../../lib/telegram';
import { cn } from '../../lib/utils';

export type NavTab = {
  path: string;
  icon: React.ElementType;
  label: string;
};

interface BottomNavProps {
  tabs: NavTab[];
}

const spring = { type: 'spring' as const, damping: 26, stiffness: 340, mass: 0.8 };

/** Скрываем панель, когда открыта экранная клавиатура:
 *  visualViewport сжимается — панель плавно уезжает вниз. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // Клавиатура почти всегда занимает > 25% высоты окна
      setOpen(vv.height < window.innerHeight * 0.75);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);
  return open;
}

// Морфинг-таб-бар в стиле iOS. Контейнер ФИКСИРОВАННОЙ ширины, вкладки
// делят её пропорционально (активная шире), поэтому панель никогда не
// меняет размер и не «прыгает» — анимируется только распределение внутри.
export const BottomNav: React.FC<BottomNavProps> = ({ tabs }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const keyboardOpen = useKeyboardOpen();

  const handleNavigate = (path: string) => {
    if (currentPath === path) {
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    hapticFeedback.impactOccurred('light');
    navigate(path, { replace: true });
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none flex justify-center pb-[env(safe-area-inset-bottom)] mb-3 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      style={{
        transform: keyboardOpen ? 'translateY(120px)' : 'translateY(0)',
        opacity: keyboardOpen ? 0 : 1,
      }}
    >
      <div
        className="pointer-events-auto relative flex items-center px-1.5 w-[min(92vw,400px)]"
        style={{
          height: '58px',
          borderRadius: '29px',
          background: 'linear-gradient(145deg, rgba(50,50,56,0.55), rgba(18,18,22,0.68))',
          backdropFilter: 'blur(32px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
        }}
      >
        {tabs.map((tab) => {
          const isActive = currentPath === tab.path;
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.path}
              layout
              transition={spring}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleNavigate(tab.path);
              }}
              className="relative h-[46px] rounded-full flex items-center justify-center overflow-hidden min-w-0"
              style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'none',
                flex: isActive ? 2.1 : 1,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  transition={spring}
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(77,166,255,0.30), rgba(10,132,255,0.14))',
                    border: '1px solid rgba(77,166,255,0.28)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 16px rgba(10,132,255,0.25)',
                  }}
                />
              )}
              <motion.div
                layout
                transition={spring}
                animate={{ scale: isActive ? 1.08 : 1 }}
                className={cn(
                  'relative z-10 flex items-center justify-center shrink-0',
                  isActive ? 'text-[#4DA6FF] drop-shadow-[0_0_10px_rgba(10,132,255,0.65)]' : 'text-white/40',
                )}
              >
                <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
              </motion.div>
              <AnimatePresence mode="popLayout">
                {isActive && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="relative z-10 text-[12.5px] font-bold tracking-tight text-[#8FC5FF] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 pl-1.5"
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
