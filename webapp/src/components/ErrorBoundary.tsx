import React from 'react';

/**
 * Страховка от «чёрного экрана».
 *
 * Если любой компонент упадёт при рендере, React по умолчанию размонтирует
 * всё дерево — пользователь видит пустой экран и не понимает, что делать.
 * Здесь показываем внятное сообщение с кнопкой перезапуска, а текст ошибки
 * оставляем в консоли для диагностики.
 */
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Сбой интерфейса:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#050507] px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#FF453A]/15 flex items-center justify-center text-[28px]">
          ⚠️
        </div>
        <div className="text-[19px] font-semibold text-white">Что-то пошло не так</div>
        <div className="text-[15px] text-[#8E8E93] max-w-[320px]">
          Приложение не смогло загрузиться. Попробуйте перезапустить — данные не пострадали.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-8 py-3 btn-primary rounded-full text-white font-semibold text-[16px] active:scale-95 transition-transform"
        >
          Перезапустить
        </button>
      </div>
    );
  }
}
