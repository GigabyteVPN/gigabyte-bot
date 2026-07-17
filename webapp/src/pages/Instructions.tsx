import { useState } from 'react';
import { Apple, Smartphone, Laptop, Monitor, ChevronDown, Link2 } from 'lucide-react';
import { hapticFeedback } from '../lib/telegram';
import { cn } from '../lib/utils';
import { t, LANG } from '../lib/i18n';
import { SectionTitle } from '../components/SectionTitle';

// Контент гайдов: RU и EN версии. Мы выдаём пользователю ТОЛЬКО
// ссылку-подписку — все инструкции построены вокруг неё.
const CONTENT = {
  ios: {
    ru: '🍏 <b>Настройка iPhone и iPad</b>\n\nИнтеграция на уровне системы. Быстро, безопасно и с минимальным расходом батареи.\n\n1️⃣ <b>Загрузка приложения</b>\n   • Откройте встроенный App Store.\n   • Найдите и скачайте бесплатное приложение <b>Streisand</b>. Оно идеально оптимизировано для iOS.\n\n2️⃣ <b>Синхронизация подписки</b>\n   • Скопируйте вашу <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте Streisand и нажмите <b>«+»</b> в правом верхнем углу.\n   • Выберите <b>«Добавить из буфера обмена»</b> (Import from Clipboard). Приложение само определит тип ссылки и загрузит все серверы.\n\n3️⃣ <b>Активация защиты</b>\n   • Вернитесь на главный экран приложения.\n   • Удерживайте кнопку подключения для выбора локации или нажмите её для быстрого старта.\n   • iOS запросит разрешение на настройку подключения: нажмите «Разрешить».\n\n✨ <b>Готово.</b> Ваш трафик надежно зашифрован.',
    en: '🍏 <b>iPhone & iPad setup</b>\n\nSystem-level integration. Fast, secure, battery-friendly.\n\n1️⃣ <b>Get the app</b>\n   • Open the App Store.\n   • Download the free <b>Streisand</b> app — perfectly optimized for iOS.\n\n2️⃣ <b>Add your subscription</b>\n   • Copy your <b>subscription link</b> from the Home tab.\n   • Open Streisand and tap <b>«+»</b> in the top-right corner.\n   • Choose <b>Import from Clipboard</b>. The app detects the link and loads all servers automatically.\n\n3️⃣ <b>Turn protection on</b>\n   • Go back to the main screen.\n   • Long-press the connect button to pick a location, or tap it for quick start.\n   • iOS will ask for permission to add a VPN configuration: tap "Allow".\n\n✨ <b>Done.</b> Your traffic is encrypted.',
  },
  mac: {
    ru: '💻 <b>Настройка Mac (macOS)</b>\n\nБезупречная работа как на новейших чипах Apple Silicon (M1–M5), так и на Intel.\n\n1️⃣ <b>Подготовка пространства</b>\n   • Откройте Mac App Store и установите приложение <b>Streisand</b>.\n\n2️⃣ <b>Подключение умной подписки</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте Streisand.\n   • Нажмите <b>«+»</b> и выберите <b>«Добавить из буфера обмена»</b> (Import from Clipboard).\n   • Приложение мгновенно подтянет все доступные серверы.\n\n3️⃣ <b>Запуск на уровне системы</b>\n   • Выберите нужную локацию из появившегося списка.\n   • Нажмите кнопку подключения.\n   • При необходимости разрешите добавление защищенной конфигурации.\n\n✨ <b>Готово.</b> Вы в абсолютной безопасности.',
    en: '💻 <b>Mac (macOS) setup</b>\n\nFlawless on Apple Silicon (M1–M5) and Intel.\n\n1️⃣ <b>Install</b>\n   • Open the Mac App Store and install <b>Streisand</b>.\n\n2️⃣ <b>Connect your subscription</b>\n   • Copy your <b>subscription link</b> from the Home tab.\n   • Open Streisand.\n   • Tap <b>«+»</b> and choose <b>Import from Clipboard</b>.\n   • The app instantly loads all available servers.\n\n3️⃣ <b>Go live</b>\n   • Pick a location from the list.\n   • Press the connect button.\n   • Allow adding the secure configuration if asked.\n\n✨ <b>Done.</b> You are fully protected.',
  },
  android: {
    ru: '📱 <b>Настройка Android</b>\n\nПриватность и скорость в несколько касаний.\n\n1️⃣ <b>Установка клиента</b>\n   • Перейдите в Google Play и установите приложение <b>v2rayNG</b>.\n\n2️⃣ <b>Добавление подписки</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • Откройте v2rayNG и нажмите на значок <b>«+»</b> внизу экрана.\n   • Выберите пункт <b>«Добавить из буфера обмена»</b> (Import from clipboard).\n   • Затем откройте боковое меню → три точки вверху → <b>«Обновить подписки»</b>. Появится список серверов.\n\n3️⃣ <b>Активация соединения</b>\n   • Коснитесь нужного сервера, чтобы выбрать его (появится зеленая полоска).\n   • Нажмите круглую кнопку подключения (логотип «V» внизу экрана).\n   • Разрешите системе Android создать защищенное соединение.\n\n✨ <b>Готово.</b> Защищённое соединение активно.',
    en: '📱 <b>Android setup</b>\n\nPrivacy and speed in a few taps.\n\n1️⃣ <b>Install the client</b>\n   • Get <b>v2rayNG</b> from Google Play.\n\n2️⃣ <b>Add your subscription</b>\n   • Copy your <b>subscription link</b> from the Home tab.\n   • Open v2rayNG and tap <b>«+»</b> at the bottom.\n   • Choose <b>Import from clipboard</b>.\n   • Then open the side menu → three dots at the top → <b>Update subscriptions</b>. The server list appears.\n\n3️⃣ <b>Connect</b>\n   • Tap a server to select it (a green bar appears).\n   • Press the round connect button (the «V» logo at the bottom).\n   • Allow Android to create the secure connection.\n\n✨ <b>Done.</b> Secure connection is active.',
  },
  windows: {
    ru: '🖥 <b>Настройка Windows</b>\n\nМаксимальная производительность и стабильность для вашего ПК.\n\n1️⃣ <b>Установка приложения</b>\n   • Рекомендуем современный клиент <b>v2rayN</b>.\n   • Скачайте актуальную версию с официального GitHub и запустите exe-файл.\n\n2️⃣ <b>Синхронизация сети</b>\n   • Скопируйте <b>Ссылку-подписку</b> из Дашборда.\n   • Зайдите в <b>«Подписки»</b> → <b>«Настройка подписок»</b> → <b>«Добавить»</b> → вставьте URL.\n   • Обновите список серверов для завершения настройки.\n\n3️⃣ <b>Маршрутизация трафика</b>\n   • Выберите любой сервер из списка.\n   • Включите системный прокси (System Proxy) в нижнем меню.\n\n✨ <b>Готово.</b> Ваш цифровой след надежно скрыт.',
    en: '🖥 <b>Windows setup</b>\n\nMaximum performance and stability for your PC.\n\n1️⃣ <b>Install the app</b>\n   • We recommend the modern <b>v2rayN</b> client.\n   • Download the latest release from the official GitHub and run the exe.\n\n2️⃣ <b>Sync your subscription</b>\n   • Copy your <b>subscription link</b> from the Home tab.\n   • Go to <b>Subscriptions</b> → <b>Subscription settings</b> → <b>Add</b> → paste the URL.\n   • Update the server list to finish.\n\n3️⃣ <b>Route your traffic</b>\n   • Pick any server from the list.\n   • Enable System Proxy in the bottom menu.\n\n✨ <b>Done.</b> Your digital footprint is hidden.',
  },
};

export default function Instructions() {
  const [openOs, setOpenOs] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const OSItems = [
    {
      id: 'ios',
      name: 'iOS (iPhone & iPad)',
      icon: Apple,
      content: CONTENT.ios[LANG],
      downloadUrl: 'https://apps.apple.com/us/app/streisand/id6450534064',
      downloadLabel: `${t('guide.download')} Streisand — App Store`,
    },
    {
      id: 'mac',
      name: 'Mac (macOS)',
      icon: Laptop,
      content: CONTENT.mac[LANG],
      downloadUrl: 'https://apps.apple.com/us/app/streisand/id6450534064',
      downloadLabel: `${t('guide.download')} Streisand — App Store`,
    },
    {
      id: 'android',
      name: 'Android',
      icon: Smartphone,
      content: CONTENT.android[LANG],
      downloadUrl: 'https://play.google.com/store/apps/details?id=com.v2ray.ang',
      downloadLabel: `${t('guide.download')} v2rayNG — Google Play`,
    },
    {
      id: 'windows',
      name: 'Windows',
      icon: Monitor,
      content: CONTENT.windows[LANG],
      downloadUrl: 'https://github.com/2dust/v2rayN/releases',
      downloadLabel: `${t('guide.download')} v2rayN — GitHub`,
    },
  ];

  const handleToggle = (id: string) => {
    hapticFeedback.selectionChanged();
    setOpenOs((prev) => (prev === id ? null : id));
  };

  return (
    <div className="px-4 pt-2 flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500 pb-2">
      <header className="pt-2">
        <SectionTitle className="mb-0 mt-2">{t('guide.title')}</SectionTitle>
      </header>

      {/* Как устроено подключение: одна ссылка-подписка на все устройства */}
      <div className="ios-list">
        <button
          onClick={() => {
            hapticFeedback.selectionChanged();
            setHowOpen((v) => !v);
          }}
          className="flex items-center justify-between p-4 w-full text-left"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 app-icon bg-gradient-to-b from-[#4DA6FF]/50 to-[#0A84FF]/20 rounded-[10px] flex items-center justify-center">
              <Link2 className="w-5 h-5 text-[#4DA6FF]" />
            </div>
            <span className="font-semibold text-[17px] text-white">{t('guide.howTitle')}</span>
          </div>
          <ChevronDown
            className={cn('w-5 h-5 text-gray-500 transition-transform duration-300', howOpen ? 'rotate-180' : '')}
          />
        </button>
        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-in-out',
            howOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <div className="px-4 pb-5 pt-1 text-[15px] text-gray-300 font-medium leading-[1.6] whitespace-pre-wrap">
            {t('guide.how')}
          </div>
        </div>
      </div>

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
