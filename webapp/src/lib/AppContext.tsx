import { createContext, useContext } from 'react';
import type { Bootstrap } from './api';

export type AppState = {
  boot: Bootstrap;
  refreshBoot: () => Promise<void>;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext не инициализирован');
  return ctx;
}
