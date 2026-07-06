import { useState } from 'react';
import { Apple, Smartphone, Laptop, Monitor, ChevronDown, ShieldCheck } from 'lucide-react';
import { hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';

export default function Instructions() {
  const [openOs, setOpenOs] = useState<string | null>(null);

  const OSItems = [
    {
      id: 'ios',
      name: 'iOS (iPhone & iPad)',
      icon: Apple,
      content: '🍏 <b>Настройка iPhone и iPad</b>\n\nИнтеграция на уровне системы. Быстро, безопасно и с минимальным расходом батареи.\n\n1️⃣ <b>Загрузка приложения</b>\n   • Откройте встроенный App Store.\n   • Найдите и скачайте бесплатное приложение <b>Streisand</b>. Оно идеально оптимизировано для iOS.\n\n2️⃣ <b>Синхронизация подписки</b>\n   • Скопируйте вашу <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте Streisand и нажмите <b>«+»</b> в правом верхнем углу.\n   • Выберите <b>«Добавить из буфера обмена»</b> (Import from Clipboard). Приложение само определит тип ссылки и загрузит все серверы.\n\n3️⃣ <b>Активация защиты</b>\n   • Вернитесь на главный экран приложения.\n   • Удерживайте кнопку подключения для выбора локации или нажмите её для быстрого старта.\n   • iOS запросит разрешение на настройку подключения: нажмите «Разрешить».\n\n✨ <b>Готово.</b> Ваш трафик надежно зашифрован.',
      downloadUrl: 'https://apps.apple.com/us/app/streisand/id6450534064',
      downloadLabel: 'Скачать Streisand из App Store',
    },
    {
      id: 'mac',
      name: 'Mac (macOS)',
      icon: Laptop,
      content: '💻 <b>Настройка Mac (macOS)</b>\n\nБезупречная работа как на новейших чипах Apple Silicon (M1–M5), так и на Intel.\n\n1️⃣ <b>Подготовка пространства</b>\n   • Откройте Mac App Store и установите приложение <b>Streisand</b>.\n\n2️⃣ <b>Подключение умной подписки</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте Streisand.\n   • Нажмите <b>«+»</b> и выберите <b>«Добавить из буфера обмена»</b> (Import from Clipboard).\n   • Приложение мгновенно подтянет все доступные серверы.\n\n3️⃣ <b>Запуск на уровне системы</b>\n   • Выберите нужную локацию из появившегося списка.\n   • Нажмите кнопку подключения.\n   • При необходимости разрешите добавление защищенной конфигурации.\n\n✨ <b>Готово.</b> Вы в абсолютной безопасности.',
      downloadUrl: 'https://apps.apple.com/us/app/streisand/id6450534064',
      downloadLabel: 'Скачать Streisand из App Store',
    },
    {
      id: 'android',
      name: 'Android',
      icon: Smartphone,
      content: '📱 <b>Настройка Android</b>\n\nСвобода и приватность в несколько касаний.\n\n1️⃣ <b>Установка клиента</b>\n   • Перейдите в Google Play и установите приложение <b>v2rayNG</b>.\n\n2️⃣ <b>Добавление подписки</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте v2rayNG и нажмите на значок <b>«+»</b> внизу экрана.\n   • Выберите пункт <b>«Добавить из буфера обмена»</b> (Import from clipboard).\n   • Затем откройте боковое меню → три точки вверху → <b>«Обновить подписки»</b>. Появится список серверов.\n\n3️⃣ <b>Активация соединения</b>\n   • Коснитесь нужного сервера, чтобы выбрать его (появится зеленая полоска).\n   • Нажмите круглую кнопку подключения (логотип «V» внизу экрана).\n   • Разрешите системе Android создать защищенное соединение.\n\n✨ <b>Готово.</b> Интернет без границ активирован.',
      downloadUrl: 'https://play.google.com/store/apps/details?id=com.v2ray.ang',
      downloadLabel: 'Скачать v2rayNG из Google Play',
    },
    {
      id: 'windows',
      name: 'Windows',
      icon: Monitor,
      content: '🖥 <b>Настройка Windows</b>\n\nМаксимальная производительность и стабильность для вашего ПК.\n\n1️⃣ <b>Установка приложения</b>\n   • Рекомендуем современный клиент <b>v2rayN</b>.\n   • Скачайте актуальную версию с официального GitHub и запустите exe-файл.\n\n2️⃣ <b>Синхронизация сети</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • В приложении нажмите кнопку <b>«Серверы»</b> (Servers) → <b>«Добавить сервер из буфера обмена»</b> (Add from bulk or clipboard).\n   • Если вы копируете ссылку на подписку: зайдите в <b>«Подписки»</b> → <b>«Настройка подписок»</b> → <b>«Добавить»</b> → вставьте URL.\n   • Обновите список серверов для завершения настройки.\n\n3️⃣ <b>Маршрутизация трафика</b>\n   • Выберите любой сервер из списка.\n   • Включите системный прокси (System Proxy) в нижнем меню.\n\n✨ <b>Готово.</b> Ваш цифровой след надежно скрыт.',
      downloadUrl: 'https://github.com/2dust/v2rayN/releases',
      downloadLabel: 'Скачать v2rayN (для Windows) с GitHub',
    },
  ];

  const handleToggle = (id: string) => {
    hapticFeedback.selectionChanged();
    setOpenOs((prev) => (prev === id ? null : id));
  };

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 pb-2">
      <header className="mb-2 pt-4 px-1">
        <h1 className="text-[19.8px] uppercase tracking-widest font-bold text-[#8E8E93] mb-2 leading-tight flex items-start gap-3 px-4 mt-2">
          <ShieldCheck className="w-6 h-6 text-blue-500/80 animate-pulse mt-0.5 shrink-0" />
          <span>
            Ваша безопасность.
            <br />
            На ваших условиях.
          </span>
        </h1>
      </header>

      <div className="ios-list">
        {OSItems.map((os) => {
          const isOpen = openOs === os.id;
          return (
            <div key={os.id} className="relative">
              <button
                onClick={() => handleToggle(os.id)}
                className={cn(
                  'flex items-center justify-between p-4 w-full text-left bg-transparent transition-colors',
                  !isOpen && 'active:bg-[#2C2C2E]/80',
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-[#2C2C2E] rounded-[10px] flex items-center justify-center border border-white/[0.08] shadow-sm">
                    <os.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-semibold text-[17px] text-white">{os.name}</span>
                </div>
                <ChevronDown
                  className={cn('w-5 h-5 text-gray-500 transition-transform duration-300', isOpen ? 'rotate-180' : '')}
                />
              </button>

              <div
                className={cn(
                  'overflow-hidden transition-all duration-300 ease-in-out',
                  isOpen ? 'max-h-[2500px] opacity-100' : 'max-h-0 opacity-0',
                )}
              >
                <div className="px-4 pb-5 pt-2">
                  <div className="space-y-4">
                    <div
                      className="text-[15px] text-gray-300 font-medium leading-[1.6] whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: os.content }}
                    />
                  </div>
                  {os.downloadUrl && (
                    <div className="mt-5">
                      <a
                        href={os.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full py-3.5 bg-[#2C2C2E] active:bg-[#38383A] text-[#0A84FF] text-center font-semibold text-[17px] rounded-full transition-colors"
                      >
                        {os.downloadLabel}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="absolute bottom-0 right-[3rem] left-[4.5rem] h-[1px] bg-[#38383A]/80 last:hidden" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
