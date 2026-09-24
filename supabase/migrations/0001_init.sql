-- =============================================================================
-- PH-Drama — initial schema
--
-- Rules this file enforces, not just documents:
--   * coin_balance, vip_expires_at and role are NOT updatable by `authenticated`
--     (column-level grants below). Every change goes through a SECURITY DEFINER
--     function that also writes a ledger row.
--   * RLS is enabled on every table. No table is left open.
--   * Money is numeric(10,2) PHP. Coins are integers.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role        as enum ('user', 'admin', 'superadmin');
  create type series_status    as enum ('draft', 'published', 'archived');
  create type unlock_source    as enum ('coins', 'ad', 'vip', 'admin');
  create type payment_kind     as enum ('coins', 'vip');
  create type payment_status   as enum ('pending', 'approved', 'rejected');
  create type payment_channel  as enum ('gcash', 'maya', 'qrph', 'bank');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  avatar_url     text,
  coin_balance   integer     not null default 0 check (coin_balance >= 0),
  vip_expires_at timestamptz,
  role           user_role   not null default 'user',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.coin_balance is
  'Never updated from app code. Use unlock_episode_with_coins / approve_payment / admin_adjust_coins.';

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';
create index if not exists profiles_vip_idx  on public.profiles (vip_expires_at)
  where vip_expires_at is not null;

-- ---------------------------------------------------------------------------
-- catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.series (
  id                 uuid primary key default gen_random_uuid(),
  slug               citext unique not null,
  title              text   not null,
  synopsis           text   not null default '',
  thumbnail_path     text,
  vertical_poster_path text,
  tags               text[] not null default '{}',
  free_episode_count integer not null default 5 check (free_episode_count >= 0),
  status             series_status not null default 'draft',
  is_featured        boolean not null default false,
  view_count         bigint  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists series_status_idx   on public.series (status);
create index if not exists series_featured_idx on public.series (is_featured) where is_featured;

create table if not exists public.episodes (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references public.series (id) on delete cascade,
  episode_number   integer not null check (episode_number > 0),
  title            text    not null,
  synopsis         text    not null default '',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  hls_path         text,
  poster_path      text,
  coin_price       integer not null default 30 check (coin_price >= 0),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (series_id, episode_number)
);

create index if not exists episodes_series_idx on public.episodes (series_id, episode_number);

-- An episode is free when its number is inside the series' free window.
create or replace function public.episode_is_free(p_episode uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.episode_number <= s.free_episode_count
  from public.episodes e
  join public.series   s on s.id = e.series_id
  where e.id = p_episode;
$$;

-- ---------------------------------------------------------------------------
-- unlocks
-- ---------------------------------------------------------------------------
create table if not exists public.episode_unlocks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  source     unlock_source not null,
  coins_spent integer not null default 0 check (coins_spent >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create index if not exists episode_unlocks_user_idx on public.episode_unlocks (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- commerce catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.coin_packages (
  id          uuid primary key default gen_random_uuid(),
  code        citext unique not null,
  name        text    not null,
  coins       integer not null check (coins > 0),
  bonus_coins integer not null default 0 check (bonus_coins >= 0),
  price_php   numeric(10,2) not null check (price_php > 0),
  is_popular  boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists public.vip_plans (
  id         uuid primary key default gen_random_uuid(),
  code       citext unique not null,
  name       text    not null,
  days       integer not null check (days > 0),
  price_php  numeric(10,2) not null check (price_php > 0),
  is_active  boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  code           citext unique not null,
  label          text not null,
  channel        payment_channel not null,
  account_name   text not null,
  account_number text not null,
  instructions   text not null default '',
  qr_path        text,
  is_active      boolean not null default true,
  sort_order     integer not null default 0
);

-- ---------------------------------------------------------------------------
-- payments (manual, receipt-based)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              payment_kind not null,
  coin_package_id   uuid references public.coin_packages (id),
  vip_plan_id       uuid references public.vip_plans (id),
  payment_method_id uuid not null references public.payment_methods (id),
  amount_php        numeric(10,2) not null check (amount_php > 0),
  reference_number  citext not null,
  receipt_path      text,
  status            payment_status not null default 'pending',
  admin_note        text,
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),

  constraint payments_target_matches_kind check (
    (kind = 'coins' and coin_package_id is not null and vip_plan_id is null) or
    (kind = 'vip'   and vip_plan_id     is not null and coin_package_id is null)
  )
);

-- Receipt fraud, first line: the same reference number cannot be claimed twice
-- on the same channel.
create unique index if not exists payments_reference_unique
  on public.payments (payment_method_id, reference_number);

create index if not exists payments_status_idx on public.payments (status, created_at desc);
create index if not exists payments_user_idx   on public.payments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ledgers — an audit trail is a feature, not logging
-- ---------------------------------------------------------------------------
create table if not exists public.coin_ledger (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  delta        integer not null,
  balance_after integer not null,
  reason       text not null,
  payment_id   uuid references public.payments (id),
  episode_id   uuid references public.episodes (id),
  admin_id     uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index if not exists coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);

create table if not exists public.vip_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  action          text not null,
  days            integer not null default 0,
  expires_before  timestamptz,
  expires_after   timestamptz,
  payment_id      uuid references public.payments (id),
  admin_id        uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);

create index if not exists vip_ledger_user_idx on public.vip_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- playback sessions (watermark source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.viewer_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  episode_id     uuid not null references public.episodes (id) on delete cascade,
  watermark_code text not null,
  user_agent     text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '6 hours'
);

comment on table public.viewer_sessions is
  'watermark_code is a random per-session string. Never store or display raw IP (RA 10173).';

create index if not exists viewer_sessions_user_idx on public.viewer_sessions (user_id, created_at desc);

-- Rewarded-ad grants, keyed on the ad network's server-side-verification id so the
-- same completion cannot be replayed.
create table if not exists public.ad_rewards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  episode_id  uuid not null references public.episodes (id) on delete cascade,
  ad_network  text not null,
  ssv_id      text not null,
  created_at  timestamptz not null default now(),
  unique (ad_network, ssv_id)
);

create index if not exists ad_rewards_user_day_idx on public.ad_rewards (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and role = 'superadmin'
  );
$$;

create or replace function public.is_vip(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select vip_expires_at > now() from public.profiles where id = p_user),
    false
  );
$$;

-- The single access rule. Everything else in the product defers to this.
create or replace function public.can_watch_episode(
  p_user    uuid,
  p_episode uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_free boolean;
begin
  select e.episode_number <= s.free_episode_count
    into v_free
  from public.episodes e
  join public.series   s on s.id = e.series_id
  where e.id = p_episode;

  if v_free is null then
    return false;           -- unknown episode
  end if;

  if v_free then
    return true;
  end if;

  if p_user is null then
    return false;
  end if;

  if public.is_vip(p_user) then
    return true;
  end if;

  return exists (
    select 1 from public.episode_unlocks
    where user_id = p_user and episode_id = p_episode
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- profile bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, coin_balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    50                       -- welcome coins, also written to the ledger below
  )
  on conflict (id) do nothing;

  insert into public.coin_ledger (user_id, delta, balance_after, reason)
  values (new.id, 50, 50, 'welcome_bonus');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists series_touch on public.series;
create trigger series_touch before update on public.series
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Atomic money functions. These are the ONLY way balances move.
-- =============================================================================

create or replace function public.unlock_episode_with_coins(p_episode uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_price   integer;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if public.can_watch_episode(v_user, p_episode) then
    -- already free / VIP / previously unlocked: succeed without charging
    return json_build_object('ok', true, 'charged', 0,
                             'balance', (select coin_balance from public.profiles where id = v_user));
  end if;

  select coin_price into v_price from public.episodes where id = p_episode;
  if v_price is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Lock the row so two taps cannot both pass the balance check.
  select coin_balance into v_balance
  from public.profiles
  where id = v_user
  for update;

  if v_balance < v_price then
    raise exception 'INSUFFICIENT_COINS' using errcode = 'P0001';
  end if;

  update public.profiles
     set coin_balance = coin_balance - v_price
   where id = v_user
  returning coin_balance into v_balance;

  insert into public.episode_unlocks (user_id, episode_id, source, coins_spent)
  values (v_user, p_episode, 'coins', v_price)
  on conflict (user_id, episode_id) do nothing;

  insert into public.coin_ledger (user_id, delta, balance_after, reason, episode_id)
  values (v_user, -v_price, v_balance, 'episode_unlock', p_episode);

  return json_build_object('ok', true, 'charged', v_price, 'balance', v_balance);
end;
$$;

revoke all on function public.unlock_episode_with_coins(uuid) from public, anon;
grant execute on function public.unlock_episode_with_coins(uuid) to authenticated;

-- Rewarded-ad unlock. service_role only: a client saying "I watched the ad" is
-- not proof. The caller must have verified the network's SSV callback first.
create or replace function public.grant_ad_unlock(
  p_user       uuid,
  p_episode    uuid,
  p_ad_network text,
  p_ssv_id     text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today_count integer;
begin
  select count(*) into v_today_count
  from public.ad_rewards
  where user_id = p_user and created_at > now() - interval '24 hours';

  if v_today_count >= 10 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.ad_rewards (user_id, episode_id, ad_network, ssv_id)
  values (p_user, p_episode, p_ad_network, p_ssv_id);
  -- a replayed ssv_id trips the unique index and aborts the transaction

  insert into public.episode_unlocks (user_id, episode_id, source, coins_spent)
  values (p_user, p_episode, 'ad', 0)
  on conflict (user_id, episode_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.grant_ad_unlock(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_ad_unlock(uuid, uuid, text, text) to service_role;

-- Approve a manual payment: credit coins or extend VIP, in one transaction,
-- with the matching ledger row.
create or replace function public.approve_payment(p_payment uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin    uuid := auth.uid();
  v_payment  public.payments;
  v_coins    integer;
  v_balance  integer;
  v_days     integer;
  v_before   timestamptz;
  v_after    timestamptz;
begin
  if not public.is_admin(v_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment for update;

  if v_payment.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED' using errcode = 'P0001';
  end if;

  if v_payment.kind = 'coins' then
    select coins + bonus_coins into v_coins
    from public.coin_packages where id = v_payment.coin_package_id;

    update public.profiles
       set coin_balance = coin_balance + v_coins
     where id = v_payment.user_id
    returning coin_balance into v_balance;

    insert into public.coin_ledger (user_id, delta, balance_after, reason, payment_id, admin_id)
    values (v_payment.user_id, v_coins, v_balance, 'payment_approved', p_payment, v_admin);

  else
    select days into v_days from public.vip_plans where id = v_payment.vip_plan_id;

    select vip_expires_at into v_before from public.profiles where id = v_payment.user_id;

    -- VIP stacking: extend from the current expiry when still active,
    -- otherwise start from now.
    v_after := greatest(coalesce(v_before, now()), now()) + make_interval(days => v_days);

    update public.profiles set vip_expires_at = v_after where id = v_payment.user_id;

    insert into public.vip_ledger
      (user_id, action, days, expires_before, expires_after, payment_id, admin_id)
    values
      (v_payment.user_id, 'payment_approved', v_days, v_before, v_after, p_payment, v_admin);
  end if;

  update public.payments
     set status = 'approved',
         admin_note = p_note,
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_payment;

  return json_build_object('ok', true, 'kind', v_payment.kind);
end;
$$;

revoke all on function public.approve_payment(uuid, text) from public, anon;
grant execute on function public.approve_payment(uuid, text) to authenticated;

create or replace function public.reject_payment(p_payment uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_status payment_status;
begin
  if not public.is_admin(v_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select status into v_status from public.payments where id = p_payment for update;

  if v_status is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'ALREADY_REVIEWED' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'rejected',
         admin_note = p_note,
         reviewed_by = v_admin,
         reviewed_at = now()
   where id = p_payment;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.reject_payment(uuid, text) from public, anon;
grant execute on function public.reject_payment(uuid, text) to authenticated;

create or replace function public.admin_adjust_coins(
  p_user   uuid,
  p_delta  integer,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin   uuid := auth.uid();
  v_balance integer;
begin
  if not public.is_superadmin(v_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  update public.profiles
     set coin_balance = greatest(0, coin_balance + p_delta)
   where id = p_user
  returning coin_balance into v_balance;

  if v_balance is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.coin_ledger (user_id, delta, balance_after, reason, admin_id)
  values (p_user, p_delta, v_balance, p_reason, v_admin);

  return json_build_object('ok', true, 'balance', v_balance);
end;
$$;

revoke all on function public.admin_adjust_coins(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_coins(uuid, integer, text) to authenticated;

create or replace function public.admin_set_vip(
  p_user   uuid,
  p_days   integer,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_before timestamptz;
  v_after  timestamptz;
begin
  if not public.is_superadmin(v_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select vip_expires_at into v_before from public.profiles where id = p_user;

  if p_days = 0 then
    v_after := null;                                   -- revoke
  elsif p_days > 0 then
    v_after := greatest(coalesce(v_before, now()), now()) + make_interval(days => p_days);
  else
    v_after := coalesce(v_before, now()) + make_interval(days => p_days);
    if v_after <= now() then v_after := null; end if;
  end if;

  update public.profiles set vip_expires_at = v_after where id = p_user;

  insert into public.vip_ledger
    (user_id, action, days, expires_before, expires_after, admin_id)
  values
    (p_user, coalesce(nullif(trim(p_reason), ''), 'admin_set_vip'), p_days, v_before, v_after, v_admin);

  return json_build_object('ok', true, 'vip_expires_at', v_after);
end;
$$;

revoke all on function public.admin_set_vip(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_vip(uuid, integer, text) to authenticated;

-- =============================================================================
-- Row level security
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.series          enable row level security;
alter table public.episodes        enable row level security;
alter table public.episode_unlocks enable row level security;
alter table public.coin_packages   enable row level security;
alter table public.vip_plans       enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payments        enable row level security;
alter table public.coin_ledger     enable row level security;
alter table public.vip_ledger      enable row level security;
alter table public.viewer_sessions enable row level security;
alter table public.ad_rewards      enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- The column grants below are what actually stop a viewer from editing
-- coin_balance / vip_expires_at / role. The policy alone is not enough.

-- catalogue is public read ---------------------------------------------------
drop policy if exists series_read on public.series;
create policy series_read on public.series
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists series_admin_write on public.series;
create policy series_admin_write on public.series
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists episodes_read on public.episodes;
create policy episodes_read on public.episodes
  for select to anon, authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.series s
      where s.id = series_id and s.status = 'published'
    )
  );

drop policy if exists episodes_admin_write on public.episodes;
create policy episodes_admin_write on public.episodes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists coin_packages_read on public.coin_packages;
create policy coin_packages_read on public.coin_packages
  for select to anon, authenticated using (is_active or public.is_admin());

drop policy if exists vip_plans_read on public.vip_plans;
create policy vip_plans_read on public.vip_plans
  for select to anon, authenticated using (is_active or public.is_admin());

drop policy if exists payment_methods_read on public.payment_methods;
create policy payment_methods_read on public.payment_methods
  for select to anon, authenticated using (is_active or public.is_admin());

-- unlocks: read your own, never write them by hand ---------------------------
drop policy if exists episode_unlocks_read on public.episode_unlocks;
create policy episode_unlocks_read on public.episode_unlocks
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- no insert/update/delete policy: only the SECURITY DEFINER functions write here

-- payments -------------------------------------------------------------------
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists payments_insert_self on public.payments;
create policy payments_insert_self on public.payments
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
-- no update policy for viewers: approve_payment / reject_payment own the transition

drop policy if exists payments_admin_update on public.payments;
create policy payments_admin_update on public.payments
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ledgers: read-only, and only your own ---------------------------------------
drop policy if exists coin_ledger_read on public.coin_ledger;
create policy coin_ledger_read on public.coin_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists vip_ledger_read on public.vip_ledger;
create policy vip_ledger_read on public.vip_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- viewer sessions / ad rewards: admin-visible, user reads own ------------------
drop policy if exists viewer_sessions_read on public.viewer_sessions;
create policy viewer_sessions_read on public.viewer_sessions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists ad_rewards_read on public.ad_rewards;
create policy ad_rewards_read on public.ad_rewards
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- =============================================================================
-- Grants — the real guardrail on money columns
-- =============================================================================
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

revoke all on public.episode_unlocks from anon, authenticated;
grant select on public.episode_unlocks to authenticated;

revoke all on public.coin_ledger, public.vip_ledger from anon, authenticated;
grant select on public.coin_ledger, public.vip_ledger to authenticated;

revoke all on public.payments from anon, authenticated;
grant select, insert on public.payments to authenticated;
grant update (status, admin_note, reviewed_by, reviewed_at) on public.payments to authenticated;

grant select on public.series, public.episodes, public.coin_packages,
                public.vip_plans, public.payment_methods to anon, authenticated;

grant select on public.viewer_sessions, public.ad_rewards to authenticated;

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do update set public = false;

-- receipts: a viewer writes only into their own folder and can never list others
drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists receipts_read_own on storage.objects;
create policy receipts_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists thumbnails_read_all on storage.objects;
create policy thumbnails_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'thumbnails');

drop policy if exists thumbnails_admin_write on storage.objects;
create policy thumbnails_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'thumbnails' and public.is_admin())
  with check (bucket_id = 'thumbnails' and public.is_admin());

-- videos: no viewer policy at all. Signed URLs are minted server-side by
-- /api/episodes/[id]/play with the service role, and only after
-- can_watch_episode() returns true.
drop policy if exists videos_admin_write on storage.objects;
create policy videos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'videos' and public.is_admin())
  with check (bucket_id = 'videos' and public.is_admin());
