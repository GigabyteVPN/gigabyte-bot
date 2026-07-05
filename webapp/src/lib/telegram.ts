import WebApp from '@twa-dev/sdk';

export const tg = new Proxy(WebApp, {
  get(target, prop, receiver) {
    if (prop === 'showAlert') {
      return (message: string) => {
        try {
          if (target.isVersionAtLeast && target.isVersionAtLeast('6.2') && target.showAlert) {
            target.showAlert(message);
          } else {
            alert(message);
          }
        } catch (e) {
          alert(message);
        }
      };
    }
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(target);
    }
    return value;
  }
});

export const initTelegramApp = () => {
  try {
    tg.ready();
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
      tg.expand();
    }
  } catch (e) {
    // Ignore initialization errors
  }
  document.documentElement.className = tg.colorScheme || 'dark';
};

export const getUser = () => {
  return tg.initDataUnsafe?.user;
};

/** Открывает счёт Telegram Stars; резолвится статусом оплаты. */
export const openInvoice = (url: string): Promise<string> => {
  return new Promise((resolve) => {
    try {
      tg.openInvoice(url, (status: string) => resolve(status));
    } catch (e) {
      // Вне Telegram (или старая версия) — открываем ссылку как есть
      window.open(url, '_blank');
      resolve('opened_externally');
    }
  });
};

export const hapticFeedback = {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    try {
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {}
  },
  notificationOccurred: (type: 'error' | 'success' | 'warning') => {
    try {
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
        tg.HapticFeedback.notificationOccurred(type);
      }
    } catch (e) {}
  },
  selectionChanged: () => {
    try {
      if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (e) {}
  }
};
