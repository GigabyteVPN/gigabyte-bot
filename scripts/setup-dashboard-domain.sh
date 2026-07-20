#!/usr/bin/env bash
# ============================================================================
#  Включение веб-дашборда на отдельном поддомене
#
#  ПЕРЕД ЗАПУСКОМ: создайте A-запись поддомена на IP сервера с ботом
#  (Cloudflare — обязательно «DNS only», серое облако):
#      admin.gigabytebot.com  →  38.244.213.142
#
#  ЗАПУСК (с вашего мака):
#      ./scripts/setup-dashboard-domain.sh admin.gigabytebot.com
#
#  Скрипт: проверит DNS → выпустит Let's Encrypt → добавит nginx-сайт →
#  перезагрузит nginx → пропишет DASHBOARD_URL боту → проверит доступность.
# ============================================================================
set -uo pipefail
RED=$'\033[31m'; GRN=$'\033[32m'; BLU=$'\033[34m'; RST=$'\033[0m'
info() { echo "${BLU}▸${RST} $*"; }
ok()   { echo "${GRN}✓${RST} $*"; }
die()  { echo "${RED}✗ $*${RST}" >&2; exit 1; }

DOMAIN="${1:?Укажите поддомен, напр.: admin.gigabytebot.com}"
HOST_ALIAS="${2:-germany}"     # алиас сервера с ботом из ~/.ssh/config

G() { ssh -o BatchMode=yes "$HOST_ALIAS" "$@"; }

echo "════════════════════════════════════════════════════════"
echo " Дашборд на поддомене: $DOMAIN"
echo "════════════════════════════════════════════════════════"

info "Проверяю доступ к серверу бота ($HOST_ALIAS)…"
G 'echo ok' >/dev/null 2>&1 || die "Нет SSH-доступа к $HOST_ALIAS"

SRV_IP=$(G 'curl -s --max-time 10 https://api.ipify.org' | tr -d '\r')
info "Проверяю DNS: $DOMAIN должен указывать на $SRV_IP…"
RES=$(G "getent hosts $DOMAIN | awk '{print \$1}' | head -1" | tr -d '\r')
[[ "$RES" == "$SRV_IP" ]] || die "DNS: $DOMAIN → '${RES:-нет записи}', ожидалось $SRV_IP.
   Создайте A-запись (Cloudflare: DNS only / серое облако) и подождите пару минут."
ok "DNS корректен"

info "Выпускаю сертификат Let's Encrypt…"
G "bash -s '$DOMAIN'" <<'CERT' 2>&1 | tail -3
DOMAIN="$1"
mkdir -p /var/www/certbot
# webroot-челлендж обслуживает уже работающий nginx (location /.well-known/)
certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring 2>&1 | tail -3
CERT
G "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
  || die "Сертификат не выпущен. Проверьте, что порт 80 доступен снаружи и DNS верный."
ok "Сертификат получен"

info "Копирую сертификат в каталог nginx…"
G "mkdir -p /root/gigabyte-bot/certs/dash && \
   cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem /root/gigabyte-bot/certs/dash/ && \
   cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem   /root/gigabyte-bot/certs/dash/"

info "Добавляю сайт в nginx…"
G "cat > /root/gigabyte-bot/nginx/sites/dashboard.conf" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$server_name\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/nginx/certs/dash/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/dash/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Дашборд открывается с корня поддомена
    location = / { return 302 /app/; }

    location /api/ {
        proxy_pass http://bot:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /app {
        proxy_pass http://bot:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

info "Проверяю конфиг и перезагружаю nginx…"
G 'docker exec gigabyte-bot-nginx-1 nginx -t' >/dev/null 2>&1 \
  || die "Ошибка конфига nginx: $(G 'docker exec gigabyte-bot-nginx-1 nginx -t 2>&1')"
G 'docker exec gigabyte-bot-nginx-1 nginx -s reload' >/dev/null 2>&1
ok "nginx перезагружен"

info "Прописываю DASHBOARD_URL боту…"
G "sed -i '/^DASHBOARD_URL=/d' /root/gigabyte-bot/.env && \
   echo 'DASHBOARD_URL=https://$DOMAIN/app' >> /root/gigabyte-bot/.env && \
   cd /root/gigabyte-bot && docker compose up -d bot" >/dev/null 2>&1
ok "Бот теперь выдаёт ссылки на $DOMAIN"

info "Проверяю доступность…"
sleep 4
CODE=$(G "curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://$DOMAIN/app/" | tr -d '\r')
[[ "$CODE" == "200" ]] && ok "Дашборд отвечает: https://$DOMAIN/app/ (HTTP $CODE)" \
                        || echo "${RED}HTTP $CODE — проверьте логи nginx${RST}"

echo
echo "════════════════════════════════════════════════════════"
echo "${GRN} ГОТОВО${RST}"
echo " Дашборд:  https://$DOMAIN/app/"
echo " Вход:     отправьте боту /dashboard — он пришлёт ссылку с токеном"
echo "════════════════════════════════════════════════════════"
