#!/usr/bin/env bash
# Выкладка сайта gigabytebot.com на сервер Germany.
#
# Зачем отдельный скрипт: nginx отдаёт app.js с заголовком immutable на 30 дней.
# Если просто скопировать новые файлы, вернувшийся посетитель ещё месяц будет
# получать новую разметку вместе со старым скриптом — а это уже другая, никем
# не проверенная страница. Поэтому в ссылку на скрипт подставляется отпечаток
# его содержимого: меняется файл — меняется адрес — кэш обновляется сразу.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$ROOT/website"
HOST="${1:-germany}"
REMOTE="/root/gigabyte-bot/website/"

hash=$(shasum -a 256 "$SITE/app.js" 2>/dev/null | cut -c1-8 || sha256sum "$SITE/app.js" | cut -c1-8)

# ссылка на скрипт с отпечатком — правим только в копии для выкладки
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R "$SITE/." "$tmp/"
perl -pi -e "s{<script src=\"app\.js(\?v=[0-9a-f]+)?\" defer>}{<script src=\"app.js?v=$hash\" defer>}" "$tmp/index.html"

# Дата в карте сайта = день выкладки. Держать её вручную бессмысленно:
# она всегда отстаёт, а поисковик по ней решает, когда перечитать страницу.
today=$(date -u +%Y-%m-%d)
perl -pi -e "s{<lastmod>[^<]*</lastmod>}{<lastmod>$today</lastmod>}" "$tmp/sitemap.xml"

# Права обязательны: временный каталог создаётся с правами 700, rsync
# переносит их на сервер, и nginx (работает не под root) перестаёт читать
# файлы — сайт отдаёт 403. Выставляем явно с обеих сторон, потому что
# rsync в macOS старой версии не понимает --chmod.
chmod 755 "$tmp"
chmod 644 "$tmp"/*
rsync -az --delete-after "$tmp/" "$HOST:$REMOTE"
ssh "$HOST" "chmod 755 '${REMOTE%/}' && chmod 644 '${REMOTE%/}'/*"

echo "Выложено на $HOST, версия скрипта: $hash"
for path in / /llms.txt /sitemap.xml /robots.txt; do
  printf '  %-14s ' "$path"
  curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "https://gigabytebot.com$path"
done
