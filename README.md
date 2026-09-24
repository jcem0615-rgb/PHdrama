# PH-Drama

Vertical short-drama reels PWA for the Philippine market. Episodes 1–5 of every
series are free; after that a viewer unlocks a single episode with coins, watches
a rewarded ad, or goes VIP (₱69 / week). Payments are manual — GCash, Maya, QR Ph,
BDO, BPI, UnionBank — with a receipt upload and SuperAdmin approval.

- Product spec — [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md)
- Architecture — [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- What content protection can and cannot do — [`docs/CONTENT_PROTECTION.md`](docs/CONTENT_PROTECTION.md)
- Build order — [`docs/BUILD_ORDER.md`](docs/BUILD_ORDER.md)
- Working agreements for agents — [`CLAUDE.md`](CLAUDE.md)

## Two portals

| | Where | Who |
| --- | --- | --- |
| Customer app | `/` | Anyone. Never sees or links to the staff portal. |
| Staff portal | `/admin` | Staff only, with its own sign-in and its own shell. |

The customer app has no admin link anywhere — not even a hidden or role-gated
one — and `AppChrome` renders no customer nav over `/admin`. `robots.ts` keeps
the portal out of search results.

Access is decided by `getStaff()` (`src/server/staff.ts`), the only gate on
`/admin` and `/api/admin/*`. In live mode that is the Supabase session plus a
`profiles.role` check; a customer who signs in with valid credentials is signed
back out and told the account is not staff.

To make someone staff in live mode, sign them up through the app and then run
this from the Supabase SQL editor — `authenticated` has no UPDATE grant on
`profiles.role`, so it cannot be done from the app:

```sql
update public.profiles
   set role = 'superadmin'          -- or 'admin'
 where id = (select id from auth.users where email = 'you@example.com');
```

`admin` reviews the payment queue; `superadmin` can also adjust coins and VIP.

## Demo mode

**With no environment variables set the app boots in demo mode** and the whole
product is clickable: catalogue, reels feed, paywall, coin store, manual-payment
flow with receipt upload, and the SuperAdmin review queue. Viewer state (coins,
VIP expiry, unlocks, payment history) lives in one signed, httpOnly cookie, and
only server code ever changes it — the same shape as the live path, minus the
database.

The demo customer is an ordinary `user`. To try the staff portal, go to
`/admin` and sign in with the passcode **`phdrama`** (override it with
`DEMO_ADMIN_PASSCODE`). That sets a second, separate cookie — signing in as
staff does not change who the customer app thinks you are.

The passcode is public here on purpose: demo data is per-browser and fake, so
the queue only ever shows payments you made in that same browser. There is
nothing to protect. Live mode ignores the passcode entirely.

Playback in demo mode points at public HLS test streams so the real hls.js path
gets exercised. If those hosts are unreachable the player falls back to
`public/demo/reel.webm`, which ships with the app.

## Live mode

Fill in all three Supabase values and the app switches over — no code change:

```bash
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

Then apply the schema:

```bash
npx supabase start          # local stack
npx supabase db reset       # 0001_init.sql + seed.sql
npm run db:types            # regenerate src/lib/database.types.ts
```

`supabase/migrations/0001_init.sql` carries the whole model: tables, RLS on every
table, the column grants that stop `authenticated` from touching `coin_balance`,
`vip_expires_at` or `role`, the `SECURITY DEFINER` functions that move money, and
the storage buckets and policies.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Re-apply migrations + seed to the local stack |
| `npm run db:types` | Regenerate typed database definitions |

## Non-negotiables

1. Money and access are decided in Postgres. Never `update profiles set coin_balance`
   from app code — call the functions.
2. Every balance change writes a `coin_ledger` row; every VIP change writes a
   `vip_ledger` row.
3. Video URLs are short-lived signed URLs issued by `/api/episodes/[id]/play`, and
   only after `can_watch_episode()` returns true.
4. `grant_ad_unlock` is `service_role` only. A client saying "I watched the ad" is
   not proof.
5. The watermark shows a random session code, never an IP or any other identifier
   (RA 10173).

## Known gaps

Rewarded ads (no network chosen yet — the flag is off), DRM, `FLAG_SECURE` via an
Android wrapper, perceptual-hash receipt dedupe. See the "Known gaps" section of
[`CLAUDE.md`](CLAUDE.md) and Phases 8–10 of [`docs/BUILD_ORDER.md`](docs/BUILD_ORDER.md).
