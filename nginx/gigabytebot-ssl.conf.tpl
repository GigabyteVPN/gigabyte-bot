# Официальный сайт Gigabyte VPN — gigabytebot.com (ЭТАП 2: с TLS).
# Подставляется скриптом issue-gigabytebot-cert.sh после выпуска сертификата.

# HTTP → HTTPS (+ ACME для продления)
server {
    listen 80;
    listen [::]:80;
    server_name gigabytebot.com www.gigabytebot.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; default_type "text/plain"; }
    location / { return 301 https://gigabytebot.com$request_uri; }
}

# www → apex (канонический адрес)
server {
    listen 443 ssl;
    http2 on;
    server_name www.gigabytebot.com;
    ssl_certificate     /etc/nginx/certs/gigabytebot/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/gigabytebot/privkey.pem;
    return 301 https://gigabytebot.com$request_uri;
}

# Основной сайт
server {
    listen 443 ssl;
    http2 on;
    server_name gigabytebot.com;

    ssl_certificate     /etc/nginx/certs/gigabytebot/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/gigabytebot/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    root /usr/share/nginx/html/gigabytebot;
    index index.html;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;

    # Кэш задаём директивой expires, а не add_header: add_header внутри
    # location заменяет ВЕСЬ набор унаследованных заголовков (потерялись бы
    # заголовки безопасности), а два разных add_header дали бы два
    # противоречащих Cache-Control в одном ответе.
    # По умолчанию — всегда перепроверять: это про HTML.
    expires -1;

    # Сжатие
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 512;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

    # Кэш статики
    # Статика живёт долго: адрес скрипта содержит отпечаток содержимого
    # (см. scripts/deploy-website.sh), поэтому обновление доезжает сразу.
    location ~* \.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$ {
        expires 30d;
    }
    location = /robots.txt  { expires 1d; }
    location = /sitemap.xml { expires 1d; }

    # Несуществующий адрес обязан отдавать 404, а не главную страницу.
    # Иначе поисковик считает это «мягкой ошибкой»: любой мусорный URL
    # выглядит как рабочая страница с тем же содержимым, и сайт теряет
    # доверие при индексации.
    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
        expires -1;
    }
}
