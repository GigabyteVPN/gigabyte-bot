import React from 'react';
import { cn } from '../lib/utils';

/** Единый стиль заголовков разделов во всём приложении —
 *  как у «Мои подписки» на Дашборде. */
export const SectionTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h2 className={cn('text-[14px] uppercase tracking-wider text-[#8E8E93] font-semibold mb-3 ml-4', className)}>
    {children}
  </h2>
);
