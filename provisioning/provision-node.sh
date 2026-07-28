#!/usr/bin/env bash
# ============================================================================
#  Gigabyte VPN — провижининг ноды (запускается бэкендом бота из контейнера)
#
#  В отличие от scripts/add-node.sh (для запуска с Mac по ssh-алиасам), этот
#  скрипт рассчитан на запуск из Docker-контейнера бота: источник задаётся
#  IP + ключом провижининга, весь прогресс идёт в stdout построчно, а в конце
#  печатается строка `RESULT_JSON={...}` — её парсит бэкенд для регистрации
#  ноды в боте (Supabase) и, для выхода, для подвязки цепочки к входу.
#
#  Клиенты НЕ копируются — нода стартует пустой.
#
#  ВЫЗОВ:
#    provision-node.sh entry --ip 1.2.3.4 --pass P --source-ip 77.110.104.140 \
#        --prov-key /app/provisioning/prov_key --domain vpn2.gigabytebot.com
#    provision-node.sh exit  --ip 5.6.7.8 --pass P --source-ip 38.180.226.39 \
#        --prov-key /app/provisioning/prov_key
# ============================================================================
set -uo pipefail

MODE="${1:-}"; shift || true
[[ "$MODE" == "entry" || "$MODE" == "exit" ]] || { echo "FATAL: первый аргумент entry|exit"; exit 2; }

IP=""; PASS=""; SOURCE_IP=""; DOMAIN=""; PROV_KEY="/app/provisioning/prov_key"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)        IP="$2"; shift 2 ;;
    --pass)      PASS="$2"; shift 2 ;;
    --source-ip) SOURCE_IP="$2"; shift 2 ;;
    --domain)    DOMAIN="$2"; shift 2 ;;
    --prov-key)  PROV_KEY="$2"; shift 2 ;;
    *) echo "FATAL: неизвестный аргумент $1"; exit 2 ;;
  esac
done
step(){ echo "▸ $*"; }
ok(){ echo "✓ $*"; }
die(){ echo "FATAL: $*"; exit 1; }

[[ -n "$IP" ]] || die "не указан --ip"
[[ -n "$PASS" ]] || die "не указан --pass"
[[ -n "$SOURCE_IP" ]] || die "не указан --source-ip"
[[ -f "$PROV_KEY" ]] || die "нет ключа провижининга: $PROV_KEY"
[[ "$MODE" == "entry" && -z "$DOMAIN" ]] && die "для entry обязателен --domain"

SSHO=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=25)
SRC()  { ssh -i "$PROV_KEY" "${SSHO[@]}" -o BatchMode=yes root@"$SOURCE_IP" "$@"; }
NEW()  { ssh -i "$PROV_KEY" "${SSHO[@]}" -o BatchMode=yes root@"$IP" "$@"; }
NEWP() { sshpass -p "$PASS" ssh "${SSHO[@]}" -o NumberOfPasswordPrompts=1 -o PubkeyAuthentication=no root@"$IP" "$@"; }

# 0. Доступность --------------------------------------------------------------
step "Проверяю доступ к эталону ($SOURCE_IP) и новой ноде ($IP)…"
SRC 'echo ok' >/dev/null 2>&1 || die "нет SSH к эталону $SOURCE_IP по ключу провижининга"
NEWP 'echo ok' >/dev/null 2>&1 || die "не могу зайти на $IP по паролю (проверьте IP/пароль)"
ok "доступ есть"

if [[ "$MODE" == "entry" ]]; then
  step "Проверяю DNS: $DOMAIN → $IP…"
  RES=$(NEWP "getent hosts $DOMAIN 2>/dev/null | awk '{print \$1}' | head -1" | tr -d '\r')
  [[ "$RES" == "$IP" ]] || die "DNS: $DOMAIN → '${RES:-нет записи}', ожидалось $IP. Создайте A-запись (Cloudflare: DNS only) и подождите."
  ok "DNS корректен"
fi

# 1. Ключ провижининга на новую ноду -----------------------------------------
step "Ставлю SSH-ключ провижининга на ноду…"
K=$(cut -d' ' -f1-2 "${PROV_KEY}.pub" 2>/dev/null || cat "${PROV_KEY}.pub")
NEWP "mkdir -p /root/.ssh; chmod 700 /root/.ssh; touch /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; grep -qF '$K' /root/.ssh/authorized_keys || echo '$(cat ${PROV_KEY}.pub)' >> /root/.ssh/authorized_keys" >/dev/null 2>&1
NEW 'echo ok' >/dev/null 2>&1 || die "ключ не сработал"
ok "вход по ключу работает"

# 2. Система и тюнинг ---------------------------------------------------------
step "Готовлю систему (пакеты, BBR, UFW, fail2ban)… это займёт 1-2 мин"
NEW 'bash -s' <<'PREP' >/dev/null 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib sqlite3 socat curl ufw fail2ban cron unattended-upgrades tar gzip openssl python3
cat > /etc/sysctl.d/99-vpn-tuning.conf <<EOF
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_fastopen = 3
net.ipv4.ip_forward = 1
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.ipv4.tcp_slow_start_after_idle = 0
EOF
sysctl -p /etc/sysctl.d/99-vpn-tuning.conf >/dev/null 2>&1
ufw --force reset >/dev/null 2>&1; ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
for p in 22/tcp 80/tcp 443 2096/tcp 5443/tcp 8443/tcp 54568/tcp; do ufw allow $p >/dev/null 2>&1; done
ufw --force enable >/dev/null 2>&1
systemctl enable --now fail2ban cron postgresql >/dev/null 2>&1
systemctl enable unattended-upgrades >/dev/null 2>&1
mkdir -p /etc/x-ui
PREP
CC=$(NEW 'sysctl -n net.ipv4.tcp_congestion_control' 2>/dev/null | tr -d '\r')
ok "система готова (congestion control: ${CC:-?})"

# 3. Панель: бинарники с эталона ---------------------------------------------
step "Копирую панель 3x-ui с эталона (~280 МБ)…"
SRC 'tar czf - -C / usr/local/x-ui etc/default/x-ui etc/systemd/system/x-ui.service 2>/dev/null' \
  | NEW 'tar xzf - -C /' || die "не удалось перенести панель"
SRC '[ -d /etc/systemd/system/x-ui.service.d ] && tar czf - -C / etc/systemd/system/x-ui.service.d 2>/dev/null' \
  | NEW 'tar xzf - -C / 2>/dev/null' || true
ok "панель скопирована ($(NEW '/usr/local/x-ui/x-ui -v 2>/dev/null | tail -1' | tr -d '\r'))"

# 4. База: клон настроек (без клиентов) --------------------------------------
step "Клонирую настройки панели (без клиентов)…"
DSN=$(SRC "grep '^XUI_DB_DSN=' /etc/default/x-ui | cut -d= -f2-" | tr -d '\r')
DBUSER=$(sed -E 's|postgres://([^:]+):.*|\1|' <<<"$DSN")
DBPASS=$(sed -E 's|postgres://[^:]+:([^@]+)@.*|\1|' <<<"$DSN")
SRC "PGPASSWORD='$DBPASS' pg_dump --no-owner --no-privileges '$DSN' | gzip" \
  | NEW 'cat > /tmp/dump.sql.gz' || die "не удалось снять/перенести дамп"

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
gunzip -c /tmp/dump.sql.gz | psql -h 127.0.0.1 -U "$DBUSER" -d xui >/dev/null 2>&1
psql -h 127.0.0.1 -U "$DBUSER" -d xui -tA -c "TRUNCATE clients, client_traffics, client_inbounds, client_global_traffics, inbound_client_ips, client_external_links RESTART IDENTITY CASCADE;" 2>/dev/null
psql -h 127.0.0.1 -U "$DBUSER" -d xui -tA -c "select id, settings from inbounds;" | while IFS='|' read -r id st; do
  NEWST=$(python3 -c "import json,sys; s=json.loads('''$st'''); s['clients']=[]; print(json.dumps(s))" 2>/dev/null)
  [ -n "$NEWST" ] && psql -h 127.0.0.1 -U "$DBUSER" -d xui -c "update inbounds set settings=\$J\$$NEWST\$J\$ where id=$id;" >/dev/null 2>&1
done
rm -f /tmp/dump.sql.gz
DBSET
CNT=$(NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c 'select count(*) from inbounds;'" 2>/dev/null | tr -d '\r')
ok "настройки клонированы, инбаундов: ${CNT:-?}, клиентов: 0"

# 5. Сертификат для входной ноды ---------------------------------------------
if [[ "$MODE" == "entry" ]]; then
  step "Выпускаю Let's Encrypt на $DOMAIN…"
  NEW "bash -s '$DOMAIN'" <<'CERT' >/dev/null 2>&1
DOMAIN="$1"
[ -f /root/.acme.sh/acme.sh ] || curl -s https://get.acme.sh | sh -s email=admin@"${DOMAIN#*.}" >/dev/null 2>&1
/root/.acme.sh/acme.sh --set-default-ca --server letsencrypt >/dev/null 2>&1
systemctl stop x-ui >/dev/null 2>&1
/root/.acme.sh/acme.sh --issue -d "$DOMAIN" --standalone --keylength ec-256 --server letsencrypt >/dev/null 2>&1
mkdir -p /root/cert/node
/root/.acme.sh/acme.sh --install-cert -d "$DOMAIN" --ecc \
  --fullchain-file /root/cert/node/fullchain.pem \
  --key-file /root/cert/node/privkey.pem \
  --reloadcmd "systemctl restart x-ui" >/dev/null 2>&1
CERT
  NEW "test -s /root/cert/node/fullchain.pem" || die "сертификат не выпущен (порт 80 занят или DNS не доехал)"
  NEW "bash -s '$DBUSER' '$DBPASS' '$DOMAIN'" <<'CFG' >/dev/null 2>&1
export PGPASSWORD="$2"; P="psql -h 127.0.0.1 -U $1 -d xui -tA"
$P -c "update settings set value='/root/cert/node/fullchain.pem' where key in ('webCertFile','subCertFile');"
$P -c "update settings set value='/root/cert/node/privkey.pem' where key in ('webKeyFile','subKeyFile');"
$P -c "update settings set value='$3' where key='subDomain';"
CFG
  ok "сертификат установлен, домен прописан"
fi

# 6. Запуск и проверка --------------------------------------------------------
step "Запускаю панель…"
NEW 'systemctl daemon-reload; systemctl enable x-ui >/dev/null 2>&1; systemctl restart x-ui' >/dev/null 2>&1
sleep 8
ACT=$(NEW 'systemctl is-active x-ui' | tr -d '\r')
[[ "$ACT" == "active" ]] || die "x-ui не запустился: $(NEW 'journalctl -u x-ui -n 8 --no-pager' 2>/dev/null | tr '\n' ' ')"
XR=$(NEW 'pgrep -f xray-linux-amd64 >/dev/null && echo yes || echo no' | tr -d '\r')
ok "панель работает (x-ui: $ACT, xray: $XR)"

# 7. Cron как на эталоне ------------------------------------------------------
NEW 'bash -s' <<'CRON' >/dev/null 2>&1
( crontab -l 2>/dev/null | grep -v 'update-all-geofiles\|pg_dump xui';
  echo '0 5 * * 1 /usr/local/x-ui/x-ui update-all-geofiles >/dev/null 2>&1';
  echo '30 4 * * 0 sudo -u postgres pg_dump xui | gzip > /root/xui-$(date +\%F).sql.gz' ) | crontab -
CRON
ok "cron настроен"

# 8. Сбор фактов / для выхода — свежие Reality-ключи --------------------------
GET(){ NEW "PGPASSWORD='$DBPASS' psql -h 127.0.0.1 -U '$DBUSER' -d xui -tA -c \"$1\"" | tr -d '\r'; }
WEBPORT=$(GET "select value from settings where key='webPort';")
BASEPATH=$(GET "select value from settings where key='webBasePath';")
SUBPORT=$(GET "select value from settings where key='subPort';")
SUBPATH=$(GET "select value from settings where key='subPath';")
LOGIN=$(GET "select username from users limit 1;")
PANELPASS=$(GET "select password from users limit 1;")

if [[ "$MODE" == "exit" ]]; then
  step "Генерирую свежие Reality-ключи для выхода…"
  OUTP=$(NEW "bash -s '$DBUSER' '$DBPASS'" <<'GEN'
export PGPASSWORD="$2"; P="psql -h 127.0.0.1 -U $1 -d xui -tA"
KEYS=$(/usr/local/x-ui/bin/xray-linux-amd64 x25519)
PRIV=$(echo "$KEYS" | grep -i "private" | awk '{print $NF}')
PUB=$(echo "$KEYS"  | grep -iE "public|password" | awk '{print $NF}')
UUID=$(cat /proc/sys/kernel/random/uuid)
SID=$(openssl rand -hex 8)
ID=$($P -c "select id from inbounds order by id limit 1;")
ST=$($P -c "select stream_settings from inbounds where id=$ID;")
NEWST=$(python3 -c "import json; s=json.loads('''$ST'''); r=s.setdefault('realitySettings',{}); r['privateKey']='$PRIV'; r['shortIds']=['$SID']; print(json.dumps(s))")
$P -c "update inbounds set stream_settings=\$J\$$NEWST\$J\$ where id=$ID;" >/dev/null
SET=$($P -c "select settings from inbounds where id=$ID;")
NEWSET=$(python3 -c "import json; s=json.loads('''$SET'''); s['clients']=[{'id':'$UUID','flow':'xtls-rprx-vision','email':'entry-chain','enable':True,'limitIp':0,'totalGB':0,'expiryTime':0,'subId':'','comment':'chain from entry','reset':0}]; print(json.dumps(s))")
$P -c "update inbounds set settings=\$J\$$NEWSET\$J\$ where id=$ID;" >/dev/null
PORT=$($P -c "select port from inbounds where id=$ID;")
SNI=$(python3 -c "import json; s=json.loads('''$NEWST'''); print((s['realitySettings'].get('serverNames') or ['www.amazon.com'])[0])")
systemctl restart x-ui >/dev/null 2>&1
echo "PUB=$PUB"; echo "SID=$SID"; echo "UUID=$UUID"; echo "PORT=$PORT"; echo "SNI=$SNI"
GEN
)
  eval "$(grep -E '^(PUB|SID|UUID|PORT|SNI)=' <<<"$OUTP")"
  ok "ключи выхода готовы (порт $PORT, SNI $SNI)"
  printf 'RESULT_JSON={"mode":"exit","ip":"%s","chain":{"address":"%s","port":%s,"uuid":"%s","publicKey":"%s","shortId":"%s","sni":"%s"},"panel":{"web_port":"%s","base_path":"%s","login":"%s","pass":"%s"}}\n' \
    "$IP" "$IP" "${PORT:-0}" "$UUID" "$PUB" "$SID" "$SNI" "$WEBPORT" "$BASEPATH" "$LOGIN" "$PANELPASS"
else
  # entry: собираем id инбаундов, чтобы бэкенд мог зарегистрировать/переключить
  INB=$(GET "select json_agg(json_build_object('id',id,'remark',remark,'port',port)) from inbounds;")
  ok "входная нода поднята: https://${DOMAIN}:${WEBPORT}${BASEPATH}"
  printf 'RESULT_JSON={"mode":"entry","ip":"%s","domain":"%s","panel":{"web_port":"%s","base_path":"%s","sub_port":"%s","sub_path":"%s","login":"%s","pass":"%s"},"inbounds":%s}\n' \
    "$IP" "$DOMAIN" "$WEBPORT" "$BASEPATH" "$SUBPORT" "$SUBPATH" "$LOGIN" "$PANELPASS" "${INB:-[]}"
fi
echo "DONE"
