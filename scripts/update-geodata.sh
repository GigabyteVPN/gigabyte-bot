#!/usr/bin/env bash
# Обновление баз geoip.dat и geosite.dat на узле VPN.
#
# Зачем это нужно: маршрутизация опирается на списки доменов и адресов —
# `geosite:category-ru` (российские сайты идут напрямую), `geoip:ru`,
# `geosite:category-ads-all` (блокировка рекламы). Списки постоянно
# пополняются: без обновления новые домены банков и сервисов уезжают
# во Францию, а свежая реклама перестаёт блокироваться.
#
# Почему свой скрипт: в панели был еженедельный cron с командой
# `x-ui update-all-geofiles`, которой в этой сборке не существует —
# вывод уходил в /dev/null, и базы молча не обновлялись месяцами.
#
# Запуск:  bash update-geodata.sh          (обычный, тихий)
#          bash update-geodata.sh --force  (перезаписать даже без изменений)
set -euo pipefail

BIN=/usr/local/x-ui/bin
SRC=https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download
FILES=(geoip.dat geosite.dat)
FORCE=${1:-}
changed=0

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') | $*"; }

for f in "${FILES[@]}"; do
  curl -fsSL --retry 3 --max-time 180 -o "$tmp/$f" "$SRC/$f"
  curl -fsSL --retry 3 --max-time 60  -o "$tmp/$f.sha256sum" "$SRC/$f.sha256sum"

  # Проверяем контрольную сумму: подменённая или недокачанная база
  # сломает маршрутизацию целиком, поэтому подсовывать её нельзя.
  ( cd "$tmp" && awk '{print $1"  '"$f"'"}' "$f.sha256sum" | sha256sum -c --quiet - )

  size=$(stat -c%s "$tmp/$f")
  if [ "$size" -lt 1000000 ]; then
    log "ОШИБКА: $f подозрительно мал ($size байт) — не применяем"
    exit 1
  fi

  if [ "$FORCE" != "--force" ] && [ -f "$BIN/$f" ] && cmp -s "$tmp/$f" "$BIN/$f"; then
    log "$f: уже актуален"
    continue
  fi

  # Прежнюю копию держим рядом — есть куда откатиться, если что-то не так
  [ -f "$BIN/$f" ] && cp -f "$BIN/$f" "$BIN/$f.prev"
  install -m 0644 "$tmp/$f" "$BIN/$f"
  log "$f: обновлён ($((size / 1024 / 1024)) МБ)"
  changed=1
done

if [ "$changed" = 0 ]; then
  log "Изменений нет, панель не трогаем"
  exit 0
fi

# Перезапуск нужен, чтобы xray перечитал базы. Занимает около секунды;
# клиенты переподключаются сами.
systemctl restart x-ui
sleep 4

if systemctl is-active --quiet x-ui; then
  log "Панель перезапущена, базы приняты"
else
  log "ОШИБКА: панель не поднялась — откатываем базы"
  for f in "${FILES[@]}"; do
    [ -f "$BIN/$f.prev" ] && mv -f "$BIN/$f.prev" "$BIN/$f"
  done
  systemctl restart x-ui
  exit 1
fi
