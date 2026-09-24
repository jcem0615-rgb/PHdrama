# Architecture

## Shape

```
Browser (PWA)
  ├── Server Components ────────► Supabase (anon key, RLS, user cookie session)
  ├── 'use client' islands       player · reels feed · modals · forms
  └── fetch /api/*
        └── Route handlers ─────► Supabase (service role, server only)
                                    └── SECURITY DEFINER functions
```

Nothing that decides money or access runs in the browser. The client renders a
decision Postgres already made.

## Directories

| Path | Contains |
| --- | --- |
| `src/app` | Routes. Server Components by default. |
| `src/app/api` | Route handlers. The only place the service-role key is read. |
| `src/components` | UI. `'use client'` only where it is genuinely needed. |
| `src/lib` | Pure helpers, copy strings, formatting, types, Supabase browser/server clients. |
| `src/lib/demo` | The in-memory demo catalogue and session store (see "Demo mode"). |
| `src/server` | Server-only modules. Never imported from a client component. |
| `supabase/migrations` | Ordered SQL. `0001_init.sql` is the whole schema. |
| `docs` | This folder. |

`src/server/*` carries `import 'server-only'` so an accidental client import is a
build error rather than a leaked key.

## Two portals

The customer app and the staff portal are separate surfaces in one deployment.

| | Customer app | Staff portal |
| --- | --- | --- |
| Routes | `/`, `/reels`, `/series`, `/watch`, `/coins`, `/pay`, `/me`, `/auth/*` | `/admin`, `/admin/login` |
| Chrome | `AppChrome` — top bar with coin balance, bottom nav | `StaffShell` — slate palette, no customer nav |
| Identity | `getViewer()` → `Viewer` (balance, VIP, unlocks) | `getStaff()` → `Staff` (id, name, role) |
| Sign-in | `/auth/sign-in`, `/auth/sign-up` | `/admin/login` |
| Indexed | yes | no — `robots.ts` disallows `/admin`, layout sets `noindex` |

Two rules keep them apart:

1. **`AppChrome` returns null on `/admin`.** The staff portal never renders a
   coin balance or a customer nav, and the customer app has no link into
   `/admin` anywhere — not a hidden one, not a role-gated one. A customer cannot
   discover the portal by inspecting the page they were served.
2. **`getStaff()` is the only gate.** `/admin` and `/api/admin/*` ask it and
   nothing else. It is deliberately not `getViewer()` with a role check at the
   call site: a `Staff` carries no balance to spend and a `Viewer` carries no
   role to escalate, so the two answers cannot be confused for one another.

`Staff` resolves differently per mode:

- **live** — the Supabase session, then a `profiles.role` lookup. A customer who
  signs in at `/admin/login` with valid credentials is signed straight back out
  and told the account is not staff.
- **demo** — a passcode sets `phd_staff`, a signed cookie separate from the
  `phd_demo` viewer cookie. Signing into the portal does not change who the
  customer app thinks you are; the demo viewer's role is always `user`.

Both cookies live in the same browser on purpose, so one person can submit a
payment as a customer and then approve it as staff and watch the balance move.
In demo mode the queue only ever shows payments made in that same browser.

## Sessions

| | Customer | Staff |
| --- | --- | --- |
| Sign in | `POST /api/auth/session` | `POST /api/admin/session` |
| Sign up | `POST /api/auth/register` | — (staff are promoted in SQL) |
| Sign out | `DELETE /api/auth/session` | `DELETE /api/admin/session` |
| Live mode | Supabase email + password | Supabase email + password, then a role check |
| Demo mode | any email, password ≥ 6, stored in `phd_demo` | passcode, stored in `phd_staff` |

**Remember me** is one small cookie, `phd_persist`, not a property of the session
cookie itself. Supabase rewrites its session cookies on every token refresh, so
the decision has to be re-applied each time rather than set once at sign-in:
`createServerSupabase()` reads `phd_persist` and, when it is absent, strips
`maxAge`/`expires` from every cookie it writes, leaving a cookie that dies with
the browser. `writeDemoState` does the same for demo mode. It defaults on in the
customer app and off in the staff portal, where a shared back-office machine
should not stay signed in.

**Welcome coins** are never granted by the register handler. `handle_new_user`
in `0001_init.sql` does it, in the same transaction that creates the profile,
and writes the matching `coin_ledger` row. Demo mode mirrors that in
`freshDemoState`.

**Demo accounts** are one per browser. The cookie remembers which email the
balances belong to even while signed out, so signing back in with the same
address restores the coins and unlocks and a different address starts clean.

## Supabase clients

| Module | Key | Used by |
| --- | --- | --- |
| `src/lib/supabase/client.ts` | anon | client components |
| `src/lib/supabase/server.ts` | anon + cookies | server components, server actions |
| `src/server/supabase-admin.ts` | **service role** | route handlers only |

`src/server/staff.ts` sits on top of these and answers one question: is the
caller staff?

## The data facade

`src/server/repository.ts` exposes the app's reads and writes as plain async
functions (`getSeries`, `getEpisode`, `getViewerState`, `unlockWithCoins`, …).

It has two backends:

- **supabase** — used when `NEXT_PUBLIC_SUPABASE_URL` and the keys are present.
  Every write is a single `rpc()` call into a `SECURITY DEFINER` function.
- **demo** — used when they are not. An in-memory catalogue plus a signed cookie
  holding the viewer's coins, VIP expiry and unlocks, so the deployed preview is
  fully clickable with no backend attached.

The rest of the app only ever imports the facade, so swapping the backend does not
touch a single page. Demo mode is labelled in the UI and refuses to run when
Supabase env vars exist.

## Request paths that matter

### Playback
```
GET /api/episodes/:id/play
  → can_watch_episode(user, episode)   (Postgres)
  → false → 403 { ok:false, error:{ code:'LOCKED' } }
  → true  → insert viewer_sessions(watermark_code)
          → storage.createSignedUrl(hls_path, 90s)
          → 200 { ok:true, data:{ src, watermarkCode, expiresAt } }
```

### Coin unlock
```
POST /api/episodes/:id/unlock
  → rpc('unlock_episode_with_coins', { p_episode: id })
       BEGIN
         lock the profile row
         balance >= price ? : raise 'INSUFFICIENT_COINS'
         update balance
         insert coin_ledger
         insert episode_unlocks(source='coins')
       COMMIT
```

### Manual payment
```
POST /api/payments            (user)  → pending row + receipt path
POST /api/admin/payments/:id  (admin) → rpc('approve_payment' | 'reject_payment')
                                          → coins credited / VIP extended + ledger row
```

## Response contract
Every route handler returns

```ts
{ ok: true,  data: T }
{ ok: false, error: { code: string, message: string } }
```

`code` is a stable machine string (`LOCKED`, `INSUFFICIENT_COINS`, `DUPLICATE_REFERENCE`,
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`). `message` is
viewer-facing copy from `src/lib/copy.ts`.

## PWA
`public/manifest.webmanifest` + `public/sw.js`, registered from a tiny client
component. The service worker caches the app shell and static assets only. It
explicitly refuses to cache `/api/*`, anything under `/storage/v1/object/sign/`, and
any URL carrying a `token` query parameter — a cached signed URL is a leaked signed URL.

## Environment

| Variable | Where | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | for live mode |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | for live mode |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | for live mode |
| `DEMO_SESSION_SECRET` | server only | demo mode cookie signing |
| `DEMO_ADMIN_PASSCODE` | server only | demo mode staff portal (default `phdrama`) |
| `NEXT_PUBLIC_FLAG_REWARDED_ADS` | client | off until an ad network is chosen |

With none of them set the app boots in demo mode, which is what the Vercel preview runs.
