-- =============================================================================
-- PH-Drama — seed data
-- Re-applied by `npx supabase db reset`. Safe to run repeatedly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Coin packages (PHP)
-- ---------------------------------------------------------------------------
insert into public.coin_packages (code, name, coins, bonus_coins, price_php, is_popular, sort_order)
values
  ('starter',  'Starter',   100,   0,  49.00, false, 1),
  ('popular',  'Barkada',   300,  50,  99.00, true,  2),
  ('value',    'Marathon',  700, 150, 249.00, false, 3),
  ('mega',     'Sakalam',  1600, 400, 499.00, false, 4)
on conflict (code) do update set
  name = excluded.name,
  coins = excluded.coins,
  bonus_coins = excluded.bonus_coins,
  price_php = excluded.price_php,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- VIP
-- ---------------------------------------------------------------------------
insert into public.vip_plans (code, name, days, price_php, sort_order)
values
  ('vip_weekly',  'VIP Weekly',   7,  69.00, 1),
  ('vip_monthly', 'VIP Monthly', 30, 249.00, 2)
on conflict (code) do update set
  name = excluded.name,
  days = excluded.days,
  price_php = excluded.price_php,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- Manual payment channels
-- Replace the placeholder account names/numbers before going live.
-- ---------------------------------------------------------------------------
insert into public.payment_methods (code, label, channel, account_name, account_number, instructions, sort_order)
values
  ('gcash', 'GCash', 'gcash', 'PH-DRAMA MEDIA', '0917 000 0000',
   'Open GCash, tap Send Money, enter the number above, and pay the exact amount. Screenshot the receipt.', 1),
  ('maya', 'Maya', 'maya', 'PH-DRAMA MEDIA', '0917 000 0000',
   'Open Maya, tap Send Money, enter the number above, and pay the exact amount. Screenshot the receipt.', 2),
  ('qrph', 'QR Ph', 'qrph', 'PH-DRAMA MEDIA', 'Scan the QR code',
   'Scan the QR Ph code with any participating bank or e-wallet app. Screenshot the receipt.', 3),
  ('bdo', 'BDO', 'bank', 'PH-DRAMA MEDIA INC.', '0000 0000 0000',
   'Transfer via BDO online banking or over the counter. Keep the reference number.', 4),
  ('bpi', 'BPI', 'bank', 'PH-DRAMA MEDIA INC.', '0000 0000 0000',
   'Transfer via the BPI app or over the counter. Keep the reference number.', 5),
  ('unionbank', 'UnionBank', 'bank', 'PH-DRAMA MEDIA INC.', '0000 0000 0000',
   'Transfer via the UnionBank app or over the counter. Keep the reference number.', 6)
on conflict (code) do update set
  label = excluded.label,
  channel = excluded.channel,
  account_name = excluded.account_name,
  account_number = excluded.account_number,
  instructions = excluded.instructions,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- One demo series with 12 episodes (5 free, 7 locked)
-- ---------------------------------------------------------------------------
insert into public.series (slug, title, synopsis, tags, free_episode_count, status, is_featured)
values (
  'ang-sekreto-ng-mayordoma',
  'Ang Sekreto ng Mayordoma',
  'She took the job to pay for her mother''s surgery. She stayed because the family she served buried the truth about her father in the same garden she waters every morning.',
  array['revenge', 'family', 'melodrama'],
  5,
  'published',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  synopsis = excluded.synopsis,
  tags = excluded.tags,
  status = excluded.status,
  is_featured = excluded.is_featured;

insert into public.episodes (series_id, episode_number, title, synopsis, duration_seconds, coin_price, published_at)
select
  s.id,
  n,
  'Episode ' || n,
  '',
  75 + (n * 3) % 40,
  30,
  now()
from public.series s
cross join generate_series(1, 12) as n
where s.slug = 'ang-sekreto-ng-mayordoma'
on conflict (series_id, episode_number) do nothing;

-- ---------------------------------------------------------------------------
-- Making someone staff
--
-- `authenticated` has no UPDATE grant on profiles.role, so this cannot be done
-- from the app — by design. Sign the person up through the app first, then run
-- this from the SQL editor or with the service role:
--
--   update public.profiles
--      set role = 'superadmin'          -- or 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- `admin` reviews the payment queue. `superadmin` can also call
-- admin_adjust_coins and admin_set_vip.
-- ---------------------------------------------------------------------------
