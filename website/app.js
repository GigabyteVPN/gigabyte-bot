/* Gigabyte VPN — сайт.
   Всё в одном файле и без внешних зависимостей: страница обязана открываться
   мгновенно даже на плохом мобильном интернете и проходить строгий CSP. */
(function () {
  "use strict";

  /* ─────────────────────────── переводы ───────────────────────────
     Русский лежит в разметке (важно для поисковых систем — они видят
     готовый текст без выполнения скриптов). Здесь только английский. */
  var EN = {
    n1: "Features", n2: "Technology", n3: "Pricing", n4: "Free trial", n5: "Setup", n6: "FAQ",
    cta: "Get started",
    tag: "Network online · Moscow → Paris",
    h1: "Internet without borders.<br><span class=\"grad\">No trade-offs</span> on speed.",
    lead: "Gigabyte VPN opens what's blocked and doesn't break what already works. Foreign services go through our European node, local banking and government sites stay direct. Nothing to switch.",
    cta1: "Connect in 2 minutes", cta2: "Try for free",
    note: "99.9% uptime · pay by card, crypto or Telegram Stars",
    k1: "peak channel speed", k2: "latency to entry node", k3: "records about your traffic", k4: "support by a real person",

    s1tag: "Universal", s1h: "One key — <span class=\"grad\">every task</span>",
    s1p: "No need to juggle two services: one for social media, another for work. Gigabyte covers the whole range — from 4K video to banking apps and work calls.",
    c1h: "Invisible to filters",
    c1p: "The VLESS Reality protocol makes your traffic look like an ordinary visit to a major website. DPI hardware sees a routine HTTPS connection and lets it through.",
    c2h: "Speed without losses",
    c2p: "XTLS Vision removes double encryption inside the tunnel. 4K video, downloads and games run at your full channel speed.",
    c3h: "Local services stay alive",
    c3p: "Banks, government portals, marketplaces and taxi apps open directly from a local address. No need to turn the VPN off to pay a bill.",
    c4h: "Every device at once",
    c4p: "iPhone, Android, Windows, macOS — one subscription link for everything. The configuration updates itself.",
    c5h: "We keep no journals",
    c5p: "No IPs, no history, no DNS queries, no content. The access log is disabled at the server level — there is simply nothing to reconstruct.",
    c6h: "Payment without barriers",
    c6p: "Telegram Stars work with any bank card. Need full anonymity — pay with USDT or USDC. No passport, no KYC.",

    s2tag: "How it works", s2h: "A smart route <span class=\"grad\">for every request</span>",
    s2p: "A regular VPN pushes all traffic into one country — and your bank blocks the login because you \"came from France\". We split the flow at the entry node.",
    r1: "Your device", r2: "Entry · Moscow", r3: "Exit · Paris", r4: "YouTube, ChatGPT, Instagram",
    r1b: "Your device", r2b: "Entry · Moscow", r5: "Local banks, gov, marketplaces",
    r6: "The decision takes milliseconds, based on domain and address. Local services see a local IP and work normally, foreign ones see a European IP. One subscription, zero switching.",

    s3tag: "Pricing", s3h: "Fair price <span class=\"grad\">with no asterisks</span>",
    s3p: "Unlimited traffic on every plan. No surcharges for speed, devices or locations.",
    p1: "1 month", p1s: "give it a try", p2: "3 months", p3: "6 months", p4: "12 months",
    mo: "mo", best: "Most popular", choose: "Choose",
    f1: "Unlimited traffic", f2: "All locations", f3: "Multiple devices",
    f4: "Everything from monthly", f5: "Priority support", f6: "Save 100 ₽",
    f7: "Everything from 3 months", f8: "Promo codes for friends", f9: "Save 300 ₽",
    f10: "Best price per month", f11: "All future locations", f12: "Save 700 ₽",
    pay: "Telegram Stars · USDT / USDC · no KYC · activated right after payment",

    s4tag: "Free", s4h: "Telegram won't open?<br><span class=\"grad\">Start here</span>",
    s4p: "If your provider throttles Telegram, you can't reach the bot. Grab a free trial key right here: it restores access, then you can get a full subscription.",
    t1: "Install an app: v2rayNG for Android and Windows, Streisand for iPhone and Mac.",
    t2: "Copy the key on the right and add it via \"import from clipboard\".",
    t3: "Turn the connection on — Telegram and the rest of the internet will open.",
    t4: "Get a subscription in the bot: a personal key is faster and unlimited.",
    t5: "Trial access key",
    t6: "This key is shared and meant to get you to the bot. A personal subscription is faster and more stable.",

    s5tag: "Setup", s5h: "Three steps — and you're <span class=\"grad\">online</span>",
    s5p: "We don't force our own closed client. Open-source apps work fine — their code can be audited by anyone.",
    rec1: "Streisand app", rec2: "v2rayNG app",
    i1: "Install Streisand from the App Store — it's free.",
    i2: "In @givpn_bot open \"Dashboard\" and copy your subscription link.",
    i3: "In Streisand tap \"+\" and choose import from clipboard.",
    i4: "Flip the switch — allow adding a VPN profile on first launch.",
    i5: "Install v2rayNG from Google Play or GitHub.",
    i6: "In @givpn_bot open \"Dashboard\" and copy your subscription link.",
    i7: "Tap \"+\" and choose import from clipboard.",
    i8: "Tap the connect button — the icon turns active.",

    s6tag: "Network status", s6h: "Everything <span class=\"grad\">under control</span>",
    n_ru: "Moscow — entry node", n_fr: "Paris — exit node", n_nl: "Amsterdam", n_de: "Frankfurt", soon: "soon",

    s7tag: "Changelog", s7h: "What we <span class=\"grad\">improved</span>",
    nw1h: "Banks and gov sites got faster",
    nw1p: "We expanded the list of local services that go direct: 90+ domains of banks, government portals, marketplaces and mobile operators. Response times dropped several times over.",
    nw2h: "New entry node in Moscow",
    nw2p: "The entry moved to in-country infrastructure: lower latency, a more stable connection and more reliable filter bypass.",
    nw3h: "Invite friends — earn months",
    nw3p: "Referral programme: three friends with a paid subscription give you a free month. Everything is counted automatically in the app.",

    s8h: "We answer <span class=\"grad\">honestly</span>",
    q1: "Which VPN actually works under heavy filtering?",
    a1: "The ones that mask traffic. Classic protocols like OpenVPN and WireGuard are detected by provider hardware through characteristic patterns and get blocked. Gigabyte runs on VLESS Reality: the connection looks like an ordinary request to a big website, so filters let it pass.",
    q2: "Will my bank stop letting me in?",
    a2: "No. Local services are routed directly from a local address — the bank sees a normal in-country connection. You don't need to disable the VPN to pay or use government services.",
    q3: "How much speed do I lose?",
    a3: "Almost none. XTLS Vision doesn't re-encrypt data inside an already secure channel, so you keep your provider's speed — up to 1 Gbps.",
    q4: "Do you really keep no logs?",
    a4: "Yes. The access log is disabled at the server level, DNS queries and traffic content are never written anywhere. Even if we wanted to hand over browsing history, there is none.",
    q5: "How do I pay if my card doesn't work abroad?",
    a5: "Through Telegram Stars: they're bought with any bank card right inside Telegram. The second option is USDT or USDC if you need full anonymity.",
    q6: "How many devices can I connect?",
    a6: "One subscription serves several devices at once: phone, laptop, tablet. The subscription link delivers the right configuration to each.",
    q7: "What if the VPN stops working?",
    a7: "Message support right in the bot — a human answers, not a robot. We watch the nodes around the clock and rotate masking parameters before you notice a problem.",

    s9tag: "Documents", s9h: "Rules <span class=\"grad\">in plain language</span>",
    d1: "Privacy Policy", d2: "Terms of Use", d3: "No-Logs Guarantee",
    d1s: "Privacy", d2s: "Terms", d3s: "Guarantee",

    fh: "Ready to get <span class=\"grad\">the normal internet</span> back?",
    fp: "Two minutes to connect. Don't like it — we refund within 24 hours, no questions asked.",
    ftag: "A VPN that doesn't get in your way: it opens what's closed and keeps the usual things working.",
    fs1: "Service", fs2: "Documents", fs3: "Help", fh1: "Support in Telegram", frights: "all rights reserved",
  };

  var META = {
    ru: {
      title: "VPN для России 2026 — быстрый VPN без логов | Gigabyte VPN",
      desc: "Быстрый VPN для России: обход блокировок и ТСПУ, скорость до 1 Гбит/с, работает YouTube, Instagram, ChatGPT, Discord. Российские банки и Госуслуги открываются без отключения VPN. Без логов, оплата картой РФ, криптой и Telegram Stars.",
    },
    en: {
      title: "Fast no-logs VPN that bypasses blocking | Gigabyte VPN",
      desc: "A fast VPN with VLESS Reality masking: bypasses DPI filtering, up to 1 Gbps, YouTube, Instagram and ChatGPT work. Local banking stays direct. No logs, pay with crypto or Telegram Stars.",
    },
  };

  /* сервисы для бегущей строки — показываем универсальность */

  var DOCS = {
    privacy: {
      ru: ["Политика конфиденциальности",
        "Коротко: мы не знаем, что вы делаете в интернете, и не хотим знать.\n\n" +
        "Чего мы НЕ собираем:\n• IP-адрес, с которого вы подключаетесь\n• список сайтов и приложений, которые вы открываете\n• DNS-запросы\n• содержимое трафика\n• время и длительность сессий\n\n" +
        "Что мы храним, потому что без этого сервис не заработает:\n• идентификатор Telegram — к нему привязана подписка\n• UUID конфигурации — техническая строка для авторизации на сервере\n• дату окончания подписки\n• идентификатор платежа для проверки оплаты\n\n" +
        "Оплата. Telegram Stars обрабатывает сам Telegram — реквизиты карты к нам не попадают. Криптоплатёж проверяется один раз по хешу транзакции, связь хеша с аккаунтом стирается через неделю.\n\n" +
        "Техническая часть. Журнал доступа отключён на уровне сервера. Определение доменов используется только для маршрутизации и нигде не сохраняется. Ключи сессий живут в оперативной памяти и исчезают при разрыве соединения.\n\n" +
        "Ваши права. В любой момент можно попросить удалить аккаунт — данные стираются из базы. Историю посещений удалять не приходится: её не существует.\n\n" +
        "Запросы третьих лиц. У нас нет журналов, которые могли бы раскрыть вашу активность. Максимум, что технически возможно подтвердить — факт наличия подписки.\n\n" +
        "Полная версия документа доступна в приложении: бот @givpn_bot → Документы."],
      en: ["Privacy Policy",
        "In short: we don't know what you do online, and we don't want to.\n\n" +
        "What we do NOT collect:\n• the IP you connect from\n• the list of sites and apps you open\n• DNS queries\n• traffic content\n• session times and duration\n\n" +
        "What we store, because the service can't run without it:\n• your Telegram ID — the subscription is tied to it\n• a config UUID — a technical string for server authorisation\n• the subscription expiry date\n• a payment identifier to verify the payment\n\n" +
        "Payments. Telegram Stars are processed by Telegram itself — card details never reach us. A crypto payment is verified once by transaction hash; the link between hash and account is erased after a week.\n\n" +
        "Technical side. The access log is disabled at the server level. Domain detection is used only for routing and is never stored. Session keys live in RAM and disappear when the connection closes.\n\n" +
        "Your rights. You can ask for account deletion at any time — data is erased from the database. There's no browsing history to delete: it doesn't exist.\n\n" +
        "Third-party requests. We hold no journals that could reveal your activity. The most that is technically possible is confirming a subscription exists.\n\n" +
        "The full document is available in the app: bot @givpn_bot → Documents."],
    },
    terms: {
      ru: ["Условия использования",
        "1. Кто может пользоваться. Сервис рассчитан на совершеннолетних пользователей. Начиная работу, вы соглашаетесь с этими условиями и политикой конфиденциальности.\n\n" +
        "2. Что мы предоставляем. Доступ к зашифрованному каналу на протоколе VLESS Reality через бота @givpn_bot. Подключение выполняется сторонними открытыми приложениями (v2rayNG, Streisand).\n\n" +
        "3. Чего делать нельзя. Использовать канал для атак, рассылки спама, распространения вредоносных программ и любых противоправных действий. Передавать свой ключ посторонним.\n\n" +
        "4. Оплата и возврат. Принимаем Telegram Stars и криптовалюту USDT/USDC. Вернуть деньги можно в течение 24 часов после оплаты — напишите в поддержку, комиссии платёжных систем удерживаются.\n\n" +
        "5. Гарантии. Сервис предоставляется «как есть». Мы делаем всё разумное для бесперебойной работы, но не можем гарантировать отсутствие технических перерывов.\n\n" +
        "6. Ограничение доступа. При нарушении правил доступ может быть закрыт без возврата средств.\n\n" +
        "Полная версия — в приложении: бот @givpn_bot → Документы."],
      en: ["Terms of Use",
        "1. Who can use it. The service is intended for adults. By starting, you agree to these terms and the privacy policy.\n\n" +
        "2. What we provide. Access to an encrypted channel on the VLESS Reality protocol via the @givpn_bot bot. Connections are made with third-party open-source apps (v2rayNG, Streisand).\n\n" +
        "3. What's not allowed. Using the channel for attacks, spam, malware distribution or any unlawful activity. Sharing your key with outsiders.\n\n" +
        "4. Payment and refunds. We accept Telegram Stars and USDT/USDC crypto. A refund is possible within 24 hours of payment — message support; payment system fees are deducted.\n\n" +
        "5. Warranties. The service is provided \"as is\". We make every reasonable effort to keep it running but cannot guarantee the absence of technical interruptions.\n\n" +
        "6. Access restriction. If the rules are violated, access may be closed without a refund.\n\n" +
        "The full version is in the app: bot @givpn_bot → Documents."],
    },
    nologs: {
      ru: ["Гарантия отсутствия логов",
        "Мы не ведём журналы, по которым можно установить, что делал конкретный человек.\n\n" +
        "Конкретно это значит:\n• входящие и исходящие адреса не записываются\n• время начала и конца сессий не сохраняется\n• объём трафика не привязывается к личности\n• DNS-запросы не логируются\n• содержимое соединения не анализируется\n\n" +
        "Как это обеспечено технически:\n• журнал доступа перенаправлен в «никуда» на уровне сервера\n• журнал ошибок ограничен уровнем критических сбоев и не содержит адресов\n• определение домена работает в режиме «только для маршрутизации» и не пишется на диск\n• маскировка Reality не оставляет на стороне провайдера признаков VPN\n\n" +
        "Поскольку журналов не существует, по запросу третьих лиц передать нечего — кроме факта наличия подписки.\n\n" +
        "Дата вступления в силу: 25 июля 2026 года."],
      en: ["No-Logs Guarantee",
        "We keep no journals that could establish what a specific person did.\n\n" +
        "Concretely this means:\n• inbound and outbound addresses are not recorded\n• session start and end times are not stored\n• traffic volume is not tied to an identity\n• DNS queries are not logged\n• connection content is not analysed\n\n" +
        "How this is enforced technically:\n• the access log is redirected to nowhere at the server level\n• the error log is limited to critical failures and contains no addresses\n• domain detection runs in \"routing only\" mode and is never written to disk\n• Reality masking leaves no VPN fingerprint on the provider's side\n\n" +
        "Since no journals exist, there is nothing to hand over on third-party request — beyond the fact that a subscription exists.\n\n" +
        "Effective date: 25 July 2026."],
    },
  };

  /* ─────────────────────── переключение языка ─────────────────────── */
  var nodes = document.querySelectorAll("[data-i],[data-ih]");
  nodes.forEach(function (el) {
    var html = el.hasAttribute("data-ih");
    el.setAttribute("data-orig", html ? el.innerHTML : el.textContent);
  });
  var curLang = "ru";

  function apply(lang) {
    nodes.forEach(function (el) {
      var html = el.hasAttribute("data-ih");
      var key = el.getAttribute(html ? "data-ih" : "data-i");
      var val = lang === "en" ? EN[key] : el.getAttribute("data-orig");
      if (val == null) return;
      if (html) el.innerHTML = val; else el.textContent = val;
    });
    document.documentElement.lang = lang;
    var m = META[lang] || META.ru;
    document.title = m.title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute("content", m.desc);
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang") === lang);
    });
    try { localStorage.setItem("gb_lang", lang); } catch (e) {}
    curLang = lang;
  }

  // Разметка отдаётся на русском — это язык по умолчанию. Английский
  // включаем только по явному желанию: ?lang=en или прошлый выбор.
  // Автоопределение по локали браузера убрано намеренно: оно
  // перерисовывало страницу после загрузки и двигало вёрстку.
  var params = new URLSearchParams(location.search);
  var stored = null;
  try { stored = localStorage.getItem("gb_lang"); } catch (e) {}
  var initial = params.get("lang") || stored;
  if (initial === "en") apply("en");

  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { apply(b.getAttribute("data-lang")); });
  });


  /* ─────────────────────── живой фон: сеть узлов ───────────────────────
     Рисуем редкую сетку точек со связями — «дышащая» инфраструктура.
     На слабых устройствах и при prefers-reduced-motion не запускаем. */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cv = document.getElementById("net");
  if (cv && !reduce) {
    var ctx = cv.getContext("2d");
    var pts = [];
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Размер берём с запасными вариантами: в момент запуска вьюпорт может быть
    // ещё не измерен (0), и тогда анимация молча не стартовала бы навсегда.
    function viewport() {
      var w = cv.clientWidth || window.innerWidth || document.documentElement.clientWidth || 0;
      var h = cv.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
      return [w, h];
    }

    function resize() {
      var v = viewport();
      W = v[0]; H = v[1];
      if (!W || !H) return;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.min(70, Math.round((W * H) / 26000));
      pts = [];
      for (var i = 0; i < count; i++) {
        pts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        });
      }
    }

    function frame() {
      // на узких экранах сеть не рисуем — экономим батарею телефона
      if (!W || !H || W < 640) {
        if (W && H) ctx.clearRect(0, 0, W, H);
        if (!pts.length) resize();
        requestAnimationFrame(frame);
        return;
      }
      if (!pts.length) resize();
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        for (var j = i + 1; j < pts.length; j++) {
          var q = pts[j], dx = p.x - q.x, dy = p.y - q.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.strokeStyle = "rgba(0,229,192," + (0.13 * (1 - dist / 150)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        ctx.fillStyle = "rgba(0,229,192,.5)";
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });
    requestAnimationFrame(frame);
  }

  /* ─────────────────────── навигация и меню ─────────────────────── */
  var nav = document.getElementById("nav");
  var mob = document.getElementById("mob");
  var burger = document.getElementById("burger");
  var mx2 = document.getElementById("mx2");
  function closeMob() { mob.classList.remove("open"); document.body.classList.remove("lock"); }
  if (burger) burger.addEventListener("click", function () { mob.classList.add("open"); document.body.classList.add("lock"); });
  if (mx2) mx2.addEventListener("click", closeMob);
  mob.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMob); });

  /* ─────────────────────── документы ─────────────────────── */
  var modal = document.getElementById("modal");
  var mtitle = document.getElementById("mtitle");
  var mbody = document.getElementById("mbody");
  function openDoc(id) {
    var pack = (DOCS[id] || {})[curLang] || (DOCS[id] || {}).ru;
    if (!pack) return;
    mtitle.textContent = pack[0];
    mbody.textContent = pack[1];
    modal.querySelector(".modal-in").scrollTop = 0;
    modal.classList.add("show");
    document.body.classList.add("lock");
  }
  function closeDoc() { modal.classList.remove("show"); document.body.classList.remove("lock"); }
  document.querySelectorAll("[data-doc]").forEach(function (el) {
    el.addEventListener("click", function (e) { e.preventDefault(); openDoc(el.getAttribute("data-doc")); });
  });
  document.getElementById("mx").addEventListener("click", closeDoc);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeDoc(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeDoc(); closeMob(); } });

  /* ─────────────────────── копирование ключа ─────────────────────── */
  var toast = document.getElementById("toast");
  function showToast(t) {
    toast.textContent = t; toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 1900);
  }
  var copyBtn = document.getElementById("copy-trial");
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var link = document.getElementById("trial-link").textContent.trim();
    var done = function () { showToast(curLang === "en" ? "Key copied" : "Ключ скопирован"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, done);
    else {
      var ta = document.createElement("textarea");
      ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); done();
    }
  });

  /* ─────────────────────── скролл ─────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (href.length < 2 || a.hasAttribute("data-doc")) return;
      var t = document.querySelector(href);
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); }
    });
  });


  /* ─────────────────────── свечение под курсором ───────────────────────
     Карточка подсвечивается там, где указатель. Считаем координаты
     на кадре анимации, чтобы движение мыши не заставляло браузер
     пересчитывать раскладку чаще, чем он рисует. */
  var spot = null;
  function paintSpot() {
    if (!spot) return;
    spot.el.style.setProperty("--mx", spot.x + "px");
    spot.el.style.setProperty("--my", spot.y + "px");
    spot = null;
  }
  if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card, .post, .doc, .plan").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var had = spot;
        spot = { el: el, x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
        if (!had) requestAnimationFrame(paintSpot);
      }, { passive: true });
    });
  }

  /* ─────────────────────── кнопка «наверх» и шапка ─────────────────────── */
  var up = document.getElementById("up");
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      up.classList.toggle("show", window.scrollY > 500);
      nav.classList.toggle("on", window.scrollY > 20);
      ticking = false;
    });
  }, { passive: true });
  up.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
})();
