// ============================================================
//  Юридические документы Gigabyte VPN (оферта + политика).
//  Единый источник для мини-аппа. Рендерятся на странице Legal.tsx.
//  Содержание соответствует прежним документам, но переработано и
//  структурировано. RU / EN выбираются по языку Telegram.
// ============================================================
import { Lang } from './i18n';

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

const UPDATED_RU = 'Обновлено 18 июля 2026 г.';
const UPDATED_EN = 'Last updated: 18 July 2026';

const TERMS_RU: LegalDoc = {
  title: 'Публичная оферта',
  updated: UPDATED_RU,
  intro:
    'Настоящий документ является официальным предложением (публичной офертой) сервиса Gigabyte заключить договор на оказание услуг по предоставлению защищённого доступа в интернет. Оформляя подписку, вы полностью и безоговорочно принимаете условия настоящей оферты.',
  sections: [
    {
      h: '1. Предмет договора',
      p: [
        'Сервис предоставляет доступ к программно-аппаратным средствам, обеспечивающим шифрование интернет-трафика пользователя для защиты соединения от несанкционированного доступа, в том числе в публичных сетях Wi-Fi.',
        'Услуга представляет собой техническое средство защиты канала связи и не предназначена для совершения каких-либо противоправных действий.',
      ],
    },
    {
      h: '2. Конфиденциальность трафика',
      p: [
        'Сервис не отслеживает действия пользователей, не ведёт журналы посещаемых ресурсов и не анализирует передаваемые данные. Шифруется исключительно канал связи.',
      ],
    },
    {
      h: '3. Стоимость и оплата',
      p: [
        'Услуги предоставляются на условиях 100% предоплаты. Оплата производится через Telegram Stars или криптовалютой (USDT/USDC в сети Arbitrum).',
        'Доступны периоды подписки от 1 до 12 месяцев, а также бессрочные тарифы. Актуальная стоимость отображается в приложении на момент оформления.',
      ],
    },
    {
      h: '4. Возврат средств',
      p: [
        'После активации подписки денежные средства возврату не подлежат, поскольку услуга считается оказанной с момента предоставления доступа.',
        'Исключение: если по вине сервиса услуга недоступна более 5 (пяти) рабочих дней подряд вследствие технических неисправностей на нашей стороне — возможен перерасчёт или возврат за неиспользованный период.',
      ],
    },
    {
      h: '5. Обязанности пользователя',
      p: [
        'Использовать сервис исключительно в законных целях и в соответствии с законодательством вашей юрисдикции.',
        'Не передавать данные доступа (ссылку-подписку) третьим лицам.',
        'Самостоятельно обеспечивать сохранность устройства и учётной записи Telegram, через которую осуществляется доступ.',
      ],
    },
    {
      h: '6. Ответственность сторон',
      p: [
        'Сервис не несёт ответственности за обстоятельства непреодолимой силы, действия третьих лиц, качество сетей связи оператора пользователя, а также за содержание передаваемой пользователем информации.',
        'Сервис вправе приостановить доступ при обоснованном подозрении в противоправной деятельности или мошенничестве.',
      ],
    },
    {
      h: '7. Разрешение споров',
      p: [
        'Все споры решаются путём переговоров. Предусмотрен обязательный претензионный порядок: срок ответа на претензию — 10 (десять) дней.',
        'При недостижении согласия спор передаётся в суд по месту нахождения исполнителя в соответствии с применимым законодательством.',
      ],
    },
  ],
};

const TERMS_EN: LegalDoc = {
  title: 'Terms of Service',
  updated: UPDATED_EN,
  intro:
    'This document is the official offer of the Gigabyte service to enter into an agreement for the provision of secure internet access. By purchasing a subscription, you fully and unconditionally accept these Terms.',
  sections: [
    {
      h: '1. Subject of the agreement',
      p: [
        'The service provides access to software and hardware that encrypts the user’s internet traffic, protecting the connection from unauthorized access, including on public Wi-Fi networks.',
        'The service is a technical means of protecting the communication channel and is not intended for any unlawful activity.',
      ],
    },
    {
      h: '2. Traffic privacy',
      p: [
        'The service does not track user activity, does not keep logs of visited resources, and does not analyze transmitted data. Only the communication channel is encrypted.',
      ],
    },
    {
      h: '3. Pricing and payment',
      p: [
        'Services are provided on a 100% prepayment basis. Payment is made via Telegram Stars or cryptocurrency (USDT/USDC on the Arbitrum network).',
        'Subscription periods range from 1 to 12 months, plus lifetime plans. The current price is shown in the app at the time of purchase.',
      ],
    },
    {
      h: '4. Refunds',
      p: [
        'After a subscription is activated, funds are non-refundable, as the service is deemed rendered from the moment access is granted.',
        'Exception: if, through the fault of the service, access is unavailable for more than 5 (five) consecutive business days due to technical failures on our side, a recalculation or refund for the unused period is possible.',
      ],
    },
    {
      h: '5. User obligations',
      p: [
        'Use the service solely for lawful purposes and in accordance with the laws of your jurisdiction.',
        'Do not share your access data (subscription link) with third parties.',
        'Keep your device and the Telegram account used for access secure.',
      ],
    },
    {
      h: '6. Liability',
      p: [
        'The service is not liable for force majeure, actions of third parties, the quality of the user’s carrier networks, or the content transmitted by the user.',
        'The service may suspend access upon reasonable suspicion of unlawful activity or fraud.',
      ],
    },
    {
      h: '7. Dispute resolution',
      p: [
        'All disputes are resolved through negotiation. A mandatory pre-litigation claims procedure applies, with a 10 (ten) day response window.',
        'If no agreement is reached, the dispute is referred to the court at the provider’s location under applicable law.',
      ],
    },
  ],
};

const PRIVACY_RU: LegalDoc = {
  title: 'Политика конфиденциальности',
  updated: UPDATED_RU,
  intro:
    'Настоящая Политика описывает, какие данные обрабатывает сервис Gigabyte, с какой целью и как мы их защищаем. Мы придерживаемся принципа минимизации данных: собираем только то, что необходимо для работы сервиса.',
  sections: [
    {
      h: '1. Какие данные мы обрабатываем',
      p: [
        '• Уникальный идентификатор Telegram (ID), а также имя пользователя и отображаемое имя;',
        '• дату и время регистрации;',
        '• историю платежей и статус подписки;',
        '• обращения в поддержку;',
        '• адрес электронной почты — только если вы указали его добровольно.',
      ],
    },
    {
      h: '2. Какие данные мы НЕ собираем',
      p: [
        'Мы не собираем, не обрабатываем и не храним журналы трафика, содержимое ваших соединений, геолокацию и специальные категории персональных данных.',
      ],
    },
    {
      h: '3. Цели обработки',
      p: [
        'Идентификация пользователя, управление подпиской, проведение расчётов, техническая поддержка, служебные уведомления, соблюдение налогового законодательства и повышение качества сервиса.',
      ],
    },
    {
      h: '4. Правовые основания',
      p: [
        'Обработка осуществляется на основании вашего согласия (регистрация и оплата), необходимости исполнения договора, а также требований налогового и бухгалтерского законодательства (в т.ч. ФЗ-152 «О персональных данных»).',
      ],
    },
    {
      h: '5. Срок хранения',
      p: [
        'Данные хранятся в течение срока активной подписки и 3 (трёх) лет после её окончания для целей соблюдения законодательства, после чего уничтожаются или обезличиваются.',
      ],
    },
    {
      h: '6. Ваши права',
      p: [
        'Вы вправе запросить информацию о своих данных, потребовать их исправления или удаления, отозвать согласие на обработку, а также обратиться с жалобой в уполномоченный орган по защите прав субъектов персональных данных.',
        'Удалить аккаунт и связанные данные можно самостоятельно в приложении в разделе «Аккаунт».',
      ],
    },
    {
      h: '7. Передача третьим лицам',
      p: [
        'Передача данных осуществляется только для проведения платежей, по законным требованиям государственных органов или с вашего явного согласия. Данные хранятся в облачной инфраструктуре Supabase.',
      ],
    },
    {
      h: '8. Защита данных',
      p: [
        'Применяются шифрование соединений (HTTPS), ограничение доступа, регулярное обновление ПО, мониторинг безопасности и аудит действий администраторов.',
      ],
    },
    {
      h: '9. Несовершеннолетние',
      p: [
        'Сервис не предназначен для лиц младше 18 лет. При выявлении данных несовершеннолетнего они незамедлительно удаляются.',
      ],
    },
  ],
};

const PRIVACY_EN: LegalDoc = {
  title: 'Privacy Policy',
  updated: UPDATED_EN,
  intro:
    'This Policy describes what data the Gigabyte service processes, for what purpose, and how we protect it. We follow the principle of data minimization: we collect only what is necessary to operate the service.',
  sections: [
    {
      h: '1. Data we process',
      p: [
        '• Your unique Telegram ID, username and display name;',
        '• registration date and time;',
        '• payment history and subscription status;',
        '• support requests;',
        '• email address — only if you provide it voluntarily.',
      ],
    },
    {
      h: '2. Data we do NOT collect',
      p: [
        'We do not collect, process, or store traffic logs, the contents of your connections, geolocation, or special categories of personal data.',
      ],
    },
    {
      h: '3. Purposes of processing',
      p: [
        'User identification, subscription management, billing, technical support, service notifications, tax compliance, and service quality improvement.',
      ],
    },
    {
      h: '4. Legal basis',
      p: [
        'Processing is based on your consent (registration and payment), the necessity of performing the contract, and statutory tax and accounting requirements.',
      ],
    },
    {
      h: '5. Retention period',
      p: [
        'Data is retained for the duration of the active subscription plus 3 (three) years afterwards for compliance purposes, after which it is destroyed or anonymized.',
      ],
    },
    {
      h: '6. Your rights',
      p: [
        'You may request information about your data, demand its correction or deletion, withdraw your consent, and file a complaint with the competent data protection authority.',
        'You can delete your account and associated data yourself in the app under “Account”.',
      ],
    },
    {
      h: '7. Third-party sharing',
      p: [
        'Data is shared only for payment processing, in response to lawful government requests, or with your explicit consent. Data is stored in the Supabase cloud infrastructure.',
      ],
    },
    {
      h: '8. Data protection',
      p: [
        'We use connection encryption (HTTPS), access restrictions, regular software updates, security monitoring, and administrative audit logging.',
      ],
    },
    {
      h: '9. Minors',
      p: [
        'The service is not intended for persons under 18. Any identified minor’s data is deleted immediately.',
      ],
    },
  ],
};

export const TERMS: Record<Lang, LegalDoc> = { ru: TERMS_RU, en: TERMS_EN };
export const PRIVACY: Record<Lang, LegalDoc> = { ru: PRIVACY_RU, en: PRIVACY_EN };
