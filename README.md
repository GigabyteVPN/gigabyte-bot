# Gigabyte VPN Bot

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![Aiogram 3.x](https://img.shields.io/badge/aiogram-3.x-green.svg)](https://docs.aiogram.dev/)
[![Docker](https://img.shields.io/badge/docker-✓-2496ED.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Telegram-бот для автоматической продажи VPN-подписок, управления пользователями и интеграции с панелью 3x-ui. Поддерживает оплату через **Telegram Stars** и **криптовалюты (USDT/USDC в сети Arbitrum)**.

## Возможности

- Покупка подписок – выбор сервера, тарифа (1, 3, 6 месяцев или 1 год), оплата Stars или криптой.
- Пробная неделя – бесплатный доступ на 7 дней (один раз на пользователя).
- Личный кабинет – активные подписки, ожидающие платежи, история операций.
- Промокоды (Gift-ключи) – генерация и активация ключей администратором.
- Инструкции по подключению – пошаговые гайды для Android, iOS, Windows, Mac.
- Запрос новых стран – пользователи могут предлагать локации для серверов.
- Система тикетов – обратная связь с администраторами.
- Курсы валют – автоматическое обновление USD/RUB и Stars/USD.
- Удаление аккаунта – пользователь может стереть все свои данные.
- Админ-панель – рассылки, просмотр тикетов, статистика, управление ценами, импорт/синхронизация клиентов из панели 3x-ui.

## Telegram Mini App (веб-апп)

В каталоге [`webapp/`](webapp/) живёт мини-апп с полным функционалом бота (и больше):

- **Пользователь**: подписки с обратным отсчётом, ссылка-подписка + QR, покупка (Stars в один клик / USDT-USDC с автоматической проверкой TXID), продление, пробная неделя, промокоды, тикеты с перепиской, запрос стран, история платежей с чеками, удаление аккаунта.
- **Админ**: живая статистика (доход, конверсия, топ серверов), управление ценами, генерация промокодов, тикеты и запросы стран с ответами, рассылка, выдача подписок, синхронизация/импорт 3x-ui, управление пользователями, баланс Stars.

Архитектура: фронтенд (React + Vite) не имеет прямого доступа к БД — все запросы идут через REST API бота (`webapp_api.py`, поднимается на том же aiohttp-сервере, что и вебхук). Каждый запрос авторизуется **криптографической проверкой Telegram initData** (HMAC от токена бота), админ-методы дополнительно проверяются по `ADMIN_IDS`.

### Подключение мини-аппа

1. Соберите фронтенд (в Docker это происходит автоматически при `docker-compose up --build`):
   ```bash
   cd webapp && npm install && npm run build
   ```
2. Добавьте в `.env` бота:
   ```env
   WEBAPP_URL=https://ваш-домен.com/app/
   ```
   При старте бот сам настроит кнопку меню (Menu Button) на веб-апп. Тот же URL можно задать в @BotFather → Bot Settings → Menu Button.
3. Nginx уже проксирует `/api/` и `/app` на контейнер бота (см. `nginx/sites/bot.conf`).

Локальная разработка: запустите `python bot.py` (API поднимется на :8080 даже без вебхука), затем `cd webapp && npm run dev` — vite проксирует `/api` на бота.

## Технологический стек

- Python 3.11 + Aiogram 3.x – ядро бота.
- React 19 + Vite + Tailwind 4 – Telegram Mini App (`webapp/`).
- Docker + Nginx – контейнеризация и проксирование вебхуков.
- Supabase – база данных (PostgreSQL) и бэкапы.
- 3x-ui API – управление VLESS-подписками.
- Let's Encrypt – SSL-сертификаты для HTTPS.

## Структура проекта
gigabyte-bot/
├── bot.py # Главный исполняемый файл
├── requirements.txt # Python-зависимости
├── Dockerfile # Образ бота
├── docker-compose.yml # Оркестрация контейнеров
├── nginx/
│ ├── nginx.conf # Глобальный конфиг Nginx
│ └── sites/
│ └── bot.conf # Виртуальный хост для вебхука
├── instructions/ # Картинки-инструкции (android.jpg, ios.jpg, ...)
├── certs/ # SSL-сертификаты (не в репозитории!)
└── .env # Переменные окружения (только на сервере)


## Установка и запуск

### Требования

- Сервер с Ubuntu 22.04/24.04 и Docker + Docker Compose.
- Домен, указывающий на IP сервера.
- Панель 3x-ui с включённым Reality-протоколом.
- Аккаунт Supabase (бесплатный тариф подойдёт).

### 1. Клонирование репозитория

```bash
git clone https://github.com/GigabyteVPN/gigabyte-bot.git
cd gigabyte-bot

### 2. Настройка переменных окружения

Создайте файл .env (никогда не коммитьте его!):
BOT_TOKEN=ваш_токен_бота
WEBHOOK_HOST=https://ваш-домен.com
WEBHOOK_PORT=8080
WEBHOOK_SECRET=сгенерируйте_рандомную_строку

SUPABASE_URL=ваш_url
SUPABASE_KEY=ваш_service_role_ключ

ADMIN_IDS=123456789,987654321

ARBITRUM_WALLET=0x...
USDT_CONTRACT=0xFd086bc7CD5C481DCC9C85ebE478A1C0b69FCbb9
USDC_CONTRACT=0xaf88d065e77c8cC2239327C5Edb3A432268e5831
ALCHEMY_API_KEY=ваш_ключ

SERVER_IP=IP_панели
PANEL_URL=https://IP:порт
PANEL_LOGIN=логин
PANEL_PASS=пароль
INBOUND_ID=2
CLIENT_PORT=443
SUB_PORT=2096
SUB_PATH=ваш_путь
PBK=public_key
SNI=sni
SHORT_ID=short_id
FP=chrome

### 3. Получение SSL-сертификатов
docker run -it --rm -v ./certs:/etc/letsencrypt -p 80:80 certbot/certbot certonly --standalone -d ваш-домен.com --email your@email.com --agree-tos --non-interactive
cp certs/live/ваш-домен.com/fullchain.pem certs/
cp certs/live/ваш-домен.com/privkey.pem certs/

### 4. Запуск бота
docker-compose up -d --build

### 5. Проверка вебхука
curl "https://api.telegram.org/bot<ваш_токен>/getWebhookInfo"
Должен быть "url":"https://ваш-домен.com/webhook".

### Обновление бота
# Локально
git pull
git add .
git commit -m "описание"
git push

# На сервере
cd /opt/gigabyte-bot
git pull
docker-compose down
docker-compose up -d --build

### Безопасность

Все секреты хранятся в .env, который не добавляется в Git.
Вход на сервер только по SSH-ключам, пароль отключён.
Webhook защищён секретным токеном.
Docker-контейнеры запускаются от непривилегированного пользователя.
Поддержка

По вопросам эксплуатации и доработок обращайтесь в Telegram (@givpn_bot) или создавайте Issue на GitHub.

### Лицензия

MIT License – используйте свободно, но с указанием авторства.

© 2026 Gigabyte VPN Team