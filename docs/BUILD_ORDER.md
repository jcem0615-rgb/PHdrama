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
- [x] **Phase 7.5 — Manual adjustments.** `/admin/viewers`: SuperAdmin coin
      adjustments and VIP grants/revocations, both through the existing
      `admin_adjust_coins` / `admin_set_vip` functions, with a required reason
      that lands in the ledger.
- [ ] **Phase 8 — Ads.** Pick a network (GAM rewarded web / AdSense H5 / native via
      a wrapper), implement server-side verification, then lift the feature flag.
- [ ] **Phase 9 — Hardening.** DRM provider, Android wrapper for `FLAG_SECURE`,
      perceptual-hash receipt dedupe, OCR on amounts and dates.
- [~] **Phase 10 — AI pipeline.** Story Studio at `/admin/studio`.
      **Done:** premise → per-episode scene breakdown (beat, script, cliffhanger
      hook) via Claude, persisted as `stories` + `story_scenes`, one queued
      `render_jobs` row per scene, and `publish_story()` to turn a story into a
      series whose episodes are its scenes.
      **Done:** a free local renderer. The Studio records each episode to a real
      WebM in the browser (canvas + MediaRecorder, 720×1560) and stores it —
      uploaded to the `videos` bucket in live mode, IndexedDB in demo mode. No
      key, no GPU, no per-second charge.
      **Not done:** AI-generated footage. There is no free text-to-video API —
      they all meter GPU time. Implement `VideoProvider` when one is chosen.
      A story with unrendered scenes publishes as a labelled free preview, so
      viewers never meet an episode with no video behind it.
      **Also not done:** ElevenLabs narration, and a review/edit pass on scenes
      before publishing.
