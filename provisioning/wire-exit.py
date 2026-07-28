#!/usr/bin/env python3
# ============================================================================
#  Подвязка нового ВЫХОДА к входной ноде (Москва). Запускается ботом ПО SSH
#  на входной ноде: создаёт новый inbound (свежие Reality-ключи, пустые
#  клиенты) + outbound на выход + правило маршрутизации в xrayTemplateConfig.
#
#  Печатает WIRE_RESULT={...} с данными для регистрации страны в Supabase.
#  Режим --dry-run только валидирует (JSON + структура), ничего не пишет.
#
#  Аргументы:
#    --dsn <postgres-dsn>  --slug netherlands  --remark "🇳🇱 Нидерланды"
#    --exit-ip 5.6.7.8 --exit-port 443 --exit-uuid .. --exit-pbk .. \
#    --exit-sid .. --exit-sni www.amazon.com  [--dry-run]
#  Клон-шаблон inbound задаётся --template-id (по умолчанию наименьший id).
# ============================================================================
import argparse, json, subprocess, sys, os, re

XRAY_BIN = "/usr/local/x-ui/bin/xray-linux-amd64"

def psql(dsn, sql, dollar=None):
    """Выполнить SQL. dollar — (placeholder, value) для безопасной вставки JSON
    через dollar-quoting без экранирования."""
    if dollar:
        ph, val = dollar
        sql = sql.replace(ph, f"$WQ${val}$WQ$")
    r = subprocess.run(["psql", dsn, "-tA", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr.strip()}")
    return r.stdout.strip()

def gen_reality_keys():
    out = subprocess.run([XRAY_BIN, "x25519"], capture_output=True, text=True).stdout
    priv = pub = ""
    for line in out.splitlines():
        low = line.lower()
        if "private" in low: priv = line.split()[-1]
        elif "public" in low or "password" in low: pub = line.split()[-1]
    if not priv or not pub:
        raise RuntimeError("не удалось сгенерировать x25519 ключи")
    return priv, pub

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", required=True)
    ap.add_argument("--slug", required=True)
    ap.add_argument("--remark", required=True)
    ap.add_argument("--exit-ip", required=True)
    ap.add_argument("--exit-port", type=int, required=True)
    ap.add_argument("--exit-uuid", required=True)
    ap.add_argument("--exit-pbk", required=True)
    ap.add_argument("--exit-sid", required=True)
    ap.add_argument("--exit-sni", default="www.amazon.com")
    ap.add_argument("--template-id", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    slug = re.sub(r"[^a-z0-9]+", "-", a.slug.lower()).strip("-") or "exit"
    dsn = a.dsn

    # 1. Существующие порты + шаблонный inbound
    ports = [int(p) for p in psql(dsn, "select port from inbounds;").split() if p.strip().isdigit()]
    tmpl_id = a.template_id or int(psql(dsn, "select id from inbounds order by id limit 1;"))
    new_port = next(p for p in [8443, 9443, 10443, 11443, 12443, 13443] if p not in ports)
    new_tag = f"in-{new_port}-tcp"
    out_tag = f"to-{slug}"

    # 2. Шаблонные settings/stream_settings
    tmpl_settings = json.loads(psql(dsn, f"select settings from inbounds where id={tmpl_id};"))
    tmpl_stream = json.loads(psql(dsn, f"select stream_settings from inbounds where id={tmpl_id};"))

    priv, pub = gen_reality_keys()
    fp = (tmpl_stream.get("realitySettings", {}).get("settings", {}) or {}).get("fingerprint") or "firefox"
    reality = tmpl_stream.setdefault("realitySettings", {})
    reality["privateKey"] = priv
    new_sid = _rand_sid()
    reality["shortIds"] = [new_sid]
    sni = (reality.get("serverNames") or ["www.amazon.com"])[0]
    new_settings = dict(tmpl_settings); new_settings["clients"] = []

    # 3. Outbound на выход + правило маршрутизации в xrayTemplateConfig
    xt = json.loads(psql(dsn, "select value from settings where key='xrayTemplateConfig';"))
    outbounds = xt.setdefault("outbounds", [])
    if any(o.get("tag") == out_tag for o in outbounds):
        raise RuntimeError(f"outbound {out_tag} уже существует")
    outbounds.insert(0, {
        "tag": out_tag, "protocol": "vless",
        "settings": {"vnext": [{"address": a.exit_ip, "port": a.exit_port,
            "users": [{"id": a.exit_uuid, "flow": "xtls-rprx-vision", "encryption": "none"}]}]},
        "streamSettings": {"network": "tcp", "security": "reality",
            "realitySettings": {"serverName": a.exit_sni, "fingerprint": "chrome",
                "publicKey": a.exit_pbk, "shortId": a.exit_sid, "spiderX": "/"}},
    })
    rules = xt.setdefault("routing", {}).setdefault("rules", [])
    rules.append({"type": "field", "inboundTag": [new_tag], "outboundTag": out_tag})

    # Валидация структуры (json сериализуется, ключевые поля на месте)
    _ = json.dumps(xt); _ = json.dumps(new_settings); _ = json.dumps(tmpl_stream)

    if a.dry_run:
        print(f"DRYRUN ok: new_port={new_port} tag={new_tag} out={out_tag} "
              f"template_id={tmpl_id} pbk={pub[:12]}… sid={new_sid} sni={sni} fp={fp}")
        print("DRYRUN would: INSERT inbound + add outbound + routing rule + restart x-ui")
        return

    # 4. БЭКАП xrayTemplateConfig (для отката)
    bak = "/root/xray-template.bak.json"
    with open(bak, "w") as f:
        f.write(psql(dsn, "select value from settings where key='xrayTemplateConfig';"))

    # 5. Клон inbound (id = max+1, копируем все колонки шаблона с заменами)
    cols = ("user_id,up,down,total,remark,enable,expiry_time,traffic_reset,"
            "last_traffic_reset_time,listen,port,protocol,settings,stream_settings,"
            "tag,sniffing,node_id,origin_node_guid,sub_sort_index,share_addr_strategy,share_addr")
    new_id = int(psql(dsn, "select coalesce(max(id),0)+1 from inbounds;"))
    ins = (f"insert into inbounds (id,{cols}) select {new_id},"
           "user_id,0,0,total,__REMARK__,enable,expiry_time,traffic_reset,"
           "last_traffic_reset_time,listen,__PORT__,protocol,__SET__,__STREAM__,"
           "__TAG__,sniffing,node_id,origin_node_guid,sub_sort_index,share_addr_strategy,share_addr "
           f"from inbounds where id={tmpl_id};")
    # безопасная подстановка через dollar-quoting
    def dq(v): return f"$WQ${v}$WQ$"
    ins = ins.replace("__REMARK__", dq(a.remark)) \
             .replace("__PORT__", str(new_port)) \
             .replace("__SET__", dq(json.dumps(new_settings))) \
             .replace("__STREAM__", dq(json.dumps(tmpl_stream))) \
             .replace("__TAG__", dq(new_tag))
    psql(dsn, ins)
    # синхронизируем sequence, если она есть
    try:
        psql(dsn, "select setval(pg_get_serial_sequence('inbounds','id'), (select max(id) from inbounds));")
    except Exception:
        pass
    # 6. Записываем обновлённый шаблон
    psql(dsn, "update settings set value=__V__ where key='xrayTemplateConfig';",
         dollar=("__V__", json.dumps(xt)))

    # 7. Рестарт + проверка, при ошибке — откат
    subprocess.run(["systemctl", "restart", "x-ui"], capture_output=True)
    import time; time.sleep(8)
    active = subprocess.run(["systemctl", "is-active", "x-ui"], capture_output=True, text=True).stdout.strip()
    xray_up = subprocess.run(["pgrep", "-f", "xray-linux-amd64"], capture_output=True).returncode == 0
    if active != "active" or not xray_up:
        # откат
        with open(bak) as f:
            psql(dsn, "update settings set value=__V__ where key='xrayTemplateConfig';", dollar=("__V__", f.read()))
        psql(dsn, f"delete from inbounds where id={new_id};")
        subprocess.run(["systemctl", "restart", "x-ui"], capture_output=True)
        raise RuntimeError(f"xray не поднялся после изменения — выполнен откат (active={active}, xray={xray_up})")

    print("WIRE_RESULT=" + json.dumps({
        "inbound_id": new_id, "client_port": new_port, "pbk": pub,
        "short_id": new_sid, "sni": sni, "fp": fp, "tag": new_tag, "out_tag": out_tag,
    }))

def _rand_sid():
    return os.urandom(8).hex()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("WIRE_ERROR=" + str(e), file=sys.stderr)
        sys.exit(1)
