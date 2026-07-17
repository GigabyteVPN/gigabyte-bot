-- ============================================================
-- Миграция: реферальная программа, напоминания, язык, история баллов
-- Дата: 2026-07-17
-- Как применить: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- Повторный запуск безопасен (все операции идемпотентны).
-- ============================================================

-- --- users: реферал, баллы, настройка напоминаний, язык ---
alter table users add column if not exists referred_by bigint;
alter table users add column if not exists ref_points integer not null default 0;
alter table users add column if not exists reminders_enabled boolean not null default true;
alter table users add column if not exists lang text;

-- --- subscriptions: этап отправленных напоминаний (24ч/1ч) ---
alter table subscriptions add column if not exists reminder_stage integer default 0;

-- --- Журнал операций с баллами (начисления и списания) ---
create table if not exists point_transactions (
  id          bigserial primary key,
  user_id     bigint      not null,          -- кому начислено/списано
  delta       integer     not null,          -- +начисление / -списание
  reason      text        not null,          -- referral_signup | referral_purchase | redeem
  ref_user_id bigint,                        -- приглашённый, за которого начислено
  payment_id  bigint,                        -- платёж-триггер (для referral_purchase)
  created_at  timestamptz not null default now()
);

create index if not exists idx_point_tx_user
  on point_transactions (user_id, created_at desc);

-- Один бонус за регистрацию и один за первую покупку каждого приглашённого
create unique index if not exists uniq_ref_signup_bonus
  on point_transactions (ref_user_id) where reason = 'referral_signup';
create unique index if not exists uniq_ref_purchase_bonus
  on point_transactions (ref_user_id) where reason = 'referral_purchase';

-- Индекс для подсчёта приглашённых
create index if not exists idx_users_referred_by on users (referred_by);
