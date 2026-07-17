// ====================== ЛОКАЛИЗАЦИЯ (RU / EN) ======================
// Язык определяется один раз при запуске по language_code пользователя
// Telegram: русскоязычные локали (ru/be/uk/kk) → RU, остальные → EN.

import { tg } from './telegram';

export type Lang = 'ru' | 'en';

const detect = (): Lang => {
  const code = (tg.initDataUnsafe?.user?.language_code || 'ru').toLowerCase();
  return /^(ru|be|uk|kk)/.test(code) ? 'ru' : 'en';
};

export const LANG: Lang = detect();

type Dict = Record<string, { ru: string; en: string }>;

const dict: Dict = {
  // ---------- Общее ----------
  'common.error': { ru: 'Ошибка', en: 'Error' },
  'common.copied': { ru: 'Скопировано', en: 'Copied' },
  'common.retry': { ru: 'Повторить', en: 'Retry' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.wait': { ru: 'Секунду…', en: 'One moment…' },

  // ---------- Навигация ----------
  'nav.dashboard': { ru: 'Дашборд', en: 'Home' },
  'nav.buy': { ru: 'Купить', en: 'Buy' },
  'nav.guides': { ru: 'Гайды', en: 'Guides' },
  'nav.support': { ru: 'Помощь', en: 'Support' },

  // ---------- Онбординг ----------
  'terms.welcome': { ru: 'Добро пожаловать', en: 'Welcome' },
  'terms.features': {
    ru: '⚡ Высокая скорость соединения\n🔐 Защищённое шифрованное подключение\n📶 Безопасность в публичных сетях Wi-Fi',
    en: '⚡ High-speed connection\n🔐 Encrypted, secure tunnel\n📶 Safety on public Wi-Fi networks',
  },
  'terms.offer': { ru: 'Публичная оферта', en: 'Terms of Service' },
  'terms.privacy': { ru: 'Политика конфиденциальности', en: 'Privacy Policy' },
  'terms.accept': { ru: '✅ Принять и продолжить', en: '✅ Accept & Continue' },
  'terms.note': {
    ru: 'Нажимая «Принять», вы соглашаетесь с условиями публичной оферты и политикой конфиденциальности.',
    en: 'By tapping "Accept" you agree to the Terms of Service and Privacy Policy.',
  },
  'app.connectFail': { ru: 'Не удалось подключиться', en: 'Connection failed' },
  'app.openFromTg': {
    ru: 'Откройте приложение из Telegram — авторизация выполняется автоматически.',
    en: 'Open the app from Telegram — authorization is automatic.',
  },

  // ---------- Дашборд ----------
  'dash.mySubs': { ru: 'Мои подписки', en: 'My subscriptions' },
  'dash.noSubs': { ru: 'Нет подписок', en: 'No subscriptions' },
  'dash.noSubsHint': { ru: 'Оформите подписку — доступ появится мгновенно.', en: 'Get a subscription — access is instant.' },
  'dash.buySub': { ru: '🛒 Купить подписку', en: '🛒 Buy subscription' },
  'dash.active': { ru: 'Защита активна', en: 'Protection active' },
  'dash.expired': { ru: 'Подписка истекла', en: 'Subscription expired' },
  'dash.timeLeft': { ru: 'Осталось времени', en: 'Time left' },
  'dash.online': { ru: 'Онлайн', en: 'Online' },
  'dash.traffic': { ru: 'Трафик', en: 'Traffic' },
  'dash.unlimited': { ru: 'Бессрочно ∞', en: 'Lifetime ∞' },
  'dash.subLink': { ru: 'Ссылка-подписка', en: 'Subscription link' },
  'dash.copiedBig': { ru: 'СКОПИРОВАНО', en: 'COPIED' },
  'dash.extend': { ru: 'Продлить подписку', en: 'Renew subscription' },
  'dash.expiredCta': { ru: 'Подписка истекла — оформить новую', en: 'Expired — get a new one' },
  'dash.pending': { ru: 'Ожидающие платежи', en: 'Pending payments' },
  'dash.payStars': { ru: 'Оплата Stars', en: 'Stars payment' },
  'dash.payCrypto': { ru: 'Оплата', en: 'Payment' },
  'dash.awaitTxid': { ru: 'Ожидает отправки TXID', en: 'Waiting for TXID' },
  'dash.awaitStars': { ru: 'Ожидает оплаты Stars', en: 'Waiting for Stars payment' },
  'dash.awaitTransfer': { ru: 'Ожидает перевода и TXID', en: 'Waiting for transfer & TXID' },
  'dash.payStarsBtn': { ru: 'Оплатить Stars', en: 'Pay with Stars' },
  'dash.payDetails': { ru: 'Реквизиты и оплата', en: 'Payment details' },
  'dash.history': { ru: 'История транзакций', en: 'Transaction history' },
  'dash.account': { ru: 'Аккаунт', en: 'Account' },
  'dash.deleteAccount': { ru: 'Удалить аккаунт и данные', en: 'Delete account & data' },
  'dash.deleteTitle': { ru: 'Удалить аккаунт?', en: 'Delete account?' },
  'dash.deleteText': {
    ru: 'Безвозвратно удалятся все подписки (доступ прекратится), история платежей, тикеты и персональные данные. Это действие нельзя отменить.',
    en: 'All subscriptions (access will stop), payment history, tickets and personal data will be permanently deleted. This cannot be undone.',
  },
  'dash.deleteConfirm': { ru: 'Да, удалить навсегда', en: 'Yes, delete forever' },
  'dash.deleted': { ru: '✅ Ваш аккаунт и все данные удалены. До свидания!', en: '✅ Your account and all data have been deleted. Goodbye!' },
  'dash.starsPaid': { ru: '✅ Оплата прошла! Подписка выдана — детали придут в чат с ботом.', en: '✅ Paid! Subscription issued — details will arrive in the bot chat.' },
  'dash.qrScan': { ru: 'Отсканируйте в приложении на другом устройстве', en: 'Scan in the VPN app on another device' },
  'dash.qrDownload': { ru: 'Скачать', en: 'Download' },
  'dash.qrShare': { ru: 'Поделиться', en: 'Share' },
  'dash.qrSent': { ru: '📲 QR-код отправлен в чат с ботом — перешлите его кому угодно или сохраните.', en: '📲 QR code sent to the bot chat — forward it to anyone or save it.' },
  'dash.remindOn': { ru: '🔔 Напоминания включены: бот предупредит за 24 часа и за 1 час до отключения.', en: '🔔 Reminders on: the bot will warn you 24h and 1h before expiry.' },
  'dash.remindOff': { ru: '🔕 Напоминания отключены. Включить можно в любой момент.', en: '🔕 Reminders off. You can re-enable them anytime.' },

  // ---------- История ----------
  'hist.title': { ru: 'История транзакций', en: 'Transaction history' },
  'hist.opsTotal': { ru: 'операций', en: 'operations' },
  'hist.spentTotal': { ru: 'Всего оплачено', en: 'Total paid' },
  'hist.all': { ru: 'Все', en: 'All' },
  'hist.paid': { ru: 'Оплата', en: 'Paid' },
  'hist.free': { ru: 'Бесплатные', en: 'Free' },
  'hist.cancelled': { ru: 'Отменённые', en: 'Cancelled' },
  'hist.stDone': { ru: 'Выполнено', en: 'Completed' },
  'hist.stExpired': { ru: 'Отменён', en: 'Cancelled' },
  'hist.stProcessing': { ru: 'В обработке', en: 'Processing' },
  'hist.trial': { ru: 'Пробный период', en: 'Trial period' },
  'hist.method': { ru: 'Способ оплаты', en: 'Payment method' },
  'hist.freeActivation': { ru: 'Бесплатная активация', en: 'Free activation' },
  'hist.crypto': { ru: 'Криптовалюта', en: 'Cryptocurrency' },
  'hist.orderNo': { ru: 'Номер заказа', en: 'Order ID' },
  'hist.txid': { ru: 'ID транзакции', en: 'Transaction ID' },
  'hist.receipt': { ru: 'Открыть кассовый чек', en: 'Open receipt' },
  'hist.empty': { ru: 'История пуста', en: 'No history yet' },
  'hist.emptyHint': { ru: 'Ваши транзакции будут отображаться здесь.', en: 'Your transactions will appear here.' },

  // ---------- Рефералка ----------
  'ref.card': { ru: 'Пригласить друзей', en: 'Invite friends' },
  'ref.cardHint': { ru: '5 друзей = месяц VPN бесплатно', en: '5 friends = a free month of VPN' },
  'ref.hero': { ru: 'Пригласите 5 друзей — получите месяц VPN бесплатно', en: 'Invite 5 friends — get a month of VPN for free' },
  'ref.progress': { ru: 'До бесплатного месяца', en: 'To your free month' },
  'ref.progressLeft': { ru: 'осталось {n} баллов', en: '{n} points to go' },
  'ref.readyRedeem': { ru: 'Баллов достаточно — заберите месяц!', en: 'Enough points — claim your month!' },
  'ref.points': { ru: 'баллов', en: 'points' },
  'ref.title': { ru: 'Партнёрская программа', en: 'Referral program' },
  'ref.balance': { ru: 'Ваши баллы', en: 'Your points' },
  'ref.how': { ru: 'Как это работает', en: 'How it works' },
  'ref.rule1': { ru: 'Друг запустил бота по вашей ссылке', en: 'A friend starts the bot via your link' },
  'ref.rule2': { ru: 'Друг оформил первую покупку', en: 'Your friend makes their first purchase' },
  'ref.rule3': { ru: 'месяц VPN бесплатно', en: 'month of VPN for free' },
  'ref.yourLink': { ru: 'Ваша ссылка', en: 'Your link' },
  'ref.share': { ru: 'Поделиться ссылкой', en: 'Share link' },
  'ref.shareText': {
    ru: '⚡ Быстрый и надёжный VPN — Gigabyte. Подключайся по моей ссылке!',
    en: '⚡ Fast & reliable VPN — Gigabyte. Join with my link!',
  },
  'ref.invited': { ru: 'Приглашено', en: 'Invited' },
  'ref.paidFriends': { ru: 'Оплатили', en: 'Purchased' },
  'ref.redeem': { ru: 'Активировать VPN за баллы', en: 'Redeem points for VPN' },
  'ref.redeemExtend': { ru: 'Продлить подписку', en: 'Extend subscription' },
  'ref.redeemNew': { ru: 'Будет создана новая подписка', en: 'A new subscription will be created' },
  'ref.notEnough': { ru: 'Не хватает баллов', en: 'Not enough points' },
  'ref.historyTitle': { ru: 'История баллов', en: 'Points history' },
  'ref.historyEmpty': { ru: 'Пока нет начислений — пригласите первого друга!', en: 'No points yet — invite your first friend!' },
  'ref.txSignup': { ru: 'Друг присоединился', en: 'Friend joined' },
  'ref.txPurchase': { ru: 'Первая покупка друга', en: "Friend's first purchase" },
  'ref.txRedeem': { ru: 'Обмен на VPN', en: 'Redeemed for VPN' },
  'ref.redeemedOk': { ru: '🎉 Готово! VPN активирован за баллы.', en: '🎉 Done! VPN activated with points.' },
  'ref.unavailable': { ru: 'Реферальная программа скоро заработает', en: 'Referral program launching soon' },

  // ---------- Покупка ----------
  'buy.checkout': { ru: 'Оформление', en: 'Checkout' },
  'buy.buyCard': { ru: '🛒 Купить подписку', en: '🛒 Buy subscription' },
  'buy.from': { ru: 'от', en: 'from' },
  'buy.starsOrCrypto': { ru: 'Telegram Stars или криптовалюта', en: 'Telegram Stars or crypto' },
  'buy.chooseCountry': { ru: 'Выбрать страну', en: 'Choose country' },
  'buy.trial': { ru: 'Пробная неделя', en: 'Free trial week' },
  'buy.trialHint': { ru: '7 дней бесплатно, без оплаты', en: '7 days free, no payment' },
  'buy.promoCard': { ru: 'Активировать ключ', en: 'Redeem a key' },
  'buy.promoCardHint': { ru: 'Промокод формата GIFT-…', en: 'Promo code like GIFT-…' },
  'buy.buyStars': { ru: 'Купить звёзды', en: 'Buy Stars' },
  'buy.buyStarsHint': { ru: 'Пополнить Stars у @PremiumBot', en: 'Top up Stars via @PremiumBot' },
  'buy.chooseCountryTitle': { ru: 'Выберите страну', en: 'Choose a country' },
  'buy.noServers': { ru: 'Нет доступных серверов', en: 'No servers available' },
  'buy.extendTitle': { ru: 'Продление', en: 'Renewal' },
  'buy.termTitle': { ru: 'Срок подписки', en: 'Subscription term' },
  'buy.extending': { ru: 'Продление подписки', en: 'Renewing subscription' },
  'buy.methodTitle': { ru: 'Способ оплаты', en: 'Payment method' },
  'buy.oneClick': { ru: 'оплата в один клик', en: 'one-tap payment' },
  'buy.cryptoTitle': { ru: 'Криптовалюта', en: 'Cryptocurrency' },
  'buy.network': { ru: 'Сеть: Arbitrum One', en: 'Network: Arbitrum One' },
  'buy.wallet': { ru: 'Кошелёк для перевода', en: 'Wallet address' },
  'buy.amount': { ru: 'Сумма', en: 'Amount' },
  'buy.contract': { ru: 'Контракт токена', en: 'Token contract' },
  'buy.exactWarn': {
    ru: '⚠️ Отправьте точную сумму в сети Arbitrum One. После перевода вставьте TXID (хеш транзакции) ниже — проверка автоматическая.',
    en: '⚠️ Send the exact amount on Arbitrum One. After the transfer, paste the TXID (transaction hash) below — verification is automatic.',
  },
  'buy.checking': { ru: 'Проверяем в блокчейне…', en: 'Checking on-chain…' },
  'buy.paidCheck': { ru: 'Я оплатил — проверить', en: "I've paid — verify" },
  'buy.orderSaved': {
    ru: 'Заказ сохранён: вы можете вернуться и отправить TXID позже из «Ожидающих платежей» на Дашборде.',
    en: 'Order saved: you can come back and submit the TXID later from "Pending payments" on the Home tab.',
  },
  'buy.promoTitle': { ru: 'Активация ключа', en: 'Key activation' },
  'buy.promoDesc': {
    ru: 'Введите промокод, полученный у администратора или в рамках акции — подписка активируется мгновенно.',
    en: 'Enter the promo code you received from the admin or a promotion — the subscription activates instantly.',
  },
  'buy.promoBtn': { ru: 'Активировать ключ', en: 'Redeem key' },
  'buy.promoFormat': {
    ru: 'Формат ключа: GIFT- и 16 символов. Ключ одноразовый и привязывается к вашему аккаунту.',
    en: 'Key format: GIFT- plus 16 characters. One-time use, linked to your account.',
  },
  'buy.trialModalTitle': { ru: '🎁 Пробная неделя', en: '🎁 Free trial week' },
  'buy.trialModalHint': { ru: 'Выберите страну — доступ на 7 дней бесплатно.', en: 'Choose a country — 7 days of free access.' },
  'buy.successLink': { ru: 'Ваша ссылка-подписка', en: 'Your subscription link' },
  'buy.successHint': {
    ru: 'Скопируйте ссылку и импортируйте в приложение (v2rayTun, Streisand). Пошаговые инструкции — во вкладке «Гайды».',
    en: 'Copy the link and import it into an app (v2rayTun, Streisand). Step-by-step guides are on the Guides tab.',
  },
  'buy.toDash': { ru: 'Перейти в Дашборд', en: 'Go to Home' },
  'buy.howConnect': { ru: '📱 Как подключиться', en: '📱 How to connect' },
  'buy.payTitle': { ru: 'Оплата', en: 'Pay with' },

  // ---------- Поддержка ----------
  'sup.title': { ru: 'Помощь', en: 'Support' },
  'sup.chat': { ru: 'Чат с поддержкой', en: 'Support chat' },
  'sup.chatHint': { ru: 'Ответим в ближайшее время', en: "We'll reply shortly" },
  'sup.country': { ru: 'Запросить новую страну', en: 'Request a new country' },
  'sup.countryHint': { ru: 'Предложите локацию сервера', en: 'Suggest a server location' },
  'sup.myTickets': { ru: 'Мои обращения', en: 'My tickets' },
  'sup.noTickets': { ru: 'Обращений пока нет', en: 'No tickets yet' },
  'sup.noTicketsHint': { ru: 'Если возникнет вопрос — напишите нам.', en: 'If you have a question — write to us.' },
  'sup.open': { ru: 'Открыт', en: 'Open' },
  'sup.closed': { ru: 'Закрыт', en: 'Closed' },
  'sup.you': { ru: 'Вы: ', en: 'You: ' },
  'sup.supp': { ru: 'Поддержка: ', en: 'Support: ' },
  'sup.gigabyte': { ru: 'Поддержка Gigabyte', en: 'Gigabyte Support' },
  'sup.newTicket': { ru: 'новое обращение', en: 'new ticket' },
  'sup.closedSuffix': { ru: ' · закрыт', en: ' · closed' },
  'sup.describe': { ru: 'Опишите вашу проблему', en: 'Describe your issue' },
  'sup.describeHint': { ru: 'Напишите сообщение ниже — мы ответим здесь и продублируем в чат с ботом.', en: "Write a message below — we'll reply here and duplicate it to the bot chat." },
  'sup.message': { ru: 'Сообщение', en: 'Message' },
  'sup.ticketClosed': { ru: 'Тикет закрыт. Спасибо за обращение!', en: 'Ticket closed. Thank you!' },
  'sup.today': { ru: 'Сегодня', en: 'Today' },
  'sup.yesterday': { ru: 'Вчера', en: 'Yesterday' },
  'sup.countryTitle': { ru: 'Новая страна', en: 'New country' },
  'sup.countrySub': { ru: 'Предложите локацию для сервера', en: 'Suggest a server location' },
  'sup.popular': { ru: 'Популярные страны', en: 'Popular countries' },
  'sup.custom': { ru: 'Или своя страна', en: 'Or your own' },
  'sup.customPh': { ru: 'Например: Исландия', en: 'e.g.: Iceland' },
  'sup.sent': { ru: 'Запрос «{c}» отправлен администратору!', en: 'Request "{c}" sent to the admin!' },

  // ---------- Гайды ----------
  'guide.title': { ru: 'Гайды', en: 'Guides' },
  'guide.howTitle': { ru: 'Как работает подключение', en: 'How connection works' },
  'guide.how': {
    ru: 'Мы выдаём одну персональную ссылку-подписку — это ваш ключ к VPN.\n\n1. Скопируйте ссылку-подписку в Дашборде (или отсканируйте QR).\n2. Вставьте её в любое из приложений ниже — серверы подтянутся автоматически.\n3. Продлеваете подписку — ничего перенастраивать не нужно: приложение само обновит данные по той же ссылке.\n\nОдна ссылка работает на всех ваших устройствах одновременно.',
    en: 'We give you a single personal subscription link — it is your key to the VPN.\n\n1. Copy the subscription link on the Home tab (or scan the QR).\n2. Paste it into any app below — servers are added automatically.\n3. When you renew, nothing needs to be reconfigured: the app refreshes itself via the same link.\n\nOne link works on all your devices at the same time.',
  },
  'guide.download': { ru: 'Скачать', en: 'Download' },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  let s = entry ? entry[LANG] : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

/** Локаль для дат/чисел. */
export const locale = LANG === 'ru' ? 'ru-RU' : 'en-US';
