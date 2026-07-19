# ---------- Стадия 1: сборка веб-аппа ----------
FROM node:22-alpine AS webapp-build

WORKDIR /webapp
COPY webapp/package.json ./
RUN npm install --no-audit --no-fund
COPY webapp/ ./
RUN npm run build

# ---------- Стадия 2: бот + API ----------
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bot.py webapp_api.py ./
COPY assets ./assets
COPY --from=webapp-build /webapp/dist ./webapp/dist

RUN useradd -m -u 1000 gigabyte && chown -R gigabyte:gigabyte /app
USER gigabyte

EXPOSE 8080

CMD ["python", "-u", "bot.py"]
