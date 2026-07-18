-- ============================================================
-- Миграция: защита от повторного триала + индексы для поиска
-- Дата: 2026-07-18
-- Применить: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- Повторный запуск безопасен (идемпотентно).
-- ============================================================

-- --- Персистентный учёт использованного пробного периода ---
-- Эта таблица НЕ очищается при удалении аккаунта, поэтому пользователь
-- не может удалить аккаунт и заново взять бесплатную неделю.
create table if not exists trial_claims (
  user_id    bigint      primary key,          -- Telegram ID (навсегда)
  claimed_at timestamptz not null default now()
);

-- Переносим уже выданные триалы из истории платежей, чтобы существующие
-- пользователи, у кого триал был, не смогли взять его повторно.
insert into trial_claims (user_id, claimed_at)
select user_id, min(created_at)
from payments
where method = 'trial' and user_id is not null
group by user_id
on conflict (user_id) do nothing;

-- --- Индексы для быстрого поиска в админке ---
create index if not exists idx_subscriptions_email on subscriptions (email);
create index if not exists idx_subscriptions_sub_id on subscriptions (sub_id);
create index if not exists idx_users_username on users (username);
