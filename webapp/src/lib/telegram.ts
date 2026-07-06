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

  const t = tg as any;

  // Полноэкранный режим (Bot API 8.0+): приложение всегда открывается
  // на весь экран, откуда бы его ни запустили — из чата или из меню.
  try {
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && t.requestFullscreen && !t.isFullscreen) {
      t.requestFullscreen();
    }
  } catch (e) {}

  // Запрещаем закрытие свайпом вниз — только кнопкой «Закрыть».
  try {
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7') && t.disableVerticalSwipes) {
      t.disableVerticalSwipes();
    }
  } catch (e) {}

  // Диалог подтверждения закрытия НЕ включаем: его системный текст
  // («изменения могут быть потеряны») нельзя заменить своим, а случайное
  // закрытие уже исключено отключением вертикальных свайпов выше —
  // приложение закрывается только штатной кнопкой.

  document.documentElement.className = tg.colorScheme || 'dark';
};

/** Скачивание файла средствами Telegram (Bot API 8.0+).
 *  Возвращает false, если метод недоступен — тогда вызывающий код
 *  открывает ссылку обычным способом. */
export const downloadFile = (url: string, fileName: string): boolean => {
  const t = tg as any;
  try {
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('8.0') && t.downloadFile) {
      t.downloadFile({ url, file_name: fileName }, () => {});
      return true;
    }
  } catch (e) {}
  return false;
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
