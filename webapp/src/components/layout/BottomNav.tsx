import React from 'react';
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

// Морфинг-таб-бар в стиле iOS: неактивные вкладки — только иконка,
// активная раскрывается в капсулу «иконка + название». Текст всегда
// внутри таблетки, ширина анимируется пружиной.
export const BottomNav: React.FC<BottomNavProps> = ({ tabs }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const handleNavigate = (path: string) => {
    if (currentPath === path) {
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    hapticFeedback.impactOccurred('light');
    navigate(path, { replace: true });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none flex justify-center pb-[env(safe-area-inset-bottom)] mb-3">
      <div
        className="pointer-events-auto relative flex items-center gap-1 px-1.5"
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
              className="relative h-[46px] rounded-full flex items-center justify-center overflow-hidden"
              style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'none',
                paddingLeft: isActive ? 16 : 13,
                paddingRight: isActive ? 18 : 13,
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
                  'relative z-10 flex items-center justify-center',
                  isActive ? 'text-[#4DA6FF] drop-shadow-[0_0_10px_rgba(10,132,255,0.65)]' : 'text-white/40',
                )}
              >
                <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
              </motion.div>
              <AnimatePresence mode="popLayout">
                {isActive && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -8, width: 0 }}
                    animate={{ opacity: 1, x: 0, width: 'auto' }}
                    exit={{ opacity: 0, x: -6, width: 0 }}
                    transition={spring}
                    className="relative z-10 text-[13px] font-bold tracking-tight text-[#8FC5FF] whitespace-nowrap overflow-hidden pl-2"
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
