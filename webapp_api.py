# ====================== API ДЛЯ TELEGRAM MINI APP ======================
# Этот модуль поднимает REST API для веб-аппа (Telegram Mini App) на том же
# aiohttp-сервере, где работает вебхук бота.
#
# БЕЗОПАСНОСТЬ:
#   • Каждый запрос авторизуется через Telegram WebApp initData —
#     подпись HMAC-SHA256 проверяется секретом, выведенным из токена бота.
#     Подделать личность пользователя без токена бота невозможно.
#   • Веб-апп НЕ имеет прямого доступа к Supabase: раньше во фронтенде лежал
#     service_role ключ (полный доступ к БД любому посетителю) — теперь все
#     обращения к данным идут только через этот API с проверкой прав.
#   • Пользователь видит только свои данные; /api/admin/* доступны только
#     ADMIN_IDS.
#
# Модуль не импортирует bot.py (он запускается как __main__) — вместо этого
# bot.py вызывает setup_webapp_api(app, sys.modules[__name__]) и передаёт
# ссылку на собственный модуль. Все функции и глобальные объекты бота
# доступны через `B` (динамически, поэтому ленивые глобалы вроде
# B.supabase и B.TARIFFS всегда актуальны).

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid as uuid_lib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from html import escape as html_escape
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram.types import LabeledPrice

logger = logging.getLogger(__name__)

B: Any = None  # модуль bot.py, устанавливается в setup_webapp_api()

INIT_DATA_MAX_AGE = 24 * 3600  # сколько живёт подпись initData
ONLINE_THRESHOLD_MS = 60_000   # клиент «онлайн», если lastOnline не старше 60 сек

# ---- Провижининг нод «одной кнопкой» из дашборда ----
import os as _os
PROV_KEY        = _os.getenv("PROVISION_KEY", "/app/provisioning/prov_key")
PROV_SCRIPT     = _os.getenv("PROVISION_SCRIPT", "/app/provisioning/provision-node.sh")
PROV_WIRE       = _os.getenv("PROVISION_WIRE", "/app/provisioning/wire-exit.py")
# Эталоны для клонирования: entry ← Москва (вход), exit ← Франция (выход).
PROV_ENTRY_SRC  = _os.getenv("PROVISION_ENTRY_SOURCE_IP", "77.110.104.140")
PROV_EXIT_SRC   = _os.getenv("PROVISION_EXIT_SOURCE_IP", "38.180.226.39")
# Входная нода (Москва) — куда подвязываются новые выходы.
PROV_ENTRY_IP   = _os.getenv("PROVISION_ENTRY_IP", "77.110.104.140")
# Пароль от боевой базы панели — только через окружение, без значения по
# умолчанию в коде: у репозитория есть удалённая копия на GitHub, и однажды
# попавший в историю пароль оттуда уже не убрать.
PROV_ENTRY_DSN  = _os.getenv("PROVISION_ENTRY_DSN", "")
# Задания провижининга: job_id -> {status, log[], result, error, created}
_NODE_JOBS: Dict[str, dict] = {}


def _prov_available() -> Optional[str]:
    """None если провижининг доступен, иначе строка с причиной недоступности."""
    import shutil
    if not _os.path.isfile(PROV_KEY):
        return "нет ключа провижининга (provisioning/prov_key не смонтирован)"
    if not _os.path.isfile(PROV_SCRIPT):
        return "нет скрипта провижининга"
    if not shutil.which("ssh") or not shutil.which("sshpass"):
        return "в контейнере нет ssh/sshpass — пересоберите образ бота"
    if not PROV_ENTRY_DSN:
        return "не задан PROVISION_ENTRY_DSN — добавьте строку подключения к БД панели в .env"
    return None


def _online_emails_from_inbound(inbound: Optional[dict]) -> set:
    """Онлайн-клиенты инбаунда по полю lastOnline из clientStats.

    Форк/версия панели не отдаёт эндпоинт /onlines, зато в статистике
    каждого клиента есть lastOnline (мс). Считаем клиента онлайн, если он
    был активен за последнюю минуту."""
    if not inbound:
        return set()
    now_ms = int(time.time() * 1000)
    online = set()
    for c in inbound.get("clientStats") or []:
        last = c.get("lastOnline") or 0
        if last and now_ms - last <= ONLINE_THRESHOLD_MS:
            if c.get("email"):
                online.add(c["email"])
    return online

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
}

# ====================== ПРОВЕРКА ПОДПИСИ initData ======================
def verify_init_data(init_data: str, bot_token: str) -> Optional[Dict[str, Any]]:
    """Проверяет подпись Telegram WebApp initData.

    Возвращает распарсенные данные (включая user) или None, если подпись
    неверна или устарела. Алгоритм — официальный:
    secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token),
    hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string)).
    """
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = parsed.pop("hash", None)
        if not received_hash:
            return None
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calculated, received_hash):
            return None
        auth_date = int(parsed.get("auth_date", "0"))
        if time.time() - auth_date > INIT_DATA_MAX_AGE:
            return None
        user = json.loads(parsed.get("user", "{}"))
        if not user.get("id"):
            return None
        return {"user": user, "auth_date": auth_date}
    except Exception:
        return None


# ====================== ВСПОМОГАТЕЛЬНОЕ ======================
def ok(data: Any = None, **extra) -> web.Response:
    payload = {"ok": True, "data": data}
    payload.update(extra)
    return web.json_response(payload)


def err(message: str, status: int = 400) -> web.Response:
    return web.json_response({"ok": False, "error": message}, status=status)


def safe_server(s: dict) -> dict:
    """Публичное представление сервера: без URL панели, логина и пароля."""
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "flag": s.get("flag"),
        "is_active": s.get("is_active", True),
    }


def _flags_in(text: str) -> set:
    """Все флаг-эмодзи (пары regional indicator) в строке."""
    import re
    return set(re.findall(r"[\U0001F1E6-\U0001F1FF]{2}", text or ""))


def available_countries(servers: List[dict]) -> List[str]:
    """Список стран для запроса новых локаций БЕЗ тех, что уже подключены.

    Исключаем страну, если её флаг или название совпадает с активным
    сервером (напр. «🇫🇷 Франция», «🇫🇮 Финляндия» уже есть в VPN)."""
    taken_flags: set = set()
    taken_names: set = set()
    for s in servers:
        blob = f"{s.get('name', '')} {s.get('flag', '')}"
        taken_flags |= _flags_in(blob)
        for word in (s.get("name") or "").split():
            w = word.strip().lower()
            if len(w) >= 4 and not _flags_in(word):
                taken_names.add(w)
    out = []
    for c in B.COUNTRIES:
        flags = _flags_in(c)
        name_words = {w.strip().lower() for w in c.split() if not _flags_in(w)}
        if flags & taken_flags or name_words & taken_names:
            continue
        out.append(c)
    return out


def tariff_list() -> List[dict]:
    return sorted(
        (
            {"months": t["months"], "rub": t["rub"], "usd": t["usd"],
             "stars": t["stars"], "label": t["label"]}
            for t in B.TARIFFS.values()
        ),
        key=lambda x: x["months"],
    )


async def get_user_row(user_id: int) -> Optional[dict]:
    res = await B.supabase.table("users").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


async def notify_admins(text: str, reply_markup=None):
    for admin_id in B.ADMIN_IDS:
        try:
            await B.bot.send_message(admin_id, text, parse_mode="HTML", reply_markup=reply_markup)
        except Exception:
            pass


def months_label(months: float) -> str:
    if months == -1:
        return "бессрочно"
    t = B.TARIFFS.get(months)
    if t:
        return t["label"]
    return f"{months:g} мес"


def ics_token(sub_id: str) -> str:
    """HMAC-подпись для публичной ссылки на ICS-напоминание.

    Ссылку скачивает системный загрузчик устройства (без заголовка
    Authorization), поэтому доступ защищается подписью от токена бота:
    подобрать её, не зная BOT_TOKEN, нельзя."""
    return hmac.new(
        B.BOT_TOKEN.encode(), f"ics:{sub_id}".encode(), hashlib.sha256
    ).hexdigest()[:32]


def qr_token(sub_id: str) -> str:
    """HMAC-подпись публичной ссылки на PNG QR-кода подписки
    (скачивается загрузчиком Telegram без наших заголовков)."""
    return hmac.new(
        B.BOT_TOKEN.encode(), f"qr:{sub_id}".encode(), hashlib.sha256
    ).hexdigest()[:32]


_bot_username_cache: Optional[str] = None

async def get_bot_username() -> str:
    global _bot_username_cache
    if not _bot_username_cache:
        me = await B.bot.get_me()
        _bot_username_cache = me.username or ""
    return _bot_username_cache


async def build_invoice_link(data: dict, is_extend: bool) -> str:
    stars = int(data.get("stars", 0))
    label = months_label(data.get("months", 0))
    title = "Продление подписки Gigabyte" if is_extend else "Оплата подписки Gigabyte"
    description = (
        f"Продление на {label}. Стоимость: {stars} Stars."
        if is_extend else
        f"Подписка на {label}. Стоимость: {stars} Stars."
    )
    payload = (
        f"extend_{data['months']}_{data['rub']}"
        if is_extend else
        f"sub_{data['months']}_{data['rub']}"
    )
    return await B.bot.create_invoice_link(
        title=title,
        description=description,
        payload=payload,
        provider_token="",
        currency="XTR",
        prices=[LabeledPrice(label="Продление" if is_extend else "Подписка", amount=stars)],
    )


# ====================== MIDDLEWARE ======================
@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        return web.Response(status=204, headers=CORS_HEADERS)
    try:
        response = await handler(request)
    except web.HTTPException as ex:
        ex.headers.extend(CORS_HEADERS)
        raise
    for k, v in CORS_HEADERS.items():
        response.headers[k] = v
    # API-ответы не кешируем: Telegram WebView иначе показывает устаревшие
    # данные (напр. статус подписки не меняется до перезапуска приложения).
    if request.path.startswith("/api/") and not request.path.startswith("/api/public/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response


@web.middleware
async def auth_middleware(request: web.Request, handler):
    if not request.path.startswith("/api/"):
        return await handler(request)

    # Публичные эндпоинты (ICS-файлы напоминаний) защищены собственным
    # HMAC-токеном в query-параметрах — initData для них не нужен,
    # т.к. файл скачивает системный загрузчик без наших заголовков.
    if request.path.startswith("/api/public/"):
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as e:
            logger.exception(f"API public error {request.path}: {e}")
            return err("Внутренняя ошибка сервера", 500)

    auth = request.headers.get("Authorization", "")

    # Веб-дашборд: подписанный токен, выданный ботом администратору
    # (работает вне Telegram — в обычном браузере на компьютере).
    if auth.startswith("Bearer "):
        admin_id = B.verify_dashboard_token(auth[7:].strip())
        if not admin_id:
            return err("Не авторизован: токен дашборда неверен или истёк", 401)
        request["tg_user"] = {"id": admin_id, "first_name": "Admin"}
        request["user_id"] = admin_id
        await B.init_supabase()
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as e:
            logger.exception(f"API error {request.method} {request.path}: {e}")
            return err("Внутренняя ошибка сервера", 500)

    if not auth.startswith("tma "):
        return err("Не авторизован: нет initData", 401)
    verified = verify_init_data(auth[4:], B.BOT_TOKEN)
    if not verified:
        return err("Не авторизован: неверная или устаревшая подпись initData", 401)

    user = verified["user"]
    user_id = int(user["id"])
    if not B.is_admin(user_id) and not B.check_rate_limit(user_id):
        return err("Слишком много запросов. Подождите минуту.", 429)

    if request.path.startswith("/api/admin/") and not B.is_admin(user_id):
        return err("Нет прав", 403)

    request["tg_user"] = user
    request["user_id"] = user_id
    await B.init_supabase()
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except Exception as e:
        logger.exception(f"API error {request.method} {request.path}: {e}")
        return err("Внутренняя ошибка сервера", 500)


# ====================== ПОЛЬЗОВАТЕЛЬСКИЕ ЭНДПОИНТЫ ======================
async def api_bootstrap(request: web.Request) -> web.Response:
    user = request["tg_user"]
    user_id = request["user_id"]
    full_name = " ".join(filter(None, [user.get("first_name"), user.get("last_name")]))
    await B.ensure_user_exists_supabase(user_id, user.get("username"), full_name)

    if not B.TARIFFS:
        await B.load_tariffs()

    accepted = await B.has_accepted_terms(user_id)
    trial_used = await B.has_used_trial(user_id)
    servers = await B.load_servers_from_supabase()

    # Баллы и настройка напоминаний — устойчиво к отсутствию колонок.
    ref_points = 0
    reminders_enabled = True
    try:
        row = await B.supabase.table("users").select("ref_points, reminders_enabled").eq(
            "user_id", user_id).execute()
        if row.data:
            ref_points = int(row.data[0].get("ref_points") or 0)
            reminders_enabled = row.data[0].get("reminders_enabled") is not False
    except Exception:
        pass

    return ok({
        "user": {"id": user_id, "username": user.get("username"),
                 "first_name": user.get("first_name"), "last_name": user.get("last_name")},
        "is_admin": B.is_admin(user_id),
        "accepted_terms": accepted,
        "trial_used": trial_used,
        "tariffs": tariff_list(),
        "servers": [safe_server(s) for s in servers],
        "countries": available_countries(servers),
        "wallet": B.ARBITRUM_WALLET,
        "contracts": {"USDT": B.USDT_CONTRACT, "USDC": B.USDC_CONTRACT},
        "ref_points": ref_points,
        "reminders_enabled": reminders_enabled,
        "referral": {
            "points_signup": B.REF_POINTS_SIGNUP,
            "points_purchase": B.REF_POINTS_PURCHASE,
            "redeem_cost": B.REF_REDEEM_COST,
            "redeem_months": B.REF_REDEEM_MONTHS,
        },
    })


async def api_accept_terms(request: web.Request) -> web.Response:
    await B.set_accepted_terms(request["user_id"])
    return ok()


# Кэш «в каких странах состоит sub_id» по панели (одна ссылка может вести
# сразу в несколько стран — напр. Франция+Финляндия на входе Москвы).
_SUBID_COUNTRIES_CACHE: Dict[str, Any] = {}
_SUBID_CACHE_TTL = 45  # сек


async def _panel_subid_servers(panel_servers: List[dict]) -> Optional[Dict[str, set]]:
    """{sub_id: {server_id,...}} — в каких инбаундах (странах) панели состоит
    каждый sub_id. Читаем клиентов каждого инбаунда панели напрямую. Кэш 45с."""
    key = (panel_servers[0].get("panel_url") or "").rstrip("/")
    now = time.time()
    ent = _SUBID_COUNTRIES_CACHE.get(key)
    if ent and now - ent["ts"] < _SUBID_CACHE_TTL:
        return ent["map"]
    result: Dict[str, set] = {}
    xui = B.XUIApi(panel_servers[0])
    try:
        if not await xui.login():
            return None
        seen: Dict[Any, list] = {}
        for srv in panel_servers:
            ib = srv.get("inbound_id")
            if ib is None:
                continue
            if ib not in seen:
                seen[ib] = await xui.get_clients(ib)
            for c in seen[ib]:
                sid = c.get("subId")
                if sid:
                    result.setdefault(sid, set()).add(srv["id"])
    except Exception as e:
        logger.warning(f"countries lookup {key}: {e}")
        return None
    finally:
        await xui.close()
    _SUBID_COUNTRIES_CACHE[key] = {"ts": now, "map": result}
    return result


async def api_subscriptions(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    res = await B.supabase.table("subscriptions").select(
        "id, server_id, sub_id, expiry_date, status, email"
    ).eq("user_id", user_id).execute()
    servers = await B.load_servers_from_supabase()
    server_map = {s["id"]: s for s in servers}
    now_ms = int(time.time() * 1000)
    rows = res.data or []

    # Серверы по панели + панели, где есть подписки пользователя
    panels: Dict[str, List[dict]] = {}
    for s in servers:
        panels.setdefault((s.get("panel_url") or "").rstrip("/"), []).append(s)
    user_panels = {
        (server_map[r["server_id"]].get("panel_url") or "").rstrip("/")
        for r in rows if r.get("server_id") in server_map
    }

    # Живая карта sub_id → страны с каждой задействованной панели
    subid_servers: Dict[str, set] = {}
    for pu in user_panels:
        m = await _panel_subid_servers(panels.get(pu) or [])
        if not m:
            continue
        for sid, sset in m.items():
            subid_servers.setdefault(sid, set()).update(sset)

    # Одна ссылка (sub_id) = одна карточка со всеми странами
    groups: Dict[str, dict] = {}
    for s in rows:
        g = groups.setdefault(s["sub_id"], {"row": s, "server_ids": set()})
        g["server_ids"].add(s["server_id"])
        # берём как «основную» строку самую свежую по сроку
        if (s.get("expiry_date") or 0) > (g["row"].get("expiry_date") or 0):
            g["row"] = s

    subs = []
    for sid, g in groups.items():
        s = g["row"]
        cids = set(subid_servers.get(sid) or set()) | g["server_ids"]
        countries = [safe_server(server_map[c]) for c in cids if c in server_map]
        countries.sort(key=lambda c: (c or {}).get("name") or "")
        primary = server_map.get(s["server_id"]) or (
            server_map.get(sorted(cids)[0]) if cids else None)
        expiry = s.get("expiry_date") or 0
        is_active = s.get("status") == "active" and (expiry == 0 or expiry > now_ms)
        subs.append({
            "id": s["id"],
            "sub_id": sid,
            "server": safe_server(primary) if primary else {"id": s["server_id"], "name": "Сервер"},
            # Все страны, которые обслуживает эта ссылка (для отображения в аппе).
            "countries": countries or ([safe_server(primary)] if primary else []),
            "expiry_date": expiry,
            "status": "active" if is_active else "expired",
            "email": s.get("email"),
            "sub_link": B.generate_subscription_link(primary, sid) if primary else None,
            "ics_url": (
                f"/api/public/reminder.ics?sub_id={sid}&t={ics_token(sid)}"
                if is_active and expiry > 0 else None
            ),
            "qr_url": (
                f"/api/public/subqr.png?sub_id={sid}&t={qr_token(sid)}"
                if is_active and primary else None
            ),
        })
    subs.sort(key=lambda x: x["expiry_date"], reverse=True)
    return ok(subs)


async def api_public_reminder_ics(request: web.Request) -> web.Response:
    """Файл календаря (.ics) с напоминаниями об истечении подписки.

    Открывается системным календарём iPhone/Android/десктопа и создаёт
    событие с двумя будильниками: за 24 часа и за 1 час до отключения."""
    sub_id = request.query.get("sub_id", "")
    token = request.query.get("t", "")
    if not sub_id or len(sub_id) > 64 or not hmac.compare_digest(token, ics_token(sub_id)):
        return err("Неверная ссылка", 403)

    await B.init_supabase()
    res = await B.supabase.table("subscriptions").select("expiry_date, status, server_id").eq(
        "sub_id", sub_id).execute()
    if not res.data:
        return err("Подписка не найдена", 404)
    sub = res.data[0]
    expiry = sub.get("expiry_date") or 0
    if sub.get("status") != "active" or expiry <= 0:
        return err("Подписка не активна", 404)

    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == sub.get("server_id")), None)
    server_name = (server or {}).get("name", "Gigabyte")

    from datetime import timezone
    dt_start = datetime.fromtimestamp(expiry / 1000, tz=timezone.utc)
    dt_end = dt_start + timedelta(minutes=30)
    stamp = datetime.now(tz=timezone.utc)
    fmt = "%Y%m%dT%H%M%SZ"

    def esc_ics(text: str) -> str:
        return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")

    ics = "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gigabyte//Subscription Reminder//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:gigabyte-{sub_id}@gigabyte",
        f"DTSTAMP:{stamp.strftime(fmt)}",
        f"DTSTART:{dt_start.strftime(fmt)}",
        f"DTEND:{dt_end.strftime(fmt)}",
        f"SUMMARY:{esc_ics(f'⚡ Истекает подписка Gigabyte ({server_name})')}",
        f"DESCRIPTION:{esc_ics('Подписка отключится в это время. Продлите её заранее в приложении Gigabyte в Telegram.')}",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{esc_ics('Подписка Gigabyte истекает через 24 часа — продлите её в приложении')}",
        "TRIGGER:-P1D",
        "END:VALARM",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{esc_ics('Подписка Gigabyte истекает через 1 час!')}",
        "TRIGGER:-PT1H",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ])
    return web.Response(
        text=ics,
        content_type="text/calendar",
        charset="utf-8",
        headers={"Content-Disposition": 'attachment; filename="gigabyte-reminder.ics"'},
    )


async def api_payments(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    pending_res = await B.supabase.table("payments").select("*").eq("user_id", user_id).in_(
        "status", ["pending_crypto", "awaiting_hash", "pending_stars"]
    ).execute()
    # История — ВСЕ завершившиеся операции пользователя (оплаченные,
    # отменённые/просроченные, зависшие confirmed), не только completed.
    history_res = await B.supabase.table("payments").select("*").eq("user_id", user_id).not_.in_(
        "status", ["pending_crypto", "awaiting_hash", "pending_stars"]
    ).order("created_at", desc=True).limit(100).execute()

    def strip(p: dict) -> dict:
        return {
            "id": p["id"], "payment_uid": p.get("payment_uid"),
            "amount_rub": p.get("amount_rub"), "amount_usd": p.get("amount_usd"),
            "method": p.get("method"), "currency": p.get("currency"),
            "status": p.get("status"), "created_at": p.get("created_at"),
            "tx_hash": p.get("tx_hash"),
        }

    return ok({
        "pending": [strip(p) for p in (pending_res.data or [])],
        "history": [strip(p) for p in (history_res.data or [])],
    })


async def api_trial(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    body = await request.json()
    server_id = body.get("server_id")
    if not isinstance(server_id, int):
        return err("Не указан сервер")

    # Персистентная проверка: триал один раз на аккаунт навсегда (переживает
    # удаление аккаунта — иначе можно было удалиться и взять триал снова).
    if await B.has_used_trial(user_id):
        return err("Вы уже активировали пробный период")

    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == server_id), None)
    if not server:
        return err("Сервер не найден")

    payment_uid = B.generate_payment_uid("TRIAL")
    pay_res = await B.supabase.table("payments").insert({
        "payment_uid": payment_uid,
        "user_id": user_id,
        "amount_rub": 0,
        "method": "trial",
        "status": "completed",
        "created_at": datetime.now().isoformat(),
    }).execute()
    payment_id = pay_res.data[0]["id"]
    sub_link = await B.create_subscription(user_id, server, 0.233, 0, payment_id)
    if not sub_link:
        await B.supabase.table("payments").delete().eq("id", payment_id).execute()
        return err("Не удалось создать пробную подписку. Обратитесь в поддержку.", 500)
    return ok({"sub_link": sub_link})


async def api_purchase(request: web.Request) -> web.Response:
    """Создание заказа: покупка или продление, Stars или криптовалюта.

    Полностью совместимо с потоками бота: создаёт те же записи в payments и
    pending_confirmations, поэтому оплата Stars, начатая в веб-аппе,
    завершается штатным обработчиком successful_payment в боте.
    """
    user_id = request["user_id"]
    body = await request.json()
    kind = body.get("kind")            # buy | extend
    method = body.get("method")        # stars | crypto
    currency = body.get("currency")    # USDT | USDC (для crypto)
    try:
        months = float(body.get("months"))
    except (TypeError, ValueError):
        return err("Неверный тариф")

    if kind not in ("buy", "extend") or method not in ("stars", "crypto"):
        return err("Неверные параметры заказа")
    if not B.TARIFFS:
        await B.load_tariffs()
    tariff = B.TARIFFS.get(months)
    if not tariff:
        return err("Тариф не найден")

    servers = await B.load_servers_from_supabase()
    data: Dict[str, Any] = {
        "months": months, "rub": tariff["rub"],
        "usd": tariff["usd"], "stars": tariff["stars"],
    }

    if kind == "buy":
        server_id = body.get("server_id")
        server = next((s for s in servers if s["id"] == server_id), None)
        if not server:
            return err("Сервер не найден")
        data["server"] = server
        data["server_id"] = server_id
    else:
        sub_id = body.get("sub_id")
        sub_res = await B.supabase.table("subscriptions").select("user_id, server_id").eq(
            "sub_id", sub_id).eq("status", "active").execute()
        if not sub_res.data or sub_res.data[0]["user_id"] != user_id:
            return err("Подписка не найдена или не принадлежит вам")
        server = next((s for s in servers if s["id"] == sub_res.data[0]["server_id"]), None)
        if not server:
            return err("Сервер подписки не найден")
        data["server"] = server
        data["server_id"] = server["id"]
        data["sub_id"] = sub_id

    payment_uid = B.generate_payment_uid()

    if method == "stars":
        stars = int(data["stars"])
        if stars <= 0:
            return err("Сумма оплаты равна 0, попробуйте другой тариф")
        pay_res = await B.supabase.table("payments").insert({
            "payment_uid": payment_uid,
            "user_id": user_id,
            "amount_rub": data["rub"],
            "method": "stars",
            "status": "pending_stars",
            "created_at": datetime.now().isoformat(),
        }).execute()
        payment_id = pay_res.data[0]["id"]
        confirm_type = "extend_stars" if kind == "extend" else "stars"
        await B.supabase.table("pending_confirmations").upsert({
            "user_id": user_id,
            "payment_id": payment_id,
            "confirm_type": confirm_type,
            "data": json.dumps(data),
            "created_at": datetime.now().isoformat(),
        }).execute()
        invoice_link = await build_invoice_link(data, kind == "extend")
        return ok({"payment_id": payment_id, "invoice_link": invoice_link, "stars": stars})

    # method == crypto
    if currency not in ("USDT", "USDC"):
        return err("Неизвестная валюта")
    pay_res = await B.supabase.table("payments").insert({
        "payment_uid": payment_uid,
        "user_id": user_id,
        "amount_usd": data["usd"],
        "amount_rub": data["rub"],
        "method": "crypto",
        "currency": currency,
        "status": "pending_crypto",
        "created_at": datetime.now().isoformat(),
    }).execute()
    payment_id = pay_res.data[0]["id"]
    confirm_type = "extend_crypto" if kind == "extend" else "crypto"
    await B.supabase.table("pending_confirmations").upsert({
        "user_id": user_id,
        "payment_id": payment_id,
        "confirm_type": confirm_type,
        "data": json.dumps(data),
        "created_at": datetime.now().isoformat(),
    }).execute()
    return ok({
        "payment_id": payment_id,
        "wallet": B.ARBITRUM_WALLET,
        "contract": B.USDT_CONTRACT if currency == "USDT" else B.USDC_CONTRACT,
        "amount_usd": data["usd"],
        "amount_rub": data["rub"],
        "currency": currency,
        "network": "Arbitrum One",
    })


async def api_submit_hash(request: web.Request) -> web.Response:
    """Приём TXID и провижининг подписки — зеркало process_resend_hash из бота."""
    user_id = request["user_id"]
    payment_id_str = request.match_info["payment_id"]
    if not payment_id_str.isdigit():
        return err("Неверный идентификатор платежа")
    payment_id = int(payment_id_str)
    body = await request.json()
    tx_hash = (body.get("tx_hash") or "").strip()

    if not B.is_valid_tx_hash(tx_hash):
        return err("Неверный формат TXID: хеш начинается с 0x и содержит 64 hex-символа")

    pay = await B.supabase.table("payments").select("user_id, amount_usd, currency, status").eq("id", payment_id).execute()
    if not pay.data or pay.data[0]["user_id"] != user_id:
        return err("Платёж не найден", 404)
    if pay.data[0]["status"] not in ("pending_crypto", "awaiting_hash"):
        return err("Платёж уже обработан")

    dup = await B.supabase.table("payments").select("id").eq("tx_hash", tx_hash).execute()
    if dup.data:
        return err("Этот TXID уже использован для другого платежа")

    expected_usd = pay.data[0]["amount_usd"]
    currency = pay.data[0]["currency"]
    await B.supabase.table("payments").update({"status": "awaiting_hash"}).eq("id", payment_id).execute()

    # Меньше ретраев, чем в боте: HTTP-запрос не должен висеть минутами.
    # Если транзакция ещё не подтвердилась в сети — пользователь просто
    # нажмёт «Проверить ещё раз» через минуту, платёж остаётся awaiting_hash.
    success, reason = await B.verify_arbitrum_tx(tx_hash, currency, expected_usd, retries=3)
    if not success:
        return ok({"verified": False, "reason": reason})

    await B.supabase.table("payments").update({"tx_hash": tx_hash, "status": "confirmed"}).eq("id", payment_id).execute()

    conf = await B.supabase.table("pending_confirmations").select("confirm_type, data").eq("payment_id", payment_id).execute()
    if not conf.data:
        await B.supabase.table("payments").update({"status": "completed"}).eq("id", payment_id).execute()
        return ok({"verified": True, "warning": "Платёж подтверждён, но данные заказа не найдены. Обратитесь в поддержку."})

    confirm_type = conf.data[0]["confirm_type"]
    pay_data = json.loads(conf.data[0]["data"])

    if confirm_type == "extend_crypto":
        sub_id = pay_data.get("sub_id")
        months = pay_data.get("months")
        if not sub_id or not months:
            return err("Данные подписки не найдены", 500)
        sub_res = await B.supabase.table("subscriptions").select("expiry_date, user_id").eq(
            "sub_id", sub_id).eq("status", "active").execute()
        if not sub_res.data or sub_res.data[0]["user_id"] != user_id:
            return err("Подписка не найдена или не принадлежит вам", 404)
        new_expiry = sub_res.data[0]["expiry_date"] + int(months * 30) * 24 * 3600 * 1000
        await B.supabase.table("subscriptions").update({"expiry_date": new_expiry}).eq("sub_id", sub_id).execute()
        panel_updated = await B.extend_subscription_in_panel(sub_id, new_expiry)
        if not panel_updated:
            await notify_admins(
                f"⚠️ Не удалось обновить expiryTime в панели для подписки {sub_id} "
                f"(пользователь {user_id}, оплата через веб-апп)."
            )
        await B.supabase.table("payments").update({"status": "completed"}).eq("id", payment_id).execute()
        await B.supabase.table("pending_confirmations").delete().eq("payment_id", payment_id).execute()
        await B.award_referral_purchase(user_id, pay_data.get("rub") or 0, payment_id)
        return ok({"verified": True, "extended": True})

    sub_link = await B.create_subscription(user_id, pay_data["server"], pay_data["months"], pay_data["rub"], payment_id)
    if sub_link:
        return ok({"verified": True, "sub_link": sub_link})
    await notify_admins(
        f"🚨 <b>СБОЙ СОЗДАНИЯ ПОДПИСКИ ПОСЛЕ ОПЛАТЫ (веб-апп)</b>\n\n"
        f"Пользователь: <code>{user_id}</code>\n"
        f"Сумма: {pay_data.get('rub')} ₽\n"
        f"Транзакция: <code>{B.esc(tx_hash)}</code>"
    )
    return err("Оплата подтверждена, но подписку создать не удалось. Администратор уведомлён.", 500)


async def api_payment_invoice(request: web.Request) -> web.Response:
    """Повторная ссылка на оплату Stars для платежа в статусе pending_stars."""
    user_id = request["user_id"]
    payment_id_str = request.match_info["payment_id"]
    if not payment_id_str.isdigit():
        return err("Неверный идентификатор платежа")
    payment_id = int(payment_id_str)

    pay = await B.supabase.table("payments").select("user_id, status").eq("id", payment_id).execute()
    if not pay.data or pay.data[0]["user_id"] != user_id:
        return err("Платёж не найден", 404)
    if pay.data[0]["status"] != "pending_stars":
        return err("Платёж уже не ожидает оплаты Stars")

    conf = await B.supabase.table("pending_confirmations").select("confirm_type, data").eq("payment_id", payment_id).execute()
    if not conf.data:
        return err("Данные платежа не найдены", 404)
    data = json.loads(conf.data[0]["data"])
    if int(data.get("stars", 0)) <= 0:
        return err("Сумма оплаты равна 0")
    invoice_link = await build_invoice_link(data, conf.data[0]["confirm_type"] == "extend_stars")
    return ok({"invoice_link": invoice_link})


async def api_delete_payment(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    payment_id_str = request.match_info["payment_id"]
    if not payment_id_str.isdigit():
        return err("Неверный идентификатор платежа")
    payment_id = int(payment_id_str)
    pay = await B.supabase.table("payments").select("user_id, status").eq("id", payment_id).execute()
    if not pay.data or pay.data[0]["user_id"] != user_id:
        return err("Платёж не найден", 404)
    if pay.data[0]["status"] not in ("pending_crypto", "awaiting_hash", "pending_stars"):
        return err("Отменить можно только ожидающий платёж")

    # Строку НЕ удаляем: отменённая операция должна остаться и в базе, и в
    # истории пользователя. Раньше она стиралась насовсем — человек не мог
    # доказать, что вообще начинал оплату, а мы теряли след операции.
    await B.supabase.table("payments").update(
        {"status": "cancelled"}).eq("id", payment_id).execute()
    # Ожидание подтверждения снимаем — платёж больше не ждёт действий.
    await B.supabase.table("pending_confirmations").delete().eq("payment_id", payment_id).execute()
    return ok({"status": "cancelled"})


async def api_promo_activate(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    body = await request.json()
    raw_code = (body.get("code") or "").strip().upper()
    import re
    if not re.fullmatch(r"GIFT-[0-9A-F]{16}", raw_code):
        return err("Неверный формат промокода. Ожидается: GIFT-ABCD1234EFGH5678")

    key_res = await B.supabase.table("promo_keys").select("months, used").eq("code", raw_code).execute()
    if not key_res.data:
        return err("Неверный или несуществующий ключ")
    if key_res.data[0]["used"]:
        return err("Этот ключ уже был использован")
    months = key_res.data[0]["months"]

    servers = await B.load_servers_from_supabase()
    if not servers:
        return err("Нет доступных серверов", 500)
    server = servers[0]

    update_res = await B.supabase.table("promo_keys").update({
        "used": True, "used_by": user_id, "used_at": datetime.now().isoformat(),
    }).eq("code", raw_code).eq("used", False).execute()
    if not update_res.data:
        return err("Ключ уже был активирован")

    sub_link = await B.create_subscription(user_id, server, months, 0, None)
    if not sub_link:
        await B.supabase.table("promo_keys").update({
            "used": False, "used_by": None, "used_at": None,
        }).eq("code", raw_code).execute()
        return err("Ошибка активации ключа. Обратитесь в поддержку.", 500)
    return ok({"sub_link": sub_link, "label": months_label(months)})


async def api_tickets_get(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    tickets_res = await B.supabase.table("tickets").select("ticket_id, status, created_at").eq(
        "user_id", user_id).order("created_at", desc=True).limit(20).execute()
    tickets = tickets_res.data or []
    result = []
    for t in tickets:
        msgs = await B.supabase.table("ticket_messages").select(
            "sender_id, message_text, created_at, is_admin"
        ).eq("ticket_id", t["ticket_id"]).order("created_at").execute()
        result.append({**t, "messages": msgs.data or []})
    return ok(result)


async def api_tickets_create(request: web.Request) -> web.Response:
    user = request["tg_user"]
    user_id = request["user_id"]
    body = await request.json()
    text = B.sanitize_text(body.get("text") or "", 3000)
    if not text:
        return err("Опишите проблему текстом")
    ticket_id = B.generate_ticket_id()
    created_at = datetime.now().isoformat()
    await B.supabase.table("tickets").insert({
        "user_id": user_id, "status": "open",
        "created_at": created_at, "ticket_id": ticket_id,
    }).execute()
    await B.supabase.table("ticket_messages").insert({
        "ticket_id": ticket_id, "sender_id": user_id,
        "message_text": text, "created_at": created_at, "is_admin": False,
    }).execute()
    display = B.get_user_identifier(user_id, user.get("username"),
                                    " ".join(filter(None, [user.get("first_name"), user.get("last_name")])))
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✏️ Ответить", callback_data=f"ticket_reply_{ticket_id}"),
         InlineKeyboardButton(text="🔒 Закрыть", callback_data=f"ticket_close_{ticket_id}")]
    ])
    await notify_admins(
        f"🆕 Новый тикет <code>{ticket_id}</code> (из веб-аппа)\nОт: {display}\n\n{B.esc(text)}",
        reply_markup=kb,
    )
    return ok({"ticket_id": ticket_id})


async def api_ticket_message(request: web.Request) -> web.Response:
    user = request["tg_user"]
    user_id = request["user_id"]
    ticket_id = request.match_info["ticket_id"]
    body = await request.json()
    text = B.sanitize_text(body.get("text") or "", 3000)
    if not text:
        return err("Пустое сообщение")

    ticket = await B.supabase.table("tickets").select("user_id, status").eq("ticket_id", ticket_id).execute()
    if not ticket.data:
        return err("Тикет не найден", 404)
    if ticket.data[0]["status"] != "open":
        return err("Тикет уже закрыт")
    is_admin_sender = B.is_admin(user_id)
    if not is_admin_sender and ticket.data[0]["user_id"] != user_id:
        return err("Нет прав", 403)

    await B.supabase.table("ticket_messages").insert({
        "ticket_id": ticket_id, "sender_id": user_id,
        "message_text": text, "created_at": datetime.now().isoformat(),
        "is_admin": is_admin_sender,
    }).execute()

    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✏️ Ответить", callback_data=f"ticket_reply_{ticket_id}"),
         InlineKeyboardButton(text="🔒 Закрыть", callback_data=f"ticket_close_{ticket_id}")]
    ])
    if is_admin_sender:
        try:
            await B.bot.send_message(
                ticket.data[0]["user_id"],
                f"📬 <b>Ответ на тикет <code>{ticket_id}</code></b>\n\n{B.esc(text)}",
                parse_mode="HTML", reply_markup=kb,
            )
        except Exception:
            pass
    else:
        display = B.get_user_identifier(user_id, user.get("username"),
                                        " ".join(filter(None, [user.get("first_name"), user.get("last_name")])))
        await notify_admins(
            f"📬 <b>Новое сообщение в тикете <code>{ticket_id}</code></b>\nОт: {display}\n\n{B.esc(text)}",
            reply_markup=kb,
        )
    return ok()


async def api_ticket_close(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    ticket_id = request.match_info["ticket_id"]
    ticket = await B.supabase.table("tickets").select("user_id, status").eq("ticket_id", ticket_id).execute()
    if not ticket.data:
        return err("Тикет не найден", 404)
    if ticket.data[0]["status"] == "closed":
        return err("Тикет уже закрыт")
    if not B.is_admin(user_id) and ticket.data[0]["user_id"] != user_id:
        return err("Нет прав", 403)
    await B.supabase.table("tickets").update({"status": "closed"}).eq("ticket_id", ticket_id).execute()
    try:
        await B.bot.send_message(
            ticket.data[0]["user_id"],
            f"🔒 <b>Тикет <code>{ticket_id}</code> закрыт</b>\n\nСпасибо за обращение!",
            parse_mode="HTML",
        )
    except Exception:
        pass
    return ok()


async def api_country_request(request: web.Request) -> web.Response:
    user = request["tg_user"]
    user_id = request["user_id"]
    body = await request.json()
    country = B.sanitize_text(body.get("country") or "", 100)
    if not country:
        return err("Укажите страну")
    request_id = B.generate_request_id()
    await B.supabase.table("country_requests").insert({
        "user_id": user_id, "country": country, "status": "open",
        "created_at": datetime.now().isoformat(), "request_id": request_id,
    }).execute()
    display = B.get_user_identifier(user_id, user.get("username"),
                                    " ".join(filter(None, [user.get("first_name"), user.get("last_name")])))
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✏️ Ответить", callback_data=f"countryreply_{request_id}")]
    ])
    await notify_admins(
        f"🌍 <b>Запрос новой страны</b> (из веб-аппа)\nОт: {display}\n"
        f"🌎 Страна: {B.esc(country)}\n🆔 <code>{request_id}</code>",
        reply_markup=kb,
    )
    return ok({"request_id": request_id})


async def _purge_user_data(user_id: int) -> None:
    """Удаляет данные пользователя из БД (после отзыва доступа), но НАВСЕГДА
    сохраняет отметку об использованном триале, иначе можно удалить аккаунт и
    снова взять бесплатную неделю.

    Нюанс схемы: payments.user_id имеет FK на users с ON DELETE CASCADE —
    удаление строки users каскадно стирает и триал-платёж. Поэтому:
      • если применена таблица trial_claims (не зависит от users) — маркер
        уже там, спокойно удаляем users целиком;
      • если миграции ещё нет — оставляем «надгробие»: строку users с одним
        user_id (персональные данные обнуляем), чтобы триал-платёж-маркер не
        был удалён каскадом. Так защита работает даже до применения миграции.
    """
    used_trial = await B.has_used_trial(user_id)
    trial_persisted = await B._trial_table_available()  # trial_claims переживает hard-delete
    if used_trial:
        await B.mark_trial_used(user_id)  # продублировать в trial_claims, если она есть

    # payments: удаляем всё, КРОМЕ триал-маркера (фильтр по id в Python —
    # надёжнее, чем .neq() в supabase-py DELETE).
    try:
        pays = await B.supabase.table("payments").select("id, method").eq("user_id", user_id).execute()
        del_ids = [p["id"] for p in (pays.data or []) if (p.get("method") or "") != "trial"]
        if del_ids:
            await B.supabase.table("payments").delete().in_("id", del_ids).execute()
    except Exception as e:
        logger.warning(f"purge payments for {user_id}: {e}")

    for table in ("subscriptions", "tickets", "ticket_messages",
                  "country_requests", "pending_confirmations", "point_transactions"):
        try:
            await B.supabase.table(table).delete().eq("user_id", user_id).execute()
        except Exception as e:
            logger.warning(f"purge {table} for {user_id}: {e}")

    if used_trial and not trial_persisted:
        # Надгробие: сохраняем строку users (маркер), стираем персональные данные.
        try:
            await B.supabase.table("users").update({
                "username": None, "full_name": None, "referred_by": None,
                "ref_points": 0, "lang": None, "accepted_terms": False,
            }).eq("user_id", user_id).execute()
        except Exception as e:
            logger.warning(f"tombstone user {user_id}: {e}")
            await B.supabase.table("users").delete().eq("user_id", user_id).execute()
    else:
        # Триал зафиксирован в trial_claims (или триала не было) — удаляем полностью.
        try:
            await B.supabase.table("users").delete().eq("user_id", user_id).execute()
        except Exception as e:
            logger.warning(f"purge users for {user_id}: {e}")

    # Отвязываем тех, кого этот пользователь пригласил (реферер удалён).
    try:
        await B.supabase.table("users").update({"referred_by": None}).eq(
            "referred_by", user_id).execute()
    except Exception:
        pass


async def api_delete_account(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    if B.is_admin(user_id):
        return err("Администратор не может удалить себя")

    # Сначала гарантированно снимаем доступ (ссылка-подписка и VPN),
    # и только при полном успехе стираем данные. Если панель недоступна —
    # НЕ удаляем записи (иначе потеряем client_uuid и не сможем отозвать
    # доступ), уведомляем админа и просим повторить.
    result = await B.revoke_user_clients(user_id)
    if result["failures"]:
        details = "\n".join(
            f"• {f['server']}: <code>{B.esc(f['email'])}</code> ({B.esc(f['client_uuid'])})"
            for f in result["failures"]
        )
        await notify_admins(
            f"⚠️ <b>Не удалось отозвать доступ при удалении аккаунта</b>\n\n"
            f"🆔 <code>{user_id}</code>\nПроблемные клиенты (снимите вручную в панели):\n{details}"
        )
        return err(
            "Не удалось полностью отключить доступ (панель временно недоступна). "
            "Данные НЕ удалены. Попробуйте ещё раз через минуту.", 503)

    await _purge_user_data(user_id)
    await notify_admins(
        f"ℹ️ <b>Пользователь удалил аккаунт</b> (через веб-апп)\n\n"
        f"🆔 <code>{user_id}</code>\n📊 Отозвано подписок: {result['removed']}"
    )
    return ok({"deleted_subscriptions": result["removed"]})


# ====================== РЕФЕРАЛЬНАЯ ПРОГРАММА ======================
async def api_referral(request: web.Request) -> web.Response:
    """Сводка реферальной программы пользователя: ссылка, баллы, история."""
    user_id = request["user_id"]
    username = await get_bot_username()
    link = f"https://t.me/{username}?start=ref_{user_id}"

    points = 0
    invited_total = 0
    invited_paid = 0
    history: List[dict] = []
    schema_ok = await B.referral_schema_available()
    if schema_ok:
        try:
            row = await B.supabase.table("users").select("ref_points").eq("user_id", user_id).execute()
            points = int(row.data[0].get("ref_points") or 0) if row.data else 0
            inv = await B.supabase.table("users").select("user_id", count="exact").eq(
                "referred_by", user_id).execute()
            invited_total = inv.count or 0
            paid = await B.supabase.table("point_transactions").select("id", count="exact").eq(
                "user_id", user_id).eq("reason", "referral_purchase").execute()
            invited_paid = paid.count or 0
            tx = await B.supabase.table("point_transactions").select(
                "delta, reason, created_at").eq("user_id", user_id).order(
                "created_at", desc=True).limit(30).execute()
            history = tx.data or []
        except Exception as e:
            logger.warning(f"referral summary error: {e}")

    return ok({
        "available": schema_ok,
        "link": link,
        "points": points,
        "invited_total": invited_total,
        "invited_paid": invited_paid,
        "history": history,
        "points_signup": B.REF_POINTS_SIGNUP,
        "points_purchase": B.REF_POINTS_PURCHASE,
        "redeem_cost": B.REF_REDEEM_COST,
        "redeem_months": B.REF_REDEEM_MONTHS,
    })


async def api_referral_redeem(request: web.Request) -> web.Response:
    """Обмен баллов на VPN: продление активной подписки или новая подписка.

    Порядок «сначала списать, потом выдать, при сбое вернуть» исключает
    двойную выдачу при гонке запросов."""
    user_id = request["user_id"]
    if not await B.referral_schema_available():
        return err("Реферальная программа временно недоступна", 503)
    body = await request.json()
    sub_id = body.get("sub_id")
    server_id = body.get("server_id")
    cost = B.REF_REDEEM_COST
    months = B.REF_REDEEM_MONTHS

    # 1) Списание с оптимистичной блокировкой (guard по старому балансу).
    deducted = False
    for _ in range(3):
        row = await B.supabase.table("users").select("ref_points").eq("user_id", user_id).execute()
        current = int(row.data[0].get("ref_points") or 0) if row.data else 0
        if current < cost:
            return err(f"Недостаточно баллов: нужно {cost}, у вас {current}")
        upd = await B.supabase.table("users").update(
            {"ref_points": current - cost}
        ).eq("user_id", user_id).eq("ref_points", current).execute()
        if upd.data:
            deducted = True
            break
    if not deducted:
        return err("Не удалось списать баллы, попробуйте ещё раз", 409)

    async def refund():
        try:
            row2 = await B.supabase.table("users").select("ref_points").eq("user_id", user_id).execute()
            cur2 = int(row2.data[0].get("ref_points") or 0) if row2.data else 0
            await B.supabase.table("users").update({"ref_points": cur2 + cost}).eq("user_id", user_id).execute()
        except Exception:
            logger.error(f"КРИТИЧНО: не удалось вернуть {cost} баллов пользователю {user_id}")

    try:
        await B.supabase.table("point_transactions").insert({
            "user_id": user_id, "delta": -cost, "reason": "redeem",
        }).execute()
    except Exception:
        pass  # журнал не должен блокировать выдачу

    # 2) Выдача: продление своей активной подписки или создание новой.
    servers = await B.load_servers_from_supabase()
    try:
        if sub_id:
            sub_res = await B.supabase.table("subscriptions").select(
                "expiry_date, user_id").eq("sub_id", sub_id).eq("status", "active").execute()
            if not sub_res.data or sub_res.data[0]["user_id"] != user_id:
                await refund()
                return err("Подписка не найдена или не принадлежит вам", 404)
            new_expiry = sub_res.data[0]["expiry_date"] + months * 30 * 24 * 3600 * 1000
            await B.supabase.table("subscriptions").update(
                {"expiry_date": new_expiry}).eq("sub_id", sub_id).execute()
            if not await B.extend_subscription_in_panel(sub_id, new_expiry):
                await notify_admins(
                    f"⚠️ Обмен баллов: не удалось обновить expiryTime в панели "
                    f"для {sub_id} (пользователь {user_id})."
                )
            return ok({"redeemed": True, "extended": True, "months": months})

        server = next((s for s in servers if s["id"] == server_id), servers[0] if servers else None)
        if not server:
            await refund()
            return err("Нет доступных серверов", 500)
        sub_link = await B.create_subscription(user_id, server, months, 0, None)
        if not sub_link:
            await refund()
            return err("Не удалось создать подписку. Баллы возвращены.", 500)
        return ok({"redeemed": True, "extended": False, "months": months, "sub_link": sub_link})
    except web.HTTPException:
        raise
    except Exception as e:
        logger.exception(f"redeem error: {e}")
        await refund()
        return err("Ошибка обмена баллов. Баллы возвращены.", 500)


# ====================== НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ ======================
async def api_settings_reminders(request: web.Request) -> web.Response:
    """Вкл/выкл напоминаний об истечении подписки (шлёт бот в чат)."""
    user_id = request["user_id"]
    body = await request.json()
    enabled = bool(body.get("enabled"))
    try:
        await B.supabase.table("users").update(
            {"reminders_enabled": enabled}).eq("user_id", user_id).execute()
    except Exception:
        return err(
            "Настройка недоступна: примените миграцию БД "
            "(migrations/2026-07-17_referral_reminders_lang.sql)", 503)
    return ok({"enabled": enabled})


# ====================== ОТЗЫВЫ ======================
# Отзывы видны всем пользователям приложения, поэтому наружу отдаём только
# имя автора — ни username, ни идентификатор Telegram не публикуем.
# Оценка учитывается в среднем балле всегда, а текст показывается только
# после того, как человек его написал; администратор может убрать текст
# (эндпоинт ниже), при этом сама оценка остаётся в статистике.

REVIEW_TEXT_LIMIT = 500       # столько символов помещается в карточку
REVIEWS_PAGE = 50             # сколько отзывов с текстом отдаём на экран


def _review_author(user_row: Optional[dict]) -> str:
    """Публичное имя автора: только первое слово из имени."""
    if not user_row:
        return "Пользователь"
    full = (user_row.get("full_name") or "").strip()
    if full:
        return full.split()[0][:24]
    username = (user_row.get("username") or "").strip()
    if username:
        return username[:24]
    return "Пользователь"


async def _reviews_payload(user_id: int) -> dict:
    """Общая витрина отзывов: статистика, лента и собственный отзыв."""
    res = await B.supabase.table("reviews").select(
        "user_id, rating, text, rated_at").execute()
    rows = res.data or []

    rated = [r for r in rows if r.get("rating")]
    distribution = {n: 0 for n in range(1, 6)}
    for r in rated:
        n = int(r["rating"])
        if 1 <= n <= 5:
            distribution[n] += 1
    count = len(rated)
    average = round(sum(int(r["rating"]) for r in rated) / count, 1) if count else 0.0

    with_text = [r for r in rated if (r.get("text") or "").strip()]
    with_text.sort(key=lambda r: (r.get("rated_at") or ""), reverse=True)
    with_text = with_text[:REVIEWS_PAGE]

    # имена берём одним запросом только по тем, чей отзыв реально показываем
    names: Dict[int, dict] = {}
    if with_text:
        ids = [r["user_id"] for r in with_text]
        try:
            u = await B.supabase.table("users").select(
                "user_id, full_name, username").in_("user_id", ids).execute()
            names = {row["user_id"]: row for row in (u.data or [])}
        except Exception as e:
            logger.warning(f"reviews: не удалось получить имена авторов: {e}")

    mine = next((r for r in rows if r.get("user_id") == user_id), None)

    return {
        "average": average,
        "count": count,
        "distribution": distribution,
        "mine": {
            "rating": mine.get("rating") if mine else None,
            "text": (mine.get("text") or "") if mine else "",
            "rated_at": mine.get("rated_at") if mine else None,
        },
        "items": [{
            "id": str(r["user_id"]),
            "name": _review_author(names.get(r["user_id"])),
            "rating": int(r["rating"]),
            "text": (r.get("text") or "").strip()[:REVIEW_TEXT_LIMIT],
            "date": (r.get("rated_at") or "")[:10],
            "mine": r["user_id"] == user_id,
        } for r in with_text],
        "limit": REVIEW_TEXT_LIMIT,
    }


async def api_reviews_get(request: web.Request) -> web.Response:
    """Лента отзывов и средний балл. Видна всем пользователям приложения."""
    try:
        return ok(await _reviews_payload(request["user_id"]))
    except Exception as e:
        logger.warning(f"reviews: чтение недоступно: {e}")
        # Экран не должен падать из-за отзывов — отдаём пустую витрину.
        return ok({"average": 0.0, "count": 0, "distribution": {},
                   "mine": {"rating": None, "text": "", "rated_at": None},
                   "items": [], "limit": REVIEW_TEXT_LIMIT, "unavailable": True})


async def api_reviews_post(request: web.Request) -> web.Response:
    """Оставить или изменить свой отзыв. Один отзыв на пользователя."""
    user_id = request["user_id"]
    body = await request.json()

    try:
        rating = int(body.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return err("Оценка должна быть от 1 до 5")

    text = (body.get("text") or "").strip()[:REVIEW_TEXT_LIMIT]

    row = {
        "user_id": user_id,
        "rating": rating,
        "text": text or None,
        "rated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await B.supabase.table("reviews").upsert(row, on_conflict="user_id").execute()
    except Exception as e:
        logger.error(f"reviews: не удалось сохранить отзыв {user_id}: {e}")
        return err("Не удалось сохранить отзыв, попробуйте позже", 503)

    # Низкую оценку показываем администратору сразу — это сигнал разобраться
    if rating <= 2:
        preview = text or "без комментария"
        await notify_admins(
            f"⚠️ <b>Низкая оценка сервиса</b>\n\n"
            f"Пользователь: <code>{user_id}</code>\n"
            f"Оценка: {'⭐' * rating}\n"
            f"Комментарий: {html_escape(preview)}"
        )

    return ok(await _reviews_payload(user_id))


async def api_admin_review_hide(request: web.Request) -> web.Response:
    """Модерация: убрать текст отзыва, не трогая саму оценку.

    Отдельного флага в таблице нет, и он не нужен: без текста отзыв
    исчезает из ленты, но остаётся в среднем балле — накрутки не возникает."""
    target = request.match_info.get("user_id")
    try:
        await B.supabase.table("reviews").update({"text": None}).eq("user_id", int(target)).execute()
    except Exception as e:
        return err(f"Не удалось скрыть отзыв: {e}", 503)
    return ok({"hidden": True})


# ====================== QR-КОД ПОДПИСКИ ======================
async def api_public_sub_qr(request: web.Request) -> web.Response:
    """PNG QR-кода ссылки-подписки. Публичный (скачивает Telegram),
    защищён HMAC-токеном — как reminder.ics."""
    sub_id = request.query.get("sub_id", "")
    token = request.query.get("t", "")
    if not sub_id or len(sub_id) > 64 or not hmac.compare_digest(token, qr_token(sub_id)):
        return err("Неверная ссылка", 403)
    await B.init_supabase()
    res = await B.supabase.table("subscriptions").select("server_id, status").eq(
        "sub_id", sub_id).execute()
    if not res.data or res.data[0].get("status") != "active":
        return err("Подписка не найдена", 404)
    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == res.data[0]["server_id"]), None)
    if not server:
        return err("Сервер не найден", 404)
    png = B.generate_qr_png(B.generate_subscription_link(server, sub_id))
    return web.Response(
        body=png, content_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="gigabyte-vpn-qr.png"'},
    )


async def api_sub_qr_share(request: web.Request) -> web.Response:
    """Отправляет QR подписки в чат пользователя с ботом — оттуда его можно
    переслать любому контакту или сохранить в галерею."""
    user_id = request["user_id"]
    sub_id = request.match_info["sub_id"]
    res = await B.supabase.table("subscriptions").select("user_id, server_id, status").eq(
        "sub_id", sub_id).execute()
    if not res.data or res.data[0]["user_id"] != user_id:
        return err("Подписка не найдена", 404)
    if res.data[0].get("status") != "active":
        return err("Подписка не активна")
    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == res.data[0]["server_id"]), None)
    if not server:
        return err("Сервер не найден", 404)
    sub_link = B.generate_subscription_link(server, sub_id)
    png = B.generate_qr_png(sub_link)
    from aiogram.types import BufferedInputFile
    try:
        await B.bot.send_photo(
            user_id,
            BufferedInputFile(png, filename="gigabyte-vpn-qr.png"),
            caption=(
                "📲 <b>QR-код вашей подписки Gigabyte</b>\n\n"
                "Отсканируйте его в VPN-приложении на другом устройстве "
                "или перешлите это сообщение.\n\n"
                f"🔗 Ссылка-подписка:\n<code>{B.esc(sub_link)}</code>"
            ),
            parse_mode="HTML",
        )
    except Exception as e:
        logger.warning(f"qr share failed for {user_id}: {e}")
        return err("Не удалось отправить QR в чат. Откройте чат с ботом и попробуйте снова.", 500)
    return ok({"sent": True})


# ====================== АДМИН-ЭНДПОИНТЫ ======================
async def api_admin_stats(request: web.Request) -> web.Response:
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    users_cnt = await B.supabase.table("users").select("*", count="exact").execute()
    new_today = await B.supabase.table("users").select("*", count="exact").gte("created_at", today_start).execute()
    new_week = await B.supabase.table("users").select("*", count="exact").gte("created_at", week_ago).execute()
    new_month = await B.supabase.table("users").select("*", count="exact").gte("created_at", month_ago).execute()

    completed = await B.fetch_all_supabase_rows("payments", "amount_rub, user_id, method, created_at, status")
    completed = [p for p in completed if p.get("status") == "completed"]

    total_rev = sum((p["amount_rub"] or 0) for p in completed)
    rev_today = sum((p["amount_rub"] or 0) for p in completed if (p.get("created_at") or "") >= today_start)
    rev_week = sum((p["amount_rub"] or 0) for p in completed if (p.get("created_at") or "") >= week_ago)
    rev_month = sum((p["amount_rub"] or 0) for p in completed if (p.get("created_at") or "") >= month_ago)
    paying_users = {p["user_id"] for p in completed if (p["amount_rub"] or 0) > 0}
    avg_check = (total_rev / len(completed)) if completed else 0
    arpu = (total_rev / len(paying_users)) if paying_users else 0
    conversion = (len(paying_users) / users_cnt.count * 100) if users_cnt.count else 0

    payment_counts: Dict[Any, int] = {}
    for p in completed:
        if (p["amount_rub"] or 0) > 0:
            payment_counts[p["user_id"]] = payment_counts.get(p["user_id"], 0) + 1
    renewed = sum(1 for c in payment_counts.values() if c > 1)
    conversion_renewed = (renewed / users_cnt.count * 100) if users_cnt.count else 0

    methods: Dict[str, Dict[str, float]] = {}
    for p in completed:
        m = p.get("method") or "unknown"
        entry = methods.setdefault(m, {"count": 0, "sum": 0.0})
        entry["count"] += 1
        entry["sum"] += (p["amount_rub"] or 0)

    active_subs = await B.fetch_all_supabase_rows("subscriptions", "server_id, expiry_date, status")
    active_subs = [s for s in active_subs if s.get("status") == "active"]
    now_ms = int(now.timestamp() * 1000)
    week_ms = 7 * 24 * 3600 * 1000
    expiring = sum(1 for s in active_subs if now_ms <= (s.get("expiry_date") or 0) <= now_ms + week_ms)

    servers = await B.load_servers_from_supabase()
    per_server: Dict[int, int] = {}
    for s in active_subs:
        per_server[s["server_id"]] = per_server.get(s["server_id"], 0) + 1
    top_servers = sorted(
        ({"name": srv["name"], "count": per_server.get(srv["id"], 0)} for srv in servers),
        key=lambda x: -x["count"],
    )

    pending_cnt = await B.supabase.table("payments").select("*", count="exact").in_(
        "status", ["pending_crypto", "awaiting_hash", "pending_stars"]).execute()
    tickets_cnt = await B.supabase.table("tickets").select("*", count="exact").eq("status", "open").execute()
    trial_cnt = await B.supabase.table("payments").select("*", count="exact").eq("method", "trial").execute()

    recent = sorted(completed, key=lambda p: p.get("created_at") or "", reverse=True)[:8]

    # Реферальная программа: сколько баллов роздано/потрачено, топ рефереров.
    referral = {"available": False, "points_issued": 0, "points_redeemed": 0,
                "referred_users": 0, "top": []}
    if await B.referral_schema_available():
        try:
            txs = await B.fetch_all_supabase_rows("point_transactions", "user_id, delta, reason")
            referral["available"] = True
            referral["points_issued"] = sum(t["delta"] for t in txs if t["delta"] > 0)
            referral["points_redeemed"] = -sum(t["delta"] for t in txs if t["delta"] < 0)
            ref_users = await B.supabase.table("users").select("user_id", count="exact").not_.is_(
                "referred_by", "null").execute()
            referral["referred_users"] = ref_users.count or 0
            by_user: Dict[int, int] = {}
            for t in txs:
                if t["delta"] > 0:
                    by_user[t["user_id"]] = by_user.get(t["user_id"], 0) + t["delta"]
            top_ids = sorted(by_user, key=lambda u: -by_user[u])[:5]
            if top_ids:
                urows = await B.supabase.table("users").select("user_id, username, full_name").in_(
                    "user_id", top_ids).execute()
                umap = {u["user_id"]: u for u in (urows.data or [])}
                referral["top"] = [
                    {"user_id": uid, "points": by_user[uid],
                     "username": umap.get(uid, {}).get("username"),
                     "full_name": umap.get(uid, {}).get("full_name")}
                    for uid in top_ids
                ]
        except Exception as e:
            logger.warning(f"admin referral stats error: {e}")

    # Дневные ряды за последние 14 дней — для графиков дашборда
    day_map: Dict[str, Dict[str, Any]] = {}
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).date().isoformat()
        day_map[d] = {"date": d, "revenue": 0.0, "payments": 0, "new_users": 0}
    for p in completed:
        key = (p.get("created_at") or "")[:10]
        if key in day_map:
            day_map[key]["revenue"] += (p["amount_rub"] or 0)
            day_map[key]["payments"] += 1
    users_rows = await B.fetch_all_supabase_rows("users", "user_id, created_at")
    for u in users_rows:
        key = (u.get("created_at") or "")[:10]
        if key in day_map:
            day_map[key]["new_users"] += 1
    daily = list(day_map.values())

    return ok({
        "daily": daily,
        "users": {"total": users_cnt.count, "new_today": new_today.count,
                  "new_week": new_week.count, "new_month": new_month.count},
        "subscriptions": {"active": len(active_subs), "expiring_week": expiring, "trials": trial_cnt.count},
        "finance": {"total": total_rev, "month": rev_month, "week": rev_week, "today": rev_today,
                    "avg_check": round(avg_check), "arpu": round(arpu),
                    "conversion_paid": round(conversion, 1), "conversion_renewed": round(conversion_renewed, 1)},
        "methods": methods,
        "top_servers": top_servers[:10],
        "pending_payments": pending_cnt.count,
        "open_tickets": tickets_cnt.count,
        "recent_payments": recent,
        "referral": referral,
    })


async def api_admin_rates(request: web.Request) -> web.Response:
    await B.price_manager.update_rates()
    return ok({
        "usd_cbr": B.price_manager.usd_cbr,
        "usd_market": B.price_manager.usd_market,
        "usd_effective": B.price_manager.usd_effective,
        "usdt_p2p": B.price_manager.usdt_p2p,
        "stars_usd_rate": B.price_manager.stars_usd_rate,
        "updated_at": datetime.now().isoformat(),
    })


async def api_admin_stars_balance(request: web.Request) -> web.Response:
    bal = await B.get_stars_balance(B.bot)
    stars_payments = await B.supabase.table("payments").select("amount_rub, created_at").eq(
        "method", "stars").eq("status", "completed").execute()
    db_payments = stars_payments.data or []
    month_ago = (datetime.now() - timedelta(days=30)).isoformat()
    db_30 = [p for p in db_payments if (p.get("created_at") or "") >= month_ago]
    return ok({
        **bal,
        "db_count": len(db_payments),
        "db_rub_total": sum((p["amount_rub"] or 0) for p in db_payments),
        "db_count_30": len(db_30),
        "db_rub_30": sum((p["amount_rub"] or 0) for p in db_30),
    })


async def api_admin_tariffs_get(request: web.Request) -> web.Response:
    await B.load_tariffs()
    return ok(tariff_list())


async def api_admin_tariffs_post(request: web.Request) -> web.Response:
    body = await request.json()
    mode = body.get("mode")
    if mode == "percent":
        try:
            percent = int(body.get("value"))
        except (TypeError, ValueError):
            return err("Неверный процент")
        if not (1 <= percent <= 1000):
            return err("Процент должен быть от 1 до 1000")
        current = await B.supabase.table("tariffs").select("months, rub").execute()
        for t in current.data or []:
            new_rub = round(t["rub"] * (1 + percent / 100))
            await B.supabase.table("tariffs").update({"rub": new_rub}).eq("months", t["months"]).execute()
    elif mode == "base":
        try:
            price_1m = float(body.get("value"))
        except (TypeError, ValueError):
            return err("Неверная цена")
        if not (10 <= price_1m <= 100000):
            return err("Цена должна быть от 10 до 100 000 ₽")
        for months, rub in [(1, round(price_1m)), (3, round(price_1m * 2.5)),
                            (6, round(price_1m * 4.5)), (12, round(price_1m * 8.5))]:
            existing = await B.supabase.table("tariffs").select("months").eq("months", months).execute()
            if existing.data:
                await B.supabase.table("tariffs").update({"rub": rub}).eq("months", months).execute()
            else:
                await B.supabase.table("tariffs").insert({"months": months, "rub": rub}).execute()
    elif mode == "list":
        items = body.get("items") or []
        for item in items:
            try:
                months = float(item["months"])
                rub = float(item["rub"])
            except (KeyError, TypeError, ValueError):
                continue
            if not (10 <= rub <= 100000):
                continue
            existing = await B.supabase.table("tariffs").select("months").eq("months", months).execute()
            if existing.data:
                await B.supabase.table("tariffs").update({"rub": rub}).eq("months", months).execute()
            else:
                await B.supabase.table("tariffs").insert({"months": months, "rub": rub}).execute()
    else:
        return err("Неизвестный режим")
    await B.load_tariffs()
    return ok(tariff_list())


async def api_admin_promo_get(request: web.Request) -> web.Response:
    res = await B.supabase.table("promo_keys").select(
        "code, months, used, used_by, created_at"
    ).order("created_at", desc=True).limit(50).execute()
    keys = []
    for k in res.data or []:
        keys.append({**k, "label": months_label(k["months"])})
    return ok(keys)


async def api_admin_promo_post(request: web.Request) -> web.Response:
    body = await request.json()
    raw = body.get("months")
    if raw == "unlimited" or raw == -1:
        months = -1
    else:
        try:
            months = float(raw)
        except (TypeError, ValueError):
            return err("Неверный срок")
    code = B.generate_promo_code()
    await B.supabase.table("promo_keys").insert({
        "code": code, "months": months, "created_by": request["user_id"],
    }).execute()
    return ok({"code": code, "months": months, "label": months_label(months)})


async def api_admin_tickets(request: web.Request) -> web.Response:
    tickets = await B.supabase.table("tickets").select("ticket_id, user_id, status, created_at").order(
        "created_at", desc=True).limit(50).execute()
    result = []
    user_ids = list({t["user_id"] for t in (tickets.data or [])})
    users_map: Dict[int, dict] = {}
    if user_ids:
        users_res = await B.supabase.table("users").select("user_id, username, full_name").in_("user_id", user_ids).execute()
        users_map = {u["user_id"]: u for u in (users_res.data or [])}
    for t in tickets.data or []:
        msgs = await B.supabase.table("ticket_messages").select(
            "sender_id, message_text, created_at, is_admin"
        ).eq("ticket_id", t["ticket_id"]).order("created_at").execute()
        u = users_map.get(t["user_id"], {})
        result.append({
            **t,
            "username": u.get("username"),
            "full_name": u.get("full_name"),
            "messages": msgs.data or [],
        })
    return ok(result)


async def api_admin_country_requests(request: web.Request) -> web.Response:
    reqs = await B.supabase.table("country_requests").select(
        "request_id, user_id, country, status, created_at"
    ).eq("status", "open").order("created_at", desc=True).limit(50).execute()
    return ok(reqs.data or [])


async def api_admin_country_reply(request: web.Request) -> web.Response:
    request_id = request.match_info["request_id"]
    body = await request.json()
    text = B.sanitize_text(body.get("text") or "", 2000)
    if not text:
        return err("Пустой ответ")
    req = await B.supabase.table("country_requests").select("user_id, status").eq("request_id", request_id).execute()
    if not req.data or req.data[0]["status"] != "open":
        return err("Запрос уже обработан или не найден", 404)
    await B.supabase.table("country_requests").update({"status": "closed"}).eq("request_id", request_id).execute()
    try:
        await B.bot.send_message(
            req.data[0]["user_id"],
            f"📬 <b>Ответ на запрос новой страны</b>\n\n{B.esc(text)}",
            parse_mode="HTML",
        )
    except Exception:
        pass
    return ok()


async def api_admin_broadcast(request: web.Request) -> web.Response:
    body = await request.json()
    text = B.sanitize_text(body.get("text") or "", 4000)
    if not text:
        return err("Пустой текст рассылки")
    users = await B.fetch_all_supabase_rows("users", "user_id")
    admin_id = request["user_id"]

    async def do_broadcast():
        count = 0
        for u in users:
            try:
                await B.bot.send_message(u["user_id"], text, parse_mode="HTML")
                count += 1
                await asyncio.sleep(0.05)
            except Exception:
                pass
        try:
            await B.bot.send_message(
                admin_id,
                f"✅ <b>Рассылка из веб-аппа завершена</b>\n\n📨 Отправлено: {count} пользователям",
                parse_mode="HTML",
            )
        except Exception:
            pass

    asyncio.create_task(do_broadcast())
    return ok({"queued": len(users)})


async def api_admin_create_sub(request: web.Request) -> web.Response:
    body = await request.json()
    target = body.get("user_id")
    server_id = body.get("server_id")
    try:
        months = float(body.get("months"))
    except (TypeError, ValueError):
        return err("Неверный срок")
    if not B.is_valid_user_id(str(target)):
        return err("Неверный Telegram ID")
    target = int(target)
    user = await B.supabase.table("users").select("user_id").eq("user_id", target).execute()
    if not user.data:
        return err("Пользователь не найден в базе")
    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == server_id), None)
    if not server:
        return err("Сервер не найден")
    sub_link = await B.create_subscription(target, server, months, 0, None)
    if not sub_link:
        return err("Ошибка создания подписки", 500)
    try:
        await B.bot.send_message(
            target,
            f"🎉 <b>Администратор выдал вам подписку!</b>\n\n{B.generate_config_for_connection(sub_link)}",
            parse_mode="HTML",
        )
    except Exception:
        pass
    return ok({"sub_link": sub_link})


async def api_admin_sync(request: web.Request) -> web.Response:
    stats = await B.sync_all_servers_with_supabase()
    return ok(stats)


async def api_admin_import(request: web.Request) -> web.Response:
    stats = await B.force_import_clients_from_panel(None)
    return ok(stats)


# Поля сервера, которые админ может создавать/менять из веб-аппа
SERVER_EDITABLE_FIELDS = (
    "name", "flag", "ip", "server_ip", "panel_url", "panel_login",
    "panel_pass", "inbound_id", "sub_port", "sub_path", "is_active",
)

def _admin_server_view(s: dict) -> dict:
    """Представление сервера для админки: всё, кроме пароля панели."""
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "flag": s.get("flag"),
        "ip": s.get("ip") or s.get("server_ip"),
        "is_active": s.get("is_active", True),
        "inbound_id": s.get("inbound_id"),
        "panel_url": s.get("panel_url"),
        "panel_login": s.get("panel_login"),
        "has_password": bool(s.get("panel_pass")),
        "sub_port": s.get("sub_port"),
        "sub_path": s.get("sub_path"),
    }


async def _existing_server_columns() -> Optional[set]:
    """Набор реальных колонок таблицы servers (по существующей строке).
    Позволяет не писать несуществующие поля и не ловить ошибку схемы.
    None — если таблица пуста (тогда фильтрацию не применяем)."""
    try:
        res = await B.supabase.table("servers").select("*").limit(1).execute()
        if res.data:
            return set(res.data[0].keys())
    except Exception:
        pass
    return None


def _filter_server_payload(body: dict, columns: Optional[set], *, for_update: bool) -> dict:
    out = {}
    for k in SERVER_EDITABLE_FIELDS:
        if k not in body:
            continue
        if k == "panel_pass" and not body[k]:  # пустой пароль = не менять
            continue
        if not for_update and body[k] is None:
            continue
        if columns is not None and k not in columns:
            continue  # такой колонки в таблице нет — пропускаем
        out[k] = body[k]
    return out


async def api_admin_server_create(request: web.Request) -> web.Response:
    body = await request.json()
    columns = await _existing_server_columns()
    row = _filter_server_payload(body, columns, for_update=False)
    if not row.get("name") or not row.get("panel_url"):
        return err("Минимум нужны название и URL панели")
    try:
        res = await B.supabase.table("servers").insert(row).execute()
    except Exception as e:
        return err(f"Ошибка БД: {e}", 500)
    return ok(_admin_server_view(res.data[0]))


async def api_admin_server_update(request: web.Request) -> web.Response:
    sid = request.match_info["server_id"]
    if not sid.isdigit():
        return err("Неверный ID")
    body = await request.json()
    columns = await _existing_server_columns()
    updates = _filter_server_payload(body, columns, for_update=True)
    if not updates:
        return err("Нет изменений")
    try:
        res = await B.supabase.table("servers").update(updates).eq("id", int(sid)).execute()
    except Exception as e:
        return err(f"Ошибка БД: {e}", 500)
    if not res.data:
        return err("Сервер не найден", 404)
    return ok(_admin_server_view(res.data[0]))


async def api_admin_server_delete(request: web.Request) -> web.Response:
    sid = request.match_info["server_id"]
    if not sid.isdigit():
        return err("Неверный ID")
    subs = await B.supabase.table("subscriptions").select("id", count="exact").eq(
        "server_id", int(sid)).eq("status", "active").execute()
    if subs.count:
        return err(f"На сервере {subs.count} активных подписок — сначала перенесите или удалите их")
    await B.supabase.table("servers").delete().eq("id", int(sid)).execute()
    return ok()


async def api_admin_server_test(request: web.Request) -> web.Response:
    """Проверка подключения к панели: логин + список инбаундов,
    чтобы админ выбрал правильный inbound_id прямо из веб-аппа."""
    sid = request.match_info["server_id"]
    if not sid.isdigit():
        return err("Неверный ID")
    res = await B.supabase.table("servers").select("*").eq("id", int(sid)).execute()
    if not res.data:
        return err("Сервер не найден", 404)
    server = res.data[0]
    if not server.get("panel_url"):
        return err("У сервера не задан URL панели")

    xui = B.XUIApi(server)
    try:
        if not await xui.login():
            return ok({"ok": False, "error": "Не удалось войти в панель: проверьте URL, логин и пароль"})
        inbounds = await xui.list_inbounds()
        return ok({
            "ok": True,
            "inbounds": [
                {
                    "id": ib.get("id"),
                    "remark": ib.get("remark"),
                    "port": ib.get("port"),
                    "protocol": ib.get("protocol"),
                    "enable": ib.get("enable"),
                    "clients": len(ib.get("clientStats") or []),
                }
                for ib in inbounds
            ],
        })
    finally:
        await xui.close()


async def api_admin_panel_status(request: web.Request) -> web.Response:
    """Живой статус всех панелей: онлайн-клиенты, трафик, инбаунды.
    Данные берутся напрямую из 3x-ui в момент запроса."""
    servers = await B.load_servers_from_supabase()
    result = []
    totals = {"up": 0, "down": 0, "online": 0, "clients": 0}
    seen_panels: Dict[str, dict] = {}

    for server in servers:
        key = (server.get("panel_url") or "").rstrip("/")
        cached = seen_panels.get(key)
        if cached is None:
            xui = B.XUIApi(server)
            panel: Dict[str, Any] = {"reachable": False, "inbounds": []}
            try:
                if await xui.login():
                    panel["reachable"] = True
                    panel["inbounds"] = await xui.list_inbounds()
            except Exception as e:
                logger.warning(f"panel-status {server.get('name')}: {e}")
            finally:
                await xui.close()
            seen_panels[key] = panel
            cached = panel

        inbound = next((ib for ib in cached["inbounds"] if ib.get("id") == server.get("inbound_id")), None)
        stats = (inbound or {}).get("clientStats") or []
        online_here = list(_online_emails_from_inbound(inbound))
        up = sum((c.get("up") or 0) for c in stats)
        down = sum((c.get("down") or 0) for c in stats)

        totals["up"] += up
        totals["down"] += down
        totals["online"] += len(online_here)
        totals["clients"] += len(stats)

        result.append({
            "id": server.get("id"),
            "name": server.get("name"),
            "flag": server.get("flag"),
            "reachable": cached["reachable"],
            "inbound_found": inbound is not None,
            "inbound_id": server.get("inbound_id"),
            "port": (inbound or {}).get("port"),
            "clients": len(stats),
            "online": len(online_here),
            "online_emails": online_here[:20],
            "up": up,
            "down": down,
        })

    return ok({"servers": result, "totals": totals})


async def api_admin_servers_health(request: web.Request) -> web.Response:
    """Здоровье «железа» всех нод: CPU, RAM, диск, аптайм, сеть, версия xray.

    Данные берутся из панели каждой ноды (/server/status) — агенты не нужны.
    Панели кешируются по URL: France/Finland живут на одной панели входа."""
    servers = await B.load_servers_from_supabase()
    seen: Dict[str, Any] = {}
    result = []
    for s in servers:
        key = (s.get("panel_url") or "").rstrip("/")
        if key in seen:
            st, inbounds, reachable = seen[key]
        else:
            xui = B.XUIApi(s)
            st, inbounds, reachable = None, [], False
            try:
                if await xui.login():
                    reachable = True
                    inbounds = await xui.list_inbounds()
                    st = await xui.server_status()  # метрики хоста, если панель отдаёт
            except Exception as e:
                logger.warning(f"health {s.get('name')}: {e}")
            finally:
                await xui.close()
            seen[key] = (st, inbounds, reachable)

        # Данные по нашему инбаунду — работают всегда (проверено)
        ib = next((i for i in inbounds if i.get("id") == s.get("inbound_id")), None)
        stats = (ib or {}).get("clientStats") or []
        online = len(_online_emails_from_inbound(ib))
        up = sum((c.get("up") or 0) for c in stats)
        down = sum((c.get("down") or 0) for c in stats)

        base = {
            "id": s.get("id"),
            "name": s.get("name"),
            "online": reachable,
            "inbound_found": ib is not None,
            "port": (ib or {}).get("port"),
            "clients": len(stats),
            "clients_online": online,
            "traffic_up": up,
            "traffic_down": down,
        }

        if not st:
            # Метрик хоста нет — отдаём то, что есть (панель + инбаунд)
            result.append(base)
            continue

        def num(v, default=0):
            try:
                return float(v)
            except (TypeError, ValueError):
                return default

        cpu = st.get("cpu")
        mem = st.get("mem") or {}
        disk = st.get("disk") or {}
        net_io = st.get("netIO") or {}
        net_tr = st.get("netTraffic") or {}
        xray = st.get("xray") or {}
        loads = st.get("loads") or []

        result.append({
            **base,
            "cpu_percent": round(num(cpu), 1),
            "cpu_cores": st.get("cpuCores") or st.get("logicalPro"),
            "load": [round(num(x), 2) for x in loads[:3]],
            "mem_used": num(mem.get("current")),
            "mem_total": num(mem.get("total")),
            "disk_used": num(disk.get("current")),
            "disk_total": num(disk.get("total")),
            "uptime": int(num(st.get("uptime"))),
            "net_up_speed": num(net_io.get("up")),
            "net_down_speed": num(net_io.get("down")),
            "net_sent": num(net_tr.get("sent")),
            "net_recv": num(net_tr.get("recv")),
            "xray_state": xray.get("state"),
            "xray_version": xray.get("version"),
            "tcp_count": st.get("tcpCount"),
            "udp_count": st.get("udpCount"),
        })
    return ok(result)


async def api_sub_stats(request: web.Request) -> web.Response:
    """Трафик и онлайн-статус подписки пользователя — из панели 3x-ui."""
    user_id = request["user_id"]
    sub_id = request.match_info["sub_id"]
    res = await B.supabase.table("subscriptions").select("user_id, server_id, email").eq(
        "sub_id", sub_id).execute()
    if not res.data or res.data[0]["user_id"] != user_id:
        return err("Подписка не найдена", 404)
    sub = res.data[0]
    servers = await B.load_servers_from_supabase()
    server = next((s for s in servers if s["id"] == sub["server_id"]), None)
    if not server:
        return err("Сервер не найден", 404)

    xui = B.XUIApi(server)
    try:
        if not await xui.login():
            return ok({"available": False})
        inbounds = await xui.list_inbounds()
        inbound = next((ib for ib in inbounds if ib.get("id") == server.get("inbound_id")), None)
        stats = (inbound or {}).get("clientStats") or []
        me = next((c for c in stats if c.get("email") == sub.get("email")), None)
        online_emails = _online_emails_from_inbound(inbound)
        return ok({
            "available": me is not None,
            "up": (me or {}).get("up") or 0,
            "down": (me or {}).get("down") or 0,
            "online": sub.get("email") in online_emails,
        })
    finally:
        await xui.close()


async def api_admin_servers(request: web.Request) -> web.Response:
    # ИСПРАВЛЕНИЕ: select конкретных колонок падал с 500, если в таблице
    # нет какой-то из них (например, flag или ip). Берём все строки и
    # отдаём только безопасное подмножество полей.
    res = await B.supabase.table("servers").select("*").execute()
    return ok([_admin_server_view(s) for s in res.data or []])


async def api_admin_users(request: web.Request) -> web.Response:
    try:
        limit = min(int(request.query.get("limit", "100")), 500)
    except ValueError:
        limit = 100
    users = await B.supabase.table("users").select(
        "user_id, username, full_name, created_at"
    ).order("created_at", desc=True).limit(limit).execute()

    all_subs = await B.fetch_all_supabase_rows("subscriptions", "user_id, status, expiry_date")
    all_pays = await B.fetch_all_supabase_rows("payments", "user_id, amount_rub, status")

    subs_by_user: Dict[int, int] = {}
    for s in all_subs:
        if s.get("status") == "active" and s.get("user_id"):
            subs_by_user[s["user_id"]] = subs_by_user.get(s["user_id"], 0) + 1
    paid_by_user: Dict[int, float] = {}
    for p in all_pays:
        if p.get("status") == "completed" and p.get("user_id"):
            paid_by_user[p["user_id"]] = paid_by_user.get(p["user_id"], 0) + (p["amount_rub"] or 0)

    result = [
        {**u,
         "active_subs": subs_by_user.get(u["user_id"], 0),
         "total_paid": paid_by_user.get(u["user_id"], 0),
         "is_admin": B.is_admin(u["user_id"])}
        for u in (users.data or [])
    ]
    return ok(result)


async def api_admin_user_detail(request: web.Request) -> web.Response:
    """Детальная карточка пользователя для админки: реальные подписки
    (статус/срок/сервер), платежи и реферальная сводка."""
    uid_str = request.match_info["user_id"]
    if not uid_str.isdigit():
        return err("Неверный ID")
    uid = int(uid_str)

    urow = await B.supabase.table("users").select("*").eq("user_id", uid).execute()
    if not urow.data:
        return err("Пользователь не найден", 404)
    user = urow.data[0]

    servers = await B.load_servers_from_supabase()
    server_map = {s["id"]: s for s in servers}
    now_ms = int(time.time() * 1000)

    subs_res = await B.supabase.table("subscriptions").select(
        "id, sub_id, server_id, expiry_date, status, email").eq("user_id", uid).execute()
    subs = []
    for s in sorted(subs_res.data or [], key=lambda x: x.get("expiry_date") or 0, reverse=True):
        server = server_map.get(s["server_id"])
        expiry = s.get("expiry_date") or 0
        is_active = s.get("status") == "active" and (expiry == 0 or expiry > now_ms)
        subs.append({
            "sub_id": s["sub_id"],
            "server": safe_server(server) if server else {"id": s["server_id"], "name": "—"},
            "expiry_date": expiry,
            "status": "active" if is_active else "expired",
            "email": s.get("email"),
        })

    pays_res = await B.supabase.table("payments").select(
        "payment_uid, amount_rub, method, status, created_at, tx_hash").eq(
        "user_id", uid).order("created_at", desc=True).limit(30).execute()

    referral = {"points": 0, "invited_total": 0, "invited_paid": 0, "referred_by": user.get("referred_by")}
    if await B.referral_schema_available():
        try:
            referral["points"] = int(user.get("ref_points") or 0)
            inv = await B.supabase.table("users").select("user_id", count="exact").eq(
                "referred_by", uid).execute()
            referral["invited_total"] = inv.count or 0
            paid = await B.supabase.table("point_transactions").select("id", count="exact").eq(
                "user_id", uid).eq("reason", "referral_purchase").execute()
            referral["invited_paid"] = paid.count or 0
        except Exception:
            pass

    total_paid = sum((p.get("amount_rub") or 0) for p in (pays_res.data or [])
                     if p.get("status") == "completed")

    return ok({
        "user": {
            "user_id": uid,
            "username": user.get("username"),
            "full_name": user.get("full_name"),
            "created_at": user.get("created_at"),
            "lang": user.get("lang"),
            "reminders_enabled": user.get("reminders_enabled"),
            "is_admin": B.is_admin(uid),
        },
        "subscriptions": subs,
        "payments": pays_res.data or [],
        "total_paid": total_paid,
        "referral": referral,
    })


async def api_admin_revoke_sub(request: web.Request) -> web.Response:
    """Отзыв одной подписки: снимаем клиента с панели (ссылка и VPN
    перестают работать) и помечаем подписку в БД как revoked."""
    sub_id = request.match_info["sub_id"]
    res = await B.supabase.table("subscriptions").select(
        "client_uuid, server_id, user_id").eq("sub_id", sub_id).execute()
    if not res.data:
        return err("Подписка не найдена", 404)
    sub = res.data[0]
    servers = await B.load_all_servers_from_supabase()
    server = next((s for s in servers if s["id"] == sub["server_id"]), None)
    if server:
        xui = B.XUIApi(server)
        try:
            removed = await xui.remove_client(sub["client_uuid"])
        finally:
            await xui.close()
        if not removed:
            return err("Панель недоступна — доступ не отозван. Попробуйте ещё раз.", 503)
    await B.supabase.table("subscriptions").update({"status": "revoked"}).eq("sub_id", sub_id).execute()
    try:
        await B.bot.send_message(
            sub["user_id"],
            "⛔️ <b>Ваша подписка была отключена администратором.</b>\n\n"
            "Если это ошибка — напишите в поддержку.",
            parse_mode="HTML",
        )
    except Exception:
        pass
    return ok({"revoked": True})


async def api_admin_search(request: web.Request) -> web.Response:
    """Поиск пользователя по: Telegram ID, ID подписки в БД, email из панели,
    sub_id, @username или имени. Возвращает совпавших пользователей с
    указанием, чем совпало (для админского UI)."""
    q = (request.query.get("q") or "").strip()
    if len(q) < 2:
        return err("Слишком короткий запрос")
    q_low = q.lower().lstrip("@")

    matches: Dict[int, Dict[str, Any]] = {}

    def add(uid: Optional[int], how: str, value: str):
        if uid is None:
            return
        matches.setdefault(int(uid), {"user_id": int(uid), "matched_by": how, "matched_value": value})

    # По Telegram ID (точное)
    if q.isdigit():
        r = await B.supabase.table("users").select("user_id").eq("user_id", int(q)).execute()
        if r.data:
            add(int(q), "Telegram ID", q)
        # По ID подписки в БД
        rs = await B.supabase.table("subscriptions").select("user_id, id").eq("id", int(q)).execute()
        for s in rs.data or []:
            add(s["user_id"], "ID подписки (БД)", str(s["id"]))

    # По email из панели (частичное) и по sub_id (точное)
    try:
        rem = await B.supabase.table("subscriptions").select("user_id, email").ilike("email", f"%{q}%").limit(20).execute()
        for s in rem.data or []:
            add(s["user_id"], "Email (панель)", s.get("email") or "")
    except Exception:
        pass
    rsid = await B.supabase.table("subscriptions").select("user_id, sub_id").eq("sub_id", q).execute()
    for s in rsid.data or []:
        add(s["user_id"], "sub_id", q)

    # По username / имени (частичное)
    try:
        ru = await B.supabase.table("users").select("user_id, username").ilike("username", f"%{q_low}%").limit(20).execute()
        for u in ru.data or []:
            add(u["user_id"], "@username", u.get("username") or "")
        rn = await B.supabase.table("users").select("user_id, full_name").ilike("full_name", f"%{q}%").limit(20).execute()
        for u in rn.data or []:
            add(u["user_id"], "Имя", u.get("full_name") or "")
    except Exception:
        pass

    # Обогащаем данными пользователя
    ids = list(matches.keys())[:40]
    result = []
    if ids:
        urows = await B.supabase.table("users").select("user_id, username, full_name").in_("user_id", ids).execute()
        umap = {u["user_id"]: u for u in (urows.data or [])}
        for uid in ids:
            u = umap.get(uid, {})
            result.append({
                **matches[uid],
                "username": u.get("username"),
                "full_name": u.get("full_name"),
            })
    return ok(result)


async def api_admin_reprovision(request: web.Request) -> web.Response:
    """Пересоздаёт клиентов во всех панелях для активных подписок и рассылает
    пользователям новые ссылки. Тяжёлая операция — выполняем в фоне, чтобы
    HTTP-запрос не висел; итог придёт админу в чат с ботом."""
    admin_id = request["user_id"]
    body = await request.json() if request.can_read_body else {}
    target = body.get("server_id")
    target_id = int(target) if isinstance(target, int) or (isinstance(target, str) and target.isdigit()) else None

    # Быстрая оценка масштаба для мгновенного ответа
    now_ms = int(time.time() * 1000)
    all_subs = await B.fetch_all_supabase_rows("subscriptions", "status, expiry_date, user_id")
    active_cnt = sum(
        1 for s in all_subs
        if s.get("status") == "active" and s.get("user_id")
        and ((s.get("expiry_date") or 0) == 0 or (s.get("expiry_date") or 0) > now_ms)
    )

    async def run():
        stats = await B.reprovision_all_subscriptions(B.bot, target_id)
        try:
            await B.bot.send_message(
                admin_id,
                "🔄 <b>Пересоздание подписок завершено</b>\n\n"
                f"Активных: {stats.get('total', 0)}\n"
                f"Пересоздано в панели: {stats.get('reprovisioned', 0)}\n"
                f"Уведомлено в чате: {stats.get('notified', 0)}\n"
                f"Ошибок: {stats.get('failed', 0)}",
                parse_mode="HTML",
            )
        except Exception:
            pass

    asyncio.create_task(run())
    return ok({"started": True, "active": active_cnt})


# ====================== ПРОВИЖИНИНГ НОД («одна кнопка») ======================
def _ssh_cmd(host_ip: str, remote: str) -> List[str]:
    return ["ssh", "-i", PROV_KEY, "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null", "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=20", f"root@{host_ip}", remote]


async def api_admin_node_preflight(request: web.Request) -> web.Response:
    """Быстрая проверка перед запуском: доступность SSH-порта новой ноды и,
    для входа, соответствие DNS → IP. Root не нужен, ничего не меняется."""
    body = await request.json() if request.can_read_body else {}
    mode = body.get("mode"); ip = (body.get("ip") or "").strip()
    domain = (body.get("domain") or "").strip()
    if mode not in ("entry", "exit") or not ip:
        return err("Нужны mode (entry|exit) и ip")
    result: Dict[str, Any] = {"ssh_reachable": False, "dns_ok": None, "dns_resolved": None}
    # TCP :22
    try:
        fut = asyncio.open_connection(ip, 22)
        reader, writer = await asyncio.wait_for(fut, timeout=6)
        writer.close()
        result["ssh_reachable"] = True
    except Exception:
        result["ssh_reachable"] = False
    # DNS для входа
    if mode == "entry" and domain:
        try:
            infos = await asyncio.get_event_loop().getaddrinfo(domain, None)
            addrs = {i[4][0] for i in infos}
            result["dns_resolved"] = ", ".join(sorted(addrs))
            result["dns_ok"] = ip in addrs
        except Exception:
            result["dns_ok"] = False
    tools = _prov_available()
    result["ready"] = tools is None
    if tools:
        result["tools_error"] = tools
    return ok(result)


async def api_admin_node_provision(request: web.Request) -> web.Response:
    """Запускает провижининг новой ноды в фоне. Возвращает job_id — дашборд
    опрашивает статус и показывает живой лог. Полная автоматизация:
      • exit  — поднимаем выход и подвязываем к Москве (новая страна в боте);
      • entry — поднимаем клон-вход; при make_active переводим на него страны.
    """
    unavailable = _prov_available()
    if unavailable:
        return err(f"Провижининг недоступен: {unavailable}", 503)
    body = await request.json()
    mode = body.get("mode")
    ip = (body.get("ip") or "").strip()
    password = (body.get("password") or "")
    domain = (body.get("domain") or "").strip()
    name = (body.get("name") or "").strip()
    flag = (body.get("flag") or "").strip()
    make_active = bool(body.get("make_active"))
    if mode not in ("entry", "exit"):
        return err("mode должен быть entry или exit")
    if not ip or not password:
        return err("Нужны IP и root-пароль новой ноды")
    if mode == "entry" and not domain:
        return err("Для входной ноды нужен домен (A-запись на её IP)")
    if not name:
        return err("Укажите название (например, 🇳🇱 Нидерланды)")

    job_id = uuid_lib.uuid4().hex[:12]
    _NODE_JOBS[job_id] = {"status": "running", "log": [], "result": None,
                          "error": None, "mode": mode, "name": name,
                          "created": int(time.time())}
    # чистим старые задания (> 2 ч), чтобы не копить память
    cutoff = int(time.time()) - 7200
    for jid in [k for k, v in _NODE_JOBS.items() if v.get("created", 0) < cutoff]:
        _NODE_JOBS.pop(jid, None)

    admin_id = request["user_id"]
    asyncio.create_task(_run_node_job(job_id, mode, ip, password, domain,
                                      name, flag, make_active, admin_id))
    return ok({"job_id": job_id})


async def api_admin_node_status(request: web.Request) -> web.Response:
    job = _NODE_JOBS.get(request.match_info["job_id"])
    if not job:
        return err("Задание не найдено", 404)
    return ok({"status": job["status"], "log": job["log"],
               "result": job["result"], "error": job["error"], "name": job["name"]})


def _jlog(job_id: str, line: str):
    job = _NODE_JOBS.get(job_id)
    if job is not None:
        job["log"].append(line)
        if len(job["log"]) > 400:
            job["log"] = job["log"][-400:]


async def _run_node_job(job_id, mode, ip, password, domain, name, flag, make_active, admin_id):
    """Фоновое задание: запускает provision-node.sh, стримит лог, при успехе
    регистрирует ноду. Итог дублируется админу в чат с ботом."""
    result_json: Optional[dict] = None
    try:
        source_ip = PROV_ENTRY_SRC if mode == "entry" else PROV_EXIT_SRC
        cmd = ["bash", PROV_SCRIPT, mode, "--ip", ip, "--pass", password,
               "--source-ip", source_ip, "--prov-key", PROV_KEY]
        if mode == "entry":
            cmd += ["--domain", domain]
        _jlog(job_id, f"▸ Старт провижининга {mode} · {ip}")
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        assert proc.stdout
        async for raw in proc.stdout:
            line = raw.decode(errors="replace").rstrip()
            if not line:
                continue
            if line.startswith("RESULT_JSON="):
                try:
                    result_json = json.loads(line[len("RESULT_JSON="):])
                except Exception as e:
                    _jlog(job_id, f"! не смог разобрать RESULT_JSON: {e}")
            else:
                _jlog(job_id, line)
        await proc.wait()
        if proc.returncode != 0 or not result_json:
            raise RuntimeError("провижининг завершился с ошибкой (см. лог выше)")

        # --- регистрация ---
        if mode == "exit":
            _jlog(job_id, "▸ Подвязываю выход к Москве и регистрирую страну…")
            server_row = await _wire_and_register_exit(job_id, name, flag, result_json)
            summary = (f"✅ <b>Нода-выход поднята</b>\n\n{name}\n"
                       f"IP выхода: <code>{ip}</code>\n"
                       f"Инбаунд на Москве: {server_row.get('inbound_id')} · порт {server_row.get('client_port')}\n"
                       f"Добавлена в бота как страна ✅")
        else:
            _jlog(job_id, "▸ Входная нода готова")
            server_row = await _register_or_switch_entry(job_id, domain, result_json, make_active)
            switched = "переведены на новый вход ✅" if make_active else "не переключал (нажмите «Сделать активным», когда будете готовы)"
            summary = (f"✅ <b>Входная нода поднята</b>\n\n{name}\n"
                       f"Домен: <code>{domain}</code>\nIP: <code>{ip}</code>\n"
                       f"Панель: {result_json.get('panel',{}).get('web_port','')}\n"
                       f"Страны {switched}")

        _NODE_JOBS[job_id]["result"] = server_row
        _NODE_JOBS[job_id]["status"] = "done"
        _jlog(job_id, "✓ Готово")
    except Exception as e:
        logger.exception(f"node provision {job_id}: {e}")
        _jlog(job_id, f"✗ Ошибка: {e}")
        _NODE_JOBS[job_id]["status"] = "error"
        _NODE_JOBS[job_id]["error"] = str(e)
        summary = f"❌ <b>Провижининг ноды не удался</b>\n\n{name}\n{e}"
    try:
        await B.bot.send_message(admin_id, summary, parse_mode="HTML", disable_web_page_preview=True)
    except Exception:
        pass


async def _entry_template_server() -> Optional[dict]:
    """Существующая запись сервера, указывающая на панель Москвы — берём как
    шаблон (panel_url/логин/пароль/sub_*), чтобы новая страна унаследовала их."""
    servers = await B.load_servers_from_supabase()
    entry_panel = None
    for s in servers:
        pu = (s.get("panel_url") or "")
        if PROV_ENTRY_IP in pu or "vpn.gigabytebot.com" in pu:
            entry_panel = s
            break
    return entry_panel or (servers[0] if servers else None)


async def _wire_and_register_exit(job_id, name, flag, result_json) -> dict:
    import shlex
    chain = result_json.get("chain") or {}
    slug = "".join(ch for ch in name.lower() if ch.isalnum()) or "exit"
    # запускаем wire-exit.py на Москве (скрипт передаём по stdin)
    args = ["python3", "-", "--dsn", PROV_ENTRY_DSN, "--slug", slug,
            "--remark", name, "--exit-ip", chain.get("address", ""),
            "--exit-port", str(chain.get("port", 443)), "--exit-uuid", chain.get("uuid", ""),
            "--exit-pbk", chain.get("publicKey", ""), "--exit-sid", chain.get("shortId", ""),
            "--exit-sni", chain.get("sni", "www.amazon.com")]
    remote = " ".join(shlex.quote(a) for a in args)
    with open(PROV_WIRE, "rb") as f:
        script = f.read()
    proc = await asyncio.create_subprocess_exec(
        *_ssh_cmd(PROV_ENTRY_IP, remote),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT)
    out, _ = await proc.communicate(input=script)
    wire = None
    for line in out.decode(errors="replace").splitlines():
        _jlog(job_id, "  " + line)
        if line.startswith("WIRE_RESULT="):
            wire = json.loads(line[len("WIRE_RESULT="):])
    if proc.returncode != 0 or not wire:
        raise RuntimeError("не удалось подвязать выход к Москве (см. лог)")

    tmpl = await _entry_template_server() or {}
    columns = await _existing_server_columns()
    row = _filter_server_payload({
        "name": name,
        "ip": tmpl.get("ip") or "vpn.gigabytebot.com",
        "panel_url": tmpl.get("panel_url"),
        "panel_login": tmpl.get("panel_login"),
        "panel_pass": tmpl.get("panel_pass"),
        "inbound_id": wire["inbound_id"],
        "client_port": wire["client_port"],
        "sub_port": tmpl.get("sub_port"),
        "sub_path": tmpl.get("sub_path"),
        "pbk": wire["pbk"],
        "sni": wire["sni"],
        "short_id": wire["short_id"],
        "fp": wire.get("fp") or "firefox",
        "is_active": True,
    }, columns, for_update=False)
    res = await B.supabase.table("servers").insert(row).execute()
    return res.data[0] if res.data else row


async def _register_or_switch_entry(job_id, domain, result_json, make_active) -> dict:
    panel = result_json.get("panel") or {}
    info = {"domain": domain,
            "panel_url": f"https://{domain}:{panel.get('web_port','')}{panel.get('base_path','')}",
            "switched": False}
    if make_active:
        # Клон-вход имеет те же inbound_id и Reality-ключи, что и Москва, поэтому
        # достаточно перенаправить существующие страны на новый домен/панель.
        servers = await B.load_servers_from_supabase()
        new_panel = f"https://{domain}:{panel.get('web_port','')}{panel.get('base_path','')}"
        switched = 0
        for s in servers:
            pu = s.get("panel_url") or ""
            if PROV_ENTRY_IP in pu or "vpn.gigabytebot.com" in pu:
                await B.supabase.table("servers").update(
                    {"ip": domain, "panel_url": new_panel}).eq("id", s["id"]).execute()
                switched += 1
        info["switched"] = True
        info["switched_count"] = switched
        _jlog(job_id, f"  переведено стран на новый вход: {switched}")
    return info


async def api_admin_dashboard_link(request: web.Request) -> web.Response:
    """Персональная ссылка входа в веб-дашборд для текущего администратора.
    Мини-апп открывает её кнопкой — админ переходит в полноценный веб-дашборд
    (на компьютере/в браузере). Ссылка подписана токеном бота, живёт ограниченно."""
    admin_id = request["user_id"]
    if not B.DASHBOARD_URL:
        return err("Дашборд не настроен: не задан DASHBOARD_URL в .env", 503)
    token = B.dashboard_token(admin_id)
    return ok({"url": f"{B.DASHBOARD_URL}/?token={token}", "ttl_hours": B.DASHBOARD_TOKEN_TTL_HOURS})


async def api_admin_delete_user(request: web.Request) -> web.Response:
    uid_str = request.match_info["user_id"]
    if not uid_str.isdigit():
        return err("Неверный ID")
    uid = int(uid_str)
    if B.is_admin(uid):
        return err("Нельзя удалить администратора")

    result = await B.revoke_user_clients(uid)
    if result["failures"]:
        details = "\n".join(
            f"• {f['server']}: {f['email']} ({f['client_uuid']})"
            for f in result["failures"]
        )
        return err(
            f"Доступ отозван не полностью — панель недоступна. Данные НЕ удалены. "
            f"Снимите вручную и повторите:\n{details}", 503)

    await _purge_user_data(uid)
    return ok({"deleted_subscriptions": result["removed"]})


# ====================== СТАТИКА ВЕБ-АППА ======================
async def serve_index(request: web.Request) -> web.Response:
    import os
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp", "dist", "index.html")
    if not os.path.exists(index_path):
        return web.Response(
            text="Веб-апп не собран. Выполните: cd webapp && npm install && npm run build",
            status=503, content_type="text/plain", charset="utf-8",
        )
    return web.FileResponse(index_path)


# ====================== РЕГИСТРАЦИЯ ======================
def setup_webapp_api(app: web.Application, bot_module: Any) -> None:
    """Подключает API и статику мини-аппа к aiohttp-приложению бота."""
    global B
    B = bot_module

    app.middlewares.append(cors_middleware)
    app.middlewares.append(auth_middleware)

    r = app.router
    # Пользовательские
    r.add_get("/api/bootstrap", api_bootstrap)
    r.add_post("/api/terms/accept", api_accept_terms)
    r.add_get("/api/subscriptions", api_subscriptions)
    r.add_get("/api/payments", api_payments)
    r.add_post("/api/trial", api_trial)
    r.add_post("/api/purchase", api_purchase)
    r.add_post("/api/payments/{payment_id}/hash", api_submit_hash)
    r.add_post("/api/payments/{payment_id}/invoice", api_payment_invoice)
    r.add_delete("/api/payments/{payment_id}", api_delete_payment)
    r.add_post("/api/promo/activate", api_promo_activate)
    r.add_get("/api/tickets", api_tickets_get)
    r.add_post("/api/tickets", api_tickets_create)
    r.add_post("/api/tickets/{ticket_id}/messages", api_ticket_message)
    r.add_post("/api/tickets/{ticket_id}/close", api_ticket_close)
    r.add_post("/api/country-requests", api_country_request)
    r.add_delete("/api/account", api_delete_account)
    r.add_get("/api/public/reminder.ics", api_public_reminder_ics)
    r.add_get("/api/public/subqr.png", api_public_sub_qr)
    r.add_get("/api/subscriptions/{sub_id}/stats", api_sub_stats)
    r.add_post("/api/subscriptions/{sub_id}/qr/share", api_sub_qr_share)
    r.add_get("/api/referral", api_referral)
    r.add_post("/api/referral/redeem", api_referral_redeem)
    r.add_post("/api/settings/reminders", api_settings_reminders)
    r.add_get("/api/reviews", api_reviews_get)
    r.add_post("/api/reviews", api_reviews_post)
    # Админские
    r.add_post("/api/admin/reviews/{user_id}/hide", api_admin_review_hide)
    r.add_get("/api/admin/stats", api_admin_stats)
    r.add_get("/api/admin/rates", api_admin_rates)
    r.add_get("/api/admin/stars-balance", api_admin_stars_balance)
    r.add_get("/api/admin/tariffs", api_admin_tariffs_get)
    r.add_post("/api/admin/tariffs", api_admin_tariffs_post)
    r.add_get("/api/admin/promo-keys", api_admin_promo_get)
    r.add_post("/api/admin/promo-keys", api_admin_promo_post)
    r.add_get("/api/admin/tickets", api_admin_tickets)
    r.add_get("/api/admin/country-requests", api_admin_country_requests)
    r.add_post("/api/admin/country-requests/{request_id}/reply", api_admin_country_reply)
    r.add_post("/api/admin/broadcast", api_admin_broadcast)
    r.add_post("/api/admin/subscriptions", api_admin_create_sub)
    r.add_post("/api/admin/sync", api_admin_sync)
    r.add_post("/api/admin/import", api_admin_import)
    r.add_get("/api/admin/servers", api_admin_servers)
    r.add_post("/api/admin/servers", api_admin_server_create)
    r.add_post("/api/admin/servers/{server_id}", api_admin_server_update)
    r.add_delete("/api/admin/servers/{server_id}", api_admin_server_delete)
    r.add_post("/api/admin/servers/{server_id}/test", api_admin_server_test)
    r.add_get("/api/admin/panel-status", api_admin_panel_status)
    r.add_get("/api/admin/servers/health", api_admin_servers_health)
    r.add_get("/api/admin/users", api_admin_users)
    r.add_get("/api/admin/search", api_admin_search)
    r.add_get("/api/admin/users/{user_id}", api_admin_user_detail)
    r.add_delete("/api/admin/users/{user_id}", api_admin_delete_user)
    r.add_post("/api/admin/subscriptions/{sub_id}/revoke", api_admin_revoke_sub)
    r.add_post("/api/admin/reprovision", api_admin_reprovision)
    r.add_get("/api/admin/dashboard-link", api_admin_dashboard_link)
    r.add_post("/api/admin/nodes/preflight", api_admin_node_preflight)
    r.add_post("/api/admin/nodes/provision", api_admin_node_provision)
    r.add_get("/api/admin/nodes/provision/{job_id}", api_admin_node_status)

    # Статика собранного веб-аппа (webapp/dist) по адресу /app
    import os
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp", "dist")
    r.add_get("/app", serve_index)
    r.add_get("/app/", serve_index)
    if os.path.isdir(dist_dir):
        r.add_static("/app/", dist_dir)
    logger.info("✅ API веб-аппа зарегистрирован (/api/*, статика: /app/)")
