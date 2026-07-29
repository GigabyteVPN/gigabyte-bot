// ============================================================
//  Копирование — одно на всё приложение.
//
//  Раньше в каждом месте был свой вызов navigator.clipboard: где-то с
//  тактильным откликом, где-то без, где-то без подтверждения. Здесь
//  собрано единое поведение, как у ссылки подключения: короткая вибрация,
//  надпись «Скопировано» на 2 секунды, затем возврат в обычный вид.
//
//  Отдельно важен запасной путь. navigator.clipboard недоступен, когда
//  страница открыта не по HTTPS и в части встроенных браузеров Android —
//  прямой вызов там молча падает, и человек остаётся без ссылки, не понимая
//  почему. Поэтому при отказе копируем через скрытое поле ввода.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticFeedback } from './telegram';

/** Копирует текст, возвращает признак успеха. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* переходим к запасному способу */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Поле должно быть в документе и доступно для выделения, но невидимо:
    // display:none или visibility:hidden ломают выделение в iOS.
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Состояние «что сейчас скопировано» для группы кнопок.
 * `id` — произвольная метка элемента, чтобы подсветить именно его.
 */
export function useCopy(resetMs = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Таймер обязательно снимаем при размонтировании: иначе обновление
  // состояния прилетит в уже удалённый компонент.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(
    async (text: string, id: string) => {
      const ok = await copyText(text);
      if (!ok) {
        hapticFeedback.notificationOccurred('error');
        return false;
      }
      hapticFeedback.selectionChanged();
      setCopiedId(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedId(null), resetMs);
      return true;
    },
    [resetMs],
  );

  return { copiedId, copy, isCopied: (id: string) => copiedId === id };
}

/**
 * Что показывать в плашке вместо длинной ссылки-подписки.
 * Показываем только схему и домен: порт и путь — служебные подробности,
 * они лишь мешают читать и намекают на устройство сервиса. Копируется
 * при этом всегда полная ссылка.
 */
export function linkOrigin(link: string): string {
  try {
    const u = new URL(link);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    // Не ссылка — отдаём как есть, обрезая по первому двоеточию после домена
    return link.split(/[:/?#]/).slice(0, 1).join('') || link;
  }
}
