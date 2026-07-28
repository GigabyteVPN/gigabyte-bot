#!/usr/bin/env bash
# Выпускает TLS-сертификат Let's Encrypt для gigabytebot.com + www и включает
# HTTPS. Запускать на СЕРВЕРЕ Germany ПОСЛЕ того, как A-запись gigabytebot.com
# и www.gigabytebot.com указывают на этот сервер (38.244.213.142) и DNS доехал.
#
#   ssh germany 'bash /root/gigabyte-bot/scripts/issue-gigabytebot-cert.sh'
set -euo pipefail
ROOT=/root/gigabyte-bot
DOMAIN=gigabytebot.com
WEBROOT=$ROOT/certbot-www
EMAIL=admin@gigabytebot.com

echo "▸ Проверяю, что DNS указывает на нас…"
MYIP=$(curl -s https://api.ipify.org || echo "")
for d in "$DOMAIN" "www.$DOMAIN"; do
  RES=$(getent hosts "$d" | awk '{print $1}' | head -1 || true)
  echo "  $d → ${RES:-нет записи} (наш IP: $MYIP)"
done
mkdir -p "$WEBROOT/.well-known/acme-challenge"

echo "▸ Выпускаю сертификат (webroot)…"
certbot certonly --webroot -w "$WEBROOT" \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$EMAIL" --no-eff-email \
  --deploy-hook "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $ROOT/certs/gigabytebot/fullchain.pem; cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $ROOT/certs/gigabytebot/privkey.pem; docker exec gigabyte-bot-nginx-1 nginx -s reload"

echo "▸ Копирую сертификаты в каталог nginx…"
mkdir -p "$ROOT/certs/gigabytebot"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$ROOT/certs/gigabytebot/fullchain.pem"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem"  "$ROOT/certs/gigabytebot/privkey.pem"

echo "▸ Включаю HTTPS-конфиг nginx…"
cp "$ROOT/nginx/gigabytebot-ssl.conf.tpl" "$ROOT/nginx/sites/gigabytebot.conf"
docker exec gigabyte-bot-nginx-1 nginx -t
docker exec gigabyte-bot-nginx-1 nginx -s reload

echo "✓ ГОТОВО: https://$DOMAIN работает (авто-продление настроено)."
