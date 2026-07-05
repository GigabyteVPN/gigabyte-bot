import React, { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User, ShoppingBag, Shield, BookOpen, LifeBuoy } from 'lucide-react';
import { usePopAnimation } from '../../hooks/usePopAnimation';
import { hapticFeedback } from '../../lib/telegram';

interface BottomNavProps {
  isAdmin?: boolean;
}

const ICONS: Record<string, React.ElementType> = {
  Profile: User,
  Buy: ShoppingBag,
  Guides: BookOpen,
  Support: LifeBuoy,
  Admin: Shield,
};

export const BottomNav: React.FC<BottomNavProps> = ({ isAdmin }) => {
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

  const tabs = [
    { path: '/', icon: 'Profile', label: 'Дашборд' },
    { path: '/buy', icon: 'Buy', label: 'Купить' },
    { path: '/instructions', icon: 'Guides', label: 'Гайды' },
    { path: '/support', icon: 'Support', label: 'Помощь' },
  ];

  if (isAdmin) {
    tabs.push({ path: '/admin', icon: 'Admin', label: 'Админ' });
  }

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
        className="w-[calc(94%-16px)] max-w-[400px] pointer-events-auto relative bg-[#1C1C1E]/60 backdrop-blur-[15px] border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        style={{ height: '54px', borderRadius: '27px' }}
      >
        <div
          className="absolute top-[3px] bottom-[3px] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ ...indicatorStyle, left: 0 }}
        >
          <div
            className={`w-full h-full rounded-full ${poppingTab ? 'animate-pop-150' : ''}`}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          />
        </div>

        <div className="flex items-center justify-around h-full px-0.5 relative z-10 w-full">
          {tabs.map((tab) => {
            const isActive = currentPath === tab.path;
            const IconElement = ICONS[tab.icon];
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
                  className={`transition-all duration-300 ease-out flex items-center justify-center ${isActive ? 'text-[#0A84FF] scale-125' : 'text-white/40'}`}
                >
                  <IconElement size={20} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'opacity-100' : 'opacity-60'} />
                </div>
                <span
                  className={`text-[10px] block w-full text-center font-bold tracking-wide transition-all duration-300 mt-1 ${isActive ? 'text-[#0A84FF] scale-110' : 'text-white/40'}`}
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
