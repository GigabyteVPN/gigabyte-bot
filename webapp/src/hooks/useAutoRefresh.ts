import { useEffect, useRef } from 'react';

/**
 * Перезапрашивает данные, когда пользователь возвращается в мини-апп.
 *
 * Telegram держит WebView в памяти: при повторном открытии приложение НЕ
 * перемонтируется, поэтому данные (статус подписки, платежи) остаются
 * устаревшими. Слушаем возврат видимости/фокуса и периодически обновляем,
 * чтобы изменения (например, закрытая администратором подписка) появлялись
 * без ручной перезагрузки.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 25000) {
  const saved = useRef(refresh);
  saved.current = refresh;

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') saved.current();
    };

    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);

    // Telegram шлёт события активации приложения — тоже повод обновиться.
    const tgAny = (window as any).Telegram?.WebApp;
    try {
      tgAny?.onEvent?.('activated', run);
      tgAny?.onEvent?.('visibility_changed', run);
    } catch {
      /* старые версии клиента — игнорируем */
    }

    const timer = window.setInterval(run, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
      window.clearInterval(timer);
      try {
        tgAny?.offEvent?.('activated', run);
        tgAny?.offEvent?.('visibility_changed', run);
      } catch {
        /* noop */
      }
    };
  }, [intervalMs]);
}
