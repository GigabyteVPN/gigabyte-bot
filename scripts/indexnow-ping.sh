#!/usr/bin/env bash
# Сообщает поисковикам (Яндекс, Bing) что страница обновилась — индексация
# идёт часами вместо недель. Аккаунты и подтверждение прав не нужны:
# достаточно, чтобы ключ лежал на сайте по адресу из keyLocation.
#
# Запуск после любого обновления сайта:
#   bash scripts/indexnow-ping.sh [url ...]
set -uo pipefail

KEY="182783c334c99571d2a7c48b9154dfd6"
HOST="gigabytebot.com"
KEY_URL="https://${HOST}/${KEY}.txt"

urls=("$@")
[[ ${#urls[@]} -eq 0 ]] && urls=("https://${HOST}/")

for u in "${urls[@]}"; do
  enc=$(python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$u")
  for ep in api.indexnow.org yandex.com www.bing.com; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
      "https://${ep}/indexnow?url=${enc}&key=${KEY}&keyLocation=$(python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$KEY_URL")")
    echo "  $ep <- $u : HTTP $code"
  done
done
