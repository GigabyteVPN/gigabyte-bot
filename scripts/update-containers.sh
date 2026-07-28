#!/usr/bin/env bash
# Еженедельное обновление контейнеров на сервере Germany.
#
# Что делает и чего намеренно НЕ делает:
#  • образы со «плавающим» тегом (nginx:alpine, redis:7-alpine) скачиваются
#    заново и контейнер пересоздаётся, только если образ реально изменился.
#    Это чужой готовый софт — там важны свежие исправления безопасности,
#    а перезапуск занимает секунду и ничего не теряет (у redis включено
#    сохранение на диск, у nginx состояния нет);
#  • базовые образы наших сервисов (python, node) тоже обновляются, но
#    пересборку кода скрипт НЕ запускает: собирать и выкатывать приложение
#    без присмотра — верный способ однажды проснуться со сломанным ботом.
#    Вместо этого приходит сообщение, что пора пересобрать.
#
# Cron:  30 4 * * 2  /root/gigabyte-bot/scripts/update-containers.sh
set -uo pipefail

cd /root/gigabyte-bot
[ -f .env ] && set -a && . ./.env 2>/dev/null && set +a

LOG=/var/log/container-updates.log
report=""

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') | $*" >> "$LOG"; }

notify() {
  [ -n "${BOT_TOKEN:-}" ] && [ -n "${ADMIN_IDS:-}" ] || return 0
  local chat="${ADMIN_IDS%%,*}"
  curl -sS --max-time 20 -o /dev/null \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "parse_mode=HTML" \
    --data-urlencode "text=$1" || true
}

digest() { docker image inspect "$1" --format '{{index .RepoDigests 0}}' 2>/dev/null || echo none; }

# ---------- 1. Готовые образы: обновляем и пересоздаём ----------
# формат: образ|контейнер|каталог compose|имя для отчёта
# Каталог обязателен и указывается явно: контейнеры живут в двух разных
# проектах compose, и «поднять» удалённый контейнер можно только из его
# собственного каталога — иначе он просто не вернётся.
for entry in \
  "nginx:alpine|gigabyte-bot-nginx-1|/root/gigabyte-bot|nginx" \
  "redis:7-alpine|fin-redis-1|/opt/fin|redis"
do
  IFS='|' read -r image container dir name <<< "$entry"

  before=$(digest "$image")
  docker pull -q "$image" >/dev/null 2>&1 || { log "$name: не удалось скачать"; continue; }
  after=$(digest "$image")

  if [ "$before" = "$after" ]; then
    log "$name: уже актуален"
    continue
  fi

  docker rm -f "$container" >/dev/null 2>&1
  ( cd "$dir" && docker compose up -d >/dev/null 2>&1 )
  sleep 6

  if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = "true" ]; then
    log "$name: обновлён и запущен"
    report="${report}• ${name} обновлён\n"
  else
    # Не оставляем сервис лежать: пробуем ещё раз и обязательно зовём человека.
    log "$name: не поднялся, повторная попытка"
    ( cd "$dir" && docker compose up -d >/dev/null 2>&1 )
    sleep 6
    if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = "true" ]; then
      log "$name: поднялся со второй попытки"
      report="${report}• ${name} обновлён (со второй попытки)\n"
    else
      log "$name: ПОСЛЕ ОБНОВЛЕНИЯ НЕ ПОДНЯЛСЯ"
      notify "$(printf '🚨 <b>%s не поднялся после обновления образа</b>\nКаталог: <code>%s</code>\nПроверьте: <code>docker compose ps</code>' "$name" "$dir")"
    fi
  fi
done

# ---------- 2. Базовые образы наших сервисов: только сигнал ----------
for image in python:3.11-slim node:22-alpine; do
  before=$(digest "$image")
  docker pull -q "$image" >/dev/null 2>&1 || continue
  [ "$(digest "$image")" = "$before" ] && continue
  log "$image: вышла новая версия, нужна пересборка"
  report="${report}• ${image}: вышла новая версия — стоит пересобрать сервисы\n"
done

# ---------- 3. Уборка ----------
docker image prune -f >/dev/null 2>&1
log "уборка неиспользуемых образов выполнена"

[ -n "$report" ] && notify "$(printf '🧩 <b>Обновление контейнеров</b>\n\n%b' "$report")"
exit 0
