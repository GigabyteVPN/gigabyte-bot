import React, { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePopAnimation } from '../../hooks/usePopAnimation';
import { hapticFeedback } from '../../lib/telegram';

export type NavTab = {
  path: string;
  icon: React.ElementType;
  label: string;
};

interface BottomNavProps {
  tabs: NavTab[];
}

export const BottomNav: React.FC<BottomNavProps> = ({ tabs }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const handleNavigate = (path: string) => {
    if (currentPath === path) {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    hapticFeedback.selectionChanged();
    navigate(path, { replace: true });
  };

  const navRef = useRef<HTMLDivElement>(null);
  const scaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({});

  useEffect(() => {
    const updatePillPosition = () => {
      if (!navRef.current) return;
      const index = tabs.findIndex((t) => t.path === currentPath);
      if (index === -1) {
        setIndicatorStyle({ opacity: 0 });
        return;
      }

      const buttons = navRef.current.querySelectorAll('.nav-tab-btn');
      const activeButton = buttons[index] as HTMLElement;

      if (activeButton) {
        const tabWidth = activeButton.offsetWidth;
        const pillWidth = tabWidth - 4;
        const tx = activeButton.offsetLeft + (tabWidth - pillWidth) / 2;

        if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);

        setIndicatorStyle((prev) => ({
          ...prev,
          width: pillWidth,
          transform: `translateX(${tx}px) scale(1.05)`,
          opacity: 1,
        }));

        scaleTimeoutRef.current = setTimeout(() => {
          setIndicatorStyle({
            width: pillWidth,
            transform: `translateX(${tx}px) scale(1)`,
            opacity: 1,
          });
        }, 150);
      }
    };

    setTimeout(updatePillPosition, 10);
    window.addEventListener('resize', updatePillPosition);
    updatePillPosition();
    return () => window.removeEventListener('resize', updatePillPosition);
  }, [currentPath, tabs.length]);

  const { poppingId: poppingTab, triggerPop: triggerTabPop } = usePopAnimation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none flex justify-center pb-[env(safe-area-inset-bottom)] mb-3">
      <div
        ref={navRef}
        className="w-[calc(94%-16px)] max-w-[420px] pointer-events-auto relative"
        style={{
          height: '58px',
          borderRadius: '29px',
          background: 'linear-gradient(145deg, rgba(50,50,56,0.55), rgba(18,18,22,0.65))',
          backdropFilter: 'blur(32px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
        }}
      >
        <div
          className="absolute top-[4px] bottom-[4px] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ ...indicatorStyle, left: 0 }}
        >
          <div
            className={`w-full h-full rounded-full ${poppingTab ? 'animate-pop-150' : ''}`}
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08))',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }}
          />
        </div>

        <div className="flex items-center justify-around h-full px-0.5 relative z-10 w-full">
          {tabs.map((tab) => {
            const isActive = currentPath === tab.path;
            const IconElement = tab.icon;
            return (
              <button
                key={tab.path}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  triggerTabPop(tab.path);
                  handleNavigate(tab.path);
                }}
                className={`nav-tab-btn flex-1 flex flex-col items-center justify-center h-full relative z-10 cursor-pointer ${poppingTab === tab.path ? 'animate-pop-150' : ''}`}
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'none' }}
              >
                <div
                  className={`transition-all duration-300 ease-out flex items-center justify-center ${isActive ? 'text-[#4DA6FF] scale-125 drop-shadow-[0_0_8px_rgba(10,132,255,0.6)]' : 'text-white/40'}`}
                >
                  <IconElement size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'opacity-100' : 'opacity-60'} />
                </div>
                <span
                  className={`text-[10px] block w-full text-center font-bold tracking-wide transition-all duration-300 mt-1 ${isActive ? 'text-[#4DA6FF] scale-110' : 'text-white/40'}`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
