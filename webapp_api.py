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
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram.types import LabeledPrice

logger = logging.getLogger(__name__)

B: Any = None  # модуль bot.py, устанавливается в setup_webapp_api()

INIT_DATA_MAX_AGE = 24 * 3600  # сколько живёт подпись initData

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
    trial_res = await B.supabase.table("payments").select("id").eq("user_id", user_id).eq("method", "trial").execute()
    servers = await B.load_servers_from_supabase()

    return ok({
        "user": {"id": user_id, "username": user.get("username"),
                 "first_name": user.get("first_name"), "last_name": user.get("last_name")},
        "is_admin": B.is_admin(user_id),
        "accepted_terms": accepted,
        "trial_used": bool(trial_res.data),
        "tariffs": tariff_list(),
        "servers": [safe_server(s) for s in servers],
        "countries": B.COUNTRIES,
        "wallet": B.ARBITRUM_WALLET,
        "contracts": {"USDT": B.USDT_CONTRACT, "USDC": B.USDC_CONTRACT},
        "offer_url": B.OFFER_URL,
        "privacy_url": B.PRIVACY_URL,
    })


async def api_accept_terms(request: web.Request) -> web.Response:
    await B.set_accepted_terms(request["user_id"])
    return ok()


async def api_subscriptions(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    res = await B.supabase.table("subscriptions").select(
        "id, server_id, sub_id, expiry_date, status"
    ).eq("user_id", user_id).execute()
    servers = await B.load_servers_from_supabase()
    server_map = {s["id"]: s for s in servers}
    now_ms = int(time.time() * 1000)
    subs = []
    for s in sorted(res.data or [], key=lambda x: x.get("expiry_date") or 0, reverse=True):
        server = server_map.get(s["server_id"])
        expiry = s.get("expiry_date") or 0
        is_active = s.get("status") == "active" and (expiry == 0 or expiry > now_ms)
        subs.append({
            "id": s["id"],
            "sub_id": s["sub_id"],
            "server": safe_server(server) if server else {"id": s["server_id"], "name": "Сервер"},
            "expiry_date": expiry,
            "status": "active" if is_active else "expired",
            "sub_link": B.generate_subscription_link(server, s["sub_id"]) if server else None,
            "ics_url": (
                f"/api/public/reminder.ics?sub_id={s['sub_id']}&t={ics_token(s['sub_id'])}"
                if is_active and expiry > 0 else None
            ),
        })
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
    history_res = await B.supabase.table("payments").select("*").eq("user_id", user_id).eq(
        "status", "completed"
    ).order("created_at", desc=True).limit(50).execute()

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

    dup = await B.supabase.table("payments").select("id").eq("user_id", user_id).eq("method", "trial").execute()
    if dup.data:
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
        return err("Можно удалять только ожидающие платежи")
    await B.supabase.table("payments").delete().eq("id", payment_id).execute()
    await B.supabase.table("pending_confirmations").delete().eq("payment_id", payment_id).execute()
    return ok()


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


async def api_delete_account(request: web.Request) -> web.Response:
    user_id = request["user_id"]
    if B.is_admin(user_id):
        return err("Администратор не может удалить себя")

    subs = await B.supabase.table("subscriptions").select("client_uuid, server_id").eq("user_id", user_id).execute()
    servers = await B.load_servers_from_supabase()
    server_map = {s["id"]: s for s in servers}
    deleted_count = 0
    for sub in subs.data or []:
        server = server_map.get(sub["server_id"])
        if server:
            xui = B.XUIApi(server)
            try:
                if await xui.remove_client(sub["client_uuid"]):
                    deleted_count += 1
            finally:
                await xui.close()

    for table in ("subscriptions", "payments", "tickets", "country_requests", "pending_confirmations", "users"):
        await B.supabase.table(table).delete().eq("user_id", user_id).execute()

    await notify_admins(
        f"ℹ️ <b>Пользователь удалил аккаунт</b> (через веб-апп)\n\n"
        f"🆔 <code>{user_id}</code>\n📊 Удалено подписок: {deleted_count}"
    )
    return ok({"deleted_subscriptions": deleted_count})


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
            panel: Dict[str, Any] = {"reachable": False, "inbounds": [], "onlines": []}
            try:
                if await xui.login():
                    panel["reachable"] = True
                    panel["inbounds"] = await xui.list_inbounds()
                    panel["onlines"] = await xui.get_online_emails()
            except Exception as e:
                logger.warning(f"panel-status {server.get('name')}: {e}")
            finally:
                await xui.close()
            seen_panels[key] = panel
            cached = panel

        inbound = next((ib for ib in cached["inbounds"] if ib.get("id") == server.get("inbound_id")), None)
        stats = (inbound or {}).get("clientStats") or []
        inbound_emails = {c.get("email") for c in stats}
        online_here = [e for e in cached["onlines"] if e in inbound_emails]
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
        onlines = await xui.get_online_emails()
        return ok({
            "available": me is not None,
            "up": (me or {}).get("up") or 0,
            "down": (me or {}).get("down") or 0,
            "online": sub.get("email") in onlines,
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


async def api_admin_delete_user(request: web.Request) -> web.Response:
    uid_str = request.match_info["user_id"]
    if not uid_str.isdigit():
        return err("Неверный ID")
    uid = int(uid_str)
    if B.is_admin(uid):
        return err("Нельзя удалить администратора")
    subs = await B.supabase.table("subscriptions").select("client_uuid, server_id").eq("user_id", uid).execute()
    servers = await B.load_servers_from_supabase()
    server_map = {s["id"]: s for s in servers}
    deleted = 0
    for sub in subs.data or []:
        server = server_map.get(sub["server_id"])
        if server:
            xui = B.XUIApi(server)
            try:
                if await xui.remove_client(sub["client_uuid"]):
                    deleted += 1
            finally:
                await xui.close()
    for table in ("subscriptions", "payments", "tickets", "country_requests", "pending_confirmations", "users"):
        await B.supabase.table(table).delete().eq("user_id", uid).execute()
    return ok({"deleted_subscriptions": deleted})


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
    r.add_get("/api/subscriptions/{sub_id}/stats", api_sub_stats)
    # Админские
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
    r.add_get("/api/admin/users", api_admin_users)
    r.add_delete("/api/admin/users/{user_id}", api_admin_delete_user)

    # Статика собранного веб-аппа (webapp/dist) по адресу /app
    import os
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "webapp", "dist")
    r.add_get("/app", serve_index)
    r.add_get("/app/", serve_index)
    if os.path.isdir(dist_dir):
        r.add_static("/app/", dist_dir)
    logger.info("✅ API веб-аппа зарегистрирован (/api/*, статика: /app/)")
