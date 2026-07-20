#!/usr/bin/env bash
# ============================================================================
#  Gigabyte VPN — быстрое добавление нод
#
#  Клонирует ВСЕ настройки с эталонного сервера на новый:
#    • панель 3x-ui (те же бинарники и версия) + systemd
#    • настройки панели (порты, subPath, basePath, тема, xray-шаблон:
#      маршрутизация, DNS с hosts-фиксом, цепочки)
#    • системный тюнинг: BBR+fq+TFO, UFW, fail2ban, автообновления
#    • TLS-сертификат Let's Encrypt на домен ноды (для входа)
#  Клиенты НЕ копируются — новая нода стартует пустой (под новых юзеров).
#
#  ИСПОЛЬЗОВАНИЕ:
#    ./add-node.sh entry --ip 1.2.3.4 --pass 'ROOTPASS' --domain vpn2.gigabytebot.com
#    ./add-node.sh exit  --ip 5.6.7.8 --pass 'ROOTPASS'
#
#  ОПЦИИ:
#    --source <alias>   эталон для клонирования (по умолчанию: moscow для
#                       entry, france для exit) — алиас из ~/.ssh/config
#    --key <path>       SSH-ключ, который положить на новую ноду
#                       (по умолчанию ~/.ssh/id_ed25519.pub)
#
#  ПОСЛЕ ЗАПУСКА скрипт печатает готовые значения для добавления сервера
#  в админке бота (или, для exit, параметры цепочки для входной ноды).
# ============================================================================
set -uo pipefail

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'
info() { echo "${BLU}▸${RST} $*"; }
ok()   { echo "${GRN}✓${RST} $*"; }
warn() { echo "${YLW}!${RST} $*"; }
die()  { echo "${RED}✗ $*${RST}" >&2; exit 1; }

MODE="${1:-}"; shift || true
[[ "$MODE" == "entry" || "$MODE" == "exit" ]] || die "Первый аргумент: entry или exit"

IP=""; PASS=""; DOMAIN=""; SOURCE=""; PUBKEY="$HOME/.ssh/id_ed25519.pub"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)     IP="$2"; shift 2 ;;
    --pass)   PASS="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --key)    PUBKEY="$2"; shift 2 ;;
    *) die "Неизвестный аргумент: $1" ;;
  esac
done
[[ -n "$IP" ]]   || die "Укажите --ip"
[[ -n "$PASS" ]] || die "Укажите --pass (root-пароль новой ноды от хостера)"
[[ -z "$SOURCE" ]] && SOURCE=$([[ "$MODE" == "entry" ]] && echo moscow || echo france)
[[ "$MODE" == "entry" && -z "$DOMAIN" ]] && die "Для entry обязателен --domain (напр. vpn2.gigabytebot.com)"
[[ -f "$PUBKEY" ]] || die "Не найден публичный ключ: $PUBKEY"
command -v sshpass >/dev/null || die "Нужен sshpass: brew install sshpass"

SSHOPT=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20)
NEW()  { ssh "${SSHOPT[@]}" -o BatchMode=yes root@"$IP" "$@"; }        # после установки ключа
NEWP() { sshpass -p "$PASS" ssh "${SSHOPT[@]}" -o NumberOfPasswordPrompts=1 root@"$IP" "$@"; }  # по паролю
SRC()  { ssh -o BatchMode=yes "$SOURCE" "$@"; }

echo "════════════════════════════════════════════════════════════"
echo " Добавление ноды: ${MODE}  →  ${IP}"
echo " Эталон: ${SOURCE}${DOMAIN:+   Домен: $DOMAIN}"
echo "════════════════════════════════════════════════════════════"

# ---------------------------------------------------------------- 0. Проверки
info "Проверяю доступность эталона и новой ноды…"
SRC 'echo ok' >/dev/null 2>&1 || die "Нет SSH-доступа к эталону '$SOURCE' (проверьте ~/.ssh/config)"
NEWP 'echo ok' >/dev/null 2>&1 || die "Не могу зайти на $IP по паролю"
ok "Доступ есть"

if [[ "$MODE" == "entry" ]]; then
  info "Проверяю DNS: $DOMAIN должен указывать на $IP…"
  RES=$(NEWP "getent hosts $DOMAIN | awk '{print \$1}' | head -1" 2>/dev/null | tr -d '\r')
  [[ "$RES" == "$IP" ]] || die "DNS: $DOMAIN → '${RES:-нет записи}', ожидалось $IP. Создайте A-запись (Cloudflare: DNS only, серое облако) и подождите."
  ok "DNS корректен"
fi

# ---------------------------------------------------------- 1. SSH-ключ
info "Ставлю SSH-ключ на новую ноду…"
K=$(cat "$PUBKEY")
NEWP "mkdir -p /root/.ssh && chmod 700 /root/.ssh; touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; grep -qF '$K' /root/.ssh/authorized_keys || echo '$K' >> /root/.ssh/authorized_keys" >/dev/null
NEW 'echo ok' >/dev/null 2>&1 || die "Ключ не сработал"
ok "Вход по ключу работает"

# ------------------------------------------------- 2. Система и тюнинг
info "Готовлю систему (пакеты, BBR, UFW, fail2ban)…"
NEW 'bash -s' <<'PREP' >/dev/null 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib sqlite3 socat curl ufw fail2ban cron unattended-upgrades tar gzip openssl
cat > /etc/sysctl.d/99-vpn-tuning.conf <<EOF
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_fastopen = 3
net.ipv4.ip_forward = 1
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.ipv4.tcp_slow_start_after_idle = 0
EOF
sysctl -p /etc/sysctl.d/99-vpn-tuning.conf
ufw --force reset; ufw default deny incoming; ufw default allow outgoing
for p in 22/tcp 80/tcp 443 2096/tcp 5443/tcp 54568/tcp; do ufw allow $p; done
ufw --force enable
systemctl enable --now fail2ban cron postgresql
systemctl enable unattended-upgrades
PREP
CC=$(NEW 'sysctl -n net.ipv4.tcp_congestion_control' 2>/dev/null | tr -d '\r')
ok "Система готова (congestion control: ${CC})"

# --------------------------------------------- 3. Панель: бинарники
info "Копирую панель с эталона ($SOURCE)… это ~280 МБ, подождите"
SRC 'tar czf - -C / usr/local/x-ui etc/default/x-ui etc/systemd/system/x-ui.service 2>/dev/null' \
  | NEW 'tar xzf - -C /' || die "Не удалось перенести панель"
SRC '[ -d /etc/systemd/system/x-ui.service.d ] && tar czf - -C / etc/systemd/system/x-ui.service.d 2>/dev/null' \
  | NEW 'tar xzf - -C / 2>/dev/null' || true
ok "Панель скопирована ($(NEW '/usr/local/x-ui/x-ui -v 2>/dev/null | tail -1' | tr -d '\r'))"

# --------------------------------------------- 4. База: клон настроек
info "Клонирую настройки панели (без клиентов)…"
DSN=$(SRC "grep '^XUI_DB_DSN=' /etc/default/x-ui | cut -d= -f2-" | tr -d '\r')
DBUSER=$(sed -E 's|postgres://([^:]+):.*|\1|' <<<"$DSN")
DBPASS=$(sed -E 's|postgres://[^:]+:([^@]+)@.*|\1|' <<<"$DSN")
SRC "PGPASSWORD='$DBPASS' pg_dump --no-owner --no-privileges '$DSN' | gzip" > /tmp/_node_dump.sql.gz 2>/dev/null
[[ -s /tmp/_node_dump.sql.gz ]] || die "Не удалось снять дамп с эталона"
cat /tmp/_node_dump.sql.gz | NEW 'cat > /tmp/dump.sql.gz'
rm -f /tmp/_node_dump.sql.gz

NEW "bash -s '$DBUSER' '$DBPASS'" <<'DBSET' >/dev/null 2>&1
DBUSER="$1"; DBPASS="$2"
sudo -u postgres psql -tA -c "DROP DATABASE IF EXISTS xui;"
sudo -u postgres psql -tA -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DBUSER') THEN CREATE ROLE \"$DBUSER\" WITH LOGIN PASSWORD '$DBPASS'; END IF; END \$\$;"
sudo -u postgres psql -tA -c "ALTER ROLE \"$DBUSER\" WITH LOGIN PASSWORD '$DBPASS';"
sudo -u postgres psql -tA -c "CREATE DATABASE xui OWNER \"$DBUSER\";"
HBA=$(sudo -u postgres psql -tA -c "show hba_file;")
grep -q "127.0.0.1/32" "$HBA" || echo "host all all 127.0.0.1/32 scram-sha-256" >> "$HBA"
systemctl reload postgresql; sleep 2
export PGPASSWORD="$DBPASS"
gunzip -c /tmp/dump.sql.gz | psql -h 127.0.0.1 -U "$DBUSER" -d xui
# Новая нода — без чужих клиентов
psql -h 127.0.0.1 -U "$DBUSER" -d xui -tA -c "
TRUNCATE clients, client_traffics, client_inbounds, client_global_traffics,
         inbound_client_ips, client_external_links RESTART IDENTITY CASCADE;" 2>/dev/null
# и очищаем массив clients внутри инбаундов
psql -h 127.0.0.1 -U "$DBUSER" -d xui -tA -c "select id, settings from inbounds;" | while IFS='|' read -r id st; do
  NEWST=$(python3 -c "
import json,sys
s=json.loads('''$st''')
s['clients']=[]
print(json.dumps(s))
" 2>/dev/null)
  [ -n "$NEWST" ] && psql -h 127.0.0.1 -U "$DBUSER" -d xui -c "update inbounds set settings=\$J\$$NEWST\$J\$ where id=$id;" >/dev/null
done
rm -f /tmp/dump.sql.gz
DBSET
CNT=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c 'select count(*) from inbounds;'" 2>/dev/null | tr -d '\r')
ok "Настройки клонированы, инбаундов: ${CNT}, клиентов: 0 (нода пустая)"

# --------------------------------------------- 5. Сертификат (для entry)
if [[ "$MODE" == "entry" ]]; then
  info "Выпускаю Let's Encrypt на $DOMAIN…"
  NEW "bash -s '$DOMAIN'" <<'CERT' 2>&1 | grep -iE "cert is in|Installing|error" | head -3
DOMAIN="$1"
[ -f /root/.acme.sh/acme.sh ] || curl -s https://get.acme.sh | sh -s email=admin@"${DOMAIN#*.}" >/dev/null 2>&1
/root/.acme.sh/acme.sh --set-default-ca --server letsencrypt >/dev/null 2>&1
/root/.acme.sh/acme.sh --issue -d "$DOMAIN" --standalone --keylength ec-256 --server letsencrypt 2>&1 | tail -2
mkdir -p /root/cert/node
/root/.acme.sh/acme.sh --install-cert -d "$DOMAIN" --ecc \
  --fullchain-file /root/cert/node/fullchain.pem \
  --key-file /root/cert/node/privkey.pem \
  --reloadcmd "systemctl restart x-ui" 2>&1 | tail -1
CERT
  NEW "test -s /root/cert/node/fullchain.pem" || die "Сертификат не выпущен (проверьте, что порт 80 свободен и DNS верный)"
  info "Прописываю сертификат и домен в настройки панели…"
  NEW "bash -s '$DBUSER' '$DBPASS' '$DOMAIN'" <<'CFG' >/dev/null 2>&1
export PGPASSWORD="$2"
P="psql -h 127.0.0.1 -U $1 -d xui -tA"
$P -c "update settings set value='/root/cert/node/fullchain.pem' where key in ('webCertFile','subCertFile');"
$P -c "update settings set value='/root/cert/node/privkey.pem' where key in ('webKeyFile','subKeyFile');"
$P -c "update settings set value='$3' where key='subDomain';"
CFG
  ok "Сертификат установлен, домен прописан"
fi

# --------------------------------------------- 6. Запуск и проверка
info "Запускаю панель…"
NEW 'systemctl daemon-reload; systemctl enable x-ui >/dev/null 2>&1; systemctl restart x-ui' >/dev/null 2>&1
sleep 7
ACT=$(NEW 'systemctl is-active x-ui' | tr -d '\r')
XR=$(NEW 'pgrep -f xray-linux-amd64 >/dev/null && echo yes || echo no' | tr -d '\r')
[[ "$ACT" == "active" ]] || die "x-ui не запустился: $(NEW 'journalctl -u x-ui -n 10 --no-pager')"
ok "Панель работает (x-ui: $ACT, xray: $XR)"

# --------------------------------------------- 7. Cron как на эталоне
NEW 'bash -s' <<'CRON' >/dev/null 2>&1
( crontab -l 2>/dev/null | grep -v 'update-all-geofiles\|pg_dump xui';
  echo '0 5 * * 1 /usr/local/x-ui/x-ui update-all-geofiles >/dev/null 2>&1';
  echo '30 4 * * 0 sudo -u postgres pg_dump xui | gzip > /root/xui-$(date +\%F).sql.gz' ) | crontab -
CRON
ok "Cron настроен (geo-файлы, бэкап БД, автопродление серта)"

# --------------------------------------------- 8. Итог
WEBPORT=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c \"select value from settings where key='webPort';\"" | tr -d '\r')
BASEPATH=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c \"select value from settings where key='webBasePath';\"" | tr -d '\r')
SUBPORT=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c \"select value from settings where key='subPort';\"" | tr -d '\r')
SUBPATH=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c \"select value from settings where key='subPath';\"" | tr -d '\r')
LOGIN=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c 'select username from users limit 1;'" | tr -d '\r')

echo
echo "════════════════════════════════════════════════════════════"
echo "${GRN} ГОТОВО — нода поднята${RST}"
echo "════════════════════════════════════════════════════════════"
HOST="${DOMAIN:-$IP}"
echo " Панель:  https://${HOST}:${WEBPORT}${BASEPATH}"
echo " Логин:   ${LOGIN}  (пароль — как на эталоне ${SOURCE})"
echo

if [[ "$MODE" == "entry" ]]; then
  cat <<OUT
 ДОБАВИТЬ В БОТА (админка → Серверы → +):
   Название:     🇷🇺 <как назовёте>
   IP / хост:    ${DOMAIN}
   Panel URL:    https://${DOMAIN}:${WEBPORT}${BASEPATH}
   Логин/пароль: ${LOGIN} / <пароль эталона>
   Inbound ID:   <выберите кнопкой «Проверить подключение»>
   Sub port:     ${SUBPORT}
   Sub path:     ${SUBPATH//\//}

 ⚠️  Цепочки (аутбаунды на выходы) уже склонированы с эталона —
     новая нода сразу умеет ходить во Францию/Финляндию.
OUT
else
  info "Генерирую свежие Reality-ключи для выхода…"
  OUTP=$(NEW "bash -s '$DBUSER' '$DBPASS'" <<'GEN'
export PGPASSWORD="$2"
P="psql -h 127.0.0.1 -U $1 -d xui -tA"
KEYS=$(/usr/local/x-ui/bin/xray-linux-amd64 x25519)
PRIV=$(echo "$KEYS" | grep -i "private" | awk '{print $NF}')
PUB=$(echo "$KEYS"  | grep -iE "public|password" | awk '{print $NF}')
UUID=$(cat /proc/sys/kernel/random/uuid)
SID=$(openssl rand -hex 8)
ID=$($P -c "select id from inbounds order by id limit 1;")
ST=$($P -c "select stream_settings from inbounds where id=$ID;")
NEWST=$(python3 -c "
import json
s=json.loads('''$ST''')
r=s.setdefault('realitySettings',{})
r['privateKey']='$PRIV'; r['shortIds']=['$SID']
print(json.dumps(s))
")
$P -c "update inbounds set stream_settings=\$J\$$NEWST\$J\$ where id=$ID;" >/dev/null
SET=$($P -c "select settings from inbounds where id=$ID;")
NEWSET=$(python3 -c "
import json
s=json.loads('''$SET''')
s['clients']=[{'id':'$UUID','flow':'xtls-rprx-vision','email':'entry-chain','enable':True,'limitIp':0,'totalGB':0,'expiryTime':0,'subId':'','comment':'chain from entry','reset':0}]
print(json.dumps(s))
")
$P -c "update inbounds set settings=\$J\$$NEWSET\$J\$ where id=$ID;" >/dev/null
PORT=$($P -c "select port from inbounds where id=$ID;")
SNI=$(python3 -c "
import json; s=json.loads('''$NEWST'''); print((s['realitySettings'].get('serverNames') or ['www.amazon.com'])[0])")
systemctl restart x-ui >/dev/null 2>&1
echo "PUB=$PUB"; echo "SID=$SID"; echo "UUID=$UUID"; echo "PORT=$PORT"; echo "SNI=$SNI"
GEN
)
  eval "$(grep -E '^(PUB|SID|UUID|PORT|SNI)=' <<<"$OUTP")"
  cat <<OUT
 ДОБАВИТЬ ЦЕПОЧКУ НА ВХОДНОЙ НОДЕ (панель входа → xray-шаблон, новый outbound):

   {
     "tag": "to-<название>",
     "protocol": "vless",
     "settings": { "address": "${IP}", "port": ${PORT},
                   "id": "${UUID}", "flow": "xtls-rprx-vision", "encryption": "none" },
     "streamSettings": {
       "network": "tcp", "security": "reality",
       "realitySettings": { "serverName": "${SNI}", "fingerprint": "chrome",
                            "publicKey": "${PUB}", "shortId": "${SID}", "spiderX": "/" }
     }
   }

 Затем: новый inbound на входе + правило маршрутизации
        { "inboundTag": ["<новый-инбаунд>"], "outboundTag": "to-<название>" }
        и добавить сервер в бота (админка → Серверы).
OUT
fi
echo "════════════════════════════════════════════════════════════"
