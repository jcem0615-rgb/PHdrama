# Build order

Each phase leaves the app deployable. Do not start a phase before the one above it
is green (`npm run lint && npm run typecheck && npm run build`).

- [x] **Phase 0 — Scaffold.** Next.js App Router + TS + Tailwind, `src/` layout,
      import alias `@/*`, docs, `.env.example`.
- [x] **Phase 1 — Database.** `supabase/migrations/0001_init.sql`: tables, RLS on
      every table, column grants, the `SECURITY DEFINER` functions, storage buckets
      and policies. `supabase/seed.sql`: coin packages, VIP plan, payment methods,
      one demo series.
- [x] **Phase 2 — Shell.** Layout, bottom nav, mobile-first theme, PWA manifest and
      service worker, `src/lib/copy.ts`, PHP currency formatting.
- [x] **Phase 3 — Catalogue.** Home, series detail, episode grid with lock badges,
      the repository facade with its demo backend so the UI is testable with no
      backend attached.
- [x] **Phase 4 — Player.** `SecureVideoPlayer` (hls.js + native Safari HLS),
      `/api/episodes/[id]/play`, drifting watermark, the vertical snap reels feed.
- [x] **Phase 5 — Unlocks.** Unlock sheet, `/api/episodes/[id]/unlock`, coin balance
      in the header, rewarded-ad path behind its feature flag.
- [x] **Phase 6 — Payments.** Coin store, payment method instructions, receipt
      upload, `/me` history, duplicate-reference rejection.
- [x] **Phase 7 — Admin.** Payment queue with signed receipt previews, approve/reject,
      coin and VIP adjustments, ledger views.
- [ ] **Phase 8 — Ads.** Pick a network (GAM rewarded web / AdSense H5 / native via
      a wrapper), implement server-side verification, then lift the feature flag.
- [ ] **Phase 9 — Hardening.** DRM provider, Android wrapper for `FLAG_SECURE`,
      perceptual-hash receipt dedupe, OCR on amounts and dates.
- [ ] **Phase 10 — AI pipeline.** Script → voice → video job queue behind the admin UI.
