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

## Accounts

| | Customer | Staff |
| --- | --- | --- |
| Sign in | `/auth/sign-in` | `/admin/login` |
| Sign up | `/auth/sign-up` | promoted in SQL, see above |
| Sign out | button at the bottom of `/me` | button in the portal header |

Both forms have a show-password toggle and a **remember me** checkbox. Remember
me is a real session-lifetime switch, not a stored password: unchecked, the
session cookie carries no expiry and dies with the browser. It defaults on for
customers and off for staff.

Signing in is not required to browse. Episodes 1–5 of every series play for
anyone; unlocking, buying and the payment history need an account, and the
paywall and `/pay` route send signed-out visitors to sign-in with a `?next=`
back to where they were.

## Demo mode

**With no environment variables set the app boots in demo mode** and the whole
product is clickable: catalogue, reels feed, paywall, coin store, manual-payment
flow with receipt upload, and the SuperAdmin review queue. Viewer state (coins,
VIP expiry, unlocks, payment history) lives in one signed, httpOnly cookie, and
only server code ever changes it — the same shape as the live path, minus the
database.

The demo customer starts signed out. Sign up at `/auth/sign-up` with any email
and a password of at least six characters — nothing is sent and the account
lives only in that browser's cookie, with the same 50 welcome coins the real
`handle_new_user` trigger grants. Signing out and back in with the same address
restores your coins and unlocks; a different address starts fresh.

To try the staff portal, go to
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

## Staff portal

| Page | What it does |
| --- | --- |
| `/admin` | Payment queue — approve or reject, which credits coins or extends VIP |
| `/admin/viewers` | **SuperAdmin only.** Adjust a customer's coins, grant or revoke VIP |
| `/admin/studio` | Story Studio — premise → episode breakdown → publish as a series |

Coin and VIP adjustments call `admin_adjust_coins` / `admin_set_vip`, which are
SuperAdmin-only in Postgres and write the ledger row in the same transaction.
The reason box is required because that string *is* the audit trail. VIP grants
stack: granting 7 days to an active VIP extends from the current expiry, it does
not reset it.

## Story Studio

Write a premise, pick an episode count, and Claude returns a per-episode
breakdown — beat, script, and the cliffhanger hook each episode ends on, with
the hardest hook on episode 5 because that is the last free one. The story is
saved with one queued render job per scene, and `publish_story()` turns it into
a series whose episodes are its scenes.

Set `ANTHROPIC_API_KEY` to get real scripts. Without it a local outliner runs
instead so the pipeline is still clickable, but the scripts are placeholder text.

**Post to reels** puts a story in front of customers immediately, as a free
PREVIEW series: the scripts are real, and each episode plays a placeholder clip
with its own generated title card over it. Preview episodes are free by
construction — charging coins for a placeholder would be a lie — and the label
is enforced in Postgres (`series.is_preview`), not just in the UI. Once every
scene has a rendered video, publishing again clears the flag and restores the
real free-episode window.

Every episode also gets a generated poster at `/api/posters/[episodeId]` — an
SVG title card drawn from the episode's own title and hook, so the catalogue has
artwork with no image provider and no per-image cost. Add `?plain=1` for the
text-free variant used behind headings.

**The video itself is not built.** No text-to-video provider is chosen, so the
render queue has nothing draining it — implement `VideoProvider` in
`src/server/story/video.ts` and a worker that uploads to the private `videos`
bucket and fills `output_path`. Until then a story with unrendered scenes
publishes as a **draft** series, so viewers never meet an episode with no video
behind it.

What plays is a **storyboard reel**: the episode's own beats — title, what
happens, the cliffhanger — animated over the placeholder clip on their own
clock, so each episode plays its own story instead of the same silent loop. It
is an animatic, not generated footage, and the PREVIEW badge says so. It
disappears the moment a real render lands.

Demo mode has nowhere to persist a full story, so posting keeps only what the
feed needs (title, beat, hook, duration) in its own cookie — one posted story at
a time, up to 12 episodes. The Studio lists what is currently live with an Open
and a Take down button, so the loop is testable across page loads. The scripts
themselves are shown once and not stored.

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
