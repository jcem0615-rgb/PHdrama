# PH-Drama — Claude Code Handoff

Vertical short-drama reels PWA for the Philippine market. Episodes 1–5 free, then unlock per episode with coins or a rewarded ad, or go VIP (₱69/week, all episodes, no ads). Payments are manual: user pays via GCash / Maya / QR Ph / BDO / BPI / UnionBank, uploads a receipt + reference number, SuperAdmin approves.

Full product spec: `docs/MASTER_PROMPT.md`. Architecture: `docs/ARCHITECTURE.md`. What content protection can and cannot do: `docs/CONTENT_PROTECTION.md`. Build order: `docs/BUILD_ORDER.md`.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + lucide-react + framer-motion
- Supabase: Postgres, Auth, Storage (`receipts` private, `thumbnails` public), RLS on every table
- Video: HLS (hls.js / native Safari). DRM (Shaka Player + a Widevine/FairPlay license provider) is a later phase — see CONTENT_PROTECTION.md
- PWA: `@serwist/next` (or hand-written SW) — cache app shell + series metadata only, never video segments or signed URLs
- AI pipeline (admin only): Anthropic / OpenAI for scripts, ElevenLabs TTS, video-gen APIs behind a job queue

## Commands (after Phase 0 scaffold)
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npx supabase start` — local stack
- `npx supabase db reset` — re-applies `supabase/migrations/*` + `supabase/seed.sql`
- `npx supabase gen types typescript --local > src/lib/database.types.ts`

## Non-negotiable rules
1. **Money and access are decided in Postgres, never in the client.** All coin/VIP/unlock changes go through the `SECURITY DEFINER` functions in `0001_init.sql` (`unlock_episode_with_coins`, `approve_payment`, `reject_payment`, `admin_adjust_coins`, `admin_set_vip`, `grant_ad_unlock`). Never `update profiles set coin_balance` from app code.
2. `authenticated` has no UPDATE on `profiles.coin_balance`, `vip_expires_at`, or `role` (column grants). Keep it that way.
3. Every balance change writes a `coin_ledger` row; every VIP change writes a `vip_ledger` row. Audit trail is a feature, not logging.
4. Video URLs are short-lived signed URLs issued by `/api/episodes/[id]/play` only after `can_watch_episode()` returns true. Never put raw storage paths in client bundles or the service worker cache.
5. `grant_ad_unlock` is callable by `service_role` only. A client saying "I watched the ad" is not proof — see Gaps.
6. Receipts bucket is private. Users write to `receipts/{auth.uid()}/...` only; SuperAdmin reads all via signed URLs.
7. Currency is PHP. Store prices as `numeric(10,2)`, display with `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`.
8. Don't collect or display raw IP in the watermark. Use `viewer_sessions.watermark_code` (Data Privacy Act of 2012 / RA 10173).

## Conventions
- **Two portals.** The customer app (`/`) and the staff portal (`/admin`) are
  separate surfaces. Never add an admin link, tab or hint to customer UI, and
  never render customer chrome on `/admin` — `AppChrome` bails out on that path.
  Gate every admin route and handler with `getStaff()` (`src/server/staff.ts`),
  never with `getViewer()` plus a role check at the call site.
- Server Components by default; `'use client'` only for player, reels feed, modals, forms.
- Supabase clients: `src/lib/supabase/server.ts` (cookies) and `src/lib/supabase/client.ts` (browser). Service-role client only in route handlers / server actions under `src/server/`, never imported by client code.
- Route handlers return `{ ok: true, data } | { ok: false, error: { code, message } }`.
- UI copy is English with Filipino-friendly phrasing; keep strings in `src/lib/copy.ts` so Taglish variants are easy later.
- Mobile-first: design at 390×844, reels feed is `h-[100dvh]` snap-y.
- Auth forms use `src/components/form/Field` (reveal toggle built in) and
  `Checkbox`, with `tone="customer"` or `tone="staff"`. Do not hand-roll inputs.

## Current state
- ✅ Spec, architecture docs, build order
- ✅ `supabase/migrations/0001_init.sql` — schema, RLS, atomic functions, storage policies
- ✅ `supabase/seed.sql` — packages, payment methods, one demo series
- ✅ `src/components/SecureVideoPlayer.tsx`, `src/lib/access.ts`
- ✅ Next.js scaffold (Phase 0) — App Router, TS, Tailwind v4, `src/`, alias `@/*`
- ✅ Phases 1–7: shell + PWA, catalogue, reels feed and player, unlock sheet,
  coin store and manual payments with receipt upload, SuperAdmin review queue
- ✅ `src/server/repository.ts` — the data facade, with a demo backend so the app
  runs with no Supabase attached (see `docs/ARCHITECTURE.md`)
- ✅ Staff portal split out of the customer app: own shell, own sign-in, own
  session (`getStaff()`); the demo customer is a plain `user`
- ✅ Customer auth: `/auth/sign-in`, `/auth/sign-up`, sign-out on `/me`, with a
  show-password toggle and a working "remember me" (`phd_persist` controls the
  session cookie's lifetime, re-applied on every Supabase refresh)
- ⬜ Phases 8–10: rewarded ads, DRM / Android wrapper, AI content pipeline
- ⬜ No password reset or email-change flow yet

**Demo mode:** with no Supabase env vars the app serves an in-memory catalogue and
keeps viewer state in one signed httpOnly cookie, with the staff session on a
second, separate cookie (passcode `DEMO_ADMIN_PASSCODE`, default `phdrama`). It is what the Vercel preview
runs. Only server code mutates it, and it is labelled in the UI. Delete nothing
from `src/lib/demo/` or `src/server/demo-store.ts` when wiring the live backend —
they are the fallback that keeps previews clickable.

## Known gaps / decisions still open
- **Rewarded ads on web:** AdMob is native-SDK only; it does not run in a PWA. Options: Google Ad Manager rewarded web ads (needs GAM account + approval), AdSense H5 Ad Placement API (games-oriented, approval needed), or wrap the app as a TWA/Capacitor build to use AdMob with server-side verification (SSV). Until decided, keep `grant_ad_unlock` behind a feature flag.
- **FLAG_SECURE:** impossible for an installed PWA. Only achievable if we ship an Android wrapper (Capacitor, or TWA with a custom activity). Tracked as Phase 9.
- **DRM provider:** not chosen (e.g., BuyDRM, EZDRM, PallyCon, Axinom). Without it, "black screen on recording" does not happen.
- **Receipt fraud:** duplicate reference detection is in DB; image-hash dedupe (perceptual hash) and amount/date OCR are optional Phase 6 add-ons.
- **VIP stacking:** approving VIP while active extends from current expiry (implemented). Confirm this is the intended business rule.
- **Refunds / chargebacks:** manual only via `admin_adjust_coins` / `admin_set_vip` for now.
- **Content rights for AI-generated dramas:** check terms of each video/voice provider before monetizing.
