#!/usr/bin/env python3
"""Публикует на сайте реальный рейтинг сервиса.

Берёт оценки, которые пользователи поставили в боте, и обновляет две вещи
в website/index.html:
  • видимый блок «Отзывы» (между метками REVIEWS:START / REVIEWS:END);
  • поля aggregateRating и review в разметке Product (JSON-LD).

Почему так: поисковые системы требуют, чтобы разметка отражала то, что
пользователь реально видит на странице. Поэтому рейтинг сначала появляется
на самой странице и только потом — в разметке.

Публикуем только настоящие данные. Пока оценок меньше MIN_REVIEWS, блок
остаётся пустым, а разметка — без рейтинга: выдумывать звёзды нельзя.

Запуск (на сервере):  python3 scripts/update-site-rating.py
"""
import html
import json
import os
import re
import sys
import urllib.request

ENV_PATH = "/root/gigabyte-bot/.env"
SITE_PATH = "/root/gigabyte-bot/website/index.html"
MIN_REVIEWS = 5          # раньше этого числа рейтинг не показываем
MAX_CARDS = 6            # сколько отзывов с текстом выводим на странице


def load_env(path):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k] = v
    return env


def sb_get(env, path):
    req = urllib.request.Request(env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path)
    req.add_header("apikey", env["SUPABASE_KEY"])
    req.add_header("Authorization", "Bearer " + env["SUPABASE_KEY"])
    return json.loads(urllib.request.urlopen(req, timeout=40).read())


def first_name(full_name, username, uid):
    """Показываем только имя — фамилию и контакты не публикуем."""
    if full_name:
        return html.escape(str(full_name).split()[0][:24])
    if username:
        return html.escape(str(username)[:24])
    return "Пользователь"


def main():
    env = load_env(ENV_PATH)

    try:
        rows = sb_get(env, "reviews?select=user_id,rating,text,rated_at")
    except Exception as e:
        print(f"Таблицы reviews ещё нет или она недоступна: {e}")
        return 0

    rated = [r for r in rows if r.get("rating")]
    if len(rated) < MIN_REVIEWS:
        print(f"Оценок пока {len(rated)}, нужно минимум {MIN_REVIEWS} — сайт не трогаем.")
        return 0

    total = sum(int(r["rating"]) for r in rated)
    average = round(total / len(rated), 1)
    count = len(rated)

    # имена — только для тех, кто оставил текст
    names = {}
    try:
        for u in sb_get(env, "users?select=user_id,full_name,username"):
            names[u.get("user_id")] = u
    except Exception:
        pass

    with_text = [r for r in rated if (r.get("text") or "").strip()]
    with_text.sort(key=lambda r: (r.get("rated_at") or ""), reverse=True)
    cards = []
    for r in with_text[:MAX_CARDS]:
        u = names.get(r["user_id"], {})
        cards.append({
            "rating": int(r["rating"]),
            "text": html.escape((r.get("text") or "").strip())[:400],
            "author": first_name(u.get("full_name"), u.get("username"), r["user_id"]),
            "date": (r.get("rated_at") or "")[:10],
        })

    site = open(SITE_PATH, encoding="utf-8").read()

    # ---------- 1. видимый блок ----------
    stars_full = "★" * int(round(average)) + "☆" * (5 - int(round(average)))
    cards_html = "".join(
        f'<article class="rev-card"><div class="s">{"★" * c["rating"]}{"☆" * (5 - c["rating"])}</div>'
        f'<p>{c["text"]}</p><div class="who">{c["author"]} · {c["date"]}</div></article>'
        for c in cards
    )
    section = (
        '<section id="reviews" class="wrap">\n'
        '    <div class="sec-head mid">\n'
        '      <span class="tag">Отзывы</span>\n'
        '      <h2 style="margin-top:16px">Что говорят <span class="grad">пользователи</span></h2>\n'
        '    </div>\n'
        '    <div class="rating-hero">\n'
        f'      <div class="big">{average}</div>\n'
        f'      <div><div class="stars">{stars_full}</div>'
        f'<div class="cnt">на основе {count} оценок пользователей сервиса</div></div>\n'
        '    </div>\n'
        + (f'    <div class="revs">{cards_html}</div>\n' if cards else '')
        + '  </section>'
    )
    site = re.sub(
        r"<!-- REVIEWS:START -->.*?<!-- REVIEWS:END -->",
        "<!-- REVIEWS:START -->" + section + "<!-- REVIEWS:END -->",
        site, flags=re.S,
    )

    # ---------- 2. разметка Product ----------
    m = re.search(r'(<script type="application/ld\+json">)(.*?)(</script>)', site, re.S)
    data = json.loads(m.group(2))
    for node in data.get("@graph", []):
        if node.get("@type") == "Product":
            node["aggregateRating"] = {
                "@type": "AggregateRating",
                "ratingValue": str(average),
                "reviewCount": str(count),
                "bestRating": "5",
                "worstRating": "1",
            }
            if cards:
                node["review"] = [{
                    "@type": "Review",
                    "reviewRating": {"@type": "Rating", "ratingValue": str(c["rating"]),
                                     "bestRating": "5", "worstRating": "1"},
                    "author": {"@type": "Person", "name": c["author"]},
                    "datePublished": c["date"],
                    "reviewBody": c["text"],
                } for c in cards]
    site = site[:m.start(2)] + "\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n" + site[m.end(2):]

    open(SITE_PATH, "w", encoding="utf-8").write(site)
    print(f"Опубликовано: средний балл {average} из 5 по {count} оценкам, карточек с текстом: {len(cards)}")

    # сообщаем поисковикам, что страница обновилась
    os.system("bash /root/gigabyte-bot/scripts/indexnow-ping.sh >/dev/null 2>&1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
