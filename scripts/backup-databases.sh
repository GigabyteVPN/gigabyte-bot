#!/usr/bin/env bash
# ============================================================================
#  Ежедневный бэкап боевых баз (запускается по cron на Germany).
#
#  Что сохраняем:
#    • VPN-бот (Supabase) — пользователи, подписки, платежи, серверы, тикеты.
#      Доступ только по REST (пароля от БД нет), поэтому выгружаем все таблицы
#      через PostgREST постранично в JSON.
#    • Финансовое приложение (Supabase) — pg_dump по прямому подключению.
#
#  Хранение: BACKUP_KEEP_DAYS дней, старше — удаляются.
#  При ошибке шлём сообщение админу в Telegram (тем же ботом).
# ============================================================================
set -uo pipefail

BACKUP_DIR=${BACKUP_DIR:-/root/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
# Образ с psql для определения версии сервера (сам дамп снимается образом
# ровно той мажорной версии, которую вернёт сервер).
PG_CLIENT_IMAGE=${PG_CLIENT_IMAGE:-postgres:17-alpine}
STAMP=$(date +%F_%H%M)
LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"

log() { echo "$(date '+%F %T') | $*" >> "$LOG"; }
fail_msgs=()

# ---------------------------------------------------------------- VPN (REST)
backup_vpn() {
  local out="$BACKUP_DIR/vpn-supabase-$STAMP.json.gz"
  python3 - "$out" <<'PY'
import gzip, json, sys, urllib.parse, urllib.request

env = {}
with open("/root/gigabyte-bot/.env") as fh:
    for line in fh:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            env[k] = v

base = env["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
key = env["SUPABASE_KEY"]

def get(path):
    req = urllib.request.Request(base + path)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Accept", "application/json")
    return urllib.request.urlopen(req, timeout=90)

# Список таблиц берём из OpenAPI-описания PostgREST
spec = json.loads(get("").read().decode())
tables = sorted((spec.get("definitions") or {}).keys())

dump = {}
for t in tables:
    rows, start, page = [], 0, 1000
    while True:
        q = urllib.parse.quote(t, safe="") + f"?select=*&limit={page}&offset={start}"
        batch = json.loads(get(q).read().decode())
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    dump[t] = rows

with gzip.open(sys.argv[1], "wt", encoding="utf-8") as fh:
    json.dump(dump, fh, ensure_ascii=False)
print("tables=%d rows=%d" % (len(dump), sum(len(v) for v in dump.values())))
PY
}

# ------------------------------------------------------------- fin (pg_dump)
backup_fin() {
  local out="$BACKUP_DIR/fin-supabase-$STAMP.sql.gz"
  local dsn major
  dsn=$(grep -E "^DIRECT_DATABASE_URL=" /opt/fin/.env 2>/dev/null | cut -d= -f2-)
  [[ -n "$dsn" ]] || { echo "нет DIRECT_DATABASE_URL"; return 1; }

  # pg_dump отказывается работать с сервером новее себя, а Supabase обновляют
  # без предупреждения. Поэтому спрашиваем мажорную версию у самого сервера
  # (psql совместим «вниз») и берём ровно такой образ postgres для дампа.
  # Клиент запускаем разовым контейнером — postgres рядом держать не нужно.
  major=$(docker run --rm "$PG_CLIENT_IMAGE" sh -lc \
    "PGCONNECT_TIMEOUT=20 psql '$dsn' -tA -c 'show server_version_num;'" 2>/dev/null | tr -dc '0-9')
  major=$(( ${major:-0} / 10000 ))
  [[ "$major" -ge 13 ]] || { echo "не удалось определить версию сервера"; return 1; }

  docker run --rm "postgres:${major}-alpine" \
    sh -lc "PGCONNECT_TIMEOUT=20 pg_dump --no-owner --no-privileges '$dsn'" 2>/dev/null \
    | gzip > "$out"

  # Дамп годен, если архив целый и внутри есть заголовок pg_dump.
  # ВАЖНО: голову читаем в переменную, а не пайпом в grep — при set -o pipefail
  # ранний выход grep/head рвёт пайп и портит код возврата даже на живом дампе.
  [[ -s "$out" ]] || return 1
  gzip -t "$out" 2>/dev/null || return 1
  local head4k
  head4k=$( { gzip -dc "$out" 2>/dev/null || true; } | head -c 4000 )
  [[ "$head4k" == *"PostgreSQL database dump"* ]]
}

# ----------------------------------------------------------------- запуск
if out=$(backup_vpn 2>&1); then
  log "VPN OK: $out ($(du -h "$BACKUP_DIR/vpn-supabase-$STAMP.json.gz" | cut -f1))"
else
  log "VPN FAIL: $out"; fail_msgs+=("VPN Supabase: $out")
fi

if backup_fin 2>/dev/null; then
  log "FIN OK: $(du -h "$BACKUP_DIR/fin-supabase-$STAMP.sql.gz" | cut -f1)"
else
  log "FIN FAIL"; fail_msgs+=("Финансы (pg_dump)")
  rm -f "$BACKUP_DIR/fin-supabase-$STAMP.sql.gz"
fi

# ---------------------------------------------------------------- ротация
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -name "*-supabase-*.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)
log "ротация: удалено старых файлов $deleted (хранение $KEEP_DAYS дн.)"

# ------------------------------------------------------- уведомление админу
if [[ ${#fail_msgs[@]} -gt 0 ]]; then
  BT=$(grep -E "^BOT_TOKEN=" /root/gigabyte-bot/.env | cut -d= -f2-)
  AID=$(grep -E "^ADMIN_IDS=" /root/gigabyte-bot/.env | cut -d= -f2- | cut -d, -f1)
  if [[ -n "$BT" && -n "$AID" ]]; then
    text="⚠️ Бэкап баз завершился с ошибкой:%0A$(printf '%s%%0A' "${fail_msgs[@]}")"
    curl -s -o /dev/null --max-time 20 \
      "https://api.telegram.org/bot$BT/sendMessage?chat_id=$AID&text=$text"
  fi
  exit 1
fi
exit 0
