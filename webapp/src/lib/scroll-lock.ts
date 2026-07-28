import { useEffect } from 'react';

/**
 * Блокировка прокрутки фона под модалками и шторками.
 *
 * Почему не просто `overflow: hidden` на body: в iOS-вебвью это не удерживает
 * прокрутку от касания — страница под окном всё равно «уезжает». Надёжный
 * способ — зафиксировать body на текущей позиции (position: fixed + top),
 * а при закрытии вернуть скролл ровно туда, где пользователь был.
 *
 * Счётчик locks — на случай нескольких слоёв (шторка поверх шторки).
 */
let locks = 0;
let savedY = 0;
// Отложенное снятие: React в StrictMode монтирует эффекты дважды
// (mount → unmount → mount), и мгновенный unlock терял сохранённую позицию.
let pendingUnlock: ReturnType<typeof setTimeout> | null = null;

function lock() {
  if (pendingUnlock !== null) {
    clearTimeout(pendingUnlock);
    pendingUnlock = null;
    locks++;
    return; // body всё ещё зафиксирован с верной savedY
  }
  if (locks++ > 0) return;
  savedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${savedY}px`;
  b.left = '0';
  b.right = '0';
  b.width = '100%';
  b.overflow = 'hidden';
}

function unlock() {
  if (--locks > 0) return;
  locks = 0;
  pendingUnlock = setTimeout(() => {
    pendingUnlock = null;
    const b = document.body.style;
    b.position = '';
    b.top = '';
    b.left = '';
    b.right = '';
    b.width = '';
    b.overflow = '';
    window.scrollTo(0, savedY);
  }, 0);
}

/** Пока active=true — фон не скроллится; снимается при размонтировании */
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}

/** Вставляется внутрь оверлея: смонтирован — фон заблокирован. */
export function ScrollLock() {
  useLockBodyScroll(true);
  return null;
}
